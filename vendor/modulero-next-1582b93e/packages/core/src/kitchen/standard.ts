// The module catalog of the kitchen as data (task K3, MIGRATION_PLAN step 4.3): 38 palette cards in five groups
// (MOD-DEC-222), their module types, families and construction variants and the defaults of the kitchen. The data
// are the prototype's (modules.data.json: kitchenMap r1.html:66183, kitchenStandard r1.html:66520, groups
// r1.html:67081, catalog r1.html:67287, kindInfo r1.html:67318); the numbers the engine decides by come from the
// policy (engine/policy/kitchen.ts), which names the decision of each. The hob cabinet of a wall row (lower-hob, KB_HOB)
// is a card the prototype had not: its hob was on the island alone (MOD-AI-44, FINDINGS 3100).
import type { Rec } from '../engine/policy/project-state.js';
import data from '../catalog/kitchen/modules.data.json' with { type: 'json' };
import { kitchen } from '../engine/policy/kitchen.js';

export const KITCHEN_MODULES_SCHEMA = data.schema;

/** Card id → { uiCardId, moduleTypeId, group, variant, options } (kitchenMap). */
export const KITCHEN_MAP: Readonly<Record<string, Rec>> = data.kitchenMap;

/** The kitchen standard of the prototype: defaults, cards of module types, construction variants (kitchenStandard). */
export const KITCHEN_STANDARD: { defaults: Record<string, { value: any }>; cards: Rec[]; variants: Record<string, Rec>; corner_client_variants: Rec[] } = data.standard as any;

/** The palette groups of the prototype: [card id, name, kind, extra] per item. */
export const KITCHEN_GROUPS: readonly { id: string; name: string; items: [string, string, string, Rec][] }[] = data.groups as any;

/**
 * The filler of a run: the card of the prototype's examples and of makeModule's fallback, which had no palette entry.
 * Placed since MOD-DEC-741 (FINDINGS 3201); in the lower palette since MOD-AI-14 (FINDINGS 3105), to close a gap between
 * modules or at a wall — at the corner cabinet on its adjacent wall too.
 */
export const KITCHEN_FILLER_CARD: Readonly<Rec> = { id: 'filler', name: 'Добор', kind: 'filler', width: 50 };

/**
 * The size of a place for a freestanding fridge or cooker (MOD-AI-60, MOD-DEC-752): the appliance of the policy with its
 * gaps — the place is as wide as the appliance and a gap on each side, as high as the appliance and the gap over it.
 */
export function appliancePlaceSize(kind: 'fridge' | 'cooker'): { width: number; height: number } {
  const a = kitchen.constants.appliancePlace.value[kind];
  return { width: a.deviceWidthMm + 2 * a.sideGapMm, height: a.deviceHeightMm + a.topGapMm };
}

/** The palette cards: the group items and the two accessible L corners (catalog, r1.html:67287). */
export const KITCHEN_CARDS: Readonly<Record<string, Rec>> = Object.fromEntries([
  ...KITCHEN_GROUPS.flatMap((g) =>
    g.items.map(([id, name, kind, extra]) => [id, { id, name, kind, group: g.id, ...extra, ...(extra.appliancePlace ? appliancePlaceSize(extra.appliancePlace) : {}) }]),
  ),
  ...data.extraCards.map((c) => [c.id, c]),
  ['filler', KITCHEN_FILLER_CARD],
]);

/** Depth, height, bottom above the floor and row of a module kind (kindInfo). */
export const KIND_INFO: Readonly<Record<string, { depth: number; height: number; floor: number; row: string }>> = data.kindInfo;

/** The card of a module type: the standard cards or the client corner variants. */
export function standardCard(moduleTypeId: string | undefined): Rec | undefined {
  return KITCHEN_STANDARD.cards.find((c) => c.moduleTypeId === moduleTypeId) || KITCHEN_STANDARD.corner_client_variants.find((c) => c.moduleTypeId === moduleTypeId);
}

/** The construction variant of a rectangular carcass type, or undefined. */
export function standardVariant(moduleTypeId: string | undefined): Rec | undefined {
  const card = KITCHEN_STANDARD.cards.find((c) => c.moduleTypeId === moduleTypeId);
  return card ? KITCHEN_STANDARD.variants[card.variant] : undefined;
}
