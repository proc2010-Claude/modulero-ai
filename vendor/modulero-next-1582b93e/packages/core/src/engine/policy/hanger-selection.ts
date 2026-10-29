// Selection of the hanger of a wall cabinet (group 4 of the hardware of the release, FINDINGS 2750). Each level of the
// hardware has its hanger (MOD-DEC-413; the set is the Director's (Д) of 2026-10-29): «Эконом» — МДМ 806, «Стандарт» —
// BOYARD CH07 on the plates CHH01, «Премиум» — МДМ 801. The kitchen has no level of its own and takes «Стандарт»
// (223). The hanger of the level goes first unless a check rejects it, then the one of «Стандарт» with the warning of
// the substitution (465). What the catalogue does not give is UNKNOWN, never a pass: the holes of a hanger without the
// BAZIS kit (277) and the load of the cabinet, which the engine does not count — the pair is checked against it only
// when it is given. The prototype's Hettich SAH 216 is not chosen here: a saved module keeps it (FINDINGS 1863 pattern).
import type { FittingsCatalog, Hanger } from '../../catalog/hardware/fittings.js';
import { tierSubstitution, type HardwareTier, type TierSubstitution } from './hardware-tier.js';
import { constant, decision, type PolicyModule } from './types.js';

export const hangerSelection = {
  id: 'hanger-selection',
  version: '1',
  constants: {
    tierHangers: constant<Readonly<Record<HardwareTier, string>>>(
      { ECONOMY: 'MDM_806_K015', STANDARD: 'BOYARD_CH07', PREMIUM: 'MDM_801_K013' },
      'id',
      decision('MOD-DEC-413'),
      '(Д) Навес уровня по умолчанию (Директор 2026-10-29, FINDINGS 2750): Эконом — МДМ 806, Стандарт — BOYARD CH07 с планками CHH01, Премиум — МДМ 801',
    ),
    tierFallback: constant<HardwareTier>('STANDARD', 'tier', decision('MOD-DEC-465'), '(Д) Навеса уровня нет в каталоге или он не подходит — берётся навес «Стандарта», в «колокольчике» — что и почему заменено (465)'),
    defaultTier: constant<HardwareTier>('STANDARD', 'tier', decision('MOD-DEC-223'), 'Уровень не выбран — «Стандарт»: у кухни своего уровня нет'),
  },
} as const satisfies PolicyModule;

/** The cabinet as the selection sees it. */
export interface HangerDemand {
  sideThicknessMm: number;
  /** The cabinet with its contents, kg; null — not counted (the load is UNKNOWN). */
  loadKg: number | null;
}

export interface HangerCheck {
  code: 'SIDE' | 'LOAD' | 'DRILLING';
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  text: string;
}

export interface HangerSelection {
  tier: HardwareTier;
  /** The hanger taken; null — none in the catalogue fits. */
  chosen: Hanger | null;
  /** Checks of the hanger taken (of the level when none is taken). */
  checks: HangerCheck[];
  substitution: TierSubstitution | null;
}

const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** The checks of a hanger for a cabinet: the side, the load of the pair, the holes of the kit. */
export function hangerChecks(h: Hanger, d: HangerDemand): HangerCheck[] {
  const side = h.sideThicknessMinMm.value,
    load = h.loadKgPerPair.value;
  return [
    side === null
      ? { code: 'SIDE', status: 'UNKNOWN', text: `${h.id}: наименьшая толщина боковины не указана` }
      : { code: 'SIDE', status: d.sideThicknessMm >= side ? 'PASS' : 'FAIL', text: `боковина ${fmt(d.sideThicknessMm)} мм, навесу нужно от ${fmt(side)} мм` },
    load === null
      ? { code: 'LOAD', status: 'UNKNOWN', text: `${h.id}: нагрузка пары не указана` }
      : d.loadKg === null
        ? { code: 'LOAD', status: 'UNKNOWN', text: `пара держит ${fmt(load)} кг; масса шкафа с содержимым не посчитана — проверяет мебельщик` }
        : { code: 'LOAD', status: d.loadKg <= load ? 'PASS' : 'FAIL', text: `шкаф с содержимым ${fmt(d.loadKg)} кг, пара держит ${fmt(load)} кг` },
    h.sideHoles.value === null
      ? { code: 'DRILLING', status: 'UNKNOWN', text: `присадка ${h.brand} ${h.series} в боковине: набора БАЗИС нет в данных` }
      : { code: 'DRILLING', status: 'PASS', text: `присадка ${h.brand} ${h.series} — по набору БАЗИС` },
  ];
}

/** The hanger of a cabinet: of the level, else of «Стандарт» (465); a hanger with a failed check is not taken. */
export function selectHanger(d: HangerDemand, c: FittingsCatalog, tier: HardwareTier = hangerSelection.constants.defaultTier.value): HangerSelection {
  const K = hangerSelection.constants,
    want = K.tierHangers.value[tier],
    standard = K.tierHangers.value[K.tierFallback.value],
    of = (id: string) => c.hangers.find((x) => x.id === id) ?? null,
    fits = (h: Hanger | null) => !!h && hangerChecks(h, d).every((x) => x.status !== 'FAIL'),
    level = of(want),
    chosen = fits(level) ? level : fits(of(standard)) ? of(standard) : null,
    whyNot = !level
      ? 'нет в каталоге'
      : hangerChecks(level, d)
          .filter((x) => x.status === 'FAIL')
          .map((x) => x.text)
          .join('; ');
  return { tier, chosen, checks: chosen || level ? hangerChecks((chosen ?? level)!, d) : [], substitution: tierSubstitution(tier, [want], chosen?.id ?? null, [standard], whyNot) };
}
