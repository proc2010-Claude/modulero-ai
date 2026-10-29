// Doors and drawers that the 3D view opens (task V2, MOD-DEC-131): what moves, about which axis, how far — only from
// the mechanisms of the graph. A hinge mechanism turns its door leaf, a drawer runner moves every part of its drawer,
// a sliding door system moves each leaf along its track (MOD-DEC-184, 571: the leaves of one track do not pass each
// other, no leaf leaves the travel of the set).
// The motion is a presentation: it changes neither the graph nor the sizes and the price (MOD-DEC-131), and it is not
// a check of the hardware (the angle and the stroke are those of the prototype r1, not of the catalogue — FINDINGS 330).
// MOD-DEC-742 (FINDINGS 3050–3052): where the mechanism gives the opening of its door (the wardrobe), the angle is its
// (a door at a room wall opens to the wall), a door with a neighbouring front at its hinge side opens square, and an
// open door stands in front of its hinge panel, not in the opening — the turn is about the axis that brings it there,
// as a hinge does, not about its edge as in r1; the doors of the other products keep r1 until their cores give it;
// doorDrawerClashes says where an open door would still meet a drawer pulled out. A lift front (FACADE_LIFT) turns up
// about its top edge to the angle of its swept space (the working angle), a folding one folding its lower leaf back.
//
// Product axes as in scene.ts: X to the right, Y to the back (0 = front plane), Z up, millimetres.
import type { Graph, Part, Vec3 } from './contract.js';

/** Opening angle of a door in the view: `CabinetView.applyMotion` of r1 (r1.html:51547), when its mechanism gives none. */
export const DOOR_OPEN_ANGLE_DEG = 105;

/**
 * A door with a front of a neighbour at its hinge side opens square, no further: beyond it would go in front of that
 * front — a door or a drawer of the next section (MOD-DEC-742, FINDINGS 3050).
 */
export const DOOR_SQUARE_ANGLE_DEG = 90;

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
  /**
   * Axis of the turn, vertical: the one that brings the open leaf in front of its hinge panel (doorPivot); through the
   * hinge edge of the leaf on its inner face (r1) when the mechanism gives no opening or has no panel at that edge.
   */
  pivotMm: Vec3;
  angleDeg: number;
  /**
   * What stops the door before the angle of its hinge: a room wall (its mechanism says it), a neighbouring front; null —
   * nothing. Absent where the product does not give the opening of its doors (r1, FINDINGS 3050).
   */
  stop?: 'ROOM_WALL' | 'NEIGHBOUR' | null;
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

/**
 * A lift front (FACADE_LIFT, MOD-DEC-320): the upper leaf turns up about its top edge, a lower leaf of a folding front
 * hangs on its lower edge and folds back onto it (the swept space of wardrobe/lifts.ts, FINDINGS 533). liftLeafPose
 * gives each leaf at a share of the stroke.
 */
export interface LiftMotion extends MotionBase {
  kind: 'lift';
  front: 'FLAP' | 'FOLDING';
  /** Axis of the upper leaf: along X, at its top edge — on its inner face, in front of it when it opens beyond square. */
  pivotMm: Vec3;
  angleDeg: number;
  /** The working angle of the lift, or a placeholder of the view when the lift gives none (the angle of a door, r1). */
  angleBasis: 'WORKING_ANGLE' | 'ILLUSTRATIVE';
  /** The leaves, the upper first: the line each hangs on (its top edge on its inner face, closed) and whether it folds back. */
  leaves: { partId: string; hingeMm: Vec3; folds: boolean }[];
}

export type SceneMotion = DoorMotion | DrawerMotion | SlideMotion | LiftMotion;

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
    doors: (DoorMotion & { rect: ReturnType<typeof front>; box: Box; panel: Box | undefined; partition: boolean; core: boolean })[] = [],
    drawers: (DrawerMotion & { rect: ReturnType<typeof front> })[] = [],
    slides: SlideMotion[] = [],
    lifts: LiftMotion[] = [];
  for (const m of g.mechanisms) {
    if (m.kind === 'SLIDING_SYSTEM') slides.push(...slideMotions(m, boxes));
    if (m.kind === 'FACADE_LIFT') {
      const lift = liftMotion(m, parts, boxes);
      if (lift) lifts.push(lift);
    }
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
        stop = m.params.openStop === 'ROOM_WALL' ? ('ROOM_WALL' as const) : null,
        // The core of the product gives the opening of its doors (the wardrobe, MOD-DEC-742); without it — r1.
        core = typeof m.params.openAngleDeg === 'number' && m.params.openAngleDeg > 0,
        angleDeg = core ? (m.params.openAngleDeg as number) : DOOR_OPEN_ANGLE_DEG;
      doors.push({
        kind: 'door',
        key: 'door:' + leaf.id,
        mechanismId: m.id,
        partIds: [leaf.id],
        hinge,
        pivotMm: doorPivot(box, hinge, core ? carcass : undefined, m.params.position === 'PARTITION', stop, angleDeg),
        angleDeg,
        ...(core ? { stop } : {}),
        drawerKeys: [],
        signature: JSON.stringify([box.min, box.max, hinge]),
        rect: front([box]),
        box,
        panel: carcass,
        partition: m.params.position === 'PARTITION',
        core,
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
  // A door that would turn beyond square in front of another front at its hinge side opens square (FINDINGS 3050).
  const fronts = [...doors, ...drawers];
  for (const d of doors) {
    if (!d.core || d.stop || d.angleDeg <= DOOR_SQUARE_ANGLE_DEG) continue;
    const s = d.hinge === 'right' ? 1 : -1,
      edge = s * (d.hinge === 'right' ? d.rect.x1 : d.rect.x0),
      reach = Math.max(...footprint(d.box, d.hinge, d.pivotMm, d.angleDeg).map((c) => s * c[0]));
    const met = fronts.some((f) => {
      if (f === d || Math.min(f.rect.z1, d.rect.z1) - Math.max(f.rect.z0, d.rect.z0) <= 1) return false;
      const near = s * (d.hinge === 'right' ? f.rect.x0 : f.rect.x1);
      return near > edge - 1 && near < reach - 1;
    });
    if (!met) continue;
    d.angleDeg = DOOR_SQUARE_ANGLE_DEG;
    d.stop = 'NEIGHBOUR';
    d.pivotMm = doorPivot(d.box, d.hinge, d.panel, d.partition, null, d.angleDeg);
  }
  for (const s of slides)
    for (const r of drawers)
      if (r.rect.x1 - r.rect.x0 > 1 && r.rect.x0 < s.openingMm[1] - 1 && r.rect.x1 > s.openingMm[0] + 1) s.drawers.push({ key: r.key, x0: r.rect.x0, x1: r.rect.x1 });
  return [
    ...doors.map(({ rect: _rect, box: _box, panel: _panel, partition: _partition, core: _core, ...m }) => m),
    ...drawers.map(({ rect: _rect, ...m }) => m),
    ...slides,
    ...lifts,
  ];
}

type Box = { min: Vec3; max: Vec3 };
const rad = (deg: number) => (deg * Math.PI) / 180;

/** A point (X, Y) turned about the vertical axis through `pivot` by `deg`, as the view turns a door with hinges at `hinge`. */
function turnXY(x: number, y: number, pivot: Vec3, hinge: 'left' | 'right', deg: number): [number, number] {
  const a = rad(hinge === 'right' ? deg : -deg),
    dx = x - pivot[0],
    dy = y - pivot[1];
  return [pivot[0] + dx * Math.cos(a) - dy * Math.sin(a), pivot[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** The corners of a door in plan (X, Y) when it is open to `deg` about `pivot`. */
function footprint(box: Box, hinge: 'left' | 'right', pivot: Vec3, deg: number): [number, number][] {
  return [box.min[0], box.max[0]].flatMap((x) => [box.min[1], box.max[1]].map((y) => turnXY(x, y, pivot, hinge, deg)));
}

/**
 * The axis a door turns about (MOD-DEC-742, FINDINGS 3050): the one that brings it, open to `deg`, in front of its
 * hinge panel — its inner face where the panel lets it stand, its hinge edge never behind the face of the closed door
 * (nor behind its front face when it opens beyond square):
 * - at a room wall: its outer face on the plane of the wall (the outer face of the panel);
 * - an inset door (its hinge edge in the opening): in the opening by its thickness, as an inset hinge takes it;
 * - on a partition: up to the middle of it — the door of the other side takes the other half;
 * - else on the inner face of the panel: it does not come into the opening (a hinge of zero protrusion, 288).
 * The hinge edge of the leaf on its inner face (r1) when the mechanism has no vertical panel at that edge.
 */
export function doorPivot(box: Box, hinge: 'left' | 'right', panel: Box | undefined, partition: boolean, stop: 'ROOM_WALL' | null, deg: number): Vec3 {
  const s = hinge === 'right' ? 1 : -1,
    edge = s * (hinge === 'right' ? box.max[0] : box.min[0]),
    back = box.max[1],
    t = box.max[1] - box.min[1],
    z = (box.min[2] + box.max[2]) / 2,
    r1: Vec3 = [s * edge, back, z];
  if (!panel || !(deg > 0)) return r1;
  const inner = s * (hinge === 'right' ? panel.min[0] : panel.max[0]),
    outer = s * (hinge === 'right' ? panel.max[0] : panel.min[0]),
    T = outer - inner;
  // Only a vertical panel at the hinge edge of the leaf, over its height.
  if (!(T > 0) || T > 4 * t || Math.abs(edge - inner) > T + t || Math.min(panel.max[2], box.max[2]) - Math.max(panel.min[2], box.min[2]) <= 0) return r1;
  const face = stop === 'ROOM_WALL' ? outer - t : edge <= inner + 0.5 ? inner - t : partition ? inner + T / 2 - t : inner,
    // Where the hinge corner of the inner face goes (local across u = s·X, Y): at the face, in front of the closed
    // door's inner face, and by the thickness when the door opens beyond square, so that its front face stays there too.
    to: [number, number] = [face, back + Math.min(0, t * Math.cos(rad(deg)))],
    from: [number, number] = [edge, back],
    c = Math.cos(rad(deg)),
    sn = Math.sin(rad(deg)),
    // P with to − P = R(from − P): (I − R)·P = to − R·from.
    rx = to[0] - (from[0] * c - from[1] * sn),
    ry = to[1] - (from[0] * sn + from[1] * c),
    a = 1 - c,
    det = a * a + sn * sn;
  if (det < 1e-9) return r1;
  return [s * ((a * rx - sn * ry) / det), (sn * rx + a * ry) / det, z];
}

/**
 * Open doors that would still meet a drawer pulled out (MOD-DEC-742, FINDINGS 3051): each door open to its angle, each
 * drawer of a runner out by its stroke, the overlap of their plans across (X) where they share a height. The spacer of
 * 331, 360 keeps the drawers out of the way of the door; this says where it does not.
 */
export function doorDrawerClashes(g: Pick<Graph, 'parts' | 'mechanisms'>): { doorKey: string; drawerKey: string; mm: number }[] {
  const motions = sceneMotions(g),
    boxes = new Map(g.parts.map((p) => [p.id, boxOf(p)])),
    out: { doorKey: string; drawerKey: string; mm: number }[] = [];
  for (const d of motions) {
    if (d.kind !== 'door') continue;
    const box = boxes.get(d.partIds[0]!)!,
      plan = footprint(box, d.hinge, d.pivotMm, d.angleDeg),
      x0 = Math.min(...plan.map((c) => c[0])),
      x1 = Math.max(...plan.map((c) => c[0])),
      y0 = Math.min(...plan.map((c) => c[1])),
      y1 = Math.max(...plan.map((c) => c[1]));
    for (const r of motions) {
      if (r.kind !== 'drawer') continue;
      // The runners come out with the drawer: its path is the box and the clearance of the runners at its sides.
      const clearance = g.mechanisms.find((m) => m.id === r.mechanismId)?.params.clearanceMm,
        side = typeof clearance === 'number' && clearance > 0 ? clearance : 0,
        b = r.partIds.map((id) => boxes.get(id)!),
        rx0 = Math.min(...b.map((q) => q.min[0])) - side,
        rx1 = Math.max(...b.map((q) => q.max[0])) + side,
        ry0 = Math.min(...b.map((q) => q.min[1])) - r.travelMm,
        ry1 = Math.max(...b.map((q) => q.max[1])) - r.travelMm,
        rz0 = Math.min(...b.map((q) => q.min[2])),
        rz1 = Math.max(...b.map((q) => q.max[2])),
        mm = Math.min(x1, rx1) - Math.max(x0, rx0);
      if (mm > 0.5 && Math.min(y1, ry1) - Math.max(y0, ry0) > 0.5 && Math.min(box.max[2], rz1) - Math.max(box.min[2], rz0) > 1) out.push({ doorKey: d.key, drawerKey: r.key, mm: Math.round(mm * 10) / 10 });
    }
  }
  return out;
}

/**
 * The lift front of a FACADE_LIFT mechanism (task LIFT): its leaves in the order of the mechanism (the upper first), the
 * angle of its swept space when it is the working angle, else the angle of a door of the view (a placeholder).
 */
function liftMotion(m: Pick<Graph['mechanisms'][number], 'id' | 'partIds' | 'params'>, parts: Map<string, Part>, boxes: Map<string, Box>): LiftMotion | null {
  const leafIds = m.partIds.filter((id) => parts.get(id)?.role === 'LIFT_FACADE_LEAF');
  if (!leafIds.length) return null;
  const leafBoxes = leafIds.map((id) => boxes.get(id)!),
    upper = leafBoxes[0]!,
    hingeOf = (b: Box): Vec3 => [(b.min[0] + b.max[0]) / 2, b.max[1], b.max[2]],
    working = m.params.envelopeBasis === 'ESTIMATE_ROTATION_ABOUT_TOP_EDGE' && typeof m.params.sweepAngleDeg === 'number',
    angleDeg = working ? (m.params.sweepAngleDeg as number) : DOOR_OPEN_ANGLE_DEG,
    // Beyond square the axis stands in front of the inner face by what the thickness would turn behind it.
    t = upper.max[1] - upper.min[1],
    top = hingeOf(upper);
  top[1] += Math.min(0, t * Math.cos(rad(angleDeg)));
  return {
    kind: 'lift',
    key: 'lift:' + m.id,
    mechanismId: m.id,
    partIds: leafIds,
    front: m.params.frontKind === 'FOLDING' && leafIds.length > 1 ? 'FOLDING' : 'FLAP',
    pivotMm: top,
    angleDeg,
    angleBasis: working ? 'WORKING_ANGLE' : 'ILLUSTRATIVE',
    leaves: leafIds.map((id, i) => ({ partId: id, hingeMm: hingeOf(leafBoxes[i]!), folds: i > 0 })),
    signature: JSON.stringify([leafBoxes.map((b) => [b.min, b.max]), angleDeg]),
  };
}

/**
 * A leaf of a lift front at a share of its stroke (0 closed … 1 open): it turns about the X axis by `angleDeg`
 * (positive — its lower edge forward and up) about its own hinge line, then the line moves to `hingeMm`. The upper leaf
 * turns about its top edge by the angle of the share; a folding leaf hangs on the upper one and folds back onto it
 * (by half a turn when open), so that open the two lie face to face (the swept space of wardrobe/lifts.ts).
 */
export function liftLeafPose(m: LiftMotion, leaf: number, share: number): { angleDeg: number; hingeMm: Vec3 } {
  const l = m.leaves[leaf]!,
    a = m.angleDeg * share,
    dy = l.hingeMm[1] - m.pivotMm[1],
    dz = l.hingeMm[2] - m.pivotMm[2],
    c = Math.cos(rad(a)),
    sn = Math.sin(rad(a));
  return {
    angleDeg: l.folds ? a - 180 * share : a,
    hingeMm: [l.hingeMm[0], m.pivotMm[1] + dy * c + dz * sn, m.pivotMm[2] - dy * sn + dz * c],
  };
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
