// Physical graph: every board as a box in technology axes, joints between boards, loads,
// mechanisms and unresolved engineering questions. All other outputs derive from it.
// Numbers and rules: engine/policy/home.ts, by the rule set of the project (r3 — the prototype, r4 — task H1).
import { articleDimension, articleItem } from '../catalog/hardware/articles.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { HOME, homeRules } from '../engine/policy/home.js';
import { aFront, allFronts, availableBays, backDepthMm, bay, bounds, foot, frontGeometry, frontsCloser, hdfBackOf, hdfDrawerBottomOf, sideFoot, topT } from './geometry.js';
import { drawerBoxWalls, hingeProfile, homeDrawerRunner, homeLegs, homeShelfSupport, runnerInfo, shelfSupportCapacityKg, smallDrawerPattern, type DrawerBoxWall } from './mechanisms.js';
import { FRONT_ROLES, purchasedFronts } from './facades.js';
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
export const REBATE_ROLES: ReadonlySet<SemanticRole> = new Set(['bearing_side', 'bearing_shared_side', 'bottom', 'continuous_top']);

/** The walls of a drawer box whose groove holds a bottom of HDF (r5, MOD-DEC-574). */
export const DRAWER_WALL_ROLES: ReadonlySet<SemanticRole> = new Set(['drawer_side', 'drawer_inner_front', 'drawer_back']);

/** Material of the back of HDF in the graph: the decor id the wardrobe gives HDF (`decorId: 'HDF'`). */
export const HDF_BACK_MATERIAL = 'HDF';

/** Simply supported beam: self weight as uniform load plus payload as a point load at mid-span. */
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
    deflection = (5 * self * 9.81 * Lspan ** 3) / (384 * E * I) + (payload * 9.81 * Lspan ** 3) / (48 * E * I);
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
    deflectionLimitMm: Lspan / HOME.deflectionScreen,
    screenPass: deflection <= Lspan / HOME.deflectionScreen,
    physicalQualified: false,
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
    const edge: Record<string, number> = FRONT_ROLES.has(role) && purchasedFronts(p) ? {} : R.edgeByPart ? { ...R.edgeByPart[role] } : Object.fromEntries(edged.map((i) => [String(i), e])),
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
      material: role === 'floor_pad' ? 'hardware' : role === 'hdf_back' || (role === 'drawer_bottom' && hdfBottoms.has(b.id + ':' + key)) ? HDF_BACK_MATERIAL : p.material,
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
  const backOf = (b: Body, x0: number, x1: number, z0: number, z1: number): GraphPart | undefined => {
    if (!b.back) return undefined;
    const q = hdfBackOf(p, b);
    if (!q) return add(b, 'back', 'structural_back', [x0, b.d - t, z0], [x1 - x0, t, z1 - z0], [0, 2]);
    const r = q.rebateDepthMm - q.inPlaneClearanceMm,
      part = add(b, 'back', 'hdf_back', [x0 - r, b.d - q.rearClearanceMm - q.thicknessMm, z0 - r], [x1 - x0 + 2 * r, q.thicknessMm, z1 - z0 + 2 * r], [0, 2]);
    unresolved.push({ code: 'BACK_HDF', partId: part.id });
    return part;
  };

  for (const b of p.bodies) {
    // r5 (MOD-DEC-516): the bottom stands on the pads, the plinth or the legs of the body; the sides go down to the
    // floor over a plinth, as in the wardrobe (291), and end at the legs or the pads otherwise.
    const a = aFront(p, b),
      rear = backDepthMm(p, b),
      pad = foot(p, b),
      low = sideFoot(p, b),
      top = add(b, 'top', 'continuous_top', [0, 0, b.h - T], [b.w, b.d, T], [0, 1], [0, 1, 2, 3]),
      left = add(b, 'side-left', 'bearing_side', [0, a, low], [t, b.d - a, b.h - T - low], [2, 1], [2]),
      right = add(b, 'side-right', 'bearing_side', [b.w - t, a, low], [t, b.d - a, b.h - T - low], [2, 1], [2]);
    const verts = [left, right],
      byBoundary = new Map<string, GraphPart>([
        ['left', left],
        ['right', right],
      ]);
    joint(left, top, 'top');
    joint(right, top, 'top');
    let bottom: GraphPart, back: GraphPart | undefined;
    const bs = availableBays(p, b);
    if (b.kind === 'desk') {
      // Desk = pedestal (left bay) + knee space under a continuous top, closed by a rear apron.
      const q = b.partitions[0],
        P = q.x + t / 2,
        divider = add(b, q.id, 'bearing_shared_side', [P - t, a, low], [t, b.d - a, b.h - T - low], [2, 1], [2], q.id);
      verts.push(divider);
      byBoundary.set(q.id, divider);
      joint(divider, top, 'top');
      bottom = add(b, 'bottom', 'bottom', [t, a, pad], [P - 2 * t, b.d - a, t], [0, 1], [2]);
      back = backOf(b, t, P - t, pad + t, b.h - T);
      for (const side of [left, divider]) {
        joint(bottom, side, 'bottom');
        if (back?.semanticRole === 'structural_back') joint(back, side, 'back');
      }
      if (back?.semanticRole === 'structural_back') {
        joint(back, bottom, 'back-bottom');
        joint(back, top, 'back-top');
      }
      const apron = add(b, 'stretcher', 'rear_apron', [P, b.d - t, b.h - T - HOME.apronHeight], [b.w - P - t, t, HOME.apronHeight], [0, 2], [2]);
      joint(apron, divider, 'apron');
      joint(apron, right, 'apron');
      loads.push(beam(p, b.id, top.id, b.w - P, b.d, T, p.plannedDeskLoadKg));
      sections.push({
        id: b.id + ':knee',
        bodyId: b.id,
        topPartId: top.id,
        leftPartId: divider.id,
        rightPartId: right.id,
        kneeBoxMm: [b.x + P, a, b.y + low, b.w - P - t, b.d - t - a, b.h - T - low],
        rearApronBottomMm: b.y + b.h - T - HOME.apronHeight,
      });
    } else {
      bottom = add(b, 'bottom', 'bottom', [t, a, pad], [b.w - 2 * t, b.d - a, t], [0, 1], [2]);
      back = backOf(b, t, b.w - t, pad + t, b.h - T);
      for (const side of [left, right]) {
        joint(bottom, side, 'bottom');
        if (back?.semanticRole === 'structural_back') joint(back, side, 'back');
      }
      if (back?.semanticRole === 'structural_back') {
        joint(back, bottom, 'back-bottom');
        joint(back, top, 'back-top');
      }
      for (const q of b.partitions) {
        const d = add(b, q.id, 'bearing_divider', [q.x - t / 2, a, pad + t], [t, b.d - a - rear, b.h - T - pad - t], [2, 1], [2], q.id);
        verts.push(d);
        byBoundary.set(q.id, d);
        joint(d, top, 'top');
        joint(d, bottom, 'divider-bottom');
      }
      for (const opening of bs) {
        const r = bay(p, b, opening);
        loads.push(beam(p, b.id, top.id, r.right - r.left + t, b.d, T, p.plannedDeskLoadKg));
      }
    }
    // Floor pads under every vertical board (and the middle of a chest bottom) — when the body has no plinth or legs.
    const loadLines = b.base ? [] : verts.map((v) => ({ id: v.id, center: v.origin_mm[0] - b.x + t / 2 }));
    if (!b.base && HOME.middlePadTemplates.includes(p.templateId) && !loadLines.some((l) => Math.abs(l.center - b.w / 2) < 0.1))
      loadLines.push({ id: bottom.id + ':middle', center: b.w / 2 });
    // r5 (MOD-DEC-516, FINDINGS 946): the plinth of the wardrobe under the bottom, between the sides (of the pedestal of
    // a desk) — the front rail back from the front of the carcass (291), the rear one at the rear (456); the rails stand
    // on the floor and carry the bottom.
    if (b.base?.kind === 'plinth') {
      const C = R.baseChoice!,
        x1 = b.kind === 'desk' ? b.partitions[0].x + t / 2 - t : b.w - t,
        sides = b.kind === 'desk' ? [left, byBoundary.get(b.partitions[0].id)!] : [left, right];
      for (const [key, y] of [
        ['plinth-front', a + C.plinthSetbackMm],
        // In front of the rebate of HDF (456); in front of a bearing back of the board, whose fixing to the bottom it
        // would meet (FINDINGS 946); without a back — at the rear.
        ['plinth-rear', b.d - t - (hdfBackOf(p, b)?.rebateWidthMm ?? (b.back ? t : 0))],
      ] as const) {
        const rail = add(b, key, 'plinth_rail', [t, y, 0], [x1 - t, t, pad], [0, 2]);
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
    for (const opening of bs)
      sections.push({
        id: opening.id,
        bodyId: b.id,
        lo: opening.lo,
        hi: opening.hi,
        topPartId: top.id,
        bottomPartId: bottom.id,
        backPartId: back?.id,
        leftPartId: byBoundary.get(opening.lo)?.id,
        rightPartId: byBoundary.get(opening.hi)?.id,
      });
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
    // r4 (MOD-DEC-368, H-13): a clear height under 40 mm above or below a shelf — to the next shelf of its bay, the
    // bottom or the top — is a warning, one per shelf with its smallest clearance (INV-V03).
    if (R.shelfMinClearance !== null) {
      const least = new Map<string, number>(),
        note = (id: string, mm: number) => least.set(id, Math.min(mm, least.get(id) ?? Infinity));
      for (const key of new Set(b.shelves.map((s) => s.lo + '|' + s.hi))) {
        const sorted = b.shelves.filter((s) => s.lo + '|' + s.hi === key).sort((x, y) => lowerOf(x) - lowerOf(y));
        sorted.forEach((s, i) => {
          note(s.id, lowerOf(s) - (i ? lowerOf(sorted[i - 1]) + t : pad + t));
          note(s.id, (i + 1 < sorted.length ? lowerOf(sorted[i + 1]) : b.h - T) - (lowerOf(s) + t));
        });
      }
      for (const [id, mm] of least)
        if (mm < R.shelfMinClearance) unresolved.push({ code: 'SHELF_CLEARANCE', partId: shelfParts.get(id)!.id, clearanceMm: mm, minMm: R.shelfMinClearance });
    }
    // r4 (MOD-DEC-368, H-06): an edit that lifts a body is refused (INV-G07, 313); a body that came off the floor
    // another way is still reported.
    if (R.bodySupportWarning && b.y !== 0) unresolved.push({ code: 'BODY_NOT_SUPPORTED', partId: bottom.id, elevationMm: b.y });
    for (const f of b.doors) {
      const r = frontGeometry(p, b, f),
        door = add(b, f.id + ':door', 'door', [r.x, 0, r.y], [r.w, r.d, r.h], [0, 2], [0, 1, 2, 3], f.id),
        hp = hingeProfile(p, hw, b, f);
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
      if (hp.count && hp.outOfChart) unresolved.push({ code: 'HINGE_CHART', partId: door.id, heightMm: r.h, widthMm: r.w, massKg: hp.mass, maxWidthMm: hp.chartMaxWidthMm });
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
      const same = R.issueTexts === 'PLAIN' ? unresolved.find((u) => u.code === 'DEFLECTION' && u.partId === load.elementId) : undefined;
      if (!same) unresolved.push({ code: 'DEFLECTION', partId: load.elementId, deflectionMm: load.deflectionMm, limitMm: load.deflectionLimitMm });
      else if (load.deflectionMm / load.deflectionLimitMm > (same.deflectionMm as number) / (same.limitMm as number))
        Object.assign(same, { deflectionMm: load.deflectionMm, limitMm: load.deflectionLimitMm });
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
  // r4 (INV-G06, H-07): a product larger than the room is a warning, not a refusal.
  const size = R.roomWarning ? bounds(p) : null;
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
      oneTopPerBody: parts.filter((x) => x.semanticRole === 'continuous_top').length === p.bodies.length,
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
};

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
    edgeM: Object.keys(q.edge_mm).reduce((s, k) => s + (Number(k) < 2 ? q.finished_uv_mm[1] : q.finished_uv_mm[0]) / 1000, 0),
    edgeThickness: Object.keys(q.edge_mm).length ? Object.values(q.edge_mm)[0] : 0,
    localWorldAxes: q.local_uv_world_axes.map((i) => [0, 2, 1][i]),
    holes: [],
  };
}
