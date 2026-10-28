// Bodies of the swing wardrobe: automatic split of the width into bodies, the exact widths of the sections of a
// body and the grid of bodies with its clear openings, the construction domain 06a of the prototype r1
// (r1.html:11285–11535), MIGRATION_PLAN task W2. Pure functions: the state of the prototype is a parameter, and the
// functions that changed it in place (ckSync, ckDistribute) change the object they are given, as the prototype did.
// Layers folded in:
// - currentNominalGrid of file 00 (r1.html:4299) is replaced by 06a (r1.html:11471): the grid of bodies. Here it is
//   bodyNominalGrid; the synchronisation it started with (ckSync) is the caller's step, as in the graph generator.
// - nominalSectionWidthsExact: see front-grid.ts.
// Proof: reference/wardrobe-core/w2 (test/wardrobe.policyW2.test.ts) and tests/oracle/wardrobe-policy-w2.test.mjs.
import { WardrobeStandardPreset } from '../../wardrobe/standard.js';
import { exactDivideInteger, exactSum, exactToNumber, parseExactMm, recommendedModuleBreaksForWidths, rescaleExactWidths, sectionGrid, type ExactMm } from './front-grid.js';
import { constant, decision, prototype, type PolicyModule } from './types.js';

/**
 * Automatic bodies — MOD-DEC-322 (the owner's answer to N3; it replaces "n = ceil(W/2400) equal bodies" of
 * MOD-DEC-200, the logic of the prototype 0.13.64): bodies are cut only at the joints of the
 * existing sections, left to right, a body up to the 2400 mm guide; a change of the overall width keeps the number
 * of sections and scales their widths; sections and bodies are not added by themselves; a body that cannot be cut
 * (one section, or a section wider than the guide) stays one body with a non-blocking warning about long parts
 * (MOD-DEC-109, 049). The prototype r1 made ceil(W/2400) equal bodies and gave the new one a single section
 * (WR-15, FINDINGS 92, 98).
 */
export const carcass = {
  id: 'carcass',
  version: '3',
  constants: {
    mezzanineHeight: constant(400, 'mm', decision('MOD-DEC-200'), 'Антресоль — отдельный верхний корпус над выбранным, по умолчанию 400 мм в прежней общей высоте (нижний корпус уменьшается); ширина и глубина — как у выбранного (r1 ckMezzanine, r1.html:90333)'),
    autoBodyWidthGuide: constant(sectionGrid.constants.moduleWidthGuide.value, 'mm', decision('MOD-DEC-322'), 'Ориентир ширины корпуса: авторазбивка по стыкам секций, корпус ≤ 2400 мм; шире — предупреждение (322, заменяет «n равных корпусов» в 200)'),
    widthEpsilon: constant(1e-8, 'mm', prototype('r1 ckSync (r1.html:11370)', 'FINDINGS 90'), 'Сумма ширин корпусов равна ширине шкафа, если отличается не больше чем на 1e-8 мм'),
    exactWidthEpsilon: constant(1e-9, 'mm', prototype('r1 ckBodyWidthExact (r1.html:11351)', 'FINDINGS 90'), 'Сохранённая точная ширина корпуса действует, пока отличается от ширины меньше чем на 1e-9 мм'),
  },
} as const satisfies PolicyModule;

const WIDTH_EPS = carcass.constants.widthEpsilon.value;
const EXACT_EPS = carcass.constants.exactWidthEpsilon.value;

/** Panels of a body: an absent panel does not take its thickness from the opening. */
export interface BodyPanels {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
  back: boolean;
}

/** A body of the construction domain (state.bodies[]). */
export interface Body {
  id: string;
  width: number;
  widthExact?: ExactMm;
  height: number | null;
  depth: number | null;
  floor: number;
  panels: BodyPanels;
  base: unknown;
  back: unknown;
  /** An upper body (mezzanine, MOD-DEC-200) stands on its parent and has its width. */
  parent: string | null;
  [key: string]: unknown;
}

/** A section as the construction domain sees it. */
export interface BodySection {
  bodyId?: string;
  nominalMm?: ExactMm;
  physicalId?: string;
  [key: string]: unknown;
}

/** The part of the state the construction domain reads and changes. */
export interface ConstructionState {
  bodies: Body[];
  sections: BodySection[];
  construction: { schema: number; intent: string; nextBody: number; nextSection: number; [key: string]: unknown };
}

/** A new body with all five panels (r1.html:11285). */
export function ckNewBody(id: string, width: number): Body {
  return {
    id,
    width,
    height: null,
    depth: null,
    floor: 0,
    panels: { left: true, right: true, top: true, bottom: true, back: true },
    base: null,
    back: null,
    parent: null,
  };
}

/** A new empty section (r1.html:4438; the interface layer adds its own id, r1.html:17619). ckSync adds none. */
export function newSection(): BodySection {
  return {
    ratio: 1,
    content: 'empty',
    shelvesEnabled: false,
    shelfType: 'fixedShelf',
    rodCount: 0,
    drawersEnabled: false,
    shelfCount: 4,
    shelfLoadKg: 10,
    drawerCount: 3,
    drawerBoxHeight: WardrobeStandardPreset.drawerBoxHeight,
    drawerWallThickness: 16,
    drawerMode: 'internal',
    facade: 'none',
    hingeSide: 'left',
  };
}

/**
 * Adds the mezzanine of MOD-DEC-200 over the body `id`, in place (r1 ckMezzanine with ckAddSection, r1.html:90333,
 * 90205): an upper body of `mezzanineHeight` on its parent in the overall height `H` of the parent (the parent loses
 * that height), its width and depth, without a base, with one empty section; the layout becomes manual. The refusal
 * of the prototype — the parent is not higher than the mezzanine with two thicknesses — is returned as its text.
 */
export function ckMezzanine(d: ConstructionState, id: string, H: number, thickness: number, mezzanineHeight: number = carcass.constants.mezzanineHeight.value): { body: Body; section: BodySection } | string {
  const b = d.bodies.find((x) => x.id === id);
  if (!b) return `Нет корпуса ${id}`;
  const height = b.height ?? H;
  if (height <= mezzanineHeight + 2 * thickness) return 'Недостаточно высоты для антресоли.';
  const up = ckNewBody('B' + d.construction.nextBody++, b.width);
  // The exact width of the body goes with it: the prototype gave only the width in mm, and a body of a fractional
  // width (933⅓ mm after a proportional change) failed in ckDistribute (FINDINGS 702).
  if (b.widthExact) up.widthExact = b.widthExact;
  up.parent = b.id;
  up.height = mezzanineHeight;
  up.floor = (b.floor || 0) + height - mezzanineHeight;
  up.depth = b.depth;
  up.base = { kind: 'none', height: 0, setback: 0 };
  b.height = height - mezzanineHeight;
  d.bodies.push(up);
  const section = newSection();
  section.bodyId = up.id;
  section.physicalId = up.id + '-S' + d.construction.nextSection++;
  const last = d.sections.findLastIndex((x) => x.bodyId === up.id);
  d.sections.splice(last < 0 ? d.sections.length : last + 1, 0, section);
  ckDistribute(up, d);
  d.construction.intent = 'manual';
  return { body: up, section };
}

/** The exact width of a body: the stored one while it still equals the width, else the width itself (r1.html:11350). */
export function ckBodyWidthExact(b: { width: number; widthExact?: unknown }): ExactMm {
  return b.widthExact && Math.abs(exactToNumber(b.widthExact) - b.width) < EXACT_EPS ? (b.widthExact as ExactMm) : parseExactMm(String(b.width));
}

/** count whole widths that sum to total, the remainder by 1 to the first ones (r1.html:11360). The prototype's helper of
 * «добавить корпус» (r1.html:90323); the automatic layout no longer uses it (FINDINGS 98). */
export function ckBalanced(total: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0));
}

/** Equal exact widths for the sections of a body; changes them in d.sections (r1.html:11400). */
export function ckDistribute(b: { id: string; width: number; widthExact?: unknown }, d: { sections: BodySection[] }): void {
  const ss = d.sections.filter((s) => s.bodyId === b.id);
  if (!ss.length) return;
  const widths = rescaleExactWidths(
    ckBodyWidthExact(b),
    ss.map(() => parseExactMm('1')),
  );
  ss.forEach((s, i) => (s.nominalMm = widths[i]));
}

/**
 * Brings the bodies to the wardrobe width W, in place (r1.html:11365). Nothing changes while the bodies already add
 * up to W.
 * - Automatic layout (MOD-DEC-322, see `carcass`; FINDINGS 98): the sections of the bodies, left to
 *   right, keep their number and take W in proportion to their widths, exactly; the bodies are cut at the joints of
 *   the sections, each up to the 2400 mm guide. Bodies are reused from the left, missing ones are added on the right
 *   (ckNewBody), surplus ones removed from the right; an upper body over a removed one goes to the last body. No
 *   section is added. A body wider than the guide is reported by bodyWidthWarnings.
 * - Manual layout (MOD-DEC-199, 200, as the prototype): the exact widths of the bodies are scaled, then the sections
 *   of each body are made equal.
 * Upper bodies take the width of their parent. The prototype first migrated a state without the construction
 * domain (ckEnsure); that is the job of the project migration, here such a state is refused.
 */
export function ckSync(d: ConstructionState, W: number): void {
  if (!(d.construction?.schema === 1 && Array.isArray(d.bodies))) throw new Error('ckSync: the construction domain is not set up (ckEnsure)');
  const root = d.bodies.filter((b) => !b.parent),
    sum = root.reduce((n, b) => n + b.width, 0);
  if (Math.abs(sum - W) <= WIDTH_EPS) return;
  if (d.construction.intent === 'automatic') ckAutomaticLayout(d, root, W);
  else {
    const exact = rescaleExactWidths(parseExactMm(String(W)), root.map(ckBodyWidthExact));
    root.forEach((b, i) => {
      b.widthExact = exact[i];
      b.width = exactToNumber(exact[i]);
    });
    for (const b of root) ckDistribute(b, d);
  }
  for (const b of d.bodies.filter((b) => b.parent)) b.width = d.bodies.find((x) => x.id === b.parent)!.width;
}

/** Nominal widths of the sections of the root bodies, left to right: the stored exact width, else an equal share. */
function sectionWidths(d: ConstructionState, root: Body[]): { sections: BodySection[]; old: ExactMm[] } {
  const own = root.map((b) => d.sections.filter((s) => s.bodyId === b.id));
  return { sections: own.flat(), old: own.flatMap((ss, k) => ss.map((s) => s.nominalMm ?? exactDivideInteger(ckBodyWidthExact(root[k]!), ss.length))) };
}

/** The automatic layout of ckSync (MOD-DEC-322): the sections take W in proportion, the bodies are cut at their joints. */
function ckAutomaticLayout(d: ConstructionState, root: Body[], W: number): void {
  const { sections, old } = sectionWidths(d, root),
    exact = sections.length ? rescaleExactWidths(parseExactMm(String(W)), old) : [],
    breaks = recommendedModuleBreaksForWidths(exact.map(exactToNumber), carcass.constants.autoBodyWidthGuide.value),
    starts = [0, ...breaks];
  while (root.length < starts.length) {
    const b = ckNewBody('B' + d.construction.nextBody++, 0);
    root.push(b);
    d.bodies.push(b);
  }
  while (root.length > starts.length) {
    const b = root.pop()!,
      prev = root.at(-1)!;
    for (const u of d.bodies) if (u.parent === b.id) u.parent = prev.id;
    d.bodies = d.bodies.filter((x) => x !== b);
  }
  starts.forEach((start, k) => {
    const end = starts[k + 1] ?? sections.length,
      body = root[k]!;
    for (let i = start; i < end; i++) {
      sections[i]!.bodyId = body.id;
      sections[i]!.nominalMm = exact[i];
    }
    body.widthExact = sections.length ? exactSum(exact.slice(start, end)) : parseExactMm(String(W));
    body.width = exactToNumber(body.widthExact);
  });
}

/**
 * WR-02 (MOD-DEC-055, INV-F03; FINDINGS 350): the sections of every root body add up to its width. ckSync trusts a
 * state whose bodies already add up to W; the prototype's sliding wardrobe changed the width of its body without its
 * sections (the sections stayed at 1500 mm in a body of 2400), and the partitions went into the side. Such a state is
 * brought to the width as ckSync would have brought it from the old width: the automatic layout scales the sections
 * to W and cuts the bodies at their joints, the manual one makes the sections of each body equal. A consistent state
 * is not changed. Returns whether it changed the state.
 */
export function ckReconcileSections(d: ConstructionState, W: number): boolean {
  const root = d.bodies.filter((b) => !b.parent),
    off = root.some((b) => {
      const { old } = sectionWidths(d, [b]);
      return old.length > 0 && Math.abs(exactToNumber(exactSum(old)) - b.width) > WIDTH_EPS;
    });
  if (!off) return false;
  if (d.construction.intent === 'automatic') ckAutomaticLayout(d, root, W);
  else for (const b of root) ckDistribute(b, d);
  for (const b of d.bodies.filter((b) => b.parent)) b.width = d.bodies.find((x) => x.id === b.parent)!.width;
  return true;
}

/** A non-blocking problem: a body wider than the guide has long parts (roof, bottom, back). */
export interface BodyWidthWarning {
  code: 'BODY_WIDER_THAN_GUIDE';
  severity: 'warning';
  bodyId: string;
  widthMm: number;
  guideMm: number;
  message: string;
}

/**
 * Bodies wider than the 2400 mm guide (MOD-DEC-200: «превышение — предупреждение»; MOD-DEC-322: one
 * section or no joint to cut at — one body and a non-blocking warning about long parts in the problems bell,
 * MOD-DEC-109, 049).
 */
export function bodyWidthWarnings(bodies: readonly Body[]): BodyWidthWarning[] {
  const guide = carcass.constants.autoBodyWidthGuide.value;
  return bodies
    .filter((b) => !b.parent && b.width > guide + sectionGrid.constants.gridEpsilon.value)
    .map((b) => ({
      code: 'BODY_WIDER_THAN_GUIDE',
      severity: 'warning',
      bodyId: b.id,
      widthMm: b.width,
      guideMm: guide,
      message: `Корпус ${b.id} шириной ${b.width} мм шире ориентира ${guide} мм: длинные крыша, дно и задняя стенка. Разделите секцию или перенесите стык корпусов.`,
    }));
}

/** A module of the grid of bodies: the body with its geometry. */
export interface BodyModule<G> {
  id: string;
  index: number;
  start: number;
  end: number;
  externalWidth: number;
  sectionIndexes: number[];
  firstSection: number;
  lastSection: number;
  geometry: G;
  bodyId: string;
}

/** A section of the grid of bodies with its clear opening. */
export interface BodyGridSection<G> {
  index: number;
  moduleId: string;
  bodyId: string;
  localIndex: number;
  nominalWidth: number;
  clearOpeningWidth: number;
  nominalStart: number;
  nominalEnd: number;
  clearStart: number;
  clearEnd: number;
  geometry: G;
}

/**
 * Grid of bodies and clear openings (r1.html:11471, MOD-DEC-051): bodies stand left to right, an upper body over
 * its parent; in a body the first section loses t at the left panel, the last one t at the right panel (nothing
 * when the panel is absent), a divider t/2 on each side. A section without an exact width takes an equal share.
 * `geometryOf` is the vertical geometry of a body (ckBodyGeometry of 06a; its depth is task W1), attached as is.
 * Unlike computeNominalGrid, a negative opening is not cut to 0 (FINDINGS 96). An upper body over the first body is
 * placed at 0 — the prototype refused it (fixed, FINDINGS 96).
 */
export function bodyNominalGrid<G>(W: number, t: number, bodies: readonly Body[], sections: readonly BodySection[], geometryOf: (b: Body) => G) {
  let x = 0;
  const positions = new Map<string, number>(),
    modules: BodyModule<G>[] = [],
    grid: BodyGridSection<G>[] = [],
    widths: number[] = [],
    breaks: number[] = [];
  for (const b of bodies) {
    if (b.parent) {
      // The prototype tested `!p`, so an upper body over the first body (position 0) was refused as "not found":
      // no mezzanine over the leftmost or the only body, against MOD-DEC-200. Fixed by MOD-DEC-295: FINDINGS 96.
      const p = positions.get(b.parent);
      if (p === undefined) throw Error('Не найден нижний корпус');
      positions.set(b.id, p);
    } else {
      positions.set(b.id, x);
      x += b.width;
    }
    const start = positions.get(b.id)!,
      ss = sections.map((s, i) => [s, i] as const).filter(([s]) => s.bodyId === b.id),
      geo = geometryOf(b),
      mod: BodyModule<G> = {
        id: b.id,
        index: modules.length,
        start,
        end: start + b.width,
        externalWidth: b.width,
        sectionIndexes: ss.map(([, i]) => i),
        firstSection: ss[0]?.[1] ?? -1,
        lastSection: ss.at(-1)?.[1] ?? -1,
        geometry: geo,
        bodyId: b.id,
      };
    modules.push(mod);
    let sx = start;
    ss.forEach(([cfg, i], k) => {
      const w = cfg.nominalMm ? exactToNumber(cfg.nominalMm) : b.width / ss.length;
      const clearStart = sx + (k === 0 ? (b.panels.left ? t : 0) : t / 2),
        clearEnd = sx + w - (k === ss.length - 1 ? (b.panels.right ? t : 0) : t / 2);
      grid[i] = {
        index: i,
        moduleId: b.id,
        bodyId: b.id,
        localIndex: k,
        nominalWidth: w,
        clearOpeningWidth: clearEnd - clearStart,
        nominalStart: sx,
        nominalEnd: sx + w,
        clearStart,
        clearEnd,
        geometry: geo,
      };
      widths[i] = w;
      sx += w;
      if (k === 0 && i > 0) breaks.push(i);
    });
  }
  return {
    nominalSectionWidths: widths,
    clearSectionWidths: grid.map((s) => s.clearOpeningWidth),
    sections: grid,
    modules,
    breaks,
    externalWidth: W,
  };
}
