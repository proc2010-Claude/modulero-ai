// Physical graph: every board as a box in technology axes, joints between boards, loads,
// mechanisms and unresolved engineering questions. All other outputs derive from it.
// Numbers and rules: engine/policy/home.ts, by the rule set of the project (r3 — the prototype, r4 — task H1).
import { articleDimension, articleItem } from '../catalog/hardware/articles.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { HOME, homeRules } from '../engine/policy/home.js';
import { carcassDecorId } from './decor.js';
import { aFront, allFronts, availableBays, backDepthMm, backRecessMm, bay, bounds, foot, frontGeometry, frontsCloser, glassOf, hdfBackOf, hdfDrawerBottomOf, homeBackSplit, mirrorHeightMm, nicheLimits, overallHeightMm, partitionFrom, pedestalRight, rimHeightMm, sideFoot, topContour, topT, wallHangingOf } from './geometry.js';
import { drawerBoxWalls, hangerLoadKg, hingeProfile, homeDrawerRunner, homeLegs, homeLift, homeLights, homeShelfSupport, runnerInfo, shelfSupportCapacityKg, smallDrawerPattern, type DrawerBoxWall } from './mechanisms.js';
import { FRONT_ROLES, purchasedFronts } from './facades.js';
import { homePartBandable } from './edge-bands.js';
import { withManualBands } from '../engine/edge-overrides.js';
import type {
  AxisIndex,
  BeamLoad,
  Board,
  Body,
  Front,
  GraphPart,
  HomeProject,
  Joint,
  PhysicalGraph,
  SemanticRole,
  Unresolved,
  Vec3,
} from './types.js';

/** Carcass parts whose rebate holds a back of HDF (r5, MOD-DEC-515): the sides, the shared side of a desk, the bottom, the top. */
/** The vertical boards of a body: its sides, the shared side of a desk and the partitions. */
const VERTICAL_ROLES: ReadonlySet<SemanticRole> = new Set(['bearing_side', 'bearing_shared_side', 'bearing_divider']);
export const REBATE_ROLES: ReadonlySet<SemanticRole> = new Set(['bearing_side', 'bearing_shared_side', 'bottom', 'continuous_top']);

/** The walls of a drawer box whose groove holds a bottom of HDF (r5, MOD-DEC-574). */
export const DRAWER_WALL_ROLES: ReadonlySet<SemanticRole> = new Set(['drawer_side', 'drawer_inner_front', 'drawer_back']);

/** Material of the back of HDF in the graph: the decor id the wardrobe gives HDF (`decorId: 'HDF'`). */
export const HDF_BACK_MATERIAL = 'HDF';

/**
 * Simply supported beam: self weight as uniform load plus payload as a point load at mid-span; r5 (MOD-DEC-748): the
 * payload uniform too, and the payload the beam takes at L/200 (allowablePayloadKg).
 */
export function beam(
  p: HomeProject,
  bodyId: string,
  elementId: string,
  Lspan: number,
  depth: number,
  t: number,
  payload: number,
  physicalLength = Lspan,
): BeamLoad {
  const E = p.materialProfile === 'legacy-custom' ? HOME.elasticityLegacy : HOME.elasticity,
    self = (physicalLength * depth * t * p.density) / 1e9,
    I = (depth * t ** 3) / 12,
    uniform = homeRules(p).uniformLoadLimit,
    deflection = (5 * self * 9.81 * Lspan ** 3) / (384 * E * I) + (payload * 9.81 * Lspan ** 3) / ((uniform ? 384 / 5 : 48) * E * I),
    limit = Lspan / HOME.deflectionScreen;
  return {
    bodyId,
    elementId,
    spanMm: Lspan,
    physicalLengthMm: physicalLength,
    depthMm: depth,
    thicknessMm: t,
    selfMassKg: self,
    selfMassBasis: physicalLength === Lspan ? 'SCREEN_SPAN_MASS' : 'FINITE_PANEL_MASS',
    payloadKg: payload,
    totalMassKg: self + payload,
    deflectionMm: deflection,
    deflectionLimitMm: limit,
    screenPass: deflection <= limit,
    physicalQualified: false,
    ...(uniform ? { allowablePayloadKg: Math.max(0, Math.floor((limit * 384 * E * I) / (5 * 9.81 * Lspan ** 3) - self + 1e-9)) } : {}),
  };
}

export function physicalGraph(p: HomeProject, hw: HardwareCatalogs): PhysicalGraph {
  const R = homeRules(p),
    kit = articleItem(hw.articles, HOME.hardwareItems.hinge),
    parts: GraphPart[] = [],
    joints: Joint[] = [],
    sections: Record<string, unknown>[] = [],
    supports: PhysicalGraph['supports'] = [],
    loads: BeamLoad[] = [],
    mechanisms: Record<string, unknown>[] = [],
    unresolved: Unresolved[] = [],
    t = p.thickness,
    T = topT(p),
    e = p.edgeThickness,
    // r5 (MOD-DEC-574, FINDINGS 1304, 1755): the bottoms of HDF in a groove of the walls of their box, as the wardrobe's —
    // of the boxes of the prototype on DB4501; the runner of each drawer decides its box.
    hdfBottoms = new Set<string>(),
    hdfBottom = hdfDrawerBottomOf(p);

  function add(
    b: Body,
    key: string,
    role: SemanticRole,
    o: Vec3,
    ext: Vec3,
    axes: AxisIndex[],
    edged: number[] = [],
    elementId: string | null = null,
  ): GraphPart {
    // r5: the thickness of each edge by the kind of the part (513, FINDINGS 843); r3, r4: one thickness of the project.
    // A front bought ready-made comes finished, without a band of ours (MOD-DEC-573).
    const auto: Record<string, number> = FRONT_ROLES.has(role) && purchasedFronts(p) ? {} : R.edgeByPart ? { ...R.edgeByPart[role] } : Object.fromEntries(edged.map((i) => [String(i), e])),
      material = role === 'floor_pad' ? 'hardware' : role === 'hdf_back' || (role === 'drawer_bottom' && hdfBottoms.has(b.id + ':' + key)) ? HDF_BACK_MATERIAL : carcassDecorId(p),
      // MOD-DEC-743: the manual bands of the project on a part of chipboard (edge-bands.ts).
      own = homePartBandable(p, hw, role, material) ? p.edgeOverrides?.[b.id + ':' + key] : undefined,
      edge = own ? withManualBands(auto, own, false) : auto,
      sizes = axes.map((i) => ext[i]),
      normal = ([0, 1, 2] as AxisIndex[]).find((i) => !axes.includes(i))!;
    const part: GraphPart = {
      id: b.id + ':' + key,
      bodyId: b.id,
      elementId,
      semanticRole: role,
      origin_mm: [b.x + o[0], o[1], b.y + o[2]],
      extent_mm: ext,
      local_uv_world_axes: axes,
      finished_uv_mm: sizes,
      cut_uv_mm: [sizes[0] - (edge[0] || 0) - (edge[1] || 0), sizes[1] - (edge[2] || 0) - (edge[3] || 0)],
      thickness_mm: ext[normal],
      edge_mm: edge,
      ...(own ? { auto_edge_mm: auto, edge_overrides: { ...own } } : {}),
      material,
    };
    parts.push(part);
    return part;
  }

  function joint(cam: GraphPart, stud: GraphPart, orientation: string, recipe: string | null = null): Joint {
    const overlap = cam.origin_mm.map(
      (v, i) => Math.min(v + cam.extent_mm[i], stud.origin_mm[i] + stud.extent_mm[i]) - Math.max(v, stud.origin_mm[i]),
    );
    const contactAxis = overlap.findIndex((v) => Math.abs(v) < 0.1),
      area = overlap.filter((_, i) => i !== contactAxis).reduce((s, v) => s * Math.max(0, v), 1);
    const row: Joint = {
      id: cam.id + '->' + stud.id,
      camPartId: cam.id,
      studPartId: stud.id,
      recipe: recipe || 'RASTEX' + cam.thickness_mm + '_DU325',
      group: cam.semanticRole.startsWith('drawer_') ? 'drawer' : 'carcass',
      orientation,
      connectorStations: 2,
      woodDowels: recipe === 'MAKMART_S16' ? 0 : 2,
      contactAxis,
      contactAreaMm2: area,
    };
    joints.push(row);
    return row;
  }

  // r5 (MOD-DEC-515, FINDINGS 939): the back of HDF in the rebate of the sides, the bottom and the top, by the profile of
  // the wardrobe (287) — between the inner faces of the sides x0…x1 and of the bottom and the top z0…z1. It bears no cam
  // joint: the rebates are its fit (engine.ts). The inner parts end at the rebate, not at a back of the board.
  // r5 (MOD-DEC-701, FINDINGS 2610): a back of HDF wider and higher than 800 mm is in parts on the partitions, the fixed
  // shelves or H-profiles (homeBackSplit); the first part keeps the id of the back, the others follow it as `back-P2`…
  const backOf = (b: Body, x0: number, x1: number, z0: number, z1: number): GraphPart[] => {
    if (!b.back) return [];
    const q = hdfBackOf(p, b);
    if (!q) return [add(b, 'back', 'structural_back', [x0, b.d - t, z0], [x1 - x0, t, z1 - z0], [0, 2])];
    return homeBackSplit(p, b)!.pieces.map((x, k) => {
      const part = add(b, k ? 'back-P' + (k + 1) : 'back', 'hdf_back', [x.x0, b.d - backRecessMm(p, b) - q.rearClearanceMm - q.thicknessMm, x.y0], [x.x1 - x.x0, q.thicknessMm, x.y1 - x.y0], [0, 2]);
      unresolved.push({ code: 'BACK_HDF', partId: part.id });
      return part;
    });
  };

  for (const b of p.bodies) {
    // r5 (MOD-DEC-516): the bottom stands on the pads, the plinth or the legs of the body; the sides go down to the
    // floor over a plinth, as in the wardrobe (291), and end at the legs or the pads otherwise.
    const a = aFront(p, b),
      rear = backDepthMm(p, b),
      pad = foot(p, b),
      low = sideFoot(p, b),
      top = add(b, 'top', 'continuous_top', [0, 0, b.h - T], [b.w, b.d, T], [0, 1], [0, 1, 2, 3]),
      // r5 (MOD-AI-73, FINDINGS 3317): the front corners of the top rounded by the radius of the body.
      contour = topContour(p, b),
      left = add(b, 'side-left', 'bearing_side', [0, a, low], [t, b.d - a, b.h - T - low], [2, 1], [2]),
      right = add(b, 'side-right', 'bearing_side', [b.w - t, a, low], [t, b.d - a, b.h - T - low], [2, 1], [2]);
    if (contour) top.contour_mm = contour;
    const verts = [left, right],
      byBoundary = new Map<string, GraphPart>([
        ['left', left],
        ['right', right],
      ]);
    joint(left, top, 'top');
    joint(right, top, 'top');
    // r5 (MOD-AI-40, FINDINGS 3313): the rim on the top — boards of the carcass at its edges, the sides up to the back
    // one, each on the cams to the top.
    const H = rimHeightMm(p, b),
      rimBack = b.rim?.sides.includes('back') ? t : 0;
    if (H)
      for (const side of b.rim!.sides) {
        const rim =
          side === 'back'
            ? add(b, 'rim-back', 'top_rim', [0, b.d - t, b.h], [b.w, t, H], [0, 2])
            : add(b, 'rim-' + side, 'top_rim', [side === 'left' ? 0 : b.w - t, 0, b.h], [t, b.d - rimBack, H], [1, 2]);
        joint(rim, top, 'rim');
      }
    // r5 (MOD-AI-73, FINDINGS 3322): the mirror over the top — a board of the carcass on its rear edge, on the cams to
    // it as the rear rim, and the mirror of the catalogue of glass on its face within the margin, glued: the glazier's.
    const M = mirrorHeightMm(p, b);
    if (M) {
      const V = R.vanityMirror!,
        G = hw.glass.glass.find((x) => x.id === V.glassId)!.thicknessMm,
        board = add(b, 'mirror-board', 'mirror_board', [0, b.d - t, b.h], [b.w, t, M], [0, 2]),
        glass = add(b, 'mirror', 'mirror', [V.marginMm, b.d - t - G, b.h + V.marginMm], [b.w - 2 * V.marginMm, G, M - 2 * V.marginMm], [0, 2]);
      Object.assign(glass, { material: V.glassId, edge_mm: {}, cut_uv_mm: [...glass.finished_uv_mm] });
      joint(board, top, 'rim');
    }
    let bottom: GraphPart, backs: GraphPart[], back: GraphPart | undefined;
    const standing: [GraphPart, string][] = [];
    const bs = availableBays(p, b);
    if (b.kind === 'desk') {
      // Desk = pedestal (left bay) + knee space under a continuous top, closed by a rear apron. r5 (MOD-AI-41): the
      // pedestal on the right — the desk mirrored about its middle.
      const q = b.partitions[0],
        P = q.x + t / 2,
        mirror = pedestalRight(b),
        outer = mirror ? right : left,
        divider = add(b, q.id, 'bearing_shared_side', [P - t, a, low], [t, b.d - a, b.h - T - low], [2, 1], [2], q.id);
      verts.push(divider);
      byBoundary.set(q.id, divider);
      joint(divider, top, 'top');
      bottom = mirror ? add(b, 'bottom', 'bottom', [P, a, pad], [b.w - t - P, b.d - a, t], [0, 1], [2]) : add(b, 'bottom', 'bottom', [t, a, pad], [P - 2 * t, b.d - a, t], [0, 1], [2]);
      backs = mirror ? backOf(b, P, b.w - t, pad + t, b.h - T) : backOf(b, t, P - t, pad + t, b.h - T);
      back = backs[0];
      for (const side of [outer, divider]) {
        joint(bottom, side, 'bottom');
        if (back?.semanticRole === 'structural_back') joint(back, side, 'back');
      }
      if (back?.semanticRole === 'structural_back') {
        joint(back, bottom, 'back-bottom');
        joint(back, top, 'back-top');
      }
      const apron = mirror
        ? add(b, 'stretcher', 'rear_apron', [t, b.d - t, b.h - T - HOME.apronHeight], [P - 2 * t, t, HOME.apronHeight], [0, 2], [2])
        : add(b, 'stretcher', 'rear_apron', [P, b.d - t, b.h - T - HOME.apronHeight], [b.w - P - t, t, HOME.apronHeight], [0, 2], [2]);
      joint(apron, divider, 'apron');
      joint(apron, mirror ? left : right, 'apron');
      loads.push(beam(p, b.id, top.id, mirror ? P - t : b.w - P, b.d, T, p.plannedDeskLoadKg));
      sections.push({
        id: b.id + ':knee',
        bodyId: b.id,
        topPartId: top.id,
        leftPartId: mirror ? left.id : divider.id,
        rightPartId: mirror ? divider.id : right.id,
        kneeBoxMm: mirror ? [b.x + t, a, b.y + low, P - 2 * t, b.d - t - a, b.h - T - low] : [b.x + P, a, b.y + low, b.w - P - t, b.d - t - a, b.h - T - low],
        rearApronBottomMm: b.y + b.h - T - HOME.apronHeight,
      });
    } else {
      bottom = add(b, 'bottom', 'bottom', [t, a, pad], [b.w - 2 * t, b.d - a, t], [0, 1], [2]);
      backs = backOf(b, t, b.w - t, pad + t, b.h - T);
      back = backs[0];
      for (const side of [left, right]) {
        joint(bottom, side, 'bottom');
        if (back?.semanticRole === 'structural_back') joint(back, side, 'back');
      }
      if (back?.semanticRole === 'structural_back') {
        joint(back, bottom, 'back-bottom');
        joint(back, top, 'back-top');
      }
      for (const q of b.partitions) {
        // r5 (MOD-AI-75): a partition on a shelf stands from its top face up to the top, at its front and of its depth
        // (as the local partition of the wardrobe, MOD-DEC-234); it is fixed to the shelf below, after the shelves.
        const z0 = q.from === undefined ? null : partitionFrom(p, b, q),
          d =
            z0 === null
              ? add(b, q.id, 'bearing_divider', [q.x - t / 2, a, pad + t], [t, b.d - a - rear, b.h - T - pad - t], [2, 1], [2], q.id)
              : add(b, q.id, 'bearing_divider', [q.x - t / 2, a + HOME.shelfFrontSetback, z0], [t, b.d - a - rear - HOME.shelfFrontSetback, b.h - T - z0], [2, 1], [2], q.id);
        verts.push(d);
        byBoundary.set(q.id, d);
        joint(d, top, 'top');
        if (z0 === null) joint(d, bottom, 'divider-bottom');
        else standing.push([d, q.from!]);
      }
      // The top spans between the verticals that reach it: over the niches no shelf closes from above.
      for (const opening of bs.filter((o) => o.upper === undefined)) {
        const r = bay(p, b, opening);
        loads.push(beam(p, b.id, top.id, r.right - r.left + t, b.d, T, p.plannedDeskLoadKg));
      }
    }
    // Floor pads under every vertical board (and the middle of a chest bottom) — when the body has no plinth or legs; a
    // partition standing on a shelf has none (r5, MOD-AI-75).
    const loadLines = b.base ? [] : verts.filter((v) => !standing.some(([d]) => d === v)).map((v) => ({ id: v.id, center: v.origin_mm[0] - b.x + t / 2 }));
    if (!b.base && HOME.middlePadTemplates.includes(p.templateId) && !loadLines.some((l) => Math.abs(l.center - b.w / 2) < 0.1))
      loadLines.push({ id: bottom.id + ':middle', center: b.w / 2 });
    // r5 (MOD-DEC-516, FINDINGS 946): the plinth of the wardrobe under the bottom, between the sides (of the pedestal of
    // a desk) — the front rail back from the front of the carcass (291), the rear one at the rear (456); the rails stand
    // on the floor and carry the bottom.
    if (b.base?.kind === 'plinth') {
      const C = R.baseChoice!,
        mirror = pedestalRight(b),
        x0 = mirror ? b.partitions[0].x + t / 2 : t,
        x1 = b.kind === 'desk' && !mirror ? b.partitions[0].x + t / 2 - t : b.w - t,
        sides = b.kind === 'desk' ? [mirror ? right : left, byBoundary.get(b.partitions[0].id)!] : [left, right];
      for (const [key, y] of [
        ['plinth-front', a + C.plinthSetbackMm],
        // In front of the rebate of HDF (456); in front of a bearing back of the board, whose fixing to the bottom it
        // would meet (FINDINGS 946); without a back — at the rear.
        ['plinth-rear', b.d - t - (hdfBackOf(p, b)?.rebateWidthMm ?? (b.back ? t : 0))],
      ] as const) {
        const rail = add(b, key, 'plinth_rail', [x0, y, 0], [x1 - x0, t, pad], [0, 2]);
        for (const side of sides) joint(rail, side, key);
        joint(rail, bottom, key);
      }
    }
    // r5 (MOD-DEC-516, FINDINGS 947): legs of the catalogue whose height no leg gives stand as the nearest, temporary.
    const legs = b.base?.kind === 'legs' ? homeLegs(p, hw, b) : null;
    if (legs?.temporary) unresolved.push({ code: 'LEGS_TEMPORARY', partId: bottom.id, reason: legs.temporary });
    for (const line of loadLines)
      for (const [j, y] of [a + HOME.padFrontOffset, b.d - HOME.padRearOffset].entries()) {
        const q = add(b, 'pad:' + line.id + ':' + j, 'floor_pad', [line.center - HOME.padWidth / 2, y, 0], [HOME.padWidth, HOME.padLength, pad], [0, 1]);
        supports.push({
          bearingPartId: line.id,
          floorPartId: q.id,
          viaBottom: !verts.some((v) => v.id === line.id && v.origin_mm[2] === b.y + pad),
        });
      }
    for (const opening of bs) {
      // The part of a split back behind the middle of the bay (the lower one of a bay split on its shelf).
      const r = bay(p, b, opening),
        mid = b.x + (r.left + r.right) / 2;
      sections.push({
        id: opening.id,
        bodyId: b.id,
        lo: opening.lo,
        hi: opening.hi,
        // r5 (MOD-AI-75): a niche closed by a shelf a partition stands on.
        topPartId: opening.upper === undefined ? top.id : b.id + ':' + opening.upper,
        bottomPartId: opening.lower === undefined ? bottom.id : b.id + ':' + opening.lower,
        backPartId: (backs.find((x) => x.origin_mm[0] <= mid && mid <= x.origin_mm[0] + x.extent_mm[0]) ?? back)?.id,
        leftPartId: byBoundary.get(opening.lo)?.id,
        rightPartId: byBoundary.get(opening.hi)?.id,
      });
    }
    const shelfParts = new Map<string, GraphPart>(),
      // r5 (FINDINGS 844, 845): a removable shelf stands on its support, whose axis is on the System 32 grid.
      supportOf = new Map(R.shelfSupportRule === 'WARDROBE' ? b.shelves.filter((s) => !s.fixed).map((s) => [s.id, homeShelfSupport(p, hw, b, s)]) : []),
      lowerOf = (s: (typeof b.shelves)[number]) => supportOf.get(s.id)?.lowerMm ?? s.y;
    for (const s of b.shelves) {
      const r = bay(p, b, s),
        gap = s.fixed ? 0 : HOME.adjustableShelfSideGap,
        plan = supportOf.get(s.id),
        q = add(
          b,
          s.id,
          s.fixed ? 'fixed_shelf' : 'adjustable_shelf',
          [r.left + gap, a + HOME.shelfFrontSetback, lowerOf(s)],
          [r.right - r.left - 2 * gap, b.d - rear - a - HOME.shelfFrontSetback, t],
          [0, 1],
          s.fixed ? [2] : [0, 1, 2, 3],
          s.id,
        );
      loads.push(beam(p, b.id, s.id, r.right - r.left + t, q.extent_mm[1], t, p.plannedShelfLoadKg, q.extent_mm[0]));
      shelfParts.set(s.id, q);
      // r4 (MOD-DEC-368, H-08): a removable shelf with its load heavier than its supports hold blocks production.
      // r5: the limit of the chosen support (FINDINGS 845).
      const capacity = R.shelfSupportLimit && !s.fixed ? (plan ? plan.capacityKg : shelfSupportCapacityKg(hw)) : null,
        mass = loads[loads.length - 1].totalMassKg;
      if (capacity !== null && mass > capacity) unresolved.push({ code: 'SHELF_SUPPORT_LOAD', partId: q.id, massKg: mass, capacityKg: capacity });
      // A height off the grid is moved to its nearest level and shown (193, 312); the project keeps the entered one.
      if (plan?.movedFromMm != null) unresolved.push({ code: 'SHELF_SYSTEM32_MOVED', partId: q.id, fromMm: plan.movedFromMm, toMm: plan.lowerMm });
      if (plan?.offGrid) unresolved.push({ code: 'SHELF_SYSTEM32_OFF_GRID', partId: q.id });
      if (plan && !plan.support) unresolved.push({ code: 'SHELF_SUPPORT_MISSING', partId: q.id, reason: plan.missing[0] });
      if (s.fixed)
        for (const ref of [s.lo, s.hi]) {
          const side = byBoundary.get(ref);
          if (side) joint(q, side, 'shelf');
          else unresolved.push({ code: 'SHELF_BOUNDARY', partId: q.id });
        }
    }
    for (const [d, id] of standing) {
      const shelf = shelfParts.get(id);
      if (shelf) joint(d, shelf, 'divider-bottom');
    }
    // r4 (MOD-DEC-368, H-13): a clear height under 40 mm above or below a shelf — to the next shelf of its bay, the
    // bottom or the top — is a warning, one per shelf with its smallest clearance (INV-V03).
    if (R.shelfMinClearance !== null) {
      const least = new Map<string, number>(),
        note = (id: string, mm: number) => least.set(id, Math.min(mm, least.get(id) ?? Infinity));
      for (const key of new Set(b.shelves.map((s) => s.lo + '|' + s.hi))) {
        const sorted = b.shelves.filter((s) => s.lo + '|' + s.hi === key).sort((x, y) => lowerOf(x) - lowerOf(y)),
          // r5 (MOD-AI-75): the niche over a shelf a partition stands on begins at it; the shelf ends the niche under it.
          lim = nicheLimits(p, b, sorted[0]!);
        sorted.forEach((s, i) => {
          note(s.id, lowerOf(s) - (i ? lowerOf(sorted[i - 1]) + t : lim.lower ? lim.shelfLow : pad + t));
          if (s !== lim.upper) note(s.id, (i + 1 < sorted.length ? lowerOf(sorted[i + 1]) : lim.upper ? lim.shelfHigh : b.h - T) - (lowerOf(s) + t));
        });
      }
      for (const [id, mm] of least)
        if (mm < R.shelfMinClearance) unresolved.push({ code: 'SHELF_CLEARANCE', partId: shelfParts.get(id)!.id, clearanceMm: mm, minMm: R.shelfMinClearance });
    }
    // r4 (MOD-DEC-368, H-06): an edit that lifts a body is refused (INV-G07, 313); a body that came off the floor
    // another way is still reported.
    if (R.bodySupportWarning && b.y !== 0 && !wallHangingOf(p, b)) unresolved.push({ code: 'BODY_NOT_SUPPORTED', partId: bottom.id, elevationMm: b.y });
    for (const f of b.doors) {
      const r = frontGeometry(p, b, f),
        door = add(b, f.id + ':door', 'door', [r.x, r.z, r.y], [r.w, r.d, r.h], [0, 2], [0, 1, 2, 3], f.id),
        hp = hingeProfile(p, hw, b, f),
        glass = glassOf(p, f);
      // r5 (MOD-AI-37, FINDINGS 3316): a glass door is a pane of the glass of the policy, its edges the glazier's.
      if (glass) Object.assign(door, { material: glass.materialCode, edge_mm: {}, cut_uv_mm: [...door.finished_uv_mm] });
      // r5 (MOD-AI-40, FINDINGS 3314): a flap front on its lift, the row of INV-D18-01; without a compatible one the
      // nearest stays, temporary, and the front says so.
      if (hp.status === 'LIFT') {
        const lift = homeLift(p, hw, b, f);
        mechanisms.push({ id: f.id + ':lift', type: 'lift', bodyId: b.id, elementId: f.id, frontPartId: door.id, lift });
        if (lift.status !== 'SELECTED') unresolved.push({ code: 'LIFT_TEMPORARY', partId: door.id, reason: lift.reason, liftId: lift.row?.id ?? null });
        continue;
      }
      mechanisms.push({
        id: f.id + ':hinges',
        type: 'hinges',
        bodyId: b.id,
        elementId: f.id,
        frontPartId: door.id,
        ...hp,
        stationIds: hp.stations?.map((_, i) => f.id + ':hinge-' + i),
        // r3, r4: the stations are heights in the body; r5: from the lower end of the door, as in the wardrobe (378).
        stationWorldZ: hp.stations?.map((z) => b.y + (R.hingeRule === 'WARDROBE' ? r.y : 0) + z),
        ...(R.hingeRule === 'WARDROBE'
          ? { panelPartId: b.id + ':' + (hp.panelRef === 'left' ? 'side-left' : hp.panelRef === 'right' ? 'side-right' : hp.panelRef) }
          : {
              cupDiameterMm: articleDimension(kit, 'cupDiameterMm'),
              cupDepthMm: articleDimension(kit, 'cupDepthMm'),
              plateOffsetFromCarcassFrontMm: HOME.hingePlateOffset,
              mountScrewsPerStation: HOME.hingeScrewsPerStation,
            }),
        fullSweepQualified: false,
      });
      if (!hp.count) unresolved.push({ code: 'HINGE_PROFILE', partId: door.id });
      // r5 (MOD-DEC-190, 329; FINDINGS 841): a door beyond the chart of its hinge keeps the largest count and says so,
      // as in the wardrobe; a station the ladder cannot take off a fixed shelf stays and the door says so (159).
      // r5 (MOD-AI-37): a hinge for glass the manufacturer prints no chart for says so, its count is the maker's to check.
      if (hp.count && hp.outOfChart) unresolved.push({ code: 'HINGE_CHART', partId: door.id, heightMm: r.h, widthMm: r.w, massKg: hp.mass, maxWidthMm: hp.chartMaxWidthMm, ...(glass && hp.chartBasis === null ? { noChart: `${hp.manufacturer} ${hp.sku}`, count: hp.count } : {}) });
      if (hp.count && hp.shelfClash) unresolved.push({ code: 'HINGE_SHELF', partId: door.id });
    }
    for (const f of b.drawers) {
      const r = frontGeometry(p, b, f),
        runner = homeDrawerRunner(p, hw, b, f),
        n = runnerInfo(p, hw, b, f);
      const front = add(b, f.id + ':front', 'drawer_front', [r.x, 0, r.y], [r.w, r.d, r.h], [0, 2], [0, 1, 2, 3], f.id);
      // The box of the runner (drawerBoxWalls): of the BAZIS kit of a concealed runner (r5, MOD-DEC-574, FINDINGS 1750)
      // — no inner front, the front closes the box on the cams of its sides and bottom, as in the kit; else of the
      // prototype, its bottom of HDF in the groove of the walls (r5, FINDINGS 1304) or of the board on confirmats.
      const box = drawerBoxWalls(p, b, f, n);
      for (const w of box) if (w.hdf) hdfBottoms.add(b.id + ':' + f.id + ':' + w.key);
      const wall = Object.fromEntries(box.map((w) => [w.key, add(b, f.id + ':' + w.key, w.role, w.o, w.ext, w.axes, w.edged, f.id)])) as Record<DrawerBoxWall['key'], GraphPart>,
        { 'side-left': dl, 'side-right': dr, back: db, bottom: floor } = wall,
        df = wall['inner-front'],
        hdfBox = box.some((w) => w.hdf);
      if (df) for (const side of [dl, dr]) joint(df, side, 'box-front');
      else for (const q of [dl, dr, floor]) joint(q, front, 'box-front');
      // The bottom of HDF bears no confirmat: the groove holds it (engine.ts writes the fit and the grooves).
      for (const [q, side] of [[db, dl], [db, dr], ...(hdfBox ? [] : df ? [[floor, dl], [floor, dr], [floor, df], [floor, db]] : [[floor, dl], [floor, dr], [floor, db]])] as const)
        joint(q, side, 'confirmat', 'MAKMART_S16');
      const walls = df ? [dl, dr, df, db, floor] : [dl, dr, db, floor];
      const moving =
        [front, ...walls].reduce((s, q) => s + (q.extent_mm.reduce((a, b) => a * b, 1) * p.density) / 1e9, 0) +
        HOME.drawerHardwareReserveKg +
        p.plannedDrawerLoadKg;
      mechanisms.push({
        id: f.id + ':runner',
        type: 'runner',
        bodyId: b.id,
        elementId: f.id,
        frontPartId: front.id,
        ...n,
        movingMassKg: moving,
        hardwareReserveKg: HOME.drawerHardwareReserveKg,
        payloadKg: p.plannedDrawerLoadKg,
        physicalQualified: false,
      });
      if (moving > n.loadKg) unresolved.push({ code: 'DRAWER_LOAD', partId: front.id, massKg: moving, capacityKg: n.loadKg });
      // r5 (FINDINGS 1755): another runner than the one of the level of the hardware is said, as the wardrobe (465).
      if (runner.substitution) unresolved.push({ code: 'DRAWER_RUNNER_SUBSTITUTED', partId: front.id, reason: runner.substitution.text });
      // The dowels of the inner front — of the front on the box of a concealed runner — (32 mm inside its connector
      // rows, 192) meet in the middle of a low box.
      if (smallDrawerPattern(n.boxH)) unresolved.push({ code: 'SMALL_DRAWER_PATTERN', partId: df ? df.id : front.id });
    }
  }
  // r5 (MOD-AI-32, MOD-DEC-168): a body in a niche goes without its bottom or its top — the parts go with their joints,
  // their loads and the pads under them, the other parts stay where they are (the composition of the wardrobe, dpCompose);
  // the changed set of panels is a draft, not for production.
  const omitted = new Set(p.bodies.flatMap((b) => (R.nichePanels ? (b.omit ?? []) : []).map((k) => b.id + ':' + k)));
  if (omitted.size) {
    const gone = (id: unknown) => typeof id === 'string' && omitted.has(id.replace(/:middle$/, ''));
    const pads = new Set(supports.filter((x) => gone(x.bearingPartId)).map((x) => x.floorPartId));
    const keep = <T>(a: T[], ok: (x: T) => boolean) => a.splice(0, a.length, ...a.filter(ok));
    keep(parts, (x) => !gone(x.id) && !pads.has(x.id));
    keep(joints, (j) => !gone(j.camPartId) && !gone(j.studPartId));
    keep(loads, (l) => !gone(l.elementId));
    keep(supports, (x) => !gone(x.bearingPartId));
    keep(unresolved, (u) => !gone(u.partId));
    // The verticals that reached the top go up to the ceiling of the niche, in its place; the partitions that stood on
    // the bottom go down onto their pads, in its place (Д).
    const grow = (q: GraphPart, below: number, above: number) => {
      q.origin_mm = [q.origin_mm[0], q.origin_mm[1], q.origin_mm[2] - below];
      q.extent_mm = [q.extent_mm[0], q.extent_mm[1], q.extent_mm[2] + below + above];
      q.finished_uv_mm = q.local_uv_world_axes.map((i) => q.extent_mm[i]!);
      q.cut_uv_mm = [q.finished_uv_mm[0]! - (q.edge_mm[0] || 0) - (q.edge_mm[1] || 0), q.finished_uv_mm[1]! - (q.edge_mm[2] || 0) - (q.edge_mm[3] || 0)];
    };
    for (const b of p.bodies) {
      const top = omitted.has(b.id + ':top'),
        bottom = omitted.has(b.id + ':bottom'),
        floor = b.y + foot(p, b);
      for (const q of parts.filter((x) => x.bodyId === b.id && VERTICAL_ROLES.has(x.semanticRole))) {
        const up = top && Math.abs(q.origin_mm[2] + q.extent_mm[2] - (b.y + b.h - T)) < 0.1 ? T : 0,
          down = bottom && q.semanticRole !== 'bearing_side' && Math.abs(q.origin_mm[2] - (floor + t)) < 0.1 ? t : 0;
        if (up || down) grow(q, down, up);
        if (down) for (const x of supports.filter((x) => x.bearingPartId === q.id)) x.viaBottom = false;
      }
    }
    for (const b of p.bodies)
      if (R.nichePanels && b.omit?.length) unresolved.push({ code: 'PANELS_OMITTED', partId: b.id + ':side-left', omitted: b.omit.slice() });
  }
  // r5 (MOD-DEC-515): the back of HDF enters the rebate of a side, the bottom or the top of its body — no more than the
  // rebate deep in its plane and wide in the depth; that is its fit, not a collision.
  const inRebate = (a: GraphPart, b: GraphPart, ol: number[]): boolean => {
    const [back, other] = a.semanticRole === 'hdf_back' ? [a, b] : [b, a],
      q = back.semanticRole === 'hdf_back' && back.bodyId === other.bodyId ? hdfBackOf(p, p.bodies.find((x) => x.id === back.bodyId)!) : null;
    return !!q && REBATE_ROLES.has(other.semanticRole) && ol[1] <= q.rebateWidthMm + 0.1 && Math.min(ol[0], ol[2]) <= q.rebateDepthMm + 0.1;
  };
  // r5 (MOD-DEC-574): the bottom of HDF enters the groove of each wall of its own box — no deeper than the groove and
  // no thicker than it is wide; that is its fit, not a collision.
  const inGroove = (a: GraphPart, b: GraphPart, ol: number[]): boolean => {
    const [bottom, wall] = a.semanticRole === 'drawer_bottom' ? [a, b] : [b, a];
    return (
      !!hdfBottom &&
      bottom.semanticRole === 'drawer_bottom' &&
      bottom.material === HDF_BACK_MATERIAL &&
      DRAWER_WALL_ROLES.has(wall.semanticRole) &&
      wall.bodyId === bottom.bodyId &&
      wall.elementId === bottom.elementId &&
      ol[2] <= hdfBottom.thicknessMm + 0.1 &&
      Math.min(ol[0], ol[1]) <= hdfBottom.grooveDepthMm + 0.1
    );
  };
  const collisions: PhysicalGraph['collisions'] = [];
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i],
        b = parts[j],
        ol = a.origin_mm.map((x, k) => Math.min(x + a.extent_mm[k], b.origin_mm[k] + b.extent_mm[k]) - Math.max(x, b.origin_mm[k]));
      if (Math.min(...ol) > 0.1 && !inRebate(a, b, ol) && !inGroove(a, b, ol)) collisions.push({ partIds: [a.id, b.id], overlapMm: ol });
    }
  for (const load of loads)
    if (!load.screenPass) {
      // r4: one question per part (INV-V03) — the top over several bays keeps its worst span.
      const same = R.issueTexts === 'PLAIN' ? unresolved.find((u) => u.code === 'DEFLECTION' && u.partId === load.elementId) : undefined,
        // r5 (MOD-DEC-748): the payload asked and the one the part takes.
        kg = load.allowablePayloadKg !== undefined ? { payloadKg: load.payloadKg, allowableKg: load.allowablePayloadKg } : {};
      if (!same) unresolved.push({ code: 'DEFLECTION', partId: load.elementId, deflectionMm: load.deflectionMm, limitMm: load.deflectionLimitMm, ...kg });
      else if (load.deflectionMm / load.deflectionLimitMm > (same.deflectionMm as number) / (same.limitMm as number))
        Object.assign(same, { deflectionMm: load.deflectionMm, limitMm: load.deflectionLimitMm, ...kg });
    }
  // r4 (MOD-DEC-356): a seam between fronts under 2 mm is said, never refused — the edges of the fronts may touch.
  if (!R.narrowSeamRefused)
    for (const b of p.bodies) {
      const fronts = allFronts(b),
        partId = (f: Front) => f.id + ((b.doors as unknown[]).includes(f) ? ':door' : ':front');
      for (let i = 0; i < fronts.length; i++)
        for (let j = i + 1; j < fronts.length; j++) {
          const a = frontGeometry(p, b, fronts[i]),
            c = frontGeometry(p, b, fronts[j]);
          if (frontsCloser(a, c, HOME.frontMinSeam - 0.1))
            unresolved.push({
              code: 'FACADE_SEAM_NARROW',
              partId: partId(fronts[i]),
              partIds: [partId(fronts[i]), partId(fronts[j])],
              seamMm: Math.max(c.y - a.y - a.h, a.y - c.y - c.h),
              minSeamMm: HOME.frontMinSeam,
            });
        }
    }
  // r5 (MOD-AI-33): a body on the wall heavier than its two hangers and its rail take is not made, as an overloaded runner.
  for (const b of p.bodies) {
    const w = wallHangingOf(p, b);
    if (!w) continue;
    const mass = hangerLoadKg(p, { parts, loads }, b),
      capacity = Math.min(2 * w.loadKgEach, w.railRatingKg);
    if (mass > capacity) unresolved.push({ code: 'HANGER_LOAD', partId: b.id + ':bottom', massKg: mass, capacityKg: capacity });
  }
  // r5 (MOD-AI-37, FINDINGS 3315): a lit niche narrower than the shortest light of the catalogue has none, and says so.
  // One remark a body, with the widths of its niches.
  const unfitted = homeLights(p, hw).unfitted;
  for (const id of new Set(unfitted.map((u) => u.bodyId)))
    unresolved.push({ code: 'LIGHT_NOT_FITTED', partId: id + ':top', bodyNo: p.bodies.findIndex((b) => b.id === id) + 1, widthsMm: unfitted.filter((u) => u.bodyId === id).map((u) => u.widthMm) });
  // r4 (INV-G06, H-07): a product larger than the room is a warning, not a refusal.
  // r5 (MOD-AI-40): with the rims on the tops.
  const size = R.roomWarning ? { ...bounds(p), h: overallHeightMm(p) } : null;
  if (size && (size.w > p.room.width || size.h > p.room.height || size.d > p.room.depth))
    unresolved.push({ code: 'OUTSIDE_ROOM', sizeMm: [size.w, size.h, size.d], roomMm: [p.room.width, p.room.height, p.room.depth] });
  return {
    generatorVersion: R.generator,
    coordinateSystem: 'x-right/y-back/z-up',
    adapter: { Home: '[x,z,y]', technology: '[x,y,z]', vectors: '[nx,nz,ny]' },
    parts,
    joints,
    sections,
    supports,
    loads,
    mechanisms,
    collisions,
    unresolved,
    invariants: {
      noSolidOverlap: !collisions.length,
      // r5 (MOD-AI-32): a body in a niche without its top has none.
      oneTopPerBody: parts.filter((x) => x.semanticRole === 'continuous_top').length === p.bodies.filter((b) => !(R.nichePanels && b.omit?.includes('top'))).length,
      allJointsHaveContact: joints.every((j) => j.contactAxis >= 0 && j.contactAreaMm2 > 0),
      uniqueIds: new Set(parts.map((x) => x.id)).size === parts.length,
    },
    qualification: { physical: false, CNC: false, opening: 'UNKNOWN', drillVolumes: 'HOLD' },
  };
}

export const partNames: Record<SemanticRole, string> = {
  continuous_top: 'Общая верхняя крышка',
  bearing_side: 'Боковина',
  bearing_shared_side: 'Общая боковина тумбы',
  bearing_divider: 'Перегородка',
  bottom: 'Дно',
  structural_back: 'Несущий задник',
  hdf_back: 'Задняя стенка ХДФ',
  rear_apron: 'Задняя царга',
  fixed_shelf: 'Закреплённая полка',
  adjustable_shelf: 'Переставляемая полка',
  door: 'Дверца',
  drawer_front: 'Фасад ящика',
  drawer_side: 'Ящик: боковина',
  drawer_inner_front: 'Ящик: передняя стенка',
  drawer_back: 'Ящик: задняя стенка',
  drawer_bottom: 'Ящик: дно',
  floor_pad: 'Подпятник',
  plinth_rail: 'Планка цоколя',
  top_rim: 'Бортик крышки',
  mirror_board: 'Щит зеркала',
  mirror: 'Зеркало',
};

/**
 * The banded edges of a part, metres by the thickness of their band (FINDINGS 3318): each edge of edge_mm by its
 * length — 0, 1 across the part, 2, 3 along it. r5 (MOD-AI-73): a top banded all round with rounded corners is its
 * contour; the arc of a corner takes the band of the front edge it continues, as in the model (engine.ts).
 */
export function edgeRuns(q: Pick<GraphPart, 'edge_mm' | 'finished_uv_mm' | 'contour_mm'>): { band: number; m: number }[] {
  const keys = Object.keys(q.edge_mm),
    [L, W] = q.finished_uv_mm,
    length = (k: string) => (Number(k) < 2 ? W : L);
  let runs: { band: number; mm: number }[] = keys.map((k) => ({ band: q.edge_mm[k]!, mm: length(k) }));
  if (q.contour_mm && keys.length === 4) {
    const c = q.contour_mm,
      near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    runs = c.map((a, i) => {
      const b = c[(i + 1) % c.length]!,
        on = (j: 0 | 1, at: number) => near(a[j], at) && near(b[j], at),
        k = on(1, 0) ? '2' : on(1, W) ? '3' : on(0, 0) ? '0' : on(0, L) ? '1' : '2';
      return { band: q.edge_mm[k]!, mm: Math.hypot(b[0] - a[0], b[1] - a[1]) };
    });
  }
  const by = new Map<number, number>();
  for (const r of runs) by.set(r.band, (by.get(r.band) ?? 0) + r.mm / 1000);
  return [...by].map(([band, m]) => ({ band, m }));
}

/** Converts a graph part to a board in Home axes (x right, y up, z back). */
export function toBoard(q: GraphPart): Board {
  const [x, z, y] = q.origin_mm,
    [w, d, h] = q.extent_mm;
  let role = 'carcass';
  if (q.semanticRole === 'door') role = 'door';
  if (q.semanticRole.startsWith('drawer_')) role = q.semanticRole.replaceAll('_', '-');
  if (q.id.endsWith(':side-left')) role = q.semanticRole === 'drawer_side' ? 'drawer-side-left' : role;
  if (q.id.endsWith(':side-right')) role = q.semanticRole === 'drawer_side' ? 'drawer-side-right' : role;
  return {
    ...q,
    name: partNames[q.semanticRole],
    role,
    x,
    y,
    z,
    w,
    h,
    d,
    length: q.finished_uv_mm[0],
    width: q.finished_uv_mm[1],
    cutLength: q.cut_uv_mm[0],
    cutWidth: q.cut_uv_mm[1],
    thickness: q.thickness_mm,
    // r5 (MOD-AI-73): a top banded all round with rounded corners — the length of its contour.
    edgeM:
      q.contour_mm && Object.keys(q.edge_mm).length === 4
        ? q.contour_mm.reduce((s, a, i, c) => s + Math.hypot(c[(i + 1) % c.length]![0] - a[0], c[(i + 1) % c.length]![1] - a[1]), 0) / 1000
        : Object.keys(q.edge_mm).reduce((s, k) => s + (Number(k) < 2 ? q.finished_uv_mm[1] : q.finished_uv_mm[0]) / 1000, 0),
    edgeThickness: Object.keys(q.edge_mm).length ? Object.values(q.edge_mm)[0] : 0,
    localWorldAxes: q.local_uv_world_axes.map((i) => [0, 2, 1][i]),
    holes: [],
  };
}
