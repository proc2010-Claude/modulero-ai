// Creating and editing projects. Every operation mutates the given project in place and either
// succeeds or throws without leaving a half-applied change (resize restores on failure).
// Defaults and rules: engine/policy/home.ts. A new project gets the rule set of the editor (r4 unless asked for r3); the
// hardware catalogue the edits are validated with is the editor's argument.
import { facadeExecutionOf, facadeMaterialOf } from '../catalog/hardware/facades.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { legsBaseHeight } from '../engine/policy/fittings-selection.js';
import { HOME, HOME_R3, HOME_R5, HOME_SHARED_SHELF, homeRules, type HomeGenerator } from '../engine/policy/home.js';
import { mfDecor } from '../engine/policy/materials.js';
import { s32Distribute } from '../engine/policy/system32.js';
import { FACADE_COLOR_TEXT_MAX } from '../wardrobe/facade-edit.js';
import { archetypeDefaults, GENERATOR_VERSION, homeTemplates, materialProfiles, materials, priceByPlan, prototypeArchetypeDefaults, rateKeys, rateKeysR4, templatesR5 } from './catalog.js';
import { carcassDecorName, decorThicknesses } from './decor.js';
import { coverRise, coverShelfIds, coverShelfOf, drawerClosedAbove, drawerUnder, followCovers, frontRoom, roomText, type FrontKind, type RoomPart } from './fronts.js';
import { allFronts, availableBays, bay, bounds, clone, foot, nicheLimits, refreshBayIds, topT } from './geometry.js';
import { joinery } from './joinery.js';
import { homeCasters, homeShelfSupport, runnerInfo, shelfLowerMm, smallDrawerPattern } from './mechanisms.js';
import { DECOR_RATE_KEYS, type Axis, type Body, type DecorRates, type Door, type Drawer, type Front, type HomeFacadeChoice, type HomeProject, type MaterialId, type NichePanel, type Partition, type Rates, type RimSide, type Shelf, type TemplateId } from './types.js';
import { validate } from './validate.js';
import { setHomeBand } from './edge-edit.js';
import type { EdgeEditAccess } from '../engine/policy/edge-manual.js';
import type { EdgeChoice } from '../wardrobe/edge-edit.js';

/** Where «Копировать» of r1 puts the copy (copySelected, r1.html:100677): a place of the editor, not a rule of the construction. */
const COPY_SHELF_RISE = 64,
  COPY_PARTITION_GAP = 80;
/** «Количество полок» of «Равные просветы», r1.html:100754. */
const EQUAL_SHELVES_MAX = 20;
/** Of «Ящики равной высоты» (MOD-AI-34, Д): as many as the fronts of a body may be at most (validate(): 40 fronts). */
const EQUAL_DRAWERS_MAX = 20;

export type IdSource = () => string;
export const randomId: IdSource = () =>
  'HF-' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));

/**
 * Re-spreads a stack of fronts (bottom to top) between a new bottom and a new top, keeping every seam: heights scale.
 * r4; r3 keeps the prototype formula with 2 mm seams in resize(); r5 keeps the heights of the drawers (keepStack).
 */
function spreadStack(p: HomeProject, b: Body, group: Front[], low: number, top: number): void {
  if (homeRules(p).keepFrontHeights) return keepStack(p, b, group, low, top);
  const first = group[0],
    last = group[group.length - 1],
    heights = group.reduce((s, f) => s + f.h, 0),
    seams = last.y + last.h - first.y - heights,
    scale = (top - low - seams) / heights;
  let cursor = low,
    prevEnd = first.y;
  for (const f of group) {
    const seam = f.y - prevEnd;
    prevEnd = f.y + f.h;
    f.y = cursor + seam;
    f.h *= scale;
    cursor = f.y + f.h;
  }
}

/**
 * r5 (MOD-AI-38, Д): a stack of fronts between a new bottom and a new top keeps what it can, in whole millimetres. The
 * difference goes first to the free space inside the stack (a gap wider than the seam of the rule set), the largest
 * one first; then to its doors, in proportion to their heights, while each stays from the smallest front height; and
 * only a stack of drawers alone, or one whose doors cannot take it, spreads it over all its fronts. The seams stay.
 */
function keepStack(p: HomeProject, b: Body, group: Front[], low: number, top: number): void {
  const seam = homeRules(p).stackSeam,
    gaps = group.map((f, i) => (i ? f.y - (group[i - 1].y + group[i - 1].h) : 0)),
    heights = group.map((f) => f.h);
  let need = top - low - heights.reduce((a, v) => a + v, 0) - gaps.reduce((a, v) => a + v, 0);
  // The free space inside the stack, the largest first, down to the seam.
  for (const i of gaps.map((_, i) => i).filter((i) => gaps[i]! > seam + 1).sort((a, c) => gaps[c]! - gaps[a]!)) {
    const take = Math.max(need, seam - gaps[i]!);
    gaps[i]! += take;
    need -= take;
    if (Math.abs(need) < 0.01) break;
  }
  const doors = group.map((f, i) => ((b.doors as Front[]).includes(f) ? i : -1)).filter((i) => i >= 0),
    share = (who: number[]) => {
      const sum = who.reduce((a, i) => a + heights[i]!, 0),
        next = who.map((i) => heights[i]! + (need * heights[i]!) / sum);
      return next.every((v) => v >= HOME.frontMinHeight) ? who : null;
    },
    who = Math.abs(need) < 0.01 ? [] : ((doors.length ? share(doors) : null) ?? group.map((_, i) => i));
  if (who.length) {
    // Whole millimetres: the heights are floored and the millimetres left go to the shortest fronts, the lower one of
    // two equal, so fronts equal to a millimetre stay so (each stays within a millimetre of its share).
    const sum = who.reduce((a, i) => a + heights[i]!, 0),
      exact = who.map((i) => heights[i]! + (need * heights[i]!) / sum),
      target = Math.round(exact.reduce((a, v) => a + v, 0)),
      whole = exact.map(Math.floor);
    let left = target - whole.reduce((a, v) => a + v, 0);
    for (const k of exact.map((_, k) => k).sort((a, c) => whole[a]! - whole[c]! || a - c)) if (left-- > 0) whole[k]! += 1;
    who.forEach((i, k) => (heights[i] = whole[k]!));
    // r5 (MOD-AI-35): fronts lower than the smallest front height — the refusal names how many fit.
    if (homeRules(p).namedLimits && heights.some((v) => v < HOME.frontMinHeight)) {
      const span = top - low,
        n = group.length,
        fit = Math.max(0, Math.floor((span + seam) / (HOME.frontMinHeight + seam))),
        need = Math.ceil(b.h + n * HOME.frontMinHeight + (n - 1) * seam + gaps.reduce((a, v) => a + Math.max(0, v - seam), 0) - span);
      throw Error(
        `Фасады ниши не помещаются по высоте: их ${n}, а от ${Math.round(low)} до ${Math.round(top)} мм от пола фасадов от ${HOME.frontMinHeight} мм со швом ${seam} мм встаёт не больше ${fit}. Для ${n} фасадов корпусу нужна высота не меньше ${need} мм, или уберите фасад.`,
      );
    }
  }
  let cursor = low;
  group.forEach((f, i) => {
    f.y = cursor + gaps[i]!;
    f.h = heights[i]!;
    cursor = f.y + f.h;
  });
}

/** Fronts of a body grouped by bay, each group bottom to top. */
function frontStacks(b: Body): Front[][] {
  const groups = new Map<string, Front[]>();
  for (const f of allFronts(b)) {
    const key = f.lo + '|' + f.hi;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }
  return [...groups.values()].map((g) => g.sort((a, c) => a.y - c.y));
}

export function createHomeEditor(hw: HardwareCatalogs, newId: IdSource = randomId, generator: HomeGenerator = GENERATOR_VERSION) {
  function create(templateId: TemplateId = 'own'): HomeProject {
    const r3 = generator === HOME_R3,
      d = (r3 ? (prototypeArchetypeDefaults as Partial<typeof archetypeDefaults>) : archetypeDefaults)[templateId];
    if (!d) throw Error('Заготовка не найдена.');
    // r5 (MOD-AI-73, FINDINGS 3322): the templates after the first eight (MOD-DEC-366) are of the rule set r5.
    const spec = homeTemplates({ generatorVersion: generator }).find((t) => t.id === templateId);
    if (!spec) throw Error(`Заготовка «${templatesR5.find((t) => t.id === templateId)?.name ?? templateId}» есть только в конструкции r5.`);
    // The vanity table is the desk with its pedestal of drawers.
    const desk = templateId === 'desk' || templateId === 'vanity';
    const p: HomeProject = {
      id: newId(),
      name: spec.name,
      templateId,
      material: 'oak',
      thickness: 18,
      edgeThickness: 0.4,
      hardwareVariant: 'hettich-rastex15-18-du325',
      supportVariant: 'boyard-p101zn56',
      floor: 'hard',
      bodies: [],
      rates: Object.fromEntries((r3 ? rateKeys : rateKeysR4).map((k) => [k, null])) as Rates,
      rateNote: '',
      rateDate: '',
      room: { ...HOME.room },
      antiTipConfirmed: false,
      wallAnchors: '',
      wall: { substrate: 'unknown', plateStackMm: null, edgeDistanceMm: null, baseSound: false },
      density: 670,
      plannedShelfLoadKg: 0,
      boardNote: 'Kronospan SPAANDEX P2 18 мм · декор выбирается отдельно',
      boardConfirmed: false,
      floorSurface: 'unknown',
      materialProfile: 'kronospan-p2-18',
      kitLevel: 'standard',
      plannedDeskLoadKg: 10,
      plannedDrawerLoadKg: 5,
      generatorVersion: generator,
      archetypeId: templateId === 'own' ? null : 'HOME-' + templateId.toUpperCase() + '-A1',
      archetypeVersion: templateId === 'own' ? 'FREE-A1' : 'A1',
      topThickness: 18,
    };
    const R = homeRules(p);
    p.plannedShelfLoadKg = R.shelfLoadKg;
    // r5 (MOD-DEC-574, FINDINGS 1756): 10 kg in a drawer of a new project.
    p.plannedDrawerLoadKg = R.drawerLoadKg;
    // r5 (FINDINGS 965): a new project has the default handle of the wardrobe (480).
    if (R.handles) p.handleId = R.handles.defaultId;
    // r5 (MOD-DEC-574, FINDINGS 1304): the drawers of a new project have the bottom of HDF in a groove, as the wardrobe's.
    if (R.drawerBottomHdf) p.drawerBottom = 'hdf';
    // r5 (MOD-DEC-574, FINDINGS 1750, 1755): and the runner of each drawer by 466, each with its box.
    if (R.drawerRunnerRule) p.drawerRunner = 'level';
    // r5 (MOD-DEC-574, FINDINGS 1307, 1308): the cable outlet of the prototype r1 and a top for a TV of 25 kg.
    if (R.cableOutlet) p.cableOutlet = 'back';
    if (templateId === 'tv') p.plannedDeskLoadKg = R.tvDeskLoadKg;
    const b: Body = {
      id: newId(),
      x: 0,
      y: 0,
      w: d[0],
      h: d[1],
      d: d[2],
      kind: desk ? 'desk' : 'cabinet',
      back: true,
      partitions: [],
      shelves: [],
      doors: [],
      drawers: [],
      cable: templateId === 'tv',
    };
    // r5 (MOD-DEC-575, FINDINGS 1310): a standard item opens on the plinth of the wardrobe with a back of HDF, as the
    // makers build them; the desk keeps its pads under the place for the legs; «Своя конструкция» is the free body (474).
    const standard = R.standardPlinthAndHdf && templateId !== 'own';
    if (standard) {
      b.backMaterial = 'hdf';
      if (!desk) b.base = { kind: 'plinth', heightMm: R.baseChoice!.plinthHeightMm };
    }
    p.bodies = [b];
    const t = p.thickness,
      pad = foot(p, b),
      T = topT(p),
      m = HOME.frontCarcassMargin,
      seam = R.stackSeam;
    if (desk) b.partitions.push({ id: newId(), x: HOME.deskPedestalWidth - t / 2 });
    else
      for (let i = 1; i < d[3]; i++)
        b.partitions.push({ id: newId(), x: t + (i * (b.w - (d[3] + 1) * t)) / d[3] + (i - 1) * t + t / 2 });
    refreshBayIds(p, b);
    const bs = availableBays(p, b),
      shelf = (opening: { lo: string; hi: string }, k: number, fixed: boolean) =>
        b.shelves.push({ id: newId(), lo: opening.lo, hi: opening.hi, y: standard && ['bookcase', 'shoe', 'tv', 'sideboard'].includes(templateId) ? k : HOME.shelfGridBase + k * HOME_SHARED_SHELF.step, fixed }),
      // On a plinth (575) the shelves of the bookcase, the shoe rack, the TV unit and the sideboard divide the height above
      // the bottom into equal spaces, as the steps of the grid do on the pads (496); a removable one then takes its level.
      equal = (n: number) => Array.from({ length: n }, (_, i) => pad + t + ((i + 1) * (b.h - T - pad - t - n * t)) / (n + 1) + i * t);
    // Shelf heights follow the 32 mm system from the floor. The bookcase of r4 is 2000 high (496): its five shelves
    // divide the height into six nearly equal spaces, the middle one fixed; r3 keeps the prototype's grid steps.
    if (templateId === 'bookcase') {
      const steps = standard ? equal(5) : r3 ? [9, 19, 28, 38, 48] : [10, 20, 31, 41, 51];
      for (const k of steps) shelf(bs[0], k, k === steps[2]);
    }
    if (templateId === 'shoe') for (const opening of bs) for (const k of standard ? equal(2) : [6, 12]) shelf(opening, k, true);
    // r5 (MOD-DEC-574, FINDINGS 1309): the shelves behind the doors are removable; the open middle of a TV unit keeps its fixed one.
    if (templateId === 'tv' || templateId === 'sideboard')
      bs.forEach((opening, i) =>
        shelf(opening, standard ? equal(1)[0] : templateId === 'tv' ? 7 : 12, !(R.doorShelvesRemovable && (templateId === 'sideboard' || i === 0 || i === bs.length - 1))),
      );
    if (templateId === 'bedside') shelf(bs[0], 9, true);
    // r5 (FINDINGS 844): a removable shelf stands on its level of System 32 — its support's axis on the grid of the bottom.
    for (const s of b.shelves) s.y = shelfLowerMm(p, hw, b, s);
    if (templateId === 'desk') shelf(bs[0], 16, true);
    if (templateId === 'tv' || templateId === 'sideboard')
      bs.forEach((opening, i) => {
        if (templateId === 'tv' && i !== 0 && i !== bs.length - 1) return;
        b.doors.push({ id: newId(), lo: opening.lo, hi: opening.hi, y: pad + m, h: b.h - T - pad - 2 * m, hinge: i === 0 ? 'left' : 'right' });
      });
    // Fronts rest on the carcass (H-10): from the pad + margin to the top − margin, seams of the rule set between them.
    // r5 (MOD-AI-73, Д): the pedestal of the vanity table — three drawers as the chest's, its mirror over the top.
    if (templateId === 'chest' || templateId === 'vanity') {
      const fh = (b.h - T - pad - 2 * m - 2 * seam) / 3;
      for (let i = 0; i < 3; i++) b.drawers.push({ id: newId(), lo: bs[0].lo, hi: bs[0].hi, y: pad + m + i * (fh + seam), h: fh });
    }
    if (templateId === 'bedside' || templateId === 'desk') {
      const y = b.shelves[0].y + t + m;
      b.drawers.push({ id: newId(), lo: bs[0].lo, hi: bs[0].hi, y, h: b.h - T - m - y });
    }
    if (templateId === 'vanity') b.mirror = { heightMm: R.vanityMirror!.heightMm.default };
    return p;
  }

  /**
   * Changes width, height or depth of one body (bodyId) or of the whole composition (proportionally), mm: axis `w` —
   * width 200–2400, `h` — height 300–2200, `d` — depth 200–650 (a desk: its own limits). Partitions scale with the clear
   * width; front stacks that filled the height are re-spread. r5: drawers keep their heights where a door or free space
   * can take the difference, shelves keep their place in the height of the interior, whole millimetres; a refusal
   * names the limit; returns what moved.
   */
  function resize(p: HomeProject, axis: Axis, value: number, bodyId?: string): string[] {
    const before = clone(p);
    try {
      if (!['w', 'h', 'd'].includes(axis) || !Number.isFinite(value)) throw Error('Некорректный размер.');
      const chosen = bodyId ? p.bodies.filter((b) => b.id === bodyId) : p.bodies,
        oldBounds = bounds(p),
        ratio = value / oldBounds[axis];
      for (const b of chosen) {
        const old = b[axis],
          next = bodyId ? value : Math.round(old * ratio);
        b[axis] = next;
        if (axis === 'w') {
          const s = (next - 2 * p.thickness) / (old - 2 * p.thickness);
          // r5 (MOD-AI-81): the partitions on whole millimetres.
          for (const q of b.partitions) q.x = wholeMm(p, p.thickness + (q.x - p.thickness) * s);
          if (!bodyId) b.x = Math.round(b.x * ratio);
        }
        if (axis === 'h') {
          const m = HOME.frontCarcassMargin,
            oldTop = old - topT(p),
            newTop = next - topT(p),
            r3 = homeRules(p).generator === HOME_R3,
            carried = new Set<Shelf>();
          for (const group of frontStacks(b)) {
            const first = group[0],
              last = group[group.length - 1],
              fullStack = Math.abs(first.y - (foot(p, b) + m)) < 0.1 && Math.abs(last.y + last.h - (oldTop - m)) < 0.1;
            if (fullStack && r3) {
              const low = first.y,
                gaps = 2 * (group.length - 1),
                scale = (newTop - 2 - low - gaps) / (oldTop - 2 - low - gaps);
              group.forEach((f, i) => {
                f.y = low + (f.y - low - 2 * i) * scale + 2 * i;
                f.h *= scale;
              });
            } else if (fullStack) spreadStack(p, b, group, first.y, newTop - m);
            else if (Math.abs(last.y + last.h - (oldTop - m)) < 0.1) {
              // r5 (MOD-AI-38): a drawer under the top keeps its height — the stack goes with the top, and the shelf it
              // stands on (the bedside's, 2 mm under its front) with it; the open niche below takes the difference.
              if (homeRules(p).keepFrontHeights && !(b.doors as Front[]).includes(last)) {
                const delta = newTop - oldTop,
                  base = b.shelves.filter((s) => s.lo === first.lo && s.hi === first.hi && Math.abs(s.y + p.thickness + coverRise(p) - first.y) < 0.5);
                for (const f of group) f.y += delta;
                for (const s of base) (s.y += delta), carried.add(s);
              } else last.h = newTop - m - last.y;
            }
          }
          // r5 (MOD-AI-35): the shelves keep their place in the height of the interior, in whole millimetres; a
          // removable one goes onto its row of holes, a shelf over a drawer follows it (followCovers), the shelf a
          // drawer under the top stands on went with it.
          if (homeRules(p).heightMovesShelves) {
            const low = foot(p, b) + p.thickness,
              scale = (newTop - p.thickness - low) / (oldTop - p.thickness - low);
            for (const s of b.shelves) {
              if (s.coverOf || carried.has(s)) continue;
              s.y = Math.round(low + (s.y - low) * scale);
              if (!s.fixed) s.y = shelfLowerMm(p, hw, b, s);
            }
          }
          if (!bodyId) b.y = Math.round(b.y * ratio);
        }
        followCovers(p, b);
      }
      validate(p, hw);
      return moved(p, before);
    } catch (err) {
      for (const k of Object.keys(p)) delete (p as unknown as Record<string, unknown>)[k];
      Object.assign(p, before);
      throw err;
    }
  }

  /** r5 (MOD-AI-38, 81): a height or a place in whole millimetres; r3 and r4 keep the number as it is. */
  const wholeMm = (p: HomeProject, v: number) => (homeRules(p).keepFrontHeights ? Math.round(v) : v);

  /**
   * What an edit moved (r5, MOD-AI-38): «Ящик 1: 72–272 → 119–319 мм», «Полка 2: 296 → 328 мм» — the fronts and the
   * shelves of every body whose place or height changed, as the panel names them. Nothing for r3 and r4.
   */
  function moved(p: HomeProject, before: HomeProject): string[] {
    if (!homeRules(p).keepFrontHeights) return [];
    const out: string[] = [],
      r = (v: number) => String(Math.round(v * 10) / 10).replace('.', ','),
      span = (f: Front) => `${r(f.y)}–${r(f.y + f.h)}`;
    for (const b of p.bodies) {
      const a = before.bodies.find((x) => x.id === b.id);
      if (!a) continue;
      const tag = p.bodies.length > 1 ? `Корпус ${p.bodies.indexOf(b) + 1}, ` : '';
      for (const [list, was, word] of [
        [b.drawers, a.drawers, 'ящик'],
        [b.doors, a.doors, 'дверца'],
      ] as const)
        list.forEach((f: Front, i: number) => {
          const o = (was as Front[]).find((x) => x.id === f.id);
          if (o && (Math.abs(o.y - f.y) > 0.01 || Math.abs(o.h - f.h) > 0.01)) out.push(`${tag}${word} ${i + 1}: ${span(o)} → ${span(f)} мм`.replace(/^./, (c) => c.toUpperCase()));
        });
      b.shelves.forEach((s, i) => {
        const o = a.shelves.find((x) => x.id === s.id);
        if (o && Math.abs(o.y - s.y) > 0.01) out.push(`${tag}полка ${i + 1}: ${r(o.y)} → ${r(s.y)} мм`.replace(/^./, (c) => c.toUpperCase()));
      });
    }
    return out;
  }

  const body = (p: HomeProject, bodyId: string): Body | undefined => p.bodies.find((b) => b.id === bodyId);
  /** H-15: an unknown body is a message, not a TypeError. */
  const existing = (p: HomeProject, bodyId: string): Body => {
    const b = body(p, bodyId);
    if (!b) throw Error('Корпус не найден.');
    return b;
  };

  function addShelf(p: HomeProject, bodyId: string, lo = 'left', hi = 'right', y?: number): string {
    const b = existing(p, bodyId),
      step = HOME_SHARED_SHELF.step;
    if (!availableBays(p, b).some((q) => q.lo === lo && q.hi === hi)) throw Error('Выберите свободную нишу с реальными опорами.');
    const q: Shelf = { id: newId(), lo, hi, y: y ?? foot(p, b) + step * Math.round((b.h / 2 - foot(p, b)) / step), fixed: false },
      lim = b.partitions.some((x) => x.from !== undefined) ? nicheLimits(p, b, { lo, hi }) : null;
    // r5 (MOD-AI-75): a niche over or under a shelf a partition stands on — the middle of its largest free space.
    if (y === undefined && lim && (lim.lower || lim.upper)) {
      const t = p.thickness,
        niche = b.shelves.filter((s) => s.lo === lo && s.hi === hi && s !== lim.upper).sort((a, c) => a.y - c.y),
        edges = [lim.shelfLow, ...niche.flatMap((s) => [s.y, s.y + t]), lim.shelfHigh];
      let best = { from: 0, size: -1 };
      for (let i = 0; i < edges.length; i += 2) if (edges[i + 1]! - edges[i]! > best.size) best = { from: edges[i]!, size: edges[i + 1]! - edges[i]! };
      q.y = Math.round(best.from + (best.size - t) / 2);
    }
    // r5 (FINDINGS 1311): the middle of the body taken by a shelf of the niche — the middle of its largest free space.
    else if (y === undefined && homeRules(p).newShelfInFreeSpace) {
      const t = p.thickness,
        niche = b.shelves.filter((s) => s.lo === lo && s.hi === hi).sort((a, c) => a.y - c.y);
      if (niche.some((s) => s.y < q.y + t && q.y < s.y + t)) {
        const edges = [foot(p, b) + t, ...niche.flatMap((s) => [s.y, s.y + t]), b.h - topT(p)];
        let best = { from: 0, size: -1 };
        for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] - edges[i] > best.size) best = { from: edges[i], size: edges[i + 1] - edges[i] };
        q.y = Math.round(best.from + (best.size - t) / 2);
      }
    }
    b.shelves.push(q);
    // r5: the default height on the grid of System 32 (FINDINGS 844); an entered one is moved by the graph.
    if (y === undefined) q.y = shelfLowerMm(p, hw, b, q);
    return q.id;
  }

  /**
   * Adds a door to the niche lo/hi of a body: y — the lower edge of the front above the floor, h — its height, mm;
   * hinge — the side of its hinges. r5 (MOD-AI-71): without y and h the door takes the largest free part of the niche
   * (over the drawers and the shelf over them, say); with y only — from y to the top of its free part; with h only — the
   * bottom of the largest free part that fits it. r3 and r4: over the whole height of the niche.
   */
  function addDoor(p: HomeProject, bodyId: string, lo = 'left', hi = 'right', y?: number, h?: number, hinge: Door['hinge'] = 'left'): string {
    const m = HOME.frontCarcassMargin,
      b = existing(p, bodyId),
      place = homeRules(p).frontsInFreeSpace ? doorPlace(p, b, { lo, hi }, y, h) : null,
      f: Door = { id: newId(), lo, hi, y: place?.y ?? y ?? foot(p, b) + m, h: place?.h ?? h ?? b.h - topT(p) - foot(p, b) - 2 * m, hinge };
    b.doors.push(f);
    return f.id;
  }

  /**
   * Adds a drawer to the niche lo/hi of a body: y — the lower edge of its front above the floor, h — its height, mm.
   * r5 (MOD-AI-34): without y the drawer goes to the bottom of the lowest free part of the niche, 180 mm high, or over
   * the whole free part when less than 160 mm would stay above it; a drawer with open space above gets a fixed shelf
   * whose top is 2 mm above its front, and a drawer put right over a drawer with such a shelf takes the shelf
   * (MOD-DEC-744). r3 and r4: at the bottom of the niche, whatever stands there.
   */
  function addDrawer(p: HomeProject, bodyId: string, lo = 'left', hi = 'right', y?: number, h?: number): string {
    const b = existing(p, bodyId),
      R = homeRules(p),
      place = R.frontsInFreeSpace ? drawerPlace(p, b, { lo, hi }, y, h) : null,
      f: Drawer = { id: newId(), lo, hi, y: place?.y ?? y ?? foot(p, b) + HOME.frontCarcassMargin, h: place?.h ?? h ?? HOME.drawerDefaultHeight };
    b.drawers.push(f);
    // r4 refuses a box whose dowels meet (MOD-DEC-343), and the box of the default height is one of them: a new drawer
    // is raised by a step until they part (MOD-DEC-578, R1-010); in r5 not above its free part. A drawer that does not
    // fit its niche stays as it is — validate() gives the reason. r3 keeps the height of the prototype: there the clash is
    // a warning.
    if (h === undefined && !place?.fills && R.drillingClashRefused)
      for (let k = 0; k < HOME.drawerDefaultRaises && boxClash(p, b, f) && (!place || f.y + f.h + HOME.drawerDefaultHeightStep <= place.to + 0.1); k++)
        f.h += HOME.drawerDefaultHeightStep;
    closeDrawer(p, b, f);
    return f.id;
  }

  /** The free parts of a niche for a new front (r5), the shelves over drawers left out: a new drawer over one takes its shelf. */
  function roomOf(p: HomeProject, b: Body, niche: { lo: string; hi: string }, kind: FrontKind): RoomPart[] {
    if (!availableBays(p, b).some((q) => q.lo === niche.lo && q.hi === niche.hi)) throw Error('Выберите нишу корпуса между боковинами и перегородками.');
    return frontRoom(p, b, niche, kind, kind === 'drawer' ? coverShelfIds(b) : new Set());
  }

  /** Whole millimetres inside a free part (MOD-AI-38): the lower edge up, the upper one down. */
  const inside = (q: RoomPart) => ({ from: Math.ceil(q.from - 0.01), to: Math.floor(q.to + 0.01) });

  /** Where a new drawer of r5 stands: y and h, whether it fills its free part, and the top of that part. */
  function drawerPlace(p: HomeProject, b: Body, niche: { lo: string; hi: string }, y?: number, h?: number): { y: number; h: number; fills: boolean; to: number } | null {
    if (y !== undefined && h !== undefined) return null;
    const parts = roomOf(p, b, niche, 'drawer').map(inside),
      def = HOME.drawerDefaultHeight,
      sized = (q: { from: number; to: number }, from: number) => {
        const fills = h === undefined && q.to - from - def < HOME.frontMinHeight;
        return { y: from, h: h ?? (fills ? q.to - from : def), fills, to: q.to };
      };
    if (y !== undefined) {
      const q = parts.find((x) => y >= x.from - 0.1 && y < x.to);
      return q ? sized(q, y) : null;
    }
    const q = parts.find((x) => x.to - x.from >= (h ?? HOME.frontMinHeight) - 0.1);
    if (!q) throw Error(`В нише нет места для ящика${h === undefined ? '' : ` высотой ${h} мм`}. ` + roomText(frontRoom(p, b, niche, 'drawer'), 'drawer', b, niche));
    return sized(q, q.from);
  }

  /** Where a new door of r5 stands: the largest free part of the niche (the upper one of two equal), or the part of y. */
  function doorPlace(p: HomeProject, b: Body, niche: { lo: string; hi: string }, y?: number, h?: number): { y: number; h: number } | null {
    if (y !== undefined && h !== undefined) return null;
    const parts = roomOf(p, b, niche, 'door').map(inside);
    if (y !== undefined) {
      const q = parts.find((x) => y >= x.from - 0.1 && y < x.to);
      return q ? { y, h: q.to - y } : null;
    }
    const q = parts.filter((x) => x.to - x.from >= (h ?? HOME.frontMinHeight) - 0.1).sort((a, c) => c.to - c.from - (a.to - a.from) || c.from - a.from)[0];
    if (!q) throw Error(`В нише нет места для дверцы${h === undefined ? '' : ` высотой ${h} мм`}. ` + roomText(frontRoom(p, b, niche, 'door'), 'door', b, niche));
    return { y: q.from, h: h ?? q.to - q.from };
  }

  /**
   * The shelf over a new drawer (r5, MOD-DEC-744): a drawer with open space above it gets a fixed shelf whose top is the
   * rise above its front, or takes the shelf of the drawer right under it; a drawer closed from above by the top, a
   * shelf or a drawer needs none — and the shelf of the drawer under it, now inside the stack, is taken away (Д).
   */
  function closeDrawer(p: HomeProject, b: Body, f: Drawer): void {
    const rise = homeRules(p).drawerCoverRise;
    if (rise === null) return;
    const under = drawerUnder(p, b, f),
      prev = under ? coverShelfOf(b, under.id) : undefined,
      y = f.y + f.h + rise - p.thickness;
    if (drawerClosedAbove(p, b, f, prev)) {
      if (prev) b.shelves = b.shelves.filter((s) => s !== prev);
      return;
    }
    if (prev) Object.assign(prev, { coverOf: f.id, y });
    else b.shelves.push({ id: newId(), lo: f.lo, hi: f.hi, y, fixed: true, coverOf: f.id });
  }

  /**
   * Moves or resizes a door or a drawer of a body (MOD-AI-71): y — the lower edge of its front above the floor, h — its
   * height, mm; what is not given stays. The shelf over a drawer follows it (MOD-DEC-744). The project is checked by
   * transact() as every edit: a front that leaves its niche or meets another is refused with the free parts of the niche.
   */
  function moveFront(p: HomeProject, bodyId: string, frontId: string, y?: number, h?: number): void {
    const b = existing(p, bodyId),
      f = allFronts(b).find((x) => x.id === frontId);
    if (!f) throw Error('Элемент не найден.');
    if ((y !== undefined && !Number.isFinite(y)) || (h !== undefined && !Number.isFinite(h))) throw Error('Некорректная высота фасада.');
    if (y !== undefined) f.y = y;
    if (h !== undefined) f.h = h;
    followCovers(p, b);
  }

  /**
   * «Ящики равной высоты» (r5, MOD-AI-34): `count` drawers of equal heights in the niche lo/hi from `from` (the lower
   * edge of the lowest front above the floor) to `to` (the upper edge of the highest), with the seam of the rule set
   * between them; the drawers of the niche and the shelves over them are replaced. Without from and to — the lowest
   * free part of the niche the drawers fit. Whole millimetres: the millimetres left go to the lower drawers, one each.
   * The highest drawer gets the shelf over it when there is open space above (MOD-DEC-744). Returns the ids, bottom to top.
   */
  function equalDrawers(p: HomeProject, bodyId: string, lo: string, hi: string, count: number, from?: number, to?: number): string[] {
    const b = existing(p, bodyId),
      R = homeRules(p),
      seam = R.stackSeam,
      min = HOME.frontMinHeight;
    if (!R.frontsInFreeSpace) throw Error('Ящики равной высоты доступны только в конструкции r5.');
    if (!Number.isInteger(count) || count < 1 || count > EQUAL_DRAWERS_MAX) throw Error(`Выберите от 1 до ${EQUAL_DRAWERS_MAX} ящиков.`);
    if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to))) throw Error('Некорректная высота ящиков.');
    const old = new Set(b.drawers.filter((d) => d.lo === lo && d.hi === hi).map((d) => d.id));
    b.shelves = b.shelves.filter((s) => !(s.coverOf && old.has(s.coverOf)));
    b.drawers = b.drawers.filter((d) => !old.has(d.id));
    const parts = roomOf(p, b, { lo, hi }, 'drawer').map(inside),
      need = count * min + (count - 1) * seam,
      at = (v: number) => parts.find((q) => v >= q.from - 0.1 && v <= q.to + 0.1),
      part = from !== undefined ? at(from) : to !== undefined ? at(to) : parts.find((q) => q.to - q.from >= need - 0.1);
    if (!part) {
      const big = parts.slice().sort((a, c) => c.to - c.from - (a.to - a.from))[0],
        most = big ? Math.floor((big.to - big.from + seam) / (min + seam)) : 0;
      throw Error(
        `В нише нет места для ${count} ${count === 1 ? 'ящика' : 'ящиков'} с фасадом от ${min} мм` +
          (most > 0 ? `: в свободной части ${big!.from}–${big!.to} мм помещается не больше ${most}. ` : '. ') +
          roomText(frontRoom(p, b, { lo, hi }, 'drawer'), 'drawer', b, { lo, hi }),
      );
    }
    const low = Math.round(from ?? part.from),
      high = Math.round(to ?? part.to);
    if (low < part.from - 0.1 || high > part.to + 0.1 || high - low < need - 0.1) {
      const most = Math.floor((high - low + seam) / (min + seam));
      throw Error(
        (high - low < need - 0.1 && low >= part.from - 0.1 && high <= part.to + 0.1
          ? `От ${low} до ${high} мм помещается ${most > 0 ? `не больше ${most}` : 'ни одного'} ${most === 1 ? 'ящика' : 'ящиков'} с фасадом от ${min} мм. `
          : `Ящики выходят за свободную часть ниши ${part.from}–${part.to} мм. `) + roomText(frontRoom(p, b, { lo, hi }, 'drawer'), 'drawer'),
      );
    }
    const total = high - low - (count - 1) * seam,
      each = Math.floor(total / count),
      extra = total - each * count,
      ids: string[] = [];
    // Drawers whose dowels meet are refused (MOD-DEC-343): the counts that fit the same part are named (Д).
    const heights = (n: number) => {
        const sum = high - low - (n - 1) * seam,
          e = Math.floor(sum / n);
        return [e, e + (sum - e * n > 0 ? 1 : 0)];
      },
      clashes = (n: number) => R.drillingClashRefused && heights(n).some((v) => boxClash(p, b, { id: '', lo, hi, y: low, h: v }));
    if (clashes(count)) {
      const most = Math.floor((high - low + seam) / (min + seam)),
        fit = Array.from({ length: Math.min(most, EQUAL_DRAWERS_MAX) }, (_, i) => i + 1).filter((n) => !clashes(n));
      throw Error(
        `Ящики по ${each} мм слишком низкие для шкантов передней стенки короба. ` +
          (fit.length ? `От ${low} до ${high} мм встают ящики равной высоты в количестве: ${fit.join(', ')}.` : `От ${low} до ${high} мм ящики равной высоты не встают.`),
      );
    }
    let y = low;
    for (let i = 0; i < count; i++) {
      const f: Drawer = { id: newId(), lo, hi, y, h: each + (i < extra ? 1 : 0) };
      b.drawers.push(f);
      ids.push(f.id);
      y += f.h + seam;
    }
    closeDrawer(p, b, b.drawers[b.drawers.length - 1]!);
    return ids;
  }

  /**
   * The free parts of the niche lo/hi of a body, mm from the floor (MOD-AI-34, 71): where a drawer and where a door may
   * stand — from the lower edge of the front to the upper one. A drawer stays between the shelves, a door covers them.
   */
  function freeRoom(p: HomeProject, bodyId: string, lo = 'left', hi = 'right'): { drawer: { from: number; to: number }[]; door: { from: number; to: number }[] } {
    const b = existing(p, bodyId),
      parts = (kind: FrontKind) => frontRoom(p, b, { lo, hi }, kind).filter((q) => q.to - q.from >= HOME.frontMinHeight - 0.1).map((q) => ({ from: q.from, to: q.to }));
    if (!availableBays(p, b).some((q) => q.lo === lo && q.hi === hi)) throw Error('Выберите нишу корпуса между боковинами и перегородками.');
    return { drawer: parts('drawer'), door: parts('door') };
  }

  /** Whether the box of a drawer is too low for its dowels; a runner that does not fit is validate()'s to report. */
  function boxClash(p: HomeProject, b: Body, f: Drawer): boolean {
    try {
      return smallDrawerPattern(runnerInfo(p, hw, b, f).boxH);
    } catch {
      return false;
    }
  }

  /**
   * Adds a partition; shelves crossing it are split into two fixed shelves. r5 (MOD-AI-75): with `fromShelfId` the
   * partition stands on that shelf, made fixed, up to the top — x by default the middle of the shelf; only the shelves
   * and fronts over it are split or refused, the niche under the shelf stays whole.
   */
  function addPartition(p: HomeProject, bodyId: string, x?: number, fromShelfId?: string): string {
    const b = body(p, bodyId);
    if (b?.kind === 'desk') throw Error('Дополнительной вертикали стола требуется явная новая карта тумбы и зоны ног.');
    const previous = b ? availableBays(p, b) : [];
    let floor: Shelf | undefined;
    if (fromShelfId !== undefined) {
      if (!homeRules(p).partialPartitions) throw Error('Перегородка от полки доступна только в конструкции r5.');
      floor = b?.shelves.find((s) => s.id === fromShelfId);
      if (!floor) throw Error('Полка не найдена.');
    }
    const span = floor && bay(p, b!, floor),
      value = Math.round(x ?? (span ? (span.left + span.right) / 2 : (b as Body).w / 2)),
      // Over the shelf a partition stands on: what reaches above its middle.
      above = (y: number) => !floor || y > floor.y + p.thickness / 2;
    if (
      allFronts(b as Body).some((f) => {
        const a = bay(p, b as Body, f);
        return value > a.left && value < a.right && above(f.y + f.h);
      })
    )
      throw Error('Перегородка пересекает дверцу или ящик. Сначала измените их нишу или выберите свободное место.');
    if (!b || b.kind !== 'cabinet') throw Error('Выберите обычный корпус.');
    const q: Partition = { id: newId(), x: Math.round(value), ...(floor ? { from: floor.id } : {}) };
    if (floor) floor.fixed = true;
    for (const s of b.shelves.slice()) {
      const r = bay(p, b, s);
      if (q.x > r.left && q.x < r.right && s !== floor && above(s.y)) {
        const hi = s.hi;
        s.hi = q.id;
        s.fixed = true;
        b.shelves.push({ ...s, id: newId(), lo: q.id, hi });
      }
    }
    b.partitions.push(q);
    refreshBayIds(p, b, previous);
    return q.id;
  }

  /**
   * «Равные ниши» (r5, MOD-AI-81): the partitions of a body moved so that its niches have equal clear widths, in whole
   * millimetres — the millimetres left go to the left niches, one each. The shelves and the fronts follow their niches.
   * Returns the clear widths, left to right.
   */
  function equalBays(p: HomeProject, bodyId: string): number[] {
    const b = existing(p, bodyId),
      t = p.thickness;
    if (!homeRules(p).keepFrontHeights) throw Error('Равные ниши доступны только в конструкции r5.');
    if (b.kind === 'desk') throw Error('Ширину тумбы стола задаёт карта тумбы и зоны ног.');
    if (!b.partitions.length) throw Error('В корпусе одна ниша: добавьте перегородку.');
    const n = b.partitions.length + 1,
      clear = b.w - 2 * t - b.partitions.length * t,
      each = Math.floor(clear / n),
      widths = Array.from({ length: n }, (_, i) => each + (i < clear - each * n ? 1 : 0));
    let left = t;
    b.partitions
      .slice()
      .sort((a, c) => a.x - c.x)
      .forEach((q, i) => {
        left += widths[i]!;
        q.x = left + t / 2;
        left += t;
      });
    return widths;
  }

  /**
   * Sets the clear width of the niche lo/hi of a body (r5, MOD-AI-81), mm: the partition on its right moves, or, for
   * the rightmost niche, the one on its left; the neighbouring niche takes the difference. The shelves and the fronts
   * follow their niches; a niche narrower than 80 mm or a front that no longer fits is refused by validate().
   */
  function setBayWidth(p: HomeProject, bodyId: string, lo: string, hi: string, widthMm: number): void {
    const b = existing(p, bodyId),
      t = p.thickness;
    if (!homeRules(p).keepFrontHeights) throw Error('Ширина ниши задаётся только в конструкции r5.');
    if (b.kind === 'desk') throw Error('Ширину тумбы стола задаёт карта тумбы и зоны ног.');
    if (!Number.isFinite(widthMm)) throw Error('Некорректная ширина ниши.');
    if (!availableBays(p, b).some((q) => q.lo === lo && q.hi === hi)) throw Error('Выберите нишу корпуса между боковинами и перегородками.');
    if (lo === 'left' && hi === 'right') throw Error('В корпусе одна ниша: её ширина — ширина корпуса без боковин. Измените ширину корпуса.');
    const r = bay(p, b, { lo, hi }),
      w = Math.round(widthMm);
    if (hi !== 'right') b.partitions.find((x) => x.id === hi)!.x = r.left + w + t / 2;
    else b.partitions.find((x) => x.id === lo)!.x = r.right - w - t / 2;
  }

  /** Removes an element (shelf, partition, front) or, without elementId, the whole body. */
  function remove(p: HomeProject, bodyId: string, elementId?: string): void {
    const b = body(p, bodyId);
    if (b?.kind === 'desk' && b.partitions.some((q) => q.id === elementId))
      throw Error('Общую боковину тумбы нельзя удалить без изменения конструкции стола.');
    const previous = b ? availableBays(p, b) : [];
    if (!b) throw Error('Корпус не найден.');
    if (elementId && allFronts(b).some((f) => f.lo === elementId || f.hi === elementId))
      throw Error('Перегородка поддерживает фасад или ящик. Сначала переместите или удалите связанный элемент.');
    // r5 (MOD-AI-75): the shelf a partition stands on goes with it only.
    const standing = elementId === undefined ? -1 : b.partitions.slice().sort((x, y) => x.x - y.x).findIndex((q) => q.from === elementId);
    if (standing >= 0) throw Error(`На полке стоит перегородка ${standing + 1}. Сначала удалите перегородку.`);
    if (elementId && allFronts(b).some((f) => f.id === elementId)) {
      b.doors = b.doors.filter((f) => f.id !== elementId);
      b.drawers = b.drawers.filter((f) => f.id !== elementId);
      // The shelf over a removed drawer stays, a shelf of its own: it is taken away only by hand (MOD-DEC-744).
      followCovers(p, b);
    } else if (!elementId) {
      if (p.bodies.length === 1) throw Error('Последний корпус удалить нельзя.');
      p.bodies = p.bodies.filter((x) => x !== b);
    } else {
      b.shelves = b.shelves.filter((s) => s.id !== elementId && s.lo !== elementId && s.hi !== elementId);
      b.partitions = b.partitions.filter((q) => q.id !== elementId);
    }
    if (p.bodies.includes(b)) refreshBayIds(p, b, previous);
  }

  /** Switches the board decor; thickness, density and connector follow the board profile. Board-dependent rates reset. */
  function applyMaterial(p: HomeProject, materialId: string): void {
    const m = materials.find((x) => x.id === materialId);
    if (!m) throw Error('Материал не найден.');
    const profile = materialProfiles.find((x) => x.id === m.materialProfile)!,
      // r4 and r5 (R5-006, FINDINGS 1970): the rates entered for the decor left are kept by it, and the decor chosen
      // again gets its own back; r3 resets them, as the prototype.
      kept = priceByPlan(p) ? keepDecorRates(p, m.id) : {};
    // r5 (MOD-AI-39): a material of the palette in place of a decor of the catalogue.
    delete p.decorId;
    Object.assign(p, {
      material: m.id,
      thickness: m.thickness,
      materialProfile: m.materialProfile,
      density: profile.density,
      boardNote: profile.name + ' · декор выбирается отдельно',
      boardConfirmed: false,
    });
    // The price of a sheet is the price of its decor (MOD-DEC-510): the sheets of r4 reset as the board of r3.
    for (const k of priceByPlan(p) ? (['sheet16', 'sheet18'] as const) : (['board'] as const)) p.rates[k] = kept[k as keyof DecorRates] ?? null;
    p.rates.join = kept.join ?? null;
    p.rates.hinge = kept.hinge ?? null;
    p.topThickness = p.thickness;
    p.hardwareVariant = 'hettich-rastex15-' + p.thickness + '-du325';
  }

  /**
   * r5 (MOD-AI-39): the carcass in a decor of the shared catalogue of the release (an id of `homeDecorChoices`), as the
   * wardrobe's; null — back to the material of the palette. The board keeps its thickness when the decor is sold in
   * it, else takes the thickest the decor is sold in; `thicknessMm` (16 or 18) chooses it. The price of a sheet is the
   * catalogue's: the rates of the sheets entered reset, those of the joints and hinges too when the thickness changes.
   * Returns the thickness of the board, mm.
   */
  function setDecor(p: HomeProject, decorId: string | null, thicknessMm?: number): number {
    if (!homeRules(p).catalogDecors) throw Error('Декор каталога для корпуса доступен только в конструкции r5.');
    if (decorId === null) {
      applyMaterial(p, p.material);
      return p.thickness;
    }
    if (!mfDecor(decorId, hw.materials)) throw Error('Декор корпуса не найден в каталоге материалов.');
    if (thicknessMm !== undefined && thicknessMm !== 16 && thicknessMm !== 18) throw Error('Толщина плиты корпуса — 16 или 18 мм.');
    const ts = decorThicknesses(hw.materials, decorId),
      name = carcassDecorName(decorId, hw.materials);
    if (thicknessMm !== undefined && ts.length && !ts.includes(thicknessMm)) throw Error(`Декор ${name} в каталоге есть толщиной ${ts.join(' или ')} мм.`);
    const t = (thicknessMm ?? (!ts.length || ts.includes(p.thickness) ? p.thickness : Math.max(...ts))) as 16 | 18,
      profile = materialProfiles.find((x) => x.thickness === t)!,
      thicker = t !== p.thickness;
    Object.assign(p, {
      decorId,
      thickness: t,
      materialProfile: profile.id,
      density: profile.density,
      boardNote: `${profile.name} · декор ${name}`,
      boardConfirmed: false,
    });
    p.rates.sheet16 = null;
    p.rates.sheet18 = null;
    if (thicker) p.rates.join = p.rates.hinge = null;
    p.topThickness = p.thickness;
    p.hardwareVariant = 'hettich-rastex15-' + p.thickness + '-du325';
    return t;
  }

  /** Keeps the rates of the decor of the project by it and gives the rates kept by the decor chosen, taking them out. */
  function keepDecorRates(p: HomeProject, next: MaterialId): DecorRates {
    const now: DecorRates = {};
    for (const k of DECOR_RATE_KEYS) if (typeof p.rates[k] === 'number') now[k] = p.rates[k] as number;
    const all = { ...p.materialRates, [p.material]: now },
      back = all[next] ?? {};
    delete all[next];
    for (const id of Object.keys(all) as MaterialId[]) if (!Object.keys(all[id]!).length) delete all[id];
    if (Object.keys(all).length) p.materialRates = all;
    else delete p.materialRates;
    return back;
  }

  function setKitLevel(p: HomeProject, level: string): void {
    if (!['economy', 'standard', 'premium'].includes(level)) throw Error('Уровень комплектации не найден.');
    // r5: the level changes the support of a removable shelf (FINDINGS 845); the shelf keeps the level of its holes on
    // the grid and stands on the new support there.
    const axes = homeRules(p).shelfSupportRule === 'WARDROBE' ? p.bodies.flatMap((b) => b.shelves.filter((s) => !s.fixed).map((s) => [b, s, homeShelfSupport(p, hw, b, s).axisMm] as const)) : [];
    p.kitLevel = level as HomeProject['kitLevel'];
    for (const [b, s, axis] of axes) {
      const n = homeShelfSupport(p, hw, b, s);
      if (axis === null || n.axisMm === null) continue;
      s.y = axis + (n.lowerMm - n.axisMm);
      s.y = shelfLowerMm(p, hw, b, s);
    }
    // r5 (MOD-AI-73): a body on casters takes the casters of the new level and their height; what rests on the bottom follows.
    for (const b of p.bodies)
      if (b.base?.kind === 'casters') {
        const old = foot(p, b);
        b.base = { kind: 'casters', heightMm: homeCasters(p, hw, b)?.heightMm ?? 0 };
        fitInterior(p, b, old);
      }
  }

  /**
   * Changes the floor. r3 changes only the field (the prototype; H-10: the fronts stay on y = 5 and a carpet is refused).
   * r4: the pad height changes and the carcass interior with it — everything resting on the bottom moves by the
   * difference; a stack of fronts hanging from the top keeps its top and re-spreads from its moved bottom.
   */
  function setFloor(p: HomeProject, floor: HomeProject['floor']): string[] {
    if (floor !== 'hard' && floor !== 'carpet') throw Error('Вид пола не найден.');
    if (homeRules(p).generator === HOME_R3) {
      p.floor = floor;
      return [];
    }
    const before = clone(p),
      // r5: a body on a plinth or legs does not stand on the pads, so the floor does not move it (516).
      old = p.bodies.map((b) => foot(p, b));
    p.floor = floor;
    try {
      p.bodies.forEach((b, i) => raiseInterior(p, b, foot(p, b) - old[i]));
      validate(p, hw);
      return moved(p, before);
    } catch (err) {
      for (const k of Object.keys(p)) delete (p as unknown as Record<string, unknown>)[k];
      Object.assign(p, before);
      throw err;
    }
  }

  /**
   * Moves everything resting on the bottom of a body with it by `delta` (H-10): the shelves and the fronts; a stack of
   * fronts hanging from the top keeps its top and re-spreads from its moved bottom.
   */
  function raiseInterior(p: HomeProject, b: Body, delta: number): void {
    if (!delta) return;
    const top = b.h - topT(p) - HOME.frontCarcassMargin;
    for (const s of b.shelves) s.y += delta;
    for (const group of frontStacks(b)) {
      const last = group[group.length - 1];
      if (Math.abs(last.y + last.h - top) < 0.1) spreadStack(p, b, group, group[0].y + delta, top);
      else for (const f of group) f.y += delta;
    }
    followCovers(p, b);
  }

  /**
   * Fits the interior of a body to its new bottom (r5, MOD-DEC-516; FINDINGS 946): the base takes its height from the
   * lowest niche. What rests on the bottom moves with it — a stack of fronts hanging from the top re-spreads, keeping its
   * seams, another stack moves; the shelves and the fronts above them keep their heights; a removable shelf goes to its
   * level of System 32, whose grid starts at the bottom (193).
   */
  function fitInterior(p: HomeProject, b: Body, oldFoot: number): void {
    const m = HOME.frontCarcassMargin,
      top = b.h - topT(p) - m,
      low = foot(p, b) + m,
      delta = foot(p, b) - oldFoot;
    if (!delta) return;
    for (const group of frontStacks(b)) {
      const first = group[0],
        last = group[group.length - 1];
      if (Math.abs(first.y - (oldFoot + m)) >= 0.1) continue;
      if (Math.abs(last.y + last.h - top) < 0.1) spreadStack(p, b, group, low, top);
      else for (const f of group) f.y += delta;
    }
    for (const s of b.shelves) if (!s.fixed) s.y = shelfLowerMm(p, hw, b, s);
    followCovers(p, b);
  }

  /**
   * Sets the base of a body (r5, MOD-DEC-516): the floor pads (the default), a plinth of the wardrobe or legs of the
   * catalogue. The overall height stays; the interior is fitted to the new bottom (fitInterior). A new
   * plinth is 70 mm high (291); new legs take the height a leg of the catalogue gives nearest to the base the body had
   * (481); a height given is kept. r5 (MOD-AI-33): 'wall' hangs the body on the wall; `heightMm` is then the height of
   * its bottom edge above the floor — a new one at the bottom of the kitchen's wall cabinets (565 п. 12), lower when
   * the top would be over the height of a body; back on the floor the body stands at 0. A project the rule set refuses
   * stays as it was.
   */
  function setBase(p: HomeProject, bodyId: string, kind: 'pads' | 'plinth' | 'legs' | 'casters' | 'wall', heightMm?: number): string[] {
    const b = existing(p, bodyId),
      C = homeRules(p).baseChoice,
      W = homeRules(p).wallHanging;
    if (!['pads', 'plinth', 'legs', 'casters', 'wall'].includes(kind)) throw Error('Вид основания не найден.');
    if (!C) throw Error('Цоколь и ножки доступны только в конструкции r5.');
    if (kind === 'wall' && !W) throw Error('Подвесной корпус доступен только в конструкции r5.');
    if (kind === 'casters' && !homeRules(p).casters) throw Error('Колёса доступны только в конструкции r5.');
    if (heightMm !== undefined && !Number.isFinite(heightMm)) throw Error('Некорректная высота основания.');
    const before = clone(b),
      was = clone(p),
      old = foot(p, b);
    if (kind === 'wall') {
      b.y = heightMm ?? (b.base?.kind === 'wall' ? b.y : Math.max(0, Math.min(W!.defaultElevationMm, HOME.bodyHeight[1] - b.h)));
      b.base = { kind };
    } else {
      if (b.base?.kind === 'wall') b.y = 0;
      if (kind === 'pads') delete b.base;
      // r5 (MOD-AI-73): the base on casters is of the height of their caster; a height given is not taken.
      else if (kind === 'casters') {
        if (heightMm !== undefined) throw Error('Высота колёс — высота колеса каталога, её не задают.');
        b.base = { kind, heightMm: homeCasters(p, hw, b)?.heightMm ?? 0 };
      } else
        b.base = {
          kind,
          heightMm:
            heightMm ?? (b.base?.kind === kind ? b.base.heightMm : kind === 'plinth' ? C.plinthHeightMm : legsBaseHeight(hw.fittings, old, C.heightMm)),
        };
    }
    try {
      fitInterior(p, b, old);
      validate(p, hw);
      return moved(p, was);
    } catch (err) {
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, before);
      throw err;
    }
  }

  /**
   * r5 (MOD-AI-32, MOD-DEC-168): the body stands in a niche without its bottom or its top (`omitted`), or gets the panel
   * back. The other parts stay where they are; the project the rule set refuses stays as it was.
   */
  function setNichePanel(p: HomeProject, bodyId: string, panel: NichePanel, omitted: boolean): void {
    const b = existing(p, bodyId);
    if (panel !== 'top' && panel !== 'bottom') throw Error('Панель корпуса не найдена.');
    if (!homeRules(p).nichePanels) throw Error('Корпус без дна или крышки доступен только в конструкции r5.');
    const before = clone(b),
      next = (['bottom', 'top'] as const).filter((k) => (k === panel ? omitted : b.omit?.includes(k)));
    if (next.length) b.omit = next;
    else delete b.omit;
    try {
      validate(p, hw);
    } catch (err) {
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, before);
      throw err;
    }
  }

  /**
   * r5 (MOD-AI-40, FINDINGS 3313): the rim on the top of a body — at these edges (a new one: left, back and right), of
   * this height (a new one: 100 mm); null or no edge — none. The project the rule set refuses stays as it was.
   */
  function setRim(p: HomeProject, bodyId: string, heightMm: number | null, sides?: RimSide[]): void {
    const b = existing(p, bodyId),
      R = homeRules(p).topRim;
    if (!R) throw Error('Бортик на крышке доступен только в конструкции r5.');
    const before = clone(b);
    const chosen = sides ?? b.rim?.sides ?? [...R.sides];
    if (chosen.some((k) => !R.sides.includes(k))) throw Error('Бортик ставится слева, сзади или справа на крышке.');
    if (heightMm === null || !chosen.length) delete b.rim;
    else b.rim = { heightMm, sides: R.sides.filter((k) => chosen.includes(k)) };
    try {
      validate(p, hw);
    } catch (err) {
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, before);
      throw err;
    }
  }

  /**
   * r5 (MOD-AI-73, FINDINGS 3322): the mirror over the top of a body — a board on the rear edge of the top of this height
   * with the mirror of the catalogue on its face (a new one: 600 mm); null — none. The project the rule set refuses stays
   * as it was.
   */
  function setMirror(p: HomeProject, bodyId: string, heightMm: number | null): void {
    const b = existing(p, bodyId);
    if (!homeRules(p).vanityMirror) throw Error('Зеркало над крышкой доступно только в конструкции r5.');
    const before = clone(b);
    if (heightMm === null) delete b.mirror;
    else b.mirror = { heightMm };
    try {
      validate(p, hw);
    } catch (err) {
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, before);
      throw err;
    }
  }

  /** r5 (MOD-AI-73, FINDINGS 3317): the front corners of the top rounded by a radius, mm; null — square again. */
  function setTopCorners(p: HomeProject, bodyId: string, radiusMm: number | null): void {
    const b = existing(p, bodyId);
    if (!homeRules(p).topCorners) throw Error('Скруглённые углы крышки доступны только в конструкции r5.');
    const before = clone(b);
    if (radiusMm === null) delete b.topRadiusMm;
    else b.topRadiusMm = radiusMm;
    try {
      validate(p, hw);
    } catch (err) {
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, before);
      throw err;
    }
  }

  /** r5 (MOD-AI-37, FINDINGS 3315): a light under the top of each niche of the body, or none. */
  function setLight(p: HomeProject, bodyId: string, on: boolean): void {
    const b = existing(p, bodyId);
    if (!homeRules(p).lighting) throw Error('Подсветка корпуса доступна только в конструкции r5.');
    const before = clone(b);
    if (on) b.light = true;
    else delete b.light;
    try {
      validate(p, hw);
    } catch (err) {
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, before);
      throw err;
    }
  }

  /**
   * r5 (MOD-AI-40, FINDINGS 3314): a door becomes a flap front opening upward on a lift of the catalogue, without
   * hinges, or a door on its hinges again. The project the rule set refuses stays as it was.
   */
  function setDoorLift(p: HomeProject, bodyId: string, doorId: string, on: boolean): void {
    const b = existing(p, bodyId),
      f = b.doors.find((x) => x.id === doorId);
    if (!f) throw Error('Дверца не найдена.');
    if (!homeRules(p).flapFronts) throw Error('Откидной фасад на подъёмнике доступен только в конструкции r5.');
    const before = clone(b);
    if (on) f.lift = 'FLAP';
    else delete f.lift;
    try {
      validate(p, hw);
    } catch (err) {
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, before);
      throw err;
    }
  }

  /** r5 (MOD-AI-37, FINDINGS 3316): a glass door on the glass hinges of the catalogue, or back to a door of the board of the fronts. */
  function setDoorGlass(p: HomeProject, bodyId: string, doorId: string, on: boolean): void {
    const b = existing(p, bodyId),
      f = b.doors.find((x) => x.id === doorId);
    if (!f) throw Error('Дверца не найдена.');
    if (!homeRules(p).glassDoors) throw Error('Стеклянная дверь доступна только в конструкции r5.');
    const before = clone(b);
    if (on) f.glass = true;
    else delete f.glass;
    try {
      validate(p, hw);
    } catch (err) {
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, before);
      throw err;
    }
  }

  /**
   * r5 (MOD-AI-40, FINDINGS 3313): the cable outlet of the TV unit (MOD-DEC-574) in the back of any body, or none. A
   * project saved without the outlet gets it for this body only: its other bodies keep their backs as they were.
   */
  function setCable(p: HomeProject, bodyId: string, on: boolean): void {
    const b = existing(p, bodyId);
    if (!homeRules(p).cableOutlet) throw Error('Отверстие под провода в задней стенке доступно только в конструкции r5.');
    if (on && !b.back) throw Error('Отверстие под провода — в задней стенке: у корпуса её нет. Добавьте заднюю стенку.');
    if (on && p.cableOutlet !== 'back') {
      for (const q of p.bodies) q.cable = false;
      p.cableOutlet = 'back';
    }
    b.cable = on;
  }

  /**
   * Sets the back of a body: the bearing back of the carcass board, the back of HDF in a rebate (r5, MOD-DEC-515) or
   * none. The shelves and partitions follow it in the graph; a project the rule set refuses stays as it was.
   */
  function setBack(p: HomeProject, bodyId: string, back: 'board' | 'hdf' | 'none'): void {
    const b = p.bodies.find((x) => x.id === bodyId);
    if (!b) throw Error('Корпус не найден.');
    if (!['board', 'hdf', 'none'].includes(back)) throw Error('Вид задней стенки не найден.');
    if (back === 'hdf' && !homeRules(p).hdfBack) throw Error('Задняя стенка из ХДФ доступна только в конструкции r5.');
    const before = clone(b);
    b.back = back !== 'none';
    if (back === 'hdf') b.backMaterial = 'hdf';
    else delete b.backMaterial;
    try {
      validate(p, hw);
    } catch (err) {
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, before);
      throw err;
    }
  }

  /**
   * Sets the handle of the fronts (r5, MOD-DEC-513): a handle of the fittings catalogue or 'NONE' — without handles
   * (FINDINGS 965). The handles are not drilled (158), so nothing else of the project changes.
   */
  function setHandle(p: HomeProject, handleId: string): void {
    if (!homeRules(p).handles) throw Error('Выбор ручки доступен только в конструкции r5.');
    const before = p.handleId;
    p.handleId = handleId;
    try {
      validate(p, hw);
    } catch (err) {
      if (before === undefined) delete p.handleId;
      else p.handleId = before;
      throw err;
    }
  }

  /**
   * The doors open by pressing (r5, MOD-AI-36, FINDINGS 3319) or by their handles again. A door of the board takes the
   * hinges without a spring and a latch; a project whose door gets no such hinge is refused and stays as it was.
   */
  function setPushToOpen(p: HomeProject, on: boolean): void {
    if (!homeRules(p).pushToOpen) throw Error('Открывание нажатием доступно только в конструкции r5.');
    const before = p.pushToOpen;
    if (on) p.pushToOpen = true;
    else delete p.pushToOpen;
    try {
      validate(p, hw);
    } catch (err) {
      if (before === undefined) delete p.pushToOpen;
      else p.pushToOpen = before;
      throw err;
    }
  }

  /**
   * Sets the material of the fronts (r5, MOD-DEC-573, 577): «материал → исполнение → цвет» of the catalogue of the
   * materials of the facades of the release, or null — the fronts of the board of the project, as before. ЛМДФ takes a
   * decor of the material (the one asked, the one it had, else the first); a bought material — the code of the colour or
   * the species as text. The thickness of the execution moves the fronts and the hinges follow it (selectHinge by
   * facadeThicknessMm); a project the new thickness does not fit is refused and stays as it was.
   */
  function setFacadeChoice(p: HomeProject, choice: { materialId: string | null; executionId?: string; decorId?: string | null; colorText?: string | null }): void {
    if (homeRules(p).generator !== HOME_R5) throw Error('Выбор материала фасадов доступен только в конструкции r5.');
    const now = p.facadeChoice;
    let next: HomeFacadeChoice | undefined;
    if (choice.materialId !== null) {
      const m = facadeMaterialOf(hw.facades, choice.materialId);
      if (!m) throw Error(`Материала фасадов ${choice.materialId} нет в каталоге.`);
      const same = now?.materialId === m.id,
        e = facadeExecutionOf(m, choice.executionId ?? (same ? now!.executionId : m.executions[0]!.id));
      if (!e) throw Error(`У материала «${m.title}» нет исполнения ${choice.executionId}.`);
      // ЛДСП is the board of the project in its decor; ЛМДФ — a board of a decor of its own, one of the material.
      const decors = m.color === 'BOARD_DECOR' && m.decors?.length && m.boardProduct?.includes('ЛМДФ') ? m.decors : null,
        asked = choice.decorId !== undefined ? choice.decorId : same ? now!.decorId : null;
      if (decors && asked && !decors.includes(asked)) throw Error(`Декор ${asked} не входит в цвета материала «${m.title}».`);
      const text = m.color === 'BOARD_DECOR' ? null : (choice.colorText !== undefined ? choice.colorText : same ? now!.colorText : null)?.trim() || null;
      if (text && text.length > FACADE_COLOR_TEXT_MAX) throw Error(`Код цвета — не длиннее ${FACADE_COLOR_TEXT_MAX} знаков.`);
      next = { materialId: m.id, executionId: e.id, materialTitle: m.title, executionTitle: e.title, supply: m.supply, thicknessMm: e.thicknessMm, decorId: decors ? (asked ?? decors[0]!) : null, colorText: text };
    }
    if (next) p.facadeChoice = next;
    else delete p.facadeChoice;
    try {
      validate(p, hw);
    } catch (err) {
      if (now === undefined) delete p.facadeChoice;
      else p.facadeChoice = now;
      throw err;
    }
  }

  /**
   * Puts the pedestal of a desk on the left or the right of its knee space (r5, MOD-AI-41): the desk is mirrored whole —
   * the shared side, the shelves and the fronts of the pedestal go to the other side, the doors change the side of their
   * hinges; the heights stay.
   */
  function setDeskPedestal(p: HomeProject, bodyId: string, side: 'left' | 'right'): void {
    const b = existing(p, bodyId);
    if (!homeRules(p).deskPedestalSide) throw Error('Тумба стола справа доступна только в конструкции r5.');
    if (b.kind !== 'desk') throw Error('Выберите стол.');
    if (side !== 'left' && side !== 'right') throw Error('Сторона тумбы — слева или справа.');
    if ((side === 'right') === (b.pedestal === 'right')) return;
    const previous = availableBays(p, b),
      mirror = (ref: string) => (ref === 'left' ? 'right' : ref === 'right' ? 'left' : ref);
    for (const q of b.partitions) q.x = b.w - q.x;
    for (const e of [...b.shelves, ...allFronts(b)]) [e.lo, e.hi] = [mirror(e.hi), mirror(e.lo)];
    for (const f of b.doors) f.hinge = f.hinge === 'left' ? 'right' : 'left';
    if (side === 'right') b.pedestal = 'right';
    else delete b.pedestal;
    // The niche keeps its id: it is the same pedestal on the other side.
    b.bayIds = availableBays(p, b).map((q) => ({ ...q, id: previous[0]?.id ?? q.id }));
  }

  /**
   * «Копировать» of the panel of r1 (copySelected, r1.html:100677): a shelf 64 mm higher, a partition 80 mm right of the
   * copied one's board, a front over the copied one with the seam of the rule set (r3: 2 mm, as r1; FINDINGS 1144), or,
   * without elementId, the whole body to the right of the composition with new ids — r5 (MOD-AI-42): or on its left,
   * the bodies moving right, and at a gap of whole millimetres (`place`). Returns the id of the copy; the project is
   * checked by transact() as every edit, a copy that does not fit is refused there.
   */
  function copy(p: HomeProject, bodyId: string, elementId?: string, place?: CopyPlace): string {
    const b = existing(p, bodyId);
    if (place !== undefined) {
      if (!homeRules(p).copyPlacement) throw Error('Место копии задаётся только в конструкции r5.');
      if (elementId) throw Error('Место задаётся только для копии корпуса.');
      if (place.side !== undefined && place.side !== 'right' && place.side !== 'left') throw Error('Сторона копии — справа или слева.');
      if (place.gapMm !== undefined && !(Number.isFinite(place.gapMm) && place.gapMm >= 0)) throw Error('Зазор до копии — число миллиметров от 0.');
    }
    if (!elementId) {
      const q = clone(b),
        ids = new Map<string, string>(),
        gap = Math.round(place?.gapMm ?? 0);
      q.id = newId();
      // r5 (MOD-AI-42): on the left the composition moves right by the copy and the gap.
      if (place?.side === 'left') {
        q.x = Math.min(...p.bodies.map((x) => x.x));
        for (const x of p.bodies) x.x += q.w + gap;
      } else q.x = bounds(p).w + gap;
      for (const x of q.partitions) {
        const old = x.id;
        x.id = newId();
        ids.set(old, x.id);
      }
      for (const x of [...q.shelves, ...q.doors, ...q.drawers]) {
        const old = x.id;
        x.id = newId();
        ids.set(old, x.id);
        x.lo = ids.get(x.lo) ?? x.lo;
        x.hi = ids.get(x.hi) ?? x.hi;
      }
      for (const s of q.shelves) if (s.coverOf) s.coverOf = ids.get(s.coverOf) ?? s.coverOf;
      for (const x of q.partitions) if (x.from !== undefined) x.from = ids.get(x.from) ?? x.from;
      delete q.bayIds;
      refreshBayIds(p, q);
      p.bodies.push(q);
      return q.id;
    }
    const shelf = b.shelves.find((x) => x.id === elementId);
    if (shelf) {
      const q: Shelf = { ...clone(shelf), id: newId(), y: shelf.y + COPY_SHELF_RISE };
      b.shelves.push(q);
      q.y = shelfLowerMm(p, hw, b, q);
      return q.id;
    }
    const partition = b.partitions.find((x) => x.id === elementId);
    if (partition) return addPartition(p, bodyId, partition.x + p.thickness + COPY_PARTITION_GAP, partition.from);
    const door = b.doors.find((x) => x.id === elementId),
      front = door ?? b.drawers.find((x) => x.id === elementId);
    if (!front) throw Error('Элемент не найден.');
    const q = { ...clone(front), id: newId(), y: front.y + front.h + homeRules(p).stackSeam };
    if (door) b.doors.push(q as Door);
    else {
      b.drawers.push(q as Drawer);
      // r5 (MOD-DEC-744): the copy goes on the stack of the drawer and takes its shelf.
      closeDrawer(p, b, q as Drawer);
    }
    return q.id;
  }

  /**
   * «Равные просветы» of r1 (repeat, r1.html:100736): `count` shelves (1…20) in the niche lo/hi with equal clear spaces
   * between the bottom and the top of the body; the shelves of the niche are replaced. As r1, by the formula of the
   * prototype, with the bottom of the body (its base, MOD-DEC-516) and the thickness of the top of the rule set; a
   * removable shelf of r5 then goes to its level of System 32 (FINDINGS 1145). Returns the ids of the new shelves.
   */
  function equalShelves(p: HomeProject, bodyId: string, lo: string, hi: string, count: number): string[] {
    const b = existing(p, bodyId);
    if (!Number.isInteger(count) || count < 1 || count > EQUAL_SHELVES_MAX) throw Error('Выберите от 1 до 20 полок.');
    if (!availableBays(p, b).some((q) => q.lo === lo && q.hi === hi)) throw Error('Выберите свободную нишу с реальными опорами.');
    // The shelves over the drawers of the niche stay with them (MOD-DEC-744).
    // r5 (MOD-AI-75): and the shelf a partition stands on; the niche over or under it is as high as its shelves give.
    const floors = new Set(b.partitions.map((q) => q.from).filter((id) => id !== undefined));
    b.shelves = b.shelves.filter((s) => s.lo !== lo || s.hi !== hi || s.coverOf || floors.has(s.id));
    const t = p.thickness,
      lim = floors.size ? nicheLimits(p, b, { lo, hi }) : null,
      low = lim ? lim.shelfLow : foot(p, b) + t,
      top = lim ? lim.shelfHigh : b.h - topT(p),
      gap = (top - low - count * t) / (count + 1),
      ids = Array.from({ length: count }, (_, i) => addShelf(p, bodyId, lo, hi, Math.round(low + gap * (i + 1) + t * i))),
      shelves = ids.map((id) => b.shelves.find((s) => s.id === id)!);
    if (homeRules(p).shelfSupportRule === 'WARDROBE') gridShelves(p, b, shelves, low, top);
    for (const q of shelves) q.y = shelfLowerMm(p, hw, b, q);
    return ids;
  }

  /**
   * r5 (R5-002, FINDINGS 1971): the removable shelves stand on the levels of System 32, so each one snapped alone gave
   * one opening a step larger than the others. The levels of all of them are chosen together, as «Распределить полки»
   * of the wardrobe (s32Distribute, MOD-DEC-193): the openings as equal as the grid allows. A level whose holes cross
   * other drilling of the side (a hinge plate) is left out and the levels are chosen again (INV-H04, MOD-DEC-343). With
   * no such levels each shelf keeps the level nearest to its equal place, as before.
   */
  function gridShelves(p: HomeProject, b: Body, shelves: Shelf[], low: number, top: number): void {
    const supports = shelves.map((s) => homeShelfSupport(p, hw, b, s));
    if (supports.some((x) => x.axisMm === null)) return;
    const before = shelves.map((s) => s.y),
      forbiddenAxes: number[] = [];
    for (let left = shelves.length; left >= 0; left--) {
      let r;
      try {
        r = s32Distribute({ z0: foot(p, b) + p.thickness / 2, shelves: supports.map((x) => ({ t: p.thickness, axisFromLower: x.axisMm! - x.lowerMm, forbiddenAxes })), bounds: [low, top] });
      } catch {
        break;
      }
      shelves.forEach((s, i) => (s.y = r.lowers![i]!));
      const clash = joinery(p, hw).unresolved.find((u) => u.code === 'CUTTER_INTERSECTION' && shelves.some((s) => u.holeIds?.some((h) => h.includes(':' + s.id + ':'))));
      if (!clash) return;
      const i = shelves.findIndex((s) => clash.holeIds!.some((h) => h.includes(':' + s.id + ':')));
      forbiddenAxes.push(r.axes[i]!);
    }
    shelves.forEach((s, i) => (s.y = before[i]!));
  }

  /**
   * «Кромка торца» (MOD-DEC-743, 319, 325): the band of one edge of a part — a profile of the catalogue, «Без кромки»
   * (NONE) or AUTO; `partId` and `edge` are those of homePartEdges. `access` — the «продвинутый» mode or the role of the
   * user. Returns the notice (an edge left without a band where the automatic one bands).
   */
  function setPartEdge(p: HomeProject, partId: string, edge: string, choice: EdgeChoice, access: EdgeEditAccess): string | undefined {
    return setHomeBand(p, hw, partId, edge, choice, access);
  }

  /**
   * «Кромка на всех торцах» (MOD-DEC-743): one band on every edge of a part (`partId`) or of the whole project (`partId`
   * null); the parts that are not banded (HDF, fronts bought or of ЛМДФ) stay as they are, AUTO gives the automatic back.
   */
  function setAllEdges(p: HomeProject, partId: string | null, choice: EdgeChoice, access: EdgeEditAccess): string | undefined {
    return setHomeBand(p, hw, partId, null, choice, access);
  }

  return { create, resize, addShelf, addDoor, addDrawer, moveFront, equalDrawers, freeRoom, addPartition, equalBays, setBayWidth, remove, applyMaterial, setDecor, setKitLevel, setFloor, setBack, setBase, setNichePanel, setRim, setMirror, setCable, setDoorLift, setDoorGlass, setTopCorners, setLight, setHandle, setFacadeChoice, setDeskPedestal, copy, equalShelves, setPartEdge, setAllEdges, setPushToOpen };
}

export type HomeEditor = ReturnType<typeof createHomeEditor>;

/** Where a copy of a body goes (r5, MOD-AI-42): on the right (the default) or the left of the composition, at a gap, mm. */
export interface CopyPlace {
  side?: 'right' | 'left';
  gapMm?: number;
}
