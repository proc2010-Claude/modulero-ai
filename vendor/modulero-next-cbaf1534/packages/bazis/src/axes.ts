// Axes of a BAZIS model and of a product of Modulero, in one place for the reader and the writer.
//
//   BAZIS:    X to the right, Y up, Z to the front, millimetres;
//   Modulero: X to the right, Y to the back, Z up, millimetres (`X_RIGHT_Y_BACK_Z_UP_MM`).
//
// A point (X, Y, Z) of the product is (X, Z, D − Y) in BAZIS, D the depth of the product: a rotation of −90° about X
// and a shift, so the front of the product is at Z = D. Directions turn the same way, without the shift (FINDINGS 742).
import type { Vec3 } from './placement.js';

/** Type of an element of a contour or a trajectory: a straight segment x1, y1, x2, y2. */
export const SEGMENT_LINE = 0x10;
/** The other elements the reader knows (FINDINGS 783); every number is an f64 LE after the tag byte. */
export const SEGMENT_CIRCLE = 0x11; // cx, cy, r
export const SEGMENT_ARC = 0x12; // cx, cy, x1, y1, x2, y2, u8 direction (0 clockwise, 1 counter-clockwise)
export const SEGMENT_CIRCLE_DISPLAY = 0x14; // cx, cy, r — a circle followed by its line loop

export const toBazisPoint = (p: Vec3, depthMm: number): Vec3 => [p[0], p[2], depthMm - p[1]];
export const toBazisVector = (v: Vec3): Vec3 => [v[0], v[2], -v[1]];
export const fromBazisPoint = (p: Vec3, depthMm: number): Vec3 => [p[0], depthMm - p[2], p[1]];
export const fromBazisVector = (v: Vec3): Vec3 => [v[0], -v[2], v[1]];
