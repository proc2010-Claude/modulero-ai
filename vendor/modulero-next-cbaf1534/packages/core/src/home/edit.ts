// Creating and editing projects. Every operation mutates the given project in place and either
// succeeds or throws without leaving a half-applied change (resize restores on failure).
// Defaults and rules: engine/policy/home.ts. A new project gets the rule set of the editor (r4 unless asked for r3); the
// hardware catalogue the edits are validated with is the editor's argument.
import { facadeExecutionOf, facadeMaterialOf } from '../catalog/hardware/facades.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { legsBaseHeight } from '../engine/policy/fittings-selection.js';
import { HOME, HOME_R3, HOME_R5, HOME_SHARED_SHELF, homeRules, type HomeGenerator } from '../engine/policy/home.js';
import { s32Distribute } from '../engine/policy/system32.js';
import { FACADE_COLOR_TEXT_MAX } from '../wardrobe/facade-edit.js';
import { archetypeDefaults, GENERATOR_VERSION, materialProfiles, materials, priceByPlan, prototypeArchetypeDefaults, rateKeys, rateKeysR4, templates } from './catalog.js';
import { allFronts, availableBays, bay, bounds, clone, foot, refreshBayIds, topT } from './geometry.js';
import { joinery } from './joinery.js';
import { homeShelfSupport, runnerInfo, shelfLowerMm, smallDrawerPattern } from './mechanisms.js';
import { DECOR_RATE_KEYS, type Axis, type Body, type DecorRates, type Door, type Drawer, type Front, type HomeFacadeChoice, type HomeProject, type MaterialId, type Rates, type Shelf, type TemplateId } from './types.js';
import { validate } from './validate.js';

/** Where «Копировать» of r1 puts the copy (copySelected, r1.html:100677): a place of the editor, not a rule of the construction. */
const COPY_SHELF_RISE = 64,
  COPY_PARTITION_GAP = 80;
/** «Количество полок» of «Равные просветы», r1.html:100754. */
const EQUAL_SHELVES_MAX = 20;

export type IdSource = () => string;
export const randomId: IdSource = () =>
  'HF-' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));

/**
 * Re-spreads a stack of fronts (bottom to top) between a new bottom and a new top, keeping every seam: heights scale.
 * r4 only; r3 keeps the prototype formula with 2 mm seams in resize().
 */
function spreadStack(group: Front[], low: number, top: number): void {
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
      d = (r3 ? prototypeArchetypeDefaults : archetypeDefaults)[templateId];
    if (!d) throw Error('Заготовка не найдена.');
    const spec = templates.find((t) => t.id === templateId)!;
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
      kind: templateId === 'desk' ? 'desk' : 'cabinet',
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
      if (templateId !== 'desk') b.base = { kind: 'plinth', heightMm: R.baseChoice!.plinthHeightMm };
    }
    p.bodies = [b];
    const t = p.thickness,
      pad = foot(p, b),
      T = topT(p),
      m = HOME.frontCarcassMargin,
      seam = R.stackSeam;
    if (templateId === 'desk') b.partitions.push({ id: newId(), x: HOME.deskPedestalWidth - t / 2 });
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
    if (templateId === 'chest') {
      const fh = (b.h - T - pad - 2 * m - 2 * seam) / 3;
      for (let i = 0; i < 3; i++) b.drawers.push({ id: newId(), lo: bs[0].lo, hi: bs[0].hi, y: pad + m + i * (fh + seam), h: fh });
    }
    if (templateId === 'bedside' || templateId === 'desk') {
      const y = b.shelves[0].y + t + m;
      b.drawers.push({ id: newId(), lo: bs[0].lo, hi: bs[0].hi, y, h: b.h - T - m - y });
    }
    return p;
  }

  /**
   * Changes width, height or depth of one body (bodyId) or of the whole composition (proportionally).
   * Partitions scale with the clear width; front stacks that filled the height are re-spread.
   */
  function resize(p: HomeProject, axis: Axis, value: number, bodyId?: string): void {
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
          for (const q of b.partitions) q.x = p.thickness + (q.x - p.thickness) * s;
          if (!bodyId) b.x = Math.round(b.x * ratio);
        }
        if (axis === 'h') {
          const m = HOME.frontCarcassMargin,
            oldTop = old - topT(p),
            newTop = next - topT(p),
            r3 = homeRules(p).generator === HOME_R3;
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
            } else if (fullStack) spreadStack(group, first.y, newTop - m);
            else if (Math.abs(last.y + last.h - (oldTop - m)) < 0.1) last.h = newTop - m - last.y;
          }
          if (!bodyId) b.y = Math.round(b.y * ratio);
        }
      }
      validate(p, hw);
    } catch (err) {
      for (const k of Object.keys(p)) delete (p as unknown as Record<string, unknown>)[k];
      Object.assign(p, before);
      throw err;
    }
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
    const q: Shelf = { id: newId(), lo, hi, y: y ?? foot(p, b) + step * Math.round((b.h / 2 - foot(p, b)) / step), fixed: false };
    // r5 (FINDINGS 1311): the middle of the body taken by a shelf of the niche — the middle of its largest free space.
    if (y === undefined && homeRules(p).newShelfInFreeSpace) {
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

  function addDoor(p: HomeProject, bodyId: string, lo = 'left', hi = 'right', y?: number, h?: number, hinge: Door['hinge'] = 'left'): string {
    const m = HOME.frontCarcassMargin,
      b = existing(p, bodyId),
      f: Door = { id: newId(), lo, hi, y: y ?? foot(p, b) + m, h: h ?? b.h - topT(p) - foot(p, b) - 2 * m, hinge };
    b.doors.push(f);
    return f.id;
  }

  function addDrawer(p: HomeProject, bodyId: string, lo = 'left', hi = 'right', y?: number, h?: number): string {
    const b = existing(p, bodyId),
      f: Drawer = { id: newId(), lo, hi, y: y ?? foot(p, b) + HOME.frontCarcassMargin, h: h ?? HOME.drawerDefaultHeight };
    b.drawers.push(f);
    // r4 refuses a box whose dowels meet (MOD-DEC-343), and the box of the default height is one of them: a new drawer
    // is raised by a step until they part (MOD-DEC-578, R1-010). A drawer that does not fit its niche stays as it is —
    // validate() gives the reason. r3 keeps the height of the prototype: there the clash is a warning.
    if (h === undefined && homeRules(p).drillingClashRefused)
      for (let k = 0; k < HOME.drawerDefaultRaises && boxClash(p, b, f); k++) f.h += HOME.drawerDefaultHeightStep;
    return f.id;
  }

  /** Whether the box of a drawer is too low for its dowels; a runner that does not fit is validate()'s to report. */
  function boxClash(p: HomeProject, b: Body, f: Drawer): boolean {
    try {
      return smallDrawerPattern(runnerInfo(p, hw, b, f).boxH);
    } catch {
      return false;
    }
  }

  /** Adds a partition; shelves crossing it are split into two fixed shelves. */
  function addPartition(p: HomeProject, bodyId: string, x?: number): string {
    const b = body(p, bodyId);
    if (b?.kind === 'desk') throw Error('Дополнительной вертикали стола требуется явная новая карта тумбы и зоны ног.');
    const previous = b ? availableBays(p, b) : [];
    const value = Math.round(x ?? (b as Body).w / 2);
    if (
      allFronts(b as Body).some((f) => {
        const a = bay(p, b as Body, f);
        return value > a.left && value < a.right;
      })
    )
      throw Error('Перегородка пересекает дверцу или ящик. Сначала измените их нишу или выберите свободное место.');
    if (!b || b.kind !== 'cabinet') throw Error('Выберите обычный корпус.');
    const q = { id: newId(), x: Math.round(value) };
    for (const s of b.shelves.slice()) {
      const r = bay(p, b, s);
      if (q.x > r.left && q.x < r.right) {
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

  /** Removes an element (shelf, partition, front) or, without elementId, the whole body. */
  function remove(p: HomeProject, bodyId: string, elementId?: string): void {
    const b = body(p, bodyId);
    if (b?.kind === 'desk' && b.partitions.some((q) => q.id === elementId))
      throw Error('Общую боковину тумбы нельзя удалить без изменения конструкции стола.');
    const previous = b ? availableBays(p, b) : [];
    if (!b) throw Error('Корпус не найден.');
    if (elementId && allFronts(b).some((f) => f.lo === elementId || f.hi === elementId))
      throw Error('Перегородка поддерживает фасад или ящик. Сначала переместите или удалите связанный элемент.');
    if (elementId && allFronts(b).some((f) => f.id === elementId)) {
      b.doors = b.doors.filter((f) => f.id !== elementId);
      b.drawers = b.drawers.filter((f) => f.id !== elementId);
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
  }

  /**
   * Changes the floor. r3 changes only the field (the prototype; H-10: the fronts stay on y = 5 and a carpet is refused).
   * r4: the pad height changes and the carcass interior with it — everything resting on the bottom moves by the
   * difference; a stack of fronts hanging from the top keeps its top and re-spreads from its moved bottom.
   */
  function setFloor(p: HomeProject, floor: HomeProject['floor']): void {
    if (floor !== 'hard' && floor !== 'carpet') throw Error('Вид пола не найден.');
    if (homeRules(p).generator === HOME_R3) {
      p.floor = floor;
      return;
    }
    const before = clone(p),
      // r5: a body on a plinth or legs does not stand on the pads, so the floor does not move it (516).
      old = p.bodies.map((b) => foot(p, b));
    p.floor = floor;
    try {
      p.bodies.forEach((b, i) => raiseInterior(p, b, foot(p, b) - old[i]));
      validate(p, hw);
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
      if (Math.abs(last.y + last.h - top) < 0.1) spreadStack(group, group[0].y + delta, top);
      else for (const f of group) f.y += delta;
    }
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
      if (Math.abs(last.y + last.h - top) < 0.1) spreadStack(group, low, top);
      else for (const f of group) f.y += delta;
    }
    for (const s of b.shelves) if (!s.fixed) s.y = shelfLowerMm(p, hw, b, s);
  }

  /**
   * Sets the base of a body (r5, MOD-DEC-516): the floor pads (the default), a plinth of the wardrobe or legs of the
   * catalogue. The overall height stays; the interior is fitted to the new bottom (fitInterior). A new
   * plinth is 70 mm high (291); new legs take the height a leg of the catalogue gives nearest to the base the body had
   * (481); a height given is kept. A project the rule set refuses stays as it was.
   */
  function setBase(p: HomeProject, bodyId: string, kind: 'pads' | 'plinth' | 'legs', heightMm?: number): void {
    const b = existing(p, bodyId),
      C = homeRules(p).baseChoice;
    if (!['pads', 'plinth', 'legs'].includes(kind)) throw Error('Вид основания не найден.');
    if (!C) throw Error('Цоколь и ножки доступны только в конструкции r5.');
    if (heightMm !== undefined && !Number.isFinite(heightMm)) throw Error('Некорректная высота основания.');
    const before = clone(b),
      old = foot(p, b);
    if (kind === 'pads') delete b.base;
    else
      b.base = {
        kind,
        heightMm:
          heightMm ?? (b.base?.kind === kind ? b.base.heightMm : kind === 'plinth' ? C.plinthHeightMm : legsBaseHeight(hw.fittings, old, C.heightMm)),
      };
    try {
      fitInterior(p, b, old);
      validate(p, hw);
    } catch (err) {
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, before);
      throw err;
    }
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
   * «Копировать» of the panel of r1 (copySelected, r1.html:100677): a shelf 64 mm higher, a partition 80 mm right of the
   * copied one's board, a front over the copied one with the seam of the rule set (r3: 2 mm, as r1; FINDINGS 1144), or,
   * without elementId, the whole body to the right of the composition with new ids. Returns the id of the copy; the
   * project is checked by transact() as every edit, a copy that does not fit is refused there.
   */
  function copy(p: HomeProject, bodyId: string, elementId?: string): string {
    const b = existing(p, bodyId);
    if (!elementId) {
      const q = clone(b),
        ids = new Map<string, string>();
      q.id = newId();
      q.x = bounds(p).w;
      for (const x of q.partitions) {
        const old = x.id;
        x.id = newId();
        ids.set(old, x.id);
      }
      for (const x of [...q.shelves, ...q.doors, ...q.drawers]) {
        x.id = newId();
        x.lo = ids.get(x.lo) ?? x.lo;
        x.hi = ids.get(x.hi) ?? x.hi;
      }
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
    if (partition) return addPartition(p, bodyId, partition.x + p.thickness + COPY_PARTITION_GAP);
    const door = b.doors.find((x) => x.id === elementId),
      front = door ?? b.drawers.find((x) => x.id === elementId);
    if (!front) throw Error('Элемент не найден.');
    const q = { ...clone(front), id: newId(), y: front.y + front.h + homeRules(p).stackSeam };
    if (door) b.doors.push(q as Door);
    else b.drawers.push(q as Drawer);
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
    b.shelves = b.shelves.filter((s) => s.lo !== lo || s.hi !== hi);
    const t = p.thickness,
      low = foot(p, b) + t,
      top = b.h - topT(p),
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

  return { create, resize, addShelf, addDoor, addDrawer, addPartition, remove, applyMaterial, setKitLevel, setFloor, setBack, setBase, setHandle, setFacadeChoice, copy, equalShelves };
}

export type HomeEditor = ReturnType<typeof createHomeEditor>;
