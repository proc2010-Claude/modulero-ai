// Договор 0.3-draft (AI-DEC-010): новые правки *_edits на ядре 1582b93e — функциями редактора ядра, отказы словами
// конструктора, в state — то, что видно в его окне. Стенд ничего не считает: числа в проверках — из ответов.
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCore } from '../src/stand/engine.ts';
import { Stand } from '../src/stand/stand.ts';
import { loadStandTools, toolsProblems } from '../src/tools.ts';

async function stand(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-03-'));
  return { s: new Stand(await loadCore(), dir, name, () => new Date('2026-10-28T12:00:00Z')), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const values = (s: Stand, kind: string, topic: string): any => (s.run('get_options', { kind, topic }) as any).values;

test('договор 0.3-draft: инструменты 0.1 заменены целиком, схемы strict', () => {
  const file = loadStandTools();
  assert.equal(file.formatVersion, '0.1-draft+0.2-draft+0.3-draft');
  assert.deepEqual(toolsProblems(file), []);
  const kitchen = file.tools.find((t) => t.name === 'kitchen_edits')!;
  const ops = (kitchen.input_schema as any).properties.edits.items.anyOf.map((v: any) => v.properties.op.const);
  for (const op of ['replace_module', 'set_worktop', 'set_handles', 'set_cutout']) assert.ok(ops.includes(op), op);
});

test('кухня 0.3: столешница, ручки, вырез, замена модуля, добор, замечание 450 мм', async () => {
  const { s, done } = await stand('k');
  try {
    let r: any = s.run('start_project', { kind: 'kitchen', template: 'straight' });
    const ed = (edits: unknown[]) => (r = s.run('kitchen_edits', { project_id: 'k', base_revision: r.revision, label: 'x', edits }) as any);
    const worktop = values(s, 'kitchen', 'worktops').find((w: any) => w.id);
    ed([{ op: 'set_worktop', worktop_id: worktop.id }]);
    assert.equal(r.refused, null);
    assert.equal(r.state.materials.worktop, worktop.name);
    const handle = values(s, 'kitchen', 'handles').find((h: any) => h.id && h.id !== 'NONE');
    ed([{ op: 'set_handles', handle_id: handle.id, push_to_open: null }]);
    assert.equal(r.state.materials.handle, handle.name);
    assert.match(ed([{ op: 'set_worktop', worktop_id: 'nope' }]).refused.problem, /нет среди столешниц/);
    const sink = r.state.modules.find((m: any) => m.card === 'lower-sink');
    ed([{ op: 'set_cutout', id: sink.id, width: 560, depth: 480, radius: 10, gas: null }]);
    assert.equal(r.refused, null);
    assert.match(ed([{ op: 'set_cutout', id: sink.id, width: 560, depth: null, radius: 10, gas: null }]).refused.problem, /ширина, глубина и радиус/);
    const drawers = r.state.modules.find((m: any) => m.card === 'lower-drawers');
    ed([{ op: 'replace_module', id: drawers.id, card: 'lower-hob' }]);
    assert.equal(r.refused, null);
    assert.equal(r.state.modules.find((m: any) => m.id === drawers.id).card, 'lower-hob');
    const upper = r.state.modules.find((m: any) => m.kind === 'upper' && m.pos === drawers.pos);
    ed([{ op: 'update_module', id: upper.id, wall: null, pos: null, width: null, depth: null, height: null, floor: 1250 }]);
    assert.ok(r.warnings.some((w: string) => /450 мм/.test(w)), r.warnings.join('\n'));
    ed([{ op: 'set_room', key: 'width', value: 5000 }, { op: 'add_module', card: 'filler', wall: 'A', pos: null, width: 50 }]);
    assert.equal(r.refused, null);
    assert.ok(r.state.modules.some((m: any) => m.card === 'filler'));
  } finally {
    done();
  }
});

test('купе 0.3: цвет профиля, зеркало в одной створке, ширины секций, пределы антресоли', async () => {
  const { s, done } = await stand('w');
  try {
    let r: any = s.run('start_project', { kind: 'sliding', template: 'start' });
    const ed = (edits: unknown[]) => (r = s.run('wardrobe_edits', { project_id: 'w', base_revision: r.revision, label: 'x', edits }) as any);
    const eco = values(s, 'sliding', 'profile_finishes').find((x: any) => x.system === 'eco');
    const black = eco.finishes.find((f: any) => f.id === 'BKSPC');
    ed([{ op: 'set_sliding_doors', n: 3, system: null, scheme: null, mirror: null, profile_finish: black.id }]);
    assert.equal(r.state.sliding.profile_finish, black.title);
    const mirror = values(s, 'sliding', 'sliding_inserts').glass.find((g: any) => /Зеркало/.test(g.title));
    const leaf = r.state.sliding.leaf_inserts[1].leaf_id;
    ed([{ op: 'set_sliding_insert', material: mirror.id, decor_id: null, leaf_id: leaf }]);
    assert.equal(r.refused, null);
    assert.deepEqual(r.state.sliding.leaf_inserts.map((x: any) => x.material), ['DOORS', mirror.id, 'DOORS']);
    assert.match(ed([{ op: 'set_section_widths', widths: [600, 800, 600] }]).refused.problem, /Сумма ширин секций/);
    const w = r.state.size.width;
    ed([{ op: 'set_section_widths', widths: [w - 1000, 500, 500] }]);
    assert.deepEqual(r.state.sections.map((x: any) => x.width_mm), [w - 1000, 500, 500]);
    assert.ok(r.state.mezzanine_limits_mm.max > r.state.mezzanine_limits_mm.min);
    assert.ok(values(s, 'wardrobe', 'limits').mezzanine_mm.max > 0);
  } finally {
    done();
  }
});

test('HOME 0.3: туалетный столик, подвесная тумба с подсветкой и стеклом, откидной фасад, тумба стола справа', async () => {
  const { s, done } = await stand('h');
  try {
    assert.ok(values(s, 'home', 'home_templates').some((t: any) => t.id === 'vanity'));
    let r: any = s.run('start_project', { kind: 'home', template: 'vanity' });
    const ed = (edits: unknown[]) => (r = s.run('home_edits', { project_id: 'h', base_revision: r.revision, label: 'x', edits }) as any);
    const vanity = r.state.bodies[0];
    assert.ok(vanity.mirror_height > 0, 'у туалетного столика зеркало над крышкой');
    ed([{ op: 'set_top_corners', body_id: vanity.id, radius: 50 }]);
    assert.equal(r.state.bodies[0].top_radius, 50);

    r = s.run('start_project', { kind: 'home', template: 'tv' });
    const tv = r.state.bodies[0];
    ed([
      { op: 'set_base', body_id: tv.id, kind: 'wall', height: null },
      { op: 'set_light', body_id: tv.id, on: true },
      { op: 'set_door_glass', body_id: tv.id, door_id: tv.doors[0].id, on: true },
      { op: 'set_cable', body_id: tv.id, on: true },
    ]);
    assert.equal(r.refused, null);
    const b = r.state.bodies[0];
    assert.equal(b.base.kind, 'подвесной на стене');
    assert.ok(b.light && b.cable && b.doors[0].glass);
    // Подвесной корпус без дна — отказ ядра его словами.
    assert.match(ed([{ op: 'set_niche_panel', body_id: tv.id, panel: 'bottom', omitted: true }]).refused.problem, /Подвесной корпус/);
    ed([{ op: 'set_door_lift', body_id: tv.id, door_id: tv.doors[1].id, on: true }]);
    assert.ok(r.state.bodies[0].doors[1].lift);
    ed([{ op: 'copy', body_id: tv.id, element_id: null, side: 'right', gap: null }]);
    assert.equal(r.state.bodies.length, 2);
    const decor = values(s, 'home', 'decors').catalog[1];
    ed([{ op: 'set_decor', decor_id: decor.id, thickness: null }]);
    assert.equal(r.refused, null);
    assert.ok(r.state.decor);

    r = s.run('start_project', { kind: 'home', template: 'desk' });
    ed([{ op: 'set_desk_pedestal', body_id: r.state.bodies[0].id, side: 'right' }]);
    assert.equal(r.state.bodies[0].pedestal, 'справа');
  } finally {
    done();
  }
});
