// Shelf support catalogue (task «Подбор полкодержателей», input of W6 «полки» and K3): supports of a removable
// shelf, with the machining they need in the side panel and in the shelf. MOD-DEC-193: a removable shelf is held
// against shifting; a plain pin does not confirm it (Handbook INV-R7-IR6-02). MOD-DEC-332 (the owner's answer to
// question 7 of HB-REVIEW): no notch is milled for a pin; a plain pin Ø5 is «Эконом», the shelf lies on it, never
// by default; by default — «Стандарт», with retention. MOD-DEC-344 names the kits: «Стандарт» — IF FLIPPER with the
// euro-screw stem 2574 36 (body of six colours, the colour matched to the shelf), «Премиум» — IF MAORI16 (2600 116 +
// 2600 420); supports screwed to the side panel are not allowed; prices are the seller's pages (mdm-complect.ru).
// Data are the manufacturers' as printed in the catalogues and BAZIS libraries of the folder КАТАЛОГИ registered in
// docs/project/SOURCES.md, every value with the source file (its SHA-256 prefix) and the page or the library member;
// a value the source does not give is null and the selection answers UNKNOWN (Handbook §5, MOD-DEC-277). No number
// is carried over from another article (MOD-DEC-205) or invented. Names follow the Handbook terms: ShelfSupport
// (TERM-079), System32Policy (TERM-083). The common format is types.ts, shared with the hinge catalogue.
import { refChecker, type CatalogDocument, type CatalogRef, type HardwareItem, type Known } from './types.js';

/**
 * How the shelf is held against horizontal shifting (MOD-DEC-193):
 * NONE — the shelf lies on plain pins («Эконом»; no notch is milled — MOD-DEC-332); SHELF_PIN — a pin of a visible support enters a bore in the lower face; HIDDEN_BODY — a body set into
 * the shelf (a bore in the lower face or in the end) takes the side pin or screw; LOCK — the support locks the
 * shelf by its own latch.
 */
export type ShelfRetention = 'NONE' | 'SHELF_PIN' | 'HIDDEN_BODY' | 'LOCK';

/** VISIBLE — the support stays visible under the shelf; HIDDEN — скрытого монтажа, hidden in the shelf. */
export type ShelfSupportMounting = 'VISIBLE' | 'HIDDEN';

/** Level of the project (MOD-DEC-223: Эконом / Стандарт / Премиум, chosen on «Стоимость», «Стандарт» by default). */
export type HardwareTier = 'ECONOMY' | 'STANDARD' | 'PREMIUM';

/**
 * A part of one support as it is bought (MOD-DEC-344). BODY — the body set into the shelf; STEM — the stem or the
 * support in the side panel. Several parts of one role differ by colour only: the colour is matched to the shelf.
 */
export interface ShelfSupportPart {
  role: 'BODY' | 'STEM';
  article: string;
  /** Colour as the seller names it; null — the part has one colour. */
  colour: string | null;
  /** Price of one piece for individuals, from the seller's page on the day it was read. */
  priceRub: Known<number>;
}

/**
 * Fixing of one support in the side panel. PIN — a pin or a dowel in a bore of the System 32 line; SCREW — a screw
 * into a pilot hole: the shelf level is not moved without new drilling.
 */
export interface SideFixing {
  kind: 'PIN' | 'SCREW';
  diameterMm: Known<number>;
  depthMm: Known<number>;
  /** Holes of one support along the depth, from its line (0 — one hole on the line; ±27 — two screws). */
  offsetsAlongMm: number[];
}

/**
 * One machining of the shelf at its end. LOWER — in the lower face, END — in the end face. A bore of a support is
 * made at each support line; a groove with `stopFromBackMm` runs along the whole end, open at the front.
 */
export interface ShelfOperation {
  kind: 'BORE' | 'GROOVE';
  face: 'LOWER' | 'END';
  /** Bore: its diameter; groove: its width. */
  widthMm: Known<number>;
  /** Into the shelf from the face. */
  depthMm: Known<number>;
  /** Bore in the lower face: its centre from the face of the side panel. */
  fromSideFaceMm: Known<number> | null;
  /** Bore or groove in the end face: its centre above the lower face. */
  aboveLowerMm: Known<number> | null;
  /** Groove along the end: it stops this far from the back edge of the shelf. */
  stopFromBackMm: Known<number> | null;
  /** The bore of the rear support lies this much further back than its side line (the lock moves the shelf back). */
  rearShiftMm: Known<number> | null;
}

export interface ShelfSupport extends HardwareItem {
  name: string;
  /** Articles of one support as it is ordered (body, rear part, dowel or stem). */
  components: string[];
  /**
   * Level the support is offered at (MOD-DEC-344: «Стандарт» — FLIPPER with the euro-screw stem, «Премиум» —
   * MAORI16; «Эконом» — the plain pin, 332); null — not offered at any level, kept for the selection report.
   */
  tier: HardwareTier | null;
  /** Parts with their prices; empty — prices are not recorded (the kit is not offered by 344). */
  parts: ShelfSupportPart[];
  mounting: ShelfSupportMounting;
  retention: ShelfRetention;
  /** The manufacturer names the support «с фиксацией» or shows its lock (MOD-DEC-193). */
  retentionDocumented: Known<boolean>;
  sideFixing: SideFixing;
  /** Machining of the shelf at one end for one support line; empty — the shelf lies on the supports. */
  shelfOperations: ShelfOperation[];
  /**
   * Lower face of the shelf over the axis of the side fixing: positive — the shelf lies above the axis (a pin under
   * the shelf), negative — the axis is inside the shelf thickness (a hidden body). System 32 places the shelf by it
   * (s32ShelfGeometry, axis_from_lower = −shelfLowerAboveAxisMm).
   */
  shelfLowerAboveAxisMm: Known<number>;
  /** Shelf thickness the manufacturer names; `maxMm` null — only a minimum («от 16 мм»). */
  shelfThicknessMm: Known<{ minMm: number; maxMm: number | null }>;
  /** Shelf materials the manufacturer names: `CHIPBOARD`, `GLASS`, `WOOD`. */
  shelfMaterials: Known<string[]>;
  /** Load the manufacturer or the seller gives for a pair of supports. */
  loadPerPairKg: Known<number>;
  /** Fasteners of the kit whose hole the sources do not give (MOD-DEC-277: the scheme is INCOMPLETE until they do). */
  unplacedFasteners: string[];
}

export interface ShelfSupportCatalog {
  supports: ShelfSupport[];
  /** Source files of SOURCES.md the catalogue was read from. */
  documents: CatalogDocument[];
}


/** Structural problems of a catalogue: references, unknown values, machining by retention. The test keeps the committed data clean. */
export function shelfSupportCatalogProblems(c: ShelfSupportCatalog): string[] {
  const { ref: refOk, known, problems: out } = refChecker(c.documents);
  const ids = new Set(c.supports.map((s) => s.id));
  if (ids.size !== c.supports.length) out.push('повтор id полкодержателя');
  for (const s of c.supports) {
    refOk(s.id, s.ref);
    if (!s.components.length) out.push(`${s.id}: нет состава`);
    known(`${s.id}.retentionDocumented`, s.retentionDocumented);
    known(`${s.id}.sideFixing.diameterMm`, s.sideFixing.diameterMm);
    known(`${s.id}.sideFixing.depthMm`, s.sideFixing.depthMm);
    if (!s.sideFixing.offsetsAlongMm.length) out.push(`${s.id}: нет отверстий крепления к боковине`);
    if (s.unplacedFasteners.some((x) => !x.trim())) out.push(`${s.id}: крепёж без отверстия не описан`);
    known(`${s.id}.shelfLowerAboveAxisMm`, s.shelfLowerAboveAxisMm);
    known(`${s.id}.shelfThicknessMm`, s.shelfThicknessMm);
    known(`${s.id}.shelfMaterials`, s.shelfMaterials);
    known(`${s.id}.loadPerPairKg`, s.loadPerPairKg);
    s.shelfOperations.forEach((o, i) => {
      const w = `${s.id}.shelfOperations[${i}]`;
      known(`${w}.widthMm`, o.widthMm);
      known(`${w}.depthMm`, o.depthMm);
      for (const k of ['fromSideFaceMm', 'aboveLowerMm', 'stopFromBackMm', 'rearShiftMm'] as const) if (o[k]) known(`${w}.${k}`, o[k]!);
      if (o.face === 'LOWER' && !o.fromSideFaceMm) out.push(`${w}: у операции в нижней пласти нет положения от боковины`);
      if (o.face === 'END' && !o.aboveLowerMm) out.push(`${w}: у операции в торце нет высоты над нижней пластью`);
      if (o.kind === 'GROOVE' && o.face === 'END' && !o.stopFromBackMm) out.push(`${w}: у паза в торце нет конца`);
    });
    if ((s.retention === 'NONE') !== (s.shelfOperations.length === 0)) out.push(`${s.id}: удержание ${s.retention} при ${s.shelfOperations.length} операциях в полке`);
    // 332 (a plain pin only at «Эконом») and 344 (no support on screws) are kept by the selection, not by the check of
    // the catalogue (HARDWARE_CATALOGS.md §5, MOD-DEC-349): RETENTION and SIDE_FIXING of shelf-support-selection.ts.
    for (const x of s.parts) known(`${s.id}.parts.${x.article}.priceRub`, x.priceRub);
    const roles = new Set(s.parts.map((x) => x.role));
    for (const r of roles) {
      const same = s.parts.filter((x) => x.role === r);
      if (same.length > 1 && (same.some((x) => !x.colour) || new Set(same.map((x) => x.colour)).size !== same.length)) out.push(`${s.id}: части ${r} различаются не цветом`);
    }
  }
  return out;
}

export type { CatalogRef };
