// Policy of the drawers of the swing wardrobe on the graph (task W7): the drawer box of the prototype's runner, its
// place in the section, the spacer at the side panel (MOD-DEC-331, 360) and the motion the view shows. The drawers of
// wardrobe/drawers.ts and the generator engine/generators/wardrobe.ts take these numbers from here (MOD-DEC-054).
// The box keeps the prototype's numbers (r1.html:12051–12384, u13Boxes r1.html:19318) with FINDINGS 390: no decision
// gives them, the runner is a candidate (WR-16, HOLD 032). The stroke of the drawer and the opening angle of the door
// are the prototype's view numbers — placeholders until the catalogue gives them (FINDINGS 394); at a room wall the
// door stops at the wall (version 2, MOD-DEC-331, 742; FINDINGS 3050).
import { constant, decision, prototype, type PolicyModule } from './types.js';

const BOX = 'FINDINGS 390',
  MOTION = 'FINDINGS 394';

export const wardrobeDrawers = {
  id: 'wardrobe-drawers',
  version: '2',
  constants: {
    maxDrawers: constant(20, 'pcs', prototype('r1.html:12053 clamp(drawerCount, 1, 20) без наполнения файла 90', BOX), 'Наибольшее число ящиков секции без наполнения файла 90'),
    boxHeightMin: constant(80, 'mm', prototype('r1.html:12058 clamp(drawerBoxHeight, 80, 320)', BOX), 'Наименьшая высота короба ящика секции без наполнения'),
    boxHeightMax: constant(320, 'mm', prototype('r1.html:12058 clamp(drawerBoxHeight, 80, 320)', BOX), 'Наибольшая высота короба ящика секции без наполнения'),
    internalBottom: constant(40, 'mm', prototype('r1.html:12066 baseY = 40 у внутреннего ящика', BOX), 'Низ первого внутреннего ящика над дном секции без наполнения; у наружного — зазор фасадов'),
    boxFrontInside: constant(28, 'mm', prototype('r1.html:19385 u13Boxes: z0 = 28 — передняя стенка короба от переднего края корпуса', BOX), 'Передняя стенка внутреннего ящика — в 28 мм за передним краем корпуса; решения нет'),
    doorOpenAngleDeg: constant(105, 'deg', prototype('r1.html:51547 CabinetView.applyMotion: дверь открывается на 105°', MOTION), 'Угол открытой двери — заглушка вида, позже из каталога петли'),
    doorOpenAngleAtWallDeg: constant(
      90,
      'deg',
      decision('MOD-DEC-742'),
      '(Д) Директора, FINDINGS 3050: дверь, петли которой на боковине у стены помещения (331), открывается до стены — на 90°, её наружная пласть ложится на плоскость стены; угол петли у стены по каталогу не известен',
    ),
    travelRatio: constant(0.7, 'ratio', prototype('r1.html:55220 v18MotionData: ход 0,7 глубины короба', MOTION), 'Ход ящика — заглушка вида, позже из каталога направляющей'),
    travelInside: constant(40, 'mm', prototype('r1.html:55220 v18MotionData: не меньше 40 мм короба внутри', MOTION), 'Выдвинутый ящик остаётся в корпусе не меньше чем на 40 мм — заглушка вида'),
    runnerRule: constant(
      'LEVEL_466' as const,
      'rule',
      decision('MOD-DEC-514'),
      '(Д) Директора, FINDINGS 1862: ящик своего короба нового проекта (`fittings.drawerRunner: level`) — на направляющей уровня фурнитуры по 466 через общий подбор engine/drawer-runner.ts, как у другой мебели r5 (1755): «Эконом» — DB4501 с коробом прототипа, «Стандарт» — B-Slide DB8781 с коробом набора БАЗИС, «Премиум» — MOVENTO без набора короба, взамен B-Slide с замечанием (465); сохранённые проекты и эталоны прототипа — DB4501, как сохранены',
    ),
  },
} as const satisfies PolicyModule;

/** Stroke of a drawer of box depth `boxDepthMm` in the view (r1 v18MotionData): a placeholder until the runner's catalogue gives it. */
export const wardrobeDrawerTravelMm = (boxDepthMm: number): number => {
  const c = wardrobeDrawers.constants;
  return Math.min(boxDepthMm * c.travelRatio.value, Math.max(0, boxDepthMm - c.travelInside.value));
};
