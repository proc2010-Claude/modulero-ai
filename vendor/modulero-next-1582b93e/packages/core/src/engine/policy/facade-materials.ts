// The material of the facades chosen in the project (MOD-DEC-573): «материал → исполнение → цвет». The materials, the
// executions, their thicknesses, prices and colours are data of the catalogue (catalogs/materials/facades.json,
// catalog/hardware/facades.ts); the project keeps a reference to them in `materialSelection.facade` beside the record of
// the prototype (mfSelectDecor, mfSetTariff): `materialId`, `executionId`, the supply and the thickness of the execution
// as the catalogue gave them when it was chosen, `decorId`, `colorText`. The geometry reads the thickness and the
// supply from the project, as it reads every other choice; the price and the check of the choice read the catalogue
// of the release (`facadeChoiceProblems`). A record without `materialId` is the prototype's — a ready-made door of a
// decor with a HOLZCOM tariff (materials.ts) — and keeps its behaviour, so that the oracle of the prototype holds.
import { facadeExecutionOf, facadeMaterialOf, type FacadeMaterialCatalog } from '../../catalog/hardware/facades.js';
import type { PolicyState, Rec } from './project-state.js';

/** The choice of the project; null — the doors are made from the carcass board (347), or a record of the prototype. */
export interface FacadeChoice {
  materialId: string;
  executionId: string;
  materialTitle: string;
  executionTitle: string;
  supply: 'MANUFACTURE' | 'PURCHASED';
  /** The thickness of a door, mm: of the execution, or of the carcass board `t`. */
  thicknessMm: number;
  /** The execution has the thickness of the carcass board. */
  boardThickness: boolean;
  purchased: boolean;
  decorId: string | null;
  colorText: string | null;
}

/** The choice «материал → исполнение → цвет» of the project with the carcass board `t` (MOD-DEC-573), or null. */
export function facadeChoice(d: PolicyState, t: number): FacadeChoice | null {
  const c = d.materialSelection?.facade as Rec | undefined;
  if (!c || typeof c.materialId !== 'string' || typeof c.executionId !== 'string') return null;
  const board = c.thicknessMm === 'BOARD',
    supply = c.supply === 'PURCHASED' ? 'PURCHASED' : 'MANUFACTURE';
  return {
    materialId: c.materialId,
    executionId: c.executionId,
    materialTitle: String(c.materialTitle ?? c.materialId),
    executionTitle: String(c.executionTitle ?? c.executionId),
    supply,
    thicknessMm: board ? t : Number(c.thicknessMm),
    boardThickness: board,
    purchased: supply === 'PURCHASED',
    decorId: c.decorId ?? null,
    colorText: typeof c.colorText === 'string' && c.colorText ? c.colorText : null,
  };
}

/** The doors and the drawer fronts are bought ready-made: a bought material, or a decor of the prototype's record (FINDINGS 266). */
export function facadePurchased(d: PolicyState): boolean {
  const c = d.materialSelection?.facade as Rec | undefined;
  if (!c) return false;
  return typeof c.materialId === 'string' ? c.supply === 'PURCHASED' : true;
}

/** The thickness of the doors, mm: of the execution chosen (MOD-DEC-573), otherwise the carcass board `t`. */
export function facadeThickness(d: PolicyState, t: number): number {
  return facadeChoice(d, t)?.thicknessMm ?? t;
}

/** «МДФ в эмали · Мат, 19 мм»: the material and the execution. */
export const facadeChoiceTitle = (c: FacadeChoice): string => `${c.materialTitle} · ${c.executionTitle}`;

/** The price of a bought facade of the choice in the catalogue, ₽/m²; null — not in the catalogue or not known (247). */
export function facadeChoicePrice(c: FacadeChoice, catalog: FacadeMaterialCatalog): number | null {
  return facadeExecutionOf(facadeMaterialOf(catalog, c.materialId), c.executionId)?.priceRubPerM2.value ?? null;
}

/**
 * The choice against the catalogue of the release (MOD-DEC-351, 573): the material and the execution are in it, with
 * the supply and the thickness the project was built with, and the colour is one the material allows. Empty — the
 * choice holds.
 */
export function facadeChoiceProblems(d: PolicyState, catalog: FacadeMaterialCatalog): string[] {
  const c = facadeChoice(d, 0);
  if (!c) return [];
  const m = facadeMaterialOf(catalog, c.materialId),
    e = facadeExecutionOf(m, c.executionId),
    raw = (d.materialSelection?.facade as Rec).thicknessMm;
  if (!m) return [`материала фасадов «${c.materialTitle}» нет в каталоге материалов фасадов`];
  if (!e) return [`исполнения «${c.executionTitle}» материала «${m.title}» нет в каталоге материалов фасадов`];
  const out: string[] = [];
  if (m.supply !== c.supply) out.push(`материал «${m.title}» в каталоге ${m.supply === 'PURCHASED' ? 'покупной' : 'изготавливается в заказе'}, а проект построен иначе`);
  if (e.thicknessMm !== raw) out.push(`толщина исполнения «${e.title}» в каталоге ${e.thicknessMm === 'BOARD' ? 'по корпусу' : e.thicknessMm + ' мм'}, а проект построен с ${raw === 'BOARD' ? 'толщиной корпуса' : raw + ' мм'}`);
  if (c.decorId && m.decors !== null && !m.decors.includes(c.decorId)) out.push(`декор ${c.decorId} не входит в цвета материала «${m.title}»`);
  return out;
}
