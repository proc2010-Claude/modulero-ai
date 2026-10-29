// Baked ambient light and light «from the window» of the visual layer (model-ambient.js of r1). The two fields are
// computed in a Web Worker on the actual triangles and drawn by the same shader patch with the same numbers, so the
// studio picture is the one of r1.
//
// Changed against r1 (MOD-DEC-324: «запечённый свет пересчитывается в фоне только рядом с изменёнными деталями»):
// r1 bakes every part again after any edit and shows the whole product without baked light meanwhile. Here every
// part keeps its own strength, and after an edit only the parts whose light can depend on a changed part are baked
// again: those within the ray length of the ambient field (0.8 m) and those whose window rays can reach it. The
// light of the other parts stays as it was — it is exactly what a full bake would give again (`affected`).
import { Box3, DataTexture, LinearFilter, Matrix3, RedFormat, type Material, type Mesh, type Vector3 } from 'three';

interface Baked {
  id: string;
  field: 'ambient' | 'window';
  width: number;
  height: number;
  data: Uint8Array;
}
interface Receiver {
  id: string;
  positions: number[];
  normals: number[];
  matrix: number[];
  normalMatrix: number[];
  min: number[];
  max: number[];
}
interface Job {
  jobId: number;
  triangles: Float32Array;
  groups: { start: number; count: number }[];
  receivers: Receiver[];
}

// The worker side: calculateAmbient of model-ambient.js (r1) with the same arithmetic in the same order, so the textures are the same
// bytes (FINDINGS 300). It is sent to the worker as text, so it uses nothing outside itself. Changed for speed only:
//   - the triangle tree is built once per bake and field and then serves every receiver of the worker (r1 builds it
//     for each call), its nodes lie in typed arrays instead of objects, and it is walked in the same order as in r1;
//   - one call bakes one field of the receivers it is given: the view hands out receivers and fields one at a time to
//     a pool of workers (`ModelAmbient`), so the slowest worker no longer decides the time of the whole bake.
export function createTracer(job: { triangles: Float32Array; groups: { start: number; count: number }[]; field: 'ambient' | 'window' }): (rec: Receiver) => Baked {
  const directional = job.field === 'window';
  const tris = job.triangles,
    n = directional ? 64 : 24,
    pad = 1,
    cell = n + 2,
    width = cell * 3,
    height = cell * 2;
  const radius = 0.8,
    samples = 48,
    bias = 0.0006;
  const min = Math.min,
    max = Math.max;
  const triangleCount = tris.length / 9,
    nodes: { lo: number[]; hi: number[]; ids?: number[]; left?: number; right?: number }[] = [];
  // Triangle edges once; Float64 keeps the JS arithmetic of r1.
  const edges = new Float64Array(tris.length);
  for (let i = 0; i < tris.length; i += 9) {
    edges[i] = tris[i];
    edges[i + 1] = tris[i + 1];
    edges[i + 2] = tris[i + 2];
    for (let a = 0; a < 3; a++) {
      edges[i + 3 + a] = tris[i + 3 + a] - tris[i + a];
      edges[i + 6 + a] = tris[i + 6 + a] - tris[i + a];
    }
  }
  function build(ids: number[]): number {
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    for (const id of ids)
      for (let k = 0; k < 9; k += 3)
        for (let a = 0; a < 3; a++) {
          const v = tris[id * 9 + k + a];
          lo[a] = min(lo[a], v);
          hi[a] = max(hi[a], v);
        }
    const index = nodes.length,
      node: (typeof nodes)[number] = { lo, hi };
    nodes.push(node);
    if (ids.length <= 8) {
      node.ids = ids;
      return index;
    }
    const axis = [0, 1, 2].sort((a, b) => hi[b] - lo[b] - (hi[a] - lo[a]))[0];
    ids.sort((a, b) => tris[a * 9 + axis] + tris[a * 9 + 3 + axis] + tris[a * 9 + 6 + axis] - (tris[b * 9 + axis] + tris[b * 9 + 3 + axis] + tris[b * 9 + 6 + axis]));
    const mid = ids.length >> 1;
    node.left = build(ids.slice(0, mid));
    node.right = build(ids.slice(mid));
    return index;
  }
  // A small exact-triangle tree per part; the part bounds cull most rays early.
  const roots: number[] = [];
  if (job.groups?.length) {
    for (const group of job.groups) roots.push(build(Array.from({ length: group.count }, (_, i) => group.start + i)));
  } else if (triangleCount) roots.push(build(Array.from({ length: triangleCount }, (_, i) => i)));
  // The same tree in typed arrays: bounds (lo x, y, z, hi x, y, z), children, and the triangles of a leaf.
  const nodeCount = nodes.length,
    bounds = new Float64Array(nodeCount * 6),
    left = new Int32Array(nodeCount).fill(-1),
    right = new Int32Array(nodeCount),
    leafStart = new Int32Array(nodeCount),
    leafEnd = new Int32Array(nodeCount),
    leafIds: number[] = [];
  nodes.forEach((node, k) => {
    for (let a = 0; a < 3; a++) {
      bounds[k * 6 + a] = node.lo[a];
      bounds[k * 6 + 3 + a] = node.hi[a];
    }
    if (node.ids) {
      leafStart[k] = leafIds.length;
      leafIds.push(...node.ids);
      leafEnd[k] = leafIds.length;
    } else {
      left[k] = node.left!;
      right[k] = node.right!;
    }
  });
  const leaves = Int32Array.from(leafIds);
  const stack = new Int32Array(Math.max(128, roots.length + 64));
  // The parts a ray from the current point can hit, in the order of r1 (`aim`). A part is left out only when none of
  // its triangles can give a hit for any ray of the point, so the result of every ray is the one of r1.
  const active = new Int32Array(roots.length);
  let activeCount = 0;
  const MARGIN = 1e-6;
  /** Ambient rays (the hemisphere over n, length `radius`): parts beyond the radius or behind the face are left out. */
  function aimAmbient(ox: number, oy: number, oz: number, nx: number, ny: number, nz: number) {
    activeCount = 0;
    for (let i = 0; i < roots.length; i++) {
      const o = roots[i] * 6,
        cx = max(bounds[o] - ox, 0, ox - bounds[o + 3]),
        cy = max(bounds[o + 1] - oy, 0, oy - bounds[o + 4]),
        cz = max(bounds[o + 2] - oz, 0, oz - bounds[o + 5]);
      if (Math.sqrt(cx * cx + cy * cy + cz * cz) > radius + MARGIN) continue;
      const ahead = (nx > 0 ? bounds[o + 3] : bounds[o]) - ox,
        up = (ny > 0 ? bounds[o + 4] : bounds[o + 1]) - oy,
        front = (nz > 0 ? bounds[o + 5] : bounds[o + 2]) - oz;
      if (nx * ahead + ny * up + nz * front < -MARGIN) continue;
      active[activeCount++] = roots[i];
    }
  }
  /** Window rays (every one goes up and to the front, dy > 0 and dz > 0): parts below or behind the point are left out. */
  function aimWindow(oy: number, oz: number) {
    activeCount = 0;
    for (let i = 0; i < roots.length; i++) {
      const o = roots[i] * 6;
      if (bounds[o + 4] < oy - MARGIN || bounds[o + 5] < oz - MARGIN) continue;
      active[activeCount++] = roots[i];
    }
  }
  function nearest(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, limit = radius, anyHit = false): number {
    if (!nodeCount) return limit;
    const ix = 1 / dx,
      iy = 1 / dy,
      iz = 1 / dz;
    let best = limit,
      top = 0;
    for (let i = 0; i < activeCount; i++) stack[top++] = active[i];
    while (top) {
      const k = stack[--top],
        o = k * 6;
      let t0 = 0,
        t1 = best,
        a,
        b;
      if (dx === 0) {
        if (ox < bounds[o] || ox > bounds[o + 3]) continue;
      } else {
        a = (bounds[o] - ox) * ix;
        b = (bounds[o + 3] - ox) * ix;
        t0 = max(t0, min(a, b));
        t1 = min(t1, max(a, b));
        if (t1 < t0) continue;
      }
      if (dy === 0) {
        if (oy < bounds[o + 1] || oy > bounds[o + 4]) continue;
      } else {
        a = (bounds[o + 1] - oy) * iy;
        b = (bounds[o + 4] - oy) * iy;
        t0 = max(t0, min(a, b));
        t1 = min(t1, max(a, b));
        if (t1 < t0) continue;
      }
      if (dz === 0) {
        if (oz < bounds[o + 2] || oz > bounds[o + 5]) continue;
      } else {
        a = (bounds[o + 2] - oz) * iz;
        b = (bounds[o + 5] - oz) * iz;
        t0 = max(t0, min(a, b));
        t1 = min(t1, max(a, b));
        if (t1 < t0) continue;
      }
      if (left[k] >= 0) {
        stack[top++] = left[k];
        stack[top++] = right[k];
        continue;
      }
      for (let l = leafStart[k], end = leafEnd[k]; l < end; l++) {
        const i = leaves[l] * 9,
          ax = edges[i],
          ay = edges[i + 1],
          az = edges[i + 2];
        const e1x = edges[i + 3],
          e1y = edges[i + 4],
          e1z = edges[i + 5],
          e2x = edges[i + 6],
          e2y = edges[i + 7],
          e2z = edges[i + 8];
        const px = dy * e2z - dz * e2y,
          py = dz * e2x - dx * e2z,
          pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det,
          tx = ox - ax,
          ty = oy - ay,
          tz = oz - az;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y,
          qy = tz * e1x - tx * e1z,
          qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t > 0.00001 && t < best) {
          if (anyHit) return t;
          best = t;
        }
      }
    }
    return best;
  }
  const hemisphere = Array.from({ length: samples }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / samples),
      phi = i * 2.399963229728653;
    return [r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - r * r)];
  });
  // Large window direction, fixed in world space: slopes give the shadow displacement, the angular extent the penumbra.
  const makeWindowRays = (slope: number, spread: number) =>
    Array.from({ length: 64 }, (_, i) => {
      const r = Math.sqrt((i + 0.5) / 64),
        phi = i * 2.399963229728653;
      const x = slope + spread * r * Math.cos(phi),
        y = 0.42 + 0.2 * r * Math.sin(phi),
        z = 1;
      const length = Math.hypot(x, y, z);
      return [x / length, y / length, z / length];
    });
  const windowRays = makeWindowRays(-0.32, 0.16);
  const horizontalWindowRays = makeWindowRays(-0.42, 0.18);
  const uprightWindowRays = (sign: number) =>
    Array.from({ length: 32 }, (_, i) => {
      const r = Math.sqrt((i + 0.5) / 32),
        phi = i * 2.399963229728653;
      const x = sign * (0.52 + 0.2 * r * Math.cos(phi)),
        y = 0.7 + 0.22 * r * Math.sin(phi),
        z = 1;
      const length = Math.hypot(x, y, z);
      return [x / length, y / length, z / length];
    });
  const rightWindowRays = uprightWindowRays(1),
    leftWindowRays = uprightWindowRays(-1);
  return (rec: Receiver): Baked => {
    const atlas = new Uint8Array(width * height).fill(255);
    const p = rec.positions,
      normal = rec.normals,
      m = rec.matrix,
      nm = rec.normalMatrix;
    const bucket: number[][] = Array.from({ length: 6 }, () => []);
    for (let i = 0; i < p.length; i += 9) {
      const a = [Math.abs(normal[i]), Math.abs(normal[i + 1]), Math.abs(normal[i + 2])];
      const axis = a.indexOf(Math.max(...a));
      if (a[axis] < 0.999) continue;
      bucket[axis * 2 + (normal[i + axis] < 0 ? 1 : 0)].push(i);
    }
    for (let face = 0; face < 6; face++) {
      if (!bucket[face].length) continue;
      const axis = face >> 1,
        sign = face % 2 ? -1 : 1,
        uAxis = axis === 0 ? 2 : 0,
        vAxis = axis === 1 ? 2 : 1;
      let nx = nm[axis * 3] * sign,
        ny = nm[axis * 3 + 1] * sign,
        nz = nm[axis * 3 + 2] * sign;
      const length = Math.hypot(nx, ny, nz);
      nx /= length;
      ny /= length;
      nz /= length;
      let tx = 0,
        ty = nz,
        tz = -ny;
      if (Math.abs(nx) > 0.9) {
        tx = -nz;
        ty = 0;
        tz = nx;
      }
      const tl = Math.hypot(tx, ty, tz);
      tx /= tl;
      ty /= tl;
      tz /= tl;
      const bx = ny * tz - nz * ty,
        by = nz * tx - nx * tz,
        bz = nx * ty - ny * tx;
      // Ray directions of this face, flat: x, y, z (and the weight of a window ray).
      const rays = new Float64Array(samples * 3);
      hemisphere.forEach(([x, y, z], i) => {
        rays[i * 3] = tx * x + bx * y + nx * z;
        rays[i * 3 + 1] = ty * x + by * y + ny * z;
        rays[i * 3 + 2] = tz * x + bz * y + nz * z;
      });
      const tileX = (face % 3) * cell,
        tileY = Math.floor(face / 3) * cell;
      const upward = ny > 0.999,
        upright = Math.abs(nx) > 0.999;
      const activeWindowRays = upward ? horizontalWindowRays : upright ? (nx > 0 ? rightWindowRays : leftWindowRays) : windowRays;
      const windowShare = upward ? 0.84 : upright ? 0.68 : 0.5;
      const windowCount = activeWindowRays.length;
      const windowSamples = activeWindowRays.map(([x, y, z]) => [x, y, z, Math.max(0, nx * x + ny * y + nz * z)]).filter((r) => r[3] > 0);
      const windowIrradiance = windowSamples.reduce((sum, r) => sum + r[3], 0) / windowCount;
      if (directional && !windowSamples.length) continue; // identically white field
      const windowFlat = Float64Array.from(windowSamples.flat()),
        windowLength = windowSamples.length;
      const nu = Math.min(n, Math.max(3, Math.ceil((rec.max[uAxis] - rec.min[uAxis]) / 0.025) + 1));
      const nv = Math.min(n, Math.max(3, Math.ceil((rec.max[vAxis] - rec.min[vAxis]) / 0.025) + 1));
      const grid = new Float32Array(nu * nv).fill(1);
      for (let iy = 0; iy < nv; iy++)
        for (let ix = 0; ix < nu; ix++) {
          const u = rec.min[uAxis] + (rec.max[uAxis] - rec.min[uAxis]) * (0.0001 + (0.9998 * ix) / (nu - 1));
          const v = rec.min[vAxis] + (rec.max[vAxis] - rec.min[vAxis]) * (0.0001 + (0.9998 * iy) / (nv - 1));
          let surface = sign > 0 ? -Infinity : Infinity;
          for (const i of bucket[face]) {
            const au = p[i + uAxis],
              av = p[i + vAxis],
              bu = p[i + 3 + uAxis],
              bv = p[i + 3 + vAxis],
              cu = p[i + 6 + uAxis],
              cv = p[i + 6 + vAxis];
            const den = (bv - cv) * (au - cu) + (cu - bu) * (av - cv);
            if (Math.abs(den) < 1e-14) continue;
            const a = ((bv - cv) * (u - cu) + (cu - bu) * (v - cv)) / den,
              b = ((cv - av) * (u - cu) + (au - cu) * (v - cv)) / den,
              c = 1 - a - b;
            if (a < -0.00001 || b < -0.00001 || c < -0.00001) continue;
            const value = a * p[i + axis] + b * p[i + 3 + axis] + c * p[i + 6 + axis];
            surface = sign > 0 ? max(surface, value) : min(surface, value);
          }
          if (!Number.isFinite(surface)) continue;
          const local = [0, 0, 0];
          local[axis] = surface;
          local[uAxis] = u;
          local[vAxis] = v;
          const [x, y, z] = local,
            ox = m[0] * x + m[4] * y + m[8] * z + m[12] + nx * bias,
            oy = m[1] * x + m[5] * y + m[9] * z + m[13] + ny * bias,
            oz = m[2] * x + m[6] * y + m[10] * z + m[14] + nz * bias;
          if (directional) {
            aimWindow(oy, oz);
            let blocked = 0;
            for (let r = 0; r < windowLength; r++) {
              const j = r * 4;
              if (nearest(ox, oy, oz, windowFlat[j], windowFlat[j + 1], windowFlat[j + 2], 1000, true) < 1000) blocked += windowFlat[j + 3];
            }
            // Unblocked surfaces are exactly 1: the white of r1 is kept.
            grid[iy * nu + ix] = 1 - (windowShare * (blocked / windowCount)) / (windowIrradiance + 0.3);
          } else {
            aimAmbient(ox, oy, oz, nx, ny, nz);
            let occluded = 0;
            for (let r = 0; r < samples; r++) {
              const t = nearest(ox, oy, oz, rays[r * 3], rays[r * 3 + 1], rays[r * 3 + 2]) / radius;
              occluded += 1 - t * t * (3 - 2 * t);
            }
            grid[iy * nu + ix] = 1 - occluded / samples;
          }
        }
      for (let iy = 0; iy < n; iy++)
        for (let ix = 0; ix < n; ix++) {
          const x = (ix * (nu - 1)) / (n - 1),
            y = (iy * (nv - 1)) / (n - 1),
            x0 = Math.floor(x),
            y0 = Math.floor(y),
            x1 = Math.min(nu - 1, x0 + 1),
            y1 = Math.min(nv - 1, y0 + 1),
            fx = x - x0,
            fy = y - y0;
          const a = grid[y0 * nu + x0] * (1 - fx) + grid[y0 * nu + x1] * fx,
            b = grid[y1 * nu + x0] * (1 - fx) + grid[y1 * nu + x1] * fx;
          atlas[(tileY + pad + iy) * width + tileX + pad + ix] = Math.round(255 * (a * (1 - fy) + b * fy));
        }
      // Padding prevents bilinear sampling from mixing neighbouring cube faces.
      for (let i = 0; i < cell; i++) {
        const j = Math.max(1, Math.min(n, i));
        atlas[tileY * width + tileX + i] = atlas[(tileY + 1) * width + tileX + j];
        atlas[(tileY + cell - 1) * width + tileX + i] = atlas[(tileY + n) * width + tileX + j];
        atlas[(tileY + i) * width + tileX] = atlas[(tileY + j) * width + tileX + 1];
        atlas[(tileY + i) * width + tileX + cell - 1] = atlas[(tileY + j) * width + tileX + n];
      }
    }
    return { id: rec.id, field: job.field, width, height, data: atlas };
  };
}

const aoFragment = /* glsl */ `
uniform sampler2D modAmbientMap;
uniform sampler2D modWindowMap;
uniform vec3 modAmbientMin;
uniform vec3 modAmbientMax;
uniform float modAmbientStrength;
varying vec3 modAmbientPosition;
varying vec3 modAmbientNormal;
varying vec3 modAmbientWorldNormal;
vec4 moduleroAmbientVisibility(vec3 albedo){
 vec3 q=clamp((modAmbientPosition-modAmbientMin)/max(modAmbientMax-modAmbientMin,vec3(0.000001)),0.0,1.0);
 vec3 n=abs(modAmbientNormal);float face;vec2 uv;
 if(n.x>n.y&&n.x>n.z){face=modAmbientNormal.x>0.0?0.0:1.0;uv=q.zy;}
 else if(n.y>n.z){face=modAmbientNormal.y>0.0?2.0:3.0;uv=q.xz;}
 else{face=modAmbientNormal.z>0.0?4.0:5.0;uv=q.xy;}
 vec2 tile=vec2(mod(face,3.0),floor(face/3.0));
 vec2 atlas=(tile*26.0+1.5+uv*23.0)/vec2(78.0,52.0);
 float visibility=texture2D(modAmbientMap,atlas).r;
 vec3 rho=clamp(albedo*0.6,vec3(0.0),vec3(0.6));
 vec3 bounced=vec3(visibility)/(vec3(1.0)-rho*(1.0-visibility));
 vec2 windowAtlas=(tile*66.0+1.5+uv*63.0)/vec2(198.0,132.0);
 float windowVisibility=texture2D(modWindowMap,windowAtlas).r;
 vec3 worldNormal=normalize(modAmbientWorldNormal);
 float castReceiver=max(step(0.999,worldNormal.y),step(0.999,abs(worldNormal.x)));
 float directVisibility=mix(1.0,windowVisibility,0.65*modAmbientStrength*castReceiver);
 return vec4(mix(vec3(1.0),bounced,modAmbientStrength)*mix(1.0,windowVisibility,modAmbientStrength),directVisibility);
}`;

/** Strength of the baked light in the studio picture (r1). */
export const BAKED_STRENGTH = 0.92;
/**
 * Workers of the bake at most (Д): one pool for the life of the view, at most the logical processors minus one.
 * Receivers and fields are handed out one at a time, the textures are the same (FINDINGS 205, 300).
 */
export const BAKE_WORKERS = 8;

// The code of a pool worker: the tracer of the bake it works on, per field, serves every receiver it is given.
const WORKER_CODE = () =>
  `const createTracer=${createTracer.toString()};let scene=null;const tracers=new Map();` +
  `onmessage=(e)=>{const t=e.data;try{if(t.scene){scene={jobId:t.jobId,triangles:t.scene.triangles,groups:t.scene.groups};tracers.clear();}` +
  `if(!scene||scene.jobId!==t.jobId)throw new Error('The bake has no scene');let tracer=tracers.get(t.field);` +
  `if(!tracer)tracers.set(t.field,(tracer=createTracer({triangles:scene.triangles,groups:scene.groups,field:t.field})));` +
  `const baked=tracer(t.receiver);postMessage({kind:'done',jobId:t.jobId,baked},[baked.data.buffer]);}` +
  `catch(error){postMessage({kind:'error',message:String(error)});}};`;

/** Rough work of one receiver and field: grid points times rays (createTracer), to hand out the long ones first. */
function workOf(rec: Receiver, field: 'ambient' | 'window'): number {
  const n = field === 'window' ? 64 : 24,
    cells = (d: number) => Math.min(n, Math.max(3, Math.ceil(d / 0.025) + 1)),
    [x, y, z] = [0, 1, 2].map((a) => cells(rec.max[a] - rec.min[a]));
  return 2 * (z * y + x * z + x * y) * (field === 'window' ? 32 : 48);
}

interface Task {
  receiver: Receiver;
  field: 'ambient' | 'window';
  work: number;
}
interface Slot {
  worker: Worker;
  /** The bake whose scene this worker has. */
  jobId: number;
  busy: boolean;
}
interface Bake {
  jobId: number;
  job: Job;
  queue: Task[];
  total: number;
  textures: Baked[];
  finish: (textures: Baked[]) => void;
}
// Ray reach of the fields, metres: ambient rays end at their radius; window rays go to the front (+z) with
// |x/z| ≤ 0.72 and 0.22 ≤ y/z ≤ 0.92 (the ray sets of createTracer), and nothing blocks them beyond the product.
const AMBIENT_REACH = 0.8 + 0.001;
const WINDOW_X = 0.72 + 0.001;
const WINDOW_Y = 0.92 + 0.001;

type StdMaterial = Material & { color: { copy(c: unknown): void }; customProgramCacheKey(): string; [key: string]: unknown };
interface Record {
  mesh: Mesh;
  id: string;
  proxies: Map<Material, { material: StdMaterial; source: StdMaterial }>;
  texture: DataTexture | null;
  windowTexture: DataTexture | null;
  strength: { value: number };
  uniforms: { [name: string]: { value: unknown } };
}
interface Snapshot {
  key: string;
  box: Box3;
}

const meshKey = (m: Mesh) => [m.uuid, m.visible, ...m.position.toArray(), ...m.quaternion.toArray(), ...m.scale.toArray()].join(',');

export class ModelAmbient {
  lastStatus = '';
  records = new Map<Mesh, Record>();
  white = new DataTexture(new Uint8Array([255]), 1, 1, RedFormat);
  jobId = 0;
  /** Meshes and boxes the baked textures are valid for (the last completed bake). */
  baked = new Map<Mesh, Snapshot>();
  bakedKey: string | null = null;
  pendingKey: string | null = null;
  /** The pool of workers, made with the view; a bake hands its receivers and fields to them one at a time. */
  pool: Slot[] = [];
  poolUrl: string | null = null;
  /** The running bake; a stopped one is forgotten, its last tasks finish in the pool and are ignored. */
  bake: Bake | null = null;
  failed = false;
  disposed = false;
  /** Receivers of the last bake (for tests and the measurement): ids and how many of all receivers. */
  lastJob: { receivers: string[]; of: number; workers: number; tasks: number; ms: number } | null = null;
  status: (text: string) => void;

  constructor(
    public request: () => void,
    status: (text: string) => void = () => {},
  ) {
    this.status = (text) => {
      if (text !== this.lastStatus) {
        this.lastStatus = text;
        status(text);
      }
    };
    this.white.needsUpdate = true;
  }

  /** Starts the workers before the first bake, so their start is not in the time of the studio frame. */
  startPool() {
    if (this.pool.length || this.failed || this.disposed) return;
    try {
      const size = Math.max(1, Math.min(BAKE_WORKERS, (navigator.hardwareConcurrency || 2) - 1));
      this.poolUrl = URL.createObjectURL(new Blob([WORKER_CODE()], { type: 'text/javascript' }));
      for (let i = 0; i < size; i++) {
        const slot: Slot = { worker: new Worker(this.poolUrl), jobId: -1, busy: false };
        slot.worker.onerror = () => this.fail();
        slot.worker.onmessage = (e: MessageEvent) => this.received(slot, e.data);
        this.pool.push(slot);
      }
    } catch {
      this.fail();
    }
  }

  /** Strength of every record: baked textures that are valid show, the others wait. */
  get ready(): boolean {
    return this.bakedKey !== null && this.pendingKey === null && !this.bake;
  }

  /** Ends the running bake: its tasks are dropped, a late result of it is ignored. */
  stopBake() {
    this.bake = null;
    this.pendingKey = null;
    this.jobId++;
  }

  /** Gives every idle worker the next task of the running bake. */
  dispatch() {
    const bake = this.bake;
    if (!bake) return;
    for (const slot of this.pool) {
      if (slot.busy || !bake.queue.length) continue;
      const task = bake.queue.shift()!,
        scene = slot.jobId === bake.jobId ? undefined : { triangles: bake.job.triangles, groups: bake.job.groups };
      slot.busy = true;
      slot.jobId = bake.jobId;
      slot.worker.postMessage({ jobId: bake.jobId, field: task.field, receiver: task.receiver, scene });
    }
  }

  received(slot: Slot, result: { kind: string; jobId: number; baked?: Baked }) {
    slot.busy = false;
    if (this.disposed) return;
    if (result.kind === 'error') return this.fail();
    const bake = this.bake;
    if (!bake || result.jobId !== bake.jobId) return this.dispatch();
    bake.textures.push(result.baked!);
    this.dispatch();
    if (bake.textures.length < bake.total) {
      this.status(`Уточняем освещение · ${Math.round((bake.textures.length / bake.total) * 100)}%`);
      return;
    }
    this.bake = null;
    bake.finish(bake.textures);
  }

  apply(meshes: Mesh[]) {
    const live = new Set(meshes);
    for (const [mesh, r] of this.records)
      if (!live.has(mesh)) {
        for (const p of r.proxies.values()) p.material.dispose();
        r.texture?.dispose();
        r.windowTexture?.dispose();
        this.records.delete(mesh);
      }
    for (const mesh of meshes) {
      if (!mesh.geometry.userData.surfaceGroups) continue;
      let r = this.records.get(mesh);
      if (!r) {
        const bounds = mesh.geometry.boundingBox!,
          strength = { value: 0 };
        r = {
          mesh,
          id: mesh.uuid,
          proxies: new Map(),
          texture: null,
          windowTexture: null,
          strength,
          uniforms: { modAmbientMap: { value: this.white }, modWindowMap: { value: this.white }, modAmbientMin: { value: bounds.min.clone() }, modAmbientMax: { value: bounds.max.clone() }, modAmbientStrength: strength },
        };
        this.records.set(mesh, r);
      }
      const record = r;
      const decorate = (source: StdMaterial): StdMaterial => {
        if (source.userData.modAmbientProxy) return source;
        let proxy = record.proxies.get(source);
        if (!proxy) {
          const material = source.clone() as StdMaterial;
          material.userData = { ...source.userData, modAmbientProxy: true };
          const originalCompile = source.onBeforeCompile;
          material.onBeforeCompile = (shader, renderer) => {
            originalCompile.call(material, shader, renderer);
            Object.assign(shader.uniforms, record.uniforms);
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', '#include <common>\nvarying vec3 modAmbientPosition;\nvarying vec3 modAmbientNormal;\nvarying vec3 modAmbientWorldNormal;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nmodAmbientPosition=position;modAmbientNormal=normal;modAmbientWorldNormal=inverseTransformDirection(transformedNormal,viewMatrix);');
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <common>', '#include <common>\n' + aoFragment)
              .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nvec4 modVisibility=moduleroAmbientVisibility(diffuseColor.rgb);\nreflectedLight.indirectDiffuse *= modVisibility.rgb;\nreflectedLight.directDiffuse *= modVisibility.a;');
          };
          material.customProgramCacheKey = () => source.customProgramCacheKey() + '|MODULERO_MODEL_AMBIENT_04_RECEIVER_CAST_DIFFUSE';
          proxy = { material, source };
          record.proxies.set(source, proxy);
        }
        return proxy.material;
      };
      mesh.material = Array.isArray(mesh.material) ? (mesh.material as StdMaterial[]).map(decorate) : decorate(mesh.material as StdMaterial);
    }
  }

  sync() {
    for (const r of this.records.values())
      for (const { material: m, source: s } of r.proxies.values()) {
        m.color.copy(s.color);
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap'])
          if (m[key] !== s[key]) {
            m[key] = s[key];
            m.needsUpdate = true;
          }
        for (const key of ['roughness', 'metalness', 'envMapIntensity', 'opacity', 'depthWrite']) m[key] = s[key];
        for (const key of ['transparent', 'side', 'alphaTest'])
          if (m[key] !== s[key]) {
            m[key] = s[key];
            m.needsUpdate = true;
          }
      }
  }

  /** Forgets every bake (translucent fronts changed what blocks the light). */
  invalidate() {
    this.stopBake();
    this.baked.clear();
    this.bakedKey = null;
    for (const r of this.records.values()) r.strength.value = 0;
  }

  /**
   * Receivers whose light may change when the scene goes from `baked` to the current meshes: a receiver of its own
   * change, one without a bake, and one whose rays reach the box of a changed blocker (before or after the change).
   */
  affected(meshes: Mesh[], boxes: Map<Mesh, Box3>): Set<Mesh> {
    const changed: Box3[] = [],
      now = new Set(meshes),
      front = Math.max(...[...boxes.values(), ...[...this.baked.values()].map((s) => s.box)].map((b) => b.max.z)),
      out = new Set<Mesh>();
    for (const [mesh, s] of this.baked) if (!now.has(mesh) || s.key !== meshKey(mesh)) changed.push(s.box);
    for (const mesh of meshes) {
      const s = this.baked.get(mesh);
      if (!s || s.key !== meshKey(mesh)) {
        changed.push(boxes.get(mesh)!);
        out.add(mesh);
      }
    }
    for (const mesh of meshes) {
      if (out.has(mesh) || !this.records.has(mesh)) continue;
      const r = this.records.get(mesh)!;
      if (!r.texture || !r.windowTexture) {
        out.add(mesh);
        continue;
      }
      const b = boxes.get(mesh)!,
        near = b.clone().expandByScalar(AMBIENT_REACH),
        dz = Math.max(0, front - b.min.z),
        window = new Box3(b.min.clone().setX(b.min.x - WINDOW_X * dz), b.max.clone().setX(b.max.x + WINDOW_X * dz).setY(b.max.y + WINDOW_Y * dz).setZ(Math.max(b.max.z, front))).expandByScalar(0.002);
      if (changed.some((c) => c.intersectsBox(near) || c.intersectsBox(window))) out.add(mesh);
    }
    return out;
  }

  packet(meshes: Mesh[], receivers: Set<Mesh>, jobId: number): Job {
    const triangles: number[] = [],
      list: Receiver[] = [],
      groups: { start: number; count: number }[] = [];
    for (const mesh of meshes) {
      mesh.updateMatrixWorld(true);
      if (!mesh.visible) continue;
      const g = mesh.geometry,
        p = g.attributes.position,
        idx = g.index,
        e = mesh.matrixWorld.elements;
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
      // Translucent preview fronts do not act as opaque blockers.
      if (!materials.every((x) => x.transparent && x.opacity < 0.95)) {
        const start = triangles.length / 9,
          count = idx ? idx.count : p.count;
        for (let i = 0; i < count; i++) {
          const j = idx ? idx.getX(i) : i,
            x = p.getX(j),
            y = p.getY(j),
            z = p.getZ(j);
          triangles.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        }
        if (count) groups.push({ start, count: count / 3 });
      }
      const r = this.records.get(mesh);
      if (!r || !receivers.has(mesh)) continue;
      list.push({
        id: r.id,
        positions: Array.from(p.array as Float32Array),
        normals: Array.from(g.attributes.normal.array as Float32Array),
        matrix: e.slice(),
        normalMatrix: new Matrix3().getNormalMatrix(mesh.matrixWorld).elements.slice(),
        min: g.boundingBox!.min.toArray(),
        max: g.boundingBox!.max.toArray(),
      });
    }
    return { jobId, triangles: new Float32Array(triangles), groups, receivers: list };
  }

  frame(meshes: Mesh[], moving: boolean, enabled = true) {
    if (this.disposed) return;
    this.sync();
    if (moving) {
      for (const r of this.records.values()) r.strength.value = 0;
      this.status('Движение · базовое освещение');
      if (this.bake) this.stopBake();
      return;
    }
    const key = meshes.map(meshKey).join('|');
    if (!enabled) {
      for (const r of this.records.values()) r.strength.value = 0;
      if (this.bake) this.stopBake();
      this.status('Базовое освещение');
      return;
    }
    if (this.bakedKey === key) {
      for (const r of this.records.values()) r.strength.value = r.texture ? BAKED_STRENGTH : 0;
      this.status('Освещение уточнено');
      return;
    }
    const boxes = new Map(meshes.map((m) => [m, new Box3().setFromObject(m)])),
      affected = this.affected(meshes, boxes);
    // The quick frame: the parts that keep their light show it at once, the others wait for the bake.
    for (const [mesh, r] of this.records) r.strength.value = r.texture && !affected.has(mesh) ? BAKED_STRENGTH : 0;
    if (this.failed || this.pendingKey === key) return;
    if (this.bake) this.stopBake();
    this.startPool();
    if (this.failed) return;
    this.pendingKey = key;
    const jobId = ++this.jobId,
      state = new Map(meshes.map((m) => [m, { key: meshKey(m), box: boxes.get(m)! }]));
    try {
      const receivers = new Set([...affected].filter((m) => m.visible)),
        job = this.packet(meshes, receivers, jobId),
        // Each receiver and field is baked on its own (no random numbers, no shared state), so handing them out to
        // the workers one at a time, the longest first, gives the same textures as one worker, sooner.
        queue = job.receivers.flatMap((receiver) => (['ambient', 'window'] as const).map((field) => ({ receiver, field, work: workOf(receiver, field) }))).sort((a, b) => b.work - a.work);
      this.status('Уточняем освещение…');
      const started = performance.now();
      const bake: Bake = {
        jobId,
        job,
        queue,
        total: queue.length,
        textures: [],
        finish: (textures) => {
          const byId = new Map([...this.records.values()].map((r) => [r.id, r]));
          for (const baked of textures) {
            const r = byId.get(baked.id);
            if (!r) continue;
            const slot = baked.field === 'window' ? 'windowTexture' : 'texture',
              uniform = baked.field === 'window' ? 'modWindowMap' : 'modAmbientMap';
            r[slot]?.dispose();
            const t = new DataTexture(baked.data, baked.width, baked.height, RedFormat);
            t.minFilter = LinearFilter;
            t.magFilter = LinearFilter;
            t.unpackAlignment = 1;
            t.needsUpdate = true;
            r[slot] = t;
            r.uniforms[uniform].value = t;
          }
          this.lastJob = { receivers: [...receivers].map((m) => String(m.userData.id)), of: meshes.filter((m) => m.visible && this.records.has(m)).length, workers: Math.min(this.pool.length, bake.total), tasks: bake.total, ms: performance.now() - started };
          this.baked = state;
          this.bakedKey = key;
          this.pendingKey = null;
          this.status('Освещение уточнено');
          this.request();
        },
      };
      if (!queue.length) bake.finish([]);
      else {
        this.bake = bake;
        // The workers start after the frame that asked for the bake has been handed over: the quick frame does not
        // share the processor with the bake (without a graphics card the processor draws it, FINDINGS 301).
        setTimeout(() => this.dispatch(), 0);
      }
    } catch {
      this.fail();
    }
  }

  fail() {
    this.failed = true;
    for (const r of this.records.values()) r.strength.value = 0;
    this.stopBake();
    this.status('Уточнение света недоступно — показано базовое освещение');
    this.request();
  }

  dispose() {
    this.disposed = true;
    this.stopBake();
    for (const slot of this.pool) slot.worker.terminate();
    this.pool = [];
    if (this.poolUrl) URL.revokeObjectURL(this.poolUrl);
    for (const r of this.records.values()) {
      r.texture?.dispose();
      r.windowTexture?.dispose();
      for (const p of r.proxies.values()) p.material.dispose();
    }
    this.records.clear();
    this.white.dispose();
  }
}

export type { Vector3 };
