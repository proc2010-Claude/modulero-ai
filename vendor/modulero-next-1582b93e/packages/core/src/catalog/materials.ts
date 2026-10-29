// Material catalogue of the wardrobe: files 52 and 54 of the prototype r1, task W1 (MIGRATION_PLAN 3.3), as the engine
// gets it. The data lie outside the core, in the release of the catalogue beside the hardware: catalogs/materials/decors.json
// (MOD-DEC-577; first written by scripts/gen-materials.mjs from the frozen prototype) — MF_DATA (EGGER and Uvadrev
// decors with their board and edge variants, the price of ready-made facades of HOLZCOM) and LAMARTY_DATA (Lamarty
// boards and edges). The core keeps only their shape and `materialCatalogOf`, which adds the Lamarty entries to the
// decors as the prototype adds them (r1.html:11056). Nothing here is production-ready: the prototype marks every
// decor as a visual or reference choice (availabilityScope, runtimeScope, manufacturingStatus).
// Like the prototype, the objects are not frozen (FINDINGS 85).

// The data are loose JSON records; the policy reads them as the prototype does.
type Rec = Record<string, any>;

/** The schema of MF_DATA the policy reads (r1.html:6736); another schema is refused by the check of the release. */
export const MATERIAL_CATALOG_SCHEMA = 'MODULERO_MATERIALS_FACADE_INTEGRATION_PREP/r1';

/** The file catalogs/materials/decors.json: the two declarations of the prototype and where they come from. */
export interface MaterialCatalogData {
  source: Rec;
  MF_DATA: Rec;
  LAMARTY_DATA: Rec;
  /** The boards the release adds, with the price of a sheet: HDF, the ЛДСП 10 mm of the inserts (FINDINGS 1607, 1608). */
  RELEASE_BOARDS?: { schema: string; boards: Rec[] };
}

/** A board of the release outside the decors: its family, thickness, format and the price of a whole sheet. */
export interface ReleaseBoard {
  id: string;
  family: 'HDF' | 'LDSP';
  product: string;
  thicknessMm: number;
  formatMm: [number, number];
  priceRub: number;
  priceDate: string;
  priceSource: Rec;
  priceBasis: string;
}

/** The catalogue as the policy reads it: MF_DATA with the Lamarty decors at the end, LAMARTY_DATA. */
export interface MaterialCatalog {
  schema: string;
  /** Decors with their board and edge variants: EGGER, Uvadrev, then Lamarty (r1.html:11056). */
  decors: Rec[];
  /** The price of ready-made facades of the prototype's record (HOLZCOM tariffs, r1.html:6736). */
  facadePrice: Rec;
  /** Lamarty boards and edges (r1.html:9895). */
  lamarty: Rec;
  /** The boards of the release outside the decors (HDF, the inserts of the sliding leaves); the prototype has none. */
  boards: ReleaseBoard[];
  /** Where the data come from. */
  source: Rec;
}

/** A decor of the catalogue for a Lamarty entry, with its edge when the catalogue chain is confirmed (r1.html:11056). */
function lamartyDecor(entry: Rec, lamarty: Rec): Rec {
  const edge = lamarty.edges.find((row: Rec) => row.decorId === entry.decorId) || null;
  return {
    decorId: entry.decorId,
    brand: entry.brand,
    manufacturer: entry.manufacturer,
    code: null,
    name: entry.decorName,
    finish: entry.textureCode,
    baseCode: null,
    group: entry.group,
    image: {
      texture: entry.webPath,
      swatch: entry.thumbPath,
    },
    boardVariantsForImplementation: [
      {
        variantId: entry.workingVariantId,
        workingVariantId: entry.workingVariantId,
        product: 'ЛДСП P2',
        thicknessMm: entry.thicknessMm,
        formatMm: [entry.sheetDimensionsMm.length, entry.sheetDimensionsMm.width],
        // The price of a whole sheet the release sets (MOD-DEC-569, FINDINGS 1602); the prototype declares none.
        priceRub: entry.pricePerSheetRub ?? null,
        sourceVersion: lamarty.sourceVersion,
        manufacturerSkuId: null,
        decorCode: null,
        mechanicalProperties: 'UNKNOWN',
      },
    ],
    edgeVariantsForImplementation:
      entry.catalogueChainConfirmed && edge
        ? [
            {
              edgeId: edge.edgeId,
              material: edge.material,
              widthMm: edge.widthMm,
              thicknessMm: edge.thicknessMm,
              referenceOnly: true,
              technicalStatus: edge.technicalStatus,
            },
          ]
        : [],
    lamarty: {
      workingVariantId: entry.workingVariantId,
      sourceVersion: lamarty.sourceVersion,
      textureCode: entry.textureCode,
      decorCode: null,
      manufacturerSkuId: null,
      catalogueChainConfirmed: entry.catalogueChainConfirmed,
      edgeId: entry.edgeId,
      observedEdgeId: entry.observedEdgeId,
      edgeMatchStatus: entry.edgeMatchStatus,
      edgeFinishStatus: entry.edgeFinishStatus,
      edgeAssignmentPolicy: entry.edgeAssignmentPolicy,
      observedEdge: edge,
      priceStatus: entry.priceStatus,
      runtimeScope: entry.runtimeScope,
      manufacturingStatus: entry.manufacturingStatus,
      publicUseRights: entry.publicUseRights,
      scaleStatus: entry.scaleStatus,
      grainAxis: entry.grainAxis,
    },
  };
}

/** The catalogue of the file: decors, board and edge variants, facade price (r1.html:6736) with the Lamarty decors at the end, as in the prototype. */
export function materialCatalogOf(data: MaterialCatalogData): MaterialCatalog {
  const { MF_DATA, LAMARTY_DATA } = data;
  return {
    schema: MF_DATA.schema,
    decors: [...MF_DATA.decors, ...LAMARTY_DATA.entries.map((e: Rec) => lamartyDecor(e, LAMARTY_DATA))],
    facadePrice: MF_DATA.facadePrice,
    lamarty: LAMARTY_DATA,
    boards: (data.RELEASE_BOARDS?.boards ?? []) as ReleaseBoard[],
    source: data.source,
  };
}

/** The board of the release of a family, thickness and format (MOD-DEC-508, 569; FINDINGS 1607, 1608), or null. */
export function releaseBoardOf(c: MaterialCatalog, family: 'HDF' | 'LDSP', thicknessMm: number, height: number, width: number): ReleaseBoard | null {
  return c.boards.find((b) => b.family === family && b.thicknessMm === thicknessMm && b.formatMm[0] === height && b.formatMm[1] === width) ?? null;
}

/**
 * Only what the engine needs (MOD-DEC-349): the schema the policy reads, decors with an id without repeats, board
 * variants with an id and a positive thickness, tariffs of the facades with an id and a positive rate.
 */
export function materialCatalogProblems(c: MaterialCatalog): string[] {
  const out: string[] = [];
  if (c.schema !== MATERIAL_CATALOG_SCHEMA) out.push(`схема ${c.schema}, ядро читает ${MATERIAL_CATALOG_SCHEMA}`);
  const ids = c.decors.map((d) => d.decorId);
  if (ids.some((id) => typeof id !== 'string' || !id.trim())) out.push('декор без id');
  if (new Set(ids).size !== ids.length) out.push('повтор id декора');
  for (const d of c.decors)
    for (const v of d.boardVariantsForImplementation ?? []) if (!v.variantId || !(Number(v.thicknessMm) > 0)) out.push(`${d.decorId}: вариант плиты без id или толщины`);
  for (const b of c.boards ?? [])
    if (!b.id || !['HDF', 'LDSP'].includes(b.family) || !(b.thicknessMm > 0) || !(b.priceRub > 0) || !(b.formatMm?.[0] > 0 && b.formatMm?.[1] > 0) || !b.priceSource) out.push(`плита выпуска ${b.id}: нужны id, семейство, толщина, формат, цена листа и источник`);
  for (const r of c.facadePrice?.rows ?? []) if (r.kind === 'LISTED_RATE' && (!r.id || !(r.rate_rub_per_m2 > 0) || !(r.thickness_mm > 0))) out.push(`тариф фасада ${r.id}: нужны id, толщина и ставка`);
  return out;
}
