// Hinges and drawer runners: choice of hardware and placement. Numbers: engine/policy/home.ts (FINDINGS 230). The
// hinge kit, its screws and the runner are positions of the hardware catalogue the policy names (HOME.hardwareItems,
// HOME.runnerSlide); their article, dimensions, lengths and loads come from the catalogue given as an argument (CAT-4).
// Rule set r5 (MOD-DEC-513 over 341; FINDINGS 841, 842): the hinges of the wardrobe — the pair «hinge + plate» of the
// manufacturer's table for the overlay (selectHinge: 073, 286, 329), the count by the chart of the chosen hinge (190),
// the stations of the wardrobe doors (hingeStations: 378, 159) and the holes of the kit or the catalogue (277).
import { articleDimension, articleItem } from '../catalog/hardware/articles.js';
import type { DrawerSlide, DrawerSlideLength } from '../catalog/hardware/drawer-slides.js';
import type { Lift } from '../catalog/hardware/lifts.js';
import type { CabinetLight, Caster, Handle, Leg, PowerSupply, PushLatch } from '../catalog/hardware/fittings.js';
import { hingeChartFor, type HingeChartRow } from '../catalog/hardware/hinges.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { HardwareTier, ShelfSupport } from '../catalog/hardware/shelf-supports.js';
import { minimalHingeCount } from '../engine/invariants/checks.js';
import type { HardwareVisual, Vec3 as EngineVec3 } from '../engine/contract.js';
import { fittingsSelection, handleFor, latchFor, latchPlacement, legFor, legStations, lightFor, powerSupplyFor } from '../engine/policy/fittings-selection.js';
import { hingeDrillingScheme, hingeSelection, selectHinge, type HingeDemand, type SchemeHole } from '../engine/policy/hinge-selection.js';
import { HOME, HOME_SHELF_SUPPORT, homeRules, system32Rows } from '../engine/policy/home.js';
import { liftWorkingAngle, selectLift, type LiftCheck, type LiftDemand, type LiftWorkingAngle } from '../engine/policy/lift-selection.js';
import {
  selectShelfSupport,
  shelfLowerAboveAxis,
  shelfSupportBodyColour,
  shelfSupportKit,
  shelfSupportScheme,
  shelfSupportSelection,
  type ShelfSupportKit,
  type ShelfSupportScheme,
  type ShelfSupportSelection,
} from '../engine/policy/shelf-support-selection.js';
import { ballRunnerKitHoles, buildableRunner, concealedBoxWalls, concealedRunner, drawerMovingMassKg as movingMassKg, pickDrawerRunner } from '../engine/drawer-runner.js';
import { selectDrawerSlide, type DrawerSlideSelection } from '../engine/policy/drawer-slide-selection.js';
import type { TierSubstitution } from '../engine/policy/hardware-tier.js';
import { s32Snap } from '../engine/policy/system32.js';
import { wardrobeFacades } from '../engine/policy/wardrobe-facades.js';
import { wardrobeFill } from '../engine/policy/wardrobe-fill.js';
import { hingeStations } from '../wardrobe/facades.js';
import { doorHandleCentre, handleVisual } from '../wardrobe/fittings.js';
import { aFront, allFronts, availableBays, backDepthMm, bay, foot, frontGeometry, frontT, glassOf, hdfDrawerBottomOf, nicheLimits, outerBoundary, partitionFrom, topT, wallHangingOf } from './geometry.js';
import type { AxisIndex, BeamLoad, Body, Door, Front, GraphPart, HomeProject, RunnerInfo, SemanticRole, Shelf, Vec3 } from './types.js';

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Owner rule: nominal profile, or a bounded 5 % exception on one parameter while the other keeps 5 % reserve. */
export function ownerHingeCandidate(H: number, m: number, Hmax: number, Mmax: number): string | null {
  if (H <= Hmax && m <= Mmax) return 'normal';
  if (H > Hmax && H * 100 <= Hmax * 105 && m * 100 < Mmax * 95) return 'height_exception';
  if (m > Mmax && m * 100 <= Mmax * 105 && H * 100 < Hmax * 95) return 'mass_exception';
  return null;
}

export interface HingeProfile {
  status: 'UNKNOWN' | 'CONFLICT' | 'RESEARCH_BOUNDED' | 'LIFT';
  count: number | null;
  mass: number;
  reason: string | null;
  stations?: number[];
  nominalStations?: number[];
  obstacleIds?: string[];
  [extra: string]: unknown;
}

const HINGE_ROWS = HOME.hingeRows;
const HINGE_MIN_PITCH = HOME.hingeMinPitch;

/** The hinges of a door by the rule set of the project: the table of r3 (r3, r4) or the wardrobe's selection (r5). */
export function hingeProfile(p: HomeProject, hw: HardwareCatalogs, b: Body, f: Door): HingeProfile {
  // r5 (MOD-AI-40): a flap front holds on the arms of its lift, it has no hinges (homeLift).
  if (f.lift && homeRules(p).flapFronts) return { status: 'LIFT', count: 0, mass: frontMassKg(p, b, f), reason: null, stations: [] };
  return homeRules(p).hingeRule === 'WARDROBE' ? wardrobeHingeProfile(p, hw, b, f) : tableHingeProfile(p, hw, b, f);
}

/** The mass of a front: its volume × the density of the board of the project (355), of a glass door of its glass (MOD-AI-37), kg. */
function frontMassKg(p: HomeProject, b: Body, f: Front): number {
  const g = frontGeometry(p, b, f);
  return (g.w * g.h * g.d * (glassOf(p, f)?.densityKgM3 ?? p.density)) / 1e9;
}

/** The lift of a flap front (r5, MOD-AI-40): the row of the lift catalogue by INV-D18-01, as the wardrobe's (320). */
export interface HomeLift {
  demand: LiftDemand;
  /** SELECTED — a compatible row; TEMPORARY — the nearest one (the owner's rule of 2026-10-22); NOT_FOUND — none. */
  status: 'SELECTED' | 'TEMPORARY' | 'NOT_FOUND';
  row: Lift | null;
  checks: LiftCheck[];
  loadValue: number | null;
  reason: string | null;
  workingAngle: LiftWorkingAngle | null;
  quantity: number;
}

/**
 * The lift of a flap front (r5, MOD-AI-40, FINDINGS 3314): the demand of the body and the front — the outer height and
 * width of the body, the height, the thickness and the mass of the front; the mass of the handle is not known, the
 * check says so (as the wardrobe without `liftHandleMassKg`).
 */
export function homeLift(p: HomeProject, hw: HardwareCatalogs, b: Body, f: Door): HomeLift {
  const g = frontGeometry(p, b, f),
    demand: LiftDemand = { frontKind: 'FLAP', carcassHeightMm: b.h, carcassWidthMm: b.w, frontHeightMm: g.h, frontThicknessMm: g.d, frontMassKg: frontMassKg(p, b, f), handleMassKg: null },
    selection = selectLift(demand, hw.lifts),
    row = selection.chosen ?? selection.temporary,
    candidate = selection.candidates.find((c) => c.liftId === row?.id) ?? null;
  return {
    demand,
    status: selection.chosen ? 'SELECTED' : row ? 'TEMPORARY' : 'NOT_FOUND',
    row,
    checks: candidate?.checks ?? [],
    loadValue: candidate?.loadValue ?? null,
    reason: selection.reason,
    workingAngle: row ? liftWorkingAngle(row) : null,
    quantity: row?.kitsPerFront ?? 1,
  };
}

/** Number and heights of BOYARD H301A02 hinges, avoiding shelves and boards inside the swing reservation (r3, r4). */
function tableHingeProfile(p: HomeProject, hw: HardwareCatalogs, b: Body, f: Door): HingeProfile {
  const g = frontGeometry(p, b, f),
    mass = (g.w * g.h * g.d * p.density) / 1e9 + HOME.doorHardwareReserveKg;
  const row = HINGE_ROWS.find((r) => ownerHingeCandidate(g.h, mass, r.height, r.mass));
  const exterior = (f.hinge === 'left' ? f.lo : f.hi) === (f.hinge === 'left' ? 'left' : 'right');
  if (p.thickness !== HOME.hingeBoardThickness || !exterior || !row || g.h - 2 * HOME.hingeEndOffset < (row.count - 1) * HINGE_MIN_PITCH)
    return {
      status: 'UNKNOWN',
      count: null,
      mass,
      reason: 'Для этой двери нет применимого подтверждённого профиля установки.',
    };
  const e = HOME.hingeEndOffset,
    sweep = HOME.hingeSweep,
    plate = HOME.hingePlateSweep;
  const nominal = Array.from({ length: row.count }, (_, k) => f.y + e + (k * (f.h - 2 * e)) / (row.count - 1)),
    left = f.hinge === 'left',
    innerX = left ? p.thickness : b.w - p.thickness;
  const reservedBoxes = [
    { x: left ? innerX : innerX - sweep.width, y: g.d, w: sweep.width, d: sweep.depth, lower: -sweep.below, upper: sweep.above },
    {
      x: left ? innerX : innerX - plate.width,
      y: aFront(p, b) + HOME.hingePlateOffset - HOME.hingePlateZone,
      w: plate.width,
      d: 2 * HOME.hingePlateZone,
      lower: -plate.below,
      upper: plate.above,
    },
  ];
  const obstacles = [
    { id: b.id + ':bottom', x: p.thickness, y: aFront(p, b), w: b.w - 2 * p.thickness, d: b.d - aFront(p, b), z: foot(p, b), h: p.thickness },
    { id: b.id + ':top', x: 0, y: 0, w: b.w, d: b.d, z: b.h - topT(p), h: topT(p) },
  ];
  if (b.back)
    obstacles.push({
      id: b.id + ':back',
      x: p.thickness,
      y: b.d - backDepthMm(p, b),
      w: b.w - 2 * p.thickness,
      d: backDepthMm(p, b),
      z: foot(p, b) + p.thickness,
      h: b.h - topT(p) - foot(p, b) - p.thickness,
    });
  for (const s of b.shelves) {
    const sb = bay(p, b, s),
      gap = s.fixed ? 0 : HOME.adjustableShelfSideGap;
    obstacles.push({
      id: s.id,
      x: sb.left + gap,
      y: aFront(p, b) + HOME.shelfFrontSetback,
      w: sb.right - sb.left - 2 * gap,
      d: b.d - p.thickness - aFront(p, b) - HOME.shelfFrontSetback,
      z: s.y,
      h: p.thickness,
    });
  }
  for (const q of b.partitions)
    obstacles.push(
      q.from === undefined
        ? {
            id: q.id,
            x: q.x - p.thickness / 2,
            y: aFront(p, b),
            w: p.thickness,
            d: b.d - p.thickness - aFront(p, b),
            z: foot(p, b) + p.thickness,
            h: b.h - topT(p) - foot(p, b) - p.thickness,
          }
        : // r5 (MOD-AI-75): a partition on a shelf, from it up to the top, at the front of the shelf.
          {
            id: q.id,
            x: q.x - p.thickness / 2,
            y: aFront(p, b) + HOME.shelfFrontSetback,
            w: p.thickness,
            d: b.d - p.thickness - aFront(p, b) - HOME.shelfFrontSetback,
            z: partitionFrom(p, b, q),
            h: b.h - topT(p) - partitionFrom(p, b, q),
          },
    );
  const forbidden = obstacles.flatMap((o) =>
    reservedBoxes
      .filter(
        (r) =>
          Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x) > 0.1 &&
          Math.min(r.y + r.d, o.y + o.d) - Math.max(r.y, o.y) > 0.1,
      )
      .map((r) => ({ lo: o.z - r.upper - 0.1, hi: o.z + o.h - r.lower + 0.1, partId: o.id })),
  );
  const lo = nominal[0],
    hi = nominal[nominal.length - 1],
    safe = (z: number) =>
      z >= lo - 0.001 && z <= hi + 0.001 && !forbidden.some((q) => z > q.lo + 0.001 && z < q.hi - 0.001);
  let stations = nominal;
  if (!nominal.every(safe)) {
    const values = [...new Set([lo, hi, ...nominal, ...forbidden.flatMap((q) => [q.lo, q.hi])])]
        .filter(safe)
        .sort((a, c) => a - c),
      first = values[0],
      last = values[values.length - 1];
    let feasible = values.length > 1 && last - first >= (row.count - 1) * HINGE_MIN_PITCH - 0.001;
    if (feasible && row.count === 2) stations = [first, last];
    if (feasible && row.count === 3) {
      const middle = [...new Set([...values, first + HINGE_MIN_PITCH, last - HINGE_MIN_PITCH, nominal[1]])]
        .filter((z) => safe(z) && z - first >= HINGE_MIN_PITCH - 0.001 && last - z >= HINGE_MIN_PITCH - 0.001)
        .sort((a, c) => Math.abs(a - nominal[1]) - Math.abs(c - nominal[1]) || a - c)[0];
      feasible = middle !== undefined;
      if (feasible) stations = [first, middle, last];
    }
    if (!feasible)
      return {
        status: 'CONFLICT',
        count: null,
        mass,
        nominalStations: nominal,
        reason:
          'Петля пересекает полку или внутреннюю опору; для ' +
          row.count +
          ' петель с шагом не менее ' +
          HINGE_MIN_PITCH +
          ' мм нет свободных станций. Переместите полку или измените размеры.',
        obstacleIds: [...new Set(forbidden.map((q) => q.partId))],
        physicalQualified: false,
      };
  }
  const kit = articleItem(hw.articles, HOME.hardwareItems.hinge),
    screw = articleItem(hw.articles, HOME.hardwareItems.hingeScrew);
  return {
    status: 'RESEARCH_BOUNDED',
    count: row.count,
    mass,
    reason: ownerHingeCandidate(g.h, mass, row.height, row.mass),
    stations,
    nominalStations: nominal,
    stationAllocation: stations === nominal ? 'NOMINAL' : 'ADJUSTED_FOR_OBSTACLES',
    reservation: {
      extentMm: [sweep.width, sweep.depth, sweep.below + sweep.above],
      manufacturerEnvelopeConfirmed: false,
      assumedDriverRadiusMm: HOME.hingeDriver.radius,
      assumedDriverLengthMm: HOME.hingeDriver.length,
      knownCupDiameterMm: articleDimension(kit, 'cupDiameterMm'),
      knownCupDepthMm: articleDimension(kit, 'cupDepthMm'),
      nominalMountScrewDiameterMm: articleDimension(screw, 'diameterMm'),
      nominalMountScrewLengthMm: articleDimension(screw, 'lengthMm'),
      pilotHeadTipQualified: false,
    },
    sku: kit.article,
    includedPlate: kit.includedPlate ?? null,
    additionalPlateQuantity: 0,
    physicalQualified: false,
  };
}

/** The panel a door hangs on: the boundary of its hinge side, a carcass side or a partition. */
export const hingeBoundary = (f: Door): string => (f.hinge === 'left' ? f.lo : f.hi);

/** Graph id of the vertical of a boundary of a body. */
export const boundaryPartId = (b: Body, ref: string): string => b.id + ':' + (ref === 'left' ? 'side-left' : ref === 'right' ? 'side-right' : ref);

/** A hole of the drilling scheme of a hinge whose diameter and depth the kit or the catalogue gives. */
export type NumberedSchemeHole = SchemeHole & { diameterMm: number; depthMm: number };

/**
 * r5 (MOD-DEC-513, FINDINGS 841): the hinges of a door by the rules of the wardrobe and the kitchen (W4, K3).
 * - Place (286): a door on a carcass side or on a partition with no front beside it overlays it as an outer side
 *   (CARCASS_EDGE, H316A02), a door on a partition shared with another front — half (PARTITION, H316B02 + H5112).
 * - Count (190): the chart of the chosen hinge, the 5 % / 95 % rule; a door beyond the chart or wider than its
 *   facade width keeps the largest count of the chart and says so (HINGE_CHART), as in the wardrobe.
 * - Mass (355): volume of the door × density of the board of the project; the 0,5 kg reserve of r3 is gone (842).
 * - Stations (378, 159): 96 mm from the ends, the ladder ±32…±96 mm away from a shelf pin on the plate line (22 mm)
 *   and from a fixed shelf of the bay (the plate holes 22 mm clear of its board, (Д) FINDINGS 841); a station the
 *   ladder cannot free stays and the door says so (HINGE_SHELF).
 */
function wardrobeHingeProfile(p: HomeProject, hw: HardwareCatalogs, b: Body, f: Door): HingeProfile {
  const R = homeRules(p),
    g = frontGeometry(p, b, f),
    a = bay(p, b, f),
    left = f.hinge === 'left',
    ref = hingeBoundary(f),
    outer = outerBoundary(p, b, f, ref),
    overlayMm = left ? a.left - g.x : g.x + g.w - a.right,
    neighbours = allFronts(b)
      .filter((o) => o !== f)
      .map((o) => frontGeometry(p, b, o))
      .filter((o) => Math.min(o.y + o.h, g.y + g.h) - Math.max(o.y, g.y) > 1e-6)
      .map((o) => (left ? g.x - (o.x + o.w) : o.x - (g.x + g.w)))
      .filter((x) => x >= -1e-6),
    demand: HingeDemand = {
      position: outer ? 'CARCASS_EDGE' : 'PARTITION',
      overlayMm,
      facadeThicknessMm: g.d,
      panelThicknessMm: p.thickness,
      neighbourGapMm: neighbours.length ? Math.min(...neighbours) : null,
      depthGapMm: R.frontDepthGap,
      innerDrawerBehind: false,
      openingLimitDeg: null,
      // r5 (MOD-AI-37): a glass door takes a hinge for glass of the catalogue by its table of overlays.
      ...(glassOf(p, f) ? { application: 'GLASS' as const } : {}),
      // r5 (MOD-AI-36): a door opened by pressing takes a hinge without a spring (483, 485).
      ...(pushDoor(p, f) ? { pushToOpen: true } : {}),
    },
    catalog = hw.hinges,
    selection = selectHinge(demand, catalog),
    chosen = selection.chosen,
    hinge = catalog.hinges.find((h) => h.id === (chosen?.hingeId ?? hingeSelection.constants.preferredHinges.value[0]))!,
    plate = chosen ? catalog.plates.find((x) => x.id === chosen.plateId)! : null,
    chart = hingeChartFor(hinge),
    mass = frontMassKg(p, b, f),
    byRule = chart ? minimalHingeCount(g.h, mass, chart.rows) : null,
    count = byRule ?? Math.max(...(chart?.rows ?? [{ n: 2 }]).map((r) => r.n)),
    scheme = chosen ? hingeDrillingScheme(chosen, catalog, demand) : null,
    numbered = (h: SchemeHole): h is NumberedSchemeHole => h.diameterMm !== null && h.depthMm !== null,
    facadeHoles = scheme?.holes.filter((h) => h.part === 'FACADE').filter(numbered) ?? [],
    plateHoles = scheme?.holes.filter((h) => h.part === 'PANEL').filter(numbered) ?? [],
    plateAcross = plateHoles[0]?.acrossMm ?? null,
    plateAlong = plateHoles.length ? [...new Set(plateHoles.map((h) => h.alongMm))] : [0],
    // Heights above the floor of the body: a station of the door and what lies on the plate line of its panel.
    plateAt = (st: number) => g.y + st,
    clearance = wardrobeFacades.constants.plateHoleClearance.value,
    // r5: the support holes of the wardrobe on that line, at their axis on the grid (FINDINGS 844).
    pins =
      plateAcross === null
        ? []
        : R.shelfSupportRule === 'WARDROBE'
          ? b.shelves
              .filter((s) => !s.fixed && (s.lo === ref || s.hi === ref))
              .map((s) => homeShelfSupport(p, hw, b, s))
              .filter((x) => x.axisMm !== null && !!x.support && x.ends.some((e) => e.ref === ref && e.linesFromFrontMm.some((l) => Math.abs(l - plateAcross) < 1)))
              .map((x) => x.axisMm!)
          : b.shelves
            .filter((s) => !s.fixed && (s.lo === ref || s.hi === ref))
            .filter((s) => {
              const rows = system32Rows(b.d - p.thickness - aFront(p, b), ref !== 'left' && ref !== 'right' && s.lo === ref);
              return !!rows && Math.abs(rows[0] - plateAcross) < 1;
            })
            .map((s) => s.y - HOME.shelfPinBelowShelf),
    fixed = b.shelves.filter((s) => s.fixed && s.lo === f.lo && s.hi === f.hi),
    blocked = (st: number) => plateAlong.some((al) => fixed.some((s) => plateAt(st) + al > s.y - clearance && plateAt(st) + al < s.y + p.thickness + clearance)),
    stations = hingeStations(g.h, count, plateAlong, plateAt, [...pins], blocked),
    clash = stations.some(blocked),
    missing = [...(scheme?.missing ?? [])];
  if (scheme?.holes.some((h) => !numbered(h))) missing.push(`${hinge.article}: диаметр или глубина отверстия не даны`);
  const outOfChart = byRule === null || (chart?.maxWidthMm != null && g.w > chart.maxWidthMm),
    pair = chosen ? `${hinge.brand} ${hinge.article} + ${plate!.article}` : null;
  return {
    status: chosen ? 'RESEARCH_BOUNDED' : 'UNKNOWN',
    count: chosen ? count : null,
    mass,
    reason: chosen
      ? null
      : `Петля не подобрана: ${selection.notCovered.map((x) => `${x.hingeId} + ${x.plateId}: ${x.reason}`).join('; ') || 'нет кандидатов'}.`,
    stations: chosen ? stations : undefined,
    nominalStations: chosen ? hingeStations(g.h, count, plateAlong, plateAt, []) : undefined,
    stationAllocation: 'WARDROBE_W4',
    sku: chosen ? hinge.article : null,
    hingeId: chosen?.hingeId ?? null,
    plateId: chosen?.plateId ?? null,
    plateArticle: plate?.article ?? null,
    manufacturer: hinge.brand,
    pairName: pair,
    includedPlate: null,
    additionalPlateQuantity: 0,
    panelRef: ref,
    position: demand.position,
    overlayMm,
    cupEdgeDistanceMm: chosen?.cupEdgeDistanceMm ?? null,
    checks: (chosen?.checks ?? []).map((c) => ({ code: c.code, status: c.status, text: c.text })),
    chartBasis: chart?.basis ?? null,
    chartRows: chart?.basis === 'MANUFACTURER' ? JSON.stringify(chart.rows satisfies HingeChartRow[]) : null,
    chartMaxWidthMm: chart?.maxWidthMm ?? null,
    countBasis: byRule === null ? 'CHART_EXCEEDED' : 'MOD-DEC-190',
    outOfChart,
    shelfClash: clash,
    supportedMassKg: mass,
    drilling: scheme ? { source: scheme.source, completeness: missing.length ? 'INCOMPLETE' : scheme.completeness, missing } : { source: null, completeness: 'INCOMPLETE', missing: ['пара петля + планка не подобрана'] },
    facadeHoles,
    plateHoles,
    physicalQualified: false,
  };
}

export function hingeCount(p: HomeProject, hw: HardwareCatalogs, b: Body, f: Door): number {
  const r = hingeProfile(p, hw, b, f);
  if (!r.count) throw Error(r.reason ?? '');
  return r.count;
}

/** The runner of "other furniture" in the catalogue under every box of r3, r4 and of r5 saved before 574: BOYARD DB4501. */
export function homeRunnerSlide(hw: HardwareCatalogs): DrawerSlide {
  const s = hw.drawerSlides.slides.find((x) => x.id === HOME.runnerSlide);
  if (!s) throw new Error(`В каталоге фурнитуры нет направляющей ${HOME.runnerSlide}`);
  return s;
}

/**
 * The gap between the side of the box and the side panel the runner takes: half of the deduction of the catalogue's
 * width rule of the ball runner (DB4501: 2 × 12,7 = 25,4 mm, BOYARD 2024 p. 210). The prototype's 12,8 is not kept
 * in rule set r4 (MOD-DEC-514, FINDINGS 980); r3 keeps it as the reference of the prototype.
 */
export function homeRunnerSideGap(slide: DrawerSlide): number {
  const w = slide.boxWidth.value;
  if (!w || w.kind !== 'OUTER') throw new Error(`У направляющей ${slide.id} в каталоге нет правила наружной ширины короба`);
  return w.deductionMm / 2;
}

/** A letter of the manufacturer's table of a runner length (B…I of DB4501); null — the table leaves it empty. */
function runnerDimension(slide: DrawerSlide, l: DrawerSlideLength, letter: string): number | null {
  const v = l.dimensionsMm?.[letter];
  if (v === undefined) throw new Error(`У направляющей ${slide.id} длины ${l.nominalMm} мм в каталоге нет размера ${letter}`);
  return v;
}

const knownRunnerDimension = (slide: DrawerSlide, l: DrawerSlideLength, letter: string): number => {
  const v = runnerDimension(slide, l, letter);
  if (v === null) throw new Error(`У направляющей ${slide.id} длины ${l.nominalMm} мм в каталоге не задан размер ${letter}`);
  return v;
};

// ---------------------------------------------------------------- r5: the shelf supports of the wardrobe (FINDINGS 844, 845)

const KIT_TIERS: Readonly<Record<HomeProject['kitLevel'], HardwareTier>> = { economy: 'ECONOMY', standard: 'STANDARD', premium: 'PREMIUM' };

/** One end of a removable shelf of r5: the vertical it rests on and the lines of its holes from the vertical's front edge. */
export interface HomeShelfSupportEnd {
  ref: string;
  depthMm: number;
  linesFromFrontMm: number[];
  scheme: ShelfSupportScheme | null;
}

/** The supports of one removable shelf of r5 and where the shelf stands: on its level of System 32 (193). */
export interface HomeShelfSupport {
  shelfId: string;
  selection: ShelfSupportSelection;
  support: ShelfSupport | null;
  /** Lower face of the shelf over the floor of the body: the entered height moved to its level of the grid. */
  lowerMm: number;
  /** The entered height when the shelf was moved to the grid; null — it is on the grid. */
  movedFromMm: number | null;
  /** No level of the grid inside the opening, or no support or number to put the shelf on it: it stays where entered. */
  offGrid: boolean;
  /** Axis of the side holes over the floor of the body; null — no support or no number. */
  axisMm: number | null;
  ends: [HomeShelfSupportEnd, HomeShelfSupportEnd];
  quantity: number;
  kit: ShelfSupportKit | null;
  /** What the supports hold: the load of a pair in the catalogue × the pairs under the shelf (344); null — unknown. */
  capacityKg: number | null;
  completeness: 'COMPLETE' | 'INCOMPLETE';
  missing: string[];
}

/** Depth of the vertical under a shelf end, from its front edge (graph.ts): a side or the desk's shared side, a partition to the back. */
function verticalDepth(p: HomeProject, b: Body, ref: string): number {
  if (ref === 'left' || ref === 'right' || b.kind === 'desk') return b.d - aFront(p, b);
  // r5 (MOD-AI-75): a partition on a shelf has the front and the depth of the shelf.
  return b.partitions.find((q) => q.id === ref)?.from !== undefined ? b.d - aFront(p, b) - p.thickness - HOME.shelfFrontSetback : b.d - aFront(p, b) - p.thickness;
}

/** A partition standing on a shelf (r5, MOD-AI-75): its front is the front of the shelves, not of the carcass. */
const onShelf = (b: Body, ref: string): boolean => b.partitions.find((q) => q.id === ref)?.from !== undefined;

/**
 * The grid of the removable shelf (MOD-DEC-193): the axis of the support on bottom axis + 32n, the bottom axis being
 * its lower face (the pads) + t/2. The lower face of the shelf nearest to `lowerMm` whose shelf stays inside the
 * opening; null — none does.
 */
function gridLower(p: HomeProject, b: Body, s: Shelf, aboveAxisMm: number, lowerMm: number): number | null {
  // r5 (MOD-AI-75): inside its niche — over the shelf a partition of the niche stands on.
  const lim = b.partitions.some((q) => q.from !== undefined) ? nicheLimits(p, b, s) : null,
    base = foot(p, b) + p.thickness / 2,
    inside = lim ? (y: number) => y > lim.shelfLow && y + p.thickness < lim.shelfHigh : (y: number) => y > foot(p, b) + p.thickness && y + p.thickness < b.h - topT(p),
    axis = lowerMm - aboveAxisMm,
    near = s32Snap(axis, base) + aboveAxisMm;
  if (inside(near)) return near;
  const other = s32Snap(axis, base, near > lowerMm ? 'down' : 'up') + aboveAxisMm;
  return inside(other) ? other : null;
}

/**
 * r5 (MOD-DEC-513 over 341; FINDINGS 844, 845): the supports of a removable shelf as the wardrobe and the kitchen take
 * them. The support of the project's level (`kitLevel`: «Стандарт» by default, 223) by selectShelfSupport (193, 332, 344),
 * its axis on the System 32 grid of the bottom (193: the entered height moves to the nearest level, as KF-08), the lines
 * of the holes — 37 mm and D − 37 at a side (Handbook r8 §17.2, FINDINGS 270), the rows of 343 at a partition — and the
 * machining of the scheme of the support at each end. The spare levels ±32 mm are drilled by joinery.ts.
 */
export function homeShelfSupport(p: HomeProject, hw: HardwareCatalogs, b: Body, s: Shelf): HomeShelfSupport {
  const t = p.thickness,
    catalog = hw.shelfSupports,
    r = bay(p, b, s),
    gap = HOME.adjustableShelfSideGap,
    setback = HOME.shelfFrontSetback,
    width = r.right - r.left - 2 * gap,
    depth = b.d - t - aFront(p, b) - setback,
    selection = selectShelfSupport(
      { shelfThicknessMm: t, shelfMaterial: 'CHIPBOARD', payloadKg: p.plannedShelfLoadKg, shelfMassKg: (width * depth * t * p.density) / 1e9, tier: KIT_TIERS[p.kitLevel] },
      catalog,
    ),
    support = selection.chosen ? catalog.supports.find((x) => x.id === selection.chosen!.supportId)! : null,
    above = support ? shelfLowerAboveAxis(support) : null,
    lower = above?.valueMm == null ? null : gridLower(p, b, s, above.valueMm, s.y),
    lowerMm = lower ?? s.y,
    line = wardrobeFill.constants.supportLine.value,
    missing: string[] = [];
  if (!support) missing.push(`Полкодержатель не подобран: ${selection.reason}`);
  else if (above?.valueMm == null) missing.push(`${support.article}: положение полки над осью полкодержателя не дано — ${above?.reason}`);
  const ends = [s.lo, s.hi].map((ref, i): HomeShelfSupportEnd => {
    const D = verticalDepth(p, b, ref),
      side = ref === 'left' || ref === 'right' || b.kind === 'desk',
      lines = side ? [line, D - line] : (system32Rows(D, i === 0) ?? []),
      scheme = support && lines.length ? shelfSupportScheme(support, { linesFromFrontMm: lines, shelfSetbackMm: onShelf(b, ref) ? 0 : setback, shelfDepthMm: depth, shelfEndGapMm: gap }) : null;
    if (!lines.length) missing.push(`Вертикаль ${ref} мельче двух рядов System 32`);
    if (scheme) missing.push(...scheme.missing);
    return { ref, depthMm: D, linesFromFrontMm: lines, scheme };
  }) as [HomeShelfSupportEnd, HomeShelfSupportEnd];
  const load = support?.loadPerPairKg.value ?? null,
    // r5 (MOD-AI-39): a decor of the catalogue — the colour the wardrobe gives it (344).
    colour = (p.decorId ? shelfSupportBodyColour(p.decorId) : HOME_SHELF_SUPPORT.bodyColour[p.material]) ?? null,
    kit = support ? shelfSupportKit(support, colour) : null;
  return {
    shelfId: s.id,
    selection,
    support,
    lowerMm,
    movedFromMm: lower !== null && Math.abs(lower - s.y) > 1e-6 ? s.y : null,
    offGrid: support !== null && above?.valueMm != null && lower === null,
    axisMm: above?.valueMm == null ? null : lowerMm - above.valueMm,
    ends,
    quantity: support ? ends.reduce((n, e) => n + e.linesFromFrontMm.length, 0) : 0,
    kit,
    capacityKg: load === null ? null : load * shelfSupportSelection.constants.loadPairs.value,
    completeness: missing.length ? 'INCOMPLETE' : 'COMPLETE',
    missing: [...new Set(missing)],
  };
}

/** Height over the floor of the body where a removable shelf entered at `lowerMm` stands: r5 — its level of System 32. */
export function shelfLowerMm(p: HomeProject, hw: HardwareCatalogs, b: Body, s: Shelf): number {
  return !s.fixed && homeRules(p).shelfSupportRule === 'WARDROBE' ? homeShelfSupport(p, hw, b, s).lowerMm : s.y;
}

/**
 * What the supports under one removable shelf hold (r4, MOD-DEC-368; H-08): the load of a pair in the catalogue times
 * the pairs under the shelf (344). null when the catalogue gives no load: the limit is unknown, never infinite.
 */
export function shelfSupportCapacityKg(hw: HardwareCatalogs): number | null {
  const load = hw.shelfSupports.supports.find((s) => s.id === HOME.hardwareItems.shelfSupport)?.loadPerPairKg.value ?? null;
  return load === null ? null : load * shelfSupportSelection.constants.loadPairs.value;
}


/**
 * A box too low for the dowels of its inner front: they sit 32 mm inside its connector rows (MOD-DEC-192) and meet
 * in its middle (SMALL_DRAWER_PATTERN of the graph; r4 refuses it, MOD-DEC-343).
 */
export function smallDrawerPattern(boxH: number): boolean {
  const q = Math.min(HOME.connectorRowMax, boxH / HOME.connectorRowFraction);
  return Math.abs(boxH - q - HOME.dowelShift - (q + HOME.dowelShift)) < HOME.smallDrawerPatternBand;
}

/** The runner of one drawer (r5 with `drawerRunner: 'level'`: 466 — FINDINGS 1755) and why it is that one. */
export interface HomeDrawerRunner {
  slide: DrawerSlide;
  /** The selection of 466; null — the runner is DB4501 under every box (r3, r4, r5 saved before 574). */
  selection: DrawerSlideSelection | null;
  /** The runner of the level is not taken: why and what instead (465); null — it is taken. */
  substitution: TierSubstitution | null;
}

/**
 * The runner and its box. A ball runner of the level of r5 (DB4501 of «Эконом») is drilled by its BAZIS kit when the
 * catalogue has its holes (FINDINGS 2746): the box stays the box of the prototype (574); r3, r4 and r5 saved before
 * 574 keep the marks of the prototype.
 */
function slideRunnerInfo(p: HomeProject, b: Body, f: Front, slide: DrawerSlide, level: boolean): RunnerInfo {
  if (slide.kind === 'CONCEALED') return concealedRunnerInfo(p, b, f, slide);
  const n = ballRunnerInfo(p, b, f, slide),
    kitHoles = level ? ballRunnerKitHoles(slide, n.NL) : null;
  return kitHoles
    ? { ...n, kitHoles, mountBasis: 'Отверстия набора БАЗИС направляющей в боковине корпуса и в наружной пласти боковин ящика от переднего края направляющей, на оси направляющей над нижней кромкой боковин.' }
    : n;
}

/**
 * r5 (MOD-DEC-574, the clarification; FINDINGS 1755): the runner of each drawer by 466 — selectDrawerSlide orders the
 * runners of the catalogue: of the level of the hardware of the project, of «Стандарт», then by its order. The first
 * not rejected that the box of "other furniture" is built on (DB4501 with the box of the prototype, a concealed runner
 * with the box of its kit) and that holds the drawer with its load — the front, the box, the reserve of the hardware
 * and the load of the project — is taken; none holds it — the first built on, and the drawer says it is overloaded.
 * Another runner than the level's is said (465). r3, r4 and r5 saved before 574: DB4501 under every box.
 */
export function homeDrawerRunner(p: HomeProject, hw: HardwareCatalogs, b: Body, f: Front): HomeDrawerRunner {
  if (p.drawerRunner !== 'level' || !homeRules(p).drawerRunnerRule) return { slide: homeRunnerSlide(hw), selection: null, substitution: null };
  const tier = KIT_TIERS[p.kitLevel],
    opening = bay(p, b, f),
    selection = selectDrawerSlide(
      { placement: 'EXTERNAL', openingWidthMm: opening.right - opening.left, insideDepthMm: b.d - aFront(p, b) - p.thickness, boxSideThicknessMm: HOME.drawerBoxBoard },
      hw.drawerSlides,
      tier,
    ),
    // The box of "other furniture" is built on the ball runner of r3 and on a concealed runner with the box of its kit.
    taken = pickDrawerRunner(
      selection,
      hw.drawerSlides.slides,
      tier,
      (s) => buildableRunner(s, HOME.runnerSlide),
      (s) => {
        const n = slideRunnerInfo(p, b, f, s, true);
        return { n, massKg: drawerMovingMassKg(p, b, f, n) };
      },
    );
  if (!taken) return { slide: homeRunnerSlide(hw), selection, substitution: null };
  return { slide: taken.slide, selection, substitution: taken.substitution };
}

/** Longest runner that fits the clear depth, and the drawer box it defines: of the runner of the drawer. */
export function runnerInfo(p: HomeProject, hw: HardwareCatalogs, b: Body, f: Front): RunnerInfo {
  const r = homeDrawerRunner(p, hw, b, f);
  return slideRunnerInfo(p, b, f, r.slide, r.selection !== null);
}

/** One wall of a drawer box as the graph adds it: its origin in the body (x, z) and the world (y), its extent. */
export interface DrawerBoxWall {
  key: 'side-left' | 'side-right' | 'inner-front' | 'back' | 'bottom';
  role: SemanticRole;
  o: Vec3;
  ext: Vec3;
  axes: AxisIndex[];
  edged: number[];
  /** A bottom of HDF in the groove of the walls (r5, MOD-DEC-574). */
  hdf: boolean;
}

/**
 * The walls of the box of a drawer on its runner. A concealed runner — the box of its BAZIS kit (FINDINGS 1750): the
 * sides from the inner face of the front, the bottom of the board between them raised above their lower edge, the
 * back above the bottom, no inner front. A ball runner — the box of the prototype, its bottom of HDF in the groove of
 * the four walls when the project asks for it (574, W7: to the full depth of the groove, its middle in the middle of
 * the groove), else of the board between the walls.
 */
export function drawerBoxWalls(p: HomeProject, b: Body, f: Front, n: RunnerInfo): DrawerBoxWall[] {
  const k = HOME.drawerBoxBoard,
    bx = bay(p, b, f).left + n.sideGap,
    bz = n.boxY,
    bh = n.boxH,
    bw = n.boxW,
    wall = (key: DrawerBoxWall['key'], role: SemanticRole, o: Vec3, ext: Vec3, axes: AxisIndex[], edged: number[], hdf = false): DrawerBoxWall => ({ key, role, o, ext, axes, edged, hdf });
  if (n.concealed) {
    const kind: Record<string, Pick<DrawerBoxWall, 'role' | 'axes' | 'edged'>> = {
      'side-left': { role: 'drawer_side', axes: [1, 2], edged: [2, 3] },
      'side-right': { role: 'drawer_side', axes: [1, 2], edged: [2, 3] },
      back: { role: 'drawer_back', axes: [0, 2], edged: [2, 3] },
      bottom: { role: 'drawer_bottom', axes: [0, 1], edged: [] },
    };
    return concealedBoxWalls(n, bay(p, b, f).left, k).map((w) => wall(w.key, kind[w.key]!.role, w.o, w.ext, kind[w.key]!.axes, kind[w.key]!.edged));
  }
  const by = aFront(p, b) + HOME.drawerBoxFrontOffset,
    hdf = hdfDrawerBottomOf(p, n),
    g = hdf?.grooveDepthMm ?? 0;
  return [
    wall('side-left', 'drawer_side', [bx, by, bz], [k, n.NL, bh], [1, 2], [2, 3]),
    wall('side-right', 'drawer_side', [bx + bw - k, by, bz], [k, n.NL, bh], [1, 2], [2, 3]),
    wall('inner-front', 'drawer_inner_front', [bx + k, by, bz], [bw - 2 * k, k, bh], [0, 2], [2, 3]),
    wall('back', 'drawer_back', [bx + k, by + n.NL - k, bz], [bw - 2 * k, k, bh], [0, 2], [2, 3]),
    hdf
      ? wall('bottom', 'drawer_bottom', [bx + k - g, by + k - g, bz + hdf.grooveBottomOffsetMm + (hdf.grooveWidthMm - hdf.thicknessMm) / 2], [bw - 2 * k + 2 * g, n.NL - 2 * k + 2 * g, hdf.thicknessMm], [0, 1], [], true)
      : wall('bottom', 'drawer_bottom', [bx + k, by + k, bz + HOME.drawerBottomInset], [bw - 2 * k, n.NL - 2 * k, k], [0, 1], []),
  ];
}

/** What the runner pair of a drawer carries: the front and the box by volume × density, the reserve of the hardware and the load. */
export function drawerMovingMassKg(p: HomeProject, b: Body, f: Front, n: RunnerInfo): number {
  const r = frontGeometry(p, b, f),
    volume = r.w * r.d * r.h + drawerBoxWalls(p, b, f, n).reduce((s, w) => s + w.ext[0] * w.ext[1] * w.ext[2], 0);
  return movingMassKg([volume], p.density, HOME.drawerHardwareReserveKg, p.plannedDrawerLoadKg);
}

/** The height of the box in its opening, as the prototype sets it: above the lower edge of the front and the bottom. */
function boxHeight(p: HomeProject, b: Body, f: Front): { boxY: number; boxTop: number } {
  const t = p.thickness,
    clear = HOME.drawerBoxCarcassClearance;
  return {
    boxY: Math.max(f.y + HOME.drawerBoxBelowFront, foot(p, b) + t + clear),
    boxTop: Math.min(f.y + f.h - HOME.drawerBoxUnderFrontTop, b.h - topT(p) - clear),
  };
}

/** The ball runner DB4501 and the box of the prototype between it (r3, r4 and «Эконом» of r5). */
function ballRunnerInfo(p: HomeProject, b: Body, f: Front, slide: DrawerSlide): RunnerInfo {
  const t = p.thickness,
    rear = HOME.runnerRearAllowance,
    lengthsDesc = slide.lengths.map((l) => l.nominalMm).reverse();
  // The carcass depth behind the overlay must hold the runner plus a 7 mm rear allowance.
  const legacyAvailable = b.d - (allFronts(b).length ? t : 0) - t;
  if (!lengthsDesc.find((n) => n + rear <= legacyAvailable))
    throw Error('Ящику нужна большая глубина: направляющая начинается с 250 мм и требует заднего зазора.');
  const available = b.d - aFront(p, b) - t,
    NL = lengthsDesc.find((n) => n + rear <= available);
  if (!NL) throw Error('Ящику нужна глубина для направляющей не менее 250 мм и монтажного запаса 7 мм.');
  const length = slide.lengths.find((l) => l.nominalMm === NL)!,
    dim = (letter: string) => knownRunnerDimension(slide, length, letter),
    B = runnerDimension(slide, length, 'B'),
    m = HOME.runnerMountFirst;
  if (length.loadKg.value === null || slide.profileHeightMm.value === null || !length.article)
    throw new Error(`У направляющей ${slide.id} длины ${NL} мм в каталоге нет артикула, нагрузки или высоты профиля`);
  const opening = bay(p, b, f),
    gapRule = homeRules(p).drawerBoxSideGap,
    sideGap = gapRule === 'CATALOG' ? homeRunnerSideGap(slide) : gapRule,
    { boxY, boxTop } = boxHeight(p, b, f);
  return {
    NL,
    sku: length.article,
    sideGap,
    boxW: opening.right - opening.left - 2 * sideGap,
    boxY,
    boxTop,
    boxH: boxTop - boxY,
    boxD: NL,
    loadKg: length.loadKg.value,
    height: slide.profileHeightMm.value,
    cabinetMountZ: (B === null
      ? [HOME.runnerShortMountFirst, m, m + dim('C'), m + dim('D')]
      : [m, m + B, m + dim('C'), m + dim('D')]
    ).map((z) => r3(HOME.runnerMountBase + z)),
    drawerMountZ: [dim('E'), dim('F'), dim('G'), dim('I')],
    mountBasis:
      'Опубликованные позиции отверстий Ø4.5 мм в металле; выбор четырёх точек и высота по центру коробки — собственная схема.',
  };
}

/**
 * A concealed runner and the box of its BAZIS kit (r5, «Стандарт» and «Премиум» — FINDINGS 1750): the longest NL whose
 * smallest depth (NL + 3 of B-Slide) the depth behind the fronts takes; the box sides NL − 10 long from the inner face
 * of the overlay front — the kit hangs the front on their ends, the runner begins with them — the width between them
 * the opening less the deduction of the catalogue (SKW = LW − 42), the box of the board of the box. The holes of the
 * runner in the side panel come from the kit, counted from the front of the runner (277).
 */
function concealedRunnerInfo(p: HomeProject, b: Body, f: Front, slide: DrawerSlide): RunnerInfo {
  const opening = bay(p, b, f),
    { boxY, boxTop } = boxHeight(p, b, f);
  return concealedRunner(slide, { openingWidthMm: opening.right - opening.left, insideDepthMm: b.d - aFront(p, b) - p.thickness, boardMm: HOME.drawerBoxBoard, boxY, boxTop, frontMm: frontT(p) });
}

// ---------------------------------------------------------------- r5: the legs of the wardrobe (MOD-DEC-516, FINDINGS 947)

/** The legs of one body on legs. */
export interface HomeLegs {
  leg: Leg;
  heightMm: number;
  /** Centres of the legs in the axes of the body: x from its left side, y from its front (the face of the fronts). */
  stationsMm: [number, number][];
  /** Why the leg is temporary: no leg of the catalogue gives the height; null — the leg gives it. */
  temporary: string | null;
}

/**
 * The legs of a body on legs, as the wardrobe sets them (Д 480): the leg of the catalogue for the height of the base
 * (legFor; the project has no choice of the model), two rows — front and rear — 50 mm in from the edges of the carcass,
 * the spacing of a row not over 900 mm (legStations).
 */
export function homeLegs(p: HomeProject, hw: HardwareCatalogs, b: Body): HomeLegs {
  const heightMm = b.base?.kind === 'legs' ? b.base.heightMm : 0,
    pick = legFor(hw.fittings, heightMm, null),
    a = aFront(p, b),
    xs = legStations(b.w),
    ys = legStations(b.d - a).filter((_, i, all) => i === 0 || i === all.length - 1);
  return { leg: pick.item, heightMm, stationsMm: ys.flatMap((y) => xs.map((x): [number, number] => [x, a + y])), temporary: pick.reason };
}

/** The casters of one body on casters (r5, MOD-AI-73). */
export interface HomeCasters {
  /** The caster without and with a brake: one height and one plate. */
  plain: Caster;
  braked: Caster;
  heightMm: number;
  /** Centres in the axes of the body, as the legs: x from its left side, y from the face of the fronts; the front row is braked. */
  stationsMm: [number, number][];
  brakedCount: number;
  /** Why the casters are of another level than the hardware of the project; null — of its level. */
  substitution: string | null;
  /** What the casters take together, kg, by the load of one caster the maker prints; null — not printed. */
  capacityKg: number | null;
}

const TIER_NAMES: Readonly<Record<HardwareTier, string>> = { ECONOMY: 'Эконом', STANDARD: 'Стандарт', PREMIUM: 'Премиум' };
const casterHeight = (c: Caster): number => (typeof c.heightMm === 'number' ? c.heightMm : c.heightMm.minMm);

/**
 * The pair of casters of a level (r5, MOD-AI-73, (Д) FINDINGS 3320): a caster without and one with a brake of the
 * same height and plate, the cheapest such pair; a level without one takes the next level up (then down) and says so.
 * Null — the catalogue has no such pair at all.
 */
export function casterPair(hw: HardwareCatalogs, tier: HardwareTier): { plain: Caster; braked: Caster; substitution: string | null } | null {
  const order: HardwareTier[] = tier === 'ECONOMY' ? ['ECONOMY', 'STANDARD', 'PREMIUM'] : tier === 'STANDARD' ? ['STANDARD', 'PREMIUM', 'ECONOMY'] : ['PREMIUM', 'STANDARD', 'ECONOMY'],
    price = (c: Caster) => c.price?.rub ?? Infinity;
  for (const t of order) {
    const of = hw.fittings.casters.filter((c) => c.tier === t),
      pairs = of
        .filter((c) => !c.brake)
        .flatMap((plain) =>
          of
            .filter((c) => c.brake && casterHeight(c) === casterHeight(plain) && c.footprint.shape === plain.footprint.shape && c.footprint.sizeMm === plain.footprint.sizeMm)
            .map((braked) => ({ plain, braked })),
        )
        .sort((a, b) => price(a.plain) + price(a.braked) - price(b.plain) - price(b.braked) || a.plain.id.localeCompare(b.plain.id));
    if (pairs.length)
      return { ...pairs[0]!, substitution: t === tier ? null : `в уровне «${TIER_NAMES[tier]}» нет колёс одной высоты с тормозом и без — взяты колёса уровня «${TIER_NAMES[t]}»` };
  }
  return null;
}

/**
 * The casters of a body on casters (r5, MOD-AI-73): the pair of the level of the hardware of the project (casterPair),
 * at the stations of the legs (legStations) — the front row with the brake, the rear one without.
 */
export function homeCasters(p: HomeProject, hw: HardwareCatalogs, b: Body): HomeCasters | null {
  const pair = casterPair(hw, KIT_TIERS[p.kitLevel]);
  if (!pair) return null;
  const a = aFront(p, b),
    xs = legStations(b.w),
    ys = legStations(b.d - a).filter((_, i, all) => i === 0 || i === all.length - 1),
    loads = [pair.plain.loadKg.value, pair.braked.loadKg.value];
  return {
    ...pair,
    heightMm: casterHeight(pair.plain),
    stationsMm: ys.flatMap((y) => xs.map((x): [number, number] => [x, a + y])),
    brakedCount: xs.length,
    capacityKg: loads.every((x) => typeof x === 'number') ? xs.length * (loads[0]! + loads[1]!) : null,
  };
}

// ---------------------------------------------------------------- r5: the hangers of a body on the wall (MOD-AI-33)

/**
 * r5 (MOD-AI-33, (Д)): what a body on the wall puts on its hangers — its parts at the density of the board of the
 * project and the planned loads of its shelves and of its top. The load of the drawers is not counted.
 */
export function hangerLoadKg(p: HomeProject, g: { parts: readonly GraphPart[]; loads: readonly BeamLoad[] }, b: Body): number {
  const own = g.parts.filter((q) => q.bodyId === b.id && q.semanticRole !== 'floor_pad'),
    self = own.reduce((n, q) => n + (q.extent_mm[0] * q.extent_mm[1] * q.extent_mm[2] * p.density) / 1e9, 0),
    payload = g.loads.filter((l) => l.bodyId === b.id).reduce((n, l) => n + l.payloadKg, 0);
  return Math.round((self + payload) * 10) / 10;
}

/** The hangers of one body on the wall: the kit of the kitchen's profile, the piece of rail, the load and what they take. */
export interface HomeHangers {
  /** The articles of the kit (the left and the right hanger, the screws) and the wall sets, with their quantities. */
  items: { article: string; quantity: number }[];
  /** The rail between the sides: the width less two boards («cabinetWidth − 2 · panelThickness»). */
  railCutMm: number;
  loadKg: number;
  /** Two hangers, not over the rail. */
  capacityKg: number;
}

/** The hangers of a body on the wall (r5, MOD-AI-33): the kit of SAH 216 by the kitchen's profile, one body — one pair. */
export function homeHangers(p: HomeProject, b: Body, g: { parts: readonly GraphPart[]; loads: readonly BeamLoad[] }): HomeHangers {
  const w = wallHangingOf(p, b)!;
  return {
    items: [...w.kit.map((x) => ({ ...x })), { article: w.wallSet.article, quantity: w.wallSet.quantity + (b.w >= w.wallSet.wideFromMm ? 1 : 0) }],
    railCutMm: b.w - 2 * p.thickness,
    loadKg: hangerLoadKg(p, g, b),
    capacityKg: Math.min(2 * w.loadKgEach, w.railRatingKg),
  };
}

/**
 * The rails of the project (r5, MOD-AI-33): the pieces of all bodies on the wall cut from stock rails, the longest
 * first into the first rail with room, with the saw cut between them — the kitchen's cut plan (kitchen/hardware.ts).
 */
export function homeRailPlan(p: HomeProject): { stock: number; cutsMm: number[]; stockMm: number } | null {
  const w = homeRules(p).wallHanging,
    cuts = p.bodies.filter((b) => wallHangingOf(p, b)).map((b) => b.w - 2 * p.thickness);
  if (!w || !cuts.length) return null;
  const left: number[] = [];
  for (const c of [...cuts].sort((a, b) => b - a)) {
    const k = left.findIndex((r) => r >= c + w.rail.kerfMm);
    if (k < 0) left.push(w.rail.stockMm - c - w.rail.kerfMm);
    else left[k]! -= c + w.rail.kerfMm;
  }
  return { stock: left.length, cutsMm: cuts, stockMm: w.rail.stockMm };
}

/**
 * The handle of the fronts of a project of r5 (MOD-DEC-513, FINDINGS 965): the one it names, the knob RC282BL.4 when a
 * project saved before the choice names none; null — «без ручек» or a rule set without the choice (r3, r4).
 */
export function homeHandle(p: HomeProject, hw: HardwareCatalogs): Handle | null {
  const rule = homeRules(p).handles;
  if (!rule || p.handleId === 'NONE') return null;
  return handleFor(hw.fittings, { handleId: p.handleId ?? rule.savedId });
}

/** The handle of one front of r5: where it stands and its model. */
export interface HomeHandleFitting {
  id: string;
  bodyId: string;
  frontId: string;
  /** The part of the front: the door or the drawer front. */
  partId: string;
  handle: Handle;
  orientation: 'VERTICAL' | 'HORIZONTAL';
  /** The centre of the handle on the outer face of the front, product axes (the face is at y = 0). */
  centreMm: EngineVec3;
  visual: HardwareVisual;
}

/**
 * The handles of the fronts of r5, as the wardrobe sets them (Д 480): a door — vertical at its free edge, the middle at
 * 1000 mm from the floor within the door; a drawer — horizontal in the middle of its front. None without a handle.
 */
export function homeHandles(p: HomeProject, hw: HardwareCatalogs): HomeHandleFitting[] {
  const handle = homeHandle(p, hw),
    out: HomeHandleFitting[] = [];
  if (!handle) return out;
  for (const b of p.bodies)
    for (const f of allFronts(b)) {
      // r5 (MOD-AI-36): a door opened by pressing has no handle.
      if (pushDoor(p, f)) continue;
      const g = frontGeometry(p, b, f),
        door = b.doors.find((d) => d.id === f.id),
        x0 = b.x + g.x,
        z0 = b.y + g.y,
        [cx, cz] = door ? doorHandleCentre(handle, door.hinge, x0, x0 + g.w, z0, z0 + g.h) : [x0 + g.w / 2, z0 + g.h / 2],
        orientation = door ? 'VERTICAL' : 'HORIZONTAL',
        partId = b.id + ':' + f.id + (door ? ':door' : ':front'),
        id = b.id + ':' + f.id + ':handle';
      out.push({ id, bodyId: b.id, frontId: f.id, partId, handle, orientation, centreMm: [Math.round(cx * 10) / 10, 0, Math.round(cz * 10) / 10], visual: handleVisual(id + '-V', partId, handle, orientation, cx, cz, 0) });
    }
  return out;
}

/**
 * A door opened by pressing (r5, MOD-AI-36, MOD-DEC-483, 485): a door of the board of a project with `pushToOpen`. A flap
 * front holds on its lift and a glass door on its hinges for glass — they keep their handles, as the drawers.
 */
export const pushDoor = (p: HomeProject, f: Front): boolean => !!p.pushToOpen && homeRules(p).pushToOpen && 'hinge' in f && !(f as Door).lift && !glassOf(p, f);

/** The latch of a door opened by pressing (r5, MOD-AI-36): the latch of the catalogue in the front edge of a panel behind the door. */
export interface HomeLatch {
  /** `<door>:latch`: the PUSH_LATCH mechanism keeps it. */
  id: string;
  bodyId: string;
  doorId: string;
  latch: PushLatch;
  /** The panel it is set in, by its front edge. */
  panelId: string;
  /** Its axis in the product, mm: across (x), the front edge of the panel (depth) and the middle of its thickness (height). */
  xMm: number;
  frontMm: number;
  elevationMm: number;
}

/** A front edge flush with the carcass front: the door works across the depth gap of the project, as in the wardrobe. */
const FLUSH_MM = 0.5;

/**
 * The latches of the doors opened by pressing (r5, MOD-AI-36), by the rule of the wardrobe and the kitchen
 * (latchPlacement, MOD-DEC-483, 485): its axis 100 mm from the free edge of the door, in the front edge of the bottom, a
 * fixed shelf or a top flush with the carcass, the highest of them within the door's height that holds the hole. A
 * door without such a panel, or a catalogue without the latch, is listed with the reason.
 */
export function homeLatches(p: HomeProject, hw: HardwareCatalogs, g: { parts: readonly GraphPart[] }): { latches: HomeLatch[]; notes: { bodyId: string; doorId: string; text: string }[] } {
  const out = { latches: [] as HomeLatch[], notes: [] as { bodyId: string; doorId: string; text: string }[] },
    latch = latchFor(hw.fittings),
    drill = latch?.hole.value ?? null;
  for (const b of p.bodies) {
    const own = g.parts.filter((q) => q.bodyId === b.id),
      front = own.find((q) => q.id === b.id + ':side-left')?.origin_mm[1] ?? 0,
      panels = own
        .filter((q) => (q.semanticRole === 'bottom' || q.semanticRole === 'fixed_shelf' || q.semanticRole === 'continuous_top') && Math.abs(q.origin_mm[1] - front) <= FLUSH_MM && (!drill || q.extent_mm[1] >= drill.depthMm))
        .map((q) => ({ id: q.id, x0: q.origin_mm[0], x1: q.origin_mm[0] + q.extent_mm[0], y0: q.origin_mm[2], y1: q.origin_mm[2] + q.extent_mm[2], front: q.origin_mm[1] }));
    for (const d of b.doors) {
      if (!pushDoor(p, d)) continue;
      if (!latch || !drill) {
        out.notes.push({ bodyId: b.id, doorId: d.id, text: `${d.id}: в каталоге нет толкателя с отверстием — открывание нажатием без толкателя` });
        continue;
      }
      const r = frontGeometry(p, b, d),
        at = latchPlacement({ x0: b.x + r.x, x1: b.x + r.x + r.w, y0: b.y + r.y, y1: b.y + r.y + r.h }, d.hinge, panels, drill.diameterMm);
      if (!at) {
        out.notes.push({ bodyId: b.id, doorId: d.id, text: `${d.id}: за дверью у свободного края нет дна, неподвижной полки или крышки вровень с корпусом — толкатель некуда поставить` });
        continue;
      }
      out.latches.push({ id: b.id + ':' + d.id + ':latch', bodyId: b.id, doorId: d.id, latch, panelId: at.panel.id, xMm: Math.round(at.xMm * 10) / 10, frontMm: at.panel.front, elevationMm: Math.round(((at.panel.y0 + at.panel.y1) / 2) * 10) / 10 });
    }
  }
  return out;
}

/** A light under the top of a niche (r5, MOD-AI-37, MOD-DEC-483). */
export interface HomeLight {
  /** `<niche>:light`: the LIGHT mechanism keeps it. */
  id: string;
  bodyId: string;
  lo: string;
  hi: string;
  light: CabinetLight;
  mountPartId: string;
  /** Its box in the product, mm: the left end, the front edge and the underside of the top it hangs under. */
  xMm: number;
  yMm: number;
  zTopMm: number;
}

/** The lights of the project (r5, MOD-AI-37) and their power supply; the niches no light fits, by their clear width. */
export interface HomeLighting {
  lights: HomeLight[];
  supply: { item: PowerSupply; quantity: number; loadW: number } | null;
  unfitted: { bodyId: string; lo: string; hi: string; widthMm: number }[];
}

/**
 * The lights of the bodies with `light` (r5, MOD-AI-37, FINDINGS 3315), as the wardrobe's (MOD-DEC-483): in each niche
 * up to the top the longest light of the catalogue that fits in its clear width, in the middle of it, under the top,
 * its front edge 50 mm behind the front edge of the top; one power supply of them all by the sum of their powers.
 */
export function homeLights(p: HomeProject, hw: HardwareCatalogs): HomeLighting {
  const out: HomeLighting = { lights: [], supply: null, unfitted: [] };
  if (!homeRules(p).lighting) return out;
  for (const b of p.bodies.filter((x) => x.light && x.kind === 'cabinet'))
    for (const o of availableBays(p, b).filter((x) => x.upper === undefined)) {
      const r = bay(p, b, o),
        width = Math.round((r.right - r.left) * 10) / 10,
        light = lightFor(hw.fittings, width);
      if (!light) {
        out.unfitted.push({ bodyId: b.id, lo: o.lo, hi: o.hi, widthMm: width });
        continue;
      }
      out.lights.push({
        id: o.id + ':light',
        bodyId: b.id,
        lo: o.lo,
        hi: o.hi,
        light,
        mountPartId: b.id + ':top',
        xMm: b.x + (r.left + r.right) / 2 - light.lengthMm / 2,
        yMm: fittingsSelection.constants.lightFromFront.value,
        zTopMm: b.y + b.h - topT(p),
      });
    }
  if (out.lights.length) {
    const loadW = Math.round(out.lights.reduce((a, l) => a + l.light.powerW, 0) * 10) / 10;
    out.supply = { ...powerSupplyFor(hw.fittings, loadW, out.lights[0]!.light.voltageV), loadW };
  }
  return out;
}
