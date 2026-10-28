// Triangle meshes of the hardware of a BAZIS model (.fr3d kit, .f3d element): the 3D of a purchased item for the
// catalogue (MOD-DEC-536, docs/findings/1081-model3d.md).
//
// A hardware object (Type 3001) names its definition by FastID; the definition FurnList/F<FastID> keeps the surface
// in TriData, and its overall box in MinX…MaxZ. The layout of TriData, read from the kits of the owner (BELLE.zip,
// pantograf.zip; every definition ends exactly at the end of the blob and its vertices span MinX…MaxZ):
//   u32 groups; per group:
//     u32 n, n UTF-16LE code units — the material ("Пластик графит");
//     16 f64 — a 4 × 4 matrix of the group (only the identity is met; any other is refused, it is not understood);
//     u8 — a flag (0 met);
//     u32 triangles; per triangle 112 bytes: 9 f32 — the three vertices, 9 f32 — their normals,
//     3 f32 — the normal of the face, 6 f32 — texture coordinates, u32 — not read.
// The vertices are in the axes of the definition; the pose of the object (its Trans, composed with its blocks) puts
// them into the model. BAZIS axes (X right, Y up, Z to the front, millimetres) — the axes of glTF as well.
// Nothing is guessed: a blob that does not end where its counts say is a BazisError.
import { BazisError } from './errors.js';
import { compose, poseOf, rotate } from './placement.js';
import type { Pose, Vec3 } from './placement.js';
import type { Bz85File, Node, PropertyNode, RecordNode, Value } from './bz85.js';

export const OBJ_HARDWARE_MESH = 3001;
const TRIANGLE_BYTES = 112;

/** A group of triangles of one material: positions and normals, nine numbers per triangle each. */
export interface MeshGroup {
  material: string;
  positions: Float32Array;
  normals: Float32Array;
}

/** The decoded TriData of one definition. */
export function decodeTriData(data: Uint8Array): MeshGroup[] {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 0;
  const need = (n: number, what: string) => {
    if (o + n > data.length) throw new BazisError(`TriData: ${what} beyond the end (${data.length} bytes)`, o, 'TriData');
  };
  need(4, 'group count');
  const groups = dv.getUint32(o, true);
  o += 4;
  const out: MeshGroup[] = [];
  for (let g = 0; g < groups; g++) {
    need(4, 'material length');
    const len = dv.getUint32(o, true);
    o += 4;
    need(2 * len, 'material');
    let material = '';
    for (let i = 0; i < len; i++) material += String.fromCharCode(dv.getUint16(o + 2 * i, true));
    o += 2 * len;
    need(128 + 1 + 4, 'matrix');
    for (let i = 0; i < 16; i++)
      if (dv.getFloat64(o + 8 * i, true) !== (i % 5 === 0 ? 1 : 0)) throw new BazisError('TriData: a group matrix other than the identity is not understood', o, 'TriData');
    o += 128 + 1;
    const count = dv.getUint32(o, true);
    o += 4;
    need(count * TRIANGLE_BYTES, 'triangles');
    const positions = new Float32Array(9 * count),
      normals = new Float32Array(9 * count);
    for (let t = 0; t < count; t++, o += TRIANGLE_BYTES)
      for (let i = 0; i < 9; i++) {
        positions[9 * t + i] = dv.getFloat32(o + 4 * i, true);
        normals[9 * t + i] = dv.getFloat32(o + 36 + 4 * i, true);
      }
    out.push({ material, positions, normals });
  }
  if (o !== data.length) throw new BazisError(`TriData: ${data.length - o} bytes after the last group`, o, 'TriData');
  return out;
}

/** A mesh of a hardware object of the model, in the axes of the model. */
export interface PlacedMesh {
  /** Name of the object ("Механизм"), the names of its blocks from the outside in. */
  name: string | null;
  blocks: (string | null)[];
  fastId: number;
  groups: MeshGroup[];
}

/**
 * The meshes of every visible hardware object of a model (Type 3001 with a TriData definition), placed by the poses
 * of the object and its blocks. An object or block with `Vis = false` (an overall frame of a kit, a hidden
 * alternative) is left out with all it contains. A definition without TriData has no surface and gives nothing.
 */
export function readMeshes(file: Bz85File): PlacedMesh[] {
  const root = file.model.root,
    definitions = new Map<number, MeshGroup[]>();
  for (const list of records(root, 'FurnList'))
    for (const def of list.children)
      if (def.type === 'record') {
        const p = props(def),
          id = finite(p, 'FastID'),
          tri = value(p, 'TriData');
        if (id !== null && tri && typeof tri === 'object' && tri.kind === 'binary') definitions.set(id, decodeTriData(tri.data));
      }
  const out: PlacedMesh[] = [];
  const visit = (obj: RecordNode, parent: Pose, blocks: (string | null)[]): void => {
    const p = props(obj);
    if (value(p, 'Vis') === false) return;
    const pose = compose(parent, poseOf(obj)),
      name = text(p, 'Name'),
      fastId = finite(p, 'FastID'),
      groups = finite(p, 'Type') === OBJ_HARDWARE_MESH && fastId !== null ? definitions.get(fastId) : undefined;
    if (groups && fastId !== null) out.push({ name, blocks, fastId, groups: groups.map((g) => placeGroup(g, pose)) });
    for (const objs of records(obj, 'Objs')) for (const child of records(objs, 'Obj')) visit(child, pose, [...blocks, name]);
  };
  const identity: Pose = { t: [0, 0, 0], q: [0, 0, 0, 1] };
  for (const model of records(root, 'Model')) for (const c of model.children as readonly Node[]) if (c.type === 'record' && c.name === 'Obj') visit(c, identity, []);
  return out;
}

function placeGroup(g: MeshGroup, pose: Pose): MeshGroup {
  const positions = new Float32Array(g.positions.length),
    normals = new Float32Array(g.normals.length);
  for (let i = 0; i < g.positions.length; i += 3) {
    const p = rotate(pose.q, [g.positions[i]!, g.positions[i + 1]!, g.positions[i + 2]!]),
      n = rotate(pose.q, [g.normals[i]!, g.normals[i + 1]!, g.normals[i + 2]!]);
    positions.set([p[0] + pose.t[0], p[1] + pose.t[1], p[2] + pose.t[2]], i);
    normals.set(n, i);
  }
  return { material: g.material, positions, normals };
}

/** The overall box of meshes: min and max of every vertex; null — no vertex. */
export function meshBounds(meshes: readonly { groups: readonly MeshGroup[] }[]): { min: Vec3; max: Vec3 } | null {
  const min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes)
    for (const g of m.groups)
      for (let i = 0; i < g.positions.length; i++) {
        const k = i % 3;
        min[k] = Math.min(min[k]!, g.positions[i]!);
        max[k] = Math.max(max[k]!, g.positions[i]!);
      }
  return min[0] === Infinity ? null : { min, max };
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
