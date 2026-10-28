// The material of the facades of the kitchen (MOD-DEC-573, 577): «материал → исполнение → цвет» of the catalogue of the
// materials of the facades of the release (catalogs/materials/facades.json), as the wardrobe has it
// (engine/policy/facade-materials.ts). The kitchen keeps the reference in `facadeChoice` with the supply and the
// thickness it was built with; the colour stays the decor `facadeMaterial` of the kitchen and of a module, as in r1.
// The thickness of a front is that of the execution, unless the module fixes its own (a corner kit, a glass door).
// Without a choice the fronts are the prototype's — a board of the decor, 18 mm by default (MOD-DEC-180) — and the
// oracle of the kitchen holds. Pure.
import { decorsOf } from '../catalog/decors.js';
import { facadeMaterialOf } from '../catalog/hardware/facades.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { facadeChoiceProblems } from '../engine/policy/facade-materials.js';
import type { PolicyState, Rec } from '../engine/policy/project-state.js';
import type { KitchenFacadeChoice } from './project.js';
import type { KitchenScene } from './room.js';

/** The thickness of a front of the execution chosen, mm; null — no choice, or an execution of the board of the fronts (ЛДСП). */
export function facadeChoiceThickness(s: Pick<KitchenScene, 'facadeChoice'>): number | null {
  const t = s.facadeChoice?.thicknessMm;
  return typeof t === 'number' ? t : null;
}

/** «МДФ в эмали · Мат, 19 мм»: the material and the execution. */
export const kitchenFacadeTitle = (c: KitchenFacadeChoice): string => `${c.materialTitle} · ${c.executionTitle}`;

/** What a front of the kitchen carries of the choice (part, carcass.ts): nothing without one, so the prototype's parts stay as they are. */
export function facadePartFields(s: Pick<KitchenScene, 'facadeChoice'>): Rec {
  const c = s.facadeChoice;
  if (!c) return {};
  return { facadeMaterialId: c.materialId, facadeExecutionId: c.executionId, facadeSupply: c.supply, facadeTitle: kitchenFacadeTitle(c), ...(c.colorText ? { facadeColorText: c.colorText } : {}) };
}

/** The family of the material of a front of the choice: bought ready-made, or a board of ЛМДФ or ЛДСП (the product of the board, as materials.ts reads it). */
export function facadeFamily(p: Rec, hw: HardwareCatalogs): 'PURCHASED_FINISHED' | 'LMDF' | 'LDSP' {
  if (p.facadeSupply === 'PURCHASED') return 'PURCHASED_FINISHED';
  return facadeMaterialOf(hw.facades, p.facadeMaterialId)?.boardProduct?.includes('ЛМДФ') ? 'LMDF' : 'LDSP';
}

/** The id of the decor of the catalogue of decors of a code the kitchen keeps (W980 → DEC-EGG-W980-ST7); null — not in the catalogue. */
export function decorIdOfCode(code: string | null | undefined, hw: HardwareCatalogs): string | null {
  return (code && decorsOf(hw.materials).find((d) => d.code === code)?.id) || null;
}

/**
 * The choice of the kitchen against the catalogue of the release (MOD-DEC-351, 573): the material and the execution are
 * in it with the supply and the thickness the kitchen was built with (facadeChoiceProblems), and the decor of a board
 * (ЛДСП, ЛМДФ) of the kitchen and of every module with its own is one the material allows. Empty — the choice holds.
 */
export function kitchenFacadeProblems(s: KitchenScene): string[] {
  const c = s.facadeChoice;
  if (!c) return [];
  const out = facadeChoiceProblems({ materialSelection: { facade: { ...c, decorId: null } } } as PolicyState, s.hardware.facades),
    m = facadeMaterialOf(s.hardware.facades, c.materialId);
  if (m?.color !== 'BOARD_DECOR' || !m.decors) return out;
  const allowed = (code: string) => {
    const id = decorIdOfCode(code, s.hardware);
    return id !== null && m.decors!.includes(id);
  };
  if (!allowed(s.facadeMaterial)) out.push(`декор фасадов ${s.facadeMaterial} не входит в цвета материала «${m.title}»`);
  for (const x of s.modules) if (x.facadeMaterial && !allowed(x.facadeMaterial)) out.push(`декор фасада модуля ${x.id} ${x.facadeMaterial} не входит в цвета материала «${m.title}»`);
  return out;
}
