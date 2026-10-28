// Levels of the hardware (MOD-DEC-413, 466): the user chooses «Эконом», «Стандарт» or «Премиум», and each level has
// a manufacturer by default — of the hinges (hinge-selection.ts) and of the drawer runners
// (drawer-slide-selection.ts). When the catalogue has no item of the level, or every item of the level is rejected
// for this place, the selection takes the item of «Стандарт» and says what it replaced and why: the node is not
// hidden, the warning goes to the bell (MOD-DEC-465; the substitution by «Стандарт» is the executor's rule (Д)).
// The level not chosen is «Стандарт» (MOD-DEC-223, as for the shelf supports).
import type { HardwareTier } from '../../catalog/hardware/shelf-supports.js';

export type { HardwareTier };

export const TIER_NAMES: Readonly<Record<HardwareTier, string>> = { ECONOMY: '«Эконом»', STANDARD: '«Стандарт»', PREMIUM: '«Премиум»' };

/** The item of the level was not taken: the text of the warning in the bell. */
export interface TierSubstitution {
  code: 'HARDWARE_TIER_SUBSTITUTED';
  tier: HardwareTier;
  /** Items of the level, by the policy. */
  wanted: readonly string[];
  /** Item taken instead; null — nothing fits. */
  taken: string | null;
  text: string;
}

/**
 * The warning when the item taken is not of the level. `whyNot` — why the items of the level were not taken
 * (absent from the catalogue, rejected by a check); `standard` — the items of «Стандарт».
 */
export function tierSubstitution(tier: HardwareTier, wanted: readonly string[], taken: string | null, standard: readonly string[], whyNot: string): TierSubstitution | null {
  if (taken !== null && wanted.includes(taken)) return null;
  const instead = taken === null ? 'подходящей замены нет' : standard.includes(taken) && tier !== 'STANDARD' ? `взята ${taken} уровня «Стандарт»` : `взята ${taken} по порядку подбора`;
  return { code: 'HARDWARE_TIER_SUBSTITUTED', tier, wanted, taken, text: `Уровень ${TIER_NAMES[tier]}: ${wanted.join(', ')} — ${whyNot}; ${instead}` };
}
