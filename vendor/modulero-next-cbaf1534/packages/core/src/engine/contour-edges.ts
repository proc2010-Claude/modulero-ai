// The edges of a polygonal part (FINDINGS 575, 816): the bands A–D are the sides of its envelope, the edges are the
// segments of its contour. A segment lying on a side of the envelope names that slot; an oblique one, none. The
// metres of edge banding of a part — for the price, the checks and the outputs — are those of its segments.
import type { ContourEdge, EdgeBand, EdgeSlot, Part } from './contract.js';

type Point = readonly [number, number];

/** The side of the envelope L × W a segment lies on (A: v = 0, B: v = W, C: u = 0, D: u = L), or null. */
export function segmentSlot(a: Point, b: Point, L: number, W: number, near: (x: number, y: number) => boolean): EdgeSlot | null {
  const on = (k: 0 | 1, at: number) => near(a[k], at) && near(b[k], at);
  return on(1, 0) ? 'A' : on(1, W) ? 'B' : on(0, 0) ? 'C' : on(0, L) ? 'D' : null;
}

/**
 * The bands of the segments when the product keeps the bands of the envelope only: a segment on a side takes the
 * band of its slot, the segments of a cut inside the envelope stay without a band.
 */
export function contourEdgesOfSlots(contour: readonly Point[], L: number, W: number, edges: Record<EdgeSlot, EdgeBand>, near: (x: number, y: number) => boolean): ContourEdge[] {
  return contour.map((a, i) => {
    const b = contour[(i + 1) % contour.length]!,
      slot = segmentSlot(a, b, L, W, near),
      e = slot ? edges[slot] : null;
    return {
      segment: i,
      slot,
      lengthMm: Math.hypot(b[0] - a[0], b[1] - a[1]),
      intent: e?.intent ?? 'NONE',
      edgeBandThicknessMm: e?.edgeBandThicknessMm ?? 0,
      profileCode: e?.profileCode ?? 'NONE',
      exposure: e?.exposure ?? 'HIDDEN',
      ruleId: e ? e.ruleId : 'внутренний сегмент выреза',
    };
  });
}

/** Metres of edge banding of a part: its contour segments, or its four sides; `NONE` is not banded. */
export function partEdgeMetres(p: Pick<Part, 'edges' | 'contourEdges'>): number {
  const runs: { intent: string; lengthMm: number }[] = p.contourEdges ?? Object.values(p.edges).map((e) => ({ intent: e.intent, lengthMm: e.edgeLengthMm }));
  return runs.reduce((s, e) => s + (e.intent === 'NONE' ? 0 : e.lengthMm), 0) / 1000;
}
