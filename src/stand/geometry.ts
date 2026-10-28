// Геометрия деталей для state — одна форма у кухни, шкафа, купе и другой мебели: высоты от пола и толщины
// из 3D-сцены ядра (engine.sceneOf), той же, что видит конструктор. Стенд только выбирает детали группы
// (модуль, секция, корпус) по их id и ролям ядра и округляет до десятых; размеров он не считает.
// Форма краткая (ответ turn не раздуваем): `z` — [низ, верх] детали от пола, `t` — толщина; пустых списков нет.

/** Деталь по высоте: [низ, верх] от пола и толщина — размер детали по её нормали (sizeMm[2] ядра), мм. */
export interface PartZ {
  z: [number, number];
  t: number;
}

type Item = { id: string } & PartZ & Record<string, unknown>;

/** Геометрия группы: дно и верх корпуса, полки, ящики (фасад и короб), фасады; нет ключа — нет таких деталей. */
export interface Geometry {
  bottom?: PartZ;
  top?: PartZ;
  shelves?: Item[];
  /** Ящик: `z` и `t` — его фасада, `box` — [низ, верх] короба. */
  drawers?: (Item & { box?: [number, number] })[];
  facades?: Item[];
  [extra: string]: unknown;
}

/** Как стенд узнаёт детали группы: id полки, ящика, фасада — тот, что у элемента в state и командах. */
export interface GroupRule {
  /** Детали группы (модуля, секции, корпуса). */
  own: (p: any) => boolean;
  /** Ящик детали (его фасад и короб) или null. */
  drawerOf: (p: any) => string | null;
  /** Id полки или фасада для ответа. */
  idOf: (p: any) => string;
  /** Порядок полок и ящиков; без него — снизу вверх. */
  order?: (a: any, b: any) => number;
}

const mm = (v: number) => Math.round(v * 10) / 10;

export const partZ = (p: any): PartZ => ({ z: [mm(p.boxMm.min[2]), mm(p.boxMm.max[2])], t: mm(p.sizeMm[2]) });

const SHELF = new Set(['FIXED_SHELF', 'ADJUSTABLE_SHELF']);
const BOTTOM = new Set(['CARCASS_BOTTOM_PANEL']);
const TOP = new Set(['CARCASS_TOP_PANEL', 'TOP_COVER_PANEL']);
// Фасад ящика: наружный — FACADE, внутренний ящик шкафа — STRUCTURAL_FRONT корпуса.
const isFront = (p: any) => p.surface === 'FACADE' || p.role === 'STRUCTURAL_FRONT';
const lowFirst = (a: any, b: any) => a.boxMm.min[2] - b.boxMm.min[2];
const list = <T>(xs: T[]): T[] | undefined => (xs.length ? xs : undefined);

/** Геометрия деталей группы по 3D-сцене ядра. */
export function groupGeometry(scene: any, rule: GroupRule): Geometry {
  const own: any[] = scene.parts.filter(rule.own),
    order = rule.order ?? lowFirst,
    loose = own.filter((p) => !rule.drawerOf(p));
  // Дно и верх корпуса — верхняя деталь своей роли (у кухни передняя и задняя царги — обе CARCASS_TOP_PANEL на одной высоте).
  const one = (roles: Set<string>) => loose.filter((p) => roles.has(p.role)).sort(lowFirst).at(-1);
  const bottom = one(BOTTOM),
    top = one(TOP);
  const boxes = new Map<string, any[]>();
  for (const p of own) {
    const d = rule.drawerOf(p);
    if (d) boxes.set(d, [...(boxes.get(d) ?? []), p]);
  }
  const drawers = [...boxes]
    .map(([id, ps]) => ({ id, front: ps.find(isFront), box: ps.filter((p) => !isFront(p)) }))
    .filter((d) => d.front)
    .sort((a, b) => order(a.front, b.front))
    .map((d) => ({
      id: d.id,
      ...partZ(d.front),
      ...(d.box.length ? { box: [mm(Math.min(...d.box.map((p) => p.boxMm.min[2]))), mm(Math.max(...d.box.map((p) => p.boxMm.max[2])))] as [number, number] } : {}),
    }));
  const items = (keep: (p: any) => boolean, sort: (a: any, b: any) => number) =>
    list(
      loose
        .filter(keep)
        .sort(sort)
        .map((p) => ({ id: rule.idOf(p), ...partZ(p) })),
    );
  const g: Geometry = {
    bottom: bottom && partZ(bottom),
    top: top && partZ(top),
    shelves: items((p) => SHELF.has(p.role), order),
    drawers: list(drawers),
    facades: items((p) => p.surface === 'FACADE', lowFirst),
  };
  return Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined)) as Geometry;
}
