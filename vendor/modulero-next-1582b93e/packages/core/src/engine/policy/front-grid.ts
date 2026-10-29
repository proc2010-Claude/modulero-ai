// Front grid of the swing wardrobe: the exact rational arithmetic of section widths and the nominal grid with its
// clear openings, file 00 of the prototype r1 (r1.html:3646–3648, 4011–4330, 4488), MIGRATION_PLAN task W2.
// Pure functions: what the prototype read from its global state is a parameter.
// Layer folded in: nominalSectionWidthsExact is wrapped once by the construction domain 06a (r1.html:11562): when
// every section of the state already has its exact width (nominalMm), those widths are returned as they are.
// Proof: the pairs "call → answer of the prototype" in reference/wardrobe-core/w2 (test/wardrobe.policyW2.test.ts)
// and every real call compared in the prototype page (tests/oracle/wardrobe-policy-w2.test.mjs).
import { WardrobeStandardPreset } from '../../wardrobe/standard.js';
import { constant, decision, prototype, type PolicyModule } from './types.js';

/**
 * Numbers of the section grid. Without a decision they keep the prototype's value with FINDINGS 90 (CLAUDE.md:
 * a number is not invented). The 2400 mm guide of the body width is MOD-DEC-200.
 */
export const sectionGrid = {
  id: 'section-grid',
  version: '1',
  constants: {
    minSectionNominalWidth: constant(160, 'mm', decision('MOD-DEC-565'), 'Наименьшая номинальная ширина секции (r1 MIN_SECTION_NOMINAL_WIDTH); отдельного минимума чистого проёма нет — проём выходит за вычетом боковин (FINDINGS 1164)'),
    maxSections: constant(18, 'sections', prototype('r1 MAX_SECTIONS (r1.html:3648)', 'FINDINGS 90'), 'Наибольшее число секций шкафа; решения нет'),
    moduleWidthGuide: constant(2400, 'mm', decision('MOD-DEC-200'), 'Ориентир ширины корпуса: разрыв модуля и авторазбивка n = ceil(W/2400)'),
    displayFractionDigits: constant(3, 'digits', prototype('r1 P2_DISPLAY_ADAPTER (r1.html:4091)', 'FINDINGS 90'), 'Показ точного размера: 3 знака, половина — от нуля; только показ, расчёт точный'),
    ratioEpsilon: constant(0.0001, 'mm', prototype('r1 nominalWidthsFromRatios, derivedManualExactWidths (r1.html:4120, 4186)', 'FINDINGS 90'), 'Запас сравнения ширины секции с минимумом при раздаче по долям'),
    gridEpsilon: constant(0.001, 'mm', prototype('r1 recommendedModuleBreaksForWidths, canFitSectionCount (r1.html:4219, 4320)', 'FINDINGS 90'), 'Запас сравнения ширины модуля и проёма с пределом'),
  },
} as const satisfies PolicyModule;

const MIN_NOMINAL = sectionGrid.constants.minSectionNominalWidth.value;
const RATIO_EPS = sectionGrid.constants.ratioEpsilon.value;
const GRID_EPS = sectionGrid.constants.gridEpsilon.value;

/**
 * The prototype's names of the grid limits (r1.html:3646–3648), the values of the policy above. MIN_SECTION_CLEAR_WIDTH
 * of the prototype is gone: MOD-DEC-565 sets no minimum of the clear opening (FINDINGS 1164).
 */
export const MIN_SECTION_NOMINAL_WIDTH = MIN_NOMINAL;
export const MAX_SECTIONS = sectionGrid.constants.maxSections.value;

/** Modes of the front grid, the facade width and the module grouping (r1.html:3665). */
export const P2_MODES = Object.freeze({
  frontGrid: Object.freeze(['EQUAL', 'MANUAL']),
  facadeWidthPolicy: Object.freeze(['EQUAL_ROW', 'FOLLOW_FRONT_GRID']),
  moduleGrouping: Object.freeze(['AUTO', 'MANUAL']),
});

/** An exact length in millimetres: numerator / denominator, both safe integers, denominator > 0, reduced. */
export interface ExactMm {
  numerator: number;
  denominator: number;
}

/** Greatest common divisor of the integer parts; 1 for (0, 0) (r1.html:4016). */
export function exactGcd(a: number, b: number): number {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1;
}

/** Reduced fraction with a positive denominator; a non-integer part or a zero denominator is refused (r1.html:4026). */
export function normalizeExactMm(value: unknown): ExactMm {
  const v = value as Partial<ExactMm> | null | undefined;
  let numerator = Number(v?.numerator),
    denominator = Number(v?.denominator);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) throw new Error('Invalid exact millimetre value');
  if (denominator < 0) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const gcd = exactGcd(numerator, denominator);
  return {
    numerator: numerator / gcd,
    denominator: denominator / gcd,
  };
}

/** A decimal text ("1200.5", "1200,5") or an exact value as a reduced fraction (r1.html:4040). */
export function parseExactMm(value: unknown): ExactMm {
  if (value && typeof value === 'object' && 'numerator' in value) return normalizeExactMm(value);
  let text = String(value ?? '0').trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error(`Invalid decimal millimetre value: ${text}`);
  let sign = 1;
  if (text[0] === '-' || text[0] === '+') {
    if (text[0] === '-') sign = -1;
    text = text.slice(1);
  }
  const [whole = '0', fraction = ''] = text.split('.'),
    denominator = 10 ** fraction.length,
    numerator = sign * (Number(whole || 0) * denominator + Number(fraction || 0));
  return normalizeExactMm({ numerator, denominator });
}

/** a + b (r1.html:4057). */
export function exactAdd(a: unknown, b: unknown): ExactMm {
  const x = normalizeExactMm(a),
    y = normalizeExactMm(b);
  return normalizeExactMm({ numerator: x.numerator * y.denominator + y.numerator * x.denominator, denominator: x.denominator * y.denominator });
}

/** a − b (r1.html:4065). */
export function exactSub(a: unknown, b: unknown): ExactMm {
  const x = normalizeExactMm(a),
    y = normalizeExactMm(b);
  return normalizeExactMm({ numerator: x.numerator * y.denominator - y.numerator * x.denominator, denominator: x.denominator * y.denominator });
}

/** a / n for an integer n (r1.html:4073). */
export function exactDivideInteger(a: unknown, n: number): ExactMm {
  const x = normalizeExactMm(a);
  return normalizeExactMm({ numerator: x.numerator, denominator: x.denominator * n });
}

/** Sign of a − b: −1, 0 or 1 (r1.html:4080). */
export function exactCompare(a: unknown, b: unknown): number {
  return Math.sign(exactSub(a, b).numerator);
}

/** The nearest double (r1.html:4084). */
export function exactToNumber(value: unknown): number {
  const exact = normalizeExactMm(value);
  return exact.numerator / exact.denominator;
}

/** Σ values, exactly (r1.html:4088). */
export function exactSum(values: readonly unknown[]): ExactMm {
  return values.reduce<ExactMm>((sum, value) => exactAdd(sum, value), parseExactMm('0'));
}

/** Display of an exact size: decimal, rounded half away from zero (r1.html:4091). Only for display. */
export const P2_DISPLAY_ADAPTER = Object.freeze({
  id: 'P2_DISPLAY_DECIMAL_3_HALF_AWAY_FROM_ZERO',
  maximumFractionDigits: sectionGrid.constants.displayFractionDigits.value,
  rounding: 'HALF_AWAY_FROM_ZERO',
  source: 'EXACT_RATIONAL_ONLY',
});

/** Decimal text of an exact size with at most `digits` fraction digits, half away from zero (r1.html:4097). */
export function formatExactMm(value: unknown, digits: number = P2_DISPLAY_ADAPTER.maximumFractionDigits): string {
  const exact = normalizeExactMm(value),
    sign = exact.numerator < 0 ? '-' : '',
    abs = Math.abs(exact.numerator),
    scale = 10 ** digits,
    scaled = abs * scale,
    whole = Math.floor(scaled / exact.denominator),
    remainder = scaled % exact.denominator,
    rounded = whole + (remainder * 2 >= exact.denominator ? 1 : 0),
    integer = Math.floor(rounded / scale),
    fraction = String(rounded % scale).padStart(digits, '0').replace(/0+$/, '');
  return sign + String(integer) + (fraction ? '.' + fraction : '');
}

/** What the grid reads from a section of the state. */
export interface SectionRatio {
  ratio?: unknown;
}

/** Shares of the sections; equal shares when no section has a positive ratio (r1.html:4011). */
export function normalizedRatios(sections: readonly SectionRatio[]): number[] {
  const raw = sections.map((x) => Math.max(0, Number(x.ratio) || 0)),
    sum = raw.reduce((s, x) => s + x, 0);
  return sum > 0 ? raw.map((x) => x / sum) : raw.map(() => 1 / raw.length);
}

/**
 * Nominal widths by the shares, in doubles (r1.html:4110): a section below the minimum gets the minimum and leaves
 * the share; what the doubles lose goes to the last section. Kept for the checks that ask "would n sections fit".
 */
export function nominalWidthsFromRatios(W: number, sections: readonly SectionRatio[]): number[] {
  const n = sections.length;
  if (n === 1) return [W];
  if (W < n * MIN_NOMINAL) return Array(n).fill(W / n);
  const rs = normalizedRatios(sections),
    widths: number[] = Array(n).fill(0),
    open = new Set(Array.from({ length: n }, (_, i) => i));
  let remaining = W;
  while (open.size) {
    const ratioSum = [...open].reduce((s, i) => s + rs[i]!, 0) || open.size,
      tooSmall = [...open].filter((i) => (remaining * (rs[i] || 1 / open.size)) / ratioSum < MIN_NOMINAL - RATIO_EPS);
    if (!tooSmall.length) {
      [...open].forEach((i) => (widths[i] = (remaining * (rs[i] || 1 / open.size)) / ratioSum));
      break;
    }
    tooSmall.forEach((i) => {
      widths[i] = MIN_NOMINAL;
      remaining -= MIN_NOMINAL;
      open.delete(i);
    });
  }
  widths[widths.length - 1] += W - widths.reduce((s, w) => s + w, 0);
  return widths;
}

/**
 * The exact total split in proportion to the weights (exact values or decimal texts), in BigInt fractions
 * (r1.html:4136). A weight that is not positive, or no weight at all, is refused.
 */
export function rescaleExactWidths(totalExact: unknown, weights: readonly unknown[]): ExactMm[] {
  const gcd = (a: bigint, b: bigint): bigint => {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a || 1n;
  };
  const reduce = (n: bigint, d: bigint): [bigint, bigint] => {
    if (!d) throw new Error('Invalid exact width denominator');
    const g = gcd(n, d);
    return [n / g, d / g];
  };
  const fraction = (value: unknown): [bigint, bigint] => {
    if (value && typeof value === 'object') {
      const v = normalizeExactMm(value);
      return [BigInt(v.numerator), BigInt(v.denominator)];
    }
    const text = String(value);
    if (!/^\d+(?:\.\d*)?$/.test(text)) throw new Error('Invalid section ratio');
    const [a, b = ''] = text.split('.');
    return reduce(BigInt(a! + b), 10n ** BigInt(b.length));
  };
  const values = weights.map(fraction);
  if (!values.length || values.some(([n, d]) => n <= 0n || d <= 0n)) throw new Error('Section widths must be positive');
  const sum = values.reduce(([an, ad], [bn, bd]) => reduce(an * bd + bn * ad, ad * bd), [0n, 1n]),
    total = fraction(totalExact);
  return values.map(([n, d]) => {
    const [numerator, denominator] = reduce(total[0] * n * sum[1], total[1] * d * sum[0]);
    return normalizeExactMm({ numerator: Number(numerator), denominator: Number(denominator) });
  });
}

/** Exact widths by the shares with the minimum section, as nominalWidthsFromRatios but without the "special" last millimetre (r1.html:4174). */
export function derivedManualExactWidths(totalExact: unknown, sections: readonly SectionRatio[]): ExactMm[] {
  const n = sections.length;
  if (!n) return [];
  if (exactToNumber(totalExact) < n * MIN_NOMINAL) return sections.map(() => exactDivideInteger(totalExact, n));
  const widths: ExactMm[] = Array(n),
    open = new Set(sections.map((_, i) => i));
  let remaining: unknown = totalExact;
  while (open.size) {
    const ids = [...open],
      proposed = rescaleExactWidths(
        remaining,
        ids.map((i) => Math.max(0, Number(sections[i]!.ratio) || 0) || 1),
      ),
      small = ids.filter((_, k) => exactToNumber(proposed[k]) < MIN_NOMINAL - RATIO_EPS);
    if (!small.length) {
      ids.forEach((i, k) => (widths[i] = proposed[k]!));
      break;
    }
    small.forEach((i) => {
      widths[i] = parseExactMm(MIN_NOMINAL);
      remaining = exactSub(remaining, widths[i]);
      open.delete(i);
    });
  }
  return widths;
}

/** What nominalSectionWidthsExact reads from the state when the sections are the state's own. */
export interface OwnFrontGrid {
  /** state.frontGridExactWidthsMm: the exact widths saved by the manual front grid. */
  frontGridExactWidthsMm?: unknown;
  /** Whether the state has bodies (06a): with them, sections that all carry nominalMm keep those widths. */
  bodies?: unknown;
}

/** A section as the exact widths read it: the share and, after 06a, its own exact width. */
export interface SectionWidthSource extends SectionRatio {
  nominalMm?: unknown;
}

/**
 * Exact nominal widths of the sections (r1.html:4197 with the 06a layer r1.html:11562).
 * `own` is given when `sections` are the sections of the state (the prototype compared them with state.sections);
 * `frontGridMode` is state.frontGridMode. In the prototype WSource defaulted to the width field; here it is given.
 */
export function nominalSectionWidthsExact(WSource: unknown, sections: readonly SectionWidthSource[], frontGridMode: unknown, own: OwnFrontGrid | null): ExactMm[] {
  if (own && own.bodies && sections.every((s) => s.nominalMm)) return sections.map((s) => normalizeExactMm(s.nominalMm));
  const n = sections.length,
    total = parseExactMm(WSource);
  if (!n) return [];
  if (frontGridMode === 'EQUAL') return Array.from({ length: n }, () => exactDivideInteger(total, n));
  const saved = own && Array.isArray(own.frontGridExactWidthsMm) ? (own.frontGridExactWidthsMm as unknown[]).map(normalizeExactMm) : null;
  if (saved && saved.length === n) {
    if (exactCompare(exactSum(saved), total) === 0) return saved;
    return rescaleExactWidths(total, saved);
  }
  return derivedManualExactWidths(total, sections);
}

/** Indexes after which a new module starts: a module grows until the next section would pass the guide (r1.html:4215). */
export function recommendedModuleBreaksForWidths(nominalWidths: readonly number[], maxWidth: number = sectionGrid.constants.moduleWidthGuide.value): number[] {
  const breaks: number[] = [];
  let total = 0;
  nominalWidths.forEach((width, index) => {
    if (index && total + width > maxWidth + GRID_EPS) {
      breaks.push(index);
      total = 0;
    }
    total += width;
  });
  return breaks;
}

/** A module of the nominal grid. */
export interface GridModule {
  id: string;
  index: number;
  start: number;
  end: number;
  externalWidth: number;
  sectionIndexes: number[];
  firstSection: number;
  lastSection: number;
}

/** A section of the nominal grid with its clear opening. */
export interface GridSection {
  index: number;
  moduleId: string;
  localIndex: number;
  nominalWidth: number;
  clearOpeningWidth: number;
  nominalStart: number;
  nominalEnd: number;
  clearStart: number;
  clearEnd: number;
}

export interface NominalGrid {
  nominalSectionWidths: number[];
  clearSectionWidths: number[];
  sections: GridSection[];
  modules: GridModule[];
  breaks: number[];
  externalWidth: number;
}

/**
 * Nominal grid and clear openings (r1.html:4234; MOD-DEC-051: C_i = N_i − b_left − b_right): the outer side of a
 * module takes t, a divider t/2 on each side. A negative opening is shown as 0.
 */
export function computeNominalGrid(W: number, t: number, nominalWidths: readonly number[], breaks: readonly number[] = []): NominalGrid {
  const nominalStarts: number[] = [],
    nominalEnds: number[] = [];
  let x = 0;
  nominalWidths.forEach((w) => {
    nominalStarts.push(x);
    x += w;
    nominalEnds.push(x);
  });
  const ends = [...breaks, nominalWidths.length],
    modules: GridModule[] = [],
    sections: GridSection[] = [],
    sectionToModule: { module: GridModule; localIndex: number }[] = [];
  let first = 0;
  ends.forEach((end, mi) => {
    const sectionIndexes = Array.from({ length: end - first }, (_, k) => first + k),
      start = nominalStarts[first]!,
      finish = nominalEnds[end - 1]!,
      mod: GridModule = {
        id: `M${String(mi + 1).padStart(2, '0')}`,
        index: mi,
        start,
        end: finish,
        externalWidth: finish - start,
        sectionIndexes,
        firstSection: first,
        lastSection: end - 1,
      };
    modules.push(mod);
    sectionIndexes.forEach((idx, localIndex) => (sectionToModule[idx] = { module: mod, localIndex }));
    first = end;
  });
  nominalWidths.forEach((nominalWidth, i) => {
    const meta = sectionToModule[i]!,
      mod = meta.module,
      nominalStart = nominalStarts[i]!,
      nominalEnd = nominalEnds[i]!,
      clearStart = meta.localIndex === 0 ? mod.start + t : nominalStart + t / 2,
      clearEnd = meta.localIndex === mod.sectionIndexes.length - 1 ? mod.end - t : nominalEnd - t / 2;
    sections.push({
      index: i,
      moduleId: mod.id,
      localIndex: meta.localIndex,
      nominalWidth,
      clearOpeningWidth: Math.max(0, clearEnd - clearStart),
      nominalStart,
      nominalEnd,
      clearStart,
      clearEnd,
    });
  });
  return {
    nominalSectionWidths: nominalWidths.slice(),
    clearSectionWidths: sections.map((s) => s.clearOpeningWidth),
    sections,
    modules,
    breaks: breaks.slice(),
    externalWidth: W,
  };
}

/**
 * Smallest nominal width of a section (r1.html:4304): 160 mm whatever its side panels take (MOD-DEC-565). The
 * prototype added its sides to a 160 mm clear opening (FINDINGS 1164).
 */
export function sectionNominalMinimum(_section: { nominalWidth: number; clearOpeningWidth: number }): number {
  return MIN_NOMINAL;
}

/** Smallest wardrobe of n sections (r1.html:4307): n · 160 mm (MOD-DEC-565); the prototype took n · 160 + (n + 1) · t (FINDINGS 1164). */
export function minimumWardrobeWidth(_t: number, n: number): number {
  return n * MIN_NOMINAL;
}

/**
 * Whether n equal sections fit the width (r1.html:4310): each section is at least 160 mm wide and keeps an opening
 * (MOD-DEC-565; the prototype asked a 160 mm clear opening, FINDINGS 1164). The prototype took the module guide from
 * wardrobeSettings().maxCabinetModuleWidth, which is always WardrobeStandardPreset.maxCabinetModuleWidth.
 */
export function canFitSectionCount(W: number, t: number, n: number, maxModuleWidth: number = WardrobeStandardPreset.maxCabinetModuleWidth): boolean {
  if (n < 1 || n > MAX_SECTIONS) return false;
  const hypothetical = Array.from({ length: n }, () => ({ ratio: 1 / n })),
    widths = nominalWidthsFromRatios(W, hypothetical),
    breaks = recommendedModuleBreaksForWidths(widths, maxModuleWidth),
    grid = computeNominalGrid(W, t, widths, breaks);
  return grid.sections.every((s) => s.nominalWidth >= MIN_NOMINAL - GRID_EPS && s.clearOpeningWidth > GRID_EPS);
}

/** Horizontal outer offsets of a facade from the vertical borders of its cell (MOD-DEC-124: 1,5 mm by default). */
export interface FacadeInsets {
  insetLeft: number;
  insetRight: number;
}

/**
 * Facade cells of the front grid (r1.html:4488): one cell per section, or equal cells over the whole width with
 * the EQUAL_ROW policy. The prototype took the insets from v16FacadeProfile(gap) and the policy from
 * state.facadeWidthPolicy; here they are given.
 */
export function facadeRegions(sectionGeometry: readonly { nominalStart: number; nominalEnd: number }[], insets: FacadeInsets, facadeWidthPolicy: unknown) {
  const equal = facadeWidthPolicy === 'EQUAL_ROW',
    W = sectionGeometry.at(-1)?.nominalEnd ?? 0,
    N = sectionGeometry.length;
  return sectionGeometry.map((s, index) => {
    const nominalStart = equal ? (W * index) / N : s.nominalStart,
      nominalEnd = equal ? (W * (index + 1)) / N : s.nominalEnd,
      left = nominalStart + insets.insetLeft,
      right = nominalEnd - insets.insetRight,
      width = right - left;
    return {
      id: `FG-F${String(index + 1).padStart(2, '0')}`,
      index,
      left,
      right,
      width,
      nominalStart,
      nominalEnd,
      policy: facadeWidthPolicy,
      spans: [index],
      status: 'SUPPORTED',
    };
  });
}
