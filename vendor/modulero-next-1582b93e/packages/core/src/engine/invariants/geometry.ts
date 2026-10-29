// Geometry used by the invariant checks: part boxes in product axes and operation volumes in part axes.
import type { Box3, Groove, Hole, Notch, Operation, Part, Rational, Vec3 } from '../contract.js';

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** Box of a finished part in product axes from its placement (the one transform, ENGINE.md §2.3). */
export function partBox(p: Part): Aabb {
  const { originMm: origin, uAxis: u, vAxis: v, nAxis: n } = p.placement,
    corners: Vec3[] = [];
  for (const a of [0, p.finishedWithEdge.lengthMm]) for (const b of [0, p.finishedWithEdge.widthMm]) for (const c of [0, p.finishedWithEdge.panelThicknessMm])
    corners.push(add(add(add(origin, scale(u, a)), scale(v, b)), scale(n, c)));
  return {
    min: [0, 1, 2].map((i) => Math.min(...corners.map((q) => q[i]))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...corners.map((q) => q[i]))) as Vec3,
  };
}

export const boxToAabb = (b: Box3): Aabb => ({ min: b.minMm, max: add(b.minMm, b.sizeMm) });

/** Overlap of two boxes along each axis; negative or zero means apart. */
export const overlap = (a: Aabb, b: Aabb): Vec3 =>
  [0, 1, 2].map((i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])) as Vec3;

/** Boxes intersect in volume by more than `tol` on every axis. */
export const intersects = (a: Aabb, b: Aabb, tol: number): boolean => overlap(a, b).every((d) => d > tol);

/** Point of part axes (u along the length, v along the width, n along the thickness) in product axes. */
export const partPoint = (p: Part, u: number, v: number, n: number): Vec3 =>
  add(add(add(p.placement.originMm, scale(p.placement.uAxis, u)), scale(p.placement.vAxis, v)), scale(p.placement.nAxis, n));

/** Volume of a hole in part axes (u, v, n), as a box around the cylinder. Edges A/B run along the length at v = 0 / width, C/D along the width at u = 0 / length. */
export function holeVolume(h: Hole, p: Part): Aabb {
  const r = h.diameterMm / 2,
    { lengthMm: L, widthMm: W, panelThicknessMm: T } = p.finishedWithEdge,
    d = h.through || h.depthMm === null ? (h.mode === 'FACE' ? T : Infinity) : h.depthMm;
  if (h.mode === 'FACE') {
    const n0 = h.face === 'N_NEG' ? 0 : T - d,
      n1 = h.face === 'N_NEG' ? d : T;
    return { min: [h.xMm - r, h.yMm - r, n0], max: [h.xMm + r, h.yMm + r, n1] };
  }
  const c = T / 2;
  switch (h.edge) {
    case 'A':
      return { min: [h.xMm - r, 0, c - r], max: [h.xMm + r, d, c + r] };
    case 'B':
      return { min: [h.xMm - r, W - d, c - r], max: [h.xMm + r, W, c + r] };
    case 'C':
      return { min: [0, h.xMm - r, c - r], max: [d, h.xMm + r, c + r] };
    default:
      return { min: [L - d, h.xMm - r, c - r], max: [L, h.xMm + r, c + r] };
  }
}

export const notchVolume = (o: Notch): Aabb => ({ min: [o.uRangeMm[0], o.vRangeMm[0], o.nRangeMm[0]], max: [o.uRangeMm[1], o.vRangeMm[1], o.nRangeMm[1]] });

/**
 * Volume of a groove in part axes: from `startMm` to `endMm` along its direction, `grooveWidthMm` about `offsetMm`
 * across it, `grooveDepthMm` into the face; a groove in an edge — `offsetMm` across the thickness, `grooveDepthMm` into
 * the part from the edge. Null — neither a face nor an edge.
 */
export function grooveVolume(q: Groove, p: Part): Aabb | null {
  const T = p.finishedWithEdge.panelThicknessMm,
    [a, b] = [Math.min(q.startMm, q.endMm), Math.max(q.startMm, q.endMm)],
    [c, d] = [q.offsetMm - q.grooveWidthMm / 2, q.offsetMm + q.grooveWidthMm / 2];
  // A groove in an edge (the groove of a handle along the edge of its front, FINDINGS 3216): along the edge, into the
  // part from it, across the thickness centred on the offset.
  if (!q.face && q.edge) {
    const { lengthMm: L, widthMm: W } = p.finishedWithEdge,
      h = q.grooveDepthMm;
    return q.edge === 'A' ? { min: [a, 0, c], max: [b, h, d] } : q.edge === 'B' ? { min: [a, W - h, c], max: [b, W, d] } : q.edge === 'C' ? { min: [0, a, c], max: [h, b, d] } : { min: [L - h, a, c], max: [L, b, d] };
  }
  if (!q.face) return null;
  const [n0, n1] = q.face === 'N_POS' ? [T - q.grooveDepthMm, T] : [0, q.grooveDepthMm];
  return q.along === 'LENGTH' ? { min: [a, c, n0], max: [b, d, n1] } : { min: [c, a, n0], max: [d, b, n1] };
}

/**
 * The cylinder of a hole and a box of part axes share a volume deeper than `tol`: along the axis of the hole they
 * overlap by more than `tol`, across it the box comes nearer than r − tol to the axis (the circle, not its square).
 */
export function holeHitsBox(h: Hole, p: Part, box: Aabb, tol: number): boolean {
  const v = holeVolume(h, p),
    axis = h.mode === 'FACE' ? 2 : h.edge === 'A' || h.edge === 'B' ? 1 : 0,
    o = overlap(v, box);
  if (!(o[axis] > tol)) return false;
  const across = [0, 1, 2].filter((i) => i !== axis),
    gap = across.map((i) => {
      const c = (v.min[i] + v.max[i]) / 2;
      return Math.max(box.min[i] - c, 0, c - box.max[i]);
    });
  return Math.hypot(gap[0]!, gap[1]!) < h.diameterMm / 2 - tol && across.every((i) => o[i] > tol);
}

export const isHole = (o: Operation): o is Hole => o.op === 'HOLE';

/** Exact value of a rational; checks keep it exact where they compare rationals. */
export const ratValue = (r: Rational): number => r.numerator / r.denominator;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** a − b as a reduced rational (integers only). */
export function ratSub(a: Rational, b: Rational): Rational {
  const n = a.numerator * b.denominator - b.numerator * a.denominator,
    d = a.denominator * b.denominator,
    k = gcd(n, d) || 1;
  return { numerator: n / k, denominator: d / k };
}

export const ratEq = (a: Rational, b: Rational): boolean => a.numerator * b.denominator === b.numerator * a.denominator;

export function ratSum(list: Rational[]): Rational {
  let acc: Rational = { numerator: 0, denominator: 1 };
  for (const r of list) acc = ratSub(acc, { numerator: -r.numerator, denominator: r.denominator });
  return acc;
}

/** Rational from a decimal number of mm (1.5 → 3/2); exact for the decimals the prototype writes. */
export function ratFromDecimal(x: number): Rational {
  let d = 1;
  while (!Number.isInteger(Math.round(x * d * 1e9) / 1e9) && d < 1e9) d *= 10;
  const n = Math.round(x * d),
    k = gcd(n, d) || 1;
  return { numerator: n / k, denominator: d / k };
}

// ---------------------------------------------------------------- solids of parts (KF-20, MOD-DEC-294)

/** A convex solid: its vertices and the directions of its faces and edges, in product axes. */
interface Convex {
  points: Vec3[];
  normals: Vec3[];
  edges: Vec3[];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const cross2 = (a: number[], b: number[], c: number[]) => (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);

/** Triangles of a simple polygon (ear clipping); the polygon may run either way. */
export function triangulate(input: readonly (readonly number[])[]): number[][][] {
  const p = input.map((v) => [v[0]!, v[1]!]);
  const signed = p.reduce((s, a, i) => s + a[0]! * p[(i + 1) % p.length]![1]! - p[(i + 1) % p.length]![0]! * a[1]!, 0);
  if (signed < 0) p.reverse();
  const ids = p.map((_, i) => i),
    out: number[][][] = [];
  while (ids.length > 3) {
    let ear = -1;
    for (let i = 0; i < ids.length && ear < 0; i++) {
      const [a, b, c] = [ids[(i + ids.length - 1) % ids.length]!, ids[i]!, ids[(i + 1) % ids.length]!].map((k) => p[k]!) as [number[], number[], number[]];
      if (cross2(a, b, c) <= 0) continue;
      const inside = ids.some((j) => ![a, b, c].includes(p[j]!) && cross2(a, b, p[j]!) >= 0 && cross2(b, c, p[j]!) >= 0 && cross2(c, a, p[j]!) >= 0);
      if (!inside) ear = i;
    }
    // A degenerate rest (collinear points) is no area: it is left out.
    if (ear < 0) return out;
    const [a, b, c] = [ids[(ear + ids.length - 1) % ids.length]!, ids[ear]!, ids[(ear + 1) % ids.length]!];
    out.push([p[a]!, p[b]!, p[c]!]);
    ids.splice(ear, 1);
  }
  if (cross2(p[ids[0]!]!, p[ids[1]!]!, p[ids[2]!]!) > 0) out.push(ids.map((k) => p[k]!));
  return out;
}

/** A prism of a convex plan polygon (u, v) of a part from n = 0 to its thickness. */
function prism(p: Part, plan: number[][]): Convex {
  const { uAxis: u, vAxis: v, nAxis: n } = p.placement,
    T = p.finishedWithEdge.panelThicknessMm,
    points = plan.flatMap(([a, b]) => [partPoint(p, a!, b!, 0), partPoint(p, a!, b!, T)]),
    sides = plan.map((a, i) => {
      const b = plan[(i + 1) % plan.length]!;
      return add(scale(u, b[0]! - a[0]!), scale(v, b[1]! - a[1]!));
    });
  return { points, normals: [n, ...sides.map((e) => cross(e, n))], edges: [n, ...sides] };
}

/**
 * The section of a part with bevelled ends (MOD-DEC-440) in the u, n plane: the rectangle L × T, each bevelled end
 * shortened by its setback at its short face.
 */
export function bevelSection(p: Part): number[][] {
  const L = p.finishedWithEdge.lengthMm,
    T = p.finishedWithEdge.panelThicknessMm,
    cut = (edge: 'C' | 'D', face: 'N_NEG' | 'N_POS') => p.bevels?.find((b) => b.edge === edge && b.shortFace === face)?.setbackMm ?? 0;
  return [
    [cut('C', 'N_NEG'), 0],
    [L - cut('D', 'N_NEG'), 0],
    [L - cut('D', 'N_POS'), T],
    [cut('C', 'N_POS'), T],
  ];
}

/** A prism of a convex section (u, n) of a part from v = 0 to its width. */
function sectionPrism(p: Part, section: number[][]): Convex {
  const { uAxis: u, vAxis: v, nAxis: n } = p.placement,
    W = p.finishedWithEdge.widthMm,
    points = section.flatMap(([a, c]) => [partPoint(p, a!, 0, c!), partPoint(p, a!, W, c!)]),
    sides = section.map((a, i) => {
      const b = section[(i + 1) % section.length]!;
      return add(scale(u, b[0]! - a[0]!), scale(n, b[1]! - a[1]!));
    });
  return { points, normals: [v, ...sides.map((e) => cross(e, v))], edges: [v, ...sides] };
}

/** The convex solids of a part: its box, its bevelled section, or the triangles of its contour (MOD-DEC-294: intersections by parts). */
export function partSolids(p: Part): Convex[] {
  const L = p.finishedWithEdge.lengthMm,
    W = p.finishedWithEdge.widthMm;
  if (p.bevels?.length) return [sectionPrism(p, bevelSection(p))];
  if (!p.contourMm) return [prism(p, [[0, 0], [L, 0], [L, W], [0, W]])];
  return triangulate(p.contourMm).map((t) => prism(p, t));
}

/** The convex solid of a box of product axes (a reserve of a mechanism). */
export function boxSolid(b: Aabb): Convex {
  const points: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) points.push([x, y, z]);
  const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return { points, normals: axes, edges: axes };
}

/** Separating axes: two convex solids share a volume deeper than `tol` on every axis of their faces and edges. */
function convexIntersect(a: Convex, b: Convex, tol: number): boolean {
  const axes = [...a.normals, ...b.normals];
  for (const x of a.edges) for (const y of b.edges) axes.push(cross(x, y));
  for (const axis of axes) {
    const l = Math.hypot(...axis);
    if (l < 1e-9) continue;
    const k: Vec3 = [axis[0] / l, axis[1] / l, axis[2] / l],
      pa = a.points.map((q) => dot(q, k)),
      pb = b.points.map((q) => dot(q, k));
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= tol) return false;
  }
  return true;
}

const axisAligned = (p: Part) => !p.contourMm && !p.bevels?.length && [p.placement.uAxis, p.placement.vAxis, p.placement.nAxis].every((a) => a.filter((x) => Math.abs(x) > 1e-9).length === 1);

/**
 * Two parts share a volume deeper than `tol`: their boxes for parts along the product axes, otherwise their solids —
 * a turned part by its own faces, a contour by its triangles (KF-20: not by the envelopes).
 */
export function partsIntersect(a: Part, b: Part, tol: number): boolean {
  if (!intersects(partBox(a), partBox(b), tol)) return false;
  if (axisAligned(a) && axisAligned(b)) return true;
  const sa = partSolids(a),
    sb = partSolids(b);
  return sa.some((x) => sb.some((y) => convexIntersect(x, y, tol)));
}

/** A box of product axes and a part share a volume deeper than `tol` (by the solids of the part). */
export function boxHitsPart(box: Aabb, p: Part, tol: number): boolean {
  if (!intersects(box, partBox(p), tol)) return false;
  if (axisAligned(p)) return true;
  const s = boxSolid(box);
  return partSolids(p).some((x) => convexIntersect(s, x, tol));
}
