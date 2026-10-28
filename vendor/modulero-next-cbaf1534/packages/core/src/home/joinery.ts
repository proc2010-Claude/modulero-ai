// Drilling scheme (присадка): connector, dowel, confirmat, hinge and shelf-pin bores on finished boards,
// plus a finite-cylinder clash screen. Numbers and rules: engine/policy/home.ts, by the rule set of the project.
import { articleDimension, articleItem } from '../catalog/hardware/articles.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { HOME, HOME_SHARED_SHELF, homeRules, system32Rows } from '../engine/policy/home.js';
import { narrowJointLayout } from '../engine/policy/joint-stations.js';
import type { ShelfSupportHole } from '../engine/policy/shelf-support-selection.js';
import { wardrobeFill } from '../engine/policy/wardrobe-fill.js';
import { aFront, cableOutletOf, foot, frontGeometry, hdfBackOf, hdfDrawerBottomOf, hdfRebateBox, topT } from './geometry.js';
import { DRAWER_WALL_ROLES, HDF_BACK_MATERIAL, physicalGraph, REBATE_ROLES, toBoard } from './graph.js';
import { boundaryPartId, hingeBoundary, hingeProfile, homeShelfSupport, runnerInfo, type NumberedSchemeHole } from './mechanisms.js';
import { catalogSource } from '../catalog/hardware/types.js';
import type { Board, GraphPart, Hole, HomeProject, Joint, Unresolved } from './types.js';

export interface DrillInspection {
  status: 'FAIL' | 'PASS_BOUNDED_NOMINAL';
  issues: Unresolved[];
  finiteCylinderCount: number;
  toleranceMm: number;
  scope: string;
}

export interface JoineryData {
  status: 'ENGINEERING_DRAFT';
  coordinateSystem: string;
  coordinateBasis: 'FINISHED';
  placementBasis: string;
  boards: Board[];
  joints: (Joint & { camSku: string; studSku: string })[];
  unresolved: Unresolved[];
  qualification: Record<string, unknown>;
  handleBoresExcluded: true;
  drillInspection?: DrillInspection;
}

const catalogRefText = (r: NumberedSchemeHole['ref']): string => (catalogSource(r) as { ref: string }).ref;

export function joinery(p: HomeProject, hw: HardwareCatalogs): JoineryData {
  const R = homeRules(p),
    item = (id: string) => articleItem(hw.articles, id),
    g = physicalGraph(p, hw),
    boards = g.parts.filter((q) => q.semanticRole !== 'floor_pad').map(toBoard),
    byid = new Map(boards.map((a) => [a.id, a]));
  const techById = new Map<string, GraphPart>();
  for (const q of g.parts) if (!techById.has(q.id)) techById.set(q.id, q); // first match, as Array.find
  const hole = (
    part: Board,
    kind: string,
    world: number[],
    axis: number[],
    diameter: number,
    depth: number,
    jointId: string,
    extra: Record<string, unknown> = {},
  ) => {
    const tech = techById.get(part.id)!,
      axes = tech.local_uv_world_axes,
      normal = [0, 1, 2].find((i) => !(axes as number[]).includes(i)),
      u = world[axes[0]] - tech.origin_mm[axes[0]],
      v = world[axes[1]] - tech.origin_mm[axes[1]],
      ax = axis.findIndex((c) => c !== 0);
    const face =
      ax === normal ? 'n' + (axis[ax] > 0 ? '0' : '1') : (ax === axes[0] ? 'u' : 'v') + (axis[ax] > 0 ? '0' : '1');
    const h: Hole = {
      id: part.id + ':' + jointId + ':' + kind + ':' + part.holes.length,
      kind,
      face,
      u,
      v,
      finishedUVmm: [u, v],
      datum: 'FINISHED',
      diameterMm: diameter,
      depthMm: depth,
      jointId,
      worldCentreMm: world,
      axisTechnology: axis,
      axisHome: [axis[0], axis[2], axis[1]],
      ...extra,
    };
    part.holes.push(h);
  };
  for (const j of g.joints as (Joint & { placementProfile?: string })[]) {
    const cam = techById.get(j.camPartId) as GraphPart,
      stud = techById.get(j.studPartId) as GraphPart,
      c = byid.get(cam.id)!,
      s = byid.get(stud.id)!,
      axis = j.contactAxis,
      other = [0, 1, 2].filter((k) => k !== axis),
      contact =
        cam.origin_mm[axis] >= stud.origin_mm[axis] + stud.extent_mm[axis] - 0.1
          ? cam.origin_mm[axis]
          : cam.origin_mm[axis] + cam.extent_mm[axis],
      towardStud = stud.origin_mm[axis] < cam.origin_mm[axis] ? -1 : 1;
    const line = other.reduce(
        (a, k) => (Math.min(cam.extent_mm[k], stud.extent_mm[k]) > Math.min(cam.extent_mm[a], stud.extent_mm[a]) ? k : a),
        other[0],
      ),
      cross = other.find((k) => k !== line)!,
      start = Math.max(cam.origin_mm[line], stud.origin_mm[line]),
      len = Math.min(cam.origin_mm[line] + cam.extent_mm[line], stud.origin_mm[line] + stud.extent_mm[line]) - start,
      mid =
        (Math.max(cam.origin_mm[cross], stud.origin_mm[cross]) +
          Math.min(cam.origin_mm[cross] + cam.extent_mm[cross], stud.origin_mm[cross] + stud.extent_mm[cross])) /
        2;
    const edge = Math.min(HOME.connectorRowMax, len / HOME.connectorRowFraction),
      shift = HOME.dowelShift;
    let rows = [edge, len - edge],
      woods = [rows[0] + shift, rows[1] - shift];
    // MOD-DEC-364 (FINDINGS 385): a joint narrower than 200 mm by the common rule, from the front (lower) end of the
    // zone; the drawer boxes keep theirs. With one fastener its dowel is the rule's, with two the dowels of 192.
    const narrow = R.narrowJoints === 'MOD_DEC_364' && j.orientation !== 'box-front' && j.recipe !== 'MAKMART_S16' ? narrowJointLayout(len) : null;
    if (narrow) {
      rows = narrow.stations;
      woods = narrow.dowels.length ? narrow.dowels : [rows[0] + shift, rows[1] - shift];
      j.placementProfile = 'narrow_joint_364';
    }
    if (j.orientation === 'shelf' && stud.semanticRole === 'bearing_divider') {
      // A divider carries shelves from both sides: the two connector patterns are staggered.
      const left = cam.origin_mm[0] < stud.origin_mm[0];
      if (R.sharedShelfPattern === 'R3_32_104') {
        rows = left ? [32, len - 32] : [104, len - 104];
        woods = left ? [64, len - 64] : [136, len - 136];
        if (len < 304) g.unresolved.push({ code: 'SHARED_SHELF_DEPTH', jointId: j.id });
      } else {
        // MOD-DEC-343: from the finished front edge of the partition — left shelf 37 and G, right shelf 16 mm deeper
        // (53, G − 16); the dowel 32 mm towards the centre (192). Shallower than 202 mm the rear stations of the right
        // shelf reach its front ones: a conflict.
        const S = HOME_SHARED_SHELF,
          G = system32Rows(stud.extent_mm[1], false)?.[1] ?? NaN,
          off = stud.origin_mm[1] - start,
          k = left ? 0 : S.stagger;
        rows = [S.frontLine + k + off, G - k + off];
        woods = [rows[0] + S.dowelShift, rows[1] - S.dowelShift];
        if (!(G - S.stagger - S.dowelShift > S.frontLine + S.stagger + S.dowelShift)) g.unresolved.push({ code: 'SHARED_SHELF_DEPTH', jointId: j.id });
      }
      j.placementProfile = 'shared_shelf_pattern';
    }
    if ((j.orientation === 'back' || j.orientation === 'apron') && stud.semanticRole === 'bearing_shared_side') {
      const b = p.bodies.find((b) => b.id === cam.bodyId)!,
        pad = foot(p, b),
        top = b.y + b.h - topT(p);
      const back = HOME.deskBackRows,
        apron = HOME.deskApronRows,
        A = HOME.apronHeight;
      rows =
        j.orientation === 'back'
          ? [b.y + pad + p.thickness + back.low - start, top - A - back.high - start]
          : [top - A + apron.edge - start, top - apron.edge - start];
      woods =
        j.orientation === 'back'
          ? [b.y + pad + p.thickness + back.dowelLow - start, top - A - back.dowelHigh - start]
          : [top - A + apron.dowel - start, top - apron.dowel - start];
      j.placementProfile = 'desk_shared_back_apron_exception';
    }
    if (j.recipe === 'MAKMART_S16') {
      for (const row of rows) {
        const world = [0, 0, 0];
        world[axis] = contact;
        world[line] = start + row;
        world[cross] = mid;
        const dir = [0, 0, 0];
        dir[axis] = -towardStud;
        const outer = [...world],
          k = HOME.drawerBoxBoard;
        outer[axis] += towardStud * k;
        hole(s, 'CONFIRMAT_THROUGH', outer, dir, HOME.confirmatHeadDiameter, k, j.id, { through: true, recipeStatus: 'BOUNDED_S16', headSeatStatus: 'UNKNOWN' });
        hole(c, 'CONFIRMAT_EDGE', world, dir, HOME.confirmatPilotDiameter, HOME.confirmatPilotDepth, j.id, { recipeStatus: 'BOUNDED_S16', headSeatStatus: 'UNKNOWN' });
      }
      continue;
    }
    const normal = [0, 1, 2].find((i) => !(cam.local_uv_world_axes as number[]).includes(i))!,
      camFace =
        normal === 0
          ? cam.id.endsWith(':side-left')
            ? -1
            : 1
          : normal === 1
            ? // The cams of a drawer box and of the front rail of a plinth (r5, 516) are in their inner face.
              j.orientation === 'box-front' || j.orientation === 'plinth-front'
              ? -1
              : 1
            : j.orientation === 'bottom'
              ? -1
              : 1;
    for (let i = 0; i < rows.length; i++) {
      const world = [0, 0, 0];
      world[axis] = contact - towardStud * HOME.camOffset;
      world[line] = start + rows[i];
      world[cross] = mid;
      world[normal] = camFace > 0 ? cam.origin_mm[normal] : cam.origin_mm[normal] + cam.extent_mm[normal];
      const intoCam = [0, 0, 0];
      intoCam[normal] = camFace;
      hole(c, 'CAM', world, intoCam, HOME.camDiameter, cam.thickness_mm === 16 ? HOME.camDepth16 : HOME.camDepth18, j.id);
      const entry = [...world];
      entry[axis] = contact;
      entry[normal] = cam.origin_mm[normal] + cam.thickness_mm / 2;
      const intoEdge = [0, 0, 0];
      intoEdge[axis] = -towardStud;
      hole(c, 'CHANNEL', entry, intoEdge, HOME.channelDiameter, HOME.camOffset, j.id, { axisCenterMm: cam.thickness_mm / 2 });
      const intoStud = [0, 0, 0];
      intoStud[axis] = towardStud;
      hole(s, 'STUD', entry, intoStud, HOME.studDiameter, HOME.studDepth, j.id, { sku: item(HOME.hardwareItems.stud).article });
      const wood = [...entry];
      wood[line] = start + woods[i];
      hole(c, 'WOOD_EDGE', wood, intoEdge, HOME.dowelDiameter, HOME.dowelEdgeDepth, j.id, { sku: item(HOME.hardwareItems.dowel).article });
      hole(s, 'WOOD_FACE', wood, intoStud, HOME.dowelDiameter, HOME.dowelFaceDepth, j.id, { sku: item(HOME.hardwareItems.dowel).article });
    }
  }
  for (const b of p.bodies)
    for (const f of b.doors) {
      const hp = hingeProfile(p, hw, b, f);
      if (!hp.count) continue;
      if (R.hingeRule === 'WARDROBE') {
        // r5 (MOD-DEC-277, FINDINGS 841): the holes of the kit or the catalogue of the chosen pair — the cup and its
        // fixing in the back face of the door from its hinge-side edge, the plate on the inner face of the panel from
        // its front edge, at the station of the cup.
        const door = byid.get(b.id + ':' + f.id + ':door')!,
          panel = byid.get(boundaryPartId(b, hingeBoundary(f)))!,
          r = frontGeometry(p, b, f),
          left = f.hinge === 'left',
          inner = left ? panel.origin_mm[0] + panel.extent_mm[0] : panel.origin_mm[0],
          origin = hp.drilling as { source: string; completeness: string };
        const extra = (h: NumberedSchemeHole, stationId: string) => ({
          stationId,
          machiningRole: h.machiningRole,
          holeSource: h.origin === 'KIT' ? 'KIT_FR3D' : 'MANUFACTURER_CATALOG',
          holeSourceRef: catalogRefText(h.ref),
          holeCompleteness: origin.completeness === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
        });
        hp.stations!.forEach((z, k) => {
          const stationId = f.id + ':hinge-' + k;
          for (const h of hp.facadeHoles as NumberedSchemeHole[])
            hole(door, h.machiningRole === 'CUP' ? 'HINGE_CUP' : 'HINGE_CUP_FIXING', [b.x + (left ? r.x + h.acrossMm : r.x + r.w - h.acrossMm), r.d, b.y + r.y + z + h.alongMm], [0, -1, 0], h.diameterMm, h.depthMm, stationId, extra(h, stationId));
          for (const h of hp.plateHoles as NumberedSchemeHole[])
            hole(panel, 'HINGE_PLATE', [inner, panel.origin_mm[1] + h.acrossMm, b.y + r.y + z + h.alongMm], [left ? -1 : 1, 0, 0], h.diameterMm, h.depthMm, stationId, extra(h, stationId));
        });
        continue;
      }
      const door = byid.get(b.id + ':' + f.id + ':door')!,
        side = byid.get(b.id + ':side-' + f.hinge)!,
        r = frontGeometry(p, b, f),
        left = f.hinge === 'left',
        cupX = b.x + r.x + (left ? HOME.hingeCupFromEdge : r.w - HOME.hingeCupFromEdge),
        screwX = b.x + r.x + (left ? HOME.hingeCupScrewFromEdge : r.w - HOME.hingeCupScrewFromEdge),
        plateX = b.x + (left ? p.thickness : b.w - p.thickness),
        // The cup is drilled in the back face of the door; the plate 37 mm behind the front edge of the carcass (H-24).
        back = r.d,
        plateY = aFront(p, b) + HOME.hingePlateOffset,
        screw = articleDimension(item(HOME.hardwareItems.hingeScrew), 'diameterMm'),
        kit = item(HOME.hardwareItems.hinge);
      hp.stations!.forEach((z, k) => {
        const stationId = f.id + ':hinge-' + k;
        hole(door, 'HINGE_CUP', [cupX, back, b.y + z], [0, -1, 0], articleDimension(kit, 'cupDiameterMm'), articleDimension(kit, 'cupDepthMm'), stationId, { stationId });
        for (const dz of [-HOME.hingeCupScrewSpacing, HOME.hingeCupScrewSpacing])
          hole(door, 'HINGE_CUP_SCREW_SPOT', [screwX, back, b.y + z + dz], [0, -1, 0], screw, 0, stationId, { pilotStatus: 'UNKNOWN' });
        for (const dz of [-HOME.hingePlateScrewSpacing, HOME.hingePlateScrewSpacing])
          hole(side, 'HINGE_PLATE_SCREW_SPOT', [plateX, plateY, b.y + z + dz], [left ? -1 : 1, 0, 0], screw, 0, stationId, {
            pilotStatus: 'UNKNOWN',
          });
      });
    }
  // r5 (FINDINGS 844, 845): the side holes of the chosen support at its axis on the grid and its bores in the shelf, by
  // the scheme of the catalogue (277); the spare levels ±32 mm (193) after every other hole, where they meet none.
  const spares: { board: Board; world: number[]; axis: number[]; diameter: number; depth: number; jointId: string; extra: Record<string, unknown> }[] = [];
  for (const b of p.bodies)
    for (const s of b.shelves.filter((s) => !s.fixed)) {
      const shelf = g.parts.find((q) => q.elementId === s.id)!,
        refs = [s.lo, s.hi],
        gap = HOME.adjustableShelfSideGap;
      if (R.shelfSupportRule === 'WARDROBE') {
        const plan = homeShelfSupport(p, hw, b, s),
          support = plan.support;
        if (!support || plan.axisMm === null) continue;
        const z = b.y + plan.axisMm,
          board = byid.get(shelf.id)!,
          spare = wardrobeFill.constants.spareLevel.value;
        plan.ends.forEach((end, i) => {
          if (!end.scheme) return;
          const side = byid.get(b.id + ':' + (end.ref === 'left' ? 'side-left' : end.ref === 'right' ? 'side-right' : end.ref))!,
            x = i ? shelf.origin_mm[0] + shelf.extent_mm[0] + gap : shelf.origin_mm[0] - gap,
            normal = [i ? 1 : -1, 0, 0],
            extra = (h: ShelfSupportHole) => ({ holeSource: 'MANUFACTURER_CATALOG', holeSourceRef: catalogRefText(h.ref ?? support.ref), holeCompleteness: end.scheme!.completeness, sku: support.article });
          for (const h of end.scheme.holes.filter((h) => h.part === 'SIDE_PANEL' && h.widthMm !== null && h.depthMm !== null)) {
            const world = [x, side.origin_mm[1] + h.acrossMm, z];
            hole(side, h.machiningRole, world, normal, h.widthMm!, h.depthMm!, s.id, { ...extra(h), station: h.acrossMm });
            for (const dz of [-spare, spare])
              spares.push({ board: side, world: [world[0], world[1], z + dz], axis: normal, diameter: h.widthMm!, depth: h.depthMm!, jointId: s.id, extra: { ...extra(h), station: h.acrossMm, spareOf: h.machiningRole } });
          }
          // The bore of a hidden support opens at the shelf end by the scheme (MOD-DEC-365, INV-H02 openPocket); the
          // shallower of two bores on one axis is the step of the deeper one (MAORI16), as the kitchen (FINDINGS 272).
          const bores = end.scheme.holes.filter((h) => h.part === 'SHELF' && h.face === 'LOWER' && h.fromEndMm !== null && h.widthMm !== null && h.depthMm !== null),
            step = (h: ShelfSupportHole) => bores.some((o) => o !== h && o.acrossMm === h.acrossMm && o.fromEndMm === h.fromEndMm && o.depthMm! > h.depthMm!);
          for (const h of bores)
            hole(
              board,
              step(h) ? 'SHELF_BORE_STEP' : h.machiningRole,
              [i ? shelf.origin_mm[0] + shelf.extent_mm[0] - h.fromEndMm! : shelf.origin_mm[0] + h.fromEndMm!, shelf.origin_mm[1] + h.acrossMm, shelf.origin_mm[2]],
              [0, 0, 1],
              h.widthMm!,
              h.depthMm!,
              s.id,
              { ...extra(h), openEnd: true, station: h.acrossMm, stationId: s.id + ':' + i + ':' + h.acrossMm },
            );
        });
        continue;
      }
      refs.forEach((ref, i) => {
        const side = byid.get(b.id + ':' + (ref === 'left' ? 'side-left' : ref === 'right' ? 'side-right' : ref))!;
        // r3: 32 mm from the shelf edges (H-21). r4: the System 32 front line and rear row G from the front edge of the
        // vertical (193, 343); on a partition the shelf right of it is 16 mm deeper, so the two sides never meet (H-02).
        const front = side.origin_mm[1],
          rows = system32Rows(shelf.origin_mm[1] + shelf.extent_mm[1] - front, ref !== 'left' && ref !== 'right' && i === 0),
          ys =
            R.shelfPinRows === 'SYSTEM32' && rows
              ? rows.map((y) => front + y)
              : [shelf.origin_mm[1] + 32, shelf.origin_mm[1] + shelf.extent_mm[1] - 32];
        for (const y of ys)
          hole(
            side,
            'SHELF_PIN',
            [i ? shelf.origin_mm[0] + shelf.extent_mm[0] + gap : shelf.origin_mm[0] - gap, y, b.y + s.y - HOME.shelfPinBelowShelf],
            [i ? 1 : -1, 0, 0],
            HOME.shelfPinDiameter,
            HOME.shelfPinDepth,
            s.id,
          );
      });
    }
  // r4 (MOD-DEC-276, H-05): marks of the runner screws — depth 0, the marking layer. On the vertical: the published
  // positions from the front edge of the carcass; on the box side: from the front of the box; height — box centre.
  // r5 (MOD-DEC-574, 277; FINDINGS 1750): a concealed runner — the holes of its BAZIS kit: Ø2.5 × 2.5 in the side panel
  // at the stations of the kit from the front of the runner, above the underside of the bottom; the holes of its rear
  // hooks in the rear face of the back. The box takes no screw of the runner in its sides: the clips hold its bottom.
  for (const b of p.bodies)
    for (const f of b.drawers) {
      const n = runnerInfo(p, hw, b, f),
        c = n.concealed;
      if (!c) continue;
      const id = f.id + ':runner',
        ref = (r: string) => b.id + ':' + (r === 'left' ? 'side-left' : r === 'right' ? 'side-right' : r),
        lo = byid.get(ref(f.lo))!,
        hi = byid.get(ref(f.hi))!,
        dl = byid.get(b.id + ':' + f.id + ':side-left')!,
        dr = byid.get(b.id + ':' + f.id + ':side-right')!,
        back = byid.get(b.id + ':' + f.id + ':back')!,
        under = b.y + n.boxY + c.bottomRecessMm,
        kit = { holeSource: 'KIT_FR3D', holeSourceRef: c.holeRef, holeCompleteness: 'COMPLETE' },
        z = under + c.carcassHoleAboveBottomMm;
      for (const y of n.cabinetMountZ) {
        hole(lo, 'RUNNER_FIXING', [lo.origin_mm[0] + lo.extent_mm[0], c.frontMm + y, z], [-1, 0, 0], c.carcassHoleDiameterMm, c.carcassHoleDepthMm, id, kit);
        hole(hi, 'RUNNER_FIXING', [hi.origin_mm[0], c.frontMm + y, z], [1, 0, 0], c.carcassHoleDiameterMm, c.carcassHoleDepthMm, id, kit);
      }
      const h = c.rearHook,
        rear = back.origin_mm[1] + back.extent_mm[1];
      for (const x of [dl.origin_mm[0] + dl.extent_mm[0] + h.fromSideMm, dr.origin_mm[0] - h.fromSideMm])
        hole(back, 'RUNNER_HOOK', [x, rear, under + h.aboveBottomMm], [0, -1, 0], h.diameterMm, h.depthMm, id, kit);
    }
  if (R.runnerMarks)
    for (const b of p.bodies)
      for (const f of b.drawers) {
        const n = runnerInfo(p, hw, b, f),
          a = aFront(p, b),
          z = b.y + n.boxY + n.boxH / 2,
          id = f.id + ':runner',
          d = articleDimension(item(HOME.hardwareItems.runnerScrew), 'diameterMm'),
          ref = (r: string) => b.id + ':' + (r === 'left' ? 'side-left' : r === 'right' ? 'side-right' : r),
          lo = byid.get(ref(f.lo))!,
          hi = byid.get(ref(f.hi))!,
          dl = byid.get(b.id + ':' + f.id + ':side-left')!,
          dr = byid.get(b.id + ':' + f.id + ':side-right')!,
          by = dl.origin_mm[1];
        if (n.concealed) continue;
        for (const y of n.cabinetMountZ) {
          hole(lo, 'RUNNER_SCREW_SPOT', [lo.origin_mm[0] + lo.extent_mm[0], a + y, z], [-1, 0, 0], d, 0, id, { pilotStatus: 'UNKNOWN' });
          hole(hi, 'RUNNER_SCREW_SPOT', [hi.origin_mm[0], a + y, z], [1, 0, 0], d, 0, id, { pilotStatus: 'UNKNOWN' });
        }
        for (const y of n.drawerMountZ) {
          hole(dl, 'RUNNER_SCREW_SPOT', [dl.origin_mm[0], by + y, z], [1, 0, 0], d, 0, id, { pilotStatus: 'UNKNOWN' });
          hole(dr, 'RUNNER_SCREW_SPOT', [dr.origin_mm[0] + dr.extent_mm[0], by + y, z], [-1, 0, 0], d, 0, id, { pilotStatus: 'UNKNOWN' });
        }
      }
  // r5 (MOD-DEC-574, 496; FINDINGS 1307): the cable outlet of the prototype r1 — a through hole in the back of a body
  // with `cable`, in the middle of its width, below the top; drilled from the rear face, of the board or of HDF alike.
  for (const b of p.bodies) {
    const c = cableOutletOf(p, b),
      back = byid.get(b.id + ':back');
    if (!c || !back) continue;
    const y = back.origin_mm[1] + back.extent_mm[1];
    hole(back, 'CABLE_OUTLET', [back.origin_mm[0] + back.extent_mm[0] / 2, y, b.y + b.h - topT(p) - c.belowTopMm], [0, -1, 0], c.diameterMm, back.extent_mm[1], b.id + ':cable', {
      through: true,
      holeSource: 'PROTOTYPE',
      holeSourceRef: 'home-legacy.js r1 CABLE: Ø60, 100 мм ниже верха задника (FINDINGS 1307)',
      holeCompleteness: 'UNKNOWN_AWAITING_OWNER',
    });
  }
  for (const c of spares) {
    const z = c.world[2],
      r = c.diameter / 2,
      probe = cylinderOf({ id: '', worldCentreMm: c.world, axisTechnology: c.axis, diameterMm: c.diameter, depthMm: c.depth } as unknown as Hole);
    if (z - r < c.board.origin_mm[2] - 0.1 || z + r > c.board.origin_mm[2] + c.board.extent_mm[2] + 0.1) continue;
    if (c.board.holes.some((h) => h.depthMm > 0 && h.diameterMm > 0 && cylindersClash(probe, cylinderOf(h)))) continue;
    hole(c.board, 'SHELF_SUPPORT_SPARE', c.world, c.axis, c.diameter, c.depth, c.jointId, c.extra);
  }
  const drillIssues: Unresolved[] = [];
  for (const a of boards)
    for (const h of a.holes) {
      // The open bore of a hidden support leaves the shelf end by its scheme (MOD-DEC-365).
      if (!['CHANNEL', 'WOOD_EDGE', 'CONFIRMAT_EDGE'].includes(h.kind) && h.depthMm > 0 && !h.openEnd) {
        const r = h.diameterMm / 2;
        if (h.u - r < -0.1 || h.v - r < -0.1 || h.u + r > a.length + 0.1 || h.v + r > a.width + 0.1)
          drillIssues.push({ code: 'BORE_BOUNDARY', partId: a.id, holeId: h.id });
      }
    }
  // r5 (MOD-DEC-515; INV-H09, FINDINGS 942): no bore of a carcass part enters the rebate of the back of HDF — a fastener
  // there loses its hold and spoils the rebate. The edit is refused with the reason (validate.ts).
  for (const b of p.bodies) {
    const q = hdfBackOf(p, b),
      back = g.parts.find((x) => x.id === b.id + ':back');
    if (!q || !back) continue;
    const { lo, hi } = hdfRebateBox(q, back, b.d);
    for (const a of boards.filter((x) => x.bodyId === b.id && REBATE_ROLES.has(x.semanticRole)))
      for (const h of a.holes.filter((x) => x.depthMm > 0)) {
        const c = cylinderOf(h);
        if ([0, 1, 2].every((k) => Math.min(c.max[k], hi[k]) - Math.max(c.min[k], lo[k]) > 0.1)) drillIssues.push({ code: 'BORE_IN_REBATE', partId: a.id, holeId: h.id });
      }
  }
  // r5 (MOD-DEC-574, FINDINGS 1305): no bore of a wall of a drawer box enters the groove of its bottom of HDF — the groove
  // would cut the fastener and the bottom would lose its seat. The edit is refused with the reason (validate.ts).
  const bottomHdf = hdfDrawerBottomOf(p);
  for (const bottom of bottomHdf ? g.parts.filter((x) => x.semanticRole === 'drawer_bottom' && x.material === HDF_BACK_MATERIAL) : []) {
    const c = (bottomHdf!.grooveWidthMm - bottomHdf!.thicknessMm) / 2,
      lo = [bottom.origin_mm[0], bottom.origin_mm[1], bottom.origin_mm[2] - c],
      hi = [bottom.origin_mm[0] + bottom.extent_mm[0], bottom.origin_mm[1] + bottom.extent_mm[1], bottom.origin_mm[2] + bottom.extent_mm[2] + c];
    for (const a of boards.filter((x) => x.bodyId === bottom.bodyId && x.elementId === bottom.elementId && DRAWER_WALL_ROLES.has(x.semanticRole)))
      for (const h of a.holes.filter((x) => x.depthMm > 0)) {
        const q = cylinderOf(h);
        if ([0, 1, 2].every((k) => Math.min(q.max[k], hi[k]) - Math.max(q.min[k], lo[k]) > 0.1)) drillIssues.push({ code: 'BORE_IN_GROOVE', partId: a.id, holeId: h.id });
      }
  }
  const data: JoineryData = {
    status: 'ENGINEERING_DRAFT',
    coordinateSystem: 'u/v finished dimensions; technology x-right/y-back/z-up -> Home x/y-up/z-back',
    coordinateBasis: 'FINISHED',
    placementBasis: 'Расчётные физические узлы; неполная квалификация инструмента и крепежа.',
    boards,
    joints: g.joints.map((j) => ({ ...j, camSku: j.recipe === 'RASTEX16_DU325' ? '25062' : '13957', studSku: '47458' })),
    unresolved: [...g.unresolved, ...drillIssues],
    qualification: { ...g.qualification, drillVolumes: 'HOLD' },
    handleBoresExcluded: true,
  };
  const inspection = inspectDrilling(data, R.drillingClashRefused);
  data.unresolved.push(...inspection.issues);
  data.drillInspection = inspection;
  data.qualification.nominalFlatCylinderScreen = inspection.status;
  return data;
}

interface Cylinder {
  h: Hole;
  axis: number;
  r: number;
  min: number[];
  max: number[];
}

const CLASH_EPS = 0.05;

/** A bore as a finite flat-ended cylinder along its axis. */
function cylinderOf(h: Hole): Cylinder {
  const axis = h.axisTechnology.findIndex((v) => v !== 0),
    end = h.worldCentreMm[axis] + h.axisTechnology[axis] * h.depthMm,
    r = h.diameterMm / 2,
    min = h.worldCentreMm.map((v, k) => (k === axis ? Math.min(v, end) : v - r)),
    max = h.worldCentreMm.map((v, k) => (k === axis ? Math.max(v, end) : v + r));
  return { h, axis, r, min, max };
}

/** Whether two finite cylinders intersect (parallel or orthogonal axes), with the screen's tolerance. */
function cylindersClash(a: Cylinder, b: Cylinder): boolean {
  const eps = CLASH_EPS,
    intervalDistance = (v: number, lo: number, hi: number) => Math.max(lo - v, v - hi, 0);
  if (a.axis === b.axis) {
    const axial = Math.min(a.max[a.axis], b.max[b.axis]) - Math.max(a.min[a.axis], b.min[b.axis]);
    if (axial <= 0.1) return false;
    const radial = Math.sqrt(a.h.worldCentreMm.reduce((s, v, k) => s + (k === a.axis ? 0 : (v - b.h.worldCentreMm[k]) ** 2), 0));
    return radial < a.r + b.r - 0.1;
  }
  const i = a.axis,
    j = b.axis,
    k = [0, 1, 2].find((n) => n !== i && n !== j)!,
    di = intervalDistance(b.h.worldCentreMm[i], a.min[i] + eps, a.max[i] - eps),
    dj = intervalDistance(a.h.worldCentreMm[j], b.min[j] + eps, b.max[j] - eps);
  if (di >= b.r - eps || dj >= a.r - eps) return false;
  const sa = Math.sqrt((a.r - eps) ** 2 - dj ** 2),
    sb = Math.sqrt((b.r - eps) ** 2 - di ** 2);
  return Math.abs(a.h.worldCentreMm[k] - b.h.worldCentreMm[k]) < sa + sb;
}

/**
 * Every bore as a finite flat-ended cylinder; reports bores leaving the board and unintended intersections.
 * `boxes` (r4): bores entering from different faces or edges also clash when their boxes overlap — the screen of
 * INV-H04 (FINDINGS 233), so that the graph of an accepted r4 project never fails it.
 */
export function inspectDrilling(data: Pick<JoineryData, 'boards'>, boxes = false): DrillInspection {
  const issues: Unresolved[] = [],
    cylinders: Cylinder[] = [],
    clash = cylindersClash;
  for (const board of data.boards) {
    const holes = board.holes
      .filter((h) => h.depthMm > 0 && h.diameterMm > 0 && h.axisTechnology && h.worldCentreMm)
      .map(cylinderOf);
    cylinders.push(...holes);
    for (const c of holes)
      if (
        !c.h.openEnd &&
        (c.min.some((v, k) => v < board.origin_mm[k] - 0.1) ||
          c.max.some((v, k) => v > board.origin_mm[k] + board.extent_mm[k] + 0.1))
      )
        issues.push({ code: 'CUTTER_OUTSIDE', partId: board.id, holeId: c.h.id });
    for (let i = 0; i < holes.length; i++)
      for (let j = i + 1; j < holes.length; j++) {
        const a = holes[i],
          b = holes[j],
          remaining = [0, 1, 2].find((k) => k !== a.axis && k !== b.axis)!,
          intended =
            a.axis !== b.axis &&
            a.h.jointId === b.h.jointId &&
            a.h.kind !== b.h.kind &&
            [a.h.kind, b.h.kind].every((k) => ['CAM', 'CHANNEL'].includes(k)) &&
            Math.abs(a.h.worldCentreMm[remaining] - b.h.worldCentreMm[remaining]) < 0.1,
          // The step of a shelf bore is the same bore wider and shallower (r5, MAORI16).
          stepped = a.h.stationId !== undefined && a.h.stationId === b.h.stationId && [a.h.kind, b.h.kind].includes('SHELF_BORE_STEP');
        if (intended || stepped) continue;
        const station = a.h.jointId === b.h.jointId && a.h.kind !== b.h.kind && a.h.stationId !== undefined && a.h.stationId === b.h.stationId,
          box = boxes && !station && a.h.face !== b.h.face && [0, 1, 2].every((k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]) > 0.1);
        if (clash(a, b) || box)
          issues.push({
            code: 'CUTTER_INTERSECTION',
            partId: board.id,
            holeIds: [a.h.id, b.h.id],
            basis: box && !clash(a, b) ? 'BOX_SCREEN' : a.axis === b.axis ? 'FINITE_PARALLEL_CYLINDERS' : 'FINITE_ORTHOGONAL_CYLINDERS',
          });
      }
  }
  return {
    status: issues.length ? 'FAIL' : 'PASS_BOUNDED_NOMINAL',
    issues,
    finiteCylinderCount: cylinders.length,
    toleranceMm: 0.1,
    scope:
      'Finite flat-ended source-known cylinders in each physical panel; tip/head/tool/assembly and mechanism sweep remain unqualified.',
  };
}
