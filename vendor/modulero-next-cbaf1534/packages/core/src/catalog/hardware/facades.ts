// Catalogue of the materials of the facades (MOD-DEC-573, docs/product/FACADE_MATERIALS_PROPOSAL.md): the choice
// «материал → исполнение → цвет» of the doors and the drawer fronts. The data lie in catalogs/materials/facades.json,
// in the release of the catalogue beside the hardware (catalogs/RELEASE.json), outside the core (CAT-1): a material,
// an execution, a price or a colour is added there, without a change of the code. A material is made in the order from
// a board of a decor (ЛДСП, ЛМДФ: the door is cut and drilled with the product, 347) or bought ready-made (МДФ in PVC
// film or in enamel, veneer: out of the cutting plan, the supplier drills the cups, FINDINGS 266). The execution gives
// the thickness of the door and the price of a bought one, ₽ per m² of one projection, rounded up to 10 ₽ when it is
// entered (346); a price the catalogue does not give is «Цена не определена» (247).
import { refChecker, type CatalogDocument, type Known } from './types.js';

/** How the colour is chosen: a decor of the board (it goes to the cutting plan), a decor as a sample or a colour code, the species. */
export type FacadeColorMode = 'BOARD_DECOR' | 'SAMPLE_OR_CODE' | 'SPECIES';

/** An execution of a material: its thickness and finish; 'BOARD' — the thickness of the carcass board. */
export interface FacadeExecution {
  id: string;
  title: string;
  thicknessMm: number | 'BOARD';
  /** Price of a bought facade, ₽/m²; null — a door made in the order (priced by its boards), or not known. */
  priceRubPerM2: Known<number>;
  /** Where the price was read (a source is not required, MOD-DEC-348). */
  priceNote?: string;
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
    }
  }
  return out;
}
