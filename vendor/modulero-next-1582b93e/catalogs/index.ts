// The hardware catalogue of Modulero, outside the engine (task CAT-1, docs/HARDWARE_CATALOGS.md). The core imports
// none of this folder (scripts/check.mjs): the interface, the tests and the oracles take the current release from
// here and give it to the generators as an argument. A change of a file of catalogs/hardware or catalogs/materials needs a new release
// (npm run catalog:release), and npm run check refuses data that differ from catalogs/RELEASE.json. After the
// release of the service the same files come from the catalogue editor (CAT-7, CAT-8).
import { materialCatalogOf, type ArticleCatalog, type BrandDictionary, type DrawerSlideCatalog, type DrawerSystemCatalog, type FacadeMaterialCatalog, type FittingsCatalog, type HardwareCatalogs, type HingeCatalog, type LiftCatalog, type MaterialCatalogData, type GlassCatalog, type ShelfSupportCatalog, type WorktopCatalog } from '../packages/core/src/index.js';
import release from './RELEASE.json' with { type: 'json' };
import articles from './hardware/articles.json' with { type: 'json' };
import drawerSlides from './hardware/drawer-slides.json' with { type: 'json' };
import drawerSystems from './hardware/drawer-systems.json' with { type: 'json' };
import fittings from './hardware/fittings.json' with { type: 'json' };
import hinges from './hardware/hinges.json' with { type: 'json' };
import lifts from './hardware/lifts.json' with { type: 'json' };
import shelfSupports from './hardware/shelf-supports.json' with { type: 'json' };
import decors from './materials/decors.json' with { type: 'json' };
import facades from './materials/facades.json' with { type: 'json' };
import worktops from './materials/worktops.json' with { type: 'json' };
import glass from './materials/glass.json' with { type: 'json' };
import brands from './registry/brands.json' with { type: 'json' };

/** The current release: every family of the catalogue and the version and SHA-256 of catalogs/RELEASE.json. */
export const hardwareCatalogs: HardwareCatalogs = {
  release: { version: release.version, sha256: release.sha256 },
  hinges: hinges as HingeCatalog,
  drawerSlides: drawerSlides as DrawerSlideCatalog,
  drawerSystems: drawerSystems as DrawerSystemCatalog,
  shelfSupports: shelfSupports as ShelfSupportCatalog,
  articles: articles as ArticleCatalog,
  lifts: lifts as LiftCatalog,
  fittings: fittings as FittingsCatalog,
  facades: facades as FacadeMaterialCatalog,
  materials: materialCatalogOf(decors as MaterialCatalogData),
  worktops: worktops as WorktopCatalog,
  glass: glass as GlassCatalog,
};

/** The makers of the register of positions and the rules of their articles (task CAT-A, MOD-DEC-702): the section `registry` of the release, which the engine does not read (CAT-E). */
export const registryBrands = brands as BrandDictionary;
