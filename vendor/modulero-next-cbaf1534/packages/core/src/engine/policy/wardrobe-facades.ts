// Policy of the wardrobe facades and their hinges on the graph (task W4): the rows of facades of a section, the
// gap of the legacy profile, the stations of the hinges along the
// door, the clearance of a mounting plate from the holes already on the panel (MOD-DEC-159: the hinge moves first),
// the board density for the mass of a door (rule 190 needs the mass; MOD-DEC-355), the narrow seam that is said (MOD-DEC-356) and the numbers of an inset facade
// (MOD-DEC-317, 362). The facades of wardrobe/facades.ts take these numbers from here (MOD-DEC-054); the facade width the
// hinge chart covers is a value of the chart in the hinge catalogue (MOD-DEC-377).
import { constant, decision, prototype, type PolicyModule } from './types.js';

export const wardrobeFacades = {
  id: 'wardrobe-facades',
  version: '6',
  constants: {
    hingeEndStation: constant(96, 'mm', decision('MOD-DEC-378'), 'Крайняя петля — в 96 мм от торца двери, остальные поровну между крайними (число прототипа r1.html:12573, FINDINGS 263)'),
    hingeStationMargin: constant(80, 'mm', decision('MOD-DEC-378'), 'Смещённая петля не ближе 80 мм к торцу двери (число прототипа r1.html:12574, FINDINGS 263)'),
    hingeStationShifts: constant(
      [0, 32, -32, 64, -64, 96, -96],
      'mm',
      decision('MOD-DEC-378'),
      'MOD-DEC-159: петля вне зоны полки — сначала смещается петля, по шагу 32 мм: 0, ±32, ±64, ±96 мм (числа прототипа r1.html:12574, FINDINGS 263)',
    ),
    plateHoleClearance: constant(
      22,
      'mm',
      prototype('r1.html:12578 makeDoor: отверстие планки не ближе 22 мм к занятому на линии планки', 'FINDINGS 263'),
      'Отверстие планки не ближе 22 мм к отверстию полкодержателя или другой планки на той же линии; решения нет (159 чисел не задаёт)',
    ),
    boardDensity: constant(
      655,
      'kg/m3',
      decision('MOD-DEC-355'),
      'Масса двери из плиты корпуса для правила 190 — объём готовой двери × плотность плиты (ЛДСП — 655 кг/м³, число прототипа EGGER_DENSITY), если мебельщик не ввёл массу двери секции (doorMassKg); готовность не блокирует',
    ),
    minSeamWarn: constant(2, 'mm', decision('MOD-DEC-356'), 'Шов между фасадами уже 2 мм — предупреждение без запрета (WR-21)'),
    maxFacadeRows: constant(4, 'rows', prototype('r1.html:22205 f13FacadeGeometry: «допустимы 1–4 ряда фасадов»', 'FINDINGS 263'), 'Наибольшее число рядов фасадов по высоте секции; решения нет'),
    rowLeaves: constant([0, 1, 2], 'leaves', decision('MOD-DEC-561'), 'Число дверей в ряду фасадов: одна или две, как в прототипе (r1.html:22215, FINDINGS 263), или ни одной — открытый проём в секции с дверями (FINDINGS 1134)'),
    legacyStandardGap: constant(2, 'mm', prototype('r1.html:15418 p2GapProfile: прежний профиль поддержан только при зазоре 2 мм', 'FINDINGS 263'), 'Прежний профиль зазоров (LEGACY-FACADE-GAP-V1) цепочка поддерживает только при зазоре 2 мм; решения нет'),
    insetRevealMm: constant(2, 'mm', decision('MOD-DEC-362'), 'Зазор между кромкой вкладного фасада и проёмом корпуса — 2 мм со всех четырёх сторон: до боковины или перегородки, до дна и до крыши; со стороны петель он же — зазор, в котором дверь проходит при открывании (FINDINGS 400)'),
    insetSetbackMm: constant(
      0,
      'mm',
      decision('MOD-DEC-362'),
      'Утопление лицевой пласти вкладного фасада от переднего торца корпуса: 0 — пласть вровень с торцом (362, Д); так же на схемах установки вкладных петель каталога — линия планки 37 + толщина фасада (FINDINGS 401)',
    ),
  },
} as const satisfies PolicyModule;
