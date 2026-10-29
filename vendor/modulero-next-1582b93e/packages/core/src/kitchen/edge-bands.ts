// The manual bands of the kitchen (MOD-DEC-743, task MOD-AI-26): the parts of the model take the bands of
// KitchenProject.edgeOverrides on their edge_mm, once, where every reader takes the parts (partsOf: the graph, the
// BOM, the price, the coverage, the fasteners). The choice is the rule's (engine/edge-overrides.ts); here only where it
// applies: a part of chipboard — the corpus, the content and a front of ЛДСП (the families of the graph generator),
// not a back of HDF, a front of ЛМДФ or bought, nor a part with a contour (it is banded by its segments).
import type { Rec } from '../engine/policy/project-state.js';
import { withManualBands } from '../engine/edge-overrides.js';
import { facadeFamily } from './facade-choice.js';
import type { KitchenScene } from './room.js';

/** The board of the part is chipboard and its edges are the four of edge_mm: the manual band applies. */
export function kitchenPartBandable(s: Pick<KitchenScene, 'hardware'>, p: Rec): boolean {
  if (!p.edge_mm || p.edge_segments_mm || p.finished_polygon_mm) return false;
  if (p.materialRole === 'FACADE') return !p.facadeMaterialId || facadeFamily(p, s.hardware) === 'LDSP';
  return p.materialRole === 'CORPUS' || p.materialRole === 'CONTENT';
}

/**
 * The part with its manual bands: edge_mm by the choices, the blank again (finished − bands), the automatic bands kept
 * in auto_edge_mm for the graph (EdgeBand.automaticIntent) and the choices in edge_overrides (EdgeBand.override). A
 * part without choices, or one they do not apply to, comes back as it is.
 */
export function withManualKitchenBands(s: Pick<KitchenScene, 'hardware' | 'edgeOverrides'>, p: Rec): Rec {
  const own = s.edgeOverrides?.[p.partId];
  if (!own || !kitchenPartBandable(s, p)) return p;
  const edge = withManualBands(p.edge_mm, own, true),
    [L, H, T] = p.finished_mm as [number, number, number];
  return { ...p, edge_mm: edge, auto_edge_mm: p.edge_mm, edge_overrides: { ...own }, blank_mm: [L - edge.left! - edge.right!, H - edge.top! - edge.bottom!, T] };
}
