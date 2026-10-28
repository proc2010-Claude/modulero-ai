// Геометрия деталей в state — одна форма у кухни, шкафа, купе и другой мебели (geometry.ts): высоты от пола
// и толщины из 3D-сцены ядра. Помощник берёт их из ответа, а не считает.
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCore } from '../src/stand/engine.ts';
import { Stand } from '../src/stand/stand.ts';

const isZ = (x: any) => Array.isArray(x.z) && x.z.length === 2 && x.z[1] > x.z[0] && x.t > 0;

test('геометрия: тумба под ТВ — фасад ящика и полка над ним по высоте из ядра', async () => {
  const core = await loadCore();
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-geometry-'));
  try {
    const stand = new Stand(core, dir, 'g', () => new Date('2026-10-28T12:00:00Z'));
    const start: any = stand.run('start_project', { kind: 'home', template: 'tv' });
    const body = start.state.bodies[0],
      g0 = body.geometry;
    assert.ok(isZ(g0.bottom) && isZ(g0.top));
    assert.ok(g0.shelves.length === body.shelves.length && g0.shelves.every(isZ));
    // Дверцы — фасады с id элемента редактора.
    assert.deepEqual(g0.facades.map((f: any) => f.id).sort(), body.doors.map((d: any) => d.id).sort());
    const mid = body.shelves.find((s: any) => s.fixed);
    const a: any = stand.run('home_edits', {
      project_id: 'g',
      base_revision: start.revision,
      label: 'Ящик в середину',
      edits: [
        { op: 'remove', body_id: body.id, element_id: mid.id },
        { op: 'add_drawer', body_id: body.id, lo: mid.lo, hi: mid.hi, y: null, h: 200 },
      ],
    });
    assert.equal(a.refused, null);
    const drawer = a.state.bodies[0].geometry.drawers[0];
    assert.ok(isZ(drawer) && drawer.box[1] <= drawer.z[1]);
    assert.equal(drawer.id, a.state.bodies[0].drawers[0].id);
    // Полка «на 2 мм выше верха фасада ящика»: y — низ полки от пола; переставляемую ядро ставит на ряд отверстий,
    // где она встала — видно только в geometry.
    const b: any = stand.run('home_edits', { project_id: 'g', base_revision: a.revision, label: 'Полка над ящиком', edits: [{ op: 'add_shelf', body_id: body.id, lo: mid.lo, hi: mid.hi, y: drawer.z[1] + 2 }] });
    assert.equal(b.refused, null);
    const shelf = b.state.bodies[0].shelves.at(-1),
      placed = b.state.bodies[0].geometry.shelves.find((s: any) => s.id === shelf.id);
    assert.equal(shelf.y, drawer.z[1] + 2);
    assert.ok(isZ(placed));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('геометрия: кухня и купе — та же форма', async () => {
  const core = await loadCore();
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-geometry-'));
  try {
    const k = new Stand(core, dir, 'k', () => new Date('2026-10-28T12:00:00Z'));
    const start: any = k.run('start_project', { kind: 'kitchen', template: 'straight' });
    for (const m of start.state.modules) {
      const g = m.geometry;
      for (const x of [g.bottom, g.top].filter(Boolean)) assert.ok(isZ(x));
      for (const x of [...(g.shelves ?? []), ...(g.drawers ?? []), ...(g.facades ?? [])]) assert.ok(isZ(x), `${m.id} ${x.id}`);
      // Полки — те же id, что в панели «Наполнение».
      if (m.shelves) assert.deepEqual(g.shelves.map((s: any) => s.id), m.shelves.map((s: any) => s.id));
    }
    assert.ok(start.state.modules.some((m: any) => m.geometry.facades?.length));

    const s = new Stand(core, dir, 's', () => new Date('2026-10-28T12:00:00Z'));
    const sl: any = s.run('start_project', { kind: 'sliding', template: 'start' });
    for (const sec of sl.state.sections) assert.ok(isZ(sec.geometry.bottom) && isZ(sec.geometry.top));
    assert.ok(sl.state.sliding.leaves.length >= 2 && sl.state.sliding.leaves.every(isZ));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
