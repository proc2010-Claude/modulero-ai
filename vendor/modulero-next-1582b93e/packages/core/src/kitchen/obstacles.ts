// The marks of the walls of the room (task U4 after #263 and #271, FINDINGS 660–669): water, sewage, an outlet, a
// ventilation duct, an opening, the measured full-height opening of the prototype (openObstacleDialog, addDraft,
// validateObstacle, uncertainOverlaps, r1.html:68150–68300, 69290–69345), and the measured «Окно» and protrusion
// added by the editor (В, FINDINGS 660); «Окно» of unknown height, the gas pipe and the measured gas water heater,
// the bottom and the height of a pipe or an outlet when they are known, and the change of a mark (MOD-AI-45, 60,
// FINDINGS 3150–3155). A mark is stored as the prototype stores it: { id, type, wall, pos, width, height }, `pos` from
// the start of the wall in the frame of the plan (along A from the left, along B and C from A); a measured mark and a
// located pipe or outlet also keep their `floor`.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Rec } from '../engine/policy/project-state.js';
import { kitchenProjectOfScene, kitchenSceneOf, type KitchenEdit } from './editor.js';
import { FULL_OPENING, isMeasuredObstacle, isPhysicalObstacle, measuredMeets, MEASURED_GAS_HEATER, MEASURED_PROTRUSION, MEASURED_WINDOW, obstacleTouches } from './modules.js';
import type { KitchenProject } from './project.js';
import { activeWalls, canonicalWall, wallLength, type KitchenScene } from './room.js';

const no = (problem: string): KitchenEdit => ({ ok: false, problem });

/**
 * The types of the dialog «Отметить участок стены» (ob-type, r1.html:69304), the measured marks of the editor (В) and
 * the marks of MOD-AI-45, 60. `measured` — the bottom and the height are required and the stretch blocks the modules at
 * its height; `located` — a pipe or an outlet: the bottom and the height may be entered, the module before it stands.
 * `code` is the latin name the editor commands also take (FINDINGS 3151); the record keeps `id`, as the prototype.
 */
export const KITCHEN_OBSTACLE_TYPES: readonly { id: string; code: string; name: string; measured: boolean; located: boolean }[] = [
  { id: 'Вывод воды', code: 'water', name: 'Вывод воды', measured: false, located: true },
  { id: 'Канализация', code: 'sewage', name: 'Канализация', measured: false, located: true },
  { id: 'Розетка', code: 'socket', name: 'Розетка', measured: false, located: true },
  { id: 'Вентиляция', code: 'vent', name: 'Вентиляция', measured: false, located: true },
  { id: 'Газовая труба', code: 'gas-pipe', name: 'Газовая труба', measured: false, located: true },
  { id: 'Проём', code: 'opening', name: 'Проём · высота неизвестна', measured: false, located: false },
  { id: FULL_OPENING, code: 'opening-full', name: 'Проём во всю высоту · замерен', measured: false, located: false },
  { id: 'Окно', code: 'win', name: 'Окно · высота неизвестна', measured: false, located: false },
  { id: MEASURED_WINDOW, code: 'win-measured', name: 'Окно · низ и высота замерены', measured: true, located: false },
  { id: MEASURED_PROTRUSION, code: 'protrusion', name: 'Выступ стены (короб, колонна) · низ и высота замерены', measured: true, located: false },
  { id: MEASURED_GAS_HEATER, code: 'gas-heater', name: 'Газовая колонка · низ и высота замерены', measured: true, located: false },
];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The type of a mark by its id, its latin code or its name (FINDINGS 3151). */
export function kitchenObstacleType(type: unknown): (typeof KITCHEN_OBSTACLE_TYPES)[number] | null {
  const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
  return KITCHEN_OBSTACLE_TYPES.find((k) => [k.id, k.code, k.name].some((x) => x.toLowerCase() === t)) ?? null;
}

/** A pipe or an outlet whose bottom and height are entered (FINDINGS 3152). */
const isLocated = (o: Rec): boolean => Boolean(kitchenObstacleType(o.type)?.located) && finite(o.floor) && finite(o.height);

/**
 * A mark the user enters: the measured ones also have the bottom and the height of their stretch, mm from the floor; a
 * pipe or an outlet may have them (null or absent — unknown).
 */
export interface KitchenObstacleDraft {
  type: string;
  wall: string;
  pos: number;
  width: number;
  floor?: number | null;
  height?: number | null;
}

/** Whether a mark may be put on the wall (validateObstacle, r1.html:68284), with the prototype's words. */
export function kitchenObstacleVerdict(s: KitchenScene, o: Rec): { ok: boolean; text: string } {
  if (!activeWalls(s).includes(o.wall) || !finite(o.pos) || !finite(o.width) || o.pos < 0 || o.width <= 0 || o.pos + o.width > wallLength(s, o.wall))
    return { ok: false, text: 'Пометка должна целиком помещаться на выбранной стене.' };
  if (isPhysicalObstacle(o)) {
    const m = s.modules.find((x) => obstacleTouches(s, o, x));
    if (m) return { ok: false, text: `Замеренный проём пересекает «${m.name}» или его угловую проекцию.` };
  }
  const heights = `Низ и высота участка: от 0 до высоты помещения ${s.room.height} мм, высота больше нуля.`,
    badHeights = () => !finite(o.floor) || !finite(o.height) || o.floor < 0 || o.height <= 0 || o.floor + o.height > s.room.height;
  if (isMeasuredObstacle(o)) {
    if (badHeights()) return { ok: false, text: heights };
    // Every module on the stretch is named with its id, and what to do (FINDINGS 3154): a cabinet may not hang on an
    // «Окно», so the mark is refused, not warned of.
    const met = s.modules.filter((x) => measuredMeets(o, x) && obstacleTouches(s, o, x));
    if (met.length)
      return {
        ok: false,
        text: `Замеренный участок пересекает ${met.map((m) => `«${m.name}» (${m.id})`).join(', ')} или ${met.length > 1 ? 'их угловые проекции' : 'его угловую проекцию'} по высоте ${o.floor}–${o.floor + o.height} мм. Сдвиньте или удалите ${met.length > 1 ? 'эти модули' : 'этот модуль'} и отметьте участок снова.`,
      };
    return { ok: true, text: 'Замеренный участок блокирует размещение модулей на его высоте.' };
  }
  if (kitchenObstacleType(o.type)?.located && (o.floor != null || o.height != null)) {
    if (badHeights()) return { ok: false, text: heights + ' Или оставьте оба поля пустыми, если они неизвестны.' };
    return { ok: true, text: `${o.type} на высоте ${o.floor}–${o.floor + o.height} мм от пола; модули перед ней стоят, доступ к ней показан в замечаниях.` };
  }
  return { ok: true, text: isPhysicalObstacle(o) ? 'Замеренный проём блокирует размещение.' : 'Участок отмечен; высота и выступ не заданы — нужен замер.' };
}

/** The record of a mark as the prototype keeps it (openObstacleDialog, r1.html:69290); a measured or located one keeps its bottom and height. */
function obstacleRecord(kind: (typeof KITCHEN_OBSTACLE_TYPES)[number], id: string, draft: KitchenObstacleDraft): Rec {
  const base = { id, type: kind.id, wall: draft.wall, pos: draft.pos, width: draft.width };
  if (kind.measured || (kind.located && (draft.floor != null || draft.height != null))) return { ...base, floor: draft.floor ?? null, height: draft.height ?? null };
  return { ...base, height: null };
}

const typeList = () => KITCHEN_OBSTACLE_TYPES.map((t) => t.id).join(', ');

/** «Отметить участок стены» (addDraft, r1.html:69335): the mark gets the next number of the kitchen, as in the prototype. */
export function addKitchenObstacle(p: KitchenProject, hw: HardwareCatalogs, draft: KitchenObstacleDraft): KitchenEdit {
  const kind = kitchenObstacleType(draft.type);
  if (!kind) return no(`Выберите тип пометки из списка: ${typeList()}.`);
  const s = kitchenSceneOf(p, hw),
    S = s as unknown as Rec;
  const o = obstacleRecord(kind, 'o' + S.nextId, draft);
  const v = kitchenObstacleVerdict(s, o);
  if (!v.ok) return no(v.text);
  return { ok: true, project: kitchenProjectOfScene({ ...s, obstacles: [...s.obstacles, o], nextId: S.nextId + 1 } as KitchenScene), notice: v.text };
}

/**
 * A change of a mark (MOD-AI-45, FINDINGS 3150): its type, wall, place, bottom and height, checked as a new mark; it
 * keeps its id and its place in the list. The prototype had only «×» and a new mark.
 */
export function updateKitchenObstacle(p: KitchenProject, hw: HardwareCatalogs, id: string, patch: Partial<KitchenObstacleDraft>): KitchenEdit {
  const s = kitchenSceneOf(p, hw),
    old = s.obstacles.find((o) => o.id === id);
  if (!old) return no(`Нет пометки ${id}.`);
  const kind = kitchenObstacleType(patch.type ?? old.type);
  if (!kind) return no(`Выберите тип пометки из списка: ${typeList()}.`);
  const draft: KitchenObstacleDraft = { type: kind.id, wall: old.wall, pos: old.pos, width: old.width, floor: old.floor ?? null, height: old.height ?? null, ...patch };
  const o = obstacleRecord(kind, id, draft),
    rest = { ...s, obstacles: s.obstacles.filter((x) => x.id !== id) } as KitchenScene,
    v = kitchenObstacleVerdict(rest, o);
  if (!v.ok) return no(v.text + ' Пометка не изменена.');
  return { ok: true, project: kitchenProjectOfScene({ ...s, obstacles: s.obstacles.map((x) => (x.id === id ? o : x)) }), notice: 'Пометка изменена. ' + v.text };
}

/** The «×» of a mark (remove-obstacle, r1.html:69450). */
export function removeKitchenObstacle(p: KitchenProject, hw: HardwareCatalogs, id: string): KitchenEdit {
  const s = kitchenSceneOf(p, hw);
  if (!s.obstacles.some((o) => o.id === id)) return no(`Нет пометки ${id}.`);
  return { ok: true, project: kitchenProjectOfScene({ ...s, obstacles: s.obstacles.filter((o) => o.id !== id) }), notice: 'Пометка удалена.' };
}

/** A mark of the room for the screen: where it is, what is known of its height. */
export interface KitchenObstacleView {
  id: string;
  type: string;
  wall: string;
  wallName: string;
  pos: number;
  width: number;
  /**
   * 'opening' — the measured full-height opening, 'measured' — a measured «Окно», protrusion or gas water heater,
   * 'located' — a pipe or an outlet with its bottom and height, 'unknown' — «высота ?».
   */
  known: 'opening' | 'measured' | 'located' | 'unknown';
  /** Bottom and top, mm from the floor; null when unknown. */
  heights: [number, number] | null;
  /** The line of the mark on its wall in the plan: x1, y1, x2, y2, mm. */
  line: [number, number, number, number];
}

/** The marks of the kitchen with their place in the plan (planSVG, r1.html:68623) and the list of the room (renderRoom, r1.html:68891). */
export function kitchenObstacles(p: KitchenProject, hw: HardwareCatalogs): KitchenObstacleView[] {
  const s = kitchenSceneOf(p, hw),
    W = s.room.width,
    right = (w: string) => w === 'C' || (w === 'B' && s.type === 'l' && s.orientation === 'right');
  return s.obstacles.map((o) => ({
    id: String(o.id),
    type: String(o.type),
    wall: String(o.wall),
    wallName: canonicalWall(s, o.wall),
    pos: o.pos,
    width: o.width,
    known: isPhysicalObstacle(o) ? 'opening' : isMeasuredObstacle(o) ? 'measured' : isLocated(o) ? 'located' : 'unknown',
    heights: isPhysicalObstacle(o) ? [0, s.room.height] : isMeasuredObstacle(o) || isLocated(o) ? [o.floor, o.floor + o.height] : null,
    line: o.wall === 'A' ? [o.pos, 0, o.pos + o.width, 0] : right(o.wall) ? [W, o.pos, W, o.pos + o.width] : [0, o.pos, 0, o.pos + o.width],
  }));
}

/** A remark of a mark on the stretch of a module: `measure` — its height is unknown, `access` — a pipe or an outlet behind the module. */
export interface KitchenObstacleWarning {
  moduleId: string;
  obstacleId: string;
  kind: 'measure' | 'access';
  text: string;
}

/**
 * A mark of unknown height on the stretch of a module (uncertainOverlaps, r1.html:68162): the module may stand, the
 * height, the depth and the access are to be measured («Нужен замер», status, r1.html:68861; krProblems 80407). A pipe
 * or an outlet whose bottom and height are known is remarked only behind a module of its height: the module stands, the
 * access to it is cut on site (FINDINGS 3152).
 */
export function kitchenObstacleWarnings(p: KitchenProject, hw: HardwareCatalogs): KitchenObstacleWarning[] {
  const s = kitchenSceneOf(p, hw);
  return s.modules.flatMap((m) =>
    s.obstacles
      .filter((o) => !isPhysicalObstacle(o) && !isMeasuredObstacle(o) && obstacleTouches(s, o, m))
      .flatMap((o): KitchenObstacleWarning[] => {
        if (!isLocated(o)) return [{ moduleId: m.id, obstacleId: String(o.id), kind: 'measure', text: `${o.type} совпадает с «${m.name}» по плану; высота и доступ неизвестны.` }];
        if (!(o.floor < m.floor + m.height && m.floor < o.floor + o.height)) return [];
        return [{ moduleId: m.id, obstacleId: String(o.id), kind: 'access', text: `${o.type} на высоте ${o.floor}–${o.floor + o.height} мм за «${m.name}»: доступ к ней — вырез в задней стенке по месту.` }];
      }),
  );
}
