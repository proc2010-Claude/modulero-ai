// The room of the kitchen and the placement of a module in it (task K3, MIGRATION_PLAN step 4.3): the walls in use,
// the start of a module along its wall, the single-body corner (MOD-DEC-182) and its corner of the room, and the one
// transform of a box of a module into the room (kflowWorldBox with the island layer).
//
// A box of a module is [x0, x1, y0, y1, z0, z1]: x across the module from its left side, y up from its bottom, z from
// the front face of the carcass (z = 0) to the wall (z = depth); the fronts lie at z < 0. A box of the room is
// [x0, x1, y0, y1, z0, z1]: x along wall A from the left, y up from the floor, z away from wall A.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Rec } from '../engine/policy/project-state.js';
import { facadeChoiceThickness } from './facade-choice.js';
import type { KitchenFacadeChoice, KitchenFittings, KitchenOptions, KitchenWorktopChoice } from './project.js';

/** What the calculation of a module reads from the kitchen beside the module itself. */
export interface KitchenScene {
  type: string;
  orientation: string;
  wallNaming: string;
  roomConfirmed: boolean;
  room: { width: number; depth: number; height: number };
  modules: Rec[];
  obstacles: Rec[];
  proposed: Rec;
  corpusMaterial: string;
  facadeMaterial: string;
  /** The material of the facades (MOD-DEC-573, KitchenProject.facadeChoice); absent — the prototype's fronts. */
  facadeChoice?: KitchenFacadeChoice | null;
  /** The settings of the whole kitchen (R4-006, KitchenProject.kitchenOptions): what a new module takes. */
  kitchenOptions?: KitchenOptions;
  /** The parameters of the cutting map (R4-011, KitchenProject.cutting). */
  cutting?: Rec;
  /** The handles and the opening of the fronts (MOD-AI-16, 36; KitchenProject.fittings). */
  fittings?: KitchenFittings;
  /** The manual bands of the parts (MOD-DEC-743, KitchenProject.edgeOverrides). */
  edgeOverrides?: { [partId: string]: { [edge: string]: string } };
  /** The worktop of the whole kitchen (MOD-AI-15; KitchenProject.worktop). */
  worktop?: KitchenWorktopChoice;
  system32Policy?: Rec | null;
  /** Rates and the inclusion of appliances (costSettings of the project). */
  costSettings?: Rec;
  /**
   * The release of the hardware catalogue the kitchen is calculated with (CAT-1: the catalogue is an argument, not a part
   * of the core). The scene is built for a calculation and never saved: the project keeps only KITCHEN_PROJECT_KEYS.
   */
  hardware: HardwareCatalogs;
}

export type Box = [number, number, number, number, number, number];

/** A corner pair saved before the single-body corner: its stored result is its input (r1.html:67860). */
export const isLegacyCorner = (m: Rec | null | undefined): boolean => Boolean(m?.cornerGroupId) || (m?.corner === 'direct' && m.schema_version !== 2);
/** The single-body corner of MOD-DEC-182 (r1.html:67859). */
export const isSingleCorner = (m: Rec | null | undefined): boolean => m?.corner === 'direct' && m.schema_version === 2;
/**
 * A new straight corner (MOD-DEC-566 п. 6, FINDINGS 1274): the body stands at the adjacent wall, the blind part covers the
 * adjacent row with its front, the filler stands at the door. The prototype's corner had the filler at the wall.
 */
export const fillerAtDoor = (m: Rec | null | undefined): boolean => isSingleCorner(m) && m!.fillerAtDoor === true;
/** What of the filler of a straight corner lies along its wall beyond the body: all of it at the wall, none at the door. */
export const wallFiller = (m: Rec): number => (fillerAtDoor(m) ? 0 : m.filler_width_mm);
/** An island or a peninsula: placed by its own x, y and rotation (r1.html:72559). */
export const isFree = (m: Rec | null | undefined): boolean => m?.zone === 'island' || m?.zone === 'peninsula';
/** Depth of the body of a module: the reduced depth of the rear of a back-to-back island (r1.html:72560). */
export const bodyDepth = (m: Rec): number => (m.backSide && m.rearDepth ? m.rearDepth : m.depth);
/** The accessible L corner (r1.html:72259). */
export const isAccessL = (m: Rec | null | undefined): boolean => m?.corner === 'access-l' && ['KB_CORNER_ACCESS_L', 'KW_CORNER_ACCESS_L'].includes(m.moduleTypeId);
/** The diagonal corner (r1.html:72665). */
export const isDiagonal = (m: Rec | null | undefined): boolean => m?.corner === 'diagonal' && ['KB_CORNER_DIAGONAL', 'KW_CORNER_DIAGONAL'].includes(m.moduleTypeId);

/** Wall name of the chain A–B–C of a new kitchen (r1.html:67627). */
export function canonicalWall(s: KitchenScene, w: string): string {
  return s.wallNaming === 'ABC_CHAIN' ? ({ A: 'B', B: 'A', C: 'C' } as Rec)[w] || w : w;
}

/** The walls in use (r1.html:67847). */
export function activeWalls(s: KitchenScene): string[] {
  const w = ['A'];
  if (s.type !== 'straight' || s.modules.some((m) => m.wall === 'B') || s.obstacles.some((o) => o.wall === 'B')) w.push('B');
  if (s.type === 'u' || s.modules.some((m) => m.wall === 'C') || s.obstacles.some((o) => o.wall === 'C')) w.push('C');
  return w;
}

export const wallLength = (s: KitchenScene, w: string): number => (w === 'A' ? s.room.width : s.room.depth);

/** A wall of the room in use: its stored id, its name by the naming of the room, its length and its corners. */
export interface RoomWall {
  id: string;
  name: string;
  lengthMm: number;
  startCorner: string;
  endCorner: string;
}

/**
 * The walls of the room with their names (KF-15, MOD-DEC-294: one source; roomTopology, r1.html:67634). The name comes
 * from the naming the room is stored with (`wallNaming`), never from the screen: the prototype's interface renamed the
 * labels of the plan by a pattern, and the examples, loaded as LEGACY, named the inner wall otherwise than a new kitchen.
 */
export function roomWalls(s: KitchenScene): RoomWall[] {
  return activeWalls(s).map((w) => {
    const choices = cornerChoices(s, w);
    return {
      id: w,
      name: canonicalWall(s, w),
      lengthMm: wallLength(s, w),
      startCorner: choices.find((c) => c.anchor === 'start')?.id || 'free' + w + 'Start',
      endCorner: choices.find((c) => c.anchor === 'end')?.id || 'free' + w + 'End',
    };
  });
}

/** Start of a module along its wall from the left of the room: the right L kitchen stores wall A from the right (r1.html:67870). */
export function moduleWorldStart(s: KitchenScene, m: Rec): number {
  return m.wall === 'A' && !isSingleCorner(m) && s.type === 'l' && s.orientation === 'right' ? wallLength(s, 'A') - m.pos - m.width : m.pos;
}

export interface CornerChoice {
  id: string;
  anchor: 'start' | 'end';
  adjacent: string;
}

/** The corners of the room a wall ends in (legacyCornerChoices, cornerChoices, r1.html:67884–67927). */
export function cornerChoices(s: KitchenScene, w: string): CornerChoice[] {
  const c = (id: string, anchor: 'start' | 'end', adjacent: string): CornerChoice => ({ id, anchor, adjacent });
  let list: CornerChoice[];
  if (s.type === 'straight') list = [];
  else if (s.type === 'u') list = w === 'A' ? [c('AB', 'start', 'B'), c('AC', 'end', 'C')] : w === 'B' ? [c('AB', 'start', 'A')] : w === 'C' ? [c('AC', 'start', 'A')] : [];
  else if (s.orientation === 'right') list = w === 'A' ? [c('AB', 'end', 'B')] : w === 'B' ? [c('AB', 'start', 'A')] : [];
  else list = w === 'A' ? [c('AB', 'start', 'B')] : w === 'B' ? [c('AB', 'start', 'A')] : [];
  return list.map((x) => ({ ...x, id: s.wallNaming === 'ABC_CHAIN' && x.id === 'AC' ? 'BC' : x.id }));
}

export const cornerChoice = (s: KitchenScene, m: Rec): CornerChoice | null => cornerChoices(s, m.wall).find((c) => c.id === m.room_corner_id) || null;

/** The plan rectangles of a module, mm (rects, r1.html:68080). */
export function planRects(s: KitchenScene, m: Rec): { x: number; y: number; w: number; h: number }[] {
  let b;
  if (isFree(m)) {
    const turn = (m.rotation || 0) % 180 !== 0,
      d = bodyDepth(m);
    b = { x: m.x, y: m.y, w: turn ? d : m.width, h: turn ? m.width : d };
  } else if (m.wall === 'A') b = { x: moduleWorldStart(s, m), y: 0, w: m.width, h: m.depth };
  else if (m.wall === 'B') {
    const right = s.type === 'l' && s.orientation === 'right';
    b = { x: right ? s.room.width - m.depth : 0, y: m.pos, w: m.depth, h: m.width };
  } else b = { x: s.room.width - m.depth, y: m.pos, w: m.depth, h: m.width };
  if (!m.corner || isSingleCorner(m)) return [b];
  const side = m.cornerSide || 'left',
    second = m.cornerReturn || 900,
    leg = m.depth;
  if (m.wall === 'A') return [b, { x: side === 'left' ? b.x : b.x + b.w - leg, y: 0, w: leg, h: second }];
  if (m.wall === 'B' || m.wall === 'C') {
    const right = m.wall === 'C' || (m.wall === 'B' && s.type === 'l' && s.orientation === 'right');
    return [b, { x: right ? s.room.width - second : 0, y: side === 'left' ? b.y : b.y + b.h - leg, w: second, h: leg }];
  }
  return [b];
}

/** Plan zones of the single-body corner: body, physical filler, empty reserve at the adjacent wall (cornerZones, r1.html:67963). */
export function cornerZones(s: KitchenScene, m: Rec): Rec {
  const body = planRects(s, m)[0]!,
    choice = cornerChoice(s, m);
  if (!body || !choice) return { body: null, filler: null, reserve: null };
  const q = m.filler_width_mm,
    r = m.perpendicular_clearance_mm,
    D = m.depth,
    L = wallLength(s, choice.adjacent);
  let filler, reserve;
  // The filler at the door of a new corner: right after its blind part (FINDINGS 1274).
  const B = m.blind_nominal_mm,
    at = fillerAtDoor(m),
    start = choice.anchor === 'start';
  if (m.wall === 'A') filler = { x: at ? (start ? body.x + B : body.x + body.w - B - q) : start ? body.x - q : body.x + body.w, y: body.y + body.h + 2, w: q, h: Math.min(body.h, m.panelThickness || 16) };
  else
    filler = {
      x: m.wall === 'B' && body.x === 0 ? body.x + body.w + 2 : body.x - 2 - (m.panelThickness || 16),
      y: at ? (start ? body.y + B : body.y + body.h - B - q) : start ? body.y - q : body.y + body.h,
      w: Math.min(body.w, m.panelThickness || 16),
      h: q,
    };
  if (choice.adjacent === 'A') {
    const end = cornerChoices(s, 'A').find((c) => c.id === choice.id)?.anchor === 'end';
    reserve = { x: end ? s.room.width - D - r : D, y: 0, w: r, h: D };
  } else reserve = { x: choice.adjacent === 'C' || (choice.adjacent === 'B' && s.type === 'l' && s.orientation === 'right') ? s.room.width - D : 0, y: D, w: D, h: r };
  return { body, filler, reserve, selectedProjection: m.width + wallFiller(m), adjacentProjection: D + r, adjacentLength: L };
}

/** The front line of the corner in the plan (cornerWorldLine, r1.html:67958). */
export function cornerWorldLine(s: KitchenScene, m: Rec, a: number, b: number): number[][] {
  const body = planRects(s, m)[0]!,
    front = 2 + (m.frontThickness ?? facadeChoiceThickness(s) ?? 18);
  return m.wall === 'A'
    ? [
        [body.x + a, body.y + body.h + front],
        [body.x + b, body.y + body.h + front],
      ]
    : m.wall === 'B' && body.x === 0
      ? [
          [body.x + body.w + front, body.y + a],
          [body.x + body.w + front, body.y + b],
        ]
      : [
          [body.x - front, body.y + a],
          [body.x - front, body.y + b],
        ];
}

/**
 * A box of a module in the room (kflowWorldBox r1.html:69952 with the island layer r1.html:72573): a wall module from
 * its start and the floor, an island turned by its rotation about its own x, y.
 */
export function worldBox(s: KitchenScene, m: Rec, box: readonly number[]): Box {
  const [x0, x1, y0, y1, z0, z1] = box as Box;
  if (isFree(m)) {
    const W = m.width,
      D = bodyDepth(m),
      turn = (((m.rotation || 0) % 360) + 360) % 360,
      point = (u: number, v: number) => (turn === 0 ? [u, v] : turn === 90 ? [v, W - u] : turn === 180 ? [W - u, D - v] : [D - v, u]),
      xy = [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ].map(([u, v]) => point(u!, v!));
    return [m.x + Math.min(...xy.map((p) => p[0]!)), m.x + Math.max(...xy.map((p) => p[0]!)), m.floor + y0, m.floor + y1, m.y + Math.min(...xy.map((p) => p[1]!)), m.y + Math.max(...xy.map((p) => p[1]!))];
  }
  const at = moduleWorldStart(s, m),
    floor = m.floor,
    near = m.depth - z1,
    far = m.depth - z0;
  if (m.wall === 'A') return [at + x0, at + x1, floor + y0, floor + y1, near, far];
  const left = m.wall === 'B' && !(s.type === 'l' && s.orientation === 'right'),
    wallX = left ? 0 : s.room.width;
  return left ? [wallX + near, wallX + far, floor + y0, floor + y1, at + x0, at + x1] : [wallX - far, wallX - near, floor + y0, floor + y1, at + x0, at + x1];
}

/** A point of a module in the frame of the fasteners: x, depth, height of the room (k7Point, r1.html:71265). */
export function fastenerPoint(s: KitchenScene, m: Rec, v: readonly number[]): [number, number, number] {
  const b = worldBox(s, m, [v[0]!, v[0]!, v[2]!, v[2]!, v[1]!, v[1]!]);
  return [b[0], b[4], b[2]];
}

/** A box of a module in the frame of the fasteners: [[x, depth, height] min, max] (k7Input, kreGroove). */
export function fastenerBox(s: KitchenScene, m: Rec, box: readonly number[]): [[number, number, number], [number, number, number]] {
  const b = worldBox(s, m, box);
  return [
    [b[0], b[4], b[2]],
    [b[1], b[5], b[3]],
  ];
}
