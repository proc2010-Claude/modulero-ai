// Doors and drawers that the 3D view opens (task V2, MOD-DEC-131): what moves, about which axis, how far — only from
// the mechanisms of the graph. A hinge mechanism turns its door leaf, a drawer runner moves every part of its drawer,
// a sliding door system moves each leaf along its track (MOD-DEC-184, 571: the leaves of one track do not pass each
// other, no leaf leaves the travel of the set).
// The motion is a presentation: it changes neither the graph nor the sizes and the price (MOD-DEC-131), and it is not
// a check of the hardware (the angle and the stroke are those of the prototype r1, not of the catalogue — FINDINGS 330).
//
// Product axes as in scene.ts: X to the right, Y to the back (0 = front plane), Z up, millimetres.
import type { Graph, Part, Vec3 } from './contract.js';

/** Opening angle of a door in the view: `CabinetView.applyMotion` of r1 (r1.html:51547), the same for every hinge. */
export const DOOR_OPEN_ANGLE_DEG = 105;

/** Stroke of a drawer in the view: `v18MotionData` of r1 (r1.html:55220), 0.7 of the box depth, at least 40 mm inside. */
export const drawerTravelMm = (boxDepthMm: number) => Math.min(boxDepthMm * 0.7, Math.max(0, boxDepthMm - 40));

interface MotionBase {
  /** Stable key: `door:<part id>` or `drawer:<assembly id>`; the state of a motion survives edits that keep its key. */
  key: string;
  /** The mechanism the motion comes from. */
  mechanismId: string;
  /** Graph parts that move. */
  partIds: string[];
  /** Places of the moving parts and the motion itself: when it changes, the motion starts closed again (as in r1). */
  signature: string;
}

export interface DoorMotion extends MotionBase {
  kind: 'door';
  hinge: 'left' | 'right';
  /** Axis of the turn: vertical, through the hinge edge of the leaf on its inner face (as in r1). */
  pivotMm: Vec3;
  angleDeg: number;
  /** Drawers behind this door: closing the door first closes them (r1 `CabinetMotion`). */
  drawerKeys: string[];
}

export interface DrawerMotion extends MotionBase {
  kind: 'drawer';
  /** Distance the drawer comes out, toward the front (−Y). */
  travelMm: number;
  travelStatus: 'ILLUSTRATIVE_NOT_HARDWARE_QUALIFIED';
  /** Doors in front of this drawer: opening the drawer first opens them (r1 `CabinetMotion`). */
  doorKeys: string[];
}

/**
 * A leaf of a sliding door system (MOD-DEC-184, 571): it moves along X on its track. The part that moves is the insert
 * of the leaf; the profiles of the leaf are its hardware and follow it (`hostPartId`). Positions are the left edge of
 * the leaf in product X; the view keeps them (MOD-DEC-131: not in the project, the sizes or the price).
 */
export interface SlideMotion extends MotionBase {
  kind: 'slide';
  /** Number of the leaf in its system, from 0, left to right when closed. */
  leafIndex: number;
  /** Track of the leaf, from 0 — the front one (`tracks` of the system). */
  track: number;
  /** Width of the leaf (frame included), mm. */
  widthMm: number;
  /** Left edge of the closed leaf, product X. */
  closedMm: number;
  /** Travel of the left edge: from the leftmost to the rightmost closed position of the set (FINDINGS 551, 1243). */
  minMm: number;
  maxMm: number;
  /** The clear opening of the system along X (its motion envelope), product X. */
  openingMm: [number, number];
  /** Drawers behind the opening with their span along X: a leaf over one keeps it closed (r1 `swAccess`). */
  drawers: { key: string; x0: number; x1: number }[];
}

export type SceneMotion = DoorMotion | DrawerMotion | SlideMotion;

function boxOf(p: Part): { min: Vec3; max: Vec3 } {
  const { originMm: o, uAxis: u, vAxis: v, nAxis: n } = p.placement,
    { lengthMm: L, widthMm: W, panelThicknessMm: T } = p.finishedWithEdge,
    min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const [s, t] of p.contourMm ?? [
    [0, 0],
    [L, 0],
    [L, W],
    [0, W],
  ])
    for (const r of [0, T])
      for (let i = 0; i < 3; i++) {
        const c = o[i] + u[i] * s + v[i] * t + n[i] * r;
        min[i] = Math.min(min[i], c);
        max[i] = Math.max(max[i], c);
      }
  return { min, max };
}

/** Rectangle in the front plane (X, Z) of some boxes. */
function front(boxes: { min: Vec3; max: Vec3 }[]) {
  return {
    x0: Math.min(...boxes.map((b) => b.min[0])),
    x1: Math.max(...boxes.map((b) => b.max[0])),
    z0: Math.min(...boxes.map((b) => b.min[2])),
    z1: Math.max(...boxes.map((b) => b.max[2])),
  };
}

// Two fronts overlap when they share more than a millimetre in both directions; neighbours with a gap do not.
const overlap = (a: ReturnType<typeof front>, b: ReturnType<typeof front>) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1;

/** The doors and drawers of a graph that the view can open: the doors, then the drawers, each in the order of the mechanisms. */
export function sceneMotions(g: Pick<Graph, 'parts' | 'mechanisms'>): SceneMotion[] {
  const parts = new Map(g.parts.map((p) => [p.id, p])),
    boxes = new Map(g.parts.map((p) => [p.id, boxOf(p)])),
    doors: (DoorMotion & { rect: ReturnType<typeof front> })[] = [],
    drawers: (DrawerMotion & { rect: ReturnType<typeof front> })[] = [],
    slides: SlideMotion[] = [];
  for (const m of g.mechanisms) {
    if (m.kind === 'SLIDING_SYSTEM') slides.push(...slideMotions(m, boxes));
    if (m.kind === 'HINGE') {
      const leaf = m.partIds.map((id) => parts.get(id)).find((p) => p?.role === 'HINGED_FACADE_LEAF');
      if (!leaf || doors.some((d) => d.partIds[0] === leaf.id)) continue;
      const box = boxes.get(leaf.id)!,
        carcass = m.partIds.map((id) => boxes.get(id)).find((b, i) => b && m.partIds[i] !== leaf.id),
        // The side of the hinges: the mechanism says it (wardrobe), or the carcass panel they are on is on that side.
        hinge: 'left' | 'right' =
          m.params.hingeSide === 'left' || m.params.hingeSide === 'right'
            ? m.params.hingeSide
            : carcass && carcass.min[0] + carcass.max[0] > box.min[0] + box.max[0]
              ? 'right'
              : 'left',
        pivotMm: Vec3 = [hinge === 'right' ? box.max[0] : box.min[0], box.max[1], (box.min[2] + box.max[2]) / 2];
      doors.push({
        kind: 'door',
        key: 'door:' + leaf.id,
        mechanismId: m.id,
        partIds: [leaf.id],
        hinge,
        pivotMm,
        angleDeg: DOOR_OPEN_ANGLE_DEG,
        drawerKeys: [],
        signature: JSON.stringify([box.min, box.max, hinge]),
        rect: front([box]),
      });
    }
    if (m.kind === 'DRAWER_RUNNER') {
      const own = g.parts.filter((p) => p.assemblyId === m.assemblyId);
      if (!own.length || drawers.some((d) => d.key === 'drawer:' + m.assemblyId)) continue;
      const sides = own.filter((p) => p.role === 'DRAWER_BOX_SIDE').map((p) => boxes.get(p.id)!),
        depth = typeof m.params.boxD === 'number' ? m.params.boxD : sides.length ? Math.max(...sides.map((b) => b.max[1] - b.min[1])) : 0,
        travelMm = drawerTravelMm(depth);
      drawers.push({
        kind: 'drawer',
        key: 'drawer:' + m.assemblyId,
        mechanismId: m.id,
        partIds: own.map((p) => p.id),
        travelMm,
        travelStatus: 'ILLUSTRATIVE_NOT_HARDWARE_QUALIFIED',
        doorKeys: [],
        signature: JSON.stringify([own.map((p) => [p.id, boxes.get(p.id)!.min, boxes.get(p.id)!.max]), travelMm]),
        rect: front(own.map((p) => boxes.get(p.id)!)),
      });
    }
  }
  for (const d of doors)
    for (const r of drawers)
      if (overlap(d.rect, r.rect)) {
        d.drawerKeys.push(r.key);
        r.doorKeys.push(d.key);
      }
  for (const s of slides)
    for (const r of drawers)
      if (r.rect.x1 - r.rect.x0 > 1 && r.rect.x0 < s.openingMm[1] - 1 && r.rect.x1 > s.openingMm[0] + 1) s.drawers.push({ key: r.key, x0: r.rect.x0, x1: r.rect.x1 });
  return [...[...doors, ...drawers].map(({ rect: _rect, ...m }) => m), ...slides];
}

const list = (v: unknown): number[] => (typeof v === 'string' && v ? v.split(',').map(Number) : []);

/**
 * The leaves of a sliding door system: the inserts of its parts in the order of the leaves, the tracks and the closed
 * positions of its parameters. A system without built leaves (no doors, not built) has none. The closed left edge of a
 * leaf is that of its insert less half of what the frame adds (the insert stands in the middle of its leaf).
 */
function slideMotions(m: Pick<Graph['mechanisms'][number], 'id' | 'partIds' | 'params' | 'motionEnvelopes'>, boxes: Map<string, { min: Vec3; max: Vec3 }>): SlideMotion[] {
  const p = m.params,
    tracks = list(p.tracks),
    w = typeof p.leafWidthMm === 'number' ? p.leafWidthMm : null,
    iw = typeof p.insertWidthMm === 'number' ? p.insertWidthMm : null,
    env = m.motionEnvelopes[0];
  if (p.status !== 'CANDIDATE' || w === null || iw === null || !env || tracks.length !== m.partIds.length || m.partIds.some((id) => !boxes.has(id))) return [];
  // Leaves of different tracks pass each other only at different depths: a track without its own place in the model
  // gives no motion (FINDINGS 1246; the r1 scheme «Три дорожки» it was written for is gone, MOD-DEC-580).
  const depth = m.partIds.map((id) => boxes.get(id)!);
  for (let a = 0; a < depth.length; a++)
    for (let b = a + 1; b < depth.length; b++)
      if (tracks[a] !== tracks[b] && Math.min(depth[a]!.max[1], depth[b]!.max[1]) - Math.max(depth[a]!.min[1], depth[b]!.min[1]) > 0) return [];
  const closed = m.partIds.map((id) => boxes.get(id)!.min[0] - (w - iw) / 2),
    { minMm, maxMm } = slideTravelMm(closed),
    openingMm: [number, number] = [env.minMm[0], env.minMm[0] + env.sizeMm[0]];
  return m.partIds.map((id, i) => ({
    kind: 'slide',
    key: 'slide:' + id,
    mechanismId: m.id,
    partIds: [id],
    leafIndex: i,
    track: tracks[i]!,
    widthMm: w,
    closedMm: closed[i]!,
    minMm,
    maxMm,
    openingMm,
    drawers: [],
    signature: JSON.stringify([boxes.get(id)!.min, boxes.get(id)!.max, tracks, closed, w]),
  }));
}

// ---------------------------------------------------------------- the leaves of a sliding system (MOD-DEC-571)

/**
 * Travel of the left edges of the leaves of a set: between its outermost closed positions — the leaves never come
 * nearer the panels than closed (FINDINGS 551 of the access to the drawers, 1243).
 */
export function slideTravelMm(closed: readonly number[]): { minMm: number; maxMm: number } {
  return { minMm: Math.min(...closed), maxMm: Math.max(...closed) };
}

const EPS = 0.001;

/**
 * A position of the leaves of one system (`__MODULERO_SW_PROJECT_POSE__` of r1, r1.html:84961): `wanted` left edges
 * are clamped to the travel; the leaves of one track keep their order and do not overlap. When one leaf moves, it
 * stops at its neighbours on the track; when several move (a button), each track is pushed together from both ends.
 * Null — the leaves of a track do not fit in the travel. `leaves` are the leaves of the system in their order.
 */
export function slidePose(leaves: readonly SlideMotion[], current: readonly number[], wanted: readonly number[]): number[] | null {
  if (!leaves.length || wanted.length !== leaves.length || current.length !== leaves.length || !wanted.every(Number.isFinite)) return null;
  const { minMm: lo0, maxMm: hi0 } = leaves[0]!,
    w = leaves[0]!.widthMm,
    next = wanted.map((x) => Math.max(lo0, Math.min(hi0, x))),
    changed = next.map((x, i) => (Math.abs(x - current[i]!) > 1e-6 ? i : -1)).filter((i) => i >= 0);
  for (const track of new Set(leaves.map((l) => l.track))) {
    const ids = leaves
      .map((l, i) => (l.track === track ? i : -1))
      .filter((i) => i >= 0)
      .sort((a, b) => leaves[a]!.closedMm - leaves[b]!.closedMm);
    if ((ids.length - 1) * w > hi0 - lo0 + EPS) return null;
    if (changed.length === 1 && ids.includes(changed[0]!)) {
      const k = ids.indexOf(changed[0]!),
        lo = k ? current[ids[k - 1]!]! + w : lo0,
        hi = k < ids.length - 1 ? current[ids[k + 1]!]! - w : hi0;
      next[ids[k]!] = Math.max(lo, Math.min(hi, next[ids[k]!]!));
    } else {
      ids.forEach((id, k) => (next[id] = Math.max(k ? next[ids[k - 1]!]! + w : lo0, next[id]!)));
      for (let k = ids.length - 1; k >= 0; k--) next[ids[k]!] = Math.min(k === ids.length - 1 ? hi0 : next[ids[k + 1]!]! - w, next[ids[k]!]!);
    }
    if (ids.some((id, k) => next[id]! < lo0 - EPS || next[id]! > hi0 + EPS || (k > 0 && next[id]! < next[ids[k - 1]!]! + w - EPS))) return null;
  }
  return next;
}

/** «Закрыть», «Открыть слева» (every leaf to the right), «Открыть справа» (every leaf to the left) of r1 (r1.html:85147). */
export function slideParked(leaves: readonly SlideMotion[], how: 'closed' | 'left' | 'right'): number[] {
  const closed = leaves.map((l) => l.closedMm);
  if (how === 'closed') return closed;
  return slidePose(leaves, closed, leaves.map((l) => (how === 'left' ? l.maxMm : l.minMm))) ?? closed;
}

/** Overlaps of the leaves of different tracks at a position, mm along X: the pairs that cover each other. */
export function slideOverlaps(leaves: readonly SlideMotion[], positions: readonly number[]): { a: number; b: number; mm: number }[] {
  const out: { a: number; b: number; mm: number }[] = [];
  for (let a = 0; a < leaves.length; a++)
    for (let b = a + 1; b < leaves.length; b++) {
      if (leaves[a]!.track === leaves[b]!.track) continue;
      const mm = Math.min(positions[a]! + leaves[a]!.widthMm, positions[b]! + leaves[b]!.widthMm) - Math.max(positions[a]!, positions[b]!);
      if (mm > EPS) out.push({ a, b, mm: Math.round(mm * 1000) / 1000 });
    }
  return out;
}

/**
 * The free spans between the leaves at a position (nominalFree of r1, r1.html:85132), product X: within the span the
 * set covers when closed — the gaps at the panels, which no leaf reaches, are not spans to open (FINDINGS 1243).
 */
export function slideFree(leaves: readonly SlideMotion[], positions: readonly number[]): [number, number][] {
  if (!leaves.length) return [];
  const x0 = leaves[0]!.minMm,
    x1 = leaves[0]!.maxMm + leaves[0]!.widthMm,
    covered = leaves.map((l, i) => [Math.max(x0, positions[i]!), Math.min(x1, positions[i]! + l.widthMm)] as const).sort((a, b) => a[0] - b[0]),
    free: [number, number][] = [];
  let end = x0;
  for (const [a, b] of covered) {
    if (a > end + EPS) free.push([end, a]);
    end = Math.max(end, b);
  }
  if (end < x1 - EPS) free.push([end, x1]);
  return free;
}

/**
 * Is a drawer span free of every leaf at a position (`swAccess` of r1, r1.html:59547)? The gaps at the panels no leaf
 * reaches are free: an inner front set in the opening by 2 mm (MOD-DEC-514, 544; FINDINGS 1862) reaches into them.
 */
export function slideClears(leaves: readonly SlideMotion[], positions: readonly number[], span: { x0: number; x1: number }): boolean {
  if (!leaves.length) return false;
  const x0 = Math.max(span.x0, leaves[0]!.minMm),
    x1 = Math.min(span.x1, leaves[0]!.maxMm + leaves[0]!.widthMm);
  return slideFree(leaves, positions).some(([a, b]) => x0 >= a - EPS && x1 <= b + EPS);
}
