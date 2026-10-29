// Policy of "other furniture" (task H1, ENGINE.md §3.2 and §4). The rules of the prototype generator
// home-physical-r3 are moved here, and one generator now has versioned rule sets:
//   r3 — the prototype as it is: the reference of the golden masters and of the differential check (FINDINGS 230);
//   r4 — the common policy of MOD-DEC-341 (the wardrobe norm wherever "other furniture" has no rule of its own)
//        and the fixes of the defects H-01, H-02, H-04, H-05, H-07, H-09, H-10, H-12, H-15, H-24 (MOD-DEC-295, 342);
//   r5 — r4 and the rules of the wardrobe the task H1 left out (MOD-DEC-513, FINDINGS 840–855), built step by step.
// A project keeps the rule set it was built with (`generatorVersion`). r3 → r4 is an explicit migration with a
// preview, never a silent recalculation (ENGINE.md §4, §24.4). A number neither product has a decision for keeps the
// prototype's value with a FINDINGS item; it is not invented (CLAUDE.md). The r4 front gaps are the numbers of
// frontGrid (124, 162, 185); the policy test checks they stay equal (no import: index.ts imports this file).
import { edgeIntentThicknessMm } from '../../wardrobe/edges.js';
import { ADJUSTABLE_SHELF_NEW_PROJECT_RULE, EDGE_RULES, edgeModel } from './edge-model.js';
import { fittingsSelection } from './fittings-selection.js';
import { hingeSelection } from './hinge-selection.js';
import { jointStations } from './joint-stations.js';
import { shelfSupportSelection } from './shelf-support-selection.js';
import { system32 } from './system32.js';
import { constant, decision, prototype, standard, type PolicyConstant, type PolicyModule } from './types.js';
import { wardrobeFacades } from './wardrobe-facades.js';
import { wardrobeFill } from './wardrobe-fill.js';
import wardrobeStart from '../../wardrobe/start.data.json' with { type: 'json' };
import kitchenHardware from '../../catalog/kitchen/hardware-profiles.data.json' with { type: 'json' };
import kitchenModules from '../../catalog/kitchen/modules.data.json' with { type: 'json' };
import { CURRENT_PRODUCTION_PROFILE, HDF4_GROOVE_INTENT } from '../../wardrobe/standard.js';

export const HOME_R3 = 'home-physical-r3' as const;
export const HOME_R4 = 'home-physical-r4' as const;
export const HOME_R5 = 'home-physical-r5' as const;
export type HomeGenerator = typeof HOME_R3 | typeof HOME_R4 | typeof HOME_R5;

const r3 = (ref: string) => prototype('home-physical-r3 ' + ref, 'FINDINGS 230');

/**
 * Numbers of the home generator that both rule sets share. They are the prototype's (FINDINGS 230) unless a decision
 * is named: no decision of the journal sets them for "other furniture" or for the wardrobe.
 */
export const homeCommon = {
  id: 'home',
  // 4 — the price of r4 by the cutting plan of the graph (MOD-DEC-510).
  version: '4',
  constants: {
    padHeightHard: constant(3, 'mm', r3('foot()'), 'Высота подпятника на твёрдом полу (накладки Hettich KIT150 3 мм)'),
    padHeightCarpet: constant(5, 'mm', r3('foot()'), 'Высота подпятника на ковролине (Hettich 9247599, 14 × 50 × 5)'),
    padWidth: constant(14, 'mm', r3('graph.ts floor_pad'), 'Подпятник поперёк линии нагрузки'),
    padLength: constant(50, 'mm', r3('graph.ts floor_pad'), 'Подпятник вдоль глубины'),
    padFrontOffset: constant(32, 'mm', r3('graph.ts floor_pad'), 'Передний подпятник — за передним краем корпуса'),
    padRearOffset: constant(64, 'mm', r3('graph.ts floor_pad'), 'Задний подпятник — до заднего края корпуса'),
    frontReserveTemplates: constant(Object.freeze(['chest', 'bedside', 'tv', 'sideboard', 'desk']), 'template', r3('aFront()'), 'Заготовки, у которых корпус отступает под накладные фасады, даже если фасадов нет (параметр заготовки, ENGINE.md §3.2)'),
    middlePadTemplates: constant(Object.freeze(['chest']), 'template', r3('graph.ts loadLines'), 'Заготовки со средним подпятником под дном'),
    apronHeight: constant(150, 'mm', r3('graph.ts rear_apron'), 'Задняя царга стола'),
    shelfFrontSetback: constant(20, 'mm', r3('graph.ts shelves'), 'Полка отступает от переднего края корпуса'),
    adjustableShelfSideGap: constant(1, 'mm', decision('MOD-DEC-225'), 'Съёмная полка = проём − 2 мм: по 1 мм с каждой стороны'),
    drawerBoxBoard: constant(16, 'mm', r3('graph.ts drawer box'), 'Плита короба ящика (ставка board16)'),
    drawerBoxFrontOffset: constant(2, 'mm', r3('graph.ts drawer box'), 'Короб начинается за передним краем корпуса'),
    drawerBottomInset: constant(8, 'mm', r3('graph.ts drawer_bottom'), 'Дно короба над низом боковин'),
    drawerBoxBelowFront: constant(12, 'mm', r3('runnerInfo boxY'), 'Низ короба над низом фасада'),
    drawerBoxUnderFrontTop: constant(28, 'mm', r3('runnerInfo boxTop'), 'Верх короба под верхом фасада'),
    drawerBoxCarcassClearance: constant(2, 'mm', r3('runnerInfo boxY, boxTop'), 'Короб над дном и под крышкой корпуса'),
    drawerHardwareReserveKg: constant(2, 'kg', r3('graph.ts runner movingMassKg'), 'Запас массы фурнитуры ящика'),
    drawerBoxMinWidth: constant(96, 'mm', r3('validate.ts'), 'Наименьшая ширина короба'),
    drawerBoxMinHeight: constant(100, 'mm', r3('validate.ts'), 'Наименьшая высота короба'),
    smallDrawerPatternBand: constant(8.5, 'mm', r3('graph.ts SMALL_DRAWER_PATTERN'), 'Окрестность, в которой шканты передней стенки сходятся'),
    runnerRearAllowance: constant(7, 'mm', r3('runnerInfo'), 'Монтажный запас за направляющей'),
    runnerSlide: constant('BOYARD_DB4501', 'id', r3('catalog.ts runnerVariants'), 'Направляющая r3 — позиция каталога направляющих (catalogs/hardware/drawer-slides.json): длины, нагрузка, высота профиля и таблица размеров B…I берутся из неё (CAT-4)'),
    runnerMountBase: constant(2, 'mm', r3('runnerInfo cabinetMountZ'), 'Отсчёт позиций крепления от переднего края корпуса'),
    runnerMountFirst: constant(72, 'mm', r3('runnerInfo cabinetMountZ'), 'Первое крепление направляющей'),
    runnerShortMountFirst: constant(7.3, 'mm', r3('runnerInfo cabinetMountZ, NL 250'), 'Первое крепление короткой направляющей 250 мм'),
    doorHardwareReserveKg: constant(0.5, 'kg', r3('hingeProfile mass'), 'Запас массы фурнитуры дверцы'),
    hingeRows: constant(Object.freeze([Object.freeze({ count: 2, height: 800, mass: 4 }), Object.freeze({ count: 3, height: 1500, mass: 6 })]), 'mm, kg', r3('HINGE_ROWS'), 'Таблица петель r3 без источника (H-11); график петли — вопрос Q3, подбор петли — HOLD 032'),
    hingeMinPitch: constant(280, 'mm', r3('HINGE_MIN_PITCH'), 'Шаг петель не меньше'),
    hingeEndOffset: constant(80, 'mm', r3('hingeProfile nominal'), 'Крайние петли от верха и низа дверцы'),
    hingeBoardThickness: constant(18, 'mm', r3('hingeProfile'), 'Профиль установки петли есть только для плиты 18 мм'),
    hingeCupFromEdge: constant(20.5, 'mm', r3('joinery.ts cupX'), 'Центр чашки от края дверцы'),
    hingeCupScrewFromEdge: constant(26.5, 'mm', r3('joinery.ts screwX'), 'Точки саморезов чашки от края дверцы'),
    hingeCupScrewSpacing: constant(24, 'mm', r3('joinery.ts ±24'), 'Точки саморезов чашки выше и ниже центра'),
    hingePlateOffset: constant(37, 'mm', r3('graph.ts plateOffsetFromCarcassFrontMm'), 'Планка от переднего края корпуса'),
    hingePlateScrewSpacing: constant(16, 'mm', r3('joinery.ts ±16'), 'Точки саморезов планки выше и ниже станции'),
    hingePlateZone: constant(10, 'mm', r3('hingeProfile reservedBoxes'), 'Полузона планки по глубине'),
    hingeScrewsPerStation: constant(4, 'pcs', r3('graph.ts mountScrewsPerStation'), 'Саморезов на петлю с планкой'),
    hingeSweep: constant(Object.freeze({ width: 75, depth: 90, below: 30, above: 30 }), 'mm', r3('hingeProfile reservedBoxes'), 'Резерв хода петли у края проёма'),
    hingePlateSweep: constant(Object.freeze({ width: 100, below: 26, above: 26 }), 'mm', r3('hingeProfile reservedBoxes'), 'Резерв планки и отвёртки'),
    hingeDriver: constant(Object.freeze({ radius: 10, length: 100 }), 'mm', r3('hingeProfile reservation'), 'Допущение об отвёртке; огибающая производителя не подтверждена'),
    hardwareItems: constant(
      Object.freeze({
        cam16: 'HETTICH_RASTEX15_16',
        cam18: 'HETTICH_RASTEX15_18',
        stud: 'HETTICH_DU325',
        dowel: 'HETTICH_DOWEL_8X35',
        confirmat: 'CONFIRMAT_7X50',
        shelfSupport: 'BOYARD_P101ZN56',
        padsHard: 'HETTICH_KIT150',
        padsCarpet: 'HETTICH_PAD_14X50X5',
        padScrew: 'HETTICH_SCREW_71925_PAD',
        restraint: 'ITALIANA_SH7',
        restraintPlate: 'ITALIANA_SH_PLATE',
        restraintScrew16: 'SH7_SCREW_16',
        restraintScrew18: 'SH7_SCREW_18',
        wallAnchor: 'FISCHER_DUOPOWER_6X30',
        hinge: 'BOYARD_H301A02_H0910',
        hingeScrew: 'HINGE_SCREW_4X16',
        runner: 'BOYARD_DB4501_PAIR',
        runnerScrew: 'HETTICH_SCREW_45167',
        // FINDINGS 2746 (Д Директора): the screw of the BAZIS kit of DB4501 — 3,5 × 16 in its holes Ø3: Hettich 71925,
        // the record of the screw of the pad (one price per article, MOD-DEC-536).
        kitRunnerScrew: 'HETTICH_SCREW_71925_PAD',
        frontScrew: 'HETTICH_SCREW_9278224',
        handle: 'BOYARD_RC282BL4',
      }),
      'id',
      r3('outputs.ts hardware(), hingeProfile, joinery.ts'),
      'Позиции каталога фурнитуры (catalogs/hardware/articles.json) для строк ведомости фурнитуры r3: артикул и наименование, у петли H301A02 — планка и чашка Ø35 × 12, у саморезов петли и направляющей — диаметр и длина (CAT-4). Петля по 073 и планка по 329 — задача «Подбор петель и монтажных планок» (HOLD 032)',
    ),
    connectorRowMax: constant(64, 'mm', r3('joinery.ts rows'), 'Станция соединения от края зоны — не дальше'),
    connectorRowFraction: constant(4, 'ratio', r3('joinery.ts rows'), '… и не дальше четверти длины зоны'),
    dowelShift: constant(32, 'mm', decision('MOD-DEC-192'), 'Шкант — на 32 мм к центру от станции эксцентрика'),
    camDiameter: constant(15, 'mm', r3('joinery.ts CAM'), 'Корпус Rastex 15'),
    camDepth16: constant(12.7, 'mm', r3('joinery.ts CAM'), 'Глубина корпуса в плите 16 мм'),
    camDepth18: constant(13.4, 'mm', r3('joinery.ts CAM'), 'Глубина корпуса в плите 18 мм'),
    camOffset: constant(34, 'mm', r3('joinery.ts CAM, CHANNEL'), 'Корпус от торца; длина канала'),
    channelDiameter: constant(8, 'mm', r3('joinery.ts CHANNEL'), 'Канал под шток'),
    studDiameter: constant(8, 'mm', r3('joinery.ts STUD'), 'Гнездо под шток DU325'),
    studDepth: constant(11, 'mm', r3('joinery.ts STUD'), 'Глубина гнезда под шток'),
    dowelDiameter: constant(8, 'mm', r3('joinery.ts WOOD'), 'Шкант 8 × 35'),
    dowelEdgeDepth: constant(26, 'mm', r3('joinery.ts WOOD_EDGE'), 'Шкант в торец'),
    dowelFaceDepth: constant(11, 'mm', r3('joinery.ts WOOD_FACE'), 'Шкант в пласть'),
    confirmatHeadDiameter: constant(8, 'mm', r3('joinery.ts CONFIRMAT_THROUGH'), 'Конфирмат: сквозное отверстие'),
    confirmatPilotDiameter: constant(5, 'mm', r3('joinery.ts CONFIRMAT_EDGE'), 'Конфирмат: отверстие в торец'),
    confirmatPilotDepth: constant(40, 'mm', r3('joinery.ts CONFIRMAT_EDGE'), 'Глубина отверстия в торец'),
    shelfPinDiameter: constant(5, 'mm', r3('joinery.ts SHELF_PIN'), 'Полкодержатель'),
    shelfPinDepth: constant(8, 'mm', r3('joinery.ts SHELF_PIN'), 'Глубина гнезда полкодержателя'),
    shelfPinBelowShelf: constant(2.45, 'mm', r3('joinery.ts SHELF_PIN'), 'Ось гнезда под низом полки'),
    deskBackRows: constant(Object.freeze({ low: 64, high: 62, dowelLow: 96, dowelHigh: 94 }), 'mm', r3('joinery.ts desk_shared_back_apron_exception'), 'Станции задника на общей боковине тумбы стола'),
    deskApronRows: constant(Object.freeze({ edge: 32, dowel: 64 }), 'mm', r3('joinery.ts desk_shared_back_apron_exception'), 'Станции царги на общей боковине тумбы стола'),
    elasticity: constant(1800, 'N/mm²', r3('beam(), Kronospan P2'), 'Модуль упругости плиты профиля Kronospan P2'),
    elasticityLegacy: constant(1600, 'N/mm²', r3('beam(), legacy-custom'), 'Модуль упругости своей плиты прежних проектов'),
    deflectionScreen: constant(200, 'ratio', r3('beam() L/200'), 'Экран прогиба L/200 — число прототипа (H-12); порог по журналу HOLD'),
    frontMinHeight: constant(160, 'mm', r3('validate.ts'), 'Наименьшая высота фасада'),
    frontCarcassMargin: constant(2, 'mm', prototype('r1 V16_STANDARD_PROFILE.topInset', 'FINDINGS 55'), 'Фасад над подпятником и под крышкой; решения нет (как frontGrid.outerOffsetTop)'),
    frontMinSeam: constant(2, 'mm', decision('MOD-DEC-356'), 'Шов между фасадами уже 2 мм: r3 отклоняет (validate.ts прототипа), r4 предупреждает — narrowSeamRefused'),
    doorMaxWidth: constant(600, 'mm', r3('validate.ts'), 'Наибольшая ширина дверцы'),
    bayMinWidth: constant(80, 'mm', r3('validate.ts'), 'Наименьший просвет между вертикалями'),
    deskKneeWidth: constant(600, 'mm', r3('validate.ts'), 'Свободное место для ног'),
    deskMinDepth: constant(550, 'mm', r3('validate.ts'), 'Наименьшая глубина стола'),
    deskHeight: constant(Object.freeze([650, 800]), 'mm', r3('validate.ts'), 'Высота стола'),
    deskPedestalWidth: constant(400, 'mm', r3('edit.ts create desk'), 'Ширина тумбы нового стола'),
    bodyWidth: constant(Object.freeze([200, 2400]), 'mm', r3('validate.ts'), 'Ширина корпуса'),
    bodyHeight: constant(Object.freeze([300, 2200]), 'mm', r3('validate.ts'), 'Высота корпуса'),
    bodyDepth: constant(Object.freeze([200, 650]), 'mm', r3('validate.ts'), 'Глубина корпуса'),
    shelfGridBase: constant(3, 'mm', r3('edit.ts create'), 'Полки заготовок — по шагу 32 мм от 3 мм над полом'),
    drawerDefaultHeight: constant(180, 'mm', r3('edit.ts addDrawer'), 'Высота нового ящика'),
    drawerDefaultHeightStep: constant(10, 'mm', decision('MOD-DEC-578'), 'Новый ящик r4–r5, у которого шканты передней стенки сходятся (MOD-DEC-343), выше на этот шаг, пока не разойдутся (Д Директора, R1-010)'),
    drawerDefaultRaises: constant(5, 'count', decision('MOD-DEC-578'), 'Не больше стольких шагов: окрестность схождения шкантов — 17 мм'),
    priceByCuttingPlan: constant(
      Object.freeze(['sheet16', 'sheet18', 'saw', 'hole', 'cup']),
      'rate',
      decision('MOD-DEC-510'),
      'Цена r4: плита — целыми листами карты раскроя графа, распил — метрами реза карты, присадка — отверстиями и чашками петель графа, как у шкафа; эти ставки заменяют «Плиту с отходами» и «Раскрой и присадку» r3. Ставка изготовителя — первой, без неё — цена каталога или временная (536)',
    ),
    room: constant(Object.freeze({ width: 4000, height: 2600, depth: 4000 }), 'mm', r3('edit.ts create'), 'Помещение нового проекта; не отличить от введённого (FINDINGS 119)'),
  },
} as const satisfies PolicyModule;

/** Values of a policy module by constant name. */
export type Values<M extends PolicyModule> = { readonly [K in keyof M['constants']]: M['constants'][K] extends PolicyConstant<infer T> ? T : never };
export const valuesOf = <M extends PolicyModule>(m: M): Values<M> =>
  Object.freeze(Object.fromEntries(Object.entries(m.constants).map(([k, c]) => [k, c.value]))) as Values<M>;

/** The rules that differ between the two rule sets. */
export interface HomeRuleSet {
  readonly generator: HomeGenerator;
  /** Front thickness: the prototype's fixed 18 mm or the board of the project. */
  readonly frontThickness: number | 'BOARD';
  /** Carcass setback behind overlay fronts: the prototype's 20 mm, or front thickness + depth gap (162). */
  readonly frontSetback: number | 'FRONT_PLUS_GAP';
  readonly frontDepthGap: number;
  /** Front inset from an outer side, and half the seam at a partition. */
  readonly frontOuterInset: number;
  readonly frontHalfSeam: number;
  /** Which boundaries of a bay are outer for a front: only the carcass sides (prototype), or every boundary that is
   * not shared by two bays with fronts — the shared side of a desk pedestal is outer, a partition between bays is not. */
  readonly frontOuterAt: 'SIDES' | 'UNSHARED';
  /** A drawer front covers a partition as an outer side (prototype) or keeps the seam like a door. */
  readonly drawerFrontAtPartition: 'COVER' | 'SEAM';
  /** Seam between fronts stacked in a new template. */
  readonly stackSeam: number;
  /** Station pattern of shelves on both sides of a partition. */
  readonly sharedShelfPattern: 'R3_32_104' | 'MOD_DEC_343';
  /** Rows of shelf pins in depth: 32 mm from the shelf edges, or the System 32 front line and the rear row G. */
  readonly shelfPinRows: 'R3_FROM_SHELF' | 'SYSTEM32';
  readonly shelfLoadKg: number;
  /** The planned load of a drawer of a new project, kg (r3, r4: 5 of the prototype; r5: 10 — MOD-DEC-574, FINDINGS 1756). */
  readonly drawerLoadKg: number;
  /** L/200 of the top blocks the project (prototype) or is a warning only (§14.1). */
  readonly topDeflectionBlocks: boolean;
  /** A seam between fronts narrower than frontMinSeam is refused (prototype) or a warning (MOD-DEC-356); an overlap is refused in both. */
  readonly narrowSeamRefused: boolean;
  /** Crossing bores are only an issue (prototype) or the edit is refused (INV-H04). */
  readonly drillingClashRefused: boolean;
  /** A body above the floor is accepted (prototype) or refused (INV-G07). */
  readonly bodyOnFloor: boolean;
  /** The room is not checked (prototype) or a body outside it is a warning (INV-G06). */
  readonly roomWarning: boolean;
  /** Hardware holes without a kit and a catalogue page: labelled «catalogue» (prototype) or PROTOTYPE, «присадка неполная» (277). */
  readonly hardwareHoleSource: 'MANUFACTURER_CATALOG' | 'PROTOTYPE';
  /** Marks of the runner screws (277). */
  readonly runnerMarks: boolean;
  /** Texts of unresolved questions: the prototype's (a bare code for most) or plain Russian (H-09). */
  readonly issueTexts: 'R3' | 'PLAIN';
  /** Stations of a joint narrower than 200 mm: the prototype's min(64, L/4) from the ends, or MOD-DEC-364. */
  readonly narrowJoints: 'R3' | 'MOD_DEC_364';
  /** A removable shelf heavier than its supports hold: not checked (prototype) or blocks production (368; H-08). */
  readonly shelfSupportLimit: boolean;
  /** Least clear height above and below a shelf; null — not checked (prototype). Less is a warning (368; H-13). */
  readonly shelfMinClearance: number | null;
  /** A body that does not stand on the floor: not reported (prototype) or a warning in the graph (368; H-06). */
  readonly bodySupportWarning: boolean;
  /**
   * Hinges of a door: the prototype's H301A02 by its table (hingeRows, 18 mm, carcass sides only) or the wardrobe's
   * selection of «hinge + plate» by the overlay, the count by the manufacturer's chart and the stations of W4 (513, 341).
   */
  readonly hingeRule: 'R3_TABLE' | 'WARDROBE';
  /** Gap between the drawer box side and the side panel under the runner: the prototype's number, or half the deduction of the box width rule of the runner in the catalogue (MOD-DEC-514). */
  readonly drawerBoxSideGap: number | 'CATALOG';
  /**
   * Edge banding: null — one thickness of the project on the edges the generator bands (r3, r4); otherwise the
   * thickness of each edge by the kind of the part (role → index of `edge_mm` → mm), the wardrobe's model (513, §18, 193).
   */
  readonly edgeByPart: HomeEdgeTable | null;
  /**
   * Removable shelves: the prototype's pin P101Zn.56 at the shelf's own height (r3, r4), or the wardrobe's rule — the
   * support of the project's level by selectShelfSupport (332, 344), its axis on the System 32 grid from the axis of the
   * bottom with the spare levels ±32 mm (193), the rear line of a side at D − 37 (FINDINGS 270) (513, FINDINGS 844, 845).
   */
  readonly shelfSupportRule: 'R3_PIN' | 'WARDROBE';
  /**
   * The back panel of a body: null — only the structural back of the board, inset and on cams (r3, r4); otherwise the
   * user may replace it by HDF in a rebate of the sides, the bottom and the top, by the profile of the wardrobe (515, 287).
   */
  readonly hdfBack: HomeHdfBack | null;
  /**
   * The base of a body: null — only the floor pads (r3, r4); otherwise the user may set a body on a plinth of the
   * wardrobe (291, 456) or on legs of the fittings catalogue (480, 481) instead of the pads, which stay the default (516).
   */
  readonly baseChoice: HomeBaseChoice | null;
  /**
   * The handles of the fronts: null — the prototype's knob RC282BL.4 of the hardware list, its price a rate of the form
   * and a conventional box in the drawing (r3, r4); otherwise a handle of the fittings catalogue the user chooses, or
   * none, placed on each front by the rules of the wardrobe (480, 513).
   */
  readonly handles: HomeHandles | null;
  /**
   * The bottom of a drawer box: null — the board of the box (16 mm) between its walls on confirmats (r3, r4, and the
   * projects of r5 saved before 574); otherwise HDF in a groove of the four walls, as the wardrobe's (W7), for the
   * projects that ask for it (`drawerBottom: 'hdf'`, every new one — MOD-DEC-574).
   */
  readonly drawerBottomHdf: HomeDrawerBottomHdf | null;
  /**
   * The runner of the drawers: null — BOYARD DB4501 of r3 under every box (r3, r4, and the projects of r5 saved before
   * the choice); otherwise each drawer takes its runner by 466 (`selectDrawerSlide`) for the projects that ask for it
   * (`drawerRunner: 'level'`, every new one): the runner of the level of the hardware, else of «Стандарт», else by the
   * order of the selection — the first the box of "other furniture" is built on and that holds the drawer with its load;
   * a ball runner keeps the box of the prototype, a concealed one takes the box of its BAZIS kit (MOD-DEC-574, the
   * clarification; FINDINGS 1750, 1755).
   */
  readonly drawerRunnerRule: HomeDrawerRunnerRule | null;
  /**
   * The cable outlet of a TV unit: null — none, the body only says `cable` (r3, r4: H-14); otherwise the hole of the
   * prototype r1 in the back of each body with `cable`, for the projects that ask for it (`cableOutlet: 'back'`, every
   * new one — MOD-DEC-574, 496).
   */
  readonly cableOutlet: HomeCableOutlet | null;
  /** The planned load of the top of a new TV unit, kg (r3, r4: 10, as every top; r5: a TV of 25 kg — MOD-DEC-574). */
  readonly tvDeskLoadKg: number;
  /** The shelves of a new TV unit and sideboard behind their doors: fixed (r3, r4) or removable on supports (r5 — MOD-DEC-574). */
  readonly doorShelvesRemovable: boolean;
  /**
   * The construction a new standard item opens with (MOD-DEC-575): false — the pads and the back of the board (r3, r4;
   * 515, 516); true — a plinth of the wardrobe and a back of HDF, as the makers build them; the desk keeps its pads,
   * «Своя конструкция» the pads and the board.
   */
  readonly standardPlinthAndHdf: boolean;
  /**
   * «Добавить полку» without a height (FINDINGS 1311): false — in the middle of the body on the grid, where a shelf may
   * already stand (r3, r4); true — when that place is taken by a shelf of the same niche, in the middle of its largest
   * free space (r5).
   */
  readonly newShelfInFreeSpace: boolean;
  /**
   * «Добавить ящик» and «Добавить дверцу» without a height (MOD-AI-34, 71): false — a drawer at the bottom of the niche,
   * a door over its whole height, whatever stands there (r3, r4); true — in the free part of the niche: a drawer at the
   * bottom of the lowest free part, a door over the largest one, and a refusal names the free parts and the part in the
   * way (r5).
   */
  readonly frontsInFreeSpace: boolean;
  /**
   * The shelf over a drawer (MOD-DEC-744): null — none (r3, r4); a number — a new drawer with open space above it gets a
   * fixed shelf whose top is this much above the upper edge of its front; the shelf follows the drawer (r5).
   */
  readonly drawerCoverRise: number | null;
  /**
   * A stack of fronts between a new bottom and a new top (the base, the floor, the height of the body; MOD-AI-38, 81):
   * false — its heights scale (r3, r4); true — the free space in it, then its doors take the difference and the
   * drawers keep their heights, in whole millimetres, as the partitions after a new width; the edit names what moved (r5).
   */
  readonly keepFrontHeights: boolean;
  /**
   * Refusals of a size name the limit (MOD-AI-35): false — «Габариты выходят за поддерживаемую область» and the depth
   * of the partition (r3, r4); true — the axis, the size and its range, and the depth of the body a shared shelf needs (r5).
   */
  readonly namedLimits: boolean;
  /**
   * A new height of a body (MOD-AI-35): false — the shelves keep their heights from the floor, a lower body refuses the
   * ones above its top (r3, r4); true — the shelves keep their place in the height of the interior, in whole millimetres (r5).
   */
  readonly heightMovesShelves: boolean;
  /**
   * The load of a shelf or a top (MOD-DEC-748, MOD-AI-55): false — the payload is a point load at mid-span against the
   * screen L/200 of the prototype, a threshold not decided (r3, r4); true — the payload is uniform, L/200 is the
   * threshold of the pilot, and every shelf and top gives the payload it takes as a guide (r5).
   */
  readonly uniformLoadLimit: boolean;
  /**
   * The decor of the carcass (MOD-AI-39): false — the three materials of other furniture (r3, r4); true — also any decor
   * of the shared catalogue of the release, as the wardrobe's, in a thickness it is sold in (r5).
   */
  readonly catalogDecors: boolean;
  /** The pedestal of a desk — on the left of the knee space only, as the prototype (r3, r4), or also on the right (r5). */
  readonly deskPedestalSide: boolean;
  /** A copy of a body — next to the composition on its right (r3, r4), or also on the left and at a gap (r5). */
  readonly copyPlacement: boolean;
  /** A partition — over the whole height of the body (r3, r4), or also from a fixed shelf up to the top (r5). */
  readonly partialPartitions: boolean;
  /** A body — on the floor only (r3, r4), or also hung on the wall on the hangers of the kitchen (r5, MOD-AI-33). */
  readonly wallHanging: HomeWallHanging | null;
  /**
   * A body in a niche (MOD-AI-32): false — every body has its bottom and its top (r3, r4); true — a body standing in a
   * niche may go without them, its floor and its ceiling are the niche's (r5, MOD-DEC-168).
   */
  readonly nichePanels: boolean;
  /** A rim on the top (MOD-AI-40): none (r3, r4); boards standing on the top at its edges, as the rim of a changing top (r5). */
  readonly topRim: HomeTopRim | null;
  /** A mirror over the top (MOD-AI-73): none (r3, r4); a mirror of the catalogue of glass on a board standing on the rear edge of the top, as a vanity table's (r5). */
  readonly vanityMirror: HomeVanityMirror | null;
  /** A door — on its hinges only (r3, r4), or also a flap front opening upward on a lift of the catalogue (r5, MOD-AI-40). */
  readonly flapFronts: boolean;
  /** Lights in a body (MOD-AI-37): none (r3, r4); a light under the top of each niche, as the wardrobe's (r5, MOD-DEC-483). */
  readonly lighting: boolean;
  /** A door — of the board of the fronts only (r3, r4), or also a glass door on the glass hinges of the catalogue (r5, MOD-AI-37). */
  readonly glassDoors: HomeGlassDoor | null;
  /** The corners of the top — square (r3, r4), or the front two also rounded by a radius (r5, MOD-AI-73). */
  readonly topCorners: HomeTopCorners | null;
  /** The doors — opened by their handles only (r3, r4), or also by pressing: hinges without a spring and a latch (r5, MOD-AI-36). */
  readonly pushToOpen: boolean;
  /** The base of a body — pads, a plinth, legs or the wall (r3, r4: pads only); r5 also casters of the catalogue (MOD-AI-73). */
  readonly casters: boolean;
}

/** The cable outlet of the prototype r1 (`home-legacy.js` `CABLE`): a through hole in the back of a body with `cable`. */
export interface HomeCableOutlet {
  readonly diameterMm: number;
  /** From the inner face of the top (the upper edge of a back of the board) down to the centre of the hole. */
  readonly belowTopMm: number;
}

/** The bottom of HDF of a drawer box in a groove of its walls: the wardrobe's groove under the bottom (W7, r1.html:5715). */
export interface HomeDrawerBottomHdf {
  readonly profileId: string;
  /** Thickness of the HDF sheet. */
  readonly thicknessMm: number;
  /** Width of the groove across the wall (along the height of the box). */
  readonly grooveWidthMm: number;
  /** Depth of the groove into the wall; the bottom goes into it to its full depth. */
  readonly grooveDepthMm: number;
  /** From the lower edge of a wall to the lower side of the groove. */
  readonly grooveBottomOffsetMm: number;
}

/** The runner of each level of the hardware of the project (`kitLevel`): an id of the drawer slide catalogue. */
/** The runner of each drawer by 466 among the runners the box of "other furniture" is built on (FINDINGS 1755). */
export type HomeDrawerRunnerRule = 'LEVEL_466';

/** The handles of r5 (MOD-DEC-513, FINDINGS 965): the handle of a new project and of a saved one without a choice. */
export interface HomeHandles {
  /** A new project: the default handle of the wardrobe (480). */
  readonly defaultId: string;
  /** A project of r5 saved before the choice (no `handleId`): the knob it was priced with (Director, (Д) FINDINGS 965). */
  readonly savedId: string;
}

/** The plinth and the legs a body of r5 may stand on instead of the pads (MOD-DEC-516): the wardrobe's numbers. */
export interface HomeBaseChoice {
  /** Height of a new plinth (291). */
  readonly plinthHeightMm: number;
  /** The front rail of the plinth stands back from the front of the carcass. */
  readonly plinthSetbackMm: number;
  /** Heights of a plinth or legs the editor accepts, as the base of the wardrobe. */
  readonly heightMm: { readonly min: number; readonly max: number };
}

/** The rebate of the back of HDF: the working profile of the wardrobe (`backProfile` of a new wardrobe, MOD-DEC-287). */
export interface HomeHdfBack {
  readonly profileId: string;
  /** Thickness of the HDF sheet. */
  readonly thicknessMm: number;
  /** How far the sheet goes into a side, the bottom or the top across their faces (the step of the rebate). */
  readonly rebateDepthMm: number;
  /** Width of the rebate along the depth of the body, from its rear edge. */
  readonly rebateWidthMm: number;
  /** Gap of the sheet to the wall of the rebate in its plane, and of its rear face to the rear edges. */
  readonly inPlaneClearanceMm: number;
  readonly rearClearanceMm: number;
}

/** An edge of the top a rim stands on (MOD-AI-40): the front stays open, as at a changing top. */
export type HomeRimSide = 'left' | 'back' | 'right';

/** The rim on the top (MOD-AI-40): its height, mm, and the edges of a new rim. */
export interface HomeTopRim {
  heightMm: { min: number; max: number; default: number };
  sides: readonly HomeRimSide[];
}

/**
 * The mirror over the top of a vanity table (MOD-AI-73): a board of the carcass standing on the rear edge of the top, on
 * the cams to it as the rear rim (3313), and on its face a mirror of the catalogue of glass (FINDINGS 3400) glued within
 * a margin; the glazier cuts and finishes the mirror.
 */
export interface HomeVanityMirror {
  /** The mirror of the catalogue of glass, by its id. */
  readonly glassId: string;
  /** The height of the board above the top, mm. */
  readonly heightMm: { readonly min: number; readonly max: number; readonly default: number };
  /** The board round the mirror on each of its edges, mm. */
  readonly marginMm: number;
}

const VANITY_MIRROR: HomeVanityMirror = Object.freeze({ glassId: 'GLASS-MIRROR-SILVER', heightMm: Object.freeze({ min: 300, max: 1000, default: 600 }), marginMm: 20 });

/** The glass of a glass door (MOD-AI-37): the standalone glass door of the kitchen's glass cabinet (KW_GLASS of the prototype). */
export interface HomeGlassDoor {
  thicknessMm: number;
  materialCode: string;
  label: string;
  /** Density of the glass for the mass on the hinges, kg/m³ (the prototype's khrGroups). */
  densityKgM3: number;
  /** Who finishes the edges and bores the holes of the hinges through the glass. */
  processing: string;
}

const GLASS_DOOR: HomeGlassDoor = Object.freeze({
  thicknessMm: 6,
  materialCode: 'GLASS_CLEAR_6',
  label: 'Стекло прозрачное · 6 мм',
  densityKgM3: 2500,
  processing: 'Кромки стекла и сквозные отверстия под чашки петель делает стекольщик',
});

/** The rounded front corners of the top (MOD-AI-73): the radius, mm, and the segments of the arc of each corner. */
export interface HomeTopCorners {
  radiusMm: { min: number; max: number; default: number };
  segments: number;
}

const TOP_CORNERS: HomeTopCorners = Object.freeze({ radiusMm: Object.freeze({ min: 20, max: 100, default: 50 }), segments: 8 });

const TOP_RIM: HomeTopRim = Object.freeze({ heightMm: Object.freeze({ min: 50, max: 200, default: 100 }), sides: Object.freeze(['left', 'back', 'right'] as HomeRimSide[]) });

/**
 * A body hung on the wall (MOD-AI-33): the hangers of the kitchen's wall cabinets, Hettich SAH 216 on the rail 9007651
 * (catalog/kitchen/hardware-profiles, MOD-DEC-566 п. 2) — the back of HDF in a groove that far in from the rear edges,
 * the conditions of the hanger, its drilling and its kit.
 */
export interface HomeWallHanging {
  readonly profileId: string;
  /** The back stands this far in from the rear edges of the carcass: the rail and the hangers are behind it. */
  readonly backRecessMm: number;
  readonly sideThicknessMinMm: number;
  readonly backThicknessMm: readonly [number, number];
  readonly depthMaxMm: number;
  /** The pins of a hanger in the inner face of each side: below the underside of the top, from the rear edge. */
  readonly pin: { readonly diameterMm: number; readonly depthMm: number; readonly belowTopMm: readonly number[]; readonly fromRearMm: number };
  /** The through holes of the back to reach the adjusting screws: in from the inner face of a side, below the top of the back. */
  readonly access: { readonly diameterMm: number; readonly fromSideMm: number; readonly belowBackTopMm: readonly number[] };
  /** The load one hanger takes and the rail of one body. */
  readonly loadKgEach: number;
  readonly railRatingKg: number;
  /** The kit of one body: the article and how many; the wall sets — one more at a width of 900 mm and over. */
  readonly kit: readonly { readonly article: string; readonly quantity: number }[];
  readonly wallSet: { readonly article: string; readonly quantity: number; readonly wideFromMm: number };
  /** The rail: its article, the stock length it is cut from and the saw cut between pieces (the kitchen's plan). */
  readonly rail: { readonly article: string; readonly stockMm: number; readonly kerfMm: number };
  readonly wallTypes: readonly string[];
  /** The bottom of a new wall body above the floor: the bottom of the kitchen's wall cabinets (MOD-DEC-565 п. 12). */
  readonly defaultElevationMm: number;
}

const SAH216 = kitchenHardware.data.find((x) => x.profileId === 'HETTICH-SAH216-AHS-B16')! as unknown as {
  profileId: string;
  rearPanelRecessMinMm: number;
  sideThicknessMinMm: number;
  backThicknessRangeMm: [number, number];
  cabinetDepthMaxMm: number;
  pinDrilling: { diameterMm: number; depthMm: number; fromRearMm: number };
  backAccess: { diameterMm: number; fromSideEdgeMm: number; fromTopMinMm: number; secondOffsetMm: number };
  loadKgEach: number;
  railRatingKg: number;
  wallTypes: string[];
  kit: { commercialSku: string; quantity?: number }[];
};
const WALL_HANGING: HomeWallHanging = Object.freeze({
  profileId: SAH216.profileId,
  backRecessMm: SAH216.rearPanelRecessMinMm,
  sideThicknessMinMm: SAH216.sideThicknessMinMm,
  backThicknessMm: Object.freeze([...SAH216.backThicknessRangeMm] as [number, number]),
  depthMaxMm: SAH216.cabinetDepthMaxMm,
  // «roofThickness + 56 + [0, 32, 64]» from the top of the cabinet: 56, 88, 120 below the underside of the top.
  pin: Object.freeze({ diameterMm: SAH216.pinDrilling.diameterMm, depthMm: SAH216.pinDrilling.depthMm, belowTopMm: Object.freeze([56, 88, 120]), fromRearMm: SAH216.pinDrilling.fromRearMm }),
  access: Object.freeze({
    diameterMm: SAH216.backAccess.diameterMm,
    fromSideMm: SAH216.backAccess.fromSideEdgeMm,
    belowBackTopMm: Object.freeze([SAH216.backAccess.fromTopMinMm, SAH216.backAccess.fromTopMinMm + SAH216.backAccess.secondOffsetMm]),
  }),
  loadKgEach: SAH216.loadKgEach,
  railRatingKg: SAH216.railRatingKg,
  kit: Object.freeze(SAH216.kit.filter((c) => c.quantity && c.commercialSku !== '65480').map((c) => Object.freeze({ article: c.commercialSku, quantity: c.quantity! }))),
  // «4 + (cabinetWidth ≥ 900 ? 1 : 0)».
  wallSet: Object.freeze({ article: '65480', quantity: 4, wideFromMm: 900 }),
  // The kitchen's cut plan of the rail (kitchen/hardware.ts: RAIL_STOCK_MM, kerfMm).
  rail: Object.freeze({ article: '9007651', stockMm: 3000, kerfMm: 3 }),
  wallTypes: Object.freeze([...SAH216.wallTypes]),
  defaultElevationMm: kitchenModules.kindInfo.upper.floor,
});

const WARDROBE_QUARTER = wardrobeStart.state.backProfile;
const BASE_CHOICE: HomeBaseChoice = Object.freeze({
  plinthHeightMm: Number(wardrobeStart.controls.plinthHeight),
  plinthSetbackMm: Number(wardrobeStart.controls.plinthSetback),
  // The limits of the base field of the wardrobe editor (wardrobe/editor.ts EDITOR_LIMITS.baseHeight, the prototype's field).
  heightMm: Object.freeze({ min: 40, max: 250 }),
});
const HANDLES: HomeHandles = Object.freeze({ defaultId: fittingsSelection.constants.defaultHandle.value, savedId: 'BOYARD_RC282BL_4' });
const DRAWER_BOTTOM_HDF: HomeDrawerBottomHdf = Object.freeze({
  profileId: HDF4_GROOVE_INTENT.semanticType,
  thicknessMm: HDF4_GROOVE_INTENT.nominalMaterialThicknessMm,
  grooveWidthMm: CURRENT_PRODUCTION_PROFILE.hdf4Groove.resolvedWidthMm,
  grooveDepthMm: HDF4_GROOVE_INTENT.workingDepthMm,
  grooveBottomOffsetMm: HDF4_GROOVE_INTENT.workingBottomOffsetMm,
});
const CABLE_OUTLET: HomeCableOutlet = Object.freeze({ diameterMm: 60, belowTopMm: 100 });
const HDF_BACK: HomeHdfBack = Object.freeze({
  profileId: WARDROBE_QUARTER.id,
  thicknessMm: WARDROBE_QUARTER.materialThicknessMm,
  rebateDepthMm: WARDROBE_QUARTER.rebateDepthMm,
  rebateWidthMm: WARDROBE_QUARTER.rebateWidthMm,
  inPlaneClearanceMm: WARDROBE_QUARTER.inPlaneClearanceMm,
  rearClearanceMm: WARDROBE_QUARTER.rearClearanceMm,
});

/** Edges of a part by its semantic role: index of `edge_mm` (0 / 1 — ends of u, 2 / 3 — ends of v) → mm. */
export type HomeEdgeTable = Readonly<Record<string, Readonly<Record<string, number>>>>;

/**
 * The wardrobe's part kind of each banded part of "other furniture" and where its physical edges are on the home part
 * (indices of `edge_mm`). An edge of the wardrobe's rule the home part has no counterpart for is not banded: the top
 * edge of a side is under the continuous top (FINDINGS 843).
 */
const WARDROBE_EDGE_KIND: Readonly<Record<string, readonly [string, Readonly<Record<string, number>>]>> = {
  door: ['facade', { left: 0, right: 1, bottom: 2, top: 3 }],
  drawer_front: ['drawerFacadeStructural', { left: 0, right: 1, bottom: 2, top: 3 }],
  bearing_side: ['sideLeft', { front: 2 }],
  bearing_shared_side: ['sideLeft', { front: 2 }],
  bearing_divider: ['divider', { front: 2 }],
  bottom: ['bottom', { front: 2 }],
  fixed_shelf: ['fixedShelf', { front: 2 }],
  adjustable_shelf: ['adjustableShelf', { left: 0, right: 1, front: 2, rear: 3 }],
  drawer_side: ['drawerSide', { front: 0, rear: 1, bottom: 2, top: 3 }],
  drawer_inner_front: ['drawerFront', { bottom: 2, top: 3 }],
  drawer_back: ['drawerBack', { bottom: 2, top: 3 }],
};

/** r5 parts the wardrobe has none of (Director, FINDINGS 843): the continuous top 1.0 mm round, the desk's rear apron 1.0 at the bottom. */
const HOME_OWN_EDGES: HomeEdgeTable = {
  continuous_top: { 0: 1, 1: 1, 2: 1, 3: 1 },
  rear_apron: { 2: 1 },
  // MOD-AI-40 (Д, FINDINGS 3313): the rim on the top — 1.0 mm on its ends and its upper edge; its lower one is on the top.
  top_rim: { 0: 1, 1: 1, 3: 1 },
  // MOD-AI-73 (Д, FINDINGS 3322): the board of the mirror — as the rim; the mirror has no band, its edges are the glazier's.
  mirror_board: { 0: 1, 1: 1, 3: 1 },
};

/** The edge table of r5: the wardrobe's rules (EDGE_RULES, a new project's adjustable shelf) on the home parts. */
function wardrobeEdgeTable(): HomeEdgeTable {
  const out: Record<string, Readonly<Record<string, number>>> = { ...HOME_OWN_EDGES };
  for (const [role, [kind, at]] of Object.entries(WARDROBE_EDGE_KIND)) {
    const edge: Record<string, number> = {},
      rules = kind === 'adjustableShelf' ? ADJUSTABLE_SHELF_NEW_PROJECT_RULE : EDGE_RULES[kind]!;
    for (const [intent, edges] of rules) for (const name of edges) if (name in at) edge[String(at[name])] = edgeIntentThicknessMm(intent);
    out[role] = Object.freeze(edge);
  }
  return Object.freeze(out);
}

/** Rule set r3: the prototype, kept as the reference of the golden masters and the differential check. */
export const homeRulesR3 = {
  id: 'home-rules',
  version: 'r3',
  constants: {
    frontThickness: constant(18, 'mm', r3('d: 18'), 'Фасад 18 мм на любой плите — H-01, H-24'),
    frontSetback: constant(20, 'mm', r3('aFront()'), 'Отступ корпуса под фасад — число'),
    frontDepthGap: constant(2, 'mm', decision('MOD-DEC-162'), 'Зазор фасад — корпус по глубине'),
    frontOuterInset: constant(2, 'mm', r3('frontGeometry'), 'Фасад от наружного края — H-20'),
    frontHalfSeam: constant(1, 'mm', r3('frontGeometry'), 'Половина шва у перегородки — H-20'),
    frontOuterAt: constant('SIDES', 'rule', r3('frontGeometry'), 'Наружный край — только боковина корпуса; у общей боковины стола — половина шва'),
    drawerFrontAtPartition: constant('COVER', 'rule', r3('frontGeometry'), 'Фасад ящика перекрывает перегородку как боковину'),
    stackSeam: constant(2, 'mm', r3('edit.ts create'), 'Шов между фасадами заготовки — H-20'),
    sharedShelfPattern: constant('R3_32_104', 'rule', r3('joinery.ts shared_shelf_pattern'), 'Станции 32 / 104 мм от начала зоны — FINDINGS 170'),
    shelfPinRows: constant('R3_FROM_SHELF', 'rule', r3('joinery.ts SHELF_PIN'), 'Гнёзда в 32 мм от краёв полки — H-21'),
    shelfLoadKg: constant(5, 'kg', r3('edit.ts plannedShelfLoadKg'), 'Нагрузка полки нового проекта'),
    drawerLoadKg: constant(5, 'kg', r3('edit.ts plannedDrawerLoadKg'), 'Нагрузка ящика нового проекта'),
    topDeflectionBlocks: constant(true, 'flag', r3('validate.ts L/200'), 'Прогиб крышки L/200 блокирует — H-12'),
    narrowSeamRefused: constant(true, 'flag', r3('validate.ts'), 'Шов между фасадами уже 2 мм отклоняется'),
    drillingClashRefused: constant(false, 'flag', r3('issues()'), 'Пересечения сверлений — только замечание — H-04'),
    bodyOnFloor: constant(false, 'flag', r3('validate.ts b.y ≥ 0'), 'Корпус над полом принимается — H-06'),
    roomWarning: constant(false, 'flag', r3('validate.ts'), 'Помещение не проверяется — H-07'),
    hardwareHoleSource: constant('MANUFACTURER_CATALOG', 'rule', prototype('E2 home/engine.ts', 'FINDINGS 113'), 'Литералы прототипа записаны как каталог без ссылки — H-05'),
    runnerMarks: constant(false, 'flag', r3('joinery.ts'), 'Меток направляющих нет — H-05'),
    issueTexts: constant('R3', 'rule', r3('issueText()'), 'Нерешённые узлы — кодом — H-09'),
    narrowJoints: constant('R3', 'rule', r3('joinery.ts rows'), 'Узкий стык — станции min(64, L/4) от краёв, как у широкого'),
    shelfSupportLimit: constant(false, 'flag', r3('graph.ts loads'), 'Нагрузка полки на полкодержатели не ограничена — H-08'),
    shelfMinClearance: constant(null, 'mm', r3('validate.ts'), 'Просвет между полками не проверяется — H-13'),
    bodySupportWarning: constant(false, 'flag', r3('graph.ts'), 'Корпус без опоры в графе не отмечается — H-06'),
    drawerBoxSideGap: constant(12.8, 'mm', r3('mechanisms.ts runnerInfo sideGap'), 'Зазор между боковиной короба и проёмом под направляющую — число прототипа (по каталогу DB4501 12,7, FINDINGS 193)'),
    hingeRule: constant('R3_TABLE', 'rule', r3('hingeProfile, HINGE_ROWS'), 'Петля H301A02 по таблице r3 без источника — H-11, H-19'),
    edgeByPart: constant(null as HomeEdgeTable | null, 'mm', r3('graph.ts p.edgeThickness'), 'Одна толщина кромки проекта на все кромленые торцы — H-18'),
    shelfSupportRule: constant('R3_PIN', 'rule', r3('joinery.ts SHELF_PIN, edit.ts shelfGridBase'), 'Штифт P101Zn.56 под полкой на её высоте, сетка 3 + 32k от пола — H-21'),
    hdfBack: constant(null as HomeHdfBack | null, 'rule', r3('graph.ts structural_back'), 'Задняя стенка — только несущая из плиты корпуса, вкладная, на эксцентриках'),
    baseChoice: constant(null as HomeBaseChoice | null, 'rule', r3('graph.ts floor_pad'), 'Основание — только подпятники под боковинами и дном'),
    handles: constant(null as HomeHandles | null, 'rule', r3('outputs.ts hardware(), visualParts'), 'Ручка-кнопка RC282BL.4 на каждом фасаде: строка фурнитуры, ставка формы и условное изображение'),
    drawerBottomHdf: constant(null as HomeDrawerBottomHdf | null, 'rule', r3('graph.ts drawer_bottom'), 'Дно ящика — плита короба 16 мм между стенками на конфирматах'),
    drawerRunnerRule: constant(null as HomeDrawerRunnerRule | null, 'rule', r3('catalog.ts runnerVariants'), 'Направляющая ящика — BOYARD DB4501 под любым коробом'),
    cableOutlet: constant(null as HomeCableOutlet | null, 'rule', r3('joinery.ts'), 'Отверстия под провода нет: у корпуса только признак `cable` (H-14)'),
    tvDeskLoadKg: constant(10, 'kg', r3('edit.ts create'), 'Нагрузка крышки ТВ-тумбы — 10 кг, как у любой крышки'),
    doorShelvesRemovable: constant(false, 'rule', r3('edit.ts create'), 'Полки ТВ-тумбы и низкого шкафа за дверями — закреплённые'),
    standardPlinthAndHdf: constant(false, 'rule', decision('MOD-DEC-516'), 'Стандартное изделие открывается на подпятниках с задником из плиты (515, 516)'),
    newShelfInFreeSpace: constant(false, 'rule', r3('edit.ts addShelf'), 'Новая полка встаёт посередине корпуса по сетке, даже если там уже стоит полка ниши'),
    frontsInFreeSpace: constant(false, 'rule', r3('edit.ts addDrawer, addDoor'), 'Новый ящик встаёт внизу ниши, новая дверца — на всю высоту ниши, даже если там уже стоит фасад'),
    drawerCoverRise: constant(null as number | null, 'rule', r3('edit.ts addDrawer'), 'Полки над ящиком нет'),
    keepFrontHeights: constant(false, 'rule', r3('edit.ts spreadStack'), 'Стопка фасадов на новом основании или высоте корпуса растягивается пропорционально, дробными миллиметрами; перегородки после новой ширины — дробными'),
    namedLimits: constant(false, 'rule', r3('validate.ts'), 'Отказ по габаритам — «Габариты выходят за поддерживаемую область», мелкая перегородка — «нужна глубина от 202 мм» перегородки, не корпуса'),
    heightMovesShelves: constant(false, 'rule', r3('edit.ts resize'), 'Полки при новой высоте корпуса стоят на прежней высоте от пола; полка выше новой крышки — отказ'),
    uniformLoadLimit: constant(false, 'rule', r3('beam() L/200'), 'Груз полки и крышки — сосредоточенный в середине пролёта, экран прогиба L/200 не утверждён; допустимой нагрузки нет'),
    catalogDecors: constant(false, 'rule', r3('catalog.ts materials'), 'Материал корпуса — один из трёх: светлый дуб, тёплый белый, графит'),
    deskPedestalSide: constant(false, 'rule', r3('edit.ts create desk'), 'Тумба стола — слева от места для ног'),
    copyPlacement: constant(false, 'rule', r3('edit.ts copy'), 'Копия корпуса встаёт вплотную справа от композиции'),
    partialPartitions: constant(false, 'rule', r3('edit.ts addPartition'), 'Перегородка — во всю высоту корпуса, от дна до крышки'),
    wallHanging: constant(null as HomeWallHanging | null, 'rule', r3('graph.ts floor_pad'), 'Навесов нет: корпус стоит на подпятниках'),
    nichePanels: constant(false, 'rule', r3('graph.ts bottom, continuous_top'), 'У каждого корпуса есть дно и крышка'),
    topRim: constant(null as HomeTopRim | null, 'rule', r3('graph.ts continuous_top'), 'Бортика нет: над крышкой деталей нет'),
    vanityMirror: constant(null as HomeVanityMirror | null, 'rule', r3('graph.ts continuous_top'), 'Зеркала над крышкой нет'),
    flapFronts: constant(false, 'rule', r3('mechanisms.ts hingeProfile'), 'Дверца — только на петлях'),
    lighting: constant(false, 'rule', r3('outputs.ts hardware()'), 'Подсветки нет'),
    glassDoors: constant(null as HomeGlassDoor | null, 'rule', r3('graph.ts door'), 'Дверь — из плиты фасадов, стеклянной нет'),
    topCorners: constant(null as HomeTopCorners | null, 'rule', r3('graph.ts continuous_top'), 'Углы крышки прямые'),
    pushToOpen: constant(false, 'flag', r3('graph.ts door'), 'Дверь открывается ручкой, открывания нажатием нет'),
    casters: constant(false, 'flag', r3('graph.ts floor_pad'), 'Колёс нет'),
  },
} as const satisfies PolicyModule;

/** Rule set r4: the common policy (MOD-DEC-341) and the fixes of task H1. */
export const homeRulesR4 = {
  id: 'home-rules',
  version: 'r4',
  constants: {
    frontThickness: constant('BOARD', 'rule', decision('MOD-DEC-294'), 'Фасад из плиты проекта: деталь из плиты каталога (INV-G02), одна толщина в одном месте — H-01, H-24'),
    frontSetback: constant('FRONT_PLUS_GAP', 'rule', decision('MOD-DEC-162'), 'Отступ корпуса = толщина фасада + зазор фасад — корпус'),
    frontDepthGap: constant(2, 'mm', decision('MOD-DEC-162'), 'Зазор фасад — корпус по глубине, накладные распашные'),
    frontOuterInset: constant(1.5, 'mm', decision('MOD-DEC-124'), 'Фасад от наружного края 1,5 мм — правило шкафа по 341'),
    frontHalfSeam: constant(1.5, 'mm', decision('MOD-DEC-185'), 'Шов 3 мм у перегородки: по 1,5 мм с каждой стороны (124, 185)'),
    frontOuterAt: constant('UNSHARED', 'rule', decision('MOD-DEC-124'), 'Наружный край ячейки — 1,5 мм: и у общей боковины тумбы стола, за которой фасада нет'),
    drawerFrontAtPartition: constant('SEAM', 'rule', decision('MOD-DEC-124'), 'У перегородки фасад ящика держит шов, как дверца'),
    stackSeam: constant(3, 'mm', decision('MOD-DEC-185'), 'Шов между фасадами заготовки по умолчанию 3 мм; пользователь меняет'),
    sharedShelfPattern: constant('MOD_DEC_343', 'rule', decision('MOD-DEC-343'), 'Встречные гнёзда в перегородке разнесены по глубине на 16 мм: 37 / 53 мм от переднего края, задние G / G − 16'),
    shelfPinRows: constant('SYSTEM32', 'rule', standard('HB r8 §4 System 32 (Hettich System 32, с. 173); MOD-DEC-343'), 'Гнёзда полкодержателей на передней линии 37 мм и заднем ряду G'),
    shelfLoadKg: constant(10, 'kg', decision('MOD-DEC-289'), 'Полезная нагрузка полки по умолчанию 10 кг'),
    drawerLoadKg: constant(5, 'kg', r3('edit.ts plannedDrawerLoadKg'), 'Нагрузка ящика нового проекта; решения о грузе ящика в r4 нет'),
    topDeflectionBlocks: constant(false, 'flag', standard('HB r8 INV-C13-02 (СТ v1.2 §14.1)'), 'Прогиб — мягкое предупреждение, порог HOLD — H-12'),
    narrowSeamRefused: constant(false, 'flag', decision('MOD-DEC-356'), 'Шов между фасадами уже 2 мм — предупреждение FACADE_SEAM_NARROW без запрета; пересечение фасадов отклоняется'),
    drillingClashRefused: constant(true, 'flag', standard('INV-H04 (MOD-DEC-313)'), 'Граф с пересекающимися сверлениями неверен: правка отклоняется с причиной — H-04'),
    bodyOnFloor: constant(true, 'flag', standard('INV-G07 (MOD-DEC-313)'), 'Корпус стоит на полу на подпятниках — H-06'),
    roomWarning: constant(true, 'flag', standard('INV-G06, HB r8 INV-B12-02'), 'Изделие больше помещения — предупреждение, не запрет — H-07'),
    hardwareHoleSource: constant('PROTOTYPE', 'rule', decision('MOD-DEC-277'), 'Комплекта и страницы каталога нет — «присадка неполная», размеры определяет владелец — H-05'),
    runnerMarks: constant(true, 'flag', decision('MOD-DEC-276'), 'Метки винтов направляющих — слой разметки — H-05'),
    issueTexts: constant('PLAIN', 'rule', decision('MOD-DEC-238'), 'Каждое нерешённое — понятным текстом — H-09'),
    narrowJoints: constant('MOD_DEC_364', 'rule', decision('MOD-DEC-364'), 'Стык уже 200 мм — по joint-stations: 32 мм от краёв, одна стяжка со шкантом, стяжка по центру со шкантом (FINDINGS 385); ящики и общие исключения — свои правила'),
    shelfSupportLimit: constant(true, 'flag', decision('MOD-DEC-368'), 'Съёмная полка с грузом тяжелее, чем держат две пары полкодержателей по каталогу (344), — нерешённое, которое блокирует производство — H-08'),
    shelfMinClearance: constant(40, 'mm', decision('MOD-DEC-368'), 'Просвет над и под полкой (до соседней полки, дна или крышки) меньше 40 мм — предупреждение без блокировки; 40 мм — правило r1 прототипа — H-13'),
    bodySupportWarning: constant(true, 'flag', decision('MOD-DEC-368'), 'Корпус не на полу — предупреждение в графе; правка, поднимающая корпус, по-прежнему отклоняется (INV-G07, 313) — H-06'),
    drawerBoxSideGap: constant('CATALOG', 'rule', decision('MOD-DEC-514'), 'Зазор между боковиной короба и проёмом — по правилу ширины короба направляющей в каталоге: у DB4501 проём − 25,4 мм, по 12,7 мм с каждой стороны (FINDINGS 980)'),
    hingeRule: constant('R3_TABLE', 'rule', r3('hingeProfile, HINGE_ROWS'), 'Петли не перенесены в H1 (HOLD 032, Q3; FINDINGS 237): таблица r3'),
    edgeByPart: constant(null as HomeEdgeTable | null, 'mm', r3('graph.ts p.edgeThickness'), 'Кромка не перенесена в H1 (вопрос Q2, H-18): одна толщина проекта'),
    shelfSupportRule: constant('R3_PIN', 'rule', r3('joinery.ts SHELF_PIN, edit.ts shelfGridBase'), 'Сетка по высоте и подбор полкодержателя не перенесены в H1 (FINDINGS 237): штифт P101Zn.56 на высоте полки'),
    hdfBack: constant(null as HomeHdfBack | null, 'rule', r3('graph.ts structural_back'), 'Задняя стенка — несущая из плиты корпуса; выбора ХДФ в r4 нет (515)'),
    baseChoice: constant(null as HomeBaseChoice | null, 'rule', r3('graph.ts floor_pad'), 'Основание — подпятники; выбора основания в r4 нет (516)'),
    handles: constant(null as HomeHandles | null, 'rule', r3('outputs.ts hardware(), visualParts'), 'Ручка-кнопка RC282BL.4 на каждом фасаде; выбора ручки в r4 нет (513)'),
    drawerBottomHdf: constant(null as HomeDrawerBottomHdf | null, 'rule', r3('graph.ts drawer_bottom'), 'Дно ящика — плита короба 16 мм на конфирматах; ХДФ в пазу в r4 нет (574)'),
    drawerRunnerRule: constant(null as HomeDrawerRunnerRule | null, 'rule', r3('catalog.ts runnerVariants'), 'Направляющая ящика — BOYARD DB4501 под любым коробом; подбора по уровню фурнитуры в r4 нет (574)'),
    cableOutlet: constant(null as HomeCableOutlet | null, 'rule', r3('joinery.ts'), 'Отверстия под провода нет: у корпуса только признак `cable` (H-14); в r4 его нет (574)'),
    tvDeskLoadKg: constant(10, 'kg', r3('edit.ts create'), 'Нагрузка крышки ТВ-тумбы — 10 кг, как у любой крышки'),
    doorShelvesRemovable: constant(false, 'rule', r3('edit.ts create'), 'Полки ТВ-тумбы и низкого шкафа за дверями — закреплённые'),
    standardPlinthAndHdf: constant(false, 'rule', decision('MOD-DEC-516'), 'Стандартное изделие открывается на подпятниках с задником из плиты (515, 516)'),
    newShelfInFreeSpace: constant(false, 'rule', r3('edit.ts addShelf'), 'Новая полка встаёт посередине корпуса по сетке, даже если там уже стоит полка ниши'),
    frontsInFreeSpace: constant(false, 'rule', r3('edit.ts addDrawer, addDoor'), 'Новый ящик встаёт внизу ниши, новая дверца — на всю высоту ниши, даже если там уже стоит фасад'),
    drawerCoverRise: constant(null as number | null, 'rule', r3('edit.ts addDrawer'), 'Полки над ящиком нет'),
    keepFrontHeights: constant(false, 'rule', r3('edit.ts spreadStack'), 'Стопка фасадов на новом основании или высоте корпуса растягивается пропорционально, дробными миллиметрами; перегородки после новой ширины — дробными'),
    namedLimits: constant(false, 'rule', r3('validate.ts'), 'Отказ по габаритам — «Габариты выходят за поддерживаемую область», мелкая перегородка — «нужна глубина от 202 мм» перегородки, не корпуса'),
    heightMovesShelves: constant(false, 'rule', r3('edit.ts resize'), 'Полки при новой высоте корпуса стоят на прежней высоте от пола; полка выше новой крышки — отказ'),
    uniformLoadLimit: constant(false, 'rule', r3('beam() L/200'), 'Груз полки и крышки — сосредоточенный в середине пролёта, экран прогиба L/200 не утверждён; допустимой нагрузки нет'),
    catalogDecors: constant(false, 'rule', r3('catalog.ts materials'), 'Материал корпуса — один из трёх: светлый дуб, тёплый белый, графит'),
    deskPedestalSide: constant(false, 'rule', r3('edit.ts create desk'), 'Тумба стола — слева от места для ног'),
    copyPlacement: constant(false, 'rule', r3('edit.ts copy'), 'Копия корпуса встаёт вплотную справа от композиции'),
    partialPartitions: constant(false, 'rule', r3('edit.ts addPartition'), 'Перегородка — во всю высоту корпуса, от дна до крышки'),
    wallHanging: constant(null as HomeWallHanging | null, 'rule', r3('graph.ts floor_pad'), 'Навесов нет: корпус стоит на подпятниках'),
    nichePanels: constant(false, 'rule', r3('graph.ts bottom, continuous_top'), 'У каждого корпуса есть дно и крышка'),
    topRim: constant(null as HomeTopRim | null, 'rule', r3('graph.ts continuous_top'), 'Бортика нет: над крышкой деталей нет'),
    vanityMirror: constant(null as HomeVanityMirror | null, 'rule', r3('graph.ts continuous_top'), 'Зеркала над крышкой нет'),
    flapFronts: constant(false, 'rule', r3('mechanisms.ts hingeProfile'), 'Дверца — только на петлях'),
    lighting: constant(false, 'rule', r3('outputs.ts hardware()'), 'Подсветки нет'),
    glassDoors: constant(null as HomeGlassDoor | null, 'rule', r3('graph.ts door'), 'Дверь — из плиты фасадов, стеклянной нет'),
    topCorners: constant(null as HomeTopCorners | null, 'rule', r3('graph.ts continuous_top'), 'Углы крышки прямые'),
    pushToOpen: constant(false, 'flag', r3('graph.ts door'), 'Дверь открывается ручкой, открывания нажатием нет'),
    casters: constant(false, 'flag', r3('graph.ts floor_pad'), 'Колёс нет'),
  },
} as const satisfies PolicyModule;

/**
 * Rule set r5: "other furniture" on the rules of the wardrobe (MOD-DEC-513 over 341) — r4 and, step by step, the norms
 * of the wardrobe where the type has no rule of its own (FINDINGS 840–855). Built by the tests until its last step makes
 * it the rule set of new projects (FINDINGS 854): a saved project is never recalculated silently between the steps.
 */
export const homeRulesR5 = {
  id: 'home-rules',
  version: 'r5',
  constants: {
    ...homeRulesR4.constants,
    hingeRule: constant('WARDROBE', 'rule', decision('MOD-DEC-513'), 'Петли — по правилу шкафа (341): пара «петля + планка» по наложению (073, 286, 329), число — по графику петли (190), станции W4 (378), присадка — комплект или каталог (277); масса двери — объём × плотность плиты (355) — FINDINGS 841, 842'),
    edgeByPart: constant(
      wardrobeEdgeTable() as HomeEdgeTable | null,
      'mm',
      decision('MOD-DEC-513'),
      'Кромка по виду детали — модель шкафа (§18, 193): фасад 2,0 по кругу, передний торец боковины, перегородки и дна 1,0, полки 0,4, короб ящика 2,0 сверху; крышка 1,0 по кругу, царга стола 1,0 снизу (Д) — FINDINGS 843',
    ),
    shelfSupportRule: constant(
      'WARDROBE',
      'rule',
      decision('MOD-DEC-513'),
      'Полкодержатель съёмной полки — по правилу шкафа: комплект уровня проекта (332, 344; «Стандарт» — FLIPPER), ось — на сетке System 32 от оси дна, запасные уровни ±32 мм (193), задняя линия у боковины — D − 37 (FINDINGS 270), у перегородки — 343 — FINDINGS 844, 845',
    ),
    hdfBack: constant(
      HDF_BACK as HomeHdfBack | null,
      'mm',
      decision('MOD-DEC-515'),
      'Задняя стенка по умолчанию — несущая из плиты корпуса; пользователь может заменить её на ХДФ 4 мм в четверти боковин, дна и крышки — рабочий профиль четверти шкафа (287): 8 мм в плоскости, 4,5 мм по глубине, зазоры 0,5 мм — FINDINGS 939',
    ),
    baseChoice: constant(
      BASE_CHOICE as HomeBaseChoice | null,
      'mm',
      decision('MOD-DEC-516'),
      'Основание по умолчанию — подпятники; пользователь может поставить корпус на цоколь шкафа (291: 70 мм, передняя планка в 20 мм от фасада корпуса, задняя — перед четвертью ХДФ, 456) или на ножки каталога фурнитуры (480, 481); высота цоколя или ножек — 40…250 мм, как у шкафа — FINDINGS 946',
    ),
    handles: constant(
      HANDLES as HomeHandles | null,
      'id',
      decision('MOD-DEC-513'),
      'Ручки — по правилу шкафа (480): ручка каталога фурнитуры на выбор пользователя или «без ручек»; у нового проекта — скоба RS425BAP.5/128, у сохранённого r5 без выбора — кнопка RC282BL.4 (Д); дверь — вертикально у свободного края, середина в 1000 мм от пола в пределах двери; ящик — горизонтально по центру фасада; присадку делают монтажники (158) — FINDINGS 965',
    ),
    drawerBottomHdf: constant(
      DRAWER_BOTTOM_HDF as HomeDrawerBottomHdf | null,
      'mm',
      decision('MOD-DEC-574'),
      'Дно ящика — ХДФ 4 мм в пазу четырёх стенок короба, паз шкафа под дно (W7): 4,2 × 6 мм, низ паза в 10 мм от низа стенки; у нового проекта — всегда, у сохранённого r5 без поля `drawerBottom` — плита короба 16 мм, как он был сохранён (Д) — FINDINGS 1304',
    ),
    drawerLoadKg: constant(10, 'kg', decision('MOD-DEC-574'), 'Груз ящика нового проекта и обновлённого r4 → r5 — 10 кг белья в ящике комода, как полезная нагрузка полки (289); груз 5 кг прототипа при обновлении становится 10 кг, введённый другой груз и груз сохранённого r5 не меняются (уточнение 574, (Д) Директора) — FINDINGS 1756'),
    drawerRunnerRule: constant(
      'LEVEL_466' as HomeDrawerRunnerRule | null,
      'rule',
      decision('MOD-DEC-574'),
      'Направляющая каждого ящика — по 466 (`selectDrawerSlide`): направляющая уровня фурнитуры проекта, затем «Стандарта», затем по порядку подбора — первая, под которую строится короб, и что держит ящик с грузом; иначе — направляющая уровня с замечанием о перегрузке. «Эконом» — шариковая BOYARD DB4501, короб прототипа с дном из ХДФ в пазу, присадка направляющей — по её набору БАЗИС (FINDINGS 2746); «Стандарт» — скрытого монтажа BOYARD B-Slide DB8781, короб по набору БАЗИС: дно из плиты 16 мм на 11 мм выше низа боковин, задняя стенка над ним, фасад вместо внутренней передней стенки; «Премиум» — Blum MOVENTO без набора короба, взамен B-Slide «Стандарта» с замечанием (465) (уточнение 574, (Д)); у сохранённого r5 без поля `drawerRunner` — DB4501, как он был сохранён — FINDINGS 1750, 1755',
    ),
    cableOutlet: constant(
      CABLE_OUTLET as HomeCableOutlet | null,
      'mm',
      decision('MOD-DEC-574'),
      'Вывод проводов ТВ-тумбы (496) — сквозное отверстие прототипа r1 (`home-legacy.js`, `CABLE`): Ø60 мм в задней стенке корпуса с `cable`, посередине ширины, центр в 100 мм ниже крышки; у нового проекта — всегда, у сохранённого r5 без поля `cableOutlet` — без отверстия, как он был сохранён (Д) — FINDINGS 1307',
    ),
    tvDeskLoadKg: constant(25, 'kg', decision('MOD-DEC-574'), 'Нагрузка крышки новой ТВ-тумбы — телевизор до 25 кг, как у крышки IKEA BESTÅ 180 (SOURCES.md); у прочих изделий — 10 кг — FINDINGS 1308'),
    doorShelvesRemovable: constant(true, 'rule', decision('MOD-DEC-574'), 'Полки новой ТВ-тумбы и нового низкого шкафа за дверями — съёмные, на полкодержателях по сетке System 32, как у шкафа и у аналогов (IKEA BESTÅ, HEMNES); полка открытой секции ТВ-тумбы — закреплённая — FINDINGS 1309'),
    standardPlinthAndHdf: constant(true, 'rule', decision('MOD-DEC-575'), 'Стандартное изделие открывается на цоколе шкафа 70 мм с задником из ХДФ 4 мм в четверти, как у производителей (IKEA, Hoff); письменный стол — на подпятниках с задником ХДФ, «Своя конструкция» — подпятники и плита (474, 515, 516); полки стеллажа, обувницы, ТВ-тумбы и низкого шкафа делят высоту над цоколем поровну — FINDINGS 1310'),
    newShelfInFreeSpace: constant(true, 'rule', decision('MOD-DEC-575'), 'Новая полка без высоты, чьё место посередине корпуса занято полкой той же ниши, встаёт посередине самого большого свободного просвета ниши (Д): на цоколе полка стандарта стоит посередине — FINDINGS 1311'),
    frontsInFreeSpace: constant(
      true,
      'rule',
      decision('MOD-DEC-744'),
      'Новый ящик без высоты встаёт внизу самой нижней свободной части ниши (между дном, полками, фасадами и крышкой), высотой 180 мм, а если над ним осталось бы меньше 160 мм — на всю свободную часть; новая дверца без высоты — на самую большую свободную часть ниши; отказ называет свободные части ниши и деталь, которая мешает (Д, MOD-AI-34, 71) — FINDINGS 3300, 3301',
    ),
    drawerCoverRise: constant(
      2 as number | null,
      'mm',
      decision('MOD-DEC-744'),
      'Новый ящик, над которым в нише остаётся место (не крышка, не полка и не ящик сверху), сам закрывается неподвижной полкой: верх полки — на 2 мм выше верхнего торца фасада ящика; полка переносится вместе с ящиком и убирается только вручную; новый ящик сразу над ящиком с полкой забирает её себе, а если сверху его закрывает крышка, полка или ящик — полка между ними убирается (Д) — FINDINGS 3302',
    ),
    keepFrontHeights: constant(
      true,
      'rule',
      decision('MOD-DEC-741'),
      'Стопка фасадов на новом основании, полу или высоте корпуса сохраняет высоты ящиков: разницу берёт свободное место в стопке, затем её дверцы пропорционально высоте (каждая от 160 мм), и только стопка из одних ящиков или та, чьи дверцы не могут её взять, меняет все фасады пропорционально высотам; высоты, низы фасадов и оси перегородок после новой ширины — целые миллиметры; правка перечисляет сдвинутые фасады и полки (Д, MOD-AI-38, 81) — FINDINGS 3303, 3304',
    ),
    namedLimits: constant(
      true,
      'rule',
      decision('MOD-DEC-741'),
      'Отказ по габаритам называет ось, размер корпуса и его область (ширина 200–2400, высота 300–2200, глубина 200–650 мм); мелкая перегородка с общей полкой — наименьшую глубину корпуса, при которой гнёзда полки помещаются (Д, MOD-AI-35) — FINDINGS 3305',
    ),
    heightMovesShelves: constant(
      true,
      'rule',
      decision('MOD-DEC-741'),
      'При новой высоте корпуса полки сохраняют место в высоте его внутреннего объёма, в целых миллиметрах; переставляемая полка встаёт на ряд отверстий, полка над ящиком идёт за ящиком (Д, MOD-AI-35) — FINDINGS 3305',
    ),
    uniformLoadLimit: constant(
      true,
      'rule',
      decision('MOD-DEC-748'),
      'Порог пилота для полок и крышек — прогиб L/200 при равномерной нагрузке, опоры как в графе; допустимая нагрузка, кг (с округлением вниз), показывается как ориентир, заявленный груз больше неё — предупреждение (MOD-AI-55) — FINDINGS 3306',
    ),
    catalogDecors: constant(
      true,
      'rule',
      decision('MOD-DEC-741'),
      'Материал корпуса — и любой декор общего каталога выпуска (577), как у шкафа: толщина плиты — из вариантов декора, прежняя толщина сохраняется, если декор в ней продаётся; цена листа — по каталогу (508, 569); три прежних материала остаются (Д, MOD-AI-39) — FINDINGS 3307',
    ),
    deskPedestalSide: constant(
      true,
      'rule',
      decision('MOD-DEC-741'),
      'Тумба стола — слева или справа от места для ног: стол зеркалится целиком, двери меняют сторону петель (Д, MOD-AI-41) — FINDINGS 3308',
    ),
    copyPlacement: constant(
      true,
      'rule',
      decision('MOD-DEC-741'),
      'Копия корпуса — справа или слева от композиции, вплотную или с зазором, мм; слева остальные корпуса сдвигаются вправо (Д, MOD-AI-42) — FINDINGS 3309',
    ),
    partialPartitions: constant(
      true,
      'rule',
      decision('MOD-DEC-741'),
      'Перегородка — и от неподвижной полки до крышки: ниша под полкой остаётся во всю ширину, над полкой — две; перегородка крепится к полке, как к дну (Д, MOD-AI-75) — FINDINGS 3310',
    ),
    wallHanging: constant(
      WALL_HANGING as HomeWallHanging | null,
      'rule',
      decision('MOD-DEC-741'),
      'Корпус — и подвесной: на навесах Hettich SAH 216 и шине 9007651, как навесной шкаф кухни (566 п. 2): задник ХДФ в пазу в 16 мм от заднего края, боковины от 16 мм, глубина до 400 мм, высота больше глубины, 2 × 55 кг и шина 130 кг; низ нового — 1400 мм от пола (565 п. 12), верх — не выше 2200 мм (Д, MOD-AI-33) — FINDINGS 3311',
    ),
    nichePanels: constant(
      true,
      'rule',
      decision('MOD-DEC-168'),
      'Корпус в нише — и без дна или без крышки: пол и потолок ниши заменяют их, остальные детали стоят на своих местах, крепёж снятой детали уходит с ней; изменённый состав панелей — черновик, не допуск к производству; не у стола, подвесного корпуса, на цоколе или ножках и с задником ХДФ (Д, MOD-AI-32) — FINDINGS 3312',
    ),
    topRim: constant(
      TOP_RIM as HomeTopRim | null,
      'rule',
      decision('MOD-DEC-741'),
      'Бортик на крышке — доски корпуса на крышке слева, сзади и справа (у пеленальной доски комода — все три), высотой 50–200 мм, по умолчанию 100 мм; боковые — до заднего, каждая на эксцентриках к крышке; кромка 1 мм по торцам и верху; габарит изделия — с бортиком; не у корпуса без крышки (Д, MOD-AI-40) — FINDINGS 3313',
    ),
    vanityMirror: constant(
      VANITY_MIRROR as HomeVanityMirror | null,
      'rule',
      decision('MOD-DEC-741'),
      'Зеркало над крышкой — заготовка «Туалетный столик» и правка любого корпуса: щит из плиты корпуса во всю ширину на задней кромке крышки, на эксцентриках к ней, как задний бортик; высота 300–1000 мм, по умолчанию 600 мм; на лицевой пласти — зеркало серебро 4 мм каталога стекла с полем щита 20 мм, приклеено, режет и обрабатывает стекольщик, в раскрой не идёт; цена — по м² каталога; габарит изделия — с зеркалом; не с бортиком и не у корпуса без крышки (Д, MOD-AI-73) — FINDINGS 3322',
    ),
    flapFronts: constant(
      true,
      'rule',
      decision('MOD-DEC-741'),
      'Дверца — и откидной фасад обувницы: открывается вверх на подъёмнике каталога без петель (DTC TOP STAY SQ), подъёмник подбирается по INV-D18-01, как у подъёмного фасада шкафа (320); присадки подъёмника в каталоге нет — «присадка неполная» (277); фасад — верхний в своей нише (Д, MOD-AI-40) — FINDINGS 3314',
    ),
    lighting: constant(
      true,
      'rule',
      decision('MOD-DEC-483'),
      'Подсветка корпуса — как у шкафа: в каждой нише до крышки самый длинный светильник каталога, который входит в её ширину, посередине, под крышкой, передний край в 50 мм за её передней кромкой; один блок питания на изделие по сумме мощностей; присадку не считаем — светильник ставят монтажники; не у стола и корпуса без крышки (Д, MOD-AI-37) — FINDINGS 3315',
    ),
    glassDoors: constant(
      GLASS_DOOR as HomeGlassDoor | null,
      'rule',
      decision('MOD-DEC-741'),
      'Стеклянная дверь — как отдельная стеклянная дверь витрины кухни (KW_GLASS прототипа): прозрачное стекло 6 мм на месте фасада, внутренней плоскостью там же, где у фасадов из плиты; петли для стекла каталога по таблице наложений, масса по плотности стекла 2500 кг/м³; кромки и отверстия под чашки — стекольщик, в раскрой стекло не идёт; цена — стекло 6 мм за м² карты кухни; не откидная (Д, MOD-AI-37) — FINDINGS 3316',
    ),
    topCorners: constant(
      TOP_CORNERS as HomeTopCorners | null,
      'rule',
      decision('MOD-DEC-741'),
      'Скруглённые углы крышки — два передних угла по радиусу 20–100 мм, по умолчанию 50 мм; дуга — 8 отрезков контура, кромка дуги — кромка передней кромки крышки; деталь раскраивается по габариту, контур — следующей операцией; не с боковым бортиком (Д, MOD-AI-73) — FINDINGS 3317',
    ),
    pushToOpen: constant(
      true,
      'flag',
      decision('MOD-DEC-483'),
      'Открывание нажатием — как у шкафа и кухни (483, 485): дверь из плиты на петлях без пружины BOYARD H901 и толкателе каталога в передней кромке дна, неподвижной полки или крыши вровень с корпусом, ось в 100 мм от свободного края (latchPlacement); ручки у таких дверей нет; ящики, откидные и стеклянные двери остаются с ручками (Д, MOD-AI-36) — FINDINGS 3319',
    ),
    casters: constant(
      true,
      'flag',
      decision('MOD-DEC-741'),
      'Колёса — основание корпуса из каталога (FINDINGS 2767): пара одного уровня фурнитуры проекта одной высоты и площадки, с тормозом и без (нет такой пары — уровень выше); станции — как у ножек (legStations: 50 мм от краёв, шаг ряда не больше 900 мм), передний ряд — с тормозом; высота основания — высота колеса; нагрузка на колёса сравнивается с нагрузкой каталога; не у стола и не у подвесного корпуса (Д, MOD-AI-73) — FINDINGS 3320',
    ),
  },
} as const satisfies PolicyModule;

/**
 * MOD-DEC-343 for "other furniture": gnezda of a shelf on a partition. The left shelf on the System 32 front line
 * (37 mm from the finished front edge) and the rear row G; the right shelf 16 mm deeper: 53 and G − 16.
 * The dowel of a fixed shelf is 32 mm towards the centre (192).
 */
export const homeSharedShelf = {
  id: 'home-shared-shelf',
  version: '1',
  constants: {
    frontLine: constant(37, 'mm', decision('MOD-DEC-343'), 'Передний ряд — 37 мм от готового переднего края (System 32)'),
    stagger: constant(16, 'mm', decision('MOD-DEC-343'), 'Правая полка — на 16 мм глубже левой, спереди и сзади'),
    rearMin: constant(37, 'mm', decision('MOD-DEC-343'), 'Задний ряд G — последний ряд сетки, отстоящий от заднего края не меньше чем на 37 мм'),
    step: constant(system32.constants.step.value, 'mm', decision('MOD-DEC-193'), 'Шаг сетки 32 мм'),
    dowelShift: constant(32, 'mm', decision('MOD-DEC-192'), 'Шкант — на 32 мм к центру'),
  },
} as const satisfies PolicyModule;

/**
 * The removable shelf of r5 on the supports of the wardrobe (MOD-DEC-513, FINDINGS 845): the colour of the support body
 * by the decor of the shelf. The three materials of "other furniture" have no decor of the shared catalogue, so the
 * rule of 344 (the colour nearest to the decor) is applied to them by name (Д, FINDINGS 931).
 */
export const homeShelfSupport = {
  id: 'home-shelf-support',
  version: '1',
  constants: {
    bodyColour: constant(
      Object.freeze({ oak: 'прозрачный', white: 'белый', graphite: 'антрацит' }) as Readonly<Record<string, string>>,
      'colour',
      decision('MOD-DEC-344'),
      '(Д) Цвет корпуса полкодержателя — ближайший к декору полки (344) для трёх материалов другой мебели: светлый дуб — прозрачный, тёплый белый — белый, графит — антрацит — FINDINGS 931',
    ),
  },
} as const satisfies PolicyModule;

export type HomeConstants = Values<typeof homeCommon>;
export const HOME: HomeConstants = valuesOf(homeCommon);
export const HOME_SHARED_SHELF = valuesOf(homeSharedShelf);
export const HOME_SHELF_SUPPORT = valuesOf(homeShelfSupport);
const R3_RULES: HomeRuleSet = { generator: HOME_R3, ...valuesOf(homeRulesR3) } as HomeRuleSet;
const R4_RULES: HomeRuleSet = { generator: HOME_R4, ...valuesOf(homeRulesR4) } as HomeRuleSet;
const R5_RULES: HomeRuleSet = { generator: HOME_R5, ...valuesOf(homeRulesR5) } as HomeRuleSet;

/** Rule set of a project: r3 for a project built by the prototype generator, r5 for one built by r5, otherwise the current r4. */
export const homeRules = (p: { generatorVersion?: unknown } | null | undefined): HomeRuleSet => {
  const v = p && typeof p === 'object' ? p.generatorVersion : null;
  return v === HOME_R3 ? R3_RULES : v === HOME_R5 ? R5_RULES : R4_RULES;
};

/** Versions of the home policy written into the graph (MOD-DEC-054). */
export const homePolicyVersions = (rules: HomeRuleSet): Record<string, string> =>
  rules.generator === HOME_R3
    ? { [homeCommon.id]: homeCommon.version, [homeRulesR3.id]: homeRulesR3.version }
    : rules.generator === HOME_R4
      ? { [homeCommon.id]: homeCommon.version, [homeRulesR4.id]: homeRulesR4.version, [homeSharedShelf.id]: homeSharedShelf.version, [jointStations.id]: jointStations.version }
      : {
          [homeCommon.id]: homeCommon.version,
          [homeRulesR5.id]: homeRulesR5.version,
          [homeSharedShelf.id]: homeSharedShelf.version,
          [jointStations.id]: jointStations.version,
          [hingeSelection.id]: hingeSelection.version,
          [wardrobeFacades.id]: wardrobeFacades.version,
          [edgeModel.id]: edgeModel.version,
          [system32.id]: system32.version,
          [shelfSupportSelection.id]: shelfSupportSelection.version,
          [wardrobeFill.id]: wardrobeFill.version,
          [homeShelfSupport.id]: homeShelfSupport.version,
          [fittingsSelection.id]: fittingsSelection.version,
        };

/**
 * Rows of a shelf in depth on a side or a partition (MOD-DEC-343, System 32): distances from the finished front edge
 * of the vertical whose depth is `depthMm`. Front F, rear G = last line 37 + 32·n at least 37 mm from the rear edge;
 * the right shelf of a partition 16 mm deeper. null when the vertical is too shallow for two rows.
 */
export function system32Rows(depthMm: number, right: boolean): [number, number] | null {
  const c = HOME_SHARED_SHELF,
    n = Math.floor((depthMm - c.rearMin - c.frontLine) / c.step);
  if (!(n >= 1)) return null;
  const shift = right ? c.stagger : 0;
  return [c.frontLine + shift, c.frontLine + n * c.step - shift];
}

/**
 * A partition of this depth carries shelves from both sides (MOD-DEC-343): the rear stations of the right shelf stay
 * in front of its front ones, dowels included.
 */
export function sharedShelfFits(depthMm: number): boolean {
  const S = HOME_SHARED_SHELF,
    G = system32Rows(depthMm, false)?.[1] ?? NaN;
  return G - S.stagger - S.dowelShift > S.frontLine + S.stagger + S.dowelShift;
}

/** The smallest depth of a partition, whole millimetres, that carries shelves from both sides (202 mm, MOD-DEC-343). */
export function sharedShelfMinDepth(): number {
  let d = 1;
  while (!sharedShelfFits(d)) d++;
  return d;
}
