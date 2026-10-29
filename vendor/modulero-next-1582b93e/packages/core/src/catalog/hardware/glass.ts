// The common catalogue of glass and mirror (FINDINGS 3400–3404): the kinds of glass a facade is made of or holds — an
// insert of a sliding door, a leaf of glass on hinges for glass, an insert of a framed facade. The data lie in
// catalogs/materials/glass.json, in the release of the catalogue beside the hardware (catalogs/RELEASE.json), outside
// the core (CAT-1): a kind, a thickness, a price or an operation is added there, without a change of the code. A record
// gives the thickness, the mass per m² (the mass of a leaf, 334, 355), the price per m² in the format of the prices of
// the catalogue (536: unit, date, source, status), the operations of the glass shop and the largest piece. A price the
// catalogue does not give is «Цена не определена» (247), a limit not known checks nothing (349). The records keep the
// ids their consumers use now (the inserts of the sliding doors, the show-case of the kitchen), so that a consumer
// moves to the catalogue without a change of its projects.
import { catalogPriceProblems, type CatalogPrice } from './prices.js';
import { refChecker, type CatalogDocument, type Known } from './types.js';

/**
 * The kind of a glass: CLEAR — float glass, LOW_IRON — low-iron (осветлённое), TINTED — tinted in the mass (bronze,
 * graphite), SATIN — matted (сатинат), LACQUERED — painted on the back (лакобель, a colour code), MIRROR — a silvered
 * mirror, PRINT — a print on the back.
 */
export type GlassKind = 'CLEAR' | 'LOW_IRON' | 'TINTED' | 'SATIN' | 'LACQUERED' | 'MIRROR' | 'PRINT';

export const GLASS_KINDS: readonly GlassKind[] = ['CLEAR', 'LOW_IRON', 'TINTED', 'SATIN', 'LACQUERED', 'MIRROR', 'PRINT'];

/**
 * Where a glass may stand: SLIDING_INSERT — an insert of the leaf of a sliding door; HINGED_DOOR — a leaf of glass on
 * hinges for glass (a show-case of the kitchen, a glass door of other furniture); FRAME_INSERT — an insert of a framed
 * facade of MDF, wood or aluminium.
 */
export type GlassUse = 'SLIDING_INSERT' | 'HINGED_DOOR' | 'FRAME_INSERT';

export const GLASS_USES: readonly GlassUse[] = ['SLIDING_INSERT', 'HINGED_DOOR', 'FRAME_INSERT'];

/** What one price of an operation is for: a metre of the edge, an operation (a hole), a square metre (a film). */
export type GlassOperationPer = 'm' | 'op' | 'm²';

const OPERATION_PER: readonly GlassOperationPer[] = ['m', 'op', 'm²'];

/** An operation of the glass shop on a piece: a polished edge, a hole, a safety film, tempering. */
export interface GlassOperation {
  id: string;
  title: string;
  per: GlassOperationPer;
  /** null — not known: the operation is «Цена не определена» (247), not free. */
  price: CatalogPrice | null;
  /** The smallest piece the shop does it on (a film is not put on a small pane); absent — any. */
  minSizeMm?: Known<{ heightMm: number; widthMm: number }>;
}

/** A kind of glass or mirror of one thickness. */
export interface GlassType {
  id: string;
  title: string;
  kind: GlassKind;
  thicknessMm: number;
  /** The colour code of a lacquered or tinted glass (RAL 9003, «бронза»); null — none. */
  colour: string | null;
  /** Tempered glass; null — not known. */
  tempered: boolean | null;
  /**
   * kg per m² of the piece (MOD-DEC-751): of the maker's own source where there is one (CONFIRMED, the table of ARISTO for
   * the inserts of 4 mm); else 2500 kg/m³ × the thickness, DERIVED.
   */
  massKgPerM2: Known<number>;
  /** Price per m² of the piece; null — not known (247). */
  price: CatalogPrice | null;
  uses: GlassUse[];
  /** The operations the shop does on a piece of this glass; absent — none listed. */
  operations?: GlassOperation[];
  /** The largest piece: the height and the width, mm; absent — not known, nothing is checked. */
  maxSizeMm?: Known<{ heightMm: number; widthMm: number }>;
}

export interface GlassCatalog {
  version: string;
  /** Where the records come from, in words. */
  note?: string;
  documents: CatalogDocument[];
  glass: GlassType[];
}

/** A glass of the catalogue by its id, or undefined. */
export function glassOf(c: GlassCatalog, id: string): GlassType | undefined {
  return c.glass.find((g) => g.id === id);
}

/** The mass of a piece w × h mm, kg: kg per m² × area, to the gram; null — the mass per m² is not known. */
export function glassMassKg(g: GlassType, widthMm: number, heightMm: number): number | null {
  const m = g.massKgPerM2.value;
  return m === null ? null : Math.round(m * ((widthMm * heightMm) / 1e6) * 1000) / 1000;
}

/** What is wrong with a piece w × h of a glass for its largest size: sentences for a warning or a refusal; [] — none. */
export function glassSizeProblems(g: GlassType, widthMm: number, heightMm: number): string[] {
  const max = g.maxSizeMm?.value;
  if (!max) return [];
  return [
    ...(heightMm > max.heightMm ? [`Высота стекла ${heightMm} мм больше наибольшей ${max.heightMm} мм для «${g.title}»`] : []),
    ...(widthMm > max.widthMm ? [`Ширина стекла ${widthMm} мм больше наибольшей ${max.widthMm} мм для «${g.title}»`] : []),
  ];
}

/**
 * Problems of the catalogue of glass: ids without repeats, a known kind and use, a positive thickness and mass, a price
 * per m² in the format of 536, operations with a unit and a price of that unit, positive sizes. Only what the engine
 * needs (MOD-DEC-349).
 */
export function glassCatalogProblems(c: GlassCatalog): string[] {
  const check = refChecker(c.documents),
    out = check.problems,
    ids = new Set<string>();
  const size = (where: string, k: Known<{ heightMm: number; widthMm: number }> | undefined) => {
    if (!k) return;
    check.known(where, k);
    if (k.value && !(k.value.heightMm > 0 && k.value.widthMm > 0)) out.push(`${where}: высота и ширина — положительные числа`);
  };
  if (!/^\S+$/.test(String(c.version ?? ''))) out.push('нет версии каталога');
  if (!c.glass.length) out.push('нет ни одного вида стекла');
  for (const g of c.glass) {
    const at = g.id || '(без id)';
    if (!g.id || ids.has(g.id)) out.push(`${at}: повтор или пустой id`);
    ids.add(g.id);
    if (!g.title?.trim()) out.push(`${at}: нет названия`);
    if (!GLASS_KINDS.includes(g.kind)) out.push(`${at}: неизвестный вид ${g.kind}`);
    if (!(g.thicknessMm > 0)) out.push(`${at}.thicknessMm: положительное число`);
    check.known(`${at}.massKgPerM2`, g.massKgPerM2);
    if (g.massKgPerM2.value !== null && !(g.massKgPerM2.value > 0)) out.push(`${at}.massKgPerM2: положительное число`);
    out.push(...catalogPriceProblems(at, g.price));
    if (g.price && g.price.per !== 'm²') out.push(`${at}.price.per: цена стекла — за м²`);
    if (!g.uses?.length || new Set(g.uses).size !== g.uses.length || g.uses.some((u) => !GLASS_USES.includes(u))) out.push(`${at}.uses: назначения из ${GLASS_USES.join(', ')} без повторов`);
    size(`${at}.maxSizeMm`, g.maxSizeMm);
    const ops = new Set<string>();
    for (const o of g.operations ?? []) {
      const w = `${at}.operations.${o.id || '(без id)'}`;
      if (!o.id || ops.has(o.id)) out.push(`${w}: повтор или пустой id операции`);
      ops.add(o.id);
      if (!o.title?.trim()) out.push(`${w}: нет названия`);
      if (!OPERATION_PER.includes(o.per)) out.push(`${w}.per: неизвестная единица ${o.per}`);
      out.push(...catalogPriceProblems(w, o.price));
      if (o.price && o.price.per !== o.per) out.push(`${w}.price.per: единица цены — ${o.per}`);
      size(`${w}.minSizeMm`, o.minSizeMm);
    }
  }
  return out;
}
