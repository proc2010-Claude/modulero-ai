// Cutting plan of the swing wardrobe (task CUT-1, MOD-DEC-430): the plan of the graph (engine/cutting.ts) with what
// the wardrobe knows and the graph does not hold — the format of the board of the chosen decor in the material
// catalogue. The kerf and the trim the user does not give are the owner's defaults (MOD-DEC-445); the format of a
// board without one in the catalogue has no default (430 (Д)): the map offers the user the formats of the price
// estimate (`estimateCuttingParams`); the price cuts with them (MOD-DEC-505, `wardrobePriceCuttingPlan`).
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { MaterialCatalog } from '../catalog/materials.js';
import type { Graph, Part } from '../engine/contract.js';
import { cuttingMaterialsOf, cuttingPlanOf, type CatalogFormat, type CuttingLayouts, type CuttingMaterialParams, type CuttingParams, type CuttingPlan } from '../engine/cutting.js';
import { mfDecor } from '../engine/policy/materials.js';
import type { Rec } from '../engine/policy/project-state.js';
import { wardrobePrice } from '../engine/policy/wardrobe-price.js';

/** The board of the decor of a part at its thickness in the material catalogue `mc` (files 52, 54 of r1): its format. */
export const wardrobeCatalogFormat =
  (mc: MaterialCatalog): CatalogFormat =>
  (p: Part) => {
    const v = mfDecor(p.material.decorId, mc)?.boardVariantsForImplementation?.find((b: Rec) => b.thicknessMm === p.material.panelThicknessMm);
    const f = v?.formatMm;
    return Array.isArray(f) && f.length === 2 && f.every((x: unknown) => typeof x === 'number' && x > 0) ? { sheetMm: [f[0], f[1]], ref: `каталог материалов: ${v.variantId}` } : null;
  };

/** The cutting plan of a wardrobe graph with the parameters of the user and the catalogue of the release. */
export function wardrobeCuttingPlan(g: Graph, params: CuttingParams, hw: HardwareCatalogs, opts: { appVersion?: string; layouts?: CuttingLayouts } = {}): CuttingPlan {
  return cuttingPlanOf(g, params, { catalog: wardrobeCatalogFormat(hw.materials), appVersion: opts.appVersion, layouts: opts.layouts });
}

/**
 * The sheet formats of the price estimate for the boards without a format in the catalogue (wardrobe-price: the
 * formats of the corpus board and of HDF — the prototype's numbers, temporary, FINDINGS 310). Of them the board gets
 * the one fewest of its blanks are larger than, then the one its plan takes the least sheet area of (a larger blank
 * counted as a whole sheet): the sheets of one board have one price per m², so it is the cheaper one; then the first.
 * The editor offers them to the user with that mark; they are not defaults (MOD-DEC-430 (Д)). The kerf and the trim
 * are left to the plan: its defaults are the owner's (MOD-DEC-445), the estimate cuts with the same (446, 505).
 * `layouts` — the layouts of this graph the plan of the price reuses (`CuttingLayouts`).
 */
export function estimateCuttingParams(g: Graph, hw: HardwareCatalogs, layouts?: CuttingLayouts, saw: CuttingParams = { kerfMm: null, trimMm: null }): CuttingParams {
  const C = wardrobePrice.constants,
    catalog = wardrobeCatalogFormat(hw.materials),
    materials: Record<string, { sheetMm: [number, number] }> = {};
  for (const m of cuttingMaterialsOf(g, catalog)) {
    if (m.catalogSheetMm) continue;
    let best: { sheetMm: [number, number]; large: number; area: number } | null = null;
    for (const f of m.family === 'HDF' ? C.hdfFormats.value : C.boardFormats.value) {
      const sheetMm: [number, number] = [f[0], f[1]],
        grain = saw.materials?.[m.key]?.respectGrain,
        group = cuttingPlanOf(g, { kerfMm: saw.kerfMm, trimMm: saw.trimMm, materials: { [m.key]: { sheetMm, ...(grain === undefined ? {} : { respectGrain: grain }) } } }, { catalog, layouts, fewestSheets: true }).groups.find((x) => x.material.key === m.key)!,
        area = (group.sheets.length + group.tooLarge.length) * f[0] * f[1],
        large = group.tooLarge.length;
      if (!best || large < best.large || (large === best.large && area < best.area)) best = { sheetMm, large, area };
    }
    materials[m.key] = { sheetMm: best!.sheetMm };
  }
  return { kerfMm: saw.kerfMm, trimMm: saw.trimMm, materials };
}

/** The parameters of the map the project keeps (`state.cutting`), read back from the request of the graph; none — {}. */
export function projectCuttingParams(g: Pick<Graph, 'assemblies'>): CuttingParams {
  const rq = g.assemblies.find((a) => a.kind === 'PRODUCT')?.request?.['state.cutting'];
  return rq === undefined ? { kerfMm: null, trimMm: null } : (JSON.parse(String(rq)) as CuttingParams);
}

/**
 * The cutting plan the price of the wardrobe cuts with (MOD-DEC-505): the plan of the map with its defaults — the saw
 * of MOD-DEC-445, the format of the catalogue, else the format of the price estimate its plan takes the least sheet
 * area of (`estimateCuttingParams`; temporary, FINDINGS 310).
 * The parameters the user changes on «Раскрой» are kept by the project (`state.cutting`) and go over them (R2-019).
 */
export function wardrobePriceCuttingPlan(g: Graph, hw: HardwareCatalogs): CuttingPlan {
  // The plan lays every board out with the format the estimate has laid it out with: once (MOD-DEC-244).
  const layouts: CuttingLayouts = new Map(),
    own = projectCuttingParams(g);
  return wardrobeCuttingPlan(g, priceCuttingParams(estimateCuttingParams(g, hw, layouts, own), own), hw, { layouts });
}

/**
 * The parameters of the plan of the price (R2-019, FINDINGS 1766): those the user entered on «Раскрой» and the project
 * keeps — the saw, a whole format of a board, the grain — over the estimate; a board without a format of the user
 * keeps the one of the catalogue or of the estimate. The map of «Раскрой» with all its formats is this plan.
 */
export function priceCuttingParams(estimate: CuttingParams, own: CuttingParams): CuttingParams {
  const materials: Record<string, CuttingMaterialParams> = { ...estimate.materials };
  for (const [key, m] of Object.entries(own.materials ?? {})) {
    const whole = !!(m.sheetMm?.[0] && m.sheetMm?.[1]);
    materials[key] = { ...materials[key], ...(whole ? { sheetMm: m.sheetMm } : {}), ...(m.respectGrain === undefined ? {} : { respectGrain: m.respectGrain }) };
  }
  return { kerfMm: own.kerfMm ?? null, trimMm: own.trimMm ?? null, materials };
}
