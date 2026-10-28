// Assembled drawers of the catalogue (MOD-DEC-544, R2-007; FINDINGS 1856–1860): a kit of the manufacturer — runners
// with metal sides, the holders of the back and the fixings of the front — takes a bottom and a back of board, and
// the facade (or the inner front of a drawer behind a door) is its front. It is a drawer type of its own: no box of the
// maker's board is built for it, no HDF bottom in a groove (574) and no inner front wall of an external drawer
// (WR-20) — FINDINGS 1877. The series of a level of the hardware (466) and how a member and a length are taken are
// here; the numbers are the catalogue's (catalogs/hardware/drawer-systems.json). Pure functions: the wardrobe calls
// them, the kitchen and HOME may call them the same way.
import type { DrawerSystem, DrawerSystemArticle, DrawerSystemCatalog, DrawerSystemLength } from '../../catalog/hardware/drawer-systems.js';
import type { HardwareTier } from './hardware-tier.js';
import { constant, decision, type PolicyModule } from './types.js';

export type DrawerSystemSeriesId = 'BOYARD_START_SOFT' | 'BLUM_TANDEMBOX_ANTARO_M' | 'BLUM_LEGRABOX_PURE_M';

/** A series the user chooses: its members in the catalogue (heights of one series), the level it stands for. */
export interface DrawerSystemSeries {
  id: DrawerSystemSeriesId;
  title: string;
  tier: HardwareTier;
  systems: readonly string[];
}

/** What the project asks: a series, the series of the level of the hardware ('TIER'), or none — the own box. */
export type DrawerSystemChoice = DrawerSystemSeriesId | 'TIER' | null;

export const drawerSystemSelection = {
  id: 'drawer-system-selection',
  version: '1',
  constants: {
    series: constant<readonly DrawerSystemSeries[]>(
      [
        { id: 'BOYARD_START_SOFT', title: 'BOYARD СТАРТ SOFT', tier: 'ECONOMY', systems: ['BOYARD_SB18', 'BOYARD_SB19', 'BOYARD_SB20'] },
        { id: 'BLUM_TANDEMBOX_ANTARO_M', title: 'Blum TANDEMBOX antaro M', tier: 'STANDARD', systems: ['BLUM_TANDEMBOX_ANTARO_M'] },
        { id: 'BLUM_LEGRABOX_PURE_M', title: 'Blum LEGRABOX pure M', tier: 'PREMIUM', systems: ['BLUM_LEGRABOX_PURE_M'] },
      ],
      'id',
      decision('MOD-DEC-544'),
      '(Д) FINDINGS 1876: серии по уровням 466 — Эконом BOYARD СТАРТ SOFT, Стандарт Blum TANDEMBOX antaro M, Премиум Blum LEGRABOX pure M; других комплектов с ценой в прайсах владельца нет',
    ),
    defaultTier: constant<HardwareTier>('STANDARD', 'tier', decision('MOD-DEC-223'), 'Уровень не выбран — «Стандарт», как у полкодержателей и направляющих'),
    frontHoleFromKit: constant(
      true,
      'flag',
      decision('MOD-DEC-277'),
      '(Д) FINDINGS 1874: отверстие крепления фасада BOYARD — Ø5 × 2 набора БАЗИС, а не «Ø2, h12» каталога: набор артикула раньше каталога',
    ),
    noOtherArticleDrilling: constant(true, 'flag', decision('MOD-DEC-205'), '(Д) FINDINGS 1879: отверстия, которых Blum не печатает, не подставляются из BOYARD — их нет, присадка «неполная»'),
    ownBoxWhenNoFit: constant(
      true,
      'flag',
      decision('MOD-DEC-544'),
      '(Д) Ящику, которому не подходит ни одна высота или длина серии, строится свой короб, как без выбора; в «колокольчике» — почему',
    ),
  },
} as const satisfies PolicyModule;

const fmt = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', ',');

/** The series a choice names; 'TIER' — the series of the level (466), the level not chosen is «Стандарт» (223). */
export function drawerSystemSeriesOf(choice: DrawerSystemChoice | undefined, tier: HardwareTier | null | undefined): DrawerSystemSeries | null {
  if (!choice) return null;
  const all = drawerSystemSelection.constants.series.value,
    level = tier ?? drawerSystemSelection.constants.defaultTier.value;
  return all.find((s) => (choice === 'TIER' ? s.tier === level : s.id === choice)) ?? null;
}

/** A kit taken for one drawer: the member of the series, its length and the article (the first colour of the catalogue (Д)). */
export interface DrawerKit {
  system: DrawerSystem;
  length: DrawerSystemLength;
  article: DrawerSystemArticle;
}

/**
 * The kit of a series for a drawer of height `heightMm` (the place of the drawer, from the underside of the runner)
 * and inside depth `depthMm` (from the plane of the front to the back): the tallest member not higher than the place
 * (Д), the longest length whose smallest depth fits. A reason instead when none fits.
 */
export function pickDrawerKit(series: DrawerSystemSeries, catalog: DrawerSystemCatalog, need: { heightMm: number; depthMm: number }): DrawerKit | { reason: string } {
  const members = series.systems.map((id) => catalog.systems.find((s) => s.id === id)).filter((s): s is DrawerSystem => !!s),
    fit = members.filter((s) => (s.boxHeightMm.value ?? Infinity) <= need.heightMm).sort((a, b) => b.boxHeightMm.value! - a.boxHeightMm.value!)[0];
  if (!members.length) return { reason: `${series.title}: серии нет в каталоге фурнитуры` };
  if (!fit) return { reason: `${series.title}: ящик высотой ${fmt(need.heightMm)} мм ниже самого низкого комплекта (${fmt(Math.min(...members.map((s) => s.boxHeightMm.value ?? Infinity)))} мм)` };
  const length = [...fit.lengths].reverse().find((l) => (l.minInsideDepthMm.value ?? l.nominalMm) <= need.depthMm);
  if (!length) return { reason: `${fit.brand} ${fit.article}: глубина ${fmt(need.depthMm)} мм меньше наименьшей длины NL ${fit.lengths[0]!.nominalMm}` };
  return { system: fit, length, article: length.articles[0]! };
}

/** A board of the kit's box in the plane of the drawer: across from the middle of the opening, up from the runner, back from the front. */
export interface DrawerKitBoard {
  lengthMm: number;
  heightMm: number;
  thicknessMm: number;
  /** Lower face over the underside of the runner. */
  y0: number;
  /** Front face behind the plane of the front (the inner face of the facade). */
  z0: number;
}

/** The boards of a kit for an opening `widthMm` (LW) and what its drilling lacks. */
export interface DrawerKitBoxes {
  bottom: DrawerKitBoard;
  back: DrawerKitBoard;
  /** Rear face of the back: from the catalogue, or (Д) the rear edge of the bottom it stands on (LEGRABOX, FINDINGS 1879). */
  backRearBasis: 'CATALOGUE' | 'BOTTOM_EDGE';
  /** What the catalogue does not give for the holes (MOD-DEC-205: not substituted): «присадка неполная». */
  missing: string[];
}

export function drawerKitBoxes(kit: DrawerKit, widthMm: number): DrawerKitBoxes {
  const s = kit.system,
    nl = kit.length.nominalMm,
    b = s.bottom,
    k = s.back,
    bottom: DrawerKitBoard = { lengthMm: widthMm - b.widthDeductionMm.value!, heightMm: nl - b.lengthDeductionMm.value!, thicknessMm: b.thicknessMm.value!, y0: b.undersideMm.value!, z0: 0 },
    // A back standing on the bottom (its lower edge at the top of the bottom) without a printed place: flush with the
    // rear edge of the bottom it stands on (Д, FINDINGS 1879).
    rear = k.rearDeductionMm.value !== null ? nl - k.rearDeductionMm.value : nl - b.lengthDeductionMm.value!,
    back: DrawerKitBoard = { lengthMm: widthMm - k.widthDeductionMm.value!, heightMm: k.heightMm.value!, thicknessMm: k.thicknessMm.value!, y0: k.lowerEdgeMm.value!, z0: rear - k.thicknessMm.value! },
    missing: string[] = [],
    lack = (what: string, x: { value: unknown }) => {
      if (x.value === null) missing.push(`${s.brand} ${s.article}: ${what}`);
    };
  lack('диаметр отверстий направляющей в боковине', s.carcassFixing.diameterMm);
  lack('глубина отверстий направляющей в боковине', s.carcassFixing.depthMm);
  lack(`отверстия направляющей NL ${nl}`, kit.length.carcassHolesFromFrontMm);
  lack('диаметр отверстий держателей задней стенки', k.holes.diameterMm);
  lack('глубина отверстий держателей задней стенки', k.holes.depthMm);
  lack('диаметр отверстий крепления фасада', s.frontHoles.diameterMm);
  lack('глубина отверстий крепления фасада', s.frontHoles.depthMm);
  return { bottom, back, backRearBasis: k.rearDeductionMm.value !== null ? 'CATALOGUE' : 'BOTTOM_EDGE', missing };
}
