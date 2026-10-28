// The rod, the handle and the leg of a wardrobe project (task FIT, MOD-DEC-480): the choice is kept in state.fittings
// (absent — the defaults of engine/policy/fittings-selection), the positions are those of the hardware catalogue.
import type { FittingsCatalog } from '../catalog/hardware/fittings.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { drawerSystemSelection, drawerSystemSeriesOf, type DrawerSystemChoice } from '../engine/policy/drawer-system-selection.js';
import { fittingsSelection, openLegs, rodSeriesFor, type FittingsChoice } from '../engine/policy/fittings-selection.js';
import { TIER_NAMES, type HardwareTier } from '../engine/policy/hardware-tier.js';
import type { Rec } from '../engine/policy/project-state.js';
import { canonicalSectionId } from './carcass.js';
import type { JsonValue, WardrobeInput } from './input.js';

type CatalogKey = 'rodSeriesId' | 'handleId' | 'legId';
type Result = { ok: true; input: WardrobeInput; notice?: string } | { ok: false; problem: string };

/** The choice of the project; empty — the defaults. */
export function fittingsChoice(i: WardrobeInput): FittingsChoice {
  return ((i.state as Rec).fittings as FittingsChoice | undefined) ?? {};
}

/** The rod series a new rod gets: the one of the project or the default (233). */
export function projectRodSeries(i: WardrobeInput, catalog: FittingsCatalog) {
  return rodSeriesFor(catalog, null, fittingsChoice(i).rodSeriesId);
}

/**
 * Sets the rod series, the handle ('NONE' — без ручек) or the leg of the project; null puts the default back. An id
 * the catalogue does not have is refused, the project is not changed.
 */
export function setFittings(i: WardrobeInput, hw: HardwareCatalogs, change: Pick<FittingsChoice, CatalogKey>): Result {
  const c = hw.fittings,
    known: Record<CatalogKey, (id: string) => boolean> = {
      rodSeriesId: (id) => c.rods.some((r) => r.id === id),
      handleId: (id) => id === 'NONE' || c.handles.some((h) => h.id === id),
      legId: (id) => c.legs.some((l) => l.id === id),
    },
    next: Rec = { ...fittingsChoice(i) };
  for (const [k, v] of Object.entries(change) as [CatalogKey, string | null | undefined][]) {
    if (!(k in known)) return { ok: false, problem: `Неизвестный выбор фурнитуры: ${k}. Проект не изменён.` };
    if (v === undefined) continue;
    if (v !== null && !known[k](v)) return { ok: false, problem: `В каталоге фурнитуры нет позиции ${v}. Проект не изменён.` };
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return { ok: true, input: withChoice(i, next) };
}

/** The choice `next` written into a copy of the project; an empty choice removes state.fittings. */
function withChoice(i: WardrobeInput, next: Rec): WardrobeInput {
  const o = JSON.parse(JSON.stringify(i)) as WardrobeInput;
  if (Object.keys(next).length) (o.state as Rec).fittings = next as JsonValue;
  else delete (o.state as Rec).fittings;
  return o;
}

/** The ids of the sections of the project in their order (`M01-S01`…), as the model names them (canonicalSectionId). */
export function projectSectionIds(i: WardrobeInput): string[] {
  const count = new Map<string, number>();
  return ((i.state as Rec).sections as Rec[]).map((s) => {
    const body = String(s.bodyId),
      n = count.get(body) ?? 0;
    count.set(body, n + 1);
    return canonicalSectionId(body, n);
  });
}

/**
 * Lighting of the project (MOD-DEC-483): the whole wardrobe on or off, or one section (`sectionId`) on or off. Turning
 * a section off while the whole wardrobe is lit lights the others by name.
 */
export function setLighting(i: WardrobeInput, on: boolean, sectionId?: string): Result {
  const next: Rec = { ...fittingsChoice(i) },
    all = projectSectionIds(i);
  if (sectionId !== undefined && !all.includes(sectionId)) return { ok: false, problem: `В проекте нет секции ${sectionId}. Проект не изменён.` };
  const lit = new Set<string>(next.lighting === 'ALL' ? all : Array.isArray(next.lighting) ? next.lighting.filter((x: string) => all.includes(x)) : []);
  if (sectionId === undefined) {
    if (on) all.forEach((x) => lit.add(x));
    else lit.clear();
  } else if (on) lit.add(sectionId);
  else lit.delete(sectionId);
  if (!lit.size) delete next.lighting;
  else next.lighting = lit.size === all.length ? 'ALL' : all.filter((x) => lit.has(x));
  return { ok: true, input: withChoice(i, next) };
}

/**
 * Doors opened by pressing (MOD-DEC-485): on — the doors get the hinges without a spring (BOYARD ЭVO H901) and a latch each,
 * and lose their handles; the drawers and the lift fronts keep their handles. Off removes the choice.
 */
export function setPushToOpen(i: WardrobeInput, on: boolean): Result {
  const next: Rec = { ...fittingsChoice(i) };
  if (on) next.pushToOpen = true;
  else delete next.pushToOpen;
  return { ok: true, input: withChoice(i, next) };
}

/** The lit sections of the project by id (MOD-DEC-483). */
export function litSections(i: WardrobeInput): string[] {
  const l = fittingsChoice(i).lighting;
  return l === 'ALL' ? projectSectionIds(i) : Array.isArray(l) ? l : [];
}

/**
 * The colour of the baskets, trouser racks and pantographs of the project (MOD-DEC-484): white, graphite or black; null
 * puts the default (white) back. A pantograph has no white: it is grey metallic then.
 */
export function setStorageColour(i: WardrobeInput, colour: 'WHITE' | 'GRAPHITE' | 'BLACK' | null): Result {
  if (colour !== null && !['WHITE', 'GRAPHITE', 'BLACK'].includes(colour)) return { ok: false, problem: `Неизвестный цвет фурнитуры наполнения: ${String(colour)}. Проект не изменён.` };
  const next: Rec = { ...fittingsChoice(i) };
  if (colour === null) delete next.storageColour;
  else next.storageColour = colour;
  return { ok: true, input: withChoice(i, next) };
}

/** What the editor offers: the series of rods, the handles and the legs of the catalogue with their default. */
export function fittingsOptions(catalog: FittingsCatalog) {
  const k = fittingsSelection.constants;
  return {
    rods: catalog.rods.map((r) => ({ id: r.id, name: r.name, isDefault: r.id === k.defaultRod.value })),
    handles: catalog.handles.map((h) => ({ id: h.id, name: h.name, isDefault: h.id === k.defaultHandle.value })),
    legs: catalog.legs.map((l) => ({ id: l.id, name: l.name, heightMm: l.heightMm, use: l.use, open: openLegs(catalog).includes(l) })),
    // MOD-DEC-484: the one colour of the baskets, trouser racks and pantographs of the wardrobe.
    storageColours: (['WHITE', 'GRAPHITE', 'BLACK'] as const).map((id) => ({ id, name: { WHITE: 'белый', GRAPHITE: 'графит', BLACK: 'чёрный' }[id], isDefault: id === k.storageColour.value })),
  };
}

/** A choice of the drawers of the project (MOD-DEC-544, R2-007): its value and what the list shows. */
export interface DrawerSystemOption {
  value: DrawerSystemChoice;
  title: string;
}

/**
 * The drawers the project may have: the own box of the board (as before), the series of the level of the hardware, or
 * a series by name (FINDINGS 1876: Эконом BOYARD СТАРТ SOFT, Стандарт Blum TANDEMBOX antaro M, Премиум Blum LEGRABOX pure M).
 */
export function drawerSystemOptions(i: WardrobeInput): DrawerSystemOption[] {
  const tier = ((i.state as Rec).fillingTier as HardwareTier | undefined) ?? null,
    byTier = drawerSystemSeriesOf('TIER', tier)!;
  return [
    { value: null, title: 'Свой короб из плиты' },
    { value: 'TIER', title: `Сборные — по уровню фурнитуры (${byTier.title})` },
    ...drawerSystemSelection.constants.series.value.map((x) => ({ value: x.id, title: `${x.title} — ${TIER_NAMES[x.tier]}` })),
  ];
}

/** The drawers of the project (MOD-DEC-544): a series, 'TIER', or null — the own box. An unknown series is refused. */
export function setDrawerSystem(i: WardrobeInput, choice: DrawerSystemChoice): Result {
  if (choice !== null && choice !== 'TIER' && !drawerSystemSelection.constants.series.value.some((x) => x.id === choice))
    return { ok: false, problem: `Неизвестная серия сборных ящиков: ${String(choice)}. Проект не изменён.` };
  const next: Rec = { ...fittingsChoice(i) };
  if (choice === null) delete next.drawerSystem;
  else next.drawerSystem = choice;
  return { ok: true, input: withChoice(i, next) };
}

/**
 * The runner of the drawers of the own box (MOD-DEC-514, FINDINGS 1862): 'level' — the runner of the level of the
 * hardware by 466, as a new project has it; null — DB4501 of the prototype, as a saved project and the references keep.
 */
export function setDrawerRunner(i: WardrobeInput, runner: 'level' | null): WardrobeInput {
  const next: Rec = { ...fittingsChoice(i) };
  if (runner === null) delete next.drawerRunner;
  else next.drawerRunner = runner;
  return withChoice(i, next);
}
