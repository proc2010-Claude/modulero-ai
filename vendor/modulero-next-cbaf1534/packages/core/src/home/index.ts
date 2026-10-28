// Public API of the home domain. Everything here is a pure function of the project data and the hardware catalogue
// (an argument: HardwareCatalogs of catalogs/, task CAT-1): no DOM, no globals, no load order. The editor is
// createHomeEditor(catalogue, ids).
export * from './types.js';
export { GENERATOR_VERSION, materials, materialProfiles, rateNames, rateKeys, rateNamesR4, rateNamesR5, rateKeysR4, rateNamesOf, priceByPlan, RATES_REPLACED_IN_R4, templates, prototypeTemplates, archetypeDefaults, prototypeArchetypeDefaults } from './catalog.js';
export { bounds, bay, bays, availableBays, frontGeometry, allFronts, foot, sideFoot, padHeight, topT, frontT, aFront, clone } from './geometry.js';
export { hingeProfile, hingeCount, runnerInfo, homeDrawerRunner, homeRunnerSlide, homeRunnerSideGap, ownerHingeCandidate, shelfSupportCapacityKg, smallDrawerPattern, homeShelfSupport, shelfLowerMm, homeLegs, homeHandle, homeHandles } from './mechanisms.js';
export type { HomeHandleFitting } from './mechanisms.js';
export { physicalGraph, beam, toBoard, partNames } from './graph.js';
export { validate } from './validate.js';
export { homeRules } from '../engine/policy/home.js';
export { joinery, inspectDrilling } from './joinery.js';
export { parts, visualParts, quantities, hardware, loadSummary, issues, issueText, csv, csvMaterial, HINGE_SCREWS_INCLUDED_NOTE, PLAIN_ISSUE_CODES } from './outputs.js';
export { isHardwareRow, price } from './price.js';
// The material of the fronts (r5, MOD-DEC-573, 577): the editor sets it with setFacadeChoice.
export { FRONT_ROLES, purchasedFronts, homeFacadeTitle, homeFrontFamily, homeFacadeProblems, homeFacadeDecors } from './facades.js';
export { FACADE_COLOR_TEXT_MAX } from '../wardrobe/facade-edit.js';
export { createHomeEditor, randomId } from './edit.js';
export type { HomeEditor, IdSource } from './edit.js';
export { isCurrent, isPreviousRuleSet, isPrototypeRuleSet, ratesForR4, migrationPreview, updateConstruction, upgradeR2Project } from './migrate.js';
export type { MigrationPreview, PartDifference, UpdateTarget } from './migrate.js';
// Engine graph of "other furniture" (task E2): an adapter of the physical graph to the engine contract.
export { homeEngineGraph, homeValidationProblems, homeBoards, homeKnownViolations, DRAWER_BOX_BOARD, HOME_KNOWN_VIOLATIONS } from './engine.js';
// The browser draft of other furniture and its variants (R1-003 of the pilot).
export * as draft from './draft.js';
// Production data of other furniture (R5-007, MOD-DEC-710): the package, the archive, the estimate TXT and JSON.
export { homeReadiness, homeProductionPackage, homeProductionKit, homeQuote, homeQuoteText, homeCadFiles, homeBazisFiles, homeCuttingPlan, homeKit, homeMissingText, homeTitle } from './production.js';
export type { HomeQuote } from './production.js';
export { homeCuttingEstimate, homeCuttingMap, homeCuttingParams, homeCuttingProblem, setHomeCutting } from './cutting.js';
