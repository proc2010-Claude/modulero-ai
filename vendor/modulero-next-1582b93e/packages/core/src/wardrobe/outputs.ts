// The outputs of a wardrobe graph (task W5): the price, the quote, the CSV files and the costs of the model — all
// from one reading of the graph and one price (WR-11). Every output is stamped with the revision of the project, the
// rule set and the generator of the graph and with its qualification (INV-S04, INV-V04): a project that is not ready
// for production says so in the cut list (WR-24).
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Graph } from '../engine/contract.js';
import type { OutputStamp } from '../engine/invariants/checks.js';
import type { Rec } from '../engine/policy/project-state.js';
import { wardrobeCsv } from './exports.js';
import { wardrobeModelFromGraph } from './graph-projection.js';
import type { WardrobeInput } from './input.js';
import { wardrobePriceCuttingPlan } from './cutting-plan.js';
import { wardrobeModelPrice, wardrobePriceSnapshot, wardrobeQuoteText, type WardrobePrice } from './price.js';
import { slidingRevisions } from './sliding-doors.js';

export interface WardrobeOutputs {
  /** The model read back from the graph with its costs: the costs are the price (WR-11). */
  model: Rec;
  price: WardrobePrice;
  quote: string;
  specification: string;
  dspdetal: string;
  drilling: string;
  stamps: OutputStamp[];
}

/** The outputs of the graph of an input. */
export function wardrobeOutputs(g: Graph, hw: HardwareCatalogs, input: WardrobeInput): WardrobeOutputs {
  const s = wardrobePriceSnapshot(input, hw),
    m = wardrobeModelFromGraph(g, hw);
  m.material = s.material;
  const price = wardrobeModelPrice(m, s, wardrobePriceCuttingPlan(g, hw), hw),
    csv = wardrobeCsv(m, input.state as Rec, hw.materials, g.result.exportQualification);
  m.costs = price.costs;
  // W9.3: the revisions of the doors, against the revision and the price snapshot of the graph (FINDINGS 515).
  if (m.sliding) Object.assign(m.sliding, slidingRevisions(m, { projectId: g.revision.projectRevisionId, priceSnapshotId: g.versions.priceSnapshotId }));
  const stamp = (output: string): OutputStamp => ({ output, revision: g.revision.projectRevisionId, ruleSet: g.versions.ruleSet, generator: g.versions.generator, qualification: g.result.exportQualification });
  return { model: m, price, quote: wardrobeQuoteText(m, price, s.materialSelection), ...csv, stamps: ['quote.txt', 'specification.csv', 'dspdetal.csv', 'drilling.csv'].map(stamp) };
}
