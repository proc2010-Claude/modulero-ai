// Policy of the wardrobe fasteners r7 on the graph (task W8): the accepted eccentric profiles (MOD-DEC-192, 292, 380) and
// the staggered drilling of shelves on both sides of a partition (MOD-DEC-343, which sets the step of 167). The
// fasteners of wardrobe/fasteners-r7.ts take these numbers from here (MOD-DEC-054). By MOD-DEC-341 the rule of the
// wardrobe is the default of every product; "other furniture" has its own copy in home.ts (task H1, r4).
import { constant, decision, type PolicyModule } from './types.js';
import { system32 } from './system32.js';

export const wardrobeFasteners = {
  id: 'wardrobe-fasteners',
  version: '3',
  constants: {
    accepted: constant(
      ['RASTEX16_DU325', 'RASTEX18_DU325', 'RASTEX19_DU325', 'RASTEX22_DU325', 'MAKMART_S16', 'MAKMART_S19', 'MAKMART_S22'] as readonly string[],
      'profiles',
      decision('MOD-DEC-292'),
      'Принятые профили крепежа корпуса: эксцентрик Rastex 15 с дюбелем DU325 — 16 и 18 мм (292), 19 и 22 мм (380), конфирмат 7×50 для 16 и 19 мм (192, 467), 7×70 для 22 мм (467). Minifix и сквозные DU868 / DU853 — только после приёмки их профиля (192, 292)',
    ),
    confirmatByThickness: constant(
      Object.freeze({ 16: 'MAKMART_S16', 19: 'MAKMART_S19', 22: 'MAKMART_S22' }) as Readonly<Record<number, string>>,
      'profiles',
      decision('MOD-DEC-467'),
      'Конфирмат по толщине детали со сквозным отверстием: 16 и 19 мм — 7×50, 22 мм — 7×70 (467). Другая толщина сверлится по профилю 16 мм временно, с замечанием (FINDINGS 434)',
    ),
    sharedFront: constant(37, 'mm', decision('MOD-DEC-343'), 'Встречная присадка у перегородки: передний ряд левой полки — 37 мм от готового переднего края перегородки'),
    sharedStagger: constant(16, 'mm', decision('MOD-DEC-343'), 'Правая полка — на 16 мм глубже левой, спереди и сзади (53 и G − 16)'),
    sharedRearMin: constant(37, 'mm', decision('MOD-DEC-343'), 'Задний ряд G — не ближе 37 мм к задней кромке перегородки; без System 32 — D − 37'),
    sharedStep: constant(system32.constants.step.value, 'mm', decision('MOD-DEC-193'), 'Шаг сетки System 32: задний ряд G = 37 + 32·n'),
    dowelShift: constant(32, 'mm', decision('MOD-DEC-192'), 'Деревянный шкант эксцентрикового стыка — на 32 мм к центру от станции'),
  },
} as const satisfies PolicyModule;

const C = wardrobeFasteners.constants;

/** Whether a fastener profile is accepted for automatic use (MOD-DEC-192, 292, 380, 467). */
export const fastenerProfileAccepted = (profileId: string): boolean => C.accepted.value.includes(profileId);

/** The confirmat profile for the thickness of the part it is drilled through (MOD-DEC-467); 16 mm for another one (FINDINGS 434). */
export const confirmatProfileFor = (throughThicknessMm: number): string => C.confirmatByThickness.value[throughThicknessMm] ?? C.confirmatByThickness.value[16]!;

/** Whether a profile is one of the confirmats of MOD-DEC-467 (its kit is the screw itself). */
export const isConfirmatProfile = (id: unknown): boolean => Object.values(C.confirmatByThickness.value).includes(id as string);

/** The stations of a shelf on a partition shared with a shelf on its other side (MOD-DEC-343). */
export interface SharedShelfRows {
  /** Front and rear row, mm from the finished front edge of the partition. */
  rowsMm: [number, number];
  /** Rear row G of the left shelf, mm from the front edge of the partition. */
  rearRowMm: number;
  /** The rear dowel of the right shelf reaches its front one: the partition is too shallow (MOD-DEC-343). */
  conflict: boolean;
}

/**
 * Rows of a shelf on a partition carrying a shelf on its other side at the same height (MOD-DEC-343): the left shelf
 * (left of the partition along x) at 37 mm and G, the right shelf 16 mm deeper — 53 and G − 16. G is the last line
 * 37 + 32·n at least 37 mm from the rear edge of the partition with System 32 on (196), D − 37 with it off. The dowels
 * stand 32 mm towards the centre (192); when the rear dowel of the right shelf (G − 48) is not behind its front dowel
 * (85), the depth is a conflict: with System 32 a partition shallower than 202 mm.
 */
export function sharedShelfRows(partitionDepthMm: number, rightShelf: boolean, system32On: boolean): SharedShelfRows {
  const front = C.sharedFront.value,
    rearMin = C.sharedRearMin.value,
    step = C.sharedStep.value,
    shift = rightShelf ? C.sharedStagger.value : 0,
    G = system32On ? front + Math.max(0, Math.floor((partitionDepthMm - rearMin - front) / step)) * step : partitionDepthMm - rearMin,
    dowel = C.dowelShift.value,
    stagger = C.sharedStagger.value;
  return { rowsMm: [front + shift, G - shift], rearRowMm: G, conflict: !(G - stagger - dowel > front + stagger + dowel) };
}
