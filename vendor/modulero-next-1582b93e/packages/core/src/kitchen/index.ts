// Kitchen (MIGRATION_PLAN step 4): the project of the prototype as one copy of its input (K2); modules on the graph from K3.
export * from './project.js';
export * from './outputs.js';
// The edits of the kitchen editor (task U4).
export * from './editor.js';
// The manual edge banding of the «Продвинутый» mode (MOD-DEC-743).
export * from './edge-edit.js';
// The marks of the walls, the view of a wall, the fill and the fronts of one module (after U4, FINDINGS 660–669).
export * from './obstacles.js';
export * from './elevation.js';
export * from './module-fill.js';
// The decors of the corpora and the fronts on the stage «Материалы и опции» (before the pilot, FINDINGS 1141–1150).
export * from './materials.js';
// The hardware of the BOM on the stage «Детали» (R4-010 of the pilot, FINDINGS 1892).
export * from './hardware-list.js';
// The settings of the whole kitchen on «Материалы и опции» (R4-006 of the pilot, FINDINGS 1903).
export * from './options.js';
// The parameters of the cutting map of the kitchen (R4-011 of the pilot, FINDINGS 1904).
export * from './cutting.js';
// The overhang of the worktop of an island for the stools (MOD-AI-61, FINDINGS 3170).
export * from './island.js';
// The place of a freestanding fridge or cooker (MOD-AI-60, FINDINGS 3190).
export { appliancePlaceOf, setKitchenAppliancePlace, type KitchenAppliancePlace } from './place.js';
// The draft of the browser and the variants of the project (R1-001, R1-003 of the pilot).
export * as draft from './draft.js';
// The production package, the archive and the drilling table of the kitchen (R4-009 of the pilot, FINDINGS 2927).
export * from './production.js';
// The handles and the opening of the fronts on «Материалы и опции» (MOD-AI-16, 36; FINDINGS 3210).
export { kitchenFittingsOf, kitchenFittingsView, setKitchenFittings, type KitchenFittingsView } from './fittings.js';
// The worktop of the whole kitchen on «Материалы и опции» (MOD-AI-15; FINDINGS 3218).
export { kitchenWorktopChoiceOf, kitchenWorktopView, setKitchenWorktop, type KitchenWorktopView } from './worktop-choice.js';
