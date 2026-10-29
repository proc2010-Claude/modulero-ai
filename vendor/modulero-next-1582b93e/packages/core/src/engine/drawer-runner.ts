// The runner of a drawer and its box, for every product (MOD-DEC-514 over 466; FINDINGS 1750, 1755): the runner of
// the level of the hardware taken among the runners a box is built on and that hold the drawer with its load
// (`pickDrawerRunner`), the box of the BAZIS kit of a concealed runner (`concealedRunner`, `concealedBoxWalls`) and what
// the pair of runners carries (`drawerMovingMassKg`). Written for "other furniture" (home/mechanisms.ts), taken out
// here so that the wardrobe calls the same functions (Director, (Д) 514). Pure functions: the product gives the opening,
// the depth, the height of the box and the plane of its front; the numbers of the runner are the catalogue's.
import { catalogSource } from '../catalog/hardware/types.js';
import type { DrawerSlide } from '../catalog/hardware/drawer-slides.js';
import type { HardwareTier } from '../catalog/hardware/shelf-supports.js';
import { drawerSlideSelection, type DrawerSlideSelection } from './policy/drawer-slide-selection.js';
import { tierSubstitution, type TierSubstitution } from './policy/hardware-tier.js';

/** The runner of a drawer and the box it defines. */
export interface RunnerInfo {
  NL: number;
  sku: string;
  sideGap: number;
  boxW: number;
  boxY: number;
  boxTop: number;
  boxH: number;
  /** Length of the box sides. */
  boxD: number;
  loadKg: number;
  /** Height of the runner profile; null — the catalogue does not print it (B-Slide). */
  height: number | null;
  /** Ball runner: the screws from the front edge of the carcass; concealed: the holes of the kit from the front of the runner. */
  cabinetMountZ: number[];
  drawerMountZ: number[];
  mountBasis: string;
  /** A concealed runner and the box of its kit (FINDINGS 1750); absent — a ball runner and the box of the prototype. */
  concealed?: ConcealedRunner;
  /** A ball runner of the level drilled by its BAZIS kit (DB4501 of «Эконом», FINDINGS 2746); absent — no kit. */
  kitHoles?: BallRunnerKitHoles;
}

/**
 * The holes of a ball runner by its BAZIS kit (FINDINGS 2746): the runner from the front of the box sides, on its axis
 * above their lower edge; holes in the side panel and in the outer face of each box side, from the front of the runner.
 */
export interface BallRunnerKitHoles {
  axisAboveBoxMm: number;
  carcassFromFrontMm: number[];
  boxFromFrontMm: number[];
  diameterMm: number;
  depthMm: number;
  /** «Набор БАЗИС, страница»: the reference of the holes. */
  holeRef: string;
}

/** A concealed runner and the box of its BAZIS kit. */
export interface ConcealedRunner {
  /** The runner of the catalogue (catalogs/hardware/drawer-slides.json). */
  slideId: string;
  /** The front of the runner and of the box sides from the face of the fronts: the inner face of the overlay front. */
  frontMm: number;
  bottomRecessMm: number;
  bottomThicknessMm: number;
  rearHook: { diameterMm: number; depthMm: number; fromSideMm: number; aboveBottomMm: number };
  /** The holes of the runner in the side panel: above the underside of the bottom, Ø × depth. */
  carcassHoleAboveBottomMm: number;
  carcassHoleDiameterMm: number;
  carcassHoleDepthMm: number;
  /** «Набор БАЗИС, страница»: the reference of the holes. */
  holeRef: string;
}

/** What a product gives for the box of a concealed runner. */
export interface ConcealedRunnerNeed {
  /** The opening between the side panels (or their spacers) the runners are screwed to: LW. */
  openingWidthMm: number;
  /** The depth behind the fronts the runner may take. */
  insideDepthMm: number;
  /** The board of the box. */
  boardMm: number;
  /** The underside and the top of the box sides, in the product's height. */
  boxY: number;
  boxTop: number;
  /** The front of the box sides from the face of the fronts. */
  frontMm: number;
}

/** A box is built on the ball runner of the product (`ballSlideId`) and on a concealed runner with the box of its kit. */
export const buildableRunner = (s: DrawerSlide, ballSlideId: string): boolean => s.id === ballSlideId || (s.kind === 'CONCEALED' && !!s.concealedBox?.value);

const slideName = (s: DrawerSlide): string => `${s.brand} ${s.series}`;
const kg = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/**
 * The holes of a ball runner of length `nominalMm` by its BAZIS kit (277; FINDINGS 2746) — taken for the runner of the
 * level only (Д Директора: «Эконом» of a new project and of r5; the prototype, saved projects, r3 and r4 keep theirs);
 * null — the catalogue has no kit of the runner on a box or not of this length.
 */
export function ballRunnerKitHoles(slide: DrawerSlide, nominalMm: number): BallRunnerKitHoles | null {
  const axis = slide.runnerAxisAboveBoxMm?.value,
    f = slide.carcassFixing,
    l = slide.lengths.find((x) => x.nominalMm === nominalMm),
    carcass = l?.carcassHolesFromFrontMm.value,
    box = l?.boxHolesFromFrontMm?.value;
  if (slide.kind !== 'BALL_BEARING' || axis === undefined || axis === null || f.heightMm.value === null || f.diameterMm.value === null || f.depthMm.value === null || !l || !carcass || !box) return null;
  return {
    axisAboveBoxMm: axis + f.heightMm.value,
    carcassFromFrontMm: carcass,
    boxFromFrontMm: box,
    diameterMm: f.diameterMm.value,
    depthMm: f.depthMm.value,
    holeRef: (catalogSource(l.carcassHolesFromFrontMm.ref ?? slide.ref) as { ref: string }).ref,
  };
}

/** The runner taken for one drawer (466) and why it is that one. */
export interface PickedDrawerRunner<N> {
  slide: DrawerSlide;
  n: N;
  massKg: number;
  /** The runner of the level is not taken: why and what instead (465); null — it is taken. */
  substitution: TierSubstitution | null;
}

/**
 * The runner of one drawer by 466 (MOD-DEC-514; FINDINGS 1755): `selection` (selectDrawerSlide) orders the runners of
 * the catalogue — of the level of the hardware, of «Стандарт», then by its order. The first not rejected that a box is
 * built on (`buildable`) and that `build` builds and that holds the drawer with its load is taken; none holds it — the
 * first built on, and the product says the drawer is overloaded. null — no runner is built on. Another runner than
 * the level's is said (465).
 */
export function pickDrawerRunner<N extends { loadKg: number; sku: string }>(
  selection: DrawerSlideSelection,
  slides: readonly DrawerSlide[],
  tier: HardwareTier,
  buildable: (s: DrawerSlide) => boolean,
  build: (s: DrawerSlide) => { n: N; massKg: number },
): PickedDrawerRunner<N> | null {
  const K = drawerSlideSelection.constants,
    byId = (id: string) => slides.find((s) => s.id === id),
    tried: { slide: DrawerSlide; n: N; massKg: number }[] = [],
    refused = new Map<string, string>();
  for (const c of selection.candidates) {
    const s = byId(c.slideId)!;
    if (c.status === 'REJECTED') continue;
    if (!buildable(s)) {
      refused.set(s.id, 'нет набора короба в каталоге');
      continue;
    }
    let built: { n: N; massKg: number };
    try {
      built = build(s);
    } catch (e) {
      refused.set(s.id, (e as Error).message.replace(/\.$/, '').toLowerCase());
      continue;
    }
    tried.push({ slide: s, ...built });
    if (built.massKg <= built.n.loadKg) break;
  }
  const taken = tried.find((x) => x.massKg <= x.n.loadKg) ?? tried[0];
  if (!taken) return null;
  const want = byId(K.tierSlides.value[tier]),
    standard = byId(K.tierSlides.value[K.tierFallback.value]),
    own = want && selection.candidates.find((x) => x.slideId === want.id),
    heavy = want && tried.find((x) => x.slide.id === want.id),
    whyNot = !want
      ? 'нет в каталоге'
      : heavy
        ? `ящик с грузом ${kg(heavy.massKg)} кг, пара ${heavy.n.sku} держит ${kg(heavy.n.loadKg)} кг`
        : (refused.get(want.id) ?? `не подходит: ${own?.checks.filter((k) => k.status === 'FAIL').map((k) => k.text).join('; ')}`);
  return {
    ...taken,
    substitution: tierSubstitution(tier, [want ? slideName(want) : K.tierSlides.value[tier]], slideName(taken.slide), standard ? [slideName(standard)] : [], whyNot),
  };
}

/**
 * A concealed runner and the box of its BAZIS kit (FINDINGS 1750): the longest NL whose smallest depth (NL + 3 of
 * B-Slide) the depth behind the fronts takes; the box sides NL − 10 long from the plane of the front — the kit hangs the
 * front on their ends, the runner begins with them — the width between them the opening less the deduction of the
 * catalogue (SKW = LW − 42), the box of the board of the box. The holes of the runner in the side panel come from the
 * kit, counted from the front of the runner (277).
 */
export function concealedRunner(slide: DrawerSlide, need: ConcealedRunnerNeed): RunnerInfo {
  const kit = slide.concealedBox?.value,
    width = slide.boxWidth.value,
    deduction = slide.boxLengthDeductionMm.value,
    fixing = slide.carcassFixing,
    k = need.boardMm,
    sides = slide.boxSideThicknessMm.value;
  if (!kit || !width || width.kind !== 'INNER' || deduction === null)
    throw new Error(`У направляющей ${slide.id} в каталоге нет короба набора, правила ширины или длины короба`);
  if (fixing.heightRef !== 'BOX_BOTTOM_UNDERSIDE' || fixing.heightMm.value === null || fixing.diameterMm.value === null || fixing.depthMm.value === null)
    throw new Error(`У направляющей ${slide.id} в каталоге нет отверстий крепления к боковине`);
  if (sides && (k < sides.minMm || k > sides.maxMm)) throw new Error(`Направляющая ${slide.id} не берёт боковину короба ${k} мм`);
  const length = [...slide.lengths].reverse().find((l) => (l.minInsideDepthMm.value ?? l.nominalMm) <= need.insideDepthMm);
  if (!length) throw Error(`Ящику нужна глубина для направляющей ${slide.article} не менее ${slide.lengths[0]!.minInsideDepthMm.value ?? slide.lengths[0]!.nominalMm} мм.`);
  const holes = length.carcassHolesFromFrontMm.value;
  if (length.loadKg.value === null || !length.article || !holes)
    throw new Error(`У направляющей ${slide.id} длины ${length.nominalMm} мм в каталоге нет артикула, нагрузки или отверстий`);
  // The inner width is the opening less the deduction, the sides of the box board stand on the runner.
  const sideGap = (width.deductionMm - 2 * k) / 2;
  return {
    NL: length.nominalMm,
    sku: length.article,
    sideGap,
    boxW: need.openingWidthMm - 2 * sideGap,
    boxY: need.boxY,
    boxTop: need.boxTop,
    boxH: need.boxTop - need.boxY,
    boxD: length.nominalMm - deduction,
    loadKg: length.loadKg.value,
    height: slide.profileHeightMm.value,
    cabinetMountZ: holes,
    drawerMountZ: [],
    mountBasis: 'Отверстия набора БАЗИС направляющей в боковине корпуса от переднего края направляющей; короб держат фиксаторы под дном и крючки в задней стенке.',
    concealed: {
      slideId: slide.id,
      frontMm: need.frontMm,
      bottomRecessMm: kit.bottomRecessMm,
      bottomThicknessMm: kit.bottomThicknessMm,
      rearHook: kit.rearHook,
      carcassHoleAboveBottomMm: fixing.heightMm.value,
      carcassHoleDiameterMm: fixing.diameterMm.value,
      carcassHoleDepthMm: fixing.depthMm.value,
      holeRef: (catalogSource(length.carcassHolesFromFrontMm.ref ?? slide.ref) as { ref: string }).ref,
    },
  };
}

/** A wall of the box of a concealed runner: its origin and extent across (x), in depth from the face of the fronts (y), up (z). */
export interface ConcealedBoxWall {
  key: 'side-left' | 'side-right' | 'back' | 'bottom';
  o: [number, number, number];
  ext: [number, number, number];
}

/**
 * The walls of the box of the BAZIS kit of a concealed runner (FINDINGS 1750): the sides from the plane of the front
 * (`n.concealed.frontMm`), the bottom of the board between them raised above their lower edge, the back above the
 * bottom, no inner front — the front closes the box. `leftMm` — the left edge of the opening.
 */
export function concealedBoxWalls(n: RunnerInfo, leftMm: number, boardMm: number): ConcealedBoxWall[] {
  const c = n.concealed!,
    k = boardMm,
    bx = leftMm + n.sideGap,
    by = c.frontMm,
    bz = n.boxY,
    bh = n.boxH,
    bw = n.boxW,
    lift = c.bottomRecessMm;
  return [
    { key: 'side-left', o: [bx, by, bz], ext: [k, n.boxD, bh] },
    { key: 'side-right', o: [bx + bw - k, by, bz], ext: [k, n.boxD, bh] },
    { key: 'back', o: [bx + k, by + n.boxD - k, bz + lift], ext: [bw - 2 * k, k, bh - lift] },
    { key: 'bottom', o: [bx + k, by, bz + lift], ext: [bw - 2 * k, n.boxD - k, c.bottomThicknessMm] },
  ];
}

/** What the runner pair of a drawer carries: its front and box by volume × density, the reserve of the hardware and the load. */
export function drawerMovingMassKg(volumesMm3: readonly number[], densityKgM3: number, reserveKg: number, loadKg: number): number {
  return (volumesMm3.reduce((s, v) => s + v, 0) * densityKgM3) / 1e9 + reserveKg + loadKg;
}
