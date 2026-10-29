// Creating and checking a kitchen module (task K3, MIGRATION_PLAN step 4.3; KF-13, KF-14, KF-27). The prototype made a
// module by makeModule (r1.html:68303) wrapped five times (k7 71378, k32 71536, kre 73663, kcr 74061, kap 77406) and
// checked it by validate (r1.html:68165) wrapped seven times (kflow 69842, kp 72409, kn 72847, kcr 75290, khr 79992,
// kr 80870, kcp 82240); its examples bypassed makeModule (resetFixture, r1.html:68368). Here each is one function with
// the layers written out in the prototype's order, and the examples are made by the same function as a palette card.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { Rec } from '../engine/policy/project-state.js';
import examplesData from '../catalog/kitchen/examples.data.json' with { type: 'json' };
import { APPLIANCE_PROFILES, applianceDefaults, calculated, cutoutFamily, ownAppliance, isAppliance, isApplianceBay, isConstruction, isPlace, knAffected, shelfItems, supported } from './carcass.js';
import { derived, nicheSupportPlan, sceneWith } from './derived.js';
import { partConflict } from './collisions.js';
import { sceneTopology } from './worktops.js';
import { activeWalls, bodyDepth, canonicalWall, cornerChoice, cornerChoices, cornerZones, fillerAtDoor, isAccessL, isDiagonal, isFree, isSingleCorner, moduleWorldStart, planRects, wallFiller, wallLength, worldBox, type KitchenScene } from './room.js';
import { KIND_INFO, KITCHEN_CARDS, KITCHEN_MAP, KITCHEN_STANDARD } from './standard.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { jsonClone } from '../engine/json-clone.js';

const K = kitchen.constants;

const clone = jsonClone;
type Rect = { x: number; y: number; w: number; h: number };

/** What the palette knows when a card is taken: the chosen wall, the width of the card, the height of the upper row. */
export interface KitchenCardContext {
  /** The wall the palette shows (kitchenState.wall); the project's or A. */
  wall?: string;
  /** The width chosen on the card (kitchenState.cardWidths[id]). */
  width?: number | null;
  /** The tall cabinet chosen to carry a mezzanine (kitchenState.supportChoice). */
  supportId?: string | null;
  /** A sink or a hob cabinet with the user's own appliance: the cutout of its instruction (MOD-DEC-412). */
  cutout?: KitchenCutout | null;
}

/** The cutout of the user's sink or hob by the instruction of the appliance, mm (MOD-DEC-412); a hob is gas or not. */
export interface KitchenCutout {
  width: number;
  depth: number;
  radius: number;
  gas?: boolean;
}

const TANDEM_DESIGN = { sideThicknessMm: 16, bottomThicknessMm: 16, bottomRecessMm: 13, grooveDepthMm: 6, grooveHeightMm: 16.2 };
const BOTTLE: Rec = { 150: 'STARAX-S2414C-C150-LEFT', 200: 'DUSLAR-MATRIX10030034-C200-LEFT', 300: 'DUSLAR-MATRIX10030035-C300-LEFT' };

// ---------------------------------------------------------------- the single-body corner (MOD-DEC-182)

/** The corner, its wall names, its blind side and its anchor along the wall (alignSingleCorner, r1.html:67931). */
export function alignSingleCorner(s: KitchenScene, m: Rec): Rec {
  if (!isSingleCorner(m)) return m;
  const choices = cornerChoices(s, m.wall);
  if (!m.room_corner_id && choices.length === 1) m.room_corner_id = choices[0]!.id;
  const choice = cornerChoice(s, m);
  m.wall_id = canonicalWall(s, m.wall);
  m.adjacent_wall_id = choice ? canonicalWall(s, choice.adjacent) : null;
  m.cornerSide = choice?.anchor === 'start' ? 'left' : choice?.anchor === 'end' ? 'right' : null;
  m.pos = choice && Number.isFinite(m.width) && Number.isFinite(m.filler_width_mm) ? (choice.anchor === 'start' ? wallFiller(m) : wallLength(s, m.wall) - m.width - wallFiller(m)) : NaN;
  return m;
}

/** The proposed single-body corner (cornerProposed, r1.html:67942): its gaps are the fronts' gaps of 124 and FINDINGS 55. */
function cornerProposed(s: KitchenScene, m: Rec): Rec {
  const upper = m.kind === 'upper';
  m.schema_version = 2;
  m.frontSeam = s.proposed.frontSeam ?? 3;
  m.gapMode = 'manual';
  m.gapLeft = m.gapRight = 1.5;
  m.gapTop = m.gapBottom = s.proposed.outerGap;
  m.hingeSide = 'left';
  // MOD-DEC-566 п. 6 (FINDINGS 1274): the body at the adjacent wall; its blind part is the depth of the adjacent row with
  // its front — the reserve r = 2 + 18 is that front; the prototype took 300 / 400 — and the filler stands at the door,
  // so the door opens past the fronts of the adjacent row.
  m.blind_nominal_mm = m.depth + 20;
  // R4-006 (FINDINGS 1903): the filler set for the whole kitchen, 50 / 30 of MOD-DEC-565 п. 11 by default.
  m.filler_width_mm = upper ? (s.kitchenOptions?.upperFillerMm ?? 30) : (s.kitchenOptions?.lowerFillerMm ?? 50);
  m.perpendicular_clearance_mm = 20;
  m.fillerAtDoor = true;
  m.cornerReturn = undefined;
  m.room_corner_id = null;
  return alignSingleCorner(s, m);
}

// ---------------------------------------------------------------- one path of creation

/**
 * A new module of a palette card (makeModule with its layers, r1.html:68303–77410): the base record of the card and
 * its kind, then in the prototype's order the r7 fasteners (k7), the System 32 provenance (k32), the TANDEM drawers
 * and the SAH216 hanger (kre), the constructions (kcr) and the appliances (kap). The record is the prototype's
 * byte for byte; the overrides are the base record's.
 */
export function makeKitchenModule(s: KitchenScene, cardId: string, ctx: KitchenCardContext = {}, overrides: Rec = {}): Rec {
  const S = s as Rec,
    c = KITCHEN_CARDS[cardId] || KITCHEN_CARDS.filler!,
    k = KIND_INFO[c.kind]!,
    floor = optionFloor(s, c.kind, k.floor),
    // MOD-DEC-566 п. 6 (FINDINGS 1274): a new straight corner is wide enough for its blind part, filler and a door of 600.
    width = ctx.width || (c.corner === 'direct' ? K.directCornerWidth.value[c.kind as 'base' | 'upper'] : c.width) || S.defaultWidth || 600,
    support = s.modules.find((m) => m.id === ctx.supportId && m.kind === 'tall'),
    // MOD-DEC-566 п. 7 (FINDINGS 1278): a mezzanine over a tall cabinet is as deep as the cabinet, its front in one line.
    extra = c.requiresSupport && support ? { supportId: support.id, wall: support.wall, pos: support.pos, width: support.width, floor: support.floor + support.height, depth: support.depth } : {};
  let m: Rec = {
    ...clone(c),
    moduleTypeId: KITCHEN_MAP[cardId]?.moduleTypeId || 'FILLER',
    id: 'preview',
    catalogId: cardId,
    kind: c.kind,
    name: c.name,
    wall: c.kind === 'island' ? null : (ctx.wall ?? S.wall ?? 'A'),
    pos: 0,
    zone: c.kind === 'island' ? 'island' : 'wall',
    x: 900,
    y: 1000,
    rotation: 0,
    width,
    depth: k.depth,
    // MOD-DEC-567 (Д): a new tall cabinet ends at the top of the wall cabinets, not at the 2140 of kindInfo (FINDINGS 1270).
    height: c.kind === 'upper' ? (S.upperHeight ?? 720) : c.kind === 'tall' ? upperTop(s) - floor : k.height,
    floor,
    row: k.row,
    panelThickness: 16,
    upperOverride: false,
    backSide: false,
    rearDepth: null,
    pairId: null,
    serviceGap: 40,
    decorBack: false,
    endPanels: false,
    openEndShelves: false,
    fill: clone(c.fill || {}),
    ...extra,
    ...overrides,
  };
  if (m.corner === 'direct') m = cornerProposed(s, m);
  // R4-006 (FINDINGS 1903): the worktop depth set for the whole kitchen; unset — 600 of MOD-DEC-565.
  if (s.kitchenOptions?.worktopDepthMm && ['base', 'island', 'niche'].includes(m.kind)) m.worktopDepth = s.kitchenOptions.worktopDepthMm;
  // MOD-DEC-566 п. 7 (FINDINGS 1275): a new floor cabinet under the worktop has one shelf, room for tall pots.
  if (['base', 'island'].includes(m.kind) && m.fill.shelves === 2) m.fill.shelves = kitchen.constants.baseShelfCount.value;
  // MOD-DEC-566 п. 7 (FINDINGS 1277): the door of a new tall cabinet over 2 m is two doors, split at the wall cabinets.
  if (['KT_SHELVES', 'KT_UTILITY'].includes(m.moduleTypeId)) m.tallDoorSplit = true;
  // MOD-DEC-566 п. 7 (FINDINGS 1610): a new mezzanine over a tall cabinet stands on it, joined to it by connectors.
  if (m.kind === 'mezz' && c.requiresSupport) m.onTall = true;
  // MOD-DEC-566 п. 7 (FINDINGS 1279): a new hood cabinet as the Bosch sheet asks — a shelf over the hood, the cut-out
  // for the pipe and a door over its housing; the prototype had the sides and the top alone.
  if (m.moduleTypeId === 'KW_HOOD') m.hoodFit = true;
  // k7 (r1.html:71379): a new module is fastened by the r7 plan.
  if (!isSingleCorner(m)) m.fastenersR7 = { enabled: true, records: {}, newModuleDefault: true };
  // MOD-DEC-566 п. 1: a new floor carcass under the worktop has two rails instead of a solid top (FINDINGS 1263).
  if (['base', 'island'].includes(m.kind)) m.topConstruction = 'RAILS';
  // MOD-DEC-566 п. 2: the back of a new carcass stands in a quarter, as in the wardrobe (FINDINGS 1269).
  if (['base', 'island', 'upper', 'tall', 'mezz'].includes(m.kind)) m.backConstruction = 'REBATE';
  // k32 (r1.html:71537): a new module is on the System 32 grid; its shelves are removable.
  if (supported(m) && !isSingleCorner(m)) {
    m.system32Provenance = 'NEW_MODULE';
    if (m.id !== 'preview') m.shelfItems = shelfItems(m).map((x) => ({ ...x, fixed: false, profileReadiness: 'UNBOUND: existing SEKURA6 axis -8 known; node binding absent; machining UNKNOWN' }));
  }
  // kre (r1.html:73664): the TANDEM box of the drawers and the hanger of a wall cabinet. MOD-DEC-514 (FINDINGS 1863): the
  // drawers of a new module stand on the runner of the level with the box of its kit; the stack keeps the layout of kre.
  if (m.moduleTypeId === 'KB_DRAWERS') {
    m.drawerProfile = 'BLUM-TANDEM560H5000B-WOOD16';
    m.drawerDesign = { ...TANDEM_DESIGN };
    m.drawerRunner = 'level';
  }
  // MOD-DEC-413 ((Д) Директора 2026-10-29, FINDINGS 2754): a new wall cabinet hangs on the hanger of the level of its
  // BAZIS kit (kitchen/hanger.ts); SAH 216 stays in the record of kre, as the TANDEM of the drawers. A mezzanine on its
  // tall cabinet stands on it (MOD-DEC-566 п. 7) and does not hang; a diagonal or an L corner has no sides and top of a
  // rectangular carcass for the holes of the kit and keeps SAH 216, as the corners do (FINDINGS 2754).
  if (['upper', 'mezz'].includes(m.kind) && m.depth <= 400 && m.height > m.depth && !isSingleCorner(m)) {
    m.hangerVariant = 'TECHR3-SAH216-BACK-RECESS16';
    m.hangerProfile = 'HETTICH-SAH216-AHS-B16';
    if (!m.onTall && !isDiagonal(m) && !isAccessL(m)) m.hanger = 'level';
  }
  // MOD-DEC-413 ((Д) Директора 2026-10-29, FINDINGS 3350): the front of a new module that opens upwards is lifted by the
  // lift of the level chosen in the panel «Фасады» (kitchen/lift.ts) — МДМ FLAP on hinges in the top, or HK-S.
  if (m.moduleTypeId === 'KM_LIFT') m.lift = 'level';
  // kcr (r1.html:74062): supports, feet and the record of each construction.
  m.shelfSupportProfile = 'HETTICH-SEKURA6-79707';
  if (['upper', 'mezz'].includes(m.kind) && m.depth <= 400 && m.height > m.depth) {
    m.hangerVariant = 'TECHR3-SAH216-BACK-RECESS16';
    m.hangerProfile = 'HETTICH-SAH216-AHS-B16';
  }
  if (m.kind === 'niche' && m.pos === 0) m.pos = 18;
  if (['base', 'tall', 'island', 'filler'].includes(m.kind) && m.floor > 0) m.supportKit = '9028286';
  // MOD-DEC-566 п. 4 (FINDINGS 1272): a new module on a wall stands in one plinth with its row, a tall cabinet too.
  const run = ['base', 'tall', 'filler'].includes(m.kind) && m.floor > 0 && !isFree(m) && !isSingleCorner(m) && !isAccessL(m) && !isDiagonal(m);
  if (m.kind === 'tall') m.floorFinish = run ? 'PLINTH' : 'OPEN_SUPPORTS';
  if (run) m.plinthRun = true;
  if (['KB_COMBINED', 'KT_COMBINED'].includes(m.moduleTypeId) || m.catalogId === 'island-drawers') {
    m.drawerProfile = 'BLUM-TANDEM560H5000B-WOOD16';
    m.drawerDesign = { ...TANDEM_DESIGN };
    m.drawerRunner = 'level';
  }
  if (m.moduleTypeId === 'KB_COMBINED') {
    m.shelfItems = null;
    m.combinedDrawerCount = 1;
  }
  if (m.moduleTypeId === 'KT_COMBINED') {
    m.combinedDrawerCount = 4;
    m.drawerTop = 900;
    m.shelfItems = null;
  }
  if (m.moduleTypeId === 'KW_GLASS') {
    // MOD-DEC-566 п. 7 (FINDINGS 1282): a new display cabinet has framed doors, a wooden frame 18 mm with glass 6 mm
    // (kcrGlass's own frame); the prototype's card made bare glass doors 6 mm.
    m.glassVariant = 'wood-frame';
    m.frontThickness = 18;
    m.glassThicknessMm = 6;
    m.fill.shelves = 2;
    m.shelfItems = null;
  }
  if (m.moduleTypeId === 'KW_DRYER') {
    // MOD-DEC-566 п. 7 (FINDINGS 1276): the dryer cabinet is as high as its row, open below for the dryer of 700 inside;
    // the prototype made it 736, out of the line of the row.
    m.dryerBottom = 'OPEN';
    m.dryerProfile = 'FISSO-DUSLAR10030001-C600';
    m.dryerLevels = [96, 466];
    m.plateHeightMm = 320;
    m.cupHeightMm = 160;
    m.shelfItems = [];
    m.fill.shelves = 0;
  }
  if (m.moduleTypeId === 'KB_BOTTLE') {
    m.bottleProfile = BOTTLE[m.width];
    m.shelfItems = [];
    m.fill.shelves = 0;
    m.bottomThicknessMm = 35;
  }
  if (isAccessL(m)) {
    // MOD-DEC-566 п. 7 (FINDINGS 1281): the fronts of a new accessible L corner are as thick as those of the kitchen —
    // its hinges take 15–23 mm by Blum KA-150; the prototype fixed 19.
    m.frontThicknessFromKitchen = true;
    m.fill.shelves = 1;
    m.shelfItems = null;
    m.cornerFrontVariant = 'bifold';
  }
  if (isDiagonal(m)) {
    // MOD-DEC-566 п. 7 (FINDINGS 1611): a new diagonal corner is of the kitchen's boards, its front as thick as the
    // kitchen's, on the angled hinge Hettich Sensys W45 for fronts of 15–28; the prototype fixed 19 / 19 for Blum 79B3558.
    m.frontThicknessFromKitchen = true;
    m.frontGap = 3.5;
    m.fill.shelves = 1;
    m.shelfItems = null;
  }
  // MOD-AI-60, MOD-DEC-752 (FINDINGS 3190): the place of a freestanding fridge or cooker stands on the floor, as high
  // as its appliance and the gap over it; no worktop and no plinth go over it, the fridge's place takes both rows.
  if (m.kind === 'place') {
    const a = kitchen.constants.appliancePlace.value[m.appliancePlace as 'fridge' | 'cooker'];
    Object.assign(m, { height: c.height, floor: 0, row: m.appliancePlace === 'fridge' ? 'both' : 'base', placeGaps: { sideMm: a.sideGapMm, topMm: a.topGapMm }, worktopEnabled: false, plinthEnabled: false });
  }
  if (isFree(m)) {
    m.skinThicknessMm = 18;
    m.openEndWidthMm = 200;
    m.plinthEnabled = true;
  }
  // kap (r1.html:77407, kapAssign 77348): the appliance of the cabinet and what it fixes of the cabinet.
  if (isAppliance(m)) applianceAssign(s, m);
  if (ctx.cutout && cutoutFamily(m)) withCutout(m, ctx.cutout);
  // MOD-DEC-566 п. 3: the feet of a new module stand right in its bottom, their blocks on dowels (FINDINGS 1271).
  if (m.supportKit === '9028286') m.footMount = 'DOWELS';
  // MOD-DEC-565: a mezzanine stands on the cabinets under it, not at the 2100 of kindInfo (FINDINGS 1181).
  return seatMezzanine(s, m);
}

/**
 * A sink or a hob cabinet takes the user's own appliance by the cutout of its instruction, or — the cutout removed —
 * the model of its card again (MOD-DEC-412, FINDINGS 3106). The module is changed in place; the check is the caller's.
 */
export function withCutout(m: Rec, cutout: KitchenCutout | null): Rec {
  if (!cutout) {
    delete m.cutout;
    m.appliances = applianceDefaults(m);
    m.worktopSpanWidth = cutoutFamily(m) === 'sink' ? Math.max(m.width, 655) : Math.max(m.width, 600);
  } else {
    m.cutout = { width: cutout.width, depth: cutout.depth, radius: cutout.radius, ...(cutout.gas === undefined ? {} : { gas: cutout.gas }) };
    m.appliances = ownAppliance(m);
  }
  m.applianceModel = m.appliances[0]?.model || null;
  m.applianceMode = cutout ? 'own' : m.appliances.every((a: Rec) => a.mode === 'selected') ? 'selected' : 'preliminary';
  return m;
}

function applianceAssign(s: KitchenScene, m: Rec): Rec {
  m.appliances = applianceDefaults(m);
  m.applianceModel = m.appliances[0]?.model || null;
  m.applianceMode = m.appliances.every((a: Rec) => a.mode === 'selected') ? 'selected' : 'preliminary';
  m.shelfItems = [];
  m.fill = { ...m.fill, shelves: 0 };
  const p = APPLIANCE_PROFILES[m.appliances[0]?.profileId];
  if (!p) return m;
  const c = p.cabinetDefaults;
  if (c.depth) m.depth = c.depth;
  // MOD-DEC-566 п. 5 (FINDINGS 1273): the niche of a dishwasher is as deep as the row (560 ≥ its niche of 550), its front
  // in the line of the neighbours: 2 mm under the worktop as theirs, not 4.
  if (p.family === 'dishwasher') {
    m.depth = KIND_INFO.base!.depth;
    m.applianceFrontTopGap = 2;
    // MOD-DEC-566 п. 4 (FINDINGS 1280): the plinth of the row passes before the machine, on its brackets.
    m.plinthOnAppliance = true;
  }
  if (['dishwasher', 'washer'].includes(p.family)) {
    m.floor = 0;
    // R4-006 (FINDINGS 1903): the niche under the worktop is as high as its row on the supports of the kitchen.
    m.height = c.height + optionFloor(s, 'base', KIND_INFO.base!.floor) - KIND_INFO.base!.floor;
    m.appliances = applianceDefaults(m);
    m.supportKit = null;
    m.frontEnabled = true;
  }
  if (p.family === 'coffee') {
    m.appliances[0].nicheBottomZ = 950 - (m.floor || 0);
    if (!isFree(m)) m.pos = Math.max(m.pos || 0, 350);
  }
  if (['sink', 'hob'].includes(p.family)) {
    // The prototype wrote worktopDepth 620 here; the depth of the worktop is the kitchen's (MOD-DEC-565, FINDINGS 1180).
    m.worktopThickness = 38;
    m.worktopSpanWidth = p.family === 'sink' ? Math.max(m.width, 655) : Math.max(m.width, 600);
  }
  return m;
}

/**
 * The appliance of a cabinet whose width changed (MOD-AI-58, FINDINGS 3112): the card puts the model of its width
 * (an oven of 450 or 600, a dishwasher of 450 or 600), so a changed width takes the model of the new width — as a new
 * module of that width would have it, with what the model fixes of the cabinet (the depth of the oven of 450 is 600).
 * A module whose appliances are not those of the card for its width keeps them. The prototype kept the model and
 * refused «Модель не подходит выбранной карточке или ширине».
 */
export function applianceForWidth(s: KitchenScene, before: Rec, m: Rec): Rec {
  if (!isAppliance(m) || before.width === m.width) return m;
  const ids = (x: Rec) => applianceDefaults(x).map((a) => a.profileId).join(),
    kept = Array.isArray(before.appliances) ? before.appliances.map((a: Rec) => a.profileId).join() : ids(before);
  if (kept !== ids(before) || ids(m) === ids(before)) return m;
  const c = clone(m);
  c.depth = KIND_INFO[c.kind]?.depth ?? c.depth;
  return applianceAssign(s, c);
}

/** The widths a card offers (its `choices`), said after a refusal of a width (MOD-AI-58, FINDINGS 3112); '' — none. */
export function cardWidthsHint(m: Rec): string {
  const c = KITCHEN_CARDS[m.catalogId];
  return Array.isArray(c?.choices) && c.choices.length > 1 ? ` Ширина модуля «${c.name}» — ${c.choices.slice(0, -1).join(', ')} или ${c.choices.at(-1)} мм.` : '';
}

const NUMERIC = ['pos', 'width', 'x', 'y', 'blind_nominal_mm', 'filler_width_mm', 'perpendicular_clearance_mm'];
const numeric = (v: unknown): number => (v === '' || v === null || v === undefined ? NaN : Number(v));

/** One field of the placement dialog of a new module (the draft-* handler, r1.html:69591); returns a new record. */
export function placeDraft(s: KitchenScene, draft: Rec, field: string, value: unknown): Rec {
  const m = clone(draft);
  if (field === 'support') {
    const t = s.modules.find((x) => x.id === value && x.kind === 'tall');
    m.supportId = value;
    if (t) Object.assign(m, { wall: t.wall, pos: t.pos, width: t.width, floor: t.floor + t.height, depth: t.depth });
  } else if (isSingleCorner(m) && field === 'wall') {
    m.wall = value;
    m.room_corner_id = null;
    alignSingleCorner(s, m);
  } else if (isSingleCorner(m) && field === 'room_corner_id') {
    m.room_corner_id = value || null;
    alignSingleCorner(s, m);
  } else {
    m[field] = NUMERIC.includes(field) ? numeric(value) : value;
    if (isSingleCorner(m)) alignSingleCorner(s, m);
  }
  return field === 'wall' || field === 'pos' || field === 'width' ? seatMezzanine(s, m) : m;
}

// ---------------------------------------------------------------- one check

export type KitchenVerdict = { ok: boolean; text: string };
const no = (text: string): KitchenVerdict => ({ ok: false, text });

/** The plan rectangles a module occupies: the corner with its filler and its empty reserve (collisionRects, r1.html:68142). */
export function collisionRects(s: KitchenScene, m: Rec): Rect[] {
  if (isSingleCorner(m)) {
    const z = cornerZones(s, m);
    return [z.body, z.filler, z.reserve].filter((x) => x && x.w > 0 && x.h > 0);
  }
  const rects: Rect[] = planRects(s, m),
    plan = nicheSupportPlan(s, m);
  // kcr (r1.html:76169): the 18 mm end panel that carries the worktop over a dishwasher or washer niche.
  if (plan)
    for (const [mode, x] of [
      [plan.left, -18],
      [plan.right, m.width],
    ] as [string, number][])
      if (mode === 'end-panel') {
        const b = worldBox(s, m, [x, x + 18, 0, 0, 0, bodyDepth(m)]);
        rects.push({ x: b[0], y: b[4], w: b[1] - b[0], h: b[5] - b[4] });
      }
  return rects;
}
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (s: KitchenScene, b: Rect) => b.x >= 0 && b.y >= 0 && b.x + b.w <= s.room.width && b.y + b.h <= s.room.depth;
/** How far a plan rectangle reaches past the walls of the room, mm; 0 — inside. */
const pastRoom = (s: KitchenScene, b: Rect) => Math.max(0, -b.x, -b.y, b.x + b.w - s.room.width, b.y + b.h - s.room.depth);
const CORNER_ZONE_RU = { body: 'Корпус', filler: 'Добор', reserve: 'Резерв у соседней стены' } as const;

/**
 * The refusal of a module whose plan leaves the room (R6-006 of the pilot, FINDINGS 2928). r1 said «Модуль, добор или
 * резерв выходит за пределы помещения» and named neither what nor how far; the core names the rectangle and the length,
 * and for a niche without a carcass of its height beside it — the support panel of 18 mm that carries the worktop on
 * that side (kcr, r1.html:76169), the width of the niche with it and what frees the place. null — inside the room.
 */
function outOfRoomText(s: KitchenScene, m: Rec): string | null {
  const rects = collisionRects(s, m),
    b = rects.find((r) => !inside(s, r));
  if (!b) return null;
  const by = Math.ceil(pastRoom(s, b) - 1e-6),
    name = `«${m.name}»`;
  if (isSingleCorner(m)) {
    const z = cornerZones(s, m) as Rec,
      zone = (['body', 'filler', 'reserve'] as const).find((k) => z[k] === b) ?? 'body';
    return `${CORNER_ZONE_RU[zone]} углового модуля ${name} выходит за пределы помещения на ${by} мм.`;
  }
  const plan = rects.indexOf(b) >= planRects(s, m).length ? nicheSupportPlan(s, m) : null;
  if (!plan) return `Модуль ${name} выходит за пределы помещения на ${by} мм.`;
  return (
    `Опорная боковая панель 18 мм ниши ${name} выходит за пределы помещения на ${by} мм. ` +
    `С этой стороны у ниши нет корпуса той же высоты, и столешницу несёт эта панель: с панелями ниша занимает ${plan.finishedOutsideWidthMm} мм. ` +
    `Освободите ещё ${by} мм вдоль стены или поставьте нишу между корпусами той же высоты.`
  );
}
const heightsOverlap = (a: Rec, b: Rec) => a.floor < b.floor + b.height && b.floor < a.floor + a.height;
const overlap = (s: KitchenScene, a: Rec, b: Rec) => collisionRects(s, a).some((x) => collisionRects(s, b).some((y) => intersects(x, y)));

/**
 * The words of an overlap of two modules (MOD-AI-48, FINDINGS 3111): the neighbour by name and id, by how much along
 * the wall, and — when the bodies do not meet, only the 18 mm end panel of a dishwasher or washer niche (kcr,
 * r1.html:76169) — that panel, so a niche placed 18 mm off a tall cabinet is understood. The prototype said only
 * «Геометрическое пересечение с «…». Сосед остаётся на месте.»
 */
function overlapText(s: KitchenScene, m: Rec, o: Rec): string {
  const meet = (a: Rect[], b: Rect[]) => a.filter((x) => b.some((y) => intersects(x, y))),
    alongX = m.wall === 'A',
    depth = Math.max(
      0,
      ...meet(collisionRects(s, m), collisionRects(s, o)).flatMap((x) =>
        meet(collisionRects(s, o), [x]).map((y) => (alongX ? Math.min(x.x + x.w, y.x + y.w) - Math.max(x.x, y.x) : Math.min(x.y + x.h, y.y + y.h) - Math.max(x.y, y.y))),
      ),
    ),
    by = m.wall && o.wall === m.wall && depth > 0 ? ` на ${Math.round(depth * 10) / 10} мм вдоль стены` : '';
  let why = '';
  if (!meet(planRects(s, m), planRects(s, o)).length) {
    const niche = meet(collisionRects(s, m), planRects(s, o)).length ? m : o;
    why = ` Корпуса не пересекаются: у ниши «${niche.name}» со стороны, где соседний модуль не несёт столешницу, стоит её опорная панель 18 мм, и ниша встаёт на 18 мм дальше от соседа.`;
  }
  return `Геометрическое пересечение с «${o.name}» (${o.id})${by}. Сосед остаётся на месте.${why}`;
}

/** A full-height opening measured on a wall (FULL_OPENING, r1.html:67080). */
export const FULL_OPENING = 'Проём на всю высоту (замерен)';
export const isPhysicalObstacle = (o: Rec): boolean => o.type === FULL_OPENING;
/**
 * A measured «Окно» and a protrusion of a wall the user measured: the bottom (`floor`) and the `height` of the stretch, mm from
 * the floor. The prototype had no such marks: every mark but the full opening was «высота ?» (В, FINDINGS 660).
 */
export const MEASURED_WINDOW = 'Окно (замерено)';
export const MEASURED_PROTRUSION = 'Выступ стены (замерен)';
/** A gas water heater on the wall, its bottom and height measured: it blocks the modules at its height (MOD-AI-60, FINDINGS 3153). */
export const MEASURED_GAS_HEATER = 'Газовая колонка (замерена)';
export const isMeasuredObstacle = (o: Rec): boolean => o.type === MEASURED_WINDOW || o.type === MEASURED_PROTRUSION || o.type === MEASURED_GAS_HEATER;
/** The name of a measured mark in a refusal. */
const measuredName = (o: Rec): string => (o.type === MEASURED_WINDOW ? 'Окно' : o.type === MEASURED_GAS_HEATER ? 'Газовая колонка' : 'Выступ стены');
/** The heights a mark of a wall takes, mm from the floor: the full opening — the room, a measured one — its own, the rest unknown. */
export function obstacleHeights(s: KitchenScene, o: Rec): [number, number] | null {
  if (isPhysicalObstacle(o)) return [0, s.room.height];
  return isMeasuredObstacle(o) ? [o.floor, o.floor + o.height] : null;
}
/** A measured mark meets the module in height: the module may not stand on its stretch (В, FINDINGS 660). */
export const measuredMeets = (o: Rec, m: Rec): boolean => isMeasuredObstacle(o) && o.floor < m.floor + m.height && m.floor < o.floor + o.height;
const intervalOverlap = (a: Rec, b: Rec) => a.pos < b.pos + b.width && b.pos < a.pos + a.width;

/** The segments the single-body corner takes along a wall: body and filler, or depth and reserve (cornerRowSegments, r1.html:68010). */
export function cornerRowSegments(s: KitchenScene, m: Rec, wall: string): Rec[] {
  const c = cornerChoice(s, m);
  if (!c) return [];
  const L = wallLength(s, wall),
    q = m.filler_width_mm,
    D = m.depth,
    r = m.perpendicular_clearance_mm;
  if (wall === m.wall && fillerAtDoor(m)) return [{ id: m.id + ':body', kind: 'corner_body', pos_mm: c.anchor === 'start' ? 0 : L - m.width, width_mm: m.width }];
  if (wall === m.wall)
    return c.anchor === 'start'
      ? [
          { id: m.id + ':filler', kind: 'physical_filler', pos_mm: 0, width_mm: q },
          { id: m.id + ':body', kind: 'corner_body', pos_mm: q, width_mm: m.width },
        ]
      : [
          { id: m.id + ':body', kind: 'corner_body', pos_mm: L - m.width - q, width_mm: m.width },
          { id: m.id + ':filler', kind: 'physical_filler', pos_mm: L - q, width_mm: q },
        ];
  if (wall !== c.adjacent) return [];
  const a = cornerChoices(s, wall).find((x) => x.id === c.id)?.anchor;
  return a === 'start'
    ? [
        { id: m.id + ':body_depth', kind: 'corner_depth_projection', pos_mm: 0, width_mm: D },
        { id: m.id + ':clearance', kind: 'EMPTY_RESERVED_SPACE', pos_mm: D, width_mm: r },
      ]
    : [
        { id: m.id + ':clearance', kind: 'EMPTY_RESERVED_SPACE', pos_mm: L - D - r, width_mm: r },
        { id: m.id + ':body_depth', kind: 'corner_depth_projection', pos_mm: L - D, width_mm: D },
      ];
}
/**
 * A mezzanine on a wall stands right on the cabinets under it (MOD-DEC-565, FINDINGS 1181): its bottom is the highest top
 * of the wall cabinets and tall cabinets along its width, with none under it the top of a new wall cabinet. The
 * prototype put it at 2100 (kindInfo), 20 mm into a wall cabinet of 720 mm at 1400. A mezzanine over its tall cabinet
 * (supportId) already stands on it; a free module has no wall.
 */
export function seatMezzanine(s: KitchenScene, m: Rec): Rec {
  if (m.kind !== 'mezz' || m.supportId || isFree(m) || !m.wall) return m;
  const a = moduleWorldStart(s, m),
    b = a + m.width,
    tops = s.modules
      .filter((n) => n.id !== m.id && (n.kind === 'upper' || n.kind === 'tall'))
      .filter((n) =>
        (isSingleCorner(n)
          ? cornerRowSegments(s, n, m.wall).filter((x) => x.kind !== 'EMPTY_RESERVED_SPACE').map((x) => [x.pos_mm as number, (x.pos_mm as number) + (x.width_mm as number)])
          : n.wall === m.wall && !isFree(n)
            ? [[moduleWorldStart(s, n), moduleWorldStart(s, n) + n.width]]
            : []
        ).some(([lo, hi]) => lo! < b && a < hi!),
      )
      .map((n) => n.floor + n.height);
  return { ...m, floor: tops.length ? Math.max(...tops) : upperTop(s) };
}

/** The top line of the wall row: the bottom of a new wall cabinet and the height of the kitchen's wall cabinets (MOD-DEC-567). */
export const upperTop = (s: KitchenScene): number => optionFloor(s, 'upper', KIND_INFO.upper!.floor) + ((s as Rec).upperHeight ?? KIND_INFO.upper!.height);

/**
 * The bottom of a new module of a kind by the settings of the whole kitchen (R4-006, FINDINGS 1903): a floor cabinet on
 * the supports — their height, a wall cabinet — the bottom of the wall cabinets; otherwise, or unset, `floor`.
 */
export function optionFloor(s: KitchenScene, kind: string, floor: number): number {
  const o = s.kitchenOptions;
  if (kind === 'upper') return o?.upperFloorMm ?? floor;
  return ['base', 'tall', 'island', 'filler'].includes(kind) && floor > 0 ? (o?.legHeightMm ?? floor) : floor;
}
export const obstacleTouches = (s: KitchenScene, o: Rec, m: Rec): boolean =>
  isSingleCorner(m) ? cornerRowSegments(s, m, o.wall).some((x) => intervalOverlap(o, { pos: x.pos_mm, width: x.width_mm })) : o.wall === m.wall && intervalOverlap(o, { pos: moduleWorldStart(s, m), width: m.width });

/**
 * The first layer of validateKitchenModule alone: the room, the sizes and the collisions in the plan (placement), no
 * calculation of the module and of the scene. A refusal here is the refusal of the whole check, with its words; null
 * says only that the rest of the check is still to be done. The preview of a drag asks it while the pointer moves.
 */
export function kitchenPlacementVerdict(s0: KitchenScene, m: Rec, excludeId: string | null = null): KitchenVerdict | null {
  const s: KitchenScene = { ...s0, modules: s0.modules.some((x) => x.id === m.id) ? s0.modules.map((x) => (x.id === m.id ? m : x)) : [...s0.modules, m] };
  return placement(s, m, excludeId ?? m.id);
}
/** The placement of a module in the room and among the others (validate, r1.html:68165). */
function placement(s: KitchenScene, m: Rec, excludeId: string | null): KitchenVerdict | null {
  const S = s as Rec;
  if (!s.roomConfirmed || !S.typeConfirmed) return no('Сначала подтвердите размеры помещения и явно выберите тип кухни.');
  if (m.wall && m.zone !== 'island' && m.zone !== 'peninsula' && m.rotation && m.rotation !== 0) return no('Поворот пристенного модуля пока не поддерживается; положение сохранено.');
  if (isSingleCorner(m)) {
    const c = cornerChoice(s, m),
      t = m.panelThickness ?? 16,
      g = s.proposed.outerGap,
      seam = KITCHEN_STANDARD.defaults.front_internal_seam_mm!.value,
      e = KITCHEN_STANDARD.defaults.edge_thickness_mm!.value,
      B = m.blind_nominal_mm,
      q = m.filler_width_mm,
      r = m.perpendicular_clearance_mm;
    if (!c) return no('Выберите внутренний угол этой стены явно; неоднозначное примыкание не угадано.');
    if (m.wall_id !== canonicalWall(s, m.wall) || m.adjacent_wall_id !== canonicalWall(s, c.adjacent) || m.cornerSide !== (c.anchor === 'start' ? 'left' : 'right')) return no('Связь стены, угла и глухой стороны противоречива.');
    if (![B, q, r, t, g, seam].every(Number.isFinite) || q <= 0 || r < 0 || t <= 0 || B <= g + 2 * e || m.width - B - (fillerAtDoor(m) ? q : 0) - seam - g <= 2 * e || m.width - B - t <= 0 || m.width <= 2 * t || m.height <= 2 * t || m.depth <= 3)
      return no('Глухая зона, дверь, добор или резерв не согласованы с габаритом корпуса.');
    if (m.pos !== (c.anchor === 'start' ? wallFiller(m) : wallLength(s, m.wall) - m.width - wallFiller(m)) || m.width + wallFiller(m) > wallLength(s, m.wall) || m.depth + r > wallLength(s, c.adjacent))
      return no('Корпус и добор должны быть привязаны к выбранному углу без выхода за пределы стен.');
  } else if (m.corner && (m.width <= m.depth + (m.panelThickness || 16) || m.cornerReturn <= m.depth + (m.panelThickness || 16))) return no('Проекции угла должны превышать глубину плеча и толщину панели 16 мм.');
  if (['width', 'depth', 'height', 'floor'].some((k) => !Number.isFinite(m[k])) || m.width <= 0 || m.depth <= 0 || m.height <= 0 || m.floor < 0 || m.floor + m.height > s.room.height) return no('Проверьте размеры, высоту и отметку от пола.');
  if (isFree(m)) {
    if (![0, 90, 180, 270].includes(m.rotation || 0)) return no('Поворот острова допускает 0/90/180/270°.');
    if (!S.islandEnabled) return no('Включите «Остров» для островных и полуостровных модулей.');
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return no('Укажите координаты внутри помещения.');
    if (m.rearDepth != null && (!Number.isFinite(m.rearDepth) || m.rearDepth <= 0 || m.rearDepth >= m.depth)) return no('Уменьшенная глубина должна быть больше нуля и меньше глубины корпуса.');
    if (m.pairId) {
      const partner = s.modules.find((x) => x.id === m.pairId && x.id !== m.id && x.zone === 'island');
      if (!partner) return no('Обратный корпус пары должен быть отдельным существующим островным модулем.');
      const gap = m.serviceGap ?? 40,
        a = planRects(s, m)[0]!,
        b = planRects(s, partner)[0]!,
        turn = (m.rotation || 0) % 180 !== 0,
        aligned = turn ? a.y === b.y && a.h === b.h && b.x === a.x + a.w + gap : a.x === b.x && a.w === b.w && b.y === a.y + a.h + gap;
      if (!Number.isFinite(gap) || gap < 0 || !aligned) return no('Пара спина к спине: совпадающая ось и ширина, затем явный сервисный зазор. Исправьте положение второго корпуса.');
    }
  } else {
    if (!activeWalls(s).includes(m.wall)) return no('Выберите доступную стену.');
    // MOD-AI-11 (FINDINGS 3110): the refusal says by how much; the prototype said only that the module is out of the wall.
    if (!Number.isFinite(m.pos) || m.pos < 0 || m.pos + m.width > wallLength(s, m.wall)) {
      const over = !Number.isFinite(m.pos) ? null : m.pos < 0 ? -m.pos : m.pos + m.width - wallLength(s, m.wall);
      return no(`Модуль выходит за пределы стены ${canonicalWall(s, m.wall)}${over !== null ? ` на ${Math.round(over * 10) / 10} мм` : ''}. Опорная граница остаётся на месте.`);
    }
  }
  const out = outOfRoomText(s, m);
  if (out) return no(out);
  if (m.requiresSupport && !m.supportId) return no('Явно выберите опорный пенал в палитре или диалоге.');
  if (m.supportId) {
    const t = s.modules.find((x) => x.id === m.supportId && x.kind === 'tall');
    if (!t) return no('Выберите существующий пенал в качестве опоры.');
    if (m.wall !== t.wall || m.pos !== t.pos || m.width !== t.width || m.floor < t.floor + t.height) return no('Антресоль должна оставаться над выбранным пеналом.');
  }
  for (const o of s.modules) {
    if (o.id === m.id || o.id === excludeId) continue;
    if (heightsOverlap(m, o) && overlap(s, m, o)) return no(overlapText(s, m, o));
  }
  if (m.wall) for (const o of s.obstacles) if (isPhysicalObstacle(o) && obstacleTouches(s, o, m)) return no('Замеренный проём во всю высоту блокирует корпус, добор или резерв.');
  if (m.wall)
    for (const o of s.obstacles)
      if (measuredMeets(o, m) && obstacleTouches(s, o, m))
        return no(`${measuredName(o)} на высоте ${o.floor}–${o.floor + o.height} мм блокирует корпус, добор или резерв на стене ${canonicalWall(s, o.wall)}.`);
  return null;
}

/** The modules with drawers on runners (MOD-AI-58): the drawer cabinets, the combined ones and the island with drawers. */
const hasDrawers = (m: Rec) => ['KB_DRAWERS', 'KB_COMBINED', 'KT_COMBINED'].includes(m.moduleTypeId) || m.catalogId === 'island-drawers';

const FOOT_RANGE = [89, 125];
const outOfFootRange = (m: Rec) => !Number.isFinite(m.floor) || m.floor < FOOT_RANGE[0]! || m.floor > FOOT_RANGE[1]!;

/**
 * The size of a place for a freestanding fridge or cooker (MOD-AI-60, MOD-DEC-752, FINDINGS 3190): the appliance it
 * holds — the place less its gaps — is within the policy's width and height, the gaps are whole mm, the place is on the
 * floor. The words name the fields of the panel.
 */
export function placeError(m: Rec): string | null {
  const a = K.appliancePlace.value,
    g = m.placeGaps ?? { sideMm: 0, topMm: 0 },
    width = m.width - 2 * g.sideMm,
    height = m.height - g.topMm,
    whole = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
  if (!whole(g.sideMm) || !whole(g.topMm)) return 'Зазоры места под технику — целые миллиметры от 0.';
  if (m.floor !== 0) return 'Место под отдельно стоящую технику стоит на полу: низ — 0 мм.';
  if (!Number.isInteger(width) || width < a.deviceWidthMm[0]! || width > a.deviceWidthMm[1]!)
    return `Ширина прибора: целое число от ${a.deviceWidthMm[0]} до ${a.deviceWidthMm[1]} мм (место = прибор + ${g.sideMm} мм с каждой стороны); сейчас ${width} мм.`;
  if (!Number.isInteger(height) || height < a.deviceHeightMm[0]! || height > a.deviceHeightMm[1]!)
    return `Высота прибора: целое число от ${a.deviceHeightMm[0]} до ${a.deviceHeightMm[1]} мм (место = прибор + ${g.topMm} мм сверху); сейчас ${height} мм.`;
  return null;
}

/**
 * Whether a module may stand in the kitchen as it is (validate with its layers, r1.html:68165–82240), checked in the
 * scene with the module in it. The checks and their texts are the prototype's, in its order: the placement, the
 * calculation of the module (kflow, kp, kn, kcr), its hardware (khr), then the whole scene (kr). The id excluded from the
 * collisions is kept on every layer (KF-27: khr dropped it). Task K4 adds to kr the parts of the module in the room
 * and among the parts of the others (partConflict) and the worktops of the scene with the room (sceneTopology).
 */
export function validateKitchenModule(s0: KitchenScene, m: Rec, excludeId: string | null = null): KitchenVerdict {
  const s = sceneWith(s0, m),
    exclude = excludeId ?? m.id;
  const placed = placement(s, m, exclude);
  if (placed) return placed;
  const place = isPlace(m) ? placeError(m) : null;
  if (place) return no(place);
  const ok: KitchenVerdict = { ok: true, text: 'Положение допустимо по предварительной геометрии.' },
    t = m.panelThickness ?? 16,
    d = calculated(s, m);
  if (!isConstruction(m)) {
    // kflow (r1.html:69842) and kn (72847); kp (72409) is the accessible L corner, a construction of kcr.
    if (supported(m)) {
      if (m.supportKit === '9028286' && outOfFootRange(m)) return no('Выбранная опора 9028286: от пола до низа дна 89–125 мм, площадка уже включена.');
      if (d.status === 'FAIL' || d.status === 'NEED_DATA') return no(d.note);
      const shelves = shelfItems(m);
      if (new Set(shelves.map((x) => x.id)).size !== shelves.length || shelves.some((x) => !Number.isFinite(x.levelMm) || x.levelMm < 0 || x.levelMm + t > d.clear.H)) return no('Полка выходит за чистую высоту корпуса или имеет повторный ID.');
      const sorted = shelves.map((x) => x.levelMm).sort((a, b) => a - b);
      if (sorted.some((x, i) => i > 0 && x < sorted[i - 1]! + t)) return no('Полки пересекаются; изменение отклонено.');
      if (d.parts.some((p: Rec) => p.blank_mm.some((x: number) => !Number.isFinite(x) || x <= 0))) return no('Выбранная кромка больше размера заготовки.');
    }
    if (knAffected(m) && ['FAIL', 'NEED_DATA'].includes(d.status)) return no(d.note);
  } else if (isAccessL(m) && d.status !== 'GEOMETRY_DRAFT') return no(d.note);
  // kcr (r1.html:75290).
  if (isApplianceBay(m) && collisionRects(s, m).some((b) => b.x < 0 || b.y < 0 || b.x + b.w > s.room.width || b.y + b.h > s.room.depth))
    return no('Опорная панель ниши выходит за помещение. Учтите 18 мм с каждой свободной стороны; внутренний проём сохраняется.');
  if (isConstruction(m) && d.status === 'FAIL') return no(d.note);
  if (m.supportKit === '9028286' && (m.floor < FOOT_RANGE[0]! || m.floor > FOOT_RANGE[1]!)) return no('Опоры 9028286: отметка низа корпуса 89–125 мм.');
  // MOD-AI-58 (FINDINGS 3113): a cabinet with drawers is at least as wide as the narrowest of the kitchen makers; a
  // narrower one is the bottle pull-out. The prototype took 200 mm with four drawers 126 mm wide inside.
  if (hasDrawers(m) && m.width < K.drawerCabinetMinWidth.value)
    return no(`«${m.name}» — шириной от ${K.drawerCabinetMinWidth.value} мм: в более узкий корпус ящик встаёт шириной ${Math.round(m.width - 2 * t - 42)} мм внутри. Для узкого места — «Бутылочница» 150, 200 или 300 мм.`);
  if (m.moduleTypeId === 'KB_BOTTLE' && (m.bottomThicknessMm ?? 35) !== 35) return no('Узкий корпус использует составное дно 19+16 мм под опорные винты 4×35; другое исполнение требует отдельного узла.');
  // khr (r1.html:79992): the hardware of the fronts and mechanisms.
  const full = derived(s, m);
  if (m.preliminary !== true) {
    const p = full.hardwarePlanning,
      issues = p ? [...p.leaves.flatMap((x: Rec) => x.issues), ...(p.mechanism?.issues || [])] : [];
    if (issues.length) return no(issues.join(' '));
    if (['base', 'tall', 'island'].includes(m.kind) && m.floor > 0 && (m.floor < FOOT_RANGE[0]! || m.floor > FOOT_RANGE[1]!)) return no('Выбранные опоры допускают высоту 89–125 мм.');
  }
  // kr (r1.html:80870): the calculation in the scene, the topology of the scene — the geometry of every module, the
  // contacts of the peninsulas and the worktops (kcpValidatedTopology63) — and the parts in the room (K4).
  if (full.status === 'FAIL') return no(full.note || 'Расчёт выбранной конструкции не завершён.');
  // KF-27: the module excluded from the collisions is out of the scene of this layer too.
  const kept = s.modules.filter((x) => x.id === m.id || x.id !== exclude),
    scene = kept.length === s.modules.length ? s : { ...s, modules: kept },
    records = new Map(scene.modules.map((x) => [x.id, x.id === m.id ? full : derived(scene, x)])),
    topology = topologyOf(scene, records);
  if (topology.issues.length) return no(topology.issues[0]!.text);
  // K4 (KF-01, KF-02, KF-20): the parts of the module stand in the room and apart from the parts of the others.
  const conflict = partConflict(scene, m, new Map([...records].map(([id, d]) => [id, d.parts ?? []])));
  return conflict ? no(conflict) : ok;
}

/**
 * The topology of a scene with the records of its modules (KF-23, FINDINGS 920): the check of every module of a kitchen
 * reads the topology of the whole scene with the same derived records, so it is made once for them.
 */
const topologies = new WeakMap<KitchenScene, { records: Rec[]; topology: ReturnType<typeof sceneTopology> }>();

function topologyOf(scene: KitchenScene, records: ReadonlyMap<string, Rec>): ReturnType<typeof sceneTopology> {
  const list = [...records.values()],
    saved = topologies.get(scene);
  if (saved && saved.records.length === list.length && saved.records.every((r, i) => r === list[i])) return saved.topology;
  const topology = sceneTopology(scene, records);
  topologies.set(scene, { records: list, topology });
  return topology;
}

/** A module added from a palette card at a placement (the card, the dialog, addDraft r1.html:69334); `draft` is the module as checked, with its id. */
export function addKitchenModule(s: KitchenScene, cardId: string, ctx: KitchenCardContext = {}, fields: Rec = {}): { ok: boolean; text: string; module: Rec | null; draft: Rec; scene: KitchenScene } {
  let m = makeKitchenModule(s, cardId, ctx);
  if (isSingleCorner(m)) alignSingleCorner(s, m);
  for (const [k, v] of Object.entries(fields)) m = placeDraft(s, m, k, v);
  // The draft is checked as «preview» and gets its id when added (addDraft): the texts name the draft so.
  const S = s as Rec,
    id = 'm' + (S.nextId ?? 1),
    v = validateKitchenModule(s, m),
    candidate = { ...m, id };
  if (!v.ok) return { ok: false, text: v.text, module: null, draft: candidate, scene: s };
  return { ok: true, text: v.text, module: candidate, draft: candidate, scene: { ...s, modules: [...s.modules, candidate], nextId: (S.nextId ?? 1) + 1 } as KitchenScene };
}

// ---------------------------------------------------------------- the examples

/** The examples of the kitchen (fixtures, r1.html:67362) as data: the room and the cards with their placements. */
export const KITCHEN_EXAMPLES: Readonly<Record<string, Rec>> = examplesData.data;

/**
 * An example made by the path of a palette card (KF-14, FINDINGS 327): each module is makeKitchenModule of its card
 * placed by the example and checked by validateKitchenModule; an example that fails its own check is an error.
 */
export function kitchenExample(name: string, base: KitchenScene): KitchenScene {
  const f = KITCHEN_EXAMPLES[name];
  if (!f) throw new Error(`Нет примера «${name}»`);
  // The catalogue is the release of the calculation, given as it is, not a part of the example. An example is a new
  // kitchen and names its walls as one (KF-15, FINDINGS 508); the prototype loaded it as LEGACY, where the inner wall is «A».
  let s = { ...clone({ ...base, hardware: null }), hardware: base.hardware, wallNaming: 'ABC_CHAIN', type: f.type, orientation: f.orientation, islandEnabled: f.islandEnabled, room: clone(f.room), modules: [], obstacles: clone(f.obstacles), roomConfirmed: true, typeConfirmed: true, nextId: 1 } as unknown as KitchenScene;
  for (const card of f.modules) {
    const r = addKitchenModule(s, card.catalogId, { wall: card.place.wall }, card.place);
    if (!r.ok) throw new Error(`Пример «${name}», ${card.catalogId}: ${r.text}`);
    s = r.scene;
  }
  return s;
}
