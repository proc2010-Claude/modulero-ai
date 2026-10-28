// Кухня на стенде: правки договора (EXCHANGE_SPEC.md §4.1) → функции ядра modulero-next и сводка
// «в объёме экрана» (§5 п. 3–4). Стенд ничего не считает: размеры, состав, отказы и цена — ответы ядра.
import type { Core } from './engine.ts';

export type KitchenProject = Record<string, unknown>;
export type Edit = { op: string } & Record<string, unknown>;
export type EditResult = { ok: true; project: KitchenProject; notice?: string } | { ok: false; problem: string };

const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Одна правка кухни — ровно одна функция ядра (§4.1). */
export function applyKitchenEdit(c: Core, p: KitchenProject, e: Edit): EditResult {
  const { K, HW } = c;
  switch (e.op) {
    case 'set_room':
      return K.setKitchenRoom(p, HW, e.key, e.value);
    case 'set_type':
      return K.setKitchenType(p, HW, e.type);
    case 'set_orientation':
      return K.setKitchenOrientation(p, HW, e.orientation);
    case 'set_island':
      return K.setKitchenIsland(p, e.on);
    case 'add_module':
      return K.addKitchenModuleTo(p, HW, e.card, defined({ wall: opt(e.wall), pos: opt(e.pos), width: opt(e.width) }));
    case 'update_module':
      return K.updateKitchenModule(p, HW, e.id, defined({ wall: opt(e.wall), pos: opt(e.pos), width: opt(e.width), depth: opt(e.depth), height: opt(e.height), floor: opt(e.floor) }));
    case 'remove_module':
      return K.removeKitchenModule(p, HW, e.id);
    case 'set_material':
      return e.module_id ? K.setKitchenModuleMaterial(p, HW, e.module_id, e.role, e.code) : K.setKitchenMaterial(p, HW, e.role, e.code);
    case 'set_facade_material':
      return K.setKitchenFacadeChoice(p, HW, defined({ materialId: e.material_id, executionId: opt(e.execution_id), colorText: opt(e.color_text) }));
    case 'set_option':
      return K.setKitchenOption(p, HW, e.key, e.value);
    case 'add_obstacle':
      return K.addKitchenObstacle(p, HW, defined({ type: e.type, wall: e.wall, pos: e.pos, width: e.width, floor: opt(e.floor), height: opt(e.height) }));
    case 'remove_obstacle':
      return K.removeKitchenObstacle(p, HW, e.id);
    case 'set_include_appliances':
      return K.setKitchenIncludeAppliances(p, e.on);
    default:
      throw new Error(`Нет правки кухни «${e.op}».`);
  }
}

/** Стартовая кухня: пустая или пример конструктора (straight, l, u, island). */
export function startKitchen(c: Core, template: string | null): EditResult {
  const p = c.K.newKitchenProject();
  if (!template || template === 'empty') return { ok: true, project: p, notice: 'Новая кухня: помещение 3000 × 2600 × 2500 мм не подтверждено, модулей нет.' };
  return c.K.kitchenExampleProject(p, c.HW, template);
}

/**
 * Название стены для человека по её линии на плане ядра (kitchenPlan: стена A — дальняя, x вдоль неё слева направо).
 * Имя стены из ядра (canonicalWall) путает: в прямой кухне стена A подписана «B» — задача MOD-AI-3.
 */
function wallTitle(line: number[], roomWidth: number): string {
  const [x1, y1, x2, y2] = line;
  if (y1 === 0 && y2 === 0) return 'основная стена';
  if (x1 === 0 && x2 === 0) return 'стена слева';
  if (x1 === roomWidth && x2 === roomWidth) return 'стена справа';
  return 'стена';
}

export interface KitchenView {
  revision: string;
  state: Record<string, unknown>;
  price: Record<string, unknown>;
  warnings: string[];
  previewSvg: string | null;
  plan: any;
  elevations: any[];
  /** Детали 3D-сцены ядра (sceneOf графа) для вида на странице: размещение и размеры как в конструкторе. */
  scene3d: Scene3dView;
}

/** Деталь сцены: начало, оси u, v, n, размер вдоль них, контур в плоскости u, v, поверхность, стекло, роль. */
export interface Scene3dPart {
  o: number[];
  u: number[];
  v: number[];
  n: number[];
  s: number[];
  c: number[][] | null;
  f: string;
  g?: 1;
  r: string;
  name: string;
}

export interface Scene3dView {
  room: { width: number; depth: number; height: number };
  /** Стены плана [x1, y1, x2, y2] в осях сцены. */
  walls: number[][];
  parts: Scene3dPart[];
}

/** Условия мебельщика в словах цены: проценты сборки, наценка (MOD-DEC-497). */
const TERMS = /наценк|\d\s*%/i;

/** Граф, версия, сводка, цена и замечания проекта — всё из ядра. */
export function kitchenView(c: Core, p: KitchenProject): KitchenView {
  const { K, HW } = c;
  const scene = K.kitchenSceneOf(p, HW),
    graph = c.kitchenGraph(scene),
    out = K.kitchenOutputs(graph, scene),
    plan = K.kitchenPlan(p, HW),
    decors = new Map<string, string>(K.kitchenDecors(HW).map((d: any) => [d.code, d.label]));
  const decor = (code: unknown) => (code ? (decors.get(String(code)) ?? String(code)) : null);
  const facadeChoice = K.kitchenFacadeChoiceOf(p, HW);
  const modules = scene.modules.map((m: any) => {
    const v = plan.modules.find((x: any) => x.id === m.id);
    return defined({
      id: m.id,
      card: m.catalogId,
      name: m.name ?? m.catalogId,
      kind: m.kind,
      wall: v?.wall ?? null,
      pos: v?.free ? undefined : m.pos,
      width: m.width,
      depth: m.depth,
      height: m.height,
      floor: m.floor,
      corpus: m.corpusMaterial ? decor(m.corpusMaterial) : undefined,
      facade: m.facadeMaterial ? decor(m.facadeMaterial) : undefined,
    });
  });
  const sceneError: string | null = K.kitchenSceneError(scene);
  const state = {
    kind: 'kitchen',
    room: { ...plan.room },
    room_confirmed: !!scene.roomConfirmed,
    type: scene.typeConfirmed ? scene.type : null,
    orientation: scene.type === 'l' ? scene.orientation : null,
    island: !!scene.islandEnabled,
    walls: plan.walls.map((w: any) => ({ id: w.id, title: wallTitle(w.line, plan.room.width), lengthMm: w.lengthMm })),
    modules,
    obstacles: K.kitchenObstacles(p, HW).map((o: any) => ({ id: o.id, type: o.type, wall: o.wall, pos: o.pos, width: o.width, heights: o.heights })),
    materials: {
      corpus: decor(p.corpusMaterial),
      facade: decor(p.facadeMaterial),
      facade_material: facadeChoice ? `${facadeChoice.materialTitle} · ${facadeChoice.executionTitle}${facadeChoice.colorText ? ', ' + facadeChoice.colorText : ''}` : null,
    },
    parts: graph.parts.length,
  };
  // Полоса цены конструктора (MOD-DEC-247, 497): сумма, известная часть, статус, чего не хватает. Без себестоимости и ставок.
  const pr = out.price;
  const missing = (pr.missing as string[]).filter((m) => !TERMS.test(m));
  const price = {
    status: pr.status,
    amount_rub: pr.amount,
    known_amount_rub: pr.knownAmount,
    currency: pr.currency,
    missing,
    // Строки «чего не хватает» с процентами сборки и наценки мебельщика — условия мебельщика, не экран человека (MOD-DEC-497, (Д)).
    terms_hidden: pr.missing.length - missing.length,
    unpriced_rows: pr.unpriced,
    appliances_included: !!K.kitchenOptionsView(p, HW).appliances?.include,
  };
  const warnings = [...K.kitchenObstacleWarnings(p, HW).map((w: any) => w.text), ...(sceneError ? [sceneError] : [])];
  const elevations = plan.walls.map((w: any) => ({ title: wallTitle(w.line, plan.room.width), ...K.kitchenWallElevation(p, HW, w.id) }));
  return { revision: out.revision, state, price, warnings, previewSvg: c.previewSvg(graph), plan, elevations, scene3d: scene3dOf(c, graph, plan) };
}

/** Справочники для get_options (§4): из ядра и выпуска каталога, без цен, ставок и номеров правил. */
export function kitchenOptions(c: Core, topic: string): unknown {
  const { K, HW } = c;
  switch (topic) {
    case 'limits':
      return {
        room_mm: { ...K.KITCHEN_ROOM_LIMITS },
        default_widths_mm: [...K.KITCHEN_DEFAULT_WIDTHS],
        types: K.KITCHEN_TYPES.map(([id, name]: [string, string]) => ({ id, name })),
        options: Object.entries(K.KITCHEN_OPTIONS).map(([key, o]: [string, any]) => ({ key, label: o.label, default: o.fallback, min: o.min, max: o.max })),
      };
    case 'kitchen_cards':
      return K.KITCHEN_PALETTE.map((g: any) => ({
        group: g.name,
        cards: g.cards.map((card: any) => {
          const full = c.cards[card.id] ?? {};
          return defined({ id: card.id, name: card.name, kind: card.kind, width: full.width, widths: full.choices, hint: card.hint, needs_tall_below: card.requiresSupport });
        }),
      }));
    case 'decors':
      return K.kitchenDecors(HW).map((d: any) => ({ code: d.code, label: d.label, group: d.group }));
    case 'facade_materials':
      return HW.facades.materials.map((m: any) => ({
        id: m.id,
        title: m.title,
        made: m.supply === 'MANUFACTURE' ? 'изготавливается из плиты декора' : 'готовые покупные',
        color: m.color === 'BOARD_DECOR' ? 'декор плиты' : m.color === 'SPECIES' ? 'порода шпона словами' : 'код цвета словами',
        executions: m.executions.map((e: any) => ({ id: e.id, title: e.title })),
      }));
    case 'obstacle_types':
      return K.KITCHEN_OBSTACLE_TYPES.map((t: any) => ({ id: t.id, name: t.name, needs_floor_and_height: t.measured }));
    default:
      return null;
  }
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * 3D-сцена ядра в компактном виде для страницы: только размещение деталей (sceneOf), без пересчёта.
 * План кухни отсчитывает y от основной стены, а сцена — от передней кромки комнаты: y сцены = глубина − y плана.
 */
function scene3dOf(c: Core, graph: any, plan: any): Scene3dView {
  const sc = c.sceneOf(graph),
    D = plan.room.depth;
  return {
    room: { width: plan.room.width, depth: D, height: plan.room.height },
    walls: plan.walls.map((w: any) => [w.line[0], D - w.line[1], w.line[2], D - w.line[3]]),
    parts: sc.parts.map((p: any) => ({
      o: p.originMm.map(r1),
      u: p.uAxis,
      v: p.vAxis,
      n: p.nAxis,
      s: p.sizeMm.map(r1),
      c: p.contourMm ? p.contourMm.map((q: number[]) => q.map(r1)) : null,
      f: p.decorId?.startsWith('WORKTOP') ? 'WORKTOP' : p.surface,
      ...(p.glass ? { g: 1 as const } : {}),
      r: p.role,
      name: p.name,
    })),
  };
}
