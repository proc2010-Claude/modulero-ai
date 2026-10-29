// A binary glTF 2.0 (.glb) of meshes: the file format of the 3D models of the catalogue (MOD-DEC-536,
// docs/findings/1081-model3d.md). Pure function: meshes in, bytes out — the same meshes give the same bytes.
//
// One node per mesh (its name kept), one primitive per material group: indexed triangles (a vertex with the same
// position and normal is stored once; u16 indices, u32 above 65 535 vertices), POSITION and NORMAL as f32. The axes
// and the units are those of the meshes (BAZIS: X right, Y up, Z to the front, millimetres); the record of the
// catalogue says so (`units: "mm"`, `axes`). A material is named, its colour is a neutral grey: the
// client draws a model in the finish of its record (FINDINGS 727), not in the colour of the kit.
import type { MeshGroup } from './mesh.js';
import { utf8 } from './write.js';

/** A named mesh for the file: groups of triangles by material. */
export interface GltfMesh {
  name: string;
  groups: readonly MeshGroup[];
}

const FLOAT = 5126,
  UNSIGNED_SHORT = 5123,
  UNSIGNED_INT = 5125,
  ARRAY_BUFFER = 34962,
  ELEMENT_ARRAY_BUFFER = 34963,
  TRIANGLES = 4;

/** The vertices of a group stored once each: positions, normals and the indices of the triangles. */
function indexed(g: MeshGroup): { positions: Float32Array; normals: Float32Array; indices: Uint16Array | Uint32Array } {
  const bits = new Uint32Array(g.positions.buffer, g.positions.byteOffset, g.positions.length),
    nbits = new Uint32Array(g.normals.buffer, g.normals.byteOffset, g.normals.length),
    seen = new Map<string, number>(),
    order: number[] = [],
    index: number[] = [];
  for (let v = 0; v < g.positions.length / 3; v++) {
    const key = `${bits[3 * v]},${bits[3 * v + 1]},${bits[3 * v + 2]},${nbits[3 * v]},${nbits[3 * v + 1]},${nbits[3 * v + 2]}`;
    let i = seen.get(key);
    if (i === undefined) seen.set(key, (i = order.push(v) - 1));
    index.push(i);
  }
  const positions = new Float32Array(3 * order.length),
    normals = new Float32Array(3 * order.length);
  order.forEach((v, i) => {
    positions.set(g.positions.subarray(3 * v, 3 * v + 3), 3 * i);
    normals.set(g.normals.subarray(3 * v, 3 * v + 3), 3 * i);
  });
  return { positions, normals, indices: order.length > 65535 ? Uint32Array.from(index) : Uint16Array.from(index) };
}

/** The .glb of meshes. Empty groups are left out; a mesh with none left is left out too. */
export function meshesToGlb(meshes: readonly GltfMesh[], generator = 'Modulero @modulero/bazis'): Uint8Array {
  const chunks: Uint8Array[] = [],
    bufferViews: object[] = [],
    accessors: object[] = [],
    materials: string[] = [],
    gltfMeshes: object[] = [],
    nodes: object[] = [];
  let offset = 0;
  // Every view starts at a multiple of 4 bytes (glTF 2.0, 3.6.2.4).
  const view = (data: Float32Array | Uint16Array | Uint32Array, min?: number[], max?: number[]): number => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      vertices = data instanceof Float32Array;
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: vertices ? ARRAY_BUFFER : ELEMENT_ARRAY_BUFFER });
    offset += bytes.length;
    if (offset % 4) {
      chunks.push(new Uint8Array(4 - (offset % 4)));
      offset += 4 - (offset % 4);
    }
    accessors.push(
      vertices
        ? { bufferView: bufferViews.length - 1, componentType: FLOAT, count: data.length / 3, type: 'VEC3', ...(min ? { min, max } : {}) }
        : { bufferView: bufferViews.length - 1, componentType: data instanceof Uint32Array ? UNSIGNED_INT : UNSIGNED_SHORT, count: data.length, type: 'SCALAR' },
    );
    return accessors.length - 1;
  };
  for (const m of meshes) {
    const primitives = m.groups
      .filter((g) => g.positions.length > 0)
      .map((g) => {
        const min = [Infinity, Infinity, Infinity],
          max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < g.positions.length; i++) {
          min[i % 3] = Math.min(min[i % 3]!, g.positions[i]!);
          max[i % 3] = Math.max(max[i % 3]!, g.positions[i]!);
        }
        let material = materials.indexOf(g.material);
        if (material < 0) material = materials.push(g.material) - 1;
        const x = indexed(g);
        return { attributes: { POSITION: view(x.positions, min, max), NORMAL: view(x.normals) }, indices: view(x.indices), material, mode: TRIANGLES };
      });
    if (!primitives.length) continue;
    gltfMeshes.push({ name: m.name, primitives });
    nodes.push({ name: m.name, mesh: gltfMeshes.length - 1 });
  }
  const json = {
    asset: { version: '2.0', generator },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: gltfMeshes,
    materials: materials.map((name) => ({ name, pbrMetallicRoughness: { baseColorFactor: [0.6, 0.6, 0.6, 1], metallicFactor: 0.5, roughnessFactor: 0.5 } })),
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const text = utf8(JSON.stringify(json)),
    jsonLength = Math.ceil(text.length / 4) * 4,
    total = 12 + 8 + jsonLength + 8 + offset,
    out = new Uint8Array(total),
    dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // glTF
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLength, true);
  dv.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(text, 20);
  out.fill(0x20, 20 + text.length, 20 + jsonLength);
  dv.setUint32(20 + jsonLength, offset, true);
  dv.setUint32(24 + jsonLength, 0x004e4942, true); // BIN
  let at = 28 + jsonLength;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
