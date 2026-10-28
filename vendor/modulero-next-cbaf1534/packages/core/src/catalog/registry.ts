// The register of positions of the hardware catalogue (task CAT-A, MOD-DEC-702, docs/CATALOG_REGISTRY.md). The folder
// КАТАЛОГИ of the owner holds the same hinge as models in seven formats, as models of BAZIS libraries, as rows of
// tables and as cards of a database; the register holds it once: one position for a maker and an article. The key is
// the maker and the normalised article (`BOYARD:H316A02`); spellings of the same article and the codes of sellers are
// aliases of the position, files and prices are links of it, not positions of their own. The data of the engine stay
// in catalogs/hardware by family (HARDWARE_CATALOGS.md): a position names its record there (`engine`), and only a
// position with such a record goes to the selection (`use` ENGINE), the rest is a reference.
// The makers and the rules of their articles are data (catalogs/registry/brands.json): the core gets them as an
// argument, as the rest of the catalogue.

/** The family of a position: a closed list, a new family is code once (HARDWARE_CATALOGS.md, 2). */
export type PositionFamily =
  | 'HINGE'
  | 'HINGE_PLATE'
  | 'HINGE_PART'
  | 'CABINET_HANGER'
  | 'DRAWER_SLIDE'
  | 'DRAWER_SYSTEM'
  | 'SHELF_SUPPORT'
  | 'LIFT'
  | 'HANDLE'
  | 'LEG'
  | 'FASTENER'
  | 'ROD'
  | 'STORAGE'
  | 'LIGHT'
  | 'SLIDING_SYSTEM'
  | 'OTHER';

/** A family as a person sees it: its name and the folder of the local copy (Russian on the disk, Latin in a zip). */
export interface FamilyInfo {
  family: PositionFamily;
  name: string;
  folder: string;
  zipFolder: string;
}

export const POSITION_FAMILIES: readonly FamilyInfo[] = [
  { family: 'HINGE', name: 'Петли', folder: 'Петли', zipFolder: 'hinges' },
  { family: 'HINGE_PLATE', name: 'Планки петель', folder: 'Планки петель', zipFolder: 'hinge-plates' },
  { family: 'HINGE_PART', name: 'Принадлежности петель', folder: 'Принадлежности петель', zipFolder: 'hinge-parts' },
  { family: 'CABINET_HANGER', name: 'Мебельные навесы', folder: 'Навесы', zipFolder: 'cabinet-hangers' },
  { family: 'DRAWER_SLIDE', name: 'Направляющие ящиков', folder: 'Направляющие', zipFolder: 'drawer-slides' },
  { family: 'DRAWER_SYSTEM', name: 'Системы ящиков', folder: 'Системы ящиков', zipFolder: 'drawer-systems' },
  { family: 'SHELF_SUPPORT', name: 'Полкодержатели', folder: 'Полкодержатели', zipFolder: 'shelf-supports' },
  { family: 'LIFT', name: 'Подъёмники', folder: 'Подъёмники', zipFolder: 'lifts' },
  { family: 'HANDLE', name: 'Ручки', folder: 'Ручки', zipFolder: 'handles' },
  { family: 'LEG', name: 'Опоры и ножки', folder: 'Опоры', zipFolder: 'legs' },
  { family: 'FASTENER', name: 'Крепёж', folder: 'Крепёж', zipFolder: 'fasteners' },
  { family: 'ROD', name: 'Штанги и держатели', folder: 'Штанги', zipFolder: 'rods' },
  { family: 'STORAGE', name: 'Наполнение шкафа', folder: 'Наполнение', zipFolder: 'storage' },
  { family: 'LIGHT', name: 'Свет', folder: 'Свет', zipFolder: 'lights' },
  { family: 'SLIDING_SYSTEM', name: 'Системы купе', folder: 'Системы купе', zipFolder: 'sliding-systems' },
  { family: 'OTHER', name: 'Прочее', folder: 'Прочее', zipFolder: 'other' },
];

/** ACTIVE — offered; WITHDRAWN — withdrawn, old projects still open with it; DRAFT — not released. */
export type PositionStatus = 'ACTIVE' | 'WITHDRAWN' | 'DRAFT';

/** ENGINE — the position has its record of the engine and goes to the selection; REFERENCE — reference and estimate only. */
export type PositionUse = 'ENGINE' | 'REFERENCE';

/** The role of a file of a source linked to a position. */
export type PositionFileRole = 'bazis' | 'model3d' | 'drawing2d' | 'datasheet' | 'catalog-page' | 'image';

export interface PositionFile {
  role: PositionFileRole;
  /** SHA-256 of the bytes: the file is stored once, wherever it was met. */
  sha256: string;
  /** The extension, lower case without the dot: `fr3d`, `step`, `pdf`. */
  format: string;
  /** For a page of a catalogue: its number. */
  page?: number;
  /** For a file inside an archive: its path there; `sha256` is then the archive's (the reader hashes archives, not their files). */
  inner?: string;
}

/** A record of the engine data of a family: `{ file: 'hardware/hinges.json', id: 'BOYARD_H316A02' }`. */
export interface EngineLink {
  file: string;
  id: string;
}

/** A code under which a seller sells the position of the maker (ТБМ, МДМ …). */
export interface SellerCode {
  seller: string;
  code: string;
}

/** A price of a seller (MOD-DEC-536): roubles of a piece as read, the day, where from. */
export interface PositionPrice {
  seller: string;
  rub: number;
  date: string;
  source: string;
  status: 'CONFIRMED' | 'TEMPORARY';
}

export interface PositionRelations {
  /** Mounting plates of a hinge. */
  plates?: string[];
  /** The content of a kit: positions and their quantities. */
  components?: { id: string; qty: number }[];
  /** What replaces a withdrawn position. */
  replacedBy?: string;
}

/** One position of the register: one product of one maker. */
export interface CatalogPosition {
  /** `BRAND:normalised article` — never changes; a draft without an article: `BRAND:?name`. */
  id: string;
  /** Id of the maker in the dictionary (brands.json). */
  brand: string;
  /** The article as the maker writes it; null — not known (a draft only). */
  article: string | null;
  /** Other spellings of the same article of the maker. */
  aliases?: string[];
  sellerCodes?: SellerCode[];
  family: PositionFamily;
  /** The name in Russian. */
  name: string;
  status: PositionStatus;
  /**
   * The records of the engine data (catalogs/hardware): file and id. One product may have several — the shelf support
   * P101Zn.56 is a record of the shelf supports and an item of the hardware list (FINDINGS 1924); none — a reference only.
   */
  engine?: EngineLink[];
  offer?: { tier: 'ECONOMY' | 'STANDARD' | 'PREMIUM'; default?: boolean } | null;
  prices?: PositionPrice[];
  files?: PositionFile[];
  /** Where the data of the engine come from: a package or a whole catalogue (MOD-DEC-349: no page needed). */
  sources?: string[];
  relations?: PositionRelations;
}

/** A rewrite of an article: a regular expression and its replacement (`$1` …). */
export interface ArticleRewrite {
  pattern: string;
  with: string;
  /** Why: a case of КАТАЛОГИ it answers. */
  why: string;
}

/** A maker of the dictionary with the rules of its articles. */
export interface BrandRecord {
  /** Latin, upper case: `BOYARD`, `HETTICH`. */
  id: string;
  /** The name as the maker writes it. */
  name: string;
  /** Other names met in the sources (`Боярд`, `Blum`, `Hettich (библиотека AKS)`). */
  synonyms: string[];
  article?: {
    /** Rewrites after the common ones: the result is the same article. */
    same?: ArticleRewrite[];
    /** Rewrites that give a probably same article: not glued, reported as «похоже на». */
    similar?: ArticleRewrite[];
    /** Where the article stands in the name of a model: group 1 of the expression (`… BOYARD H102A02_0112`). */
    find?: { pattern: string; why: string }[];
    /** Codes that are not the maker's articles (normalised, the whole code): an old base's numbers `208` of BOYARD. */
    not?: { pattern: string; why: string }[];
    /** Articles of other makers this one sells under its own name (normalised, the whole code): the item is of `maker`. */
    others?: { pattern: string; maker: string; why: string }[];
  };
  /** Series that name the maker in a name of an item without its name (`Tiomos` — Grass, `Sensys` — Hettich). */
  series?: string[];
  /** false — the name is a common word (`BASE` in «EVO BASE S» of BOYARD): a name of an item does not name this maker by it. */
  inNames?: boolean;
}

export interface BrandDictionary {
  format: 'modulero.registry-brands/1';
  brands: BrandRecord[];
  /** Names that say the maker is not known: no position is keyed by them. */
  unknown: string[];
}

export interface PositionRegister {
  positions: CatalogPosition[];
}

// Cyrillic letters that look like Latin ones: an article typed with them is the same article (`Н316А02` → `H316A02`).
const LOOKALIKE: Record<string, string> = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' };

/** The common normalisation of every maker: spaces dropped, upper case, Cyrillic look-alikes Latin, dashes a hyphen. */
function commonArticle(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\s ]+/g, '')
    .toUpperCase()
    .replace(/[АВЕКМНОРСТХУ]/g, (c) => LOOKALIKE[c] ?? c)
    .replace(/[‐-―−]/g, '-');
}

const rewrite = (s: string, rules: readonly ArticleRewrite[] | undefined) => (rules ?? []).reduce((x, r) => x.replace(new RegExp(r.pattern), r.with), s);

/** The normalised article of a maker: the part of the key after `BRAND:`. Empty — no article. */
export function normalizeArticle(brand: BrandRecord, raw: string): string {
  return rewrite(commonArticle(raw), brand.article?.same);
}

/** The maker of an article a seller-maker sells under its name (`others` of the dictionary), or null: its own. */
export function otherMaker(dictionary: BrandDictionary, brand: BrandRecord, raw: string): BrandRecord | null {
  const a = normalizeArticle(brand, raw);
  const r = (brand.article?.others ?? []).find((x) => new RegExp(`^(?:${x.pattern})$`).test(a));
  return r ? (dictionary.brands.find((b) => b.id === r.maker) ?? null) : null;
}

/** The code is not an article of the maker (`not` of the dictionary): the item is keyed as if it had none. */
export function notAnArticle(brand: BrandRecord, raw: string): boolean {
  const a = normalizeArticle(brand, raw);
  return (brand.article?.not ?? []).some((r) => new RegExp(`^(?:${r.pattern})$`).test(a));
}

/** The forms of the article the rules call «похоже на»: other than the normalised one, never glued by themselves. */
export function similarArticles(brand: BrandRecord, raw: string): string[] {
  const same = normalizeArticle(brand, raw);
  return [...new Set((brand.article?.similar ?? []).map((r) => same.replace(new RegExp(r.pattern), r.with)))].filter((x) => x && x !== same);
}

/** The key of a position: `BOYARD:H316A02`. */
export function positionId(brand: BrandRecord, article: string): string {
  return `${brand.id}:${normalizeArticle(brand, article)}`;
}

const brandKey = (s: string) => commonArticle(s).replace(/[^\p{L}\p{N}]/gu, '');

/** The maker of a name met in a source, or null: not in the dictionary or a name of «no maker». */
export function brandOf(dictionary: BrandDictionary, name: string | null | undefined): BrandRecord | null {
  if (!name) return null;
  const k = brandKey(name);
  return dictionary.brands.find((b) => [b.id, b.name, ...b.synonyms].some((s) => brandKey(s) === k)) ?? null;
}

/** The name of a maker is known: a maker of the dictionary, or a name that says the maker is not known. */
export function brandNameKnown(dictionary: BrandDictionary, name: string): boolean {
  return brandOf(dictionary, name) !== null || dictionary.unknown.some((u) => brandKey(u) === brandKey(name));
}

/** The family of a position as a person sees it. */
export function familyInfo(family: PositionFamily): FamilyInfo {
  return POSITION_FAMILIES.find((f) => f.family === family)!;
}

/** `hardware/hinges.json#BOYARD_H316A02`: the form of a record of the engine in the set `positionUse` gets. */
export const engineRecordKey = (e: EngineLink) => `${e.file}#${e.id}`;

/** ENGINE — the position is active and all its records of the engine are in the data; otherwise a reference only. */
export function positionUse(p: CatalogPosition, engineRecords: ReadonlySet<string>): PositionUse {
  const links = p.engine ?? [];
  return p.status === 'ACTIVE' && links.length > 0 && links.every((e) => engineRecords.has(engineRecordKey(e))) ? 'ENGINE' : 'REFERENCE';
}

/** Only what breaks the register (MOD-DEC-349): the dictionary is consistent, a key and an alias belong to one position. */
export function brandDictionaryProblems(d: BrandDictionary): string[] {
  const out: string[] = [];
  if (d.format !== 'modulero.registry-brands/1') out.push(`неизвестный формат справочника производителей ${d.format}`);
  const owner = new Map<string, string>();
  for (const b of d.brands) {
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(b.id)) out.push(`${b.id}: id производителя — латиница в верхнем регистре`);
    for (const s of [b.id, b.name, ...b.synonyms]) {
      const k = brandKey(s),
        was = owner.get(k);
      if (!k) out.push(`${b.id}: пустое имя производителя`);
      else if (was && was !== b.id) out.push(`имя «${s}» у двух производителей: ${was} и ${b.id}`);
      else owner.set(k, b.id);
    }
    for (const r of [...(b.article?.same ?? []), ...(b.article?.similar ?? []), ...(b.article?.find ?? []), ...(b.article?.not ?? []), ...(b.article?.others ?? [])]) {
      try {
        new RegExp(r.pattern);
      } catch {
        out.push(`${b.id}: правило артикула «${r.pattern}» — не регулярное выражение`);
      }
      if (!r.why.trim()) out.push(`${b.id}: у правила «${r.pattern}» не сказано, зачем оно`);
    }
    for (const r of b.article?.others ?? []) if (!d.brands.some((x) => x.id === r.maker && x.id !== b.id)) out.push(`${b.id}: правило «${r.pattern}» ведёт к неизвестному производителю ${r.maker}`);
  }
  const series = new Map<string, string>();
  for (const b of d.brands)
    for (const s of b.series ?? []) {
      const was = series.get(brandKey(s));
      if (was && was !== b.id) out.push(`серия «${s}» у двух производителей: ${was} и ${b.id}`);
      else series.set(brandKey(s), b.id);
    }
  for (const u of d.unknown) if (owner.has(brandKey(u))) out.push(`«${u}» — и производитель, и «производитель не указан»`);
  return out;
}

/**
 * The checks of the register: the maker and the family are known, the key is the maker and the normalised article,
 * a key, an alias or a code of a seller belongs to one position, an article is absent only in a draft, links lead to
 * positions of the register, a file is named by its SHA-256.
 */
export function registerProblems(r: PositionRegister, d: BrandDictionary): string[] {
  const out: string[] = [];
  const families = new Set(POSITION_FAMILIES.map((f) => f.family));
  const ids = new Set(r.positions.map((p) => p.id));
  const claim = new Map<string, string>();
  const take = (key: string, id: string, what: string) => {
    const was = claim.get(key);
    if (was && was !== id) out.push(`${what} уже есть у позиции ${was}: ${id}`);
    else claim.set(key, id);
  };
  for (const p of r.positions) {
    const b = d.brands.find((x) => x.id === p.brand);
    if (!b) {
      out.push(`${p.id}: производителя ${p.brand} нет в справочнике`);
      continue;
    }
    if (!families.has(p.family)) out.push(`${p.id}: неизвестный вид ${p.family}`);
    if (!p.name.trim()) out.push(`${p.id}: нет названия`);
    if (p.article === null) {
      if (p.status !== 'DRAFT') out.push(`${p.id}: позиция без артикула бывает только черновиком`);
      if (!p.id.startsWith(`${b.id}:?`)) out.push(`${p.id}: ключ черновика без артикула — ${b.id}:?название`);
    } else {
      const key = positionId(b, p.article);
      if (key === `${b.id}:`) out.push(`${p.id}: пустой артикул`);
      else if (p.id !== key) out.push(`${p.id}: ключ позиции должен быть ${key}`);
    }
    if (claim.has(p.id)) out.push(`ключ ${p.id} уже есть у позиции ${claim.get(p.id)}: ${p.id}`);
    else claim.set(p.id, p.id);
    for (const a of p.aliases ?? []) take(positionId(b, a), p.id, `написание ${a}`);
    for (const s of p.sellerCodes ?? []) take(`${brandKey(s.seller)}|${commonArticle(s.code)}`, p.id, `артикул продавца ${s.seller} ${s.code}`);
    for (const f of p.files ?? []) if (!/^[0-9a-f]{64}$/.test(f.sha256)) out.push(`${p.id}: файл ${f.role} без sha256`);
    for (const x of p.prices ?? []) if (!(x.rub > 0)) out.push(`${p.id}: цена ${x.seller} — нужно положительное число рублей`);
    const rel = p.relations;
    for (const t of [...(rel?.plates ?? []), ...(rel?.components ?? []).map((c) => c.id), ...(rel?.replacedBy ? [rel.replacedBy] : [])])
      if (!ids.has(t)) out.push(`${p.id}: связь с ${t} — такой позиции нет`);
  }
  return out;
}
