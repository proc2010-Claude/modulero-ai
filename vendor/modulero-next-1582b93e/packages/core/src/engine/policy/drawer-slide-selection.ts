// Drawer slide selection (task «Подбор направляющих ящиков», input of the drawers of W7 and K3): for one drawer —
// inner (behind a door, MOD-DEC-050) or with its own front — the runners of the catalogue
// (catalog/hardware/drawer-slides.ts) checked for the length the depth takes, the load, the box sides, the wanted
// kind and motion, the box width and the drilling (MOD-DEC-277); then the box the chosen runner gives (Handbook r8
// INV-C15-01: from the runner profile, no data of another system), the holes in the side panel, and the passage of
// the drawer past the open door (MOD-DEC-159/164).
// Pure functions; the numbers of the manufacturers live in the catalogue, the rules of the owner here (ENGINE.md
// §4). Each level of the hardware has its runner (MOD-DEC-466): «Эконом» — BOYARD DB4501, «Стандарт» — BOYARD B-Slide
// DB8781 (the standard runner of HOLD 032), «Премиум» — Blum MOVENTO; after them the order of the candidates is the
// executor's rule (Д), written in docs/DRAWER_SLIDES.md. The selection is not wired into the wardrobe or the kitchen yet.
import type { CatalogRef, DrawerSlide, DrawerSlideCatalog, DrawerSlideExtension, DrawerSlideKind, DrawerSlideLength } from '../../catalog/hardware/drawer-slides.js';
import { tierSubstitution, type HardwareTier, type TierSubstitution } from './hardware-tier.js';
import { constant, decision, unknownSource, type PolicyModule } from './types.js';

/**
 * Rules of the selection. MOD-DEC-466: the runner of the level goes first, if no check rejects it; then the runner of
 * «Стандарт» (465, (Д)) with the warning of the substitution; then the executor's order. The level not chosen is
 * «Стандарт» (223). MOD-DEC-277: the drilling comes from
 * the BAZIS kit of the article, then from the catalogue; without both the scheme is INCOMPLETE. MOD-DEC-205: no
 * drilling of another article. MOD-DEC-159: the numeric margins (5/10/11/20/30 mm) are not approved, so the margin
 * of the passage past the open door has no value until the owner answers (the question is in the PR). MOD-DEC-361:
 * behind a documented Zero protrusion hinge the margin is 0 — the open door does not enter the opening.
 */
export const drawerSlideSelection = {
  id: 'drawer-slide-selection',
  version: '3',
  constants: {
    standardSlide: constant('BOYARD_DB8781', 'id', decision('MOD-DEC-466'), 'Стандартная направляющая — BOYARD B-Slide DB8781 (HOLD 032 в части выбора снят; физическая проверка комплекта «петля + планка + направляющая» открыта)'),
    tierSlides: constant<Readonly<Record<HardwareTier, string>>>(
      { ECONOMY: 'BOYARD_DB4501', STANDARD: 'BOYARD_DB8781', PREMIUM: 'BLUM_MOVENTO_760H' },
      'id',
      decision('MOD-DEC-466'),
      'Направляющая уровня по умолчанию: Эконом — BOYARD DB4501 (шариковая), Стандарт — BOYARD B-Slide DB8781, Премиум — Blum MOVENTO',
    ),
    tierFallback: constant<HardwareTier>('STANDARD', 'tier', decision('MOD-DEC-465'), '(Д) Направляющей уровня нет в каталоге или она не подходит — берётся направляющая «Стандарта», в «колокольчике» — что и почему заменено; узел не скрывается (465)'),
    defaultTier: constant<HardwareTier>('STANDARD', 'tier', decision('MOD-DEC-223'), 'Уровень не выбран — «Стандарт», как у полкодержателей'),
    drillingFromKitThenCatalog: constant(true, 'flag', decision('MOD-DEC-277'), 'Присадка — из набора БАЗИС артикула, затем из каталога; без них схема INCOMPLETE («присадка неполная»)'),
    noOtherArticleDrilling: constant(true, 'flag', decision('MOD-DEC-205'), 'Присадка другого артикула не подставляется'),
    passageMarginMm: constant<number | null>(null, 'mm', unknownSource('HOLD MOD-DEC-159: числовые запасы не утверждены'), 'Запас между открытой дверью и ящиком с направляющей при обычной петле — вопрос владельцу (DRAWER_SLIDES.md)'),
    zeroProtrusionPassageMarginMm: constant(0, 'mm', decision('MOD-DEC-361'), 'За петлёй с документированным Zero protrusion запаса нет: достаточно, чтобы открытая дверь не заходила в проём'),
  },
} as const satisfies PolicyModule;

/** One drawer as the selection sees it. */
export interface DrawerSlideDemand {
  /** INTERNAL — внутренний ящик за дверью (050); EXTERNAL — ящик со своим фасадом. */
  placement: 'INTERNAL' | 'EXTERNAL';
  /** Clear width between the side panels (a spacer of 331 already subtracted). */
  openingWidthMm: number;
  /** Inside depth of the carcass from the front edge of the side panel. */
  insideDepthMm: number;
  /** The runner is set back from the front edge of the side panel by this (an inner drawer behind the door); 0 by default. */
  frontSetbackMm?: number;
  boxSideThicknessMm: number;
  /** Payload of the drawer; not given — the load is not checked (there is no decision on the payload of a drawer). */
  payloadKg?: number | null;
  kind?: DrawerSlideKind;
  extension?: DrawerSlideExtension;
  softClose?: boolean;
  pushToOpen?: boolean;
}

export type DrawerSlideCheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface DrawerSlideCheck {
  code: 'LENGTH' | 'LOAD' | 'BOX_SIDE' | 'FEATURES' | 'WIDTH' | 'DRILLING';
  status: DrawerSlideCheckStatus;
  text: string;
  ref: CatalogRef | null;
}

/** The box a runner gives: widths from the width rule of the series, length from NL. */
export interface DrawerBoxSize {
  outerWidthMm: number;
  innerWidthMm: number;
  /** null — the source does not give the length rule. */
  lengthMm: number | null;
}

export interface DrawerSlideCandidate {
  slideId: string;
  brand: string;
  /** Length taken: the longest NL the depth allows; null — none fits. */
  nominalMm: number | null;
  article: string | null;
  checks: DrawerSlideCheck[];
  /** OK — every check passes; UNKNOWN — none fails but the catalogue lacks data; REJECTED — a check fails. */
  status: 'OK' | 'UNKNOWN' | 'REJECTED';
  box: DrawerBoxSize | null;
}

export interface DrawerSlideSelection {
  demand: DrawerSlideDemand;
  tier: HardwareTier;
  /**
   * First candidate not rejected: the runner of the level (466), then of «Стандарт», then by the executor's order (Д):
   * status, fewer unknown checks, no push to open unless asked, longer NL, id. The runner of the level is taken with
   * its UNKNOWN checks (incomplete drilling of MOVENTO): they go to the bell, the level is not changed for them.
   */
  chosen: DrawerSlideCandidate | null;
  /** The runner of the level is not taken: why and what instead (the bell); null — it is taken. */
  substitution: TierSubstitution | null;
  candidates: DrawerSlideCandidate[];
  /** Why nothing is chosen; null when a candidate is. */
  reason: string | null;
  /** The basis of the order, for the report. */
  basis: string;
}

const fmt = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', ',');

/** The length a depth takes: the longest NL whose smallest depth (or, without it, NL itself) fits. */
function lengthFor(s: DrawerSlide, depthMm: number): { l: DrawerSlideLength | null; check: DrawerSlideCheck } {
  const fits = s.lengths.filter((l) => (l.minInsideDepthMm.value ?? l.nominalMm) <= depthMm),
    l = fits[fits.length - 1] ?? null;
  if (!l)
    return { l, check: { code: 'LENGTH', status: 'FAIL', text: `${s.article}: глубина ${fmt(depthMm)} мм меньше наименьшей длины NL ${s.lengths[0]!.nominalMm}`, ref: s.ref } };
  const m = l.minInsideDepthMm;
  return {
    l,
    check:
      m.value === null
        ? { code: 'LENGTH', status: 'UNKNOWN', text: `${s.article}: NL ${l.nominalMm} ≤ глубины ${fmt(depthMm)} мм; наименьшая глубина корпуса — ${m.reason}`, ref: null }
        : { code: 'LENGTH', status: 'PASS', text: `${s.article}: NL ${l.nominalMm}, наименьшая глубина ${fmt(m.value)} ≤ ${fmt(depthMm)} мм`, ref: m.ref },
  };
}

/** The box of a runner for a demand; null — the width rule is not known. */
export function drawerBoxSize(s: DrawerSlide, nominalMm: number, openingWidthMm: number, boxSideThicknessMm: number): DrawerBoxSize | null {
  const w = s.boxWidth.value;
  if (!w) return null;
  const t2 = 2 * boxSideThicknessMm,
    outer = w.kind === 'OUTER' ? openingWidthMm - w.deductionMm : openingWidthMm - w.deductionMm + t2,
    d = s.boxLengthDeductionMm.value;
  return { outerWidthMm: outer, innerWidthMm: outer - t2, lengthMm: d === null ? null : nominalMm - d };
}

function featureChecks(s: DrawerSlide, d: DrawerSlideDemand): DrawerSlideCheck[] {
  const out: DrawerSlideCheck[] = [];
  if (d.kind && d.kind !== s.kind) out.push({ code: 'FEATURES', status: 'FAIL', text: `${s.article}: ${s.kind === 'CONCEALED' ? 'скрытого монтажа' : 'шариковая'}, нужна ${d.kind === 'CONCEALED' ? 'скрытого монтажа' : 'шариковая'}`, ref: s.ref });
  if (d.extension && d.extension !== s.extension) out.push({ code: 'FEATURES', status: 'FAIL', text: `${s.article}: ${s.extension === 'FULL' ? 'полное' : 'неполное'} выдвижение`, ref: s.ref });
  for (const [want, k, name] of [[d.softClose, s.softClose, 'доводчик'], [d.pushToOpen, s.pushToOpen, 'push to open']] as const) {
    if (want === undefined) continue;
    out.push(
      k.value === null
        ? { code: 'FEATURES', status: 'UNKNOWN', text: `${s.article}: ${name} — ${k.reason}`, ref: null }
        : { code: 'FEATURES', status: k.value === want ? 'PASS' : 'FAIL', text: `${s.article}: ${name} ${k.value ? 'есть' : 'нет'}, ${want ? 'нужен' : 'не нужен'}`, ref: k.ref },
    );
  }
  return out;
}

function checkSlide(s: DrawerSlide, d: DrawerSlideDemand): DrawerSlideCandidate {
  const setback = d.frontSetbackMm ?? 0,
    { l, check } = lengthFor(s, d.insideDepthMm - setback),
    checks: DrawerSlideCheck[] = [check, ...featureChecks(s, d)];
  if (l && d.payloadKg !== undefined && d.payloadKg !== null)
    checks.push(
      l.loadKg.value === null
        ? { code: 'LOAD', status: 'UNKNOWN', text: `${s.article}: нагрузка — ${l.loadKg.reason}`, ref: null }
        : { code: 'LOAD', status: d.payloadKg <= l.loadKg.value ? 'PASS' : 'FAIL', text: `Ящик с грузом ${fmt(d.payloadKg)} кг, ${s.article} NL ${l.nominalMm} держит ${fmt(l.loadKg.value)} кг`, ref: l.loadKg.ref },
    );
  // A ball runner holds the box by its outer face: a source that sets no thickness sets no check.
  const st = s.boxSideThicknessMm;
  if (st.value !== null || s.kind === 'CONCEALED')
    checks.push(
      st.value === null
        ? { code: 'BOX_SIDE', status: 'UNKNOWN', text: `${s.article}: боковина ящика ${fmt(d.boxSideThicknessMm)} мм; ${st.reason}`, ref: null }
        : {
          code: 'BOX_SIDE',
          status: d.boxSideThicknessMm >= st.value.minMm && d.boxSideThicknessMm <= st.value.maxMm ? 'PASS' : 'FAIL',
          text: `Боковина ящика ${fmt(d.boxSideThicknessMm)} мм, ${s.article}: ${st.value.minMm === st.value.maxMm ? fmt(st.value.minMm) : `${fmt(st.value.minMm)}…${fmt(st.value.maxMm)}`} мм`,
            ref: st.ref,
          },
    );
  const box = l ? drawerBoxSize(s, l.nominalMm, d.openingWidthMm, d.boxSideThicknessMm) : null;
  if (!box) checks.push({ code: 'WIDTH', status: 'UNKNOWN', text: `${s.article}: ширина ящика — ${s.boxWidth.reason ?? 'длина не подобрана'}`, ref: null });
  else {
    const min = s.minBoxInnerWidthMm?.value ?? 0;
    checks.push({
      code: 'WIDTH',
      status: box.innerWidthMm > 0 && box.innerWidthMm >= min ? 'PASS' : 'FAIL',
      text: `Проём ${fmt(d.openingWidthMm)} мм → ящик ${fmt(box.outerWidthMm)} мм снаружи, ${fmt(box.innerWidthMm)} мм внутри${min ? ` (не меньше ${fmt(min)})` : ''}`,
      ref: s.boxWidth.ref,
    });
  }
  if (l) {
    const sc = drawerSlideScheme(s, l.nominalMm, setback);
    checks.push(
      sc.completeness === 'COMPLETE'
        ? { code: 'DRILLING', status: 'PASS', text: `${s.article} NL ${l.nominalMm}: присадка боковины известна`, ref: l.carcassHolesFromFrontMm.ref }
        : { code: 'DRILLING', status: 'UNKNOWN', text: `${s.article} NL ${l.nominalMm}: присадка неполная (277) — ${sc.missing.join('; ')}`, ref: null },
    );
  }
  const status = checks.some((x) => x.status === 'FAIL') ? 'REJECTED' : checks.some((x) => x.status === 'UNKNOWN') ? 'UNKNOWN' : 'OK';
  return { slideId: s.id, brand: s.brand, nominalMm: l?.nominalMm ?? null, article: l?.article ?? null, checks, status, box };
}

const BASIS = 'MOD-DEC-466: сначала направляющая уровня, затем «Стандарта» (465, (Д)); дальше — порядок исполнителя (Д): статус, меньше неизвестных, без push to open, если он не запрошен, длиннее NL, id';

/** All runners of the catalogue for one drawer, checked, and the first: of the level, of «Стандарт», then by the executor's order. */
export function selectDrawerSlide(d: DrawerSlideDemand, c: DrawerSlideCatalog, tier: HardwareTier = drawerSlideSelection.constants.defaultTier.value): DrawerSlideSelection {
  const K = drawerSlideSelection.constants,
    want = K.tierSlides.value[tier],
    standard = K.tierSlides.value[K.tierFallback.value],
    level = (x: DrawerSlideCandidate) => (x.status === 'REJECTED' ? 2 : x.slideId === want ? 0 : x.slideId === standard ? 1 : 2),
    rank = { OK: 0, UNKNOWN: 1, REJECTED: 2 } as const,
    unknowns = (x: DrawerSlideCandidate) => x.checks.filter((k) => k.status === 'UNKNOWN').length,
    // Push to open not asked for goes after: it needs a gap at the front and a front to press.
    push = new Set(d.pushToOpen === undefined ? c.slides.filter((s) => s.pushToOpen.value === true).map((s) => s.id) : []),
    pushed = (x: DrawerSlideCandidate) => Number(push.has(x.slideId));
  const candidates = c.slides
    .map((s) => checkSlide(s, d))
    .sort((a, b) => level(a) - level(b) || rank[a.status] - rank[b.status] || unknowns(a) - unknowns(b) || pushed(a) - pushed(b) || (b.nominalMm ?? 0) - (a.nominalMm ?? 0) || a.slideId.localeCompare(b.slideId));
  const chosen = candidates.find((x) => x.status !== 'REJECTED') ?? null;
  // The texts of the failed checks, not their codes (R5-004, FINDINGS 2918).
  const reason = chosen ? null : candidates.length ? `подходящей направляющей нет — ${candidates.map((x) => x.checks.filter((k) => k.status === 'FAIL').map((k) => k.text).join('; ') || x.slideId).join('; ')}` : 'каталог направляющих пуст';
  const own = candidates.find((x) => x.slideId === want),
    whyNot = own ? `не подходит: ${own.checks.filter((k) => k.status === 'FAIL').map((k) => k.text).join('; ')}` : 'нет в каталоге';
  return { demand: d, tier, chosen, substitution: tierSubstitution(tier, [want], chosen?.slideId ?? null, [standard], whyNot), candidates, reason, basis: BASIS };
}

/** A hole of the runner in the inner face of a side panel; the other side mirrors it. */
export interface DrawerSlideHole {
  /** From the front edge of the side panel. */
  fromFrontMm: number;
  heightRef: DrawerSlide['carcassFixing']['heightRef'];
  /** Above `heightRef`; null — not known. */
  heightMm: number | null;
  diameterMm: number | null;
  depthMm: number | null;
  ref: CatalogRef | null;
}

export interface DrawerSlideScheme {
  slideId: string;
  nominalMm: number;
  holes: DrawerSlideHole[];
  fastener: string;
  /** MOD-DEC-277: INCOMPLETE when the kit and the catalogue do not give a size. */
  completeness: 'COMPLETE' | 'INCOMPLETE';
  missing: string[];
}

/** Holes of one runner of length `nominalMm` in a side panel, the runner set back by `frontSetbackMm` more than the source. */
export function drawerSlideScheme(s: DrawerSlide, nominalMm: number, frontSetbackMm = 0): DrawerSlideScheme {
  const l = s.lengths.find((x) => x.nominalMm === nominalMm);
  const f = s.carcassFixing,
    missing: string[] = [];
  if (!l) missing.push(`${s.article}: длины NL ${nominalMm} в каталоге нет`);
  const pos = l?.carcassHolesFromFrontMm;
  if (pos && pos.value === null) missing.push(`положение отверстий — ${pos.reason}`);
  for (const [k, name] of [[f.heightMm, 'высота'], [f.diameterMm, 'диаметр'], [f.depthMm, 'глубина']] as const) if (k.value === null) missing.push(`${name} — ${k.reason}`);
  const holes = (pos?.value ?? []).map((x) => ({ fromFrontMm: x + frontSetbackMm, heightRef: f.heightRef, heightMm: f.heightMm.value, diameterMm: f.diameterMm.value, depthMm: f.depthMm.value, ref: pos!.ref }));
  return { slideId: s.id, nominalMm, holes, fastener: f.fastener, completeness: missing.length ? 'INCOMPLETE' : 'COMPLETE', missing };
}

export interface DrawerPassage {
  slideId: string;
  /** From the inner face of the open door to the box side; null — the width rule is not known. */
  boxClearanceMm: number | null;
  /** From the door to the nearest moving part of the runner: exact when the catalogue gives it, else the bound from 0 (no moving part in the side panel). */
  runnerClearanceMm: number;
  runnerClearanceExact: boolean;
  /** PASS — both clearances are not less than the margin; FAIL — a known one is less; UNKNOWN — the margin is not set (HOLD 159) or the runner is not known. */
  status: DrawerSlideCheckStatus;
  text: string;
}

/**
 * Passage of the drawer and its runner past the open door (MOD-DEC-159: a check of its own; 164: a documented Zero
 * protrusion hinge). `doorIntoOpeningMm` — how far the inner face of the open door reaches into the opening past the
 * plane of the side panel (negative — it stays outside: a Zero protrusion hinge ≈ −1 mm at 90°, data of the hinge
 * selection). `marginMm` — the margin; null while HOLD 159 holds, the clearances are given without a verdict.
 */
/** The margin of the passage: 0 behind a documented Zero protrusion hinge (MOD-DEC-361), else HOLD 159. */
export const passageMarginFor = (zeroProtrusion: boolean): number | null =>
  zeroProtrusion ? drawerSlideSelection.constants.zeroProtrusionPassageMarginMm.value : drawerSlideSelection.constants.passageMarginMm.value;

export function drawerPassage(s: DrawerSlide, boxSideThicknessMm: number, doorIntoOpeningMm: number, marginMm: number | null = drawerSlideSelection.constants.passageMarginMm.value): DrawerPassage {
  const w = s.boxWidth.value,
    gap = w ? (w.kind === 'OUTER' ? w.deductionMm / 2 : w.deductionMm / 2 - boxSideThicknessMm) : null,
    box = gap === null ? null : gap - doorIntoOpeningMm,
    exact = s.movingPartsFromSideMm.value !== null,
    runner = (s.movingPartsFromSideMm.value ?? 0) - doorIntoOpeningMm;
  let status: DrawerSlideCheckStatus;
  if (marginMm === null) status = 'UNKNOWN';
  else if ((box !== null && box < marginMm) || (exact && runner < marginMm)) status = 'FAIL';
  else status = box !== null && runner >= marginMm ? 'PASS' : 'UNKNOWN';
  const text = `${s.article}: до боковины ящика ${box === null ? '?' : fmt(box)} мм, до направляющей ${exact ? '' : 'не меньше '}${fmt(runner)} мм${marginMm === null ? '; запас не утверждён (HOLD 159)' : `; запас ${fmt(marginMm)} мм`}`;
  return { slideId: s.id, boxClearanceMm: box, runnerClearanceMm: runner, runnerClearanceExact: exact, status, text };
}
