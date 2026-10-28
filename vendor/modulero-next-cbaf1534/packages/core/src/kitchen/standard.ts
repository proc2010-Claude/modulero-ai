// The module catalog of the kitchen as data (task K3, MIGRATION_PLAN step 4.3): 38 palette cards in five groups
// (MOD-DEC-222), their module types, families and construction variants and the defaults of the kitchen. The data
// are the prototype's (modules.data.json: kitchenMap r1.html:66183, kitchenStandard r1.html:66520, groups
// r1.html:67081, catalog r1.html:67287, kindInfo r1.html:67318); the numbers the engine decides by come from the
// policy (engine/policy/kitchen.ts), which names the decision of each.
import type { Rec } from '../engine/policy/project-state.js';
import data from '../catalog/kitchen/modules.data.json' with { type: 'json' };

export const KITCHEN_MODULES_SCHEMA = data.schema;

/** Card id → { uiCardId, moduleTypeId, group, variant, options } (kitchenMap). */
export const KITCHEN_MAP: Readonly<Record<string, Rec>> = data.kitchenMap;

/** The kitchen standard of the prototype: defaults, cards of module types, construction variants (kitchenStandard). */
export const KITCHEN_STANDARD: { defaults: Record<string, { value: any }>; cards: Rec[]; variants: Record<string, Rec>; corner_client_variants: Rec[] } = data.standard as any;

/** The palette groups of the prototype: [card id, name, kind, extra] per item. */
export const KITCHEN_GROUPS: readonly { id: string; name: string; items: [string, string, string, Rec][] }[] = data.groups as any;

/** The palette cards: the group items and the two accessible L corners (catalog, r1.html:67287). */
export const KITCHEN_CARDS: Readonly<Record<string, Rec>> = Object.fromEntries([
  ...KITCHEN_GROUPS.flatMap((g) => g.items.map(([id, name, kind, extra]) => [id, { id, name, kind, group: g.id, ...extra }])),
  ...data.extraCards.map((c) => [c.id, c]),
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
