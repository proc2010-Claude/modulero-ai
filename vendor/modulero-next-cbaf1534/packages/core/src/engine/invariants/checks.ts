// The invariant library of the unified engine (ENGINE_INVARIANTS.md, reference/engine/invariant-library.json).
// Every check is a pure function «graph + context → result». A check knows no product: it reads parts,
// operations, joints, mechanisms, loads, the result and, when given, projections (outputs) and evidence
// (a second run, a reopened file, rejected edits, timings). Numbers come from the policy, not from the check.
// Without the data a check needs it answers UNKNOWN or NOT_APPLICABLE, never PASS.
import { canonicalJson } from '../../project/digest.js';
import type { Graph, Groove, Hole, Mechanism, Notch, Part, PlanarSize, Rational } from '../contract.js';
import { partEdgeMetres, segmentSlot } from '../contour-edges.js';
import { jointFasteners } from '../fasteners.js';
import { aggregateResult, deriveDimensionChain } from '../graph.js';
import { budgetMs, drilling, edges as edgePolicy, FLOOR_CONTACT_EDGE_ISSUE, hinges as hingePolicy, performance, tolerance } from '../policy/index.js';
import {
  boxHitsPart,
  boxToAabb,
  grooveVolume,
  holeHitsBox,
  holeVolume,
  intersects,
  isHole,
  notchVolume,
  overlap,
  partBox,
  partPoint,
  partsIntersect,
  ratEq,
  ratFromDecimal,
  ratSub,
  ratSum,
} from './geometry.js';

export type InvariantStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';

export interface Violation {
  code: string;
  /** Plain Russian text (INV-V03). */
  text: string;
  /** Ids of parts, operations, joints, mechanisms concerned. */
  refs: string[];
}

export interface InvariantResult {
  id: string;
  status: InvariantStatus;
  violations: Violation[];
  /** Why UNKNOWN / NOT_APPLICABLE. */
  reason?: string;
}

export interface SpecRow {
  partId: string;
  lengthMm: number;
  widthMm: number;
  panelThicknessMm: number;
}
export interface CutRow {
  partId: string;
  lengthMm: number;
  widthMm: number;
}
export interface PriceLine {
  key: string;
  quantity: number;
  rate: number | null;
  amount: number | null;
  /** The amount is quantity × rate rounded up to this step: a found or conditional price of hardware (MOD-DEC-346). */
  roundUpToRub?: number;
  /** Graph quantity the line counts (INV-P02). */
  basis?: 'hingeCount' | 'drillHoles' | 'edgeMetres' | 'boardAreaM2' | 'jointStations' | 'confirmats' | 'dowels';
}
export interface PriceProjection {
  lines: PriceLine[];
  total: number | null;
  partial: boolean;
  /** Line keys the graph needs priced (INV-P03); a missing one is a dropped line. */
  requiredKeys?: string[];
}
export interface OutputStamp {
  output: string;
  revision: string;
  ruleSet: string;
  generator: string;
  /** Qualification printed on a production output (INV-V04). */
  qualification?: 'PRODUCTION' | 'NOT_FOR_PRODUCTION';
}
export interface Projections {
  specification?: SpecRow[];
  cutList?: CutRow[];
  drillingOperationIds?: string[];
  scenePartIds?: string[];
  stamps?: OutputStamp[];
  price?: PriceProjection;
}
export interface BoardRef {
  variantId: string;
  panelThicknessMm: number;
  sheetFormatMm: [number, number] | null;
}
/** Chart of a hinge: limits for n hinges (MOD-DEC-190); from the manufacturer catalogue (Q3). */
export interface HingeChart {
  profileId: string;
  rows: { n: number; Hmax: number; Mmax: number }[];
}
export interface Evidence {
  repeat?: Graph;
  reopened?: Graph;
  rejectedEdits?: { label: string; before: Graph; after: Graph; message: string; threw: boolean }[];
  growth?: { label: string; smaller: PriceProjection; larger: PriceProjection }[];
  invalidInputs?: { label: string; refused: boolean; message: string; output?: unknown }[];
  performance?: { label: string; parts: number; tMs: number; bMs: number; previewP95Ms: number }[];
  /** The graph is a new project or a built-in example (INV-V02). */
  defaultOrFixture?: boolean;
  /** A production adapter exists for this graph (FE-01 aggregation). */
  adapterAvailable?: boolean;
}
export interface CheckContext {
  projections?: Projections;
  evidence?: Evidence;
  boards?: BoardRef[];
  hingeCharts?: HingeChart[];
  /** Facade mass for INV-M02, kg, by part id. */
  facadeMassKg?: Record<string, number>;
}

export type Check = (g: Graph, ctx: CheckContext) => InvariantResult;

/** Comparison of computed values (MOD-DEC-191); not a geometric clearance and not the drilling tolerance (275). */
const TOL = tolerance.constants.compare.value;
const near = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol;
const finitePositive = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const result = (id: string, violations: Violation[]): InvariantResult => ({ id, status: violations.length ? 'FAIL' : 'PASS', violations });
const unknown = (id: string, reason: string): InvariantResult => ({ id, status: 'UNKNOWN', violations: [], reason });
const notApplicable = (id: string, reason: string): InvariantResult => ({ id, status: 'NOT_APPLICABLE', violations: [], reason });
const v = (code: string, text: string, ...refs: string[]): Violation => ({ code, text, refs });
const holesOf = (g: Graph) => g.operations.filter(isHole);
const partMap = (g: Graph) => new Map(g.parts.map((p) => [p.id, p]));
const owner = (h: { owner: { jointId: string } | { mechanismId: string } }) =>
  'jointId' in h.owner ? h.owner.jointId : h.owner.mechanismId;

// ---------------------------------------------------------------- G. geometry

export const G01: Check = (g) => {
  const out: Violation[] = [];
  for (const k of ['widthMm', 'heightMm', 'depthMm'] as const)
    if (!finitePositive(g.envelope[k])) out.push(v('DIM_NON_POSITIVE', `Габарит изделия ${k} не положителен: ${g.envelope[k]}`));
  for (const p of g.parts) {
    const d = p.dimensionChain,
      sizes: [string, number][] = [
        ...Object.entries(p.finishedWithEdge).map(([k, x]) => ['E.' + k, x] as [string, number]),
        ...(['finishedPart', 'machiningBlank', 'sawnBlank'] as const).flatMap((st) => (d[st] ? Object.entries(d[st]!).map(([k, x]) => [st + '.' + k, x] as [string, number]) : [])),
      ];
    for (const [k, x] of sizes) if (!finitePositive(x)) out.push(v('DIM_NON_POSITIVE', `Размер ${k} детали ${p.id} не положителен: ${x}`, p.id));
    if (![...p.placement.originMm, ...p.placement.uAxis, ...p.placement.vAxis, ...p.placement.nAxis].every(Number.isFinite))
      out.push(v('DIM_NOT_NUMBER', `Положение детали ${p.id} не число`, p.id));
  }
  for (const h of holesOf(g)) {
    if (!finitePositive(h.diameterMm)) out.push(v('HOLE_DIAMETER_INVALID', `Диаметр отверстия ${h.id} не положителен`, h.id));
    if (!h.through && !(h.depthMm !== null && Number.isFinite(h.depthMm) && h.depthMm >= 0))
      out.push(v('HOLE_DEPTH_INVALID', `Глубина отверстия ${h.id} не число`, h.id));
  }
  for (const l of g.loads)
    for (const [k, x] of Object.entries(l))
      if (typeof x === 'number' && !Number.isFinite(x)) out.push(v('DIM_NOT_NUMBER', `Нагрузка ${l.id}: ${k} не число`, l.id));
  for (const m of g.mechanisms)
    if (!(Number.isInteger(m.quantity) && m.quantity >= 0)) out.push(v('QTY_INVALID', `Количество механизма ${m.id} не целое неотрицательное`, m.id));
  return result('INV-G01', out);
};

export const G02: Check = (g, ctx) => {
  if (!ctx.boards) return unknown('INV-G02', 'нет каталога плит');
  const boards = new Map(ctx.boards.map((b) => [b.variantId, b])),
    out: Violation[] = [];
  for (const p of g.parts) {
    if (p.supply === 'PURCHASED') continue;
    const b = boards.get(p.material.variantId);
    if (!b) out.push(v('MATERIAL_NOT_IN_CATALOG', `Плиты ${p.material.variantId} детали ${p.id} нет в каталоге`, p.id));
    else if (!near(b.panelThicknessMm, p.finishedWithEdge.panelThicknessMm) || !near(b.panelThicknessMm, p.material.panelThicknessMm))
      out.push(v('THICKNESS_NOT_FROM_BOARD', `Толщина детали ${p.id} ${p.finishedWithEdge.panelThicknessMm} мм, у плиты ${b.panelThicknessMm} мм`, p.id));
  }
  return result('INV-G02', out);
};

export const G03: Check = (g, ctx) => {
  const out: Violation[] = [],
    seen = new Set<string>();
  for (const p of g.parts) {
    if (seen.has(p.id)) out.push(v('PART_ID_DUPLICATE', `Идентификатор детали ${p.id} повторяется`, p.id));
    seen.add(p.id);
    if (/^\d+$/.test(p.id)) out.push(v('PART_ID_IS_POSITION', `Идентификатор детали ${p.id} — номер позиции, а не устойчивое имя`, p.id));
  }
  const spec = ctx.projections?.specification;
  if (spec) spec.forEach((row, i) => { if (row.partId === String(i + 1)) out.push(v('PART_ID_IS_POSITION', `В спецификации идентификатор совпадает с позицией ${i + 1}`, row.partId)); });
  return result('INV-G03', out);
};

/** Pairs allowed to share volume: a groove or notch of one part owned by a joint with the other part. */
function declaredEngagements(g: Graph): Set<string> {
  const jointParts = new Map(g.joints.map((j) => [j.id, [j.parts.throughPartId, j.parts.receivingPartId]])),
    allowed = new Set<string>();
  for (const j of g.joints) if (j.kind === 'GROOVE_FIT') allowed.add([j.parts.throughPartId, j.parts.receivingPartId].sort().join('|'));
  for (const o of g.operations) {
    if (o.op === 'HOLE' || !('jointId' in o.owner)) continue;
    for (const other of jointParts.get(o.owner.jointId) ?? []) if (other !== o.partId) allowed.add([o.partId, other].sort().join('|'));
  }
  return allowed;
}

export const G04: Check = (g) => {
  const out: Violation[] = [],
    allowed = declaredEngagements(g),
    boxes = g.parts.map((p) => [p, partBox(p)] as const);
  for (let i = 0; i < boxes.length; i++)
    for (let k = i + 1; k < boxes.length; k++) {
      const [a, ab] = boxes[i]!,
        [b, bb] = boxes[k]!;
      if (!intersects(ab, bb, TOL)) continue;
      if (allowed.has([a.id, b.id].sort().join('|'))) continue;
      // A turned or contoured part by its own solids, not by its envelope (KF-20, MOD-DEC-294).
      if (!partsIntersect(a, b, TOL)) continue;
      const d = overlap(ab, bb).map((x) => Math.round(x * 10) / 10);
      out.push(v('VOLUME_INTERSECTION', `Детали ${a.id} и ${b.id} пересекаются (${d.join(' × ')} мм) без паза или четверти`, a.id, b.id));
    }
  return result('INV-G04', out);
};

export const G05: Check = (g) => {
  if (!g.parts.length) return notApplicable('INV-G05', 'нет деталей');
  const bs = g.parts.map(partBox),
    min = [0, 1, 2].map((i) => Math.min(...bs.map((b) => b.min[i]!))),
    max = [0, 1, 2].map((i) => Math.max(...bs.map((b) => b.max[i]!))),
    size = { widthMm: max[0]! - min[0]!, depthMm: max[1]! - min[1]!, heightMm: max[2]! - min[2]! },
    out: Violation[] = [];
  for (const k of ['widthMm', 'depthMm', 'heightMm'] as const)
    if (!near(size[k], g.envelope[k])) out.push(v('ENVELOPE_' + k.replace('Mm', '').toUpperCase(), `Детали дают ${k} = ${size[k]} мм, габарит изделия ${g.envelope[k]} мм`));
  return result('INV-G05', out);
};

export const G06: Check = (g) => {
  const room = g.site.room;
  if (!room) return unknown('INV-G06', 'помещение не задано (HB 750)');
  const out: Violation[] = [];
  if (room.widthMm !== null && g.envelope.widthMm > room.widthMm + TOL) out.push(v('OUTSIDE_ROOM', `Ширина изделия ${g.envelope.widthMm} мм больше ширины помещения ${room.widthMm} мм`));
  if (room.depthMm !== null && g.envelope.depthMm > room.depthMm + TOL) out.push(v('OUTSIDE_ROOM', `Глубина изделия ${g.envelope.depthMm} мм больше глубины помещения ${room.depthMm} мм`));
  if (room.heightMm === null) return out.length ? result('INV-G06', out) : unknown('INV-G06', 'высота потолка не задана: подъём после сборки лёжа не проверен (HB 750)');
  {
    if (g.envelope.heightMm > room.heightMm + TOL) out.push(v('OUTSIDE_ROOM', `Высота изделия ${g.envelope.heightMm} мм больше высоты помещения ${room.heightMm} мм`));
    for (const a of g.assemblies.filter((a) => a.kind === 'CABINET' || a.kind === 'MODULE')) {
      const diag = Math.hypot(a.box.sizeMm[1], a.box.sizeMm[2]);
      if (diag > room.heightMm + TOL) out.push(v('LIFT_CEILING_LOW', `Корпус ${a.id} не поднять после сборки лёжа: диагональ ${Math.round(diag)} мм больше высоты помещения ${room.heightMm} мм`, a.id));
    }
  }
  return result('INV-G06', out);
};

export const G07: Check = (g) => {
  const cabinets = g.assemblies.filter((a) => a.kind === 'CABINET' || a.kind === 'MODULE');
  if (!cabinets.length) return notApplicable('INV-G07', 'нет корпусов');
  const children = (id: string): Set<string> => {
    const out = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const a of g.assemblies) if (a.parentId && out.has(a.parentId) && !out.has(a.id)) { out.add(a.id); grew = true; }
    }
    return out;
  };
  const out: Violation[] = [];
  for (const c of cabinets) {
    // The floor is z = 0 of the product axes (contract: origin on a clean floor). A wall unit hangs on its hangers
    // (K3, Handbook INV-F22-01/02): the fixing to the wall is an installation requirement, never a PASS of the wall.
    const ids = children(c.id),
      onFloor =
        g.parts.some((p) => ids.has(p.assemblyId) && near(partBox(p).min[2]!, 0)) ||
        g.mechanisms.some((m) => ids.has(m.assemblyId) && (m.kind === 'SUPPORT_LEG' || m.kind === 'SUSPENSION_RAIL'));
    // A mezzanine of the wardrobe (MOD-DEC-200) stands on the top of the body under it (FINDINGS 535), a new mezzanine
    // of the kitchen on its tall cabinet (FINDINGS 1610).
    const parent = c.request?.['body.parent'],
      under = parent ? cabinets.find((x) => (x.kind === 'CABINET' || x.kind === 'MODULE') && x.inputRef === parent) : undefined,
      onBody = !!under && near(c.box.minMm[2]!, under.box.minMm[2]! + under.box.sizeMm[2]!);
    if (!onFloor && !onBody) out.push(v('BODY_NOT_SUPPORTED', `Корпус ${c.id} не опирается на пол: нет основания, опор или навесов`, c.id));
  }
  return result('INV-G07', out);
};

/** INV-G08 (Handbook INV-A03-01): the blank fits the usable sheet in an allowed orientation. */
export const G08: Check = (g, ctx) => {
  const out: Violation[] = [];
  let checked = 0;
  for (const p of g.parts) {
    if (p.supply === 'PURCHASED') continue;
    const sheet = p.material.sheetFormatMm ?? ctx.boards?.find((b) => b.variantId === p.material.variantId)?.sheetFormatMm ?? null,
      S = p.dimensionChain.sawnBlank;
    if (!sheet || !S) continue;
    checked++;
    const [SL, SW] = sheet,
      along = S.lengthMm <= SL + TOL && S.widthMm <= SW + TOL,
      across = S.lengthMm <= SW + TOL && S.widthMm <= SL + TOL,
      ok = p.orientation.grainDirection === 'NONE' ? along || across : along;
    if (!ok) out.push(v('BLANK_EXCEEDS_SHEET', `Заготовка ${p.id} ${S.lengthMm} × ${S.widthMm} мм не помещается в лист ${SL} × ${SW} мм с учётом текстуры`, p.id));
  }
  return checked ? result('INV-G08', out) : unknown('INV-G08', 'нет формата листа или пильной заготовки S');
};

// ---------------------------------------------------------------- F. carcass formulas and grids

export const F01: Check = (g) => {
  const out: Violation[] = [];
  let checked = 0;
  for (const a of g.assemblies) {
    if (!a.frame) continue;
    const t = a.frame.panelThicknessMm,
      M = a.box.sizeMm[0];
    for (const p of g.parts.filter((p) => p.assemblyId === a.id && (p.role === 'CARCASS_TOP_PANEL' || p.role === 'TOP_COVER_PANEL' || p.role === 'CARCASS_BOTTOM_PANEL'))) {
      checked++;
      // Крыша корпуса — между боковинами (051); верхняя крышка низкой мебели — над боковинами (242).
      const want = p.role === 'TOP_COVER_PANEL' ? M : M - 2 * t;
      if (!near(p.finishedWithEdge.lengthMm, want)) out.push(v('FE05_HORIZONTAL', `${p.id}: длина ${p.finishedWithEdge.lengthMm} мм, по формуле ${want} мм`, p.id));
    }
  }
  return checked ? result('INV-F01', out) : notApplicable('INV-F01', 'нет крыши и дна в корпусах');
};

const childrenOf = (g: Graph, id: string) => {
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const a of g.assemblies) if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) { ids.add(a.id); grew = true; }
  }
  return ids;
};

export const F02: Check = (g) => {
  const out: Violation[] = [];
  let checked = 0;
  for (const a of g.assemblies) {
    if (!a.frame) continue;
    const L = a.frame.elevations,
      ids = childrenOf(g, a.id);
    for (const p of g.parts.filter((p) => ids.has(p.assemblyId))) {
      let want: number | null = null;
      // Partition and vertical structural panel span the clear height (051); filling dividers and local
      // partitions depend on their type and support (226, 234) — rule tests of W6.
      if (p.role === 'PARTITION' || p.role === 'VERTICAL_STRUCTURAL_PANEL') want = L.interiorTopElevationMm - L.interiorBottomElevationMm;
      if (p.role === 'SIDE_PANEL_LEFT' || p.role === 'SIDE_PANEL_RIGHT') want = L.sideTopElevationMm - L.sideBottomElevationMm;
      if (want === null) continue;
      checked++;
      if (!near(p.finishedWithEdge.lengthMm, want)) out.push(v(p.role.startsWith('SIDE') ? 'SIDE_HEIGHT' : 'FE05_DIVIDER', `${p.id}: высота ${p.finishedWithEdge.lengthMm} мм, по формуле ${want} мм`, p.id));
    }
  }
  return checked ? result('INV-F02', out) : notApplicable('INV-F02', 'нет боковин и перегородок');
};

export const F03: Check = (g) => {
  const sections = g.assemblies.filter((a) => a.kind === 'SECTION' && a.span);
  if (!sections.length) return notApplicable('INV-F03', 'нет секций');
  const out: Violation[] = [],
    widths = sections.map((s) => ratSub(s.span!.nominalEndMm, s.span!.nominalStartMm));
  sections.forEach((s, i) => {
    if (widths[i]!.numerator <= 0) out.push(v('NOMINAL_NON_POSITIVE', `Номинальная ширина секции ${s.id} не положительна`, s.id));
  });
  // The sections of a mezzanine (MOD-DEC-200) span the width of their body, not a second time the product (FINDINGS 535).
  const upper = new Set(g.assemblies.filter((a) => a.kind === 'CABINET' && a.request?.['body.parent']).map((a) => a.id)),
    sum = ratSum(widths.filter((_, i) => !upper.has(sections[i]!.parentId!)));
  for (const c of g.assemblies.filter((a) => upper.has(a.id))) {
    const own = ratSum(widths.filter((_, i) => sections[i]!.parentId === c.id));
    if (!ratEq(own, ratFromDecimal(c.box.sizeMm[0]!))) out.push(v('NOMINAL_SUM', `Сумма номинальных ширин секций антресоли ${c.id} ${own.numerator / own.denominator} мм ≠ ширине корпуса ${c.box.sizeMm[0]} мм`, c.id));
  }
  if (!ratEq(sum, ratFromDecimal(g.envelope.widthMm)))
    out.push(v('NOMINAL_SUM', `Сумма номинальных ширин секций ${sum.numerator / sum.denominator} мм ≠ ширине изделия ${g.envelope.widthMm} мм`));
  return result('INV-F03', out);
};

export const F04: Check = (g) => {
  const out: Violation[] = [],
    byId = new Map(g.assemblies.map((a) => [a.id, a]));
  let checked = 0;
  for (const s of g.assemblies.filter((a) => a.kind === 'SECTION' && a.span)) {
    let frame = null;
    for (let a = s.parentId ? byId.get(s.parentId) : undefined; a && !frame; a = a.parentId ? byId.get(a.parentId) : undefined) frame = a.frame;
    if (!frame) continue;
    checked++;
    const t = ratFromDecimal(frame.panelThicknessMm),
      half = ratFromDecimal(frame.panelThicknessMm / 2),
      left = ratSub(s.span!.clearStartMm, s.span!.nominalStartMm),
      right = ratSub(s.span!.nominalEndMm, s.span!.clearEndMm),
      clear = ratSub(s.span!.clearEndMm, s.span!.clearStartMm);
    if (clear.numerator <= 0) out.push(v('CLEAR_NON_POSITIVE', `Чистый проём секции ${s.id} не положителен`, s.id));
    for (const [side, b] of [['слева', left], ['справа', right]] as const)
      if (!ratEq(b, t) && !ratEq(b, half)) out.push(v('CLEAR_BOUNDARY', `Секция ${s.id}: граница ${side} забирает ${b.numerator / b.denominator} мм, а не t или t/2`, s.id));
  }
  return checked ? result('INV-F04', out) : notApplicable('INV-F04', 'нет секций с корпусом');
};

export const F05: Check = (g) => {
  const grids = g.assemblies.filter((a) => a.frontGrid).map((a) => a.frontGrid!);
  if (!grids.length) return notApplicable('INV-F05', 'нет фронтальной сетки');
  const out: Violation[] = [],
    profiles = new Set(grids.map((f) => f.gapProfile.profileId));
  if (profiles.size > 1) out.push(v('GAP_PROFILES', `Фасады изделия берут зазоры из разных профилей: ${[...profiles].join(', ')}`));
  for (const grid of grids) {
    const half = ratFromDecimal(grid.gapProfile.facadeGapHorizontalMm / 2),
      outer = ratFromDecimal(grid.gapProfile.facadeOuterOffsetLeftMm),
      cols = new Map(grid.columns.map((c) => [c.id, c]));
    for (const f of grid.facades) {
      const c = cols.get(f.columnId);
      if (!c) { out.push(v('FACADE_NO_COLUMN', `Фасад ${f.id} без колонки сетки`, f.id)); continue; }
      for (const [side, d] of [['слева', ratSub(f.leftMm, c.nominalStartMm)], ['справа', ratSub(c.nominalEndMm, f.rightMm)]] as const)
        if (!ratEq(d, half) && !ratEq(d, outer)) out.push(v('FACADE_CHAIN', `Фасад ${f.id}: отступ ${side} ${d.numerator / d.denominator} мм не равен половине шва или внешнему отступу`, f.id));
    }
    const byCol = new Map<string, typeof grid.facades>();
    for (const f of grid.facades) byCol.set(f.columnId, [...(byCol.get(f.columnId) ?? []), f]);
    for (const list of byCol.values()) {
      const sorted = [...list].sort((a, b) => a.bottomElevationMm.numerator / a.bottomElevationMm.denominator - b.bottomElevationMm.numerator / b.bottomElevationMm.denominator);
      for (let i = 1; i < sorted.length; i++) {
        const gap = ratSub(sorted[i]!.bottomElevationMm, sorted[i - 1]!.topElevationMm);
        if (!ratEq(gap, ratFromDecimal(grid.gapProfile.facadeGapVerticalMm))) out.push(v('FACADE_CHAIN', `Между фасадами ${sorted[i - 1]!.id} и ${sorted[i]!.id} по высоте ${gap.numerator / gap.denominator} мм, шов ${grid.gapProfile.facadeGapVerticalMm} мм`, sorted[i]!.id));
      }
    }
  }
  return result('INV-F05', out);
};

export const F06: Check = (g) => {
  const grids = g.assemblies.filter((a) => a.frontGrid || a.span);
  if (!grids.length) return notApplicable('INV-F06', 'нет сеток');
  const out: Violation[] = [],
    exact = (r: Rational) => Number.isInteger(r.numerator) && Number.isInteger(r.denominator) && r.denominator > 0;
  for (const a of grids) {
    const rs: [string, Rational][] = [];
    if (a.span) for (const [k, r] of Object.entries(a.span)) rs.push([a.id + '.' + k, r]);
    if (a.frontGrid) {
      for (const c of a.frontGrid.columns) rs.push([c.id + '.start', c.nominalStartMm], [c.id + '.end', c.nominalEndMm]);
      for (const f of a.frontGrid.facades) rs.push([f.id + '.left', f.leftMm], [f.id + '.right', f.rightMm], [f.id + '.bottomElevationMm', f.bottomElevationMm], [f.id + '.topElevationMm', f.topElevationMm]);
      const widthOf = (s: Rational, e: Rational) => ratSub(e, s),
        cols = new Map(a.frontGrid.columns.map((c) => [c.id, c]));
      const groups = new Map<string, Rational[]>();
      for (const f of a.frontGrid.facades) {
        const c = cols.get(f.columnId);
        if (!c) continue;
        const cw = widthOf(c.nominalStartMm, c.nominalEndMm),
          key = cw.numerator + '/' + cw.denominator + '|' + (f.facadeRowId ?? '');
        groups.set(key, [...(groups.get(key) ?? []), widthOf(f.leftMm, f.rightMm)]);
      }
      for (const [key, ws] of groups)
        if (ws.some((w) => !ratEq(w, ws[0]!))) out.push(v('UNEQUAL_EQUAL_FACADES', `Фасады равных колонок ${key.split('|')[0]} мм разной ширины`));
    }
    for (const [name, r] of rs) if (!exact(r)) out.push(v('NOT_EXACT', `${name}: значение не точная дробь`, name));
  }
  return result('INV-F06', out);
};

// ---------------------------------------------------------------- H. holes and drilling

export const H01: Check = (g) => {
  const parts = partMap(g),
    owners = new Set([...g.joints.map((j) => j.id), ...g.mechanisms.map((m) => m.id)]),
    out: Violation[] = [];
  for (const h of holesOf(g)) {
    const p = parts.get(h.partId);
    if (!p) { out.push(v('HOLE_ORPHAN', `Отверстие ${h.id} без детали ${h.partId}`, h.id)); continue; }
    if (!p.operationIds.includes(h.id)) out.push(v('HOLE_ORPHAN', `Отверстие ${h.id} не записано в операции детали ${p.id}`, h.id, p.id));
    if (!owners.has(owner(h))) out.push(v('HOLE_NO_OWNER', `У отверстия ${h.id} нет соединения или механизма`, h.id));
    if (!(h.mode === 'FACE' ? h.face && !h.edge : h.mode === 'EDGE' && h.edge && !h.face)) out.push(v('HOLE_MODE_UNKNOWN', `Отверстие ${h.id}: режим не согласован с пластью или торцом`, h.id));
    if (!finitePositive(h.diameterMm)) out.push(v('HOLE_DIAMETER_INVALID', `Диаметр отверстия ${h.id} не положителен`, h.id));
    // A marking is not drilled (MOD-DEC-276): its depth may be 0, the upper limit is checked by INV-H02.
    const depthOk = h.layer === 'MARKING' ? h.depthMm !== null && Number.isFinite(h.depthMm) && h.depthMm >= 0 : finitePositive(h.depthMm);
    if (!h.through && !depthOk) out.push(v('HOLE_DEPTH_INVALID', `Глубина отверстия ${h.id} не положительна`, h.id));
    if (![h.xMm, h.yMm].every(Number.isFinite)) out.push(v('HOLE_COORD_INVALID', `Координаты отверстия ${h.id} не числа`, h.id));
  }
  return result('INV-H01', out);
};

/**
 * The bore of a shelf support open at the end of the shelf by the scheme of its kit (MOD-DEC-344: the shelf is
 * machined by the scheme of the support): FLIPPER Ø15 at 5.5 mm from the end, the shank passes through the end into
 * the body. An exception to INV-H02 decided by the owner (MOD-DEC-365). Only a bore of the shelf (and the step of a stepped one) of a shelf support from a kit or a catalogue, at
 * the distance from the end its scheme gives (`shelfBoreFromEndMm`), wholly inside the width: it opens only to the end
 * and no further than the scheme (FINDINGS 272).
 */
const openPocket = (h: Hole, L: number, W: number, mechanisms: Map<string, Graph['mechanisms'][number]>) => {
  if (!(h.machiningRole === 'SHELF_BORE' || h.machiningRole === 'SHELF_BORE_STEP') || !('mechanismId' in h.owner) || !(h.source === 'KIT_FR3D' || h.source === 'MANUFACTURER_CATALOG')) return false;
  const m = mechanisms.get(h.owner.mechanismId),
    d = m?.kind === 'SHELF_SUPPORT' ? m.params.shelfBoreFromEndMm : null,
    r = h.diameterMm / 2;
  return typeof d === 'number' && d >= 0 && h.yMm - r >= -TOL && h.yMm + r <= W + TOL && (Math.abs(h.xMm - d) <= TOL || Math.abs(h.xMm - (L - d)) <= TOL);
};

export const H02: Check = (g) => {
  const parts = partMap(g),
    mechanisms = new Map(g.mechanisms.map((m) => [m.id, m])),
    out: Violation[] = [];
  for (const h of holesOf(g)) {
    const p = parts.get(h.partId);
    if (!p) continue;
    const { lengthMm: L, widthMm: W, panelThicknessMm: T } = p.finishedWithEdge,
      r = h.diameterMm / 2;
    if (h.mode === 'FACE') {
      const outside = h.xMm - r < -TOL || h.xMm + r > L + TOL || h.yMm - r < -TOL || h.yMm + r > W + TOL;
      if (outside && !openPocket(h, L, W, mechanisms)) out.push(v('HOLE_OUTSIDE_PART', `Отверстие ${h.id} выходит за деталь ${p.id}`, h.id, p.id));
      if (!h.through && h.depthMm! > T + TOL) out.push(v('HOLE_TOO_DEEP', `Глухое отверстие ${h.id} глубже детали`, h.id));
    } else {
      const along = h.edge === 'A' || h.edge === 'B' ? L : W,
        into = h.edge === 'A' || h.edge === 'B' ? W : L;
      if (h.diameterMm > T + TOL) out.push(v('EDGE_HOLE_WIDER_THAN_PANEL', `Отверстие ${h.id} в торец шире детали ${p.id}`, h.id));
      if (h.xMm - r < -TOL || h.xMm + r > along + TOL) out.push(v('HOLE_OUTSIDE_PART', `Отверстие ${h.id} выходит за торец ${h.edge} детали ${p.id}`, h.id));
      if (h.through || h.depthMm! > into + TOL) out.push(v('EDGE_HOLE_TOO_DEEP', `Отверстие ${h.id} в торец глубже детали`, h.id));
    }
    if (h.layer === 'MARKING') {
      if (h.through || h.depthMm! > drilling.constants.markingMaxDepth.value)
        out.push(v('MARKING_TOO_DEEP', `Метка ${h.id} глубже ${drilling.constants.markingMaxDepth.value} мм: это сверление, а не разметка`, h.id));
      if (h.source === 'RULE' || !('mechanismId' in h.owner))
        out.push(v('MARKING_NOT_LIBRARY', `Метка ${h.id} не из библиотеки фурнитуры: разметкой бывают только библиотечные отверстия (MOD-DEC-276)`, h.id));
    }
  }
  return result('INV-H02', out);
};

export const H03: Check = (g) => {
  const parts = partMap(g),
    minWeb: number | null = drilling.constants.minWeb.value,
    out: Violation[] = [],
    pending: string[] = [],
    byPart = new Map<string, Hole[]>();
  for (const h of holesOf(g)) if (h.mode === 'FACE' && !h.through) byPart.set(h.partId, [...(byPart.get(h.partId) ?? []), h]);
  for (const [partId, hs] of byPart) {
    const T = parts.get(partId)?.finishedWithEdge.panelThicknessMm;
    if (T === undefined) continue;
    for (const h of hs) if (h.depthMm! >= T - TOL) out.push(v('BLIND_HOLE_BREAKS_THROUGH', `Глухое отверстие ${h.id} не оставляет материала`, h.id));
    for (const f of hs.filter((h) => h.face === 'N_POS'))
      for (const b of hs.filter((h) => h.face === 'N_NEG')) {
        if (Math.hypot(f.xMm - b.xMm, f.yMm - b.yMm) >= (f.diameterMm + b.diameterMm) / 2) continue;
        const web = T - f.depthMm! - b.depthMm!;
        if (web <= 0) out.push(v('OPPOSED_BREAK_THROUGH', `Встречные отверстия ${f.id} и ${b.id} сходятся: материала между ними нет`, f.id, b.id));
        else if (minWeb === null) pending.push(`${f.id}/${b.id}`);
        else if (web < minWeb - TOL) out.push(v('OPPOSED_WEB', `Встречные отверстия ${f.id} и ${b.id}: перемычка ${Math.round(web * 10) / 10} мм меньше ${minWeb} мм`, f.id, b.id));
      }
  }
  if (!out.length && pending.length) return unknown('INV-H03', `остаток материала под выборкой не задан (HB 271): ${pending.length} пар встречных отверстий — ${pending.join(', ')}`);
  return result('INV-H03', out);
};

export const H04: Check = (g) => {
  const parts = partMap(g),
    out: Violation[] = [],
    byPart = new Map<string, Hole[]>();
  for (const h of holesOf(g)) byPart.set(h.partId, [...(byPart.get(h.partId) ?? []), h]);
  for (const [partId, hs] of byPart) {
    const p = parts.get(partId);
    if (!p) continue;
    for (let i = 0; i < hs.length; i++)
      for (let k = i + 1; k < hs.length; k++) {
        const a = hs[i]!,
          b = hs[k]!;
        if (owner(a) === owner(b) && a.stationMm !== null && a.stationMm === b.stationMm && a.machiningRole !== b.machiningRole) continue;
        const same = a.mode === b.mode && a.face === b.face && a.edge === b.edge;
        if (same && near(a.xMm, b.xMm) && near(a.yMm, b.yMm)) {
          out.push(v('HOLE_DUPLICATE', `Отверстия ${a.id} и ${b.id} совпадают`, a.id, b.id));
          continue;
        }
        const hit = same && a.mode === 'FACE'
          ? Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm) < (a.diameterMm + b.diameterMm) / 2 - TOL && intersects(holeVolume(a, p), holeVolume(b, p), -1e-9)
          : intersects(holeVolume(a, p), holeVolume(b, p), TOL);
        if (hit) out.push(v(same ? 'HOLE_OVERLAP' : 'HOLE_FACE_EDGE_CROSS', `Отверстия ${a.id} и ${b.id} детали ${p.id} пересекаются`, a.id, b.id));
      }
  }
  return result('INV-H04', out);
};

export const H05: Check = (g) => {
  const parts = partMap(g),
    tol = tolerance.constants.holePosition.value,
    out: Violation[] = [];
  let checked = 0;
  for (const j of g.joints) {
    // The housing of a cam connector (machiningRole CAM) crosses the joint by design; its mates are the channel and the stud (§2.7).
    const hs = holesOf(g).filter((h) => owner(h) === j.id && h.machiningRole !== 'CAM'),
      through = hs.filter((h) => h.partId === j.parts.throughPartId),
      recv = hs.filter((h) => h.partId === j.parts.receivingPartId);
    for (const a of through)
      for (const b of recv.filter((b) => b.stationMm === a.stationMm)) {
        if (!parts.has(a.partId) || !parts.has(b.partId)) continue;
        checked++;
        const n = a.inwardNormal,
          m = b.inwardNormal,
          cross = [n[1] * m[2] - n[2] * m[1], n[2] * m[0] - n[0] * m[2], n[0] * m[1] - n[1] * m[0]],
          d = [b.entryMm[0] - a.entryMm[0], b.entryMm[1] - a.entryMm[1], b.entryMm[2] - a.entryMm[2]],
          len = Math.hypot(...n) || 1,
          t = (d[0]! * n[0] + d[1]! * n[1] + d[2]! * n[2]) / (len * len),
          off = Math.hypot(d[0]! - t * n[0], d[1]! - t * n[1], d[2]! - t * n[2]);
        if (Math.hypot(...cross) > 1e-6 || off > tol) out.push(v('JOINT_HOLES_NOT_COAXIAL', `Отверстия ${a.id} и ${b.id} соединения ${j.id} не соосны (${Math.round(off * 100) / 100} мм)`, a.id, b.id, j.id));
      }
  }
  return checked ? result('INV-H05', out) : notApplicable('INV-H05', 'нет пар ответных отверстий');
};

/** Kinds of joints and mechanisms that are made by drilling. */
const DRILLED_JOINTS = new Set(['CONFIRMAT', 'CAM_CONNECTOR', 'DOWEL', 'SCREW']);
const DRILLED_MECHANISMS = new Set(['HINGE', 'DRAWER_RUNNER', 'SHELF_SUPPORT', 'FACADE_LIFT', 'CLOTHES_ROD']);

export const H06: Check = (g) => {
  const out: Violation[] = [],
    hs = holesOf(g),
    incomplete = (id: string) => hs.some((h) => owner(h) === id && h.completeness !== 'COMPLETE') || g.unresolved.some((u) => u.code === 'DRILLING_INCOMPLETE' && (u.jointIds.includes(id) || u.mechanismIds.includes(id)));
  // Exemptions by decision (SLIM screws, MOD-DEC-189) do not ask for holes; marking holes (276) count as holes.
  for (const j of g.joints.filter((j) => DRILLED_JOINTS.has(j.kind) && !j.drillingExemption))
    if (!hs.some((h) => owner(h) === j.id) && !incomplete(j.id)) out.push(v('JOINT_WITHOUT_HOLES', `У соединения ${j.id} нет отверстий и нет пометки «присадка неполная»`, j.id));
  for (const h of hs)
    if ('mechanismId' in h.owner && h.source === 'RULE')
      out.push(v('HARDWARE_DRILLING_BY_RULE', `Отверстие ${h.id} фурнитуры задано правилом: присадка фурнитуры — из комплекта .fr3d или каталога производителя (MOD-DEC-277)`, h.id));
  for (const h of hs)
    if (h.source === 'MANUFACTURER_CATALOG' && !h.sourceRef)
      out.push(v('CATALOG_WITHOUT_REF', `Отверстие ${h.id} дописано по каталогу без ссылки на каталог и страницу (MOD-DEC-277)`, h.id));
  // A number of the prototype without kit and catalogue is «присадка неполная» (277): never complete, marked for the owner.
  const marked = (id: string) => g.unresolved.some((u) => u.code === 'DRILLING_INCOMPLETE' && (u.jointIds.includes(id) || u.mechanismIds.includes(id)));
  for (const h of hs)
    if (h.source === 'PROTOTYPE' && (h.completeness === 'COMPLETE' || !h.sourceRef || !marked(owner(h))))
      out.push(v('PROTOTYPE_HOLE_NOT_MARKED', `Отверстие ${h.id} взято из прототипа без комплекта и каталога: нужны ссылка на прототип, полнота «неполная» и пометка «присадка неполная» (MOD-DEC-277)`, h.id));
  for (const m of g.mechanisms.filter((m) => DRILLED_MECHANISMS.has(m.kind) && !m.drillingExemption)) {
    const own = hs.filter((h) => owner(h) === m.id);
    if (!own.length && !incomplete(m.id)) out.push(v('MECHANISM_WITHOUT_HOLES', `У механизма ${m.id} нет отверстий и нет пометки «присадка неполная»`, m.id));
    if (m.kind === 'HINGE') {
      const cups = own.filter((h) => h.machiningRole === 'CUP').length;
      if (cups && cups !== m.quantity) out.push(v('HINGE_COUNT_MISMATCH', `Механизм ${m.id}: петель ${m.quantity}, чашек ${cups}`, m.id));
    }
  }
  return result('INV-H06', out);
};

export const H07: Check = (g) => {
  const parts = partMap(g),
    out: Violation[] = [];
  for (const h of holesOf(g)) {
    const p = parts.get(h.partId);
    if (p && p.supply === 'PURCHASED') out.push(v('DRILL_ON_PART_NOT_IN_CUTLIST', `Отверстие ${h.id} на покупной детали ${p.id}: присадку несёт отдельная изготовляемая деталь`, h.id, p.id));
  }
  return result('INV-H07', out);
};

/** INV-H08 (Handbook INV-D16-03, MOD-DEC-158): no drilling for door handles in production outputs. */
export const H08: Check = (g) => {
  const out: Violation[] = [];
  for (const h of holesOf(g))
    if (/HANDLE/i.test(h.machiningRole) || /ручк/i.test(h.purpose)) out.push(v('HANDLE_DRILLING', `Отверстие ${h.id} под ручку: присадку под ручки не рассчитываем (MOD-DEC-158)`, h.id));
  return result('INV-H08', out);
};

/**
 * INV-H09 (Handbook INV-B08-01 — the remaining material of the rebate; FINDINGS 655): no hole of a part crosses a
 * groove, rebate or notch of the same part. A fastener in the pocket of the back panel loses its hold and spoils the
 * pocket (the dowel of the rear plinth rail in the rebate of the bottom, PR #269). A groove in an edge has no volume
 * here: it is listed, and without a crossing the answer is UNKNOWN.
 */
export const H09: Check = (g) => {
  const out: Violation[] = [],
    pending: string[] = [];
  for (const p of g.parts) {
    const own = g.operations.filter((o) => o.partId === p.id),
      holes = own.filter(isHole),
      cuts: { id: string; box: ReturnType<typeof notchVolume> }[] = [];
    if (!holes.length) continue;
    for (const o of own) {
      if (o.op === 'NOTCH') cuts.push({ id: o.id, box: notchVolume(o as Notch) });
      else if (o.op === 'GROOVE') {
        const box = grooveVolume(o as Groove, p);
        if (box) cuts.push({ id: o.id, box });
        else pending.push(o.id);
      }
    }
    for (const h of holes)
      for (const c of cuts)
        if (holeHitsBox(h, p, c.box, TOL)) out.push(v('HOLE_IN_GROOVE', `Отверстие ${h.id} заходит в паз или выборку ${c.id} детали ${p.id}`, h.id, c.id, p.id));
  }
  if (!out.length && pending.length) return unknown('INV-H09', `пазы в торце без объёма: ${pending.join(', ')}`);
  return result('INV-H09', out);
};

// ---------------------------------------------------------------- M. mechanisms and loads

const hinges = (g: Graph) => g.mechanisms.filter((m) => m.kind === 'HINGE');

export const M01: Check = (g, ctx) => {
  const doors = g.parts.filter((p) => p.role === 'HINGED_FACADE_LEAF');
  if (!doors.length) return notApplicable('INV-M01', 'нет распашных дверей');
  const out: Violation[] = [],
    hs = holesOf(g);
  for (const d of doors) {
    const ms = hinges(g).filter((m) => m.partIds.includes(d.id));
    if (!ms.length || ms.every((m) => m.quantity === 0)) { out.push(v('DOOR_WITHOUT_HINGES', `У дверцы ${d.id} нет петель`, d.id)); continue; }
    for (const m of ms) {
      const cups = hs.filter((h) => owner(h) === m.id && h.machiningRole === 'CUP'),
        plates = hs.filter((h) => owner(h) === m.id && h.machiningRole === 'PLATE');
      if (m.stationsMm.length !== m.quantity) out.push(v('HINGE_COUNT_MISMATCH', `Механизм ${m.id}: петель ${m.quantity}, станций ${m.stationsMm.length}`, m.id));
      if (cups.length && new Set(cups.map((h) => h.stationMm)).size !== m.quantity) out.push(v('CUP_COUNT_MISMATCH', `Механизм ${m.id}: чашек ${new Set(cups.map((h) => h.stationMm)).size}, петель ${m.quantity}`, m.id));
      if (cups.length && !plates.length) out.push(v('HINGE_NO_PLATE', `Механизм ${m.id}: у петель нет ответных планок`, m.id));
    }
  }
  const line = ctx.projections?.price?.lines.find((l) => l.basis === 'hingeCount');
  const total = hinges(g).reduce((s, m) => s + m.quantity, 0);
  if (line && line.quantity !== total) out.push(v('PRICE_HINGE_COUNT', `В цене петель ${line.quantity}, в графе ${total}`));
  return result('INV-M01', out);
};

/** Smallest n allowed by MOD-DEC-190 for a facade of height H and mass m; null when the chart has no such n. */
export function minimalHingeCount(H: number, m: number, rows: HingeChart['rows']): number | null {
  const over = 1 + hingePolicy.constants.oneLimitOver.value,
    under = hingePolicy.constants.otherLimitUnder.value;
  for (const r of [...rows].sort((a, b) => a.n - b.n)) {
    const okH = H <= r.Hmax,
      okM = m <= r.Mmax;
    if (okH && okM) return r.n;
    if (!okH && H <= r.Hmax * over && m < r.Mmax * under) return r.n;
    if (!okM && m <= r.Mmax * over && H < r.Hmax * under) return r.n;
  }
  return null;
}

export const M02: Check = (g, ctx) => {
  const ms = hinges(g);
  if (!ms.length) return notApplicable('INV-M02', 'нет петель');
  const charts = new Map((ctx.hingeCharts ?? []).map((c) => [c.profileId, c]));
  const out: Violation[] = [],
    parts = partMap(g);
  let checked = 0;
  for (const m of ms) {
    const chart = charts.get(m.profile.catalogId),
      door = m.partIds.map((id) => parts.get(id)).find((p) => p?.role === 'HINGED_FACADE_LEAF'),
      mass = door ? ctx.facadeMassKg?.[door.id] : undefined;
    if (!chart || !door || mass === undefined) continue;
    checked++;
    const n = minimalHingeCount(door.finishedWithEdge.lengthMm, mass, chart.rows);
    if (n === null) out.push(v('HINGE_REJECTED_190', `Дверца ${door.id}: по графику ${m.profile.catalogId} петель не хватает ни при каком n`, door.id, m.id));
    else if (n !== m.quantity) out.push(v('HINGE_COUNT_190', `Дверца ${door.id}: петель ${m.quantity}, по правилу 190 — ${n}`, door.id, m.id));
  }
  return checked ? result('INV-M02', out) : unknown('INV-M02', 'нет графика Hmax(n), Mmax(n) петли или массы фасада (вопрос Q3)');
};

export const M03: Check = (g) => {
  const ms = hinges(g);
  if (!ms.length) return notApplicable('INV-M03', 'нет петель');
  const tol = tolerance.constants.holePosition.value,
    parts = partMap(g),
    out: Violation[] = [];
  for (const m of ms) {
    const own = holesOf(g).filter((h) => owner(h) === m.id),
      cups = own.filter((h) => h.machiningRole === 'CUP');
    for (const c of cups) {
      const plates = own.filter((h) => h.machiningRole === 'PLATE' && h.stationMm === c.stationMm);
      if (!plates.length) { out.push(v('HINGE_NO_PLATE', `Чашке ${c.id} нет ответной планки`, c.id, m.id)); continue; }
      const cp = parts.get(c.partId);
      if (!cp) continue;
      const cz = partPoint(cp, c.xMm, c.yMm, 0)[2];
      const pz = plates.map((p) => { const pp = parts.get(p.partId); return pp ? partPoint(pp, p.xMm, p.yMm, 0)[2] : NaN; }),
        mean = pz.reduce((s, x) => s + x, 0) / pz.length;
      if (!(Math.abs(mean - cz) <= tol)) out.push(v('HINGE_PLATE_MISALIGNED', `Чашка ${c.id} на высоте ${Math.round(cz * 10) / 10} мм, планка — ${Math.round(mean * 10) / 10} мм`, c.id, m.id));
    }
  }
  return result('INV-M03', out);
};

/**
 * Reservations of a mechanism do not cut parts it does not link (hinge vs shelf, drawer vs facade — 050, 159, 164).
 * A hinge meeting the parts of an inner drawer is FE-04's: when the conflict is declared (INNER_DRAWER_HINGE_CONFLICT
 * names the hinge and the runner), the parts of that runner are INV-M05's to judge, not a silent hit (W7, FINDINGS 391).
 */
export const M04: Check = (g) => {
  const ms = g.mechanisms.filter((m) => m.motionEnvelopes.length);
  if (!ms.length) return notApplicable('INV-M04', 'нет резервов механизмов');
  const out: Violation[] = [],
    declared = (m: Mechanism, partId: string) =>
      g.unresolved.some((u) => u.code === 'INNER_DRAWER_HINGE_CONFLICT' && u.mechanismIds.includes(m.id) && g.mechanisms.some((d) => d.kind === 'DRAWER_RUNNER' && u.mechanismIds.includes(d.id) && d.partIds.includes(partId)));
  for (const m of ms)
    for (const r of m.motionEnvelopes.map(boxToAabb))
      for (const p of g.parts)
        if (!m.partIds.includes(p.id) && boxHitsPart(r, p, TOL) && !(m.kind === 'HINGE' && declared(m, p.id))) out.push(v('MECHANISM_HITS_PART', `Резерв механизма ${m.id} задевает деталь ${p.id}`, m.id, p.id));
  return result('INV-M04', out);
};

/** Hinge–inner drawer conflicts are either absent or declared as FE-04 says (050, 053). */
export const M05: Check = (g) => {
  const hs = hinges(g).filter((m) => m.motionEnvelopes.length),
    ds = g.mechanisms.filter((m) => (m.kind === 'DRAWER_RUNNER' || m.kind === 'DRAWER_BOX') && m.motionEnvelopes.length);
  if (!hs.length || !ds.length) return notApplicable('INV-M05', 'нет петель и ящиков с резервами');
  const out: Violation[] = [];
  for (const h of hs)
    for (const d of ds) {
      const hit = h.motionEnvelopes.some((a) => d.motionEnvelopes.some((b) => intersects(boxToAabb(a), boxToAabb(b), TOL)));
      if (!hit) continue;
      const declared = g.unresolved.find((u) => u.code === 'INNER_DRAWER_HINGE_CONFLICT' && u.mechanismIds.includes(h.id) && u.mechanismIds.includes(d.id));
      if (!declared) { out.push(v('HINGE_DRAWER_CONFLICT_SILENT', `Петля ${h.id} и ящик ${d.id} конфликтуют без предупреждения FE-04`, h.id, d.id)); continue; }
      // MOD-DEC-050, 053: VALID_WITH_WARNINGS (not INVALID: editing, calculation and saving stay allowed),
      // capability HOLD and readiness BLOCKED — separately (IR6-06).
      if (g.result.furnitureValidity !== 'VALID_WITH_WARNINGS' && !g.unresolved.some((u) => u.level === 'ERROR'))
        out.push(v('FE04_STATUS', `Конфликт петли и ящика: статус ${g.result.furnitureValidity}, нужен VALID_WITH_WARNINGS`, h.id, d.id));
      if (declared.level !== 'WARNING') out.push(v('FE04_STATUS', 'Конфликт петли и ящика — критическое предупреждение, а не ошибка: правка и сохранение доступны', h.id, d.id));
      if (g.result.productionReadiness.status !== 'BLOCKED') out.push(v('FE04_STATUS', 'Конфликт петли и ящика: готовность должна быть BLOCKED', h.id, d.id));
      if (!g.result.capabilityResolution.some((c) => c.status === 'HOLD')) out.push(v('FE04_STATUS', 'Конфликт петли и ящика: возможность должна быть HOLD', h.id, d.id));
    }
  return result('INV-M05', out);
};

export const M06: Check = (g) => {
  if (!g.loads.length) return notApplicable('INV-M06', 'нет нагрузок');
  // A limit without a source is UNKNOWN, never infinite (INV-E19-03, HB 1164): such loads make the answer UNKNOWN
  // unless a known limit is already exceeded. SLIM: report_only until the manufacturer's data (MOD-DEC-306).
  const ls = g.loads.filter((l) => l.capacityKg !== null),
    unknownIds = g.loads.filter((l) => l.capacityKg === null).map((l) => l.id);
  const out: Violation[] = [];
  for (const l of ls) {
    if (l.totalMassKg <= (l.capacityKg as number) + 1e-9) continue;
    const ref = [l.partId, l.mechanismId].filter((x): x is string => !!x),
      declared = g.unresolved.some((u) => u.blocksProductionReadiness && ref.some((id) => u.partIds.includes(id) || u.mechanismIds.includes(id)));
    if (!declared) out.push(v('OVERLOAD_ACCEPTED', `Нагрузка ${l.id}: ${l.totalMassKg} кг больше ёмкости ${l.capacityKg} кг и принята молча`, l.id, ...ref));
  }
  if (!out.length && unknownIds.length) return unknown('INV-M06', `ёмкость неизвестна: ${unknownIds.join(', ')}`);
  return result('INV-M06', out);
};

// ---------------------------------------------------------------- S. single source of truth and outputs

export const S01: Check = (g, ctx) => {
  const pr = ctx.projections;
  if (!pr || (!pr.specification && !pr.cutList && !pr.drillingOperationIds && !pr.scenePartIds)) return unknown('INV-S01', 'нет выгрузок');
  const out: Violation[] = [],
    manufactured = g.parts.filter((p) => p.supply === 'MANUFACTURED'),
    parts = partMap(g);
  const compare = (name: string, rows: { partId: string }[], expected: Part[], dims: (r: never, p: Part) => string | null) => {
    const count = new Map<string, number>();
    for (const r of rows) count.set(r.partId, (count.get(r.partId) ?? 0) + 1);
    for (const p of expected) if (!count.has(p.id)) out.push(v(name + '_MISSING_PART', `В выгрузке «${name}» нет детали ${p.id}`, p.id));
    for (const [id, n] of count) {
      if (!parts.has(id)) out.push(v(name + '_EXTRA_ROW', `В выгрузке «${name}» лишняя строка ${id}`, id));
      if (n > 1) out.push(v(name + '_QTY_MISMATCH', `В выгрузке «${name}» деталь ${id} повторяется ${n} раз`, id));
    }
    for (const r of rows) {
      const p = parts.get(r.partId);
      const diff = p ? dims(r as never, p) : null;
      if (diff) out.push(v(name + '_DIM_MISMATCH', `«${name}», ${r.partId}: ${diff}`, r.partId));
    }
  };
  if (pr.specification)
    compare('SPEC', pr.specification, g.parts, (r: SpecRow, p) =>
      near(r.lengthMm, p.finishedWithEdge.lengthMm) && near(r.widthMm, p.finishedWithEdge.widthMm) && near(r.panelThicknessMm, p.finishedWithEdge.panelThicknessMm) ? null : `${r.lengthMm}×${r.widthMm}×${r.panelThicknessMm}, в графе ${p.finishedWithEdge.lengthMm}×${p.finishedWithEdge.widthMm}×${p.finishedWithEdge.panelThicknessMm}`);
  if (pr.cutList)
    compare('DSP', pr.cutList, manufactured, (r: CutRow, p) => {
      const S = p.dimensionChain.sawnBlank;
      if (!S) return `в раскрое ${r.lengthMm}×${r.widthMm}, а пильная заготовка детали неизвестна (${p.dimensionChain.missing.join(', ')})`;
      return near(r.lengthMm, S.lengthMm) && near(r.widthMm, S.widthMm) ? null : `${r.lengthMm}×${r.widthMm}, пильная заготовка в графе ${S.lengthMm}×${S.widthMm}`;
    });
  if (pr.scenePartIds) compare('SCENE', pr.scenePartIds.map((partId) => ({ partId })), g.parts, () => null);
  if (pr.drillingOperationIds) {
    const ids = new Set(holesOf(g).filter((h) => h.layer === 'DRILL').map((h) => h.id)),
      got = new Set(pr.drillingOperationIds);
    for (const id of ids) if (!got.has(id)) out.push(v('DRILL_COUNT_MISMATCH', `В присадке нет отверстия ${id}`, id));
    for (const id of got) if (!ids.has(id)) out.push(v('DRILL_COUNT_MISMATCH', `В присадке лишнее отверстие ${id}`, id));
  }
  return result('INV-S01', out);
};

/**
 * INV-S02: the dimension chain E → F → M → S is consistent (MOD-DEC-169; Handbook HB 172, 1466). A floor edge without
 * the 0.4 mm band (FE-EDGE-002) is not a violation: the graph must carry its warning, and only as a WARNING (MOD-DEC-325).
 */
export const S02: Check = (g) => {
  const out: Violation[] = [],
    floorMin = edgePolicy.constants.floorMinThickness.value,
    floorLevel = edgePolicy.constants.floorBelowMinLevel.value,
    sameSize = (a: PlanarSize | null, b: PlanarSize | null) => (a === null ? b === null : b !== null && near(a.lengthMm, b.lengthMm) && near(a.widthMm, b.widthMm)),
    show = (x: PlanarSize | null) => (x ? `${x.lengthMm}×${x.widthMm}` : 'неизвестно');
  for (const p of g.parts) {
    if (p.supply === 'PURCHASED') continue;
    const d = p.dimensionChain,
      want = deriveDimensionChain(p.finishedWithEdge, p.edges, d.machiningAllowance, d.sawingAllowance);
    for (const [st, name] of [['finishedPart', 'F'], ['machiningBlank', 'M'], ['sawnBlank', 'S']] as const)
      if (!sameSize(d[st], want[st])) out.push(v('DIMENSION_CHAIN', `Деталь ${p.id}: ${name} = ${show(d[st])}, по цепи E → F → M → S — ${show(want[st])}`, p.id));
    if (d.status !== want.status) out.push(v('DIMENSION_STATUS', `Деталь ${p.id}: статус размеров ${d.status}, по входам — ${want.status}`, p.id));
    if (d.missing.join('|') !== want.missing.join('|')) out.push(v('DIMENSION_STATUS', `Деталь ${p.id}: не указано, чего не хватает для цепи размеров`, p.id));
    for (const s of ['A', 'B', 'C', 'D'] as const) {
      const e = p.edges[s],
        len = s === 'A' || s === 'B' ? p.finishedWithEdge.lengthMm : p.finishedWithEdge.widthMm;
      if (e.slot !== s) out.push(v('EDGE_SLOT', `Деталь ${p.id}: торец ${s} записан как ${e.slot}`, p.id));
      if (!near(e.edgeLengthMm, len)) out.push(v('EDGE_LENGTH', `Деталь ${p.id}: длина торца ${s} ${e.edgeLengthMm}, деталь ${len}`, p.id));
      // MOD-DEC-325: a floor edge thinner than the protection is allowed, but the user is warned (the bell), not stopped.
      if (e.exposure === 'FLOOR' && e.edgeBandThicknessMm < floorMin - 1e-9) {
        const said = g.unresolved.filter((u) => u.code === FLOOR_CONTACT_EDGE_ISSUE && u.partIds.includes(p.id));
        if (!said.length) out.push(v('FLOOR_EDGE_NOT_WARNED', `Деталь ${p.id}: торец ${s} на полу без кромки ${floorMin} мм, а предупреждения пользователю нет`, p.id));
        else if (said.some((u) => u.level !== floorLevel))
          out.push(v('FLOOR_EDGE_LEVEL', `Деталь ${p.id}: торец ${s} на полу без кромки — предупреждение, а не ошибка: «без кромки» разрешено везде`, p.id));
      }
    }
    // A polygonal part: one band per segment of its contour, of its length and on the side it lies on (FINDINGS 816).
    if (p.contourMm) {
      const c = p.contourMm,
        bands = p.contourEdges ?? [];
      if (bands.length !== c.length) out.push(v('CONTOUR_EDGES', `Деталь ${p.id}: у контура ${c.length} сторон, кромок контура — ${bands.length}`, p.id));
      else
        bands.forEach((e, i) => {
          const a = c[i]!,
            b = c[(i + 1) % c.length]!;
          if (e.segment !== i || !near(e.lengthMm, Math.hypot(b[0] - a[0], b[1] - a[1])) || e.slot !== segmentSlot(a, b, p.finishedWithEdge.lengthMm, p.finishedWithEdge.widthMm, near))
            out.push(v('CONTOUR_EDGES', `Деталь ${p.id}: кромка контура ${i} не совпадает со стороной контура`, p.id));
        });
    } else if (p.contourEdges) out.push(v('CONTOUR_EDGES', `Деталь ${p.id}: кромки контура у прямоугольной детали`, p.id));
  }
  return result('INV-S02', out);
};

export const S03: Check = (g, ctx) => {
  const out: Violation[] = [];
  for (const a of g.assemblies) {
    if (!a.frame) continue;
    const rails = g.parts.filter((p) => p.assemblyId === a.id && p.role === 'PLINTH_PANEL');
    for (const r of rails)
      if (a.frame.base.kind === 'PLINTH' && !near(r.finishedWithEdge.widthMm, a.frame.base.heightMm) && !near(r.finishedWithEdge.lengthMm, a.frame.base.heightMm))
        out.push(v('BASE_TWO_SOURCES', `Цоколь ${r.id} высотой не ${a.frame.base.heightMm} мм, как у основания корпуса ${a.id}`, r.id, a.id));
    if (a.frame.base.kind !== 'PLINTH' && rails.length) out.push(v('BASE_TWO_SOURCES', `Корпус ${a.id}: основание «${a.frame.base.kind}», а цокольные планки есть`, a.id));
  }
  const price = ctx.projections?.price;
  if (price && price.total !== null && !price.partial) {
    const sum = Math.round(price.lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100);
    if (sum !== Math.round(price.total * 100)) out.push(v('PRICE_TWO_SOURCES', `Итог цены ${price.total} не равен сумме строк ${sum / 100}`));
  }
  return result('INV-S03', out);
};

export const S04: Check = (g, ctx) => {
  const stamps = ctx.projections?.stamps;
  if (!stamps?.length) return unknown('INV-S04', 'выгрузки не помечены ревизией');
  const out: Violation[] = [];
  for (const s of stamps) {
    if (s.revision !== g.revision.projectRevisionId) out.push(v('REVISION_MISMATCH', `Выгрузка «${s.output}» от ревизии ${s.revision}, граф — ${g.revision.projectRevisionId}`, s.output));
    if (s.ruleSet !== g.versions.ruleSet || s.generator !== g.versions.generator) out.push(v('VERSION_MISMATCH', `Выгрузка «${s.output}» от другой версии правил или генератора`, s.output));
  }
  return result('INV-S04', out);
};

export const S05: Check = (g, ctx) => {
  const r = ctx.evidence?.repeat;
  if (!r) return unknown('INV-S05', 'нет второго расчёта того же входа');
  return result('INV-S05', canonicalJson(r) === canonicalJson(g) ? [] : [v('NONDETERMINISTIC', 'Второй расчёт того же входа дал другой граф')]);
};

export const S06: Check = (g, ctx) => {
  const r = ctx.evidence?.reopened;
  if (!r) return unknown('INV-S06', 'нет графа после сохранения и открытия');
  return result('INV-S06', canonicalJson(r) === canonicalJson(g) ? [] : [v('ROUNDTRIP_MISMATCH', 'После сохранения и открытия проекта граф изменился')]);
};

// ---------------------------------------------------------------- P. price

const priceOf = (_g: Graph, ctx: CheckContext, id: string) => (ctx.projections?.price ? null : unknown(id, 'нет цены'));

export const P01: Check = (g, ctx) => {
  const none = priceOf(g, ctx, 'INV-P01');
  if (none) return none;
  const price = ctx.projections!.price!,
    out: Violation[] = [];
  for (const l of price.lines) {
    if (l.rate === null || l.amount === null) continue;
    const exact = Math.round(l.quantity * l.rate * 100),
      step = l.roundUpToRub ? l.roundUpToRub * 100 : 0,
      want = step ? Math.ceil(exact / step - 1e-9) * step : exact;
    if (want !== Math.round(l.amount * 100)) out.push(v('PRICE_LINE_ARITH', `Строка «${l.key}»: ${l.quantity} × ${l.rate}${step ? ` с округлением вверх до ${l.roundUpToRub} ₽` : ''} ≠ ${l.amount}`, l.key));
  }
  if (price.total !== null) {
    const sum = price.lines.reduce((s, l) => s + Math.round((l.amount ?? 0) * 100), 0);
    if (sum !== Math.round(price.total * 100)) out.push(v('PRICE_TOTAL_MISMATCH', `Итог ${price.total} ≠ сумме строк ${sum / 100}`));
  }
  return result('INV-P01', out);
};

/** Quantities a price line may count, derived from the graph only. */
export function graphQuantities(g: Graph): Record<NonNullable<PriceLine['basis']>, number> {
  const manufactured = g.parts.filter((p) => p.supply === 'MANUFACTURED'),
    fasteners = jointFasteners(g.joints);
  return {
    hingeCount: hinges(g).reduce((s, m) => s + m.quantity, 0),
    drillHoles: holesOf(g).filter((h) => h.layer === 'DRILL').length,
    // A polygonal part: the segments of its contour, not the sides of its envelope (FINDINGS 816).
    edgeMetres: manufactured.reduce((s, p) => s + partEdgeMetres(p), 0),
    boardAreaM2: manufactured.reduce((s, p) => s + (p.dimensionChain.sawnBlank ? (p.dimensionChain.sawnBlank.lengthMm * p.dimensionChain.sawnBlank.widthMm) / 1e6 : 0), 0),
    jointStations: g.joints.reduce((s, j) => s + j.stationsMm.length, 0),
    // The fasteners the maker buys for the places of fixing (MOD-DEC-507, FINDINGS 810).
    confirmats: fasteners.confirmats,
    dowels: Object.values(fasteners.dowels).reduce((s, n) => s + n, 0),
  };
}

export const P02: Check = (g, ctx) => {
  const none = priceOf(g, ctx, 'INV-P02');
  if (none) return none;
  const q = graphQuantities(g),
    out: Violation[] = [],
    lines = ctx.projections!.price!.lines.filter((l) => l.basis);
  if (!lines.length) return unknown('INV-P02', 'у строк цены не указано, что они считают');
  for (const l of lines) {
    const want = q[l.basis!];
    if (Math.abs(l.quantity - want) > 1e-6) out.push(v('PRICE_QTY_NOT_FROM_GRAPH', `Строка «${l.key}»: количество ${l.quantity}, в графе ${Math.round(want * 1e6) / 1e6}`, l.key));
  }
  return result('INV-P02', out);
};

export const P03: Check = (g, ctx) => {
  const none = priceOf(g, ctx, 'INV-P03');
  if (none) return none;
  const price = ctx.projections!.price!,
    out: Violation[] = [],
    keys = new Set(price.lines.map((l) => l.key));
  for (const k of price.requiredKeys ?? []) if (!keys.has(k)) out.push(v('PRICE_LINE_DROPPED', `Строка «${k}» выпала из сметы`, k));
  for (const l of price.lines)
    if (l.rate === null && l.amount !== null) out.push(v('UNKNOWN_PRICE_AS_NUMBER', `Строка «${l.key}» без ставки получила сумму ${l.amount}`, l.key));
  if (price.lines.some((l) => l.rate === null) && (!price.partial || price.total !== null)) out.push(v('PARTIAL_NOT_MARKED', 'В смете есть строки без цены, а итог не помечен частичным'));
  return result('INV-P03', out);
};

const known = (p: PriceProjection) => p.lines.reduce((s, l) => s + (l.amount ?? 0), 0);

export const P04: Check = (_g, ctx) => {
  const pairs = ctx.evidence?.growth;
  if (!pairs?.length) return unknown('INV-P04', 'нет пар «меньше — больше»');
  const out = pairs
    .filter((p) => known(p.larger) + 1e-9 < known(p.smaller))
    .map((p) => v('PRICE_DECREASES', `«${p.label}»: известная часть цены уменьшилась с ${known(p.smaller)} до ${known(p.larger)} при росте изделия`));
  return result('INV-P04', out);
};

// ---------------------------------------------------------------- V. validation, statuses, refusals

const cyrillic = /[А-Яа-яЁё]/;

export const V01: Check = (_g, ctx) => {
  const edits = ctx.evidence?.rejectedEdits;
  if (!edits?.length) return unknown('INV-V01', 'нет отвергнутых правок');
  const out: Violation[] = [];
  for (const e of edits) {
    if (e.threw) out.push(v('EXCEPTION', `«${e.label}»: системное исключение вместо отказа`));
    if (canonicalJson(e.before) !== canonicalJson(e.after)) out.push(v('REJECT_MUTATED', `«${e.label}»: отвергнутая правка изменила проект`));
    if (!cyrillic.test(e.message)) out.push(v('REJECT_NO_REASON', `«${e.label}»: нет понятной причины на русском`));
  }
  return result('INV-V01', out);
};

export const V02: Check = (g, ctx) => {
  const out: Violation[] = [],
    errors = g.unresolved.filter((u) => u.level === 'ERROR');
  if (errors.length && g.result.furnitureValidity !== 'INVALID') out.push(v('ACCEPTED_STATE_HAS_ERROR', `Есть ошибки (${errors.map((e) => e.code).join(', ')}), а изделие помечено ${g.result.furnitureValidity}`));
  if (ctx.evidence?.defaultOrFixture && g.result.furnitureValidity === 'INVALID') out.push(v('FIXTURE_REJECTED', 'Новый проект или встроенный пример не проходит собственную проверку'));
  return result('INV-V02', out);
};

export const V03: Check = (g) => {
  const out: Violation[] = [],
    seen = new Set<string>();
  for (const u of g.unresolved) {
    if (!u.text || !cyrillic.test(u.text) || u.text.trim() === u.code) out.push(v('MESSAGE_IS_CODE', `Нерешённое ${u.code} показано кодом, а не текстом`, u.code));
    const key = u.code + '|' + [...u.partIds, ...u.jointIds, ...u.operationIds, ...u.mechanismIds].sort().join(',');
    if (seen.has(key)) out.push(v('MESSAGE_DUPLICATE', `Нерешённое ${u.code} показано дважды`, u.code));
    seen.add(key);
  }
  return result('INV-V03', out);
};

export const V04: Check = (g, ctx) => {
  const out: Violation[] = [],
    want = aggregateResult(g.unresolved, g.result.capabilityResolution, g.result.installationRequirements, ctx.evidence?.adapterAvailable ?? false);
  if (g.result.furnitureValidity !== want.furnitureValidity) out.push(v('STATUS_AGGREGATION', `Годность ${g.result.furnitureValidity}, по нерешённому — ${want.furnitureValidity}`));
  if (g.result.productionReadiness.status !== want.productionReadiness.status) out.push(v('STATUS_AGGREGATION', `Готовность ${g.result.productionReadiness.status}, по §24.2 — ${want.productionReadiness.status}`));
  if (g.result.productionReadiness.status !== 'READY' && g.result.exportQualification !== 'NOT_FOR_PRODUCTION') out.push(v('EXPORT_NOT_MARKED', 'Готовность не READY, а выгрузки не помечены «не для производства»'));
  for (const s of ctx.projections?.stamps ?? [])
    if (s.qualification && s.qualification !== g.result.exportQualification) out.push(v('EXPORT_NOT_MARKED', `Выгрузка «${s.output}» помечена ${s.qualification}, граф — ${g.result.exportQualification}`, s.output));
  return result('INV-V04', out);
};

export const V05: Check = (_g, ctx) => {
  const cases = ctx.evidence?.invalidInputs;
  if (!cases?.length) return unknown('INV-V05', 'нет недопустимых входов');
  const hasBad = (x: unknown): boolean =>
    typeof x === 'number' ? !Number.isFinite(x) : Array.isArray(x) ? x.some(hasBad) : x && typeof x === 'object' ? Object.values(x).some(hasBad) : false;
  const out: Violation[] = [];
  for (const c of cases) {
    if (!c.refused) out.push(v('INVALID_ACCEPTED', `«${c.label}»: недопустимый вход принят`));
    else if (!cyrillic.test(c.message)) out.push(v('REJECT_NO_REASON', `«${c.label}»: отказ без понятной причины`));
    if (c.output !== undefined && hasBad(c.output)) out.push(v('NAN_OUTPUT', `«${c.label}»: выход с NaN или бесконечностью`));
  }
  return result('INV-V05', out);
};

export const V06: Check = (_g, ctx) => {
  const runs = ctx.evidence?.performance;
  if (!runs?.length) return unknown('INV-V06', 'нет замеров');
  const p95 = performance.constants.previewP95.value,
    out: Violation[] = [];
  for (const r of runs) {
    const b = budgetMs(r.parts);
    if (r.tMs > b.t) out.push(v('PERF_T', `«${r.label}»: пересчёт ${r.tMs} мс больше бюджета ${b.t} мс (N = ${r.parts})`));
    if (r.bMs > b.b) out.push(v('PERF_B', `«${r.label}»: блокировка ${r.bMs} мс больше бюджета ${b.b} мс (N = ${r.parts})`));
    if (r.previewP95Ms > p95) out.push(v('PERF_PREVIEW', `«${r.label}»: предпросмотр p95 ${r.previewP95Ms} мс больше ${p95} мс`));
  }
  return result('INV-V06', out);
};

