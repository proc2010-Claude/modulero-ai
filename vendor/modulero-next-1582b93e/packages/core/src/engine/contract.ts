// Contract of the physical graph of the unified furniture engine (ENGINE.md §2, MIGRATION_PLAN task E1).
//
// The graph is the single source of truth of a product: parts, operations (holes, grooves, notches), joints,
// mechanisms, loads, unresolved questions and the FE-01 result. Every output — specification, cut list,
// drilling, BOM, price, 3D, drawings — is a projection of it (MOD-DEC-294).
//
// Basis (owner decision of 2026-10-20, ENGINE.md «Основа содержания»): only the skeleton of the graph is taken
// from the "other furniture" core (graph as the single source, explicit id generator, joints with a contact
// plane); the content of the contract — part schema, edge banding, holes, fasteners, mechanisms, FrontGrid and
// carcass formulas — is the swing wardrobe model of prototype r1 (model() of files 05, 06, 06a, 84, 87, 90).
// Every field of the wardrobe model.json is either mapped to a field below or marked "not carried over" with a
// reason in reference/engine/wardrobe-field-map.json (test: engine.field-map.test.ts). Other products extend
// this contract with optional fields; a wardrobe field is never removed or given another meaning for them.
//
// Names follow Handbook R7 (owner decision of 2026-10-21, Q10; PROGRAMMER_TERMINOLOGY_RU.md, rules 2–4, 9–12):
// types PascalCase, fields camelCase with the unit in the name (`lengthMm`, `massKg`), enum values
// UPPER_SNAKE_CASE. Every field carries a TERM-ID of reference/engine/TERMINOLOGY.json (Handbook R7 plus the
// terms proposed for approval, TERM-219…). Serialized fields of the prototype and of saved files are never
// renamed: the field map translates them. The prototype's wardrobe uses Y as the vertical, the graph uses z up;
// the axes are never swapped silently (rule 6).
//
// Product axes: x to the right, y to the back, z up, millimetres; origin — left front bottom corner of the
// product on a clean floor. Part axes: u along the length, v along the width, n along the thickness; face
// N_POS looks to +n. The field registries (`*_FIELDS`) give every field its TERM-ID; TypeScript checks that a
// registry names exactly the fields of its type.

// ---------------------------------------------------------------- shared values

/** Exact value, the FrontGrid arithmetic of the prototype (`{numerator, denominator}`, INV-F06). */
export interface Rational {
  numerator: number;
  denominator: number;
}

/** Vector or point in product axes. */
export type Vec3 = [number, number, number];

/** Axis-aligned box in product axes. */
export interface Box3 {
  minMm: Vec3;
  sizeMm: Vec3;
}

/** Where a number or a rule comes from (MOD-DEC-054: the decision is written next to the number). */
export type Source =
  | { kind: 'DECISION'; id: string }
  | { kind: 'STANDARD'; ref: string }
  | { kind: 'PROTOTYPE'; ref: string; finding: string }
  | { kind: 'CATALOG'; ref: string }
  /** No source: the value is UNKNOWN and every check that needs it answers UNKNOWN (Handbook §5). */
  | { kind: 'UNKNOWN'; reason: string };

export type Product = 'WARDROBE' | 'SLIDING_WARDROBE' | 'KITCHEN' | 'HOME';

// ---------------------------------------------------------------- versions and revision

export interface Versions {
  /** Engine contract version (this file). */
  engine: string;
  /** Generator of the product, e.g. `wardrobe-graph-1`; home: `generatorVersion`. */
  generator: string;
  /** Version of the rule set; wardrobe: `engineeringRuleSet.version` (MOD-DEC-054). */
  ruleSet: string;
  /** Version of each separately versioned policy, e.g. `{ fe04: '1' }` (MOD-DEC-054). */
  policies: Record<string, string>;
  /** Catalogue version of boards and edges; wardrobe: the prototype build that embeds them; home: its rule set. */
  catalog: string;
  /**
   * Release of the hardware catalogue the graph was built with (catalogs/RELEASE.json, task CAT-2): its version and
   * the SHA-256 of its content. A saved project keeps it (MOD-DEC-351); the same release gives the same graph.
   */
  hardwareCatalog: { version: string; sha256: string };
  /** Price snapshot; wardrobe: `costs.priceSnapshotId` (MOD-DEC-028). */
  priceSnapshotId: string | null;
  /** Dimension rule; wardrobe: `settings.dimensionRuleVersion` (DEPTH-EDGE-1). */
  dimensionRule: string;
}

export interface Revision {
  /** Hash of the canonical product input (FE-PROJ-001); every output carries it (INV-S04). */
  projectRevisionId: string;
}

// ---------------------------------------------------------------- site (room, walls, floor)

export interface Site {
  /** Room size when known (MOD-DEC-198); an unknown size is null, never 0. */
  room: { widthMm: number | null; heightMm: number | null; depthMm: number | null } | null;
  /** Walls next to the product: closed sides change fasteners (MOD-DEC-192, WR-18); 168 — walls on both sides. */
  walls: { left: boolean; right: boolean; back: boolean };
  /** Room skirting board and how it is solved (MOD-DEC-198); unknown skirting is null, not 0. */
  roomSkirting: { heightMm: number; depthMm: number; solution: string } | null;
  /** Gap to the rear wall. */
  wallGapMm: number;
}

// ---------------------------------------------------------------- assemblies and grids

export type AssemblyKind = 'PRODUCT' | 'CABINET' | 'MODULE' | 'SECTION' | 'FILL';

/** Elevations of a carcass from the floor: wardrobe `modules[].geometry` (06a; prototype Y is the vertical). */
export interface CarcassElevations {
  floorElevationMm: number;
  sideBottomElevationMm: number;
  sideTopElevationMm: number;
  plinthBottomElevationMm: number;
  plinthTopElevationMm: number;
  bottomPanelBottomElevationMm: number;
  bottomPanelTopElevationMm: number;
  interiorBottomElevationMm: number;
  interiorTopElevationMm: number;
  topPanelBottomElevationMm: number;
  topPanelTopElevationMm: number;
}

/**
 * Base of a carcass: wardrobe `baseSystem` (plinth 70 by default — MOD-DEC-291; removal — 171). FLOOR_PADS — floor
 * pads under the bearing panels of "other furniture" (home `floor_pad`, 3 mm on a hard floor, 5 mm on carpet; E2).
 * LEGS_PLINTH — legs behind a decorative plinth of board on clips (MOD-DEC-481, 483).
 */
export interface BaseSpec {
  kind: 'PLINTH' | 'FIXED_LEGS' | 'ADJUSTABLE_LEGS' | 'NONE' | 'MIXED' | 'FLOOR_PADS' | 'LEGS_PLINTH';
  heightMm: number;
  plinthSetbackMm: number;
  /** Hardware of the base is confirmed (`requiresHardwareConfirmation` of the prototype is the opposite). */
  hardwareConfirmed: boolean;
}

/** Back panel of a carcass: rebate (quarter) by default — MOD-DEC-287; removal — 168. INSET — a bearing back between the sides, on the bottom and under the top ("other furniture", E2). */
export interface BackSpec {
  mounting: 'REBATE' | 'OVERLAY' | 'GROOVE' | 'NONE' | 'INSET';
  panelThicknessMm: number;
  /** Numbers of the quarter are the prototype's demo data, not canon (HB 533). */
  rebateDepthMm: number | null;
  rebateWidthMm: number | null;
  inPlaneClearanceMm: number | null;
  rearClearanceMm: number | null;
  status: string;
}

/** A carcass frame: the formulas M − 2t, H − p − 2t of VERTICAL_CONTINUOUS (MOD-DEC-051) are evaluated into it. */
export interface CarcassFrame {
  scheme: 'VERTICAL_CONTINUOUS' | 'TOP_OVER_SIDES';
  panelThicknessMm: number;
  elevations: CarcassElevations;
  base: BaseSpec;
  back: BackSpec;
  /** Three depths (MOD-DEC-163); wardrobe `settings.dimensions`. */
  depths: { carcassDepthMm: number; shelfDepthMm: number; facadeToCarcassGapMm: number };
}

/** Nominal and clear spans of a section, exact (MOD-DEC-051: C = N − b_left − b_right). */
export interface SectionSpan {
  nominalStartMm: Rational;
  nominalEndMm: Rational;
  clearStartMm: Rational;
  clearEndMm: Rational;
}

/** Column of the FrontGrid: wardrobe `frontGrid.columns[]`. */
export interface FrontGridColumn {
  id: string;
  index: number;
  nominalStartMm: Rational;
  nominalEndMm: Rational;
  /** `SUPPORTED`, `UNSUPPORTED_PROFILE_REQUIRED`… */
  status: string;
}

/** Facade of the facade dimension chain: wardrobe `frontGrid.facades[]`, `facadeChain[]`. */
export interface FrontGridFacade {
  id: string;
  columnId: string;
  facadeRowId: string | null;
  leftMm: Rational;
  rightMm: Rational;
  bottomElevationMm: Rational;
  topElevationMm: Rational;
  /** Physical facade parts of this chain item; more than one is the unsupported multi-facade section. */
  partIds: string[];
  status: string;
}

/**
 * Gaps and outer offsets of the facades. Межфасадный зазор 3 (124, 185); left and right outer offsets 1,5 (124).
 * Top and bottom offsets have no decision: the prototype's 2 mm (owner decision 2026-10-20, FINDINGS 55), the
 * bottom one over the base — door bottom 72 mm at a 70 mm plinth; half the gap is not carried to the vertical.
 * The depth gap of 2 mm applies only to standard overlay swing doors (162).
 */
export interface FacadeGapProfile {
  profileId: string;
  facadeGapHorizontalMm: number;
  facadeGapVerticalMm: number;
  facadeOuterOffsetLeftMm: number;
  facadeOuterOffsetRightMm: number;
  facadeOuterOffsetTopMm: number;
  facadeBottomOffsetMm: number;
  facadeToCarcassGapMm: number;
}

export interface FacadeOverlay {
  facadeId: string;
  facadeOverlayLeftMm: number;
  facadeOverlayRightMm: number;
  facadeOverlayTopMm: number;
  facadeOverlayBottomMm: number;
}

/** FrontGrid (фронтальная координатная сетка): exact rational arithmetic (`00:36-46`). */
export interface FrontGrid {
  mode: 'AUTO' | 'MANUAL';
  facadeWidthPolicy: string;
  gapProfile: FacadeGapProfile;
  columns: FrontGridColumn[];
  facades: FrontGridFacade[];
  overlays: FacadeOverlay[];
}

export interface Assembly {
  id: string;
  kind: AssemblyKind;
  parentId: string | null;
  /** Element of the product input this assembly comes from (section, shelf, drawer of the user). */
  inputRef: string | null;
  box: Box3;
  index: number;
  frame: CarcassFrame | null;
  span: SectionSpan | null;
  /** FrontGrid, clear openings, zones and modules stay separate (FE-INV-001/002). */
  frontGrid: FrontGrid | null;
  /** What the user asked for in this section: shelves, rods, drawers (wardrobe `requestedShelves`, `filling`). */
  request: Record<string, number | string | boolean | null> | null;
}

// ---------------------------------------------------------------- parts

/** Role of a part (TERMINOLOGY.json); other products extend the list. */
export type PartRole =
  | 'SIDE_PANEL_LEFT'
  | 'SIDE_PANEL_RIGHT'
  /** Перегородка between sections, full height (TERM-063). */
  | 'PARTITION'
  /** Разделитель наполнения: from the bottom, crosses shelves, drawers or rods (TERM-064, MOD-DEC-226, 234). */
  | 'FILLING_DIVIDER'
  /** Локальная перегородка on a supporting shelf (TERM-065, MOD-DEC-226, 234). */
  | 'LOCAL_PARTITION'
  /** Стоевая (TERM-066). */
  | 'VERTICAL_STRUCTURAL_PANEL'
  /** Крыша корпуса between the sides (TERM-056). */
  | 'CARCASS_TOP_PANEL'
  /** Верхняя крышка of low furniture, over the sides (TERM-057, MOD-DEC-242). */
  | 'TOP_COVER_PANEL'
  | 'CARCASS_BOTTOM_PANEL'
  | 'BACK_PANEL'
  | 'PLINTH_PANEL'
  | 'FIXED_SHELF'
  | 'ADJUSTABLE_SHELF'
  | 'DRAWER_COVER_SHELF'
  /** Створка распашного фасада (TERM-019). */
  | 'HINGED_FACADE_LEAF'
  /** Створка подъёмного фасада: the front of a mezzanine on a FACADE_LIFT (MOD-DEC-320, task LIFT). */
  | 'LIFT_FACADE_LEAF'
  | 'DECORATIVE_FACADE'
  | 'STRUCTURAL_FRONT'
  | 'DRAWER_BOX_SIDE'
  | 'DRAWER_BOX_BACK'
  | 'DRAWER_BOTTOM_PANEL'
  /** Проставка под направляющие ящиков on the side panel or the partition of the hinges (MOD-DEC-331, 360; W7). */
  | 'DRAWER_RUNNER_SPACER'
  | 'SLIDING_LEAF_INFILL'
  | 'FILLER_PANEL'
  | 'WORKTOP'
  | 'SUPPORT_PAD'
  /** Задняя царга: a rear rail under the top that closes the knee space of a desk ("other furniture", E2). */
  | 'REAR_APRON';

/** Structural role: wardrobe `parts[].role` (`loadBearingPanel`, `structuralPanel`, `loadTransferPanel`…). */
export type StructuralRole =
  | 'LOAD_BEARING'
  | 'STRUCTURAL'
  | 'LOAD_TRANSFER'
  | 'STRUCTURAL_SHELF'
  | 'NON_STRUCTURAL_BACK'
  | 'FACADE'
  | 'DRAWER_BOX'
  | 'NONE';

/** Letters of the edges in this contract's scheme: A, B along the length at v = 0 / width; C, D along the width at u = 0 / length. */
export type EdgeSlot = 'A' | 'B' | 'C' | 'D';
export type PhysicalEdge = 'FRONT' | 'REAR' | 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
/** Panel face toward +n or −n of the part (no letter, so it is not confused with the F state or edge B). */
export type PanelFaceSide = 'N_POS' | 'N_NEG';

/**
 * Exposure of an edge (TERM-234, MOD-DEC-339): visible, on the floor, hidden. «Без кромки» is not an exposure but a
 * choice of band (`intent` `NONE`): allowed on any edge, with a warning to the user (MOD-DEC-325).
 */
export type EdgeExposure = 'VISIBLE' | 'FLOOR' | 'HIDDEN';

/** Edge band of one edge (§18, FE-EDGE-001/002, MOD-DEC-193); intent and resolved banding are separate (rule 9). */
export interface EdgeBand {
  slot: EdgeSlot;
  physicalEdge: PhysicalEdge;
  edgeLengthMm: number;
  /** Намерение кромления: `EDGE_2_0`, `EDGE_1_0`, `EDGE_0_4`, `NONE`. */
  intent: string;
  /** Thickness of the band by its intent (EDGE_1_0 → 1). */
  edgeBandThicknessMm: number;
  /** Effective build-up on the core: F = E − e₋ − e₊ (HB 172, 1466). null — not known: F, M, S UNKNOWN. */
  effectiveEdgeBandThicknessMm: number | null;
  /** Рассчитанное кромление: supplier profile, e.g. `PVC_ABS_0_8_1_0`. */
  profileCode: string;
  automaticIntent: string;
  /** Manual override or `AUTO`. */
  override: string;
  exposure: EdgeExposure;
  ruleId: string;
}

export interface PartOrientation {
  /** `verticalDepth`, `horizontalDepth`, `frontal`… of the prototype (file 04). */
  family: string;
  handedness: 'LEFT' | 'RIGHT' | 'NONE';
  /** Physical names of the faces: `inside` / `outside`, `top` / `bottom`… */
  faceNames: Record<PanelFaceSide, string>;
  /** Normal of each face in product axes: `+X`, `-Y`… */
  faceNormals: Record<string, string>;
  grainDirection: 'ALONG_LENGTH' | 'ALONG_WIDTH' | 'NONE';
}

export interface PartMaterial {
  /** `LDSP`, `HDF`, `MDF`, `GLASS`, `MIRROR`… */
  family: string;
  decorId: string;
  variantId: string;
  label: string;
  panelThicknessMm: number;
  sheetFormatMm: [number, number] | null;
  purpose: 'MANUFACTURE' | 'PURCHASE';
  /** Decor of the bands of the visible edges when it is not the part's (MOD-DEC-483: «в цвет фасадов»); absent — the part's. */
  edgeDecorId?: string;
}

export interface PlanarSize {
  lengthMm: number;
  widthMm: number;
}

/** Allowance on both ends of one axis; zero is given explicitly too (HB 220). */
export interface Allowance {
  minusMm: number;
  plusMm: number;
  source: Source;
}

/** Dimension states of a part (Handbook HB 172, 1466; TERM-213…215). */
export type DimensionState = 'FINISHED_PART_WITH_EDGE' | 'FINISHED_PART' | 'MACHINING_BLANK' | 'SAWN_BLANK';

/**
 * F = E − e₋ − e₊ (effective band), M = F + m₋ + m₊ (before edge trimming), S = M + s₋ + s₊ (sawn blank, the
 * cut list). Saw kerf is not added to each S. A state is null when an input it needs is unknown; `missing` says which.
 */
export interface DimensionChain {
  /** F — FINISHED_PART (основа без кромки). */
  finishedPart: PlanarSize | null;
  machiningAllowance: { length: Allowance; width: Allowance } | null;
  /** M — MACHINING_BLANK. */
  machiningBlank: PlanarSize | null;
  sawingAllowance: { length: Allowance; width: Allowance } | null;
  /** S — SAWN_BLANK: the size in the cut list. */
  sawnBlank: PlanarSize | null;
  /** VERIFIED — every input from a decision or a catalogue; UNVERIFIED — prototype values; UNKNOWN — a state is missing. */
  status: 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';
  missing: string[];
}

/** Which part a floor pad carries ("other furniture" `supports`, E2): a bearing panel, or the bottom panel it is under. */
export interface FloorSupport {
  bearingPartId: string;
  /** The pad is under the bottom panel, not under a vertical panel (the middle pad of a chest). */
  viaBottomPanel: boolean;
}

/**
 * A bevelled end of a part (MOD-DEC-440): the end C (u = 0) or D (u = length) is sawn across the thickness at an
 * angle, so one face is shorter than the other. The finished size E is the longer face; the band of the end lies on
 * the bevel, and its build-up along the length is its thickness / sin(angle).
 */
export interface PartBevel {
  edge: 'C' | 'D';
  /** The face that is shorter: N_NEG (n = 0) or N_POS (n = thickness). */
  shortFace: PanelFaceSide;
  /** How much shorter that face is, mm. */
  setbackMm: number;
  /** Angle between the bevel and the faces, degrees. */
  angleDeg: number;
  decision: string;
}

/**
 * The band of one segment of the contour of a polygonal part (FINDINGS 575, 816): segment i runs from contourMm[i] to
 * contourMm[i + 1]. The bands A–D stay the sides of the envelope (the dimension chain); the edges of a polygonal part
 * — the metres, the price — are its segments.
 */
export interface ContourEdge {
  segment: number;
  /** The side of the envelope the segment lies on; null — an oblique segment. */
  slot: EdgeSlot | null;
  lengthMm: number;
  /** Намерение кромления, as of a band A–D: `EDGE_0_8`, `NONE`… */
  intent: string;
  edgeBandThicknessMm: number;
  profileCode: string;
  exposure: EdgeExposure;
  ruleId: string;
}

export interface Part {
  /** Stable id from the assembly path and role (FE-ID-001, WR-28); an export row number is not an id. */
  id: string;
  name: string;
  assemblyId: string;
  inputRef: string | null;
  role: PartRole;
  structuralRole: StructuralRole;
  handedness: 'LEFT' | 'RIGHT' | 'NONE';
  material: PartMaterial;
  /**
   * E — FINISHED_PART_WITH_EDGE: finished size with edge banding (MOD-DEC-169). The prototype writes this state
   * as `dimensionBasis: FINISHED_PART`; in the C01 contract FINISHED_PART is F (IR6-04).
   */
  finishedWithEdge: { lengthMm: number; widthMm: number; panelThicknessMm: number };
  /** F, M, S derived from E, the effective edge build-up and explicit allowances (owner decision 2026-10-20). */
  dimensionChain: DimensionChain;
  /** The one transform for 3D, drawings and checks: origin and part axes u, v, n in product axes. */
  placement: { originMm: Vec3; uAxis: Vec3; vAxis: Vec3; nAxis: Vec3 };
  orientation: PartOrientation;
  edges: Record<EdgeSlot, EdgeBand>;
  /** Polygon of a non-rectangular part in part axes; then `finishedWithEdge` is its envelope. */
  contourMm: [number, number][] | null;
  /** The bands of the segments of `contourMm`, one per segment; only on a polygonal part. */
  contourEdges?: ContourEdge[];
  supply: 'MANUFACTURED' | 'PURCHASED';
  operationIds: string[];
  installationElevationMm: number | null;
  qualification: { physical: boolean; cnc: boolean; reasons: string[] };
  /** Floor pad only: the part it carries (E2). */
  floorSupport?: FloorSupport | null;
  /** Ends sawn at an angle across the thickness (MOD-DEC-440); absent — square ends. */
  bevels?: PartBevel[];
}

// ---------------------------------------------------------------- operations

export type OperationOwner = { jointId: string } | { mechanismId: string };

/** Coordinate basis: from the finished part E after edging (MOD-DEC-169, `POST_EDGING`). */
export interface OperationBasis {
  datum: 'FINISHED_PART_WITH_EDGE';
  stage: 'POST_EDGING';
  /** Dimension transform: wardrobe `dimensionTransformId`/`Version` (DEPTH-EDGE-1). */
  transform: string;
}

export interface Hole {
  op: 'HOLE';
  id: string;
  partId: string;
  mode: 'FACE' | 'EDGE';
  face: PanelFaceSide | null;
  edge: EdgeSlot | null;
  /** Face: along the length from the base corner A/C; edge: along the edge. */
  xMm: number;
  /** Face: along the width. */
  yMm: number;
  diameterMm: number;
  /** null for a through hole. */
  depthMm: number | null;
  through: boolean;
  /** Marking: only library holes of hardware up to 1 mm, the machine does not drill them (MOD-DEC-276, HB 278). */
  layer: 'DRILL' | 'MARKING';
  /** `THROUGH_HOLE`, `PILOT_BLIND_HOLE`, `CAM`, `CUP`, `PLATE`… */
  machiningRole: string;
  purpose: string;
  code: string;
  owner: OperationOwner;
  fastenerProfileId: string | null;
  /** Axis offset kept apart from the diameter (FE-INV-007). */
  axisOffsetMm: number | null;
  entryMm: Vec3;
  inwardNormal: Vec3;
  stationMm: number | null;
  /**
   * MOD-DEC-277: the kit fragment `.fr3d`, the manufacturer catalogue (with `sourceRef`) or a policy rule (carcass
   * fasteners only). A hole of a hardware mechanism never comes from a rule; no substitution of another
   * article's drilling (205, 219). PROTOTYPE (task H1): a number of the prototype with neither kit nor catalogue —
   * `sourceRef` names the prototype place, completeness is never COMPLETE and the graph carries DRILLING_INCOMPLETE
   * for its owner («присадка неполная», 277; INV-H06).
   */
  source: 'KIT_FR3D' | 'MANUFACTURER_CATALOG' | 'RULE' | 'PROTOTYPE';
  sourceRef: string | null;
  /** INCOMPLETE — the kit lacks holes (HB 287); UNKNOWN_AWAITING_OWNER — no kit, no catalogue (HB 328). */
  completeness: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN_AWAITING_OWNER';
  status: string;
  basis: OperationBasis;
}

export interface Groove {
  op: 'GROOVE';
  id: string;
  partId: string;
  face: PanelFaceSide | null;
  edge: EdgeSlot | null;
  along: 'LENGTH' | 'WIDTH';
  startMm: number;
  endMm: number;
  offsetMm: number;
  grooveWidthMm: number;
  grooveDepthMm: number;
  /** `GROOVE_FOR_HDF4`, `QUARTER_FOR_HDF4`… */
  semanticType: string;
  purpose: string;
  owner: OperationOwner;
  resolution: { profileId: string; productionConfirmed: boolean; requiresTechnologyConfirmation: boolean };
  basis: OperationBasis;
}

/** Rectangular cut-out: wardrobe `rearNotch` (quarter of the back, skirting cut-out). */
export interface Notch {
  op: 'NOTCH';
  id: string;
  partId: string;
  uRangeMm: [number, number];
  vRangeMm: [number, number];
  nRangeMm: [number, number];
  purpose: string;
  owner: OperationOwner;
  basis: OperationBasis;
}

export type Operation = Hole | Groove | Notch;

// ---------------------------------------------------------------- joints

/**
 * BEARING_CONTACT — vertical bearing contact without a fastener: the raised bottom on the plinth rails (wardrobe
 * `supportContacts`, task W3, engine-contract-5); the load goes by contact, dowels of the pair only position the parts.
 */
export type JointKind = 'CONFIRMAT' | 'CAM_CONNECTOR' | 'DOWEL' | 'GROOVE_FIT' | 'SCREW' | 'GLUE' | 'BEARING_CONTACT';

export interface DrillingExemption {
  decision: string;
  reason: string;
}

/** Where a joint is in the carcass: top, bottom, back, apron, shelf, drawer box, drawer front fixing (E2, MOD-DEC-314). */
export type ConnectionRole =
  | 'TOP'
  | 'BOTTOM'
  | 'BACK'
  | 'BACK_BOTTOM'
  | 'BACK_TOP'
  | 'APRON'
  | 'DIVIDER_BOTTOM'
  | 'SHELF'
  | 'BOX_FRONT'
  | 'BOX_CONFIRMAT'
  | 'FRONT_FIX'
  /** A rail of the plinth to a side or the bottom ("other furniture" r5, MOD-DEC-516). */
  | 'PLINTH'
  /** A bottom of HDF of a drawer in the groove of a wall of its box ("other furniture" r5, MOD-DEC-574). */
  | 'DRAWER_BOTTOM'
  /** A rim to the top it stands on ("other furniture" r5, MOD-AI-40). */
  | 'RIM';

/** Station pattern that is not the default: offset rows on a shared partition; the back and apron of a desk (E2); a joint narrower than 200 mm (MOD-DEC-364). */
export type PlacementProfile = 'SHARED_SHELF_PATTERN' | 'DESK_SHARED_BACK_APRON_EXCEPTION' | 'NARROW_JOINT_364';

export interface Joint {
  id: string;
  kind: JointKind;
  parts: { throughPartId: string; receivingPartId: string };
  contact: { axis: 0 | 1 | 2; frame: { originMm: Vec3; uAxis: Vec3; sAxis: Vec3; wAxis: Vec3 }; contactLengthMm: number; contactAreaMm2: number };
  faces: { through: string; receiving: string; outer: string | null; cup: string | null };
  /** `RASTEX16_DU325` (MOD-DEC-292), `CONFIRMAT_7X50`… */
  profileId: string;
  /** Coinciding stations are merged (WR-07). */
  stationsMm: number[];
  /** MOD-DEC-192: OK, UNKNOWN, IMPOSSIBLE. */
  assembly: 'OK' | 'UNKNOWN' | 'IMPOSSIBLE';
  reason: string;
  visibility: { exposed: boolean; covered: boolean; internalPartition: boolean; role: string };
  opposed: { opposed: boolean; minWebMm: number | null };
  dowelCount: number;
  physicalVerified: boolean;
  productionExecutable: boolean;
  /** No drilling by decision (e.g. SLIM screws, MOD-DEC-189). */
  drillingExemption: DrillingExemption | null;
  /** Where the joint is in the carcass (home `orientation`, E2). */
  connectionRole?: ConnectionRole;
  /** Pattern of the connector stations when it is not the default one (home `placementProfile`, E2). */
  placementProfile?: PlacementProfile | null;
}

// ---------------------------------------------------------------- mechanisms

export type MechanismKind =
  | 'HINGE'
  | 'DRAWER_RUNNER'
  | 'CLOTHES_ROD'
  /** Подъёмник фасада (MOD-DEC-320, task LIFT): the row of the lift catalogue by INV-D18-01, the working angle by INV-D18-02. */
  | 'FACADE_LIFT'
  | 'SHELF_SUPPORT'
  | 'SLIDING_SYSTEM'
  | 'SUPPORT_LEG'
  | 'SUSPENSION_RAIL'
  | 'APPLIANCE'
  | 'DRAWER_BOX'
  | 'ANTI_TIP'
  /** Ручка фасада (TERM-103, task FIT, MOD-DEC-480): a handle of the catalogue on a door, a drawer front or a lift front; no drilling (158). */
  | 'HANDLE'
  /** Светильник секции (MOD-DEC-483): a light of the catalogue under the roof or the top shelf of a section. */
  | 'LIGHT'
  /** Блок питания подсветки (MOD-DEC-483): one per wardrobe, by the sum of the powers of the lights. */
  | 'POWER_SUPPLY'
  /** Толкатель открывания нажатием (MOD-DEC-483): at the free edge of a door on hinges without a spring. */
  | 'PUSH_LATCH'
  /** Вывод проводов (MOD-DEC-574, 496): the hole for the cables in the back of a TV unit. */
  | 'CABLE_OUTLET'
  /** Корзина выдвижная (MOD-DEC-484): for linen or for shoes (`params.contents`), on runners in its frame between the panels of the section. */
  | 'BASKET'
  /** Вешало для брюк выдвижное (MOD-DEC-484): between the panels of the section, or screwed under the panel above. */
  | 'TROUSER_RACK'
  /** Пантограф (опускаемая штанга, MOD-DEC-484): screwed to the panels of the section, lowered by its lever. */
  | 'PANTOGRAPH';

/**
 * A visible model of purchased hardware (MOD-DEC-432, task FIT): a prism like a part — origin + s·L·u + t·W·v + r·T·n,
 * a contour in the u, v plane in place of the rectangle — drawn with the finish of the item. A visual only: the
 * sizes the engine counts with stay in the catalogue and in `params`, no check reads it.
 */
export interface HardwareVisual {
  id: string;
  /** The part it is fixed to and moves with (a door, a drawer front); null — it stands in the product. */
  hostPartId: string | null;
  originMm: Vec3;
  uAxis: Vec3;
  vAxis: Vec3;
  nAxis: Vec3;
  sizeMm: Vec3;
  contourMm: [number, number][] | null;
  /**
   * GRAPHITE — of the baskets, trouser racks and pantographs (MOD-DEC-484); SILVER, GOLD, CHAMPAGNE, BRONZE and
   * WHITE_GLOSS — the anodised profiles of the sliding doors in their colour (MOD-AI-24, FINDINGS 2956).
   */
  finish: 'METAL' | 'BLACK' | 'WHITE' | 'GRAPHITE' | 'SILVER' | 'GOLD' | 'CHAMPAGNE' | 'BRONZE' | 'WHITE_GLOSS';
}

/**
 * The 3D model of a purchased item from its file of the catalogue (MOD-DEC-536, FINDINGS 1085): drawn instead of the
 * `visuals` of its mechanism once the client has the file, which stay the picture without it. The box (`originMm`,
 * the axes, `sizeMm`) is the place of the item in the product; the file is put into it by its own origin and axes
 * (`model3d` of the record); `stretchAtMm` — the plane of the file (along u, from its origin) beyond which the file
 * moves by `sizeMm[0] − drawnWidthMm`: a frame or a rod that telescopes to the width of the section. Only a picture:
 * the sizes for the calculation are those of the catalogue.
 */
export interface HardwareModel {
  id: string;
  hostPartId: string | null;
  originMm: Vec3;
  uAxis: Vec3;
  vAxis: Vec3;
  nAxis: Vec3;
  sizeMm: Vec3;
  file: string;
  sha256: string;
  fileOriginMm: Vec3;
  fileAxes: { u: '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'; v: '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'; n: '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z' };
  stretchAtMm: number | null;
  drawnWidthMm: number | null;
  finish: HardwareVisual['finish'];
}

export type CapabilityStatus = 'RESOLVED' | 'PLACEHOLDER' | 'HOLD';

export interface Mechanism {
  id: string;
  kind: MechanismKind;
  partIds: string[];
  assemblyId: string;
  profile: { catalogId: string; compatibilityProfileId: string | null; version: string | null };
  /** Overlay, cup centre and K, runner length, rod elevation (290), drawer box sizes… with units in the keys. */
  params: Record<string, number | string | boolean | null>;
  stationsMm: number[];
  /** Огибающая движения and occupied volume for collision checks (050, 159, 164). */
  motionEnvelopes: Box3[];
  capability: { status: CapabilityStatus; reason: string | null };
  quantity: number;
  drillingExemption: DrillingExemption | null;
  /** What the 3D view draws of it (MOD-DEC-432, task FIT); absent — no model yet. */
  visuals?: HardwareVisual[];
  /** Its model of the catalogue (MOD-DEC-536): drawn instead of `visuals` when the client has the file. */
  model?: HardwareModel;
}

// ---------------------------------------------------------------- loads

export interface Load {
  id: string;
  partId: string | null;
  mechanismId: string | null;
  spanMm: number;
  physicalLengthMm: number;
  depthMm: number;
  panelThicknessMm: number;
  selfMassKg: number;
  /** Shelf payload 10 kg by default (MOD-DEC-289). */
  payloadKg: number;
  totalMassKg: number;
  youngModulusNPerMm2: number;
  secondMomentOfAreaMm4: number;
  deflectionMm: number;
  bendingStressNPerMm2: number;
  /** null — HOLD (§14.1). */
  deflectionLimitMm: number | null;
  /** null = UNKNOWN, never infinite (INV-E19-03; SLIM — owner decision 2026-10-20). */
  capacityKg: number | null;
  screenPass: boolean;
  physicalQualified: false;
  /** Self mass over the span (screen) or of the finite panel ("other furniture" `selfMassBasis`, E2). */
  selfMassBasis?: 'SCREEN_SPAN_MASS' | 'FINITE_PANEL_MASS';
}

// ---------------------------------------------------------------- unresolved and result

export interface Unresolved {
  code: string;
  level: 'ERROR' | 'WARNING' | 'INFO';
  partIds: string[];
  jointIds: string[];
  operationIds: string[];
  mechanismIds: string[];
  /** Plain Russian text (INV-V03). */
  text: string;
  ruleId: string;
  /** Rule metadata, not a result field (§24.2). */
  blocksProductionReadiness: boolean;
}

export interface CapabilityResolution {
  capability: string;
  status: CapabilityStatus;
  reasons: string[];
}

export interface InstallationRequirement {
  id: string;
  type: string;
  required: boolean;
  targetPartIds: string[];
  selection: string;
  text: string;
}

/** FE-01 result (MOD-DEC-047, §24.2). */
export interface Result {
  furnitureValidity: 'VALID' | 'VALID_WITH_WARNINGS' | 'INVALID';
  capabilityResolution: CapabilityResolution[];
  productionReadiness: { status: 'READY' | 'BLOCKED' | 'ADAPTER_REQUIRED'; blockers: string[] };
  installationRequirements: InstallationRequirement[];
  /** Printed on production exports while readiness ≠ READY (INV-V04, WR-24). */
  exportQualification: 'PRODUCTION' | 'NOT_FOR_PRODUCTION';
}

// ---------------------------------------------------------------- graph

export interface Graph {
  product: Product;
  versions: Versions;
  revision: Revision;
  coordinateSystem: 'X_RIGHT_Y_BACK_Z_UP_MM';
  envelope: { widthMm: number; heightMm: number; depthMm: number; installedHeightMm: number; installationOffsetMm: number };
  site: Site;
  assemblies: Assembly[];
  parts: Part[];
  operations: Operation[];
  joints: Joint[];
  mechanisms: Mechanism[];
  loads: Load[];
  unresolved: Unresolved[];
  result: Result;
}

// ---------------------------------------------------------------- field registries

/** `TERM-nnn[, TERM-nnn] · описание`: TERM-IDs of reference/engine/TERMINOLOGY.json (Handbook R7 + engine terms TERM-219…). Generated by scripts/engine/contract-registry.mjs. */
type Fields<T> = { readonly [K in keyof T]-?: `TERM-${string} · ${string}` };

export const RATIONAL_FIELDS = {
  numerator: 'TERM-219 · числитель',
  denominator: 'TERM-219 · знаменатель',
} as const satisfies Fields<Rational>;

export const BOX3_FIELDS = {
  minMm: 'TERM-220 · минимальный угол',
  sizeMm: 'TERM-220, TERM-191 · размер',
} as const satisfies Fields<Box3>;

export const VERSIONS_FIELDS = {
  engine: 'TERM-221 · версия контракта',
  generator: 'TERM-222 · версия генератора',
  ruleSet: 'TERM-223 · версия набора правил',
  policies: 'TERM-223, TERM-172 · версии политик',
  catalog: 'TERM-224 · версия каталога',
  hardwareCatalog: 'TERM-224 · версия каталога фурнитуры',
  priceSnapshotId: 'TERM-165 · снимок цены',
  dimensionRule: 'TERM-213 · размерное правило',
} as const satisfies Fields<Versions>;

export const REVISION_FIELDS = {
  projectRevisionId: 'TERM-160, TERM-161 · ревизия проекта',
} as const satisfies Fields<Revision>;

export const SITE_FIELDS = {
  room: 'TERM-076, TERM-121 · помещение',
  walls: 'TERM-076 · стены',
  roomSkirting: 'TERM-075 · плинтус помещения',
  wallGapMm: 'TERM-013 · зазор до стены',
} as const satisfies Fields<Site>;

export const CARCASS_ELEVATIONS_FIELDS = {
  floorElevationMm: 'TERM-186 · отметка пола',
  sideBottomElevationMm: 'TERM-084, TERM-055 · низ боковины',
  sideTopElevationMm: 'TERM-209 · верх боковины',
  plinthBottomElevationMm: 'TERM-071 · низ цокольной зоны',
  plinthTopElevationMm: 'TERM-071 · верх цокольной зоны',
  bottomPanelBottomElevationMm: 'TERM-058, TERM-084 · низ дна',
  bottomPanelTopElevationMm: 'TERM-058, TERM-084 · верх дна',
  interiorBottomElevationMm: 'TERM-024, TERM-084 · низ проёма',
  interiorTopElevationMm: 'TERM-024, TERM-084 · верх проёма',
  topPanelBottomElevationMm: 'TERM-056, TERM-084 · низ крыши',
  topPanelTopElevationMm: 'TERM-056, TERM-209 · верх крыши',
} as const satisfies Fields<CarcassElevations>;

export const BASE_SPEC_FIELDS = {
  kind: 'TERM-070, TERM-072 · вид основания',
  heightMm: 'TERM-071, TERM-074 · высота основания',
  plinthSetbackMm: 'TERM-073 · отступ цокольной планки',
  hardwareConfirmed: 'TERM-074, TERM-170 · опоры подтверждены',
} as const satisfies Fields<BaseSpec>;

export const BACK_SPEC_FIELDS = {
  mounting: 'TERM-199 · схема установки задней стенки',
  panelThicknessMm: 'TERM-036, TERM-034 · толщина задней стенки',
  rebateDepthMm: 'TERM-062 · глубина четверти',
  rebateWidthMm: 'TERM-062 · ширина четверти',
  inPlaneClearanceMm: 'TERM-001 · зазор в плоскости',
  rearClearanceMm: 'TERM-001 · задний зазор',
  status: 'TERM-169 · квалификация схемы',
} as const satisfies Fields<BackSpec>;

export const CARCASS_FRAME_FIELDS = {
  scheme: 'TERM-225, TERM-173 · схема корпуса',
  panelThicknessMm: 'TERM-036 · толщина панели',
  elevations: 'TERM-084 · высотные отметки',
  base: 'TERM-070 · основание',
  back: 'TERM-059 · задняя стенка',
  depths: 'TERM-026, TERM-027, TERM-028, TERM-011 · три глубины (163)',
} as const satisfies Fields<CarcassFrame>;

export const SECTION_SPAN_FIELDS = {
  nominalStartMm: 'TERM-022 · начало по фронтальной сетке',
  nominalEndMm: 'TERM-022 · конец по фронтальной сетке',
  clearStartMm: 'TERM-024 · начало чистого проёма',
  clearEndMm: 'TERM-024 · конец чистого проёма',
} as const satisfies Fields<SectionSpan>;

export const FRONT_GRID_COLUMN_FIELDS = {
  id: 'TERM-226, TERM-022 · колонка',
  index: 'TERM-227 · номер',
  nominalStartMm: 'TERM-022 · точное начало',
  nominalEndMm: 'TERM-022 · точный конец',
  status: 'TERM-228 · поддержка профиля',
} as const satisfies Fields<FrontGridColumn>;

export const FRONT_GRID_FACADE_FIELDS = {
  id: 'TERM-174 · звено фасадной цепи',
  columnId: 'TERM-022 · колонка',
  facadeRowId: 'TERM-018 · фасадный ряд',
  leftMm: 'TERM-025 · левый край контура',
  rightMm: 'TERM-025 · правый край контура',
  bottomElevationMm: 'TERM-009, TERM-025 · низ контура',
  topElevationMm: 'TERM-025, TERM-084 · верх контура',
  partIds: 'TERM-153 · физические фасады',
  status: 'TERM-228 · поддержка профиля',
} as const satisfies Fields<FrontGridFacade>;

export const FACADE_GAP_PROFILE_FIELDS = {
  profileId: 'TERM-229 · профиль',
  facadeGapHorizontalMm: 'TERM-003 · межфасадный зазор по горизонтали',
  facadeGapVerticalMm: 'TERM-004 · межфасадный зазор по вертикали',
  facadeOuterOffsetLeftMm: 'TERM-182 · левый внешний отступ',
  facadeOuterOffsetRightMm: 'TERM-183 · правый внешний отступ',
  facadeOuterOffsetTopMm: 'TERM-010 · верхний внешний отступ',
  facadeBottomOffsetMm: 'TERM-008 · нижний дополнительный отступ',
  facadeToCarcassGapMm: 'TERM-011 · зазор фасад — корпус по глубине',
} as const satisfies Fields<FacadeGapProfile>;

export const FACADE_OVERLAY_FIELDS = {
  facadeId: 'TERM-174 · звено цепи',
  facadeOverlayLeftMm: 'TERM-194 · наложение слева',
  facadeOverlayRightMm: 'TERM-195 · наложение справа',
  facadeOverlayTopMm: 'TERM-196 · наложение сверху',
  facadeOverlayBottomMm: 'TERM-197 · наложение снизу',
} as const satisfies Fields<FacadeOverlay>;

export const FRONT_GRID_FIELDS = {
  mode: 'TERM-022 · AUTO или MANUAL',
  facadeWidthPolicy: 'TERM-174 · политика ширины',
  gapProfile: 'TERM-002, TERM-229 · профиль зазоров',
  columns: 'TERM-022 · колонки',
  facades: 'TERM-174 · фасадная цепь',
  overlays: 'TERM-014 · наложения',
} as const satisfies Fields<FrontGrid>;

export const ASSEMBLY_FIELDS = {
  id: 'TERM-226 · сборка',
  kind: 'TERM-230, TERM-053, TERM-054 · уровень сборки',
  parentId: 'TERM-231 · родитель',
  inputRef: 'TERM-232 · элемент входа',
  box: 'TERM-220 · габарит',
  index: 'TERM-227 · номер',
  frame: 'TERM-053 · корпус',
  span: 'TERM-054, TERM-024 · секция и проём',
  frontGrid: 'TERM-022 · фронтальная сетка',
  request: 'TERM-233 · запрос пользователя',
} as const satisfies Fields<Assembly>;

export const EDGE_BAND_FIELDS = {
  slot: 'TERM-041 · буква торца',
  physicalEdge: 'TERM-041 · физический торец',
  edgeLengthMm: 'TERM-041 · длина торца',
  intent: 'TERM-202 · намерение кромления',
  edgeBandThicknessMm: 'TERM-188 · толщина кромки',
  effectiveEdgeBandThicknessMm: 'TERM-188, TERM-180 · эффективное наращивание',
  profileCode: 'TERM-203 · рассчитанное кромление',
  automaticIntent: 'TERM-043 · намерение по правилу',
  override: 'TERM-042 · ручная замена',
  exposure: 'TERM-234 · открытость торца',
  ruleId: 'TERM-043 · правило кромления',
} as const satisfies Fields<EdgeBand>;

export const PART_ORIENTATION_FIELDS = {
  family: 'TERM-235 · семейство ориентации',
  handedness: 'TERM-055 · левая, правая',
  faceNames: 'TERM-040 · имена пластей',
  faceNormals: 'TERM-040 · нормали пластей',
  grainDirection: 'TERM-039 · направление текстуры',
} as const satisfies Fields<PartOrientation>;

export const PART_MATERIAL_FIELDS = {
  family: 'TERM-032, TERM-033, TERM-034 · ЛДСП, МДФ, ХДФ',
  decorId: 'TERM-035 · декор',
  variantId: 'TERM-035, TERM-036 · вариант плиты',
  label: 'TERM-035 · подпись',
  panelThicknessMm: 'TERM-036 · толщина плиты',
  sheetFormatMm: 'TERM-201 · формат листа',
  purpose: 'TERM-236 · назначение',
  edgeDecorId: 'TERM-035, TERM-203 · декор кромки видимых торцов',
} as const satisfies Fields<PartMaterial>;

export const PLANAR_SIZE_FIELDS = {
  lengthMm: 'TERM-190 · длина',
  widthMm: 'TERM-189 · ширина',
} as const satisfies Fields<PlanarSize>;

export const ALLOWANCE_FIELDS = {
  minusMm: 'TERM-049 · припуск с начала оси',
  plusMm: 'TERM-049 · припуск с конца оси',
  source: 'TERM-237 · источник припуска',
} as const satisfies Fields<Allowance>;

export const DIMENSION_CHAIN_FIELDS = {
  finishedPart: 'TERM-045, TERM-214 · F — основа без кромки',
  machiningAllowance: 'TERM-049, TERM-200 · припуск m',
  machiningBlank: 'TERM-213 · M — заготовка под обработку',
  sawingAllowance: 'TERM-049, TERM-048 · припуск s',
  sawnBlank: 'TERM-046, TERM-215 · S — пильная заготовка',
  status: 'TERM-170, TERM-167 · статус цепи',
  missing: 'TERM-167 · чего не хватает',
} as const satisfies Fields<DimensionChain>;

export const PART_FIELDS = {
  id: 'TERM-153 · идентификатор детали',
  name: 'TERM-157 · наименование',
  assemblyId: 'TERM-053, TERM-054 · сборка',
  inputRef: 'TERM-232 · элемент входа',
  role: 'TERM-055, TERM-056, TERM-057, TERM-058, TERM-059, TERM-063, TERM-064, TERM-065, TERM-066, TERM-072, TERM-077, TERM-078, TERM-019, TERM-090, TERM-091, TERM-089, TERM-092, TERM-128, TERM-138, TERM-139, TERM-266 · роль детали',
  structuralRole: 'TERM-067 · несущая роль',
  handedness: 'TERM-055 · левая, правая',
  material: 'TERM-035, TERM-036 · плита',
  finishedWithEdge: 'TERM-044, TERM-189, TERM-190, TERM-036 · E — готовая деталь с кромкой',
  dimensionChain: 'TERM-213, TERM-045, TERM-046, TERM-215 · цепь E → F → M → S',
  placement: 'TERM-218 · положение и оси',
  orientation: 'TERM-040, TERM-039 · пласти и текстура',
  edges: 'TERM-042, TERM-041 · кромки A–D',
  contourMm: 'TERM-238 · контур',
  contourEdges: 'TERM-238, TERM-042 · кромки контура',
  supply: 'TERM-239 · изготовляемая или покупная',
  operationIds: 'TERM-112 · операции детали',
  installationElevationMm: 'TERM-084 · высота установки',
  qualification: 'TERM-170, TERM-163 · квалификация',
  floorSupport: 'TERM-267, TERM-074 · опора через подпятник',
  bevels: 'TERM-271, TERM-041 · скошенные торцы',
} as const satisfies Fields<Part>;

export const OPERATION_BASIS_FIELDS = {
  datum: 'TERM-113, TERM-213 · база присадки',
  stage: 'TERM-240 · после кромления',
  transform: 'TERM-213 · преобразование размерной базы',
} as const satisfies Fields<OperationBasis>;

export const HOLE_FIELDS = {
  op: 'TERM-241 · вид операции',
  id: 'TERM-226, TERM-112 · операция',
  partId: 'TERM-153 · деталь',
  mode: 'TERM-040, TERM-041 · пласть или торец',
  face: 'TERM-040 · пласть',
  edge: 'TERM-041 · торец',
  xMm: 'TERM-113 · координата вдоль длины',
  yMm: 'TERM-113 · координата вдоль ширины',
  diameterMm: 'TERM-242 · диаметр',
  depthMm: 'TERM-114 · глубина',
  through: 'TERM-115 · насквозь',
  layer: 'TERM-243 · слой',
  machiningRole: 'TERM-114, TERM-115, TERM-099 · роль обработки',
  purpose: 'TERM-112 · назначение',
  code: 'TERM-112 · код присадки',
  owner: 'TERM-244 · владелец',
  fastenerProfileId: 'TERM-104, TERM-105, TERM-110 · профиль крепежа',
  axisOffsetMm: 'TERM-245 · смещение оси',
  entryMm: 'TERM-113 · точка входа',
  inwardNormal: 'TERM-113 · нормаль внутрь',
  stationMm: 'TERM-246 · станция',
  source: 'TERM-110 · источник присадки (277)',
  sourceRef: 'TERM-110, TERM-111 · ссылка на комплект или каталог',
  completeness: 'TERM-167 · полнота присадки (277)',
  status: 'TERM-168 · статус',
  basis: 'TERM-113 · размерная база',
} as const satisfies Fields<Hole>;

export const GROOVE_FIELDS = {
  op: 'TERM-241 · вид операции',
  id: 'TERM-226, TERM-061 · операция',
  partId: 'TERM-153 · деталь',
  face: 'TERM-040 · пласть',
  edge: 'TERM-041 · торец',
  along: 'TERM-061 · направление',
  startMm: 'TERM-061 · начало',
  endMm: 'TERM-061 · конец',
  offsetMm: 'TERM-061 · отступ',
  grooveWidthMm: 'TERM-061 · ширина',
  grooveDepthMm: 'TERM-061 · глубина',
  semanticType: 'TERM-061, TERM-062 · паз или четверть',
  purpose: 'TERM-061 · назначение',
  owner: 'TERM-244 · владелец',
  resolution: 'TERM-061 · разрешение обработки',
  basis: 'TERM-113 · размерная база',
} as const satisfies Fields<Groove>;

export const NOTCH_FIELDS = {
  op: 'TERM-241 · вид операции',
  id: 'TERM-226 · операция',
  partId: 'TERM-153 · деталь',
  uRangeMm: 'TERM-247 · диапазон u',
  vRangeMm: 'TERM-247 · диапазон v',
  nRangeMm: 'TERM-247 · диапазон n',
  purpose: 'TERM-112 · назначение',
  owner: 'TERM-244 · владелец',
  basis: 'TERM-113 · размерная база',
} as const satisfies Fields<Notch>;

export const JOINT_FIELDS = {
  id: 'TERM-248, TERM-226 · соединение',
  kind: 'TERM-104, TERM-105, TERM-109 · вид крепежа',
  parts: 'TERM-105, TERM-106 · проходная и принимающая',
  contact: 'TERM-249 · плоскость контакта',
  faces: 'TERM-040, TERM-179 · пласти',
  profileId: 'TERM-110, TERM-105 · профиль крепежа',
  stationsMm: 'TERM-246 · станции',
  assembly: 'TERM-119, TERM-167 · собираемость',
  reason: 'TERM-250 · причина выбора',
  visibility: 'TERM-179 · видимость головок',
  opposed: 'TERM-116 · встречная присадка',
  dowelCount: 'TERM-109 · шканты',
  physicalVerified: 'TERM-170 · физически проверено',
  productionExecutable: 'TERM-163 · исполнимо на производстве',
  drillingExemption: 'TERM-251 · без присадки по решению',
  connectionRole: 'TERM-268 · место соединения',
  placementProfile: 'TERM-269 · схема расстановки',
} as const satisfies Fields<Joint>;

export const DRILLING_EXEMPTION_FIELDS = {
  decision: 'TERM-251 · номер решения',
  reason: 'TERM-251 · причина',
} as const satisfies Fields<DrillingExemption>;

export const MECHANISM_FIELDS = {
  id: 'TERM-252, TERM-226 · механизм',
  kind: 'TERM-098, TERM-095, TERM-081, TERM-102, TERM-079, TERM-125, TERM-074, TERM-143, TERM-146, TERM-089, TERM-122, TERM-103, TERM-273, TERM-274, TERM-275, TERM-276, TERM-277, TERM-278 · вид механизма',
  partIds: 'TERM-153 · детали',
  assemblyId: 'TERM-054 · сборка',
  profile: 'TERM-110, TERM-111 · позиция каталога',
  params: 'TERM-014, TERM-101 · параметры',
  stationsMm: 'TERM-246 · станции',
  motionEnvelopes: 'TERM-118, TERM-210 · огибающая движения',
  capability: 'TERM-169, TERM-253 · разрешение возможности',
  quantity: 'TERM-155 · количество',
  drillingExemption: 'TERM-251 · без присадки по решению',
  visuals: 'TERM-272 · модель в 3D',
  model: 'TERM-272 · модель из каталога',
} as const satisfies Fields<Mechanism>;

export const LOAD_FIELDS = {
  id: 'TERM-254, TERM-226 · нагрузка',
  partId: 'TERM-153 · несущая деталь',
  mechanismId: 'TERM-252 · несущий механизм',
  spanMm: 'TERM-024 · пролёт',
  physicalLengthMm: 'TERM-190 · физическая длина',
  depthMm: 'TERM-191 · глубина',
  panelThicknessMm: 'TERM-036 · толщина',
  selfMassKg: 'TERM-192, TERM-038 · собственная масса',
  payloadKg: 'TERM-192 · полезная нагрузка (289)',
  totalMassKg: 'TERM-192 · полная масса',
  youngModulusNPerMm2: 'TERM-052 · модуль упругости',
  secondMomentOfAreaMm4: 'TERM-255 · момент инерции',
  deflectionMm: 'TERM-080 · прогиб',
  bendingStressNPerMm2: 'TERM-256 · напряжение',
  deflectionLimitMm: 'TERM-080 · порог прогиба',
  capacityKg: 'TERM-192 · ёмкость механизма',
  screenPass: 'TERM-168 · результат оценки',
  physicalQualified: 'TERM-170 · не квалифицировано движком',
  selfMassBasis: 'TERM-270, TERM-192 · база собственной массы',
} as const satisfies Fields<Load>;

export const UNRESOLVED_FIELDS = {
  code: 'TERM-167 · код',
  level: 'TERM-168 · ошибка, предупреждение, сообщение',
  partIds: 'TERM-153 · детали',
  jointIds: 'TERM-257 · соединения',
  operationIds: 'TERM-112 · операции',
  mechanismIds: 'TERM-258 · механизмы',
  text: 'TERM-259 · текст',
  ruleId: 'TERM-043 · правило',
  blocksProductionReadiness: 'TERM-163 · метаданные правила',
} as const satisfies Fields<Unresolved>;

export const CAPABILITY_RESOLUTION_FIELDS = {
  capability: 'TERM-253 · возможность',
  status: 'TERM-169 · RESOLVED, PLACEHOLDER, HOLD',
  reasons: 'TERM-260 · причины',
} as const satisfies Fields<CapabilityResolution>;

export const INSTALLATION_REQUIREMENT_FIELDS = {
  id: 'TERM-261, TERM-226 · требование',
  type: 'TERM-122, TERM-120 · вид',
  required: 'TERM-120 · обязательно',
  targetPartIds: 'TERM-153 · несущие детали',
  selection: 'TERM-122 · кто выбирает',
  text: 'TERM-262 · текст',
} as const satisfies Fields<InstallationRequirement>;

export const RESULT_FIELDS = {
  furnitureValidity: 'TERM-168 · годность',
  capabilityResolution: 'TERM-253, TERM-169 · возможности',
  productionReadiness: 'TERM-163, TERM-164 · готовность',
  installationRequirements: 'TERM-261, TERM-120 · требования монтажа',
  exportQualification: 'TERM-263, TERM-170 · квалификация выгрузок',
} as const satisfies Fields<Result>;

export const GRAPH_FIELDS = {
  product: 'TERM-264 · вид изделия',
  versions: 'TERM-265 · версии',
  revision: 'TERM-160 · ревизия',
  coordinateSystem: 'TERM-218, TERM-208 · оси',
  envelope: 'TERM-026, TERM-189, TERM-190 · габарит',
  site: 'TERM-076 · помещение',
  assemblies: 'TERM-053, TERM-054 · сборки',
  parts: 'TERM-157 · детали',
  operations: 'TERM-112 · операции',
  joints: 'TERM-248 · соединения',
  mechanisms: 'TERM-252 · механизмы',
  loads: 'TERM-254 · нагрузки',
  unresolved: 'TERM-167 · нерешённое',
  result: 'TERM-168 · результат FE-01',
} as const satisfies Fields<Graph>;

export const FLOOR_SUPPORT_FIELDS = {
  bearingPartId: 'TERM-153, TERM-267 · несущая деталь',
  viaBottomPanel: 'TERM-058, TERM-267 · под дном',
} as const satisfies Fields<FloorSupport>;

export const PART_BEVEL_FIELDS = {
  edge: 'TERM-041, TERM-271 · торец со скосом',
  shortFace: 'TERM-040, TERM-271 · короткая пласть',
  setbackMm: 'TERM-271 · вынос скоса',
  angleDeg: 'TERM-271 · угол скоса к пластям',
  decision: 'TERM-271 · номер решения',
} as const satisfies Fields<PartBevel>;

export const CONTOUR_EDGE_FIELDS = {
  segment: 'TERM-238, TERM-227 · сегмент контура',
  slot: 'TERM-041 · сторона габарита',
  lengthMm: 'TERM-041, TERM-238 · длина сегмента',
  intent: 'TERM-202 · намерение кромления',
  edgeBandThicknessMm: 'TERM-188 · толщина кромки',
  profileCode: 'TERM-203 · рассчитанное кромление',
  exposure: 'TERM-234 · открытость торца',
  ruleId: 'TERM-043 · правило кромления',
} as const satisfies Fields<ContourEdge>;

export const HARDWARE_VISUAL_FIELDS = {
  id: 'TERM-272, TERM-226 · модель',
  hostPartId: 'TERM-272, TERM-153 · деталь-носитель',
  originMm: 'TERM-272 · начало',
  uAxis: 'TERM-272 · ось u',
  vAxis: 'TERM-272 · ось v',
  nAxis: 'TERM-272 · ось n',
  sizeMm: 'TERM-272 · размер',
  contourMm: 'TERM-272 · контур',
  finish: 'TERM-272 · отделка',
} as const satisfies Fields<HardwareVisual>;

export const HARDWARE_MODEL_FIELDS = {
  id: 'TERM-272, TERM-226 · модель',
  hostPartId: 'TERM-272, TERM-153 · деталь-носитель',
  originMm: 'TERM-272 · начало',
  uAxis: 'TERM-272 · ось u',
  vAxis: 'TERM-272 · ось v',
  nAxis: 'TERM-272 · ось n',
  sizeMm: 'TERM-272 · размер места',
  file: 'TERM-272 · файл каталога',
  sha256: 'TERM-272 · sha256 файла',
  fileOriginMm: 'TERM-272 · начало в файле',
  fileAxes: 'TERM-272 · оси файла',
  stretchAtMm: 'TERM-272 · плоскость растяжения',
  drawnWidthMm: 'TERM-272 · ширина в файле',
  finish: 'TERM-272 · отделка',
} as const satisfies Fields<HardwareModel>;

/** Every type of the contract with its field registry. */
export const CONTRACT = {
  Rational: RATIONAL_FIELDS,
  Box3: BOX3_FIELDS,
  Versions: VERSIONS_FIELDS,
  Revision: REVISION_FIELDS,
  Site: SITE_FIELDS,
  CarcassElevations: CARCASS_ELEVATIONS_FIELDS,
  BaseSpec: BASE_SPEC_FIELDS,
  BackSpec: BACK_SPEC_FIELDS,
  CarcassFrame: CARCASS_FRAME_FIELDS,
  SectionSpan: SECTION_SPAN_FIELDS,
  FrontGridColumn: FRONT_GRID_COLUMN_FIELDS,
  FrontGridFacade: FRONT_GRID_FACADE_FIELDS,
  FacadeGapProfile: FACADE_GAP_PROFILE_FIELDS,
  FacadeOverlay: FACADE_OVERLAY_FIELDS,
  FrontGrid: FRONT_GRID_FIELDS,
  Assembly: ASSEMBLY_FIELDS,
  EdgeBand: EDGE_BAND_FIELDS,
  PartOrientation: PART_ORIENTATION_FIELDS,
  PartMaterial: PART_MATERIAL_FIELDS,
  PlanarSize: PLANAR_SIZE_FIELDS,
  Allowance: ALLOWANCE_FIELDS,
  DimensionChain: DIMENSION_CHAIN_FIELDS,
  Part: PART_FIELDS,
  OperationBasis: OPERATION_BASIS_FIELDS,
  Hole: HOLE_FIELDS,
  Groove: GROOVE_FIELDS,
  Notch: NOTCH_FIELDS,
  Joint: JOINT_FIELDS,
  DrillingExemption: DRILLING_EXEMPTION_FIELDS,
  Mechanism: MECHANISM_FIELDS,
  Load: LOAD_FIELDS,
  Unresolved: UNRESOLVED_FIELDS,
  CapabilityResolution: CAPABILITY_RESOLUTION_FIELDS,
  InstallationRequirement: INSTALLATION_REQUIREMENT_FIELDS,
  Result: RESULT_FIELDS,
  Graph: GRAPH_FIELDS,
  FloorSupport: FLOOR_SUPPORT_FIELDS,
  PartBevel: PART_BEVEL_FIELDS,
  ContourEdge: CONTOUR_EDGE_FIELDS,
  HardwareVisual: HARDWARE_VISUAL_FIELDS,
  HardwareModel: HARDWARE_MODEL_FIELDS,
} as const;

/** All `Type.field` names of the contract: the only targets the wardrobe field map may point to. */
export function contractFieldNames(): string[] {
  return Object.entries(CONTRACT).flatMap(([type, fields]) => Object.keys(fields).map((f) => type + '.' + f));
}

/** TERM-IDs and Russian description of every contract field. */
export function contractTerms(): { field: string; termIds: string[]; ru: string }[] {
  return Object.entries(CONTRACT).flatMap(([type, fields]) =>
    Object.entries(fields as Record<string, string>).map(([f, v]) => {
      const [head, ru] = v.split(' · ');
      return { field: type + '.' + f, termIds: head!.split(', '), ru: ru ?? '' };
    }),
  );
}

export const ENGINE_CONTRACT_VERSION = 'engine-contract-13';
