// The overhang of the worktop of an island for the stools (MOD-AI-61, FINDINGS 3170): the worktop of a free island
// row goes past the back of its carcasses, the depth of the worktops along the walls stays as it is. The prototype had
// one depth of the worktop for the whole kitchen (kitchenOptions.worktopDepthMm), so a bar side changed every row.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Rec } from '../engine/policy/project-state.js';
import { kitchenProjectOfScene, kitchenSceneError, kitchenSceneOf, type KitchenEdit } from './editor.js';
import type { KitchenProject } from './project.js';
import { bodyDepth, isFree, worldBox, type KitchenScene } from './room.js';
import { wholeWorktops } from './worktops.js';
import { kitchen } from '../engine/policy/kitchen.js';

const no = (problem: string): KitchenEdit => ({ ok: false, problem });

/**
 * The overhang of the worktop of the island row of the module `id` over its back, whole mm (MOD-AI-61, FINDINGS 3170):
 * every module under the same worktop takes it, so the row keeps one worktop. 0 takes it away. The worktop stays inside
 * the room and off the other worktops (the topology of the worktops, K4).
 */
export function setKitchenIslandOverhang(p: KitchenProject, hw: HardwareCatalogs, id: string, overhangMm: number): KitchenEdit {
  const s = kitchenSceneOf(p, hw),
    m = s.modules.find((x) => x.id === id),
    max = kitchen.constants.islandSeatOverhangMax.value;
  if (!m) return no(`Нет модуля ${id}.`);
  if (!isFree(m) || m.kind !== 'island') return no('Выступ столешницы под стулья задаётся у островного модуля; глубину столешницы у стен меняет «Глубина столешницы» в «Материалах и опциях».');
  if (m.pairId) return no('У пары спина к спине общая столешница над сервисным зазором; выступ под стулья задаётся у одиночного островного ряда.');
  if (!Number.isInteger(overhangMm) || overhangMm < 0 || overhangMm > max)
    return no(`Выступ столешницы под стулья: целое число от 0 до ${max} мм (MOD-DEC-745: дальше без опоры столешница не держится). Исходный проект сохранён.`);
  const row = new Set<string>(wholeWorktops(s).find((t) => (t.supportingModuleIds as string[] | undefined)?.includes(id))?.supportingModuleIds ?? [id]),
    next = { ...s, modules: s.modules.map((x) => (row.has(x.id) ? withOverhang(x, overhangMm) : x)) } as KitchenScene;
  for (const x of next.modules.filter((y) => row.has(y.id))) {
    const b = worldBox(next, x, [0, x.width, 0, 0, 0, bodyDepth(x) + overhangMm]);
    if (b[0] < 0 || b[4] < 0 || b[1] > s.room.width || b[5] > s.room.depth) return no(`Столешница с выступом ${overhangMm} мм выходит за стены помещения у «${x.name}» (${x.id}). Сдвиньте остров или уменьшите выступ. Исходный проект сохранён.`);
  }
  const error = kitchenSceneError(next);
  if (error) return no('Выступ столешницы отклонён: ' + error + ' Исходный проект сохранён.');
  return {
    ok: true,
    project: kitchenProjectOfScene(next),
    notice: overhangMm ? `Столешница острова выступает за корпуса на ${overhangMm} мм под стулья (${[...row].join(', ')}).` : `Выступ столешницы острова убран (${[...row].join(', ')}).`,
    selected: id,
  };
}

function withOverhang(m: Rec, mm: number): Rec {
  const { worktopSeatOverhangMm: _, ...rest } = m;
  return mm ? { ...rest, worktopSeatOverhangMm: mm } : rest;
}
