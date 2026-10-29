// The swing wardrobe on the graph of the unified engine (tasks W3 and W4, MIGRATION_PLAN steps 3.4, 3.5): the carcass
// and the doors without the fill. Sides, roof, bottom, partitions, the back panel in a rebate (MOD-DEC-287; removed by
// 168, then the partitions reach the rear of the sides — 309), the plinth (291) or legs (171), the carcass fasteners
// of r7 (192, 292) with the room walls (WR-18), the bearing contacts of the raised bottom, the anti-tip requirement;
// the doors in front of the carcass (162), their HINGE mechanisms with the holes of the kit (286, 190, 277) and the
// front grid of the product (185, 124); the fill (W6) and the drawers (W7): the box of each drawer with its
// DRAWER_RUNNER mechanism — BOYARD DB4501 as an explicit PLACEHOLDER (032, WR-16) —, the decorative facade of an
// external drawer in front of its own front wall (WR-20), the spacer of 331 and 360, the conflicts of FE-04 (050, 053).
//
// The geometry and the rules are those of the carcass of wardrobe/carcass.ts and the facades of wardrobe/facades.ts
// (the prototype's model() with the fixes of FINDINGS 210–219 and 260–269); this file translates that model into the contract (engine/contract.ts) and keeps nothing of
// its own shape. Every number comes from the model or the policy (ENGINE.md §4, MOD-DEC-054): the guard of
// scripts/check.mjs allows only 0, 1 and 2 here. The way back — the prototype's model from the graph — is
// wardrobe/graph-projection.ts; the round trip is tested on every wardrobe input (engine.wardrobe.test.ts,
// engine.wardrobe.facades.test.ts).
//
// Placement of a part (the one transform, ENGINE.md §2.3): u runs along the prototype's L from its edge x = 0, v
// along W from its edge y = 0 (domainPointForPhysicalEdge of file 04), n along the thickness in the positive axis.
// The prototype's axes are x across, Y up, Z from the front; the graph's are x, y to the back, z up.
import {
  ENGINE_CONTRACT_VERSION,
  type Allowance,
  type Assembly,
  type CapabilityResolution,
  type CarcassFrame,
  type EdgeBand,
  type EdgeSlot,
  type FrontGrid,
  type Graph,
  type Groove,
  type Hole,
  type InstallationRequirement,
  type Joint,
  type JointKind,
  type Load,
  type Mechanism,
  type Notch,
  type Operation,
  type Part,
  type PartRole,
  type PhysicalEdge,
  type Rational,
  type StructuralRole,
  type Unresolved,
  type Vec3,
} from '../contract.js';
import { contourEdgesOfSlots } from '../contour-edges.js';
import { aggregateResult, deriveDimensionChain, fromValidatedInput } from '../graph.js';
import type { BoardRef } from '../invariants/checks.js';
import { ratFromDecimal, ratSum } from '../invariants/geometry.js';
import { DE_VERSION } from '../policy/depth.js';
import { domainPointForPhysicalEdge, installationFaceNormals, partOrientation } from '../policy/edge-model.js';
import { manualEdgeWarnings } from '../policy/edge-manual.js';
import { POLICY_MODULES, RULE_SET_VERSION } from '../policy/index.js';
import type { Rec } from '../policy/project-state.js';
import { FLOOR_CONTACT_EDGE_ISSUE } from '../policy/validators.js';
import { bodyWidthWarnings, type Body } from '../policy/carcass.js';
import { backSeamScrews } from '../policy/back-split.js';
import { wardrobeCarcass } from '../policy/wardrobe-carcass.js';
import { wardrobeFacades } from '../policy/wardrobe-facades.js';
import { wardrobeDrawers, wardrobeDrawerTravelMm } from '../policy/wardrobe-drawers.js';
import { doorDrawerClashes } from '../motion.js';
import { slidingDepthReserve, slidingUpperTrack, wardrobeSliding } from '../policy/wardrobe-sliding.js';
import type { CatalogRelease, HardwareCatalogs } from '../../catalog/hardware/release.js';
import { slidingDoors } from '../policy/sliding-doors.js';
import { fracNumber, type FractionInput } from '../../wardrobe/sliding-doors.js';
import { contentDigest } from '../../project/digest.js';
import { carcassModelWithState, corpusDecor, val, wardrobeSettings } from '../../wardrobe/carcass.js';
import { edgeGeometryForPart, edgeIntentThicknessMm } from '../../wardrobe/edges.js';
import { doorOverExternalDrawer, externalDrawersOverDoors, fmt, wardrobePartBoxes } from '../../wardrobe/facades.js';
import { F7_PROFILES, fastenerReasonText, temporaryProfileReason } from '../../wardrobe/fasteners-r7.js';
import { sectionSidePanels } from '../../wardrobe/fill.js';
import type { LegFitting, RodFitting, WardrobeFittings } from '../../wardrobe/fittings.js';
import { checkWardrobeInput, type WardrobeInput } from '../../wardrobe/input.js';
import { wardrobePriceSnapshot } from '../../wardrobe/price-snapshot.js';
import { FASTENER_PRESETS, WardrobeStandardPreset } from '../../wardrobe/standard.js';

export const WARDROBE_GENERATOR = 'wardrobe-graph-9';
/** Id of the product assembly. */
export const WARDROBE_PRODUCT_ID = 'WARDROBE';

/** Role of each carcass part of the prototype in the contract (ENGINE.md §2.3; TERM-055…077). */
export const WARDROBE_PART_ROLES: Readonly<Record<string, PartRole>> = {
  sideLeft: 'SIDE_PANEL_LEFT',
  sideRight: 'SIDE_PANEL_RIGHT',
  top: 'CARCASS_TOP_PANEL',
  bottom: 'CARCASS_BOTTOM_PANEL',
  back: 'BACK_PANEL',
  divider: 'PARTITION',
  plinthFront: 'PLINTH_PANEL',
  plinthRear: 'PLINTH_PANEL',
  partialUpright: 'VERTICAL_STRUCTURAL_PANEL',
  decorativePlinth: 'FILLER_PANEL',
  facade: 'HINGED_FACADE_LEAF',
  // The fill (W6): shelves, the shelf over the drawers, local partitions.
  fixedShelf: 'FIXED_SHELF',
  adjustableShelf: 'ADJUSTABLE_SHELF',
  drawerCoverShelf: 'DRAWER_COVER_SHELF',
  localPartition: 'LOCAL_PARTITION',
  // The insert of a sliding leaf (W9.2, WR-13): LDSP 10 mm in the aluminium frame of the leaf.
  slidingInsert: 'SLIDING_LEAF_INFILL',
  // The drawers (W7): the box, its front wall, the facade of an external drawer (WR-20), the spacer (331, 360).
  drawerSide: 'DRAWER_BOX_SIDE',
  drawerFront: 'STRUCTURAL_FRONT',
  drawerBack: 'DRAWER_BOX_BACK',
  drawerBottom: 'DRAWER_BOTTOM_PANEL',
  drawerFacadeStructural: 'DECORATIVE_FACADE',
  drawerSpacer: 'DRAWER_RUNNER_SPACER',
};

/** Role of a part of the model in the contract: by its kind; a leaf of a lift front is LIFT_FACADE_LEAF (task LIFT). */
export const wardrobePartRole = (p: Rec): PartRole => (p.liftFront ? 'LIFT_FACADE_LEAF' : WARDROBE_PART_ROLES[p.kind]!);

/** Structural role of the parts of a drawer by their kind: the prototype gives them no `role` (W7). */
const DRAWER_STRUCTURAL_ROLES: Readonly<Record<string, StructuralRole>> = {
  drawerSide: 'DRAWER_BOX',
  drawerFront: 'DRAWER_BOX',
  drawerBack: 'DRAWER_BOX',
  drawerBottom: 'DRAWER_BOX',
  drawerFacadeStructural: 'FACADE',
  // The spacer carries the runner to the panel (MOD-DEC-331).
  drawerSpacer: 'LOAD_TRANSFER',
};

/** Structural role of the prototype (`parts[].role`) in the contract. */
export const WARDROBE_STRUCTURAL_ROLES: Readonly<Record<string, StructuralRole>> = {
  loadBearingPanel: 'LOAD_BEARING',
  structuralPanel: 'STRUCTURAL',
  loadTransferPanel: 'LOAD_TRANSFER',
  baseRail: 'LOAD_TRANSFER',
  nonStructuralBack: 'NON_STRUCTURAL_BACK',
  door: 'FACADE',
  // A fixed shelf ties the sides (STRUCTURAL_SHELF); a removable shelf and a local partition carry nothing of the body.
  structuralShelf: 'STRUCTURAL_SHELF',
};

/** Back panel mode of the prototype (`backProfile.mode`) in the contract (MOD-DEC-287, 168). */
export const BACK_MOUNTINGS: Readonly<Record<string, CarcassFrame['back']['mounting']>> = {
  quarter: 'REBATE',
  overlay: 'OVERLAY',
  groove: 'GROOVE',
  none: 'NONE',
};

/** Base of the prototype (`baseSystem`) in the contract (MOD-DEC-291, 171). */
export const BASE_KINDS: Readonly<Record<string, CarcassFrame['base']['kind']>> = {
  plinth: 'PLINTH',
  fixedLegs: 'FIXED_LEGS',
  adjustableLegs: 'ADJUSTABLE_LEGS',
  legsPlinth: 'LEGS_PLINTH',
  none: 'NONE',
  mixed: 'MIXED',
};

/** Physical edge of the prototype → the contract name, the product axis it faces and the side of the box it lies on. */
const PHYSICAL: Readonly<Record<string, { name: PhysicalEdge; axis: number; atMin: boolean }>> = {
  left: { name: 'LEFT', axis: 0, atMin: true },
  right: { name: 'RIGHT', axis: 0, atMin: false },
  front: { name: 'FRONT', axis: 1, atMin: true },
  rear: { name: 'REAR', axis: 1, atMin: false },
  bottom: { name: 'BOTTOM', axis: 2, atMin: true },
  top: { name: 'TOP', axis: 2, atMin: false },
};

/** Axis of the product for a normal letter of the prototype: X across, Z from the front (y of the graph), Y up (z). */
const PROTOTYPE_AXIS: Readonly<Record<string, number>> = { X: 0, Z: 1, Y: 2 };
const PRODUCT_AXIS_NAMES = ['X', 'Y', 'Z'];

export interface BoxMm {
  min: Vec3;
  max: Vec3;
}

/** Frame of a part: placement, the contract slot of each physical edge, the face toward +n and −n. */
export interface PartFrame {
  placement: Part['placement'];
  slotOf: Record<string, EdgeSlot>;
  physicalOf: Record<EdgeSlot, string>;
  faceOf: Record<'N_POS' | 'N_NEG', string>;
  sideOf: Record<string, 'N_POS' | 'N_NEG'>;
  /** Normal of each face in product axes, `+X`, `-Y`… */
  normals: Record<string, string>;
  /** The physical edge of each slot in the product (the edge of the model is `physicalOf`) and the orientation family. */
  physicalEdgeOf: Record<EdgeSlot, PhysicalEdge>;
  family: string;
}

/**
 * Kinds the edge model of the prototype does not know: they fall to the back's geometry (r1.html:5116), which lies the
 * part flat. A local partition (MOD-DEC-234) and the spacer of the drawers (331, 360) stand like a partition: L is the
 * height, W the depth, so their frame is that of the divider; the edges of the model keep their names by slot (FINDINGS 274).
 * The drawer bottom lies like a shelf (the prototype gives it the faces of an upright, +Z), the facade of an external
 * drawer stands like the front wall of the box, L across (the prototype names its edges as if L were the height);
 * FINDINGS 392. A partial upright from the bottom stands as a partition does (it was framed as a horizontal panel,
 * FINDINGS 706).
 */
const FRAME_KIND: Readonly<Record<string, string>> = { localPartition: 'divider', partialUpright: 'divider', drawerSpacer: 'divider', drawerBottom: 'fixedShelf', drawerFacadeStructural: 'drawerFront', slidingInsert: 'facade' };

const unit = (axis: number, sign: number): Vec3 => [0, 1, 2].map((i) => (i === axis ? sign : 0)) as Vec3;

/** World box of a prototype box (x across, y up, z from the front) in product axes. */
export const productBox = (b: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }): BoxMm => ({ min: [b.x0, b.z0, b.y0], max: [b.x1, b.z1, b.y1] });

/** Normal letter of the prototype (`+X`, `-Y`…) as a signed product axis. */
export function productNormal(letter: string): { axis: number; sign: number } {
  return { axis: PROTOTYPE_AXIS[letter.charAt(1)]!, sign: letter.charAt(0) === '-' ? -1 : 1 };
}

/** The frame of a prototype part in its world box (product axes). */
export function partFrame(p: Rec, box: BoxMm): PartFrame {
  const framed = FRAME_KIND[p.kind] ? { ...p, kind: FRAME_KIND[p.kind], orientationFamily: undefined } : p,
    own = edgeGeometryForPart(p),
    geometry = edgeGeometryForPart(framed),
    slotOf: Record<string, EdgeSlot> = {},
    physicalOf = {} as Record<EdgeSlot, string>,
    physicalEdgeOf = {} as Record<EdgeSlot, PhysicalEdge>;
  let u: { axis: number; sign: number } | null = null,
    v: { axis: number; sign: number } | null = null;
  for (const e of Object.keys(geometry)) {
    const a = domainPointForPhysicalEdge(framed, e, 1),
      b = domainPointForPhysicalEdge(framed, e, 2),
      alongV = a.x === b.x,
      zero = alongV ? a.x === 0 : a.y === 0,
      slot: EdgeSlot = alongV ? (zero ? 'C' : 'D') : zero ? 'A' : 'B',
      side = PHYSICAL[e]!,
      name = framed === p ? e : Object.keys(own).find((k) => own[k]!.slot === slot)!;
    slotOf[name] = slot;
    physicalOf[slot] = name;
    physicalEdgeOf[slot] = side.name;
    // The edge at local 0 lies on the min side of its axis: the local axis then grows with the product axis.
    const dir = { axis: side.axis, sign: side.atMin === zero ? 1 : -1 };
    if (alongV) u = dir;
    else v = dir;
  }
  if (!u || !v || u.axis === v.axis) throw new Error(`${p.id}: оси детали не определены`);
  const n = { axis: [0, 1, 2].find((i) => i !== u!.axis && i !== v!.axis)!, sign: 1 },
    origin = [0, 1, 2].map((i) => {
      const d = [u!, v!, n].find((x) => x.axis === i)!;
      return d.sign > 0 ? box.min[i]! : box.max[i]!;
    }) as Vec3;
  const normals: Record<string, string> = {},
    faceOf = {} as Record<'N_POS' | 'N_NEG', string>,
    sideOf: Record<string, 'N_POS' | 'N_NEG'> = {};
  for (const [face, letter] of Object.entries(installationFaceNormals(framed))) {
    const q = productNormal(letter);
    normals[face] = (q.sign > 0 ? '+' : '-') + PRODUCT_AXIS_NAMES[q.axis];
    if (q.axis !== n.axis) throw new Error(`${p.id}: грань ${face} не перпендикулярна толщине`);
    const s = q.sign > 0 ? 'N_POS' : 'N_NEG';
    faceOf[s] = face;
    sideOf[face] = s;
  }
  return { placement: { originMm: origin, uAxis: unit(u.axis, u.sign), vAxis: unit(v.axis, v.sign), nAxis: unit(n.axis, n.sign) }, slotOf, physicalOf, faceOf, sideOf, normals, physicalEdgeOf, family: partOrientation(framed).orientationFamily };
}

/** Point of part axes in product axes. */
export const placePoint = (pl: Part['placement'], u: number, v: number, n: number): Vec3 =>
  [0, 1, 2].map((i) => pl.originMm[i]! + pl.uAxis[i]! * u + pl.vAxis[i]! * v + pl.nAxis[i]! * n) as Vec3;

/** Point of product axes in part axes (u, v, n). */
export function localPoint(pl: Part['placement'], q: Vec3): Vec3 {
  const d = [0, 1, 2].map((i) => q[i]! - pl.originMm[i]!),
    dot = (a: Vec3) => a[0] * d[0]! + a[1] * d[1]! + a[2] * d[2]!;
  return [dot(pl.uAxis), dot(pl.vAxis), dot(pl.nAxis)];
}

/** Entry point and inward normal of a hole from the part frame (face N_POS: n = T, inward −n; edge C: u = 0, inward +u…). */
export function holeEntry(pl: Part['placement'], size: { L: number; W: number; T: number }, h: Pick<Hole, 'mode' | 'face' | 'edge' | 'xMm' | 'yMm'>): { entryMm: Vec3; inwardNormal: Vec3 } {
  const neg = (a: Vec3) => a.map((x) => -x) as Vec3,
    half = size.T / 2;
  if (h.mode === 'FACE') return h.face === 'N_POS' ? { entryMm: placePoint(pl, h.xMm, h.yMm, size.T), inwardNormal: neg(pl.nAxis) } : { entryMm: placePoint(pl, h.xMm, h.yMm, 0), inwardNormal: [...pl.nAxis] };
  switch (h.edge) {
    case 'A':
      return { entryMm: placePoint(pl, h.xMm, 0, half), inwardNormal: [...pl.vAxis] };
    case 'B':
      return { entryMm: placePoint(pl, h.xMm, size.W, half), inwardNormal: neg(pl.vAxis) };
    case 'C':
      return { entryMm: placePoint(pl, 0, h.xMm, half), inwardNormal: [...pl.uAxis] };
    default:
      return { entryMm: placePoint(pl, size.L, h.xMm, half), inwardNormal: neg(pl.uAxis) };
  }
}

const near = (a: number, b: number) => Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 2 ** 2;

/** Contact of two part boxes: the touching (or engaged) axis, the joint line along the longer common extent. */
export function contactOf(a: BoxMm, b: BoxMm): Joint['contact'] {
  const ov = [0, 1, 2].map((i) => Math.min(a.max[i]!, b.max[i]!) - Math.max(a.min[i]!, b.min[i]!)),
    axis = [0, 1, 2].reduce((k, i) => (ov[i]! < ov[k]! ? i : k), 0),
    [p, q] = [0, 1, 2].filter((i) => i !== axis) as [number, number],
    line = ov[q]! > ov[p]! ? q : p,
    cross = line === p ? q : p,
    origin = [0, 1, 2].map((i) => Math.max(a.min[i]!, b.min[i]!)) as Vec3;
  if (near(a.max[axis]!, b.min[axis]!)) origin[axis] = a.max[axis]!;
  else if (near(a.min[axis]!, b.max[axis]!)) origin[axis] = a.min[axis]!;
  return {
    axis: axis as 0 | 1 | 2,
    frame: { originMm: origin, uAxis: unit(line, 1), sAxis: unit(cross, 1), wAxis: unit(axis, 1) },
    contactLengthMm: ov[line]!,
    contactAreaMm2: ov[line]! * ov[cross]!,
  };
}

/**
 * Contour of a part with the cut of a box (u, v ranges in part axes) at a corner or along a side (MOD-DEC-198: the
 * cut for the room skirting), counter-clockwise from (0, 0); null when the cut misses the part.
 */
export function cutContour(L: number, W: number, u: [number, number], v: [number, number]): [number, number][] | null {
  const covers = (x: number, [a, b]: [number, number]) => a <= x + Number.EPSILON && x <= b + Number.EPSILON,
    fullU = covers(0, u) && covers(L, u),
    fullV = covers(0, v) && covers(W, v);
  if (fullU && fullV) return null;
  if (fullU) return covers(0, v) ? [[0, v[1]], [L, v[1]], [L, W], [0, W]] : [[0, 0], [L, 0], [L, v[0]], [0, v[0]]];
  if (fullV) return covers(0, u) ? [[u[1], 0], [L, 0], [L, W], [u[1], W]] : [[0, 0], [u[0], 0], [u[0], W], [0, W]];
  const corners: [number, number][] = [[0, 0], [L, 0], [L, W], [0, W]],
    at = corners.findIndex(([x, y]) => covers(x, u) && covers(y, v));
  if (at < 0) return null;
  const [cu, cv] = corners[at]!,
    uIn = covers(0, u) ? u[1] : u[0],
    vIn = covers(0, v) ? v[1] : v[0],
    // Sides 0→1 and 2→3 run along u: an odd corner is entered along u, an even one along v.
    cut: [number, number][] = at % 2 ? [[uIn, cv], [uIn, vIn], [cu, vIn]] : [[cu, vIn], [uIn, vIn], [uIn, cv]];
  return [...corners.slice(0, at), ...cut, ...corners.slice(at + 1)];
}

// ---------------------------------------------------------------- input check (WR-14, H-16)

const controlNumber = (input: WardrobeInput, id: 'width' | 'height' | 'depth') => {
  const text = String(input.controls[id]).trim();
  return text === '' ? NaN : Number(text);
};

/**
 * Problems of an input for the carcass graph, in plain Russian (WR-14, MOD-DEC-203, 238, 565): depth 100…1000 mm in
 * whole millimetres, width from 160 mm, a positive height up to 3200 mm (FINDINGS 1163). A value outside its range is
 * refused with the reason, never replaced by the nearest allowed one.
 */
export function wardrobeInputProblems(input: WardrobeInput): string[] {
  const structural = checkWardrobeInput(input);
  if (structural.length) return structural.map((p) => `Вход проекта неполон: ${p}`);
  const c = wardrobeCarcass.constants,
    out: string[] = input.domain === 'sliding' ? slidingInputProblems(input) : [],
    w = controlNumber(input, 'width'),
    h = controlNumber(input, 'height');
  if (!Number.isFinite(w) || w < c.widthMin.value) out.push(`Ширина шкафа «${input.controls.width}» мм: допустима от ${c.widthMin.value} мм (MOD-DEC-565)`);
  if (!Number.isFinite(h) || h <= 0) out.push(`Высота шкафа «${input.controls.height}» мм: нужно положительное число`);
  else if (h > c.heightMax.value) out.push(`Высота шкафа «${input.controls.height}» мм: допустима до ${c.heightMax.value} мм; значение не заменяется ближайшим допустимым (MOD-DEC-565)`);
  const depthProblem = (what: string, raw: unknown) => {
    const x = typeof raw === 'number' ? raw : String(raw ?? '').trim() === '' ? NaN : Number(raw);
    if (!Number.isFinite(x) || !Number.isInteger(x) || x < c.depthMin.value || x > c.depthMax.value)
      out.push(`${what} «${String(raw)}» мм: допустима от ${c.depthMin.value} до ${c.depthMax.value} мм в целых миллиметрах; значение не заменяется ближайшим допустимым (MOD-DEC-203)`);
  };
  const profile = input.state.depthProfile as Rec | undefined;
  if (profile?.inputBasis === 'OVERALL' && profile.status !== 'UNKNOWN') depthProblem('Глубина шкафа', profile.overallMm);
  else depthProblem('Глубина шкафа', input.controls.depth);
  for (const b of input.state.bodies as Rec[]) if (b.depth !== null && b.depth !== undefined) depthProblem(`Глубина корпуса ${b.id}`, b.depth);
  // WR-30: a swing door over an external drawer — the facade of the drawer and the door would take one volume.
  (input.state.sections as Rec[]).forEach((cfg, i) => {
    if (doorOverExternalDrawer(cfg))
      out.push(`Секция ${i + 1}: наружный ящик за распашной дверью — фасад ящика и дверь заняли бы один объём; уберите дверь секции или сделайте ящик внутренним (WR-30)`);
  });
  return out;
}

/**
 * Problems of a sliding wardrobe input (W9): a known door system, and depth left behind it — the prototype refused
 * an edit that left less than 100 mm of usable depth behind the system (u138ContentsValid r1.html:59692).
 */
function slidingInputProblems(input: WardrobeInput): string[] {
  const doors = input.state.slidingWardrobe as Rec,
    reserve = slidingDepthReserve(doors);
  if (reserve === null) return [`Система дверей-купе «${String(doors.system)}» неизвестна: глубина, которую она занимает в корпусе, не задана`];
  const d: Rec = structuredClone(input.state),
    back = (d.backProfile as Rec | undefined)?.mode === 'quarter' ? Number((d.backProfile as Rec).rebateWidthMm ?? 0) : 0,
    usable = wardrobeSettings(input, d).depth - reserve - back;
  return Number.isFinite(usable) && usable < wardrobeSliding.constants.minUsableDepth.value
    ? [`Не хватает полезной глубины за дверной системой: остаётся ${usable} мм, нужно не меньше ${wardrobeSliding.constants.minUsableDepth.value} мм`]
    : [];
}

/**
 * The carcass graph of a wardrobe input with the hardware catalogue of a release (input + policy + catalogue → graph,
 * ENGINE.md §1; CAT-1); an input with problems is refused with their Russian text (H-16).
 */
export function wardrobeGraph(input: WardrobeInput, hw: HardwareCatalogs): Graph {
  return fromValidatedInput(input, wardrobeInputProblems, (i) => {
    const { m, d } = carcassModelWithState(i, hw);
    return carcassGraph(m, d, i, hw);
  });
}

/** Boards of the carcass: the corpus board at the panel thickness and the HDF of the back (INV-G02); no sheet format here — W5. */
export function wardrobeBoards(g: Graph): BoardRef[] {
  const seen = new Map<string, BoardRef>();
  for (const p of g.parts)
    if (p.supply === 'MANUFACTURED' && !seen.has(p.material.variantId))
      seen.set(p.material.variantId, { variantId: p.material.variantId, panelThicknessMm: p.material.panelThicknessMm, sheetFormatMm: p.material.sheetFormatMm });
  return [...seen.values()];
}

// ---------------------------------------------------------------- the graph

/** The prototype cuts the blank as finished minus the band: zero allowances from the prototype (FINDINGS 218). */
const prototypeAllowance = (): { length: Allowance; width: Allowance } => {
  const a = (): Allowance => ({ minusMm: 0, plusMm: 0, source: { kind: 'PROTOTYPE', ref: 'r1.html:6389 deBlank: заготовка = готовая − кромка', finding: 'FINDINGS 218' } });
  return { length: a(), width: a() };
};

/** Variant of a board: the chosen decor variant, else decor, family and thickness. */
export const boardVariant = (p: Rec, material: string): string => p.materialSelection?.variantId ?? `${p.materialFamily === 'HDF' ? 'HDF' : material}-${p.materialFamily}-${p.T}`;

/** Is this joint planned by the r7 fasteners (its profile is a kit of r7). */
export const isF7Profile = (profileId: string): boolean => Object.prototype.hasOwnProperty.call(F7_PROFILES, profileId);

/**
 * Parts of the project state the carcass rules read besides the bodies and sections (the room and uprights, the
 * depth and back profiles, optional parts, edge overrides, materials, the r7 fasteners): the product's request
 * carries them as JSON text, so the way back (graph-projection.ts) builds the same carcass.
 */
/** Keys of the state the fill reads (W6): System 32, the level of the hardware, the shelves tied to a front seam. */
export const FILL_STATE_KEYS = ['system32Policy', 'fillingTier', 'seamBindings'] as const;

/** Interior elements of a section that are the fill of W6 (doors are W4, the drawer block W7); the suffix of their assembly. */
const FILL_ELEMENTS = new Set(['fixedShelf', 'adjustableShelf', 'rod']),
  FILL_SHELVES = new Set(['fixedShelf', 'adjustableShelf', 'drawerCoverShelf']);
export const FILL_SUFFIX = '/FILL';

/** Keys of a section of the state that are not its fill: the carcass carries them in the span and the request. */
const SECTION_CARCASS_KEYS = new Set(['bodyId', 'nominalMm', 'partitionHeight']);

export const CARCASS_STATE_KEYS = ['construction', 'depthProfile', 'backProfile', 'optionalParts', 'edgeOverrides', 'materialSelection', 'fastenersR7', 'advancedModuleWidthInputMm', 'heightIncludesBase', 'fixedLegHeight'] as const;

/** Parts of the state the facades read (task W4): the gap profile, the front grid modes, the door clearance mode. */
export const FACADE_STATE_KEYS = ['facadeGapProfile', 'frontGridMode', 'facadeWidthPolicy', 'doorBottomClearanceMode'] as const;

/** Fields of a section the facades read (task W4), carried in the section's request as JSON text (`facade.<key>`). */
export const SECTION_FACADE_KEYS = ['facade', 'hingeSide', 'facadeRows', 'facadeHeightMode', 'facadeMounting', 'doorMassKg', 'liftKind', 'liftHandleMassKg', 'content', 'drawersEnabled', 'drawerMode', 'nominalMm'] as const;
const FACADE_SECTION_KEYS = new Set<string>(SECTION_FACADE_KEYS);

/** Flat scalars of a record for Assembly.request, keys `prefix.key`; nested records and arrays as JSON text. */
/** The one distance of the bores of a shelf from its end by the scheme of its support kit (FINDINGS 272), or null. */
export function shelfBoreFromEnd(scheme: Rec | null): number | null {
  const d = [...new Set<number | null>((scheme?.holes ?? []).filter((h: Rec) => h.part === 'SHELF' && h.face === 'LOWER').map((h: Rec) => h.fromEndMm))];
  return d.length === 1 && d[0] !== null ? d[0]! : null;
}

function scalars(prefix: string, record: Rec | null | undefined): Record<string, number | string | boolean | null> {
  const out: Record<string, number | string | boolean | null> = {};
  for (const [k, v] of Object.entries(record ?? {})) out[prefix + k] = v === null || ['number', 'string', 'boolean'].includes(typeof v) ? (v as number | string | boolean | null) : JSON.stringify(v);
  return out;
}

const elevations = (g: Rec): CarcassFrame['elevations'] => ({
  floorElevationMm: g.floorY,
  sideBottomElevationMm: g.sideBottomY,
  sideTopElevationMm: g.sideTopY,
  plinthBottomElevationMm: g.plinthBottomY,
  plinthTopElevationMm: g.plinthTopY,
  bottomPanelBottomElevationMm: g.bottomBottomY,
  bottomPanelTopElevationMm: g.bottomTopY,
  interiorBottomElevationMm: g.interiorBottomY,
  interiorTopElevationMm: g.interiorTopY,
  topPanelBottomElevationMm: g.topBottomY,
  topPanelTopElevationMm: g.topTopY,
});

/** The graph of a carcass model `m` built on the state `d` of the input `input` (carcassModelWithState) with the catalogue `hw` of a release. */
export function carcassGraph(m: Rec, d: Rec, input: WardrobeInput, hw: HardwareCatalogs): Graph {
  const release = hw.release,
    t: number = m.t,
    settings: Rec = m.settings,
    material = String(input.controls.material),
    partById = new Map<string, Rec>(m.parts.map((p: Rec) => [p.id, p])),
    boxes = new Map(wardrobePartBoxes(m).map((b) => [b.id, productBox(b)])),
    frames = new Map<string, PartFrame>(),
    hasBack = (mod: Rec) => partById.has(mod.panelIds.back);
  for (const p of m.parts) {
    const box = boxes.get(p.id);
    if (!box) throw new Error(`${p.id}: нет положения детали в корпусе`);
    frames.set(p.id, partFrame(p, box));
  }

  // ---- assemblies: product → bodies (cabinets) → sections
  const assemblies: Assembly[] = [],
    sectionOf = new Map<string, string>(),
    request: Assembly['request'] = {
      material: input.controls.material,
      heightMm: settings.height,
      heightIncludesBase: settings.heightIncludesBase,
      thicknessInput: input.controls.thickness,
      baseSystem: input.controls.baseSystem || WardrobeStandardPreset.baseSystem,
      plinthHeightMm: input.controls.baseSystem === 'none' ? 0 : Number(input.controls.plinthHeight) || 0,
      plinthSetbackMm: Number(input.controls.plinthSetback) || 0,
      fixedLegHeightMm: Number(d.fixedLegHeight ?? WardrobeStandardPreset.fixedLegHeight),
      skirtingSolution: settings.skirtingSolution,
      roomConstruction: !!d.construction?.room,
      roomAssembly: d.construction?.room?.assembly ?? null,
      roomMinHeightMm: m.roomInstallation.roomHeight,
      roomMinWidthMm: m.roomInstallation.availableWidth,
      depthMm: settings.depth,
      gapInput: String(input.controls.gap),
      widthInput: String(input.controls.width),
      doorBottomClearanceMm: settings.doorBottomClearance,
      doorBottomClearanceInput: input.controls.doorBottomClearance,
      ...scalars('dimensions.', settings.dimensions),
      ...Object.fromEntries([...CARCASS_STATE_KEYS, ...FACADE_STATE_KEYS].map((k) => ['state.' + k, JSON.stringify(d[k] ?? null)])),
      // W6: the depth reduction of the shelves, the System 32 assist, the drawer gap and the gap of the fronts.
      shelfDepthReductionMm: settings.shelfDepthReduction,
      system32Assist: !!settings.system32Assist,
      internalDrawerGapMm: settings.internalDrawerGap,
      facadeGapMm: val(input, 'gap'),
      corpusDecorId: corpusDecor(input),
      ...Object.fromEntries(FILL_STATE_KEYS.map((k) => ['state.' + k, JSON.stringify(d[k] ?? null)])),
      // W9: the sliding doors of the project — the system, the leaves; the carcass reads the depth of the system.
      ...(d.slidingWardrobe ? { 'state.slidingWardrobe': JSON.stringify(d.slidingWardrobe), slidingSystemDepthMm: slidingDepthReserve(d.slidingWardrobe), slidingUpperTrack: slidingUpperTrack(d.slidingWardrobe) } : {}),
      // FIT: the rod, the handle and the leg the project chose (MOD-DEC-480); absent — the defaults of the policy.
      ...(d.fittings ? { 'state.fittings': JSON.stringify(d.fittings) } : {}),
      // R2-019: the saw, the formats and the grain of the cutting map the user entered; the price cuts with them.
      ...(d.cutting ? { 'state.cutting': JSON.stringify(d.cutting) } : {}),
    };
  const W: number = m.W,
    depthOf = (mod: Rec) => mod.geometry.depth + (hasBack(mod) && mod.geometry.back?.mode === 'overlay' ? partById.get(mod.panelIds.back)!.T : 0),
    // MOD-DEC-163: the depth of the wardrobe is the overall one, with the doors in front of the carcass (y < 0).
    front = Math.min(0, ...[...boxes.values()].map((b) => b.min[1]!)),
    envelopeDepth = Math.max(...m.modules.map(depthOf)) - front,
    // The envelope is the box of the parts (INV-G05): on legs the carcass starts at the leg height, which the
    // envelope carries as installationOffsetMm (installedHeightMm = heightMm + offset).
    bottom = Math.min(...[...boxes.values()].map((b) => b.min[2]!)),
    top = Math.max(...[...boxes.values()].map((b) => b.max[2]!));
  assemblies.push({ id: WARDROBE_PRODUCT_ID, kind: 'PRODUCT', parentId: null, inputRef: null, box: { minMm: [0, front, bottom], sizeMm: [W, envelopeDepth, top - bottom] }, index: 0, frame: null, span: null, frontGrid: productFrontGrid(m), request });
  const sections: Rec[] = d.sections,
    half = ratFromDecimal(t / 2),
    full = ratFromDecimal(t),
    none: Rational = { numerator: 0, denominator: 1 };
  for (const mod of m.modules) {
    const g = mod.geometry,
      back: Rec = g.back ?? {},
      base: Rec = g.settings,
      panels: Rec = (d.bodies as Rec[]).find((b) => b.id === mod.bodyId)?.panels ?? {},
      // Widths of the sections as bodyNominalGrid takes them: the exact width of the section, else an equal share.
      nominal: Rational[] = mod.sectionIndexes.map((gi: number) =>
        sections[gi]?.nominalMm ? { numerator: sections[gi].nominalMm.numerator, denominator: sections[gi].nominalMm.denominator } : { numerator: mod.externalWidth, denominator: mod.sectionIndexes.length },
      );
    assemblies.push({
      id: mod.id,
      kind: 'CABINET',
      parentId: WARDROBE_PRODUCT_ID,
      inputRef: mod.bodyId ?? null,
      box: { minMm: [mod.start, 0, g.floorY], sizeMm: [mod.externalWidth, depthOf(mod), g.sideTopY - g.floorY] },
      index: mod.index,
      frame: {
        scheme: 'VERTICAL_CONTINUOUS',
        panelThicknessMm: t,
        elevations: elevations(g),
        base: { kind: BASE_KINDS[base.baseSystem]!, heightMm: base.baseSystem === 'none' ? 0 : base.plinthHeight, plinthSetbackMm: base.plinthSetback, hardwareConfirmed: base.baseSystem !== 'fixedLegs' && base.baseSystem !== 'legsPlinth' },
        back: {
          mounting: hasBack(mod) ? BACK_MOUNTINGS[back.mode] ?? 'NONE' : 'NONE',
          panelThicknessMm: back.materialThicknessMm ?? settings.backPanelThickness,
          rebateDepthMm: back.rebateDepthMm ?? null,
          rebateWidthMm: back.rebateWidthMm ?? null,
          inPlaneClearanceMm: back.inPlaneClearanceMm ?? null,
          rearClearanceMm: back.rearClearanceMm ?? null,
          status: back.status ?? 'UNKNOWN',
        },
        depths: { carcassDepthMm: g.depth, shelfDepthMm: g.depth - (hasBack(mod) && back.mode === 'quarter' ? back.rebateWidthMm : 0), facadeToCarcassGapMm: base.dimensions?.Gfront ?? 0 },
      },
      span: null,
      frontGrid: null,
      request: { ...scalars('base.', g.base), ...scalars('back.', back), ...scalars('panels.', panels), ...scalars('dimensions.', base.dimensions), ...bodyRequest((d.bodies as Rec[]).find((b) => b.id === mod.bodyId)) },
    });
    mod.sectionIndexes.forEach((gi: number, k: number) => {
      const s = m.sectionsData[gi],
        origin = ratFromDecimal(mod.start),
        start = ratSum([origin, ...nominal.slice(0, k)]),
        end = ratSum([origin, ...nominal.slice(0, k + 1)]),
        left = k === 0 ? (panels.left === false ? none : full) : half,
        right = k === mod.sectionIndexes.length - 1 ? (panels.right === false ? none : full) : half;
      sectionOf.set(s.id, mod.id);
      assemblies.push({
        id: s.id,
        kind: 'SECTION',
        parentId: mod.id,
        inputRef: sections[gi]?.uiSectionId ?? null,
        box: { minMm: [s.clearStart, 0, g.interiorBottomY], sizeMm: [s.clearEnd - s.clearStart, g.depth, g.interiorTopY - g.interiorBottomY] },
        index: gi,
        frame: null,
        span: { nominalStartMm: start, nominalEndMm: end, clearStartMm: ratSum([start, left]), clearEndMm: ratSum([end, { numerator: -right.numerator, denominator: right.denominator }]) },
        frontGrid: null,
        request: {
          partitionHeightMm: sections[gi]?.partitionHeight ?? null,
          requestedShelves: s.requestedShelves ?? null,
          ...Object.fromEntries(SECTION_FACADE_KEYS.filter((k) => sections[gi]?.[k] !== undefined).map((k) => ['facade.' + k, JSON.stringify(sections[gi][k])])),
          // What the user asked for in the section (W6): its fill as the state keeps it, key by key; the keys of the
          // carcass and of the facades (W4) have their own fields.
          ...Object.fromEntries(Object.entries(sections[gi] ?? {}).filter(([k]) => !SECTION_CARCASS_KEYS.has(k) && !FACADE_SECTION_KEYS.has(k)).map(([k, v]) => ['fill.' + k, JSON.stringify(v ?? null)])),
        },
      });
    });
  }
  // ---- fill (W6): one assembly per shelf, rod and local partition of a section (элемент наполнения = сборка FILL)
  const fillOfPart = new Map<string, string>();
  m.sectionsData.forEach((s: Rec) => {
    const g = m.modules.find((mod: Rec) => mod.id === s.moduleId).geometry,
      cfg: Rec = sections[s.index] ?? {},
      rows: Rec[] = cfg.filling?.rod ?? [],
      elements: Rec[] = [...s.interiorElements.filter((e: Rec) => FILL_ELEMENTS.has(e.type)), ...m.parts.filter((p: Rec) => p.sectionId === s.id && p.kind === 'localPartition').map((p: Rec) => ({ id: p.id, type: p.kind, partIds: [p.id] }))];
    elements.forEach((e, k) => {
      const id = e.id + FILL_SUFFIX,
        part = e.partIds?.length ? partById.get(e.partIds[0]) : undefined,
        rod = e.type === 'rod' ? rows[s.rodYs.indexOf(e.y)] : undefined,
        box = part ? boxes.get(part.id)! : { min: [s.clearStart, rod?.depthAxis ?? g.depth / 2, g.interiorBottomY + e.y], max: [s.clearEnd, rod?.depthAxis ?? g.depth / 2, g.interiorBottomY + e.y] };
      for (const pid of e.partIds ?? []) fillOfPart.set(pid, id);
      assemblies.push({
        id,
        kind: 'FILL',
        parentId: s.id,
        inputRef: part?.fillingId ?? rod?.id ?? null,
        box: { minMm: [...box.min] as Vec3, sizeMm: box.max.map((x: number, i: number) => x - box.min[i]!) as Vec3 },
        index: k,
        frame: null,
        span: null,
        frontGrid: null,
        request: { type: e.type, elementId: e.id, yMm: e.y ?? null, loadKg: e.loadKg ?? null },
      });
    });
    // W7: one FILL assembly per drawer, its parts in it; the closed volume of the box and its runners is its box.
    (s.drawers as Rec[]).forEach((dr, k) => {
      const id = dr.id + FILL_SUFFIX,
        unit = (m.drawerUnits as Rec[]).find((u) => u.id === dr.id)!,
        box = productBox(unit.box);
      for (const pid of dr.partIds) fillOfPart.set(pid, id);
      assemblies.push({
        id,
        kind: 'FILL',
        parentId: s.id,
        inputRef: cfg.filling?.drawer?.[k]?.id ?? null,
        box: { minMm: [...box.min] as Vec3, sizeMm: box.max.map((x, i) => x - box.min[i]!) as Vec3 },
        index: elements.length + k,
        frame: null,
        span: null,
        frontGrid: null,
        request: { type: 'drawer', elementId: dr.id, mode: dr.mode, yMm: dr.bottom, boxHeightMm: dr.boxHeight, gapAboveMm: dr.gapAbove ?? null, placement: unit.placement, shiftMm: unit.shiftMm },
      });
    });
  });

  // ---- parts: one per carcass part of the model, same order and ids
  /** The cut for the room skirting through the whole thickness is the contour of the part; a partial one is not (198). */
  const skirtingCuts = (p: Rec, f: PartFrame) =>
      ((p.constructionCuts ?? []) as Rec[])
        .filter((c) => c.kind === 'skirting')
        .map((c) => {
          const box = productBox(c.worldBox),
            a = localPoint(f.placement, box.min),
            b = localPoint(f.placement, box.max),
            range = (i: number): [number, number] => [Math.min(a[i]!, b[i]!), Math.max(a[i]!, b[i]!)],
            n = range(2);
          return { cut: c, u: range(0), v: range(1), through: n[0] <= Number.EPSILON && n[1] >= p.T - Number.EPSILON };
        }),
    skirtingContour = (p: Rec, f: PartFrame) => {
      const through = skirtingCuts(p, f).filter((c) => c.through);
      return through.length === 1 ? cutContour(p.L, p.W, through[0]!.u, through[0]!.v) : null;
    };
  const parts: Part[] = [];
  for (const p of m.parts) {
    const f = frames.get(p.id)!,
      edges = {} as Record<EdgeSlot, EdgeBand>;
    for (const slot of ['A', 'B', 'C', 'D'] as const) {
      const e = f.physicalOf[slot],
        intent = p.effectiveEdgeIntents?.[e] ?? 'NONE',
        known = intent !== 'UNKNOWN',
        thickness = known ? edgeIntentThicknessMm(intent) : 0;
      edges[slot] = {
        slot,
        physicalEdge: f.physicalEdgeOf[slot],
        edgeLengthMm: slot === 'A' || slot === 'B' ? p.L : p.W,
        intent,
        edgeBandThicknessMm: thickness,
        effectiveEdgeBandThicknessMm: known ? thickness : null,
        profileCode: p.effectiveEdges?.[e] ?? 'NONE',
        automaticIntent: p.automaticEdgeIntents?.[e] ?? 'NONE',
        override: p.edgeOverrides?.[e] ?? 'AUTO',
        exposure: (p.floorContactEdges ?? []).includes(e) ? 'FLOOR' : intent === 'NONE' ? 'HIDDEN' : 'VISIBLE',
        ruleId: 'r1 applyEdgeModelToPart',
      };
    }
    const purchased = p.supplyMode === 'PURCHASED',
      contour = skirtingContour(p, f);
    parts.push({
      id: p.id,
      name: p.name,
      assemblyId: fillOfPart.get(p.id) ?? p.sectionId ?? p.moduleId ?? WARDROBE_PRODUCT_ID,
      inputRef: null,
      role: wardrobePartRole(p),
      structuralRole: DRAWER_STRUCTURAL_ROLES[p.kind] ?? WARDROBE_STRUCTURAL_ROLES[p.role] ?? 'NONE',
      handedness: p.handedness === 'left' ? 'LEFT' : p.handedness === 'right' ? 'RIGHT' : 'NONE',
      material: {
        family: p.materialFamily,
        // A ready-made door shows the decor it is ordered in (its reference decor, FINDINGS 266, 705).
        decorId: p.materialSelection?.decorId ?? p.materialSelection?.referenceDecor ?? (p.materialFamily === 'HDF' ? 'HDF' : material),
        variantId: boardVariant(p, material),
        label: p.materialSelection?.label ?? material,
        panelThicknessMm: p.T,
        sheetFormatMm: null,
        purpose: purchased ? 'PURCHASE' : 'MANUFACTURE',
        // MOD-DEC-483: the bands of the visible edges in the colour of the facades, when the project chose it.
        ...(p.materialSelection?.edgeDecorId ? { edgeDecorId: p.materialSelection.edgeDecorId } : {}),
      },
      finishedWithEdge: { lengthMm: p.L, widthMm: p.W, panelThicknessMm: p.T },
      dimensionChain: deriveDimensionChain({ lengthMm: p.L, widthMm: p.W }, edges, prototypeAllowance(), prototypeAllowance()),
      placement: f.placement,
      orientation: {
        family: f.family,
        handedness: p.handedness === 'left' ? 'LEFT' : p.handedness === 'right' ? 'RIGHT' : 'NONE',
        faceNames: { N_POS: f.faceOf.N_POS, N_NEG: f.faceOf.N_NEG },
        faceNormals: f.normals,
        grainDirection: p.texture === 'L' ? 'ALONG_LENGTH' : p.texture === 'W' ? 'ALONG_WIDTH' : 'NONE',
      },
      edges,
      contourMm: contour,
      ...(contour ? { contourEdges: contourEdgesOfSlots(contour, p.L, p.W, edges, near) } : {}),
      supply: purchased ? 'PURCHASED' : 'MANUFACTURED',
      operationIds: [],
      installationElevationMm: p.installationHeight ?? null,
      qualification: { physical: false, cnc: false, reasons: p.requiresTechnologyConfirmation ? ['Требуется технологическое подтверждение узла'] : [] },
    });
  }
  const graphPart = new Map(parts.map((p) => [p.id, p]));

  // ---- joints: the connections of the model, the bearing contacts, the rebate of the back panel
  const joints: Joint[] = [],
    f7 = new Map<string, Rec>((m.fastenersR7?.joints ?? []).map((j: Rec) => [j.id, j])),
    holesOf = new Map<string, Rec[]>();
  for (const h of m.holes) holesOf.set(h.connectionId, [...(holesOf.get(h.connectionId) ?? []), h]);
  const sideName = (partId: string, face: string | null | undefined) => (face ? frames.get(partId)!.sideOf[face] ?? null : null);
  const jointBase = (id: string, kind: JointKind, through: string, receiving: string, profileId: string): Joint => ({
    id,
    kind,
    parts: { throughPartId: through, receivingPartId: receiving },
    contact: contactOf(boxes.get(through)!, boxes.get(receiving)!),
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
  /** Station of a hole along its joint: the prototype's own coordinate of the pair (FINDINGS 216). */
  const stationOf = (h: Rec): number => h.f7Operation?.station ?? h.positionAlongRail ?? h.floorOffset ?? (h.mode === 'edge' ? h.offset : h.y);
  for (const c of m.connections) {
    // A local partition whose support is lost has nothing to be fixed to (MOD-DEC-234): said below, no joint.
    if (c.b === null) continue;
    // A hinge and the runners of a drawer are mechanisms, not joints of two panels (below).
    if (c.type === 'hinge' || c.type === 'drawerSlide') continue;
    // The bottom of a drawer in the grooves of its four walls: a groove fit with each of them (W7).
    if (c.type === 'drawerBottomGroove') {
      for (const wall of String(c.b).split('/')) {
        const j = jointBase(`${c.id}/${wall}`, 'GROOVE_FIT', c.a, wall, c.resolvedMachiningProfileId);
        j.reason = c.fastener;
        j.assembly = 'OK';
        j.visibility = { exposed: false, covered: true, internalPartition: false, role: 'DRAWER_BOTTOM' };
        joints.push(j);
      }
      continue;
    }
    const own = holesOf.get(c.id) ?? [],
      plan = f7.get(c.id),
      kind: JointKind = c.type === 'woodenDowel' ? 'DOWEL' : c.type === 'eccentricShelf' ? 'CAM_CONNECTOR' : c.type === 'confirmat' || c.type === 'fixedShelf' ? 'CONFIRMAT' : 'SCREW',
      pair = [c.a, c.b],
      by = (test: (h: Rec) => boolean) => pair.find((id) => own.some((h) => h.panel === id && test(h))),
      through = by((h) => h.depth === 'through') ?? by((h) => h.f7Operation?.role === 'CAM') ?? by((h) => h.mode === 'face') ?? c.a,
      receiving = pair.find((id) => id !== through)!,
      profileId = c.jointType === 'FASTENERS_R7' ? c.fastener : c.type === 'woodenDowel' ? `WOODEN_DOWEL_${c.connector.diameter}X${c.connector.length}` : c.type === 'confirmat' ? (c.fastenerPresetId ?? FASTENER_PRESETS.CONFIRMAT_7X50.id) : String(c.type === 'moduleConnector' ? 'furnitureConnectingBolt' : c.type),
      j = jointBase(c.id, kind, through, receiving, profileId),
      first = (partId: string) => own.find((h) => h.panel === partId && h.f7Operation?.role !== 'CAM'),
      faceOrSlot = (h: Rec | undefined) => (h ? (h.mode === 'face' ? sideName(h.panel, h.face) : frames.get(h.panel)!.slotOf[physicalOfSlot(partById.get(h.panel)!, h.edge)]) ?? '' : '');
    j.stationsMm = [...new Set(own.filter((h) => h.panel === receiving).map(stationOf))];
    j.faces = { through: faceOrSlot(first(through)), receiving: faceOrSlot(first(receiving)), outer: sideName(through, c.fastenerHeadFace), cup: null };
    j.visibility = { exposed: !!c.visibleFastenerHead, covered: false, internalPartition: partById.get(c.a)?.kind === 'divider' || partById.get(c.b)?.kind === 'divider', role: c.role ?? c.subtype ?? c.type };
    j.dowelCount = kind === 'DOWEL' ? own.filter((h) => h.panel === receiving).length : 0;
    j.reason = c.fastener;
    if (plan) {
      j.stationsMm = [...plan.stations];
      j.assembly = plan.errors?.length ? 'IMPOSSIBLE' : plan.decision?.choice === 'UNKNOWN' ? 'UNKNOWN' : 'OK';
      j.reason = [plan.decision?.reason, ...(plan.errors ?? []).map((e: Rec) => e.code)].filter(Boolean).join('; ');
      j.faces.outer = sideName(plan.anchor.id, plan.outerFace);
      j.faces.cup = kind === 'CAM_CONNECTOR' ? sideName(plan.edge.id, plan.cupFace) : null;
      j.visibility = { exposed: plan.externallyVisible, covered: plan.covered, internalPartition: plan.internalPartition, role: plan.role };
      j.opposed = { opposed: !!plan.opposed, minWebMm: null };
      j.dowelCount = (m.fastenersR7.woodItems ?? []).filter((w: Rec) => w.jointId === c.id).length;
    } else if (kind === 'CONFIRMAT') j.assembly = 'OK';
    if (c.type === 'moduleConnector') j.reason = m.moduleConnectors.find((x: Rec) => x.id === c.id)?.message ?? c.fastener;
    if (c.type === 'confirmat' && !c.subtype) j.connectionRole = partById.get(receiving)?.kind === 'bottom' || partById.get(through)?.kind === 'bottom' ? (partById.get(c.a)?.kind === 'divider' ? 'DIVIDER_BOTTOM' : 'BOTTOM') : 'TOP';
    joints.push(j);
  }
  for (const s of m.supportContacts) {
    const j = jointBase(s.id, 'BEARING_CONTACT', s.from, s.to, 'BEARING_CONTACT');
    j.reason = s.loadTransfer;
    j.visibility = { exposed: false, covered: true, internalPartition: false, role: s.type };
    j.assembly = 'OK';
    joints.push(j);
  }

  // ---- operations: holes of the joints, the rebate (grooves and notches of the back panel)
  const operations: Operation[] = [],
    basisOf = (op: Rec) => ({ datum: 'FINISHED_PART_WITH_EDGE', stage: 'POST_EDGING', transform: op.dimensionTransformId ?? DE_VERSION }) as const,
    jointById = new Map(joints.map((j) => [j.id, j]));
  function physicalOfSlot(p: Rec, slot: string): string {
    return Object.entries(edgeGeometryForPart(p)).find(([, g]) => g.slot === slot)![0];
  }
  for (const h of m.holes) {
    const p = partById.get(h.panel)!,
      f = frames.get(h.panel)!,
      face = h.mode === 'face',
      j = jointById.get(h.connectionId),
      f7op: Rec | undefined = h.f7Operation,
      op: Hole = {
        op: 'HOLE',
        id: `${h.panel}/${h.operationId}`,
        partId: h.panel,
        mode: face ? 'FACE' : 'EDGE',
        face: face ? f.sideOf[h.face]! : null,
        edge: face ? null : f.slotOf[physicalOfSlot(p, h.edge)]!,
        xMm: face ? h.x : h.offset,
        yMm: face ? h.y : 0,
        diameterMm: h.diameter,
        depthMm: h.depth === 'through' ? null : h.depth,
        through: h.depth === 'through',
        layer: 'DRILL',
        machiningRole: h.machiningRole ?? f7op?.role ?? (h.connectorType === 'woodenDowel' ? (face ? 'DOWEL_FACE' : 'DOWEL_EDGE') : 'UNKNOWN'),
        purpose: h.purpose,
        code: h.code,
        owner: h.mechanismId ? { mechanismId: h.mechanismId } : h.shelfSupportId ? { mechanismId: h.shelfSupportId } : { jointId: h.connectionId },
        fastenerProfileId: h.fastenerPresetId ?? (f7op ? (j?.profileId ?? null) : null),
        axisOffsetMm: face ? null : p.T / 2,
        entryMm: [0, 0, 0],
        inwardNormal: [0, 0, 0],
        stationMm: h.mechanismId ? h.hingeStation : stationOf(h),
        // MOD-DEC-277: the holes of a hinge are the kit's or the catalogue's, those of a shelf support the manufacturer's
        // catalogue with the page; the carcass fasteners are the rules'.
        source: h.catalogRef ? 'MANUFACTURER_CATALOG' : (h.holeSource ?? 'RULE'),
        sourceRef: h.catalogRef ? `${h.catalogRef.doc} sha256:${h.catalogRef.sha256} · ${h.catalogRef.page}` : (h.holeSourceRef ?? h.sourceBasis ?? null),
        completeness: h.completeness ?? 'COMPLETE',
        status: h.status ?? 'ENGINEERING_DRAFT',
        basis: basisOf(h),
      };
    const at = holeEntry(f.placement, p as { L: number; W: number; T: number }, op);
    op.entryMm = at.entryMm;
    op.inwardNormal = at.inwardNormal;
    operations.push(op);
    graphPart.get(h.panel)!.operationIds.push(op.id);
  }
  for (const mod of m.modules) {
    const back = partById.get(mod.panelIds.back);
    if (!back) continue;
    // MOD-DEC-701: a back in parts — each part sits in the rebate of the panels at the edges it keeps; the grooves and
    // the notch of a panel belong to the joint of the first part at it.
    const pieces: Rec[] = back.backPiece ? m.parts.filter((x: Rec) => x.backPiece?.backId === back.id) : [back];
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const p = partById.get(mod.panelIds[side]);
      if (!p) continue;
      const own = m.grooves.filter((g: Rec) => g.panel === p.id && g.dpOwners?.includes(back.id));
      if (!own.length && !p.rearNotch) continue;
      const at = pieces.filter((x) => !x.backPiece || x.backPiece[side]),
        [j] = at.map((piece) => {
          const pj = jointBase(`${piece.id}/REBATE/${p.id}`, 'GROOVE_FIT', piece.id, p.id, mod.geometry.back.id);
          pj.reason = `Четверть задника: ${mod.geometry.back.status}`;
          pj.visibility = { exposed: false, covered: true, internalPartition: false, role: 'BACK_REBATE' };
          pj.connectionRole = 'BACK';
          joints.push(pj);
          return pj;
        });
      if (!j) continue;
      const f = frames.get(p.id)!;
      for (const g of own) {
        const groove: Groove = {
          op: 'GROOVE',
          id: `${p.id}/${g.operationId}`,
          partId: p.id,
          face: f.sideOf[g.face] ?? null,
          edge: null,
          along: g.orientation === 'W' ? 'WIDTH' : 'LENGTH',
          startMm: g.start,
          endMm: g.end,
          offsetMm: g.offset,
          grooveWidthMm: g.width,
          grooveDepthMm: g.depth,
          semanticType: g.semanticType,
          purpose: g.purpose,
          owner: { jointId: j.id },
          resolution: { profileId: g.resolvedMachining.profileId, productionConfirmed: g.resolvedMachining.productionConfirmed, requiresTechnologyConfirmation: g.resolvedMachining.requiresTechnologyConfirmation },
          basis: basisOf(g),
        };
        operations.push(groove);
        graphPart.get(p.id)!.operationIds.push(groove.id);
      }
      if (p.rearNotch) {
        const box = productBox(p.rearNotch),
          a = localPoint(f.placement, box.min),
          b = localPoint(f.placement, box.max),
          range = (i: number): [number, number] => [Math.min(a[i]!, b[i]!), Math.max(a[i]!, b[i]!)],
          notch: Notch = { op: 'NOTCH', id: `${p.id}/REAR-NOTCH`, partId: p.id, uRangeMm: range(0), vRangeMm: range(1), nRangeMm: range(2), purpose: 'Выборка четверти задника', owner: { jointId: j.id }, basis: basisOf(p) };
        operations.push(notch);
        graphPart.get(p.id)!.operationIds.push(notch.id);
      }
    }
  }
  // MOD-DEC-701: the parts of a back are screwed to the rear edge of the partition or the fixed shelf of their seam, by
  // the fitters, without drilling: screws 3,5 × 16 not farther apart than the pitch (Д), a station each, along the
  // seam; where there is no support they meet in an H-profile.
  const seamJoints = new Map<string, Joint>();
  for (const s of (m.backSeams ?? []) as Rec[]) {
    if (s.supportId)
      for (const id of s.partIds as string[]) {
        const key = `${id}/BACK-SEAM/${s.supportId}`,
          screws = backSeamScrews(s.from, s.to),
          seen = seamJoints.get(key);
        // A part beside a section split on a shelf meets both parts of it on the same partition: one joint, its screws along both.
        if (seen) {
          seen.stationsMm.push(...screws);
          continue;
        }
        const j = jointBase(key, 'SCREW', id, s.supportId, 'BACK_SEAM_SCREW');
        seamJoints.set(key, j);
        j.stationsMm = screws;
        j.reason = `Часть задней стенки привинчена к торцу ${partById.get(s.supportId)?.kind === 'divider' ? 'перегородки' : 'неподвижной полки'} на стыке (MOD-DEC-701)`;
        j.visibility = { exposed: false, covered: true, internalPartition: partById.get(s.supportId)?.kind === 'divider', role: 'BACK_SEAM' };
        j.connectionRole = 'BACK';
        j.drillingExemption = { decision: 'MOD-DEC-701', reason: 'Части задней стенки привинчивают к торцу опоры при сборке саморезами 3,5 × 16 с шагом не больше 300 мм, присадку под них не рассчитываем' };
        joints.push(j);
      }
    else {
      const [a, b] = s.partIds as string[],
        j = jointBase(`${a}/H-PROFILE/${b}`, 'GROOVE_FIT', a!, b!, 'BACK_H_PROFILE');
      j.reason = 'Части задней стенки встык в H-профиле: опоры на стыке нет (MOD-DEC-701)';
      j.visibility = { exposed: false, covered: true, internalPartition: false, role: 'BACK_H_PROFILE' };
      j.connectionRole = 'BACK';
      joints.push(j);
    }
  }
  // The grooves of an inlaid lower guide of a sliding wardrobe belong to its door system (W9.2, FINDINGS 519).
  for (const g of m.grooves.filter((x: Rec) => x.mechanismId)) {
    const groove: Groove = {
      op: 'GROOVE',
      id: `${g.panel}/${g.operationId}`,
      partId: g.panel,
      face: frames.get(g.panel)!.sideOf[g.face] ?? null,
      edge: null,
      along: g.orientation === 'W' ? 'WIDTH' : 'LENGTH',
      startMm: g.start,
      endMm: g.end,
      offsetMm: g.offset,
      grooveWidthMm: g.width,
      grooveDepthMm: g.depth,
      semanticType: g.semanticType,
      purpose: g.purpose,
      owner: { mechanismId: g.mechanismId },
      resolution: { profileId: g.resolvedMachining.profileId, productionConfirmed: g.resolvedMachining.productionConfirmed, requiresTechnologyConfirmation: g.resolvedMachining.requiresTechnologyConfirmation },
      basis: basisOf(g),
    };
    operations.push(groove);
    graphPart.get(g.panel)!.operationIds.push(groove.id);
  }
  // The grooves of the drawer bottoms (W7): owned by the groove fit of the bottom with that wall.
  for (const g of m.grooves.filter((x: Rec) => x.drawerId)) {
    const f = frames.get(g.panel)!,
      groove: Groove = {
        op: 'GROOVE',
        id: `${g.panel}/${g.operationId}`,
        partId: g.panel,
        face: f.sideOf[g.face] ?? null,
        edge: null,
        along: g.orientation === 'W' ? 'WIDTH' : 'LENGTH',
        startMm: g.start,
        endMm: g.end,
        offsetMm: g.offset,
        grooveWidthMm: g.width,
        grooveDepthMm: g.depth,
        semanticType: g.semanticType,
        purpose: g.purpose,
        owner: { jointId: `${g.drawerId}-C-BOTTOM/${g.panel}` },
        resolution: { profileId: g.resolvedMachining.profileId, productionConfirmed: g.resolvedMachining.productionConfirmed, requiresTechnologyConfirmation: g.resolvedMachining.requiresTechnologyConfirmation },
        basis: basisOf(g),
      };
    operations.push(groove);
    graphPart.get(g.panel)!.operationIds.push(groove.id);
  }
  for (const j of joints) {
    const own = operations.filter((o): o is Hole => o.op === 'HOLE' && 'jointId' in o.owner && o.owner.jointId === j.id);
    if (!j.faces.through) j.faces.through = own.find((o) => o.partId === j.parts.throughPartId)?.face ?? '';
    if (!j.faces.receiving) j.faces.receiving = own.find((o) => o.partId === j.parts.receivingPartId)?.edge ?? '';
  }

  // ---- mechanisms: temporary legs (G07), the anti-tip restraint and its installation requirement
  const mechanisms: Mechanism[] = [],
    installationRequirements: InstallationRequirement[] = [],
    capabilities: CapabilityResolution[] = [];
  const fit: WardrobeFittings | undefined = m.fittings;
  for (const hw of m.hardwarePlaceholders) {
    // FIT (MOD-DEC-480): the legs of the catalogue in place of the placeholder of the body; their load is not computed
    // (482) — a leg is a placeholder only when no leg of the catalogue gives the height.
    const legs = hw.type === 'fixedLegs' ? fit?.legs.find((x) => x.id === hw.id) : undefined,
      reason = legs ? legReason(legs) : hw.message,
      status = reason === null ? 'RESOLVED' : 'PLACEHOLDER';
    capabilities.push({ capability: hw.id, status, reasons: reason === null ? [] : [reason] });
    if (hw.type !== 'fixedLegs') continue;
    const mod = m.modules.find((x: Rec) => x.id === hw.scope);
    mechanisms.push({
      id: hw.id,
      kind: 'SUPPORT_LEG',
      partIds: [mod.panelIds.left, mod.panelIds.right, mod.panelIds.bottom].filter((id: string) => partById.has(id)),
      assemblyId: hw.scope,
      profile: { catalogId: legs?.legId ?? 'UNKNOWN', compatibilityProfileId: null, version: legs ? release.version : null },
      // Behind a decorative plinth (483) the clips of the plinth on the front row are of the legs' mechanism.
      params: legs ? { heightMm: hw.height, article: legs.article, priceRub: legs.priceRub, ...(legs.clips ? { clipArticle: legs.clips.article, clips: legs.clips.quantity } : {}) } : { heightMm: hw.height },
      stationsMm: legs ? legs.stationsMm.flat() : [],
      motionEnvelopes: [],
      capability: { status, reason },
      quantity: legs?.quantity ?? 0,
      drillingExemption: null,
      ...(legs ? { visuals: legs.visuals } : {}),
    });
  }
  const anti = m.antiTipSystem,
    req = anti.installationRequirement;
  for (const mod of m.modules) {
    const zones = anti.zones.filter((z: Rec) => z.moduleId === mod.id);
    mechanisms.push({
      id: `${mod.id}-ANTI-TIP`,
      kind: 'ANTI_TIP',
      partIds: [...new Set<string>(zones.flatMap((z: Rec) => z.linkedPanels))].filter((id) => partById.has(id)),
      assemblyId: mod.id,
      profile: { catalogId: req.anchorSku ?? 'UNKNOWN', compatibilityProfileId: null, version: null },
      params: { zones: zones.length, riskEmphasis: anti.riskEmphasis },
      stationsMm: [],
      motionEnvelopes: [],
      capability: { status: 'HOLD', reason: anti.warning },
      quantity: zones.length,
      drillingExemption: null,
    });
  }
  installationRequirements.push({ id: req.id, type: req.type, required: req.required, targetPartIds: [...req.structuralTargetPartIds], selection: req.anchorSelection, text: req.warning });
  // The hinges of the doors (task W4): one mechanism per door, the pair of the table, its count, stations, drilling.
  for (const h of m.hingeMechanisms ?? []) mechanisms.push(hingeMechanism(h, release));
  // The lifts of the lift fronts (task LIFT): one FACADE_LIFT per front, the row of INV-D18-01, the angle of INV-D18-02.
  for (const x of m.liftMechanisms ?? []) mechanisms.push(liftMechanism(x, release));
  // The sliding doors (task W9.2): one mechanism of the system with the inserts of its leaves.
  if (m.sliding) mechanisms.push(slidingMechanism(m.sliding));

  // ---- fill (W6): the shelf supports of each removable shelf (MOD-DEC-193, 332, 344) and the clothes rods (233, 290)
  for (const sup of m.shelfSupports as Rec[]) {
    const own = m.holes.filter((h: Rec) => h.shelfSupportId === sup.id),
      chosen = sup.selection.chosen,
      known = !!chosen && sup.axisElevationMm !== null && sup.scheme?.completeness === 'COMPLETE',
      status: Mechanism['capability']['status'] = !chosen ? 'HOLD' : known && chosen.status === 'OK' ? 'RESOLVED' : 'PLACEHOLDER',
      reason = !chosen ? sup.selection.reason : status === 'RESOLVED' ? null : [...chosen.checks.filter((c: Rec) => c.status === 'UNKNOWN').map((c: Rec) => c.text), ...(sup.scheme?.missing ?? [])].join('; ') || 'Положение оси полкодержателя не известно',
      panels = [...new Set<string>(own.map((h: Rec) => h.panel))];
    mechanisms.push({
      id: sup.id,
      kind: 'SHELF_SUPPORT',
      partIds: [sup.shelfId, ...panels.filter((id) => id !== sup.shelfId)],
      assemblyId: fillOfPart.get(sup.shelfId)!,
      profile: { catalogId: sup.supportId ?? 'UNKNOWN', compatibilityProfileId: null, version: release.version },
      params: {
        tier: sup.tier,
        axisAboveLowerFaceMm: sup.axisAboveLowerMm,
        axisElevationMm: sup.axisElevationMm,
        kitPriceRub: sup.kit?.priceRub ?? null,
        // The colour of the body matched to the decor of the shelf (344); null while it is not known.
        colour: sup.kit?.parts.find((x: Rec) => x.colour)?.colour ?? null,
        // The distance of the bores of the shelf from its end by the scheme of the kit; INV-H02 lets such a bore open
        // to the end of the shelf only there (MOD-DEC-365, FINDINGS 272). null — no bores in the shelf or not one distance.
        shelfBoreFromEndMm: shelfBoreFromEnd(sup.scheme),
        mainHoles: own.filter((h: Rec) => h.purpose === 'Полкодержатель').length,
        spareHoles: own.filter((h: Rec) => h.system32Level === 'spare').length,
      },
      stationsMm: [...sup.linesFromFrontMm],
      motionEnvelopes: [],
      capability: { status, reason },
      quantity: chosen ? sup.scheme?.quantity ?? 0 : 0,
      drillingExemption: null,
    });
    capabilities.push({ capability: sup.id, status, reasons: reason ? [reason] : [] });
  }
  for (const s of m.sectionsData as Rec[]) {
    const mod = m.modules.find((x: Rec) => x.id === s.moduleId),
      rows: Rec[] = sections[s.index]?.filling?.rod ?? [],
      panels = sectionSidePanels(m, s).filter((id) => partById.has(id));
    for (const e of s.interiorElements.filter((e: Rec) => e.type === 'rod')) {
      const row = rows[s.rodYs.indexOf(e.y)],
        rod = fit?.rods.find((x) => x.id === e.id),
        reason = rod
          ? rodReason(rod)
          : `Штанга ${row?.system ?? 'BASE_ROD'}: каталога штанг нет — профиль, высота сечения и опоры ${row?.supportKit ?? 'BASE_AUTOMATIC_PAIR'} не выбраны (MOD-DEC-233); положение — ось штанги`,
        axis = mod.geometry.interiorBottomY + e.y;
      mechanisms.push({
        id: e.id,
        kind: 'CLOTHES_ROD',
        partIds: panels,
        assemblyId: e.id + FILL_SUFFIX,
        profile: rod ? { catalogId: rod.seriesId, compatibilityProfileId: rod.holderArticle, version: release.version } : { catalogId: row?.system ?? 'BASE_ROD', compatibilityProfileId: row?.supportKit ?? null, version: null },
        params: {
          axisElevationMm: axis,
          axisFromInteriorBottomMm: e.y,
          topElevationMm: rod ? axis + rod.sectionHeightMm / 2 : null,
          depthAxisMm: row?.depthAxis ?? null,
          spanMm: s.clearOpeningWidth,
          loadKg: e.loadKg,
          ...(rod ? { article: rod.article, stockLengthMm: rod.stockLengthMm, cutLengthMm: rod.cutLengthMm, holders: rod.holders, priceRub: rod.priceRub, holderPriceRub: rod.holderPriceRub } : {}),
        },
        stationsMm: [e.y],
        motionEnvelopes: [],
        capability: { status: reason === null ? 'RESOLVED' : 'PLACEHOLDER', reason },
        quantity: 1,
        // MOD-DEC-482: the holders of a rod of the catalogue are screwed on by the fitters on site, as the handles (158).
        drillingExemption: rod ? { decision: 'MOD-DEC-482', reason: 'Держатели штанги привинчивают монтажники на месте: присадку под них не рассчитываем' } : null,
        ...(rod ? { visuals: rod.visuals } : {}),
      });
      capabilities.push({ capability: e.id, status: reason === null ? 'RESOLVED' : 'PLACEHOLDER', reasons: reason === null ? [] : [reason] });
    }
  }
  // FIT (MOD-DEC-480): a handle of the catalogue on each front; no drilling — the fitters drill for it (MOD-DEC-158).
  for (const h of fit?.handles ?? []) {
    mechanisms.push({
      id: h.id,
      kind: 'HANDLE',
      partIds: [h.partId],
      assemblyId: graphPart.get(h.partId)!.assemblyId,
      profile: { catalogId: h.handleId, compatibilityProfileId: null, version: release.version },
      params: { article: h.article, orientation: h.orientation, centreXMm: h.centreMm[0], centreYMm: h.centreMm[1], centreZMm: h.centreMm[2], priceRub: h.priceRub },
      stationsMm: [],
      motionEnvelopes: [],
      capability: { status: 'RESOLVED', reason: null },
      quantity: 1,
      drillingExemption: { decision: 'MOD-DEC-158', reason: 'Присадку под ручки не рассчитываем: её делают монтажники; в 3D — модель ручки' },
      visuals: h.visuals,
    });
  }
  // MOD-DEC-483: the light of each lit section, screwed under its panel on site; the power supply of them all.
  for (const l of fit?.lights ?? []) {
    mechanisms.push({
      id: l.id,
      kind: 'LIGHT',
      partIds: [l.mountPartId],
      assemblyId: l.sectionId,
      profile: { catalogId: l.lightId, compatibilityProfileId: null, version: release.version },
      params: { article: l.article, lengthMm: l.lengthMm, powerW: l.powerW, mountElevationMm: l.mountElevationMm, priceRub: l.priceRub },
      stationsMm: [],
      motionEnvelopes: [],
      capability: { status: 'RESOLVED', reason: null },
      quantity: 1,
      drillingExemption: { decision: 'MOD-DEC-483', reason: 'Светильник привинчивают монтажники на месте: присадку под него не рассчитываем' },
      visuals: l.visuals,
    });
  }
  // MOD-DEC-485: the latch of a door opened by pressing, in the front edge of the panel behind it; its hole is the
  // manufacturer's (277) and is drilled with the carcass — no exemption.
  for (const l of fit?.pushLatches ?? []) {
    mechanisms.push({
      id: l.id,
      kind: 'PUSH_LATCH',
      partIds: [l.panelId, l.doorId],
      assemblyId: graphPart.get(l.doorId)!.assemblyId,
      profile: { catalogId: l.latchId, compatibilityProfileId: null, version: release.version },
      params: { article: l.article, axisXMm: l.xMm, axisElevationMm: l.elevationMm, priceRub: l.priceRub },
      stationsMm: [l.xMm],
      motionEnvelopes: [],
      capability: { status: 'RESOLVED', reason: null },
      quantity: 1,
      drillingExemption: null,
    });
    capabilities.push({ capability: l.id, status: 'RESOLVED', reasons: [] });
  }
  // MOD-DEC-484: the baskets, trouser racks and pantographs of the sections, screwed to their panels (or spacers) by
  // the marking of their kit on site; a pull-out takes its closed volume as a drawer does.
  for (const x of fit?.storage ?? []) {
    const unit = ((m.storageUnits ?? []) as Rec[]).find((u) => u.id === x.id)!,
      b = productBox(unit.box);
    mechanisms.push({
      id: x.id,
      kind: x.kind === 'PANTOGRAPH' ? 'PANTOGRAPH' : x.kind === 'TROUSER_RACK' ? 'TROUSER_RACK' : 'BASKET',
      partIds: x.mountPartIds.filter((id) => partById.has(id)),
      assemblyId: x.sectionId,
      profile: { catalogId: x.itemId, compatibilityProfileId: x.colour, version: release.version },
      params: {
        ...(x.kind === 'LINEN_BASKET' || x.kind === 'SHOE_BASKET' ? { contents: x.kind === 'LINEN_BASKET' ? 'LINEN' : 'SHOES' } : {}),
        article: x.article,
        colour: x.colour,
        widthMm: x.widthMm,
        heightMm: x.heightMm,
        depthMm: x.depthMm,
        bottomElevationMm: x.bottomElevationMm,
        axisElevationMm: x.axisElevationMm,
        loadKg: x.loadKg,
        marks: x.marksMm.length,
        priceRub: x.priceRub,
      },
      stationsMm: [x.axisElevationMm],
      motionEnvelopes: [{ minMm: b.min, sizeMm: [0, 1, 2].map((i) => b.max[i]! - b.min[i]!) as Vec3 }],
      capability: { status: x.problem ? 'PLACEHOLDER' : 'RESOLVED', reason: x.problem },
      quantity: 1,
      drillingExemption: { decision: 'MOD-DEC-484', reason: 'Раму привинчивают монтажники на месте по разметке комплекта (Ø3 × 1): присадку под неё не рассчитываем' },
      visuals: x.visuals,
      ...(x.model ? { model: x.model } : {}),
    });
    capabilities.push({ capability: x.id, status: x.problem ? 'PLACEHOLDER' : 'RESOLVED', reasons: x.problem ? [x.problem] : [] });
  }
  if (fit?.powerSupply) {
    const p = fit.powerSupply;
    mechanisms.push({
      id: p.id,
      kind: 'POWER_SUPPLY',
      partIds: [],
      assemblyId: WARDROBE_PRODUCT_ID,
      profile: { catalogId: p.supplyId, compatibilityProfileId: null, version: release.version },
      // FINDINGS 3421, 3422, 3424, 3425: the reserves of the makers of the lights and of the supply, the distributors and
      // the mains cords are of the supply's mechanism.
      params: {
        article: p.article,
        loadW: p.loadW,
        reservePct: p.reservePct,
        supplyReservePct: p.supplyReservePct,
        priceRub: p.priceRub,
        ...(p.distributor ? { distributorArticle: p.distributor.article, distributors: p.distributor.quantity } : {}),
        ...(p.mainsCord ? { cordArticle: p.mainsCord.article, cords: p.mainsCord.quantity } : {}),
      },
      stationsMm: [],
      motionEnvelopes: [],
      capability: { status: 'RESOLVED', reason: null },
      quantity: p.quantity,
      drillingExemption: { decision: 'MOD-DEC-483', reason: 'Блок питания ставят монтажники на месте: присадку под него не рассчитываем' },
    });
  }

  // ---- drawers (W7): one DRAWER_RUNNER per drawer — the pair of runners of the candidate DB4501 (032, WR-16)
  const runnerOf = new Map<string, string>();
  for (const u of (m.drawerUnits ?? []) as Rec[]) {
    const s = m.sectionsData.find((x: Rec) => x.id === u.sectionId),
      dr = (s.drawers as Rec[]).find((x) => x.id === u.id)!,
      id = `${u.id}-C-SLIDE`,
      depth = u.box.z1 - u.box.z0,
      access: Rec | undefined = (m.sliding?.access.drawers as Rec[] | undefined)?.find((x) => x.drawerId === u.id)?.nominal,
      // MOD-DEC-544 (R2-007): an assembled drawer is a kit of the catalogue the project chose, not the candidate of 032.
      // MOD-DEC-514 (FINDINGS 1862): the runner of the level of a new project is a choice of 466, not the candidate of
      // 032; a concealed one with the box and the holes of its kit is resolved, and so is DB4501 of «Эконом» drilled by its
      // BAZIS kit (FINDINGS 2746).
      reason = u.kit || u.runner?.concealed || u.runner?.drilled
        ? null
        : u.runner
          ? `${u.runner.article}: направляющая уровня фурнитуры (MOD-DEC-466, 514), отверстий в каталоге нет; ход ящика и угол открытой двери — заглушки вида до данных каталога (FINDINGS 394)`
          : `${s.drawerSystem.model}: кандидат, а не выбор — стандартная направляющая не выбрана (MOD-DEC-032, WR-16); ход ящика и угол открытой двери — заглушки вида до данных каталога (FINDINGS 394)`;
    runnerOf.set(u.id, id);
    mechanisms.push({
      id,
      kind: 'DRAWER_RUNNER',
      partIds: [...u.partIds, ...u.spacerIds, ...sectionSidePanels(m, s).filter((x) => partById.has(x))],
      assemblyId: u.id + FILL_SUFFIX,
      profile: { catalogId: u.slideId, compatibilityProfileId: null, version: release.version },
      params: {
        mode: u.mode,
        slideLengthMm: u.slideLengthMm,
        clearanceMm: u.clearanceMm,
        boxD: depth,
        boxHeightMm: dr.boxHeight,
        outerWidthMm: dr.outerWidth,
        innerWidthMm: dr.innerWidth,
        bottomMode: u.kit ? 'KIT_BOARD' : u.runner?.concealed ? 'BOARD_ON_RUNNER' : s.drawerSystem.bottomMode,
        ...(u.kit ? { drawerSystem: u.kit.systemId, drawerSystemSeries: u.kit.seriesId, article: u.kit.article, nominalLengthMm: u.kit.nominalMm } : {}),
        ...(u.runner ? { article: u.runner.article, runnerRule: 'LEVEL_466', movingMassKg: u.runner.massKg, loadKg: u.runner.loadKg } : {}),
        travelMm: wardrobeDrawerTravelMm(depth),
        travelBasis: 'PLACEHOLDER',
        openAngleDeg: wardrobeDrawers.constants.doorOpenAngleDeg.value,
        placement: u.placement,
        shiftMm: u.shiftMm,
        spacerMm: (u.spacerIds as string[]).reduce((a, x) => a + partById.get(x)!.T, 0),
        // W9: behind sliding doors — the nominal access of MOD-DEC-175 (sliding-access.ts, FINDINGS 551).
        ...(access ? { slidingAccess: access.status, slidingFreeWidthMm: access.freeWidthMm, slidingMovingWidthMm: access.widthMm } : {}),
      },
      stationsMm: [u.bottomMm],
      motionEnvelopes: [(() => {
        const b = productBox(u.box);
        return { minMm: b.min, sizeMm: [0, 1, 2].map((i) => b.max[i]! - b.min[i]!) as Vec3 };
      })()],
      capability: reason ? { status: 'PLACEHOLDER', reason } : { status: 'RESOLVED', reason: null },
      quantity: 1,
      drillingExemption: null,
    });
    if (reason) capabilities.push({ capability: id, status: 'PLACEHOLDER', reasons: [reason] });
  }
  // FE-04 (050, 053): a hinge left meeting a drawer is a HOLD of the compatibility of the two.
  for (const h of (m.hingeMechanisms ?? []) as Rec[])
    if (h.fe04.conflicts.length) capabilities.push({ capability: `${h.id}/FE-04`, status: 'HOLD', reasons: [h.fe04.text] });

  // ---- loads: one per shelf, the deflection of the prototype (mfShelfDeflection) with its payload (MOD-DEC-289)
  const loads: Load[] = [],
    unknownLoads: Rec[] = [];
  for (const p of m.parts.filter((p: Rec) => p.deflection && FILL_SHELVES.has(p.kind))) {
    const f = p.deflection;
    if (f.status === 'UNKNOWN') {
      unknownLoads.push(p);
      continue;
    }
    loads.push({
      id: p.id + ':load',
      partId: p.id,
      mechanismId: null,
      spanMm: f.span,
      physicalLengthMm: p.L,
      depthMm: f.depth,
      panelThicknessMm: f.thickness,
      selfMassKg: f.selfKg,
      payloadKg: f.cargoKg,
      totalMassKg: f.totalKg,
      youngModulusNPerMm2: f.E,
      secondMomentOfAreaMm4: f.I,
      deflectionMm: f.deflection,
      bendingStressNPerMm2: f.sigma,
      // No deflection limit and no capacity by decision: HOLD (§14.1), UNKNOWN (INV-E19-03).
      deflectionLimitMm: null,
      capacityKg: null,
      screenPass: false,
      physicalQualified: false,
      selfMassBasis: 'SCREEN_SPAN_MASS',
    });
  }

  // ---- unresolved: issues of the model in plain Russian; their level is the decision's, not the prototype's
  const unresolved: Unresolved[] = [],
    issue = (code: string, level: Unresolved['level'], text: string, ruleId: string, blocks: boolean, refs: Partial<Pick<Unresolved, 'partIds' | 'jointIds' | 'mechanismIds'>> = {}) =>
      unresolved.push({ code, level, partIds: refs.partIds ?? [], jointIds: refs.jointIds ?? [], operationIds: [], mechanismIds: refs.mechanismIds ?? [], text, ruleId, blocksProductionReadiness: blocks });
  // MOD-DEC-701: the H-profile between the parts of a back is in no catalogue yet — its article and price are open.
  for (const i of m.constructabilityIssues) issue('CONSTRUCTABILITY', i.level === 'err' ? 'ERROR' : 'WARNING', i.text, 'r1 addPlinthRailConnections', i.level === 'err');
  for (const i of m.floorContactValidation.issues) issue(FLOOR_CONTACT_EDGE_ISSUE, i.level === 'err' ? 'ERROR' : 'WARNING', i.text, 'MOD-DEC-325', false, { partIds: [i.partId] });
  // MOD-DEC-325, 743: an edge the automatic rule bands, left without a band by hand — said in the bell, never refused.
  for (const p of m.parts as Rec[]) for (const w of manualEdgeWarnings(p)) issue(w.code, 'WARNING', w.text, 'MOD-DEC-325', false, { partIds: [p.id] });
  for (const w of m.loadPath.warnings) issue('LOAD_PATH_REVIEW', 'WARNING', w.text, 'r1 loadPathValidator', false);
  for (const w of m.roomInstallation.warnings) issue('ROOM_INSTALLATION', 'WARNING', w.text, 'r1 roomInstallationValidator', false);
  for (const w of m.composition?.warnings ?? []) issue('COMPOSITION_DRAFT', 'WARNING', w, 'MOD-DEC-168', true);
  // MOD-DEC-573, 351: the material of the facades is not the one of the catalogue of the release — chosen again, it holds.
  for (const t of (m.facadeMaterialProblems ?? []) as string[]) issue('FACADE_MATERIAL_CATALOG', 'WARNING', `Материал фасадов: ${t} — выберите материал фасадов заново`, 'MOD-DEC-573', true);
  // MOD-DEC-485: a door opened by pressing without a latch has neither a spring, nor a handle, nor a latch to open it.
  for (const n of (m.pushLatches?.notes ?? []) as { doorId: string; text: string }[])
    issue('PUSH_LATCH_MISSING', 'WARNING', `${n.text}: без пружины и ручки дверь не открыть — нужна ручка или другой фасад (MOD-DEC-485)`, 'MOD-DEC-485', true, { partIds: partById.has(n.doorId) ? [n.doorId] : [] });
  for (const mod of m.modules)
    if (!hasBack(mod) && !(settings.leftWall && settings.rightWall))
      issue('BACK_REMOVED_WITHOUT_WALLS', 'WARNING', `${mod.id}: задняя стенка снята, а стен слева и справа нет — без задника шкаф допускается только в нише (MOD-DEC-168); проект остаётся черновиком`, 'MOD-DEC-168', true, { partIds: [mod.panelIds.left, mod.panelIds.right].filter((id: string) => partById.has(id)) });
  // MOD-DEC-322, п. 3 (200, 049): one section, or no joint to cut at, wider than the 2400 mm guide — one body and a
  // non-blocking warning about its long parts.
  for (const w of bodyWidthWarnings(d.bodies as Body[]))
    issue(w.code, 'WARNING', w.message, 'MOD-DEC-322', false, { partIds: m.parts.filter((p: Rec) => p.moduleId === w.bodyId && partById.has(p.id)).map((p: Rec) => p.id) });
  // MOD-DEC-292: a profile of r7 that does not fit (the thickness of the part, a collision) is said, never masked:
  // the prototype then keeps the holes of its base model in the joint (FINDINGS 217).
  // MOD-DEC-343: a partition too shallow for the staggered rows of the shelves on both its sides is a conflict, shown.
  for (const plan of m.fastenersR7?.joints ?? [])
    if (plan.errors?.some((e: Rec) => e.code === 'SHARED_SHELF_DEPTH'))
      issue(
        'SHARED_SHELF_DEPTH',
        'WARNING',
        `${plan.id}: перегородка глубиной ${+(plan.anchor.box[1][1] - plan.anchor.box[0][1]).toFixed(1)} мм не вмещает задние гнёзда встречной присадки без наложения на передние — полки по обе стороны перегородки не разнесены; в соединении остались отверстия прежней модели — нужна перегородка глубже или решение технолога`,
        'MOD-DEC-343',
        true,
        { partIds: [plan.edge.id, plan.anchor.id], jointIds: [plan.id] },
      );
    else if (plan.errors?.length)
      issue(
        'FASTENER_PLAN_REFUSED',
        'WARNING',
        `${plan.id}: ${plan.profileId ? `профиль ${plan.profileId}` : 'крепёж'} не применим (${plan.errors.map((e: Rec) => e.code).join(', ')}); в соединении остались отверстия прежней модели — нужен профиль под материал и толщину детали или решение технолога`,
        'MOD-DEC-292',
        true,
        { partIds: [...new Set<string>(plan.errors.flatMap((e: Rec) => e.partIds ?? []))], jointIds: [plan.id] },
      );
  // A temporary profile is said, not refused: the constructor keeps the joint (owner, 2026-10-22; FINDINGS 434).
  for (const plan of m.fastenersR7?.joints ?? []) {
    const reason = temporaryProfileReason(plan);
    if (reason)
      issue(
        'FASTENER_PROFILE_TEMPORARY',
        'WARNING',
        `${plan.id}: ${reason}; присадка временно по нему — крепёж под эту толщину нужно подобрать`,
        'MOD-DEC-292',
        false,
        { partIds: [plan.edge.id, plan.anchor.id], jointIds: [plan.id] },
      );
  }
  for (const j of joints.filter((j) => j.kind === 'SCREW' && !j.drillingExemption))
    issue('DRILLING_INCOMPLETE', 'WARNING', `${j.id}: присадка неполная — ${fastenerReasonText(String(j.reason ?? ''))}`, 'MOD-DEC-277', true, { jointIds: [j.id] });
  for (const mech of mechanisms.filter((x) => x.kind === 'SUPPORT_LEG' && x.capability.reason)) issue('HARDWARE_PLACEHOLDER', 'WARNING', mech.capability.reason!, 'MOD-DEC-171', true, { mechanismIds: [mech.id] });
  // MOD-DEC-198: a cut through the part is its contour; a cut in part of the thickness (the bottom) has no contour in
  // the contract and is said with its sizes (FINDINGS 219).
  for (const p of m.parts)
    for (const c of skirtingCuts(p, frames.get(p.id)!))
      issue(
        'SKIRTING_CUT',
        'WARNING',
        `${p.id}: вырез под плинтус высотой ${c.cut.height} мм и глубиной ${c.cut.depth} мм${c.through ? ' — контур детали' : ' в части толщины — контуром не выражается, размеры выреза в тексте'}; производственные припуски не установлены (MOD-DEC-198)`,
        'MOD-DEC-198',
        true,
        { partIds: [p.id] },
      );
  for (const mech of mechanisms.filter((x) => x.kind === 'SHELF_SUPPORT' && x.capability.status !== 'RESOLVED'))
    issue('SHELF_SUPPORT_UNRESOLVED', 'WARNING', `${mech.id}: полкодержатель съёмной полки не подтверждён — ${mech.capability.reason}`, 'MOD-DEC-344', true, { mechanismIds: [mech.id], partIds: mech.partIds.slice(0, 1) });
  // «Эконом»: a plain pin by the explicit choice of the level holds the shelf without retention against sliding — a
  // warning, not a block (MOD-DEC-332; Handbook r8, retention of a removable shelf).
  for (const sup of (m.shelfSupports as Rec[]).filter((x) => x.selection.chosen?.checks.some((c: Rec) => c.code === 'RETENTION' && c.status === 'WAIVED')))
    issue('SHELF_RETENTION_WAIVED', 'WARNING', `${sup.id}: удержание полки от сдвига не обеспечено — «Эконом», полка лежит на штифтах (MOD-DEC-332)`, 'MOD-DEC-332', false, { mechanismIds: [sup.id], partIds: [sup.shelfId] });
  // The kit is bought by its parts: a part not chosen (the colour of the body for a decor outside the catalogue) leaves
  // the list and the price of the kit open (FINDINGS 272).
  for (const sup of (m.shelfSupports as Rec[]).filter((x) => x.kit?.missing.length))
    issue('SHELF_SUPPORT_KIT_INCOMPLETE', 'WARNING', `${sup.id}: комплект полкодержателя не собран — ${sup.kit.missing.join('; ')}`, 'MOD-DEC-344', true, { mechanismIds: [sup.id], partIds: [sup.shelfId] });
  for (const r of m.system32Supports?.rejected ?? [])
    issue('SYSTEM32_SPARE_UNAVAILABLE', 'WARNING', `${r.panel}: запасной уровень ${r.deltaMm} мм недоступен (${r.reason}); основной сохранён`, 'MOD-DEC-193', false, { partIds: [r.panel] });
  for (const mech of mechanisms.filter((x) => x.kind === 'CLOTHES_ROD')) {
    const rod = fit?.rods.find((x) => x.id === mech.id);
    if (mech.capability.reason) issue('HARDWARE_PLACEHOLDER', 'WARNING', mech.capability.reason, rod ? 'MOD-DEC-480' : 'MOD-DEC-233', true, { mechanismIds: [mech.id] });
    // A rod of the catalogue: its holders are mounted on site (MOD-DEC-482) — no drilling to be incomplete.
    if (!rod) issue('DRILLING_INCOMPLETE', 'WARNING', `${mech.id}: присадка опор штанги не задана — комплект опор не выбран (MOD-DEC-233, 277)`, 'MOD-DEC-277', true, { mechanismIds: [mech.id] });
  }
  // MOD-DEC-484: an item of the project with no item that fits, or one that meets the fill, blocks the order; another colour is said.
  for (const u of (m.storageUnits ?? []) as Rec[]) {
    if (u.problem) issue('STORAGE_NOT_PLACED', 'WARNING', u.problem, 'MOD-DEC-484', true, u.itemId ? { mechanismIds: [u.id] } : {});
    if (u.colourNote) issue('STORAGE_COLOUR', 'INFO', u.colourNote, 'MOD-DEC-484', false, { mechanismIds: [u.id] });
  }
  for (const p of unknownLoads) issue('SHELF_LOAD_UNKNOWN', 'WARNING', `${p.id}: ${p.deflection.reason}`, 'MOD-DEC-289', true, { partIds: [p.id] });
  for (const p of m.parts.filter((p: Rec) => p.supportLost))
    issue('LOCAL_PARTITION_SUPPORT_LOST', 'WARNING', `${p.id}: опорная полка локальной перегородки удалена — перегородка без опоры, проверить в «Проблемах» и производственных документах (MOD-DEC-234)`, 'MOD-DEC-234', true, { partIds: [p.id] });
  facadeIssues(m, issue);
  liftIssues(m, issue);
  for (const x of (m.liftMechanisms ?? []) as Rec[]) capabilities.push({ capability: x.id, status: 'PLACEHOLDER', reasons: [liftReason(x)] });
  drawerIssues(m, issue, runnerOf);
  // MOD-DEC-742: an open door that would still come into the path of a drawer pulled out (FINDINGS 3051).
  for (const c of doorDrawerClashes({ parts, mechanisms })) {
    const door = c.doorKey.replace(/^door:/, ''),
      drawer = c.drawerKey.replace(/^drawer:/, '').replace(FILL_SUFFIX, '');
    issue(
      'DOOR_DRAWER_CLASH',
      'WARNING',
      `${door}: открытая дверь заходит в путь ящика ${drawer} на ${fmt(c.mm)} мм — выдвинуть ящик при открытой двери нельзя; нужна проставка толще или другая петля (MOD-DEC-331, 360)`,
      'MOD-DEC-742',
      true,
      { partIds: [door] },
    );
  }
  if (m.sliding) slidingIssues(m.sliding, issue, runnerOf);
  issue('PHYSICAL_QUALIFICATION', 'INFO', 'Крепёж корпуса — номинальный черновик r7: физическая проверка и выпуск в производство не выполнены', 'r1 fastenersR7', true);

  return {
    product: d.slidingWardrobe?.active === true ? 'SLIDING_WARDROBE' : 'WARDROBE',
    versions: {
      engine: ENGINE_CONTRACT_VERSION,
      generator: WARDROBE_GENERATOR,
      ruleSet: RULE_SET_VERSION,
      policies: Object.fromEntries(POLICY_MODULES.map((p) => [p.id, p.version])),
      catalog: input.prototype,
      hardwareCatalog: { version: release.version, sha256: release.sha256 },
      priceSnapshotId: contentDigest(wardrobePriceSnapshot(input, hw)),
      dimensionRule: settings.dimensionRuleVersion ?? DE_VERSION,
    },
    revision: { projectRevisionId: contentDigest(input) },
    coordinateSystem: 'X_RIGHT_Y_BACK_Z_UP_MM',
    envelope: { widthMm: W, heightMm: top - bottom, depthMm: envelopeDepth, installedHeightMm: m.installedHeight, installationOffsetMm: m.installationOffset },
    site: {
      room: d.construction?.room
        ? { widthMm: d.construction.room.width ?? null, heightMm: d.construction.room.ceiling ?? null, depthMm: null }
        : settings.roomHeight
          ? { widthMm: null, heightMm: settings.roomHeight, depthMm: null }
          : null,
      walls: { left: !!settings.leftWall, right: !!settings.rightWall, back: false },
      roomSkirting: settings.roomSkirtingHeight || settings.roomSkirtingDepth ? { heightMm: settings.roomSkirtingHeight, depthMm: settings.roomSkirtingDepth, solution: settings.skirtingSolution } : null,
      wallGapMm: settings.rearWallGap,
    },
    assemblies,
    parts,
    operations,
    joints,
    mechanisms,
    loads,
    unresolved,
    result: aggregateResult(unresolved, capabilities, installationRequirements, false),
  };
}

// ---------------------------------------------------------------- facades and hinges (task W4)

/** The body of the state in the request of its cabinet: the exact width and the parent the front grid reads. */
const bodyRequest = (b: Rec | undefined): Assembly['request'] => (b ? { 'body.width': b.width, 'body.widthExact': JSON.stringify(b.widthExact ?? null), 'body.parent': b.parent ?? null } : {});

/**
 * The front grid of the product (FrontGrid, Handbook TERM-022): the gap profile the doors are built by, a column per
 * section with its exact nominal span, a chain item per column with its exact outer edges and the elevations of its
 * facade field, the physical doors of the item, the overlay of every door over its opening on four sides.
 */
function productFrontGrid(m: Rec): FrontGrid | null {
  const fg = m.frontGrid;
  if (!fg) return null;
  const p = m.facadeGapProfile,
    parts = new Map<string, Rec>(m.parts.map((x: Rec) => [x.id, x])),
    section = (id: string) => m.sectionsData.find((s: Rec) => s.id === id),
    exact = (x: Rec): Rational => ({ numerator: x.numerator, denominator: x.denominator });
  return {
    mode: fg.mode === 'MANUAL' ? 'MANUAL' : 'AUTO',
    facadeWidthPolicy: fg.facadeWidthPolicy,
    gapProfile: {
      profileId: p.profileId,
      facadeGapHorizontalMm: p.seamX,
      facadeGapVerticalMm: p.seamY,
      facadeOuterOffsetLeftMm: p.insetLeft,
      facadeOuterOffsetRightMm: p.insetRight,
      facadeOuterOffsetTopMm: p.insetTop,
      facadeBottomOffsetMm: p.bottomInset ?? 0,
      facadeToCarcassGapMm: m.dimensions?.Gfront ?? 0,
    },
    columns: fg.columns.map((c: Rec) => ({ id: c.id, index: c.index, nominalStartMm: exact(c.exactNominalStart), nominalEndMm: exact(c.exactNominalEnd), status: c.status })),
    facades: fg.facades.map((f: Rec) => {
      const doors = (f.physicalFacadeIds as string[]).map((id) => parts.get(id)!).filter((x) => x?.kind === 'facade'),
        field = m.facadeFields[f.index],
        bottom = doors.length ? Math.min(...doors.map((x) => x.doorBottomClearance)) : field.bottom,
        top = doors.length ? Math.max(...doors.map((x) => x.doorBottomClearance + x.L)) : field.top;
      return { id: f.id, columnId: f.columnId, facadeRowId: null, leftMm: exact(f.exactLeft), rightMm: exact(f.exactRight), bottomElevationMm: ratFromDecimal(bottom), topElevationMm: ratFromDecimal(top), partIds: [...f.physicalFacadeIds], status: f.status };
    }),
    overlays: m.facadeOverlays.map((o: Rec) => {
      const door = parts.get(o.partId)!,
        g = section(door.sectionId).geometry;
      return { facadeId: o.partId, facadeOverlayLeftMm: o.leftMm, facadeOverlayRightMm: o.rightMm, facadeOverlayTopMm: door.doorBottomClearance + door.L - g.interiorTopY, facadeOverlayBottomMm: g.interiorBottomY - door.doorBottomClearance };
    }),
  };
}

/** The hinges of a door as a mechanism: the pair of the table, the count by 190, the stations, the closed volume. */
function hingeMechanism(h: Rec, release: CatalogRelease): Mechanism {
  const unknown = (h.checks as Rec[]).filter((c) => c.status !== 'PASS');
  return {
    id: h.id,
    kind: 'HINGE',
    partIds: [h.doorId, h.panelId],
    assemblyId: h.sectionId,
    profile: { catalogId: h.hingeId ?? 'UNKNOWN', compatibilityProfileId: h.plateId, version: release.version },
    params: {
      position: h.position,
      mounting: h.mounting,
      hingeSide: h.hingeSide,
      panelFace: h.panelFace,
      overlayMm: h.demand.overlayMm,
      cupEdgeDistanceMm: h.cupEdgeDistanceMm,
      cupCentreFromEdgeMm: h.cupCentreFromEdgeMm,
      cupEdgeDistanceBasis: h.basis,
      neighbourGapMm: h.demand.neighbourGapMm,
      depthGapMm: h.demand.depthGapMm,
      massKg: h.massKg,
      massSource: h.massSource,
      countBasis: h.countBasis,
      chart: h.chart ? `${h.chart.hingeId}: ${h.chart.ref}` : null,
      drillingSource: h.drilling.source,
      drillingCompleteness: h.drilling.completeness,
      drawingCheck: h.drawingCheck,
      // W7: Zero protrusion behind an inner drawer (288, 311, 360) and FE-04 (050).
      zeroProtrusionRoute: h.zeroProtrusionRoute,
      openAngleDeg: h.openAngleDeg,
      openStop: h.openStop,
      fe04Policy: h.fe04.policy,
      fe04Moved: h.fe04.moved,
      fe04Branch: h.fe04.branch,
    },
    stationsMm: [...h.stationsMm],
    motionEnvelopes: (h.envelope ?? []).map((b: Rec) => {
      const x = productBox(b as Parameters<typeof productBox>[0]);
      return { minMm: x.min, sizeMm: [0, 1, 2].map((i) => x.max[i]! - x.min[i]!) as Vec3 };
    }),
    capability: { status: h.status === 'OK' ? 'RESOLVED' : 'HOLD', reason: h.status === 'OK' ? null : [h.text, ...unknown.map((c) => c.text)].join('; ') },
    quantity: h.count,
    drillingExemption: null,
  };
}

/** Why a lift is not resolved: the checks of INV-D18-01 that fail or are unknown, the temporary row. */
/**
 * Why a rod of the catalogue stays a placeholder (FIT): only a cut longer than the longest stock length. Its load is not
 * computed and its holders are mounted on site (MOD-DEC-482); null — the rod is resolved.
 */
function rodReason(r: RodFitting): string | null {
  return r.temporary ? `Штанга ${r.article} (${r.cutLengthMm} мм из ${r.stockLengthMm} мм) с держателями ${r.holderArticle} × ${r.holders}: ${r.temporary} — временно (MOD-DEC-480)` : null;
}

/** Why the legs of a body stay a placeholder (FIT): only a height no leg of the catalogue gives; the load of a leg is not computed (MOD-DEC-482). */
function legReason(l: LegFitting): string | null {
  return l.temporary ? `Ножки ${l.name} × ${l.quantity}: ${l.temporary} (MOD-DEC-480)` : null;
}

function liftReason(x: Rec): string {
  const open = (x.checks as Rec[]).filter((c) => c.status !== 'PASS').map((c) => c.text);
  return [x.status === 'SELECTED' ? null : x.text, ...open].filter(Boolean).join('; ') || x.text;
}

/**
 * The lift of a lift front as a mechanism (task LIFT): the row of INV-D18-01 and its checks, the working angle of
 * INV-D18-02 with its source next to the angles of the manufacturer, the swept volume. Never RESOLVED yet: the lift
 * catalogue gives no drilling (277) — PLACEHOLDER, not HOLD (the owner's rule of 2026-10-22, FINDINGS 532).
 */
function liftMechanism(x: Rec, release: CatalogRelease): Mechanism {
  const a = x.workingAngle as Rec | null,
    source = a?.source as Rec | undefined;
  return {
    id: x.id,
    kind: 'FACADE_LIFT',
    partIds: [...x.leafIds, ...x.panelIds],
    assemblyId: x.sectionId,
    profile: { catalogId: x.liftId ?? 'UNKNOWN', compatibilityProfileId: x.article, version: release.version },
    params: {
      frontKind: x.kind,
      selectionStatus: x.status,
      series: x.series,
      carcassHeightMm: x.demand.carcassHeightMm,
      carcassWidthMm: x.demand.carcassWidthMm,
      frontHeightMm: x.demand.frontHeightMm,
      frontThicknessMm: x.demand.frontThicknessMm,
      massKg: x.demand.frontMassKg,
      massSource: x.massSource,
      handleMassKg: x.demand.handleMassKg,
      heightBasis: x.heightBasis,
      heightMinMm: x.heightRange?.minMm ?? null,
      heightMaxMm: x.heightRange?.maxMm ?? null,
      loadBasis: x.loadBasis,
      loadValue: x.loadValue,
      loadMin: x.load?.min ?? null,
      loadMax: x.load?.max ?? null,
      checks: JSON.stringify(x.checks),
      workingAngleMinDeg: a?.minDeg ?? null,
      workingAngleMaxDeg: a?.maxDeg ?? null,
      workingAngleSource: source ? (source.kind === 'DECISION' ? source.id : source.kind === 'CATALOG' ? `CATALOG: ${source.ref}` : 'UNKNOWN') : 'UNKNOWN',
      manufacturerAngles: JSON.stringify(x.manufacturerAngles),
      envelopeBasis: x.sweepBasis === 'WORKING_ANGLE' ? 'ESTIMATE_ROTATION_ABOUT_TOP_EDGE' : 'UPPER_BOUND_FRONT_UPRIGHT',
      sweepAngleDeg: x.sweepAngleDeg,
      drillingCompleteness: 'INCOMPLETE',
    },
    stationsMm: [],
    motionEnvelopes: x.sweep
      ? [
          (() => {
            const b = productBox(x.sweep);
            return { minMm: b.min, sizeMm: [0, 1, 2].map((i) => b.max[i]! - b.min[i]!) as Vec3 };
          })(),
        ]
      : [],
    capability: { status: 'PLACEHOLDER', reason: liftReason(x) },
    quantity: x.quantity,
    drillingExemption: null,
  };
}

/**
 * The door system of a sliding wardrobe as one mechanism (W9.2): the system and its leaves, the sizes of the solver,
 * the mass by MOD-DEC-334, the volume it takes in front of the partitions. The installation of ARISTO is not
 * qualified (physicalAdapter of the prototype): the doors stand as a temporary choice (PLACEHOLDER) said in the
 * problems; HOLD when the configuration gives no doors; RESOLVED without doors.
 */
function slidingMechanism(s: Rec): Mechanism {
  const c = s.calc,
    o = s.opening,
    doors = c.status === 'CANDIDATE',
    depth = s.depth.reserved;
  return {
    id: s.ids.opening,
    kind: 'SLIDING_SYSTEM',
    partIds: doors ? s.ids.leaves.map((id: string) => id + '-INSERT') : [],
    assemblyId: WARDROBE_PRODUCT_ID,
    profile: { catalogId: doors ? c.profile : 'NONE', compatibilityProfileId: s.config.system ? `${s.config.manufacturer ?? 'ARISTO'}:${s.config.system}` : null, version: slidingDoors.version },
    params: {
      status: c.status,
      system: s.config.system ?? null,
      leafCount: c.n ?? s.config.n ?? null,
      scheme: c.scheme ?? null,
      mirror: c.mirror ?? null,
      openingWidthMm: o.W ?? null,
      openingHeightMm: o.H ?? null,
      leafWidthMm: c.door_width ?? null,
      leafHeightMm: c.door_height ?? null,
      frameLengthMm: c.frame_length ?? null,
      insertWidthMm: c.insert_width ?? null,
      insertHeightMm: c.insert_height ?? null,
      upperTrackLengthMm: c.rail_length ?? null,
      lowerTrackLengthMm: c.lower_rail_length ?? c.rail_length ?? null,
      upperMount: c.upperMount ?? null,
      lowerMount: c.lowerMount ?? null,
      seal: c.seal ?? null,
      brushNetM: c.brush_m ?? null,
      leafMassKg: c.mass?.display_ceil_kg ?? null,
      leafMassLimitKg: c.mass?.limit_kg ?? null,
      massRule: c.mass?.rule ?? null,
      applicability: c.applicability ?? null,
      systemDepthMm: depth,
      tracks: doors ? c.tracks.join(',') : null,
      closedPositionsMm: doors ? c.closed.map((x: FractionInput) => fracNumber(x)).join(',') : null,
      // W9.3: the price of the kit by the policy sliding-price (FINDINGS 510–512).
      priceStatus: c.priceStatus ?? null,
      knownSystemSubtotalRub: c.knownSystemSubtotal ?? null,
      systemAmountRub: c.systemAmount ?? null,
      fillingAmountRub: c.fillingAmount ?? null,
    },
    stationsMm: doors ? [...c.localOperations.profileStationsMm] : [],
    // The volume of the system: the opening across and up, the depth of the system from the front of the carcass.
    motionEnvelopes: doors && depth ? [{ minMm: [o.x0, 0, o.y0], sizeMm: [o.W, depth, o.H] }] : [],
    capability: { status: s.access.status === 'NO_DOORS' ? 'RESOLVED' : doors ? 'PLACEHOLDER' : 'HOLD', reason: s.access.status === 'NO_DOORS' ? null : s.access.reason },
    quantity: doors ? c.n : 0,
    // MOD-DEC-189: the screws of the brackets of the hidden upper guide of Slim Line are counted by the table and not
    // drilled — the fitter fixes them from the kit; no hole is made up for them (INV-E19-05, FINDINGS 553).
    drillingExemption:
      doors && c.system === 'slim' && c.upperMount !== 'VISIBLE'
        ? { decision: 'MOD-DEC-189', reason: `Саморезы кронштейнов скрытой верхней направляющей Slim Line — по таблице (${c.bracketScrews?.referenceFormula ?? 'SUM(K21:L22)*8'}), отдельно не считаются и не сверлятся: монтажник крепит их из комплекта` }
        : null,
    // FINDINGS 916–918: the profiles of the leaves and the guides in 3D (MOD-DEC-432).
    ...(doors && s.visuals?.length ? { visuals: s.visuals } : {}),
  };
}

/** What a lift front leaves open, in plain Russian (the «колокольчик»): nothing cuts the function, all is said. */
function liftIssues(m: Rec, issue: (code: string, level: Unresolved['level'], text: string, ruleId: string, blocks: boolean, refs?: Partial<Pick<Unresolved, 'partIds' | 'jointIds' | 'mechanismIds'>>) => void): void {
  const ceiling: number | null = m.roomInstallation?.roomHeight ?? null;
  for (const x of (m.liftMechanisms ?? []) as Rec[]) {
    const refs = { partIds: [...x.leafIds], mechanismIds: [x.id] },
      unknown = (x.checks as Rec[]).filter((c) => c.status === 'UNKNOWN').map((c) => c.text);
    if (x.status !== 'SELECTED') issue('LIFT_NOT_SELECTED', 'WARNING', `${x.text}. Подъёмник — временное значение, подберите строку каталога (INV-D18-01)`, 'MOD-DEC-320', true, refs);
    if (unknown.length) issue('LIFT_DATA_UNKNOWN', 'WARNING', `${x.id}: подбор подъёмника не проверен полностью — ${unknown.join('; ')} (INV-D18-01)`, 'MOD-DEC-320', true, refs);
    issue('DRILLING_INCOMPLETE', 'WARNING', `${x.id}: присадка неполная — схемы отверстий подъёмника ${x.article ?? ''} в корпусе и фасаде нет в данных (MOD-DEC-277)`, 'MOD-DEC-277', true, refs);
    if (x.workingAngle?.minDeg === null || !x.workingAngle)
      issue('LIFT_ANGLE_UNKNOWN', 'WARNING', `${x.id}: рабочий угол подъёмника ${x.article ?? ''} не известен — рабочий угол Modulero решён только для строки DTC TOP STAY ST04 (MOD-DEC-194), угол производителя для этой строки не единственный или не указан (INV-D18-02)`, 'MOD-DEC-194', true, refs);
    if (x.massSource === 'BOARD_DENSITY')
      issue(
        'DOOR_MASS_ESTIMATED',
        x.purchasedFacade ? 'WARNING' : 'INFO',
        `${x.id}: масса подъёмного фасада ${fmt(x.demand.frontMassKg)} кг — по объёму и плотности плиты ${wardrobeFacades.constants.boardDensity.value} кг/м³${x.purchasedFacade ? '; фасад покупной — введите его массу' : ''} (MOD-DEC-355)`,
        'MOD-DEC-355',
        false,
        refs,
      );
    if (x.insetRequested) issue('LIFT_INSET_NOT_SUPPORTED', 'WARNING', `${x.id}: подъёмный фасад построен накладным — вкладной подъёмный фасад не поддержан (MOD-DEC-320)`, 'MOD-DEC-320', false, refs);
    // MOD-DEC-742: without the working angle the space is the upper bound — the front turned upright (FINDINGS 3052).
    const bound = x.sweepBasis !== 'WORKING_ANGLE';
    if (ceiling === null || !(ceiling > 0))
      issue(
        'LIFT_MOTION_SPACE_UNKNOWN',
        'INFO',
        bound
          ? `${x.id}: рабочий угол не известен — открытый фасад поднимается не выше ${fmt(x.sweepTopY)} мм от пола (оценка сверху: фасад поднят вертикально); высота потолка не задана — проверить место над шкафом (INV-D18-01)`
          : `${x.id}: открытый фасад поднимается до ${fmt(x.sweepTopY)} мм от пола (оценка); высота потолка не задана — проверить место над шкафом (INV-D18-01)`,
        'MOD-DEC-320',
        false,
        refs,
      );
    else if (x.sweepTopY > ceiling)
      if (bound)
        issue('LIFT_MOTION_SPACE_UNKNOWN', 'INFO', `${x.id}: рабочий угол не известен — открытый фасад поднимается не выше ${fmt(x.sweepTopY)} мм от пола (оценка сверху: фасад поднят вертикально), потолок — ${fmt(ceiling)} мм: может упереться в потолок, проверить по углу подъёмника (INV-D18-01)`, 'MOD-DEC-742', false, refs);
      else issue('LIFT_CEILING_CONFLICT', 'WARNING', `${x.id}: открытый фасад поднимается до ${fmt(x.sweepTopY)} мм от пола (оценка), потолок — ${fmt(ceiling)} мм: фасад упрётся в потолок, ход ограничен (INV-D18-01)`, 'MOD-DEC-320', true, refs);
  }
}

const SLIDING_SYSTEM_NAME: Rec = { eco: 'ЭКО', slim: 'Slim Line', standard: 'Стандарт' };

/**
 * What the doors of a sliding wardrobe leave open, in plain Russian (the owner's rule of 2026-10-22, FINDINGS 518): a
 * missing datum of the hardware never removes the doors — they are built with a temporary value, and the problem is
 * said here. Every such value blocks the production readiness, as the placeholders of the legs and the rods do.
 */
function slidingIssues(s: Rec, issue: (code: string, level: Unresolved['level'], text: string, ruleId: string, blocks: boolean, refs?: Partial<Pick<Unresolved, 'partIds' | 'jointIds' | 'mechanismIds'>>) => void, runnerOf: Map<string, string>): void {
  if (s.access.status === 'NO_DOORS') return;
  const c = s.calc,
    id = s.ids.opening,
    name = `купе ${SLIDING_SYSTEM_NAME[s.config.system] ?? s.config.system}`;
  if (c.status !== 'CANDIDATE') {
    issue('SLIDING_DOORS_NOT_BUILT', 'WARNING', `${id}: двери ${name} не построены — ${(c.errors ?? []).join(' ') || 'комплектация не рассчитывается'}`, 'r1 swCalculate', true, { mechanismIds: [id] });
    return;
  }
  const refs = { mechanismIds: [id], partIds: s.ids.leaves.map((leaf: string) => leaf + '-INSERT') };
  issue('SLIDING_SYSTEM_PLACEHOLDER', 'WARNING', `${id}: двери ${name} — временный подбор: монтаж системы, ход и стопоры не подтверждены, створки стоят в номинальном положении; систему и её комплект нужно подобрать и подтвердить`, 'r1 physicalAdapter', true, refs);
  if (c.mass?.status === 'EXCEEDS_LIMIT')
    issue('SLIDING_LEAF_MASS_LIMIT', 'WARNING', `${id}: створка ${c.mass.display_ceil_kg} кг тяжелее предела роликов ${c.mass.limit_kg} кг — нужна другая система или другая вставка`, 'MOD-DEC-334', true, refs);
  else if (c.applicability === 'NO_FEASIBLE_SOLUTION')
    issue('SLIDING_LEAF_SIZE_LIMIT', 'WARNING', `${id}: створка ${c.door_width} × ${c.door_height} мм вне пределов профиля ${name} по ширине, высоте или их отношению — нужна другая система или другой проём`, 'r1 SW_ENGINE.evaluate', true, refs);
  // MOD-AI-30, 70 (FINDINGS 2957): a pane of glass larger than ARISTO makes, or one too small for the safety film.
  const glass = c.glass,
    lim = slidingDoors.constants.glassLimits.value;
  if (glass?.tooLarge)
    issue('SLIDING_GLASS_SIZE_LIMIT', 'WARNING', `${id}: стекло вставки ${fmt(glass.width)} × ${fmt(glass.height)} мм больше, чем ARISTO делает стекло и зеркало ${glass.thickness} мм (${fmt(lim.widthMax)} × ${fmt(lim.heightMax)} мм) — нужно больше створок или вставка ЛДСП`, 'MOD-AI-30', true, refs);
  else if (glass && !glass.film)
    issue('SLIDING_GLASS_NO_FILM', 'WARNING', `${id}: стекло вставки ${fmt(glass.width)} × ${fmt(glass.height)} мм меньше ${fmt(lim.filmMin[1])} × ${fmt(lim.filmMin[0])} мм — травмобезопасную плёнку на него не ставят (ARISTO)`, 'MOD-AI-30', true, refs);
  if (c.carcassThicknessAssumedMm)
    issue('SLIDING_SLIM_CARCASS', 'WARNING', `${id}: таблица Slim Line дана для корпуса ${c.carcassThicknessAssumedMm} мм — размеры створок для этого корпуса взяты по ней временно`, 'MOD-DEC-187', true, refs);
  if (s.config.system === 'eco')
    issue('SLIDING_MOUNTING_SCHEME', 'WARNING', `${id}: монтажной схемы ЭКО нет — нижняя направляющая временно стоит в ${s.depth.lowerFrontSetback} мм за передним краем верхней, как в прототипе`, 'MOD-DEC-354', true, refs);
  if (c.system === 'standard' || c.lowerMount === 'recessed')
    issue('SLIDING_TRACK_GROOVES', 'WARNING', `${id}: пазы врезной нижней направляющей (2 × 10,5 × 7 мм) — временно в дне корпуса, на 25 и 65,5 мм от переднего края по чертежу ARISTO; место паза ждёт решения владельца, технология не подтверждена`, 'MOD-DEC-277', true, refs);
  if (c.system === 'slim' && c.upperMount !== 'VISIBLE')
    issue('SLIDING_HIDDEN_UPPER', 'WARNING', `${id}: скрытая верхняя направляющая Slim Line меняет корпус (крыша и боковины по схеме) — корпус построен как при открытой, глубина системы — тоже`, 'MOD-DEC-354', true, refs);
  // MOD-DEC-175 (FINDINGS 551): a drawer the open leaves do not clear by 5 mm keeps its data, the project is invalid;
  // one they clear nominally waits for the stops, the travel and the bodies of the system and of the handle.
  for (const row of (s.access.drawers as Rec[]).filter((x) => x.nominal)) {
    const a = row.nominal,
      // A basket or a trouser rack (MOD-DEC-484) is its own mechanism.
      drawerRefs = { mechanismIds: [id, runnerOf.get(row.drawerId) ?? row.drawerId], partIds: refs.partIds };
    if (a.status === 'BLOCKED') issue('SLIDING_DRAWER_ACCESS', 'ERROR', a.proposal.text, 'MOD-DEC-175', true, drawerRefs);
    else
      issue(
        'SLIDING_DRAWER_ACCESS_UNCONFIRMED',
        'WARNING',
        `${row.drawerId}: створки открывают ящик по номинальным размерам — свободно ${fmt(a.freeWidthMm)} мм при ящике с направляющими ${fmt(a.widthMm)} мм (MOD-DEC-175); не подтверждены ход створок и стопоры, тела створок, выступ фасада и ручки — проверить при подборе системы`,
        'MOD-DEC-175',
        true,
        drawerRefs,
      );
  }
  // W9.3: the price of the kit (FINDINGS 512, 516). A price is not production data: it never blocks the readiness. The
  // processing and the mounting of the doors are the assembly's, 14 % of C (MOD-DEC-569, FINDINGS 1205): no remark.
  const bom: Rec[] = c.bom ?? [],
    label = (b: Rec) => (b.role === 'glass' || b.role === 'glass_film' ? b.title : b.article || (b.role === 'insert' ? 'вставки ЛДСП 10' : b.role)),
    conditional = [...new Set(bom.filter((b) => b.priceStatus === 'CONDITIONAL_PRICE').map(label))],
    unknown = [...new Set(bom.filter((b) => b.amount === null).map(label))];
  if (conditional.length)
    issue('SLIDING_PRICE_CONDITIONAL', 'WARNING', `${id}: цена условная, по аналогам — ${conditional.join(', ')}; точной цены этих позиций не найдено, уточнить у поставщика`, 'MOD-DEC-264', false, refs);
  if (unknown.length) issue('SLIDING_PRICE_UNKNOWN', 'WARNING', `${id}: цена не определена — ${unknown.join(', ')}; итог сметы не определён`, 'MOD-DEC-157', false, refs);
}

/** What the facades leave open, in plain Russian; the level is the decision's (WR-23: nothing here is an ERROR). */
function facadeIssues(m: Rec, issue: (code: string, level: Unresolved['level'], text: string, ruleId: string, blocks: boolean, refs?: Partial<Pick<Unresolved, 'partIds' | 'jointIds' | 'mechanismIds'>>) => void): void {
  for (const h of m.hingeMechanisms ?? []) {
    const refs = { partIds: [h.doorId, h.panelId], mechanismIds: [h.id] };
    if (!h.hingeId) issue('HINGE_NOT_SELECTED', 'WARNING', h.text, 'MOD-DEC-286', true, refs);
    else if (h.status !== 'OK')
      issue('HINGE_DATA_UNKNOWN', 'WARNING', `${h.text}; каталог не даёт: ${(h.checks as Rec[]).filter((c) => c.status === 'UNKNOWN').map((c) => c.text).join('; ')}`, 'MOD-DEC-329', true, refs);
    if (h.drawingCheck === 'FAIL') issue('DRILLING_DRAWING_MISMATCH', 'WARNING', `${h.id}: отверстия комплекта не совпадают с чертежом каталога в допусках 275, 327`, 'MOD-DEC-327', true, refs);
    if (h.drawingCheck === 'UNKNOWN') issue('DRILLING_DRAWING_UNKNOWN', 'INFO', `${h.id}: каталог не рисует часть отверстий комплекта — сверить их с чертежом по 275, 327 не с чем; источник присадки — комплект (277)`, 'MOD-DEC-327', false, refs);
    if (h.drilling.completeness !== 'COMPLETE') issue('DRILLING_INCOMPLETE', 'WARNING', `${h.id}: присадка неполная — ${h.drilling.missing.join('; ')}`, 'MOD-DEC-277', true, refs);
    if (h.countBasis !== 'MOD-DEC-190')
      issue('HINGE_CHART_EXCEEDED', 'WARNING', `${h.doorId}: дверь ${fmt(h.massKg)} кг выше графика петли ${h.hingeId} даже при наибольшем числе петель — нужна другая петля или решение мебельщика`, 'MOD-DEC-190', true, refs);
    if (!h.chartWidthCovered)
      issue('HINGE_CHART_WIDTH_NOT_COVERED', 'WARNING', `${h.doorId}: дверь шириной ${fmt(h.doorWidthMm)} мм шире ${fmt(h.chart.maxWidthMm)} мм — график петли ${h.hingeId} (${h.chart.ref}) такую дверь не покрывает; число петель по нему не подтверждено`, 'MOD-DEC-329', true, refs);
    // MOD-DEC-355: a door of the corpus board weighs its volume × the board density — said, never blocking. A purchased
    // facade is not of that board: its mass is entered, till then it blocks (Handbook r8 §А.1, INV-A01-02).
    if (h.massSource !== 'INPUT' && h.purchasedFacade)
      issue('DOOR_MASS_ESTIMATED', 'WARNING', `${h.doorId}: фасад покупной, его масса не введена; оценка ${fmt(h.massKg)} кг по плотности плиты корпуса к нему не относится, число петель по правилу 190 не подтверждено; введите массу двери секции`, 'MOD-DEC-355', true, refs);
    else if (h.massSource !== 'INPUT')
      issue('DOOR_MASS_ESTIMATED', 'INFO', `${h.doorId}: масса двери ${fmt(h.massKg)} кг — по объёму и плотности плиты ${wardrobeFacades.constants.boardDensity.value} кг/м³ (MOD-DEC-355); если масса другая, введите её`, 'MOD-DEC-355', false, refs);
    if (h.purchasedFacade) issue('FACADE_SUPPLIER_DRILLING', 'INFO', `${h.doorId}: фасад готовый покупной — чашки петель сверлит поставщик по схеме ${h.hingeId}; на панели — отверстия планки`, 'MOD-DEC-277', false, refs);
  }
  // MOD-DEC-356 (WR-21): a seam narrower than 2 mm is said, never refused — the edges of the doors may touch.
  const gp = m.facadeGapProfile,
    minSeam = wardrobeFacades.constants.minSeamWarn.value;
  if ((m.hingeMechanisms ?? []).length && gp)
    for (const [where, v] of [['между дверями', gp.seamX], ['между рядами фасадов', gp.seamY]] as const)
      if (Number(v) < minSeam)
        issue('FACADE_SEAM_NARROW', 'WARNING', `Шов ${where} ${fmt(Number(v))} мм уже ${minSeam} мм: кромки соседних дверей могут задевать друг друга`, 'MOD-DEC-356', false);
  for (const x of m.frontGrid?.mappings ?? [])
    if (x.physicalProfileStatus !== 'SUPPORTED' && x.physicalFacadeIds.length)
      issue('P2_UNSUPPORTED_MULTI_FACADE_SECTION', 'WARNING', `${x.columnId}: в колонке фронтальной сетки ${x.physicalFacadeIds.length} фасада (${x.physicalFacadeIds.join(', ')}) — цепочка фасадов описывает одну дверь на колонку; размеры дверей посчитаны, производственный профиль цепочки не подтверждён`, 'r1 p2WarningsForModel', true, { partIds: [...x.physicalFacadeIds] });
  if (m.frontGrid?.gapProfile.blocking)
    issue('P2_UNSUPPORTED_GAP_PROFILE', 'WARNING', `Прежний профиль зазоров с зазором ${m.frontGrid.gapProfile.jointGapMm} мм: цепочка фасадов поддерживает только ${wardrobeFacades.constants.legacyStandardGap.value} мм`, 'r1 p2WarningsForModel', true);
  for (const i of m.facadeIssues ?? []) issue(i.code, 'WARNING', i.text, 'MOD-DEC-317', true);
  // MOD-DEC-362: an inset door stands inside the carcass, its back face t behind the front edge; a part reaching nearer
  // the front than that is in the way of the door — said, never moved: no decision sets it back (FINDINGS 405).
  for (const d of (m.parts as Rec[]).filter((p) => p.facadeMounting === 'INSET' && p.facadeBox)) {
    const b = d.facadeBox;
    for (const p of m.parts as Rec[]) {
      const w = p.worldBox;
      if (!w || p === d || Math.min(w.x1, b.x1) <= Math.max(w.x0, b.x0) || Math.min(w.y1, b.y1) <= Math.max(w.y0, b.y0) || w.z0 >= b.z1 || w.z1 <= b.z0) continue;
      issue(
        'INSET_DOOR_CLEARANCE',
        'WARNING',
        `${p.id}: деталь начинается в ${fmt(w.z0)} мм от переднего торца, а тыльная пласть вкладной двери ${d.id} — в ${fmt(b.z1)} мм; дверь не закроется — отодвиньте деталь назад или возьмите фасад тоньше`,
        'MOD-DEC-362',
        true,
        { partIds: [p.id, d.id] },
      );
    }
  }
}

/** What the drawers leave open (W7): the runner placeholder, its drilling, the spacer, the conflicts of FE-04. */
function drawerIssues(m: Rec, issue: (code: string, level: Unresolved['level'], text: string, ruleId: string, blocks: boolean, refs?: Partial<Pick<Unresolved, 'partIds' | 'jointIds' | 'mechanismIds'>>) => void, runnerOf: Map<string, string>): void {
  for (const u of (m.drawerUnits ?? []) as Rec[]) {
    const id = runnerOf.get(u.id)!;
    // MOD-DEC-544 (R2-007): a kit of the catalogue; its drilling is incomplete only where the catalogue prints no hole (205).
    if (u.kit) {
      if (u.kit.missing.length) issue('DRILLING_INCOMPLETE', 'WARNING', `${id}: присадка сборного ящика ${u.kit.brand} ${u.kit.article} неполная — каталог не печатает: ${u.kit.missing.join('; ')} (MOD-DEC-205, 277)`, 'MOD-DEC-277', true, { mechanismIds: [id] });
      continue;
    }
    if (u.kitNotTaken) {
      const box = u.runner?.concealed ? 'коробом набора БАЗИС направляющей ' + u.runner.article + ' (MOD-DEC-544, 514)' : 'своим коробом из плиты (MOD-DEC-544)';
      issue('DRAWER_SYSTEM_NOT_TAKEN', 'WARNING', `${u.id}: ${u.kitNotTaken} — ящик построен ${box}`, 'MOD-DEC-544', false, { mechanismIds: [id], partIds: [...u.partIds] });
    }
    // MOD-DEC-514 (FINDINGS 1862): the runner of the level of a new project; another than the level's is said (465), a
    // drawer heavier than its pair holds is said; a ball runner without the holes of its kit is not drilled (277, 2746).
    if (u.runner) {
      if (u.runner.substitution) issue('HARDWARE_TIER_SUBSTITUTED', 'WARNING', `${u.id}: ${u.runner.substitution} (MOD-DEC-465, 514)`, 'MOD-DEC-465', false, { mechanismIds: [id] });
      if (u.runner.massKg > u.runner.loadKg)
        issue('DRAWER_LOAD', 'WARNING', `${u.id}: ящик с грузом ${fmt(u.runner.massKg)} кг, пара ${u.runner.article} держит ${fmt(u.runner.loadKg)} кг (MOD-DEC-514)`, 'MOD-DEC-514', false, { mechanismIds: [id], partIds: [...u.partIds] });
      if (!u.runner.concealed && !u.runner.drilled) issue('DRILLING_INCOMPLETE', 'WARNING', `${id}: присадка направляющих ${u.runner.article} не задана — набора БАЗИС нет, каталог отверстий не печатает (MOD-DEC-277)`, 'MOD-DEC-277', true, { mechanismIds: [id] });
      continue;
    }
    issue('HARDWARE_PLACEHOLDER', 'WARNING', `${u.id}: направляющая ${u.slideId} — кандидат PLACEHOLDER, стандартная направляющая не выбрана (MOD-DEC-032, WR-16)`, 'MOD-DEC-032', true, { mechanismIds: [id] });
    issue('DRILLING_INCOMPLETE', 'WARNING', `${id}: присадка направляющих не задана — направляющая не выбрана, её комплекта нет (MOD-DEC-032, 277)`, 'MOD-DEC-277', true, { mechanismIds: [id] });
  }
  // MOD-DEC-721 (WR-30 by the row): the facade of an external drawer of a section with doors stands in a row without a
  // door; one that meets a door would take its volume — an error that blocks the production data.
  (m.sectionsData as Rec[]).forEach((_, i) => {
    for (const x of externalDrawersOverDoors(m, i))
      issue('EXTERNAL_DRAWER_BEHIND_DOOR', 'ERROR', `${x.drawerId}: фасад наружного ящика заходит на высоту двери ${x.doorId} — фасад ящика и дверь заняли бы один объём; поставьте ящик в ряд «Без двери» или сделайте его внутренним (WR-30, MOD-DEC-721)`, 'MOD-DEC-721', true, {
        partIds: [x.doorId, `${x.drawerId}-FACADE-STRUCTURAL`],
        mechanismIds: [runnerOf.get(x.drawerId)!].filter(Boolean),
      });
  });
  for (const p of (m.parts as Rec[]).filter((x) => x.kind === 'drawerSpacer'))
    if (p.spacer.status !== 'KNOWN') issue('DRAWER_SPACER_THICKNESS_UNKNOWN', 'WARNING', `${p.id}: ${p.spacer.reason}`, p.spacer.decision, true, { partIds: [p.id, p.spacer.panel] });
  for (const h of (m.hingeMechanisms ?? []) as Rec[]) {
    // MOD-DEC-720: a shelf the hinge found no free place from — the user moves it (159); readiness is not blocked.
    if (h.fe04.shelfText) issue('SHELF_HINGE_CONFLICT', 'WARNING', h.fe04.shelfText, 'MOD-DEC-720', false, { partIds: [h.doorId, ...new Set<string>(h.fe04.shelfConflicts.flatMap((c: Rec) => c.partIds))], mechanismIds: [h.id] });
    if (!h.fe04.text) continue;
    const drawers = [...new Set<string>(h.fe04.conflicts.flatMap((c: Rec) => c.drawerIds))];
    if (h.fe04.conflicts.length)
      issue('INNER_DRAWER_HINGE_CONFLICT', 'WARNING', h.fe04.text, 'MOD-DEC-053', true, {
        partIds: [h.doorId, ...new Set<string>(h.fe04.conflicts.flatMap((c: Rec) => c.partIds))],
        mechanismIds: [h.id, ...drawers.map((d) => runnerOf.get(d)!)],
      });
    else issue('FE04_HINGE_MOVED', 'INFO', h.fe04.text, 'MOD-DEC-050', false, { partIds: [h.doorId], mechanismIds: [h.id] });
  }
  for (const u of ((m.drawerUnits ?? []) as Rec[]).filter((x) => x.shiftMm))
    issue('FE04_DRAWER_MOVED', 'INFO', `${u.id}: ящик ${u.shiftMm > 0 ? 'поднят' : 'опущен'} на ${fmt(Math.abs(u.shiftMm))} мм по шагу сетки, чтобы петля двери его не задевала (FE-04, MOD-DEC-050); положение задали правила, а не пользователь`, 'MOD-DEC-050', false, { mechanismIds: [runnerOf.get(u.id)!], partIds: [...u.partIds] });
}
