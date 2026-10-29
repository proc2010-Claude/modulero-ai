// Manual edge banding in the editor of the kitchen (MOD-DEC-743 on 319, 325; task MOD-AI-26): «кромка торца» and
// «кромка на всех торцах» of a part or of the whole kitchen, and the parts with their edges and current banding. The
// choices are kept in KitchenProject.edgeOverrides and applied to the parts of the model (edge-bands.ts); the rule of
// the choice is engine/edge-overrides.ts on edge-manual.ts, as for the wardrobe. Each edit returns a new project.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { bandNotice, graphPartEdges, setBand } from '../engine/edge-overrides.js';
import { kitchenEdgeKey, kitchenGraph } from '../engine/generators/kitchen.js';
import type { EdgeEditAccess } from '../engine/policy/edge-manual.js';
import type { EdgeChoice, EdgePartSummary } from '../wardrobe/edge-edit.js';
import { allParts } from './derived.js';
import { kitchenPartBandable } from './edge-bands.js';
import { kitchenSceneOf, type KitchenEdit } from './editor.js';
import type { KitchenProject } from './project.js';

/**
 * Every part of the kitchen with its edges and the band of each, in the order of the graph. The edge is named by the
 * part's edge_mm (left, right, top, bottom), its label is the side of the kitchen it faces («Передний»…).
 */
export function kitchenPartEdges(p: KitchenProject, hw: HardwareCatalogs): EdgePartSummary[] {
  const s = kitchenSceneOf(p, hw),
    model = new Map(allParts(s).map((x) => [x.partId as string, x]));
  return graphPartEdges(kitchenGraph(s), p.edgeOverrides, kitchenEdgeKey, (q) => kitchenPartBandable(s, model.get(q.id) ?? {}));
}

function bandEdit(p: KitchenProject, hw: HardwareCatalogs, partId: string | null, edge: string | null, choice: EdgeChoice, access: EdgeEditAccess): KitchenEdit {
  const parts = kitchenPartEdges(p, hw),
    r = setBand(p.edgeOverrides, parts, partId, edge, choice, access);
  if (!r.ok) return { ok: false, problem: r.problem };
  const o: KitchenProject = JSON.parse(JSON.stringify(p));
  if (Object.keys(r.edgeOverrides).length) o.edgeOverrides = r.edgeOverrides;
  else delete o.edgeOverrides;
  const notice = bandNotice(kitchenPartEdges(o, hw), r.parts, partId === null && choice !== 'AUTO');
  return notice ? { ok: true, project: o, notice } : { ok: true, project: o };
}

/**
 * «Кромка торца»: the band of one edge of a part of the kitchen — a profile of the catalogue, «Без кромки» (NONE) or
 * AUTO; `edge` is the edge of kitchenPartEdges. `access` — the «продвинутый» mode or the role of the user.
 */
export function setKitchenPartEdge(p: KitchenProject, hw: HardwareCatalogs, partId: string, edge: string, choice: EdgeChoice, access: EdgeEditAccess): KitchenEdit {
  return bandEdit(p, hw, partId, edge, choice, access);
}

/**
 * «Кромка на всех торцах»: one band on every edge of a part (`partId`) or of the whole kitchen (`partId` null). For the
 * whole kitchen the parts that are not banded (HDF, fronts of ЛМДФ or bought, worktops, parts with a contour) stay as
 * they are; AUTO gives the automatic banding back.
 */
export function setKitchenAllEdges(p: KitchenProject, hw: HardwareCatalogs, partId: string | null, choice: EdgeChoice, access: EdgeEditAccess): KitchenEdit {
  return bandEdit(p, hw, partId, null, choice, access);
}
