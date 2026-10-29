// Panel geometry of the visual layer (technical-part.js of r1: `technicalGeometry`, `featureEdges`). Surfaces keep the
// four material groups of r1 — FACE, EDGE_BANDED, EDGE_BARE, CUT — with the same uv rule, so the materials and the
// baked light of r1 apply unchanged; a fifth, EDGE_ACCENT, is a band of a visible edge in another decor (MOD-DEC-483,
// «в цвет фасадов»), empty unless the part has one.
//   - A rectangular part whose axes lie along the axes of the product (every part of the current products) is built
//     exactly as r1 builds a box: `technicalGeometry` with the size along the world axes and the surface map of its
//     faces; the mesh is not rotated. The triangles are those of r1, so is the picture.
//   - A contour (`contourMm`) or a turned part: built in the axes of the part (x along u, y along v, z along n),
//     centred on its envelope; the mesh is turned by the placement.
// Cut-outs (BSP of r1) belong to the technical 3D of a part (task V3) and are not drawn here.
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2, Vector3 } from 'three';

type Banded = { A: boolean; B: boolean; C: boolean; D: boolean };
export interface PanelShape {
  sizeMm: [number, number, number];
  contourMm: [number, number][] | null;
  banded: Banded;
  /** Banded slots in the decor of the edges (EDGE_ACCENT). */
  accent?: readonly (keyof Banded)[];
  /** The axis of the part (x — u, y — v, z — n) the pattern runs along; absent — none (r1). */
  grain?: 'x' | 'y' | 'z' | null;
}

const SURFACE_INDEX = { FACE: 0, EDGE_BANDED: 1, EDGE_BARE: 2, CUT: 3, EDGE_ACCENT: 4 } as const;
type Surface = keyof typeof SURFACE_INDEX;
// Visual assumption of r1 only: no manufacturer physical repeat was supplied.
const VISUAL_REPEAT_MM = 600;

/** A planar convex polygon of the panel surface (millimetres, part axes) and its outward normal. */
interface Polygon {
  v: Vector3[];
  n: Vector3;
  surface: Surface;
}

// uv of r1 (`uvFor`, `technicalGeometry`): in the plane of the face, the pattern of the decor runs along v (the images of
// the decors are drawn with it upright) — along the grain axis of the part where it lies in the plane, else along the
// second axis of the plane, as r1 lays it without one (MOD-AI-25, MOD-DEC-742, FINDINGS 3053).
function uvAlong(grain: string | null): (v: Vector3, n: Vector3) => [number, number] {
  return (v, n) => {
    const normal = signedAxis(n)[1],
      plane = (['x', 'y', 'z'] as const).filter((a) => a !== normal),
      g = (plane as readonly string[]).includes(grain ?? '') ? (grain as 'x' | 'y' | 'z') : plane[1],
      cross = plane.find((a) => a !== g)!;
    return [v[cross] / VISUAL_REPEAT_MM, v[g] / VISUAL_REPEAT_MM];
  };
}

// Edges of the polygons where the surface really turns (r1 `featureEdges`): coplanar seams of the triangulation are not
// edges. Positions in metres.
export function featureEdges(ps: { v: Vector3[]; n: Vector3 }[]): number[] {
  const lines = new Map<string, { d: Vector3; origin: Vector3; intervals: { lo: number; hi: number; n: Vector3 }[] }>(),
    round = (v: number, n: number) => Math.round(v * n);
  for (const p of ps)
    for (let i = 0; i < p.v.length; i++) {
      const a = p.v[i],
        b = p.v[(i + 1) % p.v.length],
        d = b.clone().sub(a),
        len = d.length();
      if (len < 1e-5) continue;
      d.divideScalar(len);
      const first = [d.x, d.y, d.z].find((x) => Math.abs(x) > 1e-7)!;
      if (first < 0) d.negate();
      const moment = a.clone().cross(d),
        key = [...d.toArray().map((x) => round(x, 1e6)), ...moment.toArray().map((x) => round(x, 1e4))].join(',');
      if (!lines.has(key)) lines.set(key, { d, origin: a.clone().addScaledVector(d, -a.dot(d)), intervals: [] });
      const line = lines.get(key)!,
        t0 = a.dot(line.d),
        t1 = b.dot(line.d);
      line.intervals.push({ lo: Math.min(t0, t1), hi: Math.max(t0, t1), n: p.n });
    }
  const points: number[] = [];
  for (const { d, origin, intervals } of lines.values()) {
    const sorted = intervals.flatMap((e) => [e.lo, e.hi]).sort((a, b) => a - b),
      ends = sorted.filter((x, i) => i === 0 || x - sorted[i - 1] > 1e-5);
    for (let i = 0; i < ends.length - 1; i++) {
      const lo = ends[i],
        hi = ends[i + 1],
        mid = (lo + hi) / 2,
        cover = intervals.filter((e) => e.lo < mid + 1e-5 && e.hi > mid - 1e-5);
      if (!cover.length) continue;
      if (cover.length > 1 && cover.every((e) => Math.abs(e.n.dot(cover[0].n)) > 0.99999)) continue;
      for (const t of [lo, hi]) points.push(...origin.clone().addScaledVector(d, t).multiplyScalar(0.001).toArray());
    }
  }
  return points;
}

/** Surface of a side of the panel by the edge it lies on (A at v = 0, B at v = W, C at u = 0, D at u = L). */
function edgeSurface(banded: boolean, accent = false): Surface {
  return banded ? (accent ? 'EDGE_ACCENT' : 'EDGE_BANDED') : 'EDGE_BARE';
}

// Counter-clockwise seen from outside, as the front faces of Three.js: the order is reversed when it is not.
function outward(v: Vector3[], n: Vector3, surface: Surface): Polygon {
  const turn = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
  return { v: turn.dot(n) < 0 ? [...v].reverse() : v, n, surface };
}

// Polygons of the panel: the two faces and the sides, centred on the envelope L × W × T.
function polygons(shape: PanelShape): Polygon[] {
  const [L, W, T] = shape.sizeMm,
    cx = L / 2,
    cy = W / 2,
    hz = T / 2,
    out: Polygon[] = [];
  if (!shape.contourMm) {
    // The six faces of the box, two triangles each — the triangles of r1's BoxGeometry.
    const x0 = -cx,
      x1 = cx,
      y0 = -cy,
      y1 = cy,
      quad = (a: number[], b: number[], c: number[], d: number[], n: Vector3, surface: Surface) => {
        const [A, B, C, D] = [a, b, c, d].map((p) => new Vector3(p[0], p[1], p[2]));
        out.push(outward([A, B, D], n, surface), outward([B, C, D], n, surface));
      };
    quad([x1, y1, hz], [x1, y1, -hz], [x1, y0, -hz], [x1, y0, hz], new Vector3(1, 0, 0), edgeSurface(shape.banded.D, !!shape.accent?.includes('D')));
    quad([x0, y1, -hz], [x0, y1, hz], [x0, y0, hz], [x0, y0, -hz], new Vector3(-1, 0, 0), edgeSurface(shape.banded.C, !!shape.accent?.includes('C')));
    quad([x0, y1, -hz], [x1, y1, -hz], [x1, y1, hz], [x0, y1, hz], new Vector3(0, 1, 0), edgeSurface(shape.banded.B, !!shape.accent?.includes('B')));
    quad([x0, y0, hz], [x1, y0, hz], [x1, y0, -hz], [x0, y0, -hz], new Vector3(0, -1, 0), edgeSurface(shape.banded.A, !!shape.accent?.includes('A')));
    quad([x0, y1, hz], [x1, y1, hz], [x1, y0, hz], [x0, y0, hz], new Vector3(0, 0, 1), 'FACE');
    quad([x1, y1, -hz], [x0, y1, -hz], [x0, y0, -hz], [x1, y0, -hz], new Vector3(0, 0, -1), 'FACE');
    return out;
  }
  // A contour: both faces triangulated, every side a quad. A side on the envelope takes the band of its edge,
  // a side inside the envelope is a cut.
  let ring = shape.contourMm.map(([s, t]) => new Vector2(s - cx, t - cy));
  if (ShapeUtils.isClockWise(ring)) ring = ring.reverse();
  const tris = ShapeUtils.triangulateShape(ring, []);
  for (const [a, b, c] of tris) {
    const at = (p: Vector2, z: number) => new Vector3(p.x, p.y, z);
    out.push(outward([at(ring[a], hz), at(ring[b], hz), at(ring[c], hz)], new Vector3(0, 0, 1), 'FACE'));
    out.push(outward([at(ring[c], -hz), at(ring[b], -hz), at(ring[a], -hz)], new Vector3(0, 0, -1), 'FACE'));
  }
  const near = (x: number, y: number) => Math.abs(x - y) < 0.02;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length],
      n = new Vector3(q.y - p.y, p.x - q.x, 0).normalize(),
      surface: Surface =
        near(p.x, cx) && near(q.x, cx)
          ? edgeSurface(shape.banded.D, !!shape.accent?.includes('D'))
          : near(p.x, -cx) && near(q.x, -cx)
            ? edgeSurface(shape.banded.C, !!shape.accent?.includes('C'))
            : near(p.y, cy) && near(q.y, cy)
              ? edgeSurface(shape.banded.B, !!shape.accent?.includes('B'))
              : near(p.y, -cy) && near(q.y, -cy)
                ? edgeSurface(shape.banded.A, !!shape.accent?.includes('A'))
                : 'CUT';
    out.push(outward([new Vector3(p.x, p.y, hz), new Vector3(p.x, p.y, -hz), new Vector3(q.x, q.y, -hz), new Vector3(q.x, q.y, hz)], n, surface));
  }
  return out;
}

/** Builds the buckets of r1: triangles grouped by surface, with normals, uv and feature edges (metres). */
function bucketGeometry(ps: Polygon[], uv: (v: Vector3, n: Vector3) => [number, number], grainAxis: string | null): BufferGeometry {
  const buckets = (Object.keys(SURFACE_INDEX) as Surface[]).map(() => ({ position: [] as number[], normal: [] as number[], uv: [] as number[], triangles: 0 }));
  for (const p of ps) {
    const bucket = buckets[SURFACE_INDEX[p.surface]];
    for (let i = 1; i < p.v.length - 1; i++) {
      bucket.triangles++;
      for (const v of [p.v[0], p.v[i], p.v[i + 1]]) {
        bucket.position.push(v.x / 1000, v.y / 1000, v.z / 1000);
        bucket.normal.push(p.n.x, p.n.y, p.n.z);
        bucket.uv.push(...uv(v, p.n));
      }
    }
  }
  const g = new BufferGeometry(),
    position: number[] = [],
    normal: number[] = [],
    uvs: number[] = [];
  let start = 0;
  buckets.forEach((b, i) => {
    position.push(...b.position);
    normal.push(...b.normal);
    uvs.push(...b.uv);
    if (b.triangles) g.addGroup(start, b.triangles * 3, i);
    start += b.triangles * 3;
  });
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData.featureEdges = featureEdges(ps);
  g.userData.surfaceGroups = Object.fromEntries(Object.entries(SURFACE_INDEX).map(([name, index]) => [name, { materialIndex: index, triangles: buckets[index].triangles }]));
  g.userData.uvPolicy = { id: 'MEASURED_LOCAL_MM_V1', visualRepeatMm: VISUAL_REPEAT_MM, physicalScaleConfirmed: false, grainAxis };
  return g;
}

/** Geometry of a contour or turned part, in the axes of the part. */
export function panelGeometry(shape: PanelShape): BufferGeometry {
  return bucketGeometry(polygons(shape), uvAlong(shape.grain ?? null), shape.grain ?? null);
}

// ---------------------------------------------------------------- the box of r1

/** Faces of a box by the signed axis of their normal (`+x`…`-z`), as the data of r1 names them. */
export type SurfaceMap = Record<string, { kind: 'FACE' } | { kind: 'EDGE'; intent: string }>;
export interface TechnicalBox {
  /** Size along x, y, z of the world (mm). */
  width: number;
  height: number;
  thickness: number;
  surfaceMap: SurfaceMap;
  grainAxis?: string | null;
}

function signedAxis(n: Vector3): string {
  const a = (['x', 'y', 'z'] as const).slice().sort((x, y) => Math.abs(n[y]) - Math.abs(n[x]))[0];
  return (n[a] >= 0 ? '+' : '-') + a;
}

/** Triangles of a geometry as polygons of r1 (`polygons`): mm, normal from the vertices. */
function trianglesOf(geometry: BufferGeometry): { v: Vector3[]; n: Vector3 }[] {
  const g = geometry.index ? geometry.toNonIndexed() : geometry,
    a = g.attributes.position,
    out: { v: Vector3[]; n: Vector3 }[] = [];
  for (let i = 0; i < a.count; i += 3) {
    const vs = [0, 1, 2].map((j) => new Vector3().fromBufferAttribute(a, i + j)),
      n = vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0])).normalize();
    if (n.lengthSq() > 0.5) out.push({ v: vs, n });
  }
  if (g !== geometry) g.dispose();
  return out;
}

/** `technicalGeometry` of r1 for a box without cut-outs: the same triangles, groups, uv and feature edges. */
export function technicalGeometry(data: TechnicalBox): BufferGeometry {
  const box = new BoxGeometry(data.width, data.height, data.thickness),
    half = { x: data.width / 2, y: data.height / 2, z: data.thickness / 2 },
    ps: Polygon[] = trianglesOf(box).map(({ v, n }) => {
      const axis = signedAxis(n),
        name = axis[1] as 'x' | 'y' | 'z',
        boundary = v.every((p) => Math.abs(Math.abs(p[name]) - half[name]) < 0.02) ? axis : null,
        meta = boundary ? data.surfaceMap[boundary] : undefined,
        surface: Surface = !boundary ? 'CUT' : meta?.kind === 'FACE' ? 'FACE' : meta?.kind === 'EDGE' && meta.intent && meta.intent !== 'NONE' ? (meta.intent === 'ACCENT' ? 'EDGE_ACCENT' : 'EDGE_BANDED') : 'EDGE_BARE';
      return { v, n, surface };
    });
  box.dispose();
  return bucketGeometry(ps, uvAlong(String(data.grainAxis || '').toLowerCase() || null), data.grainAxis || null);
}
