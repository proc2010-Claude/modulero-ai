// The settings of the whole kitchen on «Материалы и опции» (R4-006 of the pilot, stage 4; FINDINGS 1903): the worktop,
// the supports, the wall cabinets on their rail, the filler of the corner cabinets and the appliances. The numbers are
// the editable defaults of MOD-DEC-180 and 565; a setting changes every module of the kitchen it concerns and is kept
// in the project (KitchenProject.kitchenOptions) for the modules added after it (makeKitchenModule). The kitchen is
// checked as a whole, by the one check of every module (kitchenSceneError): a setting a module cannot take is refused
// with the words of that module's check, nothing changed.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Rec } from '../engine/policy/project-state.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { APPLIANCE_PROFILES, applianceSelections, FRONT_CARCASS_GAP, frontThickness, hangerEligible, isAppliance, worktopDepthOf } from './carcass.js';
import { kitchenProjectOfScene, kitchenSceneError, kitchenSceneOf, type KitchenEdit } from './editor.js';
import { kitchenRateSettings } from './cost.js';
import { levelHanger, levelHangerOf } from './hanger.js';
import { alignSingleCorner, seatMezzanine } from './modules.js';
import type { KitchenOptions, KitchenProject } from './project.js';
import { isFree, isLegacyCorner, isSingleCorner } from './room.js';
import { KIND_INFO } from './standard.js';

const K = kitchen.constants;
const no = (problem: string): KitchenEdit => ({ ok: false, problem });

export type KitchenOptionKey = 'worktopDepthMm' | 'legHeightMm' | 'upperFloorMm' | 'lowerFillerMm' | 'upperFillerMm';

/** One setting: its words, its default and the decision it is of, its limits (null — the check of the modules alone). */
export const KITCHEN_OPTIONS: Readonly<Record<KitchenOptionKey, { label: string; fallback: number; decision: string; min: number | null; max: number | null }>> = {
  worktopDepthMm: { label: 'Глубина столешницы, мм', fallback: K.worktopDepth.value, decision: 'MOD-DEC-565', min: 580, max: 800 },
  legHeightMm: { label: 'Высота опор, мм', fallback: KIND_INFO.base!.floor, decision: 'MOD-DEC-180', min: 89, max: 125 },
  upperFloorMm: { label: 'Низ навесных шкафов от пола, мм', fallback: KIND_INFO.upper!.floor, decision: 'MOD-DEC-565', min: null, max: null },
  lowerFillerMm: { label: 'Добор нижнего углового шкафа, мм', fallback: 50, decision: 'MOD-DEC-565', min: null, max: null },
  upperFillerMm: { label: 'Добор навесного углового шкафа, мм', fallback: 30, decision: 'MOD-DEC-565', min: null, max: null },
};

/** The floor cabinets under a worktop (wholeWorktops). */
const underWorktop = (m: Rec) => ['base', 'island', 'niche'].includes(m.kind);
/** The modules on the supports 9028286: their bottom is the height of the supports. */
const onSupports = (m: Rec) => m.supportKit === '9028286';
const wallUpper = (m: Rec) => m.kind === 'upper' && !isFree(m);
const cornerOf = (key: 'lowerFillerMm' | 'upperFillerMm') => (m: Rec) => isSingleCorner(m) && (m.kind === 'upper') === (key === 'upperFillerMm');

/** The value of a setting in the kitchen: one value, or null — the modules differ («разные»); no module — the default. */
function common(values: number[], fallback: number): { value: number | null; modules: number } {
  const set = new Set(values);
  return { value: set.size === 0 ? fallback : set.size === 1 ? values[0]! : null, modules: values.length };
}

export interface KitchenOptionsView {
  worktop: { depthMm: number | null; overhangMm: number | null; thicknessMm: number; modules: number };
  legs: { heightMm: number | null; modules: number };
  /**
   * `hangers`, `railMm`, `railStocks` — the cabinets on the rail of SAH 216 (a module saved before 413, a corner);
   * `levelHangers` — the new cabinets on the hanger of the level (FINDINGS 2754) and the hangers taken, by name.
   */
  upper: { floorMm: number | null; modules: number; hangers: number; railMm: number; railStocks: number; levelHangers: { modules: number; names: string[] } };
  filler: { lowerMm: number | null; lowerModules: number; upperMm: number | null; upperModules: number };
  appliances: { include: boolean; list: { moduleId: string; name: string; model: string }[] };
}

/** What «Материалы и опции» shows of the settings of the whole kitchen. */
export function kitchenOptionsView(p: KitchenProject, hw: HardwareCatalogs): KitchenOptionsView {
  const s = kitchenSceneOf(p, hw),
    M = s.modules.filter((m) => !isLegacyCorner(m)),
    o = KITCHEN_OPTIONS,
    worktop = common(M.filter(underWorktop).map(worktopDepthOf), p.kitchenOptions?.worktopDepthMm ?? o.worktopDepthMm.fallback),
    legs = common(M.filter(onSupports).map((m) => m.floor), p.kitchenOptions?.legHeightMm ?? o.legHeightMm.fallback),
    upper = common(M.filter(wallUpper).map((m) => m.floor), p.kitchenOptions?.upperFloorMm ?? o.upperFloorMm.fallback),
    lower = common(M.filter(cornerOf('lowerFillerMm')).map((m) => m.filler_width_mm), p.kitchenOptions?.lowerFillerMm ?? o.lowerFillerMm.fallback),
    upperFiller = common(M.filter(cornerOf('upperFillerMm')).map((m) => m.filler_width_mm), p.kitchenOptions?.upperFillerMm ?? o.upperFillerMm.fallback),
    // The rail of the SAH216 hangers: one piece over each cabinet between its sides, cut from stock of 3000 (drawerRows of hardware.ts).
    pieces = M.filter(hangerEligible).map((m) => m.width - 2 * (m.panelThickness ?? 16)),
    stocks: number[] = [];
  for (const cut of [...pieces].sort((a, b) => b - a)) {
    const i = stocks.findIndex((left) => left >= cut);
    if (i >= 0) stocks[i]! -= cut;
    else if (cut <= 3000) stocks.push(3000 - cut);
  }
  const level = M.filter(levelHanger),
    levelHangers = { modules: level.length, names: [...new Set(level.flatMap((m) => { const h = levelHangerOf(s.hardware, m); return h ? [`${h.brand} ${h.series}`] : []; }))] };
  // The overhang over the front of each cabinet under a worktop: its worktop less its carcass, 2 mm off it and its front
  // (R4-007 of the tester: a cabinet of 1000 under a worktop of 600 was said to overhang by 20 mm). Without such a
  // cabinet — a base cabinet of 560 (kitchenWorktopDefaults).
  const ft = (m: Rec) => frontThickness(s, m, K.frontThickness.value),
    overhang = common(
      M.filter(underWorktop).map((m) => worktopDepthOf(m) - (m.depth + FRONT_CARCASS_GAP + ft(m))),
      worktop.value === null ? 0 : worktop.value - (K.baseDepth.value + FRONT_CARCASS_GAP + K.frontThickness.value),
    );
  return {
    worktop: { depthMm: worktop.value, overhangMm: worktop.value === null ? null : overhang.value, thicknessMm: K.worktopThickness.value, modules: worktop.modules },
    legs: { heightMm: legs.value, modules: legs.modules },
    upper: { floorMm: upper.value, modules: upper.modules, hangers: pieces.length, railMm: pieces.reduce((a, b) => a + b, 0), railStocks: stocks.length, levelHangers },
    filler: { lowerMm: lower.value, lowerModules: lower.modules, upperMm: upperFiller.value, upperModules: upperFiller.modules },
    appliances: {
      include: kitchenRateSettings(p.costSettings ?? null).includeAppliances,
      list: M.filter(isAppliance).flatMap((m) =>
        applianceSelections(m).map((a) => ({ moduleId: m.id, name: m.name, model: (a.profileId && APPLIANCE_PROFILES[a.profileId]?.label) || a.model || (a.mode === 'own' ? `свой прибор, вырез ${m.cutout.width} × ${m.cutout.depth} мм` : 'модель не выбрана') })),
      ),
    },
  };
}

/**
 * Sets one setting of the whole kitchen: every module it concerns takes the value, a new module takes it too. The worktop
 * — every floor cabinet under a worktop; the supports — every module on the supports 9028286, a tall cabinet keeps its
 * top at the wall cabinets (MOD-DEC-567), a niche of a machine on the floor stays as high as its row; the wall cabinets —
 * their bottom, a mezzanine and a tall cabinet that ended at their top follow them; the filler — the straight corner
 * cabinets below or on the wall. The default value removes the setting from the project.
 */
export function setKitchenOption(p: KitchenProject, hw: HardwareCatalogs, key: KitchenOptionKey, value: number): KitchenEdit {
  const o = KITCHEN_OPTIONS[key];
  if (!o) return no(`Нет настройки ${key}.`);
  const name = o.label.replace(/, мм$/, '');
  if (p.modules.some(isLegacyCorner)) return no('LEGACY_CORNER_VERSION: сохранённая пара доступна только для чтения.');
  if (!Number.isInteger(value) || value <= 0) return no(`«${name}»: целое число миллиметров больше нуля. Кухня не изменена.`);
  if ((o.min !== null && value < o.min) || (o.max !== null && value > o.max)) return no(`«${name}»: ${o.min}–${o.max} мм. Кухня не изменена.`);
  const s = kitchenSceneOf(p, hw),
    before = s.modules.map((m) => ({ ...m })),
    modules = s.modules.map((m) => ({ ...m }));
  let changed = 0;
  if (key === 'worktopDepthMm')
    for (const m of modules.filter(underWorktop)) {
      if (value === o.fallback) delete m.worktopDepth;
      else m.worktopDepth = value;
      changed++;
    }
  if (key === 'legHeightMm') {
    for (const m of modules.filter(onSupports)) {
      // MOD-DEC-567: the top of a tall cabinet stays at the top of the wall cabinets.
      if (m.kind === 'tall') m.height += m.floor - value;
      m.floor = value;
      changed++;
    }
    // A machine on the floor under the worktop is as high as the cabinet on the supports beside it.
    for (const m of modules.filter((m) => m.kind === 'niche' && m.floor === 0 && m.worktopEnabled !== false)) {
      const level = (x: Rec) => onSupports(x) && x.floor + x.height === m.height,
        row = before.find((x) => level(x) && x.wall === m.wall) ?? before.find(level);
      if (!row) continue;
      m.height += value - row.floor;
      // The machine of the niche stands in it to its top (applianceDefaults).
      if (Array.isArray(m.appliances)) m.appliances = m.appliances.map((a: Rec) => (['washer', 'dishwasher'].includes(a.family) ? { ...a, nicheHeight: m.height, installedApplianceHeight: m.height } : a));
    }
  }
  if (key === 'upperFloorMm') {
    for (const m of modules.filter(wallUpper)) {
      m.floor = value;
      changed++;
    }
    // MOD-DEC-567: a tall cabinet that ended at the top of a wall cabinet of its wall ends at it again.
    for (const t of modules.filter((t) => t.kind === 'tall')) {
      const u = before.find((x) => wallUpper(x) && x.wall === t.wall && x.floor + x.height === t.floor + t.height);
      if (u) t.height += value - u.floor;
    }
  }
  if (key === 'lowerFillerMm' || key === 'upperFillerMm')
    for (const m of modules.filter(cornerOf(key))) {
      m.filler_width_mm = value;
      changed++;
    }
  const next = { ...s, kitchenOptions: { ...p.kitchenOptions, [key]: value } as KitchenOptions, modules };
  if (value === o.fallback) delete next.kitchenOptions[key];
  if (!Object.keys(next.kitchenOptions).length) delete (next as Rec).kitchenOptions;
  // The corners stand by their filler; a mezzanine stands on the cabinets under it (MOD-DEC-565 п. 13).
  next.modules = next.modules.map((m) => (isSingleCorner(m) ? alignSingleCorner(next, m) : m));
  next.modules = next.modules.map((m) => {
    if (m.kind !== 'mezz') return m;
    const support = m.supportId ? next.modules.find((x) => x.id === m.supportId) : null;
    return support ? { ...m, floor: support.floor + support.height } : seatMezzanine(next, m);
  });
  const error = kitchenSceneError(next);
  if (error) return no(`«${name}» ${value} мм не принято: ${error} Кухня не изменена.`);
  return { ok: true, project: kitchenProjectOfScene(next), notice: `«${name}»: ${value} мм${changed ? ` — модулей изменено: ${changed}` : ''}; новые модули берут это значение.` };
}
