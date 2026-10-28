// FE-04 — the inner drawer and the hinge (MOD-DEC-050, 053, 054, 159, 164, 288, 311, 331, 360, 361): one policy,
// versioned on its own (054). The closed hinge — its cup, arm and plate (the volume of its drilling, FINDINGS 263) —
// must not meet the runner or the box of an inner drawer, nor the spacer they stand on. The order is the owner's
// (050, 159): first the hinge moves vertically on its ladder, keeping its count and its distance from the ends of
// the door; then the drawer moves vertically, but only a drawer the rules placed (a stored place is the user's —
// C15-03, IR6-06 #3); every candidate is accepted only after the whole product is built and checked again. No lateral
// shift, no narrower drawer and no spacer to cure this conflict (IR6-06 #6): the spacer of 331 and 360 is for the open
// door. A conflict left is a CRITICAL WARNING — INNER DRAWER / HINGE CONFLICT: VALID_WITH_WARNINGS, capability HOLD,
// readiness BLOCKED; editing, calculation and saving stay allowed (053). FINDINGS 391.
import { system32 } from './system32.js';
import { wardrobeFacades } from './wardrobe-facades.js';
import { constant, decision, type PolicyModule } from './types.js';

export const fe04 = {
  id: 'fe-04',
  version: '1',
  constants: {
    order: constant(['HINGE_VERTICAL', 'DRAWER_VERTICAL'] as const, 'rule', decision('MOD-DEC-050'), 'Сначала петля по вертикали, затем ящик; каждое исправление — после полного пересчёта без новых критических конфликтов'),
    hingeLadder: constant('wardrobe-facades.hingeStationShifts', 'rule', decision('MOD-DEC-159'), 'Петля смещается по лестнице станций фасада (0, ±32, ±64, ±96 мм прототипа, FINDINGS 263): число петель и отступ от торцов двери сохраняются'),
    drawerStepOnGrid: constant('system32.step', 'rule', decision('MOD-DEC-193'), 'Ящик смещается по шагу сетки System 32 (32 мм); без System 32 — по целому миллиметру (196)'),
    storedPlaceKept: constant(true, 'flag', decision('MOD-DEC-053'), 'Сохранённое положение ящика — пользователя: FE-04 его не двигает; при конфликте без безопасной высоты петли — ручная ветвь (IR6-06 #3)'),
    noLateralCure: constant(true, 'flag', decision('MOD-DEC-050'), 'Конфликт петли и ящика не лечится боковым смещением, сужением ящика или проставкой (IR6-06 #6); проставка 331, 360 — для открытой двери'),
    conflictLevel: constant('WARNING', 'level', decision('MOD-DEC-053'), 'Оставшийся конфликт — CRITICAL WARNING: VALID_WITH_WARNINGS, HOLD, BLOCKED; правка, расчёт и сохранение доступны'),
  },
} as const satisfies PolicyModule;

/** Shifts of a hinge station FE-04 tries, nearest first (the ladder of the facades, 159). */
export const fe04HingeShifts = (): readonly number[] => wardrobeFacades.constants.hingeStationShifts.value;

/** Step of a drawer move: the System 32 grid when it is on (193), else a whole millimetre (196). */
export const fe04DrawerStep = (system32On: boolean): number => (system32On ? system32.constants.step.value : system32.constants.integerStep.value);

/** A box in the prototype's axes (x across, y up, z from the front), millimetres. */
export interface Fe04Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** Two boxes share volume (touching faces do not). */
export const fe04Hit = (a: Fe04Box, b: Fe04Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1 && a.z0 < b.z1 && b.z0 < a.z1;
