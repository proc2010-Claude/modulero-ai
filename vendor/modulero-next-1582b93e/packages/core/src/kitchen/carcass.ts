// The parts of one kitchen module (task K3, MIGRATION_PLAN step 4.3): the prototype's chain of kflowCalculated
// layered over twelve wrappers (r1.html:69731–77899) written out as one call path. Rectangular carcass with shelves
// and fronts (kflow), the single-body corner of MOD-DEC-182 with its cleats (k5), the accessible L corner (kp), the
// rectangular appliance carcasses and the diagonal corner (kn, kpm), the TANDEM drawers (kre), the combined, glass,
// dryer, bottle, island and corner constructions (kcr) and the appliance cabinets (kap).
//
// Each function keeps the prototype's name in its comment and its behaviour; the layer order is the prototype's:
//   calculated = kap → kcr → kre → kn → ki → kp → k7 → kflow,
//   supported  = kap → kcr → kn → kp → k7 → kflow, shelfItems = kap → kcr(SEKURA) → kcr → kn → kp → kflow.
// What the prototype read from its global kitchenState comes from the KitchenScene.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { Rec } from '../engine/policy/project-state.js';
import appliancesData from '../catalog/kitchen/appliances.data.json' with { type: 'json' };
import cornerData from '../catalog/kitchen/corner-fastening.data.json' with { type: 'json' };
import { bodyDepth, canonicalWall, cornerChoice, cornerWorldLine, cornerZones, fillerAtDoor, isAccessL, isDiagonal, isFree, isSingleCorner, wallFiller, worldBox, type KitchenScene } from './room.js';
import { KIND_INFO, KITCHEN_STANDARD, standardCard } from './standard.js';
import { facadeChoiceThickness, facadePartFields } from './facade-choice.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { frontGrid } from '../engine/policy/index.js';
import { wardrobeDrawers } from '../engine/policy/wardrobe-drawers.js';
import { selectShelfSupport, shelfLowerAboveAxis, shelfSupportSelection } from '../engine/policy/shelf-support-selection.js';
import { s32Snap } from '../engine/policy/system32.js';
import { jsonClone } from '../engine/json-clone.js';
import { concealedBoxWalls } from '../engine/drawer-runner.js';
import { kitchenDrawerRunner, levelRunner, type KitchenDrawerRunner } from './drawer-runner.js';
import { hangerRecessMm, levelHanger, levelHangerOf } from './hanger.js';

const clone = jsonClone;
const finite = (...v: unknown[]) => v.every((x) => Number.isFinite(x));

/** Appliance models of the prototype (kapProfiles, r1.html:76185). */
export const APPLIANCE_PROFILES: Readonly<Record<string, Rec>> = appliancesData.data as any;
/** Cleat fastening of the single-body corner (k5Tech, r1.html:70697). */
export const CORNER_FASTENING: Rec = cornerData.data;
const K5_VARIANT: string = CORNER_FASTENING.corner.kitId,
  K5_CLEAT_T: number = CORNER_FASTENING.corner.cleatThicknessMm,
  K5_CLEAT_D: number = CORNER_FASTENING.corner.cleatDepthMm;

/** Gap between the rear face of a front and the front face of the carcass, mm (kflowFrontCarcassGapMm, r1.html:69668). */
export const FRONT_CARCASS_GAP = 2;

// ---------------------------------------------------------------- the one source of the front gaps and the edges

/** The outer gap the user set for the project, else null. The prototype wrote its own unapproved default 2 into every
 * project (`proposed.outerGap`); read, it means «not set» (KF-11, FINDINGS 323). */
function projectGap(s: KitchenScene): number | null {
  const g = s.proposed?.outerGap;
  return g === undefined || g === null || g === K.legacyOuterGap.value ? null : g;
}
/**
 * The outer offset of the fronts of a module from the vertical borders of its cell (KF-06, KF-11; FINDINGS 323): its own
 * value, else the project's, else 1.5 mm of MOD-DEC-124. Every front of every module reads it.
 */
export const frontGap = (s: KitchenScene, m: Rec): number => m.frontGap ?? projectGap(s) ?? FG.outerOffsetHorizontal.value;
/** The same from the top and the bottom border: else 2 mm, as the wardrobe (frontGrid.outerOffsetTop, FINDINGS 55). */
export const frontGapY = (s: KitchenScene, m: Rec): number => m.frontGap ?? projectGap(s) ?? FG.outerOffsetTop.value;
/** The seam between neighbouring fronts of a module (MOD-DEC-185): its own value, else 3 mm. */
export const frontSeam = (m: Rec): number => m.frontSeam ?? FG.seam.value;
/** Edge of the visible front end of a carcass panel (MOD-DEC-180: 1 mm; KF-04, FINDINGS 321); the prototype had 0. */
export const bodyEdge = (m: Rec): number => m.bodyEdgeMm ?? K.edge.value;
/** Edge of every end of a front (MOD-DEC-180: 1 mm; KF-04, FINDINGS 321). */
export const frontEdge = (m: Rec): number => m.frontEdgeMm ?? K.edge.value;
/**
 * Depth of the worktop of a module (MOD-DEC-565: 600 mm, editable; FINDINGS 1180): its rear edge is flush with the back
 * of the carcass, the rest overhangs the front — 20 mm over a carcass of 560 with its front 2 + 18; the prototype had 620.
 */
export const worktopDepthOf = (m: Rec): number => m.worktopDepth ?? K.worktopDepth.value;
/**
 * The modules of a stored kitchen with the prototype's worktop depth forgotten (FINDINGS 1180): the 620 a sink or hob
 * cabinet keeps was written by the prototype into every such cabinet (kapAssign, r1.html:77348), never chosen — nothing
 * let the user set it. Read as unset, its worktop joins the run of the kitchen's 600; kept, the run would break at it.
 */
export function withoutPrototypeWorktopDepth<T extends Rec>(modules: T[]): T[] {
  return modules.map((m) => {
    if (m.worktopDepth !== 620 || !isAppliance(m)) return m;
    const { worktopDepth: _, ...rest } = m;
    return rest as T;
  });
}
const TANDEM = 'BLUM-TANDEM560H5000B-WOOD16';
const SAH216 = 'TECHR3-SAH216-BACK-RECESS16';
const SEKURA = 'HETTICH-SEKURA6-79707';
const defaults = KITCHEN_STANDARD.defaults;
const K = kitchen.constants,
  FG = frontGrid.constants;

// ---------------------------------------------------------------- kinds of modules

const KCR_TYPES = new Set(['KB_COMBINED', 'KT_COMBINED', 'KW_GLASS', 'KW_DRYER', 'KB_BOTTLE', 'KI_DOOR_DRAWER', 'KB_CORNER_ACCESS_L', 'KW_CORNER_ACCESS_L', 'KB_CORNER_DIAGONAL', 'KW_CORNER_DIAGONAL']);
const KN_RECT_TYPES = new Set(['KB_SINK', 'KB_HOB', 'KB_OVEN', 'KW_MICROWAVE', 'KW_HOOD', 'KT_FRIDGE_ONE', 'KT_FRIDGE_TWO', 'KT_OVEN', 'KT_OVEN_MICROWAVE', 'KT_COFFEE', 'KI_SINK_HOB']);
const KAP_TYPES = new Set(['KB_SINK', 'KB_HOB', 'KB_OVEN', 'KB_DISHWASHER_450_600', 'KB_WASHER_600', 'KW_HOOD', 'KW_MICROWAVE', 'KT_FRIDGE_ONE', 'KT_FRIDGE_TWO', 'KT_OVEN', 'KT_OVEN_MICROWAVE', 'KT_COFFEE', 'KI_SINK_HOB']);
const BASE_CONFIRMED = ['KB_SHELVES', 'KW_SHELVES', 'KB_OPEN', 'KW_OPEN', 'KM_OPEN', 'KT_SHELVES', 'KT_UTILITY', 'KM_HINGED', 'KM_LIFT'];

/** The constructions of the kcr layer (kcrAffected, r1.html:9060 of the layer). */
export const isConstruction = (m: Rec | null | undefined): boolean => KCR_TYPES.has(m?.moduleTypeId);
/** Appliance cabinets (kapIs, r1.html:77267). */
export const isAppliance = (m: Rec | null | undefined): boolean => !!m && KAP_TYPES.has(m.moduleTypeId);
/** Rectangular carcasses of appliances, partial before kap (knRectTypes, r1.html:72664). */
const isKnRect = (m: Rec | null | undefined): boolean => KN_RECT_TYPES.has(m?.moduleTypeId);
export const knAffected = (m: Rec | null | undefined): boolean => isKnRect(m) || m?.moduleTypeId === 'KW_DRYER' || isDiagonal(m);
const knFront = (m: Rec | null | undefined): boolean => ['KB_SINK', 'KW_DRYER'].includes(m?.moduleTypeId);
export const isApplianceBay = (m: Rec | null | undefined): boolean => ['KB_DISHWASHER_450_600', 'KB_WASHER_600'].includes(m?.moduleTypeId);

/** kflowConfirmedGeometryType (r1.html:69677, kp 72270, kcr 74145). */
export function confirmedGeometryType(m: Rec | null | undefined): boolean {
  return isConstruction(m) || isAccessL(m) || isSingleCorner(m) || BASE_CONFIRMED.includes(m?.moduleTypeId);
}
/** The kflowSupported of r1.html:69680 as the k7 layer saw it (its confirmed type is the outermost). */
const k7Supported = (m: Rec | null | undefined): boolean => confirmedGeometryType(m) || m?.moduleTypeId === 'KB_DRAWERS';

/** The filler of a run between modules or at a wall (card «filler»): placed since MOD-DEC-741 (fillerCalculated). */
export const isFiller = (m: Rec | null | undefined): boolean => m?.kind === 'filler' && m.moduleTypeId === 'FILLER';

/** The place of a freestanding fridge or cooker (MOD-AI-60, MOD-DEC-752): kept free, no parts (placeCalculated). */
export const isPlace = (m: Rec | null | undefined): boolean => m?.kind === 'place';

/**
 * The module has placed parts in the graph, the coverage and the price: the supported ones and the filler (MOD-DEC-741,
 * FINDINGS 3201). The filler has no fill, fronts or materials of its own to edit, so the editors still ask `supported`.
 */
export const placed = (m: Rec | null | undefined): boolean => supported(m) || isFiller(m);

/** kflowSupported: the module has placed parts (r1.html:69680, k7 71242, kp 72267, kn 72674, kcr 74142, kap 77413). */
export function supported(m: Rec | null | undefined): boolean {
  if (isAppliance(m) || isConstruction(m) || isKnRect(m) || isDiagonal(m) || isAccessL(m) || k7Supported(m)) return true;
  if (!m?.fastenersR7?.enabled) return false;
  const c = KITCHEN_STANDARD.cards.find((c) => c.moduleTypeId === m.moduleTypeId),
    v = c && KITCHEN_STANDARD.variants[c.variant];
  return c?.family === 'rect_carcass' && v?.top === 'panel' && v?.bottom === 'panel' && v?.back === 'inset';
}

/** kflowHasFront (r1.html:69689, kp 72273, kn 72677, kcr 74151). */
export function hasFront(m: Rec): boolean {
  if (isConstruction(m)) return m.frontEnabled !== false;
  if (isKnRect(m)) return knFront(m);
  if (isDiagonal(m) || isAccessL(m)) return false;
  if (isSingleCorner(m)) return true;
  const card = KITCHEN_STANDARD.cards.find((x) => x.moduleTypeId === m?.moduleTypeId);
  return KITCHEN_STANDARD.variants[card?.variant]?.front !== 'none';
}

/** kflowKnownFrontType: the fronts of the type are known geometry (r1.html:69683, kn 72680, kcr 74148). */
export function knownFrontType(m: Rec | null | undefined): boolean {
  return isConstruction(m) || knFront(m) || confirmedGeometryType(m) || m?.moduleTypeId === 'KB_DRAWERS';
}

// ---------------------------------------------------------------- shelves

/** Evenly spaced shelves of the L and diagonal corners (kp r1.html:72276, kn 72683). */
function cornerShelves(m: Rec): Rec[] {
  if (Array.isArray(m.shelfItems)) return m.shelfItems;
  const n = m.fill?.shelves ?? 1,
    t = m.panelThickness ?? 16,
    clear = m.height - 2 * t;
  if (!Number.isInteger(n) || n < 0) return [];
  const gap = (clear - n * t) / (n + 1);
  return Array.from({ length: n }, (_, i) => ({ id: m.id + ':shelf:' + (i + 1), levelMm: gap + i * (t + gap) }));
}

/** kflowShelfItems before the kcr layer (r1.html:69691, kp 72276, kn 72683). */
function baseShelfItems(m: Rec): Rec[] {
  if (isDiagonal(m) || isAccessL(m)) return cornerShelves(m);
  if (Array.isArray(m.shelfItems)) return m.shelfItems;
  const n = m.fill?.shelves ?? 0,
    h = m.height - 2 * (m.panelThickness ?? 16);
  if (!Number.isInteger(n) || n < 0) return [];
  return Array.from({ length: n }, (_, i) => ({ id: `${m.id}:shelf:${i + 1}`, levelMm: Math.round(((i + 1) * h) / (n + 1)) }));
}

/** kflowShelfItems of the kcr layer (r1.html:74155). */
function constructionShelfItems(m: Rec): Rec[] {
  if (m.moduleTypeId === 'KB_COMBINED') return Array.isArray(m.shelfItems) ? m.shelfItems : [{ id: m.id + ':lower-zone:shelf:1', levelMm: 260, fixed: false, axisFromLower: -8 }];
  if (m.moduleTypeId === 'KT_COMBINED') {
    if (Array.isArray(m.shelfItems)) return m.shelfItems;
    const y = (m.drawerTop ?? 900) - m.floor,
      t = m.panelThickness ?? 16,
      clear = m.height - y - 2 * t,
      n = m.fill?.upperShelves === false ? 0 : 2;
    return Array.from({ length: n }, (_, i) => ({ id: m.id + ':upper-zone:shelf:' + (i + 1), levelMm: y + (clear * (i + 1)) / (n + 1), fixed: false, axisFromLower: -8 }));
  }
  if (['KW_DRYER', 'KB_BOTTLE'].includes(m.moduleTypeId)) return [];
  return baseShelfItems(m);
}

/** kflowShelfItems: the shelves of a module (outermost: kap r1.html:77491, the SEKURA binding of kcr 76148). */
export function shelfItems(m: Rec): Rec[] {
  if (isAppliance(m)) return applianceFixedSpecs(m, applianceSelections(m)).map((s) => ({ ...s }));
  return constructionShelfItems(m).map((s) => (m.shelfSupportProfile === SEKURA && !s.fixed ? { ...s, axisFromLower: -8, shelfSupportProfile: m.shelfSupportProfile, profileReadiness: 'PROJECT_BOUND_FACTORY_AXIS' } : s));
}

// ---------------------------------------------------------------- one part

/**
 * The thickness of the fronts of a module: its own (a corner kit or a glass door fixes it), else that of the execution
 * of the facade material of the kitchen (MOD-DEC-573), else `fallback` — the prototype's default.
 */
export function frontThickness(s: KitchenScene, m: Rec, fallback = 18): number {
  return m.frontThickness ?? facadeChoiceThickness(s) ?? fallback;
}

/** The plinth 16 mm stands 50…66 mm behind the front face of the carcass (r1.html:75198). */
export const PLINTH_SETBACK = 50,
  PLINTH_BACK = 66;

/** The dishwashers of the Bosch sheet 9001170054 (60 cm, 81.5 cm, section 8): the plinth before them on their brackets. */
const PLINTH_ON_DISHWASHER = new Set(['SMV2ITX18G:undercounter']);

/**
 * The plinth before a new dishwasher niche (MOD-DEC-566 п. 4, FINDINGS 1280): in the line of the plinth of its
 * neighbours — their height over the floor, 50…66 mm behind the fronts — over the width of the niche, fixed to the machine
 * by the two brackets of its kit, their axes 470 mm apart (Bosch 9001170054, section 8, the third way). The prototype left
 * the niche without one: the row's plinth broke at the machine.
 */
function dishwasherPlinth(s: KitchenScene, m: Rec, a: Rec): Rec | undefined {
  if (!m.plinthOnAppliance || !PLINTH_ON_DISHWASHER.has(a.profileId)) return;
  const near = (n: Rec) => n.id !== m.id && n.wall === m.wall && ['base', 'tall'].includes(n.kind) && n.floor >= 20 && (Math.abs(n.pos + n.width - m.pos) <= 0.5 || Math.abs(m.pos + m.width - n.pos) <= 0.5),
    F = s.modules.filter(near).sort((x, y) => x.pos - y.pos)[0]?.floor ?? K.legHeight.value;
  const p = part(s, m, 'Цоколь', 'plinth', [m.width, F - 6, 16], [0, m.width, 3, F - 3, PLINTH_SETBACK, PLINTH_BACK], 'CORPUS', { left: 0, right: 0, top: 0, bottom: 0 });
  return Object.assign(p, {
    fixedFront: true,
    content: false,
    applianceFixing: { kit: a.model + ' installation kit', brackets: 2, bracketAxesMm: 470, screws: 2, screwSpec: '4x15', source: 'Bosch 9001170054, section 8' },
  });
}

/** kflowMaterial (r1.html:69704). */
export function material(s: KitchenScene, m: Rec, role: string): string {
  return role === 'BACK' ? m.backMaterial || 'BACK_MATERIAL_UNKNOWN' : role === 'FACADE' ? m.facadeMaterial || s.facadeMaterial || 'W980' : m.corpusMaterial || s.corpusMaterial || 'W980';
}

/** A rectangular part of a module (kflowPart, r1.html:69706). */
export function part(s: KitchenScene, m: Rec, name: string, id: string, dimensions: number[], box: number[] | null, role = 'CORPUS', edges: Rec | null = null): Rec {
  const map = edges || { left: 0, right: 0, top: 0, bottom: 0 },
    [L, H, T] = dimensions as [number, number, number];
  return {
    partId: `${m.id}:${id}`,
    moduleId: m.id,
    kind: name,
    name,
    finished_mm: dimensions,
    blank_mm: [L - map.left - map.right, H - map.top - map.bottom, T],
    edge_mm: map,
    materialCode: material(s, m, role),
    materialRole: role,
    box,
    quantity: 1,
    status: 'GEOMETRY_DRAFT',
    drillingStatus: 'UNKNOWN',
    ...(role === 'FACADE' ? facadePartFields(s) : {}),
  };
}

/** The project has System 32 on (MOD-DEC-193, 196); the prototype's saved projects carry the policy. */
export const system32On = (s: KitchenScene): boolean => s.system32Policy?.enabled === true;

/**
 * The lower face of a removable shelf over the axis of its support (KF-08, FINDINGS 325): the kit of the level
 * «Стандарт» (344, selected as the wardrobe selects it) gives it; null — no kit or no number.
 */
export function shelfAboveAxis(s: KitchenScene, t: number): number | null {
  const catalog = s.hardware.shelfSupports,
    sel = selectShelfSupport({ shelfThicknessMm: t, shelfMaterial: 'CHIPBOARD', payloadKg: shelfSupportSelection.constants.payloadKg.value, shelfMassKg: null, tier: null }, catalog),
    support = sel.chosen ? catalog.supports.find((x) => x.id === sel.chosen!.supportId) : undefined;
  return support ? shelfLowerAboveAxis(support).valueMm : null;
}

/**
 * A removable shelf in a clear opening `clear` that starts at x0 (KF-05; FINDINGS 322): the kitchen shelf is removable
 * (MOD-DEC-193), 2 mm shorter than the opening and centred in it (225), 20 mm behind the front of the carcass and to
 * the inner face of the back (129), banded 0.4 mm on every end (193). The prototype made it the whole opening.
 * With System 32 on, a shelf whose support axis is off the grid of the bottom axis (193: `base` + 32n) moves to the
 * nearest level inside [low, high] (KF-08, FINDINGS 325); `system32MovedFromMm` keeps where it was.
 */
function removableShelf(s: KitchenScene, m: Rec, name: string, id: string, x0: number, clear: { W: number; D: number }, y: number, t: number, grid: { base: number; low: number; high: number }): Rec {
  const gap = K.removableEndGap.value,
    front = K.shelfFrontSetback.value,
    rear = K.shelfRearSetback.value,
    e = K.shelfEdge.value,
    above = system32On(s) ? shelfAboveAxis(s, t) : null;
  let lower = y;
  if (above !== null) {
    const axis = y - above,
      moved = y + s32Snap(axis, grid.base) - axis;
    if (moved >= grid.low && moved + t <= grid.high) lower = moved;
  }
  const p = part(s, m, name, id, [clear.W - 2 * gap, clear.D - front - rear, t], [x0 + gap, x0 + clear.W - gap, lower, lower + t, front, clear.D - rear], 'CORPUS', { left: e, right: e, top: e, bottom: e });
  p.removableShelf = true;
  if (lower !== y) p.system32MovedFromMm = y;
  return p;
}

const fail = (clear: Rec | null | undefined, note: string, extra: Rec = {}): Rec => ({ status: 'FAIL', clear, parts: [], note, ...extra });

// ---------------------------------------------------------------- rectangular carcass (kflow)

/** The SAH216 hanger: pins in the sides and access holes in the back (kflowEngineeringParts, r1.html:70666). */
function engineeringParts(m: Rec, parts: Rec[]): void {
  // A new module of 413 hangs on the hanger of the level: its holes are those of its kit (derived.ts, FINDINGS 2754).
  if (m.hangerVariant !== SAH216 || levelHanger(m)) return;
  const t = m.panelThickness ?? 16,
    D = m.depth,
    b = m.backThickness ?? 3;
  for (const side of ['L', 'R']) {
    const p = parts.find((x) => x.partId === m.id + ':side:' + side)!;
    p.operations = Array.from({ length: 3 }, (_, i) => ({ kind: 'SAH216 pin', diameter: 10, depth: 12.5, fromTop: t + 56 + 32 * i, fromFront: D - 5, datum: 'side innerface', production: false }));
  }
  const p = parts.find((x) => x.partId === m.id + ':back')!;
  p.operations = ['L', 'R'].flatMap((side) =>
    // A back in a groove is wider by the two depths of the groove: the access holes stay over the pins (FINDINGS 1269).
    [0, 1].map((i) => ({ kind: 'SAH216 access', diameter: 15, depth: b, x: (backInRebate(m) ? K.backRebateDepth.value - K.backInPlaneClearance.value : 0) + (side === 'L' ? 19 : m.width - 2 * t - 19), fromTop: 60 + 50 * i, datum: 'back local upper left; through back only', production: false })),
  );
}

/**
 * A floor carcass under the worktop of a new module has two rails instead of a solid top (MOD-DEC-566 п. 1, FINDINGS
 * 1263): the front and the rear rail lie flat between the sides, each `railWidth` deep. A saved module without the
 * mark keeps its top (the prototype's), so an opened project does not change by itself.
 */
export const railsOnTop = (m: Rec): boolean => m.topConstruction === 'RAILS' && ['base', 'island'].includes(m.kind);

/** The two flat rails of a floor carcass `w` wide between the sides and `d` deep to the back (MOD-DEC-566 п. 1). */
function topRails(s: KitchenScene, m: Rec, w: number, d: number, t: number, edges: Rec): Rec[] {
  const W = m.width,
    H = m.height,
    r = Math.min(K.railWidth.value, d / 2);
  return [
    part(s, m, 'Царга передняя', 'rail:front', [w, r, t], [t, W - t, H - t, H, 0, r], 'CORPUS', edges),
    part(s, m, 'Царга задняя', 'rail:rear', [w, r, t], [t, W - t, H - t, H, d - r, d], 'CORPUS', edges),
  ];
}

/**
 * The two doors of a new tall cabinet (MOD-DEC-566 п. 7, FINDINGS 1277): a chipboard door over 2 m warps, so the door is
 * split where the wall cabinets begin — the upper door starts at their front's bottom, the lower ends a seam below; null
 * for a saved cabinet without the mark or when either door would be under 100 mm.
 */
function tallDoors(m: Rec, gy: number, seam: number): [number, number][] | null {
  if (!m.tallDoorSplit || m.kind !== 'tall') return null;
  const y = KIND_INFO.upper!.floor - m.floor + gy;
  return y - seam - gy >= 100 && m.height - gy - y >= 100 ? [[gy, y - seam], [y, m.height - gy]] : null;
}

/**
 * The back of a new module stands in a quarter of the sides, the bottom and the top (or the rear rail), as in the
 * wardrobe (MOD-DEC-566 п. 2, 287; FINDINGS 1269); the hanger of a wall cabinet keeps the back 16 mm forward, so its
 * quarter is a groove that far from the rear edges. A saved module without the mark keeps the inset back of the prototype.
 */
export const backInRebate = (m: Rec): boolean => m.backConstruction === 'REBATE';

/** The rebate of the back on a carcass panel: its box in the module, `semantic` for the graph (FINDINGS 1269). */
function rebate(s: KitchenScene, m: Rec, id: string, box: number[], depth: number, width: number, groove: boolean): Rec {
  const w = worldBox(s, m, box);
  return {
    id,
    kind: groove ? 'Паз задника' : 'Четверть задника',
    semantic: groove ? 'GROOVE_FOR_BACK' : 'QUARTER_FOR_BACK',
    widthMm: width,
    depthMm: depth,
    localBox: box,
    worldBox: [
      [w[0], w[4], w[2]],
      [w[1], w[5], w[3]],
    ],
    production: false,
    qualification: 'Рабочий профиль четверти шкафа (MODULERO-QUARTER-PROPOSAL-1): фреза и посадка задника проверяются мебельщиком',
  };
}

/** The rectangular carcass with shelves and fronts (kflowCalculated, r1.html:69731). */
function rectCalculated(s: KitchenScene, m: Rec): Rec {
  if (isSingleCorner(m)) return cornerCalculated(s, m);
  const W = m.width,
    H = m.height,
    D = m.depth,
    t = m.panelThickness ?? 16,
    b = m.backThickness ?? defaults.back_thickness_mm!.value,
    ft = frontThickness(s, m, defaults.front_thickness_mm!.value),
    g = frontGap(s, m),
    gy = frontGapY(s, m);
  const front = hasFront(m),
    drawers = m.moduleTypeId === 'KB_DRAWERS',
    frontCount = drawers ? m.fill?.drawers : 1,
    seam = frontSeam(m),
    frontH = (H - 2 * gy - seam * (frontCount - 1)) / frontCount,
    quarter = backInRebate(m),
    r = K.backRebateDepth.value,
    c = K.backInPlaneClearance.value,
    rw = b + K.backRearClearance.value,
    // The hanger of the level (FINDINGS 2754) sets the front face of the back off the wall by its kit; SAH 216 — 16.
    hanger = levelHangerOf(s.hardware, m),
    recess = hanger ? hangerRecessMm(hanger, quarter ? rw : b) : levelHanger(m) ? 0 : m.hangerVariant === SAH216 ? 16 : 0,
    clear = { W: W - 2 * t, H: H - 2 * t, D: D - (quarter ? rw : b) - recess };
  if (drawers && (frontCount !== 4 || !Number.isFinite(seam) || seam < 0 || !Number.isFinite(frontH) || frontH <= 0))
    return fail(clear, 'У этой карточки четыре наружных ящика. Укажите сохранённый шов и положительный размер каждого фасада; короб и направляющие требуют отдельного расчёта.');
  if (!finite(W, H, D, t, b) || Math.min(W, H, D, t, b, clear.W, clear.H, clear.D) <= 0 || (front && (!finite(ft, g, gy) || ft <= 0 || g < 0 || gy < 0 || W - 2 * g <= 0 || H - 2 * gy <= 0)))
    return fail(clear, 'Неположительный размер детали или полости.');
  const edge = bodyEdge(m),
    bodyEdges = { left: 0, right: 0, top: 0, bottom: edge };
  const fe = frontEdge(m),
    frontEdges = { left: fe, right: fe, top: fe, bottom: fe };
  if (!Number.isFinite(edge) || edge < 0 || (front && (!Number.isFinite(fe) || fe < 0))) return fail(clear, 'Кромка должна быть числовой и неотрицательной.');
  // In a quarter the bottom and the top reach the rear edges of the sides, the back goes into all four (FINDINGS 1269).
  const deep = quarter ? D : clear.D,
    p = [
      part(s, m, 'Боковина левая', 'side:L', [H, D, t], [0, t, 0, H, 0, D], 'CORPUS', bodyEdges),
      part(s, m, 'Боковина правая', 'side:R', [H, D, t], [W - t, W, 0, H, 0, D], 'CORPUS', bodyEdges),
      part(s, m, 'Дно', 'bottom', [clear.W, deep, t], [t, W - t, 0, t, 0, deep], 'CORPUS', bodyEdges),
      ...(railsOnTop(m) ? topRails(s, m, clear.W, deep, t, bodyEdges) : [part(s, m, 'Верх', 'top', [clear.W, deep, t], [t, W - t, H - t, H, 0, deep], 'CORPUS', bodyEdges)]),
      quarter
        ? part(s, m, recess ? 'Задник в пазу' : 'Задник в четверти', 'back', [clear.W + 2 * (r - c), clear.H + 2 * (r - c), b], [t - r + c, W - t + r - c, t - r + c, H - t + r - c, D - recess - rw, D - recess - (rw - b)], 'BACK')
        : part(s, m, 'Задник вставной, ненесущий', 'back', [clear.W, clear.H, b], [t, W - t, t, H - t, D - b - recess, D - recess], 'BACK'),
    ];
  if (quarter) {
    const z = [D - recess - rw, D - recess] as const,
      top = railsOnTop(m) ? 'rail:rear' : 'top',
      cut = (id: string, box: number[]) => rebate(s, m, `${m.id}:${id}:rebate`, box, r, rw, recess > 0),
      on = (id: string) => p.find((x) => x.partId === `${m.id}:${id}`)!;
    on('side:L').grooves = [cut('side:L', [t - r, t, t - r, H - t + r, ...z])];
    on('side:R').grooves = [cut('side:R', [W - t, W - t + r, t - r, H - t + r, ...z])];
    on('bottom').grooves = [cut('bottom', [t, W - t, t - r, t, ...z])];
    on(top).grooves = [cut(top, [t, W - t, H - t, H - t + r, ...z])];
  }
  if (!Array.isArray(m.shelfItems) && (!Number.isInteger(m.fill?.shelves ?? 0) || (m.fill?.shelves ?? 0) < 0)) return fail(clear, 'Количество полок должно быть целым неотрицательным числом.');
  const shelves = shelfItems(m),
    levels = shelves.map((x) => x.levelMm).sort((a, b) => a - b);
  if (new Set(shelves.map((x) => x.id)).size !== shelves.length || shelves.some((x) => !Number.isFinite(x.levelMm) || x.levelMm < 0 || x.levelMm + t > clear.H) || levels.some((x, i) => i > 0 && x < levels[i - 1] + t))
    return fail(clear, 'Высота полки или повторный номер некорректны; полки не должны пересекаться.');
  for (const item of shelves) {
    if (typeof item.id !== 'string' || !item.id || !Number.isFinite(item.levelMm)) return fail(clear, 'У каждой полки нужны сохранённый номер и числовая высота.');
    const id = item.id.startsWith(m.id + ':') ? item.id.slice(m.id.length + 1) : 'shelf:' + item.id;
    p.push(item.fixed === true ? part(s, m, 'Полка', id, [clear.W, clear.D, t], [t, W - t, t + item.levelMm, t + item.levelMm + t, 0, clear.D], 'CORPUS', bodyEdges) : removableShelf(s, m, 'Полка', id, t, clear, t + item.levelMm, t, { base: t / 2, low: t, high: H - t }));
  }
  const doors = front && !drawers ? tallDoors(m, gy, seam) : null;
  if (doors && m.frontEnabled !== false)
    for (const [i, [y0, y1]] of doors.entries())
      p.push(part(s, m, 'Фасад', i ? 'upper-door' : 'lower-door', [W - 2 * g, y1 - y0, ft], [g, W - g, y0, y1, -FRONT_CARCASS_GAP - ft, -FRONT_CARCASS_GAP], 'FACADE', frontEdges));
  else if (front && m.frontEnabled !== false)
    for (let i = 0; i < frontCount; i++) {
      const y = gy + i * (frontH + seam);
      p.push(part(s, m, drawers ? 'Фасад ящика ' + (i + 1) : 'Фасад', drawers ? 'drawer-front:' + (i + 1) : 'front', [W - 2 * g, frontH, ft], [g, W - g, y, y + frontH, -FRONT_CARCASS_GAP - ft, -FRONT_CARCASS_GAP], 'FACADE', frontEdges));
    }
  engineeringParts(m, p);
  if (p.some((x) => x.blank_mm.some((v: number) => !Number.isFinite(v) || v <= 0))) return fail(clear, 'Кромка превышает размер заготовки.');
  p.forEach((x, index) => (x.exportPosition = index + 1));
  return {
    status: drawers ? 'GEOMETRY_PARTIAL' : 'GEOMETRY_DRAFT',
    clear,
    parts: p,
    note: drawers
      ? 'Рассчитаны корпус и четыре фасада. Короба, дно ящиков, направляющие и сборка UNKNOWN; полный состав не рассчитан.'
      : front
        ? 'Геометрия; механизм фасада, присадка, крепёж, нагрузки и монтаж UNKNOWN.'
        : 'Открытый корпус без фасада; крепёж, нагрузки и монтаж UNKNOWN.',
    localOpenFields: drawers ? Array.from({ length: 4 }, (_, i) => ({ drawerId: m.id + ':drawer:' + (i + 1), field: 'box parts / bottom / runner / assembly', status: 'UNKNOWN' })) : [],
    body_size_mm: [W, H, D],
    front_count: front ? frontCount : 0,
    front_size_mm: front ? [W - 2 * g, frontH, ft] : null,
    front_carcass_gap_mm: front ? FRONT_CARCASS_GAP : null,
    installed_bottom_mm: m.floor,
  };
}

/** The k7 layer: a rectangular carcass supported only by its r7 fasteners keeps no fronts (r1.html:71249). */
function k7Calculated(s: KitchenScene, m: Rec): Rec {
  const d = rectCalculated(s, m);
  if (!k7Supported(m) && supported(m)) {
    d.parts = d.parts.filter((p: Rec) => p.materialRole !== 'FACADE');
    d.localOpenFields = m.fill?.drawers
      ? Array.from({ length: m.fill.drawers }, (_, i) => ({
          drawerId: m.id + ':drawer:' + (i + 1),
          field: 'actual box partIds/dimensions/grooves/runner and assembly sequence',
          status: 'UNKNOWN',
          constructionPreserved: true,
          conversionRequired: 'Explicit compatible box profile; no BOYARD rear/bottom conversion in r7',
        }))
      : [];
  }
  return d;
}

// ---------------------------------------------------------------- the single-body corner (MOD-DEC-182)

/** The gaps of the corner front (kflowCornerGaps, r1.html:70523). */
export function cornerGaps(s: KitchenScene, m: Rec): Rec {
  const seam = frontSeam(m),
    gx = frontGap(s, m),
    gy = frontGapY(s, m);
  return {
    seam,
    left: m.gapMode === 'auto' ? seam / 2 : (m.gapLeft ?? gx),
    right: m.gapMode === 'auto' ? seam / 2 : (m.gapRight ?? gx),
    top: m.gapTop ?? gy,
    bottom: m.gapBottom ?? gy,
  };
}

/** One body with a door, the fixed blind front and the physical filler (kflowCornerCalculated, r1.html:70537). */
function cornerBaseCalculated(s: KitchenScene, m: Rec): Rec {
  const c = cornerChoice(s, m),
    W = m.width,
    H = m.height,
    D = m.depth,
    B = m.blind_nominal_mm,
    q = m.filler_width_mm,
    r = m.perpendicular_clearance_mm,
    t = m.panelThickness ?? 16,
    ft = frontThickness(s, m),
    g = cornerGaps(s, m),
    left = c?.anchor === 'start';
  // A new corner has its filler at the door (MOD-DEC-566 п. 6, FINDINGS 1274): blind part, filler, seam, door.
  const atDoor = fillerAtDoor(m),
    k = atDoor ? q : 0,
    blind = B - (left ? g.left : g.right),
    door = W - B - k - g.seam - (left ? g.right : g.left),
    fh = H - g.top - g.bottom;
  if (!c || !finite(W, H, D, B, q, r, t, ft, ...Object.values(g))) return { status: 'NEED_DATA', parts: [], note: 'Укажите внутренний угол и все размеры W/B/q/r и зазоры.' };
  if (Math.min(blind, door, fh, ft, q) <= 0 || Math.min(...(Object.values(g) as number[])) < 0)
    return { status: 'FAIL', parts: [], note: 'Ширина двери, глухой части или высота фасада неположительна. Проверьте B, шов и внешние отступы.' };
  const body = calculated(s, { ...m, corner: null, frontEnabled: false }),
    e = frontEdge(m),
    edges = { left: e, right: e, top: e, bottom: e },
    z = -FRONT_CARCASS_GAP;
  if (body.status === 'FAIL') return body;
  const p = body.parts,
    blindX = left ? [g.left, B] : [W - B, W - g.right],
    doorX = left ? [B + k + g.seam, W - g.right] : [g.left, W - B - k - g.seam],
    fillerX = atDoor ? (left ? [B, B + q] : [W - B - q, W - B]) : left ? [-q, 0] : [W, W + q];
  p.push(part(s, m, 'Глухой неподвижный фасад', 'fixed_blind_front', [blind, fh, ft], [...blindX, g.bottom, H - g.top, z - ft, z], 'FACADE', edges));
  // MOD-DEC-371: the door hangs on the side of the blind part (left or right cabinet), not on the outer side; the
  // prototype always hung it on the left. Its hinge is the owner's choice: a temporary one and a remark (mechanisms.ts).
  if (m.frontEnabled !== false) p.push({ ...part(s, m, 'Дверь углового шкафа', 'single_door_front', [door, fh, ft], [...doorX, g.bottom, H - g.top, z - ft, z], 'FACADE', edges), hingeSide: left ? 'left' : 'right' });
  p.push(part(s, m, 'Физический угловой добор', 'physical_corner_filler', [q, H, t], [...fillerX, 0, H, z - t, z], 'CORPUS', { left: 0, right: 0, top: 0, bottom: bodyEdge(m) }));
  p.forEach((x: Rec, i: number) => (x.exportPosition = i + 1));
  return {
    ...body,
    family: 'single_blind_rect_corner',
    schema_version: 2,
    body_instance_id: m.id,
    children: [],
    parts: p,
    front_size_mm: [door, fh, ft],
    clear_opening_mm: body.clear,
    blind_side: left ? 'left' : 'right',
    wall_anchor: c.anchor,
    wall_id: canonicalWall(s, m.wall),
    adjacent_wall_id: canonicalWall(s, c.adjacent),
    room_corner_id: c.id,
    front_layout_mm: {
      blind_nominal: B,
      seam: g.seam,
      outer_gaps: g,
      gap_mode: m.gapMode ?? 'manual',
      fixed_blind_finished_W: blind,
      door_finished_W: door,
      finished_face_H: fh,
      blind_world_line_mm: cornerWorldLine(s, m, blindX[0]!, blindX[1]!),
      door_world_line_mm: cornerWorldLine(s, m, doorX[0]!, doorX[1]!),
      hinge_clear_opening_mm: null,
    },
    filler_geometry_mm: { width: q, thickness: t, outline_world_rect_mm: cornerZones(s, m).filler },
    occupied_projections_mm: { selected_wall: W + wallFiller(m), adjacent_wall: D + r },
    projection_breakdown_mm: { selected_wall: { body_W: W, physical_filler_W: wallFiller(m), total: W + wallFiller(m) }, adjacent_wall: { body_D: D, empty_clearance: r, total: D + r } },
    note: 'Один корпус; резерв пустой. Присадка петли и монтаж стены UNKNOWN, геометрические чертежи доступны.',
  };
}

export const k5Selected = (m: Rec): boolean => isSingleCorner(m) && m.cornerFastening === K5_VARIANT;

/** Why the cleat fastening does not fit the corner, or null (k5Restriction, r1.html:70918). */
function k5Restriction(s: KitchenScene, m: Rec, d: Rec): string | null {
  const t = m.panelThickness ?? 16,
    B = m.blind_nominal_mm,
    q = m.filler_width_mm,
    H = m.height,
    g = cornerGaps(s, m),
    ft = frontThickness(s, m),
    k = CORNER_FASTENING.corner;
  // FINDINGS 1274: the cleats of r5 hold the filler at the wall; the filler of a new corner stands at its door.
  if (fillerAtDoor(m)) return 'Крепление на планках рассчитано на добор у стены; у нового углового добор стоит у двери. Снимите выбранное крепление.';
  if (![16, 18].includes(t)) return 'Крепление на планках рассчитано для корпуса толщиной 16 или 18 мм. Измените толщину или снимите выбранное крепление.';
  if (d.clear.D < K5_CLEAT_D - 2) return 'Глубины внутри корпуса недостаточно для планки крепления. Увеличьте глубину или снимите выбранное крепление.';
  if (!(B > t + k.blindMarginMm)) return `Для крепления на планках глухая зона B должна быть больше ${t + 130} мм. Увеличьте B или снимите выбранное крепление.`;
  if (!(q >= k.minimumFillerMm)) return 'Для крепления на планках добор q должен быть не меньше 27 мм. Увеличьте q или снимите выбранное крепление.';
  if (H - 2 * t < 32) return 'В корпусе не помещаются две планки толщиной 16 мм. Измените высоту или снимите выбранное крепление.';
  if (Math.min(t + 8 - g.bottom, t + 8 - g.top) < 4 || ft <= 11) return 'Гнездо Ø8 × 11 мм выходит за выбранный фасад. Проверьте толщину и верхний/нижний зазоры или снимите крепление.';
  const blind = d.parts.find((p: Rec) => p.partId.endsWith(':fixed_blind_front'));
  const left = d.blind_side === 'left',
    stations = left ? [t + 65, B - 65] : [m.width - B + 65, m.width - t - 65];
  if (stations.some((x) => Math.min(x - blind.box[0], blind.box[1] - x) < 4)) return 'Гнёзда крепления выходят за глухой фасад при заданных боковых зазорах. Уменьшите зазоры или снимите крепление.';
  return null;
}

const k5WorldPoint = (s: KitchenScene, m: Rec, p: number[]) => {
  const b = worldBox(s, m, [p[0]!, p[0]!, p[2]!, p[2]!, p[1]!, p[1]!]);
  return [b[0], b[2], b[4]];
};
function k5WorldDirection(s: KitchenScene, m: Rec, d: number[]): number[] {
  const a = k5WorldPoint(s, m, [0, 0, 0]),
    b = k5WorldPoint(s, m, d);
  return b.map((x, i) => x - a[i]!);
}
function k5Operation(s: KitchenScene, m: Rec, p: Rec, id: string, kind: string, diameter: number, depth: number | null, entry: number[], dir: number[], local: number[], localDir: number[], surface: string, extra: Rec = {}): Rec {
  return {
    id: p.partId + ':' + id,
    partId: p.partId,
    kind,
    diameter,
    depth,
    entryBodyXYZmm: entry,
    directionBodyXYZ: dir,
    entryLocalUVWmm: local,
    directionLocalUVW: localDir,
    entryWorldXYZmm: k5WorldPoint(s, m, entry),
    directionWorldXYZ: k5WorldDirection(s, m, dir),
    surfaceLabel: surface,
    knownGeometry: true,
    production: false,
    source: 'CORNER_FASTENING_R5#/drillingMap',
    ...extra,
  };
}

/** Hardware of the cleat fastening (k5CornerHardware, r1.html:71051). */
export function k5CornerHardware(m: Rec): Rec[] {
  if (!k5Selected(m)) return [];
  return [
    { article: '25062', name: 'Эксцентрик Rastex 15, для планки 16 мм', quantity: 6 },
    { article: '47458', name: 'Шток Rapid S DU325 с распорной втулкой', quantity: 6 },
    { article: null, name: 'Саморез для крепления планок к корпусу, предлагаемый размер 3,5 × 30 мм', quantity: 6, conditional: true, selectedSku: null },
  ].map((x) => ({ ...x, moduleId: m.id, kitId: K5_VARIANT, unit: 'piece', price: null, amount: null, source: 'CORNER_FASTENING_R5#/productIdentity', production: false }));
}

/** The corner with its four cleats and their operations when the fastening is chosen (k5 layer, r1.html:70938). */
export function cornerCalculated(s: KitchenScene, m: Rec): Rec {
  const d = cornerBaseCalculated(s, m);
  if (!k5Selected(m) || !d.parts.length) return d;
  const why = k5Restriction(s, m, d);
  if (why) return { ...d, status: 'FAIL', parts: [], note: why };
  const k = CORNER_FASTENING.corner,
    t = m.panelThickness ?? 16,
    W = m.width,
    H = m.height,
    B = m.blind_nominal_mm,
    q = m.filler_width_mm,
    left = d.blind_side === 'left';
  const blind = d.parts.find((p: Rec) => p.partId.endsWith(':fixed_blind_front')),
    filler = d.parts.find((p: Rec) => p.partId.endsWith(':physical_corner_filler'));
  filler.finished_mm[2] = 16;
  filler.blank_mm[2] = 16;
  filler.box[4] = -18;
  filler.box[5] = -2;
  d.filler_geometry_mm.thickness = 16;
  const railMargin = k.railEndMarginMm,
    camMargin = k.camEndMarginMm,
    dm = k.drilling,
    camY = k.rule.camYmm,
    screwY = k.rule.bodyScrewYmm,
    rearY = k.datum.faceRearYmm;
  const xr = left ? [t + railMargin, B - railMargin] : [W - B + railMargin, W - t - railMargin],
    fx = left ? [-q, 0] : [W, W + q];
  const stations = [xr[0]! + camMargin, xr[1]! - camMargin],
    fstation = left ? -q / 2 : W + q / 2,
    inside: Rec[] = [];
  const cleats: Rec[] = [];
  for (const type of ['blind', 'filler'])
    for (const high of [false, true]) {
      const x = type === 'blind' ? xr : fx,
        z = high ? [H - t - K5_CLEAT_T, H - t] : [t, t + K5_CLEAT_T],
        name = `Планка ${type === 'blind' ? 'глухого фасада' : 'добора'} · ${high ? 'верхняя' : 'нижняя'}`;
      const p = part(s, m, name, `corner_${type}_cleat_${high ? 'high' : 'low'}`, [x[1]! - x[0]!, K5_CLEAT_D, K5_CLEAT_T], [...x, ...z, k.datum.faceRearYmm, K5_CLEAT_D - 2], 'CORPUS');
      p.operations = [];
      p.proposedOperations = [];
      p.drillingStatus = 'KNOWN_RASTEX_LOCAL_SCREW_UNQUALIFIED';
      p.variant = K5_VARIANT;
      const xs = type === 'blind' ? stations : [fstation],
        face = type === 'blind' ? blind : filler;
      face.operations ??= [];
      for (const [i, xc] of xs.entries()) {
        const mid = z[0]! + K5_CLEAT_T / 2,
          entryZ = high ? z[0]! : z[1]!,
          dz = high ? 1 : -1;
        face.operations.push(k5Operation(s, m, face, `anchor-${high ? 'high' : 'low'}-${i + 1}`, 'Гнездо штока DU325', dm.faceAnchor.diameterMm, dm.faceAnchor.depthMm, [xc, rearY, mid], [0, -1, 0], [xc - face.box[0], mid - face.box[2], 0], [0, 0, 1], 'Тыльная поверхность'));
        p.operations.push(
          k5Operation(s, m, p, `cup-${i + 1}`, 'Чашка эксцентрика 25062', dm.camPocket.diameterMm, dm.camPocket.depthMm, [xc, camY, entryZ], [0, 0, dz], [xc - x[0]!, camY - rearY, high ? 0 : K5_CLEAT_T], [0, 0, dz], high ? 'Нижняя поверхность' : 'Верхняя поверхность', {
            engagementBodyXYZmm: [xc, camY, mid],
            engagementLocalUVWmm: [xc - x[0]!, camY - rearY, K5_CLEAT_T / 2],
          }),
        );
        p.operations.push(
          k5Operation(s, m, p, `channel-${i + 1}`, 'Торцевой канал штока', dm.edgeChannel.diameterMm, null, [xc, rearY, mid], [0, 1, 0], [xc - x[0]!, 0, K5_CLEAT_T / 2], [0, 1, 0], 'Передний торец', {
            nominalAxisToCamCenterMm: dm.edgeChannel.nominalAxisToCamCenterMm,
            cylindricalDepthMm: dm.edgeChannel.cylindricalDepthMm,
            totalToolStrokeMm: dm.edgeChannel.totalToolStrokeMm,
          }),
        );
        p.proposedOperations.push({
          id: p.partId + ':screw-' + (i + 1),
          article: null,
          sizeMm: [3.5, 30],
          bodyEntryXYZmm: type === 'blind' ? [xc, screwY, high ? H : 0] : [left ? t : W - t, screwY, mid],
          bodyDirectionXYZ: type === 'blind' ? [0, 0, high ? -1 : 1] : [left ? -1 : 1, 0, 0],
          supportDepthLocalMm: screwY - rearY,
          clearanceDiameterMm: dm.bodyClearance.diameterMm,
          clearanceDepthMm: t,
          pilotDiameterMm: dm.cleatPilot.diameterMm,
          pilotDepthMm: dm.cleatPilot.depthMm,
          production: false,
        });
      }
      cleats.push(p);
      d.parts.push(p);
      if (type === 'blind') inside.push({ partId: p.partId, box: [Math.max(t, x[0]!), Math.min(W - t, x[1]!), ...z, 0, Math.min(62, d.clear.D)], reason: 'Only body-supported portion; filler cleats are outboard' });
    }
  const occupied = inside.reduce((n, p) => n + (p.box[1] - p.box[0]) * (p.box[3] - p.box[2]) * (p.box[5] - p.box[4]), 0);
  const shelf = d.parts.find((p: Rec) => p.name === 'Полка' && cleats.some((c) => [0, 2, 4].every((i) => Math.min(p.box[i + 1], c.box[i + 1]) - Math.max(p.box[i], c.box[i]) > 0.1)));
  if (shelf) return { ...d, status: 'FAIL', parts: [], note: `Полка ${shelf.partId} пересекает планку крепления. Измените высоту полки или снимите крепление.` };
  d.parts.forEach((p: Rec, i: number) => (p.exportPosition = i + 1));
  d.fasteningR5 = {
    variant: K5_VARIANT,
    source: 'CORNER_FASTENING_R5',
    bodyCount: 1,
    cleatThicknessMm: K5_CLEAT_T,
    faceRearYmm: k.datum.faceRearYmm,
    camYmm: k.rule.camYmm,
    bodyScrewYmm: k.rule.bodyScrewYmm,
    insideSupportRegions: inside,
    occupiedInsideVolumeMm3: occupied,
    usableBodyVolumeMm3: d.clear.W * d.clear.H * d.clear.D - occupied,
    hardware: k5CornerHardware(m),
    fullToolStrokeMm: null,
    production: false,
    accessGuarantee: false,
    proposedOperations: cleats.flatMap((p) => p.proposedOperations),
  };
  return d;
}

// ---------------------------------------------------------------- the accessible L corner (kp)

export function mirror(m: Rec, poly: number[][]): number[][] {
  return m.cornerSide === 'right' ? poly.map(([x, y]) => [m.width - x!, y!]) : poly.map((p) => [...p]);
}
export function bounds(poly: number[][]): number[] {
  const xs = poly.map((p) => p[0]!),
    ys = poly.map((p) => p[1]!);
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
}
export function area(poly: number[][]): number {
  return Math.abs(
    poly.reduce((s, a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      return s + a[0]! * b[1]! - b[0]! * a[1]!;
    }, 0) / 2,
  );
}
/** A plan rectangle [x0, x1, y0, y1] of a corner (y from the wall) as a box of the module (kpBox, r1.html:72305). */
export function planBox(m: Rec, xy: number[], z0: number, z1: number): number[] {
  return [xy[0]!, xy[1]!, z0, z1, m.depth - xy[3]!, m.depth - xy[2]!];
}

function polygonPart(s: KitchenScene, m: Rec, name: string, id: string, leftPoly: number[][], leftNotch: number[][], z: number): Rec {
  const poly = mirror(m, leftPoly),
    notch = mirror(m, leftNotch),
    b = bounds(poly),
    t = m.panelThickness ?? 16,
    p = part(s, m, name, id, [b[1]! - b[0]!, b[3]! - b[2]!, t], planBox(m, b, z, z + t));
  return {
    ...p,
    finished_polygon_mm: poly,
    blank_polygon_mm: null,
    blank_mm: [],
    edge_mm: { left: null, right: null, top: null, bottom: null },
    rectangularEnvelopeOnly: true,
    rectangularExportEligible: false,
    finished_area_mm2: area(poly),
    blankStatus: 'UNKNOWN',
    edgeStatus: 'UNKNOWN',
    notchLocalBox: planBox(m, bounds(notch), z, z + t),
    note: 'Идеальный Г-образный контур. Прямоугольные размеры — габарит, не форма детали. Карта кромок, заготовка, присадка и крепление UNKNOWN.',
  };
}

/** The ideal 90° accessible L carcass (kpCalculatedL, r1.html:72335). */
export function accessLCalculated(s: KitchenScene, m: Rec): Rec {
  const pa = m.width,
    pb = m.cornerReturn,
    da = m.depth,
    db = m.depth,
    H = m.height,
    t = m.panelThickness ?? 16,
    clear = { W: pa - 2 * t, H: H - 2 * t, D: pb - 2 * t },
    count = Array.isArray(m.shelfItems) ? m.shelfItems.length : (m.fill?.shelves ?? 1);
  if (!finite(pa, pb, da, db, H, t, m.floor) || H <= 2 * t || Math.min(da, db) <= 2 * t || pa <= da + t || pb <= db + t || !['left', 'right'].includes(m.cornerSide) || !Number.isInteger(count) || count < 0 || count * t > clear.H)
    return fail(clear, 'Для идеального Г-корпуса нужны положительные проекции обоих плеч, глубины, высота, толщина и выбранная сторона; полки должны помещаться.');
  if (m.angle_degrees != null && m.angle_degrees !== 90) return { status: 'NEED_DATA', clear, parts: [], note: 'Этот шаблон рассчитан для идеальных 90°. Для другого измеренного угла нужен отдельный контур.' };
  const full = [[0, 0], [pa, 0], [pa, db], [da, db], [da, pb], [0, pb]],
    cut = [[da, db], [pa, db], [pa, pb], [da, pb]],
    inner = [[t, t], [pa - t, t], [pa - t, db - t], [da - t, db - t], [da - t, pb - t], [t, pb - t]],
    innerCut = [[da - t, db - t], [pa - t, db - t], [pa - t, pb - t], [da - t, pb - t]],
    parts = [polygonPart(s, m, 'Г-образное дно', 'polygon-bottom', full, cut, 0), polygonPart(s, m, 'Г-образный верх', 'polygon-top', full, cut, H - t)];
  const walls: [string, string, number, number[][]][] = [
    ['Задняя панель A', 'rear-A', pa - 2 * t, [[t, 0], [pa - t, 0], [pa - t, t], [t, t]]],
    ['Задняя панель B', 'rear-B', pb - t, [[0, t], [t, t], [t, pb], [0, pb]]],
    ['Торцевая панель A', 'end-A', db - t, [[pa - t, t], [pa, t], [pa, db], [pa - t, db]]],
    ['Торцевая панель B', 'end-B', da - t, [[t, pb - t], [da, pb - t], [da, pb], [t, pb]]],
  ];
  for (const [name, id, w, poly] of walls) {
    const xy = bounds(mirror(m, poly));
    parts.push({ ...part(s, m, name, id, [w, H - 2 * t, t], planBox(m, xy, t, H - t)), rectangularExportEligible: true, localOutlineMm: mirror(m, poly), edgeStatus: 'NOMINAL_UNBANDED', blankStatus: 'NOMINAL_GEOMETRY' });
  }
  const shelves = shelfItems(m),
    levels = shelves.map((x) => x.levelMm).sort((a, b) => a - b);
  if (new Set(shelves.map((x) => x.id)).size !== shelves.length || shelves.some((x) => !x.id || typeof x.id !== 'string' || !Number.isFinite(x.levelMm) || x.levelMm < 0 || x.levelMm + t > clear.H) || levels.some((z, i) => i && z < levels[i - 1] + t))
    return fail(clear, 'Полки выходят за полость, пересекаются или имеют повторные номера.');
  for (const sh of shelves) {
    const id = sh.id.startsWith(m.id + ':') ? sh.id.slice(m.id.length + 1) : 'shelf:' + sh.id;
    parts.push(polygonPart(s, m, 'Г-образная полка', id, inner, innerCut, t + sh.levelMm));
  }
  parts.forEach((p, i) => (p.exportPosition = i + 1));
  return {
    status: 'GEOMETRY_DRAFT',
    family: 'accessible_l_corner',
    clear,
    parts,
    front_size_mm: null,
    front_count: 0,
    body_size_mm: [pa, H, pb],
    geometryBasis: 'IDEAL_90',
    actualCornerAngleStatus: m.angle_degrees === 90 ? 'EXPLICIT_90_INPUT' : 'UNMEASURED',
    finished_footprint_mm: mirror(m, full),
    note: 'Идеальная геометрия 90°. Реальный угол, двери, доступ, кромки полигональных деталей, заготовки, крепление и монтаж UNKNOWN.',
  };
}

function kpCalculated(s: KitchenScene, m: Rec): Rec {
  return isAccessL(m) ? accessLCalculated(s, m) : k7Calculated(s, m);
}

/** The island layer: an island is calculated with the depth of its body (kiGeometryInput, r1.html:72567). */
export const geometryInput = (m: Rec): Rec => (isFree(m) ? { ...m, depth: bodyDepth(m) } : m);

// ---------------------------------------------------------------- appliance carcasses and the diagonal corner (kn, kpm)

function knAddFront(s: KitchenScene, m: Rec, d: Rec): Rec {
  const g = frontGap(s, m),
    gy = frontGapY(s, m),
    ft = frontThickness(s, m, defaults.front_thickness_mm!.value),
    e = frontEdge(m),
    W = m.width - 2 * g,
    H = m.height - 2 * gy;
  if (!finite(g, gy, ft, e, W, H) || g < 0 || gy < 0 || e < 0 || Math.min(ft, W - 2 * e, H - 2 * e) <= 0) return { ...d, status: 'FAIL', parts: [], note: 'Фасад: нужны положительные размеры, толщина и неотрицательные зазор и кромка.' };
  d.parts = d.parts.filter((p: Rec) => p.materialRole !== 'FACADE');
  if (m.frontEnabled !== false) d.parts.push(part(s, m, 'Фасад', 'front', [W, H, ft], [g, m.width - g, gy, m.height - gy, -FRONT_CARCASS_GAP - ft, -FRONT_CARCASS_GAP], 'FACADE', { left: e, right: e, top: e, bottom: e }));
  d.front_count = m.frontEnabled === false ? 0 : 1;
  d.front_size_mm = [W, H, ft];
  d.front_carcass_gap_mm = FRONT_CARCASS_GAP;
  return d;
}

/** The known nominal panels of an appliance carcass (knRectCalculated, r1.html:72722). */
function knRectCalculated(s: KitchenScene, m: Rec): Rec {
  const card = KITCHEN_STANDARD.cards.find((c) => c.moduleTypeId === m.moduleTypeId),
    v = KITCHEN_STANDARD.variants[card?.variant],
    W = m.width,
    H = m.height,
    D = isFree(m) ? bodyDepth(m) : m.depth,
    t = m.panelThickness ?? 16,
    edge = bodyEdge(m);
  if (!v || card!.family !== 'rect_carcass' || !finite(W, H, D, t, edge) || Math.min(W - 2 * t, H, D, t, D - edge, H - edge) <= 0 || edge < 0)
    return fail(null, 'Нужны положительные размеры боковин, полости и толщины; кромка не должна превышать деталь.');
  const top = v.top === 'panel',
    bottom = v.bottom === 'panel',
    clear = { W: W - 2 * t, H: H - (top ? t : 0) - (bottom ? t : 0), D },
    e = { left: 0, right: 0, top: 0, bottom: edge };
  if (clear.H <= 0) return fail(clear, 'Неположительная высота полости.');
  const parts = [part(s, m, 'Боковина левая', 'side:L', [H, D, t], [0, t, 0, H, 0, D], 'CORPUS', e), part(s, m, 'Боковина правая', 'side:R', [H, D, t], [W - t, W, 0, H, 0, D], 'CORPUS', e)];
  if (bottom) parts.push(part(s, m, 'Дно', 'bottom', [clear.W, D, t], [t, W - t, 0, t, 0, D], 'CORPUS', e));
  if (top) parts.push(part(s, m, 'Верх', 'top', [clear.W, D, t], [t, W - t, H - t, H, 0, D], 'CORPUS', e));
  let d: Rec = {
    status: 'GEOMETRY_PARTIAL',
    clear,
    parts,
    body_size_mm: [W, H, D],
    front_size_mm: null,
    front_count: 0,
    nominalUnknownFields: [...(v.hold || []), ...['top', 'bottom', 'back'].filter((k) => ['conditional', 'traverses'].includes(v[k])).map((k) => k + ': ' + v[k])],
    note: 'Показаны только известные номинальные панели. Условные опоры, перемычки, задник, техника, крепление и монтаж требуют собственного расчёта.',
  };
  if (knFront(m)) d = knAddFront(s, m, d);
  if (d.parts.some((p: Rec) => p.blank_mm.some((x: number) => !Number.isFinite(x) || x <= 0))) return { ...d, status: 'FAIL', parts: [], note: 'Неположительная заготовка панели.' };
  d.parts.forEach((p: Rec, i: number) => (p.exportPosition = i + 1));
  return d;
}

/** The diagonal corner from the L template, its polygons placed in 3D (knDiagonalCalculated r1.html:72778 with kpm 72963). */
export function diagonalCalculated(s: KitchenScene, m: Rec): Rec {
  const template = accessLCalculated(s, { ...m, corner: 'access-l', moduleTypeId: m.kind === 'upper' ? 'KW_CORNER_ACCESS_L' : 'KB_CORNER_ACCESS_L' });
  if (template.status !== 'GEOMETRY_DRAFT') return { ...template, polygonPending: [] };
  const pa = m.width,
    pb = m.cornerReturn,
    D = m.depth,
    t = m.panelThickness ?? 16,
    full = [[0, 0], [pa, 0], [pa, D], [D, pb], [0, pb]],
    inner = [[t, t], [pa - t, t], [pa - t, D - t], [D - t, pb - t], [t, pb - t]];
  const pending = template.parts
    .filter((p: Rec) => p.finished_polygon_mm)
    .map((p: Rec) => {
      const poly = mirror(m, p.name === 'Г-образная полка' ? inner : full),
        b = bounds(poly),
        z = Array.isArray(m.shelfItems) ? p.box[2] : Number(p.box[2].toFixed(5)),
        { notchLocalBox: _, ...rest } = p;
      return {
        ...rest,
        name: p.name === 'Г-образная полка' ? 'Диагональная полка' : p.partId.endsWith(':polygon-bottom') ? 'Диагональное дно' : 'Диагональный верх',
        finished_polygon_mm: poly,
        finished_area_mm2: area(poly),
        finished_mm: [b[1]! - b[0]!, b[3]! - b[2]!, t],
        box: null,
        exportPosition: null,
        status: 'NEED_RENDERER_3D',
        positionStatus: 'KNOWN_NOMINAL_POSE',
        local_z_bottom_mm: z,
        worldFootprintMm: poly.map(([x, y]) => {
          const q = worldBox(s, m, [x!, x!, z, z, m.depth - y!, m.depth - y!]);
          return [q[0], q[4]];
        }),
        note: 'Точный идеальный диагональный контур и высота известны. Наклонный полигон не поддержан текущим 3D-контрактом; прямоугольник не подставляется. Заготовка, кромки, двери, соединения и монтаж UNKNOWN.',
      };
    });
  const parts = template.parts.filter((p: Rec) => !p.finished_polygon_mm);
  parts.forEach((p: Rec, i: number) => (p.exportPosition = i + 1));
  const d: Rec = {
    ...template,
    status: 'GEOMETRY_PARTIAL',
    parts,
    polygonPending: pending,
    nominalGeometricPartCount: parts.length + pending.length,
    geometryBasis: 'IDEAL_90',
    note: 'Четыре вертикальные панели в 3D. Диагональные крышки и полки имеют точный SVG-контур, но исключены из 3D и прямоугольного раскроя; фасады, крепление и производство не подтверждены.',
  };
  // kpm (r1.html:72963): the polygons are placed as boxes of the renderer.
  if (!d.polygonPending?.length || d.status !== 'GEOMETRY_PARTIAL') return d;
  const polygons = d.polygonPending.map((p: Rec) => {
    const [x0, x1, y0, y1] = bounds(p.finished_polygon_mm),
      z = p.local_z_bottom_mm,
      th = p.finished_mm[2];
    return {
      ...p,
      box: [x0, x1, z, z + th, m.depth - y1!, m.depth - y0!],
      status: 'GEOMETRY_DRAFT',
      diagonalPolygon: true,
      note: 'Точный идеальный диагональный контур в 2D и 3D. Заготовка, карта кромок, двери, соединения и монтаж UNKNOWN. Полигон не включён в прямоугольный раскрой и сумму материала.',
    };
  });
  return {
    ...d,
    parts: [...d.parts, ...polygons],
    polygonPending: [],
    rendererBasis: 'EXISTING_RENDERER_POLYGON_EXTRUSION',
    note: 'Корпус и полки имеют точный идеальный диагональный контур в 3D. Фасады, соединения, заготовки и монтаж требуют уточнения.',
  };
}

function knCalculated(s: KitchenScene, m: Rec): Rec {
  if (isDiagonal(m)) return diagonalCalculated(s, m);
  if (isKnRect(m)) return knRectCalculated(s, m);
  const d = kpCalculated(s, geometryInput(m));
  if (m?.moduleTypeId !== 'KW_DRYER' || d.status === 'FAIL') return d;
  const result = knAddFront(s, m, d);
  result.nominalUnknownFields = ['exact drying rack', 'tray', 'wall load', 'door hardware'];
  if (result.status !== 'FAIL') result.status = 'GEOMETRY_PARTIAL';
  result.parts.forEach((p: Rec, i: number) => (p.exportPosition = i + 1));
  return result;
}

// ---------------------------------------------------------------- TANDEM drawers of the drawer cabinet (kre)

/** A groove of a drawer box (kreGroove, r1.html:73685). */
export function groove(s: KitchenScene, m: Rec, id: string, box: number[]): Rec {
  const w = worldBox(s, m, box);
  return {
    id,
    kind: 'project rectangular groove',
    widthMm: 16.2,
    depthMm: 6,
    localBox: box,
    worldBox: [
      [w[0], w[4], w[2]],
      [w[1], w[5], w[3]],
    ],
    production: false,
    qualification: 'Project choice for16mm bottom: material fit and tooling must be checked',
  };
}

/** The SAH216 hanger fits the cabinet (kreHangerEligible, r1.html:73682). */
export function hangerEligible(m: Rec): boolean {
  return m.hangerVariant === SAH216 && !levelHanger(m) && (m.panelThickness ?? 16) >= 16 && [3, 4, 5].includes(m.backThickness ?? 3) && m.depth <= 400 && m.height > m.depth;
}

// ---------------------------------------------------------------- the one TANDEM box (KF-17)

/** Box of the TANDEM NL500 kit: sides and front 16 mm, length 490, bottom in 6 mm grooves (BLUM-TANDEM560H5000B-WOOD16). */
const TANDEM_BOX = { side: 16, bottom: 16, groove: 6, length: 490, runnerClearance: 14.5, bottomFloor: 27.5, minTopGap: 7 };
/**
 * The height of a drawer box is the wardrobe's, 80–320 mm (MOD-DEC-341, 565; FINDINGS 1182): the kitchen has no rule of
 * its own — the prototype's 90–150 of this box and its «drawer pitch 110» were not decisions.
 */
const BOX_HEIGHT = { min: wardrobeDrawers.constants.boxHeightMin.value, max: wardrobeDrawers.constants.boxHeightMax.value };

/**
 * The layout of a TANDEM drawer stack in a zone (KF-17, FINDINGS 320): the prototype computed the box twice, in
 * the kre layer (r1.html:73699) and in kcrDrawerSet (r1.html:74278), and the two disagreed for a bottom recess
 * of 12 mm; here both read one layout. The lowest box stands on the runner clearance or so that its bottom is 27.5 mm
 * above the carcass bottom, whichever is higher (the kre rule).
 */
function tandemLayout(m: Rec, t: number, pitch: number): Rec {
  const B = TANDEM_BOX,
    recess = m.drawerDesign?.bottomRecessMm ?? 13,
    startY = t + Math.max(B.runnerClearance, B.bottomFloor - recess),
    // The prototype took pitch − 53 (r1.html:73720, 74289), which keeps the top gap of 7 mm over a 16 mm carcass only: the bottom
    // and the top panel each take t. Grown by the extra thickness, the same rule fits an 18 mm carcass (KF-16, FINDINGS 326).
    allowance = 53 + 2 * (t - B.side),
    sideH = m.drawerDesign?.sideHeightMm ?? Math.min(BOX_HEIGHT.max, pitch - allowance - (startY - t - B.runnerClearance));
  return { recess, startY, sideH };
}

/** Whether a stack of n boxes fits a zone of height H: the height of each box and the top gap over the last. */
function stackFits(t: number, H: number, n: number, pitch: number, l: Rec): boolean {
  return Number.isFinite(l.sideH) && t >= TANDEM_BOX.side && l.sideH >= BOX_HEIGHT.min && l.sideH <= BOX_HEIGHT.max && l.startY + (n - 1) * pitch + l.sideH <= H - t - TANDEM_BOX.minTopGap;
}

/** Whether a TANDEM stack of n boxes fits a zone of height H (kre and kcr checks, one rule). */
function tandemFits(s: KitchenScene, m: Rec, t: number, H: number, n: number, internal: number, pitch: number, l: Rec): boolean {
  return [12, 13, 14, 15].includes(l.recess) && bodyDepth(m) - (m.backThickness ?? 3) >= 503 && internal >= 180 && frontThickness(s, m) >= 16 && stackFits(t, H, n, pitch, l);
}

/** The drawerDesign record of a stack (the same in kre and kcr). */
const tandemDesign = (internal: number, outer: number, l: Rec): Rec => ({
  boxInternalWidthMm: internal,
  drawerOuterWidthMm: outer,
  sideLengthMm: TANDEM_BOX.length,
  sideHeightMm: l.sideH,
  bottomWidthMm: internal + 2 * TANDEM_BOX.groove,
  bottomDepthMm: TANDEM_BOX.length - TANDEM_BOX.side + TANDEM_BOX.groove,
  bottomRecessMm: l.recess,
});

/** The drawerDesign record of a stack on the runner of the level (FINDINGS 1863): the box of the kit. */
const levelDesign = (r: KitchenDrawerRunner, l: Rec): Rec => ({
  boxInternalWidthMm: r.n.boxW - 2 * TANDEM_BOX.side,
  drawerOuterWidthMm: r.n.boxW,
  sideLengthMm: r.n.boxD,
  sideHeightMm: l.sideH,
  bottomWidthMm: r.n.boxW - 2 * TANDEM_BOX.side,
  bottomDepthMm: r.n.boxD - TANDEM_BOX.side,
  bottomRecessMm: r.n.concealed!.bottomRecessMm,
  runnerArticle: r.n.sku,
});

/** What stays open of a drawer on the runner of the level: the fixing of the facade to its box (FINDINGS 1863). */
const LEVEL_OPEN_FIELDS: Rec[] = [
  { field: 'Крепление фасада ящика к коробу', status: 'HARDWARE_CONFIRMATION_REQUIRED', message: 'Фасад стоит на торцах боковин и дна короба набора БАЗИС; крепёж и места каталог не печатает — требуется подтверждение фурнитуры.' },
];

/** The five parts of box i with their grooves; z is the front face of the box (the rear face of its front). */
function tandemBox(s: KitchenScene, m: Rec, i: number, x: number, internal: number, outer: number, y: number, l: Rec, z: number): Rec[] {
  const B = TANDEM_BOX,
    st = B.side,
    gd = B.groove,
    sideL = B.length,
    did = m.id + ':drawer:' + (i + 1),
    by = y + l.recess,
    top = y + l.sideH,
    rear = by + B.bottom;
  const configs: [string, string, number[], number[]][] = [
    ['Боковина ящика левая', 'left-side', [sideL, l.sideH, st], [x, x + st, y, top, z, z + sideL]],
    ['Боковина ящика правая', 'right-side', [sideL, l.sideH, st], [x + outer - st, x + outer, y, top, z, z + sideL]],
    ['Передняя стенка короба', 'box-front', [internal, l.sideH, st], [x + st, x + outer - st, y, top, z, z + st]],
    ['Задняя стенка ящика', 'box-rear', [internal, top - rear, st], [x + st, x + outer - st, rear, top, z + sideL - st, z + sideL]],
    ['Дно ящика в пазах', 'bottom-panel', [internal + 2 * gd, sideL - (st - gd), B.bottom], [x + st - gd, x + outer - st + gd, by, by + B.bottom, z + st - gd, z + sideL]],
  ];
  const parts = configs.map(([name, suffix, dim, box]) => {
    const p = part(s, m, name, 'drawer:' + (i + 1) + ':' + suffix, dim, box, 'CONTENT');
    return Object.assign(p, { drawerId: did, runnerProfile: m.drawerProfile, boxInternalWidthMm: internal, drawerOuterWidthMm: outer, motionKind: 'drawer-box', motionTravelMm: 500, manufacturingQualified: false, drillingStatus: 'TEMPLATE_AND_MATERIAL_QUALIFICATION_REQUIRED' });
  });
  const lo = by - 0.1,
    hi = by + B.bottom + 0.1;
  parts[0]!.grooves = [groove(s, m, did + ':groove:L', [x + st - gd, x + st, lo, hi, z + st - gd, z + sideL])];
  parts[1]!.grooves = [groove(s, m, did + ':groove:R', [x + outer - st, x + outer - st + gd, lo, hi, z + st - gd, z + sideL])];
  parts[2]!.grooves = [groove(s, m, did + ':groove:F', [x + st, x + outer - st, lo, hi, z + st - gd, z + st])];
  return parts;
}

// ---------------------------------------------------------------- the box of the runner of the level (514)

/**
 * The runner of the drawers of a stack of a new module (MOD-DEC-514; FINDINGS 1863): by the selection of every product
 * (kitchen/drawer-runner.ts) in the opening between the sides, behind the plane of the fronts. The boxes stand where the
 * stack of the drawer cabinet puts them (tandemLayout: the same heights), so one runner serves the stack — the fronts of a
 * stack are of one size. A string — no runner: why.
 */
function levelStack(s: KitchenScene, m: Rec, t: number, l: Rec, frontVolumeMm3: number): KitchenDrawerRunner | string {
  const runnerZ = Math.max(-FRONT_CARCASS_GAP, 0);
  return kitchenDrawerRunner(s.hardware, {
    openingWidthMm: m.width - 2 * t,
    insideDepthMm: bodyDepth(m) - (m.backThickness ?? 3) - runnerZ,
    boardMm: TANDEM_BOX.side,
    boxY: 0,
    boxTop: l.sideH,
    frontMm: -FRONT_CARCASS_GAP,
    frontVolumeMm3,
  });
}

/**
 * The four parts of box i on the runner of the level (FINDINGS 1863): the walls of its BAZIS kit (concealedBoxWalls) —
 * the sides NL − 10 from the plane of the fronts, the bottom of the board between them 11 mm over their lower edge, the
 * back over it; the facade is the front of the box, no front wall. The top edges of the sides and the back are seen in
 * the open drawer and banded, as the box of the wardrobe (1862, (Д)). `y` is the lower edge of the sides.
 */
function levelBox(s: KitchenScene, m: Rec, i: number, r: KitchenDrawerRunner, y: number, l: Rec): Rec[] {
  const t = m.panelThickness ?? 16,
    k = TANDEM_BOX.side,
    did = m.id + ':drawer:' + (i + 1),
    n = { ...r.n, boxY: y, boxTop: y + l.sideH },
    walls = Object.fromEntries(concealedBoxWalls(n, t, k).map((w) => [w.key, w])),
    top = { left: 0, right: 0, top: bodyEdge(m), bottom: 0 },
    record = {
      slideId: r.slide.id,
      brand: r.slide.brand,
      article: r.n.sku,
      nominalMm: r.n.NL,
      massKg: r.massKg,
      loadKg: r.n.loadKg,
      substitution: r.substitution,
      runnerZ: Math.max(-FRONT_CARCASS_GAP, 0),
      cabinetMountZ: [...r.n.cabinetMountZ],
      concealed: { ...r.n.concealed! },
    },
    // [name, id, the wall of the kit, the finished size from its extent (across, in depth, up), the edges]
    configs: [string, string, string, number[], Rec | null][] = [
      ['Боковина ящика левая', 'left-side', 'side-left', [1, 2, 0], top],
      ['Боковина ящика правая', 'right-side', 'side-right', [1, 2, 0], top],
      ['Задняя стенка ящика', 'box-rear', 'back', [0, 2, 1], top],
      ['Дно ящика', 'bottom-panel', 'bottom', [0, 1, 2], null],
    ];
  return configs.map(([label, suffix, key, axes, edges]) => {
    const w = walls[key]!,
      p = part(s, m, label, 'drawer:' + (i + 1) + ':' + suffix, axes.map((a) => w.ext[a]!), [w.o[0], w.o[0] + w.ext[0], w.o[2], w.o[2] + w.ext[2], w.o[1], w.o[1] + w.ext[1]], 'CONTENT', edges);
    return Object.assign(p, {
      drawerId: did,
      runnerProfile: r.slide.id,
      drawerRunner: record,
      boxInternalWidthMm: n.boxW - 2 * k,
      drawerOuterWidthMm: n.boxW,
      motionKind: 'drawer-box',
      motionTravelMm: n.NL,
      manufacturingQualified: false,
      drillingStatus: 'KIT_DRILLING_MATERIAL_QUALIFICATION_REQUIRED',
    });
  });
}

/** Four TANDEM NL500 drawers with wooden boxes in the drawer cabinet (kre kflowCalculated, r1.html:73699). */
function tandemCalculated(s: KitchenScene, m: Rec): Rec {
  const W = m.width,
    H = m.height,
    D = m.depth,
    t = m.panelThickness ?? 16,
    b = m.backThickness ?? 3,
    ft = frontThickness(s, m),
    g = frontGap(s, m),
    gy = frontGapY(s, m),
    seam = frontSeam(m),
    n = m.fill?.drawers ?? 4,
    internal = W - 2 * t - 42,
    outer = internal + 2 * TANDEM_BOX.side,
    pitch = (H - 2 * gy - seam * (n - 1)) / n + seam,
    frontH = pitch - seam,
    l = tandemLayout(m, t, pitch),
    level = levelRunner(m),
    clear = { W: W - 2 * t, H: H - 2 * t, D: D - b };
  if (level && (n !== 4 || !Number.isFinite(seam) || seam < 0 || !stackFits(t, H, n, pitch, l)))
    return fail(clear, 'Ящики нового модуля требуют четыре положительных короба высотой ' + BOX_HEIGHT.min + '–' + BOX_HEIGHT.max + ' мм, стенки корпуса от ' + TANDEM_BOX.side + ' мм и верхний зазор не менее ' + TANDEM_BOX.minTopGap + ' мм.');
  if (!level && (n !== 4 || !Number.isFinite(seam) || seam < 0 || D - b < 503 || ft < 16 || !tandemFits(s, m, t, H, n, internal, pitch, l)))
    return fail(clear, 'Комплект TANDEM NL500 требует чистую глубину 503 мм, четыре положительных короба, стенки корпуса от 16 мм и верхний зазор не менее 7 мм.');
  // MOD-DEC-514 (FINDINGS 1863): a new module takes the runner of the level and the box of its kit.
  const runner = level ? levelStack(s, m, t, l, (W - 2 * g) * frontH * ft) : null;
  if (typeof runner === 'string') return fail(clear, runner);
  const d = clone(knCalculated(s, { ...m, moduleTypeId: 'KB_SHELVES', frontEnabled: false, fill: { ...m.fill, shelves: 0 }, shelfItems: [] }));
  if (d.status === 'FAIL') return d;
  const parts = d.parts.filter((p: Rec) => p.materialRole !== 'FACADE'),
    x = (W - outer) / 2,
    frontZ = -FRONT_CARCASS_GAP,
    fe = frontEdge(m);
  for (let i = 0; i < n; i++) {
    const did = m.id + ':drawer:' + (i + 1);
    const box = runner ? levelBox(s, m, i, runner, l.startY + i * pitch, l) : tandemBox(s, m, i, x, internal, outer, l.startY + i * pitch, l, frontZ);
    parts.push(...box);
    const fy = gy + i * pitch,
      fp = part(s, m, 'Фасад ящика ' + (i + 1), 'drawer-front:' + (i + 1), [W - 2 * g, frontH, ft], [g, W - g, fy, fy + frontH, frontZ - ft, frontZ], 'FACADE', { left: fe, right: fe, top: fe, bottom: fe });
    Object.assign(fp, { drawerId: did, motionTravelMm: box[0]!.motionTravelMm, runnerProfile: box[0]!.runnerProfile, boxInternalWidthMm: box[0]!.boxInternalWidthMm, drawerOuterWidthMm: box[0]!.drawerOuterWidthMm, drillingStatus: 'PROJECT_FACADE_JOINT_MATERIAL_QUALIFICATION_REQUIRED' });
    parts.push(fp);
    // The runner of the level is fixed by the holes of its kit (derived.ts), not by the factory places of TANDEM.
    if (runner) continue;
    for (const side of ['L', 'R']) {
      const p = parts.find((q: Rec) => q.partId === m.id + ':side:' + side);
      p.operations = [
        ...(p.operations || []),
        ...[37, 69, 261].map((z, j) => ({
          id: did + ':runner:' + side + ':' + j,
          kind: 'TANDEM cabinet fixing',
          diameter: 5,
          depth: null,
          fromFront: z,
          y: t + 37 + i * pitch,
          datum: 'finished cabinet front / lower runner clearance boundary Z0=' + String(t + i * pitch),
          production: false,
          qualification: 'Factory fixing positions; blind depth and tool travel unavailable',
        })),
      ];
    }
  }
  parts.forEach((p: Rec, i: number) => (p.exportPosition = i + 1));
  if (runner)
    return {
      ...d,
      parts,
      status: 'GEOMETRY_DRAFT',
      origin: 'MOD-DEC-514: the runner of the level by 466 and the box of its BAZIS kit',
      note: 'Четыре короба набора БАЗИС на направляющей ' + runner.slide.brand + ' ' + runner.n.sku + ' по уровню фурнитуры (MOD-DEC-514) и четыре фасада; фасад — передняя стенка короба. Отверстия направляющей и крючков — из набора.',
      localOpenFields: [],
      front_count: 4,
      front_size_mm: [W - 2 * g, frontH, ft],
      drawerDesign: levelDesign(runner, l),
      releaseOpenFields: LEVEL_OPEN_FIELDS.map((f) => ({ ...f })),
    };
  return {
    ...d,
    parts,
    status: 'GEOMETRY_DRAFT',
    origin: 'TANDEM560H NL500 planning plus explicit4sided project construction',
    note: 'Четыре реальных короба и фасада; направляющие 30 кг включают массу короба. Прочность дерева и пилоты проверяются отдельно. Задний крюк и замки устанавливаются шаблоном, автоматическая присадка этих отверстий недоступна.',
    localOpenFields: [],
    front_count: 4,
    front_size_mm: [W - 2 * g, frontH, ft],
    drawerDesign: tandemDesign(internal, outer, l),
    releaseOpenFields: [
      { field: 'Rear hook and lock pilots', status: 'TEMPLATE_REQUIRED', message: 'Точные оси заднего крюка и пилоты замков: шаблон BLUM T65.1000.02; автоматические отверстия недоступны.' },
      { field: 'Wood material and payload', status: 'MATERIAL_QUALIFICATION_REQUIRED', message: '30кг — рейтинг пары направляющих с массой короба; прочность выбранных панелей и проектных стыков отдельно проверяется.' },
    ],
  };
}

function kreCalculated(s: KitchenScene, m: Rec): Rec {
  if (m.moduleTypeId !== 'KB_DRAWERS' || m.drawerProfile !== TANDEM) return knCalculated(s, m);
  return tandemCalculated(s, m);
}

// ---------------------------------------------------------------- constructions (kcr)

export function checkParts(d: Rec): Rec {
  if (d.status === 'FAIL') return d;
  if ((d.parts || []).some((p: Rec) => !p.box || p.box.length !== 6 || !p.box.every(Number.isFinite) || !p.finished_mm?.every((v: number) => Number.isFinite(v) && v > 0) || !p.blank_mm?.every((v: number) => Number.isFinite(v) && v > 0)))
    return kcrFail('Проверьте размеры деталей: толщина, заготовка и карта кромок должны быть положительными.', d.clear);
  d.parts.forEach((p: Rec, i: number) => (p.exportPosition = i + 1));
  d.status = 'GEOMETRY_DRAFT';
  d.localOpenFields = [];
  d.nominalUnknownFields = [];
  d.islandUnknownFields = [];
  d.polygonPending = [];
  d.installationPlanningQualified = true;
  d.manufacturingQualified = false;
  return d;
}

export function kcrFail(note: string, clear?: Rec | null): Rec {
  return { status: 'FAIL', parts: [], clear: clear || null, localOpenFields: [], note };
}

/** The carcass of a construction without fronts, with eight confirmats of the caps (kcrRect, r1.html:74202). */
function kcrRect(s: KitchenScene, m: Rec, shelves: Rec[] = []): Rec {
  const d = clone(knCalculated(s, { ...m, moduleTypeId: 'KB_SHELVES', fill: { shelves: shelves.length }, shelfItems: shelves, frontEnabled: false }));
  if (d.status === 'FAIL') return d;
  d.parts = d.parts.filter((p: Rec) => p.materialRole !== 'FACADE');
  d.constructionJoints = [
    {
      id: m.id + ':carcass-cap-joints',
      kind: 'caps-to-two-sides',
      count: 8,
      profileId: 'MAKMART_S16',
      fasteners: [{ article: 'MB.1501.7X50.CH4.BZ', quantity: 8 }],
      qualification: 'Project two7x50 connectors per cap-to-side; nominal axes, material/pilot and assembly access qualified separately',
    },
  ];
  return d;
}

/** One leaf of a front with its schematic motion (kcrLeaf, r1.html:74227). */
export function leaf(s: KitchenScene, m: Rec, id: string, x0: number, x1: number, y0: number, y1: number, role = 'ordinary', kind = 'swing-door', thickness: number | null = null): Rec {
  const ft = thickness ?? frontThickness(s, m),
    e = frontEdge(m),
    z = -FRONT_CARCASS_GAP,
    p = part(s, m, 'Фасад', id, [x1 - x0, y1 - y0, ft], [x0, x1, y0, y1, z - ft, z], 'FACADE', { left: e, right: e, top: e, bottom: e }),
    side = m.hingeSide || 'left';
  return Object.assign(p, {
    facade: true,
    doorGroupId: p.partId,
    motionKind: kind,
    hingeRole: role,
    hingeSide: side,
    motionPivotMm: [side === 'right' ? x1 : x0, y0, z],
    motionAngleDeg: kind === 'lift-door' ? -107 : role === 'glass' ? 94 : 110,
    schematicMotion: true,
    hingeWidthMm: x1 - x0,
    hingeHeightMm: y1 - y0,
    hingeThicknessMm: ft,
    manufacturingQualified: false,
  });
}

/** Leaves up to 600 mm across the width (kcrAddLeaves, r1.html:74253). */
function addLeaves(s: KitchenScene, m: Rec, d: Rec, y0: number, y1: number, role = 'ordinary', kind = 'swing-door', id = 'front'): Rec {
  if (m.frontEnabled === false) {
    d.front_count = 0;
    d.front_size_mm = null;
    return d;
  }
  const g = frontGap(s, m),
    seam = frontSeam(m),
    available = m.width - 2 * g,
    n = kind === 'lift-door' ? 1 : Math.max(1, Math.ceil((available + seam) / (600 + seam))),
    width = (available - (n - 1) * seam) / n;
  if (!finite(g, seam, width, y0, y1) || g < 0 || seam < 0 || width <= 0 || y1 <= y0) return kcrFail('Проверьте размеры фасада и шов.', d.clear);
  for (let i = 0; i < n; i++) {
    const x = g + i * (width + seam),
      p = leaf(s, m, id + (n > 1 ? ':' + (i + 1) : ''), x, x + width, y0, y1, role, kind);
    if (n > 1) {
      p.hingeSide = i % 2 ? 'right' : 'left';
      p.motionPivotMm = [p.hingeSide === 'right' ? x + width : x, y0, -2];
    }
    d.parts.push(p);
  }
  d.front_count = n;
  d.front_size_mm = [width, y1 - y0, frontThickness(s, m)];
  return d;
}

/** TANDEM drawers of a construction (kcrDrawerSet, r1.html:74278). */
function drawerSet(s: KitchenScene, m: Rec, zoneHeight: number, n: number, frontStart = 0, frontHOverride: number | null = null): Rec {
  const g = frontGap(s, m),
    gy = frontGapY(s, m),
    seam = frontSeam(m),
    t = m.panelThickness ?? 16,
    H = zoneHeight,
    internal = m.width - 2 * t - 42,
    outer = internal + 2 * TANDEM_BOX.side,
    frontH = frontHOverride ?? (H - 2 * gy - seam * (n - 1)) / n,
    pitch = frontH + seam,
    l = tandemLayout(m, t, pitch),
    x = (m.width - outer) / 2,
    z = -FRONT_CARCASS_GAP;
  const level = levelRunner(m);
  if (!finite(g, gy, seam, internal, frontH, H) || g < 0 || gy < 0 || seam < 0 || !(level ? stackFits(t, H, n, pitch, l) : tandemFits(s, m, t, H, n, internal, pitch, l)))
    return kcrFail(
      level
        ? 'Ящики нового модуля требуют положительные короба высотой ' + BOX_HEIGHT.min + '–' + BOX_HEIGHT.max + ' мм и верхний зазор ' + TANDEM_BOX.minTopGap + ' мм.'
        : 'Ящики TANDEM NL500 требуют чистую глубину 503 мм, положительные короба, дно 12–15 мм от низа и верхний зазор 7 мм.',
    );
  // MOD-DEC-514 (FINDINGS 1863): a new module takes the runner of the level and the box of its kit; the front of a
  // construction without fronts is not carried.
  const runner = level ? levelStack(s, m, t, l, m.frontEnabled === false ? 0 : (m.width - 2 * g) * frontH * frontThickness(s, m)) : null;
  if (typeof runner === 'string') return kcrFail(runner);
  const parts: Rec[] = [];
  for (let i = 0; i < n; i++) {
    const did = m.id + ':drawer:' + (i + 1),
      box = runner ? levelBox(s, m, i, runner, l.startY + i * pitch, l) : tandemBox(s, m, i, x, internal, outer, l.startY + i * pitch, l, z);
    parts.push(...box);
    if (m.frontEnabled !== false) {
      const fy = frontStart + gy + i * pitch,
        p = leaf(s, m, 'drawer-front:' + (i + 1), g, m.width - g, fy, fy + frontH, 'ordinary', 'drawer-front');
      Object.assign(p, { drawerId: did, hingeHardwareSuppressed: true, motionTravelMm: box[0]!.motionTravelMm, runnerProfile: box[0]!.runnerProfile });
      parts.push(p);
    }
  }
  return {
    status: 'GEOMETRY_DRAFT',
    parts,
    drawerDesign: runner ? levelDesign(runner, l) : tandemDesign(internal, outer, l),
    ...(runner ? { releaseOpenFields: LEVEL_OPEN_FIELDS.map((f) => ({ ...f })) } : {}),
    drawerCount: n,
    frontH,
    pitch,
  };
}

/** One drawer over a door, or four drawers under doors of a tall cabinet (kcrCombined, r1.html:74350). */
function combined(s: KitchenScene, m: Rec): Rec {
  const t = m.panelThickness ?? 16,
    g = frontGap(s, m),
    gy = frontGapY(s, m),
    tall = m.moduleTypeId === 'KT_COMBINED',
    seam = frontSeam(m),
    drawerTop = tall ? (m.drawerTop ?? 900) - m.floor : m.height - (m.height - 2 * gy - 3 * seam) / 4 - 2 * gy,
    frontH = tall ? null : (m.height - 2 * gy - 3 * seam) / 4,
    n = tall ? (m.combinedDrawerCount ?? 4) : 1;
  if (n !== (tall ? 4 : 1) || !Number.isFinite(drawerTop) || drawerTop <= 2 * t + 150 || drawerTop >= m.height - t) return kcrFail('Разделение комбинированного шкафа должно оставлять действительную зону ящиков и двери.');
  const shelves = shelfItems(m),
    d = kcrRect(s, m, []);
  if (d.status === 'FAIL') return d;
  const drawers = drawerSet(s, m, tall ? drawerTop : m.height - drawerTop, n, 0, frontH);
  if (drawers.status === 'FAIL') return drawers;
  if (!tall) {
    const dy = drawerTop + gy,
      offset = drawerTop;
    for (const p of drawers.parts) {
      p.box[2] += offset;
      p.box[3] += offset;
      if (p.materialRole === 'FACADE') {
        p.box[2] = dy;
        p.box[3] = dy + frontH!;
      }
      for (const gr of p.grooves || []) {
        gr.localBox[2] += offset;
        gr.localBox[3] += offset;
        const b = worldBox(s, m, gr.localBox);
        gr.worldBox = [
          [b[0], b[4], b[2]],
          [b[1], b[5], b[3]],
        ];
      }
    }
  }
  const separator = tall ? drawerTop - t : drawerTop,
    separate = part(s, m, 'Разделитель зон', 'zone-divider', [m.width - 2 * t, d.clear.D, t], [t, m.width - t, separator, separator + t, 0, d.clear.D]);
  d.parts.push(separate, ...drawers.parts);
  for (const sh of shelves) {
    const y = t + sh.levelMm,
      low = tall ? drawerTop + t : 2 * t,
      high = tall ? m.height - t : separator;
    if (!Number.isFinite(y) || y < low || y + t > high) return kcrFail('Полка пересекает разделитель или зону ящиков.', d.clear);
    const id = sh.id.startsWith(m.id + ':') ? sh.id.slice(m.id.length + 1) : 'shelf:' + sh.id;
    d.parts.push(
      sh.fixed === true
        ? part(s, m, tall ? 'Полка верхней зоны' : 'Полка нижней зоны', id, [m.width - 2 * t, d.clear.D, t], [t, m.width - t, y, y + t, 0, d.clear.D], 'CORPUS', { left: 0, right: 0, top: 0, bottom: bodyEdge(m) })
        : removableShelf(s, m, tall ? 'Полка верхней зоны' : 'Полка нижней зоны', id, t, { W: m.width - 2 * t, D: d.clear.D }, y, t, { base: t / 2, low, high }),
    );
  }
  // The door continues the chain of the drawer fronts by one seam (KF-06, FINDINGS 323): the prototype put it at
  // drawerTop + 3 over the drawers and at separator − 1 under the drawer, the literals of an offset of 2 mm.
  addLeaves(s, m, d, tall ? drawerTop - gy + seam : gy, tall ? m.height - gy : drawerTop + gy - seam, 'ordinary', 'swing-door', tall ? 'upper-door' : 'lower-door');
  d.drawerDesign = drawers.drawerDesign;
  if (drawers.releaseOpenFields) d.releaseOpenFields = [...(d.releaseOpenFields || []), ...drawers.releaseOpenFields];
  d.drawerCount = n;
  d.front_count += m.frontEnabled === false ? 0 : n;
  d.front_size_mm = d.front_size_mm || [m.width - 2 * g, drawers.frontH, frontThickness(s, m)];
  d.constructionJoints = [
    ...(d.constructionJoints || []),
    {
      id: m.id + ':divider-joints',
      kind: 'divider-to-side',
      count: 4,
      profileId: 'MAKMART_S16',
      fasteners: [{ article: 'MB.1501.7X50.CH4.BZ', quantity: 4 }],
      qualification: 'Project four connectors, two at each side; machine axes require material/tool qualification',
    },
  ];
  d.note = tall ? 'Четыре действительных нижних ящика, разделитель, верхние полки и двери.' : 'Один действительный верхний ящик, разделитель, нижняя дверь и полка.';
  return checkParts(d);
}

/** The display cabinet: glass leaves 6 mm or wooden frames with glass (kcrGlass, r1.html:74417). */
function glass(s: KitchenScene, m: Rec): Rec {
  const d = kcrRect(s, m, shelfItems(m));
  if (d.status === 'FAIL') return d;
  const gy = frontGapY(s, m),
    y0 = gy,
    y1 = m.height - gy,
    variant = m.glassVariant || 'standalone';
  if (!['standalone', 'wood-frame'].includes(variant)) return kcrFail('Выберите стекло 6 мм либо деревянную рамку 18 мм со стеклом 6 мм.', d.clear);
  if (m.frontEnabled === false) {
    d.front_count = 0;
    d.front_size_mm = null;
    return checkParts(d);
  }
  const gt = m.glassThicknessMm ?? 6;
  if (gt !== 6) return kcrFail('Точный стеклянный вариант выбран для стекла 6 мм; другую толщину проверяют отдельно.', d.clear);
  const ft = variant === 'standalone' ? 6 : 18;
  if ((m.frontThickness ?? ft) !== ft) return kcrFail('Толщина фасада не соответствует выбранному варианту витрины.', d.clear);
  addLeaves(s, { ...m, frontThickness: ft }, d, y0, y1, variant === 'standalone' ? 'glass' : 'ordinary', variant === 'standalone' ? 'glass-door' : 'swing-door');
  if (d.status === 'FAIL') return d;
  for (const lf of d.parts.filter((p: Rec) => p.materialRole === 'FACADE')) {
    const group = lf.doorGroupId,
      b = lf.box,
      [x0, x1] = b,
      w = x1 - x0,
      h = y1 - y0;
    if (variant === 'standalone') {
      lf.materialRole = 'GLASS';
      lf.materialCode = 'GLASS_CLEAR_6';
      lf.edge_mm = { left: 0, right: 0, top: 0, bottom: 0 };
      lf.blank_mm = [w, h, 6];
      lf.glassProcessing = 'Edges finished and through holes by qualified glass fabricator';
      continue;
    }
    const stile = m.frameStileMm ?? 80;
    if (!Number.isFinite(stile) || stile < 50 || w <= 2 * stile + 40 || h <= 2 * stile + 40) return kcrFail('Ширина рамки должна оставлять положительный проём и место чашки петли.', d.clear);
    const configs: [string, string, number[], number[]][] = [
      ['Левая стойка', 'stile:L', [stile, h, 18], [x0, x0 + stile, y0, y1, b[4], b[5]]],
      ['Правая стойка', 'stile:R', [stile, h, 18], [x1 - stile, x1, y0, y1, b[4], b[5]]],
      ['Нижняя перемычка', 'rail:B', [w - 2 * stile, stile, 18], [x0 + stile, x1 - stile, y0, y0 + stile, b[4], b[5]]],
      ['Верхняя перемычка', 'rail:T', [w - 2 * stile, stile, 18], [x0 + stile, x1 - stile, y1 - stile, y1, b[4], b[5]]],
    ];
    const repl: Rec[] = [];
    for (const [name, suffix, dim, box] of configs) {
      const q = part(s, m, name, lf.partId.slice(m.id.length + 1) + ':' + suffix, dim, box, 'FACADE', { left: 0, right: 0, top: 0, bottom: 0 });
      Object.assign(q, {
        ...Object.fromEntries(['facade', 'doorGroupId', 'motionKind', 'hingeRole', 'hingeSide', 'motionPivotMm', 'motionAngleDeg', 'schematicMotion'].map((k) => [k, lf[k]])),
        hingeWidthMm: w,
        hingeHeightMm: h,
        hingeThicknessMm: 18,
        frameMember: true,
      });
      repl.push(q);
    }
    const lip = 10,
      gl = part(s, m, 'Стекло в деревянной рамке', lf.partId.slice(m.id.length + 1) + ':glass', [w - 2 * stile + 2 * lip, h - 2 * stile + 2 * lip, 6], [x0 + stile - lip, x1 - stile + lip, y0 + stile - lip, y1 - stile + lip, b[5] - 6, b[5]], 'GLASS');
    Object.assign(gl, {
      materialCode: 'GLASS_CLEAR_6',
      facade: true,
      doorGroupId: group,
      motionKind: 'swing-door',
      hingeRole: 'ordinary',
      hingeSide: lf.hingeSide,
      motionPivotMm: lf.motionPivotMm,
      motionAngleDeg: 110,
      schematicMotion: true,
      hingeWidthMm: w,
      hingeHeightMm: h,
      hingeThicknessMm: 18,
      glassRetention: 'Project rear rebate10mm overlap, 6mm recess and continuous neutral-cure glazing bed; glass fabricator/adhesion qualification required',
    });
    repl.push(gl);
    d.parts = d.parts.filter((p: Rec) => p !== lf).concat(repl);
    d.constructionJoints = [
      ...(d.constructionJoints || []),
      {
        id: group + ':frame-joints',
        kind: 'frame-butt-joints',
        count: 8,
        profileId: 'PROJECT-FRAME-DOWEL8X35',
        fasteners: [{ article: '9223927', quantity: 8 }],
        qualification: 'Project two glued8x35 dowels per corner,17.5mm nominal engagement each side; bore, material and frame strength require qualification',
      },
      { id: group + ':glazing-bed', kind: 'neutral-glazing-bed', count: 1, unit: 'job', profileId: 'PROJECT-GLAZING-BED', qualification: 'Continuous neutral-cure compatible glazing compound; no invented retaining clip article' },
    ];
  }
  d.note = variant === 'standalone' ? 'Стеклянные створки 6 мм; размеры, масса и комплект стеклянных петель согласованы.' : 'Четыре действительных элемента рамки и отдельное стекло 6 мм движутся одной створкой. Посадки стекла, соединения и материал проверяются перед изготовлением.';
  return checkParts(d);
}

function offsetPolygon(poly: number[][], distance: number): number[][] {
  if (distance === 0) return poly.map((v) => [...v]);
  const signed = poly.reduce((s, a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      return s + a[0]! * b[1]! - b[0]! * a[1]!;
    }, 0),
    sign = signed >= 0 ? 1 : -1,
    lines = poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length]!,
        dx = b[0]! - a[0]!,
        dy = b[1]! - a[1]!,
        len = Math.hypot(dx, dy);
      return { p: [a[0]! - (sign * dy * distance) / len, a[1]! + (sign * dx * distance) / len], v: [dx, dy] };
    });
  return lines.map((l, i) => {
    const previous = lines[(i + lines.length - 1) % lines.length]!,
      det = previous.v[0]! * l.v[1]! - previous.v[1]! * l.v[0]!,
      delta = [l.p[0]! - previous.p[0]!, l.p[1]! - previous.p[1]!];
    if (Math.abs(det) < 1e-10) return l.p;
    const scale = (delta[0]! * l.v[1]! - delta[1]! * l.v[0]!) / det;
    return [previous.p[0]! + scale * previous.v[0]!, previous.p[1]! + scale * previous.v[1]!];
  });
}

/** The blank and edge map of a polygon part (kcrPolygonFinish, r1.html:74545). */
function polygonFinish(m: Rec, p: Rec): Rec | null {
  const poly = p.finished_polygon_mm,
    e = bodyEdge(m);
  if (!Number.isFinite(e) || e < 0) return null;
  const t = p.finished_mm[2];
  const blank = offsetPolygon(poly, e),
    bb = bounds(blank);
  if (
    blank.some((a, i) => {
      const b = blank[(i + 1) % blank.length]!,
        oa = poly[i],
        ob = poly[(i + 1) % poly.length];
      return (b[0]! - a[0]!) * (ob[0] - oa[0]) + (b[1]! - a[1]!) * (ob[1] - oa[1]) <= 0;
    })
  )
    return null;
  p.blank_mm = [bb[1]! - bb[0]!, bb[3]! - bb[2]!, t];
  p.blank_polygon_mm = blank;
  p.blank_area_mm2 = area(blank);
  p.blankStatus = e === 0 ? 'FINISHED_CONTOUR_UNBANDED' : 'SEGMENT_OFFSET_FOR_EDGE_BAND';
  p.edgeStatus = e === 0 ? 'EXPLICIT_UNBANDED' : 'PROJECT_EDGE_MAP';
  p.edge_mm = { left: 0, right: 0, top: 0, bottom: 0 };
  p.edge_segments_mm = poly.map((a: number[], i: number) => {
    const b = poly[(i + 1) % poly.length];
    return { segment: i, from: [...a], to: [...b], lengthMm: Math.hypot(b[0] - a[0]!, b[1] - a[1]!), thicknessMm: e };
  });
  if (e > 0) {
    p.blankContourQualification = 'Blank contour offset inward by selected band thickness at each segment; finished outer contour retained. CAD tool compensation and grain direction require fabricator qualification';
    p.edgeCompensationMm = e;
  }
  p.rectangularEnvelopeOnly = true;
  p.rectangularExportEligible = false;
  p.positionStatus = 'PLACED';
  p.note = 'Точный готовый контур и его полная заготовка сохранены. Прямоугольные размеры описывают огибающую; контур передаётся отдельно.';
  return p;
}

/** The unit vector of the diagonal of a diagonal corner from its end at wall A (pa, D) to its end at wall B (D, pb). */
function diagonalAxis(pa: number, pb: number, D: number): [number, number] {
  const dx = D - pa,
    dy = pb - D,
    l = Math.hypot(dx, dy);
  return [dx / l, dy / l];
}

const planFootprint = (s: KitchenScene, m: Rec, plan: number[][], y: number, D: number) =>
  plan.map(([x, z]) => {
    const b = worldBox(s, m, [x!, x!, y, y, D - z!, D - z!]);
    return [b[0], b[4]];
  });

/** The accessible L and diagonal corners with polygon parts and their fronts (kcrCorner, r1.html:74590). */
function corner(s: KitchenScene, m: Rec): Rec {
  const diag = isDiagonal(m),
    t = m.panelThickness ?? 16,
    H = m.height,
    D = m.depth,
    pa = m.width,
    pb = m.cornerReturn,
    g = diag ? (m.frontGap ?? 3.5) : frontGapY(s, m),
    // A new accessible L corner takes the fronts of the kitchen within its hinges' 15–23 mm (FINDINGS 1281), a new
    // diagonal one within the 15–28 of its angled hinge Hettich Sensys W45 (FINDINGS 1611).
    own = m.frontThicknessFromKitchen,
    [lo, hi] = (diag ? K.diagonalHingeFrontThickness : K.bifoldFrontThickness).value,
    ft = frontThickness(s, m, own ? defaults.front_thickness_mm!.value : 19);
  if (diag && !own && (t !== 19 || ft !== 19 || g < 3.5)) return kcrFail('Диагональный комплект выбран для корпуса 19 мм, фасада 19 мм и зазора не менее 3,5 мм.');
  if (diag && own && (ft < lo || ft > hi || g < 3.5)) return kcrFail(`Диагональный угол выбран для фасадов ${lo}–${hi} мм и зазора не менее 3,5 мм (угловая петля Hettich Sensys W45).`);
  if (!diag && own && (t !== 16 || ft < lo || ft > hi)) return kcrFail(`Складной доступный угол выбран для корпуса 16 мм и фасадов ${lo}–${hi} мм (петли Blum 79T8500 и 71T7550).`);
  if (!diag && !own && (t !== 16 || ft !== 19)) return kcrFail('Складной доступный угол выбран для корпуса 16 мм и деревянных фасадов 19 мм.');
  const d = clone(accessLCalculated(s, { ...m, moduleTypeId: m.kind === 'upper' ? 'KW_CORNER_ACCESS_L' : 'KB_CORNER_ACCESS_L', corner: 'access-l' }));
  if (d.status !== 'GEOMETRY_DRAFT') return d;
  if (diag) {
    const full = [[0, 0], [pa, 0], [pa, D], [D, pb], [0, pb]],
      inner = [[t, t], [pa - t, t], [pa - t, D - t], [D - t, pb - t], [t, pb - t]];
    for (const p of d.parts.filter((p: Rec) => p.finished_polygon_mm)) {
      const poly = mirror(m, p.partId.endsWith('polygon-bottom') || p.partId.endsWith('polygon-top') ? full : inner),
        b = bounds(poly);
      p.finished_polygon_mm = poly;
      p.finished_area_mm2 = area(poly);
      p.finished_mm = [b[1]! - b[0]!, b[3]! - b[2]!, t];
      p.box = planBox(m, b, p.box[2], p.box[3]);
      p.diagonalPolygon = true;
      p.name = p.partId.endsWith('polygon-bottom') ? 'Дно диагонального корпуса' : p.partId.endsWith('polygon-top') ? 'Верх диагонального корпуса' : 'Диагональная полка';
      p.kind = p.name;
      delete p.notchLocalBox;
    }
    // MOD-DEC-440 (KF-02, FINDINGS 502): the front end of each end panel is sawn along the diagonal of the carcass,
    // parallel to the door, as Nolte makes it. The inner face runs on to the diagonal, the bevel closes the corner
    // between the panel and the shortened door; the bevel is a visible front end and carries the body edge (180).
    const [ux, uy] = diagonalAxis(pa, pb, D),
      e = bodyEdge(m);
    // The inner face is longer than the outer by the setback; the panel of wall A has its front at the low end of its
    // box (edge «left»), the panel of wall B at the end towards the diagonal (mirrored for a right corner).
    for (const [id, setback, angle, front] of [
      ['end-A', (t * uy) / -ux, Math.atan2(-ux, uy), 'left'],
      ['end-B', (t * -ux) / uy, Math.atan2(uy, -ux), m.cornerSide === 'right' ? 'left' : 'right'],
    ] as [string, number, number, string][]) {
      const p = d.parts.find((x: Rec) => x.partId === m.id + ':' + id)!,
        plan = mirror(m, id === 'end-A' ? [[pa - t, t], [pa, t], [pa, D], [pa - t, D + setback]] : [[t, pb - t], [D + setback, pb - t], [D, pb], [t, pb]]),
        b = bounds(plan),
        L = p.finished_mm[0] + setback,
        H2 = p.finished_mm[1];
      Object.assign(p, {
        finished_mm: [L, H2, t],
        blank_mm: [L - e / Math.sin(angle), H2, t],
        edge_mm: { left: 0, right: 0, top: 0, bottom: 0, [front]: e },
        box: planBox(m, b, p.box[2], p.box[3]),
        localOutlineMm: plan,
        worldFootprintMm: planFootprint(s, m, plan, p.box[2], D),
        edgeStatus: e === 0 ? 'EXPLICIT_UNBANDED' : 'PROJECT_EDGE_MAP',
        bevel: { edge: front, angleDeg: (angle * 180) / Math.PI, setbackMm: setback, edgeAlongLengthMm: e / Math.sin(angle), decision: 'MOD-DEC-440' },
      });
    }
  }
  for (const p of d.parts.filter((p: Rec) => p.finished_polygon_mm)) {
    if (!polygonFinish(m, p)) return kcrFail('Некорректная карта кромок полигональной детали.', d.clear);
    p.worldFootprintMm = planFootprint(s, m, p.finished_polygon_mm, 0, D);
  }
  const fe = frontEdge(m),
    frontEdges = () => ({ left: fe, right: fe, top: fe, bottom: fe });
  if (m.frontEnabled !== false) {
    if (diag) {
      const A = [pa, D],
        B = [D, pb],
        dx = B[0]! - A[0]!,
        dy = B[1]! - A[1]!,
        length = Math.hypot(dx, dy),
        ux = dx / length,
        uy = dy / length,
        nx = uy,
        ny = -ux,
        fh = H - 2 * g,
        seam = frontSeam(m),
        // KF-02, FINDINGS 502, MOD-DEC-440: the outer corner of the leaf stays inside the side planes of the corner
        // carcass (x = width, y = return), where the fronts of the neighbours begin; the bevel of the end panel closes
        // the end. The prototype left 3.5 mm along the diagonal, and the corner of a 19 mm leaf went 10.9 mm into the
        // neighbour fronts.
        reach = FRONT_CARCASS_GAP + ft,
        gA = Math.max(g, (reach * nx) / -ux),
        gB = Math.max(g, (reach * ny) / uy),
        n = Math.max(1, Math.ceil((length - gA - gB + seam) / (600 + seam))),
        fw = (length - gA - gB - (n - 1) * seam) / n;
      if (fw <= 0 || !Number.isFinite(seam) || seam < 0 || n > 2) return kcrFail('Диагональный фасад требует одну или две положительные створки до 600 мм.', d.clear);
      for (let i = 0; i < n; i++) {
        const a0 = gA + i * (fw + seam),
          a1 = a0 + fw,
          start = [A[0]! + ux * a0 + nx * 2, A[1]! + uy * a0 + ny * 2],
          end = [A[0]! + ux * a1 + nx * 2, A[1]! + uy * a1 + ny * 2],
          plan = mirror(m, [start, end, [end[0]! + nx * ft, end[1]! + ny * ft], [start[0]! + nx * ft, start[1]! + ny * ft]]),
          b = bounds(plan),
          face = part(s, m, 'Диагональный фасад', 'diagonal-front' + (n > 1 ? ':' + (i + 1) : ''), [fw, fh, ft], planBox(m, b, g, H - g), 'FACADE', frontEdges()),
          side = n > 1 ? (i ? 'right' : 'left') : m.hingeSide || 'left',
          pivot = plan[side === 'right' ? 1 : 0]!;
        Object.assign(face, {
          facade: true,
          polygonFront: true,
          localPlanMm: plan,
          worldFootprintMm: planFootprint(s, m, plan, g, D),
          doorGroupId: face.partId,
          motionKind: 'swing-door',
          hingeRole: 'diagonal45',
          hingeSide: side,
          motionPivotMm: [pivot[0], g, D - pivot[1]!],
          motionAngleDeg: 110,
          schematicMotion: true,
          hingeWidthMm: fw,
          hingeHeightMm: fh,
          hingeThicknessMm: ft,
        });
        d.parts.push(face);
      }
      d.front_size_mm = [fw, fh, ft];
      d.front_count = n;
    } else {
      const spanA = pa - D,
        spanB = pb - D,
        fwA = spanA - 2 * g,
        fwB = spanB - 2 * g,
        fh = H - 2 * g;
      if (Math.min(fwA, fwB) <= 60 || Math.max(fwA, fwB) > 600) return kcrFail('Оба плеча складной двери должны оставлять створки 60–600 мм.', d.clear);
      const pair = m.id + ':bifold',
        primary = pair + ':primary',
        secondary = pair + ':secondary',
        aPlan = mirror(m, [[D + g, D + 2], [pa - g, D + 2], [pa - g, D + 2 + ft], [D + g, D + 2 + ft]]),
        bPlan = mirror(m, [[D + 2, D + g + ft], [D + 2, pb - g], [D + 2 + ft, pb - g], [D + 2 + ft, D + g + ft]]),
        junction = mirror(m, [[D + g, D + 2]])[0]!,
        outer = mirror(m, [[pa - g, D + 2]])[0]!;
      const leaves: [string, string, number[][], number, string, string, string, number[]][] = [
        ['bifold-front:A', 'Створка Г-угла A', aPlan, fwA, primary, 'cornerCabinet155', 'bifold-primary', outer],
        ['bifold-front:B', 'Створка Г-угла B', bPlan, fwB - ft, secondary, 'cornerBifold60', 'bifold-secondary', junction],
      ];
      for (const [id, name, plan, w, group, role, kind, pivot] of leaves) {
        const b = bounds(plan),
          p = part(s, m, name, id, [w, fh, ft], planBox(m, b, g, H - g), 'FACADE', frontEdges());
        Object.assign(p, {
          facade: true,
          polygonFront: true,
          localPlanMm: plan,
          worldFootprintMm: planFootprint(s, m, plan, g, D),
          doorGroupId: group,
          pairedGroupId: pair,
          motionKind: kind,
          hingeRole: role,
          hingeSide: m.cornerSide === 'right' ? 'left' : 'right',
          motionPivotMm: [pivot[0], g, D - pivot[1]!],
          motionAngleDeg: kind === 'bifold-primary' ? 90 : -90,
          schematicMotion: true,
          hingeWidthMm: w,
          hingeHeightMm: fh,
          hingeThicknessMm: m.frontThicknessFromKitchen ? ft : 19,
          motionQualification: 'Условная связанная анимация двух створок; реальный ход задаётся парой петель и монтажным шаблоном',
        });
        if (kind === 'bifold-secondary') p.motionParentGroupId = primary;
        d.parts.push(p);
      }
      d.front_size_mm = [fwA, fh, ft];
      d.front_count = 2;
    }
  } else {
    d.front_size_mm = null;
    d.front_count = 0;
  }
  d.suspensionPairs = m.kind === 'upper' ? 2 : 0;
  d.suspensionLocalArmDepthMm = D;
  d.suspensionQualification =
    'Source hanger localarm geometry; custom corner racking, mounting substrate and actual wall loads separately qualified. Automatic corner hanger drilling unavailable; use original template and a qualified mounting node.';
  d.constructionJoints = [
    diag
      ? {
          id: m.id + ':polygon-cap-joints',
          kind: 'caps-to-four-verticals',
          count: 16,
          profileId: 'PROJECT-DIREKTA19556-CAP19',
          fasteners: [{ article: '19556', manufacturer: 'Hettich', quantity: 16 }],
          nominalConnection: {
            manufacturer: 'Hettich',
            article: '19556',
            screwDimensionMm: [6.3, 50],
            throughPanelMm: 19,
            nominalEngagementMm: 31,
            throughHoleDiameterMm: 7,
            edgePilotDiameterMm: 5,
            projectPilotDepthMm: 35,
            edgeAxisFromFaceMm: 9.5,
            source: 'Hettich HIN2017 PDFpage103 printed202;7/5 drill diameters;19mm application and35mm pilot depth are projectchoices',
            automaticMachining: false,
          },
          qualification:
            'Project two Hettich19556 connectors at each actual19mm cap/vertical contact. Bare carcass assembly before feet/worktop/wall installation;31mm nominal engagement. Source screw/drill dimensions separate from project axes/pilot35mm; material, tool and physicalstrength qualified separately',
        }
      : {
          id: m.id + ':polygon-cap-joints',
          kind: 'caps-to-four-verticals',
          count: 16,
          profileId: 'MAKMART_S16',
          fasteners: [{ article: 'MB.1501.7X50.CH4.BZ', quantity: 16 }],
          qualification: 'Project two connectors at each vertical/cap intersection; production axes and strength qualified separately',
        },
  ];
  d.note = diag
    ? 'Диагональный корпус, полки и реальный наклонный фасад с петлёй 45°. Идеальные 90°, фактический угол требует замера.'
    : 'Доступный Г-корпус с полным полигональным составом и двумя связанными створками. Идеальные 90°, фактический угол требует замера.';
  return checkParts(d);
}

/** The two-level FISSO dish dryer (kcrDryer, r1.html:74779). */
function dryer(s: KitchenScene, m: Rec): Rec {
  const d = kcrRect(s, m, []);
  if (d.status === 'FAIL') return d;
  const t = m.panelThickness ?? 16,
    // A new dryer cabinet is open below (MOD-DEC-566 п. 7, FINDINGS 1276): its sides, top and back stand as high as the
    // row, the dryer's lower tray is its bottom; the clear height runs from the sides' lower edge.
    open = m.dryerBottom === 'OPEN',
    base = open ? 0 : t;
  if (open) {
    d.parts = d.parts.filter((p: Rec) => p.partId !== m.id + ':bottom');
    const back = d.parts.find((p: Rec) => p.partId === m.id + ':back');
    if (back) {
      back.box[2] = 0;
      back.finished_mm = [back.finished_mm[0], back.box[3], back.finished_mm[2]];
      back.blank_mm = [back.blank_mm[0], back.box[3], back.blank_mm[2]];
    }
    d.clear = { ...d.clear, H: d.clear.H + t };
    d.constructionJoints = d.constructionJoints.map((j: Rec) => ({ ...j, count: 4, fasteners: j.fasteners.map((f: Rec) => ({ ...f, quantity: 4 })), qualification: j.qualification + '; open bottom: the top only' }));
  }
  const W = d.clear.W,
    H = d.clear.H,
    D = d.clear.D,
    levels = m.dryerLevels ?? [96, 466],
    plate = m.plateHeightMm ?? 320,
    cup = m.cupHeightMm ?? 160;
  if (H < 700) return kcrFail('Для двухуровневой сушки FISSO нужен чистый внутренний проём высотой не менее 700 мм.', d.clear);
  if (m.width !== 600 || t < 16 || t > 19 || W < 562 || W > 568 || D < 300 || !Array.isArray(levels) || levels.length !== 2 || !finite(...levels, plate, cup) || Math.min(plate, cup) <= 0 || levels[0] < 0 || levels[1] < levels[0] + Math.max(85, plate) + 16 || levels[1] + Math.max(78, cup) > H)
    return kcrFail('Сушка FISSO600: чистая ширина 562–568 мм, глубина от 300 мм; два уровня и посуда должны помещаться без пересечения.', d.clear);
  addLeaves(s, m, d, frontGapY(s, m), m.height - frontGapY(s, m));
  d.mechanismEnvelopes = levels.flatMap((y: number, i: number) => [
    {
      id: m.id + ':dryer:rack:' + (i + 1),
      profileId: 'FISSO-DUSLAR10030001-C600',
      model: i ? 'cup-rack' : 'plate-rack',
      box: [t, m.width - t, base + y, base + y + (i ? 78 : 85), 16, 281],
      dimensionsMm: [W, 265, i ? 78 : 85],
      dimensionsOrder: 'width-depth-height',
      schematic: true,
      materialPart: false,
      content: true,
    },
    {
      id: m.id + ':dryer:tray:' + (i + 1),
      profileId: 'FISSO-DUSLAR10030001-C600',
      model: 'water-tray',
      box: [t, m.width - t, base + y, base + y + 8, 16, 281],
      dimensionsMm: [W, 265, 8],
      dimensionsOrder: 'width-depth-height',
      schematic: true,
      materialPart: false,
      content: true,
      geometryQualification: 'Project tray envelope; supplier tray thickness not mounting geometry',
    },
  ]);
  d.note = 'Два действительных уровня сушки, две ёмкости для воды, держатели и заводской крепёжный KIT. Высоты уровней — проектный выбор; заводскую присадку выполняют по инструкции.';
  d.releaseOpenFields = [{ field: 'Присадка сушки', status: 'TEMPLATE_REQUIRED', message: 'Отверстия держателей выполняют по заводскому шаблону; проектные уровни не являются координатами сверления.' }];
  return checkParts(d);
}

/** The bottle pull-out with its composite bottom 19 + 16 mm (kcrBottle, r1.html:74822). */
function bottle(s: KitchenScene, m: Rec): Rec {
  const d = kcrRect(s, m, []);
  if (d.status === 'FAIL') return d;
  const t = m.panelThickness ?? 16,
    g = frontGap(s, m),
    gy = frontGapY(s, m),
    selected = (m.width === 150 && m.bottleProfile === 'STARAX-S2413C-C150-RIGHT' ? m.bottleProfile : null) || ({ 150: 'STARAX-S2414C-C150-LEFT', 200: 'DUSLAR-MATRIX10030034-C200-LEFT', 300: 'DUSLAR-MATRIX10030035-C300-LEFT' } as Rec)[m.width],
    star = /STARAX/.test(selected || ''),
    dims = m.width === 150 ? [108, 480, 598] : m.width === 200 ? [154, 460, 600] : m.width === 300 ? [254, 460, 600] : null,
    mins = m.width === 150 ? [108, 495, 598] : m.width === 200 ? [160, 500, 610] : m.width === 300 ? [260, 500, 610] : null;
  // KF-16 (FINDINGS 326): a thicker carcass was rejected with the reason of a wrong variant; the kits are for 16 mm.
  if (t !== 16) return kcrFail('Комплекты бутылочницы 150/200/300 мм выбраны для корпуса 16 мм; для другой толщины корпуса комплекта нет.', d.clear);
  if (!dims || !selected || d.clear.W < mins![0]! || d.clear.D < mins![1]! || d.clear.H < mins![2]! || (star && m.height - 2 * gy < 669))
    return kcrFail('Для бутылочницы выберите точный вариант 150/200/300 мм с подходящим чистым проёмом и высотой заводских креплений.', d.clear);
  if (m.shelfItems?.length) return kcrFail('Полки в занятой выдвижным механизмом зоне недопустимы.', d.clear);
  const group = m.id + ':bottle',
    travel = star ? 428 : 300;
  if (m.frontEnabled !== false) {
    const p = leaf(s, m, 'bottle-front', g, m.width - g, gy, m.height - gy, 'ordinary', 'drawer-front');
    Object.assign(p, {
      hingeHardwareSuppressed: true,
      doorGroupId: group,
      motionGroupId: group,
      motionTravelMm: travel,
      previewTravelMm: travel,
      motionTravelQualified: star,
      schematicMotion: !star,
      motionQualification: star ? 'Номинальный ход428мм; визуализация механизма схематична.' : 'Условный просмотр наполнения300мм; заводской ход не задан.',
    });
    d.parts.push(p);
    d.front_count = 1;
    d.front_size_mm = p.finished_mm;
  } else {
    d.front_count = 0;
    d.front_size_mm = null;
  }
  const x = (m.width - dims[0]!) / 2,
    bt = m.bottomThicknessMm ?? 35;
  if (bt !== 35) return kcrFail('Бутылочница использует составное дно 19+16 мм: 35 мм древесины под выбранные винты 4×35. Для другого узла нужен отдельный расчёт.', d.clear);
  d.mechanismEnvelopes = [
    {
      id: m.id + ':bottle:mechanism',
      profileId: selected,
      model: selected,
      box: [x, x + dims[0]!, bt, bt + dims[2]!, 25, 25 + dims[1]!],
      dimensionsMm: dims,
      dimensionsOrder: 'width-depth-height',
      schematic: true,
      materialPart: false,
      content: true,
      motionGroupId: group,
      motionTravelMm: travel,
      motionTravelQualified: star,
      schematicMotion: !star,
    },
  ];
  const bottom = d.parts.find((p: Rec) => p.partId === m.id + ':bottom');
  bottom.finished_mm[2] = 19;
  bottom.blank_mm[2] = 19;
  bottom.box[3] = 19;
  const lamination = clone(bottom);
  lamination.partId = m.id + ':bottom-lamination';
  lamination.name = 'Верхний слой составного дна';
  lamination.finished_mm[2] = 16;
  lamination.blank_mm[2] = 16;
  lamination.box[2] = 19;
  lamination.box[3] = 35;
  lamination.assemblyQualification = 'Project composite19+16mm woodstack; glue/material and actual assembly strength qualified separately';
  if (backInRebate(m)) {
    // A back in a quarter (FINDINGS 1269): the quarter is on the upper face of the 19 mm layer, the back rises with it,
    // and the upper layer stops in front of the back.
    const back = d.parts.find((p: Rec) => p.partId === m.id + ':back'),
      rise = 19 - t,
      front = back.box[4];
    bottom.grooves = (bottom.grooves ?? []).map((g: Rec) => rebate(s, m, g.id, [g.localBox[0], g.localBox[1], g.localBox[2] + rise, g.localBox[3] + rise, g.localBox[4], g.localBox[5]], g.depthMm, g.widthMm, g.semantic === 'GROOVE_FOR_BACK'));
    back.box[2] += rise;
    back.finished_mm[1] -= rise;
    back.blank_mm[1] -= rise;
    lamination.grooves = [];
    lamination.box[5] = front;
    lamination.finished_mm[1] = front - lamination.box[4];
    lamination.blank_mm[1] = lamination.finished_mm[1] - (lamination.edge_mm?.bottom ?? 0);
  }
  d.parts.push(lamination);
  d.clear.H -= 35 - t;
  if (d.clear.H < mins![2]!) return kcrFail('Составное дно 35 мм оставляет недостаточный чистый проём для выбранной бутылочницы.', d.clear);
  d.footWoodStackMm = 35;
  d.constructionJoints.push({
    id: m.id + ':bottom-lamination-assembly',
    kind: 'bottom-lamination',
    count: 8,
    profileId: 'PROJECT-SKIN-3.5X30',
    actualPartIds: [bottom.partId, lamination.partId],
    fasteners: [{ article: '9278224', quantity: 8 }],
    qualification: 'Project8 screws3.5x30 into19+16mm composite35; screwpositions/access, glue and material retention qualified separately',
  });
  d.note = 'Выдвижная система точного размера, отдельный мебельный фасад и полный монтажный комплект. Пилоты по заводскому шаблону и материалу; неизвестный заводской ход не выдан как монтажный размер.';
  return checkParts(d);
}

/** The island cabinet with doors or four drawers (kcrIsland, r1.html:74907). */
function island(s: KitchenScene, m: Rec): Rec {
  const n = m.fill?.drawers ?? 0,
    isDrawer = m.catalogId === 'island-drawers' || n > 0,
    mm = { ...m, depth: bodyDepth(m) },
    d = kcrRect(s, mm, isDrawer ? [] : shelfItems(m));
  if (d.status === 'FAIL') return d;
  if (isDrawer) {
    if (n !== 4) return kcrFail('Островная карточка с ящиками содержит четыре наружных ящика; другая схема требует явного варианта.', d.clear);
    const drawers = drawerSet(s, mm, m.height, 4);
    if (drawers.status === 'FAIL') return drawers;
    d.parts.push(...drawers.parts);
    d.drawerDesign = drawers.drawerDesign;
    if (drawers.releaseOpenFields) d.releaseOpenFields = [...(d.releaseOpenFields || []), ...drawers.releaseOpenFields];
    d.drawerCount = 4;
    d.front_count = m.frontEnabled === false ? 0 : 4;
    d.front_size_mm = [m.width - 2 * frontGap(s, m), drawers.frontH, frontThickness(s, m)];
  } else addLeaves(s, mm, d, frontGapY(s, m), m.height - frontGapY(s, m));
  d.effective_depth_mm = bodyDepth(m);
  d.placementBasis = 'EXISTING_ISLAND_PLAN';
  d.note = isDrawer ? 'Четыре действительных островных ящика по сохранённым мировым координатам.' : 'Островной корпус с действительными дверями и полками по сохранённым мировым координатам.';
  return checkParts(d);
}

/** kcrCalculated (r1.html:75139). */
export function constructionCalculated(s: KitchenScene, m: Rec): Rec {
  if (m.moduleTypeId === 'KB_COMBINED' || m.moduleTypeId === 'KT_COMBINED') return combined(s, m);
  if (m.moduleTypeId === 'KW_GLASS') return glass(s, m);
  if (m.moduleTypeId === 'KW_DRYER') return dryer(s, m);
  if (m.moduleTypeId === 'KB_BOTTLE') return bottle(s, m);
  if (m.moduleTypeId === 'KI_DOOR_DRAWER') return island(s, m);
  if (isAccessL(m) || isDiagonal(m)) return corner(s, m);
  return kreCalculated(s, m);
}

// ---------------------------------------------------------------- appliance cabinets (kap)

function applianceDefaultIds(m: Rec): string[] {
  switch (m.moduleTypeId) {
    case 'KB_SINK':
      return ['BLANCO_525873:topmount'];
    // MOD-AI-44: the hob cabinet of a wall row, the hob of the island cabinet; the prototype had it on the island alone.
    case 'KB_HOB':
      return ['PUE611BB5B:worktop'];
    case 'KB_OVEN':
      return m.width === 450 ? ['LYRA45WH:base'] : ['HBS534BS0B:base'];
    case 'KB_DISHWASHER_450_600':
      return [m.width === 450 ? 'SPV2HKX39G:undercounter' : 'SMV2ITX18G:undercounter'];
    case 'KB_WASHER_600':
      return ['WIW28302GB:undercounter'];
    case 'KW_HOOD':
      return ['DFM063W56B:upper'];
    case 'KW_MICROWAVE':
      return ['BFL523MS0B:upper'];
    case 'KT_FRIDGE_ONE':
      return ['KIR81VFE0G:tall'];
    case 'KT_FRIDGE_TWO':
      return ['KIN86VSE0G:tall'];
    case 'KT_OVEN':
      return ['HBS534BS0B:tall'];
    case 'KT_OVEN_MICROWAVE':
      return ['HBS534BS0B:tall', 'BFL523MS0B:tall'];
    case 'KT_COFFEE':
      return ['CTL636ES6:tall'];
    case 'KI_SINK_HOB':
      return [m.catalogId === 'island-hob' || m.variant === 'hob' ? 'PUE611BB5B:worktop' : 'BLANCO_525873:topmount'];
    default:
      return [];
  }
}

export function applianceDefaults(m: Rec): Rec[] {
  const t = m.panelThickness ?? 16,
    H = m.height;
  return applianceDefaultIds(m).map((id, i) => {
    const p = APPLIANCE_PROFILES[id];
    let bottom = p?.family?.startsWith('fridge') ? 35 : t;
    if (m.moduleTypeId === 'KB_OVEN') bottom = H - (p?.cabinetDefaults.nicheHeight || 602);
    if (['KB_DISHWASHER_450_600', 'KB_WASHER_600'].includes(m.moduleTypeId)) bottom = 0;
    if (m.moduleTypeId === 'KT_OVEN' || m.moduleTypeId === 'KT_OVEN_MICROWAVE') bottom = i ? 1356 : 750;
    if (m.moduleTypeId === 'KT_COFFEE') bottom = 950 - (m.floor || 0);
    if (['sink', 'hob'].includes(p?.family)) bottom = H + (m.worktopThickness ?? 38);
    if (p?.family === 'hood') bottom = 0;
    return {
      family: p?.family || 'oven',
      model: p?.model || null,
      profileId: id || null,
      mode: p ? 'selected' : 'preliminary',
      quantity: 1,
      nicheBottomZ: bottom,
      nicheHeight: ['washer', 'dishwasher'].includes(p?.family) ? H : (p?.cabinetDefaults.nicheHeight ?? p?.niche.height?.min ?? null),
      installedApplianceHeight: ['washer', 'dishwasher'].includes(p?.family) ? H : null,
    };
  });
}

/**
 * The user's own sink or hob by the cutout of its instruction (MOD-DEC-412, MOD-AI-44, FINDINGS 3106): the family of
 * the cabinet that may take one — a sink or a hob cabinet — or null.
 */
export function cutoutFamily(m: Rec): 'sink' | 'hob' | null {
  if (!isAppliance(m)) return null;
  const f = APPLIANCE_PROFILES[applianceDefaultIds(m)[0] ?? '']?.family;
  return f === 'sink' || f === 'hob' ? f : null;
}

/**
 * The worktop of a cabinet with the user's appliance is as wide as the cabinet; with the catalogue's, as its model
 * needs (655 under the sink, 600 under the hob, kept on the module as the prototype did).
 */
function worktopSpan(m: Rec, family: string, own: boolean): number {
  return own ? m.width : (m.worktopSpanWidth ?? (family === 'sink' ? Math.max(m.width, 655) : Math.max(m.width, 600)));
}

/**
 * Why the cutout of the user's appliance cannot be cut in the worktop of the cabinet, or null (MOD-DEC-412): whole
 * millimetres, a radius not over half the smaller side, and the cutout within the worktop of the cabinet. The edge of
 * 60 mm to a cut end of the worktop is a remark of the worktop (MOD-DEC-410), not a refusal.
 */
export function cutoutError(m: Rec, c: Rec): string | null {
  const family = cutoutFamily(m);
  if (!family) return `Вырез по инструкции прибора вводится у шкафа под мойку или варочную панель; «${m.name}» — не такой шкаф.`;
  const whole = (x: unknown, min: number) => typeof x === 'number' && Number.isInteger(x) && x >= min;
  if (!c || typeof c !== 'object' || !whole(c.width, 1) || !whole(c.depth, 1) || !whole(c.radius, 0) || (c.gas !== undefined && typeof c.gas !== 'boolean'))
    return 'Вырез: ширина и глубина — целые миллиметры больше 0, радиус углов — целые миллиметры от 0.';
  if (c.gas === true && family !== 'hob') return 'Газовой бывает варочная панель, не мойка.';
  if (c.radius > Math.min(c.width, c.depth) / 2) return `Радиус углов выреза ${c.radius} мм больше половины его меньшей стороны (${Math.min(c.width, c.depth) / 2} мм).`;
  const span = worktopSpan(m, family, true),
    depth = worktopDepthOf(m);
  if (c.width >= span || c.depth >= depth)
    return `Вырез ${c.width} × ${c.depth} мм не помещается в столешницу шкафа «${m.name}» ${span} × ${depth} мм: нужен край столешницы с каждой стороны. Проверьте размеры по инструкции прибора или выберите шкаф шире.`;
  // MOD-DEC-750: the cutout stands in the middle of the depth of the worktop, as the catalogue's; its edges before and behind.
  const { front, rear } = K.cutoutEdge.value,
    edge = (depth - c.depth) / 2;
  if (edge < Math.max(front, rear))
    return `Край столешницы у выреза — спереди не меньше ${front} мм, сзади не меньше ${rear} мм: вырез глубиной ${c.depth} мм посередине столешницы ${depth} мм оставляет по ${String(edge).replace('.', ',')} мм. Глубина выреза — не больше ${depth - 2 * Math.max(front, rear)} мм.`;
  return null;
}

/** The preliminary cutout of the model of the card (its smallest depth), the start of the user's own; null if none. */
export function catalogCutout(m: Rec): { width: number; depth: number; radius: number } | null {
  const c = APPLIANCE_PROFILES[applianceDefaultIds(m)[0] ?? '']?.cutouts?.[0];
  return c ? { width: c.width, depth: c.depth ?? c.depthMin, radius: c.radius ?? 3 } : null;
}

/**
 * The sink laid on the wall sink cabinet in place of its worktop, «Монтаж мойки: накладная» (MOD-AI-60, MOD-DEC-753,
 * FINDINGS 3193): as wide as the cabinet, 600 deep; no worktop and no cutout over the cabinet.
 */
export const overlaySink = (m: Rec | null | undefined): boolean => m?.sinkMount === 'overlay' && m.moduleTypeId === 'KB_SINK' && !isFree(m);

/** The appliance of a cabinet with the user's cutout: no model of the catalogue, the cutout of its instruction. */
export function ownAppliance(m: Rec): Rec[] {
  return applianceDefaults(m).map((a) => ({ ...a, model: null, profileId: null, mode: 'own' }));
}

/** The appliances of a cabinet (kapSelections, r1.html:77325). */
export function applianceSelections(m: Rec): Rec[] {
  if (!isAppliance(m)) return [];
  // MOD-DEC-412: a cabinet with the user's cutout takes the user's appliance, not a model of the catalogue; so does the
  // overlay sink (MOD-DEC-753).
  if ((m.cutout && cutoutFamily(m)) || overlaySink(m)) return ownAppliance(m);
  const fallback = applianceDefaults(m);
  if (Array.isArray(m.appliances)) return m.appliances.map((a: Rec, i: number) => ({ ...fallback[i], ...a }));
  if (m.applianceMode === 'preliminary') return fallback.map((a) => ({ ...a, mode: 'preliminary', model: null, profileId: null }));
  if (m.applianceModel)
    return fallback.map((a, i) => (i ? a : { ...a, model: m.applianceModel, profileId: applianceDefaultIds(m).find((id) => APPLIANCE_PROFILES[id]?.model === m.applianceModel) || null, mode: 'selected' }));
  return fallback;
}

function nicheError(s: KitchenScene, m: Rec, a: Rec, p: Rec | undefined): string | null {
  if (!Number.isFinite(a.nicheBottomZ) || a.nicheBottomZ < 0 || (a.nicheHeight !== null && (!Number.isFinite(a.nicheHeight) || a.nicheHeight < 0)))
    return 'Монтажная ниша: низ должен быть конечным неотрицательным числом; высота — таким же числом или явно не задана для модели без размерной ниши.';
  if (a.mode !== 'selected') return null;
  if (!p || p.model !== a.model) return 'Выбранная модель не соответствует этой монтажной нише.';
  // MOD-AI-58 (FINDINGS 3112): the refusal names the model and the models of the width; the prototype said «Модель не
  // подходит выбранной карточке или ширине.»
  if (!applianceDefaultIds(m).some((id) => id === a.profileId)) {
    const fit = [...new Set(applianceDefaultIds(m).map((id) => APPLIANCE_PROFILES[id]?.model).filter(Boolean))];
    return `Модель ${a.model} не подходит модулю «${m.name}» шириной ${m.width} мм: ${fit.length ? `под эту ширину — ${fit.join(', ')}` : 'под эту ширину в каталоге модели нет'}.`;
  }
  if (a.quantity !== 1) return 'Для каждой монтажной ниши требуется один прибор.';
  const t = m.panelThickness ?? 16,
    W = m.width - 2 * t,
    H = m.height,
    D = isFree(m) ? bodyDepth(m) : m.depth,
    n = p.niche,
    b = a.nicheBottomZ,
    h = a.nicheHeight;
  if (p.family === 'coffee' && !isFree(m) && m.pos < 350) return 'Для схемы открывания кофемашины оставьте 350 мм слева вдоль стены. Измените положение модуля.';
  if (p.family === 'sink') return m.width < 600 ? 'Мойка DALAGO 6 требует корпус от 600 мм.' : null;
  if (p.family === 'hob') return m.width < 600 ? 'Поверхности PUE611BB5B нужен выбранный корпус от 600 мм.' : null;
  if (p.family === 'hood') return m.width !== 600 || D < 320 || H < 390 ? 'Вытяжке нужен шкаф 600 мм, глубиной от 320 мм и высотой от 390 мм.' : null;
  const bay = ['dishwasher', 'washer'].includes(p.family),
    nw = bay ? m.width : (p.packing?.finishedNicheWidth ?? W);
  if (p.packing && (m.width !== 450 || t !== 16)) return 'Профиль узкой духовки рассчитан на 450 мм и боковины 16 мм с двумя накладками 4 мм.';
  if (n.width && (nw < n.width.min || (n.width.max != null && nw > n.width.max))) return 'Чистая ширина ниши ' + nw + ' мм; модели нужна ' + n.width.min + (n.width.max != null ? '–' + n.width.max : '+') + ' мм.';
  if (n.height && (!Number.isFinite(h) || h < n.height.min || (n.height.max != null && h > n.height.max))) return 'Высота ниши вне монтажного диапазона модели.';
  if (p.family === 'coffee' && D < 456) return 'Кофемашине нужен просвет 100 мм между корпусом 356 мм и стеной: глубина от 456 мм.';
  if (p.family.startsWith('fridge') && W > 568) return 'Для выбранного крепления предусмотрена ниша 560–568 мм; более широкая ниша требует отдельного профиля наполнителей.';
  if (p.family === 'fridge-two' && (t !== 16 || frontThickness(s, m) !== 18)) return 'Выбранные петли двух фасадов рассчитаны на корпус 16 мм и фасады 18 мм.';
  if (p.family === 'washer' && (frontThickness(s, m) < 16 || frontThickness(s, m) > 21)) return 'Фасад стиральной машины: толщина 16–21 мм.';
  if (n.depth && D - (p.family.startsWith('fridge') ? 40 : 0) < n.depth.min) return 'Недостаточно глубины ниши или заднего вентиляционного канала.';
  const floorTop = p.family.startsWith('fridge') ? 35 : t,
    heat = p.packing?.floorThicknessMm || 0,
    needsRearSupport = p.family === 'oven' || p.family === 'coffee' || (p.family === 'microwave' && a.profileId.endsWith(':tall')),
    supportMin = (m.supportKit === '9028286' && m.footMount !== 'DOWELS' ? 35 : t) + t + heat;
  if (!bay && (p.family.startsWith('fridge') ? b !== floorTop && b < floorTop + t : needsRearSupport ? b < supportMin : b < t))
    return 'Низ ниши пересекает дно или усиление опор либо не оставляет места несущей полке. Для холодильника основание 35 мм; ранее сохранённый корпус с нишей 16 мм открывайте в исходной версии или пересоздайте с новым основанием.';
  if (p.family === 'microwave' && (m.floor || 0) + b < 850) return 'Микроволновка BFL523MS0B: нижняя отметка установки должна быть не менее 850 мм от пола помещения.';
  const ceiling = bay || m.moduleTypeId === 'KB_OVEN' ? H : H - t;
  if (!Number.isFinite(b) || b + h > ceiling + 0.001) return 'Монтажная ниша пересекает верхнюю панель или выходит за высоту корпуса.';
  if (bay && (!Number.isInteger(H) || !Number.isFinite(a.installedApplianceHeight) || a.installedApplianceHeight !== H || a.installedApplianceHeight < n.height.min || a.installedApplianceHeight > n.height.max || m.floor !== 0 || H < n.height.min || H > n.height.max))
    return 'Машина стоит на полу в проёме 815–875 мм (стиральная 818–830 мм); мебельная опора под ней не применяется.';
  return null;
}

function nichesApart(as: Rec[], t: number): boolean {
  const occupied = as
    .filter((a) => a.mode === 'selected' && APPLIANCE_PROFILES[a.profileId] && !['sink', 'hob', 'hood', 'washer', 'dishwasher'].includes(APPLIANCE_PROFILES[a.profileId]!.family))
    .map((a) => ({ lo: a.nicheBottomZ, hi: a.nicheBottomZ + a.nicheHeight }))
    .sort((a, b) => a.lo - b.lo);
  return occupied.every((a, i) => i === 0 || a.lo - occupied[i - 1]!.hi >= t - 0.001);
}

/** Fixed shelves that carry and cap the appliances (kapFixedSpecs, r1.html:77464). */
export function applianceFixedSpecs(m: Rec, as: Rec[]): Rec[] {
  const t = m.panelThickness ?? 16,
    H = m.height,
    D = isFree(m) ? bodyDepth(m) : m.depth,
    out: Rec[] = [];
  for (let i = 0; i < as.length; i++) {
    const a = as[i]!,
      p = APPLIANCE_PROFILES[a.profileId];
    // MOD-DEC-566 п. 7 (FINDINGS 1279): the shelf over the hood of a new cabinet does not rest on the housing (Bosch
    // 9001527925, p. 13) and stops short of the wall, a channel for the cord to the socket over it.
    if (a.mode === 'selected' && p?.family === 'hood' && m.hoodFit) {
      const y = p.appliance.height + K.hoodShelfGap.value;
      if (y + t <= H - t) out.push({ id: m.id + ':shelf:hood', y, depth: D - K.hoodShelfRearGap.value, levelMm: y - t, fixed: true, name: 'Полка над вытяжкой' });
      continue;
    }
    if (a.mode !== 'selected' || !p || ['dishwasher', 'washer', 'sink', 'hob', 'hood'].includes(p.family)) continue;
    const rear = p.family.startsWith('fridge') ? 40 : p.family === 'coffee' || (p.family === 'microwave' && a.profileId.endsWith(':tall')) ? 35 : p.packing ? 45 : 20;
    const rows: [number, string][] = [
      [a.nicheBottomZ - t - (p.packing?.floorThicknessMm || 0), 'support'],
      [a.nicheBottomZ + a.nicheHeight, 'cap'],
    ];
    for (const [y, key] of rows) {
      if (key === 'support' && p.family.startsWith('fridge') && a.nicheBottomZ === 35) continue;
      if (y < t - 0.001 || y + t > H - t + 0.001 || (m.moduleTypeId === 'KB_OVEN' && key === 'cap')) continue;
      if (out.some((x) => Math.abs(x.y - y) < 0.001)) continue;
      out.push({ id: m.id + ':shelf:appliance:' + i + ':' + key, y, depth: D - rear, levelMm: y - t, fixed: true, applianceSupport: true });
    }
  }
  return out;
}

function furnitureFront(s: KitchenScene, m: Rec, parts: Rec[], id: string, label: string, width: number, height: number, y: number, extra: Rec = {}): Rec | undefined {
  if (m.frontEnabled === false) return;
  const ft = frontThickness(s, m),
    e = frontEdge(m),
    g = (m.width - width) / 2,
    z = -FRONT_CARCASS_GAP;
  const f = part(s, m, label, id, [width, height, ft], [g, g + width, y, y + height, z - ft, z], 'FACADE', { left: e, right: e, top: e, bottom: e });
  Object.assign(f, extra, { manufacturingQualified: false });
  parts.push(f);
  return f;
}

function storageFronts(s: KitchenScene, m: Rec, parts: Rec[], as: Rec[]): void {
  if (!m.moduleTypeId.startsWith('KT_')) return;
  const t = m.panelThickness ?? 16,
    g = frontGap(s, m),
    gy = frontGapY(s, m),
    H = m.height,
    intervals = as
      .filter((a) => a.mode === 'selected' && APPLIANCE_PROFILES[a.profileId])
      .map((a) => [a.nicheBottomZ - t, a.nicheBottomZ + a.nicheHeight + t])
      .sort((a, b) => a[0]! - b[0]!);
  let lo = t;
  for (const [start, end] of [...intervals, [H - t, H]]) {
    const height = start! - lo - 2 * gy;
    if (height >= 150) furnitureFront(s, m, parts, 'appliance-storage-front:' + lo, 'Фасад отделения', m.width - 2 * g, height, lo + gy, { applianceStorage: true });
    lo = Math.max(lo, end!);
  }
}

function applianceEnvelope(m: Rec, a: Rec, p: Rec, index: number): Rec {
  const W = m.width,
    H = m.height,
    t = m.panelThickness ?? 16,
    wt = m.worktopThickness ?? 38,
    z = a.nicheBottomZ,
    ap = p.appliance,
    x = (W - ap.width) / 2,
    D = isFree(m) ? bodyDepth(m) : m.depth;
  let box = [x, x + ap.width, z, z + (a.installedApplianceHeight || ap.height), 0, ap.depth];
  // A new hood cabinet: the housing goes up into the cabinet by its recess (162), the pull-out under it stays below the
  // cabinet and opens under the door (FINDINGS 1279); the prototype drew the whole appliance inside.
  if (p.family === 'hood' && m.hoodFit) box = [x, x + ap.width, z + p.niche.height.min - ap.height, z + p.niche.height.min, 0, ap.depth];
  if (p.family === 'sink' || p.family === 'hob') box = [x, x + ap.width, H + wt - ap.height, H + wt, D - worktopDepthOf(m) / 2 - ap.depth / 2, D - worktopDepthOf(m) / 2 + ap.depth / 2];
  return {
    id: m.id + ':appliance:' + index,
    model: a.model,
    family: p.family,
    profileId: a.profileId,
    dimensionsMm: [ap.width, ap.height, ap.depth],
    installedDimensionsMm: [ap.width, a.installedApplianceHeight || ap.height, ap.depth],
    feetAdjustmentMm: a.installedApplianceHeight ? a.installedApplianceHeight - ap.height : 0,
    installedTopDatumMm: box[3],
    width: ap.width,
    height: ap.height,
    depth: ap.depth,
    box,
    niche: { width: ['washer', 'dishwasher'].includes(p.family) ? W : (p.packing?.finishedNicheWidth ?? W - 2 * t), height: a.nicheHeight, depth: m.depth - (p.family.startsWith('fridge') ? 40 : 0), bottomZ: z },
    schematic: true,
    materialPart: false,
    doorOwnership: ap.doorOwnership,
  };
}

/**
 * The cut-out for the pipe of the hood in the top and in the shelf over it (MOD-DEC-566 п. 7, FINDINGS 1279): its centre
 * where the Bosch sheet puts it, from the outer face of the left side and from the front edge; an aperture of the part,
 * cut by its contour as the worktop's, not a drilled hole.
 */
function hoodPipeCutouts(m: Rec, parts: Rec[]): void {
  const c = K.hoodPipeCutout.value,
    d = K.hoodPipeCutoutDiameter.value;
  for (const p of parts.filter((x) => [m.id + ':top', m.id + ':shelf:hood'].includes(x.partId))) {
    p.apertures = [{ id: p.partId + ':aperture:hood-pipe', moduleId: m.id, x: c.fromSideMm - d / 2, z: c.fromFrontMm - d / 2, width: d, depth: d, radius: d / 2, kind: 'hood-pipe-cutout' }];
    p.operations = [...(p.operations ?? []), { kind: 'Вырез под трубу вытяжки', width: d, height: d, radius: d / 2, production: false, qualification: 'Центр — по листу Bosch; диаметр (Д), уточняется по трубе' }];
  }
}

/**
 * The worktop with the cutout of a sink or a hob (kapWorktop, r1.html:77565). The cutout of a model of the catalogue
 * is the preliminary one of the prototype; the cutout the user entered by the instruction of the appliance goes to
 * production (MOD-DEC-412).
 */
function applianceWorktop(s: KitchenScene, m: Rec, parts: Rec[], p: Rec, own: Rec | null = null): Rec {
  const W = m.width,
    H = m.height,
    th = m.worktopThickness ?? 38,
    depth = worktopDepthOf(m),
    span = worktopSpan(m, p.family, !!own),
    D = isFree(m) ? bodyDepth(m) : m.depth,
    cx = W / 2,
    cy = D - depth / 2,
    cut = own ?? p.cutouts[0],
    cw = cut.width,
    ch = cut.depth ?? cut.depthMin,
    rad = cut.radius ?? 3;
  const top = part(s, m, 'Столешница с вырезом', 'worktop', [span, depth, th], [cx - span / 2, cx + span / 2, H, H + th, D - depth, D], 'WORKTOP');
  top.apertures = [
    {
      id: m.id + ':aperture:' + p.family,
      moduleId: m.id,
      x: cx - cw / 2,
      z: cy - ch / 2,
      width: cw,
      depth: ch,
      radius: rad,
      ...(own ? { userEntered: true } : { widthTolerance: cut.widthTolerance, depthTolerance: cut.depthTolerance || { plus: 2, minus: 0 } }),
      kind: p.family === 'sink' ? 'sink-cutout' : 'hob-cutout',
    },
  ];
  top.operations = [
    own
      ? { kind: 'Вырез столешницы', width: cw, height: ch, radius: rad, production: true, qualification: 'Размеры выреза — по инструкции прибора, введены пользователем (MOD-DEC-412)' }
      : { kind: 'Вырез столешницы', width: cw, height: ch, radius: rad, production: false, qualification: 'Контур известен; материал, инструмент и опирание проверяются отдельно' },
  ];
  top.manufacturingQualified = false;
  parts.push(top);
  return top;
}

/** The cabinet of an appliance: carcass, furniture fronts, niches, supports and the kit (kapCalculated, r1.html:77606). */
export function applianceCalculated(s: KitchenScene, m: Rec): Rec {
  const expected = applianceDefaultIds(m),
    overlay = overlaySink(m);
  if (overlay) {
    // MOD-DEC-753: the overlay sink is the user's, on the cabinet; it has no cutout.
  } else if (m.cutout && cutoutFamily(m)) {
    const err = cutoutError(m, m.cutout);
    if (err) return { status: 'FAIL', parts: [], note: err };
  } else if (Array.isArray(m.appliances) && (m.appliances.length !== expected.length || m.appliances.some((a: Rec) => !a || typeof a !== 'object' || !['selected', 'preliminary'].includes(a.mode) || a.quantity !== 1)))
    return { status: 'FAIL', parts: [], note: 'Для каждой ниши требуется запись выбранной или предварительной модели и количество 1. Пустой список техники недопустим.' };
  const W = m.width,
    H = m.height,
    D = isFree(m) ? bodyDepth(m) : m.depth,
    t = m.panelThickness ?? 16,
    e = bodyEdge(m),
    // The fronts of the appliance cabinet keep the outer gaps of every front (KF-06); the prototype wrote 2 here.
    gx = frontGap(s, m),
    gy = frontGapY(s, m),
    as = applianceSelections(m),
    own = !overlay && m.cutout && cutoutFamily(m) ? (m.cutout as Rec) : null,
    selected = as.every((a) => a.mode === 'selected' || a.mode === 'own'),
    parts: Rec[] = [],
    envelopes: Rec[] = [],
    issues: string[] = [],
    constructionJoints: Rec[] = [];
  if (!finite(W, H, D, t, e) || Math.min(W - 2 * t, H, D, t) <= 0 || e < 0) return { status: 'FAIL', parts: [], note: 'Проверьте размеры корпуса и толщину материала.' };
  for (const a of as) {
    const err = nicheError(s, m, a, APPLIANCE_PROFILES[a.profileId]);
    if (err) issues.push(err);
  }
  if (!nichesApart(as, t)) issues.push('Монтажные ниши техники пересекаются или не оставляют толщину несущей панели между приборами.');
  if (issues.length) return { status: 'FAIL', parts: [], applianceSelections: as, applianceEnvelopes: [], clear: { W: W - 2 * t, H: H - 2 * t, D }, note: issues.join(' '), localOpenFields: [] };
  const first = own || overlay ? { family: cutoutFamily(m) } : APPLIANCE_PROFILES[as[0]?.profileId],
    bay = ['dishwasher', 'washer'].includes(first?.family) || isApplianceBay(m),
    hood = first?.family === 'hood',
    baseOven = m.moduleTypeId === 'KB_OVEN';
  const ed = { left: 0, right: 0, top: 0, bottom: e };
  if (!bay) {
    parts.push(part(s, m, 'Боковина левая', 'side:L', [H, D, t], [0, t, 0, H, 0, D], 'CORPUS', ed), part(s, m, 'Боковина правая', 'side:R', [H, D, t], [W - t, W, 0, H, 0, D], 'CORPUS', ed));
    const fridge = first?.family?.startsWith('fridge'),
      gap = fridge ? 40 : 0;
    if (!hood) parts.push(part(s, m, 'Дно', 'bottom', [W - 2 * t, D - gap, t], [t, W - t, 0, t, 0, D - gap], 'CORPUS', ed));
    if (fridge) {
      const bottom = parts.find((p) => p.partId === m.id + ':bottom')!,
        layer = part(s, m, 'Верхний слой сплошного основания холодильника', 'bottom-lamination', [W - 2 * t, D - 40, 35 - t], [t, W - t, t, 35, 0, D - 40], 'CORPUS', ed);
      Object.assign(layer, {
        mountingStackMm: 35,
        mountingStackQualification:
          'Full-contact16+19 or19+16 woodstack35; appliance bears on a flat continuous floor. Eight3.5x30 assembly screws fix the layers; actual material, pilot and retention require manufacturing qualification.',
      });
      parts.push(layer);
      constructionJoints.push({
        id: m.id + ':bottom-lamination-assembly',
        kind: 'dry-base-layer-fastening',
        count: 8,
        profileId: 'PROJECT-BASE35-3.5X30',
        actualPartIds: [bottom.partId, layer.partId],
        fasteners: [{ article: '9278224', manufacturer: 'Hettich', quantity: 8 }],
        qualification:
          'Project dry full-contact composite35; eight3.5x30 screws through bottom into upperlayer, remaining wood5mm; assembly before footplate installation, positions clear of plates. No adhesive or certified joint load assumed.',
      });
    }
    if (['KB_SINK', 'KB_HOB', 'KI_SINK_HOB'].includes(m.moduleTypeId)) {
      // A new module: the rails stand on edge at the top under the worktop, the bowl or the hob between them (MOD-DEC-566
      // п. 1, FINDINGS 1265); a saved one keeps the prototype's ties 200 mm below the top.
      const top = railsOnTop(m),
        r = K.railWidth.value,
        [y0, y1] = top ? [H - r, H] : [H - 300, H - 200];
      for (const [side, z] of [
        ['front', 0],
        ['rear', D - t],
      ] as [string, number][])
        parts.push(
          top
            ? part(s, m, 'Царга на ребро ' + (side === 'front' ? 'передняя' : 'задняя'), 'rail:' + side + ':edge', [W - 2 * t, r, t], [t, W - t, y0, y1, z, z + t], 'CORPUS', ed)
            : part(s, m, 'Связующая царга ниже техники ' + (side === 'front' ? 'передняя' : 'задняя'), 'appliance-traverse:' + side, [W - 2 * t, 100, t], [t, W - t, y0, y1, z, z + t], 'CORPUS', ed),
        );
    } else if (!baseOven) parts.push(part(s, m, 'Верх', 'top', [W - 2 * t, D - gap, t], [t, W - t, H - t, H, 0, D - gap], 'CORPUS', ed));
    for (const sp of applianceFixedSpecs(m, as))
      parts.push({ ...part(s, m, sp.name ?? 'Фиксированная опора техники', sp.id.slice(m.id.length + 1), [W - 2 * t, sp.depth, t], [t, W - t, sp.y, sp.y + t, 0, sp.depth], 'CORPUS', ed), ...(sp.fixed === true ? { fixedShelf: true } : {}) });
    if (hood && m.hoodFit) hoodPipeCutouts(m, parts);
  }
  if (own) {
    // The user's sink or hob (MOD-DEC-412): its worktop with the cutout of its instruction, the front under it; its
    // place is the cutout through the worktop — the body under the worktop is of its instruction, not of the kitchen.
    const family = first!.family as string,
      top = applianceWorktop(s, m, parts, { family }, own),
      a = top.apertures[0];
    envelopes.push({
      id: m.id + ':appliance:0',
      model: null,
      family,
      profileId: null,
      own: true,
      gas: own.gas === true,
      dimensionsMm: [a.width, top.box[3] - top.box[2], a.depth],
      box: [a.x, a.x + a.width, top.box[2], top.box[3], a.z, a.z + a.depth],
      schematic: true,
      materialPart: false,
    });
    if (family === 'sink') furnitureFront(s, m, parts, 'sink-front', 'Фасад мойки', W - 2 * gx, H - 2 * gy, gy, { applianceStorage: true });
    else furnitureFront(s, m, parts, 'hob-storage-front', 'Фасад отделения под варочной поверхностью', W - 2 * gx, H - 2 * gy, gy, { applianceStorage: true, motionKind: 'swing-door' });
  }
  if (overlay) {
    // MOD-DEC-753: the overlay sink lies on the cabinet in the plane of the worktops, as wide as the cabinet and 600 deep;
    // the worktops of the neighbours end at it (wholeWorktops). It is bought; its model and price are not chosen.
    const depth = K.overlaySinkDepth.value,
      th = m.worktopThickness ?? 38;
    envelopes.push({ id: m.id + ':appliance:0', model: null, family: 'sink', profileId: null, own: true, overlay: true, dimensionsMm: [W, th, depth], box: [0, W, H, H + th, D - depth, D], schematic: true, materialPart: false });
    furnitureFront(s, m, parts, 'sink-front', 'Фасад мойки', W - 2 * gx, H - 2 * gy, gy, { applianceStorage: true });
  }
  for (let i = 0; i < as.length; i++) {
    const a = as[i]!,
      p = APPLIANCE_PROFILES[a.profileId];
    if (a.mode !== 'selected' || !p) continue;
    const env = applianceEnvelope(m, a, p, i);
    envelopes.push(env);
    if (p.packing) {
      const pack = p.packing.thicknessMm;
      for (const side of ['L', 'R']) {
        const x = side === 'L' ? t : W - t - pack;
        const q = part(s, m, 'Монтажная накладка духовки ' + side, 'appliance-liner:' + i + ':' + side, [a.nicheHeight, D - 45, pack], [x, x + pack, a.nicheBottomZ, a.nicheBottomZ + a.nicheHeight, 0, D - 45], 'CORPUS');
        Object.assign(q, {
          materialCode: p.packing.materialCode,
          materialQualification:
            'COGEBI COGETHERM M; source continuous500°C, contact requirement100°C; finished4mm after thickness selection/machining, raw stock±7%; complete assembled thermal performance not certified',
          manufacturingQualified: false,
          structural: false,
          fasteningCondition: 'Factory frame screws pass through4mm liner into16mm structural side; source screw length unknown',
          operations: [],
        });
        parts.push(q);
      }
      const floor = p.packing.floorThicknessMm,
        q = part(s, m, 'Теплоизоляционная накладка опоры духовки', 'appliance-floor-liner:' + i, [W - 2 * t, D - 45, floor], [t, W - t, a.nicheBottomZ - floor, a.nicheBottomZ, 0, D - 45], 'CORPUS');
      Object.assign(q, {
        materialCode: p.packing.materialCode,
        materialQualification:
          'COGEBI COGETHERM M; continuous500°C per supplier datasheet; finished4mm, raw stock±7%; supported on full structural shelf, factory ventilation cut-out45mm remains open',
        manufacturingQualified: false,
        structural: false,
        fasteningCondition: 'Non-structural thermal overlay supported by full shelf and retained within side liners and appliance installation; no screw anchorage in mica assumed',
        operations: [],
      });
      parts.push(q);
    }
    if (['sink', 'hob'].includes(p.family)) {
      applianceWorktop(s, m, parts, p);
      if (p.family === 'sink') furnitureFront(s, m, parts, 'sink-front', 'Фасад мойки', W - 2 * gx, H - 2 * gy, gy, { applianceStorage: true });
      if (p.family === 'hob') furnitureFront(s, m, parts, 'hob-storage-front', 'Фасад отделения под варочной поверхностью', W - 2 * gx, H - 2 * gy, gy, { applianceStorage: true, motionKind: 'swing-door' });
    }
    // A new hood cabinet: a door over the housing, hinged to the sides — not fixed to the housing, opened for the filter
    // and the service (Bosch 9001527925, p. 13; FINDINGS 1279).
    if (p.family === 'hood' && m.hoodFit) furnitureFront(s, m, parts, 'hood-front', 'Фасад шкафа вытяжки', W - 2 * gx, H - 2 * gy, gy, { applianceStorage: true, motionKind: 'swing-door' });
    if (p.family === 'fridge-one')
      furnitureFront(s, m, parts, 'appliance-front:0', 'Фасад холодильника', W - 2 * gx, 1772, a.nicheBottomZ, {
        applianceFront: true,
        applianceFamily: p.family,
        hingeHardwareSuppressed: true,
        motionKind: 'appliance-side-door',
        coupledApplianceId: env.id,
        hingeSide: m.hingeSide || 'right',
        maxFrontMassKg: 22,
      });
    if (p.family === 'fridge-two') {
      furnitureFront(s, m, parts, 'appliance-front:0', 'Нижний фасад холодильника', W - 2 * gx, 720, a.nicheBottomZ, {
        applianceFront: true,
        applianceFamily: p.family,
        motionKind: 'appliance-side-door',
        hingeSide: m.hingeSide || 'right',
        coupledApplianceId: env.id + ':lower',
        hingeHardwareSuppressed: true,
        applianceFrontHingeHandled: true,
        furnitureHingeProfile: 'BLUM-CLIP71B3550-B16-F18',
        furnitureHingeQuantity: 2,
      });
      furnitureFront(s, m, parts, 'appliance-front:1', 'Верхний фасад холодильника', W - 2 * gx, 1048, a.nicheBottomZ + 724, {
        applianceFront: true,
        applianceFamily: p.family,
        motionKind: 'appliance-side-door',
        hingeSide: m.hingeSide || 'right',
        coupledApplianceId: env.id + ':upper',
        hingeHardwareSuppressed: true,
        applianceFrontHingeHandled: true,
        furnitureHingeProfile: 'BLUM-CLIP71B3550-B16-F18',
        furnitureHingeQuantity: 3,
      });
    }
    if (p.family === 'dishwasher')
      furnitureFront(s, m, parts, 'appliance-front:0', 'Фасад посудомоечной машины', W - 2 * gx, 716, a.installedApplianceHeight - (m.applianceFrontTopGap ?? 4) - 716, {
        applianceFront: true,
        applianceFamily: p.family,
        hingeHardwareSuppressed: true,
        motionKind: 'appliance-drop-door',
        coupledApplianceId: env.id,
        hingeSide: 'bottom',
      });
    if (p.family === 'dishwasher') {
      const q = dishwasherPlinth(s, m, a);
      if (q) parts.push(q);
    }
    if (p.family === 'washer') {
      const f = furnitureFront(s, m, parts, 'appliance-front:0', 'Фасад стиральной машины', 594, 710, a.installedApplianceHeight - 4 - 710, {
        applianceFront: true,
        applianceFamily: p.family,
        hingeHardwareSuppressed: true,
        motionKind: 'appliance-side-door',
        hingeSide: m.hingeSide || 'left',
        coupledApplianceId: env.id,
      });
      if (f)
        f.operations = [0, 338].map((dy) => ({
          kind: 'Чашка петли стиральной машины',
          diameter: 35,
          depth: 12,
          x: m.hingeSide === 'right' ? 594 - 34 : 34,
          y: 710 - 195 - dy,
          installedMachineTopMm: a.installedApplianceHeight,
          feetAdjustmentMm: a.installedApplianceHeight - 818,
          frontTopGapMm: 4,
          datum: 'готовый фасад:34мм от петлевой кромки;199мм от отметки верха машины (при выбранном отступе фасада4мм:195мм от его верха);шаг338мм',
          production: false,
          qualification: 'Монтажный шаблон, материал и инструмент проверить',
        }));
    }
  }
  if (selected) storageFronts(s, m, parts, as);
  if (baseOven && selected) {
    const y = as[0]!.nicheBottomZ - t - (APPLIANCE_PROFILES[as[0]!.profileId]?.packing?.floorThicknessMm || 0);
    if (y > 30) furnitureFront(s, m, parts, 'appliance-fixed-plinth', 'Нижняя неподвижная планка', W - 2 * gx, y - 2 * gy, gy, { fixedFront: true, hingeHardwareSuppressed: true });
  }
  if (hangerEligible(m))
    for (const side of ['L', 'R']) {
      const sp = parts.find((p) => p.partId === m.id + ':side:' + side);
      if (sp) sp.operations = [0, 1, 2].map((i) => ({ kind: 'SAH216 pin', diameter: 10, depth: 12.5, fromTop: t + 56 + 32 * i, fromFront: D - 5, production: false, qualification: 'Пилот, материал и стену проверить' }));
    }
  if (parts.some((p) => p.blank_mm.some((v: number) => !Number.isFinite(v) || v <= 0))) return { status: 'FAIL', parts: [], note: 'Кромка превышает размер детали.' };
  parts.forEach((p, i) => (p.exportPosition = i + 1));
  const thermalUnknown = as
    .filter((a) => a.mode === 'selected' && APPLIANCE_PROFILES[a.profileId]?.thermalRequirements)
    .map((a) => {
      const r = APPLIANCE_PROFILES[a.profileId]!.thermalRequirements;
      return {
        field: 'Термостойкость корпуса для ' + a.model,
        status: 'UNKNOWN',
        mandatoryForSelectedVariant: true,
        sourcePDF: r.sourcePDF,
        sourcePDFPage1Based: r.sourcePDFPage1Based,
        sourceSHA256: r.sourceSHA256,
        message:
          a.model +
          ': по инструкции корпус должен выдерживать нагрев до ' +
          r.fittedUnitHeatResistanceC +
          ' °C' +
          (r.adjacentFrontHeatResistanceC ? ', соседние мебельные фасады — до ' + r.adjacentFrontHeatResistanceC + ' °C' : '') +
          '. Соответствие выбранной плиты, кромки и соединений пока не подтверждено; требуется паспорт конкретного материала и применимость к этому монтажу.' +
          (r.sideThermalInsulationStrips === 'PROHIBITED' ? ' Дополнительные теплоизоляционные полосы на боковинах для этой модели запрещены.' : ''),
      };
    });
  const open: Rec[] = selected
    ? [
        { field: 'Монтаж и подключение', status: 'SITE_CHECK', message: 'Проверить несущие материалы, закрепление, фактическую стену, вентиляцию, электрику и воду.' },
        { field: 'Присадка техники', status: 'TEMPLATE_REQUIRED', message: 'Крепёж и отверстия техники выполняются по её заводскому шаблону; автоматическая присадка всех узлов не подтверждена.' },
      ]
    : [{ field: 'Модель техники', status: 'UNKNOWN', message: 'Предварительный корпус: выберите точную модель, монтажную нишу и комплект.' }];
  if (own)
    open.splice(0, open.length, {
      field: 'Свой прибор',
      status: 'SITE_CHECK',
      message: `Вырез ${own.width} × ${own.depth} мм, радиус углов ${own.radius} мм — по инструкции прибора, введён пользователем. Между боковинами корпуса ${W - 2 * t} мм: прибор под столешницей должен в них поместиться; крепление, вентиляция и подключение — по его инструкции.`,
    });
  if (overlay)
    open.splice(0, open.length, {
      field: 'Накладная мойка',
      status: 'SITE_CHECK',
      message: `Накладная мойка ${W} × ${K.overlaySinkDepth.value} мм ложится на корпус вместо столешницы; модель и цена не выбраны — покупная позиция. Крепление, примыкание к столешницам соседей и подключение — по её инструкции.`,
    });
  open.push(...thermalUnknown);
  if (first?.family === 'coffee')
    open.push(
      { field: 'Высота кофемашины', status: 'ADVISORY', message: 'Идеальная высота установки CTL636ES6 по изготовителю950мм от пола; это рекомендация, а не обязательный диапазон950–1450мм.' },
      { field: 'Открывание кофемашины', status: 'SITE_CHECK', message: 'Для двери110° нужен просвет350мм слева; выбранная схема не подтверждает фактическую стену.' },
    );
  if (first?.family === 'hood' && m.hoodFit)
    open.push(
      { field: 'Крепление вытяжки', status: 'TEMPLATE_REQUIRED', message: 'Два уголка вытяжки — на четыре винта комплекта в боковины изнутри, по шаблону Bosch (лист 9001527925, с. 12: 176 мм от нижней кромки, 114 и 161 мм по глубине).' },
      { field: 'Вырез под трубу', status: 'SITE_CHECK', message: 'Центр выреза в верхе и полке — по листу Bosch (с. 12): 131 мм от левой боковины, 192 мм от передней кромки; диаметр ' + K.hoodPipeCutoutDiameter.value + ' мм (Д) — сверить с трубой или модулем рециркуляции.' },
      { field: 'Розетка вытяжки', status: 'SITE_CHECK', message: 'Розетка на стене за шкафом — в зоне шириной 350 мм не ниже 170 мм над низом шкафа (лист Bosch, с. 12), вилка доступна; шнур проходит в канал 40 мм за полкой.' },
    );
  if (parts.some((p) => p.applianceFixing))
    open.push({
      field: 'Цоколь посудомоечной машины',
      status: 'TEMPLATE_REQUIRED',
      message: 'Цоколь перед машиной крепится к ней двумя кронштейнами комплекта (⑨) на винты ø4 × 15 (④), оси кронштейнов — через 470 мм; положение кронштейнов a и b — по месту (лист Bosch 9001170054, раздел 8).',
    });
  if (first?.family === 'hood') open.push({ field: 'Высота вытяжки', status: 'SITE_CHECK', message: 'От электрической поверхности≥430мм, от газовой≥650мм; рециркуляционные выходы свободны.' });
  return {
    status: selected ? 'GEOMETRY_DRAFT' : 'GEOMETRY_PARTIAL',
    parts,
    ...(constructionJoints.length ? { constructionJoints } : {}),
    clear: { W: bay ? W : W - 2 * t, H: bay ? H : H - 2 * t, D },
    body_size_mm: [W, H, D],
    applianceSelections: as,
    applianceEnvelopes: envelopes,
    applianceFrontBoxes: [],
    installationKit: as
      .filter((a) => a.mode === 'selected' && APPLIANCE_PROFILES[a.profileId])
      .flatMap((a) =>
        APPLIANCE_PROFILES[a.profileId]!.kitComponents.filter((k: Rec) => !k.optional).map((k: Rec) => ({ ...k, model: a.model })),
      ),
    ventilation: as.flatMap((a) => APPLIANCE_PROFILES[a.profileId]?.ventilation || []),
    front_count: parts.filter((p) => p.materialRole === 'FACADE').length,
    localOpenFields: [],
    releaseOpenFields: open,
    nominalUnknownFields: selected ? thermalUnknown.map((f) => f.field) : ['Точная модель и монтажный комплект'],
    manufacturingQualified: false,
    note: selected
      ? 'Корпус, мебельные фасады, монтажные ниши, опоры и комплектация рассчитаны; габариты техники показаны схематично. Изготовление и подключения требуют проверки.' +
        (thermalUnknown.length ? ' Термостойкость выбранных материалов не подтверждена; инженерная квалификация этого варианта не завершена.' : '')
      : 'Предварительный корпус; модель и монтажные данные не определены.',
  };
}

/** kflowCalculated: the parts of a module before the derived layers (outermost: kap r1.html:77899). */
/**
 * The filler of a run (MOD-DEC-741, MOD-AI-43, FINDINGS 3201): a strip of the board of the body in the plane of the fronts,
 * as the physical filler of the corner cabinet (cornerBaseCalculated), fixed to the neighbour by two SU30M brackets
 * (constructionDerived). The prototype left it a nominal part without a place, and the price of the kitchen unknown.
 */
export function fillerCalculated(s: KitchenScene, m: Rec): Rec {
  const W = m.width,
    H = m.height,
    t = m.panelThickness ?? 16,
    z = -FRONT_CARCASS_GAP;
  if (!finite(W, H, t) || Math.min(W, H, t) <= 0) return { status: 'FAIL', parts: [], note: 'Ширина, высота и толщина добора должны быть больше нуля.' };
  const p = part(s, m, 'Добор', 'physical_corner_filler', [W, H, t], [0, W, 0, H, z - t, z], 'CORPUS', { left: 0, right: 0, top: 0, bottom: bodyEdge(m) });
  p.exportPosition = 1;
  return {
    status: 'GEOMETRY_DRAFT',
    origin: 'PROPOSED',
    family: 'filler_strip',
    clear: null,
    parts: [p],
    body_size_mm: [W, H, t],
    note: 'Добор — полоса плиты корпуса в плоскости фасадов на двух уголках к соседнему корпусу; крепление по месту проверяет мебельщик.',
  };
}

/**
 * The place of a freestanding fridge or cooker (MOD-AI-60, MOD-DEC-752, FINDINGS 3190): an empty space of the width of
 * the appliance and its side gaps, of its height and the gap over it. It has no parts; the appliance is bought apart and
 * is not in the estimate. Its geometry is complete: the size is the user's or the policy's.
 */
export function placeCalculated(m: Rec): Rec {
  const g = m.placeGaps ?? { sideMm: 0, topMm: 0 },
    what = m.appliancePlace === 'fridge' ? 'отдельно стоящий холодильник' : 'отдельно стоящую плиту';
  return {
    status: 'GEOMETRY_DRAFT',
    origin: 'PROPOSED',
    family: 'appliance_place',
    clear: null,
    parts: [],
    body_size_mm: [m.width, m.height, m.depth],
    note: `Место под ${what}: прибор до ${m.width - 2 * g.sideMm} × ${m.height - g.topMm} мм, зазоры ${g.sideMm} мм по бокам и ${g.topMm} мм сверху. Прибор покупается отдельно и в смету не входит; размеры и отступы — по инструкции выбранной модели.`,
  };
}

export function calculated(s: KitchenScene, m: Rec): Rec {
  if (isAppliance(m)) return applianceCalculated(s, m);
  if (isConstruction(m)) return constructionCalculated(s, m);
  return kreCalculated(s, m);
}

/** The card of the module type of a module (standardCard): exported for the derived layers. */
export { standardCard };
