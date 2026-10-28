// The parts of the kitchen in the room (task K4, MIGRATION_PLAN step 4.4; KF-01, KF-02, KF-20, MOD-DEC-294): the check
// of a module places its parts, not the plan rectangles of the modules. A part is a vertical solid: its plan contour in
// the room (the box of a rectangular part, the footprint of a diagonal front, plinth or polygon) between its bottom and
// top. Two parts of different modules may not share a volume, and no part may leave the room. The prototype checked the
// rectangles of the bodies only: the front of a wall unit went through the neighbour on the other wall (KF-01), the
// diagonal front into the fronts of its neighbours (KF-02), a front of an island into the wall.
//
// A plan point is [x, z]: x along wall A from the left of the room, z away from wall A (the frame of worldBox).
import type { Rec } from '../engine/policy/project-state.js';
import { tolerance } from '../engine/policy/index.js';
import { worldBox, type KitchenScene } from './room.js';

/** Computed values are compared to 0.1 mm (MOD-DEC-191), as INV-G04 does. */
const TOL = tolerance.constants.compare.value;

type Point = number[];
/** A part of a module as a vertical solid of the room. */
export interface PartSolid {
  part: Rec;
  module: Rec;
  plan: Point[];
  bottom: number;
  top: number;
  /** The extent of the plan: [min x, max x, min z, max z]. */
  extent: [number, number, number, number];
}

const crossOf = (a: Point, b: Point, c: Point) => (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);

/** Triangles of a simple plan polygon (ear clipping; either direction). */
function triangles(input: Point[]): Point[][] {
  const p = input.map((v) => [v[0]!, v[1]!]);
  if (p.reduce((s, a, i) => s + crossOf([0, 0], a, p[(i + 1) % p.length]!), 0) < 0) p.reverse();
  const ids = p.map((_, i) => i),
    out: Point[][] = [];
  while (ids.length > 3) {
    let ear = -1;
    for (let i = 0; i < ids.length && ear < 0; i++) {
      const [a, b, c] = [ids[(i + ids.length - 1) % ids.length]!, ids[i]!, ids[(i + 1) % ids.length]!].map((k) => p[k]!) as [Point, Point, Point];
      if (crossOf(a, b, c) <= 0) continue;
      if (!ids.some((j) => ![a, b, c].includes(p[j]!) && crossOf(a, b, p[j]!) >= 0 && crossOf(b, c, p[j]!) >= 0 && crossOf(c, a, p[j]!) >= 0)) ear = i;
    }
    if (ear < 0) return out;
    out.push([ids[(ear + ids.length - 1) % ids.length]!, ids[ear]!, ids[(ear + 1) % ids.length]!].map((k) => p[k]!));
    ids.splice(ear, 1);
  }
  if (crossOf(p[ids[0]!]!, p[ids[1]!]!, p[ids[2]!]!) > 0) out.push(ids.map((k) => p[k]!));
  return out;
}

/** Two convex plan polygons overlap deeper than TOL on every axis of their edges (separating axes). */
export function convexOverlap(a: Point[], b: Point[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!,
        q = poly[(i + 1) % poly.length]!,
        l = Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!);
      if (l < 1e-9) continue;
      const n = [(p[1]! - q[1]!) / l, (q[0]! - p[0]!) / l],
        pa = a.map((v) => v[0]! * n[0]! + v[1]! * n[1]!),
        pb = b.map((v) => v[0]! * n[0]! + v[1]! * n[1]!);
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= TOL) return false;
    }
  return true;
}

/** The solid of a part of a module in the room, or null for a part without a place (a pending polygon) or a worktop. */
export function partSolid(s: KitchenScene, m: Rec, p: Rec): PartSolid | null {
  if (p.materialRole === 'WORKTOP' || !Array.isArray(p.box) || !p.box.every(Number.isFinite)) return null;
  const b = worldBox(s, m, p.box),
    plan = p.worldFootprintMm
      ? p.worldFootprintMm.map((q: Point) => [q[0]!, q[1]!])
      : [
          [b[0], b[4]],
          [b[1], b[4]],
          [b[1], b[5]],
          [b[0], b[5]],
        ];
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const [x, z] of plan) {
    x0 = Math.min(x0, x!);
    x1 = Math.max(x1, x!);
    z0 = Math.min(z0, z!);
    z1 = Math.max(z1, z!);
  }
  return { part: p, module: m, plan, bottom: b[2], top: b[3], extent: [x0, x1, z0, z1] };
}

/** Two solids share a volume deeper than TOL. */
export function solidsCross(a: PartSolid, b: PartSolid): boolean {
  if (Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom) <= TOL) return false;
  // Plans apart on an axis of the room share no point, so no axis of their edges finds them overlapping: the
  // triangles are not needed (KF-23, FINDINGS 570).
  const [ax0, ax1, az0, az1] = a.extent,
    [bx0, bx1, bz0, bz1] = b.extent;
  if (Math.min(ax1, bx1) - Math.max(ax0, bx0) < 0 || Math.min(az1, bz1) - Math.max(az0, bz0) < 0) return false;
  const ta = triangles(a.plan),
    tb = triangles(b.plan);
  return ta.some((x) => tb.some((y) => convexOverlap(x, y)));
}

/** How far a solid leaves the room, mm (0 inside). */
export function outsideRoom(s: KitchenScene, x: PartSolid): number {
  return Math.max(0, x.bottom * -1, x.top - s.room.height, ...x.plan.flatMap(([px, pz]) => [-px!, px! - s.room.width, -pz!, pz! - s.room.depth]));
}

/**
 * The solids of a scene (KF-23, FINDINGS 920): the check of every module of a kitchen places the parts of all the others,
 * so a frozen part (a derived record) is placed once per scene and module. A scene whose top-level values were replaced
 * in place gets new solids, as the memo of the derived records does.
 */
const solidMemo = new WeakMap<KitchenScene, { values: unknown[]; byPart: WeakMap<Rec, { module: Rec; solid: PartSolid | null }> }>();

function solidsOf(s: KitchenScene): typeof partSolid {
  const values = Object.values(s);
  let entry = solidMemo.get(s);
  if (!entry || entry.values.length !== values.length || entry.values.some((v, i) => v !== values[i])) solidMemo.set(s, (entry = { values, byPart: new WeakMap() }));
  const byPart = entry.byPart;
  return (scene, m, p) => {
    if (!Object.isFrozen(p)) return partSolid(scene, m, p);
    const saved = byPart.get(p);
    if (saved?.module === m) return saved.solid;
    const solid = partSolid(scene, m, p);
    byPart.set(p, { module: m, solid });
    return solid;
  };
}

const label = (x: PartSolid) => `«${x.part.name}» модуля ${x.module.id}`;
const mm = (v: number) => Math.round(v * 10) / 10;

/**
 * Whether the parts of a module stand in the room and apart from the parts of the other modules (KF-01, KF-02, KF-20):
 * the text of the first conflict in the order of the parts, or null. `parts` are the derived parts of each module by id.
 */
export function partConflict(s: KitchenScene, m: Rec, parts: ReadonlyMap<string, Rec[]>): string | null {
  const solid = solidsOf(s),
    own = (parts.get(m.id) ?? []).map((p) => solid(s, m, p)).filter((x): x is PartSolid => !!x);
  for (const x of own) {
    const out = outsideRoom(s, x);
    if (out > TOL) return `Деталь ${label(x)} выходит за пределы помещения на ${mm(out)} мм.`;
  }
  const others = s.modules.filter((o) => o.id !== m.id).flatMap((o) => (parts.get(o.id) ?? []).map((p) => solid(s, o, p)).filter((x): x is PartSolid => !!x));
  for (const x of own) for (const y of others) if (solidsCross(x, y)) return `Деталь ${label(x)} пересекает деталь ${label(y)}. Сосед остаётся на месте.`;
  return null;
}
