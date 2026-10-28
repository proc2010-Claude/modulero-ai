// The rate card of the kitchen (task K5, MOD-DEC-436): the price of a row the maker's file of rates does not price,
// as the swing wardrobe has it (W11). In this order of trust: a rate of the maker's file (cost.ts); an owner decision;
// a catalogue (the edge price list) or a price found for the exact article; a conditional price by an analogue
// (MOD-DEC-264, «Цена условная») — the prototype's number of the wardrobe or a shop's price of a like article. A row
// with none of them stays without a price: «Цена не определена», never a zero (MOD-DEC-157, 247). The numbers are the
// policy `kitchenPrice` (engine/policy/kitchen-price.ts) and the card of the wardrobe they share; the prices of the
// hardware by article are the records of the hardware catalogue of the release (MOD-DEC-536, FINDINGS 994). Pure.
import { facadeExecutionOf, facadeMaterialOf } from '../catalog/hardware/facades.js';
import { catalogPrices } from '../catalog/hardware/prices.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { kitchenPrice as policy, type KitchenCardEntry } from '../engine/policy/kitchen-price.js';
import { mfDecor } from '../engine/policy/materials.js';
import type { Rec } from '../engine/policy/project-state.js';
import { edgeRateOf, wardrobePrice as wardrobe } from '../engine/policy/wardrobe-price.js';
import { EDGE_PRICE_CATALOG } from '../wardrobe/edges.js';
import { releaseBoardOf } from '../catalog/materials.js';
import { boardSheetPrice, decorOfCode } from '../wardrobe/price.js';

/** A number in the text of a basis: the decimal comma. */
const ru = (x: number) => String(x).replace('.', ',');
const C = policy.constants,
  W = wardrobe.constants;

/** Where a rate of the cost comes from (W11, wardrobe/price.ts): the maker's file, a decision, a catalogue, a temporary value. */
export type KitchenRateOrigin = 'MAKER' | 'DECISION' | 'CATALOG' | 'TEMPORARY';

/** A rate of the card for one row of the cost. */
export interface KitchenCardRate {
  price: number;
  origin: Exclude<KitchenRateOrigin, 'MAKER'>;
  /** What the rate is: the decision, the catalogue, the shop and the article, or the analogue. */
  basis: string;
  /** The amount is rounded up to this step, ₽: a found or conditional price of hardware (MOD-DEC-346). */
  roundUpToRub?: number;
}

/** The rate card as the evaluation of the rows reads it (kitchenEvaluate). */
export interface KitchenCard {
  /** id/version of the card: part of the price snapshot of the graph. */
  id: string;
  rate(row: Rec): KitchenCardRate | null;
  /** Why the row is not priced by itself: the work the percent of MOD-DEC-402 covers, or a kit of an appliance (437). */
  replaced(row: Rec): string | null;
}

/** The id of the card of a release: the policy and the catalogue release that holds the prices of the hardware (536). */
export const kitchenCardId = (hw: HardwareCatalogs): string => `${policy.id}/${policy.version}+${hw.release.version}`;

/** A row of the specification names no maker (`PROJECT_SPECIFICATION`, empty): its article alone finds the record. */
const MAKERLESS = new Set(['', 'PROJECT_SPECIFICATION']);

/** The edge band of the kitchen by its thickness, mm → the service profile of the price list (wardrobe/edges.ts). */
const EDGE_PROFILE: Readonly<Record<string, string>> = { '0.4': 'PVC_ABS_0_4', '0.8': 'PVC_ABS_0_8_1_0', '1': 'PVC_ABS_0_8_1_0', '2': 'PVC_ABS_2_0' };

const entry = (e: KitchenCardEntry | null | undefined, step?: number): KitchenCardRate | null =>
  e ? { price: e.rate, origin: e.project ? 'DECISION' : e.found ? 'CATALOG' : 'TEMPORARY', basis: e.basis, ...(step ? { roundUpToRub: step } : {}) } : null;

const temporary = (price: number, basis: string): KitchenCardRate => ({ price, origin: 'TEMPORARY', basis });

/** A rate of the card the project set: an averaged price of the project (MOD-DEC-569, docs/product/PRICE_GAPS.md). */
const project = (price: number, basis: string): KitchenCardRate => ({ price, origin: 'DECISION', basis: `${basis} — усреднённая цена проекта (MOD-DEC-569)` });

/**
 * The rate of a row of whole sheets of the cutting plan (MOD-DEC-508, 510; kitchen/sheets.ts), per m² of the sheet: the
 * price of a sheet of the board of its decor — the decor of the shared catalogue of the material code (W980 →
 * DEC-EGG-W980-ST7), else the averaged price of a sheet of the project, as the wardrobe (FINDINGS 1604); the HDF of the
 * back the price of the board of HDF of the release (FINDINGS 1607), else conditionally the rate of the HDF of the card
 * times the area of the sheet.
 */
function sheetRate(row: Rec, decor: string, thickness: string, hw: HardwareCatalogs): KitchenCardRate | null {
  const [h, w] = row.sheet.sheetMm as [number, number],
    size = `${h} × ${w} мм`,
    larger = row.sheet.larger ? ' — заготовка больше листа, условно целый лист на заготовку' : '';
  if (decor === C.backMaterial.value) {
    const board = releaseBoardOf(hw.materials, 'HDF', Number(thickness), h, w);
    if (board) {
      const rate = { price: board.priceRub / ((h * w) / 1e6), basis: `цена листа ${board.id} каталога материалов ${board.priceRub} ₽ за лист ${size}: ${board.priceBasis} — ХДФ задней стенки${larger}` };
      return row.sheet.larger ? { ...rate, origin: 'TEMPORARY' } : { ...rate, origin: 'CATALOG' };
    }
  }
  // Without a board of HDF of that thickness and format in the catalogue, a sheet by the rate per m² is conditional (508).
  if (decor === C.backMaterial.value) return temporary(C.hdfRateRub.value, `цена листа ХДФ задней стенки ${size} не задана — условно ставка ХДФ карты ${ru(C.hdfRateRub.value)} ₽/м² × площадь листа (MOD-DEC-508, 510)${larger}`);
  if (!decor || decor === 'MATERIAL_UNKNOWN' || !C.boardThicknesses.value.includes(Number(thickness))) return null;
  // A sheet of ЛМДФ of the fronts by the price of its sheet in the catalogue, else by the rate of ЛМДФ (FINDINGS 1606).
  const sheet = boardSheetPrice(decorOfCode(decor, hw.materials) ?? (mfDecor(decor, hw.materials) ? decor : null), Number(thickness), h, w, hw.materials, row.sheet.family === 'LMDF' ? 'LMDF' : 'LDSP');
  if (!sheet) return null;
  const rate = { price: sheet.rub / ((h * w) / 1e6), basis: `${sheet.basis} — плита ${decor} ${thickness} мм${larger}` };
  return row.sheet.larger ? { ...rate, origin: 'TEMPORARY' } : { ...rate, origin: sheet.origin };
}

/**
 * The rate card of one kitchen and the hardware catalogue of its release: the thickness of a part is read from its
 * material row (the edge price depends on it).
 */
export function kitchenCard(rows: Rec[], hw: HardwareCatalogs, parts: Rec[] = []): KitchenCard {
  const thickness = new Map<string, number>();
  for (const x of rows) if (x.rowId === x.partId + ':material' && Array.isArray(x.blank_mm)) thickness.set(x.partId, x.blank_mm[2]);
  // Version 9 (FINDINGS 1600): a groove is priced by the metre of its length, as the wardrobe's — the longest side of
  // its box [x0, x1, y0, y1, z0, z1]; the row of the bill stays one operation per groove, as the prototype's (kcdRows).
  const grooveM = new Map<string, number>();
  for (const p of parts)
    for (const [i, g] of (p.grooves || []).entries()) {
      const b = g.localBox;
      if (Array.isArray(b) && b.length === 6 && b.every((x: unknown) => Number.isFinite(x))) grooveM.set(`${p.partId}:groove:${i}`, Math.max(Math.abs(b[1] - b[0]), Math.abs(b[3] - b[2]), Math.abs(b[5] - b[4])) / 1000);
    }
  const step = C.roundLine.value ? W.priceStepRub.value : undefined,
    prices = catalogPrices(hw);
  return {
    id: kitchenCardId(hw),
    replaced(row) {
      const key = String(row.rateKey);
      if (C.coveredByAssembly.value.some((p) => key.startsWith(p))) return `сборка и монтаж — ${W.assemblyPercent.value}% от C (MOD-DEC-402, 436)`;
      if (C.worktopWorks.value.some((p) => key.startsWith(p))) return `сборка и монтаж — ${W.assemblyPercent.value}% от C (MOD-DEC-402, 437)`;
      // A kit of an appliance (its own kitComponents, hardware.ts) is a part of the appliance, not furniture hardware.
      if (C.applianceKits.value && row.applianceKit === true && String(row.physicalId).includes('/appliance-kit/')) return 'технику: цена кухни её не считает (MOD-DEC-437)';
      return null;
    },
    rate(row) {
      const key = String(row.rateKey),
        [kind, a, b] = key.split(':');
      if (row.category === 'appliance') return null;
      // MOD-DEC-573: a front bought ready-made — the price of its execution in the catalogue of the materials of the
      // facades of the release, per m² of one projection; a price the catalogue does not give is unknown (247).
      if (kind === 'facade') {
        const m = facadeMaterialOf(hw.facades, a),
          e = facadeExecutionOf(m, b),
          price = e?.priceRubPerM2.value ?? null;
        return price === null ? null : { price, origin: 'CATALOG', basis: `${m!.title} · ${e!.title} — каталог материалов фасадов ${price} ₽/м² одной проекции, ориентир (MOD-DEC-573): ${hw.facades.priceSource}` };
      }
      // A board of the fronts without a price in the catalogue: «Цена не определена», not the rate of another board (247,
      // 573). The ЛМДФ has the price of its whole sheet in the catalogue since FINDINGS 1606, not a rate of its blank.
      const front = row.facadeMaterialId ? facadeMaterialOf(hw.facades, row.facadeMaterialId) : null;
      if (front?.boardPrice === 'UNKNOWN' || (front?.boardProduct?.includes('ЛМДФ') && !row.sheet)) return null;
      if (kind === 'material') {
        if (row.sheet) return sheetRate(row, a!, b!, hw);
        if (row.category === 'worktop') return entry(C.worktop.value);
        if (row.category === 'glass') return entry(C.glass.value);
        if (a === C.backMaterial.value) return project(C.hdfRateRub.value, `ХДФ задней стенки — ставка ХДФ карты ${ru(C.hdfRateRub.value)} ₽/м²`);
        // A decor of the corpus or of the fronts at a board thickness: the board of the wardrobe card (FINDINGS 522).
        if (a && a !== 'MATERIAL_UNKNOWN' && C.boardThicknesses.value.includes(Number(b)))
          return project(W.boardRateRub.value, `плита ${a} ${b} мм — ставка плиты карты шкафа ${ru(W.boardRateRub.value)} ₽/м² по площади заготовки`);
        return null;
      }
      if (kind === 'edge') {
        const t = thickness.get(row.partId),
          s = EDGE_PRICE_CATALOG.services.find((x) => x.profileCode === EDGE_PROFILE[a] && x.panelServiceCategory === 'STANDARD' && t !== undefined && t >= x.panelThicknessMin && t <= x.panelThicknessMax);
        if (!s) return null;
        const rate = edgeRateOf(s);
        return rate === null
          ? { price: s.pricePerM, origin: 'CATALOG', basis: `прайс кромления ${EDGE_PRICE_CATALOG.provider} от ${EDGE_PRICE_CATALOG.effectiveDate}: кромка ${a} мм, плита ${t} мм` }
          : project(rate, `кромка ${a} мм, плита ${t} мм — ставка кромления карты шкафа ${ru(rate)} ₽/м, средняя цен цехов (FINDINGS 1836)`);
      }
      if (kind === 'operation') {
        // FINDINGS 1905: the saw run of a blank larger than the sheet is conditional, as its whole sheet (WR-10).
        if (a === 'rect-cut' && row.largerCut)
          return temporary(W.sawRateRub.value, `условно ставка распила карты шкафа ${ru(W.sawRateRub.value)} ₽/м реза: заготовки нет в карте раскроя, нужен больший формат или стык (решает мебельщик)`);
        if (a === 'rect-cut' || a === 'contour-cut') return project(W.sawRateRub.value, `распил — ставка карты шкафа ${ru(W.sawRateRub.value)} ₽/м реза`);
        // MOD-DEC-440: the bevel of a diagonal corner has no rate of its own; the project prices it as the saw cut (569).
        if (a === 'bevel-cut') return project(W.sawRateRub.value, `распил под углом — как распил, ставка карты шкафа ${ru(W.sawRateRub.value)} ₽/м реза (MOD-DEC-440)`);
        if (a === 'groove') {
          const m = grooveM.get(String(row.rowId));
          return m === undefined ? null : project(Math.round(C.grooveRubPerM.value * m * 100) / 100, `паз ${Math.round(m * 1000)} мм — ставка паза карты ${ru(C.grooveRubPerM.value)} ₽/м × длина`);
        }
        if (/^Чашка петли/u.test(a)) return project(C.cupRub.value, `чашка петли — ставка карты ${ru(C.cupRub.value)} ₽`);
        // A hole of the graph: every operation of a part but the cut-out of a worktop (INV-P02, FINDINGS 578); the
        // cut-out and its sealing are the assembly's (MOD-DEC-437, replaced), another service has no rate (247).
        if (row.unit === 'operation' && b === undefined && !['Вырез столешницы', 'cut-edge-sealant'].includes(a)) return project(C.holeRub.value, `отверстие — ставка карты ${ru(C.holeRub.value)} ₽`);
        return null;
      }
      if (kind === 'hardware') {
        const rest = key.slice('hardware:'.length),
          at = rest.indexOf(':'),
          brand = rest.slice(0, at),
          p = at < 0 ? null : prices.article(MAKERLESS.has(brand) ? null : brand, rest.slice(at + 1));
        return p ? { price: p.rub, origin: p.temporary ? 'TEMPORARY' : 'CATALOG', basis: p.basis, ...(step ? { roundUpToRub: step } : {}) } : null;
      }
      if (key === 'work:delivery') return project(W.deliveryRub.value, `доставка — ставка карты шкафа ${W.deliveryRub.value} ₽`);
      return null;
    },
  };
}
