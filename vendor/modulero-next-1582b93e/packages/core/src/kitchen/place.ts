// The place of a freestanding fridge or cooker (MOD-AI-60, MOD-DEC-752, FINDINGS 3190): a space in the row kept free
// for an appliance bought apart, as wide as the appliance and a gap on each side, as high as it and the gap over it.
// It has no parts, no worktop and no plinth; the appliance is not in the estimate. The prototype had no such module:
// a freestanding appliance was a gap the user measured by hand.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Rec } from '../engine/policy/project-state.js';
import { isPlace } from './carcass.js';
import { kitchenProjectOfScene, kitchenSceneOf, type KitchenEdit } from './editor.js';
import { validateKitchenModule } from './modules.js';
import type { KitchenProject } from './project.js';
import { jsonClone } from '../engine/json-clone.js';

const no = (problem: string): KitchenEdit => ({ ok: false, problem });

/** The appliance a place holds and its gaps, whole mm. */
export interface KitchenAppliancePlace {
  deviceWidthMm: number;
  deviceHeightMm: number;
  sideGapMm: number;
  topGapMm: number;
}

/** The appliance of the place `m` and its gaps: the place less its gaps. */
export function appliancePlaceOf(m: Rec): KitchenAppliancePlace {
  const g = m.placeGaps ?? { sideMm: 0, topMm: 0 };
  return { deviceWidthMm: m.width - 2 * g.sideMm, deviceHeightMm: m.height - g.topMm, sideGapMm: g.sideMm, topGapMm: g.topMm };
}

/** The fields of the panel «Наполнение» of a place (KitchenModuleField.key → the value of the place it sets). */
export const PLACE_FIELDS: Readonly<Record<string, [keyof KitchenAppliancePlace, string]>> = {
  placeDeviceWidth: ['deviceWidthMm', 'Ширина прибора, мм'],
  placeDeviceHeight: ['deviceHeightMm', 'Высота прибора, мм'],
  placeSideGap: ['sideGapMm', 'Зазор с каждой стороны, мм'],
  placeTopGap: ['topGapMm', 'Зазор сверху, мм'],
};

/**
 * The appliance and the gaps of the place `id` (MOD-DEC-752): the place takes the appliance's size with the gaps, its
 * left end stays where it is. The check of the module decides — the ranges of the appliance, the neighbours, the room.
 */
export function setKitchenAppliancePlace(p: KitchenProject, hw: HardwareCatalogs, id: string, patch: Partial<KitchenAppliancePlace>): KitchenEdit {
  const s = kitchenSceneOf(p, hw),
    m = s.modules.find((x) => x.id === id);
  if (!m) return no(`Нет модуля ${id}.`);
  if (!isPlace(m)) return no('Размер прибора и зазоры задаются у места под отдельно стоящий холодильник или плиту.');
  for (const [k, v] of Object.entries(patch)) if (!(typeof v === 'number' && Number.isFinite(v))) return no(`Поле «${k}» пусто или некорректно. Исходный проект сохранён.`);
  const a = { ...appliancePlaceOf(m), ...patch },
    next = { ...jsonClone(m), width: a.deviceWidthMm + 2 * a.sideGapMm, height: a.deviceHeightMm + a.topGapMm, placeGaps: { sideMm: a.sideGapMm, topMm: a.topGapMm } };
  const v = validateKitchenModule(s, next, m.id);
  if (!v.ok) return no('Изменение отклонено: ' + v.text + ' Исходный проект сохранён.');
  return {
    ok: true,
    project: kitchenProjectOfScene({ ...s, modules: s.modules.map((x) => (x.id === id ? next : x)) }),
    notice: `Место под технику: прибор ${a.deviceWidthMm} × ${a.deviceHeightMm} мм, зазоры ${a.sideGapMm} мм по бокам и ${a.topGapMm} мм сверху; место ${next.width} × ${next.height} мм.`,
    selected: id,
  };
}
