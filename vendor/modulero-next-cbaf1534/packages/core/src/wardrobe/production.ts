// Production data of the swing wardrobe (task PROD-1, stage 1): the status of the version and the production package
// of its graph (engine/production.ts). The wardrobe adds only what the graph does not hold: the invariant context of
// its outputs, the verdict of its price and the priced lines of hardware and fasteners of its estimate (W5, W11).
import { bazisFiles } from '../engine/bazis-export.js';
import { cadFiles } from '../engine/cad-export.js';
import type { Graph } from '../engine/contract.js';
import { cuttingCutsCsv, cuttingPlanCsv, cuttingSheets, cuttingSheetsCsv, type CuttingPlan } from '../engine/cutting.js';
import { checkInvariants } from '../engine/invariants/index.js';
import { manufactureReadiness, productionKitZip, productionPackageOf, type KitLine, type ManufactureReadiness, type ProductionPackage } from '../engine/production.js';
import { sceneOf } from '../engine/scene.js';
import { hardwareCsv } from './hardware-csv.js';
import type { WardrobeInput } from './input.js';
import type { WardrobeOutputs } from './outputs.js';
import { priceNote, rub } from './price.js';

/** Categories of the estimate that are bought as a kit: the hardware and the fasteners. */
const KIT_CATEGORIES = ['Фурнитура', 'Крепёж'];

/** Title of the wardrobe in its files: the sliding one is named as itself, not as the swing one (FINDINGS 1802). */
export const wardrobeTitle = (g: Pick<Graph, 'product'>) => (g.product === 'SLIDING_WARDROBE' ? 'Modulero · шкаф-купе' : 'Modulero · шкаф распашной');

/**
 * The status of the version of a wardrobe (RELEASE_1_SCOPE §4.2): the whole invariant library on its graph with the
 * stamps of its outputs and the ids of its scene, and the verdict of its price — complete when the total is known
 * (an unknown price is not a zero, MOD-DEC-247; a conditional one is marked, MOD-DEC-264).
 */
export function wardrobeReadiness(g: Graph, out: WardrobeOutputs): ManufactureReadiness {
  const invariants = checkInvariants(g, { projections: { stamps: out.stamps, scenePartIds: sceneOf(g).parts.map((p) => p.id) } }),
    p = out.price;
  return manufactureReadiness(g, { invariants, price: { complete: p.amount !== null, unknown: p.amount === null ? p.missing.map(priceNote) : [], conditional: p.temporary } });
}

/** The lines of hardware and fasteners of the estimate, with their price as the estimate prints it. */
export function wardrobeKit(input: WardrobeInput, out: WardrobeOutputs): KitLine[] {
  const ms = input.state.materialSelection ?? null;
  return out.price.lines
    .filter((l) => KIT_CATEGORIES.includes(l.category))
    .map((l) => ({ group: l.category, item: l.item, qty: l.qty, unit: l.unit, price: rub(l.amount, ms) + (l.origin === 'TEMPORARY' ? ' · условная' : '') }));
}

/** The production package of a wardrobe: one graph, its outputs and its status. */
export function wardrobeProductionPackage(input: WardrobeInput, g: Graph, out: WardrobeOutputs, opts: { appVersion?: string; readiness?: ManufactureReadiness; cutting?: CuttingPlan | null } = {}): ProductionPackage {
  const p = out.price,
    kitNotes = [
      'Цены фурнитуры и крепежа — ориентир: у поставщиков цены разные, найденная цена округлена вверх до 10 ₽ (MOD-DEC-346).',
      ...(p.amount === null ? p.missing.map((x) => 'Не определено: ' + priceNote(x)) : []),
      ...(p.temporary.length ? ['Условные цены: ' + p.temporary.join('; ')] : []),
    ];
  return productionPackageOf(g, {
    readiness: opts.readiness ?? wardrobeReadiness(g, out),
    title: wardrobeTitle(g),
    appVersion: opts.appVersion,
    kit: wardrobeKit(input, out),
    kitNotes,
    cutting: opts.cutting ?? null,
  });
}

/** The CAD files of a wardrobe (stage 2): STEP AP242 and AP214, OBJ + MTL of its graph. */
export const wardrobeCadFiles = (g: Graph) => cadFiles(g, wardrobeTitle(g));

/** The BAZIS file of a wardrobe (stage 3): `model.b3d` of its graph. */
export const wardrobeBazisFiles = (g: Graph) => bazisFiles(g);

/**
 * The archive of the output data of the version: the package, the CSV files, the estimate, the CAD files and the
 * BAZIS file of the same graph, and the cutting plan when the user has made one (CUT-1): its CSV files and the map of every sheet.
 */
export function wardrobeProductionKit(g: Graph, out: WardrobeOutputs, pkg: ProductionPackage, cutting: CuttingPlan | null = null): Uint8Array {
  return productionKitZip(g, pkg, [
    { name: 'specification.csv', content: out.specification },
    { name: 'hardware.csv', content: hardwareCsv(g) },
    { name: 'cutlist.csv', content: out.dspdetal },
    { name: 'drilling.csv', content: out.drilling },
    { name: 'quote.txt', content: out.quote },
    ...wardrobeCadFiles(g),
    ...wardrobeBazisFiles(g),
    ...cuttingFiles(g, cutting),
  ]);
}

/** The files of a cutting plan of this graph: the blanks, the sheets, the cuts and the maps; none without a plan. */
export function cuttingFiles(g: Pick<Graph, 'revision'>, cutting: CuttingPlan | null): { name: string; content: string }[] {
  if (!cutting) return [];
  if (cutting.revision !== g.revision.projectRevisionId) throw new Error(`Карта раскроя ревизии ${cutting.revision} не относится к графу ${g.revision.projectRevisionId}`);
  return [
    { name: 'cutting-plan.csv', content: cuttingPlanCsv(cutting) },
    { name: 'cutting-sheets.csv', content: cuttingSheetsCsv(cutting) },
    { name: 'cutting-cuts.csv', content: cuttingCutsCsv(cutting) },
    ...cuttingSheets(cutting).map((s) => ({ name: `cutting/${s.name}.svg`, content: s.svg })),
  ];
}
