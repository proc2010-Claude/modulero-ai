// Stations of a joint by the width of the joined part (MOD-DEC-364): where the fasteners (confirmats, eccentrics)
// and the wooden dowel of a narrow part go. One rule for every product of the engine (MOD-DEC-294): the wardrobe
// carcass, its fixed shelves and plinth rails, and the joints of "other furniture" of rule set r4. A part of 200 mm
// and wider keeps the stations of its product; this module answers only for the narrower ones.
import { constant, decision, prototype, type PolicyModule } from './types.js';

export const jointStations = {
  id: 'joint-stations',
  version: '1',
  constants: {
    wideFrom: constant(200, 'mm', decision('MOD-DEC-364'), 'Деталь от 200 мм (ровно 200 — тоже) — две стяжки на станциях своего изделия: у шкафа в 50 мм от краёв (п. 1)'),
    twoStationsOver: constant(128, 'mm', decision('MOD-DEC-364'), 'Шире 128 мм и уже 200 мм — две стяжки в 32 мм от краёв (п. 2)'),
    edgeStation: constant(32, 'mm', decision('MOD-DEC-364'), 'Центр отверстия стяжки узкой детали — в 32 мм от края (пп. 2, 3)'),
    centreUpTo: constant(96, 'mm', decision('MOD-DEC-364'), 'До 96 мм включительно — одна стяжка по центру и шкант от проворачивания (п. 4); 97…128 мм — стяжка у переднего (нижнего) края и шкант у другого (п. 3)'),
    edgeDowel: constant(32, 'mm', decision('MOD-DEC-364'), 'Шкант детали 97…128 мм — в 32 мм от заднего (верхнего) края (п. 3)'),
    centreDowelFraction: constant(
      0.25,
      'ratio',
      decision('MOD-DEC-364'),
      '(Д) Шкант детали до 96 мм — в том же торце посередине между стяжкой и задним (верхним) краем, в D/4 от края: в 32 мм от стяжки он не помещается (у планки 70 мм — в 3 мм от края). Вопрос владельцу (FINDINGS 381)',
    ),
    dowel: constant(
      Object.freeze({ diameter: 8, length: 35, edgeDepth: 26, faceDepth: 11 }),
      'mm',
      prototype('r1.html:87222 F7 wood: WOOD8x35_NOMINAL_11_26', 'FINDINGS 380'),
      'Шкант узкой детали — как шкант эксцентрика по 192: 8×35, 26 мм в торец, 11 мм в пласть; размер шканта — HOLD 154/192',
    ),
  },
} as const satisfies PolicyModule;

/** The fasteners and the dowels of a joint, in mm from the front edge of the part (of a vertical part, its lower edge). */
export interface JointLayout {
  stations: number[];
  dowels: number[];
}

/**
 * MOD-DEC-364: the layout of a joint of a part D mm wide (along the joint), or null from 200 mm on, where the
 * product keeps its own stations. 128 < D < 200 — two fasteners 32 mm from the edges; 96 < D ≤ 128 — one fastener
 * 32 mm from the front (lower) edge and a dowel 32 mm from the other; D ≤ 96 — one fastener in the centre and a
 * dowel against turning, D/4 from the rear (upper) edge (Д).
 */
export function narrowJointLayout(D: number): JointLayout | null {
  const c = jointStations.constants;
  if (D >= c.wideFrom.value) return null;
  if (D > c.twoStationsOver.value) return { stations: [c.edgeStation.value, D - c.edgeStation.value], dowels: [] };
  if (D > c.centreUpTo.value) return { stations: [c.edgeStation.value], dowels: [D - c.edgeDowel.value] };
  return { stations: [D / 2], dowels: [D - D * c.centreDowelFraction.value] };
}
