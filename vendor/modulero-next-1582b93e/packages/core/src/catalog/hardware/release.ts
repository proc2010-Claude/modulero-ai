// The hardware catalogue as the engine gets it (task CAT-1, CAT-2; docs/HARDWARE_CATALOGS.md, 3 and 6). The data lie
// outside the core, in catalogs/ at the top of the repository; the core imports none of them (scripts/check.mjs). A
// generator is a pure function «input + policy + catalogue → graph» (ENGINE.md §1): it takes the catalogue as an
// argument and writes its release into the graph (`versions.hardwareCatalog`), the project file keeps the release a
// result was computed with (MOD-DEC-351). The release is catalogs/RELEASE.json: a version and the SHA-256 of the
// canonical JSON of every file (npm run catalog:release writes it, npm run check refuses a file that differs from it).
import { fittingsSelection } from '../../engine/policy/fittings-selection.js';
import { hingeSelection } from '../../engine/policy/hinge-selection.js';
import { slidingDoors } from '../../engine/policy/sliding-doors.js';
import { slidingTrackWidth } from '../../engine/policy/wardrobe-sliding.js';
import { HOME } from '../../engine/policy/home.js';
import { wardrobePrice } from '../../engine/policy/wardrobe-price.js';
import { WARDROBE_DRAWER_SLIDE } from '../../wardrobe/drawers.js';
import { articleCatalogProblems, type ArticleCatalog } from './articles.js';
import { materialCatalogProblems, type MaterialCatalog } from '../materials.js';
import { drawerSlideCatalogProblems, type DrawerSlideCatalog } from './drawer-slides.js';
import { drawerSystemCatalogProblems, type DrawerSystemCatalog } from './drawer-systems.js';
import { facadeCatalogProblems, type FacadeMaterialCatalog } from './facades.js';
import { fittingsCatalogProblems, type FittingsCatalog } from './fittings.js';
import { hingeCatalogProblems, type HingeCatalog } from './hinges.js';
import { liftCatalogProblems, type LiftCatalog } from './lifts.js';
import { catalogPriceRecordProblems } from './prices.js';
import { shelfSupportCatalogProblems, type ShelfSupportCatalog } from './shelf-supports.js';
import { worktopCatalogProblems, type WorktopCatalog } from './worktops.js';
import { glassCatalogProblems, type GlassCatalog } from './glass.js';

/** A release of the catalogue: its version and the SHA-256 of its content. Two equal releases give the same result. */
export interface CatalogRelease {
  version: string;
  sha256: string;
}

/** Every family of the hardware catalogue of one release. */
export interface HardwareCatalogs {
  release: CatalogRelease;
  hinges: HingeCatalog;
  drawerSlides: DrawerSlideCatalog;
  /** Drawer systems: a kit of runners and metal sides for one drawer (MOD-DEC-700, FINDINGS 1872). */
  drawerSystems: DrawerSystemCatalog;
  shelfSupports: ShelfSupportCatalog;
  articles: ArticleCatalog;
  /** Lifts of a front opening upwards (task LIFT, MOD-DEC-320). */
  lifts: LiftCatalog;
  /** Rods with their holders, legs and handles (task FIT, MOD-DEC-480). */
  fittings: FittingsCatalog;
  /** The materials of the facades: material, execution, colour, price (MOD-DEC-573), catalogs/materials/facades.json. */
  facades: FacadeMaterialCatalog;
  /** Decors with their boards and edges, the HOLZCOM tariffs of the prototype's record (MOD-DEC-577), catalogs/materials/decors.json. */
  materials: MaterialCatalog;
  /** The worktops of the kitchen: a sheet of a decor, 26 or 38 mm, its price (MOD-AI-15, FINDINGS 2763), catalogs/materials/worktops.json. */
  worktops: WorktopCatalog;
  /** Glass and mirror of the facades: the inserts of the sliding doors, a leaf on hinges for glass, an insert of a frame (FINDINGS 3400), catalogs/materials/glass.json. */
  glass: GlassCatalog;
}

/** A position a rule of the policy names: it must be in the catalogue (check 6 of HARDWARE_CATALOGS.md, MOD-DEC-349). */
export interface PolicyCatalogReference {
  family: 'HINGE' | 'DRAWER_SLIDE' | 'ARTICLE' | 'FITTING' | 'SLIDING_PROFILE';
  id: string;
  /** The rule that names it. */
  by: string;
}

/**
 * Positions the policy names: the hinges of 073 and 329, the runner of the wardrobe and of "other furniture", the items
 * of the hardware list of "other furniture", the priced items of the fasteners of the wardrobe (MOD-DEC-536), the
 * profiles and the guides of the sliding systems drawn in 3D — by their article (FINDINGS 1083).
 */
export function policyCatalogReferences(): PolicyCatalogReference[] {
  return [
    ...hingeSelection.constants.preferredHinges.value.map((id) => ({ family: 'HINGE' as const, id, by: 'hinge-selection.preferredHinges (MOD-DEC-073, 329)' })),
    { family: 'DRAWER_SLIDE', id: WARDROBE_DRAWER_SLIDE, by: 'wardrobe/drawers.ts WARDROBE_DRAWER_SLIDE (MOD-DEC-032, FINDINGS 39)' },
    { family: 'DRAWER_SLIDE', id: HOME.runnerSlide, by: 'home.runnerSlide (FINDINGS 230)' },
    ...Object.entries(HOME.hardwareItems).map(([line, id]) => ({ family: 'ARTICLE' as const, id, by: `home.hardwareItems.${line} (FINDINGS 230)` })),
    { family: 'FITTING', id: fittingsSelection.constants.defaultRod.value, by: 'fittings-selection.defaultRod (MOD-DEC-233, 480)' },
    { family: 'FITTING', id: fittingsSelection.constants.defaultHandle.value, by: 'fittings-selection.defaultHandle (MOD-DEC-480)' },
    { family: 'ARTICLE', id: wardrobePrice.constants.confirmatItem.value, by: 'wardrobe-price.confirmatItem (MOD-DEC-536)' },
    { family: 'ARTICLE', id: wardrobePrice.constants.shelfPinItem.value, by: 'wardrobe-price.shelfPinItem (MOD-DEC-536)' },
    ...Object.entries(wardrobePrice.constants.dowelItems.value).map(([size, id]) => ({ family: 'ARTICLE' as const, id, by: `wardrobe-price.dowelItems.${size} (MOD-DEC-536)` })),
    ...Object.entries(slidingDoors.constants.systems.value).flatMap(([system, t]) =>
      (['vertical', 'upper_frame', 'lower_frame', 'upper_track', 'lower_track'] as const).flatMap((role) => {
        const id = t.articles[role];
        return id ? [{ family: 'SLIDING_PROFILE' as const, id, by: `sliding-doors.systems.${system}.articles.${role} (FINDINGS 916, 1083)` }] : [];
      }),
    ),
    { family: 'SLIDING_PROFILE', id: slidingDoors.constants.slimHiddenUpperFrame.value, by: 'sliding-doors.slimHiddenUpperFrame (FINDINGS 918, 1083)' },
    { family: 'SLIDING_PROFILE', id: slidingDoors.constants.slimRecessedLowerTrack.value, by: 'sliding-doors.slimRecessedLowerTrack (FINDINGS 916, 1083)' },
  ];
}

/**
 * Problems of a release: the checks of each family and the positions the policy names (MOD-DEC-349). Only what the
 * engine needs to count right or to count at all; an empty list — the release can be used.
 */
export function hardwareCatalogProblems(hw: HardwareCatalogs): string[] {
  const at = (file: string, list: string[]) => list.map((x) => `${file} › ${x}`);
  const ids: Record<PolicyCatalogReference['family'], Set<string>> = {
    HINGE: new Set(hw.hinges.hinges.map((h) => h.id)),
    DRAWER_SLIDE: new Set(hw.drawerSlides.slides.map((s) => s.id)),
    ARTICLE: new Set(hw.articles.items.map((x) => x.id)),
    FITTING: new Set([...hw.fittings.rods, ...hw.fittings.legs, ...hw.fittings.handles, ...hw.fittings.hangers].map((x) => x.id)),
    SLIDING_PROFILE: new Set(hw.fittings.slidingProfiles.map((x) => x.article)),
  };
  const files = { HINGE: 'hardware/hinges.json', DRAWER_SLIDE: 'hardware/drawer-slides.json', ARTICLE: 'hardware/articles.json', FITTING: 'hardware/fittings.json', SLIDING_PROFILE: 'hardware/fittings.json' };
  const out = [
    ...(/^\S+$/.test(hw.release.version) ? [] : ['RELEASE.json › нет версии каталога']),
    ...(/^[0-9a-f]{64}$/.test(hw.release.sha256) ? [] : ['RELEASE.json › sha256 — 64 шестнадцатеричных знака']),
    ...at('hardware/hinges.json', hingeCatalogProblems(hw.hinges)),
    ...at('hardware/drawer-slides.json', drawerSlideCatalogProblems(hw.drawerSlides)),
    ...at('hardware/drawer-systems.json', drawerSystemCatalogProblems(hw.drawerSystems)),
    ...at('hardware/shelf-supports.json', shelfSupportCatalogProblems(hw.shelfSupports)),
    ...at('hardware/articles.json', articleCatalogProblems(hw.articles)),
    ...at('hardware/lifts.json', liftCatalogProblems(hw.lifts)),
    ...at('hardware/fittings.json', fittingsCatalogProblems(hw.fittings)),
    ...at('materials/facades.json', facadeCatalogProblems(hw.facades, new Set(hw.materials.decors.map((d) => String(d.decorId))))),
    ...at('materials/decors.json', materialCatalogProblems(hw.materials)),
    ...at('materials/worktops.json', worktopCatalogProblems(hw.worktops, new Set(hw.materials.decors.map((d) => String(d.decorId))))),
    ...at('materials/glass.json', glassCatalogProblems(hw.glass)),
    // The prices of every family and the kits (MOD-DEC-536): their format, one price per article, kits of known parts.
    ...catalogPriceRecordProblems(hw).map((x) => `цены › ${x}`),
  ];
  for (const r of policyCatalogReferences()) if (!ids[r.family].has(r.id)) out.push(`${files[r.family]} › нет позиции ${r.id}, которую называет ${r.by}`);
  // The depth of a guide is a width of the policy the record names (FINDINGS 1083).
  for (const x of hw.fittings.slidingProfiles)
    if (x.depthMmFrom && slidingTrackWidth(x.depthMmFrom) === null) out.push(`hardware/fittings.json › ${x.id}.depthMmFrom: ${x.depthMmFrom} — не ширина направляющей политики wardrobe-sliding`);
  return out;
}

/**
 * What the user is told when a project was computed with another release than the current one (MOD-DEC-351). null —
 * the same release, or a project saved before releases were written (nothing to compare with). The core keeps only
 * the current release yet: opening on the saved release and the preview of the difference need the stored releases
 * (FINDINGS 295), so the text says the project is computed with the current one.
 */
export function catalogReleaseChange(saved: CatalogRelease | null | undefined, current: CatalogRelease): string | null {
  if (!saved || saved.sha256 === current.sha256) return null;
  return `Каталог фурнитуры обновлён: проект сохранён по версии ${saved.version}, сейчас действует ${current.version}. Проект посчитан по действующей версии — проверьте петли, присадку и комплект фурнитуры.`;
}
