// @modulero/core — pure domain logic. No DOM, no globals, no load order.
export * as home from './home/index.js';
export * as wardrobe from './wardrobe/index.js';
export * as kitchen from './kitchen/index.js';
export * as engine from './engine/index.js';
export * from './project/file.js';
export { PREVIEW_SIZE, previewSvg, projectGraph } from './project/preview.js';
export { canonicalJson, contentDigest } from './project/digest.js';
export { decorsOf, decorSwatchOf, type Decor } from './catalog/decors.js';
// The hardware catalogue is not part of the core (catalogs/ at the top of the repository, task CAT-1): only its format,
// its checks and the release are; a generator gets the catalogue as an argument.
export { hingeCatalogProblems, drillingKit, hingeChartFor, type HingeCatalog, type Hinge, type HingeMountingPlate, type FacadeMounting, type DrillingKit } from './catalog/hardware/hinges.js';
export { shelfSupportCatalogProblems, type ShelfSupportCatalog, type ShelfSupport, type ShelfRetention } from './catalog/hardware/shelf-supports.js';
export { drawerSlideCatalogProblems, type DrawerSlideCatalog, type DrawerSlide, type DrawerSlideKind } from './catalog/hardware/drawer-slides.js';
export { drawerSystemCatalogProblems, type DrawerSystemCatalog, type DrawerSystem, type DrawerSystemLength } from './catalog/hardware/drawer-systems.js';
export { articleCatalogProblems, articleItem, type ArticleCatalog, type ArticleItem, type ArticleFamily, type HardwareKit } from './catalog/hardware/articles.js';
export { liftCatalogProblems, type LiftCatalog, type Lift, type LiftFrontKind } from './catalog/hardware/lifts.js';
export { FACADE_CONSTRUCTIONS, facadeCatalogProblems, facadeExecutionOf, facadeHingeApplications, facadeLimitsOf, facadeMassKg, facadeMaterialOf, facadeMillingOf, facadeSizeProblems, type FacadeColorMode, type FacadeConstruction, type FacadeExecution, type FacadeFrame, type FacadeMaterial, type FacadeMaterialCatalog, type FacadeMilling, type FacadeSizeLimits } from './catalog/hardware/facades.js';
export { GLASS_KINDS, GLASS_USES, glassCatalogProblems, glassMassKg, glassOf, glassSizeProblems, type GlassCatalog, type GlassKind, type GlassOperation, type GlassType, type GlassUse } from './catalog/hardware/glass.js';
export { worktopCatalogProblems, worktopOf, type Worktop, type WorktopCatalog, type WorktopThicknessMm } from './catalog/hardware/worktops.js';
export { MATERIAL_CATALOG_SCHEMA, materialCatalogOf, materialCatalogProblems, type MaterialCatalog, type MaterialCatalogData } from './catalog/materials.js';
export { faceHandles, fittingsCatalogProblems, type CabinetLight, type FittingsCatalog, type FittingFinish, type Handle, type HandleKind, type HandleMounting, type HandleStyle, type Leg, type PlinthClip, type PowerSupply, type PushLatch, type RodSeries } from './catalog/hardware/fittings.js';
export { catalogPrices, catalogPriceProblems, catalogPriceRecordProblems, priceBasisText, type CatalogPrice, type CatalogPrices, type PricePer, type PriceSource, type ResolvedPrice, type ArticleQuantity } from './catalog/hardware/prices.js';
export { catalogReleaseChange, hardwareCatalogProblems, policyCatalogReferences, type CatalogRelease, type HardwareCatalogs, type PolicyCatalogReference } from './catalog/hardware/release.js';
// The register of positions (task CAT-A, MOD-DEC-702): one position for a maker and an article; the makers are data (catalogs/registry).
export { brandDictionaryProblems, brandNameKnown, brandOf, engineRecordKey, familyInfo, normalizeArticle, positionId, positionUse, registerProblems, similarArticles, POSITION_FAMILIES, type BrandDictionary, type BrandRecord, type CatalogPosition, type EngineLink, type FamilyInfo, type PositionFamily, type PositionRegister, type PositionStatus, type PositionUse } from './catalog/registry.js';
