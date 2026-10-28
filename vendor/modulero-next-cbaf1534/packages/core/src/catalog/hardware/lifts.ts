// Lift catalogue (task LIFT, MOD-DEC-320): the lift mechanisms of a front that opens upwards — the подъёмник of a
// mezzanine (антресоль) of the wardrobe. One record is one row of the manufacturer's table: the range of the carcass
// (or front) height it serves, the range of the load it holds, the kind of front and the order codes of its colours.
// INV-D18-01 (Handbook r8 §18.5): the lift is chosen by a compatible row of these data and the full composition of the
// front — the selection (engine/policy/lift-selection.ts) reads the ranges from here and answers UNKNOWN for what the
// row does not give. INV-D18-02: the opening angle of the manufacturer is kept here as it is printed; the working
// angle of Modulero (MOD-DEC-194, one row only) is a rule of the policy and never overwrites it. No number of one
// lift is carried over to another (Handbook §18.3: the AVENTOS numbers are not DTC's). The data lie in
// catalogs/hardware/lifts.json, outside the core (CAT-1); a source is not required (MOD-DEC-348).
import { refChecker, type CatalogDocument, type CatalogRef, type HardwareItem, type Known } from './types.js';

/**
 * Kind of the front the lift moves. FOLDING — складной: two leaves one above the other, folded up together (DTC TOP
 * STAY ST); FLAP — откидной: one leaf swung up about its top (DTC TOP STAY SQ).
 */
export type LiftFrontKind = 'FOLDING' | 'FLAP';

/** What the height range of a row is measured on: the carcass (KH, «индекс h») or the front. */
export type LiftHeightBasis = 'CARCASS' | 'FRONT';

/**
 * How the load of a row is given. MASS_KG — the mass of the front with its handle, kg; POWER_FACTOR — the power
 * factor: carcass height, mm × (mass of the front + 2 × mass of the handle), kg (`powerFactorRule` names its source).
 */
export type LiftLoadBasis = 'MASS_KG' | 'POWER_FACTOR';

/** An order code of the row in one colour. */
export interface LiftArticle {
  article: string;
  /** Colour as the manufacturer names it. */
  colour: string;
  /** Price of one kit; a value without a source is the owner's (MOD-DEC-348); null — the price is not known (247). */
  priceRub: Known<number>;
}

/** An opening angle as one source prints it. */
export interface LiftAngle {
  minDeg: number;
  maxDeg: number;
  ref: CatalogRef | null;
  note?: string;
}

export interface Lift extends HardwareItem {
  name: string;
  /** Family of the manufacturer: `DTC TOP STAY ST`. */
  series: string;
  frontKind: LiftFrontKind;
  heightBasis: LiftHeightBasis;
  heightMm: Known<{ minMm: number; maxMm: number }>;
  loadBasis: LiftLoadBasis;
  /** MASS_KG: kg; POWER_FACTOR: the power factor, mm·kg. */
  load: Known<{ min: number; max: number }>;
  /** Kits per front the load range is printed for (a kit is the left and the right mechanism). */
  kitsPerFront: number;
  /** Widest carcass the row serves; UNKNOWN — not printed. */
  maxCarcassWidthMm: Known<number>;
  /** Thickness of the front the row serves. */
  frontThicknessMm: Known<{ minMm: number; maxMm: number }>;
  /** Opening angles as the sources print them (INV-D18-02: kept apart from the working angle of the policy). */
  manufacturerAngles: LiftAngle[];
  /** Holes of the mechanism in the carcass and the front; null — the source gives none (the drilling is incomplete, 277). */
  drilling: null;
  /** Hinges of the leaves (FOLDING: between the leaves and at the top) are part of the kit; UNKNOWN — not printed. */
  leafHingesIncluded: Known<boolean>;
  articles: LiftArticle[];
  /** Accessories of the series (angle limiters…), order codes only. */
  accessories: string[];
}

export interface LiftCatalog {
  version: string;
  /** The rule of the power factor as the source prints it, with its reference. */
  powerFactorRule: { text: string; ref: CatalogRef | null };
  lifts: Lift[];
  documents: CatalogDocument[];
}

/** Only what the engine needs (MOD-DEC-349): ids, kinds, ranges in order and positive, at least one article. */
export function liftCatalogProblems(c: LiftCatalog): string[] {
  const { ref, known, problems: out } = refChecker(c.documents);
  const ids = new Set(c.lifts.map((x) => x.id));
  if (ids.size !== c.lifts.length) out.push('повтор id подъёмника');
  ref('powerFactorRule', c.powerFactorRule.ref);
  const range = (where: string, k: Known<{ min: number; max: number } | { minMm: number; maxMm: number }>) => {
    known(where, k as Known<unknown>);
    if (k.value === null) return;
    const [a, b] = 'min' in k.value ? [k.value.min, k.value.max] : [k.value.minMm, k.value.maxMm];
    if (!(a > 0 && b >= a)) out.push(`${where}: диапазон ${a}…${b} — нужны положительные числа по возрастанию`);
  };
  for (const x of c.lifts) {
    if (!x.id.trim()) out.push('подъёмник без id');
    if (!['FOLDING', 'FLAP'].includes(x.frontKind)) out.push(`${x.id}: неизвестный вид фасада ${x.frontKind}`);
    if (!['CARCASS', 'FRONT'].includes(x.heightBasis)) out.push(`${x.id}: неизвестная база высоты ${x.heightBasis}`);
    if (!['MASS_KG', 'POWER_FACTOR'].includes(x.loadBasis)) out.push(`${x.id}: неизвестный вид нагрузки ${x.loadBasis}`);
    range(`${x.id}.heightMm`, x.heightMm);
    range(`${x.id}.load`, x.load);
    range(`${x.id}.frontThicknessMm`, x.frontThicknessMm);
    known(`${x.id}.maxCarcassWidthMm`, x.maxCarcassWidthMm);
    known(`${x.id}.leafHingesIncluded`, x.leafHingesIncluded);
    if (!(Number.isInteger(x.kitsPerFront) && x.kitsPerFront > 0)) out.push(`${x.id}: комплектов на фасад — целое положительное`);
    if (!x.articles.length) out.push(`${x.id}: нет артикула`);
    for (const a of x.articles) {
      if (!a.article.trim()) out.push(`${x.id}: пустой артикул`);
      known(`${x.id}.${a.article}.priceRub`, a.priceRub);
    }
    for (const a of x.manufacturerAngles) {
      if (!(a.minDeg > 0 && a.maxDeg >= a.minDeg)) out.push(`${x.id}: угол открывания ${a.minDeg}…${a.maxDeg}°`);
      ref(`${x.id}.manufacturerAngles`, a.ref);
    }
    ref(x.id, x.ref);
  }
  return out;
}
