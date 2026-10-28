// Policy of the price of the sliding doors (task W9, step W9.3): the rates the kit of the doors is priced by. The
// solver of wardrobe/sliding-doors.ts prices every line of its kit from here (MOD-DEC-054), the quote of
// wardrobe/price.ts adds the priced lines to the cost C, before the services (MOD-DEC-402, FINDINGS 516).
//
// Three kinds of rate, in this order of trust:
//   • the snapshot of the prototype of 21.09.2026 (SW_PRICES r1.html:59116): ЭКО and Slim Line by the role of the
//     line; its rate applies to the exact article it was observed for — Standard reuses it where its article is the
//     same (AS0713.VP540, FINDINGS 511), the prototype's own rule «reuse only an exact applicable existing rate»;
//   • a price found for the exact article (MOD-DEC-264), rounded up to whole 10 ₽ (MOD-DEC-346): the maker's site
//     aristo.expert, the shop Rondo where the site has no card (FINDINGS 680);
//   • a conditional price by an analogue (MOD-DEC-264: no price found — the executor gives an approximate one by
//     analogues, marked «Цена условная»), rounded up to whole 10 ₽ the same way (Д). The quote marks the line, the
//     graph says it in the problems (the owner's rule of 2026-10-22: a missing datum never removes a function).
// An article with no rate stays without a price: «Цена не определена», never a zero (MOD-DEC-157, 247).
// The rates move into the hardware catalogue with the systems of the doors (CAT, MOD-DEC-352).
import { catalogSource } from '../../catalog/hardware/types.js';
import { constant, decision, prototype, type PolicyModule } from './types.js';
import type { SlidingRole } from './sliding-doors.js';

/** A rate of one article: ₽ per unit, the observation it comes from and its date. */
export interface SlidingRate {
  article: string;
  /** ₽ per `unit`. */
  rate: number;
  /** `m` (net metres of a profile), `kit`, `piece`, `m2` (area of the inserts). */
  unit: string;
  /** Id of the observation (prototype) or of the price record (W9.3). */
  observation: string;
  date: string;
  /** The price as found or as the analogue gives it, before rounding (MOD-DEC-346, 348). */
  sourceRate?: number;
  /** What the price is taken from. */
  basis?: string;
}

const PRICES = 'FINDINGS 510';
const SNAPSHOT_DATE = '2026-09-21';
const W93_DATE = '2026-10-23';
const line = (article: string, observation: string, rate: number, unit: string): SlidingRate => ({ article, rate, unit, observation, date: SNAPSHOT_DATE });

/** Rondo (Perm), the shop the snapshot of the prototype matches (AV0160.VS000 266.50 ₽, ECO guides within 2 %). */
const RONDO = 'Рондо, Пермь (rondo-perm.ru), каталог «Профиль для шкафов-купе» — «Аристо», «Фурнитура для всех дверей-купе», 2026-10-23';
/** aristo.expert, the maker's site the owner named (docs/project/SOURCES.md): price per piece, a profile per length 5400 mm. */
const ARISTO = 'aristo.expert, системы Стандарт, ЭКО, Slim Line, NOVA и «Фурнитура», 2026-10-23';
const ARISTO_LENGTH_M = 5.4;

/** Rounding of a found or conditional price: up to whole 10 ₽ (MOD-DEC-346). */
export const roundUpToTen = (rub: number): number => Math.ceil(rub / 10 - 1e-9) * 10;

const rub = (n: number) => n.toFixed(2).replace('.', ',');
/**
 * A found price of aristo.expert (FINDINGS 680). `card` — the article of the site's card: the series and the variant
 * code of the engine's article, the finish Серебро матовое where the price depends on it (the finish of the prototype's
 * kit, AE0488.VP540.SLMAN.CJ). A profile is sold by the length 5400 mm and priced per metre of it.
 */
function aristo(article: string, card: string, price: number, unit: 'm' | 'kit' | 'piece', name: string): SlidingRate {
  const sourceRate = unit === 'm' ? Math.round((price / ARISTO_LENGTH_M) * 100) / 100 : price;
  const per = unit === 'm' ? ` за хлыст 5,4 м (${rub(sourceRate)} ₽/м)` : unit === 'kit' ? ' за комплект' : ' за штуку';
  return { article, rate: roundUpToTen(sourceRate), sourceRate, unit, observation: `ARISTO-${article.split('.')[0]}`, date: W93_DATE, basis: `${ARISTO}: «${card} ${name}», ${rub(price)} ₽${per}` };
}

export const slidingPrice = {
  id: 'sliding-price',
  version: '5',
  constants: {
    snapshot: constant(
      {
        date: SNAPSHOT_DATE,
        systems: {
          eco: {
            vertical: line('AE0704.VP540', 'PO-ECO-001', 365.555556, 'm'),
            upper_frame: line('AE0688.VP540', 'PO-ECO-002', 247.962963, 'm'),
            lower_frame: line('AE0689.VP540', 'PO-ECO-003', 464.074074, 'm'),
            upper_track: line('AE0492.VP540', 'PO-ECO-004', 612.5, 'm'),
            lower_track: line('AE0488.VP540.SLMAN.CJ', 'PO-ECO-005', 282, 'm'),
            roller_kit: line('AE0160.VS000', 'PO-ECO-006', 127.43, 'kit'),
            stop: line('AS0101.VP000', 'PO-COMMON-002', 20, 'piece'),
            brush: line('AA0956.VM150', 'PO-COMMON-003', 20.64, 'm'),
            brush_clip: line('AA0040.VP000.IN0EP.CO', 'PO-COMMON-004', 17.63, 'piece'),
          },
          slim: {
            vertical: line('AV0991.VP540', 'PO-SLIM-001', 558.42037, 'm'),
            upper_frame: line('AV0588.VP540', 'PO-SLIM-002', 431.5, 'm'),
            lower_frame: line('AV0990.VP540', 'PO-SLIM-003', 768.735185, 'm'),
            upper_track: line('AS0713.VP540', 'PO-COMMON-001', 993.148148, 'm'),
            lower_track: line('AS0504.VP540', 'PO-SLIM-004', 445.37037, 'm'),
            // The retired V-type rollers (MOD-DEC-188): the kit of Slim Line is AV0160.AS000, this rate does not apply.
            roller_kit: line('AV0160.VS000', 'PO-SLIM-005', 266.5, 'kit'),
            stop: line('AS0101.VP000', 'PO-COMMON-002', 20, 'piece'),
            brush: line('AA0956.VM150', 'PO-COMMON-003', 20.64, 'm'),
            brush_clip: line('AA0040.VP000.IN0EP.CO', 'PO-COMMON-004', 17.63, 'piece'),
          },
        } as Readonly<Record<string, Partial<Record<SlidingRole, SlidingRate>>>>,
        // The insert of the reference material Lamarty Белый 10 P (ILLUSTRATIVE_REFERENCE of the prototype).
        filling: { ...line('LAMARTY-WHITE-10-P', 'PO-FILL-001', 710.581222, 'm2'), material: 'lamarty-white10-reference' },
      },
      '₽',
      prototype('r1.html:59116 SW_PRICES: расходные ставки снимка 21.09.2026 (ЭКО, Slim Line) и вставка Lamarty', PRICES),
      'Снимок ставок дверной системы прототипа: ставка — к точному артикулу, по которому она снята',
    ),
    foundRates: constant(
      {
        // The card is titled AS0160.VS000.ZN0EP.CO, its «Артикул» field says AS0160.AS000.ZN0EP.CO (FINDINGS 512).
        'AS0160.VS000': { article: 'AS0160.VS000', rate: 270, sourceRate: 266.5, unit: 'kit', observation: 'W93-FOUND-AS0160', date: W93_DATE, basis: RONDO + ': карточка 24373 «AS0160.VS000.ZN0EP.CO Комплект колес АРИСТОorigin С ассимметрия, 39мм», 266,50 ₽/к-т' },
        // Standard: the site has the vertical profile only as AS0731.VP540 (the engine's BP540, FINDINGS 676).
        'AS0731.BP540': aristo('AS0731.BP540', 'AS0731.VP540.SLMAN.CJ', 3659.96, 'm', 'Профиль верт. C 731, Серебро матовое'),
        'AS0720.VP540': aristo('AS0720.VP540', 'AS0720.VP540.SLMAN.CJ', 1768.09, 'm', 'Рамка верхняя 720, Серебро матовое'),
        'AS0721.VP540': aristo('AS0721.VP540', 'AS0721.VP540.SLMAN.CJ', 3532.73, 'm', 'Рамка нижняя 721, Серебро матовое'),
        'AS0690.VP540': aristo('AS0690.VP540', 'AS0690.VP540.SLMAN.CJ', 845.72, 'm', 'Направл. врезная однопол. нижняя, Серебро матовое'),
        // The upper stop: the site has AS0001.AP000 (the engine's VP000, FINDINGS 676).
        'AS0001.VP000': aristo('AS0001.VP000', 'AS0001.AP000.TR000.CY', 57.22, 'piece', 'Стопор верхний, CY'),
        'AS0053.VP000': aristo('AS0053.VP000', 'AS0053.VP000.SLM00.CY', 12.37, 'piece', 'Заглушка дверная, Серебро мат.'),
        // Slim Line: the kit of rollers of the doors (MOD-DEC-188) and the hidden upper guide (FINDINGS 677).
        'AV0160.AS000.ZN0EP.CO': aristo('AV0160.AS000.ZN0EP.CO', 'AV0160.AS000.ZN0EP.CO', 266.16, 'kit', 'Комплект роликов V, серый'),
        'AV0589.VP540': aristo('AV0589.VP540', 'AV0589.VP540.SLMAN.CJ', 4615.65, 'm', 'Рамка широкая Тонкая линия / SLIM, Серебро матовое'),
        'NA0166.VR000': aristo('NA0166.VR000', 'NA0166.VR000.ZN0EP.CO', 444.9, 'piece', 'Кронштейны для внутренней двери Нова / NOVA'),
        'NA0167.VR000': aristo('NA0167.VR000', 'NA0167.VR000.ZN0EP.CO', 444.9, 'piece', 'Кронштейны для внешней двери Нова / NOVA'),
        'NA0169.VR000': aristo('NA0169.VR000', 'NA0169.VR000.BK000.CO', 148.43, 'piece', 'Комплект роликов Нова / NOVA16, верхние'),
      } as Readonly<Record<string, SlidingRate>>,
      '₽',
      catalogSource({ doc: ARISTO, sha256: '', page: 'карточки товаров систем Стандарт, ЭКО, Slim Line, NOVA и «Фурнитура»' }),
      'Найденная цена точного артикула (серия и код исполнения; отделка — серебро матовое), округлена вверх до 10 ₽ (MOD-DEC-264, 346)',
    ),
    conditionalRates: constant(
      // Every conditional rate of W9.3 has the price of the maker's site now (FINDINGS 680); the rule stays for an
      // article the site does not sell.
      {} as Readonly<Record<string, SlidingRate>>,
      '₽',
      decision('MOD-DEC-264'),
      'Условная цена по аналогу (цены точного артикула не найдено), округлена вверх до 10 ₽ (Д, как 346); в смете — «цена условная»',
    ),
    insertRate: constant(
      { article: 'LDSP-10', rate: 822.33, sourceRate: 822.33, unit: 'm2', observation: 'W93-LDSP10', date: '2026-10-27', basis: 'усреднённая цена проекта (MOD-DEC-569): средняя ставка ЛДСП Lamarty 10 мм у дилеров на 2026-10-27, 822,33 ₽/м², как ставки листов — без округления до 10 ₽ (docs/product/prices/boards-2026-10-27.json, FINDINGS 1831; прежде — вставка Lamarty Белый 10 P снимка прототипа, 710,58 ₽/м², вверх до 10 ₽ — 720)' } as SlidingRate,
      '₽/m2',
      decision('MOD-DEC-569'),
      'Цена вставки ЛДСП 10 мм по площади, если её материал не контрольный Lamarty — усреднённая цена проекта (до версии 4 — условная, 264)',
    ),
    profileKerfMm: constant(
      3,
      'mm',
      prototype('r1.html:79812 KHR: рейка Hettich 9007651 из хлыста 3000 мм — от длинных отрезков к коротким, каждый отрезок + пропил 3 мм', 'FINDINGS 861'),
      'Пропил на каждый отрезок профиля купе при раскрое хлыста (MOD-DEC-520): правило прототипа для металлического хлыста',
    ),
  },
} as const satisfies PolicyModule;

