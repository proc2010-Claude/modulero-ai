// The runner of a drawer of a new kitchen module (MOD-DEC-514 over 466; FINDINGS 1863): the selection of every product
// (engine/drawer-runner.ts), as the wardrobe (1862) and "other furniture" (1755) take it. The kitchen has no level of
// the hardware: «Стандарт» (223) — BOYARD B-Slide DB8781 with the box of its BAZIS kit instead of the TANDEM 560H of the
// prototype. A box is built on a concealed runner with the box of its kit only: the kitchen has no box of a ball
// runner. A module saved before 514 has no `drawerRunner` and keeps its TANDEM.
import type { DrawerSlide } from '../catalog/hardware/drawer-slides.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { concealedBoxWalls, concealedRunner, drawerMovingMassKg, pickDrawerRunner, type ConcealedRunnerNeed, type RunnerInfo } from '../engine/drawer-runner.js';
import { drawerSlideSelection, selectDrawerSlide } from '../engine/policy/drawer-slide-selection.js';
import { HOME, homeRulesR5 } from '../engine/policy/home.js';
import { kitchen } from '../engine/policy/kitchen.js';
import type { Rec } from '../engine/policy/project-state.js';
import { wardrobeFacades } from '../engine/policy/wardrobe-facades.js';

/** The drawers of the module are on the runner of the level (a new module of 514), not on the TANDEM of the prototype. */
export const levelRunner = (m: Rec): boolean => m.drawerRunner === 'level' && kitchen.constants.drawerRunnerRule.value === 'LEVEL_466';

/** The runner taken for the drawers of a stack and what it carries. */
export interface KitchenDrawerRunner {
  slide: DrawerSlide;
  n: RunnerInfo;
  /** What the pair carries: the front and the box by volume × density, the reserve of the hardware and the load (574). */
  massKg: number;
  /** Another runner than the level's, and why (465); null — the level's is taken. */
  substitution: string | null;
}

/**
 * The runner of a drawer by 466 (MOD-DEC-514): the runners of «Стандарт» first, then by the order of the selection; the
 * first whose box of the kit is built in the opening and that holds the drawer with its load — the front, the box of the
 * board (355), the reserve of the hardware and the load of a drawer of r5 (574), the numbers of the wardrobe and of
 * "other furniture". A string — no runner is built on: why.
 */
export function kitchenDrawerRunner(hw: HardwareCatalogs, need: ConcealedRunnerNeed & { frontVolumeMm3: number }): KitchenDrawerRunner | string {
  const tier = drawerSlideSelection.constants.defaultTier.value,
    density = wardrobeFacades.constants.boardDensity.value,
    { frontVolumeMm3, ...box } = need,
    volume = (w: { ext: number[] }) => w.ext.reduce((a, b) => a * b, 1),
    selection = selectDrawerSlide({ placement: 'EXTERNAL', openingWidthMm: box.openingWidthMm, insideDepthMm: box.insideDepthMm, boxSideThicknessMm: box.boardMm }, hw.drawerSlides, tier),
    taken = pickDrawerRunner(
      selection,
      hw.drawerSlides.slides,
      tier,
      (s) => s.kind === 'CONCEALED' && !!s.concealedBox?.value,
      (s) => {
        const n = concealedRunner(s, box);
        return { n, massKg: drawerMovingMassKg([frontVolumeMm3, ...concealedBoxWalls(n, 0, box.boardMm).map(volume)], density, HOME.drawerHardwareReserveKg, homeRulesR5.constants.drawerLoadKg.value) };
      },
    );
  if (!taken) return `Ящику нет направляющей скрытого монтажа с коробом набора в каталоге: проём ${box.openingWidthMm} мм, глубина ${box.insideDepthMm} мм`;
  return { slide: taken.slide, n: taken.n, massKg: taken.massKg, substitution: taken.substitution?.text ?? null };
}
