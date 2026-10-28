// Cutting of the bars (MOD-DEC-520): the pieces of a profile laid out on whole bars of its catalogue length, as the
// cutting plan of the sheets lays the blanks out on whole sheets (MOD-DEC-430). The price buys the bars of this plan,
// not the net metres; what is left of the last bars is a leftover of the maker (MOD-DEC-511).
//
// The rule is the prototype's for a bar of metal (the hanger rail of the kitchen, r1.html:79812): the pieces from the
// longest, each to the first bar it fits, every piece takes its length and one kerf. It is the best layout found, not
// a proven optimum; it is exact in what it promises (`checkBarCutting`).

const EPS = 1e-6;

/** A piece to cut: an id and its length, mm. */
export interface BarPiece {
  id: string;
  lengthMm: number;
}

/** One bar of the plan: its pieces in the order of the cuts and what is left of it, mm. */
export interface Bar {
  index: number;
  pieces: BarPiece[];
  /** The pieces and their kerfs, mm. */
  usedMm: number;
  leftoverMm: number;
}

/** The bars of one profile. */
export interface BarCutting {
  stockMm: number;
  kerfMm: number;
  bars: Bar[];
  /** Pieces longer than a bar: not laid out; a longer bar or a joint is for the maker to decide. */
  tooLong: BarPiece[];
  /** Σ length of the pieces laid out, mm. */
  netMm: number;
  /** Σ leftover of the bars, mm. */
  leftoverMm: number;
}

const round = (x: number): number => Math.round(x * 1e6) / 1e6;

/** The pieces on whole bars of `stockMm`, a kerf of `kerfMm` per piece (first fit, from the longest). */
export function barCutting(pieces: readonly BarPiece[], stockMm: number, kerfMm: number): BarCutting {
  if (!(stockMm > 0) || !(kerfMm >= 0)) throw Error(`bar cutting: stock ${stockMm}, kerf ${kerfMm}`);
  const bars: Bar[] = [],
    tooLong: BarPiece[] = [];
  const order = [...pieces].sort((a, b) => b.lengthMm - a.lengthMm || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const p of order) {
    const need = p.lengthMm + kerfMm;
    if (!(p.lengthMm > 0) || need > stockMm + EPS) {
      tooLong.push(p);
      continue;
    }
    let bar = bars.find((b) => b.leftoverMm + EPS >= need);
    if (!bar) bars.push((bar = { index: bars.length + 1, pieces: [], usedMm: 0, leftoverMm: stockMm }));
    bar.pieces.push(p);
    bar.usedMm = round(bar.usedMm + need);
    bar.leftoverMm = round(stockMm - bar.usedMm);
  }
  return {
    stockMm,
    kerfMm,
    bars,
    tooLong,
    netMm: round(bars.reduce((n, b) => n + b.pieces.reduce((m, p) => m + p.lengthMm, 0), 0)),
    leftoverMm: round(bars.reduce((n, b) => n + b.leftoverMm, 0)),
  };
}

/** Independent check of a plan: every piece once, each bar holds its pieces with their kerfs, no fewer bars than the lengths need. */
export function checkBarCutting(plan: BarCutting, pieces: readonly BarPiece[]): string[] {
  const out: string[] = [],
    seen = new Map<string, number>();
  for (const b of plan.bars) {
    const used = b.pieces.reduce((n, p) => n + p.lengthMm + plan.kerfMm, 0);
    if (used > plan.stockMm + EPS) out.push(`хлыст ${b.index}: ${used} мм > ${plan.stockMm} мм`);
    if (Math.abs(used + b.leftoverMm - plan.stockMm) > 1e-3) out.push(`хлыст ${b.index}: остаток ${b.leftoverMm} мм не сходится`);
    if (!b.pieces.length) out.push(`хлыст ${b.index}: пустой`);
    for (const p of b.pieces) seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
  }
  for (const p of plan.tooLong) seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
  for (const p of pieces) if (seen.get(p.id) !== 1) out.push(`деталь ${p.id}: в плане ${seen.get(p.id) ?? 0} раз`);
  if (seen.size !== pieces.length) out.push('в плане есть детали не из списка');
  const tooLong = new Set(plan.tooLong.map((p) => p.id)),
    need = pieces.filter((p) => !tooLong.has(p.id)).reduce((n, p) => n + p.lengthMm + plan.kerfMm, 0);
  if (plan.bars.length < Math.ceil(need / plan.stockMm - EPS)) out.push('хлыстов меньше нижней границы');
  return out;
}
