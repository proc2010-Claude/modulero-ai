// The view of one wall of the kitchen (frontSVG «Вид стены», r1.html:68660): the modules standing at the wall by their
// start along it, their bottom and height, the blind part of the single-body corner, and the marks of the wall with
// what is known of their height. The prototype drew only the modules of the wall itself; the editor also shows,
// dashed, what the modules of the other walls take at this one — the depth of a module in the corner, the leg of an L
// corner, the empty reserve of the single-body corner (Д, FINDINGS 662).
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { kitchenPlan, kitchenSceneOf } from './editor.js';
import { kitchenObstacles, type KitchenObstacleView } from './obstacles.js';
import type { KitchenProject } from './project.js';
import { frontGap } from './carcass.js';
import { cornerRowSegments } from './modules.js';
import { activeWalls, canonicalWall, isFree, isSingleCorner, moduleWorldStart, wallLength } from './room.js';

/** A module, or what a module of another wall takes, at the wall: x along the wall from its start, mm. */
export interface KitchenElevationItem {
  id: string;
  name: string;
  kind: string;
  /** 'body' — the module of this wall; 'side' — a module of another wall in the corner; 'zone' — a reserve or a filler. */
  role: 'body' | 'side' | 'zone';
  x: number;
  width: number;
  floor: number;
  height: number;
  /** The blind part of the single-body corner, mm from the left of the module (the brown part of frontSVG). */
  blind: { x: number; width: number } | null;
}

export interface KitchenElevation {
  wall: { id: string; name: string; lengthMm: number; heightMm: number };
  items: KitchenElevationItem[];
  obstacles: KitchenObstacleView[];
}

/** The view of the wall `wallId`; `rows` keeps the modules of the shown rows (isVisible of the plan). */
export function kitchenWallElevation(p: KitchenProject, hw: HardwareCatalogs, wallId: string, rows: (kind: string) => boolean = () => true): KitchenElevation {
  const s = kitchenSceneOf(p, hw),
    w = activeWalls(s).includes(wallId) ? wallId : 'A',
    L = wallLength(s, w),
    W = s.room.width,
    plan = kitchenPlan(p, hw),
    right = w === 'C' || (w === 'B' && s.type === 'l' && s.orientation === 'right');
  // The stretch of a plan rectangle that touches the wall, along the wall; null when it stands off the wall.
  const along = (r: { x: number; y: number; w: number; h: number }): [number, number] | null =>
    w === 'A' ? (r.y === 0 ? [r.x, r.x + r.w] : null) : (right ? r.x + r.w === W : r.x === 0) ? [r.y, r.y + r.h] : null;
  const items: KitchenElevationItem[] = [];
  for (const m of s.modules) {
    if (isFree(m) || !rows(m.kind)) continue;
    const view = plan.modules.find((x) => x.id === m.id)!,
      base = { id: m.id, name: String(m.name ?? m.catalogId), kind: m.kind, floor: m.floor, height: m.height, blind: null };
    if (isSingleCorner(m)) {
      // The corner along its own wall (filler, body) and along the adjacent one (its depth, the empty reserve).
      const g = frontGap(s, m);
      for (const x of cornerRowSegments(s, m, w)) {
        const body = x.kind === 'corner_body';
        items.push({
          ...base,
          role: body ? 'body' : x.kind === 'corner_depth_projection' ? 'side' : 'zone',
          x: x.pos_mm,
          width: x.width_mm,
          blind: body ? { x: m.cornerSide === 'left' ? g : m.width - m.blind_nominal_mm, width: m.blind_nominal_mm - g } : null,
        });
      }
      continue;
    }
    if (m.wall === w) {
      items.push({ ...base, role: 'body', x: moduleWorldStart(s, m), width: m.width });
      // What the module also keeps free at its own wall (the end panel of a niche); the leg of an L corner is drawn at
      // the adjacent wall.
      for (const r of view.zone) {
        const a = along(r);
        if (a && a[1] > a[0]) items.push({ ...base, role: 'zone', x: a[0], width: a[1] - a[0] });
      }
      continue;
    }
    for (const [role, rects] of [
      ['side', view.body],
      ['zone', view.zone],
    ] as const)
      for (const r of rects) {
        const a = along(r);
        if (a && a[1] > a[0]) items.push({ ...base, role, x: a[0], width: a[1] - a[0] });
      }
  }
  return { wall: { id: w, name: canonicalWall(s, w), lengthMm: L, heightMm: s.room.height }, items, obstacles: kitchenObstacles(p, hw).filter((o) => o.wall === w) };
}
