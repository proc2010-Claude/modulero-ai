// Edits of the fill of the swing wardrobe (task W6): add a shelf, add a clothes rod, change the type of a shelf. Each
// edit is a pure function of the input: it builds the model of the input, places the new element by the owner's
// rules and returns a new input with the notice the user sees. The input given is not changed.
//
// MOD-DEC-193: a new shelf of the wardrobe is fixed; the first one has a clear opening of at least 400 mm over the
// bottom, the next one is +256 mm, over a rod ≥ 50 mm from its top, on the grid of System 32 (196: on by default).
// MOD-DEC-225: the step of 256 mm is reduced when there is no room for it; the first shelf ≥ 400 mm is kept.
// MOD-DEC-290, 310, 333: the top of a new rod is 900 mm over the top of the element below it in the section; if that
// does not fit, the rod goes where it leaves 50 mm to the element above, and the user is told; stored rods do not move.
// MOD-DEC-312: a change of the type keeps the height and changes the fixing; when the height conflicts (a removable
// shelf whose support is off the grid of System 32), it moves to the nearest level, and the user is told.
// W7: add a drawer and remove one, as the filling layer of the prototype does (fiAddDraft r1.html:92065, the delete of
// r1.html:92340): the place of a new drawer is the first free group of System 32 over the bottom; the last drawer
// removed turns the drawers of the section off, and the hinges of its door are chosen again (MOD-DEC-288, 311).
// W9: behind sliding doors a drawer the open leaves do not clear by 5 mm is refused with the width and the shift of
// the section that would admit it (MOD-DEC-175). The prototype kept every drawer of a sliding wardrobe as an
// unconfirmed proposal (pendingDrawer, r1.html:63664) and installed none (FINDINGS 551).
// U2: remove a shelf, move it to a height, «Распределить полки» — the filling layer of the prototype (fiDelete
// r1.html:92314, fiMove r1.html:92232, fiDistribute r1.html:93760; FINDINGS 710–712).
// FIT, third PR (MOD-DEC-484): add a basket, a trouser rack or a pantograph to a section and remove one; the shelves,
// rods and drawers keep off them as off any element of the fill.
import { shelfLowerAboveAxis, selectShelfSupport } from '../engine/policy/shelf-support-selection.js';
import { s32AddShelf, s32Distribute, s32GridBase, s32InitialGroup, s32Q, s32ShelfGeometry, s32Snap, s32Valid, system32 } from '../engine/policy/system32.js';
import { fe04DrawerStep } from '../engine/policy/fe04.js';
import { wardrobeDrawers } from '../engine/policy/wardrobe-drawers.js';
import { wardrobeFill } from '../engine/policy/wardrobe-fill.js';
import type { Rec } from '../engine/policy/project-state.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { carcassModel, MIN_INTERNAL_DRAWER_GAP } from './carcass.js';
import { doorOverExternalDrawer, fmt } from './facades.js';
import { WardrobeStandardPreset } from './standard.js';
import { backInnerFace, ensureSectionConfig, shelfTypeAt, supportDemand } from './fill.js';
import type { JsonValue, WardrobeInput } from './input.js';
import { isSliding, shelfFrontBehindSystem, systemDepth } from './sliding.js';
import { storageRowsOf, type StorageUnit } from './storage.js';
import { fittingsSelection, PULL_OUT_KINDS, storageFor, STORAGE_KIND_RU, type FittingsChoice, type StorageRow } from '../engine/policy/fittings-selection.js';
import type { StorageKind } from '../catalog/hardware/fittings.js';

const C = wardrobeFill.constants,
  S32 = system32.constants;

/** The result of an edit: the new input, what the user is told, the index and the height of the element. */
export interface FillEdit {
  input: WardrobeInput;
  /** Index of the element among the shelves or rods of the section. */
  index: number;
  /** Height of the element over the interior bottom: the middle of a shelf, the axis of a rod. */
  yMm: number;
  notice: string;
  /** The height was changed by a rule and is shown to the user (MOD-DEC-312, 333). */
  adjusted: boolean;
  /** A new rod: the element below it and the one above, by their faces from the floor (OWNER-R7-ROD #3). */
  basis?: { lower: { type: string; topMm: number }; upper: { type: string; bottomMm: number }; topMm: number; axisMm: number };
}

const REFUSALS: Record<string, string> = {
  NO_VALID_LEVEL_ABOVE_THRESHOLD: 'Свободного уровня для полки нет: первая полка — с просветом от 400 мм, следующая — на 256 мм выше, а если места нет — ниже, но с просветом от 100 мм; все такие уровни заняты или выходят за крышу. Проект не изменён.',
};

/** The section of the model, its geometry and the base of the grid (s32Datum r1.html:89534). */
function sectionOf(input: WardrobeInput, hw: HardwareCatalogs, section: number) {
  const m = carcassModel(input, hw),
    s: Rec | undefined = m.sectionsData[section];
  if (!s) throw new Error(`Секции ${section + 1} нет. Проект не изменён.`);
  const mod = m.modules.find((x: Rec) => x.id === s.moduleId),
    g = mod.geometry,
    hasBottom = m.parts.some((p: Rec) => p.id === mod.panelIds.bottom),
    base = hasBottom ? s32GridBase({ bottom_lower: g.bottomBottomY, bottom_t: m.t }) : s32GridBase({ side_lower: g.sideBottomY, lower_boundary: g.interiorBottomY });
  return { m, s, g, t: m.t as number, world: g.interiorBottomY as number, base, system32: !!g.settings.system32Assist };
}

/** A copy of the input and the section of the copy, with the defaults of the fill (ensureSectionConfig). */
function draft(input: WardrobeInput, section: number): { out: WardrobeInput; cfg: Rec } {
  const out = structuredClone(input),
    cfg = ensureSectionConfig((out.state.sections as Rec[])[section]!);
  return { out, cfg };
}

/** A new id of the filling, unique in the project (fiId r1.html:91838). */
export function fillingId(d: Rec, prefix: string): string {
  const used = new Set((d.sections as Rec[]).flatMap((s) => (s.filling ? Object.values(s.filling).flatMap((v: any) => (Array.isArray(v) ? v.map((r) => r.id) : v?.id ? [v.id] : [])) : [])));
  let id: string;
  do {
    d.fillingSequence = (d.fillingSequence || 0) + 1;
    id = prefix + '-' + d.fillingSequence;
  } while (used.has(id));
  return id;
}

/** Ids of the shelves of a section, one per shelf (v17ShelfIds r1.html:53912). */
function shelfIds(cfg: Rec): string[] {
  cfg.shelfUids ??= [];
  while (cfg.shelfUids.length < (cfg.shelfCount || 0)) {
    cfg.shelfSequence = (cfg.shelfSequence || 0) + 1;
    cfg.shelfUids.push((cfg.uiSectionId || 'section') + '-SHELF-' + cfg.shelfSequence);
  }
  cfg.shelfUids.length = Math.min(cfg.shelfUids.length, cfg.shelfCount || 0);
  return cfg.shelfUids;
}

/** Vertical intervals of the elements of a section from the floor: shelves, the shelf over the drawers, rods, storage items (484). */
function elements(s: Rec, t: number, world: number, rodHeight: number = C.rodVerticalSize.value): { type: string; lo: number; hi: number }[] {
  const half = rodHeight / 2;
  return [
    ...s.shelfYs.map((y: number) => ({ type: 'shelf', lo: world + y - t / 2, hi: world + y + t / 2 })),
    ...(s.topShelfY !== undefined && s.coverShelfIndex < 0 && !s.coverIsRoof ? [{ type: 'shelf', lo: world + s.topShelfY - t / 2, hi: world + s.topShelfY + t / 2 }] : []),
    ...s.rodYs.map((y: number) => ({ type: 'rod', lo: world + y - half, hi: world + y + half })),
    ...storageOf(s).map((u) => ({ type: 'storage', lo: u.box.y0, hi: u.box.y1 })),
  ].sort((a, b) => a.lo - b.lo);
}

/** The storage items of a section of the model that have an item (MOD-DEC-484): they take their height of the frame. */
const storageOf = (s: Rec): StorageUnit[] => ((s.storage ?? []) as StorageUnit[]).filter((u) => u.itemId);

/**
 * The level of a shelf under +256 mm when that has no room (MOD-DEC-225): the valid level of the grid nearest to the
 * threshold below it and over the highest shelf, or null. The clearances to the other elements are the obstacles of
 * the edit; with System 32 off the levels are whole millimetres of the upper face (196).
 */
function reducedLevel(threshold: number, previous: number, t: number, a: number, z0: number, bounds: number[], obstacles: number[][], enabled: boolean) {
  const top = Math.min(threshold, bounds[1]! - t + a),
    step = enabled ? S32.step.value : S32.integerStep.value;
  for (let axis = enabled ? s32Snap(top, z0, 'floor') : Math.floor(top - a + t + S32.epsilon.value) - t + a; axis > previous + S32.epsilon.value; axis -= step)
    if (s32Valid(axis, t, a, bounds, obstacles)) return s32ShelfGeometry(axis, t, a);
  return null;
}

/**
 * Adds a fixed shelf to the section `section` (MOD-DEC-193; u13InsertElement of System 32, r1.html:89708): over the
 * highest shelf by +256 mm, the first one with a clear opening of 400 mm over the bottom; `overRod` — the index of a
 * rod the shelf goes over (≥ 50 mm from the top of the rod). Over any rod of the section a shelf keeps 50 mm from the
 * top of the rod (193), under it the prototype's 40 mm (FINDINGS 270). When +256 mm has no room, the step is reduced
 * to the nearest valid level below it and the user is told (225, FINDINGS 277). The prototype added the second shelf
 * 32 mm over the first one (WR-08, FINDINGS 277).
 */
export function addShelf(input: WardrobeInput, hw: HardwareCatalogs, section: number, options: { overRod?: number } = {}): FillEdit {
  const { s, t, world, base, system32, g } = sectionOf(input, hw, section),
    ys: number[] = s.shelfYs.slice();
  if (ys.length >= C.maxShelves.value) throw new Error(`В секции уже ${C.maxShelves.value} полок — это предел. Проект не изменён.`);
  // MOD-DEC-484: the height of the frame of a storage item holds its own clearance (the «MIN» of the kit).
  const below: Record<string, number> = { shelf: C.minShelfClearance.value, rod: C.mixedClearance.value, storage: 0 },
    above: Record<string, number> = { shelf: C.minShelfClearance.value, rod: S32.aboveRodClear.value, storage: 0 },
    obstacles = elements(s, t, world).map((e) => [e.lo - below[e.type]!, e.hi + above[e.type]!]),
    rodY = options.overRod === undefined ? undefined : s.rodYs[options.overRod];
  if (options.overRod !== undefined && rodY === undefined) throw new Error('Такой штанги в секции нет. Проект не изменён.');
  const bounds = [s.topShelfY !== undefined && !s.coverIsRoof ? world + s.topShelfY + t / 2 : base.lowerBoundary, g.interiorTopY],
    previous = ys.length ? world + Math.max(...ys) : null;
  let r,
    notice = 'Полка добавлена по монтажной базе.',
    adjusted = false;
  try {
    r = s32AddShelf({ z0: base.z0, t, axis_from_lower: t / 2, bounds, previous_axis: previous, obstacles, rod: rodY === undefined ? null : { axis: world + rodY, verticalSize: C.rodVerticalSize.value } }, system32);
  } catch (e) {
    const reduced = (e as Error).message === 'NO_VALID_LEVEL_ABOVE_THRESHOLD' && previous !== null && rodY === undefined ? reducedLevel(previous + S32.shelfStep.value, previous, t, t / 2, base.z0, bounds, obstacles, system32) : null;
    if (!reduced) throw new Error(REFUSALS[(e as Error).message] ?? `Полку не добавить: ${(e as Error).message}. Проект не изменён.`);
    r = reduced;
    adjusted = true;
    notice = `Полка добавлена с уменьшенным шагом ${String(s32Q(reduced.axis - previous!)).replace('.', ',')} мм: на ${S32.shelfStep.value} мм выше верхней полки места нет (MOD-DEC-225).`;
  }
  const y = s32Q(r.lower + t / 2 - world),
    i = ys.filter((v) => v < y).length,
    { out, cfg } = draft(input, section),
    count = ys.length;
  cfg.shelfCount = count;
  shelfIds(cfg);
  cfg.shelfSequence = (cfg.shelfSequence || 0) + 1;
  const insert = (key: string, values: unknown[], v: unknown) => {
    values.splice(i, 0, v);
    cfg[key] = values;
  };
  insert('shelfUids', cfg.shelfUids.slice(), cfg.uiSectionId + '-SHELF-' + cfg.shelfSequence);
  insert('shelfTypes', ys.map((_, k) => shelfTypeAt(cfg, k)), 'fixedShelf');
  insert('shelfLoadsKg', ys.map((_, k) => cfg.shelfLoadsKg?.[k] ?? C.payloadKg.value), C.payloadKg.value);
  insert('shelfDepths', ys.map((_, k) => cfg.shelfDepths?.[k] ?? null), null);
  if (Array.isArray(cfg.shelfSupportOffsets)) insert('shelfSupportOffsets', ys.map((_, k) => cfg.shelfSupportOffsets[k] ?? null), null);
  ys.splice(i, 0, y);
  Object.assign(cfg, { shelvesEnabled: true, shelfCount: ys.length, shelfPositions: ys });
  // The row of the filling belongs to the shelf of the same index; front and rear as the shelves without a row.
  if (cfg.filling) cfg.filling.shelf.splice(i, 0, { id: cfg.shelfUids[i], front: C.frontSetback.value, rear: g.depth - backInnerFace(g) });
  return { input: out, index: i, yMm: y, notice, adjusted };
}

/**
 * Adds a clothes rod to the section `section` (MOD-DEC-290, 310, 333). The rod goes into the largest free span between
 * the elements of the section (Д): its top is 900 mm over the top of the element below it — the bottom, a shelf or a
 * rod; when that leaves less than 50 mm to the element above, the top is 50 mm under that element, and the user is
 * told. The prototype put a new rod at 0.7 of the clear height (FINDINGS 278). `profileHeightMm` is the height of the
 * rod section; without a rod catalogue (233) it is not known and the prototype's 20 mm is used. Tops, axes and
 * bottoms are faces from the floor; the stored height is the axis over the interior bottom.
 */
export function addRod(input: WardrobeInput, hw: HardwareCatalogs, section: number, options: { profileHeightMm?: number } = {}): FillEdit {
  const { s, t, world, g } = sectionOf(input, hw, section);
  if (!(input.state.sections as Rec[])[section]!.filling && s.rodYs.length >= 2) throw new Error('В секции без наполнения — не больше двух штанг. Проект не изменён.');
  const h = options.profileHeightMm ?? C.rodVerticalSize.value,
    half = h / 2,
    list = elements(s, t, world, h),
    bounds = [{ type: 'bottom', lo: g.interiorBottomY, hi: g.interiorBottomY }, ...list, { type: 'roof', lo: g.interiorTopY, hi: g.interiorTopY }],
    spans = bounds.slice(1).map((above, k) => ({ below: bounds[k]!, above, free: above.lo - bounds[k]!.hi })),
    best = spans.reduce((a, b) => (b.free > a.free + C.compare.value ? b : a));
  let top = best.below.hi + C.rodOverLower.value,
    adjusted = false;
  if (top > best.above.lo - C.rodUnderUpper.value) {
    top = best.above.lo - C.rodUnderUpper.value;
    adjusted = true;
  }
  if (top - h < best.below.hi) throw new Error('Для штанги нет места: между элементами секции меньше высоты штанги и зазора 50 мм. Проект не изменён.');
  const y = s32Q(top - half - world),
    { out, cfg } = draft(input, section),
    rods: number[] = s.rodYs.slice(),
    i = rods.filter((v) => v < y).length;
  rods.splice(i, 0, y);
  Object.assign(cfg, { rodCount: rods.length, rodPositions: rods });
  if (cfg.filling) cfg.filling.rod.splice(i, 0, { id: fillingId(out.state as Rec, 'rod'), depthAxis: s.geometry.depth / 2, system: 'BASE_ROD', supportKit: 'BASE_AUTOMATIC_PAIR' });
  const gap = Math.round(best.above.lo - top),
    over = Math.round(top - best.below.hi),
    lower = best.below.type === 'bottom' ? 'дна' : best.below.type === 'shelf' ? `полки на ${Math.round(best.below.hi)} мм от пола` : `штанги на ${Math.round(best.below.hi)} мм от пола`;
  return {
    input: out,
    index: i,
    yMm: y,
    adjusted,
    basis: { lower: { type: best.below.type, topMm: best.below.hi }, upper: { type: best.above.type, bottomMm: best.above.lo }, topMm: top, axisMm: top - half },
    notice: adjusted
      ? `Штанга добавлена ниже 900 мм: верх штанги на ${over} мм выше верха ${lower}, до элемента сверху — ${gap} мм (MOD-DEC-333).`
      : `Штанга добавлена: верх штанги на 900 мм выше верха ${lower} (MOD-DEC-310).`,
  };
}

/**
 * Changes the type of the shelf `index` (MOD-DEC-312; 225): the height is kept and the fixing changes — confirmats for
 * a fixed shelf, shelf supports for a removable one. With System 32 on, a removable shelf whose support axis is off the
 * grid has a conflicting height: it moves to the nearest level of the grid, and the user is told. Old keys and stored
 * projects are not renamed: only this shelf gets the new type.
 */
export function changeShelfType(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, type: 'fixedShelf' | 'adjustableShelf'): FillEdit {
  const { m, s, t, world, base, system32 } = sectionOf(input, hw, section),
    y: number | undefined = s.shelfYs[index];
  if (y === undefined) throw new Error('Такой полки в секции нет. Проект не изменён.');
  const { out, cfg } = draft(input, section),
    types = s.shelfYs.map((_: number, k: number) => shelfTypeAt(cfg, k));
  if (types[index] === type) return { input: out, index, yMm: y, notice: 'Тип полки не изменился.', adjusted: false };
  types[index] = type;
  cfg.shelfTypes = types;
  let next = y,
    notice = type === 'fixedShelf' ? 'Полка стала фиксированной: высота сохранена, крепление — конфирматы.' : 'Полка стала съёмной: высота сохранена, крепление — полкодержатели.';
  if (type === 'adjustableShelf' && system32) {
    const shelf = m.parts.find((p: Rec) => p.id === `${s.id}-SHELF${String(index + 1).padStart(2, '0')}`),
      selection = shelf ? selectShelfSupport(supportDemand(shelf, t, (input.state as Rec).fillingTier ?? null), hw.shelfSupports) : { chosen: null },
      support = selection.chosen ? hw.shelfSupports.supports.find((x) => x.id === selection.chosen!.supportId) : undefined,
      above = support ? shelfLowerAboveAxis(support).valueMm : null;
    if (above !== null) {
      const axis = world + y - t / 2 - above,
        level = s32Snap(axis, base.z0, 'nearest');
      if (Math.abs(level - axis) > C.compare.value) {
        next = s32Q(y + level - axis);
        const shift = s32Q(next - y);
        notice = `Полка стала съёмной: ось полкодержателя ${support!.article} не на сетке System 32, полка перенесена на ${shift > 0 ? '+' : ''}${String(shift).replace('.', ',')} мм к ближайшему уровню (MOD-DEC-312).`;
      }
    }
  }
  if (next !== y) {
    const ys = s.shelfYs.slice();
    ys[index] = next;
    cfg.shelfPositions = ys;
  } else if (!Array.isArray(cfg.shelfPositions) || cfg.shelfPositions.length !== s.shelfYs.length) cfg.shelfPositions = s.shelfYs.slice();
  return { input: out, index, yMm: next, notice, adjusted: next !== y };
}

/**
 * The filling layer of a section (fiMeta r1.html:91847): created when the section has none, with a row for each shelf,
 * drawer and rod the section already has — a shelf keeps its id and its setbacks from the part of the model.
 */
export function fillingOf(d: Rec, cfg: Rec, m: Rec, section: number): Rec {
  cfg.filling ??= { schema: 1, shelf: [], drawer: [], rod: [], groups: [], partitions: [], cover: null };
  const f = cfg.filling,
    a: Rec | undefined = m.sectionsData[section];
  for (const type of ['shelf', 'drawer', 'rod'] as const) {
    f[type] ??= [];
    const n = type === 'shelf' ? (cfg.shelvesEnabled ? cfg.shelfCount : 0) : type === 'drawer' ? (cfg.drawersEnabled ? cfg.drawerCount : 0) : cfg.rodCount || 0;
    while (f[type].length < n) {
      const k = f[type].length,
        // A section not in the model yet (the right one of «Добавить перегородку», fiSplit) has no parts: no setbacks, as in r1.
        part = type === 'shelf' && a ? m.parts.find((p: Rec) => p.id === `${a.id}-SHELF${String(k + 1).padStart(2, '0')}`) : null;
      f[type].push({
        id: type === 'shelf' && cfg.shelfUids?.[k] ? cfg.shelfUids[k] : fillingId(d, type),
        // The prototype writes `construction: undefined` for shelves and rods; a stored project has no such key.
        ...(part ? { front: part.worldBox?.z0 ?? part.frontSetback ?? C.frontSetback.value, rear: a!.geometry.depth - (part.worldBox?.z1 ?? a!.geometry.depth) } : {}),
        ...(type === 'drawer' ? { construction: 'MADE_BOX', execution: cfg.drawerMode || 'internal' } : {}),
      });
    }
    f[type].length = n;
  }
  f.groups ??= [];
  f.partitions ??= [];
  return f;
}

/**
 * Adds a drawer to the section `section` (fiAddDraft r1.html:92065, one drawer): the box of the section's height goes
 * to the lowest group of System 32 where it and the shelf over it are free of the shelves, drawers and rods of the
 * section (s32InitialGroup); the shelf over the drawers belongs to the new drawer. An internal drawer behind a door
 * makes the hinges of the door zero-protrusion where the catalogue has them (MOD-DEC-288) or puts a spacer (331, 360);
 * an external drawer behind a door is refused (WR-30).
 */
export function addDrawer(input: WardrobeInput, hw: HardwareCatalogs, section: number, options: { execution?: 'internal' | 'external' } = {}): FillEdit {
  const { m, s, t, world, base, system32, g } = sectionOf(input, hw, section),
    stored: Rec = (input.state.sections as Rec[])[section]!,
    execution = options.execution ?? stored.drawerMode ?? 'internal';
  if (s.drawers.length >= wardrobeDrawers.constants.maxDrawers.value) throw new Error(`В секции уже ${s.drawers.length} ящиков — это предел. Проект не изменён.`);
  const height: number = stored.drawerBoxHeight || WardrobeStandardPreset.drawerBoxHeight,
    blocked = [
      ...s.shelfYs.map((y: number) => [world + y - t / 2, world + y + t / 2]),
      // A drawer keeps its gap above free (fill_drawers_internal_2: 16, 208 — FINDINGS 395).
      ...s.drawers.map((v: Rec) => [world + v.bottom, world + v.bottom + v.boxHeight + v.gapAbove]),
      ...s.rodYs.map((y: number) => [world + y - C.rodVerticalSize.value / 2, world + y + C.rodVerticalSize.value / 2]),
      // MOD-DEC-484: a basket, a trouser rack or a pantograph of the section keeps its height of the frame.
      ...storageOf(s).map((u) => [u.box.y0, u.box.y1]),
    ];
  // The lowest group of the grid from `floor` up (s32InitialGroup), its box bottom over the interior bottom, or null.
  const groupFrom = (floor: number): number | null => {
    try {
      return s32Q(s32InitialGroup({ z0: base.z0, heights: [height], gaps: [], shelf_t: t, shelf_a: t / 2, bounds: [floor, g.interiorTopY], obstacles: blocked }, system32).boxes[0]![0]! - world);
    } catch {
      return null;
    }
  };
  const first = groupFrom(world);
  if (first === null) throw new Error('Для ящика нет места: над дном секции нет свободной высоты для короба и полки над ним. Проект не изменён.');
  const { out, cfg } = draft(input, section),
    f = fillingOf(out.state as Rec, cfg, m, section),
    gap = wardrobeFill.constants.coverGap.value,
    row = { id: fillingId(out.state as Rec, 'drawer'), construction: 'MADE_BOX', execution };
  // The places of the drawers the section has are kept: stored ones, else those the rules gave them (the model).
  cfg.drawerPositions = [...s.drawers.map((v: Rec) => v.bottom), first];
  cfg.drawerHeights = [...s.drawers.map((v: Rec) => v.boxHeight), height];
  cfg.drawerGaps = [...s.drawers.map((v: Rec) => v.gapAbove), gap];
  f.drawer.push(row);
  Object.assign(cfg, { drawersEnabled: true, drawerCount: f.drawer.length, drawerCoverClearance: gap, system32Pair: true });
  f.cover = { id: f.cover?.id ?? fillingId(out.state as Rec, 'cover'), ownerId: row.id, gap, front: C.frontSetback.value, rear: g.depth - backInnerFace(g), removed: false };
  if (doorOverExternalDrawer(cfg))
    throw new Error('Наружный ящик за распашной дверью не добавить: фасад ящика и дверь заняли бы один объём; уберите дверь секции или выберите внутренний ящик (WR-30). Проект не изменён.');
  // FE-04 (MOD-DEC-050): the hinges of the door have tried their ladder in the build; when they still meet the new
  // drawer, the drawer the rules just placed goes up by the step of the grid to the first place with no new conflict.
  // Stored drawers do not move (053). Without such a place the drawer stays and the conflict is the user's warning.
  const conflicts = (x: WardrobeInput) => (carcassModel(x, hw).hingeMechanisms as Rec[]).reduce((n, h) => n + (h.fe04?.conflicts.length ?? 0), 0),
    allowed = (m.hingeMechanisms as Rec[]).reduce((n, h) => n + (h.fe04?.conflicts.length ?? 0), 0),
    step = fe04DrawerStep(system32);
  let y = first;
  if (conflicts(out) > allowed)
    for (let next = groupFrom(world + first + step); next !== null; next = groupFrom(world + next + step)) {
      cfg.drawerPositions[cfg.drawerPositions.length - 1] = next;
      if (conflicts(out) <= allowed) {
        y = next;
        break;
      }
    }
  cfg.drawerPositions[cfg.drawerPositions.length - 1] = y;
  // MOD-DEC-175: behind sliding doors the open leaves clear the new drawer by 5 mm, or it is not added (FINDINGS 551).
  const known = new Set((m.sectionsData as Rec[]).flatMap((x) => (x.drawers as Rec[]).map((v) => v.id))),
    access: Rec | undefined = (carcassModel(out, hw).sliding?.access.drawers as Rec[] | undefined)?.find((x) => !known.has(x.drawerId))?.nominal;
  if (access?.status === 'BLOCKED') throw new Error(`Ящик не добавить: ${access.proposal.text}. Проект не изменён.`);
  const kind = execution === 'external' ? 'Наружный ящик' : 'Внутренний ящик';
  if (y !== first)
    return { input: out, index: f.drawer.length - 1, yMm: y, adjusted: true, notice: `${kind} добавлен на ${fmt(y - first)} мм выше: петля двери на своей лестнице не уходит от него, ящик поднят по шагу ${fmt(step)} мм (FE-04, MOD-DEC-050).` };
  return { input: out, index: f.drawer.length - 1, yMm: y, notice: `${kind} добавлен.`, adjusted: false };
}

/**
 * Removes the drawer `index` of the section `section` (the delete of the filling layer, r1.html:92340): its places,
 * heights and gaps go with it. The shelf over the drawers it owned goes back to the highest drawer left, as «Добавить
 * ящик» gave it to the new one (MOD-DEC-223, R2-017, FINDINGS 1760; r1 removed it); with the last drawer, or when it
 * has no room over the drawer left, it is removed and is not restored (C13-03). The last drawer removed turns the
 * drawers of the section off: the hinges of the door are chosen again (MOD-DEC-311).
 */
export function removeDrawer(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): FillEdit {
  const { m, s, t, g } = sectionOf(input, hw, section),
    drawer: Rec | undefined = s.drawers[index];
  if (!drawer) throw new Error('Такого ящика в секции нет. Проект не изменён.');
  const { out, cfg } = draft(input, section),
    f = fillingOf(out.state as Rec, cfg, m, section),
    row = f.drawer[index],
    owned = f.cover?.ownerId === row.id && !f.cover.removed;
  if (owned && f.partitions.some((p: Rec) => p.lowerId === f.cover.id)) throw new Error('На полке над ящиками стоит перегородка: сначала уберите её. Проект не изменён.');
  cfg.drawerPositions = s.drawers.map((v: Rec) => v.bottom);
  cfg.drawerHeights = s.drawers.map((v: Rec) => v.boxHeight);
  cfg.drawerGaps = s.drawers.map((v: Rec) => v.gapAbove);
  f.drawer.splice(index, 1);
  for (const key of ['drawerPositions', 'drawerHeights', 'drawerGaps']) cfg[key].splice(index, 1);
  cfg.drawerCount = f.drawer.length;
  cfg.drawersEnabled = !!cfg.drawerCount;
  for (const gr of f.groups) gr.members = gr.members.filter((id: string) => id !== row.id);
  f.groups = f.groups.filter((gr: Rec) => gr.members.length > 1);
  let notice = cfg.drawersEnabled ? 'Ящик удалён.' : 'Ящик удалён; в секции ящиков больше нет — петли двери выбраны заново (MOD-DEC-311).';
  if (owned) {
    const left = (s.drawers as Rec[]).map((v, k) => ({ k, top: v.bottom + v.boxHeight })).filter((v) => v.k !== index),
      top = left.sort((a, b) => b.top - a.top)[0];
    f.cover.ownerId = top ? f.drawer[top.k < index ? top.k : top.k - 1].id : null;
    if (!top || !coverFits(out, hw, section, t, g)) {
      f.cover.removed = true;
      f.cover.ownerId = null;
      if (top) notice = 'Ящик удалён; полка над ящиками убрана: над оставшимся ящиком ей нет места.';
    }
  }
  return { input: out, index, yMm: drawer.bottom, notice, adjusted: false };
}

/** Whether the shelf over the drawers of the section of `out` stands with the clear openings of the fill (checkPlaced). */
function coverFits(out: WardrobeInput, hw: HardwareCatalogs, section: number, t: number, g: Rec): boolean {
  const sNew: Rec | undefined = carcassModel(out, hw).sectionsData[section];
  if (!sNew || sNew.topShelfY === undefined) return false;
  if (sNew.coverShelfIndex >= 0 || sNew.coverIsRoof) return true;
  try {
    checkPlaced(sNew, t, g, 0, [`${sNew.id}-SHELF-DRAWER-COVER`], 'Полка над ящиками');
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- U2: remove, move and distribute shelves

/** The per-shelf lists of the stored section, in the order of the shelves (fiDelete r1.html:92314, v17 r1.html:54041). */
const SHELF_KEYS = ['shelfPositions', 'shelfTypes', 'shelfLoadsKg', 'shelfDepths', 'shelfSupportOffsets', 'shelfUids'] as const;

/**
 * The stored lists of the shelves of a section frozen from the model (fiFreeze r1.html:91955): positions, types, loads,
 * depths and ids get one entry per shelf the model has, so that a removal or a new order keeps each shelf's own values.
 */
function freezeShelves(cfg: Rec, ys: number[]) {
  cfg.shelfCount = ys.length;
  shelfIds(cfg);
  cfg.shelfPositions = ys.slice();
  cfg.shelfTypes = ys.map((_, k) => shelfTypeAt(cfg, k));
  cfg.shelfLoadsKg = ys.map((_, k) => cfg.shelfLoadsKg?.[k] ?? C.payloadKg.value);
  cfg.shelfDepths = ys.map((_, k) => cfg.shelfDepths?.[k] ?? null);
  if (Array.isArray(cfg.shelfSupportOffsets)) cfg.shelfSupportOffsets = ys.map((_, k) => cfg.shelfSupportOffsets[k] ?? null);
}

/** Whether the shelf `k` carries something of the fill: the shelf over the drawers, over a rod, or a local partition. */
function shelfHeld(s: Rec, cfg: Rec, k: number): string | null {
  if (s.coverShelfIndex === k) return 'Это полка над ящиками: она стоит над верхним ящиком и переходит вместе с ним.';
  const row = cfg.filling?.shelf?.[k];
  if (row?.link) return 'Это полка над штангой: она переходит вместе со штангой.';
  if (row && cfg.filling.partitions?.some((p: Rec) => p.lowerId === row.id || p.upperId === row.id)) return 'На полке стоит перегородка: сначала уберите её.';
  return null;
}

/**
 * The elements of a section from the floor that bound a shelf (planObstacles r1.html:13451): the shelves with their
 * index, the shelf over the drawers when it is not one of them, the rods and the drawers.
 */
function obstaclesOf(s: Rec, t: number, world: number): { type: string; k: number; lo: number; hi: number }[] {
  return [
    ...s.shelfYs.map((y: number, k: number) => ({ type: 'shelf', k, lo: world + y - t / 2, hi: world + y + t / 2 })),
    ...(s.topShelfY !== undefined && s.coverShelfIndex < 0 && !s.coverIsRoof ? [{ type: 'cover', k: -1, lo: world + s.topShelfY - t / 2, hi: world + s.topShelfY + t / 2 }] : []),
    ...s.rodYs.map((y: number, k: number) => ({ type: 'rod', k, lo: world + y - C.rodVerticalSize.value / 2, hi: world + y + C.rodVerticalSize.value / 2 })),
    ...s.drawers.map((v: Rec, k: number) => ({ type: 'drawer', k, lo: world + v.bottom, hi: world + v.bottom + v.boxHeight })),
    ...storageOf(s).map((u, k) => ({ type: 'storage', k, lo: u.box.y0, hi: u.box.y1 })),
  ].sort((a, b) => a.lo - b.lo);
}

/** The least clear opening of a shelf to an element (requiredVerticalClearance r1.html:13519; 193): `under` — the element is under the shelf. */
function clearTo(type: string, under: boolean): number {
  if (type === 'bottom' || type === 'roof' || type === 'storage') return 0;
  if (type === 'shelf') return C.minShelfClearance.value;
  return type === 'rod' && under ? S32.aboveRodClear.value : C.mixedClearance.value;
}

/** A check of the edit: the model of the new input has exactly these shelves, otherwise the edit is refused. */
function sameShelves(out: WardrobeInput, hw: HardwareCatalogs, section: number, ys: number[], what: string) {
  const got: number[] = carcassModel(out, hw).sectionsData[section]?.shelfYs ?? [];
  if (got.length !== ys.length || got.some((y, k) => Math.abs(y - ys[k]!) > C.compare.value)) throw new Error(`${what}: полки секции не встают на эти высоты. Проект не изменён.`);
}

/**
 * Removes the shelf `index` of the section (fiDelete r1.html:92314): its row of the filling and its entries of the
 * per-shelf lists go, the other shelves keep their heights, types and ids. A rod that had this shelf over it loses the
 * link (the rod stays, MOD-DEC-310). The shelf over the drawers is not removed here: it belongs to the drawers.
 */
export function removeShelf(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): FillEdit {
  const { m, s } = sectionOf(input, hw, section),
    y: number | undefined = s.shelfYs[index];
  if (y === undefined) throw new Error('Такой полки в секции нет. Проект не изменён.');
  if (s.coverShelfIndex === index) throw new Error('Это полка над ящиками: она уходит вместе с ящиками. Проект не изменён.');
  const { out, cfg } = draft(input, section);
  freezeShelves(cfg, s.shelfYs);
  const f = cfg.filling ? fillingOf(out.state as Rec, cfg, m, section) : null,
    row = f?.shelf[index];
  if (f && row) {
    for (const p of f.partitions.filter((p: Rec) => p.lowerId === row.id)) p.orphan = true;
    for (const p of f.partitions.filter((p: Rec) => p.upperId === row.id)) Object.assign(p, { upperId: null, upperWorld: p.bottom + p.height, roof: false });
    for (const r of f.rod) if (r.coverId === row.id) delete r.coverId;
    f.shelf.splice(index, 1);
  }
  const uid = cfg.shelfUids[index];
  for (const key of SHELF_KEYS) cfg[key]?.splice(index, 1);
  // A door seam bound to the removed shelf (MOD-DEC-362) has nothing to follow.
  if (Array.isArray(out.state.seamBindings)) out.state.seamBindings = (out.state.seamBindings as Rec[]).filter((b) => !(b.sectionId === cfg.uiSectionId && b.shelfId === uid));
  cfg.shelfCount = cfg.shelfPositions.length;
  cfg.shelvesEnabled = cfg.shelfCount > 0;
  if (!cfg.shelvesEnabled) cfg.shelfPositions = null;
  return { input: out, index, yMm: y, notice: cfg.shelvesEnabled ? 'Полка удалена.' : 'Полка удалена; в секции полок больше нет.', adjusted: false };
}

/**
 * Moves the shelf `index` so that its middle is `yMm` over the interior bottom (fiMove r1.html:92232, the clearances of
 * resolveVerticalPlacement r1.html:13519). With System 32 on, a removable shelf goes to the nearest level of the grid
 * of its support (MOD-DEC-312), the user is told; a fixed shelf stays where it is entered; with System 32 off the
 * upper face is in whole millimetres (196). The shelf keeps 100 mm to another shelf, 40 mm to a drawer and under a
 * rod, 50 mm over a rod (193, FINDINGS 270). A shelf that passes another one takes its place in the order with its own
 * type, load, depth and id.
 */
export function moveShelf(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, yMm: number): FillEdit {
  const { m, s, t, world, base, system32, g } = sectionOf(input, hw, section),
    y0: number | undefined = s.shelfYs[index];
  if (y0 === undefined) throw new Error('Такой полки в секции нет. Проект не изменён.');
  if (!Number.isFinite(yMm)) throw new Error('Введите высоту полки в миллиметрах. Проект не изменён.');
  const { out, cfg } = draft(input, section),
    held = shelfHeld(s, cfg, index);
  if (held) throw new Error(held + ' Проект не изменён.');
  let y = yMm,
    notice = 'Полка перенесена.',
    adjusted = false;
  const type = shelfTypeAt(cfg, index);
  if (system32 && type === 'adjustableShelf') {
    const above = supportAbove(m, input, hw, s, t, index);
    if (above === null) throw new Error('Монтажная ось полкодержателя неизвестна: съёмную полку не поставить на сетку System 32. Проект не изменён.');
    const axis = world + yMm - t / 2 - above,
      level = s32Snap(axis, base.z0, 'nearest');
    y = s32Q(yMm + level - axis);
  } else if (!system32) y = Math.round(world + yMm + t / 2) - world - t / 2;
  if (Math.abs(y - yMm) > C.compare.value) {
    adjusted = true;
    notice = `Полка перенесена на ${fmt(y)} мм: ${system32 ? 'съёмная полка стоит на уровне сетки System 32 (MOD-DEC-312)' : 'верх полки — в целых миллиметрах (MOD-DEC-196)'}.`;
  }
  const lo = world + y - t / 2,
    hi = lo + t,
    others = obstaclesOf(s, t, world).filter((e) => !(e.type === 'shelf' && e.k === index));
  if (lo < g.interiorBottomY - C.compare.value || hi > g.interiorTopY + C.compare.value) throw new Error('Полка выходит за дно или крышу секции. Проект не изменён.');
  for (const e of others) {
    // e under the shelf: the gap is lo − e.hi; e over the shelf: e.lo − hi.
    const gap = e.hi <= lo + C.compare.value ? lo - e.hi : e.lo >= hi - C.compare.value ? e.lo - hi : -1,
      need = clearTo(e.type, e.hi <= lo + C.compare.value);
    if (gap < need - C.compare.value) throw new Error(`Полке не хватает места: до ${e.type === 'rod' ? 'штанги' : e.type === 'drawer' ? 'ящика' : e.type === 'cover' ? 'полки над ящиками' : 'соседней полки'} нужно не меньше ${need} мм. Проект не изменён.`);
  }
  freezeShelves(cfg, s.shelfYs);
  const ys = s.shelfYs.slice();
  ys[index] = y;
  const order = ys.map((v: number, k: number) => ({ v, k })).sort((a: { v: number }, b: { v: number }) => a.v - b.v),
    next = order.findIndex((o: { k: number }) => o.k === index);
  for (const key of SHELF_KEYS) if (Array.isArray(cfg[key])) cfg[key] = order.map((o: { k: number }) => (key === 'shelfPositions' ? ys[o.k] : cfg[key][o.k]));
  if (cfg.filling?.shelf?.length === ys.length) cfg.filling.shelf = order.map((o: { k: number }) => cfg.filling.shelf[o.k]);
  sameShelves(out, hw, section, order.map((o: { v: number }) => o.v), 'Полку не перенести');
  return { input: out, index: next, yMm: y, notice, adjusted };
}

/**
 * The levels a dragged element of the fill snaps to: its height over the interior bottom — the middle of a shelf, the
 * axis of a rod, the bottom of a drawer — is `baseMm + n · stepMm` within [minMm, maxMm].
 */
export interface DragLevels {
  /** The height of the element now. */
  yMm: number;
  baseMm: number;
  stepMm: number;
  minMm: number;
  maxMm: number;
  /** The elements that move with it (`…-SHELF-DRAWER-COVER` over a drawer, a shelf over a rod): they keep their distance. */
  alsoMoves: string[];
}

/**
 * The levels a shelf dragged on the drawing snaps to (fiDragTarget r1.html:94292; FINDINGS 1071). With System 32 on,
 * the mounting axis of the shelf is on the grid of the section: the middle of a fixed shelf (axis_from_lower t/2, as
 * addShelf and distributeShelves place it), the support of a removable one (MOD-DEC-312); with System 32 off — the
 * upper face in whole millimetres (196). The shelf stays inside the section; the clearances to the other elements are
 * checked by moveShelf when the shelf is dropped. A shelf moveShelf does not move is refused here with its reason.
 */
export function shelfDragLevels(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): DragLevels {
  const { m, s, t, world, base, system32, g } = sectionOf(input, hw, section),
    y0: number | undefined = s.shelfYs[index];
  if (y0 === undefined) throw new Error('Такой полки в секции нет. Проект не изменён.');
  const { cfg } = draft(input, section),
    held = shelfHeld(s, cfg, index);
  if (held) throw new Error(held + ' Проект не изменён.');
  let a = t / 2;
  if (system32 && shelfTypeAt(cfg, index) === 'adjustableShelf') {
    const above = supportAbove(m, input, hw, s, t, index);
    if (above === null) throw new Error('Монтажная ось полкодержателя неизвестна: съёмную полку не поставить на сетку System 32. Проект не изменён.');
    a = -above;
  }
  return {
    yMm: y0,
    baseMm: system32 ? s32Q(base.z0 - world - a + t / 2) : -world - t / 2,
    stepMm: system32 ? S32.step.value : S32.integerStep.value,
    minMm: g.interiorBottomY - world + t / 2,
    maxMm: g.interiorTopY - world - t / 2,
    alsoMoves: [],
  };
}

/** The axis of the support of the removable shelf `k` under its lower face, mm (changeShelfType; s32AxisOffset r1.html:89544). */
function supportAbove(m: Rec, input: WardrobeInput, hw: HardwareCatalogs, s: Rec, t: number, k: number): number | null {
  const shelf = m.parts.find((p: Rec) => p.id === `${s.id}-SHELF${String(k + 1).padStart(2, '0')}`),
    selection = shelf ? selectShelfSupport(supportDemand(shelf, t, (input.state as Rec).fillingTier ?? null), hw.shelfSupports) : { chosen: null },
    support = selection.chosen ? hw.shelfSupports.supports.find((x) => x.id === selection.chosen!.supportId) : undefined;
  return support ? shelfLowerAboveAxis(support).valueMm : null;
}

/**
 * «Распределить полки» (fiDistribute r1.html:93760; s32Distribute, MOD-DEC-193): in every span of the section between
 * the bottom, the drawers, the rods, the shelf over the drawers and the roof, the shelves of the span get clear
 * openings as equal as the grid of System 32 allows; with System 32 off — whole millimetres of the upper face (196).
 * The shelves that carry something (over the drawers, over a rod, under a partition) stay and bound the spans. The
 * order, types and ids of the shelves do not change. A span where equal openings leave less than 100 mm between
 * shelves, or 40 mm to a drawer or a rod, is refused (v17Distribute r1.html:53994).
 */
export function distributeShelves(input: WardrobeInput, hw: HardwareCatalogs, section: number): FillEdit {
  const { m, s, t, world, base, system32, g } = sectionOf(input, hw, section),
    { out, cfg } = draft(input, section);
  if (!s.shelfYs.length) throw new Error('В секции нет полок. Проект не изменён.');
  const free = s.shelfYs.map((_: number, k: number) => (shelfHeld(s, cfg, k) ? -1 : k)).filter((k: number) => k >= 0);
  if (!free.length) throw new Error('Все полки секции связаны с ящиками, штангой или перегородкой. Проект не изменён.');
  const barriers = obstaclesOf(s, t, world).filter((e) => !(e.type === 'shelf' && free.includes(e.k))),
    bounds = [{ type: 'bottom', lo: g.interiorBottomY, hi: g.interiorBottomY }, ...barriers, { type: 'roof', lo: g.interiorTopY, hi: g.interiorTopY }],
    ys = s.shelfYs.slice();
  let moved = 0;
  for (let z = 1; z < bounds.length; z++) {
    const lower = bounds[z - 1]!,
      upper = bounds[z]!,
      lo = lower.hi,
      hi = upper.lo,
      indices = free.filter((k: number) => world + s.shelfYs[k] - t / 2 >= lo - C.compare.value && world + s.shelfYs[k] + t / 2 <= hi + C.compare.value);
    if (!indices.length) continue;
    const axes = indices.map((k: number) => (shelfTypeAt(cfg, k) === 'adjustableShelf' ? supportAbove(m, input, hw, s, t, k) : null));
    let r;
    try {
      r = s32Distribute({ z0: base.z0, shelves: indices.map((_k: number, j: number) => ({ t, axisFromLower: axes[j] === null ? t / 2 : -axes[j]! })), bounds: [lo, hi] }, system32);
    } catch (e) {
      throw new Error(`Полки не распределить: ${(e as Error).message === 'NO_DISTRIBUTION_WITH_SAME_COUNT' || (e as Error).message === 'INSUFFICIENT_FREE_HEIGHT' ? 'места для равных проёмов нет' : (e as Error).message}. Проект не изменён.`);
    }
    const gaps = r.gaps as number[],
      first = clearTo(lower.type, true),
      last = clearTo(upper.type, false);
    if (gaps.slice(1, -1).some((v) => v < C.minShelfClearance.value - C.compare.value) || gaps[0]! < first - C.compare.value || gaps[gaps.length - 1]! < last - C.compare.value)
      throw new Error('Недостаточно места для равных чистых проёмов: между полками нужно не меньше 100 мм, до ящика и штанги — 40 мм. Проект не изменён.');
    indices.forEach((k: number, j: number) => {
      const y = s32Q(r.lowers![j]! + t / 2 - world);
      if (Math.abs(y - ys[k]!) > C.compare.value) moved++;
      ys[k] = y;
    });
  }
  freezeShelves(cfg, ys);
  sameShelves(out, hw, section, ys, 'Полки не распределить');
  return { input: out, index: free[0]!, yMm: ys[free[0]!]!, notice: moved ? 'Полки распределены по равным чистым проёмам.' : 'Полки уже стоят с равными проёмами.', adjusted: false };
}

// ---------------------------------------------------------------- FIT: baskets, trouser racks, pantographs (484)

const ADDED: Readonly<Record<StorageKind, string>> = { LINEN_BASKET: 'Корзина для белья добавлена', SHOE_BASKET: 'Корзина для обуви добавлена', TROUSER_RACK: 'Вешало для брюк добавлено', PANTOGRAPH: 'Пантограф добавлен' };

/** The project with the storage rows `rows` (MOD-DEC-484): a copy, state.fittings.storage replaced; an empty list removes it. */
function withStorage(input: WardrobeInput, rows: StorageRow[]): WardrobeInput {
  const out = structuredClone(input),
    choice: Rec = { ...((out.state as Rec).fittings ?? {}) };
  if (rows.length) choice.storage = rows;
  else delete choice.storage;
  if (Object.keys(choice).length) (out.state as Rec).fittings = choice as JsonValue;
  else delete (out.state as Rec).fittings;
  return out;
}

/**
 * The free heights of a section between its elements from the floor (MOD-DEC-484, Д): the bottom, the shelves, the
 * shelf over the drawers, the rods, the drawers with the gap above them, the storage items and the roof — each with
 * what is under it and over it.
 */
function freeSpans(s: Rec, t: number, world: number, top: number): { lo: number; hi: number; below: string; above: string }[] {
  const list = [
      ...obstaclesOf(s, t, world).map((e) => (e.type === 'drawer' ? { ...e, hi: e.hi + (s.drawers[e.k]?.gapAbove ?? 0) } : e)),
    ].sort((a, b) => a.lo - b.lo),
    out: { lo: number; hi: number; below: string; above: string }[] = [];
  let hi = world,
    below = 'bottom';
  for (const e of list) {
    if (e.lo - hi > C.compare.value) out.push({ lo: hi, hi: e.lo, below, above: e.type });
    if (e.hi > hi) [hi, below] = [e.hi, e.type];
  }
  if (top - hi > C.compare.value) out.push({ lo: hi, hi: top, below, above: 'roof' });
  return out;
}

/**
 * Adds a basket for linen or for shoes, a trouser rack or a pantograph to the section `section` (MOD-DEC-484). The item
 * is the one of the catalogue for the clear width of the section and its depth (fittings-selection.storageFor); its
 * place (Д): a basket or a trouser rack — at the bottom of the lowest free height that holds its frame, as a drawer
 * goes to the lowest free group; a pantograph or a trouser rack screwed under a shelf — at the top of the highest free
 * height under a shelf or the roof. Behind a door a closed hinge that meets the new pull-out sends it up by the step
 * of the grid, as a new drawer (FE-04, 050); behind sliding doors the open leaves must clear it by 5 mm (175).
 */
export function addStorage(input: WardrobeInput, hw: HardwareCatalogs, section: number, kind: StorageKind): FillEdit {
  const { m, s, t, world, g, system32 } = sectionOf(input, hw, section),
    choice: FittingsChoice = ((input.state as Rec).fittings as FittingsChoice | undefined) ?? {},
    rows = storageRowsOf(choice, s.id),
    front = systemDepth(input.state as Rec) + fittingsSelection.constants.storageFrontInside.value,
    pick = storageFor(hw.fittings, kind, s.clearEnd - s.clearStart, backInnerFace(g) - front, choice.storageColour);
  if (!pick.item) throw new Error(`${pick.problem}. Проект не изменён.`);
  const item = pick.item,
    H = item.heightMm,
    under = (x: { above: string }) => x.above === 'shelf' || x.above === 'cover' || x.above === 'roof',
    spans = freeSpans(s, t, world, g.interiorTopY).filter((x) => x.hi - x.lo >= H - C.compare.value),
    fromTop = kind === 'PANTOGRAPH' || item.mounting === 'TOP',
    span = fromTop ? spans.filter(under).pop() : spans[0];
  if (!span)
    throw new Error(
      `${STORAGE_KIND_RU[kind]} ${pick.variant.article} не помещается: ${fromTop ? 'под полкой или крышей секции' : 'в секции'} нет свободной высоты ${fmt(H)} мм (MOD-DEC-484). Проект не изменён.`,
    );
  const r1 = (x: number) => Math.round(x * 10) / 10,
    first = r1((fromTop ? span.hi - H : span.lo) - world),
    all = choice.storage ?? [],
    row: StorageRow = { sectionId: s.id, kind, yMm: first },
    id = `${s.id}-STORAGE${String(rows.length + 1).padStart(2, '0')}`,
    build = (y: number) => withStorage(input, [...all, { ...row, yMm: y }]);
  let out = build(first),
    y = first;
  // FE-04 (050): a pull-out the rules just placed goes up by the step of the grid while a closed hinge meets it more.
  if (PULL_OUT_KINDS.includes(kind) && !fromTop) {
    const conflicts = (x: WardrobeInput) => (carcassModel(x, hw).hingeMechanisms as Rec[]).reduce((n, h) => n + (h.fe04?.conflicts.length ?? 0), 0),
      allowed = (m.hingeMechanisms as Rec[]).reduce((n, h) => n + (h.fe04?.conflicts.length ?? 0), 0),
      step = fe04DrawerStep(system32);
    if (conflicts(out) > allowed)
      for (let next = r1(first + step); world + next + H <= span.hi + C.compare.value; next = r1(next + step))
        if (conflicts(build(next)) <= allowed) {
          y = next;
          out = build(next);
          break;
        }
  }
  const built = carcassModel(out, hw),
    unit = ((built.sectionsData[section]?.storage ?? []) as StorageUnit[]).find((u) => u.id === id);
  if (!unit) throw new Error(`${STORAGE_KIND_RU[kind]} не добавлена: модель её не построила. Проект не изменён.`);
  if (unit.problem) throw new Error(`${unit.problem}. Проект не изменён.`);
  const access: Rec | undefined = (built.sliding?.access.drawers as Rec[] | undefined)?.find((x) => x.drawerId === id)?.nominal;
  if (access?.status === 'BLOCKED') throw new Error(`${STORAGE_KIND_RU[kind]} не добавить: ${access.proposal.text}. Проект не изменён.`);
  const where = fromTop ? `верх рамы под ${span.above === 'roof' ? 'крышей' : 'полкой'}` : `низ рамы на ${fmt(y)} мм над дном секции`;
  return {
    input: out,
    index: rows.length,
    yMm: y,
    adjusted: y !== first,
    notice:
      y !== first
        ? `${ADDED[kind]} (${unit.article}) на ${fmt(y - first)} мм выше: петля двери на своей лестнице не уходит от неё, поднята по шагу ${fmt(fe04DrawerStep(system32))} мм (FE-04, MOD-DEC-050).`
        : `${ADDED[kind]}: ${unit.article}, ${where} (MOD-DEC-484).${unit.colourNote ? ' ' + unit.colourNote + '.' : ''}`,
  };
}

/** Removes the storage item `index` of the section `section` (MOD-DEC-484): the others keep their places. */
export function removeStorage(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): FillEdit {
  const { s } = sectionOf(input, hw, section),
    all = (((input.state as Rec).fittings as FittingsChoice | undefined)?.storage ?? []).slice(),
    own = all.map((r, k) => ({ r, k })).filter((x) => x.r.sectionId === s.id),
    hit = own[index];
  if (!hit) throw new Error('Такой корзины, вешала или пантографа в секции нет. Проект не изменён.');
  all.splice(hit.k, 1);
  return { input: withStorage(input, all), index, yMm: hit.r.yMm, notice: `${STORAGE_KIND_RU[hit.r.kind]} убран${hit.r.kind === 'PANTOGRAPH' ? '' : hit.r.kind === 'TROUSER_RACK' ? 'о' : 'а'}.`, adjusted: false };
}

// ---------------------------------------------------------------- move a rod or a drawer (FINDINGS 1073)

/** An element of a section from the floor; a drawer with the least gap to the drawer over it. */
interface Placed {
  type: string;
  id: string;
  lo: number;
  hi: number;
  drawerGap?: number;
}

/**
 * The elements of the section of the model with the ids of the graph: shelves, the shelf over the drawers, rods,
 * drawers, storage items. Between drawers r1 keeps 20 mm over an internal one and the form gap over an external one
 * (requiredVerticalClearance r1.html:13519).
 */
function placedOf(s: Rec, t: number, world: number, formGap = 0): Placed[] {
  const half = C.rodVerticalSize.value / 2,
    pad = (k: number) => String(k + 1).padStart(2, '0');
  return [
    ...s.shelfYs.map((y: number, k: number) => ({ type: 'shelf', id: `${s.id}-SHELF${pad(k)}`, lo: world + y - t / 2, hi: world + y + t / 2 })),
    ...(s.topShelfY !== undefined && s.coverShelfIndex < 0 && !s.coverIsRoof ? [{ type: 'cover', id: `${s.id}-SHELF-DRAWER-COVER`, lo: world + s.topShelfY - t / 2, hi: world + s.topShelfY + t / 2 }] : []),
    ...s.rodYs.map((y: number, k: number) => ({ type: 'rod', id: `${s.id}-ROD${pad(k)}`, lo: world + y - half, hi: world + y + half })),
    ...s.drawers.map((v: Rec, k: number) => ({ type: 'drawer', id: `${s.id}-DRAWER${pad(k)}`, lo: world + v.bottom, hi: world + v.bottom + v.boxHeight, drawerGap: v.mode === 'external' ? formGap : MIN_INTERNAL_DRAWER_GAP })),
    ...storageOf(s).map((u, k) => ({ type: 'storage', id: `${s.id}-STORAGE${pad(k)}`, lo: u.box.y0, hi: u.box.y1 })),
  ];
}

/**
 * The least clear opening between an element and the one over it (requiredVerticalClearance r1.html:13519): 100 mm
 * between shelves; 50 mm from the top of a rod to anything over it, the roof included (MOD-DEC-193, 333); 20 mm
 * between internal drawers, the form gap between external ones; the gap of the shelf over the drawers between it and a
 * drawer; 40 mm otherwise. A storage item holds its own clearance in its frame (484).
 */
function clearBetween(lower: Placed, upper: Placed): number {
  if (lower.type === 'storage' || upper.type === 'storage' || lower.type === 'bottom') return 0;
  if (lower.type === 'rod') return S32.aboveRodClear.value;
  if (upper.type === 'roof') return 0;
  if (lower.type === 'shelf' && upper.type === 'shelf') return C.minShelfClearance.value;
  if (lower.type === 'drawer' && upper.type === 'drawer') return Math.max(lower.drawerGap ?? 0, upper.drawerGap ?? 0);
  if ((lower.type === 'drawer' && upper.type === 'cover') || (lower.type === 'cover' && upper.type === 'drawer')) return C.coverGap.value;
  return C.mixedClearance.value;
}

/** An element of the fill too close to another one (MOD-DEC-570): its kind, its index among its kind in the section, its bottom from the floor. */
export interface FillClash {
  type: 'shelf' | 'rod' | 'drawer';
  index: number;
  lo: number;
  /** The kind and the bottom of the element it is too close to. */
  with: { type: string; lo: number };
}

const REMOVABLE: Record<string, FillClash['type']> = { SHELF: 'shelf', ROD: 'rod', DRAWER: 'drawer' };

/**
 * The elements of the section of the model closer to another one than the clearances of the fill allow (clearBetween;
 * the check of the merged fill of ckMergePartition r1.html:90251): of each such pair the upper element, or the lower one
 * when the upper is the shelf over the drawers or a storage item, which go with their own element. An element is
 * named once; a pair of which one is named already is not counted again.
 */
export function fillClashes(s: Rec, t: number, world: number, formGap = 0): FillClash[] {
  const all = placedOf(s, t, world, formGap).sort((a, b) => a.lo - b.lo || a.hi - b.hi),
    eps = C.compare.value,
    named = new Set<string>(),
    out: FillClash[] = [];
  const kindOf = (e: Placed) => {
    const m = /-(SHELF|ROD|DRAWER)(\d+)$/.exec(e.id);
    return m ? { type: REMOVABLE[m[1]!]!, index: Number(m[2]) - 1 } : null;
  };
  for (let a = 0; a < all.length; a++)
    for (let b = a + 1; b < all.length; b++) {
      const lower = all[a]!,
        upper = all[b]!;
      if (named.has(lower.id) || named.has(upper.id)) continue;
      if (upper.lo - lower.hi >= clearBetween(lower, upper) - eps) continue;
      const pick = kindOf(upper) ? upper : kindOf(lower) ? lower : null;
      if (!pick) continue;
      named.add(pick.id);
      const other = pick === upper ? lower : upper;
      out.push({ ...kindOf(pick)!, lo: pick.lo, with: { type: other.type, lo: other.lo } });
    }
  return out;
}

const OF: Record<string, string> = { shelf: 'полки', cover: 'полки над ящиками', rod: 'штанги', drawer: 'ящика', storage: 'корзины, вешала или пантографа', bottom: 'дна', roof: 'крыши' },
  WITH: Record<string, string> = { shelf: 'полкой', cover: 'полкой над ящиками', rod: 'штангой', drawer: 'ящиком', storage: 'корзиной, вешалом или пантографом' };

/**
 * The elements `moving` of the section of the new model keep the clear openings to the others and stay between the
 * bottom and the roof; otherwise the edit is refused with the element that is too close (`what` — what was moved).
 */
function checkPlaced(sNew: Rec, t: number, g: Rec, formGap: number, moving: string[], what: string) {
  const all = placedOf(sNew, t, g.interiorBottomY, formGap),
    mine = all.filter((e) => moving.includes(e.id)),
    others = [{ type: 'bottom', id: '', lo: g.interiorBottomY, hi: g.interiorBottomY }, ...all.filter((e) => !moving.includes(e.id)), { type: 'roof', id: '', lo: g.interiorTopY, hi: g.interiorTopY }],
    eps = C.compare.value;
  for (const e of mine) {
    if (e.lo < g.interiorBottomY - eps || e.hi > g.interiorTopY + eps) throw new Error(`${what}: он выходит за дно или крышу секции. Проект не изменён.`);
    for (const o of others) {
      const below = o.hi <= e.lo + eps,
        above = o.lo >= e.hi - eps,
        gap = below ? e.lo - o.hi : above ? o.lo - e.hi : -1,
        need = below ? clearBetween(o, e) : above ? clearBetween(e, o) : 0;
      if (gap < need - eps) throw new Error(need > 0 ? `${what}: до ${OF[o.type]} нужно не меньше ${need} мм. Проект не изменён.` : `${what}: на этой высоте он пересекается с ${WITH[o.type]}. Проект не изменён.`);
    }
  }
}

/**
 * The elements of the section that were not moved stay where they were: the model of the new input has them at the
 * same heights (an edit of one element does not shift the others), otherwise the edit is refused.
 */
function othersKept(before: Rec, after: Rec, t: number, world: number, movedBefore: string[], movedAfter: string[], what: string) {
  const key = (list: Placed[], moved: string[]) =>
    list
      .filter((e) => !moved.includes(e.id))
      .map((e) => `${e.type}:${s32Q(e.lo)}`)
      .sort()
      .join(' ');
  if (key(placedOf(before, t, world), movedBefore) !== key(placedOf(after, t, world), movedAfter)) throw new Error(`${what}: другие элементы секции сдвинулись бы. Проект не изменён.`);
}

/** The order of the values: the new index of each old one is its place among them. */
const orderOf = (values: number[]) => values.map((v, k) => ({ v, k })).sort((a, b) => a.v - b.v);

/**
 * Moves the rod `index` so that its axis is `yMm` over the interior bottom (fiMove r1.html:92232). The rod keeps 50 mm
 * from its top to the element over it and the roof (MOD-DEC-333), 40 mm over a shelf, a drawer or another rod
 * (r1.html:13519); a stored rod stays where it is put (310). A shelf over the rod (the link of the filling layer of
 * r1) moves with it. A rod that passes another one takes its place in the order with its own row of the filling.
 */
export function moveRod(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, yMm: number): FillEdit {
  const { m, s, t, g } = sectionOf(input, hw, section),
    y0: number | undefined = s.rodYs[index];
  if (y0 === undefined) throw new Error('Такой штанги в секции нет. Проект не изменён.');
  if (!Number.isFinite(yMm)) throw new Error('Введите высоту оси штанги в миллиметрах. Проект не изменён.');
  const { out, cfg } = draft(input, section),
    f = fillingOf(out.state as Rec, cfg, m, section),
    row = f.rod[index],
    linked = row?.coverId ? f.shelf.findIndex((r: Rec) => r.id === row.coverId) : -1,
    delta = s32Q(yMm - y0),
    rods: number[] = s.rodYs.slice();
  rods[index] = s32Q(yMm);
  const order = orderOf(rods),
    next = order.findIndex((o) => o.k === index);
  cfg.rodPositions = order.map((o) => o.v);
  cfg.rodCount = rods.length;
  f.rod = order.map((o) => f.rod[o.k]);
  if (linked >= 0) {
    freezeShelves(cfg, s.shelfYs);
    cfg.shelfPositions[linked] = s32Q(cfg.shelfPositions[linked] + delta);
  }
  const built = carcassModel(out, hw).sectionsData[section];
  if (!built || built.rodYs.length !== rods.length || built.rodYs.some((y: number, k: number) => Math.abs(y - cfg.rodPositions[k]) > C.compare.value))
    throw new Error('Штангу не перенести: штанги секции не встают на эти высоты. Проект не изменён.');
  const pad = (k: number) => String(k + 1).padStart(2, '0'),
    shelf = linked >= 0 ? [`${s.id}-SHELF${pad(linked)}`] : [];
  othersKept(s, built, t, g.interiorBottomY, [`${s.id}-ROD${pad(index)}`, ...shelf], [`${s.id}-ROD${pad(next)}`, ...shelf], 'Штангу не перенести');
  checkPlaced(built, t, g, m.gap, [`${s.id}-ROD${pad(next)}`, ...shelf], 'Штангу не перенести');
  return { input: out, index: next, yMm: rods[index]!, notice: linked >= 0 ? 'Штанга перенесена вместе с полкой над ней.' : 'Штанга перенесена.', adjusted: false };
}

/**
 * Moves the drawer `index` so that its bottom is `yMm` over the interior bottom (fiMove r1.html:92232): the shelf over
 * the drawers it owns goes with it, its gap kept. The drawer keeps its gap to the drawer over it, the gap of the shelf
 * over the drawers, 40 mm to a shelf and under a rod, 50 mm over a rod (r1.html:13519; MOD-DEC-193, 333). As when it
 * is added, a drawer the hinges of the door meet anew (FE-04, MOD-DEC-050) or the open sliding leaves do not clear
 * (175) is refused. A drawer that passes another one takes its place in the order with its own height, gap and row.
 */
export function moveDrawer(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, yMm: number): FillEdit {
  const { m, s, t, g, system32 } = sectionOf(input, hw, section),
    drawer: Rec | undefined = s.drawers[index];
  if (!drawer) throw new Error('Такого ящика в секции нет. Проект не изменён.');
  if (!Number.isFinite(yMm)) throw new Error('Введите высоту низа ящика в миллиметрах. Проект не изменён.');
  const y = system32 ? s32Q(yMm) : Math.round(yMm),
    { out, cfg } = draft(input, section),
    f = fillingOf(out.state as Rec, cfg, m, section),
    bottoms: number[] = s.drawers.map((v: Rec) => v.bottom);
  bottoms[index] = y;
  const order = orderOf(bottoms),
    next = order.findIndex((o) => o.k === index),
    heights = s.drawers.map((v: Rec) => v.boxHeight),
    gaps = s.drawers.map((v: Rec) => v.gapAbove);
  cfg.drawerPositions = order.map((o) => o.v);
  cfg.drawerHeights = order.map((o) => heights[o.k]);
  cfg.drawerGaps = order.map((o) => gaps[o.k]);
  f.drawer = order.map((o) => f.drawer[o.k]);
  cfg.drawerCount = f.drawer.length;
  const built = carcassModel(out, hw),
    sNew = built.sectionsData[section];
  if (!sNew || sNew.drawers.length !== bottoms.length || sNew.drawers.some((v: Rec, k: number) => Math.abs(v.bottom - cfg.drawerPositions[k]) > C.compare.value))
    throw new Error('Ящик не перенести: ящики секции не встают на эти высоты. Проект не изменён.');
  const pad = (k: number) => String(k + 1).padStart(2, '0'),
    cover = s.topShelfY !== undefined && sNew.topShelfY !== undefined && Math.abs(sNew.topShelfY - s.topShelfY) > C.compare.value && sNew.coverShelfIndex < 0 && !sNew.coverIsRoof,
    withCover = cover ? [`${s.id}-SHELF-DRAWER-COVER`] : [];
  othersKept(s, sNew, t, g.interiorBottomY, [`${s.id}-DRAWER${pad(index)}`, ...withCover], [`${s.id}-DRAWER${pad(next)}`, ...withCover], 'Ящик не перенести');
  checkPlaced(sNew, t, g, m.gap, [`${s.id}-DRAWER${pad(next)}`, ...withCover], 'Ящик не перенести');
  // FE-04 (MOD-DEC-050): the hinges of the door meet the drawer no more often than before the move.
  const conflicts = (x: Rec) => (x.hingeMechanisms as Rec[]).reduce((n, h) => n + (h.fe04?.conflicts.length ?? 0), 0);
  if (conflicts(built) > conflicts(m)) throw new Error('Ящик не перенести: на этой высоте его задевает петля двери (FE-04, MOD-DEC-050). Проект не изменён.');
  // MOD-DEC-175: behind sliding doors the open leaves clear the drawer by 5 mm.
  const access: Rec | undefined = (built.sliding?.access.drawers as Rec[] | undefined)?.find((x) => x.drawerId === sNew.drawers[next]?.id)?.nominal;
  if (access?.status === 'BLOCKED') throw new Error(`Ящик не перенести: ${access.proposal.text}. Проект не изменён.`);
  return { input: out, index: next, yMm: y, notice: cover ? 'Ящик перенесён вместе с полкой над ним.' : 'Ящик перенесён.', adjusted: false };
}

/**
 * The levels a rod dragged on the drawing snaps to (fiDragTarget r1.html:94292; FINDINGS 1073): the top of the rod in
 * whole millimetres, as r1 rounds it — the holders of a rod are screwed on site, without the drilling of System 32
 * (MOD-DEC-482). A shelf over the rod moves with it.
 */
export function rodDragLevels(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, options: { profileHeightMm?: number } = {}): DragLevels {
  const { s, world, g } = sectionOf(input, hw, section),
    y0: number | undefined = s.rodYs[index];
  if (y0 === undefined) throw new Error('Такой штанги в секции нет. Проект не изменён.');
  const half = (options.profileHeightMm ?? C.rodVerticalSize.value) / 2,
    { cfg } = draft(input, section),
    row = cfg.filling?.rod?.[index],
    linked = row?.coverId ? (cfg.filling.shelf as Rec[]).findIndex((r) => r.id === row.coverId) : -1;
  return {
    yMm: y0,
    baseMm: s32Q(Math.ceil(world + half) - world - half),
    stepMm: S32.integerStep.value,
    minMm: g.interiorBottomY - world + half,
    maxMm: g.interiorTopY - world - half,
    alsoMoves: linked >= 0 ? [`${s.id}-SHELF${String(linked + 1).padStart(2, '0')}`] : [],
  };
}

/**
 * The levels a drawer dragged on the drawing snaps to (fiDragTarget r1.html:94292; FINDINGS 1073): the drawer that
 * owns the shelf over the drawers puts the middle of that shelf on the grid of System 32, as the drawers are added
 * (MOD-DEC-193); another drawer, or with System 32 off, has its bottom in whole millimetres.
 */
export function drawerDragLevels(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): DragLevels {
  const { s, t, world, base, system32, g } = sectionOf(input, hw, section),
    v: Rec | undefined = s.drawers[index];
  if (!v) throw new Error('Такого ящика в секции нет. Проект не изменён.');
  const tops = s.drawers.map((x: Rec) => x.bottom + x.boxHeight),
    { cfg } = draft(input, section),
    owner = cfg.filling?.cover && !cfg.filling.cover.removed ? (cfg.filling.drawer as Rec[]).findIndex((r) => r.id === cfg.filling.cover.ownerId) : tops.indexOf(Math.max(...tops)),
    covered = owner === index && s.topShelfY !== undefined && s.coverShelfIndex < 0 && !s.coverIsRoof,
    over = covered ? s.topShelfY - (v.bottom + v.boxHeight) : 0;
  return {
    yMm: v.bottom,
    baseMm: covered && system32 ? s32Q(base.z0 - world - v.boxHeight - over) : 0,
    stepMm: covered && system32 ? S32.step.value : S32.integerStep.value,
    minMm: 0,
    maxMm: g.interiorTopY - world - v.boxHeight - (covered ? over + t / 2 : 0),
    alsoMoves: covered ? [`${s.id}-SHELF-DRAWER-COVER`] : [],
  };
}

// ---------------------------------------------------------------- the panel of an element of the fill
//
// The panel of the filling layer of r1 (fiRender r1.html:93345, fiEditOne r1.html:92393, fiDrawerAbove r1.html:92311,
// fiDuplicate r1.html:92496; FINDINGS 1136–1139): the depth and the front setback of a shelf with its clear openings,
// the depth of a rod, the execution, the box height and the gap of a drawer, «Добавить ящик сверху» and «Дублировать».
// The heights of the elements are moved by moveShelf, moveRod and moveDrawer above. r1 checked an edit only by the
// conflicts of the whole project (fiRun); here an edit that would put an element out of its clear openings is refused
// as a move is (checkPlaced), the project is not changed.

const pad2 = (k: number) => String(k + 1).padStart(2, '0');

/** The clear openings under and over an element of the section to its neighbours, the bottom and the roof, mm (the panel r1.html:93508). */
export function fillClearances(input: WardrobeInput, hw: HardwareCatalogs, section: number, elementId: string): { belowMm: number; aboveMm: number } {
  const { m, s, t, g } = sectionOf(input, hw, section),
    all = placedOf(s, t, g.interiorBottomY, m.gap),
    e = all.find((x) => x.id === elementId),
    eps = C.compare.value;
  if (!e) throw new Error('Такого элемента в секции нет.');
  const others = all.filter((x) => x !== e),
    below = Math.max(g.interiorBottomY, ...others.filter((o) => o.hi <= e.lo + eps).map((o) => o.hi)),
    above = Math.min(g.interiorTopY, ...others.filter((o) => o.lo >= e.hi - eps).map((o) => o.lo));
  return { belowMm: s32Q(e.lo - below), aboveMm: s32Q(above - e.hi) };
}

/**
 * The depth and the front setback of the shelf `index` (fiEditOne r1.html:92428): `frontMm` from the front edge of
 * the carcass; `depthMm` keeps the rear of the shelf and moves its front (r1: front = D − rear − depth). The shelf
 * keeps the least depth of 100 mm (r1.html:12031) and stays behind the door system of a sliding wardrobe and an
 * inset door (W9, MOD-DEC-400): a front the model would put further back is refused with the least front.
 */
export function setShelfDepth(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, value: { frontMm?: number; depthMm?: number }): FillEdit {
  const { m, s } = sectionOf(input, hw, section),
    y: number | undefined = s.shelfYs[index],
    part: Rec | undefined = m.parts.find((p: Rec) => p.id === `${s.id}-SHELF${pad2(index)}`);
  if (y === undefined || !part) throw new Error('Такой полки в секции нет. Проект не изменён.');
  const v = value.frontMm ?? value.depthMm;
  if (v === undefined || !Number.isFinite(v)) throw new Error('Введите размер в миллиметрах. Проект не изменён.');
  const rearPlane: number = part.worldBox.z1,
    front = s32Q(value.frontMm ?? rearPlane - value.depthMm!);
  if (front < -C.compare.value) throw new Error('Отступ спереди не может быть отрицательным. Проект не изменён.');
  if (rearPlane - front < C.minShelfDepth.value - C.compare.value) throw new Error(`Глубина полки — не меньше ${C.minShelfDepth.value} мм. Проект не изменён.`);
  const { out, cfg } = draft(input, section),
    f = fillingOf(out.state as Rec, cfg, m, section);
  f.shelf[index] = { ...f.shelf[index], front };
  const built: Rec | undefined = carcassModel(out, hw).parts.find((p: Rec) => p.id === part.id);
  if (!built || Math.abs(built.worldBox.z0 - front) > C.compare.value)
    throw new Error(`Полка не встаёт так: ${built ? `ближе ${fmt(built.worldBox.z0)} мм к передней кромке её не поставить — перед ней ${isSliding(input.state as Rec) ? 'система дверей купе' : 'вкладная дверь'}` : 'секция её не строит'}. Проект не изменён.`);
  const depth = s32Q(built.worldBox.z1 - built.worldBox.z0);
  return { input: out, index, yMm: y, notice: value.frontMm !== undefined ? `Отступ полки спереди — ${fmt(front)} мм, глубина ${fmt(depth)} мм.` : `Глубина полки — ${fmt(depth)} мм.`, adjusted: false };
}

/**
 * The depth of the axis of the rod `index` from the front edge of the carcass (fiEditOne r1.html:92433, `depthAxis`):
 * the holders of the rod stay in the depth of the section — behind the door system of a sliding wardrobe, before the
 * back. r1 took any number.
 */
export function setRodDepth(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, depthAxisMm: number): FillEdit {
  const { m, s, g } = sectionOf(input, hw, section),
    y: number | undefined = s.rodYs[index];
  if (y === undefined) throw new Error('Такой штанги в секции нет. Проект не изменён.');
  if (!Number.isFinite(depthAxisMm)) throw new Error('Введите глубину оси штанги в миллиметрах. Проект не изменён.');
  const axis = s32Q(depthAxisMm),
    { out, cfg } = draft(input, section),
    f = fillingOf(out.state as Rec, cfg, m, section);
  f.rod[index] = { ...f.rod[index], depthAxis: axis };
  const rod = (carcassModel(out, hw).fittings?.rods as Rec[] | undefined)?.find((r) => r.id === `${s.id}-ROD${pad2(index)}`),
    holder: Rec | undefined = rod?.visuals.find((x: Rec) => x.id.endsWith('-V-HOLDER-L'));
  if (holder) {
    const across = holder.sizeMm[1] as number,
      lo = shelfFrontBehindSystem(0, input.state as Rec),
      hi = backInnerFace(g);
    if (axis - across / 2 < lo - C.compare.value || axis + across / 2 > hi + C.compare.value)
      throw new Error(`Опора штанги шириной ${fmt(across)} мм выходит из глубины секции: ось — от ${fmt(lo + across / 2)} до ${fmt(hi - across / 2)} мм от передней кромки. Проект не изменён.`);
  }
  return { input: out, index, yMm: y, notice: `Ось штанги — ${fmt(axis)} мм от передней кромки.`, adjusted: false };
}

/**
 * Checks the drawers of the section after an edit of their execution, box or gap (as moveDrawer does): the model has
 * the drawers where the edit put them, the elements not `moving` stay, the moved ones keep their clear openings, the
 * hinges of the door meet the drawers no more often than before (FE-04, MOD-DEC-050), the open sliding leaves clear
 * them (175).
 */
function checkDrawers(m: Rec, s: Rec, out: WardrobeInput, hw: HardwareCatalogs, section: number, cfg: Rec, moving: string[], what: string): void {
  const t: number = m.t,
    g = m.modules.find((x: Rec) => x.id === s.moduleId).geometry,
    built = carcassModel(out, hw),
    sNew: Rec | undefined = built.sectionsData[section];
  if (!sNew || sNew.drawers.length !== cfg.drawerPositions.length || sNew.drawers.some((v: Rec, k: number) => Math.abs(v.bottom - cfg.drawerPositions[k]) > C.compare.value || Math.abs(v.boxHeight - cfg.drawerHeights[k]) > C.compare.value))
    throw new Error(`${what}: ящики секции не встают так. Проект не изменён.`);
  const cover = s.topShelfY !== undefined && sNew.topShelfY !== undefined && Math.abs(sNew.topShelfY - s.topShelfY) > C.compare.value && sNew.coverShelfIndex < 0 && !sNew.coverIsRoof,
    ids = [...moving, ...(cover ? [`${s.id}-SHELF-DRAWER-COVER`] : [])],
    had = new Set(placedOf(s, t, g.interiorBottomY).map((e) => e.id));
  othersKept(s, sNew, t, g.interiorBottomY, ids.filter((id) => had.has(id)), ids, what);
  checkPlaced(sNew, t, g, m.gap, ids, what);
  const conflicts = (x: Rec) => (x.hingeMechanisms as Rec[]).reduce((n, h) => n + (h.fe04?.conflicts.length ?? 0), 0);
  if (conflicts(built) > conflicts(m)) throw new Error(`${what}: ящик задевает петля двери (FE-04, MOD-DEC-050). Проект не изменён.`);
  const drawerIds = new Set((sNew.drawers as Rec[]).filter((_, k) => ids.includes(`${s.id}-DRAWER${pad2(k)}`)).map((v) => v.id)),
    blocked = ((built.sliding?.access.drawers as Rec[] | undefined) ?? []).find((x) => drawerIds.has(x.drawerId) && x.nominal?.status === 'BLOCKED');
  if (blocked) throw new Error(`${what}: ${blocked.nominal.proposal.text}. Проект не изменён.`);
}

/** The places, boxes and gaps of the drawers of the section as the model has them, written into the input. */
function freezeDrawers(cfg: Rec, s: Rec) {
  cfg.drawerPositions = s.drawers.map((v: Rec) => v.bottom);
  cfg.drawerHeights = s.drawers.map((v: Rec) => v.boxHeight);
  cfg.drawerGaps = s.drawers.map((v: Rec) => v.gapAbove);
}

/**
 * The execution of the drawer `index`: internal or external (fiEditOne r1.html:92404). An external drawer behind a
 * swing door is refused (WR-30); the drawer keeps its place, its gaps are checked by the rule of its execution.
 */
export function setDrawerExecution(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, execution: 'internal' | 'external'): FillEdit {
  const { m, s } = sectionOf(input, hw, section),
    v: Rec | undefined = s.drawers[index];
  if (!v) throw new Error('Такого ящика в секции нет. Проект не изменён.');
  if (execution !== 'internal' && execution !== 'external') throw new Error('Ящик бывает внутренним или наружным. Проект не изменён.');
  const { out, cfg } = draft(input, section),
    f = fillingOf(out.state as Rec, cfg, m, section);
  if ((f.drawer[index].execution ?? cfg.drawerMode ?? 'internal') === execution) return { input: out, index, yMm: v.bottom, notice: 'Исполнение ящика не изменилось.', adjusted: false };
  f.drawer[index] = { ...f.drawer[index], execution };
  freezeDrawers(cfg, s);
  if (doorOverExternalDrawer(cfg)) throw new Error('Наружный ящик за распашной дверью не сделать: фасад ящика и дверь заняли бы один объём; уберите дверь секции (WR-30). Проект не изменён.');
  checkDrawers(m, s, out, hw, section, cfg, [`${s.id}-DRAWER${pad2(index)}`], 'Исполнение не сменить');
  return { input: out, index, yMm: v.bottom, notice: execution === 'external' ? 'Ящик стал наружным.' : 'Ящик стал внутренним.', adjusted: false };
}

/**
 * The height of the box of the drawer `index` (fiEditOne r1.html:92413): 80–320 mm, as the box profile of r1 allows
 * (r1.html:12058). The bottom stays; the shelf over the drawers follows the top drawer, the drawers over it stay.
 */
export function setDrawerBoxHeight(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, heightMm: number): FillEdit {
  const { m, s } = sectionOf(input, hw, section),
    v: Rec | undefined = s.drawers[index],
    D = wardrobeDrawers.constants;
  if (!v) throw new Error('Такого ящика в секции нет. Проект не изменён.');
  if (!(heightMm >= D.boxHeightMin.value && heightMm <= D.boxHeightMax.value)) throw new Error(`Высота короба — от ${D.boxHeightMin.value} до ${D.boxHeightMax.value} мм. Проект не изменён.`);
  const h = s32Q(heightMm),
    { out, cfg } = draft(input, section);
  fillingOf(out.state as Rec, cfg, m, section);
  freezeDrawers(cfg, s);
  cfg.drawerHeights[index] = h;
  checkDrawers(m, s, out, hw, section, cfg, [`${s.id}-DRAWER${pad2(index)}`], 'Высоту короба не изменить');
  return { input: out, index, yMm: v.bottom, notice: `Высота короба — ${fmt(h)} мм.`, adjusted: false };
}

/**
 * The gap over the drawer `index` to the next drawer (fiEditOne r1.html:92420): the drawers over it move by the change
 * and keep their own gaps, the shelf over the drawers with the top one. The gap of the top drawer is the one «Добавить
 * ящик сверху» leaves. The least gap is the rule of the execution: 20 mm between internal drawers, the form gap between
 * external ones (moveDrawer).
 */
export function setDrawerGap(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number, gapMm: number): FillEdit {
  const { m, s } = sectionOf(input, hw, section),
    v: Rec | undefined = s.drawers[index];
  if (!v) throw new Error('Такого ящика в секции нет. Проект не изменён.');
  if (!Number.isFinite(gapMm) || gapMm < 0) throw new Error('Зазор не может быть отрицательным. Проект не изменён.');
  const gap = s32Q(gapMm),
    { out, cfg } = draft(input, section);
  fillingOf(out.state as Rec, cfg, m, section);
  freezeDrawers(cfg, s);
  const order = orderOf(cfg.drawerPositions).map((o) => o.k),
    at = order.indexOf(index),
    up = order.slice(at + 1);
  cfg.drawerGaps[index] = gap;
  if (up.length) {
    const delta = s32Q(v.bottom + v.boxHeight + gap - cfg.drawerPositions[up[0]!]);
    for (const k of up) cfg.drawerPositions[k] = s32Q(cfg.drawerPositions[k] + delta);
  }
  checkDrawers(m, s, out, hw, section, cfg, up.map((k) => `${s.id}-DRAWER${pad2(k)}`), 'Зазор не изменить');
  return { input: out, index, yMm: v.bottom, notice: up.length ? `Зазор над ящиком — ${fmt(gap)} мм; ящики выше сдвинуты.` : `Зазор над ящиком — ${fmt(gap)} мм.`, adjusted: false };
}

/**
 * «Добавить ящик сверху» (fiDrawerAboveDraft r1.html:92280): over the top drawer of the section, by its gap, a drawer
 * of its box height, execution and construction; the shelf over the drawers goes to the new drawer.
 */
export function addDrawerAbove(input: WardrobeInput, hw: HardwareCatalogs, section: number, index: number): FillEdit {
  const { m, s } = sectionOf(input, hw, section),
    v: Rec | undefined = s.drawers[index];
  if (!v) throw new Error('Такого ящика в секции нет. Проект не изменён.');
  const tops = (s.drawers as Rec[]).map((x) => x.bottom + x.boxHeight);
  if (tops.indexOf(Math.max(...tops)) !== index) throw new Error('Ящик сверху добавляется над верхним ящиком секции. Проект не изменён.');
  if (s.drawers.length >= wardrobeDrawers.constants.maxDrawers.value) throw new Error(`В секции уже ${s.drawers.length} ящиков — это предел. Проект не изменён.`);
  const { out, cfg } = draft(input, section),
    f = fillingOf(out.state as Rec, cfg, m, section),
    y = s32Q(v.bottom + v.boxHeight + v.gapAbove),
    row = { ...structuredClone(f.drawer[index]), id: fillingId(out.state as Rec, 'drawer') };
  freezeDrawers(cfg, s);
  cfg.drawerPositions.push(y);
  cfg.drawerHeights.push(v.boxHeight);
  cfg.drawerGaps.push(v.gapAbove);
  f.drawer.push(row);
  cfg.drawerCount = f.drawer.length;
  if (f.cover && !f.cover.removed) f.cover.ownerId = row.id;
  const group = (f.groups as Rec[]).find((x) => x.members.includes(f.drawer[index].id));
  if (group) group.members.push(row.id);
  checkDrawers(m, s, out, hw, section, cfg, [`${s.id}-DRAWER${pad2(f.drawer.length - 1)}`], 'Ящик сверху не добавить');
  return { input: out, index: f.drawer.length - 1, yMm: y, notice: 'Ящик добавлен над верхним.', adjusted: false };
}

/** A copy of the row of the filling for «Дублировать»: its own id, no links (fiDuplicate r1.html:92517). */
function copyRow(row: Rec | undefined, id: string): Rec {
  const copy: Rec = { ...structuredClone(row ?? {}), id };
  for (const key of ['spanRight', 'splitOrigin', 'coverId', 'link']) delete copy[key];
  return copy;
}

/** Inserts a copy of the shelf `k` with its type, load, depth and setbacks at the height `y`; returns its index. */
function insertShelfCopy(cfg: Rec, ys: number[], k: number, y: number): number {
  freezeShelves(cfg, ys);
  const i = ys.filter((v) => v < y).length;
  cfg.shelfSequence = (cfg.shelfSequence || 0) + 1;
  const uid = cfg.uiSectionId + '-SHELF-' + cfg.shelfSequence;
  for (const key of SHELF_KEYS) if (Array.isArray(cfg[key])) cfg[key].splice(i, 0, key === 'shelfPositions' ? y : key === 'shelfUids' ? uid : structuredClone(cfg[key][k]));
  if (cfg.filling?.shelf) cfg.filling.shelf.splice(i, 0, copyRow(cfg.filling.shelf[k], uid));
  Object.assign(cfg, { shelvesEnabled: true, shelfCount: cfg.shelfPositions.length });
  return i;
}

/**
 * «Дублировать» (fiDuplicate r1.html:92496): a copy of the shelf or the rod 256 mm over it (the step of MOD-DEC-193,
 * r1.html:92503) with its type, depth and setbacks; a rod with a shelf over it is copied with that shelf. A drawer is
 * duplicated as «Добавить ящик сверху» over the top drawer, as in r1. The copy is checked as a move of it.
 */
export function duplicateFill(input: WardrobeInput, hw: HardwareCatalogs, section: number, kind: 'shelf' | 'rod' | 'drawer', index: number): FillEdit {
  if (kind === 'drawer') {
    const r = addDrawerAbove(input, hw, section, index);
    return { ...r, notice: 'Ящик продублирован над верхним.' };
  }
  const { m, s } = sectionOf(input, hw, section),
    step = S32.shelfStep.value,
    { out, cfg } = draft(input, section),
    f = fillingOf(out.state as Rec, cfg, m, section);
  try {
    if (kind === 'shelf') {
      const y0: number | undefined = s.shelfYs[index];
      if (y0 === undefined) throw new Error('Такой полки в секции нет.');
      if (s.shelfYs.length >= C.maxShelves.value) throw new Error(`в секции уже ${C.maxShelves.value} полок — это предел.`);
      if (s.coverShelfIndex === index) throw new Error('это полка над ящиками, она одна у ящиков.');
      const i = insertShelfCopy(cfg, s.shelfYs, index, s32Q(y0 + step)),
        r = moveShelf(out, hw, section, i, s32Q(y0 + step));
      return { ...r, notice: `Полка продублирована на ${step} мм выше.` };
    }
    const y0: number | undefined = s.rodYs[index];
    if (y0 === undefined) throw new Error('Такой штанги в секции нет.');
    const y = s32Q(y0 + step),
      rods: number[] = s.rodYs.slice(),
      i = rods.filter((v) => v < y).length,
      source = f.rod[index],
      linked = source?.coverId ? (f.shelf as Rec[]).findIndex((r) => r.id === source.coverId) : -1,
      copy = copyRow(source, fillingId(out.state as Rec, 'rod'));
    rods.splice(i, 0, y);
    f.rod.splice(i, 0, copy);
    Object.assign(cfg, { rodCount: rods.length, rodPositions: rods });
    if (linked >= 0) {
      const k = insertShelfCopy(cfg, s.shelfYs, linked, s32Q(s.shelfYs[linked] + step));
      cfg.filling.shelf[k].link = { type: 'rod', id: copy.id };
      copy.coverId = cfg.filling.shelf[k].id;
    }
    const r = moveRod(out, hw, section, i, y);
    return { ...r, notice: linked >= 0 ? `Штанга продублирована на ${step} мм выше вместе с полкой над ней.` : `Штанга продублирована на ${step} мм выше.` };
  } catch (e) {
    const text = (e as Error).message.replace(/ Проект не изменён\.$/, '');
    throw new Error(`Копию не поставить на ${step} мм выше: ${text.charAt(0).toLowerCase() + text.slice(1)} Проект не изменён.`);
  }
}

/** What the panel of an element shows (fiRender r1.html:93480): the sizes the model gave the shelves, rods and drawers of a section. */
export interface FillPanel {
  shelves: { frontMm: number; depthMm: number }[];
  rods: { depthAxisMm: number; topFromFloorMm: number }[];
  drawers: { execution: 'internal' | 'external'; boxHeightMm: number; gapMm: number; widthMm: number; depthMm: number; top: boolean }[];
}

export function fillPanelOf(input: WardrobeInput, hw: HardwareCatalogs, section: number): FillPanel {
  const { m, s, world } = sectionOf(input, hw, section),
    rows: Rec = (input.state.sections as Rec[])[section]?.filling ?? {},
    rodFits = ((m.fittings?.rods as Rec[] | undefined) ?? []).filter((r) => r.sectionId === s.id),
    tops = (s.drawers as Rec[]).map((v) => v.bottom + v.boxHeight),
    highest = tops.indexOf(Math.max(...tops));
  return {
    shelves: (s.shelfYs as number[]).map((_, k) => {
      const box = m.parts.find((p: Rec) => p.id === `${s.id}-SHELF${pad2(k)}`)?.worldBox;
      return { frontMm: box ? s32Q(box.z0) : 0, depthMm: box ? s32Q(box.z1 - box.z0) : 0 };
    }),
    rods: (s.rodYs as number[]).map((y, k) => {
      const fit = rodFits.find((r) => r.id === `${s.id}-ROD${pad2(k)}`),
        half = (fit?.sectionHeightMm ?? C.rodVerticalSize.value) / 2;
      return { depthAxisMm: s32Q(rows.rod?.[k]?.depthAxis ?? s.geometry.depth / 2), topFromFloorMm: s32Q(world + y + half) };
    }),
    drawers: (s.drawers as Rec[]).map((v, k) => ({ execution: v.mode === 'external' ? 'external' : 'internal', boxHeightMm: v.boxHeight, gapMm: v.gapAbove, widthMm: s32Q(v.outerWidth), depthMm: s32Q(v.depth), top: k === highest })),
  };
}
