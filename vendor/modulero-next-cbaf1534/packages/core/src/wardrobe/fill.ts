// Fill of the swing wardrobe: shelves, clothes rods and local partitions (task W6, MIGRATION_PLAN step 3.7). The
// part of the prototype's model() that builds them (the section loop r1.html:12014–12536 and the deflection pass
// r1.html:12643), the filling of file 90 (fiModelSection r1.html:92745, fiSpanEnd 92873) and the shelf geometry of
// v18 (v17ApplyGeometry r1.html:54969), in one pass: the shelf is built once with its final size and place, and its
// holes come from that part (WR-26). The drawers of a section are built first, as in the prototype (drawer-boxes.ts,
// task W7); their top is where the free height of the shelves and rods starts (r1.html:12030–12080).
//
// Departures from the prototype are fixes by decision (MOD-DEC-295, 342), each with its FINDINGS item (270–279):
// the removable shelf is the clear opening − 2 mm in every project and stands on the shelf supports of the level of
// the project with spare levels ±32 mm (225, 193, 332, 344; FINDINGS 271, 272), without a back the shelves and the
// local partitions reach the wall (330; FINDINGS 273), a local partition follows its supports (234; FINDINGS 274),
// the holes of a fixed shelf in a partition are at the height of the shelf (FINDINGS 275), the label of the
// removable shelf is «съёмная» (223, TERM-078; FINDINGS 276).
// FIT, third PR (MOD-DEC-484): the baskets, trouser racks and pantographs of the section (storage.ts) — planned before
// its drawers, so that the spacers of its door cover them, and checked against its fill once that is built.
import { mfShelfDeflection } from '../engine/policy/materials.js';
import { facadeThickness } from '../engine/policy/facade-materials.js';
import type { PolicyState, Rec } from '../engine/policy/project-state.js';
import { narrowJointLayout } from '../engine/policy/joint-stations.js';
import { dpOwnOperations, dpPanelMissing } from '../engine/policy/optional-parts.js';
import { selectShelfSupport, shelfLowerAboveAxis, shelfSupportSelection, shelfSupportBodyColour, shelfSupportKit, shelfSupportScheme, type ShelfSupportDemand, type ShelfSupportScheme } from '../engine/policy/shelf-support-selection.js';
import { s32Q, snapSystem32 } from '../engine/policy/system32.js';
import { wardrobeFacades } from '../engine/policy/wardrobe-facades.js';
import { wardrobeFill } from '../engine/policy/wardrobe-fill.js';
import { sharedShelfRows } from '../engine/policy/wardrobe-fasteners.js';
import type { HardwareTier, ShelfSupportCatalog } from '../catalog/hardware/shelf-supports.js';
import type { FittingsCatalog } from '../catalog/hardware/fittings.js';
import type { MaterialCatalog } from '../catalog/materials.js';
import { buildDrawers, buildSpacers, type DrawerOptions } from './drawer-boxes.js';
import { fitVerticalPositions } from './drawers.js';
import { f7Input, f7LegacyOperation, grooveHit, intersects, bounds as operationBreaksPart } from './fasteners-r7.js';
import { addConfirmatBlindHole, addConfirmatThroughHole, addFaceHole, addNarrowJointDowels, addPart, edges } from './primitives.js';
import { isSliding, shelfFrontBehindSystem, systemDepth } from './sliding.js';
import { clamp, WardrobeStandardPreset } from './standard.js';
import { finishStorage, planStorage, storageSpacerZones } from './storage.js';

const pad2 = (n: number) => String(n).padStart(2, '0');
const C = wardrobeFill.constants,
  EDGE = WardrobeStandardPreset.visibleEdgeBand;

/**
 * Type of the shelf `index` of a section (shelfTypeAt r1.html:3961). The old keys stay readable: `adjustable_shelf`
 * of the r7 roles and `adjustableShelf` are the same removable shelf, `fixed_shelf` the fixed one (IR6-05).
 */
export function shelfTypeAt(cfg: Rec, index: number): 'fixedShelf' | 'adjustableShelf' {
  const t = cfg.shelfTypes?.[index] || cfg.shelfType || 'adjustableShelf';
  return t === 'fixedShelf' || t === 'fixed_shelf' ? 'fixedShelf' : 'adjustableShelf';
}

/** Defaults of a section's fill (ensureSectionConfig r1.html:4559; the drawer migration is W7). */
export function ensureSectionConfig(s: Rec): Rec {
  if (s.shelvesEnabled === undefined) s.shelvesEnabled = s.content === 'shelves';
  if (s.rodCount === undefined) s.rodCount = s.content === 'oneRod' ? 1 : s.content === 'twoRods' ? 2 : 0;
  if (s.drawersEnabled === undefined) s.drawersEnabled = s.content === 'drawers';
  if (!s.shelfType) s.shelfType = 'adjustableShelf';
  if (s.drawerWallThickness === undefined) s.drawerWallThickness = 16;
  if (s.drawerMode === undefined) s.drawerMode = 'internal';
  if (s.shelfCount === undefined) s.shelfCount = 1;
  if (s.shelfLoadKg === undefined) s.shelfLoadKg = C.payloadKg.value;
  if (s.shelvesEnabled) {
    if (!Array.isArray(s.shelfLoadsKg)) s.shelfLoadsKg = [];
    for (let i = 0; i < s.shelfCount; i++) if (s.shelfLoadsKg[i] === undefined) s.shelfLoadsKg[i] = s.shelfLoadKg;
  }
  return s;
}

/** Payload of the shelf `k`: the user's value, else 10 kg (MOD-DEC-289); an explicit value is never replaced. */
export const shelfLoadAt = (cfg: Rec, k: number): number => cfg.shelfLoadsKg?.[k] ?? cfg.shelfLoadKg ?? C.payloadKg.value;

/** A side or partition the fill of a section is fixed to: its part, the inner face, the elevation of its local x = 0. */
export interface Boundary {
  panel: string;
  face: string;
  /** Elevation of the panel's local x = 0 from the floor: the lower edge of a side or of a partition. */
  baseY: number;
}

/** Where a section reaches: its rules, the panels at its sides and the back of its body. */
export interface FillSection {
  index: number;
  cfg: Rec;
  data: Rec;
  module: Rec;
  left: Boundary;
  right: Boundary;
  /** Clear end of the section `spanRight` names (a shelf over a lowered partition, fiSpanEnd). */
  spanEnd: (id: string | undefined) => { end: number; index: number };
  /** Right panel of another section (spanRight). */
  rightOf: (index: number) => Boundary;
}

/** The panels at the sides of a section of a model: the sides of its body or the partitions (panelByBoundary). */
export function sectionSidePanels(m: Rec, s: Rec): [string, string] {
  const mod = m.modules.find((x: Rec) => x.id === s.moduleId),
    k = mod.sectionIndexes.indexOf(s.index),
    next = m.sectionsData[s.index + 1];
  return [k === 0 ? mod.panelIds.left : `${s.id}-DIVIDER01`, k === mod.sectionIndexes.length - 1 ? mod.panelIds.right : `${next.id}-DIVIDER01`];
}

/** Elements of the fill of a model that are not the carcass: what the graph and the goldens of W6 read. */
export const FILL_KINDS = new Set(['fixedShelf', 'adjustableShelf', 'drawerCoverShelf', 'localPartition']);

/**
 * The rear plane and the front of the shelf `k` (v18, r1.html:54994). With a back panel: at the inner face of the back
 * (BACK_INNER_FACE), the stored rear setback of the filling counted from the rear of the side. Without one (MOD-DEC-330,
 * FINDINGS 273): the wall is the back, so the rear plane is the rear of the sides minus only the user's own setback
 * from the back face; the front base stays. Behind an inset door (MOD-DEC-400) the front is at least the back face of
 * the door `doorT` behind the front edge plus the gap: the door closes; a shelf linked to the seam keeps its place.
 */
export function shelfDepthPlanes(row: Rec | undefined, cfg: Rec, k: number, g: Rec, hasBack: boolean, linked: boolean, d: Rec = {}, doorT = 0): { front: number; rearPlane: number; rearSetback: number } {
  const D = g.depth,
    // W9: in a sliding wardrobe the shelf over the drawers starts at the door system, every shelf behind it (sliding.ts).
    base = row?.front ?? (k === COVER_INDEX && isSliding(d) ? systemDepth(d) : (cfg.shelfDepths?.[k]?.front ?? C.frontSetback.value)),
    behindDoor = cfg.facadeMounting === 'INSET' ? wardrobeFacades.constants.insetSetbackMm.value + doorT + C.insetDoorShelfGap.value : 0,
    front = linked ? C.seamLinkedFront.value : Math.max(shelfFrontBehindSystem(base, d), behindDoor),
    backFace = backInnerFace(g),
    stored = row ? (row.rear ?? g.settings.shelfDepthReduction) : D - backFace;
  if (hasBack) return { front, rearPlane: row ? D - stored : backFace, rearSetback: row?.rear ?? 0 };
  const own = Math.max(0, stored - (D - backFace));
  return { front, rearPlane: D - own, rearSetback: own };
}

/** Inner face of the back of a body from the front: the rebate keeps it `rebateWidthMm` in front of the sides' rear. */
export function backInnerFace(g: Rec): number {
  return g.back?.mode === 'quarter' ? g.depth - g.back.rebateWidthMm : g.depth;
}

/**
 * Builds the fill of every section into the model: parts, holes, joints, rods and supports. `sections` are the
 * sections of the carcass with their panels; `d` the state, `m` the model in building.
 */
/** What the fill is built with besides the model: the form gap, the carcass decor (colour of the supports, 344) and the shelf supports of the hardware release (CAT-1). */
export interface FillOptions {
  gap: number;
  corpusDecorId: string | null;
  shelfSupports: ShelfSupportCatalog;
  /** The drawers of the sections (W7): built first in each section, as the prototype does. */
  drawers: DrawerOptions;
  /** The fittings of the release (MOD-DEC-484): the baskets, trouser racks and pantographs of the sections. */
  fittings: FittingsCatalog;
  /** The decors and boards of the release (MOD-DEC-577): the sag of a shelf of the chosen board. */
  materials: MaterialCatalog;
}

export function buildFill(m: Rec, d: Rec, sections: FillSection[], options: FillOptions): void {
  const policy = d as PolicyState,
    t: number = m.t,
    system32Managed = !!d.system32Policy,
    supports: PendingSupports[] = [];
  for (const sec of sections) {
    const { cfg, data, module: mod } = sec,
      g = mod.geometry,
      settings = g.settings,
      D = g.depth,
      innerH = g.innerH,
      shelfD = Math.max(C.minShelfDepth.value, D - settings.shelfDepthReduction),
      clearOpeningWidth: number = data.clearOpeningWidth,
      sid: string = data.id,
      // MOD-DEC-330: the back is gone when the body has none or the user removed it (dpCompose removes it later).
      hasBack = (d.bodies as Rec[] | undefined)?.find((b) => b.id === mod.bodyId)?.panels?.back !== false && !dpPanelMissing(mod, 'back', policy);
    ensureSectionConfig(cfg);
    data.shelfDeflection = cfg.shelvesEnabled ? mfShelfDeflection(clearOpeningWidth, shelfD, t, cfg.shelfLoadKg ?? C.payloadKg.value, policy, options.materials) : null;
    // MOD-DEC-484: the baskets, trouser racks and pantographs of the section, their item by the clear width less the
    // spacers of the door and the depth to the back; the spacers cover the drawers and the pull-outs alike.
    const spacerPlan = options.drawers.plan(sec.index),
      storage = planStorage(d, sec, options.fittings, spacerPlan, hasBack ? backInnerFace(g) : D),
      storageZones = storageSpacerZones(storage, g.interiorBottomY);
    // W7: the drawers of the section first (r1.html:12051): their top is where the free height starts.
    const drawerTop = cfg.drawersEnabled ? buildDrawers(m, d, sec, options.drawers, storageZones, hasBack ? backInnerFace(g) : D) : C.noDrawerTop.value,
      newProject = d.system32Policy?.provenance === 'NEW_PROJECT' || !!cfg.system32Pair;
    // The fixed shelf over the drawers (r1.html:12447): 32 mm over the top drawer in a new project (MOD-DEC-193), the
    // roof when it falls there, a fixed shelf of the fill at the same height when there is one.
    if (cfg.drawersEnabled && !cfg.filling?.cover?.removed && (cfg.drawerMode === 'internal' || newProject)) {
      const owner = cfg.filling?.cover?.ownerId,
        ownerIndex = cfg.filling?.drawer.findIndex((r: Rec) => r.id === owner) ?? -1,
        coverTop = ownerIndex >= 0 ? cfg.drawerPositions[ownerIndex] + cfg.drawerHeights[ownerIndex] : drawerTop,
        coverY = coverTop + (cfg.filling?.cover?.gap ?? (newProject ? C.coverGap.value : (cfg.drawerCoverClearance ?? settings.internalDrawerGap))) + t / 2,
        roof = newProject && Math.abs(coverY - t / 2 - innerH) < C.exact.value;
      if (roof || coverY + t / 2 <= innerH - (newProject ? 0 : C.coverBelowTop.value)) {
        const reuse = cfg.shelfPositions?.findIndex((y: number, k: number) => Math.abs(y - coverY) < C.exact.value && shelfTypeAt(cfg, k) === 'fixedShelf') ?? -1;
        Object.assign(data, { topShelfY: coverY, coverIsRoof: roof, coverShelfIndex: reuse, coverPartId: roof ? mod.panelIds.top : reuse >= 0 ? `${sid}-SHELF${pad2(reuse + 1)}` : `${sid}-SHELF-DRAWER-COVER` });
        if (reuse < 0 && !roof) buildShelf(m, d, sec, COVER_INDEX, coverY, hasBack, supports, options.materials);
      }
    }

    if (cfg.shelvesEnabled) {
      const requested = cfg.filling ? cfg.shelfCount : clamp(cfg.shelfCount, 1, C.maxShelves.value),
        minY = Math.max(drawerTop + (cfg.drawersEnabled ? C.shelfOverDrawers.value : 0), data.topShelfY !== undefined ? data.topShelfY + t / 2 : drawerTop),
        maxY = innerH - C.shelfBelowTop.value,
        auto: number[] = [];
      const align = (y: number, k: number) => (shelfTypeAt(cfg, k) === 'adjustableShelf' && settings.system32Assist ? snapSystem32(y) : Math.round(y));
      if (cfg.rodCount > 0) {
        for (let k = 0; k < requested; k++) {
          const y = align(innerH - C.shelfOverRodPitch.value * (requested - k), k);
          if (y > minY + C.shelfOverRodLow.value && y < maxY + C.shelfOverRodHigh.value) auto.push(y);
        }
      } else {
        const span = Math.max(0, maxY - minY);
        for (let k = 1; k <= requested; k++) {
          const y = align(minY + (span * k) / (requested + 1), k - 1);
          if (y > minY && y < maxY) auto.push(y);
        }
      }
      const manual = Array.isArray(cfg.shelfPositions) && cfg.shelfPositions.length === requested;
      data.shelfYs =
        system32Managed && manual ? cfg.shelfPositions.slice() : fitVerticalPositions(cfg.shelfPositions, auto, manual ? C.manualShelfMin.value : Math.min(minY + 1, maxY), maxY, t + C.minShelfClearance.value, requested);
      data.shelfYs.forEach((y: number, k: number) => buildShelf(m, d, sec, k, y, hasBack, supports, options.materials));
      data.requestedShelves = requested;
    }

    if (cfg.rodCount > 0) {
      const rods = cfg.filling ? cfg.rodCount : clamp(cfg.rodCount, 1, 2),
        lower = Math.max(drawerTop + (cfg.drawersEnabled ? C.rodOverDrawers.value : C.rodOverBottom.value), data.topShelfY !== undefined ? data.topShelfY + t / 2 + C.rodClear.value : 0),
        ceiling = data.shelfYs.length ? Math.min(...data.shelfYs) - C.rodClear.value : innerH - C.rodBelowTop.value,
        span = ceiling - lower,
        auto = rods === 1 ? [Math.round(lower + Math.max(0, span) * C.rodOne.value)] : [Math.round(lower + Math.max(0, span) * C.rodLow.value), Math.round(lower + Math.max(0, span) * C.rodHigh.value)];
      const filtered = auto.filter((y) => y > drawerTop + C.rodAboveDrawers.value && y < innerH - C.rodLimit.value),
        manual = Array.isArray(cfg.rodPositions) && cfg.rodPositions.length === rods;
      // MOD-DEC-310: a stored rod is never moved; its place is the user's (C14-02).
      data.rodYs = cfg.filling && manual ? cfg.rodPositions.slice() : fitVerticalPositions(cfg.rodPositions, filtered, manual ? C.rodLimit.value : Math.min(lower, innerH - C.rodLimit.value), innerH - C.rodLimit.value, C.rodClear.value, rods);
      m.totalRods = (m.totalRods ?? 0) + data.rodYs.length;
      data.rodYs.forEach((y: number, k: number) =>
        data.interiorElements.push({ id: `${sid}-ROD${pad2(k + 1)}`, type: 'rod', moduleId: mod.id, sectionId: sid, y, loadKg: null, requiresHardwareConfirmation: false }),
      );
    }

    if (cfg.shelvesEnabled) data.shelfDeflection = data.shelfDeflections?.[0] ?? null;
    if (cfg.filling) {
      buildLocalPartitions(m, d, sec);
      data.filling = structuredClone(cfg.filling);
    }
    if (storage.length) {
      // Without drawers the spacers of the pull-outs are their own (with drawers buildDrawers built them over both).
      if (!cfg.drawersEnabled) buildSpacers(m, d, sec, spacerPlan, storageZones, 'корзин');
      const spacerId = (side: 'L' | 'R') => ((m.parts as Rec[]).some((p) => p.id === `${sid}-SPACER-${side}`) ? `${sid}-SPACER-${side}` : undefined);
      data.storage = finishStorage(m, sec, storage, { left: spacerId('L'), right: spacerId('R') });
      (m.storageUnits ??= []).push(...data.storage);
    }
  }
  // MOD-DEC-343: the supports are placed once every shelf is known. A removable shelf with one on the other side of a
  // partition at the same level (their thicknesses overlap) gets the staggered rows at that partition (FINDINGS 342).
  for (const s of supports) {
    const level = (o: PendingSupports) => o !== s && o.sec.module === s.sec.module && Math.abs(o.y - s.y) < m.t,
      shared: [boolean, boolean] = [supports.some((o) => level(o) && o.sec.right.panel === s.sec.left.panel), supports.some((o) => level(o) && o.sec.left.panel === s.sec.right.panel)];
    placeSupports(m, d, s.sec, s.p, s.y, options, shared);
  }
}

/** A removable shelf whose supports wait for the whole fill (MOD-DEC-343). */
interface PendingSupports {
  sec: FillSection;
  p: Rec;
  y: number;
}

/** Index of the shelf over the drawers among the shelves of a section, as v18 counts it (v18ShelfIndex r1.html:54896). */
export const COVER_INDEX = -2;

/**
 * One shelf of a section: the part at its final size and place, then its fastening (fixed) or supports (removable).
 * `k` is the index of the shelf, COVER_INDEX the fixed shelf over the drawers (addFixedShelf with drawerCoverShelf).
 */
function buildShelf(m: Rec, d: Rec, sec: FillSection, k: number, y: number, hasBack: boolean, supports: PendingSupports[], mc: MaterialCatalog): void {
  const policy = d as PolicyState,
    { cfg, data, module: mod } = sec,
    g = mod.geometry,
    t: number = m.t,
    sid: string = data.id,
    cover = k === COVER_INDEX,
    type = cover ? 'fixedShelf' : shelfTypeAt(cfg, k),
    removable = type === 'adjustableShelf',
    row: Rec | undefined = cover ? cfg.filling?.cover : cfg.filling?.shelf?.[k],
    uid = cover ? cfg.uiSectionId + '-DRAWER-COVER' : cfg.shelfUids?.[k],
    bindable = cover ? cfg.drawersEnabled && cfg.drawerMode === 'internal' && cfg.drawerCount > 0 : type === 'fixedShelf',
    linked = (d.seamBindings || []).some((b: Rec) => b.sectionId === cfg.uiSectionId && b.shelfId === uid && bindable),
    span = sec.spanEnd(row?.spanRight),
    // MOD-DEC-225: fixed = the clear opening, removable = the opening − 2 mm, centred (1 mm at each end).
    endGap = removable ? C.removableEndGap.value : 0,
    { front, rearPlane, rearSetback } = shelfDepthPlanes(row, cfg, k, g, hasBack, linked, d, facadeThickness(d as PolicyState, t)),
    W = rearPlane - front,
    L = span.end - data.clearStart - 2 * endGap,
    load = cover ? (cfg.shelfLoadKg ?? C.payloadKg.value) : shelfLoadAt(cfg, k),
    partId = cover ? `${sid}-SHELF-DRAWER-COVER` : `${sid}-SHELF${pad2(k + 1)}`;
  if (W <= 0) throw Error('Полка не помещается по глубине.');
  const p = addPart(
    m.parts,
    {
      id: partId,
      name: cover ? ` ${sid} — фиксированная полка над ящиками` : `${sid} — ${removable ? 'съёмная' : 'фиксированная'} полка ${k + 1}`,
      L,
      W,
      T: t,
      q: 1,
      kind: cover ? 'drawerCoverShelf' : type,
      role: removable ? 'interiorShelf' : 'structuralShelf',
      moduleId: mod.id,
      sectionId: sid,
      // fiModelSection: a removable shelf of a filling is edged all round; the edge model then applies (MOD-DEC-193).
      edges: removable && cfg.filling ? edges(EDGE, EDGE, EDGE, EDGE) : edges(EDGE, '', '', ''),
    },
    policy,
  );
  const fd = mfShelfDeflection(L, W, t, load, policy, mc);
  Object.assign(p, {
    // The prototype gives the shelf over the drawers no payload of its own; its deflection is for 10 kg (289).
    ...(cover ? {} : { loadKg: load }),
    deflection: fd,
    ...(row && !cover ? { fillingId: row.id } : {}),
    worldBox: { x0: data.clearStart + endGap, x1: span.end - endGap, y0: g.interiorBottomY + y - t / 2, y1: g.interiorBottomY + y + t / 2, z0: front, z1: rearPlane },
    frontSetback: linked ? 0 : front,
    rearSetback,
    rearReference: 'BACK_INNER_FACE',
    seamLinked: linked,
  });
  if (!cover) (data.shelfDeflections ??= [])[k] = fd;
  const item: Rec = { id: partId, type, moduleId: mod.id, sectionId: sid, y, partIds: [partId], loadKg: load, deflection: fd };
  if (removable) supports.push({ sec, p, y });
  else {
    fixShelf(m, sec, p, y, span.index);
    data.fixedShelfYs.push(y);
  }
  data.interiorElements.push(item);
}

/**
 * The joints of a fixed shelf with the panels at its ends (addFixedShelf r1.html:12393): stations 50 mm from the
 * front and the rear of the finished shelf, a shelf narrower than 200 mm by MOD-DEC-364 (FINDINGS 383); the r7
 * fasteners then plan them (fasteners-r7.ts). The hole in the panel
 * is at the shelf's height over the panel's own lower edge (FINDINGS 275).
 */
function fixShelf(m: Rec, sec: FillSection, p: Rec, y: number, spanIndex: number): void {
  const g = sec.module.geometry,
    station = C.fixedShelfStation.value,
    { stations, dowels } = narrowJointLayout(p.W) ?? { stations: [station, p.W - station], dowels: [] },
    ends: [Boundary, string][] = [
      [sec.left, 'C'],
      [spanIndex === sec.index ? sec.right : sec.rightOf(spanIndex), 'D'],
    ];
  ends.forEach(([b, edge], side) => {
    const start = m.holes.length,
      x = g.interiorBottomY + y - b.baseY;
    for (const s of stations) {
      addConfirmatThroughHole(m.holes, b.panel, b.face, x, p.worldBox.z0 + s, 'Фиксированная полка — соединение');
      addConfirmatBlindHole(m.holes, p.id, edge, s, 'Фиксированная полка — торец');
    }
    const id = `${p.id}-C-${side ? 'R' : 'L'}`;
    m.connections.push({ id, type: 'fixedShelf', a: p.id, b: b.panel, fastener: 'Конфирмат 7×50', qty: stations.length, moduleId: sec.module.id, sectionId: sec.data.id });
    dpOwnOperations(m.holes, start, [p.id, b.panel], id);
    addNarrowJointDowels(m.holes, m.connections, { id, dowels, through: b.panel, face: b.face, receiving: p.id, edge, place: (at) => ({ x, y: p.worldBox.z0 + at, offset: at }), moduleId: sec.module.id, sectionId: sec.data.id });
  });
}

/** What the shelf `p` asks of its support (MOD-DEC-332, 344): the same for the fill and the edit «change the type». */
export function supportDemand(p: Rec, t: number, tier: HardwareTier | null): ShelfSupportDemand {
  const selfKg = Number.isFinite(p.deflection?.selfKg) ? p.deflection.selfKg : null;
  return { shelfThicknessMm: t, shelfMaterial: p.materialFamily === 'LDSP' ? 'CHIPBOARD' : String(p.materialFamily), payloadKg: p.loadKg, shelfMassKg: selfKg, tier };
}

/**
 * Lines of the shelf supports at one end of a removable shelf, mm from the front: 37 and D − 37 (Handbook r8 §17.2,
 * FINDINGS 270). At a partition with a removable shelf on its other side at the same level (`shared`, MOD-DEC-343,
 * FINDINGS 342): the rows of the shared shelf from the front edge of the partition — 37 and G for the shelf left of
 * it, 53 and G − 16 for the shelf right of it — so the gnezda of the two sides never meet.
 */
function supportLines(m: Rec, d: Rec, b: Boundary, shelfRightOfPanel: boolean, depth: number, shared: boolean): number[] {
  const panel = shared ? m.parts.find((x: Rec) => x.id === b.panel) : null;
  if (panel?.kind !== 'divider') return [C.supportLine.value, depth - C.supportLine.value];
  return sharedShelfRows(panel.W, shelfRightOfPanel, !!(d.system32Policy?.enabled ?? d.system32Assist)).rowsMm;
}

/**
 * The shelf supports of a removable shelf (MOD-DEC-193, 332, 344): the support of the level of the project, its
 * scheme at the lines of each end (supportLines), the main holes in both panels at the axis of the support and the
 * bores of the shelf (FINDINGS 272). The prototype drilled 8 D5/L13 at the middle of the shelf thickness, whatever
 * the support. The spare levels ±32 mm come after, from the whole model (s32SupportInventory).
 */
function placeSupports(m: Rec, d: Rec, sec: FillSection, p: Rec, y: number, options: FillOptions, shared: [boolean, boolean]): void {
  const g = sec.module.geometry,
    decorId = options.corpusDecorId,
    catalog = options.shelfSupports,
    t: number = m.t,
    id = `${p.id}-SUPPORTS`,
    // The level of the project «Комплектация» on «Стоимость» (fiTier r1.html:94446; MOD-DEC-223), «Стандарт» if not chosen.
    tier = d.fillingTier ?? null,
    selection = selectShelfSupport(supportDemand(p, t, tier), catalog),
    support = selection.chosen ? catalog.supports.find((s) => s.id === selection.chosen!.supportId)! : null,
    // The shelf is right of its left panel and left of its right one.
    ends = [supportLines(m, d, sec.left, true, g.depth, shared[0]), supportLines(m, d, sec.right, false, g.depth, shared[1])],
    lines = [...new Set(ends.flat())].sort((a, b) => a - b),
    record: Rec = {
      id,
      shelfId: p.id,
      sectionId: sec.data.id,
      moduleId: sec.module.id,
      tier: tier ?? shelfSupportSelection.constants.defaultTier.value,
      selection,
      supportId: support?.id ?? null,
      linesFromFrontMm: lines,
      outsideShelf: lines.filter((line) => line < p.worldBox.z0 || line > p.worldBox.z1),
      scheme: null,
      kit: null,
      axisAboveLowerMm: null,
      axisElevationMm: null,
    };
  (m.shelfSupports ??= []).push(record);
  if (!support) return;
  const above = shelfLowerAboveAxis(support),
    schemes = ends.map((l) => shelfSupportScheme(support, { linesFromFrontMm: l, shelfSetbackMm: p.worldBox.z0, shelfDepthMm: p.W, shelfEndGapMm: C.removableEndGap.value })),
    [left, right] = schemes as [ShelfSupportScheme, ShelfSupportScheme];
  // One scheme when both ends have the same lines; else the holes of both ends and the supports of both (4 in all).
  record.scheme =
    JSON.stringify(ends[0]) === JSON.stringify(ends[1])
      ? left
      : { ...left, holes: [...left.holes, ...right.holes], quantity: (left.quantity + right.quantity) / 2, completeness: left.completeness === 'COMPLETE' && right.completeness === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE', missing: [...new Set([...left.missing, ...right.missing])] };
  record.kit = shelfSupportKit(support, decorId ? shelfSupportBodyColour(decorId) : null);
  if (above.valueMm === null) return;
  // The catalogue gives the lower face of the shelf over the axis of the side fixing; the axis is drilled.
  const lower = g.interiorBottomY + y - t / 2,
    axis = lower - above.valueMm;
  record.axisAboveLowerMm = -above.valueMm;
  record.axisElevationMm = axis;
  const start = m.holes.length;
  [sec.left, sec.right].forEach((b, i) => {
    for (const h of schemes[i]!.holes.filter((h) => h.part === 'SIDE_PANEL'))
      addFaceHole(m.holes, b.panel, b.face, axis - b.baseY, h.acrossMm, h.widthMm, h.depthMm, 'Полкодержатель', `D${h.widthMm}/L${h.depthMm}`, { machiningRole: h.machiningRole, shelfSupportId: id, catalogRef: h.ref ?? support.ref });
  });
  // A stepped bore (MAORI16: Ø11 × 13,5 under Ø14 × 2,5) is two concentric bores of one support: the shallower is the
  // step of the deeper one, not a second hole (INV-H04).
  const bores = (s: ShelfSupportScheme) => s.holes.filter((h) => h.part === 'SHELF' && h.face === 'LOWER' && h.fromEndMm !== null),
    step = (h: ShelfSupportScheme['holes'][number], all: ShelfSupportScheme['holes']) => all.some((o) => o !== h && o.acrossMm === h.acrossMm && o.fromEndMm === h.fromEndMm && (o.depthMm ?? 0) > (h.depthMm ?? 0));
  // The schemes of the two ends differ only in their lines: the k-th bore of one end pairs with the k-th of the other.
  const own = [bores(left), bores(right)];
  own[0]!.forEach((_, k) => {
    for (const end of [0, 1]) {
      const h = own[end]![k]!;
      addFaceHole(m.holes, p.id, 'outside', end ? p.L - h.fromEndMm! : h.fromEndMm!, h.acrossMm, h.widthMm, h.depthMm, 'Полкодержатель — гнездо в полке', `D${h.widthMm}/L${h.depthMm}`, { machiningRole: step(h, own[end]!) ? 'SHELF_BORE_STEP' : h.machiningRole, shelfSupportId: id, catalogRef: h.ref ?? support.ref });
    }
  });
  dpOwnOperations(m.holes, start, [p.id], id);
}

/**
 * Spare levels of the shelf supports, ±32 mm from each main hole (s32SupportInventory r1.html:89327; MOD-DEC-193,
 * IR6-02): a spare that leaves its part or meets another hole or a groove is not drilled and the main one stays; a
 * spare that coincides with an existing operation is that operation, with both owners. Only with System 32 on.
 */
export function s32SupportInventory(m: Rec, d: Rec): void {
  if (!d.system32Policy) return;
  const main = m.holes.filter((h: Rec) => h.purpose === 'Полкодержатель');
  if (!main.length) return;
  const input = f7Input(m, d),
    partIndex = new Map<string, Rec>(),
    byPart = new Map<string, Rec[]>(),
    groovesByPart = new Map<string, Rec[]>(),
    seen = new Map<string, Rec>(),
    rejected: Rec[] = [],
    unknown: Rec[] = [],
    key = (o: Rec) => JSON.stringify([o.partId, o.faceId, o.entry, o.inwardNormal, o.diameter, o.depth]),
    append = (o: Rec) => (byPart.get(o.partId) ?? byPart.set(o.partId, []).get(o.partId)!).push(o);
  for (const p of input.parts) if (!partIndex.has(p.id)) partIndex.set(p.id, p);
  for (const o of input.operations) if (o) append(o);
  for (const g of input.grooves) (groovesByPart.get(g.partId) ?? groovesByPart.set(g.partId, []).get(g.partId)!).push(g);
  for (const h of m.holes) {
    const o = f7LegacyOperation(h, partIndex);
    if (o) seen.set(key(o), h);
  }
  for (const h of main) {
    h.system32Level = 'main';
    for (const dz of [-C.spareLevel.value, C.spareLevel.value]) {
      const candidate: Rec = {
          ...h,
          x: s32Q(h.x + dz),
          operationId: h.operationId + '-S32-' + (dz < 0 ? 'LOW' : 'HIGH'),
          purpose: 'Запасной уровень полкодержателя',
          system32Level: 'spare',
          sourceMainOperationId: h.operationId,
          dpOwners: [...(h.dpOwners || [])],
        },
        o = f7LegacyOperation(candidate, partIndex),
        p = partIndex.get(h.panel);
      let reason: string | null = null;
      if (!o || !p) reason = 'PHYSICAL_FRAME_UNKNOWN';
      else if (!Number.isFinite(o.depth)) reason = 'DEPTH_UNKNOWN';
      else if (operationBreaksPart(o, p)) reason = 'HOLE_BREAKS_PART_EDGE';
      else {
        const equal = seen.get(key(o));
        if (equal) {
          equal.dpOwners = [...new Set([...(equal.dpOwners || []), ...(h.dpOwners || [])])];
          equal.system32Owners = [...new Set([...(equal.system32Owners || [equal.operationId]), h.operationId])];
          continue;
        }
        if ((byPart.get(o.partId) || []).some((b) => intersects(o, b) === true)) reason = 'HOLE_COLLISION';
        else
          for (const g of groovesByPart.get(o.partId) || []) {
            const hit = grooveHit(o, g);
            if (hit === true) {
              reason = 'GROOVE_COLLISION';
              break;
            }
            if (hit === null) unknown.push({ operationId: candidate.operationId, field: 'groove geometry' });
          }
      }
      if (reason) rejected.push({ operationId: candidate.operationId, panel: h.panel, deltaMm: dz, reason, mainPreserved: true });
      else {
        m.holes.push(candidate);
        seen.set(key(o!), candidate);
        append(o!);
      }
    }
  }
  m.system32Supports = {
    mainCount: main.length,
    spareCount: m.holes.filter((h: Rec) => h.system32Level === 'spare').length,
    rejected,
    unknown,
    productionRelease: false,
  };
}

/**
 * Local partitions of the filling (fiModelSection r1.html:92776). By MOD-DEC-234 the depth and the front of a partition
 * are those of its supporting shelf (the prototype put it at the front edge with the stored depth — FINDINGS 274), so
 * without a back it reaches the wall with the shelf (330); its place and height are the stored ones. A lost support
 * (`orphan`) is said (234).
 */
function buildLocalPartitions(m: Rec, d: Rec, sec: FillSection): void {
  const policy = d as PolicyState,
    { cfg, data, module: mod } = sec,
    t: number = m.t,
    shelfOf = (fillId: string | null | undefined) => (fillId ? m.parts.find((p: Rec) => p.sectionId === data.id && p.fillingId === fillId) : null);
  for (const r of cfg.filling.partitions ?? []) {
    const lower = r.orphan ? null : shelfOf(r.lowerId),
      z0 = lower ? lower.worldBox.z0 : 0,
      z1 = lower ? lower.worldBox.z1 : r.depth;
    addPart(
      m.parts,
      {
        id: r.id,
        name: 'Локальная перегородка',
        L: r.height,
        W: z1 - z0,
        T: t,
        q: 1,
        kind: 'localPartition',
        role: 'interiorPartition',
        moduleId: mod.id,
        sectionId: data.id,
        edges: edges(EDGE, '', '', ''),
        worldBox: { x0: data.clearStart + r.left, x1: data.clearStart + r.left + t, y0: r.bottom, y1: r.bottom + r.height, z0, z1 },
        requiresTechnologyConfirmation: true,
        lowerSupportId: r.orphan ? null : r.lowerId,
        upperSupportId: r.upperId,
        ...(r.orphan ? { supportLost: true } : {}),
      },
      policy,
    );
    // The joint is with the supporting shelf, or the bottom when the partition stands on it; the prototype named the
    // row of the filling here, not a part (FINDINGS 274).
    m.connections.push({ id: r.id + '-MOUNT', type: 'hardwarePlaceholder', a: r.id, b: r.orphan ? null : (lower?.id ?? (r.lowerId ? null : mod.panelIds.bottom)), moduleId: mod.id, sectionId: data.id, qty: 0, fastener: 'Крепление перегородки требует подтверждения', requiresHardwareConfirmation: true });
  }
}
