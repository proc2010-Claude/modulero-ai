// Material selection of the wardrobe: file 52 of the prototype r1 (r1.html:9788–9894), task W1 (MIGRATION_PLAN
// 3.3). The carcass decor and board, the ready-made facade and its tariff, the material of a part, the shelf sag
// for the chosen board. The data are the catalogue of the release, catalogs/materials/decors.json (files 52 and 54,
// catalog/materials.ts), given as the last parameter `mc` (MOD-DEC-577).
//
// What the prototype read from its global state (state.materialSelection) is the parameter `d`.
// Proof: reference/wardrobe-core/w1, packages/core/test/wardrobe.policyW1.test.ts, tests/oracle/wardrobe-policy-w1.test.mjs.
import { MATERIAL_CATALOG_SCHEMA, type MaterialCatalog } from '../../catalog/materials.js';
import { shelfDeflectionCalc } from '../../wardrobe/drawers.js';
import { facadeChoice, facadeChoiceTitle, type FacadeChoice } from './facade-materials.js';
import type { PolicyState, Rec } from './project-state.js';
import { constant, prototype, type PolicyModule } from './types.js';

/** Version of the material selection the project stores (r1.html:9788). */
export const MF_SCHEMA = 'MATERIAL-SELECTION-1';

export const materials = {
  id: 'materials',
  version: '1',
  constants: {
    schema: constant(MF_SCHEMA, 'id', prototype('r1.html:9788 MF_SCHEMA', 'FINDINGS 85'), 'Версия выбора материалов в проекте'),
    catalogue: constant(MATERIAL_CATALOG_SCHEMA, 'id', { kind: 'CATALOG', ref: 'catalogs/materials/decors.json (r1.html:6736, 9895)' }, 'Декоры, плиты, кромки и цена готового фасада — данные прототипа, не для производства'),
    sagBoard: constant('ЛДСП E1 P2', 'product', prototype('r1.html:9880 mfShelfDeflection', 'FINDINGS 85'), 'Прогиб полки считается только для ЛДСП E1 P2 той же толщины; иначе UNKNOWN'),
    sqMmPerSqM: constant(1e6, 'mm²/m²', prototype('r1.html:9875 mfFacadeAmount', 'FINDINGS 85'), 'Площадь фасада, мм² → м²'),
  },
} as const satisfies PolicyModule;

/** A decor of the catalogue by id (r1.html:9789). */
export function mfDecor(id: unknown, mc: MaterialCatalog): Rec | undefined {
  return mc.decors.find((d: Rec) => d.decorId === id);
}

/** The choice of a role ('corpus', 'facade') in the project (r1.html:9792). */
export function mfChoice(role: unknown, d: PolicyState): Rec | null {
  return d.materialSelection?.[role as string] || null;
}

/** The chosen board variant of a role (r1.html:9795). */
export function mfBoard(role: unknown = 'corpus', d: PolicyState, mc: MaterialCatalog): Rec | null {
  const c = mfChoice(role, d);
  return mfDecor(c?.decorId, mc)?.boardVariantsForImplementation.find((v: Rec) => v.variantId === c?.variantId) || null;
}

/** Label of a decor: brand, code, finish and name (r1.html:9799). */
export function mfLabel(id: unknown, mc: MaterialCatalog): unknown {
  const d = mfDecor(id, mc);
  if (!d) return id || 'Прежний декор';
  const brand = d.brand === 'UVADREV' ? 'Увадрев' : d.brand,
    identity = d.code || d.name,
    finish = d.finish && d.finish !== 'UNKNOWN' ? ' ' + d.finish : '';
  return `${brand} ${identity}${finish}${d.code ? ' · ' + d.name : ''}`;
}

/** What the catalogue says about the edge of a decor; the physical edge assignment is kept (r1.html:9807). */
export function mfEdgeNote(d: Rec | null | undefined): string {
  if (!d?.lamarty) return 'Действующие назначения торцов сохранены; точный артикул для требуемой толщины не выбран';
  const e = d.lamarty.observedEdge;
  if (d.lamarty.catalogueChainConfirmed && e) return `Справочная совместимость: ${e.material} ${e.widthMm} × ${e.thicknessMm} мм; физические назначения торцов проекта сохранены`;
  return `Кромка требует подбора${e?.textureCode ? ' (наблюдаемая отделка ' + e.textureCode + ')' : ''}; наблюдение не подставлено в физические назначения`;
}

/**
 * A front is bought ready-made (r1.html:9813), unless the model makes it in the order from the corpus board: the
 * doors of the wardrobe graph without a chosen ready-made facade (supplyMode MANUFACTURE, task W4, FINDINGS 266).
 */
export function mfPurchased(p: Rec): boolean {
  return ['facade', 'drawerFacadeStructural'].includes(p.kind) && p.supplyMode !== 'MANUFACTURE';
}

/**
 * The decor of an outer side the project chose (MOD-DEC-483): `materialSelection.sides.left | right` — 'FACADE' (the
 * decor of the facades: the chosen ready-made facade, else the carcass), or a decor of the catalogue; absent — the
 * carcass. Returns the choice in the shape of the carcass choice, or null for the carcass.
 */
export function mfSideChoice(side: unknown, d: PolicyState, mc: MaterialCatalog): Rec | null {
  const v = d.materialSelection?.sides?.[side as string];
  if (!v || v === 'CORPUS') return null;
  const decorId = v === 'FACADE' ? (mfChoice('facade', d)?.decorId ?? null) : v;
  return decorId && mfDecor(decorId, mc) && decorId !== mfChoice('corpus', d)?.decorId ? { decorId, variantId: 'BY_THICKNESS' } : null;
}

/**
 * The decor of the edge bands of the visible edges (MOD-DEC-483): 'FACADE' — the decor of the facades (the chosen
 * ready-made facade, else the carcass); absent — the decor of the part. Null when it is the part's.
 */
export function mfEdgeDecor(partDecorId: unknown, d: PolicyState): string | null {
  if (d.materialSelection?.edges !== 'FACADE') return null;
  const decorId = mfChoice('facade', d)?.decorId ?? mfChoice('corpus', d)?.decorId ?? null;
  return decorId && decorId !== partDecorId ? decorId : null;
}

/** Material of a part from the selection of the project, or null without a selection (r1.html:9816). */
export function mfPartMaterial(p: Rec, d: PolicyState, mc: MaterialCatalog): Rec | null {
  if (p.materialFamily === 'HDF')
    return {
      label: 'ХДФ',
      family: 'HDF',
      purpose: 'MANUFACTURE',
      thicknessMm: p.T,
    };
  // MOD-DEC-573: the facade chosen as «материал → исполнение → цвет»; the prototype's record (no material) is read below.
  const spec = facadeChoice(d, p.T),
    front = ['facade', 'drawerFacadeStructural'].includes(p.kind);
  if (spec && front && spec.purchased) return mfPurchasedFacade(p, spec, d, mc);
  const role = mfPurchased(p) && !spec ? 'facade' : 'corpus',
    // The insert of a sliding leaf takes the finish of the facades, else that of the carcass (mfMaterialCode
    // r1.html:63318), and is made in the order from a 10 mm board (W9.2, FINDINGS 358); of the facades chosen by
    // material only a board decor (ЛДСП, ЛМДФ), 573.
    facadeBoard = spec && !spec.purchased && spec.decorId ? mfChoice('facade', d) : null,
    // MOD-DEC-573 (FINDINGS 1618): a leaf of its own material of the catalogue (ЛДСП, ЛМДФ) — its insert in its decor; a
    // leaf of the prototype's record (a decor without a material) keeps the decor of the doors, as before.
    leafBoard = p.kind === 'slidingInsert' && p.leafMaterialId && p.leafDecorId ? { decorId: p.leafDecorId, variantId: 'BY_THICKNESS' } : null,
    c = leafBoard
      ? leafBoard
      : p.kind === 'slidingInsert'
        ? spec
          ? (facadeBoard ?? mfChoice('corpus', d))
          : (mfChoice('facade', d) ?? mfChoice('corpus', d))
        : (front && facadeBoard) || (p.outerSide && mfSideChoice(p.outerSide, d, mc)) || mfChoice(role, d),
    decor = mfDecor(c?.decorId, mc),
    rate = role === 'facade' ? mfTariff(d, mc) : null;
  if (!c) return null;
  if (role === 'facade')
    return {
      label: rate ? `HOLZCOM · ${rate.source_label}` : 'Готовый покупной фасад · исполнение не выбрано',
      family: 'PURCHASED_FINISHED',
      purpose: 'PURCHASED',
      referenceDecor: decor?.decorId ?? null,
      referenceLabel: mfLabel(decor?.decorId, mc),
      workingVariantId: c.workingVariantId ?? decor?.lamarty?.workingVariantId ?? null,
      sourceVersion: c.sourceVersion ?? decor?.lamarty?.sourceVersion ?? null,
      textureCode: c.textureCode ?? decor?.lamarty?.textureCode ?? null,
      tariffId: rate?.id ?? null,
      rate: rate?.thickness_mm === p.T ? rate!.rate_rub_per_m2 : null,
      thicknessMm: p.T,
      substrate: 'UNKNOWN',
      colorConfirmation: 'Точный цвет готового фасада подбирается отдельно',
    };
  const b = c.variantId ? decor?.boardVariantsForImplementation.find((v: Rec) => v.thicknessMm === p.T) : null,
    edge = mfEdgeDecor(c.decorId, d),
    // MOD-DEC-573, 140 (FINDINGS 1616): the insert of a leaf in the decor of the facades chosen is a board of 10 mm the
    // catalogue has no variant of; it is of the kind of the boards of its decor (ЛДСП, ЛМДФ).
    insertBoard = p.kind === 'slidingInsert' && (leafBoard || facadeBoard) ? (String(decor?.boardVariantsForImplementation[0]?.product ?? '').includes('ЛМДФ') ? 'ЛМДФ' : 'ЛДСП') : null;
  return {
    label: mfLabel(c.decorId, mc) + ' · ' + (insertBoard ? `${insertBoard} ${p.T} мм` : (b?.product ?? 'плита не подтверждена')),
    family: insertBoard ? (insertBoard === 'ЛМДФ' ? 'LMDF' : 'LDSP') : b?.product.includes('ЛМДФ') ? 'LMDF' : b ? 'LDSP' : 'UNKNOWN',
    purpose: 'MANUFACTURE',
    decorId: c.decorId,
    variantId: b?.variantId ?? null,
    workingVariantId: c.workingVariantId ?? decor?.lamarty?.workingVariantId ?? null,
    sourceVersion: c.sourceVersion ?? decor?.lamarty?.sourceVersion ?? null,
    textureCode: c.textureCode ?? decor?.lamarty?.textureCode ?? null,
    thicknessMm: p.T,
    formatMm: b?.formatMm ?? null,
    boardPrice: null,
    edgeVariants: decor?.edgeVariantsForImplementation ?? [],
    edgeSelection: edge ? `Кромка видимых торцов в цвет фасадов: ${mfLabel(edge, mc)}` : mfEdgeNote(decor),
    ...(edge ? { edgeDecorId: edge } : {}),
  };
}

/**
 * A bought facade of a material of MOD-DEC-573: the material and the execution, the decor as a sample of the colour or
 * the colour code; the door is of the thickness of the execution, its price is of the catalogue (the estimate).
 */
function mfPurchasedFacade(p: Rec, s: FacadeChoice, d: PolicyState, mc: MaterialCatalog): Rec {
  const c = mfChoice('facade', d)!,
    decor = mfDecor(s.decorId, mc),
    // The colour chosen is named on the part, as the kitchen and other furniture name it (R2-027, FINDINGS 1793).
    color = decor ? String(mfLabel(decor.decorId, mc)) : s.colorText;
  return {
    label: facadeChoiceTitle(s) + (color ? ' · ' + color : ''),
    family: 'PURCHASED_FINISHED',
    purpose: 'PURCHASED',
    facadeMaterialId: s.materialId,
    facadeExecutionId: s.executionId,
    referenceDecor: decor?.decorId ?? null,
    referenceLabel: decor ? mfLabel(decor.decorId, mc) : (s.colorText ?? 'Цвет не выбран'),
    colorText: s.colorText,
    workingVariantId: c.workingVariantId ?? decor?.lamarty?.workingVariantId ?? null,
    sourceVersion: c.sourceVersion ?? decor?.lamarty?.sourceVersion ?? null,
    textureCode: c.textureCode ?? decor?.lamarty?.textureCode ?? null,
    tariffId: null,
    // The price is of the catalogue of the release (the estimate, facadeChoicePrice), not of the project.
    rate: null,
    thicknessMm: p.T,
    substrate: 'UNKNOWN',
    colorConfirmation: 'Точный цвет готового фасада подбирается у поставщика',
  };
}

/**
 * Writes the material, family and supply mode into each part that has one (r1.html:9860). A part of the carcass
 * board of the prototype's form (no decor chosen) keeps its material; the decor of its edges in the colour of the
 * facades is all it gets (MOD-DEC-483).
 */
export function mfAnnotate(parts: Rec[], d: PolicyState, mc: MaterialCatalog): void {
  for (const p of parts) {
    const info = mfPartMaterial(p, d, mc),
      edge = !info && !mfPurchased(p) && p.materialFamily !== 'HDF' ? mfEdgeDecor(null, d) : null;
    if (info) {
      p.materialSelection = info;
      p.materialFamily = info.family;
      p.supplyMode = info.purpose;
    } else if (edge) p.materialSelection = { edgeDecorId: edge, edgeSelection: `Кромка видимых торцов в цвет фасадов: ${mfLabel(edge, mc)}` };
  }
}

/** The listed tariff of the chosen ready-made facade (r1.html:9870). */
export function mfTariff(d: PolicyState, mc: MaterialCatalog): Rec | null {
  return mc.facadePrice.rows.find((r: Rec) => r.kind === 'LISTED_RATE' && r.id === d.materialSelection?.facade?.tariffId) || null;
}

/** Price of ready-made facades by a listed tariff of the same thickness, or null (r1.html:9873). */
export function mfFacadeAmount(height: number, width: number, quantity: number, tariffId: unknown, thickness: unknown, mc: MaterialCatalog): number | null {
  const r = mc.facadePrice.rows.find((r: Rec) => r.kind === 'LISTED_RATE' && r.id === tariffId);
  return r && r.thickness_mm === thickness ? ([height, width, quantity].every((n) => Number.isFinite(n) && n > 0) ? ((height * width) / materials.constants.sqMmPerSqM.value) * quantity * r.rate_rub_per_m2 : null) : null;
}

/** Shelf sag (shelfDeflectionCalc) when the carcass is the default board or ЛДСП E1 P2 of this thickness, else UNKNOWN (r1.html:9877). */
export function mfShelfDeflection(span: number, depth: number, thickness: number, cargoKg: number, d: PolicyState, mc: MaterialCatalog): Rec {
  const c = mfChoice('corpus', d),
    b = mfBoard(undefined, d, mc);
  if (!c || (b?.product === materials.constants.sagBoard.value && b.thicknessMm === thickness)) return shelfDeflectionCalc(span, depth, thickness, cargoKg) as unknown as Rec;
  return {
    status: 'UNKNOWN',
    span,
    depth,
    thickness,
    cargoKg,
    E: null,
    selfKg: null,
    totalKg: null,
    deflection: null,
    sigma: null,
    reason: 'Нагрузка: не подтверждены механические свойства выбранного материала ' + mfLabel(c.decorId, mc) + '. Расчёт по ЛДСП не применяется.',
  };
}
