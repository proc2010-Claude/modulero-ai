// Drawer systems (task «Сборные ящики», MOD-DEC-700, R2-007; FINDINGS 1872–1879): a kit for one drawer sold as one
// article — the runners with the metal sides, the holders of the back and the fixings of the front — that the
// furniture maker completes with a bottom and a back cut from board and with the facade, which is the front wall of
// the box (no inner front panel). Five manufacturers of 465; the series of each level of the hardware are the
// policy's, not the catalogue's (the levels of 466 for the runners alone are drawer-slide-selection.ts). Data are the
// manufacturers' as printed in the catalogues and the BAZIS libraries registered in docs/project/SOURCES.md, every
// value with the source file (its SHA-256 prefix) and the page or the library member; a value the source does not
// give is null with the reason (Handbook §5). Drilling is taken from the BAZIS kit of the same article first, then
// from the catalogue (MOD-DEC-277); no drilling of another article is substituted (MOD-DEC-205). The price is a field
// of the record of its article (MOD-DEC-536). The common format is types.ts.
//
// Heights are counted from one plane, as the BAZIS kits place the box: the underside of the runner, which is the
// bottom of the opening the drawer stands in at its lowest place. Widths are counted from the inner face of the side
// of the opening (LW — the width of the opening between the sides).
import type { CatalogPrice } from './prices.js';
import { refChecker, type CatalogDocument, type HardwareItem, type Known } from './types.js';

/** A row of holes in a board of the box or in the facade: across from each end, up from the underside of the runner. */
export interface DrawerSystemHoles {
  /** Axis of the holes from each end of the board (the back) or from the side of the opening (the facade), mm. */
  fromEndMm: Known<number>;
  /** Axes of the holes over the underside of the runner, ascending. */
  heightsMm: Known<number[]>;
  diameterMm: Known<number>;
  depthMm: Known<number>;
}

/** The bottom of the box: a board between the sides, from the plane of the box front to the back. */
export interface DrawerSystemBottom {
  thicknessMm: Known<number>;
  /** Width of the bottom is LW minus this. */
  widthDeductionMm: Known<number>;
  /** Length of the bottom is NL minus this. */
  lengthDeductionMm: Known<number>;
  /** Underside of the bottom over the underside of the runner. */
  undersideMm: Known<number>;
}

/** The back of the box: a board between the holders, behind the bottom (BOYARD, TANDEMBOX) or standing on it (LEGRABOX). */
export interface DrawerSystemBack {
  thicknessMm: Known<number>;
  /** Width of the back is LW minus this. */
  widthDeductionMm: Known<number>;
  heightMm: Known<number>;
  /** Lower edge of the back over the underside of the runner: the underside of the bottom, or its top when the back stands on it. */
  lowerEdgeMm: Known<number>;
  /** Rear face of the back from the plane of the box front (the inner face of the facade) is NL minus this. */
  rearDeductionMm: Known<number>;
  /** Screws of the holders in the rear face. */
  holes: DrawerSystemHoles;
}

/** One article of a length: its colour (the manufacturer's code) and its price. */
export interface DrawerSystemArticle {
  colour: string;
  article: string;
  /** Price of the kit for one drawer; absent — no price is recorded for this article. */
  price?: CatalogPrice;
}

/** One nominal length (NL) of a series. */
export interface DrawerSystemLength {
  nominalMm: number;
  articles: DrawerSystemArticle[];
  loadKg: Known<number>;
  /** Smallest inside depth of the carcass from the front edge of the side panel, for a facade overlaid on it. */
  minInsideDepthMm: Known<number>;
  /** Centres of the holes of the runner in the side panel from its front edge. */
  carcassHolesFromFrontMm: Known<number[]>;
}

export interface DrawerSystem extends HardwareItem {
  series: string;
  name: string;
  extension: 'FULL' | 'PARTIAL';
  softClose: Known<boolean>;
  pushToOpen: Known<boolean>;
  /** Push to open: the gap between the closed front and the carcass the mechanism needs; null — not a push system. */
  pushFrontGapMm: Known<number> | null;
  sideThicknessMm: Known<number>;
  sideHeightMm: Known<number>;
  /** Top of the sides over the underside of the runner. */
  boxHeightMm: Known<number>;
  /** Smallest height of the opening the drawer needs. */
  minOpeningHeightMm: Known<number>;
  bottom: DrawerSystemBottom;
  back: DrawerSystemBack;
  /** Screws of the front fixings in the inner face of the facade (`fromEndMm` — from the side of the opening). */
  frontHoles: DrawerSystemHoles;
  /** Holes of the runner in the side panel: height over the underside of the runner, the hole and the screw. */
  carcassFixing: { heightMm: Known<number>; diameterMm: Known<number>; depthMm: Known<number>; fastener: string };
  lengths: DrawerSystemLength[];
}

export interface DrawerSystemCatalog {
  systems: DrawerSystem[];
  /** Source files of SOURCES.md the catalogue was read from. */
  documents: CatalogDocument[];
}

const ascending = (xs: number[]) => xs.length > 0 && xs.every((x, i) => x > 0 && (i === 0 || x > xs[i - 1]!));

/** Structural problems of a catalogue: references, unknown values, sizes, lengths and holes. The test keeps the committed data clean. */
export function drawerSystemCatalogProblems(c: DrawerSystemCatalog): string[] {
  const { ref: refOk, known, problems: out } = refChecker(c.documents);
  const ids = new Set(c.systems.map((s) => s.id));
  if (ids.size !== c.systems.length) out.push('повтор id системы ящика');
  const articles = new Set<string>();
  const holes = (where: string, h: DrawerSystemHoles) => {
    for (const k of ['fromEndMm', 'heightsMm', 'diameterMm', 'depthMm'] as const) known(`${where}.${k}`, h[k]);
    if (h.heightsMm.value && !ascending(h.heightsMm.value)) out.push(`${where}.heightsMm: высоты не по возрастанию`);
  };
  for (const s of c.systems) {
    refOk(s.id, s.ref);
    for (const k of ['softClose', 'pushToOpen', 'sideThicknessMm', 'sideHeightMm', 'boxHeightMm', 'minOpeningHeightMm'] as const) known(`${s.id}.${k}`, s[k]);
    if (s.pushFrontGapMm) known(`${s.id}.pushFrontGapMm`, s.pushFrontGapMm);
    if (s.pushToOpen.value === true && !s.pushFrontGapMm) out.push(`${s.id}: у push to open нет зазора фасада`);
    if (s.pushToOpen.value === false && s.pushFrontGapMm) out.push(`${s.id}: зазор push to open у системы без push to open`);
    for (const k of ['thicknessMm', 'widthDeductionMm', 'lengthDeductionMm', 'undersideMm'] as const) known(`${s.id}.bottom.${k}`, s.bottom[k]);
    for (const k of ['thicknessMm', 'widthDeductionMm', 'heightMm', 'lowerEdgeMm', 'rearDeductionMm'] as const) known(`${s.id}.back.${k}`, s.back[k]);
    holes(`${s.id}.back.holes`, s.back.holes);
    holes(`${s.id}.frontHoles`, s.frontHoles);
    const f = s.carcassFixing;
    for (const k of ['heightMm', 'diameterMm', 'depthMm'] as const) known(`${s.id}.carcassFixing.${k}`, f[k]);
    if (!f.fastener.trim()) out.push(`${s.id}: крепёж к боковине не назван`);
    const top = s.boxHeightMm.value, open = s.minOpeningHeightMm.value;
    if (top !== null && open !== null && open < top) out.push(`${s.id}: наименьший проём ниже ящика`);
    const back = s.back.heightMm.value, lower = s.back.lowerEdgeMm.value, under = s.bottom.undersideMm.value;
    if (top !== null && back !== null && lower !== null && lower + back > top) out.push(`${s.id}: задняя стенка выше боковин`);
    if (lower !== null && under !== null && lower < under) out.push(`${s.id}: задняя стенка ниже дна`);
    if (!s.lengths.length) out.push(`${s.id}: нет длин`);
    const nls = s.lengths.map((l) => l.nominalMm);
    if (nls.some((x, i) => i > 0 && x <= nls[i - 1]!)) out.push(`${s.id}: длины не по возрастанию`);
    for (const l of s.lengths) {
      const where = `${s.id}.NL${l.nominalMm}`;
      known(`${where}.loadKg`, l.loadKg);
      known(`${where}.minInsideDepthMm`, l.minInsideDepthMm);
      known(`${where}.carcassHolesFromFrontMm`, l.carcassHolesFromFrontMm);
      if (!l.articles.length) out.push(`${where}: нет артикулов`);
      for (const a of l.articles) {
        if (articles.has(a.article)) out.push(`${where}: артикул ${a.article} повторяется`);
        articles.add(a.article);
        if (a.price && a.price.per !== 'kit') out.push(`${where}.${a.article}: цена системы — за комплект на ящик (kit)`);
      }
      const h = l.carcassHolesFromFrontMm.value;
      if (h && (!ascending(h) || h[h.length - 1]! >= l.nominalMm)) out.push(`${where}: отверстия не по возрастанию или за длиной направляющей`);
      if (l.minInsideDepthMm.value !== null && l.minInsideDepthMm.value < l.nominalMm) out.push(`${where}: наименьшая глубина меньше длины`);
    }
  }
  return out;
}
