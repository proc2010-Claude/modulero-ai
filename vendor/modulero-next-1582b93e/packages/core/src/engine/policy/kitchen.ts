// Policy of the kitchen modules on the graph (task K3, MIGRATION_PLAN step 4.3). MOD-DEC-341: a norm of the swing
// wardrobe is the default of the kitchen; the kitchen replaces only the norms it has its own decision for — the
// editable defaults of 180, the single-body corner of 182, the removable shelf of 193. So the kitchen takes from the
// shared policy the hinge selection and the hinge count (hinge-selection.ts, 190, 286), the shelf support kits
// (shelf-support-selection.ts, 344), the System 32 lines and spare levels (wardrobe-fill.ts, 193) and the carcass
// fasteners of r7 (192); here are only its own numbers. The module rules of kitchen/carcass.ts and kitchen/derived.ts
// read them from here (MOD-DEC-054); the prototype's numbers without a decision stay there with their r1.html line.
import { constant, decision, prototype, type PolicyModule } from './types.js';
import { catalogSource } from '../../catalog/hardware/types.js';
import wardrobeStart from '../../wardrobe/start.data.json' with { type: 'json' };

/** The working profile of the quarter of the wardrobe (`backProfile` of a new wardrobe, MOD-DEC-287): the kitchen takes it (566 п. 2). */
const QUARTER = wardrobeStart.state.backProfile;

export const kitchen = {
  id: 'kitchen',
  version: '1',
  constants: {
    baseHeight: constant(720, 'mm', decision('MOD-DEC-180'), 'Нижний корпус: высота по умолчанию, редактируется'),
    baseDepth: constant(560, 'mm', decision('MOD-DEC-180'), 'Нижний корпус: глубина по умолчанию, редактируется'),
    legHeight: constant(100, 'mm', decision('MOD-DEC-180'), 'Опоры нижнего корпуса и пенала: низ корпуса над полом'),
    worktopThickness: constant(38, 'mm', decision('MOD-DEC-180'), 'Столешница по умолчанию (расчёт столешниц — K4)'),
    worktopDepth: constant(600, 'mm', decision('MOD-DEC-565'), 'Столешница по умолчанию: глубина, редактируется; задний край заподлицо с задом корпуса, свес за фасад — остаток (560 + 2 + 18 → 20 мм); прототип ставил 620 (FINDINGS 1180)'),
    overlaySinkDepth: constant(600, 'mm', decision('MOD-DEC-753'), '(Д) Накладная мойка ложится на шкаф под мойку вместо столешницы: ширина — ширина корпуса, глубина 600; модель и цена не выбраны — покупная позиция без цены (MOD-AI-60, FINDINGS 3193)'),
    appliancePlace: constant(
      {
        fridge: { deviceWidthMm: 600, deviceHeightMm: 2000, sideGapMm: 10, topGapMm: 50 },
        cooker: { deviceWidthMm: 600, deviceHeightMm: 850, sideGapMm: 10, topGapMm: 0 },
        deviceWidthMm: [450, 900],
        deviceHeightMm: [800, 2200],
      },
      'mm',
      decision('MOD-DEC-752'),
      '(Д) Место под отдельно стоящий холодильник и плиту: прибор по умолчанию, зазоры по бокам и сверху, пределы ширины и высоты прибора; место = прибор + зазоры (MOD-AI-60, FINDINGS 3190)',
    ),
    islandSeatOverhangMax: constant(300, 'mm', decision('MOD-DEC-745'), '(Д) Наибольший выступ столешницы острова за зад корпуса под стулья; больше без опоры столешница 38 мм не держится, кронштейнов в каталоге нет (MOD-AI-61, FINDINGS 3170)'),
    wallDepth: constant(320, 'mm', decision('MOD-DEC-180'), 'Навесной корпус: глубина по умолчанию'),
    tallHeight: constant(2140, 'mm', decision('MOD-DEC-180'), 'Пенал: высота в каталоге прототипа и у сохранённого пенала; новый пенал кончается по верху навесных (567, FINDINGS 1270)'),
    tallDepth: constant(560, 'mm', decision('MOD-DEC-180'), 'Пенал: глубина по умолчанию'),
    mezzHeight: constant(400, 'mm', decision('MOD-DEC-180'), 'Антресоль: высота по умолчанию'),
    carcassThickness: constant(16, 'mm', decision('MOD-DEC-180'), 'Плита корпуса по умолчанию; 18 мм — допустимая правка (238, FINDINGS 326)'),
    backThickness: constant(3, 'mm', decision('MOD-DEC-180'), 'Задник по умолчанию'),
    frontThickness: constant(18, 'mm', decision('MOD-DEC-180'), 'Фасад по умолчанию'),
    edge: constant(1, 'mm', decision('MOD-DEC-180'), 'Кромка корпуса (видимый передний торец) и фасада (все торцы) по умолчанию; прототип ставил 0 (KF-04, FINDINGS 321)'),
    shelfEdge: constant(0.4, 'mm', decision('MOD-DEC-193'), 'Кромка полки кухни: полка съёмная, кромка 0,4 мм по всем торцам'),
    legacyOuterGap: constant(2, 'mm', prototype('r1.html:67591 kitchenState.proposed.outerGap = 2', 'FINDINGS 323'), 'Умолчание прототипа, записанное в каждый проект; «внешний зазор 2» кухни не утверждён (180, «Сомнения»), при чтении означает «не задано»: действуют отступы frontGrid (124 по горизонтали; 2 мм сверху и снизу — прототип, FINDINGS 55; KF-11)'),
    removableEndGap: constant(1, 'mm', decision('MOD-DEC-225'), 'Съёмная полка = чистый проём − 2 мм: по 1 мм с каждого торца (KF-05, FINDINGS 322)'),
    shelfFrontSetback: constant(20, 'mm', decision('MOD-DEC-129'), 'Передний отступ съёмной полки по умолчанию — 20 мм (129, разрешено в «Сомнениях» вместе с 223/225)'),
    shelfRearSetback: constant(0, 'mm', decision('MOD-DEC-129'), 'Задний отступ полки — 0 мм, до внутренней поверхности задника'),
    railWidth: constant(100, 'mm', decision('MOD-DEC-566'), '(Д) Царга нижнего корпуса под столешницей: ширина передней и задней царги вместо сплошного верха (п. 1; у крупных фабрик — 80–100 мм, FINDINGS 1263)'),
    // MOD-DEC-566 п. 3 (FINDINGS 1271): a new floor carcass stands on its feet without pads under the bottom — the fixing
    // block of the foot is pressed into the bottom on four dowels, not screwed with 4 × 35 into a stack of 35 mm.
    footBlock: constant(
      { sku: '47654', lengthMm: 92, widthMm: 80, heightMm: 25, legAxisFromEndMm: 38, dowelDiameterMm: 10, dowelLengthMm: 11.5, dowelsFromLegAxisMm: [[-16, -32], [-16, 32], [48, -32], [48, 32]] },
      'mm',
      { kind: 'CATALOG', ref: 'Hettich, Furniture Fittings and Applications TA 2025, с. 813; CAD 47654_3d.zip (reference/sources/hettich-korrekt-2026-10-26)' },
      'Площадка опоры Korrekt «для запрессовки, с 4 шкантами» 47654: 92 × 80 × 25, шканты ø10 × 11,5 по углам квадрата 64 × 64, ось ножки в 38 мм от торца',
    ),
    footDowelHoleDepth: constant(12, 'mm', decision('MOD-DEC-566'), '(Д) Гнездо шканта площадки 47654 в дне: ø10, глубина 12 — шкант 11,5 и 0,5 мм запаса'),
    footDowelResidual: constant(3, 'mm', decision('MOD-DEC-566'), '(Д) Наименьший остаток дна под гнездом: у дна 16 мм — 4; дно тоньше 15 мм площадку на шкантах не принимает'),
    footBlockFromSide: constant(50, 'mm', decision('MOD-DEC-566'), '(Д) Площадка 47654 прямоугольного модуля — в 50 мм от наружной грани боковины (у прототипа площадка 9028230 — в 40): шканты у боковины в 22 мм от эксцентрика стяжки дна (34 мм от боковины) на любой станции, и при задней станции дна в 50 мм от задних кромок (задник в четверти) гнёзда не задевают её (FINDINGS 1271)'),
    backRebateDepth: constant(QUARTER.rebateDepthMm, 'mm', decision('MOD-DEC-566'), '(Д) Четверть задника кухни, как у шкафа (287, п. 2): на сколько задник входит в боковину, дно и верх или заднюю царгу; рабочий профиль шкафа MODULERO-QUARTER-PROPOSAL-1 (FINDINGS 1269)'),
    backInPlaneClearance: constant(QUARTER.inPlaneClearanceMm, 'mm', decision('MOD-DEC-566'), '(Д) Зазор задника до стенки четверти в его плоскости, как у шкафа (287, п. 2; FINDINGS 1269)'),
    backRearClearance: constant(QUARTER.rearClearanceMm, 'mm', decision('MOD-DEC-566'), '(Д) Задняя грань задника в четверти — на столько ближе задних кромок корпуса; ширина четверти = задник + этот зазор, как у шкафа (287, п. 2; FINDINGS 1269)'),
    plinthPieceMax: constant(2700, 'mm', decision('MOD-DEC-566'), '(Д) Цоколь ряда одним куском до 2700 мм (плита 2750 × 1830 с обрезкой кромок); длиннее — режется по стыкам модулей'),
    directCornerWidth: constant({ base: 1230, upper: 900 }, 'mm', decision('MOD-DEC-566'), '(Д) Новый прямой угловой: глухая часть 580 / 340 (ряд с фасадом), добор 50 / 30 у двери, шов 3, дверь 595,5 / 525,5 и отступ 1,5'),
    drawerCabinetMinWidth: constant(300, 'mm', decision('MOD-DEC-750'), '(Д) Директора: нижний и островной корпус с ящиками — шириной от 300 мм: уже ящик почти не вмещает посуду, а для узкого места есть «Бутылочница» 150–300; самый узкий корпус с ящиками в эталонах K1 — 300 (MOD-AI-58, FINDINGS 3113)'),
    baseShelfCount: constant(1, 'шт', decision('MOD-DEC-566'), '(Д) Новый нижний и островной корпус 720 с полками: одна съёмная полка — под столешницей место для высокой посуды; прототип ставил две (FINDINGS 1275)'),
    hoodPipeCutout: constant({ fromSideMm: 131, fromFrontMm: 192 }, 'mm', catalogSource({ doc: 'Bosch, инструкция DFM063W56B (9001527925_I.pdf)', page: '12, «Preparing the units», шаг 4: центр выреза под трубу — 131 мм от левой боковины, 192 мм от передней кромки', sha256: 'a6bab786' }), 'Вырез под трубу в верхе и полке нового шкафа вытяжки (MOD-DEC-566 п. 7, FINDINGS 1279)'),
    hoodPipeCutoutDiameter: constant(150, 'mm', decision('MOD-DEC-566'), '(Д) Диаметр выреза под трубу: на листе Bosch не проставлен, на рисунке — около четверти ширины шкафа; 150 мм, сверяется с трубой на месте; край выреза не ближе 5 мм к отверстиям стяжек верха и полки (FINDINGS 1279)'),
    cutoutEdge: constant({ front: 50, rear: 40 }, 'mm', decision('MOD-DEC-750'), '(Д) Директора: край столешницы у выреза своей мойки или варочной панели (MOD-DEC-412) — спереди и сзади не меньше, если в данных техники нет своего числа; меньший край — отказ (FINDINGS 3106)'),
    upperOverWorktop: constant(450, 'mm', decision('MOD-DEC-749'), '(Д) Директора: низ навесного шкафа — не ближе 450 мм к верху столешницы под ним (рабочая зона, MOD-AI-62); ближе — замечание без блокировки с допустимым низом; 450 — 430 над электрической варочной по Bosch DFM063W56B с запасом'),
    hoodOverHob: constant({ electric: 430, gas: 650 }, 'mm', catalogSource({ doc: 'Bosch, инструкция DFM063W56B (9001527925_I.pdf)', page: '10, «13.2 Safety clearances»: от варочной поверхности до низа вытяжки — от 430 мм над электрической, от 650 над газовой; с. 12, «13.6»: вытяжка не уже варочной и ставится по её середине', sha256: 'a6bab786' }), 'Вытяжка над варочной панелью (MOD-AI-44): наименьшее расстояние от поверхности до низа вытяжки и вытяжка не уже варочной'),
    hoodShelfGap: constant(10, 'mm', decision('MOD-DEC-566'), '(Д) Полка над вытяжкой — на столько выше прибора: по листу Bosch она не опирается на корпус вытяжки (FINDINGS 1279)'),
    hoodShelfRearGap: constant(40, 'mm', decision('MOD-DEC-566'), '(Д) Полка над вытяжкой короче шкафа на столько: канал у стены для шнура с вилкой к розетке над полкой (FINDINGS 1279)'),
    bifoldFrontThickness: constant([15, 23], 'mm', catalogSource({ doc: 'Blum, каталог KA-150 2022/2023', page: '114, «Corner cabinet bi-fold hinge»: «For front thicknesses FD from 15–23 mm, factory setting for 19 mm»', sha256: '85cf89eb7b61885ba563fb5d1bd9750b450eb49a75d76fd17f32db59c6d96e71' }), 'Фасады нового доступного Г-угла на петле 79T8500 — толщиной фасадов кухни в этих пределах (MOD-DEC-566 п. 7, FINDINGS 1281)'),
    corner155FrontMax: constant(24, 'mm', catalogSource({ doc: 'Blum, каталог KA-150 2022/2023', page: '83, «155° hinge»: минимальный зазор 0 для фасада FD до 24 мм при TB 3–8; наклад FA не зависит от FD', sha256: 'f72d1d8e74e242789428ec48f38afe65c9f47f686771153f38153cc4848f69dd' }), 'Створка нового доступного Г-угла на петле 155° 71T7550: фасад до этой толщины (MOD-DEC-566 п. 7, FINDINGS 1281)'),
    diagonalHingeFrontThickness: constant([15, 28], 'mm', catalogSource({ doc: 'Hettich, лист изделия 9088025 (Sensys 8639i W45)', page: '1–2, «Corner cabinet 135° (W45)», «Min. door thickness 15», «Max. door thickness 28»', sha256: '7b06b29e03148678d3bde42c19ca0a3ec782c4e3f2b9d19658690c5e75ae39f4' }), 'Фасад нового диагонального угла на угловой петле Hettich Sensys W45 — толщиной фасадов кухни в этих пределах (MOD-DEC-566 п. 7, FINDINGS 1611)'),
    diagonalHingeBase: constant(-2, 'mm', catalogSource({ doc: 'Hettich, лист изделия 9088025 (Sensys 8639i W45)', page: '1–2, «Door mounting option overlay (B -2 mm)», «Base -2»', sha256: '7b06b29e03148678d3bde42c19ca0a3ec782c4e3f2b9d19658690c5e75ae39f4' }), 'Основание B петли W45: наклад A = B + C − D (брошюра Sensys 2021, с. 77), планка D = 0 (FINDINGS 1611)'),
    diagonalHingeCupDistance: constant([3, 8], 'mm', catalogSource({ doc: 'Hettich, чертёж 1:1 Sensys W45 B −2 (300201_1-1_W45_B-2_EN)', page: '1, «Allowing for cup distance C (3 - 8 mm)…», планки D0–D5, линия LR 37', sha256: 'f76af71b4915a9dd0f01468936c6fabc6db205512c423a5596111f2c0df406ff' }), 'Расстояние C от кромки фасада до чашки петли W45: из наклада фасада диагонального угла, в этих пределах (FINDINGS 1611)'),
    footStack: constant(35, 'mm', prototype('r1.html:75092 kcrFeetPads: древесный пакет опоры 9028286 — 35 мм', 'FINDINGS 326'), 'Дно с усилением под опорной площадкой; толщина усиления = 35 − толщина дна при любой плите корпуса'),
    drawerRunnerRule: constant(
      'LEVEL_466' as const,
      'rule',
      decision('MOD-DEC-514'),
      '(Д) Директора, FINDINGS 1863: ящики нового модуля (`drawerRunner: level`) — на направляющей уровня фурнитуры по 466 через общий подбор engine/drawer-runner.ts, как у шкафа (1862); уровня у кухни нет — «Стандарт» (223): B-Slide DB8781 с коробом набора БАЗИС вместо TANDEM 560H прототипа; сохранённые проекты — на TANDEM, как сохранены',
    ),
    hangerRule: constant(
      'LEVEL_413' as const,
      'rule',
      decision('MOD-DEC-413'),
      '(Д) Директора 2026-10-29, FINDINGS 2750: навесной шкаф нового модуля (`hanger: level`) висит на навесе уровня фурнитуры (hanger-selection.ts); уровня у кухни нет — «Стандарт» (223): BOYARD CH07 на планках CHH01 вместо Hettich SAH 216 на шине прототипа; сохранённые проекты — на SAH 216, как сохранены',
    ),
    liftRule: constant(
      'LEVEL_FLAP' as const,
      'rule',
      decision('MOD-DEC-413'),
      '(Д) Директора 2026-10-29, FINDINGS 3350: подъёмный фасад нового модуля (`lift: level`) — по уровню фурнитуры, выбранному в панели «Фасады» (kitchen/lift.ts): «Эконом» — фасад на петлях в верхней стенке и МДМ FLAP AIR FL327, «Стандарт» — то же с МДМ FLAP FL123, «Премиум» — Blum AVENTOS HK-S прототипа; уровень не выбран — «Стандарт» (223), но FL123 без подтверждённого диапазона по умолчанию не подбирается и стоит HK-S; сохранённые проекты — на HK-S, как сохранены',
    ),
    flapPairWidth: constant(
      900,
      'mm',
      decision('MOD-DEC-413'),
      '(Д) Директора 2026-10-29, FINDINGS 3354: механизм, который крепится на одну боковину (МДМ FLAP AIR), ставится парой, если фасад шире этого или мощность фасада не укладывается в диапазон одного механизма; мощность делится пополам, каждый из пары подбирается по половине',
    ),
  },
} as const satisfies PolicyModule;
