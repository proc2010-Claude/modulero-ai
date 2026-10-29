// The worktop of the whole kitchen (MOD-AI-15, FINDINGS 3218): a decor of the catalogue of the worktops
// (catalogs/materials/worktops.json, FINDINGS 2763–2765) or none — the worktop of the catalogue by default (`defaultId`,
// 38 mm without a decor: the rate WORKTOP_38 of the card, so a kitchen without a choice keeps its price). The choice
// is kept in the project (KitchenProject.worktop); every worktop of the kitchen takes it (kitchenWorktops), its row is
// priced by the price of the sheet of its decor over the area of the sheet (price.ts), 3D draws it in the colour of
// the decor. The first step of Д of the Director (2026-10-29): 38 mm only. The second (FINDINGS 3219): the kitchen buys
// its worktop as whole sheets of the decor (worktop-sheets.ts), a piece is at most the longest sheet less the trims of
// its ends; 26 mm follows with its joints.
import { worktopOf, type Worktop } from '../catalog/hardware/worktops.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { cuttingPlan } from '../engine/policy/cutting.js';
import type { Rec } from '../engine/policy/project-state.js';
import type { KitchenEdit } from './editor.js';
import type { KitchenProject, KitchenWorktopChoice } from './project.js';
import type { KitchenScene } from './room.js';

/** The thickness the kitchen offers now (Д of the Director: 26 mm comes with its joint, connectors and appliances). */
const OFFERED_THICKNESS_MM = 38;

/**
 * The sheets of the decor of `w` in its thickness, from the shortest. The sheets of one worktop share the maker, the
 * code and the thickness (the worktop without a decor — both null, FINDINGS 2763): WORKTOP_38 and WORKTOP_38_4200.
 */
export function worktopSheets(c: HardwareCatalogs['worktops'], w: Worktop): Worktop[] {
  return c.worktops.filter((x) => x.brand === w.brand && x.code === w.code && x.thicknessMm === w.thicknessMm).sort((a, b) => a.sheet.lengthMm - b.sheet.lengthMm || a.id.localeCompare(b.id));
}

/** The sheet of the decor of `w`, the shortest whose usable length holds `lengthMm`; none — the longest. */
function sheetFor(c: HardwareCatalogs['worktops'], w: Worktop, lengthMm: number): Worktop {
  const same = worktopSheets(c, w);
  return same.find((x) => usableLengthMm(x) >= lengthMm) ?? same.at(-1) ?? w;
}

/** The trim of each end of a sheet of a worktop (MOD-DEC-445: 10 mm): the factory end is not a finished edge. */
export const WORKTOP_TRIM_MM = cuttingPlan.constants.trimMm.value;
/** The kerf between two pieces of one sheet (MOD-DEC-445: 4.4 mm). */
export const WORKTOP_KERF_MM = cuttingPlan.constants.kerfMm.value;

/** What one piece of a sheet can be at most: its length less the trim of both ends (FINDINGS 3219). */
export const usableLengthMm = (w: Worktop): number => w.sheet.lengthMm - 2 * WORKTOP_TRIM_MM;

/**
 * The longest piece of the worktop of the kitchen (FINDINGS 3219, Д of the Director, replaces 4100 of MOD-DEC-747): the
 * longest sheet of the chosen decor less the trims, 4200 − 2 × 10 = 4180 for the worktop by default; a decor sold only
 * in 3000 — 2980. A run longer is cut at the joints of its modules (`runPieces`).
 */
export function worktopPieceMaxMm(s: Pick<KitchenScene, 'worktop' | 'hardware'>): number {
  const w = kitchenWorktop(s);
  return w ? usableLengthMm(worktopSheets(s.hardware.worktops, w).at(-1) ?? w) : 0;
}

/** The decors the kitchen offers: the worktop by default first, then one 38 mm sheet of the shortest length per decor. */
export function kitchenWorktopsOffered(hw: Pick<HardwareCatalogs, 'worktops'>): Worktop[] {
  const c = hw.worktops,
    def = worktopOf(c, c.defaultId),
    seen = new Set<string>(),
    out: Worktop[] = def ? [def] : [];
  for (const w of [...c.worktops].sort((a, b) => a.sheet.lengthMm - b.sheet.lengthMm)) {
    if (w.id === c.defaultId || w.thicknessMm !== OFFERED_THICKNESS_MM || w.brand === null || w.code === null) continue;
    const key = `${w.brand}|${w.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out.sort((a, b) => (a.id === c.defaultId ? -1 : b.id === c.defaultId ? 1 : 0));
}

/** The choice of the project; empty — the worktop by default. */
export const kitchenWorktopChoiceOf = (p: Pick<KitchenProject, 'worktop'>): KitchenWorktopChoice => p.worktop ?? {};

/** The worktop chosen for the kitchen: an id the kitchen does not offer is the one by default. */
export function kitchenWorktop(s: Pick<KitchenScene, 'worktop' | 'hardware'>): Worktop | null {
  const offered = kitchenWorktopsOffered(s.hardware),
    id = s.worktop?.worktopId;
  return offered.find((w) => w.id === id) ?? worktopOf(s.hardware.worktops, s.hardware.worktops.defaultId) ?? null;
}

/**
 * The record of the catalogue a worktop part is of (its `materialCode`): the decor chosen in the sheet that holds its
 * length — 4200 mm when the decor has it and the part is longer than 3000; the worktop by default without a choice.
 * A part longer than every sheet of its decor keeps the longest: its joint is the task of the corner (FINDINGS 3218).
 */
export function kitchenWorktopRecord(s: Pick<KitchenScene, 'worktop' | 'hardware'>, part: Rec): Worktop | null {
  const w = kitchenWorktop(s);
  if (!w) return null;
  const [L, W] = (part.finished_mm ?? []) as number[];
  return sheetFor(s.hardware.worktops, w, Math.max(L ?? 0, W ?? 0));
}

/** The rate of a worktop per m² of its blank: the price of its sheet over the area of the sheet. */
export function worktopRatePerM2(w: Worktop): number {
  return w.price.rub / ((w.sheet.lengthMm * w.sheet.depthMm) / 1e6);
}

export interface KitchenWorktopView {
  /** The worktop chosen: null — the one by default. */
  worktopId: string | null;
  /** What the list offers: the worktop by default first (id null), then a 38 mm sheet per decor of the catalogue. */
  worktops: { id: string | null; name: string; code: string | null; colorHex: string | null; priceRub: number; sheetMm: [number, number] }[];
  /** The longest piece of the chosen worktop, mm: a run longer is cut at the joints of its modules (FINDINGS 3219). */
  pieceMaxMm: number;
  /** The lengths of the sheets of the chosen worktop, mm, from the shortest: the kitchen buys them whole. */
  sheetLengthsMm: number[];
}

/** What «Материалы и опции» shows of the worktop. */
export function kitchenWorktopView(p: KitchenProject, hw: HardwareCatalogs): KitchenWorktopView {
  const offered = kitchenWorktopsOffered(hw),
    id = kitchenWorktopChoiceOf(p).worktopId,
    s = { worktop: p.worktop, hardware: hw },
    w = kitchenWorktop(s);
  return {
    pieceMaxMm: worktopPieceMaxMm(s),
    sheetLengthsMm: w ? worktopSheets(hw.worktops, w).map((x) => x.sheet.lengthMm) : [],
    worktopId: id && id !== hw.worktops.defaultId && offered.some((w) => w.id === id) ? id : null,
    worktops: offered.map((w) => ({ id: w.id === hw.worktops.defaultId ? null : w.id, name: w.name, code: w.code, colorHex: w.colorHex, priceRub: w.price.rub, sheetMm: [w.sheet.lengthMm, w.sheet.depthMm] })),
  };
}

/** Sets the worktop of the kitchen (null or the id by default — back to it). An id the kitchen does not offer is refused, the kitchen is not changed. */
export function setKitchenWorktop(p: KitchenProject, hw: HardwareCatalogs, worktopId: string | null): KitchenEdit {
  const offered = kitchenWorktopsOffered(hw);
  if (worktopId !== null && !offered.some((w) => w.id === worktopId))
    return { ok: false, problem: `Столешницы ${worktopId} нет среди столешниц кухни (декоры каталога, 38 мм). Кухня не изменена.` };
  const q: KitchenProject = JSON.parse(JSON.stringify(p));
  if (worktopId === null || worktopId === hw.worktops.defaultId) delete q.worktop;
  else q.worktop = { worktopId };
  const w = offered.find((x) => x.id === (q.worktop?.worktopId ?? hw.worktops.defaultId));
  return { ok: true, project: q, notice: `Столешница: ${w?.name ?? 'по умолчанию'}.` };
}
