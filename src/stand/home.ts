// Другая мебель (HOME) на стенде: правки договора (EXCHANGE_SPEC.md §4.3) и команды редактора — методами
// createHomeEditor ядра modulero-next (home/edit.ts) с проверкой validate; сводка «в объёме экрана».
// Стенд ничего не считает: размеры, состав, отказы и цена — ответы ядра.
import { homeIds, runCommand, type CommandsFile } from './commands.ts';
import type { Core } from './engine.ts';
import type { Edit, EditResult } from './kitchen.ts';
import { TERMS } from './kitchen.ts';
import { groupGeometry, type Geometry } from './geometry.ts';
import { scene3dOf, type Scene3dView } from './scene3d.ts';

export type HomeProject = Record<string, any>;

/** Правка §4.3 — та же команда редактора HOME, что и в editor_call (параметры по именам ядра). */
export function applyHomeEdit(c: Core, file: CommandsFile, p: HomeProject, e: Edit): EditResult {
  const call = (command: string, args: Record<string, unknown>) => runCommand(c, file, 'home', p, `home/${command}`, JSON.stringify(args));
  switch (e.op) {
    case 'resize':
      return call('resize', { axis: e.axis, value: e.value, bodyId: e.body_id });
    case 'add_shelf':
      return call('addShelf', { bodyId: e.body_id, lo: e.lo, hi: e.hi, y: e.y });
    case 'add_door':
      return call('addDoor', { bodyId: e.body_id, lo: e.lo, hi: e.hi, hinge: e.hinge });
    case 'add_drawer':
      return call('addDrawer', { bodyId: e.body_id, lo: e.lo, hi: e.hi, y: e.y, h: e.h });
    case 'add_partition':
      return call('addPartition', { bodyId: e.body_id, x: e.x });
    case 'remove':
      return call('remove', { bodyId: e.body_id, elementId: e.element_id });
    case 'equal_shelves':
      // Без границ — весь корпус, как кнопка редактора (left … right).
      return call('equalShelves', { bodyId: e.body_id, lo: e.lo ?? 'left', hi: e.hi ?? 'right', count: e.count });
    case 'set_material':
      return call('applyMaterial', { materialId: e.material_id });
    case 'set_base':
      return call('setBase', { bodyId: e.body_id, kind: e.kind, heightMm: e.height });
    case 'set_back':
      return call('setBack', { bodyId: e.body_id, back: e.back });
    case 'set_handle':
      return call('setHandle', { handleId: e.handle_id });
    case 'set_kit_level':
      return call('setKitLevel', { level: e.level });
    default:
      throw new Error(`Нет правки другой мебели «${e.op}».`);
  }
}

/** Заготовка редактора HOME: комод, тумба, стеллаж… или «Своя конструкция» (own). */
export function startHome(c: Core, template: string | null): EditResult {
  const id = template ?? 'own';
  if (!c.H.templates.some((t: any) => t.id === id)) return { ok: false, problem: `Заготовки «${id}» нет. Есть: ${c.H.templates.map((t: any) => t.id).join(', ')}.` };
  return { ok: true, project: c.H.createHomeEditor(c.HW, homeIds(null)).create(id) };
}

export interface HomeView {
  revision: string;
  state: Record<string, unknown>;
  price: Record<string, unknown>;
  warnings: string[];
  previewSvg: string | null;
  scene3d: Scene3dView;
}

const BASE_RU: Record<string, string> = { pads: 'подпятники', plinth: 'цоколь', legs: 'ножки' };
const BACK_RU: Record<string, string> = { board: 'ЛДСП', hdf: 'ХДФ', none: 'без задней стенки' };

/** Граф, версия, сводка, цена другой мебели — всё из ядра. */
export function homeView(c: Core, p: HomeProject): HomeView {
  const { H, HW } = c;
  const graph = H.homeEngineGraph(p, HW),
    pr = H.price(p, HW),
    names: Record<string, string> = H.rateNamesOf(p),
    handle = H.homeHandle(p, HW),
    material = H.materials.find((m: any) => m.id === p.material),
    scene3d = scene3dOf(c, graph);
  const bodies = p.bodies.map((b: any) => ({
    id: b.id,
    kind: b.kind === 'desk' ? 'стол' : 'корпус',
    x: b.x,
    width: b.w,
    height: b.h,
    depth: b.d,
    base: b.base ? { kind: BASE_RU[b.base.kind] ?? b.base.kind, height: b.base.heightMm ?? null } : null,
    back: b.back === false ? BACK_RU.none : (BACK_RU[b.backMaterial] ?? b.backMaterial),
    bays: b.bayIds,
    partitions: b.partitions.map((x: any) => ({ id: x.id, x: x.x })),
    shelves: b.shelves.map((s: any) => ({ id: s.id, lo: s.lo, hi: s.hi, y: s.y, fixed: !!s.fixed })),
    doors: b.doors.map((d: any) => ({ id: d.id, lo: d.lo, hi: d.hi, y: d.y, h: d.h, hinge: d.hinge })),
    drawers: b.drawers.map((d: any) => ({ id: d.id, lo: d.lo, hi: d.hi, y: d.y, h: d.h })),
    // Высоты деталей корпуса от пола — из 3D-сцены ядра (geometry.ts); id — элемента редактора (полка, дверь, ящик).
    geometry: homeGeometry(scene3d.scene, b),
  }));
  const state = {
    kind: 'home',
    template: p.templateId,
    name: p.name,
    material: material?.name ?? p.material,
    facade: p.facadeChoice ? H.homeFacadeTitle(p.facadeChoice) : null,
    floor: p.floor === 'carpet' ? 'ковёр' : 'твёрдый пол',
    kit_level: p.kitLevel,
    handle: handle ? handle.name : 'без ручек',
    bodies,
    parts: graph.parts.length,
  };
  // Полоса цены редактора HOME: итог, статус, чего не хватает — без ставок, себестоимости и условий мебельщика.
  const missingAll = (pr.missing as string[]).map((k) => names[k] ?? k);
  const missing = missingAll.filter((m) => !TERMS.test(m));
  const price = {
    status: pr.status,
    amount_rub: pr.status === 'PARTIAL' ? null : pr.total,
    known_amount_rub: null,
    currency: 'RUB',
    missing,
    terms_hidden: missingAll.length - missing.length,
  };
  const warnings: string[] = [...new Set<string>(H.issues(p, HW).map((x: any) => x.text))];
  return { revision: graph.revision.projectRevisionId, state, price, warnings, previewSvg: c.previewSvg(graph), scene3d };
}

/** Геометрия корпуса HOME: детали корпуса и его отсеков; ящик — по id ящика редактора (inputRef детали). */
function homeGeometry(scene: any, b: any): Geometry {
  const drawers = new Set<string>(b.drawers.map((d: any) => d.id));
  return groupGeometry(scene, {
    own: (p) => p.assemblyId === b.id || p.assemblyId.startsWith(b.id + ':'),
    drawerOf: (p) => (drawers.has(p.inputRef) ? p.inputRef : null),
    idOf: (p) => p.inputRef ?? p.id.slice(b.id.length + 1),
  });
}

/** Справочники get_options другой мебели: заготовки, материалы, ручки, уровни комплектации — без цен. */
export function homeOptions(c: Core, topic: string): unknown {
  const { H, HW } = c;
  switch (topic) {
    case 'home_templates':
      return H.templates.map((t: any) => ({ id: t.id, name: t.name, room: t.room, description: t.description, size: t.bodies[0] && { w: t.bodies[0].w, h: t.bodies[0].h, d: t.bodies[0].d } }));
    case 'decors':
      return H.materials.map((m: any) => ({ id: m.id, name: m.name }));
    case 'handles':
      // Ручки выпуска каталога — те же, что у шкафа (validate HOME сверяет handleId с hw.fittings.handles); NONE — без ручек.
      return c.W.fittingsOptions(HW.fittings).handles.map((h: any) => ({ id: h.id, name: h.name }));
    case 'hardware_levels':
      return [
        { id: 'economy', name: 'Эконом' },
        { id: 'standard', name: 'Стандарт' },
        { id: 'premium', name: 'Премиум' },
      ];
    default:
      return null;
  }
}
