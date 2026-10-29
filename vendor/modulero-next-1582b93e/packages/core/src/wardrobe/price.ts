// The price of the swing wardrobe (tasks W5, W11; MIGRATION_PLAN step 3.6): one function of the graph and the price
// snapshot. The prototype had four calculations that disagreed (WR-11): the base `costs` of model() (r1.html:12779),
// the demo price u13Price with its layers — v17 (r1.html:54512), material selection (58690), Rastex kits (60837),
// t3 hinge kits (85535), r7 fasteners (88298) — the `costs` of the model rewritten from it while the model was not
// yet complete (54826), and the quote (54677, 58081). Here the price is computed once, from the model read back
// from the graph (wardrobeModelFromGraph), and the quote, the costs of the model and the price strip of the editor
// are projections of that one result.
//
// W5 repeated the prototype's quote.txt (MOD-DEC-285, FINDINGS 310–318). W11 is the second stage of 285: the maker's
// rates are the only source of the price (FINDINGS 520–528):
//   • delivery, assembly and markup are the maker's rates of the project, not the demo profile (FINDINGS 520);
//   • the numbers the prototype wrote into its code (saw, confirmat, shelf pin, rod support) are the maker's rate
//     card of the policy; a rate nobody has set yet is temporary, its line is «условная» and the editor lists it
//     under the bell (FINDINGS 521);
//   • the board lines do not drop out: a group with a blank larger than the sheet keeps the sheets of its other
//     parts and gets a conditional line for the larger one (WR-10, FINDINGS 522);
//   • Rastex: 20 ₽ is the body of the eccentric, the stem is a line of its own by its article (MOD-DEC-293); the
//     confirmat kit of a joint is the confirmat already priced, not a second charge (FINDINGS 523);
//   • a found or conditional price of hardware is a guide: its line is rounded up to whole 10 ₽ (MOD-DEC-346; the
//     line rather than the piece — the recommendation of 346, a question to the owner in the PR of W11, FINDINGS 524);
//   • supplier cost, internal cost and customer price are kept apart (MOD-DEC-028, FINDINGS 525).
// MOD-DEC-509 (FINDINGS 830–838): the hinges, their plates and the runner kits are priced by the article of the graph
// mechanism and the price card the kitchen shares; a rate of the form is the maker's only when the maker has set it,
// the rates of the prototype's form are temporary. MOD-DEC-536 (FINDINGS 990–993): every price of the hardware and the
// fasteners is a record of the hardware catalogue of the release, the kits of the catalogue first (catalogPrices).
// Still as in the prototype: the edge metres of the model include the bought fronts while the price does not (WR-29).
import { catalogPrices, type ResolvedPrice } from '../catalog/hardware/prices.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { releaseBoardOf, type MaterialCatalog } from '../catalog/materials.js';
import type { Graph } from '../engine/contract.js';
import type { JointFasteners } from '../engine/fasteners.js';
import type { CuttingPlan } from '../engine/cutting.js';
import { barCutting, type BarCutting } from '../engine/bar-cutting.js';
import { backSplit } from '../engine/policy/back-split.js';
import { slidingPrice } from '../engine/policy/sliding-price.js';
import { deBlank, DE_BLANK } from '../engine/policy/depth.js';
import { STORAGE_KIND_RU } from '../engine/policy/fittings-selection.js';
import { facadeMaterialOf } from '../catalog/hardware/facades.js';
import { facadeChoice, facadeChoicePrice, facadeChoiceTitle } from '../engine/policy/facade-materials.js';
import { decorsOf } from '../catalog/decors.js';
import { mfChoice, mfDecor, mfLabel, mfPurchased, mfSideChoice, mfTariff } from '../engine/policy/materials.js';
import { LEFTOVERS_NOTES } from '../engine/policy/purchase-units.js';
import type { Rec } from '../engine/policy/project-state.js';
import { isConfirmatProfile } from '../engine/policy/wardrobe-fasteners.js';
import { edgeRateOf, wardrobePrice as policy } from '../engine/policy/wardrobe-price.js';
import { contentDigest } from '../project/digest.js';
import { wardrobePriceCuttingPlan } from './cutting-plan.js';
import { fittingsArticles, type WardrobeFittings } from './fittings.js';
import { wardrobeModelFromGraph } from './graph-projection.js';
import { WARDROBE_PROTOTYPE_VERSION, type WardrobeRates } from './input.js';
import type { WardrobePriceSnapshot } from './price-snapshot.js';
export * from './price-snapshot.js';
import type { HardwareArticle, PriceQuantities } from './summary.js';

const C = policy.constants;

/** A sheet format of the price: its size and the price of one whole sheet (v17CutJob, r1.html:54357). */
export interface CutFormat {
  id: string;
  material: string;
  thickness: number;
  /** Size along the grain of the sheet, mm. */
  height: number;
  width: number;
  /** Price of one whole sheet, ₽; NaN — the rate is not set. */
  price: number;
  source: string;
  grain: 'Y' | 'NONE';
  /** Why the sheet price is conditional: the sheet has no price per sheet (MOD-DEC-508), W11. */
  conditional?: string;
  /** Where the price of a sheet that is not conditional comes from: the catalogue, or the averaged price of the project (FINDINGS 1603). */
  priceOrigin?: 'CATALOG' | 'DECISION';
}

/** A part the price cuts from a board: its sawn blank (the cutting plan cuts the same parts of the graph). */
export interface CutJobPart {
  id: string;
  width: number | null;
  height: number | null;
  blank: Rec;
  qty: number;
  thickness: number;
  material: string;
  grain: string | null;
  grainSource: string;
  rotate: boolean;
  dimensionBasis: string;
  sourceBasis: string;
  transformId: string;
  transformVersion: number;
}

/** The sheet formats with their prices, the saw rate and the parts of the boards of a price. */
export interface CutJob {
  profile: { id: string; sawRate: number; formats: CutFormat[] };
  parts: CutJobPart[];
}

/**
 * Where the rate of a line comes from (W11): MAKER — the maker's rates of the project; DECISION — a decision of the
 * journal: an owner decision (Rastex body, 293), the percents of 402, a rate of the card the project set (569);
 * CATALOG — a tariff or a record of a catalogue (edge banding, ready-made facades, hardware); TEMPORARY — a value
 * nobody has set yet: the price of the line is conditional (MOD-DEC-264).
 */
export type RateOrigin = 'MAKER' | 'DECISION' | 'CATALOG' | 'TEMPORARY';

/** One line of the estimate (r1.html:54520 push). */
export interface PriceLine {
  category: string;
  item: string;
  qty: number;
  unit: string;
  customerUnitRate: number;
  amount: number;
  kopeks: number;
  partCount?: number;
  areaPerPart?: number;
  origin: RateOrigin;
  /** The amount is qty × rate rounded up to this step, ₽: a found or conditional price of hardware (MOD-DEC-346). */
  roundUpToRub?: number;
  /** Why the line is conditional beyond its temporary rate (a blank larger than the sheet, a decor without a sheet price). */
  conditional?: string;
  /** What the user should know about the line: whole sheets, the leftovers can make it cheaper (MOD-DEC-511). */
  note?: string;
}

export type PriceStatus = 'PROVISIONAL_ESTIMATE' | 'PARTIAL' | 'BLOCKED';

/** The price of the wardrobe: lines, total or null, status, what is missing and why. */
export interface WardrobePrice {
  snapshotId: string;
  version: string;
  /** Total, ₽; null — not every price is known: an unknown price is not a zero (MOD-DEC-157, 247, 264). */
  amount: number | null;
  /** Sum of the known lines, ₽: what is known even when the total is not. */
  knownAmount: number;
  /** MOD-DEC-028: what is bought (boards, fronts, hardware, fasteners), the maker's cost C and the customer's price; null — unknown. */
  supplierCost: number | null;
  internalCost: number | null;
  customerPrice: number | null;
  currency: 'RUB';
  status: PriceStatus;
  demo: true;
  finalPrice: false;
  material: string;
  materialCode: string;
  lines: PriceLine[];
  missing: string[];
  /** The temporary rates and conditional lines of this price: shown under the bell until the owner sets them (W11). */
  temporary: string[];
  assumptions: string[];
  sources: Rec;
  /** The cutting plan the board lines and the saw run come from (MOD-DEC-505): the plan of the map, by default. */
  cut: CuttingPlan;
  /** Costs of the model by category of the lines (WR-11: the costs are the price). */
  costs: Rec;
  knownFastenerSubtotalRub?: number;
  hardwareTotalRub?: number | null;
  /** The doors of a sliding wardrobe: the amounts and the priced kit of the system (W9.3). */
  sliding?: Rec;
}

/** v17NonNegative (r1.html:54339): a number ≥ 0 or NaN; an empty text is not a zero. */
export function nonNegative(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return NaN;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A line amount: qty × rate to kopecks, or rounded up to `step` ₽ (MOD-DEC-346; INV-P01 checks the same rule). */
export function lineAmount(qty: number, rate: number, step?: number): number {
  const exact = round2(qty * rate);
  return step ? Math.ceil(exact / step - 1e-9) * step : exact;
}

/** The field of the form, the name and the unit of a line of the hardware by its kind (MOD-DEC-509). */
const KINDS: Readonly<Record<HardwareArticle['kind'], { rate: keyof WardrobeRates; name: string; unit: string }>> = {
  hinge: { rate: 'hingePrice', name: 'Петля', unit: 'шт' },
  plate: { rate: 'hingePrice', name: 'Планка петли', unit: 'шт' },
  runner: { rate: 'drawerKitPrice', name: 'Направляющие ящика', unit: 'компл.' },
  drawerKit: { rate: 'drawerKitPrice', name: 'Сборный ящик', unit: 'компл.' },
  rod: { rate: 'rodPrice', name: 'Штанги', unit: 'шт' },
  handle: { rate: 'handlePrice', name: 'Ручки', unit: 'шт' },
};

/** Why a line of hardware without a price of its article takes the rate of the card (MOD-DEC-509, 569). */
const FORM_RATE = 'по ставке карты шкафа (MOD-DEC-509, 569)';

/**
 * Where a price of the catalogue comes from as a line says it: temporary, an owner decision (293), or the catalogue
 * (536) — a found price and an averaged price of the project (569, its source is a FINDINGS item) alike.
 */
const catalogOrigin = (p: ResolvedPrice): RateOrigin => (p.temporary ? 'TEMPORARY' : /^MOD-DEC-/.test(p.sourceDoc) ? 'DECISION' : 'CATALOG');

/**
 * The maker's rate of a field of the form (MOD-DEC-509, FINDINGS 831): the number the maker has set; null — the field
 * is empty or holds the value of the prototype's form (`prototypeForm`), which is not the maker's; NaN — not a rate.
 */
export function makerRate(rates: WardrobeRates, field: keyof WardrobeRates, formValue: number | undefined = C.prototypeForm.value[field]): number | null {
  const text = String(rates[field] ?? '').trim();
  if (!text) return null;
  const n = nonNegative(text);
  return n === formValue ? null : n;
}

/** The maker's board rate, ₽/m², or NaN: the material field holds a decor code once a decor is chosen. */
const boardRate = (s: WardrobePriceSnapshot) => nonNegative(s.boardRate);

/** The decor of the shared catalogue of a material code (W980 → DEC-EGG-W980-ST7); null — none (W960) or several. */
export function decorOfCode(code: string, mc: MaterialCatalog): string | null {
  const found = decorsOf(mc).filter((d) => d.code === code);
  return found.length === 1 ? found[0]!.id : null;
}

/** The price of a whole sheet of a board and where it comes from (MOD-DEC-508, 569). */
export interface BoardSheetPrice {
  rub: number;
  origin: 'CATALOG' | 'DECISION';
  basis: string;
}

/**
 * The price of a whole sheet of ЛДСП of a decor, thickness and format (MOD-DEC-508, 569; FINDINGS 1603): the price of
 * the board variant of the decor in the material catalogue; a decor outside the catalogue, or one without a variant of
 * that thickness and format, takes the averaged price of a sheet of the project — the board rate of the card times the
 * area of the sheet, to the rouble, as the catalogue prices its sheets (FINDINGS 1602). A variant of the catalogue
 * without a price: null, the caller says the price is not set (247).
 */
export function boardSheetPrice(decorId: string | null, thickness: number, height: number, width: number, mc: MaterialCatalog, family: 'LDSP' | 'LMDF' = 'LDSP'): BoardSheetPrice | null {
  const decor = decorId ? mfDecor(decorId, mc) : null,
    lmdf = family === 'LMDF',
    variant = decor?.boardVariantsForImplementation?.find((v: Rec) => String(v.product ?? '').includes('ЛМДФ') === lmdf && v.thicknessMm === thickness && v.formatMm?.[0] === height && v.formatMm?.[1] === width),
    size = `${height} × ${width} мм`;
  if (variant) {
    const sheet = nonNegative(variant.priceRub);
    return Number.isFinite(sheet) ? { rub: sheet, origin: 'CATALOG', basis: `цена листа ${variant.variantId} каталога материалов ${sheet} ₽ за лист ${size} (MOD-DEC-508)` } : null;
  }
  // A format the catalogue has not: the averaged rate of the board — of ЛДСП, or of ЛМДФ (FINDINGS 1606) — times the area.
  const rate = lmdf ? C.lmdfRateRub : C.boardRateRub,
    rub = Math.round((rate.value * height * width) / C.sqMmPerSqM.value);
  return {
    rub,
    origin: 'DECISION',
    basis: `${decor ? `листа ${lmdf ? 'ЛМДФ ' : ''}${thickness} мм ${size} у декора ${mfLabel(decorId, mc)} в каталоге нет` : 'декора нет в каталоге материалов'} — усреднённая цена листа проекта: ставка ${lmdf ? 'ЛМДФ' : 'плиты'} ${ru(rate.value)} ₽/м² × площадь листа ${size}, до рубля (MOD-DEC-569)`,
  };
}

/** A number in the text of a basis: the decimal comma. */
const ru = (x: number) => String(x).replace('.', ',');

/**
 * The cut job of the boards (v17CutJob, r1.html:54357): the formats of the corpus board and of HDF, or the board
 * variants of the chosen decor; the parts made in the order as sawn blanks. A door made in the order from the corpus
 * board is one of them (FINDINGS 311). The saw rate is the maker's rate card (FINDINGS 521); the sheets and the saw
 * run are those of the cutting plan (MOD-DEC-505). A whole sheet is priced by its price per sheet (MOD-DEC-508): the
 * price of the board variant of the decor. A sheet without one is priced conditionally, the maker's rate per m² times
 * its area, or the temporary rate of the card (FINDINGS 522, 804). `sideDecors` — the decors of the outer sides other than
 * the carcass (MOD-DEC-483): their sheets are formats of their own, material `MF:<decor>`, priced the same way.
 */
export function wardrobeCutJob(m: Rec, s: WardrobePriceSnapshot, mc: MaterialCatalog, sideDecors: readonly string[] = []): CutJob {
  const code = m.material,
    d = { materialSelection: s.materialSelection },
    formats: CutFormat[] = [],
    // A built-in decor of the prototype (W960, W980, U708, U702): the decor of the catalogue of its code, if any; the
    // rate of its option is the prototype's demo rate, not a price (FINDINGS 1603). An option that is not a rate (empty,
    // or a decor of the catalogue not chosen) gives no sheet price, as before.
    builtIn = decorOfCode(code, mc);
  for (const [height, width] of C.boardFormats.value) {
    const p = Number.isFinite(boardRate(s)) ? boardSheetPrice(builtIn, m.t, height, width, mc) : null;
    formats.push({ id: code + '-' + height + 'x' + width, material: code, thickness: m.t, height, width, price: p?.rub ?? NaN, source: p?.basis ?? 'NO_BOARD_RATE', grain: 'Y', ...(p ? { priceOrigin: p.origin } : {}) });
  }
  // A sheet of HDF: the board of the release in the material catalogue (FINDINGS 1607); a rate of HDF of the project
  // other than the prototype's value of the form is the maker's: conditionally, the rate × the area of the sheet (508).
  const hdfRate = nonNegative(s.hdfRate),
    makerHdf = hdfRate !== C.prototypeHdfRub.value;
  for (const [height, width] of C.hdfFormats.value) {
    const board = makerHdf ? null : releaseBoardOf(mc, 'HDF', C.hdfThickness.value, height, width),
      common = { id: 'HDF-' + height + 'x' + width, material: 'HDF', thickness: C.hdfThickness.value, height, width, grain: 'NONE' as const };
    formats.push(
      board
        ? { ...common, price: board.priceRub, source: board.id, priceOrigin: 'CATALOG' }
        : { ...common, price: (hdfRate * height * width) / C.sqMmPerSqM.value, source: 'LOCAL_DEMO_AREA_RATE_CONVERTED_TO_WHOLE_SHEET', conditional: `цена листа ХДФ не задана — условно по ставке изготовителя ${hdfRate} ₽/м² × площадь листа (MOD-DEC-508)` },
    );
  }
  // The inserts of the sliding leaves (LDSP 10 mm, W9.2) are cut by the maker from whole sheets of their own board, as
  // the corpus (MOD-DEC-512): parts of the job, not an area of the door system (FINDINGS 514 before).
  const parts = m.parts
    .filter((p: Rec) => !mfPurchased(p))
    .map((p: Rec) => {
      const blank = deBlank(p);
      return {
        id: p.id,
        width: blank.W ?? null,
        height: blank.L ?? null,
        blank,
        qty: p.q,
        thickness: p.T,
        material: p.materialFamily === 'HDF' ? 'HDF' : code,
        grain: p.materialFamily === 'HDF' ? 'NONE' : ['L', 'W', 'NONE'].includes(p.texture) ? p.texture : null,
        grainSource: p.materialFamily === 'HDF' ? 'EXPLICIT_DEMO_HDF_NON_DIRECTIONAL' : 'FE_TEXTURE',
        rotate: true,
        dimensionBasis: 'SAWN_BLANK',
        sourceBasis: 'FINISHED_PART',
        transformId: DE_BLANK,
        transformVersion: 1,
      };
    });
  // The sheets of a decor of the catalogue: its board variants by their price per sheet (508); a variant without one
  // (ЛМДФ) conditionally, by the rate per m²; a decor without a sheet of the corpus thickness — the formats of the card
  // at the averaged price of a sheet of the project (FINDINGS 1603).
  const decorFormats = (decorId: string, material: string) => {
    const decor = mfDecor(decorId, mc)!,
      own = Number.isFinite(boardRate(s)),
      rate = own ? boardRate(s) : C.boardRateRub.value,
      why = `цена листа декора ${mfLabel(decorId, mc)} не задана — условно по ставке плиты ${own ? 'изготовителя' : 'карты'} ${ru(rate)} ₽/м² × площадь листа (MOD-DEC-508)`;
    for (const b of decor.boardVariantsForImplementation) {
      const sheet = nonNegative(b.priceRub);
      formats.push({
        id: material === code ? b.variantId : `${material}|${b.variantId}`,
        material,
        thickness: b.thicknessMm,
        height: b.formatMm[0],
        width: b.formatMm[1],
        price: Number.isFinite(sheet) ? sheet : (rate * b.formatMm[0] * b.formatMm[1]) / C.sqMmPerSqM.value,
        source: b.sourceId,
        grain: 'Y',
        ...(Number.isFinite(sheet) ? { priceOrigin: 'CATALOG' as const } : { conditional: why }),
      });
    }
    if (!decor.boardVariantsForImplementation.some((b: Rec) => b.thicknessMm === m.t))
      for (const [height, width] of C.boardFormats.value) {
        const p = boardSheetPrice(decorId, m.t, height, width, mc)!;
        formats.push({ id: material + '-' + height + 'x' + width, material, thickness: m.t, height, width, price: p.rub, source: p.basis, grain: 'Y', priceOrigin: p.origin });
      }
  };
  const corpus = mfChoice('corpus', d);
  if (corpus) {
    formats.splice(0, formats.length, ...formats.filter((f) => f.material === 'HDF'));
    decorFormats(corpus.decorId, code);
  }
  for (const decorId of sideDecors) decorFormats(decorId, 'MF:' + decorId);
  // The sheets of the inserts: the formats of the card. The insert of the project's rate (`insertRate`) by the board of
  // the release (FINDINGS 1608); an insert of a rate of its own (the reference Lamarty of its snapshot, a material of a
  // leaf) or a format the release has not — by the rate of the insert per m² times the area, conditionally (MOD-DEC-508,
  // 512).
  const insert = ((m.sliding?.calc?.bom ?? []) as Rec[]).find((b) => b.role === 'insert'),
    insertT = (m.parts as Rec[]).find((p) => p.kind === 'slidingInsert' && !p.glass)?.T;
  if (insert && insertT !== undefined) {
    const rate = nonNegative(insert.rate),
      project = insert.priceObservation === slidingPrice.constants.insertRate.value.observation;
    for (const [height, width] of C.boardFormats.value) {
      const board = project ? releaseBoardOf(mc, 'LDSP', insertT, height, width) : null,
        common = { id: `${code}-INSERT-${height}x${width}`, material: code, thickness: insertT, height, width, grain: 'Y' as const };
      formats.push(
        board
          ? { ...common, price: board.priceRub, source: board.id, priceOrigin: 'CATALOG' }
          : {
              ...common,
              price: (rate * height * width) / C.sqMmPerSqM.value,
              source: insert.priceObservation ?? 'SLIDING_INSERT_RATE',
              conditional: `цена листа вставок ЛДСП ${insertT} мм не задана — условно по ставке вставки ${rate} ₽/м²${insert.priceStatus === 'CONDITIONAL_PRICE' ? ' (по аналогам, MOD-DEC-264)' : ''} × площадь листа (MOD-DEC-508, 512)`,
            },
      );
    }
  }
  return { profile: { id: s.card + '-CUT', sawRate: C.sawRateRub.value, formats }, parts };
}

/** Name of a part in the estimate: «КN · Name» (f14PartName r1.html:22599 with the short body of 53396). */
export function estimatePartName(p: Rec, m: Rec): string {
  const index = (m.modules || []).findIndex((x: Rec) => x.id === p.moduleId),
    name = String(p.name || p.kind || 'Деталь').replace(/^[A-Z0-9_-]+\s*[—–]\s*/u, '');
  return (index < 0 ? '' : `К${index + 1} · `) + name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The categories of C, the maker's cost before delivery, assembly and markup — the doors of a sliding wardrobe too
 * (MOD-DEC-402, FINDINGS 516); the bought ones are the supplier cost (028).
 */
const CATEGORIES_OF_C = ['ЛДСП', 'ХДФ', 'Готовые фасады', 'Кромление', 'Обработка', 'Фурнитура', 'Крепёж', 'Двери-купе'];
const BOUGHT = ['ЛДСП', 'ХДФ', 'Готовые фасады', 'Фурнитура', 'Крепёж', 'Двери-купе'];
/**
 * The price of a wardrobe model read back from the graph (`m` of wardrobeModelFromGraph with `m.material`), its
 * price snapshot, the cutting plan of the graph (`wardrobePriceCuttingPlan`) and the hardware catalogue of the
 * release, whose records hold the prices of the hardware (MOD-DEC-536): the one price function (WR-11). The sheets and
 * the saw run are those of the plan, the one cut of the service (MOD-DEC-505); the price of a sheet is its format in
 * the job.
 */
export function wardrobeModelPrice(m: Rec, s: WardrobePriceSnapshot, plan: CuttingPlan, hw: HardwareCatalogs): WardrobePrice {
  // MOD-DEC-483: the boards of the outer sides in a decor of their own — their sheets apart.
  // MOD-DEC-573: the doors made in the order from a board of a decor of their own (ЛДСП, ЛМДФ) — their sheets apart too.
  const d = { materialSelection: s.materialSelection },
    fspec = facadeChoice(d, m.t),
    facadeDecor = fspec && !fspec.purchased && fspec.decorId && fspec.decorId !== mfChoice('corpus', d)?.decorId ? fspec.decorId : null,
    chosen = new Set([...(['left', 'right'] as const).map((x) => mfSideChoice(x, d, hw.materials)?.decorId), facadeDecor].filter((x): x is string => !!x)),
    insertIds = new Set<string>(m.parts.filter((p: Rec) => p.kind === 'slidingInsert').map((p: Rec) => p.id)),
    sideDecor = (g: CuttingPlan['groups'][number]) => (g.material.family !== 'HDF' && chosen.has(g.material.decorId) && !g.material.partIds.every((id) => insertIds.has(id)) ? g.material.decorId : null),
    sideDecors = [...new Set(plan.groups.map(sideDecor).filter((x): x is string => !!x))],
    job = wardrobeCutJob(m, s, hw.materials, sideDecors),
    unsupported: string[] = [];
  // The prototype's Rastex selections and t3 hinge kits are not carried over: a project with them gets no price
  // instead of a wrong one (FINDINGS 314).
  if (s.eccentricSelections) unsupported.push('Эксцентриковые соединения требуют пересчёта');
  if (s.hingeKits) unsupported.push('Цена выбранной фурнитуры не задана: комплекты петель секций');
  const cut = plan,
    key = JSON.stringify([job, plan.policy, plan.kerfMm, plan.trimMm]),
    rows: PriceLine[] = [],
    rateErrors: string[] = [],
    unknownItems: string[] = [],
    push = (category: string, item: string, qty: number, unit: string, rate: unknown, origin: RateOrigin, detail: Partial<PriceLine> = {}) => {
      if (qty === 0) return;
      const r = nonNegative(rate);
      if (!Number.isFinite(qty) || !Number.isFinite(r)) {
        rateErrors.push('Не задано количество или тариф: ' + item);
        return;
      }
      // A found or conditional price of hardware and fasteners is a guide: its line is rounded up (346, 538); the
      // price the owner or the maker set is taken as it is (348).
      const step = detail.roundUpToRub ?? ((origin === 'TEMPORARY' || origin === 'CATALOG') && C.roundLine.value && ['Фурнитура', 'Крепёж'].includes(category) ? C.priceStepRub.value : undefined),
        amount = lineAmount(qty, r, step);
      rows.push({ category, item, qty, unit, customerUnitRate: r, amount, kopeks: Math.round(amount * 100), ...detail, origin, ...(step ? { roundUpToRub: step } : {}) });
    },
    sheetLine = (f: CutFormat, qty: number, title = f.material) =>
      push(f.material === 'HDF' ? 'ХДФ' : 'ЛДСП', `${title} · ${f.height} × ${f.width} × ${f.thickness} мм`, qty, 'плита', f.price, f.conditional ? 'TEMPORARY' : (f.priceOrigin ?? 'CATALOG'), { ...(f.conditional ? { conditional: f.conditional } : {}), note: LEFTOVERS_NOTES.sheet });
  // Boards: the groups of the plan, each with its lines, whatever another group did (WR-10). Only the parts of the job
  // are the boards of the price; the sheets of the inserts of the sliding leaves are the filling of the doors (512).
  let cutMeters = 0,
    largeCuts: { ids: string; meters: number; how: string }[] = [],
    filling = 0,
    fillingUnknown = false;
  // MOD-DEC-573 (FINDINGS 1617, 1619): the inserts in a decor chosen by material — of the facades (ЛДСП, ЛМДФ) or of a
  // leaf of its own — are named by it; a board without a price in the catalogue — «Цена не определена» (247), not the
  // rate of the insert of ЛДСП. The ЛМДФ has the rate of its sheet since FINDINGS 1606: its inserts of 10 mm, a board
  // its decor has not, by the rate of ЛМДФ.
  const insertChoices = new Map<string, string>([
    ...(fspec && !fspec.purchased && fspec.decorId ? [[fspec.decorId, fspec.materialId] as [string, string]] : []),
    ...(m.parts as Rec[]).filter((p) => p.kind === 'slidingInsert' && p.leafMaterialId && p.leafDecorId).map((p) => [p.leafDecorId, p.leafMaterialId] as [string, string]),
  ]);
  const cutErrors: string[] = [],
    boards = new Set<string>(job.parts.map((p) => p.id)),
    inserts = new Set<string>(m.parts.filter((p: Rec) => p.kind === 'slidingInsert').map((p: Rec) => p.id));
  for (const group of plan.groups) {
    if (!group.material.partIds.some((id) => boards.has(id))) continue;
    const before = rows.length;
    const own = sideDecor(group),
      insertGroup = group.material.partIds.every((id) => inserts.has(id)),
      insertDecor = insertGroup && insertChoices.has(group.material.decorId) ? group.material.decorId : null,
      insertMaterial = insertDecor ? facadeMaterialOf(hw.facades, insertChoices.get(insertDecor)) : null,
      material = group.material.family === 'HDF' ? 'HDF' : own ? 'MF:' + own : m.material,
      thickness = group.material.family === 'HDF' ? C.hdfThickness.value : group.material.thicknessMm,
      where = [material, thickness].join('|');
    // MOD-DEC-573: a board of the fronts without a price in the catalogue — «Цена не определена» (247), not the rate of
    // another board; the ЛМДФ has the price of its sheet since FINDINGS 1606.
    if (own && own === facadeDecor && facadeMaterialOf(hw.facades, fspec!.materialId)?.boardPrice !== 'AS_CARCASS') {
      unknownItems.push(`Цена не определена: ${fspec!.materialTitle} ${mfLabel(own, hw.materials)}, листов: ${group.sheets.length + group.tooLarge.length} (цены плиты в каталоге нет)`);
      cutMeters += group.cutLengthMm / 1000;
      continue;
    }
    if (insertDecor && insertMaterial?.boardPrice !== 'AS_CARCASS') {
      unknownItems.push(`Цена не определена: вставки створок ${insertMaterial?.title ?? insertChoices.get(insertDecor)} ${mfLabel(insertDecor, hw.materials)} ${thickness} мм, листов: ${group.sheets.length + group.tooLarge.length} (цены плиты в каталоге нет)`);
      cutMeters += group.cutLengthMm / 1000;
      fillingUnknown = true;
      continue;
    }
    const lmdfInsert = insertGroup && insertDecor && group.material.family === 'LMDF' && group.sheetMm ? boardSheetPrice(insertDecor, thickness, group.sheetMm[0], group.sheetMm[1], hw.materials, 'LMDF') : null,
      f: CutFormat | null | undefined = lmdfInsert
        ? { id: `${material}-INSERT-LMDF-${group.sheetMm!.join('x')}`, material, thickness, height: group.sheetMm![0], width: group.sheetMm![1], price: lmdfInsert.rub, source: lmdfInsert.basis, grain: 'Y', priceOrigin: lmdfInsert.origin }
        : group.sheetMm && job.profile.formats.find((x) => x.material === material && x.thickness === thickness && x.height === group.sheetMm![0] && x.width === group.sheetMm![1]);
    if (!f || !Number.isFinite(f.price)) {
      cutErrors.push('Не задан совместимый формат или тариф: ' + where);
      continue;
    }
    sheetLine(f, group.sheets.length, insertDecor ? `${mfLabel(insertDecor, hw.materials)} · вставки ${insertMaterial!.title}` : f.material);
    cutMeters += group.cutLengthMm / 1000;
    // A blank larger than the sheet (WR-10, FINDINGS 522): one whole sheet of the largest format each, conditionally
    // — it needs a larger format or a joint, which the maker decides.
    if (group.tooLarge.length) {
      const ids = group.tooLarge.map((t) => t.partId).join(', '),
        big = lmdfInsert ? f : job.profile.formats.filter((x) => x.material === material && x.thickness === thickness && Number.isFinite(x.price)).reduce((a, x) => (x.height * x.width > a.height * a.width ? x : a), f);
      push(f.material === 'HDF' ? 'ХДФ' : 'ЛДСП', `${f.material} · заготовка больше листа: ${ids}`, group.tooLarge.length, 'плита', big.price, 'TEMPORARY', {
        conditional: `заготовка ${ids} больше листа ${big.height} × ${big.width} мм: нужен больший формат или стык (решает мебельщик), условно — целый лист на заготовку`,
        note: LEFTOVERS_NOTES.sheet,
      });
      // R3-006 (FINDINGS 1786, (Д)): the whole sheet is cut too, as the plan cuts a sheet with one blank — the trim of
      // its edges and the two cuts of the blank; else a wider wardrobe, whose back no longer fits, was cheaper.
      for (const t of group.tooLarge) {
        const b = job.parts.find((p) => p.id === t.partId),
          [l, w] = [b?.height, b?.width].map((x) => (typeof x === 'number' && x > 0 ? x : 0)),
          mm = 2 * big.height + 2 * Math.max(0, big.width - 2 * plan.trimMm) + l + w;
        largeCuts.push({ ids: t.partId, meters: mm / 1000, how: `обрезка кромок листа ${big.height} × ${big.width} мм и два реза заготовки${l && w ? ` ${l} × ${w} мм` : ''}` });
      }
    }
    if (group.material.partIds.every((id) => inserts.has(id))) filling += rows.slice(before).reduce((n, r) => n + r.amount, 0);
  }
  // A part without its sawn blank cannot be cut: the boards are not known (as the prototype's cut said).
  for (const e of plan.excluded) if (e.reason.startsWith('пильная') && boards.has(e.partId)) cutErrors.push(`${e.partId}: ${e.reason}`);
  // A pane of glass of a sliding leaf is bought too, but it is a line of the kit of the doors (MOD-AI-30, 70).
  const purchased = new Set<string>(m.parts.filter((p: Rec) => mfPurchased(p) && p.kind !== 'slidingInsert').map((p: Rec) => p.id)),
    facade = mfChoice('facade', d),
    tariff = mfTariff(d, hw.materials);
  // A facade without a chosen execution: the rate of the project when it is not the prototype's demo tariff (as
  // before), else the tariff of the card — the cheapest of the materials catalogue (569, FINDINGS 1601).
  const projectFacadeRate = s.facadeFinish?.rate,
    card = projectFacadeRate === undefined || projectFacadeRate === null || projectFacadeRate === C.prototypeFacadeRub.value;
  for (const p of m.parts.filter((p: Rec) => purchased.has(p.id))) {
    // MOD-DEC-573: a facade of a chosen material is priced by its execution in the catalogue of the release.
    const own = facadeChoice(d, p.T);
    push(
      'Готовые фасады',
      estimatePartName(p, m) + ' · ' + (own ? facadeChoiceTitle(own) : facade ? (tariff?.source_label ?? 'исполнение не выбрано') : card ? 'исполнение не выбрано, тариф «Плёнка 16 мм»' : (s.facadeFinish?.code ?? 'W960')),
      (p.L * p.W * p.q) / C.sqMmPerSqM.value,
      'м²',
      own ? (own.thicknessMm === p.T ? facadeChoicePrice(own, hw.facades) : null) : facade ? (tariff?.thickness_mm === p.T ? tariff!.rate_rub_per_m2 : null) : card ? C.facadeTariffRub.value : projectFacadeRate,
      facade ? 'CATALOG' : card ? 'DECISION' : 'TEMPORARY',
      { partCount: p.q, areaPerPart: (p.L * p.W) / C.sqMmPerSqM.value, ...(facade || card ? {} : { conditional: 'тариф готового фасада проекта' }) },
    );
  }
  // The edge banding by the rate of the card of its class, the averaged price of the workshops (569, FINDINGS 1836).
  for (const e of m.edgeOperations.filter((e: Rec) => e.profileCode !== 'NONE' && !e.tariff.tariffNotFound && !purchased.has(e.partId))) {
    const rate = edgeRateOf(e.tariff);
    push('Кромление', e.partId + ' · ' + e.profileCode, e.meters, 'м', rate ?? e.tariff.pricePerM, rate === null ? 'CATALOG' : 'DECISION');
  }
  // WR-25: a part of quantity q is drilled and grooved q times, as the base price of the prototype counted it.
  const qty = new Map<string, number>(m.parts.map((p: Rec) => [p.id, p.q || 1])),
    holes = m.holes.filter((h: Rec) => !purchased.has(h.panel)),
    grooves = m.grooves.filter((g: Rec) => !purchased.has(g.panel)),
    count = (hs: Rec[]) => hs.reduce((n, h) => n + (qty.get(h.panel) ?? 1), 0);
  // A rate of the form is the maker's when the maker has set it, not the value of the prototype's form (509); else the
  // rate of the card, an averaged price of the project (569). The handle and the rod without an article price are
  // records of the catalogue (MOD-DEC-536): their number is the record's.
  const prices = catalogPrices(hw),
    formItems: Partial<Record<keyof WardrobeRates, string>> = { handlePrice: C.handleItem.value, rodPrice: C.rodItem.value },
    formRate = (field: keyof WardrobeRates): number => {
      const id = formItems[field];
      return id ? (prices.record(id)?.rub ?? NaN) : (C.formRates.value[field] ?? NaN);
    };
  // MOD-DEC-701 (FINDINGS 1855, (Д)): the H-profile of a seam of the back without a support goes with the HDF of the
  // back, by the metre of the seam — the averaged price of the project (569), a rate taken as it is (348).
  const hProfileM = ((m.backSeams ?? []) as Rec[]).filter((x) => !x.supportId).reduce((n, x) => n + (x.to - x.from) / 1000, 0);
  if (hProfileM) push('ХДФ', 'H-профиль задней стенки, ПВХ', hProfileM, 'м', backSplit.constants.hProfileRubPerM.value, 'DECISION');
  const formed = (category: string, item: string, n: number, unit: string, field: keyof WardrobeRates, detail: Partial<PriceLine> = {}) => {
    const own = makerRate(s.rates, field);
    if (n > 0 && Number.isNaN(own)) rateErrors.push(`Ставка изготовителя не число: ${item}`);
    else if (own !== null) push(category, item, n, unit, own, 'MAKER', detail);
    else if (Number.isNaN(formRate(field))) {
      if (n > 0) unknownItems.push(`Цена не определена: ${item.toLowerCase()} × ${n} ${unit}`);
    } else {
      // The handle and the rod of the catalogue are hardware: a guide of the catalogue, the line rounded up (346, 538).
      const id = formItems[field],
        p = id ? prices.record(id) : null;
      if (p) push(category, item, n, unit, p.rub, catalogOrigin(p), { ...(C.roundLine.value ? { roundUpToRub: C.priceStepRub.value } : {}), ...detail });
      else push(category, item, n, unit, formRate(field), 'DECISION', detail);
    }
  };
  formed('Обработка', 'Отверстия', count(holes.filter((h: Rec) => h.diameter !== 35)), 'шт', 'holePrice');
  // WR-27: every cup of a hinge is drilled and priced by the cup rate — one cup per hinge of the graph.
  formed('Обработка', 'Чашки петель', count(holes.filter((h: Rec) => h.diameter === 35)), 'шт', 'cupPrice');
  formed('Обработка', 'Пазы и четверти', grooves.reduce((n: number, g: Rec) => n + ((g.end - g.start) / 1000) * (qty.get(g.panel) ?? 1), 0), 'м', 'groovePrice');
  if (cutMeters) push('Обработка', 'Распил по последовательности резов', cutMeters, 'м реза', C.sawRateRub.value, 'DECISION');
  // The plan has no cut of a blank larger than the sheet (MOD-DEC-505): its saw run is a conditional line of its own,
  // as its whole sheet (WR-10).
  for (const x of largeCuts)
    push('Обработка', `Распил заготовки больше листа: ${x.ids}`, x.meters, 'м реза', C.sawRateRub.value, 'TEMPORARY', {
      conditional: `заготовки ${x.ids} нет в карте раскроя — условно ${x.how} (решает мебельщик)`,
    });
  // Hardware by the article of its graph mechanism (MOD-DEC-509, FINDINGS 830): the maker's rate of the form when the
  // maker has set it; else the price of the article in the hardware catalogue, a guide rounded up to 10 ₽ (346) —
  // a kit of the catalogue with a price of its own first, for the articles it holds (MOD-DEC-536, FINDINGS 992); else
  // the rate of the card, conditional: the article has no price of its own (569). The maker's hinge rate and the rate of the form are for a hinge with
  // its plate, as the one line of the prototype; a plate of a hinge priced by its article and without a price of its
  // own is «Цена не определена» (157, 247). FIT (MOD-DEC-480, FINDINGS 725): the rods and the handles of the fittings
  // are positions by article, priced by the records of the catalogue; the handles are those on the fronts, none for
  // «без ручек». The holders of the rods and the legs have no rate of the form: their lines are the catalogue's, in
  // place of the temporary rod support.
  const q: PriceQuantities = m.priceQuantities,
    fit: WardrobeFittings | undefined = m.fittings,
    articles: HardwareArticle[] = fit ? [...((m.hardwareArticles ?? []) as HardwareArticle[]).filter((a) => a.kind !== 'rod'), ...fittingsArticles(fit)] : (m.hardwareArticles ?? []),
    guide = C.roundLine.value ? C.priceStepRub.value : undefined,
    byArticle = (a: HardwareArticle) => (a.article ? prices.article(a.brand, a.article) : null),
    // MOD-DEC-544 (R2-007): an assembled drawer is priced by its kit in the catalogue only — the rate of a runner of the
    // form or of the maker is not the price of a kit; without a price of its own it is «Цена не определена».
    rateOf = (a: HardwareArticle) => (a.kind === 'drawerKit' ? null : makerRate(s.rates, KINDS[a.kind].rate)),
    formHinges = new Set(articles.filter((a) => a.kind === 'hinge' && !byArticle(a)).map((a) => a.catalogId)),
    priced = articles.filter((a) => a.article && rateOf(a) === null && byArticle(a)),
    cover = prices.cover(priced.map((a) => ({ brand: a.brand, article: a.article!, qty: a.qty }))),
    left = new Map(cover.rest.map((x) => [prices.identity(x), x.qty])),
    conditional = (p: ResolvedPrice) => (p.temporary ? { conditional: 'цена по аналогу — ' + p.basis } : {});
  for (const k of cover.kits) push('Фурнитура', `Комплект ${k.record.name}`, k.times, 'компл.', k.price.rub, catalogOrigin(k.price), { roundUpToRub: guide, ...conditional(k.price) });
  for (const a of articles) {
    const k = KINDS[a.kind],
      item = a.article ? `${k.name} ${a.brand} ${a.article}` : k.name,
      own = rateOf(a),
      price = byArticle(a),
      id = a.article ? prices.identity({ brand: a.brand, article: a.article }) : '',
      qty = priced.includes(a) ? Math.min(a.qty, left.get(id) ?? 0) : a.qty;
    if (priced.includes(a)) left.set(id, (left.get(id) ?? 0) - qty);
    if (a.qty > 0 && Number.isNaN(own)) rateErrors.push(`Ставка изготовителя не число: ${item}`);
    else if (own !== null) {
      if (a.kind !== 'plate') push('Фурнитура', item, a.qty, k.unit, own, 'MAKER');
    } else if (price) push('Фурнитура', item, qty, k.unit, price.rub, catalogOrigin(price), { roundUpToRub: guide, ...conditional(price) });
    else if (a.kind !== 'plate' && !a.article && formItems[k.rate] && prices.record(formItems[k.rate]!)) {
      // A handle or a rod without an article: the record of the catalogue the policy names (536), a guide (538).
      const p = prices.record(formItems[k.rate]!)!;
      push('Фурнитура', item, a.qty, k.unit, p.rub, catalogOrigin(p), { roundUpToRub: guide, ...conditional(p) });
    } else if (a.kind !== 'plate' && a.kind !== 'drawerKit' && !Number.isNaN(formRate(k.rate))) push('Фурнитура', item, a.qty, k.unit, formRate(k.rate), 'TEMPORARY', { conditional: `${a.article ? `цены артикула ${a.article} в каталоге нет — ` : ''}${FORM_RATE}` });
    else if (!formHinges.has(a.hingeId)) unknownItems.push(`Цена не определена: ${item} × ${a.qty} шт`);
  }
  const record = (category: string, item: string, n: number, id: string) => {
    const p = prices.record(id);
    if (p) push(category, item, n, 'шт', p.rub, catalogOrigin(p));
    else if (n > 0) unknownItems.push(`Цена не определена: ${item.toLowerCase()} × ${n} шт (в каталоге нет цены позиции ${id})`);
  };
  if (fit) {
    // The holders of the rods and the legs (FIT): by the record of their article in the catalogue (536).
    const byArticleLine = (item: string, n: number, brand: string, article: string, detail: Partial<PriceLine> = {}) => {
      const p = prices.article(brand, article);
      if (p) push('Фурнитура', item, n, 'шт', p.rub, catalogOrigin(p), { roundUpToRub: guide, ...conditional(p), ...detail });
      else if (n > 0) unknownItems.push(`Цена не определена: ${item.toLowerCase()} × ${n} шт (в каталоге нет цены артикула ${article})`);
    };
    const holders = new Map<string, { brand: string; qty: number }>();
    for (const r of fit.rods) holders.set(r.holderArticle, { brand: r.holderBrand, qty: (holders.get(r.holderArticle)?.qty ?? 0) + r.holders });
    for (const [article, h] of holders) byArticleLine(`Держатели штанги ${article}`, h.qty, h.brand, article);
    for (const l of fit.legs) byArticleLine(`Ножки ${l.article} · ${l.moduleId}`, l.quantity, l.brand, l.article, l.temporary ? { conditional: l.temporary } : {});
    // The clips of a decorative plinth on the legs of its front row (MOD-DEC-483).
    for (const l of fit.legs) if (l.clips) byArticleLine(`Клипсы цоколя ${l.clips.article} · ${l.moduleId}`, l.clips.quantity, l.clips.brand, l.clips.article);
    // The lights of the sections by article and their power supply (MOD-DEC-483); the cables come with the light, the
    // distributors their plugs go into are bought apart (FINDINGS 3422).
    const lit = new Map<string, { brand: string; lengthMm: number; qty: number }>();
    for (const l of fit.lights) lit.set(l.article, { brand: l.brand, lengthMm: l.lengthMm, qty: (lit.get(l.article)?.qty ?? 0) + 1 });
    for (const [article, l] of lit) byArticleLine(`Светильники ${article} · ${l.lengthMm} мм`, l.qty, l.brand, article);
    const ps = fit.powerSupply;
    if (ps) byArticleLine(`Блок питания подсветки ${ps.article} · ${ps.loadW} Вт`, ps.quantity, ps.brand, ps.article);
    if (ps?.distributor) byArticleLine(`Распределитель подсветки ${ps.distributor.article}`, ps.distributor.quantity, ps.distributor.brand, ps.distributor.article);
    // The mains cord of a supply sold without one (FINDINGS 3425).
    if (ps?.mainsCord) byArticleLine(`Сетевой шнур блока питания ${ps.mainsCord.article}`, ps.mainsCord.quantity, ps.mainsCord.brand, ps.mainsCord.article);
    // The latches of the doors opened by pressing, by article (MOD-DEC-485).
    const latch = new Map<string, { brand: string; qty: number }>();
    for (const l of fit.pushLatches) latch.set(l.article, { brand: l.brand, qty: (latch.get(l.article)?.qty ?? 0) + 1 });
    for (const [article, l] of latch) byArticleLine(`Толкатели ${article}`, l.qty, l.brand, article);
    // The baskets, trouser racks and pantographs of the sections by article (MOD-DEC-484); their screws come in the kit.
    const kept = new Map<string, { brand: string; kind: string; qty: number }>();
    for (const x of fit.storage) kept.set(x.article, { brand: x.brand, kind: STORAGE_KIND_RU[x.kind], qty: (kept.get(x.article)?.qty ?? 0) + 1 });
    for (const [article, x] of kept) byArticleLine(`${x.kind} ${article}`, x.qty, x.brand, article);
  } else {
    // Without the fittings (a model of the prototype): the handles have no article (FINDINGS 835), the rate of the
    // form; the rod supports — the record of the catalogue with the prototype's number (536).
    formed('Фурнитура', 'Ручки', q.handles, 'шт', 'handlePrice');
    record('Фурнитура', 'Опоры штанги', q.rods * C.rodSupportsPerRod.value, C.rodSupportItem.value);
  }
  record('Фурнитура', 'Полкодержатели', q.shelfPins, C.shelfPinItem.value);
  // Fasteners: those of the joints of the graph, what the places of fixing of the production pack name (MOD-DEC-507,
  // FINDINGS 810) — the prototype counted its connections (r1.html:12784) and missed the confirmats of the fixed
  // shelves of the r7 plan and the dowels of the plinth rails and of the narrow joints. r7 fasteners (r1.html:88298),
  // MOD-DEC-293: the body of the eccentric at the body rate, the stem by its article; the confirmat kit of a joint
  // (MAKMART_S16, S19, S22) is a confirmat of the line «Конфирматы», not a second charge (FINDINGS 523). The prices are
  // the records of the catalogue, its kits with a price of their own first (MOD-DEC-536).
  const f: JointFasteners = m.jointFasteners,
    r7 = m.fastenersR7,
    sources: Rec = { rates: 'ставки изготовителя проекта', card: `${s.card}+${hw.release.version}` };
  record('Крепёж', 'Конфирматы', f.confirmats, C.confirmatItem.value);
  let snapshotId = '';
  const before = rows.length;
  if (r7) {
    const parts = new Map<string, number>(),
      unknown = new Map<string, number>(),
      add = (map: Map<string, number>, k: string, n: number) => map.set(k, (map.get(k) ?? 0) + n),
      bodyIds: readonly string[] = C.eccentricBodies.value,
      stemIds: readonly string[] = C.eccentricStems.value;
    for (const k of r7.kits) {
      if (isConfirmatProfile(k.profileId)) continue;
      if (!k.components) add(unknown, 'комплект ' + k.profileId, k.qty ?? 1);
      for (const [a, n] of Object.entries((k.components ?? {}) as Record<string, number>)) add(prices.article(null, a) ? parts : unknown, a, n * (k.qty ?? 1));
    }
    const fixings = prices.cover([...parts].map(([article, qty]) => ({ brand: null, article, qty })));
    for (const k of fixings.kits) push('Крепёж', `Комплект ${k.record.name}`, k.times, 'компл.', k.price.rub, catalogOrigin(k.price));
    const order = (a: string) => (bodyIds.includes(a) ? 0 : stemIds.includes(a) ? 1 : 2);
    for (const x of [...fixings.rest].sort((a, b) => order(a.article) - order(b.article))) {
      const p = prices.article(null, x.article)!,
        name = bodyIds.includes(x.article) ? 'Корпус эксцентрика Rastex 15' : stemIds.includes(x.article) ? 'Шток эксцентрика' : 'Крепёж';
      push('Крепёж', `${name} · арт. ${x.article}`, x.qty, 'шт', p.rub, catalogOrigin(p));
    }
    for (const [a, n] of unknown) unknownItems.push(`Цена не определена: ${a} × ${n} шт`);
    snapshotId = contentDigest([r7.kits, r7.woodItems]);
  }
  // Wooden dowels by size: the record of the catalogue the policy names for the size; an unknown size is not a zero
  // (247); 8×30 has no article yet, its price is by analogue (264).
  const dowelItems: Readonly<Record<string, string>> = C.dowelItems.value;
  for (const [size, n] of Object.entries(f.dowels)) {
    const name = `Шкант ${size.replace('X', '×')}`,
      id = dowelItems[size],
      item = id ? hw.articles.items.find((x) => x.id === id) : undefined,
      p = id ? prices.record(id) : null;
    if (!p) unknownItems.push(`Цена не определена: ${name.toLowerCase()} × ${n} шт`);
    else push('Крепёж', item?.article ? `${name} · арт. ${item.article}` : name, n, 'шт', p.rub, catalogOrigin(p), item?.article ? {} : { conditional: p.basis });
  }
  // MOD-DEC-701 (FINDINGS 1855, (Д)): the screws of the parts of the back on their supports, by the record of the catalogue.
  if (f.backScrews) record('Крепёж', 'Саморезы задней стенки 3,5 × 16', f.backScrews, backSplit.constants.seamScrewItem.value);
  const knownFastenerSubtotalRub = r7 ? round2(rows.slice(before).reduce((t, x) => t + x.amount, 0)) : undefined;
  // Lifts of the fronts opening upwards (task LIFT, MOD-DEC-320): a kit at the price of its catalogue row; an unknown
  // price is not zero (247) — the cost C stays unknown and the line names the article.
  for (const x of m.liftMechanisms ?? []) {
    if (typeof x.priceRub === 'number') push('Фурнитура', `Подъёмник ${x.article} · ${x.sectionId}`, x.quantity, 'компл.', x.priceRub, 'CATALOG');
    else unknownItems.push(x.article ? `Цена подъёмника не определена: ${x.article}` : `Подъёмник ${x.sectionId} не подобран: цена не определена`);
  }
  if (m.liftMechanisms?.length) snapshotId = contentDigest([snapshotId, m.liftMechanisms.map((x: Rec) => [x.id, x.article, x.quantity, x.priceRub])]);
  // The sliding doors (task W9.3, r1.html:63557 with 84940): the priced lines of the kit are part of the cost C, so the
  // assembly and the maker's markup are charged on them too (MOD-DEC-402; the prototype put them after the services,
  // outside C — FINDINGS 516). A line of the kit without a price leaves C unknown. The processing and the mounting of
  // the doors are the assembly's, 14 % of C (MOD-DEC-569, 402; FINDINGS 1205), as the works of a worktop (437).
  const sc = m.sliding?.calc,
    doors = sc?.status === 'CANDIDATE' ? slidingQuote(sc) : null,
    doorGaps = doors?.gaps ?? 0,
    doorAmount = doors ? round2(doors.lines.reduce((n, r) => n + r.amount, 0)) : 0;
  if (doors) rows.push(...doors.lines);
  // Services and markup (MOD-DEC-285 second stage, MOD-DEC-402, FINDINGS 520): assembly and markup are percents of
  // the cost C, all the parts and materials; delivery is the maker's rate. A percent of an unknown C is unknown. The
  // delivery, assembly and markup fields of the prototype's form are not read: their units and values are not the
  // owner's rule (FINDINGS 520).
  const base = round2(rows.reduce((n, r) => n + r.amount, 0)),
    complete = !rateErrors.length && !cutErrors.length && !unknownItems.length && !unsupported.length && !doorGaps;
  push('Услуги', 'Доставка', 1, 'усл.', C.deliveryRub.value, 'DECISION');
  if (complete) {
    push('Услуги', `Сборка · ${C.assemblyPercent.value}% от C`, 1, 'усл.', round2((base * C.assemblyPercent.value) / 100), 'DECISION');
    push('Наценка изготовителя', `Наценка изготовителя · ${C.markupPercent.value}% от C`, 1, 'усл.', round2((base * C.markupPercent.value) / 100), 'DECISION');
  }
  const percents = complete ? [] : [`Сборка ${C.assemblyPercent.value}% и наценка изготовителя ${C.markupPercent.value}% от C: C неизвестна`];
  const ready = complete,
    status: PriceStatus = ready ? 'PROVISIONAL_ESTIMATE' : !rateErrors.length && !cutErrors.length && !unsupported.length ? 'PARTIAL' : 'BLOCKED',
    missing = [...rateErrors, ...unknownItems, ...percents, 'Правила оптимизации раскроя уточняет мебельщик', 'Номинальное вычитание выбранной кромки; технологические припуски не квалифицированы', ...cutErrors, ...unsupported, ...(doors?.missing ?? [])],
    temporary = [...new Set(rows.filter((x) => x.origin === 'TEMPORARY').map((x) => `${x.item}: ${x.customerUnitRate} ₽/${x.unit}${x.conditional ? ' — ' + x.conditional : ' — временная ставка'}`))],
    assumptions = [
      'Предварительный расчёт: ставки изготовителя проекта',
      'Фурнитура — по артикулу механизма графа и ценам каталога фурнитуры, комплекты каталога первыми; обработка и фурнитура без цены артикула — по ставкам карты, усреднённым ценам проекта, пока изготовитель не задал свои (MOD-DEC-509, 536, 569)',
      'Целые листы по найденной карте; не доказанный глобальный оптимум',
      `База C — себестоимость, все детали и материалы, без доставки, сборки и наценки; сборка ${C.assemblyPercent.value}% и наценка ${C.markupPercent.value}% от C (MOD-DEC-402); доставка ${C.deliveryRub.value} ₽`,
      'Покупные готовые фасады включают их кромление и обработку',
      'Найденные и условные цены фурнитуры — ориентир: строка сметы округлена вверх до 10 ₽ (MOD-DEC-346)',
      'Rastex: 20 ₽ — корпус эксцентрика, шток — отдельной строкой по артикулу (MOD-DEC-293)',
      ...(doors ? [...doors.assumptions, `Двери-купе входят в C; обработка и монтаж дверей входят в сборку ${C.assemblyPercent.value}% от C (MOD-DEC-402, 569)`] : []),
    ];
  snapshotId = contentDigest([key, rows, s.rates, s.card, hw.release.sha256, snapshotId]);
  // Material selection (r1.html:58690).
  if (s.materialSelection) {
    if (tariff) {
      sources.finishedFacades = { ...hw.materials.facadePrice.source, tariffId: tariff.id };
      assumptions.push(hw.materials.facadePrice.usage.estimateLimit, 'HOLZCOM: ориентировочный тариф готового фасада; точный цвет подбирается отдельно. Минимум заказа поставщику 15 000 ₽ не начислен; доплата 1800 ₽ не активна.');
    }
    snapshotId = contentDigest([snapshotId, s.materialSelection]);
  }
  if (doors) snapshotId = contentDigest([snapshotId, m.sliding.config, sc.bom]);
  const sum = (...categories: string[]) => round2(rows.filter((x) => categories.includes(x.category)).reduce((n, x) => n + x.amount, 0)),
    knownAmount = rows.reduce((n, x) => n + x.kopeks, 0) / 100,
    amount = ready ? knownAmount : null,
    internalCost = ready ? sum(...CATEGORIES_OF_C) : null,
    costs = {
      boardCost: sum('ЛДСП'),
      hdfCost: sum('ХДФ'),
      facadeCost: sum('Готовые фасады'),
      edgeCost: sum('Кромление'),
      processingCost: sum('Обработка'),
      hardwareCost: sum('Фурнитура', 'Крепёж'),
      production: sum(...CATEGORIES_OF_C),
      extras: sum('Услуги', 'Наценка изготовителя'),
      customer: amount,
      calculationStatus: status,
      priceSnapshotId: snapshotId,
      // The doors of a sliding wardrobe (r1.html:59661, 84895): none chosen — zeros; the processing is never priced.
      ...(m.sliding
        ? sc?.status === 'NO_DOORS'
          ? { slidingSystem: 0, slidingFilling: 0, slidingProcessing: null }
          : // The filling is the sheets of the inserts (MOD-DEC-512), not the area of the kit.
            // The system is the lines of the kit, the profiles by whole bars (MOD-DEC-520), not the net metres of the kit.
            { slidingSystem: doors && !doorGaps ? doorAmount : null, slidingFilling: sc?.status === 'CANDIDATE' && !fillingUnknown ? round2(filling) : null, slidingProcessing: null }
        : {}),
    };
  return {
    snapshotId,
    version: WARDROBE_PROTOTYPE_VERSION,
    amount,
    knownAmount,
    supplierCost: ready ? sum(...BOUGHT) : null,
    internalCost,
    customerPrice: amount,
    currency: 'RUB',
    status,
    demo: true,
    finalPrice: false,
    material: s.material,
    materialCode: m.material,
    lines: rows,
    missing,
    temporary,
    assumptions,
    sources,
    cut,
    costs,
    ...(r7 ? { knownFastenerSubtotalRub, hardwareTotalRub: ready ? sum('Фурнитура', 'Крепёж') : null } : {}),
    ...(doors ? { sliding: { systemAmount: doorGaps ? null : doorAmount, knownSystemSubtotal: doorAmount, fillingAmount: fillingUnknown ? null : round2(filling), processingAmount: null, bom: sc.bom, bars: doors.bars } } : {}),
  };
}

/** Names of the lines of the kit without an article (three tracks: the guides are not chosen). */
const SLIDING_ROLE_NAME: Rec = { upper_track: 'верхней направляющей', lower_track: 'нижней направляющей' };

/** The lines of the kit cut from bars of the system: the profiles of the leaves and the guides (MOD-DEC-520). */
const BAR_ROLES = new Set(['vertical', 'upper_frame', 'lower_frame', 'upper_track', 'lower_track']);

/** The bars of one profile of the doors: its lines of the kit and their pieces on whole bars. */
export interface SlidingProfileBars {
  article: string;
  /** The roles of the kit cut from these bars. */
  roles: string[];
  cutting: BarCutting;
}

const decimal = (n: number, digits = 2) => String(Math.round(n * 10 ** digits) / 10 ** digits).replace('.', ',');
const lengthOf = (b: Rec): number => Math.round((typeof b.lengthMm === 'number' ? b.lengthMm : (b.qty * 1000) / b.pieces) * 1000) / 1000;

/**
 * The profiles of the doors on whole bars (MOD-DEC-520): the pieces of every line of the kit cut from bars — the
 * leaves' verticals and frames, the guides — by article, on bars of the length of the system's catalogue (ARISTO —
 * 5400 mm), with the kerf of the policy. The kit (`sliding.calc`, as the prototype) counts their net metres.
 */
export function slidingProfileBars(calc: Rec): SlidingProfileBars[] {
  const groups = new Map<string, Rec[]>();
  for (const b of (calc?.bom ?? []) as Rec[]) {
    if (!BAR_ROLES.has(b.role) || !b.article || !(b.stockLengthMm > 0) || !(b.pieces > 0) || !(b.qty > 0)) continue;
    const key = `${b.article}|${b.stockLengthMm}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.values()].map((lines) => ({
    article: lines[0]!.article,
    roles: lines.map((b) => b.role),
    cutting: barCutting(
      lines.flatMap((b) => Array.from({ length: b.pieces }, (_, i) => ({ id: `${b.role}-${i + 1}`, lengthMm: lengthOf(b) }))),
      lines[0]!.stockLengthMm,
      slidingPrice.constants.profileKerfMm.value,
    ),
  }));
}

/**
 * The lines of the doors in the quote (r1.html:63557): one line per priced line of the kit, category «Двери-купе».
 * The profiles are bought by whole bars of their plan (MOD-DEC-520; the prototype priced the net metres, FINDINGS
 * 510): one line per article, the bars × the rate per metre × the length of the bar, with what the bars leave (511).
 * The inserts are not a line of the kit: the maker cuts them from whole sheets, the sheets are on the cutting plan of
 * the price (MOD-DEC-512; the prototype priced their area, FINDINGS 513). A conditional price is marked in the line and
 * named in what is missing (MOD-DEC-264).
 */
export function slidingQuote(calc: Rec): { lines: PriceLine[]; missing: string[]; assumptions: string[]; gaps: number; bars: SlidingProfileBars[] } {
  const bom: Rec[] = (calc.bom ?? []).filter((b: Rec) => b.role !== 'insert'),
    bars = slidingProfileBars(calc),
    barOf = new Map(bars.flatMap((g) => g.roles.map((r) => [r, g] as const))),
    conditional = bom.filter((b) => b.amount !== null && b.priceStatus === 'CONDITIONAL_PRICE'),
    // A pane of glass is named by its kind and size, its film by its title: their articles are ids of the policy (MOD-AI-30, 70).
    name = (b: Rec) => (b.role === 'glass' ? `${b.title} ${b.height} × ${b.width} мм` : b.role === 'glass_film' ? b.title : b.article || 'Позиция ' + b.role),
    lines: PriceLine[] = [],
    missing: string[] = [],
    done = new Set<SlidingProfileBars>();
  let gaps = 0;
  for (const b of bom) {
    const isConditional = b.priceStatus === 'CONDITIONAL_PRICE',
      marks = {
        // The snapshot of the door system and a found price are prices of the catalogue; a price by analogue is temporary (W11).
        origin: (isConditional ? 'TEMPORARY' : 'CATALOG') as RateOrigin,
        ...(isConditional ? { conditional: 'цена по аналогам (MOD-DEC-264)' } : {}),
      },
      g = barOf.get(b.role);
    if (b.amount === null) {
      missing.push('Цена ' + (b.article || SLIDING_ROLE_NAME[b.role] || b.role));
      gaps++;
      continue;
    }
    if (!g) {
      lines.push({ category: 'Двери-купе', item: name(b) + (isConditional ? ' · цена условная' : ''), qty: b.qty, unit: b.unit, amount: b.amount, customerUnitRate: b.rate, kopeks: Math.round(b.amount * 100), ...marks });
      continue;
    }
    if (done.has(g)) continue;
    done.add(g);
    const c = g.cutting,
      metres = c.stockMm / 1000;
    if (c.tooLong.length) {
      missing.push(`Профиль ${g.article}: отрезок длиннее хлыста ${decimal(metres, 3)} м (${c.tooLong.map((p) => p.id).join(', ')}) — нужен стык или хлыст длиннее, решает мебельщик`);
      gaps++;
      continue;
    }
    const rate = round2(b.rate * metres),
      amount = round2(c.bars.length * rate);
    lines.push({
      category: 'Двери-купе',
      item: `${g.article} · хлысты ${decimal(metres, 3)} м` + (isConditional ? ' · цена условная' : ''),
      qty: c.bars.length,
      unit: 'хлыст',
      amount,
      customerUnitRate: rate,
      kopeks: Math.round(amount * 100),
      ...marks,
      // MOD-DEC-511: the leftovers of a past order can make it cheaper; what each bar leaves — on «Раскрой» (FINDINGS 862).
      note: LEFTOVERS_NOTES.bar,
    });
  }
  if (conditional.length) missing.push('Цены условные, по аналогам: ' + [...new Set(conditional.map(name))].join(', '));
  return {
    lines,
    missing,
    assumptions: [
      'Дверная система: ставки снимка 21.09.2026 только для известных позиций; полная цена не подтверждена.',
      `Профили дверей — целыми хлыстами по раскрою (MOD-DEC-520), пропил ${decimal(slidingPrice.constants.profileKerfMm.value, 1)} мм на отрезок`,
    ],
    gaps,
    bars,
  };
}

/** The price of a wardrobe graph and its price snapshot. */
export function wardrobePrice(g: Graph, hw: HardwareCatalogs, s: WardrobePriceSnapshot): WardrobePrice {
  const m = wardrobeModelFromGraph(g, hw);
  m.material = s.material;
  return wardrobeModelPrice(m, s, wardrobePriceCuttingPlan(g, hw), hw);
}

/** A price note for the customer (t4PriceNote, r1.html:11251 and 86028). */
export const priceNote = (text: string): string => text.replace(/TECH(?:[-_][A-Z0-9]+)+/g, 'технологических правил').replace(/\bHOLD\b/g, 'ограничение производственного выпуска');

/** Rubles as the prototype prints them (f13Rub, r1.html:22492): kopecks unless a decor is chosen. */
export function rub(n: number, materialSelection: unknown): string {
  const digits = materialSelection ? 0 : 2;
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' ₽';
}

/**
 * The whole rubles of the lines of an estimate shown without kopecks, adding up to the whole rubles of their total
 * (R2-015, MOD-DEC-735): each line is rounded down, the rubles left go to the lines with the most kopecks (the largest
 * remainder). A line differs from its exact amount by less than 1 ₽; the shown lines, their groups and the total
 * `rub(sum)` add up, where rounding each line and the total apart could miss by 1–2 ₽. Pure.
 */
export function wholeRubles(amounts: readonly number[]): number[] {
  const kopeks = amounts.map((a) => Math.round(a * 100)),
    floors = kopeks.map((k) => Math.floor(k / 100)),
    total = Math.round(kopeks.reduce((n, k) => n + k, 0) / 100);
  let left = total - floors.reduce((n, r) => n + r, 0);
  // The largest kopecks first; equal ones in their order, so the same lines give the same rubles.
  const order = kopeks.map((k, i) => ({ i, rest: k - floors[i]! * 100 })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]!++;
    left--;
  }
  return floors;
}

/**
 * The amounts of the lines as the estimate shows them (f13Rub): with kopecks — as they are; in whole rubles (a decor
 * chosen) — by `wholeRubles`, so the shown lines, their sums and the total `rub(sum)` add up (R2-015, MOD-DEC-735).
 */
export const shownAmounts = (amounts: readonly number[], materialSelection: unknown): number[] => (materialSelection ? wholeRubles(amounts) : [...amounts]);

/**
 * v17DisplayNumber's line text: «qty unit × rate ₽/unit = amount ₽» (v17LineCalculation, r1.html:54606); a line of a
 * found or conditional hardware price says it is rounded up to 10 ₽ (MOD-DEC-346), a conditional line says why.
 */
function lineCalculation(r: PriceLine): string {
  const exact = Math.round(r.qty * r.customerUnitRate * 100) / 100,
    sum = r.roundUpToRub ? `${exact.toFixed(2)} ₽ → ${r.amount.toFixed(2)} ₽ (ориентир: строка округлена вверх до ${r.roundUpToRub} ₽)` : `${r.amount.toFixed(2)} ₽ (сумма округлена до копеек)`;
  return `${r.partCount != null ? 'Площадь одной детали: ' + r.areaPerPart + ' м² × ' + r.partCount + ' шт. = ' + r.qty + ' м². ' : ''}${r.qty} ${r.unit} × ${r.customerUnitRate} ₽/${r.unit} = ${sum}.${r.origin === 'TEMPORARY' ? ' Цена условная.' : ''}`;
}

/**
 * quote.txt of the prototype (r1.html:54677 with the composition note of 58081) for a model and its price. The note of
 * a run of lines (the whole sheets, MOD-DEC-511) follows its last line.
 */
export function wardrobeQuoteText(m: Rec, p: WardrobePrice, materialSelection: unknown): string {
  const text =
      `MODULERO ${p.version}\nПредварительная смета ${p.snapshotId}\n${p.amount === null ? 'Расчёт не завершён / требуется уточнение' : rub(p.amount, materialSelection)}\n` +
      p.lines.map((r, i) => `${r.item}: ${lineCalculation(r)}` + (r.note && p.lines[i + 1]?.note !== r.note ? '\nПояснение: ' + r.note : '')).join('\n') +
      '\n' +
      p.missing.map(priceNote).join('; ') +
      (p.temporary.length ? '\nУсловные цены (временные ставки, уточняет владелец): ' + p.temporary.join('; ') : '') +
      '\nПроизводственную карту и итоговую цену уточняет мебельщик.',
    names = (m.composition?.excluded || []).filter((x: Rec) => !x.orphan).map((x: Rec) => x.name);
  return text + (names.length ? '\nИсключено из текущей конструкции: ' + names.join('; ') + '.\nЖёсткость и крепление проверить.' : '');
}
