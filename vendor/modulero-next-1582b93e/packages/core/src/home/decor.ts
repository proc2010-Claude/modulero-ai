// r5 (MOD-DEC-741, MOD-AI-39 of the project «ИИ-диалог Modulero»; FINDINGS 3307): the carcass of other furniture in a
// decor of the shared catalogue of the release (catalogs/materials/decors.json, MOD-DEC-577), as the wardrobe's.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { MaterialCatalog } from '../catalog/materials.js';
import { mfDecor, mfLabel } from '../engine/policy/materials.js';
import { materials } from './catalog.js';
import type { HomeProject } from './types.js';

/** A decor of the catalogue for the carcass: its title, its group, the thicknesses of ЛДСП it is sold in (none known — []). */
export interface HomeDecorChoice {
  id: string;
  title: string;
  group: string;
  thicknesses: number[];
}

/** The thicknesses of ЛДСП of a decor of the catalogue, mm, ascending; [] when the catalogue gives no board of it. */
export function decorThicknesses(mc: MaterialCatalog, decorId: string): number[] {
  const d = mfDecor(decorId, mc);
  const ts = (d?.boardVariantsForImplementation ?? [])
    .filter((v: { product?: unknown }) => !String(v.product ?? '').includes('ЛМДФ'))
    .map((v: { thicknessMm: unknown }) => Number(v.thicknessMm))
    .filter((t: number) => t === 16 || t === 18);
  return [...new Set<number>(ts)].sort((a, b) => a - b);
}

/** Every decor of the catalogue for the carcass, in its order, grouped by brand as the wardrobe's «Материал корпуса». */
export function homeDecorChoices(hw: HardwareCatalogs): HomeDecorChoice[] {
  return hw.materials.decors.map((d) => {
    const thicknesses = decorThicknesses(hw.materials, d.decorId);
    return {
      id: String(d.decorId),
      title: `${String(mfLabel(d.decorId, hw.materials))} · ${thicknesses.length ? thicknesses.join(' или ') + ' мм' : 'толщина у изготовителя'}`,
      group: d.brand === 'UVADREV' ? 'Увадрев' : d.brand === 'EGGER' ? 'EGGER' : 'Lamarty',
      thicknesses,
    };
  });
}

/** The decor of the carcass of a project: a decor of the catalogue (r5) or one of the three materials of other furniture. */
export const carcassDecorId = (p: HomeProject): string => p.decorId ?? p.material;

/** Its name as the user reads it: «Чёрный», «Светлый дуб»; a key outside both stays as it is. */
export function carcassDecorName(key: string, mc?: MaterialCatalog): string {
  const own = materials.find((m) => m.id === key);
  if (own) return own.name.split(' · ')[0]!;
  const d = mc ? mfDecor(key, mc) : undefined;
  return d ? String(d.name) : key;
}
