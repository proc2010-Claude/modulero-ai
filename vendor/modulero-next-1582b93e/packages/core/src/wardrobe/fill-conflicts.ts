// «Изменение затрагивает наполнение» of the prototype r1 (ckConflicts r1.html:90044, ckConflictDialog r1.html:90161,
// the resolutions of ckTransaction r1.html:90111): an edit of the carcass after which a shelf, a rod or a drawer no
// longer fits its section is not refused at once. The user is shown what is affected and chooses «Удалить затронутое»
// or «Изменить размеры»; without a choice the project is not changed.
//
// The prototype froze the fill before every edit of the carcass (u136FreezeContents r1.html:90090) and counted as
// affected every element that moved. The editor keeps its own layout of the fill that follows the carcass (the rods
// by MOD-DEC-310, the shelves laid out by «Распределить полки»): affected here is what leaves its section — a shelf
// over the roof, a rod over the inner height or out of the depth (R2-027, FINDINGS 2782), a drawer over it or with
// other runners (FINDINGS 1129), a basket, a trouser rack or a pantograph over the roof (MOD-DEC-484; R2-031,
// FINDINGS 1762).
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { STORAGE_KIND_RU, type FittingsChoice } from '../engine/policy/fittings-selection.js';
import type { Rec } from '../engine/policy/project-state.js';
import { carcassModel } from './carcass.js';
import { ensureSectionConfig } from './fill.js';
import * as fill from './fill-edit.js';
import type { WardrobeInput } from './input.js';

/** An element of the fill an edit of the carcass affects (ckConflicts). `index` — among the elements of its kind in the section. */
export interface FillConflict {
  section: number;
  kind: 'shelf' | 'rod' | 'drawer' | 'storage';
  index: number;
  /** «Полка 2 · секция 1», as the prototype lists it. */
  label: string;
  /** The element stays in its section but is too close to another one: the fill of two sections joined (MOD-DEC-570). */
  clash?: true;
}

/** The least clear height of a section for a shelf (MIN_SHELF_CLEARANCE r1.html:3649). */
const MIN_SHELF_CLEARANCE = 100;
/** A rod is lowered to 70 mm under the roof by «Изменить размеры» (r1.html:90135). */
const ROD_UNDER_ROOF = 70;
/** Rounding of the comparisons, mm. */
const EPS = 1e-6;

const KIND_LABEL = { shelf: 'Полка', rod: 'Штанга', drawer: 'Ящик' } as const;

function modelOf(i: WardrobeInput, hw: HardwareCatalogs): Rec | null {
  try {
    return carcassModel(i, hw);
  } catch {
    return null;
  }
}

/**
 * What of the fill the edit `before` → `after` puts out of its section (ckConflicts r1.html:90044): the sections are
 * matched by id; a section the edit removed is not listed (its fill goes with it, as in r1). An element too close to
 * another one after the edit and not before — the fill of two sections joined by «Удалить перегородку» (MOD-DEC-570) —
 * is listed too (`clash`).
 */
export function fillConflicts(before: WardrobeInput, after: WardrobeInput, hw: HardwareCatalogs): FillConflict[] {
  const a = modelOf(after, hw),
    b = modelOf(before, hw);
  if (!a) return [];
  const out: FillConflict[] = [],
    t = Number(a.t),
    push = (section: number, kind: FillConflict['kind'], index: number, label = `${KIND_LABEL[kind as keyof typeof KIND_LABEL]} ${index + 1}`) => out.push({ section, kind, index, label: `${label} · секция ${section + 1}` });
  a.sectionsData.forEach((s: Rec, i: number) => {
    const max = Number(s.geometry.innerH),
      old: Rec | undefined = b?.sectionsData.find((x: Rec) => x.id === s.id);
    (s.shelfYs as number[]).forEach((y, k) => y > max - t / 2 + EPS && push(i, 'shelf', k));
    // A rod over the inner height, or one whose holders a smaller depth leaves out of the section — by the rule of
    // «По глубине» of its panel (setRodDepth, R2-027).
    const body = a.modules.find((x: Rec) => x.id === s.moduleId).geometry;
    (s.rodYs as number[]).forEach((y, k) => (y > max + EPS || !rodAxisFits(a, s.id, i, k, after.state as Rec, body)) && push(i, 'rod', k));
    (s.drawers as Rec[]).forEach((d, k) => {
      const was: Rec | undefined = old?.drawers?.[k],
        runners = !!was && (s.drawerSystem?.slideLen !== old!.drawerSystem?.slideLen || d.depth !== was.depth);
      if (d.bottom + d.boxHeight > max + EPS || runners) push(i, 'drawer', k);
    });
    // MOD-DEC-484: an item of the catalogue keeps its height; over the roof it leaves the section.
    ((s.storage ?? []) as Rec[]).forEach((u, k) => u.itemId && u.box.y1 > Number(s.geometry.interiorTopY) + EPS && push(i, 'storage', k, `${STORAGE_KIND_RU[u.kind as keyof typeof STORAGE_KIND_RU]} ${k + 1}`));
    const listed = new Set(out.filter((c) => c.section === i).map((c) => `${c.kind}:${c.index}`)),
      key = (c: fill.FillClash) => `${c.type}:${c.lo.toFixed(1)}/${c.with.type}:${c.with.lo.toFixed(1)}`,
      world = Number(s.geometry.interiorBottomY),
      was = old && b ? new Set(fill.fillClashes(old, Number(b.t), Number(old.geometry.interiorBottomY), Number(b.gap)).map(key)) : new Set<string>();
    for (const c of fill.fillClashes(s, t, world, Number(a.gap)))
      if (!was.has(key(c)) && !listed.has(`${c.type}:${c.index}`)) {
        push(i, c.type, c.index);
        out[out.length - 1]!.clash = true;
      }
  });
  return out;
}

/** The axis of the rod `index` stands where «По глубине» of its panel lets it (fill.rodAxisRange). */
function rodAxisFits(m: Rec, sectionId: string, section: number, index: number, state: Rec, g: Rec): boolean {
  const r = fill.rodAxisRange(m, sectionId, index, state, g),
    axis = fill.rodAxisOf(state, section, index, g);
  return !r || (axis >= r.minMm - EPS && axis <= r.maxMm + EPS);
}

/** Whether «Изменить размеры» is offered (canResize r1.html:90056): the section keeps room for a shelf, a drawer box fits it. */
export function canResize(after: WardrobeInput, hw: HardwareCatalogs, conflicts: FillConflict[]): boolean {
  const a = modelOf(after, hw);
  if (!a || conflicts.some((c) => c.clash)) return false;
  return conflicts.every((c) => {
    const s = a.sectionsData[c.section],
      max = Number(s.geometry.innerH);
    if (c.kind === 'drawer') return s.drawers[c.index].boxHeight < max && s.drawerSystem?.slideLen > 0;
    if (c.kind === 'storage') return Number(s.storage[c.index].heightMm) <= max + EPS;
    return max > MIN_SHELF_CLEARANCE;
  });
}

export type ResolveResult = { ok: true; input: WardrobeInput; notice: string } | { ok: false; problem: string };

/** The places of the storage rows of the section `sectionId` among all rows of the project (removeStorage). */
function storageOwn(i: WardrobeInput, sectionId: string): number[] {
  return ((((i.state as Rec).fittings as FittingsChoice | undefined)?.storage ?? []) as Rec[]).flatMap((r, k) => (r.sectionId === sectionId ? [k] : []));
}

/** Each step of a resolution removes one element; the fill of a section is bounded, this only stops a loop. */
const MAX_STEPS = 200;

/**
 * «Удалить затронутое» (r1.html:90111): the affected shelves, rods and drawers are removed, the rest of the fill keeps
 * its place. A drawer goes with the shelf over the drawers when it was the last one, as «Убрать» of the panel.
 */
export function removeAffected(before: WardrobeInput, after: WardrobeInput, hw: HardwareCatalogs): ResolveResult {
  let x = after,
    n = 0;
  try {
    for (let c = fillConflicts(before, x, hw); c.length; c = fillConflicts(before, x, hw)) {
      if (++n > MAX_STEPS) return { ok: false, problem: 'Затронутое наполнение не удаляется. Проект не изменён.' };
      // The highest element of the last section first: the indices of the others stay as listed.
      const last = c[c.length - 1]!;
      x =
        last.kind === 'shelf'
          ? fill.removeShelf(x, hw, last.section, last.index).input
          : last.kind === 'drawer'
            ? fill.removeDrawer(x, hw, last.section, last.index).input
            : last.kind === 'storage'
              ? fill.removeStorage(x, hw, last.section, last.index).input
              : fill.removeRod(x, hw, last.section, last.index).input;
    }
  } catch (e) {
    return { ok: false, problem: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, input: x, notice: `Изменение применено; затронутое наполнение удалено (${n}).` };
}

/**
 * «Изменить размеры» (r1.html:90128): the affected elements stay and take the new size of their section — a shelf over
 * the roof goes down to the highest level under the roof that keeps the grid and the clearances of «Полка, мм» and
 * room for the affected shelves over it, a rod
 * to 70 mm under the roof, the drawers keep their places with the new runners. When that does not put the fill back
 * into its sections, the choice is refused and the project is not changed (r1.html:90147).
 */
export function resizeAffected(before: WardrobeInput, after: WardrobeInput, hw: HardwareCatalogs): ResolveResult {
  const conflicts = fillConflicts(before, after, hw);
  if (!canResize(after, hw, conflicts)) return { ok: false, problem: 'Размеры затронутого наполнения не изменить: секция для него мала. Выберите «Удалить затронутое». Проект не изменён.' };
  let x = after;
  try {
    const m = carcassModel(after, hw),
      t = Number(m.t);
    // The affected shelves of a section from the lowest one up: each takes the highest level that leaves room for the
    // affected shelves over it (a shelf and 100 mm each).
    const shelves = conflicts.filter((c) => c.kind === 'shelf');
    for (const c of shelves.slice().sort((p, q) => p.section - q.section || p.index - q.index)) {
      const levels = fill.shelfDragLevels(x, hw, c.section, c.index),
        over = shelves.filter((o) => o.section === c.section && o.index > c.index).length,
        top = levels.maxMm - over * (t + MIN_SHELF_CLEARANCE);
      let placed = false;
      for (let y = levels.baseMm + Math.floor((top - levels.baseMm) / levels.stepMm + EPS) * levels.stepMm; y >= levels.minMm - EPS && !placed; y -= levels.stepMm) {
        try {
          x = fill.moveShelf(x, hw, c.section, c.index, y).input;
          placed = true;
        } catch {
          // the next level down
        }
      }
      if (!placed) return { ok: false, problem: `${c.label}: под крышей нет места для полки. Выберите «Удалить затронутое». Проект не изменён.` };
    }
    for (const c of conflicts.filter((c) => c.kind === 'rod')) {
      const out = structuredClone(x),
        cfg = ensureSectionConfig((out.state.sections as Rec[])[c.section]!),
        innerH = Number(carcassModel(x, hw).sectionsData[c.section].geometry.innerH);
      cfg.rodPositions = (carcassModel(x, hw).sectionsData[c.section].rodYs as number[]).map((y) => Math.min(y, innerH - ROD_UNDER_ROOF));
      // A rod out of the depth comes to the nearest place its panel takes (R2-027): its holders inside the section.
      const mx = carcassModel(x, hw),
        sx = mx.sectionsData[c.section],
        r = fill.rodAxisRange(mx, sx.id, c.index, x.state as Rec, mx.modules.find((q: Rec) => q.id === sx.moduleId).geometry),
        row = cfg.filling?.rod?.[c.index];
      if (r && row && typeof row.depthAxis === 'number') row.depthAxis = Math.min(Math.max(row.depthAxis, Math.ceil(r.minMm * 2) / 2), Math.floor(r.maxMm * 2) / 2);
      x = out;
    }
    // A basket, a trouser rack or a pantograph goes down under the roof; it must not meet the rest of the fill there.
    for (const c of conflicts.filter((c) => c.kind === 'storage')) {
      const s = carcassModel(x, hw).sectionsData[c.section],
        own = storageOwn(x, s.id)[c.index]!,
        out = structuredClone(x),
        rows = ((out.state as Rec).fittings as FittingsChoice).storage!;
      rows[own] = { ...rows[own]!, yMm: Math.floor((Number(s.geometry.innerH) - Number(s.storage[c.index].heightMm)) * 10 + EPS) / 10 };
      const clashes = (i: WardrobeInput) => {
        const m = carcassModel(i, hw),
          sec = m.sectionsData[c.section];
        return fill.fillClashes(sec, Number(m.t), Number(sec.geometry.interiorBottomY), Number(m.gap)).filter((k) => k.with.type === 'storage').length + ((sec.storage ?? []) as Rec[]).filter((u) => u.problem).length;
      };
      if (clashes(out) > clashes(x)) return { ok: false, problem: `${c.label}: под крышей ему мешает другое наполнение. Выберите «Удалить затронутое». Проект не изменён.` };
      x = out;
    }
  } catch (e) {
    return { ok: false, problem: e instanceof Error ? e.message : String(e) };
  }
  // The drawers keep their places: the new runners are the edit itself. What is left out of its section is refused.
  const left = fillConflicts(x, x, hw);
  if (left.length) return { ok: false, problem: `${left.map((c) => c.label).join(', ')}: не помещается в секции и после изменения размеров. Выберите «Удалить затронутое». Проект не изменён.` };
  return { ok: true, input: x, notice: 'Изменение применено; размеры затронутого наполнения изменены.' };
}
