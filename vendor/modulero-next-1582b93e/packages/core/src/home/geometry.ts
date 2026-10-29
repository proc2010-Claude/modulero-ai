// Basic geometry of bodies: bays between vertical boards, fronts, overall bounds.
// Numbers and rules come from the policy of "other furniture" (engine/policy/home.ts), by the rule set of the project.
import { backSeamScrews, splitBackPanel, type BackSplitPlan } from '../engine/policy/back-split.js';
import { HOME, homeRules, type HomeCableOutlet, type HomeDrawerBottomHdf, type HomeGlassDoor, type HomeHdfBack, type HomeWallHanging } from '../engine/policy/home.js';
import { tolerance } from '../engine/policy/index.js';
import type { BayId, Body, Door, Front, FrontRect, GraphPart, HomeProject, Partition, RunnerInfo, Shelf, Vec3 } from './types.js';

/** Height of the floor pad (glide) under the carcass. */
export const padHeight = (p: HomeProject): number => (p.floor === 'carpet' ? HOME.padHeightCarpet : HOME.padHeightHard);
/**
 * Elevation of the bottom of a body above its floor: the pad, or the plinth or the legs of the body (r5, MOD-DEC-516);
 * a body on the wall has none — `y` is its height above the floor (MOD-AI-33).
 */
export const foot = (p: HomeProject, b?: Body): number => (b?.base?.kind === 'wall' ? 0 : (b?.base?.heightMm ?? padHeight(p)));
/** The hangers of a body on the wall (r5, MOD-AI-33); null — the body stands on the floor. */
export const wallHangingOf = (p: HomeProject, b: Body): HomeWallHanging | null => (b.base?.kind === 'wall' ? homeRules(p).wallHanging : null);
/** How far the back of HDF stands in from the rear edges: the room of the rail and the hangers of a body on the wall. */
export const backRecessMm = (p: HomeProject, b: Body): number => (hdfBackOf(p, b) ? (wallHangingOf(p, b)?.backRecessMm ?? 0) : 0);
/** The height of the rim on the top of a body (r5, MOD-AI-40), mm; 0 — none. */
export const rimHeightMm = (p: HomeProject, b: Body): number => (b.rim && homeRules(p).topRim ? b.rim.heightMm : 0);
/** The height of the board of the mirror over the top of a body (r5, MOD-AI-73), mm; 0 — none. */
export const mirrorHeightMm = (p: HomeProject, b: Body): number => (b.mirror && homeRules(p).vanityMirror ? b.mirror.heightMm : 0);
/** What stands on the top of a body — its rim or the board of its mirror, mm; 0 — nothing. */
export const aboveTopMm = (p: HomeProject, b: Body): number => Math.max(rimHeightMm(p, b), mirrorHeightMm(p, b));
/** The pedestal of a desk stands right of the knee space (r5, MOD-AI-41): the desk mirrored; left otherwise, as the prototype. */
export const pedestalRight = (b: Body): boolean => b.kind === 'desk' && b.pedestal === 'right';
/** Elevation of the lower ends of the sides: the pad or the legs; a plinth stands between the sides on the floor (291). */
export const sideFoot = (p: HomeProject, b: Body): number => (b.base?.kind === 'plinth' ? 0 : foot(p, b));
/** Thickness of the continuous top. */
export const topT = (p: HomeProject): number => p.topThickness ?? p.thickness;
export const allFronts = (b: Body): Front[] => [...b.doors, ...b.drawers];
/** Thickness of an overlay front: 18 mm in r3 (H-01), the board of the project in r4; in r5 that of the execution of the material of the fronts chosen (MOD-DEC-573). */
export const frontT = (p: HomeProject): number => {
  const c = p.facadeChoice?.thicknessMm,
    t = homeRules(p).frontThickness;
  return typeof c === 'number' ? c : t === 'BOARD' ? p.thickness : t;
};
/** The rebate profile of the back of a body when it is HDF (r5, MOD-DEC-515); null for a back of the board or none. */
export const hdfBackOf = (p: HomeProject, b: Body): HomeHdfBack | null => (b.back && b.backMaterial === 'hdf' ? homeRules(p).hdfBack : null);
/**
 * The bottom of HDF of a drawer box in a groove of its walls (r5, MOD-DEC-574); null — the board of the box. It is the
 * bottom of the box of the prototype on the ball runner DB4501: the box of a concealed runner `n` has the bottom of its
 * kit (FINDINGS 1750); without `n` — what the project asks for its boxes on DB4501.
 */
export const hdfDrawerBottomOf = (p: HomeProject, n?: Pick<RunnerInfo, 'concealed'>): HomeDrawerBottomHdf | null =>
  p.drawerBottom === 'hdf' && !n?.concealed ? homeRules(p).drawerBottomHdf : null;
/** The cable outlet in the back of a body with `cable` (r5, MOD-DEC-574); null — none (H-14). */
export const cableOutletOf = (p: HomeProject, b: Body): HomeCableOutlet | null => (b.cable && b.back && p.cableOutlet === 'back' ? homeRules(p).cableOutlet : null);
/**
 * The part of the back that takes the cable outlet (MOD-DEC-574, FINDINGS 1307): the back; of a split back (MOD-DEC-701,
 * FINDINGS 2610) — the part behind the middle of the body at the height of the outlet, the left one on a seam (Д).
 */
export function cableBackPart(p: HomeProject, b: Body, parts: readonly GraphPart[]): GraphPart | undefined {
  const c = cableOutletOf(p, b),
    backs = parts.filter((x) => x.bodyId === b.id && (x.semanticRole === 'hdf_back' || x.semanticRole === 'structural_back'));
  if (!c || backs.length < 2) return backs[0];
  const x = b.x + b.w / 2,
    z = b.y + b.h - topT(p) - c.belowTopMm,
    within = (q: GraphPart, k: number, v: number) => q.origin_mm[k] <= v && v <= q.origin_mm[k] + q.extent_mm[k];
  return backs.find((q) => within(q, 0, x) && within(q, 2, z)) ?? backs[0];
}
/** Depth the back takes from the rear of a body, where the inner parts end: the rebate of HDF (its groove on the wall), else the board. */
export const backDepthMm = (p: HomeProject, b: Body): number => {
  const q = hdfBackOf(p, b);
  return q ? q.rebateWidthMm + backRecessMm(p, b) : p.thickness;
};
/**
 * The rebate of a back of HDF in world axes: its box grown by the clearance in its plane (the full rebate depth beyond
 * the inner faces) and from the rear face of the body as deep as the rebate is wide (the wardrobe's quarter, 287). Of a
 * body on the wall `depthMm` is the rear face less the recess: the same profile is a groove (MOD-AI-33).
 */
export function hdfRebateBox(q: HomeHdfBack, backs: readonly GraphPart[], depthMm: number): { lo: Vec3; hi: Vec3 } {
  // The parts of a split back (MOD-DEC-701) share the rebate of the whole back: the box over them all.
  const c = q.inPlaneClearanceMm,
    lo = (k: number) => Math.min(...backs.map((x) => x.origin_mm[k])),
    hi = (k: number) => Math.max(...backs.map((x) => x.origin_mm[k] + x.extent_mm[k]));
  return {
    lo: [lo(0) - c, depthMm - q.rebateWidthMm, lo(2) - c],
    hi: [hi(0) + c, depthMm, hi(2) + c],
  };
}
/**
 * r5 (MOD-DEC-701, FINDINGS 2610): the back of HDF of a body in parts, by the rule of the wardrobe (splitBackPanel,
 * engine/policy/back-split.ts) — in the plane of the back, x across the body and y up, both from the corner of the
 * body; the back with its rebate edges, as the graph builds it. The seams stand on the rear edges of the partitions
 * (they reach the back over the whole inner height) and of the fixed shelves (they reach the back over their bay); with
 * no support — on an H-profile. null — no back of HDF.
 */
export function homeBackSplit(p: HomeProject, b: Body): BackSplitPlan | null {
  const q = hdfBackOf(p, b);
  if (!q) return null;
  const t = p.thickness,
    r = q.rebateDepthMm - q.inPlaneClearanceMm,
    // The back of a desk closes its pedestal only, up to the shared side (graph.ts); on the right — from it (MOD-AI-41).
    mirror = pedestalRight(b),
    left = mirror ? b.partitions[0]!.x + t / 2 : t,
    right = b.kind === 'desk' && !mirror ? b.partitions[0]!.x + t / 2 - t : b.w - t;
  return splitBackPanel({
    x0: left - r,
    x1: right + r,
    y0: foot(p, b) + t - r,
    y1: b.h - topT(p) + r,
    // The back is split on the partitions of the whole height (701); one standing on a shelf (r5, MOD-AI-75) is not one.
    partitions: b.kind === 'desk' ? [] : b.partitions.filter((x) => x.from === undefined).map((x) => ({ id: b.id + ':' + x.id, at: x.x, from: foot(p, b) + t, to: b.h - topT(p) })),
    shelves: b.shelves
      .filter((s) => s.fixed)
      .map((s) => {
        const span = bay(p, b, s);
        return { id: b.id + ':' + s.id, at: s.y + t / 2, from: span.left, to: span.right };
      }),
    reachMm: t,
    compareMm: tolerance.constants.compare.value,
  });
}
/**
 * The fixing of a split back (MOD-DEC-701, as the wardrobe): each part of a seam on a partition or a fixed shelf is
 * screwed to its rear edge, 3,5 × 16 not farther apart than the pitch (Д, backSeamScrews); a seam with no support is
 * an H-profile along it. All the bodies of the project; nothing for a back of one part.
 */
export function homeBackFixing(p: HomeProject): { screws: number; hProfileMm: number } {
  let screws = 0,
    hProfileMm = 0;
  for (const b of p.bodies)
    for (const s of homeBackSplit(p, b)?.seams ?? [])
      if (s.supportId) screws += 2 * backSeamScrews(s.from, s.to).length;
      else hProfileMm += s.to - s.from;
  return { screws, hProfileMm };
}
/** Front setback of the carcass behind overlay fronts: r3 — 20 mm; r4 — front thickness + depth gap (162). */
export function aFront(p: HomeProject, b: Body): number {
  if (!allFronts(b).length && !HOME.frontReserveTemplates.includes(p.templateId)) return 0;
  const R = homeRules(p);
  return R.frontSetback === 'FRONT_PLUS_GAP' ? frontT(p) + R.frontDepthGap : R.frontSetback;
}

export function bounds(p: HomeProject): { w: number; h: number; d: number } {
  return {
    w: Math.max(...p.bodies.map((b) => b.x + b.w)),
    h: Math.max(...p.bodies.map((b) => b.y + b.h)),
    d: Math.max(...p.bodies.map((b) => b.d)),
  };
}

/** The height of the product over the floor with the rims on the tops (r5, MOD-AI-40), mm; `bounds` — of the bodies. */
export const overallHeightMm = (p: HomeProject): number => Math.max(...p.bodies.map((b) => b.y + b.h + aboveTopMm(p, b)));

/** Clear opening between two boundaries (side or partition) measured from the body's left face. */
export function bay(p: HomeProject, b: Body, s: { lo: string; hi: string }): { left: number; right: number } {
  const t = p.thickness;
  const get = (ref: string, left: boolean): number =>
    ref === 'left'
      ? t
      : ref === 'right'
        ? b.w - t
        : (b.partitions.find((x) => x.id === ref)?.x ?? NaN) + (left ? t / 2 : -t / 2);
  return { left: get(s.lo, true), right: get(s.hi, false) };
}

/**
 * A niche of a body: between two verticals. r5 (MOD-AI-75): with a partition standing on a shelf, the niche under the
 * shelf reaches across the partition; `lower` and `upper` are the shelves that close a niche from below and from
 * above (absent — the bottom and the top).
 */
export interface Niche {
  lo: string;
  hi: string;
  lower?: string;
  upper?: string;
}

/** The lower end of a partition: the top face of the shelf it stands on (r5, MOD-AI-75) or of the bottom; NaN — no such shelf. */
export const partitionFrom = (p: HomeProject, b: Body, q: Partition): number =>
  q.from === undefined ? foot(p, b) + p.thickness : (b.shelves.find((s) => s.id === q.from)?.y ?? NaN) + p.thickness;

/** All bays of a body, left to right; with partitions standing on shelves (r5, MOD-AI-75) bottom to top, then left to right. */
export function bays(b: Body, p?: HomeProject): Niche[] {
  const sorted = b.partitions.slice().sort((a, c) => a.x - c.x);
  if (!p || !sorted.some((q) => q.from !== undefined)) {
    const a = ['left', ...sorted.map((x) => x.id), 'right'];
    return a.slice(0, -1).map((lo, i) => ({ lo, hi: a[i + 1] }));
  }
  // The height in bands between the lower ends of the partitions; in each band the partitions standing lower divide it.
  const base = foot(p, b) + p.thickness,
    start = (q: Partition) => partitionFrom(p, b, q),
    cuts = [...new Set([base, ...sorted.map(start).filter((z) => z > base && z < b.h - topT(p)), b.h - topT(p)])].sort((a, c) => a - c),
    bands = cuts.slice(0, -1).map((z0, i) => {
      const z1 = cuts[i + 1]!,
        active = sorted.filter((q) => start(q) < (z0 + z1) / 2),
        ids = ['left', ...active.map((q) => q.id), 'right'];
      return { z0, z1, pairs: ids.slice(0, -1).map((lo, k) => lo + '|' + ids[k + 1]) };
    }),
    out = new Map<string, Niche>(),
    standsAt = (z: number) => (q: Partition) => q.from !== undefined && Math.abs(start(q) - z) < 0.01,
    xOf = (ref: string) => (ref === 'left' ? -Infinity : ref === 'right' ? Infinity : sorted.find((q) => q.id === ref)!.x);
  bands.forEach((band, i) => {
    for (const key of band.pairs) {
      const [lo, hi] = key.split('|') as [string, string];
      if (!out.has(key)) {
        // A niche that begins over a shelf begins where its side stands on that shelf.
        const side = i ? sorted.find((q) => (q.id === lo || q.id === hi) && standsAt(band.z0)(q)) : undefined;
        out.set(key, { lo, hi, ...(side ? { lower: side.from } : {}) });
      }
      if (!bands[i + 1]?.pairs.includes(key) && i + 1 < bands.length) {
        // A niche that ends under a shelf: a partition between its sides stands on that shelf.
        const over = sorted.find((q) => q.x > xOf(lo) && q.x < xOf(hi) && standsAt(band.z1)(q));
        if (over) out.get(key)!.upper = over.from;
      }
    }
  });
  return [...out.values()];
}

/**
 * The heights a niche gives its parts, mm from the floor (r5, MOD-AI-75): a shelf between the top face of its lower
 * board and the lower face of its upper one; a front from the margin over the bottom, or the middle of the shelf under
 * the niche and half the seam of the stack, up to the margin under the top, or the middle of the shelf over it less
 * half the seam. Without partitions on shelves — the bottom and the top of the body.
 */
export function nicheLimits(p: HomeProject, b: Body, n: { lo: string; hi: string }): { lower?: Shelf; upper?: Shelf; shelfLow: number; shelfHigh: number; frontLow: number; frontHigh: number } {
  const t = p.thickness,
    m = HOME.frontCarcassMargin,
    seam = homeRules(p).stackSeam,
    q = b.partitions.some((x) => x.from !== undefined) ? bays(b, p).find((x) => x.lo === n.lo && x.hi === n.hi) : undefined,
    lower = q?.lower === undefined ? undefined : b.shelves.find((s) => s.id === q.lower),
    upper = q?.upper === undefined ? undefined : b.shelves.find((s) => s.id === q.upper);
  return {
    ...(lower ? { lower } : {}),
    ...(upper ? { upper } : {}),
    shelfLow: lower ? lower.y + t : foot(p, b) + t,
    shelfHigh: upper ? upper.y : b.h - topT(p),
    frontLow: lower ? lower.y + t / 2 + seam / 2 : foot(p, b) + m,
    frontHigh: upper ? upper.y + t / 2 - seam / 2 : b.h - topT(p) - m,
  };
}

/** Bays that may receive shelves and fronts. A desk exposes only its pedestal bay. */
export function availableBays(p: HomeProject, b: Body): (BayId & Niche)[] {
  const a = bays(b, p);
  return (b.kind === 'desk' ? (pedestalRight(b) ? a.slice(1) : a.slice(0, 1)) : a).map((q) => ({
    ...q,
    id: b.bayIds?.find((v) => v.lo === q.lo && v.hi === q.hi)?.id || b.id + ':bay:' + q.lo + ':' + q.hi,
  }));
}

/** Keeps bay ids stable when partitions are added or removed. */
export function refreshBayIds(p: HomeProject, b: Body, previous: BayId[] = []): void {
  const used = new Set<string>();
  b.bayIds = availableBays(p, b).map((q) => {
    // The niche of the same sides first: a niche under a partition on a shelf shares its left side with the one over it.
    const old = previous.find((v) => !used.has(v.id) && v.lo === q.lo && v.hi === q.hi) ?? previous.find((v) => !used.has(v.id) && v.lo === q.lo);
    const id = old?.id || q.id;
    used.add(id);
    return { id, lo: q.lo, hi: q.hi };
  });
}

/** Whether a boundary of a front is outer for it (the front covers it up to the outer inset), see frontGeometry. */
export function outerBoundary(p: HomeProject, b: Body, f: Front, ref: string): boolean {
  const R = homeRules(p),
    drawer = (b.drawers as Front[]).includes(f),
    shared = availableBays(p, b).filter((q) => q.lo === ref || q.hi === ref).length > 1;
  return (drawer && R.drawerFrontAtPartition === 'COVER') || ref === 'left' || ref === 'right' || (R.frontOuterAt === 'UNSHARED' && !shared);
}

/**
 * Overlay front rectangle in body coordinates. At an outer boundary the front covers the side up to the outer inset,
 * at a partition up to half the seam. r3: drawers cover a partition like a side, only carcass sides are outer;
 * r4 (124, 185): every front keeps the seam at a partition, a boundary without a neighbouring bay is outer.
 */
export function frontGeometry(p: HomeProject, b: Body, f: Front): FrontRect {
  const R = homeRules(p),
    a = bay(p, b, f),
    outer = (ref: string) => outerBoundary(p, b, f, ref),
    cover = (ref: string) => (outer(ref) ? p.thickness - R.frontOuterInset : p.thickness / 2 - R.frontHalfSeam),
    x = a.left - cover(f.lo),
    end = a.right + cover(f.hi);
  // r5 (MOD-AI-37): a glass door is as thick as its glass, its inner face where the inner faces of the other fronts are.
  const glass = glassOf(p, f);
  return { x, y: f.y, w: end - x, h: f.h, d: glass ? glass.thicknessMm : frontT(p), z: glass ? frontT(p) - glass.thicknessMm : 0 };
}

/** The radius of the rounded front corners of the top of a body (r5, MOD-AI-73), mm; 0 — square. */
export const topRadiusOf = (p: HomeProject, b: Body): number => (b.topRadiusMm && homeRules(p).topCorners ? b.topRadiusMm : 0);

/**
 * The contour of a top with rounded front corners (r5, MOD-AI-73) in its part axes — u along the width from the left,
 * v along the depth from the front edge — the arcs by the segments of the policy; null — a rectangle.
 */
export function topContour(p: HomeProject, b: Body): [number, number][] | null {
  const r = topRadiusOf(p, b),
    n = homeRules(p).topCorners?.segments ?? 0;
  if (!r || !n) return null;
  const L = b.w,
    W = b.d,
    at = (cx: number, cy: number, deg: number): [number, number] => [Math.round((cx + r * Math.cos((deg * Math.PI) / 180)) * 100) / 100, Math.round((cy + r * Math.sin((deg * Math.PI) / 180)) * 100) / 100],
    arc = (cx: number, cy: number, from: number) => Array.from({ length: n + 1 }, (_, k) => at(cx, cy, from + (90 * k) / n));
  return [...arc(L - r, r, 270), [L, W], [0, W], ...arc(r, r, 180)];
}

/** The glass of a glass door (r5, MOD-AI-37); null — a front of the board of the fronts. */
export const glassOf = (p: HomeProject, f: Front): HomeGlassDoor | null => ((f as Door).glass ? homeRules(p).glassDoors : null);

/**
 * Two fronts that share width and stand closer in height than `gapMm` (0,1 mm tolerance). A negative gap asks for
 * an overlap deeper than it. validate() refuses an overlap and, in r3, a seam under frontMinSeam; the graph of r4
 * says the narrow seam (MOD-DEC-356).
 */
export const frontsCloser = (a: FrontRect, c: FrontRect, gapMm: number): boolean =>
  a.x < c.x + c.w - 0.1 && c.x < a.x + a.w - 0.1 && a.y < c.y + c.h + gapMm && c.y < a.y + a.h + gapMm;

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
