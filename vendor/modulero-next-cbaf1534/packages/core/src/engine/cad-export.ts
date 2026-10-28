// CAD exports of the graph (task PROD-3, stage 2 of «Производственные данные», MOD-DEC-252): STEP (AP242, and AP214
// for compatibility) and OBJ + MTL. Both are read from the graph only, like the 3D view and the drawings: a part is
// a solid of its finished size E (MOD-DEC-169) in its placement, in product axes and millimetres
// (`X_RIGHT_Y_BACK_Z_UP_MM`), with the id and the name of the graph.
//
// STEP is a boundary representation (B-rep): the notches and the face grooves of a part are cut from its box, the
// drilled holes are cut as cylinders with their own faces. A cut that would not give a valid solid is not made and
// is listed with its reason (`omitted`): a hole that meets another hole or comes closer than the comparison
// threshold 191 to another face (the cam housing and its bolt hole), a hole of a part with a contour, an edge groove.
// OBJ is a mesh for viewing: the same bodies with their notches and grooves, without the holes.
//
// The exports are pure functions of the graph: the same graph gives the same bytes.
import type { Graph, Groove, Hole, Notch, Part, Vec3 } from './contract.js';
import { cadExport, type StepSchema } from './policy/cad-export.js';
import { tolerance } from './policy/index.js';

/** A cut of the graph that is not in the files, with the reason in Russian. */
export interface CadOmission {
  partId: string;
  operationId: string;
  op: 'HOLE' | 'GROOVE' | 'NOTCH';
  reason: string;
}

/** A drilled hole cut from a body: a cylinder from its entry along its inward axis, in part axes. */
export interface CadHole {
  id: string;
  entry: Vec3;
  axis: Vec3;
  radius: number;
  depth: number;
  through: boolean;
  /** Faces of the body the hole enters and, for a through hole, leaves. */
  entryFace: number;
  exitFace: number | null;
}

/** A planar face of a body in part axes: the outer loop and the inner loops, counter-clockwise about the normal. */
export interface CadFace {
  normal: Vec3;
  outer: number[];
  inner: number[][];
  /** Convex pieces of the face (the cells of the grid or the triangles of a contour) for the mesh. */
  tiles: number[][];
}

export interface CadBody {
  part: Part;
  /** Vertices in part axes: s along u, t along v, r along n, from the origin of the placement. */
  vertices: Vec3[];
  faces: CadFace[];
  holes: CadHole[];
  /** Ids of the notches and grooves cut from the box. */
  cuts: string[];
}

export interface CadModel {
  bodies: CadBody[];
  omitted: CadOmission[];
}

const CLEAR = tolerance.constants.compare.value;
/** Two computed coordinates closer than this are one plane of the grid (rounding of the arithmetic, not a tolerance). */
const SAME = 1e-6;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (k: number, sign = 1): Vec3 => [k === 0 ? sign : 0, k === 1 ? sign : 0, k === 2 ? sign : 0];

// ---------------------------------------------------------------- cuts of a part as boxes in part axes

interface Box {
  id: string;
  op: 'GROOVE' | 'NOTCH';
  lo: Vec3;
  hi: Vec3;
}

function grooveBox(q: Groove, size: Vec3): Box | null {
  if (!q.face || !(q.grooveWidthMm > 0 && q.grooveDepthMm > 0)) return null;
  const [a, b] = [Math.min(q.startMm, q.endMm), Math.max(q.startMm, q.endMm)],
    [c, d] = [q.offsetMm - q.grooveWidthMm / 2, q.offsetMm + q.grooveWidthMm / 2],
    n: [number, number] = q.face === 'N_POS' ? [size[2] - q.grooveDepthMm, size[2]] : [0, q.grooveDepthMm];
  return q.along === 'LENGTH' ? { id: q.id, op: 'GROOVE', lo: [a, c, n[0]], hi: [b, d, n[1]] } : { id: q.id, op: 'GROOVE', lo: [c, a, n[0]], hi: [d, b, n[1]] };
}

const notchBox = (c: Notch): Box => ({ id: c.id, op: 'NOTCH', lo: [c.uRangeMm[0], c.vRangeMm[0], c.nRangeMm[0]], hi: [c.uRangeMm[1], c.vRangeMm[1], c.nRangeMm[1]] });

/** The box clipped to the part; null when nothing of it is inside. */
function clip(b: Box, size: Vec3): Box | null {
  const lo = b.lo.map((x, i) => Math.max(0, Math.min(x, size[i]))) as Vec3,
    hi = b.hi.map((x, i) => Math.max(0, Math.min(x, size[i]))) as Vec3;
  return lo.every((x, i) => hi[i] - x > SAME) ? { ...b, lo, hi } : null;
}

// ---------------------------------------------------------------- the grid: a box minus axis-aligned boxes

interface Grid {
  size: Vec3;
  coords: [number[], number[], number[]];
  /** Cells per axis. */
  n: [number, number, number];
  filled: Uint8Array;
}

function planes(size: number, cuts: Box[], k: number): number[] {
  const all = [0, size, ...cuts.flatMap((b) => [b.lo[k], b.hi[k]])].sort((a, b) => a - b),
    out: number[] = [];
  for (const x of all) if (!out.length || x - out[out.length - 1] > SAME) out.push(x);
  out[out.length - 1] = size;
  return out;
}

function gridOf(size: Vec3, cuts: Box[]): Grid {
  const coords: [number[], number[], number[]] = [planes(size[0], cuts, 0), planes(size[1], cuts, 1), planes(size[2], cuts, 2)],
    n: [number, number, number] = [coords[0].length - 1, coords[1].length - 1, coords[2].length - 1],
    filled = new Uint8Array(n[0] * n[1] * n[2]);
  for (let k = 0; k < n[2]; k++)
    for (let j = 0; j < n[1]; j++)
      for (let i = 0; i < n[0]; i++) {
        const c: Vec3 = [(coords[0][i] + coords[0][i + 1]) / 2, (coords[1][j] + coords[1][j + 1]) / 2, (coords[2][k] + coords[2][k + 1]) / 2];
        filled[i + n[0] * (j + n[1] * k)] = cuts.some((b) => c.every((x, a) => x > b.lo[a] && x < b.hi[a])) ? 0 : 1;
      }
  return { size, coords, n, filled };
}

const cellAt = (g: Grid, c: Vec3): boolean => c.every((x, a) => x >= 0 && x < g.n[a]) && g.filled[c[0] + g.n[0] * (c[1] + g.n[1] * c[2])] === 1;

/** The filled cells are one piece and every empty cell reaches the outside: one closed shell, no voids. */
function oneShell(g: Grid): boolean {
  const total = g.n[0] * g.n[1] * g.n[2],
    idx = (c: Vec3) => c[0] + g.n[0] * (c[1] + g.n[1] * c[2]),
    at = (i: number): Vec3 => [i % g.n[0], Math.floor(i / g.n[0]) % g.n[1], Math.floor(i / (g.n[0] * g.n[1]))],
    flood = (want: number, start: number[]) => {
      const seen = new Uint8Array(total),
        stack = [...start];
      for (const s of start) seen[s] = 1;
      while (stack.length) {
        const c = at(stack.pop()!);
        for (let a = 0; a < 3; a++)
          for (const d of [-1, 1]) {
            const m: Vec3 = [...c];
            m[a] += d;
            if (m[a] < 0 || m[a] >= g.n[a]) continue;
            const i = idx(m);
            if (!seen[i] && g.filled[i] === want) {
              seen[i] = 1;
              stack.push(i);
            }
          }
      }
      return seen;
    };
  const first = g.filled.indexOf(1);
  if (first < 0) return false;
  const solid = flood(1, [first]),
    border: number[] = [];
  for (let i = 0; i < total; i++) {
    if (g.filled[i] === 1 && !solid[i]) return false;
    const c = at(i);
    if (g.filled[i] === 0 && c.some((x, a) => x === 0 || x === g.n[a] - 1)) border.push(i);
  }
  const outside = flood(0, border);
  for (let i = 0; i < total; i++) if (g.filled[i] === 0 && !outside[i]) return false;
  return true;
}

interface GridFaces {
  vertices: Vec3[];
  faces: CadFace[];
  /** `axis|sign|plane|a|b` of a boundary cell → its face. */
  cellFace: Map<string, number>;
}

/**
 * The boundary of the filled cells as planar faces: on each plane and side, every connected region of boundary
 * cells is one face. Its loops keep every grid vertex on them, so two faces meeting at an edge share the same
 * edges of the grid. Null when a region touches itself at a vertex (no simple loops).
 */
function gridFaces(g: Grid): GridFaces | null {
  const vertices: Vec3[] = [],
    vIndex = new Map<string, number>(),
    vertex = (c: Vec3) => {
      const key = c.join(',');
      let i = vIndex.get(key);
      if (i === undefined) {
        i = vertices.length;
        vertices.push([g.coords[0][c[0]], g.coords[1][c[1]], g.coords[2][c[2]]]);
        vIndex.set(key, i);
      }
      return i;
    },
    faces: CadFace[] = [],
    cellFace = new Map<string, number>();
  for (let d = 0; d < 3; d++) {
    const d1 = (d + 1) % 3,
      d2 = (d + 2) % 3;
    for (const sign of [1, -1] as const)
      for (let p = 0; p <= g.n[d]; p++) {
        // Boundary cells on the plane p of the axis d facing `sign`: the cell inside is filled, the one outside is not.
        const cells = new Set<string>();
        for (let a = 0; a < g.n[d1]; a++)
          for (let b = 0; b < g.n[d2]; b++) {
            const inside: Vec3 = [0, 0, 0],
              outside: Vec3 = [0, 0, 0];
            inside[d] = sign > 0 ? p - 1 : p;
            outside[d] = sign > 0 ? p : p - 1;
            inside[d1] = outside[d1] = a;
            inside[d2] = outside[d2] = b;
            if (cellAt(g, inside) && !cellAt(g, outside)) cells.add(`${a},${b}`);
          }
        const seen = new Set<string>();
        for (const start of cells) {
          if (seen.has(start)) continue;
          const region: [number, number][] = [],
            stack = [start];
          seen.add(start);
          while (stack.length) {
            const [a, b] = stack.pop()!.split(',').map(Number);
            region.push([a, b]);
            for (const [da, db] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]) {
              const k = `${a + da},${b + db}`;
              if (cells.has(k) && !seen.has(k)) {
                seen.add(k);
                stack.push(k);
              }
            }
          }
          region.sort((x, y) => x[1] - y[1] || x[0] - y[0]);
          const at3 = (a: number, b: number) => {
              const c: Vec3 = [0, 0, 0];
              c[d] = p;
              c[d1] = a;
              c[d2] = b;
              return vertex(c);
            },
            // Directed edges of the cells, counter-clockwise in (d1, d2); an edge and its reverse cancel.
            edges = new Map<string, [number, number]>(),
            tiles: number[][] = [];
          for (const [a, b] of region) {
            const q = [at3(a, b), at3(a + 1, b), at3(a + 1, b + 1), at3(a, b + 1)];
            tiles.push(sign > 0 ? q : [...q].reverse());
            for (let i = 0; i < 4; i++) {
              const from = q[i],
                to = q[(i + 1) % 4];
              if (edges.has(`${to}>${from}`)) edges.delete(`${to}>${from}`);
              else edges.set(`${from}>${to}`, [from, to]);
            }
          }
          const next = new Map<number, number>();
          for (const [from, to] of edges.values()) {
            if (next.has(from)) return null;
            next.set(from, to);
          }
          const loops: number[][] = [];
          while (next.size) {
            const [s] = next.keys(),
              loop: number[] = [];
            let v = s;
            do {
              loop.push(v);
              const w = next.get(v)!;
              next.delete(v);
              v = w;
            } while (v !== s);
            loops.push(sign > 0 ? loop : loop.reverse());
          }
          // The outer loop has the largest area; the others bound holes of the region.
          const area = (loop: number[]) => {
            let s = 0;
            for (let i = 0; i < loop.length; i++) {
              const a = vertices[loop[i]],
                b = vertices[loop[(i + 1) % loop.length]];
              s += a[d1] * b[d2] - b[d1] * a[d2];
            }
            return Math.abs(s);
          };
          loops.sort((x, y) => area(y) - area(x));
          const face = faces.length;
          faces.push({ normal: unit(d, sign), outer: loops[0], inner: loops.slice(1), tiles });
          for (const [a, b] of region) cellFace.set(`${d}|${sign}|${p}|${a}|${b}`, face);
        }
      }
  }
  return { vertices, faces, cellFace };
}

/** Every edge of the faces is used once in each direction: a closed, manifold shell. */
function closedShell(faces: CadFace[]): boolean {
  const count = new Map<string, number>();
  for (const f of faces)
    for (const loop of [f.outer, ...f.inner])
      for (let i = 0; i < loop.length; i++) {
        const k = `${loop[i]}>${loop[(i + 1) % loop.length]}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      }
  for (const [k, c] of count) {
    const [a, b] = k.split('>');
    if (c !== 1 || count.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

// ---------------------------------------------------------------- holes

/** Interval [lo, hi] of cell indices on an axis that an open range of coordinates meets; null outside the part. */
function cellRange(g: Grid, k: number, lo: number, hi: number): [number, number] | null {
  if (lo < -SAME || hi > g.size[k] + SAME) return null;
  const c = g.coords[k];
  let a = 0;
  while (a < g.n[k] - 1 && c[a + 1] <= lo + SAME) a++;
  let b = g.n[k] - 1;
  while (b > 0 && c[b] >= hi - SAME) b--;
  return [a, b];
}

function allFilled(g: Grid, lo: Vec3, hi: Vec3): boolean {
  const r = [0, 1, 2].map((k) => cellRange(g, k, lo[k], hi[k]));
  if (r.some((x) => !x)) return false;
  for (let i = r[0]![0]; i <= r[0]![1]; i++) for (let j = r[1]![0]; j <= r[1]![1]; j++) for (let k = r[2]![0]; k <= r[2]![1]; k++) if (!cellAt(g, [i, j, k])) return false;
  return true;
}

/** The one face of the plane that holds the whole square around a point on it; null when there is none. */
function faceUnder(g: Grid, gf: GridFaces, k: number, sign: 1 | -1, at: Vec3, half: number): number | null {
  const p = g.coords[k].findIndex((x) => Math.abs(x - at[k]) <= SAME);
  if (p < 0) return null;
  const d1 = (k + 1) % 3,
    d2 = (k + 2) % 3,
    ra = cellRange(g, d1, at[d1] - half, at[d1] + half),
    rb = cellRange(g, d2, at[d2] - half, at[d2] + half);
  if (!ra || !rb) return null;
  let face: number | null = null;
  for (let a = ra[0]; a <= ra[1]; a++)
    for (let b = rb[0]; b <= rb[1]; b++) {
      const f = gf.cellFace.get(`${k}|${sign}|${p}|${a}|${b}`);
      if (f === undefined || (face !== null && f !== face)) return null;
      face = f;
    }
  return face;
}

/** Shortest distance between the segments p0–p1 and q0–q1. */
function segmentDistance(p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): number {
  const d1 = sub(p1, p0),
    d2 = sub(q1, q0),
    r = sub(p0, q0),
    a = dot(d1, d1),
    e = dot(d2, d2),
    f = dot(d2, r);
  let s = 0,
    t = 0;
  if (a <= SAME && e <= SAME) return Math.sqrt(dot(r, r));
  if (a <= SAME) t = Math.min(1, Math.max(0, f / e));
  else {
    const c = dot(d1, r);
    if (e <= SAME) s = Math.min(1, Math.max(0, -c / a));
    else {
      const b = dot(d1, d2),
        den = a * e - b * b;
      s = den > SAME ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const x = sub([p0[0] + d1[0] * s, p0[1] + d1[1] * s, p0[2] + d1[2] * s], [q0[0] + d2[0] * t, q0[1] + d2[1] * t, q0[2] + d2[2] * t]);
  return Math.sqrt(dot(x, x));
}

function cutHoles(part: Part, holes: Hole[], g: Grid, gf: GridFaces, omitted: CadOmission[]): CadHole[] {
  const pl = part.placement,
    out: CadHole[] = [],
    skip = (h: Hole, reason: string) => omitted.push({ partId: part.id, operationId: h.id, op: 'HOLE', reason });
  for (const h of holes) {
    const r = h.diameterMm / 2,
      axisP: Vec3 = [dot(h.inwardNormal, pl.uAxis), dot(h.inwardNormal, pl.vAxis), dot(h.inwardNormal, pl.nAxis)],
      k = axisP.findIndex((x) => Math.abs(Math.abs(x) - 1) <= SAME);
    if (!(r > 0)) {
      skip(h, 'нет диаметра');
      continue;
    }
    if (k < 0) {
      skip(h, 'ось отверстия не вдоль осей детали');
      continue;
    }
    const s = axisP[k] > 0 ? 1 : -1,
      axis = unit(k, s),
      d = sub(h.entryMm, pl.originMm),
      entry: Vec3 = [dot(d, pl.uAxis), dot(d, pl.vAxis), dot(d, pl.nAxis)],
      through = h.through || h.depthMm === null,
      depth = through ? (s > 0 ? g.size[k] - entry[k] : entry[k]) : h.depthMm!;
    if (!(depth > SAME)) {
      skip(h, 'нет глубины');
      continue;
    }
    const entryFace = faceUnder(g, gf, k, s > 0 ? -1 : 1, entry, r + CLEAR);
    if (entryFace === null) {
      skip(h, 'вход не на грани детали или ближе 0,1 мм к её краю');
      continue;
    }
    const bottom: Vec3 = [entry[0] + axis[0] * depth, entry[1] + axis[1] * depth, entry[2] + axis[2] * depth],
      lo: Vec3 = [0, 0, 0],
      hi: Vec3 = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      if (a === k) {
        const [x, y] = [entry[a], bottom[a] + (through ? 0 : s * CLEAR)];
        [lo[a], hi[a]] = [Math.min(x, y), Math.max(x, y)];
      } else [lo[a], hi[a]] = [entry[a] - r - CLEAR, entry[a] + r + CLEAR];
    }
    if (!allFilled(g, lo, hi)) {
      skip(h, through ? 'сквозное отверстие проходит не только через материал детали' : 'отверстие выходит из детали или ближе 0,1 мм к её грани');
      continue;
    }
    const exitFace = through ? faceUnder(g, gf, k, s > 0 ? 1 : -1, bottom, r + CLEAR) : null;
    if (through && exitFace === null) {
      skip(h, 'выход сквозного отверстия не на грани детали');
      continue;
    }
    const meets = out.find((o) => {
      const end: Vec3 = [o.entry[0] + o.axis[0] * o.depth, o.entry[1] + o.axis[1] * o.depth, o.entry[2] + o.axis[2] * o.depth];
      return segmentDistance(entry, bottom, o.entry, end) < r + o.radius + CLEAR;
    });
    if (meets) {
      skip(h, `пересекается с отверстием ${meets.id}`);
      continue;
    }
    out.push({ id: h.id, entry, axis, radius: r, depth, through, entryFace, exitFace });
  }
  return out;
}

// ---------------------------------------------------------------- bodies

/** A part with a contour: the prism of the polygon, without cuts (stage 2). */
function contourBody(part: Part, contour: [number, number][], T: number): CadBody {
  let poly = contour.map(([s, t]) => [s, t] as [number, number]);
  let area = 0;
  for (let i = 0; i < poly.length; i++) area += poly[i][0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * poly[i][1];
  if (area < 0) poly = poly.reverse();
  const m = poly.length,
    vertices: Vec3[] = [...poly.map(([s, t]): Vec3 => [s, t, 0]), ...poly.map(([s, t]): Vec3 => [s, t, T])],
    bottom = [...Array(m).keys()].reverse(),
    top = [...Array(m).keys()].map((i) => i + m),
    tris = earClip(poly),
    faces: CadFace[] = [
      { normal: [0, 0, -1], outer: bottom, inner: [], tiles: tris.map(([a, b, c]) => [c, b, a]) },
      { normal: [0, 0, 1], outer: top, inner: [], tiles: tris.map(([a, b, c]) => [a + m, b + m, c + m]) },
    ];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m,
      [ds, dt] = [poly[j][0] - poly[i][0], poly[j][1] - poly[i][1]],
      len = Math.hypot(ds, dt),
      q = [i, j, j + m, i + m];
    faces.push({ normal: [dt / len, -ds / len, 0], outer: q, inner: [], tiles: [q] });
  }
  return { part, vertices, faces, holes: [], cuts: [] };
}

/** Triangles of a simple counter-clockwise polygon (ear clipping). */
function earClip(poly: [number, number][]): [number, number, number][] {
  const idx = [...poly.keys()],
    out: [number, number, number][] = [],
    cr = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let guard = 0;
  while (idx.length > 3 && guard++ < poly.length * poly.length) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const [a, b, c] = [idx[(i + idx.length - 1) % idx.length], idx[i], idx[(i + 1) % idx.length]];
      if (cr(poly[a], poly[b], poly[c]) <= 0) continue;
      const inside = idx.some((p) => p !== a && p !== b && p !== c && cr(poly[a], poly[b], poly[p]) >= 0 && cr(poly[b], poly[c], poly[p]) >= 0 && cr(poly[c], poly[a], poly[p]) >= 0);
      if (inside) continue;
      out.push([a, b, c]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

function bodyOf(part: Part, ops: Graph['operations'], omitted: CadOmission[]): CadBody {
  const size: Vec3 = [part.finishedWithEdge.lengthMm, part.finishedWithEdge.widthMm, part.finishedWithEdge.panelThicknessMm],
    own = ops.filter((o) => o.partId === part.id),
    holes = own.filter((o): o is Hole => o.op === 'HOLE' && o.layer === 'DRILL'),
    grooves = own.filter((o): o is Groove => o.op === 'GROOVE'),
    notches = own.filter((o): o is Notch => o.op === 'NOTCH');
  if (part.contourMm) {
    for (const o of [...holes, ...grooves, ...notches]) omitted.push({ partId: part.id, operationId: o.id, op: o.op, reason: 'деталь с контуром: вырезы на ней в этом этапе не строятся' });
    return contourBody(part, part.contourMm, size[2]);
  }
  const boxes: Box[] = [];
  for (const q of grooves) {
    const b = grooveBox(q, size);
    if (!b) omitted.push({ partId: part.id, operationId: q.id, op: 'GROOVE', reason: 'паз не на пласти детали' });
    else boxes.push(b);
  }
  boxes.push(...notches.map(notchBox));
  const inside = boxes.map((b) => clip(b, size)).filter((b): b is Box => b !== null);
  let grid = gridOf(size, inside),
    faces = oneShell(grid) ? gridFaces(grid) : null;
  if (!faces || !closedShell(faces.faces)) {
    for (const b of inside) omitted.push({ partId: part.id, operationId: b.id, op: b.op, reason: 'вырезы вместе не дают одного замкнутого тела' });
    grid = gridOf(size, []);
    faces = gridFaces(grid)!;
    inside.length = 0;
  }
  // The circles of the holes are not polygon loops: the STEP writer adds them to the faces the holes name.
  return { part, vertices: faces.vertices, faces: faces.faces, holes: cutHoles(part, holes, grid, faces, omitted), cuts: inside.map((b) => b.id) };
}

/** Bodies of every part of the graph in its order, and the cuts that are not in the files. */
export function cadModelOf(g: Pick<Graph, 'parts' | 'operations'>): CadModel {
  const omitted: CadOmission[] = [];
  return { bodies: g.parts.map((p) => bodyOf(p, g.operations, omitted)), omitted };
}

// ---------------------------------------------------------------- product axes

/** Part axes → product axes; `mirrored` when u × v = −n (a left part), which turns the loops round. */
function frame(part: Part) {
  const { originMm: o, uAxis: u, vAxis: v, nAxis: n } = part.placement;
  return {
    point: (p: Vec3): Vec3 => [o[0] + u[0] * p[0] + v[0] * p[1] + n[0] * p[2], o[1] + u[1] * p[0] + v[1] * p[1] + n[1] * p[2], o[2] + u[2] * p[0] + v[2] * p[1] + n[2] * p[2]],
    dir: (d: Vec3): Vec3 => [u[0] * d[0] + v[0] * d[1] + n[0] * d[2], u[1] * d[0] + v[1] * d[1] + n[1] * d[2], u[2] * d[0] + v[2] * d[1] + n[2] * d[2]],
    mirrored: dot(cross(u, v), n) < 0,
  };
}

/** A number of the files: millimetres rounded to 10⁻⁶, no negative zero; STEP reals keep their point. */
function fmt(x: number): string {
  const r = Math.round(x * 1e6) / 1e6;
  return String(r === 0 ? 0 : r);
}
const real = (x: number) => {
  const s = fmt(x);
  return s.includes('.') ? s : s + '.';
};

// ---------------------------------------------------------------- STEP

/** A string of ISO 10303-21: apostrophes and backslashes doubled, everything outside printable ASCII as \X2\ or \X4\. */
export function stepString(s: string): string {
  let out = "'",
    wide = '';
  const flush = () => {
    if (wide) out += `\\X2\\${wide}\\X0\\`;
    wide = '';
  };
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c <= 0x7e) {
      flush();
      out += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch;
    } else if (c > 0xffff) {
      flush();
      out += `\\X4\\${c.toString(16).toUpperCase().padStart(8, '0')}\\X0\\`;
    } else wide += c.toString(16).toUpperCase().padStart(4, '0');
  }
  flush();
  return out + "'";
}

class StepData {
  lines: string[] = [];
  private cache = new Map<string, number>();
  add(entity: string): number {
    this.lines.push(`#${this.lines.length + 1}=${entity};`);
    return this.lines.length;
  }
  /** One entity for equal text (points, directions): the file stays small and the same for the same graph. */
  shared(entity: string): number {
    let id = this.cache.get(entity);
    if (id === undefined) this.cache.set(entity, (id = this.add(entity)));
    return id;
  }
  point = (p: Vec3) => this.shared(`CARTESIAN_POINT('',(${p.map(real).join(',')}))`);
  direction = (d: Vec3) => {
    const l = Math.sqrt(dot(d, d));
    return this.shared(`DIRECTION('',(${d.map((x) => real(x / l)).join(',')}))`);
  };
  axis = (at: Vec3, z: Vec3, x: Vec3) => this.add(`AXIS2_PLACEMENT_3D('',#${this.point(at)},#${this.direction(z)},#${this.direction(x)})`);
}

/** Any direction square to `a`. */
function across(a: Vec3): Vec3 {
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(a[i]) < Math.abs(a[m]) ? i : m), 0),
    c = cross(a, unit(k));
  const l = Math.sqrt(dot(c, c));
  return [c[0] / l, c[1] / l, c[2] / l];
}

/** The solid of one body in product axes: MANIFOLD_SOLID_BREP of planar faces and the faces of its holes. */
function stepSolid(w: StepData, body: CadBody): number {
  const f = frame(body.part),
    points = body.vertices.map(f.point),
    vertexIds = new Map<number, number>(),
    vertex = (i: number) => {
      let id = vertexIds.get(i);
      if (id === undefined) vertexIds.set(i, (id = w.add(`VERTEX_POINT('',#${w.point(points[i])})`)));
      return id;
    },
    edges = new Map<string, number>(),
    oriented = (a: number, b: number) => {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      let id = edges.get(`${lo}>${hi}`);
      if (id === undefined) {
        const d = sub(points[hi], points[lo]),
          len = Math.sqrt(dot(d, d)),
          line = w.add(`LINE('',#${w.point(points[lo])},#${w.add(`VECTOR('',#${w.direction(d)},${real(len)})`)})`);
        edges.set(`${lo}>${hi}`, (id = w.add(`EDGE_CURVE('',#${vertex(lo)},#${vertex(hi)},#${line},.T.)`)));
      }
      return w.add(`ORIENTED_EDGE('',*,*,#${id},${a === lo ? '.T.' : '.F.'})`);
    },
    loop = (l: number[]) => {
      const seq = f.mirrored ? [...l].reverse() : l;
      return w.add(`EDGE_LOOP('',(${seq.map((v, i) => '#' + oriented(v, seq[(i + 1) % seq.length])).join(',')}))`);
    },
    // Circles of the holes: each has its vertex and its closed edge, counter-clockwise about the inward axis.
    circle = (center: Vec3, a: Vec3, ref: Vec3, r: number) => {
      const v = w.add(`VERTEX_POINT('',#${w.point([center[0] + ref[0] * r, center[1] + ref[1] * r, center[2] + ref[2] * r])})`),
        c = w.add(`CIRCLE('',#${w.axis(center, a, ref)},${real(r)})`);
      return { v, edge: w.add(`EDGE_CURVE('',#${v},#${v},#${c},.T.)`) };
    },
    extraBounds = new Map<number, number[]>(),
    holeFaces: number[] = [];
  for (const h of body.holes) {
    const a = f.dir(h.axis),
      ref = across(a),
      e0 = f.point(h.entry),
      e1: Vec3 = [e0[0] + a[0] * h.depth, e0[1] + a[1] * h.depth, e0[2] + a[2] * h.depth],
      top = circle(e0, a, ref, h.radius),
      end = circle(e1, a, ref, h.radius),
      seam = w.add(`EDGE_CURVE('',#${top.v},#${end.v},#${w.add(`LINE('',#${w.point([e0[0] + ref[0] * h.radius, e0[1] + ref[1] * h.radius, e0[2] + ref[2] * h.radius])},#${w.add(`VECTOR('',#${w.direction(a)},${real(h.depth)})`)})`)},.T.)`),
      oe = (edge: number, sense: boolean) => w.add(`ORIENTED_EDGE('',*,*,#${edge},${sense ? '.T.' : '.F.'})`),
      bound = (edge: number, sense: boolean) => w.add(`FACE_BOUND('',#${w.add(`EDGE_LOOP('',(#${oe(edge, sense)}))`)},.T.)`);
    // Entry face: the circle runs clockwise about its outward normal (−a), as an inner loop must.
    extraBounds.set(h.entryFace, [...(extraBounds.get(h.entryFace) ?? []), bound(top.edge, true)]);
    // The wall faces the axis (same_sense .F.); its loop: down the seam, along the bottom circle, up, back.
    const wall = w.add(`EDGE_LOOP('',(#${oe(seam, true)},#${oe(end.edge, true)},#${oe(seam, false)},#${oe(top.edge, false)}))`);
    holeFaces.push(w.add(`ADVANCED_FACE('',(#${w.add(`FACE_OUTER_BOUND('',#${wall},.T.)`)}),#${w.add(`CYLINDRICAL_SURFACE('',#${w.axis(e0, a, ref)},${real(h.radius)})`)},.F.)`));
    if (h.exitFace !== null) extraBounds.set(h.exitFace, [...(extraBounds.get(h.exitFace) ?? []), bound(end.edge, false)]);
    else {
      const floor = w.add(`EDGE_LOOP('',(#${oe(end.edge, false)}))`);
      holeFaces.push(w.add(`ADVANCED_FACE('',(#${w.add(`FACE_OUTER_BOUND('',#${floor},.T.)`)}),#${w.add(`PLANE('',#${w.axis(e1, [-a[0], -a[1], -a[2]], ref)})`)},.T.)`));
    }
  }
  const faces = body.faces.map((face, i) => {
    const n = f.dir(face.normal),
      p0 = points[face.outer[0]],
      p1 = points[face.outer[1]],
      bounds = [w.add(`FACE_OUTER_BOUND('',#${loop(face.outer)},.T.)`), ...face.inner.map((l) => w.add(`FACE_BOUND('',#${loop(l)},.T.)`)), ...(extraBounds.get(i) ?? [])];
    return w.add(`ADVANCED_FACE('',(${bounds.map((b) => '#' + b).join(',')}),#${w.add(`PLANE('',#${w.axis(p0, n, sub(p1, p0))})`)},.T.)`);
  });
  const shell = w.add(`CLOSED_SHELL('',(${[...faces, ...holeFaces].map((x) => '#' + x).join(',')}))`);
  return w.add(`MANIFOLD_SOLID_BREP(${stepString(body.part.id)},#${shell})`);
}

export interface CadExportOptions {
  /** Name of the product in the files, e.g. «Modulero · шкаф распашной». */
  title: string;
  /** The bodies, when already built (the STEP of both schemas and the OBJ of one graph share them). */
  model?: CadModel;
}

const QUALIFICATION_RU = { PRODUCTION: 'ДЛЯ ПРОИЗВОДСТВА', NOT_FOR_PRODUCTION: 'ЧЕРНОВИК · НЕ ДЛЯ ПРОИЗВОДСТВА' } as const;

/** Lines that every CAD file of the graph carries: what it is, from which revision, and what is not in it. */
function about(g: Graph, model: CadModel, title: string): string[] {
  const holes = model.bodies.reduce((s, b) => s + b.holes.length, 0),
    skipped = (op: CadOmission['op']) => model.omitted.filter((o) => o.op === op).length;
  return [
    `${title} · ${QUALIFICATION_RU[g.result.exportQualification]}`,
    `Ревизия ${g.revision.projectRevisionId} · правила ${g.versions.ruleSet} · генератор ${g.versions.generator} · выгрузка ${cadExport.id} v${cadExport.version}`,
    `Оси изделия: X вправо, Y назад, Z вверх; миллиметры; деталей ${model.bodies.length}`,
    `Отверстий вырезано ${holes}; не вырезано: отверстий ${skipped('HOLE')}, пазов ${skipped('GROOVE')}, выборок ${skipped('NOTCH')}`,
  ];
}

/** STEP of the graph: one assembly, one component per part with its solid in product axes. */
export function stepOf(g: Graph, schemaId: 'AP242' | 'AP214', opts: CadExportOptions): string {
  const schema = cadExport.constants.stepSchemas.value.find((s: StepSchema) => s.id === schemaId)!,
    model = opts.model ?? cadModelOf(g),
    w = new StepData(),
    appCtx = w.add(`APPLICATION_CONTEXT('${schema.context}')`);
  w.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','${schema.protocol}',${schema.year},#${appCtx})`);
  const productCtx = w.add(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`),
    definitionCtx = w.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`),
    mm = w.add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))'),
    rad = w.add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))'),
    sr = w.add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())'),
    accuracy = w.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),#${mm},'distance_accuracy_value','')`),
    ctx = w.add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${accuracy}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${mm},#${rad},#${sr}))REPRESENTATION_CONTEXT('',''))`),
    origin = (): number => w.axis([0, 0, 0], [0, 0, 1], [1, 0, 0]),
    product = (id: string, name: string) => {
      const p = w.add(`PRODUCT(${stepString(id)},${stepString(name)},'',(#${productCtx}))`),
        def = w.add(`PRODUCT_DEFINITION('design','',#${w.add(`PRODUCT_DEFINITION_FORMATION('','',#${p})`)},#${definitionCtx})`);
      return { p, def, shape: w.add(`PRODUCT_DEFINITION_SHAPE('','',#${def})`) };
    },
    root = product(`modulero-${g.product}-${g.revision.projectRevisionId}`, opts.title),
    // The root holds one placement per component; every part is placed by the identity: its solid is in product axes.
    rootAxes = [origin(), ...model.bodies.map(origin)],
    rootRep = w.add(`SHAPE_REPRESENTATION(${stepString(opts.title)},(${rootAxes.map((a) => '#' + a).join(',')}),#${ctx})`),
    products = [root.p];
  w.add(`SHAPE_DEFINITION_REPRESENTATION(#${root.shape},#${rootRep})`);
  model.bodies.forEach((body, i) => {
    const part = product(body.part.id, body.part.name),
      partAxis = origin(),
      rep = w.add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${stepString(body.part.id)},(#${partAxis},#${stepSolid(w, body)}),#${ctx})`);
    w.add(`SHAPE_DEFINITION_REPRESENTATION(#${part.shape},#${rep})`);
    products.push(part.p);
    const usage = w.add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE(${stepString(String(i + 1))},${stepString(body.part.name)},'',#${root.def},#${part.def},$)`),
      transform = w.add(`ITEM_DEFINED_TRANSFORMATION('','',#${partAxis},#${rootAxes[i + 1]})`),
      relation = w.add(`(REPRESENTATION_RELATIONSHIP('','',#${rep},#${rootRep})REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${transform})SHAPE_REPRESENTATION_RELATIONSHIP())`);
    w.add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#${relation},#${w.add(`PRODUCT_DEFINITION_SHAPE('','',#${usage})`)})`);
  });
  w.add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${products.map((p) => '#' + p).join(',')}))`);
  return [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION((${about(g, model, opts.title).map(stepString).join(',')}),'2;1');`,
    `FILE_NAME(${stepString(`modulero-${g.product}-${schema.id.toLowerCase()}.step`)},'',('Modulero'),('Modulero'),${stepString(`modulero-next ${cadExport.id} v${cadExport.version}`)},'Modulero','');`,
    `FILE_SCHEMA(('${schema.fileSchema}'));`,
    'ENDSEC;',
    'DATA;',
    ...w.lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- OBJ + MTL

/** A name of OBJ and MTL: Latin letters, digits, `-`, `_` and `.` only (a space ends the name). */
const objName = (s: string) => s.replace(/[^A-Za-z0-9_.-]+/g, '_');

/**
 * OBJ + MTL of the graph: one object per part (its id), faces counter-clockwise seen from outside, a material per
 * decor of the graph. The holes are not in the mesh; the MTL names the decors and leaves their look to the program.
 */
export function objOf(g: Graph, opts: CadExportOptions & { mtlFile?: string }): { obj: string; mtl: string } {
  const model = opts.model ?? cadModelOf(g),
    mtlFile = opts.mtlFile ?? 'model.mtl',
    lines = [...about(g, model, opts.title).map((l) => '# ' + l), '# Отверстия в сетку OBJ не входят: они есть в STEP.', `mtllib ${mtlFile}`],
    decors = new Map<string, string>();
  let base = 1;
  for (const body of model.bodies) {
    const f = frame(body.part),
      material = objName(body.part.material.decorId || body.part.material.family);
    if (!decors.has(material)) decors.set(material, body.part.material.decorId);
    lines.push(`o ${objName(body.part.id)}`, `# ${body.part.name}`, `usemtl ${material}`);
    for (const v of body.vertices) lines.push(`v ${f.point(v).map(fmt).join(' ')}`);
    for (const face of body.faces)
      for (const tile of face.tiles) {
        const seq = f.mirrored ? [...tile].reverse() : tile;
        lines.push(`f ${seq.map((i) => i + base).join(' ')}`);
      }
    base += body.vertices.length;
  }
  const mtl = [`# ${opts.title} · материалы — декоры графа`, ...[...decors].flatMap(([name, decor]) => [`newmtl ${name}`, `# декор ${decor}`, 'illum 1', 'd 1'])];
  return { obj: lines.join('\n') + '\n', mtl: mtl.join('\n') + '\n' };
}

/** The CAD files of one graph from one set of bodies: STEP of both schemas, OBJ and its MTL; names in Latin. */
export function cadFiles(g: Graph, title: string): { name: string; content: string }[] {
  const model = cadModelOf(g),
    { obj, mtl } = objOf(g, { title, model, mtlFile: 'model.mtl' });
  return [
    { name: 'model-ap242.step', content: stepOf(g, 'AP242', { title, model }) },
    { name: 'model-ap214.step', content: stepOf(g, 'AP214', { title, model }) },
    { name: 'model.obj', content: obj },
    { name: 'model.mtl', content: mtl },
  ];
}
