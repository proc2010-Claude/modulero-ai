// Structural validation of a home-physical project. Throws Error with a user-facing message.
// Limits come from engine/policy/home.ts; r4 adds the checks of task H1 (INV-G07, INV-H04, MOD-DEC-343).
import { faceHandles } from '../catalog/hardware/fittings.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { HOME, HOME_R4, HOME_R5, homeRules } from '../engine/policy/home.js';
import { mfDecor } from '../engine/policy/materials.js';
import { homeCuttingProblem } from './cutting.js';
import { archetypeDefaults, homeTemplates, materialProfiles, materials, priceByPlan, rateNamesOf } from './catalog.js';
import { drillingWhere, frontOutsideText, frontsOverlapText } from './fronts.js';
import { sharedShelfBodyDepth, shelfOutside, sizeOutside } from './limits.js';
import { allFronts, availableBays, bay, foot, frontGeometry, frontsCloser, hdfBackOf, nicheLimits, partitionFrom, pedestalRight, topT } from './geometry.js';
import { carcassDecorName, decorThicknesses } from './decor.js';
import { physicalGraph } from './graph.js';
import { joinery } from './joinery.js';
import { hingeCount, homeCasters, runnerInfo } from './mechanisms.js';
import { DECOR_RATE_KEYS, type Body, type Door, type Front, type HomeProject } from './types.js';

const ALLOWED_KEYS = new Set([
  'id', 'name', 'templateId', 'material', 'thickness', 'edgeThickness', 'hardwareVariant', 'supportVariant',
  'floor', 'bodies', 'rates', 'rateNote', 'rateDate', 'room', 'antiTipConfirmed', 'wallAnchors', 'wall',
  'density', 'plannedShelfLoadKg', 'boardNote', 'boardConfirmed', 'floorSurface', 'materialProfile', 'kitLevel',
  'plannedDeskLoadKg', 'plannedDrawerLoadKg', 'generatorVersion', 'archetypeVersion', 'archetypeId', 'topThickness',
  'handleId', 'drawerBottom', 'drawerRunner', 'cableOutlet', 'facadeChoice', 'materialRates', 'cutting', 'decorId',
  'edgeOverrides', 'pushToOpen',
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
    // r5 (MOD-AI-73, FINDINGS 3322): the templates after the first eight are of the rule set r5.
    !homeTemplates(p).some((t) => t.id === p.templateId) ||
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
  // r5 (MOD-AI-39): a decor of the catalogue for the carcass, in a thickness it is sold in.
  if (p.decorId !== undefined) {
    if (!R.catalogDecors) throw Error('Декор каталога для корпуса доступен только в конструкции r5.');
    if (typeof p.decorId !== 'string' || !mfDecor(p.decorId, hw.materials)) throw Error('Декор корпуса не найден в каталоге материалов.');
    const ts = decorThicknesses(hw.materials, p.decorId);
    if (ts.length && !ts.includes(p.thickness))
      throw Error(`Декор ${carcassDecorName(p.decorId, hw.materials)} в каталоге есть толщиной ${ts.join(' или ')} мм, а плита проекта — ${p.thickness} мм.`);
  }
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
  if (p.handleId !== undefined && (!R.handles || (p.handleId !== 'NONE' && !faceHandles(hw.fittings).some((h) => h.id === p.handleId))))
    throw Error(R.handles ? 'Ручка не найдена в каталоге фурнитуры.' : 'Выбор ручки доступен только в конструкции r5.');
  // r5 (MOD-AI-36, FINDINGS 3319): the doors open by pressing; r3 and r4 open them by their handles.
  if (p.pushToOpen !== undefined && (p.pushToOpen !== true || !R.pushToOpen))
    throw Error(R.pushToOpen ? 'Повреждено открывание нажатием.' : 'Открывание нажатием доступно только в конструкции r5.');
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
  // MOD-DEC-743: the manual bands — { part: { edge: profile } }; the profile itself is the rule's, at the edit.
  const eo = p.edgeOverrides as unknown;
  if (eo !== undefined && (!eo || typeof eo !== 'object' || Array.isArray(eo) || Object.values(eo).some((x) => !x || typeof x !== 'object' || Array.isArray(x) || Object.values(x).some((v) => typeof v !== 'string'))))
    throw Error('Ручная кромка деталей повреждена.');
  const seen = new Set<string>();
  for (const b of p.bodies) {
    if (
      ![b.x, b.y, b.w, b.h, b.d].every(Number.isFinite) ||
      b.w < HOME.bodyWidth[0] || b.w > HOME.bodyWidth[1] ||
      b.h < HOME.bodyHeight[0] || b.h > HOME.bodyHeight[1] ||
      b.d < HOME.bodyDepth[0] || b.d > HOME.bodyDepth[1] ||
      b.x < 0 || b.y < 0
    )
      throw Error((R.namedLimits && sizeOutside(p, b)) || 'Габариты выходят за поддерживаемую область.');
    // r4 (INV-G07, MOD-DEC-313; H-06): a body stands on the floor on its pads.
    if (R.bodyOnFloor && b.y !== 0 && b.base?.kind !== 'wall') throw Error('Корпус должен стоять на полу: подпятники передают нагрузку на пол.');
    // r5 (MOD-DEC-515): the back of HDF in a rebate — only where the rule set offers it, and only with a back.
    if (b.backMaterial !== undefined && (b.backMaterial !== 'hdf' || !R.hdfBack || !b.back))
      throw Error('Задняя стенка из ХДФ доступна только в конструкции r5 и только при задней стенке.');
    // r5 (MOD-DEC-516): a plinth or legs in place of the pads — only where the rule set offers them, within the heights of
    // the base of the wardrobe; the knee side of a desk has no bottom a leg could be fixed to (FINDINGS 949).
    if (b.base?.kind === 'wall') wallProblem(p, b);
    // r5 (MOD-AI-73, FINDINGS 3320): casters of the catalogue, the base of the height of their caster.
    else if (b.base?.kind === 'casters') castersProblem(p, hw, b);
    else if (b.base !== undefined) {
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
        throw Error(`Стол не ставится на ножки: под ${pedestalRight(b) ? 'левой' : 'правой'} боковиной нет дна, ножку не к чему крепить. Выберите подпятники или цоколь.`);
    }
    // r5 (MOD-AI-32): a body in a niche without its bottom or its top.
    if (b.omit !== undefined) nicheProblem(p, b);
    if (b.rim !== undefined) rimProblem(p, b);
    if (b.mirror !== undefined) mirrorProblem(p, b, hw);
    if (b.topRadiusMm !== undefined) cornersProblem(p, b);
    // r5 (MOD-AI-37, FINDINGS 3315): the light hangs under the top of a cabinet.
    if (b.light !== undefined) {
      if (!R.lighting) throw Error('Подсветка корпуса доступна только в конструкции r5.');
      if (b.light !== true) throw Error('Повреждена подсветка корпуса.');
      if (b.kind === 'desk') throw Error('Подсветка — в нишах корпуса под крышкой: у стола ниш под крышкой нет.');
      if (b.omit?.includes('top')) throw Error('Светильник ставится под крышку: у корпуса без крышки его некуда поставить. Верните крышку.');
    }
    // r5 (MOD-AI-41): the pedestal of a desk on the right of its knee space.
    if (b.pedestal !== undefined && (b.pedestal !== 'right' || b.kind !== 'desk' || !R.deskPedestalSide))
      throw Error('Тумба стола справа доступна только у стола в конструкции r5.');
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
    // r5 (MOD-AI-75): a partition standing on a fixed shelf of its body, across the shelf, up to the top.
    const order = b.partitions.slice().sort((x, y) => x.x - y.x);
    for (const q of b.partitions) {
      if (q.from === undefined) continue;
      const n = order.indexOf(q) + 1,
        s = b.shelves.find((x) => x.id === q.from);
      if (!R.partialPartitions || b.kind !== 'cabinet') throw Error('Перегородка от полки доступна только в обычном корпусе конструкции r5.');
      if (typeof q.from !== 'string' || !s) throw Error(`Перегородка ${n} стоит на полке, которой нет.`);
      if (!s.fixed) throw Error(`Перегородка ${n} стоит на съёмной полке: перегородке нужна неподвижная полка.`);
      const r = bay(p, b, s),
        k = b.shelves.indexOf(s) + 1;
      if (!(r.left + 0.1 < q.x - p.thickness / 2 && q.x + p.thickness / 2 < r.right - 0.1))
        throw Error(`Перегородка ${n} стоит на полке ${k}, но полка не проходит под ней: полка — от ${Math.round(r.left)} до ${Math.round(r.right)} мм от левого края корпуса.`);
      const room = b.h - topT(p) - partitionFrom(p, b, q),
        least = R.shelfMinClearance ?? 0;
      if (!(room >= least)) throw Error(`Над полкой ${k} нет места для перегородки ${n}: до крышки ${Math.max(0, Math.round(room))} мм, нужно от ${least} мм.`);
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
      if ((pedestalRight(b) ? P - 2 * p.thickness : b.w - P - p.thickness) < HOME.deskKneeWidth || b.d < HOME.deskMinDepth || b.h < hMin || b.h > hMax)
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
        throw Error((R.namedLimits && shelfOutside(p, b, s)) || 'Полка выходит за доступную нишу.');
      if (!bays.some((q) => q.lo === s.lo && q.hi === s.hi)) throw Error('Полка пересекает вертикаль или свободную зону ног.');
      // r5 (MOD-AI-75): inside the height of its niche — under the shelf a partition of the niche stands on, or over it.
      const n = bays.find((q) => q.lo === s.lo && q.hi === s.hi)!;
      if ((n.lower !== undefined || n.upper !== undefined) && n.upper !== s.id) {
        const lim = nicheLimits(p, b, n);
        if (s.y <= lim.shelfLow || s.y + p.thickness >= lim.shelfHigh) throw Error(shelfOutside(p, b, s) ?? 'Полка выходит за доступную нишу.');
      }
      // r5 (MOD-DEC-744): the shelf over a drawer is fixed and closes a drawer of its niche.
      if (s.coverOf !== undefined && (R.drawerCoverRise === null || !s.fixed || !b.drawers.some((d) => d.id === s.coverOf && d.lo === s.lo && d.hi === s.hi)))
        throw Error('Полка над ящиком повреждена: она неподвижная и стоит над ящиком своей ниши.');
    }
    for (const f of allFronts(b)) {
      const g = frontGeometry(p, b, f),
        m = HOME.frontCarcassMargin;
      if (
        ![g.x, g.y, g.w, g.h].every(Number.isFinite) ||
        f.y < foot(p, b) + m ||
        f.y + f.h > b.h - topT(p) - m + 0.1 ||
        f.h < HOME.frontMinHeight ||
        !bays.some((q) => q.lo === f.lo && q.hi === f.hi) ||
        // r5 (MOD-AI-75): inside the height of its niche.
        frontOutsideNiche(p, b, f)
      )
        // r5 (MOD-AI-34, 71): the limits of y and h and the free parts of the niche.
        throw Error(R.frontsInFreeSpace && bays.some((q) => q.lo === f.lo && q.hi === f.hi) ? frontOutsideText(p, b, f) : 'Фасад выходит за нишу или общий верх.');
      if ((b.doors as unknown[]).includes(f)) {
        const door = f as Door;
        // r5: the width of a door is limited by the chart of its hinge, said as HINGE_CHART (329, 377; FINDINGS 841).
        if (!['left', 'right'].includes(door.hinge) || (R.hingeRule === 'R3_TABLE' && g.w > HOME.doorMaxWidth))
          throw Error('Дверце нужен корректный край и ширина до ' + HOME.doorMaxWidth + ' мм.');
        // r5 (MOD-AI-37, FINDINGS 3316): a glass door — on the glass hinges of the catalogue, never on a lift.
        if (door.glass !== undefined) {
          if (!R.glassDoors) throw Error('Стеклянная дверь доступна только в конструкции r5.');
          if (door.glass !== true) throw Error('Повреждена стеклянная дверь.');
          if (door.lift !== undefined) throw Error('Стеклянная дверь висит на петлях для стекла: откидной на подъёмнике она быть не может.');
        }
        // r5 (MOD-AI-40, FINDINGS 3314): a flap front opens upward on its lift — the upper front of its niche.
        if (door.lift !== undefined) {
          if (!R.flapFronts) throw Error('Откидной фасад на подъёмнике доступен только в конструкции r5.');
          if (door.lift !== 'FLAP') throw Error('Повреждён откидной фасад.');
          if (allFronts(b).some((o) => o !== f && o.lo === f.lo && o.hi === f.hi && o.y > f.y))
            throw Error('Откидной фасад открывается вверх: над ним в нише не должно быть других фасадов. Сделайте откидным верхний фасад ниши.');
        } else hingeCount(p, hw, b, door);
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
        if (!R.narrowSeamRefused && frontsCloser(a, c, -0.1))
          throw Error(R.frontsInFreeSpace ? frontsOverlapText(p, b, fronts[i], fronts[j]) : 'Фасады пересекаются. Сдвиньте или уменьшите фасад.');
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
    // r5 (MOD-AI-71): and the parts whose holes these are.
    const where = clash && R.frontsInFreeSpace ? drillingWhere(p, clash.partId, clash.holeIds ?? (clash.holeId ? [clash.holeId] : [])) : null;
    // r5 (MOD-AI-35): a partition too shallow for a shared shelf names the depth of the body it needs.
    const depth = clash?.code === 'SHARED_SHELF_DEPTH' && R.namedLimits ? sharedShelfBodyDepth(p, graph, clash.jointId) : null;
    if (depth) throw Error(depth);
    if (clash) throw Error(DRILLING_REFUSALS[clash.code] + (where ? ` Где: ${where}.` : ''));
  }
  return p;
}

/** A front of a niche closed by a shelf a partition stands on (r5, MOD-AI-75) that leaves its height. */
function frontOutsideNiche(p: HomeProject, b: Body, f: Front): boolean {
  if (!b.partitions.some((q) => q.from !== undefined)) return false;
  const lim = nicheLimits(p, b, f);
  return f.y < lim.frontLow - 0.1 || f.y + f.h > lim.frontHigh + 0.1;
}

/**
 * r5 (MOD-AI-33): a body on the wall hangs on the hangers SAH 216 of the kitchen's wall cabinets — only where the rule
 * set offers them and on their conditions (catalog/kitchen/hardware-profiles): a back of HDF of 3–5 mm in a groove
 * 16 mm in from the rear edges, sides of 16 mm and over, a depth up to 400 mm and a height over the depth; its top no
 * higher than a body may be (Д). A desk is not hung (Д).
 */
function wallProblem(p: HomeProject, b: Body): void {
  const W = homeRules(p).wallHanging,
    q = b.base as unknown as Record<string, unknown>;
  if (!W || Object.keys(q).join(',') !== 'kind') throw Error('Подвесной корпус доступен только в конструкции r5.');
  if (b.kind === 'desk') throw Error('Стол не вешается на стену: у него место для ног. Выберите подпятники, цоколь или ножки.');
  const hdf = hdfBackOf(p, b);
  if (!hdf || hdf.thicknessMm < W.backThicknessMm[0] || hdf.thicknessMm > W.backThicknessMm[1])
    throw Error(`Подвесному корпусу нужна задняя стенка из ХДФ ${W.backThicknessMm[0]}–${W.backThicknessMm[1]} мм: она стоит в пазу в ${W.backRecessMm} мм от заднего края, за ней — шина и навесы.`);
  if (p.thickness < W.sideThicknessMinMm) throw Error(`Навесы ${W.profileId} ставятся в боковины от ${W.sideThicknessMinMm} мм, а плита корпуса — ${p.thickness} мм.`);
  if (b.d > W.depthMaxMm) throw Error(`Подвесной корпус — глубиной до ${W.depthMaxMm} мм, а у этого ${b.d} мм.`);
  if (!(b.h > b.d)) throw Error(`У подвесного корпуса высота должна быть больше глубины: ${b.h} мм при глубине ${b.d} мм.`);
  if (b.y + b.h > HOME.bodyHeight[1])
    throw Error(`Верх подвесного корпуса — не выше ${HOME.bodyHeight[1]} мм от пола, а он на ${b.y + b.h} мм. Опустите корпус или уменьшите высоту.`);
}

/**
 * r5 (MOD-AI-32, MOD-DEC-168, (Д)): a body in a niche goes without its bottom, its top or both — only where the rule set
 * offers it. Not a desk (its top is the desk), not a body on the wall (the niche holds it, not the hangers); without the
 * bottom — on the pads only (a plinth and legs bear the bottom); with a back of the board or none (HDF is held by the
 * rebates of the bottom and the top).
 */
/** r5 (MOD-AI-40, FINDINGS 3313): the rim on the top — its edges and its height; a body without a top has nothing to carry it. */
function rimProblem(p: HomeProject, b: Body): void {
  const R = homeRules(p).topRim,
    r = b.rim as unknown as { heightMm?: unknown; sides?: unknown } | null;
  if (!R) throw Error('Бортик на крышке доступен только в конструкции r5.');
  const sides = r?.sides;
  if (!r || typeof r !== 'object' || !Array.isArray(sides) || !sides.length || sides.some((k) => !R.sides.includes(k)) || new Set(sides).size !== sides.length || Object.keys(r).some((k) => k !== 'heightMm' && k !== 'sides'))
    throw Error('Повреждён бортик крышки.');
  if (typeof r.heightMm !== 'number' || !Number.isFinite(r.heightMm) || r.heightMm < R.heightMm.min || r.heightMm > R.heightMm.max)
    throw Error(`Высота бортика — от ${R.heightMm.min} до ${R.heightMm.max} мм.`);
  if (b.omit?.includes('top')) throw Error('Бортик стоит на крышке: у корпуса без крышки его нет. Верните крышку.');
}

/**
 * r5 (MOD-AI-73, FINDINGS 3322): the mirror over the top — its height; it stands on the top where the rear rim would, and
 * the mirror of the catalogue must not be larger than the largest piece the catalogue gives.
 */
function mirrorProblem(p: HomeProject, b: Body, hw: HardwareCatalogs): void {
  const R = homeRules(p).vanityMirror,
    r = b.mirror as unknown as { heightMm?: unknown } | null;
  if (!R) throw Error('Зеркало над крышкой доступно только в конструкции r5.');
  if (!r || typeof r !== 'object' || Object.keys(r).some((k) => k !== 'heightMm')) throw Error('Повреждено зеркало над крышкой.');
  if (typeof r.heightMm !== 'number' || !Number.isFinite(r.heightMm) || r.heightMm < R.heightMm.min || r.heightMm > R.heightMm.max)
    throw Error(`Высота зеркала над крышкой — от ${R.heightMm.min} до ${R.heightMm.max} мм.`);
  if (b.omit?.includes('top')) throw Error('Зеркало стоит на крышке: у корпуса без крышки его нет. Верните крышку.');
  if (b.rim) throw Error('Щит зеркала стоит на задней кромке крышки, где и бортик: уберите бортик или зеркало.');
  const glass = hw.glass.glass.find((x) => x.id === R.glassId),
    max = glass?.maxSizeMm?.value;
  if (!glass) throw Error(`Зеркала ${R.glassId} нет в каталоге стекла.`);
  const w = b.w - 2 * R.marginMm,
    h = r.heightMm - 2 * R.marginMm;
  if (max && (w > max.widthMm || h > max.heightMm) && (h > max.widthMm || w > max.heightMm))
    throw Error(`Зеркало ${Math.round(w)} × ${Math.round(h)} мм больше наибольшего листа каталога ${max.widthMm} × ${max.heightMm} мм. Уменьшите ширину корпуса или высоту зеркала.`);
}

/** r5 (MOD-AI-73, FINDINGS 3317): the rounded front corners of the top. */
function cornersProblem(p: HomeProject, b: Body): void {
  const R = homeRules(p).topCorners,
    r = b.topRadiusMm as unknown;
  if (!R) throw Error('Скруглённые углы крышки доступны только в конструкции r5.');
  if (typeof r !== 'number' || !Number.isFinite(r) || r < R.radiusMm.min || r > R.radiusMm.max) throw Error(`Радиус углов крышки — от ${R.radiusMm.min} до ${R.radiusMm.max} мм.`);
  if (2 * r > Math.min(b.w, b.d)) throw Error(`Радиус ${r} мм больше половины ширины или глубины крышки: уменьшите радиус.`);
  if (b.omit?.includes('top')) throw Error('У корпуса без крышки нет углов крышки. Верните крышку.');
  if (b.rim?.sides.some((k) => k !== 'back')) throw Error('Боковой бортик доходит до переднего угла крышки: скруглить угол под ним нельзя. Уберите боковой бортик или скругление.');
}

function nicheProblem(p: HomeProject, b: Body): void {
  const o = b.omit as unknown;
  if (!homeRules(p).nichePanels) throw Error('Корпус без дна или крышки доступен только в конструкции r5.');
  if (!Array.isArray(o) || !o.length || o.some((k) => k !== 'top' && k !== 'bottom') || new Set(o).size !== o.length) throw Error('Повреждён состав панелей корпуса в нише.');
  if (b.kind === 'desk') throw Error('У стола нельзя убрать дно или крышку: крышка — это столешница.');
  if (b.base?.kind === 'wall') throw Error('Подвесной корпус держится на своих панелях: дно и крышку у него не убрать.');
  if (o.includes('bottom') && b.base) throw Error('Без дна корпус стоит на подпятниках: цоколь и ножки держат дно. Выберите подпятники.');
  if (hdfBackOf(p, b)) throw Error('Задняя стенка ХДФ держится в четверти дна и крышки: без них выберите заднюю стенку из плиты или без неё.');
}

/** r5 (MOD-AI-73, FINDINGS 3320): a body on casters — of the rule set r5, not a desk, of the height of the caster of the catalogue. */
function castersProblem(p: HomeProject, hw: HardwareCatalogs, b: Body): void {
  const q = b.base as { kind: string; heightMm?: unknown };
  if (!homeRules(p).casters) throw Error('Колёса доступны только в конструкции r5.');
  if (b.kind === 'desk')
    throw Error(`Стол не ставится на колёса: под ${pedestalRight(b) ? 'левой' : 'правой'} боковиной нет дна, колесо не к чему крепить. Выберите подпятники или цоколь.`);
  const c = homeCasters(p, hw, b);
  if (!c) throw Error('В каталоге фурнитуры нет пары колёс с тормозом и без.');
  if (Object.keys(q).sort().join(',') !== 'heightMm,kind' || q.heightMm !== c.heightMm) throw Error('Повреждено основание на колёсах.');
}
