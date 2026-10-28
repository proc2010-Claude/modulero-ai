// Common format of the hardware catalogue (hinges, shelf supports, …): one shape for every family, so the
// selection of each family reads its data the same way. The data are not part of the core: they lie in catalogs/
// at the top of the repository and the engine gets them as an argument (HardwareCatalogs, release.ts; FINDINGS 291).
// A value may name the document it was read from with its page (the references collected so far are kept); the
// source is not required, neither of a number nor of a price (MOD-DEC-348). A value the source does not give is
// null, and the selection answers UNKNOWN for what needs it (Handbook §5). The unit is in the field name (Handbook
// naming rules: lengthMm, massKg). No drilling of another article is substituted (MOD-DEC-205).
import type { Source } from '../../engine/contract.js';

/**
 * A source of SOURCES.md the catalogue was read from: a file of the owner's disk, or a page of a seller's site
 * (`retrievedOn` set, `path` its address). A page is not kept, so its `sha256` is empty and the references to it
 * name it by `doc` with an empty `sha256`; the day it was read stands for its version.
 */
export interface CatalogDocument {
  id: string;
  /** Path on the owner's disk as SOURCES.md writes it; for a page — its address. */
  path: string;
  sha256: string;
  title: string;
  /** Page of a site: the day it was read (YYYY-MM-DD). */
  retrievedOn?: string;
}

/** Where a value was read: the source file, its SHA-256 (prefix of at least 8 characters) and the printed page. */
export interface CatalogRef {
  doc: string;
  sha256: string;
  page: string;
  note?: string;
}

/**
 * A value of the catalogue. CONFIRMED — printed in the source file; DERIVED — computed from printed values by a
 * stated rule (the rule in `ref.note`); UNKNOWN — the source file does not give it (`value` is null, `reason` says why).
 */
export interface Known<T> {
  value: T | null;
  status: 'CONFIRMED' | 'DERIVED' | 'UNKNOWN';
  ref: CatalogRef | null;
  reason?: string;
}

export interface RangeMm {
  minMm: number;
  maxMm: number;
}

/** An axis of the file of a model, with its sign: what the file calls X, Y or Z. */
export type ModelAxis = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

const MODEL_AXES: readonly ModelAxis[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

/**
 * The 3D model of a catalogue record (MOD-DEC-536): a file of catalogs/hardware/models, in the release by its SHA-256,
 * loaded by the client on demand and never built into the JS. `file` — `models/<brand>/<article>.glb` from
 * catalogs/hardware, Latin letters only (rule 5 of CLAUDE.md); `units` — millimetres. (Д, FINDINGS 1082): `origin` is
 * the point of the file (in its coordinates, mm) that stands at the origin of the model of the graph (`originMm` of a
 * HardwareVisual), and `axes` say which axis of the file runs along its `uAxis`, `vAxis` and `nAxis`; `source` — the
 * source file the model was made from. A record without the field (or with null) is drawn by its parametric model.
 */
export interface Model3d {
  file: string;
  sha256: string;
  units: 'mm';
  origin: [number, number, number];
  axes: { u: ModelAxis; v: ModelAxis; n: ModelAxis };
  source: CatalogRef;
  /**
   * (Д, FINDINGS 1085) An item that telescopes to the width of its place — a frame on runners between the sides, the
   * rod of a pantograph: the file is drawn at `widthMm` along u, and what lies beyond `atMm` (along u, from the origin)
   * moves by the difference to the width of the place. null or absent — drawn as it is.
   */
  stretch?: { atMm: number; widthMm: number } | null;
}

/** Common head of a catalogue record of any family. */
export interface HardwareItem {
  id: string;
  brand: string;
  article: string;
  ref: CatalogRef;
}

/** A candidate the selection did not take, and why (shown to the user and the furniture maker). */
export interface Rejected {
  id: string;
  reason: string;
}

/** The engine's source of a catalogue value (contract `Source`, kind CATALOG): «file, с. N, sha256» or «page, what was read». */
export function catalogSource(r: CatalogRef): Source {
  return { kind: 'CATALOG', ref: r.sha256 ? `${r.doc}, с. ${r.page}, sha256 ${r.sha256}` : `${r.doc}, ${r.page}` };
}

/**
 * Problems of references and unknown values; each family's checker adds its own structural checks. Only what the
 * engine needs to count right (MOD-DEC-349): a value and its status agree, and a reference, when given, names a
 * source listed in `documents` of the catalogue. A reference, its page, the reason of an unknown value and the rule of a derived one are
 * not required (MOD-DEC-348).
 */
export function refChecker(documents: CatalogDocument[]) {
  const docs = new Set(documents.filter((d) => !d.retrievedOn).map((d) => d.sha256.slice(0, 8))),
    pages = new Set(documents.filter((d) => d.retrievedOn && !d.sha256).map((d) => d.id));
  const out: string[] = [];
  for (const d of documents) if (d.retrievedOn ? !/^\d{4}-\d{2}-\d{2}$/.test(d.retrievedOn) || d.sha256 : d.sha256.length < 8) out.push(`документ ${d.id}: ${d.retrievedOn ? 'у страницы нужна дата чтения и пустой sha256' : 'нет sha256'}`);
  const ref = (where: string, r: CatalogRef | null | undefined) => {
    if (!r) return;
    if (r.sha256 ? r.sha256.length < 8 || !docs.has(r.sha256.slice(0, 8)) : !pages.has(r.doc)) out.push(`${where}: документ ${r.doc} (${r.sha256 || 'страница'}) не записан в documents`);
  };
  const known = (where: string, k: Known<unknown>) => {
    if ((k.value === null) !== (k.status === 'UNKNOWN')) out.push(`${where}: статус ${k.status} при значении ${k.value === null ? 'null' : 'не null'}`);
    if (k.value !== null) ref(where, k.ref);
  };
  // The format of a model (MOD-DEC-536); that the file exists and has this SHA-256 is checked by the release
  // (scripts/catalog-release.mjs): the core reads no files.
  const model = (where: string, m: Model3d | null | undefined) => {
    if (m === undefined || m === null) return;
    if (!/^models\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.glb$/.test(m.file)) out.push(`${where}.model3d: файл — models/<бренд>/<артикул>.glb латиницей`);
    if (!/^[0-9a-f]{64}$/.test(m.sha256)) out.push(`${where}.model3d: sha256 — 64 шестнадцатеричных знака`);
    if (m.units !== 'mm') out.push(`${where}.model3d: единицы — mm`);
    if (!(Array.isArray(m.origin) && m.origin.length === 3 && m.origin.every(Number.isFinite))) out.push(`${where}.model3d: origin — три числа`);
    const axes = [m.axes?.u, m.axes?.v, m.axes?.n];
    if (!axes.every((a) => MODEL_AXES.includes(a as ModelAxis)) || new Set(axes.map((a) => a?.slice(1))).size !== 3) out.push(`${where}.model3d: axes — три разные оси файла`);
    if (m.stretch && !(m.stretch.widthMm > 0 && m.stretch.atMm > 0 && m.stretch.atMm < m.stretch.widthMm)) out.push(`${where}.model3d: stretch — ширина больше нуля, плоскость внутри неё`);
    if (!m.source) out.push(`${where}.model3d: нет источника`);
    else ref(`${where}.model3d`, m.source);
  };
  return { ref, known, model, problems: out };
}
