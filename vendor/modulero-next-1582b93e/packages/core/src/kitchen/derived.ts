// The derived parts of a kitchen module (task K3, MIGRATION_PLAN step 4.3): the prototype's chain of `derived` layered
// over twelve wrappers (r1.html:68764–82009) written out as one call path over the parts of carcass.ts. Outermost first:
//   khr (hinge and mechanism planning) → kap → kcr (fronts split into leaves, island skins, niche supports, foot pads,
//   plinth, TANDEM joints of the constructions, System 32 readiness, export positions) → kre (TANDEM joints of the
//   drawer cabinet, SAH216 qualification) → kpm → kn (diagonal corner) → ki (island) → kp (accessible L corner) →
//   k32 (System 32 policy and the edge of a new removable shelf) → k7 (carcass fasteners F7) → kflow → base.
// The cache layer kcp (r1.html:82009) does not change a result and is left out.
//
// The fasteners of a module read the parts of the whole kitchen (k7Input with its layers kr, kap, kpm, kn, ki, kp:
// r1.html:71269–80830). The prototype marked that read with its global k7Reading; here it is the argument `reading`.
// The whole worktops (kcrWholeTops, worktops.ts — task K4) join the parts of the kitchen, the inventory of the
// fasteners among them.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { Rec } from '../engine/policy/project-state.js';
import hardwareData from '../catalog/kitchen/hardware-profiles.data.json' with { type: 'json' };
import { F7_PROFILES, coverage, plan } from '../wardrobe/fasteners-r7.js';
import { minimalHingeCount } from '../engine/invariants/checks.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { narrowJointLayout } from '../engine/policy/joint-stations.js';
import { kitchenPushToOpen, trimForEdgeHandle } from './fittings.js';
import { hole as mechanismHole, pushLatchPlans, sharedHingePlan, shelfSupportPlans, type MechanismHole } from './mechanisms.js';
import { hingeStations } from '../wardrobe/facades.js';
import { WardrobeStandardPreset } from '../wardrobe/standard.js';
import { levelRunner } from './drawer-runner.js';
import { kitchenHanger, levelHanger } from './hanger.js';
import { flapPlan, kitchenLift, levelLift, type KitchenLift } from './lift.js';
import {
  bounds,
  bodyEdge,
  calculated,
  fillerCalculated,
  isFiller,
  isPlace,
  placeCalculated,
  placed,
  frontSeam,
  FRONT_CARCASS_GAP,
  checkParts,
  constructionCalculated,
  cornerCalculated,
  diagonalCalculated,
  hangerEligible,
  isAppliance,
  isConstruction,
  kcrFail,
  knAffected,
  leaf,
  material,
  mirror,
  part,
  PLINTH_BACK,
  PLINTH_SETBACK,
  planBox,
  shelfItems,
  standardCard,
  supported,
  system32On,
  accessLCalculated,
} from './carcass.js';
import { bodyDepth, fastenerPoint, isAccessL, isDiagonal, isFree, isLegacyCorner, isSingleCorner, moduleWorldStart, worldBox, type KitchenScene } from './room.js';
import { KITCHEN_STANDARD } from './standard.js';
import { kitchenWorktops } from './worktops.js';
import { convexOverlap } from './collisions.js';
import { jsonClone } from '../engine/json-clone.js';
import { splitBackPanel } from '../engine/policy/back-split.js';
import { tolerance } from '../engine/policy/index.js';
import { withManualKitchenBands } from './edge-bands.js';

const clone = jsonClone;
const TANDEM = 'BLUM-TANDEM560H5000B-WOOD16';
const FOOT_KIT = '9028286';
/** The operation of a peg of the lift HK-S in a side (the generator drills it with the lift). */
export const LIFT_PEG = 'AVENTOS HK-S peg';
const EPS = 1e-6;
const K = kitchen.constants;

/** Depth of the confirmat edge hole of the prototype's F7 (MAKMART D5/L40, r1.html:86140); the wardrobe fix WR-17 is not yet applied to the kitchen. */
const CONFIRMAT_EDGE_DEPTH_MM = 40;

/** Hardware profiles of the kitchen (khrProfiles, r1.html:78214). */
export const KITCHEN_HARDWARE_PROFILES: readonly Rec[] = hardwareData.data as any;
const BASE_PROFILE: Readonly<Record<string, Rec>> = Object.fromEntries(KITCHEN_HARDWARE_PROFILES.map((p) => [p.profileId, p]));

/**
 * The hinges of the bi-fold front of a new accessible L corner, its fronts as thick as those of the kitchen (MOD-DEC-566
 * п. 7, FINDINGS 1281). Blum KA-150 2022/2023 gives the bi-fold hinge 79T8500 for fronts of 15–23 mm, set at the factory
 * for 19 (p. 114). The 155° hinge 71T7550 has its overlay and drilling distance whatever the front, and no gap up to 24 mm
 * (p. 83); here it works with the bi-fold hinge, so from its 15. The prototype's profiles hold 19 mm alone.
 */
const RANGE_PROFILES: readonly Rec[] = [
  { ...BASE_PROFILE['BLUM-CORNER71T7550-B16-F19'], profileId: 'BLUM-CORNER71T7550-B16-F15-24', frontThicknessMm: null, frontThicknessRangeMm: [K.bifoldFrontThickness.value[0], K.corner155FrontMax.value], pairedWith: 'BLUM-BIFOLD79T8500-F15-23', sourceRef: 'Blum KA-150 2022/2023, p. 83' },
  { ...BASE_PROFILE['BLUM-BIFOLD79T8500-F19'], profileId: 'BLUM-BIFOLD79T8500-F15-23', frontThicknessMm: null, frontThicknessRangeMm: [...K.bifoldFrontThickness.value], pairedWith: 'BLUM-CORNER71T7550-B16-F15-24', sourceRef: 'Blum KA-150 2022/2023, p. 114' },

  // The angled hinge of the front of a new diagonal corner (MOD-DEC-566 п. 7, FINDINGS 1611): Hettich Sensys 8639i W45
  // for a carcass angle of 135°, fronts of 15–28 mm, overlay base B −2 (data sheet 9088025); the side panel is drawn in
  // on its 1:1 drawing, so any. The cross mounting plate LR 37 for screwing on, D 0 (Sensys brochure 2021, p. 38); the
  // count of the Sensys chart (≤ 600 wide: 2 to 1000 mm and 7.7 kg … 7 to 2800 and 22) as data, the engine counts by
  // rule 190 as for every special hinge. The screws of the cup and of the plate (4.5 × 16) are not in the kit.
  {
    profileId: 'HETTICH-W45-9088025-F15-28',
    manufacturer: 'Hettich',
    family: 'angledHinge',
    commercialSku: '9088025',
    variant: 'Sensys 8639i W45, 135°, overlay B −2, 95°, TB 45 × 9.5, for screwing on',
    bodyThicknessMm: null,
    frontThicknessMm: null,
    frontThicknessRangeMm: [...K.diagonalHingeFrontThickness.value],
    faceAngleDeg: 45,
    baseMm: K.diagonalHingeBase.value,
    cupDistanceRangeMm: [...K.diagonalHingeCupDistance.value],
    openingAngleDeg: 95,
    cup: { diameterMm: 35, depthMm: 12.8, drillingPatternMm: [45, 9.5] },
    plate: { commercialSku: '9075005', distanceMm: 0, holeLineMm: 37 },
    hingeCountBands: [
      { quantity: 2, frontHeightMaxMm: 1000, frontWeightMaxKg: 7.7 },
      { quantity: 3, frontHeightMaxMm: 1700, frontWeightMaxKg: 13.7 },
      { quantity: 4, frontHeightMaxMm: 2200, frontWeightMaxKg: 17.1 },
      { quantity: 5, frontHeightMaxMm: 2400, frontWeightMaxKg: 22 },
      { quantity: 6, frontHeightMaxMm: 2600, frontWeightMaxKg: 22 },
      { quantity: 7, frontHeightMaxMm: 2800, frontWeightMaxKg: 22 },
    ],
    kitPerHinge: [
      { commercialSku: '9088025', purpose: 'Угловая петля Hettich Sensys 8639i W45 9088025', quantity: 1, unit: 'piece', purchase: 'separate' },
      { commercialSku: '9075005', purpose: 'Крестообразная планка Hettich 9075005, D 0, LR 37', quantity: 1, unit: 'piece', purchase: 'separate' },
    ],
    sourceRef: 'Hettich, лист изделия 9088025; чертёж 1:1 300201_1-1_W45_B-2_EN; брошюра Sensys 11.2021, с. 23 и 38',
    manufacturingQualification: 'Положение фасада по глубине — регулировкой петли +3 / −2 мм; пробная установка по чертежу 1:1.',
  },
];
export const PROFILE: Readonly<Record<string, Rec>> = { ...BASE_PROFILE, ...Object.fromEntries(RANGE_PROFILES.map((p) => [p.profileId, p])) };

// ---------------------------------------------------------------- base (r1.html:68764)

/** The parts of a module the calculation does not support: a legacy corner keeps its stored result (derived, r1.html:68764). */
function baseDerived(s: KitchenScene, m: Rec): Rec {
  if (isLegacyCorner(m)) return m.calculated || { status: 'NEED_DATA', origin: 'LEGACY_CORNER_VERSION', clear: null, parts: [], note: 'Сохранённая связанная пара остаётся без миграции; только чтение.' };
  if (isSingleCorner(m)) return cornerCalculated(s, m);
  const d = KITCHEN_STANDARD.defaults,
    t = m.panelThickness ?? d.panel_thickness_mm!.value,
    b = d.back_thickness_mm!.value,
    e = d.edge_thickness_mm!.value;
  const card = standardCard(m.moduleTypeId);
  // A place for a free-standing appliance has no parts: it reserves space with gaps (MOD-DEC-752).
  if (isPlace(m)) return placeCalculated(m);
  if (m.kind === 'niche') return { status: 'NEED_MODEL', origin: 'APPLIANCE r2', clear: null, parts: [], note: 'Класс ширины не равен монтажному проёму; нужна точная модель.' };
  // The prototype's filler was a nominal part without a place (NEED_DATA); since MOD-DEC-741 it is placed (FINDINGS 3201).
  if (isFiller(m)) return fillerCalculated(s, m);
  if (!card || card.family !== 'rect_carcass') return { status: 'NEED_DATA', clear: null, parts: [], note: 'Формула деталей этой геометрической ветви не перенесена; предварительный контур не является распилом.' };
  const v = KITCHEN_STANDARD.variants[card.variant];
  if (!v) return { status: 'NEED_DATA', clear: null, parts: [], note: 'Вариант требует отдельной формулы.' };
  const top = v.top === 'panel',
    bottom = v.bottom === 'panel',
    back = v.back === 'inset';
  const clear = { W: m.width - 2 * t, H: m.height - (top ? t : 0) - (bottom ? t : 0), D: m.depth - (back ? b : 0) };
  if (Object.values(clear).some((x) => !Number.isFinite(x) || x <= 0)) return { status: 'FAIL', clear, parts: [], note: 'Неположительный чистый проём.' };
  const p = (name: string, w: number, h: number, thick: number, edgeBottom = false, count = 1) => ({
    name,
    count,
    finished_mm: [w, h, thick],
    blank_mm: [w, h - (edgeBottom ? e : 0), thick],
    edge_mm: { left: 0, right: 0, top: 0, bottom: edgeBottom ? e : 0 },
  });
  const parts = [p('side', m.height, m.depth, t, true, 2)];
  if (bottom) parts.push(p('bottom', clear.W, clear.D, t, true));
  if (top) parts.push(p('top', clear.W, clear.D, t, true));
  if (back) parts.push(p('inset_back_nonstructural', clear.W, clear.H, b));
  const shelfCount = Number(m.fill?.shelves || 0);
  if (shelfCount > 0) parts.push(p('shelf', clear.W, clear.D, t, true, shelfCount));
  return { status: 'NEED_DATA', clear, parts, note: 'Предварительные законченные и заготовочные размеры; соединения, фасады, нагрузка и присадка не подтверждены.' };
}

// ---------------------------------------------------------------- the fastener inventory (k7Input and its layers)

/** The System 32 policy of the project (k32Policy, r1.html:71549). */
export const system32Policy = (s: KitchenScene): Rec => s.system32Policy ?? { version: 'LEGACY-PRESERVED-R10', enabled: false, provenance: 'LEGACY_MISSING_OFF' };
/** The axis of a shelf support from the lower face of the shelf, or null when unbound (k32Offset, r1.html:71556). */
const shelfOffset = (m: Rec, x: Rec): number | null => (x.fixed === true ? (m.panelThickness ?? 16) / 2 : Number.isFinite(x.axisFromLower) ? x.axisFromLower : null);

/** The readiness of an unbound adjustable shelf: the existing SEKURA6 profile without a binding (s32RetainingReadiness, r1.html:89446). */
function retainingReadiness(selectedSupport: string | null = 'P101'): Rec {
  const p = F7_PROFILES.SEKURA6!;
  return {
    status: 'UNBOUND_EXISTING_PROFILE',
    horizontalRetention: false,
    selectedSupport,
    binding: null,
    reason: selectedSupport === 'P101' ? 'P101 retention unqualified; no explicit node-to-SEKURA6 binding' : 'Support not explicitly selected; no node-to-SEKURA6 binding',
    availableProfile: {
      id: 'SEKURA6',
      kitPerShelf: p.kitPerShelf,
      axisFromLower: p.axisFromLower,
      readiness: 'CONDITIONAL_CALCULATION / SCREEN_ALLOWED',
      sideDrillDepth: p.sideDrillDepth,
      shelfDrillDepth: p.shelfDrillDepth,
      fitTolerance: p.fitTolerance ?? { value: null, status: 'UNKNOWN' },
      permittedSideClearance: p.permittedSideClearance ?? { value: null, status: 'UNKNOWN' },
      productionRelease: false,
    },
    productionRelease: false,
  };
}

const unboundReadiness = (m: Rec) =>
  shelfItems(m)
    .filter((x) => !x.fixed && shelfOffset(m, x) === null)
    .map((x) => ({ id: x.id, ...retainingReadiness(null), field: 'explicit node-to-profile binding / machining fit' }));

const inventoryPart = (s: KitchenScene, p: Rec): Rec => {
  const mod = s.modules.find((m) => m.id === p.moduleId)!,
    b = worldBox(s, mod, p.box);
  return { id: p.partId, source: p, box: [[b[0], b[4], b[2]], [b[1], b[5], b[3]]], t: p.finished_mm[2], material: p.materialRole === 'BACK' ? 'HDF' : 'LDSP' };
};

/** The joints of the caps and fixed shelves with the sides of a module (k7Input, r1.html:71269). */
function baseInput(s: KitchenScene, m: Rec, d: Rec, inventory: Rec[]): Rec {
  const all = inventory.map((p) => inventoryPart(s, p)),
    parts = d.parts.map((p: Rec) => all.find((x) => x.id === p.partId)),
    sides = parts.filter((p: Rec) => p.id.endsWith(':side:L') || p.id.endsWith(':side:R')),
    joints: Rec[] = [],
    shelves = shelfItems(m);
  for (const edge of parts) {
    const fixed = shelves.find((x) => x.id === edge.id)?.fixed === true,
      rail = /:rail:(front|rear)$/.test(edge.id);
    if (!edge.id.endsWith(':top') && !edge.id.endsWith(':bottom') && !rail && !fixed) continue;
    for (const anchor of sides) {
      const left = anchor.id.endsWith(':L'),
        p = edge.source,
        origin = fastenerPoint(s, m, [left ? p.box[0] : p.box[1], p.box[4], p.box[2]]),
        u0 = fastenerPoint(s, m, [left ? p.box[0] + 1 : p.box[1] - 1, p.box[4], p.box[2]]),
        s0 = fastenerPoint(s, m, [left ? p.box[0] : p.box[1], p.box[4] + 1, p.box[2]]),
        w0 = fastenerPoint(s, m, [left ? p.box[0] : p.box[1], p.box[4], p.box[2] + 1]),
        u = u0.map((x, i) => x - origin[i]!),
        sv = s0.map((x, i) => x - origin[i]!),
        w = w0.map((x, i) => x - origin[i]!),
        axis = u.findIndex((v) => v !== 0),
        sign = u[axis]!,
        outer = origin[axis]! - sign * anchor.t;
      const covers = all
        .filter((x) => x.id !== anchor.id && x.source.materialRole === 'CORPUS' && /:side:[LR]$/.test(x.id) && Math.abs((sign > 0 ? x.box[1][axis] : x.box[0][axis]) - outer) < 1e-8)
        .map((x) => {
          const corners: number[][] = [];
          for (const a of [x.box[0][0], x.box[1][0]])
            for (const b of [x.box[0][1], x.box[1][1]])
              for (const c of [x.box[0][2], x.box[1][2]]) {
                const v = [a - origin[0], b - origin[1], c - origin[2]];
                corners.push([v.reduce((n, x, i) => n + x * sv[i]!, 0), v.reduce((n, x, i) => n + x * w[i]!, 0)]);
              }
          return [Math.min(...corners.map((x) => x[0]!)), Math.min(...corners.map((x) => x[1]!)), Math.max(...corners.map((x) => x[0]!)), Math.max(...corners.map((x) => x[1]!))];
        });
      if (s.roomConfirmed && axis === 0 && (Math.abs(outer) < 1e-8 || Math.abs(outer - s.room.width) < 1e-8)) {
        const st = origin[1],
          z = origin[2];
        covers.push(sv[1]! > 0 ? [-st, -z, s.room.depth - st, s.room.height - z] : [st - s.room.depth, -z, st, s.room.height - z]);
      }
      // A rail is a narrow part: one fastener and a wooden dowel against turning (MOD-DEC-364, 566; FINDINGS 1264).
      const length = p.box[5] - p.box[4],
        narrow = rail ? narrowJointLayout(length) : null,
        stations = narrow ? narrow.stations : [50, length - 50],
        covered = stations.every((st) => coverage([st - 5, edge.t / 2 - 5, st + 5, edge.t / 2 + 5], covers));
      joints.push({
        id: edge.id + '/joint/' + anchor.id,
        edge,
        anchor,
        role: 'exterior_visible',
        origin,
        u,
        s: sv,
        w,
        length,
        availableDepth: p.box[1] - p.box[0],
        stations,
        ...(narrow ? { dowelStations: narrow.dowels } : {}),
        covered,
        externallyVisible: true,
        internalPartition: false,
        edgeFace: left ? 'left' : 'right',
        anchorFace: left ? 'right' : 'left',
        outerFace: left ? 'left' : 'right',
        cupFace: 'lower',
        coverageEvidence: { covers, headDiameter: 10, headSeat: null, method: 'complete trace union; contact faces only' },
        preserve: !!m.productionRelease?.immutable,
      });
    }
  }
  const operations: Rec[] = [],
    grooves: Rec[] = [],
    unknown: Rec[] = [];
  for (const p of all) {
    for (const o of p.source.operations || []) {
      if (o.f7Nominal) continue;
      if (o.entry && o.inwardNormal && Number.isFinite(o.depth)) operations.push({ ...o, partId: p.id });
      else unknown.push({ partId: p.id, operation: o });
    }
    for (const g of p.source.grooves || []) grooves.push({ partId: p.id, id: g.id || 'groove', box: g.worldBox || null });
  }
  return { parts: all, joints, operations, grooves, existingWood: [], inventoryComplete: unknown.length === 0, unknownOperations: unknown };
}

const emptyInput = (unknownOperations: Rec[]): Rec => ({ parts: [], joints: [], operations: [], grooves: [], existingWood: [], inventoryComplete: false, unknownOperations });

/**
 * The input of the fastener plan of a module (k7Input with the layers kr r1.html:80830, kap 77929, kpm 73093, kn 72861,
 * ki 72629, kp 72457): the inventory is the parts of the kitchen with this module as given; polygon parts are left
 * out (kpRectOnly) and every partial geometry leaves the inventory incomplete.
 */
export function fastenerInput(s0: KitchenScene, m: Rec, d0: Rec): Rec {
  const s = sceneWith(s0, m),
    inventory = allParts(s, true),
    ids = new Set(inventory.map((p) => p.partId)),
    d: Rec = { ...d0, parts: d0.parts.filter((p: Rec) => ids.has(p.partId)) },
    rect = inventory.filter((p) => p.rectangularExportEligible !== false);
  // kn: the diagonal corner has no rectangular inventory
  let input: Rec;
  if (isDiagonal(m)) input = emptyInput([{ moduleId: m.id, field: 'Diagonal polygon solid/joint inventory unavailable; no bounding box substituted.' }]);
  else {
    // ki → kp → base
    const polygons = s.modules.filter(isAccessL).flatMap((mod) => accessLCalculated(s, mod).parts.filter((p: Rec) => p.finished_polygon_mm));
    if (isAccessL(m)) input = emptyInput([{ moduleId: m.id, field: 'Polygon joints, machining and fastening inventory UNKNOWN; no rectangular AABB substituted.' }]);
    else {
      input = baseInput(s, m, d, rect);
      if (polygons.length) {
        input.inventoryComplete = false;
        input.unknownOperations.push(...polygons.map((p: Rec) => ({ partId: p.partId, field: 'Exact polygon fastening/collision inventory UNKNOWN; envelope excluded.' })));
      }
    }
    const islands = s.modules.filter(isFree);
    if (islands.length) {
      input.inventoryComplete = false;
      input.unknownOperations.push(...islands.map((mod) => ({ moduleId: mod.id, field: 'Island facade grid, drawer boxes, anchoring and dependent panel/operation inventory UNKNOWN; nominal body joints retained.' })));
    }
    const partial = s.modules.filter(knAffected),
      pending = partial.filter(isDiagonal).flatMap((x) => diagonalCalculated(s, x).polygonPending);
    if (partial.length) {
      input.inventoryComplete = false;
      input.unknownOperations.push(
        ...partial.map((mod) => ({ moduleId: mod.id, field: 'Partial nominal geometry: conditional/model parts and hardware absent from exact collision/operation inventory.' })),
        ...pending.map((p: Rec) => ({ partId: p.partId, field: 'Diagonal polygon absent from exact3D fastening/collision inventory.' })),
      );
    }
  }
  // kap: a cabinet with its appliances selected is not partial. The input is built here, so it is changed in place:
  // the prototype's copy of it (the whole inventory of the kitchen for every module) is left out (KF-23, FINDINGS 570).
  const r = input;
  if (isAppliance(m) && d.applianceSelections?.every((a: Rec) => a.mode === 'selected' || a.mode === 'own')) {
    r.unknownOperations = (r.unknownOperations || []).filter((o: Rec) => !(o.moduleId === m.id && /Partial nominal geometry/.test(o.field || '')));
    r.inventoryComplete = !r.unknownOperations.length;
  }
  return r;
}

// ---------------------------------------------------------------- the layers of derived

/**
 * The joints of a plan keep their parts without the part of the kitchen each was read from (source): the plan has read
 * them, and every later copy of the module would copy the parts of the whole kitchen with them (KF-23, FINDINGS 570).
 */
function withoutSources(r: Rec): Rec {
  const bare = ({ source: _, ...p }: Rec): Rec => p;
  for (const j of r.joints) {
    j.anchor = bare(j.anchor);
    j.edge = bare(j.edge);
  }
  return r;
}

/** kflow and k7: the calculated parts with the nominal carcass fasteners F7 (r1.html:69839, 71390). */
function fastenedDerived(s: KitchenScene, m: Rec, reading: boolean): Rec {
  const d = supported(m) ? calculated(s, m) : baseDerived(s, m);
  if (reading || !m.fastenersR7?.enabled || !supported(m) || isSingleCorner(m) || !d.parts?.length) return d;
  const input = fastenerInput(s, m, d);
  if (input.joints.some((j: Rec) => !Number.isFinite(j.length) || j.stations.some((st: number) => !Number.isFinite(st) || st < 0 || st > j.length)))
    return { ...d, status: 'FAIL', parts: [], note: 'Глубина детали недостаточна для сохранённых позиций крепежа: каждая позиция должна лежать в пределах соединения. Размеры, положение и история сохранены.' };
  const r = withoutSources(plan(input, m.fastenersR7, CONFIRMAT_EDGE_DEPTH_MM));
  r.localOpenFields = d.localOpenFields || [];
  d.fastenersR7 = r;
  for (const p of d.parts) {
    p.nominalFasteners = r.operations.filter((o: Rec) => o.partId === p.partId);
    p.operations = [...(p.operations || []), ...p.nominalFasteners.map((o: Rec) => ({ ...o, f7Nominal: true }))];
    if (p.nominalFasteners.length) p.drillingStatus = 'NOMINAL_DRAFT_PRODUCTION_HOLD';
  }
  return d;
}

/** k32: the System 32 policy and the edge of a removable shelf of a new module (r1.html:71711). */
function system32Derived(s: KitchenScene, m: Rec, reading: boolean): Rec {
  const d = fastenedDerived(s, m, reading);
  if (supported(m) && !isSingleCorner(m)) {
    d.system32Policy = clone(system32Policy(s));
    d.system32Readiness = unboundReadiness(m);
    for (const p of d.parts.filter((p: Rec) => p.name === 'Полка')) {
      const item = shelfItems(m).find((x) => x.id === p.partId);
      if (!item?.system32New && m.system32Provenance !== 'NEW_MODULE') continue;
      const edge = item?.fixed ? { left: 0, right: 0, top: 0, bottom: 0.4 } : { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4 };
      p.edge_mm = edge;
      p.blank_mm = [p.finished_mm[0] - edge.left - edge.right, p.finished_mm[1] - edge.top - edge.bottom, p.finished_mm[2]];
    }
  }
  return d;
}

/** kp, ki, kn, kpm: the accessible L corner, the island fields, the diagonal corner (r1.html:72406, 72586, 72843, 72993). */
function geometryDerived(s: KitchenScene, m: Rec, reading: boolean): Rec {
  if (isDiagonal(m)) {
    const d = diagonalCalculated(s, m);
    d.system32Policy = clone(system32Policy(s));
    d.system32Readiness = unboundReadiness(m);
    return d;
  }
  const g = isFree(m) ? { ...m, depth: bodyDepth(m) } : m,
    d = isAccessL(g) ? accessLCalculated(s, g) : system32Derived(s, g, reading);
  if (!isFree(m)) return d;
  const fields = ['facade variant/grid and hardware', 'countertop/services and island anchoring'];
  if (m.decorBack || m.endPanels || m.openEndShelves) fields.push('selected decorative/end panels or open shelves: thickness, allocation and connections');
  return { ...d, placementBasis: 'EXISTING_ISLAND_PLAN', effective_depth_mm: bodyDepth(m), islandUnknownFields: fields, manufacturingQualified: false };
}

/**
 * The joints of the front and rear of a TANDEM drawer box with its sides (kreDrawerInput, r1.html:73833). The box of the
 * kit of the runner of the level (MOD-DEC-514, FINDINGS 1863) has no front wall; its bottom of the board between the
 * sides is joined to them by two confirmats a side as far from its front and rear edges as the box of the wardrobe (1862, (Д)).
 */
export function drawerInput(s: KitchenScene, m: Rec, d: Rec): Rec {
  const all = d.parts
      .filter((p: Rec) => p.drawerId && p.materialRole !== 'FACADE')
      .map((p: Rec) => {
        const b = worldBox(s, m, p.box);
        return { id: p.partId, source: p, box: [[b[0], b[4], b[2]], [b[1], b[5], b[3]]], t: p.finished_mm[2], material: 'LDSP' };
      }),
    joints: Rec[] = [];
  for (let i = 1; i <= 4; i++) {
    const did = m.id + ':drawer:' + i,
      ps = all.filter((p: Rec) => p.source.drawerId === did),
      sides = ps.filter((p: Rec) => /side$/.test(p.id)),
      walls = levelRunner(m) ? /:box-front$|:box-rear$|:bottom-panel$/ : /:box-front$|:box-rear$/,
      a = WardrobeStandardPreset.drawerJointConfirmatTopOffset;
    for (const edge of ps.filter((p: Rec) => walls.test(p.id)))
      for (const anchor of sides) {
        const left = anchor.id.endsWith('left-side'),
          p = edge.source,
          flat = edge.id.endsWith('bottom-panel'),
          xx = left ? p.box[0] : p.box[1],
          origin = fastenerPoint(s, m, [xx, p.box[4], p.box[2]]),
          across = fastenerPoint(s, m, [xx + (left ? 1 : -1), p.box[4], p.box[2]]),
          up = fastenerPoint(s, m, [xx, p.box[4], p.box[2] + 1]),
          deep = fastenerPoint(s, m, [xx, p.box[4] + 1, p.box[2]]),
          // An upright wall runs up from its lower edge, the bottom in depth from its front edge.
          length = flat ? p.box[5] - p.box[4] : p.box[3] - p.box[2];
        joints.push({
          id: edge.id + '/joint/' + anchor.id,
          edge,
          anchor,
          role: flat ? 'drawer_ldsp_bottom' : edge.id.endsWith('box-front') ? 'drawer_front_side' : 'drawer_rear_side',
          origin,
          u: across.map((v, j) => v - origin[j]!),
          s: (flat ? deep : up).map((v, j) => v - origin[j]!),
          w: (flat ? up : deep).map((v, j) => v - origin[j]!),
          length,
          availableDepth: p.box[1] - p.box[0],
          stations: flat ? [a, length - a] : [edge.id.endsWith('box-rear') ? 24 : 45, length - 16],
          covered: false,
          externallyVisible: true,
          internalPartition: false,
          confirmatAssembly: true,
          eccentricAssembly: true,
          edgeFace: left ? 'left' : 'right',
          anchorFace: left ? 'right' : 'left',
          outerFace: left ? 'left' : 'right',
          cupFace: 'inner',
          geometryUnknown: false,
        });
      }
  }
  return {
    parts: all,
    joints,
    operations: [],
    grooves: all.flatMap((p: Rec) => (p.source.grooves || []).map((g: Rec) => ({ partId: p.id, id: g.id, box: g.worldBox }))),
    existingWood: [],
    inventoryComplete: true,
    unknownOperations: [],
  };
}

/** The drawer joints of a TANDEM module: confirmats of the box fronts and rears, not for production (kre r1.html:73898, kcr 75270). */
function addDrawerJoints(s: KitchenScene, m: Rec, d: Rec, cloned: boolean): void {
  const input = cloned ? clone(drawerInput(s, m, d)) : drawerInput(s, m, clone(d)),
    r = withoutSources(plan(input, { enabled: true, records: {} }, CONFIRMAT_EDGE_DEPTH_MM));
  d.drawerJoints = cloned ? clone(r) : r;
  for (const p of d.parts.filter((p: Rec) => p.drawerId)) p.operations = [...(p.operations || []), ...d.drawerJoints.operations.filter((o: Rec) => o.partId === p.partId).map((o: Rec) => ({ ...o, production: false }))];
}

/** kre: the drawer joints of the drawer cabinet and the SAH216 qualification (r1.html:73898). */
function drawerDerived(s: KitchenScene, m: Rec, reading: boolean): Rec {
  const raw = geometryDerived(s, m, reading),
    d = m.drawerProfile || hangerEligible(m) ? clone(raw) : raw;
  if (m.drawerProfile === TANDEM && d.parts?.some((p: Rec) => p.drawerId)) addDrawerJoints(s, m, d, false);
  if (hangerEligible(m))
    for (const p of d.parts || [])
      for (const o of p.operations || [])
        if (/^SAH216/.test(o.kind || '')) {
          o.qualification = 'Source-qualified installation geometry; material pilot/tool and actual wall require verification';
          o.production = false;
        }
  return d;
}

/** Local plan point of an island from a point of the room (kcrFreeLocalFromWorld, r1.html:75923). */
function freeLocal(m: Rec, point: number[]): number[] {
  const x = point[0]! - m.x,
    z = point[1]! - m.y,
    W = m.width,
    D = bodyDepth(m),
    r = (((m.rotation || 0) % 360) + 360) % 360;
  return r === 0 ? [x, z] : r === 90 ? [W - z, x] : r === 180 ? [W - x, D - z] : [z, D - x];
}

/** The fronts of a carcass as leaves of at most 600 mm with the seam between them (kcrNormalizeFronts, r1.html:75147). */
function normalizeFronts(s: KitchenScene, m: Rec, d: Rec): Rec {
  if (!d.parts?.length || m.moduleTypeId === 'KW_GLASS' || isAccessL(m) || isDiagonal(m) || ['KB_COMBINED', 'KT_COMBINED', 'KI_DOOR_DRAWER', 'KB_BOTTLE'].includes(m.moduleTypeId)) return d;
  const parts: Rec[] = [];
  for (const p of d.parts) {
    if (isSingleCorner(m) && ['KB_CORNER_STRAIGHT', 'KW_CORNER_STRAIGHT'].includes(m.moduleTypeId) && p.partId === m.id + ':fixed_blind_front') {
      p.fixedFront = true;
      p.hingeHardwareSuppressed = true;
    }
    if (p.materialRole !== 'FACADE' || p.drawerId || p.fixedFront || p.applianceFront || p.hingeHardwareSuppressed || /blind|filler/.test(p.partId)) {
      parts.push(p);
      continue;
    }
    if (isSingleCorner(m) && !p.partId.endsWith(':single_door_front')) {
      p.fixedFront = true;
      parts.push(p);
      continue;
    }
    const kind = m.moduleTypeId === 'KM_LIFT' ? 'lift-door' : 'swing-door',
      w = p.finished_mm[0],
      seam = frontSeam(m),
      n = kind === 'lift-door' ? 1 : Math.max(1, Math.ceil((w + seam) / (600 + seam))),
      width = (w - seam * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const id = p.partId.slice(m.id.length + 1) + (n > 1 ? ':' + (i + 1) : ''),
        x = p.box[0] + i * (width + seam),
        l = leaf(s, m, id, x, x + width, p.box[2], p.box[3], 'ordinary', kind, p.finished_mm[2]);
      l.materialCode = p.materialCode;
      l.name = p.name;
      l.kind = p.kind;
      l.applianceStorage = p.applianceStorage === true;
      l.operations = clone(p.operations || []);
      if (n > 1) {
        l.hingeSide = i % 2 ? 'right' : 'left';
        l.motionPivotMm = [l.hingeSide === 'right' ? x + width : x, p.box[2], p.box[5]];
      }
      // MOD-DEC-371: the door of the straight corner cabinet keeps its side, the side of the blind part (carcass.ts).
      if (n === 1 && p.partId.endsWith(':single_door_front') && p.hingeSide) {
        l.hingeSide = p.hingeSide;
        l.motionPivotMm = [l.hingeSide === 'right' ? x + width : x, p.box[2], p.box[5]];
      }
      if (kind === 'lift-door') {
        l.hingeSide = 'top';
        l.motionPivotMm = [p.box[0], p.box[3], p.box[5]];
        l.motionAxisLocal = [1, 0, 0];
      }
      parts.push(l);
    }
  }
  d.parts = parts;
  const fronts = parts.filter((p) => p.materialRole === 'FACADE' && !p.fixedFront);
  if (fronts.length) {
    d.front_count = fronts.length;
    d.front_size_mm = fronts[0]!.finished_mm;
  }
  return d;
}

/** The outer panels of an island: decorative back, end panels, open end shelves (kcrIslandSkins, r1.html:74931). */
function islandSkins(s: KitchenScene, m: Rec, d: Rec): Rec {
  if (!isFree(m) || !d.parts?.length) return d;
  const uncertainty = ['GEOMETRY_PARTIAL', 'NEED_DATA'].includes(d.status)
    ? { status: d.status, localOpenFields: d.localOpenFields, nominalUnknownFields: d.nominalUnknownFields, islandUnknownFields: d.islandUnknownFields, installationPlanningQualified: false }
    : null;
  const T = m.skinThicknessMm ?? 18,
    D = bodyDepth(m),
    W = m.width,
    H = m.height;
  if (T !== 18) return kcrFail('Наружные островные панели выбраны 18 мм; другое исполнение требует отдельного расчёта.', d.clear);
  const e = { left: bodyEdge(m), right: bodyEdge(m), top: bodyEdge(m), bottom: bodyEdge(m) };
  if (m.decorBack && !m.pairId) d.parts.push(part(s, m, 'Декоративная задняя панель острова', 'island:decor-back', [W, H, T], [0, W, 0, H, D, D + T], 'CORPUS', e));
  const pair = s.modules.find((p) => p.id === m.pairId),
    pairedEnds = !!pair && (m.endPanels || pair.endPanels),
    ownEnds = pairedEnds ? m.id.localeCompare(pair!.id) < 0 : !!m.endPanels;
  if (ownEnds) {
    let u0 = 0,
      u1 = W,
      v0 = 0,
      v1 = D + (m.decorBack ? T : 0),
      h0 = 0,
      h1 = H;
    if (pair) {
      const bodyPoints = [m, pair].flatMap((member) => {
        const b = worldBox(s, member, [0, member.width, 0, 0, 0, bodyDepth(member)]);
        return [
          [b[0], b[4]],
          [b[1], b[4]],
          [b[1], b[5]],
          [b[0], b[5]],
        ].map((p) => freeLocal(m, p));
      });
      [u0, u1, v0, v1] = bounds(bodyPoints) as [number, number, number, number];
      h0 = Math.min(m.floor, pair.floor) - m.floor;
      h1 = Math.max(m.floor + H, pair.floor + pair.height) - m.floor;
    }
    for (const side of ['L', 'R']) {
      const x = side === 'L' ? u0 - T : u1,
        box = [x, x + T, h0, h1, v0, v1],
        // FINDINGS 501: the side of a peninsula against the end of a row is joined to the row side by side (1054519);
        // an end panel there would stand in the side of the row module. The prototype put one on both sides.
        row = m.zone === 'peninsula' ? rowAgainst(s, m, box) : null;
      if (row) {
        d.omittedEndPanels = [...(d.omittedEndPanels ?? []), { side, againstModuleId: row.id, reason: 'FINDINGS 501: сторона полуострова примыкает к торцу ряда' }];
        continue;
      }
      const p = part(s, m, 'Торцевая панель острова ' + side, 'island:end:' + side, [v1 - v0, h1 - h0, T], box, 'CORPUS', e);
      p.supportingModuleIds = pair ? [m.id, pair.id] : [m.id];
      d.parts.push(p);
    }
  }
  if (m.openEndShelves) {
    const width = m.openEndWidthMm ?? 200;
    if (!Number.isFinite(width) || width < 120 || width > 400) return kcrFail('Ширина открытого торцевого блока 120–400 мм.', d.clear);
    const x0 = W + (m.endPanels ? T : 0),
      x1 = x0 + width;
    // FINDINGS 500: the bottom and the top close the open block; the two shelves stand between its side and its back.
    // The prototype made them as wide and deep as the bottom, 18 mm into the side and into the back.
    for (const [suffix, y] of [
      ['bottom', 0],
      ['shelf:1', (H - T) / 3],
      ['shelf:2', (2 * (H - T)) / 3],
      ['top', H - T],
    ] as [string, number][]) {
      const inner = suffix.startsWith('shelf:');
      d.parts.push(part(s, m, 'Полка открытого торца', 'island:open-end:' + suffix, [inner ? width - T : width, inner ? D - T : D, T], [x0, inner ? x1 - T : x1, y, y + T, 0, inner ? D - T : D], 'CORPUS', e));
    }
    d.parts.push(
      part(s, m, 'Боковина открытого торца', 'island:open-end:side', [H - 2 * T, D, T], [x1 - T, x1, T, H - T, 0, D], 'CORPUS', e),
      part(s, m, 'Задняя панель открытого торца', 'island:open-end:back', [width - T, H - 2 * T, T], [x0, x1 - T, T, H - T, D - T, D], 'CORPUS', e),
    );
  }
  const emitted = d.parts.filter((p: Rec) => p.partId.startsWith(m.id + ':island:')),
    backParts = emitted.filter((p: Rec) => p.partId.endsWith(':decor-back')),
    endParts = emitted.filter((p: Rec) => p.partId.includes(':island:end:')),
    openParts = emitted.filter((p: Rec) => p.partId.includes(':island:open-end:')),
    endCount = endParts.length * (pair ? 8 : 4),
    joint = (id: string, kind: string, count: number, parts: Rec[]) => ({ id: m.id + id, kind, count, profileId: 'PROJECT-SKIN-3.5X30', actualPartIds: parts.map((p) => p.partId), fasteners: [{ article: '9278224', quantity: count }] });
  d.constructionJoints = [
    ...(d.constructionJoints || []),
    ...(backParts.length ? [joint(':skin-back-fasteners', 'skin-to-carcass', 8, backParts)] : []),
    ...(endCount ? [joint(':skin-end-fasteners', 'skin-to-carcass', endCount, endParts)] : []),
    ...(openParts.length ? [joint(':open-end-fasteners', 'open-end-shelf-and-back', 16, openParts)] : []),
  ];
  const checked = checkParts(d);
  return checked.status === 'FAIL' || !uncertainty ? checked : Object.assign(checked, uncertainty);
}

/** The module of a row (a wall base or tall cabinet) whose body a box of a peninsula would enter (FINDINGS 501), or null. */
function rowAgainst(s: KitchenScene, m: Rec, box: number[]): Rec | null {
  const b = worldBox(s, m, box);
  return (
    s.modules.find((o) => {
      if (o.id === m.id || isFree(o) || !['base', 'tall'].includes(o.kind)) return false;
      const w = worldBox(s, o, [0, o.width, 0, o.height, 0, bodyDepth(o)]);
      return [0, 2, 4].every((a) => Math.min(b[a + 1]!, w[a + 1]!) - Math.max(b[a]!, w[a]!) > EPS);
    }) ?? null
  );
}

const isApplianceBay = (m: Rec | null | undefined): boolean => ['KB_DISHWASHER_450_600', 'KB_WASHER_600'].includes(m?.moduleTypeId);

/** The supports of a dishwasher or washer niche: a neighbour cabinet or an 18 mm end panel on each side (kcrNicheSupportPlan, r1.html:75028). */
export function nicheSupportPlan(s: KitchenScene, m: Rec): Rec | null {
  if (!isApplianceBay(m)) return null;
  const start = moduleWorldStart(s, m),
    end = start + m.width,
    top = m.floor + m.height,
    others = s.modules.filter((x) => x.id !== m.id && x.wall === m.wall && !isFree(x) && ['base', 'tall', 'filler'].includes(x.kind) && Math.abs(x.floor + x.height - top) < 1e-6),
    left = others.find((x) => Math.abs(moduleWorldStart(s, x) + x.width - start) < 1e-6),
    right = others.find((x) => Math.abs(moduleWorldStart(s, x) - end) < 1e-6);
  return {
    clearBayWidthMm: m.width,
    left: left ? 'adjacent-cabinet' : 'end-panel',
    right: right ? 'adjacent-cabinet' : 'end-panel',
    leftModuleId: left?.id || null,
    rightModuleId: right?.id || null,
    finishedOutsideWidthMm: m.width + (left ? 0 : 18) + (right ? 0 : 18),
    sideThicknessMm: 18,
    topSupportDatumMm: top,
  };
}

function nicheSupportParts(s: KitchenScene, m: Rec, d: Rec): Rec {
  const plan = nicheSupportPlan(s, m);
  if (!plan) return d;
  d.nicheSupports = plan;
  for (const [side, mode, x] of [
    ['L', plan.left, -18],
    ['R', plan.right, m.width],
  ] as [string, string, number][])
    if (mode === 'end-panel') {
      const p = part(s, m, 'Опорная боковая панель ниши ' + side, 'niche:end-support:' + side, [m.height, bodyDepth(m), 18], [x, x + 18, 0, m.height, 0, bodyDepth(m)], 'CORPUS', { left: 0, right: 0, top: 0, bottom: bodyEdge(m) });
      Object.assign(p, {
        structural: true,
        floorStanding: true,
        installationPlanningQualified: true,
        manufacturingQualified: false,
        fasteningCondition: 'Structural18mm side reaches slab from floor; top brackets, floor/wall restraint, moisture/material grade and actual loads qualified separately',
      });
      d.parts.push(p);
    }
  const count = [plan.left, plan.right].filter((v) => v === 'end-panel').length;
  d.constructionJoints = [
    ...(d.constructionJoints || []),
    ...(count
      ? [
          {
            id: m.id + ':niche-end-supports',
            kind: 'worktop-to-structural-end-panels',
            count: count * 2,
            profileId: 'PROJECT-NICHE-TOP-BRACKETS',
            qualification: 'Two selected rigid topfix brackets per fullheight panel; actual bracketSKU and screwstack provided by hardware profile',
          },
        ]
      : []),
  ];
  return d;
}

/** The plinth stands under the module (kcrPlinth, r1.html:75198); under a new tall cabinet too (MOD-DEC-566 п. 4, FINDINGS 1272). */
const hasPlinth = (m: Rec): boolean => (['base', 'island', 'filler'].includes(m.kind) || (m.kind === 'tall' && m.plinthRun === true)) && m.plinthEnabled !== false && m.floor >= 20;

/**
 * The run of plinth a new module stands in (MOD-DEC-566 п. 4, FINDINGS 1272): the modules marked `plinthRun` on its wall
 * that follow one another without a gap, at the same height over the floor and with the same front line, in the order
 * of the wall. A module out of a run, or one of the prototype, has its own plinth.
 */
export function plinthRunOf(s: KitchenScene, m: Rec): Rec[] {
  const joins = (n: Rec) => n.plinthRun === true && hasPlinth(n) && !isFree(n) && n.wall === m.wall && n.floor === m.floor && bodyDepth(n) === bodyDepth(m);
  if (!joins(m)) return [m];
  const row = s.modules.filter(joins).sort((a, b) => a.pos - b.pos),
    runs: Rec[][] = [];
  for (const n of row) {
    const last = runs.at(-1)?.at(-1);
    if (last && Math.abs(last.pos + last.width - n.pos) <= 0.5) runs.at(-1)!.push(n);
    else runs.push([n]);
  }
  return runs.find((r) => r.some((n) => n.id === m.id)) ?? [m];
}

/**
 * The front lines of the plinth of a corner in its left plan (y from the wall), each drawn so that its inward normal
 * (-dy, dx) / l points into the body. The prototype drew the line of wall A of the accessible L the other way: its plinth
 * stood 50 mm before the fronts, and the two plinths left the corner open. Here the plinth of wall A runs to the face of
 * the return and the plinth of the return to the back of it (FINDINGS 506).
 */
function cornerPlinthLines(m: Rec): number[][][] {
  const W = m.width,
    D = m.depth,
    P = m.cornerReturn;
  return isDiagonal(m)
    ? [
        [
          [W, D],
          [D, P],
        ],
      ]
    : [
        [
          [W, D],
          [D - PLINTH_SETBACK, D],
        ],
        [
          [D, D - PLINTH_BACK],
          [D, P],
        ],
      ];
}

/** The band of a plinth line from `near` to `far` mm behind it, in the left plan. */
function plinthBand(line: number[][], near: number, far: number): number[][] {
  const [a, b] = line as [number[], number[]],
    dx = b[0]! - a[0]!,
    dy = b[1]! - a[1]!,
    l = Math.hypot(dx, dy),
    nx = -dy / l,
    ny = dx / l;
  return [
    [a[0]! + nx * near, a[1]! + ny * near],
    [b[0]! + nx * near, b[1]! + ny * near],
    [b[0]! + nx * far, b[1]! + ny * far],
    [a[0]! + nx * far, a[1]! + ny * far],
  ];
}

/**
 * A plate of a foot in the left plan of the module moved behind the plinth (KF-12, FINDINGS 506): the prototype put the
 * front plates 37 mm behind the front face, under the plinth at 50…66 mm, so the leg and the plinth shared a volume.
 * The plate moves along the inward normal until it clears the back face of the plinth; the recess of the plinth stays
 * as it is (MOD-DEC-404).
 */
function behindPlinth(m: Rec, rect: number[][]): { rect: number[][]; shiftMm: number } {
  if (!hasPlinth(m)) return { rect, shiftMm: 0 };
  let out = rect,
    shiftMm = 0;
  const lines = isAccessL(m) || isDiagonal(m) ? cornerPlinthLines(m) : [[[m.width, bodyDepth(m)], [0, bodyDepth(m)]]];
  for (const line of lines) {
    if (!convexOverlap(out, plinthBand(line, PLINTH_SETBACK, PLINTH_BACK))) continue;
    const [a, b] = line as [number[], number[]],
      l = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!),
      n = [-(b[1]! - a[1]!) / l, (b[0]! - a[0]!) / l],
      depth = Math.min(...out.map((c) => (c[0]! - a[0]!) * n[0]! + (c[1]! - a[1]!) * n[1]!)),
      shift = PLINTH_BACK - depth;
    out = out.map((c) => [c[0]! + n[0]! * shift, c[1]! + n[1]! * shift]);
    shiftMm += shift;
  }
  return { rect: out, shiftMm };
}

/** The feet of a new module stand right in its bottom: the fixing block 47654 on four dowels (MOD-DEC-566 п. 3, FINDINGS 1271). */
export const dowelFeet = (m: Rec): boolean => m.supportKit === FOOT_KIT && m.footMount === 'DOWELS';

/**
 * The plates of the feet 9028286 under the bottom, in the box of the module, with the shift behind the plinth (kcrFootPlateBoxes,
 * r1.html:75077). The plate of the prototype is the block 9028230 of 95 mm, 40 mm from the sides; the block 47654 on dowels is
 * 92 mm, at the same places from the front, and 50 mm from the sides of a rectangular module, so that its dowels keep clear of
 * the cams of the bottom's joints (FINDINGS 1271).
 */
export function footPlates(m: Rec): { box: number[]; shiftMm: number }[] {
  const W = m.width,
    B = bodyDepth(m),
    D = B - (['KT_FRIDGE_ONE', 'KT_FRIDGE_TWO'].includes(m.moduleTypeId) ? 40 : 0),
    corner = isAccessL(m) || isDiagonal(m),
    L = dowelFeet(m) ? K.footBlock.value.lengthMm : 95,
    side = dowelFeet(m) ? K.footBlockFromSide.value : 40,
    rect = (x: number, y: number) => [
      [x, y],
      [x + L, y],
      [x + L, y + 80],
      [x, y + 80],
    ],
    // A plate of a rectangular module in its box (z from the front face) and in the plan of the band (y from the wall).
    box = (x: number, z: number) => ({ plan: rect(x, B - z - 80), box: [x, x + L, -25, 0, z, z + 80] }),
    stations =
      W < 260
        ? [20, D - 100].map((z) => box((W - L) / 2, z))
        : corner
          ? [[23.5, 20], [W - 23.5 - L, 20], [23.5, m.cornerReturn - 100], [W - 23.5 - L, D - 100], ...(!isDiagonal(m) ? [[D - 23.5 - L, m.cornerReturn - 100]] : [])].map(([x, y]) => {
              const plan = rect(x!, y!);
              return { plan, box: planBox(m, bounds(mirror(m, plan)), -25, 0) };
            })
          : [side, W - side - L].flatMap((x) => [37, D - 120].map((z) => box(x, z)));
  return stations.map((x) => {
    const moved = behindPlinth(m, x.plan);
    if (!moved.shiftMm) return { box: x.box, shiftMm: 0 };
    const b = bounds(corner ? mirror(m, moved.rect) : moved.rect);
    return { box: corner ? planBox(m, b, -25, 0) : [b[0]!, b[1]!, -25, 0, B - b[3]!, B - b[2]!], shiftMm: moved.shiftMm };
  });
}

/** The plates of the feet 9028286 under the bottom, in the box of the module. */
export function footPlateBoxes(m: Rec): number[][] {
  return footPlates(m).map((p) => p.box);
}

/** The bottom reinforced to the 35 mm wood stack of the foot 9028286 under each plate (kcrFeetPads, r1.html:75092). */
function feetPads(s: KitchenScene, m: Rec, d: Rec): Rec {
  if (m.supportKit !== FOOT_KIT || !d.parts?.length) return d;
  const bottom = d.parts.find((p: Rec) => /:bottom$|polygon-bottom$/.test(p.partId));
  if (!bottom) return d;
  if (dowelFeet(m)) return feetOnDowels(s, m, d, bottom);
  const t = bottom.finished_mm[2],
    lamination = d.parts.find((p: Rec) => p.partId === m.id + ':bottom-lamination'),
    stack = t + (lamination?.finished_mm[2] || 0),
    plates = footPlateBoxes(m);
  // KF-16 (FINDINGS 326): the prototype rejected every bottom but 16 and 19 mm with a reason about the foot; an 18 mm
  // carcass is an allowed edit of 180, so the pad makes up the stack of any bottom thinner than it.
  const S = K.footStack.value;
  if (stack > S) return kcrFail('Древесный пакет выбранного опорного узла 35 мм; увеличенная толщина требует пересчёта.', d.clear);
  if (stack < S) {
    for (const [i, b] of plates.entries()) {
      const padT = S - t,
        p = part(s, m, 'Усиление дна под опорной площадкой', 'foot-pad:' + (i + 1), [96, 96, padT], [b[0]! - 0.5, b[1]! + 0.5, t, S, b[4]! - 8, b[5]! + 8], 'CORPUS');
      p.materialCode = material(s, m, 'CORPUS');
      const box = [...p.box];
      for (const wall of d.parts) {
        if (wall.materialRole !== 'CORPUS' || wall.partId === bottom.partId || !wall.box || wall.box[3] <= t || wall.box[2] >= S) continue;
        const wb = wall.box;
        if (![0, 2, 4].every((a) => Math.min(box[a + 1], wb[a + 1]) - Math.max(box[a], wb[a]) > 1e-6)) continue;
        const a = wb[1] - wb[0] < wb[5] - wb[4] ? 0 : 4;
        if ((box[a] + box[a + 1]) / 2 < (wb[a] + wb[a + 1]) / 2) box[a + 1] = Math.min(box[a + 1], wb[a]);
        else box[a] = Math.max(box[a], wb[a + 1]);
      }
      if (box[1] <= box[0] || box[5] <= box[4] || box[0] > b[0]! + 1e-6 || box[1] < b[1]! - 1e-6 || box[4] > b[4]! + 1e-6 || box[5] < b[5]! - 1e-6)
        return kcrFail('Усиление дна не помещается между стенками или не поддерживает всю опорную площадку.', d.clear);
      p.box = box;
      p.finished_mm = [box[1] - box[0], box[5] - box[4], padT];
      p.blank_mm = [...p.finished_mm];
      p.mountingStackMm = S;
      p.mountingStackQualification =
        'Project woodstack35mm; Hettich9028230 source overall25mm and4x35 screw. With screwseat within sourceoverall0..25mm, penetration10..35mm cannot break through35mm stack; material/pilot and assembly retention qualified separately';
      d.parts.push(p);
    }
  }
  d.footWoodStackMm = S;
  d.footPlateCount = plates.length;
  d.footMountingStacks = plates.map((box, i) => ({
    id: m.id + ':foot-stack:' + (i + 1),
    plateBox: box,
    woodStackMm: 35,
    sourcePlateOverallMm: 25,
    screwLengthMm: 35,
    screwPenetrationRangeMm: [10, 35],
    seatThicknessKnown: false,
    qualification: 'Envelope bound provides no-through planning; exact screwseat geometry/pilot/retention remain source/template/material qualified',
  }));
  return d;
}

/**
 * The feet of a new module right in its bottom (MOD-DEC-566 п. 3, FINDINGS 1271): no pad, the block 47654 is pressed into
 * the bottom on its four dowels ø10 × 11.5 — four blind holes of 12 mm in the underside of the bottom under each block,
 * 4 mm of a bottom of 16 left. The leg is at 38 mm from the end of the block towards the nearer side of the carcass.
 */
function feetOnDowels(s: KitchenScene, m: Rec, d: Rec, bottom: Rec): Rec {
  const F = K.footBlock.value,
    depth = K.footDowelHoleDepth.value,
    t = bottom.finished_mm[2],
    plates = footPlateBoxes(m);
  if (t - depth < K.footDowelResidual.value) return kcrFail(`Площадка опоры 47654 на шкантах: гнездо ${depth} мм оставляет от дна ${t} мм меньше ${K.footDowelResidual.value} мм.`, d.clear);
  bottom.operations ??= [];
  const id = m.id + '/legs',
    ref = 'Hettich TA 2025, с. 813: площадка 47654, шканты ø10 × 11,5; гнездо 12 мм — MOD-DEC-566 (Д), FINDINGS 1271',
    y = bottom.box[2];
  d.footMountingStacks = plates.map((b, i) => {
    // The long side of the block along the longer side of its box; the leg at the end towards the nearer side of the carcass.
    const alongX = b[1]! - b[0]! >= b[5]! - b[4]!,
      [a0, a1, c0, c1, size] = alongX ? [b[0]!, b[1]!, b[4]!, b[5]!, m.width] : [b[4]!, b[5]!, b[0]!, b[1]!, bodyDepth(m)],
      low = (a0 + a1) / 2 < size / 2,
      axis = low ? a0 + F.legAxisFromEndMm : a1 - F.legAxisFromEndMm,
      mid = (c0 + c1) / 2,
      dowels = F.dowelsFromLegAxisMm.map(([along, across]) => (alongX ? [axis + (low ? along! : -along!), mid + across!] : [mid + across!, axis + (low ? along! : -along!)]));
    for (const [j, [x, z]] of dowels.entries())
      bottom.operations.push(
        mechanismHole(s, m, {
          operationId: `${id}/${bottom.partId}/dowel/${i + 1}/${j + 1}`,
          kind: 'Гнездо шканта площадки опоры 47654',
          mechanismId: id,
          partId: bottom.partId,
          machiningRole: 'FOOT_BLOCK_DOWEL_HOLE',
          diameter: F.dowelDiameterMm,
          depth,
          localEntry: [x!, y, z!],
          localNormal: [0, 1, 0],
          station: j + 1,
          holeSource: 'MANUFACTURER_CATALOG',
          holeSourceRef: ref,
          completeness: 'COMPLETE',
        }),
      );
    return { id: m.id + ':foot-block:' + (i + 1), plateBox: b, blockSku: F.sku, bottomMm: t, dowelHoleDepthMm: depth, residualMm: t - depth, legAxisMm: alongX ? [axis, mid] : [mid, axis] };
  });
  d.footWoodStackMm = t;
  d.footPlateCount = plates.length;
  return d;
}

/** The plinth 16 mm, 50 mm behind the front face of the carcass (kcrPlinth, r1.html:75198). */
function plinth(s: KitchenScene, m: Rec, d: Rec): Rec {
  if (!hasPlinth(m) || !d.parts?.length) return d;
  const h = m.floor - 6,
    T = 16,
    edge = { left: 0, right: 0, top: 0, bottom: 0 };
  if (m.plinthRun === true && !isFree(m)) return runPlinth(s, m, d, h, T, edge);
  if (isAccessL(m) || isDiagonal(m)) {
    const D = m.depth;
    for (const [i, line] of cornerPlinthLines(m).entries()) {
      const a = line[0]!,
        b = line[1]!,
        l = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!),
        plan = mirror(m, plinthBand(line, PLINTH_SETBACK, PLINTH_BACK)),
        p = part(s, m, 'Цоколь углового корпуса', 'plinth:' + i, [l, h, T], planBox(m, bounds(plan), -m.floor + 3, -3), 'CORPUS', edge);
      Object.assign(p, {
        fixedFront: true,
        localPlanMm: plan,
        polygonFront: true,
        content: false,
        worldFootprintMm: plan.map(([x, y]) => {
          const w = worldBox(s, m, [x!, x!, 0, 0, D - y!, D - y!]);
          return [w[0], w[4]];
        }),
      });
      d.parts.push(p);
    }
  } else {
    const filler = d.parts.find((p: Rec) => p.partId === m.id + ':physical_corner_filler'),
      x0 = filler ? Math.min(0, filler.box[0]) : 0,
      x1 = filler ? Math.max(m.width, filler.box[1]) : m.width,
      p = part(s, m, 'Цоколь', 'plinth', [x1 - x0, h, T], [x0, x1, -m.floor + 3, -3, PLINTH_SETBACK, PLINTH_BACK], 'CORPUS', edge);
    Object.assign(p, { fixedFront: true, content: false });
    d.parts.push(p);
  }
  return d;
}

/**
 * One plinth for a run of new modules (MOD-DEC-566 п. 4, FINDINGS 1272): the first module of the run carries it under
 * the whole run, the others none. A run longer than a plinth of one piece is cut at the joints of the modules into
 * pieces of at most `kitchen.plinthPieceMax`. Each piece is clipped onto the two front legs of every module it covers.
 */
function runPlinth(s: KitchenScene, m: Rec, d: Rec, h: number, T: number, edge: Rec): Rec {
  const run = plinthRunOf(s, m);
  if (run[0]!.id !== m.id) return d;
  const pieces: Rec[][] = [];
  for (const n of run) {
    const piece = pieces.at(-1);
    if (piece && n.pos + n.width - piece[0]!.pos <= K.plinthPieceMax.value) piece.push(n);
    else pieces.push([n]);
  }
  for (const [i, piece] of pieces.entries()) {
    const x0 = piece[0]!.pos - m.pos,
      x1 = piece.at(-1)!.pos + piece.at(-1)!.width - m.pos,
      p = part(s, m, 'Цоколь', pieces.length > 1 ? 'plinth:' + (i + 1) : 'plinth', [x1 - x0, h, T], [x0, x1, -m.floor + 3, -3, PLINTH_SETBACK, PLINTH_BACK], 'CORPUS', edge);
    Object.assign(p, { fixedFront: true, content: false, plinthRunModuleIds: piece.map((n) => n.id), clipCount: 2 * piece.length });
    d.parts.push(p);
  }
  return d;
}

/** kcr: the parts of the constructions and the finishing of every module (r1.html:75250). */
function constructionDerived(s: KitchenScene, m: Rec, reading: boolean): Rec {
  let d = clone(isConstruction(m) ? constructionCalculated(s, m) : drawerDerived(s, m, reading));
  if (d.status === 'FAIL' || !d.parts?.length) return d;
  d = normalizeFronts(s, m, d);
  d = islandSkins(s, m, d);
  if (d.status === 'FAIL') return d;
  d = nicheSupportParts(s, m, d);
  const fillerParts = d.parts.filter((p: Rec) => p.partId === m.id + ':physical_corner_filler');
  if (fillerParts.length)
    d.constructionJoints = [
      ...(d.constructionJoints || []),
      {
        id: m.id + ':physical-corner-filler-fasteners',
        kind: 'physical-corner-filler-to-carcass',
        count: fillerParts.length * 2,
        profileId: 'PROJECT-FILLER-SU30M',
        actualPartIds: fillerParts.map((p: Rec) => p.partId),
        qualification: 'Project two rigid SU30M brackets per actual filler; sourcehardware and suitable3.1x16 panel screws billed separately, physical strength/site fixing qualified',
      },
    ];
  d = feetPads(s, m, d);
  d = plinth(s, m, d);
  if (isConstruction(m) && m.drawerProfile === TANDEM && d.parts.some((p: Rec) => p.drawerId)) addDrawerJoints(s, m, d, true);
  d.system32Policy = clone(system32Policy(s));
  d.system32Readiness = shelfItems(m).map((x) => ({ id: x.id, status: x.fixed ? 'PROJECT_FIXED_CONNECTION' : 'PROFILE_BOUND', axisFromLower: x.fixed ? (m.panelThickness ?? 16) / 2 : (x.axisFromLower ?? -8), production: false }));
  d.parts.forEach((p: Rec, i: number) => (p.exportPosition = i + 1));
  return d;
}

// ---------------------------------------------------------------- hinge and mechanism planning (khr)

/**
 * Hinges of a leaf of a BLUM profile by its height and mass on the table of the prototype (khrHingeCount,
 * r1.html:79238) with the tolerance of MOD-DEC-190 (KF-09, FINDINGS 324): a limit may be exceeded by up to 5 % while the
 * other stays under 95 %. The prototype took the first band that held both, one hinge more.
 */
export function hingeCount(height: number, mass: number, width: number): number | null {
  if (![height, mass, width].every((v) => Number.isFinite(v) && v > 0) || width > 600) return null;
  const rows = PROFILE['BLUM-CLIP71B3550-B16-F18']!.hingeCountBands.map((b: Rec) => ({ n: b.quantity, Hmax: b.frontHeightMaxMm, Mmax: b.frontWeightMaxKg }));
  return minimalHingeCount(height, mass, rows);
}

/** The hinged leaves of a module, grouped by door, with their size and mass (khrGroups, r1.html:79242). */
function leafGroups(m: Rec, d: Rec): Rec[] {
  const groups = new Map<string, Rec>();
  for (const p of d.parts || []) {
    if (!(p.facade || ['FACADE', 'GLASS'].includes(p.materialRole)) || p.fixedFront || p.hingeHardwareSuppressed || p.applianceFront || p.drawerId || /^drawer-front/.test(p.motionKind || '') || /drawer-front/.test(p.partId)) continue;
    const id = p.doorGroupId || p.partId;
    let g = groups.get(id);
    if (!g) {
      g = { id, parts: [], hingeRole: p.hingeRole, motionKind: p.motionKind, hingeSide: p.hingeSide, pairedGroupId: p.pairedGroupId };
      groups.set(id, g);
    }
    g.parts.push(p);
  }
  const result = [...groups.values()].map((g) => {
    const boxes = g.parts.filter((p: Rec) => p.box?.length === 6).map((p: Rec) => p.box),
      first = g.parts[0],
      dim = first.finished_mm || [];
    g.width = first.hingeWidthMm ?? (boxes.length ? Math.max(...boxes.map((b: number[]) => b[1]!)) - Math.min(...boxes.map((b: number[]) => b[0]!)) : dim[0]);
    g.height = first.hingeHeightMm ?? (boxes.length ? Math.max(...boxes.map((b: number[]) => b[3]!)) - Math.min(...boxes.map((b: number[]) => b[2]!)) : dim[1]);
    g.thickness = first.hingeThicknessMm ?? dim[2];
    const actual = first.actualFrontMassKg ?? m.frontMassByGroupKg?.[g.id] ?? (groups.size === 1 ? m.actualFrontMassKg : null),
      // The prototype's density of an MDF front (khrGroups) also reads the material of the facades chosen (MOD-DEC-573).
      density = m.frontMaterialDensityKgM3 ?? (/MDF/i.test(m.frontMaterial || first.facadeMaterialId || '') ? 760 : 680);
    g.mass =
      Number.isFinite(actual) && actual > 0
        ? actual
        : g.parts.reduce((sum: number, p: Rec) => {
            const a = p.finished_mm || [],
              rho = p.materialRole === 'GLASS' ? 2500 : (p.materialDensityKgM3 ?? density);
            return sum + ((a[0] * a[1] * a[2]) / 1e9) * rho;
          }, 0);
    g.massBasis = Number.isFinite(actual) && actual > 0 ? 'ACTUAL_USER_INPUT' : 'ESTIMATED_REFERENCE_DENSITY';
    g.handleMass = first.handleMassKg ?? m.frontHandleMassKg ?? m.handleMassKg ?? 0.1;
    return g;
  });
  for (const g of result)
    if (g.hingeRole === 'cornerCabinet155') {
      const pair = result.filter((x) => x.pairedGroupId && x.pairedGroupId === g.pairedGroupId);
      g.supportedMass = pair.reduce((sum, x) => sum + x.mass + x.handleMass, 0);
      g.pairedLeaves = pair.length;
    }
  return result;
}

/** The BLUM profile of a leaf group as the prototype chose it (khrLeafPlan, r1.html:79286). */
function leafProfileId(m: Rec, g: Rec): string {
  const profileId =
    g.hingeRole === 'glass' || g.motionKind === 'glass-door'
      ? 'BLUM-GLASS75T4100-B16-F6'
      : g.hingeRole === 'diagonal45'
        ? m.frontThicknessFromKitchen
          ? 'HETTICH-W45-9088025-F15-28'
          : 'BLUM-DIAGONAL79B3558-B19-F19'
        : g.hingeRole === 'cornerCabinet155'
          ? m.frontThicknessFromKitchen
            ? 'BLUM-CORNER71T7550-B16-F15-24'
            : 'BLUM-CORNER71T7550-B16-F19'
          : g.hingeRole === 'cornerBifold60'
            ? m.frontThicknessFromKitchen
              ? 'BLUM-BIFOLD79T8500-F15-23'
              : 'BLUM-BIFOLD79T8500-F19'
            : 'BLUM-CLIP71B3550-B16-F18';
  return g.motionKind === 'lift-door' || m.moduleTypeId === 'KM_LIFT' ? 'BLUM-AVENTOS-HKS-WOOD18' : profileId;
}

/**
 * An ordinary swing door goes to the hinge mechanism shared with the wardrobe (MOD-DEC-341, 286; KF-07, KF-10): the
 * door the prototype gave the BLUM CLIP 71B3550, one part with its box.
 */
const sharedHinge = (m: Rec, g: Rec): boolean => leafProfileId(m, g) === 'BLUM-CLIP71B3550-B16-F18' && g.parts.length === 1 && g.parts[0].box?.length === 6;

/**
 * The lift of the level of the front of a new module that opens upwards (MOD-DEC-413, FINDINGS 3350): the leaf the
 * prototype lifts by HK-S, one part with its box; null — not a front of a new module of 413.
 */
function levelLiftOf(s: KitchenScene, m: Rec, g: Rec): KitchenLift | null {
  if (!levelLift(m) || leafProfileId(m, g) !== 'BLUM-AVENTOS-HKS-WOOD18' || g.parts.length !== 1 || g.parts[0].box?.length !== 6) return null;
  return kitchenLift(s, m, { frontKind: 'FLAP', carcassHeightMm: m.height, carcassWidthMm: m.width, frontHeightMm: g.height, frontThicknessMm: g.thickness, frontMassKg: g.mass, handleMassKg: g.handleMass }, g.width);
}

/** The hinge or lift of one leaf group of a BLUM profile (khrLeafPlan, r1.html:79286). */
function leafPlan(m: Rec, g: Rec): Rec {
  const profileId = leafProfileId(m, g),
    p = PROFILE[profileId]!,
    body = m.panelThickness ?? 16,
    issues: string[] = [];
  if (profileId === 'BLUM-AVENTOS-HKS-WOOD18') {
    const lf = m.height * (g.mass + 2 * g.handleMass),
      valid = g.height > 0 && m.height <= 600 && g.thickness === 18,
      selected = valid ? p.powerFactorBands.filter((b: Rec) => lf >= b.range[0] && lf <= b.range[1]).at(-1) : null;
    if (!selected) issues.push('Подъёмник HK-S: высота шкафа до 600 мм, фасад 18 мм и масса должны попадать в диапазон выбранного комплекта.');
    return {
      groupId: g.id,
      profileId,
      issues,
      status: issues.length ? 'INCOMPATIBLE' : 'PLANNING_QUALIFIED',
      massKg: g.mass,
      massBasis: g.massBasis,
      handleMassKg: g.handleMass,
      powerFactor: lf,
      commercialSku: selected?.commercialSku,
      quantity: 1,
      openingAngleDeg: p.openingAngleDeg,
    };
  }
  const range = p.frontThicknessRangeMm,
    front = range ? g.thickness >= range[0] && g.thickness <= range[1] : g.thickness === p.frontThicknessMm;
  if ((p.bodyThicknessMm != null && body !== p.bodyThicknessMm) || !front) issues.push('Толщина корпуса или фасада не соответствует выбранной заводской схеме.');
  if (g.hingeRole === 'cornerCabinet155' && g.pairedLeaves !== 2) issues.push('Складной фасад должен состоять из двух связанных створок.');
  // The angled hinge W45 (FINDINGS 1611) is for a carcass angle of 135°: a diagonal corner of equal sides. Its cup
  // distance C comes of the overlay A of the leaf over the inner face of the end panel, A = B + C − D, the plate D 0
  // (Sensys brochure 2021, p. 77): along the diagonal from the outer face the leaf begins at the larger of its gap and
  // FRONT_CARCASS_GAP + front (corner, carcass.ts), the inner face of the end panel meets it at body · √2.
  const angled: Rec = {};
  if (p.faceAngleDeg === 45) {
    if (Math.abs(m.width - m.cornerReturn) > EPS) issues.push('Угловая петля W45 — для угла корпуса 135°: стороны диагонального угла должны быть равны.');
    const overlay = body * Math.SQRT2 - Math.max(m.frontGap ?? 3.5, FRONT_CARCASS_GAP + g.thickness),
      cup = overlay - p.baseMm + p.plate.distanceMm,
      [c0, c1] = p.cupDistanceRangeMm;
    Object.assign(angled, { overlayMm: Math.round(overlay * 10) / 10, cupDistanceMm: Math.round(cup * 10) / 10, plateDistanceMm: p.plate.distanceMm });
    if (cup < c0 || cup > c1) issues.push(`Расстояние до чашки угловой петли ${angled.cupDistanceMm} мм вне ${c0}–${c1} мм: нужна другая планка, положение строится по чертежу 1:1.`);
  }
  const supportedMass = g.supportedMass ?? g.mass + g.handleMass,
    count = hingeCount(g.height, supportedMass, g.width);
  if (!count) issues.push('Размер или масса створки выходит за подтверждённый график петель; требуется другая схема или разделение створки.');
  return {
    groupId: g.id,
    profileId,
    issues,
    // MOD-DEC-372: the hinges of the special fronts are chosen by the owner among five makers; until then the temporary
    // BLUM profile of the prototype and a remark, no HOLD.
    hingePending:
      p.family === 'concealedHinge'
        ? 'Петля створки из нескольких деталей не подобрана: стоит временный профиль BLUM прототипа, подбирает владелец.'
        : p.manufacturer === 'BLUM'
          ? 'Петля особого фасада подбирается у пяти производителей (MOD-DEC-372): стоит временный профиль BLUM прототипа, подбирает владелец.'
          : `Петля особого фасада подбирается у пяти производителей (MOD-DEC-372): стоит временный профиль ${p.manufacturer} ${p.commercialSku} под фасад кухни, подбирает владелец.`,
    status: issues.length ? 'INCOMPATIBLE' : 'PLANNING_QUALIFIED',
    quantity: count,
    // The stations of the wardrobe doors (W4) for the count of rule 190; no holes: the BLUM profile of the prototype
    // has no kit and no catalogue page in the project — «присадка неполная» (277; FINDINGS 324).
    stationsMm: count ? hingeStations(g.height, count, [0], (st) => st, []) : [],
    massKg: g.mass,
    supportedMassKg: supportedMass,
    massBasis: g.massBasis,
    handleMassKg: g.handleMass,
    openingAngleDeg: p.openingAngleDeg,
    pairedGroupId: g.pairedGroupId || null,
    ...angled,
  };
}

/** The bottle pull-out or the dish dryer of a module (khrMechanism, r1.html:79330). */
function mechanism(m: Rec, d: Rec): Rec | null {
  let id = d.mechanismEnvelopes?.find((x: Rec) => x.profileId)?.profileId || m.bottleProfile || m.dryerProfile;
  if (m.moduleTypeId === 'KB_BOTTLE') {
    const selected = PROFILE[id];
    if (!selected || selected.frontClassWidthMm !== m.width)
      id = ({ 150: m.bottleHand === 'right' ? 'STARAX-S2413C-C150-RIGHT' : 'STARAX-S2414C-C150-LEFT', 200: 'DUSLAR-MATRIX10030034-C200-LEFT', 300: 'DUSLAR-MATRIX10030035-C300-LEFT' } as Rec)[m.width];
  }
  if (!id && m.moduleTypeId === 'KW_DRYER' && m.width === 600) id = 'FISSO-DUSLAR10030001-C600';
  const p = PROFILE[id];
  if (!p) return ['KB_BOTTLE', 'KW_DRYER'].includes(m.moduleTypeId) ? { profileId: id || null, status: 'SOURCE_REQUIRED', issues: ['Для этого размера нужен отдельный подтверждённый механизм.'] } : null;
  const clear = d.clear || { W: m.width - 2 * (m.panelThickness ?? 16), H: m.height - 2 * (m.panelThickness ?? 16), D: m.depth - (m.backThickness ?? 3) - (m.backRecessMm ?? 0) },
    issues: string[] = [];
  if (p.family === 'bottlePullout') {
    const [w, depth, h] = p.minimumClearMm;
    if (clear.W < w || clear.H < h || clear.D < depth) issues.push('Механизм не помещается в чистый проём корпуса.');
    if (m.width !== p.frontClassWidthMm) issues.push('Ширина фасада не соответствует заводскому варианту.');
    if (p.bodyThicknessRangeMm && ((m.panelThickness ?? 16) < p.bodyThicknessRangeMm[0] || (m.panelThickness ?? 16) > p.bodyThicknessRangeMm[1])) issues.push('Толщина корпуса вне заводской схемы.');
    if (p.bodyThicknessMm != null && p.bodyThicknessMm !== (m.panelThickness ?? 16)) issues.push('Толщина корпуса вне заводской схемы.');
    if (p.mounting?.frontRowsFromBottomMm?.some((v: number) => v > m.height - 4)) issues.push('Фасад ниже верхнего заводского крепления.');
  } else if (p.family === 'dishDryer') {
    if (clear.H < p.minimumClearHeightMm) issues.push('Для выбранной двухуровневой сушки требуется чистая внутренняя высота от 700 мм.');
    if (clear.W < p.systemWidthRangeMm[0] || clear.W > p.systemWidthRangeMm[1] || clear.D < p.minimumClearDepthMm) issues.push('Сушка не помещается в подтверждённый диапазон ширины и глубины.');
  }
  return {
    profileId: id,
    status: issues.length ? 'INCOMPATIBLE' : 'PLANNING_QUALIFIED',
    issues,
    commercialSku: p.commercialSku,
    quantity: 1,
    assemblyDataStatus: p.mounting?.pilotDiameterMm === null || p.mounting?.holeDiameterMm === null ? 'FACTORY_TEMPLATE_REQUIRED' : 'SOURCE_PLANNING',
  };
}

/**
 * The memo of a calculation (KF-23, FINDINGS 570): one recalculation of a kitchen reads the derived record of a module
 * many times — the fasteners of every module read the parts of all, every check of a module reads its neighbours, the
 * graph, the BOM and the coverage read them again. The record of a module is kept per scene object, per module object
 * and per reading, frozen, so that no reader changes what another reads. A scene and its modules are values: an edit
 * makes a new scene object (and a new object of the changed module); a scene whose top-level values were replaced in
 * place gets a new memo. The memo returns what the calculation returns, so the result is the same with or without it
 * (the prototype had its own cache layer kcp, r1.html:82009).
 */
type MemoEntry = { keys: string[]; values: unknown[]; byModule: WeakMap<Rec, Rec[]>; parts: Rec[][] };
const memo = new WeakMap<KitchenScene, MemoEntry>();

/**
 * The rates of the project are read by the price only, never by the derived records: a scene that differs from one of the
 * last ones by its rates alone reads its memo (MOD-DEC-244, FINDINGS 920). An edit of the rates is not a new calculation.
 */
const NOT_DERIVED = new Set(['costSettings']);
const recent: MemoEntry[] = [];
const RECENT = 2;

/** The scene differs from the scene of the entry by its rates and by nothing else. */
const ratesAlone = (e: MemoEntry, keys: string[], values: unknown[]) =>
  e.keys.length === keys.length &&
  e.keys.every((k, i) => k === keys[i] && (NOT_DERIVED.has(k) || e.values[i] === values[i])) &&
  e.keys.some((k, i) => NOT_DERIVED.has(k) && e.values[i] !== values[i]);

/** The memo of a scene: a new one when its top-level values are not the ones it was made for. */
function memoOf(s: KitchenScene) {
  const keys = Object.keys(s),
    values = Object.values(s);
  let entry = memo.get(s);
  if (!entry || entry.values.length !== values.length || entry.values.some((v, i) => v !== values[i])) {
    const shared = recent.find((e) => ratesAlone(e, keys, values));
    entry = shared ? { ...shared, keys, values } : { keys, values, byModule: new WeakMap(), parts: [] };
    memo.set(s, entry);
    recent.unshift(entry);
    recent.length = Math.min(recent.length, RECENT);
  }
  return entry;
}

function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}

/** The scene with `m` in place of the module of its id, or added; the scene itself when `m` is already in it. */
export function sceneWith(s: KitchenScene, m: Rec): KitchenScene {
  if (s.modules.includes(m)) return s;
  return { ...s, modules: s.modules.some((x) => x.id === m.id) ? s.modules.map((x) => (x.id === m.id ? m : x)) : [...s.modules, m] };
}

/** The derived record of a module in a scene (frozen: copy before changing it). */
export function derived(s: KitchenScene, m: Rec, reading = false): Rec {
  const entry = memoOf(s),
    saved = entry.byModule.get(m) ?? [],
    slot = reading ? 1 : 0;
  if (!entry.byModule.has(m)) entry.byModule.set(m, saved);
  return (saved[slot] ??= deepFreeze(derive(s, m, reading)));
}

/**
 * The holes of the runner of the level and of its hooks (MOD-DEC-514, 277; FINDINGS 1863), from its BAZIS kit as the
 * box of the wardrobe (1862): in the inner face of each side of the carcass, over the underside of the bottom of the
 * box, from the front of the runner; in the rear face of the back of the box, from its ends, over its lower edge.
 */
function runnerHoles(s: KitchenScene, m: Rec, parts: Rec[], holes: MechanismHole[]): void {
  const boxes = new Map<string, Rec[]>();
  for (const p of parts.filter((p: Rec) => p.drawerRunner)) boxes.set(p.drawerId, [...(boxes.get(p.drawerId) ?? []), p]);
  for (const [did, own] of boxes) {
    const r = own[0]!.drawerRunner,
      c = r.concealed,
      id = did + '/runner',
      left = own.find((p) => p.partId.endsWith(':left-side')),
      back = own.find((p) => p.partId.endsWith(':box-rear')),
      common = { mechanismId: id, holeSource: 'KIT_FR3D' as const, holeSourceRef: c.holeRef, completeness: 'COMPLETE' as const };
    if (!left || !back) continue;
    const y = left.box[2] + c.bottomRecessMm + c.carcassHoleAboveBottomMm;
    for (const [k, inward] of [['L', -1], ['R', 1]] as const) {
      const side = parts.find((p: Rec) => p.partId === m.id + ':side:' + k);
      if (!side) continue;
      for (const [j, z] of (r.cabinetMountZ as number[]).entries())
        holes.push(
          mechanismHole(s, m, {
            ...common,
            operationId: id + '/' + side.partId + '/screw/' + (j + 1),
            kind: 'Отверстие направляющей ' + r.article,
            partId: side.partId,
            machiningRole: 'RUNNER_SCREW',
            diameter: c.carcassHoleDiameterMm,
            depth: c.carcassHoleDepthMm,
            localEntry: [inward < 0 ? side.box[1] : side.box[0], y, r.runnerZ + z],
            localNormal: [inward, 0, 0],
            station: j + 1,
          }),
        );
    }
    const h = c.rearHook;
    for (const [j, x] of [back.box[0] + h.fromSideMm, back.box[1] - h.fromSideMm].entries())
      holes.push(
        mechanismHole(s, m, {
          ...common,
          operationId: id + '/' + back.partId + '/hook/' + (j + 1),
          kind: 'Крючок направляющей ' + r.article,
          partId: back.partId,
          machiningRole: 'RUNNER_HOOK',
          diameter: h.diameterMm,
          depth: h.depthMm,
          localEntry: [x, back.box[2] + h.aboveBottomMm, back.box[5]],
          localNormal: [0, 0, -1],
          station: j + 1,
        }),
      );
  }
}

/**
 * The hanger of the level of a new wall cabinet (MOD-DEC-413, 277; FINDINGS 2754): its holes in the inner face of each
 * side as its BAZIS kit places them — down from the underside of the top, forward from the front face of the back,
 * the right one the mirror of the left — and the cut-out of the back at each upper corner (on the part of the back that
 * holds the corner). What the catalogue does not give stays open in the record of the module.
 */
function hangerPlan(s: KitchenScene, m: Rec, d: Rec, holes: MechanismHole[]): Rec | null {
  if (!levelHanger(m)) return null;
  const sel = kitchenHanger(s.hardware, m),
    h = sel.chosen,
    open = sel.checks.filter((c) => c.status !== 'PASS').map((c) => c.text);
  if (!h) return { id: null, tier: sel.tier, open: [`навеса уровня в каталоге нет или он не подходит: ${sel.substitution?.text ?? 'нет навеса'}`] };
  const id = m.id + '/hangers',
    on = (suffix: string) => d.parts.find((p: Rec) => p.partId === m.id + suffix),
    top = on(':top'),
    backs = d.parts.filter((p: Rec) => p.moduleId === m.id && p.materialRole === 'BACK' && p.partId.startsWith(m.id + ':back')),
    t = m.panelThickness ?? 16,
    under = top?.box ? top.box[2] : m.height - t,
    face = backs[0]?.box?.[4],
    ref = h.sideHoles.ref,
    common = { mechanismId: id, holeSource: 'KIT_FR3D' as const, holeSourceRef: ref ? `${ref.doc}: ${ref.page}` : h.id, completeness: 'COMPLETE' as const };
  if (h.sideHoles.value && Number.isFinite(face))
    for (const [k, inward] of [['L', -1], ['R', 1]] as const) {
      const side = on(':side:' + k);
      if (!side) continue;
      for (const [j, o] of h.sideHoles.value.entries())
        holes.push(
          mechanismHole(s, m, {
            ...common,
            operationId: `${id}/${side.partId}/${o.marking ? 'mark' : 'hole'}/${j + 1}`,
            kind: `Навес ${h.brand} ${h.series}${o.marking ? ', разметка' : ''}`,
            partId: side.partId,
            machiningRole: o.marking ? 'HANGER_MARK' : 'HANGER_FIXING',
            diameter: o.diameterMm,
            depth: o.depthMm,
            localEntry: [inward < 0 ? side.box[1] : side.box[0], under - o.fromTopMm, face - o.fromBackMm],
            localNormal: [inward, 0, 0],
            station: j + 1,
          }),
        );
    }
  const cut = h.backCutout.value,
    inner = [t, m.width - t];
  if (cut)
    for (const p of backs) {
      const [x0, x1, y0, y1, z0, z1] = p.box as number[],
        boxes = [
          [x0!, Math.min(x1!, inner[0]! + cut.widthMm)],
          [Math.max(x0!, inner[1]! - cut.widthMm), x1!],
        ]
          .filter(([a, b]) => b! - a! > EPS && y1! > under - cut.heightMm + EPS)
          .map(([a, b]) => [a!, b!, Math.max(y0!, under - cut.heightMm), y1!, z0!, z1!]);
      if (boxes.length) p.hangerNotches = boxes.map((box, i) => ({ id: `${p.partId}/hanger-notch/${i + 1}`, mechanismId: id, localBox: box }));
    }
  for (const [k, v] of [
    ['sideHoles', 'присадка навеса в боковине'],
    ['backSetbackMm', 'место задника за навесом'],
    ['backCutout', 'вырез задника под навес'],
  ] as const)
    if (h[k].status === 'UNKNOWN') open.push(`${h.id}: ${v} не задана в каталоге`);
  return { id: h.id, tier: sel.tier, fixing: h.fixing, drilling: h.sideHoles.value !== null, substitution: sel.substitution?.text ?? null, open };
}

/** The fixed shelves of a carcass that may carry a seam of its back (MOD-DEC-701): a removable shelf does not. */
const FIXED_SHELF = /^(Полка|Полка нижней зоны|Полка верхней зоны|Разделитель зон|Фиксированная опора техники|Полка над вытяжкой)$/;

/**
 * MOD-DEC-701 (FINDINGS 2600): the back of HDF of a carcass in parts, as the wardrobe's (splitBackPanel,
 * engine/policy/back-split.ts). A kitchen carcass has no partitions: a back wider and higher than the limit — of a
 * tall cabinet wider than about 820 mm — is split across on the fixed shelf that reaches it nearest to the middle of
 * its height, with no such shelf along on H-profiles. The first part keeps the id of the back, the others follow it
 * as `<id>-P2`…, the name says which part it is; the holes of the back move to the part they are in. The seams stay
 * in `d.backSeams` for the joints of the graph and the hardware.
 */
function splitBack(m: Rec, d: Rec): void {
  const at = d.parts.findIndex((p: Rec) => p.partId === m.id + ':back' && p.materialRole === 'BACK');
  if (at < 0) return;
  const back = d.parts[at]!,
    [x0, x1, y0, y1, z0, z1] = back.box as number[],
    eps = tolerance.constants.compare.value,
    plan = splitBackPanel({
      x0: x0!,
      x1: x1!,
      y0: y0!,
      y1: y1!,
      partitions: [],
      shelves: d.parts
        .filter((p: Rec) => p.moduleId === m.id && FIXED_SHELF.test(p.name) && !p.removableShelf && !p.drawerId && p.box && p.box[5] >= z0! - eps)
        .map((p: Rec) => ({ id: p.partId, at: (p.box[2] + p.box[3]) / 2, from: p.box[0], to: p.box[1] })),
      reachMm: m.panelThickness ?? 16,
      compareMm: eps,
    }),
    n = plan.pieces.length;
  if (n < 2) return;
  const ids = plan.pieces.map((_, k) => (k ? `${back.partId}-P${k + 1}` : back.partId)),
    pieces = plan.pieces.map((b, k) => {
      const w = b.x1 - b.x0,
        h = b.y1 - b.y0,
        // The holes of the back (SAH216 access) are measured from its upper left corner: they move to their part.
        operations = (back.operations ?? [])
          .filter((o: Rec) => {
            const x = x0! + o.x,
              y = y1! - o.fromTop;
            return x >= b.x0 && x < b.x1 && y > b.y0 && y <= b.y1;
          })
          .map((o: Rec) => ({ ...o, x: o.x - (b.x0 - x0!), fromTop: o.fromTop - (y1! - b.y1) }));
      return {
        ...back,
        partId: ids[k],
        name: `${back.name}, часть ${k + 1} из ${n}`,
        finished_mm: [w, h, back.finished_mm[2]],
        blank_mm: [w, h, back.blank_mm[2]],
        box: [b.x0, b.x1, b.y0, b.y1, z0, z1],
        ...(back.operations ? { operations } : {}),
        // Which edges of the whole back the part keeps: those stand in the quarter or the groove of the carcass.
        backPiece: { backId: back.partId, index: k, count: n, left: b.x0 === x0, right: b.x1 === x1, bottom: b.y0 === y0, top: b.y1 === y1 },
      };
    });
  d.parts.splice(at, 1, ...pieces);
  d.backSeams = plan.seams.map((x) => ({ moduleId: m.id, axis: x.axis, at: x.at, from: x.from, to: x.to, supportId: x.supportId, partIds: x.pieces.map((i) => ids[i]) }));
}

/**
 * The derived parts of a module (derived, outermost: khr r1.html:79374): the parts with their fasteners, fronts,
 * supports and hardware planning. `reading` is the read of the fastener inventory: no fasteners of its own.
 */
function derive(s: KitchenScene, m: Rec, reading: boolean): Rec {
  // constructionDerived gives a copy of its own: the copies of it here are left out (KF-23, FINDINGS 570).
  const d = constructionDerived(s, m, reading);
  if (!d.parts?.length) return d;
  splitBack(m, d);
  // An edge handle or a profile (FINDINGS 3216): the fronts shorter by its rise first, so the hinges and the cutting
  // read their sizes; the doors opened by pressing have no handle.
  trimForEdgeHandle(s, m, d.parts, new Set(kitchenPushToOpen(s) ? leafGroups(m, d).filter((g) => sharedHinge(m, g)).map((g) => g.id) : []));
  const holes: MechanismHole[] = [],
    // The shelf supports first: a hinge plate keeps clear of their holes on the plate line (159, as in the wardrobe).
    supports = shelfSupportPlans(s, m, d.parts, system32On(s), holes),
    groups = leafGroups(m, d),
    doors = groups.filter((g) => sharedHinge(m, g)).map((g) => g.parts[0]),
    lifts = groups.map((g) => levelLiftOf(s, m, g)),
    // A front of a new module lifted by FLAP hangs on hinges in the top (FINDINGS 3350); HK-S stays the prototype's.
    leaves = groups.map((g, i) => (lifts[i]?.row ? flapPlan(s, m, g, d.parts, holes, lifts[i]!) : sharedHinge(m, g) ? sharedHingePlan(s, m, g, d.parts, doors, holes) : leafPlan(m, g))),
    // MOD-DEC-485 (FINDINGS 3212): the doors of the shared hinge open by pressing — a latch each, no handle.
    pushDoors = kitchenPushToOpen(s) ? pushLatchPlans(s, m, groups.filter((g) => sharedHinge(m, g)), d.parts, holes) : [],
    mech = mechanism(m, d);
  runnerHoles(s, m, d.parts, holes);
  const hanger = hangerPlan(s, m, d, holes);
  for (const h of holes) {
    const p = d.parts.find((x: Rec) => x.partId === h.partId)!;
    p.operations = [...(p.operations || []), { ...h, id: h.operationId, moduleId: m.id }];
    if (p.drillingStatus === 'UNKNOWN') p.drillingStatus = 'NOMINAL_DRAFT_PRODUCTION_HOLD';
  }
  const lift = lifts.find(Boolean);
  d.hardwarePlanning = {
    leaves,
    mechanism: mech,
    shelfSupports: supports.plans,
    ...(hanger ? { hanger } : {}),
    ...(pushDoors.length ? { pushDoors } : {}),
    ...(lift ? { lift: { tier: lift.tier, chosen: lift.chosen, liftId: lift.row?.id ?? null, temporary: lift.temporary, note: lift.note } } : {}),
    manufacturingQualified: false,
  };
  if (supports.issues.length) d.system32Moves = supports.issues;
  const fields = leaves.flatMap((x) => x.issues.map((message: string) => ({ field: 'Фурнитура створки ' + x.groupId, status: x.status, message })));
  fields.push(...supports.plans.flatMap((x) => x.issues.map((message: string) => ({ field: 'Полкодержатели ' + x.shelfId, status: 'INCOMPLETE', message }))));
  if (mech) fields.push(...mech.issues.map((message: string) => ({ field: 'Механизм наполнения', status: mech.status, message })));
  if (hanger) fields.push(...hanger.open.map((message: string) => ({ field: 'Навесы', status: 'INCOMPLETE', message })));
  for (const l of leaves.filter((x) => x.flap)) fields.push(...[...l.flap.issues, ...l.flap.open, ...l.flap.drilling.missing].map((message: string) => ({ field: 'Подъёмник ' + l.groupId, status: 'INCOMPLETE', message })));
  d.releaseOpenFields = [...(d.releaseOpenFields || []), ...fields];
  for (const l of leaves)
    for (const p of d.parts.filter((p: Rec) => (p.doorGroupId || p.partId) === l.groupId)) {
      p.hingePlan = clone(l);
      p.manufacturingQualified = false;
    }
  // The pegs of a lift in the sides: the numbers of its profile, temporary until the owner chooses the lift. They are
  // holes of the module like the pins of its hangers, so the price counts what the graph drills (K5, INV-P02, FINDINGS 574).
  for (const l of leaves.filter((x) => PROFILE[x.profileId]?.pegDrilling)) {
    const peg = PROFILE[l.profileId]!.pegDrilling;
    for (const p of d.parts.filter((p: Rec) => p.partId === m.id + ':side:L' || p.partId === m.id + ':side:R'))
      p.operations = [
        ...(p.operations || []),
        ...peg.fromCabinetFrontMm.map((z: number) => ({ kind: LIFT_PEG, diameter: peg.diameterMm, depth: peg.depthMinMm, fromTop: peg.fromCabinetTopMm, fromFront: z, liftGroupId: l.groupId, production: false })),
      ];
  }
  return d;
}

// ---------------------------------------------------------------- the parts of the kitchen

/** The side faces of the carcass of a module in the room (kptSideFaces, r1.html:75648). */
export function sideFaces(s: KitchenScene, record: Rec): Rec[] {
  const m = record.module,
    faces: Rec[] = [];
  for (const p of record.parts) {
    const side = p.partId === m.id + ':side:L' ? 'L' : p.partId === m.id + ':side:R' ? 'R' : null;
    if (!side || p.materialRole !== 'CORPUS' || p.rectangularEnvelopeOnly || p.worldFootprintMm || !p.box?.every(Number.isFinite)) continue;
    const x = side === 'L' ? p.box[0] : p.box[1],
      point = worldBox(s, m, [x, x, 0, 0, 0, 0]),
      q = worldBox(s, m, [x + 1, x + 1, 0, 0, 0, 0]),
      dx = q[0] - point[0],
      dz = q[4] - point[4],
      axis = Math.abs(dx) > Math.abs(dz) ? 0 : 4,
      normal = (axis === 0 ? dx : dz) * (side === 'L' ? -1 : 1),
      box = p.worldBox || worldBox(s, m, p.box),
      t = box[axis + 1] - box[axis];
    if (Math.abs(Math.abs(normal) - 1) > EPS || t <= EPS) continue;
    faces.push({ module: m, part: p, axis, normal: Math.sign(normal), plane: point[axis], box, thicknessMm: t });
  }
  return faces;
}

/** The contact of two opposite side faces (kptFaceContact, r1.html:75676). */
export function faceContact(a: Rec, b: Rec): Rec | null {
  if (a.axis !== b.axis || a.normal !== -b.normal || Math.abs(a.plane - b.plane) > EPS) return null;
  const tangent = a.axis === 0 ? 4 : 0,
    lo = Math.max(a.box[tangent], b.box[tangent]),
    hi = Math.min(a.box[tangent + 1], b.box[tangent + 1]),
    y0 = Math.max(a.box[2], b.box[2]),
    y1 = Math.min(a.box[3], b.box[3]);
  if (hi - lo <= EPS || y1 - y0 <= EPS || Math.min(a.box[a.axis + 1], b.box[b.axis + 1]) - Math.max(a.box[a.axis], b.box[b.axis]) > EPS) return null;
  const actualPartIds = [a.part.partId, b.part.partId].sort(),
    moduleIds = [a.module.id, b.module.id].sort(),
    plane = (a.plane + b.plane) / 2;
  return {
    contactId: 'cabinet-contact:' + actualPartIds.join('|') + ':' + a.axis + ':' + plane,
    physicalId: 'interconnect/' + moduleIds.join('/'),
    moduleIds,
    actualPartIds,
    normalAxis: a.axis === 0 ? 'x' : 'z',
    contactPlaneMm: plane,
    contactWorldMm: a.axis === 0 ? [plane, plane, y0, y1, lo, hi] : [lo, hi, y0, y1, plane, plane],
    contactLengthMm: hi - lo,
    contactHeightMm: y1 - y0,
    contactAreaMm2: (hi - lo) * (y1 - y0),
    stackThicknessMm: a.thicknessMm + b.thicknessMm,
    manufacturingQualified: false,
  };
}

/** The side contact of a peninsula with the end of a row, joined by four connectors 1054519 (kptSideContacts, r1.html:75702). */
export function peninsulaContacts(s: KitchenScene, parts: Rec[]): { contacts: Rec[]; issues: Rec[] } {
  const records = s.modules.map((m) => ({ module: m, parts: parts.filter((p) => p.moduleId === m.id).map((p) => ({ ...p, worldBox: worldBox(s, m, p.box) })) })),
    contacts: Rec[] = [],
    issues: Rec[] = [],
    faces = records.map((r) => ({ record: r, faces: sideFaces(s, r) }));
  for (const r of records) {
    const m = r.module;
    if (m.zone !== 'peninsula') continue;
    const mode = m.attach || 'A';
    if (mode === 'back') {
      issues.push({
        code: 'PENINSULA_REAR_UNQUALIFIED',
        moduleId: m.id,
        text: m.id + ': заднее примыкание не подтверждено несущей задней панелью и соединительным узлом. BACK3 мм и декоративная панель не заменяют боковину. Выберите торец ряда либо размещение «Остров».',
      });
      continue;
    }
    if (mode !== 'end') {
      issues.push({ code: 'PENINSULA_ATTACHMENT_UNSUPPORTED', moduleId: m.id, text: m.id + ': крепление полуострова «' + mode + '» не имеет подтверждённого несущего узла. Выберите фактический торец ряда либо размещение «Остров».' });
      continue;
    }
    const own = faces.find((x) => x.record === r)!.faces,
      candidates: Rec[] = [],
      rejected: string[] = [];
    for (const target of faces) {
      const b = target.record.module;
      if (b.id === m.id || isFree(b) || !['base', 'tall'].includes(b.kind)) continue;
      for (const a of own)
        for (const f of target.faces) {
          const c = faceContact(a, f);
          if (!c) continue;
          if (Math.abs(m.floor - b.floor) > EPS || Math.abs(m.floor + m.height - b.floor - b.height) > EPS) {
            rejected.push(b.id + ': низ и верх корпусов должны совпадать');
            continue;
          }
          if (c.stackThicknessMm < 28 - EPS || c.stackThicknessMm > 36 + EPS) {
            rejected.push(b.id + ': пакет реальных боковин ' + c.stackThicknessMm + ' мм вне 28–36 мм комплекта 1054519');
            continue;
          }
          candidates.push({ ...c, moduleId: m.id, withModuleId: b.id, withPartId: f.part.partId, ownPartId: a.part.partId, commercialSku: '1054519', connectorQuantity: 4 });
        }
    }
    const unique = [...new Map(candidates.map((c) => [c.contactId, c])).values()];
    if (unique.length !== 1) {
      issues.push({
        code: unique.length ? 'PENINSULA_CONTACT_AMBIGUOUS' : 'PENINSULA_CONTACT_MISSING',
        moduleId: m.id,
        candidatePartIds: unique.flatMap((c) => c.actualPartIds),
        text: unique.length
          ? m.id + ': неоднозначный контакт боковин: ' + unique.map((c) => c.actualPartIds.join(' / ')).join('; ') + '. Переместите модуль к одному торцу.'
          : m.id + ': нет единственного физического контакта с боковиной ряда. ' + (rejected.length ? [...new Set(rejected)].join('; ') + '. ' : '') + 'Исправьте X/Y/поворот/высоту либо выберите «Остров».',
      });
      continue;
    }
    contacts.push(unique[0]!);
  }
  const byPair = new Map<string, Rec>();
  for (const c of contacts) {
    const old = byPair.get(c.physicalId);
    if (old && old.contactId !== c.contactId) issues.push({ code: 'PENINSULA_PAIR_AMBIGUOUS', moduleId: c.moduleId, text: c.moduleId + ': для одной пары корпусов получены разные физические контакты.' });
    else byPair.set(c.physicalId, c);
  }
  return { contacts: [...byPair.values()], issues };
}

/**
 * The parts of the kitchen (kflowAllParts with the kcr layer r1.html:76057): the derived parts of the supported modules
 * without their own worktops, a part of a peninsula contact annotated with it, then the whole worktops of the scene.
 */
export function allParts(s: KitchenScene, reading = false): Rec[] {
  // The fasteners of every module read them: kept with the derived records (KF-23, FINDINGS 570).
  return (memoOf(s).parts[reading ? 1 : 0] ??= deepFreeze(partsOf(s, moduleRecords(s, reading), reading)));
}

/** The derived record of every placed module (carcass.ts `placed`), in the order of the scene (the graph reads them with the parts). */
export function moduleRecords(s: KitchenScene, reading = false): { module: Rec; derived: Rec }[] {
  return s.modules.filter(placed).map((m) => ({ module: m, derived: derived(s, m, reading) }));
}

/** The parts of the kitchen from the records of its modules (allParts). */
export function partsOf(s: KitchenScene, records: { module: Rec; derived: Rec }[], reading = false): Rec[] {
  const parts = records.flatMap((r) => r.derived.parts ?? []).filter((p: Rec) => p.materialRole !== 'WORKTOP'),
    contacts = peninsulaContacts(s, parts).contacts;
  return parts.map((p) => {
    const bound = contacts.filter((c) => c.actualPartIds.includes(p.partId)),
      q = withManualKitchenBands(s, p);
    return bound.length ? { ...q, attachmentContacts: bound.map((c) => ({ ...c })) } : q;
  }).concat(kitchenWorktops(s, new Map(records.map((r) => [r.module.id, r.derived])), reading));
}
