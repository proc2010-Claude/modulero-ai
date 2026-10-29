// The outputs of a kitchen graph (task K5, MIGRATION_PLAN step 4.5): the cost, the BOM, the contours, the template of
// the rates, the CSV of the specification and of the parts and the text of the cost — all from one reading of the
// kitchen and one cost, every one with the ProjectRevision of the graph (INV-S04) and its qualification (INV-V04).
import type { Graph } from '../engine/contract.js';
import type { CuttingPlan } from '../engine/cutting.js';
import type { OutputStamp } from '../engine/invariants/checks.js';
import type { Rec } from '../engine/policy/project-state.js';
import { bomOf } from './bom.js';
import { kitchenCost, kitchenReading, kitchenRatesTemplate, type KitchenReading } from './cost.js';
import { kitchenPriceCuttingPlan } from './cutting.js';
import { kitchenContours, kitchenPartsCsv, kitchenQuoteText, kitchenSpecificationCsv } from './exports.js';
import type { KitchenRates } from './project.js';
import type { KitchenScene } from './room.js';

/** The price of a kitchen as an editor shows it: the total or null, the known part and why it is partial. */
export interface KitchenPrice {
  /** The total; null while anything included is unknown (MOD-DEC-157, 247). */
  amount: number | null;
  /** The sum of the known amounts. */
  knownAmount: number | null;
  furnitureAmount: number | null;
  applianceAmount: number | null;
  currency: string;
  status: 'COMPLETE_CONFIGURED_ESTIMATE' | 'PARTIAL';
  /** Every unknown row and module in words. */
  missing: string[];
  /** Included rows without an applicable rate. */
  unpriced: number;
  /** MOD-DEC-028: what is bought, the maker's cost C and the customer's price; null — unknown (MOD-DEC-402, 436). */
  supplierCost: number | null;
  internalCost: number | null;
  customerPrice: number | null;
  /** The conditional rates of this price: shown under the bell until the owner or the maker sets them (MOD-DEC-264, 436). */
  temporary: string[];
  /**
   * What is checked before production and does not leave the price unknown: the heat resistance of the materials of a
   * module of an appliance (MOD-DEC-741, FINDINGS 3200). The price counts the chosen materials; the bell keeps the check.
   */
  productionChecks: string[];
}

export interface KitchenOutputs {
  revision: string;
  price: KitchenPrice;
  /** flow.cost() of the prototype with the rate card of MOD-DEC-436: the rows with their rates, origins and amounts, the services on C, the unknowns, the totals. */
  cost: Rec;
  bom: Rec;
  contours: Rec;
  /** The rates of the chosen composition, the project's own filled in (the file the maker fills and imports). */
  rates: KitchenRates;
  /** modulero_kitchen_bom_<revision>.csv */
  specification: string;
  /** modulero_kitchen_parts_<revision>.csv */
  dspdetal: string;
  /** modulero_kitchen_cost_<revision>.txt */
  quote: string;
  stamps: OutputStamp[];
}

/** The files of a kitchen by the export kinds of the prototype (kflowExport, r1.html:81694). */
export const KITCHEN_OUTPUT_FILES = { cost: 'cost.json', bom: 'bom.json', contours: 'contours.json', rates: 'rates.json', specification: 'bom.csv', dspdetal: 'parts.csv', quote: 'cost.txt' } as const;

/**
 * The outputs of one reading of the kitchen with the revision and the qualification of the graph; `plan` — the cutting
 * plan of the graph the boards are priced by (MOD-DEC-510), without it the cost prices the area of the blanks.
 */
export function kitchenOutputsOf(r: KitchenReading, g: Pick<Graph, 'revision' | 'versions' | 'result'> & Partial<Pick<Graph, 'parts'>>, plan?: CuttingPlan): KitchenOutputs {
  const blanks = new Map((g.parts ?? []).map((p) => [p.id, p.dimensionChain.sawnBlank] as const)),
    cost = kitchenCost(r, plan, (id) => blanks.get(id) ?? null),
    stamp = (output: string): OutputStamp => ({ output, revision: r.revision, ruleSet: g.versions.ruleSet, generator: g.versions.generator, qualification: g.result.exportQualification });
  return {
    revision: r.revision,
    price: {
      amount: cost.total,
      knownAmount: cost.knownSubtotal,
      furnitureAmount: cost.furnitureSubtotal,
      applianceAmount: cost.applianceSubtotal,
      currency: cost.currency,
      status: cost.status,
      missing: cost.missing,
      unpriced: cost.unpricedItems.length,
      supplierCost: cost.supplierCost,
      internalCost: cost.internalCost,
      customerPrice: cost.customerPrice,
      temporary: cost.temporary,
      productionChecks: cost.productionChecks ?? [],
    },
    cost,
    bom: bomOf(r),
    contours: kitchenContours(r),
    rates: kitchenRatesTemplate(r),
    specification: kitchenSpecificationCsv(r),
    dspdetal: kitchenPartsCsv(r),
    quote: kitchenQuoteText(cost, r.coverage),
    stamps: Object.values(KITCHEN_OUTPUT_FILES).map((f) => stamp('modulero_kitchen_' + f.replace('.', '_' + r.revision + '.'))),
  };
}

/**
 * The outputs of the graph of a kitchen scene (g = kitchenGraph(s)): the catalogue is s.hardware, the rates s.costSettings.
 * The boards are priced by the cutting plan of the graph the wardrobe's price cuts with: the saw of MOD-DEC-445, the
 * format of the catalogue, else the format of the price estimate (MOD-DEC-505, 510); the parameters of «Раскрой» over
 * them (R4-011).
 */
export function kitchenOutputs(g: Graph, s: KitchenScene): KitchenOutputs {
  const r = kitchenReading(s);
  if (r.revision !== g.revision.projectRevisionId) throw new Error('Выгрузки кухни относятся к другой ревизии проекта, чем расчёт.');
  return kitchenOutputsOf(r, g, kitchenPriceCuttingPlan(g, s, s.hardware));
}
