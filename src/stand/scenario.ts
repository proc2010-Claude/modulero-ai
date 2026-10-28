// Сценарии диалога (TASK_FIRST.md п. 5–6): реплики человека, записанные вызовы инструментов с ожидаемым ответом
// движка, реплики помощника и критерии. npm run check проигрывает вызовы без ИИ и сверяет версии, отказы и суммы,
// а в репликах помощника — что названа только цена из ответа стенда и неполнота не скрыта.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Core } from './engine.ts';
import { Stand, type Output, type ProductKind } from './stand.ts';

export const SCENARIO_FORMAT = 'modulero-ai.scenario/1';

export interface Call {
  tool: string;
  input: Record<string, unknown>;
  expect: Record<string, unknown>;
}

export interface Turn {
  human: string;
  calls: Call[];
  ai: string | null;
  choices?: string[];
}

export interface Scenario {
  format: typeof SCENARIO_FORMAT;
  id: string;
  title: string;
  kind: ProductKind;
  engine: { sha: string; hardwareCatalog: string };
  /** Что проверяет сценарий и критерии ответа помощника (TASK_FIRST.md п. 5). */
  goal: string;
  criteria: string[];
  /** Ожидаемые отказы движка словами — подстроки problem. */
  expected_refusals: string[];
  turns: Turn[];
  /** Разбор после прогона в треде (п. 7). */
  review: string;
}

/** Что сверяется в ответе инструмента: версия, принятые и отказанная правки, цена, размер состава. */
export function expectOf(out: Output): Record<string, unknown> {
  if (out.error) return { error: out.error };
  const e: Record<string, unknown> = {};
  if ('revision' in out) e.revision = out.revision;
  if (Array.isArray(out.applied)) e.applied = (out.applied as { op: string }[]).map((a) => a.op);
  if ('refused' in out) e.refused = out.refused ?? null;
  if (out.price) {
    const p = out.price as Record<string, unknown>;
    e.price = { status: p.status, amount_rub: p.amount_rub, known_amount_rub: p.known_amount_rub };
  }
  if (out.state) {
    const s = out.state as { modules?: unknown[]; sections?: unknown[]; parts: number };
    if (s.modules) e.modules = s.modules.length;
    if (s.sections) e.sections = s.sections.length;
    e.parts = s.parts;
  }
  if (Array.isArray(out.variants)) e.variants = (out.variants as { name: string }[]).map((v) => v.name);
  if (out.values) e.values = Array.isArray(out.values) ? out.values.length : Object.keys(out.values as object).length;
  if (out.shown) e.shown = out.shown;
  return e;
}

/** Сеанс → сценарий: реплики и вызовы по порядку; project_id и base_revision — подстановки $project и $head. */
export function exportScenario(stand: Stand, title: string): Scenario {
  const events = [...stand.dialog().map((d) => ({ seq: d.seq ?? 0, d })), ...stand.calls().map((c) => ({ seq: c.seq, c }))].sort((a, b) => a.seq - b.seq);
  const turns: Turn[] = [];
  let head: string | null = null;
  for (const ev of events) {
    if ('d' in ev) {
      const d = ev.d!;
      if (d.who === 'human') turns.push({ human: d.text, calls: [], ai: null });
      else if (!turns.length) throw new Error('Сеанс начинается не с реплики человека.');
      else if (d.who === 'ai') turns.at(-1)!.ai = turns.at(-1)!.ai ? turns.at(-1)!.ai + '\n\n' + d.text : d.text;
      else turns.at(-1)!.choices = d.options;
      continue;
    }
    const c = ev.c!;
    if (!turns.length) throw new Error('Вызов до первой реплики человека.');
    const input = { ...(c.input as Record<string, unknown>) };
    if (input.project_id === stand.projectId) input.project_id = '$project';
    if ('base_revision' in input && input.base_revision === head) input.base_revision = '$head';
    turns.at(-1)!.calls.push({ tool: c.tool, input, expect: expectOf(c.output) });
    if (typeof c.output.revision === 'string') head = c.output.revision;
  }
  return {
    format: SCENARIO_FORMAT,
    id: stand.name,
    title,
    kind: stand.data.kind ?? 'kitchen',
    engine: { sha: stand.data.engine.sha, hardwareCatalog: stand.data.engine.hardwareCatalog },
    goal: '',
    criteria: [],
    expected_refusals: [],
    turns,
    review: '',
  };
}

export interface ReplayResult {
  problems: string[];
  calls: number;
  final: Output | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Проигрывает вызовы сценария на чистом сеансе и сверяет ответы с записанными; проверяет реплики помощника. */
export function replay(core: Core, sc: Scenario): ReplayResult {
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-replay-'));
  const problems: string[] = [];
  let calls = 0,
    last: Output | null = null,
    price: Record<string, unknown> | null = null;
  const refusals: string[] = [];
  try {
    if (sc.engine.sha !== core.pin.sha) problems.push(`сценарий записан на ядре ${sc.engine.sha.slice(0, 8)}, стенд — ${core.pin.sha.slice(0, 8)}`);
    const stand = new Stand(core, dir, 'replay', () => new Date('2026-10-28T12:00:00Z'));
    let head: string | null = null;
    sc.turns.forEach((t, ti) => {
      stand.say('human', t.human);
      // Цены вариантов из ответа variants за этот ход — тоже ответ стенда (сравнение вариантов).
      const variantPrices: Record<string, unknown>[] = [];
      t.calls.forEach((c, ci) => {
        const input = JSON.parse(JSON.stringify(c.input));
        if (input.project_id === '$project') input.project_id = stand.projectId;
        if (input.base_revision === '$head') input.base_revision = head;
        const out = stand.run(c.tool, input);
        calls++;
        const got = expectOf(out);
        for (const [key, want] of Object.entries(c.expect))
          if (!same(got[key], want)) problems.push(`ход ${ti + 1}, вызов ${ci + 1} ${c.tool}: ${key} = ${JSON.stringify(got[key])}, записано ${JSON.stringify(want)}`);
        if (typeof out.revision === 'string') head = out.revision;
        if (out.price) price = out.price as Record<string, unknown>;
        if (Array.isArray(out.variants)) variantPrices.push(...(out.variants as { price: Record<string, unknown> }[]).map((v) => v.price));
        const r = out.refused as { problem?: string } | null | undefined;
        if (r?.problem) refusals.push(r.problem);
        last = out;
      });
      if (t.ai) {
        stand.say('ai', t.ai);
        problems.push(...answerProblems(t.ai, price, variantPrices).map((p) => `ход ${ti + 1}, ответ помощника: ${p}`));
      }
    });
    for (const want of sc.expected_refusals) if (!refusals.some((r) => r.includes(want))) problems.push(`нет ожидаемого отказа движка: «${want}»`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { problems, calls, final: last };
}

/**
 * Проверки реплики помощника по последней цене стенда (SYSTEM_PROMPT_DRAFT.md «После правки»):
 * каждая сумма в тыс. ₽ — это сумма или известная часть из ответа (округление до тысяч) или цена варианта из ответа variants;
 * при неполной цене названная сумма сопровождается словом «неполная»; не больше трёх вопросов.
 */
export function answerProblems(text: string, price: Record<string, unknown> | null, variants: Record<string, unknown>[] = []): string[] {
  const problems: string[] = [];
  const amounts = [...text.matchAll(/(\d[\d\s ]*(?:[.,]\d+)?)\s*тыс\.?\s*₽/g)].map((m) => Number(m[1]!.replace(/[\s ]/g, '').replace(',', '.')));
  const rubles = [...text.matchAll(/(\d[\d\s ]{2,}(?:[.,]\d+)?)\s*₽/g)].filter((m) => !/тыс/.test(m[0]));
  if (rubles.length) problems.push(`сумма в рублях без «тыс.»: ${rubles.map((m) => m[0]).join(', ')} — говорить ориентир в тысячах`);
  if (amounts.length) {
    if (!price) problems.push(`названа цена ${amounts.join(', ')} тыс. ₽, а цены от стенда ещё нет`);
    else {
      const allowed = [price, ...variants].flatMap((x) => [x.amount_rub, x.known_amount_rub]).filter((v): v is number => typeof v === 'number').map((v) => Math.round(v / 1000));
      for (const a of amounts) if (!allowed.includes(Math.round(a))) problems.push(`названо ${a} тыс. ₽, в ответе стенда ${allowed.join(' / ') || 'цены нет'} тыс. ₽`);
      if (price.amount_rub === null && !/неполн/i.test(text)) problems.push('цена неполная, а в ответе нет слова «неполная»');
    }
  }
  const questions = (text.match(/\?/g) ?? []).length;
  if (questions > 3) problems.push(`вопросов ${questions}, больше трёх`);
  return problems;
}
