// The boards of the kitchen by whole sheets of the cutting plan (MOD-DEC-510): the price takes the sheets and the saw
// run of the plan of the graph, as the wardrobe does (505), instead of the area of the blanks and a cut around each
// part (the prototype, FINDINGS 623). The rows of the parts stay in the BOM and in the cost, marked as replaced; one
// row of sheets per board and one row of the saw run take their place. A sheet is priced by the rate of its board per
// m² — the maker's own or the card's — times its area, or by the price of the sheet of the catalogue (508). Pure.
import type { PlanarSize } from '../engine/contract.js';
import { materialTitle, type CuttingGroup, type CuttingPlan } from '../engine/cutting.js';
import type { Rec } from '../engine/policy/project-state.js';
import { LEFTOVERS_NOTES } from '../engine/policy/purchase-units.js';
import { wardrobePrice } from '../engine/policy/wardrobe-price.js';

/** The families of the plan the price buys as sheets: the worktop and the glass have their own rows; the ЛМДФ of the fronts too (FINDINGS 1606). */
const SHEET_FAMILIES = new Set(['LDSP', 'LMDF', 'HDF', 'MDF', 'UNKNOWN']);

const area = (mm: readonly [number, number]) => (mm[0] * mm[1]) / 1e6;
const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'лист' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'листа' : 'листов');

/** The sheet the price counts a blank larger than the sheet as (WR-10): the largest format of its family. */
export function largestSheet(g: CuttingGroup): [number, number] {
  const C = wardrobePrice.constants,
    formats = [g.sheetMm!, ...(g.material.family === 'HDF' ? C.hdfFormats.value : C.boardFormats.value)] as [number, number][];
  return formats.reduce((a, f) => (area(f) > area(a) ? f : a));
}

/**
 * The rows of the cost with the boards by the cutting plan: the material and the rectangular cut of every part of a
 * board of the plan are replaced; the board gets a row of its sheets (and one of its blanks larger than the sheet, one
 * whole sheet each, conditionally), the plan a row of its saw run. A board whose sheet is not known keeps its rows.
 * A blank larger than the sheet is not in the plan, so not in its saw run (MOD-DEC-505): it gets a conditional row of
 * its own saw run, as the wardrobe (R3-006, FINDINGS 1786); `blank` — the sawn blank of a part of the graph.
 */
export function kitchenSheetRows(rows: Rec[], plan: CuttingPlan, blank: (partId: string) => PlanarSize | null = () => null): Rec[] {
  const material = new Map<string, Rec>(),
    board = new Map<string, CuttingGroup>();
  for (const row of rows) if (String(row.rateKey).startsWith('material:') && row.rowId === row.partId + ':material') material.set(row.partId, row);
  const added: Rec[] = [],
    largeCuts: Rec[] = [];
  let cutMm = 0;
  for (const g of plan.groups) {
    if (!SHEET_FAMILIES.has(g.material.family) || !g.sheetMm || g.status === 'MISSING_PARAMS') continue;
    const own = g.material.partIds.map((id) => material.get(id)).filter((x): x is Rec => !!x);
    if (!own.length) continue;
    for (const id of g.material.partIds) board.set(id, g);
    const first = own[0]!,
      sheets = g.sheets.length,
      sheetArea = area(g.sheetMm),
      // MOD-DEC-511: whole sheets — the leftovers of a past order can make the maker's price lower (FINDINGS 953).
      common = { category: own.every((x) => x.category === 'facade') ? 'facade' : 'material', rateKey: first.rateKey, unit: 'm2', included: true, note: LEFTOVERS_NOTES.sheet, sheet: { key: g.material.key, family: g.material.family, sheetMm: g.sheetMm, sheetSource: g.sheetSource, partIds: g.material.partIds } };
    added.push({
      ...common,
      rowId: `sheets:${g.material.key}`,
      name: `${materialTitle(g.material)} · ${sheets} ${plural(sheets)} ${g.sheetMm.join(' × ')} мм`,
      quantity: Math.round(sheets * sheetArea * 1e6) / 1e6,
      sheet: { ...common.sheet, sheets },
    });
    if (g.tooLarge.length) {
      const big = largestSheet(g),
        ids = g.tooLarge.map((t) => t.partId).join(', ');
      added.push({
        ...common,
        rowId: `sheets:${g.material.key}:larger`,
        name: `${materialTitle(g.material)} · заготовка больше листа: ${ids} — нужен больший формат или стык (решает мебельщик), условно целый лист ${big.join(' × ')} мм на заготовку`,
        quantity: Math.round(g.tooLarge.length * area(big) * 1e6) / 1e6,
        sheet: { ...common.sheet, sheets: g.tooLarge.length, sheetMm: big, larger: true },
      });
      // FINDINGS 1905 ((Д), R3-006 of the wardrobe): the whole sheet is cut too, as the plan cuts a sheet with one blank —
      // the trim of its edges and the two cuts of the blank; else a kitchen whose blank no longer fits got cheaper.
      for (const t of g.tooLarge) {
        const b = blank(t.partId),
          [l, w] = [b?.lengthMm, b?.widthMm].map((x) => (typeof x === 'number' && x > 0 ? x : 0)),
          mm = 2 * big[0] + 2 * Math.max(0, big[1] - 2 * plan.trimMm) + l + w;
        largeCuts.push({
          rowId: `saw:larger:${t.partId}`,
          category: 'operation',
          name: `Распил заготовки больше листа: ${t.partId} — условно обрезка кромок листа ${big.join(' × ')} мм и два реза заготовки${l && w ? ` ${l} × ${w} мм` : ''}`,
          rateKey: 'operation:rect-cut',
          unit: 'm',
          quantity: Math.round(mm) / 1000,
          included: true,
          largerCut: true,
        });
      }
    }
    cutMm += g.cutLengthMm;
  }
  const replaced = (row: Rec): string | null => {
    if (!board.has(row.partId)) return null;
    if (row === material.get(row.partId)) return 'листы карты раскроя (MOD-DEC-510)';
    if (row.rateKey === 'operation:rect-cut') return 'распил по карте раскроя (MOD-DEC-510)';
    return null;
  };
  if (!added.length) return rows;
  const out = rows.map((row) => {
    const why = row.included ? replaced(row) : null;
    return why ? { ...row, included: false, replacedBy: why } : row;
  });
  const saw = { rowId: 'saw:cutting-plan', category: 'operation', name: 'Распил по последовательности резов карты раскроя', rateKey: 'operation:rect-cut', unit: 'm', quantity: Math.round(cutMm) / 1000, included: true };
  // The sheets after the last row of the boards they replace, the saw run after them or after the last cut it replaces.
  const lastOf = (why: string) => out.reduce((n, row, i) => (row.replacedBy === why ? i : n), -1),
    at = lastOf('листы карты раскроя (MOD-DEC-510)'),
    cut = lastOf('распил по карте раскроя (MOD-DEC-510)');
  // The saw run of a blank larger than the sheet right after the saw run of the plan (or where it would stand).
  return out.flatMap((row, i) => [row, ...(i === at ? added : []), ...(i === Math.max(at, cut) ? [...(cutMm > 0 ? [saw] : []), ...largeCuts] : [])]);
}
