// The files of the kitchen (task K5, MIGRATION_PLAN step 4.5): the contours, the CSV of the specification and of the
// parts, the text of the cost with the completeness of the geometry. Each is a projection of one reading of the kitchen
// and of its cost (kcdContours r1.html:81520, kcdCSV 81568, kflowSpec 81578, kflowDsp 81588, kflowTxt 81606 with the
// release layer 70236, the coverage texts 70114–70224).
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { Rec } from '../engine/policy/project-state.js';
import { kitchenContoursFile, publicPart } from './bom.js';
import type { KitchenReading } from './cost.js';

export const KITCHEN_CONTOURS_SCHEMA = 'modulero.kitchen.contours.v1';

// ---------------------------------------------------------------- the completeness of the geometry

const cyrillic = /[А-Яа-яЁё]/;

/** An unknown field of a module in words (kflowCoverageFieldText, r1.html:70114). */
function fieldText(f: unknown): string {
  const labels: Rec = {
      'Rear hook and lock pilots': 'Отверстия заднего крюка и замков',
      'Wood material and payload': 'Материал коробов и допустимая нагрузка',
      'exact drying rack': 'Точная модель сушки',
      tray: 'Поддон сушки',
      'wall load': 'Нагрузка на стену',
      'door hardware': 'Фурнитура дверей',
    },
    states: Rec = {
      UNKNOWN: 'данные не определены',
      SITE_CHECK: 'нужна проверка на месте',
      TEMPLATE_REQUIRED: 'нужен заводской шаблон',
      MATERIAL_QUALIFICATION_REQUIRED: 'нужно проверить материал и нагрузку',
    };
  if (typeof f === 'string') return (labels[f] || (cyrillic.test(f) ? f : 'Отдельные данные конструкции и монтажа')) + ': требуется уточнение.';
  const x = f as Rec | null;
  if (x && typeof x.message === 'string' && cyrillic.test(x.message)) return x.message;
  if (x?.drawerId && x.field === 'box parts / bottom / runner / assembly') return x.drawerId + ': состав короба, дно, направляющие и сборка не определены; отсутствующие детали не включены в геометрию и стоимость.';
  const field = labels[x?.field] || (cyrillic.test(x?.field || '') ? x!.field : 'Данные конструкции и монтажа');
  return field + ': ' + (states[x?.status] || 'требуется уточнение') + '.';
}

/** The geometry is complete except the heat resistance of the chosen materials (kflowCoverageMaterialOnly, r1.html:70135). */
function materialOnly(r: Rec): boolean {
  const required = (r.unknownFields || []).filter((f: Rec) => f?.mandatoryForSelectedVariant && f.status === 'UNKNOWN' && /^Термостойкость корпуса для /.test(f.field || '')),
    nominal = r.nominalUnknownFields || [];
  return (
    !r.completeGeometry &&
    r.status === 'NEED_DATA' &&
    !r.geometryNote &&
    required.length > 0 &&
    nominal.length === required.length &&
    nominal.every((f: unknown) => required.some((x: Rec) => x.field === f)) &&
    !(r.unknownFields || []).some((f: Rec) => f?.status === 'UNKNOWN' && !required.includes(f)) &&
    (r.physicalPartIds || []).length === r.exportPartCount &&
    r.exportPartCount > 0 &&
    !(r.coverageIssues || []).length &&
    !(r.pendingParts || []).length &&
    !(r.nominalPartsOutsideExport || []).length &&
    !(r.islandUnknownFields || []).length &&
    !(r.rendererPendingPartCount || 0)
  );
}

/** One sentence on the completeness of the whole kitchen (kflowCoverageSummary, r1.html:70140). */
export function kitchenCoverageSummary(rows: Rec[]): string {
  if (!rows.length) return 'Модули ещё не добавлены. Добавьте модуль, чтобы проверить его состав.';
  const missing = rows.filter((r) => !r.completeGeometry && !materialOnly(r)),
    material = rows.filter(materialOnly),
    messages: string[] = [];
  if (missing.length) messages.push('Геометрический состав требует уточнения: ' + missing.map((r) => r.name + ' · ' + r.moduleId).join(', ') + '. Проверьте сообщения ниже.');
  if (material.length) messages.push('Термостойкость выбранных материалов не подтверждена: ' + material.map((r) => r.name + ' · ' + r.moduleId).join(', ') + '. Проверьте требования техники ниже.');
  return messages.length ? messages.join(' ') : 'Геометрический состав добавленных модулей рассчитан. Материалы, присадку, крепление и монтаж проверяют перед изготовлением.';
}

/** The completeness of every module in lines (kflowCoverageLines of the release, r1.html:70221). */
export function kitchenCoverageLines(rows: Rec[]): string[] {
  return [
    kitchenCoverageSummary(rows),
    ...rows.flatMap((r) => [
      `${r.moduleId} · ${r.name}: ${r.status === 'FAIL' ? 'ошибка геометрии' : r.completeGeometry ? 'геометрический состав рассчитан' : materialOnly(r) ? 'термостойкость выбранных материалов не подтверждена' : 'состав требует уточнения'}; собственных деталей в геометрии и экспорте ${r.exportPartCount}.`,
      ...(r.sharedPartRefs || []).map((p: Rec) => `${r.moduleId}: общая деталь ${p.partId} учтена один раз у модуля ${p.ownerModuleId}.`),
      ...(r.coverageIssues || []).map((x: string) => r.moduleId + ': ' + x),
      ...(r.geometryNote && cyrillic.test(r.geometryNote) ? [r.moduleId + ': ' + r.geometryNote.replace(/\bUNKNOWN\b/g, 'не определено')] : []),
      ...(r.nominalPartsOutsideExport || []).map((p: Rec) => `${r.moduleId}: ${p.name}, ${p.count ?? 'количество не определено'} шт. Положение не подтверждено; номинальная деталь не включена в размещённый состав.`),
      ...(r.unknownFields || []).map((f: unknown) => r.moduleId + ': ' + fieldText(f)),
      ...(r.nominalUnknownFields || []).map((f: unknown) => r.moduleId + ': ' + fieldText(f)),
      ...(r.islandUnknownFields || []).map((f: unknown) => r.moduleId + ': ' + fieldText(f)),
      ...(r.pendingParts || []).map((p: Rec) => `${r.moduleId}: ${p.name || p.partId}; положение или отображение этой детали не подтверждено. ${cyrillic.test(p.note || '') ? p.note : ''}`),
      ...((r.rendererPendingPartCount || 0) > 0 ? [`${r.moduleId}: ещё не отображены детали: ${r.rendererPendingPartCount}.`] : []),
      ...(r.polygonPartsOutsideRectExport || []).map(
        (p: Rec) => `${r.moduleId}: контур ${p.partId} хранится отдельно; прямоугольный габарит не заменяет форму. ${p.blankStatus === 'UNKNOWN' || p.edgeStatus === 'UNKNOWN' ? 'Заготовку и кромки требуется уточнить.' : ''}`,
      ),
      ...(r.geometryBasis === 'IDEAL_90' || r.actualCornerAngleStatus ? [`${r.moduleId}: расчёт угла выполнен по идеальной геометрии; фактический угол и примыкание к стенам нужно проверить замером.`] : []),
      ...(r.hasUnqualifiedDrilling ? [`${r.moduleId}: присадка и отверстия требуют применимого шаблона, проверки материала и инструмента; автоматическое изготовление не подтверждено.`] : []),
      ...(r.hasSupportQualification ? [`${r.moduleId}: опирание деталей, нагрузки, закрепление и фактические условия установки проверяют перед изготовлением.`] : []),
    ]),
  ];
}

// ---------------------------------------------------------------- contours and CSV

const rectangle = (d: number[]): number[][] => [[0, 0], [d[0]!, 0], [d[0]!, d[1]!], [0, d[1]!]];

/** The contours of the parts: finished and blank, a rectangle where the part has no polygon (kcdContours, r1.html:81520). */
export function kitchenContours(r: KitchenReading): Rec {
  return {
    schema: KITCHEN_CONTOURS_SCHEMA,
    ProjectRevision: r.revision,
    units: 'mm',
    datum: 'part local planar coordinates; thickness normal to contour',
    parts: r.parts.map((p) => ({
      ...publicPart(p),
      contourId: p.partId,
      finishedContourMm: p.finished_polygon_mm || rectangle(p.finished_mm || []),
      blankContourMm: p.blank_polygon_mm || (p.blank_mm?.length === 3 ? rectangle(p.blank_mm) : null),
      shape: p.finished_polygon_mm ? 'polygon' : 'rectangle',
      productionQualified: p.drillingStatus === 'QUALIFIED' && (!p.operations?.length || p.operations.every((o: Rec) => o.production === true)),
    })),
  };
}

/** A CSV cell: quoted, objects as JSON, a formula-like start escaped (kcdCell, r1.html:81562). */
function cell(v: unknown): string {
  if (v == null) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** A CSV with «;» (kcdCSV, r1.html:81568); the file is written with a BOM. */
function csv(rows: Rec[], fields: readonly string[]): string {
  return [fields.map(cell).join(';'), ...rows.map((r) => fields.map((k) => cell(r[k])).join(';'))].join('\n') + '\n';
}

const SPEC_FIELDS = ['ProjectRevision', 'rowId', 'partId', 'moduleId', 'category', 'name', 'article', 'brand', 'kitId', 'quantity', 'unit', 'included', 'finished_mm', 'blank_mm', 'contourRef', 'contoursFile', 'rateKey', 'originalUnit', 'billingKind', 'components', 'includedWithAppliance', 'includesStatus', 'stockLengthMm', 'cutPlan', 'wasteMm'];
const DSP_FIELDS = ['ProjectRevision', 'partId', 'moduleId', 'name', 'material', 'quantity', 'finished_mm', 'blank_mm', 'shape', 'edge_mm', 'contourRef', 'contoursFile', 'status'];

/** The specification: every row of the BOM (kflowSpec, r1.html:81578). */
export function kitchenSpecificationCsv(r: KitchenReading): string {
  const file = kitchenContoursFile(r.revision);
  return csv(r.rows.map((x) => ({ ...x, ProjectRevision: r.revision, finished_mm: x.finished_mm || null, blank_mm: x.blank_mm || null, contoursFile: file })), SPEC_FIELDS);
}

/** The parts with their finished and blank sizes and edges (kflowDsp, r1.html:81588). */
export function kitchenPartsCsv(r: KitchenReading): string {
  const file = kitchenContoursFile(r.revision);
  return csv(
    r.parts.map((p) => ({
      ProjectRevision: r.revision,
      partId: p.partId,
      moduleId: p.moduleId,
      name: p.name,
      material: p.materialCode,
      quantity: p.quantity ?? p.count ?? 1,
      finished_mm: p.finished_mm,
      blank_mm: p.blank_mm,
      shape: p.finished_polygon_mm ? 'polygon' : 'rectangle',
      edge_mm: p.edge_mm,
      contourRef: p.partId,
      contoursFile: file,
      status: p.blankStatus || p.status,
    })),
    DSP_FIELDS,
  );
}

// ---------------------------------------------------------------- the text of the cost

/** A number with at most 12 significant digits (kcdDisplayNumber, r1.html:81378). */
function displayNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const precise = value.toPrecision(12);
  return Math.abs(value) >= 1e12 || (value !== 0 && Math.abs(value) < 1e-6) ? precise.replace(/(\.\d*?[1-9])0+(?=e)|\.0+(?=e)/, '$1') : String(Number(precise));
}

/** A price or «Цена не определена» (kcdPriceText, r1.html:81383). */
export const kitchenPriceText = (value: number | null | undefined): string => (value === null || value === undefined ? 'Цена не определена' : displayNumber(value));

/** The status of a cost in words (kcdCostStatusText, r1.html:81399). */
export const kitchenCostStatusText = (cost: Rec): string => (cost.total === null ? 'Стоимость рассчитана частично' : 'Стоимость рассчитана полностью');

/** The composition of a kit and the contact of a connector in words (kcdSupplyText, r1.html:81571). */
function supplyText(row: Rec): string {
  const components = row.components;
  let kit = '';
  if (Array.isArray(components))
    kit = components.length
      ? 'Состав комплекта: ' +
        components
          .map(
            (c: Rec) =>
              (c.name || c.article || 'Позиция без наименования') +
              (c.article && c.name ? ' · ' + c.article : '') +
              ' · ' + (c.quantity ?? 'UNKNOWN') + ' ' + (c.unit || 'piece') +
              (c.includedWithAppliance ? ' · входит в комплект техники' : c.purchase === 'included' ? ' · входит в комплект' : ''),
          )
          .join('; ')
      : '';
  else if (components && typeof components === 'object')
    kit = 'Состав комплекта: ' + Object.entries(components).map(([name, quantity]) => name + ' · ' + (quantity ?? 'UNKNOWN') + ' piece').join('; ');
  const contact = row.contactId ? 'Примыкание ' + row.contactId + '; ' + (row.actualPartIds || []).join(' / ') + '; контакт ' + row.contactLengthMm + '×' + row.contactHeightMm + 'мм; пакет ' + row.stackThicknessMm + 'мм' : '';
  return [kit, contact].filter(Boolean).join(' · ');
}

/** The text of the cost with the completeness of the geometry (kflowTxt r1.html:81606 with the release layer 70236). */
export function kitchenQuoteText(c: Rec, coverage: Rec[]): string {
  const text = [
    'MODULERO · оценка кухни',
    'ProjectRevision: ' + c.ProjectRevision,
    'Валюта: ' + c.currency,
    'Статус: ' + kitchenCostStatusText(c),
    'Неоценённые позиции: ' + c.unpricedItems.length,
    c.pricingBasis,
    ...c.scopeAssumptions,
    'Техника: ' + (c.includeAppliances ? 'включена в итог' : 'показана отдельно; исключена из итога'),
    ...c.items.map(
      (x: Rec, i: number) =>
        [x.rowId, x.name, x.quantity ?? 'UNKNOWN', x.unit, kitchenPriceText(x.rate?.price), kitchenPriceText(x.amount), x.included ? 'включено' : 'исключено', x.rate?.source || '', x.rate?.date || '', x.rate?.region || '', x.rate?.tax || '', supplyText(x)].join(';') +
        // MOD-DEC-511: the note of whole units once, after the last row of a run with it, as the wardrobe (FINDINGS 814).
        (x.note && c.items[i + 1]?.note !== x.note ? '\nПояснение: ' + x.note : ''),
    ),
    (c.total === null ? 'Известная часть (частичная оценка): ' : 'Известная часть: ') + (c.knownSubtotal === null ? kitchenPriceText(null) : c.knownSubtotal),
    'Итог: ' + kitchenPriceText(c.total),
    // MOD-DEC-028, 436: the supplier cost, C and the conditional rates, when the cost is priced by the rate card.
    ...(c.card
      ? [
          'Себестоимость поставщика: ' + kitchenPriceText(c.supplierCost),
          'Себестоимость C: ' + kitchenPriceText(c.internalCost),
          'Цена клиента: ' + kitchenPriceText(c.customerPrice),
          ...c.temporary.map((x: string) => 'Цена условная: ' + x),
        ]
      : []),
    ...c.unpricedItems.map((x: Rec) => 'Цена не определена: ' + x.name + ' · ' + x.rowId),
    ...c.technicalIncomplete.map((x: Rec) => 'Техническое ограничение: ' + (x.rowId || x.moduleId) + ' · ' + x.reason),
    ...c.missing.map((x: string) => 'Неоценённая позиция или ограничение: ' + x),
    'Документы геометрии; производство допускается только по квалифицированным операциям.',
  ].join('\n') + '\n';
  return text + '\n\nПолнота геометрии и экспорта\n' + kitchenCoverageLines(coverage).join('\n');
}
