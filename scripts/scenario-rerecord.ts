// Перезапись сценариев на новой основе движка (engine.json): проигрывает записанные вызовы на копии ядра и
// печатает расхождения ответов с записанными — версии не в счёт, они меняются с ядром. С --write пишет новые ответы
// (expect), версии во входах (undo to_revision и т. п.) и engine сценария. Реплики, expected_refusals и разбор
// не трогает: их правит человек по таблице расхождений (правило переписи: изменение по решению Modulero или задача MOD-AI).
//   npm run scenarios:rerecord                         все сценарии, только отчёт
//   npm run scenarios:rerecord -- --write k01 w03      записать выбранные (по началу имени файла)
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCore } from '../src/stand/engine.ts';
import { answerProblems, expectOf, type Scenario } from '../src/stand/scenario.ts';
import { Stand } from '../src/stand/stand.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const write = args.includes('--write');
const only = args.filter((a) => a !== '--write');
const core = await loadCore();

/** Строки входа, равные записанной версии, заменяются версией нового ядра (глубоко). */
function remap(x: unknown, revs: Map<string, string>): unknown {
  if (typeof x === 'string') return revs.get(x) ?? x;
  if (Array.isArray(x)) return x.map((v) => remap(v, revs));
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, remap(v, revs)]));
  return x;
}

for (const kind of ['kitchen', 'wardrobe', 'home']) {
  for (const f of readdirSync(join(ROOT, 'scenarios', kind)).filter((n) => n.endsWith('.json')).sort()) {
    if (only.length && !only.some((o) => f.startsWith(o))) continue;
    const path = join(ROOT, 'scenarios', kind, f);
    const sc: Scenario = JSON.parse(readFileSync(path, 'utf8'));
    const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-rerecord-'));
    const lines: string[] = [];
    const refusals: string[] = [];
    const revs = new Map<string, string>();
    try {
      const stand = new Stand(core, dir, 'replay', () => new Date('2026-10-28T12:00:00Z'));
      let head: string | null = null;
      let price: Record<string, unknown> | null = null;
      sc.turns.forEach((t, ti) => {
        stand.say('human', t.human);
        const variantPrices: Record<string, unknown>[] = [];
        t.calls.forEach((c, ci) => {
          c.input = remap(c.input, revs) as Record<string, unknown>;
          const input = JSON.parse(JSON.stringify(c.input));
          if (input.project_id === '$project') input.project_id = stand.projectId;
          if (input.base_revision === '$head') input.base_revision = head;
          const out = stand.run(c.tool, input);
          const got = expectOf(out);
          if (typeof c.expect.revision === 'string' && typeof got.revision === 'string') revs.set(c.expect.revision, got.revision);
          for (const key of new Set([...Object.keys(c.expect), ...Object.keys(got)])) {
            if (key === 'revision' || JSON.stringify(got[key]) === JSON.stringify(c.expect[key])) continue;
            lines.push(`  ход ${ti + 1}.${ci + 1} ${c.tool} ${key}: было ${JSON.stringify(c.expect[key])}\n${' '.repeat(10 + c.tool.length + key.length)}стало ${JSON.stringify(got[key])}`);
          }
          c.expect = got;
          if (typeof out.revision === 'string') head = out.revision;
          if (out.price) price = out.price as Record<string, unknown>;
          if (Array.isArray(out.variants)) variantPrices.push(...(out.variants as { price: Record<string, unknown> }[]).map((v) => v.price));
          const r = out.refused as { problem?: string } | null | undefined;
          if (r?.problem) refusals.push(r.problem);
        });
        if (t.ai) for (const p of answerProblems(t.ai, price, variantPrices, sc.price_in_answer === true)) lines.push(`  ход ${ti + 1}, ответ помощника: ${p}`);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    for (const want of sc.expected_refusals) if (!refusals.some((r) => r.includes(want))) lines.push(`  нет ожидаемого отказа: «${want}»`);
    console.log(`${kind}/${f}${lines.length ? '' : ' — без расхождений'}`);
    for (const l of lines) console.log(l);
    if (write) {
      sc.engine = { sha: core.pin.sha, hardwareCatalog: core.pin.hardwareCatalog };
      writeFileSync(path, JSON.stringify(sc, null, 2) + '\n');
    }
  }
}
