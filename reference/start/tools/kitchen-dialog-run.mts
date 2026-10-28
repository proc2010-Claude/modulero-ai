// Прогон примера диалога «Хочу кухню» через настоящие правки ядра modulero-next (не код репозитория).
// Каждый вызов call() — то, что ИИ отправил бы инструментом apply_edits; ответ — то, что вернул движок.
// Запуск из корня modulero-next (main cbaf1534, каталог hw-2026-10-27.8), после npm ci:
//   npx tsx <путь>/kitchen-dialog-run.mts <папка для результата>
// Результат: kitchen-dialog.log.json (вызовы, ответы, снимки состояния и цены), stepN.modulero, stepN.svg.
import { writeFileSync, mkdirSync } from 'node:fs';
const R = '/home/user/modulero-next';
const K = await import(R + '/packages/core/src/kitchen/index.js');
const { kitchenGraph } = await import(R + '/packages/core/src/engine/generators/kitchen.js');
const { previewSvg } = await import(R + '/packages/core/src/project/preview.js');
const { writeProjectFile } = await import(R + '/packages/core/src/project/file.js');
const { hardwareCatalogs: HW } = await import(R + '/catalogs/index.js');
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
let p = K.newKitchenProject();
const log: any[] = [];
let step = 0;
function call(tool: string, args: any, fn: () => any) {
  const r = fn();
  const entry: any = { tool, args, ok: r.ok };
  if (r.ok) { p = r.project; if (r.notice) entry.notice = r.notice; if (r.selected) entry.selected = r.selected; }
  else entry.problem = r.problem;
  log.push(entry); console.log(JSON.stringify(entry));
  return r;
}
function snapshot(label: string) {
  step++;
  const s = K.kitchenSceneOf(p, HW), g = kitchenGraph(s), out = K.kitchenOutputs(g, s);
  const plan = K.kitchenPlan(p, HW);
  const svg = previewSvg(g);
  if (svg) writeFileSync(`${OUT}/step${step}.svg`, svg);
  const sum = {
    step, label, revision: out.revision,
    room: p.room, type: p.type, orientation: p.orientation, corpus: p.corpusMaterial, facade: p.facadeMaterial,
    walls: K.kitchenWalls(p, HW),
    modules: plan.modules.map((m: any) => ({ id: m.id, name: m.name, kind: m.kind, wall: m.wall, width: s.modules.find((x: any) => x.id === m.id)?.width, pos: s.modules.find((x: any) => x.id === m.id)?.pos })),
    parts: g.parts.length,
    price: { amount: out.price.amount, known: out.price.knownAmount, status: out.price.status, currency: out.price.currency, missing: out.price.missing, unpriced: out.price.unpriced },
    warnings: K.kitchenObstacleWarnings(p, HW).map((w: any) => w.text),
    sceneError: K.kitchenSceneError(s),
  };
  console.log('SNAP', JSON.stringify(sum));
  log.push({ snapshot: sum });
  writeFileSync(`${OUT}/step${step}.modulero`, writeProjectFile('kitchen', p, { appVersion: 'ai-dialog-example', now: new Date('2026-10-28T12:00:00Z'), hardwareCatalog: HW.release }));
}
const wall = () => K.kitchenWalls(p, HW)[0].id;
// Ход 1: «Хочу кухню» — ИИ создаёт пустую кухню и спрашивает размеры.
call('start_project', { kind: 'kitchen' }, () => ({ ok: true, project: K.newKitchenProject() }));
snapshot('Пустая кухня');
// Ход 2: «Вдоль одной стены 3,2 м, потолок 2,7. Холодильник встроенный, духовка под столешницей, мойка, посудомойка»
call('kitchen.set_room', { width: 3200 }, () => K.setKitchenRoom(p, HW, 'width', 3200));
call('kitchen.set_room', { height: 2700 }, () => K.setKitchenRoom(p, HW, 'height', 2700));
call('kitchen.set_type', { type: 'straight' }, () => K.setKitchenType(p, HW, 'straight'));
const A = wall();
call('kitchen.add_module', { card: 'tall-fridge-one', wall: A, pos: 0, width: 600 }, () => K.addKitchenModuleTo(p, HW, 'tall-fridge-one', { wall: A, pos: 0, width: 600 }));
call('kitchen.add_module', { card: 'lower-oven', wall: A, width: 600 }, () => K.addKitchenModuleTo(p, HW, 'lower-oven', { wall: A, width: 600 }));
call('kitchen.add_module', { card: 'lower-drawers', wall: A, width: 600 }, () => K.addKitchenModuleTo(p, HW, 'lower-drawers', { wall: A, width: 600 }));
call('kitchen.add_module', { card: 'lower-sink', wall: A, width: 800 }, () => K.addKitchenModuleTo(p, HW, 'lower-sink', { wall: A, width: 800 }));
call('kitchen.add_module', { card: 'dishwasher', wall: A, width: 600 }, () => K.addKitchenModuleTo(p, HW, 'dishwasher', { wall: A, width: 600 }));
call('kitchen.add_module', { card: 'dishwasher', wall: A, width: 450 }, () => K.addKitchenModuleTo(p, HW, 'dishwasher', { wall: A, width: 450 }));
call('kitchen.add_module', { card: 'upper-hood', wall: A, pos: 600, width: 600 }, () => K.addKitchenModuleTo(p, HW, 'upper-hood', { wall: A, pos: 600, width: 600 }));
call('kitchen.add_module', { card: 'upper-shelves', wall: A, width: 600 }, () => K.addKitchenModuleTo(p, HW, 'upper-shelves', { wall: A, width: 600 }));
call('kitchen.add_module', { card: 'upper-dish', wall: A, width: 800 }, () => K.addKitchenModuleTo(p, HW, 'upper-dish', { wall: A, width: 800 }));
call('kitchen.add_module', { card: 'upper-dish', wall: A, width: 600 }, () => K.addKitchenModuleTo(p, HW, 'upper-dish', { wall: A, width: 600 }));
call('kitchen.add_module', { card: 'upper-shelves', wall: A, width: 600 }, () => K.addKitchenModuleTo(p, HW, 'upper-shelves', { wall: A, width: 600 }));
snapshot('Прямая кухня 3200');
// Ход 3: «Фасады белые, корпус светло-серый»
call('kitchen.set_material', { role: 'facade', code: 'W1000' }, () => K.setKitchenMaterial(p, HW, 'facade', 'W1000'));
call('kitchen.set_material', { role: 'corpus', code: 'U708' }, () => K.setKitchenMaterial(p, HW, 'corpus', 'U708'));
snapshot('Материалы');
// Ход 4: «Давайте Г-образную: слева есть ещё стена 2,4 м. Холодильник — туда, в угол — угловой шкаф»
call('kitchen.set_type', { type: 'l' }, () => K.setKitchenType(p, HW, 'l'));
call('kitchen.set_room', { depth: 2400 }, () => K.setKitchenRoom(p, HW, 'depth', 2400));
console.log('walls', JSON.stringify(K.kitchenWalls(p, HW)));
const B = K.kitchenWalls(p, HW).map((w: any) => w.id).find((w: string) => w !== A);
call('kitchen.update_module', { id: 'm1', wall: B, pos: 1800 }, () => K.updateKitchenModule(p, HW, 'm1', { wall: B, pos: 1800 }));
call('kitchen.add_module', { card: 'lower-corner-direct', wall: B }, () => K.addKitchenModuleTo(p, HW, 'lower-corner-direct', { wall: B }));
call('kitchen.add_module', { card: 'lower-drawers', wall: B, width: 600 }, () => K.addKitchenModuleTo(p, HW, 'lower-drawers', { wall: B, width: 600 }));
call('kitchen.add_module', { card: 'lower-drawers', wall: B, width: 400 }, () => K.addKitchenModuleTo(p, HW, 'lower-drawers', { wall: B, width: 400 }));
console.log('PLAN', JSON.stringify(K.kitchenPlan(p, HW).modules.map((m:any)=>[m.id,m.name,m.wall,m.body,m.zone])));
snapshot('Г-образная');
// Ход 5: «Сделайте стену 2 метра» — движок откажет, модули не помещаются.
call('kitchen.set_room', { width: 2000 }, () => K.setKitchenRoom(p, HW, 'width', 2000));
writeFileSync(`${OUT}/dialog-log.json`, JSON.stringify(log, null, 2));
