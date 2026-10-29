// The cutting plan of other furniture with the parameters of its project (R5-009 of the pilot, stage 5; FINDINGS 1969):
// the saw, the format of the sheet and the grain of every board the user enters on «Детали» → «Раскрой», kept by the
// project (HomeProject.cutting) as the wardrobe keeps `state.cutting` (R2-019) and the kitchen `cutting` (R4-011). The
// graph carries them in the request of its product, so the price, the package and the archive cut with them through
// `wardrobePriceCuttingPlan` as the wardrobe's do. The same plan and the same limits (`cuttingParamsProblem`).
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Graph } from '../engine/contract.js';
import type { CuttingParams, CuttingPlan } from '../engine/cutting.js';
import { estimateCuttingParams, wardrobeCuttingPlan } from '../wardrobe/cutting-plan.js';
import { cuttingParamsProblem } from '../wardrobe/input.js';
import { priceByPlan } from './catalog.js';
import type { HomeProject } from './types.js';

/** The parameters of the map the project keeps; none — the defaults (MOD-DEC-445, the format of the catalogue). */
export const homeCuttingParams = (p: Pick<HomeProject, 'cutting'>): CuttingParams => ({ kerfMm: null, trimMm: null, materials: {}, ...(p.cutting ?? {}) });

/** The map of «Раскрой»: the plan of the graph with the parameters of the project. */
export function homeCuttingMap(g: Graph, p: Pick<HomeProject, 'cutting'>, hw: HardwareCatalogs, opts: { appVersion?: string } = {}): CuttingPlan {
  return wardrobeCuttingPlan(g, homeCuttingParams(p), hw, opts);
}

/** The temporary formats of the price estimate, for «Подставить временные форматы» (estimateCuttingParams). */
export const homeCuttingEstimate = (g: Graph, hw: HardwareCatalogs): CuttingParams => estimateCuttingParams(g, hw);

/** Why the parameters of a project's map cannot be kept, or null: only a project priced by the plan has a map (510). */
export function homeCuttingProblem(p: Pick<HomeProject, 'cutting' | 'generatorVersion'>): string | null {
  if (p.cutting === undefined) return null;
  if (!priceByPlan(p)) return 'Параметры раскроя есть только у конструкции r4 и r5: цена r3 считается без карты раскроя.';
  return cuttingParamsProblem(p.cutting);
}

/**
 * Sets the parameters of the map: an empty value is «не задано» and is not kept, nothing kept — no `cutting` in the
 * project; a value out of `CUTTING_INPUT_LIMITS` is refused with its words. Changes the project, as the edits of the
 * home editor do (`transact` keeps the one before).
 */
export function setHomeCutting(p: HomeProject, params: CuttingParams): void {
  const materials = Object.fromEntries(
      Object.entries(params.materials ?? {}).flatMap(([key, m]) => {
        const row = {
          ...(m.sheetMm && (m.sheetMm[0] !== null || m.sheetMm[1] !== null) ? { sheetMm: [m.sheetMm[0], m.sheetMm[1]] as [number | null, number | null] } : {}),
          ...(m.respectGrain === undefined ? {} : { respectGrain: m.respectGrain }),
        };
        return Object.keys(row).length ? [[key, row]] : [];
      }),
    ),
    cutting: Partial<CuttingParams> = {
      ...(params.kerfMm === null ? {} : { kerfMm: params.kerfMm }),
      ...(params.trimMm === null ? {} : { trimMm: params.trimMm }),
      ...(Object.keys(materials).length ? { materials } : {}),
    },
    why = cuttingParamsProblem(cutting);
  if (why) throw Error(why);
  if (Object.keys(cutting).length) p.cutting = cutting;
  else delete p.cutting;
}
