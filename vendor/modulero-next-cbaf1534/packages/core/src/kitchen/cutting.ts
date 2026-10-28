// The cutting plan of the kitchen with the parameters of its project (R4-011 of the pilot, stage 4; FINDINGS 1904): the
// saw, the format of the sheet and the grain of every board the user enters on «Детали» → «Раскрой», kept by the project
// (KitchenProject.cutting) as the wardrobe keeps `state.cutting` (R2-019). The same plan and the same limits as the
// wardrobe's (`cuttingParamsProblem`): the map of «Раскрой» cuts with the parameters, the price over the estimate.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Graph } from '../engine/contract.js';
import type { CuttingLayouts, CuttingParams, CuttingPlan } from '../engine/cutting.js';
import { estimateCuttingParams, priceCuttingParams, wardrobeCuttingPlan } from '../wardrobe/cutting-plan.js';
import { cuttingParamsProblem } from '../wardrobe/input.js';
import type { KitchenEdit } from './editor.js';
import { kitchenProjectFromRecord, type JsonValue, type KitchenProject } from './project.js';

/** The parameters of the map the kitchen keeps; none — the defaults (MOD-DEC-445, the format of the catalogue). */
export const kitchenCuttingParams = (p: { cutting?: unknown }): CuttingParams => ({ kerfMm: null, trimMm: null, materials: {}, ...((p.cutting ?? {}) as Partial<CuttingParams>) });

/** The map of «Раскрой»: the plan of the graph with the parameters of the project. */
export function kitchenCuttingPlan(g: Graph, p: { cutting?: unknown }, hw: HardwareCatalogs, opts: { appVersion?: string } = {}): CuttingPlan {
  return wardrobeCuttingPlan(g, kitchenCuttingParams(p), hw, opts);
}

/** The temporary formats of the price estimate, for «Подставить временные форматы» (estimateCuttingParams). */
export const kitchenCuttingEstimate = (g: Graph, hw: HardwareCatalogs): CuttingParams => estimateCuttingParams(g, hw);

/**
 * The plan the price of the kitchen cuts with (MOD-DEC-510): the parameters of the project over the estimate — a board
 * without a format of the user keeps the one of the catalogue or of the estimate (`wardrobePriceCuttingPlan`, R2-019).
 */
export function kitchenPriceCuttingPlan(g: Graph, p: { cutting?: unknown }, hw: HardwareCatalogs): CuttingPlan {
  const layouts: CuttingLayouts = new Map(),
    own = kitchenCuttingParams(p);
  return wardrobeCuttingPlan(g, priceCuttingParams(estimateCuttingParams(g, hw, layouts, own), own), hw, { layouts });
}

/**
 * Sets the parameters of the map: an empty value is «не задано» and is not kept, nothing kept — no `cutting` in the
 * project; a value out of `CUTTING_INPUT_LIMITS` is refused with its words.
 */
export function setKitchenCutting(p: KitchenProject, params: CuttingParams): KitchenEdit {
  const materials = Object.fromEntries(
      Object.entries(params.materials ?? {}).flatMap(([key, m]) => {
        const row = {
          ...(m.sheetMm && (m.sheetMm[0] !== null || m.sheetMm[1] !== null) ? { sheetMm: [m.sheetMm[0], m.sheetMm[1]] } : {}),
          ...(m.respectGrain === undefined ? {} : { respectGrain: m.respectGrain }),
        };
        return Object.keys(row).length ? [[key, row]] : [];
      }),
    ),
    cutting: Record<string, JsonValue> = {
      ...(params.kerfMm === null ? {} : { kerfMm: params.kerfMm }),
      ...(params.trimMm === null ? {} : { trimMm: params.trimMm }),
      ...(Object.keys(materials).length ? { materials: materials as JsonValue } : {}),
    },
    why = cuttingParamsProblem(cutting);
  if (why) return { ok: false, problem: why };
  const { cutting: _, ...rest } = p;
  return { ok: true, project: kitchenProjectFromRecord(Object.keys(cutting).length ? { ...rest, cutting } : rest), notice: 'Параметры раскроя сохранены.' };
}

/** Why the parameters of a project's map cannot be kept, or null (a project of a file is checked on open). */
export const kitchenCuttingProblem = (p: { cutting?: unknown }): string | null => (p.cutting === undefined ? null : cuttingParamsProblem(p.cutting));
