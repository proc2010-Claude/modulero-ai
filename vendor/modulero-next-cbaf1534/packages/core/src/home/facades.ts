// The material of the fronts of other furniture (r5, MOD-DEC-573, 577): «материал → исполнение → цвет» of the catalogue of
// the materials of the facades of the release (catalogs/materials/facades.json), as the wardrobe and the kitchen have
// it. The project keeps the reference in `facadeChoice` with the supply and the thickness it was built with; without it
// the fronts are of the board of the project, in its decor. ЛДСП is that board (its execution «Толщина корпуса»), ЛМДФ
// a board of its own decor, the others are bought ready-made: out of the cutting plan, their cups drilled by the
// supplier (277). Pure.
import { facadeMaterialOf } from '../catalog/hardware/facades.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { facadeChoiceProblems } from '../engine/policy/facade-materials.js';
import { mfLabel } from '../engine/policy/materials.js';
import type { PolicyState } from '../engine/policy/project-state.js';
import type { HomeProject, SemanticRole } from './types.js';

/** The parts the material of the fronts applies to: the doors and the fronts of the drawers. */
export const FRONT_ROLES: ReadonlySet<SemanticRole> = new Set<SemanticRole>(['door', 'drawer_front']);

/** The fronts are bought ready-made. */
export const purchasedFronts = (p: HomeProject): boolean => p.facadeChoice?.supply === 'PURCHASED';

/** «МДФ в эмали · Мат, 19 мм»: the material and the execution. */
export const homeFacadeTitle = (p: HomeProject): string | null => (p.facadeChoice ? `${p.facadeChoice.materialTitle} · ${p.facadeChoice.executionTitle}` : null);

/** The family of the material of a front: bought ready-made, a board of ЛМДФ, or the board of the project (ЛДСП). */
export function homeFrontFamily(p: HomeProject, hw: HardwareCatalogs): 'PURCHASED_FINISHED' | 'LMDF' | 'LDSP' {
  const c = p.facadeChoice;
  if (!c) return 'LDSP';
  if (c.supply === 'PURCHASED') return 'PURCHASED_FINISHED';
  return facadeMaterialOf(hw.facades, c.materialId)?.boardProduct?.includes('ЛМДФ') ? 'LMDF' : 'LDSP';
}

/** The decors a board of ЛМДФ of the choice is made in, with their labels; empty — the material has no decor of its own. */
export function homeFacadeDecors(p: HomeProject, hw: HardwareCatalogs): { id: string; label: string }[] {
  const m = p.facadeChoice ? facadeMaterialOf(hw.facades, p.facadeChoice.materialId) : null;
  if (!m || homeFrontFamily(p, hw) !== 'LMDF') return [];
  return (m.decors ?? []).map((id) => ({ id, label: String(mfLabel(id, hw.materials)) }));
}

/**
 * The choice against the catalogue of the release (MOD-DEC-351, 573): the material and the execution are in it with the
 * supply and the thickness the project was built with, and the decor of a board of its own is one the material allows.
 * Empty — the choice holds.
 */
export function homeFacadeProblems(p: HomeProject, hw: HardwareCatalogs): string[] {
  return p.facadeChoice ? facadeChoiceProblems({ materialSelection: { facade: { ...p.facadeChoice } } } as PolicyState, hw.facades) : [];
}
