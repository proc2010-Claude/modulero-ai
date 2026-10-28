// Depth model and the sawn blank of a part: file 48 of the prototype r1 (r1.html:6321–6487), task W1
// (MIGRATION_PLAN 3.3). Overall depth = side + back panel + front gap + front; the input basis is OVERALL, SIDE or
// CORPUS. The blank is the finished part minus the nominal thickness of the band on each physical edge.
//
// Collapsed: deBack has one layer (optional parts, r1.html:57757: no back panel → 0), deFronts two (optional parts,
// r1.html:57761: only sections whose fronts are not all excluded; sliding wardrobe, r1.html:59565: no swing fronts).
// What the prototype read from its global state is the parameter `d`; the nominal grid it asked for
// (currentNominalGrid, task W2) is the parameter `grid`, read only when a part is excluded.
// Proof: reference/wardrobe-core/w1, packages/core/test/wardrobe.policyW1.test.ts, tests/oracle/wardrobe-policy-w1.test.mjs.
import { EDGE_INTENTS, edgeGeometryForPart } from '../../wardrobe/edges.js';
import { WardrobeStandardPreset, r1 } from '../../wardrobe/standard.js';
import { domainPointForPhysicalEdge } from './edge-model.js';
import { facadeThickness } from './facade-materials.js';
import { dpNoBack, dpOwner, dpRecordKey, dpRecords } from './optional-parts.js';
import type { GridModules, PolicyState, Rec } from './project-state.js';
import { constant, decision, prototype, type PolicyModule } from './types.js';

/** Version of the depth rule (r1.html:6321). */
export const DE_VERSION = 'DEPTH-EDGE-1';
/** Id of the finished part → sawn blank transform (r1.html:6322). */
export const DE_BLANK = 'FINISHED-TO-SAWN-1';

export const depth = {
  id: 'depth',
  version: '1',
  constants: {
    version: constant(DE_VERSION, 'id', prototype('r1.html:6321 DE_VERSION', 'FINDINGS 82'), 'Версия правила глубины, пишется в модель'),
    blankTransform: constant(DE_BLANK, 'id', prototype('r1.html:6322 DE_BLANK', 'FINDINGS 82'), 'Переход «готовая деталь → пильная заготовка»'),
    frontGap: constant(2, 'mm', decision('MOD-DEC-162'), 'Зазор фасад — корпус по глубине: умолчание deDepth'),
    frontGapWithoutProfile: constant(4, 'mm', prototype('r1.html:6386 deDimensions', 'FINDINGS 82'), 'Зазор, если в профиле глубины нет frontGapMm; решения нет'),
    roundScale: constant(1e9, 'ratio', prototype('r1.html:6324 deRound', 'FINDINGS 82'), 'Округление глубин до 1e-9 мм против шума сложения'),
  },
} as const satisfies PolicyModule;

/** Rounds to 1e-9 mm (r1.html:6323). */
export function deRound(n: number): number {
  return Math.round(n * depth.constants.roundScale.value) / depth.constants.roundScale.value;
}

export interface DepthInput {
  value?: unknown;
  basis?: unknown;
  back?: unknown;
  fronts?: unknown[];
  gap?: unknown;
}

/** Side, corpus and overall depth from one of them (r1.html:6326). */
export function deDepth({ value, basis = 'OVERALL', back = 0, fronts = [], gap = depth.constants.frontGap.value }: DepthInput): Rec {
  if (
    !['OVERALL', 'SIDE', 'CORPUS'].includes(basis as string) ||
    ![value, back, gap, ...fronts].every(Number.isFinite) ||
    (value as number) <= 0 ||
    (back as number) < 0 ||
    (gap as number) < 0 ||
    fronts.some((t) => (t as number) <= 0)
  )
    return {
      status: 'UNKNOWN',
      reason: 'Не определены исходная база или параметры глубины',
      version: DE_VERSION,
    };
  const v = value as number,
    b = back as number,
    g = gap as number,
    f = fronts as number[],
    front = f.length ? g + Math.max(...f) : 0,
    side = deRound(v - (basis === 'OVERALL' ? b + front : basis === 'CORPUS' ? b : 0));
  if (side <= 0)
    return {
      status: 'INVALID',
      reason: 'Фасады и задник не оставляют положительной глубины боковины',
      version: DE_VERSION,
    };
  return {
    status: 'NOMINAL',
    sourceBasis: basis,
    dimensionBasis: 'FINISHED_PART',
    version: DE_VERSION,
    Dside: side,
    Dcorpus: deRound(side + b),
    Doverall: deRound(side + b + front),
    Pback: b,
    Gfront: f.length ? g : 0,
    Tfront: f.length ? Math.max(...f) : 0,
  };
}

/**
 * Front thickness of a section: its own, the depth profile's or the board thickness `t` (r1.html:6358) — the
 * thickness of the execution of the material of the facades when one is chosen (MOD-DEC-573).
 */
export function deFrontThickness(s: Rec | null | undefined, d: PolicyState, t: unknown): number {
  return Number(s?.frontThicknessMm ?? d.depthProfile?.frontThicknessMm ?? facadeThickness(d, t as number));
}

/**
 * The section has doors in front of the carcass: one, two or rows, not inset — an inset door stands in the opening
 * and adds no depth (MOD-DEC-317, 362; FINDINGS 403). A lift front (MOD-DEC-320) is always in front of the carcass.
 */
export const deDoorsInFront = (s: Rec): boolean => s.facade === 'lift' || (['one', 'two', 'rows'].includes(s.facade) && s.facadeMounting !== 'INSET');

/**
 * Thicknesses of the fronts in front of the carcass (deFronts r1.html:6361 with its layers r1.html:57761, 59565):
 * none for a sliding wardrobe; with excluded parts, only sections that keep a front; otherwise every section with
 * doors in front of the carcass (deDoorsInFront), and, outside LEGACY, with external drawers.
 */
export function deFronts(d: PolicyState, t: unknown, grid?: GridModules): number[] {
  if (d.slidingWardrobe?.active === true) return [];
  if (!dpRecords(d).length) return (d.sections || []).filter((s) => deDoorsInFront(s) || (d.depthProfile?.status !== 'LEGACY' && s.drawersEnabled && s.drawerMode === 'external')).map((s) => deFrontThickness(s, d, t));
  return (d.sections || [])
    .filter((s, i) => {
      const mod = grid!.modules.find((m) => m.sectionIndexes.includes(i));
      if (!mod) return false;
      const sid = mod.id + '-S' + String(mod.sectionIndexes.indexOf(i) + 1).padStart(2, '0'),
        owner = dpOwner(mod, d),
        ids: string[] = [];
      if (s.facade === 'lift') ids.push(sid + '-LIFT-A', ...(s.liftKind === 'FOLDING' ? [sid + '-LIFT-B'] : []));
      else if (s.facadeMounting !== 'INSET') {
        if (s.facadeRows?.length) for (const row of s.facadeRows) for (let k = 0; k < (row.leaves ?? 1); k++) ids.push(sid + '-' + row.id + '-' + (k ? 'B' : 'A'));
        else if (s.facade === 'one') ids.push(sid + '-DOOR-A');
        else if (s.facade === 'two') ids.push(sid + '-DOOR-A', sid + '-DOOR-B');
      }
      if (s.drawersEnabled && s.drawerMode === 'external' && d.depthProfile?.status !== 'LEGACY') for (let k = 0; k < s.drawerCount; k++) ids.push(sid + '-DRAWER' + String(k + 1).padStart(2, '0'));
      return ids.some((id) => !d.optionalParts?.excluded?.[dpRecordKey(owner, id.replace(mod.id + '-', ''))]);
    })
    .map((s) => deFrontThickness(s, d, t));
}

/** Depth the back panel adds (deBack r1.html:6364 with its layer r1.html:57757): 0 in a rebate, without it or when excluded; null for an unknown mode. */
export function deBack(d: PolicyState, grid?: GridModules): number | null {
  if (dpNoBack(d, grid)) return 0;
  const p = d.backProfile;
  if (p?.mode === 'quarter' || p?.mode === 'none') return 0;
  if (p?.mode === 'overlay' || !p) return Number(p?.materialThicknessMm ?? WardrobeStandardPreset.backPanelThickness);
  return null;
}

/** Depth dimensions of the project (r1.html:6370): from the depth profile, or the side depth `side` and board thickness `t`. */
export function deDimensions(d: PolicyState, side: unknown, t: unknown, grid?: GridModules): Rec {
  const p = d.depthProfile;
  if (p?.status === 'UNKNOWN')
    return {
      ...(p.viewSnapshot?.model?.dimensions || {}),
      status: 'UNKNOWN',
      version: p.version,
      reason: p.reason,
      Dside: p.viewSnapshot?.model?.D ?? null,
      Doverall: null,
      Dcorpus: null,
    };
  return deDepth({
    value: p?.inputBasis === 'OVERALL' ? p.overallMm : side,
    basis: p?.inputBasis === 'OVERALL' ? 'OVERALL' : p?.inputBasis === 'CORPUS' ? 'CORPUS' : 'SIDE',
    back: deBack(d, grid),
    fronts: deFronts(d, t, grid),
    gap: p?.frontGapMm ?? depth.constants.frontGapWithoutProfile.value,
  });
}

export interface Bands {
  Lminus: unknown;
  Lplus: unknown;
  Wminus: unknown;
  Wplus: unknown;
}

/** Sawn blank = finished part minus the bands on both ends of L and of W (r1.html:6389). */
export function deBlankDimensions(f: Rec, bands: Rec): Rec {
  const meta = {
    sourceBasis: 'FINISHED_PART',
    dimensionBasis: 'SAWN_BLANK',
    transformId: DE_BLANK,
    transformVersion: 1,
  };
  if (!['L', 'W', 'T'].every((k) => Number.isFinite(f[k]) && f[k] > 0))
    return {
      ...meta,
      status: 'INVALID',
      reason: 'Неположительный или неизвестный готовый размер',
    };
  if (!['Lminus', 'Lplus', 'Wminus', 'Wplus'].every((k) => Number.isFinite(bands[k]) && bands[k] >= 0))
    return {
      ...meta,
      status: 'UNKNOWN',
      reason: 'Неизвестна номинальная толщина кромки физического торца',
    };
  const result = {
    L: deRound(f.L - bands.Lminus - bands.Lplus),
    W: deRound(f.W - bands.Wminus - bands.Wplus),
    T: f.T,
  };
  return result.L > 0 && result.W > 0
    ? {
        ...meta,
        status: 'NOMINAL',
        ...result,
        bands,
      }
    : {
        ...meta,
        status: 'INVALID',
        reason: 'Кромки дают неположительную заготовку',
        bands,
      };
}

/**
 * Sawn blank of a part from its effective edge intents (r1.html:6423); a facade is purchased, not cut — unless it is
 * made in the order from the corpus board (supplyMode MANUFACTURE, task W4, FINDINGS 266).
 */
export function deBlank(p: Rec): Rec {
  const meta = {
    partId: p.id,
    projectionId: p.id + ':SAWN_BLANK:' + DE_BLANK,
  };
  if (['facade', 'drawerFacadeStructural'].includes(p.kind) && p.supplyMode !== 'MANUFACTURE')
    return {
      ...meta,
      status: 'PURCHASED',
      reason: 'Готовая покупная деталь; не плита для раскроя',
    };
  if (p.dimensionBasis !== 'FINISHED_PART')
    return {
      ...meta,
      sourceBasis: p.dimensionBasis ?? 'UNKNOWN',
      dimensionBasis: 'SAWN_BLANK',
      transformId: DE_BLANK,
      transformVersion: 1,
      status: 'UNKNOWN',
      reason: 'Не установлена база исходной детали',
    };
  const bands: Rec = {
      Lminus: 0,
      Lplus: 0,
      Wminus: 0,
      Wplus: 0,
    },
    provenance: Rec[] = [];
  for (const edge of Object.keys(edgeGeometryForPart(p))) {
    const q = domainPointForPhysicalEdge(p, edge, 0),
      r = domainPointForPhysicalEdge(p, edge, 1),
      axis = q.x === r.x ? 'L' : 'W',
      key = axis + ((axis === 'L' ? q.x : q.y) === 0 ? 'minus' : 'plus'),
      intent = p.effectiveEdgeIntents?.[edge],
      known = Object.prototype.hasOwnProperty.call(EDGE_INTENTS, intent),
      thickness = known ? EDGE_INTENTS[intent]!.thicknessMm : null;
    bands[key] = thickness;
    provenance.push({
      physicalEdge: edge,
      axis: key,
      intent,
      nominalThicknessMm: thickness,
      source: 'EXPLICIT_EDGE_INTENT_NOT_SERVICE_MEAN',
    });
  }
  return {
    ...meta,
    ...deBlankDimensions(p, bands),
    provenance,
  };
}

/** Refusal of a depth change, or null (r1.html:6472): an invalid depth, a non-positive part, a runner that would change. */
export function deValidateDepthChange(before: Rec, after: Rec, { allowSlideReselection = false }: Rec = {}): string | null {
  if (after.dimensions?.status === 'INVALID') return after.dimensions.reason;
  if (after.parts.some((p: Rec) => !Number.isFinite(p.L) || !Number.isFinite(p.W) || p.L <= 0 || p.W <= 0)) return 'Глубина создаёт неположительную деталь';
  if (Math.abs(before.D - after.D) < 1e-8) return null;
  for (let i = 0; i < before.sectionsData.length; i++) {
    const a = before.sectionsData[i],
      b = after.sectionsData[i];
    if (!allowSlideReselection && a.drawers.length && b?.drawers.length && a.drawerSystem.slideLen !== b.drawerSystem.slideLen) return `Секция ${i + 1}: направляющая ${a.drawerSystem.model} не сохраняется при этой глубине. Автоматическая замена запрещена.`;
  }
  return null;
}

/** Overall depth for the documents (r1.html:6485). */
export function deOverallText(m: Rec): unknown {
  return m.dimensions?.status === 'UNKNOWN' || !Number.isFinite(m.dimensions?.Doverall) ? 'UNKNOWN (габарит не определён)' : r1(m.dimensions.Doverall);
}
