// Fittings of the wardrobe (task FIT, MOD-DEC-480): the clothes rod with its holders, the legs of a body on legs and
// the handles of the fronts. The owner asked to choose and bring them in (2026-10-24); the positions are those of the
// shortlist (docs/catalogs/hardware-shortlist-2026-10-23.md §4), the data — catalogs/hardware/fittings.json. The
// rules here are the executor's (Д) recorded in 480: where a handle stands on a front, how many legs a body gets and
// where, which leg serves a height. A position the user does not choose is the default of this module.
// The second PR of FIT (MOD-DEC-483): legs behind a decorative plinth with its clips, the lights of the sections with
// their power supply, the push latch, the hinges without a spring and the runner of the drawers opened by pressing.
// Version 3 (MOD-DEC-485): the latch of a door opened by pressing and where it stands.
// Version 4 (MOD-DEC-484, the third PR of FIT): the baskets for linen and for shoes and the trouser racks of BELLE, the
// pantographs of BASE PU70 — which item a section takes, its colour and where it stands.
// Version 5 (FINDINGS 3420–3423): the power supply carries the lights with the reserve their maker requires, and the
// lights are plugged into distributors of their connector — the bare supply has terminals, not sockets.
// Version 6 (FINDINGS 3424, 3425): the supply keeps the reserve its own maker requires too, the stricter of the two
// counts; a supply sold without a mains cord gets the cord of the catalogue.
import type { CabinetLight, FittingsCatalog, Handle, Leg, LightConnector, LightDistributor, PowerSupply, PushLatch, RodSeries, RodStock, StorageColour, StorageItem, StorageKind, StorageVariant } from '../../catalog/hardware/fittings.js';
import type { DrawerSystemChoice } from './drawer-system-selection.js';
import { constant, decision, type PolicyModule } from './types.js';

export const fittingsSelection = {
  id: 'fittings-selection',
  version: '6',
  constants: {
    defaultRod: constant('VITRA_J08', 'id', decision('MOD-DEC-233'), 'Штанга по умолчанию — недорогая овальная (233): VITRA J08 15×30 мм с держателями J09 (шорт-лист §4, 480)'),
    defaultHandle: constant('BOYARD_RS425BAP_128', 'id', decision('MOD-DEC-480'), 'Ручка по умолчанию — скоба BOYARD RS425BAP.5/128 (шорт-лист §4); пользователь выбирает другую или «без ручек»'),
    handleFromFreeEdge: constant(50, 'mm', decision('MOD-DEC-480'), '(Д) Ось вертикальной ручки двери — в 50 мм от свободного (не петлевого) края фасада'),
    handleCentreHeight: constant(1000, 'mm', decision('MOD-DEC-480'), '(Д) Середина ручки двери — в 1000 мм от пола, в пределах двери с отступом 50 мм от её краёв'),
    handleFromLiftEdge: constant(50, 'mm', decision('MOD-DEC-480'), '(Д) Ось горизонтальной ручки подъёмного фасада — в 50 мм от его нижнего края, по середине ширины'),
    handleEdgeClearance: constant(50, 'mm', decision('MOD-DEC-480'), '(Д) Ручка не ближе 50 мм к краю фасада вдоль своей длины'),
    legInset: constant(50, 'mm', decision('MOD-DEC-480'), '(Д) Ось ножки — в 50 мм от края корпуса по ширине и по глубине'),
    legMaxSpacing: constant(900, 'mm', decision('MOD-DEC-480'), '(Д) Шаг ножек ряда по ширине — не больше 900 мм; два ряда — передний и задний'),
    plinthLegUse: constant<Leg['use']>('HIDDEN', 'use', decision('MOD-DEC-483'), 'За декоративным цоколем — сначала ножки под цоколь (H.80 на 80 мм, ПНЦ.100.Ч на 95–130 мм), затем открытые; ножки стоят как открытые (480)'),
    plinthOnlyLegs: constant<readonly string[]>(['A080_CH'], 'id', decision('MOD-DEC-483'), '(Д) Ножка 10\\04.A080 взята только под декоративный цоколь: открытым ножкам её не предлагаем, их подбор — как до 483'),
    plinthClip: constant('PKC_002_CH', 'id', decision('MOD-DEC-483'), 'Клипса цоколя ПКЦ.002.Ч — на каждой ножке переднего ряда'),
    pushLatch: constant('BOYARD_AMF14_GR', 'id', decision('MOD-DEC-483'), '(Д) Толкатель двери с открыванием нажатием — BOYARD AMF14/GR (серый): корпус в кромке не виден за дверью, белый AMF14/W — тот же размер'),
    latchFromFreeEdge: constant(100, 'mm', decision('MOD-DEC-483'), '(Д) Ось толкателя — в 100 мм от свободного края двери: дальше конфирмата боковины в торце крыши (50 мм от кромки)'),
    mainsCord: constant('EM_WO_2000_W', 'id', decision('MOD-DEC-483'), '(Д) Дополнение 483 от 2026-10-29: блоку питания без сетевого шнура — шнур EM.WO.2*0,5.2000.W (2000 мм, Europlug), по одному на блок, отдельной строкой сметы'),
    lightFromFront: constant(50, 'mm', decision('MOD-DEC-483'), '(Д) Передний край светильника — в 50 мм за передней кромкой крыши или полки, под которой он стоит: дальше вкладной двери'),
    storageColour: constant<StorageColour>('WHITE', 'colour', decision('MOD-DEC-484'), 'Цвет корзин, вешал и пантографов по умолчанию — белый; выбор один на шкаф: белый, графит или чёрный'),
    pantographForWhite: constant<StorageColour>('GREY_METALLIC', 'colour', decision('MOD-DEC-484'), '(Д) Белого пантографа BASE PU70 нет: при белом цвете фурнитуры наполнения пантограф — серый металлик'),
    storageColourFallback: constant<StorageColour>('GRAPHITE', 'colour', decision('MOD-DEC-484'), '(Д) Цвета, выбранного в проекте, у позиции нет (корзины и вешала глубиной 350 мм — только белые и графит): берём графит и говорим об этом'),
    storageFrontInside: constant(28, 'mm', decision('MOD-DEC-484'), '(Д) Передний край рамы корзины и вешала — в 28 мм за передним краем корпуса, как передняя стенка внутреннего ящика (wardrobe-drawers.boxFrontInside); за раздвижной системой — за ней'),
    storageRunnerZone: constant(40, 'mm', decision('MOD-DEC-484'), '(Д) Рама корзины и вешала касается боковин только у направляющих: на 40 мм выше и ниже их оси (разметка комплекта — ±32 мм). Эту высоту закрывает проставка двери (331, 360) и её обходит закрытая петля (FE-04, 050)'),
    pantographDepthAxis: constant(0.5, 'ratio', decision('MOD-DEC-484'), '(Д) Ось поворота пантографа — посередине глубины секции до задней стенки: комплект не задаёт её места по глубине'),
  },
} as const satisfies PolicyModule;

/** The choice of the project (state.fittings): a rod series, a handle (or none), a leg; absent — the defaults. */
export interface FittingsChoice {
  rodSeriesId?: string | null;
  /** 'NONE' — no handles (push to open, a profile handle bought elsewhere). */
  handleId?: string | null;
  legId?: string | null;
  /** Lighting (MOD-DEC-483): 'ALL' — every section, a list — the sections by id (`M01-S02`); absent — none. */
  lighting?: 'ALL' | string[] | null;
  /** Doors and drawers opened by pressing (MOD-DEC-483); absent — with handles. */
  pushToOpen?: boolean | null;
  /** Baskets, trouser racks and pantographs of the sections (MOD-DEC-484), in the order they were added. */
  storage?: StorageRow[] | null;
  /** The colour of them all (484): WHITE (the default), GRAPHITE or BLACK. */
  storageColour?: StorageColour | null;
  /** Assembled drawers of the catalogue (MOD-DEC-544, R2-007): a series, 'TIER' — the series of the level; absent — own box. */
  drawerSystem?: DrawerSystemChoice;
  /**
   * The runner of a drawer of the own box (MOD-DEC-514, FINDINGS 1862): 'level' — of the level of the hardware by 466,
   * every new project; absent — DB4501 of the prototype, as a saved project has it.
   */
  drawerRunner?: 'level' | null;
}

/**
 * A storage item of a section as the project keeps it (MOD-DEC-484): the section by id (`M01-S02`), what it is, and the
 * bottom of its frame over the interior bottom of the section, mm — the editor puts it in a free height, the user's
 * place is kept as an element of the fill (310).
 */
export interface StorageRow {
  sectionId: string;
  kind: StorageKind;
  yMm: number;
}

/** The kinds that pull out on runners behind a door, as an inner drawer (288, 331, 360, 050; 175 behind sliding doors). */
export const PULL_OUT_KINDS: readonly StorageKind[] = ['LINEN_BASKET', 'SHOE_BASKET', 'TROUSER_RACK'];

/** What the user sees a kind called (MOD-DEC-484). */
export const STORAGE_KIND_RU: Readonly<Record<StorageKind, string>> = Object.freeze({
  LINEN_BASKET: 'Корзина для белья',
  SHOE_BASKET: 'Корзина для обуви',
  TROUSER_RACK: 'Вешало для брюк',
  PANTOGRAPH: 'Пантограф',
});

/** A storage item chosen for a section: the item, its colour, and why the colour is not the project's (else null). */
/**
 * An item and its colour, or why none fits; `clearRanges` — the clear widths the items between the sides take, when it
 * is the width of the section that keeps them out (MOD-AI-29, 67: the editor names the widths of the section then).
 */
export type StoragePick =
  | { item: StorageItem; variant: StorageVariant; colourNote: string | null; problem: null }
  | { item: null; variant: null; colourNote: null; problem: string; clearRanges?: { minMm: number; maxMm: number }[] };

const COLOUR_RU: Readonly<Record<StorageColour, string>> = { WHITE: 'белый', GRAPHITE: 'графит', BLACK: 'чёрный', GREY_METALLIC: 'серый металлик' };

/**
 * The item of `kind` for a section of clear width `widthMm` with `depthMm` from the front of the frame to the back
 * (MOD-DEC-484, Д): among the items mounted between the sides whose range holds the width, the deepest that fits in
 * depth (the 480 or 540 mm of a full basket, else the 350 mm one), the narrower of two ranges that both hold it; a
 * trouser rack that fits nowhere between the sides is the one screwed under the panel above when the width admits it.
 * The colour is the project's — a pantograph is grey metallic for white — else the fallback with a note.
 */
export function storageFor(catalog: FittingsCatalog, kind: StorageKind, widthMm: number, depthMm: number, colour: StorageColour | null | undefined): StoragePick {
  const k = fittingsSelection.constants,
    own = catalog.storage.filter((x) => x.kind === kind),
    deep = (x: StorageItem) => x.depthMm === null || x.depthMm <= depthMm + 1e-9,
    sides = own
      .filter((x) => x.mounting === 'SIDES' && widthMm >= x.clearWidthMm.minMm - 1e-9 && widthMm <= x.clearWidthMm.maxMm + 1e-9 && deep(x))
      .sort((a, b) => (b.depthMm ?? 0) - (a.depthMm ?? 0) || a.clearWidthMm.maxMm - b.clearWidthMm.maxMm),
    top = own.filter((x) => x.mounting === 'TOP' && widthMm >= x.clearWidthMm.minMm - 1e-9 && deep(x)),
    item = sides[0] ?? top[0];
  if (!item) {
    const r1 = (x: number) => String(Math.round(x * 10) / 10).replace('.', ','),
      ranges = [...new Set(own.filter((x) => x.mounting === 'SIDES').map((x) => `${r1(x.clearWidthMm.minMm)}–${r1(x.clearWidthMm.maxMm)}`))],
      lo = Math.min(...own.filter((x) => x.mounting === 'SIDES').map((x) => x.clearWidthMm.minMm)),
      hi = Math.max(...own.filter((x) => x.mounting === 'SIDES').map((x) => x.clearWidthMm.maxMm)),
      // The items whose range holds the width but that are deeper than the section.
      wide = own.filter((x) => x.mounting === 'SIDES' && widthMm >= x.clearWidthMm.minMm - 1e-9 && widthMm <= x.clearWidthMm.maxMm + 1e-9),
      shallow = Math.min(...(wide.length ? wide : own).map((x) => x.depthMm ?? 0));
    const why = !own.length
      ? 'в каталоге фурнитуры нет таких позиций'
      : depthMm < shallow - 1e-9
        ? `глубина секции от рамы до задней стенки ${r1(depthMm)} мм, а ${wide.length ? 'для этой ширины' : `для ${own[0]!.series}`} нужно не меньше ${r1(shallow)} мм`
        : widthMm < lo || widthMm > hi
          ? `ширина секции в свету ${r1(widthMm)} мм, а ${own[0]!.series} ставится в проём от ${r1(lo)} до ${r1(hi)} мм`
          : `ширина секции в свету ${r1(widthMm)} мм между размерами ${own[0]!.series}: ${ranges.join(', ')} мм`;
    const byWidth = !!own.length && depthMm >= shallow - 1e-9,
      clearRanges = own
        .filter((x) => x.mounting === 'SIDES')
        .map((x) => ({ minMm: x.clearWidthMm.minMm, maxMm: x.clearWidthMm.maxMm }))
        .filter((r, k, a) => a.findIndex((q) => q.minMm === r.minMm && q.maxMm === r.maxMm) === k)
        .sort((a, b) => a.minMm - b.minMm);
    return { item: null, variant: null, colourNote: null, problem: `${STORAGE_KIND_RU[kind]} не подходит: ${why} (MOD-DEC-484)`, ...(byWidth ? { clearRanges } : {}) };
  }
  const asked = colour ?? k.storageColour.value,
    wanted = kind === 'PANTOGRAPH' && asked === 'WHITE' ? k.pantographForWhite.value : asked,
    variant = item.variants.find((v) => v.colour === wanted) ?? item.variants.find((v) => v.colour === k.storageColourFallback.value) ?? item.variants[0]!;
  const colourNote = variant.colour === wanted || (kind === 'PANTOGRAPH' && asked === 'WHITE') ? null : `${variant.article}: цвета «${COLOUR_RU[wanted]}» у позиции нет — взят «${COLOUR_RU[variant.colour]}» (MOD-DEC-484)`;
  return { item, variant, colourNote, problem: null };
}

export type FittingPick<T> = { item: T; temporary: false; reason: null } | { item: T; temporary: true; reason: string };

/** The rod series of a rod: the series the rod names, else the one of the project, else the default (233). */
export function rodSeriesFor(catalog: FittingsCatalog, own: string | null | undefined, project: string | null | undefined): RodSeries {
  const by = (id: string | null | undefined) => (id ? catalog.rods.find((r) => r.id === id) : undefined);
  const series = by(own) ?? by(project) ?? by(fittingsSelection.constants.defaultRod.value) ?? catalog.rods[0];
  if (!series) throw new Error('В каталоге фурнитуры нет штанг');
  return series;
}

/** The stock length a rod of `cutMm` is cut from: the shortest that holds it; without one, the longest and a warning. */
export function rodStockFor(series: RodSeries, cutMm: number): FittingPick<RodStock> {
  const sorted = [...series.stock].sort((a, b) => a.lengthMm - b.lengthMm),
    fit = sorted.find((s) => s.lengthMm >= cutMm);
  if (fit) return { item: fit, temporary: false, reason: null };
  const longest = sorted[sorted.length - 1]!;
  return { item: longest, temporary: true, reason: `штанга ${Math.round(cutMm)} мм длиннее самой длинной ${series.brand} ${series.series} (${longest.lengthMm} мм)` };
}

/** The handle of the project; null — «без ручек». An id the catalogue does not have falls back to the default. */
export function handleFor(catalog: FittingsCatalog, choice: FittingsChoice | null | undefined): Handle | null {
  if (choice?.handleId === 'NONE') return null;
  const id = choice?.handleId ?? fittingsSelection.constants.defaultHandle.value;
  return catalog.handles.find((h) => h.id === id) ?? catalog.handles.find((h) => h.id === fittingsSelection.constants.defaultHandle.value) ?? null;
}

/** The latch of a door opened by pressing (MOD-DEC-483): the catalogue's record the policy names; null — the catalogue has none. */
export function latchFor(catalog: FittingsCatalog): PushLatch | null {
  return catalog.pushLatches.find((x) => x.id === fittingsSelection.constants.pushLatch.value) ?? null;
}

/** A horizontal carcass panel flush with the carcass front, by its front edge: x across, y the height (product axes). */
export interface LatchPanel {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Where the latch of a door x0…x1 wide and y0…y1 high stands (MOD-DEC-483, 485; (Д) of 483): its axis at
 * latchFromFreeEdge from the free (not hinged) edge, in the front edge of the panel behind the door whose middle is the
 * highest within the door's height and that holds the hole of `diameterMm` at that axis; null — no such panel. The
 * caller gives only the panels the latch may stand in (flush with the front, deep enough). One rule for the wardrobe,
 * the kitchen and HOME.
 */
export function latchPlacement<P extends LatchPanel>(door: { x0: number; x1: number; y0: number; y1: number }, hinge: unknown, panels: readonly P[], diameterMm: number): { panel: P; xMm: number } | null {
  const free = fittingsSelection.constants.latchFromFreeEdge.value,
    x = hinge === 'right' ? door.x0 + free : door.x1 - free,
    panel = panels
      .filter((p) => (p.y0 + p.y1) / 2 > door.y0 && (p.y0 + p.y1) / 2 < door.y1 && p.x0 + diameterMm / 2 <= x && p.x1 - diameterMm / 2 >= x)
      .reduce<P | null>((a, p) => (!a || p.y0 > a.y0 ? p : a), null);
  return panel ? { panel, xMm: x } : null;
}

/** The body stands on legs: open (fixedLegs) or behind a decorative plinth (legsPlinth, MOD-DEC-481, 483). */
export const onLegs = (kind: unknown): boolean => kind === 'fixedLegs' || kind === 'legsPlinth';

/**
 * The leg of a body on legs of height `heightMm` (Д 480): the leg the project names when it gives this height; else
 * the cheapest visible leg that gives it, then the cheapest hidden one (behind a decorative plinth `first` is HIDDEN —
 * hidden ones first, 483); else the leg nearest by height (of that use, when the catalogue has one), as a temporary
 * value with a warning (the function is not cut: the owner's rule of 2026-10-22).
 */
export function legFor(catalog: FittingsCatalog, heightMm: number, choice: FittingsChoice | null | undefined, first: Leg['use'] = 'VISIBLE'): FittingPick<Leg> {
  if (first === 'VISIBLE') catalog = { ...catalog, legs: openLegs(catalog) };
  const gives = (l: Leg) => heightMm >= l.heightMm.minMm && heightMm <= l.heightMm.maxMm,
    price = (l: Leg) => l.price?.rub ?? Infinity,
    chosen = choice?.legId ? catalog.legs.find((l) => l.id === choice.legId) : undefined;
  if (chosen && gives(chosen)) return { item: chosen, temporary: false, reason: null };
  const fitting = catalog.legs.filter(gives).sort((a, b) => (a.use === b.use ? price(a) - price(b) || a.id.localeCompare(b.id) : a.use === first ? -1 : 1));
  if (fitting.length) return chosen ? { item: fitting[0]!, temporary: true, reason: `${chosen.name} не даёт высоту ${heightMm} мм — взята ${fitting[0]!.name}` } : { item: fitting[0]!, temporary: false, reason: null };
  const off = (l: Leg) => Math.max(l.heightMm.minMm - heightMm, heightMm - l.heightMm.maxMm),
    // The nearest of the legs of the use asked for first (483: a hidden leg under a plinth is not offered as an open one).
    own = catalog.legs.filter((l) => l.use === first),
    pool = chosen ? [chosen] : own.length ? own : catalog.legs,
    nearest = [...pool].sort((a, b) => off(a) - off(b) || (a.use === b.use ? price(a) - price(b) : a.use === first ? -1 : 1))[0];
  if (!nearest) throw new Error('В каталоге фурнитуры нет ножек');
  const heights = [...new Set(catalog.legs.map((l) => (l.heightMm.minMm === l.heightMm.maxMm ? `${l.heightMm.minMm}` : `${l.heightMm.minMm}–${l.heightMm.maxMm}`)))].join(', ');
  return { item: nearest, temporary: true, reason: `ножки высотой ${heightMm} мм в каталоге нет — временно ${nearest.name}; ножки каталога: ${heights} мм` };
}

/** The legs open legs may take (MOD-DEC-480): all of the catalogue but those taken only for a decorative plinth (483). */
export function openLegs(catalog: FittingsCatalog): Leg[] {
  const only: readonly string[] = fittingsSelection.constants.plinthOnlyLegs.value;
  return catalog.legs.filter((l) => !only.includes(l.id));
}

/**
 * The height a body gets when it goes on legs (MOD-DEC-481): `heightMm` when a leg of the catalogue gives it, else the
 * nearest height a leg gives within `limits` — the leg is then chosen without a warning. A height the user types stays.
 * Behind a decorative plinth (`plinth`) — only the hidden legs (from 70 mm — 80 mm, MOD-DEC-483); open legs — those
 * of openLegs.
 */
export function legsBaseHeight(catalog: FittingsCatalog, heightMm: number, limits: { min: number; max: number }, plinth = false): number {
  let best = heightMm,
    off = Infinity;
  for (const l of plinth ? catalog.legs.filter((x) => x.use === fittingsSelection.constants.plinthLegUse.value) : openLegs(catalog)) {
    const lo = Math.max(l.heightMm.minMm, limits.min),
      hi = Math.min(l.heightMm.maxMm, limits.max);
    if (lo > hi) continue;
    const h = Math.min(hi, Math.max(lo, heightMm));
    if (Math.abs(h - heightMm) < off) [best, off] = [h, Math.abs(h - heightMm)];
  }
  return best;
}

/** Positions of the legs of one row along a length `lengthMm`: the ends at the inset, the spacing not over the maximum. */
export function legStations(lengthMm: number): number[] {
  const c = fittingsSelection.constants,
    span = Math.max(0, lengthMm - 2 * c.legInset.value),
    gaps = Math.max(1, Math.ceil(span / c.legMaxSpacing.value - 1e-9));
  return Array.from({ length: gaps + 1 }, (_, i) => Math.round((c.legInset.value + (span * i) / gaps) * 10) / 10);
}

/** The section `sectionId` is lit by the choice of the project (MOD-DEC-483). */
export function sectionLit(choice: FittingsChoice | null | undefined, sectionId: string): boolean {
  const l = choice?.lighting;
  return l === 'ALL' || (Array.isArray(l) && l.includes(sectionId));
}

/**
 * The light of a section of clear width `widthMm` (MOD-DEC-483): the longest of the series that fits — of the wardrobe
 * by default (FINDINGS 2766); null — none fits.
 */
export function lightFor(catalog: FittingsCatalog, widthMm: number, series = catalog.defaultLightSeries): CabinetLight | null {
  return catalog.lights.filter((l) => l.series === series && l.lengthMm <= widthMm).sort((a, b) => b.lengthMm - a.lengthMm)[0] ?? null;
}

/**
 * What a power supply carries, W (FINDINGS 3421, 3424): its power over the reserve `reservePct` the maker of the lights
 * requires and below the reserve its own maker requires (`loadReservePct`), the stricter of the two; an unknown one
 * counts as none.
 */
export function supplyCapacityW(p: PowerSupply, reservePct = 0): number {
  return Math.min(p.powerW / (1 + reservePct / 100), p.powerW * (1 - (p.loadReservePct.value ?? 0) / 100));
}

/**
 * The power supply of lights of `loadW` watts (MOD-DEC-483) with the reserve `reservePct` their maker requires
 * (FINDINGS 3421) and the one of the supply (3424): the smallest of their voltage that carries the load
 * (`supplyCapacityW`); above the largest — (Д) as many of the largest as carry it, each with the reserves.
 */
export function powerSupplyFor(catalog: FittingsCatalog, loadW: number, voltageV: number, reservePct = 0): { item: PowerSupply; quantity: number } {
  const own = catalog.powerSupplies.filter((p) => p.voltageV === voltageV).sort((a, b) => a.powerW - b.powerW),
    fit = own.find((p) => supplyCapacityW(p, reservePct) >= loadW - 1e-9),
    largest = own[own.length - 1];
  if (fit) return { item: fit, quantity: 1 };
  if (!largest) throw new Error(`В каталоге фурнитуры нет блока питания на ${voltageV} В`);
  return { item: largest, quantity: Math.ceil(loadW / supplyCapacityW(largest, reservePct) - 1e-9) };
}

/**
 * The distributors of the lights of the powers `powersW` with the plug `connector`, fed by `supplies` power supplies
 * of `voltageV` (FINDINGS 3422). (Д) The lights are shared evenly between the supplies, each supply with its own
 * distributors, each distributor with an even share of them; a distributor holds its lights in its sockets and
 * carries their current, counted by the most powerful ones. Of the sets of one article the cheapest, then the one
 * of fewer distributors and the smaller current. null — no distributor of the connector in the catalogue.
 */
export function distributorsFor(catalog: FittingsCatalog, connector: LightConnector, powersW: number[], voltageV: number, supplies: number): { item: LightDistributor; quantity: number } | null {
  const own = catalog.lightDistributors.filter((d) => d.connector === connector);
  if (!own.length || !powersW.length) return null;
  const desc = [...powersW].sort((a, b) => b - a),
    perSupply = Math.ceil(desc.length / supplies),
    currentA = (n: number) => desc.slice(0, n).reduce((a, w) => a + w, 0) / voltageV;
  let best: { item: LightDistributor; per: number; rub: number } | null = null;
  for (let per = 1; per <= perSupply; per++) {
    const lights = Math.ceil(perSupply / per);
    for (const d of own) {
      if (d.ports < lights || d.currentA < currentA(lights) - 1e-9) continue;
      const rub = per * (d.price?.rub ?? Infinity);
      if (!best || rub < best.rub || (rub === best.rub && (per < best.per || (per === best.per && d.currentA < best.item.currentA)))) best = { item: d, per, rub };
    }
  }
  return best ? { item: best.item, quantity: best.per * supplies } : null;
}
