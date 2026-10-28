// Structural validation of a home-physical project. Throws Error with a user-facing message.
// Limits come from engine/policy/home.ts; r4 adds the checks of task H1 (INV-G07, INV-H04, MOD-DEC-343).
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { HOME, HOME_R4, HOME_R5, homeRules } from '../engine/policy/home.js';
import { homeCuttingProblem } from './cutting.js';
import { archetypeDefaults, materialProfiles, materials, priceByPlan, rateNamesOf } from './catalog.js';
import { allFronts, availableBays, bay, foot, frontGeometry, frontsCloser, topT } from './geometry.js';
import { physicalGraph } from './graph.js';
import { joinery } from './joinery.js';
import { hingeCount, runnerInfo } from './mechanisms.js';
import { DECOR_RATE_KEYS, type Door, type HomeProject } from './types.js';

const ALLOWED_KEYS = new Set([
  'id', 'name', 'templateId', 'material', 'thickness', 'edgeThickness', 'hardwareVariant', 'supportVariant',
  'floor', 'bodies', 'rates', 'rateNote', 'rateDate', 'room', 'antiTipConfirmed', 'wallAnchors', 'wall',
  'density', 'plannedShelfLoadKg', 'boardNote', 'boardConfirmed', 'floorSurface', 'materialProfile', 'kitLevel',
  'plannedDeskLoadKg', 'plannedDrawerLoadKg', 'generatorVersion', 'archetypeVersion', 'archetypeId', 'topThickness',
  'handleId', 'drawerBottom', 'drawerRunner', 'cableOutlet', 'facadeChoice', 'materialRates', 'cutting',
]);

/** Drilling problems that make an r4 project invalid (INV-H04, MOD-DEC-343), with the reason shown to the user. */
const DRILLING_REFUSALS: Readonly<Record<string, string>> = {
  CUTTER_INTERSECTION: 'Сверления пересекаются в одной детали. Сдвиньте полку, ящик или перегородку.',
  CUTTER_OUTSIDE: 'Сверление выходит за деталь. Увеличьте деталь или сдвиньте соседний элемент.',
  BORE_BOUNDARY: 'Отверстие выходит за край детали. Увеличьте деталь или сдвиньте соседний элемент.',
  SMALL_DRAWER_PATTERN: 'Ящик слишком низкий для шкантов передней стенки. Увеличьте высоту ящика.',
  SHARED_SHELF_DEPTH: 'Перегородка слишком мелкая: гнёзда полки по системе 32 мм не помещаются (нужна глубина от 202 мм).',
  BORE_IN_REBATE: 'Крепёж заходит в четверть задней стенки из ХДФ. Выберите несущую стенку из ЛДСП или плиту 18 мм либо сдвиньте элемент.',
  BORE_IN_GROOVE: 'Крепёж стенки ящика заходит в паз дна из ХДФ. Увеличьте высоту ящика.',
};

export function validate(p: HomeProject, hw: HardwareCatalogs): HomeProject {
  // H-15: a missing or broken project is a message for the user, not a TypeError.
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw Error('Проект не найден или повреждён.');
  if (Object.keys(p).some((k) => !ALLOWED_KEYS.has(k))) throw Error('Проект содержит неподдерживаемые поля.');
  const R = homeRules(p);
  if (R.generator === HOME_R4 && p.generatorVersion !== HOME_R4) throw Error('Версия конструкции проекта не поддерживается.');
  if (
    !p ||
    !Array.isArray(p.bodies) ||
    !p.bodies.length ||
    p.bodies.length > 20 ||
    !archetypeDefaults[p.templateId] ||
    ![16, 18].includes(p.thickness) ||
    ![16, 18].includes(topT(p)) ||
    ![0.4, 1, 2].includes(p.edgeThickness)
  )
    throw Error('Неподдерживаемые параметры конструкции.');
  if (
    !materials.some((m) => m.id === p.material) ||
    !['economy', 'standard', 'premium'].includes(p.kitLevel) ||
    typeof p.id !== 'string' ||
    typeof p.name !== 'string' ||
    !p.name.trim()
  )
    throw Error('Материал или формат проекта не поддерживается.');
  if (
    p.name.length > 120 ||
    p.id.length > 100 ||
    !['hard', 'carpet'].includes(p.floor) ||
    !['kronospan-p2-18', 'kronospan-p2-16', 'legacy-custom'].includes(p.materialProfile) ||
    p.supportVariant !== 'boyard-p101zn56' ||
    p.hardwareVariant !== 'hettich-rastex15-' + p.thickness + '-du325' ||
    typeof p.boardConfirmed !== 'boolean' ||
    typeof p.antiTipConfirmed !== 'boolean'
  )
    throw Error('Неподдерживаемый профиль материала, пола или комплекта.');
  if (p.materialProfile !== 'legacy-custom') {
    const profile = materialProfiles.find((q) => q.id === p.materialProfile)!;
    if (profile.thickness !== p.thickness || profile.density !== p.density)
      throw Error('Толщина и плотность должны соответствовать профилю плиты.');
  }
  for (const key of ['boardNote', 'rateNote', 'wallAnchors'] as const)
    if (typeof p[key] !== 'string' || p[key].length > 500) throw Error('Некорректное описание материала, цены или установки.');
  if (
    typeof p.rateDate !== 'string' ||
    !p.room ||
    Object.keys(p.room).sort().join(',') !== 'depth,height,width' ||
    !Object.values(p.room).every((v) => Number.isFinite(v) && v >= 100 && v <= 20000)
  )
    throw Error('Некорректные габариты помещения.');
  // r5 (MOD-DEC-513, FINDINGS 965): a handle of the fittings catalogue or «без ручек»; r3 and r4 have no choice.
  if (p.handleId !== undefined && (!R.handles || (p.handleId !== 'NONE' && !hw.fittings.handles.some((h) => h.id === p.handleId))))
    throw Error(R.handles ? 'Ручка не найдена в каталоге фурнитуры.' : 'Выбор ручки доступен только в конструкции r5.');
  // r5 (MOD-DEC-574, FINDINGS 1304): the bottom of HDF in a groove of the drawer box; r3 and r4 have no such bottom.
  if (p.drawerBottom !== undefined && (p.drawerBottom !== 'hdf' || !R.drawerBottomHdf))
    throw Error('Дно ящика из ХДФ в пазу доступно только в конструкции r5.');
  // r5 (MOD-DEC-574, FINDINGS 1750, 1755): the runner of each drawer by 466; r3 and r4 have DB4501 under every box.
  if (p.drawerRunner !== undefined && (p.drawerRunner !== 'level' || !R.drawerRunnerRule))
    throw Error('Направляющая ящика по уровню фурнитуры доступна только в конструкции r5.');
  if (p.cableOutlet !== undefined && (p.cableOutlet !== 'back' || !R.cableOutlet))
    throw Error('Отверстие под провода в задней стенке доступно только в конструкции r5.');
  // r5 (MOD-DEC-573): the material of the fronts — a reference to the catalogue with the supply and the thickness the
  // project was built with; whether the release still has it is a remark of the graph (FACADE_MATERIAL_CATALOG).
  const fc = p.facadeChoice as unknown as Record<string, unknown> | undefined;
  if (fc !== undefined) {
    if (R.generator !== HOME_R5) throw Error('Выбор материала фасадов доступен только в конструкции r5.');
    if (
      !fc || typeof fc !== 'object' || Array.isArray(fc) ||
      ['materialId', 'executionId', 'materialTitle', 'executionTitle'].some((k) => typeof fc[k] !== 'string' || !fc[k]) ||
      !['MANUFACTURE', 'PURCHASED'].includes(fc.supply as string) ||
      !(fc.thicknessMm === 'BOARD' || (typeof fc.thicknessMm === 'number' && Number.isFinite(fc.thicknessMm) && fc.thicknessMm > 0)) ||
      !(fc.decorId === null || typeof fc.decorId === 'string') ||
      !(fc.colorText === null || (typeof fc.colorText === 'string' && fc.colorText.length <= 60))
    )
      throw Error('Выбор материала фасадов повреждён.');
  }
  // r4 and r5 (R5-009, FINDINGS 1969): the parameters of the cutting map in the limits of the wardrobe's.
  const cutting = homeCuttingProblem(p);
  if (cutting) throw Error(cutting);
  const seen = new Set<string>();
  for (const b of p.bodies) {
    if (
      ![b.x, b.y, b.w, b.h, b.d].every(Number.isFinite) ||
      b.w < HOME.bodyWidth[0] || b.w > HOME.bodyWidth[1] ||
      b.h < HOME.bodyHeight[0] || b.h > HOME.bodyHeight[1] ||
      b.d < HOME.bodyDepth[0] || b.d > HOME.bodyDepth[1] ||
      b.x < 0 || b.y < 0
    )
      throw Error('Габариты выходят за поддерживаемую область.');
    // r4 (INV-G07, MOD-DEC-313; H-06): a body stands on the floor on its pads.
    if (R.bodyOnFloor && b.y !== 0) throw Error('Корпус должен стоять на полу: подпятники передают нагрузку на пол.');
    // r5 (MOD-DEC-515): the back of HDF in a rebate — only where the rule set offers it, and only with a back.
    if (b.backMaterial !== undefined && (b.backMaterial !== 'hdf' || !R.hdfBack || !b.back))
      throw Error('Задняя стенка из ХДФ доступна только в конструкции r5 и только при задней стенке.');
    // r5 (MOD-DEC-516): a plinth or legs in place of the pads — only where the rule set offers them, within the heights of
    // the base of the wardrobe; the knee side of a desk has no bottom a leg could be fixed to (FINDINGS 949).
    if (b.base !== undefined) {
      const C = R.baseChoice,
        q = b.base as { kind?: unknown; heightMm?: unknown } | null;
      if (
        !C ||
        !q ||
        (q.kind !== 'plinth' && q.kind !== 'legs') ||
        Object.keys(q).sort().join(',') !== 'heightMm,kind' ||
        typeof q.heightMm !== 'number' ||
        !(q.heightMm >= C.heightMm.min && q.heightMm <= C.heightMm.max)
      )
        throw Error(C ? `Высота цоколя или ножек — от ${C.heightMm.min} до ${C.heightMm.max} мм.` : 'Цоколь и ножки доступны только в конструкции r5.');
      if (q.kind === 'legs' && b.kind === 'desk')
        throw Error('Стол не ставится на ножки: под правой боковиной нет дна, ножку не к чему крепить. Выберите подпятники или цоколь.');
    }
    if (
      !Array.isArray(b.partitions) ||
      !Array.isArray(b.shelves) ||
      !Array.isArray(b.doors) ||
      !Array.isArray(b.drawers) ||
      b.partitions.length > 12 ||
      b.shelves.length > 100 ||
      allFronts(b).length > 40
    )
      throw Error('Повреждён состав конструкции.');
    for (const q of [b, ...b.partitions, ...b.shelves, ...allFronts(b)]) {
      if (typeof q.id !== 'string' || !q.id || seen.has(q.id)) throw Error('Повторный или пустой ID детали.');
      seen.add(q.id);
    }
    const bays = availableBays(p, b);
    for (const opening of bays) {
      const r = bay(p, b, opening);
      if (r.right - r.left < HOME.bayMinWidth) throw Error('Просвет между вертикалями меньше ' + HOME.bayMinWidth + ' мм.');
    }
    if (b.kind === 'desk') {
      if (b.partitions.length !== 1) throw Error('Стол требует одну общую вертикаль тумбы.');
      const P = b.partitions[0].x + p.thickness / 2;
      const [hMin, hMax] = HOME.deskHeight;
      if (b.w - P - p.thickness < HOME.deskKneeWidth || b.d < HOME.deskMinDepth || b.h < hMin || b.h > hMax)
        throw Error(`Столу нужны свободные ${HOME.deskKneeWidth} мм для ног, глубина ${HOME.deskMinDepth} мм и высота ${hMin}–${hMax} мм.`);
    }
    for (const s of b.shelves) {
      const a = bay(p, b, s);
      if (
        !Number.isFinite(a.left + a.right) ||
        !Number.isFinite(s.y) ||
        s.y <= foot(p, b) + p.thickness ||
        s.y + p.thickness >= b.h - topT(p) ||
        typeof s.fixed !== 'boolean'
      )
        throw Error('Полка выходит за доступную нишу.');
      if (!bays.some((q) => q.lo === s.lo && q.hi === s.hi)) throw Error('Полка пересекает вертикаль или свободную зону ног.');
    }
    for (const f of allFronts(b)) {
      const g = frontGeometry(p, b, f),
        m = HOME.frontCarcassMargin;
      if (
        ![g.x, g.y, g.w, g.h].every(Number.isFinite) ||
        f.y < foot(p, b) + m ||
        f.y + f.h > b.h - topT(p) - m + 0.1 ||
        f.h < HOME.frontMinHeight ||
        !bays.some((q) => q.lo === f.lo && q.hi === f.hi)
      )
        throw Error('Фасад выходит за нишу или общий верх.');
      if ((b.doors as unknown[]).includes(f)) {
        const door = f as Door;
        // r5: the width of a door is limited by the chart of its hinge, said as HINGE_CHART (329, 377; FINDINGS 841).
        if (!['left', 'right'].includes(door.hinge) || (R.hingeRule === 'R3_TABLE' && g.w > HOME.doorMaxWidth))
          throw Error('Дверце нужен корректный край и ширина до ' + HOME.doorMaxWidth + ' мм.');
        hingeCount(p, hw, b, door);
      } else {
        const n = runnerInfo(p, hw, b, f);
        if (n.boxW < HOME.drawerBoxMinWidth || n.boxH < HOME.drawerBoxMinHeight) throw Error('Коробка ящика слишком мала.');
      }
    }
    const fronts = allFronts(b);
    for (let i = 0; i < fronts.length; i++)
      for (let j = i + 1; j < fronts.length; j++) {
        const a = frontGeometry(p, b, fronts[i]),
          c = frontGeometry(p, b, fronts[j]);
        // r3 refuses a seam under 2 mm, as the prototype; r4 refuses only an overlap — the narrow seam is a warning (MOD-DEC-356).
        if (R.narrowSeamRefused && frontsCloser(a, c, HOME.frontMinSeam - 0.1))
          throw Error('Фасады пересекаются или не выдержан зазор ' + HOME.frontMinSeam + ' мм.');
        if (!R.narrowSeamRefused && frontsCloser(a, c, -0.1)) throw Error('Фасады пересекаются. Сдвиньте или уменьшите фасад.');
      }
  }
  // The rates of the rule set: r4 counts the board by sheets, the saw run and the holes (MOD-DEC-510).
  const rates = p.rates as Record<string, number | null>,
    names = rateNamesOf(p);
  if (
    !rates ||
    Object.keys(rates).some((k) => !Object.hasOwn(names, k)) ||
    Object.keys(names).some(
      (k) =>
        !Object.hasOwn(rates, k) ||
        (rates[k] !== null && (!Number.isFinite(rates[k]) || (rates[k] as number) < 0 || (rates[k] as number) > 10000000)),
    )
  )
    throw Error('Некорректная ставка стоимости.');
  // r4 and r5 (R5-006, FINDINGS 1970): the rates kept by the decors of the catalogue, in the limits of the rates.
  const kept = p.materialRates as unknown;
  if (
    kept !== undefined &&
    (!priceByPlan(p) ||
      !kept || typeof kept !== 'object' || Array.isArray(kept) ||
      Object.entries(kept).some(
        ([id, r]) =>
          !materials.some((m) => m.id === id) ||
          !r || typeof r !== 'object' || Array.isArray(r) ||
          Object.entries(r).some(([k, v]) => !(DECOR_RATE_KEYS as readonly string[]).includes(k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10000000),
      ))
  )
    throw Error('Некорректные ставки декоров.');
  if (
    ![p.density, p.plannedShelfLoadKg, p.plannedDeskLoadKg, p.plannedDrawerLoadKg].every(Number.isFinite) ||
    p.density < 400 ||
    p.density > 1000 ||
    Math.min(p.plannedShelfLoadKg, p.plannedDeskLoadKg, p.plannedDrawerLoadKg) < 0
  )
    throw Error('Некорректная плотность или нагрузка.');
  const graph = physicalGraph(p, hw);
  if (graph.collisions.length || !graph.invariants.allJointsHaveContact)
    throw Error('Физические детали пересекаются или соединение потеряло контакт.');
  if (
    graph.parts.some(
      (q) => q.extent_mm.some((v) => !Number.isFinite(v) || v <= 0) || q.cut_uv_mm.some((v) => !Number.isFinite(v) || v <= 0),
    )
  )
    throw Error('Деталь имеет недопустимый размер готовой панели или раскроя.');
  const over = graph.unresolved.find(
    (q) => q.code === 'DEFLECTION' && graph.parts.find((a) => a.id === q.partId)?.semanticRole === 'continuous_top',
  );
  // r3 blocks the project; r4 keeps the deflection a warning: no threshold is decided (§14.1, H-12).
  if (over && R.topDeflectionBlocks)
    throw Error('Пролёт общей крышки превышает расчётный предел L/200. Добавьте реальную опору или уменьшите ширину/нагрузку.');
  // r4: a graph with crossing or escaping bores is invalid (INV-H04, H-04): the edit is refused with the reason.
  if (R.drillingClashRefused) {
    const clash = joinery(p, hw).unresolved.find((u) => DRILLING_REFUSALS[u.code]);
    if (clash) throw Error(DRILLING_REFUSALS[clash.code]);
  }
  return p;
}
