// The hinges and the shelf supports of a kitchen module on the shared mechanisms of the engine (task K3, MOD-DEC-341:
// the norms of the wardrobe are the kitchen's where the kitchen has no own decision).
//
// Hinges (KF-07, KF-09, KF-10; FINDINGS 324): a swing door of an ordinary hinge takes the pair of the manufacturer's
// table for its overlay (286, 329: selectHinge, BOYARD H316 first), the count of the chart by the 5 % / 95 % rule
// (190), the stations of the wardrobe doors (W4) and the holes of the kit or the catalogue (277) — the cups in the
// door, the plates on the side panel at the station of the cup. The prototype planned a BLUM hinge by a table without
// the tolerance and drilled nothing. The special hinges (glass, diagonal, corner 155°, bifold) and the lift keep the
// BLUM profiles of the prototype — the wardrobe has no rule for them — with the count of rule 190 on their tables;
// their holes are not printed by any source of the project: «присадка неполная» (277).
//
// Shelf supports (KF-08; FINDINGS 325): a removable shelf stands on the support kit of the level «Стандарт» (344:
// FLIPPER), selected by shelf-support-selection.ts; the side panels are drilled at the lines 37 and D − 37 of System 32
// at the axis of the support, the shelf is bored by the scheme of the kit, the spare levels ±32 mm are drilled where
// they fit (193). With System 32 on, the axis of a shelf off the grid moves to the nearest level of the grid of the
// bottom (193: z = bottom + t/2 + 32n) and the user sees it, as a changed shelf of the wardrobe (312).
//
// Doors opened by pressing (MOD-DEC-483, 485; MOD-AI-36, FINDINGS 3212): an ordinary swing door takes the hinges without
// a spring and the latch of the wardrobe, in the front edge of the horizontal panel behind it at the axis of the shared
// rule (latchPlacement); the special doors, the drawers and the lifts keep their hinges and handles.
//
// A hole is kept in the module's box (x across, y up, z from the front of the carcass) and in the frame of the
// fasteners of the room (k7Point): the graph places it on its part the way it places the holes of the fasteners r7.
import type { Rec } from '../engine/policy/project-state.js';
import { latchFor, latchPlacement } from '../engine/policy/fittings-selection.js';
import { hingeDrillingScheme, hingeSelection, selectHinge, type HingeDemand, type SchemeHole } from '../engine/policy/hinge-selection.js';
import { selectShelfSupport, shelfLowerAboveAxis, shelfSupportBodyColour, shelfSupportKit, shelfSupportScheme, shelfSupportSelection } from '../engine/policy/shelf-support-selection.js';
import { s32Snap } from '../engine/policy/system32.js';
import { wardrobeFacades } from '../engine/policy/wardrobe-facades.js';
import { wardrobeFill } from '../engine/policy/wardrobe-fill.js';
import { minimalHingeCount } from '../engine/invariants/checks.js';
import { hingeChartFor } from '../catalog/hardware/hinges.js';
import { catalogSource, type CatalogRef } from '../catalog/hardware/types.js';
import { decorsOf } from '../catalog/decors.js';
import type { MaterialCatalog } from '../catalog/materials.js';
import { hingeStations } from '../wardrobe/facades.js';
import { FRONT_CARCASS_GAP } from './carcass.js';
import { kitchenPushToOpen } from './fittings.js';
import { fastenerPoint, type KitchenScene } from './room.js';

const EPS = 1e-6;
const refText = (r: CatalogRef) => (catalogSource(r) as { ref: string }).ref;
const fmt = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', ',');

/** A hole of a mechanism on a part: in the module's box and in the frame of the room's fasteners. */
export interface MechanismHole {
  operationId: string;
  kind: string;
  mechanismId: string;
  partId: string;
  machiningRole: string;
  diameter: number;
  depth: number;
  /** Entry point and inward normal in the module's box: x across, y up, z from the front of the carcass. */
  localEntry: number[];
  localNormal: number[];
  /** The same in the frame of the fasteners of the room (k7Point): x, depth from the wall, height. */
  entry: number[];
  inwardNormal: number[];
  station: number;
  holeSource: 'KIT_FR3D' | 'MANUFACTURER_CATALOG';
  holeSourceRef: string;
  completeness: 'COMPLETE' | 'INCOMPLETE';
  system32Level?: 'main' | 'spare';
  production: false;
}

export function hole(s: KitchenScene, m: Rec, h: Omit<MechanismHole, 'entry' | 'inwardNormal' | 'production'>): MechanismHole {
  const [x, y, z] = h.localEntry as [number, number, number],
    [nx, ny, nz] = h.localNormal as [number, number, number],
    a = fastenerPoint(s, m, [x, z, y]),
    b = fastenerPoint(s, m, [x + nx, z + nz, y + ny]);
  return { ...h, entry: a, inwardNormal: b.map((v, i) => Math.round(v - a[i]!)), production: false };
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;

/** A vertical carcass panel across x whose ends hold the hinge edge `x` of a door on side `side`, or null. */
function hingePanel(parts: Rec[], door: Rec, side: 'left' | 'right'): Rec | null {
  const [x0, x1, y0, y1] = door.box,
    edge = side === 'left' ? x0 : x1;
  return (
    parts
      .filter((p) => p.materialRole === 'CORPUS' && p.box?.length === 6 && !/shelf|foot-pad|plinth|support/.test(p.partId))
      .filter((p) => p.box[1] - p.box[0] < p.box[3] - p.box[2] && p.box[1] - p.box[0] < p.box[5] - p.box[4])
      .filter((p) => overlaps(p.box[2], p.box[3], y0, y1) && Math.abs(p.box[4]) < EPS)
      .filter((p) => p.box[0] - EPS <= edge && edge <= p.box[1] + EPS && (side === 'left' ? p.box[1] > edge : p.box[0] < edge))
      .sort((a, b) => (side === 'left' ? b.box[1] - a.box[1] : a.box[0] - b.box[0]))[0] ?? null
  );
}

/** Gap from the hinge edge of a door to the nearest other leaf of the module beside it at the same height; null — none. */
function neighbourGap(door: Rec, side: 'left' | 'right', leaves: Rec[]): number | null {
  const edge = side === 'left' ? door.box[0] : door.box[1],
    gaps = leaves
      .filter((o) => o !== door && overlaps(o.box[2], o.box[3], door.box[2], door.box[3]))
      .map((o) => (side === 'left' ? edge - o.box[1] : o.box[0] - edge))
      .filter((x) => x >= -EPS);
  return gaps.length ? Math.min(...gaps) : null;
}

/** The plan of an ordinary swing door on the shared hinge mechanism (task W4), with its holes. */
export function sharedHingePlan(s: KitchenScene, m: Rec, g: Rec, parts: Rec[], leaves: Rec[], holes: MechanismHole[]): Rec {
  const door: Rec = g.parts[0],
    side: 'left' | 'right' = g.hingeSide === 'right' ? 'right' : 'left',
    id = `${m.id}/hinge/${g.id}`,
    issues: string[] = [],
    t = m.panelThickness ?? 16,
    panel = hingePanel(parts, door, side),
    overlayMm = panel ? (side === 'left' ? panel.box[1] - door.box[0] : door.box[1] - panel.box[0]) : t,
    demand: HingeDemand = {
      position: 'CARCASS_EDGE',
      overlayMm,
      facadeThicknessMm: g.thickness,
      panelThicknessMm: panel ? panel.box[1] - panel.box[0] : t,
      neighbourGapMm: neighbourGap(door, side, leaves),
      depthGapMm: FRONT_CARCASS_GAP,
      innerDrawerBehind: false,
      openingLimitDeg: null,
      ...(kitchenPushToOpen(s) ? { pushToOpen: true } : {}),
    },
    hingeCatalog = s.hardware.hinges,
    selection = selectHinge(demand, hingeCatalog),
    chosen = selection.chosen,
    hinge = hingeCatalog.hinges.find((h) => h.id === (chosen?.hingeId ?? hingeSelection.constants.preferredHinges.value[0]))!,
    plate = chosen ? hingeCatalog.plates.find((p) => p.id === chosen.plateId)! : null,
    chart = hingeChartFor(hinge),
    chartMaxWidth = chart?.maxWidthMm ?? null,
    mass = g.supportedMass ?? g.mass + g.handleMass,
    byRule = chart ? minimalHingeCount(g.height, mass, chart.rows) : null,
    count = byRule ?? Math.max(...(chart?.rows ?? [{ n: 2 }]).map((r) => r.n)),
    scheme = chosen ? hingeDrillingScheme(chosen, hingeCatalog, demand) : null,
    numbered = (h: SchemeHole): h is SchemeHole & { diameterMm: number; depthMm: number } => h.diameterMm !== null && h.depthMm !== null,
    facadeHoles = scheme?.holes.filter((h) => h.part === 'FACADE').filter(numbered) ?? [],
    plateHoles = scheme?.holes.filter((h) => h.part === 'PANEL').filter(numbered) ?? [],
    plateAcross = plateHoles[0]?.acrossMm ?? null,
    plateAlong = plateHoles.length ? [...new Set(plateHoles.map((h) => h.alongMm))] : [0],
    plateAt = (st: number) => door.box[2] + st - (panel?.box[2] ?? 0),
    innerX = panel ? (side === 'left' ? panel.box[1] : panel.box[0]) : null,
    occupied =
      plateAcross === null || !panel ? [] : holes.filter((h) => h.partId === panel.partId && Math.abs(h.localEntry[0]! - innerX!) < EPS && Math.abs(h.localEntry[2]! - plateAcross) < 1).map((h) => h.localEntry[1]! - panel.box[2]),
    stations = hingeStations(g.height, count, plateAlong, plateAt, occupied),
    source = (h: SchemeHole) => (h.origin === 'KIT' ? 'KIT_FR3D' : 'MANUFACTURER_CATALOG') as MechanismHole['holeSource'],
    missing = [...(scheme?.missing ?? [])];
  // No panel for the plate (MOD-DEC-371: the door of the straight corner cabinet on its blind part): the hinge is the
  // owner's choice — a temporary hinge and a remark in the bell, the function is not cut and no HOLD is set.
  const pending = panel
    ? null
    : /:single_door_front$/.test(door.partId)
      ? 'Дверь прямого углового шкафа навешена на глухую часть (MOD-DEC-371): петлю подбирает владелец, стоит временная.'
      : `${door.partId}: нет боковины под монтажную планку — петлю подбирает владелец, стоит временная.`;
  if (!chosen) issues.push(`Петля не подобрана: ${selection.notCovered.map((x) => `${x.hingeId} + ${x.plateId}: ${x.reason}`).join('; ') || 'нет кандидатов'}.`);
  if (!panel) missing.push(`${door.partId}: нет боковины под монтажную планку`);
  if (scheme?.holes.some((h) => !numbered(h))) missing.push(`${hinge.article}: диаметр или глубина отверстия не даны`);
  if (byRule === null || (chartMaxWidth !== null && g.width > chartMaxWidth)) issues.push('Размер или масса створки выходит за подтверждённый график петель; требуется другая схема или разделение створки.');
  const k = { n: 0 };
  for (const st of stations) {
    // Without a panel for the plate the door is not drilled either: a cup without its plate is no hinge (INV-M01, M03).
    for (const h of panel ? facadeHoles : []) {
      const x = side === 'left' ? door.box[0] + h.acrossMm : door.box[1] - h.acrossMm;
      holes.push(
        hole(s, m, {
          operationId: `${id}/${door.partId}/${h.machiningRole}/${st}/${k.n++}`,
          kind: `${h.machiningRole === 'CUP' ? 'Чашка петли' : 'Крепление чашки петли'} ${hinge.brand} ${hinge.article}`,
          mechanismId: id,
          partId: door.partId,
          machiningRole: h.machiningRole,
          diameter: h.diameterMm,
          depth: h.depthMm,
          localEntry: [x, door.box[2] + st + h.alongMm, door.box[5]],
          localNormal: [0, 0, -1],
          station: st,
          holeSource: source(h),
          holeSourceRef: refText(h.ref),
          completeness: scheme!.completeness,
        }),
      );
    }
    if (panel)
      for (const h of plateHoles)
        holes.push(
          hole(s, m, {
            operationId: `${id}/${panel.partId}/${h.machiningRole}/${st}/${k.n++}`,
            kind: `Монтажная планка ${plate!.brand} ${plate!.article} петли ${hinge.article}`,
            mechanismId: id,
            partId: panel.partId,
            machiningRole: h.machiningRole,
            diameter: h.diameterMm,
            depth: h.depthMm,
            localEntry: [innerX!, panel.box[2] + plateAt(st) + h.alongMm, panel.box[4] + h.acrossMm],
            localNormal: [side === 'left' ? -1 : 1, 0, 0],
            station: st,
            holeSource: source(h),
            holeSourceRef: refText(h.ref),
            completeness: scheme!.completeness,
          }),
        );
  }
  if (panel && plateHoles.length && stations.some((st) => plateAt(st) < 0 || plateAt(st) > panel.box[3] - panel.box[2])) missing.push(`${panel.partId}: планка выходит за деталь`);
  return {
    groupId: g.id,
    mechanismId: id,
    mechanism: 'HINGE',
    profileId: null,
    hingeId: chosen?.hingeId ?? null,
    plateId: chosen?.plateId ?? null,
    hingeArticle: hinge.article,
    plateArticle: plate?.article ?? null,
    manufacturer: hinge.brand,
    mounting: chosen?.mounting ?? null,
    doorId: door.partId,
    panelId: panel?.partId ?? null,
    hingeSide: side,
    position: demand.position,
    demand,
    cupEdgeDistanceMm: chosen?.cupEdgeDistanceMm ?? null,
    cupCentreFromEdgeMm: chosen?.cupCentreFromEdgeMm ?? null,
    checks: chosen?.checks ?? [],
    chart: chart ? { hingeId: hinge.id, basis: chart.basis, mark: chart.mark, ref: refText(chart.ref), rows: chart.rows, maxWidthMm: chartMaxWidth } : null,
    countBasis: byRule === null ? 'CHART_EXCEEDED' : 'MOD-DEC-190',
    stationsMm: stations,
    drilling: scheme ? { source: scheme.source, completeness: missing.length ? 'INCOMPLETE' : scheme.completeness, missing } : { source: null, completeness: 'INCOMPLETE', missing: ['пара петля + планка не подобрана'] },
    hingePending: pending,
    issues,
    status: issues.length ? 'INCOMPATIBLE' : 'PLANNING_QUALIFIED',
    quantity: count,
    widthMm: g.width,
    heightMm: g.height,
    massKg: g.mass,
    supportedMassKg: mass,
    massBasis: g.massBasis,
    handleMassKg: g.handleMass,
    openingAngleDeg: hinge.openingAngleDeg,
    pairedGroupId: g.pairedGroupId || null,
    text: chosen ? `${door.partId}: ${hinge.brand} ${hinge.article} + ${plate!.article}, наложение ${fmt(overlayMm)} мм, петель ${count}` : `${door.partId}: петля не подобрана`,
  };
}

/**
 * The hinges of a front that opens upwards on hinges in the top of the carcass (МДМ FLAP, FINDINGS 3353): the pair of
 * the manufacturer's table for the overlay of the front over the top (286, 329), the count of the chart by the 5 % /
 * 95 % rule (190) on the length of its hinge edge — the width of the front, the stations of the wardrobe doors (W4)
 * along it, the holes of the kit or the catalogue (277): the cups in the front at its top edge, the plates on the
 * underside of the top at the station of the cup. The same plan as a swing door on a side (sharedHingePlan), turned
 * by a quarter: the top is the panel of the plates, x is the edge.
 */
export function flapHingePlan(s: KitchenScene, m: Rec, g: Rec, parts: Rec[], holes: MechanismHole[]): Rec {
  const door: Rec = g.parts[0],
    id = `${m.id}/hinge/${g.id}`,
    issues: string[] = [],
    top = parts.find((p) => p.partId === m.id + ':top' && p.box?.length === 6) ?? null,
    t = m.panelThickness ?? 16,
    under = top ? top.box[2] : m.height - t,
    demand: HingeDemand = {
      position: 'CARCASS_EDGE',
      overlayMm: door.box[3] - under,
      facadeThicknessMm: g.thickness,
      panelThicknessMm: top ? top.box[3] - top.box[2] : t,
      neighbourGapMm: null,
      depthGapMm: FRONT_CARCASS_GAP,
      innerDrawerBehind: false,
      openingLimitDeg: null,
    },
    hingeCatalog = s.hardware.hinges,
    selection = selectHinge(demand, hingeCatalog),
    chosen = selection.chosen,
    hinge = hingeCatalog.hinges.find((h) => h.id === (chosen?.hingeId ?? hingeSelection.constants.preferredHinges.value[0]))!,
    plate = chosen ? hingeCatalog.plates.find((p) => p.id === chosen.plateId)! : null,
    chart = hingeChartFor(hinge),
    chartMaxWidth = chart?.maxWidthMm ?? null,
    mass = g.mass + g.handleMass,
    edge = g.width,
    byRule = chart ? minimalHingeCount(edge, mass, chart.rows) : null,
    count = byRule ?? Math.max(...(chart?.rows ?? [{ n: 2 }]).map((r) => r.n)),
    scheme = chosen ? hingeDrillingScheme(chosen, hingeCatalog, demand) : null,
    numbered = (h: SchemeHole): h is SchemeHole & { diameterMm: number; depthMm: number } => h.diameterMm !== null && h.depthMm !== null,
    facadeHoles = scheme?.holes.filter((h) => h.part === 'FACADE').filter(numbered) ?? [],
    plateHoles = scheme?.holes.filter((h) => h.part === 'PANEL').filter(numbered) ?? [],
    plateAcross = plateHoles[0]?.acrossMm ?? null,
    plateAlong = plateHoles.length ? [...new Set(plateHoles.map((h) => h.alongMm))] : [0],
    plateAt = (st: number) => door.box[0] + st - (top?.box[0] ?? 0),
    occupied = plateAcross === null || !top ? [] : holes.filter((h) => h.partId === top.partId && Math.abs(h.localEntry[1]! - under) < EPS && Math.abs(h.localEntry[2]! - top.box[4] - plateAcross) < 1).map((h) => h.localEntry[0]! - top.box[0]),
    stations = hingeStations(edge, count, plateAlong, plateAt, occupied),
    source = (h: SchemeHole) => (h.origin === 'KIT' ? 'KIT_FR3D' : 'MANUFACTURER_CATALOG') as MechanismHole['holeSource'],
    missing = [...(scheme?.missing ?? [])];
  if (!chosen) issues.push(`Петля не подобрана: ${selection.notCovered.map((x) => `${x.hingeId} + ${x.plateId}: ${x.reason}`).join('; ') || 'нет кандидатов'}.`);
  if (!top) missing.push(`${door.partId}: нет верхней стенки под монтажную планку`);
  if (scheme?.holes.some((h) => !numbered(h))) missing.push(`${hinge.article}: диаметр или глубина отверстия не даны`);
  if (byRule === null || (chartMaxWidth !== null && g.height > chartMaxWidth)) issues.push('Размер или масса фасада выходит за подтверждённый график петель; требуется другая схема.');
  const k = { n: 0 };
  for (const st of stations) {
    for (const h of top ? facadeHoles : [])
      holes.push(
        hole(s, m, {
          operationId: `${id}/${door.partId}/${h.machiningRole}/${st}/${k.n++}`,
          kind: `${h.machiningRole === 'CUP' ? 'Чашка петли' : 'Крепление чашки петли'} ${hinge.brand} ${hinge.article}`,
          mechanismId: id,
          partId: door.partId,
          machiningRole: h.machiningRole,
          diameter: h.diameterMm,
          depth: h.depthMm,
          localEntry: [door.box[0] + st + h.alongMm, door.box[3] - h.acrossMm, door.box[5]],
          localNormal: [0, 0, -1],
          station: st,
          holeSource: source(h),
          holeSourceRef: refText(h.ref),
          completeness: scheme!.completeness,
        }),
      );
    if (top)
      for (const h of plateHoles)
        holes.push(
          hole(s, m, {
            operationId: `${id}/${top.partId}/${h.machiningRole}/${st}/${k.n++}`,
            kind: `Монтажная планка ${plate!.brand} ${plate!.article} петли ${hinge.article}`,
            mechanismId: id,
            partId: top.partId,
            machiningRole: h.machiningRole,
            diameter: h.diameterMm,
            depth: h.depthMm,
            localEntry: [top.box[0] + plateAt(st) + h.alongMm, under, top.box[4] + h.acrossMm],
            localNormal: [0, 1, 0],
            station: st,
            holeSource: source(h),
            holeSourceRef: refText(h.ref),
            completeness: scheme!.completeness,
          }),
        );
  }
  if (top && plateHoles.length && stations.some((st) => plateAt(st) < 0 || plateAt(st) > top.box[1] - top.box[0])) missing.push(`${top.partId}: планка выходит за деталь`);
  return {
    groupId: g.id,
    mechanismId: id,
    mechanism: 'HINGE',
    profileId: null,
    hingeId: chosen?.hingeId ?? null,
    plateId: chosen?.plateId ?? null,
    hingeArticle: hinge.article,
    plateArticle: plate?.article ?? null,
    plateHeightMm: plate?.heightMm ?? null,
    manufacturer: hinge.brand,
    mounting: chosen?.mounting ?? null,
    doorId: door.partId,
    panelId: top?.partId ?? null,
    hingeSide: 'top',
    position: demand.position,
    demand,
    cupEdgeDistanceMm: chosen?.cupEdgeDistanceMm ?? null,
    cupCentreFromEdgeMm: chosen?.cupCentreFromEdgeMm ?? null,
    checks: chosen?.checks ?? [],
    chart: chart ? { hingeId: hinge.id, basis: chart.basis, mark: chart.mark, ref: refText(chart.ref), rows: chart.rows, maxWidthMm: chartMaxWidth } : null,
    countBasis: byRule === null ? 'CHART_EXCEEDED' : 'MOD-DEC-190',
    stationsMm: stations,
    drilling: scheme ? { source: scheme.source, completeness: missing.length ? 'INCOMPLETE' : scheme.completeness, missing } : { source: null, completeness: 'INCOMPLETE', missing: ['пара петля + планка не подобрана'] },
    hingePending: null,
    issues,
    status: issues.length ? 'INCOMPATIBLE' : 'PLANNING_QUALIFIED',
    quantity: count,
    widthMm: g.width,
    heightMm: g.height,
    massKg: g.mass,
    supportedMassKg: mass,
    massBasis: g.massBasis,
    handleMassKg: g.handleMass,
    openingAngleDeg: hinge.openingAngleDeg,
    pairedGroupId: null,
    text: chosen ? `${door.partId}: ${hinge.brand} ${hinge.article} + ${plate!.article} в верхней стенке, наложение ${fmt(demand.overlayMm)} мм, петель ${count}` : `${door.partId}: петля не подобрана`,
  };
}

// ---------------------------------------------------------------- latches of the doors opened by pressing

/** A front edge flush with the carcass front: the door works across the gap FRONT_CARCASS_GAP, as in the wardrobe. */
const FLUSH_MM = 0.5;

/**
 * The latches of the doors of a module opened by pressing (MOD-DEC-483, 485): one per door `groups` (the ordinary swing
 * doors of the shared hinge), its hole in `holes`, owned by the latch. A door without a place for it is listed with the
 * reason: it has no handle and no latch, the graph says so.
 */
export function pushLatchPlans(s: KitchenScene, m: Rec, groups: Rec[], parts: Rec[], holes: MechanismHole[]): Rec[] {
  const latch = latchFor(s.hardware.fittings),
    drill = latch?.hole.value ?? null,
    panels = parts
      .filter((p) => p.materialRole === 'CORPUS' && p.box?.length === 6 && !p.drawerId && !/shelf|plinth|foot-pad|support|drawer/.test(p.partId))
      .map((p) => ({ part: p, id: p.partId as string, x0: p.box[0], x1: p.box[1], y0: p.box[2], y1: p.box[3], z0: p.box[4], z1: p.box[5] }))
      // Horizontal, its front edge flush with the carcass and deep enough for the hole (a rail on its edge is not).
      .filter((b) => b.y1 - b.y0 < b.x1 - b.x0 && b.y1 - b.y0 < b.z1 - b.z0 && Math.abs(b.z0) <= FLUSH_MM && (!drill || b.z1 - b.z0 >= drill.depthMm));
  return groups.map((g) => {
    const door: Rec = g.parts[0],
      [x0, x1, y0, y1, z0] = door.box as number[],
      base = { groupId: g.id, doorId: door.partId };
    if (!latch || !drill) return { ...base, latch: null, note: `${door.partId}: в каталоге нет толкателя с отверстием — открывание нажатием без толкателя` };
    if (z0! >= -FLUSH_MM) return { ...base, latch: null, note: `${door.partId}: вкладная дверь — за ней нет кромки корпуса, толкатель ${latch.article} некуда поставить` };
    const at = latchPlacement({ x0: x0!, x1: x1!, y0: y0!, y1: y1! }, g.hingeSide === 'right' ? 'right' : 'left', panels, drill.diameterMm);
    if (!at) return { ...base, latch: null, note: `${door.partId}: за дверью у свободного края нет дна, верха или царги вровень с корпусом — толкатель некуда поставить` };
    const id = `${m.id}/latch/${g.id}`,
      elevation = (at.panel.y0 + at.panel.y1) / 2;
    holes.push(
      hole(s, m, {
        operationId: `${id}/${at.panel.id}/PUSH_LATCH`,
        kind: `Толкатель ${latch.brand} ${latch.article}`,
        mechanismId: id,
        partId: at.panel.id,
        machiningRole: 'PUSH_LATCH',
        diameter: drill.diameterMm,
        depth: drill.depthMm,
        localEntry: [at.xMm, elevation, at.panel.z0],
        localNormal: [0, 0, 1],
        station: at.xMm,
        holeSource: 'MANUFACTURER_CATALOG',
        holeSourceRef: `${latch.hole.ref!.doc} sha256:${latch.hole.ref!.sha256} · ${latch.hole.ref!.page}`,
        completeness: 'COMPLETE',
      }),
    );
    return { ...base, latch: { id, latchId: latch.id, brand: latch.brand, article: latch.article, name: latch.name, panelId: at.panel.id, xMm: at.xMm, elevationMm: elevation }, note: null };
  });
}

// ---------------------------------------------------------------- shelf supports

/** Decor of the shared catalogue of a material code of the kitchen (W980 → DEC-EGG-W980-ST7); null — none or several. */
export function decorOfMaterial(code: string, mc: MaterialCatalog): string | null {
  const found = decorsOf(mc).filter((d) => d.code === code);
  return found.length === 1 ? found[0]!.id : null;
}

/** The side panels of a shelf: the vertical panels whose inner faces bound its ends (1 mm away by 225). */
function shelfPanels(parts: Rec[], shelf: Rec): [Rec | null, Rec | null] {
  const [x0, x1, y0, y1, z0, z1] = shelf.box,
    gap = wardrobeFill.constants.removableEndGap.value,
    panels = parts.filter((p) => p.materialRole === 'CORPUS' && p.box?.length === 6 && p !== shelf && overlaps(p.box[2], p.box[3], y0, y1) && overlaps(p.box[4], p.box[5], z0, z1));
  return [panels.find((p) => Math.abs(p.box[1] - (x0 - gap)) < EPS) ?? null, panels.find((p) => Math.abs(p.box[0] - (x1 + gap)) < EPS) ?? null];
}

/** Holes already on the inner face of a panel at a point (a spare level that meets one is not drilled). */
const meets = (holes: MechanismHole[], partId: string, at: number[], d: number) =>
  holes.some((h) => h.partId === partId && Math.abs(h.localEntry[0]! - at[0]!) < EPS && Math.hypot(h.localEntry[1]! - at[1]!, h.localEntry[2]! - at[2]!) < (h.diameter + d) / 2);

/**
 * The supports of the removable shelves of a module: the kit, the side holes at the axis with the spare levels, the
 * bores of the shelf; a shelf whose axis is off the grid of System 32 moves to the nearest level. `parts` are changed
 * in place (the moved shelves), the holes appended to `holes`.
 */
export function shelfSupportPlans(s: KitchenScene, m: Rec, parts: Rec[], system32On: boolean, holes: MechanismHole[]): { plans: Rec[]; issues: string[] } {
  const plans: Rec[] = [],
    issues: string[] = [],
    C = wardrobeFill.constants,
    density = wardrobeFacades.constants.boardDensity.value;
  for (const shelf of parts.filter((p) => p.removableShelf === true && p.box?.length === 6)) {
    const [left, right] = shelfPanels(parts, shelf),
      t = shelf.finished_mm[2],
      id = `${shelf.partId}/supports`,
      selection = selectShelfSupport({ shelfThicknessMm: t, shelfMaterial: 'CHIPBOARD', payloadKg: shelfSupportSelection.constants.payloadKg.value, shelfMassKg: (shelf.finished_mm[0] * shelf.finished_mm[1] * t * density) / 1e9, tier: null }, s.hardware.shelfSupports),
      support = selection.chosen ? s.hardware.shelfSupports.supports.find((x) => x.id === selection.chosen!.supportId)! : null,
      decorId = decorOfMaterial(shelf.materialCode, s.hardware.materials),
      plan: Rec = {
        id,
        shelfId: shelf.partId,
        moduleId: m.id,
        tier: shelfSupportSelection.constants.defaultTier.value,
        supportId: support?.id ?? null,
        brand: support?.brand ?? null,
        name: support?.name ?? null,
        selection,
        panelIds: [left?.partId ?? null, right?.partId ?? null],
        linesFromFrontMm: [],
        axisAboveLowerMm: null,
        axisMm: null,
        movedFromMm: null,
        scheme: null,
        kit: null,
        quantity: 0,
        issues: [] as string[],
      };
    plans.push(plan);
    if (!support) {
      plan.issues.push(`${shelf.partId}: полкодержатель не подобран — ${selection.reason}`);
      continue;
    }
    if (!left || !right) {
      plan.issues.push(`${shelf.partId}: нет боковин у торцов полки — присадка полкодержателей неполная`);
      continue;
    }
    const D = Math.min(left.box[5] - left.box[4], right.box[5] - right.box[4]),
      lines = [C.supportLine.value, D - C.supportLine.value],
      above = shelfLowerAboveAxis(support);
    plan.linesFromFrontMm = lines;
    plan.kit = shelfSupportKit(support, decorId ? shelfSupportBodyColour(decorId) : null);
    if (above.valueMm === null) {
      plan.issues.push(`${shelf.partId}: положение полки над осью полкодержателя не дано — ${above.reason}`);
      continue;
    }
    const axis = shelf.box[2] - above.valueMm,
      bottom = parts.find((p) => p.partId === m.id + ':bottom'),
      base = bottom ? (bottom.box[2] + bottom.box[3]) / 2 : null;
    if (Number.isFinite(shelf.system32MovedFromMm)) {
      const dy = shelf.box[2] - shelf.system32MovedFromMm;
      plan.movedFromMm = shelf.system32MovedFromMm;
      issues.push(`Полка ${shelf.partId} перенесена на ${fmt(Math.abs(dy))} мм ${dy > 0 ? 'выше' : 'ниже'}: ось полкодержателя — на сетке System 32 (MOD-DEC-193).`);
    }
    // MOD-DEC-193: the grid of the holes starts at the axis of the bottom (bottom + t/2).
    if (system32On && base !== null && Math.abs(s32Snap(axis, base) - axis) > EPS) plan.issues.push(`${shelf.partId}: ось полкодержателя вне сетки System 32 — перенос на ближайший уровень выходит из проёма`);
    plan.axisAboveLowerMm = -above.valueMm;
    plan.axisMm = axis;
    const scheme = shelfSupportScheme(support, { linesFromFrontMm: lines, shelfSetbackMm: shelf.box[4] - left.box[4], shelfDepthMm: shelf.box[5] - shelf.box[4], shelfEndGapMm: C.removableEndGap.value });
    plan.scheme = scheme;
    plan.quantity = scheme.quantity;
    const ref = (h: { ref: CatalogRef | null }) => refText(h.ref ?? support.ref),
      k = { n: 0 };
    for (const panel of [left, right]) {
      const x = panel === left ? panel.box[1] : panel.box[0],
        normal = [panel === left ? -1 : 1, 0, 0];
      for (const h of scheme.holes.filter((h) => h.part === 'SIDE_PANEL')) {
        const at = (y: number) => [x, y, panel.box[4] + h.acrossMm],
          add = (y: number, level: 'main' | 'spare') =>
            holes.push(
              hole(s, m, {
                operationId: `${id}/${panel.partId}/${level}/${k.n++}`,
                kind: level === 'main' ? 'Полкодержатель' : 'Запасной уровень полкодержателя',
                mechanismId: id,
                partId: panel.partId,
                machiningRole: h.machiningRole,
                diameter: h.widthMm!,
                depth: h.depthMm!,
                localEntry: at(y),
                localNormal: normal,
                station: h.acrossMm,
                holeSource: 'MANUFACTURER_CATALOG',
                holeSourceRef: ref(h),
                completeness: scheme.completeness,
                system32Level: level,
              }),
            );
        add(axis, 'main');
        // MOD-DEC-193: spare levels ±32 mm where they stay inside the panel and meet no hole.
        if (system32On)
          for (const dz of [-C.spareLevel.value, C.spareLevel.value]) {
            const y = axis + dz,
              r = h.widthMm! / 2;
            if (y - r < panel.box[2] - EPS || y + r > panel.box[3] + EPS || meets(holes, panel.partId, at(y), h.widthMm!)) continue;
            add(y, 'spare');
          }
      }
    }
    const bores = scheme.holes.filter((h) => h.part === 'SHELF' && h.face === 'LOWER' && h.fromEndMm !== null),
      step = (h: (typeof bores)[number]) => bores.some((o) => o !== h && o.acrossMm === h.acrossMm && o.fromEndMm === h.fromEndMm && (o.depthMm ?? 0) > (h.depthMm ?? 0));
    for (const h of bores)
      for (const x of [shelf.box[0] + h.fromEndMm!, shelf.box[1] - h.fromEndMm!])
        holes.push(
          hole(s, m, {
            operationId: `${id}/${shelf.partId}/bore/${k.n++}`,
            kind: 'Полкодержатель — гнездо в полке',
            mechanismId: id,
            partId: shelf.partId,
            machiningRole: step(h) ? 'SHELF_BORE_STEP' : h.machiningRole,
            diameter: h.widthMm!,
            depth: h.depthMm!,
            localEntry: [x, shelf.box[2], shelf.box[4] + h.acrossMm],
            localNormal: [0, 1, 0],
            station: h.acrossMm,
            holeSource: 'MANUFACTURER_CATALOG',
            holeSourceRef: ref(h),
            completeness: scheme.completeness,
          }),
        );
  }
  return { plans, issues };
}
