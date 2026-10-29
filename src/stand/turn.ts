import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { liveState } from '../live/export.ts';
import { costLine } from './cost.ts';
import type { Stand } from './stand.ts';

/** Ход диалога одной командой: реплика человека, вызовы инструментов, ответ помощника, страница и live-файл. */
export interface TurnInput {
  /** Реплика владельца; null — ход без новой реплики (например, продолжение после отказа). */
  human: string | null;
  /** Вызовы по порядку. `base_revision: "head"` — ревизия текущей версии сеанса на момент вызова. */
  calls: { tool: string; input: Record<string, unknown> }[];
  /** Ответ помощника; пишется, только если все вызовы прошли без отказа и ошибки. */
  ai: string | null;
  /** Куда записать live-файл для конструктора владельца; null — не писать; поля нет — по папке вывода сеанса. */
  live: string | null;
  /** Папка для копии prototype.html (файлы проекта); null — не копировать; поля нет — по папке вывода сеанса. */
  copy: string | null;
}

/** Пути по умолчанию для хода без полей live и copy: папка вывода (файлы проекта), заданная `new/use --out`. */
export function outPaths(out: string | null, session: string): { live: string | null; copy: string | null } {
  if (out === null) return { live: null, copy: null };
  return { live: join(out, 'ai-dialog/live', `${session}.json`), copy: join(out, 'ai-dialog/sessions', session) };
}

export interface TurnCall {
  tool: string;
  revision: string | null;
  refused: unknown;
  error: string | null;
  /** Краткий ответ вызова (brief.ts, без state и путей страницы) — у всех, кроме того, что в last. */
  answer?: Record<string, unknown>;
  /** Вызов не выполнялся: ход остановился раньше на отказе или ошибке, а вызов меняет проект. */
  skipped?: true;
}

/** Справочные вызовы проект не меняют и выполняются и после отказа правки в том же ходе. */
export const READ_TOOLS: readonly string[] = ['get_options', 'list_commands', 'get_project'];

export interface TurnResult {
  /** Сеанс, в который записан ход: при нескольких сеансах в одной папке видно, что ход ушёл куда нужно. */
  session: string;
  ok: boolean;
  /** Номер вызова, на котором ход остановился (отказ или ошибка), иначе null. */
  stopped_at: number | null;
  /** Вызовы хода: у каждого, кроме показанного в last, — answer; после остановки правки не выполняются (skipped). */
  calls: TurnCall[];
  /** Краткий ответ вызова, на котором ход остановился, иначе последнего (brief.ts) — для пересказа отказа или изменений. */
  last: Record<string, unknown> | null;
  /** Полный ответ последнего вызова (с state); CLI печатает его вместо last с флагом --full. */
  last_full: Record<string, unknown> | null;
  ai_written: boolean;
  /** Готовый текст для треда: ответ помощника и строка расхода курсивом; null — ответ не записан. */
  reply: string | null;
  /** Сообщение в тред конструктора после записи live-файла («ход <сеанс>»); null — live не писался. */
  notify: string | null;
  revision: string | null;
  /** Полный state текущей версии после хода: id и высоты для следующего хода без get_project. */
  state: unknown;
  page: string;
  live: string | null;
  copy: string | null;
}

export function parseTurn(raw: unknown, defaults: { live: string | null; copy: string | null } = { live: null, copy: null }): TurnInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ход — объект JSON.');
  const t = raw as Record<string, unknown>;
  const text = (k: string) => {
    const v = t[k] ?? null;
    if (v !== null && typeof v !== 'string') throw new Error(`Поле ${k} — строка или null.`);
    return v as string | null;
  };
  if (!Array.isArray(t.calls)) throw new Error('Поле calls — массив вызовов.');
  const calls = t.calls.map((c, i) => {
    const x = c as Record<string, unknown>;
    if (!x || typeof x.tool !== 'string' || !x.input || typeof x.input !== 'object') throw new Error(`calls[${i}]: нужны tool и input.`);
    return { tool: x.tool, input: x.input as Record<string, unknown> };
  });
  const path = (k: 'live' | 'copy') => (k in t ? text(k) : defaults[k]);
  return { human: text('human'), calls, ai: text('ai'), live: path('live'), copy: path('copy') };
}

export function runTurn(stand: Stand, turn: TurnInput): TurnResult {
  // Повтор хода после отказа или ошибки с той же репликой не пишет её второй раз.
  const prev = stand.dialog().filter((l) => l.who !== 'choices').at(-1);
  if (turn.human !== null && !(prev?.who === 'human' && prev.text === turn.human)) stand.say('human', turn.human);
  const calls: TurnCall[] = [];
  const answers: Record<string, unknown>[] = [];
  let shown: number | null = null,
    lastFull: Record<string, unknown> | null = null;
  let stopped: number | null = null;
  for (const [i, c] of turn.calls.entries()) {
    if (stopped !== null && !READ_TOOLS.includes(c.tool)) {
      calls.push({ tool: c.tool, revision: null, refused: null, error: null, skipped: true });
      continue;
    }
    const input = c.input.base_revision === 'head' ? { ...c.input, base_revision: stand.headRevision() } : c.input;
    const { full: out, brief } = stand.runBrief(c.tool, input);
    answers[i] = brief;
    const refused = out.refused ?? null;
    const error = out.is_error ? String(out.error ?? 'ошибка') : null;
    calls.push({ tool: c.tool, revision: (out.revision as string | undefined) ?? null, refused, error });
    if (stopped === null) {
      shown = i;
      lastFull = out;
      if (refused !== null || error !== null) stopped = i;
    }
  }
  // state — один раз, на верхнем уровне ответа хода; пути страницы — в page.
  for (const [i, a] of answers.entries()) if (a && i !== shown) calls[i]!.answer = (({ state: _s, view: _v, ...x }) => x)(a);
  const last = shown === null ? null : answers[shown]!;
  const ok = stopped === null;
  if (ok && turn.ai !== null) stand.say('ai', turn.ai);
  const page = join(stand.dir, 'prototype.html');
  if (turn.live !== null) {
    mkdirSync(dirname(turn.live), { recursive: true });
    writeFileSync(turn.live, JSON.stringify(liveState(stand.dir)) + '\n');
  }
  if (turn.copy !== null) {
    mkdirSync(turn.copy, { recursive: true });
    copyFileSync(page, join(turn.copy, 'prototype.html'));
  }
  const written = ok && turn.ai !== null;
  return {
    session: stand.name,
    ok,
    stopped_at: stopped,
    calls,
    last,
    last_full: lastFull,
    ai_written: written,
    reply: written ? `${turn.ai}\n\n_${costLine(stand.cost())}_` : null,
    notify: turn.live !== null ? `ход ${stand.projectId}` : null,
    revision: stand.headRevision(),
    state: stand.currentView()?.state ?? null,
    page,
    live: turn.live,
    copy: turn.copy,
  };
}
