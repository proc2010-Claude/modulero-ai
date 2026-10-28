// The price snapshot of a wardrobe project (tasks W5, W11): what the price reads besides the graph. Its digest is the
// price snapshot version of the graph (Versions.priceSnapshotId, MOD-DEC-028), so the generator reads it too.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { wardrobePrice as policy } from '../engine/policy/wardrobe-price.js';
import type { Rec } from '../engine/policy/project-state.js';
import { exportMaterial } from './exports.js';
import type { WardrobeInput, WardrobeRates } from './input.js';

/**
 * The price snapshot of a project: everything the price reads besides the graph. The maker's rates are the only
 * source of the price (MOD-DEC-285, task W11): the rates of the project (`rates`, the board and HDF rates of its
 * controls — the rates the prototype keeps for the maker, FINDINGS 33, 34) and the maker's rate card of the policy
 * for what the form does not hold (`card`, its version). The demo profile of the project (`state.priceProfile`) is
 * not read (FINDINGS 520). The finish of the bought fronts and the material selection name what is bought.
 */
export interface WardrobePriceSnapshot {
  /** The maker's rate card the price was computed with: the policy module and its version; the prices of the hardware are the catalogue release of the graph (MOD-DEC-536). */
  card: string;
  /** Finish and rate of the bought fronts without a chosen decor (r1.html:54334). */
  facadeFinish: Rec | null;
  /** Value of the material field: the maker's board rate, ₽/m² (`$('material').value`); a decor code once one is chosen. */
  boardRate: string;
  hdfRate: string;
  /** The maker's rates of the project: delivery and assembly in ₽, markup in % of C, the rest per item. */
  rates: WardrobeRates;
  materialSelection: Rec | null;
  /** `m.material`: the label of the chosen corpus decor or the code of the material option (exportMaterial). */
  material: string;
  /** Sections with a hinge kit of the prototype's t3 layer (r1.html:85535): their price is missing there too. */
  hingeKits: number;
  /** Rastex selections of the prototype (ej, r1.html:60837) are not carried over: a project with them has no price. */
  eccentricSelections: number;
}

/** The snapshot of a wardrobe input. */
export function wardrobePriceSnapshot(input: WardrobeInput, hw: HardwareCatalogs): WardrobePriceSnapshot {
  const s = input.state as Rec;
  return {
    card: `${policy.id}/${policy.version}`,
    facadeFinish: s.facadeFinish ?? null,
    boardRate: String(input.controls.material),
    hdfRate: String(input.controls.hdfPrice),
    rates: { ...input.rates },
    materialSelection: s.materialSelection ?? null,
    material: exportMaterial(input, s, hw.materials),
    hingeKits: (s.sections ?? []).filter((x: Rec) => x.hingeKit).length,
    eccentricSelections: Object.values((s.ejConnections as Rec | null)?.selections ?? {}).length,
  };
}
