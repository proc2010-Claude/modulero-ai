// Edge banding: file 03 of the prototype r1 (r1.html:4937–5228), MIGRATION_PLAN step 3.1.
// Intents (what thickness an edge needs), supplier service profiles, the edge price list and the physical
// edges of each part kind. Pure functions, no wrappers in the prototype.
//
// The lookups go through plain objects, as in the prototype, so a code like 'toString' or 'constructor'
// finds an inherited property and is taken as known. The prototype behaves so; tests keep it (FINDINGS 41).
// Proof: tests/oracle/wardrobe-core.test.mjs (prototype in the browser) and test/wardrobe.core31.test.ts.

export interface EdgeIntent {
  readonly code: string;
  readonly thicknessMm: number;
}

/** Edge intents 0 / 0.4 / 1.0 / 2.0 mm (r1.html:4937): the physical edge map of ES v1.2 §18 (MOD-DEC-055); shelf front 0.4 mm: MOD-DEC-193. */
export const EDGE_INTENTS = Object.freeze({
  NONE: Object.freeze({ code: 'NONE', thicknessMm: 0 }),
  EDGE_0_4: Object.freeze({ code: 'EDGE_0_4', thicknessMm: 0.4 }),
  EDGE_1_0: Object.freeze({ code: 'EDGE_1_0', thicknessMm: 1 }),
  EDGE_2_0: Object.freeze({ code: 'EDGE_2_0', thicknessMm: 2 }),
}) as Readonly<Record<string, EdgeIntent>>;

/** Intent → service profile of the current supplier (r1.html:4955). */
export const EDGE_INTENT_SERVICE_PROFILE = Object.freeze({
  NONE: 'NONE',
  EDGE_0_4: 'PVC_ABS_0_4',
  EDGE_1_0: 'PVC_ABS_0_8_1_0',
  EDGE_2_0: 'PVC_ABS_2_0',
}) as Readonly<Record<string, string>>;

/** Service profile → intent (r1.html:4961). */
export const EDGE_PROFILE_INTENT = Object.freeze({
  NONE: 'NONE',
  PVC_ABS_0_4: 'EDGE_0_4',
  PVC_ABS_0_8_1_0: 'EDGE_1_0',
  PVC_ABS_2_0: 'EDGE_2_0',
}) as Readonly<Record<string, string>>;

export interface EdgeProfile {
  code: string;
  title: string;
  material: string;
  nominalThickness: number;
  thicknessMin: number;
  thicknessMax: number;
  glueTechnology: string;
  applicationType: string;
}

/** Supplier service profiles (r1.html:4967). The profiles themselves are not frozen in the prototype. */
export const EDGE_PROFILES = Object.freeze({
  NONE: { code: 'NONE', title: 'Без кромки', material: '—', nominalThickness: 0, thicknessMin: 0, thicknessMax: 0, glueTechnology: '—', applicationType: 'straight' },
  PVC_ABS_0_4: { code: 'PVC_ABS_0_4', title: 'ПВХ/ABS 0,4 мм', material: 'PVC/ABS', nominalThickness: 0.4, thicknessMin: 0.4, thicknessMax: 0.4, glueTechnology: 'PUR', applicationType: 'straight' },
  PVC_ABS_0_8_1_0: { code: 'PVC_ABS_0_8_1_0', title: 'ПВХ/ABS 0,8–1,0 мм', material: 'PVC/ABS', nominalThickness: 0.9, thicknessMin: 0.8, thicknessMax: 1, glueTechnology: 'PUR', applicationType: 'straight' },
  PVC_ABS_2_0: { code: 'PVC_ABS_2_0', title: 'ПВХ/ABS 2,0 мм', material: 'PVC/ABS', nominalThickness: 2, thicknessMin: 2, thicknessMax: 2, glueTechnology: 'PUR', applicationType: 'straight' },
}) as Readonly<Record<string, EdgeProfile>>;

/** Choices of a manual edge override (r1.html:5009). */
export const EDGE_OVERRIDE_OPTIONS = ['AUTO', 'NONE', 'PVC_ABS_0_4', 'PVC_ABS_0_8_1_0', 'PVC_ABS_2_0'];

export interface EdgePriceService {
  panelThicknessMin: number;
  panelThicknessMax: number;
  profileCode: string;
  applicationType: string;
  glueTechnology: string;
  panelServiceCategory: string;
  pricePerM: number;
}

/** Edge banding price list of the supplier, ₽/m (r1.html:5010). The price repeats the prototype: MOD-DEC-285. */
export const EDGE_PRICE_CATALOG = Object.freeze({
  provider: 'ТЕХНОПЛИТ',
  effectiveDate: '2026-05-25',
  currency: 'RUB',
  services: [
    { panelThicknessMin: 10, panelThicknessMax: 16, profileCode: 'PVC_ABS_0_4', applicationType: 'straight', glueTechnology: 'PUR', panelServiceCategory: 'STANDARD', pricePerM: 74 },
    { panelThicknessMin: 18, panelThicknessMax: 26, profileCode: 'PVC_ABS_0_4', applicationType: 'straight', glueTechnology: 'PUR', panelServiceCategory: 'STANDARD', pricePerM: 82 },
    { panelThicknessMin: 10, panelThicknessMax: 16, profileCode: 'PVC_ABS_0_8_1_0', applicationType: 'straight', glueTechnology: 'PUR', panelServiceCategory: 'STANDARD', pricePerM: 79 },
    { panelThicknessMin: 18, panelThicknessMax: 26, profileCode: 'PVC_ABS_0_8_1_0', applicationType: 'straight', glueTechnology: 'PUR', panelServiceCategory: 'STANDARD', pricePerM: 90 },
    { panelThicknessMin: 10, panelThicknessMax: 16, profileCode: 'PVC_ABS_2_0', applicationType: 'straight', glueTechnology: 'PUR', panelServiceCategory: 'STANDARD', pricePerM: 82 },
    { panelThicknessMin: 18, panelThicknessMax: 26, profileCode: 'PVC_ABS_2_0', applicationType: 'straight', glueTechnology: 'PUR', panelServiceCategory: 'STANDARD', pricePerM: 99 },
    { panelThicknessMin: 26.001, panelThicknessMax: Infinity, profileCode: 'PVC_ABS_2_0', applicationType: 'straight', glueTechnology: 'PUR', panelServiceCategory: 'STANDARD', pricePerM: 120 },
    { panelThicknessMin: 10, panelThicknessMax: 16, profileCode: 'PVC_ABS_2_0', applicationType: 'straight', glueTechnology: 'PUR', panelServiceCategory: 'SPECIAL_SURFACE', pricePerM: 160 },
  ] as EdgePriceService[],
});

/** The prototype's second name of the price list (r1.html:5080). */
export const EdgePriceCatalog = EDGE_PRICE_CATALOG;

/** Known service profile code, 'V2' (the old visible edge band) = 2.0 mm, anything else 'NONE' (r1.html:5081). */
export function normalizeEdgeProfileCode(code: unknown): string {
  return code === 'V2' ? 'PVC_ABS_2_0' : EDGE_PROFILES[code as string] ? (code as string) : 'NONE';
}

/** Known intent code, anything else 'NONE' (r1.html:5084). */
export function normalizeEdgeIntentCode(code: unknown): string {
  return EDGE_INTENTS[code as string] ? (code as string) : 'NONE';
}

/** r1.html:5087. */
export function resolveEdgeIntentToProfileCode(intentCode: unknown): string {
  return EDGE_INTENT_SERVICE_PROFILE[normalizeEdgeIntentCode(intentCode)] || 'NONE';
}

/** r1.html:5090. */
export function edgeIntentForProfileCode(profileCode: unknown): string {
  return EDGE_PROFILE_INTENT[normalizeEdgeProfileCode(profileCode)] || 'NONE';
}

/** r1.html:5093. */
export function edgeIntentThicknessMm(intentCode: unknown): number {
  return EDGE_INTENTS[normalizeEdgeIntentCode(intentCode)]!.thicknessMm;
}

/** Title of an intent for the interface (r1.html:5096). */
export function edgeIntentTitle(intentCode: unknown): string {
  const code = normalizeEdgeIntentCode(intentCode),
    titles: Record<string, string> = {
      EDGE_0_4: '0,4 мм',
      EDGE_1_0: '1,0 мм',
      EDGE_2_0: '2,0 мм',
    };
  return code === 'NONE' ? 'Без кромки' : titles[code] || `${String(edgeIntentThicknessMm(code)).replace('.', ',')} мм`;
}

export interface ResolvedEdgeIntent {
  intentCode: string;
  intentThicknessMm: number;
  profileCode: string;
  profile: EdgeProfile;
  mapping: 'CURRENT_SUPPLIER_SERVICE_PROFILE';
}

/** Intent with its service profile (r1.html:5105). */
export function resolveEdgeIntent(intentCode: unknown): ResolvedEdgeIntent {
  const code = normalizeEdgeIntentCode(intentCode),
    profileCode = resolveEdgeIntentToProfileCode(code);
  return {
    intentCode: code,
    intentThicknessMm: edgeIntentThicknessMm(code),
    profileCode,
    profile: EDGE_PROFILES[profileCode]!,
    mapping: 'CURRENT_SUPPLIER_SERVICE_PROFILE',
  };
}

/** Physical edge → [slot A–D, dimension the edge runs along, Russian label]. */
export type EdgeGeometryEntry = [slot: string, lengthKey: 'L' | 'W', labelRu: string];

/** Physical edges of each part kind (r1.html:5116); unknown kinds use 'back'. Only the outer object is frozen, as in the prototype. */
export const EDGE_GEOMETRY_BY_KIND = Object.freeze({
  sideLeft: { front: ['A', 'L', 'Передний'], rear: ['B', 'L', 'Задний'], bottom: ['C', 'W', 'Нижний'], top: ['D', 'W', 'Верхний'] },
  sideRight: { front: ['A', 'L', 'Передний'], rear: ['B', 'L', 'Задний'], bottom: ['C', 'W', 'Нижний'], top: ['D', 'W', 'Верхний'] },
  divider: { front: ['A', 'L', 'Передний'], rear: ['B', 'L', 'Задний'], bottom: ['C', 'W', 'Нижний'], top: ['D', 'W', 'Верхний'] },
  top: { front: ['A', 'L', 'Передний'], rear: ['B', 'L', 'Задний'], left: ['C', 'W', 'Левый'], right: ['D', 'W', 'Правый'] },
  bottom: { front: ['A', 'L', 'Передний'], rear: ['B', 'L', 'Задний'], left: ['C', 'W', 'Левый'], right: ['D', 'W', 'Правый'] },
  adjustableShelf: { front: ['A', 'L', 'Передний'], rear: ['B', 'L', 'Задний'], left: ['C', 'W', 'Левый'], right: ['D', 'W', 'Правый'] },
  fixedShelf: { front: ['A', 'L', 'Передний'], rear: ['B', 'L', 'Задний'], left: ['C', 'W', 'Левый'], right: ['D', 'W', 'Правый'] },
  drawerCoverShelf: { front: ['A', 'L', 'Передний'], rear: ['B', 'L', 'Задний'], left: ['C', 'W', 'Левый'], right: ['D', 'W', 'Правый'] },
  facade: { left: ['A', 'L', 'Левый'], right: ['B', 'L', 'Правый'], top: ['C', 'W', 'Верхний'], bottom: ['D', 'W', 'Нижний'] },
  drawerFacadeStructural: { left: ['A', 'L', 'Левый'], right: ['B', 'L', 'Правый'], top: ['C', 'W', 'Верхний'], bottom: ['D', 'W', 'Нижний'] },
  plinthFront: { top: ['A', 'L', 'Верхний'], bottom: ['B', 'L', 'Нижний'], left: ['C', 'W', 'Левый'], right: ['D', 'W', 'Правый'] },
  plinthRear: { top: ['A', 'L', 'Верхний'], bottom: ['B', 'L', 'Нижний'], left: ['C', 'W', 'Левый'], right: ['D', 'W', 'Правый'] },
  drawerFront: { top: ['A', 'L', 'Верхний'], bottom: ['B', 'L', 'Нижний'], left: ['C', 'W', 'Левый'], right: ['D', 'W', 'Правый'] },
  drawerBack: { top: ['A', 'L', 'Верхний'], bottom: ['B', 'L', 'Нижний'], left: ['C', 'W', 'Левый'], right: ['D', 'W', 'Правый'] },
  drawerSide: { top: ['A', 'L', 'Верхний'], bottom: ['B', 'L', 'Нижний'], front: ['C', 'W', 'Передний'], rear: ['D', 'W', 'Задний'] },
  back: { left: ['A', 'L', 'Левый'], right: ['B', 'L', 'Правый'], top: ['C', 'W', 'Верхний'], bottom: ['D', 'W', 'Нижний'] },
  drawerBottom: { top: ['A', 'L', 'Верхний'], bottom: ['B', 'L', 'Нижний'], left: ['C', 'W', 'Левый'], right: ['D', 'W', 'Правый'] },
}) as Readonly<Record<string, Record<string, EdgeGeometryEntry>>>;

export interface PhysicalEdge {
  physicalEdge: string;
  slot: string;
  labelRu: string;
  lengthMm: number;
}

/**
 * Physical edges of the kinds r1 does not have, which the edge model bands (the catalogue of r1 above is kept as it
 * is): the spacer of the drawers (MOD-DEC-331, 360) stands like a partition — L the height, W the depth (MOD-AI-23,
 * FINDINGS 3054). Other kinds of the core fall to 'back', as in r1.
 */
export const CORE_EDGE_GEOMETRY_BY_KIND = Object.freeze({
  drawerSpacer: EDGE_GEOMETRY_BY_KIND.divider!,
}) as Readonly<Record<string, Record<string, EdgeGeometryEntry>>>;

/** The physical edges of a kind: of r1, of the core, else those of 'back' (r1.html:5116). */
export function edgeGeometryOfKind(kind: unknown): Record<string, EdgeGeometryEntry> {
  return EDGE_GEOMETRY_BY_KIND[kind as string] || CORE_EDGE_GEOMETRY_BY_KIND[kind as string] || EDGE_GEOMETRY_BY_KIND.back!;
}

/** Physical edges of a part with their slots and lengths; reads only part.kind, part.L and part.W (r1.html:5220). */
export function edgeGeometryForPart(part: { kind?: unknown; L?: unknown; W?: unknown }): Record<string, PhysicalEdge> {
  const map = edgeGeometryOfKind(part.kind);
  return Object.fromEntries(
    Object.entries(map).map(([physical, [slot, lengthKey, labelRu]]) => [
      physical,
      {
        physicalEdge: physical,
        slot,
        labelRu,
        lengthMm: Number(part[lengthKey]) || 0,
      },
    ]),
  );
}
