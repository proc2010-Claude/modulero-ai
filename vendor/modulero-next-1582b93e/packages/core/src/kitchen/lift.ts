// The lift of the front of a new kitchen module that opens upwards (the mezzanine «С подъёмным», KM_LIFT; MOD-DEC-413,
// (Д) Директора 2026-10-29, FINDINGS 3350): by the level of the hardware chosen in the panel «Фасады» — «Эконом» МДМ
// FLAP AIR FL327, «Стандарт» МДМ FLAP FL123, «Премиум» Blum AVENTOS HK-S of the prototype. FLAP is built otherwise than
// HK-S: the front hangs on hinges in the top of the carcass (mechanisms.ts, flapHingePlan) and the mechanism on the
// side only lifts it; its holes in the side and the front are those of its BAZIS kit (277), moved by the plate and the
// type of the hinge where the kit says so. The level not chosen is «Стандарт» (223), but a row without a confirmed
// range is not taken by default: FL123 has none yet, so a new module stays on HK-S until the level is chosen. A module
// saved before has no `lift` and keeps its HK-S, as the drawers keep their TANDEM (FINDINGS 1863).
import type { Lift } from '../catalog/hardware/lifts.js';
import type { HardwareTier } from '../catalog/hardware/shelf-supports.js';
import { TIER_NAMES } from '../engine/policy/hardware-tier.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { liftWorkingAngle, selectLift, type LiftCheck, type LiftDemand, type LiftSelection } from '../engine/policy/lift-selection.js';
import type { Rec } from '../engine/policy/project-state.js';
import { flapHingePlan, hole, type MechanismHole } from './mechanisms.js';
import type { KitchenScene } from './room.js';

const EPS = 1e-6;
const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** The levels of the field «Подъёмник» in the order of the panel; the first is the one not chosen (223). */
export const LIFT_TIERS: readonly HardwareTier[] = ['STANDARD', 'ECONOMY', 'PREMIUM'];

/** The front of the module is lifted by the lift of its level (a new module of 413), not by the HK-S of the prototype. */
export const levelLift = (m: Rec): boolean => m.lift === 'level' && kitchen.constants.liftRule.value === 'LEVEL_FLAP';

/** The level of the lift of the module: chosen in the panel, else «Стандарт» (223). */
export const liftTierOf = (m: Rec): HardwareTier => (LIFT_TIERS.includes(m.liftTier) ? m.liftTier : 'STANDARD');

/** What the lift of the level is: МДМ FLAP of a row, or the HK-S of the prototype and why. */
export interface KitchenLift {
  tier: HardwareTier;
  /** The level is chosen in the panel, not the one by default. */
  chosen: boolean;
  /** The row of FLAP; null — the front stays on the HK-S of the prototype. */
  row: Lift | null;
  /** No row is compatible: the nearest one stands as a temporary value (the owner's rule of 2026-10-22). */
  temporary: boolean;
  /** Mechanisms on the front: 2 — a pair of one-side mechanisms, each chosen by half the power (3354). */
  kits: 1 | 2;
  selection: LiftSelection | null;
  /** Why the front is not on FLAP of its level, or why the row is temporary; null — nothing to say. */
  note: string | null;
}

/** A row the selection may take by default: the height and the load of its range are known (FL123 has none, 3350). */
const confirmed = (row: Lift) => row.heightMm.value !== null && row.load.value !== null;

/**
 * The lift of the level of a new module for its front (INV-D18-01 through selectLift); HK-S for «Премиум». A lift
 * fixed to one side (FLAP AIR) stands as a pair when the front is wider than `flapPairWidth` or no single one takes
 * its power, each of the pair chosen by half the mass, so half the power; but one that fits wins over a pair that
 * does not, on a wide front too ((Д) Директора 2026-10-29, FINDINGS 3354).
 */
export function kitchenLift(s: KitchenScene, m: Rec, demand: LiftDemand, frontWidthMm: number): KitchenLift {
  const tier = liftTierOf(m),
    chosen = LIFT_TIERS.includes(m.liftTier),
    hks = (note: string | null): KitchenLift => ({ tier, chosen, row: null, temporary: false, kits: 1, selection: null, note });
  if (tier === 'PREMIUM') return hks(null);
  const single = selectLift(demand, s.hardware.lifts, tier),
    oneSide = s.hardware.lifts.lifts.some((x) => x.tier === tier && x.frontKind === demand.frontKind && x.drilling?.sides === 'ONE'),
    wide = frontWidthMm > kitchen.constants.flapPairWidth.value + EPS,
    half = { ...demand, frontMassKg: demand.frontMassKg / 2, handleMassKg: demand.handleMassKg === null ? null : demand.handleMassKg / 2 },
    paired = oneSide && (wide || !single.chosen) ? selectLift(half, s.hardware.lifts, tier) : null,
    // The pair when it fits; else one that fits; else a wide front stays on a temporary pair, a narrow one on one (a light
    // front is not helped by two).
    kits: 1 | 2 = paired && (paired.chosen || (wide && !single.chosen)) ? 2 : 1,
    selection = kits === 2 ? paired! : single,
    row = selection.chosen ?? selection.temporary;
  if (!row) return hks(`Уровень ${TIER_NAMES[tier]}: ${selection.reason}; стоит Blum AVENTOS HK-S.`);
  // (Д) Директора 2026-10-29: a row without a confirmed range is not taken by default, only when the level is chosen.
  if (!chosen && !confirmed(row)) return hks(`Уровень ${TIER_NAMES[tier]}: у ${row.series} ${row.article} диапазон требует уточнения — по умолчанию стоит Blum AVENTOS HK-S; FLAP можно выбрать в поле «Подъёмник».`);
  const pair = kits === 2 ? ` (пара механизмов, у каждого — половина мощности фасада)` : '',
    load = selection.candidates.find((c) => c.liftId === row.id)!.loadValue,
    // (Д) Директора 2026-10-29: a front lighter than the least row keeps one mechanism, the supplier checks it.
    light = !selection.chosen && row.load.value !== null && load < row.load.value.min - EPS;
  if (light) return { tier, chosen, row, temporary: true, kits, selection, note: `${selection.reason}${pair} — мощность ниже диапазона, проверьте у поставщика.` };
  return { tier, chosen, row, temporary: !selection.chosen, kits, selection, note: selection.chosen ? null : `${selection.reason}${pair} — стоит временно, выберите другой уровень или измените фасад.` };
}

/** The type of the hinge in the words of the schemes of FLAP: C of «184 + B + C». */
const MOUNTING_SHIFT = (row: Lift, mounting: string | null) => (row.drilling?.hingeShift && mounting ? (row.drilling.hingeShift.byMountingMm[mounting as 'OVERLAY'] ?? null) : null);

/**
 * The plan of a front on hinges in the top lifted by FLAP: the hinges (flapHingePlan) with the lift beside them — the
 * row of the level, its checks, and its holes in the sides and the front by its kit. `holes` gets the holes of both.
 */
export function flapPlan(s: KitchenScene, m: Rec, g: Rec, parts: Rec[], holes: MechanismHole[], lift: KitchenLift): Rec {
  const row = lift.row!,
    plan = flapHingePlan(s, m, g, parts, holes),
    door: Rec = g.parts[0],
    id = `${m.id}/lift/${g.id}`,
    top = parts.find((p) => p.partId === m.id + ':top' && p.box?.length === 6),
    under = top ? top.box[2] : m.height - (m.panelThickness ?? 16),
    sides = { L: parts.find((p) => p.partId === m.id + ':side:L'), R: parts.find((p) => p.partId === m.id + ':side:R') },
    issues: string[] = [],
    missing: string[] = [],
    open: string[] = [],
    angle = liftWorkingAngle(row),
    dr = row.drilling;
  // The holes of the kit move by the plate B and the type C of the hinge where the scheme says so (FLAP AIR).
  let shift = 0;
  if (dr?.hingeShift) {
    const c = MOUNTING_SHIFT(row, plan.mounting);
    if (plan.plateHeightMm === null || c === null) missing.push(`${row.article}: высота планки B или тип петли C не известны — присадка механизма по набору при B = C = 0`);
    else shift = plan.plateHeightMm + c;
  }
  // One kit drills one side (FLAP AIR: one on the left, a pair on both, 3354) or both (FL123: a pair in one article).
  const kitSides = dr?.sides === 'BOTH' ? (['L', 'R'] as const) : (['L', 'R'] as const).slice(0, lift.kits);
  if (dr)
    for (const k of kitSides) {
      const side = sides[k];
      if (!side?.box || side.box.length !== 6) {
        missing.push(`${m.id}: нет боковины ${k === 'L' ? 'слева' : 'справа'} под механизм`);
        continue;
      }
      const inner = k === 'L' ? side.box[1] : side.box[0],
        inward = k === 'L' ? -1 : 1,
        common = { mechanismId: id, holeSource: 'KIT_FR3D' as const, holeSourceRef: `${dr.ref.doc}: ${dr.ref.page}`, completeness: 'COMPLETE' as const };
      for (const [j, o] of dr.holes.entries()) {
        const y = under - o.belowTopMm - shift,
          onSide = o.part === 'SIDE',
          part = onSide ? side : door,
          x = onSide ? inner : inner - inward * o.acrossMm,
          z = onSide ? side.box[4] + o.acrossMm : door.box[5];
        if (y < part.box[2] - EPS || y > part.box[3] + EPS || (!onSide && (x < door.box[0] - EPS || x > door.box[1] + EPS))) {
          missing.push(`${row.article}: отверстие ${o.part === 'SIDE' ? 'в боковине' : 'на фасаде'} ${fmt(o.belowTopMm + shift)} мм под верхней стенкой выходит за деталь`);
          continue;
        }
        holes.push(
          hole(s, m, {
            ...common,
            operationId: `${id}/${part.partId}/${k}/${o.marking ? 'mark' : 'hole'}/${j + 1}`,
            kind: `Подъёмник ${row.series}${o.marking ? ', разметка' : ''}`,
            partId: part.partId,
            machiningRole: o.marking ? 'LIFT_MARK' : 'LIFT_FIXING',
            diameter: o.diameterMm,
            depth: o.depthMm,
            localEntry: [x, y, z],
            localNormal: onSide ? [inward, 0, 0] : [0, 0, -1],
            station: j + 1,
          }),
        );
      }
    }
  else missing.push(`${row.article}: присадка механизма не задана в каталоге`);
  // The hinges open the front at least as far as the lift lifts it.
  const hingeAngle = plan.openingAngleDeg as number | null;
  if (angle.maxDeg !== null && hingeAngle !== null && hingeAngle < angle.maxDeg) issues.push(`Петля ${plan.hingeArticle} открывается на ${hingeAngle}°, механизм ${row.article} поднимает фасад на ${angle.maxDeg}°.`);
  const checks: LiftCheck[] = lift.selection!.candidates.find((c) => c.liftId === row.id)!.checks;
  for (const c of checks) if (c.status === 'UNKNOWN' && c.code !== 'DRILLING') open.push(c.text);
  if (lift.note && !lift.temporary) open.push(lift.note);
  if (dr?.status === 'DERIVED') open.push(`${row.article}: присадка по набору, отсчёт от верхней стенки выведен, а не напечатан на схеме — проверяет мебельщик (FINDINGS 3352)`);
  const article = row.articles[0]!;
  return {
    ...plan,
    flap: {
      mechanismId: id,
      liftId: row.id,
      tier: lift.tier,
      brand: row.brand,
      series: row.series,
      name: row.name,
      article: article.article,
      colour: article.colour,
      temporary: lift.temporary,
      quantity: dr?.sides === 'BOTH' ? 1 : lift.kits,
      kits: lift.kits,
      loadValue: lift.selection!.candidates.find((c) => c.liftId === row.id)!.loadValue,
      openingAngleDeg: angle.maxDeg,
      doorId: door.partId,
      sideIds: kitSides.map((k) => sides[k]?.partId).filter(Boolean),
      drilling: { status: dr?.status ?? null, completeness: missing.length ? 'INCOMPLETE' : 'COMPLETE', missing, shiftMm: shift },
      issues: [...(lift.temporary ? [lift.note!] : []), ...issues],
      open,
    },
  };
}
