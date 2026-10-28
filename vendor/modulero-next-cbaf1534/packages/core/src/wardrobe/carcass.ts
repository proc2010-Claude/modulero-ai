// Carcass of the swing wardrobe (task W3, MIGRATION_PLAN step 3.4): the part of the prototype's model() that builds
// the bodies without fronts and fill. Sides, roof, bottom, back panel, plinth rails, dividers and their joints
// (base model r1.html:11697–11957), the back panel in a rebate (v17ApplyGeometry r1.html:53564 through
// ckApplyGeometry r1.html:11536), uprights, partition heights and the skirting cut (ckDetails r1.html:11566), the
// pass over the parts, the optional parts (dpCompose), the operation ids, the base, anti-tip, load path and room
// checks and the nominal operation basis (r1.html:12673–13225); the r7 fasteners are fasteners-r7.ts.
//
// What the prototype read from the form (`val(id)`) and from its global `state` comes from the WardrobeInput; the
// state is copied first, because ckSync distributes the body widths in place as the prototype does. The objects
// keep the prototype's shape, so the policy of tasks W1 and W2 runs on them unchanged, and the graph generator
// (engine/generators/wardrobe.ts) translates them into the engine graph.
//
// Departures from the prototype are fixes of confirmed defects (MOD-DEC-295, 342), each with its FINDINGS item:
// canonical section ids (WR-28, FINDINGS 210), the dividers reach the rear of the sides without a back panel and
// the sides keep no rebate notch (MOD-DEC-287, 309, FINDINGS 211), the base of the project from the bodies
// (WR-12, FINDINGS 212), the fasteners and dowels of a narrow part and of the plinth rails by MOD-DEC-364 (FINDINGS 380, 382).
// Proof: packages/core/test/engine.wardrobe.test.ts compares every carcass record with the golden model.json of
// the 36 wardrobe inputs.
import { DE_VERSION, deDepth, deDimensions, deDoorsInFront, deFrontThickness } from '../engine/policy/depth.js';
import { applyEdgeModelToPart, assignProductionOperationIds, normalizeHolePurposes, partOrientation } from '../engine/policy/edge-model.js';
import { bodyNominalGrid, ckReconcileSections, ckSync, type Body, type BodySection, type ConstructionState } from '../engine/policy/carcass.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { onLegs } from '../engine/policy/fittings-selection.js';
import { hingeSelection } from '../engine/policy/hinge-selection.js';
import { narrowJointLayout, type JointLayout } from '../engine/policy/joint-stations.js';
import { mfAnnotate } from '../engine/policy/materials.js';
import { splitBackPanel } from '../engine/policy/back-split.js';
import { tolerance } from '../engine/policy/index.js';
import { facadeChoiceProblems } from '../engine/policy/facade-materials.js';
import { decorativePlinthPart, dpCompose, dpOwnOperations, dpPanelMissing } from '../engine/policy/optional-parts.js';
import type { PolicyState, Rec } from '../engine/policy/project-state.js';
import { wardrobeCarcass } from '../engine/policy/wardrobe-carcass.js';
import { buildAntiTipSystem, floorContactEdgeValidator, loadPathValidator, makeHardwarePlaceholder, roomInstallationValidator } from '../engine/policy/validators.js';
import { buildLifts, planLifts } from './lifts.js';
import { attachFrontGrid, buildFacades, drawerSpacerPlan, innerDrawerIn, planFacades, STANDARD_FACADE_PROFILE_ID } from './facades.js';
import { drawerCountOf, storedDrawerPlaces, type DrawerUnit } from './drawer-boxes.js';
import { fe04, fe04DrawerStep } from '../engine/policy/fe04.js';
import { WARDROBE_DRAWER_SLIDE } from './drawers.js';
import { buildFill, s32SupportInventory, type Boundary, type FillSection } from './fill.js';
import { wardrobeFittings } from './fittings.js';
import { pushLatches } from './push-latches.js';
import { applyFastenersR7, carcassBoxes, type WallFace } from './fasteners-r7.js';
import type { WardrobeInput } from './input.js';
import { addConfirmatBlindHole, addConfirmatThroughHole, addNarrowJointDowels, addPart, addPlinthRailConnections, carcassConfirmat, edges, type Issue } from './primitives.js';
import { isSliding, placePartitionsBehindSystem, slidingCarcassState } from './sliding.js';
import { slidingDoorsBlock } from './sliding-doors.js';
import { FASTENER_PRESETS, HDF4_BACK_PANEL_INTENT, WardrobeStandardPreset } from './standard.js';
import { wardrobeBaseSummary, wardrobeHardwareArticles } from './summary.js';

/** Smallest gap above an internal drawer, mm (MIN_INTERNAL_DRAWER_GAP, r1.html:3651). */
export const MIN_INTERNAL_DRAWER_GAP = 20;
/** Confirmat stations of a carcass joint of a part from 200 mm: 50 mm from the front and from the rear edge (MOD-DEC-364; r1.html:11916, FINDINGS 40). */
export const CARCASS_CONFIRMAT_STATION = wardrobeCarcass.constants.confirmatStation.value;

/**
 * Fasteners and dowels of a carcass joint of a part D mm deep, from its front edge (MOD-DEC-364, FINDINGS 380): from
 * 200 mm two at 50 mm from the edges, narrower by joint-stations. The stations never come closer than 64 mm, so the
 * merging of coinciding stations (WR-07, FINDINGS 216) and the overlap at 101…108 mm are gone.
 */
export function carcassJointLayout(D: number): JointLayout {
  return narrowJointLayout(D) ?? { stations: [CARCASS_CONFIRMAT_STATION, D - CARCASS_CONFIRMAT_STATION], dowels: [] };
}

/** The prototype's `val(id)`: the field text as a number, an empty or invalid field is 0 (r1.html:3626). */
export function val(input: WardrobeInput, id: keyof WardrobeInput['controls']): number {
  return Number(input.controls[id]) || 0;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Settings of the wardrobe: the form (wardrobeSettings r1.html:3973), the depth of the side from the depth profile
 * (r1.html:57379) and the room of the construction domain (r1.html:90940). `d` is the copy of the state; the
 * prototype wrote the gap above an internal drawer back into it.
 */
export function wardrobeSettings(input: WardrobeInput, d: Rec): Rec {
  const baseSystem = input.controls.baseSystem || WardrobeStandardPreset.baseSystem,
    plinthHeight = baseSystem === 'none' ? 0 : val(input, 'plinthHeight'),
    doorBottomClearanceMode = d.doorBottomClearanceMode || WardrobeStandardPreset.doorBottomClearanceMode,
    internalDrawerGap = Math.max(MIN_INTERNAL_DRAWER_GAP, val(input, 'internalDrawerGap') || d.internalDrawerGap || WardrobeStandardPreset.internalDrawerGap);
  d.internalDrawerGap = internalDrawerGap;
  d.system32Assist = d.system32Policy?.enabled ?? Boolean(input.controls.system32Assist);
  const s: Rec = {
    width: val(input, 'width'),
    height: val(input, 'height'),
    depth: val(input, 'depth'),
    panelThickness: val(input, 'thickness') || WardrobeStandardPreset.panelThickness,
    backPanelThickness: WardrobeStandardPreset.backPanelThickness,
    backPanelMode: WardrobeStandardPreset.backPanelMode,
    baseSystem,
    plinthHeight,
    plinthSetback: val(input, 'plinthSetback'),
    heightIncludesBase: Boolean(d.heightIncludesBase),
    fixedLegHeight: Number(d.fixedLegHeight ?? WardrobeStandardPreset.fixedLegHeight),
    maxCabinetModuleWidth: WardrobeStandardPreset.maxCabinetModuleWidth,
    advancedModuleWidthInputMm: Number(d.advancedModuleWidthInputMm) || WardrobeStandardPreset.maxCabinetModuleWidth,
    internalDrawerGap,
    system32Assist: d.system32Assist,
    system32Step: WardrobeStandardPreset.system32Step,
    shelfDepthReduction: val(input, 'shelfReduction'),
    doorBottomClearanceMode,
    doorBottomClearance: baseSystem === 'plinth' && doorBottomClearanceMode === 'auto' ? plinthHeight : Math.max(0, val(input, 'doorBottomClearance')),
    roomHeight: val(input, 'roomHeight'),
    leftWall: Boolean(input.controls.leftWall),
    rightWall: Boolean(input.controls.rightWall),
    roomSkirtingHeight: val(input, 'roomSkirtingHeight'),
    roomSkirtingDepth: val(input, 'roomSkirtingDepth'),
    rearWallGap: val(input, 'rearWallGap'),
    skirtingSolution: input.controls.skirtingSolution || 'warning',
    // MOD-DEC-073: the default hinge is the H316A02; each door gets its own pair by the table (286, FINDINGS 261).
    hingeModel: hingeSelection.constants.preferredHinges.value[0],
  };
  const dims = deDimensions(d, s.depth, s.panelThickness),
    withDepth = {
      ...s,
      depth: dims.status === 'UNKNOWN' ? dims.Dside : (dims.Dside ?? s.depth),
      dimensions: dims,
      dimensionRuleVersion: DE_VERSION,
    },
    r = d.construction?.room;
  if (!r) return withDepth;
  return {
    ...withDepth,
    leftWall: r.niche || r.left,
    rightWall: r.niche || r.right,
    roomHeight: r.ceiling ?? 0,
    rearWallGap: 0,
    roomSkirtingHeight: r.skirting ? (r.skirtHeight ?? 0) : 0,
    roomSkirtingDepth: r.skirting ? (r.skirtDepth ?? 0) : 0,
    skirtingSolution: 'cutout',
  };
}

/**
 * Vertical geometry, depth and base of one body (ckBodyGeometry r1.html:11406): the body's own base or that of
 * the form, 'legs' read as fixed legs; the side depth from the overall depth minus the overlay back and the
 * thickest front.
 */
export function bodyGeometry(b: Rec, settings: Rec, d: Rec, t: number): Rec {
  const pt = settings.panelThickness,
    H = b.height ?? settings.height,
    F = b.floor || 0,
    base = b.base || {
      kind: settings.baseSystem,
      height: settings.plinthHeight,
      setback: settings.plinthSetback,
    },
    kind = base.kind === 'legs' ? 'fixedLegs' : base.kind,
    bh = kind === 'none' ? 0 : onLegs(kind) ? (base.height ?? settings.fixedLegHeight) : base.height;
  const bottom = F + bh,
    sideBottom = F + (onLegs(kind) ? bh : 0),
    top = F + H,
    back = b.back || d.backProfile;
  const fronts = d.sections.filter((s: Rec) => s.bodyId === b.id && (deDoorsInFront(s) || (s.drawersEnabled && s.drawerMode === 'external'))).map((s: Rec) => deFrontThickness(s, d, t));
  const finished = b.depth ?? settings.dimensions?.Doverall ?? settings.depth,
    overlayBack = b.panels.back && back?.mode === 'overlay' ? Number(back.materialThicknessMm) : 0,
    gap = d.depthProfile?.frontGapMm ?? 2,
    transform =
      b.depth === null && d.depthProfile?.inputBasis === 'SIDE'
        ? deDepth({ value: settings.depth, basis: 'SIDE', back: overlayBack, fronts, gap })
        : deDepth({ value: finished, basis: 'OVERALL', back: overlayBack, fronts, gap }),
    dd = transform.Dside;
  const g = {
    floorY: F,
    sideBottomY: sideBottom,
    sideTopY: top,
    plinthBottomY: F,
    plinthTopY: bottom,
    bottomBottomY: bottom,
    bottomTopY: bottom + (b.panels.bottom ? pt : 0),
    interiorBottomY: bottom + (b.panels.bottom ? pt : 0),
    interiorTopY: top - (b.panels.top ? pt : 0),
    topBottomY: top - pt,
    topTopY: top,
  };
  return {
    ...g,
    height: H,
    depth: dd,
    bodyHeight: top - sideBottom,
    innerH: g.interiorTopY - g.interiorBottomY,
    base,
    settings: {
      ...settings,
      dimensions: transform,
      height: H,
      depth: dd,
      baseSystem: kind,
      plinthHeight: bh,
      plinthSetback: base.setback ?? settings.plinthSetback,
      fixedLegHeight: bh,
      backPanelThickness: back?.materialThicknessMm ?? settings.backPanelThickness,
    },
    back,
  };
}

/** The back panel in a rebate of the sides, roof and bottom of each body (v17ApplyGeometry r1.html:53564). */
function applyRebate(m: Rec, profile: Rec | null | undefined): void {
  if (!profile || profile.mode !== 'quarter') return;
  const { parts, grooves, modules, geometry: g, D, t } = m,
    r = profile.rebateDepthMm,
    w = profile.rebateWidthMm,
    c = profile.inPlaneClearanceMm;
  if (!(r > 0 && r < t && w >= 4 + c && c >= 0)) throw Error('Недопустимый рабочий профиль четверти.');
  for (const mod of modules) {
    const back = parts.find((p: Rec) => p.id === mod.panelIds.back),
      x0 = mod.start + t - r + c,
      x1 = mod.end - t + r - c,
      y0 = g.bottomTopY - r + c,
      y1 = g.topBottomY + r - c;
    if (!back) continue;
    Object.assign(back, {
      L: y1 - y0,
      W: x1 - x0,
      backPanelMode: 'quarter',
      backProfile: structuredClone(profile),
      worldBox: { x0, x1, y0, y1, z0: D - w, z1: D - profile.rearClearanceMm },
    });
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const p = parts.find((p: Rec) => p.id === mod.panelIds[side]),
        vertical = side === 'left' || side === 'right',
        start = vertical ? g.bottomTopY - r - g.sideBottomY : 0,
        end = vertical ? g.topBottomY + r - g.sideBottomY : p.L;
      grooves.push({
        dpOwners: [back.id, p.id],
        panel: p.id,
        face: 'inside',
        orientation: 'L',
        start,
        end,
        offset: D - w / 2,
        width: w,
        depth: r,
        semanticType: 'QUARTER_FOR_HDF4',
        purpose: 'Четверть задника · рабочий профиль',
        profileId: profile.id,
        machiningIntent: { semanticType: 'QUARTER_FOR_HDF4', status: 'WORKING_PROPOSAL' },
        resolvedMachining: {
          profileId: profile.id,
          resolvedWidthMm: w,
          resolvedDepthMm: r,
          resolver: 'EXPLICIT_WORKING_PROPOSAL',
          productionConfirmed: false,
          requiresTechnologyConfirmation: true,
        },
        requiresTechnologyConfirmation: true,
      });
      p.rearNotch = {
        x0: side === 'left' ? mod.start + t - r : side === 'right' ? mod.end - t : mod.start + t,
        x1: side === 'left' ? mod.start + t : side === 'right' ? mod.end - t + r : mod.end - t,
        y0: side === 'top' ? g.topBottomY : side === 'bottom' ? g.bottomTopY - r : g.bottomTopY - r,
        y1: side === 'top' ? g.topBottomY + r : side === 'bottom' ? g.bottomTopY : g.topBottomY + r,
        z0: D - w,
        z1: D + 0.01,
      };
    }
  }
  for (const p of parts) if (p.kind === 'divider') p.W = D - w;
}

/**
 * MOD-DEC-701: the back of each body in parts on its partitions and fixed shelves (splitBackPanel,
 * engine/policy/back-split.ts). The first part keeps the id of the back, the others follow it as `<id>-P2`…; a back
 * not wider than the limit stays as it was. The seams are returned for the joints of the graph.
 */
function splitBacks(parts: Rec[], modules: Rec[], t: number, policy: PolicyState): Rec[] {
  const seams: Rec[] = [],
    eps = tolerance.constants.compare.value;
  for (const mod of modules) {
    const at = parts.findIndex((p) => p.id === mod.panelIds.back);
    if (at < 0) continue;
    const back = parts[at]!,
      g = mod.geometry,
      // The overlay back covers the rear edges of the body (carcassBoxes); the back in a rebate has its own box.
      box = back.worldBox ?? { x0: mod.start, x1: mod.end, y0: g.sideBottomY, y1: g.sideTopY, z0: g.depth, z1: g.depth + back.T },
      own = parts.filter((p) => p.moduleId === mod.id),
      reaches = (z1: number) => z1 >= box.z0 - eps,
      plan = splitBackPanel({
        x0: box.x0,
        x1: box.x1,
        y0: box.y0,
        y1: box.y1,
        partitions: own.filter((p) => p.kind === 'divider' && reaches(p.worldBox?.z1 ?? p.W)).map((p) => ({ id: p.id, at: p.worldX + p.T / 2, from: g.interiorBottomY, to: g.interiorTopY })),
        shelves: own
          .filter((p) => (p.kind === 'fixedShelf' || p.kind === 'drawerCoverShelf') && p.worldBox && reaches(p.worldBox.z1))
          .map((p) => ({ id: p.id, at: (p.worldBox.y0 + p.worldBox.y1) / 2, from: p.worldBox.x0, to: p.worldBox.x1 })),
        reachMm: t,
        compareMm: eps,
      }),
      n = plan.pieces.length;
    if (n < 2) continue;
    const ids = plan.pieces.map((_, k) => (k ? `${back.id}-P${k + 1}` : back.id)),
      pieces = plan.pieces.map((b, k) => {
        const p = k ? structuredClone(back) : back;
        Object.assign(p, {
          id: ids[k],
          name: `${mod.id} — задняя стенка ХДФ, часть ${k + 1} из ${n}`,
          L: b.y1 - b.y0,
          W: b.x1 - b.x0,
          worldBox: { ...b, z0: box.z0, z1: box.z1 },
          // Which edges of the whole back the part keeps: those sit in the rebate of the sides, roof and bottom.
          backPiece: { backId: back.id, index: k, count: n, left: b.x0 === box.x0, right: b.x1 === box.x1, bottom: b.y0 === box.y0, top: b.y1 === box.y1 },
        });
        applyEdgeModelToPart(p, policy);
        p.orientation = partOrientation(p);
        return p;
      });
    parts.splice(at, 1, ...pieces);
    for (const s of plan.seams) seams.push({ moduleId: mod.id, axis: s.axis, at: s.at, from: s.from, to: s.to, supportId: s.supportId, partIds: s.pieces.map((i) => ids[i]) });
  }
  return seams;
}

/** Uprights from the bottom, partition heights and the cut for the room skirting (ckDetails r1.html:11566). */
function applyDetails(m: Rec, d: Rec): void {
  for (const u of d.construction.uprights) {
    const s = m.sectionsData.find((s: Rec) => s.id === u.sectionId),
      mod = m.modules.find((b: Rec) => b.id === u.bodyId);
    if (!s || !mod) continue;
    const g = mod.geometry,
      t = m.t,
      x = s.nominalStart + u.x;
    if (u.height <= 0 || u.height > g.innerH || x - t / 2 <= s.clearStart || x + t / 2 >= s.clearEnd) throw Error('Стоевая не помещается в секции.');
    const p = addPart(
      m.parts,
      {
        id: u.id,
        name: 'Стоевая от дна',
        kind: 'partialUpright',
        role: 'loadBearingPanel',
        moduleId: mod.id,
        sectionId: s.id,
        L: u.height,
        W: g.depth,
        T: t,
        q: 1,
        worldBox: { x0: x - t / 2, x1: x + t / 2, y0: g.interiorBottomY, y1: g.interiorBottomY + u.height, z0: 0, z1: g.depth },
        edges: edges(WardrobeStandardPreset.visibleEdgeBand, '', '', ''),
        requiresTechnologyConfirmation: true,
      },
      d,
    );
    s.partialZones = {
      lower: [
        { x0: s.clearStart, x1: x - t / 2, height: u.height },
        { x0: x + t / 2, x1: s.clearEnd, height: u.height },
      ],
      upper: { x0: s.clearStart, x1: s.clearEnd, y0: g.interiorBottomY + u.height, y1: g.interiorTopY },
    };
    m.connections.push({
      id: u.id + '-MOUNT',
      type: 'hardwarePlaceholder',
      a: p.id,
      b: mod.panelIds.bottom,
      moduleId: mod.id,
      qty: 0,
      requiresTechnologyConfirmation: true,
      fastener: 'Узел выполняет монтажник; крепления не рассчитаны',
    });
  }
  for (const p of m.parts.filter((p: Rec) => p.kind === 'divider')) {
    const s = m.sectionsData.find((s: Rec) => s.id === p.sectionId),
      cfg = d.sections[s?.index],
      height = cfg?.partitionHeight;
    if (height != null) {
      if (height <= 0 || height > s.geometry.innerH) throw Error('Высота перегородки выходит за границу корпуса.');
      p.L = height;
      if (height < s.geometry.innerH) {
        const top = m.modules.find((b: Rec) => b.id === p.moduleId).panelIds.top,
          removed = new Set(m.connections.filter((c: Rec) => c.a === p.id && c.b === top).map((c: Rec) => c.id));
        m.connections.splice(0, m.connections.length, ...m.connections.filter((c: Rec) => !removed.has(c.id)));
        m.holes.splice(0, m.holes.length, ...m.holes.filter((h: Rec) => !removed.has(h.connectionId)));
        p.requiresTechnologyConfirmation = true;
        s.upperOpening = { y0: s.geometry.interiorBottomY + height, y1: s.geometry.interiorTopY, sharedWith: d.sections[s.index - 1]?.physicalId };
      }
    }
  }
  const r = d.construction.room;
  if (!r.skirting || r.skirtHeight === null || r.skirtDepth === null) return;
  for (const p of m.parts) {
    const mod = m.modules.find((b: Rec) => b.id === p.moduleId);
    if (!mod) continue;
    const g = mod.geometry,
      top = r.skirtHeight;
    // The rear rail of the plinth is already forward of the skirting (skirtingShift, FINDINGS 215).
    if (g.sideBottomY >= top || !['sideLeft', 'sideRight', 'divider', 'bottom'].includes(p.kind)) continue;
    const y0 = p.kind === 'divider' ? g.interiorBottomY : p.kind === 'bottom' ? g.bottomBottomY : g.sideBottomY;
    if (y0 >= top) continue;
    const h = Math.min(top - y0, p.kind === 'bottom' ? m.t : p.L),
      z0 = Math.max(0, g.depth - r.skirtDepth);
    p.constructionCuts = [
      {
        kind: 'skirting',
        height: h,
        depth: r.skirtDepth,
        worldBox: {
          x0: p.kind === 'sideLeft' ? mod.start : p.kind === 'sideRight' ? mod.end - m.t : (p.worldX ?? mod.start + m.t),
          x1: p.kind === 'sideLeft' ? mod.start + m.t : p.kind === 'sideRight' ? mod.end : p.worldX != null ? p.worldX + m.t : mod.end - m.t,
          y0,
          y1: y0 + h,
          z0,
          z1: g.depth,
        },
        machiningStatus: 'UNKNOWN',
        allowance: null,
      },
    ];
    p.requiresTechnologyConfirmation = true;
  }
}

/** How far the rear rail of the plinth of a body stands forward of the room skirting (ckDetails, MOD-DEC-198). */
export function skirtingShift(d: Rec, g: Rec): number {
  const r = d.construction?.room;
  return r?.skirting && r.skirtHeight !== null && r.skirtDepth !== null && g.sideBottomY < r.skirtHeight ? r.skirtDepth : 0;
}

/**
 * How far the rear rail of the plinth stands forward of the rear plane of a body: in front of the room skirting
 * (MOD-DEC-198) and, under a back panel in a rebate (287), out from under the rebate of the bottom, its rear face at
 * the front of the rebate (MOD-DEC-456). Flush with the rear plane the dowels of the rail entered the rebate of the
 * HDF milled from above (FINDINGS 655, PR #269); with the rail forward by the width of the rebate the dowel keeps
 * (t − Ø) / 2 of material to it.
 */
export function rearRailShift(d: Rec, mod: Rec): number {
  const back = mod.geometry.back,
    body = d.bodies?.find((b: Rec) => b.id === mod.bodyId),
    rebate = back?.mode === 'quarter' && body?.panels?.back !== false && !dpPanelMissing(mod, 'back', d) ? Number(back.rebateWidthMm ?? 0) : 0;
  return Math.max(skirtingShift(d, mod.geometry), rebate);
}

/** Room walls along the outer sides: the left wall at x = 0, the right one at x = W (MOD-DEC-192, WR-18). */
export function roomWalls(settings: Rec, W: number): WallFace[] {
  return [...(settings.leftWall ? [{ side: 'left' as const, x: 0 }] : []), ...(settings.rightWall ? [{ side: 'right' as const, x: W }] : [])];
}

/**
 * The base of the product from the bases of its bodies (WR-12, MOD-DEC-294, 171, 291; FINDINGS 212): the common
 * base of all bodies, or MIXED with the elevations of the first body. The form field is only the default of a body
 * without its own base (bodyGeometry). Writes the base into the settings of the product.
 */
export function productBase(modules: Rec[], settings: Rec): { kind: string; geometry: Rec } {
  const own = modules.map((m) => m.geometry.settings),
    first = own[0]!,
    same = own.every((b) => b.baseSystem === first.baseSystem && b.plinthHeight === first.plinthHeight && b.plinthSetback === first.plinthSetback),
    kind = same ? first.baseSystem : 'mixed';
  settings.baseSystem = kind;
  if (kind === 'plinth') settings.plinthHeight = first.plinthHeight;
  if (kind === 'none') settings.plinthHeight = 0;
  if (onLegs(kind)) settings.fixedLegHeight = first.fixedLegHeight;
  if (same) settings.plinthSetback = first.plinthSetback;
  return { kind, geometry: modules[0]!.geometry };
}

/** Canonical id of the section at `localIndex` of a body: M01-S01, M01-S02… (WR-28, FINDINGS 210). */
export function canonicalSectionId(bodyId: string, localIndex: number): string {
  return `${bodyId}-S${pad2(localIndex + 1)}`;
}

/**
 * The carcass of the wardrobe in the prototype's model shape. The input is not changed. Sections carry their
 * grid geometry and empty fill lists: fronts and fill are tasks W4–W7.
 */
export function carcassModel(input: WardrobeInput, hw: HardwareCatalogs): Rec {
  return carcassModelWithState(input, hw).m;
}

/** The carcass model and the copy of the state it was built on (after ckSync): the graph generator reads both. */
export function carcassModelWithState(input: WardrobeInput, hw: HardwareCatalogs): { m: Rec; d: Rec } {
  return carcassFromLayout(carcassLayout(input, hw));
}

/**
 * What the carcass is built from: the state after ckSync, the settings of the product, the grid of bodies and
 * sections, the overall height and the elevations of the base. The input gives it (carcassLayout); the graph gives
 * it back (layoutFromGraph of wardrobe/graph-projection.ts), and both build the same model.
 */
export interface CarcassLayout {
  d: Rec;
  settings: Rec;
  /** bodyNominalGrid: modules with their geometry, sections, nominal and clear widths, breaks. */
  grid: Rec;
  H: number;
  installationOffset: number;
  baseElevation: number;
  /** The form gap: the number (val('gap')) for the facade profile and its text for the P2 chain (task W4). */
  gap: number;
  gapInput: string;
  /** The text of the width field: the exact total of the front grid. */
  widthInput: string;
  /** The hardware catalogue the wardrobe is built with: hinges of the doors, shelf supports of the fill (CAT-1; a test may give another). */
  hardware: HardwareCatalogs;
  /** Decor of the carcass in the shared catalogue (corpusDecor): the colour of the shelf supports (W6, MOD-DEC-344). */
  corpusDecorId: string | null;
}

/**
 * Decor of the carcass in the shared catalogue: the decor chosen in «Материал корпуса», else the `MF:` option of the
 * form. A built-in option of the prototype ('1610' = W960…) has no decor of the catalogue: null (FINDINGS 272).
 */
export function corpusDecor(input: WardrobeInput): string | null {
  const chosen = (input.state as Rec).materialSelection?.corpus?.decorId,
    v = String(input.controls.material);
  return chosen ?? (v.startsWith('MF:') ? v.slice(3) : null);
}

/** The layout of the carcass from the input (the first half of the prototype's model()). */
export function carcassLayout(input: WardrobeInput, hw: HardwareCatalogs): CarcassLayout {
  const d: Rec = structuredClone(input.state);
  // W9: the sliding wardrobe reads its sections without swing fronts (sliding.ts).
  slidingCarcassState(d);
  const settings = wardrobeSettings(input, d),
    W = settings.width;
  ckSync(d as ConstructionState, val(input, 'width'));
  // WR-02 (FINDINGS 350): the sections of a body add up to its width, also when the bodies already did.
  ckReconcileSections(d as ConstructionState, val(input, 'width'));
  const gridT = val(input, 'thickness'),
    grid = bodyNominalGrid(W, gridT, d.bodies as Body[], d.sections as BodySection[], (b) => bodyGeometry(b as Rec, wardrobeSettings(input, d), d, gridT)) as Rec,
    // WR-12: the base of the product comes from its bodies, not from the form field (FINDINGS 212).
    base = productBase(grid.modules, settings),
    installationOffset = base.geometry.sideBottomY;
  return {
    d,
    settings,
    grid,
    H: settings.height + (settings.heightIncludesBase ? 0 : installationOffset),
    installationOffset,
    baseElevation: base.geometry.bottomBottomY,
    gap: val(input, 'gap'),
    gapInput: String(input.controls.gap),
    widthInput: String(input.controls.width),
    hardware: hw,
    corpusDecorId: corpusDecor(input),
  };
}

/**
 * The sections of the fill with the panels at their sides (panelByBoundary r1.html:11931–11969): the side of the body
 * from its lower edge, a partition from the interior bottom it stands on (the prototype counted a partition from
 * t higher — FINDINGS 275).
 */
function fillSections(modules: Rec[], grid: Rec, sectionsData: Rec[], d: Rec): FillSection[] {
  const sides: Record<string, Boundary> = {};
  for (const mod of modules) {
    const g = mod.geometry,
      last = mod.sectionIndexes.length - 1;
    mod.sectionIndexes.forEach((gi: number, k: number) => {
      if (k === 0) sides[`${gi}:left`] = { panel: mod.panelIds.left, face: 'inside', baseY: g.sideBottomY };
      if (k === last) sides[`${gi}:right`] = { panel: mod.panelIds.right, face: 'inside', baseY: g.sideBottomY };
      if (k > 0) {
        const divId = `${sectionsData[gi].id}-DIVIDER01`;
        sides[`${gi}:left`] = { panel: divId, face: 'right', baseY: g.interiorBottomY };
        sides[`${gi - 1}:right`] = { panel: divId, face: 'left', baseY: g.interiorBottomY };
      }
    });
  }
  const moduleOf = (gi: number) => modules.find((mod) => mod.sectionIndexes.includes(gi))!;
  return sectionsData.map((data, i) => ({
    index: i,
    cfg: d.sections[i],
    data,
    module: moduleOf(i),
    left: sides[`${i}:left`]!,
    right: sides[`${i}:right`]!,
    rightOf: (k: number) => sides[`${k}:right`]!,
    // fiSpanEnd r1.html:92873: a shelf over a lowered partition reaches the clear end of the section on the right.
    spanEnd: (id: string | undefined) => {
      const target = id ? d.sections.findIndex((s: Rec) => s.physicalId === id) : -1,
        end = target >= 0 ? grid.sections[target]?.clearEnd : undefined;
      return end === undefined ? { end: data.clearEnd, index: i } : { end, index: target };
    },
  }));
}

/** The carcass model of a layout (the second half of model()): parts, holes, joints, base, validators, r7. */
/**
 * The model of the layout. FE-04 (MOD-DEC-050, task W7): when a closed hinge still meets an inner drawer after its own
 * ladder, the drawers the rules placed in that section move vertically by the step of the grid, nearest first and up
 * before down, inside the section; a place is taken only when the whole product built again has no hinge meeting a
 * drawer there and no new conflict elsewhere (FINDINGS 391). A stored place is the user's and stays (053).
 */
export function carcassFromLayout(layout: CarcassLayout): { m: Rec; d: Rec } {
  const movable = layout.d.sections.map((cfg: Rec) => innerDrawerIn(cfg) && !storedDrawerPlaces(cfg, drawerCountOf(cfg)) && !!cfg.facade && cfg.facade !== 'none');
  if (!movable.some(Boolean)) return buildCarcass(layout, []);
  const fresh = (): CarcassLayout => ({ ...layout, d: structuredClone(layout.d), settings: structuredClone(layout.settings), grid: structuredClone(layout.grid) }),
    conflicts = (m: Rec) => {
      const out = new Map<string, number>();
      for (const h of m.hingeMechanisms as Rec[]) out.set(h.sectionId, (out.get(h.sectionId) ?? 0) + h.fe04.conflicts.length);
      return out;
    },
    total = (c: Map<string, number>) => [...c.values()].reduce((a, b) => a + b, 0),
    shifts: number[] = [];
  let built = buildCarcass(fresh(), shifts),
    found = conflicts(built.m);
  built.m.sectionsData.forEach((data: Rec, i: number) => {
    if (!movable[i] || !found.get(data.id)) return;
    const step = fe04DrawerStep(!!layout.d.system32Policy),
      drawers = (data.drawers as Rec[]).map((x) => ({ bottom: x.bottom - (shifts[i] ?? 0), top: x.bottom - (shifts[i] ?? 0) + x.boxHeight })),
      low = Math.min(...drawers.map((x) => x.bottom)),
      high = Math.max(...drawers.map((x) => x.top)),
      room = built.m.modules.find((mod: Rec) => mod.sectionIndexes.includes(i))!.geometry.innerH,
      candidates: number[] = [];
    for (let k = 1; k * step <= Math.max(low, room - high); k++) for (const s of [k * step, -k * step]) if (low + s >= 0 && high + s <= room) candidates.push(s);
    for (const s of candidates) {
      const tried = [...shifts];
      tried[i] = s;
      const next = buildCarcass(fresh(), tried),
        c = conflicts(next.m);
      if (!c.get(data.id) && total(c) < total(found)) {
        shifts[i] = s;
        built = next;
        found = c;
        return;
      }
    }
  });
  return built;
}

function buildCarcass(layout: CarcassLayout, drawerShifts: readonly number[]): { m: Rec; d: Rec } {
  const { d, settings, grid, H, installationOffset, baseElevation, gap } = layout,
    policy = d as PolicyState,
    W = settings.width,
    D = settings.depth,
    t = settings.panelThickness,
    // MOD-DEC-467: 7×70 through a 22 mm carcass; at 7×50 the connection stays the prototype's (no preset field).
    confirmat = carcassConfirmat(t),
    confirmatPreset = confirmat.presetId === FASTENER_PRESETS.CONFIRMAT_7X50.id ? {} : { fastenerPresetId: confirmat.presetId },
    bodyHeight = H - installationOffset,
    installedHeight = H,
    innerH = H - baseElevation - 2 * t,
    geometry = {
      floorY: 0,
      sideBottomY: installationOffset,
      sideTopY: H,
      plinthBottomY: 0,
      plinthTopY: baseElevation,
      bottomBottomY: baseElevation,
      bottomTopY: baseElevation + t,
      interiorBottomY: baseElevation + t,
      interiorTopY: H - t,
      topBottomY: H - t,
      topTopY: H,
    },
    parts: Rec[] = [],
    holes: Rec[] = [],
    grooves: Rec[] = [],
    connections: Rec[] = [],
    supportContacts: Rec[] = [],
    hardwarePlaceholders: Rec[] = [],
    moduleConnectors: Rec[] = [],
    constructabilityIssues: Issue[] = [],
    modules: Rec[] = grid.modules,
    sectionMeta: Rec[] = [];
  modules.forEach((mod) =>
    mod.sectionIndexes.forEach(
      (globalIndex: number, localIndex: number) =>
        (sectionMeta[globalIndex] = {
          module: mod,
          moduleId: mod.id,
          localIndex,
          sectionId: canonicalSectionId(mod.id, localIndex),
        }),
    ),
  );
  // MOD-DEC-483: the outer sides of the wardrobe — the left one of the leftmost body, the right one of the rightmost —
  // take the decor the project chose for them (materials.ts); marked only when a choice is made.
  const sides = (d.materialSelection?.sides ?? null) as Rec | null,
    outer = (side: 'left' | 'right', mod: Rec) =>
      !!sides?.[side] && (side === 'left' ? modules.every((x) => x.start >= mod.start) : modules.every((x) => x.end <= mod.end));
  modules.forEach((mod) => {
    const geometry = mod.geometry,
      settings = geometry.settings,
      D = geometry.depth,
      bodyHeight = geometry.bodyHeight,
      installationOffset = geometry.sideBottomY,
      baseElevation = geometry.bottomBottomY,
      innerH = geometry.innerH;
    const leftId = `${mod.id}-CARCASS-SIDE-L`,
      rightId = `${mod.id}-CARCASS-SIDE-R`,
      topId = `${mod.id}-CARCASS-TOP`,
      bottomId = `${mod.id}-CARCASS-BOTTOM`,
      backId = `${mod.id}-CARCASS-BACK`,
      innerWidth = mod.externalWidth - 2 * t,
      V2 = WardrobeStandardPreset.visibleEdgeBand;
    mod.panelIds = { left: leftId, right: rightId, top: topId, bottom: bottomId, back: backId };
    for (const [id, side, kind] of [
      [leftId, 'левая', 'sideLeft'],
      [rightId, 'правая', 'sideRight'],
    ] as const)
      addPart(
        parts,
        {
          id,
          name: `${mod.id} — наружная боковина ${side}`,
          L: bodyHeight,
          W: D,
          T: t,
          q: 1,
          kind,
          handedness: kind === 'sideLeft' ? 'left' : 'right',
          role: 'loadBearingPanel',
          moduleId: mod.id,
          sectionId: null,
          floorContactEdges: !onLegs(settings.baseSystem) ? ['bottom'] : [],
          edges: edges(V2, '', '', ''),
          ...(outer(kind === 'sideLeft' ? 'left' : 'right', mod) ? { outerSide: kind === 'sideLeft' ? 'left' : 'right' } : {}),
        },
        policy,
      );
    addPart(parts, { id: topId, name: `${mod.id} — крыша`, L: innerWidth, W: D, T: t, q: 1, kind: 'top', role: 'structuralPanel', moduleId: mod.id, sectionId: null, edges: edges(V2, '', '', '') }, policy);
    addPart(
      parts,
      {
        id: bottomId,
        name: `${mod.id} — ${settings.baseSystem === 'none' ? 'дно на полу' : 'поднятое дно'}`,
        L: innerWidth,
        W: D,
        T: t,
        q: 1,
        kind: 'bottom',
        role: 'loadTransferPanel',
        moduleId: mod.id,
        sectionId: null,
        installationHeight: baseElevation,
        floorContactEdges: settings.baseSystem === 'none' ? ['front', 'rear', 'left', 'right'] : [],
        edges: edges(V2, '', '', ''),
      },
      policy,
    );
    addPart(
      parts,
      {
        id: backId,
        name: `${mod.id} — задняя стенка ХДФ`,
        L: bodyHeight,
        W: mod.externalWidth,
        T: settings.backPanelThickness,
        q: 1,
        kind: 'back',
        role: 'nonStructuralBack',
        materialFamily: 'HDF',
        moduleId: mod.id,
        sectionId: null,
        backPanelIntent: HDF4_BACK_PANEL_INTENT,
        backPanelMode: settings.backPanelMode,
        edges: edges(),
      },
      policy,
    );
    if (settings.baseSystem === 'plinth') {
      const frontId = `${mod.id}-BASE-PLINTH-FRONT`,
        rearId = `${mod.id}-BASE-PLINTH-REAR`,
        frontZStart = settings.plinthSetback,
        // MOD-DEC-198: the rear rail stands forward of the room skirting from the start, so its holes in the sides
        // and the bottom follow it; the prototype moved the rail later and left the holes behind (FINDINGS 215).
        rearZStart = Math.max(0, D - t - rearRailShift(d, mod));
      mod.panelIds.plinth = frontId;
      mod.panelIds.plinthFront = frontId;
      mod.panelIds.plinthRear = rearId;
      const frontRail = addPart(
        parts,
        {
          id: frontId,
          name: `${mod.id} — передняя планка цоколя`,
          L: innerWidth,
          W: settings.plinthHeight,
          T: t,
          q: 1,
          kind: 'plinthFront',
          role: 'baseRail',
          moduleId: mod.id,
          sectionId: null,
          setback: settings.plinthSetback,
          worldZStart: frontZStart,
          worldZEnd: frontZStart + t,
          worldZCenter: frontZStart + t / 2,
          supportsRaisedBottom: true,
          floorContactEdges: ['bottom'],
          requiresTechnologyConfirmation: true,
          edges: edges(),
        },
        policy,
      );
      const rearRail = addPart(
        parts,
        {
          id: rearId,
          name: `${mod.id} — задняя планка цоколя`,
          L: innerWidth,
          W: settings.plinthHeight,
          T: t,
          q: 1,
          kind: 'plinthRear',
          role: 'baseRail',
          moduleId: mod.id,
          sectionId: null,
          worldZStart: rearZStart,
          worldZEnd: rearZStart + t,
          worldZCenter: rearZStart + t / 2,
          supportsRaisedBottom: true,
          backPanelMode: settings.backPanelMode,
          floorContactEdges: ['bottom'],
          requiresTechnologyConfirmation: true,
          edges: edges(),
        },
        policy,
      );
      // MOD-DEC-364 (FINDINGS 382): the ends of a rail narrower than 200 mm by its height; a higher one keeps 20 and 50 mm.
      const railLayout = narrowJointLayout(settings.plinthHeight) ?? undefined;
      for (const rail of [frontRail, rearRail]) addPlinthRailConnections(parts, holes, connections, supportContacts, constructabilityIssues, {
          mod,
          rail,
          leftId,
          rightId,
          bottomId,
          layout: railLayout,
          bottomDowel: wardrobeCarcass.constants.plinthRailDowel.value,
        });
    } else if (onLegs(settings.baseSystem)) {
      // MOD-DEC-483: behind a decorative plinth the legs stand as the open ones; the plinth is the prototype's
      // decorative strip before the legs (dpCompose, optional-parts.ts): board of the carcass, between the planes of
      // the sides, flush with the front edge, from the floor to the raised bottom. Its clips are the legs' (fittings).
      if (settings.baseSystem === 'legsPlinth') {
        const id = `${mod.id}-BASE-DECORATIVE`;
        mod.panelIds.decorativePlinth = id;
        addPart(parts, decorativePlinthPart(mod, t, geometry.floorY, geometry.sideBottomY), policy);
      }
      hardwarePlaceholders.push(
        makeHardwarePlaceholder(`${mod.id}-HW-FIXED-LEGS`, 'fixedLegs', mod.id, 'Временные нерегулируемые ножки: модель, нагрузка, количество, точки установки и присадка не определены.', {
          height: settings.fixedLegHeight,
        }),
      );
    }
    const { stations, dowels } = carcassJointLayout(D);
    (
      [
        [leftId, 'C'],
        [rightId, 'D'],
      ] as const
    ).forEach(([side, edgeTB], si) => {
      (
        [
          [topId, bodyHeight - t / 2],
          [bottomId, baseElevation - installationOffset + t / 2],
        ] as const
      ).forEach(([tb, xSide], bi) => {
        const dpStart = holes.length;
        stations.forEach((dep) => addConfirmatThroughHole(holes, side, 'inside', xSide, dep, 'Евровинт — плоскость', {}, t));
        stations.forEach((dep) => addConfirmatBlindHole(holes, tb, edgeTB, dep, 'Евровинт — торец', {}, t));
        const id = `${mod.id}-C-SIDE${si + 1}-${bi ? 'BOTTOM' : 'TOP'}`;
        connections.push({ id, type: 'confirmat', a: side, b: tb, fastener: confirmat.name, ...confirmatPreset, qty: stations.length, moduleId: mod.id });
        dpOwnOperations(holes, dpStart, [side, tb], id);
        addNarrowJointDowels(holes, connections, { id, dowels, through: side, face: 'inside', receiving: tb, edge: edgeTB, place: (at) => ({ x: xSide, y: at, offset: at }), moduleId: mod.id });
      });
    });
    mod.sectionIndexes.forEach((globalIndex: number, localIndex: number) => {
      const meta = sectionMeta[globalIndex];
      if (localIndex > 0) {
        const dividerX = grid.sections[globalIndex].nominalStart - t / 2,
          divId = `${meta.sectionId}-DIVIDER01`,
          center = dividerX + t / 2 - (mod.start + t);
        addPart(
          parts,
          {
            id: divId,
            name: `${meta.sectionId} — внутренняя перегородка`,
            L: innerH,
            W: D,
            T: t,
            q: 1,
            kind: 'divider',
            handedness: 'center',
            role: 'loadBearingPanel',
            moduleId: mod.id,
            sectionId: meta.sectionId,
            worldX: dividerX,
            edges: edges(V2, '', '', ''),
          },
          policy,
        );
        (
          [
            [topId, 'D'],
            [bottomId, 'C'],
          ] as const
        ).forEach(([tb, edgeDiv], bi) => {
          const dpStart = holes.length;
          stations.forEach((dep) => addConfirmatThroughHole(holes, tb, 'inside', center, dep, 'Евровинт — плоскость', {}, t));
          stations.forEach((dep) => addConfirmatBlindHole(holes, divId, edgeDiv, dep, 'Евровинт — торец', {}, t));
          const id = `${meta.sectionId}-C-DIV-${bi ? 'BOTTOM' : 'TOP'}`;
          connections.push({ id, type: 'confirmat', a: divId, b: tb, fastener: confirmat.name, ...confirmatPreset, qty: stations.length, moduleId: mod.id, sectionId: meta.sectionId });
          dpOwnOperations(holes, dpStart, [divId, tb], id);
          addNarrowJointDowels(holes, connections, { id, dowels, through: tb, face: 'inside', receiving: divId, edge: edgeDiv, place: (at) => ({ x: center, y: at, offset: at }), moduleId: mod.id, sectionId: meta.sectionId });
        });
      }
    });
  });
  for (let i = 0; i < modules.length - 1; i++) {
    const a = modules[i]!,
      b = modules[i + 1]!,
      connector = makeHardwarePlaceholder(`MC-${a.id}-${b.id}`, 'furnitureConnectingBolt', 'wardrobe', 'Межкорпусная мебельная стяжка: модель и точная присадка будут определены после выбора фурнитуры.', {
        between: [a.id, b.id],
        recommendedZones: WardrobeStandardPreset.moduleConnectorZones,
      }) as Rec;
    moduleConnectors.push(connector);
    hardwarePlaceholders.push(connector);
    connections.push({
      id: connector.id,
      type: 'moduleConnector',
      a: a.panelIds.right,
      b: b.panelIds.left,
      fastener: 'furnitureConnectingBolt — требуется подтверждение',
      qty: connector.recommendedZones.length,
      requiresHardwareConfirmation: true,
      zones: connector.recommendedZones,
    });
  }
  const sectionsData = d.sections.map((_: Rec, i: number) => ({
    id: sectionMeta[i]!.sectionId,
    type: 'Section',
    ...grid.sections[i],
    shelfYs: [],
    fixedShelfYs: [],
    rodYs: [],
    drawerYs: [],
    drawers: [],
    facades: [],
    interiorElements: [],
    shelfDeflection: null,
  }));
  // W7: the doors are planned before the fill, so that the drawers know their spacers (MOD-DEC-331, 360); the drawers
  // are built with the fill of their section, then the doors and their hinges keep off them (FE-04, MOD-DEC-050).
  const walls = { left: !!settings.leftWall, right: !!settings.rightWall, width: W },
    catalog = layout.hardware.hinges,
    facadePlan = planFacades({ d, gap, grid, sectionMeta, installedHeight }),
    spacers = drawerSpacerPlan({ d, sectionMeta, sectionsData, parts, t, catalog, walls }, facadePlan),
    slide = layout.hardware.drawerSlides.slides.find((s) => s.id === WARDROBE_DRAWER_SLIDE)!;
  // W6: shelves, rods and local partitions of the sections, before the back is set in its rebate, as model() does.
  const fill: Rec = { t, parts, holes, grooves, connections, drawerUnits: [] };
  buildFill(fill, d, fillSections(modules, grid, sectionsData, d), {
    gap: layout.gap,
    corpusDecorId: layout.corpusDecorId,
    shelfSupports: layout.hardware.shelfSupports,
    fittings: layout.hardware.fittings,
    materials: layout.hardware.materials,
    drawers: {
      gap: layout.gap,
      seamY: facadePlan.profile.seamY,
      standardProfile: facadePlan.profile.profileId === STANDARD_FACADE_PROFILE_ID,
      regions: facadePlan.regions,
      slide,
      slides: layout.hardware.drawerSlides,
      systems: layout.hardware.drawerSystems,
      plan: (i) => ({ spacers: spacers[i] ?? [], shiftMm: drawerShifts[i] ?? 0 }),
    },
  });
  const drawerUnits: DrawerUnit[] = fill.drawerUnits;
  // The doors and their hinges, section by section, before the details of the bodies as in the prototype (task W4).
  const facades = buildFacades({ d, policy, gap, t, installedHeight, grid, sectionMeta, sectionsData, parts, holes, connections, catalog, walls, drawerUnits, storageUnits: fill.storageUnits ?? [] }, facadePlan);
  // LIFT (MOD-DEC-320): the lift fronts of the sections that ask for one, each with its FACADE_LIFT record.
  const liftMechanisms = buildLifts({ d, policy, t, sectionMeta, sectionsData, parts, catalog: layout.hardware.lifts }, planLifts({ d, gap, grid, sectionMeta }, facadePlan));
  for (const mod of modules) {
    const g = mod.geometry;
    applyRebate(
      {
        modules: [mod],
        parts: parts.filter((p) => p.moduleId === mod.id),
        grooves,
        geometry: g,
        D: g.depth,
        t,
      },
      g.back,
    );
    // W9: the partitions of a sliding wardrobe stand behind the door system (sliding.ts, FINDINGS 351).
    placePartitionsBehindSystem({ parts: parts.filter((p) => p.moduleId === mod.id), holes, connections, geometry: g }, d);
  }
  applyDetails({ parts, holes, grooves, connections, modules, sectionsData, t }, d);
  const depthProfile = d.depthProfile;
  parts.forEach((p) => {
    p.dimensionBasis = depthProfile?.status === 'UNKNOWN' ? 'UNKNOWN' : 'FINISHED_PART';
    p.dimensionTransform = { id: DE_VERSION, version: 1, sourceBasis: depthProfile?.sourceBasis ?? 'PROTOTYPE_SIDE_V1' };
    if (p.kind === 'back' && d.backProfile?.mode === 'overlay') p.T = Number(d.backProfile.materialThicknessMm ?? settings.backPanelThickness);
    applyEdgeModelToPart(p, policy);
    p.orientation = partOrientation(p);
  });
  const composition = dpCompose({ parts, holes, grooves, connections, supportContacts, hardwarePlaceholders, moduleConnectors, modules, sectionsData, geometry, settings, W, H, D, t, innerH }, policy);
  // MOD-DEC-287, 309: without the back panel the rebate is gone and the partition reaches the rear edges of the
  // sides; the front base stays, the depth comes from the geometry, no constant is added (FINDINGS 211).
  for (const mod of modules)
    if (!parts.some((p) => p.id === mod.panelIds.back))
      for (const p of parts.filter((p) => p.moduleId === mod.id && p.kind === 'divider')) {
        const sideRear = mod.geometry.depth,
          front = 0;
        p.W = sideRear - front;
        applyEdgeModelToPart(p, policy);
        p.orientation = partOrientation(p);
      }
  const backSeams = splitBacks(parts, modules, t, policy);
  connections
    .filter((c) => c.subtype === 'plinthRailSide')
    .forEach((c) => {
      c.fastenerHeadFace = 'outside';
      c.visibleFastenerHead = true;
      holes
        .filter((h) => h.connectionId === c.id && h.mode === 'face')
        .forEach((h) => {
          h.fastenerHeadFace = 'outside';
          h.visibleFastenerHead = true;
        });
    });
  // MOD-DEC-485: the latches of the doors opened by pressing — their holes in the front edges get the ids of the operations.
  const latches = pushLatches({ modules, parts, sectionsData, moduleBreaks: grid.breaks, t }, d.fittings ?? null, layout.hardware.fittings, holes);
  normalizeHolePurposes(holes);
  if (!composition.active) assignProductionOperationIds(parts, holes, grooves);
  const floorContactValidation = floorContactEdgeValidator(parts);
  const baseSystem = {
    type: 'BaseSystem',
    kind: settings.baseSystem,
    plinthHeight: settings.baseSystem === 'plinth' ? settings.plinthHeight : 0,
    plinthSetback: settings.baseSystem === 'plinth' ? settings.plinthSetback : 0,
    fixedLegHeight: settings.fixedLegHeight,
    bodyHeight,
    installedHeight,
    requiresHardwareConfirmation: modules.some((mod) => onLegs(mod.geometry.settings.baseSystem)),
  };
  const antiTipSystem = buildAntiTipSystem(settings, modules),
    installationRequirements = [antiTipSystem.installationRequirement],
    core: Rec = { W, H, D, t, innerH, sectionsData, parts, holes, grooves, connections, supportContacts, modules, settings, baseSystem, antiTipSystem, installationRequirements, hardwarePlaceholders, moduleConnectors, constructabilityIssues };
  core.H = Math.max(H, ...modules.map((b) => b.geometry.sideTopY));
  core.D = Math.max(D, ...modules.map((b) => b.geometry.depth));
  // WR-12: the load path of each body by its own base (FINDINGS 212).
  const loadPath = modules
      .map((mod) => loadPathValidator({ ...core, modules: [mod], baseSystem: { ...baseSystem, kind: mod.geometry.settings.baseSystem } }))
      .reduce((a, b) => ({ ...a, paths: [...a.paths, ...b.paths], warnings: [...a.warnings, ...b.warnings] })),
    roomInstallation = roomInstallationValidator(core, policy);
  if (depthProfile?.status === 'NOMINAL')
    for (const op of [...holes, ...grooves])
      Object.assign(op, {
        sourceBasis: 'FE_LOCAL_FINISHED_DATUM',
        dimensionBasis: 'FINISHED_PART',
        coordinateStage: 'POST_EDGING',
        dimensionTransformId: DE_VERSION,
        dimensionTransformVersion: 1,
        productionQualified: false,
      });
  mfAnnotate(parts, policy, layout.hardware.materials);
  settings.advancedModuleWidthInputMm = Number(d.advancedModuleWidthInputMm) || WardrobeStandardPreset.maxCabinetModuleWidth;
  settings.maxCabinetModuleWidth = WardrobeStandardPreset.maxCabinetModuleWidth;
  const m: Rec = {
    composition,
    dimensions: settings.dimensions,
    W,
    H: core.H,
    D: core.D,
    t,
    innerH,
    baseElevation,
    installationOffset,
    installedHeight,
    geometry,
    nominalSectionWidths: grid.nominalSectionWidths,
    clearSectionWidths: grid.clearSectionWidths,
    moduleBreaks: grid.breaks,
    sectionsData,
    parts,
    holes,
    grooves,
    connections,
    supportContacts,
    modules,
    settings,
    baseSystem,
    antiTipSystem,
    installationRequirements,
    floorContactValidation,
    hardwarePlaceholders,
    moduleConnectors,
    constructabilityIssues,
    loadPath,
    roomInstallation,
    // MOD-DEC-701: the seams of the backs in parts, when a back is split.
    ...(backSeams.length ? { backSeams } : {}),
    facadeGapProfile: facades.profile,
    facadeH: facades.facadeH,
    hingeMechanisms: facades.hingeMechanisms,
    liftMechanisms,
    pushLatches: latches,
    facadeIssues: facades.issues,
    facadeFields: facades.fields,
    drawerUnits,
    // MOD-DEC-484: the baskets, trouser racks and pantographs of the sections (storage.ts), when the project has any.
    ...(fill.storageUnits ? { storageUnits: fill.storageUnits } : {}),
    // FE-04 in place of the prototype's HingeCollisionEngine (field map: .hingeCollisions → Graph.unresolved; FINDINGS 391).
    hingeCollisions: {
      type: 'FE04',
      policy: `${fe04.id}@${fe04.version}`,
      issues: facades.hingeMechanisms.filter((h: Rec) => h.fe04.text).map((h: Rec) => ({ level: h.fe04.conflicts.length ? 'warn' : 'info', hingeId: h.id, text: h.fe04.text })),
      requiresHardwareConfirmation: facades.hingeMechanisms.some((h: Rec) => h.fe04.conflicts.length),
    },
  };
  // WR-17: the receiving hole of the confirmat is D5/L35 (FINDINGS 213); WR-18: a side against a room wall is
  // covered like one against a neighbour (MOD-DEC-192, FINDINGS 214).
  Object.assign(m, { totalRods: fill.totalRods ?? 0, shelfSupports: fill.shelfSupports ?? [] });
  // W5: the counts of the base model, before the spare levels of System 32 and the r7 fasteners (r1.html:12750).
  wardrobeBaseSummary(m, d);
  m.hardwareArticles = wardrobeHardwareArticles(m, layout.hardware);
  // MOD-DEC-573, 351: the material of the facades the project refers to, against the catalogue of the release.
  const facadeProblems = facadeChoiceProblems(d, layout.hardware.facades);
  if (facadeProblems.length) m.facadeMaterialProblems = facadeProblems;
  s32SupportInventory(m, d);
  applyFastenersR7(m, d, { confirmatEdgeDepthMm: wardrobeCarcass.constants.confirmatEdgeDepth.value, walls: roomWalls(settings, W) });
  attachFrontGrid(m, d, layout.gapInput, layout.widthInput);
  // W9.2: the doors of a sliding wardrobe — the block m.sliding and the inserts of the leaves as parts (WR-13). They
  // come after the carcass: the opening is read from its panels, the fasteners and the front grid do not see them.
  if (isSliding(d)) {
    const doors = slidingDoorsBlock(m, d, carcassBoxes(m), layout.hardware.fittings.slidingProfiles);
    m.sliding = doors.sliding;
    for (const p of doors.parts) {
      p.dimensionBasis = 'FINISHED_PART';
      p.dimensionTransform = { id: DE_VERSION, version: 1, sourceBasis: depthProfile?.sourceBasis ?? 'PROTOTYPE_SIDE_V1' };
      applyEdgeModelToPart(p, policy);
      p.orientation = partOrientation(p);
    }
    mfAnnotate(doors.parts, policy, layout.hardware.materials);
    parts.push(...doors.parts);
    for (const g of doors.grooves)
      Object.assign(g, { sourceBasis: 'FE_LOCAL_FINISHED_DATUM', dimensionBasis: 'FINISHED_PART', coordinateStage: 'POST_EDGING', dimensionTransformId: DE_VERSION, dimensionTransformVersion: 1, productionQualified: false });
    m.grooves.push(...doors.grooves);
  }
  // FIT (MOD-DEC-480): the rods, legs and handles of the catalogue over the built model — the generator and the price read them.
  m.fittings = wardrobeFittings(m, d, layout.hardware.fittings);
  return { m, d };
}
