// Reference data of the home domain. Values are taken from the prototype r1 (home-physical-r3). The runner DB4501Zn
// and the hardware articles are in the hardware catalogue (catalogs/, task CAT-4), not here.
import { HOME_R3, HOME_R5, homeRules } from '../engine/policy/home.js';
import type { MaterialId, RateKey, RateKeyR4, TemplateId } from './types.js';

/**
 * Rule set of new projects: r5, the rules of the wardrobe (MOD-DEC-513, FINDINGS 854). Projects of r3 and r4 keep their
 * rule set until they are updated with a preview (migrate.ts).
 */
export const GENERATOR_VERSION = HOME_R5;

export interface HomeMaterial {
  id: MaterialId;
  name: string;
  color: string;
  thickness: 16 | 18;
  materialProfile: 'kronospan-p2-18' | 'kronospan-p2-16';
}

export const materials: readonly HomeMaterial[] = [
  { id: 'oak', name: 'Светлый дуб · плита 18 мм', color: '#CCB995', thickness: 18, materialProfile: 'kronospan-p2-18' },
  { id: 'white', name: 'Тёплый белый · плита 18 мм', color: '#E9E5DC', thickness: 18, materialProfile: 'kronospan-p2-18' },
  { id: 'graphite', name: 'Графит · плита 16 мм', color: '#6C747A', thickness: 16, materialProfile: 'kronospan-p2-16' },
];

export interface BoardProfile {
  id: 'kronospan-p2-18' | 'kronospan-p2-16';
  name: string;
  thickness: 16 | 18;
  density: number;
  E: number;
  densityRange: [number, number];
  basis: string;
}

const P2_BASIS =
  'Опубликованная верхняя граница плотности и минимальный модуль упругости; декор выбирается отдельно.';

export const materialProfiles: readonly BoardProfile[] = [
  { id: 'kronospan-p2-18', name: 'Kronospan SPAANDEX P2 · 18 мм', thickness: 18, density: 670, E: 1800, densityRange: [640, 670], basis: P2_BASIS },
  { id: 'kronospan-p2-16', name: 'Kronospan SPAANDEX P2 · 16 мм', thickness: 16, density: 670, E: 1800, densityRange: [640, 670], basis: P2_BASIS },
];

export const rateNames: Readonly<Record<RateKey, string>> = {
  board: 'Плита с отходами, ₽/м² заготовок',
  edge: 'Кромка, ₽/м',
  cut: 'Раскрой и присадка, ₽/деталь',
  join: 'Соединение: 2 полных узла с отходами, ₽/стык',
  support: 'Полкодержатели: 4 шт., ₽/полку',
  glide: 'Накладки: полный закупочный KIT, ₽',
  restraint: 'Защита: полный KIT, ₽',
  assembly: 'Сборка и монтаж, ₽/изделие',
  board16: 'Плита коробок ящиков 16 мм с отходами, ₽/м²',
  join16: 'Соединение коробки: 2 полных узла, ₽/стык',
  hinge: 'Петля с планкой и винтами, ₽/комплект',
  runner: 'Пара направляющих с винтами, ₽/комплект',
  frontFix: 'Крепление фасада: 4 винта, ₽/комплект',
  handle: 'Ручка-кнопка с комплектным винтом, ₽/комплект',
};

export const rateKeys = Object.keys(rateNames) as RateKey[];

/**
 * The rates of r4 (MOD-DEC-510): a whole sheet of the cutting plan by thickness, a metre of the saw run of the plan, a
 * hole and a hinge cup of the graph, as the wardrobe counts them (505, 509); the other rates are those of r3. A rate
 * the maker leaves empty takes the price of the catalogue or a temporary one (MOD-DEC-536).
 */
export const rateNamesR4: Readonly<Record<RateKeyR4, string>> = {
  sheet18: 'Лист плиты 18 мм, ₽/лист',
  sheet16: 'Лист плиты 16 мм, ₽/лист',
  edge: rateNames.edge,
  saw: 'Распил по карте раскроя, ₽/м реза',
  hole: 'Отверстие присадки, ₽/шт.',
  cup: 'Чашка петли, ₽/шт.',
  join: rateNames.join,
  support: rateNames.support,
  glide: rateNames.glide,
  restraint: rateNames.restraint,
  assembly: rateNames.assembly,
  join16: rateNames.join16,
  hinge: rateNames.hinge,
  runner: rateNames.runner,
  frontFix: rateNames.frontFix,
  handle: rateNames.handle,
};

export const rateKeysR4 = Object.keys(rateNamesR4) as RateKeyR4[];

/** The rates of r3 the cutting plan replaces in r4: their meaning changed, they are not carried over (MOD-DEC-510). */
export const RATES_REPLACED_IN_R4: readonly RateKey[] = ['board', 'board16', 'cut'];

/** The price of the project is by the cutting plan (MOD-DEC-510): r4 and r5, which is r4 with more rules of the wardrobe. */
export const priceByPlan = (p: { generatorVersion: string }): boolean => p.generatorVersion !== HOME_R3;

/**
 * The rates of r5: those of r4 (the keys are fixed, 510); the handle is any handle of the catalogue the user chooses,
 * by the piece, not the knob of r3 (FINDINGS 965).
 */
export const rateNamesR5: Readonly<Record<RateKeyR4, string>> = { ...rateNamesR4, handle: 'Ручка с комплектными винтами, ₽/шт.' };

/** The names of the rates of the rule set of a project. */
export const rateNamesOf = (p: { generatorVersion: string }): Readonly<Record<string, string>> =>
  homeRules(p).handles ? rateNamesR5 : priceByPlan(p) ? rateNamesR4 : rateNames;

/**
 * [width, height, depth, number of bays] of the starting body of each archetype under r4: the standards of the types
 * approved by the owner (MOD-DEC-496, docs/product/HOME_STANDARDS.md). The gallery and the site show these.
 */
export const archetypeDefaults: Readonly<Record<TemplateId, readonly [number, number, number, number]>> = {
  chest: [800, 800, 450, 1],
  bedside: [450, 550, 400, 1],
  tv: [1600, 500, 400, 3],
  bookcase: [600, 2000, 300, 1],
  shoe: [800, 600, 320, 2],
  desk: [1200, 750, 600, 1],
  sideboard: [1000, 850, 450, 2],
  own: [600, 720, 400, 1],
};

/** The same under r3: the prototype's starting bodies, kept for its projects and the comparison with it. */
export const prototypeArchetypeDefaults: Readonly<Record<TemplateId, readonly [number, number, number, number]>> = {
  chest: [800, 800, 450, 1],
  bedside: [400, 550, 400, 1],
  tv: [1600, 500, 400, 3],
  bookcase: [600, 1800, 300, 1],
  shoe: [800, 600, 350, 2],
  desk: [1200, 750, 600, 1],
  sideboard: [1000, 900, 400, 2],
  own: [600, 720, 400, 1],
};

export interface HomeTemplate {
  id: TemplateId;
  name: string;
  room: string;
  description: string;
  bodies: { x: number; w: number; h: number; d: number; kind: 'cabinet' | 'desk' }[];
}

const templateText: readonly Omit<HomeTemplate, 'bodies'>[] = [
  { id: 'chest', name: 'Комод', room: 'Спальня', description: 'Три выдвижных ящика для повседневного хранения' },
  { id: 'bedside', name: 'Прикроватная тумба', room: 'Спальня', description: 'Ящик под столешницей и открытая нижняя ниша' },
  { id: 'tv', name: 'ТВ-тумба', room: 'Гостиная', description: 'Общая крышка, три секции, две дверцы' },
  { id: 'bookcase', name: 'Книжный стеллаж', room: 'Гостиная', description: 'Одна фиксированная и четыре переставляемые полки' },
  { id: 'shoe', name: 'Обувница', room: 'Прихожая', description: 'Две группы полок с короткими пролётами' },
  { id: 'desk', name: 'Письменный стол', room: 'Кабинет', description: 'Рабочая поверхность 120 см, тумба и свободное место для ног' },
  { id: 'sideboard', name: 'Низкий шкаф', room: 'Гостиная', description: 'Две дверцы и внутренние полки для закрытого хранения' },
  { id: 'own', name: 'Своя конструкция', room: 'Любая комната', description: 'Пустой корпус для собственной компоновки' },
];

const templatesOf = (sizes: typeof archetypeDefaults): readonly HomeTemplate[] =>
  templateText.map((t) => {
    const d = sizes[t.id];
    return { ...t, bodies: [{ x: 0, w: d[0], h: d[1], d: d[2], kind: t.id === 'desk' ? 'desk' : 'cabinet' }] };
  });

/** The templates of new projects (r4). */
export const templates = templatesOf(archetypeDefaults);
/** The templates of the prototype (r3), for the comparison with it. */
export const prototypeTemplates = templatesOf(prototypeArchetypeDefaults);
