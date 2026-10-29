// The BAZIS file of the graph (task PROD-5, stage 3 of «Производственные данные», MOD-DEC-250, 252): a native `.b3d`
// written by the engine, read only by BAZIS. Like STEP and OBJ, it is read from the graph only.
//
// The layout follows the files BAZIS itself opened, changed and saved in the finish07 trial (reference/bazis/samples:
// `writer800.b3d` is what the trial writer gave BAZIS, `FINISH07_800_NATIVE_SAVED.b3d` is what BAZIS saved after an
// edit; FINDINGS 741): only the records and fields of those files are written.
//
// - A part is a panel `Obj` of type 4002: its contour (finished size E, MOD-DEC-169) in its own plane, the thickness,
//   the material, the pose `Trans` (a shift and a quaternion), the edge bands `Butts` on the elements of the contour,
//   the cuts `Cuts` — a profile swept along a trajectory — for the face grooves and the notches of the graph.
// - A drilled hole is an `Obj` of type 3001 with the pose of its entry; it refers to a definition of `FurnList` (one
//   per diameter and depth) that drills along −Z of its own axes.
// - Axes of BAZIS: X to the right, Y up, Z to the front, millimetres; the graph is X right, Y back, Z up
//   (`packages/bazis/src/axes.ts`, shared with the reader).
//
// A panel cannot be mirrored in a pose; a part whose axes are mirrored (u × v = −n) is written with its u and v
// swapped. What the file cannot hold is listed with its reason (`omitted`).
import { encodeBz85, f64, flag, i32, int, record, text, bytes, SEGMENT_LINE, toBazisPoint, toBazisVector, type WriteNode, type WriteRecord } from '@modulero/bazis';
import type { EdgeSlot, Graph, Groove, Hole, Notch, Part, Vec3 } from './contract.js';
import { bazisExport } from './policy/bazis-export.js';
import { tolerance } from './policy/index.js';

/** A part or an operation of the graph that is not in the file, with the reason in Russian. */
export interface BazisOmission {
  partId: string;
  operationId: string | null;
  op: 'PART' | 'HOLE' | 'GROOVE' | 'NOTCH' | 'BEVEL';
  reason: string;
}

/** A cut of a panel: a profile in (across the trajectory, along the thickness) swept along a line of the contour plane. */
export interface BazisCut {
  operationId: string;
  name: string;
  /** Start and end of the trajectory in the axes of the panel, mm. */
  from: [number, number];
  to: [number, number];
  /** Width across the trajectory, centred on it; the range along the thickness from the face −n. */
  widthMm: number;
  depthRange: [number, number];
  /** The cut opens on the face +n of the part. */
  front: boolean;
}

export interface BazisPanel {
  part: Part;
  id: number;
  /** The u and v of the part are the y and x of the panel: the part is mirrored. */
  swapped: boolean;
  /** The contour in the axes of the panel, counter-clockwise. */
  contour: [number, number][];
  /** The band of an element of the contour by its index. */
  butts: { element: number; slot: EdgeSlot; thicknessMm: number; profileCode: string }[];
  cuts: BazisCut[];
  /** Pose in BAZIS axes. */
  position: Vec3;
  rotation: [number, number, number, number];
}

export interface BazisHole {
  hole: Hole;
  id: number;
  fastId: number;
  depthMm: number;
  /** Entry and inward axis in BAZIS axes. */
  position: Vec3;
  rotation: [number, number, number, number];
}

export interface BazisDrill {
  fastId: number;
  name: string;
  diameterMm: number;
  depthMm: number;
  through: boolean;
}

export interface BazisModel {
  panels: BazisPanel[];
  holes: BazisHole[];
  drills: BazisDrill[];
  omitted: BazisOmission[];
  /** A notch that is the same cut as a groove of its part (the quarter of the back): the groove is written. */
  same: { notchId: string; grooveId: string }[];
}

const CLEAR = tolerance.constants.compare.value;
/** Rounding of the arithmetic, not a tolerance. */
const SAME = 1e-6;
/** Types of `Obj` in BAZIS: a panel and a piece of hardware with drilling. */
const PANEL = 4002;
const HARDWARE = 3001;
/** FastID of the first own drilling definition, as in the trial files (above the ids BAZIS gives its library). */
const FAST_ID = 0x70000000;
/** DrillMode and ParamType of a through and of a blind hole, as the trial writer wrote them. */
const THROUGH = { drillMode: 1, paramType: 5 };
const BLIND = { drillMode: 2, paramType: 6 };

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const fmt = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
/** The same number written once: no −0, no tail of the arithmetic below 1e-9 mm. */
const clean = (x: number) => (Math.abs(x - Math.round(x * 1e9) / 1e9) < 1e-12 ? Math.round(x * 1e9) / 1e9 : x) + 0;

/** A point and a direction of the graph in BAZIS axes (packages/bazis/src/axes.ts). */
const point = (g: Pick<Graph, 'envelope'>, p: Vec3): Vec3 => toBazisPoint(p, g.envelope.depthMm);
const vector = toBazisVector;

/** Unit quaternion (x, y, z, w) of the rotation whose matrix has the columns a, b, c. */
function quaternion(a: Vec3, b: Vec3, c: Vec3): [number, number, number, number] {
  const [m00, m10, m20] = a,
    [m01, m11, m21] = b,
    [m02, m12, m22] = c,
    tr = m00 + m11 + m22;
  let q: [number, number, number, number];
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  // One of ±q: the one with w ≥ 0, so the same rotation is written the same way.
  return q.map((x) => clean(q[3] < 0 ? -x : x)) as [number, number, number, number];
}

/** The rotation that turns −Z (the drilling axis of a definition) to the unit vector d. */
function drillRotation(d: Vec3): [number, number, number, number] {
  const z: Vec3 = [0, 0, -1],
    w = 1 + dot(z, d);
  if (w < SAME) return [1, 0, 0, 0];
  const [x, y, zz] = cross(z, d),
    n = Math.hypot(x, y, zz, w);
  return [x / n, y / n, zz / n, w / n].map(clean) as [number, number, number, number];
}

const mirrored = (p: Part) => dot(cross(p.placement.uAxis, p.placement.vAxis), p.placement.nAxis) < 0;

/** Size of the part along u, v, n. */
const sizeOf = (p: Part): Vec3 => [p.finishedWithEdge.lengthMm, p.finishedWithEdge.widthMm, p.finishedWithEdge.panelThicknessMm];

/** A point (u, v) of the part in the axes of its panel. */
const local = (swapped: boolean, u: number, v: number): [number, number] => (swapped ? [v, u] : [u, v]);

/** The edge of the envelope a segment (u, v) of the part lies on. */
function slotOf(size: Vec3, a: [number, number], b: [number, number]): EdgeSlot | null {
  const on = (k: 0 | 1, x: number) => Math.abs(a[k] - x) < SAME && Math.abs(b[k] - x) < SAME;
  return on(1, 0) ? 'A' : on(1, size[1]) ? 'B' : on(0, 0) ? 'C' : on(0, size[0]) ? 'D' : null;
}

function contourOf(p: Part, swapped: boolean): { contour: [number, number][]; slots: (EdgeSlot | null)[] } {
  const [L, W] = sizeOf(p),
    uv: [number, number][] = p.contourMm ? p.contourMm.map(([u, v]) => [u, v]) : [[0, 0], [L, 0], [L, W], [0, W]];
  let pts = uv.map(([u, v]) => local(swapped, u, v)),
    order = uv;
  const area = pts.reduce((s, [x, y], i) => s + x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y, 0);
  // Counter-clockwise from the same first corner, as BAZIS saves a panel.
  if (area < 0) {
    pts = [pts[0], ...pts.slice(1).reverse()];
    order = [uv[0], ...uv.slice(1).reverse()];
  }
  return { contour: pts, slots: order.map((a, i) => slotOf(sizeOf(p), a, order[(i + 1) % order.length])) };
}

function grooveCut(q: Groove, p: Part, swapped: boolean): BazisCut {
  const T = sizeOf(p)[2],
    [a, b] = [Math.min(q.startMm, q.endMm), Math.max(q.startMm, q.endMm)],
    [from, to] = q.along === 'LENGTH' ? [local(swapped, a, q.offsetMm), local(swapped, b, q.offsetMm)] : [local(swapped, q.offsetMm, a), local(swapped, q.offsetMm, b)];
  return {
    operationId: q.id,
    name: `${q.purpose} ${fmt(q.grooveWidthMm)}×${fmt(q.grooveDepthMm)}`,
    from,
    to,
    widthMm: q.grooveWidthMm,
    depthRange: q.face === 'N_POS' ? [T - q.grooveDepthMm, T] : [0, q.grooveDepthMm],
    front: q.face === 'N_POS',
  };
}

/** A notch inside the thickness: swept along its longer side, the shorter one is the width of the profile. */
function notchCut(c: Notch, p: Part, swapped: boolean): BazisCut {
  const [L, W, T] = sizeOf(p),
    [u0, u1] = [Math.max(0, c.uRangeMm[0]), Math.min(L, c.uRangeMm[1])],
    [v0, v1] = [Math.max(0, c.vRangeMm[0]), Math.min(W, c.vRangeMm[1])],
    [n0, n1] = [Math.max(0, c.nRangeMm[0]), Math.min(T, c.nRangeMm[1])],
    alongU = u1 - u0 >= v1 - v0,
    [from, to] = alongU ? [local(swapped, u0, (v0 + v1) / 2), local(swapped, u1, (v0 + v1) / 2)] : [local(swapped, (u0 + u1) / 2, v0), local(swapped, (u0 + u1) / 2, v1)];
  return { operationId: c.id, name: `${c.purpose} ${fmt(alongU ? v1 - v0 : u1 - u0)}×${fmt(n1 - n0)}`, from, to, widthMm: alongU ? v1 - v0 : u1 - u0, depthRange: [n0, n1], front: n1 >= T - SAME };
}

type Ranges = [number, number][];

/** The box of a groove in part axes, clipped to the part. */
function grooveBox(q: Groove, size: Vec3): Ranges {
  const along: [number, number] = [Math.min(q.startMm, q.endMm), Math.max(q.startMm, q.endMm)],
    across: [number, number] = [q.offsetMm - q.grooveWidthMm / 2, q.offsetMm + q.grooveWidthMm / 2],
    n: [number, number] = q.face === 'N_POS' ? [size[2] - q.grooveDepthMm, size[2]] : [0, q.grooveDepthMm];
  return (q.along === 'LENGTH' ? [along, across, n] : [across, along, n]).map((r, k) => [Math.max(0, r[0]), Math.min(size[k], r[1])]);
}

const notchBox = (c: Notch, size: Vec3): Ranges => [c.uRangeMm, c.vRangeMm, c.nRangeMm].map((r, k) => [Math.max(0, r[0]), Math.min(size[k], r[1])]);

/** Two boxes are one cut when every face is within the comparison threshold 191 of the other's. */
const sameBox = (a: Ranges, b: Ranges) => a.every((r, k) => Math.abs(r[0] - b[k][0]) <= CLEAR && Math.abs(r[1] - b[k][1]) <= CLEAR);

/** Distance from the entry along the inward axis to where the axis leaves the box of the part. */
function throughDepth(h: Hole, p: Part): number {
  const pl = p.placement,
    size = sizeOf(p),
    d: Vec3 = [h.entryMm[0] - pl.originMm[0], h.entryMm[1] - pl.originMm[1], h.entryMm[2] - pl.originMm[2]],
    at: Vec3 = [dot(d, pl.uAxis), dot(d, pl.vAxis), dot(d, pl.nAxis)],
    axis: Vec3 = [dot(h.inwardNormal, pl.uAxis), dot(h.inwardNormal, pl.vAxis), dot(h.inwardNormal, pl.nAxis)];
  let t = Infinity;
  for (let k = 0; k < 3; k++) if (Math.abs(axis[k]) > SAME) t = Math.min(t, ((axis[k] > 0 ? size[k] : 0) - at[k]) / axis[k]);
  return t;
}

/** What the BAZIS file of a graph holds: the panels, the holes, their definitions, and what it leaves out. */
export function bazisModelOf(g: Graph): BazisModel {
  const panels: BazisPanel[] = [],
    holes: BazisHole[] = [],
    drills = new Map<string, BazisDrill>(),
    omitted: BazisOmission[] = [],
    same: BazisModel['same'] = [],
    written = new Map<string, Part>();
  let id = 0;
  for (const p of g.parts) {
    if (p.supply === 'PURCHASED') {
      omitted.push({ partId: p.id, operationId: null, op: 'PART', reason: 'покупное изделие: в спецификации и смете, не панель' });
      continue;
    }
    const swapped = mirrored(p),
      { contour, slots } = contourOf(p, swapped),
      pl = p.placement,
      [x, y] = swapped ? [pl.vAxis, pl.uAxis] : [pl.uAxis, pl.vAxis],
      ops = g.operations.filter((o) => o.partId === p.id),
      grooves = ops.filter((o): o is Groove => o.op === 'GROOVE'),
      T = sizeOf(p)[2],
      cuts: BazisCut[] = [];
    for (const q of grooves) {
      if (q.face && q.grooveWidthMm > 0 && q.grooveDepthMm > 0) cuts.push(grooveCut(q, p, swapped));
      else omitted.push({ partId: p.id, operationId: q.id, op: 'GROOVE', reason: 'паз не на пласти детали: в этом этапе не пишется' });
    }
    for (const c of ops.filter((o): o is Notch => o.op === 'NOTCH')) {
      const twin = grooves.find((q) => q.face && sameBox(grooveBox(q, sizeOf(p)), notchBox(c, sizeOf(p))));
      if (twin) same.push({ notchId: c.id, grooveId: twin.id });
      else if (c.nRangeMm[0] <= SAME && c.nRangeMm[1] >= T - SAME) omitted.push({ partId: p.id, operationId: c.id, op: 'NOTCH', reason: 'выборка на всю толщину меняет контур детали: в этом этапе не пишется' });
      else cuts.push(notchCut(c, p, swapped));
    }
    for (const b of p.bevels ?? []) omitted.push({ partId: p.id, operationId: null, op: 'BEVEL', reason: `скос торца ${b.edge} под углом ${fmt(b.angleDeg)}°: в этом этапе не пишется` });
    panels.push({
      part: p,
      id: ++id,
      swapped,
      contour,
      butts: slots.flatMap((slot, element) => {
        const e = slot ? p.edges[slot] : null;
        return e && e.intent !== 'NONE' && e.edgeBandThicknessMm > 0 ? [{ element, slot: slot!, thicknessMm: e.edgeBandThicknessMm, profileCode: e.profileCode }] : [];
      }),
      cuts,
      position: point(g, pl.originMm),
      rotation: quaternion(vector(x), vector(y), vector(pl.nAxis)),
    });
    written.set(p.id, p);
  }
  for (const h of g.operations) {
    if (h.op !== 'HOLE') continue;
    const p = written.get(h.partId);
    if (!p) {
      omitted.push({ partId: h.partId, operationId: h.id, op: 'HOLE', reason: 'отверстие покупного изделия: панели для него в файле нет' });
      continue;
    }
    const depth = h.through || h.depthMm === null ? throughDepth(h, p) : h.depthMm,
      through = h.through || h.depthMm === null,
      key = `${clean(h.diameterMm)}|${clean(depth)}|${through}`;
    if (!drills.has(key)) drills.set(key, { fastId: FAST_ID + drills.size, name: `Отверстие Ø${fmt(h.diameterMm)}×${fmt(depth)}${through ? ' сквозное' : ''}`, diameterMm: h.diameterMm, depthMm: depth, through });
    holes.push({ hole: h, id: 0, fastId: drills.get(key)!.fastId, depthMm: depth, position: point(g, h.entryMm), rotation: drillRotation(vector(h.inwardNormal)) });
  }
  holes.forEach((h) => (h.id = ++id));
  return { panels, holes, drills: [...drills.values()], omitted, same };
}

// ---------------------------------------------------------------- the file

/** A contour or a trajectory: u32 count, then per element u8 type and the segment x1, y1, x2, y2 as doubles. */
function segments(lines: [[number, number], [number, number]][]): Uint8Array {
  const out = new Uint8Array(4 + lines.length * 33),
    v = new DataView(out.buffer);
  v.setUint32(0, lines.length, true);
  lines.forEach(([a, b], i) => {
    const at = 4 + i * 33;
    out[at] = SEGMENT_LINE;
    [a[0], a[1], b[0], b[1]].forEach((x, k) => v.setFloat64(at + 1 + k * 8, clean(x), true));
  });
  return out;
}

const closed = (pts: [number, number][]) => pts.map((a, i): [[number, number], [number, number]] => [a, pts[(i + 1) % pts.length]]);

const trans = (t: Vec3, q: [number, number, number, number]) =>
  record('Trans', [f64('X', clean(t[0])), f64('Y', clean(t[1])), f64('Z', clean(t[2])), f64('Rx', q[0]), f64('Ry', q[1]), f64('Rz', q[2]), f64('Rw', q[3])]);

function panelRecord(x: BazisPanel): WriteRecord {
  const p = x.part,
    grain = p.orientation.grainDirection,
    texDir = grain === 'NONE' ? null : (grain === 'ALONG_LENGTH') !== x.swapped ? 1 : 2,
    children: WriteNode[] = [
      i32('Type', PANEL),
      text('Name', p.name),
      text('ArtPos', p.id),
      int('ID', x.id),
      trans(x.position, x.rotation),
      text('Mat', p.material.label),
      f64('Thick', p.finishedWithEdge.panelThicknessMm),
      ...(texDir === null ? [] : [int('TexDir', texDir)]),
      bytes('Contour', segments(closed(x.contour))),
    ];
  if (x.butts.length)
    children.push(
      record(
        'Butts',
        x.butts.map((b) =>
          record('Butt', [text('Mat', `Кромка ${b.profileCode} ${fmt(b.thicknessMm)} мм`), f64('Thick', b.thicknessMm), int('Elem', b.element), text('Sign', `${b.slot} ${fmt(b.thicknessMm)}`), f64('Overhung', 0), f64('Allowance', 0), flag('Clip', true)]),
        ),
      ),
    );
  if (x.cuts.length)
    children.push(
      record(
        'Cuts',
        x.cuts.map((c) => {
          const w = c.widthMm / 2,
            [y0, y1] = c.depthRange;
          return record('Cut', [
            text('Name', c.name),
            text('Sign', c.operationId),
            i32('Elem', -1),
            f64('Thickness', 0),
            bytes('Contour', segments(closed([[-w, y0], [w, y0], [w, y1], [-w, y1]]))),
            bytes('Trajectory', segments([[c.from, c.to]])),
            flag('Front', c.front),
          ]);
        }),
      ),
    );
  return record('Obj', children);
}

function drillRecord(d: BazisDrill): WriteRecord {
  const r = d.diameterMm / 2,
    mode = d.through ? THROUGH : BLIND;
  return record(`F${d.fastId}`, [
    text('Name', d.name),
    i32('FastID', d.fastId),
    int('DatumMode', 1),
    int('ParamType', mode.paramType),
    f64('ParamOffset', 0),
    f64('MinX', -r),
    f64('MinY', -r),
    f64('MinZ', -d.depthMm),
    f64('MaxX', r),
    f64('MaxY', r),
    f64('MaxZ', 0),
    flag('ForEstimate', false),
    record('Holes', [record('Hole', [f64('X', 0), f64('Y', 0), f64('Z', 0), f64('DirX', 0), f64('DirY', 0), f64('DirZ', -1), f64('Radius', r), f64('Depth', d.depthMm), int('DrillMode', mode.drillMode)])]),
    i32('RotHoleIndex', -1),
    i32('RotEdgeIndex', -1),
  ]);
}

const holeRecord = (h: BazisHole): WriteRecord =>
  record('Obj', [i32('Type', HARDWARE), text('Name', h.hole.id), int('ID', h.id), trans(h.position, h.rotation), i32('FastID', h.fastId), flag('ForEstimate', false), int('SalonType', 0)]);

/** The `.b3d` file of a graph: a pure function of the graph — the same graph gives the same bytes. */
export function b3dOf(g: Graph, opts: { model?: BazisModel } = {}): Uint8Array {
  const m = opts.model ?? bazisModelOf(g),
    v = bazisExport.constants.documentVersion.value,
    objects = [...m.panels.map(panelRecord), ...m.holes.map(holeRecord)],
    doc: WriteNode[] = [int('VersionMajor', v.major), int('VersionMinor', v.minor)];
  if (m.drills.length) doc.push(record('FurnList', m.drills.map(drillRecord)));
  if (objects.length) doc.push(record('Model', objects));
  return encodeBz85(record('Header', [int('Version', v.header)]), record('Document', doc));
}

/** The BAZIS file of a graph for the kit (stage 3): `model.b3d`. */
export function bazisFiles(g: Graph): { name: string; content: Uint8Array }[] {
  return [{ name: 'model.b3d', content: b3dOf(g) }];
}
