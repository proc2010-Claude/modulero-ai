// Purchased items of a hardware list (task CAT-4): the articles a generator writes into its list of hardware where
// the family has no selection of its own yet — the carcass fasteners, floor pads, screws, the tip-over restraint, wall
// anchors and the knob of "other furniture", its hinge kit H301A02 with H0910 and its runner pair. They were written in
// the code of home/outputs.ts and engine/policy/home.ts (FINDINGS 292). The policy names the item to take (which
// position — a decision or the prototype); the item gives the order code, the line of the list and, where a generator
// needs them, its dimensions. The data lie in catalogs/hardware/articles.json, outside the core. MOD-DEC-536 (FINDINGS
// 990): an item holds its price, and the kits of the catalogue — their parts and the price of the kit — lie here too.
import type { ArticleQuantity, CatalogPrice } from './prices.js';
import { refChecker, type CatalogDocument, type CatalogRef } from './types.js';

export type ArticleFamily =
  | 'FASTENER'
  | 'SCREW'
  | 'FLOOR_PAD'
  | 'SHELF_SUPPORT'
  | 'HINGE'
  | 'HINGE_PLATE'
  | 'HINGE_CAP'
  | 'DRAWER_SLIDE'
  | 'LIFT'
  | 'HANGER'
  | 'LEG'
  | 'PLINTH'
  | 'PROFILE'
  | 'RESTRAINT'
  | 'ANCHOR'
  | 'HANDLE'
  | 'ROD'
  | 'FILLING';

const FAMILIES: readonly ArticleFamily[] = ['FASTENER', 'SCREW', 'FLOOR_PAD', 'SHELF_SUPPORT', 'HINGE', 'HINGE_PLATE', 'HINGE_CAP', 'DRAWER_SLIDE', 'LIFT', 'HANGER', 'LEG', 'PLINTH', 'PROFILE', 'RESTRAINT', 'ANCHOR', 'HANDLE', 'ROD', 'FILLING'];

export interface ArticleItem {
  id: string;
  family: ArticleFamily;
  brand: string | null;
  /** Order code; null — not known, the list shows UNKNOWN (or the code of the length, for a runner pair). */
  article: string | null;
  /** The line of the hardware list. */
  name: string;
  /** Article of the mounting plate a hinge kit includes. */
  includedPlate?: string;
  /** Dimensions a generator takes from the item; the unit is in the name (`cupDiameterMm`). */
  dimensions?: Record<string, number>;
  /** The price of the item (MOD-DEC-536); absent — the item is not priced by the catalogue. */
  price?: CatalogPrice;
  ref?: CatalogRef | null;
}

/**
 * A kit of the catalogue (MOD-DEC-536): its parts as articles of their makers. With a price of its own the kit covers
 * the same parts of a position of the estimate; without one it costs the sum of its parts.
 */
export interface HardwareKit {
  id: string;
  /** The maker the kit is ordered from; null — no maker is named. */
  brand: string | null;
  /** The order code of the kit; null — it has none of its own. */
  article: string | null;
  name: string;
  components: ArticleQuantity[];
  price?: CatalogPrice;
}

export interface ArticleCatalog {
  items: ArticleItem[];
  /** Kits of the catalogue (MOD-DEC-536). */
  kits?: HardwareKit[];
  documents: CatalogDocument[];
}

/** Only what the engine needs (MOD-DEC-349): ids do not repeat, the family is known, the line is named, dimensions are positive numbers. */
export function articleCatalogProblems(c: ArticleCatalog): string[] {
  const { ref: refOk, problems: out } = refChecker(c.documents);
  const ids = new Set(c.items.map((x) => x.id));
  if (ids.size !== c.items.length) out.push('повтор id покупной позиции');
  for (const x of c.items) {
    if (!x.id.trim()) out.push('покупная позиция без id');
    if (!FAMILIES.includes(x.family)) out.push(`${x.id}: неизвестный вид ${x.family}`);
    if (!x.name.trim()) out.push(`${x.id}: нет наименования`);
    if (x.article !== null && (typeof x.article !== 'string' || !x.article.trim())) out.push(`${x.id}: артикул — строка или null`);
    for (const [k, v] of Object.entries(x.dimensions ?? {})) if (!(typeof v === 'number' && v > 0)) out.push(`${x.id}.dimensions.${k}: нужно положительное число`);
    refOk(x.id, x.ref);
  }
  const kits = c.kits ?? [];
  if (new Set([...ids, ...kits.map((k) => k.id)]).size !== ids.size + kits.length) out.push('повтор id комплекта');
  for (const k of kits) {
    if (!k.name.trim()) out.push(`${k.id}: нет наименования комплекта`);
    if (!k.components.length) out.push(`${k.id}: у комплекта нет состава`);
  }
  return out;
}

/** The item the policy names; a missing one is a refusal with its id (the catalogue check 6 keeps them present). */
export function articleItem(c: ArticleCatalog, id: string): ArticleItem {
  const x = c.items.find((i) => i.id === id);
  if (!x) throw new Error(`В каталоге фурнитуры нет позиции ${id}`);
  return x;
}

/** A dimension of an item the generator cannot do without. */
export function articleDimension(x: ArticleItem, key: string): number {
  const v = x.dimensions?.[key];
  if (v === undefined) throw new Error(`У позиции ${x.id} в каталоге фурнитуры нет размера ${key}`);
  return v;
}
