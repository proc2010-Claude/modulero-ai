// Manual edge banding of other furniture (MOD-DEC-743 on 319, 325; task MOD-AI-26): the parts with their edges and
// current banding, and the edits «кромка торца» and «кромка на всех торцах» the editor (edit.ts) gives. The choices
// are kept in HomeProject.edgeOverrides and put on the parts by graph.ts (edge-bands.ts); the rule of the choice is
// engine/edge-overrides.ts on edge-manual.ts, as for the wardrobe and the kitchen.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { bandNotice, graphPartEdges, setBand } from '../engine/edge-overrides.js';
import type { EdgeEditAccess } from '../engine/policy/edge-manual.js';
import type { EdgeChoice, EdgePartSummary } from '../wardrobe/edge-edit.js';
import { homeEdgeKey, homeEngineGraph } from './engine.js';
import type { HomeProject } from './types.js';

/**
 * Every part of the project with its edges and the band of each, in the order of the graph. The edge is named by the
 * part's edge_mm ('0'…'3'), its label is the side of the furniture it faces («Передний»…).
 */
export function homePartEdges(p: HomeProject, hw: HardwareCatalogs): EdgePartSummary[] {
  return graphPartEdges(homeEngineGraph(p, hw), p.edgeOverrides, homeEdgeKey(p));
}

/**
 * The band of one edge (`edge`) or of every edge (`edge` null) of a part or of the whole project (`partId` null), on
 * the project in place, as the edits of the editor; a refusal throws its text and leaves the project as it was.
 * Returns the notice of the edit (the parts left as they are, the edges left without a band), if any.
 */
export function setHomeBand(p: HomeProject, hw: HardwareCatalogs, partId: string | null, edge: string | null, choice: EdgeChoice, access: EdgeEditAccess): string | undefined {
  const r = setBand(p.edgeOverrides, homePartEdges(p, hw), partId, edge, choice, access);
  if (!r.ok) throw Error(r.problem);
  if (Object.keys(r.edgeOverrides).length) p.edgeOverrides = r.edgeOverrides;
  else delete p.edgeOverrides;
  return bandNotice(homePartEdges(p, hw), r.parts, partId === null && choice !== 'AUTO');
}
