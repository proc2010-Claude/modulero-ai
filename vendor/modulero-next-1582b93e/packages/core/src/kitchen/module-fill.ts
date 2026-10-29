// The fill and the fronts of one kitchen module (task U4 after #263 and #271, FINDINGS 663–666): the stages
// «Наполнение» and «Фасады» of the prototype for the selected module (kflowPanel, r1.html:70293, with its layers
// k5 71154, k7 71452, k32 71741, kp 72540, kre 74018, kcr 76092, kap 78120) and their edits (kflowEdit r1.html:70385,
// k32Command 71597, the change handlers 70445, 71496, 74030, 76117, 78145). Every edit goes through the one check of
// K3/K4 (validateKitchenModule) and is refused with the prototype's words; the module keeps its place and its id.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Rec } from '../engine/policy/project-state.js';
import { s32AddShelf, s32Q } from '../engine/policy/system32.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { wardrobeDrawers } from '../engine/policy/wardrobe-drawers.js';
import { APPLIANCE_PROFILES, applianceSelections, cornerGaps, frontGap, frontSeam, hasFront, isAppliance, isApplianceBay, isConstruction, isPlace, knownFrontType, overlaySink, ownAppliance, shelfAboveAxis, shelfItems, supported } from './carcass.js';
import { derived, system32Policy } from './derived.js';
import { levelRunner } from './drawer-runner.js';
import { LIFT_TIERS } from './lift.js';
import { appliancePlaceOf, PLACE_FIELDS, setKitchenAppliancePlace } from './place.js';
import { kitchenProjectOfScene, kitchenSceneOf, type KitchenEdit } from './editor.js';
import { validateKitchenModule, withCutout } from './modules.js';
import type { KitchenProject } from './project.js';
import { isAccessL, isDiagonal, isFree, isLegacyCorner, isSingleCorner, type KitchenScene } from './room.js';
import { jsonClone } from '../engine/json-clone.js';

const clone = jsonClone;
const no = (problem: string): KitchenEdit => ({ ok: false, problem });
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const TANDEM = 'BLUM-TANDEM560H5000B-WOOD16';
const BOX = wardrobeDrawers.constants;
const K = kitchen.constants;

/** One control of the panel of a module: a number, a choice or a check, with the value the calculation reads. */
export interface KitchenModuleField {
  key: string;
  label: string;
  kind: 'number' | 'select' | 'check';
  value: number | string | boolean;
  options?: [string, string][];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

/** A shelf of the module: its level from the bottom of the cavity and whether it is fixed (k7). */
export interface KitchenShelfView {
  id: string;
  levelMm: number;
  fixed: boolean;
  /** Where the calculation put the shelf when its axis is off the grid of System 32 (KF-08, FINDINGS 325); else null. */
  placedMm: number | null;
}

/** The stage «Наполнение» of the selected module. */
export interface KitchenModuleFill {
  moduleId: string;
  /** null — the module has calculated geometry; else why its fill is not edited (the prototype's words). */
  unsupported: string | null;
  /** «m1 · чистый проём 568 × 688 × 540 мм» or the opening of an L corner. */
  clearText: string | null;
  shelves: KitchenShelfView[];
  /** «Добавить полку» is offered; the shelves are listed with their level and «Удалить». */
  canAddShelf: boolean;
  shelvesEditable: boolean;
  /** «Полка N · фиксированная» (k7): not for the single-body corner and the appliances. */
  fixedEditable: boolean;
  /** The text when there are no shelves. */
  emptyText: string;
  /** The controls of the fill: the boxes of the TANDEM drawers (kre), the construction (kcr). */
  fields: KitchenModuleField[];
  notes: string[];
}

/** The stage «Фасады» of the selected module. */
export interface KitchenModuleFront {
  moduleId: string;
  /** The line of the stage: the fronts with their sizes, or why there are none (kflowFrontSummary, r1.html:70285). */
  text: string;
  fields: KitchenModuleField[];
  notes: string[];
}

function moduleOf(s: KitchenScene, id: string): Rec | null {
  return s.modules.find((m) => m.id === id) ?? null;
}

/**
 * The niches of a tall cabinet whose bottom the user moves (MOD-AI-46, FINDINGS 3160): the oven, the microwave and the
 * coffee machine stand on a carrying shelf, so the niche goes up or down with it (the oven at the eye level). The
 * fridge stands on the bottom, the machines under the worktop on the floor, the sink and the hob in the worktop, the
 * oven under the worktop under it and the hood at the top of its cabinet: their niche stays where the model puts it.
 */
const MOVABLE_NICHE = ['oven', 'microwave', 'coffee'];
export function movableNiches(m: Rec): number[] {
  if (!isAppliance(m) || !String(m.moduleTypeId).startsWith('KT_')) return [];
  return applianceSelections(m).flatMap((a, i) => (MOVABLE_NICHE.includes(APPLIANCE_PROFILES[a.profileId]?.family) ? [i] : []));
}
/** Why a shelf of an appliance cabinet is not edited: the niche carries it, and where its bottom is changed. */
const supportFixed = (m: Rec) =>
  movableNiches(m).length
    ? 'Опора техники фиксирована монтажной нишей. Измените низ ниши полем «Низ ниши … от пола» в «Наполнении» (setKitchenApplianceNiche); исходный проект и история сохранены.'
    : 'Опора техники фиксирована монтажной нишей этой модели; исходный проект и история сохранены.';

const noShelves = (m: Rec) => isAppliance(m) || ['KW_DRYER', 'KB_BOTTLE'].includes(m.moduleTypeId) || m.catalogId === 'island-drawers' || m.drawerProfile === TANDEM;

/** The stage «Наполнение» for the module `id` (kflowPanel 'filling' with its layers). */
export function kitchenModuleFill(p: KitchenProject, hw: HardwareCatalogs, id: string): KitchenModuleFill | null {
  const s = kitchenSceneOf(p, hw),
    m = moduleOf(s, id);
  if (!m) return null;
  const base: KitchenModuleFill = { moduleId: id, unsupported: null, clearText: null, shelves: [], canAddShelf: false, shelvesEditable: false, fixedEditable: false, emptyText: 'Полок нет.', fields: [], notes: [] };
  if (isLegacyCorner(m)) return { ...base, unsupported: 'LEGACY_CORNER_VERSION: сохранённая пара только для чтения.' };
  // MOD-DEC-752 (FINDINGS 3190): the place of a freestanding appliance — its appliance and gaps, no shelves.
  if (isPlace(m)) {
    const a = appliancePlaceOf(m);
    return {
      ...base,
      clearText: `${m.id} · место ${m.width} × ${m.height} × ${m.depth} мм`,
      emptyText: 'Место свободно: деталей нет.',
      fields: Object.entries(PLACE_FIELDS).map(([key, [k, label]]) => ({ key, label, kind: 'number' as const, value: a[k], min: 0, step: 1 })),
      notes: [String(derived(s, m).note)],
    };
  }
  if (!supported(m)) return { ...base, unsupported: 'Для этого типа комплектация пока не подтверждена. Соседние обычные корпуса доступны.' };
  const d = derived(s, m),
    t = m.panelThickness ?? 16,
    list = shelfItems(m),
    appliance = isAppliance(m);
  const clearText = isAccessL(m)
    ? `Геометрическое открытие плеч ${m.width - m.depth - t} / ${m.cornerReturn - m.depth - t} мм; высота между крышками ${m.height - 2 * t} мм. Чистая полость имеет Г-образный контур.`
    : d.clear
      ? `${m.id} · чистый проём ${Object.values(d.clear).map((x) => String(x).replace('.', ',')).join(' × ')} мм`
      : null;
  const fields: KitchenModuleField[] = [],
    notes: string[] = [];
  if (m.drawerProfile === TANDEM) {
    // kre (r1.html:74018): the boxes of the drawers.
    fields.push(
      { key: 'drawerSeam', label: 'Шов между фасадами, мм', kind: 'number', value: m.frontSeam ?? 3, min: 0 },
      // The height of the box is the wardrobe's, 80–320 mm (MOD-DEC-341, 565; FINDINGS 1182); the prototype's field had 90.
      { key: 'sideHeightMm', label: 'Высота боковины, мм', kind: 'number', value: d.drawerDesign?.sideHeightMm ?? m.drawerDesign?.sideHeightMm ?? 0, min: BOX.boxHeightMin.value, max: BOX.boxHeightMax.value },
    );
    // The bottom of the box of the kit of the runner of the level stands as the kit puts it (MOD-DEC-514, FINDINGS 1863).
    if (!levelRunner(m))
      fields.push({
        key: 'bottomRecessMm',
        label: 'Утопление дна, мм',
        kind: 'select',
        value: String(m.drawerDesign?.bottomRecessMm ?? 13),
        options: [12, 13, 14, 15].map((v) => [String(v), String(v)] as [string, string]),
      });
  }
  if (isConstruction(m)) {
    // kcr (r1.html:76092): the construction of the fill.
    if (d.note) notes.push(String(d.note));
    if (m.moduleTypeId === 'KT_COMBINED') fields.push({ key: 'drawerTop', label: 'Верх нижних ящиков от пола, мм', kind: 'number', value: m.drawerTop ?? 900 });
    if (m.moduleTypeId === 'KW_DRYER') {
      const levels = m.dryerLevels ?? [96, 466];
      fields.push(
        { key: 'dryerLevel0', label: 'Нижний уровень сушки, мм от низа полости', kind: 'number', value: levels[0] },
        { key: 'dryerLevel1', label: 'Верхний уровень сушки, мм от низа полости', kind: 'number', value: levels[1] },
        { key: 'plateHeightMm', label: 'Высота тарелки, мм', kind: 'number', value: m.plateHeightMm ?? 320 },
        { key: 'cupHeightMm', label: 'Высота чашки, мм', kind: 'number', value: m.cupHeightMm ?? 160 },
      );
    }
  }
  // MOD-DEC-753 (FINDINGS 3193): the sink of a wall sink cabinet is inset in the worktop or laid on the cabinet.
  if (sinkMountable(m))
    fields.push({ key: 'sinkMount', label: 'Монтаж мойки', kind: 'select', value: overlaySink(m) ? 'overlay' : 'inset', options: SINK_MOUNTS.map((v) => [v, SINK_MOUNT_TEXT[v]] as [string, string]) });
  if (isApplianceBay(m)) notes.push('Ниша под технику: чистый проём и опорные панели столешницы рассчитаны; свободная сторона закрывается панелью 18 мм от пола до столешницы.');
  // MOD-AI-46 (FINDINGS 3160): the bottom of the niche of an oven, a microwave or a coffee machine in a tall cabinet, from the floor.
  for (const i of movableNiches(m)) {
    const a = applianceSelections(m)[i]!;
    fields.push({ key: 'nicheBottom' + i, label: `Низ ниши «${a.model ?? APPLIANCE_PROFILES[a.profileId]?.family}» от пола, мм`, kind: 'number', value: (m.floor || 0) + a.nicheBottomZ, step: 1 });
  }
  if (appliance)
    // kap (r1.html:78128): the supports of the appliance belong to its niche.
    // The section «Техника и монтаж» of r1 is not on the screen yet (a stub of the bell): the note does not send there (R6-016, FINDINGS 2003).
    notes.push(
      movableNiches(m).length
        ? 'Опоры связаны с монтажной нишей выбранной модели техники: несущая полка, полка над нишей и фасады отделений встают по низу ниши. Модель — из карточки модуля, менять её на экране пока нельзя — см. колокольчик.'
        : 'Опоры связаны с монтажной нишей выбранной модели техники: их положение задают низ и высота ниши из карточки модуля. Менять модель и нишу на экране пока нельзя — см. колокольчик.',
    );
  else if (list.some((x) => !x.fixed))
    // The prototype said here that the holding of a removable shelf is unknown (k32Panel, r1.html:71741); the kit is
    // chosen since (344): the note says which (FINDINGS 663).
    notes.push(
      system32Policy(s).enabled === true
        ? 'Съёмные полки стоят на полкодержателях уровня «Стандарт» (MOD-DEC-344); уровень полки — на сетке System 32 (MOD-DEC-193, 196).'
        : 'Съёмные полки стоят на полкодержателях уровня «Стандарт» (MOD-DEC-344); System 32 выключен — уровни в целых миллиметрах (MOD-DEC-196).',
    );
  return {
    ...base,
    clearText,
    shelves: list.map((x) => {
      const part = ((d.parts || []) as Rec[]).find((y) => y.partId === x.id && Number.isFinite(y.system32MovedFromMm));
      return { id: String(x.id), levelMm: x.levelMm, fixed: x.fixed === true, placedMm: part ? part.box[2] - t : null };
    }),
    canAddShelf: !noShelves(m),
    shelvesEditable: !appliance,
    fixedEditable: !appliance && !isSingleCorner(m),
    emptyText: m.drawerProfile === TANDEM ? 'Четыре отдельных короба; полки в зоне ящиков не добавляются.' : appliance ? 'Для выбранного режима отдельные опорные полки не требуются.' : 'Полок нет.',
    fields,
    notes,
  };
}

/** The stage «Фасады» for the module `id` (kflowPanel 'facades' with its layers). */
/** A size of a front for the screen: tenths of a millimetre, a decimal comma — «266,8», not 266.81795103863436 (R6-017, FINDINGS 2003). */
const sizeText = (v: number) => (Math.round(v * 10) / 10).toLocaleString('ru-RU');

export function kitchenModuleFront(p: KitchenProject, hw: HardwareCatalogs, id: string): KitchenModuleFront | null {
  const s = kitchenSceneOf(p, hw),
    m = moduleOf(s, id);
  if (!m) return null;
  const base = { moduleId: id, fields: [] as KitchenModuleField[], notes: [] as string[] };
  if (isLegacyCorner(m)) return { ...base, text: 'LEGACY_CORNER_VERSION: сохранённая пара только для чтения.' };
  if (!knownFrontType(m))
    return { ...base, text: 'Полная геометрия фасадов этого типа не определена. Нужны его собственные размеры, разделение фасадов или материал; один обычный фасад не подставляется.' };
  if (!hasFront({ ...m, frontEnabled: true }))
    return {
      ...base,
      text: isAccessL(m) ? 'Рассчитано геометрическое открытие Г-корпуса. Двери, их соединение, петли и ход не определены; фасад по аналогии не подставляется.' : 'Открытый корпус без фасада. Фасад и его фурнитура в состав не входят.',
    };
  const fields: KitchenModuleField[] = [{ key: 'frontEnabled', label: 'Фасад в составе', kind: 'check', value: m.frontEnabled !== false }];
  if (isSingleCorner(m)) {
    // kflowCornerControls (r1.html:70533).
    const g = cornerGaps(s, m),
      auto = m.gapMode === 'auto';
    fields.push(
      { key: 'cornerSeam', label: 'Внутренний шов, мм', kind: 'number', value: g.seam, min: 0, step: 0.5 },
      {
        key: 'gapMode',
        label: 'Внешние горизонтальные отступы',
        kind: 'select',
        value: auto ? 'auto' : 'manual',
        options: [
          ['manual', 'Вручную'],
          ['auto', 'Автоматически: шов / 2'],
        ],
      },
      { key: 'gapLeft', label: 'Слева, мм', kind: 'number', value: g.left, min: 0, step: 0.5, disabled: auto },
      { key: 'gapRight', label: 'Справа, мм', kind: 'number', value: g.right, min: 0, step: 0.5, disabled: auto },
      { key: 'gapTop', label: 'Сверху, мм', kind: 'number', value: g.top, min: 0, step: 0.5 },
      { key: 'gapBottom', label: 'Снизу, мм', kind: 'number', value: g.bottom, min: 0, step: 0.5 },
      {
        key: 'hingeSide',
        label: 'Сторона экранного открывания',
        kind: 'select',
        value: m.hingeSide === 'right' ? 'right' : 'left',
        options: [
          ['left', 'Слева'],
          ['right', 'Справа'],
        ],
      },
    );
  } else fields.push({ key: 'frontGap', label: 'Внешний зазор, мм', kind: 'number', value: frontGap(s, m), min: 0 });
  if (m.moduleTypeId === 'KB_DRAWERS') fields.push({ key: 'frontSeam', label: 'Шов между фасадами, мм', kind: 'number', value: frontSeam(m), min: 0, step: 0.5 });
  if (m.moduleTypeId === 'KW_GLASS')
    fields.push({
      key: 'glassVariant',
      label: 'Вариант витрины',
      kind: 'select',
      value: m.glassVariant || 'standalone',
      options: [
        ['standalone', 'Стекло 6 мм'],
        ['wood-frame', 'Деревянная рамка 18 мм, стекло 6 мм'],
      ],
    });
  if (m.moduleTypeId === 'KM_LIFT')
    fields.push({
      key: 'liftTier',
      label: 'Подъёмник',
      kind: 'select',
      value: m.lift === 'level' && LIFT_TIERS.includes(m.liftTier) ? m.liftTier : 'AUTO',
      options: [
        ['AUTO', 'По уровню кухни «Стандарт»'],
        ['STANDARD', '«Стандарт» — МДМ FLAP на петлях'],
        ['ECONOMY', '«Эконом» — МДМ FLAP AIR на петлях'],
        ['PREMIUM', '«Премиум» — Blum AVENTOS HK-S'],
      ],
    });
  const notes = [isSingleCorner(m) ? 'Сторона выбрана пользователем; монтажная присадка петли уточняется отдельно.' : 'Отверстия под выбранную петлю уточняет мебельщик. Экранное открывание условное; для обзора наполнения можно скрыть фасады.'];
  if (m.frontEnabled === false) return { ...base, text: 'Фасад исключён из состава', fields, notes };
  const d = derived(s, m);
  // What lifts the front now (FINDINGS 3350): FLAP of the level on hinges in the top, or HK-S and why.
  const lift = d.hardwarePlanning?.lift,
    flap = ((d.hardwarePlanning?.leaves ?? []) as Rec[]).find((x) => x.flap);
  if (m.moduleTypeId === 'KM_LIFT')
    notes.push(
      flap
        ? `Подъёмник: ${flap.flap.name} ${flap.flap.article}${flap.flap.kits === 2 ? ', пара на обе боковины' : ''}${flap.flap.temporary ? ' (временно)' : ''}, фасад на петлях ${flap.manufacturer} ${flap.hingeArticle} в верхней стенке — ${flap.quantity} шт.`
        : `Подъёмник: Blum AVENTOS HK-S.${lift?.note ? ' ' + lift.note : ''}`,
    );
  if (d.status === 'FAIL') return { ...base, text: 'Фасады не рассчитаны: ' + (d.note || 'проверьте параметры модуля.'), fields, notes };
  const fronts = ((d.parts || []) as Rec[]).filter((x) => x.materialRole === 'FACADE');
  const text = fronts.length
    ? fronts.map((x) => x.name + ' · ' + (Array.isArray(x.finished_mm) && x.finished_mm.length === 3 ? x.finished_mm.map(sizeText).join(' × ') + ' мм' : 'размеры этой детали не рассчитаны')).join('; ')
    : m.applianceMode === 'preliminary'
      ? 'Размеры фасадов появятся после выбора точной модели техники.'
      : 'В текущем расчёте фасадных деталей нет.';
  return { ...base, text, fields, notes };
}

/**
 * kflowEdit (r1.html:70385): a change of the selected module checked in the kitchen as it would be; the refusal keeps
 * the project. `change` may throw a refusal of its own (k32Edit, r1.html:71589).
 */
export function moduleEdit(p: KitchenProject, hw: HardwareCatalogs, id: string, change: (c: Rec, s: KitchenScene) => void, label: string, thrown = '. Проект не изменён.'): KitchenEdit {
  const s = kitchenSceneOf(p, hw),
    m = moduleOf(s, id);
  if (!m || isLegacyCorner(m) || !supported(m)) return no('Выберите корпус с рассчитанной геометрией.');
  const c = clone(m);
  try {
    change(c, s);
  } catch (e) {
    return no('Изменение отклонено: ' + (e instanceof Error ? e.message : String(e)) + thrown);
  }
  const v = validateKitchenModule(s, c, m.id);
  if (!v.ok) return no('Изменение отклонено: ' + v.text + ' Исходный проект сохранён.');
  return { ok: true, project: kitchenProjectOfScene({ ...s, modules: s.modules.map((x) => (x.id === id ? c : x)) }), notice: label, selected: id };
}

const S32_DONE = 'System32: геометрия выбранного модуля пересчитана';

/** «Добавить полку» (k32Command 'add', r1.html:71611): the next free level of the grid above the last shelf (MOD-DEC-193, 196). */
export function addKitchenShelf(p: KitchenProject, hw: HardwareCatalogs, id: string): KitchenEdit {
  const m = kitchenSceneOf(p, hw).modules.find((x) => x.id === id);
  if (m && noShelves(m)) return no(m.drawerProfile === TANDEM ? 'Четыре отдельных короба; полки в зоне ящиков не добавляются.' : 'Полки в этом модуле не добавляются: его наполнение задаёт механизм или техника.');
  return moduleEdit(
    p,
    hw,
    id,
    (c, s) => {
      c.shelfItems = shelfItems(c).map((x) => ({ ...x }));
      const t = c.panelThickness ?? 16,
        on = system32Policy(s).enabled === true,
        world = c.floor + t,
        above = shelfAboveAxis(s, t);
      // The button of the prototype passed no axis, and with System 32 on (196) it refused every shelf: «ось UNKNOWN».
      // The removable kitchen shelf stands on the kit of «Стандарт» (344, 193), whose axis is known: the shelf goes on
      // the grid by it (FINDINGS 663). Without a kit the refusal stays; with System 32 off — whole millimetres.
      if (on && above === null) throw Error('Нет явной привязки полки к профилю: ось этого узла UNKNOWN; существующая ось SEKURA6 −8 мм известна');
      const a = on ? -above! : 0,
        prev = c.shelfItems.at(-1);
      let r;
      try {
        r = s32AddShelf(
          {
            z0: c.floor + t / 2,
            t,
            axis_from_lower: a,
            bounds: [world, c.floor + c.height - t],
            previous_axis: prev ? world + prev.levelMm + (prev.fixed === true ? t / 2 : a) : null,
            obstacles: c.shelfItems.map((x: Rec) => [world + x.levelMm, world + x.levelMm + t]),
          },
          on,
        );
      } catch (e) {
        // The code of the grid in words (Д, FINDINGS 663); the prototype showed the code.
        if (e instanceof Error && e.message === 'NO_VALID_LEVEL_ABOVE_THRESHOLD')
          throw Error('над последней полкой нет свободного уровня: первая полка — при чистом проёме не меньше 400 мм над дном, следующая — на 256 мм выше предыдущей (MOD-DEC-193)');
        throw e;
      }
      let n = 1;
      while (c.shelfItems.some((x: Rec) => x.id === c.id + ':shelf:' + n)) n++;
      c.shelfItems.push({ id: c.id + ':shelf:' + n, levelMm: r.lower - world, fixed: false, system32New: true, profileReadiness: 'UNBOUND_EXISTING_PROFILE' });
      // The prototype wrote c.fill.shelves of a module without `fill` and failed; the count is kept here (Д, FINDINGS 663).
      (c.fill ??= {}).shelves = c.shelfItems.length;
    },
    S32_DONE,
  );
}

/** «Удалить» of a shelf (kRemoveShelf, r1.html:70440). */
export function removeKitchenShelf(p: KitchenProject, hw: HardwareCatalogs, id: string, shelfId: string): KitchenEdit {
  const m = kitchenSceneOf(p, hw).modules.find((x) => x.id === id);
  if (m && isAppliance(m)) return no(supportFixed(m));
  return moduleEdit(
    p,
    hw,
    id,
    (c) => {
      if (!shelfItems(c).some((x) => x.id === shelfId)) throw Error('Полка не найдена');
      c.shelfItems = shelfItems(c).filter((x) => x.id !== shelfId);
      (c.fill ??= {}).shelves = c.shelfItems.length;
    },
    'Полка удалена',
  );
}

/**
 * The level of a shelf from the bottom of the cavity (the change of data-k-shelf, r1.html:71671; k32Move 'exact',
 * 71561): whole millimetres with System 32 off (MOD-DEC-196), the check of the module after the move.
 */
export function setKitchenShelfLevel(p: KitchenProject, hw: HardwareCatalogs, id: string, shelfId: string, levelMm: number): KitchenEdit {
  const s = kitchenSceneOf(p, hw),
    m = moduleOf(s, id);
  if (m && isAppliance(m)) return no(supportFixed(m));
  if (!m || !shelfItems(m).some((x) => x.id === shelfId) || !finite(levelMm)) return no('Введите числовую высоту полки. Исходное положение и история сохранены.');
  return moduleEdit(
    p,
    hw,
    id,
    (c) => {
      c.shelfItems = shelfItems(c).map((x) => ({ ...x }));
      const t = c.panelThickness ?? 16,
        on = system32Policy(s).enabled === true,
        value = c.floor + 2 * t + levelMm,
        x = c.shelfItems.find((y: Rec) => y.id === shelfId);
      if (!on && !Number.isInteger(value)) throw Error('OFF: введите целые миллиметры; исходное положение сохранено');
      x.levelMm = s32Q(value - (c.floor + t) - t);
    },
    S32_DONE,
  );
}

/** The shelves read alike: the same fields and values, an unfixed shelf with or without `fixed: false`. */
function sameShelves(a: Rec[], b: Rec[]): boolean {
  const plain = (list: Rec[]) => JSON.stringify(list.map((x) => Object.entries(x).filter(([k, v]) => v !== undefined && !(k === 'fixed' && v === false)).sort(([k], [l]) => (k < l ? -1 : 1))));
  return plain(a) === plain(b);
}

/** «Полка N · фиксированная» (k7Fixed, r1.html:71498). */
export function setKitchenShelfFixed(p: KitchenProject, hw: HardwareCatalogs, id: string, shelfId: string, fixed: boolean): KitchenEdit {
  const m = kitchenSceneOf(p, hw).modules.find((x) => x.id === id);
  if (m && isAppliance(m)) return no(supportFixed(m));
  return moduleEdit(
    p,
    hw,
    id,
    (c) => {
      // R4-014 (Д, FINDINGS 1890): only the `fixed` of the chosen shelf changes, the stored list keeps the rest as it was.
      // The prototype stored the shelves as shelfItems reads them (the SEKURA axis and readiness written in), and a shelf
      // fixed and unfixed again gave another ProjectRevision of the same kitchen. The reading is the same either way.
      const listed = Array.isArray(c.shelfItems),
        own = shelfItems({ ...c, shelfItems: undefined }),
        // A module without a list: no field, or null as a new module of these types has it (kcr, r1.html:74083).
        none = !listed ? c.shelfItems : ['KB_COMBINED', 'KT_COMBINED', 'KW_GLASS'].includes(c.moduleTypeId) || isAccessL(c) || isDiagonal(c) ? null : undefined;
      c.shelfItems = (listed ? c.shelfItems : own).map((x: Rec) => (x.id === shelfId ? { ...x, fixed } : x));
      // Shelves that are the module's own again are not kept as a list: the project is as before the first change.
      if (sameShelves(c.shelfItems, own)) {
        if (none === undefined) delete c.shelfItems;
        else c.shelfItems = none;
      }
    },
    'Тип выбранной полки изменён явно.',
  );
}

/** The fields of the panels and what each changes, with the prototype's label of the change. */
const FIELDS: Record<string, { label: string; set: (c: Rec, v: number | string | boolean) => void; kind: 'number' | 'select' | 'check'; options?: string[] }> = {
  // kflow (r1.html:70484): the front of a module.
  frontEnabled: { label: 'Параметр детали изменён', kind: 'check', set: (c, v) => (c.frontEnabled = v) },
  frontGap: { label: 'Параметр детали изменён', kind: 'number', set: (c, v) => (c.frontGap = v) },
  frontSeam: { label: 'Параметр детали изменён', kind: 'number', set: (c, v) => (c.frontSeam = v) },
  // kc (r1.html:70478): the front of the single-body corner.
  cornerSeam: { label: 'Параметры углового фасада изменены', kind: 'number', set: (c, v) => (c.frontSeam = v) },
  gapMode: { label: 'Параметры углового фасада изменены', kind: 'select', options: ['manual', 'auto'], set: (c, v) => (c.gapMode = v) },
  gapLeft: { label: 'Параметры углового фасада изменены', kind: 'number', set: (c, v) => (c.gapLeft = v) },
  gapRight: { label: 'Параметры углового фасада изменены', kind: 'number', set: (c, v) => (c.gapRight = v) },
  gapTop: { label: 'Параметры углового фасада изменены', kind: 'number', set: (c, v) => (c.gapTop = v) },
  gapBottom: { label: 'Параметры углового фасада изменены', kind: 'number', set: (c, v) => (c.gapBottom = v) },
  hingeSide: { label: 'Параметры углового фасада изменены', kind: 'select', options: ['left', 'right'], set: (c, v) => (c.hingeSide = v) },
  // kre (r1.html:74030): the boxes of the TANDEM drawers.
  drawerSeam: { label: 'Размеры коробов изменены', kind: 'number', set: (c, v) => (c.frontSeam = v) },
  sideHeightMm: { label: 'Размеры коробов изменены', kind: 'number', set: (c, v) => (c.drawerDesign = { ...c.drawerDesign, sideHeightMm: v }) },
  bottomRecessMm: { label: 'Размеры коробов изменены', kind: 'select', options: ['12', '13', '14', '15'], set: (c, v) => (c.drawerDesign = { ...c.drawerDesign, bottomRecessMm: Number(v) }) },
  // kcr (r1.html:76117): the constructions.
  glassVariant: {
    label: 'Конструкция пересчитана',
    kind: 'select',
    options: ['standalone', 'wood-frame'],
    set: (c, v) => {
      c.glassVariant = v;
      c.frontThickness = v === 'standalone' ? 6 : 18;
    },
  },
  drawerTop: { label: 'Конструкция пересчитана', kind: 'number', set: (c, v) => (c.drawerTop = v) },
  dryerLevel0: { label: 'Конструкция пересчитана', kind: 'number', set: (c, v) => (c.dryerLevels = [v, (c.dryerLevels ?? [96, 466])[1]]) },
  dryerLevel1: { label: 'Конструкция пересчитана', kind: 'number', set: (c, v) => (c.dryerLevels = [(c.dryerLevels ?? [96, 466])[0], v]) },
  plateHeightMm: { label: 'Конструкция пересчитана', kind: 'number', set: (c, v) => (c.plateHeightMm = v) },
  cupHeightMm: { label: 'Конструкция пересчитана', kind: 'number', set: (c, v) => (c.cupHeightMm = v) },
  // MOD-DEC-413 (FINDINGS 3350): the lift of the level of a front that opens upwards; AUTO — the level by default (223).
  liftTier: {
    label: 'Подъёмник фасада изменён',
    kind: 'select',
    options: ['AUTO', ...LIFT_TIERS],
    set: (c, v) => {
      if (c.moduleTypeId !== 'KM_LIFT') throw Error('подъёмник выбирается у модуля с подъёмным фасадом');
      c.lift = 'level';
      if (v === 'AUTO') delete c.liftTier;
      else c.liftTier = v;
    },
  },
};

/**
 * The bottom of the niche `index` of a tall appliance cabinet, mm from the floor (MOD-AI-46, FINDINGS 3160): the oven at
 * the eye level. The niche keeps its height; the carrying shelf, the shelf over the niche and the fronts of the
 * compartments follow it, the model's checks of the niche (the carrying shelf, the top, the 850 mm of the microwave,
 * the niches apart) decide. The prototype fixed the niche of the card (750 / 1356 mm from the bottom of the cabinet).
 */
export function setKitchenApplianceNiche(p: KitchenProject, hw: HardwareCatalogs, id: string, index: number, bottomFromFloorMm: number): KitchenEdit {
  const m = moduleOf(kitchenSceneOf(p, hw), id);
  if (!m) return no(`Нет модуля ${id}.`);
  const movable = movableNiches(m);
  if (!movable.length) return no('Низ ниши меняется у духовки, микроволновки и кофемашины в пенале; у этой техники ниша фиксирована моделью. Исходный проект сохранён.');
  if (!movable.includes(index)) return no(`У модуля ${id} ниши с номером ${index} нет; низ меняется у ниш ${movable.join(', ')}. Исходный проект сохранён.`);
  if (!Number.isInteger(bottomFromFloorMm)) return no('Низ ниши — целые миллиметры от пола. Исходный проект сохранён.');
  return moduleEdit(
    p,
    hw,
    id,
    (c) => {
      const as = applianceSelections(c).map((a) => ({ ...a }));
      as[index]!.nicheBottomZ = bottomFromFloorMm - (c.floor || 0);
      c.appliances = as;
    },
    `Низ ниши — ${bottomFromFloorMm} мм от пола; опоры и фасады отделений пересчитаны`,
    '. Исходный проект сохранён.',
  );
}

const SINK_MOUNTS = ['inset', 'overlay'] as const;
const SINK_MOUNT_TEXT: Record<(typeof SINK_MOUNTS)[number], string> = { inset: 'врезная', overlay: 'накладная' };
/** The wall sink cabinet: its sink is inset or laid on it (MOD-DEC-753); the sink of an island is inset. */
const sinkMountable = (m: Rec) => m.moduleTypeId === 'KB_SINK' && !isFree(m);

/**
 * «Монтаж мойки» of a wall sink cabinet (MOD-AI-60, MOD-DEC-753, FINDINGS 3193): 'inset' — the sink in the cutout of the
 * worktop (the catalogue's model, or the user's cutout, MOD-DEC-412); 'overlay' — the sink laid on the cabinet in place
 * of its worktop, as wide as the cabinet and 600 deep, bought without a price. The prototype had the inset sink alone.
 */
export function setKitchenSinkMount(p: KitchenProject, hw: HardwareCatalogs, id: string, mount: string): KitchenEdit {
  const m = moduleOf(kitchenSceneOf(p, hw), id);
  if (!m) return no(`Нет модуля ${id}.`);
  if (!sinkMountable(m)) return no('«Монтаж мойки» выбирается у шкафа под мойку у стены; у островной мойки — врезная. Исходный проект сохранён.');
  if (!(SINK_MOUNTS as readonly string[]).includes(mount)) return no('Монтаж мойки: врезная (inset) или накладная (overlay). Исходный проект сохранён.');
  const overlay = mount === 'overlay',
    depth = K.overlaySinkDepth.value;
  if (overlay === overlaySink(m)) return no(`Мойка «${m.name}» (${id}) уже ${SINK_MOUNT_TEXT[mount as 'inset' | 'overlay']}. Исходный проект сохранён.`);
  return moduleEdit(
    p,
    hw,
    id,
    (c) => {
      if (overlay) {
        delete c.cutout;
        c.sinkMount = 'overlay';
        c.appliances = ownAppliance(c);
        c.applianceModel = null;
        c.applianceMode = 'own';
      } else {
        delete c.sinkMount;
        withCutout(c, null);
      }
    },
    overlay
      ? `Мойка накладная: ${m.width} × ${depth} мм на корпусе вместо столешницы, столешницы соседей кончаются у неё. Модель и цена мойки не выбраны — цена кухни неполная`
      : 'Мойка врезная: столешница над шкафом с вырезом под мойку каталога',
    '. Исходный проект сохранён.',
  );
}

/**
 * A control of the panels «Наполнение» and «Фасады» (KitchenModuleField.key). A number must be finite (the kcr layer's
 * words for every field, Д: the prototype passed NaN of an empty field to its check, FINDINGS 664).
 */
export function setKitchenModuleField(p: KitchenProject, hw: HardwareCatalogs, id: string, key: string, value: number | string | boolean): KitchenEdit {
  const niche = /^nicheBottom(\d)$/.exec(key);
  if (niche) return finite(value) ? setKitchenApplianceNiche(p, hw, id, Number(niche[1]), value) : no('Изменение отклонено: Введите конечное числовое значение. Исходный проект сохранён.');
  if (key === 'sinkMount') return setKitchenSinkMount(p, hw, id, String(value));
  const place = PLACE_FIELDS[key];
  if (place) return finite(value) ? setKitchenAppliancePlace(p, hw, id, { [place[0]]: value }) : no('Изменение отклонено: Введите конечное числовое значение. Исходный проект сохранён.');
  const f = FIELDS[key];
  if (!f) return no(`Нет поля «${key}».`);
  if (f.kind === 'number' && !finite(value)) return no('Изменение отклонено: Введите конечное числовое значение. Исходный проект сохранён.');
  if (f.kind === 'check' && typeof value !== 'boolean') return no(`Поле «${key}»: да или нет.`);
  if (f.kind === 'select' && !f.options!.includes(String(value))) return no(`Поле «${key}»: ${f.options!.join(', ')}.`);
  if (key === 'sideHeightMm' && ((value as number) < BOX.boxHeightMin.value || (value as number) > BOX.boxHeightMax.value))
    return no(`Высота короба ящика — от ${BOX.boxHeightMin.value} до ${BOX.boxHeightMax.value} мм, как у шкафа (MOD-DEC-565). Исходный проект сохранён.`);
  return moduleEdit(p, hw, id, (c) => f.set(c, f.kind === 'select' ? String(value) : value), f.label, '. Исходный проект сохранён.');
}
