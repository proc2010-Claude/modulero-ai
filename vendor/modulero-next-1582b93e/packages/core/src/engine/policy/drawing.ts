// Rules of the drawings of the graph (task W10): the paper of a part sheet and of the general drawing, the scales
// a part may be drawn at, the smallest text and the camera of the reference volume view. The drawings are an output
// of the graph, not a rule of the product: the module is not in POLICY_MODULES, so its version is not written into
// the graph (`versions.policies`); it is stamped on every sheet instead.
import { constant, decision, prototype, type PolicyModule } from './types.js';

export const drawingSheets = {
  id: 'drawing-sheets',
  version: '1',
  constants: {
    partSheetMm: constant(Object.freeze([297, 210] as const), 'mm', prototype('r1.html:52370 v15PartSheets (SIDE_V6)', 'FINDINGS 540'), 'Лист детали — A4, альбомный'),
    generalSheetMm: constant(Object.freeze([420, 297] as const), 'mm', prototype('r1.html:52275 v15GeneralSvg (GENERAL_V7)', 'FINDINGS 540'), 'Общий чертёж — A3, альбомный'),
    scaleDenominators: constant(
      Object.freeze([1, 2, 2.5, 4, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100] as const),
      '1:n',
      decision('MOD-DEC-134'),
      'Деталь — главное на листе: самый крупный масштаб ряда, при котором она помещается (ряд — прототипа, r1.html:52992)',
    ),
    minTextMm: constant(2.8, 'mm', decision('MOD-DEC-045'), 'Жёсткий минимум высоты текста на листе'),
    axonometryDeg: constant(Object.freeze([28, 20] as const), 'deg', decision('MOD-DEC-107'), 'Справочный объёмный вид общего чертежа: поворот от фронта 28°, взгляд сверху 20°'),
  },
} as const satisfies PolicyModule;
