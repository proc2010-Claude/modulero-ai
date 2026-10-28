// The marks of the walls of the room (task U4 after #263 and #271, FINDINGS 660–669): water, sewage, an outlet, a
// ventilation duct, an opening, the measured full-height opening of the prototype (openObstacleDialog, addDraft,
// validateObstacle, uncertainOverlaps, r1.html:68150–68300, 69290–69345), and the measured «Окно» and protrusion
// added by the editor (В, FINDINGS 660). A mark is stored as the prototype stores it: { id, type, wall, pos, width,
// height }, `pos` from the start of the wall in the frame of the plan (along A from the left, along B and C from A).
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Rec } from '../engine/policy/project-state.js';
import { kitchenProjectOfScene, kitchenSceneOf, type KitchenEdit } from './editor.js';
import { FULL_OPENING, isMeasuredObstacle, isPhysicalObstacle, measuredMeets, MEASURED_PROTRUSION, MEASURED_WINDOW, obstacleTouches } from './modules.js';
import type { KitchenProject } from './project.js';
import { activeWalls, canonicalWall, wallLength, type KitchenScene } from './room.js';

const no = (problem: string): KitchenEdit => ({ ok: false, problem });

/** The types of the dialog «Отметить участок стены» (ob-type, r1.html:69304) and the two measured marks of the editor (В). */
export const KITCHEN_OBSTACLE_TYPES: readonly { id: string; name: string; measured: boolean }[] = [
  { id: 'Вывод воды', name: 'Вывод воды', measured: false },
  { id: 'Канализация', name: 'Канализация', measured: false },
  { id: 'Розетка', name: 'Розетка', measured: false },
  { id: 'Вентиляция', name: 'Вентиляция', measured: false },
  { id: 'Проём', name: 'Проём · высота неизвестна', measured: false },
  { id: FULL_OPENING, name: 'Проём во всю высоту · замерен', measured: false },
  { id: MEASURED_WINDOW, name: 'Окно · низ и высота замерены', measured: true },
  { id: MEASURED_PROTRUSION, name: 'Выступ стены (короб, колонна) · низ и высота замерены', measured: true },
];

/** A mark the user enters: the measured ones also have the bottom and the height of their stretch, mm from the floor. */
export interface KitchenObstacleDraft {
  type: string;
  wall: string;
  pos: number;
  width: number;
  floor?: number;
  height?: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Whether a mark may be put on the wall (validateObstacle, r1.html:68284), with the prototype's words. */
export function kitchenObstacleVerdict(s: KitchenScene, o: Rec): { ok: boolean; text: string } {
  if (!activeWalls(s).includes(o.wall) || !finite(o.pos) || !finite(o.width) || o.pos < 0 || o.width <= 0 || o.pos + o.width > wallLength(s, o.wall))
    return { ok: false, text: 'Пометка должна целиком помещаться на выбранной стене.' };
  if (isPhysicalObstacle(o)) {
    const m = s.modules.find((x) => obstacleTouches(s, o, x));
    if (m) return { ok: false, text: `Замеренный проём пересекает «${m.name}» или его угловую проекцию.` };
  }
  if (isMeasuredObstacle(o)) {
    if (!finite(o.floor) || !finite(o.height) || o.floor < 0 || o.height <= 0 || o.floor + o.height > s.room.height)
      return { ok: false, text: `Низ и высота участка: от 0 до высоты помещения ${s.room.height} мм, высота больше нуля.` };
    const m = s.modules.find((x) => measuredMeets(o, x) && obstacleTouches(s, o, x));
    if (m) return { ok: false, text: `Замеренный участок пересекает «${m.name}» или его угловую проекцию по высоте.` };
    return { ok: true, text: 'Замеренный участок блокирует размещение модулей на его высоте.' };
  }
  return { ok: true, text: isPhysicalObstacle(o) ? 'Замеренный проём блокирует размещение.' : 'Высота/выступ не заданы: состояние UNKNOWN, требуется замер.' };
}

/** «Отметить участок стены» (addDraft, r1.html:69335): the mark gets the next number of the kitchen, as in the prototype. */
export function addKitchenObstacle(p: KitchenProject, hw: HardwareCatalogs, draft: KitchenObstacleDraft): KitchenEdit {
  const kind = KITCHEN_OBSTACLE_TYPES.find((t) => t.id === draft.type);
  if (!kind) return no('Выберите тип пометки из списка.');
  const s = kitchenSceneOf(p, hw),
    S = s as unknown as Rec;
  // The keys of the prototype's draft (openObstacleDialog, r1.html:69290); a measured mark keeps its bottom and height.
  const o: Rec = kind.measured
    ? { id: 'o' + S.nextId, type: kind.id, wall: draft.wall, pos: draft.pos, width: draft.width, floor: draft.floor ?? null, height: draft.height ?? null }
    : { id: 'o' + S.nextId, type: kind.id, wall: draft.wall, pos: draft.pos, width: draft.width, height: null };
  const v = kitchenObstacleVerdict(s, o);
  if (!v.ok) return no(v.text);
  return { ok: true, project: kitchenProjectOfScene({ ...s, obstacles: [...s.obstacles, o], nextId: S.nextId + 1 } as KitchenScene), notice: v.text };
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
  /** 'opening' — the measured full-height opening, 'measured' — «Окно» or a protrusion, 'unknown' — «высота ?». */
  known: 'opening' | 'measured' | 'unknown';
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
    known: isPhysicalObstacle(o) ? 'opening' : isMeasuredObstacle(o) ? 'measured' : 'unknown',
    heights: isPhysicalObstacle(o) ? [0, s.room.height] : isMeasuredObstacle(o) ? [o.floor, o.floor + o.height] : null,
    line: o.wall === 'A' ? [o.pos, 0, o.pos + o.width, 0] : right(o.wall) ? [W, o.pos, W, o.pos + o.width] : [0, o.pos, 0, o.pos + o.width],
  }));
}

/**
 * A mark of unknown height on the stretch of a module (uncertainOverlaps, r1.html:68162): the module may stand, the
 * height, the depth and the access are to be measured («Нужен замер», status, r1.html:68861; krProblems 80407).
 */
export function kitchenObstacleWarnings(p: KitchenProject, hw: HardwareCatalogs): { moduleId: string; obstacleId: string; text: string }[] {
  const s = kitchenSceneOf(p, hw);
  return s.modules.flatMap((m) =>
    s.obstacles
      .filter((o) => !isPhysicalObstacle(o) && !isMeasuredObstacle(o) && obstacleTouches(s, o, m))
      .map((o) => ({ moduleId: m.id, obstacleId: String(o.id), text: `${o.type} совпадает с «${m.name}» по плану; высота и доступ неизвестны.` })),
  );
}
