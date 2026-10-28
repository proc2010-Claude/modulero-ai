// Baskets, trouser racks and pantographs of the sections (task FIT, third PR, MOD-DEC-484): the items of the project
// (state.fittings.storage) in the model of the wardrobe. The prototype had them only as a stub of the editor (MOD-DEC-318,
// 480). A basket for linen or for shoes and a trouser rack of BELLE pull out on full-extension runners in their own
// frame, screwed to the panels at the sides of the section: behind a door they are what an inner drawer is — the hinges
// keep Zero protrusion or a spacer (288, 331, 360), a closed hinge keeps off them (FE-04, 050), behind sliding doors the
// open leaves clear them (175). A pantograph of BASE PU70 is a rod lowered by its lever, screwed to the same panels.
// The sizes are those of the kits of BAZIS (the frame, the axis of the runners, the marking Ø3 × 1 of the screws); the
// item, its colour and the rules of its place are engine/policy/fittings-selection. Axes of the boxes: the prototype's
// (x across, y up from the floor, z from the front), millimetres.
import type { FittingsCatalog, StorageColour, StorageItem, StorageKind } from '../catalog/hardware/fittings.js';
import { fittingsSelection, PULL_OUT_KINDS, storageFor, STORAGE_KIND_RU, type FittingsChoice } from '../engine/policy/fittings-selection.js';
import type { Rec } from '../engine/policy/project-state.js';
import { wardrobeFill } from '../engine/policy/wardrobe-fill.js';
import type { DrawerPlan } from './drawer-boxes.js';
import type { FillSection } from './fill.js';
import { systemDepth } from './sliding.js';

const K = fittingsSelection.constants;
const pad2 = (n: number) => String(n).padStart(2, '0');
const r1 = (x: number) => Math.round(x * 10) / 10;
const fmt = (x: number) => String(r1(x)).replace('.', ',');

/** A storage item of a section in the model (MOD-DEC-484). */
export interface StorageUnit {
  /** `<section>-STORAGE01`…, by the order of the items of the section in the project. */
  id: string;
  sectionId: string;
  moduleId: string;
  /** Index of the section. */
  index: number;
  kind: StorageKind;
  /** It pulls out on runners (a basket, a trouser rack): an inner drawer for the door and the sliding leaves. */
  pullOut: boolean;
  /** The item of the catalogue, its colour and article; null — none fits, `problem` says why. */
  itemId: string | null;
  colour: StorageColour | null;
  article: string | null;
  brand: string | null;
  name: string | null;
  priceRub: number | null;
  mounting: StorageItem['mounting'] | null;
  /** The bottom of the frame over the interior bottom, as the project keeps it. */
  bottomMm: number;
  heightMm: number;
  /** The axis of the runners (the pivot of a pantograph) from the floor. */
  axisElevationMm: number;
  /** The heights where its frame meets the panels at its sides — its runners (Д 484): the spacer of the door and FE-04 keep to them; null — not on runners. */
  runnerZone: { y0: number; y1: number } | null;
  /** The volume it takes closed: between the panels or spacers, from the front of its frame to its depth. */
  box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  /** The panels it is screwed to: the sides of the section (or their spacers), or the panel above (TOP). */
  mountPartIds: string[];
  /** The marking of the kit (StorageItem.marks): back from the front of the frame (of a pantograph — from its pivot), up from the axis. */
  kitMarks: StorageItem['marks'];
  /** Its screws by that marking, on each panel it is screwed to: [x, y, z] of the prototype's axes. */
  marksMm: { partId: string; at: [number, number, number] }[];
  spacerIds: string[];
  loadKg: number | null;
  colourNote: string | null;
  problem: string | null;
}

/** The items of the project in the section `sectionId` (MOD-DEC-484), in their order. */
export function storageRowsOf(choice: FittingsChoice | null | undefined, sectionId: string) {
  return (choice?.storage ?? []).filter((r) => r.sectionId === sectionId);
}

/** A basket or a trouser rack stands in the section: the door behind it is that of an inner drawer (288, 484). */
export function storagePullOutIn(choice: FittingsChoice | null | undefined, sectionId: string): boolean {
  return storageRowsOf(choice, sectionId).some((r) => PULL_OUT_KINDS.includes(r.kind));
}

/**
 * The items of a section before its fill is built (MOD-DEC-484): the item each takes in the clear width between the
 * panels — less the spacers of the plan for those that pull out — and the depth from the front of its frame to `rear`
 * (the inner face of the back, or the rear of the sides without one), and the volume it takes. The panels above a
 * trouser rack screwed under one and the conflicts with the fill are found when the fill is known (finishStorage).
 */
export function planStorage(d: Rec, sec: FillSection, catalog: FittingsCatalog, plan: DrawerPlan, rear: number): StorageUnit[] {
  const { data, module: mod } = sec,
    g = mod.geometry,
    choice: FittingsChoice | null = d.fittings ?? null,
    spacerAt = (side: 'left' | 'right') => plan.spacers.find((s) => s.side === side)?.thicknessMm ?? 0,
    front = systemDepth(d) + K.storageFrontInside.value;
  return storageRowsOf(choice, data.id).map((row, k) => {
    const pullOut = PULL_OUT_KINDS.includes(row.kind),
      x0 = data.clearStart + (pullOut ? spacerAt('left') : 0),
      x1 = data.clearEnd - (pullOut ? spacerAt('right') : 0),
      pick = storageFor(catalog, row.kind, x1 - x0, rear - front, choice?.storageColour),
      item = pick.item,
      heightMm = item?.heightMm ?? 0,
      y0 = g.interiorBottomY + row.yMm,
      top = item?.mounting === 'TOP',
      mid = (x0 + x1) / 2,
      width = top ? item!.clearWidthMm.minMm : x1 - x0,
      depth = item?.depthMm ?? rear - front;
    return {
      id: `${data.id}-STORAGE${pad2(k + 1)}`,
      sectionId: data.id,
      moduleId: mod.id,
      index: sec.index,
      kind: row.kind,
      pullOut,
      itemId: item?.id ?? null,
      colour: pick.variant?.colour ?? null,
      article: pick.variant?.article ?? null,
      brand: item?.brand ?? null,
      name: pick.variant?.name ?? null,
      priceRub: pick.variant?.price?.rub ?? null,
      mounting: item?.mounting ?? null,
      bottomMm: row.yMm,
      heightMm,
      axisElevationMm: r1(y0 + (item?.axisFromBottomMm ?? 0)),
      runnerZone: item && pullOut && !top ? { y0: r1(y0 + item.axisFromBottomMm - K.storageRunnerZone.value), y1: r1(y0 + item.axisFromBottomMm + K.storageRunnerZone.value) } : null,
      box: { x0: r1(top ? mid - width / 2 : x0), x1: r1(top ? mid + width / 2 : x1), y0: r1(y0), y1: r1(y0 + heightMm), z0: r1(front), z1: r1(front + depth) },
      mountPartIds: item && !top ? [sec.left.panel, sec.right.panel] : [],
      kitMarks: item?.marks ?? [],
      marksMm: [],
      spacerIds: [],
      loadKg: item?.loadKg.value ?? null,
      colourNote: pick.colourNote,
      problem: pick.problem,
    };
  });
}

/** The heights the runners of the pull-outs of the section take, for the spacers of its doors (331, 360): over the interior bottom `interiorBottomMm`. */
export function storageSpacerZones(units: StorageUnit[], interiorBottomMm: number): { low: number; high: number; lengthMm: number }[] {
  return units.filter((u) => u.runnerZone && u.itemId).map((u) => ({ low: r1(u.runnerZone!.y0 - interiorBottomMm), high: r1(u.runnerZone!.y1 - interiorBottomMm), lengthMm: u.box.z1 - u.box.z0 }));
}

/**
 * The items of a section once its fill is built (MOD-DEC-484): the panel above a trouser rack screwed under one (a
 * shelf of the section or the roof whose lower face is the top of its frame), the spacers they stand on, their marks,
 * and what they meet — a shelf, a rod, a drawer or another item, the bottom or the roof of the section.
 */
export function finishStorage(m: Rec, sec: FillSection, units: StorageUnit[], spacerIds: Readonly<Record<'left' | 'right', string | undefined>>): StorageUnit[] {
  const { data, module: mod } = sec,
    g = mod.geometry,
    t: number = m.t,
    world = g.interiorBottomY,
    eps = 0.05,
    rod = wardrobeFill.constants.rodVerticalSize.value,
    busy: { what: string; lo: number; hi: number }[] = [
      ...(data.shelfYs as number[]).map((y, k) => ({ what: `полкой ${k + 1}`, lo: world + y - t / 2, hi: world + y + t / 2 })),
      ...(data.topShelfY !== undefined && !data.coverIsRoof && data.coverShelfIndex < 0 ? [{ what: 'полкой над ящиками', lo: world + data.topShelfY - t / 2, hi: world + data.topShelfY + t / 2 }] : []),
      ...(data.rodYs as number[]).map((y, k) => ({ what: `штангой ${k + 1}`, lo: world + y - rod / 2, hi: world + y + rod / 2 })),
      ...(data.drawers as Rec[]).map((v) => ({ what: v.id as string, lo: world + v.bottom, hi: world + v.bottom + v.boxHeight })),
    ];
  for (const u of units) {
    if (!u.itemId) continue;
    const { y0, y1 } = u.box,
      meets = [...busy, ...units.filter((o) => o !== u && o.itemId).map((o) => ({ what: o.id, lo: o.box.y0, hi: o.box.y1 }))].filter((b) => b.lo < y1 - eps && b.hi > y0 + eps).map((b) => b.what);
    if (y0 < world - eps || y1 > g.interiorTopY + eps) meets.push(y0 < world - eps ? 'дном секции' : 'крышей');
    if (meets.length) u.problem = `${u.id}: ${STORAGE_KIND_RU[u.kind].toLowerCase()} ${fmt(u.bottomMm)}–${fmt(u.bottomMm + u.heightMm)} мм над дном пересекается с ${meets.join(', ')} — передвиньте её или уберите (MOD-DEC-484)`;
    if (u.mounting === 'TOP') {
      const shelf = (m.parts as Rec[]).find((p) => p.sectionId === data.id && (p.kind === 'fixedShelf' || p.kind === 'adjustableShelf' || p.kind === 'drawerCoverShelf') && Math.abs(p.worldBox.y0 - y1) < 0.5),
        roof = Math.abs(g.interiorTopY - y1) < 0.5 ? mod.panelIds.top : null,
        panel = shelf?.id ?? (roof && (m.parts as Rec[]).some((p) => p.id === roof) ? roof : null);
      if (panel) u.mountPartIds = [panel];
      else u.problem ??= `${u.id}: вешало для брюк под полкой ставится под полку или крышу секции, а над ним их нет (MOD-DEC-484)`;
    } else if (u.pullOut) {
      u.spacerIds = (['left', 'right'] as const).map((s) => spacerIds[s]).filter((x): x is string => !!x);
      u.mountPartIds = [spacerIds.left ?? sec.left.panel, spacerIds.right ?? sec.right.panel];
    }
  }
  return units.map((u) => ({ ...u, marksMm: marks(u) }));
}

/** The depth of the pivot of a pantograph from the front of the carcass (Д 484): the middle of the depth to `rear`. */
export const pantographPivotZ = (u: Pick<StorageUnit, 'box'>): number => r1(u.box.z1 * K.pantographDepthAxis.value);

/** The screws of an item by the marking of its kit on each panel it is screwed to (MOD-DEC-484). */
function marks(u: StorageUnit): StorageUnit['marksMm'] {
  if (!u.itemId || !u.mountPartIds.length) return [];
  if (u.mounting === 'TOP') {
    const mid = (u.box.x0 + u.box.x1) / 2;
    return u.kitMarks.map((k) => ({ partId: u.mountPartIds[0]!, at: [r1(mid + k.offsetMm), r1(u.box.y1), r1(u.box.z0 + k.fromFrontMm)] as [number, number, number] }));
  }
  const from = u.kind === 'PANTOGRAPH' ? pantographPivotZ(u) : u.box.z0;
  return u.mountPartIds.flatMap((partId, side) => u.kitMarks.map((k) => ({ partId, at: [side ? u.box.x1 : u.box.x0, r1(u.axisElevationMm + k.offsetMm), r1(from + k.fromFrontMm)] as [number, number, number] })));
}
