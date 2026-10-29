// Production data of "other furniture" (R5-007, MOD-DEC-710): the status of the version, the production package, the
// estimate as TXT and JSON and the archive of all output data of one graph — on the code of the wardrobe's package
// (engine/production.ts, wardrobe/production.ts), not a copy of it. The home adds only what its graph does not hold:
// the invariant context of its outputs, the verdict of its price and the priced lines of its hardware.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { bazisFiles } from '../engine/bazis-export.js';
import { cadFiles } from '../engine/cad-export.js';
import type { Graph } from '../engine/contract.js';
import type { CuttingPlan } from '../engine/cutting.js';
import { checkInvariants } from '../engine/invariants/index.js';
import { cuttingFiles, manufactureReadiness, productionKitZip, productionPackageOf, type KitLine, type ManufactureReadiness, type ProductionPackage } from '../engine/production.js';
import { wardrobePriceCuttingPlan } from '../wardrobe/cutting-plan.js';
import { rateNamesOf, templatesR5 } from './catalog.js';
import { homeEngineGraph } from './engine.js';
import { joinery } from './joinery.js';
import { csv, HINGE_SCREWS_INCLUDED_NOTE, parts, visualParts } from './outputs.js';
import { isHardwareRow, price } from './price.js';
import type { HomeProject, PriceResult } from './types.js';

/** What the price waits for besides the rates, as the editor says it. */
const MISSING: Record<string, string> = {
  rateNote: 'источник ставок',
  rateDate: 'дата ставок',
  hingeScrewSupply: 'отметка, входят ли саморезы в ставку петли',
};

/** A missing key of the price as the user reads it: the name of its rate, never the key of the code (X-02). */
export function homeMissingText(p: HomeProject, key: string): string {
  if (MISSING[key]) return MISSING[key];
  if (key.startsWith('sheet:LMDF|')) return 'цена листа ЛМДФ фасадов';
  const names = rateNamesOf(p);
  return names[key] ?? names[key.split(':')[0]] ?? 'ставка';
}

/** The name of the product in its files: the template and the name the user gave it. */
export const homeTitle = (p: HomeProject) => `Modulero · ${templatesR5.find((t) => t.id === p.templateId)?.name ?? 'мебель для дома'}`;

const rubText = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0 }) + ' ₽';

/**
 * The status of the version (RELEASE_1_SCOPE §4.2) of other furniture: the invariant library on its graph with the
 * projections of its outputs, and the verdict of its price — complete when the total is known (MOD-DEC-247), the
 * temporary prices said as conditional (508).
 */
export function homeReadiness(p: HomeProject, hw: HardwareCatalogs, g: Graph = homeEngineGraph(p, hw), pr: PriceResult = price(p, hw)): ManufactureReadiness {
  const drill = joinery(p, hw),
    invariants = checkInvariants(g, {
      projections: {
        cutList: parts(p, hw).map((a) => ({ partId: a.id, lengthMm: a.cutLength, widthMm: a.cutWidth })),
        // The handles and the legs are bought hardware, no parts of the graph (MOD-DEC-516).
        scenePartIds: visualParts(p, hw)
          .filter((v) => v.role !== 'handle' && v.role !== 'leg')
          .map((v) => v.id),
        drillingOperationIds: drill.boards.flatMap((b) => b.holes).filter((x) => x.depthMm > 0).map((x) => x.id),
      },
    });
  return manufactureReadiness(g, {
    invariants,
    price: { complete: pr.total !== null, unknown: pr.total === null ? pr.missing.map((k) => homeMissingText(p, k)) : [], conditional: pr.temporary ?? [] },
  });
}

/**
 * The lines of the hardware and the fasteners of the estimate — the rows the price itself counts as hardware
 * (`isHardwareRow`: the legs and the joints too) — with their price as the estimate gives it; the quantity is of its rate.
 */
export function homeKit(pr: PriceResult): KitLine[] {
  return pr.rows
    .filter(isHardwareRow)
    .map((r) => ({ group: 'Фурнитура', item: r.label, qty: r.quantity, unit: '', price: r.amount === null ? 'Цена не определена' : rubText(r.amount) + (r.origin === 'TEMPORARY' ? ' · условная' : '') }));
}

/** The plan of the sheets the price is counted by (MOD-DEC-510): the maps of the package and of the archive. */
export const homeCuttingPlan = (g: Graph, hw: HardwareCatalogs): CuttingPlan | null => {
  const plan = wardrobePriceCuttingPlan(g, hw);
  return plan.groups.some((x) => x.sheets.length) ? plan : null;
};

/** The production package of other furniture: one graph, its outputs, its status and the maps of its sheets. */
export function homeProductionPackage(p: HomeProject, hw: HardwareCatalogs, opts: { appVersion?: string; graph?: Graph } = {}): ProductionPackage {
  const g = opts.graph ?? homeEngineGraph(p, hw),
    pr = price(p, hw);
  return productionPackageOf(g, {
    readiness: homeReadiness(p, hw, g, pr),
    title: homeTitle(p),
    appVersion: opts.appVersion,
    kit: homeKit(pr),
    kitNotes: [
      'Цены фурнитуры — ориентир: у поставщиков цены разные, строка сметы округлена вверх до 10 ₽ (MOD-DEC-346, 538).',
      ...(pr.total === null ? pr.missing.map((k) => 'Не определено: ' + homeMissingText(p, k)) : []),
      ...(pr.temporary?.length ? ['Временные цены: ' + pr.temporary.join('; ')] : []),
    ],
    cutting: homeCuttingPlan(g, hw),
  });
}

/** The estimate of the version as the user reads it: every line, the total or the known part, the source of the rates. */
export interface HomeQuote {
  schema: 'modulero.home-quote/1';
  product: string;
  revision: string;
  status: PriceResult['status'];
  /** The total; null while a price is unknown (never a zero for it, MOD-DEC-247). */
  total: number | null;
  /** The sum of the lines whose price is known (R5-004). */
  knownPart: number;
  missing: string[];
  /** `roundUpToRub`: the line of the hardware by a price of the service is rounded up to whole 10 ₽ (MOD-DEC-538, 346), said in the text (R5-005). */
  lines: { item: string; quantity: number; rate: number | null; amount: number | null; origin: string; basis: string; roundUpToRub?: number }[];
  rateNote: string;
  rateDate: string;
  currency: 'RUB';
}

/** The estimate of the version as data: the same numbers as «Стоимость» shows. */
export function homeQuote(p: HomeProject, hw: HardwareCatalogs, g: Graph = homeEngineGraph(p, hw)): HomeQuote {
  const pr = price(p, hw);
  return {
    schema: 'modulero.home-quote/1',
    product: homeTitle(p),
    revision: g.revision.projectRevisionId,
    status: pr.status,
    total: pr.total,
    knownPart: Math.round(pr.rows.reduce((s, r) => s + (r.amount ?? 0), 0) * 100) / 100,
    missing: pr.missing.map((k) => homeMissingText(p, k)),
    lines: pr.rows.map((r) => ({ item: r.label, quantity: r.quantity, rate: r.rate, amount: r.amount, origin: r.origin ?? 'MAKER', basis: r.basis ?? '', ...(r.roundUpToRub ? { roundUpToRub: r.roundUpToRub } : {}) })),
    rateNote: (p.rateNote || '').replace(HINGE_SCREWS_INCLUDED_NOTE, '').trim(),
    rateDate: p.rateDate || '',
    currency: 'RUB',
  };
}

/**
 * The sum of a line of the estimate as text. A line rounded up to whole 10 ₽ (MOD-DEC-538, 346) shows its product first and
 * then the rounded sum, so the equality holds: «10 × 3,46 ₽ = 34,6 ₽, округлено вверх до 10 ₽: 40 ₽» (R5-005, FINDINGS 2916).
 */
function lineText(l: HomeQuote['lines'][number]): string {
  if (l.amount === null) return 'не рассчитано';
  if (!l.roundUpToRub || l.rate === null) return rubText(l.amount);
  const product = Math.round(l.quantity * l.rate * 100) / 100;
  return product === l.amount ? rubText(l.amount) : `${rubText(product)}, округлено вверх до ${l.roundUpToRub} ₽: ${rubText(l.amount)}`;
}

/** The estimate as text, the total equal to the one on the screen (Ц-05). */
export function homeQuoteText(q: HomeQuote): string {
  const n = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
  const total =
    q.total === null
      ? `Цена не определена. Известная часть — ${rubText(q.knownPart)}. Не хватает: ${q.missing.join(', ')}.`
      : `${q.status === 'TEST_RATE' ? 'Расчёт по учебным ставкам' : 'Итого'}: ${rubText(q.total)}`;
  return [
    `${q.product} · смета`,
    `Ревизия ${q.revision}`,
    '',
    ...q.lines.map((l) => `${l.item}: ${n(l.quantity)} × ${l.rate === null ? '—' : rubText(l.rate)} = ${lineText(l)}`),
    '',
    total,
    `Источник ставок: ${q.rateNote || 'не указан'}; дата: ${q.rateDate || 'не указана'}. Валюта RUB.`,
    'Предварительный расчёт, не коммерческое предложение. Цену уточняет изготовитель.',
    '',
  ].join('\n');
}

/** The CSV of the parts and the hardware with the revision of the version, the one of the estimate, the package and the manifest (R5-007, FINDINGS 2917). */
export const homePartsCsv = (p: HomeProject, hw: HardwareCatalogs, g: Graph = homeEngineGraph(p, hw)) => csv(p, hw, g.revision.projectRevisionId);

/** The CAD files of other furniture: STEP AP242 and AP214, OBJ + MTL of its graph. */
export const homeCadFiles = (p: HomeProject, g: Graph) => cadFiles(g, homeTitle(p));

/** The BAZIS file of other furniture: `model.b3d` of its graph. */
export const homeBazisFiles = (g: Graph) => bazisFiles(g);

/**
 * The archive of the output data of the version (Д-08): the package, its sheets, the CSV of the parts and hardware, the
 * estimate as TXT and JSON, the CAD and BAZIS files and the maps of the sheets — one graph, Latin names.
 */
export function homeProductionKit(p: HomeProject, hw: HardwareCatalogs, pkg: ProductionPackage, g: Graph = homeEngineGraph(p, hw)): Uint8Array {
  const q = homeQuote(p, hw, g);
  return productionKitZip(g, pkg, [
    { name: 'parts-hardware.csv', content: homePartsCsv(p, hw, g) },
    { name: 'quote.txt', content: homeQuoteText(q) },
    { name: 'quote.json', content: JSON.stringify(q, null, 2) + '\n' },
    ...homeCadFiles(p, g),
    ...homeBazisFiles(g),
    ...cuttingFiles(g, homeCuttingPlan(g, hw)),
  ]);
}
