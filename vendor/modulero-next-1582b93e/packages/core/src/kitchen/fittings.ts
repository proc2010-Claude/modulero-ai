// The handles and the opening of the fronts of the whole kitchen (MOD-AI-16, 36; FINDINGS 3210–3213): a handle of the
// catalogue of the fittings (catalogs/hardware/fittings.json, MOD-DEC-480) or none, and the doors opened by pressing
// (MOD-DEC-483, 485) — as the wardrobe chooses them (wardrobe/fittings-edit.ts). Absent — the kitchen of the prototype:
// its handle Hettich 9306951 on every front. The choice is kept in the project (KitchenProject.fittings); the rows of
// the specification (hardware.ts), the hinges and the latches (derived.ts) read it from the scene. The kitchen offers
// every handle of the catalogue whose fixing it knows (MOD-AI-76, FINDINGS 3215): a bar or a knob screwed through the
// front, with its screws or with the screws of its own Hettich 9306951 bought by the thickness of the front; an edge
// handle and a profile laid on the edge of the front, screwed or pressed in a groove along it.
import type { Handle } from '../catalog/hardware/fittings.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Rec } from '../engine/policy/project-state.js';
import { fittingsSelection, latchFor } from '../engine/policy/fittings-selection.js';
import { DOOR_OPEN_ANGLE_DEG } from '../engine/motion.js';
import { doorHandleCentre } from '../wardrobe/fittings.js';
import type { KitchenEdit } from './editor.js';
import type { KitchenFittings, KitchenProject } from './project.js';
import { worldBox, type KitchenScene } from './room.js';

/** The handle of the prototype the kitchen keeps without a choice (hardware.ts): its record in the catalogue of the fittings. */
export const KITCHEN_DEFAULT_HANDLE = { id: 'HETTICH_9306951', brand: 'Hettich', article: '9306951', dimensionsMm: [188, 12, 35] } as const;

/** The handle of the kitchen: the prototype's (`DEFAULT`), one of the catalogue with its screws, or none («без ручек»). */
export type KitchenHandle = { kind: 'DEFAULT' } | { kind: 'CATALOG'; handle: Handle } | { kind: 'NONE' };

/** An edge handle or a profile: laid on the edge of the front, the front shorter by its rise (FINDINGS 3216). */
export const onEdge = (h: Handle): boolean => h.kind === 'EDGE' || h.kind === 'PROFILE';

/**
 * The handles of the catalogue the kitchen offers beside its own (FINDINGS 3215): a bar or a knob screwed through the
 * front whose screws are known to come with it or not; an edge handle or a profile laid on the edge whose rise over the
 * edge is known (the front is cut shorter by it), a profile with its length of sale. A handle whose fixing the catalogue
 * does not give is not offered.
 */
export const kitchenCatalogHandles = (hw: Pick<HardwareCatalogs, 'fittings'>): Handle[] =>
  hw.fittings.handles.filter(
    (h) =>
      h.id !== KITCHEN_DEFAULT_HANDLE.id &&
      (onEdge(h)
        ? h.mounting.value === 'EDGE_OVERLAY' && (h.edgeRiseMm?.value ?? 0) > 0 && (h.kind === 'EDGE' || (h.stockLengthMm ?? 0) > 0)
        : h.mounting.value === 'THROUGH_SCREWS' && h.screwsIncluded.value !== null),
  );

/**
 * How a handle is fixed to its front (FINDINGS 3215; Д of the Director, 2026-10-29): screws in its box — nothing more;
 * a bar or a knob without them — the screws M4 of Hettich by the thickness of the front, as the prototype's handle, two
 * for a bar, one for a knob; an edge handle — two self-tapping screws BLUM 609.1500 3.5 × 15, a profile — one per
 * 200 mm of its length, at least two; a handle with a groove of the catalogue (URBAN RP105, RP106) is pressed in a
 * groove along the edge of the front, its whole length, without screws.
 */
export type KitchenHandleFixing = { kind: 'INCLUDED' } | { kind: 'M4'; screws: number } | { kind: 'EDGE_SCREWS'; screws: number } | { kind: 'GROOVE'; widthMm: number; depthMm: number };

/** The semantic of the groove of a handle along the edge of its front (trimForEdgeHandle). */
export const HANDLE_GROOVE = 'GROOVE_FOR_HANDLE_PROFILE';

export const EDGE_SCREW = { manufacturer: 'BLUM', commercialSku: '609.1500', technicalSpec: '3.5x15' } as const;
const EDGE_SCREW_STEP_MM = 200;

export function kitchenHandleFixing(h: Handle | null, lengthMm: number): KitchenHandleFixing {
  if (!h) return { kind: 'M4', screws: 2 };
  const groove = h.edgeGroove?.value;
  if (onEdge(h)) return groove ? { kind: 'GROOVE', widthMm: groove.widthMm, depthMm: groove.depthMm } : { kind: 'EDGE_SCREWS', screws: h.kind === 'EDGE' ? 2 : Math.max(2, Math.ceil(lengthMm / EDGE_SCREW_STEP_MM)) };
  return h.screwsIncluded.value === true ? { kind: 'INCLUDED' } : { kind: 'M4', screws: h.kind === 'KNOB' ? 1 : 2 };
}

/** The choice of the project; empty — the defaults. */
export function kitchenFittingsOf(p: Pick<KitchenProject, 'fittings'>): KitchenFittings {
  return p.fittings ?? {};
}

/** The handle of the scene. An id the kitchen does not offer is the prototype's handle, as the wardrobe falls back to its default. */
export function kitchenHandle(s: Pick<KitchenScene, 'fittings' | 'hardware'>): KitchenHandle {
  const id = s.fittings?.handleId;
  if (id === 'NONE') return { kind: 'NONE' };
  const handle = id ? kitchenCatalogHandles(s.hardware).find((h) => h.id === id) : undefined;
  return handle ? { kind: 'CATALOG', handle } : { kind: 'DEFAULT' };
}

/** The doors of the scene open by pressing (MOD-DEC-483). */
export const kitchenPushToOpen = (s: Pick<KitchenScene, 'fittings'>): boolean => s.fittings?.pushToOpen === true;

/** The handle of the scene as a record of the catalogue: the chosen one or the prototype's; null — none or no record. */
export function kitchenHandleRecord(s: Pick<KitchenScene, 'fittings' | 'hardware'>): Handle | null {
  const k = kitchenHandle(s);
  return k.kind === 'CATALOG' ? k.handle : k.kind === 'DEFAULT' ? (s.hardware.fittings.handles.find((h) => h.id === KITCHEN_DEFAULT_HANDLE.id) ?? null) : null;
}

/** A glass front takes no edge handle or profile: there is no edge to screw or groove (FINDINGS 3216). */
const glass = (p: Rec): boolean => p.materialRole === 'GLASS' || (p.hingeThicknessMm ?? p.finished_mm?.[2]) === 6;

/**
 * The fronts of a module that take a handle, one per door, drawer or appliance front (khrAccessoryRows, r1.html:79420):
 * the group and its leading part. None with «без ручек», on a door opened by pressing (MOD-DEC-485) or a fixed front;
 * an edge handle or a profile none on a glass front (`skipped`). `pressed` — the groups of the doors opened by pressing.
 */
export function handleFronts(s: Pick<KitchenScene, 'fittings' | 'hardware'>, m: Rec, parts: readonly Rec[], pressed: ReadonlySet<string>): { fronts: { groupId: string; part: Rec }[]; skipped: { groupId: string; part: Rec }[] } {
  const k = kitchenHandle(s);
  if (k.kind === 'NONE' || m.handleMode === 'none') return { fronts: [], skipped: [] };
  const groups = new Map<string, Rec>(),
    edge = k.kind === 'CATALOG' && onEdge(k.handle);
  for (const p of parts)
    if ((p.facade || ['FACADE', 'GLASS'].includes(p.materialRole)) && !p.fixedFront) {
      const id = p.doorGroupId || p.drawerId || p.partId;
      if (!groups.has(id)) groups.set(id, p);
    }
  const all = [...groups].filter(([id, p]) => !p.handleSuppressed && !pressed.has(id)).map(([groupId, part]) => ({ groupId, part }));
  return { fronts: all.filter((f) => !(edge && glass(f.part))), skipped: all.filter((f) => edge && glass(f.part)) };
}

/** The fronts of a module that take a handle (handleFronts), the doors opened by pressing read from the module. */
export function kitchenHandleFronts(s: Pick<KitchenScene, 'fittings' | 'hardware'>, m: Rec, d: Rec): { groupId: string; part: Rec }[] {
  return handleFronts(s, m, d.parts || [], new Set((d.hardwarePlanning?.pushDoors ?? []).map((x: Rec) => x.groupId))).fronts;
}

/** Where a handle stands: its front, the direction of a bar and its centre on the outer face of the front. */
export interface KitchenHandlePlace {
  /** `<module>/handle/<group>`, as its row of the specification. */
  id: string;
  groupId: string;
  partId: string;
  orientation: 'VERTICAL' | 'HORIZONTAL';
  /**
   * The centre in the box of the module: x across, y up from its bottom, z of the outer face of the front (from the
   * carcass front). An edge handle or a profile — the middle of the edge of the front it stands on.
   */
  centreMm: [number, number, number];
  /** An edge handle or a profile: the edge of the front it stands on (the front is shorter by its rise there). */
  edge?: KitchenHandleEdge;
  /** The length of the handle: of its record, a profile — the whole edge of the front. */
  lengthMm: number;
  /** The outer and the back face of the front (z from the carcass front). */
  frontZMm: [number, number];
}

export type KitchenHandleEdge = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';

const C = fittingsSelection.constants;
const WALL = new Set(['upper', 'mezz']),
  FLOOR = new Set(['base', 'island', 'niche']);

/**
 * The edge of a front an edge handle or a profile stands on (FINDINGS 3216; Д of the Director, as the bar of 3214): a
 * drawer and a front that drops — the upper edge; a front that lifts and a door of a wall cabinet — the lower one; a
 * door of a floor cabinet — the upper one; a door of a tall one — its free edge, the one without hinges.
 */
export function handleEdge(m: Rec, p: Rec): KitchenHandleEdge {
  if (p.drawerId || p.motionKind === 'appliance-drop-door') return 'TOP';
  if (p.motionKind === 'lift-door' || m.moduleTypeId === 'KM_LIFT' || WALL.has(m.kind)) return 'BOTTOM';
  if (FLOOR.has(m.kind)) return 'TOP';
  return p.hingeSide === 'right' ? 'LEFT' : 'RIGHT';
}

/**
 * The fronts shorter by the rise of an edge handle or a profile over their edge (FINDINGS 3216; Д of the Director,
 * 2026-10-29): the gap to the next front or the carcass stays, the handle stands in what the front gave up. The box,
 * the sizes and the hinge data of the part change in place, before the hinges and the cutting read them; a handle with
 * a groove of the catalogue gets its groove along the edge, the whole length of the front.
 */
export function trimForEdgeHandle(s: KitchenScene, m: Rec, parts: Rec[], pressed: ReadonlySet<string>): void {
  const h = kitchenHandleRecord(s),
    rise = h && onEdge(h) ? (h.edgeRiseMm?.value ?? null) : null;
  if (!h || rise === null || !(rise > 0)) return;
  for (const { groupId, part: p } of handleFronts(s, m, parts, pressed).fronts) {
    if (p.box?.length !== 6) continue;
    const e = handleEdge(m, p),
      b = [...p.box] as number[],
      vertical = e === 'LEFT' || e === 'RIGHT';
    if (e === 'TOP') b[3]! -= rise;
    else if (e === 'BOTTOM') b[2]! += rise;
    else if (e === 'LEFT') b[0]! += rise;
    else b[1]! -= rise;
    const k = vertical ? 0 : 1;
    p.box = b;
    p.finished_mm = p.finished_mm.map((x: number, i: number) => (i === k ? x - rise : x));
    p.blank_mm = p.blank_mm.map((x: number, i: number) => (i === k ? x - rise : x));
    if (p.hingeWidthMm !== undefined && vertical) p.hingeWidthMm -= rise;
    if (p.hingeHeightMm !== undefined && !vertical) p.hingeHeightMm -= rise;
    if (Array.isArray(p.motionPivotMm) && e === 'BOTTOM') p.motionPivotMm = [p.motionPivotMm[0], b[2], p.motionPivotMm[2]];
    if (Array.isArray(p.motionPivotMm) && e === 'LEFT' && p.hingeSide === 'right') p.motionPivotMm = [b[0], p.motionPivotMm[1], p.motionPivotMm[2]];
    p.edgeHandle = { handleId: h.id, edge: e, riseMm: rise, groupId };
    const fix = kitchenHandleFixing(h, vertical ? b[3]! - b[2]! : b[1]! - b[0]!);
    if (fix.kind !== 'GROOVE') continue;
    const zc = (b[4]! + b[5]!) / 2,
      [z0, z1] = [zc - fix.widthMm / 2, zc + fix.widthMm / 2],
      box =
        e === 'TOP' ? [b[0]!, b[1]!, b[3]! - fix.depthMm, b[3]!, z0, z1]
        : e === 'BOTTOM' ? [b[0]!, b[1]!, b[2]!, b[2]! + fix.depthMm, z0, z1]
        : e === 'LEFT' ? [b[0]!, b[0]! + fix.depthMm, b[2]!, b[3]!, z0, z1]
        : [b[1]! - fix.depthMm, b[1]!, b[2]!, b[3]!, z0, z1],
      w = worldBox(s, m, box);
    p.grooves = [
      ...(p.grooves || []),
      {
        id: `${m.id}/handle/${groupId}/groove`,
        kind: `Паз под ручку ${h.brand} ${h.article}`,
        semantic: HANDLE_GROOVE,
        widthMm: fix.widthMm,
        depthMm: fix.depthMm,
        edge: e,
        localBox: box,
        worldBox: [
          [w[0], w[4], w[2]],
          [w[1], w[5], w[3]],
        ],
        production: false,
      },
    ];
  }
}

/**
 * The handle of the kitchen and its place on every front with one (MOD-AI-76, FINDINGS 3214; Д of the Director): a door
 * of a wall cabinet — vertical at its free edge near the lower edge, of a floor cabinet — near the upper edge, of a tall
 * one — at 1000 mm from the floor as a wardrobe door (480); a drawer — horizontal in the middle of its front; a front that
 * lifts — horizontal near its lower edge, one that drops (a dishwasher) — near its upper edge. A door lower than its bar
 * with the clearances takes it horizontal in its middle (R2-032). The distances are those of the wardrobe (480). An edge
 * handle and a profile stand on the edge of handleEdge (3216): an edge handle in its middle, a profile its whole length.
 * Null — no handle, or the catalogue has no record of the prototype's. `skipped` — the glass fronts an edge handle skips.
 */
export function kitchenHandlePlaces(s: Pick<KitchenScene, 'fittings' | 'hardware'>, m: Rec, d: Rec): { handle: Handle; places: KitchenHandlePlace[]; skipped: string[] } | null {
  const handle = kitchenHandleRecord(s);
  if (!handle) return null;
  const L = handle.sizeMm.lengthMm,
    knob = handle.kind === 'KNOB',
    clear = C.handleEdgeClearance.value,
    along = knob ? C.handleFromFreeEdge.value : L / 2 + clear,
    places: KitchenHandlePlace[] = [],
    { fronts, skipped } = handleFronts(s, m, d.parts || [], new Set((d.hardwarePlanning?.pushDoors ?? []).map((x: Rec) => x.groupId)));
  for (const { groupId, part: p } of fronts) {
    if (p.box?.length !== 6) continue;
    const [x0, x1, y0, y1, z0, z1] = p.box as number[],
      cx = (x0! + x1!) / 2,
      cy = (y0! + y1!) / 2,
      put = (orientation: KitchenHandlePlace['orientation'], x: number, y: number, edge?: KitchenHandleEdge, lengthMm = L) =>
        places.push({ id: `${m.id}/handle/${groupId}`, groupId, partId: p.partId, orientation, centreMm: [x, y, z0!], ...(edge ? { edge } : {}), lengthMm, frontZMm: [z0!, z1!] });
    if (onEdge(handle)) {
      const e = handleEdge(m, p),
        vertical = e === 'LEFT' || e === 'RIGHT',
        span = vertical ? y1! - y0! : x1! - x0!,
        len = handle.kind === 'PROFILE' ? span : Math.min(L, span);
      if (vertical) put('VERTICAL', e === 'LEFT' ? x0! : x1!, handle.kind === 'PROFILE' ? cy : Math.min(Math.max(C.handleCentreHeight.value - m.floor, y0! + len / 2), y1! - len / 2), e, len);
      else put('HORIZONTAL', cx, e === 'TOP' ? y1! : y0!, e, len);
    } else if (p.drawerId) put('HORIZONTAL', cx, cy);
    else if (p.motionKind === 'appliance-drop-door') put('HORIZONTAL', cx, y1! - C.handleFromLiftEdge.value);
    else if (p.motionKind === 'lift-door' || m.moduleTypeId === 'KM_LIFT') put('HORIZONTAL', cx, y0! + C.handleFromLiftEdge.value);
    else if (!knob && y1! - y0! < L + 2 * clear) put('HORIZONTAL', cx, cy);
    else {
      const hinge = p.hingeSide === 'right' ? 'right' : 'left',
        [x, fromFloor] = doorHandleCentre(handle, hinge, x0!, x1!, m.floor + y0!, m.floor + y1!);
      put('VERTICAL', x, WALL.has(m.kind) ? y0! + along : FLOOR.has(m.kind) ? y1! - along : fromFloor - m.floor);
    }
  }
  return { handle, places, skipped: skipped.map((f) => f.part.partId) };
}

/** How far an edge handle or a profile stands in front of the face of a front `t` thick (edgeHandleVisuals). */
export function edgeHandleForwardMm(h: Handle, t: number): number {
  const depth = h.edgeDepthMm?.value ?? h.sizeMm.thicknessMm,
    behind = h.edgeGroove?.value ? Math.max(0, (depth - t) / 2) : (h.edgeBackMm?.value ?? 0);
  return depth - behind - t;
}

/** A door of the kitchen that may strike an edge handle of another front as it opens (kitchenHandleSweeps). */
export interface KitchenHandleSweep {
  handleId: string;
  partId: string;
  doorId: string;
  forwardMm: number;
}

const OPEN_STEP_DEG = 1;

/**
 * The doors that strike an edge handle or a profile of a neighbouring front as they open (FINDINGS 3217; Д of the
 * Director: the forward projection of the handle is for this check). A simplified model of the concealed hinge: the
 * door turns about the outer arris of its hinge edge to the angle of its hinge (`motionAngleDeg`, else 105° of the
 * view); past 90° it swings over the face of the front beside its hinge edge, and a handle standing in front of that
 * face near the edge is in its way. The part of the handle in front of the face is tested in plan, where it overlaps
 * the door in height; a door does not strike the handle of its own front.
 */
export function kitchenHandleSweeps(s: KitchenScene, d: (m: Rec) => Rec): KitchenHandleSweep[] {
  const h = kitchenHandleRecord(s);
  if (!h || !onEdge(h)) return [];
  const at = (m: Rec, x: number, y: number, z: number): [number, number, number] => {
      const w = worldBox(s, m, [x, x, y, y, z, z]);
      return [w[0], w[2], w[4]];
    },
    handles: { id: string; partId: string; forward: number; y: [number, number]; plan: [number, number][] }[] = [],
    doors: { id: string; y: [number, number]; c: [number, number]; w: [number, number]; o: [number, number]; W: number; T: number; angle: number }[] = [];
  for (const m of s.modules) {
    const dm = d(m),
      parts = new Map<string, Rec>((dm.parts || []).map((p: Rec) => [p.partId, p]));
    for (const x of kitchenHandlePlaces(s, m, dm)?.places ?? []) {
      const p = parts.get(x.partId);
      if (!p || !x.edge || p.box?.length !== 6) continue;
      const [, , , , z0, z1] = p.box as number[],
        forward = edgeHandleForwardMm(h, z1! - z0!),
        rise = h.edgeRiseMm?.value ?? 0,
        drop = h.edgeDropMm?.value ?? 0,
        vertical = x.edge === 'LEFT' || x.edge === 'RIGHT',
        sign = x.edge === 'TOP' || x.edge === 'RIGHT' ? 1 : -1,
        [cx, cy] = x.centreMm,
        e = vertical ? cx : cy,
        across: [number, number] = [Math.min(e, e + sign * rise, e + sign * (rise - drop)), Math.max(e, e + sign * rise, e + sign * (rise - drop))],
        along: [number, number] = [(vertical ? cy : cx) - x.lengthMm / 2, (vertical ? cy : cx) + x.lengthMm / 2];
      if (!(forward > 0)) continue;
      const [xr, yr] = vertical ? [across, along] : [along, across],
        plan: [number, number][] = [];
      for (let i = 0; i <= 8; i++)
        for (let j = 0; j <= 2; j++) {
          const q = at(m, xr[0] + ((xr[1] - xr[0]) * i) / 8, yr[0], z0! - (forward * j) / 2);
          plan.push([q[0], q[2]]);
        }
      handles.push({ id: x.id, partId: x.partId, forward, y: [m.floor + yr[0], m.floor + yr[1]], plan });
    }
    for (const p of dm.parts || []) {
      if (p.motionKind !== 'swing-door' || !['left', 'right'].includes(p.hingeSide) || p.box?.length !== 6) continue;
      const [x0, x1, y0, y1, z0, z1] = p.box as number[],
        xh = p.hingeSide === 'right' ? x1! : x0!,
        xf = p.hingeSide === 'right' ? x0! : x1!,
        c = at(m, xh, y0!, z0!),
        far = at(m, xf, y0!, z0!),
        inner = at(m, xh, y0!, z1!),
        W = Math.hypot(far[0] - c[0], far[2] - c[2]),
        T = Math.hypot(inner[0] - c[0], inner[2] - c[2]);
      if (!(W > 0 && T > 0)) continue;
      // Plan axes of the door at its outer hinge arris: `w` along its width, `o` out of the front (away from the carcass).
      doors.push({ id: p.partId, y: [m.floor + y0!, m.floor + y1!], c: [c[0], c[2]], w: [(far[0] - c[0]) / W, (far[2] - c[2]) / W], o: [(c[0] - inner[0]) / T, (c[2] - inner[2]) / T], W, T, angle: p.motionAngleDeg ?? DOOR_OPEN_ANGLE_DEG });
    }
  }
  const out: KitchenHandleSweep[] = [];
  for (const k of handles)
    for (const door of doors) {
      if (door.id === k.partId || Math.min(door.y[1], k.y[1]) - Math.max(door.y[0], k.y[0]) <= 0) continue;
      const hit = k.plan.some(([px, pz]) => {
        const dx = px - door.c[0],
          dz = pz - door.c[1];
        for (let a = OPEN_STEP_DEG; a <= door.angle; a += OPEN_STEP_DEG) {
          const t = (a * Math.PI) / 180,
            w = [Math.cos(t) * door.w[0] + Math.sin(t) * door.o[0], Math.cos(t) * door.w[1] + Math.sin(t) * door.o[1]],
            o = [-Math.sin(t) * door.w[0] + Math.cos(t) * door.o[0], -Math.sin(t) * door.w[1] + Math.cos(t) * door.o[1]],
            u = dx * w[0]! + dz * w[1]!,
            v = dx * o[0]! + dz * o[1]!;
          if (u > 0 && u < door.W && v < 0 && v > -door.T) return true;
        }
        return false;
      });
      if (hit) out.push({ handleId: k.id, partId: k.partId, doorId: door.id, forwardMm: Math.round(k.forward * 10) / 10 });
    }
  return out;
}

export interface KitchenFittingsView {
  /** The handle chosen: null — the prototype's, 'NONE' — без ручек. */
  handleId: string | null;
  pushToOpen: boolean;
  /** What the list offers: the prototype's handle first (id null), the handles of the catalogue, «Без ручек» ('NONE'). */
  handles: { id: string | null; name: string; kind: string | null; priceRub: number | null; stockLengthMm?: number }[];
  /** An edge handle or a profile chosen: its rise the fronts are shorter by and how it is fixed (FINDINGS 3215, 3216). */
  edge: { riseMm: number; fixing: string } | null;
  /** The latch of a door opened by pressing; null — the catalogue has none. */
  latch: { name: string; priceRub: number | null } | null;
}

/** How an edge handle or a profile holds, in words (kitchenHandleFixing). */
function fixingText(h: Handle): string {
  const g = h.edgeGroove?.value;
  if (g) return `в паз ${g.widthMm} × ${g.depthMm} мм по торцу фасада на всю длину, без саморезов`;
  return h.kind === 'EDGE' ? `на 2 самореза ${EDGE_SCREW.manufacturer} ${EDGE_SCREW.commercialSku} 3,5 × 15` : `на саморезы ${EDGE_SCREW.manufacturer} ${EDGE_SCREW.commercialSku} 3,5 × 15 — по одному на 200 мм, не меньше двух`;
}

/** What «Материалы и опции» shows of the handles and the opening. */
export function kitchenFittingsView(p: KitchenProject, hw: HardwareCatalogs): KitchenFittingsView {
  const f = kitchenFittingsOf(p),
    offered = kitchenCatalogHandles(hw),
    own = hw.fittings.handles.find((h) => h.id === KITCHEN_DEFAULT_HANDLE.id),
    latch = latchFor(hw.fittings),
    chosen = offered.find((h) => h.id === f.handleId);
  return {
    handleId: f.handleId === 'NONE' || offered.some((h) => h.id === f.handleId) ? f.handleId! : null,
    pushToOpen: f.pushToOpen === true,
    handles: [
      { id: null, name: own?.name ?? `${KITCHEN_DEFAULT_HANDLE.brand} ${KITCHEN_DEFAULT_HANDLE.article}`, kind: 'BAR', priceRub: own?.price?.rub ?? null },
      ...offered.map((h) => ({ id: h.id, name: h.name, kind: h.kind, priceRub: h.price?.rub ?? null, ...(h.kind === 'PROFILE' && h.stockLengthMm ? { stockLengthMm: h.stockLengthMm } : {}) })),
      { id: 'NONE', name: 'Без ручек', kind: null, priceRub: null },
    ],
    latch: latch ? { name: latch.name, priceRub: latch.price?.rub ?? null } : null,
    edge: chosen && onEdge(chosen) ? { riseMm: chosen.edgeRiseMm!.value!, fixing: fixingText(chosen) } : null,
  };
}

/**
 * Sets the handle of the kitchen ('NONE' — без ручек; null — the prototype's back) and the opening by pressing (true or
 * false). An id the catalogue does not have is refused, the kitchen is not changed. Every front of the kitchen takes the
 * choice: the doors opened by pressing lose their handles, the drawers and the lifts keep theirs (MOD-DEC-485).
 */
export function setKitchenFittings(p: KitchenProject, hw: HardwareCatalogs, change: { handleId?: string | null; pushToOpen?: boolean | null }): KitchenEdit {
  const next: KitchenFittings = { ...kitchenFittingsOf(p) };
  for (const k of Object.keys(change))
    if (k !== 'handleId' && k !== 'pushToOpen') return { ok: false, problem: `Неизвестный выбор фурнитуры кухни: ${k}. Кухня не изменена.` };
  const { handleId, pushToOpen } = change;
  if (handleId !== undefined) {
    if (handleId !== null && handleId !== 'NONE' && handleId !== KITCHEN_DEFAULT_HANDLE.id && !kitchenCatalogHandles(hw).some((h) => h.id === handleId))
      return { ok: false, problem: `Ручки ${handleId} нет среди ручек кухни (ручки каталога с известным креплением). Кухня не изменена.` };
    if (handleId === null || handleId === KITCHEN_DEFAULT_HANDLE.id) delete next.handleId;
    else next.handleId = handleId;
  }
  if (pushToOpen !== undefined) {
    if (pushToOpen) next.pushToOpen = true;
    else delete next.pushToOpen;
  }
  const q: KitchenProject = JSON.parse(JSON.stringify(p));
  if (Object.keys(next).length) q.fittings = next;
  else delete q.fittings;
  const view = kitchenFittingsView(q, hw),
    name = view.handles.find((h) => h.id === view.handleId)!.name;
  return {
    ok: true,
    project: q,
    notice:
      `Ручка: ${name}` +
      (view.pushToOpen ? '; двери открываются нажатием — петли без пружины и толкатели, у ящиков и подъёмников ручки остаются' : '') +
      (view.handleId === 'NONE' && !view.pushToOpen ? '; без ручек и без открывания нажатием фасады открывают за кромку или профиль, купленный отдельно' : '') +
      '.',
  };
}
