// Drawer slide catalogue (task «Подбор направляющих ящиков»): runners of an inner drawer and of a drawer with a
// front, five manufacturers (BOYARD, Blum, Hettich, SAMET, GTV), with the box they take and the holes they need in
// the side panel. The default runner of each level of the hardware is the policy's (MOD-DEC-466,
// engine/policy/drawer-slide-selection.ts), not the catalogue's. Data are the manufacturers' as printed in the catalogues and the BAZIS libraries of the folder
// КАТАЛОГИ registered in docs/project/SOURCES.md, every value with the source file (its SHA-256 prefix) and the
// page or the library member; a value the source does not give is null with the reason, and the selection answers
// UNKNOWN (Handbook §5). Drilling is taken from the BAZIS kit of the same article first, then from the catalogue
// (MOD-DEC-277); no drilling of another article is substituted (MOD-DEC-205). Names follow the Handbook r8 terms:
// DrawerRunner (TERM-095), drawerRunnerSideClearanceMm (TERM-094), DrawerBox (TERM-089). The common format is
// types.ts, shared with the hinge and shelf support catalogues.
import { refChecker, type CatalogDocument, type CatalogRef, type HardwareItem, type Known, type RangeMm } from './types.js';

/** BALL_BEARING — a side-mounted ball runner in the gap between the side panel and the box; CONCEALED — under the box (скрытого монтажа). */
export type DrawerSlideKind = 'BALL_BEARING' | 'CONCEALED';

/** FULL — полное выдвижение; PARTIAL — неполное. */
export type DrawerSlideExtension = 'FULL' | 'PARTIAL';

/**
 * Width of the box the runner takes. OUTER — the outer width of the box is the opening minus `deductionMm` (a ball
 * runner: twice the gap it fills); INNER — the width between the inner faces of the box sides is the opening minus
 * `deductionMm` (a concealed runner: the box sides stand on the runner, their thickness is in the range of the series).
 */
export interface BoxWidthRule {
  kind: 'OUTER' | 'INNER';
  deductionMm: number;
}

/**
 * How the runner is fixed to the side panel. The height of the hole axis is counted from `heightRef`:
 * RUNNER_AXIS — the axis of a ball runner profile; BOX_BOTTOM_UNDERSIDE — the underside of the drawer bottom (a
 * concealed runner: the BAZIS kits place it so, the rear hook is 11 mm above it). `fastener` — the screw the source names.
 */
export interface CarcassFixing {
  heightRef: 'RUNNER_AXIS' | 'BOX_BOTTOM_UNDERSIDE';
  heightMm: Known<number>;
  diameterMm: Known<number>;
  depthMm: Known<number>;
  fastener: string;
}

/**
 * The box a concealed runner takes, as the BAZIS kit of the article builds it: the bottom of the board between the
 * sides and the back raised above the lower edge of the sides (the runner goes under the bottom, the sides cover it),
 * the holes of the rear hooks of the runner in the back and the overlay front as the front wall of the box.
 */
export interface ConcealedDrawerBox {
  /** The underside of the bottom and the lower edge of the back above the lower edge of the box sides. */
  bottomRecessMm: number;
  /** Thickness of the bottom: the board of the box, held by the clips of the runner screwed into it from below. */
  bottomThicknessMm: number;
  /** The holes of the rear hooks in the rear face of the back: from the inner face of each side, above the underside of the bottom. */
  rearHook: { diameterMm: number; depthMm: number; fromSideMm: number; aboveBottomMm: number };
  /** FACADE — no inner front: the overlay front closes the box and is joined to its sides and bottom. */
  frontWall: 'FACADE';
}

/** One nominal length (NL) of a series. */
export interface DrawerSlideLength {
  nominalMm: number;
  /** Article of this length (for a pair L/R — both); null — the source does not print it. */
  article: string | null;
  /**
   * The manufacturer's table of dimensions of this length by the letters of its drawing (DB4501: B, C, D — the
   * carcass holes, E, F, G, I — the holes in the box); null — a letter the table leaves empty. "Other furniture"
   * places its runner by it (home/mechanisms.ts runnerInfo); absent — the series has no such table in the catalogue.
   */
  dimensionsMm?: Record<string, number | null>;
  loadKg: Known<number>;
  /** Smallest inside depth of the carcass from the front edge of the side panel, for a drawer with a front flush with it. */
  minInsideDepthMm: Known<number>;
  /** Centres of the holes in the side panel from its front edge, the runner at the setback of the source. */
  carcassHolesFromFrontMm: Known<number[]>;
  /** Centres of the holes of the runner in the outer face of a box side from its front end (a ball runner with `runnerAxisAboveBoxMm`). */
  boxHolesFromFrontMm?: Known<number[]>;
  /**
   * Price of the set for one drawer (both runners) as the owner's catalogue gives it, not rounded; the line of the
   * estimate rounds it up to 10 ₽ (MOD-DEC-346). Absent — the price is not recorded for this series.
   */
  priceRub?: Known<number>;
}

export interface DrawerSlide extends HardwareItem {
  series: string;
  name: string;
  kind: DrawerSlideKind;
  extension: DrawerSlideExtension;
  softClose: Known<boolean>;
  pushToOpen: Known<boolean>;
  /** Height of the runner profile (a concealed runner: under the box). */
  profileHeightMm: Known<number>;
  /** Thickness of the box sides the runner takes. */
  boxSideThicknessMm: Known<RangeMm>;
  boxWidth: Known<BoxWidthRule>;
  /** Length of the box is NL minus this. */
  boxLengthDeductionMm: Known<number>;
  /** Smallest inner width of the box the manufacturer allows; null — the source sets none. */
  minBoxInnerWidthMm: Known<number> | null;
  /** Push to open: the gap between the closed front and the carcass the mechanism needs; null — not a push runner. */
  pushFrontGapMm: Known<number> | null;
  /**
   * Nearest moving part of the runner to the plane of the side panel (MOD-DEC-159/164: the passage of the drawer past
   * the open door). No source prints it: the value stays UNKNOWN, the passage check takes the bound 0 (no moving
   * part is inside the side panel) and the box side, whose position the width rule gives.
   */
  movingPartsFromSideMm: Known<number>;
  carcassFixing: CarcassFixing;
  /** The box of a concealed runner by its BAZIS kit; absent — the catalogue has no kit of the box. */
  concealedBox?: Known<ConcealedDrawerBox>;
  /**
   * A ball runner by its BAZIS kit (DB4501, FINDINGS 2746): its axis above the lower edge of the box sides — the holes
   * in the side panel and in the box sides lie on it; absent — the catalogue has no kit of the runner on a box.
   */
  runnerAxisAboveBoxMm?: Known<number>;
  lengths: DrawerSlideLength[];
}

export interface DrawerSlideCatalog {
  slides: DrawerSlide[];
  /** Source files of SOURCES.md the catalogue was read from. */
  documents: CatalogDocument[];
}


/** Structural problems of a catalogue: references, unknown values, lengths and holes. The test keeps the committed data clean. */
export function drawerSlideCatalogProblems(c: DrawerSlideCatalog): string[] {
  const { ref: refOk, known, problems: out } = refChecker(c.documents);
  const ids = new Set(c.slides.map((s) => s.id));
  if (ids.size !== c.slides.length) out.push('повтор id направляющей');
  for (const s of c.slides) {
    refOk(s.id, s.ref);
    for (const k of ['softClose', 'pushToOpen', 'profileHeightMm', 'boxSideThicknessMm', 'boxWidth', 'boxLengthDeductionMm', 'movingPartsFromSideMm'] as const) known(`${s.id}.${k}`, s[k]);
    if (s.minBoxInnerWidthMm) known(`${s.id}.minBoxInnerWidthMm`, s.minBoxInnerWidthMm);
    if (s.pushFrontGapMm) known(`${s.id}.pushFrontGapMm`, s.pushFrontGapMm);
    if (s.pushToOpen.value === true && !s.pushFrontGapMm) out.push(`${s.id}: у push to open нет зазора фасада`);
    if (s.pushToOpen.value === false && s.pushFrontGapMm) out.push(`${s.id}: зазор push to open у направляющей без push to open`);
    const f = s.carcassFixing;
    known(`${s.id}.carcassFixing.heightMm`, f.heightMm);
    known(`${s.id}.carcassFixing.diameterMm`, f.diameterMm);
    known(`${s.id}.carcassFixing.depthMm`, f.depthMm);
    if (!f.fastener.trim()) out.push(`${s.id}: крепёж к боковине не назван`);
    if ((s.kind === 'BALL_BEARING') !== (f.heightRef === 'RUNNER_AXIS')) out.push(`${s.id}: высота отверстий ${f.heightRef} у направляющей ${s.kind}`);
    if (s.concealedBox) {
      known(`${s.id}.concealedBox`, s.concealedBox);
      if (s.kind !== 'CONCEALED') out.push(`${s.id}: короб скрытой направляющей у направляющей ${s.kind}`);
    }
    if (s.runnerAxisAboveBoxMm) {
      known(`${s.id}.runnerAxisAboveBoxMm`, s.runnerAxisAboveBoxMm);
      if (s.kind !== 'BALL_BEARING') out.push(`${s.id}: ось шариковой направляющей у направляющей ${s.kind}`);
      if (s.lengths.some((l) => !l.boxHolesFromFrontMm)) out.push(`${s.id}: у набора нет отверстий направляющей в боковинах ящика`);
    }
    const w = s.boxWidth.value;
    if (w && (s.kind === 'BALL_BEARING') !== (w.kind === 'OUTER')) out.push(`${s.id}: правило ширины ${w.kind} у направляющей ${s.kind}`);
    if (!s.lengths.length) out.push(`${s.id}: нет длин`);
    const nls = s.lengths.map((l) => l.nominalMm);
    if (nls.some((x, i) => i > 0 && x <= nls[i - 1]!)) out.push(`${s.id}: длины не по возрастанию`);
    for (const l of s.lengths) {
      const where = `${s.id}.NL${l.nominalMm}`;
      known(`${where}.loadKg`, l.loadKg);
      known(`${where}.minInsideDepthMm`, l.minInsideDepthMm);
      known(`${where}.carcassHolesFromFrontMm`, l.carcassHolesFromFrontMm);
      if (l.priceRub) known(`${where}.priceRub`, l.priceRub);
      if (l.boxHolesFromFrontMm) known(`${where}.boxHolesFromFrontMm`, l.boxHolesFromFrontMm);
      if (l.priceRub?.value !== undefined && l.priceRub.value !== null && !(l.priceRub.value > 0)) out.push(`${where}.priceRub: нужно положительное число`);
      const h = l.carcassHolesFromFrontMm.value;
      if (h && (!h.length || h.some((x, i) => i > 0 && x <= h[i - 1]!) || h[h.length - 1]! >= l.nominalMm + 10)) out.push(`${where}: отверстия не по возрастанию или за длиной направляющей`);
      if (l.minInsideDepthMm.value !== null && l.minInsideDepthMm.value < l.nominalMm) out.push(`${where}: наименьшая глубина меньше длины`);
      for (const [k, v] of Object.entries(l.dimensionsMm ?? {})) if (v !== null && !(typeof v === 'number' && v > 0)) out.push(`${where}.dimensionsMm.${k}: нужно положительное число или null`);
    }
  }
  return out;
}

export type { CatalogRef };
