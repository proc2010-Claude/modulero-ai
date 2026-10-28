// Policy of the price of the kitchen (task K5, MOD-DEC-436): the rate card a row of the cost takes when the maker's file
// of rates has no rate for it, as the swing wardrobe has it (W11, wardrobe-price.ts). The shared numbers — the board,
// the saw, the delivery, the confirmat, the Rastex, the percents of MOD-DEC-402 and the step of 346 — are the card of
// the wardrobe; the prices of the hardware by article are the records of the hardware catalogue (MOD-DEC-536, FINDINGS
// 994; until then the card the kitchen and the wardrobe shared, 509); this card holds what the kitchen has and the
// others do not. Every rate says where it comes from
// (FINDINGS 620–629):
//   • found: the price of the exact article in a shop or in the owner's catalogue of prices (MOD-DEC-264);
//   • conditional, «Цена условная»: the rate the prototype's wardrobe has for the same work (its project's rates) or
//     the shop's price of a like article (MOD-DEC-264: no price found — the executor gives one by analogues).
// The kitchen/price.ts card rounds a found or conditional row of hardware up to whole 10 ₽ (MOD-DEC-346); an article
// without a rate stays without a price, «Цена не определена» (MOD-DEC-157, 247). The editor lists every conditional
// rate under the bell until the owner or the maker sets it.
// Version 8 — the prices of the release (MOD-DEC-569, FINDINGS 1210): the HDF, the hole, the cup, the groove, the
// worktop and the glass are the averaged prices of the project (docs/product/PRICE_GAPS.md), not conditional ones.
// Version 9 — the groove by the metre of its length, as the wardrobe prices its grooves (MOD-DEC-569, FINDINGS 1600).
// Version 10 — a sheet of the board by the decor of the shared catalogue of its material code, else at the averaged
// price of a sheet of the project, as the wardrobe (MOD-DEC-569, FINDINGS 1604): not conditional.
// Version 11 — a sheet of HDF of the back by the board of the release in the material catalogue; the fronts of ЛМДФ by
// whole sheets of the cutting plan, a sheet by the price of its variant, a format its decor has not by the rate of ЛМДФ
// times the area (MOD-DEC-569, FINDINGS 1606, 1607).
// Version 12 — the rate of HDF of the back: the mean of the prices of the sheets of HDF 3 mm at the dealers (FINDINGS 1831).
// Version 13 — the rates of the hole, the cup and the groove: the means of the prices of the workshops (FINDINGS 1833).
import { constant, decision, prototype, type PolicyModule } from './types.js';

/** A rate of the card for a key of the rows of the cost: ₽ per the unit of the row. */
export interface KitchenCardEntry {
  rate: number;
  /** true — the price of the exact article (found, MOD-DEC-264) or an averaged price of the project (569); false — a conditional price by an analogue. */
  found: boolean;
  /** An averaged price of the project (MOD-DEC-569): the row says it is the project's rate (DECISION), not a catalogue's. */
  project?: true;
  /** What the price is: the shop and its article, or the analogue. */
  basis: string;
}

/** Rondo (Perm), the shop W9.3 read (docs/project/SOURCES.md): the catalogue «Фурнитура» and «Столешницы», 2026-10-23. */
const RONDO = 'Рондо (rondo-perm.ru), 23.10.2026';
const RELEASE = decision('MOD-DEC-569');

const CARD = 'FINDINGS 620';
const DATE = '2026-10-23';
const WARDROBE_RATES = 'reference/wardrobe-input: ставки проекта шкафа';

export const kitchenPrice = {
  id: 'kitchen-price',
  version: '13',
  constants: {
    date: constant(DATE, 'date', prototype('дата карты ставок кухни: цены магазина прочитаны 23.10.2026', CARD), 'Дата ставок карты в смете'),
    roundLine: constant(true, 'flag', decision('MOD-DEC-538'), 'Округлять строку сметы фурнитуры, а не цену одной штуки'),
    coveredByAssembly: constant(
      ['work:assembly:', 'work:installation:', 'work:design'] as readonly string[],
      'rateKey',
      decision('MOD-DEC-436'),
      'Работы, которые покрывает сборка 14 % от C (402): сборка и монтаж модулей; проектирование — работа конструктора (Д, вопрос владельцу). Ставки мебельщика за них не читаются, как поля сборки шкафа (FINDINGS 520)',
    ),
    worktopWorks: constant(
      [
        'operation:Вырез столешницы',
        'operation:cutout-edge-sealing:',
        'operation:cut-edge-sealant',
        'hardware:PROJECT_SPECIFICATION:waterproof compatible worktop joint sealing service',
        'operation:service:D3 compatible woodworking adhesive service',
      ] as readonly string[],
      'rateKey',
      decision('MOD-DEC-437'),
      'Работы по столешнице, которые входят в сборку 14 % от C: вырез под мойку и варочную панель, герметизация края выреза и стыка столешниц, склейка клеем D3 (FINDINGS 626)',
    ),
    applianceKits: constant(
      true,
      'flag',
      decision('MOD-DEC-437'),
      'Комплект техники (рециркуляция вытяжки, монтажный набор прибора) — часть техники: цена кухни его не считает, как и саму технику (FINDINGS 626)',
    ),
    boardThicknesses: constant([16, 18, 19] as readonly number[], 'mm', prototype('толщины плит корпуса и фасадов кухни K1: 16, 18 и 19 мм', CARD), 'Толщины ЛДСП, которые карта цены считает плитой корпуса и фасадов'),
    backMaterial: constant('BACK_MATERIAL_UNKNOWN', 'code', prototype('r1.html: материал вставного задника кухни без декора (BACK_MATERIAL_UNKNOWN, 3 мм)', CARD), 'Код материала задней стенки кухни — ХДФ'),
    hdfRateRub: constant(217.92, 'RUB/m²', RELEASE, 'ХДФ задней стенки — усреднённая цена проекта: средняя цен листов ХДФ 3 мм у дилеров на 2026-10-27 за м² (docs/product/prices/boards-2026-10-27.json, FINDINGS 1830; прежде — 333 ₽/м², ставка ХДФ проекта шкафа прототипа, ' + WARDROBE_RATES + ' hdfPrice)'),
    holeRub: constant(23.87, 'RUB', RELEASE, 'Отверстие — усреднённая цена проекта, как у шкафа: средняя цен цехов на 2026-10-27 (docs/product/prices/works-2026-10-27.json, FINDINGS 1833; прежде — 14 ₽)'),
    cupRub: constant(97.46, 'RUB', RELEASE, 'Чашка петли — усреднённая цена проекта, как у шкафа: средняя цен цехов на 2026-10-27 (docs/product/prices/works-2026-10-27.json, FINDINGS 1833; прежде — 79 ₽)'),
    grooveRubPerM: constant(142.64, 'RUB/m', RELEASE, 'Паз — усреднённая цена проекта за метр длины паза, как у шкафа: средняя цен цехов на 2026-10-27 (docs/product/prices/works-2026-10-27.json, FINDINGS 1833; прежде — 104 ₽/м; до версии 9 — 104 ₽ за паз, FINDINGS 1208, 1600)'),
    worktop: constant(
      {
        rate: 6021.24,
        found: true,
        project: true,
        basis: `усреднённая цена проекта (MOD-DEC-569): среднее 11 цен столешниц 3000 × 600 × 38 мм — 10 строк furnimax.ru каталога цен владельца (PRICES.csv, 23.10.2026; 8734,44–19 511,40 ₽) и ${RONDO} 5740 ₽; 10 838,23 ₽ за 1,8 м²`,
      } as KitchenCardEntry,
      'RUB/m²',
      RELEASE,
      'Столешница 38 мм без декора — по площади заготовки',
    ),
    glass: constant(
      { rate: 4000, found: true, project: true, basis: 'усреднённая цена проекта (MOD-DEC-569): ориентир по рынку, источника нет — у Рондо стекло «под заказ», без цены' } as KitchenCardEntry | null,
      'RUB/m²',
      RELEASE,
      'Стекло 6 мм за м²',
    ),
  },
} as const satisfies PolicyModule;
