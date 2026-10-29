// System 32 of the wardrobe: the grid of levels from the installed bottom axis, the first shelf, adding and
// distributing shelves, the pair "top drawer + shelf over it", file 87 of the prototype r1 (r1.html:89062–89544)
// and the helpers of file 00 (r1.html:3627–3639), MIGRATION_PLAN task W2. Pure functions; none was wrapped.
// The functions that read the model of the prototype (placement in a section, the drag preview) build on the
// graph and come with the shelves (W6) and drawers (W7); s32Datum, which only reads the bottom, is here.
// Proof: reference/wardrobe-core/w2 (test/wardrobe.policyW2.test.ts) and tests/oracle/wardrobe-policy-w2.test.mjs.
import { WardrobeStandardPreset } from '../../wardrobe/standard.js';
import { constant, decision, prototype, type PolicyModule } from './types.js';

/**
 * MOD-DEC-193: step 32 mm, base = installed bottom axis (z = bottom lower + t/2 + 32n), first shelf with a clear
 * opening ≥ 400 mm over the bottom, then +256 mm, shelf over a rod ≥ 50 mm, shelf over the top drawer +32 mm.
 * MOD-DEC-196: on by default; off — whole millimetres. MOD-DEC-225: the first shelf ≥ 400 is kept.
 */
export const system32 = {
  id: 'system32',
  version: '1',
  constants: {
    step: constant(32, 'mm', decision('MOD-DEC-193'), 'Шаг сетки System 32'),
    firstShelfClear: constant(400, 'mm', decision('MOD-DEC-193'), 'Первая полка: чистый проём над дном не меньше 400 мм (сохраняется по 225)'),
    shelfStep: constant(256, 'mm', decision('MOD-DEC-193'), 'Следующая полка — шаг +256 мм от оси предыдущей'),
    aboveRodClear: constant(50, 'mm', decision('MOD-DEC-193'), 'Полка над штангой: от верха штанги до низа полки не меньше 50 мм'),
    pairGap: constant(32, 'mm', decision('MOD-DEC-193'), 'Полка над верхним ящиком: низ полки = верх короба + 32'),
    integerStep: constant(1, 'mm', decision('MOD-DEC-196'), 'System 32 выключен — целые миллиметры'),
    tolerance: constant(0.1, 'mm', prototype('r1 WardrobeStandardPreset.system32Tolerance (r1.html:3740)', 'FINDINGS 90'), 'Отметка считается на сетке, если отличается от линии не больше чем на 0,1 мм; совпадает с порогом 191, решения именно для сетки нет'),
    epsilon: constant(1e-8, 'mm', prototype('r1 s32Snap, s32Valid, s32Distribute (r1.html:89087–89240)', 'FINDINGS 90'), 'Запас сравнения отметок сетки'),
    quantaPerMm: constant(1e8, '1/mm', prototype('r1 s32Q (r1.html:89062)', 'FINDINGS 90'), 'Отметки сетки округляются до 1e-8 мм'),
  },
} as const satisfies PolicyModule;

const STEP = system32.constants.step.value;
const EPS = system32.constants.epsilon.value;
const PER_MM = system32.constants.quantaPerMm.value;

/** Nearest line of the plain System 32 grid from 0 (r1.html:3627). */
export function snapSystem32(value: unknown): number {
  const step = WardrobeStandardPreset.system32Step;
  return Math.round(Number(value) / step) * step;
}

/** Whether a level is on the plain grid within its tolerance (r1.html:3631). */
export function isOnSystem32(value: unknown): boolean {
  return Math.abs(Number(value) - snapSystem32(value)) <= WardrobeStandardPreset.system32Tolerance;
}

/** Next line of the plain grid up (direction ≥ 0) or down (r1.html:3635). */
export function nextSystem32Line(value: unknown, direction: number): number {
  const step = WardrobeStandardPreset.system32Step,
    v = Number(value) || 0;
  return direction >= 0 ? (Math.floor(v / step) + 1) * step : (Math.ceil(v / step) - 1) * step;
}

/** A level rounded to 1e-8 mm (r1.html:89062). */
export function s32Q(x: unknown): number {
  return Math.round(Number(x) * PER_MM) / PER_MM;
}

export interface S32GridBaseInput {
  bottom_lower?: number | null;
  bottom_t?: number | null;
  bottom_axis_from_lower?: number | null;
  side_lower?: number | null;
  lower_boundary?: number | null;
}

/**
 * Base of the grid (r1.html:89065; MOD-DEC-193): with a bottom — its installed axis (lower face + t/2 unless the
 * fastener gives another axis); without a bottom — the lower edge of the sides.
 */
export function s32GridBase({ bottom_lower = null, bottom_t = null, bottom_axis_from_lower = null, side_lower = null, lower_boundary = null }: S32GridBaseInput) {
  if (bottom_lower !== null) {
    if (!((bottom_t as number) > 0)) throw Error('BOTTOM_THICKNESS_REQUIRED');
    return {
      z0: s32Q(bottom_lower + (bottom_axis_from_lower ?? (bottom_t as number) / 2)),
      lowerBoundary: s32Q(bottom_lower + (bottom_t as number)),
      basis: 'INSTALLED_BOTTOM_AXIS',
    };
  }
  if (side_lower === null || lower_boundary === null) throw Error('BOTTOMLESS_DATUM_REQUIRED');
  return {
    z0: s32Q(side_lower),
    lowerBoundary: s32Q(lower_boundary),
    basis: 'SIDE_LOWER_EDGE',
  };
}

/** A line of the grid from z0: nearest (a tie goes down), up, down, ceil or floor (r1.html:89087). */
export function s32Snap(value: number, z0: number, mode = 'nearest'): number {
  const u = (value - z0) / STEP,
    lo = Math.floor(u);
  let n: number;
  if (mode === 'up') n = Math.floor(u + EPS) + 1;
  else if (mode === 'down') n = Math.ceil(u - EPS) - 1;
  else if (mode === 'ceil') n = Math.ceil(u - EPS);
  else if (mode === 'floor') n = Math.floor(u + EPS);
  else if (mode === 'nearest') n = u - lo <= 0.5 + EPS ? lo : lo + 1;
  else throw Error('UNKNOWN_SNAP_MODE');
  return s32Q(z0 + STEP * n);
}

/** Faces of a shelf by its fastener axis: a = axis above the lower face, t = thickness (r1.html:89094). */
export function s32ShelfGeometry(axis: number, t: number, a: number, floor = 0) {
  if (!(t > 0) || !Number.isFinite(a)) throw Error('PHYSICAL_SHELF_PROFILE_REQUIRED');
  const lower = axis - a;
  return {
    axis: s32Q(axis),
    lower: s32Q(lower),
    upper: s32Q(lower + t),
    floorUpper: s32Q(lower + t - floor),
  };
}

export interface S32ExactShelfInput {
  value: number;
  field: string;
  t: number;
  axis_from_lower: number;
  floor?: number;
  neighbor?: number | null;
}

/** A shelf placed by an exact value: upper face from the floor, or a clearance to a neighbour (r1.html:89104). */
export function s32ExactShelf({ value, field, t, axis_from_lower: a, floor = 0, neighbor = null }: S32ExactShelfInput) {
  let lower: number;
  if (field === 'floorUpper') lower = floor + value - t;
  else if (field === 'clearAboveLower' && neighbor !== null) lower = neighbor + value;
  else if (field === 'clearBelowUpper' && neighbor !== null) lower = neighbor - value - t;
  else throw Error('UNKNOWN_FIELD_OR_NEIGHBOR');
  return s32ShelfGeometry(lower + a, t, a, floor);
}

/** Whether two intervals overlap by more than 1e-8 (r1.html:89116). */
export function s32Overlap(a: readonly number[], b: readonly number[]): boolean {
  return Math.min(a[1]!, b[1]!) - Math.max(a[0]!, b[0]!) > EPS;
}

/** Whether a shelf at this axis is within the bounds and off the obstacles (r1.html:89119). */
export function s32Valid(axis: number, t: number, a: number, bounds: readonly number[], obs: readonly (readonly number[])[] = []): boolean {
  const lo = axis - a,
    hi = lo + t;
  return lo >= bounds[0]! - EPS && hi <= bounds[1]! + EPS && !obs.some((o) => s32Overlap([lo, hi], o));
}

export interface S32AddShelfInput {
  z0: number;
  t: number;
  axis_from_lower: number;
  bounds: readonly number[];
  previous_axis?: number | null;
  obstacles?: readonly (readonly number[])[];
  rod?: { axis: number; verticalSize: number } | null;
}

/**
 * The next shelf (r1.html:89124; MOD-DEC-193): the first one with a clear opening ≥ 400 mm over the lower bound, the
 * next +256 mm above the previous axis, over a rod ≥ 50 mm above its top; then the first free line of the grid
 * (whole millimetres with System 32 off, MOD-DEC-196).
 */
export function s32AddShelf({ z0, t, axis_from_lower: a, bounds, previous_axis = null, obstacles = [], rod = null }: S32AddShelfInput, enabled = true) {
  if (!Number.isFinite(a)) throw Error('PHYSICAL_SHELF_PROFILE_UNKNOWN');
  const c = system32.constants;
  let threshold = previous_axis === null ? bounds[0]! + c.firstShelfClear.value + a : previous_axis + c.shelfStep.value;
  if (rod) {
    if (!(rod.verticalSize > 0)) throw Error('ROD_VERTICAL_SIZE_REQUIRED');
    threshold = rod.axis + rod.verticalSize / 2 + c.aboveRodClear.value + a;
  }
  const start = enabled ? s32Snap(threshold, z0, 'ceil') : Math.ceil(threshold - a + t - EPS) - t + a,
    step = enabled ? STEP : c.integerStep.value,
    end = bounds[1]! - t + a;
  for (let axis = start; axis <= end + EPS; axis += step) if (s32Valid(axis, t, a, bounds, obstacles)) return s32ShelfGeometry(axis, t, a);
  throw Error('NO_VALID_LEVEL_ABOVE_THRESHOLD');
}

export interface S32ShelfSpec {
  t: number;
  axisFromLower: number;
  forbiddenAxes?: readonly number[];
  [key: string]: unknown;
}

export interface S32DistributeInput {
  z0: number;
  shelves: readonly S32ShelfSpec[];
  bounds: readonly number[];
  obstacles?: readonly (readonly number[])[];
}

/**
 * «Распределить полки» (r1.html:89145; MOD-DEC-193): every shelf on a line of the grid, the gaps between shelves and
 * fixed obstacles as close to equal as the grid allows (least sum of squared deviations from the mean), ties
 * broken by the lowest axes — deterministic. With System 32 off — whole millimetres of the upper face.
 */
export function s32Distribute({ z0, shelves, bounds, obstacles = [] }: S32DistributeInput, enabled = true) {
  const layout = shelves.map((s) => ({
    ...s,
    axisFromLower: enabled ? s.axisFromLower : Number.isFinite(s.axisFromLower) ? s.axisFromLower : 0,
  }));
  const obs = obstacles.slice().sort((a, b) => a[0]! - b[0]!),
    n = shelves.length,
    m = obs.length;
  if (bounds[1]! <= bounds[0]! || obs.some((o, i) => o[0]! < bounds[0]! || o[1]! > bounds[1]! || o[1]! <= o[0]! || (i && s32Overlap(o, obs[i - 1]!)))) throw Error('INVALID_FIXED_OBSTACLE');
  if (!n)
    return {
      axes: [],
      gaps: [],
      mean: null,
      sumSquaredDeviation: 0,
    };
  const free = bounds[1]! - bounds[0]! - shelves.reduce((s, x) => s + x.t, 0) - obs.reduce((s, o) => s + o[1]! - o[0]!, 0);
  if (free < 0) throw Error('INSUFFICIENT_FREE_HEIGHT');
  const mean = free / (n + m + 1);
  function gaps(a: number, b: number): number[] {
    const g: number[] = [];
    let cur = a;
    for (const [lo, hi] of obs as number[][])
      if (lo! >= a - EPS && hi! <= b + EPS) {
        g.push(s32Q(lo! - cur));
        cur = hi!;
      }
    g.push(s32Q(b - cur));
    return g;
  }
  type Path = { c: number; path: number[]; hi: number };
  const cost = (a: number, b: number) => gaps(a, b).reduce((c, g) => c + (g - mean) ** 2, 0),
    lex = (a: number[], b: number[]) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
      return 0;
    },
    better = (a: Path, b: Path | null) => !b || a.c < b.c - EPS || (Math.abs(a.c - b.c) <= EPS && lex(a.path, b.path) < 0);
  let prev: Path[] = [];
  for (const s of layout) {
    const a = s.axisFromLower,
      t = s.t;
    if (!(t > 0) || !Number.isFinite(a)) throw Error('PHYSICAL_SHELF_PROFILE_UNKNOWN');
    const start = enabled ? s32Snap(bounds[0]! + a, z0, 'ceil') : Math.ceil(bounds[0]! + t - EPS) - t + a,
      end = enabled ? s32Snap(bounds[1]! - t + a, z0, 'floor') : Math.floor(bounds[1]! + EPS) - t + a,
      cur: Path[] = [];
    for (let axis = start; axis <= end + EPS; axis += enabled ? STEP : system32.constants.integerStep.value) {
      axis = s32Q(axis);
      if (!s32Valid(axis, t, a, bounds, obs) || (s.forbiddenAxes || []).some((f) => Math.abs(f - axis) < EPS)) continue;
      const lo = axis - a,
        hi = lo + t;
      let best: Path | null = null;
      if (s === layout[0]) best = { c: cost(bounds[0]!, lo), path: [axis], hi };
      else
        for (const p of prev)
          if (p.hi <= lo + EPS) {
            const v = { c: p.c + cost(p.hi, lo), path: [...p.path, axis], hi };
            if (better(v, best)) best = v;
          }
      if (best) cur.push(best);
    }
    prev = cur;
    if (!prev.length) throw Error('NO_DISTRIBUTION_WITH_SAME_COUNT');
  }
  let best: Path | null = null;
  for (const p of prev) {
    const v = { ...p, c: p.c + cost(p.hi, bounds[1]!) };
    if (better(v, best)) best = v;
  }
  const gs: number[] = [];
  let last = bounds[0]!;
  best!.path.forEach((axis, i) => {
    const lo = axis - layout[i]!.axisFromLower;
    gs.push(...gaps(last, lo));
    last = lo + shelves[i]!.t;
  });
  gs.push(...gaps(last, bounds[1]!));
  return {
    axes: best!.path,
    lowers: best!.path.map((v, i) => s32Q(v - layout[i]!.axisFromLower)),
    physicalAxes: best!.path.map((v, i) => (Number.isFinite(shelves[i]!.axisFromLower) ? v : null)),
    coordinateBasis: enabled ? 'PHYSICAL_AXIS' : 'INTEGER_UPPER_LAYOUT',
    gaps: gs,
    mean: s32Q(mean),
    sumSquaredDeviation: s32Q(best!.c),
  };
}

type Box = readonly (readonly number[])[];

/** Whether two boxes [[x0, y0, z0], [x1, y1, z1]] overlap in all three axes (r1.html:89242). */
export function s32BoxHit(a: Box, b: Box): boolean {
  return [0, 1, 2].every((i) => s32Overlap([a[0]![i]!, a[1]![i]!], [b[0]![i]!, b[1]![i]!]));
}

/** State of the pair «top drawer + shelf over it» for a move. */
export interface S32PairState {
  shelf: { lower: number; axisFromLower: number; isRoof?: boolean; [key: string]: unknown };
  drawer: { top: number; [key: string]: unknown };
  z0: number;
  floor?: number;
  bounds: readonly number[];
  movingEnvelopes: { id: string; box: Box; [key: string]: unknown }[];
  obstacles?: { id: string; box: Box }[];
  unknownEnvelopes?: unknown;
  [key: string]: unknown;
}

/**
 * Moves the pair «top drawer + shelf over it» together (r1.html:89245; MOD-DEC-193: shelf lower = box top + 32):
 * by an exact value, an arrow (next line) or the mouse (nearest line); refuses a broken pair, a moved roof,
 * leaving the bounds and a collision. The state given is not changed.
 */
export function s32MovePair(st: S32PairState, mode: string, value: number | null = null, direction: number | null = null, enabled = true) {
  const old = JSON.parse(JSON.stringify(st)),
    s = st.shelf,
    d = st.drawer,
    a = s.axisFromLower,
    axis = s.lower + a,
    gap = system32.constants.pairGap.value;
  const fail = (reason: string) => ({ ok: false, reason, state: old });
  if (Math.abs(s.lower - d.top - gap) > EPS) return fail('PAIR_GAP_NOT_32');
  let target: number;
  if (mode === 'exact') target = (value as number) + (st.floor || 0) + gap + a;
  else if (mode === 'arrow') target = enabled ? s32Snap(axis, st.z0, direction === 1 ? 'up' : 'down') : (direction === 1 ? Math.floor(d.top + EPS) + 1 : Math.ceil(d.top - EPS) - 1) + gap + a;
  else if (mode === 'mouse') target = enabled ? s32Snap(value as number, st.z0) : Math.round((value as number) - gap - a) + gap + a;
  else return fail('UNKNOWN_PAIR_OPERATION');
  const dz = target - axis;
  if (s.isRoof && Math.abs(dz) > EPS) return fail('FIXED_ROOF_CANNOT_MOVE');
  const moved = [];
  for (const e of st.movingEnvelopes) {
    const box = e.box.map((v) => [v[0], v[1], s32Q(v[2]! + dz)]) as number[][];
    if (box[0]![2]! < st.bounds[0]! - EPS || box[1]![2]! > st.bounds[1]! + EPS) return fail('OUT_OF_BOUNDS:' + e.id);
    for (const o of st.obstacles || []) if (s32BoxHit(box, o.box)) return fail('COLLISION:' + e.id + ':' + o.id);
    moved.push({ ...e, box });
  }
  const out = JSON.parse(JSON.stringify(st));
  out.shelf.lower = s32Q(s.lower + dz);
  out.drawer.top = s32Q(d.top + dz);
  out.movingEnvelopes = moved;
  return {
    ok: true,
    dz: s32Q(dz),
    axis: s32Q(target),
    state: out,
    physicalAssurance: st.unknownEnvelopes ? 'CONDITIONAL_UNKNOWN_ENVELOPES' : 'KNOWN_ENVELOPES_ONLY',
  };
}

/** Allowed shifts of the pair: within the bounds, minus the shifts that hit an obstacle; a roof — only 0 (r1.html:89283). */
export function s32PairRange(st: Pick<S32PairState, 'bounds' | 'movingEnvelopes' | 'obstacles' | 'shelf'>): number[][] {
  const lo = Math.max(...st.movingEnvelopes.map((e) => st.bounds[0]! - e.box[0]![2]!)),
    hi = Math.min(...st.movingEnvelopes.map((e) => st.bounds[1]! - e.box[1]![2]!));
  let ranges: number[][] = lo <= hi ? [[lo, hi]] : [];
  const forbidden: number[][] = [];
  for (const e of st.movingEnvelopes)
    for (const o of st.obstacles || [])
      if ([0, 1].every((i) => s32Overlap([e.box[0]![i]!, e.box[1]![i]!], [o.box[0]![i]!, o.box[1]![i]!]))) forbidden.push([o.box[0]![2]! - e.box[1]![2]!, o.box[1]![2]! - e.box[0]![2]!]);
  for (const [f, g] of forbidden.sort((a, b) => a[0]! - b[0]!))
    ranges = ranges.flatMap(([a, b]) => (g! <= a! || f! >= b! ? [[a!, b!]] : [...(a! <= f! ? [[a!, Math.min(b!, f!)]] : []), ...(g! <= b! ? [[Math.max(a!, g!), b!]] : [])]));
  if (st.shelf.isRoof) ranges = ranges.some(([a, b]) => a! <= 0 && b! >= 0) ? [[0, 0]] : [];
  return ranges.map((r) => r.map(s32Q));
}

export interface S32InitialGroupInput {
  z0: number;
  heights: readonly number[];
  gaps: readonly number[];
  shelf_t: number;
  shelf_a: number;
  bounds: readonly number[];
  obstacles?: readonly (readonly number[])[];
}

/** First group of drawer boxes with the shelf over them: the lowest line where the boxes and the shelf are free (r1.html:89293). */
export function s32InitialGroup({ z0, heights, gaps, shelf_t: t, shelf_a: a, bounds, obstacles = [] }: S32InitialGroupInput, enabled = true) {
  const gap = system32.constants.pairGap.value;
  if (!heights.length || gaps.length !== heights.length - 1 || Math.min(...heights) <= 0 || Math.min(0, ...gaps) < 0) throw Error('INVALID_GROUP_DIMENSIONS');
  const span = heights.reduce((s, x) => s + x, 0) + gaps.reduce((s, x) => s + x, 0),
    threshold = bounds[0]! + span + gap + a;
  let axis = enabled ? s32Snap(threshold, z0, 'ceil') : Math.ceil(threshold - gap - a) + gap + a;
  for (; axis - a + t <= bounds[1]! + EPS; axis += enabled ? STEP : system32.constants.integerStep.value) {
    const lo = axis - a;
    let bot = lo - gap - span;
    const boxes = heights.map((h, i) => {
      const r = [s32Q(bot), s32Q(bot + h)];
      bot += h + (gaps[i] || 0);
      return r;
    });
    if (!boxes.concat([[lo, lo + t]]).some((b) => obstacles.some((o) => s32Overlap(b, o))))
      return {
        shelf: s32ShelfGeometry(axis, t, a),
        boxes,
      };
  }
  throw Error('GROUP_DOES_NOT_FIT');
}

/** What s32Datum reads from the model: the first bottom part and the vertical marks of the body. */
export interface S32DatumModel {
  parts: readonly { kind?: unknown; T?: number }[];
  geometry: { bottomBottomY: number; sideBottomY: number; interiorBottomY: number };
}

/** Base of the grid of a body: the installed axis of its bottom, else the lower edge of the sides (r1.html:89534). */
export function s32Datum(m: S32DatumModel) {
  const b = m.parts.find((p) => p.kind === 'bottom');
  return b ? s32GridBase({ bottom_lower: m.geometry.bottomBottomY, bottom_t: b.T as number }) : s32GridBase({ side_lower: m.geometry.sideBottomY, lower_boundary: m.geometry.interiorBottomY });
}
