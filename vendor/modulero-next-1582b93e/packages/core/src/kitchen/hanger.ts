// The hanger of a wall cabinet of a new kitchen module (MOD-DEC-413; (Д) Директора 2026-10-29, FINDINGS 2754): the
// hanger of the level of the hardware by the selection of every product (engine/policy/hanger-selection.ts) instead
// of the Hettich SAH 216 on the rail of the prototype. The kitchen has no level: «Стандарт» (223) — BOYARD CH07 on the
// plates CHH01. Its holes, the place of the back and the cut-outs of the back are those of its BAZIS kit (277). A
// module saved before has no `hanger` and keeps its SAH 216, as the drawers keep their TANDEM (FINDINGS 1863).
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Hanger } from '../catalog/hardware/fittings.js';
import { selectHanger, type HangerSelection } from '../engine/policy/hanger-selection.js';
import { kitchen } from '../engine/policy/kitchen.js';
import type { Rec } from '../engine/policy/project-state.js';

/** The cabinet hangs on the hanger of the level (a new module of 413), not on the SAH 216 of the prototype. */
export const levelHanger = (m: Rec): boolean => m.hanger === 'level' && kitchen.constants.hangerRule.value === 'LEVEL_413';

/** The hanger of a wall cabinet by its side (the load of the cabinet is not counted: UNKNOWN, the fitter checks it). */
export const kitchenHanger = (hw: HardwareCatalogs, m: Rec): HangerSelection => selectHanger({ sideThicknessMm: m.panelThickness ?? 16, loadKg: null }, hw.fittings);

/** The hanger taken for a module of the level, or null: not a module of the level, or none fits. */
export function levelHangerOf(hw: HardwareCatalogs, m: Rec): Hanger | null {
  return levelHanger(m) ? kitchenHanger(hw, m).chosen : null;
}

/**
 * How far forward of the rear edges of the sides the back stands for the hanger: its front face is `backSetbackMm` off
 * the wall, the back lies behind its front face by `behindFaceMm` (its thickness, in a quarter also the clearance
 * behind it). Without the setback in the catalogue the back stays at the edges (0); never negative.
 */
export function hangerRecessMm(h: Hanger, behindFaceMm: number): number {
  const setback = h.backSetbackMm.value;
  return setback === null ? 0 : Math.max(0, setback - behindFaceMm);
}
