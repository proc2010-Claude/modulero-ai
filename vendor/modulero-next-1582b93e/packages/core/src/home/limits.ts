// r5 (MOD-AI-35 of the project «ИИ-диалог Modulero»; FINDINGS 3305): refusals of a size that name the limit — the axis,
// the size and its range, and the depth of the body a shared shelf needs.
import { HOME, sharedShelfMinDepth } from '../engine/policy/home.js';
import { availableBays, bay, nicheLimits } from './geometry.js';
import type { Body, HomeProject, PhysicalGraph, Shelf } from './types.js';

const AXES = [
  ['w', 'ширина', HOME.bodyWidth],
  ['h', 'высота', HOME.bodyHeight],
  ['d', 'глубина', HOME.bodyDepth],
] as const;

const bodyTag = (p: HomeProject, b: Body) => (p.bodies.length > 1 ? `Корпус ${p.bodies.indexOf(b) + 1}: ` : '');

/** «Высота корпуса 2400 мм — вне области 300–2200 мм.» for each size of the body out of its range; null when none is. */
export function sizeOutside(p: HomeProject, b: Body): string | null {
  const out = AXES.filter(([k, , [lo, hi]]) => Number.isFinite(b[k]) && (b[k] < lo || b[k] > hi)).map(
    ([k, name, [lo, hi]]) => `${name} корпуса ${b[k]} мм — вне области ${lo}–${hi} мм`,
  );
  return out.length ? `${bodyTag(p, b)}${out.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : null;
}

/**
 * A partition too shallow for shelves from both sides (MOD-DEC-343): the depth it needs and the depth of the body that
 * gives it — the partition is shallower than the body by its back and its gaps.
 */
export function sharedShelfBodyDepth(p: HomeProject, graph: PhysicalGraph, jointId: string | undefined): string | null {
  const j = graph.joints.find((x) => x.id === jointId),
    stud = j && graph.parts.find((q) => q.id === j.studPartId),
    b = stud && p.bodies.find((x) => stud.id.startsWith(x.id + ':'));
  if (!stud || !b) return null;
  const need = sharedShelfMinDepth(),
    depth = Math.ceil(b.d + need - stud.extent_mm[1] - 1e-6);
  return `${bodyTag(p, b)}Перегородка слишком мелкая: гнёзда полок с обеих сторон по системе 32 мм помещаются в перегородке глубиной от ${need} мм — это глубина корпуса от ${depth} мм, сейчас ${b.d} мм.`;
}

/**
 * «Полка 1 (41 мм от пола) выходит за нишу: низ полки — от 89 до 263 мм от пола.» A shelf of a valid niche whose height
 * leaves the interior; null for a shelf whose niche or fields are broken (the general refusal).
 */
export function shelfOutside(p: HomeProject, b: Body, s: Shelf): string | null {
  const a = bay(p, b, s);
  if (!Number.isFinite(a.left + a.right) || !Number.isFinite(s.y) || typeof s.fixed !== 'boolean') return null;
  if (!availableBays(p, b).some((q) => q.lo === s.lo && q.hi === s.hi)) return null;
  // r5 (MOD-AI-75): the height of its niche — over or under a shelf a partition stands on.
  const lim = nicheLimits(p, b, s),
    lo = Math.floor(lim.shelfLow) + 1,
    hi = Math.ceil(lim.shelfHigh - p.thickness) - 1,
    r = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
  return `${bodyTag(p, b)}Полка ${b.shelves.indexOf(s) + 1} (${r(s.y)} мм от пола) выходит за нишу: низ полки — от ${lo} до ${hi} мм от пола.`;
}
