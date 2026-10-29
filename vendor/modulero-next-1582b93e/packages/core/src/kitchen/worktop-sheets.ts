// The worktops of the kitchen by whole sheets of the catalogue (MOD-AI-15, FINDINGS 3219, Д of the Director): a worktop
// is sold as a sheet of 3000 or 4200 × 600 mm of its decor (catalogs/materials/worktops.json), so the price buys the
// sheets its pieces are cut from, not the area of the pieces. A piece is as deep as the sheet and is cut across: each
// sheet loses the trim of its two ends, 10 mm, and every cut between two pieces the kerf, 4.4 mm (MOD-DEC-445). The rows
// of the pieces stay in the BOM and in the cost, marked as replaced; one row of sheets per sheet of the catalogue takes
// their place, as the boards of the cutting plan (sheets.ts, MOD-DEC-510). A piece no sheet holds — deeper than the sheet
// (an island pair, a seat overhang, a diagonal corner) or longer than the longest — keeps its row by the area, with a note
// that the sheet does not hold it (FINDINGS 3220, Д of the Director: a wide board or the rule of a seam along the run
// has no source yet). Pure.
import { worktopOf, type Worktop } from '../catalog/hardware/worktops.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Rec } from '../engine/policy/project-state.js';
import { LEFTOVERS_NOTES } from '../engine/policy/purchase-units.js';
import { usableLengthMm, WORKTOP_KERF_MM, WORKTOP_TRIM_MM, worktopSheets } from './worktop-choice.js';

const EPS = 1e-6;
const round = (x: number) => Math.round(x * 1e6) / 1e6;
const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'лист' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'листа' : 'листов');

/** A piece of a worktop on a sheet: its part and its length across the sheet, mm. */
export interface WorktopPiece {
  partId: string;
  lengthMm: number;
}

/** One sheet of the plan: the record of the catalogue, its pieces in the order of the cuts, what is left of it, mm. */
export interface WorktopSheet {
  index: number;
  worktopId: string;
  lengthMm: number;
  pieces: WorktopPiece[];
  /** The pieces and the kerfs between them, mm; with the two trims it is never more than the sheet. */
  usedMm: number;
  leftoverMm: number;
}

/** The sheets of one decor and thickness. */
export interface WorktopSheetGroup {
  /** The worktop of the group as the kitchen chose it: the shortest sheet of the decor. */
  worktopId: string;
  name: string;
  sheets: WorktopSheet[];
  /** The longest sheet of the decor and the depth of its sheets, mm. */
  sheetMm: [number, number];
  /** The pieces no sheet of the decor holds and why: they keep their rows by the area. */
  notOnSheets: { partId: string; reason: string }[];
  priceRub: number;
}

export interface WorktopSheetPlan {
  trimMm: number;
  kerfMm: number;
  groups: WorktopSheetGroup[];
}

/**
 * The pieces on the sheets of their decor (first fit from the longest, as the bars of barCutting): a piece goes to the
 * first open sheet with room for it and a kerf, else it opens a new one. Two ways to open a sheet are tried — the
 * shortest that holds the piece, or the longest of the decor — and the cheaper plan is kept, the first on a tie.
 */
export function layWorktopPieces(sheets: readonly Worktop[], pieces: readonly WorktopPiece[]): WorktopSheet[] {
  const order = [...pieces].sort((a, b) => b.lengthMm - a.lengthMm || (a.partId < b.partId ? -1 : a.partId > b.partId ? 1 : 0));
  const plan = (open: (p: WorktopPiece) => Worktop): WorktopSheet[] => {
    const out: WorktopSheet[] = [];
    for (const p of order) {
      let sheet = out.find((s) => s.usedMm + WORKTOP_KERF_MM + p.lengthMm <= usableOf(s) + EPS);
      if (sheet) sheet.usedMm = round(sheet.usedMm + WORKTOP_KERF_MM + p.lengthMm);
      else {
        const w = open(p);
        out.push((sheet = { index: out.length + 1, worktopId: w.id, lengthMm: w.sheet.lengthMm, pieces: [], usedMm: p.lengthMm, leftoverMm: 0 }));
      }
      sheet.pieces.push(p);
      sheet.leftoverMm = round(usableOf(sheet) - sheet.usedMm);
    }
    return out;
  };
  const usableOf = (s: WorktopSheet) => s.lengthMm - 2 * WORKTOP_TRIM_MM,
    price = (p: WorktopSheet[]) => p.reduce((n, s) => n + (sheets.find((w) => w.id === s.worktopId)?.price.rub ?? 0), 0),
    shortest = plan((p) => sheets.find((w) => usableLengthMm(w) + EPS >= p.lengthMm)!),
    longest = plan(() => sheets.at(-1)!);
  return price(longest) < price(shortest) - EPS ? longest : shortest;
}

/**
 * The plan of the worktop parts of the kitchen on the sheets of the catalogue: one group per decor and thickness of
 * their records (`materialCode` — the worktop by default, or the sheet of the chosen decor, FINDINGS 3218).
 */
export function kitchenWorktopSheets(parts: readonly Rec[], hw: Pick<HardwareCatalogs, 'worktops'>): WorktopSheetPlan {
  const c = hw.worktops,
    groups = new Map<string, { sheets: Worktop[]; pieces: WorktopPiece[]; notOnSheets: WorktopSheetGroup['notOnSheets'] }>();
  for (const p of parts) {
    if (p.materialRole !== 'WORKTOP') continue;
    const w = worktopOf(c, p.materialCode);
    if (!w) continue;
    const sheets = worktopSheets(c, w),
      key = sheets[0]!.id,
      g = groups.get(key) ?? groups.set(key, { sheets, pieces: [], notOnSheets: [] }).get(key)!,
      // The piece is cut across the sheet: its length runs along the wall, its depth is the depth of the sheet. A run
      // and the through piece of a corner run along x, the butt piece of a corner along its return (worktops.ts).
      [a = 0, b = 0] = (p.finished_mm ?? []) as number[],
      [length, depth] = p.cornerPiece === 'butt' ? [b, a] : [a, b],
      sheetDepth = Math.min(...sheets.map((x) => x.sheet.depthMm)),
      longest = usableLengthMm(sheets.at(-1)!);
    if (p.finished_polygon_mm) g.notOnSheets.push({ partId: p.partId, reason: 'контур не прямоугольник' });
    else if (!(length > 0) || depth > sheetDepth + EPS) g.notOnSheets.push({ partId: p.partId, reason: `глубина ${round(depth)} мм больше листа ${sheetDepth} мм` });
    else if (length > longest + EPS) g.notOnSheets.push({ partId: p.partId, reason: `длина ${round(length)} мм больше листа без обрезки торцов ${longest} мм` });
    else g.pieces.push({ partId: p.partId, lengthMm: round(length) });
  }
  return {
    trimMm: WORKTOP_TRIM_MM,
    kerfMm: WORKTOP_KERF_MM,
    groups: [...groups.values()].map((g) => {
      const sheets = g.pieces.length ? layWorktopPieces(g.sheets, g.pieces) : [];
      return {
        worktopId: g.sheets[0]!.id,
        name: g.sheets[0]!.name,
        sheetMm: [g.sheets.at(-1)!.sheet.lengthMm, Math.min(...g.sheets.map((x) => x.sheet.depthMm))] as [number, number],
        sheets,
        notOnSheets: g.notOnSheets,
        priceRub: Math.round(sheets.reduce((n, s) => n + worktopOf(c, s.worktopId)!.price.rub, 0) * 100) / 100,
      };
    }),
  };
}

/** The note of the row of a piece no sheet holds (FINDINGS 3220). */
export const worktopNotOnSheetNote = (depthMm: number, reason: string): string =>
  `Листом ${depthMm} мм не раскраивается: ${reason}. Цена — по площади заготовки: широкой плиты или щита и правила продольного стыка в каталоге нет (FINDINGS 3220).`;

/** Why a row of a piece is not priced by itself. */
export const WORKTOP_SHEETS_REPLACED = 'листы столешницы (FINDINGS 3219)';

/**
 * The rows of the cost with the worktops by whole sheets: the material row of every piece laid on a sheet is replaced;
 * each sheet of the catalogue the plan takes gets a row of its sheets, by the rate of its material per m² times the
 * area of the sheets (the maker's rate of the material, else the card's: the price of the sheet over its area), after
 * the last row it replaces. A worktop no sheet holds keeps its row, with the note why (FINDINGS 3220).
 */
export function kitchenWorktopSheetRows(rows: Rec[], plan: WorktopSheetPlan, hw: Pick<HardwareCatalogs, 'worktops'>): Rec[] {
  const material = new Map<string, Rec>(),
    notOnSheet = new Map<string, string>();
  for (const row of rows) if (row.category === 'worktop' && row.rowId === row.partId + ':material' && row.included) material.set(row.partId, row);
  for (const g of plan.groups) for (const x of g.notOnSheets) if (material.has(x.partId)) notOnSheet.set(x.partId, worktopNotOnSheetNote(g.sheetMm[1], x.reason));
  if (notOnSheet.size) rows = rows.map((row) => (notOnSheet.has(row.partId) && row === material.get(row.partId) ? { ...row, note: notOnSheet.get(row.partId), worktopNotOnSheet: true } : row));
  const laid = new Set<string>(),
    added: Rec[] = [];
  for (const g of plan.groups)
    for (const id of [...new Set(g.sheets.map((s) => s.worktopId))]) {
      const w = worktopOf(hw.worktops, id)!,
        own = g.sheets.filter((s) => s.worktopId === id),
        partIds = own.flatMap((s) => s.pieces.map((p) => p.partId)).filter((x) => material.has(x));
      if (!partIds.length) continue;
      for (const x of partIds) laid.add(x);
      const first = material.get(partIds[0]!)!,
        n = own.length,
        estimate = partIds.some((x) => material.get(x)!.estimate);
      added.push({
        rowId: `worktop-sheets:${id}`,
        category: 'worktop',
        name: `${w.name.replace(/,\s*\d+\s*×\s*\d+\s*×\s*\d+\s*мм$/u, '')} · ${n} ${plural(n)} ${w.sheet.lengthMm} × ${w.sheet.depthMm} мм`,
        rateKey: `material:${id}:${String(first.rateKey).split(':')[2] ?? w.thicknessMm}`,
        unit: 'm2',
        quantity: round((n * w.sheet.lengthMm * w.sheet.depthMm) / 1e6),
        included: true,
        note: LEFTOVERS_NOTES.sheet.replace('Плита', 'Столешница'),
        ...(estimate ? { estimate: true } : {}),
        worktopSheets: { worktopId: id, sheets: n, sheetMm: [w.sheet.lengthMm, w.sheet.depthMm], trimMm: plan.trimMm, kerfMm: plan.kerfMm, partIds, layout: own.map((s) => ({ index: s.index, pieces: s.pieces, leftoverMm: s.leftoverMm })) },
      });
    }
  if (!added.length) return rows;
  const out = rows.map((row) => (row.included && laid.has(row.partId) && row === material.get(row.partId) ? { ...row, included: false, replacedBy: WORKTOP_SHEETS_REPLACED } : row)),
    at = out.reduce((n, row, i) => (row.replacedBy === WORKTOP_SHEETS_REPLACED ? i : n), -1);
  return out.flatMap((row, i) => [row, ...(i === at ? added : [])]);
}
