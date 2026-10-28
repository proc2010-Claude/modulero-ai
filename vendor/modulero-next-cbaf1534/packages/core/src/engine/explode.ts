// «Взрыв» of «Рентген» (owner 2026-10-23, FINDINGS 670): the exploded view of any product. Every part moves away from
// the centre along its own direction, so the view shows what the product is made of and how it goes together. Only
// the picture moves: the graph, the sizes, the drilling and the price stay as they are.
//
// How the parts move (FINDINGS 671). A unit is an assembly of the graph (a carcass, a section, a drawer, a kitchen
// module) without the parts that stand outside the box of the rest of it (explodeUnits), joined with every other
// unit whose box overlaps its box: a drawer inside its carcass, a section inside its module. Units never overlap one
// another, they only touch. At full «Взрыв»:
//   - the parts of a unit spread from its centre: the distance of the centre of a part from the centre of the unit
//     grows by EXPLODE_SPREAD of itself;
//   - the units move away from the centre of the product by EXPLODE_UNIT_SPREAD of their distance from it.
// Each axis has its own share (explodeAxes), the same for every part. Spreading from one centre keeps the sizes of the
// parts and only adds to every gap along each axis, so two parts that did not cross never cross; two parts that
// touched come apart. The units spread more than their parts (EXPLODE_UNIT_SPREAD > EXPLODE_SPREAD), so two
// neighbouring units, such as two kitchen modules side by side, come apart as well. Then the whole picture is lifted
// so that no part goes under the floor (explodeLift).
import type { Vec3 } from './contract.js';
import type { Scene3d, ScenePart } from './scene.js';

/** At full «Взрыв» the distance of a part from the centre of its unit grows by this share of itself (Д, FINDINGS 671). */
export const EXPLODE_SPREAD = 0.8;
/** At full «Взрыв» the distance of a unit from the centre of the product grows by this share (Д, FINDINGS 671). */
export const EXPLODE_UNIT_SPREAD = 1;

/** The largest spread of one axis over the others (explodeAxes): a flat product does not fly apart across itself (Д). */
export const EXPLODE_AXIS_MAX = 3;

type Box = { min: Vec3; max: Vec3 };

/** Boxes closer than this (mm) along an axis only touch: rounding of the placements is not an overlap. */
const TOUCH_MM = 0.01;

const centreOf = (b: Box): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
const overlap = (a: Box, b: Box) => [0, 1, 2].every((i) => a.min[i] < b.max[i] - TOUCH_MM && b.min[i] < a.max[i] - TOUCH_MM);
const union = (a: Box, b: Box): Box => ({
  min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
  max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
});

/**
 * The units of «Взрыв», in the order of the parts. A unit starts as an assembly of the graph; a part that does not
 * overlap the box of the other parts of its assembly stands apart as a unit of its own (the worktop of a kitchen run,
 * a front before its drawer box, a plinth under the carcass). Then units are joined while their boxes overlap.
 */
export function explodeUnits(parts: readonly Pick<ScenePart, 'id' | 'assemblyId' | 'boxMm'>[]): { box: Box; ids: string[] }[] {
  const byAssembly = new Map<string, Pick<ScenePart, 'id' | 'boxMm'>[]>();
  for (const p of parts) byAssembly.set(p.assemblyId, [...(byAssembly.get(p.assemblyId) ?? []), p]);
  const units: { box: Box; ids: string[] }[] = [];
  for (const members of byAssembly.values()) {
    let core: { box: Box; ids: string[] } | null = null;
    for (const p of members) {
      const others = members.filter((q) => q !== p);
      if (others.length && !overlap(p.boxMm, others.map((q) => q.boxMm).reduce(union))) units.push({ box: p.boxMm, ids: [p.id] });
      else if (core) {
        core.box = union(core.box, p.boxMm);
        core.ids.push(p.id);
      } else units.push((core = { box: p.boxMm, ids: [p.id] }));
    }
  }
  // A joined unit is larger and may now overlap a unit it did not overlap before: join until no two overlap.
  for (let joined = true; joined; ) {
    joined = false;
    for (let i = 0; i < units.length && !joined; i++)
      for (let j = i + 1; j < units.length; j++)
        if (overlap(units[i].box, units[j].box)) {
          units[i] = { box: union(units[i].box, units[j].box), ids: [...units[i].ids, ...units[j].ids] };
          units.splice(j, 1);
          joined = true;
          break;
        }
  }
  return units;
}

/**
 * The spread along each product axis, so that a product spreads by about as many millimetres along each of its sizes:
 * the mean of the three sizes over the size along the axis, at most EXPLODE_AXIS_MAX. A tall wardrobe spreads less
 * up and more to the front (its doors leave the carcass), a long kitchen run less along the wall.
 */
export function explodeAxes(bounds: Box): Vec3 {
  const sizes = [0, 1, 2].map((i) => bounds.max[i] - bounds.min[i]),
    mean = (sizes[0] + sizes[1] + sizes[2]) / 3;
  return sizes.map((s) => (s > 0 ? Math.min(EXPLODE_AXIS_MAX, mean / s) : 1)) as Vec3;
}

/** How far each part moves at full «Взрыв» (mm, product axes), by part id; the slider takes a share of it. */
export function explodeOffsets(scene: Pick<Scene3d, 'parts' | 'boundsMm'>): Map<string, Vec3> {
  const centre = centreOf(scene.boundsMm),
    axes = explodeAxes(scene.boundsMm),
    byId = new Map(scene.parts.map((p) => [p.id, p])),
    out = new Map<string, Vec3>();
  for (const unit of explodeUnits(scene.parts)) {
    const u = centreOf(unit.box);
    for (const id of unit.ids) {
      const p = centreOf(byId.get(id)!.boxMm);
      out.set(id, [0, 1, 2].map((i) => axes[i] * ((u[i] - centre[i]) * EXPLODE_UNIT_SPREAD + (p[i] - u[i]) * EXPLODE_SPREAD)) as Vec3);
    }
  }
  return out;
}

/**
 * How far the whole picture is lifted (mm) at a share `level` (0 … 1) of «Взрыв»: the lowest point of the parts stays
 * where it was (on the floor), nothing goes under it.
 */
export function explodeLift(scene: Pick<Scene3d, 'parts' | 'boundsMm'>, offsets: ReadonlyMap<string, Vec3>, level: number): number {
  let lowest = Infinity;
  for (const p of scene.parts) lowest = Math.min(lowest, p.boxMm.min[2] + level * (offsets.get(p.id)?.[2] ?? 0));
  return scene.parts.length ? Math.max(0, scene.boundsMm.min[2] - lowest) : 0;
}
