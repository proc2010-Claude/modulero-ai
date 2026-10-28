// Shared decor list (EGGER, UVADREV) for all furniture kinds: the decors of the material catalogue of the release
// (catalogs/materials/decors.json, MOD-DEC-577) as the choices and the 3D read them. Visual selection only: no decor is
// production-ready until an exact board/edge tuple and price are confirmed.
import type { MaterialCatalog } from './materials.js';

export interface Decor {
  id: string;
  brand: string;
  code: string;
  name: string;
  group: string;
  finish: string | null;
  swatch: string | null;
  productionReady: boolean;
  availability: string;
}

/** The decors of EGGER and Uvadrev of the catalogue in its order (the Lamarty boards have no code), with the file of the swatch (apps/web/public/decors). */
export function decorsOf(mc: MaterialCatalog): Decor[] {
  return mc.decors
    .filter((d) => !d.lamarty)
    .map((d) => ({
      id: d.decorId,
      brand: d.brand,
      code: d.code,
      name: d.name,
      group: d.group,
      finish: d.finish ?? null,
      swatch: typeof d.image?.swatch === 'string' ? d.image.swatch.split('/').pop() : null,
      productionReady: !!d.productionReady,
      availability: d.availabilityScope ?? 'UNKNOWN',
    }));
}

/**
 * The file of the swatch of a decor of the catalogue by its id, the Lamarty boards included (apps/web/public/decors):
 * the 3D draws a decor by it. The prototype draws Lamarty by its image as well (r1.html:9387, LAMARTY_ASSETS); without
 * it every Lamarty decor looked like the neutral board (R2-005, FINDINGS 1790).
 */
export function decorSwatchOf(mc: MaterialCatalog, decorId: string): string | null {
  const swatch = mc.decors.find((d) => d.decorId === decorId)?.image?.swatch;
  return typeof swatch === 'string' ? swatch.split('/').pop()! : null;
}
