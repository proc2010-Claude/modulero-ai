// Policy of the price of "other furniture" (the rule sets r4 and r5, MOD-DEC-510): the rates a row of the price takes
// when the maker leaves the rate of the form empty (MOD-DEC-569, docs/product/PRICE_GAPS.md, section 3.1). The sheets,
// the saw, the drilling and the grooves are the wardrobe's card (wardrobe-price.ts); a row of hardware with an article
// the catalogue prices — the hinge, the runner of its length, the handle — takes the price of the article (MOD-DEC-536);
// the edge banding takes the price list of ТЕХНОПЛИТ, as the kitchen (wardrobe/edges.ts); the assembly is 14 % of the
// cost C, as the wardrobe and the kitchen (402). The rates below are the averaged prices of the project for the rows
// that are a kit of the form, not one article. r3, the prototype's, keeps its rates of the form only (FINDINGS 230).
// Recommendation (Д) for later: price "other furniture" by the catalogue, as the wardrobe (MOD-DEC-341, 552).
// Version 2 (MOD-DEC-569, FINDINGS 1605): a sheet of the board of a decor outside the material catalogue takes the
// averaged price of a sheet of the project, as the wardrobe (wardrobe/price.ts, boardSheetPrice): not temporary.
// Version 3 (MOD-DEC-569, FINDINGS 1606, 1607): a sheet of HDF by the board of the release in the material catalogue, a
// sheet of ЛМДФ of the fronts by the price of its variant, a format its decor has not by the rate of ЛМДФ times the area.
import { constant, decision, type PolicyModule } from './types.js';

const RELEASE = decision('MOD-DEC-569');

export const homePrice = {
  id: 'home-price',
  version: '3',
  constants: {
    supportRub: constant(42.44, 'RUB/shelf', RELEASE, 'Полкодержатели, ₽ за полку: 4 × 10,61 ₽ — полкодержатель FLIPPER 2574 21 (МДМ), усреднённая цена проекта'),
    joinRub: constant(3.46, 'RUB/joint', RELEASE, 'Соединение корпуса, ₽ за стык: 2 узла по 1,73 ₽ — конфирмат MB.1501.7X50 каталога цен владельца, усреднённая цена проекта'),
    join16Rub: constant(3.46, 'RUB/joint', RELEASE, 'Соединение коробки ящика, ₽ за стык: как соединение корпуса'),
    frontFixRub: constant(14.6, 'RUB/kit', RELEASE, 'Крепление фасада ящика, ₽ за комплект: 4 × 3,65 ₽ — аналог Рондо «Евровинт VARIANTA», усреднённая цена проекта'),
    restraintRub: constant(555.56, 'RUB/kit', RELEASE, 'Защита от опрокидывания, ₽ за комплект: Italiana SH7 370,37 ₽ и SH-планка 185,19 ₽ каталога цен владельца'),
    glideRub: constant(120, 'RUB/kit', RELEASE, 'Накладки, ₽ за комплект: как накладки Hettich KIT150, ориентир по рынку'),
    hingeRub: constant(181.33, 'RUB/kit', RELEASE, 'Петля с планкой, ₽ за комплект, если у петли проекта нет цены артикула: BOYARD H316A02/5112, каталог цен владельца'),
  },
} satisfies PolicyModule;
