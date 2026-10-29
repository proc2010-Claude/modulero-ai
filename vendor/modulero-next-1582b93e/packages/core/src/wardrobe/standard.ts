// Shared constants of the swing wardrobe model (prototype r1, MIGRATION_PLAN step 3.1): the standard preset,
// fasteners, HDF4 back panel and groove, the current production profile and the rounding helpers.
// Values and freezing are those of the prototype; tests/oracle/wardrobe-core.test.mjs compares every constant
// with the page. "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
//
// Where an owner decision covers a number, its MOD-DEC is given next to it. "ES v1.2" is the Engineering
// Standard v1.2 (MOD-DEC-055, canon). Numbers without a reference are the prototype's own and have no decision:
// they are kept so the core matches the prototype (FINDINGS 39–41, questions in the pull request).

/** One decimal, the prototype's r1() (r1.html:3623). */
export const r1 = (n: number): number => Math.round(n * 10) / 10;

/** The prototype's clamp() (r1.html:3625): NaN stays NaN. */
export const clamp = (n: number, a: number, b: number): number => Math.max(a, Math.min(b, n));

/** Confirmat 7×50 (r1.html:3679). Through D8 and axis offset 8 mm are separate fields: ES v1.2 FE-FAST-001 / T12 (MOD-DEC-055). */
export const FASTENER_PRESETS = Object.freeze({
  CONFIRMAT_7X50: Object.freeze({
    id: 'CONFIRMAT_7X50',
    nominalFastenerFamily: 'CONFIRMAT_7X50',
    exactSkuRequired: false,
    receivingPilot: Object.freeze({
      diameterMm: 5,
      depthMm: 35,
      operationType: 'PILOT_BLIND_HOLE',
    }),
    throughOperation: Object.freeze({
      diameterMm: 8,
      depthMode: 'THRU',
      operationType: 'THROUGH_HOLE',
    }),
    ldsp16: Object.freeze({
      panelThicknessMm: 16,
      axisOffsetMm: 8,
    }),
    axisOffsetMeaning: 'COORDINATE_NOT_DIAMETER',
    genericThicknessGeneralizationInP1: false,
  }),
});

/** HDF4 back panel intent (r1.html:3702); the final installation default is on hold (ES v1.2, HDF4_FINAL_DEFAULT). */
export const HDF4_BACK_PANEL_INTENT = Object.freeze({
  id: 'BACK_PANEL_HDF4',
  type: 'BackPanelIntent',
  materialFamily: 'HDF',
  nominalThicknessMm: 4,
  structuralRole: 'NON_STRUCTURAL_BACK',
  finalInstallationDefaultStatus: 'HOLD',
  preferredCandidate: 'QUARTER_FOR_HDF4',
  currentLegacyMode: 'OVERLAY',
  quarterMachiningGeneratedInP1: false,
});

/** Groove width of the legacy production profile, mm (r1.html:3713). */
export const HDF4_LEGACY_PROFILE_RESOLVED_WIDTH_MM = 4.2;

/** Groove for HDF4 (r1.html:3714): working depth 6, bottom offset 10 mm; not confirmed by production. */
export const HDF4_GROOVE_INTENT = Object.freeze({
  id: 'GROOVE_FOR_HDF4',
  type: 'GROOVE_FOR_HDF4',
  semanticType: 'GROOVE_FOR_HDF4',
  materialThicknessMm: 4,
  nominalMaterialThicknessMm: 4,
  workingDepthMm: 6,
  workingBottomOffsetMm: 10,
  legacyProfileResolvedWidthMm: HDF4_LEGACY_PROFILE_RESOLVED_WIDTH_MM,
  widthOwnedByCoreSemanticIntent: false,
  productionConfirmed: false,
});

/** Production profile that resolves the groove intent into a width and depth (r1.html:3726). Provisional. */
export const CURRENT_PRODUCTION_PROFILE = Object.freeze({
  id: 'LEGACY_DSPDETAL_MVP_0_8_8_17',
  status: 'PROVISIONAL_MVP_RULE',
  productionConfirmed: false,
  hdf4Groove: Object.freeze({
    intentType: HDF4_GROOVE_INTENT.semanticType,
    legacyProfileResolvedWidthMm: HDF4_GROOVE_INTENT.legacyProfileResolvedWidthMm,
    resolvedWidthMm: HDF4_GROOVE_INTENT.legacyProfileResolvedWidthMm,
    resolvedDepthMm: HDF4_GROOVE_INTENT.workingDepthMm,
    resolver: 'CURRENT_PRODUCTION_PROFILE',
    productionConfirmed: HDF4_GROOVE_INTENT.productionConfirmed,
    requiresTechnologyConfirmation: true,
  }),
});

/**
 * Standard preset of the swing wardrobe (r1.html:3740), in the prototype's key order.
 * The array plinthRailSideFastenerOffsets is not frozen in the prototype either.
 */
export const WardrobeStandardPreset = Object.freeze({
  id: 'WardrobeStandardPreset',
  /** LDSP 16: ES v1.2 §14.1 (MOD-DEC-055). */
  panelThickness: 16,
  backPanelThickness: HDF4_BACK_PANEL_INTENT.nominalThicknessMm,
  baseSystem: 'plinth',
  /** Plinth 70 mm: MOD-DEC-122. */
  plinthHeight: 70,
  plinthSetback: 20,
  plinthRailSideFastenerOffsets: [20, 50],
  /** Wooden dowels of the plinth rail: size and spacing are the Technologist's (MOD-DEC-154/192 open), prototype values. */
  plinthRailDowelMaxPositioningSpan: 600,
  plinthRailDowelMaxCount: 2,
  plinthRailDowelDiameter: 8,
  plinthRailDowelLength: 30,
  plinthRailDowelDrillingDepth: 15,
  plinthRailConnectionRequiresTechnologyConfirmation: true,
  /** System 32, step 32 mm: MOD-DEC-193; on by default: MOD-DEC-196. */
  system32Step: 32,
  system32DefaultAssist: true,
  system32Tolerance: 0.1,
  fixedLegHeight: 20,
  /** Soft guide for the nominal module width, 2400 mm: MOD-DEC-098. */
  maxCabinetModuleWidth: 2400,
  /** Prototype 25 mm; MOD-DEC-193 gives 32 mm between drawer boxes (FINDINGS 40). */
  internalDrawerGap: 25,
  drawerBoxHeight: 160,
  /** Confirmats of the drawer box joint: prototype values, flagged as requiring technology confirmation. */
  drawerJointConfirmatCount: 2,
  drawerJointConfirmatTopOffset: 35,
  drawerJointConfirmatBottomOffset: 35,
  drawerJointMinimumSpacing: 25,
  drawerJointGrooveClearance: 10,
  drawerJointOffsetsRequireTechnologyConfirmation: true,
  /** Runner rear clearance of the DB4501 candidate (standard runner not chosen: MOD-DEC-032, FINDINGS 39). */
  drawerSlideRearClearance: 40,
  drawerSlideSideClearance: 12.7,
  shelfDepthReduction: 30,
  visibleEdgeBand: 'V2',
  edgeDefaultProfile: 'PVC_ABS_2_0',
  edgeGlueTechnology: 'PUR',
  edgeApplicationType: 'straight',
  panelServiceCategory: 'STANDARD',
  backPanelMode: HDF4_BACK_PANEL_INTENT.currentLegacyMode.toLowerCase(),
  doorBottomClearanceMode: 'auto',
  doorBottomClearance: 70,
  antiTipHeightThreshold: 1800,
  antiTipMinimumZones: 2,
  moduleConnectorZones: ['upper', 'middle', 'lower'],
  drawerBottomMode: 'hdfInGroove',
  drawerBottomThickness: HDF4_GROOVE_INTENT.nominalMaterialThicknessMm,
  drawerGrooveDepth: HDF4_GROOVE_INTENT.workingDepthMm,
  drawerGrooveBottomOffset: HDF4_GROOVE_INTENT.workingBottomOffsetMm,
  /** Same number as EGGER_DENSITY of the shelf sag (drawers.ts). */
  eggerDensity: 655,
});
