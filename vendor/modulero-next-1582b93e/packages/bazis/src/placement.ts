// Hole definitions and their placement into the axes of the product.
//
// A hardware file keeps hole definitions in FurnList (F<FastID>/Holes/Hole: X, Y, Z, DirX/DirY/DirZ,
// Radius, Depth, DrillMode) and puts instances of the hardware into the model as Obj records
// (FastID links the instance to the definition; Trans holds a shift X, Y, Z and a quaternion
// Rx, Ry, Rz, Rw; Obj nests, and a child's transform is composed with its parent's).
// The arithmetic follows hardware_check/tools/place_holes.py statement by statement, so that both give
// the same numbers; units are millimetres and nothing is rounded, normalized or defaulted here
// beyond what that tool does (a missing Trans is the identity, a missing X/Y/Z or Dir* is 0).
import { BazisError } from './errors.js';
import type { Node, PropertyNode, RecordNode, Value } from './bz85.js';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w
export interface Pose { t: Vec3; q: Quat }

/** One Hole of a FurnList definition, exactly as stored (null = the field is absent). */
export interface RawHoleFields {
  X: Value | null; Y: Value | null; Z: Value | null;
  DirX: Value | null; DirY: Value | null; DirZ: Value | null;
  Radius: Value | null; Depth: Value | null; DrillMode: Value | null;
  /** Offset of the Hole record in the decoded model stream (for refusals). */
  offset: number;
}

export interface HoleDefinition {
  name: string | null;
  holes: RawHoleFields[];
}

/** A hole in product axes (or definition-local axes for a single part), before normalization. */
export interface RawHole {
  object: string | null;
  chain: (string | null)[];
  fastId: number;
  position: Vec3;
  direction: Vec3;
  /** 2·Radius; null when Radius is absent. */
  diameter: number | null;
  depth: number | null;
  drillMode: number | null;
  offset: number;
}

const IDENTITY: Pose = { t: [0, 0, 0], q: [0, 0, 0, 1] };

function records(node: RecordNode, name: string): RecordNode[] {
  return node.children.filter((c): c is RecordNode => c.type === 'record' && c.name === name);
}

/** Properties of a record by name; the last of several equal names wins (as a dict does). */
function props(node: RecordNode): Map<string, PropertyNode> {
  const out = new Map<string, PropertyNode>();
  for (const c of node.children) if (c.type === 'property') out.set(c.name, c);
  return out;
}

function valueOf(p: Map<string, PropertyNode>, name: string): Value | null {
  const prop = p.get(name);
  return prop === undefined ? null : prop.value;
}

function fail(what: string, offset: number): never {
  throw new BazisError(what, offset, 'decoded_model_payload');
}

/** A present numeric field; a missing one gives `fallback`; text, binary and NaN/Infinity are refused. */
function number(p: Map<string, PropertyNode>, name: string, fallback: number, owner: string): number {
  const prop = p.get(name);
  if (prop === undefined) return fallback;
  const v = prop.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${owner}: field ${name} is not a finite number`, prop.offset);
  return v;
}

// ---------------------------------------------------------------- quaternions (place_holes.py)

export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

export function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function compose(parent: Pose, child: Pose): Pose {
  const t = rotate(parent.q, child.t);
  return { t: [parent.t[0] + t[0], parent.t[1] + t[1], parent.t[2] + t[2]], q: multiply(parent.q, child.q) };
}

/** Local pose of an Obj: its first Trans record, or the identity when there is none. */
export function poseOf(obj: RecordNode): Pose {
  const trans = records(obj, 'Trans')[0];
  if (!trans) return IDENTITY;
  const p = props(trans);
  return {
    t: [number(p, 'X', 0, 'Trans'), number(p, 'Y', 0, 'Trans'), number(p, 'Z', 0, 'Trans')],
    q: [number(p, 'Rx', 0, 'Trans'), number(p, 'Ry', 0, 'Trans'), number(p, 'Rz', 0, 'Trans'), number(p, 'Rw', 1, 'Trans')],
  };
}

// ---------------------------------------------------------------- definitions

function textOrNull(v: Value | null): string | null {
  return typeof v === 'string' ? v : null;
}

function walkRecords(node: RecordNode, visit: (r: RecordNode) => void): void {
  visit(node);
  for (const c of node.children) if (c.type === 'record') walkRecords(c, visit);
}

/**
 * Hole definitions of every FurnList in the model, by FastID. A FurnList child F<digits> is the
 * definition with that FastID; a repeated FastID keeps its first position and its last content.
 */
export function holeDefinitions(model: RecordNode): Map<number, HoleDefinition> {
  const defs = new Map<number, HoleDefinition>();
  walkRecords(model, (node) => {
    if (node.name !== 'FurnList') return;
    for (const rec of node.children) {
      if (rec.type !== 'record' || !/^F[0-9]+$/.test(rec.name)) continue;
      const holes: RawHoleFields[] = [];
      for (const group of records(rec, 'Holes')) {
        for (const hole of records(group, 'Hole')) {
          const p = props(hole);
          holes.push({
            X: valueOf(p, 'X'), Y: valueOf(p, 'Y'), Z: valueOf(p, 'Z'),
            DirX: valueOf(p, 'DirX'), DirY: valueOf(p, 'DirY'), DirZ: valueOf(p, 'DirZ'),
            Radius: valueOf(p, 'Radius'), Depth: valueOf(p, 'Depth'), DrillMode: valueOf(p, 'DrillMode'),
            offset: hole.offset,
          });
        }
      }
      defs.set(Number(rec.name.slice(1)), { name: textOrNull(valueOf(props(rec), 'Name')), holes });
    }
  });
  return defs;
}

function coordinate(v: Value | null, name: string, offset: number): number {
  if (v === null) return 0;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`Hole: field ${name} is not a finite number`, offset);
  return v;
}

function holeVectors(h: RawHoleFields): { pos: Vec3; dir: Vec3 } {
  return {
    pos: [coordinate(h.X, 'X', h.offset), coordinate(h.Y, 'Y', h.offset), coordinate(h.Z, 'Z', h.offset)],
    dir: [coordinate(h.DirX, 'DirX', h.offset), coordinate(h.DirY, 'DirY', h.offset), coordinate(h.DirZ, 'DirZ', h.offset)],
  };
}

function sizes(h: RawHoleFields): { diameter: number | null; depth: number | null; drillMode: number | null } {
  const num = (v: Value | null): number | null => (typeof v === 'number' ? v : null);
  return { diameter: typeof h.Radius === 'number' ? 2 * h.Radius : null, depth: num(h.Depth), drillMode: num(h.DrillMode) };
}

/** Radius, Depth and DrillMode that are present but not numbers are refused, never turned into a default. */
function checkSizeFields(h: RawHoleFields): void {
  for (const name of ['Radius', 'Depth', 'DrillMode'] as const) {
    const v = h[name];
    if (v !== null && typeof v !== 'number') fail(`Hole: field ${name} is not a number`, h.offset);
  }
}

/** Definition holes as stored, in the local axes of each definition (a single part has no instances). */
export function partHoles(defs: ReadonlyMap<number, HoleDefinition>): RawHole[] {
  const out: RawHole[] = [];
  for (const [fastId, def] of defs) {
    for (const h of def.holes) {
      checkSizeFields(h);
      const { pos, dir } = holeVectors(h);
      out.push({ object: def.name, chain: [], fastId, position: pos, direction: dir, ...sizes(h), offset: h.offset });
    }
  }
  return out;
}

export interface PlacedResult {
  holes: RawHole[];
  /** FastIDs of definitions that no Obj instance refers to. */
  unplaced: number[];
}

/**
 * Holes of the kit in product axes: every Obj whose FastID has a definition places that definition's
 * holes with the Obj's composed pose; nested Obj compose with their parent. Order is document order.
 */
export function placedHoles(model: RecordNode, defs: ReadonlyMap<number, HoleDefinition>): PlacedResult {
  const out: RawHole[] = [];
  const instanced = new Set<number>();

  const visit = (node: RecordNode, pose: Pose, chain: (string | null)[]): void => {
    for (const rec of node.children as readonly Node[]) {
      if (rec.type !== 'record') continue;
      if (rec.name === 'Obj') {
        const p = props(rec);
        const here = compose(pose, poseOf(rec));
        const name = textOrNull(valueOf(p, 'Name'));
        const fid = valueOf(p, 'FastID');
        const def = typeof fid === 'number' ? defs.get(fid) : undefined;
        if (def !== undefined && typeof fid === 'number') {
          instanced.add(fid);
          for (const h of def.holes) {
            checkSizeFields(h);
            const { pos, dir } = holeVectors(h);
            const place = rotate(here.q, pos);
            out.push({
              object: name, chain: [...chain, name], fastId: fid,
              position: [place[0] + here.t[0], place[1] + here.t[1], place[2] + here.t[2]],
              direction: rotate(here.q, dir), ...sizes(h), offset: h.offset,
            });
          }
        }
        visit(rec, here, [...chain, name]);
      } else if (rec.name !== 'FurnList') {
        visit(rec, pose, chain);
      }
    }
  };
  visit(model, IDENTITY, []);
  return { holes: out, unplaced: [...defs.keys()].filter((fid) => !instanced.has(fid)) };
}
