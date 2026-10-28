// Data model of the "Другая мебель для дома" domain (generator home-physical, rule sets r3 and r4: engine/policy/home.ts).
// All dimensions are millimetres. Body coordinates: x to the right, y up from the floor, d = depth.
import type { CuttingParams } from '../engine/cutting.js';

export type Boundary = 'left' | 'right' | string; // a partition id or a carcass side
export type Axis = 'w' | 'h' | 'd';

export interface Partition {
  id: string;
  /** Centre line of the partition, measured from the left outer face of the body. */
  x: number;
}

export interface Shelf {
  id: string;
  lo: Boundary;
  hi: Boundary;
  /** Bottom face of the shelf above the floor (body-local). */
  y: number;
  fixed: boolean;
}

export interface Door {
  id: string;
  lo: Boundary;
  hi: Boundary;
  y: number;
  h: number;
  hinge: 'left' | 'right';
}

export interface Drawer {
  id: string;
  lo: Boundary;
  hi: Boundary;
  y: number;
  h: number;
}

export type Front = Door | Drawer;

export interface BayId {
  id: string;
  lo: Boundary;
  hi: Boundary;
}

export interface Body {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  d: number;
  kind: 'cabinet' | 'desk';
  back: boolean;
  /** The material of the back when there is one: the structural board of the carcass (absent) or HDF in a rebate (r5, MOD-DEC-515). */
  backMaterial?: 'hdf';
  /** The base of the body (r5, MOD-DEC-516): absent — the floor pads; a plinth of the wardrobe or legs of the catalogue, of this height. */
  base?: { kind: 'plinth' | 'legs'; heightMm: number };
  partitions: Partition[];
  shelves: Shelf[];
  doors: Door[];
  drawers: Drawer[];
  cable: boolean;
  bayIds?: BayId[];
}

export type RateKey =
  | 'board'
  | 'edge'
  | 'cut'
  | 'join'
  | 'support'
  | 'glide'
  | 'restraint'
  | 'assembly'
  | 'board16'
  | 'join16'
  | 'hinge'
  | 'runner'
  | 'frontFix'
  | 'handle';

/**
 * The rates of r4 (MOD-DEC-510): the board by whole sheets of the cutting plan of the graph, the saw run of the plan and
 * the drilling of the graph replace «Плита с отходами» (board, board16) and «Раскрой и присадка» (cut) of r3.
 */
export type RateKeyR4 = Exclude<RateKey, 'board' | 'board16' | 'cut'> | 'sheet16' | 'sheet18' | 'saw' | 'hole' | 'cup';

/** The rates of a project: the keys of its rule set (r3 — rateNames, r4 — rateNamesR4), a number or not given. */
export type Rates = Partial<Record<RateKey | RateKeyR4, number | null>>;

export interface HomeProject {
  id: string;
  name: string;
  templateId: TemplateId;
  material: MaterialId;
  thickness: 16 | 18;
  edgeThickness: 0.4 | 1 | 2;
  hardwareVariant: string;
  supportVariant: 'boyard-p101zn56';
  floor: 'hard' | 'carpet';
  bodies: Body[];
  rates: Rates;
  rateNote: string;
  rateDate: string;
  room: { width: number; height: number; depth: number };
  antiTipConfirmed: boolean;
  wallAnchors: string;
  wall: {
    substrate: 'unknown' | 'concrete' | 'solid-brick';
    plateStackMm: number | null;
    edgeDistanceMm: number | null;
    baseSound: boolean;
  };
  density: number;
  plannedShelfLoadKg: number;
  boardNote: string;
  boardConfirmed: boolean;
  floorSurface: string;
  materialProfile: 'kronospan-p2-18' | 'kronospan-p2-16' | 'legacy-custom';
  kitLevel: 'economy' | 'standard' | 'premium';
  plannedDeskLoadKg: number;
  plannedDrawerLoadKg: number;
  /** Rule set the project is built with: r3 — the prototype, r4 — the common policy (task H1), r5 — the rules of the wardrobe (513). */
  generatorVersion: 'home-physical-r3' | 'home-physical-r4' | 'home-physical-r5';
  archetypeId: string | null;
  archetypeVersion: string;
  topThickness: 16 | 18;
  /**
   * The handle of the fronts (r5, MOD-DEC-513): a handle of the fittings catalogue or 'NONE' — without handles; absent —
   * the knob RC282BL.4 a project of r5 was saved with before the choice (FINDINGS 965).
   */
  handleId?: string;
  /**
   * The bottom of the drawer boxes (r5, MOD-DEC-574): HDF in a groove of the walls, as the wardrobe's; absent — the board
   * of the box between its walls on confirmats, as a project of r5 was saved before 574 (FINDINGS 1304).
   */
  drawerBottom?: 'hdf';
  /**
   * The runner of the drawers (r5, MOD-DEC-574, the clarification): by the level of the hardware (`kitLevel`), each with
   * its box; absent — BOYARD DB4501 under the box of the prototype, as a project of r5 was saved before (FINDINGS 1750).
   */
  drawerRunner?: 'level';
  /**
   * The cable outlet of the bodies with `cable` (r5, MOD-DEC-574): the hole of the prototype r1 in the back; absent —
   * none, as a project of r5 was saved before 574 (FINDINGS 1307).
   */
  cableOutlet?: 'back';
  /**
   * The material of the fronts (r5, MOD-DEC-573): «материал → исполнение → цвет» of the catalogue of the materials of
   * the facades of the release; absent — the fronts of the board of the project, in its decor (facades.ts).
   */
  facadeChoice?: HomeFacadeChoice;
  /**
   * The rates of the maker that belong to a decor (r4 and r5, R5-006, FINDINGS 1970): the sheets, the joint and the hinge
   * a change of the decor clears (MOD-DEC-510), kept by the decor they were entered for and given back when it is
   * chosen again. Absent — none kept; only the rates entered (no null) are kept.
   */
  materialRates?: Partial<Record<MaterialId, DecorRates>>;
  /**
   * The parameters of the cutting map (r4 and r5, R5-009, FINDINGS 1969): the kerf and the trim of the workshop, per board
   * a whole format and the grain — the CuttingParams of the wardrobe's `state.cutting` (R2-019). Absent — the defaults of
   * MOD-DEC-445, the format of the catalogue or of the estimate; a value not entered is not kept.
   */
  cutting?: Partial<CuttingParams>;
}

/** The rates a change of the decor clears (MOD-DEC-510): the price of its sheets, of the joint and of the hinge. */
export const DECOR_RATE_KEYS = ['sheet16', 'sheet18', 'join', 'hinge'] as const;
export type DecorRates = Partial<Record<(typeof DECOR_RATE_KEYS)[number], number>>;

/**
 * The reference of the project to the catalogue of the materials of the facades (catalogs/materials/facades.json), with
 * the supply, the thickness of the execution and the names it was built with, as the wardrobe and the kitchen keep it:
 * the geometry reads them from the project, the price and the check from the release.
 */
export interface HomeFacadeChoice {
  materialId: string;
  executionId: string;
  materialTitle: string;
  executionTitle: string;
  supply: 'MANUFACTURE' | 'PURCHASED';
  /** The thickness of a front, mm; 'BOARD' — of the board of the project. */
  thicknessMm: number | 'BOARD';
  /** The decor of a board other than that of the project (ЛМДФ); null — the decor of the project. */
  decorId: string | null;
  /** The colour code (RAL, NCS) or the species of veneer; null — none. */
  colorText: string | null;
}

export type TemplateId = 'chest' | 'bedside' | 'tv' | 'bookcase' | 'shoe' | 'desk' | 'sideboard' | 'own';
export type MaterialId = 'oak' | 'white' | 'graphite';

/** Vector in technology axes: [x right, y back, z up]. */
export type Vec3 = [number, number, number];
export type AxisIndex = 0 | 1 | 2;

export type SemanticRole =
  | 'continuous_top'
  | 'bearing_side'
  | 'bearing_shared_side'
  | 'bearing_divider'
  | 'bottom'
  | 'structural_back'
  | 'hdf_back'
  | 'rear_apron'
  | 'fixed_shelf'
  | 'adjustable_shelf'
  | 'door'
  | 'drawer_front'
  | 'drawer_side'
  | 'drawer_inner_front'
  | 'drawer_back'
  | 'drawer_bottom'
  | 'floor_pad'
  | 'plinth_rail';

export interface GraphPart {
  id: string;
  bodyId: string;
  elementId: string | null;
  semanticRole: SemanticRole;
  origin_mm: Vec3;
  extent_mm: Vec3;
  local_uv_world_axes: AxisIndex[];
  finished_uv_mm: number[];
  cut_uv_mm: number[];
  thickness_mm: number;
  edge_mm: Record<string, number>;
  material: string;
}

export interface Joint {
  id: string;
  camPartId: string;
  studPartId: string;
  recipe: string;
  group: 'drawer' | 'carcass';
  orientation: string;
  connectorStations: number;
  woodDowels: number;
  contactAxis: number;
  contactAreaMm2: number;
  placementProfile?: string;
}

export interface BeamLoad {
  bodyId: string;
  elementId: string;
  spanMm: number;
  physicalLengthMm: number;
  depthMm: number;
  thicknessMm: number;
  selfMassKg: number;
  selfMassBasis: 'SCREEN_SPAN_MASS' | 'FINITE_PANEL_MASS';
  payloadKg: number;
  totalMassKg: number;
  deflectionMm: number;
  deflectionLimitMm: number;
  screenPass: boolean;
  physicalQualified: false;
}

export interface Unresolved {
  code: string;
  partId?: string;
  jointId?: string;
  holeId?: string;
  holeIds?: string[];
  [extra: string]: unknown;
}

export interface PhysicalGraph {
  generatorVersion: 'home-physical-r3' | 'home-physical-r4' | 'home-physical-r5';
  coordinateSystem: string;
  adapter: Record<string, string>;
  parts: GraphPart[];
  joints: Joint[];
  sections: Record<string, unknown>[];
  supports: { bearingPartId: string; floorPartId: string; viaBottom: boolean }[];
  loads: BeamLoad[];
  mechanisms: Record<string, unknown>[];
  collisions: { partIds: [string, string]; overlapMm: number[] }[];
  unresolved: Unresolved[];
  invariants: {
    noSolidOverlap: boolean;
    oneTopPerBody: boolean;
    allJointsHaveContact: boolean;
    uniqueIds: boolean;
  };
  qualification: Record<string, unknown>;
}

export interface Hole {
  id: string;
  kind: string;
  face: string;
  u: number;
  v: number;
  finishedUVmm: [number, number];
  datum: 'FINISHED';
  diameterMm: number;
  depthMm: number;
  jointId: string;
  worldCentreMm: number[];
  axisTechnology: number[];
  axisHome: number[];
  [extra: string]: unknown;
}

/** Board in "Home" axes (x right, y up, z back) as used by the editor, documents and CSV. */
export interface Board extends GraphPart {
  name: string;
  role: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  length: number;
  width: number;
  cutLength: number;
  cutWidth: number;
  thickness: number;
  edgeM: number;
  edgeThickness: number;
  localWorldAxes: number[];
  holes: Hole[];
}

export interface VisualItem {
  id: string;
  bodyId: string;
  role: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  [extra: string]: unknown;
}

export interface FrontRect {
  x: number;
  y: number;
  w: number;
  h: number;
  d: number;
  z: number;
}

/** The runner of a drawer and the box it defines: of every product (engine/drawer-runner.ts, MOD-DEC-514). */
export type { RunnerInfo } from '../engine/drawer-runner.js';

export interface HardwareLine {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  condition: string;
  priceStatus: 'UNKNOWN';
}

export interface PriceRow {
  key: string;
  label: string;
  quantity: number;
  rate: number | null;
  amount: number | null;
  /**
   * r4: where the rate comes from (MOD-DEC-510, 536) — MAKER the rate of the form, CATALOG a price of the catalogue,
   * DECISION an averaged price of the project of a card or 14 % of C (402, 569), TEMPORARY a temporary price of the
   * catalogue or of the policy, said with its basis; r3 has only the rates of the form.
   */
  origin?: 'MAKER' | 'CATALOG' | 'DECISION' | 'TEMPORARY';
  basis?: string;
  /** r4: the rate the maker sets for the row; null — the row has no rate of the form (a blank larger than the sheet). */
  rateKey?: RateKeyR4 | null;
  /** r4: whole sheets — the leftovers of a past order can make the maker's price lower (MOD-DEC-511, FINDINGS 814). */
  note?: string;
  /** r4, r5: a row of the hardware by a price of the service, its amount rounded up to this many ₽ (MOD-DEC-538, 346). */
  roundUpToRub?: number;
}

export interface PriceResult {
  status: 'PARTIAL' | 'TEST_RATE' | 'COMPLETE';
  rows: PriceRow[];
  missing: string[];
  total: number | null;
  /** r4: the temporary prices in the total, by their basis (MOD-DEC-536): shown in the bell. */
  temporary?: string[];
  hingeQuoteIncludesMountScrews: boolean;
  hardwarePriceStatus: string;
  hingeScrewSupplyStatus: string;
  physicalQualified: false;
}

export interface Issue {
  code: string;
  text: string;
  partId?: string;
  holeIds?: string[];
}
