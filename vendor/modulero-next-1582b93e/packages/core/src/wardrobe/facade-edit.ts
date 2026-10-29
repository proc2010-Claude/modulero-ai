// Edits of the facades of a swing wardrobe for the editor (task U1): rows of doors over the height of a section and
// the material of the doors. Rows are the prototype's split of a facade (editRows of the layer «Фасады», r1.html:83513:
// «Разделить по высоте», «Равная высота», «Удалить разделение», the height of a row); the doors of the rows are built
// by wardrobe/facades.ts (W4, facadeRows). The material is the choice of the layer of materials (mfSelectDecor,
// mfSetTariff, r1.html:58320, 58377): without it a door is made from the corpus board (MOD-DEC-347), with it the door
// is a ready-made one of that decor (FINDINGS 266). Each edit takes a WardrobeInput and returns a new one.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { exactAdd, exactCompare, exactDivideInteger, exactSub, exactToNumber, parseExactMm } from '../engine/policy/front-grid.js';
import { facadeExecutionOf, facadeMaterialOf, type FacadeMaterial } from '../catalog/hardware/facades.js';
import { facadeChoice, facadeChoiceTitle } from '../engine/policy/facade-materials.js';
import { materials, mfChoice, mfDecor, mfLabel } from '../engine/policy/materials.js';
import type { PolicyState } from '../engine/policy/project-state.js';
import { carcassModel } from './carcass.js';
import { shelfTypeAt } from './fill.js';
import { facadeRows, rowExactHeight } from './facades.js';
import type { JsonValue, WardrobeInput, WardrobeSection } from './input.js';
import { wardrobeFacades } from '../engine/policy/wardrobe-facades.js';

type EditResult = { ok: true; input: WardrobeInput; notice?: string } | { ok: false; problem: string };
type Rec = Record<string, any>;

const clone = (i: WardrobeInput): WardrobeInput => JSON.parse(JSON.stringify(i)) as WardrobeInput;

/** The lowest row of facades the prototype's editor accepts (r1.html:83609: «Ряд должен быть не ниже 80 мм»), mm. */
export const MIN_FACADE_ROW_HEIGHT = 80;

/** A row of facades as the editor shows it: id, doors (0 — an open opening, MOD-DEC-561), hinge side of one door, height, mm. */
export interface FacadeRowSummary {
  id: string;
  leaves: 0 | 1 | 2;
  hingeSide: 'left' | 'right';
  heightMm: number;
}

/** The facade field of the section and the seam between rows, as the carcass of the input builds them. */
function field(i: WardrobeInput, hw: HardwareCatalogs, index: number): { height: number; bottom: number; seam: number } {
  const m = carcassModel(i, hw),
    f = (m.facadeFields as { bottom: number; top: number }[])[index]!;
  return { height: f.top - f.bottom, bottom: f.bottom, seam: m.facadeGapProfile.seamY };
}

/** The rows of a section with their heights; a section without rows has none. */
export function facadeRowsOf(i: WardrobeInput, hw: HardwareCatalogs, index: number): FacadeRowSummary[] {
  const s = i.state.sections[index];
  if (!s?.facadeRows || !(s.facadeRows as JsonValue[]).length) return [];
  const f = field(i, hw, index);
  return facadeRows(s as Rec, f.height, f.seam, f.bottom).map((r: Rec) => ({ id: r.id, leaves: r.leaves === 2 ? 2 : r.leaves === 0 ? 0 : 1, hingeSide: r.hingeSide === 'right' ? 'right' : 'left', heightMm: r.height }));
}

/** Why a section takes no rows: external drawers have their own fronts (r1.html:83536), a lift front is one leaf. */
function noRows(s: WardrobeSection): string | null {
  if ((s.drawersEnabled ?? s.content === 'drawers') && (s.drawerMode ?? 'internal') === 'external') return 'Наружные ящики имеют собственные фасады. Проект не изменён.';
  if (s.facade === 'lift') return 'Подъёмный фасад по высоте не делится. Проект не изменён.';
  if (!s.facade || s.facade === 'none') return 'В секции нет дверей: сначала добавьте дверь. Проект не изменён.';
  return null;
}

/**
 * The rows of the section with their present heights written in (the prototype's step before every edit of a row,
 * r1.html:83540): a section with one door or two becomes one row of them; the heights become MANUAL.
 */
function manualRows(o: WardrobeInput, hw: HardwareCatalogs, index: number): { s: WardrobeSection; rows: Rec[]; gap: number } {
  const s = o.state.sections[index]!;
  if (!(s.facadeRows as JsonValue[] | undefined)?.length) {
    s.facadeRows = [{ id: 'ROW-1', leaves: s.facade === 'two' ? 2 : 1, hingeSide: s.hingeSide === 'right' ? 'right' : 'left' }];
    s.facadeHeightMode = 'EQUAL';
  }
  const f = field(o, hw, index),
    geom = facadeRows(s as Rec, f.height, f.seam, f.bottom),
    rows = s.facadeRows as Rec[];
  rows.forEach((r, k) => {
    r.height = geom[k].height;
    r.heightExactMm = geom[k].heightExactMm;
  });
  s.facadeHeightMode = 'MANUAL';
  s.facade = 'rows';
  return { s, rows, gap: f.seam };
}

/** Runs an edit of the rows; a refusal is its text, the input is not changed. */
function rowEdit(i: WardrobeInput, index: number, run: (o: WardrobeInput) => string | null, notice?: string): EditResult {
  const s = i.state.sections[index];
  if (!s) return { ok: false, problem: `Нет секции ${index + 1}` };
  const why = noRows(s);
  if (why) return { ok: false, problem: why };
  const o = clone(i);
  const problem = run(o);
  return problem ? { ok: false, problem } : { ok: true, input: o, ...(notice ? { notice } : {}) };
}

const rowIndex = (rows: Rec[], id: string | null) => (id === null ? rows.length - 1 : rows.findIndex((r) => r.id === id));

/**
 * «Разделить по высоте» (r1.html:83565): the row (the top one when none is given) is cut into two of equal height with
 * the seam between them; up to the rows of the policy (4). A row lower than 2 × 80 mm with the seam is refused.
 */
export function splitFacadeRow(i: WardrobeInput, hw: HardwareCatalogs, index: number, rowId: string | null = null): EditResult {
  return rowEdit(
    i,
    index,
    (o) => {
      const { s, rows, gap } = manualRows(o, hw, index),
        k = rowIndex(rows, rowId);
      if (k < 0) return 'Ряд удалён. Проект не изменён.';
      if (rows.length >= wardrobeFacades.constants.maxFacadeRows.value) return `Доступно до ${wardrobeFacades.constants.maxFacadeRows.value} рядов. Проект не изменён.`;
      const r = rows[k]!,
        half = exactDivideInteger(exactSub(r.heightExactMm, parseExactMm(String(gap))), 2);
      if (exactToNumber(half) < MIN_FACADE_ROW_HEIGHT) return 'Недостаточная высота для разделения. Проект не изменён.';
      let seq = Number(s.facadeRowSequence ?? rows.length);
      while (rows.some((x) => x.id === 'ROW-' + (seq + 1))) seq++;
      s.facadeRowSequence = seq + 1;
      r.heightExactMm = half;
      r.height = exactToNumber(half);
      rows.splice(k + 1, 0, { ...r, id: 'ROW-' + (seq + 1) });
      return null;
    },
    'Фасад разделён по высоте.',
  );
}

/** «Равная высота» (r1.html:83563): the rows share the field equally again. */
export function equalFacadeRows(i: WardrobeInput, hw: HardwareCatalogs, index: number): EditResult {
  return rowEdit(i, index, (o) => {
    const { s, rows } = manualRows(o, hw, index);
    if (rows.length < 2) return 'Разделения нет. Проект не изменён.';
    s.facadeHeightMode = 'EQUAL';
    return null;
  });
}

/**
 * «Удалить разделение» (r1.html:83580): the row joins its neighbour above (the top row — the one below) with the seam
 * between them. The last row left is the door of the section again.
 */
export function mergeFacadeRow(i: WardrobeInput, hw: HardwareCatalogs, index: number, rowId: string | null = null): EditResult {
  return rowEdit(i, index, (o) => {
    const { s, rows, gap } = manualRows(o, hw, index),
      k = rowIndex(rows, rowId);
    if (rows.length < 2) return 'Разделения нет. Проект не изменён.';
    if (k < 0) return 'Ряд удалён. Проект не изменён.';
    const n = k === rows.length - 1 ? k - 1 : k + 1,
      r = rows[k]!;
    // MOD-DEC-561: an open row joined with a row of doors takes its doors.
    if (!r.leaves && rows[n]!.leaves) Object.assign(r, { leaves: rows[n]!.leaves, hingeSide: rows[n]!.hingeSide });
    r.heightExactMm = exactAdd(exactAdd(r.heightExactMm, rows[n]!.heightExactMm), parseExactMm(String(gap)));
    r.height = exactToNumber(r.heightExactMm);
    rows.splice(n, 1);
    if (rows.length === 1) {
      // One row is the door of the section (the prototype kept a row of one; the doors are the same, FINDINGS 704).
      s.facade = r.leaves === 2 ? 'two' : r.leaves === 0 ? 'none' : 'one';
      s.hingeSide = r.hingeSide;
      delete s.facadeRows;
      delete s.facadeHeightMode;
      delete s.facadeRowSequence;
    }
    return null;
  });
}

/**
 * The height of a row (r1.html:83600): the top row takes the difference, the top row itself — the bottom one; each
 * row stays at least 80 mm.
 */
export function setFacadeRowHeight(i: WardrobeInput, hw: HardwareCatalogs, index: number, rowId: string, height: number): EditResult {
  return rowEdit(i, index, (o) => {
    if (!(Number.isFinite(height) && height > 0 && Math.round(height * 1000) === height * 1000)) return 'Введите положительную высоту, мм. Проект не изменён.';
    const { rows } = manualRows(o, hw, index),
      k = rowIndex(rows, rowId);
    if (k < 0) return 'Ряд удалён. Проект не изменён.';
    if (rows.length < 2) return 'Один ряд занимает всё поле. Проект не изменён.';
    const r = rows[k]!,
      other = rows[k === rows.length - 1 ? 0 : rows.length - 1]!,
      next = parseExactMm(String(height));
    other.heightExactMm = exactSub(exactAdd(other.heightExactMm, r.heightExactMm), next);
    other.height = exactToNumber(other.heightExactMm);
    if (other.height < MIN_FACADE_ROW_HEIGHT || height < MIN_FACADE_ROW_HEIGHT) return `Ряд должен быть не ниже ${MIN_FACADE_ROW_HEIGHT} мм. Проект не изменён.`;
    r.heightExactMm = next;
    r.height = exactToNumber(next);
    return null;
  });
}

/**
 * Doors of a row (one or two, r1.html:83557; none — an open opening of the section, MOD-DEC-561) and the hinge side of
 * one door. One row of the section keeps a door: a section without any is «Без двери» of the section.
 */
export function setFacadeRow(i: WardrobeInput, hw: HardwareCatalogs, index: number, rowId: string, patch: { leaves?: 0 | 1 | 2; hingeSide?: 'left' | 'right' }): EditResult {
  return rowEdit(i, index, (o) => {
    const { rows } = manualRows(o, hw, index),
      r = rows[rowIndex(rows, rowId)];
    if (!r) return 'Ряд удалён. Проект не изменён.';
    if (patch.leaves === 0 && rows.every((x) => x === r || !x.leaves)) return 'Это последний ряд с дверью. Чтобы убрать все двери секции, выберите у секции «Без двери». Проект не изменён.';
    if (patch.leaves !== undefined) r.leaves = patch.leaves;
    if (patch.hingeSide !== undefined) r.hingeSide = patch.hingeSide;
    return null;
  });
}

/**
 * The rows of heights set by hand after an edit of the carcass (R2-029, FINDINGS 1763): when the edit changed the
 * facade field of a section — the height, the base, the roof, the mezzanine — the rows no longer fill it, and the
 * project did not build. The top row takes the difference, as for «Высота ряда»; when it would be lower than 80 mm,
 * the rows are shared equally again (as with «Тип фасадов», FINDINGS 404). The user is told; a refused edit stays
 * refused.
 */
export function fitFacadeRows(r: EditResult, hw: HardwareCatalogs): EditResult {
  if (!r.ok) return r;
  const manual = r.input.state.sections.flatMap((s, k) => (s.facadeHeightMode === 'MANUAL' && (s.facadeRows as JsonValue[] | undefined)?.length ? [k] : []));
  if (!manual.length) return r;
  const probe = clone(r.input);
  for (const k of manual) probe.state.sections[k]!.facadeHeightMode = 'EQUAL';
  let m: Rec;
  try {
    m = carcassModel(probe, hw);
  } catch {
    return r;
  }
  const o = clone(r.input),
    seam = Number(m.facadeGapProfile.seamY);
  let topTook = 0,
    reshared = 0;
  for (const k of manual) {
    const f = (m.facadeFields as { bottom: number; top: number }[] | undefined)?.[k];
    if (!f) continue;
    const s = o.state.sections[k]!,
      rows = s.facadeRows as Rec[],
      available = exactSub(parseExactMm(String(f.top - f.bottom)), parseExactMm(String(seam * (rows.length - 1)))),
      heights = rows.map(rowExactHeight),
      others = heights.slice(0, -1).reduce((a, h) => exactAdd(a, h), parseExactMm('0')),
      top = exactSub(available, others);
    if (exactCompare(top, heights.at(-1)!) === 0) continue;
    if (exactToNumber(top) >= MIN_FACADE_ROW_HEIGHT) {
      rows.at(-1)!.heightExactMm = top;
      rows.at(-1)!.height = exactToNumber(top);
      topTook++;
    } else {
      s.facadeHeightMode = 'EQUAL';
      reshared++;
    }
  }
  if (!topTook && !reshared) return r;
  const told = [
    topTook ? 'Высота фасадного поля изменилась: верхний ряд фасадов, заданных по высоте вручную, принял разницу.' : '',
    reshared ? `Ряды фасадов ${reshared === 1 ? 'одной секции' : `${reshared} секций`} снова поделены поровну: верхнему ряду не осталось ${MIN_FACADE_ROW_HEIGHT} мм.` : '',
  ].filter(Boolean);
  return { ok: true, input: o, notice: [r.notice, ...told].filter(Boolean).join(' ') };
}

/**
 * Rows of heights set by hand after «Тип фасадов» (MOD-AI-79): the facade field of an inset door is smaller by the
 * gaps, so the rows of `sections` keep their seams where they were in `before` — over the shelves the user put them
 * on — and the top row takes the rest. A section whose row would be lower than 80 mm is shared equally again
 * (FINDINGS 404). Changes `after` in place; returns the number of sections shared again.
 */
export function keepFacadeSeams(before: WardrobeInput, after: WardrobeInput, hw: HardwareCatalogs, sections: readonly number[]): number {
  if (!sections.length) return 0;
  const seams = new Map(sections.map((k) => [k, facadeSeams(before, hw, k).map((x) => x.yMm)])),
    probe = clone(after);
  for (const k of sections) probe.state.sections[k]!.facadeHeightMode = 'EQUAL';
  let m: Rec;
  try {
    m = carcassModel(probe, hw);
  } catch {
    for (const k of sections) after.state.sections[k]!.facadeHeightMode = 'EQUAL';
    return sections.length;
  }
  const gap = Number(m.facadeGapProfile.seamY),
    exact = (x: number) => parseExactMm(String(Math.round(x * 1000) / 1000));
  let reshared = 0;
  for (const k of sections) {
    const s = after.state.sections[k]!,
      rows = s.facadeRows as Rec[],
      f = (m.facadeFields as { bottom: number; top: number }[])[k]!,
      ys = seams.get(k)!,
      heights = ys.map((y, n) => exact(y - gap / 2 - (n ? ys[n - 1]! + gap / 2 : f.bottom))),
      others = heights.reduce((a, h) => exactAdd(a, h), parseExactMm('0')),
      top = exactSub(exactSub(parseExactMm(String(f.top - f.bottom)), parseExactMm(String(gap * ys.length))), others);
    heights.push(top);
    if (ys.length !== rows.length - 1 || heights.some((h) => exactToNumber(h) < MIN_FACADE_ROW_HEIGHT)) {
      s.facadeHeightMode = 'EQUAL';
      reshared++;
      continue;
    }
    rows.forEach((r, n) => {
      r.heightExactMm = heights[n];
      r.height = exactToNumber(heights[n]!);
    });
  }
  return reshared;
}

/** A fixed shelf within this distance of a dragged seam draws the seam to its middle (MOD-DEC-560 (Д)), mm. */
export const FACADE_SEAM_SNAP = 20;

/**
 * A seam between two rows of doors the user drags on the drawing (MOD-DEC-560): `index` — the seam over the row
 * `index` (rows from the bottom), its middle `yMm` from the floor, the range that keeps both rows at least 80 mm, and
 * the middles of the fixed shelves of the section in that range it snaps to.
 */
export interface FacadeSeam {
  index: number;
  yMm: number;
  minMm: number;
  maxMm: number;
  snaps: number[];
}

/** The seams of the rows of a section; a section without rows has none. */
export function facadeSeams(i: WardrobeInput, hw: HardwareCatalogs, index: number): FacadeSeam[] {
  const s = i.state.sections[index];
  if (!s?.facadeRows || (s.facadeRows as JsonValue[]).length < 2) return [];
  const m = carcassModel(i, hw),
    f = field(i, hw, index),
    rows = facadeRows(s as Rec, f.height, f.seam, f.bottom),
    data: Rec = m.sectionsData[index],
    world = Number(m.modules.find((x: Rec) => x.id === data.moduleId).geometry.interiorBottomY),
    // The fixed shelves and the shelf over the drawers: a door joint over them is closed from inside (MOD-DEC-560).
    shelves = [
      ...(data.shelfYs as number[]).filter((_, k) => shelfTypeAt(s as Rec, k) === 'fixedShelf' || data.coverShelfIndex === k).map((y) => world + y),
      ...(data.topShelfY !== undefined && data.coverShelfIndex < 0 && !data.coverIsRoof ? [world + Number(data.topShelfY)] : []),
    ];
  return rows.slice(0, -1).map((r: Rec, k: number) => {
    const upper = rows[k + 1]!,
      minMm = r.bottom + MIN_FACADE_ROW_HEIGHT + f.seam / 2,
      maxMm = upper.bottom + upper.height - MIN_FACADE_ROW_HEIGHT - f.seam / 2;
    return { index: k, yMm: r.bottom + r.height + f.seam / 2, minMm, maxMm, snaps: shelves.filter((y) => y >= minMm - 1e-6 && y <= maxMm + 1e-6).sort((a, b) => a - b) };
  });
}

/**
 * Where a seam dragged to `yMm` stops (MOD-DEC-560): inside its range; at the middle of a fixed shelf nearer than
 * 20 mm; otherwise the seam keeps the whole millimetres of the row below it.
 */
export function snapFacadeSeam(seam: FacadeSeam, yMm: number): { yMm: number; snapped: boolean } {
  const near = seam.snaps.reduce<number | null>((a, y) => (Math.abs(y - yMm) <= FACADE_SEAM_SNAP && (a === null || Math.abs(y - yMm) < Math.abs(a - yMm)) ? y : a), null);
  if (near !== null) return { yMm: near, snapped: true };
  const whole = seam.yMm + Math.round(yMm - seam.yMm);
  return { yMm: Math.min(seam.maxMm, Math.max(seam.minMm, whole)), snapped: false };
}

/**
 * The seam over the row `seam` moved to `yMm` from the floor (MOD-DEC-560): the row below takes the new height, the
 * row above the rest, the other rows keep theirs; a fixed shelf nearer than 20 mm draws the seam to its middle. Each
 * of the two rows stays at least 80 mm.
 */
export function moveFacadeSeam(i: WardrobeInput, hw: HardwareCatalogs, index: number, seam: number, yMm: number): EditResult {
  const at = facadeSeams(i, hw, index)[seam];
  if (!at) return { ok: false, problem: 'Такого стыка фасадов в секции нет. Проект не изменён.' };
  if (!Number.isFinite(yMm)) return { ok: false, problem: 'Введите высоту стыка, мм. Проект не изменён.' };
  const target = snapFacadeSeam(at, yMm);
  if (target.yMm < at.minMm - 1e-6 || target.yMm > at.maxMm + 1e-6) return { ok: false, problem: `Ряд должен быть не ниже ${MIN_FACADE_ROW_HEIGHT} мм. Проект не изменён.` };
  return rowEdit(
    i,
    index,
    (o) => {
      const { rows } = manualRows(o, hw, index),
        lower = rows[seam]!,
        upper = rows[seam + 1]!,
        both = exactAdd(lower.heightExactMm, upper.heightExactMm),
        next = exactAdd(lower.heightExactMm, parseExactMm(String(Math.round((target.yMm - at.yMm) * 1000) / 1000)));
      lower.heightExactMm = next;
      lower.height = exactToNumber(next);
      upper.heightExactMm = exactSub(both, next);
      upper.height = exactToNumber(upper.heightExactMm);
      return null;
    },
    target.snapped ? 'Стык фасадов встал на середину фиксированной полки.' : 'Стык фасадов перенесён.',
  );
}

// ---------------------------------------------------------------- the material of the doors

/** The decors of the catalogue of the release a ready-made door may take (the list «Декор» of «Основной материал фасадов», r1.html:82905). */
export function facadeDecorChoices(hw: HardwareCatalogs): { id: string; title: string }[] {
  return hw.materials.decors.map((d) => ({ id: d.decorId, title: String(mfLabel(d.decorId, hw.materials)) }));
}

/** The tariffs of ready-made facades of the catalogue (HOLZCOM, an estimate, r1.html:58377): id, name and the thickness they price. */
export function facadeTariffChoices(hw: HardwareCatalogs): { id: string; title: string; thicknessMm: number; rubPerM2: number }[] {
  return (hw.materials.facadePrice.rows as Rec[]).filter((r) => r.kind === 'LISTED_RATE').map((r) => ({ id: r.id, title: r.source_label, thicknessMm: r.thickness_mm, rubPerM2: r.rate_rub_per_m2 }));
}

/** What the editor shows of the material of the doors: null — from the corpus board (MOD-DEC-347); a decor — ready-made. */
export interface FacadeMaterialSummary {
  decorId: string | null;
  tariffId: string | null;
}

export function facadeMaterial(i: WardrobeInput): FacadeMaterialSummary {
  const f = ((i.state.materialSelection ?? {}) as Rec).facade as Rec | undefined;
  return { decorId: f?.decorId ?? null, tariffId: f?.tariffId ?? null };
}

/**
 * The material of the doors (MOD-DEC-347): null — made in the order from the corpus board, in its decor; a decor of
 * the catalogue — a ready-made door of that decor, out of the cutting plan, its cups drilled by the supplier
 * (FINDINGS 266), priced by the chosen tariff or «Цена не определена» without one (247). The record is the
 * prototype's (mfSelectDecor, mfSetTariff); the carcass decor is not changed.
 */
export function setFacadeMaterial(i: WardrobeInput, hw: HardwareCatalogs, choice: { decorId?: string | null; tariffId?: string | null }): EditResult {
  const mc = hw.materials,
    tariffs = facadeTariffChoices(hw);
  if (choice.decorId && !mfDecor(choice.decorId, mc)) return { ok: false, problem: `Декора ${choice.decorId} нет в каталоге. Проект не изменён.` };
  if (choice.tariffId && !tariffs.some((t) => t.id === choice.tariffId)) return { ok: false, problem: `Тарифа ${choice.tariffId} нет. Проект не изменён.` };
  const o = clone(i),
    s = o.state as unknown as Rec,
    now = facadeMaterial(i),
    decorId = choice.decorId === undefined ? now.decorId : choice.decorId,
    tariffId = choice.tariffId === undefined ? now.tariffId : choice.tariffId;
  const appearance = { ...(s.appearanceSelection ?? {}) } as Rec;
  if (decorId === null) {
    if (s.materialSelection) {
      const { facade: _, ...rest } = s.materialSelection as Rec;
      s.materialSelection = rest;
      if (Object.keys(rest).every((k) => k === 'version')) delete s.materialSelection;
    }
    appearance.facade = { chosen: false, origin: 'legacy-unconfirmed' };
    s.appearanceSelection = appearance;
    return { ok: true, input: o, notice: 'Двери изготавливаются в заказе из плиты корпуса, в его декоре.' };
  }
  const d = mfDecor(decorId, mc)!,
    t = tariffs.find((x) => x.id === tariffId) ?? null;
  s.materialSelection = {
    version: materials.constants.schema.value,
    ...(s.materialSelection ?? {}),
    facade: {
      decorId,
      variantId: null,
      workingVariantId: d.lamarty?.workingVariantId ?? null,
      sourceVersion: d.lamarty?.sourceVersion ?? null,
      textureCode: d.lamarty?.textureCode ?? null,
      tariffId: t?.id ?? null,
    },
  };
  s.facadeFinish = { ...(s.facadeFinish ?? {}), code: decorId, material: 'Визуальный референс · ' + mfLabel(decorId, mc), rate: t?.rubPerM2 ?? null };
  appearance.facade = { chosen: true, origin: 'explicit-decor-choice' };
  s.appearanceSelection = appearance;
  return { ok: true, input: o, notice: t ? `Готовые фасады: ${mfLabel(decorId, mc)}, тариф HOLZCOM «${t.title}» — ориентир цены.` : `Готовые фасады: ${mfLabel(decorId, mc)}. Тариф не выбран — цена фасадов не определена.` };
}

// ---------------------------------------------------------------- «материал → исполнение → цвет» (MOD-DEC-573)

/** The longest colour code (RAL, NCS) or species of veneer the field takes (Д, FINDINGS 1335), characters. */
export const FACADE_COLOR_TEXT_MAX = 60;

/** What the editor shows of the choice: null — the doors are made from the corpus board (347) or the record of the prototype. */
export interface FacadeChoiceSummary {
  materialId: string;
  executionId: string;
  decorId: string | null;
  colorText: string | null;
  thicknessMm: number;
  purchased: boolean;
  title: string;
}

export function facadeChoiceOf(i: WardrobeInput): FacadeChoiceSummary | null {
  const c = facadeChoice(i.state as PolicyState, Number(i.controls.thickness));
  return c ? { materialId: c.materialId, executionId: c.executionId, decorId: c.decorId, colorText: c.colorText, thicknessMm: c.thicknessMm, purchased: c.purchased, title: facadeChoiceTitle(c) } : null;
}

/** The decors a material allows as its colour, from the catalogue of decors of the release: of the board, any as a sample, none. */
export function facadeColorDecors(m: FacadeMaterial, hw: HardwareCatalogs): { id: string; title: string }[] {
  const all = facadeDecorChoices(hw);
  return m.decors === null ? all : all.filter((d) => m.decors!.includes(d.id));
}

/**
 * The material of the facades (MOD-DEC-573): `materialId` null — the doors are made from the corpus board (347); a
 * material of the catalogue of the release with its execution (the first one, or the one kept when the material stays)
 * and its colour: a decor of its board (it goes to the cutting plan), a decor as a sample or a colour code (RAL, NCS),
 * the species of veneer as text. The thickness of the door is of the execution. To the leaves of a sliding wardrobe
 * a bought material does not apply (ARISTO, с. 50, 69): its inserts take a decor of ЛДСП or ЛМДФ only.
 */
export function setFacadeChoice(i: WardrobeInput, hw: HardwareCatalogs, choice: { materialId: string | null; executionId?: string; decorId?: string | null; colorText?: string | null }): EditResult {
  if (choice.materialId === null) return setFacadeMaterial(i, hw, { decorId: null });
  const m = facadeMaterialOf(hw.facades, choice.materialId);
  if (!m) return { ok: false, problem: `Материала фасадов ${choice.materialId} нет в каталоге. Проект не изменён.` };
  if (m.supply === 'PURCHASED' && i.domain === 'sliding')
    return { ok: false, problem: `${m.title} к полотну купе не применяется: ARISTO не допускает в полотне МДФ и покрытия, склонные к выгибанию. Во вставках — ЛДСП или ЛМДФ. Проект не изменён.` };
  const now = facadeChoiceOf(i),
    same = now?.materialId === m.id,
    executionId = choice.executionId ?? (same ? now!.executionId : m.executions[0]!.id),
    e = facadeExecutionOf(m, executionId);
  if (!e) return { ok: false, problem: `У материала «${m.title}» нет исполнения ${executionId}. Проект не изменён.` };
  const allowed = facadeColorDecors(m, hw).map((d) => d.id),
    corpus = (mfChoice('corpus', i.state as PolicyState)?.decorId as string | undefined) ?? null,
    kept = same ? now!.decorId : null,
    decorId =
      choice.decorId !== undefined
        ? choice.decorId
        : m.color === 'BOARD_DECOR'
          ? ([kept, corpus].find((x) => x && allowed.includes(x)) ?? allowed[0] ?? null)
          : m.color === 'SPECIES'
            ? null
            : kept,
    text = (choice.colorText !== undefined ? choice.colorText : same ? now!.colorText : null)?.trim() || null;
  if (decorId !== null && !allowed.includes(decorId)) return { ok: false, problem: `Декор ${decorId} не входит в цвета материала «${m.title}». Проект не изменён.` };
  if (m.color === 'BOARD_DECOR' && decorId === null) return { ok: false, problem: `У материала «${m.title}» цвет — декор плиты: выберите декор. Проект не изменён.` };
  if (text && text.length > FACADE_COLOR_TEXT_MAX) return { ok: false, problem: `Код цвета — не длиннее ${FACADE_COLOR_TEXT_MAX} знаков. Проект не изменён.` };
  const o = clone(i),
    s = o.state as unknown as Rec,
    d = mfDecor(decorId, hw.materials);
  s.materialSelection = {
    version: materials.constants.schema.value,
    ...(s.materialSelection ?? {}),
    facade: {
      decorId,
      // A door made in the order is cut from the board of the decor at its thickness (mfPartMaterial).
      variantId: m.supply === 'MANUFACTURE' ? 'BY_THICKNESS' : null,
      workingVariantId: d?.lamarty?.workingVariantId ?? null,
      sourceVersion: d?.lamarty?.sourceVersion ?? null,
      textureCode: d?.lamarty?.textureCode ?? null,
      tariffId: null,
      materialId: m.id,
      executionId: e.id,
      materialTitle: m.title,
      executionTitle: e.title,
      supply: m.supply,
      thicknessMm: e.thicknessMm,
      colorText: m.color === 'BOARD_DECOR' ? null : text,
    },
  };
  s.appearanceSelection = { ...(s.appearanceSelection ?? {}), facade: { chosen: true, origin: 'explicit-material-choice' } };
  const t = e.thicknessMm === 'BOARD' ? Number(i.controls.thickness) : e.thicknessMm,
    color = decorId ? String(mfLabel(decorId, hw.materials)) : text,
    price = e.priceRubPerM2.value;
  return {
    ok: true,
    input: o,
    notice:
      m.supply === 'MANUFACTURE'
        ? `Фасады: ${m.title} ${t} мм, ${color} — изготавливаются в заказе, в раскрое и присадке.`
        : `Фасады: ${m.title}, ${e.title}${color ? ', ' + color : ''} — готовые покупные, ${price !== null ? `${price} ₽/м², ориентир` : 'цена не определена'}; чашки петель сверлит поставщик.`,
  };
}
