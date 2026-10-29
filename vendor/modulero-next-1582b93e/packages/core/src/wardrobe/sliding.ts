// The carcass and the fill of the sliding wardrobe (task W9, step W9.1): what the prototype's sliding layer changed in
// the model of the swing wardrobe (r1.html:59563–59690), folded into the carcass of carcass.ts as one step each:
// - the sections have no swing fronts and no shelf tied to a front seam (swModel r1.html:59601: facade 'none',
//   seamBindings []);
// - the partitions stand behind the door system: their front moves back by the depth of the system, the rear stays at
//   the back; the front confirmat station moves with the front, the rear one stays (swGeometry r1.html:59575);
// - the shelves stand behind the system too (swModel: front = max(reserve, front)); the shelf over the drawers
//   starts at the system (shelfDepths[-2] = reserve).
// The depth of the system is the policy of wardrobe-sliding.ts (FINDINGS 351). The doors themselves (leaves as parts,
// the sliding system as a mechanism) are step W9.2.
import { slidingDepthReserve } from '../engine/policy/wardrobe-sliding.js';
import type { Rec } from '../engine/policy/project-state.js';

/** Is the state a sliding wardrobe (swEnabled r1.html:59366). */
export const isSliding = (d: Rec): boolean => d.slidingWardrobe?.active === true;

/** Depth of the door system of a sliding state, mm; 0 for a swing wardrobe and for one without doors yet. */
export function systemDepth(d: Rec): number {
  return isSliding(d) ? (slidingDepthReserve(d.slidingWardrobe) ?? 0) : 0;
}

/**
 * The state of a sliding wardrobe as its carcass reads it: no swing fronts, no shelf tied to a seam. In place. A
 * mezzanine (MOD-DEC-200) stands over the doors and keeps its fronts — a door, two or a lift (MOD-AI-63, FINDINGS 2950).
 */
export function slidingCarcassState(d: Rec): void {
  if (!isSliding(d)) return;
  const upper = new Set(((d.bodies ?? []) as Rec[]).filter((b) => b.parent).map((b) => b.id));
  d.sections = (d.sections as Rec[]).map((s) => (upper.has(s.bodyId) ? s : { ...s, facade: 'none' }));
  d.seamBindings = [];
}

/**
 * Front of a shelf of a sliding wardrobe: behind the door system. The prototype pushed back only the shelves of the
 * old shelf list; the shelves of the filling rows (file 90) it left in front of the system, into the upper guide —
 * here every shelf stands behind it (FINDINGS 352).
 */
export function shelfFrontBehindSystem(front: number, d: Rec): number {
  return isSliding(d) ? Math.max(systemDepth(d), front) : front;
}

/**
 * Moves the partitions of one body of a sliding wardrobe behind its door system (swGeometry r1.html:59575): the
 * depth of the partition loses the depth of the system, its box starts there; the holes in its faces keep their
 * place in the body; of the confirmats to the roof and the bottom the front one moves with the front edge, the rear
 * one stays. The prototype gave a sliding partition a box even without doors (depth 0): so does this.
 */
export function placePartitionsBehindSystem(local: { parts: Rec[]; holes: Rec[]; connections: Rec[]; geometry: Rec }, d: Rec): void {
  if (!isSliding(d)) return;
  const reserve = systemDepth(d),
    g = local.geometry,
    kinds = new Map<string, string>(local.parts.map((p) => [p.id, p.kind]));
  for (const part of local.parts.filter((p) => p.kind === 'divider')) {
    part.W -= reserve;
    part.worldBox = { x0: part.worldX, x1: part.worldX + part.T, y0: g.interiorBottomY, y1: g.interiorTopY, z0: reserve, z1: reserve + part.W };
    for (const hole of local.holes.filter((h) => h.panel === part.id && h.mode === 'face')) hole.y -= reserve;
    for (const c of local.connections.filter((c) => c.type === 'confirmat' && c.a === part.id && ['top', 'bottom'].includes(kinds.get(c.b) ?? ''))) {
      const edges = local.holes.filter((h) => h.connectionId === c.id && h.panel === part.id && h.mode === 'edge').sort((a, b) => a.offset - b.offset),
        faces = local.holes.filter((h) => h.connectionId === c.id && h.panel === c.b && h.mode === 'face').sort((a, b) => a.y - b.y);
      if (edges.length !== faces.length || !edges.length) throw Error('Неполная пара креплений перегородки: ' + c.id);
      // The front station keeps its distance from the front edge of the partition; the rest keep their place.
      faces[0]!.y = reserve + edges[0]!.offset;
      for (const e of edges.slice(1)) e.offset -= reserve;
    }
  }
}
