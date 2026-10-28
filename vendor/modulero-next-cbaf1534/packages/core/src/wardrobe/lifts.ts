// Lift fronts of the wardrobe (task LIFT, MOD-DEC-320): a section with `facade: 'lift'` — the mezzanine (антресоль,
// MOD-DEC-200) above a body as a rule — gets a front opening upwards instead of hinged doors. The prototype had none.
// The front stands where one overlay door of the section would stand (its region, its field over the base of its own
// body, the depth gap of the doors, 162): one leaf for a flap front (FLAP, откидной), two leaves one above the other
// with the seam of the profile (185) for a folding front (FOLDING, складной). Each front gets one FACADE_LIFT
// mechanism: the row of the lift catalogue chosen by INV-D18-01 (engine/policy/lift-selection.ts) from the carcass,
// the front and its mass with the handle; the working angle by INV-D18-02 (194 for ST04 only, the manufacturer's
// angles kept apart). What the data do not give is not invented: no holes (the lift catalogue has no drilling — the
// mechanism is «присадка неполная», 277), no leaf hinges of a folding front, no body of the mechanism inside the
// carcass; without a compatible row the nearest one stays as a temporary value (the owner's rule of 2026-10-22).
// The space the front sweeps is an estimate — a rotation of the upper leaf about its top edge to the largest working
// angle; the real path of the mechanism is not known (FINDINGS 533).
import type { LiftCatalog, LiftFrontKind } from '../catalog/hardware/lifts.js';
import { liftWorkingAngle, selectLift, type LiftDemand } from '../engine/policy/lift-selection.js';
import { frontGrid as frontGridPolicy } from '../engine/policy/index.js';
import { facadePurchased, facadeThickness } from '../engine/policy/facade-materials.js';
import type { PolicyState, Rec } from '../engine/policy/project-state.js';
import { wardrobeFacades } from '../engine/policy/wardrobe-facades.js';
import { facadeGapProfile, hingePanel, type FacadeContext, type FacadePlan } from './facades.js';
import { addPart, edges } from './primitives.js';
import { WardrobeStandardPreset } from './standard.js';

/** The section asks for a lift front (MOD-DEC-320). */
export const liftRequested = (cfg: Rec): boolean => cfg.facade === 'lift';

/** Kind of the lift front of a section: as entered, else a flap front (Д, FINDINGS 531). */
export const liftKindOf = (cfg: Rec): LiftFrontKind => (cfg.liftKind === 'FOLDING' ? 'FOLDING' : 'FLAP');

/** One leaf of a lift front before it is built. */
export interface LiftLeafPlan {
  id: string;
  name: string;
  left: number;
  width: number;
  bottom: number;
  height: number;
}

/** The lift front of a section before it is built: its leaves and the whole front. */
export interface LiftPlan {
  index: number;
  kind: LiftFrontKind;
  leaves: LiftLeafPlan[];
  /** The whole front: the region of the section, the field of its body. */
  left: number;
  width: number;
  bottom: number;
  height: number;
  /** The section asked for an inset front: the lift front is built overlay (FINDINGS 531). */
  insetRequested: boolean;
}

/**
 * The lift fronts of the sections: the region and the field of one overlay door of the section (planFacades), split
 * into two leaves with the seam of the profile for a folding front; the upper leaf is A.
 */
export function planLifts(ctx: Pick<FacadeContext, 'd' | 'gap' | 'grid' | 'sectionMeta'>, plan: Pick<FacadePlan, 'profile' | 'regions'>): LiftPlan[] {
  const out: LiftPlan[] = [];
  ctx.d.sections.forEach((cfg: Rec, i: number) => {
    if (!liftRequested(cfg)) return;
    const bodyGeo = ctx.sectionMeta[i]!.module.geometry,
      floor = bodyGeo.floorY + facadeGapProfile(ctx.d, ctx.gap, bodyGeo.settings).insetBottom,
      height = bodyGeo.sideTopY - floor - plan.profile.insetTop,
      region = plan.regions[i]!,
      sid = ctx.sectionMeta[i]!.sectionId,
      kind = liftKindOf(cfg),
      seam = plan.profile.seamY,
      leaf = (id: string, name: string, bottom: number, h: number): LiftLeafPlan => ({ id: `${sid}-${id}`, name: `${sid} — ${name}`, left: region.left, width: region.width, bottom, height: h }),
      half = (height - seam) / 2;
    out.push({
      index: i,
      kind,
      leaves: kind === 'FOLDING' ? [leaf('LIFT-A', 'подъёмный фасад, верхняя створка', floor + half + seam, half), leaf('LIFT-B', 'подъёмный фасад, нижняя створка', floor, half)] : [leaf('LIFT-A', 'подъёмный фасад', floor, height)],
      left: region.left,
      width: region.width,
      bottom: floor,
      height,
      insetRequested: cfg.facadeMounting === 'INSET',
    });
  });
  return out;
}

/** Degrees → radians. */
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The volume the front sweeps, in the prototype's axes (x across, y up, z from the front, negative in front of the
 * carcass): the closed front and the upper leaf turned about its top edge to `angleDeg`; a folding front carries its
 * lower leaf folded against the upper one. An estimate: the path of the mechanism is not in the data (FINDINGS 533).
 */
export function liftSweep(p: LiftPlan, doorFront: number, t: number, angleDeg: number): Rec {
  const upper = p.leaves[0]!,
    reach = Math.max(...p.leaves.map((l) => l.height)),
    top = p.bottom + p.height,
    rise = Math.max(0, -Math.cos(rad(angleDeg))) * upper.height,
    out = angleDeg >= 90 ? reach : Math.sin(rad(angleDeg)) * reach;
  return { x0: p.left, x1: p.left + p.width, y0: p.bottom, y1: top + rise + p.leaves.length * t, z0: doorFront - out - p.leaves.length * t, z1: doorFront + t };
}

export interface LiftContext extends Pick<FacadeContext, 'd' | 'policy' | 't' | 'sectionMeta' | 'sectionsData' | 'parts'> {
  catalog: LiftCatalog;
}

/** The leaves of a lift front as parts, its FACADE_LIFT record (the graph's mechanism) and its facade records. */
export function makeLift(ctx: LiftContext, p: LiftPlan): Rec {
  const { d, policy } = ctx,
    // MOD-DEC-573: the lift front is of the thickness of the execution of the facades, otherwise of the corpus board.
    t = facadeThickness(policy as PolicyState, ctx.t),
    meta = ctx.sectionMeta[p.index]!,
    data = ctx.sectionsData[p.index]!,
    cfg: Rec = d.sections[p.index],
    geometry = meta.module.geometry,
    frontGap: number = geometry.settings.dimensions?.Gfront ?? frontGridPolicy.constants.depthGap.value,
    purchased = facadePurchased(policy as PolicyState),
    V2 = WardrobeStandardPreset.visibleEdgeBand,
    z0 = -(frontGap + t);
  for (const l of p.leaves) {
    const part = addPart(
      ctx.parts,
      { id: l.id, name: l.name, L: l.height, W: l.width, T: t, q: 1, kind: 'facade', role: 'door', liftFront: p.kind, moduleId: meta.moduleId, sectionId: meta.sectionId, doorBottomClearance: l.bottom, facadeRowId: null, edges: edges(V2, V2, V2, V2) },
      policy,
    );
    if (!purchased) part.supplyMode = 'MANUFACTURE';
    part.facadeBox = { x0: l.left, x1: l.left + l.width, y0: l.bottom, y1: l.bottom + l.height, z0, z1: z0 + t };
    data.facades.push({ id: l.id, rowId: null, left: l.left, width: l.width, height: l.height, hinges: 0, hingeSide: null, hingeCenters: [], productionProfile: null, doorBottomClearance: l.bottom, hingeModel: null, liftFront: p.kind, requiresHardwareConfirmation: true });
    data.interiorElements.push({ id: l.id, type: 'liftFront', moduleId: meta.moduleId, sectionId: meta.sectionId, requiresHardwareConfirmation: true });
  }
  const left = hingePanel(ctx, p.index, 'left'),
    right = hingePanel(ctx, p.index, 'right'),
    massInput = Number(cfg.doorMassKg),
    handleInput = Number(cfg.liftHandleMassKg),
    frontMassKg = massInput > 0 ? massInput : p.leaves.reduce((n, l) => n + (l.height * l.width * t * wardrobeFacades.constants.boardDensity.value) / 1e9, 0), // mm³ → m³
    demand: LiftDemand = {
      frontKind: p.kind,
      carcassHeightMm: geometry.sideTopY - geometry.sideBottomY,
      carcassWidthMm: meta.module.externalWidth,
      frontHeightMm: p.height,
      frontThicknessMm: t,
      frontMassKg,
      handleMassKg: handleInput >= 0 && cfg.liftHandleMassKg !== undefined && cfg.liftHandleMassKg !== null && cfg.liftHandleMassKg !== '' ? handleInput : null,
    },
    selection = selectLift(demand, ctx.catalog),
    row = selection.chosen ?? selection.temporary,
    candidate = selection.candidates.find((c) => c.liftId === row?.id) ?? null,
    angle = row ? liftWorkingAngle(row) : null,
    sweep = angle?.maxDeg !== null && angle?.maxDeg !== undefined ? liftSweep(p, z0, t, angle.maxDeg) : null,
    id = `${meta.sectionId}-C-LIFT`,
    article = row?.articles[0]?.article ?? null;
  return {
    id,
    sectionId: meta.sectionId,
    moduleId: meta.moduleId,
    kind: p.kind,
    leafIds: p.leaves.map((l) => l.id),
    panelIds: [...new Set([left.panel, right.panel])],
    demand,
    massSource: massInput > 0 ? 'INPUT' : 'BOARD_DENSITY',
    purchasedFacade: purchased,
    insetRequested: p.insetRequested,
    status: selection.chosen ? 'SELECTED' : row ? 'TEMPORARY' : 'NOT_FOUND',
    liftId: row?.id ?? null,
    article,
    priceRub: row?.articles[0]?.priceRub.value ?? null,
    series: row?.series ?? null,
    quantity: row?.kitsPerFront ?? 1,
    loadBasis: row?.loadBasis ?? null,
    loadValue: candidate?.loadValue ?? null,
    load: row?.load.value ?? null,
    heightBasis: row?.heightBasis ?? null,
    heightRange: row?.heightMm.value ?? null,
    checks: candidate?.checks ?? [],
    reason: selection.reason,
    workingAngle: angle,
    manufacturerAngles: row?.manufacturerAngles ?? [],
    sweep,
    sweepTopY: sweep ? sweep.y1 : null,
    text: row
      ? `${id}: ${row.brand} ${article} (${row.series}), ${selection.chosen ? 'подобран по строке' : 'временное значение'} — ${candidate!.checks
          .filter((c) => c.code === 'HEIGHT' || c.code === 'LOAD')
          .map((c) => c.text)
          .join('; ')}`
      : `${id}: подъёмник не подобран — ${selection.reason}`,
  };
}

/** The lift fronts of every planned section, appended to the parts and connections of the context. */
export function buildLifts(ctx: LiftContext, plans: LiftPlan[]): Rec[] {
  return plans.map((p) => makeLift(ctx, p));
}
