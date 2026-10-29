// The hood over the hob (MOD-AI-44): a hob cabinet of a wall row and the cabinet of the hood over it are two modules,
// placed one by one; the kitchen says when the hood is too low over the hob or does not cover it. The rules are the
// Bosch sheet of the hood of the catalogue (DFM063W56B, p. 10 and 12): from the surface of an electric hob to the
// bottom of the hood at least 430 mm (650 over gas), and the hood not narrower than the hob. The prototype had the hob
// on the island alone and only a remark «Высота вытяжки» without numbers.
//
// The envelopes of the appliances are of the derived records (applianceEnvelopes, kap); a plan point is [x, z] of
// worldBox, a height is from the floor.
import type { Rec } from '../engine/policy/project-state.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { APPLIANCE_PROFILES } from './carcass.js';
import { isFree, worldBox, type KitchenScene } from './room.js';

const K = kitchen.constants;

/** A remark of the kitchen about a hood and a hob: its text and the modules it names. */
export interface HoodRemark {
  text: string;
  moduleIds: string[];
  /** A hood too low is a rule of safety: it blocks the readiness for production; the rest are advice. */
  blocks: boolean;
}

export interface Placed {
  module: Rec;
  box: number[];
  profile: Rec;
}

const label = (m: Rec) => `«${m.name}» (${m.id})`;
const mm = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** The envelopes of the appliances of a family in the room, with their modules and profiles. */
export function placed(s: KitchenScene, records: readonly { module: Rec; derived: Rec }[], family: string): Placed[] {
  return records.flatMap((r) =>
    (r.derived.applianceEnvelopes ?? [])
      .filter((e: Rec) => e.family === family && Array.isArray(e.box))
      // The user's hob (MOD-DEC-412) has no profile: it is gas or electric as the user said.
      .map((e: Rec) => ({ module: r.module, box: worldBox(s, r.module, e.box), profile: APPLIANCE_PROFILES[e.profileId] ?? { appliance: { gas: e.gas === true } } })),
  );
}

export const overlap = (a: number[], b: number[]) => a[0]! < b[1]! && b[0]! < a[1]! && a[4]! < b[5]! && b[4]! < a[5]!;
/** The hob lies within the hood along the wall of the hob (x of wall A, z of the side walls): the width of the Bosch sheet. */
const within = (hob: Placed, hood: Placed) => {
  const [a, b] = hob.module.wall === 'A' ? [0, 1] : [4, 5];
  return hob.box[a]! >= hood.box[a]! && hob.box[b]! <= hood.box[b]!;
};

/**
 * The remarks of the hoods over the hobs of a kitchen: a hood over a hob lower than its clearance (the bottom of the
 * hood cabinet it needs is named), a hood narrower than the hob or off it, a hob with the hood of the kitchen aside.
 */
export function hoodOverHobRemarks(s: KitchenScene, records: readonly { module: Rec; derived: Rec }[]): HoodRemark[] {
  const hobs = placed(s, records, 'hob'),
    hoods = placed(s, records, 'hood'),
    out: HoodRemark[] = [];
  for (const hob of hobs) {
    const over = hoods.filter((h) => overlap(h.box, hob.box) && h.box[2]! >= hob.box[3]!);
    for (const h of over) {
      const need = hob.profile.appliance?.gas ? K.hoodOverHob.value.gas : K.hoodOverHob.value.electric,
        gap = h.box[2]! - hob.box[3]!;
      if (gap < need)
        out.push({
          text: `Вытяжка ${label(h.module)} висит на ${mm(gap)} мм над варочной панелью ${label(hob.module)}, а нужно не меньше ${need} мм: поднимите шкаф вытяжки до низа ${mm(h.module.floor + need - gap)} мм от пола (по инструкции ${h.profile.model}).`,
          moduleIds: [h.module.id, hob.module.id],
          blocks: true,
        });
      if (!isFree(hob.module) && !within(hob, h))
        out.push({
          text: `Вытяжка ${label(h.module)} не закрывает варочную панель ${label(hob.module)}: вытяжка должна быть не уже панели и стоять над её серединой — сдвиньте шкаф вытяжки так, чтобы его середина была над серединой шкафа под варочную панель.`,
          moduleIds: [h.module.id, hob.module.id],
          blocks: false,
        });
    }
    // A hob of an island has no wall cabinet over it: its hood is of the ceiling, not of the catalogue.
    if (over.length || isFree(hob.module)) continue;
    const aside = hoods.filter((h) => !hobs.some((x) => overlap(h.box, x.box)));
    if (aside.length)
      out.push({
        text: `Над варочной панелью ${label(hob.module)} нет вытяжки: ${aside.map((h) => label(h.module)).join(', ')} ${aside.length > 1 ? 'стоят' : 'стоит'} в стороне. Поставьте шкаф вытяжки над шкафом под варочную панель, серединой над серединой.`,
        moduleIds: [hob.module.id, ...aside.map((h) => h.module.id)],
        blocks: false,
      });
  }
  return out;
}
