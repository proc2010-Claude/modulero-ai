// Carcass fasteners of layer r7 (task W3): the fastener engine F7 of the prototype r1 (r1.html:86138–87837) and
// its model layer (f7Input, f7Hole and the model wrapper, r1.html:87837–88280), applied to the carcass model of
// carcass.ts. A joint of a roof or bottom with a side gets an eccentric with a wooden dowel 32 mm towards the
// centre, a joint whose screw head is covered gets a confirmat, a divider keeps the confirmats of the base model
// (MOD-DEC-192, 292). The kit profiles are data of the prototype (catalog/fasteners-r7.data.json, r1.html:86140);
// the Rastex 15 profiles for 19 and 22 mm are added by MOD-DEC-380 from the drilling patterns of Hettich.
//
// Pure functions: the prototype's caches (generation, hole conversion, complete plan) do not change a result and
// are left out; mwDigest is contentDigest (project/digest.ts), the same algorithm.
// Departures from the prototype are fixes with a FINDINGS item: the confirmat edge hole D5/L35 instead of the
// MAKMART D5/L40 (WR-17, FINDINGS 213), a side against a room wall is covered (WR-18, MOD-DEC-192, FINDINGS 214),
// a narrow eccentric joint with one station keeps the dowel of MOD-DEC-364 and gets none of 192 (FINDINGS 384);
// task W8: shelves on both sides of a partition get two staggered Rastex joints instead of the through DU868 (WR-19,
// MOD-DEC-343, FINDINGS 340), only the accepted profiles are chosen — no Minifix for 19 mm (MOD-DEC-292, FINDINGS 341).
// Proof: packages/core/test/engine.wardrobe.test.ts against the golden model.json of the 36 wardrobe inputs and
// packages/core/test/engine.wardrobe-fasteners.test.ts.
import profilesData from '../catalog/fasteners-r7.data.json' with { type: 'json' };
import { installationFaceNormals, partOrientation, physicalEdgeForSlot } from '../engine/policy/edge-model.js';
import type { Rec } from '../engine/policy/project-state.js';
import { confirmatProfileFor, fastenerProfileAccepted, isConfirmatProfile, sharedShelfRows } from '../engine/policy/wardrobe-fasteners.js';
import { wardrobeFill } from '../engine/policy/wardrobe-fill.js';
import { contentDigest } from '../project/digest.js';
import { edgeGeometryForPart } from './edges.js';
import { wardrobeFastenerSummary } from './summary.js';

type V3 = number[];

export const F7_SCHEMA = 'modulero.fasteners/7';

/** Kit profiles of r7: eccentrics Rastex and Minifix, partition bolts DU868/DU853, confirmats, dowels, runners. */
export const F7_PROFILES: Readonly<Record<string, Rec>> = profilesData;

const EPS = 1e-8;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const add = (a: V3, b: V3, k = 1) => a.map((v, i) => v + k * b[i]!),
  dot = (a: V3, b: V3) => a.reduce((s, v, i) => s + v * b[i]!, 0),
  sub = (a: V3, b: V3) => add(a, b, -1);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v),
  key = (o: Rec) => JSON.stringify([o.partId, o.faceId, o.entry, o.inwardNormal, o.diameter, o.depth]);
/** Joints of one partition whose edge parts overlap in height (W8, FINDINGS 342). */
const sameLevel = (j: Rec, k: Rec) => k.anchor.id === j.anchor.id && j.edge.box[0][2] < k.edge.box[1][2] - EPS && k.edge.box[0][2] < j.edge.box[1][2] - EPS;
const identity = (ops: Rec[]) => ops.map(key).sort().join('|'),
  pairKey = (p: string[]) => p.slice().sort().join('|');
const operationValid = (o: Rec) =>
  o &&
  typeof o.partId === 'string' &&
  o.entry?.length === 3 &&
  o.inwardNormal?.length === 3 &&
  [...o.entry, ...o.inwardNormal, o.diameter, o.depth].every(finite) &&
  o.diameter > 0 &&
  o.depth > 0 &&
  Math.abs(dot(o.inwardNormal, o.inwardNormal) - 1) < EPS;

/** Relation of two coaxial-direction cylinders of one part (r1.html:87048). */
export function cylinder(a: Rec, b: Rec, validate: (o: Rec) => unknown = operationValid): Rec {
  if (![a, b].every(validate)) return { status: 'UNKNOWN', reason: 'INCOMPLETE_CYLINDER' };
  if (a.partId !== b.partId) return { status: 'DIFFERENT_PART' };
  const u = a.inwardNormal,
    v = b.inwardNormal,
    cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (dot(cross, cross) > 1e-24) return { status: 'UNKNOWN', reason: 'NONPARALLEL_SOLID_KERNEL_REQUIRED' };
  const d = sub(b.entry, a.entry),
    axial = dot(d, u),
    ends = [axial, axial + dot(u, v) * b.depth].sort((a, b) => a - b),
    axialGap = Math.max(0, ends[0]!) - Math.min(a.depth, ends[1]!),
    radial = sub(
      d,
      u.map((x: number) => x * axial),
    ),
    radialGap = Math.sqrt(dot(radial, radial)) - (a.diameter + b.diameter) / 2,
    intersects = axialGap < -EPS && radialGap < -EPS,
    distance = Math.hypot(Math.max(0, axialGap), Math.max(0, radialGap));
  return {
    status: intersects ? 'INTERSECTION' : 'SEPARATE_OR_TOUCHING',
    distance,
    signedLigament: intersects ? Math.max(axialGap, radialGap) : distance,
    axialGap,
    radialGap,
  };
}

/** Whether the rectangles `covers` cover the rectangle `rect` completely; null when unknown (r1.html:87079). */
export function coverage(rect: number[] | null, covers: number[][] | null): boolean | null {
  if (!rect?.every(finite) || rect[2]! <= rect[0]! || rect[3]! <= rect[1]!) return null;
  if (covers === null || covers.some((c) => !c?.every(finite))) return null;
  const ys = [...new Set([rect[0]!, rect[2]!, ...covers.flatMap((c) => [Math.max(rect[0]!, Math.min(rect[2]!, c[0]!)), Math.max(rect[0]!, Math.min(rect[2]!, c[2]!))])])].sort((a, b) => a - b),
    zs = [...new Set([rect[1]!, rect[3]!, ...covers.flatMap((c) => [Math.max(rect[1]!, Math.min(rect[3]!, c[1]!)), Math.max(rect[1]!, Math.min(rect[3]!, c[3]!))])])].sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++)
    for (let j = 1; j < zs.length; j++) {
      const y = (ys[i - 1]! + ys[i]!) / 2,
        z = (zs[j - 1]! + zs[j]!) / 2;
      if (!covers.some((c) => y >= c[0]! && y <= c[2]! && z >= c[1]! && z <= c[3]!)) return false;
    }
  return true;
}

/**
 * The words of the reasons of `select` and of the codes of the plan's errors, for the person (R2-028, FINDINGS 2791):
 * the keys stay in the joint (its data), the issue says them in Russian. A code without words is said as it is.
 */
export const FASTENER_REASON_RU: Readonly<Record<string, string>> = {
  SPECIAL_TOPOLOGY: 'особый стык — у него свой профиль крепежа',
  OWNER_DRAWER_FRONT: 'фасад ящика к боковинам — эксцентрик (решение владельца)',
  OWNER_DRAWER_REAR_OR_LDSP_BOTTOM: 'задняя стенка ящика или дно из ЛДСП — конфирмат (решение владельца)',
  INTERNAL_PARTITION: 'внутренняя перегородка — конфирмат',
  EXTERIOR_HIDDEN: 'стык закрыт снаружи — конфирмат',
  VISIBLE_SIDE: 'стык виден снаружи — эксцентрик',
  VISIBILITY_OR_COVERAGE_UNKNOWN: 'не известно, виден ли стык снаружи, поэтому крепёж не выбран',
  CONFIRMAT_ASSEMBLY_UNKNOWN: 'стыку подходит конфирмат, но не проверено, можно ли завернуть его при сборке (подход инструмента)',
  CONFIRMAT_ASSEMBLY_IMPOSSIBLE: 'конфирмат при сборке не завернуть — выбран эксцентрик',
  ECCENTRIC_ASSEMBLY_UNKNOWN: 'стыку подходит эксцентрик, но не проверено, можно ли собрать его',
  NO_ASSEMBLABLE_SELECTED_JOINT: 'ни конфирмат, ни эксцентрик в этом стыке не собрать',
  STALE_PHYSICAL_IDENTITY: 'детали стыка сменились после сохранённой записи крепежа',
  SHARED_SHELF_DEPTH: 'встречным эксцентрикам полок на общей стойке не хватает места по глубине',
  IMMUTABLE_OR_LEGACY_MANUAL_JOINT: 'стык сохранён из прежнего проекта и не пересчитывается',
  PART_BOUNDARY: 'отверстие выходит за край детали',
  HOLE_COLLISION: 'отверстие пересекает другое отверстие',
  GROOVE_COLLISION: 'отверстие попадает в паз',
  OPPOSED_ATOMIC_GROUP_INCOMPLETE: 'встречный крепёж с другой стороны стойки не собран целиком',
  RESTORED_LEGACY_HOLE_COLLISION: 'отверстие старого проекта пересекает новое',
};

/** The reason of a joint («A; B»), each key in its words (`FASTENER_REASON_RU`). */
export const fastenerReasonText = (reason: string): string =>
  reason
    .split('; ')
    .map((r) => FASTENER_REASON_RU[r] ?? r)
    .join('; ');

/** Fastener family of a joint by MOD-DEC-192 (r1.html:87094). */
export function select(j: Rec): Rec {
  if (['adjustable_shelf', 'decorative_front', 'leg', 'worktop', 'K04_body_screw', 'hanger', 'special'].includes(j.role)) return { choice: 'KEEP_SPECIAL_PROFILE', reason: 'SPECIAL_TOPOLOGY' };
  let wanted, reason;
  if (j.role === 'drawer_front_side') {
    wanted = 'ECCENTRIC';
    reason = 'OWNER_DRAWER_FRONT';
  } else if (['drawer_rear_side', 'drawer_ldsp_bottom'].includes(j.role)) {
    wanted = 'CONFIRMAT';
    reason = 'OWNER_DRAWER_REAR_OR_LDSP_BOTTOM';
  } else if (j.internalPartition) {
    wanted = 'CONFIRMAT';
    reason = 'INTERNAL_PARTITION';
  } else if (j.covered === true) {
    wanted = 'CONFIRMAT';
    reason = 'EXTERIOR_HIDDEN';
  } else if (j.covered === false && j.externallyVisible === true) {
    wanted = 'ECCENTRIC';
    reason = 'VISIBLE_SIDE';
  } else return { choice: 'UNKNOWN', reason: 'VISIBILITY_OR_COVERAGE_UNKNOWN' };
  const proposedChoice = wanted;
  if (wanted === 'CONFIRMAT') {
    if (j.confirmatAssembly == null) return { choice: 'UNKNOWN', proposedChoice, reason: 'CONFIRMAT_ASSEMBLY_UNKNOWN' };
    if (j.confirmatAssembly === false) {
      wanted = 'ECCENTRIC';
      reason = 'CONFIRMAT_ASSEMBLY_IMPOSSIBLE';
    }
  }
  if (wanted === 'ECCENTRIC') {
    if (j.eccentricAssembly == null) return { choice: 'UNKNOWN', proposedChoice: wanted, reason: 'ECCENTRIC_ASSEMBLY_UNKNOWN' };
    if (j.eccentricAssembly === false) return { choice: 'UNRESOLVED', reason: 'NO_ASSEMBLABLE_SELECTED_JOINT' };
  }
  return { choice: wanted, reason };
}

function op(j: Rec, part: Rec, face: unknown, entry: V3, normal: V3, diameter: number, depth: number, role: string, station: number, status = 'DERIVED', kind = 'blind'): Rec {
  return {
    operationId: 'F7/' + j.id + '/' + station + '/' + role,
    jointId: j.id,
    partId: part.id,
    faceId: face,
    entry,
    inwardNormal: normal,
    diameter,
    depth,
    role,
    station,
    kind,
    status,
    toolTravel: null,
    cncRelease: false,
    productionExecutable: false,
    productionQualified: false,
    dimensionBasis: 'FINISHED_PART',
    coordinateStage: 'POST_EDGING',
  };
}

/**
 * The exact profile of a joint. AUTO is the Rastex of the edge thickness (MOD-DEC-292, 380; the prototype took Minifix
 * for 19 mm); a profile whose kit is not accepted — Minifix, the through DU868 / DU853 — is refused, not drilled (192, 292).
 */
function profile(j: Rec, id: string): Rec {
  // AUTO by the thickness of the edge part: Rastex 15 with DU325 for 16 and 18 mm (292), for 19 and 22 mm (380,
  // FINDINGS 430). Another thickness keeps the 16 mm profile and is refused.
  if (id === 'AUTO' || !id) id = [18, 19, 22].includes(j.edge.t) ? `RASTEX${j.edge.t}_DU325` : 'RASTEX16_DU325';
  const p = F7_PROFILES[id];
  if (!p) return { error: 'UNKNOWN_PROFILE', id };
  if (!fastenerProfileAccepted(id)) return { error: 'PROFILE_NOT_ACCEPTED', id };
  if (p.edgeThickness && !p.edgeThickness.includes(j.edge.t)) return { error: 'EDGE_THICKNESS_PROFILE_MISMATCH', id };
  // A confirmat outside the thicknesses of its profile is drilled by it as a temporary value and said in the problems
  // (temporaryProfileReason): the owner chooses the hardware himself and the constructor is not cut (FINDINGS 434).
  if (p.centreThickness && !p.centreThickness.includes(j.anchor.t)) return { error: 'DOUBLE_BOLT_EXACT_PARTITION_REQUIRED', id };
  if (!['LDSP', 'MDF'].includes(j.edge.material) || !['LDSP', 'MDF'].includes(j.anchor.material)) return { error: 'MATERIAL_PROFILE_UNKNOWN', id };
  if (id.startsWith('RASTEX') && !p.anchorThicknessExamples.includes(j.anchor.t)) return { error: 'RASTEX_ANCHOR_THICKNESS_UNKNOWN', id };
  if (p.centreThickness && !p.shelfThicknessExamples.includes(j.edge.t)) return { error: 'DOUBLE_BOLT_SHELF_PROFILE_UNKNOWN', id };
  return { id, p };
}

/**
 * Why a planned joint drills a profile outside its thicknesses — the confirmat of 16 mm at another thickness — as a
 * temporary value until the hardware is chosen (FINDINGS 434); null when the profile is its own.
 */
export function temporaryProfileReason(j: Rec): string | null {
  const p = F7_PROFILES[j.profileId];
  if (!p?.firstPanelThickness || j.errors?.length || (p.firstPanelThickness.includes(j.anchor.t) && p.edgePanelThickness?.includes(j.edge.t))) return null;
  return `профиль ${j.profileId} подобран для детали ${p.edgePanelThickness.join(', ')} мм, а детали соединения — ${j.edge.t} и ${j.anchor.t} мм`;
}

/** A point of the joint frame: u across the joint, s along it, w across the edge part (r1.html:87219). */
export function at(j: Rec, u: number, s: number, w: number): V3 {
  return add(add(add(j.origin, j.u, u), j.s, s), j.w, w);
}

/** Whether a hole meets a groove of its part; null when the groove has no box (r1.html F7.grooveHit). */
export function grooveHit(o: Rec, g: Rec): boolean | null {
  const axis = o.inwardNormal.findIndex((x: number) => Math.abs(x) > 0.5);
  if (axis < 0 || !g.box) return null;
  const end = add(o.entry, o.inwardNormal, o.depth),
    lo = g.box[0],
    hi = g.box[1];
  if (Math.min(Math.max(o.entry[axis], end[axis]!), hi[axis]) - Math.max(Math.min(o.entry[axis], end[axis]!), lo[axis]) <= EPS) return false;
  return [0, 1, 2].filter((i) => i !== axis).reduce((s, i) => s + Math.max(lo[i] - o.entry[i], 0, o.entry[i] - hi[i]) ** 2, 0) < (o.diameter / 2 - EPS) ** 2;
}

/** Wooden dowels of an eccentric joint, 32 mm from each station towards the centre (r1.html:87222, MOD-DEC-192). */
export function wood(j: Rec, stations: number[], existing: Rec[] = [], minWeb: number | null = null): Rec {
  const rows: Rec[] = [],
    nodes = new Map<string, Rec>(),
    pp = [j.edge.id, j.anchor.id],
    profileId = j.woodProfileId || 'WOOD8x35_NOMINAL_11_26',
    frameId = j.frameId || 'PROJECT_WORLD',
    issues: Rec[] = [];
  if (![j.length, j.edge.t, j.availableDepth, ...stations].every(finite)) throw Error('FINITE_NUMERIC_GEOMETRY_REQUIRED');
  if (Math.min(j.length, j.edge.t, j.availableDepth) <= 0) throw Error('INVALID_WOOD_DIMENSION_OR_WEB');
  if (stations.some((s) => s < 0 || s > j.length)) throw Error('STATION_OUTSIDE_JOINT');
  if (minWeb !== null && !finite(minWeb)) throw Error('FINITE_NUMERIC_GEOMETRY_REQUIRED');
  if (minWeb !== null && minWeb < 0) throw Error('INVALID_WOOD_DIMENSION_OR_WEB');
  if (existing.some((e) => typeof e.id !== 'string' || !e.id)) throw Error('EXISTING_ADDRESSABLE_ID_REQUIRED');
  if (new Set(existing.map((e) => e.id)).size !== existing.length) throw Error('DUPLICATE_EXISTING_ID');
  // A narrow joint of the kitchen (MOD-DEC-364, 566) names its dowels: one per station, where the layout puts it.
  const placed: number[] | null = Array.isArray(j.dowelStations) ? j.dowelStations : null;
  for (const [index, station] of stations.slice().sort((a, b) => a - b).entries()) {
    if (!placed && Math.abs(station - j.length / 2) < EPS) {
      rows.push({ station, candidate: null, status: j.length / 2 < 36 ? 'SMALL_DETAIL_EXCEPTION' : 'CENTER_DIRECTION_UNDEFINED' });
      continue;
    }
    const s = placed ? placed[index]! : station + Math.sign(j.length / 2 - station) * 32;
    if (!finite(s)) continue;
    if (s < 4 || s > j.length - 4 || j.edge.t < 8 || j.availableDepth < 26) {
      rows.push({ station, candidate: s, status: 'SMALL_DETAIL_EXCEPTION' });
      continue;
    }
    const ops = [
        op(j, j.edge, j.edgeFace, at(j, 0, s, j.edge.t / 2), j.u, 8, 26, 'WOOD_EDGE', s),
        op(
          j,
          j.anchor,
          j.anchorFace,
          at(j, 0, s, j.edge.t / 2),
          j.u.map((v: number) => -v),
          8,
          11,
          'WOOD_ANCHOR',
          s,
        ),
      ],
      geom = identity(ops);
    if (!nodes.has(geom))
      nodes.set(geom, {
        s,
        ops,
        pp,
        profileId,
        frameId,
        physicalId: 'F7-WOOD/' + contentDigest([pp, frameId, profileId, geom]),
        rows: [],
        issues: [],
        reuse: [],
        minimum: Math.min(s - 4, j.length - s - 4, j.edge.t / 2 - 4, j.availableDepth - 26, ...stations.map((x) => Math.abs(s - x) - 8)),
        woodMinimum: null,
      });
    const n = nodes.get(geom)!,
      row = { station, candidate: s };
    rows.push(row);
    n.rows.push(row);
  }
  const validity = new Map<Rec, unknown>(),
    validate = (o: Rec) => {
      if (!validity.has(o)) validity.set(o, operationValid(o));
      return validity.get(o);
    };
  const compare = (n: Rec, ops: Rec[]) => {
    const rel = n.ops.flatMap((a: Rec) => ops.filter((b) => b.partId === a.partId).map((b) => cylinder(a, b, validate))),
      known = rel.filter((r: Rec) => finite(r.signedLigament));
    for (const r of known) {
      n.minimum = Math.min(n.minimum, r.signedLigament);
      n.woodMinimum = n.woodMinimum === null ? r.signedLigament : Math.min(n.woodMinimum, r.signedLigament);
    }
    return rel;
  };
  for (const n of nodes.values()) {
    const features = (j.grooves || []).filter((g: Rec) => grooveHit(n.ops[0], g)).map((g: Rec) => g.id);
    if (stations.some((x) => Math.abs(n.s - x) < 8 - EPS) || features.length) n.issues.push({ code: 'COLLISION_OTHER_FEATURE', features });
    for (const e of existing) {
      const known =
        e.partPair?.length === 2 &&
        new Set(e.partPair).size === 2 &&
        e.partPair.every((p: unknown) => typeof p === 'string' && p) &&
        e.frameId &&
        e.profileId &&
        e.operations?.length &&
        e.operations.every((o: Rec) => e.partPair.includes(o.partId) && cylinder(o, o).status !== 'UNKNOWN');
      if (!known) {
        n.issues.push({ code: 'EXISTING_GEOMETRY_UNKNOWN', existingId: e.id });
        continue;
      }
      if (!e.partPair.some((id: string) => pp.includes(id))) continue;
      if (e.frameId !== frameId) {
        n.issues.push({ code: 'EXISTING_GEOMETRY_UNKNOWN', existingId: e.id, reason: 'FRAME_TRANSFORM_REQUIRED' });
        continue;
      }
      if (pairKey(e.partPair) === pairKey(pp) && e.profileId === profileId && identity(e.operations) === identity(n.ops)) {
        n.reuse.push(e.id);
        continue;
      }
      const rel = compare(n, e.operations);
      if (rel.some((r: Rec) => r.status === 'INTERSECTION')) n.issues.push({ code: 'COLLISION_EXISTING_WOOD', existingId: e.id, relations: rel });
      if (rel.some((r: Rec) => r.status === 'UNKNOWN')) n.issues.push({ code: 'EXISTING_GEOMETRY_UNKNOWN', existingId: e.id, reason: 'NONPARALLEL_SOLID_KERNEL_REQUIRED' });
    }
    if (existing.some((e) => e.id === n.physicalId)) n.issues.push({ code: 'EXISTING_ID_COLLISION' });
    if (n.reuse.length > 1) n.issues.push({ code: 'DUPLICATE_EXISTING_PHYSICAL_RECORD', existingIds: n.reuse });
  }
  const all = [...nodes.values()];
  for (let i = 0; i < all.length; i++)
    for (let k = i + 1; k < all.length; k++) {
      const a = all[i]!,
        b = all[k]!,
        rel = compare(a, b.ops);
      compare(b, a.ops);
      if (rel.some((r: Rec) => r.status === 'INTERSECTION')) {
        a.issues.push({ code: 'DOWEL_CANDIDATES_INTERSECT', otherPhysicalId: b.physicalId });
        b.issues.push({ code: 'DOWEL_CANDIDATES_INTERSECT', otherPhysicalId: a.physicalId });
      }
    }
  const newPhysicalWood: Rec[] = [],
    reusedPhysicalIds: string[] = [];
  for (const n of all) {
    if (minWeb !== null && n.minimum < minWeb - EPS) n.issues.push({ code: 'MIN_WEB_NOT_MET', requiredWeb: minWeb });
    const priority = ['COLLISION_EXISTING_WOOD', 'DOWEL_CANDIDATES_INTERSECT', 'COLLISION_OTHER_FEATURE', 'EXISTING_GEOMETRY_UNKNOWN', 'EXISTING_ID_COLLISION', 'DUPLICATE_EXISTING_PHYSICAL_RECORD', 'MIN_WEB_NOT_MET'];
    n.issues.sort((a: Rec, b: Rec) => priority.indexOf(a.code) - priority.indexOf(b.code));
    if (!n.issues.length) {
      if (n.reuse.length) reusedPhysicalIds.push(n.reuse[0]);
      else newPhysicalWood.push({ physicalId: n.physicalId, partPair: pp, profileId, frameId, operations: n.ops });
    }
    n.rows.forEach((row: Rec, i: number) =>
      Object.assign(row, {
        status: n.issues[0]?.code || (n.reuse.length ? 'REUSE_EXISTING' : i ? 'SHARED_DEDUP' : minWeb === null ? 'NOMINAL_FITS_CONDITIONAL' : 'FITS_GIVEN_WEB_ONLY'),
        minimumNominalLigament: n.minimum,
        minimumWoodLigament: n.woodMinimum,
        issues: n.issues,
        physicalId: n.issues.length ? null : n.reuse[0] || n.physicalId,
      }),
    );
    issues.push(...n.issues);
  }
  return {
    rows,
    newPhysicalWood,
    newWoodCount: newPhysicalWood.length,
    reusedPhysicalIds: [...new Set(reusedPhysicalIds)],
    existingStateUnchanged: clone(existing),
    minWeb,
    productionRelease: false,
  };
}

/**
 * Nominal operations and kits of a joint at its stations (r1.html:87376). The confirmat is drilled through the
 * anchor D8 and into the edge D5; the edge depth of confirmat 7×50 is its receiving pilot, 35 mm (§17.1 of
 * MOD-DEC-055, WR-17, FINDINGS 213), not the 40 mm of the MAKMART profile of the prototype; confirmat 7×70 has no
 * rule of §17.1 and takes the depth of its MAKMART table, 60 mm (MOD-DEC-467, FINDINGS 683).
 */
export function nominal(j: Rec, id: string, stations: number[], confirmatEdgeDepthMm: number): Rec {
  const exact = profile(j, id);
  if (exact.error) return { profileId: exact.id, operations: [], kits: [], errors: [{ code: exact.error, partIds: [j.edge.id, j.anchor.id] }] };
  const { p } = exact,
    operations: Rec[] = [],
    kits: Rec[] = [],
    a = p.axisFromLower?.value ?? j.edge.t / 2,
    inward = j.u.map((v: number) => -v);
  for (const station of stations) {
    if (isConfirmatProfile(exact.id)) {
      operations.push(
        op(j, j.anchor, j.outerFace, at(j, -j.anchor.t, station, a), j.u, 8, j.anchor.t, 'CONFIRMAT_THROUGH', station, 'PRIMARY_CONFIRMED', 'through'),
        op(j, j.edge, j.edgeFace, at(j, 0, station, a), j.u, 5, p.screw === '7x50' ? confirmatEdgeDepthMm : p.edgeDepth.value, 'CONFIRMAT_EDGE', station, 'PRIMARY_CONFIRMED'),
      );
    } else if (p.centreThickness) {
      const variant = j.edge.t === 16 ? F7_PROFILES.RASTEX16_DU325! : F7_PROFILES.RASTEX18_DU325!;
      operations.push(
        op(j, j.edge, j.cupFace, at(j, 34, station, 0), j.w, 15, variant.cupDepth.value, 'CAM', station, 'PRIMARY_CONFIRMED'),
        op(j, j.edge, j.edgeFace, at(j, 0, station, a), j.u, 8, 34, 'EDGE', station),
        op(j, j.anchor, j.anchorFace, at(j, 0, station, a), inward, 8, j.anchor.t, 'DOUBLE_THROUGH', station, 'PRIMARY_CONFIRMED', 'through'),
      );
    } else {
      operations.push(
        op(j, j.edge, j.cupFace, at(j, p.b.value, station, 0), j.w, p.cupDiameter.value, p.cupDepth.value, 'CAM', station, p.cupDepth.status),
        op(j, j.edge, j.edgeFace, at(j, 0, station, a), j.u, p.edgeDiameter.value, p.edgeCylinderDepth.value, 'EDGE', station, p.edgeCylinderDepth.status),
        op(j, j.anchor, j.anchorFace, at(j, 0, station, a), inward, p.anchorDiameter.value, p.anchorDepth.value, 'ANCHOR', station, p.anchorDepth.status),
      );
    }
    kits.push({
      physicalId: 'F7-KIT/' + j.id + '/' + station,
      jointId: j.id,
      partPair: [j.edge.id, j.anchor.id],
      profileId: exact.id,
      station,
      components: clone(p.kit || p.kitPerStation),
      rateRub: isConfirmatProfile(exact.id) ? null : p.centreThickness ? null : 20,
      qty: 1,
    });
  }
  return {
    profileId: exact.id,
    operations,
    kits,
    errors: [],
    cupTolerance: p.cupDepthPlusTolerance?.value ?? null,
    headSeat: isConfirmatProfile(exact.id) ? { diameter: null, depth: null } : undefined,
    productionRelease: false,
  };
}

/** Whether a hole leaves the box of its part (r1.html F7 bounds). */
export function bounds(o: Rec, part: Rec): boolean {
  const axis = o.inwardNormal.findIndex((v: number) => Math.abs(v) > 0.5),
    end = add(o.entry, o.inwardNormal, o.depth),
    lo = part.box[0],
    hi = part.box[1];
  return [0, 1, 2].some((i) =>
    i === axis ? Math.min(o.entry[i], end[i]!) < lo[i] - EPS || Math.max(o.entry[i], end[i]!) > hi[i] + EPS : o.entry[i] - o.diameter / 2 < lo[i] - EPS || o.entry[i] + o.diameter / 2 > hi[i] + EPS,
  );
}

/** Whether two holes of one part intersect; null when the solid kernel is needed (r1.html:87434). */
export function intersects(a: Rec, b: Rec): boolean | null {
  const r = cylinder(a, b);
  if (r.status !== 'UNKNOWN') return r.status === 'INTERSECTION';
  const i = a.inwardNormal.findIndex((x: number) => Math.abs(x) > 0.5),
    j = b.inwardNormal.findIndex((x: number) => Math.abs(x) > 0.5);
  if (i < 0 || j < 0 || i === j) return null;
  const axisAligned = (o: Rec) => o.inwardNormal.filter((x: number) => Math.abs(x) > EPS).length === 1;
  if (!axisAligned(a) || !axisAligned(b)) return null;
  const range = (o: Rec) => {
      const k = o.inwardNormal.findIndex((x: number) => Math.abs(x) > 0.5);
      return [o.entry[k], o.entry[k] + o.inwardNormal[k] * o.depth].sort((a, b) => a - b);
    },
    dist = (v: number, r: number[]) => Math.max(r[0]! - v, 0, v - r[1]!),
    di = dist(b.entry[i], range(a)),
    dj = dist(a.entry[j], range(b)),
    ra = a.diameter / 2,
    rb = b.diameter / 2,
    k = 3 - i - j;
  if (di >= rb - EPS || dj >= ra - EPS) return false;
  const aa = Math.sqrt(ra * ra - dj * dj),
    bb = Math.sqrt(rb * rb - di * di);
  return Math.min(a.entry[k] + aa, b.entry[k] + bb) - Math.max(a.entry[k] - aa, b.entry[k] - bb) > EPS;
}

/** The plan of all joints: profiles, operations, kits, dowels and the collision checks (r1.html:87468). */
export function plan(input: Rec, cfg: Rec | null | undefined, confirmatEdgeDepthMm: number): Rec {
  const partIndex = new Map(input.parts.map((p: Rec) => [p.id, p])),
    records = cfg?.records || {},
    joints: Rec[] = input.joints.map((j: Rec) => {
      if (records[j.id]?.identityBinding && j.identityBinding && records[j.id].identityBinding !== j.identityBinding)
        return {
          ...j,
          decision: { choice: 'UNKNOWN', reason: 'PHYSICAL_IDENTITY_CHANGED' },
          errors: [{ code: 'STALE_PHYSICAL_IDENTITY', partIds: [j.edge.id, j.anchor.id] }],
          operations: [],
          kits: [],
          wood: { rows: [], newPhysicalWood: [] },
          inventoryUnknown: [],
        };
      const rec = records[j.id] || {},
        assessment = { ...j, confirmatAssembly: j.opposed ? false : (rec.confirmatAssembly ?? j.confirmatAssembly ?? null), eccentricAssembly: rec.eccentricAssembly ?? j.eccentricAssembly ?? null },
        decision = select(assessment),
        family = decision.choice === 'UNKNOWN' ? decision.proposedChoice : decision.choice;
      const id = family === 'CONFIRMAT' ? confirmatProfileFor(j.anchor.t) : rec.profileId || 'AUTO',
        // MOD-DEC-343: a shelf on each side of a partition — each side its own eccentric, the rows staggered by 16 mm
        // in depth; a through partition bolt (DU868, once its profile is accepted) keeps one station for both.
        staggered = j.opposed && family === 'ECCENTRIC' && !F7_PROFILES[id]?.centreThickness;
      if (staggered && j.sharedShelf.conflict && !rec.stations)
        return {
          ...j,
          decision,
          errors: [{ code: 'SHARED_SHELF_DEPTH', partIds: [j.edge.id, j.anchor.id] }],
          operations: [],
          kits: [],
          wood: { rows: [], newPhysicalWood: [] },
        };
      const stations = rec.stations || (staggered ? j.sharedShelf.stationsMm : j.stations),
        gen = ['CONFIRMAT', 'ECCENTRIC'].includes(family) ? nominal(j, id, stations, confirmatEdgeDepthMm) : { operations: [], kits: [], errors: [], profileId: null },
        woodResult = (family === 'ECCENTRIC' || (family === 'CONFIRMAT' && j.dowelStations)) && !gen.errors.length && !j.narrowJointDowel ? wood(j, stations, input.existingWood || [], rec.minWeb ?? null) : { rows: [], newPhysicalWood: [] };
      return { ...j, stations, decision, ...gen, wood: woodResult, physicalVerified: false, productionRelease: false, inventoryUnknown: [] };
    });
  const owned = new Set(joints.filter((j) => !j.preserve).map((j) => j.id)),
    retained = (input.operations || []).filter((o: Rec) => !owned.has(o.jointId));
  const all = joints.flatMap((j) => j.operations || []),
    woods = joints.flatMap((j) => j.wood.newPhysicalWood.map((w: Rec) => ({ ...w, jointId: j.id }))),
    badWood = new Set<string>();
  const woodByOperation = new Map<Rec, Rec>(),
    groovesByPart = new Map<string, Rec[]>(),
    opposedByAnchor = new Map<string, Rec[]>();
  for (const w of woods) for (const o of w.operations) if (!woodByOperation.has(o)) woodByOperation.set(o, w);
  for (const g of input.grooves || []) {
    if (!groovesByPart.has(g.partId)) groovesByPart.set(g.partId, []);
    groovesByPart.get(g.partId)!.push(g);
  }
  for (const j of joints)
    if (j.opposed) {
      if (!opposedByAnchor.has(j.anchor.id)) opposedByAnchor.set(j.anchor.id, []);
      opposedByAnchor.get(j.anchor.id)!.push(j);
    }
  const exactRows = <T>(index: Map<string, T[]>, id: string) => (id !== id ? [] : index.get(id) || []);
  const collisionIndex = new Map<string, Rec[]>();
  for (const o of [...all, ...woods.flatMap((w) => w.operations), ...retained]) {
    if (!collisionIndex.has(o.partId)) collisionIndex.set(o.partId, []);
    collisionIndex.get(o.partId)!.push(o);
  }
  for (const j of joints) {
    if (j.preserve) {
      j.errors.push({ code: 'IMMUTABLE_OR_LEGACY_MANUAL_JOINT' });
      continue;
    }
    if (j.geometryUnknown) j.inventoryUnknown.push({ field: 'actual hole inventory contains unresolved operation', partIds: [j.edge.id, j.anchor.id] });
    for (const o of j.operations) {
      const p = partIndex.get(o.partId);
      if (!p || bounds(o, p)) j.errors.push({ code: 'PART_BOUNDARY', operationId: o.operationId, partIds: [o.partId] });
    }
    const candidates = [...j.operations, ...j.wood.newPhysicalWood.flatMap((w: Rec) => w.operations)];
    for (const a of candidates) {
      const owner = partIndex.get(a.partId),
        wa = woodByOperation.get(a);
      if (wa && (!owner || bounds(a, owner))) badWood.add(wa.physicalId);
      for (const b of collisionIndex.get(a.partId) || []) {
        if (b.operationId === a.operationId) continue;
        if (a.jointId === b.jointId && a.station === b.station && [a.role, b.role].every((r) => ['CAM', 'EDGE'].includes(r))) continue;
        if (a.role === 'DOUBLE_THROUGH' && b.role === 'DOUBLE_THROUGH' && a.jointId !== b.jointId) continue;
        const hit = intersects(a, b);
        if (hit === null) {
          j.inventoryUnknown.push({ field: 'nonparallel solid distance', with: b.operationId });
          continue;
        }
        if (hit) {
          const wa = woodByOperation.get(a),
            wb = woodByOperation.get(b);
          if (wa || wb) {
            if (wa) badWood.add(wa.physicalId);
            if (wb) badWood.add(wb.physicalId);
          } else j.errors.push({ code: 'HOLE_COLLISION', operationId: a.operationId, with: b.operationId, partIds: [a.partId] });
        }
      }
      for (const g of exactRows(groovesByPart, a.partId)) {
        const hit = grooveHit(a, g);
        if (hit === null) j.inventoryUnknown.push({ field: 'groove geometry', with: g.id });
        else if (hit) {
          const w = woodByOperation.get(a);
          if (w) badWood.add(w.physicalId);
          else j.errors.push({ code: 'GROOVE_COLLISION', operationId: a.operationId, with: g.id, partIds: [a.partId] });
        }
      }
    }
  }
  for (const j of joints.filter((j) => j.opposed)) {
    const peers = exactRows(opposedByAnchor, j.anchor.id).filter((k) => k === j || (k.u[0] === -j.u[0] && sameLevel(j, k)));
    if (peers.length < 2 || peers.some((k) => k.errors.length)) j.errors.push({ code: 'OPPOSED_ATOMIC_GROUP_INCOMPLETE', partIds: peers.map((k) => k.edge.id).concat(j.anchor.id) });
  }
  for (let pass = 0; pass <= joints.length; pass++) {
    const failed = new Set(joints.filter((j) => j.errors.length).map((j) => j.id)),
      restoredByPart = new Map<string, Rec[]>();
    for (const o of input.operations || [])
      if (failed.has(o.jointId)) {
        if (!restoredByPart.has(o.partId)) restoredByPart.set(o.partId, []);
        restoredByPart.get(o.partId)!.push(o);
      }
    let changed = false;
    for (const j of joints.filter((j) => !j.errors.length))
      for (const a of [...j.operations, ...j.wood.newPhysicalWood.flatMap((w: Rec) => w.operations)])
        for (const b of exactRows(restoredByPart, a.partId))
          if (intersects(a, b)) {
            const w = woodByOperation.get(a);
            if (w) badWood.add(w.physicalId);
            else {
              j.errors.push({ code: 'RESTORED_LEGACY_HOLE_COLLISION', operationId: a.operationId, with: b.operationId, partIds: [a.partId] });
              changed = true;
            }
          }
    if (!changed) break;
  }
  for (const j of joints) {
    for (const w of j.wood.newPhysicalWood) {
      if (badWood.has(w.physicalId)) {
        for (const row of j.wood.rows.filter((r: Rec) => r.physicalId === w.physicalId)) {
          row.status = 'COLLISION_PHYSICAL_INVENTORY';
          row.physicalId = null;
          row.reason = 'Actual wood/metal/groove cylinder or part boundary in shared project frame; no automatic offset16 or shared40/50.';
        }
      }
    }
    j.wood.newPhysicalWood = j.wood.newPhysicalWood.filter((w: Rec) => !badWood.has(w.physicalId));
    j.wood.newWoodCount = j.wood.newPhysicalWood.length;
  }
  const operations: Rec[] = [],
    kits: Rec[] = [],
    woodItems: Rec[] = [],
    seen = new Set<string>(),
    woodIds = new Set<string>(),
    sharedKits = new Map<unknown, Rec>();
  for (const j of joints) {
    if (j.errors.length) continue;
    for (const o of j.operations) {
      const double = o.role === 'DOUBLE_THROUGH',
        k = double ? JSON.stringify([o.partId, o.diameter, o.depth, o.entry.map((x: number, i: number) => (i === o.inwardNormal.findIndex((v: number) => v !== 0) ? j.anchor.box[0][i] : x))]) : o.operationId;
      if (!seen.has(k)) {
        seen.add(k);
        operations.push(o);
      }
    }
    for (const kit of j.kits) {
      if (kit.profileId.startsWith('DU8')) {
        const k = JSON.stringify([j.anchor.id, kit.station, j.origin.map((x: number, i: number) => (i === j.u.findIndex((v: number) => v !== 0) ? j.anchor.box[0][i] : x))]);
        const existing = sharedKits.get(k);
        const screw = j.edge.t === 16 ? '25062' : '13957';
        if (existing) {
          existing.jointIds.push(j.id);
          existing.components[screw] = (existing.components[screw] || 0) + 1;
          continue;
        }
        kit.sharedKey = k;
        kit.jointIds = [j.id];
        kit.components = { [kit.profileId === 'DU868_PARTITION16' ? '79602' : '79568']: 1, [screw]: 1 };
      }
      kits.push(kit);
      if (!sharedKits.has(kit.sharedKey)) sharedKits.set(kit.sharedKey, kit);
    }
    for (const w of j.wood.newPhysicalWood) {
      if (w.physicalId === w.physicalId && woodIds.has(w.physicalId)) continue;
      woodIds.add(w.physicalId);
      woodItems.push({ ...w, jointId: j.id, sku: '9223927', qty: 1, rateRub: null });
      operations.push(...w.operations);
    }
  }
  const knownHardwareSubtotalRub = kits.reduce((s, k) => s + (k.rateRub ?? 0), 0),
    unknownPrice = kits.some((k) => k.rateRub === null) || woodItems.length > 0;
  return {
    schema: F7_SCHEMA,
    joints,
    operations,
    kits,
    woodItems,
    knownHardwareSubtotalRub,
    hardwareTotalRub: unknownPrice ? null : knownHardwareSubtotalRub,
    unknownPrice,
    physicalVerified: false,
    productionRelease: false,
    inventory: { retainedOperations: retained.length, grooves: (input.grooves || []).length, frame: 'PROJECT_WORLD', complete: input.inventoryComplete === true },
    geometryRevision: contentDigest(input.parts.map((p: Rec) => [p.id, p.box, p.t, p.material])),
  };
}

/** World box of a part in the prototype's axes: x across the wardrobe, y up, z from the front (u13Boxes r1.html:19318 with its layers, ejAllBoxes r1.html:59845). */
export interface WorldBox {
  id: string;
  part: Rec;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/**
 * Boxes of the carcass parts, in the prototype's order: per body the sides, roof, bottom, back panel and plinth
 * rails, then the dividers, then the parts that carry their own worldBox.
 */
export function carcassBoxes(m: Rec): WorldBox[] {
  const partIndex = new Map<string, Rec>(m.parts.map((p: Rec) => [p.id, p])),
    boxes: WorldBox[] = [],
    put = (id: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
      const part = partIndex.get(id);
      if (part) boxes.push({ id, part, ...(part.worldBox ?? { x0, x1, y0, y1, z0, z1 }) });
    };
  for (const mod of m.modules) {
    const p = mod.panelIds,
      g = mod.geometry,
      D = g.depth,
      t = m.t;
    put(p.left, mod.start, mod.start + t, g.sideBottomY, g.sideTopY, 0, D);
    put(p.right, mod.end - t, mod.end, g.sideBottomY, g.sideTopY, 0, D);
    put(p.top, mod.start + t, mod.end - t, g.topBottomY, g.topTopY, 0, D);
    put(p.bottom, mod.start + t, mod.end - t, g.bottomBottomY, g.bottomTopY, 0, D);
    const back = partIndex.get(p.back);
    if (back) put(back.id, mod.start, mod.end, g.sideBottomY, g.sideTopY, D, D + back.T);
    for (const k of ['plinthFront', 'plinthRear']) {
      const part = partIndex.get(p[k]);
      if (part) put(part.id, mod.start + t, mod.end - t, g.plinthBottomY, g.plinthTopY, part.worldZStart, part.worldZEnd);
    }
  }
  for (let i = 1; i < m.sectionsData.length; i++) {
    if (m.moduleBreaks.includes(i)) continue;
    const s = m.sectionsData[i],
      p = m.parts.find((x: Rec) => x.sectionId === s.id && x.kind === 'divider');
    if (p) put(p.id, p.worldX, p.worldX + m.t, s.geometry.interiorBottomY, s.geometry.interiorBottomY + p.L, 0, p.W);
  }
  for (const p of m.parts) if (p.worldBox && !boxes.some((b) => b.id === p.id)) boxes.push({ id: p.id, part: p, ...p.worldBox });
  return boxes;
}

function f7Part(p: Rec, b: WorldBox): Rec {
  return { id: p.id, box: [[b.x0, b.z0, b.y0], [b.x1, b.z1, b.y1]], t: p.T, material: p.materialFamily, source: p };
}

function f7LocalPoint(p: Rec, point: V3): number[] {
  const b = p.box[0],
    v = point.map((x, i) => x - b[i]),
    f = partOrientation(p.source).orientationFamily;
  return f === 'verticalDepth' ? [v[2]!, v[1]!] : f === 'uprightWidth' ? [v[2]!, v[0]!] : f === 'drawerSide' ? [v[1]!, p.source.W - v[2]!] : f === 'uprightPanel' ? [v[0]!, p.source.W - v[2]!] : [v[0]!, v[1]!];
}

/** A hole of the model as an r7 operation in world coordinates (r1.html:87852). */
export function f7LegacyOperation(h: Rec, partIndex: Map<string, Rec>): Rec | null {
  const p = partIndex.get(h.panel);
  if (!p) return null;
  if (h.f7Operation) return clone(h.f7Operation);
  const f = partOrientation(p.source).orientationFamily,
    dims = p.box[1].map((x: number, i: number) => x - p.box[0][i]),
    face = (installationFaceNormals(p.source) as Rec)[h.face],
    normal = face ? ({ '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 0, 1], '-Y': [0, 0, -1], '+Z': [0, 1, 0], '-Z': [0, -1, 0] } as Rec)[face] : null;
  let v: number[] | undefined, axis: number[] | undefined;
  if (h.mode === 'face' && normal) {
    v = f === 'verticalDepth' ? [0, h.y, h.x] : f === 'uprightWidth' ? [h.y, 0, h.x] : f === 'drawerSide' ? [0, h.x, p.source.W - h.y] : f === 'uprightPanel' ? [h.x, 0, p.source.W - h.y] : [h.x, h.y, 0];
    const ai = normal.findIndex((x: number) => x !== 0);
    v[ai] = normal[ai] > 0 ? dims[ai] : 0;
    axis = normal.map((x: number) => -x);
  } else if (h.mode === 'edge') {
    const e = physicalEdgeForSlot(p.source, h.edge) as string;
    if (['left', 'right'].includes(e)) {
      v = [e === 'left' ? 0 : dims[0], f === 'uprightPanel' ? dims[1] / 2 : h.offset, f === 'uprightPanel' ? p.source.W - h.offset : dims[2] / 2];
      axis = [e === 'left' ? 1 : -1, 0, 0];
    } else if (['front', 'rear'].includes(e)) {
      v = [f === 'verticalDepth' ? dims[0] / 2 : h.offset, e === 'front' ? 0 : dims[1], f === 'drawerSide' ? p.source.W - h.offset : f === 'verticalDepth' ? h.offset : dims[2] / 2];
      axis = [0, e === 'front' ? 1 : -1, 0];
    } else if (['top', 'bottom'].includes(e)) {
      v = [['uprightPanel', 'uprightWidth'].includes(f) ? h.offset : dims[0] / 2, ['uprightPanel', 'uprightWidth'].includes(f) ? dims[1] / 2 : h.offset, e === 'bottom' ? 0 : dims[2]];
      axis = [0, 0, e === 'bottom' ? 1 : -1];
    }
  }
  if (!v || !axis || !v.every(Number.isFinite)) return null;
  const i = axis.findIndex((x) => x !== 0),
    depth = h.depth === 'through' ? dims[i] : h.depth;
  if (!Number.isFinite(depth)) return null;
  return {
    operationId: h.operationId || h.connectionId || h.purpose,
    partId: p.id,
    faceId: h.face || h.edge,
    entry: v.map((x, i) => x + p.box[0][i]),
    inwardNormal: axis,
    diameter: h.diameter,
    depth,
    kind: h.depth === 'through' ? 'through' : 'blind',
    jointId: h.connectionId,
    role: h.ejRole || 'EXISTING',
    station: h.stationId || null,
  };
}

/** Box of a groove in world coordinates (ejGrooveBox r1.html:60277 for plan and depth parts, r1.html:87926 otherwise). */
function grooveBox(p: Rec, g: Rec): number[][] | null {
  const src = p.source,
    f = partOrientation(src).orientationFamily;
  if (f === 'horizontalPlan' || f === 'verticalDepth') {
    const dims = src.orientation?.orientationFamily === 'verticalDepth' ? [src.T, src.W, src.L] : [src.L, src.W, src.T],
      family = src.orientation?.orientationFamily,
      value = src.orientation?.installationFaceNormals?.[g.face],
      normal = value === '-X' ? [-1, 0, 0] : value === '+X' ? [1, 0, 0] : value === '-Y' ? [0, 0, -1] : value === '+Y' ? [0, 0, 1] : null,
      half = Number(g.width) / 2,
      depth = Number(g.depth);
    if (!normal || ![...dims, half, depth, Number(g.start), Number(g.end), Number(g.offset)].every(Number.isFinite)) return null;
    const faceAxis = family === 'verticalDepth' ? 0 : 2,
      faceCoord = normal[faceAxis]! < 0 ? 0 : dims[faceAxis],
      inward = -normal[faceAxis]!,
      a = Math.min(g.start, g.end),
      b = Math.max(g.start, g.end),
      lo = [0, 0, 0],
      hi = [...dims];
    lo[faceAxis] = Math.min(faceCoord, faceCoord + inward * depth);
    hi[faceAxis] = Math.max(faceCoord, faceCoord + inward * depth);
    if (family === 'verticalDepth') {
      if (g.orientation === 'W') {
        lo[2] = g.offset - half;
        hi[2] = g.offset + half;
        lo[1] = a;
        hi[1] = b;
      } else {
        lo[2] = a;
        hi[2] = b;
        lo[1] = g.offset - half;
        hi[1] = g.offset + half;
      }
    } else if (g.orientation === 'W') {
      lo[0] = g.offset - half;
      hi[0] = g.offset + half;
      lo[1] = a;
      hi[1] = b;
    } else {
      lo[0] = a;
      hi[0] = b;
      lo[1] = g.offset - half;
      hi[1] = g.offset + half;
    }
    return [lo.map((x, i) => x + p.box[0][i]), hi.map((x, i) => x + p.box[0][i])];
  }
  const dims = p.box[1].map((x: number, i: number) => x - p.box[0][i]),
    axis = f === 'drawerSide' ? 0 : 1,
    n = (installationFaceNormals(src) as Rec)[g.face],
    positive = n?.startsWith('+'),
    lo = [0, 0, 0],
    hi = dims.slice();
  lo[axis] = positive ? dims[axis] - g.depth : 0;
  hi[axis] = positive ? dims[axis] : g.depth;
  const line = f === 'drawerSide' ? 1 : 0,
    other = 2;
  if (g.orientation === 'L') {
    lo[line] = g.start;
    hi[line] = g.end;
    lo[other] = src.W - g.offset - g.width / 2;
    hi[other] = src.W - g.offset + g.width / 2;
  } else {
    lo[line] = g.offset - g.width / 2;
    hi[line] = g.offset + g.width / 2;
    lo[other] = src.W - g.end;
    hi[other] = src.W - g.start;
  }
  return [lo.map((x, i) => x + p.box[0][i]), hi.map((x: number, i: number) => x + p.box[0][i])];
}

/** A room wall at the left or right of the wardrobe: the box of the wall face the outer side stands against. */
export interface WallFace {
  side: 'left' | 'right';
  x: number;
}

/**
 * Joints of the model and everything the plan checks them against (f7Input r1.html:87906). A roof or bottom with
 * a side or divider; the head of the anchor side is covered by a neighbouring side flush with it, or by a room
 * wall (`walls`, WR-18).
 */
export function f7Input(m: Rec, d: Rec, walls: readonly WallFace[] = []): Rec {
  const boxes = carcassBoxes(m),
    parts = boxes.map((b) => f7Part(b.part, b)),
    partIndex = new Map<string, Rec>();
  for (const p of parts) if (!partIndex.has(p.id)) partIndex.set(p.id, p);
  const holesByConnection = new Map<unknown, Rec[]>(),
    sections = new Map<unknown, number>(),
    sideParts = parts.filter((p) => ['sideLeft', 'sideRight'].includes(p.source.kind));
  for (const h of m.holes || []) {
    if (!holesByConnection.has(h.connectionId)) holesByConnection.set(h.connectionId, []);
    holesByConnection.get(h.connectionId)!.push(h);
  }
  (m.sectionsData || []).forEach((s: Rec, i: number) => {
    if (!sections.has(s.id)) sections.set(s.id, i);
  });
  const faceNormals = (p: Rec) => installationFaceNormals(p) as Rec;
  const operations = (m.holes || []).map((h: Rec) => f7LegacyOperation(h, partIndex)),
    unknownOperations = m.holes.filter((_: Rec, i: number) => !operations[i]),
    grooves = (m.grooves || []).map((g: Rec) => {
      const p = partIndex.get(g.panel);
      if (!p) return { partId: g.panel, id: g.operationId, box: null };
      return { partId: g.panel, id: g.operationId || g.purpose, box: grooveBox(p, g) };
    });
  const joints: Rec[] = [],
    connections = [...(m.connections || [])],
    narrowDowelled = new Set((m.connections || []).filter((c: Rec) => c.subtype === 'narrowJointDowel').map((c: Rec) => c.fastenerConnectionId));
  for (const edge of parts.filter((p) => p.source.kind === 'drawerBottom' && p.material === 'LDSP'))
    for (const anchor of parts.filter((p) => p.source.drawerId === edge.source.drawerId && p.source.kind === 'drawerSide'))
      if (Math.abs(edge.box[0][0] - anchor.box[1][0]) < 0.01 || Math.abs(edge.box[1][0] - anchor.box[0][0]) < 0.01)
        connections.push({ id: edge.id + '/joint/' + anchor.id, type: 'f7DrawerBottom', a: edge.id, b: anchor.id, qty: 2, synthetic: true, drawerId: edge.source.drawerId });
  for (const c of connections) {
    let edge = partIndex.get(c.a),
      anchor = partIndex.get(c.b),
      role;
    if (c.type === 'drawerBox') {
      edge = partIndex.get(c.b);
      anchor = partIndex.get(c.a);
      role = edge?.source.kind === 'drawerFront' ? 'drawer_front_side' : 'drawer_rear_side';
    } else if (c.type === 'f7DrawerBottom') role = 'drawer_ldsp_bottom';
    else if (['fixedShelf', 'eccentricShelf'].includes(c.type)) role = anchor?.source.kind === 'divider' ? 'internalPartition' : 'exterior_visible';
    else if (c.type === 'confirmat' && ['top', 'bottom'].includes(edge?.source.kind) && ['sideLeft', 'sideRight', 'divider'].includes(anchor?.source.kind)) role = anchor!.source.kind === 'divider' ? 'internalPartition' : 'exterior_visible';
    else if (c.type === 'confirmat' && ['top', 'bottom'].includes(anchor?.source.kind) && ['sideLeft', 'sideRight', 'divider'].includes(edge?.source.kind)) {
      [edge, anchor] = [anchor, edge];
      role = anchor!.source.kind === 'divider' ? 'internalPartition' : 'exterior_visible';
    } else continue;
    if (!edge || !anchor) continue;
    const left = Math.abs(edge.box[0][0] - anchor.box[1][0]) < 0.01,
      right = Math.abs(edge.box[1][0] - anchor.box[0][0]) < 0.01;
    if (!left && !right) continue;
    const upright = edge.source.kind === 'drawerFront' || edge.source.kind === 'drawerBack',
      u = [left ? 1 : -1, 0, 0],
      s = upright ? [0, 0, 1] : [0, 1, 0],
      w = upright ? [0, 1, 0] : [0, 0, 1],
      origin = [left ? edge.box[0][0] : edge.box[1][0], edge.box[0][1], edge.box[0][2]],
      length = edge.source.W,
      edgeFace = left ? 'left' : 'right',
      anchorFace = Object.entries(faceNormals(anchor.source)).find(([, n]) => n === (left ? '+X' : '-X'))?.[0],
      outerFace = Object.entries(faceNormals(anchor.source)).find(([, n]) => n === (left ? '-X' : '+X'))?.[0];
    const existing = (holesByConnection.get(c.id) || []).filter((h) => h.panel === edge.id && h.mode === 'edge'),
      stations: number[] = existing.length ? existing.map((h) => (upright ? edge.source.W - h.offset : h.offset)) : [50, length - 50],
      external = anchor.source.kind !== 'divider' && !upright,
      outerX = left ? anchor.box[0][0] : anchor.box[1][0],
      covers = external
        ? [
            ...sideParts.filter((p) => p.id !== anchor.id && Math.abs((left ? p.box[1][0] : p.box[0][0]) - outerX) < 1e-8 && ['sideLeft', 'sideRight'].includes(p.source.kind)).map((p) => [p.box[0][1], p.box[0][2], p.box[1][1], p.box[1][2]]),
            ...walls.filter((wall) => wall.side === (left ? 'left' : 'right') && Math.abs(wall.x - outerX) < 1e-8).map(() => [anchor.box[0][1], anchor.box[0][2], anchor.box[1][1], anchor.box[1][2]]),
          ]
        : [];
    const covered = external ? stations.every((st) => coverage([origin[1]! + st - 5, origin[2]! + edge.t / 2 - 5, origin[1]! + st + 5, origin[2]! + edge.t / 2 + 5], covers)) : false;
    const preserve = Boolean(d.ejConnections?.selections?.[c.id]?.physicallyDrilled || d.productionRelease?.immutable || d.fastenersR7?.records?.[c.id]?.physicallyDrilled);
    const section = m.sectionsData ? (sections.get(edge.source.sectionId) ?? -1) : undefined,
      cfg = d.sections?.[section as number],
      shelfIndex = Number(edge.id.match(/SHELF(\d+)$/)?.[1]) - 1,
      drawerIndex = Number(edge.source.drawerId?.match(/DRAWER(\d+)$/)?.[1]) - 1,
      identityBinding = JSON.stringify([cfg?.uiSectionId ?? edge.source.moduleId ?? null, cfg?.shelfUids?.[shelfIndex] ?? cfg?.drawerUids?.[drawerIndex] ?? edge.id, anchor.id]);
    joints.push({
      id: c.id,
      edge,
      anchor,
      role,
      identityBinding,
      synthetic: !!c.synthetic,
      internalPartition: anchor.source.kind === 'divider',
      externallyVisible: external,
      covered,
      coverageEvidence: { covers, headDiameter: 10, headSeat: null, method: 'complete head footprint rectangular union at actual contact face' },
      origin,
      u,
      s,
      w,
      length,
      availableDepth: edge.box[1][0] - edge.box[0][0],
      stations,
      edgeFace,
      anchorFace,
      outerFace,
      cupFace: upright ? 'outside' : edge.source.kind === 'top' ? 'inside' : 'outside',
      preserve,
      // MOD-DEC-364: a narrow joint with one fastener has its own dowel against turning instead of those of 192.
      ...(narrowDowelled.has(c.id) ? { narrowJointDowel: true } : {}),
    });
  }
  const anchorJoints = new Map<string, Rec[]>();
  for (const j of joints) {
    if (!anchorJoints.has(j.anchor.id)) anchorJoints.set(j.anchor.id, []);
    anchorJoints.get(j.anchor.id)!.push(j);
  }
  for (const j of joints) {
    // A shelf on the other side of the partition is opposed when their thicknesses overlap in height, not only at
    // the same level: shelves 1 mm apart drill the same zone of the partition (W8, FINDINGS 342).
    j.opposed = j.internalPartition && anchorJoints.get(j.anchor.id)!.some((k) => k.id !== j.id && k.u[0] === -j.u[0] && sameLevel(j, k));
    if (!j.opposed) continue;
    j.confirmatAssembly = false;
    // MOD-DEC-343: the rows from the finished front edge of the partition, as stations of the shelf. The shelf whose
    // left end stands at the partition is right of it (u = +x).
    const front = j.anchor.box[0][1],
      rows = sharedShelfRows(j.anchor.box[1][1] - front, j.u[0] > 0, !!(d.system32Policy?.enabled ?? d.system32Assist));
    j.sharedShelf = { ...rows, stationsMm: rows.rowsMm.map((r) => r + front - j.edge.box[0][1]) };
  }
  const operationsByJoint = new Map<unknown, Rec[]>();
  for (const o of operations)
    if (o) {
      if (!operationsByJoint.has(o.jointId)) operationsByJoint.set(o.jointId, []);
      operationsByJoint.get(o.jointId)!.push(o);
    }
  const existingWood: Rec[] = [];
  for (const c of m.connections.filter((c: Rec) => c.type === 'woodenDowel'))
    existingWood.push({ id: c.id, partPair: [c.a, c.b], profileId: 'LEGACY_WOOD/' + c.subtype, frameId: 'PROJECT_WORLD', operations: operationsByJoint.get(c.id) || [] });
  const unknownPanels = new Set(unknownOperations.map((h: Rec) => h.panel));
  for (const j of joints) if (unknownPanels.has(j.edge.id) || unknownPanels.has(j.anchor.id)) j.geometryUnknown = true;
  return { parts, joints, operations: operations.filter(Boolean), grooves, existingWood, inventoryComplete: unknownOperations.length === 0, unknownOperations };
}

/** An r7 operation as a hole of the model, in the local coordinates of its part (f7Hole r1.html:88089). */
function f7Hole(o: Rec, index: Map<string, Rec>): Rec {
  const part = index.get(o.partId)!,
    p = part.source,
    v = f7LocalPoint(part, o.entry),
    faceOp = ['CAM', 'ANCHOR', 'DOUBLE_THROUGH', 'WOOD_ANCHOR', 'CONFIRMAT_THROUGH'].includes(o.role),
    physical = o.faceId,
    edge = p.edgeGeometry?.[physical]?.slot || (edgeGeometryForPart(p) as Rec)[physical]?.slot;
  return {
    panel: p.id,
    mode: faceOp ? 'face' : 'edge',
    face: faceOp ? physical : undefined,
    edge: faceOp ? undefined : edge,
    x: faceOp ? v[0] : undefined,
    y: faceOp ? v[1] : undefined,
    offset: faceOp ? undefined : ['left', 'right'].includes(physical) ? v[1] : v[0],
    diameter: o.diameter,
    depth: o.kind === 'through' ? 'through' : o.depth,
    code: `D${o.diameter}/${o.kind === 'through' ? 'сквозной' : 'L' + o.depth}`,
    purpose: 'Номинально · ' + o.role + ' · производство требует подтверждения для изготовления',
    operationId: o.operationId,
    connectionId: o.jointId,
    jointId: o.jointId,
    f7Operation: clone(o),
    productionExecutable: false,
    productionQualified: false,
    release: false,
    toolTravel: null,
    status: o.status,
    dimensionBasis: 'FINISHED_PART',
    sourceBasis: 'TECH_R4_R5_R6_NOMINAL',
    coordinateStage: 'POST_EDGING',
    dpOwners: [p.id],
    jointType: 'FASTENERS_R7',
    requiresTechnologyConfirmation: true,
  };
}

export interface FastenerOptions {
  /** Depth of the confirmat hole in the receiving edge, mm. */
  confirmatEdgeDepthMm: number;
  /** Room walls the outer sides stand against. */
  walls?: readonly WallFace[];
}

/**
 * Applies the r7 fasteners to the carcass model in place (model wrapper r1.html:88181): the holes of every
 * planned joint replace those of the base model, its connection gets the profile and the kit count, the plan is
 * kept as `fastenersR7`. Nothing happens when the project turns r7 off.
 */
export function applyFastenersR7(m: Rec, d: Rec, options: FastenerOptions): void {
  if (!d.fastenersR7?.enabled) return;
  let input = f7Input(m, d, options.walls),
    result = plan(input, d.fastenersR7, options.confirmatEdgeDepthMm);
  // A spare level of a shelf support is drilled only where it meets no other hole (MOD-DEC-193, IR6-02); it was
  // checked against the base model, so it yields to the planned joint it meets — a staggered row on the other side
  // of a partition reaches its line 37 (MOD-DEC-343, FINDINGS 342) — and the plan is made again without it.
  const spares = new Map<string, Rec>(m.holes.filter((h: Rec) => h.system32Level === 'spare').map((h: Rec) => [h.operationId, h])),
    yielded = new Set<string>(result.joints.flatMap((j: Rec) => j.errors.filter((e: Rec) => e.code === 'HOLE_COLLISION' && spares.has(e.with)).map((e: Rec) => e.with as string)));
  if (yielded.size) {
    m.holes = m.holes.filter((h: Rec) => !yielded.has(h.operationId));
    for (const id of yielded) {
      const h = spares.get(id)!;
      m.system32Supports.rejected.push({ operationId: id, panel: h.panel, deltaMm: (id.endsWith('-S32-LOW') ? -1 : 1) * wardrobeFill.constants.spareLevel.value, reason: 'FASTENER_COLLISION', mainPreserved: true });
    }
    m.system32Supports.spareCount -= yielded.size;
    input = f7Input(m, d, options.walls);
    result = plan(input, d.fastenersR7, options.confirmatEdgeDepthMm);
  }
  const successful = new Set(result.joints.filter((j: Rec) => !j.errors.length && !j.preserve && j.profileId).map((j: Rec) => j.id)),
    valid = result.operations.filter((o: Rec) => successful.has(o.jointId)),
    boxes = new Map(carcassBoxes(m).map((b) => [b.id, b])),
    index = new Map<string, Rec>(m.parts.filter((p: Rec) => boxes.has(p.id)).map((p: Rec) => [p.id, f7Part(p, boxes.get(p.id)!)]));
  m.holes = m.holes.filter((h: Rec) => !successful.has(h.connectionId)).concat(valid.map((o: Rec) => f7Hole(o, index)));
  const resultJoints = new Map<string, Rec>();
  for (const j of result.joints) if (!resultJoints.has(j.id)) resultJoints.set(j.id, j);
  m.connections = m.connections.map((c: Rec) => {
    const j = resultJoints.get(c.id);
    return successful.has(c.id)
      ? { ...c, legacyType: c.type, type: isConfirmatProfile(j!.profileId) ? c.type : 'eccentricShelf', jointType: 'FASTENERS_R7', fastener: j!.profileId, qty: j!.kits.length, physicalVerified: false, productionExecutable: false }
      : c;
  });
  m.connections.push(
    ...result.joints
      .filter((j: Rec) => j.synthetic && successful.has(j.id))
      .map((j: Rec) => ({ id: j.id, a: j.edge.id, b: j.anchor.id, type: 'drawerBox', joint: 'ldsp-bottom', jointType: 'FASTENERS_R7', fastener: j.profileId, qty: j.kits.length, physicalVerified: false, productionExecutable: false })),
  );
  const localOpenFields = m.parts
    .filter((p: Rec) => p.kind === 'drawerBottom' && p.materialFamily === 'LDSP')
    .map((p: Rec) => ({
      partId: p.id,
      drawerId: p.drawerId,
      field: 'BOYARD bottom/rear-hook/runner compatibility and assembly',
      status: 'UNKNOWN',
      constructionPreserved: true,
      note: 'No shortened bottom/rear-wall conversion; DB8781 36.5/min37 remains null',
    }));
  wardrobeFastenerSummary(m, successful, result);
  m.fastenersR7 = { ...result, localOpenFields };
}
