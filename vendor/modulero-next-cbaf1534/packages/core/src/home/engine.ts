// "Other furniture" on the graph contract of the unified engine (task E2, MIGRATION_PLAN step 3.2).
//
// An adapter, not a new generator: the physical graph of home-physical-r3 (graph.ts), its drilling (joinery.ts),
// its hardware list and its unresolved questions (outputs.ts) are translated into the engine Graph
// (engine/contract.ts). None of them is changed, so every output of "other furniture" stays byte-for-byte.
// Placement and sizes of every part are the prototype's: the part box is origin_mm + extent_mm along the positive
// axes, finishedWithEdge is finished_uv_mm × thickness_mm, the finished part F is cut_uv_mm. The graph is built
// only from a project that passes validate() (H-16, `fromValidatedInput`).
//
// The invariant library finds in the graph of an r3 project only the known defects of r3 (HOME_KNOWN_VIOLATIONS).
// Task H1 fixes them in the rule set r4 (engine/policy/home.ts): its graph has no known violations, its hardware holes
// are numbers of the prototype marked «присадка неполная» (PROTOTYPE, DRILLING_INCOMPLETE; MOD-DEC-277).
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import {
  ENGINE_CONTRACT_VERSION,
  type Allowance,
  type Assembly,
  type CapabilityResolution,
  type CarcassFrame,
  type ConnectionRole,
  type EdgeBand,
  type EdgeSlot,
  type Graph,
  type Groove,
  type Hole,
  type InstallationRequirement,
  type Joint,
  type Load,
  type Mechanism,
  type Part,
  type PartRole,
  type PhysicalEdge,
  type PlacementProfile,
  type StructuralRole,
  type Unresolved,
  type Vec3,
} from '../engine/contract.js';
import { aggregateResult, deriveDimensionChain, fromValidatedInput } from '../engine/graph.js';
import type { BoardRef } from '../engine/invariants/checks.js';
import { HOME_R3, homePolicyVersions, homeRules } from '../engine/policy/home.js';
import { contentDigest } from '../project/digest.js';
import { materials } from './catalog.js';
import { legVisuals } from '../wardrobe/fittings.js';
import { aFront, availableBays, backDepthMm, bay, cableOutletOf, foot, hdfBackOf, hdfDrawerBottomOf, hdfRebateBox, sideFoot, topT } from './geometry.js';
import { DRAWER_WALL_ROLES, HDF_BACK_MATERIAL, partNames, physicalGraph, REBATE_ROLES } from './graph.js';
import { joinery } from './joinery.js';
import { FRONT_ROLES, homeFacadeProblems, homeFacadeTitle, homeFrontFamily } from './facades.js';
import { mfLabel } from '../engine/policy/materials.js';
import { homeHandles, homeLegs, homeShelfSupport, shelfSupportCapacityKg, type HomeShelfSupport } from './mechanisms.js';
import { hardware, issues, issueText, loadSummary } from './outputs.js';
import type { AxisIndex, Body, GraphPart, Hole as HomeHole, HomeProject, Joint as HomeJoint, SemanticRole } from './types.js';
import { validate } from './validate.js';

/** Unresolved overloads of a mechanism or a support: they block production (§2.9; shelf supports in r4 — 368). */
const OVERLOAD_CODES = new Set(['DRAWER_LOAD', 'SHELF_SUPPORT_LOAD']);
/** Questions of the runner of a drawer: its overload and its substitution for the runner of the level (r5, FINDINGS 1755). */
const RUNNER_CODES = new Set(['DRAWER_LOAD', 'DRAWER_RUNNER_SUBSTITUTED']);
const HINGE_BLOCKING_CODES = new Set(['HINGE_CHART', 'HINGE_SHELF']);
/** r5: a removable shelf without a support of its level, or off the grid, is not made (FINDINGS 844, 845). */
const SUPPORT_BLOCKING_CODES = new Set(['SHELF_SUPPORT_MISSING', 'SHELF_SYSTEM32_OFF_GRID']);
/** r5: legs of a height no leg of the catalogue gives are a placeholder and block production, as in the wardrobe (480; FINDINGS 947). */
const LEG_BLOCKING_CODES = new Set(['LEGS_TEMPORARY']);

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
const FACE_NAMES = [
  ['left', 'right'],
  ['front', 'back'],
  ['bottom', 'top'],
];
/** Family of a panel by its normal, as the wardrobe names it (file 04). */
const FAMILIES = ['verticalDepth', 'frontal', 'horizontalDepth'];

/** Role of each r3 part in the contract (ENGINE.md §2.3); a bearing side is LEFT or RIGHT by its key. */
const ROLES: Readonly<Record<SemanticRole, [PartRole, StructuralRole]>> = {
  continuous_top: ['TOP_COVER_PANEL', 'LOAD_BEARING'],
  bearing_side: ['SIDE_PANEL_LEFT', 'LOAD_BEARING'],
  // The shared vertical of a desk is the right side of its pedestal (module), full height like a side.
  bearing_shared_side: ['SIDE_PANEL_RIGHT', 'LOAD_BEARING'],
  bearing_divider: ['PARTITION', 'LOAD_BEARING'],
  bottom: ['CARCASS_BOTTOM_PANEL', 'LOAD_BEARING'],
  structural_back: ['BACK_PANEL', 'STRUCTURAL'],
  // r5 (MOD-DEC-515): the back of HDF in a rebate bears nothing, as the back of the wardrobe.
  hdf_back: ['BACK_PANEL', 'NON_STRUCTURAL_BACK'],
  rear_apron: ['REAR_APRON', 'STRUCTURAL'],
  fixed_shelf: ['FIXED_SHELF', 'STRUCTURAL_SHELF'],
  adjustable_shelf: ['ADJUSTABLE_SHELF', 'NONE'],
  door: ['HINGED_FACADE_LEAF', 'FACADE'],
  drawer_front: ['DECORATIVE_FACADE', 'FACADE'],
  drawer_inner_front: ['STRUCTURAL_FRONT', 'DRAWER_BOX'],
  drawer_side: ['DRAWER_BOX_SIDE', 'DRAWER_BOX'],
  drawer_back: ['DRAWER_BOX_BACK', 'DRAWER_BOX'],
  drawer_bottom: ['DRAWER_BOTTOM_PANEL', 'DRAWER_BOX'],
  floor_pad: ['SUPPORT_PAD', 'LOAD_TRANSFER'],
  // r5 (MOD-DEC-516): a rail of the plinth carries the bottom to the floor, as the wardrobe's (loadTransferPanel).
  plinth_rail: ['PLINTH_PANEL', 'LOAD_TRANSFER'],
};

/** r3 edge keys: 0 and 1 bound the length (u), 2 and 3 the width (v) — cut_uv_mm = finished − edge[0] − edge[1], … */
const EDGE_KEYS: Readonly<Record<EdgeSlot, string>> = { A: '2', B: '3', C: '0', D: '1' };
/** The slots of a hinged leaf of r5, whose u axis is its height. */
const LEAF_EDGE_KEYS: Readonly<Record<EdgeSlot, string>> = { A: '0', B: '1', C: '2', D: '3' };

/** Machining role of each r3 hole kind. */
const MACHINING_ROLES: Readonly<Record<string, string>> = {
  CAM: 'CAM',
  CHANNEL: 'CHANNEL',
  STUD: 'STUD',
  WOOD_EDGE: 'DOWEL_EDGE',
  WOOD_FACE: 'DOWEL_FACE',
  CONFIRMAT_THROUGH: 'THROUGH_HOLE',
  CONFIRMAT_EDGE: 'PILOT_BLIND_HOLE',
  HINGE_CUP: 'CUP',
  HINGE_CUP_SCREW_SPOT: 'CUP_SCREW',
  HINGE_PLATE_SCREW_SPOT: 'PLATE',
  HINGE_CUP_FIXING: 'CUP_FIXING',
  HINGE_PLATE: 'PLATE',
  SHELF_PIN: 'SHELF_PIN',
  // r5: the supports of the wardrobe (FINDINGS 844, 845) — the roles of the scheme of the catalogue.
  SHELF_SUPPORT_HOLE: 'SHELF_SUPPORT_HOLE',
  SHELF_SUPPORT_SCREW: 'SHELF_SUPPORT_SCREW',
  SHELF_BORE: 'SHELF_BORE',
  SHELF_BORE_STEP: 'SHELF_BORE_STEP',
  RUNNER_SCREW_SPOT: 'RUNNER_SCREW',
  // r5 (FINDINGS 1750): the holes of the kit of a concealed runner — in the side panel and of its rear hooks in the back.
  RUNNER_FIXING: 'RUNNER_SCREW',
  RUNNER_HOOK: 'RUNNER_HOOK',
  // r5 (MOD-DEC-574, FINDINGS 1307): the cable outlet in the back of a TV unit.
  CABLE_OUTLET: 'CABLE_OUTLET',
};

/** Where an r3 joint is in the carcass (`orientation` of graph.ts) → contract value (MOD-DEC-314). */
const CONNECTION_ROLES: Readonly<Record<string, ConnectionRole>> = {
  top: 'TOP',
  bottom: 'BOTTOM',
  back: 'BACK',
  'back-bottom': 'BACK_BOTTOM',
  'back-top': 'BACK_TOP',
  apron: 'APRON',
  'divider-bottom': 'DIVIDER_BOTTOM',
  shelf: 'SHELF',
  'box-front': 'BOX_FRONT',
  // The back and the bottom of a drawer box on confirmats (MAKMART_S16).
  confirmat: 'BOX_CONFIRMAT',
  'plinth-front': 'PLINTH',
  'plinth-rear': 'PLINTH',
};

/** Station pattern of an r3 joint that is not the default one (`placementProfile` of joinery.ts) → contract value. */
const PLACEMENT_PROFILES: Readonly<Record<string, PlacementProfile>> = {
  shared_shelf_pattern: 'SHARED_SHELF_PATTERN',
  desk_shared_back_apron_exception: 'DESK_SHARED_BACK_APRON_EXCEPTION',
  // r4: a joint narrower than 200 mm by MOD-DEC-364 (FINDINGS 385).
  narrow_joint_364: 'NARROW_JOINT_364',
};

/** An r3 value through its map; a value the map does not know is an error of the adapter, not a silent string. */
function mapped<T>(map: Readonly<Record<string, T>>, value: string, what: string): T {
  const v = map[value];
  if (v === undefined) throw new Error(`home → engine: unknown ${what} «${value}»`);
  return v;
}

/** MOD-DEC-276: the screw spots of a hinge are marking (r3 gives them depth 0), the machine does not drill them. */
const MARKING_KINDS: ReadonlySet<string> = new Set(['HINGE_CUP_SCREW_SPOT', 'HINGE_PLATE_SCREW_SPOT', 'RUNNER_SCREW_SPOT']);

const DRAWER_BOX_ROLES: ReadonlySet<SemanticRole> = new Set(['drawer_side', 'drawer_inner_front', 'drawer_back', 'drawer_bottom']);

/** Board of the drawer boxes: r3 prices it apart («Плита коробок ящиков 16 мм», rate `board16`). */
export const DRAWER_BOX_BOARD = 'home-drawer-box-16';

/** r5 (MOD-DEC-515): the HDF of the back in a rebate, 4 mm as the back of the wardrobe (287). */
export const HDF_BACK_BOARD = 'home-back-hdf-4';

/** Board catalogue of r3 for INV-G02: each decor at its own thickness and the drawer box board. */
export function homeBoards(): BoardRef[] {
  return [
    ...materials.map((m) => ({ variantId: m.id + '-' + m.thickness, panelThicknessMm: m.thickness, sheetFormatMm: null })),
    { variantId: DRAWER_BOX_BOARD, panelThicknessMm: 16, sheetFormatMm: null },
    { variantId: HDF_BACK_BOARD, panelThicknessMm: 4, sheetFormatMm: null },
  ];
}

/** The prototype cuts F directly (cut_uv_mm = finished − nominal edge): zero allowances, not verified (FINDINGS 110). */
const r3Allowance = (): { length: Allowance; width: Allowance } => {
  const a = (): Allowance => ({ minusMm: 0, plusMm: 0, source: { kind: 'PROTOTYPE', ref: 'home-physical-r3 cut_uv_mm = finished_uv_mm − кромка', finding: 'FINDINGS 110' } });
  return { length: a(), width: a() };
};


/**
 * Known violations of the r3 graph, `INV-…:CODE` → defect and task (ENGINE_DEFECTS.md). They wait for task H1;
 * the list can only shrink. Each entry is seen on the golden masters or the differential chains (engine.home.test.ts).
 */
export const HOME_KNOWN_VIOLATIONS: Readonly<Record<string, { defect: string; task: 'H1' }>> = {
  // Drawer fronts and doors are 18 mm on a 16 mm board: a board that the catalogue does not have.
  'INV-G02:MATERIAL_NOT_IN_CATALOG': { defect: 'H-01', task: 'H1' },
  // Shelf pins on both sides of a 16 mm partition at one height: no material between them.
  'INV-H03:OPPOSED_BREAK_THROUGH': { defect: 'H-02', task: 'H1' },
  // Intersecting bores are only an issue, the project is not blocked.
  'INV-H04:HOLE_OVERLAP': { defect: 'H-04', task: 'H1' },
  'INV-H04:HOLE_DUPLICATE': { defect: 'H-04', task: 'H1' },
  // A narrow drawer box (inner front ≈ 72 mm): the edge bores from the left and the right side meet in the middle.
  'INV-H04:HOLE_FACE_EDGE_CROSS': { defect: 'H-04', task: 'H1' },
  // MOD-DEC-277: no runner and front-fixing marks, no «присадка неполная», catalogue holes without a reference.
  'INV-H06:MECHANISM_WITHOUT_HOLES': { defect: 'H-05', task: 'H1' },
  'INV-H06:JOINT_WITHOUT_HOLES': { defect: 'H-05', task: 'H1' },
  'INV-H06:CATALOG_WITHOUT_REF': { defect: 'H-05', task: 'H1' },
  // A body raised above the floor: its pads are in the air.
  'INV-G07:BODY_NOT_SUPPORTED': { defect: 'H-06', task: 'H1' },
};

/** Known violations of the graph of a project: r3 keeps the list above, r4 (task H1) has none. */
export const homeKnownViolations = (p: HomeProject): Readonly<Record<string, { defect: string; task: 'H1' }>> =>
  homeRules(p).generator === HOME_R3 ? HOME_KNOWN_VIOLATIONS : {};

/** Problems of a project for the graph: the message of validate(), or none (H-16: no graph from an invalid project). */
export function homeValidationProblems(p: HomeProject, hw: HardwareCatalogs): string[] {
  try {
    validate(p, hw);
    return [];
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
}

/** Engine graph of an "other furniture" project; refuses an invalid project with the text of validate(). */
export function homeEngineGraph(p: HomeProject, hw: HardwareCatalogs): Graph {
  return fromValidatedInput(p, (q) => homeValidationProblems(q, hw), (q) => buildHomeGraph(q, hw));
}

/** Scalars of a prototype record as mechanism params; arrays and objects flattened as `key.0`, `key.sub`. */
function flatten(record: Record<string, unknown>, skip: readonly string[], prefix = ''): Record<string, number | string | boolean | null> {
  const out: Record<string, number | string | boolean | null> = {};
  for (const [k, v] of Object.entries(record)) {
    if (skip.includes(k)) continue;
    if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) out[prefix + k] = v as number | string | boolean | null;
    else if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, [], prefix + k + '.'));
  }
  return out;
}

/** r5 (FINDINGS 844, 845): the params of a shelf support of the wardrobe, as the wardrobe writes them (W6). */
function shelfSupportParams(plan: HomeShelfSupport): Record<string, number | string | boolean | null> {
  const fromEnd = [...new Set(plan.ends.flatMap((e) => (e.scheme?.holes ?? []).filter((h) => h.part === 'SHELF' && h.face === 'LOWER').map((h) => h.fromEndMm)))];
  return {
    tier: plan.selection.chosen?.tier ?? null,
    axisAboveLowerFaceMm: plan.axisMm === null ? null : plan.axisMm - plan.lowerMm,
    axisElevationMm: plan.axisMm,
    movedFromMm: plan.movedFromMm,
    kitPriceRub: plan.kit?.priceRub ?? null,
    // The colour of the body matched to the material of the shelf (344); null while it is not known.
    colour: plan.kit?.parts.find((x) => x.colour)?.colour ?? null,
    // The one distance of the bores of the shelf from its end by the scheme (INV-H02, MOD-DEC-365); null — none or several.
    shelfBoreFromEndMm: fromEnd.length === 1 && fromEnd[0] !== null ? fromEnd[0]! : null,
  };
}

/** r5: what is known of a shelf support — as the wardrobe: chosen, on its axis, its scheme complete and every check OK. */
function shelfSupportCapability(plan: HomeShelfSupport): Mechanism['capability'] {
  const chosen = plan.selection.chosen;
  if (!chosen) return { status: 'HOLD', reason: plan.selection.reason };
  if (plan.completeness === 'COMPLETE' && plan.axisMm !== null && chosen.status === 'OK') return { status: 'RESOLVED', reason: null };
  return { status: 'PLACEHOLDER', reason: [...chosen.checks.filter((c) => c.status === 'UNKNOWN').map((c) => c.text), ...plan.missing].join('; ') || 'Положение оси полкодержателя не известно' };
}

const normalOf = (q: GraphPart): AxisIndex => ([0, 1, 2] as AxisIndex[]).find((i) => !q.local_uv_world_axes.includes(i))!;

/** Joint line of r3 (joinery.ts): the contact axis, the longer common axis along the joint, its start and length. */
function jointLine(cam: GraphPart, stud: GraphPart, axis: number) {
  const other = [0, 1, 2].filter((k) => k !== axis),
    line = other.reduce((a, k) => (Math.min(cam.extent_mm[k], stud.extent_mm[k]) > Math.min(cam.extent_mm[a], stud.extent_mm[a]) ? k : a), other[0]),
    cross = other.find((k) => k !== line)!,
    lo = (k: number) => Math.max(cam.origin_mm[k], stud.origin_mm[k]),
    hi = (k: number) => Math.min(cam.origin_mm[k] + cam.extent_mm[k], stud.origin_mm[k] + stud.extent_mm[k]),
    contact = cam.origin_mm[axis] >= stud.origin_mm[axis] + stud.extent_mm[axis] - 0.1 ? cam.origin_mm[axis] : cam.origin_mm[axis] + cam.extent_mm[axis];
  return { line, cross, start: lo(line), length: hi(line) - lo(line), crossStart: lo(cross), contact };
}

function buildHomeGraph(p: HomeProject, hw: HardwareCatalogs): Graph {
  const rules = homeRules(p),
    R3 = rules.generator,
    r4 = R3 !== HOME_R3,
    basis = { datum: 'FINISHED_PART_WITH_EDGE', stage: 'POST_EDGING', transform: R3 } as const,
    g = physicalGraph(p, hw),
    drill = joinery(p, hw),
    bill = hardware(p, hw),
    t = p.thickness,
    T = topT(p),
    byId = new Map(g.parts.map((q) => [q.id, q])),
    frontFamily = homeFrontFamily(p, hw),
    sku = (key: string) => bill.find((l) => l.id === p.id + ':hardware:' + key);
  const assemblies: Assembly[] = [],
    parts: Part[] = [],
    partAssembly = new Map<string, string>();

  const frame = (b: Body): CarcassFrame => {
    const a = aFront(p, b),
      hdf = hdfBackOf(p, b),
      pad = foot(p, b),
      fronts = g.parts.filter((q) => q.bodyId === b.id && (q.semanticRole === 'door' || q.semanticRole === 'drawer_front')),
      shelves = g.parts.filter((q) => q.bodyId === b.id && q.semanticRole.endsWith('_shelf'));
    return {
      scheme: 'TOP_OVER_SIDES',
      panelThicknessMm: t,
      elevations: {
        floorElevationMm: 0,
        sideBottomElevationMm: b.y + sideFoot(p, b),
        sideTopElevationMm: b.y + b.h - T,
        plinthBottomElevationMm: b.y,
        plinthTopElevationMm: b.y + pad,
        bottomPanelBottomElevationMm: b.y + pad,
        bottomPanelTopElevationMm: b.y + pad + t,
        interiorBottomElevationMm: b.y + pad + t,
        interiorTopElevationMm: b.y + b.h - T,
        topPanelBottomElevationMm: b.y + b.h - T,
        topPanelTopElevationMm: b.y + b.h,
      },
      // r5 (MOD-DEC-516): the plinth of the wardrobe or the legs of the catalogue, whose load is not computed (482).
      base:
        b.base?.kind === 'plinth'
          ? { kind: 'PLINTH', heightMm: pad, plinthSetbackMm: rules.baseChoice!.plinthSetbackMm, hardwareConfirmed: true }
          : { kind: b.base ? 'FIXED_LEGS' : 'FLOOR_PADS', heightMm: pad, plinthSetbackMm: 0, hardwareConfirmed: false },
      // r5 (MOD-DEC-515): the back of HDF in the rebate of the wardrobe's profile (287), as the wardrobe writes it.
      back: hdf
        ? {
            mounting: 'REBATE',
            panelThicknessMm: hdf.thicknessMm,
            rebateDepthMm: hdf.rebateDepthMm,
            rebateWidthMm: hdf.rebateWidthMm,
            inPlaneClearanceMm: hdf.inPlaneClearanceMm,
            rearClearanceMm: hdf.rearClearanceMm,
            status: hdf.profileId,
          }
        : {
            mounting: b.back ? 'INSET' : 'NONE',
            panelThicknessMm: b.back ? t : 0,
            rebateDepthMm: null,
            rebateWidthMm: null,
            inPlaneClearanceMm: null,
            rearClearanceMm: null,
            status: R3,
          },
      depths: {
        carcassDepthMm: b.d - a,
        shelfDepthMm: shelves.length ? Math.max(...shelves.map((q) => q.extent_mm[1])) : b.d - a - (b.back ? backDepthMm(p, b) : 0),
        facadeToCarcassGapMm: fronts.length ? a - Math.max(...fronts.map((q) => q.origin_mm[1] + q.extent_mm[1])) : 0,
      },
    };
  };
  const box = (minMm: Vec3, sizeMm: Vec3) => ({ minMm, sizeMm });

  // ---- assemblies: product → body (cabinet) → desk pedestal (module) → bays and knee space (sections) → drawers (fill)
  // The parameters of the cutting map ride in the request of the product as the wardrobe's (R5-009): the price cuts with them.
  assemblies.push({ id: p.id, kind: 'PRODUCT', parentId: null, inputRef: p.id, box: box([0, 0, 0], [0, 0, 0]), index: 0, frame: null, span: null, frontGrid: null, request: p.cutting ? { 'state.cutting': JSON.stringify(p.cutting) } : null });
  const sectionOf = new Map<string, string>();
  p.bodies.forEach((b, i) => {
    const desk = b.kind === 'desk',
      a = aFront(p, b),
      pad = foot(p, b),
      pedestal = b.id + ':pedestal',
      P = desk ? b.partitions[0].x + t / 2 : b.w;
    assemblies.push({ id: b.id, kind: 'CABINET', parentId: p.id, inputRef: b.id, box: box([b.x, 0, b.y], [b.w, b.d, b.h]), index: i, frame: frame(b), span: null, frontGrid: null, request: null });
    if (desk)
      assemblies.push({ id: pedestal, kind: 'MODULE', parentId: b.id, inputRef: b.partitions[0].id, box: box([b.x, 0, b.y], [P, b.d, b.h]), index: 0, frame: frame(b), span: null, frontGrid: null, request: null });
    const knee = g.sections.find((s) => s.id === b.id + ':knee') as { kneeBoxMm: number[] } | undefined;
    if (knee) {
      const [x, y, z, w, d, h] = knee.kneeBoxMm;
      assemblies.push({ id: b.id + ':knee', kind: 'SECTION', parentId: b.id, inputRef: null, box: box([x, y, z], [w, d, h]), index: 0, frame: null, span: null, frontGrid: null, request: null });
    }
    availableBays(p, b).forEach((o, k) => {
      const r = bay(p, b, o);
      sectionOf.set(b.id + '|' + o.lo + '|' + o.hi, o.id);
      assemblies.push({
        id: o.id,
        kind: 'SECTION',
        parentId: desk ? pedestal : b.id,
        inputRef: o.id,
        box: box([b.x + r.left, a, b.y + pad + t], [r.right - r.left, (b.back ? b.d - backDepthMm(p, b) : b.d) - a, b.h - T - pad - t]),
        index: k + (knee ? 1 : 0),
        frame: null,
        span: null,
        frontGrid: null,
        request: null,
      });
    });
    b.drawers.forEach((f, k) => {
      const own = g.parts.filter((q) => q.bodyId === b.id && q.elementId === f.id),
        min = [0, 1, 2].map((n) => Math.min(...own.map((q) => q.origin_mm[n]))) as Vec3,
        max = [0, 1, 2].map((n) => Math.max(...own.map((q) => q.origin_mm[n] + q.extent_mm[n])));
      assemblies.push({ id: b.id + ':' + f.id, kind: 'FILL', parentId: sectionOf.get(b.id + '|' + f.lo + '|' + f.hi)!, inputRef: f.id, box: box(min, max.map((x, n) => x - min[n]) as Vec3), index: k, frame: null, span: null, frontGrid: null, request: null });
    });
  });
  const product = assemblies[0];
  const minX = Math.min(...p.bodies.map((b) => b.x)),
    minZ = Math.min(...p.bodies.map((b) => b.y)),
    maxX = Math.max(...p.bodies.map((b) => b.x + b.w)),
    maxZ = Math.max(...p.bodies.map((b) => b.y + b.h)),
    maxD = Math.max(...p.bodies.map((b) => b.d)),
    lowZ = Math.min(...p.bodies.map((b) => b.y + (b.base?.kind === 'legs' ? b.base.heightMm : 0)));
  product.box = box([minX, 0, minZ], [maxX - minX, maxD, maxZ - minZ]);

  // ---- parts: one engine part per r3 part, same order, same box
  const elementAssembly = (b: Body, q: GraphPart): string => {
    const key = q.id.slice(b.id.length + 1),
      desk = b.kind === 'desk',
      pedestal = b.id + ':pedestal';
    if (q.semanticRole.startsWith('drawer_')) return b.id + ':' + q.elementId;
    if (q.semanticRole === 'door' || q.semanticRole.endsWith('_shelf')) {
      const e = [...b.shelves, ...b.doors].find((x) => x.id === q.elementId)!;
      return sectionOf.get(b.id + '|' + e.lo + '|' + e.hi)!;
    }
    if (q.semanticRole === 'floor_pad') return partAssembly.get(key.split(':').slice(1, -1).join(':').replace(/:middle$/, '')) ?? b.id;
    if (desk && (key === 'side-left' || key === 'bottom' || key === 'back' || q.semanticRole === 'bearing_shared_side' || q.semanticRole === 'plinth_rail')) return pedestal;
    return b.id;
  };
  const supportOf = new Map(g.supports.map((s) => [s.floorPartId, s]));
  for (const q of g.parts) {
    const b = p.bodies.find((x) => x.id === q.bodyId)!,
      // r5: the height of a hinged leaf is its length, as in the kitchen and the wardrobe (INV-M02 reads the chart by it).
      leaf = rules.hingeRule === 'WARDROBE' && q.semanticRole === 'door',
      [ui, vi] = leaf ? [q.local_uv_world_axes[1], q.local_uv_world_axes[0]] : q.local_uv_world_axes,
      ni = normalOf(q),
      [L, W] = leaf ? [q.finished_uv_mm[1], q.finished_uv_mm[0]] : q.finished_uv_mm,
      // MOD-DEC-573: a front of the material chosen — bought ready-made, or a board of ЛМДФ of its own decor.
      front = FRONT_ROLES.has(q.semanticRole) ? frontFamily : null,
      boughtFront = front === 'PURCHASED_FINISHED',
      purchased = q.semanticRole === 'floor_pad' || boughtFront,
      // r5: the back of HDF (515) and the bottom of HDF of a drawer (574).
      hdf = q.material === HDF_BACK_MATERIAL,
      [role0, structuralRole] = ROLES[q.semanticRole],
      right = q.id.endsWith(':side-right') || q.semanticRole === 'bearing_shared_side',
      role: PartRole = role0 === 'SIDE_PANEL_LEFT' && right ? 'SIDE_PANEL_RIGHT' : role0,
      handedness = q.id.endsWith(':side-left') ? 'LEFT' : right ? 'RIGHT' : 'NONE',
      edges = {} as Record<EdgeSlot, EdgeBand>;
    for (const slot of ['A', 'B', 'C', 'D'] as const) {
      const e = q.edge_mm[(leaf ? LEAF_EDGE_KEYS : EDGE_KEYS)[slot]] ?? 0,
        axis = slot === 'A' || slot === 'B' ? vi : ui,
        intent = e ? 'EDGE_' + e.toFixed(1).replace('.', '_') : 'NONE';
      edges[slot] = {
        slot,
        physicalEdge: EDGE_NAMES[axis][slot === 'B' || slot === 'D' ? 1 : 0],
        edgeLengthMm: slot === 'A' || slot === 'B' ? L : W,
        intent,
        edgeBandThicknessMm: e,
        effectiveEdgeBandThicknessMm: e,
        profileCode: e ? 'UNRESOLVED' : 'NONE',
        automaticIntent: intent,
        override: 'AUTO',
        exposure: e ? 'VISIBLE' : 'HIDDEN',
        ruleId: rules.edgeByPart ? 'MOD-DEC-513 edgeByPart' : 'HOME_R3_ONE_EDGE_THICKNESS',
      };
    }
    const decor = materials.find((m) => m.id === q.material),
      support = supportOf.get(q.id),
      part: Part = {
        id: q.id,
        name: partNames[q.semanticRole],
        assemblyId: elementAssembly(b, q),
        inputRef: q.elementId,
        role,
        structuralRole,
        handedness,
        material: front && front !== 'LDSP'
          ? {
              family: front,
              // A bought front shows the decor of the project as the sample of its colour; ЛМДФ — its own decor.
              decorId: front === 'LMDF' ? (p.facadeChoice!.decorId ?? q.material) : q.material,
              variantId: front + ':' + (front === 'LMDF' ? (p.facadeChoice!.decorId ?? q.material) : q.material) + '-' + q.thickness_mm,
              label: boughtFront
                ? `${homeFacadeTitle(p)} · ${p.facadeChoice!.colorText ?? decor?.name.split(' · ')[0] ?? q.material} · ${q.thickness_mm} мм`
                : `${String(mfLabel(p.facadeChoice!.decorId, hw.materials))} · ${q.thickness_mm} мм`,
              panelThicknessMm: q.thickness_mm,
              sheetFormatMm: null,
              purpose: boughtFront ? 'PURCHASE' : 'MANUFACTURE',
            }
          : {
          family: purchased ? 'HARDWARE' : hdf ? 'HDF' : 'LDSP',
          decorId: q.material,
          variantId: purchased ? q.material : hdf ? HDF_BACK_BOARD : DRAWER_BOX_ROLES.has(q.semanticRole) ? DRAWER_BOX_BOARD : q.material + '-' + q.thickness_mm,
          label: hdf ? 'ХДФ · ' + q.thickness_mm + ' мм' : decor ? decor.name.split(' · ')[0] + ' · ' + q.thickness_mm + ' мм' : q.material,
          panelThicknessMm: q.thickness_mm,
          sheetFormatMm: null,
          purpose: purchased ? 'PURCHASE' : 'MANUFACTURE',
        },
        finishedWithEdge: { lengthMm: L, widthMm: W, panelThicknessMm: q.thickness_mm },
        dimensionChain: deriveDimensionChain({ lengthMm: L, widthMm: W }, edges, r3Allowance(), r3Allowance()),
        placement: { originMm: [...q.origin_mm], uAxis: [...AXES[ui]], vAxis: [...AXES[vi]], nAxis: [...AXES[ni]] },
        orientation: {
          family: FAMILIES[ni],
          handedness,
          faceNames: { N_POS: FACE_NAMES[ni][1], N_NEG: FACE_NAMES[ni][0] },
          faceNormals: { N_POS: '+' + AXIS_NAMES[ni], N_NEG: '-' + AXIS_NAMES[ni] },
          grainDirection: 'NONE',
        },
        edges,
        contourMm: null,
        supply: purchased ? 'PURCHASED' : 'MANUFACTURED',
        operationIds: [],
        installationElevationMm: null,
        qualification: { physical: g.qualification.physical === true, cnc: g.qualification.CNC === true, reasons: [R3 + ': физическая и станочная квалификация не выполнены'] },
      };
    if (support) part.floorSupport = { bearingPartId: support.bearingPartId.replace(/:middle$/, ''), viaBottomPanel: support.viaBottom };
    partAssembly.set(q.id, part.assemblyId);
    parts.push(part);
  }
  const partById = new Map(parts.map((x) => [x.id, x]));

  // ---- joints of r3 (joinery adds placementProfile) and the fixing of each drawer front
  const joints: Joint[] = [],
    lines = new Map<string, ReturnType<typeof jointLine>>();
  for (const j of drill.joints) {
    const cam = byId.get(j.camPartId)!,
      stud = byId.get(j.studPartId)!,
      l = jointLine(cam, stud, j.contactAxis),
      confirmat = j.recipe === 'MAKMART_S16',
      origin = [0, 0, 0] as Vec3;
    lines.set(j.id, l);
    origin[j.contactAxis] = l.contact;
    origin[l.line] = l.start;
    origin[l.cross] = l.crossStart;
    joints.push({
      id: j.id,
      kind: confirmat ? 'CONFIRMAT' : 'CAM_CONNECTOR',
      // A confirmat passes through the side into the edge of the back or bottom: the r3 «stud» is the through part.
      parts: confirmat ? { throughPartId: j.studPartId, receivingPartId: j.camPartId } : { throughPartId: j.camPartId, receivingPartId: j.studPartId },
      contact: {
        axis: j.contactAxis as 0 | 1 | 2,
        frame: { originMm: origin, uAxis: [...AXES[l.line]], sAxis: [...AXES[l.cross]], wAxis: [...AXES[j.contactAxis]] },
        contactLengthMm: l.length,
        contactAreaMm2: j.contactAreaMm2,
      },
      faces: { through: '', receiving: '', outer: null, cup: null },
      profileId: j.recipe,
      stationsMm: [],
      assembly: 'UNKNOWN',
      reason: R3 + ': ' + (confirmat ? 'короб ящика — конфирмат' : 'эксцентрик по толщине плиты') + ' ' + j.recipe,
      visibility: { exposed: false, covered: false, internalPartition: stud.semanticRole === 'bearing_divider', role: j.group },
      opposed: { opposed: j.placementProfile === 'shared_shelf_pattern', minWebMm: null },
      dowelCount: j.woodDowels,
      physicalVerified: false,
      productionExecutable: false,
      drillingExemption: null,
      connectionRole: mapped(CONNECTION_ROLES, j.orientation, 'joint orientation'),
      placementProfile: (j as HomeJoint).placementProfile ? mapped(PLACEMENT_PROFILES, (j as HomeJoint).placementProfile!, 'placement profile') : null,
    });
  }
  for (const b of p.bodies)
    for (const f of b.drawers) {
      const front = byId.get(b.id + ':' + f.id + ':front')!,
        inner = byId.get(b.id + ':' + f.id + ':inner-front');
      // The box of a concealed runner has no inner front: its front is on the cams of the box (FINDINGS 1750).
      if (!inner) continue;
      const fix = sku(f.id + ':front-fix'),
        gap = inner.origin_mm[1] - (front.origin_mm[1] + front.extent_mm[1]),
        origin: Vec3 = [Math.max(front.origin_mm[0], inner.origin_mm[0]), front.origin_mm[1] + front.extent_mm[1], Math.max(front.origin_mm[2], inner.origin_mm[2])],
        w = Math.min(front.origin_mm[0] + front.extent_mm[0], inner.origin_mm[0] + inner.extent_mm[0]) - origin[0],
        h = Math.min(front.origin_mm[2] + front.extent_mm[2], inner.origin_mm[2] + inner.extent_mm[2]) - origin[2];
      joints.push({
        id: inner.id + '->' + front.id,
        kind: 'SCREW',
        parts: { throughPartId: inner.id, receivingPartId: front.id },
        contact: { axis: 1, frame: { originMm: origin, uAxis: [1, 0, 0], sAxis: [0, 0, 1], wAxis: [0, 1, 0] }, contactLengthMm: w, contactAreaMm2: Math.abs(gap) < 0.1 ? w * h : 0 },
        faces: { through: 'N_POS', receiving: 'N_NEG', outer: null, cup: null },
        profileId: fix?.sku ?? 'UNKNOWN',
        stationsMm: [],
        assembly: 'UNKNOWN',
        reason: R3 + ': крепление фасада ящика — ' + (fix ? fix.quantity + ' × ' + fix.name : 'винты') + '; между фасадом и коробом ' + gap + ' мм',
        visibility: { exposed: false, covered: true, internalPartition: false, role: 'drawer' },
        opposed: { opposed: false, minWebMm: null },
        dowelCount: 0,
        physicalVerified: false,
        productionExecutable: false,
        drillingExemption: null,
        connectionRole: 'FRONT_FIX',
        placementProfile: null,
      });
    }
  // r5 (MOD-DEC-515, FINDINGS 939): the back of HDF sits in a rebate of the profile of the wardrobe (287) — a groove
  // fit with each carcass part it enters, the rebate of that part its groove (QUARTER_FOR_HDF4, as the wardrobe). The
  // rebate is the box of the back grown by the clearance in its plane and reaching the rear face of the body; in each
  // part it is the common volume of the two, so a top over the sides gets a stopped rebate and a partition none.
  // r5 (MOD-DEC-574, FINDINGS 1304): the bottom of HDF of a drawer sits in the groove of the four walls of its box in
  // the same way (GROOVE_FOR_HDF4, the wardrobe's W7): the groove is the box of the bottom grown to the groove width.
  const grooves: Groove[] = [];
  interface Fit {
    through: GraphPart;
    lo: Vec3;
    hi: Vec3;
    profileId: string;
    suffix: string;
    /** The groove's id in the receiving part. */
    op: string;
    semanticType: string;
    purpose: string;
    reason: string;
    role: string;
    connectionRole: ConnectionRole;
  }
  const fit = (x: Fit, r: GraphPart): void => {
    const a0 = [0, 1, 2].map((k) => Math.max(x.lo[k], r.origin_mm[k])),
      a1 = [0, 1, 2].map((k) => Math.min(x.hi[k], r.origin_mm[k] + r.extent_mm[k]));
    if (a0.some((v, k) => a1[k] - v < 0.1)) return;
    const part = partById.get(r.id)!,
      [ui, vi] = r.local_uv_world_axes,
      ni = normalOf(r),
      local = (k: number) => [a0[k] - r.origin_mm[k], a1[k] - r.origin_mm[k]],
      [u0, u1] = local(ui),
      [v0, v1] = local(vi),
      [n0] = local(ni),
      face = n0 < 0.1 ? 'N_NEG' : 'N_POS',
      origin = [...a0] as Vec3,
      j: Joint = {
        id: x.through.id + '/' + x.suffix + '/' + r.id,
        kind: 'GROOVE_FIT',
        parts: { throughPartId: x.through.id, receivingPartId: r.id },
        contact: {
          axis: ni as 0 | 1 | 2,
          frame: { originMm: origin, uAxis: [...AXES[ui]], sAxis: [...AXES[vi]], wAxis: [...AXES[ni]] },
          contactLengthMm: u1 - u0,
          contactAreaMm2: (u1 - u0) * (v1 - v0),
        },
        faces: { through: '', receiving: face, outer: null, cup: null },
        profileId: x.profileId,
        stationsMm: [],
        assembly: 'UNKNOWN',
        reason: x.reason,
        visibility: { exposed: false, covered: true, internalPartition: false, role: x.role },
        opposed: { opposed: false, minWebMm: null },
        dowelCount: 0,
        physicalVerified: false,
        productionExecutable: false,
        drillingExemption: null,
        connectionRole: x.connectionRole,
        placementProfile: null,
      },
      groove: Groove = {
        op: 'GROOVE',
        id: r.id + '/' + x.op,
        partId: r.id,
        face,
        edge: null,
        along: 'LENGTH',
        startMm: u0,
        endMm: u1,
        offsetMm: (v0 + v1) / 2,
        grooveWidthMm: v1 - v0,
        grooveDepthMm: a1[ni] - a0[ni],
        semanticType: x.semanticType,
        purpose: x.purpose,
        owner: { jointId: j.id },
        resolution: { profileId: x.profileId, productionConfirmed: false, requiresTechnologyConfirmation: true },
        basis,
      };
    joints.push(j);
    grooves.push(groove);
    part.operationIds.push(groove.id);
  };
  for (const b of p.bodies) {
    const q = hdfBackOf(p, b),
      back = byId.get(b.id + ':back');
    if (!q || back?.semanticRole !== 'hdf_back') continue;
    const { lo, hi } = hdfRebateBox(q, back, b.d),
      rebate: Fit = {
        through: back,
        lo,
        hi,
        profileId: q.profileId,
        suffix: 'REBATE',
        op: 'QUARTER-HDF',
        semanticType: 'QUARTER_FOR_HDF4',
        purpose: 'Четверть задника ХДФ · рабочий профиль',
        reason: 'Четверть задника ХДФ: рабочий профиль шкафа ' + q.profileId + ' (287); крепление задника в четверти выбирает мебельщик',
        role: 'BACK_REBATE',
        connectionRole: 'BACK',
      };
    for (const r of g.parts.filter((x) => x.bodyId === b.id && REBATE_ROLES.has(x.semanticRole))) fit(rebate, r);
  }
  const bottomHdf = hdfDrawerBottomOf(p);
  for (const bottom of bottomHdf ? g.parts.filter((x) => x.semanticRole === 'drawer_bottom' && x.material === HDF_BACK_MATERIAL) : []) {
    const c = (bottomHdf!.grooveWidthMm - bottomHdf!.thicknessMm) / 2,
      groove: Fit = {
        through: bottom,
        lo: [bottom.origin_mm[0], bottom.origin_mm[1], bottom.origin_mm[2] - c],
        hi: [bottom.origin_mm[0] + bottom.extent_mm[0], bottom.origin_mm[1] + bottom.extent_mm[1], bottom.origin_mm[2] + bottom.extent_mm[2] + c],
        profileId: bottomHdf!.profileId,
        suffix: 'GROOVE',
        op: 'GROOVE-HDF',
        semanticType: 'GROOVE_FOR_HDF4',
        purpose: 'Паз под дно ящика ХДФ · профиль шкафа',
        reason: `Дно ящика ХДФ в пазу: паз шкафа ${bottomHdf!.grooveWidthMm} × ${bottomHdf!.grooveDepthMm} мм (W7, 574)`,
        role: 'DRAWER_BOTTOM_GROOVE',
        connectionRole: 'DRAWER_BOTTOM',
      };
    for (const r of g.parts.filter((x) => x.bodyId === bottom.bodyId && x.elementId === bottom.elementId && DRAWER_WALL_ROLES.has(x.semanticRole))) fit(groove, r);
  }
  const jointById = new Map(joints.map((j) => [j.id, j]));

  // ---- mechanisms: hinges and runners of r3, shelf supports and the anti-tip restraint of its hardware list
  const mechanisms: Mechanism[] = [],
    runnerOfFront = new Map<string, string>(),
    boundaryPart = (b: Body, ref: string) => (ref === 'left' ? b.id + ':side-left' : ref === 'right' ? b.id + ':side-right' : b.id + ':' + ref);
  for (const m of g.mechanisms as Record<string, unknown>[]) {
    const b = p.bodies.find((x) => x.id === m.bodyId)!,
      f = [...b.doors, ...b.drawers].find((x) => x.id === m.elementId)!,
      skip = ['id', 'type', 'bodyId', 'elementId', 'frontPartId', 'stationWorldZ', 'sku', 'count', 'facadeHoles', 'plateHoles', 'panelPartId'];
    if (m.type === 'hinges') {
      const hinge = b.doors.find((x) => x.id === f.id)!.hinge,
        // r5 (FINDINGS 841): the pair of the catalogue — the hinge and its plate — on the panel of the hinge side.
        selected = rules.hingeRule === 'WARDROBE';
      mechanisms.push({
        id: String(m.id),
        kind: 'HINGE',
        partIds: [String(m.frontPartId), selected ? String(m.panelPartId) : b.id + ':side-' + hinge],
        assemblyId: sectionOf.get(b.id + '|' + f.lo + '|' + f.hi)!,
        profile: selected
          ? { catalogId: String(m.hingeId ?? 'UNKNOWN'), compatibilityProfileId: (m.plateId as string | null) ?? null, version: hw.release.version }
          : { catalogId: String(m.sku ?? 'UNKNOWN'), compatibilityProfileId: (m.includedPlate as string | undefined) ?? null, version: hw.release.version },
        params: flatten(m, skip),
        stationsMm: [...((m.stationWorldZ as number[] | undefined) ?? [])],
        motionEnvelopes: [],
        capability: m.count ? { status: 'PLACEHOLDER', reason: R3 + ': ' + String(m.status) + ', физическая квалификация не выполнена' } : { status: 'HOLD', reason: String(m.reason) },
        quantity: (m.count as number | null) ?? 0,
        drillingExemption: null,
      });
    } else {
      runnerOfFront.set(String(m.frontPartId), String(m.id));
      mechanisms.push({
        id: String(m.id),
        kind: 'DRAWER_RUNNER',
        partIds: [b.id + ':' + f.id + ':side-left', b.id + ':' + f.id + ':side-right', boundaryPart(b, f.lo), boundaryPart(b, f.hi)],
        assemblyId: b.id + ':' + f.id,
        profile: { catalogId: String(m.sku), compatibilityProfileId: null, version: hw.release.version },
        params: flatten(m, skip),
        stationsMm: [],
        motionEnvelopes: [],
        // r5 (FINDINGS 1750, 1755): the runner of each drawer is chosen by 466; DB4501 under every box stays a placeholder.
        capability:
          !rules.drawerRunnerRule || p.drawerRunner !== 'level'
            ? { status: 'PLACEHOLDER', reason: 'DB4501 — заглушка, пока стандартная направляющая не выбрана (MOD-DEC-032)' }
            : { status: 'RESOLVED', reason: `${String(m.sku)} — направляющая ящика по подбору 466: уровня фурнитуры проекта или её замена (465; уточнение 574; FINDINGS 1750, 1755)` },
        quantity: 1,
        drillingExemption: null,
      });
    }
  }
  const shelfSku = sku('shelf'),
    // r5 (FINDINGS 844, 845): the support of the wardrobe chosen for each removable shelf.
    supportPlans = new Map<string, HomeShelfSupport>();
  for (const b of p.bodies)
    for (const s of b.shelves.filter((s) => !s.fixed)) {
      const plan = rules.shelfSupportRule === 'WARDROBE' ? homeShelfSupport(p, hw, b, s) : null;
      if (plan) supportPlans.set(s.id, plan);
      mechanisms.push({
        id: s.id + ':supports',
        kind: 'SHELF_SUPPORT',
        partIds: [b.id + ':' + s.id, boundaryPart(b, s.lo), boundaryPart(b, s.hi)],
        assemblyId: sectionOf.get(b.id + '|' + s.lo + '|' + s.hi)!,
        profile: { catalogId: plan ? (plan.support?.id ?? 'UNKNOWN') : (shelfSku?.sku ?? 'UNKNOWN'), compatibilityProfileId: null, version: hw.release.version },
        params: plan ? shelfSupportParams(plan) : {},
        stationsMm: plan ? [...plan.ends[0].linesFromFrontMm] : [],
        motionEnvelopes: [],
        capability: plan ? shelfSupportCapability(plan) : { status: 'PLACEHOLDER', reason: R3 + ': физическая квалификация не выполнена' },
        quantity: plan ? plan.quantity : drill.boards.reduce((n, x) => n + x.holes.filter((h) => h.kind === 'SHELF_PIN' && h.jointId === s.id).length, 0),
        drillingExemption: null,
      });
    }
  // r5 (MOD-DEC-516, FINDINGS 947): the legs of a body on legs, as the wardrobe's SUPPORT_LEG — the leg of the catalogue,
  // its stations and models; their load is not computed (482).
  for (const b of p.bodies) {
    if (b.base?.kind !== 'legs') continue;
    const legs = homeLegs(p, hw, b),
      id = b.id + ':legs';
    mechanisms.push({
      id,
      kind: 'SUPPORT_LEG',
      partIds: [b.id + ':side-left', b.id + ':side-right', b.id + ':bottom'],
      assemblyId: b.id,
      profile: { catalogId: legs.leg.id, compatibilityProfileId: null, version: hw.release.version },
      params: { heightMm: legs.heightMm, article: legs.leg.article, priceRub: legs.leg.price?.rub ?? null },
      stationsMm: legs.stationsMm.flat(),
      motionEnvelopes: [],
      capability: legs.temporary ? { status: 'PLACEHOLDER', reason: `Ножки ${legs.leg.name} × ${legs.stationsMm.length}: ${legs.temporary} (MOD-DEC-480)` } : { status: 'RESOLVED', reason: null },
      quantity: legs.stationsMm.length,
      drillingExemption: null,
      visuals: legVisuals(id, legs.leg, legs.stationsMm.map(([x, y]) => [b.x + x, y] as const), b.y, legs.heightMm),
    });
  }
  // r5 (MOD-DEC-513, FINDINGS 965): the handle of the catalogue on each front, as the wardrobe's HANDLE (480); no
  // drilling — the fitters drill for it (158).
  for (const h of homeHandles(p, hw)) {
    const door = p.bodies.find((b) => b.id === h.bodyId)!.doors.find((d) => d.id === h.frontId);
    mechanisms.push({
      id: h.id,
      kind: 'HANDLE',
      partIds: [h.partId],
      // A door belongs to its section, as its hinges; a drawer — to its own assembly.
      assemblyId: door ? sectionOf.get(h.bodyId + '|' + door.lo + '|' + door.hi)! : h.bodyId + ':' + h.frontId,
      profile: { catalogId: h.handle.id, compatibilityProfileId: null, version: hw.release.version },
      params: { article: h.handle.article, orientation: h.orientation, centreXMm: h.centreMm[0], centreYMm: h.centreMm[1], centreZMm: h.centreMm[2], priceRub: h.handle.price?.rub ?? null },
      stationsMm: [],
      motionEnvelopes: [],
      capability: { status: 'RESOLVED', reason: null },
      quantity: 1,
      drillingExemption: { decision: 'MOD-DEC-158', reason: 'Присадку под ручки не рассчитываем: её делают монтажники; в 3D — модель ручки' },
      visuals: [h.visual],
    });
  }
  // r5 (MOD-DEC-574, 496; FINDINGS 1307): the cable outlet of a body with `cable` — its hole is the prototype's (r1):
  // «присадка неполная», as the other numbers of the prototype (277). No grommet: an open hole, as IKEA BESTÅ (FINDINGS 1312).
  for (const b of p.bodies)
    if (cableOutletOf(p, b))
      mechanisms.push({
        id: b.id + ':cable',
        kind: 'CABLE_OUTLET',
        partIds: [b.id + ':back'],
        assemblyId: b.id,
        profile: { catalogId: 'NONE', compatibilityProfileId: null, version: hw.release.version },
        params: { diameterMm: rules.cableOutlet!.diameterMm, belowTopMm: rules.cableOutlet!.belowTopMm },
        stationsMm: [],
        motionEnvelopes: [],
        capability: { status: 'RESOLVED', reason: 'Отверстие Ø60 мм без заглушки, как у IKEA BESTÅ (FINDINGS 1312)' },
        quantity: 0,
        drillingExemption: null,
      });
  const restraint = sku('restraint'),
    anchors = sku('wall-anchors');
  const installationRequirements: InstallationRequirement[] = [];
  for (const b of p.bodies) {
    const sides = [b.id + ':side-left', b.id + ':side-right'];
    mechanisms.push({
      id: b.id + ':anti-tip',
      kind: 'ANTI_TIP',
      partIds: sides,
      assemblyId: b.id,
      profile: { catalogId: restraint?.sku ?? 'UNKNOWN', compatibilityProfileId: null, version: hw.release.version },
      params: {},
      stationsMm: [],
      motionEnvelopes: [],
      capability: p.antiTipConfirmed ? { status: 'RESOLVED', reason: null } : { status: 'HOLD', reason: 'Защита от опрокидывания не подтверждена' },
      quantity: restraint ? restraint.quantity / p.bodies.length : 0,
      drillingExemption: null,
    });
    installationRequirements.push({
      id: b.id + ':wall-anchor',
      type: 'WALL_ANCHORING',
      required: true,
      targetPartIds: sides,
      selection: 'INSTALLER',
      text: anchors?.condition ?? 'Крепление к стене выбирает монтажник',
    });
  }

  // ---- operations: every r3 bore, owned by its joint or mechanism
  const operations: Hole[] = [];
  const hingeStation = (id: string) => {
    const [fid, k] = id.split(':hinge-'),
      m = mechanisms.find((x) => x.id === fid + ':hinges');
    return { mechanismId: fid + ':hinges', stationMm: m ? (m.stationsMm[Number(k)] ?? null) : null };
  };
  for (const board of drill.boards) {
    const q = byId.get(board.id)!,
      part = partById.get(board.id)!,
      ni = normalOf(q),
      // r5: the axes of a hinged leaf are turned (its length is its height), so are the coordinates of its holes.
      leaf = rules.hingeRule === 'WARDROBE' && q.semanticRole === 'door';
    for (const h0 of board.holes as HomeHole[]) {
      const h = leaf ? { ...h0, u: h0.v, v: h0.u, face: h0.face.replace(/^[uv]/, (c) => (c === 'u' ? 'v' : 'u')) } : h0,
        code = h.face,
        mode = code[0] === 'n' ? 'FACE' : 'EDGE',
        edge: EdgeSlot | null = code === 'u0' ? 'C' : code === 'u1' ? 'D' : code === 'v0' ? 'A' : code === 'v1' ? 'B' : null,
        joint = jointById.get(h.jointId),
        hinge = h.jointId.includes(':hinge-') ? hingeStation(h.jointId) : null,
        line = lines.get(h.jointId),
        runner = h.kind === 'RUNNER_SCREW_SPOT' || h.kind === 'RUNNER_FIXING' || h.kind === 'RUNNER_HOOK',
        cable = h.kind === 'CABLE_OUTLET',
        through = h.through === true,
        status = [h.recipeStatus && 'RECIPE_' + String(h.recipeStatus), h.headSeatStatus && 'HEAD_SEAT_' + String(h.headSeatStatus), h.pilotStatus && 'PILOT_' + String(h.pilotStatus)].filter(Boolean);
      const op: Hole = {
        op: 'HOLE',
        id: h.id,
        partId: board.id,
        mode,
        face: code === 'n0' ? 'N_NEG' : code === 'n1' ? 'N_POS' : null,
        edge,
        xMm: mode === 'FACE' || edge === 'A' || edge === 'B' ? h.u : h.v,
        yMm: mode === 'FACE' ? h.v : 0,
        diameterMm: h.diameterMm,
        depthMm: through ? null : h.depthMm,
        through,
        layer: MARKING_KINDS.has(h.kind) ? 'MARKING' : 'DRILL',
        machiningRole: (h.spareOf as string | undefined) ?? MACHINING_ROLES[h.kind] ?? h.kind,
        purpose: h.kind,
        code: h.kind,
        owner: joint ? { jointId: joint.id } : hinge ? { mechanismId: hinge.mechanismId } : { mechanismId: runner || cable ? h.jointId : h.jointId + ':supports' },
        fastenerProfileId:
          (h.sku as string | undefined) ??
          (joint
            ? joint.profileId
            : cable
              ? null
              : hinge || runner
              ? (mechanisms.find((m) => m.id === (hinge ? hinge.mechanismId : h.jointId))?.profile.catalogId ?? null)
              : (shelfSku?.sku ?? null)),
        axisOffsetMm: mode === 'EDGE' ? h.worldCentreMm[ni] - q.origin_mm[ni] : null,
        entryMm: [...h.worldCentreMm] as Vec3,
        inwardNormal: [...h.axisTechnology] as Vec3,
        stationMm: line ? h.worldCentreMm[line.line] - line.start : hinge ? hinge.stationMm : typeof h.station === 'number' ? h.station : null,
        // Carcass fasteners follow the r3 rule. Hinge and shelf-pin bores are literals of the prototype: no kit, no
        // catalogue found — «присадка неполная» (MOD-DEC-277, example 277 #5; H-05, FINDINGS 113). r3 labels them a
        // catalogue without a reference (H-05); r4 says what they are: the prototype's numbers (FINDINGS 234).
        // r5: the holes of a hinge are the kit's or the catalogue's of the chosen pair, with its page (277, FINDINGS 841).
        source: joint ? 'RULE' : h.holeSource ? (h.holeSource as Hole['source']) : rules.hardwareHoleSource,
        sourceRef: joint ? null : h.holeSource ? String(h.holeSourceRef) : rules.hardwareHoleSource !== 'PROTOTYPE' ? null : 'home-physical-r3 joinery.ts ' + h.kind + ' (FINDINGS 234)',
        completeness: joint ? 'COMPLETE' : h.holeSource ? (h.holeCompleteness as Hole['completeness']) : 'UNKNOWN_AWAITING_OWNER',
        status: status.length ? status.join(' ') : 'ENGINEERING_DRAFT',
        basis,
      };
      operations.push(op);
      part.operationIds.push(op.id);
    }
  }
  for (const j of joints) {
    const own = operations.filter((o) => 'jointId' in o.owner && o.owner.jointId === j.id),
      stations = own.filter((o) => o.machiningRole === (j.kind === 'CONFIRMAT' ? 'PILOT_BLIND_HOLE' : 'CHANNEL')),
      first = (partId: string) => own.find((o) => o.partId === partId && o.machiningRole !== 'CAM'),
      faceOf = (o: Hole | undefined) => (o ? (o.face ?? o.edge ?? '') : j.faces.through);
    if (!own.length) continue;
    j.stationsMm = stations.map((o) => o.stationMm!);
    j.faces = {
      through: faceOf(first(j.parts.throughPartId)),
      receiving: faceOf(first(j.parts.receivingPartId)),
      outer: null,
      cup: own.find((o) => o.machiningRole === 'CAM')?.face ?? null,
    };
  }

  // ---- loads: beams of r3 and the drawer runners (mass against the published capacity)
  const E = loadSummary(p, hw).E_MPa,
    // r4 (MOD-DEC-368, H-08): a removable shelf has the limit of its supports; the other beams have none (HOLD).
    supportCapacity = rules.shelfSupportLimit ? shelfSupportCapacityKg(hw) : null,
    loads: Load[] = [],
    loadCount = new Map<string, number>(),
    loadPart = (elementId: string) => (byId.has(elementId) ? elementId : g.parts.find((q) => q.elementId === elementId && q.semanticRole.endsWith('_shelf'))?.id ?? null);
  for (const l of g.loads) {
    const partId = loadPart(l.elementId),
      n = (loadCount.get(l.elementId) ?? 0) + 1,
      I = (l.depthMm * l.thicknessMm ** 3) / 12,
      moment = (l.selfMassKg * 9.81 * l.spanMm) / 8 + (l.payloadKg * 9.81 * l.spanMm) / 4;
    loadCount.set(l.elementId, n);
    loads.push({
      id: (partId ?? l.elementId) + ':load-' + n,
      partId,
      mechanismId: null,
      spanMm: l.spanMm,
      physicalLengthMm: l.physicalLengthMm,
      depthMm: l.depthMm,
      panelThicknessMm: l.thicknessMm,
      selfMassKg: l.selfMassKg,
      payloadKg: l.payloadKg,
      totalMassKg: l.totalMassKg,
      youngModulusNPerMm2: E,
      secondMomentOfAreaMm4: I,
      deflectionMm: l.deflectionMm,
      // The same beam as the deflection: self weight uniform, payload at mid-span; σ = M / W, W = b·t²/6.
      bendingStressNPerMm2: moment / ((l.depthMm * l.thicknessMm ** 2) / 6),
      // No deflection limit by decision: HOLD (§2.9, §14.1). L/200 of r3 is defect H-12; its screen stays a warning.
      deflectionLimitMm: null,
      capacityKg: partId && byId.get(partId)?.semanticRole === 'adjustable_shelf' ? (supportPlans.has(l.elementId) ? supportPlans.get(l.elementId)!.capacityKg : supportCapacity) : null,
      screenPass: l.screenPass,
      physicalQualified: false,
      selfMassBasis: l.selfMassBasis,
    });
  }
  for (const m of mechanisms.filter((m) => m.kind === 'DRAWER_RUNNER')) {
    const moving = m.params.movingMassKg as number,
      capacity = m.params.loadKg as number,
      payload = m.params.payloadKg as number,
      reserve = m.params.hardwareReserveKg as number;
    // Not a beam: span, section and stiffness are 0; the check is the mass against the runner pair (INV-M06).
    loads.push({
      id: m.id + ':load',
      partId: null,
      mechanismId: m.id,
      spanMm: 0,
      physicalLengthMm: 0,
      depthMm: 0,
      panelThicknessMm: 0,
      selfMassKg: moving - payload - reserve,
      payloadKg: payload,
      totalMassKg: moving,
      youngModulusNPerMm2: 0,
      secondMomentOfAreaMm4: 0,
      deflectionMm: 0,
      bendingStressNPerMm2: 0,
      deflectionLimitMm: null,
      capacityKg: capacity,
      screenPass: moving <= capacity,
      physicalQualified: false,
    });
  }

  // ---- unresolved: the questions of r3 and the notes of its issues(), with the same texts
  const unresolved: Unresolved[] = drill.unresolved.map((u) => {
    const ids = Array.isArray(u.partIds) ? (u.partIds as string[]) : u.partId ? [u.partId] : [],
      runner = RUNNER_CODES.has(u.code) && u.partId ? runnerOfFront.get(u.partId) : undefined;
    return {
      code: u.code,
      level: 'WARNING',
      partIds: ids.map((q) => loadPart(q) ?? q),
      jointIds: u.jointId ? [u.jointId] : [],
      operationIds: [...(u.holeId ? [u.holeId] : []), ...(u.holeIds ?? [])],
      mechanismIds: runner
        ? [runner]
        : HINGE_BLOCKING_CODES.has(u.code) && u.partId
          ? [String(u.partId).split(':').slice(-2, -1)[0] + ':hinges']
          : SUPPORT_BLOCKING_CODES.has(u.code) && u.partId
            ? [String(u.partId).split(':').slice(-1)[0] + ':supports']
            : LEG_BLOCKING_CODES.has(u.code) && u.partId
              ? [String(u.partId).replace(/:bottom$/, ':legs')]
              : [],
      text: issueText(u.code, p, u),
      ruleId: u.code === 'FACADE_SEAM_NARROW' ? 'MOD-DEC-356' : u.code === 'DRAWER_RUNNER_SUBSTITUTED' ? 'MOD-DEC-465' : SUPPORT_BLOCKING_CODES.has(u.code) ? 'MOD-DEC-513' : LEG_BLOCKING_CODES.has(u.code) ? 'MOD-DEC-516' : R3,
      // §2.9: an overloaded mechanism is unresolved and blocks production; r4 adds the shelf supports (368), r5 a door
      // beyond the chart of its hinge or a hinge on a fixed shelf, as the wardrobe (190, 329; FINDINGS 856), and a
      // removable shelf without a support of its level or without a level of the grid (FINDINGS 844, 845).
      blocksProductionReadiness: OVERLOAD_CODES.has(u.code) || HINGE_BLOCKING_CODES.has(u.code) || SUPPORT_BLOCKING_CODES.has(u.code) || LEG_BLOCKING_CODES.has(u.code),
    };
  });
  // r4 (MOD-DEC-277, H-05): the hardware drilling has neither kit nor catalogue — «присадка неполная» for every drilled
  // mechanism and the fixing of the drawer fronts; the owner decides the sizes. Not for production (Д).
  if (r4) {
    // r5: a hinge whose holes are the kit's or the catalogue's is not among them (FINDINGS 841).
    const prototypeOwners = new Set(operations.filter((o) => o.source === 'PROTOTYPE' && 'mechanismId' in o.owner).map((o) => (o.owner as { mechanismId: string }).mechanismId)),
      // r5: so is a shelf support drilled by the scheme of its catalogue (FINDINGS 844); one without it stays here.
      drilledByCatalog = (m: Mechanism) =>
        (m.kind === 'SHELF_SUPPORT' && rules.shelfSupportRule === 'WARDROBE' && supportPlans.get(m.id.replace(/:supports$/, ''))?.completeness === 'COMPLETE') ||
        // and a concealed runner drilled by its BAZIS kit (FINDINGS 1751).
        (m.kind === 'DRAWER_RUNNER' && operations.some((o) => o.source === 'KIT_FR3D' && 'mechanismId' in o.owner && o.owner.mechanismId === m.id)),
      mechanismIds = mechanisms
        .filter((m) => (['DRAWER_RUNNER', 'SHELF_SUPPORT', 'CABLE_OUTLET'].includes(m.kind) && !drilledByCatalog(m)) || (m.kind === 'HINGE' && (rules.hingeRule !== 'WARDROBE' || prototypeOwners.has(m.id))))
        .map((m) => m.id),
      jointIds = joints.filter((j) => j.connectionRole === 'FRONT_FIX').map((j) => j.id);
    if (mechanismIds.length || jointIds.length)
      unresolved.push({
        code: 'DRILLING_INCOMPLETE',
        level: 'WARNING',
        partIds: [],
        jointIds,
        operationIds: operations.filter((o) => o.source === 'PROTOTYPE').map((o) => o.id),
        mechanismIds,
        text: issueText('DRILLING_INCOMPLETE', p),
        ruleId: R3,
        blocksProductionReadiness: true,
      });
  }
  const codes = new Set(drill.unresolved.map((u) => u.code));
  for (const i of issues(p, hw).filter((i) => !codes.has(i.code)))
    unresolved.push({
      code: i.code,
      level: 'INFO',
      partIds: [],
      jointIds: [],
      operationIds: [],
      mechanismIds: [],
      text: i.text,
      ruleId: R3,
      // r3 is not qualified physically and its drilling is an engineering draft: not for production.
      blocksProductionReadiness: i.code === 'PHYSICAL_QUALIFICATION' || i.code === 'DRILLING_HOLD',
    });
  // MOD-DEC-573: the material of the fronts against the catalogue of the release; the cups of a bought front are drilled
  // by the supplier (277).
  const fronts = parts.filter((x) => FRONT_ROLES.has(byId.get(x.id)?.semanticRole as SemanticRole));
  for (const t of homeFacadeProblems(p, hw))
    unresolved.push({ code: 'FACADE_MATERIAL_CATALOG', level: 'WARNING', partIds: fronts.map((x) => x.id), jointIds: [], operationIds: [], mechanismIds: [], text: `Материал фасадов: ${t} — выберите материал фасадов заново (MOD-DEC-573).`, ruleId: 'MOD-DEC-573', blocksProductionReadiness: true });
  if (frontFamily === 'PURCHASED_FINISHED' && fronts.length)
    unresolved.push({ code: 'FACADE_SUPPLIER_DRILLING', level: 'INFO', partIds: fronts.map((x) => x.id), jointIds: [], operationIds: [], mechanismIds: [], text: `Фасады готовые покупные (${homeFacadeTitle(p)}): чашки петель сверлит поставщик по схемам петель, на корпусе — отверстия планок (MOD-DEC-277).`, ruleId: 'MOD-DEC-277', blocksProductionReadiness: false });
  const capabilities: CapabilityResolution[] = Object.entries(drill.qualification).map(([capability, value]) => ({
    capability,
    status: value === 'PASS_BOUNDED_NOMINAL' ? 'RESOLVED' : 'HOLD',
    reasons: [R3 + ': ' + capability + ' = ' + String(value)],
  }));

  return {
    product: 'HOME',
    versions: r4
      ? { engine: ENGINE_CONTRACT_VERSION, generator: R3, ruleSet: R3, policies: homePolicyVersions(rules), catalog: HOME_R3, hardwareCatalog: { ...hw.release }, priceSnapshotId: null, dimensionRule: R3 }
      : { engine: ENGINE_CONTRACT_VERSION, generator: R3, ruleSet: R3, policies: {}, catalog: R3, hardwareCatalog: { ...hw.release }, priceSnapshotId: null, dimensionRule: R3 },
    revision: { projectRevisionId: contentDigest(p) },
    coordinateSystem: 'X_RIGHT_Y_BACK_Z_UP_MM',
    // r5 (MOD-DEC-516): the legs are hardware, not parts — the parts of a body on legs start at their height, as in the wardrobe.
    envelope: { widthMm: maxX - minX, heightMm: maxZ - lowZ, depthMm: maxD, installedHeightMm: maxZ, installationOffsetMm: lowZ },
    site: {
      room: { widthMm: p.room.width, heightMm: p.room.height, depthMm: p.room.depth },
      walls: { left: false, right: false, back: false },
      roomSkirting: null,
      wallGapMm: 0,
    },
    assemblies,
    parts,
    operations: [...operations, ...grooves],
    joints,
    mechanisms,
    loads,
    unresolved,
    result: aggregateResult(unresolved, capabilities, installationRequirements, false),
  };
}
