// Catalogue of the materials of the facades (MOD-DEC-573, docs/product/FACADE_MATERIALS_PROPOSAL.md): the choice
// «материал → исполнение → цвет» of the doors and the drawer fronts. The data lie in catalogs/materials/facades.json,
// in the release of the catalogue beside the hardware (catalogs/RELEASE.json), outside the core (CAT-1): a material,
// an execution, a price or a colour is added there, without a change of the code. A material is made in the order from
// a board of a decor (ЛДСП, ЛМДФ: the door is cut and drilled with the product, 347) or bought ready-made (МДФ in PVC
// film or in enamel, veneer: out of the cutting plan, the supplier drills the cups, FINDINGS 266). The execution gives
// the thickness of the door and the price of a bought one, ₽ per m² of one projection, rounded up to 10 ₽ when it is
// entered (346); a price the catalogue does not give is «Цена не определена» (247).
// Version 2 (FINDINGS 3390–3394): the construction of the facade (a slab, a frame of MDF or of aluminium with an
// insert, a leaf of glass), the frame, the milling patterns, the limits of the size, the mass per m² and the kinds of
// hinges are data too, so that a facade of another construction or of another supplier is added without a change of
// the code. Every new field but the construction is optional: absent — not known, and the engine checks nothing by it.
import { HINGE_APPLICATIONS, type HingeApplication } from './hinges.js';
import { refChecker, type CatalogDocument, type Known, type RangeMm } from './types.js';

/** How the colour is chosen: a decor of the board (it goes to the cutting plan), a decor as a sample or a colour code, the species. */
export type FacadeColorMode = 'BOARD_DECOR' | 'SAMPLE_OR_CODE' | 'SPECIES';

/**
 * How a facade is built (FINDINGS 3390). SLAB — one panel: a board cut in the order or a bought panel (film, enamel,
 * veneer, plastic); FRAME_MDF and FRAME_ALU — a frame of MDF or of aluminium profiles holding an insert; GLASS — a leaf
 * of glass on hinges for glass. A material made in the order is a slab.
 */
export type FacadeConstruction = 'SLAB' | 'FRAME_MDF' | 'FRAME_ALU' | 'GLASS';

export const FACADE_CONSTRUCTIONS: readonly FacadeConstruction[] = ['SLAB', 'FRAME_MDF', 'FRAME_ALU', 'GLASS'];

/**
 * Limits of the size of a facade as its maker gives them (FINDINGS 3391): the height along the hinge side and the
 * width across it, mm, and the largest area. These are the limits of the model, not of the sheet it is cut from.
 */
export interface FacadeSizeLimits {
  heightMm: Known<RangeMm>;
  widthMm: Known<RangeMm>;
  /** The largest area, m²; absent — no limit of its own. */
  maxAreaM2?: Known<number>;
}

/**
 * A milling pattern of a bought facade (FINDINGS 3392): the supplier draws it, the geometry of the door does not change.
 * INCLUDED — in the price of the execution; PER_M2 — ₽ per m² of one projection on top of it; PER_PIECE — ₽ per facade.
 */
export interface FacadeMilling {
  id: string;
  title: string;
  priceMode: 'INCLUDED' | 'PER_M2' | 'PER_PIECE';
  /** The price on top of the execution; absent when it is included. */
  priceRub?: Known<number>;
  /** The executions of the material it is made in; absent — all of them. */
  executions?: string[];
  /** Its own limits: the smallest facade the pattern fits; they add to those of the execution. */
  limits?: FacadeSizeLimits;
}

/**
 * The frame of a framed facade (FINDINGS 3393): the profile, its section, how much smaller than the facade its insert
 * is, and the inserts it takes — ids of the catalogue of glass or of a material of the facades.
 */
export interface FacadeFrame {
  /** The article of the profile; null — not chosen yet. */
  profile: string | null;
  /** Width of the profile on the face, mm. */
  faceWidthMm: Known<number>;
  /** Depth of the profile, mm: the thickness of the facade. */
  depthMm: Known<number>;
  /** The insert is smaller than the facade by these, mm. */
  insertDeductionMm: Known<{ heightMm: number; widthMm: number }>;
  insertThicknessMm: Known<number>;
  inserts: string[];
  /** The heaviest facade the frame holds, kg. */
  maxMassKg?: Known<number>;
}

/** An execution of a material: its thickness and finish; 'BOARD' — the thickness of the carcass board. */
export interface FacadeExecution {
  id: string;
  title: string;
  thicknessMm: number | 'BOARD';
  /** Price of a bought facade, ₽/m²; null — a door made in the order (priced by its boards), or not known. */
  priceRubPerM2: Known<number>;
  /** Where the price was read (a source is not required, MOD-DEC-348). */
  priceNote?: string;
  /** Mass of the finished facade, kg per m² of one projection (FINDINGS 3394); absent — not known (355). */
  massKgPerM2?: Known<number>;
  /** Its own limits of the size; absent — those of the material. */
  limits?: FacadeSizeLimits;
}

export interface FacadeMaterial {
  id: string;
  title: string;
  supply: 'MANUFACTURE' | 'PURCHASED';
  color: FacadeColorMode;
  /** The board product a door made in the order is cut from (`boardVariantsForImplementation.product` of a decor). */
  boardProduct?: string;
  /**
   * The price of the sheets of a door made in the order: AS_CARCASS — as a sheet of a board of the decor, the price of
   * its variant in the material catalogue (MOD-DEC-508; the ЛМДФ too since FINDINGS 1606); UNKNOWN — «Цена не
   * определена» (247, 573).
   */
  boardPrice?: 'AS_CARCASS' | 'UNKNOWN';
  /** The decors of the catalogue of decors the colour may be: a list, null — any decor as a sample, [] — none (text only). */
  decors: string[] | null;
  executions: FacadeExecution[];
  /** How the facade is built (FINDINGS 3390). */
  construction: FacadeConstruction;
  /** The frame of a framed construction; only of FRAME_MDF and FRAME_ALU. */
  frame?: FacadeFrame;
  /** Milling patterns the supplier makes; absent — none to choose. */
  millings?: FacadeMilling[];
  /** Limits of the size of every execution that has none of its own. */
  limits?: FacadeSizeLimits;
  /** The kinds of hinges the facade hangs on (`application` of hinges.json); absent — STANDARD, of GLASS — GLASS. */
  hingeApplications?: HingeApplication[];
}

export interface FacadeMaterialCatalog {
  version: string;
  /** The source of the prices as a whole: supplier, price list, date, region. */
  priceSource: string;
  materials: FacadeMaterial[];
  documents: CatalogDocument[];
}

/** A material of the catalogue by id. */
export const facadeMaterialOf = (c: FacadeMaterialCatalog, id: unknown): FacadeMaterial | undefined => c.materials.find((m) => m.id === id);

/** An execution of a material by id. */
export const facadeExecutionOf = (m: FacadeMaterial | undefined, id: unknown): FacadeExecution | undefined => m?.executions.find((e) => e.id === id);

/**
 * Only what the engine needs (MOD-DEC-349): ids without repeats, a known supply and colour mode, a material made in the
 * order names its board and its decors, an execution has a positive thickness (or that of the board — only of a
 * material made in the order) and a price of a bought one is a positive number or unknown.
 */
export function facadeCatalogProblems(c: FacadeMaterialCatalog, decorIds: ReadonlySet<string>): string[] {
  const { known, problems: out } = refChecker(c.documents);
  if (new Set(c.materials.map((m) => m.id)).size !== c.materials.length) out.push('повтор id материала');
  const executions = c.materials.flatMap((m) => m.executions.map((e) => e.id));
  if (new Set(executions).size !== executions.length) out.push('повтор id исполнения');
  for (const m of c.materials) {
    if (!m.id.trim() || !m.title.trim()) out.push(`материал без id или названия: ${m.id}`);
    if (!['MANUFACTURE', 'PURCHASED'].includes(m.supply)) out.push(`${m.id}: неизвестная поставка ${m.supply}`);
    if (!['BOARD_DECOR', 'SAMPLE_OR_CODE', 'SPECIES'].includes(m.color)) out.push(`${m.id}: неизвестный выбор цвета ${m.color}`);
    if (m.supply === 'MANUFACTURE' && (m.color !== 'BOARD_DECOR' || !m.boardProduct || !m.decors?.length || !['AS_CARCASS', 'UNKNOWN'].includes(m.boardPrice ?? ''))) out.push(`${m.id}: материал в заказе из плиты — цвет по декору плиты, нужны плита, цена листа и декоры`);
    for (const d of m.decors ?? []) if (!decorIds.has(d)) out.push(`${m.id}: декора ${d} нет в каталоге декоров`);
    if (!m.executions.length) out.push(`${m.id}: нет исполнений`);
    for (const e of m.executions) {
      if (!e.id.trim() || !e.title.trim()) out.push(`${m.id}: исполнение без id или названия`);
      if (e.thicknessMm === 'BOARD' ? m.supply !== 'MANUFACTURE' : !(Number.isFinite(e.thicknessMm) && e.thicknessMm > 0)) out.push(`${m.id}.${e.id}: толщина — положительное число, «BOARD» — только у плиты в заказе`);
      known(`${m.id}.${e.id}.priceRubPerM2`, e.priceRubPerM2);
      if (e.priceRubPerM2.value !== null && !(e.priceRubPerM2.value > 0)) out.push(`${m.id}.${e.id}: цена — положительное число`);
      if (e.massKgPerM2) positive(`${m.id}.${e.id}.massKgPerM2`, e.massKgPerM2);
      if (e.limits) limits(`${m.id}.${e.id}.limits`, e.limits);
    }
    // Version 2 (FINDINGS 3390–3394): the construction, the frame, the patterns, the limits and the hinges.
    if (!FACADE_CONSTRUCTIONS.includes(m.construction)) out.push(`${m.id}: неизвестная конструкция ${m.construction}`);
    if (m.supply === 'MANUFACTURE' && m.construction !== 'SLAB') out.push(`${m.id}: материал в заказе из плиты — конструкция SLAB`);
    const framed = m.construction === 'FRAME_MDF' || m.construction === 'FRAME_ALU';
    if (framed !== Boolean(m.frame)) out.push(`${m.id}: ${framed ? 'у рамочной конструкции нужна рамка' : 'рамка — только у рамочной конструкции'}`);
    if (m.frame) {
      const f = m.frame;
      if (f.profile !== null && !f.profile.trim()) out.push(`${m.id}.frame.profile: артикул профиля или null`);
      positive(`${m.id}.frame.faceWidthMm`, f.faceWidthMm);
      positive(`${m.id}.frame.depthMm`, f.depthMm);
      positive(`${m.id}.frame.insertThicknessMm`, f.insertThicknessMm);
      known(`${m.id}.frame.insertDeductionMm`, f.insertDeductionMm);
      const d = f.insertDeductionMm.value;
      if (d !== null && !(d.heightMm >= 0 && d.widthMm >= 0)) out.push(`${m.id}.frame.insertDeductionMm: вычет — неотрицательные числа`);
      if (!f.inserts.length || new Set(f.inserts).size !== f.inserts.length || f.inserts.some((x) => !x.trim())) out.push(`${m.id}.frame.inserts: вставки — непустой список без повторов`);
      if (f.maxMassKg) positive(`${m.id}.frame.maxMassKg`, f.maxMassKg);
    }
    if (m.limits) limits(`${m.id}.limits`, m.limits);
    const own = new Set(m.executions.map((e) => e.id));
    if (m.millings) {
      if (m.supply !== 'PURCHASED') out.push(`${m.id}: фрезеровка — только у покупного фасада`);
      if (new Set(m.millings.map((x) => x.id)).size !== m.millings.length) out.push(`${m.id}: повтор id фрезеровки`);
      for (const x of m.millings) {
        if (!x.id.trim() || !x.title.trim()) out.push(`${m.id}: фрезеровка без id или названия`);
        if (!['INCLUDED', 'PER_M2', 'PER_PIECE'].includes(x.priceMode)) out.push(`${m.id}.${x.id}: неизвестный способ цены ${x.priceMode}`);
        if ((x.priceMode === 'INCLUDED') === Boolean(x.priceRub)) out.push(`${m.id}.${x.id}: ${x.priceMode === 'INCLUDED' ? 'цена входит в исполнение — без priceRub' : 'нужна цена priceRub'}`);
        if (x.priceRub) positive(`${m.id}.${x.id}.priceRub`, x.priceRub);
        for (const e of x.executions ?? []) if (!own.has(e)) out.push(`${m.id}.${x.id}: исполнения ${e} нет у материала`);
        if (x.limits) limits(`${m.id}.${x.id}.limits`, x.limits);
      }
    }
    if (m.hingeApplications) {
      const a = m.hingeApplications;
      if (!a.length || new Set(a).size !== a.length || a.some((x) => !HINGE_APPLICATIONS.includes(x))) out.push(`${m.id}.hingeApplications: назначения петель hinges.json без повторов`);
    }
    if (m.construction === 'GLASS' && !facadeHingeApplications(m).includes('GLASS')) out.push(`${m.id}: стеклянная дверь висит на петлях для стекла (GLASS)`);
  }
  return out;

  function positive(where: string, k: Known<number>) {
    known(where, k);
    if (k.value !== null && !(Number.isFinite(k.value) && k.value > 0)) out.push(`${where}: положительное число`);
  }
  function range(where: string, k: Known<RangeMm>) {
    known(where, k);
    const r = k.value;
    if (r !== null && !(Number.isFinite(r.minMm) && Number.isFinite(r.maxMm) && r.minMm > 0 && r.minMm <= r.maxMm)) out.push(`${where}: от и до — положительные, от не больше до`);
  }
  function limits(where: string, l: FacadeSizeLimits) {
    range(`${where}.heightMm`, l.heightMm);
    range(`${where}.widthMm`, l.widthMm);
    if (l.maxAreaM2) positive(`${where}.maxAreaM2`, l.maxAreaM2);
  }
}

/** The kinds of hinges a facade of the material hangs on: its list, else GLASS for a leaf of glass and STANDARD for the rest. */
export function facadeHingeApplications(m: FacadeMaterial): HingeApplication[] {
  return m.hingeApplications ?? [m.construction === 'GLASS' ? 'GLASS' : 'STANDARD'];
}

/** The limits of the size of an execution: its own, else those of its material; null — none given. */
export function facadeLimitsOf(m: FacadeMaterial, e: FacadeExecution): FacadeSizeLimits | null {
  return e.limits ?? m.limits ?? null;
}

/** A milling pattern of a material by id. */
export const facadeMillingOf = (m: FacadeMaterial | undefined, id: unknown): FacadeMilling | undefined => m?.millings?.find((x) => x.id === id);

/**
 * What a facade of `widthMm` × `heightMm` breaks of the limits of its execution and of its milling pattern (FINDINGS
 * 3391): one sentence per limit, for a refusal or a remark. A limit the catalogue does not know checks nothing (Handbook
 * §5: UNKNOWN, not a made-up number); an empty list — the size holds or nothing is known.
 */
export function facadeSizeProblems(m: FacadeMaterial, e: FacadeExecution, widthMm: number, heightMm: number, milling?: FacadeMilling): string[] {
  const out: string[] = [],
    mm = (v: number) => String(Math.round(v * 10) / 10).replace('.', ','),
    check = (l: FacadeSizeLimits | null | undefined, of: string) => {
      if (!l) return;
      for (const [k, v, word] of [
        [l.heightMm, heightMm, 'Высота'],
        [l.widthMm, widthMm, 'Ширина'],
      ] as const) {
        const r = k.value;
        if (r && v < r.minMm) out.push(`${word} фасада ${mm(v)} мм меньше наименьшей ${mm(r.minMm)} мм ${of}`);
        if (r && v > r.maxMm) out.push(`${word} фасада ${mm(v)} мм больше наибольшей ${mm(r.maxMm)} мм ${of}`);
      }
      const a = l.maxAreaM2?.value ?? null,
        s = (widthMm * heightMm) / 1e6;
      if (a !== null && s > a) out.push(`Площадь фасада ${mm(s)} м² больше наибольшей ${mm(a)} м² ${of}`);
    };
  check(facadeLimitsOf(m, e), `для «${m.title} · ${e.title}»`);
  if (milling) check(milling.limits, `для фрезеровки «${milling.title}»`);
  return out;
}

/** Mass of a facade of `widthMm` × `heightMm` by the mass per m² of its execution, kg; null — the catalogue does not give it (355). */
export function facadeMassKg(e: FacadeExecution, widthMm: number, heightMm: number): number | null {
  const q = e.massKgPerM2?.value ?? null;
  return q === null ? null : (q * widthMm * heightMm) / 1e6;
}
