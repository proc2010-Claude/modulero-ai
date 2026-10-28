// CSV projections of the wardrobe in the prototype's format (task W3): specification, cut list (dspdetal) and
// drilling. Ports of the last layers of r1.html: escCsv, rowsToCsv (14864, 14878), specificationCsv (15128 and the
// material-selection layer 58715), dspdetalCsv (15133), drillingCsv (15142 and the r7 header 88350). The input is a
// model in the prototype's shape — the reverse projection of the graph (engine/generators/wardrobe.ts).
import { DE_VERSION, deBlank } from '../engine/policy/depth.js';
import { productionCoordinateSystemForPart } from '../engine/policy/edge-model.js';
import { mfChoice, mfLabel, mfPartMaterial, mfPurchased } from '../engine/policy/materials.js';
import type { MaterialCatalog } from '../catalog/materials.js';
import type { PolicyState, Rec } from '../engine/policy/project-state.js';
import type { WardrobeInput } from './input.js';
import { r1 } from './standard.js';

/** data-code of the built-in options of #material (r1.html:3548); an option of the catalog has `MF:<decorId>` (58293). */
const MATERIAL_CODES: Readonly<Record<string, string>> = Object.freeze({ '1610': 'W960', '1715': 'W980', '1703': 'U708', '1785': 'U702' });

/** First line of the drilling file while the r7 fasteners exist (r1.html:88352). */
export const F7_DRILLING_HEADER = '# НОМИНАЛЬНЫЙ ЧЕРНОВИК r7; операции F7 не являются производственной картой; глубины11/26 условные; посадка головки и ход инструмента UNKNOWN';

/** `m.material` of the prototype (r1.html:13300): the label of the chosen corpus decor, else the code of the #material option. */
export function exportMaterial(input: WardrobeInput, d: PolicyState, mc: MaterialCatalog): string {
  const corpus = mfChoice('corpus', d);
  if (corpus) return String(mfLabel(corpus.decorId, mc));
  const v = input.controls.material;
  return v.startsWith('MF:') ? v.slice(3) : (MATERIAL_CODES[v] ?? v);
}

export function escCsv(v: unknown): string {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

export const rowsToCsv = (rows: unknown[][]): string => rows.map((r) => r.map(escCsv).join(';')).join('\n');

export function specificationCsv(m: Rec, d: PolicyState, mc: MaterialCatalog): string {
  if (!d.materialSelection) {
    const rows: unknown[][] = [['ID', 'Модуль', 'Секция', 'Деталь', 'Готовая длина с кромкой', 'Готовая ширина с кромкой', 'Толщина', 'Количество', 'A', 'B', 'C', 'D', 'dimensionBasis', 'transformId']];
    for (const p of m.parts) rows.push([p.id, p.moduleId || '', p.sectionId || '', p.name, p.L, p.W, p.T, p.q, p.edges.A, p.edges.B, p.edges.C, p.edges.D, p.dimensionBasis ?? 'UNKNOWN', DE_VERSION]);
    return rowsToCsv(rows);
  }
  const rows: unknown[][] = [['ID', 'Деталь', 'Длина', 'Ширина', 'Толщина', 'Количество', 'A', 'B', 'C', 'D', 'Материал', 'Назначение', 'Референс декора', 'Рабочий ID', 'Версия источника', 'Отделка', 'Статус кромки']];
  for (const p of m.parts) {
    const x = mfPartMaterial(p, d, mc);
    rows.push([p.id, p.name, r1(p.L), r1(p.W), p.T, p.q, p.edges.A, p.edges.B, p.edges.C, p.edges.D, x?.label ?? m.material, mfPurchased(p) ? 'Покупная готовая деталь' : 'Заготовка для изготовления в составе заказа', x?.referenceLabel ?? x?.decorId ?? '', x?.workingVariantId ?? '', x?.sourceVersion ?? '', x?.textureCode ?? '', x?.edgeSelection ?? '']);
  }
  return rowsToCsv(rows);
}

/**
 * First line of the cut list of a project that is not ready for production (WR-24; MOD-DEC-047, Handbook §24.2):
 * the prototype wrote the blanks without it, as if the file were an order to the workshop.
 */
export const NOT_FOR_PRODUCTION_HEADER = '# НЕ ДЛЯ ПРОИЗВОДСТВА: номинальные заготовки предварительного расчёта; технологические припуски не квалифицированы, раскрой и присадку уточняет мебельщик';

export function dspdetalCsv(m: Rec, qualification?: 'PRODUCTION' | 'NOT_FOR_PRODUCTION'): string {
  const rows: unknown[][] = [['Присадка', '№', 'Модуль', 'Секция', 'Длина заготовки без кромки', 'Ширина заготовки без кромки', 'Кол-во', 'Материал', 'Цвет кромки', 'A', 'B', 'C', 'D', 'Оригинальный номер', 'sourceBasis', 'dimensionBasis', 'transformId']];
  m.parts
    // The prototype buys every front ready-made; a door made in the order is a blank of the cut list (FINDINGS 266).
    .filter((p: Rec) => !mfPurchased(p))
    .forEach((p: Rec, i: number) => {
      const b = deBlank(p);
      if (b.status !== 'NOMINAL') throw Error(p.id + ': ' + b.reason);
      const drilled = m.holes.some((h: Rec) => h.panel === p.id) || (m.grooves || []).some((g: Rec) => g.panel === p.id);
      rows.push([drilled ? 'o' : '', i + 1, p.moduleId || '', p.sectionId || '', b.L, b.W, p.q, p.materialFamily === 'HDF' ? 'ХДФ ' + p.T + ' мм' : p.kind === 'slidingInsert' ? `${m.material} · ЛДСП ${p.T} мм` : m.material, m.material, p.edges.A, p.edges.B, p.edges.C, p.edges.D, p.id, b.sourceBasis, b.dimensionBasis, b.transformId]);
    });
  const csv = rowsToCsv(rows);
  return qualification === 'NOT_FOR_PRODUCTION' ? NOT_FOR_PRODUCTION_HEADER + '\n' + csv : csv;
}

export function drillingCsv(m: Rec): string {
  const partMap: Record<string, Rec> = Object.fromEntries(m.parts.map((p: Rec) => [p.id, p])),
    rows: unknown[][] = [['Деталь', 'Модуль', 'Секция', 'ID операции', 'Режим', 'Сторона/грань', 'Производственная X', 'Производственная Y/отступ', 'Domain X', 'Domain Y', 'Диаметр/ширина', 'Глубина', 'Условное обозначение', 'Назначение', 'Семантика/роль', 'Профиль/пресет', 'Статус производства', 'dimensionBasis', 'coordinateStage', 'transformId']];
  for (const h of m.holes) {
    const p = partMap[h.panel],
      face = h.mode === 'face',
      q = face && p ? productionCoordinateSystemForPart(p, h.face).coordinatePoint(h.x, h.y) : null;
    rows.push([h.panel, p?.moduleId || '', p?.sectionId || '', h.operationId, h.mode, face ? h.face : h.edge, face ? r1(q!.u) : '', face ? r1(q!.v) : h.offset, face ? h.x : '', face ? h.y : '', h.diameter, h.depth, h.code, h.purpose, h.machiningRole || '', h.fastenerPresetId || '', h.fastenerPresetId ? 'PRESET_SEMANTICS_ONLY' : '', h.dimensionBasis ?? 'UNKNOWN', h.coordinateStage ?? 'UNKNOWN', h.dimensionTransformId ?? 'UNKNOWN']);
  }
  for (const g of m.grooves || []) {
    const p = partMap[g.panel],
      production = p ? productionCoordinateSystemForPart(p, g.face) : null,
      a = production ? (g.orientation === 'W' ? production.coordinatePoint(g.offset, g.start) : production.coordinatePoint(g.start, g.offset)) : null,
      b = production ? (g.orientation === 'W' ? production.coordinatePoint(g.offset, g.end) : production.coordinatePoint(g.end, g.offset)) : null;
    rows.push([g.panel, p?.moduleId || '', p?.sectionId || '', g.operationId, 'groove', g.face, a && b ? `${r1(a.u)}-${r1(b.u)}` : '', a && b ? `${r1(a.v)}-${r1(b.v)}` : '', `${g.start}-${g.end}`, g.offset, g.width, g.depth, `${g.semanticType} → ${g.width}×${g.depth}`, g.purpose, g.semanticType, g.resolvedMachining.profileId, g.resolvedMachining.productionConfirmed ? 'CONFIRMED' : 'REQUIRES TECHNOLOGY CONFIRMATION', g.dimensionBasis ?? 'UNKNOWN', g.coordinateStage ?? 'UNKNOWN', g.dimensionTransformId ?? 'UNKNOWN']);
  }
  const csv = rowsToCsv(rows);
  return m.fastenersR7 ? F7_DRILLING_HEADER + '\n' + csv : csv;
}

export interface WardrobeCsv {
  specification: string;
  dspdetal: string;
  drilling: string;
}

/**
 * The three CSV files of the prototype for a model `m` with `m.material` set (exportMaterial). With the qualification
 * of the graph the cut list of a project not ready for production says so in its first line (WR-24).
 */
export const wardrobeCsv = (m: Rec, d: PolicyState, mc: MaterialCatalog, qualification?: 'PRODUCTION' | 'NOT_FOR_PRODUCTION'): WardrobeCsv => ({ specification: specificationCsv(m, d, mc), dspdetal: dspdetalCsv(m, qualification), drilling: drillingCsv(m) });
