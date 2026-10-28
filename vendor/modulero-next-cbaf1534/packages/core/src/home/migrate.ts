// Opening projects saved by earlier generators: home-r1 and home-r2 (through the old layered model, quarantined in
// ../legacy and used only here, lazily), home-physical-r3 — the rule set of the prototype — and home-physical-r4, the
// common policy of task H1. Each is brought to the current rule set r5 (the rules of the wardrobe, MOD-DEC-513; r3
// through r4, FINDINGS 854) by an explicit update with a preview of the difference, never silently (ENGINE.md §4).
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { HOME_R3, HOME_R4, HOME_R5, homeRules } from '../engine/policy/home.js';
import { createLegacyHomeModel } from '../legacy/home-legacy.js';
import { allFronts, clone } from './geometry.js';
import { rateKeysR4, rateNames, rateNamesR4, RATES_REPLACED_IN_R4 } from './catalog.js';
import { runnerInfo, shelfLowerMm } from './mechanisms.js';
import { hardware, parts } from './outputs.js';
import type { Board, HomeProject, Rates } from './types.js';
import { validate } from './validate.js';

let legacy: ReturnType<typeof createLegacyHomeModel> | null = null;
const legacyModel = () => (legacy ??= createLegacyHomeModel());

/** The project is built with the current rule set r5 and opens for editing (FINDINGS 854). */
export const isCurrent = (p: unknown): p is HomeProject =>
  !!p && typeof p === 'object' && (p as { generatorVersion?: string }).generatorVersion === HOME_R5;

/** The project is built with r4, the rule set of new projects before the rules of the wardrobe: it is updated to r5. */
export const isPreviousRuleSet = (p: unknown): p is HomeProject =>
  !!p && typeof p === 'object' && (p as { generatorVersion?: string }).generatorVersion === HOME_R4;

/** The project is built with the rule set of the prototype (home-physical-r3). */
export const isPrototypeRuleSet = (p: unknown): p is HomeProject =>
  !!p && typeof p === 'object' && (p as { generatorVersion?: string }).generatorVersion === HOME_R3;

export interface PartDifference {
  id: string;
  name: string;
  /** Cut length × width × thickness, mm; null — the part is not in that version. */
  before: [number, number, number] | null;
  after: [number, number, number] | null;
}

export interface MigrationPreview {
  canUpdate: boolean;
  supported?: boolean;
  differences: string[];
  partDifferences?: unknown[];
  conflicts: string[];
  project?: HomeProject | null;
  fromGenerator?: string;
  toGenerator?: string;
}

const size = (q: Board): [number, number, number] => [q.cutLength, q.cutWidth, q.thickness];
const mm = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
const text = (s: [number, number, number] | null) => (s ? s.map(mm).join(' × ') + ' мм' : 'нет');

/** A rule set a project is updated to: r5, the current one, or r4 — the step of an r3 project on its way (tests of r4). */
export type UpdateTarget = typeof HOME_R4 | typeof HOME_R5;

/**
 * What the rules of r4 change in this project, in words, before the part list. On the way to r5 the supports and the
 * hardware drilling of r4 are replaced by those of the wardrobe and are not named (`towardR5`).
 */
function ruleChangesR4(p: HomeProject, towardR5 = false): string[] {
  const fronts = p.bodies.some((b) => allFronts(b).length),
    adjustable = p.bodies.some((b) => b.shelves.some((s) => !s.fixed)),
    shared = p.bodies.some((b) => b.shelves.some((s) => s.fixed && b.partitions.some((q) => q.id === s.lo || q.id === s.hi))),
    drawers = p.bodies.some((b) => b.drawers.length),
    hardware = fronts || adjustable,
    out: string[] = [];
  if (fronts) out.push('Фасады: отступ от наружного края 1,5 мм и шов 3 мм у перегородки вместо 2 мм (MOD-DEC-124, 185).');
  if (fronts && p.thickness !== 18) out.push(`Фасады — из плиты проекта ${p.thickness} мм вместо 18 мм; корпус отступает под них на ${p.thickness + 2} мм (MOD-DEC-294, 162).`);
  if (shared) out.push('Полки по обе стороны перегородки: гнёзда разнесены по глубине на 16 мм (MOD-DEC-343).');
  if (adjustable && !towardR5) out.push('Полкодержатели — по системе 32 мм: 37 мм от переднего края и задний ряд сетки (MOD-DEC-193, 343).');
  if (drawers) out.push('Направляющие ящиков: метки винтов на боковинах корпуса и ящика (MOD-DEC-276).');
  if (hardware && !towardR5) out.push('Присадка петель, полкодержателей и направляющих помечена «неполная»: размеры определяет владелец (MOD-DEC-277).');
  out.push('Прогиб крышки — предупреждение, а не запрет; пересекающиеся сверления и корпус над полом — запрет (H-12, H-04, H-06).');
  return out;
}

/**
 * The rates of r4 from the rates of an r3 project or of an r4 project saved before MOD-DEC-510: «Плита с отходами» and
 * «Раскрой и присадка» are not carried over — their meaning changed (₽/м² of blanks with the waste, ₽/part), and a
 * sheet, a metre of the saw run or a hole has no honest conversion from them; the other rates stay. null — the rates
 * are already those of r4.
 */
export function ratesForR4(rates: Rates): { rates: Rates; cleared: string[]; message: string | null } | null {
  if (Object.keys(rates).every((k) => Object.hasOwn(rateNamesR4, k)) && rateKeysR4.every((k) => Object.hasOwn(rates, k))) return null;
  const cleared = RATES_REPLACED_IN_R4.filter((k) => rates[k] !== null && rates[k] !== undefined).map((k) => rateNames[k]);
  return {
    rates: Object.fromEntries(rateKeysR4.map((k) => [k, rates[k] ?? null])) as Rates,
    cleared,
    message: cleared.length
      ? `Ставки ${cleared.map((x) => '«' + x + '»').join(', ')} очищены: их смысл изменился. Плита считается целыми листами карты раскроя, распил — метрами реза карты, присадка — по отверстиям (MOD-DEC-510). Пока изготовитель не задал цену листа, распила и отверстия, смета берёт временные цены.`
      : null,
  };
}

/**
 * What the rules of the wardrobe (r5, MOD-DEC-513) change in this project, in words, before the part list: the hinges
 * (FINDINGS 841), the edge by the kind of the part (843), the shelf supports and System 32 by height (844, 845).
 */
function ruleChangesR5(p: HomeProject, hw: HardwareCatalogs, moved: string[], drawerLoad: boolean): string[] {
  const doors = p.bodies.some((b) => b.doors.length),
    runners = p.bodies.flatMap((b) => b.drawers.map((f) => runnerInfo(p, hw, b, f))),
    adjustable = p.bodies.some((b) => b.shelves.some((s) => !s.fixed)),
    drawers = p.bodies.some((b) => b.drawers.length),
    out: string[] = [];
  if (doors) out.push('Петли — по правилу шкафа: пара «петля + планка» по наложению, число по графику петли, места петель как у шкафа, присадка по каталогу (MOD-DEC-513; 073, 190, 277, 378).');
  out.push('Кромка — по виду детали, как у шкафа: фасады 2 мм по кругу, передний торец боковин, перегородок и дна 1 мм, полки 0,4 мм; общая толщина кромки проекта больше не используется (MOD-DEC-513, 055).');
  if (drawers) out.push('Короб ящика кромится как у шкафа: 2 мм сверху, 0,4 мм снизу, спереди и сзади (MOD-DEC-513).');
  // r5 (MOD-DEC-574, FINDINGS 1750, 1755, 1756): the runner of each drawer by 466 and its box; the load of a new project.
  if (drawers)
    out.push(
      'Направляющие ящиков — по уровню комплектации (MOD-DEC-574, 466): «Эконом» — шариковые BOYARD DB4501 с коробом прежней конструкции, «Стандарт» и «Премиум» — скрытого монтажа BOYARD B-Slide с коробом по её набору; направляющая, которая не держит ящик с грузом, заменяется следующей по подбору с замечанием (465).',
    );
  if (runners.some((n) => !n.concealed)) out.push('Дно ящика на шариковых направляющих — ХДФ 4 мм в пазу стенок короба, как у шкафа, вместо плиты 16 мм на конфирматах (MOD-DEC-574).');
  if (runners.some((n) => n.concealed))
    out.push('Короб ящика на B-Slide — по набору направляющей: дно из плиты 16 мм над низом боковин, задняя стенка над дном, фасад крепится к боковинам и дну вместо внутренней передней стенки (MOD-DEC-574).');
  if (drawers && drawerLoad) out.push(`Груз ящика — ${p.plannedDrawerLoadKg} кг вместо 5 кг, как у нового проекта (MOD-DEC-574).`);
  if (p.bodies.some((b) => b.cable && b.back)) out.push('В задней стенке ТВ-тумбы — отверстие Ø60 мм под провода, в 100 мм ниже крышки (MOD-DEC-574, 496).');
  if (adjustable)
    out.push(
      'Съёмные полки — на полкодержателях уровня комплектации, как у шкафа (по умолчанию FLIPPER с фиксацией), по сетке системы 32 мм от оси дна, с запасными отверстиями ±32 мм; присадка полкодержателей — по каталогу (MOD-DEC-513; 193, 332, 344).',
      ...moved,
    );
  if (runners.some((n) => !n.concealed)) out.push('Присадка шариковых направляющих и крепления фасадов их ящиков по-прежнему помечена «неполная»: размеры определяет владелец (MOD-DEC-277).');
  if (runners.some((n) => n.concealed)) out.push('Присадка направляющих B-Slide — по набору БАЗИС производителя (277).');
  if (p.bodies.some((b) => allFronts(b).length))
    out.push('Ручки — из каталога фурнитуры, как у шкафа: скоба BOYARD RS425BAP.5/128 вместо кнопки RC282BL.4, другую ручку или «без ручек» можно выбрать; на двери — вертикально у свободного края, на ящике — по центру фасада; цена — по каталогу, если ставку не задал изготовитель (MOD-DEC-513; 480, 536).');
  return out;
}

/** r5: a removable shelf moves to its level of System 32 (FINDINGS 844); the moves, shown in the preview (312). */
function toGrid(p: HomeProject, hw: HardwareCatalogs): string[] {
  const out: string[] = [];
  for (const b of p.bodies)
    for (const s of b.shelves.filter((s) => !s.fixed)) {
      const y = shelfLowerMm(p, hw, b, s);
      if (Math.abs(y - s.y) > 1e-6) out.push(`Съёмная полка: высота ${mm(s.y)} → ${mm(y)} мм (уровень системы 32 мм).`);
      s.y = y;
    }
  return out;
}

/** The hardware lines whose article or quantity changes, in words (MOD-DEC-507). */
function hardwareChanges(before: HomeProject, after: HomeProject, hw: HardwareCatalogs): string[] {
  const count = (q: HomeProject) => {
    const m = new Map<string, { name: string; unit: string; quantity: number }>();
    for (const l of hardware(clone(q), hw)) {
      const x = m.get(l.sku);
      if (x) x.quantity += l.quantity;
      else m.set(l.sku, { name: l.name, unit: l.unit, quantity: l.quantity });
    }
    return m;
  };
  let a = new Map<string, { name: string; unit: string; quantity: number }>();
  try {
    a = count(before);
  } catch {
    // a project that its own rules cannot build: every line is new
  }
  const b = count(after),
    out: string[] = [];
  for (const sku of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(sku),
      y = b.get(sku);
    if (x?.quantity !== y?.quantity) out.push(`Фурнитура «${(y ?? x)!.name}» (${sku}): ${x?.quantity ?? 0} → ${y?.quantity ?? 0} ${(y ?? x)!.unit}`);
  }
  return out;
}

/**
 * r3 → r4 → r5, r4 → r5: the same inputs under the new rules, step by step; the difference by part (and, into r5, by
 * hardware) between the saved project and the updated one, and the reason when a step refuses them.
 */
function toRuleSet(saved: HomeProject, target: UpdateTarget, hw: HardwareCatalogs): Pick<MigrationPreview, 'canUpdate' | 'differences' | 'partDifferences' | 'conflicts' | 'project'> {
  const chain: UpdateTarget[] = saved.generatorVersion === HOME_R3 && target === HOME_R5 ? [HOME_R4, HOME_R5] : [target],
    rules: string[] = [];
  let next = clone(saved);
  for (const generator of chain) {
    next = clone(next);
    next.generatorVersion = generator;
    // The rates of r3, or of r4 saved before MOD-DEC-510, become those of the cutting plan (r4 and r5 alike).
    const rates = ratesForR4(next.rates);
    if (rates) next.rates = rates.rates;
    const moved = generator === HOME_R5 ? toGrid(next, hw) : [];
    // r5 (FINDINGS 965): the project takes the handle of a new one — the default of the wardrobe (480).
    if (generator === HOME_R5) next.handleId = homeRules(next).handles!.defaultId;
    // r5 (MOD-DEC-574, FINDINGS 1304): and the bottom of HDF in a groove of its drawer boxes.
    if (generator === HOME_R5) next.drawerBottom = 'hdf';
    // r5 (MOD-DEC-574, FINDINGS 1750, 1755): and the runner of each drawer by 466, each with its box.
    if (generator === HOME_R5) next.drawerRunner = 'level';
    // r5 (MOD-DEC-574, FINDINGS 1756): the load of 5 kg of the prototype becomes the 10 kg of a new project; another
    // load was entered by the user and stays.
    const drawerLoad = generator === HOME_R5 && next.plannedDrawerLoadKg === homeRules({ generatorVersion: HOME_R4 }).drawerLoadKg ? homeRules(next).drawerLoadKg : null;
    if (drawerLoad !== null) next.plannedDrawerLoadKg = drawerLoad;
    // r5 (MOD-DEC-574, FINDINGS 1307): and the cable outlet of the prototype r1 in the back of a body with `cable`.
    if (generator === HOME_R5) next.cableOutlet = 'back';
    try {
      validate(next, hw);
    } catch (e) {
      return { canUpdate: false, differences: [], partDifferences: [], conflicts: [(e as Error).message], project: null };
    }
    rules.push(...(generator === HOME_R4 ? ruleChangesR4(next, target === HOME_R5) : ruleChangesR5(next, hw, moved, drawerLoad !== null)), ...(rates?.message ? [rates.message] : []));
  }
  let before: Board[] = [];
  try {
    before = parts(clone(saved), hw, true);
  } catch {
    // a project that its own rules cannot build: every part is new
  }
  const after = parts(clone(next), hw, true),
    old = new Map(before.map((q) => [q.id, q])),
    changed: PartDifference[] = [];
  for (const q of after) {
    const b = old.get(q.id),
      s = size(q);
    if (!b || size(b).some((v, i) => Math.abs(v - s[i]) > 0.05)) changed.push({ id: q.id, name: q.name, before: b ? size(b) : null, after: s });
  }
  const ids = new Set(after.map((q) => q.id));
  for (const b of before) if (!ids.has(b.id)) changed.push({ id: b.id, name: b.name, before: size(b), after: null });
  return {
    canUpdate: true,
    differences: [...rules, ...(target === HOME_R5 ? hardwareChanges(saved, next, hw) : []), ...changed.map((d) => `${d.name}: ${text(d.before)} → ${text(d.after)}`)],
    partDifferences: changed,
    conflicts: [],
    project: next,
  };
}

/**
 * What changes if an old project is rebuilt with the current construction (r5), or with `target` r4 — the step an r3
 * project takes on its way, kept for the tests and masters of r4.
 */
export function migrationPreview(p: unknown, hw: HardwareCatalogs, target: UpdateTarget = HOME_R5): MigrationPreview {
  const version = (p as { generatorVersion?: string } | null)?.generatorVersion;
  if (isCurrent(p) || (version === target && isPreviousRuleSet(p))) return { canUpdate: false, differences: [], conflicts: ['Конструкция уже обновлена.'] };
  if (isPrototypeRuleSet(p) || isPreviousRuleSet(p)) return { supported: true, fromGenerator: version, toGenerator: target, ...toRuleSet(p, target, hw) };
  // home-r1 / home-r2: the old model rebuilds them as r3, then the r3 project is brought to the target.
  const base = legacyModel().migrationPreview(p);
  if (!base.canUpdate || !isPrototypeRuleSet(base.project)) return base;
  const next = toRuleSet(base.project, target, hw);
  return {
    ...base,
    ...next,
    differences: [...base.differences, ...next.differences],
    partDifferences: [...(base.partDifferences ?? []), ...(next.partDifferences ?? [])],
    toGenerator: target,
  };
}

export function updateConstruction(p: unknown, hw: HardwareCatalogs, target: UpdateTarget = HOME_R5): HomeProject {
  const preview = migrationPreview(p, hw, target);
  if (!preview.canUpdate) throw Error(preview.conflicts.join(' '));
  return clone(preview.project as HomeProject);
}

/** Validates a project of the current generator family, or upgrades an r1 project to the r2 format (old editor path). */
export function upgradeR2Project(p: unknown, hw: HardwareCatalogs): unknown {
  return isCurrent(p) || isPreviousRuleSet(p) || isPrototypeRuleSet(p) ? validate(clone(p), hw) : legacyModel().upgradeR2Project(p);
}
