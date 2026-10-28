// The worktops of the kitchen (task K4, MIGRATION_PLAN step 4.4; KF-03, KF-20): one whole worktop for each continuous
// row of base modules of one top, the common worktop of a back-to-back island pair, the contour worktop of an L or
// diagonal corner (kcrWholeTops, kcrTopFor, kcrPairedTop, r1.html:75866–76045), and the topology of the worktops of the
// scene — their outer contours may not overlap, two worktops meet by one seam (kptTopTopology, r1.html:75387–75638).
// Every worktop lies inside the room: the prototype let the worktop of a sink pass through the wall (KF-03, FINDINGS
// 503).
//
// A plan point is [x, z]: x along wall A from the left of the room, z away from wall A (the frame of worldBox).
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { Rec } from '../engine/policy/project-state.js';
import { area, bounds, isAppliance, mirror, part, planBox, worktopDepthOf } from './carcass.js';
import { derived, nicheSupportPlan, peninsulaContacts } from './derived.js';
import { bodyDepth, isAccessL, isDiagonal, isFree, isSingleCorner, moduleWorldStart, wallFiller, worldBox, type KitchenScene } from './room.js';
import { jsonClone } from '../engine/json-clone.js';

const clone = jsonClone;
const EPS = 1e-6;
const WORKTOP_MATERIAL = 'WORKTOP_38';
/** A seam of two worktops: the top and the thickness of both 38 mm, the seam at least 200 mm (kptTopTopology). */
/** The smallest edge between a cutout and a cut end, mm (MOD-DEC-410). */
const CUTOUT_EDGE_MIN = 60;
const SEAM = { thicknessMm: 38, minLengthMm: 200, connectorQuantity: 3 };

type Point = number[];

const crossOf = (a: Point, b: Point, c: Point) => (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
const signedArea = (p: Point[]) => p.reduce((s, a, i) => s + a[0]! * p[(i + 1) % p.length]![1]! - p[(i + 1) % p.length]![0]! * a[1]!, 0) / 2;
const on = (a: Point, b: Point, p: Point) =>
  Math.abs(crossOf(a, b, p)) <= EPS && p[0]! >= Math.min(a[0]!, b[0]!) - EPS && p[0]! <= Math.max(a[0]!, b[0]!) + EPS && p[1]! >= Math.min(a[1]!, b[1]!) - EPS && p[1]! <= Math.max(a[1]!, b[1]!) + EPS;
function segmentsMeet(a: Point, b: Point, c: Point, d: Point): boolean {
  const x = crossOf(a, b, c),
    y = crossOf(a, b, d),
    u = crossOf(c, d, a),
    v = crossOf(c, d, b);
  return (x * y < 0 && u * v < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

/** A simple counter-clockwise polygon without repeated or collinear points (kptPolygon, r1.html:75408). */
export function topPolygon(input: unknown): Point[] {
  if (!Array.isArray(input) || input.length < 3 || input.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) throw Error('Контур столешницы не задан конечными координатами.');
  const p: Point[] = input.map((v: Point) => [...v]);
  if (Math.hypot(p[0]![0]! - p.at(-1)![0]!, p[0]![1]! - p.at(-1)![1]!) <= EPS) p.pop();
  for (let changed = true; changed && p.length > 3; ) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      if (on(p[(i + p.length - 1) % p.length]!, p[(i + 1) % p.length]!, p[i]!)) {
        p.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (p.length < 3 || Math.abs(signedArea(p)) <= EPS) throw Error('Столешница имеет вырожденный контур.');
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      if (segmentsMeet(p[i]!, p[(i + 1) % p.length]!, p[j]!, p[(j + 1) % p.length]!)) throw Error('Контур столешницы самопересекается.');
    }
  if (signedArea(p) < 0) p.reverse();
  return p;
}

/** The triangles of a worktop contour (kptTriangles, r1.html:75433). */
function triangles(input: Point[]): Point[][] {
  const p = topPolygon(input),
    ids = p.map((_, i) => i),
    out: Point[][] = [];
  while (ids.length > 3) {
    let ear = -1;
    for (let i = 0; i < ids.length; i++) {
      const prev = ids[(i + ids.length - 1) % ids.length]!,
        next = ids[(i + 1) % ids.length]!,
        a = p[prev]!,
        b = p[ids[i]!]!,
        c = p[next]!;
      if (crossOf(a, b, c) <= EPS) continue;
      const inside = ids.some((j) => j !== prev && j !== ids[i] && j !== next && crossOf(a, b, p[j]!) >= -EPS && crossOf(b, c, p[j]!) >= -EPS && crossOf(c, a, p[j]!) >= -EPS);
      if (!inside) {
        out.push([a, b, c]);
        ear = i;
        break;
      }
    }
    if (ear < 0) throw Error('Не удалось однозначно разобрать контур столешницы.');
    ids.splice(ear, 1);
  }
  out.push(ids.map((i) => p[i]!));
  return out;
}

/** A convex polygon clipped by a convex polygon (kptClip, r1.html:75457). */
function clip(subject: Point[], by: Point[]): Point[] {
  let out = subject.map((p) => [...p]);
  for (let i = 0; i < by.length && out.length; i++) {
    const a = by[i]!,
      b = by[(i + 1) % by.length]!,
      old = out;
    out = [];
    for (let j = 0; j < old.length; j++) {
      const p = old[j]!,
        q = old[(j + 1) % old.length]!,
        cp = crossOf(a, b, p),
        cq = crossOf(a, b, q),
        ip = cp >= -EPS,
        iq = cq >= -EPS;
      if (ip) out.push(p);
      if (ip !== iq) {
        const t = cp / (cp - cq);
        out.push([p[0]! + (q[0]! - p[0]!) * t, p[1]! + (q[1]! - p[1]!) * t]);
      }
    }
  }
  return out;
}

/** The common edges of two contours: the seam lines (kptSeams, r1.html:75490). */
function seams(a: Point[], b: Point[]): { edgeWorldMm: Point[]; lengthMm: number }[] {
  const segments: Point[][] = [];
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      const p = a[i]!,
        q = a[(i + 1) % a.length]!,
        r = b[j]!,
        s = b[(j + 1) % b.length]!,
        dx = q[0]! - p[0]!,
        dz = q[1]! - p[1]!,
        len = Math.hypot(dx, dz),
        ex = dx / len,
        ez = dz / len;
      if ((s[0]! - r[0]!) * ex + (s[1]! - r[1]!) * ez >= -EPS || Math.abs(crossOf(p, q, r)) / len > EPS || Math.abs(crossOf(p, q, s)) / len > EPS) continue;
      const ts = [r, s].map((v) => (v[0]! - p[0]!) * ex + (v[1]! - p[1]!) * ez),
        lo = Math.max(0, Math.min(...ts)),
        hi = Math.min(len, Math.max(...ts));
      if (hi - lo > EPS)
        segments.push([
          [p[0]! + ex * lo, p[1]! + ez * lo],
          [p[0]! + ex * hi, p[1]! + ez * hi],
        ]);
    }
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < segments.length; i++)
      for (let j = i + 1; j < segments.length; j++) {
        const [p, q] = segments[i] as [Point, Point],
          [r, s] = segments[j] as [Point, Point],
          len = Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!),
          ex = (q[0]! - p[0]!) / len,
          ez = (q[1]! - p[1]!) / len;
        if (Math.abs(crossOf(p, q, r)) / len > EPS || Math.abs(crossOf(p, q, s)) / len > EPS) continue;
        const ts = [r, s].map((v) => (v[0]! - p[0]!) * ex + (v[1]! - p[1]!) * ez);
        if (Math.max(...ts) < -EPS || Math.min(...ts) > len + EPS) continue;
        const lo = Math.min(0, ...ts),
          hi = Math.max(len, ...ts);
        segments[i] = [
          [p[0]! + ex * lo, p[1]! + ez * lo],
          [p[0]! + ex * hi, p[1]! + ez * hi],
        ];
        segments.splice(j, 1);
        changed = true;
        break outer;
      }
  }
  return segments
    .map((edge) => {
      if (edge[0]![0]! > edge[1]![0]! || (edge[0]![0] === edge[1]![0] && edge[0]![1]! > edge[1]![1]!)) edge.reverse();
      return { edgeWorldMm: edge, lengthMm: Math.hypot(edge[1]![0]! - edge[0]![0]!, edge[1]![1]! - edge[0]![1]!) };
    })
    .sort((x, y) => JSON.stringify(x.edgeWorldMm).localeCompare(JSON.stringify(y.edgeWorldMm)));
}

/** The plan contour of a worktop in the room (kcrWorktopWorldPolygon, kptTopPolygon, r1.html:75535). */
export function worktopWorldPolygon(s: KitchenScene, p: Rec): Point[] {
  if (p.worldFootprintMm) return topPolygon(p.worldFootprintMm);
  if (p.finished_polygon_mm) throw Error('У контурной столешницы отсутствует преобразованный фактический контур.');
  const m = s.modules.find((x) => x.id === p.moduleId)!,
    b = worldBox(s, m, p.box);
  return topPolygon([
    [b[0], b[4]],
    [b[1], b[4]],
    [b[1], b[5]],
    [b[0], b[5]],
  ]);
}

const worktopOf = (s: KitchenScene, m: Rec, name: string, id: string, size: number[], box: number[]): Rec => {
  const p = part(s, m, name, id, size, box, 'WORKTOP');
  p.materialCode = WORKTOP_MATERIAL;
  return p;
};

/** The worktop of one module (kcrTopFor, r1.html:75866): the contour of an L or diagonal corner, the cut-out top of a sink or hob, or a slab. */
export function moduleWorktop(s: KitchenScene, m: Rec, own: Rec | null = null, reading = false): Rec {
  const D = bodyDepth(m),
    depth = worktopDepthOf(m),
    T = m.worktopThickness ?? 38,
    H = m.height,
    W = m.width;
  if (isAccessL(m) || isDiagonal(m)) {
    const o = depth - D,
      poly = isDiagonal(m)
        ? [
            [0, 0],
            [W, 0],
            [W, D + o * Math.SQRT2],
            [D + o * Math.SQRT2, m.cornerReturn],
            [0, m.cornerReturn],
          ]
        : [
            [0, 0],
            [W, 0],
            [W, D + o],
            [D + o, D + o],
            [D + o, m.cornerReturn],
            [0, m.cornerReturn],
          ],
      plan = mirror(m, poly),
      b = bounds(plan),
      p = part(s, m, 'Столешница углового корпуса', 'whole-worktop', [b[1]! - b[0]!, b[3]! - b[2]!, T], planBox(m, b, H, H + T), 'WORKTOP');
    Object.assign(p, {
      finished_polygon_mm: plan,
      blank_polygon_mm: plan.map((v) => [...v]),
      finished_area_mm2: area(plan),
      blankStatus: 'PROJECT_FULL_SIZE_CONTOUR',
      edgeStatus: 'PROJECT_EXPOSED_EDGE_SEAL',
      rectangularExportEligible: false,
      rectangularEnvelopeOnly: true,
      diagonalPolygon: true,
      worldFootprintMm: plan.map(([x, y]) => {
        const w = worldBox(s, m, [x!, x!, 0, 0, D - y!, D - y!]);
        return [w[0], w[4]];
      }),
      edge_segments_mm: plan.map((a, i) => {
        const b2 = plan[(i + 1) % plan.length]!;
        return { from: a, to: b2, lengthMm: Math.hypot(a[0]! - b2[0]!, a[1]! - b2[1]!), thicknessMm: 0, finish: 'cut edge sealed where exposed' };
      }),
      supportingModuleIds: [m.id],
      worktopJoints: [],
      materialCode: WORKTOP_MATERIAL,
      installationPlanningQualified: true,
      manufacturingQualified: false,
    });
    return p;
  }
  const cut = isAppliance(m) ? (own ?? derived(s, m, reading)).parts?.find((p: Rec) => p.materialRole === 'WORKTOP') : null;
  if (cut) return clone(cut);
  const supports = nicheSupportPlan(s, m),
    x0 = supports?.left === 'end-panel' ? -18 : isSingleCorner(m) && m.cornerSide === 'left' ? -(wallFiller(m) ?? 0) : 0,
    x1 = W + (supports?.right === 'end-panel' ? 18 : isSingleCorner(m) && m.cornerSide === 'right' ? (wallFiller(m) ?? 0) : 0),
    p = part(s, m, 'Столешница', 'whole-worktop', [x1 - x0, depth, T], [x0, x1, H, H + T, D - depth, D], 'WORKTOP');
  Object.assign(p, { materialCode: WORKTOP_MATERIAL, supportingModuleIds: [m.id], worktopJoints: [], installationPlanningQualified: true, manufacturingQualified: false });
  return p;
}

/** Local plan point of an island from a point of the room (kcrFreeLocalFromWorld, r1.html:75923). */
function freeLocal(m: Rec, point: Point): Point {
  const x = point[0]! - m.x,
    z = point[1]! - m.y,
    W = m.width,
    D = bodyDepth(m),
    r = (((m.rotation || 0) % 360) + 360) % 360;
  return r === 0 ? [x, z] : r === 90 ? [W - z, x] : r === 180 ? [W - x, D - z] : [z, D - x];
}

/** The common worktop of a back-to-back island pair over the service gap (kcrPairedTop, r1.html:75932). */
function pairedWorktop(s: KitchenScene, first: Rec, partner: Rec, own: (m: Rec) => Rec | null, reading: boolean): Rec {
  const members = [first, partner],
    T = first.worktopThickness ?? 38,
    H = first.height,
    points = members.flatMap((m) => {
      const b = worldBox(s, m, [0, m.width, 0, 0, 0, bodyDepth(m)]);
      return [
        [b[0], b[4]],
        [b[1], b[4]],
        [b[1], b[5]],
        [b[0], b[5]],
      ].map((p) => freeLocal(first, p));
    }),
    b = bounds(points),
    skin = first.endPanels || partner.endPanels ? 18 : 0,
    x0 = b[0]! - skin,
    x1 = b[1]! + skin,
    z0 = b[2]! - 60,
    z1 = b[3]! + 60,
    top = worktopOf(s, first, 'Общая столешница пары острова', 'whole-worktop:pair', [x1 - x0, z1 - z0, T], [x0, x1, H, H + T, z0, z1]);
  top.supportingModuleIds = members.map((m) => m.id);
  top.worktopJoints = [];
  top.requiredSupports = [
    {
      moduleIds: members.map((m) => m.id),
      serviceGapMm: first.serviceGap ?? 40,
      qualification: 'Project pairedcabinet supports, whole slab bridges actual servicegap; topgrade and island anchoring qualified separately',
    },
  ];
  const old = members.map((m) => moduleWorktop(s, m, own(m), reading));
  top.apertures = old.flatMap((p, i) =>
    (p.apertures || []).map((a: Rec) => {
      const m = members[i]!,
        w = worldBox(s, m, [a.x, a.x + a.width, 0, 0, a.z, a.z + a.depth]),
        poly = [
          [w[0], w[4]],
          [w[1], w[4]],
          [w[1], w[5]],
          [w[0], w[5]],
        ].map((q) => freeLocal(first, q)),
        bb = bounds(poly);
      return { ...a, x: bb[0], z: bb[2], width: bb[1]! - bb[0]!, depth: bb[3]! - bb[2]!, moduleId: m.id };
    }),
  );
  top.operations = old.flatMap((p, i) => (p.operations || []).map((o: Rec) => ({ ...o, moduleId: members[i]!.id })));
  top.manufacturingQualified = false;
  top.installationPlanningQualified = true;
  return top;
}

/**
 * The whole worktops of the kitchen before their topology (kcrWholeTops(false), r1.html:75977): the corners, the island
 * pairs, then one worktop for each continuous row of base modules of one top, depth and thickness. `records` are the
 * derived modules already calculated (their own cut-out tops), by id; `reading` is the read of the fasteners (k7Reading).
 */
export function wholeWorktops(s: KitchenScene, records: ReadonlyMap<string, Rec> = new Map(), reading = false): Rec[] {
  const own = (m: Rec) => records.get(m.id) ?? null,
    modules = s.modules.filter((m) => ['base', 'island', 'niche'].includes(m.kind) && m.worktopEnabled !== false),
    normal = modules.filter((m) => !m.corner),
    parts = modules.filter((m) => m.corner).map((m) => moduleWorktop(s, m, own(m), reading)),
    used = new Set<string>(),
    start = (m: Rec, free: boolean) => (free ? m.x : moduleWorldStart(s, m));
  for (const first of normal) {
    if (used.has(first.id)) continue;
    const paired = isFree(first) ? normal.find((m) => m.id === first.pairId) : null;
    if (paired && Math.abs(first.floor + first.height - paired.floor - paired.height) < EPS) {
      parts.push(pairedWorktop(s, first, paired, own, reading));
      used.add(first.id);
      used.add(paired.id);
      continue;
    }
    const free = isFree(first),
      sorted = normal
        .filter(
          (m) =>
            !used.has(m.id) &&
            m.wall === first.wall &&
            isFree(m) === free &&
            m.floor + m.height === first.floor + first.height &&
            worktopDepthOf(m) === worktopDepthOf(first) &&
            (m.worktopThickness ?? 38) === (first.worktopThickness ?? 38) &&
            (!free || (m.rotation === 0 && first.rotation === 0 && m.y === first.y)),
        )
        .sort((a, b) => start(a, free) - start(b, free)),
      at = sorted.indexOf(first),
      members = [first];
    let x = start(first, free),
      end = x + first.width;
    for (let i = at + 1; i < sorted.length; i++) {
      const m = sorted[i]!;
      if (Math.abs(start(m, free) - end) > EPS) break;
      members.push(m);
      end = start(m, free) + m.width;
    }
    for (let i = at - 1; i >= 0; i--) {
      const m = sorted[i]!;
      if (Math.abs(start(m, free) + m.width - x) > EPS) break;
      members.unshift(m);
      x = start(m, free);
    }
    const owner = members[0]!,
      tops = members.map((m) => moduleWorktop(s, m, own(m), reading)),
      offsets = members.map((m) => start(m, free) - x),
      x0 = Math.min(...tops.map((p, i) => p.box[0] + offsets[i]!)),
      x1 = Math.max(...tops.map((p, i) => p.box[1] + offsets[i]!)),
      D = bodyDepth(owner),
      depth = worktopDepthOf(owner),
      T = owner.worktopThickness ?? 38,
      H = owner.height,
      top = worktopOf(s, owner, 'Общая столешница ряда', 'whole-worktop:run', [x1 - x0, depth, T], [x0, x1, H, H + T, D - depth, D]);
    top.apertures = tops.flatMap((p, i) => (p.apertures || []).map((a: Rec) => ({ ...a, x: a.x + offsets[i]!, z: a.z + (D - bodyDepth(members[i]!)), moduleId: members[i]!.id })));
    top.operations = tops.flatMap((p, i) => (p.operations || []).map((o: Rec) => ({ ...clone(o), moduleId: members[i]!.id })));
    top.supportingModuleIds = members.map((m) => m.id);
    top.worktopJoints = [];
    top.requiredSupports = members
      .filter((m) => m.kind === 'niche')
      .map((m) => ({ moduleId: m.id, clearSpanMm: m.width, sideSupport: 'adjacent cabinet or explicitly attached structural end-panel', qualification: 'Span and top grade require fabricator check; supplier vapour strip retained' }));
    top.manufacturingQualified = false;
    top.installationPlanningQualified = true;
    top.note = 'Одна столешница на непрерывный ряд, вырезы привязаны к своим модулям. Материал, опирание, герметизация и фактическая стена проверяются перед изготовлением.';
    parts.push(top);
    members.forEach((m) => used.add(m.id));
  }
  return parts.map((p) => cutToRoom(s, p));
}

/**
 * A rectangular worktop cut to the walls of the room (KF-03, MOD-DEC-403): the prototype let the top of a sink, 655 mm
 * over a module of 600, go 27.5 mm into the wall; the owner chose to cut it close to the wall. Such a worktop is made
 * and fitted on site and its cost is an estimate (MOD-DEC-410, `wallCut.onSite`). The smallest edge left between a
 * cutout and a cut end is 60 mm (`CUTOUT_EDGE_MIN`, 410); a smaller edge is a remark in the bell, not a refusal.
 * A contour worktop is not cut: leaving the room it stays an issue of the topology.
 */
function cutToRoom(s: KitchenScene, p: Rec): Rec {
  const m = s.modules.find((x) => x.id === p.moduleId);
  if (!m || p.worldFootprintMm || p.finished_polygon_mm || !p.box?.every(Number.isFinite)) return p;
  const sides = [0, 1, 4, 5],
    world = worldBox(s, m, p.box),
    over = [-world[0], world[1] - s.room.width, -world[4], world[5] - s.room.depth];
  if (over.every((v) => v <= EPS)) return p;
  const box = [...p.box],
    cut: Rec = {};
  // Each side of the box of the module is one side of the room box (the modules turn by 90°): found by moving it 1 mm.
  for (const k of sides) {
    const inward = k % 2 === 0 ? 1 : -1,
      probe = [...p.box];
    probe[k] += inward;
    const moved = worldBox(s, m, probe),
      w = sides.findIndex((j) => Math.abs(moved[j]! - world[j]!) > EPS),
      o = over[w] ?? 0;
    if (o > EPS) {
      box[k] += inward * o;
      cut[['x0', 'x1', '', '', 'z0', 'z1'][k]!] = o;
    }
  }
  // The edge between a cutout and each cut end: the other ends are the worktop of the prototype.
  const edgeAt = (a: Rec, k: number) => [a.x - box[0]!, box[1]! - a.x - a.width, 0, 0, a.z - box[4]!, box[5]! - a.z - a.depth][k]!,
    edges = (p.apertures ?? []).flatMap((a: Rec) => sides.filter((k) => cut[['x0', 'x1', '', '', 'z0', 'z1'][k]!]).map((k) => edgeAt(a, k))),
    edge = edges.length ? Math.min(...edges) : null,
    short = edge !== null && edge < CUTOUT_EDGE_MIN - EPS,
    size = [box[1]! - box[0]!, box[5]! - box[4]!, p.finished_mm[2]],
    mm = (v: number) => Number(v.toFixed(1));
  return {
    ...p,
    box,
    finished_mm: size,
    blank_mm: [...size],
    wallCut: {
      cutMm: cut,
      cutoutEdgeMm: edge,
      cutoutEdgeMinMm: CUTOUT_EDGE_MIN,
      cutoutEdgeShort: short,
      onSite: true,
      decision: 'MOD-DEC-403, MOD-DEC-410',
      finding: 'FINDINGS 503',
      text:
        `Столешница ${p.partId} подрезана по стене на ${Object.values(cut).map(mm).join(' и ')} мм (MOD-DEC-403); изготавливается и устанавливается по месту, стоимость примерная (MOD-DEC-410).` +
        (edge === null
          ? ''
          : short
            ? ` От выреза до подрезанного края ${mm(edge)} мм — меньше ${CUTOUT_EDGE_MIN} мм: край у выреза может не выдержать. Отодвиньте модуль от стены или уменьшите столешницу.`
            : ` От выреза до подрезанного края ${mm(edge)} мм.`),
    },
  };
}

/** How far a contour leaves the room, mm (0 inside): the room is the rectangle of walls A and B. */
function outsideRoom(s: KitchenScene, polygon: Point[]): number {
  return Math.max(0, ...polygon.flatMap(([x, z]) => [-x!, x! - s.room.width, -z!, z! - s.room.depth]));
}

/**
 * The topology of the worktops (kptTopTopology, r1.html:75541): each contour is simple, inside the room (KF-03), two
 * outer contours do not overlap, and two worktops that touch meet by one seam of one top and 38 mm, at least 200 mm,
 * joined by three connectors 79386 — a worktop joint of the first of the pair.
 */
export function worktopTopology(s: KitchenScene, input: Rec[]): { parts: Rec[]; issues: Rec[] } {
  const parts: Rec[] = input.map((p) => {
      const { topologyIssues: _, ...rest } = p;
      return { ...rest, worktopJoints: [] as Rec[] };
    }),
    issues: Rec[] = [],
    prepared: { p: Rec; polygon: Point[]; triangles: Point[][]; box: number[] }[] = [];
  for (const p of parts) {
    const m = s.modules.find((x) => x.id === p.moduleId);
    try {
      if (!m || !p.box?.every(Number.isFinite)) throw Error('Не найдена исходная позиция столешницы.');
      const polygon = worktopWorldPolygon(s, p);
      prepared.push({ p, polygon, triangles: triangles(polygon), box: worldBox(s, m, p.box) });
      // KF-03 (MOD-DEC-294): a worktop is a part of the room; the prototype accepted a sink top through the wall.
      const out = outsideRoom(s, polygon);
      if (out > EPS)
        issues.push({
          code: 'WORKTOP_OUTSIDE_ROOM',
          moduleId: m.id,
          partIds: [p.partId],
          outsideMm: out,
          text: `${p.partId}: столешница выходит за пределы помещения на ${Math.round(out * 10) / 10} мм. Отодвиньте модуль от стены или уменьшите столешницу.`,
        });
    } catch (e) {
      issues.push({ code: 'WORKTOP_CONTOUR_UNRESOLVED', partIds: [p.partId], text: p.partId + ': ' + (e as Error).message });
    }
  }
  for (let i = 0; i < prepared.length; i++)
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i]!,
        b = prepared[j]!;
      if (Math.min(a.box[3]!, b.box[3]!) - Math.max(a.box[2]!, b.box[2]!) <= EPS || Math.min(a.box[1]!, b.box[1]!) - Math.max(a.box[0]!, b.box[0]!) < -EPS || Math.min(a.box[5]!, b.box[5]!) - Math.max(a.box[4]!, b.box[4]!) < -EPS) continue;
      let shared = 0;
      for (const x of a.triangles)
        for (const y of b.triangles) {
          const p = clip(x, y);
          if (p.length >= 3) shared += Math.abs(signedArea(p));
        }
      const ids = [a.p.partId, b.p.partId];
      if (shared > EPS) {
        const apertures = !!(a.p.apertures?.length || b.p.apertures?.length);
        issues.push({
          code: apertures ? 'WORKTOP_MATERIAL_CONTOUR_UNRESOLVED' : 'WORKTOP_POSITIVE_OVERLAP',
          partIds: ids,
          areaMm2: shared,
          areaBasis: 'OUTER_FINISHED_CONTOUR',
          materialIntersectionCertified: !apertures,
          text: 'Внешние контуры столешниц ' + ids.join(' / ') + ' перекрываются по контуру и высоте (' + shared.toFixed(2) + 'мм²). ' + (apertures ? 'Вырезы не подтверждают отдельный узел вложенной столешницы. ' : '') + 'Исправьте положение или выделите одну общую деталь.',
        });
        continue;
      }
      const found = seams(a.polygon, b.polygon);
      if (!found.length) continue;
      if (found.length !== 1) {
        issues.push({ code: 'WORKTOP_AMBIGUOUS_SEAM', partIds: ids, text: 'У столешниц ' + ids.join(' / ') + ' несколько несвязанных стыков. Нужен однозначный общий шов.' });
        continue;
      }
      const seam = found[0]!,
        ta = a.box[3]! - a.box[2]!,
        tb = b.box[3]! - b.box[2]!;
      if (Math.abs(a.box[2]! - b.box[2]!) > EPS || Math.abs(ta - tb) > EPS || Math.abs(ta - SEAM.thicknessMm) > EPS || seam.lengthMm < SEAM.minLengthMm - EPS) {
        issues.push({ code: 'WORKTOP_UNSUPPORTED_SEAM', partIds: ids, text: 'Стык ' + ids.join(' / ') + ' требует одинакового верха и толщины38мм, общего шва от200мм. Исправьте размеры.' });
        continue;
      }
      const ordered = [a.p, b.p].sort((x, y) => x.partId.localeCompare(y.partId)),
        id = 'worktop-joint:' + ordered.map((p) => p.partId).join('|') + ':' + JSON.stringify(seam.edgeWorldMm);
      ordered[0]!.worktopJoints.push({
        id,
        withPartId: ordered[1]!.partId,
        withModuleId: ordered[1]!.moduleId,
        ...seam,
        connectorQuantity: SEAM.connectorQuantity,
        sealLengthMm: seam.lengthMm,
        manufacturingQualified: false,
        qualification: 'Project3 selected79386 sets per contiguous38mm seam; continuous sealing; factory template/material/cutout clearances separately qualified',
      });
    }
  for (const p of parts) {
    const own = issues.filter((i) => i.partIds.includes(p.partId));
    if (own.length) p.topologyIssues = own;
  }
  return { parts, issues };
}

/** The worktops of the kitchen with their joints and topology (kcrWholeTops(true), r1.html:76044). */
export function kitchenWorktops(s: KitchenScene, records: ReadonlyMap<string, Rec> = new Map(), reading = false): Rec[] {
  return worktopTopology(s, wholeWorktops(s, records, reading)).parts;
}

/**
 * The topology of the whole scene the check of a module reads (kptSceneFor, r1.html:75806): the modules whose geometry
 * fails, the side contacts of the peninsulas and the topology of the worktops. `records` are the derived modules by id.
 */
export function sceneTopology(s: KitchenScene, records: ReadonlyMap<string, Rec> = new Map(s.modules.map((m) => [m.id, derived(s, m)]))): { contacts: Rec[]; issues: Rec[] } {
  const geometry: Rec[] = [],
    parts = s.modules.flatMap((m) => {
      const d = records.get(m.id)!;
      if (d.status === 'FAIL') geometry.push({ code: 'SCENE_STRUCTURAL_GEOMETRY_UNRESOLVED', moduleId: m.id, text: m.id + ': ' + (d.note || 'Не удалось завершить геометрию корпуса.') });
      return d.parts || [];
    }),
    contact = peninsulaContacts(s, parts),
    top = worktopTopology(s, wholeWorktops(s, records));
  return { contacts: contact.contacts, issues: [...geometry, ...contact.issues, ...top.issues] };
}
