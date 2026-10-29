// The fasteners of the joints of a graph (MOD-DEC-507, FINDINGS 810): what the maker buys for the places of fixing
// of the production pack. One count for the price and for its check INV-P02: confirmats by the stations of the joints,
// wooden dowels by their size. The wardrobe priced them from the connections of its prototype model (r1.html:12784)
// and missed the confirmats of the fixed shelves of the r7 plan and the dowels of the plinth rails and of the narrow
// joints.
import type { Joint } from './contract.js';
import { isConfirmatProfile } from './policy/wardrobe-fasteners.js';

/** The fasteners of the price, counted on the joints of the graph (MOD-DEC-507, FINDINGS 810). */
export interface JointFasteners {
  /** Confirmats: a station of a confirmat joint, or of a drawer box joint with a confirmat kit (MOD-DEC-467). */
  confirmats: number;
  /** Wooden dowels by size, `8X35` (of the profile `WOODEN_DOWEL_8X35`): of the eccentric joints (MOD-DEC-192) and of the dowel joints (364, 455). */
  dowels: Record<string, number>;
  /** Screws of the parts of a back on their supports, a station each (MOD-DEC-701). */
  backScrews: number;
}

/** The dowel of an eccentric joint: 8×35 (MOD-DEC-192, r1.html:87222 WOOD8x35_NOMINAL_11_26). */
const CAM_DOWEL = '8X35';

/** The fasteners of the joints of a graph. */
export function jointFasteners(joints: readonly Joint[]): JointFasteners {
  const out: JointFasteners = { confirmats: 0, dowels: {}, backScrews: 0 },
    dowel = (size: string, n: number) => n && (out.dowels[size] = (out.dowels[size] ?? 0) + n);
  for (const j of joints) {
    if (j.kind === 'CONFIRMAT' || (j.kind === 'SCREW' && isConfirmatProfile(j.profileId))) out.confirmats += j.stationsMm.length;
    if (j.kind === 'CAM_CONNECTOR') dowel(CAM_DOWEL, j.dowelCount);
    if (j.profileId === 'BACK_SEAM_SCREW') out.backScrews += j.stationsMm.length;
    if (j.kind === 'DOWEL') dowel(/\d+X\d+$/.exec(j.profileId)?.[0] ?? j.profileId, j.dowelCount);
  }
  return out;
}
