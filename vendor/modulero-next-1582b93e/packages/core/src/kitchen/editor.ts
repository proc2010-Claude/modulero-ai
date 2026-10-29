// Edits of the kitchen for the editor on the graph (task U4, MIGRATION_PLAN step 5.4): the room, the type of the
// kitchen, the modules of the palette, their place and size, the examples. Each edit takes a KitchenProject and returns
// a new one with the prototype's message; the module is made and checked by the one path of K3/K4 (makeKitchenModule,
// validateKitchenModule), the graph is built by engine/generators/kitchen.ts. The texts and the order of the checks
// are the prototype's (setRoom, setType, tryUpdate, delete-item, r1.html:69350–69500); what the editor decides on
// its own is marked (Д) and recorded in FINDINGS 580–589.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Rec } from '../engine/policy/project-state.js';
import { catalogCutout, cutoutError, cutoutFamily, FRONT_CARCASS_GAP, overlaySink, withoutPrototypeWorktopDepth } from './carcass.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { kitchenCostStatusText } from './exports.js';
import { addKitchenModule, alignSingleCorner, applianceForWidth, cardWidthsHint, collisionRects, cornerRowSegments, kitchenExample, KITCHEN_EXAMPLES, kitchenPlacementVerdict, makeKitchenModule, seatMezzanine, validateKitchenModule, withCutout, type KitchenCutout } from './modules.js';
import { kitchenProjectFromRecord, type KitchenProject } from './project.js';
import { activeWalls, canonicalWall, cornerChoices, isFree, isLegacyCorner, isSingleCorner, moduleWorldStart, planRects, wallLength, type KitchenScene } from './room.js';
import { kitchenRateSettings } from './cost.js';
import { KIND_INFO, KITCHEN_CARDS, KITCHEN_GROUPS } from './standard.js';
import { sceneTopology } from './worktops.js';
import start from './start.data.json' with { type: 'json' };

/**
 * Copy of the project of reference/kitchen-input/fixtures/fixture_island.json (sha256 16b0726f…): the new kitchen of
 * the prototype — the example «Остров» left it as it was (0 modules, the room and the type not confirmed; FINDINGS 580).
 */
export const NEW_KITCHEN_SOURCE = 'reference/kitchen-input/fixtures/fixture_island.json';

/** An accepted edit: the new project, the prototype's message, the module to select; or the refusal with its words. */
export type KitchenEdit = { ok: true; project: KitchenProject; notice?: string; selected?: string | null } | { ok: false; problem: string };

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const no = (problem: string): KitchenEdit => ({ ok: false, problem });

/** The new kitchen of the editor: the prototype's new kitchen (ABC walls, 3000 × 2600 × 2500, not confirmed). */
export function newKitchenProject(): KitchenProject {
  return kitchenProjectFromRecord(clone(start));
}

/** What the calculation reads: the project with the hardware release of the calculation (never saved, CAT-1). */
export function kitchenSceneOf(p: KitchenProject, hw: HardwareCatalogs): KitchenScene {
  const c = clone(p) as unknown as Rec;
  // MOD-DEC-565: the worktop depth of a sink or hob cabinet of an earlier project is the prototype's 620, read as unset;
  // a kitchen whose worktop depth is set on «Материалы и опции» chose its 620 (R4-006, FINDINGS 1903).
  return { ...c, modules: c.kitchenOptions?.worktopDepthMm ? (c.modules ?? []) : withoutPrototypeWorktopDepth(c.modules ?? []), obstacles: c.obstacles || [], proposed: c.proposed || {}, hardware: hw } as KitchenScene;
}

/** The project of a scene: the hardware release is not a part of it (KITCHEN_PROJECT_KEYS). */
export function kitchenProjectOfScene(s: KitchenScene): KitchenProject {
  const { hardware: _, ...record } = s as unknown as Rec;
  return kitchenProjectFromRecord(clone(record));
}

/**
 * The first module of the scene that may not stand as it is, with the words of its check (sceneError, r1.html:67798).
 * MOD-AI-11 (FINDINGS 3110): the placement of every module in the room and among the others is asked first, then the
 * whole check — so a module out of a narrowed wall is named itself, not the neighbour whose plinth of the run reaches
 * under it; the text names the module unless its words name it already. The prototype checked module by module.
 */
export function kitchenSceneError(s: KitchenScene): string | null {
  const named = (m: Rec, text: string) => (new RegExp(`\\b${m.id}\\b`).test(text) ? text : `«${m.name}» (${m.id}): ${text}`);
  for (const m of s.modules) {
    const v = kitchenPlacementVerdict(s, m, m.id);
    if (v && !v.ok) return named(m, v.text);
  }
  for (const m of s.modules) {
    const v = validateKitchenModule(s, m, m.id);
    if (!v.ok) return named(m, v.text);
  }
  return null;
}

/**
 * The worktop of a new kitchen (MOD-DEC-565): its depth and how far it overhangs a front of a base cabinet of the
 * default depth — the rear edge is flush with the back of the carcass, the front 2 mm off the carcass, 18 mm thick.
 */
export function kitchenWorktopDefaults(): { depthMm: number; overhangMm: number } {
  const K = kitchen.constants;
  return { depthMm: K.worktopDepth.value, overhangMm: K.worktopDepth.value - K.baseDepth.value - FRONT_CARCASS_GAP - K.frontThickness.value };
}

// ---------------------------------------------------------------- the room and the type

/**
 * The room fields: whole millimetres (setRoom, r1.html:69396). The prototype took 600…4000 for each; a wall of a kitchen
 * may be up to 8000 long and deep, the height stays at most 4000 (MOD-DEC-746, MOD-AI-12, FINDINGS 3180).
 */
export const KITCHEN_ROOM_LIMITS = { min: 600, max: 8000, heightMax: 4000 } as const;

export type KitchenType = 'straight' | 'l' | 'u';
export const KITCHEN_TYPES: readonly [KitchenType, string][] = [
  ['straight', 'Прямая'],
  ['l', 'Г-образная'],
  ['u', 'П-образная'],
];
/** «Ширина новых модулей, мм» of the prototype (default-width, r1.html:68916). */
export const KITCHEN_DEFAULT_WIDTHS = [400, 450, 500, 600, 700, 800] as const;

/** A change of the room, the type or the corner of the kitchen: the corners are bound again, every module is checked. */
function sceneChange(p: KitchenProject, hw: HardwareCatalogs, change: (s: Rec) => void, refused: string, notice: string): KitchenEdit {
  if (p.modules.some(isLegacyCorner)) return no('LEGACY_CORNER_VERSION: сохранённая пара доступна только для чтения.');
  const s = kitchenSceneOf(p, hw) as unknown as Rec;
  change(s);
  s.modules = (s.modules as Rec[]).map((m) => (isSingleCorner(m) ? alignSingleCorner(s as unknown as KitchenScene, m) : m));
  const error = kitchenSceneError(s as unknown as KitchenScene);
  return error ? no(refused + error) : { ok: true, project: kitchenProjectOfScene(s as unknown as KitchenScene), notice };
}

/** A size of the room (setRoom, r1.html:69396): the room is confirmed by it; refused when a module no longer fits. */
export function setKitchenRoom(p: KitchenProject, hw: HardwareCatalogs, key: 'width' | 'depth' | 'height', value: number): KitchenEdit {
  const L = KITCHEN_ROOM_LIMITS,
    max = key === 'height' ? L.heightMax : L.max;
  if (!Number.isInteger(value) || value < L.min || value > max)
    return no(`${key === 'height' ? 'Высота помещения' : key === 'width' ? 'Длина стены' : 'Глубина помещения'}: целое число от ${L.min} до ${max} мм; пустое поле не равно нулю.`);
  if (p.modules.some(isLegacyCorner)) return no('LEGACY_CORNER_VERSION: размеры помещения с сохранённой парой доступны только для чтения.');
  return sceneChange(
    p,
    hw,
    (s) => {
      s.room[key] = value;
      s.roomConfirmed = true;
    },
    'Изменение помещения отклонено: ',
    'Размер помещения изменён; угловые корпуса сохранили привязку к выбранному углу.',
  );
}

/** «Готово · свернуть помещение» (finish-room, r1.html:69459). */
export function confirmKitchenRoom(p: KitchenProject): KitchenEdit {
  return { ok: true, project: { ...clone(p), roomConfirmed: true }, notice: 'Помещение подтверждено.' };
}

/** The type of the kitchen (setType, r1.html:69416): confirmed by the choice; a U kitchen is «left». */
export function setKitchenType(p: KitchenProject, hw: HardwareCatalogs, type: KitchenType): KitchenEdit {
  if (!KITCHEN_TYPES.some(([t]) => t === type)) return no('Тип кухни: прямая, Г-образная или П-образная.');
  if (p.type === type && p.typeConfirmed) return { ok: true, project: p };
  if (p.modules.some(isLegacyCorner)) return no('LEGACY_CORNER_VERSION: тип кухни с сохранённой парой доступен только для чтения.');
  return sceneChange(
    p,
    hw,
    (s) => {
      s.type = type;
      s.typeConfirmed = true;
      if (type === 'u') s.orientation = 'left';
    },
    'Тип кухни не изменён: ',
    'Тип кухни изменён; угловые корпуса привязаны к реальным внутренним углам.',
  );
}

/** The side of the corner of an L kitchen (room-orientation, r1.html:69565). */
export function setKitchenOrientation(p: KitchenProject, hw: HardwareCatalogs, orientation: 'left' | 'right'): KitchenEdit {
  if (p.modules.some(isLegacyCorner)) return no('LEGACY_CORNER_VERSION: ориентация сохранённой пары доступна только для чтения.');
  return sceneChange(
    p,
    hw,
    (s) => {
      s.orientation = orientation;
    },
    'Угол не изменён: ',
    'Ориентация Г изменена; угловые корпуса отражены вокруг реального примыкания.',
  );
}

/** «Остров» (island-toggle, r1.html:69513): off only without island and peninsula modules. */
export function setKitchenIsland(p: KitchenProject, on: boolean): KitchenEdit {
  if (!on && p.modules.some((m) => m.zone === 'island' || m.zone === 'peninsula')) return no('Сначала перенесите или удалите островные/полуостровные модули. Они не исчезнут автоматически.');
  return { ok: true, project: { ...clone(p), islandEnabled: on }, notice: on ? 'Остров включён.' : 'Остров выключен.' };
}

/**
 * The cards of their own width, which «Ширина новых модулей» does not change (R6-006, FINDINGS 2928): the oven, the
 * bottle and the niches of the appliances by their card; the corners take the width of their corner.
 */
export function kitchenOwnWidthNote(): string {
  const own = Object.values(KITCHEN_CARDS).filter((c) => c.width && !c.corner),
    names = own.map((c) => `${c.name} — ${c.width}`);
  return `Не относится к модулям своей ширины: ${names.join(', ')} мм; угловые шкафы — по ширине угла.`;
}

/** «Ширина новых модулей» (default-width, r1.html:69529): the next ordinary modules; the existing ones stay. */
export function setKitchenDefaultWidth(p: KitchenProject, width: number): KitchenEdit {
  if (!(KITCHEN_DEFAULT_WIDTHS as readonly number[]).includes(width)) return no(`Ширина новых модулей: ${KITCHEN_DEFAULT_WIDTHS.join(', ')} мм.`);
  return { ok: true, project: { ...clone(p), defaultWidth: width }, notice: 'Новая ширина будет у следующих обычных модулей; существующие не изменены.' };
}

/** The walls of the kitchen the palette may use, with their names (wall-select, r1.html:69575). */
export function kitchenWalls(p: KitchenProject, hw: HardwareCatalogs): { id: string; name: string; lengthMm: number }[] {
  const s = kitchenSceneOf(p, hw);
  return activeWalls(s).map((w) => ({ id: w, name: canonicalWall(s, w), lengthMm: wallLength(s, w) }));
}

// ---------------------------------------------------------------- the plan

/** A rectangle of the plan, mm: x along wall A from the left of the room, y from wall A into the room. */
export interface KitchenPlanRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The top view of the kitchen for the editor: the room, the walls in use, the modules with their plan rectangles. */
export interface KitchenPlan {
  room: { width: number; depth: number; height: number };
  walls: { id: string; name: string; lengthMm: number; line: [number, number, number, number] }[];
  modules: { id: string; name: string; kind: string; wall: string | null; free: boolean; floor: number; height: number; body: KitchenPlanRect[]; zone: KitchenPlanRect[] }[];
}

/**
 * The plan of the prototype's top view (planRects, collisionRects): wall A is the back of the room, B the left (the
 * right of a right L kitchen), C the right. `body` is the cabinet, `zone` what the module also keeps free (the filler
 * and the reserve of a corner, the end panel of a niche).
 */
export function kitchenPlan(p: KitchenProject, hw: HardwareCatalogs): KitchenPlan {
  const s = kitchenSceneOf(p, hw),
    { width: W, depth: D, height: H } = s.room,
    rightB = s.type === 'l' && s.orientation === 'right',
    line = (w: string): [number, number, number, number] => (w === 'A' ? [0, 0, W, 0] : w === 'B' && !rightB ? [0, 0, 0, D] : [W, 0, W, D]);
  const same = (a: KitchenPlanRect, b: KitchenPlanRect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  return {
    room: { width: W, depth: D, height: H },
    walls: activeWalls(s).map((w) => ({ id: w, name: canonicalWall(s, w), lengthMm: wallLength(s, w), line: line(w) })),
    modules: s.modules.map((m) => {
      const body = isSingleCorner(m) ? collisionRects(s, m).slice(0, 1) : planRects(s, m);
      return {
        id: m.id,
        name: m.name ?? m.catalogId,
        kind: m.kind,
        wall: isFree(m) ? null : (m.wall ?? null),
        free: isFree(m),
        floor: m.floor,
        height: m.height,
        body,
        zone: collisionRects(s, m).filter((r) => !body.some((b) => same(b, r))),
      };
    }),
  };
}

// ---------------------------------------------------------------- modules

const FILLER_HINT = 'Полоса плиты в линию фасадов: закрывает щель между модулями, у стены или у углового шкафа на соседней стене. Ширина — по щели.';

/** The palette of the prototype: the groups of cards (MOD-DEC-222) and the accessible L corners (r1.html:67287). */
export const KITCHEN_PALETTE: readonly { id: string; name: string; cards: { id: string; name: string; kind: string; hint?: string; requiresSupport?: boolean }[] }[] = [
  // MOD-AI-14 (FINDINGS 3105): the filler closes the lower row — a gap between modules, at a wall or at a corner cabinet.
  ...KITCHEN_GROUPS.map((g) => ({ id: g.id, name: g.name, cards: [...g.items.map(([id]) => card(id)), ...(g.id === 'lower' ? [{ ...card('filler'), hint: FILLER_HINT }] : [])] })),
  { id: 'corners', name: 'Доступные углы', cards: Object.values(KITCHEN_CARDS).filter((c) => c.id !== 'filler' && !KITCHEN_GROUPS.some((g) => g.items.some(([id]) => id === c.id))).map((c) => card(c.id)) },
];

function card(id: string) {
  const c = KITCHEN_CARDS[id]!;
  return { id, name: c.name as string, kind: c.kind as string, ...(c.hint ? { hint: c.hint as string } : {}), ...(c.requiresSupport ? { requiresSupport: true } : {}) };
}

/**
 * Places along the wall a new module may take, in order along the wall (Д, FINDINGS 581): the start of the wall,
 * the ends of the plan rectangles of the other modules on either side, the end of the wall. The prototype placed a
 * module by dragging it onto the plan or by the exact input of the dialog; here a click on a card takes the first
 * place the one check accepts. A module whose plan reaches past its width (the 18 mm end panels of a dishwasher or
 * washer niche without a neighbour, kcr r1.html:76169) is also tried that far from the wall and from the others
 * (`margins`, FINDINGS 1267).
 */
function placesAlong(s: KitchenScene, wall: string, width: number, margins: number[] = []): number[] {
  const L = wallLength(s, wall),
    rightL = wall === 'A' && s.type === 'l' && s.orientation === 'right',
    along = (r: { x: number; y: number; w: number; h: number }) => (wall === 'A' ? [r.x, r.x + r.w] : [r.y, r.y + r.h]),
    shifts = [0, ...margins],
    world = new Set<number>(shifts.flatMap((d) => [d, L - width - d]));
  for (const o of s.modules)
    for (const r of collisionRects(s, o)) {
      const [a, b] = along(r) as [number, number];
      for (const d of shifts) {
        world.add(b + d);
        world.add(a - width - d);
      }
    }
  return [...world]
    .filter((x) => Number.isFinite(x) && x >= 0 && x + width <= L)
    .sort((a, b) => a - b)
    .map((x) => (rightL ? L - x - width : x));
}

/** How far the plan of a new module reaches past its width at either end along its wall, alone on the wall (FINDINGS 1267). */
function reach(s: KitchenScene, cardId: string, ctx: Rec, width: number): number[] {
  const alone = { ...s, modules: [] } as unknown as KitchenScene,
    m = addKitchenModule(alone, cardId, ctx, { pos: 0, width }).draft,
    start = moduleWorldStart(alone, m),
    spans = collisionRects(alone, m).map((r) => (m.wall === 'A' ? [r.x, r.x + r.w] : [r.y, r.y + r.h]) as [number, number]);
  if (!spans.length) return [];
  const lead = start - Math.min(...spans.map(([a]) => a)),
    trail = Math.max(...spans.map(([, b]) => b)) - (start + width);
  return [lead, trail].filter((d) => Number.isFinite(d) && d > 0);
}

/**
 * A module of a palette card (the card and addDraft, r1.html:69334): on the given wall at the given place, or at the
 * first free place along the wall (placesAlong); a mezzanine over the first tall cabinet without one (Д). The new
 * module is selected.
 */
export function addKitchenModuleTo(p: KitchenProject, hw: HardwareCatalogs, cardId: string, place: { wall?: string; pos?: number; width?: number; cutout?: KitchenCutout | null } = {}): KitchenEdit {
  const c = KITCHEN_CARDS[cardId];
  if (!c) return no(`Нет карточки модуля «${cardId}».`);
  const s = kitchenSceneOf(p, hw),
    S = s as unknown as Rec;
  if (!s.roomConfirmed || !S.typeConfirmed) return no('Сначала подтвердите размеры помещения и явно выберите тип кухни.');
  const supportId = c.requiresSupport ? (s.modules.find((m) => m.kind === 'tall' && !s.modules.some((x) => x.supportId === m.id))?.id ?? null) : null;
  if (c.requiresSupport && !supportId) return no('Антресоль ставится над пеналом: сначала добавьте пенал без антресоли.');
  const ctx = { wall: place.wall ?? (activeWalls(s).includes(S.wall) ? S.wall : 'A'), width: place.width ?? null, supportId, cutout: place.cutout ?? null };
  if (ctx.cutout) {
    // MOD-DEC-412: the cutout of the user's appliance, checked on the module of the card before its place is sought.
    const draft = makeKitchenModule(s, cardId, { ...ctx, cutout: null }),
      err = cutoutError({ ...draft, width: place.width ?? draft.width }, ctx.cutout);
    if (err) return no(err);
  }
  const done = (r: ReturnType<typeof addKitchenModule>): KitchenEdit => ({ ok: true, project: kitchenProjectOfScene(r.scene), notice: `${r.module!.name} добавлен. ${r.text}`, selected: r.module!.id });
  // A free module (island), a corner bound to its corner and a mezzanine over its cabinet have their place already.
  if (c.kind === 'island' || c.corner === 'direct' || c.requiresSupport || place.pos !== undefined) {
    const r = addKitchenModule(s, cardId, ctx, place.pos !== undefined ? { pos: place.pos } : {});
    return r.ok ? done(r) : no(r.text);
  }
  const width = (place.width ?? c.width ?? S.defaultWidth ?? 600) as number;
  let last = '';
  for (const pos of placesAlong(s, ctx.wall, width, reach(s, cardId, ctx, width))) {
    const r = addKitchenModule(s, cardId, ctx, { pos });
    if (r.ok) return done(r);
    last = r.text;
  }
  // R6-006 (FINDINGS 2928): a card of its own width does not take «Ширина новых модулей» — said where it is refused.
  const own = place.width === undefined && c.width && S.defaultWidth && S.defaultWidth !== c.width ? ' (ширина своя у этой карточки, «Ширина новых модулей» к ней не относится)' : '';
  return no(`На стене ${canonicalWall(s, ctx.wall)} нет свободного места для «${c.name}» шириной ${width} мм${own}${last ? ': ' + last : '.'}`);
}

/** What the panel of a module changes (the prop-* fields of the prototype, r1.html:69582). */
export interface KitchenModulePatch {
  wall?: string;
  pos?: number;
  width?: number;
  depth?: number;
  height?: number;
  floor?: number;
  x?: number;
  y?: number;
  rotation?: number;
}

/** A change of a module (tryUpdate, r1.html:69361): the module is checked in the kitchen as it would be. */
export function updateKitchenModule(p: KitchenProject, hw: HardwareCatalogs, id: string, patch: KitchenModulePatch): KitchenEdit {
  const s = kitchenSceneOf(p, hw),
    m = s.modules.find((x) => x.id === id);
  if (!m) return no(`Нет модуля ${id}.`);
  if (isLegacyCorner(m)) return no('LEGACY_CORNER_VERSION: сохранённая связанная пара доступна только для чтения. Новый шкаф добавьте отдельно.');
  if (isSingleCorner(m) && 'pos' in patch) return no('Угловой корпус привязан к выбранному углу; положение и глухая сторона выводятся из него.');
  for (const [k, v] of Object.entries(patch)) if (k !== 'wall' && !(typeof v === 'number' && Number.isFinite(v))) return no('Поле «' + k + '» пусто или некорректно. Исходные значения, ID, undo и ProjectRevision сохранены.');
  let next: Rec = { ...clone(m), ...patch };
  // MOD-DEC-565: a mezzanine moved along the wall or widened stands on the cabinets under it, unless its bottom is given.
  if (!('floor' in patch) && ('wall' in patch || 'pos' in patch || 'width' in patch)) next = seatMezzanine(s, next);
  if (isSingleCorner(next)) {
    if ('wall' in patch) next.room_corner_id = null;
    alignSingleCorner(s, next);
  }
  if (patch.height !== undefined && m.kind === 'upper') next.upperOverride = true;
  if (next.wall && next.zone !== 'island' && next.zone !== 'peninsula' && next.rotation !== 0) return no('Поворот пристенного модуля не поддержан: геометрия и проект сохранены.');
  if (m.kind === 'tall' && s.modules.some((x) => x.supportId === m.id) && (['wall', 'pos', 'width', 'height', 'floor'] as const).some((k) => k in patch)) return no('Сначала перенесите или удалите связанную антресоль. Опора не изменена.');
  // MOD-AI-58 (FINDINGS 3112): a cabinet of a card appliance takes the model of its new width; a refused width names the card's widths.
  if ('width' in patch) next = applianceForWidth(s, m, next);
  const v = validateKitchenModule(s, next, m.id);
  if (!v.ok) return no(v.text + ('width' in patch ? cardWidthsHint(m) : '') + ' Исходные значения сохранены.');
  const model = next.applianceModel !== m.applianceModel && next.applianceModel ? ` Техника — «${next.applianceModel}» под ширину ${next.width} мм.` : '';
  return { ok: true, project: kitchenProjectOfScene({ ...s, modules: s.modules.map((x) => (x.id === id ? next : x)) }), notice: 'Изменение сохранено. ' + v.text + model + gapsLeft(s, m, next), selected: id };
}

/**
 * The gaps a narrowed or moved module leaves at the neighbours of its row it stood against (MOD-AI-58, FINDINGS 3112):
 * the neighbours stay where they are, the words say where the gap is. The prototype said nothing.
 */
function gapsLeft(s: KitchenScene, before: Rec, after: Rec): string {
  if (isFree(before) || !before.wall || after.wall !== before.wall) return '';
  const row = (x: Rec) => KIND_INFO[x.kind]?.row,
    sameRow = (x: Rec) => row(x) === 'both' || row(before) === 'both' || row(x) === row(before),
    near = (a: number, b: number) => Math.abs(a - b) < 0.5,
    gaps: string[] = [];
  for (const o of s.modules) {
    if (o.id === before.id || isFree(o) || o.wall !== before.wall || !sameRow(o) || o.supportId === before.id) continue;
    if (near(o.pos, before.pos + before.width) && after.pos + after.width < o.pos) gaps.push(`${Math.round((o.pos - after.pos - after.width) * 10) / 10} мм до «${o.name}» (${o.id})`);
    if (near(o.pos + o.width, before.pos) && after.pos > o.pos + o.width) gaps.push(`${Math.round((after.pos - o.pos - o.width) * 10) / 10} мм после «${o.name}» (${o.id})`);
  }
  return gaps.length ? ` Соседи остались на месте: промежуток ${gaps.join(' и ')} — сдвиньте соседа, поставьте добор или модуль.` : '';
}

/**
 * Another card in the place of a module (MOD-AI-48, FINDINGS 3111): the module of the card stands on the same wall at
 * the same place — on the island at the same point and turn — with the same width when the card offers it (else the
 * card's own), keeps the id and is checked by the one path of a new module. Corners, mezzanines and a tall cabinet
 * carrying one are replaced by delete and add. The prototype had only delete and add.
 */
export function replaceKitchenModule(p: KitchenProject, hw: HardwareCatalogs, id: string, cardId: string): KitchenEdit {
  const c = KITCHEN_CARDS[cardId];
  if (!c) return no(`Нет карточки модуля «${cardId}».`);
  const s = kitchenSceneOf(p, hw),
    S = s as unknown as Rec,
    m = s.modules.find((x) => x.id === id);
  if (!m) return no(`Нет модуля ${id}.`);
  if (isLegacyCorner(m) || m.corner || c.corner) return no(`Угловой модуль на месте не заменяется: удалите «${m.name}» (${m.id}) и добавьте «${c.name}» к углу.`);
  if (m.supportId || c.requiresSupport) return no('Антресоль над пеналом на месте не заменяется: удалите её и добавьте другую над пеналом.');
  if (s.modules.some((x) => x.supportId === m.id)) return no('Сначала перенесите или удалите связанную антресоль. Модуль не заменён.');
  if (isFree(m) !== (c.kind === 'island')) return no(isFree(m) ? `«${m.name}» (${m.id}) стоит на острове: его заменяет только островной модуль.` : `«${c.name}» — островной модуль: пристенный «${m.name}» (${m.id}) им не заменяется.`);
  const width = Array.isArray(c.choices) ? (c.choices.includes(m.width) ? m.width : c.width) : (c.width ?? m.width),
    rest = { ...s, modules: s.modules.filter((x) => x.id !== id) } as KitchenScene,
    fields: Rec = isFree(m) ? { x: m.x, y: m.y, rotation: m.rotation } : { pos: m.pos },
    r = addKitchenModule(rest, cardId, { wall: m.wall ?? undefined, width, supportId: null }, fields);
  if (!r.ok) return no(`«${c.name}» на место «${m.name}» (${m.id}) не встаёт: ${r.text}${cardWidthsHint({ catalogId: cardId })} Модуль не заменён.`);
  const put = { ...r.module!, id };
  return {
    ok: true,
    project: kitchenProjectOfScene({ ...s, modules: s.modules.map((x) => (x.id === id ? put : x)), nextId: S.nextId } as KitchenScene),
    notice: `«${m.name}» заменён на «${c.name}»${width !== m.width ? ` шириной ${width} мм` : ''}. ${r.text}${gapsLeft(s, m, put)}`,
    selected: id,
  };
}

export type { KitchenCutout };

/** The cutout of a sink or a hob cabinet for its panel: the user's own, or the preliminary one of the catalogue's model. */
export interface KitchenCutoutView {
  family: 'sink' | 'hob';
  own: boolean;
  cutout: KitchenCutout;
}

/** The cutout of the module for the panel of the editor; null when the module takes no sink or hob (MOD-DEC-412). */
export function kitchenCutoutView(p: KitchenProject, hw: HardwareCatalogs, id: string): KitchenCutoutView | null {
  const m = kitchenSceneOf(p, hw).modules.find((x) => x.id === id),
    // MOD-DEC-753: the overlay sink has no cutout.
    family = m && !overlaySink(m) ? cutoutFamily(m) : null,
    c = m && family ? (m.cutout ?? catalogCutout(m)) : null;
  return m && family && c ? { family, own: !!m.cutout, cutout: { gas: false, ...c } } : null;
}

/**
 * The cutout of the user's own sink or hob by the instruction of the appliance (MOD-DEC-412, FINDINGS 3106): the cabinet
 * takes it in place of the model of the catalogue, the worktop is cut by it for production, and a hob cabinet may be
 * narrower than the 600 of the catalogue's hob. null takes the model of the card back.
 */
export function setKitchenCutout(p: KitchenProject, hw: HardwareCatalogs, id: string, cutout: KitchenCutout | null): KitchenEdit {
  const s = kitchenSceneOf(p, hw),
    m = s.modules.find((x) => x.id === id);
  if (!m) return no(`Нет модуля ${id}.`);
  if (!cutoutFamily(m)) return no(`Вырез по инструкции прибора вводится у шкафа под мойку или варочную панель; «${m.name}» (${m.id}) — не такой шкаф.`);
  if (overlaySink(m)) return no(`У «${m.name}» (${m.id}) мойка накладная: она ложится на корпус без выреза. Для врезной мойки выберите «Монтаж мойки: врезная» в «Наполнении». Вырез не изменён.`);
  if (cutout) {
    const err = cutoutError(m, cutout);
    if (err) return no(err + ' Вырез не изменён.');
  } else if (!m.cutout) return no(`У «${m.name}» (${m.id}) нет своего выреза.`);
  const next = withCutout(clone(m), cutout),
    v = validateKitchenModule(s, next, m.id);
  if (!v.ok) return no(v.text + (cutout ? ' Вырез не изменён.' : ' Свой вырез сохранён.'));
  const what = cutoutFamily(m) === 'sink' ? 'мойки' : 'варочной панели';
  return {
    ok: true,
    project: kitchenProjectOfScene({ ...s, modules: s.modules.map((x) => (x.id === id ? next : x)) }),
    notice: cutout
      ? `Вырез ${what} ${cutout.width} × ${cutout.depth} мм, радиус ${cutout.radius} мм — по инструкции прибора; идёт в производство.`
      : `Свой вырез снят: снова ${next.applianceModel} из каталога.`,
    selected: id,
  };
}

/** Removes a module with the mezzanines over it (delete-item, r1.html:69492); refused when the worktops would not close. */
export function removeKitchenModule(p: KitchenProject, hw: HardwareCatalogs, id: string): KitchenEdit {
  const s = kitchenSceneOf(p, hw),
    m = s.modules.find((x) => x.id === id);
  if (!m) return no(`Нет модуля ${id}.`);
  if (isLegacyCorner(m)) return no('LEGACY_CORNER_VERSION: сохранённая пара только для чтения.');
  const children = s.modules.filter((x) => x.supportId === m.id),
    remaining = s.modules.filter((x) => x.id !== m.id && !children.includes(x)).map((x) => (x.pairId === m.id ? { ...x, pairId: null } : x)),
    topology = sceneTopology({ ...s, modules: remaining });
  if (topology.issues.length) return no('Удаление отклонено: ' + topology.issues[0]!.text + ' Исходный проект сохранён.');
  return {
    ok: true,
    project: kitchenProjectOfScene({ ...s, modules: remaining }),
    notice: children.length ? `Пенал и ${children.length} связанная антресоль удалены одним действием. Undo восстановит связь.` : `${m.name} удалён.`,
    selected: null,
  };
}

// ---------------------------------------------------------------- dragging on the plan

// The owner (2026-10-23): modules are dragged with the mouse in the first release, as in r1. A card of the palette
// is dragged onto the plan (palettePointerDown…palettePointerUp, r1.html:69044–69152), a module along its wall or,
// on the island, anywhere (pointerDown…pointerUp, r1.html:69165–69240). The place is the prototype's: the nearest
// wall within 150 mm of the depth of the module, the start snapped to 25 mm of the edges of the wall and of the
// neighbours (snap, closestPlacement, r1.html:68955–69042); the check is the one check of K3/K4. The screen asks
// for the quick preview while the pointer moves (the placement in the plan), for the whole check when it rests, and
// commits on release with the whole check.

/** What a dragged module would be at the pointer: the module, whether it may stand there and why, its plan rectangles. */
export interface KitchenDragPreview {
  module: Rec | null;
  ok: boolean;
  text: string;
  /** «привязка к границе» when the start was snapped (the prototype's words). */
  hint: string;
  rects: KitchenPlanRect[];
  /**
   * false: only the placement in the plan is checked (`quick`, kitchenPlacementVerdict) and it passed, the whole check
   * of K3/K4 is still to be done; a refusal and a preview without `quick` are the whole check.
   */
  checked: boolean;
  /** The module of the card before it is placed: given back to the next preview of the same drag, it is not made again. */
  draft?: Rec | null;
}

const heightsOverlap = (a: Rec, b: Rec) => a.floor < b.floor + b.height && b.floor < a.floor + a.height;
/** The stored start along the wall of a world start: the right L kitchen stores wall A from the right (r1.html:67873). */
const storedPosAtWorld = (s: KitchenScene, m: Rec, start: number) => (m.wall === 'A' && !isSingleCorner(m) && s.type === 'l' && s.orientation === 'right' ? wallLength(s, 'A') - start - m.width : start);

/** snap (r1.html:68955): the corner to its corner, a wall module to an edge of the wall or of a neighbour within 25 mm. */
function snapModule(s: KitchenScene, m: Rec): { candidate: Rec; hint: string } {
  if (isSingleCorner(m)) return { candidate: alignSingleCorner(s, m), hint: 'привязка к выбранному внутреннему углу' };
  if (isFree(m)) return { candidate: m, hint: '' };
  const options = [0, wallLength(s, m.wall) - m.width];
  for (const n of s.modules) {
    if (n.id === m.id || !heightsOverlap(n, m)) continue;
    const intervals = isSingleCorner(n)
      ? cornerRowSegments(s, n, m.wall).map((x) => ({ pos: x.pos_mm as number, end: (x.pos_mm as number) + (x.width_mm as number) }))
      : n.wall === m.wall
        ? [{ pos: moduleWorldStart(s, n), end: moduleWorldStart(s, n) + n.width }]
        : [];
    for (const i of intervals) options.push(i.end, i.pos - m.width);
  }
  let world = moduleWorldStart(s, m),
    hint = '';
  for (const v of options)
    if (Math.abs(v - world) < 25) {
      world = v;
      hint = 'привязка к границе';
      break;
    }
  return { candidate: { ...m, pos: Math.round(storedPosAtWorld(s, m, world)) }, hint };
}

/** closestPlacement (r1.html:68988): the module at the point of the plan — on its tall cabinet, on the island, at the nearest wall. */
function closestPlacement(s: KitchenScene, p: { x: number; y: number }, m: Rec): Rec | null {
  if (m.requiresSupport) {
    const support = s.modules.find((x) => x.id === m.supportId);
    if (!support) return null;
    const b = planRects(s, support)[0]!;
    return p.x < b.x - 150 || p.x > b.x + b.w + 150 || p.y < b.y - 150 || p.y > b.y + b.h + 150 ? null : m;
  }
  if (m.kind === 'island') {
    const d = m.backSide && m.rearDepth ? m.rearDepth : m.depth,
      turn = (m.rotation || 0) % 180 !== 0;
    return { ...m, zone: 'island', x: Math.round(p.x - (turn ? d : m.width) / 2), y: Math.round(p.y - (turn ? m.width : d) / 2) };
  }
  const { width: W, depth: D } = s.room,
    near = 150,
    walls = activeWalls(s),
    candidates: { wall: string; dist: number; pos: number }[] = [];
  if (p.x >= -20 && p.x <= W + 20 && Math.abs(p.y) < m.depth + near) candidates.push({ wall: 'A', dist: Math.abs(p.y - m.depth / 2), pos: storedPosAtWorld(s, { ...m, wall: 'A' }, p.x - m.width / 2) });
  if (walls.includes('B')) {
    const bx = s.type === 'l' && s.orientation === 'right' ? W : 0;
    if (p.y >= -20 && p.y <= D + 20 && Math.abs(p.x - bx) < m.depth + near) candidates.push({ wall: 'B', dist: Math.abs(p.x - (bx === 0 ? m.depth / 2 : bx - m.depth / 2)), pos: p.y - m.width / 2 });
  }
  if (walls.includes('C') && p.y >= -20 && p.y <= D + 20 && Math.abs(p.x - W) < m.depth + near) candidates.push({ wall: 'C', dist: Math.abs(p.x - (W - m.depth / 2)), pos: p.y - m.width / 2 });
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  const placement: Rec = { ...m, wall: candidates[0]!.wall, pos: Math.round(candidates[0]!.pos) };
  if (isSingleCorner(placement)) {
    const choices = cornerChoices(s, placement.wall),
      axis = placement.wall === 'A' ? p.x : p.y;
    placement.room_corner_id =
      choices.length === 1 ? choices[0]!.id : choices.length === 2 ? (choices.find((x) => x.anchor === (axis < wallLength(s, placement.wall) / 2 ? 'start' : 'end'))?.id ?? null) : null;
    return alignSingleCorner(s, placement);
  }
  return placement;
}

const previewOf = (s: KitchenScene, m: Rec | null, verdict: { ok: boolean; text: string }, hint = '', checked = true): KitchenDragPreview => ({ module: m, ok: verdict.ok, text: verdict.text, hint, rects: m ? collisionRects(s, m) : [], checked });
/** The verdict of a preview: the whole check, or with `quick` its first layer while the pointer moves (Д, FINDINGS 588). */
function verdictOf(s: KitchenScene, m: Rec, hint: string, quick: boolean, excludeId: string | null = null): KitchenDragPreview {
  if (!quick) return previewOf(s, m, validateKitchenModule(s, m, excludeId), hint);
  const placed = kitchenPlacementVerdict(s, m, excludeId);
  return placed ? previewOf(s, m, placed, hint) : previewOf(s, m, { ok: true, text: 'Положение проверяется…' }, hint, false);
}

/**
 * A card dragged over the plan at the point `p`, mm of the plan (updatePaletteAt, r1.html:69078). A mezzanine
 * stands on the tall cabinet under the pointer that has none yet (Д, FINDINGS 581: the prototype took the cabinet
 * chosen in its dialog).
 */
export function kitchenCardPreview(s: KitchenScene, cardId: string, p: { x: number; y: number }, draft: Rec | null = null, quick = false): KitchenDragPreview {
  const c = KITCHEN_CARDS[cardId];
  if (!c) return previewOf(s, null, { ok: false, text: `Нет карточки модуля «${cardId}».` });
  if (!s.roomConfirmed || !(s as Rec).typeConfirmed) return previewOf(s, null, { ok: false, text: 'Сначала подтвердите размеры помещения и явно выберите тип кухни.' });
  const supportId = c.requiresSupport
    ? (s.modules.find((m) => m.kind === 'tall' && !s.modules.some((x) => x.supportId === m.id) && planRects(s, m).some((b) => p.x >= b.x - 150 && p.x <= b.x + b.w + 150 && p.y >= b.y - 150 && p.y <= b.y + b.h + 150))?.id ?? null)
    : null;
  if (c.requiresSupport && !supportId) return previewOf(s, null, { ok: false, text: 'Антресоль ставится над пеналом: наведите её на пенал без антресоли.' });
  // The module of a card is made once per drag (makeKitchenModule is the whole creation path of the prototype).
  const made = draft && draft.catalogId === cardId && (draft.supportId ?? null) === supportId ? draft : makeKitchenModule(s, cardId, { supportId }),
    placed = closestPlacement(s, p, clone(made));
  if (!placed) return { ...previewOf(s, null, { ok: false, text: 'Наведите модуль на одну из стен кухни.' }), draft: made };
  // MOD-DEC-565: a mezzanine stands on the cabinets under it where it is put (FINDINGS 1181).
  const sn = snapModule(s, seatMezzanine(s, placed));
  return { ...verdictOf(s, seatMezzanine(s, sn.candidate), sn.hint, quick), draft: made };
}

/** A card dropped on the plan (palettePointerUp, r1.html:69112): the module of the preview, or the refusal. */
export function dropKitchenCard(p: KitchenProject, hw: HardwareCatalogs, cardId: string, at: { x: number; y: number }): KitchenEdit {
  const s = kitchenSceneOf(p, hw),
    v = kitchenCardPreview(s, cardId, at);
  if (!v.module || !v.ok) return no(v.text + ' Объект не создан.');
  const S = s as unknown as Rec,
    id = 'm' + (S.nextId ?? 1),
    m: Rec = { ...v.module, id };
  let notice = `${m.name} добавлен перетаскиванием. ${v.hint}`.trim();
  if (isSingleCorner(m)) {
    // addSingleCorner (r1.html:68353): the corner is bound and checked again with its id.
    alignSingleCorner(s, m);
    const again = validateKitchenModule(s, m);
    if (!again.ok) return no('Прямой угол отклонён: ' + again.text + ' Проект и undo сохранены.');
    notice = `Добавлен один прямой угловой корпус ${id} (перетаскивание); сосед создаётся отдельно.`;
  }
  return { ok: true, project: kitchenProjectOfScene({ ...s, modules: [...s.modules, m], nextId: (S.nextId ?? 1) + 1 } as KitchenScene), notice, selected: id };
}

/** A module dragged by `d`, mm of the plan, from where it stands (pointerMove, r1.html:69196). */
export function kitchenMovePreview(s: KitchenScene, id: string, d: { dx: number; dy: number }, quick = false): KitchenDragPreview {
  const o = s.modules.find((x) => x.id === id);
  if (!o) return previewOf(s, null, { ok: false, text: `Нет модуля ${id}.` });
  if (isLegacyCorner(o)) return previewOf(s, null, { ok: false, text: 'LEGACY_CORNER_VERSION: сохранённая пара только для чтения.' });
  if (isSingleCorner(o)) return previewOf(s, null, { ok: false, text: 'Один угловой корпус привязан к внутреннему углу; смените стену/угол в свойствах.' });
  const m: Rec = clone(o);
  if (isFree(m)) {
    m.x = Math.round(m.x + d.dx);
    m.y = Math.round(m.y + d.dy);
  } else m.pos = Math.round(storedPosAtWorld(s, m, moduleWorldStart(s, o) + (m.wall === 'A' ? d.dx : d.dy)));
  const sn = snapModule(s, seatMezzanine(s, m));
  sn.candidate = seatMezzanine(s, sn.candidate);
  if (m.cornerGroupId) return previewOf(s, sn.candidate, { ok: false, text: 'Связанный прямой угол перемещается только после удаления и повторного размещения.' }, sn.hint);
  if (s.modules.some((x) => x.supportId === m.id)) return previewOf(s, sn.candidate, { ok: false, text: 'Опорный пенал связан с антресолью. Сначала перенесите или удалите антресоль.' }, sn.hint);
  return verdictOf(s, sn.candidate, sn.hint, quick, m.id);
}

/** A module dropped where it was dragged (pointerUp, r1.html:69227); the old place is kept on a refusal. */
export function moveKitchenModule(p: KitchenProject, hw: HardwareCatalogs, id: string, d: { dx: number; dy: number }): KitchenEdit {
  const s = kitchenSceneOf(p, hw),
    v = kitchenMovePreview(s, id, d);
  if (!v.module || !v.ok) return no(v.text + ' Исходное положение сохранено.');
  return { ok: true, project: kitchenProjectOfScene({ ...s, modules: s.modules.map((x) => (x.id === id ? v.module! : x)) }), notice: 'Положение изменено; соседние модули остались на месте.', selected: id };
}

// ---------------------------------------------------------------- examples

/** The examples of the prototype (fixtures, r1.html:67362) with their names on the screen. */
export const KITCHEN_EXAMPLE_TITLES: Readonly<Record<string, string>> = { straight: 'Прямая', l: 'Г-образная', u: 'П-образная', island: 'С островом', 'l-old': 'Г-образная (прежний угол)' };

/** A kitchen of an example made by the palette path (KF-14, FINDINGS 327): a new kitchen, examples replace it. */
export function kitchenExampleProject(p: KitchenProject, hw: HardwareCatalogs, name: string): KitchenEdit {
  if (!KITCHEN_EXAMPLES[name]) return no(`Нет примера «${name}».`);
  try {
    return { ok: true, project: kitchenProjectOfScene(kitchenExample(name, kitchenSceneOf(p, hw))), notice: `Загружен пример «${KITCHEN_EXAMPLE_TITLES[name] ?? name}».`, selected: null };
  } catch (e) {
    return no(e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------- the rates of the cost (kcdCostPanel, r1.html:81744)

export { kitchenCostStatusText };
export { kitchenRateText } from './cost.js';

/** The rates of the project, checked (kcdSetRates, r1.html:81744): a file or a form the core refuses keeps the kitchen. */
export function setKitchenRates(p: KitchenProject, raw: unknown): KitchenEdit {
  let settings;
  try {
    settings = kitchenRateSettings(raw);
  } catch (e) {
    return no('Ставки не изменены: ' + (e instanceof Error ? e.message : String(e)));
  }
  return { ok: true, project: kitchenProjectFromRecord(clone({ ...p, costSettings: settings })), notice: 'Ставки стоимости обновлены' };
}

/** «Включить технику в итог» (kcd-appliances, r1.html:81807). */
export const setKitchenIncludeAppliances = (p: KitchenProject, on: boolean): KitchenEdit => setKitchenRates(p, { ...kitchenRateSettings(p.costSettings ?? null), includeAppliances: on });

/** «Валюта» (kcd-currency, r1.html:81811): the rates are not converted; with a price set, the rates of the new currency come by a file. */
export function setKitchenCurrency(p: KitchenProject, currency: string): KitchenEdit {
  const settings = kitchenRateSettings(p.costSettings ?? null);
  if (currency === settings.currency) return { ok: true, project: p };
  if (settings.rates.some((r) => r.price !== null)) return no('Сначала импортируйте ставки в новой валюте. Конвертация автоматически не выполняется.');
  return setKitchenRates(p, { ...settings, currency, rates: [] });
}

/** The line under the price of the kitchen (kcdCostFooterText, r1.html:81402). */
export function kitchenCostFooterText(p: KitchenProject, cost: Rec): string {
  if (!p.modules.length) return 'Добавьте модули для расчёта.';
  if (cost.total !== null) return 'Оценка рассчитана по введённым ставкам. Коммерческое предложение уточняет поставщик.';
  const reasons: string[] = [];
  if (cost.unpricedItems.length) reasons.push('Цена не определена для ' + cost.unpricedItems.length + ' позиций.');
  if (cost.technicalIncomplete.length) reasons.push('Есть технические ограничения: ' + cost.technicalIncomplete.length + '.');
  return reasons.length ? reasons.join(' ') + ' Показана только известная часть.' : 'Оценка частичная. Проверьте состав и ограничения.';
}
