// Catalogue of the worktops of the kitchen (task MOD-AI-15, FINDINGS 2763–2765): a sheet of a thickness and a size in a
// decor, with the price of the sheet. The data lie in catalogs/materials/worktops.json, in the release of the catalogue
// beside the hardware (catalogs/RELEASE.json), outside the core (CAT-1). The format is agreed with the kitchen, which
// reads it: `defaultId` is the worktop of a kitchen that names none, its price is the project's average of a 38 mm
// sheet (the WORKTOP_38 rate of kitchen-price, MOD-DEC-569), so the price of an older kitchen does not change. The
// colour of a decor the catalogue of decors does not hold is a hex of the row: without it 3D draws the worktop grey.
import { catalogPriceProblems, type CatalogPrice } from './prices.js';
import { refChecker, type CatalogDocument } from './types.js';

/** The thicknesses of a worktop, mm. */
export type WorktopThicknessMm = 26 | 38;
const THICKNESSES: readonly number[] = [26, 38];

export interface Worktop {
  id: string;
  /** The maker; null — a worktop without a maker (the project's average). */
  brand: string | null;
  /** The maker's code of the decor; null — no decor. */
  code: string | null;
  name: string;
  /** A decor of catalogs/materials/decors.json, or null. */
  decorId: string | null;
  /** The colour for 3D, #rrggbb, of a decor the catalogue of decors does not hold; null — the decor's, or grey. */
  colorHex: string | null;
  /** Where the colour comes from. */
  colorBasis?: string;
  thicknessMm: WorktopThicknessMm;
  /** The size of the sheet sold: its length and depth, mm. */
  sheet: { lengthMm: number; depthMm: number };
  /** The price of one sheet (`per: 'sheet'`). */
  price: CatalogPrice;
}

export interface WorktopCatalog {
  version: string;
  /** The worktop of a kitchen that names none. */
  defaultId: string;
  documents: CatalogDocument[];
  worktops: Worktop[];
}

/** A worktop of the catalogue by id. */
export const worktopOf = (c: WorktopCatalog, id: unknown): Worktop | undefined => c.worktops.find((w) => w.id === id);

/**
 * Only what the kitchen needs (MOD-DEC-349): ids without repeats, the worktop by default among them, a known thickness,
 * a sheet of a positive size, a price of a sheet in the format of 536, a decor of the catalogue of decors or a colour.
 */
export function worktopCatalogProblems(c: WorktopCatalog, decorIds: ReadonlySet<string>): string[] {
  const { problems: out } = refChecker(c.documents);
  if (new Set(c.worktops.map((w) => w.id)).size !== c.worktops.length) out.push('повтор id столешницы');
  if (!c.worktops.some((w) => w.id === c.defaultId)) out.push(`нет столешницы по умолчанию ${c.defaultId}`);
  for (const w of c.worktops) {
    if (!w.id.trim() || !w.name.trim()) out.push(`столешница без id или названия: ${w.id}`);
    if (!THICKNESSES.includes(w.thicknessMm)) out.push(`${w.id}: толщина ${w.thicknessMm} — только 26 или 38 мм`);
    if (!(w.sheet?.lengthMm > 0 && w.sheet?.depthMm > 0)) out.push(`${w.id}: размер листа — положительные длина и глубина`);
    if (w.decorId !== null && !decorIds.has(w.decorId)) out.push(`${w.id}: декора ${w.decorId} нет в каталоге декоров`);
    if (w.colorHex !== null && !/^#[0-9a-f]{6}$/i.test(w.colorHex)) out.push(`${w.id}: цвет — #rrggbb`);
    if (w.decorId !== null && w.colorHex !== null) out.push(`${w.id}: цвет задаётся декором или hex, не обоими`);
    out.push(...catalogPriceProblems(w.id, w.price));
    if (w.price && w.price.per !== 'sheet') out.push(`${w.id}.price.per: цена столешницы — за лист`);
  }
  return out;
}
