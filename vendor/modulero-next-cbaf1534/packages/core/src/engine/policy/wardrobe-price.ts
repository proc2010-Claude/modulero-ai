// Policy of the price of the swing wardrobe (tasks W5, W11). By MOD-DEC-285 the port first repeated the prototype's
// demo price (W5); in its second stage, task W11, the maker's rates are the only source of the price: delivery,
// assembly and markup are the rates of the project (`rates`), not the demo profile (FINDINGS 520). The rates the form
// of the project does not hold are the maker's rate card below. Each says where it comes from: an owner decision
// (taken as it is, MOD-DEC-348), or an averaged price of the project (MOD-DEC-569, docs/product/PRICE_GAPS.md) — until
// version 12 a temporary value, the prototype's number or a price by analogue (MOD-DEC-264, «Цена условная»).
// MOD-DEC-509 (FINDINGS 830–839): the hardware is priced by the article of its graph mechanism; the rates of the
// prototype's form are temporary values (`formRates`), and a rate of the form is the maker's only when the maker has
// set it — when it is not the value of the prototype's form. MOD-DEC-536 (FINDINGS 990–993): the prices of the
// hardware and the fasteners — the confirmat, the body and the stem of the eccentric, the dowels, the shelf pin — are
// the records of the hardware catalogue; the policy names the record a line without an article of the graph takes.
// Version 8 — FIT (MOD-DEC-480, 536; FINDINGS 725): the rods, their holders, the legs and the handles are priced by the
// record of their article in the hardware catalogue; the prototype's numbers of the handle, the rod and the rod support
// are records of the catalogue with a temporary price, named here like the shelf pin.
// Version 9 — the second PR of FIT (MOD-DEC-483): the clips of a decorative plinth, the lights of the sections and their
// power supply by the records of their articles; the outer sides of another decor — sheets of their own decor.
// Version 10 (MOD-DEC-485): the latches of the doors opened by pressing by the records of their articles.
// Version 11 — the third PR of FIT (MOD-DEC-484): the baskets, trouser racks and pantographs by the records of the
// articles of their colour.
// Version 12 — the prices of the release (MOD-DEC-569, FINDINGS 1210): the delivery, the saw, the board and the rates
// of the form are the averaged prices of the project, not temporary values; the values of the prototype's form are kept
// apart (`prototypeForm`) only to tell the maker's rate from them (509).
// Version 13 (MOD-DEC-569, FINDINGS 1601): a ready-made facade without a chosen execution is priced by the cheapest
// tariff of the materials catalogue, not by the demo tariff of the prototype's start project; a rate of the project
// other than the demo one is the project's, as before.
// Version 14 (MOD-DEC-569, FINDINGS 1603): a sheet of ЛДСП of a decor outside the material catalogue — the built-in
// decors of the prototype, W960 first — or without a sheet of its thickness there takes the averaged price of a sheet
// of the project, the board rate times the area of the sheet to the rouble; a built-in decor with a record of the
// catalogue (W980, U708, U702) takes the price of its sheet. Not conditional; the rate of the option is not a price.
// Version 15 (MOD-DEC-569, FINDINGS 1606–1608): the sheets of HDF and of the ЛДСП 10 mm of the inserts of the sliding
// leaves take the price of the board of the release in the material catalogue, the ЛМДФ the price of its variant (a
// format its decor has not — the rate of ЛМДФ times the area); the rate of HDF of the project equal to the prototype's
// value of the form is not a price, as the rates of the form (509).
// Version 16 (MOD-DEC-569, FINDINGS 1831): the rates of the board and of ЛМДФ — the means of the prices of the sheets at
// the dealers (docs/product/prices/boards-2026-10-27.json).
// Version 17 (MOD-DEC-569, FINDINGS 1833): the saw, the delivery and the rates of the hole, the cup and the groove — the
// means of the prices of the workshops (docs/product/prices/works-2026-10-27.json).
// Version 18 (MOD-DEC-569, FINDINGS 1836): the edge banding by the rates of the card (`edgeRates`) — the means of the
// prices of the workshops in the classes of the price list of the prototype, which stays as it is for the oracle.
import { constant, decision, prototype, type PolicyModule } from './types.js';

const PRICE = 'FINDINGS 310';
const W11 = 'FINDINGS 521';
const RASTEX = 'FINDINGS 523';
const ARTICLE = 'FINDINGS 831';
const RELEASE = decision('MOD-DEC-569');

export const wardrobePrice = {
  id: 'wardrobe-price',
  version: '18',
  constants: {
    boardFormats: constant(
      [
        [2800, 2070],
        [2750, 1830],
      ] as const,
      'mm',
      prototype('r1.html:54360 v17CutJob: форматы ЛДСП 2800 × 2070 и 2750 × 1830', PRICE),
      'Форматы листа плиты корпуса для оценки раскроя (высота вдоль рисунка × ширина), если декор не выбран',
    ),
    hdfFormats: constant(
      [
        [2745, 1700],
        [2440, 1220],
      ] as const,
      'mm',
      prototype('r1.html:54360 v17CutJob: форматы ХДФ 2745 × 1700 и 2440 × 1220', PRICE),
      'Форматы листа ХДФ для оценки раскроя',
    ),
    hdfThickness: constant(4, 'mm', prototype('r1.html:54360 v17CutJob: ХДФ 4 мм', PRICE), 'Толщина ХДФ в задании раскроя'),
    sqMmPerSqM: constant(1e6, 'mm²/m²', prototype('r1.html:54366 rate × height × width / 1e6', PRICE), 'Площадь, мм² → м²'),
    // ---- the maker's rates of the services: on the cost C — all the parts and materials (MOD-DEC-402)
    markupPercent: constant(30, '%', decision('MOD-DEC-402'), 'Наценка изготовителя — процент от себестоимости C (стоимость всех деталей и материалов)'),
    assemblyPercent: constant(14, '%', decision('MOD-DEC-402'), 'Сборка — процент от себестоимости C'),
    deliveryRub: constant(2500, 'RUB', RELEASE, 'Доставка, ₽ за заказ — усреднённая цена проекта: средняя цен доставки по городу трёх цехов на 2026-10-27 (docs/product/prices/works-2026-10-27.json, FINDINGS 1833; прежде — 5000 ₽, число прототипа V17_PRICE.delivery, r1.html:54323)'),
    // ---- the maker's rate card: the rates the form of the project does not hold (W11)
    sawRateRub: constant(63.8, 'RUB/m', RELEASE, 'Распил, ₽ за метр реза — усреднённая цена проекта: средняя цен распила ЛДСП 16 мм пяти цехов на 2026-10-27 (docs/product/prices/works-2026-10-27.json, FINDINGS 1833; прежде — 35 ₽, число прототипа V17_PRICE.sawRate, r1.html:54323)'),
    // the kerf and the trim are those of the cutting plan the price cuts with (MOD-DEC-505, 445): policy/cutting.ts
    boardRateRub: constant(900.43, 'RUB/m²', RELEASE, 'Плита декора без цены листа — цена за м², если ставка плиты в проекте не задана числом; усреднённая цена проекта — средняя цен листов ЛДСП EGGER 16 и 18 мм и Lamarty 16 мм у дилеров на 2026-10-27, по дилеру одна доля (docs/product/prices/boards-2026-10-27.json, FINDINGS 1830; прежде — 1610 ₽/м², поле material нового проекта прототипа)'),
    facadeTariffRub: constant(4900, 'RUB/m²', RELEASE, 'Готовые фасады без выбранного исполнения, ₽ за м² — тариф HOLZCOM «Плёнка 16 мм» (HOLZCOM-FACADE-06), самый дешёвый тариф каталога материалов; усреднённая цена проекта (прежде — демонстрационный тариф стартового проекта)'),
    lmdfRateRub: constant(1561.23, 'RUB/m²', RELEASE, 'Лист ЛМДФ формата, которого у декора в каталоге материалов нет, — цена за м² × площадь листа, до рубля; усреднённая ставка ЛМДФ EGGER 16 и 18 мм — средняя цен листов у дилеров на 2026-10-27, по дилеру одна доля (docs/product/prices/boards-2026-10-27.json, FINDINGS 1830; прежде — 2100 ₽/м², FINDINGS 1606)'),
    prototypeHdfRub: constant(333, 'RUB/m²', prototype('r1.html:3558 поле «ХДФ, ₽/м²» (hdfPrice) нового проекта: 333', 'FINDINGS 1607'), 'Значение поля ХДФ прототипа — не цена: ставка проекта, равная ему, берёт цену листа ХДФ каталога материалов; иная — ставка изготовителя × площадь листа, условно (508)'),
    prototypeFacadeRub: constant(2500, 'RUB/m²', prototype("r1.html:54336 state.facadeFinish: «Готовые фасады · демонстрационный тариф», rate 2500", 'FINDINGS 1601'), 'Демонстрационный тариф стартового проекта прототипа — не цена: ставка проекта, равная ему, берёт тариф карты'),
    confirmatItem: constant('CONFIRMAT_7X50', 'id', prototype('r1.html:12784 (confirmats + drawerConfirmats) × 10', W11), 'Конфирмат — позиция каталога фурнитуры с ценой (MOD-DEC-536, FINDINGS 991)'),
    shelfPinItem: constant('PROTOTYPE_SHELF_PIN', 'id', prototype('r1.html:12784 totalShelfPins × 5', W11), 'Полкодержатель без артикула в графе — позиция каталога (MOD-DEC-536, FINDINGS 991), цена — усреднённая цена проекта (569)'),
    rodSupportItem: constant('PROTOTYPE_ROD_SUPPORT', 'id', prototype('r1.html:12784 totalRods × 2 × 80', W11), 'Опора штанги без артикула (модель без фурнитуры FIT) — позиция каталога (MOD-DEC-536), цена — усреднённая цена проекта (569)'),
    handleItem: constant('PROTOTYPE_HANDLE', 'id', prototype('r1.html:3579 форма «Тарифы производства и фурнитуры»: ручка 300', ARTICLE), 'Ручка без цены по артикулу — позиция каталога (536), цена — усреднённая цена проекта (569); ставка ручки в форме проекта, равная ставке формы прототипа, — не ставка изготовителя (509)'),
    rodItem: constant('PROTOTYPE_ROD', 'id', prototype('r1.html:3579 форма «Тарифы производства и фурнитуры»: штанга 350 («демо»)', ARTICLE), 'Штанга без цены по артикулу — позиция каталога (536), цена — усреднённая цена проекта (569); ставка штанги в форме проекта, равная ставке формы прототипа, — не ставка изготовителя (509)'),
    rodSupportsPerRod: constant(2, 'pcs', prototype('r1.html:12784 totalRods × 2 × 80', PRICE), 'Опор на одну штангу'),
    eccentricBodies: constant(['25062', '13957', '73457', '25066'] as const, 'article', decision('MOD-DEC-293'), 'Артикулы корпусов Hettich Rastex 15 (16, 18, 19, 22 мм) — строка «Корпус эксцентрика»; цена корпуса — в каталоге (293, 536)'),
    eccentricStems: constant(['47458'] as const, 'article', prototype('r1.html:88298 r7: шток эксцентрика по артикулу', RASTEX), 'Артикулы штоков эксцентрика — строка «Шток эксцентрика»; цена — в каталоге (536)'),
    dowelItems: constant(
      { '8X35': 'HETTICH_DOWEL_8X35', '8X30': 'DOWEL_8X30' } as Readonly<Record<string, string>>,
      'id',
      prototype('r1.html:87736 r7: шкант 8×35 · sku 9223927 (Hettich, r1.html:99076); у 8×30 артикул не выбран', 'FINDINGS 523, 811'),
      'Деревянный шкант по размеру — позиция каталога фурнитуры с ценой (MOD-DEC-536, FINDINGS 991)',
    ),
    formRates: constant(
      { holePrice: 23.87, cupPrice: 97.46, groovePrice: 142.64, hingePrice: 181.33, drawerKitPrice: 414.06 } as Readonly<Record<string, number>>,
      'RUB',
      RELEASE,
      'Ставки обработки и фурнитуры без цены по артикулу, пока изготовитель не задал свою (509): усреднённые цены проекта — отверстие 23,87 ₽, чашка 97,46 ₽, паз 142,64 ₽/м — средние цен цехов на 2026-10-27 (docs/product/prices/works-2026-10-27.json, FINDINGS 1833; прежде — 14, 79 и 104, числа формы прототипа); петля с планкой — BOYARD H316A02/5112, 181,33 ₽; направляющие — BOYARD DB4501 500 мм, 414,06 ₽/компл. (каталог цен владельца)',
    ),
    prototypeForm: constant(
      { holePrice: 14, cupPrice: 79, groovePrice: 104, hingePrice: 250, drawerKitPrice: 407, handlePrice: 300, rodPrice: 350 } as Readonly<Record<string, number>>,
      'RUB',
      prototype('r1.html:3579 форма «Тарифы производства и фурнитуры»: отверстие 14, чашка 79, паз 104 ₽/м, петля 250, BOYARD DB4501 407 ₽/компл., ручка 300, штанга 350', ARTICLE),
      'Значения формы прототипа — не цены: ставка формы проекта, равная им, — не ставка изготовителя, строка берёт цену каталога или карты (509)',
    ),
    edgeRates: constant(
      [
        { profileCode: 'PVC_ABS_0_4', panelThicknessMin: 10, panelServiceCategory: 'STANDARD', pricePerM: 114.77 },
        { profileCode: 'PVC_ABS_0_4', panelThicknessMin: 18, panelServiceCategory: 'STANDARD', pricePerM: 131.72 },
        { profileCode: 'PVC_ABS_0_8_1_0', panelThicknessMin: 10, panelServiceCategory: 'STANDARD', pricePerM: 126.1 },
        { profileCode: 'PVC_ABS_0_8_1_0', panelThicknessMin: 18, panelServiceCategory: 'STANDARD', pricePerM: 142.92 },
        { profileCode: 'PVC_ABS_2_0', panelThicknessMin: 10, panelServiceCategory: 'STANDARD', pricePerM: 140.17 },
        { profileCode: 'PVC_ABS_2_0', panelThicknessMin: 18, panelServiceCategory: 'STANDARD', pricePerM: 158 },
        { profileCode: 'PVC_ABS_2_0', panelThicknessMin: 26.001, panelServiceCategory: 'STANDARD', pricePerM: 218.44 },
        { profileCode: 'PVC_ABS_2_0', panelThicknessMin: 10, panelServiceCategory: 'SPECIAL_SURFACE', pricePerM: 227.55 },
      ] as readonly EdgeRate[],
      'RUB/m',
      RELEASE,
      'Кромление с кромкой в цвет, ₽ за метр, по классам прайса кромления прототипа (профиль кромки, толщина плиты от, поверхность) — усреднённые цены проекта: средние цен 4–6 цехов на 2026-10-27 (docs/product/prices/works-2026-10-27.json, FINDINGS 1836; прежде — прайс ТЕХНОПЛИТ на 2026-05-25, 74–160 ₽/м, который остаётся в ядре для сверки с прототипом)',
    ),
    priceStepRub: constant(10, 'RUB', decision('MOD-DEC-346'), 'Найденная и условная цена фурнитуры — ориентир: округляется вверх до целых 10 ₽; цену, заданную владельцем или изготовителем, не округляем (348)'),
    roundLine: constant(true, 'flag', decision('MOD-DEC-538'), 'Округлять строку сметы, а не цену одной штуки'),
  },
} as const satisfies PolicyModule;

/** A class of the edge banding of the card: a row of the price list of the prototype by its profile, its least board thickness and its surface. */
export interface EdgeRate {
  profileCode: string;
  panelThicknessMin: number;
  panelServiceCategory: string;
  pricePerM: number;
}

/** The rate of the card for a row of the price list of the edge banding of the prototype (FINDINGS 1836); null — no such class. */
export function edgeRateOf(row: { profileCode: string; panelThicknessMin: number; panelServiceCategory: string }): number | null {
  return wardrobePrice.constants.edgeRates.value.find((r) => r.profileCode === row.profileCode && r.panelThicknessMin === row.panelThicknessMin && r.panelServiceCategory === row.panelServiceCategory)?.pricePerM ?? null;
}
