// Policy of the sliding wardrobe on the graph (task W9, step W9.1 — the carcass and the fill): the depth the door
// system takes in front of the partitions and the shelves. The carcass of wardrobe/carcass.ts and the generator
// engine/generators/wardrobe.ts take these numbers from here (MOD-DEC-054).
//
// The depth of the system is the larger of what its two guides take from the front edge of the carcass: the upper
// two-track guide hangs under the roof, the lower one lies on the bottom or sits in two grooves cut in it; a partition
// or a shelf in front of their rear edge would hit them. The prototype took 82 mm for ЭКО and 81.5 mm for Slim
// (swReserve r1.html:59369, 63197) — the widths of the upper guides AE0492 and AS0713 in the ARISTO catalogue — and 0
// for Standard: its late layer marked the reserve of Standard unknown (depthReserved: null, r1.html:63344) and the
// geometry read the unknown as 0. Standard runs on two inlaid lower guides AS0690 (SW_ACCEPTED_RULES.profiles
// .standard, r1.html:61893): with the asymmetric profile C the grooves take 25 + 10.5 + 30 + 10.5 + 10 = 86 mm of
// the bottom (ARISTO catalogue p. 35), more than the upper guide (81.5 mm). A surface lower guide does not lie right
// under the upper one: the upper guide stands flush with the front edges of the sides, the roof and the bottom, the
// lower one is placed from it by the mounting scheme of the system. The owner set this rule — the mounting scheme of
// each profile, the larger of the two guides — and 86 mm for Standard on 2026-10-22 (MOD-DEC-354, FINDINGS 351).
//
// The numbers are data of the hardware: they move into the hardware catalogue with the tasks CAT-1…CAT-4
// (MOD-DEC-352); here they stand with the catalogue page they were read from (MOD-DEC-348: the package is the source).
//
// Version 2 (W9, the drawers behind the doors): the clearance of 5 mm on each side between the moving parts of a
// drawer and the open leaves (MOD-DEC-175, FINDINGS 551).
import { catalogSource } from '../../catalog/hardware/types.js';
import { constant, decision, prototype, type PolicyConstant, type PolicyModule } from './types.js';

const ARISTO = { doc: 'ARISTO, основной каталог 09.10.2026 (Katalog_ARISTO_Rus_09.10.2026_web.pdf)', sha256: '5d7222b7' },
  SLIM_XLSX = { doc: 'ARISTO, таблица расчёта Slim Line (Таблица расчетов Slim Line_15_10_26.xlsx)', sha256: 'c0f61ea3' };

export const wardrobeSliding = {
  id: 'wardrobe-sliding',
  version: '2',
  constants: {
    ecoUpperTrackWidth: constant(
      82,
      'mm',
      catalogSource({ ...ARISTO, page: '44 (с. 45 файла)', note: 'AE0492.VP540 — направляющая двухполозная верхняя ЭКО, ширина 82 мм' }),
      'Глубина верхней направляющей ЭКО AE0492 от переднего края корпуса',
    ),
    ecoLowerTrackWidth: constant(
      60,
      'mm',
      catalogSource({ ...ARISTO, page: '44 (с. 45 файла)', note: 'AE0488.AP540 — направляющая двухполозная нижняя ЭКО, ширина 60 мм' }),
      'Глубина накладной нижней направляющей ЭКО AE0488',
    ),
    as0713Width: constant(
      81.5,
      'mm',
      catalogSource({ ...ARISTO, page: '6 (с. 7 файла)', note: 'AS0713.VP540 — направляющая двухполозная верхняя, ширина 81,5 мм' }),
      'Глубина верхней направляющей Стандарта и Slim Line AS0713 от переднего края корпуса',
    ),
    as0504Width: constant(
      62.8,
      'mm',
      catalogSource({ ...ARISTO, page: '6 (с. 7 файла)', note: 'AS0504.VP540 — направляющая двухполозная нижняя, ширина 62,8 мм' }),
      'Глубина накладной нижней направляющей Slim Line AS0504',
    ),
    ecoLowerSetback: constant(
      18,
      'mm',
      prototype('r1.html:61803 SW_ACCEPTED_RULES.profiles.eco.mounting.lower_front_setback_mm', 'FINDINGS 351'),
      'Отступ накладной нижней ЭКО AE0488 от переднего края верхней направляющей; монтажной схемы ЭКО в каталогах и таблицах ARISTO из файлов проекта нет (MOD-DEC-354)',
    ),
    slimLowerSetback: constant(
      { VISIBLE: 18.2, HIDDEN_OPENING: 14, HIDDEN_CABINET: 15 },
      'mm',
      catalogSource({ ...SLIM_XLSX, page: 'лист Slim Line, «Варианты установки дверей»: схемы открытой, скрытой в проём и скрытой в корпус верхней', note: '18,2 от переднего края AS0713; 14 от лицевой плоскости дверей; Вкр + 108 − (Вкр + 93) = 15 от переднего края дна' }),
      'Отступ накладной нижней Slim Line AS0504 от переднего края верхней направляющей (при скрытой верхней — от переднего края дна) по монтажной схеме варианта установки',
    ),
    standardInlaidDepth: constant(
      86,
      'mm',
      catalogSource({ ...ARISTO, page: '35 (с. 36 файла)', note: 'Установка нижней врезной направляющей СТАНДАРТ, асимметричный профиль: 25 + 10,5 + 30 + 10,5 + 10 мм' }),
      'Полоса дна под двумя врезными направляющими AS0690 Стандарта с профилем C (асимметричным), MOD-DEC-354',
    ),
    slimInlaidVisibleDepth: constant(
      86,
      'mm',
      catalogSource({ ...ARISTO, page: '59 (с. 60 файла)', note: 'Установка нижней врезной направляющей SLIM LINE при открытой верхней: 25 + 10,5 + 30 + 10,5 + 10 мм' }),
      'Полоса дна под врезными направляющими Slim Line при открытой верхней направляющей',
    ),
    slimInlaidHiddenDepth: constant(
      82,
      'mm',
      catalogSource({ ...ARISTO, page: '59 (с. 60 файла)', note: 'Установка нижней врезной направляющей SLIM LINE при скрытой верхней: 21 + 10,5 + 30 + 10,5 + 10 мм' }),
      'Полоса дна под врезными направляющими Slim Line при скрытой верхней направляющей',
    ),
    minUsableDepth: constant(
      100,
      'mm',
      prototype('r1.html:59692 u138ContentsValid: Dusable = D − запас − четверть < 100 — «Не хватает полезной глубины за дверной системой»', 'FINDINGS 353'),
      'Наименьшая полезная глубина корпуса за дверной системой; меньше — вход отклоняется',
    ),
    drawerLeafClearance: constant(
      5,
      'mm',
      decision('MOD-DEC-175'),
      'Зазор между выдвигаемыми частями ящика и раскрытыми створками с каждой стороны: ширина ящика не больше A − 10 мм, A — свободная ширина между раскрытыми створками',
    ),
  },
} as const satisfies PolicyModule;

const C = wardrobeSliding.constants;

/**
 * The widths of the guides the depth of the system is computed from. The catalogue names one of them for the depth of
 * the section of a guide (`depthMmFrom`, FINDINGS 1083) instead of a second copy of the number; null — not such a width.
 */
export function slidingTrackWidth(name: unknown): number | null {
  const key = typeof name === 'string' && name.startsWith('wardrobe-sliding.') ? name.slice('wardrobe-sliding.'.length) : null;
  return key === 'ecoUpperTrackWidth' || key === 'ecoLowerTrackWidth' || key === 'as0713Width' || key === 'as0504Width' ? C[key].value : null;
}

/** The upper guide of each system of the prototype's door panel (ЭКО C · AE0704, Slim · AV0991, Standard C · AS0731). */
const UPPER_TRACK: Readonly<Record<string, { article: string; width: PolicyConstant<number> }>> = {
  eco: { article: 'AE0492.VP540', width: C.ecoUpperTrackWidth },
  slim: { article: 'AS0713.VP540', width: C.as0713Width },
  standard: { article: 'AS0713.VP540', width: C.as0713Width },
};

/** The sliding doors of a project state: active, with a system and a number of leaves (0 — the stage «Двери» not done). */
export interface SlidingDoors {
  active?: unknown;
  system?: unknown;
  n?: unknown;
  /** Slim: 'surface' (AS0504, the default) or 'recessed' (AS0690 in grooves). */
  slimLowerMount?: unknown;
  /** Slim: 'VISIBLE' (the default), 'HIDDEN_CABINET', 'HIDDEN_OPENING'. */
  slimUpperMount?: unknown;
}

/**
 * Setback of a surface lower guide, mm (MOD-DEC-354): the upper guide stands flush with the front edges of the sides,
 * the roof and the bottom; the lower one is placed from the upper one by the mounting scheme of the system — Slim Line
 * by the schemes of its calculation table, ЭКО by the prototype's 18 mm (no scheme of ARISTO in the project files).
 * null — the lower guide is inlaid (Standard, Slim recessed: the grooves of the catalogue drawing) or the system unknown.
 */
export function lowerTrackSetback(doors: SlidingDoors | null | undefined): number | null {
  if (doors?.system === 'eco') return C.ecoLowerSetback.value;
  if (doors?.system !== 'slim' || doors.slimLowerMount === 'recessed') return null;
  const by: Record<string, number> = C.slimLowerSetback.value;
  return by[String(doors.slimUpperMount ?? 'VISIBLE')] ?? null;
}

/**
 * What the lower guide of a system takes from the front edge of the bottom (MOD-DEC-354): a surface guide — its setback
 * and its width (ЭКО AE0488, Slim AS0504); inlaid guides — the strip of the grooves of the catalogue drawing (Standard
 * with the profile C, the prototype's only Standard; Slim recessed).
 */
function lowerTrackDepth(doors: SlidingDoors): number | null {
  const setback = lowerTrackSetback(doors),
    surface = (width: PolicyConstant<number>) => (setback === null ? null : setback + width.value);
  if (doors.system === 'eco') return surface(C.ecoLowerTrackWidth);
  if (doors.system === 'standard') return C.standardInlaidDepth.value;
  if (doors.system !== 'slim') return null;
  if (doors.slimLowerMount !== 'recessed') return surface(C.as0504Width);
  return ((doors.slimUpperMount ?? 'VISIBLE') === 'VISIBLE' ? C.slimInlaidVisibleDepth : C.slimInlaidHiddenDepth).value;
}

/**
 * Depth taken by the door system from the front of the carcass, mm: the larger of its upper and lower guides. No
 * doors yet (`n = 0`, MOD-DEC-184: a new sliding wardrobe has none) — no system, 0. An unknown system — null: the
 * input is refused (wardrobeInputProblems), the depth is not guessed.
 */
export function slidingDepthReserve(doors: SlidingDoors | null | undefined): number | null {
  if (doors?.active !== true || doors.n === 0) return 0;
  const upper = UPPER_TRACK[String(doors.system)],
    lower = lowerTrackDepth(doors);
  return upper && lower !== null ? Math.max(upper.width.value, lower) : null;
}

/** The article of the upper guide of the system, for the request of the graph and the messages. */
export function slidingUpperTrack(doors: SlidingDoors | null | undefined): string | null {
  return UPPER_TRACK[String(doors?.system)]?.article ?? null;
}
