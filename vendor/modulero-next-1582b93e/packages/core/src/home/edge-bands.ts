// The manual bands of other furniture (MOD-DEC-743, task MOD-AI-26): which part takes them. The graph of the project
// (graph.ts) puts the bands of HomeProject.edgeOverrides on edge_mm of a part of chipboard; every reader — the engine
// graph, the price, the cutting — takes the part from there. Not banded by hand: the floor pads (hardware), the backs
// and the drawer bottoms of HDF, and the fronts bought ready-made or of ЛМДФ (MOD-DEC-325, 573).
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { carcassDecorId } from './decor.js';
import { FRONT_ROLES, homeFrontFamily } from './facades.js';
import type { HomeProject, SemanticRole } from './types.js';

/** A part of this role and board takes manual bands: it is of the board of the project (its decor, decor.ts), a front of ЛДСП included. */
export function homePartBandable(p: HomeProject, hw: HardwareCatalogs, role: SemanticRole, material: string): boolean {
  if (material !== carcassDecorId(p)) return false;
  return !FRONT_ROLES.has(role) || homeFrontFamily(p, hw) === 'LDSP';
}
