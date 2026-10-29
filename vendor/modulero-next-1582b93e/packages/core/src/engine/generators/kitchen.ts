// The kitchen on the graph of the unified engine (tasks K3, K4, MIGRATION_PLAN steps 4.3, 4.4; MOD-DEC-294, 341). The
// modules are those of the core of the kitchen (kitchen/derived.ts: the parts of the prototype's calculation with the
// fixes of FINDINGS 320–327 and 500–506); this file translates them into the contract (engine/contract.ts) and keeps
// nothing of its own shape: one Part per part, one Hole per hole of the r7 fasteners and of the shared mechanisms
// (hinges, shelf supports), one Joint per joint of the fasteners r7, per groove of a drawer box and per seam of the
// worktops, one Mechanism per hinge group, lift, shelf, drawer, pull-out, hanger set, set of legs and appliance — the
// legs and the appliances with their envelopes (K4). Every number comes from the model or the policy (ENGINE.md §4,
// MOD-DEC-054): the guard of scripts/check.mjs allows only 0, 1 and 2 here.
//
// Frames. The prototype keeps a part in the box of its module (x across, y up, z from the front of the carcass) and a
// hole in the frame of the fasteners of the room (k7Point: x along wall A, depth from wall A, height). The graph's axes
// are x right, y to the back, z up (X_RIGHT_Y_BACK_Z_UP_MM) with the origin at the room's corner of walls A and B on
// the floor: y = depth of the room − depth from wall A. The edges of a part keep the names of the prototype
// (kflowPart: left and right bound the length, bottom and top the width): C, D and A, B of the contract; its axes run
// from the corner of its box along the positive axes of the module, so the edge «bottom» is the front edge of a panel
// lying in depth and the lower edge of a front. A diagonal front lies along its plan (worldFootprintMm).
//
// What the graph cannot carry as a number stays an unresolved question of the owner, never an invented value: the
// fixing of the TANDEM runners (no depth in the prototype), the joints of the constructions (a count without places),
// the holes of the BLUM hinges and lifts of the prototype (no kit and no catalogue page, 277), the hangers and the
// hinge cup of a washer (numbers of the prototype, «присадка неполная»). The worktops are parts of the core with their
// joints (kitchen/worktops.ts), the walls of the room and their names are the room's data (KF-15).
import {
  ENGINE_CONTRACT_VERSION,
  type Allowance,
  type Assembly,
  type Box3,
  type CapabilityResolution,
  type ContourEdge,
  type EdgeBand,
  type EdgeSlot,
  type FrontGrid,
  type Graph,
  type Groove,
  type Hole,
  type InstallationRequirement,
  type Joint,
  type JointKind,
  type Mechanism,
  type MechanismKind,
  type Operation,
  type Part,
  type PartBevel,
  type PartRole,
  type PhysicalEdge,
  type StructuralRole,
  type Unresolved,
  type Vec3,
} from '../contract.js';
import { segmentSlot } from '../contour-edges.js';
import { aggregateResult, deriveDimensionChain, fromValidatedInput } from '../graph.js';
import type { BoardRef, HingeChart } from '../invariants/checks.js';
import { POLICY_MODULES, RULE_SET_VERSION, tolerance } from '../policy/index.js';
import { backSeamScrews } from '../policy/back-split.js';
import type { Rec } from '../policy/project-state.js';
import { contentDigest } from '../../project/digest.js';
import { kitchenRateSettings, kitchenRevision } from '../../kitchen/cost.js';
import { footPlateBoxes, LIFT_PEG, moduleRecords, partsOf, PROFILE } from '../../kitchen/derived.js';
import { kitchenCardId } from '../../kitchen/price.js';
import { kitchenServiceTitle } from '../../kitchen/hardware-list.js';
import { facadeChoiceThickness, facadeFamily, kitchenFacadeProblems, kitchenFacadeTitle } from '../../kitchen/facade-choice.js';
import { validateKitchenModule } from '../../kitchen/modules.js';
import { hoodOverHobRemarks } from '../../kitchen/hood.js';
import { upperGapRemarks } from '../../kitchen/upper-gap.js';
import { frontGap, frontGapY, frontSeam } from '../../kitchen/carcass.js';
import { bodyDepth, canonicalWall, fastenerPoint, isFree, roomWalls, worldBox, type KitchenScene } from '../../kitchen/room.js';
import { boxHitsPart, boxToAabb, ratFromDecimal } from '../invariants/geometry.js';
import { shelfBoreFromEnd } from './wardrobe.js';
import { fmt } from '../../wardrobe/facades.js';
import { worktopOf } from '../../catalog/hardware/worktops.js';
import { intentOfThicknessMm, manualBandIssues } from '../edge-overrides.js';
import { edgeHandleVisuals, handleVisual, type HandleFrame } from '../../wardrobe/fittings.js';
import { HANDLE_GROOVE, kitchenHandlePlaces, kitchenHandleSweeps } from '../../kitchen/fittings.js';

export const KITCHEN_GENERATOR = 'kitchen-graph-1';
/** Id of the product assembly. */
export const KITCHEN_PRODUCT_ID = 'KITCHEN';
/** Rule set of the kitchen modules: the core of K3, K4 and K5 (FINDINGS 320–329, 500–509, 570–579). */
export const KITCHEN_RULE_SET = 'kitchen-k5';

const TOL = tolerance.constants.compare.value;
/** The local box of the kitchen core by name: across, up, from the front of the carcass. */
const BOX_KEYS = ['x0', 'x1', 'y0', 'y1', 'z0', 'z1'] as const;
type LocalBox = Record<(typeof BOX_KEYS)[number], number>;
const localBox = (b: unknown): LocalBox | null => (Array.isArray(b) && b.length === BOX_KEYS.length ? (Object.fromEntries(BOX_KEYS.map((k, i) => [k, b[i]])) as LocalBox) : null);
const near = (a: number, b: number) => Math.abs(a - b) <= TOL;
const AXES: readonly Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const AXIS_NAMES = ['X', 'Y', 'Z'];
const EDGE_NAMES: readonly [PhysicalEdge, PhysicalEdge][] = [
  ['LEFT', 'RIGHT'],
  ['FRONT', 'REAR'],
  ['BOTTOM', 'TOP'],
];
/** The edges of the prototype (kflowPart) by the slot of the contract: left and right bound L, bottom and top W. */
const EDGE_KEYS: Readonly<Record<EdgeSlot, string>> = { A: 'bottom', B: 'top', C: 'left', D: 'right' };
/**
 * A hinged leaf runs along its hinge edge, as the doors of the wardrobe (INV-M02 reads its length as the height): the
 * width and the height of the prototype's front change places, and so do their edges.
 */
const LEAF_EDGE_KEYS: Readonly<Record<EdgeSlot, string>> = { A: 'left', B: 'right', C: 'bottom', D: 'top' };
/** The key of edge_mm of the slot of a part of the graph: what the manual bands of the kitchen name (MOD-DEC-743). */
export const kitchenEdgeKey = (p: Pick<Part, 'role'>, slot: EdgeSlot): string => (p.role === 'HINGED_FACADE_LEAF' ? LEAF_EDGE_KEYS : EDGE_KEYS)[slot];

/** Role of a carcass part of the kitchen by its name (kflowPart and the constructions of kcr); shelves by their mounting. */
const SHELF = 'SHELF';
export const KITCHEN_PART_ROLES: Readonly<Record<string, [PartRole | typeof SHELF, StructuralRole]>> = {
  'Боковина левая': ['SIDE_PANEL_LEFT', 'LOAD_BEARING'],
  'Боковина правая': ['SIDE_PANEL_RIGHT', 'LOAD_BEARING'],
  'Дно': ['CARCASS_BOTTOM_PANEL', 'LOAD_BEARING'],
  'Дно диагонального корпуса': ['CARCASS_BOTTOM_PANEL', 'LOAD_BEARING'],
  'Г-образное дно': ['CARCASS_BOTTOM_PANEL', 'LOAD_BEARING'],
  'Верх': ['CARCASS_TOP_PANEL', 'STRUCTURAL'],
  // The two rails of a floor carcass under the worktop are its top in two strips (MOD-DEC-566 п. 1).
  'Царга передняя': ['CARCASS_TOP_PANEL', 'STRUCTURAL'],
  'Царга задняя': ['CARCASS_TOP_PANEL', 'STRUCTURAL'],
  'Верх диагонального корпуса': ['CARCASS_TOP_PANEL', 'STRUCTURAL'],
  'Г-образный верх': ['CARCASS_TOP_PANEL', 'STRUCTURAL'],
  'Задник вставной, ненесущий': ['BACK_PANEL', 'NON_STRUCTURAL_BACK'],
  // The back of a new module in the quarter of its carcass, of a wall cabinet on SAH216 — in a groove (MOD-DEC-566 п. 2).
  'Задник в четверти': ['BACK_PANEL', 'NON_STRUCTURAL_BACK'],
  'Задник в пазу': ['BACK_PANEL', 'NON_STRUCTURAL_BACK'],
  // The rear panels of a diagonal corner and of an open end are 16 mm boards of the carcass.
  'Задняя панель A': ['BACK_PANEL', 'STRUCTURAL'],
  'Задняя панель B': ['BACK_PANEL', 'STRUCTURAL'],
  'Задняя панель открытого торца': ['BACK_PANEL', 'STRUCTURAL'],
  'Торцевая панель A': ['VERTICAL_STRUCTURAL_PANEL', 'LOAD_BEARING'],
  'Торцевая панель B': ['VERTICAL_STRUCTURAL_PANEL', 'LOAD_BEARING'],
  'Боковина открытого торца': ['VERTICAL_STRUCTURAL_PANEL', 'LOAD_BEARING'],
  'Опорная боковая панель ниши L': ['VERTICAL_STRUCTURAL_PANEL', 'LOAD_BEARING'],
  'Опорная боковая панель ниши R': ['VERTICAL_STRUCTURAL_PANEL', 'LOAD_BEARING'],
  'Полка': [SHELF, 'NONE'],
  'Диагональная полка': [SHELF, 'NONE'],
  'Г-образная полка': [SHELF, 'NONE'],
  'Полка нижней зоны': [SHELF, 'NONE'],
  'Полка верхней зоны': [SHELF, 'NONE'],
  'Полка открытого торца': [SHELF, 'NONE'],
  'Разделитель зон': ['FIXED_SHELF', 'STRUCTURAL_SHELF'],
  'Фиксированная опора техники': ['FIXED_SHELF', 'STRUCTURAL_SHELF'],
  // The shelf over the hood of a new cabinet (MOD-DEC-566 п. 7, FINDINGS 1279).
  'Полка над вытяжкой': ['FIXED_SHELF', 'STRUCTURAL_SHELF'],
  'Усиление дна под опорной площадкой': ['SUPPORT_PAD', 'LOAD_TRANSFER'],
  'Верхний слой сплошного основания холодильника': ['SUPPORT_PAD', 'LOAD_TRANSFER'],
  'Верхний слой составного дна': ['SUPPORT_PAD', 'LOAD_TRANSFER'],
  // The kitchen plinth is a front panel before the legs, not a bearing base (MOD-DEC-180: legs 100).
  'Цоколь': ['FILLER_PANEL', 'NONE'],
  'Цоколь углового корпуса': ['FILLER_PANEL', 'NONE'],
  'Физический угловой добор': ['FILLER_PANEL', 'NONE'],
  // MOD-DEC-741 (FINDINGS 3201): the filler of a run, card «filler».
  Добор: ['FILLER_PANEL', 'NONE'],
  'Связующая царга ниже техники передняя': ['FILLER_PANEL', 'STRUCTURAL'],
  'Связующая царга ниже техники задняя': ['REAR_APRON', 'STRUCTURAL'],
  'Царга на ребро передняя': ['FILLER_PANEL', 'STRUCTURAL'],
  'Царга на ребро задняя': ['REAR_APRON', 'STRUCTURAL'],
  'Торцевая панель острова L': ['FILLER_PANEL', 'NONE'],
  'Торцевая панель острова R': ['FILLER_PANEL', 'NONE'],
  'Декоративная задняя панель острова': ['FILLER_PANEL', 'NONE'],
  'Боковина ящика левая': ['DRAWER_BOX_SIDE', 'DRAWER_BOX'],
  'Боковина ящика правая': ['DRAWER_BOX_SIDE', 'DRAWER_BOX'],
  'Передняя стенка короба': ['STRUCTURAL_FRONT', 'DRAWER_BOX'],
  'Задняя стенка ящика': ['DRAWER_BOX_BACK', 'DRAWER_BOX'],
  'Дно ящика в пазах': ['DRAWER_BOTTOM_PANEL', 'DRAWER_BOX'],
  // The bottom of the board of the box of the kit of the runner of the level (MOD-DEC-514, FINDINGS 1863).
  'Дно ящика': ['DRAWER_BOTTOM_PANEL', 'DRAWER_BOX'],
};

/** Material family of a material role of the prototype. */
const FAMILIES: Readonly<Record<string, string>> = { CORPUS: 'LDSP', FACADE: 'LDSP', CONTENT: 'LDSP', BACK: 'HDF', GLASS: 'GLASS', WORKTOP: 'WORKTOP' };
/** The words of a material code with no decor (the back of the prototype, kitchen-price.ts backMaterial) in the label of a part: R1-002, FINDINGS 1268. */
const DECOR_TEXT: Readonly<Record<string, string>> = { BACK_MATERIAL_UNKNOWN: 'декор не задан' };

/** The profile of a lift of the prototype (khrLeafPlan): a lift-up front, not a hinged leaf. */
const LIFT_PROFILE = 'BLUM-AVENTOS-HKS-WOOD18',
  RUNNER_FIXING = 'TANDEM cabinet fixing';

/** Kinds of the modules hung on the wall; the others stand on the floor. */
const HUNG: ReadonlySet<string> = new Set(['upper', 'mezz']);
/** A new mezzanine standing on the tall cabinet under it (FINDINGS 1610). */
const onTall = (s: KitchenScene, m: Rec): boolean => !!m.onTall && s.modules.some((x) => x.id === m.supportId && x.kind === 'tall');

const isLeaf = (p: Rec) => p.materialRole === 'FACADE' || p.materialRole === 'GLASS';

/** Problems of a scene for the graph (H-16): a room and modules that the kitchen's own check accepts, in its words. */
export function kitchenGraphProblems(s: KitchenScene): string[] {
  const out: string[] = [];
  for (const k of ['width', 'depth', 'height'] as const)
    if (!(Number.isFinite(s.room?.[k]) && s.room[k] > 0)) out.push(`Помещение: размер ${k} не задан`);
  if (out.length) return out;
  // K5: the rates of the project are read by the price; a rate the import would refuse refuses the kitchen.
  try {
    kitchenRateSettings(s.costSettings);
  } catch (e) {
    out.push((e as Error).message);
  }
  const ids = new Set<string>();
  for (const m of s.modules) {
    if (ids.has(m.id)) out.push(`Модуль ${m.id} повторяется`);
    ids.add(m.id);
    const v = validateKitchenModule(s, m);
    if (!v.ok) out.push(`Модуль ${m.id}: ${v.text}`);
  }
  return out;
}

/** The graph of a kitchen; refuses a scene the kitchen's own check refuses, with its texts (H-16). */
export function kitchenGraph(s: KitchenScene): Graph {
  return fromValidatedInput(s, kitchenGraphProblems, buildKitchenGraph);
}

/** Boards of the kitchen (INV-G02): each material at its thickness; no sheet format here — W5. */
export function kitchenBoards(g: Graph): BoardRef[] {
  const seen = new Map<string, BoardRef>();
  for (const p of g.parts)
    if (p.supply === 'MANUFACTURED' && !seen.has(p.material.variantId))
      seen.set(p.material.variantId, { variantId: p.material.variantId, panelThicknessMm: p.material.panelThicknessMm, sheetFormatMm: p.material.sheetFormatMm });
  return [...seen.values()];
}

/** The charts of the hinges of the graph (INV-M02) and the mass each door carries, from the hinge plans of the core. */
export function kitchenHingeContext(g: Graph): { hingeCharts: HingeChart[]; facadeMassKg: Record<string, number> } {
  const charts = new Map<string, HingeChart>(),
    mass: Record<string, number> = {};
  for (const m of g.mechanisms.filter((m) => m.kind === 'HINGE')) {
    const rows = typeof m.params.chartRows === 'string' ? (JSON.parse(m.params.chartRows) as HingeChart['rows']) : null;
    if (rows && !charts.has(m.profile.catalogId)) charts.set(m.profile.catalogId, { profileId: m.profile.catalogId, rows });
    const door = m.partIds[0];
    if (door && typeof m.params.supportedMassKg === 'number') mass[door] = m.params.supportedMassKg;
  }
  return { hingeCharts: [...charts.values()], facadeMassKg: mass };
}

/**
 * The place of a front in the grid: its box, and the edge handle or the profile on its edge with it — the front is
 * shorter by its rise there, the handle stands in what the front gave up (FINDINGS 3216).
 */
function withEdgeHandle(p: Rec, b: LocalBox | null): LocalBox | null {
  const e = p.edgeHandle;
  if (!b || !e) return b;
  const r = e.riseMm as number;
  return e.edge === 'TOP' ? { ...b, y1: b.y1 + r } : e.edge === 'BOTTOM' ? { ...b, y0: b.y0 - r } : e.edge === 'LEFT' ? { ...b, x0: b.x0 - r } : { ...b, x1: b.x1 + r };
}

/**
 * The front grid of a module (KF-06, KF-11: one source of the gaps, INV-F05): the leaves standing in the front plane of
 * its box, a column for each run of leaves of one width, the nominal border of two columns in the middle of their seam;
 * the gaps are those of the module (frontGap, frontGapY, frontSeam). A front turned off the plane (a diagonal corner)
 * has no grid. A front coupled to an appliance takes its size from the appliance's template, not from the gaps of the
 * module: it is no link of the chain; a niche of an appliance between two fronts breaks the chain, and each chain is
 * its own column of the same width (Д, FINDINGS 328).
 */
export function moduleFrontGrid(s: KitchenScene, m: Rec, leaves: Rec[], envelopes: Rec[] = []): FrontGrid | null {
  const own = leaves.filter((p) => !p.applianceFront).map((p) => ({ p, b: withEdgeHandle(p, localBox(p.box)) })),
    flat = own.filter((x): x is { p: Rec; b: LocalBox } => !x.p.polygonFront && !!x.b && x.b.z1 <= TOL);
  if (!flat.length || flat.length !== own.length) return null;
  const runs = [...new Map(flat.map(({ b }) => [b.x0 + '|' + b.x1, [b.x0, b.x1] as [number, number]])).values()].sort((a, b) => a[0] - b[0]);
  if (runs.some((r, i) => i > 0 && r[0] < runs[i - 1]![1] - TOL)) return null;
  const borders = [0, ...runs.slice(1).map((r, i) => (runs[i]![1] + r[0]) / 2), m.width],
    niche = (lo: number, hi: number) =>
      envelopes.some((e) => {
        const b = localBox(e.box);
        return !!b && b.y0 < hi && b.y1 > lo;
      }),
    chains: { run: number; parts: { p: Rec; b: LocalBox }[] }[] = [];
  runs.forEach((r, i) => {
    const stack = flat.filter(({ b }) => b.x0 === r[0] && b.x1 === r[1]).sort((a, b) => a.b.y0 - b.b.y0);
    stack.forEach((x, k) => {
      if (k && !niche(stack[k - 1]!.b.y1, x.b.y0)) chains[chains.length - 1]!.parts.push(x);
      else chains.push({ run: i, parts: [x] });
    });
  });
  const columns = chains.map((c, i) => ({ id: `${m.id}/column/${i}`, index: i, nominalStartMm: ratFromDecimal(borders[c.run]!), nominalEndMm: ratFromDecimal(borders[c.run + 1]!), status: 'SUPPORTED' })),
    gx = frontGap(s, m),
    gy = frontGapY(s, m),
    seam = frontSeam(m);
  return {
    mode: 'AUTO',
    facadeWidthPolicy: 'KITCHEN_MODULE',
    gapProfile: {
      profileId: `KITCHEN-${gx}-${seam}-${gy}`,
      facadeGapHorizontalMm: seam,
      facadeGapVerticalMm: seam,
      facadeOuterOffsetLeftMm: gx,
      facadeOuterOffsetRightMm: gx,
      facadeOuterOffsetTopMm: gy,
      facadeBottomOffsetMm: gy,
      facadeToCarcassGapMm: -Math.max(...flat.map(({ b }) => b.z1)),
    },
    columns,
    facades: chains.flatMap((c, i) =>
      c.parts.map(({ p, b }) => ({
        id: p.partId,
        columnId: columns[i]!.id,
        facadeRowId: null,
        leftMm: ratFromDecimal(b.x0),
        rightMm: ratFromDecimal(b.x1),
        bottomElevationMm: ratFromDecimal(b.y0),
        topElevationMm: ratFromDecimal(b.y1),
        partIds: [p.partId],
        status: 'SUPPORTED',
      })),
    ),
    overlays: [],
  };
}

/** The prototype cuts the blank as finished minus the band: zero allowances from the prototype (FINDINGS 321). */
const prototypeAllowance = (): { length: Allowance; width: Allowance } => {
  const a = (): Allowance => ({ minusMm: 0, plusMm: 0, source: { kind: 'PROTOTYPE', ref: 'r1.html:69706 kflowPart: заготовка = готовая − кромка', finding: 'FINDINGS 321' } });
  return { length: a(), width: a() };
};

/** Scalars of a record for params, nested values as JSON text. */
function scalars(record: Rec | null | undefined, keys: readonly string[]): Record<string, number | string | boolean | null> {
  const out: Record<string, number | string | boolean | null> = {};
  for (const k of keys) {
    const v = record?.[k];
    if (v === undefined) continue;
    out[k] = v === null || ['number', 'string', 'boolean'].includes(typeof v) ? v : JSON.stringify(v);
  }
  return out;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clean = (v: Vec3): Vec3 => v.map((x) => (Object.is(x, -0) ? 0 : x)) as Vec3;
const unitOf = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v);
  return clean(v.map((x) => x / l) as Vec3);
};

interface Frame {
  placement: Part['placement'];
  L: number;
  W: number;
  T: number;
  contour: [number, number][] | null;
  /** The height of a hinged leaf is its length (LEAF_EDGE_KEYS). */
  alongHinge?: boolean;
}

const alongHinge = (f: Frame): Frame => ({ ...f, placement: { ...f.placement, uAxis: f.placement.vAxis, vAxis: f.placement.uAxis }, L: f.W, W: f.L, alongHinge: true });

/** Point of part axes in product axes. */
const placePoint = (pl: Part['placement'], u: number, v: number, n: number): Vec3 =>
  [0, 1, 2].map((i) => pl.originMm[i]! + pl.uAxis[i]! * u + pl.vAxis[i]! * v + pl.nAxis[i]! * n) as Vec3;
/** Point of product axes in part axes (u, v, n). */
const localPoint = (pl: Part['placement'], q: Vec3): Vec3 => {
  const d = sub(q, pl.originMm);
  return [dot(pl.uAxis, d), dot(pl.vAxis, d), dot(pl.nAxis, d)];
};

/** The physical edge of a slot: the side of the product axis its edge faces (a slot at 0 faces −axis). */
function physicalEdge(axis: Vec3, atZero: boolean): PhysicalEdge {
  const i = [0, 1, 2].reduce((k, j) => (Math.abs(axis[j]!) > Math.abs(axis[k]!) ? j : k), 0),
    minSide = atZero === axis[i]! > 0;
  return EDGE_NAMES[i]![minSide ? 0 : 1]!;
}

const normalName = (v: Vec3) => {
  const i = [0, 1, 2].reduce((k, j) => (Math.abs(v[j]!) > Math.abs(v[k]!) ? j : k), 0);
  return (v[i]! > 0 ? '+' : '-') + AXIS_NAMES[i];
};

function buildKitchenGraph(s: KitchenScene): Graph {
  const R = s.room.depth,
    records = moduleRecords(s),
    prototypeParts = partsOf(s, records),
    moduleOf = new Map(s.modules.map((m) => [m.id, m])),
    basis = { datum: 'FINISHED_PART_WITH_EDGE', stage: 'POST_EDGING', transform: KITCHEN_GENERATOR } as const;
  /** A point of the frame of the fasteners (x, depth from wall A, height) in the graph. */
  const graphPoint = (p: readonly number[]): Vec3 => clean([p[0]!, R - p[1]!, p[2]!]);
  const graphDir = (n: readonly number[]): Vec3 => clean([n[0]!, -n[1]!, n[2]!]);
  /** A point of the box of a module (x across, y up, z from the front) in the graph. */
  const modulePoint = (m: Rec, q: readonly number[]): Vec3 => graphPoint(fastenerPoint(s, m, [q[0]!, q[2]!, q[1]!]));
  /** A box of a module in the graph, axis-aligned (the modules turn by 90°). */
  const graphBox = (m: Rec, box: readonly number[]): Box3 => {
    const [x0, x1, y0, y1, z0, z1] = worldBox(s, m, box);
    return { minMm: graphPoint([x0, z1, y0]), sizeMm: [x1 - x0, z1 - z0, y1 - y0] };
  };

  // ---- the frame of each part: placement, sizes, contour
  function frameOf(p: Rec): Frame {
    const m = moduleOf.get(p.moduleId)!,
      [L, W, T] = p.finished_mm as [number, number, number];
    if (p.worldFootprintMm && p.polygonFront) {
      // A diagonal front or plinth: its plan is the quadrilateral front face → back face; the width is the height.
      const fp = p.worldFootprintMm as number[][],
        bottom = worldBox(s, m, p.box)[2],
        a = graphPoint([fp[0]![0]!, fp[0]![1]!, bottom]),
        b = graphPoint([fp[1]![0]!, fp[1]![1]!, bottom]),
        c = graphPoint([fp[2]![0]!, fp[2]![1]!, bottom]);
      if (!near(Math.hypot(...sub(b, a)), L) || !near(Math.hypot(...sub(c, b)), T)) throw new Error(`kitchen → engine: план детали ${p.partId} не совпадает с её размерами`);
      return { placement: { originMm: a, uAxis: unitOf(sub(b, a)), vAxis: [0, 0, 1], nAxis: unitOf(sub(c, b)) }, L, W, T, contour: null };
    }
    const box = p.box as number[],
      lb = localBox(box)!,
      ext = [lb.x1 - lb.x0, lb.y1 - lb.y0, lb.z1 - lb.z0],
      polygon = p.finished_polygon_mm as number[][] | undefined;
    // The axes of the box carrying L, W, T: the first assignment that fits (x before y before z).
    const perms: [number, number, number][] = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const fit = perms.find(([u, v, n]) => near(ext[u]!, L) && near(ext[v]!, W) && near(ext[n]!, T));
    if (!fit) throw new Error(`kitchen → engine: коробка детали ${p.partId} (${ext.join(' × ')}) не совпадает с размерами ${L} × ${W} × ${T}`);
    const [ua, va, na] = fit,
      // A polygon of a diagonal or L-shaped corner is drawn in the plan (x, D − z) of its module: v runs to the front.
      backward = polygon ? va : -1,
      corner = [0, 1, 2].map((i) => (i === backward ? box[i * 2 + 1]! : box[i * 2]!)),
      step = (i: number) => corner.map((x, k) => (k === i ? x + (i === backward ? -1 : 1) : x)),
      o = modulePoint(m, corner),
      axis = (i: number) => clean(sub(modulePoint(m, step(i)), o));
    const contour = polygon ? polygon.map(([x, y]) => [x! - lb.x0, y! - (m.depth - lb.z1)] as [number, number]) : null;
    return { placement: { originMm: o, uAxis: axis(ua), vAxis: axis(va), nAxis: axis(na) }, L, W, T, contour };
  }

  /**
   * The bevelled ends of a part (MOD-DEC-440): its plan outline (the end panels of a diagonal corner) in the axes of
   * the part; an end whose two faces end at different u is sawn at an angle.
   */
  function bevelsOf(p: Rec, f: Frame): PartBevel[] | null {
    if (!p.bevel) return null;
    const m = moduleOf.get(p.moduleId)!,
      section = (p.localOutlineMm as number[][]).map(([x, y]) => localPoint(f.placement, modulePoint(m, [x!, p.box[2], m.depth - y!]))),
      face = (n: number) => section.filter((q) => near(q[2], n)).map((q) => q[0]),
      [lo, hi] = [face(0), face(f.T)],
      out: PartBevel[] = [];
    for (const edge of ['C', 'D'] as const) {
      const end = (us: number[]) => (edge === 'C' ? Math.min(...us) : Math.max(...us)),
        d = end(lo) - end(hi);
      if (!near(d, 0)) out.push({ edge, shortFace: (edge === 'C') === d > 0 ? 'N_NEG' : 'N_POS', setbackMm: Math.abs(d), angleDeg: p.bevel.angleDeg, decision: p.bevel.decision });
    }
    return out;
  }

  /** The band of each slot: the edge map of the part, for a contour the segment lying on that side of the envelope. */
  function edgesOf(p: Rec, f: Frame, bevels: PartBevel[] | null = null): Record<EdgeSlot, EdgeBand> {
    const edges = {} as Record<EdgeSlot, EdgeBand>;
    for (const slot of ['A', 'B', 'C', 'D'] as const) {
      const alongU = slot === 'A' || slot === 'B',
        atZero = slot === 'A' || slot === 'C',
        segment = f.contour
          ? (p.edge_segments_mm as Rec[] | undefined)?.find((sg) => {
              const pb = localBox(p.box)!,
                [a, b] = [sg.from, sg.to].map(([x, y]: number[]) => [x! - pb.x0, y! - (moduleOf.get(p.moduleId)!.depth - pb.z1)]);
              const k = alongU ? 1 : 0,
                at = atZero ? 0 : alongU ? f.W : f.L;
              return near(a![k]!, at) && near(b![k]!, at);
            })
          : undefined,
        key = (f.alongHinge ? LEAF_EDGE_KEYS : EDGE_KEYS)[slot],
        t = f.contour ? (segment?.thicknessMm ?? 0) : (p.edge_mm?.[key] ?? 0),
        intent = t ? 'EDGE_' + t.toFixed(1).replace('.', '_') : 'NONE',
        // MOD-DEC-743: a manual band of the project (kitchen/edge-bands.ts) — the automatic one stays in auto_edge_mm.
        automatic = p.auto_edge_mm ? intentOfThicknessMm(p.auto_edge_mm[key] ?? 0) : intent;
      edges[slot] = {
        slot,
        physicalEdge: physicalEdge(alongU ? f.placement.vAxis : f.placement.uAxis, atZero),
        edgeLengthMm: alongU ? f.L : f.W,
        intent,
        edgeBandThicknessMm: t,
        // A band on a bevel builds up along the length by its thickness / sin(angle) (MOD-DEC-440).
        effectiveEdgeBandThicknessMm: t && bevels?.some((b) => b.edge === slot) ? p.bevel.edgeAlongLengthMm : t,
        profileCode: t ? 'UNRESOLVED' : 'NONE',
        automaticIntent: automatic,
        override: p.edge_overrides?.[key] ?? 'AUTO',
        exposure: t ? 'VISIBLE' : 'HIDDEN',
        ruleId: f.contour ? 'kitchen edge_segments_mm' : 'MOD-DEC-180 kflowPart edge_mm',
      };
    }
    return edges;
  }

  /**
   * The bands of the segments of a contour (FINDINGS 816): segment i of edge_segments_mm runs from vertex i of the
   * polygon, as `contourMm`; a segment on a side of the envelope names its slot, an oblique one none.
   */
  function contourEdgesOf(p: Rec, f: Frame): ContourEdge[] | undefined {
    if (!f.contour) return undefined;
    const segments = (p.edge_segments_mm as Rec[] | undefined) ?? [];
    if (segments.length !== f.contour.length) throw new Error(`kitchen → engine: у детали ${p.partId} ${segments.length} сегментов кромки на ${f.contour.length} сторон контура`);
    return f.contour.map((a, i) => {
      const b = f.contour![(i + 1) % f.contour!.length]!,
        slot = segmentSlot(a, b, f.L, f.W, near),
        t = segments[i]!.thicknessMm ?? 0,
        intent = t ? 'EDGE_' + t.toFixed(1).replace('.', '_') : 'NONE';
      return { segment: i, slot, lengthMm: Math.hypot(b[0] - a[0], b[1] - a[1]), intent, edgeBandThicknessMm: t, profileCode: t ? 'UNRESOLVED' : 'NONE', exposure: t ? 'VISIBLE' : 'HIDDEN', ruleId: 'kitchen edge_segments_mm' };
    });
  }

  // ---- the hinge plans and the leaves: a door is a hinged leaf when its group has a hinge (not a lift)
  const leafPlans = new Map<string, Rec>();
  for (const r of records) for (const l of r.derived.hardwarePlanning?.leaves ?? []) leafPlans.set(r.module.id + '|' + l.groupId, l);
  const groupOf = (p: Rec) => p.doorGroupId || p.partId,
    planOf = (p: Rec) => leafPlans.get(p.moduleId + '|' + groupOf(p));

  function roleOf(p: Rec): [PartRole, StructuralRole] {
    if (p.materialRole === 'WORKTOP') return ['WORKTOP', 'NONE'];
    if (isLeaf(p)) {
      const plan = planOf(p);
      return [plan && plan.profileId !== LIFT_PROFILE ? 'HINGED_FACADE_LEAF' : 'DECORATIVE_FACADE', 'FACADE'];
    }
    // A part of a back in parts (MOD-DEC-701) keeps the kind of the back; its name says which part it is.
    const r = KITCHEN_PART_ROLES[p.backPiece ? p.kind : p.name];
    if (!r) throw new Error(`kitchen → engine: роль детали «${p.name}» (${p.partId}) не задана`);
    if (r[0] === SHELF) return p.removableShelf ? ['ADJUSTABLE_SHELF', 'NONE'] : ['FIXED_SHELF', 'STRUCTURAL_SHELF'];
    return r as [PartRole, StructuralRole];
  }

  // ---- assemblies: the product and one module each
  const assemblies: Assembly[] = [],
    parts: Part[] = [],
    frames = new Map<string, Frame>();
  // KF-15: the walls of the room and their names are the room's data, given to every reader of the graph as they are.
  const walls = roomWalls(s);
  assemblies.push({ id: KITCHEN_PRODUCT_ID, kind: 'PRODUCT', parentId: null, inputRef: null, box: { minMm: [0, 0, 0], sizeMm: [0, 0, 0] }, index: 0, frame: null, span: null, frontGrid: null, request: { wallNaming: s.wallNaming, walls: JSON.stringify(walls) } });
  const used = s.modules.filter((m) => prototypeParts.some((p) => p.moduleId === m.id));
  used.forEach((m, i) => {
    const w = localBox(worldBox(s, m, [0, m.width, 0, m.height, 0, bodyDepth(m)]))!,
      min = graphPoint([w.x0, w.z1, w.y0]);
    assemblies.push({
      id: m.id,
      kind: 'MODULE',
      parentId: KITCHEN_PRODUCT_ID,
      inputRef: m.id,
      box: { minMm: min, sizeMm: [w.x1 - w.x0, w.z1 - w.z0, w.y1 - w.y0] },
      index: i,
      frame: null,
      span: null,
      frontGrid: moduleFrontGrid(s, m, prototypeParts.filter((p) => p.moduleId === m.id && isLeaf(p)), records.find((r) => r.module.id === m.id)?.derived.applianceEnvelopes ?? []),
      request: {
        ...scalars(m, ['moduleTypeId', 'catalogId', 'kind', 'wall', 'zone', 'width', 'height', 'depth', 'floor', 'rotation']),
        ...(isFree(m) ? {} : { wallName: walls.find((w) => w.id === m.wall)?.name ?? canonicalWall(s, m.wall) }),
        ...(onTall(s, m) ? { 'body.parent': m.supportId } : {}),
      },
    });
  });

  // ---- parts
  for (const p of prototypeParts) {
    const [role, structuralRole] = roleOf(p),
      f = role === 'HINGED_FACADE_LEAF' ? alongHinge(frameOf(p)) : frameOf(p),
      bevels = bevelsOf(p, f),
      edges = edgesOf(p, f, bevels),
      T = f.T,
      handedness = role === 'SIDE_PANEL_LEFT' ? 'LEFT' : role === 'SIDE_PANEL_RIGHT' ? 'RIGHT' : 'NONE',
      material = p.materialCode as string,
      // MOD-DEC-573: a front of the material of the facades chosen — bought ready-made, or a board of ЛМДФ or ЛДСП.
      chosen = p.materialRole === 'FACADE' && p.facadeMaterialId ? facadeFamily(p, s.hardware) : null,
      purchased = chosen === 'PURCHASED_FINISHED',
      family = chosen ?? FAMILIES[p.materialRole] ?? p.materialRole;
    frames.set(p.partId, f);
    parts.push({
      id: p.partId,
      name: p.name,
      assemblyId: p.moduleId,
      inputRef: p.moduleId,
      role,
      structuralRole,
      handedness,
      material: {
        family,
        // A bought front shows the decor it is ordered in as the sample of its colour (FINDINGS 266, 1345).
        decorId: material,
        variantId: (chosen && chosen !== 'LDSP' ? chosen + ':' : '') + material + '-' + T,
        label: purchased
          ? `${p.facadeTitle} · ${p.facadeColorText ?? material} · ${T} мм`
          : (chosen === 'LMDF' ? 'ЛМДФ ' : '') + (DECOR_TEXT[material] ?? (p.materialRole === 'WORKTOP' ? worktopOf(s.hardware.worktops, material)?.name : null) ?? material) + ' · ' + T + ' мм',
        panelThicknessMm: T,
        sheetFormatMm: null,
        purpose: purchased ? 'PURCHASE' : 'MANUFACTURE',
      },
      finishedWithEdge: { lengthMm: f.L, widthMm: f.W, panelThicknessMm: T },
      dimensionChain: deriveDimensionChain({ lengthMm: f.L, widthMm: f.W }, edges, prototypeAllowance(), prototypeAllowance()),
      placement: f.placement,
      orientation: {
        family: p.materialRole,
        handedness,
        faceNames: { N_POS: 'n+', N_NEG: 'n−' },
        faceNormals: { N_POS: normalName(f.placement.nAxis), N_NEG: normalName(f.placement.nAxis.map((x) => -x) as Vec3) },
        grainDirection: 'NONE',
      },
      edges,
      contourMm: f.contour,
      ...(f.contour ? { contourEdges: contourEdgesOf(p, f) } : {}),
      supply: purchased ? 'PURCHASED' : 'MANUFACTURED',
      operationIds: [],
      installationElevationMm: null,
      qualification: { physical: false, cnc: false, reasons: [`${p.status}: ${p.drillingStatus}`] },
      ...(bevels?.length ? { bevels } : {}),
    });
  }
  const moduleParts = (m: Rec) => parts.filter((p) => p.assemblyId === m.id).map((p) => p.id);
  const partById = new Map(parts.map((x) => [x.id, x])),
    sourceById = new Map(prototypeParts.map((p) => [p.partId, p]));

  // ---- joints: the fasteners r7 of each module, the grooves of the drawer boxes, the joints of the constructions
  const joints: Joint[] = [],
    mechanisms: Mechanism[] = [],
    operations: Operation[] = [],
    unresolved: Unresolved[] = [],
    capabilities: CapabilityResolution[] = [],
    installationRequirements: InstallationRequirement[] = [];
  const issue = (code: string, level: Unresolved['level'], text: string, refs: Partial<Pick<Unresolved, 'partIds' | 'jointIds' | 'operationIds' | 'mechanismIds'>>, blocks: boolean) =>
    unresolved.push({ code, level, partIds: refs.partIds ?? [], jointIds: refs.jointIds ?? [], operationIds: refs.operationIds ?? [], mechanismIds: refs.mechanismIds ?? [], text, ruleId: KITCHEN_RULE_SET, blocksProductionReadiness: blocks });
  const jointBase = (id: string, kind: JointKind, through: string, receiving: string, profileId: string): Joint => ({
    id,
    kind,
    parts: { throughPartId: through, receivingPartId: receiving },
    contact: contactOf(through, receiving),
    faces: { through: '', receiving: '', outer: null, cup: null },
    profileId,
    stationsMm: [],
    assembly: 'UNKNOWN',
    reason: '',
    visibility: { exposed: false, covered: false, internalPartition: false, role: '' },
    opposed: { opposed: false, minWebMm: null },
    dowelCount: 0,
    physicalVerified: false,
    productionExecutable: false,
    drillingExemption: null,
  });
  function boxOf(id: string): { min: Vec3; max: Vec3 } {
    const p = partById.get(id)!,
      { lengthMm: L, widthMm: W, panelThicknessMm: T } = p.finishedWithEdge,
      cs: Vec3[] = [];
    for (const a of [0, L]) for (const b of [0, W]) for (const c of [0, T]) cs.push(placePoint(p.placement, a, b, c));
    return { min: [0, 1, 2].map((i) => Math.min(...cs.map((q) => q[i]!))) as Vec3, max: [0, 1, 2].map((i) => Math.max(...cs.map((q) => q[i]!))) as Vec3 };
  }
  /** Contact of two part boxes: the touching (or engaged) axis, the joint line along the longer common extent. */
  function contactOf(a0: string, b0: string): Joint['contact'] {
    const a = boxOf(a0),
      b = boxOf(b0),
      ov = [0, 1, 2].map((i) => Math.min(a.max[i]!, b.max[i]!) - Math.max(a.min[i]!, b.min[i]!)),
      axis = [0, 1, 2].reduce((k, i) => (ov[i]! < ov[k]! ? i : k), 0),
      [p, q] = [0, 1, 2].filter((i) => i !== axis) as [number, number],
      line = ov[q]! > ov[p]! ? q : p,
      cross = line === p ? q : p,
      origin = [0, 1, 2].map((i) => Math.max(a.min[i]!, b.min[i]!)) as Vec3;
    return {
      axis: axis as 0 | 1 | 2,
      frame: { originMm: origin, uAxis: [...AXES[line]!] as Vec3, sAxis: [...AXES[cross]!] as Vec3, wAxis: [...AXES[axis]!] as Vec3 },
      contactLengthMm: Math.max(0, ov[line]!),
      contactAreaMm2: Math.max(0, ov[line]!) * Math.max(0, ov[cross]!),
    };
  }

  /** A hole of the prototype (entry and inward normal in the frame of the fasteners) on its part. */
  function hole(o: Rec, owner: Hole['owner'], fields: Pick<Hole, 'source' | 'sourceRef' | 'completeness' | 'machiningRole' | 'fastenerProfileId'>): Hole {
    const p = partById.get(o.partId)!,
      f = frames.get(o.partId)!,
      entry = graphPoint(o.entry),
      normal = graphDir(o.inwardNormal),
      [u, v, n] = localPoint(f.placement, entry),
      [nu, nv, nn] = [f.placement.uAxis, f.placement.vAxis, f.placement.nAxis].map((a) => dot(a, normal)),
      through = o.kind === 'through',
      face = near(Math.abs(nn!), 1),
      edge: EdgeSlot | null = face ? null : near(Math.abs(nu!), 1) ? (nu! > 0 ? 'C' : 'D') : nv! > 0 ? 'A' : 'B';
    if (!face && !(near(Math.abs(nu!), 1) || near(Math.abs(nv!), 1))) throw new Error(`kitchen → engine: отверстие ${o.operationId ?? o.id} не перпендикулярно детали ${p.id}`);
    return {
      op: 'HOLE',
      id: o.operationId ?? o.id,
      partId: p.id,
      mode: face ? 'FACE' : 'EDGE',
      face: face ? (nn! > 0 ? 'N_NEG' : 'N_POS') : null,
      edge,
      xMm: face || edge === 'A' || edge === 'B' ? u! : v!,
      yMm: face ? v! : 0,
      diameterMm: o.diameter,
      depthMm: through ? null : o.depth,
      through,
      layer: o.machiningRole === 'HANGER_MARK' || o.machiningRole === 'LIFT_MARK' ? 'MARKING' : 'DRILL',
      machiningRole: fields.machiningRole,
      purpose: o.kind,
      code: fields.machiningRole,
      owner,
      fastenerProfileId: fields.fastenerProfileId,
      axisOffsetMm: face ? null : n!,
      entryMm: entry,
      inwardNormal: normal,
      stationMm: Number.isFinite(o.station) ? o.station : null,
      source: fields.source,
      sourceRef: fields.sourceRef,
      completeness: fields.completeness,
      status: o.status ?? 'ENGINEERING_DRAFT',
      basis,
    };
  }
  const addOperation = (op: Operation) => {
    operations.push(op);
    partById.get(op.partId)!.operationIds.push(op.id);
  };

  for (const r of records) {
    const m = r.module,
      d = r.derived;
    // r7 fasteners: the anchor is drilled through, the screw goes into the edge of the other part (192). The box of a
    // TANDEM drawer is joined by the same plan (kre, addDrawerJoints): its holes are priced, so they are drilling of the
    // graph too (K5, INV-P02, FINDINGS 574).
    const box = new Set<string>((d.drawerJoints?.joints ?? []).map((j: Rec) => j.id));
    for (const j of [...(d.fastenersR7?.joints ?? []), ...(d.drawerJoints?.joints ?? [])]) {
      if (!partById.has(j.anchor?.id) || !partById.has(j.edge?.id)) continue;
      const roles: string[] = (j.operations ?? []).map((o: Rec) => String(o.role)),
        kind: JointKind = roles.some((x) => x.startsWith('CONFIRMAT')) ? 'CONFIRMAT' : roles.includes('CAM') ? 'CAM_CONNECTOR' : roles.some((x) => /DOWEL|WOOD/.test(x)) ? 'DOWEL' : 'SCREW',
        g = jointBase(j.id, kind, j.anchor.id, j.edge.id, j.profileId);
      g.contact = {
        axis: [0, 1, 2].find((i) => near(Math.abs(graphDir(j.w)[i]!), 1)) as 0 | 1 | 2,
        frame: { originMm: graphPoint(j.origin), uAxis: graphDir(j.u), sAxis: graphDir(j.s), wAxis: graphDir(j.w) },
        contactLengthMm: j.length,
        contactAreaMm2: contactOf(j.anchor.id, j.edge.id).contactAreaMm2,
      };
      g.stationsMm = [...j.stations];
      g.assembly = j.errors?.length ? 'IMPOSSIBLE' : j.decision?.choice === 'UNKNOWN' ? 'UNKNOWN' : 'OK';
      g.reason = [j.decision?.reason, ...(j.errors ?? []).map((e: Rec) => e.code)].filter(Boolean).join('; ');
      g.faces = { through: j.anchorFace ?? '', receiving: j.edgeFace ?? '', outer: j.outerFace ?? null, cup: kind === 'CAM_CONNECTOR' ? (j.cupFace ?? null) : null };
      g.visibility = { exposed: !!j.externallyVisible, covered: !!j.covered, internalPartition: !!j.internalPartition, role: j.role ?? '' };
      g.opposed = { opposed: !!j.opposed, minWebMm: null };
      const role = sourceById.get(j.edge.id)?.name;
      g.connectionRole = box.has(j.id) ? 'BOX_CONFIRMAT' : KITCHEN_PART_ROLES[role]?.[0] === 'CARCASS_BOTTOM_PANEL' ? 'BOTTOM' : KITCHEN_PART_ROLES[role]?.[0] === 'CARCASS_TOP_PANEL' ? 'TOP' : 'SHELF';
      joints.push(g);
    }
    // The joints of a construction (kcr) are a count without places: the joint is planned, its drilling is incomplete.
    const unplaced: string[] = [];
    for (const c of d.constructionJoints ?? []) {
      const pair = (c.actualPartIds ?? []).filter((id: string) => partById.has(id));
      if (pair.length === 2) {
        const g = jointBase(c.id, 'SCREW', pair[0], pair[1], c.profileId);
        g.reason = `${c.kind}: ${c.count} шт.; ${c.qualification}`;
        joints.push(g);
        issue('DRILLING_INCOMPLETE', 'WARNING', `Модуль ${m.id}: крепёж «${kitchenServiceTitle(c.kind)}» — ${c.count} шт. без координат отверстий (присадка неполная).`, { jointIds: [g.id] }, true);
      } else unplaced.push(`«${kitchenServiceTitle(c.kind)}» — ${c.count} шт.`);
    }
    if (unplaced.length) issue('CONSTRUCTION_JOINT_UNPLACED', 'WARNING', `Модуль ${m.id}: крепёж ${unplaced.join(', ')} — пары деталей и места отверстий не заданы (присадка неполная).`, { partIds: moduleParts(m) }, true);
    // The bottom of a drawer box stands in the grooves of its sides and front (TANDEM_BOX, KF-17).
    for (const p of prototypeParts.filter((p) => p.moduleId === m.id && p.grooves?.some((g: Rec) => g.semantic !== HANDLE_GROOVE))) {
      const box = prototypeParts.find((q) => q.drawerId === p.drawerId && q.name === 'Дно ящика в пазах');
      if (!box) continue;
      const g = jointBase(`${box.partId}/GROOVE/${p.partId}`, 'GROOVE_FIT', box.partId, p.partId, 'TANDEM_BOX');
      g.reason = 'Дно ящика в пазу';
      g.visibility = { exposed: false, covered: true, internalPartition: false, role: 'DRAWER_BOTTOM_GROOVE' };
      g.assembly = 'OK';
      joints.push(g);
      const f = frames.get(p.partId)!;
      for (const gr of p.grooves.filter((g: Rec) => g.semantic !== HANDLE_GROOVE)) {
        const lb = localBox(gr.localBox)!,
          a = localPoint(f.placement, modulePoint(m, [lb.x0, lb.y0, lb.z0])),
          b = localPoint(f.placement, modulePoint(m, [lb.x1, lb.y1, lb.z1])),
          lo = [0, 1, 2].map((i) => Math.min(a[i]!, b[i]!)),
          hi = [0, 1, 2].map((i) => Math.max(a[i]!, b[i]!)),
          along: Groove['along'] = hi[0]! - lo[0]! >= hi[1]! - lo[1]! ? 'LENGTH' : 'WIDTH',
          k = along === 'LENGTH' ? 0 : 1;
        addOperation({
          op: 'GROOVE',
          id: gr.id,
          partId: p.partId,
          face: near(lo[2]!, 0) ? 'N_NEG' : 'N_POS',
          edge: null,
          along,
          startMm: lo[k]!,
          endMm: hi[k]!,
          offsetMm: lo[1 - k]!,
          grooveWidthMm: hi[1 - k]! - lo[1 - k]!,
          grooveDepthMm: hi[2]! - lo[2]!,
          semanticType: 'GROOVE_FOR_DRAWER_BOTTOM',
          purpose: gr.kind,
          owner: { jointId: g.id },
          resolution: { profileId: 'TANDEM_BOX', productionConfirmed: false, requiresTechnologyConfirmation: true },
          basis,
        });
      }
    }
    // The back of a new module stands in the quarter of the sides, the bottom and the top or the rear rail (MOD-DEC-566
    // п. 2, 287; FINDINGS 1269): one GROOVE_FIT joint and one groove per panel, as the wardrobe's back (BACK_REBATE).
    // A back in parts (MOD-DEC-701, FINDINGS 2600): each part stands in the quarter of the panels along its edges; the
    // grooves of a panel belong to the joint of the first part at it.
    const back = prototypeParts.find((p) => p.partId === m.id + ':back' && /^Задник в (четверти|пазу)$/.test(p.kind)),
      pieces = back?.backPiece ? prototypeParts.filter((p) => p.backPiece?.backId === back.partId) : back ? [back] : [];
    for (const p of back ? prototypeParts.filter((p) => p.moduleId === m.id && p.grooves?.some((g: Rec) => /_FOR_BACK$/.test(g.semantic ?? ''))) : []) {
      const own = p.grooves.filter((x: Rec) => /_FOR_BACK$/.test(x.semantic ?? '')),
        meets = (piece: Rec) => own.some((gr: Rec) => [0, 2].every((i) => Math.min(piece.box[i + 1], gr.localBox[i + 1]) - Math.max(piece.box[i], gr.localBox[i]) > TOL)),
        [g] = pieces.filter((x) => !x.backPiece || meets(x)).map((piece) => {
          const j = jointBase(`${piece.partId}/REBATE/${p.partId}`, 'GROOVE_FIT', piece.partId, p.partId, 'KITCHEN_BACK_REBATE');
          j.reason = 'Задник в четверти: рабочий профиль шкафа, не подтверждён производством';
          j.visibility = { exposed: false, covered: true, internalPartition: false, role: 'BACK_REBATE' };
          j.connectionRole = 'BACK';
          joints.push(j);
          return j;
        });
      if (!g) continue;
      const f = frames.get(p.partId)!;
      for (const gr of own) {
        const lb = localBox(gr.localBox)!,
          a = localPoint(f.placement, modulePoint(m, [lb.x0, lb.y0, lb.z0])),
          b = localPoint(f.placement, modulePoint(m, [lb.x1, lb.y1, lb.z1])),
          lo = [0, 1, 2].map((i) => Math.min(a[i]!, b[i]!)),
          hi = [0, 1, 2].map((i) => Math.max(a[i]!, b[i]!)),
          along: Groove['along'] = hi[0]! - lo[0]! >= hi[1]! - lo[1]! ? 'LENGTH' : 'WIDTH',
          k = along === 'LENGTH' ? 0 : 1;
        addOperation({
          op: 'GROOVE',
          id: gr.id,
          partId: p.partId,
          face: near(lo[2]!, 0) ? 'N_NEG' : 'N_POS',
          edge: null,
          along,
          startMm: lo[k]!,
          endMm: hi[k]!,
          offsetMm: lo[1 - k]!,
          grooveWidthMm: hi[1 - k]! - lo[1 - k]!,
          grooveDepthMm: hi[2]! - lo[2]!,
          semanticType: gr.semantic,
          purpose: gr.kind,
          owner: { jointId: g.id },
          resolution: { profileId: 'MODULERO-QUARTER-PROPOSAL-1', productionConfirmed: false, requiresTechnologyConfirmation: true },
          basis,
        });
      }
    }
    // MOD-DEC-701: the parts of a back are screwed to the rear edge of the fixed shelf of their seam by the fitters,
    // without drilling (screws 3,5 × 16 not farther apart than the pitch, a station each); with no shelf they meet in
    // an H-profile — as the wardrobe's back (FINDINGS 1855, 2600).
    const seamJoints = new Map<string, Joint>();
    for (const x of (d.backSeams ?? []) as Rec[]) {
      if (x.supportId)
        for (const id of x.partIds as string[]) {
          const key = `${id}/BACK-SEAM/${x.supportId}`,
            screws = backSeamScrews(x.from, x.to),
            seen = seamJoints.get(key);
          // A part under a shelf meets the parts above it that are split along (FINDINGS 2601): one joint, its screws along each.
          if (seen) {
            seen.stationsMm.push(...screws);
            continue;
          }
          const g = jointBase(key, 'SCREW', id, x.supportId, 'BACK_SEAM_SCREW');
          seamJoints.set(key, g);
          g.stationsMm = screws;
          g.reason = `Часть задника привинчена к торцу детали «${sourceById.get(x.supportId)?.name}» на стыке (MOD-DEC-701)`;
          g.visibility = { exposed: false, covered: true, internalPartition: false, role: 'BACK_SEAM' };
          g.connectionRole = 'BACK';
          g.drillingExemption = { decision: 'MOD-DEC-701', reason: 'Части задника привинчивают к торцу неподвижной полки при сборке саморезами 3,5 × 16 с шагом не больше 300 мм, присадку под них не рассчитываем' };
          joints.push(g);
        }
      else {
        const [a, b] = x.partIds as string[],
          g = jointBase(`${a}/H-PROFILE/${b}`, 'GROOVE_FIT', a!, b!, 'BACK_H_PROFILE');
        g.reason = 'Части задника встык в H-профиле: опоры на стыке нет (MOD-DEC-701)';
        g.visibility = { exposed: false, covered: true, internalPartition: false, role: 'BACK_H_PROFILE' };
        g.connectionRole = 'BACK';
        joints.push(g);
      }
    }
    // The front of a drawer is screwed to the front of its box (FRONT_FIX); the places are not given. The box of the kit
    // of the runner of the level has no front wall: the facade stands on the ends of its sides and bottom, its fixing
    // is not printed by the catalogue (MOD-DEC-514, FINDINGS 1863).
    for (const front of prototypeParts.filter((p) => p.moduleId === m.id && p.drawerId && isLeaf(p))) {
      const inner = prototypeParts.find((q) => q.drawerId === front.drawerId && q.name === 'Передняя стенка короба');
      for (const wall of inner ? [] : prototypeParts.filter((q) => q.drawerId === front.drawerId && q.drawerRunner && !/:box-rear$/.test(q.partId))) {
        const g = jointBase(`${wall.partId}->${front.partId}`, 'SCREW', wall.partId, front.partId, 'DRAWER_FRONT_FIX');
        g.reason = 'Фасад на торцах боковин и дна короба набора БАЗИС ' + wall.drawerRunner.article + ': крепёж и места не заданы, требуется подтверждение фурнитуры';
        g.visibility = { exposed: false, covered: true, internalPartition: false, role: 'drawer' };
        g.connectionRole = 'FRONT_FIX';
        joints.push(g);
      }
      if (!inner) continue;
      const g = jointBase(`${inner.partId}->${front.partId}`, 'SCREW', inner.partId, front.partId, 'DRAWER_FRONT_FIX');
      g.reason = front.drillingStatus;
      g.visibility = { exposed: false, covered: true, internalPartition: false, role: 'drawer' };
      g.connectionRole = 'FRONT_FIX';
      joints.push(g);
    }
  }
  // The seams of the worktops (K4, FINDINGS 509): the connectors HETTICH 79386 of each seam of the topology, a count
  // without places — the joint is planned, its drilling and its template are incomplete.
  // The bell names a worktop by its name and module (R4-004 of the tester), not by its id «m1:whole-worktop:run».
  const topName = (p: Rec) => `«${p.name}»${p.moduleId ? ' модуля ' + p.moduleId : ''}`;
  for (const top of prototypeParts.filter((p) => p.materialRole === 'WORKTOP' && partById.has(p.partId)))
    for (const j of top.worktopJoints ?? []) {
      if (!partById.has(j.withPartId)) continue;
      const g = jointBase(j.id, 'SCREW', top.partId, j.withPartId, 'HETTICH-AVB79386-W38');
      g.reason = `Стык столешниц: ${j.connectorQuantity} стяжки 79386, шов ${Number(j.lengthMm.toFixed(1))} мм; ${j.qualification}`;
      g.visibility = { exposed: false, covered: true, internalPartition: false, role: 'WORKTOP_SEAM' };
      joints.push(g);
      issue('DRILLING_INCOMPLETE', 'WARNING', `Стык столешниц ${topName(top)} и ${topName(prototypeParts.find((p) => p.partId === j.withPartId) ?? { name: j.withPartId })}: ${j.connectorQuantity} стяжки без шаблона и координат пазов (присадка неполная).`, { jointIds: [g.id] }, true);
    }
  // The topology of the worktops and the temporary values of K4 are remarks of the graph: a value the owner has not
  // chosen yet is temporary with a remark in the bell, not a HOLD (as the hinges of MOD-DEC-371, 372).
  for (const top of prototypeParts.filter((p) => p.materialRole === 'WORKTOP'))
    for (const t of top.topologyIssues ?? []) if (t.partIds?.[0] === top.partId) issue(t.code, 'WARNING', t.text, { partIds: (t.partIds as string[]).filter((id) => partById.has(id)) }, true);
  // A worktop cut at the wall (MOD-DEC-403, 410): a remark, blocking when the edge at its cutout is below the smallest
  // one (the worktop may break: move the module or take a smaller worktop); on the production documents the worktop is
  // made and fitted on site.
  for (const top of prototypeParts.filter((p) => p.materialRole === 'WORKTOP' && p.wallCut && partById.has(p.partId))) {
    issue('WORKTOP_TRIMMED_AT_WALL', 'WARNING', top.wallCut.text, { partIds: [top.partId] }, top.wallCut.cutoutEdgeShort);
    if (top.wallCut.onSite)
      installationRequirements.push({ id: `${top.partId}:on-site`, type: 'WORKTOP_ON_SITE', required: true, targetPartIds: [top.partId], selection: 'INSTALLER', text: 'Столешница у стены изготавливается и устанавливается по месту: длина — по замеру стены (MOD-DEC-410)' });
  }
  for (const r of records.filter((r) => r.derived.temporaryValues?.length))
    issue('KITCHEN_TEMPORARY_VALUE', 'WARNING', `Модуль ${r.module.id}: ${r.derived.temporaryValues.map((t: Rec) => `${t.text} (${t.finding})`).join(' ')}`, { partIds: moduleParts(r.module) }, false);
  const frontFix = joints.filter((j) => j.connectionRole === 'FRONT_FIX').map((j) => j.id);
  if (frontFix.length) issue('DRILLING_INCOMPLETE', 'WARNING', 'Крепление фасадов ящиков к коробам: места винтов не заданы — присадка неполная (MOD-DEC-277).', { jointIds: frontFix }, true);

  // ---- holes of the fasteners r7: the rules of the carcass (192, 292)
  const jointById = new Map(joints.map((j) => [j.id, j]));
  for (const p of prototypeParts)
    for (const o of p.operations ?? [])
      if (o.jointId && jointById.has(o.jointId))
        addOperation(hole({ ...o, partId: p.partId }, { jointId: o.jointId }, { source: 'RULE', sourceRef: null, completeness: 'COMPLETE', machiningRole: o.role, fastenerProfileId: jointById.get(o.jointId)!.profileId }));

  // ---- mechanisms
  const partsOfModule = (m: Rec) => prototypeParts.filter((p) => p.moduleId === m.id);
  const side = (m: Rec, k: 'L' | 'R') => (partById.has(`${m.id}:side:${k}`) ? [`${m.id}:side:${k}`] : []);
  const mechanism = (id: string, kind: MechanismKind, partIds: string[], assemblyId: string, catalogId: string, rest: Partial<Mechanism> = {}): Mechanism => {
    const x: Mechanism = {
      id,
      kind,
      partIds,
      assemblyId,
      profile: { catalogId, compatibilityProfileId: null, version: null },
      params: {},
      stationsMm: [],
      motionEnvelopes: [],
      capability: { status: 'PLACEHOLDER', reason: 'Кухня K3: физическая квалификация не выполнена' },
      quantity: 1,
      drillingExemption: null,
      ...rest,
    };
    mechanisms.push(x);
    return x;
  };
  const incomplete = new Set<string>();
  const pendingHinges: { id: string; doors: string[]; text: string }[] = [];
  for (const r of records) {
    const m = r.module,
      d = r.derived,
      hp = d.hardwarePlanning ?? {};
    // Hinges and lifts of the leaf groups: the shared mechanism (KF-07, KF-09, KF-10) or the BLUM profile of the prototype.
    for (const l of hp.leaves ?? []) {
      const doors = partsOfModule(m).filter((p) => isLeaf(p) && groupOf(p) === l.groupId).map((p) => p.partId),
        lift = l.profileId === LIFT_PROFILE,
        id = l.mechanismId ?? `${m.id}/${lift ? 'lift' : 'hinge'}/${l.groupId}`,
        x = mechanism(id, lift ? 'FACADE_LIFT' : 'HINGE', [...doors, ...(l.panelId ? [l.panelId] : []), ...(lift ? [...side(m, 'L'), ...side(m, 'R')] : [])], m.id, l.hingeId ?? l.profileId ?? 'UNKNOWN', {
          params: {
            ...scalars(l, ['hingeSide', 'mounting', 'position', 'cupEdgeDistanceMm', 'cupCentreFromEdgeMm', 'widthMm', 'heightMm', 'massKg', 'supportedMassKg', 'massBasis', 'openingAngleDeg', 'countBasis', 'status', 'profileId', 'commercialSku']),
            ...(l.demand ? { overlayMm: l.demand.overlayMm } : {}),
            ...(l.chart?.basis === 'MANUFACTURER' ? { chartRows: JSON.stringify(l.chart.rows) } : {}),
          },
          stationsMm: [...(l.stationsMm ?? [])],
          quantity: l.quantity ?? 0,
          // MOD-DEC-371, 372: a hinge not chosen yet is temporary with a remark, not a HOLD.
          capability: { status: 'PLACEHOLDER', reason: [...(l.issues ?? []), l.hingePending, 'Кухня K3: физическая квалификация не выполнена'].filter(Boolean).join(' ') },
        });
      if (l.hingePending) pendingHinges.push({ id: x.id, doors, text: l.hingePending });
      x.profile.compatibilityProfileId = l.plateId ?? null;
      if (!l.mechanismId || l.drilling?.completeness !== 'COMPLETE') incomplete.add(x.id);
      // A front on hinges in the top lifted by МДМ FLAP (MOD-DEC-413, FINDINGS 3350): the lift beside its hinges.
      const f = l.flap;
      if (!f) continue;
      const lifted = mechanism(f.mechanismId, 'FACADE_LIFT', [f.doorId, ...f.sideIds], m.id, f.liftId, {
          params: { liftRule: 'LEVEL_FLAP', tier: f.tier, article: f.article, series: f.series, loadValue: f.loadValue, openingAngleDeg: f.openingAngleDeg, temporary: f.temporary, hingeMechanismId: x.id, drillingShiftMm: f.drilling.shiftMm },
          quantity: f.quantity,
          capability: f.temporary || f.issues.length || f.drilling.completeness !== 'COMPLETE' ? { status: 'PLACEHOLDER', reason: [...f.issues, ...f.drilling.missing].join(' ') || null } : { status: 'RESOLVED', reason: null },
        }),
        refs = { partIds: [f.doorId], mechanismIds: [lifted.id] },
        unknown = f.open.filter((t: string) => !t.startsWith(f.series));
      if (f.drilling.completeness !== 'COMPLETE') incomplete.add(lifted.id);
      if (f.temporary) issue('LIFT_NOT_SELECTED', 'WARNING', `${lifted.id}: ${f.issues[0]} (INV-D18-01)`, refs, true);
      for (const t of f.issues.slice(f.temporary ? 1 : 0)) issue('LIFT_HINGE_ANGLE', 'WARNING', `${lifted.id}: ${t}`, { ...refs, mechanismIds: [lifted.id, x.id] }, false);
      if (unknown.length) issue('LIFT_DATA_UNKNOWN', 'WARNING', `${lifted.id}: подбор подъёмника не проверен полностью — ${unknown.join('; ')} (INV-D18-01)`, refs, true);
    }
    // MOD-DEC-485 (FINDINGS 3212): the latch of a door opened by pressing, in the front edge of the panel behind it; its
    // hole is the manufacturer's (277). A door without a place for it opens by nothing: a warning that blocks.
    for (const x of hp.pushDoors ?? []) {
      if (!x.latch) {
        issue('PUSH_LATCH_MISSING', 'WARNING', `${x.note}: без пружины и ручки дверь не открыть — нужна ручка или другой фасад (MOD-DEC-485)`, { partIds: partById.has(x.doorId) ? [x.doorId] : [] }, true);
        continue;
      }
      mechanism(x.latch.id, 'PUSH_LATCH', [x.latch.panelId, x.doorId].filter((id: string) => partById.has(id)), m.id, x.latch.latchId, {
        params: { article: x.latch.article, axisXMm: x.latch.xMm, axisElevationMm: x.latch.elevationMm },
        stationsMm: [x.latch.xMm],
        capability: { status: 'RESOLVED', reason: null },
      });
    }
    // MOD-AI-76 (FINDINGS 3214, 3216): the handle of each front, drawn in 3D; no drilling — the fitters drill for it
    // (MOD-DEC-158). An edge handle or a profile stands on the edge of its front; one with a groove of the catalogue
    // owns the groove along that edge, an operation of the front (the edge of the slot by where it lies in the part).
    const handles = kitchenHandlePlaces(s, m, d);
    if (handles?.places.length) {
      const o = modulePoint(m, [0, 0, 0]),
        dir = (q: number[]): Vec3 => clean(modulePoint(m, q).map((v, i) => Math.round(v - o[i]!)) as Vec3),
        frame: HandleFrame = { at: (x, y, z) => modulePoint(m, [x, z, y]), x: dir([1, 0, 0]), y: dir([0, 0, 1]), z: dir([0, 1, 0]) },
        h = handles.handle;
      for (const x of handles.places.filter((q) => partById.has(q.partId))) {
        const [cx, cy, cz] = x.centreMm,
          front = prototypeParts.find((p) => p.partId === x.partId),
          vertical = x.edge === 'LEFT' || x.edge === 'RIGHT';
        mechanism(x.id, 'HANDLE', [x.partId], m.id, h.id, {
          params: { article: h.article, orientation: x.orientation, centreXMm: cx, centreYMm: cy, centreZMm: cz, lengthMm: x.lengthMm, ...(x.edge ? { edge: x.edge, riseMm: h.edgeRiseMm?.value ?? null } : {}), priceRub: h.price?.rub ?? null },
          capability: { status: 'RESOLVED', reason: null },
          drillingExemption: { decision: 'MOD-DEC-158', reason: 'Присадку под ручки не рассчитываем: её делают монтажники; в 3D — модель ручки' },
          visuals: x.edge ? edgeHandleVisuals(`${x.id}-V`, x.partId, h, x.edge, x.lengthMm, vertical ? cx : cy, vertical ? cy : cx, x.frontZMm, frame) : [handleVisual(`${x.id}-V`, x.partId, h, x.orientation, cx, cy, cz, frame)],
        });
        const f = frames.get(x.partId);
        for (const gr of front?.grooves?.filter((g: Rec) => g.semantic === HANDLE_GROOVE) ?? []) {
          if (!f) continue;
          const lb = localBox(gr.localBox)!,
            pa = f.placement,
            a = localPoint(pa, modulePoint(m, [lb.x0, lb.y0, lb.z0])),
            b = localPoint(pa, modulePoint(m, [lb.x1, lb.y1, lb.z1])),
            lo = [0, 1, 2].map((i) => Math.min(a[i]!, b[i]!)),
            hi = [0, 1, 2].map((i) => Math.max(a[i]!, b[i]!)),
            size = partById.get(x.partId)!.finishedWithEdge,
            slot: EdgeSlot = near(lo[1]!, 0) && hi[0]! - lo[0]! > hi[1]! - lo[1]! ? 'A' : near(hi[1]!, size.widthMm) && hi[0]! - lo[0]! > hi[1]! - lo[1]! ? 'B' : near(lo[0]!, 0) ? 'C' : 'D',
            along: Groove['along'] = slot === 'A' || slot === 'B' ? 'LENGTH' : 'WIDTH',
            k = along === 'LENGTH' ? 0 : 1;
          addOperation({
            op: 'GROOVE',
            id: gr.id,
            partId: x.partId,
            face: null,
            edge: slot,
            along,
            startMm: lo[k]!,
            endMm: hi[k]!,
            offsetMm: (lo[2]! + hi[2]!) / 2,
            grooveWidthMm: hi[2]! - lo[2]!,
            grooveDepthMm: hi[1 - k]! - lo[1 - k]!,
            semanticType: HANDLE_GROOVE,
            purpose: gr.kind,
            owner: { mechanismId: x.id },
            resolution: { profileId: h.id, productionConfirmed: false, requiresTechnologyConfirmation: true },
            basis,
          });
        }
      }
    }
    for (const id of handles?.skipped ?? [])
      if (partById.has(id)) issue('HANDLE_EDGE_ON_GLASS', 'WARNING', `Фасад ${id} стеклянный: торцевую ручку или профиль ${handles!.handle.article} на стекло не ставим — фасад без ручки; нужна скоба или открывание нажатием.`, { partIds: [id] }, false);
    // Shelf supports (KF-08, MOD-DEC-344).
    for (const sp of hp.shelfSupports ?? [])
      mechanism(sp.id, 'SHELF_SUPPORT', [sp.shelfId, ...sp.panelIds.filter((id: string | null) => id && partById.has(id))], m.id, sp.supportId ?? 'UNKNOWN', {
        params: { ...scalars(sp, ['tier', 'axisMm', 'axisAboveLowerMm', 'movedFromMm']), shelfBoreFromEndMm: shelfBoreFromEnd(sp.scheme) },
        quantity: sp.quantity ?? 0,
        capability: sp.issues?.length ? { status: 'HOLD', reason: sp.issues.join(' ') } : { status: 'PLACEHOLDER', reason: 'Кухня K3: физическая квалификация не выполнена' },
      });
    // Drawers: the runner pair of each box (KF-17); its fixing has no depth in the prototype.
    const drawers = new Map<string, Rec[]>();
    for (const p of partsOfModule(m).filter((p) => p.drawerId)) drawers.set(p.drawerId, [...(drawers.get(p.drawerId) ?? []), p]);
    for (const [id, own] of drawers) {
      const box = own.filter((p) => p.motionKind === 'drawer-box'),
        r = box[0]?.drawerRunner,
        x = mechanism(`${id}/runner`, 'DRAWER_RUNNER', [...box.map((p) => p.partId), ...side(m, 'L'), ...side(m, 'R')], m.id, own[0]!.runnerProfile ?? 'UNKNOWN', {
          params: { ...scalars(own[0], ['boxInternalWidthMm', 'drawerOuterWidthMm', 'motionTravelMm']), ...(r ? { article: r.article, runnerRule: 'LEVEL_466', movingMassKg: r.massKg, loadKg: r.loadKg } : {}) },
          // MOD-DEC-514 (FINDINGS 1863): the runner of the level is a choice of 466 with the holes of its kit.
          ...(r ? { capability: { status: 'RESOLVED' as const, reason: null } } : {}),
        });
      if (!r) {
        incomplete.add(x.id);
        continue;
      }
      // Another runner than the level's is said (465); a drawer heavier than its pair holds is said.
      if (r.substitution) issue('HARDWARE_TIER_SUBSTITUTED', 'WARNING', `${id}: ${r.substitution} (MOD-DEC-465, 514)`, { mechanismIds: [x.id] }, false);
      if (r.massKg > r.loadKg) issue('DRAWER_LOAD', 'WARNING', `${id}: ящик с грузом ${fmt(r.massKg)} кг, пара ${r.article} держит ${fmt(r.loadKg)} кг (MOD-DEC-514)`, { mechanismIds: [x.id], partIds: box.map((p) => p.partId) }, false);
    }
    // The pull-out or the dryer of a module (khrMechanism): a factory template, no holes.
    if (hp.mechanism) {
      const x = mechanism(`${m.id}/mechanism`, m.moduleTypeId === 'KB_BOTTLE' ? 'DRAWER_RUNNER' : 'APPLIANCE', [...side(m, 'L'), ...side(m, 'R')], m.id, hp.mechanism.profileId ?? 'UNKNOWN', {
        params: scalars(hp.mechanism, ['status', 'commercialSku', 'assemblyDataStatus']),
        capability: hp.mechanism.issues?.length ? { status: 'HOLD', reason: hp.mechanism.issues.join(' ') } : { status: 'PLACEHOLDER', reason: 'Кухня K3: физическая квалификация не выполнена' },
      });
      incomplete.add(x.id);
    }
    // A wall unit hangs on its hangers (SAH216: the pins in the sides, the access through the back — numbers of the
    // prototype); a floor unit stands on its legs (MOD-DEC-180: 100 mm; the kit 9028286 with its pads when chosen).
    const own = partsOfModule(m),
      bearing = own.filter((p) => ['SIDE_PANEL_LEFT', 'SIDE_PANEL_RIGHT', 'VERTICAL_STRUCTURAL_PANEL', 'CARCASS_BOTTOM_PANEL', 'SUPPORT_PAD'].includes(roleOf(p)[0])).map((p) => p.partId);
    if (onTall(s, m)) {
      // MOD-DEC-566 п. 7 (FINDINGS 1610, (Д)): a new mezzanine stands on its tall cabinet, joined to it by four kits
      // 1054519 (hardware.ts); the cabinet with the mezzanine is fixed to the wall against tipping by the installer.
      const tall = moduleParts(s.modules.find((x) => x.id === m.supportId)!).filter((id) => /:(side:[LR]|top)$/.test(id));
      installationRequirements.push({ id: `${m.id}:wall-fixing`, type: 'WALL_ANCHORING', required: true, targetPartIds: [...bearing, ...tall], selection: 'INSTALLER', text: 'Пенал с антресолью крепится к стене от опрокидывания; крепёж выбирает монтажник: несущая способность стены не проверена' });
    } else if (HUNG.has(m.kind)) {
      // A new wall cabinet hangs on the hanger of the level with the holes of its kit (MOD-DEC-413, FINDINGS 2754).
      const lh = hp.hanger,
        pins = own.flatMap((p) => (p.operations ?? []).filter((o: Rec) => o.kind === 'SAH216 pin')),
        x = lh
          ? mechanism(`${m.id}/hangers`, 'SUSPENSION_RAIL', bearing, m.id, lh.id ?? 'UNKNOWN', {
              params: { hangerRule: 'LEVEL_413', tier: lh.tier, fixing: lh.fixing ?? null },
              quantity: lh.id ? 2 : 0,
              capability: lh.id && lh.drilling ? { status: 'RESOLVED', reason: null } : { status: 'PLACEHOLDER', reason: lh.id ? 'Присадка навеса не задана в каталоге' : 'Навес уровня не подобран — замечание' },
            })
          : mechanism(`${m.id}/hangers`, 'SUSPENSION_RAIL', bearing, m.id, m.hangerVariant ?? 'UNKNOWN', {
              quantity: pins.length,
              capability: { status: 'PLACEHOLDER', reason: m.hangerVariant ? 'Кухня K3: физическая квалификация не выполнена' : 'Навесы модуля не выбраны — замечание' },
            });
      if (lh ? !lh.id : !m.hangerVariant) issue('HANGERS_NOT_SELECTED', 'WARNING', `Модуль ${m.id}: навесы не выбраны — модуль не на чем повесить.`, { mechanismIds: [x.id] }, true);
      if (lh?.substitution) issue('HARDWARE_TIER_SUBSTITUTED', 'WARNING', `${x.id}: ${lh.substitution} (MOD-DEC-465, 413)`, { mechanismIds: [x.id] }, false);
      if (pins.length || (lh?.id && !lh.drilling)) incomplete.add(x.id);
      installationRequirements.push({ id: `${m.id}:wall-fixing`, type: 'WALL_ANCHORING', required: true, targetPartIds: x.partIds, selection: 'INSTALLER', text: 'Крепление навесного модуля к стене выбирает монтажник: несущая способность стены не проверена' });
    } else {
      const x = mechanism(`${m.id}/legs`, 'SUPPORT_LEG', bearing, m.id, m.supportKit ?? 'UNKNOWN', {
        params: { legHeightMm: m.floor, footWoodStackMm: d.footWoodStackMm ?? null },
        quantity: d.footPlateCount ?? 0,
        // KF-12: each foot of the kit with its plate occupies its place from the floor to the bottom (INV-M04).
        motionEnvelopes: d.footPlateCount ? footPlateBoxes(m).map(([x0, x1, , y1, z0, z1]) => graphBox(m, [x0!, x1!, -m.floor, y1!, z0!, z1!])) : [],
        capability: { status: 'PLACEHOLDER', reason: d.footPlateCount ? 'Кухня K3: физическая квалификация не выполнена' : 'Опоры модуля не выбраны — замечание' },
      });
      if (!d.footPlateCount) issue('LEGS_NOT_SELECTED', 'WARNING', `Модуль ${m.id}: опоры не выбраны — прототип не считает ножки без комплекта 9028286.`, { mechanismIds: [x.id] }, true);
    }
    // Appliances (K4, FINDINGS 507): the bought appliance is a mechanism with its envelope, not a part of the cutting.
    // KF-24 is kept: the envelope is the prototype's box by the front frame over the whole depth, so it reaches into the
    // niche that holds it (the sides it is screwed to, the shelf it stands on, the front before it) and into the worktop
    // a sink or a hob stands in; those are the parts of the appliance. A part of another module in its box is a conflict
    // (INV-M04). The fronts coupled to it are its own as before: their hinge belongs to the appliance.
    const fronts = partsOfModule(m).filter((p) => p.applianceFront || p.coupledApplianceId || /^appliance-/.test(p.motionKind ?? '')),
      envelopes: Rec[] = d.applianceEnvelopes ?? [];
    if (fronts.length || envelopes.length) {
      // A sink or a hob lies on the worktop by its rim and passes through its cutout: under the top its envelope is the
      // cutout of the module's own worktop, not the rim over the neighbours (the box of the prototype stays in the data).
      const apertures = (d.parts ?? []).flatMap((p: Rec) => (p.materialRole === 'WORKTOP' ? (p.apertures ?? []) : [])),
        envelopeBox = (e: Rec): number[] => {
          const a = ['sink', 'hob'].includes(e.family) ? apertures.find((x: Rec) => x.kind === e.family + '-cutout') : null,
            [, , y0, y1] = e.box;
          return a ? [a.x, a.x + a.width, y0, y1, a.z, a.z + a.depth] : e.box;
        },
        reservations = envelopes.map((e) => graphBox(m, envelopeBox(e))),
        boxes = reservations.map(boxToAabb),
        reached = (p: Rec) => partById.has(p.partId) && boxes.some((b) => boxHitsPart(b, partById.get(p.partId)!, TOL)),
        host = partsOfModule(m).filter((p) => !fronts.includes(p) && p.materialRole !== 'WORKTOP' && reached(p)),
        tops = prototypeParts.filter((p) => p.materialRole === 'WORKTOP' && reached(p)),
        x = mechanism(`${m.id}/appliance`, 'APPLIANCE', [...fronts, ...host, ...tops].map((p) => p.partId), m.id, m.moduleTypeId, {
          params: envelopes.length ? { appliances: JSON.stringify(envelopes.map((e) => ({ id: e.id, model: e.model ?? null, family: e.family, dimensionsMm: e.dimensionsMm }))) } : {},
          quantity: Math.max(1, envelopes.length),
          motionEnvelopes: reservations,
        });
      if (fronts.some((p) => (p.operations ?? []).length)) incomplete.add(x.id);
    }
  }
  const mechanismById = new Map(mechanisms.map((x) => [x.id, x]));

  // ---- holes of the mechanisms: the kit or the catalogue (277); numbers of the prototype marked incomplete
  const prototypeRef = (kind: string) => `r1.html kre/kap: ${kind} (FINDINGS 328)`;
  /** The holes of temporary values: what the owner chooses yet (a remark, not a refusal). */
  const temporary: string[] = [];
  for (const p of prototypeParts) {
    const f = frames.get(p.partId)!,
      m = moduleOf.get(p.moduleId)!;
    for (const o of p.operations ?? []) {
      if (o.jointId) continue;
      if (o.mechanismId && mechanismById.has(o.mechanismId)) {
        addOperation(
          hole({ ...o, partId: p.partId }, { mechanismId: o.mechanismId }, { source: o.holeSource, sourceRef: o.holeSourceRef ?? null, completeness: o.completeness === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE', machiningRole: o.machiningRole, fastenerProfileId: mechanismById.get(o.mechanismId)!.profile.catalogId }),
        );
        continue;
      }
      // Hangers, the washer cup, the runner fixings: places of the prototype on the finished part, in its own datum.
      const at = prototypeHole(p, f, o);
      if (!at) continue;
      const lift = o.kind === LIFT_PEG ? (records.find((r) => r.module === m)?.derived.hardwarePlanning?.leaves ?? []).find((l: Rec) => l.groupId === o.liftGroupId) : null,
        owner = /^SAH216/.test(o.kind) ? `${m.id}/hangers` : o.kind === RUNNER_FIXING ? `${String(o.id).split(':runner:')[0]}/runner` : lift ? (lift.mechanismId ?? `${m.id}/lift/${lift.groupId}`) : `${m.id}/appliance`;
      if (!mechanismById.has(owner)) continue;
      if (lift) prototypeOperation(p, f, owner, o.kind, at, o.diameter, o.depth, null, `catalog/kitchen/hardware-profiles: ${LIFT_PROFILE} pegDrilling (FINDINGS 328)`);
      else prototypeOperation(p, f, owner, o.kind, at, o.diameter, at.through ? null : (o.depth ?? at.depth), o.qualification, prototypeRef(o.kind));
    }
  }

  // The cut-outs of the back for the hanger of the level at the upper corners (its kit, FINDINGS 2754): through the back.
  for (const p of prototypeParts)
    for (const c of p.hangerNotches ?? []) {
      if (!mechanismById.has(c.mechanismId)) continue;
      const f = frames.get(p.partId)!,
        m = moduleOf.get(p.moduleId)!,
        lb = localBox(c.localBox)!,
        a = localPoint(f.placement, modulePoint(m, [lb.x0, lb.y0, lb.z0])),
        b = localPoint(f.placement, modulePoint(m, [lb.x1, lb.y1, lb.z1])),
        range = (i: number): [number, number] => [Math.min(a[i]!, b[i]!), Math.max(a[i]!, b[i]!)];
      addOperation({ op: 'NOTCH', id: c.id, partId: p.partId, uRangeMm: range(0), vRangeMm: range(1), nRangeMm: range(2), purpose: 'Вырез задника под навес', owner: { mechanismId: c.mechanismId }, basis });
    }

  /** A hole of a number of the prototype: source PROTOTYPE, never complete, its owner is «присадка неполная» (277). */
  function prototypeOperation(p: Rec, f: Frame, owner: string, kind: string, at: { u: number; v: number; face: 'N_POS' | 'N_NEG'; through: boolean }, diameter: number, depth: number | null, status: string | null, sourceRef: string) {
    addOperation({
      op: 'HOLE',
      id: `${p.partId}/${kind}/${operations.filter((x) => x.partId === p.partId).length}`,
      partId: p.partId,
      mode: 'FACE',
      face: at.face,
      edge: null,
      xMm: at.u,
      yMm: at.v,
      diameterMm: diameter,
      depthMm: depth,
      through: at.through,
      layer: 'DRILL',
      machiningRole: kind,
      purpose: kind,
      code: kind,
      owner: { mechanismId: owner },
      fastenerProfileId: mechanismById.get(owner)!.profile.catalogId,
      axisOffsetMm: null,
      entryMm: placePoint(f.placement, at.u, at.v, at.face === 'N_POS' ? f.T : 0),
      inwardNormal: (at.face === 'N_POS' ? f.placement.nAxis.map((x) => -x) : [...f.placement.nAxis]) as Vec3,
      stationMm: null,
      source: 'PROTOTYPE',
      sourceRef,
      completeness: 'UNKNOWN_AWAITING_OWNER',
      status: status ?? 'ENGINEERING_DRAFT',
      basis,
    });
    incomplete.add(owner);
    if (kind === RUNNER_FIXING || kind === LIFT_PEG) temporary.push(kind);
  }

  /** A point of the module's box on the inner face of a side: x of that face, y up, z from the front. */
  function sideFace(p: Rec, f: Frame, y: number, z: number): { u: number; v: number; face: 'N_POS' | 'N_NEG'; through: boolean } {
    const m = moduleOf.get(p.moduleId)!,
      pb = localBox(p.box)!,
      [u, v, n] = localPoint(f.placement, modulePoint(m, [p.partId.endsWith(':L') ? pb.x1 : pb.x0, y, z]));
    return { u, v, face: near(n, 0) ? 'N_NEG' : 'N_POS', through: false };
  }

  /** The place of a hole the prototype gives in the datum of the part (SAH216, the washer's cup, TANDEM), or null. */
  function prototypeHole(p: Rec, f: Frame, o: Rec): { u: number; v: number; face: 'N_POS' | 'N_NEG'; through: boolean; depth?: number } | null {
    const m = moduleOf.get(p.moduleId)!;
    if (o.kind === RUNNER_FIXING) {
      // The prototype gives no depth: temporarily the length of the screw of the kit (FINDINGS 328), a remark.
      const depth = PROFILE[m.drawerProfile]?.cabinetFixing?.fastenerDimensionMm?.at(-1);
      return Number.isFinite(depth) ? { ...sideFace(p, f, o.y, o.fromFront), depth } : null;
    }
    if (o.kind === 'SAH216 pin') {
      // The inner face of the side, fromTop along the height, fromFront along the depth.
      const pb = localBox(p.box)!,
        inner = modulePoint(m, [p.partId.endsWith(':L') ? pb.x1 : pb.x0, pb.y0, pb.z0]),
        n = localPoint(f.placement, inner)[2]!;
      return { u: f.L - o.fromTop, v: o.fromFront, face: near(n, 0) ? 'N_NEG' : 'N_POS', through: false };
    }
    if (o.kind === 'SAH216 access') return { u: o.x, v: f.W - o.fromTop, face: 'N_NEG', through: true };
    // The pegs of the lift HK-S: from the top of the cabinet and from its front (catalog/kitchen/hardware-profiles).
    if (o.kind === LIFT_PEG) return sideFace(p, f, m.height - o.fromTop, o.fromFront);
    if (Number.isFinite(o.x) && Number.isFinite(o.y)) return { u: o.x, v: o.y, face: 'N_POS', through: false };
    return null;
  }

  // ---- what stays open: drilling of the owner, the qualification of the kitchen
  const prototypeOps = operations.filter((o): o is Hole => o.op === 'HOLE' && o.source === 'PROTOTYPE').map((o) => o.id);
  if (incomplete.size)
    issue('DRILLING_INCOMPLETE', 'WARNING', 'Присадка фурнитуры неполная: у особых петель BLUM (стекло, диагональ, угол 155°, складная створка), направляющих TANDEM, подъёмника HK-S, выдвижных механизмов, навесов SAH216 и техники нет комплекта и страницы каталога в проекте. Где прототип даёт числа, они стоят временно; фурнитуру подбирает владелец (MOD-DEC-277).', { mechanismIds: [...incomplete], operationIds: prototypeOps }, true);
  if (pendingHinges.length)
    issue('HINGE_NOT_SELECTED', 'WARNING', `Петли не подобраны, стоят временные (подбирает владелец): ${pendingHinges.length} шт. — ${[...new Set(pendingHinges.map((x) => x.text))].join(' ')}`, { mechanismIds: pendingHinges.map((x) => x.id), partIds: pendingHinges.flatMap((x) => x.doors) }, true);
  const runners = temporary.filter((k) => k === RUNNER_FIXING).length,
    pegs = temporary.filter((k) => k === LIFT_PEG).length;
  if (runners || pegs)
    issue('HARDWARE_TEMPORARY_VALUE', 'WARNING', `Временные значения до подбора фурнитуры: ${[runners ? `крепление направляющих TANDEM к боковинам — ${runners} отв., глубина по длине шурупа комплекта` : '', pegs ? `штифты подъёмника HK-S — ${pegs} отв. по профилю прототипа` : ''].filter(Boolean).join('; ')}.`, { operationIds: operations.filter((o) => o.op === 'HOLE' && [RUNNER_FIXING, LIFT_PEG].includes(o.code)).map((o) => o.id) }, true);
  // MOD-AI-76 (FINDINGS 3217): an edge handle in front of the face of its front, in the way of the door beside it.
  const derivedOf = new Map(records.map((r) => [r.module.id, r.derived]));
  for (const x of kitchenHandleSweeps(s, (m) => derivedOf.get(m.id)!))
    if (partById.has(x.partId) && partById.has(x.doorId))
      issue('HANDLE_DOOR_SWEEP', 'WARNING', `Ручка на фасаде ${x.partId} выступает вперёд на ${fmt(x.forwardMm)} мм: дверь ${x.doorId} при открывании заходит на неё (упрощённая схема петли — поворот вокруг наружного ребра петлевой кромки). Нужна другая ручка, ограничитель угла петли или сторона петель.`, { partIds: [x.partId, x.doorId], mechanismIds: [x.handleId] }, false);
  for (const r of records) {
    const open = [...new Set((r.derived.releaseOpenFields ?? []).map((f: Rec) => `${f.field} — ${f.message}`))];
    if (open.length) issue('KITCHEN_OPEN_FIELD', 'INFO', `${r.module.id}: ${open.join('; ')}`, { partIds: moduleParts(r.module) }, false);
  }
  // MOD-AI-44: the hood over a hob — the clearance and the width of the Bosch sheet; a hood too low blocks the readiness.
  for (const r of hoodOverHobRemarks(s, records))
    issue('HOOD_OVER_HOB', 'WARNING', r.text, { partIds: s.modules.filter((m) => r.moduleIds.includes(m.id)).flatMap(moduleParts) }, r.blocks);
  // MOD-AI-62, MOD-DEC-749: a wall cabinet closer than 450 mm to the worktop under it — advice, the readiness is not blocked.
  for (const r of upperGapRemarks(s, records)) issue('UPPER_OVER_WORKTOP', 'WARNING', r.text, { partIds: s.modules.filter((m) => r.moduleIds.includes(m.id)).flatMap(moduleParts) }, false);
  // MOD-DEC-573: the material of the facades against the catalogue of the release; a front of a module that fixes its own
  // thickness (a corner kit) against the execution; the cups of a bought front are drilled by the supplier (277).
  for (const t of kitchenFacadeProblems(s)) issue('FACADE_MATERIAL_CATALOG', 'WARNING', `Материал фасадов: ${t} — выберите материал фасадов заново (MOD-DEC-573).`, {}, true);
  const chosenT = facadeChoiceThickness(s),
    chosenFronts = parts.filter((x) => sourceById.get(x.id)?.facadeMaterialId);
  if (chosenT !== null)
    for (const m of s.modules) {
      const own = chosenFronts.filter((x) => x.assemblyId === m.id && x.material.panelThicknessMm !== chosenT);
      if (own.length) {
        const t = [...new Set(own.map((x) => x.material.panelThicknessMm))].join(', ');
        issue('FACADE_MATERIAL_THICKNESS', 'WARNING', `Модуль ${m.id}: фасад ${t} мм — толщина, которую требует модуль, а исполнение «${kitchenFacadeTitle(s.facadeChoice!)}» — ${chosenT} мм; выберите исполнение толщиной ${t} мм или другой модуль (MOD-DEC-573).`, { partIds: own.map((x) => x.id) }, true);
      }
    }
  const bought = chosenFronts.filter((x) => x.supply === 'PURCHASED');
  if (bought.length) issue('FACADE_SUPPLIER_DRILLING', 'INFO', `Фасады готовые покупные (${kitchenFacadeTitle(s.facadeChoice!)}): чашки петель сверлит поставщик по схемам петель, на корпусе — отверстия планок (MOD-DEC-277).`, { partIds: bought.map((x) => x.id) }, false);
  issue('PHYSICAL_QUALIFICATION', 'INFO', 'Кухня K3: детали и присадка — номинальный черновик; физическая проверка и выпуск в производство не выполнены.', {}, true);
  capabilities.push({ capability: 'KITCHEN_MODULES', status: 'HOLD', reasons: ['Кухня K3: физическая и станочная квалификация не выполнены'] });

  // ---- envelope
  const boxes = parts.map((p) => boxOf(p.id)),
    min = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]!))) as Vec3,
    max = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]!))) as Vec3;
  assemblies[0]!.box = parts.length ? { minMm: min, sizeMm: sub(max, min) } : { minMm: [0, 0, 0], sizeMm: [0, 0, 0] };
  const leftWall = s.type !== 'straight' && !(s.type === 'l' && s.orientation === 'right'),
    rightWall = s.type === 'u' || (s.type === 'l' && s.orientation === 'right');

  // MOD-DEC-325, 743: an edge left without a band by hand, a manual band of a part the kitchen has no more — in the bell.
  unresolved.push(...manualBandIssues({ parts }, s.edgeOverrides));

  return {
    product: 'KITCHEN',
    versions: {
      engine: ENGINE_CONTRACT_VERSION,
      generator: KITCHEN_GENERATOR,
      ruleSet: RULE_SET_VERSION,
      policies: Object.fromEntries(POLICY_MODULES.map((p) => [p.id, p.version])),
      catalog: KITCHEN_RULE_SET,
      hardwareCatalog: { ...s.hardware.release },
      // K5: the rates of the project are the price snapshot of the kitchen (MOD-DEC-028, FINDINGS 573).
      priceSnapshotId: contentDigest([kitchenRateSettings(s.costSettings), kitchenCardId(s.hardware)]),
      dimensionRule: KITCHEN_RULE_SET,
    },
    // K5: the ProjectRevision every output of the kitchen carries (INV-S04, FINDINGS 573).
    revision: { projectRevisionId: kitchenRevision(s) },
    coordinateSystem: 'X_RIGHT_Y_BACK_Z_UP_MM',
    envelope: parts.length
      ? { widthMm: max[0] - min[0], heightMm: max[2] - min[2], depthMm: max[1] - min[1], installedHeightMm: max[2], installationOffsetMm: min[2] }
      : // An empty kitchen is the room (Д): G05 has no parts to compare, G01 asks for a positive envelope.
        { widthMm: s.room.width, heightMm: s.room.height, depthMm: s.room.depth, installedHeightMm: 0, installationOffsetMm: 0 },
    site: {
      room: { widthMm: s.room.width, heightMm: s.room.height, depthMm: s.room.depth },
      walls: { left: leftWall, right: rightWall, back: true },
      roomSkirting: null,
      wallGapMm: 0,
    },
    assemblies,
    parts,
    operations,
    joints,
    mechanisms,
    loads: [],
    unresolved,
    result: aggregateResult(unresolved, capabilities, installationRequirements, false),
  };
}
