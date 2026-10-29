// Parts of a BAZIS model (.b3d, also a .fr3d kit): panels, hardware, blocks and overall frames.
//
// The model keeps its objects in Model as Obj records; a block (Type 1005) and a boolean body (1004)
// nest their objects in Obj/Objs, and a child's Trans is composed with its parent's. Seen in the
// samples (BAZIS model versions 11.14 and 23.15; docs/findings/780-bazis-import.md):
//   4002  panel: Name, ArtPos, Mat, Thick, TexDir, TexAngle, Contour, Butts/Butt (edge banding by
//         contour element), Cuts/Cut (pockets and grooves: Type, Elem, Thickness, Contour, Trajectory, Front);
//   3001  hardware: Name, ArtPos, FastID (its definition with holes is FurnList/F<FastID>);
//         a name or material may carry the article after a CR: "Полкодержатель …\r9000882A";
//   1005  block (an assembly of the objects in Objs), 1004 boolean body, 1001 overall frame
//         (Width, Height, Depth), 2004 profile (an extrusion of Contour by Thickness).
// A panel is its contour in local X/Y extruded by Thick along local +Z; its pose maps local axes to the
// axes of the model. Coordinates are those of BAZIS (no axis change here); units are millimetres by the
// convention of the project (the format records none, docs/findings/019-bazis-reader.md, item 27).
// Undo and FurnList keep copies and definitions, not parts of the model, and are not walked.
// Nothing is guessed: a field that is absent is null, a contour this reader cannot decode keeps the
// panel with contour null and its reason, so one strange panel does not hide the rest of the model.
import { BazisError } from './errors.js';
import { decodeBz85 } from './bz85.js';
import type { Bz85File, Node, PropertyNode, RecordNode, Value } from './bz85.js';
import { holeDefinitions, poseOf, compose, rotate } from './placement.js';
import type { Pose, Vec3 } from './placement.js';
import { SEGMENT_ARC, SEGMENT_CIRCLE, SEGMENT_CIRCLE_DISPLAY, SEGMENT_LINE } from './axes.js';

export const OBJ_PANEL = 4002;
export const OBJ_HARDWARE = 3001;
export const OBJ_BLOCK = 1005;
export const OBJ_BOOLEAN = 1004;
export const OBJ_FRAME = 1001;
export const OBJ_PROFILE = 2004;

/** Element tags of a Contour blob: u32 count, then per element a tag byte and its numbers (f64 LE); one list with the writer (axes.ts). */
export const CONTOUR_LINE = SEGMENT_LINE;
export const CONTOUR_CIRCLE = SEGMENT_CIRCLE;
export const CONTOUR_ARC = SEGMENT_ARC;
export const CONTOUR_CIRCLE_DISPLAY = SEGMENT_CIRCLE_DISPLAY;
const MAX_CONTOUR_ELEMENTS = 100_000;

export type Vec2 = [number, number];
export type ContourElement =
  | { kind: 'line'; start: Vec2; end: Vec2 }
  | { kind: 'arc'; centre: Vec2; start: Vec2; end: Vec2; ccw: boolean }
  | { kind: 'circle'; tag: number; centre: Vec2; radius: number };

export interface Bounds2 { min: Vec2; max: Vec2 }
export interface Box3 { min: Vec3; max: Vec3 }

export interface Contour {
  elements: ContourElement[];
  /** u32 words after the elements (none, or one per element); their meaning is unknown, kept as read. */
  trailer: number[];
  /** Bounds of the elements, arcs included at their extreme points; null for no elements. */
  bounds: Bounds2 | null;
  /** The contour is four axis-parallel lines that close a rectangle. */
  rectangle: boolean;
}

export interface BazisEdge {
  /** Index of the contour element the edge banding covers. */
  elem: number | null;
  material: string | null;
  thickness: number | null;
  width: number | null;
  sign: string | null;
  overhang: number | null;
  allowance: number | null;
  clip: boolean | null;
}

export interface BazisCut {
  name: string | null;
  sign: string | null;
  type: number | null;
  elem: number | null;
  /** Cut/Thickness as stored (negative into the face in the samples). */
  thickness: number | null;
  front: boolean | null;
  contour: Contour | null;
  trajectory: Contour | null;
  /** Why contour or trajectory is null though the field is present. */
  error: string | null;
}

interface Placed {
  /** ID of the Obj, or null. */
  id: number | null;
  name: string | null;
  /** Names of the enclosing blocks, outermost first. */
  blocks: (string | null)[];
  /** Pose in model axes (Trans of the object composed with its parents). */
  pose: Pose;
  /** Offset of the Obj record in the decoded model stream. */
  offset: number;
}

export interface BazisPanel extends Placed {
  /** ArtPos: the position number of the part in the model. */
  position: string | null;
  material: string | null;
  /** The part of Mat after CR, or null. */
  materialArticle: string | null;
  thickness: number | null;
  textureDir: number | null;
  textureAngle: number | null;
  contour: Contour | null;
  /** Why contour is null (absent field, unknown element, damaged data). */
  contourError: string | null;
  /** Axis-aligned box of the panel in model axes; null without contour or thickness. */
  box: Box3 | null;
  /** Model axis along the panel's thickness when the panel is axis-aligned, else null. */
  normalAxis: 'x' | 'y' | 'z' | null;
  edges: BazisEdge[];
  cuts: BazisCut[];
}

export interface BazisHardware extends Placed {
  /** The part of Name after CR, or null. */
  article: string | null;
  position: string | null;
  fastId: number | null;
  /** Holes of its FurnList definition; null when the model has no definition with that FastID. */
  definitionHoles: number | null;
}

export interface BazisFrame extends Placed {
  width: number | null;
  height: number | null;
  depth: number | null;
}

export interface BazisOther extends Placed {
  type: number | null;
}

export interface BazisModel {
  formatVersion: { major: number; minor: number } | null;
  /** Axes of all coordinates: those of the BAZIS model. */
  axes: 'bazis';
  units: 'mm';
  panels: BazisPanel[];
  hardware: BazisHardware[];
  /** Overall frames (Type 1001); the first one at the top level is the frame of the model. */
  frames: BazisFrame[];
  blocks: BazisOther[];
  /** Objects of other types (profiles, boolean bodies, unknown), listed so that nothing vanishes silently. */
  others: BazisOther[];
}

// ---------------------------------------------------------------- fields

function props(node: RecordNode): Map<string, PropertyNode> {
  const out = new Map<string, PropertyNode>();
  for (const c of node.children) if (c.type === 'property') out.set(c.name, c);
  return out;
}

function records(node: RecordNode, name: string): RecordNode[] {
  return node.children.filter((c): c is RecordNode => c.type === 'record' && c.name === name);
}

function value(p: Map<string, PropertyNode>, name: string): Value | null {
  return p.get(name)?.value ?? null;
}

function text(p: Map<string, PropertyNode>, name: string): string | null {
  const v = value(p, name);
  return typeof v === 'string' ? v : null;
}

function finite(p: Map<string, PropertyNode>, name: string): number | null {
  const v = value(p, name);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** The article written after a CR in a name ("name\rarticle"), or null. */
function articleOf(name: string | null): string | null {
  const i = name === null ? -1 : name.indexOf('\r');
  return i < 0 ? null : (name as string).slice(i + 1) || null;
}

function flag(p: Map<string, PropertyNode>, name: string): boolean | null {
  const v = value(p, name);
  return typeof v === 'boolean' ? v : null;
}

// ---------------------------------------------------------------- contour

class ContourError extends Error {}

/** Decodes a Contour (or Trajectory) blob. Unknown tags and damaged data throw ContourError. */
export function decodeContour(data: Uint8Array): Contour {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;
  const need = (n: number): void => {
    if (pos + n > data.length) throw new ContourError(`contour truncated at byte ${pos}`);
  };
  const f64 = (): number => {
    need(8);
    const v = view.getFloat64(pos, true);
    pos += 8;
    if (!Number.isFinite(v)) throw new ContourError(`contour number at byte ${pos - 8} is not finite`);
    return v;
  };
  const point = (): Vec2 => [f64(), f64()];
  need(4);
  const count = view.getUint32(0, true);
  pos = 4;
  if (count > MAX_CONTOUR_ELEMENTS) throw new ContourError(`contour has ${count} elements`);
  const elements: ContourElement[] = [];
  for (let i = 0; i < count; i++) {
    need(1);
    const tag = data[pos++];
    if (tag === CONTOUR_LINE) {
      elements.push({ kind: 'line', start: point(), end: point() });
    } else if (tag === CONTOUR_ARC) {
      const centre = point(), start = point(), end = point();
      need(1);
      const dir = data[pos++];
      if (dir > 1) throw new ContourError(`arc direction ${dir} at byte ${pos - 1}`);
      elements.push({ kind: 'arc', centre, start, end, ccw: dir === 1 });
    } else if (tag === CONTOUR_CIRCLE || tag === CONTOUR_CIRCLE_DISPLAY) {
      const centre = point(), radius = f64();
      if (!(radius > 0)) throw new ContourError(`circle radius ${radius}`);
      elements.push({ kind: 'circle', tag, centre, radius });
    } else {
      throw new ContourError(`unknown contour element tag 0x${tag.toString(16)} at byte ${pos - 1}`);
    }
  }
  const rest = data.length - pos;
  if (rest !== 0 && rest !== 4 * count) throw new ContourError(`${rest} bytes after ${count} contour elements`);
  const trailer: number[] = [];
  for (; pos < data.length; pos += 4) trailer.push(view.getUint32(pos, true));
  return { elements, trailer, bounds: contourBounds(elements), rectangle: isRectangle(elements) };
}

const TAU = 2 * Math.PI;

/** Angle swept from a to b going in the arc's direction, in (0, 2π]. */
function sweep(a: number, b: number, ccw: boolean): number {
  const s = ccw ? (b - a) % TAU : (a - b) % TAU;
  const positive = s < 0 ? s + TAU : s;
  return positive === 0 ? TAU : positive;
}

function contourBounds(elements: readonly ContourElement[]): Bounds2 | null {
  if (elements.length === 0) return null;
  const min: Vec2 = [Infinity, Infinity], max: Vec2 = [-Infinity, -Infinity];
  const add = (p: Vec2): void => {
    min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[1]);
    max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[1]);
  };
  for (const e of elements) {
    if (e.kind === 'line') { add(e.start); add(e.end); continue; }
    if (e.kind === 'circle') {
      add([e.centre[0] - e.radius, e.centre[1] - e.radius]);
      add([e.centre[0] + e.radius, e.centre[1] + e.radius]);
      continue;
    }
    add(e.start); add(e.end);
    const r = Math.hypot(e.start[0] - e.centre[0], e.start[1] - e.centre[1]);
    const a = Math.atan2(e.start[1] - e.centre[1], e.start[0] - e.centre[0]);
    const b = Math.atan2(e.end[1] - e.centre[1], e.end[0] - e.centre[0]);
    const total = sweep(a, b, e.ccw);
    for (let k = 0; k < 4; k++) {
      const extreme = (k * Math.PI) / 2;
      if (sweep(a, extreme, e.ccw) < total) add([e.centre[0] + r * Math.cos(extreme), e.centre[1] + r * Math.sin(extreme)]);
    }
  }
  return { min, max };
}

function isRectangle(elements: readonly ContourElement[]): boolean {
  if (elements.length !== 4 || elements.some((e) => e.kind !== 'line')) return false;
  const lines = elements as readonly Extract<ContourElement, { kind: 'line' }>[];
  const eps = 1e-6;
  const same = (p: Vec2, q: Vec2): boolean => Math.abs(p[0] - q[0]) <= eps && Math.abs(p[1] - q[1]) <= eps;
  for (let i = 0; i < 4; i++) {
    const l = lines[i];
    const axisParallel = Math.abs(l.start[0] - l.end[0]) <= eps || Math.abs(l.start[1] - l.end[1]) <= eps;
    if (!axisParallel || same(l.start, l.end) || !same(l.end, lines[(i + 1) % 4].start)) return false;
  }
  return true;
}

function contourField(p: Map<string, PropertyNode>, name: string): { contour: Contour | null; error: string | null } {
  const prop = p.get(name);
  if (prop === undefined) return { contour: null, error: `no ${name}` };
  const v = prop.value;
  if (typeof v !== 'object' || v.kind !== 'binary') return { contour: null, error: `${name} is not binary` };
  try {
    return { contour: decodeContour(v.data), error: null };
  } catch (e) {
    if (e instanceof ContourError) return { contour: null, error: `${name}: ${e.message}` };
    throw e;
  }
}

// ---------------------------------------------------------------- geometry

function apply(pose: Pose, p: Vec3): Vec3 {
  const r = rotate(pose.q, p);
  return [r[0] + pose.t[0], r[1] + pose.t[1], r[2] + pose.t[2]];
}

/** Box of the contour bounds extruded over z ∈ [0, thickness], in model axes. */
function panelBox(pose: Pose, b: Bounds2, thickness: number): Box3 {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [0, thickness]) {
    const w = apply(pose, [x, y, z]);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], w[i]); max[i] = Math.max(max[i], w[i]); }
  }
  return { min, max };
}

const AXIS_EPS = 1e-9;

function normalAxis(pose: Pose): 'x' | 'y' | 'z' | null {
  const n = rotate(pose.q, [0, 0, 1]);
  const i = n.findIndex((c) => Math.abs(Math.abs(c) - 1) <= AXIS_EPS);
  return i < 0 ? null : (['x', 'y', 'z'] as const)[i];
}

// ---------------------------------------------------------------- model

function edgeOf(b: RecordNode): BazisEdge {
  const p = props(b);
  return {
    elem: finite(p, 'Elem'), material: text(p, 'Mat'), thickness: finite(p, 'Thick'), width: finite(p, 'Width'),
    sign: text(p, 'Sign'), overhang: finite(p, 'Overhung'), allowance: finite(p, 'Allowance'), clip: flag(p, 'Clip'),
  };
}

function cutOf(c: RecordNode): BazisCut {
  const p = props(c);
  const contour = contourField(p, 'Contour');
  const trajectory = p.has('Trajectory') ? contourField(p, 'Trajectory') : { contour: null, error: null };
  return {
    name: text(p, 'Name'), sign: text(p, 'Sign'), type: finite(p, 'Type'), elem: finite(p, 'Elem'),
    thickness: finite(p, 'Thickness'), front: flag(p, 'Front'), contour: contour.contour, trajectory: trajectory.contour,
    error: [contour.error, trajectory.error].filter((e) => e !== null).join('; ') || null,
  };
}

/** Panels, hardware, frames and blocks of a decoded BZ85 model. */
export function readModel(file: Bz85File): BazisModel {
  const root = file.model.root;
  const top = props(root);
  const major = finite(top, 'VersionMajor'), minor = finite(top, 'VersionMinor');
  const definitions = holeDefinitions(root);
  const out: BazisModel = {
    formatVersion: major === null || minor === null ? null : { major, minor },
    axes: 'bazis', units: 'mm', panels: [], hardware: [], frames: [], blocks: [], others: [],
  };

  const visit = (obj: RecordNode, parent: Pose, blocks: (string | null)[]): void => {
    const p = props(obj);
    const type = finite(p, 'Type');
    const pose = compose(parent, poseOf(obj));
    const placed: Placed = { id: finite(p, 'ID'), name: text(p, 'Name'), blocks, pose, offset: obj.offset };
    if (type === OBJ_PANEL) {
      const { contour, error } = contourField(p, 'Contour');
      const thickness = finite(p, 'Thick');
      out.panels.push({
        ...placed, position: text(p, 'ArtPos'), material: text(p, 'Mat'), materialArticle: articleOf(text(p, 'Mat')), thickness,
        textureDir: finite(p, 'TexDir'), textureAngle: finite(p, 'TexAngle'), contour, contourError: error,
        box: contour?.bounds && thickness !== null ? panelBox(pose, contour.bounds, thickness) : null,
        normalAxis: normalAxis(pose),
        edges: records(obj, 'Butts').flatMap((b) => records(b, 'Butt')).map(edgeOf),
        cuts: records(obj, 'Cuts').flatMap((c) => records(c, 'Cut')).map(cutOf),
      });
    } else if (type === OBJ_HARDWARE) {
      const fastId = finite(p, 'FastID');
      const def = fastId === null ? undefined : definitions.get(fastId);
      out.hardware.push({ ...placed, article: articleOf(placed.name), position: text(p, 'ArtPos'), fastId, definitionHoles: def ? def.holes.length : null });
    } else if (type === OBJ_FRAME) {
      out.frames.push({ ...placed, width: finite(p, 'Width'), height: finite(p, 'Height'), depth: finite(p, 'Depth') });
    } else if (type === OBJ_BLOCK) {
      out.blocks.push({ ...placed, type });
    } else {
      out.others.push({ ...placed, type });
    }
    const inner = type === OBJ_BLOCK ? [...blocks, placed.name] : blocks;
    for (const objs of records(obj, 'Objs')) for (const child of records(objs, 'Obj')) visit(child, pose, inner);
  };

  const identity: Pose = { t: [0, 0, 0], q: [0, 0, 0, 1] };
  for (const model of records(root, 'Model')) {
    for (const c of model.children as readonly Node[]) if (c.type === 'record' && c.name === 'Obj') visit(c, identity, []);
  }
  return out;
}

/** bytes of a .b3d (or any BZ85 model) -> its parts. A damaged container is a BazisError. */
export function readPanels(bytes: Uint8Array): BazisModel {
  if (!(bytes instanceof Uint8Array)) throw new BazisError('readPanels expects a Uint8Array');
  return readModel(decodeBz85(bytes));
}
