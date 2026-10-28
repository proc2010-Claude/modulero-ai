// Распашной шкаф и купе на стенде: правки договора (EXCHANGE_SPEC.md §4.2) → функции редактора ядра
// modulero-next (wardrobe/editor.ts) и сводка «в объёме экрана» (§5 п. 3–4). Стенд ничего не считает:
// размеры, наполнение, отказы и цена — ответы ядра.
import type { Core } from './engine.ts';
import type { Edit, EditResult } from './kitchen.ts';
import { TERMS } from './kitchen.ts';
import { groupGeometry, partZ, type Geometry } from './geometry.ts';
import { scene3dOf, type Scene3dView } from './scene3d.ts';

export type WardrobeInput = Record<string, any>;

const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const result = (r: { ok: true; input: WardrobeInput; notice?: string } | { ok: false; problem: string }): EditResult =>
  r.ok ? { ok: true, project: r.input, ...(r.notice ? { notice: r.notice } : {}) } : r;

/** Одна правка шкафа — функция редактора ядра (§4.2); принятая правка проверяется построением графа. */
export function applyWardrobeEdit(c: Core, i: WardrobeInput, e: Edit): EditResult {
  return graphChecked(c, editOf(c, i, e));
}

/** Принятая редактором правка шкафа (из договора или команды editor_call) годится, только если по ней строится граф. */
export function graphChecked(c: Core, r: EditResult): EditResult {
  if (!r.ok) return r;
  // Редактор принял правку, а граф по ней не строится: такой проект не записать в файл и не показать.
  // Правка не применяется, причина — словами ядра (задача MOD-AI-18).
  try {
    c.wardrobeGraph(r.project, c.HW);
  } catch (err) {
    const problems: string[] = (err as { problems?: string[] }).problems ?? [err instanceof Error ? err.message : String(err)];
    return { ok: false, problem: `Конструктор не строит шкаф после этой правки: ${[...new Set(problems)].join('; ')}. Проект не изменён.` };
  }
  return r;
}

function editOf(c: Core, i: WardrobeInput, e: Edit): EditResult {
  const { W, HW } = c;
  switch (e.op) {
    case 'set_product':
      return result(W.setProduct(i, HW, e.product));
    case 'set_size':
      return result(W.setSize(i, defined({ width: opt(e.width), height: opt(e.height), depth: opt(e.depth) })));
    case 'set_section_count':
      return result(W.setSectionCount(i, e.n));
    case 'set_section_width':
      return result(W.setSectionWidth(i, e.section, e.width));
    case 'remove_section':
      return result(W.removeSection(i, e.section));
    case 'set_facade':
      return result(W.setFacade(i, e.section, e.facade));
    case 'set_facade_mounting':
      return result(W.setFacadeMounting(i, e.mounting));
    case 'set_hinge_side':
      return result(W.setHingeSide(i, e.section, e.side));
    case 'set_mezzanine':
      return result(W.setMezzanine(i, e.height));
    case 'set_base':
      // «Ножки» и «Ножки за цоколем» — высотой ножки каталога, как кнопки редактора (setLegsBase, setPlinthLegsBase).
      if (e.base === 'fixedLegs' && e.height === null) return result(W.setLegsBase(i, HW));
      if (e.base === 'legsPlinth' && e.height === null) return result(W.setPlinthLegsBase(i, HW));
      return result(W.setBase(i, e.base, opt(e.height as number | null), HW));
    case 'set_panel':
      return result(W.setPanel(i, e.panel, e.on));
    case 'set_decor':
      return result(W.setDecor(i, HW, e.decor_id));
    case 'set_room':
      return result(
        W.setRoom(i, defined({ niche: opt(e.niche), left: opt(e.left), right: opt(e.right), width: opt(e.width), ceiling: opt(e.ceiling), skirting: opt(e.skirting), skirtHeight: opt(e.skirt_height), skirtDepth: opt(e.skirt_depth) })),
      );
    case 'add_fill':
      if (e.kind === 'shelf') return result(W.addShelf(i, HW, e.section));
      if (e.kind === 'rod') return result(W.addRod(i, HW, e.section));
      return result(W.addDrawer(i, HW, e.section, opt(e.execution as string | null)));
    case 'add_storage':
      return result(W.addStorage(i, HW, e.section, e.kind));
    case 'remove_fill':
      if (e.kind === 'shelf') return result(W.removeShelf(i, HW, e.section, e.index));
      if (e.kind === 'drawer') return result(W.removeDrawer(i, HW, e.section, e.index));
      if (e.kind === 'storage') return result(W.removeStorage(i, HW, e.section, e.index));
      // В редакторе ядра нет правки «убрать штангу» (задача MOD-AI-19): штанга не убирается, проект не меняется.
      return { ok: false, problem: 'Убрать штангу в редакторе шкафа пока нельзя: такой правки в конструкторе нет. Проект не изменён.' };
    case 'distribute_shelves':
      return result(W.distributeShelves(i, HW, e.section));
    case 'set_lighting':
      return result(W.setLighting(i, e.on, opt(e.section_id as string | null)));
    case 'set_push_to_open':
      return result(W.setPushToOpen(i, e.on));
    case 'set_sliding_doors':
      return result(W.setSlidingDoors(i, HW, defined({ n: opt(e.n), system: opt(e.system), scheme: opt(e.scheme), mirror: opt(e.mirror) })));
    case 'set_sliding_insert':
      return result(W.setSlidingInsert(i, HW, { material: e.material, decorId: e.decor_id }));
    default:
      throw new Error(`Нет правки шкафа «${e.op}».`);
  }
}

/** Стартовый шкаф конструктора: распашной — три секции по двери (newWardrobeInput), купе — две створки ЭКО (newSlidingInput). */
export function startWardrobe(c: Core, kind: 'wardrobe' | 'sliding'): EditResult {
  return { ok: true, project: kind === 'sliding' ? c.W.newSlidingInput() : c.W.newWardrobeInput() };
}

/** Вид проекта шкафа для файла конструктора: «wardrobe» или «sliding» по входу. */
export const wardrobeFileKind = (i: WardrobeInput): 'wardrobe' | 'sliding' => (i.domain === 'sliding' ? 'sliding' : 'wardrobe');

export interface WardrobeView {
  revision: string;
  state: Record<string, unknown>;
  price: Record<string, unknown>;
  warnings: string[];
  previewSvg: string | null;
  /** 3D-сцена ядра для вида на странице — та же, что у конструктора. */
  scene3d: Scene3dView;
  /** Граф версии: из него же пишется файл проекта. */
  graph: any;
}

const FACADE_RU: Record<string, string> = { none: 'открытая', one: 'одна дверь', two: 'две двери', lift: 'подъёмный фасад', rows: 'фасады рядами' };
const BASE_RU: Record<string, string> = { plinth: 'цоколь', fixedLegs: 'ножки', legsPlinth: 'ножки за цоколем', none: 'без основания' };

/** Номинальная ширина секции редактора — точное число мм (дробь ядра), до десятых. */
const exactMm = (v: unknown): number | null => {
  const x = v as { numerator?: number; denominator?: number } | null;
  return x && typeof x.numerator === 'number' && typeof x.denominator === 'number' ? Math.round((x.numerator / x.denominator) * 10) / 10 : null;
};

/** Граф, версия, сводка, цена шкафа — всё из ядра. */
export function wardrobeView(c: Core, i: WardrobeInput): WardrobeView {
  const { W, HW } = c;
  const graph = c.wardrobeGraph(i, HW),
    out = c.wardrobeOutputs(graph, HW, i),
    sum = W.wardrobeSummary(i),
    room = W.roomSummary(i),
    ids: string[] = W.projectSectionIds(i),
    fit = W.fittingsChoice(i),
    options = W.fittingsOptions(HW.fittings),
    storageRu: Record<string, string> = W.STORAGE_KIND_RU,
    decors = W.decorChoices(HW),
    sliding = i.domain === 'sliding';
  const scene3d = scene3dOf(c, graph),
    geo = geometryOf(scene3d.scene);
  const handle = fit.handleId === 'NONE' ? null : (options.handles.find((h: any) => h.id === fit.handleId) ?? options.handles.find((h: any) => h.isDefault));
  const sections = i.state.sections.map((s: any, k: number) => {
    const f = W.fillPanelOf(i, HW, k),
      v = sum.sections[k];
    return defined({
      section: k,
      id: ids[k],
      mezzanine: v.mezzanine,
      width_mm: exactMm(s.nominalMm),
      facade: sliding ? undefined : FACADE_RU[v.facade] ?? v.facade,
      hinge_side: !sliding && v.facade === 'one' ? (v.hingeSide === 'right' ? 'справа' : 'слева') : undefined,
      shelves: f.shelves.length,
      rods: f.rods.map((r: any) => ({ top_from_floor_mm: r.topFromFloorMm })),
      drawers: f.drawers.map((d: any) => ({ execution: d.execution === 'external' ? 'наружный' : 'внутренний', box_height_mm: d.boxHeightMm })),
      storage: (fit.storage ?? []).filter((x: any) => x.sectionId === ids[k]).map((x: any) => storageRu[x.kind] ?? x.kind),
      lit: W.litSections(i).includes(ids[k]),
      // Ряды фасада секции (id — для команд editor_call setFacadeRow, mergeFacadeRow…).
      facade_rows: !sliding && v.facade === 'rows' ? W.facadeRowsOf(i, HW, k).map((r: any) => ({ id: r.id, leaves: r.leaves, hinge_side: r.hingeSide, height_mm: r.heightMm })) : undefined,
      geometry: geo(ids[k]),
    });
  });
  const doors = sliding ? W.slidingSummary(i) : null,
    insert = sliding ? W.slidingInsertOf(i) : null,
    systems = new Map<string, string>(W.SLIDING_SYSTEM_CHOICES);
  const state = {
    kind: sliding ? 'sliding' : 'wardrobe',
    size: { width: sum.width, height: sum.height, depth: sum.depth },
    sections,
    mezzanine_height: sum.mezzanineHeight,
    facade_mounting: sliding ? null : sum.facadeMounting === 'INSET' ? 'вкладные' : sum.facadeMounting === 'OVERLAY' ? 'накладные' : 'разные',
    base: { kind: BASE_RU[sum.base] ?? sum.base, height: sum.base === 'none' ? null : sum.baseHeight },
    top: sum.top,
    back: sum.back,
    room: { niche: room.niche, wall_left: room.left, wall_right: room.right, width: room.width, ceiling: room.ceiling, skirting: room.skirting },
    corpus: decors.find((d: any) => d.id === W.carcassDecor(i, HW))?.title ?? null,
    handles: fit.pushToOpen ? 'без ручек на дверях — открывание нажатием' : handle ? handle.name : 'без ручек',
    push_to_open: !!fit.pushToOpen,
    lighting: fit.lighting === 'ALL' ? 'весь шкаф' : Array.isArray(fit.lighting) && fit.lighting.length ? fit.lighting : null,
    // mirror ядра — зеркальная раскладка створок по дорожкам (tracksOf), а не зеркало на дверях.
    sliding: doors
      ? { doors: doors.doors, system: systems.get(doors.system) ?? doors.system, scheme: doors.scheme, mirrored_tracks: doors.mirror, insert: insert?.material ?? null, insert_decor: insert?.decorId ?? null, leaves: leavesOf(scene3d.scene) }
      : null,
    // Корпуса, стыки, перегородки, стоевые, декоры и фурнитура — что видно в редакторе и нужно командам editor_call.
    bodies: i.state.bodies.map((b: any) => defined({ id: b.id, width_mm: exactMm(b.widthExact) ?? b.width, over: b.parent ?? undefined })),
    body_joints: W.bodyJoints(i),
    partitions_left_of_sections: W.innerPartitions(i),
    uprights: W.uprights(i).map((u: any) => ({ id: u.id, section: u.section, x_mm: u.xMm, height_mm: u.heightMm })),
    facade_material: W.facadeChoiceOf(i),
    side_decor: { left: W.sideDecorChoice(i, 'left'), right: W.sideDecorChoice(i, 'right') },
    edge_decor: W.edgeDecorChoice(i),
    fittings: defined({ handle_id: fit.handleId, rod_series_id: fit.rodSeriesId, leg_id: fit.legId, storage_colour: fit.storageColour, drawer_system: fit.drawerSystem, drawer_runner: fit.drawerRunner }),
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
    terms_hidden: pr.missing.length - missing.length,
  };
  return { revision: graph.revision.projectRevisionId, state, price, warnings: [], previewSvg: c.previewSvg(graph), scene3d, graph };
}

/** Справочники для get_options шкафа (§4): из ядра и выпуска каталога, без цен, ставок и номеров правил. */
export function wardrobeOptions(c: Core, kind: 'wardrobe' | 'sliding', topic: string): unknown {
  const { W, HW } = c;
  switch (topic) {
    case 'limits':
      return {
        ...JSON.parse(JSON.stringify(W.EDITOR_LIMITS)),
        mezzanine_default_mm: W.MEZZANINE_HEIGHT,
        legs_base_height_mm: W.baseHeightLimits('fixedLegs', HW),
        ...(kind === 'sliding' ? { sliding_leaves: { ...W.SLIDING_LEAVES } } : {}),
      };
    case 'decors':
      return W.decorChoices(HW).map((d: any) => ({ id: d.id, title: d.title, group: d.group }));
    case 'handles':
      return W.fittingsOptions(HW.fittings).handles.map((h: any) => ({ id: h.id, name: h.name, default: h.isDefault }));
    case 'storage':
      return Object.entries(W.STORAGE_KIND_RU).map(([id, name]) => ({ id, name }));
    case 'sliding_systems':
      return W.SLIDING_SYSTEM_CHOICES.map(([id, name]: [string, string]) => ({ id, name }));
    case 'sliding_inserts':
      return W.slidingInsertMaterials(HW).map((m: any) => ({ id: m.id, title: m.title, decors: m.decors }));
    default:
      return null;
  }
}

/** Створки купе по высоте — вставки створок в 3D-сцене ядра (рама створки — покупная фурнитура, не деталь). */
const leavesOf = (scene: any) => groupGeometry(scene, { own: (p) => /^SW-LEAF-\d+-/.test(p.id), drawerOf: () => null, idOf: (p) => p.id }).facades ?? [];

const num = (id: string) => Number(/(?:SHELF|DRAWER)(\d+)/.exec(id)?.[1] ?? 0);

/**
 * Геометрия секции — общая форма state (geometry.ts): дно и крыша корпуса, полки, ящики, фасады секции и полка над
 * ящиками. `index` — номер полки и ящика для команд, `y_mm` полки — середина полки над дном корпуса: так её ждёт
 * команда wardrobe/moveShelf.
 */
function geometryOf(scene: any): (section: string) => Geometry {
  return (section) => {
    const body = section.replace(/-S\d+$/, ''),
      carcass = new Set([`${body}-CARCASS-BOTTOM`, `${body}-CARCASS-TOP`]);
    const g = groupGeometry(scene, {
      own: (p) => carcass.has(p.id) || p.id.startsWith(section + '-') || p.assemblyId === section,
      drawerOf: (p) => /-(DRAWER\d+)-/.exec(p.id)?.[1] ?? null,
      idOf: (p) => p.id.slice(p.id.startsWith(section + '-') ? section.length + 1 : body.length + 1),
      order: (a, b) => num(a.id) - num(b.id),
    });
    const floor = g.bottom?.z[1],
      cover = scene.parts.find((p: any) => p.id === `${section}-SHELF-DRAWER-COVER`);
    return {
      ...g,
      ...(g.shelves ? { shelves: g.shelves.map((s, index) => ({ index, ...s, y_mm: floor === undefined ? null : Math.round(((s.z[0] + s.z[1]) / 2 - floor) * 10) / 10 })) } : {}),
      ...(g.drawers ? { drawers: g.drawers.map((d, index) => ({ index, ...d })) } : {}),
      ...(cover ? { drawer_cover: partZ(cover) } : {}),
    };
  };
}
