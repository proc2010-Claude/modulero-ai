// Cutting plan of the sheets (task CUT-1, MOD-DEC-430): the blanks S of the graph laid out on the sheets of each
// board for the workshop — the format of the sheet, the kerf of the saw, the trim of the sheet edges, the grain and
// the edges of every blank. A projection of one graph, as the drawings: every blank is a part of the graph with its
// id, its sawn size S (dimensionChain.sawnBlank, MOD-DEC-169) and its revision (INV-H25-01).
//
// The cuts are guillotine cuts — every cut goes from one side of its piece of the sheet to the other, as a panel saw
// cuts. The search is deterministic: several orders of the blanks, choices of the free piece and of the first cut
// (CUT_SEARCH); the plan with the fewest sheets, then the shortest saw run, then the larger offcuts wins. It is the
// best plan found, not a proven optimum; it is exact in what it promises: every blank fits its place in its
// orientation, at least one kerf from its neighbours, inside the trimmed sheet (`checkCuttingPlan`).
//
// The price takes its sheets and its saw run from this plan (MOD-DEC-505): the service has one cut, there is no
// separate estimate of the prototype.
//
// The kerf and the trim the user does not give are the owner's defaults (MOD-DEC-445: 4.4 mm and 10 mm), and the plan
// says so. The format of the sheet has no default (430 (Д)): a board without a format in the catalogue or from the
// user is not laid out, and the plan says what is missing.
import type { EdgeSlot, Graph, Part } from './contract.js';
import { drawingIdentity, sheetPrimitives as P, type DrawingIdentity, type Sheet } from './drawings.js';
import { CUT_SEARCH, cuttingPlan as policy } from './policy/cutting.js';
import { drawingSheets } from './policy/drawing.js';

const EPS = 1e-6;

/** Materials not cut on a panel saw. A board whose family is not confirmed (UNKNOWN) is a board: it is cut. */
const NOT_SHEET = new Set(['GLASS', 'MIRROR', 'METAL']);
const FAMILY_RU: Readonly<Record<string, string>> = { LDSP: 'ЛДСП', LMDF: 'ЛМДФ', HDF: 'ХДФ', MDF: 'МДФ', UNKNOWN: 'Плита' };

// ---------------------------------------------------------------- materials and parameters

/** A board of the plan: one family, decor and thickness — the parts of one group are cut from the same sheets. */
export interface CuttingMaterial {
  key: string;
  family: string;
  decorId: string;
  label: string;
  thicknessMm: number;
  /** Format of the board in the catalogue: [along the grain, across], mm, and where it is from; null — the user gives it. */
  catalogSheetMm: [number, number] | null;
  catalogRef: string | null;
  partIds: string[];
  /** Parts with a grain direction: they are not turned while the grain is respected. */
  grainedParts: number;
}

export interface CuttingMaterialParams {
  /** Format of the sheet, [along the grain, across], mm; absent — the catalogue format; half a format is no format. */
  sheetMm?: readonly [number | null, number | null] | null;
  /** Respect the grain of the parts (default: policy `respectGrain`); false — a plain decor, any blank may turn. */
  respectGrain?: boolean;
}

/** What the user gives the plan: the saw and, per board, the sheet and the grain. */
export interface CuttingParams {
  /** Kerf of the saw, mm; null — the default of MOD-DEC-445. */
  kerfMm: number | null;
  /** Trim of each edge of the sheet before the blanks, mm (0 — the sheet edge is used as it is); null — the default. */
  trimMm: number | null;
  materials?: Readonly<Record<string, CuttingMaterialParams>>;
}

/** A format of the catalogue for a part, if the product knows one (the wardrobe: the board variant of the decor). */
export type CatalogFormat = (p: Part) => { sheetMm: [number, number]; ref: string } | null;

const materialKey = (p: Part) => [p.material.family, p.material.decorId, p.material.panelThicknessMm].join('|');

/** Why a part of the graph is not in the plan, or null when it is cut from a sheet. */
function exclusion(p: Part): string | null {
  if (p.supply === 'PURCHASED' || p.material.purpose === 'PURCHASE') return 'покупная деталь — не раскраивается';
  if (NOT_SHEET.has(p.material.family)) return `материал ${p.material.family} не раскраивается на листовом станке`;
  if (!p.dimensionChain.sawnBlank) return `пильная заготовка S неизвестна: ${p.dimensionChain.missing.join(', ') || 'нет данных'}`;
  return null;
}

/** The boards of the graph that the plan cuts, in the order of the parts. */
export function cuttingMaterialsOf(g: Pick<Graph, 'parts'>, catalog?: CatalogFormat): CuttingMaterial[] {
  const out = new Map<string, CuttingMaterial>();
  for (const p of g.parts) {
    if (exclusion(p)) continue;
    const key = materialKey(p);
    let m = out.get(key);
    if (!m) {
      const c = p.material.sheetFormatMm ? { sheetMm: p.material.sheetFormatMm, ref: 'граф: формат листа материала детали' } : (catalog?.(p) ?? null);
      m = {
        key,
        family: p.material.family,
        decorId: p.material.decorId,
        label: p.material.label,
        thicknessMm: p.material.panelThicknessMm,
        catalogSheetMm: c ? [c.sheetMm[0], c.sheetMm[1]] : null,
        catalogRef: c?.ref ?? null,
        partIds: [],
        grainedParts: 0,
      };
      out.set(key, m);
    }
    m.partIds.push(p.id);
    if (p.orientation.grainDirection !== 'NONE') m.grainedParts++;
  }
  return [...out.values()];
}

/** «ЛДСП 16 мм · W960». */
export const materialTitle = (m: Pick<CuttingMaterial, 'family' | 'thicknessMm' | 'label'>) => `${FAMILY_RU[m.family] ?? m.family} ${P.fmt(m.thicknessMm)} мм · ${m.label}`;

/**
 * The saw run of a blank larger than the sheet (`CuttingGroup.tooLarge`), conditionally sawn out of a whole sheet
 * `sheetMm` of a larger format, as the plan cuts a sheet with one blank: the trim of its edges — two cuts along its
 * length, two across between them — and the two cuts of the blank (R3-006, FINDINGS 1786, (Д)); a blank of an unknown
 * size — the trims only. The plan has no cut of it (MOD-DEC-505): each product prices it as a line of its own.
 */
export function largerSheetCutMm(sheetMm: readonly [number, number], trimMm: number, blank: { lengthMm: number; widthMm: number } | null | undefined): number {
  const [l, w] = [blank?.lengthMm, blank?.widthMm].map((x) => (typeof x === 'number' && x > 0 ? x : 0)) as [number, number];
  return 2 * sheetMm[0] + 2 * Math.max(0, sheetMm[1] - 2 * trimMm) + l + w;
}

// ---------------------------------------------------------------- the plan

export type SheetSide = 'BOTTOM' | 'TOP' | 'LEFT' | 'RIGHT';

/** A blank on a sheet. Sheet axes: X along the first size of the format (the grain of the sheet), Y across; mm. */
export interface CutPiece {
  /** Number of the blank in the plan: the same on the map, in the CSV and on the label. */
  no: number;
  partId: string;
  name: string;
  /** Sawn blank S of the part, mm. */
  lengthMm: number;
  widthMm: number;
  /** The length of the part goes along Y of the sheet. */
  rotated: boolean;
  x: number;
  y: number;
  /** Size on the sheet: along X and along Y. */
  w: number;
  h: number;
  grain: Part['orientation']['grainDirection'];
  /** Band thickness of edges A–D, null — no band; and the side of the sheet each edge faces. */
  edges: Record<EdgeSlot, { thicknessMm: number | null; side: SheetSide }>;
}

/** A cut of the saw: along X (`H`, a line y = at) or along Y (`V`, a line x = at); the kerf is from `at` up. */
export interface CutLine {
  /** Order of the cut on the sheet: the trims, then each piece before the pieces it gives. */
  no: number;
  axis: 'H' | 'V';
  at: number;
  from: number;
  to: number;
  /** 0 — trim of the sheet edge; 1 — first cut of the useful sheet; n — a cut of a piece made by a cut of level n − 1. */
  level: number;
}

export interface Offcut {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CutSheet {
  /** Number of the sheet within its board. */
  no: number;
  sheetMm: [number, number];
  pieces: CutPiece[];
  cuts: CutLine[];
  /** The free pieces of the sheet after the last cut. */
  offcuts: Offcut[];
  /** Area of the blanks over the area of the whole sheet. */
  usedAreaMm2: number;
  utilization: number;
  cutLengthMm: number;
}

export interface CuttingGroup {
  material: CuttingMaterial;
  /** The parameters the board was cut with; null when one is missing. */
  sheetMm: [number, number] | null;
  sheetSource: 'USER' | 'CATALOG' | null;
  respectGrain: boolean;
  status: 'CUT' | 'MISSING_PARAMS' | 'PARTLY_CUT';
  missing: string[];
  sheets: CutSheet[];
  /** Parts larger than the useful sheet in every allowed orientation: not laid out. */
  tooLarge: { partId: string; reason: string }[];
  pieceCount: number;
  utilization: number;
  cutLengthMm: number;
}

export interface CuttingPlan {
  /** Revision of the project the plan is cut from (INV-S04). */
  revision: string;
  identity: DrawingIdentity;
  policy: string;
  kerfMm: number;
  trimMm: number;
  /** The parameters taken from the defaults of MOD-DEC-445, not given by the user. */
  defaults: ('kerfMm' | 'trimMm')[];
  /** COMPLETE — every part cut from a sheet is laid out; INCOMPLETE — parameters are missing or a blank does not fit. */
  status: 'COMPLETE' | 'INCOMPLETE';
  groups: CuttingGroup[];
  /** Parts of the graph not in the plan, and why. */
  excluded: { partId: string; reason: string }[];
  problems: string[];
  /** Notes the user should know: the sawn sizes are not qualified, a contour part is cut by its envelope. */
  notes: string[];
  algorithm: string;
}

const validSize = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const validFormat = (s: unknown): s is [number, number] => Array.isArray(s) && s.length === 2 && s.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0);

// ---------------------------------------------------------------- the guillotine search

interface Item {
  part: Part;
  L: number;
  W: number;
  /** Allowed: as is (length along X) and turned (length along Y). */
  asIs: boolean;
  turned: boolean;
}

/** A free piece of a sheet; once a blank is put in it, `cut` is what it was cut into. */
interface Free {
  kind: 'FREE';
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  cut: Node | null;
}

type Node = Free | { kind: 'PIECE'; x: number; y: number; w: number; h: number; item: Item; rotated: boolean } | { kind: 'SPLIT'; axis: 'H' | 'V'; at: number; from: number; to: number; level: number; children: Node[] };

interface Bin {
  sheetMm: [number, number];
  root: Free;
  free: Free[];
  /** The largest shorter and longer side of its free pieces: a blank larger than either fits none of them. */
  maxShort: number;
  maxLong: number;
}

type Order = (typeof CUT_SEARCH.orders)[number];
type Fit = (typeof CUT_SEARCH.fits)[number];
type Split = (typeof CUT_SEARCH.splits)[number];

function measure(order: Order, i: Item): number {
  switch (order) {
    case 'AREA':
      return i.L * i.W;
    case 'LONG_SIDE':
      return Math.max(i.L, i.W);
    case 'LENGTH':
      return i.L;
    case 'WIDTH':
      return i.W;
    default:
      return i.L + i.W;
  }
}

function score(fit: Fit, r: { w: number; h: number }, w: number, h: number): number {
  const dw = r.w - w,
    dh = r.h - h;
  return fit === 'BEST_AREA' ? r.w * r.h - w * h : fit === 'BEST_SHORT_SIDE' ? Math.min(dw, dh) : Math.max(dw, dh);
}

/** The first cut across the free piece: `H` cuts the full width (the strip above is whole), `V` the full height. */
function firstCut(split: Split, r: { w: number; h: number }, w: number, h: number): 'H' | 'V' {
  const dw = r.w - w,
    dh = r.h - h;
  switch (split) {
    case 'SHORTER_LEFTOVER':
      return dw <= dh ? 'H' : 'V';
    case 'LONGER_LEFTOVER':
      return dw > dh ? 'H' : 'V';
    case 'MIN_AREA':
      return w * dh <= h * dw ? 'V' : 'H';
    case 'MAX_AREA':
      return w * dh > h * dw ? 'V' : 'H';
    case 'ALONG_LENGTH':
      return 'H';
    default:
      return 'V';
  }
}

/** The ways a blank fits a free piece: size on the sheet and turn. A rest narrower than the kerf is sawdust. */
function fits(i: Item, r: { w: number; h: number }): { w: number; h: number; rotated: boolean }[] {
  const out: { w: number; h: number; rotated: boolean }[] = [];
  if (i.asIs && i.L <= r.w + EPS && i.W <= r.h + EPS) out.push({ w: i.L, h: i.W, rotated: false });
  if (i.turned && i.W <= r.w + EPS && i.L <= r.h + EPS && !(i.asIs && Math.abs(i.L - i.W) < EPS)) out.push({ w: i.W, h: i.L, rotated: true });
  return out;
}

/** The rest of a piece beyond a cut: a free piece of the bin, none if it has no area. */
function restOf(made: Free[], x: number, y: number, w: number, h: number, level: number): Node[] {
  if (!(w > EPS && h > EPS)) return [];
  const r: Free = { kind: 'FREE', x, y, w, h, level, cut: null };
  made.push(r);
  return [r];
}

/** A cut along one axis of a piece: the blank side and the rest beyond the kerf (none if narrower than the kerf). */
function cutH(r: { x: number; y: number; w: number; h: number }, size: number, level: number, inner: Node, kerf: number, made: Free[]): Node {
  return r.h - size > EPS ? { kind: 'SPLIT', axis: 'H', at: r.y + size, from: r.x, to: r.x + r.w, level, children: [inner, ...restOf(made, r.x, r.y + size + kerf, r.w, r.h - size - kerf, level + 1)] } : inner;
}
function cutV(r: { x: number; y: number; w: number; h: number }, size: number, level: number, inner: Node, kerf: number, made: Free[]): Node {
  return r.w - size > EPS ? { kind: 'SPLIT', axis: 'V', at: r.x + size, from: r.y, to: r.y + r.h, level, children: [inner, ...restOf(made, r.x + size + kerf, r.y, r.w - size - kerf, r.h, level + 1)] } : inner;
}

/** Puts a blank at the lower left corner of a free piece and cuts it out with two guillotine cuts at most. */
function place(bin: Bin, f: Free, i: Item, w: number, h: number, rotated: boolean, axis: 'H' | 'V', kerf: number): void {
  const piece: Node = { kind: 'PIECE', x: f.x, y: f.y, w, h, item: i, rotated },
    level = f.level,
    made: Free[] = [];
  f.cut =
    axis === 'H'
      ? cutH(f, h, level, cutV({ x: f.x, y: f.y, w: f.w, h }, w, f.h - h > EPS ? level + 1 : level, piece, kerf, made), kerf, made)
      : cutV(f, w, level, cutH({ x: f.x, y: f.y, w, h: f.h }, h, f.w - w > EPS ? level + 1 : level, piece, kerf, made), kerf, made);
  bin.free.splice(bin.free.indexOf(f), 1, ...made);
  // The rests lie inside the piece: the bounds of the bin drop only if the piece held one of them.
  if (Math.min(f.w, f.h) < bin.maxShort && Math.max(f.w, f.h) < bin.maxLong) return;
  bin.maxShort = bin.maxLong = 0;
  for (const r of bin.free) {
    bin.maxShort = Math.max(bin.maxShort, Math.min(r.w, r.h));
    bin.maxLong = Math.max(bin.maxLong, Math.max(r.w, r.h));
  }
}

function newBin(sheetMm: [number, number], trim: number): Bin {
  const root: Free = { kind: 'FREE', x: trim, y: trim, w: sheetMm[0] - 2 * trim, h: sheetMm[1] - 2 * trim, level: 1, cut: null };
  return { sheetMm, root, free: [root], maxShort: Math.min(root.w, root.h), maxLong: Math.max(root.w, root.h) };
}

/**
 * The blanks in the order a layout takes them: the larger measure first, then the longer side, then the rest of the
 * blank — its other side, its length and how it may lie; the id orders only blanks the layout cannot tell apart. So
 * the layout, the sheets and the saw run do not depend on the ids of the parts, which the history of edits gives
 * (R2-033, FINDINGS 1778): the same blanks are cut the same way whatever bodies they came from.
 */
const sortedFor = (items: Item[], order: Order): Item[] =>
  items
    .slice()
    .sort(
      (a, b) =>
        measure(order, b) - measure(order, a) ||
        Math.max(b.L, b.W) - Math.max(a.L, a.W) ||
        Math.min(b.L, b.W) - Math.min(a.L, a.W) ||
        b.L - a.L ||
        Number(b.asIs) - Number(a.asIs) ||
        Number(b.turned) - Number(a.turned) ||
        a.part.id.localeCompare(b.part.id),
    );

/**
 * The layout of blanks in the order of a layout (`sortedFor`), a fit and a split; null as soon as it takes more sheets
 * than `limit` (it cannot be the best). The blanks are sorted once per order, not per fit and split (MOD-DEC-244).
 */
function pack(sorted: Item[], sheetMm: [number, number], kerf: number, trim: number, fit: Fit, split: Split, limit = Infinity): Bin[] | null {
  const bins: Bin[] = [];
  for (const i of sorted) {
    // The ways of fits(), as is first: the first of equal scores wins. No object per try — the search is hot (MOD-DEC-244).
    const twin = i.asIs && Math.abs(i.L - i.W) < EPS,
      short = Math.min(i.L, i.W),
      long = Math.max(i.L, i.W);
    let bin: Bin | null = null,
      at: Free | null = null,
      w = 0,
      h = 0,
      rotated = false,
      best = 0;
    for (const b of bins) {
      // A blank fits a piece only with its shorter side within the piece's shorter one and its longer within the longer.
      if (short > b.maxShort + EPS || long > b.maxLong + EPS) continue;
      for (const f of b.free) {
        if (i.asIs && i.L <= f.w + EPS && i.W <= f.h + EPS) {
          const s = score(fit, f, i.L, i.W);
          if (!at || s < best - EPS) {
            bin = b;
            at = f;
            w = i.L;
            h = i.W;
            rotated = false;
            best = s;
          }
        }
        if (i.turned && !twin && i.W <= f.w + EPS && i.L <= f.h + EPS) {
          const s = score(fit, f, i.W, i.L);
          if (!at || s < best - EPS) {
            bin = b;
            at = f;
            w = i.W;
            h = i.L;
            rotated = true;
            best = s;
          }
        }
      }
    }
    if (!bin || !at) {
      if (bins.length >= limit) return null;
      const fresh = newBin(sheetMm, trim),
        o = fits(i, fresh.root).sort((a, b) => score(fit, fresh.root, a.w, a.h) - score(fit, fresh.root, b.w, b.h))[0]!;
      bins.push(fresh);
      [bin, at, w, h, rotated] = [fresh, fresh.root, o.w, o.h, o.rotated];
    }
    place(bin, at, i, w, h, rotated, firstCut(split, at, w, h), kerf);
  }
  return bins;
}

const SIDES_AS_IS: Record<EdgeSlot, SheetSide> = { A: 'BOTTOM', B: 'TOP', C: 'LEFT', D: 'RIGHT' };
// Turned a quarter: the length (u) goes along +Y, the width (v) along −X.
const SIDES_TURNED: Record<EdgeSlot, SheetSide> = { A: 'RIGHT', B: 'LEFT', C: 'BOTTOM', D: 'TOP' };

/** The sheet of a bin: the trims first, then the cuts of the tree, each piece before the pieces it gives. */
function sheetOf(bin: Bin, no: number, kerf: number, trim: number): Omit<CutSheet, 'pieces' | 'cuts'> & { pieces: Omit<CutPiece, 'no'>[]; cuts: Omit<CutLine, 'no'>[] } {
  const [SL, SW] = bin.sheetMm,
    cuts: Omit<CutLine, 'no'>[] = [],
    pieces: Omit<CutPiece, 'no'>[] = [],
    offcuts: Offcut[] = [];
  // The trims: the kerf of each lies in the trimmed strip, so the useful sheet starts at the trim.
  if (trim > EPS)
    cuts.push(
      { axis: 'H', at: trim - kerf, from: 0, to: SL, level: 0 },
      { axis: 'H', at: SW - trim, from: 0, to: SL, level: 0 },
      { axis: 'V', at: trim - kerf, from: trim, to: SW - trim, level: 0 },
      { axis: 'V', at: SL - trim, from: trim, to: SW - trim, level: 0 },
    );
  const walk = (n: Node) => {
    if (n.kind === 'SPLIT') {
      cuts.push({ axis: n.axis, at: n.at, from: n.from, to: n.to, level: n.level });
      n.children.forEach(walk);
    } else if (n.kind === 'FREE') {
      if (n.cut) walk(n.cut);
      else offcuts.push({ x: n.x, y: n.y, w: n.w, h: n.h });
    } else {
      const p = n.item.part,
        sides = n.rotated ? SIDES_TURNED : SIDES_AS_IS;
      pieces.push({
        partId: p.id,
        name: p.name,
        lengthMm: n.item.L,
        widthMm: n.item.W,
        rotated: n.rotated,
        x: n.x,
        y: n.y,
        w: n.w,
        h: n.h,
        grain: p.orientation.grainDirection,
        edges: Object.fromEntries((['A', 'B', 'C', 'D'] as const).map((s) => [s, { thicknessMm: p.edges[s].intent === 'NONE' ? null : p.edges[s].edgeBandThicknessMm, side: sides[s] }])) as CutPiece['edges'],
      });
    }
  };
  walk(bin.root);
  const used = pieces.reduce((a, p) => a + p.w * p.h, 0);
  return {
    no,
    sheetMm: bin.sheetMm,
    pieces,
    cuts,
    offcuts,
    usedAreaMm2: used,
    utilization: used / (SL * SW),
    cutLengthMm: cuts.reduce((a, c) => a + (c.to - c.from), 0),
  };
}

/** What plans are ordered by: the sheets, the saw run (summed as `sheetOf` sums it) and the squares of the offcut areas. */
interface Score {
  sheets: number;
  run: number;
  spread: number;
}
function scoreOf(bins: Bin[], trim: number): Score {
  const run = bins.reduce((n, bin) => {
    const lengths: number[] = trim > EPS ? [bin.sheetMm[0], bin.sheetMm[0], bin.sheetMm[1] - 2 * trim, bin.sheetMm[1] - 2 * trim] : [];
    const walk = (x: Node) => {
      if (x.kind === 'SPLIT') {
        lengths.push(x.to - x.from);
        x.children.forEach(walk);
      } else if (x.kind === 'FREE' && x.cut) walk(x.cut);
    };
    walk(bin.root);
    return n + lengths.reduce((a, c) => a + c, 0);
  }, 0);
  return { sheets: bins.length, run, spread: bins.reduce((n, bin) => n + bin.free.reduce((m, f) => m + (f.w * f.h) ** 2, 0), 0) };
}

/**
 * The layouts of one graph already searched, by board, sheet, saw and grain: the plans of one graph that share it lay
 * a board out once (the format of the price estimate and the plan it chooses, wardrobe/cutting-plan.ts). Never shared
 * between graphs.
 */
export type CuttingLayouts = Map<string, unknown>;

/** The order of plans: fewer sheets, a shorter saw run, then the larger offcuts (squares of their areas). */
function better(a: Score, b: Score | null): boolean {
  if (!b) return true;
  if (a.sheets !== b.sheets) return a.sheets < b.sheets;
  if (Math.abs(a.run - b.run) > EPS) return a.run < b.run;
  return a.spread > b.spread + EPS;
}

/**
 * The cutting plan of a graph with the parameters of the user (task CUT-1, MOD-DEC-430). Every part made from a sheet
 * of a board (not glass, mirror or metal) is a blank of its board, by its sawn size S; the purchased parts and the parts without S are
 * listed in `excluded`. A board without a format, or a plan without the kerf or the trim, is not cut: `missing` says
 * what the user should give.
 */
export function cuttingPlanOf(
  g: Pick<Graph, 'parts' | 'revision' | 'versions' | 'result'>,
  params: CuttingParams,
  opts: { catalog?: CatalogFormat; appVersion?: string; layouts?: CuttingLayouts; fewestSheets?: boolean } = {},
): CuttingPlan {
  const C = policy.constants,
    kerf = validSize(params.kerfMm) ? params.kerfMm : C.kerfMm.value,
    trim = validSize(params.trimMm) ? params.trimMm : C.trimMm.value,
    defaults = [...(validSize(params.kerfMm) ? [] : (['kerfMm'] as const)), ...(validSize(params.trimMm) ? [] : (['trimMm'] as const))],
    excluded = g.parts.flatMap((p) => {
      const why = exclusion(p);
      return why ? [{ partId: p.id, reason: why }] : [];
    }),
    byId = new Map(g.parts.map((p) => [p.id, p])),
    groups: CuttingGroup[] = [],
    problems: string[] = [];
  for (const m of cuttingMaterialsOf(g, opts.catalog)) {
    const mp = params.materials?.[m.key] ?? {},
      own = validFormat(mp.sheetMm) ? ([mp.sheetMm[0], mp.sheetMm[1]] as [number, number]) : null,
      sheetMm = own ?? m.catalogSheetMm,
      respectGrain = mp.respectGrain ?? C.respectGrain.value,
      missing = sheetMm ? [] : ['формат листа'],
      group: CuttingGroup = { material: m, sheetMm, sheetSource: own ? 'USER' : sheetMm ? 'CATALOG' : null, respectGrain, status: 'MISSING_PARAMS', missing, sheets: [], tooLarge: [], pieceCount: 0, utilization: 0, cutLengthMm: 0 };
    groups.push(group);
    if (!sheetMm) {
      problems.push(`${materialTitle(m)}: не задано — ${missing.join(', ')}`);
      continue;
    }
    if (sheetMm[0] - 2 * trim <= EPS || sheetMm[1] - 2 * trim <= EPS) {
      group.missing = ['формат листа больше двух обрезок'];
      problems.push(`${materialTitle(m)}: обрезка ${P.fmt(trim)} мм не оставляет полезного листа ${sheetMm.map(P.fmt).join(' × ')} мм`);
      continue;
    }
    const usable = { w: sheetMm[0] - 2 * trim, h: sheetMm[1] - 2 * trim },
      items: Item[] = [];
    for (const id of m.partIds) {
      const p = byId.get(id)!,
        S = p.dimensionChain.sawnBlank!,
        grain = respectGrain ? p.orientation.grainDirection : 'NONE',
        item: Item = { part: p, L: S.lengthMm, W: S.widthMm, asIs: grain !== 'ALONG_WIDTH', turned: grain !== 'ALONG_LENGTH' };
      if (!(S.lengthMm > EPS && S.widthMm > EPS)) {
        group.tooLarge.push({ partId: id, reason: `пильная заготовка ${P.fmt(S.lengthMm)} × ${P.fmt(S.widthMm)} мм` });
        continue;
      }
      if (!fits(item, usable).length) {
        group.tooLarge.push({ partId: id, reason: `заготовка ${P.fmt(S.lengthMm)} × ${P.fmt(S.widthMm)} мм больше полезного листа ${P.fmt(usable.w)} × ${P.fmt(usable.h)} мм${grain === 'NONE' ? '' : ' с учётом текстуры'}` });
        continue;
      }
      items.push(item);
    }
    // `fewestSheets`: only the number of sheets is asked (the format of the price estimate) — the search stops at a
    // layout with no more sheets than the area of the blanks needs; its layout is not the plan, kept under its own key.
    const plain = `${m.key}|${sheetMm.join('×')}|${kerf}|${trim}|${respectGrain}`,
      memo = plain + (opts.fewestSheets ? '|sheets' : ''),
      bound = opts.fewestSheets ? Math.ceil(items.reduce((a, i) => a + i.L * i.W, 0) / (usable.w * usable.h) - EPS) : 0,
      // The plan has the fewest sheets: a layout with more is never laid out to its end, whatever its saw run.
      fewest = opts.fewestSheets ? undefined : (opts.layouts?.get(plain + '|sheets') as Bin[] | null | undefined)?.length;
    let best = (opts.layouts?.get(memo) as Bin[] | null | undefined) ?? null,
      top: Score | null = null;
    // An order that sorts the blanks into the sizes of an earlier order lays them out as it did: no layout of it is
    // better than the best so far (the order of plans is strict), it is not packed again — the plan is the same.
    const seen = new Set<string>();
    if (items.length && !opts.layouts?.has(memo))
      search: for (const order of CUT_SEARCH.orders) {
        const sorted = sortedFor(items, order),
          sizes = sorted.map((i) => `${i.L}×${i.W}${i.asIs ? 'a' : ''}${i.turned ? 't' : ''}`).join(' ');
        if (seen.has(sizes)) continue;
        seen.add(sizes);
        for (const fit of CUT_SEARCH.fits)
          for (const split of CUT_SEARCH.splits) {
            // A layout with more sheets than the best so far is never better (the order of plans): it stops early.
            const bins = pack(sorted, sheetMm, kerf, trim, fit, split, top ? top.sheets - (opts.fewestSheets ? 1 : 0) : (fewest ?? Infinity));
            if (!bins) continue;
            const sc = scoreOf(bins, trim);
            if (better(sc, top)) [best, top] = [bins, sc];
            if (opts.fewestSheets && top!.sheets <= bound) break search;
          }
      }
    opts.layouts?.set(memo, best);
    let no = 0;
    group.sheets = (best ?? []).map((bin, k) => {
      const s = sheetOf(bin, k + 1, kerf, trim);
      return { ...s, pieces: s.pieces.map((p) => ({ ...p, no: 0 })), cuts: s.cuts.map((c, i) => ({ ...c, no: i + 1 })) };
    });
    // Blanks are numbered sheet by sheet, from the lower left corner along the sheet.
    for (const s of group.sheets) {
      s.pieces.sort((a, b) => a.y - b.y || a.x - b.x);
      for (const p of s.pieces) p.no = ++no;
    }
    group.pieceCount = no;
    const area = group.sheets.reduce((a, s) => a + s.sheetMm[0] * s.sheetMm[1], 0);
    group.utilization = area ? group.sheets.reduce((a, s) => a + s.usedAreaMm2, 0) / area : 0;
    group.cutLengthMm = group.sheets.reduce((a, s) => a + s.cutLengthMm, 0);
    group.status = group.tooLarge.length ? 'PARTLY_CUT' : 'CUT';
    for (const t of group.tooLarge) problems.push(`${materialTitle(m)}, ${t.partId}: ${t.reason} — нужен больший формат или стык (решает мебельщик)`);
  }
  const unknownS = excluded.filter((e) => e.reason.startsWith('пильная'));
  for (const e of unknownS) problems.push(`${e.partId}: ${e.reason}`);
  const planned = groups.flatMap((x) => x.material.partIds).map((id) => byId.get(id)!),
    notes = [
      ...(defaults.length ? [`${defaults.map((d) => (d === 'kerfMm' ? `пропил ${P.fmt(kerf)} мм` : `обрезка кромок листа ${P.fmt(trim)} мм`)).join(', ').replace(/^./, (c) => c.toUpperCase())} — по умолчанию (MOD-DEC-445): уточните у своего распиловщика.`] : []),
      'Размеры — пильные заготовки S (без кромки, MOD-DEC-169); пропил не прибавлен к заготовке, он учтён между заготовками.',
      ...(planned.some((p) => p.dimensionChain.status !== 'VERIFIED') ? ['Припуски заготовок не квалифицированы (припуски прототипа, FINDINGS 218): размеры S уточняет мебельщик.'] : []),
      ...(planned.some((p) => p.contourMm) ? ['Фигурная деталь раскраивается по габариту, контур — следующей операцией.'] : []),
      ...groups.filter((x) => !x.respectGrain && x.material.grainedParts).map((x) => `${materialTitle(x.material)}: текстура не учитывается — заготовки поворачиваются (выбор пользователя).`),
    ];
  return {
    revision: g.revision.projectRevisionId,
    identity: drawingIdentity(g, opts.appVersion ?? ''),
    policy: `${policy.id}-${policy.version}`,
    kerfMm: kerf,
    trimMm: trim,
    defaults,
    status: problems.length ? 'INCOMPLETE' : 'COMPLETE',
    groups,
    excluded,
    problems,
    notes,
    algorithm: `guillotine; ${CUT_SEARCH.orders.length * CUT_SEARCH.fits.length * CUT_SEARCH.splits.length} orders; best found, not a proven optimum`,
  };
}

// ---------------------------------------------------------------- the check

/**
 * An independent check of a plan against its graph (the tests and INV-A03-01): every blank has the sawn size of its
 * part, lies inside the trimmed sheet, keeps a kerf from every other blank, keeps the grain when it is respected, the
 * blanks of a sheet are separated by guillotine cuts, and every part cut from a sheet is laid out once or listed.
 */
export function checkCuttingPlan(g: Pick<Graph, 'parts'>, plan: CuttingPlan): string[] {
  const out: string[] = [],
    kerf = plan.kerfMm,
    trim = plan.trimMm,
    seen = new Map<string, number>(),
    byId = new Map(g.parts.map((p) => [p.id, p]));
  for (const group of plan.groups)
    for (const s of group.sheets) {
      const [SL, SW] = s.sheetMm;
      for (const p of s.pieces) {
        const part = byId.get(p.partId),
          S = part?.dimensionChain.sawnBlank;
        seen.set(p.partId, (seen.get(p.partId) ?? 0) + 1);
        if (!part || !S) {
          out.push(`${p.partId}: нет детали или её заготовки S в графе`);
          continue;
        }
        const [w, h] = p.rotated ? [S.widthMm, S.lengthMm] : [S.lengthMm, S.widthMm];
        if (Math.abs(p.w - w) > EPS || Math.abs(p.h - h) > EPS) out.push(`${p.partId}: размер на листе ${p.w} × ${p.h}, заготовка ${w} × ${h}`);
        if (p.x < trim - EPS || p.y < trim - EPS || p.x + p.w > SL - trim + EPS || p.y + p.h > SW - trim + EPS) out.push(`${p.partId}: выходит за полезный лист`);
        if (group.respectGrain && ((part.orientation.grainDirection === 'ALONG_LENGTH' && p.rotated) || (part.orientation.grainDirection === 'ALONG_WIDTH' && !p.rotated))) out.push(`${p.partId}: повёрнута против текстуры`);
        if (part.material.family !== group.material.family || part.material.decorId !== group.material.decorId || part.material.panelThicknessMm !== group.material.thicknessMm) out.push(`${p.partId}: не тот материал листа`);
      }
      for (let i = 0; i < s.pieces.length; i++)
        for (let j = i + 1; j < s.pieces.length; j++) {
          const a = s.pieces[i]!,
            b = s.pieces[j]!,
            apart = a.x + a.w + kerf <= b.x + EPS || b.x + b.w + kerf <= a.x + EPS || a.y + a.h + kerf <= b.y + EPS || b.y + b.h + kerf <= a.y + EPS;
          if (!apart) out.push(`лист ${s.no}: заготовки ${a.partId} и ${b.partId} ближе пропила`);
        }
      if (!guillotine(s.pieces, kerf)) out.push(`лист ${s.no}: раскладку нельзя разрезать сквозными резами`);
    }
  for (const p of g.parts) {
    if (exclusion(p)) continue;
    const n = seen.get(p.id) ?? 0,
      listed = plan.groups.some((x) => x.tooLarge.some((t) => t.partId === p.id) || (x.status === 'MISSING_PARAMS' && x.material.partIds.includes(p.id)));
    if (n > 1 || (n === 0 && !listed)) out.push(`${p.id}: на картах ${n} раз`);
  }
  return out;
}

/** The blanks can be separated by a straight cut through the whole piece, recursively. */
function guillotine(pieces: { x: number; y: number; w: number; h: number }[], kerf: number): boolean {
  if (pieces.length <= 1) return true;
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'w' : 'h';
    for (const c of [...new Set(pieces.map((p) => p[axis] + p[size]))].sort((a, b) => a - b)) {
      const low = pieces.filter((p) => p[axis] + p[size] <= c + EPS),
        high = pieces.filter((p) => p[axis] >= c + kerf - EPS);
      if (low.length && high.length && low.length + high.length === pieces.length) return guillotine(low, kerf) && guillotine(high, kerf);
    }
  }
  return false;
}

// ---------------------------------------------------------------- CSV

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(';')).join('\n');
const num = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
const SIDE_RU: Record<SheetSide, string> = { BOTTOM: 'снизу', TOP: 'сверху', LEFT: 'слева', RIGHT: 'справа' };
const GRAIN_RU: Record<CutPiece['grain'], string> = { ALONG_LENGTH: 'вдоль длины', ALONG_WIDTH: 'вдоль ширины', NONE: 'нет' };

/** Comment lines of the CSV files: what the plan is, of which revision, with which parameters. */
function csvHead(plan: CuttingPlan): string {
  return [
    `# Карта раскроя Modulero · ревизия ${plan.revision} · ${plan.policy} · ${plan.identity.qualification === 'PRODUCTION' ? 'для производства' : 'ЧЕРНОВИК · НЕ ДЛЯ ПРОИЗВОДСТВА'}`,
    `# Пропил ${num(plan.kerfMm)} мм${plan.defaults.includes('kerfMm') ? ' (по умолчанию, MOD-DEC-445)' : ''}; обрезка кромок листа ${num(plan.trimMm)} мм${plan.defaults.includes('trimMm') ? ' (по умолчанию, MOD-DEC-445)' : ''}; оси листа: X — вдоль первого размера формата (рисунок листа), Y — поперёк, от левого нижнего угла`,
    ...plan.problems.map((p) => '# Не разложено: ' + p),
  ].join('\n');
}

/** The blanks: one row per blank, the number of the map, the sheet, the place and the edges. */
export function cuttingPlanCsv(plan: CuttingPlan): string {
  const rows: unknown[][] = [['№', 'Материал', 'Лист', 'Формат листа', 'ID детали', 'Деталь', 'Длина S', 'Ширина S', 'X', 'Y', 'Повёрнута', 'Текстура', 'Кромка A', 'Кромка B', 'Кромка C', 'Кромка D', 'dimensionBasis']];
  for (const group of plan.groups)
    for (const s of group.sheets)
      for (const p of s.pieces)
        rows.push([
          p.no,
          materialTitle(group.material),
          s.no,
          s.sheetMm.map(num).join(' × '),
          p.partId,
          p.name,
          num(p.lengthMm),
          num(p.widthMm),
          num(p.x),
          num(p.y),
          p.rotated ? 'да' : 'нет',
          GRAIN_RU[p.grain],
          ...(['A', 'B', 'C', 'D'] as const).map((e) => (p.edges[e].thicknessMm === null ? '' : `${num(p.edges[e].thicknessMm!)} ${SIDE_RU[p.edges[e].side]}`)),
          'SAWN_BLANK',
        ]);
  return csvHead(plan) + '\n' + csv(rows);
}

/** The sheets: count, use of the sheet, saw run and offcuts of each board. */
export function cuttingSheetsCsv(plan: CuttingPlan): string {
  const rows: unknown[][] = [['Материал', 'Лист', 'Формат листа', 'Источник формата', 'Заготовок', 'Использование, %', 'Длина резов, м', 'Резов', 'Обрезки (больше 100 × 100 мм)']];
  for (const group of plan.groups)
    for (const s of group.sheets)
      rows.push([
        materialTitle(group.material),
        s.no,
        s.sheetMm.map(num).join(' × '),
        group.sheetSource === 'USER' ? 'пользователь' : group.material.catalogRef ?? '',
        s.pieces.length,
        num(s.utilization * 100),
        num(s.cutLengthMm / 1000),
        s.cuts.length,
        s.offcuts
          .filter((o) => o.w >= 100 && o.h >= 100)
          .map((o) => `${num(o.w)} × ${num(o.h)}`)
          .join(', '),
      ]);
  return csvHead(plan) + '\n' + csv(rows);
}

/** The cuts of every sheet in their order, for the saw. */
export function cuttingCutsCsv(plan: CuttingPlan): string {
  const rows: unknown[][] = [['Материал', 'Лист', 'Рез', 'Уровень', 'Направление', 'Координата', 'От', 'До', 'Длина']];
  for (const group of plan.groups)
    for (const s of group.sheets)
      for (const c of s.cuts) rows.push([materialTitle(group.material), s.no, c.no, c.level === 0 ? 'обрезка' : c.level, c.axis === 'H' ? 'вдоль X' : 'вдоль Y', `${c.axis === 'H' ? 'Y' : 'X'} = ${num(c.at)}`, num(c.from), num(c.to), num(c.to - c.from)]);
  return csvHead(plan) + '\n' + csv(rows);
}

// ---------------------------------------------------------------- sheets of the map

const [A4W, A4H] = drawingSheets.constants.partSheetMm.value;
const SIDE_LINE: Record<SheetSide, (x: number, y: number, w: number, h: number) => [number, number, number, number]> = {
  BOTTOM: (x, y, w, h) => [x, y + h, x + w, y + h],
  TOP: (x, y, w) => [x, y, x + w, y],
  LEFT: (x, y, _w, h) => [x, y, x, y + h],
  RIGHT: (x, y, w, h) => [x + w, y, x + w, y + h],
};

/**
 * The map of every sheet as an A4 page (landscape): the sheet with its trims, the blanks with their numbers and
 * edges, the grain of the sheet, the table of the blanks and the stamp of the revision. The page of a draft says
 * «черновик» as the drawings do.
 */
export function cuttingSheets(plan: CuttingPlan): Sheet[] {
  const all = plan.groups.flatMap((group) => group.sheets.map((s) => ({ group, s }))),
    id = plan.identity,
    out: Sheet[] = [];
  all.forEach(({ group, s }, k) => {
    const title = `Карта раскроя · ${materialTitle(group.material)} · лист ${s.no} из ${group.sheets.length}`,
      sub = `Лист ${s.sheetMm.map(P.fmt).join(' × ')} мм (${group.sheetSource === 'USER' ? 'формат пользователя' : group.material.catalogRef}), пропил ${P.fmt(plan.kerfMm)} мм, обрезка ${P.fmt(plan.trimMm)} мм; использование ${Math.round(s.utilization * 1000) / 10} %`,
      hd = P.header(title, sub, id, A4W, k + 1, all.length),
      tableW = 100,
      area = { x: 10, y: hd.bottom + 6, w: A4W - 20 - tableW - 6, h: A4H - 34 - (hd.bottom + 6) - 8 },
      // The map is drawn at a scale of the series of the drawings, the largest the sheet fits at.
      scale = drawingSheets.constants.scaleDenominators.value.find((d) => s.sheetMm[0] / d <= area.w && s.sheetMm[1] / d <= area.h) ?? Math.ceil(Math.max(s.sheetMm[0] / area.w, s.sheetMm[1] / area.h)),
      X = (x: number) => area.x + x / scale,
      Y = (y: number) => area.y + (s.sheetMm[1] - y) / scale,
      minText = drawingSheets.constants.minTextMm.value;
    let body = '',
      lines = '';
    // The sheet and its trimmed strip.
    lines += `<rect x="${P.n2(X(0))}" y="${P.n2(Y(s.sheetMm[1]))}" width="${P.n2(s.sheetMm[0] / scale)}" height="${P.n2(s.sheetMm[1] / scale)}" stroke-width="0.35"/>`;
    const t = plan.trimMm;
    if (t > EPS) lines += `<rect x="${P.n2(X(t))}" y="${P.n2(Y(s.sheetMm[1] - t))}" width="${P.n2((s.sheetMm[0] - 2 * t) / scale)}" height="${P.n2((s.sheetMm[1] - 2 * t) / scale)}" stroke-width="0.15" stroke-dasharray="1 0.8"/>`;
    for (const o of s.offcuts) body += `<rect x="${P.n2(X(o.x))}" y="${P.n2(Y(o.y + o.h))}" width="${P.n2(o.w / scale)}" height="${P.n2(o.h / scale)}" fill="#eceae6"/>`;
    for (const p of s.pieces) {
      const x = X(p.x),
        y = Y(p.y + p.h),
        w = p.w / scale,
        h = p.h / scale;
      body += `<rect x="${P.n2(x)}" y="${P.n2(y)}" width="${P.n2(w)}" height="${P.n2(h)}" fill="#fff"/>`;
      lines += `<rect x="${P.n2(x)}" y="${P.n2(y)}" width="${P.n2(w)}" height="${P.n2(h)}" stroke-width="0.25"/>`;
      // The banded edges: a heavy line inside the side of the blank they face.
      const inset = Math.min(0.8, w / 4, h / 4);
      for (const e of ['A', 'B', 'C', 'D'] as const)
        if (p.edges[e].thicknessMm !== null) {
          const [x1, y1, x2, y2] = SIDE_LINE[p.edges[e].side](x + inset, y + inset, w - 2 * inset, h - 2 * inset);
          lines += P.line(x1, y1, x2, y2, p.edges[e].thicknessMm! >= 1 ? 0.7 : 0.35);
        }
      const label = String(p.no),
        dims = `${P.fmt(p.lengthMm)} × ${P.fmt(p.widthMm)}`,
        size = Math.min(4, h * 0.6, w / (label.length * 0.6 + 0.4)),
        withDims = h >= size + minText + 2.5 && w >= dims.length * minText * 0.6 + 1;
      if (size >= minText) {
        body += P.text(x + w / 2, y + h / 2 + size * 0.35 - (withDims ? minText * 0.6 : 0), label, size, 'text-anchor="middle" font-weight="700"');
        if (withDims) body += P.text(x + w / 2, y + h / 2 + size * 0.35 + minText * 0.8, dims, minText, `text-anchor="middle" fill="${P.SOFT}"`);
      } else body += P.text(x + w + 0.6, y + h / 2 + 1, label, minText, `fill="${P.SOFT}"`);
    }
    // The grain of the sheet: an arrow along X under the sheet.
    const gy = Y(0) + 4.5;
    lines += P.line(X(0), gy, X(0) + 22, gy, 0.25) + P.line(X(0) + 22, gy, X(0) + 19.5, gy - 1.2, 0.25) + P.line(X(0) + 22, gy, X(0) + 19.5, gy + 1.2, 0.25);
    body += P.text(X(0) + 24, gy + 1, `рисунок листа · М 1:${P.fmt(scale)} · толстая линия — кромка ≥ 1 мм, тонкая — меньше 1 мм`, minText, `fill="${P.SOFT}"`);
    // The table of the blanks.
    const tx = A4W - 10 - tableW;
    let ty = area.y + 2;
    const row = (cells: string[], bold = false) => {
      const xs = [0, 6, 46, 73];
      cells.forEach((c, i) => (body += P.text(tx + xs[i]!, ty, P.wrapText(c, (xs[i + 1] ?? tableW) - xs[i]! - 0.5)[0]!, minText, bold ? 'font-weight="700"' : '')));
      ty += 3.9;
    };
    row(['№', 'Деталь', 'L × W, мм', 'Кромка A·B·C·D'], true);
    const room = Math.floor((A4H - 36 - ty) / 3.9);
    const shown = s.pieces.length > room ? s.pieces.slice(0, room - 1) : s.pieces;
    for (const p of shown) row([String(p.no), p.partId, `${P.fmt(p.lengthMm)} × ${P.fmt(p.widthMm)}${p.rotated ? ' ↻' : ''}`, (['A', 'B', 'C', 'D'] as const).map((e) => (p.edges[e].thicknessMm === null ? '—' : P.fmt(p.edges[e].thicknessMm!))).join('·')]);
    if (shown.length < s.pieces.length) row([`… ещё ${s.pieces.length - shown.length} — в cutting-plan.csv`, '', '', '']);
    const foot = P.footer(A4W, A4H, [
      ['Modulero · карта раскроя', `Заготовок ${s.pieces.length}, резов ${s.cuts.length}, длина резов ${P.fmt(Math.round(s.cutLengthMm / 100) / 10)} м`, '↻ — заготовка повёрнута: длина вдоль Y', 'Кромка A·B·C·D, мм; «—» — без кромки'],
      ['Размеры — пильные заготовки S, без кромки', 'Порядок и координаты резов — cutting-cuts.csv', plan.policy, 'Лучший найденный гильотинный раскрой'],
      P.stampLines(id),
    ]);
    const svg = P.svgOpen(A4W, A4H, 'cutting', `data-revision="${P.esc(id.revision)}" data-material="${P.esc(group.material.key)}"`) + hd.svg + body + P.strokes(lines) + foot + P.SVG_CLOSE;
    out.push({ name: `cutting_${k + 1}`, partId: null, side: null, page: k + 1, pages: all.length, widthMm: A4W, heightMm: A4H, scale, operationIds: [], svg });
  });
  return out;
}
