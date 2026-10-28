// Selection of the lift of a front opening upwards (task LIFT, MOD-DEC-320; Handbook r8 §18). INV-D18-01: the lift
// is chosen by a compatible row of the manufacturer's data and the full composition of the front — the carcass height
// the row serves, the mass of the front with its handle (or the power factor of the row), the width and the thickness
// the row allows; what the row does not give is UNKNOWN, never a pass: the drilling, the access to the adjustment, the
// leaf hinges of a folding front. INV-D18-02: the working angle of Modulero (MOD-DEC-194) belongs to the rows of DTC
// TOP STAY ST04 only and lives here; the angles of the manufacturer stay in the catalogue as printed and are not
// overwritten, nor is 105–115° carried over to another row. No number of another lift is used (the AVENTOS numbers of
// the kitchen are not DTC's, §18.3). Without a compatible row the function is not cut (the owner's rule of
// 2026-10-22): the nearest row stays as a temporary value and the caller says so in the «колокольчик».
import type { Lift, LiftCatalog, LiftFrontKind } from '../../catalog/hardware/lifts.js';
import { catalogSource } from '../../catalog/hardware/types.js';
import type { Source } from '../contract.js';
import { constant, decision, unknownSource, type PolicyModule } from './types.js';

export const liftSelection = {
  id: 'lift-selection',
  version: '1',
  constants: {
    ownerWorkingAngles: constant(
      [{ rowIds: ['DTC_TOP_STAY_ST04_1', 'DTC_TOP_STAY_ST04_2', 'DTC_TOP_STAY_ST04_3'], minDeg: 105, maxDeg: 115 }],
      'deg',
      decision('MOD-DEC-194'),
      'Рабочий угол Modulero 105–115° — только для строки DTC TOP STAY ST04 (корпус 650–729 мм, три исполнения по массе); угол производителя хранится в каталоге отдельно и не перезаписывается, на другие строки не переносится (INV-D18-02)',
    ),
    handleMassKg: constant(
      null,
      'kg',
      unknownSource('масса ручки не задана: ручка выбирается отдельно; мебельщик вводит её в секции (liftHandleMassKg)'),
      'Масса ручки для подбора подъёмника (INV-D18-01: масса фасада с ручкой); пока не введена — нагрузка без ручки и замечание',
    ),
  },
} as const satisfies PolicyModule;

/** What the front asks of a lift: its kind, the carcass, the front and its mass. */
export interface LiftDemand {
  frontKind: LiftFrontKind;
  /** Outer height of the carcass (KH), mm. */
  carcassHeightMm: number;
  /** Outer width of the carcass, mm. */
  carcassWidthMm: number;
  /** Height of the whole front (both leaves of a folding one with their seam), mm. */
  frontHeightMm: number;
  frontThicknessMm: number;
  /** Mass of the whole front without the handle, kg. */
  frontMassKg: number;
  /** Mass of the handle; null — not entered (the load is counted without it, the check says UNKNOWN). */
  handleMassKg: number | null;
}

export type LiftCheckCode = 'HEIGHT' | 'LOAD' | 'WIDTH' | 'THICKNESS' | 'HANDLE' | 'LEAF_HINGES' | 'DRILLING' | 'ADJUSTMENT';

export interface LiftCheck {
  code: LiftCheckCode;
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  text: string;
}

export interface LiftCandidate {
  liftId: string;
  /** The load the row is checked by: the mass, kg, or the power factor, mm·kg. */
  loadValue: number;
  checks: LiftCheck[];
  /** No check fails. */
  compatible: boolean;
}

export interface LiftSelection {
  /** The compatible row taken (INV-D18-01); null — none is compatible. */
  chosen: Lift | null;
  /** Without a compatible row: the nearest one, a temporary value (the owner's rule of 2026-10-22). */
  temporary: Lift | null;
  candidates: LiftCandidate[];
  /** Why no row was taken, in plain Russian; null when one was. */
  reason: string | null;
}

/** The working angle of a row (INV-D18-02) and where it comes from: the owner's rule, the catalogue, or unknown. */
export interface LiftWorkingAngle {
  minDeg: number | null;
  maxDeg: number | null;
  source: Source;
}

const fmt = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
const KIND_NAME: Record<LiftFrontKind, string> = { FOLDING: 'складной', FLAP: 'откидной' };

/** The load of a front for a row: the mass with the handle, or the power factor KH × (mass + 2 × handle) per kit. */
export function liftLoad(row: Lift, d: LiftDemand): number {
  const handle = d.handleMassKg ?? 0;
  return row.loadBasis === 'MASS_KG' ? (d.frontMassKg + handle) / row.kitsPerFront : (d.carcassHeightMm * (d.frontMassKg + 2 * handle)) / row.kitsPerFront;
}

/** The checks of INV-D18-01 of one row for a front. */
export function liftChecks(row: Lift, d: LiftDemand): LiftCheck[] {
  const out: LiftCheck[] = [],
    within = (x: number, a: number, b: number) => x >= a && x <= b,
    height = row.heightBasis === 'CARCASS' ? d.carcassHeightMm : d.frontHeightMm,
    heightName = row.heightBasis === 'CARCASS' ? 'высота корпуса' : 'высота фасада';
  const h = row.heightMm.value;
  out.push(
    h === null
      ? { code: 'HEIGHT', status: 'UNKNOWN', text: `${row.id}: диапазон высоты не указан` }
      : { code: 'HEIGHT', status: within(height, h.minMm, h.maxMm) ? 'PASS' : 'FAIL', text: `${heightName} ${fmt(height)} мм, строка — ${h.minMm}…${h.maxMm} мм` },
  );
  const l = row.load.value,
    load = liftLoad(row, d),
    loadName = row.loadBasis === 'MASS_KG' ? `масса фасада ${fmt(load)} кг` : `индекс нагрузки ${fmt(load)}`;
  out.push(l === null ? { code: 'LOAD', status: 'UNKNOWN', text: `${row.id}: нагрузка строки не указана` } : { code: 'LOAD', status: within(load, l.min, l.max) ? 'PASS' : 'FAIL', text: `${loadName}, строка — ${fmt(l.min)}…${fmt(l.max)}` });
  const w = row.maxCarcassWidthMm.value;
  out.push(
    w === null
      ? { code: 'WIDTH', status: 'UNKNOWN', text: `наибольшая ширина корпуса для ${row.series} не указана` }
      : { code: 'WIDTH', status: d.carcassWidthMm <= w ? 'PASS' : 'FAIL', text: `ширина корпуса ${fmt(d.carcassWidthMm)} мм, строка — до ${w} мм` },
  );
  const t = row.frontThicknessMm.value;
  out.push(
    t === null
      ? { code: 'THICKNESS', status: 'UNKNOWN', text: `толщина фасада для ${row.series} не указана` }
      : { code: 'THICKNESS', status: within(d.frontThicknessMm, t.minMm, t.maxMm) ? 'PASS' : 'FAIL', text: `толщина фасада ${fmt(d.frontThicknessMm)} мм, строка — ${t.minMm}…${t.maxMm} мм` },
  );
  out.push(
    d.handleMassKg === null
      ? { code: 'HANDLE', status: 'UNKNOWN', text: 'масса ручки не введена — нагрузка посчитана без ручки' }
      : { code: 'HANDLE', status: 'PASS', text: `масса ручки ${fmt(d.handleMassKg)} кг учтена` },
  );
  if (row.frontKind === 'FOLDING')
    out.push(
      row.leafHingesIncluded.value === true
        ? { code: 'LEAF_HINGES', status: 'PASS', text: 'петли створок входят в комплект' }
        : { code: 'LEAF_HINGES', status: 'UNKNOWN', text: 'петли между створками и крепление верхней створки: состав комплекта не указан' },
    );
  out.push(
    row.drilling === null
      ? { code: 'DRILLING', status: 'UNKNOWN', text: 'присадка механизма в корпусе и фасаде: схемы нет в данных' }
      : { code: 'DRILLING', status: 'PASS', text: 'присадка механизма — по схеме строки каталога' },
  );
  out.push({ code: 'ADJUSTMENT', status: 'UNKNOWN', text: 'доступ к регулировке усилия: данных нет' });
  return out;
}

/** How far a value lies inside a range, as a share of the range (0 at an edge); negative outside. */
const margin = (x: number, a: number, b: number) => (b > a ? Math.min(x - a, b - x) / (b - a) : x === a ? 0 : -Math.abs(x - a));

/**
 * The lift of a front (INV-D18-01): the rows of its kind, each checked by height, load, width and thickness; the
 * compatible row taken is the one whose load lies deepest in its range (in the overlap of two rows the front is not
 * at the edge of either, Д); without one, the row nearest by height and load is a temporary value.
 */
export function selectLift(d: LiftDemand, catalog: LiftCatalog): LiftSelection {
  const rows = catalog.lifts.filter((x) => x.frontKind === d.frontKind),
    candidates = rows.map((row) => {
      const checks = liftChecks(row, d);
      return { liftId: row.id, loadValue: liftLoad(row, d), checks, compatible: !checks.some((c) => c.status === 'FAIL') };
    }),
    loadMargin = (row: Lift) => (row.load.value ? margin(liftLoad(row, d), row.load.value.min, row.load.value.max) : 0),
    heightMargin = (row: Lift) => {
      const h = row.heightMm.value,
        x = row.heightBasis === 'CARCASS' ? d.carcassHeightMm : d.frontHeightMm;
      return h ? margin(x, h.minMm, h.maxMm) : 0;
    },
    best = (list: Lift[], score: (r: Lift) => number) => list.reduce<Lift | null>((a, r) => (a === null || score(r) > score(a) ? r : a), null),
    compatible = rows.filter((_, i) => candidates[i]!.compatible),
    chosen = best(compatible, loadMargin);
  if (chosen) return { chosen, temporary: null, candidates, reason: null };
  const temporary = best(rows, (r) => Math.min(heightMargin(r), 0) + Math.min(loadMargin(r), 0)),
    failed = candidates.find((c) => c.liftId === temporary?.id)?.checks.filter((c) => c.status === 'FAIL').map((c) => c.text) ?? [];
  return {
    chosen: null,
    temporary,
    candidates,
    reason: rows.length
      ? `ни одна строка подъёмника для фасада вида «${KIND_NAME[d.frontKind]}» не подходит; ближайшая ${temporary!.article}: ${failed.join('; ')}`
      : `в каталоге нет подъёмника для фасада вида «${KIND_NAME[d.frontKind]}»`,
  };
}

/**
 * The working angle of a row (INV-D18-02): the owner's 105–115° for the rows of MOD-DEC-194; otherwise the angle of
 * the manufacturer when the catalogue prints exactly one, else unknown. The angles of the catalogue are not changed.
 */
export function liftWorkingAngle(row: Lift): LiftWorkingAngle {
  const owner = liftSelection.constants.ownerWorkingAngles.value.find((a) => (a.rowIds as readonly string[]).includes(row.id));
  if (owner) return { minDeg: owner.minDeg, maxDeg: owner.maxDeg, source: liftSelection.constants.ownerWorkingAngles.source };
  const printed = row.manufacturerAngles;
  if (printed.length === 1) return { minDeg: printed[0]!.minDeg, maxDeg: printed[0]!.maxDeg, source: printed[0]!.ref ? catalogSource(printed[0]!.ref) : unknownSource('угол производителя без ссылки') };
  return { minDeg: null, maxDeg: null, source: unknownSource(printed.length ? 'источники производителя расходятся; рабочий угол Modulero для этой строки не решён' : 'угол открывания строки не указан') };
}
