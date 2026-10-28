// The stage «Материалы и опции» of the kitchen (before the pilot, FINDINGS 1141–1150): the decor of the corpora and of
// the fronts of the whole kitchen and of the selected module («Наследовать общий»), as kflowPanel 'materials' of the
// prototype (r1.html:70304) and its change handler (r1.html:70466, 70485). The prototype offered four codes
// (kflowMaterials, r1.html:69671); the choice here is the whole shared decor list of the release (catalog/decors.ts) and the
// prototype's W960, which the catalogue has not (FINDINGS 1141). The project keeps the code of the decor, as in r1:
// corpusMaterial, facadeMaterial of the kitchen and of a module (materialCodeOf, carcass.ts). The material of the facades
// of the whole kitchen, «материал → исполнение → цвет» of the catalogue of the release (MOD-DEC-573, facade-choice.ts),
// is chosen here as well; the decor of the fronts is then its colour: of its board (ЛДСП, ЛМДФ) or a sample.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { decorsOf } from '../catalog/decors.js';
import { facadeExecutionOf, facadeMaterialOf, type FacadeMaterial } from '../catalog/hardware/facades.js';
import { kitchen as kitchenPolicy } from '../engine/policy/kitchen.js';
import { FACADE_COLOR_TEXT_MAX } from '../wardrobe/facade-edit.js';
import { hasFront, knownFrontType, supported } from './carcass.js';
import { kitchenProjectOfScene, kitchenSceneError, kitchenSceneOf, type KitchenEdit } from './editor.js';
import { decorIdOfCode } from './facade-choice.js';
import { moduleEdit } from './module-fill.js';
import type { KitchenFacadeChoice, KitchenProject } from './project.js';
import { isLegacyCorner } from './room.js';

/** A decor of the choice: the code the project keeps, its name and its group in the list. */
export interface KitchenDecor {
  code: string;
  label: string;
  group: string;
}

/**
 * The decors of the kitchen: W960 of the prototype's list (no record in the shared catalogue, FINDINGS 1141), then the
 * shared catalogue in its order, grouped by brand and group. Visual selection: no decor is production-ready (decors.ts).
 */
export function kitchenDecors(hw: HardwareCatalogs): KitchenDecor[] {
  return [
    { code: 'W960', label: 'EGGER W960 · белый (из списка r1, в каталоге декоров нет)', group: 'EGGER · Нейтральный' },
    ...decorsOf(hw.materials).map((d) => ({ code: d.code, label: `${d.brand} ${d.code} · ${d.name}`, group: `${d.brand} · ${d.group}` })),
  ];
}

export type KitchenMaterialRole = 'corpus' | 'facade';
const KEY = { corpus: 'corpusMaterial', facade: 'facadeMaterial' } as const;

/** One select of the stage: the value the calculation reads and its choices; a code outside the list is kept and said. */
export interface KitchenMaterialField {
  role: KitchenMaterialRole;
  label: string;
  /** The stored code; '' — the module inherits the kitchen's. */
  value: string;
  options: KitchenDecor[];
  /** The module's select starts with «Наследовать общий». */
  inherit: boolean;
}

/** The stage «Материалы и опции»: the kitchen's two decors; the selected module's own, when it has calculated geometry. */
export interface KitchenMaterials {
  kitchen: KitchenMaterialField[];
  /** null — no module selected; [] with a note — the module has no own decor (r1.html:70304). */
  module: KitchenMaterialField[] | null;
  note: string | null;
}

/** The list with a stored code it has not (an older file, another tool): the code stays chosen, said as recorded. */
function optionsWith(code: string, all: KitchenDecor[]): KitchenDecor[] {
  return !code || all.some((d) => d.code === code) ? all : [{ code, label: `${code} · записан в проекте, в каталоге декоров нет`, group: 'В проекте' }, ...all];
}

export function kitchenMaterials(p: KitchenProject, hw: HardwareCatalogs, id: string | null): KitchenMaterials {
  const all = kitchenDecors(hw),
    fronts = kitchenFacadeDecors(p, hw),
    field = (role: KitchenMaterialRole, label: string, value: string, inherit: boolean): KitchenMaterialField => ({ role, label, value, options: optionsWith(value, role === 'facade' ? fronts : all), inherit });
  const out: KitchenMaterials = { kitchen: [field('corpus', 'Материал корпусов', p.corpusMaterial, false), field('facade', 'Материал фасадов', p.facadeMaterial, false)], module: null, note: null };
  const m = id ? kitchenSceneOf(p, hw).modules.find((x) => x.id === id) : null;
  if (!m) return out;
  if (isLegacyCorner(m) || !supported(m)) return { ...out, module: [], note: 'Локальные параметры доступны для рассчитанного обычного корпуса.' };
  out.module = [field('corpus', 'Корпус выбранного модуля', m.corpusMaterial || '', true)];
  if (knownFrontType(m) && hasFront(m)) out.module.push(field('facade', 'Фасад выбранного модуля', m.facadeMaterial || '', true));
  return out;
}

const known = (code: string, current: string, hw: HardwareCatalogs) => code === current || kitchenDecors(hw).some((d) => d.code === code);

/** Why the decor may not be the colour of the fronts of the material chosen (a board of other decors); null — it may. */
function frontDecorProblem(p: KitchenProject, hw: HardwareCatalogs, code: string): string | null {
  const m = p.facadeChoice ? facadeMaterialOf(hw.facades, p.facadeChoice.materialId) : undefined;
  return m?.color === 'BOARD_DECOR' && !kitchenFacadeDecors(p, hw).some((d) => d.code === code) ? `Декор «${code}» не входит в цвета материала «${m.title}». Проект не изменён.` : null;
}

/** «Материал корпусов» / «Материал фасадов» of the whole kitchen (kflow-corpus, kflow-facade, r1.html:70466). */
export function setKitchenMaterial(p: KitchenProject, hw: HardwareCatalogs, role: KitchenMaterialRole, code: string): KitchenEdit {
  const key = KEY[role];
  if (!known(code, p[key], hw)) return { ok: false, problem: `Декора «${code}» нет в каталоге декоров. Проект не изменён.` };
  const wrong = role === 'facade' && code !== p[key] ? frontDecorProblem(p, hw, code) : null;
  if (wrong) return { ok: false, problem: wrong };
  if (code === p[key]) return { ok: true, project: p };
  return { ok: true, project: { ...p, [key]: code }, notice: 'Общий материал изменён' };
}

/**
 * The decor of the selected module (kflow-local-corpus, kflow-local-facade, r1.html:70485): '' or null — «Наследовать
 * общий», the module's own value removed; the module is checked by the one check of K3/K4 as every edit of a module.
 */
export function setKitchenModuleMaterial(p: KitchenProject, hw: HardwareCatalogs, id: string, role: KitchenMaterialRole, code: string | null): KitchenEdit {
  const key = KEY[role],
    m = kitchenSceneOf(p, hw).modules.find((x) => x.id === id),
    current = (m?.[key] as string | undefined) || '';
  if (code && !known(code, current, hw)) return { ok: false, problem: `Декора «${code}» нет в каталоге декоров. Проект не изменён.` };
  const wrong = role === 'facade' && code && code !== current ? frontDecorProblem(p, hw, code) : null;
  if (wrong) return { ok: false, problem: wrong };
  if (m && role === 'facade' && !(knownFrontType(m) && hasFront(m))) return { ok: false, problem: 'У этого модуля нет рассчитанного фасада. Проект не изменён.' };
  if (m && (code || '') === current) return { ok: true, project: p };
  return moduleEdit(p, hw, id, (c) => (c[key] = code || null), 'Параметр детали изменён');
}

// ---------------------------------------------------------------- «материал → исполнение → цвет» (MOD-DEC-573)

/** The longest colour code or species of veneer the field takes (as the wardrobe's, FINDINGS 1335). */
export { FACADE_COLOR_TEXT_MAX };

/** The front of a board of the decor by default (MOD-DEC-180): the thickness of ЛДСП «Толщина корпуса» in a kitchen. */
export const KITCHEN_FRONT_THICKNESS_MM = kitchenPolicy.constants.frontThickness.value;

/**
 * The decors the fronts may take: of the board of the material chosen (ЛДСП, ЛМДФ: the decors of the catalogue with
 * that board), otherwise every decor of the kitchen — the board of the prototype, or a sample of the colour of a bought
 * front. A material whose colour is a species (veneer) has no decor: its fronts keep the decor for the view only.
 */
export function kitchenFacadeDecors(p: KitchenProject, hw: HardwareCatalogs): KitchenDecor[] {
  const all = kitchenDecors(hw),
    m = p.facadeChoice ? facadeMaterialOf(hw.facades, p.facadeChoice.materialId) : undefined;
  return m?.color === 'BOARD_DECOR' && m.decors ? all.filter((d) => m.decors!.includes(decorIdOfCode(d.code, hw) ?? '')) : all;
}

/** What the stage shows of the material of the facades: null — the fronts of the prototype, of a board of the decor. */
export interface KitchenFacadeSummary extends KitchenFacadeChoice {
  /** The material in the catalogue of the release; undefined — not in it (the graph says so, FACADE_MATERIAL_CATALOG). */
  material: FacadeMaterial | undefined;
  /** The execution is in the catalogue. */
  executionKnown: boolean;
}

export function kitchenFacadeChoiceOf(p: KitchenProject, hw: HardwareCatalogs): KitchenFacadeSummary | null {
  const c = p.facadeChoice;
  if (!c) return null;
  const material = facadeMaterialOf(hw.facades, c.materialId);
  return { ...c, material, executionKnown: !!facadeExecutionOf(material, c.executionId) };
}

/**
 * The material of the facades of the whole kitchen (MOD-DEC-573): `materialId` null — the fronts of the prototype, of a
 * board of the decor; a material of the catalogue of the release with its execution (the first one, or the one kept
 * when the material stays) and the colour code or the species of veneer. The thickness of a front becomes that of the
 * execution, unless the module fixes its own (a corner kit, a glass door; ЛДСП keeps the board of the fronts of the
 * kitchen, 18 mm by default, MOD-DEC-180): every module is checked again — a module whose hinges or kit do not take the
 * new thickness refuses the change, in its words. With a board of other decors (ЛДСП, ЛМДФ) the decor of the fronts
 * becomes one of them (the one kept, that of the corpora, or the first) and a module's own decor outside them is reset.
 */
export function setKitchenFacadeChoice(p: KitchenProject, hw: HardwareCatalogs, choice: { materialId: string | null; executionId?: string; colorText?: string | null }): KitchenEdit {
  const no = (problem: string): KitchenEdit => ({ ok: false, problem });
  if (p.modules.some(isLegacyCorner)) return no('LEGACY_CORNER_VERSION: сохранённая пара доступна только для чтения.');
  let next: KitchenFacadeChoice | null = null,
    notice = 'Фасады из плиты выбранного декора, как в прототипе.';
  if (choice.materialId !== null) {
    const m = facadeMaterialOf(hw.facades, choice.materialId);
    if (!m) return no(`Материала фасадов ${choice.materialId} нет в каталоге. Проект не изменён.`);
    const now = p.facadeChoice,
      same = now?.materialId === m.id,
      e = facadeExecutionOf(m, choice.executionId ?? (same ? now!.executionId : m.executions[0]!.id));
    if (!e) return no(`У материала «${m.title}» нет исполнения ${choice.executionId}. Проект не изменён.`);
    const text = m.color === 'BOARD_DECOR' ? null : (choice.colorText !== undefined ? choice.colorText : same ? now!.colorText : null)?.trim() || null;
    if (text && text.length > FACADE_COLOR_TEXT_MAX) return no(`Код цвета — не длиннее ${FACADE_COLOR_TEXT_MAX} знаков. Проект не изменён.`);
    next = { materialId: m.id, executionId: e.id, materialTitle: m.title, executionTitle: e.title, supply: m.supply, thicknessMm: e.thicknessMm, colorText: text };
    const t = e.thicknessMm === 'BOARD' ? `${KITCHEN_FRONT_THICKNESS_MM} мм, как фасады кухни` : `${e.thicknessMm} мм`,
      price = e.priceRubPerM2.value;
    notice =
      m.supply === 'MANUFACTURE'
        ? `Фасады: ${m.title}, ${t} — изготавливаются в заказе из плиты выбранного декора, в раскрое и присадке.`
        : `Фасады: ${m.title}, ${e.title}${text ? ', ' + text : ''} — готовые покупные, ${price !== null ? `${price} ₽/м², ориентир` : 'цена не определена'}; чашки петель сверлит поставщик.`;
  }
  const q: KitchenProject = { ...p, modules: p.modules };
  if (next) q.facadeChoice = next;
  else delete q.facadeChoice;
  const fronts = kitchenFacadeDecors(q, hw),
    allowed = (code: string | null | undefined) => !!code && fronts.some((d) => d.code === code);
  if (!allowed(q.facadeMaterial)) {
    const code = [p.corpusMaterial].find(allowed) ?? fronts[0]?.code;
    if (!code) return no('У материала нет декоров в каталоге декоров. Проект не изменён.');
    q.facadeMaterial = code;
  }
  const reset = q.modules.filter((m) => m.facadeMaterial && !allowed(m.facadeMaterial as string)).map((m) => m.id);
  if (reset.length) q.modules = q.modules.map((m) => (reset.includes(m.id) ? { ...m, facadeMaterial: null } : m));
  const s = kitchenSceneOf(q, hw),
    error = kitchenSceneError(s);
  if (error) return no('Материал фасадов не изменён: ' + error);
  const decor = q.facadeMaterial !== p.facadeMaterial ? ` Декор фасадов — ${q.facadeMaterial}.` : '',
    own = reset.length ? ` Свой декор фасада сброшен у модулей ${reset.join(', ')}.` : '';
  return { ok: true, project: kitchenProjectOfScene(s), notice: notice + decor + own };
}
