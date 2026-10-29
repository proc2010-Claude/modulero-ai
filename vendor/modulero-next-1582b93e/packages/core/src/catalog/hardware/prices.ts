// Prices of the hardware catalogue (MOD-DEC-536, FINDINGS 990–999). The core keeps no price of the hardware: a price
// is a field of the record of its article in the catalogue (catalogs/hardware), with its unit, date, source and status,
// and the estimate reads it from the release the generator got as an argument. A kit is a record of its own with its
// composition («бренд:артикул × n»): with a price of its own it covers the same set of articles of a position (the
// rule of 536, any hardware — a hinge with its plate, the body of an eccentric with its stem, the parts of a shelf
// support); without one its price is the sum of its parts. A number nobody has given yet — the prototype's, or a
// shop's price of a like article — is a TEMPORARY price of the catalogue: the editor lists it under the bell until the
// maker or the seller sets it (MOD-DEC-264). The older families keep the price of a record as `priceRub` (Known) of
// their own; it is read as a confirmed price until the records get the format of 536 with the roles (stage 3).
import type { HardwareCatalogs } from './release.js';
import type { Known } from './types.js';

/** What one price is for: a piece, a kit, a sheet, a metre, a square metre, an order, an operation. */
export type PricePer = 'pcs' | 'kit' | 'sheet' | 'm' | 'm²' | 'order' | 'op';
const PER: readonly PricePer[] = ['pcs', 'kit', 'sheet', 'm', 'm²', 'order', 'op'];

/** Where a price was read: a source of the catalogue, a page of a site, a price list or an owner decision. */
export interface PriceSource {
  doc: string;
  page?: string;
  url?: string;
  sha256?: string;
}

/**
 * Why a temporary price is what it is: PROTOTYPE — the prototype's number; ANALOGUE — the price of a like article;
 * RATE — a rate of the maker's card. The text follows the kind: `ANALOGUE: Рондо…: аналог «…», 0,85 ₽`.
 */
export type PriceBasisKind = 'PROTOTYPE' | 'ANALOGUE' | 'RATE';
const BASIS = /^(PROTOTYPE|ANALOGUE|RATE): (.+)$/su;

/**
 * The price of a record of the catalogue (MOD-DEC-536). CONFIRMED — the price of this article read in its source (a
 * price list, a shop, the owner); TEMPORARY — no such price yet: the prototype's number or a like article's
 * (`basis` says which). The estimate rounds a line of hardware up to 10 ₽ as a guide (MOD-DEC-346).
 */
export interface CatalogPrice {
  rub: number;
  per: PricePer;
  /** The day the price was read or set, YYYY-MM-DD. */
  date: string;
  source: PriceSource;
  status: 'CONFIRMED' | 'TEMPORARY';
  /** Required for TEMPORARY: «KIND: text»; for CONFIRMED — what was read, optional. */
  basis?: string;
}

/** A part of a kit or of a position of the estimate: an article of a maker and how many. */
export interface ArticleQuantity {
  /** null — no maker is named (a part of the project's specification): the article alone finds the record. */
  brand: string | null;
  article: string;
  qty: number;
}

/** A price as the estimate takes it: the number, its unit, whether it is temporary, and the text that says why. */
export interface ResolvedPrice {
  rub: number;
  per: PricePer;
  temporary: boolean;
  kind: PriceBasisKind | null;
  /** What the price is: the source and the article, the analogue, the prototype — without the kind. */
  basis: string;
  /** The record of the catalogue the price is from. */
  recordId: string;
  /** The source of the price (`MOD-DEC-293` — an owner decision); empty — the sum of the parts of a kit. */
  sourceDoc: string;
}

/** A record of the catalogue that has a price: an article of a family, or a kit with its parts. */
export interface PricedRecord {
  id: string;
  name: string;
  brand: string | null;
  /** The order code; null — a kit or an item without its own code (found by its id). */
  article: string | null;
  /** null — a kit without a price of its own: the sum of its parts. */
  price: CatalogPrice | null;
  components?: ArticleQuantity[];
  /** The price is the `priceRub` of an older family: its own checker checks it. */
  legacy?: boolean;
}

/** The text of the basis of a price without its kind. */
export function priceBasisText(p: CatalogPrice): string {
  const m = p.basis ? BASIS.exec(p.basis) : null;
  return m ? m[2]! : (p.basis ?? [p.source.doc, p.source.page].filter(Boolean).join(', '));
}

/** A price of an older family (`priceRub`, Known): the price the record was read with, or null. */
export function knownPrice(k: Known<number> | undefined, per: PricePer): CatalogPrice | null {
  if (!k || k.value === null) return null;
  return { rub: k.value, per, date: '', source: { doc: k.ref?.doc ?? '', page: k.ref?.page, sha256: k.ref?.sha256 }, status: 'CONFIRMED', basis: [k.ref?.doc, k.ref?.page].filter(Boolean).join(', ') };
}

/** Problems of one price: a positive number, a known unit, a date, a source and the basis of a temporary price. */
export function catalogPriceProblems(where: string, p: CatalogPrice | null | undefined): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (!(typeof p.rub === 'number' && p.rub > 0)) out.push(`${where}.price.rub: нужно положительное число`);
  if (!PER.includes(p.per)) out.push(`${where}.price.per: неизвестная единица ${p.per}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) out.push(`${where}.price.date: нужна дата YYYY-MM-DD`);
  if (!p.source?.doc?.trim()) out.push(`${where}.price.source: нет документа`);
  if (p.status !== 'CONFIRMED' && p.status !== 'TEMPORARY') out.push(`${where}.price.status: ${p.status}`);
  if (p.status === 'TEMPORARY' && !BASIS.test(p.basis ?? '')) out.push(`${where}.price.basis: у временной цены нужно «PROTOTYPE: …», «ANALOGUE: …» или «RATE: …»`);
  return out;
}

const key = (brand: string | null | undefined, article: string) => `${(brand ?? '').toLowerCase()}:${article.toLowerCase()}`;

/** Every record of a release that has a price or is a kit: the articles of every family and the kits. */
export function pricedRecords(hw: HardwareCatalogs): PricedRecord[] {
  const out: PricedRecord[] = [],
    add = (r: PricedRecord) => {
      if (r.price || r.components) out.push(r);
    },
    // A record of 536 (`price`), else the `priceRub` of an older family.
    either = (price: CatalogPrice | undefined, old: Known<number> | undefined, per: PricePer) => (price ? { price } : { price: knownPrice(old, per), legacy: true });
  for (const h of hw.hinges.hinges) add({ id: h.id, name: h.id, brand: h.brand, article: h.article, ...either(h.price, h.priceRub, 'pcs') });
  for (const p of hw.hinges.plates) add({ id: p.id, name: p.id, brand: p.brand, article: p.article, ...either(p.price, p.priceRub, 'pcs') });
  for (const k of hw.hinges.kits)
    if (k.price) {
      const h = hw.hinges.hinges.find((x) => x.id === k.hingeId),
        p = hw.hinges.plates.find((x) => x.id === k.plateId);
      if (h && p) add({ id: `${k.hingeId}+${k.plateId}`, name: `${h.brand} ${h.article} + ${p.article}`, brand: h.brand, article: null, price: k.price, components: [{ brand: h.brand, article: h.article, qty: 1 }, { brand: p.brand, article: p.article, qty: 1 }] });
    }
  for (const s of hw.drawerSlides.slides) for (const l of s.lengths) if (l.article) add({ id: `${s.id}/${l.nominalMm}`, name: s.name, brand: s.brand, article: l.article, ...either(undefined, l.priceRub, 'kit') });
  // A drawer system (FINDINGS 1872): each colour of a length is an article of its own, priced as a kit for one drawer.
  for (const s of hw.drawerSystems.systems) for (const l of s.lengths) for (const a of l.articles) add({ id: `${s.id}/${l.nominalMm}/${a.colour}`, name: s.name, brand: s.brand, article: a.article, price: a.price ?? null });
  for (const x of hw.lifts.lifts) for (const a of x.articles) add({ id: `${x.id}/${a.article}`, name: x.name, brand: x.brand, article: a.article, ...either(undefined, a.priceRub, 'kit') });
  for (const s of hw.shelfSupports.supports) for (const p of s.parts) add({ id: `${s.id}/${p.article}`, name: s.name, brand: s.brand, article: p.article, ...either(undefined, p.priceRub, 'pcs') });
  // The fittings of the wardrobe (task FIT, MOD-DEC-480, 483, 484): a length of a rod series, its holder, a leg, a
  // handle, a clip of the plinth, a push latch, a light and its power supply, a caster and a lock of the other furniture
  // (FINDINGS 2766–2768), each colour of a basket, a trouser rack and a pantograph.
  for (const r of hw.fittings.rods) {
    for (const x of r.stock) add({ id: `${r.id}/${x.article}`, name: r.name, brand: r.brand, article: x.article, price: x.price ?? null });
    add({ id: `${r.id}/holder`, name: r.holder.name, brand: r.holder.brand, article: r.holder.article, price: r.holder.price ?? null });
  }
  for (const x of [...hw.fittings.legs, ...hw.fittings.handles, ...hw.fittings.plinthClips, ...hw.fittings.pushLatches, ...hw.fittings.lights, ...hw.fittings.powerSupplies, ...hw.fittings.lightDistributors, ...hw.fittings.mainsCords, ...hw.fittings.casters, ...hw.fittings.locks]) add({ id: x.id, name: x.name, brand: x.brand, article: x.article, price: x.price ?? null });
  for (const x of hw.fittings.storage) for (const v of x.variants) add({ id: `${x.id}/${v.colour}`, name: v.name, brand: x.brand, article: v.article, price: v.price ?? null });
  // The hangers of the wall cabinets (FINDINGS 2750): each hanger or kit and the plate or rail of the wall; a rail two
  // hangers of a maker share is one record.
  const hangerParts = new Set<string>();
  for (const x of hw.fittings.hangers)
    for (const p of [...x.parts, x.wall.part])
      if (!hangerParts.has(key(p.brand, p.article))) {
        hangerParts.add(key(p.brand, p.article));
        add({ id: `${x.id}/${p.article}`, name: p.name, brand: p.brand, article: p.article, price: p.price ?? null });
      }
  for (const x of hw.articles.items) add({ id: x.id, name: x.name, brand: x.brand, article: x.article, price: x.price ?? null });
  for (const k of hw.articles.kits ?? []) add({ id: k.id, name: k.name, brand: k.brand, article: k.article, price: k.price ?? null, components: k.components });
  return out;
}

/**
 * The price lookup of a release: by the maker and the article, or by the id of a record. An article is found by its
 * maker; a record without a maker serves any maker (a confirmat of the project's specification); a position without
 * a maker takes the one record of that article. A kit without a price of its own costs the sum of its parts.
 */
export function catalogPrices(hw: HardwareCatalogs) {
  const records = pricedRecords(hw),
    byKey = new Map<string, PricedRecord>(),
    byArticle = new Map<string, PricedRecord[]>(),
    byId = new Map(records.map((r) => [r.id, r]));
  for (const r of records)
    if (r.article !== null) {
      const k = key(r.brand, r.article);
      if (!byKey.has(k)) byKey.set(k, r);
      byArticle.set(r.article.toLowerCase(), [...(byArticle.get(r.article.toLowerCase()) ?? []), r]);
    }
  const find = (brand: string | null, article: string): PricedRecord | null => {
    const exact = byKey.get(key(brand, article)) ?? (brand ? byKey.get(key(null, article)) : undefined);
    if (exact) return exact;
    const all = brand ? [] : (byArticle.get(article.toLowerCase()) ?? []);
    return all.length === 1 ? all[0]! : null;
  };
  const resolve = (r: PricedRecord, seen: string[] = []): ResolvedPrice | null => {
    if (r.price) {
      const m = r.price.basis ? BASIS.exec(r.price.basis) : null;
      return { rub: r.price.rub, per: r.price.per, temporary: r.price.status === 'TEMPORARY', kind: (m?.[1] as PriceBasisKind | undefined) ?? null, basis: priceBasisText(r.price), recordId: r.id, sourceDoc: r.price.source.doc };
    }
    if (!r.components?.length || seen.includes(r.id)) return null;
    const parts = r.components.map((c) => {
      const x = find(c.brand, c.article);
      return { c, p: x ? resolve(x, [...seen, r.id]) : null };
    });
    if (parts.some((x) => !x.p)) return null;
    const temporary = parts.some((x) => x.p!.temporary),
      rub = Math.round(parts.reduce((n, x) => n + x.p!.rub * x.c.qty, 0) * 100) / 100;
    return {
      rub,
      per: 'kit',
      temporary,
      kind: temporary ? 'ANALOGUE' : null,
      basis: `комплект ${r.name}: ${parts.map((x) => `${[x.c.brand, x.c.article].filter(Boolean).join(' ')} × ${x.c.qty} — ${x.p!.rub} ₽${x.p!.temporary ? ' (' + x.p!.basis + ')' : ''}`).join('; ')}`,
      recordId: r.id,
      sourceDoc: '',
    };
  };
  // A part and an article are the same when they find the same record (a part of the project's specification names
  // no maker); an article the catalogue does not know is its maker and code.
  const id = (x: { brand: string | null; article: string }) => find(x.brand, x.article)?.id ?? key(x.brand, x.article);
  return {
    records,
    /** What an article is for the kits: the record it finds, else its maker and code. */
    identity: id,
    /** The price of an article of a maker, or null. */
    article(brand: string | null, article: string): ResolvedPrice | null {
      const r = find(brand, article);
      return r ? resolve(r) : null;
    },
    /** The price of a record by its id (an item without an order code, a kit), or null. */
    record(id: string): ResolvedPrice | null {
      const r = byId.get(id);
      return r ? resolve(r) : null;
    },
    /**
     * The kits of the catalogue in a set of articles (MOD-DEC-536): a kit with a price of its own covers its parts
     * as many times as the set holds all of them; the larger kits first, then by id. The rest is priced article by
     * article.
     */
    cover(items: readonly ArticleQuantity[]): { kits: { record: PricedRecord; times: number; price: ResolvedPrice }[]; rest: ArticleQuantity[] } {
      const have = new Map<string, ArticleQuantity>();
      for (const x of items) {
        const k = id(x),
          h = have.get(k);
        if (h) h.qty += x.qty;
        else have.set(k, { ...x });
      }
      const kits = records
          .filter((r) => r.price && r.components?.length)
          .sort((a, b) => b.components!.reduce((n, c) => n + c.qty, 0) - a.components!.reduce((n, c) => n + c.qty, 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
        out: { record: PricedRecord; times: number; price: ResolvedPrice }[] = [];
      for (const r of kits) {
        const times = Math.min(...r.components!.map((c) => Math.floor((have.get(id(c))?.qty ?? 0) / c.qty)));
        if (!(times > 0)) continue;
        for (const c of r.components!) have.get(id(c))!.qty -= c.qty * times;
        out.push({ record: r, times, price: resolve(r)! });
      }
      return { kits: out, rest: [...have.values()].filter((x) => x.qty > 0) };
    },
  };
}

export type CatalogPrices = ReturnType<typeof catalogPrices>;

/**
 * Problems of the prices of a release: each price in its format, one priced record per maker and article, the parts
 * of a kit found in the catalogue and priced (a kit without a price of its own costs the sum of them).
 */
export function catalogPriceRecordProblems(hw: HardwareCatalogs): string[] {
  const out: string[] = [],
    prices = catalogPrices(hw),
    seen = new Map<string, string>();
  for (const r of prices.records) {
    if (!r.legacy) out.push(...catalogPriceProblems(r.id, r.price));
    if (r.article !== null && r.price) {
      const k = key(r.brand, r.article),
        other = seen.get(k);
      if (other) out.push(`${r.id}: у ${r.brand ?? ''}:${r.article} уже есть цена в ${other}`);
      else seen.set(k, r.id);
    }
    for (const c of r.components ?? []) {
      if (!(c.qty > 0)) out.push(`${r.id}: количество ${c.article} — положительное число`);
      if (!prices.article(c.brand, c.article)) out.push(`${r.id}: у части ${[c.brand, c.article].filter(Boolean).join(':')} нет цены в каталоге`);
    }
  }
  return out;
}
