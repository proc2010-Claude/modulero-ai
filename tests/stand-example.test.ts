// EXCHANGE_SPEC.md §6 / TASK_FIRST.md п. 6: стенд даёт те же версии KPR2-…, отказы и суммы, что прогон примера
// на настоящем движке (reference/start/examples/kitchen-dialog.log.json), и те же файлы проекта шагов.
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCore } from '../src/stand/engine.ts';
import { Stand } from '../src/stand/stand.ts';

const EXAMPLES = new URL('../reference/start/examples/', import.meta.url);
const log: any[] = JSON.parse(readFileSync(new URL('kitchen-dialog.log.json', EXAMPLES), 'utf8'));

/** Вызов функции ядра из журнала примера → правка договора §4.1. */
function editOf(tool: string, a: any): Record<string, unknown> {
  const op = tool.replace(/^kitchen\./, '');
  switch (op) {
    case 'set_room': {
      const [key, value] = Object.entries(a)[0]!;
      return { op, key, value };
    }
    case 'add_module':
      return { op, card: a.card, wall: a.wall ?? null, pos: a.pos ?? null, width: a.width ?? null };
    case 'update_module':
      return { op, id: a.id, wall: a.wall ?? null, pos: a.pos ?? null, width: null, depth: null, height: null, floor: null };
    case 'set_material':
      return { op, role: a.role, code: a.code, module_id: null };
    default:
      return { op, ...a };
  }
}

test('пример «Хочу кухню» на стенде: версии, отказы, суммы и файлы как в журнале прогона', async () => {
  const core = await loadCore();
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-example-'));
  try {
    const stand = new Stand(core, dir, 'example', () => new Date('2026-10-28T12:00:00Z'));
    let out: any = null,
      step = 0;
    for (const e of log) {
      if (e.snapshot) {
        const s = e.snapshot;
        step++;
        assert.equal(out.revision, s.revision, `шаг ${step}: версия`);
        assert.deepEqual(
          { status: out.price.status, amount_rub: out.price.amount_rub, known_amount_rub: out.price.known_amount_rub, missing: out.price.missing },
          { status: s.price.status, amount_rub: s.price.amount, known_amount_rub: s.price.known, missing: s.price.missing },
          `шаг ${step}: цена`,
        );
        assert.equal(out.state.parts, s.parts, `шаг ${step}: деталей`);
        assert.deepEqual(
          out.state.modules.map((m: any) => [m.id, m.name, m.kind, m.wall, m.width, m.pos]),
          s.modules.map((m: any) => [m.id, m.name, m.kind, m.wall, m.width, m.pos]),
          `шаг ${step}: состав`,
        );
        // Файл версии — тот же проект, что файл шага примера (дата сохранения у стенда та же).
        const v = stand.data.history.at(-1)!;
        const mine = JSON.parse(readFileSync(join(stand.dir, v.file), 'utf8')),
          theirs = JSON.parse(readFileSync(new URL(`kitchen-step${step}.modulero`, EXAMPLES), 'utf8'));
        assert.equal(mine.digest, theirs.digest, `шаг ${step}: digest файла проекта`);
        continue;
      }
      if (e.tool === 'start_project') {
        out = stand.run('start_project', { kind: 'kitchen', template: 'empty' });
        continue;
      }
      out = stand.run('kitchen_edits', { project_id: stand.projectId, base_revision: out.revision, label: e.tool, edits: [editOf(e.tool, e.args)] });
      assert.ok(!out.error, String(out.error));
      if (e.ok) assert.equal(out.applied[0]?.notice, e.notice ?? null, `${e.tool} ${JSON.stringify(e.args)}: notice`);
      else assert.equal(out.refused?.problem, e.problem, `${e.tool} ${JSON.stringify(e.args)}: отказ`);
    }
    assert.equal(step, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('стенд: STALE_REVISION, вход не по схеме, изделие вне стенда', async () => {
  const core = await loadCore();
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-stand-'));
  try {
    const stand = new Stand(core, dir, 'checks', () => new Date('2026-10-28T12:00:00Z'));
    const start: any = stand.run('start_project', { kind: 'kitchen', template: 'straight' });
    assert.match(start.revision, /^KPR2-/);
    const stale: any = stand.run('kitchen_edits', { project_id: 'checks', base_revision: 'KPR2-0000000000000000', label: 'x', edits: [{ op: 'set_type', type: 'l' }] });
    assert.equal(stale.refused.code, 'STALE_REVISION');
    assert.equal(stale.revision, start.revision);
    const bad: any = stand.run('kitchen_edits', { project_id: 'checks', base_revision: start.revision, label: 'x', edits: [{ op: 'set_room', key: 'width', value: 5000 }] });
    assert.equal(bad.is_error, true);
    assert.match(bad.error, /не больше 4000/);
    assert.equal((stand.run('start_project', { kind: 'home', template: 'chest' }) as any).is_error, true);
    assert.equal((stand.run('wardrobe_edits', { project_id: 'checks', base_revision: start.revision, label: 'x', edits: [{ op: 'set_section_count', n: 2 }] }) as any).is_error, true);
    // Цена — только поля полосы цены конструктора: без себестоимости и ставок (MOD-DEC-497).
    assert.deepEqual(Object.keys(start.price).sort(), ['amount_rub', 'appliances_included', 'currency', 'known_amount_rub', 'missing', 'status', 'terms_hidden', 'unpriced_rows']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
