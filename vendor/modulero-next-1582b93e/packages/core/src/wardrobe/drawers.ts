// Drawers and shelf sag: file 02 of the prototype r1 (r1.html:4883–4936), MIGRATION_PLAN step 3.1.
// Pure functions. Layers folded in:
// - drawerSlideLength is wrapped once by the sliding wardrobe (r1.html:59568): with sliding doors the door
//   track takes its reserve off the depth. The reserve (swReserve) is redefined once (r1.html:59369 → 63197):
//   the later definition gives 0 for any system other than 'slim' and 'eco'. The wrapper read the global state;
//   here state.slidingWardrobe is a parameter.
// - fitVerticalPositions rounded manual positions only under V16_LEGACY_TEST_CONTEXT, which is false in r1
//   and never set, so that branch is gone. Its sort is explicit (sortAscending): the engine's sort orders NaN
//   differently in Chromium and Node (FINDINGS 43).
// - The lengths of the runner (DB4501_LENGTHS of the prototype, r1.html:4883) are the catalogue's: the runner is an
//   argument (task CAT-4, FINDINGS 292), the oracle gives the record WARDROBE_DRAWER_SLIDE of catalogs/.
// Proof: tests/oracle/wardrobe-core.test.mjs (prototype in the browser) and test/wardrobe.core31.test.ts.
import type { DrawerSlide } from '../catalog/hardware/drawer-slides.js';
import { WardrobeStandardPreset, clamp, r1 } from './standard.js';

/**
 * The runner of the prototype's wardrobe: BOYARD DB4501 of the drawer slide catalogue. A candidate, not a choice: the
 * standard runner is not chosen (MOD-DEC-032, FINDINGS 39); W7 selects the runner from the catalogue.
 */
export const WARDROBE_DRAWER_SLIDE = 'BOYARD_DB4501';

/** Nominal lengths of a runner of the catalogue, mm, ascending (the catalogue check keeps them so). */
export const slideLengths = (slide: DrawerSlide): number[] => slide.lengths.map((l) => l.nominalMm);

/** Longest length of the runner that fits the depth less the rear clearance; the shortest one when none fits (r1.html:4884). */
export function autoSlideLength(slide: DrawerSlide, depth: number): number {
  const lengths = slideLengths(slide),
    maxLen = depth - WardrobeStandardPreset.drawerSlideRearClearance,
    ok = lengths.filter((x) => x <= maxLen);
  return ok.length ? ok[ok.length - 1]! : lengths[0]!;
}

/** The part of state.slidingWardrobe the runner length depends on. */
export interface SlidingDepthReserve {
  active?: unknown;
  n?: unknown;
  system?: unknown;
}

/** Depth taken by the sliding door track, mm: the later swReserve (r1.html:63197). */
export function slidingTrackReserve(system: unknown): number {
  return system === 'slim' ? 81.5 : system === 'eco' ? 82 : 0;
}

/**
 * Runner length of a drawer (r1.html:4889 with the sliding layer r1.html:59568).
 * As in the prototype, a stored cfg.drawerSlideLength is deleted: the length is always automatic.
 */
export function drawerSlideLength(slide: DrawerSlide, cfg: Record<string, unknown> | null | undefined, depth: number, slidingWardrobe?: SlidingDepthReserve | null): number {
  const reserved = slidingWardrobe?.active === true && slidingWardrobe.n !== 0 ? depth - slidingTrackReserve(slidingWardrobe.system) : depth;
  if (cfg && Object.prototype.hasOwnProperty.call(cfg, 'drawerSlideLength')) delete cfg.drawerSlideLength;
  return autoSlideLength(slide, reserved);
}

/**
 * Sorts numbers ascending in place, by stable binary insertion. With `(a, b) => a - b` the order is
 * implementation-defined once a value is NaN (the comparator is inconsistent): Chromium, where the prototype and its
 * golden master run, sorts arrays of up to 15 elements by binary insertion, Node 24 by TimSort with run detection
 * (FINDINGS 43). Without NaN every stable sort gives this order; with NaN it is the prototype's order in Chromium
 * up to 15 positions, and the same on every engine.
 */
function sortAscending(values: number[]): number[] {
  for (let i = 1; i < values.length; i++) {
    const pivot = values[i]!;
    let left = 0,
      right = i;
    while (left < right) {
      const mid = left + ((right - left) >> 1);
      if (pivot - values[mid]! < 0) right = mid;
      else left = mid + 1;
    }
    for (let p = i; p > left; p--) values[p] = values[p - 1]!;
    values[left] = pivot;
  }
  return values;
}

/**
 * Vertical positions within [min, max] (r1.html:4893). Stored positions of the expected count are manual: clamped
 * and sorted only. Otherwise the automatic ones are spread by minGap, pushed down from max and rounded to 0.1 mm.
 */
export function fitVerticalPositions(stored: unknown, auto: number[], min: number, max: number, minGap = 1, expected = auto.length): number[] {
  const manual = Array.isArray(stored) && stored.length === expected;
  const out = sortAscending(((manual ? stored : auto) as unknown[]).map((v, i) => clamp(Number.isFinite(Number(v)) ? Number(v) : auto[i]!, min, max)));
  if (!manual) {
    for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i]!, out[i - 1]! + minGap);
    if (out.length && out[out.length - 1]! > max) {
      out[out.length - 1] = max;
      for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i]!, out[i + 1]! - minGap);
    }
  }
  return out.map((v) => (manual ? clamp(v, min, max) : r1(clamp(v, min, max))));
}

/** Board density for the shelf sag, kg/m³ (r1.html:4905). Prototype value, no decision. */
export const EGGER_DENSITY = 655;

/** Bending modulus by board thickness, N/mm² (r1.html:4906). Prototype table, no decision. */
export function eggerBendingModulus(thickness: number): number {
  if (thickness <= 13) return 1800;
  if (thickness <= 20) return 1600;
  if (thickness <= 25) return 1500;
  if (thickness <= 32) return 1350;
  if (thickness <= 40) return 1200;
  return 1050;
}

export interface ShelfDeflection {
  span: number;
  depth: number;
  thickness: number;
  cargoKg: number;
  selfKg: number;
  totalKg: number;
  E: number;
  I: number;
  deflection: number;
  sigma: number;
}

/**
 * Shelf sag as a simply supported beam under uniform load: own weight plus cargo (r1.html:4914).
 * An indicator, not a material qualification (ES v1.2 §14.1, MOD-DEC-055). Same operations in the same order
 * as the prototype, so the doubles are bit for bit equal.
 */
export function shelfDeflectionCalc(span: number, depth: number, thickness: number, cargoKg: number): ShelfDeflection {
  const E = eggerBendingModulus(thickness),
    rho = EGGER_DENSITY,
    g = 9.80665;
  const selfKg = rho * (span / 1000) * (depth / 1000) * (thickness / 1000);
  const totalKg = Math.max(0, cargoKg) + selfKg;
  const I = (depth * Math.pow(thickness, 3)) / 12;
  const q = (totalKg * g) / span;
  const deflection = (5 * q * Math.pow(span, 4)) / (384 * E * I);
  const sigma = (3 * totalKg * g * span) / (4 * depth * Math.pow(thickness, 2));
  return {
    span,
    depth,
    thickness,
    cargoKg: Math.max(0, cargoKg),
    selfKg,
    totalKg,
    E,
    I,
    deflection,
    sigma,
  };
}
