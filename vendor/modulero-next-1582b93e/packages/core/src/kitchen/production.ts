// Production data of the kitchen (R4-009 of the pilot, MOD-DEC-326 (2); FINDINGS 2927): the status of the version, the
// production package and the archive of all output data of one graph — on the code of the wardrobe's package
// (engine/production.ts, wardrobe/production.ts), not a copy of it. The kitchen adds only what its graph does not hold:
// the stamps of its outputs, the verdict of its price, the priced lines of its hardware and the drilling as a table.
import { bazisFiles } from '../engine/bazis-export.js';
import { cadFiles } from '../engine/cad-export.js';
import type { Graph, Operation } from '../engine/contract.js';
import type { CuttingPlan } from '../engine/cutting.js';
import { kitchenBoards, kitchenHingeContext } from '../engine/generators/kitchen.js';
import { cuttingFiles, productionKitZip, productionPackageOf, type KitLine, productReadiness, type ManufactureReadiness, type ProductionPackage } from '../engine/production.js';
import { rowsToCsv } from '../wardrobe/exports.js';
import { kitchenHardwareTitle, kitchenUnit } from './hardware-list.js';
import { KITCHEN_OUTPUT_FILES, type KitchenOutputs } from './outputs.js';

type Rec = Record<string, any>;

/** The name of the kitchen in its files. */
export const KITCHEN_TITLE = 'Modulero · кухня';

const rubText = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0 }) + ' ₽';

/**
 * The status of the version of a kitchen (RELEASE_1_SCOPE §4.2): the invariant library on its graph with the stamps of
 * its outputs, the ids of its scene and the context the kitchen is checked with — its boards and hinge charts, as in
 * engine.kitchen.test.ts (MOD-DEC-568) — and the verdict of its price: complete when the total is known (MOD-DEC-247),
 * the conditional rates said as conditional (264, 436).
 */
export function kitchenReadiness(g: Graph, out: KitchenOutputs): ManufactureReadiness {
  const p = out.price;
  return productReadiness(g, {
    stamps: out.stamps,
    price: { complete: p.amount !== null, unknown: p.amount === null ? p.missing : [], conditional: p.temporary },
    context: { boards: kitchenBoards(g), ...kitchenHingeContext(g) },
  });
}

/** The texts of r1 lost their space between a word and a number («Конфирмат7×50»): put back, as the screen does (FINDINGS 2003). */
const spaced = (t: string) => t.replace(/([а-яё])(\d)/gi, '$1 $2');

/**
 * The lines of the hardware of the estimate for the whole kitchen: the rows of one article summed, with their price as
 * the estimate gives it (a row rounded up to 10 ₽ stays so in the sum); the hardware of an appliance is said so.
 */
export function kitchenKit(out: KitchenOutputs): KitLine[] {
  const lines = new Map<string, { item: string; unit: string; qty: number | null; amount: number | null; temporary: boolean }>();
  for (const r of (out.cost.items ?? []) as Rec[]) {
    if (r.category !== 'hardware' || r.included === false) continue;
    const { title, code } = kitchenHardwareTitle(String(r.name ?? r.article ?? ''), String(r.article ?? ''), String(r.brand ?? '')),
      item = spaced(title) + (code && !title.includes(code) ? ' ' + code : '') + (r.includedWithAppliance ? ' (в комплекте техники)' : ''),
      unit = kitchenUnit(r.unit),
      key = item + '|' + unit,
      qty = typeof r.quantity === 'number' && Number.isFinite(r.quantity) ? r.quantity : null,
      amount = typeof r.amount === 'number' ? r.amount : null,
      line = lines.get(key);
    if (!line) lines.set(key, { item, unit, qty, amount, temporary: r.origin === 'TEMPORARY' });
    else {
      line.qty = line.qty === null || qty === null ? null : Math.round((line.qty + qty) * 1000) / 1000;
      line.amount = line.amount === null || amount === null ? null : Math.round((line.amount + amount) * 100) / 100;
      line.temporary ||= r.origin === 'TEMPORARY';
    }
  }
  return [...lines.values()].map((l) => ({ group: 'Фурнитура', item: l.item, qty: l.qty, unit: l.unit, price: l.amount === null ? 'Цена не определена' : rubText(l.amount) + (l.temporary ? ' · условная' : '') }));
}

/** The production package of a kitchen: one graph, its outputs, its status and the maps of its sheets. */
export function kitchenProductionPackage(g: Graph, out: KitchenOutputs, opts: { appVersion?: string; readiness?: ManufactureReadiness; cutting?: CuttingPlan | null } = {}): ProductionPackage {
  const p = out.price;
  return productionPackageOf(g, {
    readiness: opts.readiness ?? kitchenReadiness(g, out),
    title: KITCHEN_TITLE,
    appVersion: opts.appVersion,
    kit: kitchenKit(out),
    kitNotes: [
      'Цены фурнитуры — ориентир: у поставщиков цены разные, найденная цена округлена вверх до 10 ₽ (MOD-DEC-346).',
      ...(p.amount === null ? p.missing.map((x) => 'Не определено: ' + x) : []),
      ...(p.temporary.length ? ['Условные цены: ' + p.temporary.join('; ')] : []),
    ],
    cutting: opts.cutting ?? null,
  });
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const FACE_RU: Record<string, string> = { N_POS: 'пласть +', N_NEG: 'пласть −' };
const where = (o: { face: string | null; edge: string | null }) => (o.face ? FACE_RU[o.face] ?? o.face : o.edge ? 'торец ' + o.edge : '');

/** One row of the drilling table per operation of the graph: the holes, the grooves and the cut-outs of every part. */
function drillingRow(o: Operation, name: string): unknown[] {
  if (o.op === 'HOLE')
    return [o.partId, name, o.id, o.mode === 'FACE' ? 'Отверстие в пласти' : 'Отверстие в торце', where(o), r1(o.xMm), r1(o.yMm), o.diameterMm, o.through ? 'насквозь' : (o.depthMm ?? ''), o.layer === 'MARKING' ? 'разметка' : 'сверление', o.purpose, o.source, o.completeness];
  if (o.op === 'GROOVE')
    return [o.partId, name, o.id, 'Паз', where(o), `${r1(o.startMm)}–${r1(o.endMm)}`, r1(o.offsetMm), o.grooveWidthMm, o.grooveDepthMm, o.along === 'LENGTH' ? 'вдоль длины' : 'вдоль ширины', o.purpose, o.resolution.profileId, o.resolution.productionConfirmed ? 'COMPLETE' : 'REQUIRES_TECHNOLOGY_CONFIRMATION'];
  return [o.partId, name, o.id, 'Выборка', '', `${r1(o.uRangeMm[0])}–${r1(o.uRangeMm[1])}`, `${r1(o.vRangeMm[0])}–${r1(o.vRangeMm[1])}`, '', `${r1(o.nRangeMm[0])}–${r1(o.nRangeMm[1])}`, '', o.purpose, '', ''];
}

/**
 * The drilling of the graph as a table (присадка.csv): every hole, groove and cut-out with its part, side, coordinates
 * from the finished part with edge (MOD-DEC-169), size, purpose and source. A hole marked «разметка» is not drilled (276).
 */
export function graphDrillingCsv(g: Pick<Graph, 'parts' | 'operations'>): string {
  const names = new Map(g.parts.map((p) => [p.id, p.name] as const));
  return (
    '﻿' +
    rowsToCsv([
      ['Деталь', 'Название', 'ID операции', 'Операция', 'Сторона', 'X, мм', 'Y, мм', 'Диаметр / ширина, мм', 'Глубина, мм', 'Вид', 'Назначение', 'Источник', 'Полнота'],
      ...g.operations.map((o) => drillingRow(o, names.get(o.partId) ?? '')),
    ]) +
    '\n'
  );
}

/** The CAD files of a kitchen: STEP AP242 and AP214, OBJ + MTL of its graph. */
export const kitchenCadFiles = (g: Graph) => cadFiles(g, KITCHEN_TITLE);

/** The BAZIS file of a kitchen: `model.b3d` of its graph. */
export const kitchenBazisFiles = (g: Graph) => bazisFiles(g);

/** The name of an output file of the kitchen, as the CSV refer to it: `modulero_kitchen_contours_<revision>.json`. */
export const kitchenOutputName = (kind: keyof typeof KITCHEN_OUTPUT_FILES, revision: string) => 'modulero_kitchen_' + KITCHEN_OUTPUT_FILES[kind].replace('.', '_' + revision + '.');

/**
 * The archive of the output data of the version (Д-08): the package and its sheets, the CSV of the specification (with
 * the hardware), the parts and the drilling, the estimate as TXT and JSON, the contours the CSV refer to, the CAD and BAZIS
 * files and the maps of the sheets — one graph, Latin names.
 */
export function kitchenProductionKit(g: Graph, out: KitchenOutputs, pkg: ProductionPackage, cutting: CuttingPlan | null = null): Uint8Array {
  return productionKitZip(g, pkg, [
    { name: 'specification.csv', content: out.specification },
    { name: 'parts.csv', content: out.dspdetal },
    { name: 'drilling.csv', content: graphDrillingCsv(g) },
    { name: 'quote.txt', content: out.quote },
    { name: 'cost.json', content: JSON.stringify(out.cost, null, 2) + '\n' },
    { name: kitchenOutputName('contours', out.revision), content: JSON.stringify(out.contours, null, 2) + '\n' },
    ...kitchenCadFiles(g),
    ...kitchenBazisFiles(g),
    ...cuttingFiles(g, cutting),
  ]);
}
