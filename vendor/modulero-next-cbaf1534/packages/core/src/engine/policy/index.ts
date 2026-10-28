// Policy of the unified engine (ENGINE.md §4): the one place for numbers and rules. E1 creates the skeleton and
// the constants the invariant library needs; the product rules arrive with tasks W1–W11, K3–K5 and H1.
// A constant without a decision keeps the prototype's value with a FINDINGS item (CLAUDE.md: a number is not invented).
import { constant, decision, prototype, standard, unknownSource, type PolicyModule } from './types.js';
import { sectionGrid } from './front-grid.js';
import { carcass } from './carcass.js';
import { system32 } from './system32.js';

export * from './types.js';
export * from './front-grid.js';
export * from './carcass.js';
export * from './system32.js';
// Wardrobe policy of task W1: edge model and orientation (04), validators (05), depth (48), optional parts (50), materials (52/54).
export * from './project-state.js';
export * from './edge-model.js';
export * from './edge-manual.js';
export * from './validators.js';
export * from './depth.js';
export * from './optional-parts.js';
export * from './materials.js';
// The materials of the facades of the first release (MOD-DEC-573): «материал → исполнение → цвет».
export * from './facade-materials.js';
// Levels of the hardware and their manufacturers by default (MOD-DEC-413, 466): the warning of a substitution.
export * from './hardware-tier.js';
// Hinge selection by the manufacturer tables (task HINGE-SEL, input of W4 and W7).
export * from './hinge-selection.js';
// Shelf support selection by the manufacturer catalogues (task «Подбор полкодержателей», input of W6 and K3).
export * from './shelf-support-selection.js';
// Drawer slide selection by the manufacturer catalogues (task «Подбор направляющих ящиков», input of W7 and K3).
export * from './drawer-slide-selection.js';
// Assembled drawers of the catalogue: the series of a level and the kit of a drawer (MOD-DEC-544, R2-007).
export * from './drawer-system-selection.js';
// Wardrobe carcass on the graph, task W3: input limits, confirmat stations and the receiving hole.
export * from './wardrobe-carcass.js';
// Stations of a joint by the width of the joined part (MOD-DEC-364): every product of the engine.
export * from './joint-stations.js';
// Wardrobe facades and hinges on the graph, task W4: hinge stations, the plate clearance, the door mass, inset facades.
export * from './wardrobe-facades.js';
export * from './wardrobe-fill.js';
// Drawers of the swing wardrobe and FE-04, task W7: the box of the runner, the spacer, the hinge and drawer conflict.
export * from './wardrobe-drawers.js';
export * from './fe04.js';
// Sliding wardrobe on the graph, task W9: the depth of the door system in front of the partitions and shelves.
export * from './wardrobe-sliding.js';
// Price of the swing wardrobe on the graph, task W5: the prototype's numbers of the demo price (MOD-DEC-285).
export * from './wardrobe-price.js';
// Whole purchase units of the estimate (MOD-DEC-511): the note on the leftovers at their lines.
export * from './purchase-units.js';
// Wardrobe fasteners r7 on the graph, task W8: accepted profiles, the staggered drilling at a partition (343).
export * from './wardrobe-fasteners.js';
// Sliding doors, task W9.2: the tables of the ARISTO systems, the leaf formulas, the mass and the kit.
export * from './sliding-doors.js';
// Sliding doors, task W9.3: the rates of the kit — the snapshot of the prototype, found and conditional prices.
export * from './sliding-price.js';
// Price of "other furniture" r4 and r5 (MOD-DEC-569): the rates of the form the maker leaves empty.
export * from './home-price.js';
export * from './kitchen.js';
// Lifts of a front opening upwards, task LIFT: the row by INV-D18-01, the working angle of 194 (INV-D18-02).
export * from './lift-selection.js';
// Fittings of the wardrobe, task FIT: the rod and its holders, the legs, the handles (MOD-DEC-480).
export * from './fittings-selection.js';
// The back of HDF in parts on the partitions and fixed shelves (MOD-DEC-701): one function for every product.
export * from './back-split.js';
// Drawings of the graph, task W10: an output, not a rule of the product — not in POLICY_MODULES (drawing.ts).
export * from './drawing.js';
// Production package, task PROD-1: the status of the version and the steps of the assembly scheme — an output too.
export * from './production-package.js';
export * from './cad-export.js';
export * from './bazis-export.js';
// The check of a BAZIS project (PROD-4): a check of an input, not a rule of the product — not in POLICY_MODULES either.
export * from './bazis-import.js';
// Cutting plan of the sheets, task CUT-1 (MOD-DEC-430): an output too; the saw by default is MOD-DEC-445.
export * from './cutting.js';
import { edgeManualEdit, edgeModel } from './edge-model.js';
import { depth } from './depth.js';
import { backSplit } from './back-split.js';
import { optionalParts } from './optional-parts.js';
import { materials } from './materials.js';
import { hingeSelection } from './hinge-selection.js';
import { shelfSupportSelection } from './shelf-support-selection.js';
import { drawerSlideSelection } from './drawer-slide-selection.js';
import { drawerSystemSelection } from './drawer-system-selection.js';
import { wardrobeCarcass } from './wardrobe-carcass.js';
import { jointStations } from './joint-stations.js';
import { wardrobeFacades } from './wardrobe-facades.js';
import { wardrobeFill } from './wardrobe-fill.js';
import { wardrobeDrawers } from './wardrobe-drawers.js';
import { fe04 } from './fe04.js';
import { wardrobeSliding } from './wardrobe-sliding.js';
import { wardrobePrice } from './wardrobe-price.js';
import { wardrobeFasteners } from './wardrobe-fasteners.js';
import { slidingDoors } from './sliding-doors.js';
import { slidingPrice } from './sliding-price.js';
import { homePrice } from './home-price.js';
import { kitchen } from './kitchen.js';
import { liftSelection } from './lift-selection.js';
import { fittingsSelection } from './fittings-selection.js';
// Policy of "other furniture" (task H1): the common numbers and the rule sets r3 and r4.
export * from './home.js';
import { homeCommon, homeRulesR3, homeRulesR4, homeSharedShelf, homeShelfSupport } from './home.js';

/** Version of the rule set written into every graph (MOD-DEC-054, §24.4). */
export const RULE_SET_VERSION = '2026.1-e1';

/**
 * Tolerance profiles by context (Handbook HB 441, D-08): 191 is only the threshold of comparing computed
 * values with each other; 275 is only the check of drilling against the manufacturer's drawing. A geometric
 * clearance (between parts, of mechanisms) needs its own source; without one it is UNKNOWN.
 */
export const tolerance = {
  id: 'tolerance',
  version: '3',
  constants: {
    compare: constant(0.1, 'mm', decision('MOD-DEC-191'), 'Сравнение вычисленных величин: отклонение до 0,1 мм включительно не дефект; не общий epsilon'),
    holePosition: constant(0.2, 'mm', decision('MOD-DEC-275'), 'Положение отверстия против чертежа производителя ±0,2 мм; не общий допуск'),
    holeDiameter: constant(0.1, 'mm', decision('MOD-DEC-327'), 'Диаметр отверстия против чертежа производителя совпадает при отклонении не больше 0,1 мм (порог 191 внутри 275)'),
    holeDepthBelow: constant(-0.6, 'mm', decision('MOD-DEC-327'), 'Глубина без пределов производителя: не мельче чертежа на 0,6 мм (275 давало −0,5)'),
    holeDepthAbove: constant(0.1, 'mm', decision('MOD-DEC-327'), 'Глубина без пределов производителя: не глубже чертежа на 0,1 мм (275 давало 0)'),
    geometricClearance: constant(null, 'mm', unknownSource('HB 441: универсального геометрического допуска нет'), 'Зазор между деталями и механизмами: источник не найден'),
  },
} as const satisfies PolicyModule;

/** A hole as drilled or as the manufacturer draws it: the place on the face, the diameter, the depth. */
export interface DrawnHole {
  acrossMm: number;
  alongMm: number;
  diameterMm: number | null;
  depthMm: number | null;
}
export interface DrawingCheck {
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  failed: ('POSITION' | 'DIAMETER' | 'DEPTH')[];
  unknown: ('DIAMETER' | 'DEPTH')[];
}

/**
 * MOD-DEC-275, 327: a hole agrees with the manufacturer drawing when its place is within ±0,2 mm on each axis, its
 * diameter within 0,1 mm and its depth within the manufacturer's limits — or, without them, from −0,6 to +0,1 mm of
 * the drawn depth. Only for this check: computed values are compared by 191, a clearance has no tolerance (HB 441).
 * A drawing without a diameter or a depth leaves it UNKNOWN, never PASS.
 */
export function checkAgainstDrawing(hole: DrawnHole, drawn: DrawnHole, depthLimitsMm?: { belowMm: number; aboveMm: number } | null): DrawingCheck {
  // The deviation in micrometres: 35,1 − 35 is 0,100000000000001 in floating point, a boundary is inside.
  const c = tolerance.constants,
    off = (a: number, b: number) => Math.round((a - b) * 1e6) / 1e6,
    failed: DrawingCheck['failed'] = [],
    unknown: DrawingCheck['unknown'] = [];
  if (Math.abs(off(hole.acrossMm, drawn.acrossMm)) > c.holePosition.value || Math.abs(off(hole.alongMm, drawn.alongMm)) > c.holePosition.value) failed.push('POSITION');
  if (hole.diameterMm === null || drawn.diameterMm === null) unknown.push('DIAMETER');
  else if (Math.abs(off(hole.diameterMm, drawn.diameterMm)) > c.holeDiameter.value) failed.push('DIAMETER');
  if (drawn.depthMm === null || hole.depthMm === null) unknown.push('DEPTH');
  else {
    const below = depthLimitsMm ? depthLimitsMm.belowMm : c.holeDepthBelow.value,
      above = depthLimitsMm ? depthLimitsMm.aboveMm : c.holeDepthAbove.value,
      dev = off(hole.depthMm, drawn.depthMm);
    if (dev < below || dev > above) failed.push('DEPTH');
  }
  return { status: failed.length ? 'FAIL' : unknown.length ? 'UNKNOWN' : 'PASS', failed, unknown };
}

/**
 * FrontGrid gaps. Межфасадный зазор 3 (124, 185); horizontal outer offset 1,5 (124). Top and bottom offsets have
 * no decision: the prototype's 2 mm (V16_STANDARD_PROFILE), the bottom one over the base — door bottom 72 mm at a
 * 70 mm plinth (owner decision 2026-10-20, FINDINGS 55); half the gap is not carried to the vertical (HB 961).
 * Depth gap 2 mm only for standard overlay swing doors (162, HB 965).
 */
export const frontGrid = {
  id: 'front-grid',
  version: '2',
  constants: {
    seam: constant(3, 'mm', decision('MOD-DEC-185'), 'Межфасадный зазор по умолчанию; пользователь может изменить'),
    outerOffsetHorizontal: constant(1.5, 'mm', decision('MOD-DEC-124'), 'Внешний отступ фасада от вертикальных границ ячейки'),
    outerOffsetTop: constant(2, 'mm', prototype('r1 V16_STANDARD_PROFILE.topInset', 'FINDINGS 55'), 'Верхний внешний отступ фасада; решения нет'),
    bottomOffset: constant(2, 'mm', prototype('r1 V16_STANDARD_PROFILE.bottomInset', 'FINDINGS 55'), 'Нижний дополнительный отступ над базой (низ двери 72 мм при цоколе 70); решения нет'),
    depthGap: constant(2, 'mm', decision('MOD-DEC-162'), 'Зазор фасад — корпус по глубине, только накладные распашные'),
  },
} as const satisfies PolicyModule;

/** Edge banding facts the checks need. The full edge map is task W1 (files 03, 04). */
export const edges = {
  id: 'edges',
  version: '1',
  constants: {
    floorMinThickness: constant(0.4, 'mm', standard('ES v1.2 FE-EDGE-002'), 'Торец на полу защищают кромкой не тоньше 0,4 мм; тоньше или без кромки — допустимо, с предупреждением'),
    floorBelowMinLevel: constant('WARNING', 'level', decision('MOD-DEC-325'), '«Без кромки» на торце на полу не запрещено: предупреждение в «колокольчике», не ошибка'),
  },
} as const satisfies PolicyModule;

/** Drilling: marking layer (276) and the web left between opposed blind holes. */
export const drilling = {
  id: 'drilling',
  version: '1',
  constants: {
    markingMaxDepth: constant(1, 'mm', decision('MOD-DEC-276'), 'Отверстия библиотек фурнитуры глубиной ≤ 1 мм — слой разметки'),
    minWeb: constant(
      null,
      'mm',
      unknownSource('HB 271: остаток материала под выборкой — источник не найден; шаг разноса 167 задан 343, перемычка — нет'),
      'Перемычка между встречными глухими отверстиями; пока неизвестна — INV-H03 отвечает UNKNOWN (FINDINGS 52)',
    ),
  },
} as const satisfies PolicyModule;

/** Performance budgets by the number of manufactured parts N (MOD-DEC-244). */
export const performance = {
  id: 'performance',
  version: '1',
  constants: {
    tBase: constant(300, 'ms', decision('MOD-DEC-244'), 'T_ms(N) = min(1500, 300 + 1,5·max(0, N − 100))'),
    tSlope: constant(1.5, 'ms', decision('MOD-DEC-244'), 'наклон T_ms'),
    tMax: constant(1500, 'ms', decision('MOD-DEC-244'), 'предел T_ms'),
    bBase: constant(200, 'ms', decision('MOD-DEC-244'), 'B_ms(N) = min(350, 200 + 0,5·max(0, N − 100))'),
    bSlope: constant(0.5, 'ms', decision('MOD-DEC-244'), 'наклон B_ms'),
    bMax: constant(350, 'ms', decision('MOD-DEC-244'), 'предел B_ms'),
    partsFree: constant(100, 'parts', decision('MOD-DEC-244'), 'N без надбавки'),
    previewP95: constant(50, 'ms', decision('MOD-DEC-244'), 'предпросмотр p95 ≤ 50 мс'),
  },
} as const satisfies PolicyModule;

/** Hinge count rule (MOD-DEC-190): the chart Hmax(n), Mmax(n) of the hinge comes from the catalogue (Q3). */
export const hinges = {
  id: 'hinges',
  version: '1',
  constants: {
    oneLimitOver: constant(0.05, 'ratio', decision('MOD-DEC-190'), 'Один предел можно превысить не более чем на 5 % (ровно 5 % — можно)'),
    otherLimitUnder: constant(0.95, 'ratio', decision('MOD-DEC-190'), 'Другой параметр строго меньше 95 % своего предела'),
  },
} as const satisfies PolicyModule;

export const POLICY_MODULES: readonly PolicyModule[] = [tolerance, frontGrid, edges, drilling, performance, hinges, sectionGrid, carcass, system32, edgeModel, edgeManualEdit, depth, optionalParts, materials, hingeSelection, shelfSupportSelection, drawerSlideSelection, drawerSystemSelection, homeCommon, homeRulesR3, homeRulesR4, homeSharedShelf, homeShelfSupport, wardrobeCarcass, jointStations, wardrobeFacades, wardrobeFill, wardrobeDrawers, fe04, wardrobeSliding, wardrobePrice, wardrobeFasteners, kitchen, slidingDoors, slidingPrice, homePrice, liftSelection, fittingsSelection, backSplit];

export const budgetMs = (n: number) => {
  const c = performance.constants,
    over = Math.max(0, n - c.partsFree.value);
  return {
    t: Math.min(c.tMax.value, c.tBase.value + c.tSlope.value * over),
    b: Math.min(c.bMax.value, c.bBase.value + c.bSlope.value * over),
  };
};
