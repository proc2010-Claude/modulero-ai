// Policy of the sliding doors (task W9, step W9.2): the tables of the three ARISTO systems the prototype builds — ЭКО,
// Slim Line and Standard — and the rules of the leaf: deductions, overlaps, limits, the articles of the kit, the masses
// of the profiles. The solver of wardrobe/sliding-doors.ts takes every number from here (MOD-DEC-054).
//
// The tables are the prototype's (SW_ACCEPTED_RULES r1.html:61783, the Slim Line layer r1.html:84716, the kit layer
// r1.html:85336). Their numbers agree with the ARISTO calculation tables and the owner's decisions named at each
// constant (FINDINGS 355); the mass of a leaf follows MOD-DEC-334 instead of the prototype's ×1.10 of the inserts
// (FINDINGS 356). The data move into the hardware catalogue with the tasks CAT-1…CAT-4 (MOD-DEC-352).
import { catalogSource } from '../../catalog/hardware/types.js';
import { constant, decision, prototype, type PolicyModule } from './types.js';

/** The ARISTO calculation tables of the owner's catalogue folder (SOURCES.md, MOD-DEC-334). */
const STANDARD_ECO_XLSX = { doc: 'ARISTO, таблица расчёта «Стандарт и Эко» (Tablitsa-raschetov-Standart-i-Eko_05_02_25.xlsx)', sha256: '3c9f3854' },
  SLIM_XLSX = { doc: 'ARISTO, таблица расчёта Slim Line (Таблица расчетов Slim Line_15_10_26.xlsx)', sha256: 'c0f61ea3' },
  ARISTO = { doc: 'ARISTO, основной каталог 09.10.2026 (Katalog_ARISTO_Rus_09.10.2026_web.pdf)', sha256: '5d7222b7' };

export type SlidingSystemId = 'eco' | 'slim' | 'standard';

/** The roles of the kit lines in the prototype's order (swMultiBom r1.html:63211). */
export type SlidingRole = 'vertical' | 'upper_frame' | 'lower_frame' | 'upper_track' | 'lower_track' | 'roller_kit' | 'stop' | 'brush' | 'brush_clip' | 'plug';

export interface SlidingSystemTable {
  /** Door height = opening height − this (ЭКО 40, Slim Line visible / surface 45, Standard inlaid 39). */
  heightDeduction: number;
  /** Nominal overlap of two leaves, mm. */
  overlap: number;
  /** Frame length = door width − this. */
  frameDeduction: number;
  /** Insert width = door width − this. */
  insertWidthDeduction: number;
  /** Insert height = floor(door height − this). */
  insertHeightDeduction: number;
  /** Deduction D of the width formula per scheme (ALT, PAIR4). */
  deduction: { ALT: number; PAIR4: number };
  /** Gap at each side of the opening where the closed leaves start (ЭКО, Slim 5; Standard 0). */
  edgeDeduction: number;
  /** Count of lower guides (Standard: two inlaid AS0690). */
  lowerTrackCount: number;
  /** Bar length of the profiles, mm. */
  stockLength: number;
  /** Brush (шлегель) strips per vertical profile in the generic formula; 0 — the system has plugs. */
  brushFactor: number;
  limits: { heightMax: number; leafWidthMin: number; leafWidthMax: number; ratioMax: number; ratioRecommended: number };
  articles: Readonly<Record<SlidingRole, string | null>>;
  /** Linear mass of the profiles of a leaf, kg/m: vertical, upper and lower frame (the ARISTO tables, MOD-DEC-334). */
  profileMassKgPerM: { vertical: number; upper_frame: number; lower_frame: number };
}

const SYSTEMS: Readonly<Record<SlidingSystemId, SlidingSystemTable>> = {
  eco: {
    heightDeduction: 40,
    overlap: 25,
    frameDeduction: 51,
    insertWidthDeduction: 36,
    insertHeightDeduction: 58,
    deduction: { ALT: 10, PAIR4: 20 },
    edgeDeduction: 5,
    lowerTrackCount: 1,
    stockLength: 5400,
    brushFactor: 1,
    limits: { heightMax: 2500, leafWidthMin: 500, leafWidthMax: 900, ratioMax: 4, ratioRecommended: 3 },
    articles: {
      vertical: 'AE0704.VP540',
      upper_frame: 'AE0688.VP540',
      lower_frame: 'AE0689.VP540',
      upper_track: 'AE0492.VP540',
      lower_track: 'AE0488.AP540',
      roller_kit: 'AE0160.VS000',
      stop: 'AS0101.VP000',
      brush: 'AA0956.VM150',
      brush_clip: 'AA0040.VP000.IN0EP.CO',
      plug: null,
    },
    profileMassKgPerM: { vertical: 0.385, upper_frame: 0.228, lower_frame: 0.423 },
  },
  slim: {
    heightDeduction: 45,
    overlap: 14,
    frameDeduction: 28,
    insertWidthDeduction: 12,
    insertHeightDeduction: 3,
    deduction: { ALT: 10, PAIR4: 20 },
    edgeDeduction: 5,
    lowerTrackCount: 1,
    stockLength: 5400,
    brushFactor: 2,
    limits: { heightMax: 3200, leafWidthMin: 500, leafWidthMax: 1200, ratioMax: 4, ratioRecommended: 3 },
    articles: {
      vertical: 'AV0991.VP540',
      upper_frame: 'AV0588.VP540',
      lower_frame: 'AV0990.VP540',
      upper_track: 'AS0713.VP540',
      lower_track: 'AS0504.VP540',
      // MOD-DEC-188: the rollers of Slim Line are AV0160.AS000; AV0160.VS000 is retired (the prototype swaps it, r1.html:85341).
      roller_kit: 'AV0160.AS000.ZN0EP.CO',
      stop: 'AS0101.VP000',
      brush: 'AA0956.VM150',
      brush_clip: 'AA0040.VP000.IN0EP.CO',
      plug: null,
    },
    profileMassKgPerM: { vertical: 0.356, upper_frame: 0.283, lower_frame: 0.312 },
  },
  standard: {
    heightDeduction: 39,
    overlap: 25,
    frameDeduction: 51,
    insertWidthDeduction: 36,
    insertHeightDeduction: 57,
    deduction: { ALT: 0, PAIR4: 10 },
    edgeDeduction: 0,
    lowerTrackCount: 2,
    stockLength: 5400,
    brushFactor: 0,
    limits: { heightMax: 3200, leafWidthMin: 500, leafWidthMax: 1500, ratioMax: 4, ratioRecommended: 3 },
    articles: {
      vertical: 'AS0731.BP540',
      upper_frame: 'AS0720.VP540',
      lower_frame: 'AS0721.VP540',
      upper_track: 'AS0713.VP540',
      lower_track: 'AS0690.VP540',
      roller_kit: 'AS0160.VS000',
      stop: 'AS0001.VP000',
      brush: null,
      brush_clip: null,
      plug: 'AS0053.VP000',
    },
    profileMassKgPerM: { vertical: 0.512, upper_frame: 0.241, lower_frame: 0.493 },
  },
};

/** The Slim Line mounts of the upper and the lower guide (Slim Line table L7, K11; r1.html:84733). */
export type SlimUpperMount = 'VISIBLE' | 'HIDDEN_CABINET' | 'HIDDEN_OPENING';
export type SlimLowerMount = 'surface' | 'recessed';

export const slidingDoors = {
  id: 'sliding-doors',
  version: '2',
  constants: {
    systems: constant(
      SYSTEMS,
      'mm, kg, kg/m',
      prototype('r1.html:61783 SW_ACCEPTED_RULES.profiles (ЭКО, Slim, Standard), 84716 Slim Line, 85336 комплект', 'FINDINGS 355'),
      'Таблицы систем купе ARISTO: вычеты двери, рамки и вставки (140, таблицы расчёта ARISTO), перехлёсты (172, 173, 178), пределы размеров створки (каталог ARISTO с. 18, 55; предел массы — leafMassLimitKg, 334), артикулы комплекта (188), погонные массы профилей (таблицы расчёта ARISTO, 334)',
    ),
    // Version 2 (W9): the limit of a leaf is its own constant with the decision and its scope (INV-E19-03, FINDINGS 553).
    leafMassLimitKg: constant(
      { eco: 40, slim: 80, standard: 100 } as const satisfies Record<SlidingSystemId, number>,
      'kg',
      decision('MOD-DEC-334'),
      'Предел массы готовой створки — по роликам комплекта системы ARISTO: ЭКО 40, Slim Line 80, Стандарт 100 кг. Область — створка своей системы с роликами её комплекта; у системы вне таблицы предела нет (UNKNOWN, не бесконечность)',
    ),
    insertThickness: constant(10, 'mm', decision('MOD-DEC-140'), 'Вставка створки — ЛДСП 10 мм'),
    insertArealMass: constant(
      8,
      'kg/m2',
      catalogSource({ ...STANDARD_ECO_XLSX, page: 'лист «Раздвижные двери», M32: ЛДСП 10 мм — 8 кг/м²' }),
      'Масса 1 м² вставки ЛДСП 10 мм (MOD-DEC-334)',
    ),
    massFactor: constant(
      1.05,
      'ratio',
      catalogSource({ ...STANDARD_ECO_XLSX, page: 'лист «Раздвижные двери», M39 = (M37 + M25) · 1,05' }),
      'Масса двери = 1,05 · (вставки + профили одной створки); без направляющих (ошибка листа «Эко» не переносится, FINDINGS 138; MOD-DEC-334)',
    ),
    slimOverlap: constant(14, 'mm', decision('MOD-DEC-173'), 'Перехлёст створок Slim Line AV0991 — 14 мм (173, 187)'),
    slimWidthDeduction: constant(
      { brushOrPoly: 10, centreJointPair4: 20, plug: 0 },
      'mm',
      decision('MOD-DEC-178'),
      'Вычет D формулы ширины Slim Line: шлегель или уплотнитель — 10, четыре створки с центральным стыком — 20, заглушка — 0',
    ),
    slimHeightOffset: constant(
      { VISIBLE: { surface: -45, recessed: -39 }, HIDDEN_CABINET: { surface: 6, recessed: 12 }, HIDDEN_OPENING: { surface: -34, recessed: -28 } },
      'mm',
      catalogSource({ ...SLIM_XLSX, page: 'лист Slim Line, L7: высота двери по варианту установки' }),
      'Высота двери Slim Line = высота проёма + смещение по установке верхней и нижней направляющих',
    ),
    slimHiddenUpperFrame: constant('AV0589.VP540', 'article', catalogSource({ ...SLIM_XLSX, page: 'лист Slim Line, J15: рамка широкая верхняя при скрытом треке' }), 'Верхняя рамка Slim Line при скрытой верхней направляющей'),
    slimHiddenUpperFrameMass: constant(0.56, 'kg/m', catalogSource({ ...SLIM_XLSX, page: 'лист Slim Line, M15' }), 'Погонная масса рамки широкой верхней AV0589'),
    slimHiddenUpperTrackDeduction: constant(34, 'mm', catalogSource({ ...SLIM_XLSX, page: 'лист Slim Line, K11: E11 − 2 − 32' }), 'Верхняя направляющая Slim Line, скрытая в корпус: длина = проём − 34 мм'),
    slimRecessedLowerTrack: constant('AS0690.VP540', 'article', catalogSource({ ...SLIM_XLSX, page: 'лист Slim Line, V2 (две врезные направляющие, L12)' }), 'Врезная нижняя направляющая Slim Line, две штуки'),
    slimHiddenHardware: constant(
      { internalBracket: 'NA0166.VR000', externalBracket: 'NA0167.VR000', upperRollerSet: 'NA0169.VR000' },
      'article',
      catalogSource({ ...SLIM_XLSX, page: 'лист Slim Line, J21–J23' }),
      'Кронштейны и верхние ролики скрытой верхней направляющей Slim Line',
    ),
    slimBrackets: constant(
      { internal: { 2: 1, 3: 2, 4: 2, 5: 3 }, external: { 2: 1, 3: 1, 4: 2, 5: 2 } },
      'pcs',
      catalogSource({ ...SLIM_XLSX, page: 'лист Slim Line, K21–K22: кронштейны внутренние и внешние по числу дверей' }),
      'Кронштейны скрытой верхней направляющей Slim Line по числу дверей (прототип r1.html:84807 считает так же)',
    ),
    slimCarcassThickness: constant(16, 'mm', catalogSource({ ...SLIM_XLSX, page: 'лист Slim Line, B27: расчёт для корпуса 16 мм' }), 'Принятый расчёт Slim Line относится к корпусу 16 мм; иначе — UNSUPPORTED_CONFIGURATION (прототип r1.html:84737)'),
    nominalLeafAxes: constant(
      { visible: [21, 61], hidden: [40, 79], inlaid: [30.25, 70.75] },
      'mm',
      prototype('r1.html:85025 mounting().leafAxes: Стандарт — оси пазов, скрытая верхняя Slim — [40, 79], иначе [21, 61]', 'FINDINGS 358'),
      'Номинальная ось створки по дорожке от переднего края корпуса; вставка стоит на ней серединой толщины',
    ),
    nominalLeafBottom: constant(
      { surface: 10, recessed: 4, standard: null },
      'mm',
      prototype('r1.html:85026 mounting().bottomOffset; у Стандарта null («door_bottom_from_support» неизвестен)', 'FINDINGS 358'),
      'Номинальный низ створки над дном проёма; null — неизвестен, створка рисуется от дна',
    ),
    railDeduction: constant(2, 'mm', decision('MOD-DEC-160'), 'Направляющие — ширина проёма − 2 мм (по 1 мм с торца)'),
    brushStripsPerLeaf: constant(2, 'pcs', decision('MOD-DEC-188'), 'Шлегель — две полосы на дверь на всю высоту профиля, L = 2 · Σвысот / 1000, вверх до метра один раз'),
    clipsPerLeaf: constant(4, 'pcs', catalogSource({ ...STANDARD_ECO_XLSX, page: 'лист «Раздвижные двери», J34 = K14 · 2 (две клипсы на вертикальный профиль)' }), 'Клипсы шлегеля AA0040 — четыре на створку'),
    plugsPerLeaf: constant(4, 'pcs', prototype('r1.html:62755 SW_ENGINE.nominal: plugs = 4n', 'FINDINGS 355'), 'Заглушки AS0053 Стандарта — четыре на створку'),
    stopsPerLeaf: constant(2, 'pcs', catalogSource({ ...STANDARD_ECO_XLSX, page: 'лист «Раздвижные двери», J30 = E10 · 2' }), 'Стопоры — два на створку'),
    slimBracketScrewsPerBracket: constant(8, 'pcs', decision('MOD-DEC-189'), 'Саморезы кронштейнов Slim Line — SUM(K21:L22) · 8; отдельно не считаются и не сверлятся'),
    profileStations: constant(
      { near: 7, second: 42, hiddenFar: 42 },
      'mm',
      prototype('r1.html:85371 localOperations.profileStationsMm = [7, 42, h − 7]', 'FINDINGS 355'),
      'Станции отверстий вертикального профиля от торца двери',
    ),
    profileHoleDiameters: constant([5.5, 9], 'mm', catalogSource({ ...ARISTO, page: '34 (с. 35 файла): Ф5,5 и Ф9' }), 'Диаметры отверстий в стенке вертикального профиля'),
    // The 3D of the system (FINDINGS 1353): an asymmetric vertical profile does not stand with its middle on the axis
    // of the roller; the drawing of ARISTO puts the roller pin near its back face. Not in `systems`, like the sections of
    // the profiles (FINDINGS 916, 1083): the digest of the sources of the doors does not change with a picture.
    verticalProfileBehindAxis: constant(
      { 'AS0731.BP540': 8.3 } as Readonly<Record<string, number>>,
      'mm',
      catalogSource({ ...ARISTO, page: '35 (с. 36 файла): «Установка нижней врезной направляющей СТАНДАРТ», асимметричный профиль — обмер чертежа: 25,7 мм перед осью ролика, 8,3 мм за ней' }),
      'Часть вертикального профиля за осью его дорожки (вглубь шкафа); у профиля вне таблицы ось — середина сечения (Д)',
    ),
    inlaidGroove: constant(
      { width: 10.5, depth: 7, land: 30, nearVisible: 25, nearHidden: 21 },
      'mm',
      catalogSource({ ...ARISTO, page: '35 (с. 36 файла) и 59 (с. 60 файла): пазы 10,5 × 7 мм, между пазами 30 мм, от переднего края 25 мм (21 при скрытой верхней Slim Line)' }),
      'Пазы врезных нижних направляющих AS0690 в дне',
    ),
  },
} as const satisfies PolicyModule;

/** The table of a system; undefined for a system the policy does not know. */
export const slidingSystem = (id: unknown): SlidingSystemTable | undefined => (typeof id === 'string' && id in SYSTEMS ? SYSTEMS[id as SlidingSystemId] : undefined);
