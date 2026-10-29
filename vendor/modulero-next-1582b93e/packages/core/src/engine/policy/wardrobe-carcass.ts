// Policy of the wardrobe carcass on the graph (task W3): input limits, carcass confirmat stations of a part from
// 200 mm (narrower ones: joint-stations.ts, MOD-DEC-364), the receiving hole of the confirmat. The generator
// engine/generators/wardrobe.ts and the carcass of wardrobe/carcass.ts take these numbers from here (MOD-DEC-054).
import { constant, decision, standard, type PolicyModule } from './types.js';

export const wardrobeCarcass = {
  id: 'wardrobe-carcass',
  version: '1',
  constants: {
    depthMin: constant(100, 'mm', decision('MOD-DEC-203'), 'Глубина шкафа — от 100 мм, целые мм (WR-14)'),
    depthMax: constant(1000, 'mm', decision('MOD-DEC-203'), 'Глубина шкафа — до 1000 мм; больше — отказ с причиной, не подмена (WR-14)'),
    widthMin: constant(160, 'mm', decision('MOD-DEC-565'), 'Ширина шкафа — от 160 мм без фиксированного максимума (было 100 по 203, FINDINGS 1163)'),
    heightMax: constant(3200, 'mm', decision('MOD-DEC-565'), 'Высота шкафа — до 3200 мм; больше — отказ с причиной, не подмена (FINDINGS 1163)'),
    confirmatStation: constant(50, 'mm', decision('MOD-DEC-364'), 'Станции конфирматов корпуса детали от 200 мм — 50 мм от переднего и заднего края (п. 1; число прототипа r1.html:11916, FINDINGS 40); уже — joint-stations'),
    confirmatEdgeDepth: constant(
      35,
      'mm',
      standard('Handbook r8 §17.1 [СТ v1.2 §17.1] (MOD-DEC-345, 342): конфирмат 7×50 — проходное D8 THRU, ответное D5 глубиной 35 мм'),
      'Ответное отверстие конфирмата в торце: D5, глубина 35 мм; D5/L40 профиля MAKMART_S16 прототипа исправлено (WR-17, FINDINGS 213)',
    ),
    plinthRailDowel: constant(
      Object.freeze({ diameter: 8, length: 30, faceDepth: 12, edgeDepth: 18 }),
      'mm',
      decision('MOD-DEC-455'),
      'Шкант цокольной планки в поднятое дно: 8×30, 12 мм в пласть дна и 18 мм в торец планки; у прототипа по 15 мм — в дне 16 мм оставался 1 мм (FINDINGS 659)',
    ),
  },
} as const satisfies PolicyModule;

