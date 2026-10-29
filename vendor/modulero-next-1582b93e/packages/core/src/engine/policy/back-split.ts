// The back panel of HDF in parts (MOD-DEC-701): a sheet as wide as a big body is hard to carry and a thin back
// without a middle support sags. The back is split on the rear edges of the full-height partitions, the parts are
// screwed to them; narrow neighbouring sections share one part while it is not wider than the limit. A section
// wider than the limit is split across on a fixed shelf; with no shelf there — along, with an H-profile between the
// parts. One pure function for every product: the wardrobe calls it, the kitchen and HOME may call it the same way.
import { constant, decision, unknownSource, type PolicyModule } from './types.js';

export const backSplit = {
  id: 'back-split',
  version: '1',
  constants: {
    maxPartWidthMm: constant(800, 'mm', decision('MOD-DEC-701'), 'Наибольшая ширина части задней стенки ХДФ: узкие соседние секции объединяются, пока часть не шире; шире — делится на полке или H-профилем'),
    hProfileWebMm: constant<number | null>(null, 'mm', unknownSource('MOD-DEC-701: толщина перемычки H-профиля в карточках магазинов не напечатана'), 'Толщина перемычки H-профиля между частями: пока не известна, части стоят встык'),
    seamScrewItem: constant(
      'HETTICH_SCREW_71925_PAD',
      'id',
      decision('MOD-DEC-701'),
      '(Д) Саморез крепления части к торцу опоры — 3,5 × 16 (принято Директором): запись каталога Hettich 71925 3,5 × 16',
    ),
    seamScrewPitchMm: constant(300, 'mm', decision('MOD-DEC-701'), '(Д) Наибольший шаг саморезов части по торцу опоры (принято Директором); саморезы — посередине равных отрезков стыка'),
    hProfileRubPerM: constant(
      18.87,
      'RUB/m',
      decision('MOD-DEC-569'),
      '(Д) H-профиль ПВХ для ДВП/ХДФ, белый: средняя трёх магазинов за отрезок 2 м (37,74 ₽) на метр, усреднённая цена проекта — docs/product/prices/back-h-profile-2026-10-27.md',
    ),
  },
} as const satisfies PolicyModule;

/**
 * The screws of a part along a seam on its support (MOD-DEC-701, (Д)): the seam is cut into the fewest equal lengths
 * not longer than the pitch, a screw in the middle of each — the positions along the seam.
 */
export function backSeamScrews(from: number, to: number, pitchMm = backSplit.constants.seamScrewPitchMm.value): number[] {
  const n = Math.ceil((to - from) / pitchMm),
    step = (to - from) / n;
  return to > from ? Array.from({ length: n }, (_, k) => from + step * (k + 1 / 2)) : [];
}

/** A support of the back: a full-height partition (`at` — the x of its middle) or a fixed shelf (`at` — the y of its middle, `from`–`to` — its run in x). */
export interface BackSupport {
  id: string;
  at: number;
  from: number;
  to: number;
}

export interface BackSplitInput {
  /** The back as one sheet, in the plane of the back: x across, y up. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** The partitions that hold the back over its whole height; the caller decides that they reach it. */
  partitions: readonly BackSupport[];
  /** The fixed shelves that reach the back. */
  shelves: readonly BackSupport[];
  /** How far a shelf may stop short of the edge of a part and still carry its seam: the thickness of the panel at that edge. */
  reachMm: number;
  /** Comparison of computed sizes: `tolerance.compare` (MOD-DEC-191). */
  compareMm: number;
  /** The limit; the decision's 800 mm by default. */
  maxWidthMm?: number;
}

export interface BackPiece {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A seam between two parts: on a partition or a shelf (`supportId`), or on an H-profile (`supportId` null). */
export interface BackSeam {
  axis: 'X' | 'Y';
  /** x of a seam along the height (axis X), y of a seam across (axis Y). */
  at: number;
  from: number;
  to: number;
  supportId: string | null;
  /** Indexes of the two parts in `pieces`. */
  pieces: [number, number];
}

export interface BackSplitPlan {
  pieces: BackPiece[];
  seams: BackSeam[];
}

/**
 * Splits a back by MOD-DEC-701. Parts are ordered left to right, and bottom to top within a section split across.
 * A back not wider than the limit, or not higher than it, stays one part. A wide section takes the shelf nearest to the middle of its height
 * (thread decision (Д): one seam halves the free field); with no shelf it is cut into equal parts not wider than the
 * limit, on H-profiles. A part above or below the shelf still wider and higher than the limit is cut so as well (Д,
 * FINDINGS 2601).
 */
export function splitBackPanel(input: BackSplitInput): BackSplitPlan {
  const max = input.maxWidthMm ?? backSplit.constants.maxPartWidthMm.value,
    eps = input.compareMm,
    { x0, x1, y0, y1 } = input;
  // A low back — of a chest, a base unit — is not split (Д): the limit is of the shorter side, the free span of the sheet.
  if (x1 - x0 <= max + eps || y1 - y0 <= max + eps) return { pieces: [{ x0, x1, y0, y1 }], seams: [] };
  const cuts = [...new Map(input.partitions.filter((p) => p.at > x0 + eps && p.at < x1 - eps).map((p) => [p.at, p])).values()].sort((a, b) => a.at - b.at),
    edges = [x0, ...cuts.map((c) => c.at), x1],
    // Greedy from the left (Д): a part takes the next section while it stays within the limit.
    columns: { x0: number; x1: number; left: string | null }[] = [];
  let start = 0;
  for (let k = 1; k < edges.length; k++) {
    const last = k === edges.length - 1;
    if (!last && edges[k + 1]! - edges[start]! <= max + eps) continue;
    columns.push({ x0: edges[start]!, x1: edges[k]!, left: start ? cuts[start - 1]!.id : null });
    start = k;
  }
  const pieces: BackPiece[] = [],
    seams: BackSeam[] = [];
  // A field wider and higher than the limit: equal parts along, not wider than it, on H-profiles; the indexes of its parts.
  const along = (xa: number, xb: number, ya: number, yb: number): number[] => {
    const n = xb - xa <= max + eps || yb - ya <= max + eps ? 1 : Math.ceil((xb - xa - eps) / max),
      step = (xb - xa) / n,
      own: number[] = [];
    for (let i = 0; i < n; i++) {
      const k = pieces.push({ x0: xa + i * step, x1: i === n - 1 ? xb : xa + (i + 1) * step, y0: ya, y1: yb }) - 1;
      if (i) seams.push({ axis: 'X', at: pieces[k]!.x0, from: ya, to: yb, supportId: null, pieces: [k - 1, k] });
      own.push(k);
    }
    return own;
  };
  let previous: number[] = [];
  for (const col of columns) {
    const own: number[] = [],
      width = col.x1 - col.x0;
    if (width <= max + eps) own.push(pieces.push({ x0: col.x0, x1: col.x1, y0, y1 }) - 1);
    else {
      const mid = (y0 + y1) / 2,
        shelf = input.shelves
          .filter((s) => s.at > y0 + eps && s.at < y1 - eps && s.from <= col.x0 + input.reachMm + eps && s.to >= col.x1 - input.reachMm - eps)
          .sort((a, b) => Math.abs(a.at - mid) - Math.abs(b.at - mid) || a.at - b.at)[0];
      if (shelf) {
        // A part above or below the shelf still wider and higher than the limit is split along on H-profiles (Д,
        // FINDINGS 2601); each part below meets each part above it on the shelf.
        const lower = along(col.x0, col.x1, y0, shelf.at),
          upper = along(col.x0, col.x1, shelf.at, y1);
        own.push(...lower, ...upper);
        for (const a of lower)
          for (const b of upper) {
            const from = Math.max(pieces[a]!.x0, pieces[b]!.x0),
              to = Math.min(pieces[a]!.x1, pieces[b]!.x1);
            if (to - from > eps) seams.push({ axis: 'Y', at: shelf.at, from, to, supportId: shelf.id, pieces: [a, b] });
          }
      } else own.push(...along(col.x0, col.x1, y0, y1));
    }
    // The seam on the partition between this column and the previous one, for every pair of parts that meet on it.
    if (col.left)
      for (const a of previous)
        for (const b of own.filter((i) => pieces[i]!.x0 === col.x0)) {
          const from = Math.max(pieces[a]!.y0, pieces[b]!.y0),
            to = Math.min(pieces[a]!.y1, pieces[b]!.y1);
          if (to - from > eps) seams.push({ axis: 'X', at: col.x0, from, to, supportId: col.left, pieces: [a, b] });
        }
    previous = own.filter((i) => pieces[i]!.x1 === col.x1);
  }
  return { pieces, seams };
}
