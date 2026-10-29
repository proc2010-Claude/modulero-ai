// Hinge selection (task HINGE-SEL, input of W4 «фасады и навеска» and W7 «ящики, FE-04»): for one hinged facade —
// its overlay from the geometry, the pairs «hinge + mounting plate» of the manufacturer tables that give this
// overlay, the checks of thickness, cup distance K, gap to the neighbour, depth gap and zero protrusion, and the
// drilling scheme of the cup and the plate. Pure functions over the hinge catalogue (catalog/hinges.ts); the
// numbers of the manufacturers live in the catalogue, the rules of the owner here (ENGINE.md §4).
// The count of hinges is MOD-DEC-190 over the chart of the chosen hinge (hingeChartFor: the manufacturer's, else the prototype's
// table marked «не проверено по производителю», Control OW-6; invariants minimalHingeCount, INV-M02).
import { drillingKit, type CatalogRef, type FacadeMounting, type Hinge, type HingeApplication, type HingeCatalog, type HingeMountingPlate, type OverlayRow } from '../../catalog/hardware/hinges.js';
import { tierSubstitution, TIER_NAMES, type HardwareTier, type TierSubstitution } from './hardware-tier.js';
import { constant, decision, type PolicyModule } from './types.js';

/**
 * Rules of the selection. Overlays after the 3 mm seam (124, 185): 14,5 mm at the carcass edge, 6,5 mm on a
 * partition, half overlay for two doors on one partition (286). A row between two printed rows of the same
 * hinge and plate is interpolated linearly, never extrapolated (329). Behind an inner drawer only a
 * hinge with documented zero protrusion (164, 288); after the last drawer is removed — the ordinary hinge by
 * the overlay again (311); if the place does not let the door open far enough for zero protrusion (a room wall at
 * the side panel), zero protrusion stays and a spacer goes on that side panel (331): a strip of the carcass board
 * inside the side panel in the drawer zone, the runner on it, the drawer narrower by its thickness; the thickness
 * covers the door's protrusion into the opening at the real angle, 16 mm by default (also when the catalogue does
 * not give the protrusion — then UNKNOWN), more — 22 mm or two strips.
 *
 * Order of the candidates — a rule, never the alphabet:
 * 1. a candidate that a check rejects goes last; but when a hinge of the journal is rejected only by the gap to the
 *    neighbour door, it is still the chosen one, its FAIL shown, unless a hinge of the order that is not rejected
 *    comes first (MOD-DEC-740, FINDINGS 2732);
 * 2. the hinges of the journal: H316A02 (073, 329 at 14,5 mm), H316B02 with H5112 on a partition (329) — before the
 *    status, with their UNKNOWN checks shown: a fully checked pair first would be a new decision changing 329
 *    ((Д) 3а of the Director to PR #204);
 * 3. status: OK, NEEDS_SPACER, UNKNOWN;
 * 4. without an inner drawer, an ordinary hinge before a zero protrusion one (311: the ordinary hinge by the overlay);
 * 5. a complete drilling scheme before an incomplete one (277);
 * 6. fewer checks the catalogue cannot answer;
 * 7. a printed row before an interpolated one (329);
 * 8. the plate the manufacturer recommends for this panel thickness (H5114 for 16 mm sides — 329), otherwise K
 *    nearest to the middle of the hinge's K range, then the larger K (more board between the bore and the facade
 *    edge) — (Д) of the Director to the review of PR #204;
 * 9. ids, compared by code points (no locale), only to make equal pairs stable.
 *
 * Levels of the hardware (MOD-DEC-466, selectHingeForTier): «Стандарт» is the order above — BOYARD NEO HIT and EXTRA,
 * the hinges of the journal first. «Премиум» puts Blum CLIP top BLUMOTION before them, «Эконом» — MDM HARMONY PLUS.
 * HARMONY PLUS is in the catalogue from the BAZIS library of MDM (FINDINGS 689); its K and facade limits are not
 * printed, so its checks stay UNKNOWN under the bell. A hinge of the level absent from the release or rejected for
 * this facade gives way to the order of «Стандарт», and the bell says so (465, (Д)).
 *
 * Opening by pressing (MOD-DEC-483, 485): a door of a project with push to open takes only the hinges without a spring,
 * BOYARD ЭVO ПУШ СИСТЕМА H901 by its mounting, and no other door takes them (version 4). Its plates H8010 (H=0) and
 * H8012 (H=2) are printed in the tables of the manufacturer and go by the order above.
 */
export const hingeSelection = {
  id: 'hinge-selection',
  version: '6',
  constants: {
    interpolateWithinTable: constant(true, 'flag', decision('MOD-DEC-329'), 'Строка таблицы между двумя напечатанными строками той же петли и планки — линейная интерполяция с пометкой «интерполяция таблицы производителя»; за пределы таблицы — нет'),
    zeroProtrusionBehindDrawer: constant(true, 'flag', decision('MOD-DEC-288'), 'За внутренним ящиком — только петля с документированным Zero protrusion; после удаления ящика — обычная по наложению (311)'),
    preferredHinges: constant(['BOYARD_H316A02', 'BOYARD_H316B02'], 'id', decision('MOD-DEC-073'), 'Петли журнала первыми среди не отклонённых, раньше статуса ((Д) 3а Директора к PR #204): H316A02 — накладная по умолчанию (073; с H5114 при 14,5 мм — 329), H316B02 с H5112 на перегородке при 6,5 мм (329). Вкладная петля решением не задана; другие производители — кандидаты подбора (205)'),
    tierHinges: constant<Readonly<Record<HardwareTier, readonly string[]>>>(
      {
        ECONOMY: ['MDM_HB90FO', 'MDM_HB90HO', 'MDM_HB90INS'],
        STANDARD: ['BOYARD_H316A02', 'BOYARD_H316B02'],
        PREMIUM: ['BLUM_CLIP_TOP_OVERLAY', 'BLUM_CLIP_TOP_HALF', 'BLUM_CLIP_TOP_INSET', 'BLUM_71B7550'],
      },
      'id',
      decision('MOD-DEC-466'),
      'Петли уровня по умолчанию: Эконом — MDM HARMONY PLUS (HB90FO, HB90HO, HB90INS), Стандарт — BOYARD NEO HIT и EXTRA, как сейчас (073, 329: петли журнала первыми), Премиум — Blum CLIP top BLUMOTION; за внутренним ящиком — CLIP top BLUMOTION 155° 71B7550 с 0-protrusion (FINDINGS 2742)',
    ),
    tierFallback: constant<HardwareTier>('STANDARD', 'tier', decision('MOD-DEC-465'), '(Д) Петли уровня нет в каталоге или она не подходит фасаду — подбор «Стандарта», в «колокольчике» — что и почему заменено; узел не скрывается (465)'),
    platePreference: constant('MANUFACTURER_THEN_K_MIDDLE', 'rule', decision('MOD-DEC-329'), 'Из планок одной петли — рекомендованная производителем для толщины плиты (H5114 для боковин 16 мм — 329), иначе K ближе к середине диапазона петли, затем больший K — (Д) Директора к ревью PR #204'),
    spacerOptions: constant(
      [
        { thicknessMm: 16, layers: 1 },
        { thicknessMm: 22, layers: 1 },
        { thicknessMm: 32, layers: 2 },
      ],
      'mm',
      decision('MOD-DEC-331'),
      'Проставка на боковину у стены в зоне ящиков: полоса ЛДСП корпуса изнутри, направляющая на проставке, ящик уже на её толщину; толщина — вылет двери внутрь проёма при реальном угле открывания, по умолчанию 16 мм, без данных петли — UNKNOWN; больше — 22 мм или две полосы (толщина при корпусе 18 мм — уточнение Директора к 331)',
    ),
    catalogPlateHoles: constant(
      ['GTV_PLATE_H0'],
      'id',
      decision('MOD-DEC-374'),
      'Отверстия этих планок сверлятся по каталогу (GTV: Ø2 × 12 под саморез, с. 15), а не по комплекту .fr3d (Ø3 × 3 — накол); исключение из 277 для отверстий планки',
    ),
    pushToOpenHinges: constant(
      ['BOYARD_H901A02', 'BOYARD_H901B02', 'BOYARD_H901C02'],
      'id',
      decision('MOD-DEC-485'),
      'Двери с открыванием нажатием — только на петлях без пружины BOYARD ЭVO ПУШ СИСТЕМА H901 (накладная, полунакладная, вкладная по виду установки); обычная дверь эти петли не получает: без пружины и доводчика она не закрывается сама (483). LIBERTY H691 владелец убрал из каталога — коллекция снимается с производства (485)',
    ),
    keepJournalHingeOnGapFail: constant(
      true,
      'flag',
      decision('MOD-DEC-740'),
      '(Д) Директора к FINDINGS 2732: петля журнала, которую отклоняет только зазор до соседнего фасада (минимальная фуга), остаётся выбранной, отказ проверки — в причине механизма; подбор не уходит к петле другой линейки без данных и без её графика числа петель (190)',
    ),
    rowMatch: constant(1e-6, 'mm', decision('MOD-DEC-275'), 'Наложение совпадает со строкой таблицы при отличии не больше 1e-6 мм — технический порог сравнения с данными производителя ((Д) Директора к 275, PR #203), не допуск'),
  },
} as const satisfies PolicyModule;

/** Where the hinge-side edge of the facade lies (MOD-DEC-124, 185, 286). */
export type HingeEdgePosition =
  /** On an outer side panel of the carcass: overlay = t − outer offset (14,5 mm at 16 mm). */
  | 'CARCASS_EDGE'
  /** On a partition shared with the neighbouring facade: overlay = (t − seam)/2 (6,5 mm at 16 and 3). */
  | 'PARTITION'
  /** Inside the opening: overlay = −reveal. */
  | 'INSET';

export interface OverlayInput {
  position: HingeEdgePosition;
  panelThicknessMm: number;
  /** Outer horizontal offset of the facade at the carcass edge (124: 1,5 mm). */
  outerOffsetMm?: number;
  /** Seam between facades over a partition (185: 3 mm by default). */
  seamMm?: number;
  /** Inset: gap between the facade edge and the inner face of the panel. */
  revealMm?: number;
}

/** Overlay of the facade over the hinge-side panel, signed from the inner face of the panel (TERM-014). */
export function facadeOverlayMm(i: OverlayInput): number {
  if (i.position === 'CARCASS_EDGE') return i.panelThicknessMm - need(i.outerOffsetMm, 'outerOffsetMm');
  if (i.position === 'PARTITION') return (i.panelThicknessMm - need(i.seamMm, 'seamMm')) / 2;
  return -need(i.revealMm, 'revealMm');
}

function need(x: number | undefined, name: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw Error(`HINGE_OVERLAY_INPUT: ${name}`);
  return x;
}

/** One hinged facade as the selection sees it. */
export interface HingeDemand {
  position: HingeEdgePosition;
  overlayMm: number;
  facadeThicknessMm: number;
  /** Panel the plate is screwed to. */
  panelThicknessMm: number;
  /** Gap to the neighbouring facade on the hinge side; null — no neighbour that the opening door passes. */
  neighbourGapMm: number | null;
  /** Wanted gap between the closed facade and the carcass front edge (162: 2 mm for overlay doors); null — not set. */
  depthGapMm: number | null;
  /** An inner drawer stands behind this facade (288). */
  innerDrawerBehind: boolean;
  /** Largest opening angle the place allows (a room wall at the side panel); null — not limited. */
  openingLimitDeg: number | null;
  /** Inset: the facade's outer face behind the carcass front edge. */
  insetDepthMm?: number;
  /** The door opens by pressing (MOD-DEC-483): only the hinges without a spring; absent — only the others. */
  pushToOpen?: boolean;
  /** The kind of hinge the facade takes (a glass door — `GLASS`, MOD-AI-37); absent — the hinge of a carcass door (`STANDARD`). */
  application?: HingeApplication;
}

export type HingeCheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface HingeCheck {
  code: 'FACADE_THICKNESS' | 'CUP_EDGE_DISTANCE' | 'NEIGHBOUR_GAP' | 'DEPTH_GAP' | 'ZERO_PROTRUSION' | 'OPENING_ANGLE' | 'SPACER' | 'PANEL_THICKNESS' | 'MOUNTING';
  status: HingeCheckStatus;
  text: string;
  ref: CatalogRef | null;
}

export interface HingeCandidate {
  hingeId: string;
  plateId: string;
  mounting: FacadeMounting;
  /** K for this overlay: printed in a row or interpolated between two rows. */
  cupEdgeDistanceMm: number;
  cupCentreFromEdgeMm: number;
  basis: 'TABLE_ROW' | 'TABLE_INTERPOLATION';
  rows: OverlayRow[];
  checks: HingeCheck[];
  /** Spacer on the side panel when a wall stops the door before zero protrusion (331). */
  spacer: { thicknessMm: number; layers: number; protrusionMm: number | null; atAngleDeg: number | null } | null;
  /**
   * OK — every check passes; NEEDS_SPACER — only the opening angle fails: zero protrusion is kept and a spacer goes
   * on the side panel (331); UNKNOWN — none fails but the catalogue lacks
   * data; REJECTED — a check fails.
   */
  status: 'OK' | 'NEEDS_SPACER' | 'UNKNOWN' | 'REJECTED';
  /** Completeness of the drilling scheme of this pair (277): a complete one goes first among equals. */
  drilling: 'COMPLETE' | 'INCOMPLETE';
  /** The manufacturer recommends this plate for the panel thickness of the demand (329 for H316A02 and 16 mm). */
  plateRecommended: boolean;
}

export interface HingeSelection {
  demand: HingeDemand;
  /**
   * First candidate that is not REJECTED in the order of the module comment (a journal hinge may be UNKNOWN), or the
   * journal hinge rejected only by the gap to the neighbour door (MOD-DEC-740).
   */
  chosen: HingeCandidate | null;
  candidates: HingeCandidate[];
  /** Pairs whose table does not cover the overlay. */
  notCovered: { hingeId: string; plateId: string; reason: string }[];
}

/** The family the place needs (286): накладная at the carcass edge, полунакладная on a partition, вкладная inset. */
const MOUNTING_AT: Record<HingeEdgePosition, FacadeMounting> = { CARCASS_EDGE: 'OVERLAY', PARTITION: 'HALF_OVERLAY', INSET: 'INSET' };
const MOUNTING_NAME: Record<FacadeMounting, string> = { OVERLAY: 'накладная', HALF_OVERLAY: 'полунакладная', INSET: 'вкладная' };

const within = (x: number, r: { minMm: number; maxMm: number }) => x >= r.minMm && x <= r.maxMm;
const fmt = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', ',');

/** K for an overlay from the rows of one pair: a printed row, or linear between the two nearest rows. */
export function cupEdgeDistanceForOverlay(rows: OverlayRow[], overlayMm: number, interpolate = hingeSelection.constants.interpolateWithinTable.value) {
  const eps = hingeSelection.constants.rowMatch.value;
  const exact = rows.find((r) => Math.abs(r.overlayMm - overlayMm) <= eps);
  if (exact) return { cupEdgeDistanceMm: exact.cupEdgeDistanceMm, basis: 'TABLE_ROW' as const, rows: [exact] };
  if (!interpolate) return null;
  const below = rows.filter((r) => r.overlayMm < overlayMm).sort((a, b) => b.overlayMm - a.overlayMm)[0],
    above = rows.filter((r) => r.overlayMm > overlayMm).sort((a, b) => a.overlayMm - b.overlayMm)[0];
  if (!below || !above) return null;
  const k = below.cupEdgeDistanceMm + ((overlayMm - below.overlayMm) * (above.cupEdgeDistanceMm - below.cupEdgeDistanceMm)) / (above.overlayMm - below.overlayMm);
  return { cupEdgeDistanceMm: k, basis: 'TABLE_INTERPOLATION' as const, rows: [below, above] };
}

/** Rows of a pair for a facade thickness: rows for any thickness, or the rows printed for exactly this one. */
function rowsFor(c: HingeCatalog, hingeId: string, plateId: string, t: number) {
  const all = c.overlayRows.filter((r) => r.hingeId === hingeId && r.plateId === plateId);
  const exactT = all.filter((r) => r.facadeThicknessMm === t);
  return exactT.length ? exactT : all.filter((r) => r.facadeThicknessMm === null);
}

function checkPair(c: HingeCatalog, h: Hinge, p: HingeMountingPlate, k: number, d: HingeDemand): HingeCheck[] {
  const out: HingeCheck[] = [];
  const ft = h.facadeThicknessMm;
  out.push(
    ft.value === null
      ? { code: 'FACADE_THICKNESS', status: 'UNKNOWN', text: `Толщина фасада для ${h.article}: ${ft.reason}`, ref: null }
      : { code: 'FACADE_THICKNESS', status: within(d.facadeThicknessMm, ft.value) ? 'PASS' : 'FAIL', text: `Фасад ${fmt(d.facadeThicknessMm)} мм, петля ${h.article}: ${fmt(ft.value.minMm)}…${fmt(ft.value.maxMm)} мм`, ref: ft.ref },
  );
  const kr = h.cupEdgeDistanceMm;
  out.push(
    kr.value === null
      ? { code: 'CUP_EDGE_DISTANCE', status: 'UNKNOWN', text: `Пределы K для ${h.article}: ${kr.reason}`, ref: null }
      : { code: 'CUP_EDGE_DISTANCE', status: within(k, kr.value) ? 'PASS' : 'FAIL', text: `K = ${fmt(k)} мм, петля ${h.article}: ${fmt(kr.value.minMm)}…${fmt(kr.value.maxMm)} мм`, ref: kr.ref },
  );
  const wanted = MOUNTING_AT[d.position];
  if (h.mounting !== wanted) out.push({ code: 'MOUNTING', status: 'FAIL', text: `Петля ${h.article} (${MOUNTING_NAME[h.mounting]}), а здесь нужна ${MOUNTING_NAME[wanted]} (286)`, ref: h.ref });
  if (d.neighbourGapMm !== null) {
    const rows = c.minimumGapRows.filter((r) => r.hingeIds.includes(h.id) && r.facadeThicknessMm === d.facadeThicknessMm);
    // The two rows around K; the larger gap of them (the table is printed for whole K).
    const lo = rows.filter((r) => r.cupEdgeDistanceMm <= k).sort((a, b) => b.cupEdgeDistanceMm - a.cupEdgeDistanceMm)[0],
      hi = rows.filter((r) => r.cupEdgeDistanceMm >= k).sort((a, b) => a.cupEdgeDistanceMm - b.cupEdgeDistanceMm)[0];
    if (!lo || !hi) out.push({ code: 'NEIGHBOUR_GAP', status: 'UNKNOWN', text: `Минимальный зазор для ${h.article} при фасаде ${fmt(d.facadeThicknessMm)} мм и K = ${fmt(k)} мм в каталоге не найден`, ref: null });
    else {
      const need = Math.max(lo.gapMm, hi.gapMm);
      out.push({ code: 'NEIGHBOUR_GAP', status: d.neighbourGapMm >= need ? 'PASS' : 'FAIL', text: `Зазор до соседнего фасада ${fmt(d.neighbourGapMm)} мм, нужен не меньше ${fmt(need)} мм`, ref: lo.ref });
    }
  }
  // 162 is for overlay doors only: an inset door has no gap to the carcass front edge.
  if (d.depthGapMm !== null && d.position !== 'INSET') {
    const nom = h.depthGapMm, adj = h.adjustment.depthMm;
    if (nom.value === null || adj.value === null)
      out.push({ code: 'DEPTH_GAP', status: 'UNKNOWN', text: `Зазор фасад — корпус для ${h.article}: ${nom.reason ?? adj.reason}`, ref: null });
    else {
      const r = { minMm: nom.value + adj.value.minMm, maxMm: nom.value + adj.value.maxMm };
      out.push({ code: 'DEPTH_GAP', status: within(d.depthGapMm, r) ? 'PASS' : 'FAIL', text: `Зазор по глубине ${fmt(d.depthGapMm)} мм, петля даёт ${fmt(r.minMm)}…${fmt(r.maxMm)} мм`, ref: nom.ref });
    }
  }
  if (d.innerDrawerBehind && hingeSelection.constants.zeroProtrusionBehindDrawer.value) {
    const z = h.zeroProtrusion;
    out.push(
      z.value === null
        ? { code: 'ZERO_PROTRUSION', status: 'UNKNOWN', text: `Zero protrusion у ${h.article}: ${z.reason}`, ref: null }
        : { code: 'ZERO_PROTRUSION', status: z.value ? 'PASS' : 'FAIL', text: z.value ? `${h.article}: Zero protrusion по документации производителя` : `${h.article} без Zero protrusion, за внутренним ящиком нельзя (288)`, ref: z.ref },
    );
    // Zero protrusion holds from a documented opening angle; a wall that stops the door earlier needs a spacer
    // as thick as the door protrudes into the opening at that angle.
    if (z.value && d.openingLimitDeg !== null) {
      const a = h.zeroProtrusionFromDeg;
      if (a.value === null) out.push({ code: 'OPENING_ANGLE', status: 'UNKNOWN', text: `Угол, с которого у ${h.article} нет вылета в проём: ${a.reason}`, ref: null });
      else if (d.openingLimitDeg >= a.value) out.push({ code: 'OPENING_ANGLE', status: 'PASS', text: `Дверь открывается на ${fmt(d.openingLimitDeg)}°, Zero protrusion с ${fmt(a.value)}°`, ref: a.ref });
      else {
        const p = protrusionAt(h, d.openingLimitDeg);
        if (!p) out.push({ code: 'OPENING_ANGLE', status: 'UNKNOWN', text: `Дверь открывается только на ${fmt(d.openingLimitDeg)}°; вылет ${h.article} внутрь проёма при этом угле: ${h.protrusionByAngle.reason ?? 'в каталоге нет угла не больше этого'}; проставка по умолчанию — ${fmt(hingeSelection.constants.spacerOptions.value[0].thicknessMm)} мм`, ref: null });
        else out.push({ code: 'OPENING_ANGLE', status: 'FAIL', text: `Дверь открывается только на ${fmt(d.openingLimitDeg)}°, Zero protrusion у ${h.article} с ${fmt(a.value)}°: вылет ${fmt(p.protrusionMm)} мм (при ${fmt(p.angleDeg)}°), нужна проставка на боковину`, ref: h.protrusionByAngle.ref });
      }
    }
  }
  const pt = p.recommendedPanelThicknessMm;
  if (pt) out.push({ code: 'PANEL_THICKNESS', status: within(d.panelThicknessMm, pt) ? 'PASS' : 'FAIL', text: `Планка ${p.article}: плита ${fmt(pt.minMm)}…${fmt(pt.maxMm)} мм, в изделии ${fmt(d.panelThicknessMm)} мм`, ref: p.ref });
  return out;
}

/**
 * Protrusion at an opening angle: the documented angle equal to it, or the nearest smaller one (the door
 * protrudes more when it opens less, so the smaller angle is on the safe side). No interpolation of the kinematics.
 */
export function protrusionAt(h: Hinge, angleDeg: number) {
  const rows = h.protrusionByAngle.value;
  if (!rows) return null;
  return rows.filter((r) => r.angleDeg <= angleDeg).sort((a, b) => b.angleDeg - a.angleDeg)[0] ?? null;
}

/** The thinnest spacer of the policy that covers the protrusion; null — none is thick enough. */
export function spacerFor(protrusionMm: number) {
  return hingeSelection.constants.spacerOptions.value.find((o) => o.thicknessMm >= protrusionMm) ?? null;
}

const statusOf = (checks: HingeCheck[]): HingeCandidate['status'] => {
  const fails = checks.filter((x) => x.status === 'FAIL');
  if (fails.some((x) => x.code !== 'OPENING_ANGLE')) return 'REJECTED';
  if (checks.some((x) => x.status === 'UNKNOWN')) return 'UNKNOWN';
  return fails.length ? 'NEEDS_SPACER' : 'OK';
};

/** All pairs «hinge + plate» of the catalogue for one facade, checked, and the chosen one. */
export function selectHinge(d: HingeDemand, c: HingeCatalog, preferredHingeIds: readonly string[] = hingeSelection.constants.preferredHinges.value): HingeSelection {
  const candidates: HingeCandidate[] = [],
    notCovered: HingeSelection['notCovered'] = [];
  // MOD-DEC-483: a door opened by pressing takes a hinge without a spring, any other door never does. A special
  // hinge (glass, +45°, false panel, bifold) is not a hinge of a carcass door: the node that needs it asks for its kind.
  const push = hingeSelection.constants.pushToOpenHinges.value,
    kind = d.application ?? 'STANDARD';
  for (const h of c.hinges.filter((x) => (x.application ?? 'STANDARD') === kind && push.includes(x.id) === !!d.pushToOpen))
    for (const plateId of h.plates) {
      const p = c.plates.find((x) => x.id === plateId);
      if (!p) continue;
      const rows = rowsFor(c, h.id, plateId, d.facadeThicknessMm);
      if (!rows.length) {
        notCovered.push({ hingeId: h.id, plateId, reason: `нет таблицы наложений для фасада ${fmt(d.facadeThicknessMm)} мм` });
        continue;
      }
      const hit = cupEdgeDistanceForOverlay(rows, d.overlayMm);
      if (!hit) {
        const a = rows.map((r) => r.overlayMm);
        notCovered.push({ hingeId: h.id, plateId, reason: `таблица ${fmt(Math.min(...a))}…${fmt(Math.max(...a))} мм не содержит наложения ${fmt(d.overlayMm)} мм` });
        continue;
      }
      const checks = checkPair(c, h, p, hit.cupEdgeDistanceMm, d);
      let spacer: HingeCandidate['spacer'] = null;
      // The catalogue does not give the protrusion at this angle: the owner's default spacer (16 mm), and the
      // candidate stays UNKNOWN until the protrusion is known.
      if (checks.some((x) => x.code === 'OPENING_ANGLE' && x.status === 'UNKNOWN')) spacer = { ...hingeSelection.constants.spacerOptions.value[0], protrusionMm: null, atAngleDeg: null };
      if (checks.some((x) => x.code === 'OPENING_ANGLE' && x.status === 'FAIL')) {
        const pr = protrusionAt(h, d.openingLimitDeg as number)!,
          o = spacerFor(pr.protrusionMm);
        if (o) spacer = { ...o, protrusionMm: pr.protrusionMm, atAngleDeg: pr.angleDeg };
        else checks.push({ code: 'SPACER', status: 'FAIL', text: `Вылет ${fmt(pr.protrusionMm)} мм больше самой толстой проставки политики`, ref: null });
      }
      const candidate: HingeCandidate = {
        hingeId: h.id,
        plateId,
        mounting: h.mounting,
        cupEdgeDistanceMm: hit.cupEdgeDistanceMm,
        cupCentreFromEdgeMm: hit.cupEdgeDistanceMm + h.cup.diameterMm / 2,
        basis: hit.basis,
        rows: hit.rows,
        checks,
        spacer,
        status: statusOf(checks),
        drilling: 'INCOMPLETE',
        plateRecommended: (h.recommendedPlates.value ?? []).some((r) => r.plateId === plateId && r.panelThicknessMm === d.panelThicknessMm),
      };
      candidate.drilling = hingeDrillingScheme(candidate, c, d).completeness;
      candidates.push(candidate);
    }
  const rank = { OK: 0, NEEDS_SPACER: 1, UNKNOWN: 2, REJECTED: 3 } as const;
  const pref = (id: string) => (preferredHingeIds.includes(id) ? preferredHingeIds.indexOf(id) : preferredHingeIds.length);
  const unknowns = (x: HingeCandidate) => x.checks.filter((k) => k.status === 'UNKNOWN').length;
  const kOff = (x: HingeCandidate) => {
    const r = c.hinges.find((h) => h.id === x.hingeId)!.cupEdgeDistanceMm.value;
    return r ? Math.abs(x.cupEdgeDistanceMm - (r.minMm + r.maxMm) / 2) : 0;
  };
  const special = (x: HingeCandidate) => (!d.innerDrawerBehind && c.hinges.find((h) => h.id === x.hingeId)!.zeroProtrusion.value === true ? 1 : 0);
  const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  candidates.sort(
    (a, b) =>
      Number(a.status === 'REJECTED') - Number(b.status === 'REJECTED') ||
      pref(a.hingeId) - pref(b.hingeId) ||
      rank[a.status] - rank[b.status] ||
      special(a) - special(b) ||
      (a.drilling === b.drilling ? 0 : a.drilling === 'COMPLETE' ? -1 : 1) ||
      unknowns(a) - unknowns(b) ||
      (a.basis === b.basis ? 0 : a.basis === 'TABLE_ROW' ? -1 : 1) ||
      Number(b.plateRecommended) - Number(a.plateRecommended) ||
      kOff(a) - kOff(b) ||
      b.cupEdgeDistanceMm - a.cupEdgeDistanceMm ||
      byCode(a.hingeId, b.hingeId) ||
      byCode(a.plateId, b.plateId),
  );
  // MOD-DEC-740 (FINDINGS 2732, (Д) Директора): a hinge of the journal that only the gap to the neighbour door rejects stays chosen,
  // its FAIL is the reason — the selection does not go to a hinge of another family (without data, without its chart).
  const journal = hingeSelection.constants.preferredHinges.value,
    fit = candidates.find((x) => x.status !== 'REJECTED'),
    held = hingeSelection.constants.keepJournalHingeOnGapFail.value
      ? candidates.find((x) => x.status === 'REJECTED' && journal.includes(x.hingeId) && x.checks.every((k) => k.status !== 'FAIL' || k.code === 'NEIGHBOUR_GAP'))
      : undefined,
    chosen = (fit && (preferredHingeIds.includes(fit.hingeId) || !held) ? fit : held ?? fit) ?? null;
  return { demand: d, chosen, candidates, notCovered };
}

export interface TierHingeSelection extends HingeSelection {
  tier: HardwareTier;
  /** The hinge of the level is not taken: why and what instead (the bell); null — it is taken. */
  substitution: TierSubstitution | null;
}

/**
 * The hinge of a level (MOD-DEC-466): its hinges first, then the order of «Стандарт» (the hinges of the journal,
 * 073). The level not chosen is «Стандарт» (223) — exactly selectHinge.
 */
export function selectHingeForTier(d: HingeDemand, c: HingeCatalog, tier: HardwareTier = 'STANDARD'): TierHingeSelection {
  const K = hingeSelection.constants,
    standard = K.tierHinges.value[K.tierFallback.value],
    wanted = K.tierHinges.value[tier],
    sel = selectHinge(d, c, tier === K.tierFallback.value ? K.preferredHinges.value : [...wanted, ...K.preferredHinges.value]);
  if (tier === K.tierFallback.value) return { ...sel, tier, substitution: null };
  const inCatalog = wanted.filter((id) => c.hinges.some((h) => h.id === id)),
    own = sel.candidates.filter((x) => wanted.includes(x.hingeId)),
    uncovered = sel.notCovered.filter((x) => wanted.includes(x.hingeId)),
    whyNot = !inCatalog.length
      ? 'нет в каталоге (нет данных производителя)'
      : own.length
        ? `не подходят фасаду: ${[...new Set(own.flatMap((x) => x.checks.filter((k) => k.status === 'FAIL').map((k) => k.text)))].join('; ')}`
        : uncovered.length
          ? `таблицы наложений не дают это наложение (${uncovered[0]!.reason})`
          : `нет петли ${TIER_NAMES[tier]} для этого фасада`;
  const taken = sel.chosen?.hingeId ?? null;
  // Whatever the order of «Стандарт» takes is the hinge of «Стандарт»: the journal hinges first, other manufacturers after (205).
  return { ...sel, tier, substitution: tierSubstitution(tier, wanted, taken, taken === null ? standard : [taken], whyNot) };
}

/** A hole of the drilling scheme in local coordinates of its part, relative to the hinge station. */
export interface SchemeHole {
  part: 'FACADE' | 'PANEL';
  /** `CUP`, `CUP_FIXING`, `PLATE`. */
  machiningRole: string;
  /** Facade: from the hinge-side edge; panel: from the front edge. */
  acrossMm: number;
  /** Along the height from the station (the cup centre). */
  alongMm: number;
  diameterMm: number | null;
  depthMm: number | null;
  kind: string;
  ref: CatalogRef;
  /** MOD-DEC-277, 328: the hole of the kit (.fr3d) or of the catalogue, when the kit lacks its role. */
  origin: 'KIT' | 'CATALOG';
}

export interface DrillingScheme {
  hingeId: string;
  plateId: string;
  /** MOD-DEC-277: KIT — the holes of the BAZIS kit (.fr3d); CATALOG — no kit, the holes as the catalogue prints them. */
  source: 'KIT' | 'CATALOG';
  holes: SchemeHole[];
  /** MOD-DEC-277: INCOMPLETE when neither the kit nor the catalogue gives a hole fully (diameter, depth or position). */
  completeness: 'COMPLETE' | 'INCOMPLETE';
  missing: string[];
}

/**
 * Drilling of one hinge station: the cup and its fixing holes in the facade, the plate holes in the panel. The
 * cup and the plate come from one candidate, so they cannot drift apart (INV-M03, defect WR-01). The holes are
 * the kit's when the pair has one (MOD-DEC-277), otherwise the catalogue's; the cup position K is always the
 * manufacturer table's, the kit does not move it. The plate line is counted from the carcass front edge: the kit's
 * own depth gap (Hettich: 1,5 mm) is taken off, an inset door adds its thickness.
 */
export function hingeDrillingScheme(sel: HingeCandidate, c: HingeCatalog, d: Pick<HingeDemand, 'facadeThicknessMm' | 'insetDepthMm'>): DrillingScheme {
  const h = c.hinges.find((x) => x.id === sel.hingeId),
    p = c.plates.find((x) => x.id === sel.plateId);
  if (!h || !p) throw Error(`HINGE_NOT_IN_CATALOG: ${sel.hingeId} + ${sel.plateId}`);
  const missing: string[] = [];
  const line = h.plateLine;
  if (!line) missing.push(`${h.article}: линия планки на корпусе`);
  const shift = line ? (line.addsFacadeThickness ? d.facadeThicknessMm : 0) + (line.addsInsetDepth ? (d.insetDepthMm ?? 0) : 0) : 0;
  const printed = printedHoles(h, p, sel, shift, d.facadeThicknessMm);
  const kit = drillingKit(c, h.id, p.id);
  if (kit) {
    // MOD-DEC-374: the plate holes of these plates are the catalogue's, not the kit's (an exception from 277).
    const plateByCatalog = hingeSelection.constants.catalogPlateHoles.value.includes(p.id);
    const holes: SchemeHole[] = kit.holes.filter((x) => !(plateByCatalog && x.machiningRole === 'PLATE')).map((x) => ({
      part: x.part, machiningRole: x.machiningRole, acrossMm: x.part === 'FACADE' ? sel.cupCentreFromEdgeMm + x.acrossMm : x.acrossMm - kit.depthGapMm + shift,
      alongMm: x.alongMm, diameterMm: x.diameterMm, depthMm: x.depthMm, kind: x.machiningRole === 'CUP' ? 'CUP' : x.part === 'FACADE' ? h.cup.fixing.kind : 'PILOT', ref: kit.ref, origin: 'KIT' as const,
    }));
    // MOD-DEC-328: an incomplete kit keeps its holes; a role it lacks is added from the catalogue with the catalogue's page.
    for (const role of ['CUP', 'CUP_FIXING', 'PLATE'] as const)
      if (!holes.some((x) => x.machiningRole === role) && (printed.holes.some((x) => x.machiningRole === role) || printed.missing[role].length)) {
        holes.push(...printed.holes.filter((x) => x.machiningRole === role));
        missing.push(...printed.missing[role]);
      }
    return { hingeId: h.id, plateId: p.id, source: 'KIT', holes, completeness: missing.length ? 'INCOMPLETE' : 'COMPLETE', missing: [...new Set(missing)] };
  }
  // A hinge for glass on a plate of the carcass doors (MOD-AI-37): the plate is the same, its holes are those of the
  // BAZIS kit of that plate (277) when the catalogue does not print them; the cup in the glass is the catalogue's.
  const plateKit = h.application === 'GLASS' && printed.missing.PLATE.length ? c.kits.find((k) => k.plateId === p.id && k.holes.some((x) => x.part === 'PANEL')) : undefined;
  if (plateKit) {
    const holes = [
      ...printed.holes.filter((x) => x.machiningRole !== 'PLATE'),
      ...plateKit.holes
        .filter((x) => x.part === 'PANEL')
        .map((x) => ({ part: x.part, machiningRole: x.machiningRole, acrossMm: x.acrossMm - plateKit.depthGapMm + shift, alongMm: x.alongMm, diameterMm: x.diameterMm, depthMm: x.depthMm, kind: 'PILOT', ref: plateKit.ref, origin: 'KIT' as const })),
    ];
    missing.push(...printed.missing.CUP, ...printed.missing.CUP_FIXING);
    return { hingeId: h.id, plateId: p.id, source: 'CATALOG', holes, completeness: missing.length ? 'INCOMPLETE' : 'COMPLETE', missing: [...new Set(missing)] };
  }
  missing.push(...printed.missing.CUP, ...printed.missing.CUP_FIXING, ...printed.missing.PLATE);
  return { hingeId: h.id, plateId: p.id, source: 'CATALOG', holes: printed.holes, completeness: missing.length ? 'INCOMPLETE' : 'COMPLETE', missing: [...new Set(missing)] };
}

/** The holes of a hinge and its plate as the catalogue prints them, and what it does not print, by machining role. */
function printedHoles(h: Hinge, p: HingeMountingPlate, sel: HingeCandidate, shift: number, facadeMm: number): { holes: SchemeHole[]; missing: Record<'CUP' | 'CUP_FIXING' | 'PLATE', string[]> } {
  const holes: SchemeHole[] = [],
    missing: Record<'CUP' | 'CUP_FIXING' | 'PLATE', string[]> = { CUP: [], CUP_FIXING: [], PLATE: [] },
    r = h.cup.depthRangeMm,
    // A hinge for glass takes the glass its range gives through a hole of its cup (MOD-AI-37): the depth is the glass.
    through = h.application === 'GLASS' && h.cup.depthMm === null && !!r && facadeMm >= r.minMm && facadeMm <= r.maxMm;
  holes.push({ part: 'FACADE', machiningRole: 'CUP', acrossMm: sel.cupCentreFromEdgeMm, alongMm: 0, diameterMm: h.cup.diameterMm, depthMm: through ? facadeMm : h.cup.depthMm, kind: 'CUP', ref: h.cup.ref, origin: 'CATALOG' });
  if (h.cup.depthMm === null && !through) {
    missing.CUP.push(`${h.article}: глубина чашки${r ? ` — каталог даёт только пределы ${fmt(r.minMm)}…${fmt(r.maxMm)} мм` : ''}`);
  }
  const f = h.cup.fixing;
  if (f.kind !== 'NONE') {
    if (f.spacingMm === null || f.offsetMm === null) missing.CUP_FIXING.push(`${h.article}: положение крепления чашки`);
    else
      for (const s of [-1, 1])
        holes.push({ part: 'FACADE', machiningRole: 'CUP_FIXING', acrossMm: sel.cupCentreFromEdgeMm + f.offsetMm, alongMm: (s * f.spacingMm) / 2, diameterMm: f.holeDiameterMm, depthMm: f.holeDepthMm, kind: f.kind, ref: h.cup.ref, origin: 'CATALOG' });
    if (f.holeDiameterMm === null || f.holeDepthMm === null) missing.CUP_FIXING.push(`${h.article}: диаметр и глубина отверстий крепления чашки`);
  }
  for (const x of p.holes) {
    holes.push({ part: 'PANEL', machiningRole: 'PLATE', acrossMm: x.fromFrontEdgeMm + shift, alongMm: x.alongMm, diameterMm: x.diameterMm, depthMm: x.depthMm, kind: x.kind, ref: p.ref, origin: 'CATALOG' });
    if (x.diameterMm === null || x.depthMm === null) missing.PLATE.push(`${p.article}: диаметр и глубина отверстия ${x.kind}`);
  }
  return { holes, missing };
}
