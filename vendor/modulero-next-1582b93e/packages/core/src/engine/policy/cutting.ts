// Rules of the cutting plan of the sheets (task CUT-1, MOD-DEC-430): the exact plan of the blanks S of the graph on
// the sheets of each board, for the workshop. The plan is an output of the graph, not a rule of the product: the
// module is not in POLICY_MODULES, its version is stamped on the plan and its sheets (as the drawings, drawing.ts).
//
// The kerf and the trim of the sheet edges by default are the owner's (MOD-DEC-445): 4.4 mm and 10 mm; the user may
// give the ones of the workshop. The format of the sheet by default is not approved (430 (Д)): the board of the
// catalogue brings its own (`Part.material.sheetFormatMm`, the decor variant), else the user gives it — null here,
// with the reason. The search settings below are not numbers of the product: they say how many orders are tried.
import { constant, decision, standard, unknownSource, type PolicyModule } from './types.js';

const OPEN = 'MOD-DEC-430 (Д): формат листа по умолчанию не утверждён — из каталога декора или вводит пользователь';

export const cuttingPlan = {
  id: 'cutting-plan',
  version: '2',
  constants: {
    kerfMm: constant(4.4, 'mm', decision('MOD-DEC-445'), 'Ширина пропила по умолчанию; пользователь задаёт пропил своего распиловщика'),
    trimMm: constant(10, 'mm', decision('MOD-DEC-445'), 'Обрезка каждой кромки листа (от края до полезного формата) по умолчанию; пользователь может задать свою'),
    sheetMm: constant(null, 'mm', unknownSource(OPEN), 'Формат листа, если у плиты нет формата в каталоге: числа по умолчанию нет'),
    respectGrain: constant(true, 'flag', standard('Handbook r8 INV-A03-01: запрет поворота при направленном декоре'), 'Деталь с направлением текстуры не поворачивается на листе, пока пользователь не снял учёт текстуры для материала'),
    sheetGrainAxis: constant('LENGTH', 'axis', standard('Handbook r8 INV-A03-01; формат листа «длина вдоль рисунка × ширина», как INV-G08'), 'Рисунок листа идёт вдоль первого размера формата'),
  },
} as const satisfies PolicyModule;

/** How the search tries the blanks: the orders, the choice of the free piece and the choice of the first cut. */
export const CUT_SEARCH = Object.freeze({
  orders: ['AREA', 'LONG_SIDE', 'LENGTH', 'WIDTH', 'PERIMETER'] as const,
  fits: ['BEST_AREA', 'BEST_SHORT_SIDE', 'BEST_LONG_SIDE'] as const,
  splits: ['SHORTER_LEFTOVER', 'LONGER_LEFTOVER', 'MIN_AREA', 'MAX_AREA', 'ALONG_LENGTH', 'ALONG_WIDTH'] as const,
});
