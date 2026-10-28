// Общий проход к командам редактора (AI-DEC-007): список команд снят с типов ядра, editor_call выполняет их
// функциями ядра с его проверками и отказами; другая мебель (HOME) — на стенде тем же путём.
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { generate } from '../scripts/commands.ts';
import { commandsPath, loadCommands } from '../src/stand/commands.ts';
import { loadCore } from '../src/stand/engine.ts';
import { Stand } from '../src/stand/stand.ts';
import { loadStandTools, toolsProblems } from '../src/tools.ts';

test('команды редактора: файл contract/ совпадает с типами ядра на закреплённом SHA', async () => {
  const core = await loadCore();
  const saved = readFileSync(commandsPath(core.pin.sha), 'utf8');
  assert.equal(saved, JSON.stringify(generate(), null, 2) + '\n', 'node scripts/commands.ts пересоздаст файл');
  const file = loadCommands(core.pin.sha);
  const of = (p: string) => file.commands.filter((c) => c.command.startsWith(p + '/')).length;
  assert.ok(of('kitchen') >= 20 && of('wardrobe') >= 60 && of('home') >= 15, `${of('kitchen')} / ${of('wardrobe')} / ${of('home')}`);
  // Ставки, валюта и раскрой мебельщика — не команды стенда (MOD-DEC-497).
  for (const c of ['kitchen/setKitchenRates', 'kitchen/setKitchenCurrency', 'kitchen/setKitchenCutting', 'wardrobe/setCutting']) assert.ok(file.skipped.some((s) => s.command === c), c);
  assert.ok(!file.commands.some((c) => /rate|currency|cutting/i.test(c.command)));
});

test('инструменты стенда: договор 0.1 и расширение 0.2 — strict', () => {
  const tools = loadStandTools();
  assert.deepEqual(toolsProblems(tools), []);
  assert.deepEqual(tools.tools.slice(-2).map((t) => t.name), ['list_commands', 'editor_call']);
});

test('editor_call: шкаф на два корпуса со стыком между 2-й и 3-й секцией, антресоль над каждым', async () => {
  const core = await loadCore();
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-commands-'));
  try {
    const stand = new Stand(core, dir, 'c', () => new Date('2026-10-28T12:00:00Z'));
    const start: any = stand.run('start_project', { kind: 'wardrobe', template: 'start' });
    const list: any = stand.run('list_commands', { kind: 'sliding' });
    assert.ok(list.commands.some((c: any) => c.command === 'wardrobe/toggleBodyJoint'));
    assert.ok(list.commands.every((c: any) => !('hw' in c.args.properties)), 'каталог подставляет стенд');
    const call = (base: string, calls: [string, unknown][]): any =>
      stand.run('editor_call', { project_id: 'c', base_revision: base, label: 'Два корпуса', calls: calls.map(([command, args]) => ({ command, args_json: JSON.stringify(args) })) });
    const a = call(start.revision, [
      ['wardrobe/setSectionCount', { n: 4 }],
      ['wardrobe/toggleBodyJoint', { joint: 2 }],
      ['wardrobe/setMezzanine', { height: 450 }],
    ]);
    assert.equal(a.refused, null);
    assert.deepEqual(a.state.body_joints, [2]);
    assert.equal(a.state.bodies.filter((b: any) => !b.over).length, 2);
    assert.equal(a.state.bodies.filter((b: any) => b.over).length, 2);
    // Файл версии — шкаф конструктора с этими корпусами.
    const opened = core.readProjectFile(readFileSync(join(dir, 'c', stand.data.history.at(-1)!.file), 'utf8'), core.HW);
    assert.deepEqual(core.W.bodyJoints(opened.project.input), [2]);

    // Отказ ядра его словами; неверные параметры, чужое изделие, команда мебельщика — отказ, проект прежний.
    const b = call(a.revision, [['wardrobe/setBodyWidth', { index: 0, width: 50 }]]);
    assert.ok(b.refused.problem.length > 0);
    assert.equal(b.revision, a.revision);
    assert.match(call(a.revision, [['wardrobe/toggleBodyJoint', { joint: 'два' }]]).refused.problem, /не по схеме/);
    assert.match(call(a.revision, [['kitchen/setKitchenIsland', { on: true }]]).refused.problem, /не для этого изделия/);
    assert.match(call(a.revision, [['wardrobe/setCutting', {}]]).refused.problem, /недоступна: параметры раскроя/);
    assert.match(call(a.revision, [['wardrobe/nope', {}]]).refused.problem, /Нет команды/);
    // Правка, которую редактор принял, а граф не строит (MOD-AI-18), — отказ, как у wardrobe_edits.
    const c = call(a.revision, [
      ['wardrobe/setRoom', { patch: { niche: true } }],
      ['wardrobe/setPanel', { panel: 'back', on: false }],
      ['wardrobe/setPushToOpen', { on: true }],
    ]);
    assert.match(c.refused.problem, /Конструктор не строит шкаф/);
    assert.equal(c.refused.op, 'wardrobe/setPushToOpen');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('editor_call: полка модуля кухни по id из сводки', async () => {
  const core = await loadCore();
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-commands-'));
  try {
    const stand = new Stand(core, dir, 'k', () => new Date('2026-10-28T12:00:00Z'));
    const start: any = stand.run('start_project', { kind: 'kitchen', template: 'straight' });
    const m = start.state.modules.find((x: any) => x.can_add_shelf && x.shelves?.length);
    assert.ok(m, 'в примере есть модуль, куда можно добавить полку');
    const r: any = stand.run('editor_call', { project_id: 'k', base_revision: start.revision, label: 'Ещё полка', calls: [{ command: 'kitchen/addKitchenShelf', args_json: JSON.stringify({ id: m.id }) }] });
    assert.equal(r.refused, null);
    assert.equal(r.state.modules.find((x: any) => x.id === m.id).shelves.length, m.shelves.length + 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('другая мебель: комод, правки договора и команды редактора, файл, возврат', async () => {
  const core = await loadCore();
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-home-'));
  try {
    const stand = new Stand(core, dir, 'h', () => new Date('2026-10-28T12:00:00Z'));
    const start: any = stand.run('start_project', { kind: 'home', template: 'chest' });
    assert.equal(start.state.kind, 'home');
    assert.equal(start.state.bodies[0].drawers.length, 3);
    assert.deepEqual(Object.keys(start.price).sort(), ['amount_rub', 'currency', 'known_amount_rub', 'missing', 'status', 'terms_hidden']);
    const body = start.state.bodies[0].id;
    const a: any = stand.run('home_edits', { project_id: 'h', base_revision: start.revision, label: 'Белый, шире', edits: [{ op: 'set_material', material_id: 'white' }, { op: 'resize', axis: 'w', value: 1000, body_id: null }] });
    assert.equal(a.refused, null);
    assert.equal(a.state.bodies[0].width, 1000);
    // Отказ редактора HOME его словами (дверца до 600 мм — §4.3), проект прежний.
    const b: any = stand.run('home_edits', { project_id: 'h', base_revision: a.revision, label: 'Дверь', edits: [{ op: 'add_door', body_id: body, lo: null, hi: null, hinge: null }] });
    assert.ok(b.refused?.problem, JSON.stringify(b.refused));
    assert.equal(b.revision, a.revision);
    const c: any = stand.run('editor_call', { project_id: 'h', base_revision: a.revision, label: 'На ковёр, ещё корпус', calls: [{ command: 'home/setFloor', args_json: '{"floor":"carpet"}' }, { command: 'home/copy', args_json: JSON.stringify({ bodyId: body }) }] });
    assert.equal(c.refused, null, JSON.stringify(c.refused));
    assert.equal(c.state.floor, 'ковёр');
    assert.equal(c.state.bodies.length, 2);
    const opened = core.readProjectFile(readFileSync(join(dir, 'h', stand.data.history.at(-1)!.file), 'utf8'), core.HW);
    assert.equal(opened.kind, 'home');
    assert.equal(opened.editable, true);
    assert.ok(!(stand.run('get_options', { kind: 'home', topic: 'home_templates' }) as any).is_error);
    assert.ok(!(stand.run('get_options', { kind: 'home', topic: 'handles' }) as any).is_error);
    const back: any = stand.run('undo', { project_id: 'h', to_revision: a.revision });
    assert.equal(back.revision, a.revision);
    const v: any = stand.run('variants', { project_id: 'h', action: 'save', name: 'Белый' });
    assert.ok(!v.refused, JSON.stringify(v));
    assert.match(readFileSync(join(dir, 'h', 'prototype.html'), 'utf8'), /Прототип · другая мебель/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
