// Policy of the fill of the swing wardrobe on the graph (task W6): shelves, clothes rods, local partitions. The fill
// of wardrobe/fill.ts and the generator engine/generators/wardrobe.ts take these numbers from here (MOD-DEC-054).
// Numbers of the owner's decisions carry the decision; the automatic placement of shelves and rods has no decision
// and keeps the prototype's numbers (r1.html:12050–12536) with FINDINGS 270.
import { constant, decision, prototype, standard, unknownSource, type PolicyModule } from './types.js';

const PLACE = 'FINDINGS 270';

export const wardrobeFill = {
  id: 'wardrobe-fill',
  version: '2',
  constants: {
    payloadKg: constant(10, 'kg', decision('MOD-DEC-289'), 'Полезная нагрузка полки по умолчанию; введённое значение не заменяется'),
    removableEndGap: constant(1, 'mm', decision('MOD-DEC-225'), 'Съёмная полка = чистый проём − 2 мм: по 1 мм с каждого торца; фиксированная = чистый проём'),
    spareLevel: constant(32, 'mm', decision('MOD-DEC-193'), 'Запасные уровни полкодержателей ±32 мм от основного (INV-R7-IR6-02)'),
    supportLine: constant(37, 'mm', standard('Handbook r8 §17.2: базовая передняя линия 37 мм от готового края; задняя линия D − 37 — повтор прототипа (FINDINGS 270)'), 'Линии отверстий System 32 по глубине — 37 мм от переднего края и D − 37'),
    rodOverLower: constant(900, 'mm', decision('MOD-DEC-290'), 'Новая штанга: верх штанги на 900 мм выше верха нижнего элемента'),
    rodUnderUpper: constant(50, 'mm', decision('MOD-DEC-333'), 'Если 900 мм не помещается, между верхом штанги и элементом над ней остаётся 50 мм, и это показывается'),
    rodProfileHeight: constant(null, 'mm', unknownSource('MOD-DEC-233: дешёвая овальная штанга по умолчанию, каталога штанг нет — высота профиля не известна'), 'Высота профиля штанги: без каталога штанг ось и верх штанги не связаны числом'),
    coverGap: constant(32, 'mm', decision('MOD-DEC-193'), 'Полка над верхним ящиком — на 32 мм выше короба (связанная пара); зазор редактируется'),
    compare: constant(0.1, 'mm', decision('MOD-DEC-191'), 'Порог сравнения вычисленных величин: совпадающие станции и отверстия сливаются'),
    exact: constant(1e-8, 'mm', prototype('r1.html:12451 |coverY − t/2 − innerH| < 1e-8', PLACE), 'Совпадение высот полки над ящиками с крышей или полкой наполнения'),
    coverBelowTop: constant(20, 'mm', prototype('r1.html:12452 coverY + t/2 ≤ innerH − 20 в старом проекте', PLACE), 'Полка над ящиками старого проекта — не выше крыши − 20'),
    noDrawerTop: constant(40, 'mm', prototype('r1.html:12050 drawerTop = 40 без ящиков', PLACE), 'Низ свободной высоты секции без ящиков'),
    seamLinkedFront: constant(-4, 'mm', prototype('r1.html:54997 v18: полка, связанная со швом фасадов, выступает на 4 мм', PLACE), 'Передний край полки у шва фасадов'),
    frontSetback: constant(20, 'mm', prototype('r1.html:54997 v18: отступ полки от переднего края по умолчанию', PLACE), 'Отступ полки от переднего края корпуса'),
    insetDoorShelfGap: constant(2, 'mm', decision('MOD-DEC-400'), 'В секции с вкладной дверью полка отступает от переднего торца не меньше чем на толщину двери + 2 мм: тыльная пласть двери — на толщине двери от торца (утопление 0, 362), полке нужен зазор, чтобы дверь закрылась (FINDINGS 406)'),
    minShelfDepth: constant(100, 'mm', prototype('r1.html:12031 shelfD = max(100, D − shelfDepthReduction)', PLACE), 'Наименьшая расчётная глубина полки'),
    maxShelves: constant(12, 'pcs', prototype('r1.html:12461 clamp(shelfCount, 1, 12)', PLACE), 'Наибольшее число полок секции без наполнения файла 90'),
    shelfOverDrawers: constant(80, 'mm', prototype('r1.html:12463 minY = drawerTop + 80', PLACE), 'Первая полка над ящиками — не ниже верха ящиков + 80'),
    shelfBelowTop: constant(64, 'mm', prototype('r1.html:12464 maxY = innerH − 64', PLACE), 'Верхняя полка — не выше крыши − 64'),
    shelfOverRodPitch: constant(320, 'mm', prototype('r1.html:12469 полки над штангой через 320 от крыши', PLACE), 'Шаг полок над штангой'),
    shelfOverRodLow: constant(260, 'mm', prototype('r1.html:12470 y > minY + 260', PLACE), 'Полка над штангой — выше низа свободной высоты на 260'),
    shelfOverRodHigh: constant(10, 'mm', prototype('r1.html:12470 y < maxY + 10', PLACE), 'Полка над штангой — допуск у верхнего предела'),
    manualShelfMin: constant(64, 'mm', prototype('r1.html:12480 fitVerticalPositions(…, 64, …)', PLACE), 'Наименьшая высота введённой полки'),
    minShelfClearance: constant(100, 'mm', prototype('r1.html:3649 MIN_SHELF_CLEARANCE = 100', PLACE), 'Наименьший просвет между полками сверх толщины'),
    rodOverDrawers: constant(150, 'mm', prototype('r1.html:12521 lower = drawerTop + 150', PLACE), 'Штанга над ящиками — не ниже верха ящиков + 150'),
    rodOverBottom: constant(120, 'mm', prototype('r1.html:12521 lower = drawerTop + 120', PLACE), 'Штанга без ящиков — не ниже низа свободной высоты + 120'),
    rodClear: constant(90, 'mm', prototype('r1.html:12522 ceiling = min(shelfYs) − 90; шаг штанг 90', PLACE), 'Просвет штанги до полки и между штангами'),
    rodBelowTop: constant(120, 'mm', prototype('r1.html:12522 ceiling = innerH − 120', PLACE), 'Штанга без полок — не выше крыши − 120'),
    rodOne: constant(0.72, 'ratio', prototype('r1.html:12524 одна штанга на 0,72 свободной высоты', PLACE), 'Автоматическое положение одной штанги'),
    rodLow: constant(0.34, 'ratio', prototype('r1.html:12524 нижняя из двух штанг на 0,34', PLACE), 'Автоматическое положение нижней из двух штанг'),
    rodHigh: constant(0.8, 'ratio', prototype('r1.html:12524 верхняя из двух штанг на 0,80', PLACE), 'Автоматическое положение верхней из двух штанг'),
    rodAboveDrawers: constant(80, 'mm', prototype('r1.html:12525 y > drawerTop + 80', PLACE), 'Штанга — выше верха ящиков на 80'),
    rodLimit: constant(70, 'mm', prototype('r1.html:12525 y < innerH − 70', PLACE), 'Штанга — ниже крыши на 70; наименьшая высота введённой штанги'),
    rodVerticalSize: constant(20, 'mm', prototype('r1.html:13436 planInterval: штанга занимает y ± 10', PLACE), 'Высота сечения штанги, пока каталога штанг нет (MOD-DEC-233); хранимая высота штанги — её ось'),
    mixedClearance: constant(40, 'mm', prototype('r1.html:3650 MIN_MIXED_CLEARANCE = 40', PLACE), 'Наименьший зазор новой полки до штанги или ящика'),
    fixedShelfStation: constant(50, 'mm', prototype('r1.html:12416 addFixedShelf: станции 50 и D − 50', PLACE), 'Станции конфирматов фиксированной полки — 50 мм от переднего и заднего края полки'),
  },
} as const satisfies PolicyModule;
