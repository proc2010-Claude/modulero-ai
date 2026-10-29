// Swing and sliding wardrobe (MIGRATION_PLAN step 2 and step 3, bottom up).
export * from './input.js';
export * from './standard.js';
export * from './drawers.js';
export * from './edges.js';
export * from './primitives.js';
export * as editor from './editor.js';
// The browser draft of the wardrobe and its variants (task U2).
export * as draft from './draft.js';
// Price and outputs of the swing wardrobe from the graph (task W5, MIGRATION_PLAN step 3.6).
export * from './price.js';
export * from './outputs.js';
// The hardware of the graph as a CSV file, as the stage «Детали» shows it (FINDINGS 1803).
export * from './hardware-csv.js';
export * from './project.js';
// Production data of the wardrobe, task PROD-1: the status of the version and the production package.
export * from './production.js';
// Cutting plan of the sheets, task CUT-1 (MOD-DEC-430): the plan of the graph with the formats of the catalogue.
export * from './cutting-plan.js';
// Check of a BAZIS project of a wardrobe against the engine, task PROD-4 (MOD-DEC-500, 542).
export * as bazisCheck from './bazis-check.js';
