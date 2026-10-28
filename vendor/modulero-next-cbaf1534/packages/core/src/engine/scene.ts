// One scene builder for every product (task V1, MOD-DEC-324): the 3D view is built only from the graph — the
// placement, the finished size and the contour of each part. No product has formulas of its own for the 3D
// (the wardrobe `u13Boxes` are not carried over), so the picture, the part list and the drilling cannot drift apart.
//
// Product axes of the graph: X to the right, Y to the back (0 = front plane), Z up from the floor, millimetres
// (`coordinateSystem: X_RIGHT_Y_BACK_Z_UP_MM`). A part occupies origin + s·L·u + t·W·v + r·T·n for s, t, r in [0, 1]
// (a contour replaces the rectangle L × W in the u, v plane). The view maps these axes to its world itself.
import type { EdgeSlot, Graph, Groove, HardwareModel, HardwareVisual, Hole, Notch, Part, PartRole, Vec3 } from './contract.js';
import { bevelSection } from './invariants/geometry.js';
import { sceneMotions, type SceneMotion } from './motion.js';

/** What a part is drawn with: the carcass board, the front board (a bought ready-made front too) or metal/plastic of purchased hardware. */
export type SceneSurface = 'CORPUS' | 'FACADE' | 'HARDWARE';

export interface ScenePart {
  /** The graph part id: one id in 3D, in the part list and in the drilling. */
  id: string;
  name: string;
  role: PartRole;
  /** Input element the part belongs to (a shelf, a door, a drawer), for selecting it in the editor. */
  inputRef: string | null;
  assemblyId: string;
  surface: SceneSurface;
  /** Decor of the part (`material.decorId`); the view picks colour or texture by it. */
  decorId: string;
  /** A pane of glass (material family GLASS): the view draws it see-through (R4-015, FINDINGS 1894). */
  glass?: true;
  /** Finished size with edge banding E: along u, along v, along n. */
  sizeMm: Vec3;
  originMm: Vec3;
  uAxis: Vec3;
  vAxis: Vec3;
  nAxis: Vec3;
  /** Polygon in the u, v plane of a non-rectangular part; null — the rectangle sizeMm[0] × sizeMm[1]. */
  contourMm: [number, number][] | null;
  /** Edge banding per slot: A at v = 0, B at v = W, C at u = 0, D at u = L (true — banded, false — bare). */
  banded: Record<EdgeSlot, boolean>;
  /** The bands of the visible edges in another decor (MOD-DEC-483, «в цвет фасадов»): the decor and its slots; absent — none. */
  edgeDecor?: { decorId: string; slots: EdgeSlot[] };
  /** Axis-aligned box in product axes, from the placement and the size (or the contour). */
  boxMm: { min: Vec3; max: Vec3 };
  /** Everything the mesh depends on except the position: equal keys share one geometry. */
  shapeKey: string;
  /** Shape, place and decor: the mesh of a part is rebuilt only when this changes. */
  key: string;
}

export interface Scene3d {
  /** Box of all parts in product axes; the view centres the product on it. */
  boundsMm: { min: Vec3; max: Vec3 };
  parts: ScenePart[];
  /** Manufactured parts: N of MOD-DEC-244 (purchased hardware is not counted). */
  manufacturedParts: number;
  /** Doors and drawers the view opens, from the mechanisms of the graph (task V2, motion.ts); none without mechanisms. */
  motions: SceneMotion[];
  /**
   * Models of purchased hardware (MOD-DEC-432, task FIT): rods, holders, legs, handles — from the visuals of the
   * mechanisms. Not parts: no id of the part list, not in the bounds; a model on a host part moves with it.
   */
  hardware: SceneHardware[];
  /**
   * Models of the catalogue (MOD-DEC-536, FINDINGS 1085): the file of a mechanism put into its place. The view draws
   * one instead of the `hardware` of its mechanism once it has the file; until then — or without it — the hardware.
   */
  models: SceneModel[];
  /** The drilled holes of the graph with the hardware that sits in them («Рентген», FINDINGS 970); none without operations. */
  holes?: SceneHole[];
}

/** One model of hardware in the scene: the prism of its visual and the mechanism it belongs to. */
export interface SceneHardware extends HardwareVisual {
  mechanismId: string;
  /** Axis-aligned box in product axes. */
  boxMm: { min: Vec3; max: Vec3 };
  /** Shape and finish: equal keys share one geometry. */
  shapeKey: string;
  /** Shape, place, finish and host: the mesh is rebuilt only when this changes. */
  key: string;
}

/** One model of the catalogue in the scene: the file, its place and the mechanism whose visuals it replaces. */
export interface SceneModel extends HardwareModel {
  mechanismId: string;
  /** The file and how it is put into the box (axes, origin, stretch): equal keys share one geometry. */
  shapeKey: string;
  /** Shape, place, finish and host: the mesh is rebuilt only when this changes. */
  key: string;
}

/**
 * A drilled hole of the graph for the general 3D (FINDINGS 970–971): from its entry point along its inward normal,
 * product axes, millimetres. A through hole goes through its part along its axis. `hardware` is what sits in the
 * hole, drawn as a plain figure filling it: metal (a screw, an eccentric, a stem, a hinge cup, a shelf pin) or wood
 * (a dowel).
 */
export interface SceneHole {
  id: string;
  partId: string;
  entryMm: Vec3;
  /** Unit vector into the part. */
  axis: Vec3;
  diameterMm: number;
  depthMm: number;
  through: boolean;
  /** `THROUGH_HOLE`, `PILOT_BLIND_HOLE`, `CAM`, `CUP`, `DOWEL_FACE`… of the graph. */
  role: string;
  hardware: 'METAL' | 'WOOD';
}

const add = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Corners of a part in product axes: the prism of the contour (or the rectangle) along n. */
export function partCorners(p: Pick<ScenePart, 'originMm' | 'uAxis' | 'vAxis' | 'nAxis' | 'sizeMm' | 'contourMm'>): Vec3[] {
  const [L, W, T] = p.sizeMm,
    outline = p.contourMm ?? [
      [0, 0],
      [L, 0],
      [L, W],
      [0, W],
    ],
    out: Vec3[] = [];
  for (const [s, t] of outline)
    for (const r of [0, T]) out.push(add(add(add(p.originMm, p.uAxis, s), p.vAxis, t), p.nAxis, r));
  return out;
}

function boxOf(corners: Vec3[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const c of corners)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], c[i]);
      max[i] = Math.max(max[i], c[i]);
    }
  return { min, max };
}

export function scenePart(p: Part): ScenePart {
  // A bought ready-made front (PURCHASED_FINISHED, MOD-DEC-573) is a board in the decor it is ordered in, its sample of
  // the colour (FINDINGS 266, 1345, 1351), not the metal of purchased hardware (R2-027, FINDINGS 1792).
  const surface: SceneSurface =
      p.supply === 'PURCHASED' && p.material.family !== 'PURCHASED_FINISHED' ? 'HARDWARE' : p.structuralRole === 'FACADE' ? 'FACADE' : 'CORPUS',
    banded = Object.fromEntries((['A', 'B', 'C', 'D'] as const).map((s) => [s, p.edges[s].intent !== 'NONE'])) as Record<EdgeSlot, boolean>,
    accent = p.material.edgeDecorId ? (['A', 'B', 'C', 'D'] as const).filter((s) => banded[s] && p.edges[s].exposure === 'VISIBLE') : [],
    edgeDecor = p.material.edgeDecorId && accent.length ? { edgeDecor: { decorId: p.material.edgeDecorId, slots: accent } } : {},
    glass = p.material.family === 'GLASS' ? { glass: true as const } : {};
  // A part with bevelled ends (MOD-DEC-440) is drawn as the prism of its section along its width: the axes u, n, −v
  // (the same handedness), the contour — the section; the ends C and D keep their bands.
  if (p.bevels?.length) {
    const [L, W, T] = [p.finishedWithEdge.lengthMm, p.finishedWithEdge.widthMm, p.finishedWithEdge.panelThicknessMm],
      { originMm: o, uAxis: u, vAxis: v, nAxis: n } = p.placement;
    return withKeys({
      id: p.id,
      name: p.name,
      role: p.role,
      inputRef: p.inputRef,
      assemblyId: p.assemblyId,
      surface,
      decorId: p.material.decorId,
      ...glass,
      sizeMm: [L, T, W],
      originMm: add(o, v, W),
      uAxis: [...u] as Vec3,
      vAxis: [...n] as Vec3,
      nAxis: v.map((x) => -x) as Vec3,
      contourMm: bevelSection(p).map(([a, c]) => [a!, c!] as [number, number]),
      banded: { A: false, B: false, C: banded.C, D: banded.D },
      ...(p.material.edgeDecorId && accent.some((s) => s === 'C' || s === 'D') ? { edgeDecor: { decorId: p.material.edgeDecorId, slots: accent.filter((s) => s === 'C' || s === 'D') } } : {}),
    });
  }
  return withKeys({
    id: p.id,
    name: p.name,
    role: p.role,
    inputRef: p.inputRef,
    assemblyId: p.assemblyId,
    surface,
    decorId: p.material.decorId,
    ...glass,
    sizeMm: [p.finishedWithEdge.lengthMm, p.finishedWithEdge.widthMm, p.finishedWithEdge.panelThicknessMm],
    originMm: [...p.placement.originMm] as Vec3,
    uAxis: [...p.placement.uAxis] as Vec3,
    vAxis: [...p.placement.vAxis] as Vec3,
    nAxis: [...p.placement.nAxis] as Vec3,
    contourMm: p.contourMm ? p.contourMm.map(([s, t]) => [s, t] as [number, number]) : null,
    banded,
    ...edgeDecor,
  });
}

/** The box and the keys of a scene part. */
function withKeys(part: Omit<ScenePart, 'boxMm' | 'shapeKey' | 'key'>): ScenePart {
  const shapeKey = JSON.stringify([part.surface, part.sizeMm, part.uAxis, part.vAxis, part.nAxis, part.contourMm, part.banded, ...(part.edgeDecor ? [part.edgeDecor.slots] : [])]);
  return { ...part, boxMm: boxOf(partCorners(part)), shapeKey, key: JSON.stringify([shapeKey, part.originMm, part.decorId, ...(part.edgeDecor ? [part.edgeDecor.decorId] : [])]) };
}

/** The models of the hardware of a graph, in the order of its mechanisms (MOD-DEC-432). */
export function sceneHardware(g: Partial<Pick<Graph, 'mechanisms'>>): SceneHardware[] {
  return (g.mechanisms ?? []).flatMap((m) =>
    (m.visuals ?? []).map((v) => {
      const shapeKey = JSON.stringify(['HARDWARE', v.sizeMm, v.contourMm, v.finish]);
      return { ...v, mechanismId: m.id, boxMm: boxOf(partCorners(v)), shapeKey, key: JSON.stringify([shapeKey, v.originMm, v.uAxis, v.vAxis, v.nAxis, v.hostPartId]) };
    }),
  );
}

const FILE_AXIS = { X: 0, Y: 1, Z: 2 } as const;

/** The coordinate of a file vector along a signed axis of the file (`-Z` — minus its Z; no −0). */
const along = (a: HardwareModel['fileAxes']['u'], p: Vec3): number => (a[0] === '-' ? -1 : 1) * p[FILE_AXIS[a[1] as 'X' | 'Y' | 'Z']] + 0;

/**
 * Where a point of the file of a model goes in its box (FINDINGS 1085): u, v, n from the origin of the box, mm. The
 * origin of the file goes to the origin of the box, the axes of the file along u, v, n; beyond the plane `stretchAtMm`
 * the point moves along u by the difference between the width of the place and the width drawn in the file.
 */
export function modelLocal(m: Pick<HardwareModel, 'fileOriginMm' | 'fileAxes' | 'stretchAtMm' | 'drawnWidthMm' | 'sizeMm'>, p: Vec3): Vec3 {
  const d: Vec3 = [p[0] - m.fileOriginMm[0], p[1] - m.fileOriginMm[1], p[2] - m.fileOriginMm[2]],
    u = along(m.fileAxes.u, d);
  return [u + (m.stretchAtMm !== null && m.drawnWidthMm !== null && u > m.stretchAtMm ? m.sizeMm[0] - m.drawnWidthMm : 0), along(m.fileAxes.v, d), along(m.fileAxes.n, d)];
}

/** A direction of the file (a normal) in the axes u, v, n of the box: the stretch moves points, not directions. */
export function modelDirection(m: Pick<HardwareModel, 'fileAxes'>, d: Vec3): Vec3 {
  return [along(m.fileAxes.u, d), along(m.fileAxes.v, d), along(m.fileAxes.n, d)];
}

/** True when the axes of the file go to u, v, n by a mirror: the triangles turn their faces in, the view reverses them. */
export function modelMirrored(m: Pick<HardwareModel, 'fileAxes'>): boolean {
  const [a, b, c] = (['u', 'v', 'n'] as const).map((k) => modelDirection(m, k === 'u' ? [1, 0, 0] : k === 'v' ? [0, 1, 0] : [0, 0, 1]));
  return a![0] * (b![1] * c![2] - b![2] * c![1]) - a![1] * (b![0] * c![2] - b![2] * c![0]) + a![2] * (b![0] * c![1] - b![1] * c![0]) < 0;
}

/** A point of the file of a model in product axes: its place in the box, by the axes of the box. */
export function modelPoint(m: HardwareModel, p: Vec3): Vec3 {
  const [u, v, n] = modelLocal(m, p);
  return add(add(add(m.originMm, m.uAxis, u), m.vAxis, v), m.nAxis, n);
}

/** The models of the catalogue of a graph, in the order of its mechanisms (MOD-DEC-536). */
export function sceneModels(g: Partial<Pick<Graph, 'mechanisms'>>): SceneModel[] {
  return (g.mechanisms ?? []).flatMap((m) => {
    if (!m.model) return [];
    const x = m.model,
      shapeKey = JSON.stringify([x.file, x.sha256, x.fileOriginMm, x.fileAxes, x.stretchAtMm, x.stretchAtMm === null || x.drawnWidthMm === null ? 0 : x.sizeMm[0] - x.drawnWidthMm]);
    return [{ ...x, mechanismId: m.id, shapeKey, key: JSON.stringify([shapeKey, x.originMm, x.uAxis, x.vAxis, x.nAxis, x.hostPartId, x.finish]) }];
  });
}

/** The scene of a graph: one entry per part, in the order of the graph, the doors and drawers that open, the hardware and the holes. */
export function sceneOf(g: Pick<Graph, 'parts'> & Partial<Pick<Graph, 'mechanisms' | 'operations'>>): Scene3d {
  const parts = g.parts.map(scenePart),
    boundsMm = parts.length ? boxOf(parts.flatMap((p) => [p.boxMm.min, p.boxMm.max])) : { min: [0, 0, 0] as Vec3, max: [0, 0, 0] as Vec3 };
  return {
    boundsMm,
    parts,
    manufacturedParts: g.parts.filter((p) => p.supply !== 'PURCHASED').length,
    motions: g.mechanisms ? sceneMotions({ parts: g.parts, mechanisms: g.mechanisms }) : [],
    hardware: sceneHardware(g),
    models: sceneModels(g),
    ...(g.operations ? { holes: sceneHoles({ parts: g.parts, operations: g.operations }) } : {}),
  };
}

/** Wooden dowels among the machining roles of the graph; every other drilled hole holds metal hardware. */
const WOOD_ROLE = /DOWEL|WOOD/;

/**
 * The drilled holes of a graph for the general 3D, in the order of the operations: the layer DRILL only (a marking is
 * not drilled, MOD-DEC-276; «3D детали» does not cut it either, FINDINGS 472). The depth of a through hole is the
 * size of its part along its axis, as «3D детали» cuts it.
 */
export function sceneHoles(g: Pick<Graph, 'parts' | 'operations'>): SceneHole[] {
  const parts = new Map(g.parts.map((p) => [p.id, p])),
    out: SceneHole[] = [];
  for (const o of g.operations) {
    if (o.op !== 'HOLE' || o.layer !== 'DRILL' || !(o.diameterMm > 0)) continue;
    const part = parts.get(o.partId);
    if (!part) continue;
    const { uAxis: u, vAxis: v, nAxis: n } = part.placement,
      f = part.finishedWithEdge,
      length = Math.hypot(...o.inwardNormal),
      axis = o.inwardNormal.map((c) => c / length) as Vec3,
      across = Math.abs(dot(axis, u)) * f.lengthMm + Math.abs(dot(axis, v)) * f.widthMm + Math.abs(dot(axis, n)) * f.panelThicknessMm,
      depthMm = o.through || o.depthMm === null ? across : o.depthMm;
    if (!(length > 0) || !(depthMm > 0)) continue;
    out.push({ id: o.id, partId: o.partId, entryMm: [...o.entryMm] as Vec3, axis, diameterMm: o.diameterMm, depthMm, through: o.through, role: o.machiningRole, hardware: WOOD_ROLE.test(o.machiningRole) ? 'WOOD' : 'METAL' });
  }
  return out;
}

/** What an edit changed, by stable part id: the view rebuilds only `added` and `changed`, removes `removed`. */
export function sceneDiff(before: Scene3d | null, after: Scene3d): { added: string[]; removed: string[]; changed: string[]; kept: string[] } {
  const old = new Map((before?.parts ?? []).map((p) => [p.id, p.key])),
    out = { added: [] as string[], removed: [] as string[], changed: [] as string[], kept: [] as string[] };
  for (const p of after.parts) {
    const k = old.get(p.id);
    if (k === undefined) out.added.push(p.id);
    else if (k !== p.key) out.changed.push(p.id);
    else out.kept.push(p.id);
  }
  const now = new Set(after.parts.map((p) => p.id));
  for (const id of old.keys()) if (!now.has(id)) out.removed.push(id);
  return out;
}

// ---------------------------------------------------------------- technical 3D of one part (task V3)

/**
 * A cut of the technical 3D of a part (`cuts` of r1 `v17PartData`): a bore — a cylinder of `radius` and `depth` along
 * `axis`; a slot — a box of `size`. Millimetres, in the axes of the part (x along u, y along v, z along n), centred
 * on its envelope, as the view builds the part.
 */
export interface TechnicalCut {
  id: string;
  kind: 'bore' | 'slot';
  center: Vec3;
  radius?: number;
  depth?: number;
  axis?: Vec3;
  size?: Vec3;
}

export interface TechnicalPart {
  id: string;
  name: string;
  /** Finished size with edge banding E along u, v, n. */
  sizeMm: Vec3;
  contourMm: [number, number][] | null;
  cuts: TechnicalCut[];
  /** Operations of the part in the graph: holes drilled (DRILL), grooves and notches; marking holes are not cut. */
  counts: { holes: number; marking: number; grooves: number; notches: number };
}

// r1 cuts a little past the surface so that the cut faces never coincide with the faces of the part (visual only).
const OVERCUT_MM = 0.01;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The technical 3D of a part from the graph: its size and the holes, grooves and notches of the graph as cuts. The
 * holes go from their entry point along their inward normal (product axes), so a face hole and an edge hole are
 * the same thing here; a through hole goes through the part along its axis.
 */
export function technicalPart(g: Pick<Graph, 'parts' | 'operations'>, partId: string): TechnicalPart | null {
  const part = g.parts.find((p) => p.id === partId);
  if (!part) return null;
  const { placement: pl } = part,
    size: Vec3 = [part.finishedWithEdge.lengthMm, part.finishedWithEdge.widthMm, part.finishedWithEdge.panelThicknessMm],
    local = (a: Vec3): Vec3 => {
      const d: Vec3 = [a[0] - pl.originMm[0], a[1] - pl.originMm[1], a[2] - pl.originMm[2]];
      return [dot(d, pl.uAxis) - size[0] / 2, dot(d, pl.vAxis) - size[1] / 2, dot(d, pl.nAxis) - size[2] / 2];
    },
    direction = (a: Vec3): Vec3 => [dot(a, pl.uAxis), dot(a, pl.vAxis), dot(a, pl.nAxis)],
    own = g.operations.filter((o) => o.partId === partId),
    holes = own.filter((o): o is Hole => o.op === 'HOLE'),
    grooves = own.filter((o): o is Groove => o.op === 'GROOVE'),
    notches = own.filter((o): o is Notch => o.op === 'NOTCH'),
    cuts: TechnicalCut[] = [];
  for (const h of holes) {
    if (h.layer !== 'DRILL' || !(h.diameterMm > 0)) continue;
    const axis = direction(h.inwardNormal),
      across = Math.abs(axis[0]) * size[0] + Math.abs(axis[1]) * size[1] + Math.abs(axis[2]) * size[2],
      depth = h.through || h.depthMm === null ? across + 2 * OVERCUT_MM : h.depthMm;
    if (!(depth > 0)) continue;
    const entry = local(h.entryMm),
      k = depth / 2 - OVERCUT_MM;
    cuts.push({ id: h.id, kind: 'bore', radius: h.diameterMm / 2, depth: depth + 2 * OVERCUT_MM, axis, center: [entry[0] + axis[0] * k, entry[1] + axis[1] * k, entry[2] + axis[2] * k] });
  }
  for (const q of grooves) {
    // A face groove (the only kind the graph has now): along u or v, from start to end, centred on the offset.
    if (!q.face || !(q.grooveWidthMm > 0 && q.grooveDepthMm > 0)) continue;
    const length = Math.abs(q.endMm - q.startMm),
      middle = (q.startMm + q.endMm) / 2,
      [u, v] = q.along === 'LENGTH' ? [middle, q.offsetMm] : [q.offsetMm, middle],
      n = q.face === 'N_POS' ? size[2] - q.grooveDepthMm / 2 + OVERCUT_MM : q.grooveDepthMm / 2 - OVERCUT_MM;
    cuts.push({
      id: q.id,
      kind: 'slot',
      size: q.along === 'LENGTH' ? [length, q.grooveWidthMm, q.grooveDepthMm + 2 * OVERCUT_MM] : [q.grooveWidthMm, length, q.grooveDepthMm + 2 * OVERCUT_MM],
      center: [u - size[0] / 2, v - size[1] / 2, n - size[2] / 2],
    });
  }
  for (const c of notches) {
    // A notch reaching the boundary of the part goes a little past it, as the cuts above.
    const ranges = [c.uRangeMm, c.vRangeMm, c.nRangeMm].map(([lo, hi], i): [number, number] => [lo <= OVERCUT_MM ? lo - 2 * OVERCUT_MM : lo, hi >= size[i] - OVERCUT_MM ? hi + 2 * OVERCUT_MM : hi]);
    cuts.push({ id: c.id, kind: 'slot', size: ranges.map(([lo, hi]) => hi - lo) as Vec3, center: ranges.map(([lo, hi], i) => (lo + hi) / 2 - size[i] / 2) as Vec3 });
  }
  return {
    id: part.id,
    name: part.name,
    sizeMm: size,
    contourMm: part.contourMm ? part.contourMm.map(([s, t]) => [s, t] as [number, number]) : null,
    cuts,
    counts: { holes: holes.filter((h) => h.layer === 'DRILL').length, marking: holes.filter((h) => h.layer !== 'DRILL').length, grooves: grooves.length, notches: notches.length },
  };
}
