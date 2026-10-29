// Hinge catalogue: hinges, mounting plates and the manufacturer tables that pair them (task HINGE-SEL, input of
// W4 and W7). Data are the manufacturers' as printed in the catalogues registered in docs/project/SOURCES.md:
// every record names the document (its SHA-256 prefix) and the page. A value the catalogue does not give is
// null and the selection answers UNKNOWN for the check that needs it (Handbook §5, MOD-DEC-277): no number is
// carried over from another article (MOD-DEC-205) or invented. Names follow the Handbook terms: Hinge (TERM-098),
// HingeCup (TERM-099), HingeMountingPlate (TERM-100), zeroProtrusion (TERM-101), FacadeMounting (TERM-198).
import type { CatalogPrice } from './prices.js';
import { refChecker, type CatalogDocument, type CatalogRef, type Known, type RangeMm, type HardwareItem } from './types.js';

export type { CatalogRef, Known, RangeMm } from './types.js';

/** Схема установки фасада (TERM-198): накладная, полунакладная, вкладная. */
export type FacadeMounting = 'OVERLAY' | 'HALF_OVERLAY' | 'INSET';

/**
 * Назначение петли: обычная дверь корпуса или особый узел — стеклянная дверь, угол +45°, дверь у фальшпанели,
 * складная створка углового шкафа (MOD-DEC-465, 468). Особые петли подбор фасада не берёт: их ставит узел, которому
 * они нужны. Нет поля — обычная.
 */
export type HingeApplication = 'STANDARD' | 'GLASS' | 'ANGLE_45' | 'FALSE_PANEL' | 'BIFOLD';

export const HINGE_APPLICATIONS: readonly HingeApplication[] = ['STANDARD', 'GLASS', 'ANGLE_45', 'FALSE_PANEL', 'BIFOLD'];

/** Holes of the cup fixing (screws, euro screws or dowels) relative to the cup centre. */
export interface CupFixing {
  kind: 'SCREWS' | 'EURO_SCREWS' | 'DOWELS' | 'NONE';
  /** L: distance between the two fixing holes, along the hinge edge. */
  spacingMm: number | null;
  /** F: offset of the line of fixing holes from the cup centre, away from the hinge edge. */
  offsetMm: number | null;
  holeDiameterMm: number | null;
  holeDepthMm: number | null;
}

export interface HingeCupSpec {
  diameterMm: number;
  /** Bore depth; null when the catalogue gives only limits (`depthRangeMm`) — the drilling scheme is then incomplete. */
  depthMm: number | null;
  depthRangeMm?: RangeMm;
  fixing: CupFixing;
  ref: CatalogRef;
}

/** A hole of a mounting plate in the carcass panel, relative to the hinge station (the cup centre height). */
export interface PlateHole {
  /** Distance from the front edge of the panel (37 mm line of System 32 for overlay hinges). */
  fromFrontEdgeMm: number;
  /** Along the panel height from the station, signed (±16 for a 32 mm pair). */
  alongMm: number;
  diameterMm: number | null;
  depthMm: number | null;
  /** `EURO_SCREW`, `SCREW`, `DOWEL`, `PILOT`. */
  kind: string;
}

export interface HingeMountingPlate extends HardwareItem {
  /** H, «высота (дистанция) планки», as the manufacturer table names it. */
  heightMm: number;
  holes: PlateHole[];
  /** Panel thicknesses the manufacturer names for this plate; null when the catalogue does not limit it. */
  recommendedPanelThicknessMm: RangeMm | null;
  /** Price of one plate, ₽, from the owner's price catalogue (no rounding; the estimate rounds by MOD-DEC-346). */
  priceRub?: Known<number>;
  /** Price of one plate in the format of MOD-DEC-536; a record has this or `priceRub`, not both. */
  price?: CatalogPrice;
  ref: CatalogRef;
}

/**
 * One row of a manufacturer table «hinge + plate»: the overlay obtained with the cup at distance K from the
 * facade edge. Overlay is signed from the inner face of the hinge-side panel: positive — the facade covers the
 * panel end (overlay, half overlay), negative — the facade edge stays inside the opening (inset, the reveal).
 */
export interface OverlayRow {
  hingeId: string;
  plateId: string;
  overlayMm: number;
  /** K: from the facade edge to the edge of the cup bore. */
  cupEdgeDistanceMm: number;
  /** null when the row holds for any facade thickness of the hinge. */
  facadeThicknessMm: number | null;
  ref: CatalogRef;
}

/** Minimum gap between this facade and the neighbouring facade (or wall) on the hinge side, by K and thickness. */
export interface MinimumGapRow {
  /** Hinges the printed table holds for (one table per series). */
  hingeIds: string[];
  facadeThicknessMm: number;
  cupEdgeDistanceMm: number;
  gapMm: number;
  ref: CatalogRef;
}

/** Chart of the hinge count (MOD-DEC-190): limits of height and mass for n hinges. */
export interface HingeChartRow {
  n: number;
  Hmax: number;
  Mmax: number;
}

/**
 * The manufacturer's chart of the hinge count with the facade width it holds for, printed on the same page
 * (MOD-DEC-377: BOYARD 2024 p. 18 and 26, SAMET p. 154 — 600 mm). A door wider than the chart is not covered by it.
 */
export interface HingeChart extends Known<HingeChartRow[]> {
  /** Facade width limit of the chart; null when there is no chart or it prints no limit. */
  maxWidthMm: number | null;
}

/**
 * The hinge-count table of the prototype for a hinge whose manufacturer prints no chart (Control OW-6). It is
 * used only while `chart` is UNKNOWN and is marked «не проверено по производителю» wherever it is shown.
 */
export interface PrototypeChart {
  rows: HingeChartRow[];
  /** Facade width limit of the table, if it has one. */
  maxWidthMm: number | null;
  mark: 'не проверено по производителю';
  ref: CatalogRef;
}

/** Position of the plate hole line on the panel: base line plus the facade thickness and the inset depth, if the scheme adds them. */
export interface PlateLine {
  baseMm: number;
  addsFacadeThickness: boolean;
  addsInsetDepth: boolean;
  ref: CatalogRef;
}

export interface Hinge extends HardwareItem {
  series: string;
  /** Назначение петли; нет поля — обычная дверь корпуса (`STANDARD`). */
  application?: HingeApplication;
  /** The manufacturer's family: накладная, полунакладная, вкладная. */
  mounting: FacadeMounting;
  openingAngleDeg: number | null;
  softClose: boolean | null;
  cup: HingeCupSpec;
  facadeThicknessMm: Known<RangeMm>;
  cupEdgeDistanceMm: Known<RangeMm>;
  /** Регулировки: сбоку, по глубине, по высоте, as signed ranges. */
  adjustment: { sideMm: Known<RangeMm>; depthMm: Known<RangeMm>; heightMm: Known<RangeMm> };
  /** Nominal gap between the closed facade's inner face and the carcass front edge at depth adjustment 0. */
  depthGapMm: Known<number>;
  /** Documented zero protrusion of the open facade into the opening (TERM-101, MOD-DEC-164, 288). */
  zeroProtrusion: Known<boolean>;
  /** Opening angle from which the open facade does not protrude into the opening. */
  zeroProtrusionFromDeg: Known<number>;
  /** Protrusion of the open facade into the opening (вылет внутрь проёма) at documented angles, 90° and others. */
  protrusionByAngle: Known<{ angleDeg: number; protrusionMm: number }[]>;
  plateLine: PlateLine | null;
  /** Ids of plates the manufacturer pairs with this hinge in its tables. */
  plates: string[];
  /** Plate the manufacturer recommends for a carcass panel thickness (BOYARD H316A02: H5114 for 16 mm, H5112 for 18 mm). */
  recommendedPlates: Known<{ panelThicknessMm: number; plateId: string }[]>;
  chart: HingeChart;
  /** The prototype's table when the manufacturer prints no chart (`chart` UNKNOWN); null otherwise. */
  prototypeChart: PrototypeChart | null;
  /** Price of one hinge, ₽, from the owner's price catalogue (no rounding; the estimate rounds by MOD-DEC-346). */
  priceRub?: Known<number>;
  /** Price of one hinge in the format of MOD-DEC-536; a record has this or `priceRub`, not both. */
  price?: CatalogPrice;
  ref: CatalogRef;
}

/** A hole of a BAZIS kit in the hinge's terms. */
export interface KitHole {
  part: 'FACADE' | 'PANEL';
  machiningRole: 'CUP' | 'CUP_FIXING' | 'PLATE';
  /** Facade: from the cup centre, away from the hinge edge; panel: from the facade's inner face (the 37 mm line plus `depthGapMm` of the kit). */
  acrossMm: number;
  /** Along the height from the cup centre. */
  alongMm: number;
  diameterMm: number;
  depthMm: number;
}

/**
 * The drilling of a hinge with its plate as the BAZIS kit (.fr3d) carries it, read with packages/bazis (readHoles).
 * MOD-DEC-277: the kit's holes come first, the catalogue fills only what the kit lacks.
 */
export interface DrillingKit {
  hingeId: string;
  plateId: string;
  /**
   * Cup centre from the inner face of the hinge-side panel in the kit's assembly. The manufacturer table gives the
   * same distance as (K + d/2) − overlay of each row; the two are compared within MOD-DEC-275.
   */
  cupFromPanelFaceMm: number;
  /**
   * Overlay and half overlay kits: the gap between the facade's inner face and the carcass front edge that the kit is
   * drawn with — the plate holes lie at this gap plus the plate line (Hettich: 1,5 + 37). 0 for inset kits and for
   * kits drawn with the facade at the front edge (BOYARD, Blum, GTV).
   */
  depthGapMm: number;
  holes: KitHole[];
  /** Price of the hinge with its plate as one kit (MOD-DEC-536): it covers both in the estimate; absent — each by its own price. */
  price?: CatalogPrice;
  /** Holes of the kit that are not machined, and why. */
  excluded: string[];
  /** `doc` — the kit (archive and the path inside it), `sha256` — of the kit file. */
  ref: CatalogRef;
}

export interface HingeCatalog {
  hinges: Hinge[];
  plates: HingeMountingPlate[];
  overlayRows: OverlayRow[];
  minimumGapRows: MinimumGapRow[];
  kits: DrillingKit[];
  /** Documents of SOURCES.md the catalogue was read from. */
  documents: CatalogDocument[];
}


/** Structural problems of a catalogue: references, units, sources. The test keeps the committed data clean. */
export function hingeCatalogProblems(c: HingeCatalog): string[] {
  const { ref: refOk, known, problems: out } = refChecker(c.documents);
  const price = (where: string, p: Known<number> | undefined) => {
    if (!p) return;
    known(`${where}.priceRub`, p);
    if (p.value !== null && !(p.value > 0)) out.push(`${where}.priceRub: нужно положительное число`);
  };
  const hingeIds = new Set(c.hinges.map((h) => h.id)),
    plateIds = new Set(c.plates.map((p) => p.id));
  if (hingeIds.size !== c.hinges.length) out.push('повтор id петли');
  if (plateIds.size !== c.plates.length) out.push('повтор id планки');
  for (const h of c.hinges) {
    refOk(h.id, h.ref);
    refOk(`${h.id}.cup`, h.cup.ref);
    if (h.application !== undefined && !HINGE_APPLICATIONS.includes(h.application)) out.push(`${h.id}: назначение ${h.application}`);
    known(`${h.id}.facadeThicknessMm`, h.facadeThicknessMm);
    known(`${h.id}.cupEdgeDistanceMm`, h.cupEdgeDistanceMm);
    known(`${h.id}.adjustment.sideMm`, h.adjustment.sideMm);
    known(`${h.id}.adjustment.depthMm`, h.adjustment.depthMm);
    known(`${h.id}.adjustment.heightMm`, h.adjustment.heightMm);
    known(`${h.id}.depthGapMm`, h.depthGapMm);
    known(`${h.id}.zeroProtrusion`, h.zeroProtrusion);
    known(`${h.id}.zeroProtrusionFromDeg`, h.zeroProtrusionFromDeg);
    known(`${h.id}.protrusionByAngle`, h.protrusionByAngle);
    known(`${h.id}.chart`, h.chart);
    if (h.chart.value && h.prototypeChart) out.push(`${h.id}: таблица прототипа при графике производителя`);
    if (h.prototypeChart) refOk(`${h.id}.prototypeChart`, h.prototypeChart.ref);
    known(`${h.id}.recommendedPlates`, h.recommendedPlates);
    for (const r of h.recommendedPlates.value ?? []) if (!h.plates.includes(r.plateId)) out.push(`${h.id}: рекомендованная планка ${r.plateId} не в списке петли`);
    if (h.plateLine) refOk(`${h.id}.plateLine`, h.plateLine.ref);
    for (const p of h.plates) if (!plateIds.has(p)) out.push(`${h.id}: планка ${p} не описана`);
    if (!(h.cup.diameterMm > 0 && ((h.cup.depthMm ?? 0) > 0 || h.cup.depthRangeMm))) out.push(`${h.id}: размеры чашки`);
    price(h.id, h.priceRub);
    if (h.priceRub && h.price) out.push(`${h.id}: цена и в priceRub, и в price`);
  }
  for (const p of c.plates) {
    refOk(p.id, p.ref);
    price(p.id, p.priceRub);
    if (p.priceRub && p.price) out.push(`${p.id}: цена и в priceRub, и в price`);
    if (!p.holes.length) out.push(`${p.id}: нет отверстий`);
  }
  for (const r of c.overlayRows) {
    const where = `строка ${r.hingeId} + ${r.plateId} A=${r.overlayMm}`;
    if (!hingeIds.has(r.hingeId)) out.push(`${where}: петля не описана`);
    if (!plateIds.has(r.plateId)) out.push(`${where}: планка не описана`);
    const h = c.hinges.find((x) => x.id === r.hingeId);
    if (h && !h.plates.includes(r.plateId)) out.push(`${where}: планка не в списке петли`);
    refOk(where, r.ref);
  }
  for (const r of c.minimumGapRows) {
    for (const id of r.hingeIds) if (!hingeIds.has(id)) out.push(`зазор ${id}: петля не описана`);
    refOk(`зазор ${r.hingeIds.join(', ')}`, r.ref);
  }
  for (const k of c.kits) {
    const where = `комплект ${k.hingeId} + ${k.plateId}`;
    const h = c.hinges.find((x) => x.id === k.hingeId);
    if (!h || !h.plates.includes(k.plateId)) out.push(`${where}: пары нет в каталоге`);
    if (c.kits.filter((x) => x.hingeId === k.hingeId && x.plateId === k.plateId).length > 1) out.push(`${where}: повтор`);
    if (k.holes.filter((x) => x.machiningRole === 'CUP').length !== 1) out.push(`${where}: чашка`);
    if (!(k.depthGapMm >= 0) || (h?.mounting === 'INSET' && k.depthGapMm !== 0)) out.push(`${where}: зазор комплекта по глубине`);
    refOk(where, k.ref);
  }
  return out;
}

/** The kit of a hinge with its plate, or null (MOD-DEC-277: then the catalogue gives the holes). */
export function drillingKit(c: HingeCatalog, hingeId: string, plateId: string): DrillingKit | null {
  return c.kits.find((k) => k.hingeId === hingeId && k.plateId === plateId) ?? null;
}

/**
 * Chart for the hinge count of MOD-DEC-190 (Control OW-6): the manufacturer's, else the prototype's table marked
 * «не проверено по производителю», else null (the count is UNKNOWN).
 */
export function hingeChartFor(h: Hinge): { rows: HingeChartRow[]; basis: 'MANUFACTURER' | 'PROTOTYPE'; mark: string | null; ref: CatalogRef; maxWidthMm: number | null } | null {
  if (h.chart.value && h.chart.ref) return { rows: h.chart.value, basis: 'MANUFACTURER', mark: null, ref: h.chart.ref, maxWidthMm: h.chart.maxWidthMm };
  if (h.prototypeChart) return { rows: h.prototypeChart.rows, basis: 'PROTOTYPE', mark: h.prototypeChart.mark, ref: h.prototypeChart.ref, maxWidthMm: h.prototypeChart.maxWidthMm };
  return null;
}
