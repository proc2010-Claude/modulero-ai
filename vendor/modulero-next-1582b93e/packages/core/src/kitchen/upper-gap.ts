// The wall cabinets over the worktop (MOD-AI-62, MOD-DEC-749): the bottom of a wall cabinet stands at least 450 mm over
// the top of the worktop under it, the working zone of the kitchen; closer is a remark with the bottom it needs. The
// prototype had no such check: a wall cabinet 80 mm over the worktop was accepted without a word. A hood over a hob is
// left to its own rule of the Bosch sheet (hood.ts).
//
// Heights are from the floor; a plan rectangle is [x, z] of worldBox.
import type { Rec } from '../engine/policy/project-state.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { allParts } from './derived.js';
import { overlap, placed } from './hood.js';
import { isFree, worldBox, type KitchenScene } from './room.js';

const K = kitchen.constants;

/** A remark of a wall cabinet too low over the worktop: its text and the modules it names. */
export interface UpperGapRemark {
  text: string;
  moduleIds: string[];
}

const label = (m: Rec) => `«${m.name}» (${m.id})`;
const mm = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** The wall cabinets whose bottom is closer than `upperOverWorktop` to the top of a worktop under them. */
export function upperGapRemarks(s: KitchenScene, records: readonly { module: Rec; derived: Rec }[]): UpperGapRemark[] {
  const byId = new Map(s.modules.map((m) => [m.id, m])),
    tops = allParts(s)
      .filter((p) => p.materialRole === 'WORKTOP' && Array.isArray(p.box) && byId.has(p.moduleId))
      .map((p) => ({ module: byId.get(p.moduleId)!, box: worldBox(s, byId.get(p.moduleId)!, p.box) })),
    hobs = placed(s, records, 'hob'),
    hoods = placed(s, records, 'hood'),
    need = K.upperOverWorktop.value,
    out: UpperGapRemark[] = [];
  for (const u of s.modules) {
    if (u.kind !== 'upper' || isFree(u) || !Number.isFinite(u.floor)) continue;
    // A hood over a hob: the clearance of the Bosch sheet is the rule (HOOD_OVER_HOB).
    if (hoods.some((h) => h.module.id === u.id && hobs.some((b) => overlap(h.box, b.box)))) continue;
    const box = worldBox(s, u, [0, u.width, 0, u.height, 0, u.depth]),
      under = tops.filter((t) => overlap(t.box, box) && t.box[3]! <= u.floor + 1e-6);
    if (!under.length) continue;
    const top = Math.max(...under.map((t) => t.box[3]!)),
      gap = u.floor - top;
    if (gap >= need) continue;
    // The worktop of a run is a part of its first module: the words name the modules under the wall cabinet.
    const below = s.modules.filter((m) => m.id !== u.id && !isFree(m) && ['base', 'niche', 'filler'].includes(m.kind) && overlap(worldBox(s, m, [0, m.width, 0, m.height, 0, m.depth]), box));
    out.push({
      text: `Низ навесного шкафа ${label(u)} — на ${mm(gap)} мм над столешницей${below.length ? ' (под ним ' + below.map(label).join(', ') + ')' : ''}, а для работы нужно не меньше ${need} мм: поднимите низ шкафа до ${mm(top + need)} мм от пола.`,
      moduleIds: [u.id, ...below.map((m) => m.id)],
    });
  }
  return out;
}
