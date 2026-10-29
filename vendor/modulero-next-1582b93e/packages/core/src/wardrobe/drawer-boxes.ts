// Drawers of the swing wardrobe (task W7, MIGRATION_PLAN step 3.8): the part of the prototype's model() that builds
// them (the section loop r1.html:12051–12384) with their places in the product (u13Boxes r1.html:19318), in the same
// pass as the fill of the section (fill.ts) so the parts keep the prototype's order. The runner is the catalogue's
// BOYARD DB4501 given as an argument: a candidate, not a choice (WR-16, HOLD 032) — the graph says PLACEHOLDER.
// The interface of an engineering drawer (t3DB) never applies in r1: `drawerInterface` is not a key of the input.
//
// Departures from the prototype are fixes by decision (MOD-DEC-295), each with its FINDINGS item (390–399):
// an external drawer has a front wall of its own inside the box and its facade is a decorative facade in front of
// the carcass, screwed to that wall (WR-20, Handbook R7 §15.1; FINDINGS 392); a spacer at the side panel or the
// partition on the hinge side narrows the drawer behind a door that cannot open past its protrusion (331, 360;
// FINDINGS 393); the box of a drawer the rules placed moves by FE-04 when a hinge meets it (050; FINDINGS 391).
//
// W9: a drawer of a sliding wardrobe stands behind the door system, as the prototype's sliding layer put it
// (drawerSlideLength r1.html:59568, u13Boxes 59674): the runner is chosen over the depth less the system and the whole
// drawer moves back by it; the facade of an external drawer stands inside the section right in front of its box, set
// in from the panels as an inset door (362). The depth of the system is that of MOD-DEC-354, Standard included
// (FINDINGS 550).
import type { DrawerSlide, DrawerSlideCatalog } from '../catalog/hardware/drawer-slides.js';
import type { DrawerSystemCatalog } from '../catalog/hardware/drawer-systems.js';
import { ballRunnerKitHoles, buildableRunner, concealedBoxWalls, concealedRunner, drawerMovingMassKg, pickDrawerRunner, type RunnerInfo } from '../engine/drawer-runner.js';
import { drawerSystemSeriesOf, frontGrid, pickDrawerKit } from '../engine/policy/index.js';
import { drawerSlideSelection, selectDrawerSlide } from '../engine/policy/drawer-slide-selection.js';
import { HOME, homeRulesR5 } from '../engine/policy/home.js';
import { facadeChoice, facadePurchased } from '../engine/policy/facade-materials.js';
import { wardrobeDrawers } from '../engine/policy/wardrobe-drawers.js';
import { wardrobeFacades } from '../engine/policy/wardrobe-facades.js';
import type { PolicyState, Rec } from '../engine/policy/project-state.js';
import { buildConcealedDrawer } from './drawer-concealed.js';
import { buildKitDrawer, kitPanelOfBoundary, type KitPanel } from './drawer-kits.js';
import { drawerSlideLength, WARDROBE_DRAWER_SLIDE } from './drawers.js';
import type { FillSection } from './fill.js';
import { isSliding, systemDepth } from './sliding.js';
import { addDrawerConfirmatJoint, addFaceHole, addGroove, addPart, DRAWER_T, edges, GROOVE_BOTTOM, GROOVE_D, GROOVE_W } from './primitives.js';
import { clamp, CURRENT_PRODUCTION_PROFILE, HDF4_GROOVE_INTENT, WardrobeStandardPreset } from './standard.js';

const C = wardrobeDrawers.constants,
  EDGE = WardrobeStandardPreset.visibleEdgeBand;

/** Kinds of the parts of the drawers (W7): the box, the facade of an external drawer, the spacer. */
export const DRAWER_KINDS: ReadonlySet<string> = new Set(['drawerSide', 'drawerFront', 'drawerBack', 'drawerBottom', 'drawerFacadeStructural', 'drawerSpacer']);

/** A spacer of a section (MOD-DEC-331, 360): the side it stands on, its panel, thickness and why. */
export interface DrawerSpacer {
  side: 'left' | 'right';
  panel: string;
  thicknessMm: number;
  /** KNOWN — the protrusion of the hinge at the angle is in the catalogue; UNKNOWN — the default of 331. */
  status: 'KNOWN' | 'UNKNOWN';
  decision: 'MOD-DEC-331' | 'MOD-DEC-360';
  reason: string;
}

/** What the drawers of a section are built with besides the fill: the plan of FE-04 and of the spacers. */
export interface DrawerPlan {
  spacers: DrawerSpacer[];
  /** FE-04 move of the drawers the rules placed (050), mm; 0 — none. */
  shiftMm: number;
}

export interface DrawerOptions {
  /** The form gap: the gap of an external drawer (drawerGapAt). */
  gap: number;
  /** The facade gap profile: the seam between the facades of external drawers. */
  seamY: number;
  standardProfile: boolean;
  /** Facade regions of the sections (facadeRegions): the width of an external drawer's facade. */
  regions: Rec[];
  slide: DrawerSlide;
  /** The runners of the release: a new project takes the runner of its level (MOD-DEC-514, FINDINGS 1862). */
  slides: DrawerSlideCatalog;
  /** The assembled drawers of the release (MOD-DEC-544, R2-007): the kit of the series the project chose. */
  systems: DrawerSystemCatalog;
  plan: (index: number) => DrawerPlan;
}

/** A drawer as the graph sees it: its runner, the closed volume of runner and box, and how it was placed. */
export interface DrawerUnit {
  id: string;
  sectionId: string;
  moduleId: string;
  index: number;
  mode: 'internal' | 'external';
  slideId: string;
  slideLengthMm: number;
  clearanceMm: number;
  /** Closed volume of the box and its two runners in the prototype's axes (x across, y up, z from the front). */
  box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  /** The bottom of the drawer over the interior bottom, as the user or the rules put it. */
  bottomMm: number;
  /** STORED — the place is the user's (drawerPositions); RULES — placed by the rules, FE-04 may move it. */
  placement: 'STORED' | 'RULES';
  shiftMm: number;
  spacerIds: string[];
  partIds: string[];
  /** An assembled drawer of the catalogue (MOD-DEC-544): its kit, and what the catalogue does not give for its holes. */
  kit?: { seriesId: string; systemId: string; brand: string; article: string; nominalMm: number; missing: string[] };
  /** The series chosen did not fit this drawer: why it has its own box (MOD-DEC-544, (Д)). */
  kitNotTaken?: string;
  /**
   * The runner of the level of the hardware of a new project (MOD-DEC-514, FINDINGS 1862): its article, the box of
   * the BAZIS kit of a concealed runner, what the drawer weighs on it and what the pair holds, and the runner of the
   * level not taken (465). Absent — the runner of the prototype, DB4501, as a saved project has it.
   */
  runner?: DrawerUnitRunner;
}

/** drilled — a ball runner drilled by the holes of its BAZIS kit (FINDINGS 2746). */
export interface DrawerUnitRunner {
  article: string;
  concealed: boolean;
  massKg: number;
  loadKg: number;
  substitution: string | null;
  drilled?: boolean;
}

/** Clearance of the runner between the side panel and the box, mm: half the deduction of a ball runner's box width. */
export function slideClearance(slide: DrawerSlide): number {
  const w = slide.boxWidth.value;
  return w && w.kind === 'OUTER' ? w.deductionMm / 2 : WardrobeStandardPreset.drawerSlideSideClearance;
}

/** Height of the box of drawer `k` (drawerHeightAt r1.html:3964). */
export const drawerHeightAt = (cfg: Rec, k: number): number => Number(cfg.drawerHeights?.[k] ?? cfg.drawerBoxHeight ?? WardrobeStandardPreset.drawerBoxHeight);

/** Gap above drawer `k` (drawerGapAt r1.html:3967). */
export const drawerGapAt = (cfg: Rec, k: number, settings: Rec, gap: number): number => Number(cfg.drawerGaps?.[k] ?? (cfg.drawerMode === 'external' ? gap : settings.internalDrawerGap));

/** The drawers of a section are placed by the user: stored places of the expected count (manualBottoms r1.html:12077). */
export const storedDrawerPlaces = (cfg: Rec, n: number): boolean => Array.isArray(cfg.drawerPositions) && cfg.drawerPositions.length === n;

/** Count of drawers of a section (r1.html:12053). */
export const drawerCountOf = (cfg: Rec): number => (cfg.filling ? cfg.drawerCount : clamp(cfg.drawerCount, 1, C.maxDrawers.value));

/**
 * Bottoms of the drawers of a section over the interior bottom (r1.html:12063–12083): the stored places, else one over
 * the other from the base with their gaps, moved by FE-04 (`shiftMm`, only those the rules placed).
 */
export function drawerBottoms(cfg: Rec, settings: Rec, gap: number, system32Managed: boolean, shiftMm = 0): { bottoms: number[]; heights: number[]; gaps: number[]; stored: boolean; baseY: number } {
  const n = drawerCountOf(cfg),
    mode = cfg.drawerMode || 'internal',
    baseY = mode === 'external' ? gap : C.internalBottom.value,
    heights = Array.from({ length: n }, (_, k) => drawerHeightAt(cfg, k)),
    gaps = Array.from({ length: n }, (_, k) => drawerGapAt(cfg, k, settings, gap)),
    variable: number[] = [];
  for (let k = 0; k < n; k++) variable.push(k ? variable[k - 1]! + heights[k - 1]! + gaps[k - 1]! : baseY);
  const stored = storedDrawerPlaces(cfg, n),
    bottoms = (stored ? cfg.drawerPositions : variable.map((v) => v + shiftMm)).map((v: unknown) => (system32Managed ? Number(v) : Math.round(Number(v))));
  return { bottoms, heights, gaps, stored, baseY };
}

/**
 * The drawers of one section into the model: the parts of each box, their grooves and joints, the records of the
 * section (drawerYs, drawers, drawerSystem, the drawer block) and the spacers of the plan. Returns the top of the
 * stack over the interior bottom (drawerTop), from which the free height of the shelves and rods starts.
 */
export function buildDrawers(m: Rec, d: Rec, sec: FillSection, o: DrawerOptions, storageZones: readonly SpacerZone[] = [], rearMm: number = sec.module.geometry.depth): number {
  const policy = d as PolicyState,
    { cfg, data, module: mod } = sec,
    g = mod.geometry,
    settings = g.settings,
    D = g.depth,
    sid: string = data.id,
    clearOpeningWidth: number = data.clearOpeningWidth,
    clearStart: number = data.clearStart,
    world = (y: number) => g.interiorBottomY + y,
    // The depth gap of the facades (162): the decorative facade of an external drawer stands where a door stands.
    frontGap: number = settings.dimensions?.Gfront ?? frontGrid.constants.depthGap.value,
    plan = o.plan(sec.index),
    n = drawerCountOf(cfg),
    // W9: behind sliding doors the drawer starts at the system (FINDINGS 550); 0 for a swing wardrobe.
    sliding = isSliding(d),
    reserve = systemDepth(d),
    reveal = wardrobeFacades.constants.insetRevealMm.value;
  const clearance = slideClearance(o.slide),
    slideLen = drawerSlideLength(o.slide, cfg, D - reserve),
    // The article of the length in the catalogue: BOYARD DB4501Zn/550 as the prototype names it.
    article = `${o.slide.brand} ${o.slide.lengths.find((l) => l.nominalMm === slideLen)?.article ?? `${o.slide.article}/${slideLen}`}`,
    boxHeight = clamp(cfg.drawerBoxHeight || WardrobeStandardPreset.drawerBoxHeight, C.boxHeightMin.value, C.boxHeightMax.value),
    wallT = DRAWER_T,
    // MOD-DEC-573: the front of an external drawer is of the thickness of the execution of a material of the facades
    // (a material of the thickness of the board keeps the wall's, as without a choice).
    spec = facadeChoice(policy, wallT),
    frontT = spec && !spec.boardThickness ? spec.thicknessMm : wallT,
    mode = cfg.drawerMode || 'internal',
    spacerAt = (side: 'left' | 'right') => plan.spacers.find((s) => s.side === side)?.thicknessMm ?? 0,
    // MOD-DEC-331, 360: the runner stands on the spacer, the drawer is narrower by its thickness.
    spacers = spacerAt('left') + spacerAt('right'),
    drawerOuterW = clearOpeningWidth - spacers - 2 * clearance,
    betweenSides = drawerOuterW - 2 * wallT,
    // WR-20 (FINDINGS 392): an external drawer has its own front wall, its box is that of an internal one.
    internalDepth = slideLen - 2 * wallT,
    bottomW = betweenSides + 2 * GROOVE_D,
    bottomDepth = internalDepth + 2 * GROOVE_D,
    system32Managed = !!d.system32Policy,
    { bottoms, heights, gaps, stored, baseY } = drawerBottoms(cfg, settings, o.gap, system32Managed, plan.shiftMm),
    stackH = bottoms.length ? Math.max(...bottoms.map((v, k) => v + heights[k]!)) - Math.min(...bottoms) : 0,
    order = Array.from({ length: n }, (_, k) => k).sort((a, b) => bottoms[a]! - bottoms[b]!);
  for (let k = 0; k < order.length - 1; k++) {
    const lower = order[k]!,
      upper = order[k + 1]!;
    gaps[lower] = bottoms[upper]! - bottoms[lower]! - heights[lower]!;
  }
  const drawerTop = bottoms.length ? Math.max(...bottoms.map((v, k) => v + heights[k]!)) : baseY;
  data.drawerSystem = {
    model: article,
    engineeringR3: null,
    mode,
    slideLen,
    slideSelection: 'auto',
    standardStatus: 'HOLD_LEGACY_CANDIDATE',
    clearance,
    sourceClearOpeningWidth: clearOpeningWidth,
    outerWidth: drawerOuterW,
    innerWidth: betweenSides,
    boxHeight,
    boxHeights: heights,
    gapsAbove: gaps,
    coverGap: Number(cfg.drawerCoverClearance ?? settings.internalDrawerGap),
    wallT,
    stackH,
    top: drawerTop,
    bottomW,
    bottomDepth,
    internalDrawerGap: mode === 'internal' ? settings.internalDrawerGap : null,
    facadeGap: mode === 'external' ? o.seamY : null,
    bottomMode: WardrobeStandardPreset.drawerBottomMode,
    grooveIntent: HDF4_GROOVE_INTENT,
    grooveResolution: CURRENT_PRODUCTION_PROFILE.hdf4Groove,
    grooveW: GROOVE_W,
    grooveD: GROOVE_D,
    grooveBottom: GROOVE_BOTTOM,
  };
  const units: DrawerUnit[] = (m.drawerUnits ??= []),
    blockPartIds: string[] = [],
    // MOD-DEC-544 (R2-007): the assembled drawers of the series the project chose, or of its level of the hardware.
    series = drawerSystemSeriesOf(d.fittings?.drawerSystem, d.fillingTier),
    // MOD-DEC-514 (FINDINGS 1862): a new project takes the runner of its level of the hardware (466), the level not
    // chosen is «Стандарт» (223); a saved project keeps DB4501 of the prototype.
    level = d.fittings?.drawerRunner === 'level' && C.runnerRule.value === 'LEVEL_466',
    tier = d.fillingTier ?? drawerSlideSelection.constants.defaultTier.value,
    density = wardrobeFacades.constants.boardDensity.value,
    vol = (x: { ext: readonly number[] }) => x.ext[0]! * x.ext[1]! * x.ext[2]!,
    // MOD-DEC-484: a basket or a trouser rack of the section stands on the same spacer, over its own height.
    spacerIds = buildSpacers(m, d, sec, plan, [...bottoms.map((b, k) => ({ low: b, high: b + heights[k]!, lengthMm: slideLen })), ...storageZones], storageZones.length ? 'ящиков и корзин' : 'ящиков');
  bottoms.forEach((bottom, k) => {
    const execution = cfg.filling?.drawer?.[k]?.execution ?? cfg.drawerMode ?? 'internal',
      span = cfg.filling ? sec.spanEnd(cfg.filling.drawer?.[k]?.spanRight) : { end: data.clearEnd, index: sec.index },
      spanEnd = span.end,
      left = clearStart + spacerAt('left'),
      right = spanEnd - spacerAt('right'),
      outerW = right - left - 2 * clearance,
      between = outerW - 2 * wallT,
      bW = between + 2 * GROOVE_D,
      // W9: behind sliding doors the facade of an external drawer is set in the opening of its drawer by 2 mm (362).
      region = sliding
        ? { left: left + reveal, width: right - left - 2 * reveal }
        : spanEnd === data.clearEnd
          ? o.regions[sec.index]
          : { ...o.regions[sec.index], width: o.regions[sec.index].width + spanEnd - data.clearEnd },
      h = heights[k]!,
      newFront = execution === 'external' && o.standardProfile,
      // MOD-DEC-721: in a row without a door among the doors of the section the facade reaches only a neighbour with a
      // facade of its own — not an internal drawer behind the door of another row.
      facing = (j: number) => cfg.facade !== 'rows' || (cfg.filling?.drawer?.[j]?.execution ?? cfg.drawerMode ?? 'internal') === 'external',
      facadeBottom = newFront && k && facing(k - 1) ? (bottoms[k - 1]! + heights[k - 1]! + bottom) / 2 + o.seamY / 2 : bottom,
      facadeTop = newFront && k < n - 1 && facing(k + 1) ? (bottom + h + bottoms[k + 1]!) / 2 - o.seamY / 2 : bottom + h,
      facadeHeight = facadeTop - facadeBottom;
    if (facadeHeight <= 0) throw Error('Наружный фасад: недостаточная высота для шва ' + o.seamY + ' мм.');
    const drawerId = `${sid}-DRAWER${String(k + 1).padStart(2, '0')}`,
      leftId = `${drawerId}-SIDE-L`,
      rightId = `${drawerId}-SIDE-R`,
      frontId = `${drawerId}-FRONT`,
      facadeId = `${drawerId}-FACADE-STRUCTURAL`,
      backId = `${drawerId}-BACK`,
      bottomId = `${drawerId}-BOTTOM-HDF`,
      external = execution === 'external',
      partIds = [leftId, rightId, ...(external ? [facadeId] : []), frontId, backId, bottomId],
      // The closed box (u13Boxes): 28 mm behind the front edge of the carcass; an external one right behind its facade.
      // Behind sliding doors both start 28 mm behind the system, the facade of an external one in front of its box.
      x0 = left + clearance,
      x1 = right - clearance,
      y0 = world(bottom),
      y1 = y0 + h,
      z0 = sliding ? reserve + C.boxFrontInside.value : external ? -frontGap : C.boxFrontInside.value,
      z1 = z0 + slideLen,
      base = { drawerId, moduleId: mod.id, sectionId: sid };
    const addFacade = () => {
      if (!external) return;
      // WR-20: the facade of the drawer is a decorative facade in front of the carcass (its place like a door's, 162).
      const facade = addPart(
        m.parts,
        {
          id: facadeId,
          name: `${drawerId} — фасад ящика`,
          L: region.width,
          W: facadeHeight,
          T: frontT,
          q: 1,
          kind: 'drawerFacadeStructural',
          ...base,
          requiresHardwareConfirmation: true,
          edges: edges(EDGE, EDGE, EDGE, EDGE),
          facadeBox: { x0: region.left, x1: region.left + region.width, y0: world(facadeBottom), y1: world(facadeBottom) + facadeHeight, z0: sliding ? z0 - frontT : -(frontGap + frontT), z1: sliding ? z0 : -frontGap },
        },
        policy,
      );
      // Made in the order from the corpus board like a door unless a ready-made facade is chosen (MOD-DEC-347, FINDINGS 266).
      if (!facadePurchased(policy)) facade.supplyMode = 'MANUFACTURE';
    };
    // MOD-DEC-544 (R2-007, FINDINGS 1856): an assembled drawer of the catalogue when its series has a kit for this place;
    // the plane of its front is the inner face of the facade, or of the inner front behind a door (z0 + its thickness).
    const frontZ = external ? z0 : z0 + wallT,
      runnerZ = Math.max(frontZ, 0),
      kit = series ? pickDrawerKit(series, o.systems, { heightMm: h, depthMm: rearMm - runnerZ }) : null;
    // The panels the runners are screwed to: the side or the partition, or the spacer on it (331, 360).
    const spacerPanel = (side: 'left' | 'right'): KitPanel | null => {
        const p = (m.parts as Rec[]).find((x) => x.id === `${sid}-SPACER-${side === 'left' ? 'L' : 'R'}`);
        return p ? { panel: p.id, face: side === 'left' ? 'right' : 'left', baseY: p.worldBox.y0, baseZ: p.worldBox.z0 } : null;
      },
      panels = () => ({
        left: spacerPanel('left') ?? kitPanelOfBoundary(sec.left),
        right: spacerPanel('right') ?? kitPanelOfBoundary(span.index === sec.index ? sec.right : sec.rightOf(span.index)),
      });
    if (kit && !('reason' in kit)) {
      addFacade();
      const built = buildKitDrawer(m, d, {
          drawerId,
          moduleId: mod.id,
          sectionId: sid,
          kit,
          left,
          right,
          y0,
          heightMm: h,
          frontZ,
          runnerZ,
          facade: external ? { id: facadeId, left: region.left, top: world(facadeBottom) + facadeHeight } : null,
          innerFront: external ? null : { thicknessMm: wallT, revealMm: reveal },
          panels: panels(),
        }),
        ids = [...(external ? [facadeId] : []), ...built.partIds],
        name = `${kit.system.brand} ${kit.article.article}`;
      blockPartIds.push(...ids);
      m.connections.push({ id: `${drawerId}-C-SLIDE`, type: 'drawerSlide', drawerId, a: sid, b: drawerId, fastener: `${name} · сборный ящик (MOD-DEC-544)`, qty: 1, moduleId: mod.id, sectionId: sid });
      data.drawerYs.push(bottom);
      data.drawers.push({
        id: drawerId,
        index: k + 1,
        bottom,
        boxHeight: h,
        gapAbove: gaps[k],
        wallT,
        outerWidth: right - left,
        innerWidth: right - left - kit.system.back.widthDeductionMm.value!,
        depth: kit.length.nominalMm,
        engineeringR3: null,
        mode: execution,
        partIds: ids,
        facadeBottom,
        facadeHeight,
        facadeLeft: external ? region.left : left + reveal,
        facadeWidth: external ? region.width : right - left - 2 * reveal,
        requiresHardwareConfirmation: false,
        drawerKit: { seriesId: series!.id, systemId: kit.system.id, article: kit.article.article, nominalMm: kit.length.nominalMm },
      });
      units.push({
        id: drawerId,
        sectionId: sid,
        moduleId: mod.id,
        index: k,
        mode: external ? 'external' : 'internal',
        slideId: kit.system.id,
        slideLengthMm: kit.length.nominalMm,
        clearanceMm: 0,
        // From the inner front, as the own box: the hinge of the door must keep off it (FE-04; FINDINGS 1862).
        box: { x0: left, x1: right, y0, y1, z0, z1: frontZ + kit.length.nominalMm },
        bottomMm: bottom,
        placement: stored ? 'STORED' : 'RULES',
        shiftMm: stored ? 0 : plan.shiftMm,
        spacerIds,
        partIds: ids,
        kit: { seriesId: series!.id, systemId: kit.system.id, brand: kit.system.brand, article: kit.article.article, nominalMm: kit.length.nominalMm, missing: built.missing },
      });
      return;
    }
    // MOD-DEC-514 (FINDINGS 1862): the runner of the level by the selection of "other furniture" (engine/drawer-runner.ts):
    // the first a box is built on — DB4501 with the own box of the prototype, a concealed runner with the box of its kit —
    // that holds the drawer with its load: its front and box of the board (355), the reserve of the hardware and the
    // load of a drawer of r5 (574).
    const front = external ? region.width * facadeHeight * frontT : 0,
      innerFront = external ? null : { thicknessMm: wallT, revealMm: reveal },
      innerFrontVol = innerFront ? (right - left - 2 * reveal) * h * wallT : 0,
      massOf = (volumes: number[]) => drawerMovingMassKg(volumes, density, HOME.drawerHardwareReserveKg, homeRulesR5.constants.drawerLoadKg.value),
      need = { openingWidthMm: right - left, insideDepthMm: rearMm - runnerZ, boardMm: wallT, boxY: y0, boxTop: y1, frontMm: frontZ },
      own = o.slide.lengths.find((l) => l.nominalMm === slideLen),
      runner = level
        ? pickDrawerRunner<RunnerInfo | { loadKg: number; sku: string }>(
            selectDrawerSlide({ placement: external ? 'EXTERNAL' : 'INTERNAL', openingWidthMm: right - left, insideDepthMm: rearMm - runnerZ, boxSideThicknessMm: wallT }, o.slides, tier),
            o.slides.slides,
            tier,
            (s) => buildableRunner(s, WARDROBE_DRAWER_SLIDE),
            (s) => {
              if (s.kind !== 'CONCEALED') return { n: { loadKg: own?.loadKg.value ?? 0, sku: own?.article ?? s.article }, massKg: massOf([front, 2 * slideLen * h * wallT, 2 * between * h * wallT, bW * bottomDepth * HDF4_GROOVE_INTENT.nominalMaterialThicknessMm]) };
              const n = concealedRunner(s, need);
              return { n, massKg: massOf([front, innerFrontVol, ...concealedBoxWalls(n, left, wallT).map(vol)]) };
            },
          )
        : null,
      runnerRecord: DrawerUnitRunner | undefined = runner ? { article: runner.n.sku, concealed: 'concealed' in runner.n && !!runner.n.concealed, massKg: runner.massKg, loadKg: runner.n.loadKg, substitution: runner.substitution?.text ?? null } : undefined;
    if (runner && 'concealed' in runner.n && runner.n.concealed) {
      const n = runner.n;
      addFacade();
      const built = buildConcealedDrawer(m, d, { drawerId, moduleId: mod.id, sectionId: sid, slide: runner.slide, n, left, right, runnerZ, external, innerFront, boardMm: wallT, panels: panels() }),
        ids = [...(external ? [facadeId] : []), ...built];
      blockPartIds.push(...ids);
      m.connections.push({ id: `${drawerId}-C-SLIDE`, type: 'drawerSlide', drawerId, a: sid, b: drawerId, fastener: `${runner.slide.brand} ${n.sku} · по уровню фурнитуры (MOD-DEC-514) · короб набора БАЗИС`, qty: 1, moduleId: mod.id, sectionId: sid });
      data.drawerYs.push(bottom);
      data.drawers.push({
        id: drawerId,
        index: k + 1,
        bottom,
        boxHeight: h,
        gapAbove: gaps[k],
        wallT,
        outerWidth: n.boxW,
        innerWidth: n.boxW - 2 * wallT,
        depth: n.NL,
        engineeringR3: null,
        mode: execution,
        partIds: ids,
        facadeBottom,
        facadeHeight,
        facadeLeft: external ? region.left : left + reveal,
        facadeWidth: external ? region.width : right - left - 2 * reveal,
        requiresHardwareConfirmation: true,
        drawerRunner: { slideId: runner.slide.id, article: n.sku, nominalMm: n.NL },
      });
      units.push({
        id: drawerId,
        sectionId: sid,
        moduleId: mod.id,
        index: k,
        mode: external ? 'external' : 'internal',
        slideId: runner.slide.id,
        slideLengthMm: n.NL,
        clearanceMm: n.sideGap,
        // The closed volume of the runners and the box: from the side panel (or its spacer) to the other one, from the
        // inner front — the hinge of the door must keep off it too (FE-04; FINDINGS 1862).
        box: { x0: left, x1: right, y0, y1, z0, z1: frontZ + n.boxD },
        bottomMm: bottom,
        placement: stored ? 'STORED' : 'RULES',
        shiftMm: stored ? 0 : plan.shiftMm,
        spacerIds,
        partIds: ids,
        ...(kit ? { kitNotTaken: kit.reason } : {}),
        runner: runnerRecord,
      });
      return;
    }
    blockPartIds.push(...partIds);
    const side = (id: string, hand: 'left' | 'right', bx0: number) =>
      addPart(m.parts, { id, name: `${drawerId} — ${hand === 'left' ? 'левая' : 'правая'} боковина ящика`, L: slideLen, W: h, T: wallT, q: 1, kind: 'drawerSide', handedness: hand, ...base, edges: edges(), worldBox: { x0: bx0, x1: bx0 + wallT, y0, y1, z0, z1 } }, policy);
    side(leftId, 'left', x0);
    side(rightId, 'right', x1 - wallT);
    // FINDINGS 2746 (Д Директора): the ball runner of the level (DB4501 of «Эконом») is drilled by its BAZIS kit — the
    // runner from the front of the box sides, on its axis above their lower edge: two holes in the side panel (or its
    // spacer) and two in the outer face of each box side; the box stays the own box (574).
    const kitHoles = runner && !runnerRecord?.concealed ? ballRunnerKitHoles(runner.slide, slideLen) : null;
    if (kitHoles) {
      const name = `${runner!.slide.brand} ${runner!.n.sku}`,
        hole = (panel: string, face: string, x: number, yy: number, purpose: string) =>
          addFaceHole(m.holes, panel, face, x, yy, kitHoles.diameterMm, kitHoles.depthMm, `${purpose} ${name}`, `D${kitHoles.diameterMm}/L${kitHoles.depthMm}`, { machiningRole: 'RUNNER_SCREW', mechanismId: `${drawerId}-C-SLIDE`, catalogRef: kitHoles.holeRef, hingeStation: x });
      for (const panel of Object.values(panels()))
        for (const z of kitHoles.carcassFromFrontMm) hole(panel.panel, panel.face, y0 + kitHoles.axisAboveBoxMm - panel.baseY, z0 + z - panel.baseZ, 'Направляющая');
      for (const id of [leftId, rightId]) for (const x of kitHoles.boxFromFrontMm) hole(id, 'outside', x, h - kitHoles.axisAboveBoxMm, 'Направляющая');
      runnerRecord!.drilled = true;
    }
    addFacade();
    addPart(m.parts, { id: frontId, name: `${drawerId} — передняя стенка ящика`, L: between, W: h, T: wallT, q: 1, kind: 'drawerFront', ...base, edges: edges(EDGE, '', '', ''), worldBox: { x0: x0 + wallT, x1: x1 - wallT, y0, y1, z0, z1: z0 + wallT } }, policy);
    addPart(m.parts, { id: backId, name: `${drawerId} — задняя стенка ящика`, L: between, W: h, T: wallT, q: 1, kind: 'drawerBack', ...base, edges: edges(), worldBox: { x0: x0 + wallT, x1: x1 - wallT, y0, y1, z0: z1 - wallT, z1 } }, policy);
    const bottomT = HDF4_GROOVE_INTENT.nominalMaterialThicknessMm,
      by = y0 + GROOVE_BOTTOM + CURRENT_PRODUCTION_PROFILE.hdf4Groove.resolvedWidthMm / 2,
      bx = (outerW - bW) / 2,
      bz1 = z1 - (wallT - GROOVE_D);
    addPart(
      m.parts,
      {
        id: bottomId,
        name: `${drawerId} — дно ящика ХДФ в паз`,
        L: bW,
        W: bottomDepth,
        T: bottomT,
        q: 1,
        kind: 'drawerBottom',
        materialFamily: 'HDF',
        materialIntent: { materialFamily: 'HDF', nominalThicknessMm: bottomT, structuralRole: 'DRAWER_BOTTOM' },
        grooveIntent: HDF4_GROOVE_INTENT,
        ...base,
        bottomMode: WardrobeStandardPreset.drawerBottomMode,
        edges: edges(),
        worldBox: { x0: x0 + bx, x1: x1 - bx, y0: by - bottomT / 2, y1: by + bottomT / 2, z0: bz1 - bottomDepth, z1: bz1 },
      },
      policy,
    );
    const grooveY = h - (GROOVE_BOTTOM + GROOVE_W / 2),
      sideStart = wallT - GROOVE_D,
      sideEnd = slideLen - (wallT - GROOVE_D),
      grooveMeta = { drawerId, semanticType: HDF4_GROOVE_INTENT.semanticType, machiningIntent: HDF4_GROOVE_INTENT };
    for (const id of [leftId, rightId]) addGroove(m.grooves, id, 'inside', 'L', sideStart, sideEnd, grooveY, GROOVE_W, GROOVE_D, 'Паз под дно ХДФ', grooveMeta);
    for (const id of [frontId, backId]) addGroove(m.grooves, id, 'inside', 'L', 0, between, grooveY, GROOVE_W, GROOVE_D, 'Паз под дно ХДФ', grooveMeta);
    const joint = (id: string, sideId: string, wallId: string, sideX: number, wallEdge: string, name: string) =>
      addDrawerConfirmatJoint(m.holes, m.connections, { id: `${drawerId}-${id}`, drawerId, moduleId: mod.id, sectionId: sid, sideId, wallId, sideX, wallEdge, boxHeight: h, joint: name });
    joint('C-L-FRONT', leftId, frontId, wallT / 2, 'C', 'left-front');
    joint('C-R-FRONT', rightId, frontId, wallT / 2, 'D', 'right-front');
    if (external)
      m.connections.push({
        id: `${drawerId}-C-FACADE`,
        type: 'drawerFacadeFix',
        joint: 'facadeFix',
        drawerId,
        a: facadeId,
        b: frontId,
        fastener: 'Шурупы изнутри передней стенки ящика — число и места не заданы, требуется подтверждение',
        qty: 0,
        moduleId: mod.id,
        sectionId: sid,
        requiresHardwareConfirmation: true,
      });
    joint('C-L-REAR', leftId, backId, slideLen - wallT / 2, 'C', 'left-rear');
    joint('C-R-REAR', rightId, backId, slideLen - wallT / 2, 'D', 'right-rear');
    m.connections.push({
      id: `${drawerId}-C-BOTTOM`,
      type: 'drawerBottomGroove',
      drawerId,
      a: bottomId,
      b: `${leftId}/${rightId}/${frontId}/${backId}`,
      fastener: `GROOVE_FOR_HDF4 → текущий профиль ${GROOVE_W}×${GROOVE_D} мм`,
      machiningIntent: HDF4_GROOVE_INTENT,
      resolvedMachiningProfileId: CURRENT_PRODUCTION_PROFILE.id,
      productionConfirmed: CURRENT_PRODUCTION_PROFILE.hdf4Groove.productionConfirmed,
      requiresTechnologyConfirmation: CURRENT_PRODUCTION_PROFILE.hdf4Groove.requiresTechnologyConfirmation,
      qty: 1,
      moduleId: mod.id,
      sectionId: sid,
    });
    m.connections.push({
      id: `${drawerId}-C-SLIDE`,
      type: 'drawerSlide',
      drawerId,
      a: sid,
      b: drawerId,
      fastener: `${article} · подобрана автоматически · зазор ${clearance}±0,2 мм/сторона${kitHoles ? ' · присадка набора БАЗИС' : ''}`,
      qty: 1,
      moduleId: mod.id,
      sectionId: sid,
    });
    data.drawerYs.push(bottom);
    data.drawers.push({
      id: drawerId,
      index: k + 1,
      bottom,
      boxHeight: h,
      gapAbove: gaps[k],
      wallT,
      outerWidth: outerW,
      innerWidth: between,
      depth: slideLen,
      bottomW: bW,
      bottomDepth,
      engineeringR3: null,
      bottomPanelCenterOffsetMm: GROOVE_BOTTOM + CURRENT_PRODUCTION_PROFILE.hdf4Groove.resolvedWidthMm / 2,
      grooveIntent: HDF4_GROOVE_INTENT,
      grooveResolution: CURRENT_PRODUCTION_PROFILE.hdf4Groove,
      mode: execution,
      partIds,
      facadeBottom,
      facadeHeight,
      facadeLeft: external ? region.left : clearStart,
      facadeWidth: external ? region.width : between,
      requiresHardwareConfirmation: external,
    });
    units.push({
      id: drawerId,
      sectionId: sid,
      moduleId: mod.id,
      index: k,
      mode: external ? 'external' : 'internal',
      slideId: o.slide.id,
      slideLengthMm: slideLen,
      clearanceMm: clearance,
      // The closed volume of the runners and the box: from the side panel (or its spacer) to the other one.
      box: { x0: left, x1: right, y0, y1, z0, z1 },
      bottomMm: bottom,
      placement: stored ? 'STORED' : 'RULES',
      shiftMm: stored ? 0 : plan.shiftMm,
      spacerIds,
      partIds,
      ...(kit ? { kitNotTaken: kit.reason } : {}),
      ...(runnerRecord ? { runner: runnerRecord } : {}),
    });
  });
  data.interiorElements.push({ id: `${sid}-DRAWER-BLOCK`, type: mode === 'internal' ? 'internalDrawerBlock' : 'externalDrawerBlock', moduleId: mod.id, sectionId: sid, count: n, partIds: blockPartIds, drawerSystem: data.drawerSystem });
  return drawerTop;
}

/** A height of a section a spacer covers: from `low` to `high` over the interior bottom, `lengthMm` deep from its front. */
export interface SpacerZone {
  low: number;
  high: number;
  lengthMm: number;
}

/**
 * The spacers of a section (MOD-DEC-331, 360): a strip of the carcass board inside the side panel or the partition on
 * the hinge side, over the height of the drawers of the section — and of its baskets and trouser racks (484) — and the
 * length of the runner, screwed from inside; the runner stands on it. A separate part «проставка» in the outputs.
 * `what` names what it carries. Returns their ids.
 */
export function buildSpacers(m: Rec, d: Rec, sec: FillSection, plan: DrawerPlan, zones: readonly SpacerZone[], what: string): string[] {
  if (!plan.spacers.length || !zones.length) return [];
  const { data, module: mod } = sec,
    g = mod.geometry,
    sid: string = data.id,
    low = Math.min(...zones.map((z) => z.low)),
    high = Math.max(...zones.map((z) => z.high)),
    slideLen = Math.max(...zones.map((z) => z.lengthMm)),
    z0 = systemDepth(d) + C.boxFrontInside.value;
  return plan.spacers.map((s) => {
    const id = `${sid}-SPACER-${s.side === 'left' ? 'L' : 'R'}`,
      x0 = s.side === 'left' ? data.clearStart : data.clearEnd - s.thicknessMm;
    addPart(
      m.parts,
      {
        id,
        name: `${sid} — проставка ${s.decision === 'MOD-DEC-331' ? 'у стены' : 'на перегородке'} под направляющие ${what}`,
        L: high - low,
        W: slideLen,
        T: s.thicknessMm,
        q: 1,
        kind: 'drawerSpacer',
        handedness: s.side,
        moduleId: mod.id,
        sectionId: sid,
        spacer: { panel: s.panel, status: s.status, decision: s.decision, reason: s.reason },
        edges: edges(),
        worldBox: { x0, x1: x0 + s.thicknessMm, y0: g.interiorBottomY + low, y1: g.interiorBottomY + high, z0, z1: z0 + slideLen },
      },
      d as PolicyState,
    );
    m.connections.push({
      id: `${id}-C-FIX`,
      type: 'spacerFix',
      a: id,
      b: s.panel,
      fastener: 'Шурупы изнутри — число и шаг не заданы (MOD-DEC-331), требуется подтверждение',
      qty: 0,
      moduleId: mod.id,
      sectionId: sid,
      requiresHardwareConfirmation: true,
    });
    return id;
  });
}
