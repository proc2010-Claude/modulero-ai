// Basic geometry of bodies: bays between vertical boards, fronts, overall bounds.
// Numbers and rules come from the policy of "other furniture" (engine/policy/home.ts), by the rule set of the project.
import { HOME, homeRules, type HomeCableOutlet, type HomeDrawerBottomHdf, type HomeHdfBack } from '../engine/policy/home.js';
import type { BayId, Body, Front, FrontRect, GraphPart, HomeProject, RunnerInfo, Vec3 } from './types.js';

/** Height of the floor pad (glide) under the carcass. */
export const padHeight = (p: HomeProject): number => (p.floor === 'carpet' ? HOME.padHeightCarpet : HOME.padHeightHard);
/** Elevation of the bottom of a body above its floor: the pad, or the plinth or the legs of the body (r5, MOD-DEC-516). */
export const foot = (p: HomeProject, b?: Body): number => b?.base?.heightMm ?? padHeight(p);
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
/** Depth the back takes from the rear of a body, where the inner parts end: the rebate of HDF, else the board. */
export const backDepthMm = (p: HomeProject, b: Body): number => hdfBackOf(p, b)?.rebateWidthMm ?? p.thickness;
/**
 * The rebate of a back of HDF in world axes: its box grown by the clearance in its plane (the full rebate depth beyond
 * the inner faces) and from the rear face of the body as deep as the rebate is wide (the wardrobe's quarter, 287).
 */
export function hdfRebateBox(q: HomeHdfBack, back: GraphPart, depthMm: number): { lo: Vec3; hi: Vec3 } {
  const c = q.inPlaneClearanceMm;
  return {
    lo: [back.origin_mm[0] - c, depthMm - q.rebateWidthMm, back.origin_mm[2] - c],
    hi: [back.origin_mm[0] + back.extent_mm[0] + c, depthMm, back.origin_mm[2] + back.extent_mm[2] + c],
  };
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

/** All bays of a body, left to right. */
export function bays(b: Body): { lo: string; hi: string }[] {
  const a = [
    'left',
    ...b.partitions
      .slice()
      .sort((a, c) => a.x - c.x)
      .map((x) => x.id),
    'right',
  ];
  return a.slice(0, -1).map((lo, i) => ({ lo, hi: a[i + 1] }));
}

/** Bays that may receive shelves and fronts. A desk exposes only its pedestal bay. */
export function availableBays(_p: HomeProject, b: Body): BayId[] {
  const a = bays(b);
  return (b.kind === 'desk' ? a.slice(0, 1) : a).map((q) => ({
    ...q,
    id: b.bayIds?.find((v) => v.lo === q.lo && v.hi === q.hi)?.id || b.id + ':bay:' + q.lo + ':' + q.hi,
  }));
}

/** Keeps bay ids stable when partitions are added or removed. */
export function refreshBayIds(p: HomeProject, b: Body, previous: BayId[] = []): void {
  const used = new Set<string>();
  b.bayIds = availableBays(p, b).map((q) => {
    const old = previous.find((v) => !used.has(v.id) && v.lo === q.lo);
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
  return { x, y: f.y, w: end - x, h: f.h, d: frontT(p), z: 0 };
}

/**
 * Two fronts that share width and stand closer in height than `gapMm` (0,1 mm tolerance). A negative gap asks for
 * an overlap deeper than it. validate() refuses an overlap and, in r3, a seam under frontMinSeam; the graph of r4
 * says the narrow seam (MOD-DEC-356).
 */
export const frontsCloser = (a: FrontRect, c: FrontRect, gapMm: number): boolean =>
  a.x < c.x + c.w - 0.1 && c.x < a.x + a.w - 0.1 && a.y < c.y + c.h + gapMm && c.y < a.y + a.h + gapMm;

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
