// Normalization of placed holes: unit direction, diameter, layer, merging of duplicates.
//
//  - diameter = 2·Radius (already done when the hole is read), millimetres;
//  - MOD-DEC-276: depth <= 1 mm is a marking ("marking"), deeper is drilling ("drilling");
//  - holes at the same point (every axis within POSITION_EPS) with the same unit direction, diameter,
//    depth and drill mode are one hole; `copies` says how many definitions collapsed into it;
//  - a hole with missing or non-numeric fields, a zero direction or a non-physical size is refused.
import { BazisError } from './errors.js';
import type { RawHole, Vec3 } from './placement.js';

/** MOD-DEC-276: holes up to and including this depth (mm) are markings. */
export const MARKING_MAX_DEPTH = 1;
export const POSITION_EPS = 1e-4;
export const DIRECTION_EPS = 1e-6;
export const SIZE_EPS = 1e-6;

export type HoleLayer = 'marking' | 'drilling';
/** "kit": the hole comes from an assembled kit (.fr3d); "part": from a single part (.f3d). */
export type HoleSource = 'kit' | 'part';

export interface BazisHole {
  position: Vec3;
  /** Unit vector. */
  direction: Vec3;
  /** Millimetres. */
  diameter: number;
  /** Millimetres. */
  depth: number;
  drillMode: number | null;
  layer: HoleLayer;
  source: HoleSource;
  /** Number of equal definitions merged into this hole (1 = no duplicates). */
  copies: number;
  /** Name of the object (kit) or of the definition (part) the hole belongs to. */
  object: string | null;
  chain: (string | null)[];
  fastId: number;
}

function finite(v: number | null): v is number {
  return v !== null && Number.isFinite(v);
}

function close(a: readonly number[], b: readonly number[], eps: number): boolean {
  return a.every((x, i) => Math.abs(x - b[i]) <= eps);
}

export function normalizeHoles(raw: readonly RawHole[], source: HoleSource): BazisHole[] {
  const holes: BazisHole[] = [];
  raw.forEach((r, index) => {
    const label = `hole ${index} (${r.object ?? 'unnamed'})`;
    const { diameter, depth } = r;
    if (!finite(diameter) || !finite(depth)) {
      throw new BazisError(`${label} has missing or non-numeric Radius/Depth`, r.offset, 'decoded_model_payload');
    }
    if (diameter <= 0 || depth < 0) {
      throw new BazisError(`${label} has a non-physical size: diameter ${diameter}, depth ${depth}`, r.offset, 'decoded_model_payload');
    }
    const length = Math.sqrt(r.direction[0] * r.direction[0] + r.direction[1] * r.direction[1] + r.direction[2] * r.direction[2]);
    if (length === 0) throw new BazisError(`${label} has a zero direction`, r.offset, 'decoded_model_payload');
    const direction: Vec3 = [r.direction[0] / length, r.direction[1] / length, r.direction[2] / length];
    const same = holes.find((h) =>
      close(h.position, r.position, POSITION_EPS) && close(h.direction, direction, DIRECTION_EPS) &&
      Math.abs(h.diameter - diameter) <= SIZE_EPS && Math.abs(h.depth - depth) <= SIZE_EPS && h.drillMode === r.drillMode);
    if (same) {
      same.copies += 1;
      return;
    }
    holes.push({
      position: [r.position[0], r.position[1], r.position[2]], direction, diameter, depth, drillMode: r.drillMode,
      layer: depth <= MARKING_MAX_DEPTH ? 'marking' : 'drilling', source, copies: 1,
      object: r.object, chain: [...r.chain], fastId: r.fastId,
    });
  });
  return holes;
}
