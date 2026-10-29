// The bill of materials of the kitchen (task K3, MIGRATION_PLAN step 4.3): the public parts and hardware, the rows of
// materials, cuts, edges, operations, hardware, work and appliances, and the coverage (kcdBOM r1.html:81540 with
// kcdParts 80993, kcdPublicHardware 81086, kcdPublicPart 81125, kcdBuildRows 81177). Prices are not here: a row
// carries its rate key, the rates are the owner's (kitchen cost, a later task). The ProjectRevision of the BOM is the
// digest of the whole saved kitchen with its worktops (kcdRevision, r1.html:80924): it comes with the call.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { Rec } from '../engine/policy/project-state.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { overlaySink } from './carcass.js';
import { kitchenCoverage, pendingParts } from './coverage.js';
import { allParts } from './derived.js';
import { kitchenHardware } from './hardware.js';
import type { KitchenScene } from './room.js';
import { jsonClone } from '../engine/json-clone.js';

const clone = jsonClone;
const num = (x: unknown): number | null => (Number.isFinite(x) ? (x as number) : null);
const boundPair = (x: unknown): number[] | null => (Array.isArray(x) && x.length === 2 && x.every(Number.isFinite) ? [...x] : null);

export const KITCHEN_BOM_SCHEMA = 'modulero.kitchen.bom.v1';

/** The unit of a row: piece, m, m2, operation, module or project (kcdUnit, r1.html:80998). */
function unitOf(x: unknown): string {
  const unit = typeof x === 'string' ? x.trim() : x;
  return (
    ({ 'шт.': 'piece', job: 'operation', pcs: 'piece', pc: 'piece', pair: 'piece', pairs: 'piece', set: 'piece', kit: 'piece', mm: 'm', meter: 'm', metre: 'm' } as Rec)[unit as string] ||
    (/^stock(?:\s|$)/i.test((unit as string) || '') ? 'piece' : unit) ||
    'piece'
  );
}

/** How a hardware item is supplied: contact, billing kind, stock, cut plan, components and planning data (kcdHardwareSupply, r1.html:81017). */
function hardwareSupply(h: Rec): Rec {
  const raw = h.originalUnit || h.unit || 'piece',
    stock = /^stock(?:\s|$)/i.test(raw),
    length = stock ? Number(String(raw).match(/(\d+(?:\.\d+)?)\s*mm/i)?.[1]) : null;
  const input = h.kitComponents || h.components || h.includes;
  const components = Array.isArray(input)
    ? input.map((c: any) =>
        typeof c === 'string'
          ? { name: c, quantity: null, unit: 'piece' }
          : {
              article: c.article || c.sku || c.commercialSku || null,
              name: c.name || c.part || null,
              quantity: num(c.quantity),
              unit: c.unit || 'piece',
              variant: c.variant || null,
              purchase: c.purchase || null,
              includedWithAppliance: c.includedWithAppliance === true,
            },
      )
    : input && typeof input === 'object'
      ? Object.fromEntries(Object.entries(input).filter(([k, v]) => typeof k === 'string' && Number.isFinite(v) && (v as number) >= 0))
      : null;
  return {
    ...(h.contactId
      ? {
          contactId: h.contactId,
          actualPartIds: Array.isArray(h.actualPartIds) ? h.actualPartIds.filter((x: unknown) => typeof x === 'string') : null,
          withModuleId: h.withModuleId || null,
          withPartId: h.withPartId || null,
          contactWorldMm: Array.isArray(h.contactWorldMm) ? h.contactWorldMm.map(num) : null,
          contactLengthMm: num(h.contactLengthMm),
          contactHeightMm: num(h.contactHeightMm),
          stackThicknessMm: num(h.stackThicknessMm),
        }
      : {}),
    physicalId: h.physicalId || null,
    physicalOperationId: h.physicalOperationId || null,
    apertureId: h.apertureId || null,
    serviceScope: h.serviceScope || null,
    originalUnit: raw,
    billingKind: h.billingKind || (stock ? 'stock' : raw === 'kit' || raw === 'set' ? raw : raw === 'pair' || raw === 'pairs' ? 'pair' : 'piece'),
    stockLengthMm: Number.isFinite(h.stockLengthMm) ? h.stockLengthMm : Number.isFinite(length) && length! > 0 ? length : null,
    cutPlan: Array.isArray(h.cutPlan) ? h.cutPlan.map((c: Rec) => ({ moduleId: c.moduleId || null, lengthMm: num(c.lengthMm) })) : null,
    wasteMm: num(h.wasteMm),
    variant: h.variant || null,
    components,
    includedWithAppliance: h.includedWithAppliance === true,
    applianceKit: h.applianceKit === true,
    drawerId: h.drawerId || null,
    leafId: h.leafId || null,
    hingeQuantity: num(h.hingeQuantity),
    frontMassKg: num(h.frontMassKg),
    powerFactor: num(h.powerFactor),
    manufacturingQualified: h.manufacturingQualified === true,
    assemblyStatus: h.assemblyStatus || null,
    includesStatus: h.includesStatus || null,
    family: h.family || null,
    profileId: h.profileId || null,
    partId: h.partId || null,
    doorGroupId: h.doorGroupId || null,
    motionGroupId: h.motionGroupId || null,
    jointId: h.jointId || null,
    legCount: num(h.legCount),
    installedHeightMm: num(h.installedHeightMm),
    woodStackMm: num(h.woodStackMm),
    conservativeRequiredWoodStackMm: num(h.conservativeRequiredWoodStackMm),
    fastenerSeatThicknessMm: num(h.fastenerSeatThicknessMm),
    conservativeScrewSeatBoundsMm: boundPair(h.conservativeScrewSeatBoundsMm),
    nominalPenetrationBoundsMm: boundPair(h.nominalPenetrationBoundsMm),
    supportOffsetFromShelfLowerMm: num(h.supportOffsetFromShelfLowerMm),
  };
}

/** A hardware item as published (kcdPublicHardware, r1.html:81086). */
export function publicHardware(h: Rec): Rec {
  return {
    moduleId: h.moduleId,
    article: h.article || h.sku || h.selectedSku || null,
    brand: h.brand || h.manufacturer || null,
    name: h.name || null,
    kitId: h.kitId || null,
    quantity: h.quantity,
    unit: unitOf(h.unit),
    included: h.included !== false && h.includedWithAppliance !== true,
    supply: h.supply || h.supplyStatus || h.purchase || 'separate',
    ...hardwareSupply(h),
  };
}

/** Area of a polygon, mm² (kcdArea, r1.html:81106). */
function polygonArea(poly: unknown): number | null {
  if (!Array.isArray(poly) || poly.length < 3 || poly.some((v) => !Array.isArray(v) || !v.every(Number.isFinite))) return null;
  return (
    Math.abs(
      poly.reduce((sum: number, v: number[], i: number) => {
        const n = poly[(i + 1) % poly.length];
        return sum + v[0]! * n[1] - v[1]! * n[0];
      }, 0),
    ) / 2
  );
}

/** Perimeter of a polygon, mm (kcdLength, r1.html:81113). */
function polygonLength(poly: unknown): number | null {
  if (!Array.isArray(poly) || poly.length < 3) return null;
  return poly.reduce((sum: number, v: number[], i: number) => {
    const n = poly[(i + 1) % poly.length];
    return sum + Math.hypot(n[0] - v[0]!, n[1] - v[1]!);
  }, 0);
}

const pick = (o: Rec, keys: readonly string[]): Rec => {
  const clean: Rec = {};
  for (const k of keys) if (o[k] !== undefined) clean[k] = clone(o[k]);
  return clean;
};

const OPERATION_KEYS = ['id', 'partId', 'moduleId', 'kind', 'diameter', 'depth', 'entryLocalUVWmm', 'directionLocalUVW', 'surfaceLabel', 'production', 'x', 'y', 'fromTop', 'fromFront', 'datum', 'width', 'height', 'radius', 'qualification', 'widthMm', 'depthMm', 'lengthMm', 'localBox', 'worldBox'];
const PART_KEYS = [
  'partId', 'moduleId', 'kind', 'name', 'finished_mm', 'blank_mm', 'edge_mm', 'materialCode', 'materialRole', 'quantity', 'count', 'status', 'drillingStatus', 'positionStatus', 'finished_polygon_mm',
  'blank_polygon_mm', 'finished_area_mm2', 'blank_area_mm2', 'hingeWidthMm', 'hingeHeightMm', 'hingeThicknessMm', 'supportingModuleIds', 'attachmentContacts', 'topologyIssues', 'worktopJoints',
  'requiredSupports', 'blankStatus', 'edgeStatus', 'edge_segments_mm', 'box', 'worldBox', 'local_z_bottom_mm', 'worldFootprintMm', 'rectangularEnvelopeOnly', 'rectangularExportEligible', 'drawerId',
  'boxInternalWidthMm', 'drawerOuterWidthMm', 'runnerProfile', 'manufacturingQualified', 'facade', 'fixedFront', 'motionKind', 'motionGroupId', 'doorGroupId', 'hingeSide', 'hingeRole',
  'hingeHardwareSuppressed', 'frontMassKg', 'materialQualification', 'structural', 'fasteningCondition', 'mountingStackMm', 'mountingStackQualification', 'frameMember', 'glassRetention',
  'glassProcessing', 'motionPivotMm', 'motionAxisLocal', 'motionAngleDeg', 'motionTravelMm', 'motionTravelVectorLocal', 'motionParentGroupId', 'schematicMotion', 'motionQualification',
  'applianceStorage', 'applianceFront', 'applianceModel', 'bevel',
  // MOD-DEC-573: the material of the facades chosen (facade-choice.ts).
  'facadeMaterialId', 'facadeExecutionId', 'facadeSupply', 'facadeTitle', 'facadeColorText',
];
const CONTACT_KEYS = ['contactId', 'physicalId', 'moduleIds', 'moduleId', 'withModuleId', 'actualPartIds', 'ownPartId', 'withPartId', 'normalAxis', 'contactPlaneMm', 'contactWorldMm', 'contactLengthMm', 'contactHeightMm', 'contactAreaMm2', 'stackThicknessMm', 'commercialSku', 'connectorQuantity', 'manufacturingQualified'];
const JOINT_KEYS = ['id', 'moduleId', 'moduleIds', 'withPartId', 'withModuleId', 'edgeWorldMm', 'lengthMm', 'connectorQuantity', 'sealLengthMm', 'clearSpanMm', 'serviceGapMm', 'sideSupport', 'manufacturingQualified', 'qualification'];
const APERTURE_KEYS = ['id', 'moduleId', 'x', 'z', 'width', 'depth', 'radius', 'widthTolerance', 'depthTolerance', 'kind'];

/** A part as published: its listed fields, operations and apertures cleaned (kcdPublicPart, r1.html:81125). */
export function publicPart(p: Rec): Rec {
  const out = pick(p, PART_KEYS);
  if (Array.isArray(out.supportingModuleIds)) out.supportingModuleIds = out.supportingModuleIds.filter((x: unknown) => typeof x === 'string');
  if (Array.isArray(out.attachmentContacts)) out.attachmentContacts = out.attachmentContacts.map((row: Rec) => pick(row, CONTACT_KEYS));
  for (const key of ['worktopJoints', 'requiredSupports']) if (Array.isArray(out[key])) out[key] = out[key].map((row: Rec) => pick(row, JOINT_KEYS));
  for (const key of ['operations', 'proposedOperations', 'grooves']) if (Array.isArray(p[key])) out[key] = p[key].map((o: Rec) => pick(o, OPERATION_KEYS));
  if (Array.isArray(p.holes_mm)) out.holes_mm = p.holes_mm.map((o: Rec) => pick(o, OPERATION_KEYS));
  if (Array.isArray(p.apertures)) out.apertures = p.apertures.map((a: Rec) => pick(a, APERTURE_KEYS));
  return out;
}

/** The placed and pending parts of the kitchen, each once (kcdParts, r1.html:80993). */
export function bomParts(s: KitchenScene): Rec[] {
  const ids = new Set<string>();
  return [...allParts(s), ...pendingParts(s)].filter((p) => p && p.partId && !ids.has(p.partId) && (ids.add(p.partId), true));
}

/**
 * The appliances of the modules as rows (kcdAppliances, r1.html:81149). The overlay sink is not an appliance: it takes
 * the place of the worktop and is bought with the kitchen, its row is always counted and has no price (MOD-DEC-753,
 * FINDINGS 3193) — the price of the kitchen names it unknown.
 */
export function kitchenApplianceRows(s: KitchenScene): Rec[] {
  return s.modules.flatMap((m) => {
    if (overlaySink(m)) {
      const sink = [m.width, kitchen.constants.overlaySinkDepth.value];
      return [
        {
          rowId: m.id + ':overlay-sink',
          moduleId: m.id,
          category: 'purchase',
          name: `Накладная мойка ${sink[0]} × ${sink[1]} мм`,
          article: null,
          family: 'sink',
          mode: 'own',
          rateKey: `purchase:overlay-sink:${sink[0]}x${sink[1]}`,
          unpriced: 'накладная мойка — покупная позиция, модель и цена не выбраны',
          unit: 'piece',
          quantity: 1,
          included: true,
        },
      ];
    }
    const fallback = m.applianceModel || m.appliance?.model || m.applianceModelId || m.modelId;
    const appliances = Array.isArray(m.appliances) ? m.appliances : fallback ? [{ model: fallback, quantity: 1 }] : [];
    return appliances.map((a: Rec, i: number) => {
      const model = typeof a?.model === 'string' && a.model.trim() ? a.model.trim() : null,
        family = typeof a?.family === 'string' ? a.family : '',
        mode = typeof a?.mode === 'string' ? a.mode : '',
        quantity = a?.quantity === undefined ? 1 : Number.isInteger(a.quantity) && a.quantity > 0 ? a.quantity : null;
      return {
        rowId: m.id + ':appliance:' + i + ':' + (model || 'MODEL_UNKNOWN'),
        moduleId: m.id,
        category: 'appliance',
        name: 'Техника · ' + (model || family || 'Модель не указана'),
        article: model,
        family,
        mode,
        rateKey: 'appliance:' + (model || 'MODEL_UNKNOWN:' + family),
        unit: 'piece',
        quantity,
        included: !!s.costSettings?.includeAppliances,
      };
    });
  });
}

/** The rows of the bill: material, cut, edges, grooves and operations of each part, hardware, work, appliances (kcdBuildRows, r1.html:81177). */
export function bomRows(parts: Rec[], hardware: Rec[], modules: Rec[], appliances: Rec[]): Rec[] {
  const rows: Rec[] = [],
    push = (x: Rec) => rows.push(x);
  for (const p of parts) {
    const id = p.partId,
      quantity = p.quantity ?? p.count ?? 1,
      q = Number.isFinite(quantity) && quantity > 0 ? quantity : null,
      dim = p.finished_mm || [],
      blank = p.blank_mm || [],
      role = p.materialRole || 'CORPUS',
      cat = role === 'WORKTOP' ? 'worktop' : role === 'FACADE' ? 'facade' : role === 'GLASS' ? 'glass' : 'material',
      rectangular = blank.length === 3 && blank.every((x: number) => Number.isFinite(x) && x > 0),
      area = rectangular ? blank[0] * blank[1] : polygonArea(p.blank_polygon_mm);
    // MOD-DEC-573: a front bought ready-made is priced by m² of its projection at the price of its execution in the
    // catalogue of the release (price.ts); it is not cut, banded or cupped here — the supplier drills the cups (277).
    if (p.facadeSupply === 'PURCHASED') {
      push({
        rowId: id + ':material',
        partId: id,
        moduleId: p.moduleId,
        category: 'facade',
        name: `${p.name} · ${p.facadeTitle}`,
        article: p.facadeMaterialId + '/' + p.facadeExecutionId,
        rateKey: `facade:${p.facadeMaterialId}:${p.facadeExecutionId}`,
        unit: 'm2',
        quantity: dim.length === 3 && q !== null ? (dim[0] * dim[1] * q) / 1e6 : null,
        partQuantity: q,
        finished_mm: dim,
        contourRef: id,
        materialAreaBasis: 'PURCHASED_FINISHED_FRONT',
        included: true,
      });
      for (const [i, o] of (p.operations || []).entries())
        if (!/^(Чашка петли|Крепление чашки петли)/u.test(o.kind || ''))
          push({ rowId: id + ':operation:' + i, partId: id, moduleId: p.moduleId, category: 'operation', name: o.kind || 'Операция', rateKey: 'operation:' + (o.kind || 'drill'), unit: 'operation', quantity: q, qualified: o.production === true, included: true });
      continue;
    }
    push({
      rowId: id + ':material',
      partId: id,
      moduleId: p.moduleId,
      category: cat,
      name: p.name,
      article: p.materialCode || 'MATERIAL_UNKNOWN',
      rateKey: 'material:' + (p.materialCode || 'MATERIAL_UNKNOWN') + ':' + dim[2],
      unit: 'm2',
      quantity: area === null || q === null ? null : (area * q) / 1e6,
      partQuantity: q,
      finished_mm: dim,
      blank_mm: blank,
      contourRef: id,
      materialAreaBasis: rectangular ? 'PURCHASED_RECTANGULAR_BLANK' : 'PURCHASED_POLYGON_BLANK',
      ...(p.facadeMaterialId ? { facadeMaterialId: p.facadeMaterialId } : {}),
      included: true,
    });
    const cut = polygonLength(p.blank_polygon_mm) || (rectangular ? 2 * (blank[0] + blank[1]) : null);
    push({
      rowId: id + ':cut',
      partId: id,
      moduleId: p.moduleId,
      category: 'operation',
      name: 'Раскрой · ' + p.name,
      rateKey: p.finished_polygon_mm ? 'operation:contour-cut' : 'operation:rect-cut',
      unit: 'm',
      quantity: cut === null || q === null ? null : (cut * q) / 1000,
      included: true,
    });
    // MOD-DEC-440: the bevel of an end panel of a diagonal corner — a saw cut at an angle along the height of the end.
    if (p.bevel)
      push({ rowId: id + ':bevel', partId: id, moduleId: p.moduleId, category: 'operation', name: `Распил под углом ${Math.round(p.bevel.angleDeg)}° · ${p.name}`, rateKey: 'operation:bevel-cut', unit: 'm', quantity: q === null ? null : (dim[1] * q) / 1000, included: true });
    if (p.finished_polygon_mm) {
      const segments = p.edge_segments_mm;
      if (Array.isArray(segments)) {
        for (const [i, e] of segments.entries())
          if (e.thicknessMm > 0)
            push({ rowId: id + ':edge:' + i, partId: id, moduleId: p.moduleId, category: 'edge', name: 'Кромка · ' + p.name, rateKey: 'edge:' + e.thicknessMm, unit: 'm', quantity: Number.isFinite(e.lengthMm) ? (e.lengthMm * q) / 1000 : null, included: true });
      } else if (p.edgeStatus !== 'NOMINAL_UNBANDED' && p.edgeStatus !== 'UNBANDED')
        push({ rowId: id + ':edge:unknown', partId: id, moduleId: p.moduleId, category: 'edge', name: 'Кромки контура · ' + p.name, rateKey: 'edge:UNKNOWN', unit: 'm', quantity: null, included: true });
    } else {
      for (const side of ['left', 'right', 'top', 'bottom']) {
        const e = p.edge_mm?.[side];
        if (e > 0 || e === null)
          push({
            rowId: id + ':edge:' + side,
            partId: id,
            moduleId: p.moduleId,
            category: 'edge',
            name: 'Кромка · ' + p.name + ' · ' + side,
            rateKey: 'edge:' + (e ?? 'UNKNOWN'),
            unit: 'm',
            quantity: e === null ? null : ((['left', 'right'].includes(side) ? dim[1] : dim[0]) * q) / 1000,
            included: true,
          });
      }
    }
    for (const [i, g] of (p.grooves || []).entries())
      push({ rowId: id + ':groove:' + i, partId: id, moduleId: p.moduleId, category: 'operation', name: 'Паз · ' + p.name, rateKey: 'operation:groove', unit: 'operation', quantity: q, qualified: g.production === true, included: true });
    for (const [i, o] of (p.operations || []).entries())
      push({ rowId: id + ':operation:' + i, partId: id, moduleId: p.moduleId, category: 'operation', name: o.kind || 'Операция', rateKey: 'operation:' + (o.kind || 'drill'), unit: 'operation', quantity: q, qualified: o.production === true, included: true });
  }
  for (const [i, h] of hardware.entries()) {
    const unit = unitOf(h.unit);
    let q = num(h.quantity);
    if (h.unit === 'mm' && q !== null) q /= 1000;
    const article = h.article || h.sku || h.selectedSku || 'SKU_UNKNOWN',
      brand = h.brand || h.manufacturer || '';
    if (h.serviceScope === 'LABOUR_AND_CONSUMABLES') {
      push({
        rowId: h.physicalOperationId,
        moduleId: h.moduleId,
        partId: h.partId,
        apertureId: h.apertureId,
        physicalOperationId: h.physicalOperationId,
        category: 'operation',
        name: h.name,
        article: null,
        rateKey: 'operation:cutout-edge-sealing:labour-and-consumables',
        unit,
        quantity: q,
        included: h.included !== false,
        serviceScope: h.serviceScope,
      });
      continue;
    }
    if (h.unit === 'job') {
      push({
        rowId: h.rowId || h.moduleId + ':service:' + i,
        moduleId: h.moduleId,
        category: 'operation',
        name: h.name === 'cut-edge-sealant' ? 'Герметизация края выреза' : h.name || 'Монтажная операция',
        article: null,
        rateKey: h.name === 'cut-edge-sealant' ? 'operation:cut-edge-sealant' : 'operation:service:' + (h.name || article),
        unit: 'operation',
        quantity: q,
        included: h.included !== false && h.includedWithAppliance !== true,
        originalUnit: 'job',
        scope: 'Ставка работы и расходных материалов выбранной монтажной операции',
      });
      continue;
    }
    push({
      rowId: h.rowId || h.moduleId + ':hardware:' + i,
      moduleId: h.moduleId,
      category: 'hardware',
      name: h.name || article,
      article,
      brand,
      kitId: h.kitId || null,
      rateKey: 'hardware:' + brand + ':' + article,
      unit,
      quantity: q,
      included: h.included !== false && h.includedWithAppliance !== true,
      supply: h.supply || h.supplyStatus || h.purchase || 'separate',
      ...hardwareSupply(h),
    });
  }
  for (const m of modules) {
    push({ rowId: m.id + ':assembly', moduleId: m.id, category: 'work', name: 'Сборка · ' + m.name, rateKey: 'work:assembly:' + m.moduleTypeId, unit: 'module', quantity: 1, included: true });
    push({ rowId: m.id + ':installation', moduleId: m.id, category: 'work', name: 'Монтаж · ' + m.name, rateKey: 'work:installation:' + m.kind, unit: 'module', quantity: 1, included: true });
  }
  if (modules.length)
    for (const [key, name] of [
      ['design', 'Проектирование'],
      ['delivery', 'Доставка'],
    ])
      push({ rowId: 'project:' + key, category: 'work', name, rateKey: 'work:' + key, unit: 'project', quantity: 1, included: true });
  // A worktop cut at the wall is made and fitted on site: its quantities are an estimate (MOD-DEC-410).
  const onSite = new Set(parts.filter((p) => p.wallCut?.onSite).map((p) => p.partId));
  for (const r of rows) if (onSite.has(r.partId)) Object.assign(r, { estimate: true, note: 'Изготавливается и устанавливается по месту; количество примерное (MOD-DEC-410).' });
  return [...rows, ...appliances];
}

/** The bill of materials of the kitchen for its ProjectRevision (kcdBOM, r1.html:81540). */
export function kitchenBom(s: KitchenScene, revision: string): Rec {
  const parts = bomParts(s),
    hardware = kitchenHardware(s);
  return bomOf({ revision, parts, hardware, coverage: kitchenCoverage(s), rows: bomRows(parts, hardware, s.modules, kitchenApplianceRows(s)) });
}

/** The bill of materials of one reading of the kitchen: its parts, hardware, rows and coverage as published. */
export function bomOf(r: { revision: string; parts: Rec[]; hardware: Rec[]; coverage: Rec[]; rows: Rec[] }): Rec {
  return {
    schema: KITCHEN_BOM_SCHEMA,
    ProjectRevision: r.revision,
    units: { dimensions: 'mm', area: 'm2', length: 'm' },
    parts: r.parts.map(publicPart),
    hardware: r.hardware.map(publicHardware),
    rows: r.rows,
    coverage: r.coverage.map((c) => ({ moduleId: c.moduleId, moduleTypeId: c.moduleTypeId, completeGeometry: c.completeGeometry, manufacturingQualified: c.manufacturingQualified, status: c.status })),
    contoursFile: kitchenContoursFile(r.revision),
  };
}

/** The name of the contours file of a revision: the CSV files and the BOM refer to it (kcdBOM, kflowSpec, kflowDsp). */
export const kitchenContoursFile = (revision: string): string => 'modulero_kitchen_contours_' + revision + '.json';
