// Edits of a wardrobe input for the editor on the graph (preview of W3, W4, W6: carcass, doors, shelves, rods; the
// sliding wardrobe of W9 — task U3). Each edit takes a WardrobeInput and returns a new one; the graph is built by
// engine/generators/wardrobe.ts.
// The start project and the decor choices are inputs the prototype itself wrote (reference/wardrobe-input): the
// editor changes only the controls and the state keys the prototype's own controls change, so every number of the
// carcass and the doors still comes from the policy and the prototype's model.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { StorageKind } from '../catalog/hardware/fittings.js';
import { bodyNominalGrid, carcass, ckBodyWidthExact, ckDistribute, ckMezzanine, ckNewBody, ckSync, newSection, type Body, type ConstructionState } from '../engine/policy/carcass.js';
import {
  canFitSectionCount,
  exactAdd,
  exactDivideInteger,
  exactSub,
  exactSum,
  exactToNumber,
  MIN_SECTION_NOMINAL_WIDTH,
  parseExactMm,
  rescaleExactWidths,
  type ExactMm,
} from '../engine/policy/front-grid.js';
import { legsBaseHeight, openLegs } from '../engine/policy/fittings-selection.js';
import { wardrobeFill } from '../engine/policy/wardrobe-fill.js';
import { backPanelFor } from '../catalog/back-panels.js';
import { mfDecor, mfLabel } from '../engine/policy/materials.js';
import type { Rec } from '../engine/policy/project-state.js';
import * as fill from './fill-edit.js';
import { projectRodSeries, projectSectionIds, setDrawerRunner } from './fittings-edit.js';
import { shelfTypeAt } from './fill.js';
import start from './start.data.json' with { type: 'json' };
import startSliding from './start-sliding.data.json' with { type: 'json' };
import { canonicalSectionId, carcassModel } from './carcass.js';
import { ensureLeafIds, finishSeries, finishesOf, glassOf, profileFinishOf } from './sliding-doors.js';
import { facadeChoiceOf, facadeColorDecors, facadeDecorChoices, facadeMaterial, keepFacadeSeams, setFacadeChoice, setFacadeMaterial } from './facade-edit.js';
import { facadeMaterialOf } from '../catalog/hardware/facades.js';
import { slidingDoors, slidingSystem } from '../engine/policy/sliding-doors.js';
import { fmt } from './facades.js';
import { cuttingParamsProblem, normalizeWardrobeInput, type JsonValue, type WardrobeInput, type WardrobeSection } from './input.js';

export * from './edge-edit.js';
export * from './facade-edit.js';
export * from './fill-conflicts.js';

/** Copy of reference/wardrobe-input/wardrobe/doors_one_each.json (sha256 3098a1f2…): 1500 × 2200 × 600, three sections, one door each. */
export const START_INPUT_SOURCE = 'reference/wardrobe-input/wardrobe/doors_one_each.json';

/** Copy of reference/wardrobe-input/sliding/eco_2.json (sha256 ffd20fbe…): the sliding wardrobe of the prototype, 1500 × 2200 × 600, two leaves of ЭКО. */
export const START_SLIDING_SOURCE = 'reference/wardrobe-input/sliding/eco_2.json';

/**
 * Limits of the visible fields (WardrobeControls of the prototype: width 544…3000, height 800…2800, depth 250…800).
 * The smallest width and the largest height are MOD-DEC-565: 160 mm and 3200 mm (FINDINGS 1165).
 */
export const EDITOR_LIMITS = {
  width: { min: 160, max: 3000 },
  height: { min: 800, max: 3200 },
  depth: { min: 250, max: 800 },
  sections: { min: 1, max: 6 },
  baseHeight: { min: 40, max: 250 },
} as const;

/** 'lift' — a front opening upwards on a lift (task LIFT, MOD-DEC-320), the mezzanine's as a rule. */
export type FacadeChoice = 'none' | 'one' | 'two' | 'lift';
/** Kind of a lift front: складной (two leaves, DTC TOP STAY ST) or откидной (one leaf, SQ). */
export type LiftKindChoice = 'FOLDING' | 'FLAP';
/** Mounting of the doors (MOD-DEC-221: «Накладные» / «Вкладные»); MIXED — the sections differ (an opened project). */
export type FacadeMountingChoice = 'OVERLAY' | 'INSET';
export type BaseChoice = 'plinth' | 'fixedLegs' | 'legsPlinth' | 'none';
export type HingeSide = 'left' | 'right';

/** A carcass decor of «Материал корпуса»: the control value the prototype writes and the group of the list. */
export interface DecorChoice {
  id: string;
  title: string;
  /** The brand the list groups by: EGGER, Увадрев, Lamarty. */
  group: string;
  material: string;
}

/** The prototype's own options of «Материал корпуса» an EGGER decor of the catalogue takes over (r1.html:3548, 58289). */
const LEGACY_MATERIAL: Readonly<Record<string, string>> = { W980: '1715', U708: '1703', U702: '1785' };

/**
 * Carcass decors the prototype offers in «Материал корпуса» (r1.html:58289): its default EGGER W960 without a decor
 * record, then every decor of the material catalogue — EGGER, Uvadrev and Lamarty (56). An EGGER decor with an
 * option of its own keeps the option's value, the others are «MF:<decorId>», as the prototype writes them.
 */
export function decorChoices(hw: HardwareCatalogs): DecorChoice[] {
  return [
    // The prototype's default option «1610» (EGGER W960): no decor record of the shared catalogue, the 3D draws the board colour.
    { id: '1610', title: 'EGGER W960 (по умолчанию)', group: 'EGGER', material: '1610' },
    ...hw.materials.decors.map((d) => ({
      id: String(d.decorId),
      title: String(mfLabel(d.decorId, hw.materials)),
      group: d.brand === 'UVADREV' ? 'Увадрев' : d.brand === 'EGGER' ? 'EGGER' : 'Lamarty',
      material: (d.brand === 'EGGER' && LEGACY_MATERIAL[d.baseCode as string]) || `MF:${d.decorId}`,
    })),
  ];
}

/** The carcass decor of the project among `decorChoices`: by the option of «Материал корпуса», else the default W960. */
export function carcassDecor(i: WardrobeInput, hw: HardwareCatalogs): string {
  const all = decorChoices(hw);
  return (all.find((d) => d.material === i.controls.material) ?? all[0]!).id;
}

/** The appearance record of the default W960, as the prototype writes it (reference inputs material_*.json). */
const DEFAULT_APPEARANCE: JsonValue = { schema: 'EXPLICIT-APPEARANCE-1', corpus: { chosen: false, origin: 'legacy-unconfirmed' }, facade: { chosen: false, origin: 'legacy-unconfirmed' } };

/**
 * The material selection of a chosen carcass decor (mfSelectDecor r1.html:58320): the board variant of the carcass
 * thickness, or none when the catalogue has no board of that thickness; the Lamarty working variant.
 */
function corpusSelection(decor: Rec, thickness: number): { [key: string]: JsonValue } {
  return {
    version: 'MATERIAL-SELECTION-1',
    corpus: {
      decorId: decor.decorId,
      variantId: (decor.boardVariantsForImplementation as Rec[]).find((v) => v.thicknessMm === thickness)?.variantId ?? null,
      workingVariantId: decor.lamarty?.workingVariantId ?? null,
      sourceVersion: decor.lamarty?.sourceVersion ?? null,
      textureCode: decor.lamarty?.textureCode ?? null,
    },
  };
}

/** The appearance of a chosen carcass decor with its matched back panel (raChooseAppearance, ra05CommitCorpus r1.html:64981). */
function corpusAppearance(decorId: string): JsonValue {
  return {
    schema: 'EXPLICIT-APPEARANCE-1',
    corpus: { chosen: true, origin: 'explicit-decor-choice' },
    facade: { chosen: false, origin: 'legacy-unconfirmed' },
    backPanel: backPanelFor(decorId) as unknown as JsonValue,
  };
}

/** Default height of a new mezzanine (MOD-DEC-200). */
export const MEZZANINE_HEIGHT = carcass.constants.mezzanineHeight.value;

const clone = (i: WardrobeInput): WardrobeInput => JSON.parse(JSON.stringify(i)) as WardrobeInput;

/**
 * The start project of the editor: three sections, one door each — the reference input with the runner of the level
 * of the hardware, as every new project has it (MOD-DEC-514, FINDINGS 1862).
 */
export function newWardrobeInput(): WardrobeInput {
  return setDrawerRunner(normalizeWardrobeInput(JSON.parse(JSON.stringify(start))), 'level');
}

/** The start project of the sliding wardrobe (task U3): the prototype's sliding wardrobe with two leaves of ЭКО, the runner of the level (514). */
export function newSlidingInput(): WardrobeInput {
  return setDrawerRunner(normalizeWardrobeInput(JSON.parse(JSON.stringify(startSliding))), 'level');
}

export interface WardrobeSummary {
  width: number;
  height: number;
  depth: number;
  sections: { facade: FacadeChoice | 'rows'; hingeSide: HingeSide; mezzanine: boolean; liftKind: LiftKindChoice; liftHandleMassKg: number | null }[];
  /** Height of the mezzanine (MOD-DEC-200) over every body; null — no mezzanine. */
  mezzanineHeight: number | null;
  facadeMounting: FacadeMountingChoice | 'MIXED';
  base: BaseChoice;
  baseHeight: number;
  top: boolean;
  back: boolean;
}

const firstBody = (i: WardrobeInput) => i.state.bodies.find((b) => !b.parent) ?? i.state.bodies[0]!;
/** Ids of the upper bodies (mezzanines, MOD-DEC-200). */
const upperIds = (i: WardrobeInput) => new Set(i.state.bodies.filter((b) => b.parent).map((b) => b.id));
/** The sections of the bodies on the floor, left to right; the sections of the mezzanines follow them in the state. */
const rootSections = (i: WardrobeInput) => {
  const up = upperIds(i);
  return i.state.sections.filter((s) => !up.has(s.bodyId as string));
};

/** What the editor shows: the values of the controls and of the state the edits below change. */
export function wardrobeSummary(i: WardrobeInput): WardrobeSummary {
  const b = firstBody(i),
    base = (b.base ?? null) as { kind?: string; height?: number } | null,
    depth = i.state.depthProfile?.overallMm;
  return {
    width: Number(i.controls.width),
    height: Number(i.controls.height),
    depth: typeof depth === 'number' ? depth : Number(i.controls.depth),
    sections: i.state.sections.map((s) => ({
      facade: (s.facadeRows ? 'rows' : s.facade) as FacadeChoice | 'rows',
      hingeSide: s.hingeSide === 'right' ? 'right' : 'left',
      mezzanine: upperIds(i).has(s.bodyId as string),
      liftKind: s.liftKind === 'FOLDING' ? 'FOLDING' : 'FLAP',
      liftHandleMassKg: typeof s.liftHandleMassKg === 'number' ? s.liftHandleMassKg : null,
    })),
    mezzanineHeight: (i.state.bodies.find((b) => b.parent)?.height as number | null | undefined) ?? null,
    facadeMounting: i.state.sections.every((s) => s.facadeMounting === 'INSET') ? 'INSET' : i.state.sections.some((s) => s.facadeMounting === 'INSET') ? 'MIXED' : 'OVERLAY',
    // A body without its own base has the default plinth 70 mm of the prototype (FINDINGS 11).
    base: (base?.kind as BaseChoice | undefined) ?? 'plinth',
    baseHeight: typeof base?.height === 'number' ? base.height : Number(i.controls.plinthHeight),
    top: b.panels.top !== false,
    back: b.panels.back !== false,
  };
}

function inRange(what: string, v: number, r: { min: number; max: number }): string | null {
  return Number.isInteger(v) && v >= r.min && v <= r.max ? null : `${what}: допустимо от ${r.min} до ${r.max} мм в целых миллиметрах (поле редактора)`;
}

/** Applies the body settings of the first body (base, roof, back panel) to every body, as the editor has one set; a mezzanine keeps standing on its body without a base (MOD-DEC-200). */
function spreadBodySettings(i: WardrobeInput, from: { base: JsonValue | null; panels: Record<string, boolean> }) {
  for (const b of i.state.bodies) {
    if (!b.parent) b.base = from.base === null ? null : (JSON.parse(JSON.stringify(from.base)) as { [key: string]: JsonValue });
    b.panels = { ...b.panels, top: from.panels.top !== false, back: from.panels.back !== false };
  }
}

/**
 * Lays the sections out again over the width W: equal sections, then the automatic body layout of MOD-DEC-322 (ckSync:
 * bodies cut at the section joints, each up to the 2400 mm guide). The base and panels of the first body go to all.
 * A mezzanine stays: one over every new body, of the same height, its sections kept in order (mezzanines()).
 */
function relayout(i: WardrobeInput) {
  const s = i.state,
    W = Number(i.controls.width),
    first = firstBody(i),
    keep = { base: first.base ?? null, panels: { ...first.panels } as Record<string, boolean> },
    body = ckNewBody(first.id, 0) as Body & { [key: string]: JsonValue },
    mezzanine = takeMezzanines(i);
  s.bodies = [body as unknown as WardrobeInput['state']['bodies'][number]];
  const equal = exactDivideInteger(parseExactMm(String(W)), s.sections.length);
  s.sections.forEach((x, k) => {
    x.bodyId = body.id;
    x.nominalMm = equal;
    x.ratio = 1 / s.sections.length;
    x.physicalId = `${body.id}-S${String(k + 1).padStart(2, '0')}`;
  });
  s.construction = { ...s.construction, intent: 'automatic' };
  s.moduleBreaks = null;
  s.frontGridExactWidthsMm = null;
  ckSync(s as unknown as ConstructionState, W);
  spreadBodySettings(i, keep);
  if (mezzanine) addMezzanines(i, mezzanine.height, mezzanine.sections);
}

/** Takes the mezzanines out of the input: their bodies and sections; the bodies under them get the overall height again. */
function takeMezzanines(i: WardrobeInput): { height: number; sections: WardrobeSection[] } | null {
  const s = i.state,
    up = upperIds(i),
    height = s.bodies.find((b) => b.parent)?.height;
  if (!up.size || typeof height !== 'number') return null;
  const sections = s.sections.filter((x) => up.has(x.bodyId as string));
  s.sections = s.sections.filter((x) => !up.has(x.bodyId as string));
  s.bodies = s.bodies.filter((b) => !b.parent);
  for (const b of s.bodies) b.height = null;
  return { height, sections };
}

/**
 * A mezzanine of `height` over every body on the floor (MOD-DEC-200, ckMezzanine); the k-th body gets the k-th kept
 * section, a body without one a copy of the first (its facade and fill) under a new id (Д, FINDINGS 536). The layout
 * of the bodies on the floor keeps its kind: ckMezzanine makes it manual, but the editor puts the mezzanine over the
 * automatic bodies again on every change (FINDINGS 703). The roof and the back of the mezzanine are those of its body:
 * the editor has one set for all bodies; a kept section brings back the ids of its body and of itself (MOD-AI-65).
 */
function addMezzanines(i: WardrobeInput, height: number, kept: readonly WardrobeSection[]): string | null {
  const s = i.state,
    H = Number(i.controls.height),
    t = Number(i.controls.thickness),
    intent = s.construction.intent;
  for (const [k, b] of s.bodies.filter((x) => !x.parent).entries()) {
    const r = ckMezzanine(s as unknown as ConstructionState, b.id, H, t, height);
    s.construction.intent = intent;
    if (typeof r === 'string') return r;
    const sec = r.section as WardrobeSection,
      from = kept[k] ?? kept[0],
      up = s.bodies.find((x) => x.id === sec.bodyId)!,
      old = kept[k];
    // The editor has one set of panels (spreadBodySettings): a new mezzanine keeps «без крыши» and «без задней стенки» of its body (MOD-AI-65).
    up.panels = { ...up.panels, top: b.panels.top !== false, back: b.panels.back !== false };
    // The mezzanine put back keeps its ids, so do its parts and the references to its section (MOD-AI-65: B2 became B3).
    if (old && typeof old.bodyId === 'string' && !s.bodies.some((x) => x.id === old.bodyId)) {
      up.id = old.bodyId;
      sec.bodyId = old.bodyId;
      if (typeof old.physicalId === 'string' && !s.sections.some((x) => x.physicalId === old.physicalId)) sec.physicalId = old.physicalId;
    }
    if (from) Object.assign(sec, JSON.parse(JSON.stringify(from)), { bodyId: sec.bodyId, physicalId: sec.physicalId, nominalMm: sec.nominalMm, ratio: 1 });
    sec.uiSectionId = kept[k]?.uiSectionId ?? freeSectionId(s.sections.filter((x) => x !== sec));
  }
  return null;
}

/** Limits of the mezzanine height: the prototype's refusal (r1.html:90337) both ways — each body keeps more than two thicknesses. */
export function mezzanineLimits(i: WardrobeInput): { min: number; max: number } {
  const H = Number(i.controls.height),
    t = Number(i.controls.thickness);
  return { min: 2 * t + 1, max: H - 2 * t - 1 };
}

/**
 * The mezzanine of the wardrobe (MOD-DEC-200): a separate upper body over every body, of `height` (default 400 mm)
 * in the overall height, with one section; null removes it with its sections. A new height keeps the sections. The
 * notice says what the body under it keeps (MOD-AI-53), of a sliding wardrobe — that the doors close that body and
 * the mezzanine has fronts of its own (MOD-AI-63, FINDINGS 2950–2951). With the catalogues a mezzanine that leaves
 * the doors of a sliding wardrobe no room is refused with the highest one that does: the doors never fall off unsaid.
 */
export function setMezzanine(i: WardrobeInput, height: number | null = MEZZANINE_HEIGHT, hw?: HardwareCatalogs): EditResult {
  if (height !== null) {
    const r = mezzanineLimits(i);
    if (!(Number.isInteger(height) && height >= r.min && height <= r.max)) return { ok: false, problem: `Высота антресоли: от ${r.min} до ${r.max} мм в целых миллиметрах — нижнему корпусу и антресоли нужно больше двух толщин плиты` };
  }
  const o = clone(i),
    kept = takeMezzanines(o),
    H = Number(i.controls.height);
  if (height === null) return kept ? { ok: true, input: o, notice: `Антресоль убрана: корпус снова во всю высоту ${H} мм.` } : { ok: true, input: o };
  const problem = addMezzanines(o, height, kept?.sections ?? []);
  if (problem) return { ok: false, problem };
  const lost = hw && slidingSummary(i).doors > 0 && !slidingProblem(i, hw) ? slidingProblem(o, hw) : null;
  if (lost) {
    const fits = (h: number) => {
        const x = clone(i);
        takeMezzanines(x);
        return !addMezzanines(x, h, []) && !slidingProblem(x, hw!);
      },
      min = mezzanineLimits(i).min;
    let lo = min - 1,
      hi = height;
    // The highest mezzanine the doors still take: the lower the mezzanine, the higher the doors under it.
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    return { ok: false, problem: `Антресоль ${height} мм: в корпусе под ней (${H - height} мм) двери-купе не встают — ${lost}${lo >= min ? ` Антресоль шкафа-купе с этими дверями — до ${lo} мм.` : ''} Проект не изменён.` };
  }
  const doors = isSlidingInput(o) ? ' Двери-купе закрывают корпус под антресолью, у антресоли свои фасады — на этапе «Двери».' : '';
  return { ok: true, input: o, notice: `Антресоль ${height} мм в общей высоте ${H} мм: корпус под ней — ${H - height} мм.${doors}` };
}

/** Kind of the lift front of a section and the mass of its handle (task LIFT; null — not entered, INV-D18-01 says so). */
export function setLift(i: WardrobeInput, index: number, lift: { kind?: LiftKindChoice; handleMassKg?: number | null }): EditResult {
  const o = clone(i),
    s = o.state.sections[index];
  if (!s) return { ok: false, problem: `Нет секции ${index + 1}` };
  if (lift.handleMassKg !== undefined && lift.handleMassKg !== null && !(Number.isFinite(lift.handleMassKg) && lift.handleMassKg >= 0)) return { ok: false, problem: 'Масса ручки — неотрицательное число, кг' };
  if (lift.kind) s.liftKind = lift.kind;
  if (lift.handleMassKg === null) delete s.liftHandleMassKg;
  else if (lift.handleMassKg !== undefined) s.liftHandleMassKg = lift.handleMassKg;
  return { ok: true, input: o };
}

/** Refusal when n equal sections are narrower than 160 mm each (MOD-DEC-565; the prototype asked a 160 mm clear opening, FINDINGS 1164). */
function fitProblem(W: number, thickness: number, n: number): string | null {
  return canFitSectionCount(W, thickness, n) ? null : `${n} секц. не помещаются в ${W} мм: ширина секции — не меньше ${MIN_SECTION_NOMINAL_WIDTH} мм (MOD-DEC-565)`;
}

/** An accepted edit: the new input and, for an edit of the fill, what the user is told (fill-edit.ts). */
export type EditResult = { ok: true; input: WardrobeInput; notice?: string } | { ok: false; problem: string };

/** Overall size: width and height are the prototype's controls, the depth is the depth model (FINDINGS 8). */
export function setSize(i: WardrobeInput, size: { width?: number; height?: number; depth?: number }): EditResult {
  const L = EDITOR_LIMITS,
    problem =
      (size.width !== undefined && inRange('Ширина', size.width, L.width)) ||
      (size.height !== undefined && inRange('Высота', size.height, L.height)) ||
      (size.depth !== undefined && inRange('Глубина', size.depth, L.depth));
  if (problem) return { ok: false, problem };
  if (size.width !== undefined) {
    const fit = fitProblem(size.width, Number(i.controls.thickness), rootSections(i).length);
    if (fit) return { ok: false, problem: fit };
  }
  const mezzanine = wardrobeSummary(i).mezzanineHeight;
  if (size.height !== undefined && mezzanine !== null && size.height <= mezzanine + 2 * Number(i.controls.thickness)) return { ok: false, problem: `Высота ${size.height} мм: под антресолью ${mezzanine} мм не остаётся корпуса — сначала уменьшите антресоль` };
  const o = clone(i);
  if (size.width !== undefined) o.controls.width = String(size.width);
  if (size.height !== undefined) o.controls.height = String(size.height);
  if (size.height !== undefined && size.width === undefined && mezzanine !== null) addMezzanines(o, mezzanine, takeMezzanines(o)!.sections);
  if (size.depth !== undefined) {
    o.controls.depth = String(size.depth);
    o.state.depthProfile = { ...o.state.depthProfile, overallMm: size.depth };
  }
  if (size.width !== undefined) {
    resize(o, size.width);
    rebindUprights(i, o);
    const problem = layoutProblem(o);
    if (problem) return { ok: false, problem };
  }
  const notice = size.height !== undefined ? ceilingNotice(o) : null;
  return notice ? { ok: true, input: o, notice } : { ok: true, input: o };
}

/**
 * A new overall width W (MOD-DEC-322, п. 2): the number of sections stays and they change their widths in
 * proportion. The automatic layout cuts the bodies again at the joints of the sections (ckSync); a manual one
 * (joints or body widths set by hand) keeps its bodies, their widths and the widths of their sections scaled to W
 * ((Д): the prototype made the sections of each body equal, FINDINGS 700). The settings of the first body go to all;
 * the mezzanine stays over every body.
 */
function resize(i: WardrobeInput, W: number) {
  const s = i.state,
    first = firstBody(i),
    keep = { base: first.base ?? null, panels: { ...first.panels } as Record<string, boolean> },
    mezzanine = takeMezzanines(i);
  if (s.construction.intent === 'automatic') ckSync(s as unknown as ConstructionState, W);
  else {
    const roots = s.bodies.filter((b) => !b.parent),
      exact = rescaleExactWidths(parseExactMm(String(W)), roots.map((b) => ckBodyWidthExact(b)));
    roots.forEach((b, k) => setBodyExact(b, exact[k]!));
    for (const b of roots) scaleSections(i, b);
  }
  spreadBodySettings(i, keep);
  if (mezzanine) addMezzanines(i, mezzanine.height, mezzanine.sections);
}

/** The first editor section id no section has yet (the 3D and the part list select a door by it). */
function freeSectionId(sections: readonly WardrobeSection[]): string {
  const used = new Set(sections.map((x) => x.uiSectionId));
  let k = 1;
  while (used.has(`UI-SECTION-EDITOR-${k}`)) k++;
  return `UI-SECTION-EDITOR-${k}`;
}

/** Number of sections: the kept ones stay as they are, new ones are empty with the facade of the last one. */
export function setSectionCount(i: WardrobeInput, n: number): EditResult {
  const r = EDITOR_LIMITS.sections;
  if (!Number.isInteger(n) || n < r.min || n > r.max) return { ok: false, problem: `Число секций: от ${r.min} до ${r.max}` };
  const fit = fitProblem(Number(i.controls.width), Number(i.controls.thickness), n);
  if (fit) return { ok: false, problem: fit };
  const o = clone(i),
    s = rootSections(o),
    mezzanine = o.state.sections.filter((x) => !s.includes(x)),
    last = s.at(-1),
    count = s.length;
  while (s.length > n) s.pop();
  while (s.length < n) {
    const x = newSection() as WardrobeSection;
    x.facade = last?.facadeRows ? 'one' : (last?.facade ?? 'one');
    x.hingeSide = last?.hingeSide ?? 'left';
    if (last?.facadeMounting === 'INSET') x.facadeMounting = 'INSET';
    x.uiSectionId = freeSectionId([...s, ...mezzanine]);
    s.push(x);
  }
  o.state.sections = [...s, ...mezzanine];
  // The same number of sections changes nothing (the reader of a БАЗИС file sets it so, FINDINGS 3012).
  const middle = n !== count && hingesFromMiddle(rootSections(i), s);
  relayout(o);
  rebindUprights(i, o);
  followSectionIds(i, o, keptSections(i, o, (r) => (r < n ? r : null), (j) => (j === 0 ? 0 : null)));
  return middle ? { ok: true, input: o, notice: 'Одиночные двери открываются от середины шкафа: петли левых — слева, правых — справа.' } : { ok: true, input: o };
}

/** Hinge sides «от середины» for `n` sections: the left half on the left, the right half on the right, the middle one of an odd count on the left. */
const middleSides = (n: number): HingeSide[] => Array.from({ length: n }, (_, k) => (k <= (n - 1) / 2 ? 'left' : 'right'));

/**
 * MOD-AI-78 (Д): single doors of neighbouring sections open from the middle of the wardrobe, as the two doors of one
 * section. While the user has not set the hinges by hand — every single door hinged on the left, as in the start
 * project of the prototype, or from the middle already — a new number of sections puts them from the middle again;
 * hinges set by hand stay. Changes `after` in place; true when a side changed.
 */
function hingesFromMiddle(before: readonly WardrobeSection[], after: WardrobeSection[]): boolean {
  const single = (x: WardrobeSection) => x.facade === 'one' && !(x.facadeRows as JsonValue[] | undefined)?.length,
    side = (x: WardrobeSection): HingeSide => (x.hingeSide === 'right' ? 'right' : 'left'),
    untouched = (list: readonly WardrobeSection[]) => {
      const m = middleSides(list.length);
      return list.every((x) => !single(x) || side(x) === 'left') || list.every((x, k) => !single(x) || side(x) === m[k]);
    };
  if (!untouched(before)) return false;
  const m = middleSides(after.length);
  let changed = false;
  after.forEach((x, k) => {
    if (!single(x) || side(x) === m[k]) return;
    x.hingeSide = m[k]!;
    changed = true;
  });
  return changed;
}

/**
 * Removes one section (MOD-DEC-199): the other sections of its body share the body equally again (widths set by hand
 * in this body are reset), the other bodies keep theirs. A body left without sections goes; its width goes to the
 * neighbour on the right, of the last body to the left ((Д), as a body width does — FINDINGS 701), whose sections
 * share it equally. The mezzanine stays over every body.
 */
export function removeSection(i: WardrobeInput, index: number): EditResult {
  if (!i.state.sections[index]) return { ok: false, problem: `Нет секции ${index + 1}` };
  if (upperIds(i).has(i.state.sections[index].bodyId as string)) return { ok: false, problem: 'Секция антресоли убирается вместе с антресолью' };
  if (rootSections(i).length <= EDITOR_LIMITS.sections.min) return { ok: false, problem: 'В шкафу остаётся хотя бы одна секция' };
  const o = clone(i),
    s = o.state,
    bodyId = s.sections[index]!.bodyId,
    roots = s.bodies.filter((b) => !b.parent),
    k = roots.findIndex((b) => b.id === bodyId),
    mezzanine = takeMezzanines(o);
  s.sections = s.sections.filter((_, n) => n !== index);
  const bodyGone = !s.sections.some((x) => x.bodyId === bodyId);
  if (!bodyGone) ckDistribute(roots[k]!, s as unknown as ConstructionState);
  else {
    const gone = roots[k]!,
      next = roots[k + 1] ?? roots[k - 1]!;
    setBodyExact(next, exactAdd(ckBodyWidthExact(next), ckBodyWidthExact(gone)));
    s.bodies = s.bodies.filter((b) => b !== gone);
    ckDistribute(next, s as unknown as ConstructionState);
    mezzanine?.sections.splice(k, 1);
  }
  if (mezzanine) addMezzanines(o, mezzanine.height, mezzanine.sections);
  rebindUprights(i, o);
  // R2-030 (FINDINGS 1761): the baskets, trouser racks, pantographs and the light of the section go with it.
  const removed = rootSections(i).indexOf(i.state.sections[index]!);
  followSectionIds(i, o, keptSections(i, o, (r) => (r < removed ? r : r === removed ? null : r - 1), (j) => (!bodyGone || j < k ? j : j === k ? null : j - 1)));
  return { ok: true, input: o };
}

// ---------------------------------------------------------------- widths of sections and bodies, joints, uprights (U1)

type StateBody = WardrobeInput['state']['bodies'][number];

/** The bodies on the floor, left to right. */
const rootBodies = (i: WardrobeInput) => i.state.bodies.filter((b) => !b.parent);

/** The exact width of a body and its width in mm (the prototype keeps both, r1.html:11350). */
function setBodyExact(b: StateBody, w: ExactMm) {
  b.widthExact = w as unknown as StateBody[string];
  b.width = exactToNumber(w);
}

/** The sections of a body take its width in proportion to their widths (ckReflow r1.html:90017); upper bodies take the width of their parent. */
function scaleSections(i: WardrobeInput, b: StateBody) {
  const ss = i.state.sections.filter((x) => x.bodyId === b.id);
  if (!ss.length) return;
  const widths = rescaleExactWidths(
    ckBodyWidthExact(b),
    ss.map((x) => x.nominalMm ?? parseExactMm('1')),
  );
  ss.forEach((x, k) => (x.nominalMm = widths[k]));
}

/**
 * Why the bodies and sections do not fit (ckValidate r1.html:90034): a section narrower than 160 mm, or one its side
 * panels leave no opening (MOD-DEC-565; the prototype asked a 160 mm clear opening, FINDINGS 1164). The grid is that
 * of the carcass (bodyNominalGrid).
 */
function layoutProblem(i: WardrobeInput): string | null {
  const t = Number(i.controls.thickness),
    grid = bodyNominalGrid(Number(i.controls.width), t, i.state.bodies as unknown as Body[], i.state.sections, () => null),
    k = grid.sections.findIndex((x) => x && (x.nominalWidth < MIN_SECTION_NOMINAL_WIDTH - 0.001 || x.clearOpeningWidth <= 0.001));
  if (k < 0) return null;
  const s = grid.sections[k]!;
  return s.nominalWidth < MIN_SECTION_NOMINAL_WIDTH - 0.001
    ? `Секция ${k + 1}: ширина ${Math.round(s.nominalWidth * 10) / 10} мм — меньше ${MIN_SECTION_NOMINAL_WIDTH} мм (MOD-DEC-565). Проект не изменён.`
    : `Секция ${k + 1}: боковины не оставляют проёма. Проект не изменён.`;
}

/** A width in mm the prototype's field takes: a positive number, exact to 0.001 mm. */
function exactWidth(what: string, v: number): ExactMm | string {
  return Number.isFinite(v) && v > 0 && Math.round(v * 1000) === v * 1000 ? parseExactMm(String(v)) : `${what}: положительное число, мм, не точнее 0,001`;
}

/**
 * Width of one section (ckSectionWidth r1.html:90299, MOD-DEC-199): the neighbour on the right in the same body takes
 * the difference, the last section of a body — the one on its left; the body and the overall width do not change.
 * A section that fills its body is refused: its width is the width of the body (setBodyWidth).
 */
export function setSectionWidth(i: WardrobeInput, index: number, width: number): EditResult {
  const s = i.state.sections[index];
  if (!s) return { ok: false, problem: `Нет секции ${index + 1}` };
  if (upperIds(i).has(s.bodyId as string)) return { ok: false, problem: 'Ширина секции антресоли — ширина корпуса под ней' };
  const target = exactWidth('Ширина секции', width);
  if (typeof target === 'string') return { ok: false, problem: target };
  if (width < MIN_SECTION_NOMINAL_WIDTH) return { ok: false, problem: `Номинальная ширина отдельной секции должна быть не меньше ${MIN_SECTION_NOMINAL_WIDTH} мм. Проект не изменён.` };
  const o = clone(i),
    ss = o.state.sections.filter((x) => x.bodyId === s.bodyId),
    k = ss.indexOf(o.state.sections[index]!),
    j = k < ss.length - 1 ? k + 1 : k - 1;
  if (j < 0) return { ok: false, problem: 'Секция занимает весь корпус: измените ширину корпуса или общую ширину шкафа. Проект не изменён.' };
  const body = o.state.bodies.find((b) => b.id === s.bodyId)!,
    own = ss[k]!.nominalMm ?? exactDivideInteger(ckBodyWidthExact(body), ss.length),
    other = ss[j]!.nominalMm ?? exactDivideInteger(ckBodyWidthExact(body), ss.length);
  ss[j]!.nominalMm = exactSub(other, exactSub(target, own));
  ss[k]!.nominalMm = target;
  if (exactToNumber(ss[j]!.nominalMm!) < MIN_SECTION_NOMINAL_WIDTH) return { ok: false, problem: `Соседней секции остаётся меньше ${MIN_SECTION_NOMINAL_WIDTH} мм. Проект не изменён.` };
  const problem = layoutProblem(o);
  return problem ? { ok: false, problem } : { ok: true, input: o };
}

/**
 * Widths of every section on the floor at once, left to right (MOD-AI-68, FINDINGS 2955): one edit where
 * setSectionWidth would move a neighbour each time — «две секции по 876 мм» is one call. The widths add up to the
 * overall width; each body takes the sum of its sections, the layout becomes manual (MOD-DEC-322, п. 4), as with
 * setBodyWidth, and the mezzanine follows its body.
 */
export function setSectionWidths(i: WardrobeInput, widths: readonly number[]): EditResult {
  const roots = rootSections(i),
    W = Number(i.controls.width);
  if (widths.length !== roots.length) return { ok: false, problem: `Ширин секций ${widths.length}, а секций на полу ${roots.length}: нужна ширина каждой, слева направо. Проект не изменён.` };
  const exact: ExactMm[] = [];
  for (const [k, w] of widths.entries()) {
    const x = exactWidth(`Ширина секции ${k + 1}`, w);
    if (typeof x === 'string') return { ok: false, problem: x };
    if (w < MIN_SECTION_NOMINAL_WIDTH) return { ok: false, problem: `Секция ${k + 1}: ширина ${fmt(w)} мм — меньше ${MIN_SECTION_NOMINAL_WIDTH} мм (MOD-DEC-565). Проект не изменён.` };
    exact.push(x);
  }
  const sum = exact.reduce((a, x) => exactAdd(a, x), parseExactMm('0'));
  if (exactToNumber(sum) !== W) return { ok: false, problem: `Сумма ширин секций ${fmt(exactToNumber(sum))} мм, а ширина шкафа ${W} мм: ширины должны дать ширину шкафа. Проект не изменён.` };
  const o = clone(i),
    sections = rootSections(o);
  sections.forEach((x, k) => (x.nominalMm = exact[k]));
  for (const b of rootBodies(o)) setBodyExact(b, sections.filter((x) => x.bodyId === b.id).reduce((a, x) => exactAdd(a, x.nominalMm!), parseExactMm('0')));
  o.state.construction = { ...o.state.construction, intent: 'manual' };
  for (const b of o.state.bodies.filter((x) => x.parent)) {
    const p = o.state.bodies.find((x) => x.id === b.parent)!;
    setBodyExact(b, ckBodyWidthExact(p));
    scaleSections(o, b);
  }
  const problem = layoutProblem(o);
  return problem ? { ok: false, problem } : { ok: true, input: o };
}

/**
 * Width of one body on the floor (ckBodyWidth r1.html:90179, MOD-DEC-199): the neighbour on the right takes the
 * difference, the last body — the one on its left; the overall width does not change. The sections of both bodies
 * change in proportion, the layout becomes manual (MOD-DEC-322, п. 4), the mezzanine follows its body.
 */
export function setBodyWidth(i: WardrobeInput, index: number, width: number): EditResult {
  const roots = rootBodies(i);
  if (!roots[index]) return { ok: false, problem: `Нет корпуса ${index + 1}` };
  const target = exactWidth('Ширина корпуса', width);
  if (typeof target === 'string') return { ok: false, problem: target };
  if (width < MIN_SECTION_NOMINAL_WIDTH) return { ok: false, problem: `Ширина отдельного корпуса должна быть не меньше ${MIN_SECTION_NOMINAL_WIDTH} мм (MOD-DEC-565). Проект не изменён.` };
  const j = index < roots.length - 1 ? index + 1 : index - 1;
  if (j < 0) return { ok: false, problem: 'Единственный корпус занимает общую ширину. Измените общую ширину шкафа.' };
  const o = clone(i),
    r = rootBodies(o),
    delta = exactSub(target, ckBodyWidthExact(r[index]!));
  setBodyExact(r[j]!, exactSub(ckBodyWidthExact(r[j]!), delta));
  setBodyExact(r[index]!, target);
  if (r[j]!.width < MIN_SECTION_NOMINAL_WIDTH) return { ok: false, problem: `Соседнему корпусу остаётся меньше ${MIN_SECTION_NOMINAL_WIDTH} мм. Проект не изменён.` };
  o.state.construction = { ...o.state.construction, intent: 'manual' };
  for (const b of [r[index]!, r[j]!]) scaleSections(o, b);
  for (const b of o.state.bodies.filter((x) => x.parent)) {
    const p = o.state.bodies.find((x) => x.id === b.parent)!;
    setBodyExact(b, ckBodyWidthExact(p));
    scaleSections(o, b);
  }
  const problem = layoutProblem(o);
  return problem ? { ok: false, problem } : { ok: true, input: o };
}

/** The joints of the sections on the floor where a new body starts: indexes of the first sections of the bodies after the first. */
export function bodyJoints(i: WardrobeInput): number[] {
  const roots = rootSections(i);
  return rootBodies(i)
    .slice(1)
    .map((b) => roots.findIndex((x) => x.bodyId === b.id))
    .filter((k) => k > 0);
}

/**
 * The joint between the sections `joint − 1` and `joint` (MOD-DEC-322, п. 4: the user moves the joint of the bodies;
 * the manual layout is kept, 200): a joint of two bodies is removed — they become one body of their width; a joint
 * inside a body cuts it there into two bodies with the widths of their sections. The sections keep their widths, the
 * settings of the body go to the new one, the mezzanine stays over every body. A body wider than 2400 mm is
 * said in the bell (MOD-DEC-322, 049), not refused.
 */
export function toggleBodyJoint(i: WardrobeInput, joint: number): EditResult {
  const sections = rootSections(i);
  if (!Number.isInteger(joint) || joint < 1 || joint >= sections.length) return { ok: false, problem: `Нет стыка между секциями ${joint} и ${joint + 1}` };
  const o = clone(i),
    s = o.state,
    mezzanine = takeMezzanines(o),
    secs = rootSections(o),
    roots = rootBodies(o),
    right = secs[joint]!,
    left = secs[joint - 1]!,
    width = (b: StateBody) => exactSum(s.sections.filter((x) => x.bodyId === b.id).map((x) => x.nominalMm ?? exactDivideInteger(ckBodyWidthExact(b), s.sections.filter((y) => y.bodyId === b.id).length)));
  for (const b of roots) {
    const ss = s.sections.filter((x) => x.bodyId === b.id);
    ss.forEach((x) => (x.nominalMm ??= exactDivideInteger(ckBodyWidthExact(b), ss.length)));
  }
  if (right.bodyId !== left.bodyId) {
    const a = roots.find((b) => b.id === left.bodyId)!,
      b = roots.find((x) => x.id === right.bodyId)!,
      k = roots.indexOf(b);
    for (const x of s.sections) if (x.bodyId === b.id) x.bodyId = a.id;
    s.bodies = s.bodies.filter((x) => x !== b);
    setBodyExact(a, width(a));
    mezzanine?.sections.splice(k, 1);
  } else {
    const a = roots.find((b) => b.id === left.bodyId)!,
      ss = s.sections.filter((x) => x.bodyId === a.id),
      b = ckNewBody('B' + s.construction.nextBody, 0) as unknown as StateBody;
    s.construction = { ...s.construction, nextBody: Number(s.construction.nextBody) + 1 };
    b.base = a.base === null ? null : (JSON.parse(JSON.stringify(a.base)) as StateBody['base']);
    b.panels = { ...a.panels };
    for (const x of ss.slice(ss.indexOf(right))) x.bodyId = b.id;
    s.bodies.splice(s.bodies.indexOf(a) + 1, 0, b);
    setBodyExact(a, width(a));
    setBodyExact(b, width(b));
    if (mezzanine) mezzanine.sections.splice(roots.indexOf(a) + 1, 0, JSON.parse(JSON.stringify(mezzanine.sections[roots.indexOf(a)] ?? mezzanine.sections[0]!)));
  }
  s.construction = { ...s.construction, intent: 'manual' };
  if (mezzanine) {
    const copies = new Set<string>();
    for (const x of mezzanine.sections) {
      if (copies.has(x.uiSectionId as string)) delete x.uiSectionId;
      copies.add(x.uiSectionId as string);
    }
    addMezzanines(o, mezzanine.height, mezzanine.sections);
  }
  rebindUprights(i, o);
  const problem = layoutProblem(o);
  return problem ? { ok: false, problem } : { ok: true, input: o };
}

/** A partial upright from the bottom of a section (ckDetails r1.html:11566): its id, section, body, place from the left of the section and height, mm. */
export interface UprightSummary {
  id: string;
  section: number;
  xMm: number;
  heightMm: number;
}

type UprightRecord = { id: string; sectionId: string; bodyId: string; x: number; height: number };
const uprightList = (i: WardrobeInput) => (i.state.construction.uprights ?? []) as UprightRecord[];

/** The id the carcass gives the section of the input (canonicalSectionId: its body and its place in it); an upright refers to it. */
function sectionIdOf(i: WardrobeInput, index: number): string {
  const x = i.state.sections[index]!;
  return canonicalSectionId(x.bodyId as string, i.state.sections.filter((y) => y.bodyId === x.bodyId).indexOf(x));
}

/** The uprights of the project with the index of their section. */
export function uprights(i: WardrobeInput): UprightSummary[] {
  const ids = i.state.sections.map((_, k) => sectionIdOf(i, k));
  return uprightList(i).map((u) => ({ id: u.id, section: ids.indexOf(u.sectionId), xMm: u.x, heightMm: u.height }));
}

/**
 * After an edit of the layout the uprights follow their sections: the carcass finds an upright by the id of its
 * section, and that id changes when the section moves to another body or place. An upright of a removed section goes.
 */
function rebindUprights(before: WardrobeInput, o: WardrobeInput) {
  const list = uprightList(before);
  if (!list.length) return;
  const owner = new Map(uprights(before).map((u) => [u.id, before.state.sections[u.section]?.uiSectionId]));
  const next: UprightRecord[] = [];
  for (const u of list) {
    const k = o.state.sections.findIndex((x) => x.uiSectionId !== undefined && x.uiSectionId === owner.get(u.id));
    if (k >= 0) next.push({ ...u, sectionId: sectionIdOf(o, k), bodyId: o.state.sections[k]!.bodyId as string });
  }
  o.state.construction = { ...o.state.construction, uprights: next as unknown as JsonValue[] };
}

/**
 * Why the uprights do not stand (the refusal of the carcass, r1.html:11570) or cross the fill of their section
 * (ckConflicts r1.html:90071: a shelf, a rod or a drawer below the top of the upright), or null.
 */
function uprightProblem(i: WardrobeInput, hw: HardwareCatalogs): string | null {
  let m: Record<string, any>;
  try {
    m = carcassModel(i, hw);
  } catch (e) {
    return (e instanceof Error ? e.message : String(e)) + ' Проект не изменён.';
  }
  const t = Number(m.t);
  for (const u of uprights(i)) {
    const s = m.sectionsData[u.section];
    if (!s) continue;
    for (const [ys, what] of [[s.shelfYs, 'Полка'], [s.rodYs, 'Штанга'], [(s.drawers as { bottom: number }[]).map((x) => x.bottom), 'Ящик']] as [number[], string][]) {
      const k = ys.findIndex((y) => y < u.heightMm + t / 2);
      if (k >= 0) return `${what} ${k + 1} · секция ${u.section + 1} пересекает стоевую. Проект не изменён.`;
    }
  }
  return null;
}

/**
 * «Добавить стоевую» of the prototype (r1.html:90728, MOD-DEC-199: a partial upright stands on the bottom): in the
 * middle of the section, the full inner height. The part needs the confirmation of the technology, as in r1.
 */
export function addUpright(i: WardrobeInput, hw: HardwareCatalogs, index: number): EditResult {
  const s = i.state.sections[index];
  if (!s) return { ok: false, problem: `Нет секции ${index + 1}` };
  const m = carcassModel(i, hw),
    data = m.sectionsData[index],
    o = clone(i),
    c = o.state.construction,
    list = ((c.uprights ?? []) as JsonValue[]).slice();
  if (uprights(i).some((u) => u.section === index)) return { ok: false, problem: 'В секции уже есть стоевая. Проект не изменён.' };
  list.push({ id: 'UP' + c.nextSection, sectionId: data.id, bodyId: data.moduleId, x: data.nominalWidth / 2, height: data.geometry.innerH });
  o.state.construction = { ...c, nextSection: Number(c.nextSection) + 1, uprights: list };
  const problem = uprightProblem(o, hw);
  return problem ? { ok: false, problem } : { ok: true, input: o, notice: 'Стоевая добавлена: узел крепления выполняет монтажник, деталь требует подтверждения технолога.' };
}

/** Height and place of an upright from the left of its section (the fields «Высота перегородки», «От левого края» of r1.html:90751). */
export function setUpright(i: WardrobeInput, hw: HardwareCatalogs, id: string, patch: { heightMm?: number; xMm?: number }): EditResult {
  const o = clone(i),
    list = (o.state.construction.uprights ?? []) as { id: string; x: number; height: number }[],
    u = list.find((x) => x.id === id);
  if (!u) return { ok: false, problem: `Нет стоевой ${id}` };
  for (const v of [patch.heightMm, patch.xMm]) if (v !== undefined && !(Number.isFinite(v) && v > 0)) return { ok: false, problem: 'Высота и положение стоевой — положительные числа, мм. Проект не изменён.' };
  if (patch.heightMm !== undefined) u.height = patch.heightMm;
  if (patch.xMm !== undefined) u.x = patch.xMm;
  const problem = uprightProblem(o, hw);
  return problem ? { ok: false, problem } : { ok: true, input: o };
}

/** Removes an upright (r1.html:90753). */
export function removeUpright(i: WardrobeInput, id: string): EditResult {
  const list = (i.state.construction.uprights ?? []) as { id: string }[];
  if (!list.some((u) => u.id === id)) return { ok: false, problem: `Нет стоевой ${id}` };
  const o = clone(i);
  o.state.construction = { ...o.state.construction, uprights: list.filter((u) => u.id !== id) as unknown as JsonValue[] };
  return { ok: true, input: o };
}

// ---------------------------------------------------------------- a partition inside a section (MOD-DEC-550 п. 2, 4; 570)

/** The places of the fill of a section the model has, written into it before an edit of the carcass (u136FreezeContents r1.html:90090). */
function freezeContents(cfg: Rec, a: Rec) {
  if (a.shelfYs.length) cfg.shelfPositions = (a.shelfYs as number[]).slice();
  if (a.rodYs.length) cfg.rodPositions = (a.rodYs as number[]).slice();
  if (a.drawers.length) cfg.drawerPositions = (a.drawers as Rec[]).map((v) => v.bottom);
}

/** The stored places of the fill of a section as the model has them, before an edit of the fill (fiFreeze r1.html:91955). */
function freezeFill(cfg: Rec, a: Rec) {
  cfg.shelfPositions = (a.shelfYs as number[]).slice();
  cfg.rodPositions = (a.rodYs as number[]).slice();
  cfg.drawerPositions = (a.drawers as Rec[]).map((v) => v.bottom);
  cfg.drawerHeights = (a.drawers as Rec[]).map((v) => v.boxHeight);
  if (!cfg.filling) cfg.drawerGaps = (a.drawers as Rec[]).map((v) => v.gapAbove);
}

/**
 * The records of the project that name a section by its id (`M01-S02`, canonicalSectionId) follow it when sections
 * are split, joined or removed (MOD-DEC-570): the baskets, trouser racks and pantographs (484), the lit sections (483).
 * `to(k)` — the new index of the old section `k`, or the list of them; an empty list — the section is gone, and its
 * items go with it (R2-030); a section is lit when one of its old sections was.
 */
function followSectionIds(before: WardrobeInput, o: WardrobeInput, to: (k: number) => number[]) {
  const f = (o.state as Rec).fittings as Rec | undefined;
  if (!f) return;
  const was = projectSectionIds(before),
    now = projectSectionIds(o),
    ids = (id: string) => (was.includes(id) ? to(was.indexOf(id)).map((k) => now[k]!) : []);
  if (Array.isArray(f.storage)) {
    f.storage = (f.storage as Rec[]).filter((r) => !was.includes(r.sectionId) || ids(r.sectionId).length).map((r) => ({ ...r, sectionId: ids(r.sectionId)[0] ?? r.sectionId }));
    if (!(f.storage as Rec[]).length) delete f.storage;
  }
  if (Array.isArray(f.lighting)) {
    const lit = new Set((f.lighting as string[]).flatMap(ids));
    f.lighting = lit.size === now.length ? 'ALL' : now.filter((x) => lit.has(x));
  }
}

/**
 * The new index of each old section when sections go (followSectionIds): `root(r)` — the new place of the r-th section
 * on the floor, `upper(j)` — of the j-th section of the mezzanine, null — it is gone.
 */
function keptSections(before: WardrobeInput, o: WardrobeInput, root: (r: number) => number | null, upper: (j: number) => number | null) {
  const up = upperIds(before),
    rootsNow = rootSections(o),
    upperNow = o.state.sections.filter((x) => !rootsNow.includes(x)),
    rootsWas = rootSections(before),
    upperWas = before.state.sections.filter((x) => up.has(x.bodyId as string));
  return (k: number): number[] => {
    const x = before.state.sections[k]!,
      r = rootsWas.indexOf(x),
      to = r >= 0 ? root(r) : upper(upperWas.indexOf(x)),
      y = to === null ? undefined : (r >= 0 ? rootsNow : upperNow)[to];
    return y ? [o.state.sections.indexOf(y)] : [];
  };
}

/** Why a section cannot take or lose a partition: no such section, a mezzanine, a sliding wardrobe, an upright in it. */
function partitionProblem(i: WardrobeInput, index: number): string | null {
  const s = i.state.sections[index];
  if (!s) return `Нет секции ${index + 1}`;
  if (i.domain === 'sliding') return 'Перегородка внутри секции купе — следующей задачей (MOD-DEC-570). Проект не изменён.';
  if (upperIds(i).has(s.bodyId as string)) return 'Секция антресоли занимает весь корпус под ней: перегородку в ней не поставить и не убрать. Проект не изменён.';
  if (uprights(i).some((u) => u.section === index)) return `В секции ${index + 1} стоит стоевая: сначала уберите её. Проект не изменён.`;
  return null;
}

/** The partitions inside the bodies on the floor: the index of the section on the right of each, left to right (fiMerge r1.html:92654 takes it). */
export function innerPartitions(i: WardrobeInput): number[] {
  const roots = rootSections(i);
  return roots.flatMap((x, k) => (k > 0 && roots[k - 1]!.bodyId === x.bodyId ? [i.state.sections.indexOf(x)] : []));
}

/**
 * Where a partition may stand in the section, from the left of its clear opening, mm: each of the two sections keeps
 * 160 mm of nominal width, the openings are what the sides leave (MOD-DEC-565; r1 fiSplit r1.html:92594 kept 160 mm of
 * each opening — FINDINGS 1223). The left section takes the partition's thickness, and half of the body's side when first.
 */
export function partitionRange(i: WardrobeInput, hw: HardwareCatalogs, index: number): { minMm: number; maxMm: number; clearMm: number } | null {
  const a = carcassModel(i, hw).sectionsData[index];
  if (!a) return null;
  const t = Number(i.controls.thickness),
    side = t + (a.localIndex === 0 ? t / 2 : 0);
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return { minMm: r3(MIN_SECTION_NOMINAL_WIDTH - side), maxMm: r3(a.nominalWidth - MIN_SECTION_NOMINAL_WIDTH - side), clearMm: a.clearOpeningWidth };
}

/**
 * «Добавить перегородку» inside the section `index` (fiSplit r1.html:92594 — a partition drawn from the bottom to the
 * roof; MOD-DEC-550 п. 2, 570): a full-height partition stands `leftMm` from the left of the clear opening and cuts the
 * section into two of one body; each section keeps 160 mm (565). The body and the other sections keep their widths. Both
 * new sections keep the fill of the old one at its heights and its door; the doors are rebuilt by the front chain (037,
 * 565). The right section is new: its ids are those of the filling layer (fiId), its partition is of the full inner height.
 */
export function addPartition(i: WardrobeInput, hw: HardwareCatalogs, index: number, leftMm: number): EditResult {
  const why = partitionProblem(i, index);
  if (why) return { ok: false, problem: why };
  if (!(Number.isFinite(leftMm) && leftMm > 0 && Math.round(leftMm * 1000) === leftMm * 1000)) return { ok: false, problem: 'Положение перегородки — положительное число, мм, не точнее 0,001. Проект не изменён.' };
  const m = carcassModel(i, hw),
    a: Rec = m.sectionsData[index],
    t = Number(m.t),
    range = partitionRange(i, hw, index)!;
  if (leftMm < range.minMm || leftMm > range.maxMm)
    return {
      ok: false,
      problem:
        range.maxMm < range.minMm
          ? `Недостаточно ширины для двух проёмов: секция ${Math.round(a.nominalWidth * 10) / 10} мм, каждой из двух нужно не меньше ${MIN_SECTION_NOMINAL_WIDTH} мм (MOD-DEC-565). Проект не изменён.`
          : `Недостаточно ширины для двух проёмов: перегородка — от ${range.minMm} до ${range.maxMm} мм от левого края проёма, каждой секции не меньше ${MIN_SECTION_NOMINAL_WIDTH} мм (MOD-DEC-565). Проект не изменён.`,
    };
  const o = clone(i),
    d = o.state as Rec,
    s = o.state.sections[index] as Rec;
  freezeFill(s, a);
  const old: ExactMm = s.nominalMm ?? parseExactMm(String(a.nominalWidth)),
    right = JSON.parse(JSON.stringify(s)) as Rec;
  right.uiSectionId = fill.fillingId(d, 'section');
  right.physicalId = fill.fillingId(d, s.bodyId + '-S');
  right.partitionHeight = a.geometry.innerH;
  right.fillingDivider = { origin: fill.fillingId(d, 'split'), leftSection: s.physicalId };
  // The left opening is `leftMm`: the section takes the partition's thickness, and half of the side of the body when first.
  s.nominalMm = parseExactMm(String(leftMm + t + (a.localIndex === 0 ? t / 2 : 0)));
  right.nominalMm = exactSub(old, s.nominalMm);
  right.ratio = 0;
  fill.fillingOf(d, s, m, index);
  const rf = fill.fillingOf(d, right, m, -1),
    remap = new Map<string, string>();
  for (const type of ['shelf', 'drawer', 'rod', 'partitions', 'groups'])
    for (const r of rf[type] as Rec[]) {
      const was = r.id;
      r.id = fill.fillingId(d, type);
      remap.set(was, r.id);
    }
  if (rf.cover) {
    const was = rf.cover.id;
    rf.cover.id = fill.fillingId(d, 'cover');
    remap.set(was, rf.cover.id);
  }
  if (Array.isArray(right.shelfUids)) right.shelfUids = (right.shelfUids as string[]).map((id) => remap.get(id) ?? id);
  const walk = (v: unknown): unknown => (Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : typeof v === 'string' ? (remap.get(v) ?? v) : v);
  right.filling = walk(rf);
  o.state.sections.splice(index + 1, 0, right as WardrobeSection);
  followSectionIds(i, o, (k) => (k < index ? [k] : k === index ? [k, k + 1] : [k + 1]));
  rebindUprights(i, o);
  const problem = layoutProblem(o);
  if (problem) return { ok: false, problem: `Недостаточно ширины для двух проёмов. ${problem}` };
  return { ok: true, input: o, notice: `Перегородка добавлена: секция ${index + 1} разделена на две, наполнение и дверь остались в обеих.` };
}

/** The clear opening on the left of the partition on the left of the section `index`, mm (the field «Слева» of r1), or null without one. */
export function partitionPlace(i: WardrobeInput, hw: HardwareCatalogs, index: number): number | null {
  return innerPartitions(i).includes(index) ? carcassModel(i, hw).sectionsData[index - 1].clearOpeningWidth : null;
}

/**
 * The place of the partition on the left of the section `index`: the clear opening on its left, mm (the field «Слева»
 * of the filling layer, fiDividerMove r1.html:92927 → ckSectionWidth): the section on the left takes the change, the one
 * on the right gives it, as a width of a section does (MOD-DEC-199).
 */
export function movePartition(i: WardrobeInput, hw: HardwareCatalogs, index: number, leftMm: number): EditResult {
  if (!innerPartitions(i).includes(index)) return { ok: false, problem: 'Выберите перегородку между секциями одного корпуса. Проект не изменён.' };
  if (!(Number.isFinite(leftMm) && leftMm > 0)) return { ok: false, problem: 'Положение перегородки — положительное число, мм. Проект не изменён.' };
  const a = carcassModel(i, hw).sectionsData[index - 1];
  return setSectionWidth(i, index - 1, Math.round((a.nominalWidth + leftMm - a.clearOpeningWidth) * 1000) / 1000);
}

/** Two places of the fill are one (the comparison of the fill, MOD-DEC-191). */
const EPS = wardrobeFill.constants.compare.value;

/** The keys of the door of a section (ckMergePartition r1.html:90251 copies `facade…` and `hingeSide`; the lift of W5 and the mass of a door go with them). */
const isDoorKey = (k: string) => k.startsWith('facade') || ['hingeSide', 'liftKind', 'liftHandleMassKg', 'doorMassKg'].includes(k);

/**
 * «Удалить перегородку» (ckMergePartition r1.html:90251; MOD-DEC-550 п. 4, 570): the partition on the left of the
 * section `index` goes and the two sections of one body become one of their width. The fill of both stays at its
 * heights (shelves with their types, loads, depths, ids; rods; the drawers of the one that has them, with the shelf over
 * them); what comes too close to the other is listed by fillConflicts for «Удалить затронутое» (570: not refused, as
 * r1 did). An element of the right section at the very place of one of the left is the same element (570 (Д)): the
 * copies of «Добавить перегородку» go with the partition, as in fiMerge r1.html:92654. The door is the left one, or the
 * right one when the left has none; the doors are rebuilt by the front chain (037, 565) — r1 refused two doors. Two
 * different drawer blocks are refused, as in r1.
 */
export function removePartition(i: WardrobeInput, hw: HardwareCatalogs, index: number): EditResult {
  if (!innerPartitions(i).includes(index)) return { ok: false, problem: 'Выберите перегородку между секциями одного корпуса. Проект не изменён.' };
  const why = partitionProblem(i, index) ?? partitionProblem(i, index - 1);
  if (why) return { ok: false, problem: why };
  const m = carcassModel(i, hw),
    t = Number(m.t),
    o = clone(i),
    d = o.state as Rec,
    a = o.state.sections[index - 1] as Rec,
    b = o.state.sections[index] as Rec,
    ma: Rec = m.sectionsData[index - 1],
    mb: Rec = m.sectionsData[index];
  freezeContents(a, ma);
  freezeContents(b, mb);
  // A shelf, a rod or the drawers of the right section at the very place of those of the left one are one element of
  // the joined section (MOD-DEC-570 (Д)): the copies «Добавить перегородку» made go when the partition goes (fiMerge).
  const same = (x: number, y: number) => Math.abs(x - y) < EPS,
    twin = (list: unknown, y: number) => ((list ?? []) as number[]).some((v) => same(v, y)),
    sameDrawers =
      a.drawersEnabled &&
      b.drawersEnabled &&
      ma.drawers.length === mb.drawers.length &&
      (ma.drawers as Rec[]).every((v, k) => same(v.bottom, mb.drawers[k].bottom) && same(v.boxHeight, mb.drawers[k].boxHeight) && v.mode === mb.drawers[k].mode);
  if (a.drawersEnabled && b.drawersEnabled && !sameDrawers) return { ok: false, problem: 'Два блока ящиков несовместимы в одном проёме: уберите ящики одной из секций. Проект не изменён.' };
  const layer = !!(a.filling || b.filling);
  if (layer) {
    fill.fillingOf(d, a, m, index - 1);
    fill.fillingOf(d, b, m, index);
  }
  const shelves = [a, b]
      .flatMap((c) =>
        ((c.shelfPositions ?? []) as number[]).flatMap((y, k) => (c === b && twin(a.shelfPositions, y) ? [] : [{
          y,
          type: shelfTypeAt(c, k),
          uid: c.shelfUids?.[k],
          load: c.shelfLoadsKg?.[k] ?? c.shelfLoadKg ?? 10,
          depth: c.shelfDepths?.[k] ?? null,
          offset: c.shelfSupportOffsets?.[k] ?? null,
          row: c.filling?.shelf?.[k],
        }])),
      )
      .sort((x, y) => x.y - y.y),
    rods = [a, b].flatMap((c) => ((c.rodPositions ?? []) as number[]).flatMap((y, k) => (c === b && twin(a.rodPositions, y) ? [] : [{ y, row: c.filling?.rod?.[k] }]))).sort((x, y) => x.y - y.y),
    drawers = b.drawersEnabled && !sameDrawers ? b : a,
    kept = new Set(shelves.map((x) => x.uid));
  a.nominalMm = exactAdd(a.nominalMm ?? parseExactMm(String(ma.nominalWidth)), b.nominalMm ?? parseExactMm(String(mb.nominalWidth)));
  if (drawers === b) for (const key of Object.keys(b).filter((k) => k.startsWith('drawer') || k === 'system32Pair')) a[key] = JSON.parse(JSON.stringify(b[key]));
  a.drawersEnabled = !!(a.drawersEnabled || b.drawersEnabled);
  for (const [key, field] of [['shelfPositions', 'y'], ['shelfTypes', 'type'], ['shelfUids', 'uid'], ['shelfLoadsKg', 'load'], ['shelfDepths', 'depth'], ['shelfSupportOffsets', 'offset']] as const) a[key] = shelves.map((x) => x[field] ?? null);
  a.shelvesEnabled = shelves.length > 0;
  a.shelfCount = shelves.length;
  a.rodPositions = rods.map((x) => x.y);
  a.rodCount = rods.length;
  if (a.facade === 'none' && b.facade !== 'none') {
    for (const key of Object.keys(a).filter(isDoorKey)) delete a[key];
    for (const key of Object.keys(b).filter(isDoorKey)) a[key] = JSON.parse(JSON.stringify(b[key]));
  }
  if (layer) {
    // The filling layer of both (MOD-DEC-570; r1 kept only the left one's): the rows in the new order of the shelves and rods.
    const fa = a.filling,
      fd = drawers.filling,
      shift = ma.clearOpeningWidth + t;
    a.filling = {
      ...fa,
      shelf: shelves.map((x) => x.row),
      rod: rods.map((x) => x.row),
      drawer: fd.drawer,
      groups: fd.groups,
      cover: fd.cover,
      partitions: [...fa.partitions, ...(b.filling.partitions as Rec[]).map((p) => ({ ...p, left: p.left + shift }))],
    };
    for (const r of [...a.filling.shelf, ...a.filling.rod, ...a.filling.drawer, ...(a.filling.cover ? [a.filling.cover] : [])] as Rec[]) if (r.spanRight === b.physicalId) delete r.spanRight;
  }
  if (Array.isArray(d.seamBindings)) d.seamBindings = (d.seamBindings as Rec[]).filter((x) => x.sectionId !== b.uiSectionId || kept.has(x.shelfId));
  for (const binding of (d.seamBindings ?? []) as Rec[]) if (binding.sectionId === b.uiSectionId) binding.sectionId = a.uiSectionId;
  o.state.sections.splice(index, 1);
  followSectionIds(i, o, (k) => (k < index ? [k] : [k - 1]));
  rebindUprights(i, o);
  const problem = layoutProblem(o);
  if (problem) return { ok: false, problem };
  return { ok: true, input: o, notice: `Перегородка удалена: секции ${index} и ${index + 1} объединены, наполнение обеих сохранено.` };
}

// ---------------------------------------------------------------- the room (U1; the construction layer r1.html:90598)

/** «Сборка» of the prototype: not given, lying with the lift, standing in place. */
export type AssemblyChoice = 'lying' | 'standing' | null;

/** The room of the project (state.construction.room): the walls, the place, the ceiling, the assembly, the skirting. */
export interface RoomSummary {
  niche: boolean;
  left: boolean;
  right: boolean;
  /** «Ширина места установки», mm; offered with a niche or walls on both sides. */
  width: number | null;
  ceiling: number | null;
  assembly: AssemblyChoice;
  skirting: boolean;
  skirtHeight: number | null;
  skirtDepth: number | null;
}

type RoomRecord = RoomSummary & { widths?: JsonValue; heights?: JsonValue };

const roomOf = (i: WardrobeInput): RoomRecord => (i.state.construction.room ?? {}) as unknown as RoomRecord;

/** What the editor shows of the room; a project without the record has no walls (the construction layer, r1.html:11347). */
export function roomSummary(i: WardrobeInput): RoomSummary {
  const r = roomOf(i),
    n = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    niche: r.niche === true,
    left: r.niche === true || r.left === true,
    right: r.niche === true || r.right === true,
    width: n(r.width),
    ceiling: n(r.ceiling),
    assembly: r.assembly === 'lying' || r.assembly === 'standing' ? r.assembly : null,
    skirting: r.skirting === true,
    skirtHeight: n(r.skirtHeight),
    skirtDepth: n(r.skirtDepth),
  };
}

/** The wardrobe stands against walls on both sides — in a niche or between two walls: only then the back may go (MOD-DEC-168). */
export const wallsHoldBack = (r: Pick<RoomSummary, 'niche' | 'left' | 'right'>) => r.niche || (r.left && r.right);

const backRemoved = (i: WardrobeInput) => i.state.bodies.some((b) => b.panels.back === false);

/** Text of the refusal when the walls would no longer hold a wardrobe without its back (MOD-DEC-168: the back is not added silently). */
const BACK_NEEDS_WALLS = 'Задняя стенка снята: без неё шкаф стоит только в нише или между стенами (MOD-DEC-168). Сначала верните заднюю стенку. Проект не изменён.';

/**
 * The room (the fields of «Помещение и установка», r1.html:90598): niche, walls, the width of the place, the ceiling,
 * the assembly, the skirting with its height and projection. A size is a positive whole number of mm or null (not
 * given); the graph checks the lift, the height and the width (roomInstallationValidator) and cuts the skirting.
 * A change that takes the walls away from a wardrobe without its back is refused (MOD-DEC-168).
 */
export function setRoom(i: WardrobeInput, patch: Partial<RoomSummary>): EditResult {
  for (const k of ['width', 'ceiling', 'skirtHeight', 'skirtDepth'] as const) {
    const v = patch[k];
    if (v !== undefined && v !== null && !(Number.isInteger(v) && v > 0)) return { ok: false, problem: 'Размеры помещения — целые миллиметры больше нуля или пусто. Проект не изменён.' };
  }
  const o = clone(i),
    r = { ...roomOf(o) } as Record<string, JsonValue>;
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) r[k] = v as JsonValue;
  // With a niche the walls are the niche's (the prototype shows them on and fixed, r1.html:90548).
  const next = { niche: r.niche === true, left: r.niche === true || r.left === true, right: r.niche === true || r.right === true };
  if (backRemoved(o) && !wallsHoldBack(next)) return { ok: false, problem: BACK_NEEDS_WALLS };
  o.state.construction = { ...o.state.construction, room: r };
  const notice = patch.ceiling !== undefined ? ceilingNotice(o, true) : null;
  return notice ? { ok: true, input: o, notice } : { ok: true, input: o };
}

/**
 * The overall height against «Высота до потолка» (MOD-AI-64): a wardrobe higher than the ceiling does not stand in its
 * place — the graph warns of it (roomInstallationValidator, «Корпус не помещается по высоте»), the editor says it at
 * once with the height that fits; the edit is not refused, as the prototype's check is a warning (MOD-DEC-199, 217).
 * With `offer` a lower wardrobe is told how high it may go up to the ceiling, within the field (Д). No ceiling — no text.
 */
function ceilingNotice(i: WardrobeInput, offer = false): string | null {
  const c = roomSummary(i).ceiling,
    h = Number(i.controls.height);
  if (c === null || !Number.isFinite(h)) return null;
  const fits = Math.min(c, EDITOR_LIMITS.height.max);
  if (h > c) return `Шкаф высотой ${h} мм выше потолка ${c} мм и в этом месте не встанет: уменьшите высоту до ${fits} мм.`;
  if (offer && h < fits) return `Потолок ${c} мм, шкаф ${h} мм: высоту шкафа можно увеличить до ${fits} мм.`;
  return null;
}

/** Facade of a section: no door, one door, two doors (MOD-DEC-286: two doors meet on half-overlay hinges) or a lift front (MOD-DEC-320). */
export function setFacade(i: WardrobeInput, index: number, facade: FacadeChoice): EditResult {
  const o = clone(i),
    s = o.state.sections[index];
  if (!s) return { ok: false, problem: `Нет секции ${index + 1}` };
  s.facade = facade;
  delete s.facadeRows;
  delete s.facadeHeightMode;
  delete s.facadeRowSequence;
  return { ok: true, input: o };
}

/**
 * Mounting of the doors of every section (MOD-DEC-221: one choice «Тип фасадов» for the wardrobe): накладные in front
 * of the carcass or вкладные in the opening with the gap of MOD-DEC-362. The facade field changes: rows of heights set
 * by hand keep their seams where they were — on the shelves — and the top row takes the rest (MOD-AI-79, with `hw`,
 * keepFacadeSeams); a row that would be lower than 80 mm, or an edit without `hw`, shares the rows equally again ((Д),
 * FINDINGS 404).
 */
export function setFacadeMounting(i: WardrobeInput, mounting: FacadeMountingChoice, hw?: HardwareCatalogs): EditResult {
  const o = clone(i),
    manual: number[] = [];
  o.state.sections.forEach((s, k) => {
    if (mounting === 'INSET') s.facadeMounting = 'INSET';
    else delete s.facadeMounting;
    if (s.facadeHeightMode === 'MANUAL' && i.state.sections[k]!.facadeMounting !== s.facadeMounting) manual.push(k);
  });
  if (!manual.length) return { ok: true, input: o };
  const reshared = hw ? keepFacadeSeams(i, o, hw, manual) : manual.length;
  if (!hw) for (const k of manual) delete o.state.sections[k]!.facadeHeightMode;
  else for (const k of manual) if (o.state.sections[k]!.facadeHeightMode === 'EQUAL') delete o.state.sections[k]!.facadeHeightMode;
  const kept = manual.length - reshared;
  const told = [
    kept ? 'Стыки рядов фасадов, заданных по высоте вручную, остались на месте; верхний ряд принял разницу высоты поля.' : '',
    reshared ? 'Высоты рядов фасадов, заданные вручную, снова поделены поровну: у вкладных и накладных фасадов разная высота поля.' : '',
  ].filter(Boolean);
  return { ok: true, input: o, notice: told.join(' ') };
}

/**
 * Hinge side of the doors of a section: of its single door, or — with the facade in rows — of the doors of every row at
 * once (MOD-DEC-722, MOD-AI-19; one by one — «Петли» of the row, setFacadeRow). A row of two doors keeps its pair.
 */
export function setHingeSide(i: WardrobeInput, index: number, side: HingeSide): EditResult {
  const o = clone(i),
    s = o.state.sections[index];
  if (!s) return { ok: false, problem: `Нет секции ${index + 1}` };
  s.hingeSide = side;
  const rows = (s.facadeRows ?? []) as Record<string, JsonValue>[];
  for (const r of rows) r.hingeSide = side;
  if (!rows.length) return { ok: true, input: o };
  return { ok: true, input: o, notice: `Петли дверей всех рядов секции — ${side === 'left' ? 'слева' : 'справа'}; у ряда из двух дверей петли остаются по краям.` };
}

/**
 * The range of the base height of the field (R2-025, FINDINGS 1768, Д): «Ножки» go down to the lowest open leg of the
 * catalogue (MOD-DEC-480, 481: the legs H.17 and H.27 of the list), the other bases keep 40–250 mm of the prototype.
 */
export function baseHeightLimits(base: BaseChoice, hw?: HardwareCatalogs): { min: number; max: number } {
  const L = EDITOR_LIMITS.baseHeight;
  if (base !== 'fixedLegs' || !hw) return L;
  return { min: Math.min(L.min, ...openLegs(hw.fittings).map((l) => l.heightMm.minMm)), max: L.max };
}

/** Base of all bodies: plinth, fixed legs, legs behind a decorative plinth or none (MOD-DEC-291, 171, 483), with its height; «Ножки» by the range of baseHeightLimits when `hw` is given. */
export function setBase(i: WardrobeInput, base: BaseChoice, height?: number, hw?: HardwareCatalogs): EditResult {
  const h = height ?? wardrobeSummary(i).baseHeight;
  if (base !== 'none') {
    const p = inRange('Высота основания', h, baseHeightLimits(base, hw));
    if (p) return { ok: false, problem: p };
  }
  const o = clone(i),
    setback = Number(o.controls.plinthSetback);
  for (const b of o.state.bodies) if (!b.parent) b.base = { kind: base, height: h, setback };
  return { ok: true, input: o };
}

/**
 * «Ножки» (MOD-DEC-481): the bodies go on legs at a height an open leg of the catalogue gives — the current one when a
 * leg gives it, else the nearest (from the plinth of 70 mm — 50 mm); the legs under a plinth are for «Ножки за
 * цоколем» (483). A load-bearing plinth of board has no legs at any height (481): «Цоколь» is the plinth without legs.
 */
export function setLegsBase(i: WardrobeInput, hw: HardwareCatalogs): EditResult {
  return setBase(i, 'fixedLegs', legsBaseHeight(hw.fittings, wardrobeSummary(i).baseHeight, EDITOR_LIMITS.baseHeight), hw);
}

/**
 * «Ножки за цоколем» (MOD-DEC-483): the bodies go on the legs under a plinth at a height such a leg gives — the
 * current one when it does, else the nearest (from the plinth of 70 mm — 80 mm on the leg H.80); the decorative plinth
 * of board stands in front of them on clips.
 */
export function setPlinthLegsBase(i: WardrobeInput, hw: HardwareCatalogs): EditResult {
  return setBase(i, 'legsPlinth', legsBaseHeight(hw.fittings, wardrobeSummary(i).baseHeight, EDITOR_LIMITS.baseHeight, true));
}

/** Roof or back panel of all bodies on or off (prototype: «Крыша», «Задняя стенка»; without the back — 168, 309). */
export function setPanel(i: WardrobeInput, panel: 'top' | 'back', on: boolean): EditResult {
  if (panel === 'back' && !on && !wallsHoldBack(roomSummary(i)))
    return { ok: false, problem: 'Без задней стенки шкаф стоит только в нише или между стенами: отметьте «В нише» или стены слева и справа (MOD-DEC-168). Проект не изменён.' };
  const o = clone(i);
  for (const b of o.state.bodies) b.panels = { ...b.panels, [panel]: on };
  return { ok: true, input: o };
}

/** Carcass decor, as the prototype writes it (decorChoices, mfSelectDecor r1.html:58320). */
export function setDecor(i: WardrobeInput, hw: HardwareCatalogs, decorId: string): EditResult {
  const d = decorChoices(hw).find((x) => x.id === decorId);
  if (!d) return { ok: false, problem: `Декор ${decorId} не входит в выбор редактора` };
  const decor = mfDecor(d.id, hw.materials),
    o = clone(i),
    // The material of the doors chosen apart (setFacadeMaterial), the decors of the outer sides and of the edges
    // (MOD-DEC-483) stay with a new carcass decor.
    own = (i.state.materialSelection ?? {}) as { facade?: JsonValue; sides?: JsonValue; edges?: JsonValue },
    facade = own.facade,
    kept = Object.fromEntries((['facade', 'sides', 'edges'] as const).filter((k) => own[k] !== undefined).map((k) => [k, own[k]!])),
    facadeLook = (i.state.appearanceSelection as { facade?: JsonValue } | undefined)?.facade;
  o.controls.material = d.material;
  if (!decor && !Object.keys(kept).length) delete o.state.materialSelection;
  else o.state.materialSelection = { ...(decor ? corpusSelection(decor, Number(i.controls.thickness)) : { version: 'MATERIAL-SELECTION-1' }), ...kept };
  o.state.appearanceSelection = { ...(JSON.parse(JSON.stringify(decor ? corpusAppearance(d.id) : DEFAULT_APPEARANCE)) as { [key: string]: JsonValue }), ...(facade && facadeLook ? { facade: facadeLook } : {}) };
  return { ok: true, input: o };
}

/** What an outer side can be (MOD-DEC-483): the carcass, the facades or a decor of the catalogue. */
export type SideDecorChoice = 'CORPUS' | 'FACADE' | string;

/** The choice of an outer side of the project: 'CORPUS' unless chosen. */
export function sideDecorChoice(i: WardrobeInput, side: 'left' | 'right'): SideDecorChoice {
  return String(((i.state.materialSelection as Rec | undefined)?.sides as Rec | undefined)?.[side] ?? 'CORPUS');
}

/** The decor of the bands of the visible edges (MOD-DEC-483): 'PART' — the part's (default), 'FACADE' — the facades'. */
export function edgeDecorChoice(i: WardrobeInput): 'PART' | 'FACADE' {
  return (i.state.materialSelection as Rec | undefined)?.edges === 'FACADE' ? 'FACADE' : 'PART';
}

/** Writes a key of the material selection; null removes it, and the selection with it when nothing else is left. */
function setSelection(i: WardrobeInput, key: string, value: JsonValue | null): WardrobeInput {
  const o = clone(i),
    s: { [key: string]: JsonValue } = { ...((o.state.materialSelection ?? { version: 'MATERIAL-SELECTION-1' }) as { [key: string]: JsonValue }) };
  if (value === null) delete s[key];
  else s[key] = value;
  if (Object.keys(s).every((k) => k === 'version')) delete o.state.materialSelection;
  else o.state.materialSelection = s;
  return o;
}

/**
 * The decor of the left or the right outer side of the wardrobe (MOD-DEC-483): «в цвет корпуса» (the default), «в цвет
 * фасадов» or a decor of the catalogue; the inner partitions stay the carcass's. The sheets of that decor are cut and
 * priced apart.
 */
export function setSideDecor(i: WardrobeInput, hw: HardwareCatalogs, side: 'left' | 'right', choice: SideDecorChoice): EditResult {
  if (choice !== 'CORPUS' && choice !== 'FACADE' && !mfDecor(choice, hw.materials)) return { ok: false, problem: `Декора ${choice} нет в каталоге. Проект не изменён.` };
  const sides: Rec = { ...(((i.state.materialSelection as Rec | undefined)?.sides as Rec | undefined) ?? {}) };
  if (choice === 'CORPUS') delete sides[side];
  else sides[side] = choice;
  return { ok: true, input: setSelection(i, 'sides', Object.keys(sides).length ? (sides as { [key: string]: JsonValue }) : null) };
}

/** The decor of the bands of the visible edges (MOD-DEC-483): of the part (the default) or of the facades. */
export function setEdgeDecor(i: WardrobeInput, choice: 'PART' | 'FACADE'): EditResult {
  return { ok: true, input: setSelection(i, 'edges', choice === 'FACADE' ? 'FACADE' : null) };
}

/** An edit of the fill (task W6): the refusal of fill-edit.ts is its message, the input is not changed. */
function fillEdit(run: () => fill.FillEdit): EditResult {
  try {
    const r = run();
    return { ok: true, input: r.input, notice: r.notice };
  } catch (e) {
    return { ok: false, problem: e instanceof Error ? e.message : String(e) };
  }
}

/** A new fixed shelf in the section by the owner's rules (MOD-DEC-193, 225). */
export function addShelf(i: WardrobeInput, hw: HardwareCatalogs, section: number): EditResult {
  return fillEdit(() => fill.addShelf(i, hw, section));
}

/**
 * A new clothes rod in the section (MOD-DEC-290, 310, 333): its top by the section of the rod of the project from the
 * catalogue (FIT, 480), not the prototype's 20 mm. The rod is a mechanism of the graph: no part.
 */
export function addRod(i: WardrobeInput, hw: HardwareCatalogs, section: number): EditResult {
  return fillEdit(() => fill.addRod(i, hw, section, { profileHeightMm: projectRodSeries(i, hw.fittings).sectionMm.heightMm }));
}

/** A new drawer in the section (W7): internal by default; an external one behind a door is refused (WR-30). */
export function addDrawer(i: WardrobeInput, hw: HardwareCatalogs, section: number, execution?: 'internal' | 'external'): EditResult {
  return fillEdit(() => fill.addDrawer(i, hw, section, { execution }));
}

/** Removes a drawer of the section; without drawers the door gets ordinary hinges again (MOD-DEC-311). */
export function removeDrawer(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): EditResult {
  return fillEdit(() => fill.removeDrawer(i, hw, section, index));
}

/**
 * A new basket for linen or for shoes, trouser rack or pantograph in the section (MOD-DEC-484): the item of the catalogue
 * for its width and depth, in the free height of the section; behind a door — as an inner drawer (288, 331, 360, 050).
 */
export function addStorage(i: WardrobeInput, hw: HardwareCatalogs, section: number, kind: StorageKind): EditResult {
  return fillEdit(() => fill.addStorage(i, hw, section, kind));
}

export type { StorageKind };
export { STORAGE_KIND_RU } from '../engine/policy/fittings-selection.js';

/** The block of drawers of the section as a whole: its lowest box to `yMm` over the interior bottom (MOD-AI-80). */
export function moveDrawerBlock(i: WardrobeInput, hw: HardwareCatalogs, section: number, yMm: number): EditResult {
  return fillEdit(() => fill.moveDrawerBlock(i, hw, section, yMm));
}

/** One box height for every drawer of the section, stacked again from the lowest (MOD-AI-80). */
export function setDrawerBlockHeight(i: WardrobeInput, hw: HardwareCatalogs, section: number, heightMm: number): EditResult {
  return fillEdit(() => fill.setDrawerBlockHeight(i, hw, section, heightMm));
}

/** Removes a basket, a trouser rack or a pantograph of the section (MOD-DEC-484). */
export function removeStorage(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): EditResult {
  return fillEdit(() => fill.removeStorage(i, hw, section, index));
}

/** The type of a shelf: fixed or removable on supports (MOD-DEC-312). */
export function changeShelfType(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, type: 'fixedShelf' | 'adjustableShelf'): EditResult {
  return fillEdit(() => fill.changeShelfType(i, hw, section, index, type));
}

/** Removes a rod of the section (R2-008): the other rods keep their heights, depths and ids. */
export function removeRod(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): EditResult {
  return fillEdit(() => fill.removeRod(i, hw, section, index));
}

/** Removes a shelf of the section (U2): the other shelves keep their heights, types and ids. */
export function removeShelf(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): EditResult {
  return fillEdit(() => fill.removeShelf(i, hw, section, index));
}

/** Moves a shelf to the height of its middle over the interior bottom (U2; MOD-DEC-193, 196, 312). */
export function moveShelf(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, yMm: number): EditResult {
  return fillEdit(() => fill.moveShelf(i, hw, section, index, yMm));
}

export type DragLevels = fill.DragLevels;
type Levels = { ok: true; levels: fill.DragLevels } | { ok: false; problem: string };

/** The levels of a drag, or the refusal of the core as its message. */
function levelsOf(run: () => fill.DragLevels): Levels {
  try {
    return { ok: true, levels: run() };
  } catch (e) {
    return { ok: false, problem: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The levels a shelf dragged on the drawing snaps to (FINDINGS 1071): the grid of System 32 of its mounting axis, or
 * whole millimetres of its upper face; a shelf that is not moved alone (over the drawers, over a rod, under a
 * partition) is refused with the reason. The drop is `moveShelf` to the level reached.
 */
export function shelfDragLevels(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): Levels {
  return levelsOf(() => fill.shelfDragLevels(i, hw, section, index));
}

/** The levels a rod dragged on the drawing snaps to (FINDINGS 1073): its top in whole millimetres; the drop is `moveRod`. */
export function rodDragLevels(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): Levels {
  return levelsOf(() => fill.rodDragLevels(i, hw, section, index, { profileHeightMm: projectRodSeries(i, hw.fittings).sectionMm.heightMm }));
}

/** The levels a drawer dragged on the drawing snaps to (FINDINGS 1073): the shelf over it on the grid of System 32; the drop is `moveDrawer`. */
export function drawerDragLevels(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): Levels {
  return levelsOf(() => fill.drawerDragLevels(i, hw, section, index));
}

/** Moves a rod to the height of its axis over the interior bottom (FINDINGS 1073; MOD-DEC-310, 333). */
export function moveRod(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, yMm: number): EditResult {
  return fillEdit(() => fill.moveRod(i, hw, section, index, yMm));
}

/** Moves a drawer to the height of its bottom over the interior bottom, the shelf over it with it (FINDINGS 1073; FE-04, MOD-DEC-175). */
export function moveDrawer(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, yMm: number): EditResult {
  return fillEdit(() => fill.moveDrawer(i, hw, section, index, yMm));
}

/** The clear openings under and over an element of the fill to its neighbours, mm (FINDINGS 1136), or null. */
export function fillClearances(i: WardrobeInput, hw: HardwareCatalogs, section: number, elementId: string): { belowMm: number; aboveMm: number } | null {
  try {
    return fill.fillClearances(i, hw, section, elementId);
  } catch {
    return null;
  }
}

export type FillPanel = fill.FillPanel;

/** The sizes the panel of an element of the fill shows for a section (FINDINGS 1136); null when the section is not built. */
export function fillPanelOf(i: WardrobeInput, hw: HardwareCatalogs, section: number): FillPanel | null {
  try {
    return fill.fillPanelOf(i, hw, section);
  } catch {
    return null;
  }
}

/** The front setback or the depth of a shelf, its rear kept (FINDINGS 1136; r1 fiEditOne). */
export function setShelfDepth(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, value: { frontMm?: number; depthMm?: number }): EditResult {
  return fillEdit(() => fill.setShelfDepth(i, hw, section, index, value));
}

/** The depth of the axis of a rod from the front edge (FINDINGS 1137; r1 `depthAxis`). */
export function setRodDepth(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, depthAxisMm: number): EditResult {
  return fillEdit(() => fill.setRodDepth(i, hw, section, index, depthAxisMm));
}

/** Internal or external drawer (FINDINGS 1138; WR-30 behind a door). */
export function setDrawerExecution(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, execution: 'internal' | 'external'): EditResult {
  return fillEdit(() => fill.setDrawerExecution(i, hw, section, index, execution));
}

/** The height of the box of a drawer, 80–320 mm (FINDINGS 1138). */
export function setDrawerBoxHeight(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, heightMm: number): EditResult {
  return fillEdit(() => fill.setDrawerBoxHeight(i, hw, section, index, heightMm));
}

/** The gap over a drawer; the drawers over it move by the change (FINDINGS 1138). */
export function setDrawerGap(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, gapMm: number): EditResult {
  return fillEdit(() => fill.setDrawerGap(i, hw, section, index, gapMm));
}

/** «Добавить ящик сверху» over the top drawer (FINDINGS 1139). */
export function addDrawerAbove(i: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): EditResult {
  return fillEdit(() => fill.addDrawerAbove(i, hw, section, index));
}

/** «Дублировать» a shelf, a rod or the top drawer (FINDINGS 1139). */
export function duplicateFill(i: WardrobeInput, hw: HardwareCatalogs, section: number, kind: 'shelf' | 'rod' | 'drawer', index: number): EditResult {
  return fillEdit(() => fill.duplicateFill(i, hw, section, kind, index));
}

/** «Распределить полки» (U2): equal clear openings in each span of the section on the grid of System 32. */
export function distributeShelves(i: WardrobeInput, hw: HardwareCatalogs, section: number): EditResult {
  return fillEdit(() => fill.distributeShelves(i, hw, section));
}

// ---------------------------------------------------------------- the sliding wardrobe (task U3 on W9)

/** «Тип изделия» of the prototype (swProduct, r1.html:61578): a swing wardrobe or a sliding one. */
export type ProductChoice = 'swing' | 'sliding';

/** The systems of the doors as the prototype offers them (swMultiUi, r1.html:63627). */
export const SLIDING_SYSTEM_CHOICES: readonly [string, string][] = [
  ['eco', 'ЭКО C · AE0704'],
  ['slim', 'Slim · AV0991'],
  ['standard', 'Standard C · AS0731'],
];
/** The control material of the prototype's insert (r1.html:63627): Lamarty Белый 10 P, priced by its snapshot. */
export const SLIDING_INSERT_REFERENCE = 'lamarty-white10-reference';

/**
 * The insert of the leaves of a sliding wardrobe as the editor shows it (MOD-DEC-573, 140; FINDINGS 1615):
 * `material` — 'CARCASS' (the decor of the carcass), a material of the catalogue of the facades the insert can take
 * (ЛДСП, ЛМДФ), the control material of the prototype, or 'LEGACY' (a ready-made door of the prototype's record: the
 * insert takes its decor). The insert is 10 mm whatever the material (140).
 */
export interface SlidingInsertSummary {
  material: string;
  decorId: string | null;
  thicknessMm: number;
}

export function slidingInsertOf(i: WardrobeInput): SlidingInsertSummary {
  // MOD-AI-30, 70: a pane of glass or mirror in every leaf of the doors (FINDINGS 2957).
  const glass = glassOf((i.state.slidingWardrobe as Record<string, JsonValue> | undefined)?.glass);
  if (glass) return { material: glass.id, decorId: null, thicknessMm: slidingDoors.constants.glassInsertThickness.value };
  const c = facadeChoiceOf(i),
    legacy = c ? null : facadeMaterial(i).decorId,
    reference = (i.state.slidingWardrobe as Record<string, JsonValue> | undefined)?.material === SLIDING_INSERT_REFERENCE,
    thicknessMm = slidingDoors.constants.insertThickness.value;
  if (c && !c.purchased) return { material: c.materialId, decorId: c.decorId, thicknessMm };
  if (reference) return { material: SLIDING_INSERT_REFERENCE, decorId: null, thicknessMm };
  return legacy ? { material: 'LEGACY', decorId: legacy, thicknessMm } : { material: 'CARCASS', decorId: null, thicknessMm };
}

/** The glass and mirror an insert can be (MOD-AI-30, 70; FINDINGS 2957): id and title, 4 mm, bought cut to size. */
export const SLIDING_GLASS_CHOICES: readonly [string, string][] = slidingDoors.constants.glassInserts.value.map((g) => [g.id, `${g.title} ${slidingDoors.constants.glassInsertThickness.value} мм`]);

/** The note of the editor under the inserts of glass (MOD-AI-30, 70): how the pane is made, priced and how large it can be. */
export const SLIDING_GLASS_NOTE = (() => {
  const C = slidingDoors.constants,
    lim = C.glassLimits.value;
  return `Стекло и зеркало ${C.glassInsertThickness.value} мм — в размер у стекольщика, на ${C.glassInsertDeduction.value} мм меньше вставки ЛДСП, в резиновом уплотнителе, с травмобезопасной плёнкой (ARISTO). Цена стекла условная, по ценам стекольных мастерских; вставка не больше ${fmt(lim.widthMax)} × ${fmt(lim.heightMax)} мм.`;
})();

/** What the accepted choice of a glass says: the pane, its film, its price and, for a print, the picture. */
const glassNotice = (id: string): string => {
  const g = glassOf(id)!;
  return `${g.title} ${slidingDoors.constants.glassInsertThickness.value} мм: в размер у стекольщика, с травмобезопасной плёнкой; цена стекла условная, по ценам стекольных мастерских.${g.look === 'PRINT' ? ' Изображение для печати согласуется с изготовителем.' : ''}`;
};

/**
 * Why the panes of glass of a sliding input do not fit (MOD-AI-30, 70): larger than ARISTO makes a pane of glass or
 * mirror 4 mm (1300 × 3000 mm). null — they fit, or the doors have no glass.
 */
function glassProblem(i: WardrobeInput, hw: HardwareCatalogs): string | null {
  const g = carcassModel(i, hw).sliding?.calc?.glass,
    lim = slidingDoors.constants.glassLimits.value;
  if (!g || (g.width <= lim.widthMax && g.height <= lim.heightMax)) return null;
  return `Стекло вставки ${fmt(g.width)} × ${fmt(g.height)} мм больше, чем ARISTO делает стекло и зеркало 4 мм (${fmt(lim.widthMax)} × ${fmt(lim.heightMax)} мм): возьмите больше створок или вставку ЛДСП. Проект не изменён.`;
}

/** The materials of the catalogue of the facades an insert of a leaf can take (573, ARISTO с. 50, 69): those made in the order from a board. */
export function slidingInsertMaterials(hw: HardwareCatalogs): { id: string; title: string; decors: { id: string; title: string }[] }[] {
  return hw.facades.materials.filter((m) => m.supply === 'MANUFACTURE').map((m) => ({ id: m.id, title: m.title, decors: m.decors === null ? facadeDecorChoices(hw) : facadeColorDecors(m, hw) }));
}

/**
 * The insert of the leaves (MOD-DEC-573, 140; FINDINGS 1615–1617): «материал → исполнение → цвет» of the catalogue.
 * 'CARCASS' — in the decor of the carcass (the choice of the material of the facades goes); the control material of
 * the prototype; a material of the facades made from a board (ЛДСП, ЛМДФ) with a decor of it — the choice of the
 * material of the facades of the wardrobe, which the insert takes (573), with the execution of the thickness of the
 * carcass when the material has one, so that the fronts of the drawers inside keep their thickness. The insert itself
 * is always 10 mm (140).
 */
export function setSlidingInsert(i: WardrobeInput, hw: HardwareCatalogs, choice: { material: string; decorId?: string | null }): EditResult {
  if (!isSlidingInput(i)) return { ok: false, problem: 'Вставки створок — у шкафа-купе: выберите «Тип изделия: Шкаф-купе»' };
  const now = slidingInsertOf(i),
    keepCarcass = (x: WardrobeInput): EditResult => (facadeChoiceOf(x) || facadeMaterial(x).decorId ? setFacadeMaterial(x, hw, { decorId: null }) : { ok: true, input: clone(x) }),
    set = (r: EditResult, material: string, notice: string): EditResult => {
      if (!r.ok) return r;
      const cfg: Record<string, JsonValue> = { ...((r.input.state.slidingWardrobe ?? {}) as Record<string, JsonValue>), material };
      delete cfg.glass;
      r.input.state.slidingWardrobe = cfg;
      return { ok: true, input: r.input, notice };
    };
  // MOD-AI-30, 70: glass or mirror in the leaves; the material of the facades of the wardrobe stays as it is.
  if (glassOf(choice.material)) {
    const o = clone(i);
    o.state.slidingWardrobe = { ...((o.state.slidingWardrobe ?? {}) as Record<string, JsonValue>), glass: choice.material };
    const problem = glassProblem(o, hw);
    return problem ? { ok: false, problem } : { ok: true, input: o, notice: `Вставки створок — ${glassNotice(choice.material)}` };
  }
  if (choice.material === 'CARCASS') return set(keepCarcass(i), 'current', 'Вставки створок — ЛДСП 10 мм в декоре корпуса.');
  if (choice.material === SLIDING_INSERT_REFERENCE) {
    // The sheets of the inserts take one rate (512): the leaves of their own material of the catalogue go back to the
    // doors, so that no sheet of ЛДСП is priced by the snapshot of Lamarty (FINDINGS 1620).
    const own = slidingLeafInserts(i).filter((x) => x.material !== 'DOORS' && x.material !== 'LEGACY'),
      r = keepCarcass(i);
    if (r.ok && own.length) {
      const cfg = r.input.state.slidingWardrobe as Record<string, JsonValue>,
        local = { ...((cfg.leafMaterials ?? {}) as Record<string, JsonValue>) };
      for (const x of own) delete local[x.leafId];
      cfg.leafMaterials = local;
    }
    return set(r, SLIDING_INSERT_REFERENCE, 'Вставки створок — Lamarty Белый 10 P, контрольный материал прототипа.' + (own.length ? ' Свой материал створок сброшен: у контрольного материала его нет.' : ''));
  }
  const m = facadeMaterialOf(hw.facades, choice.material);
  if (!m) return { ok: false, problem: `Материала ${choice.material} нет в каталоге материалов фасадов. Проект не изменён.` };
  if (m.supply !== 'MANUFACTURE')
    return { ok: false, problem: `${m.title} во вставку купе не применяется: ARISTO не допускает в полотне МДФ и покрытия, склонные к выгибанию. Во вставках — ЛДСП или ЛМДФ. Проект не изменён.` };
  const t = Number(i.controls.thickness),
    executionId = (m.executions.find((e) => e.thicknessMm === t || e.thicknessMm === 'BOARD') ?? m.executions[0]!).id,
    r = setFacadeChoice(i, hw, { materialId: m.id, executionId, ...(choice.decorId !== undefined ? { decorId: choice.decorId } : now.material === m.id ? { decorId: now.decorId } : {}) });
  if (!r.ok) return r;
  const d = facadeChoiceOf(r.input)!.decorId,
    label = d ? String(mfLabel(d, hw.materials)) : '';
  return set(r, 'current', `Вставки створок — ${m.title} ${slidingDoors.constants.insertThickness.value} мм, ${label}.${m.boardPrice === 'UNKNOWN' ? ' Цены плиты в каталоге нет — цена вставок не определена.' : ''}`);
}

/**
 * The insert of one leaf as the editor shows it (FINDINGS 1618): 'DOORS' — as the doors (the choice above); a material
 * of the catalogue of the facades made from a board (ЛДСП, ЛМДФ) with its decor; 'LEGACY' — a record of the prototype
 * (r1.html:85979: the control material or a decor without a material), shown as it is until another choice.
 */
export interface SlidingLeafInsert {
  leafId: string;
  material: string;
  decorId: string | null;
}

export function slidingLeafInserts(i: WardrobeInput): SlidingLeafInsert[] {
  const c = (i.state.slidingWardrobe ?? {}) as Record<string, any>,
    ids: string[] = Array.isArray(c.leafIds) ? c.leafIds.slice(0, typeof c.n === 'number' ? c.n : 0) : [],
    local: Record<string, any> = c.leafMaterials ?? {};
  return ids.map((leafId) => {
    const x = local[leafId];
    if (!x) return { leafId, material: 'DOORS', decorId: null };
    if (typeof x.glass === 'string') return { leafId, material: x.glass, decorId: null };
    return typeof x.materialId === 'string' ? { leafId, material: x.materialId, decorId: x.decorId ?? null } : { leafId, material: 'LEGACY', decorId: x.decorId ?? null };
  });
}

/**
 * The insert of one leaf (MOD-DEC-573, 140; FINDINGS 1618–1620): 'DOORS' — as the doors; a material of the catalogue
 * of the facades made from a board (ЛДСП, ЛМДФ) with a decor of it (the one asked, the one the leaf had, the decor of
 * the doors, else the first). The record is the prototype's `leafMaterials[leafId]` (r1.html:85979) with the material of
 * the catalogue beside its decor; the neighbouring leaves do not change. The insert is 10 mm (140).
 */
export function setSlidingLeafInsert(i: WardrobeInput, hw: HardwareCatalogs, leafId: string, choice: { material: string; decorId?: string | null }): EditResult {
  if (!isSlidingInput(i)) return { ok: false, problem: 'Вставки створок — у шкафа-купе: выберите «Тип изделия: Шкаф-купе»' };
  const now = slidingLeafInserts(i).find((x) => x.leafId === leafId);
  if (!now) return { ok: false, problem: `Створки ${leafId} нет в дверях. Проект не изменён.` };
  const o = clone(i),
    cfg = { ...((o.state.slidingWardrobe ?? {}) as Record<string, JsonValue>) },
    local = { ...((cfg.leafMaterials ?? {}) as Record<string, JsonValue>) },
    n = slidingLeafInserts(i).findIndex((x) => x.leafId === leafId) + 1;
  if (choice.material === 'DOORS') {
    delete local[leafId];
    cfg.leafMaterials = local;
    o.state.slidingWardrobe = cfg;
    return { ok: true, input: o, notice: `Вставка створки ${n} — как у всех дверей. Соседние створки не изменены.` };
  }
  if (glassOf(choice.material)) {
    local[leafId] = { glass: choice.material };
    cfg.leafMaterials = local;
    o.state.slidingWardrobe = cfg;
    const problem = glassProblem(o, hw);
    return problem ? { ok: false, problem } : { ok: true, input: o, notice: `Вставка створки ${n} — ${glassNotice(choice.material)} Соседние створки не изменены.` };
  }
  const m = facadeMaterialOf(hw.facades, choice.material);
  if (!m) return { ok: false, problem: `Материала ${choice.material} нет в каталоге материалов фасадов. Проект не изменён.` };
  if (m.supply !== 'MANUFACTURE')
    return { ok: false, problem: `${m.title} во вставку купе не применяется: ARISTO не допускает в полотне МДФ и покрытия, склонные к выгибанию. Во вставках — ЛДСП или ЛМДФ. Проект не изменён.` };
  if (slidingInsertOf(i).material === SLIDING_INSERT_REFERENCE)
    return { ok: false, problem: 'У дверей контрольный материал Lamarty: свой материал створки — при вставках ЛДСП или ЛМДФ. Выберите материал вставок дверей. Проект не изменён.' };
  const allowed = (m.decors === null ? facadeDecorChoices(hw) : facadeColorDecors(m, hw)).map((d) => d.id),
    doors = slidingInsertOf(i).decorId,
    decorId = choice.decorId !== undefined ? choice.decorId : ([now.material === m.id ? now.decorId : null, doors].find((x) => x && allowed.includes(x)) ?? allowed[0] ?? null);
  if (!decorId || !allowed.includes(decorId)) return { ok: false, problem: `Декор ${decorId ?? '—'} не входит в цвета материала «${m.title}». Проект не изменён.` };
  local[leafId] = { material: 'current', decorId, materialId: m.id };
  cfg.leafMaterials = local;
  o.state.slidingWardrobe = cfg;
  return {
    ok: true,
    input: o,
    notice: `Вставка створки ${n} — ${m.title} ${slidingDoors.constants.insertThickness.value} мм, ${String(mfLabel(decorId, hw.materials))}.${m.boardPrice === 'UNKNOWN' ? ' Цены плиты в каталоге нет — цена вставок не определена.' : ''} Соседние створки не изменены.`,
  };
}

/** The installation of Slim Line (dwSlimMount, r1.html:85224). */
export const SLIM_MOUNT_CHOICES = {
  upper: [
    ['VISIBLE', 'Видимый'],
    ['HIDDEN_CABINET', 'Скрытый в корпусе'],
    ['HIDDEN_OPENING', 'Скрытый в проёме'],
  ],
  lower: [
    ['surface', 'Накладной'],
    ['recessed', 'Врезной'],
  ],
  seal: [
    ['BRUSH', 'Щёточное'],
    ['PLUG', 'Заглушка'],
    ['POLY', 'Полиуретан'],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

/** Equal leaves of the doors (r1.html:63627: 2…5); 0 — a sliding wardrobe without doors yet (r1.html:85202). */
export const SLIDING_LEAVES = { min: 2, max: 5 } as const;

/** What the panel «Двери» changes: the fields of state.slidingWardrobe the prototype's controls write. */
export interface SlidingDoorsPatch {
  n?: number;
  system?: string;
  /** ALT — чередование; PAIR4 — парная, 4 створки (r1.html:85695). «Три дорожки» r1 нет: направляющие — на две дорожки (MOD-DEC-580). */
  scheme?: 'ALT' | 'PAIR4';
  mirror?: boolean;
  openingMode?: 'auto' | 'custom';
  W?: number;
  H?: number;
  material?: string;
  slimUpperMount?: string;
  slimLowerMount?: string;
  slimSeal?: string;
  /** The colour of the profiles: the code of ARISTO (`slidingDoors.profileFinishes`, MOD-AI-24); none — silver matt. */
  profileFinish?: string;
}

export interface SlidingSummary {
  product: ProductChoice;
  /** Leaves; 0 — no doors yet. */
  doors: number;
  system: string;
  scheme: string;
  mirror: boolean;
  openingMode: 'auto' | 'custom';
  /** The custom opening, mm; null — by the panels of the carcass. */
  W: number | null;
  H: number | null;
  material: string;
  slimUpperMount: string;
  slimLowerMount: string;
  slimSeal: string;
  /** The code of the colour of the profiles (MOD-AI-24). */
  profileFinish: string;
}

const isSlidingInput = (i: WardrobeInput) => i.domain === 'sliding';

/** What the editor shows of the doors of a sliding wardrobe; defaults as the prototype reads them (swCommit, r1.html:63387). */
export function slidingSummary(i: WardrobeInput): SlidingSummary {
  const c = (i.state.slidingWardrobe ?? {}) as Record<string, JsonValue>,
    custom = c.openingMode === 'custom';
  return {
    product: isSlidingInput(i) ? 'sliding' : 'swing',
    doors: typeof c.n === 'number' ? c.n : 0,
    system: typeof c.system === 'string' ? c.system : 'eco',
    scheme: typeof c.scheme === 'string' ? c.scheme : 'ALT',
    mirror: c.mirror === true,
    openingMode: custom ? 'custom' : 'auto',
    W: custom && typeof c.W === 'number' ? c.W : null,
    H: custom && typeof c.H === 'number' ? c.H : null,
    material: typeof c.material === 'string' ? c.material : 'current',
    slimUpperMount: typeof c.slimUpperMount === 'string' ? c.slimUpperMount : 'VISIBLE',
    slimLowerMount: typeof c.slimLowerMount === 'string' ? c.slimLowerMount : 'surface',
    slimSeal: typeof c.slimSeal === 'string' ? (c.slimSeal === 'POLYURETHANE' ? 'POLY' : c.slimSeal) : 'BRUSH',
    profileFinish: typeof c.profileFinish === 'string' ? c.profileFinish : slidingDoors.constants.profileFinishes.value[0].code,
  };
}

/**
 * The colours of the profiles a system of the editor has (MOD-AI-24, FINDINGS 2956): silver matt, and the colours the
 * site of ARISTO sells every profile and guide of its kit in. By the kit of the doors when they are built (Slim Line
 * changes its guides with the mounting), by the articles of the system otherwise.
 */
export function slidingFinishChoices(i: WardrobeInput, hw: HardwareCatalogs, system?: string): [string, string][] {
  const id = system ?? slidingSummary(i).system,
    calc = isSlidingInput(i) ? carcassModel(i, hw).sliding?.calc : null,
    series = calc?.status === 'CANDIDATE' && calc.system === id ? finishSeries(calc.bom) : systemSeries(id);
  return finishesOf(series).map((f) => [f.code, f.title]);
}

/** The series of the profiles and guides of a system by its table (the kit of its default mounting). */
const systemSeries = (system: string): string[] => {
  const a = slidingSystem(system)?.articles;
  return a ? finishSeries((['vertical', 'upper_frame', 'lower_frame', 'upper_track', 'lower_track'] as const).map((role) => ({ role, geometryArticle: a[role] }))) : [];
};

/** The prototype's message of an accepted change of the doors (swCommit, r1.html:63429). */
export const SLIDING_DOORS_NOTICE = 'Расчётная схема дверей изменена. Наполнение сохранено; физический доступ требует проверки.';

/**
 * The doors of the sliding wardrobe, as the prototype commits them (swCommit with its layers, r1.html:63387, 84699,
 * 85695): the configuration of the project with the patch over it and stable ids of the leaves; a scheme of four
 * leaves falls back to «Чередование» when the number changes, «Три дорожки» of an old project — at any edit of the
 * doors (MOD-DEC-580). Refused with the words of the calculation when the
 * opening is outside the panels, the system does not give the leaves, or less than 100 mm stays behind the system.
 */
export function setSlidingDoors(i: WardrobeInput, hw: HardwareCatalogs, patch: SlidingDoorsPatch): EditResult {
  if (!isSlidingInput(i)) return { ok: false, problem: 'Двери-купе — у шкафа-купе: выберите «Тип изделия: Шкаф-купе»' };
  if (patch.n !== undefined && patch.n !== 0 && !(Number.isInteger(patch.n) && patch.n >= SLIDING_LEAVES.min && patch.n <= SLIDING_LEAVES.max)) return { ok: false, problem: `Число створок: от ${SLIDING_LEAVES.min} до ${SLIDING_LEAVES.max}` };
  // The opening is in whole millimetres, as the other fields of the editor: 600,5 mm gave a track of «1197/2» mm and NaN in 3D (FINDINGS 1800).
  if ([patch.W, patch.H].some((v) => v !== undefined && !(Number.isInteger(v) && v > 0))) return { ok: false, problem: 'Проём: ширина и высота — целые миллиметры больше нуля. Проект не изменён.' };
  if (patch.profileFinish !== undefined && !profileFinishOf({ profileFinish: patch.profileFinish }))
    return { ok: false, problem: `Цвета профиля «${patch.profileFinish}» у дверей ARISTO нет: ${slidingDoors.constants.profileFinishes.value.map((f) => `${f.code} — ${f.title.toLowerCase()}`).join(', ')}. Проект не изменён.` };
  const o = clone(i),
    cfg = ensureLeafIds({ schema: 'MODULERO-SLIDING-1', active: false, manufacturer: 'ARISTO', system: 'eco', n: 2, scheme: 'ALT', mirror: false, openingMode: 'auto', material: 'current', ...(i.state.slidingWardrobe ?? {}), ...patch });
  if (cfg.scheme === 'TRIPLE4' || (patch.n !== undefined && cfg.n !== 4 && cfg.scheme === 'PAIR4')) cfg.scheme = 'ALT';
  o.state.slidingWardrobe = cfg as { [key: string]: JsonValue };
  const problem = slidingProblem(o, hw) ?? finishProblem(o, hw) ?? glassProblem(o, hw);
  if (problem) return { ok: false, problem: problem + slidingFits(o, hw) };
  // MOD-AI-51: doors outside the table of their system are built with a warning; the notice says which ones fit.
  const outside = leafOutside(o, hw),
    colour = patch.profileFinish !== undefined ? ` Цвет профиля — ${profileFinishOf(cfg)!.title.toLowerCase()}.` : '';
  return { ok: true, input: o, notice: (outside ? `${SLIDING_DOORS_NOTICE} ${outside}${slidingFits(o, hw)}` : SLIDING_DOORS_NOTICE) + colour };
}

/**
 * The colour of the profiles the doors cannot have (MOD-AI-24): a colour the site of ARISTO does not sell a profile or
 * a guide of the kit in — with the colours of the system and the systems that have this colour. null — the colour is
 * there, or the doors are not built (an unknown code is refused by setSlidingDoors before).
 */
function finishProblem(i: WardrobeInput, hw: HardwareCatalogs): string | null {
  const cfg = i.state.slidingWardrobe as Record<string, JsonValue> | undefined,
    finish = profileFinishOf(cfg),
    calc = carcassModel(i, hw).sliding?.calc;
  if (!finish || calc?.status !== 'CANDIDATE' || finishesOf(finishSeries(calc.bom)).includes(finish)) return null;
  const title = (id: string) => SLIDING_SYSTEM_CHOICES.find(([x]) => x === id)?.[1].split(' · ')[0] ?? id,
    missing = (calc.bom as Record<string, any>[]).filter((b) => b.priceStatus === 'PRICE_NOT_DETERMINED' && String(b.article).includes(`.${finish.code}.`)).map((b) => b.article),
    own = slidingFinishChoices(i, hw).map(([, t]) => t.toLowerCase()),
    others = SLIDING_SYSTEM_CHOICES.filter(([id]) => id !== calc.system && finishesOf(systemSeries(id)).includes(finish)).map(([id]) => title(id));
  return `${title(calc.system)} в цвете «${finish.title.toLowerCase()}» не собрать: у ARISTO нет ${[...new Set(missing)].join(', ')}. Цвета ${title(calc.system)} — ${own.join(', ')}${others.length ? `; ${finish.title.toLowerCase()} — у ${others.join(', ')}` : ''}. Проект не изменён.`;
}

/** Do the doors of a sliding input build inside the table of their system: the leaves, their size and mass, the depth behind (MOD-AI-51). */
function doorsFit(i: WardrobeInput, hw: HardwareCatalogs): boolean {
  if (slidingProblem(i, hw) || finishProblem(i, hw)) return false;
  const c = carcassModel(i, hw).sliding?.calc;
  return c?.applicability !== 'NO_FEASIBLE_SOLUTION' && c?.mass?.status !== 'EXCEEDS_LIMIT';
}

/** «Створок» or «створки» after a number of leaves. */
const leavesWord = (n: number) => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'створки' : 'створок');

/**
 * The doors that fit the opening of a sliding input (MOD-AI-51, FINDINGS 2953): per system of the editor the numbers
 * of equal leaves the table of ARISTO takes, the other settings of the doors kept; '' when the opening itself is not
 * there — then no number of leaves helps.
 */
function slidingFits(i: WardrobeInput, hw: HardwareCatalogs): string {
  const opening = carcassModel(i, hw).sliding?.opening;
  if (opening?.status !== 'VALID') return '';
  const cfg = i.state.slidingWardrobe as Record<string, JsonValue>,
    rows = SLIDING_SYSTEM_CHOICES.map(([system, title]) => {
      const ns: number[] = [];
      for (let n: number = SLIDING_LEAVES.min; n <= SLIDING_LEAVES.max; n++) {
        const x = clone(i);
        x.state.slidingWardrobe = { ...cfg, system, n, scheme: n === 4 && cfg.scheme === 'PAIR4' ? 'PAIR4' : 'ALT' };
        if (doorsFit(x, hw)) ns.push(n);
      }
      const span = ns.length > 1 && ns.at(-1)! - ns[0]! === ns.length - 1 ? `${ns[0]}–${ns.at(-1)}` : ns.join(', ');
      return ns.length ? `${title.split(' · ')[0]} — ${span} ${leavesWord(ns.at(-1)!)}` : null;
    }).filter((x) => x !== null);
  // A list of «нет» says nothing the refusal does not: then only the refusal.
  if (!rows.length) return '';
  const rest = rows.length < SLIDING_SYSTEM_CHOICES.length ? '; другие системы — нет' : '';
  return ` В проём ${fmt(Number(opening.W))} × ${fmt(Number(opening.H))} мм встают: ${rows.join('; ')}${rest}.`;
}

/** Why the built leaves are outside the table of their system (MOD-AI-51): the limit of ARISTO they break; null — inside. */
function leafOutside(i: WardrobeInput, hw: HardwareCatalogs): string | null {
  const c = carcassModel(i, hw).sliding?.calc;
  if (!c || (c.applicability !== 'NO_FEASIBLE_SOLUTION' && c.mass?.status !== 'EXCEEDS_LIMIT')) return null;
  const lim = slidingSystem(c.system)?.limits,
    w = Number(c.door_width),
    h = Number(c.door_height),
    title = SLIDING_SYSTEM_CHOICES.find(([id]) => id === c.system)?.[1].split(' · ')[0] ?? String(c.system),
    why = [
      ...(lim && w < lim.leafWidthMin ? [`уже ${lim.leafWidthMin} мм`] : []),
      ...(lim && w > lim.leafWidthMax ? [`шире ${lim.leafWidthMax} мм`] : []),
      ...(lim && h > lim.heightMax ? [`выше ${lim.heightMax} мм`] : []),
      ...(lim && h / w > lim.ratioMax ? [`высота больше ширины в ${fmt(Math.round((h / w) * 100) / 100)} раза при пределе ${lim.ratioMax}`] : []),
      ...(c.mass?.status === 'EXCEEDS_LIMIT' ? [`тяжелее ${c.mass.limit_kg} кг`] : []),
    ];
  return `Створка ${fmt(w)} × ${fmt(h)} мм вне таблицы ${title}${why.length ? `: ${why.join(', ')}` : ''} — двери построены с замечанием.`;
}

/** Why the doors of a sliding input are not built (swCommit, r1.html:63403), or null. */
function slidingProblem(i: WardrobeInput, hw: HardwareCatalogs): string | null {
  let s: Record<string, any>;
  try {
    s = carcassModel(i, hw).sliding;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  if (!s) return null;
  if (s.opening.status !== 'VALID') return (s.opening.errors ?? []).join(' ') || 'Проём не помещается в корпус';
  if (['INVALID', 'UNSUPPORTED_CONFIGURATION'].includes(s.calc.status)) return (s.calc.errors ?? []).join(' ') || 'Система не даёт створок для этого проёма';
  return typeof s.depth.Dusable === 'number' && s.depth.Dusable < 100 ? 'Не хватает полезной глубины за дверной системой.' : null;
}

/**
 * «Тип изделия» (swProduct, r1.html:61580): the sliding wardrobe keeps the carcass and the fill. The first switch
 * of a project (no doors configured yet) is the prototype's fresh one (r1.html:84700): no doors, the base «Нет», the
 * swing fronts off, the depth read as the depth of the sides (the depth of the carcass stays); a project that had
 * doors gets them back. The swing wardrobe keeps the doors of the sliding one in the project, inactive.
 */
export function setProduct(i: WardrobeInput, hw: HardwareCatalogs, product: ProductChoice): EditResult {
  if ((product === 'sliding') === isSlidingInput(i)) return { ok: true, input: i };
  const o = clone(i),
    cfg = (o.state.slidingWardrobe ?? null) as Record<string, JsonValue> | null;
  if (product === 'swing') {
    o.domain = 'wardrobe';
    o.state.slidingWardrobe = { ...cfg!, active: false };
    return { ok: true, input: o, notice: 'Тип изделия: распашной шкаф. Двери секций — на этапе «Фасады»; двери-купе сохранены в проекте.' };
  }
  o.domain = 'sliding';
  if (!cfg) {
    const D = carcassModel(i, hw).D as number;
    o.controls.baseSystem = 'none';
    for (const b of o.state.bodies) if (!b.parent) b.base = null;
    for (const s of o.state.sections) s.facade = 'none';
    o.state.doors = false;
    o.controls.depth = String(D);
    o.state.depthProfile = { ...o.state.depthProfile, overallMm: D, inputBasis: 'SIDE', status: 'NOMINAL' };
    o.state.slidingWardrobe = { schema: 'MODULERO-SLIDING-1', active: true, manufacturer: 'ARISTO', system: 'eco', n: 0, scheme: 'ALT', mirror: false, openingMode: 'auto', material: 'current' };
  } else o.state.slidingWardrobe = ensureLeafIds({ ...cfg, active: true }) as { [key: string]: JsonValue };
  const problem = slidingProblem(o, hw);
  return problem ? { ok: false, problem } : { ok: true, input: o, notice: 'Тип изделия: шкаф-купе. Корпус и наполнение сохранены; двери — на этапе «Двери».' };
}

// The rod, the handle and the leg of the project (task FIT, MOD-DEC-480).
export { drawerSystemOptions, fittingsChoice, fittingsOptions, litSections, projectSectionIds, setDrawerRunner, setDrawerSystem, setFittings, setLighting, setPushToOpen, setStorageColour, type DrawerSystemOption } from './fittings-edit.js';

/**
 * The parameters of the cutting map the user enters on «Детали → Раскрой» (R2-019, FINDINGS 1766): the kerf and the
 * trim of the workshop, per board a whole format and the grain. The project keeps them (`state.cutting`), and the
 * price cuts with them (MOD-DEC-505): the estimate and the map agree. An empty value is «не задано» — the default of
 * MOD-DEC-445, the format of the catalogue or of the estimate; a value out of `CUTTING_INPUT_LIMITS` is refused.
 */
export function setCutting(i: WardrobeInput, p: { kerfMm: number | null; trimMm: number | null; materials?: Readonly<Record<string, { sheetMm?: readonly [number | null, number | null] | null; respectGrain?: boolean }>> }): EditResult {
  const materials = Object.fromEntries(
      Object.entries(p.materials ?? {}).flatMap(([key, m]) => {
        const sheet = m.sheetMm && (m.sheetMm[0] !== null || m.sheetMm[1] !== null) ? { sheetMm: [m.sheetMm[0], m.sheetMm[1]] } : {},
          grain = m.respectGrain === undefined ? {} : { respectGrain: m.respectGrain },
          row = { ...sheet, ...grain };
        return Object.keys(row).length ? [[key, row]] : [];
      }),
    ),
    cutting: Record<string, JsonValue> = {
      ...(p.kerfMm === null ? {} : { kerfMm: p.kerfMm }),
      ...(p.trimMm === null ? {} : { trimMm: p.trimMm }),
      ...(Object.keys(materials).length ? { materials: materials as JsonValue } : {}),
    },
    why = cuttingParamsProblem(cutting);
  if (why) return { ok: false, problem: why };
  const o = clone(i);
  if (Object.keys(cutting).length) (o.state as Record<string, JsonValue>).cutting = cutting;
  else delete (o.state as Record<string, JsonValue>).cutting;
  return { ok: true, input: o };
}
