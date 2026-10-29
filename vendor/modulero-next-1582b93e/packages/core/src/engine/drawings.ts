// Drawings of the graph (task W10, MIGRATION_PLAN 3.10): the sheet of a part with its drilling and the general
// drawing of the product. Both are read only from the graph — the parts, their placement, edges and operations —
// so a sheet, the drilling file and the 3D view cannot disagree (one id of a part and of an operation everywhere).
//
// The paper is the one of the prototype's last drawings (SIDE_V6 and GENERAL_V7 of r1, MOD-DEC-120): A4 landscape
// for a part, A3 landscape for the general drawing. The prototype placed the labels by measuring text in the
// browser; the core has no browser, so the layout is fixed and the text is wrapped by a character estimate.
//
// Production coordinates. A sheet gives the operations in the production axes of the face it shows — the same
// function as the drilling file (productionCoordinateSystemForPart of r1.html:5480, ENGINE.md §2.5): a hole has the
// same X, Y on its sheet and in `drilling.csv`. The prototype's last sheets printed part coordinates instead
// (FINDINGS 541). The frame is computed from the fields of the graph part (orientation family, face names and
// normals, handedness), not from the prototype's part kinds.
import type { EdgeSlot, Graph, Groove, Hole, Notch, PanelFaceSide, Part, PhysicalEdge, Vec3 } from './contract.js';
import { ratValue } from './invariants/geometry.js';
import { drawingSheets } from './policy/drawing.js';
import { edgeModel } from './policy/edge-model.js';
import { sceneOf, type ScenePart } from './scene.js';

// ---------------------------------------------------------------- production frame of a part face

export type ScreenSide = 'left' | 'right' | 'top' | 'bottom';

/** Production axes of a part seen from one face: X to the right, Y down the drawing, millimetres. */
export interface ProductionFrame {
  partId: string;
  side: PanelFaceSide;
  /** Physical name of the face: `inside`, `outside`, `left`… */
  face: string;
  /** X runs along the width of the part, Y along its length (vertical parts and backs, r1.html:5417). */
  swap: boolean;
  /** The drawing is mirrored: the face is seen from the other side of the part axes. */
  mirror: boolean;
  /** Extent of the part along X and along Y. */
  widthMm: number;
  heightMm: number;
  /** Part axes (x along the length from the corner of edges A/C, y along the width) → production X, Y. */
  toProduction(x: number, y: number): { X: number; Y: number };
  /** The inverse: production X, Y → part axes (Handbook ch. 4: the inverse returns the datum). */
  toPart(X: number, Y: number): { x: number; y: number };
  /** Side of the drawing an edge of the part lies on. */
  sideOfEdge(slot: EdgeSlot): ScreenSide;
}

/** Point of an edge in part axes, `offset` along the edge: A at y = 0, B at y = W, C at x = 0, D at x = L. */
export function edgePoint(part: Part, slot: EdgeSlot, offset: number): { x: number; y: number } {
  const L = part.finishedWithEdge.lengthMm,
    W = part.finishedWithEdge.widthMm;
  return slot === 'A' ? { x: offset, y: 0 } : slot === 'B' ? { x: offset, y: W } : slot === 'C' ? { x: 0, y: offset } : { x: L, y: offset };
}

/**
 * Mirroring of the face drawing by the orientation family (drawingProjectionForPart, r1.html:5419): a vertical depth
 * part is mirrored on the face that looks to −X (outside of the left side, inside of the right one, left of a
 * partition), an upright width part and a plan part on `inside` / `outside`, a drawer side by its hand.
 */
function mirrored(part: Part, face: string): boolean {
  const o = part.orientation;
  switch (o.family) {
    case 'verticalDepth':
      return o.faceNormals[face] === '-X';
    case 'uprightWidth':
      return face === 'inside';
    case 'drawerSide':
      return (part.handedness === 'RIGHT') !== (face === 'inside');
    case 'horizontalPlan':
      return face === 'outside';
    default:
      return false;
  }
}

export function productionFrame(part: Part, side: PanelFaceSide): ProductionFrame {
  const L = part.finishedWithEdge.lengthMm,
    W = part.finishedWithEdge.widthMm,
    face = part.orientation.faceNames[side],
    swap = part.orientation.family === 'verticalDepth' || part.orientation.family === 'uprightWidth',
    mirror = mirrored(part, face),
    widthMm = swap ? W : L,
    heightMm = swap ? L : W,
    toProduction = (x: number, y: number) => {
      const u = swap ? y : x,
        v = swap ? L - x : y;
      return { X: mirror ? widthMm - u : u, Y: v };
    },
    toPart = (X: number, Y: number) => {
      const u = mirror ? widthMm - X : X;
      return swap ? { x: L - Y, y: u } : { x: u, y: Y };
    },
    sideOfEdge = (slot: EdgeSlot): ScreenSide => {
      const along = slot === 'A' || slot === 'B' ? L : W,
        e = edgePoint(part, slot, along / 2),
        q = toProduction(e.x, e.y),
        d: [ScreenSide, number][] = [
          ['left', Math.abs(q.X)],
          ['right', Math.abs(widthMm - q.X)],
          ['top', Math.abs(q.Y)],
          ['bottom', Math.abs(heightMm - q.Y)],
        ];
      return d.sort((a, b) => a[1] - b[1])[0]![0];
    };
  return { partId: part.id, side, face, swap, mirror, widthMm, heightMm, toProduction, toPart, sideOfEdge };
}

// ---------------------------------------------------------------- operations of a sheet

export type SheetOperationKind = 'H' | 'E' | 'G' | 'N';

/** One operation as a sheet shows it: production coordinates of the face of the sheet. */
export interface SheetOperation {
  /** Operation id of the graph (`<part>/<id>`): the same in the drilling file. */
  id: string;
  /** Short code on the sheet: the id within the part (`H1`, `E3`, `G1`), N1… for a cut-out. */
  code: string;
  kind: SheetOperationKind;
  /** Hole centre, edge hole entry point, start of a groove, a corner of a cut-out. */
  X: number;
  Y: number;
  /** End of a groove, the opposite corner of a cut-out. */
  X2: number | null;
  Y2: number | null;
  /** Hole diameter or groove width. */
  sizeMm: number;
  /** Depth; null — through. */
  depthMm: number | null;
  through: boolean;
  marking: boolean;
  /** Edge of an edge hole. */
  edge: EdgeSlot | null;
  physicalEdge: PhysicalEdge | null;
  /** Face hole drilled from the other face (through), shown on this one. */
  fromOtherFace: boolean;
  /** What the operation is, for the type table of the sheet. */
  type: string;
  purpose: string;
}

const PHYSICAL_EDGE_RU: Record<PhysicalEdge, string> = { FRONT: 'Передний', REAR: 'Задний', TOP: 'Верхний', BOTTOM: 'Нижний', LEFT: 'Левый', RIGHT: 'Правый' };
export const physicalEdgeRu = (e: PhysicalEdge): string => PHYSICAL_EDGE_RU[e] ?? e;

const FACE_RU: Record<string, string> = {
  inside: 'Внутренняя сторона',
  outside: 'Наружная сторона',
  left: 'Левая сторона',
  right: 'Правая сторона',
  top: 'Верхняя сторона',
  bottom: 'Нижняя сторона',
  // The planks of the plinth of other furniture (R6-011 of the tester: «СТОРОНА BACK (N_POS)»).
  front: 'Передняя сторона',
  back: 'Задняя сторона',
};
export const faceRu = (face: string): string => FACE_RU[face] ?? `Сторона ${face}`;

/**
 * Short codes of the operations of a part, the same on every sheet of the part: the id within the part when it is a
 * letter and a number (`H1`, `E3`, `G1` — as in the drilling file), else the next free number of its letter (the
 * fasteners r7 have path ids, `F7/<joint>/<station>/…`). Cut-outs are N1, N2…
 */
export function operationCodes(g: Pick<Graph, 'operations'>, part: Part): Map<string, string> {
  const ops = g.operations.filter((o) => o.partId === part.id),
    letter = (o: (typeof ops)[number]) => (o.op === 'NOTCH' ? 'N' : o.op === 'GROOVE' ? 'G' : o.mode === 'EDGE' ? 'E' : 'H'),
    local = (id: string) => (id.startsWith(part.id + '/') ? id.slice(part.id.length + 1) : id),
    used = new Set<string>(),
    out = new Map<string, string>();
  for (const o of ops) {
    const c = local(o.id);
    if (o.op !== 'NOTCH' && /^[A-Z]\d+$/.test(c) && !used.has(c)) {
      out.set(o.id, c);
      used.add(c);
    }
  }
  const next = new Map<string, number>();
  for (const o of ops) {
    if (out.has(o.id)) continue;
    const l = letter(o);
    let n = next.get(l) ?? 1;
    while (used.has(l + n)) n++;
    out.set(o.id, l + n);
    used.add(l + n);
    next.set(l, n + 1);
  }
  return out;
}

/** A cut-out reaches the face of the side when its depth range touches it. */
const notchOnSide = (part: Part, n: Notch, side: PanelFaceSide) => {
  const T = part.finishedWithEdge.panelThicknessMm,
    [n0, n1] = n.nRangeMm;
  return side === 'N_POS' ? n1 >= T - 1e-6 : n0 <= 1e-6;
};

export interface PartOperations {
  holes: Hole[];
  grooves: Groove[];
  notches: Notch[];
}

export function partOperations(g: Pick<Graph, 'operations'>, partId: string): PartOperations {
  const out: PartOperations = { holes: [], grooves: [], notches: [] };
  for (const o of g.operations) {
    if (o.partId !== partId) continue;
    if (o.op === 'HOLE') out.holes.push(o);
    else if (o.op === 'GROOVE') out.grooves.push(o);
    else out.notches.push(o);
  }
  return out;
}

/** The face a part is drawn from when nothing requires a face: the outside of a front or a back, else the inside (r1.html:22615). */
export function defaultSide(part: Part): PanelFaceSide {
  const want = part.structuralRole === 'FACADE' || part.role === 'BACK_PANEL' ? 'outside' : 'inside',
    sides = Object.keys(part.orientation.faceNames) as PanelFaceSide[];
  return sides.find((s) => part.orientation.faceNames[s] === want) ?? 'N_POS';
}

export type SheetView = { side: PanelFaceSide; content: 'FACE' | 'EDGE_ONLY' | 'NONE' };

/**
 * Faces a part is drawn from (productionViewsForPart, r1.html:14317): every face with a groove, a cut-out or a blind
 * hole; a part with through holes only — the face they are drilled from; with edge holes only — one sheet of the
 * edge drilling; with no operation — one sheet of the part and its edges. The prototype's last package drew every
 * face of every part, with or without operations (FINDINGS 542).
 */
export function sheetViews(g: Pick<Graph, 'operations'>, part: Part): SheetView[] {
  const ops = partOperations(g, part.id),
    first = defaultSide(part),
    order: PanelFaceSide[] = first === 'N_POS' ? ['N_POS', 'N_NEG'] : ['N_NEG', 'N_POS'],
    faceHoles = ops.holes.filter((h) => h.mode === 'FACE' && h.face),
    need = new Set<PanelFaceSide>([...ops.grooves.flatMap((x) => (x.face ? [x.face] : [])), ...faceHoles.filter((h) => !h.through).map((h) => h.face!), ...order.filter((s) => ops.notches.some((n) => notchOnSide(part, n, s)))]);
  if (!need.size && faceHoles.length) need.add(faceHoles[0]!.face!);
  if (need.size) return order.filter((s) => need.has(s)).map((side) => ({ side, content: 'FACE' }));
  return [{ side: first, content: ops.holes.some((h) => h.mode === 'EDGE') ? 'EDGE_ONLY' : 'NONE' }];
}

const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

function holeType(h: Hole): string {
  const size = `Ø${fmt(h.diameterMm)}`;
  if (h.layer === 'MARKING') return `${size} · разметка, не сверлить`;
  if (h.through) return `${size} · сквозное`;
  return `${size} × ${fmt(h.depthMm ?? 0)}`;
}

/** Operations of a part on the sheet of one face: holes of the face (and through ones), edge holes, grooves, cut-outs. */
export function sheetOperations(g: Pick<Graph, 'operations'>, part: Part, view: SheetView): SheetOperation[] {
  const ops = partOperations(g, part.id),
    f = productionFrame(part, view.side),
    codes = operationCodes(g, part),
    out: SheetOperation[] = [],
    base = { X2: null, Y2: null, edge: null, physicalEdge: null, fromOtherFace: false, marking: false };
  if (view.content === 'FACE')
    for (const h of ops.holes)
      if (h.mode === 'FACE' && (h.face === view.side || h.through)) {
        const q = f.toProduction(h.xMm, h.yMm);
        out.push({ ...base, id: h.id, code: codes.get(h.id)!, kind: 'H', X: q.X, Y: q.Y, sizeMm: h.diameterMm, depthMm: h.through ? null : h.depthMm, through: h.through, marking: h.layer === 'MARKING', fromOtherFace: h.face !== view.side, type: holeType(h), purpose: h.purpose });
      }
  for (const h of ops.holes)
    if (h.mode === 'EDGE' && h.edge) {
      const e = edgePoint(part, h.edge, h.xMm),
        q = f.toProduction(e.x, e.y),
        physical = part.edges[h.edge].physicalEdge;
      out.push({ ...base, id: h.id, code: codes.get(h.id)!, kind: 'E', X: q.X, Y: q.Y, sizeMm: h.diameterMm, depthMm: h.through ? null : h.depthMm, through: h.through, marking: h.layer === 'MARKING', edge: h.edge, physicalEdge: physical, type: `${holeType(h)} · торец ${h.edge} (${physicalEdgeRu(physical).toLowerCase()})`, purpose: h.purpose });
    }
  if (view.content === 'FACE') {
    for (const x of ops.grooves)
      if (x.face === view.side) {
        const along = x.along === 'LENGTH',
          a = f.toProduction(along ? x.startMm : x.offsetMm, along ? x.offsetMm : x.startMm),
          b = f.toProduction(along ? x.endMm : x.offsetMm, along ? x.offsetMm : x.endMm);
        out.push({ ...base, id: x.id, code: codes.get(x.id)!, kind: 'G', X: a.X, Y: a.Y, X2: b.X, Y2: b.Y, sizeMm: x.grooveWidthMm, depthMm: x.grooveDepthMm, through: false, type: `паз ${fmt(x.grooveWidthMm)} × ${fmt(x.grooveDepthMm)}, длина ${fmt(Math.abs(x.endMm - x.startMm))} вдоль ${Math.abs(b.X - a.X) > Math.abs(b.Y - a.Y) ? 'X' : 'Y'}${x.resolution.productionConfirmed ? '' : ' · профиль требует подтверждения'}`, purpose: x.purpose });
      }
    for (const n of ops.notches)
      if (notchOnSide(part, n, view.side)) {
        const a = f.toProduction(n.uRangeMm[0], n.vRangeMm[0]),
          b = f.toProduction(n.uRangeMm[1], n.vRangeMm[1]),
          depth = n.nRangeMm[1] - n.nRangeMm[0];
        out.push({ ...base, id: n.id, code: codes.get(n.id)!, kind: 'N', X: Math.min(a.X, b.X), Y: Math.min(a.Y, b.Y), X2: Math.max(a.X, b.X), Y2: Math.max(a.Y, b.Y), sizeMm: 0, depthMm: depth, through: depth >= part.finishedWithEdge.panelThicknessMm - 1e-6, type: `выборка ${fmt(Math.abs(b.X - a.X))} по X × ${fmt(Math.abs(b.Y - a.Y))} по Y, глубина ${fmt(depth)}`, purpose: n.purpose });
      }
  }
  // H, E, G, N in the order of the graph within each kind, as the prototype listed them (f14OperationRecords, r1.html:22661).
  const rank: Record<SheetOperationKind, number> = { H: 0, E: 1, G: 2, N: 3 };
  return out.map((o, i) => [o, i] as const).sort((a, b) => rank[a[0].kind] - rank[b[0].kind] || a[1] - b[1]).map(([o]) => o);
}

// ---------------------------------------------------------------- SVG primitives (millimetres of paper)

const FONT = "Arial, 'Liberation Sans', 'Helvetica Neue', sans-serif";
const INK = '#20252a';
const SOFT = '#6b7178';
const MIN_TEXT = drawingSheets.constants.minTextMm.value;
/** Mean advance of a character of the sheet font, in heights of the font (Cyrillic, Arial): the core cannot measure text. */
const SELECTION_RU: Record<string, string> = { INSTALLER: 'монтажник', USER: 'пользователь', MANUFACTURER: 'изготовитель' };
/** Installation requirements of one text, who decides and whether required — one note however many modules carry it. */
function installationGroups(g: Pick<Graph, 'result'>) {
  const out = new Map<string, { text: string; required: boolean; selection: string; ids: string[]; partIds: Set<string> }>();
  for (const r of g.result.installationRequirements) {
    const key = `${r.required}|${r.selection}|${r.text}`,
      x = out.get(key) ?? { text: r.text, required: r.required, selection: r.selection, ids: [], partIds: new Set<string>() };
    x.ids.push(r.id);
    for (const p of r.targetPartIds) x.partIds.add(p);
    out.set(key, x);
  }
  return [...out.values()];
}
const CHAR_EM = 0.6;

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const n2 = (v: number) => String(Math.round(v * 100) / 100);

function text(x: number, y: number, s: string, size = MIN_TEXT, attrs = ''): string {
  return `<text x="${n2(x)}" y="${n2(y)}" font-size="${n2(Math.max(MIN_TEXT, size))}"${attrs ? ' ' + attrs : ''}>${esc(s)}</text>`;
}
const line = (x1: number, y1: number, x2: number, y2: number, w = 0.18, extra = '') => `<line x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}" stroke-width="${w}"${extra ? ' ' + extra : ''}/>`;

/** Wraps text into lines of at most `widthMm` at the given font size, by the character estimate. */
export function wrapText(s: string, widthMm: number, size = MIN_TEXT): string[] {
  const max = Math.max(4, Math.floor(widthMm / (size * CHAR_EM))),
    out: string[] = [];
  let cur = '';
  for (const word of s.split(/\s+/).filter(Boolean)) {
    if (word.length > max) {
      if (cur) out.push(cur);
      for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
      cur = '';
      continue;
    }
    if ((cur ? cur.length + 1 : 0) + word.length > max) {
      out.push(cur);
      cur = word;
    } else cur = cur ? cur + ' ' + word : word;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

function svgOpen(w: number, h: number, kind: string, attrs: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" data-sheet="${kind}" ${attrs}>` +
    `<rect width="${w}" height="${h}" fill="#fff"/>` +
    `<g font-family="${esc(FONT)}" fill="${INK}" stroke="${INK}" stroke-linecap="round"><g stroke="none">`
  );
}
const SVG_CLOSE = '</g></g></svg>';
/** Text is drawn with fill only; lines with stroke only. */
const strokes = (body: string) => `</g><g fill="none">${body}</g><g stroke="none">`;

// ---------------------------------------------------------------- identity of a sheet

export interface DrawingIdentity {
  /** Revision of the project the graph is built from (INV-S04). */
  revision: string;
  ruleSet: string;
  generator: string;
  qualification: 'PRODUCTION' | 'NOT_FOR_PRODUCTION';
  /** Version of the application that drew the sheet. */
  appVersion: string;
  drawingVersion: string;
}

export function drawingIdentity(g: Pick<Graph, 'revision' | 'versions' | 'result'>, appVersion = ''): DrawingIdentity {
  return {
    revision: g.revision.projectRevisionId,
    ruleSet: g.versions.ruleSet,
    generator: g.versions.generator,
    qualification: g.result.exportQualification,
    appVersion,
    drawingVersion: `${drawingSheets.id}-${drawingSheets.version}`,
  };
}

const qualificationText = (q: DrawingIdentity['qualification']) => (q === 'PRODUCTION' ? 'ДЛЯ ПРОИЗВОДСТВА' : 'ЧЕРНОВИК · НЕ ДЛЯ ПРОИЗВОДСТВА');

function header(title: string, sub: string, id: DrawingIdentity, w: number, page: number, total: number): { svg: string; bottom: number } {
  const lines = wrapText(title, w - 110, 4.3);
  let s = lines.map((l, i) => text(10, 15 + i * 5.2, l, 4.3, 'font-weight="700"')).join('');
  const y = 15 + lines.length * 5.2;
  s += text(10, y + 0.6, sub, MIN_TEXT, `fill="${SOFT}"`);
  s += text(w - 10, 14, qualificationText(id.qualification), MIN_TEXT, 'text-anchor="end" font-weight="700"');
  s += text(w - 10, 19.5, `Лист ${page} / ${total}`, 3, 'text-anchor="end"');
  s += strokes(line(10, y + 3.6, w - 10, y + 3.6, 0.25));
  return { svg: s, bottom: y + 3.6 };
}

function footer(w: number, h: number, cols: [string[], string[], string[]]): string {
  const y = h - 30,
    third = (w - 20) / 3;
  let s = strokes(line(10, y, w - 10, y, 0.25) + line(10 + third, y, 10 + third, h - 10) + line(10 + 2 * third, y, 10 + 2 * third, h - 10));
  cols.forEach((rows, c) =>
    rows.slice(0, 4).forEach((r, i) => {
      const x = 12 + c * third;
      s += text(x, y + 5 + i * 4.5, wrapText(r, third - 4)[0]!, i === 0 && c === 0 ? 3.3 : MIN_TEXT, i === 0 && c === 0 ? 'font-weight="700"' : '');
    }),
  );
  return s;
}

const stampLines = (id: DrawingIdentity) => [
  qualificationText(id.qualification),
  `Ревизия ${id.revision}`,
  `Правила ${id.ruleSet} · ${id.generator}`,
  `${id.drawingVersion}${id.appVersion ? ' · ' + id.appVersion : ''}`,
];

// ---------------------------------------------------------------- the sheet of a part

/** One page of a part sheet: the SVG and what it shows. */
export interface Sheet {
  /** File name without extension: `<part id>_<face>_<page>`, or `general`. */
  name: string;
  partId: string | null;
  side: PanelFaceSide | null;
  page: number;
  pages: number;
  widthMm: number;
  heightMm: number;
  /** Scale 1:n of the main view. */
  scale: number;
  /** Operation ids listed in the table of this page; the drawing of every page of a view shows all of them. */
  operationIds: string[];
  svg: string;
}

const pick = (denoms: readonly number[], fits: (d: number) => boolean) => denoms.find(fits) ?? denoms[denoms.length - 1]!;

/**
 * A part id as a part of a file name (R4-012, FINDINGS 1893): the characters Windows does not allow in a name — the
 * colons of the kitchen ids («m1:side:L») among them — become «-»; the unpacked archive keeps the names it lists.
 */
const fileName = (id: string) => id.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');

const MATERIAL_RU: Record<string, string> = { LDSP: 'ЛДСП', HDF: 'ХДФ', MDF: 'МДФ', GLASS: 'Стекло', MIRROR: 'Зеркало', METAL: 'Металл' };

/** Paper layout of the part sheet, mm. */
const PART_LAYOUT = Object.freeze({
  /** Area of the part itself: room is left above for the width and the callouts, at the left for the height. */
  zone: { x0: 30, x1: 268, y0: 52, y1: 112 },
  tableTop: 124,
  tableBottom: 176,
  rowMm: 4,
  /** Columns of the operation table: code, X, Y, type. */
  columns: 3,
  columnMm: 57,
  /** The types of the operations at the right of the table. */
  legendX: 185,
  legendRowMm: 3.4,
});

/** Edge band of an edge as a sheet names it. */
function edgeText(part: Part, slot: EdgeSlot): string {
  const e = part.edges[slot],
    b = part.bevels?.find((x) => x.edge === slot);
  return `${slot} ${physicalEdgeRu(e.physicalEdge).toLowerCase()} — ${e.intent === 'NONE' ? 'без кромки' : `${fmt(e.edgeBandThicknessMm)} мм (${e.profileCode})`}${b ? `, скос ${fmt(b.angleDeg)}° к пласти: пласть ${b.shortFace} короче на ${fmt(b.setbackMm)} мм (${b.decision})` : ''}`;
}

/**
 * Sheets of one part: one view per face it is drawn from (sheetViews); a view whose table does not fit one page
 * continues on the next page with the same drawing (the prototype did the same, r1.html:52372).
 */
export function partSheets(g: Pick<Graph, 'parts' | 'operations' | 'revision' | 'versions' | 'result'>, partId: string, opts: { appVersion?: string } = {}): Sheet[] {
  const part = g.parts.find((p) => p.id === partId);
  if (!part) throw new Error(`В графе нет детали ${partId}`);
  const id = drawingIdentity(g, opts.appVersion),
    views = sheetViews(g, part),
    pages = views.map((v) => ({ v, ops: sheetOperations(g, part, v) })).map(({ v, ops }) => ({ v, ops, chunks: layoutChunks(ops) })),
    total = pages.reduce((n, p) => n + p.chunks.length, 0);
  let page = 0;
  return pages.flatMap(({ v, ops, chunks }) => chunks.map((chunk, k) => partSheetPage(part, v, ops, chunk, id, ++page, total, k + 1)));
}

interface Chunk {
  rows: SheetOperation[];
  legend: string[];
}

/** The rows of the operation table and the lines of the legend split into pages. */
function layoutChunks(ops: SheetOperation[]): Chunk[] {
  const L = PART_LAYOUT,
    perColumn = Math.floor((L.tableBottom - L.tableTop - 6) / L.rowMm),
    rowsPerPage = perColumn * L.columns,
    legend = ['ТИПЫ ОПЕРАЦИЙ', ...typesOf(ops).flatMap(([code, t]) => wrapText(`${code} — ${t}`, 297 - 10 - L.legendX))],
    legendPerPage = Math.floor((L.tableBottom - L.tableTop) / L.legendRowMm),
    n = Math.max(1, Math.ceil(ops.length / rowsPerPage), Math.ceil(legend.length / legendPerPage));
  return Array.from({ length: n }, (_, i) => ({ rows: ops.slice(i * rowsPerPage, (i + 1) * rowsPerPage), legend: legend.slice(i * legendPerPage, (i + 1) * legendPerPage) }));
}

/** Types of the operations of a view: one code per distinct operation (Т1, Т2…) with its purpose. */
/**
 * The service words of the purposes of the operations in the legend «Типы операций» (R6-010, R6-011 of the tester:
 * «blind», «through», «UNRESOLVED», «CAM», «CHANNEL», «WOOD_EDGE»). The graph keeps its words; only the sheet reads them
 * in Russian. A word not here — an article, a name — stays as it is.
 */
const PURPOSE_RU: Readonly<Record<string, string>> = {
  through: 'сквозное',
  blind: 'глухое',
  UNRESOLVED: 'не определено',
  CAM: 'эксцентрик',
  CHANNEL: 'канал штока',
  STUD: 'шток',
  EDGE: 'в торец',
  ANCHOR: 'под шток в плоскости',
  WOOD_EDGE: 'шкант в торец',
  WOOD_FACE: 'шкант в плоскость',
  WOOD_ANCHOR: 'шкант в плоскость',
  RUNNER_FIXING: 'крепление направляющей',
  RUNNER_HOOK: 'крючок направляющей',
  CONFIRMAT_THROUGH: 'конфирмат, сквозное',
  CONFIRMAT_EDGE: 'конфирмат в торец',
  HINGE_PLATE: 'монтажная планка петли',
  HINGE_CUP: 'чашка петли',
  HINGE_CUP_FIXING: 'крепление чашки петли',
  SHELF_SUPPORT_HOLE: 'полкодержатель',
  SHELF_SUPPORT_SPARE: 'запасной уровень полкодержателя',
  SHELF_BORE: 'гнездо полкодержателя в полке',
  CABLE_OUTLET: 'вывод кабеля',
  // The hangers SAH216 of the wall cabinets of the kitchen.
  pin: 'штифт',
  access: 'отверстие доступа',
};
export const purposeRu = (purpose: string): string => purpose.replace(/[A-Za-z_]+/g, (w) => PURPOSE_RU[w] ?? w);

function typesOf(ops: SheetOperation[]): [string, string][] {
  const seen = new Map<string, string>();
  for (const o of ops) {
    const key = `${o.type} · ${purposeRu(o.purpose)}`;
    if (!seen.has(key)) seen.set(key, `Т${seen.size + 1}`);
  }
  return [...seen].map(([t, code]) => [code, t]);
}

function partSheetPage(part: Part, view: SheetView, ops: SheetOperation[], chunk: Chunk, id: DrawingIdentity, page: number, total: number, viewPage: number): Sheet {
  const [W, H] = drawingSheets.constants.partSheetMm.value,
    L = PART_LAYOUT,
    f = productionFrame(part, view.side),
    rotated = f.heightMm > f.widthMm * edgeModel.constants.pageRotationRatio.value,
    pw = rotated ? f.heightMm : f.widthMm,
    ph = rotated ? f.widthMm : f.heightMm,
    zw = L.zone.x1 - L.zone.x0,
    zh = L.zone.y1 - L.zone.y0,
    denom = pick(drawingSheets.constants.scaleDenominators.value, (d) => pw / d <= zw && ph / d <= zh),
    k = 1 / denom,
    w = pw * k,
    h = ph * k,
    px = L.zone.x0 + (zw - w) / 2,
    py = L.zone.y0 + (zh - h) / 2,
    // Production X, Y → paper; a tall part is turned a quarter only on paper (drawingPageLayoutForPart, r1.html:5493).
    at = (X: number, Y: number) => (rotated ? { x: px + (f.heightMm - Y) * k, y: py + X * k } : { x: px + X * k, y: py + Y * k }),
    types = new Map(typesOf(ops).map(([code, t]) => [t, code])),
    typeOf = (o: SheetOperation) => types.get(`${o.type} · ${purposeRu(o.purpose)}`)!,
    viewTitle = view.content === 'FACE' ? faceRu(f.face) : view.content === 'EDGE_ONLY' ? 'Торцевая присадка' : 'Без присадки';
  const hd = header(part.name.toUpperCase(), `${part.id} · ${part.role}`, id, W, page, total);
  let s = svgOpen(W, H, 'PART', `data-part-id="${esc(part.id)}" data-face="${esc(view.side)}" data-view="${view.content}" data-scale="${denom}" data-rotated="${rotated}"`) + hd.svg;
  s += text(10, hd.bottom + 6, `${viewTitle.toUpperCase()} (${view.side}) · МАСШТАБ 1:${String(denom).replace('.', ',')}`, 3.5, 'font-weight="700"');
  s += text(W - 10, hd.bottom + 6, `X × Y: ${fmt(f.widthMm)} × ${fmt(f.heightMm)} мм${rotated ? ' · деталь повёрнута только на листе' : ''}`, MIN_TEXT, 'text-anchor="end"');
  wrapText('Кромка: ' + (['A', 'B', 'C', 'D'] as EdgeSlot[]).map((x) => edgeText(part, x)).join('; '), W - 20).forEach((l, i) => (s += text(10, hd.bottom + 10.5 + i * 3.6, l)));

  // The part, its edges (a banded edge — a thick line), the overall sizes and the production origin.
  let lines = `<rect x="${n2(px)}" y="${n2(py)}" width="${n2(w)}" height="${n2(h)}" stroke-width="0.5"/>`;
  const corner = (side: ScreenSide) => {
    const map = { top: [px, py, px + w, py], bottom: [px, py + h, px + w, py + h], left: [px, py, px, py + h], right: [px + w, py, px + w, py + h] } as const;
    const [x1, y1, x2, y2] = map[side];
    return { x1, y1, x2, y2 };
  };
  const paperSide = (slot: EdgeSlot): ScreenSide => {
    const sd = f.sideOfEdge(slot);
    if (!rotated) return sd;
    return ({ left: 'top', right: 'bottom', top: 'right', bottom: 'left' } as const)[sd];
  };
  let labels = '';
  for (const slot of ['A', 'B', 'C', 'D'] as EdgeSlot[]) {
    const sd = paperSide(slot),
      c = corner(sd);
    if (part.edges[slot].intent !== 'NONE') lines += line(c.x1, c.y1, c.x2, c.y2, 1.1, `data-edge="${slot}"`);
    // The letter of the edge inside the part next to it: top at a quarter, bottom at three quarters of the width,
    // so the two never meet on a narrow part.
    const at2 = { top: [px + w / 4, py + 3.6, 'middle'], bottom: [px + (3 * w) / 4, py + h - 1.2, 'middle'], left: [px + 1.4, py + h / 2 + 1, 'start'], right: [px + w - 1.4, py + h / 2 + 1, 'end'] } as const,
      [lx, ly, anchor] = at2[sd],
      label = slot + (part.edges[slot].intent === 'NONE' ? '' : ` ${fmt(part.edges[slot].edgeBandThicknessMm)}`);
    labels += text(lx, ly, label, MIN_TEXT, `font-weight="700" text-anchor="${anchor}" fill="${SOFT}" stroke="#fff" stroke-width="0.7" paint-order="stroke" data-edge-label="${slot}"`);
  }
  // Overall sizes: along the paper width above the part, along its height at the left.
  lines += line(px, py - 9, px + w, py - 9) + line(px, py - 10.5, px, py - 0.8, 0.12) + line(px + w, py - 10.5, px + w, py - 0.8, 0.12);
  lines += line(px - 9, py, px - 9, py + h) + line(px - 10.5, py, px - 0.8, py, 0.12) + line(px - 10.5, py + h, px - 0.8, py + h, 0.12);
  labels += text(px + w / 2, py - 10, fmt(pw), 3, 'text-anchor="middle"');
  labels += text(px - 10, py + h / 2, fmt(ph), 3, `text-anchor="middle" transform="rotate(-90 ${n2(px - 10)} ${n2(py + h / 2)})"`);
  const o = at(0, 0),
    xa = at(Math.min(f.widthMm, 12 / k), 0),
    ya = at(0, Math.min(f.heightMm, 12 / k));
  lines += `<circle cx="${n2(o.x)}" cy="${n2(o.y)}" r="0.8" fill="${INK}"/>` + line(o.x, o.y, xa.x, xa.y, 0.25, `stroke="${SOFT}"`) + line(o.x, o.y, ya.x, ya.y, 0.25, `stroke="${SOFT}"`);
  labels += text(xa.x + (rotated ? -1.2 : 1), xa.y + (rotated ? 3.2 : -1), 'X', MIN_TEXT, `fill="${SOFT}"`) + text(ya.x + (rotated ? -3.2 : 1), ya.y + (rotated ? -1 : 3.2), 'Y', MIN_TEXT, `fill="${SOFT}"`);

  // Operations: a hole — its circle at scale with a cross; through — filled; an edge hole — its depth into the part;
  // a groove — its strip; a cut-out — a hatched outline.
  let opsSvg = '';
  for (const op of ops) {
    const p = at(op.X, op.Y);
    let g = '';
    if (op.kind === 'H') {
      const r = Math.max(0.35, (op.sizeMm * k) / 2);
      g += `<circle cx="${n2(p.x)}" cy="${n2(p.y)}" r="${n2(r)}" stroke-width="0.18" ${op.through && !op.marking ? `fill="${INK}"` : 'fill="#fff"'}${op.marking ? ' stroke-dasharray="0.6 0.4"' : ''}/>`;
      g += line(p.x - r - 0.6, p.y, p.x + r + 0.6, p.y, 0.1) + line(p.x, p.y - r - 0.6, p.x, p.y + r + 0.6, 0.1);
    } else if (op.kind === 'E') {
      const sd = paperSide(op.edge!),
        dir = { left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] }[sd]!,
        depth = (op.depthMm ?? 0) * k,
        r = Math.max(0.3, (op.sizeMm * k) / 2),
        nx = -dir[1]!,
        ny = dir[0]!;
      g += line(p.x + nx * r, p.y + ny * r, p.x - nx * r, p.y - ny * r, 0.35, 'stroke="#b42318"');
      for (const sgn of [1, -1]) g += line(p.x + sgn * nx * r, p.y + sgn * ny * r, p.x + sgn * nx * r + dir[0]! * depth, p.y + sgn * ny * r + dir[1]! * depth, 0.15, 'stroke="#b42318" stroke-dasharray="0.8 0.5"');
    } else if (op.kind === 'G') {
      const b = at(op.X2!, op.Y2!);
      g += line(p.x, p.y, b.x, b.y, Math.max(0.25, op.sizeMm * k), 'stroke="#5146b8" stroke-opacity="0.55" stroke-linecap="butt"');
    } else {
      const b = at(op.X2!, op.Y2!),
        x = Math.min(p.x, b.x),
        y = Math.min(p.y, b.y);
      g += `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(Math.abs(b.x - p.x))}" height="${n2(Math.abs(b.y - p.y))}" stroke-width="0.25" stroke-dasharray="1 0.6" fill="${SOFT}" fill-opacity="0.18"/>`;
    }
    opsSvg += `<g data-operation-id="${esc(op.id)}" data-kind="${op.kind}"><title>${esc(`${op.code} · ${op.type} · ${op.purpose}`)}</title>${g}</g>`;
  }
  lines += opsSvg;

  // Callouts: the operations of one strip of the paper (14 mm) above or below the middle share one label.
  const strip = 14,
    groups = new Map<string, { side: 'top' | 'bottom'; slot: number; ops: SheetOperation[] }>();
  for (const op of ops) {
    const p = at(op.kind === 'G' || op.kind === 'N' ? (op.X + op.X2!) / 2 : op.X, op.kind === 'G' || op.kind === 'N' ? (op.Y + op.Y2!) / 2 : op.Y),
      side = p.y < py + h / 2 ? 'top' : 'bottom',
      slot = Math.max(0, Math.floor((p.x - px) / strip)),
      key = side + slot;
    if (!groups.has(key)) groups.set(key, { side, slot, ops: [] });
    groups.get(key)!.ops.push(op);
  }
  for (const gr of groups.values()) {
    const first = gr.ops[0]!,
      p = at(first.kind === 'G' || first.kind === 'N' ? (first.X + first.X2!) / 2 : first.X, first.kind === 'G' || first.kind === 'N' ? (first.Y + first.Y2!) / 2 : first.Y),
      lx = Math.min(px + w + 4, Math.max(px - 4, px + gr.slot * strip + strip / 2)),
      ly = gr.side === 'top' ? py - 2.2 : py + h + 4.6,
      label = first.code + (gr.ops.length > 1 ? ` +${gr.ops.length - 1}` : '');
    lines += line(p.x, p.y, lx, gr.side === 'top' ? ly + 0.6 : ly - 3, 0.1, `stroke="${SOFT}"`);
    labels += text(lx, ly, label, MIN_TEXT, 'text-anchor="middle"');
  }
  s += strokes(lines) + labels;

  // The operation table: code, X, Y, type, in three columns; the legend at the right.
  const perColumn = Math.floor((L.tableBottom - L.tableTop - 6) / L.rowMm);
  s += text(10, L.tableTop - 2, viewPage > 1 ? 'ОПЕРАЦИИ (ПРОДОЛЖЕНИЕ)' : 'ОПЕРАЦИИ · КООРДИНАТЫ X, Y ОТ НАЧАЛА ●, ММ', 3.2, 'font-weight="700"');
  let grid = '';
  for (let c = 0; c < L.columns; c++) {
    const x = 10 + c * L.columnMm,
      rows = chunk.rows.slice(c * perColumn, (c + 1) * perColumn);
    if (!rows.length && c > 0) break;
    s += text(x + 1, L.tableTop + 3.5, 'КОД', MIN_TEXT, `fill="${SOFT}"`) + text(x + 25, L.tableTop + 3.5, 'X', MIN_TEXT, `text-anchor="end" fill="${SOFT}"`) + text(x + 41, L.tableTop + 3.5, 'Y', MIN_TEXT, `text-anchor="end" fill="${SOFT}"`) + text(x + 44, L.tableTop + 3.5, 'ТИП', MIN_TEXT, `fill="${SOFT}"`);
    grid += line(x, L.tableTop + 5, x + L.columnMm - 3, L.tableTop + 5, 0.15);
    // A groove from its start along its axis, a cut-out from its corner nearest to the origin; the rest is in its type.
    rows.forEach((op, i) => {
      const y = L.tableTop + 5 + (i + 1) * L.rowMm - 1;
      s += `<g data-operation-row="${esc(op.id)}">` + text(x + 1, y, op.code, 3) + text(x + 25, y, fmt(op.X), 3, 'text-anchor="end"') + text(x + 41, y, fmt(op.Y), 3, 'text-anchor="end"') + text(x + 44, y, typeOf(op), 3) + '</g>';
    });
  }
  if (!chunk.rows.length) s += text(11, L.tableTop + 9, view.content === 'NONE' ? 'Операций нет: деталь без присадки и пазов.' : 'Операций на этой стороне нет.', 3);
  let ly = L.tableTop + 1.5;
  for (const l of chunk.legend) {
    const head = l === 'ТИПЫ ОПЕРАЦИЙ';
    s += text(L.legendX, ly, l, head ? 3.2 : MIN_TEXT, head ? 'font-weight="700"' : '');
    ly += L.legendRowMm;
  }
  s += strokes(grid + line(L.legendX - 4, L.tableTop - 5, L.legendX - 4, L.tableBottom, 0.15));

  const T = part.finishedWithEdge.panelThicknessMm;
  s += footer(W, H, [
    ['MODULERO', `${fmt(part.finishedWithEdge.lengthMm)} × ${fmt(part.finishedWithEdge.widthMm)} × ${fmt(T)} мм · 1 шт.`, `${MATERIAL_RU[part.material.family] ?? part.material.family} ${fmt(part.material.panelThicknessMm)} мм · ${part.material.label}`, part.supply === 'PURCHASED' ? 'Покупная готовая деталь' : 'Изготовление в составе заказа'],
    ['База: готовая деталь с кромкой (E)', 'Присадка — после кромления', `Масштаб 1:${String(denom).replace('.', ',')} · размеры в мм`, 'Ручки не присаживаются (MOD-DEC-158)'],
    stampLines(id),
  ]);
  s += SVG_CLOSE;
  return {
    name: `${fileName(part.id)}_${view.side}_${viewPage}`,
    partId: part.id,
    side: view.side,
    page,
    pages: total,
    widthMm: W,
    heightMm: H,
    scale: denom,
    operationIds: chunk.rows.map((o) => o.id),
    svg: s,
  };
}

// ---------------------------------------------------------------- the general drawing

const PRODUCT_RU: Record<Graph['product'], string> = { WARDROBE: 'Шкаф распашной', SLIDING_WARDROBE: 'Шкаф-купе', KITCHEN: 'Кухня', HOME: 'Мебель' };

type Box = ScenePart['boxMm'];

/**
 * The general drawing (GENERAL_V7 of r1, MOD-DEC-120): the front without and with the fronts at one scale, the
 * overall sizes and the nominal widths of the sections, and the reference axonometric view 28° / 20° (MOD-DEC-107).
 * Every rectangle and every face is a part of the scene of the graph (`data-part-id`): no formulas of its own.
 */
export function generalSheet(g: Graph, opts: { appVersion?: string } = {}): Sheet {
  const [W, H] = drawingSheets.constants.generalSheetMm.value,
    id = drawingIdentity(g, opts.appVersion),
    scene = sceneOf(g),
    B = scene.boundsMm,
    PW = B.max[0] - B.min[0],
    PH = B.max[2] - Math.min(0, B.min[2]),
    denom = pick(drawingSheets.constants.scaleDenominators.value, (d) => PW / d <= 112 && PH / d <= 150),
    k = 1 / denom,
    zoneTop = 62,
    hd = header(`${PRODUCT_RU[g.product].toUpperCase()} · ОБЩИЙ ЧЕРТЁЖ`, `${fmt(g.envelope.widthMm)} × ${fmt(g.envelope.heightMm)} × ${fmt(g.envelope.depthMm)} мм · деталей ${g.parts.length}`, id, W, 1, 1);
  let s = svgOpen(W, H, 'GENERAL', `data-scale="${denom}" data-azimuth="${drawingSheets.constants.axonometryDeg.value[0]}" data-elevation="${drawingSheets.constants.axonometryDeg.value[1]}"`) + hd.svg;
  const floorY = zoneTop + 8 + PH * k,
    front = (x0: number, fronts: boolean) => {
      const X = (x: number) => x0 + (x - B.min[0]) * k,
        Y = (z: number) => floorY - z * k;
      let body = '';
      const parts = scene.parts.filter((p) => fronts || p.surface !== 'FACADE').sort((a, b) => b.boxMm.max[1] - a.boxMm.max[1]);
      for (const p of parts) {
        const b = p.boxMm,
          fill = p.role === 'BACK_PANEL' ? '#f2f2f0' : '#fff';
        body += `<rect data-part-id="${esc(p.id)}" x="${n2(X(b.min[0]))}" y="${n2(Y(b.max[2]))}" width="${n2(Math.max(0.05, (b.max[0] - b.min[0]) * k))}" height="${n2(Math.max(0.05, (b.max[2] - b.min[2]) * k))}" fill="${fill}" stroke-width="0.25"/>`;
      }
      if (!fronts)
        for (const m of g.mechanisms.filter((x) => x.kind === 'CLOTHES_ROD')) {
          const a = g.assemblies.find((x) => x.id === m.assemblyId),
            z = Number(m.params.axisElevationMm);
          if (!a || !Number.isFinite(z)) continue;
          body += line(X(a.box.minMm[0]), Y(z), X(a.box.minMm[0] + a.box.sizeMm[0]), Y(z), 0.5, `stroke-dasharray="1.5 0.8" data-mechanism-id="${esc(m.id)}"`);
        }
      return { body, X, Y };
    };
  const left = 30,
    right = 160,
    v1 = front(left, false),
    v2 = front(right, true);
  s += text(left, zoneTop - 6, 'ВИД СПЕРЕДИ · БЕЗ ФАСАДОВ', 3.5, 'font-weight="700"') + text(left, zoneTop - 1.5, `Масштаб 1:${denom}`, MIN_TEXT);
  s += text(right, zoneTop - 6, 'ВИД СПЕРЕДИ · С ФАСАДАМИ', 3.5, 'font-weight="700"') + text(right, zoneTop - 1.5, `Масштаб 1:${denom}`, MIN_TEXT);
  let dims = '',
    labels = '';
  // Overall width above and height at the left of the first view; the sections' nominal widths below it.
  const xa = v1.X(B.min[0]),
    xb = v1.X(B.max[0]),
    yt = v1.Y(B.max[2]);
  dims += line(xa, yt - 4, xb, yt - 4) + line(xa, yt - 5.5, xa, yt - 0.8, 0.12) + line(xb, yt - 5.5, xb, yt - 0.8, 0.12);
  labels += text((xa + xb) / 2, yt - 5, fmt(PW), 3, 'text-anchor="middle"');
  dims += line(xa - 5, yt, xa - 5, floorY) + line(xa - 6.5, yt, xa - 0.8, yt, 0.12) + line(xa - 6.5, floorY, xa - 0.8, floorY, 0.12);
  labels += text(xa - 6, (yt + floorY) / 2, fmt(B.max[2]), 3, `text-anchor="middle" transform="rotate(-90 ${n2(xa - 6)} ${n2((yt + floorY) / 2)})"`);
  const sections = g.assemblies.filter((a) => a.kind === 'SECTION' && a.span).sort((a, b) => ratValue(a.span!.nominalStartMm) - ratValue(b.span!.nominalStartMm));
  const dy = floorY + 7;
  for (const a of sections) {
    const x0 = v1.X(ratValue(a.span!.nominalStartMm)),
      x1 = v1.X(ratValue(a.span!.nominalEndMm));
    dims += line(x0, dy, x1, dy, 0.18) + line(x0, dy - 1.5, x0, dy + 1.5, 0.12) + line(x1, dy - 1.5, x1, dy + 1.5, 0.12);
    labels += text((x0 + x1) / 2, dy - 1, fmt(ratValue(a.span!.nominalEndMm) - ratValue(a.span!.nominalStartMm)), MIN_TEXT, 'text-anchor="middle"');
  }
  dims += line(v1.X(B.min[0]) - 8, floorY, v1.X(B.max[0]) + 8, floorY, 0.35, `stroke="${SOFT}"`) + line(v2.X(B.min[0]) - 8, floorY, v2.X(B.max[0]) + 8, floorY, 0.35, `stroke="${SOFT}"`);
  s += strokes(v1.body + v2.body + dims) + labels;

  // The axonometric view: the visible faces of every part box, drawn from the back to the front.
  const [azDeg, elDeg] = drawingSheets.constants.axonometryDeg.value,
    { faces, raw } = axonometry(scene.parts);
  const all = faces.flatMap((f) => f.pts.map(raw)),
    minU = Math.min(...all.map((p) => p[0])),
    maxU = Math.max(...all.map((p) => p[0])),
    minV = Math.min(...all.map((p) => p[1])),
    maxV = Math.max(...all.map((p) => p[1])),
    iso = Math.min(110 / Math.max(1, maxU - minU), 150 / Math.max(1, maxV - minV)),
    ax = 295,
    P = (q: Vec3) => {
      const [u, v] = raw(q);
      return `${n2(ax + (u - minU) * iso)},${n2(zoneTop + 8 + (v - minV) * iso)}`;
    };
  s += text(ax, zoneTop - 6, 'АКСОНОМЕТРИЧЕСКИЙ ВИД', 3.5, 'font-weight="700"') + text(ax, zoneTop - 1.5, `Без масштаба · ${azDeg}° / ${elDeg}°`, MIN_TEXT);
  s += strokes(faces.map((f) => `<polygon data-part-id="${esc(f.id)}" points="${f.pts.map(P).join(' ')}" fill="${f.shade}" stroke-width="0.2" stroke-linejoin="round"/>`).join(''));

  // Notes under the views.
  let ny = Math.max(floorY + 16, 228);
  // The installation requirements of the graph go to the document with who decides them (Handbook INV-H26-02, FINDINGS 549).
  const notes: { text: string; attrs?: string }[] = [
    { text: `Размеры — готовые детали с кромкой, мм. Секции по номиналу: ${sections.map((x) => fmt(ratValue(x.span!.nominalEndMm) - ratValue(x.span!.nominalStartMm))).join(' / ') || '—'}; чистые проёмы: ${sections.map((x) => fmt(ratValue(x.span!.clearEndMm) - ratValue(x.span!.clearStartMm))).join(' / ') || '—'}.` },
    ...installationGroups(g).flatMap((x) => [
      { text: `Монтаж${x.required ? ', обязательно' : ''} · решает: ${SELECTION_RU[x.selection] ?? x.selection} · деталей: ${x.partIds.size}`, attrs: 'font-weight="700"' },
      { text: x.text, attrs: `data-installation-requirement="${esc(x.ids.join(' '))}"` },
    ]),
    { text: `Деталей ${g.parts.length}, из них изготавливаемых ${scene.manufacturedParts}; отверстий ${g.operations.filter((o) => o.op === 'HOLE').length}, пазов ${g.operations.filter((o) => o.op === 'GROOVE').length}. Штанги — пунктир по оси (каталога штанг нет).` },
    { text: g.unresolved.length ? `Замечаний графа: ${g.unresolved.length}; ${g.unresolved.filter((u) => u.blocksProductionReadiness).length} из них блокируют готовность к производству.` : 'Замечаний графа нет.' },
  ];
  for (const n of notes)
    for (const l of wrapText(n.text, W - 20, 3)) {
      if (ny > H - 34) break;
      s += text(10, ny, l, 3, n.attrs);
      ny += 4.4;
    }
  s += footer(W, H, [
    ['MODULERO', `${PRODUCT_RU[g.product]} ${fmt(g.envelope.widthMm)} × ${fmt(g.envelope.heightMm)} × ${fmt(g.envelope.depthMm)} мм`, `Высота установки ${fmt(g.envelope.installedHeightMm)} мм`, `Секций ${sections.length}`],
    [`Масштаб видов спереди 1:${denom}`, `Аксонометрия ${azDeg}° / ${elDeg}° без масштаба`, 'Детали и присадка — листы деталей', 'Все размеры в миллиметрах'],
    stampLines(id),
  ]);
  s += SVG_CLOSE;
  return { name: 'general', partId: null, side: null, page: 1, pages: 1, widthMm: W, heightMm: H, scale: denom, operationIds: [], svg: s };
}

// ---------------------------------------------------------------- the reference axonometry

/** A visible face of a part box in the axonometry: its corners in product axes, the shade and the depth to sort by. */
export interface AxonometricFace {
  id: string;
  pts: Vec3[];
  depth: number;
  shade: string;
}

/**
 * The visible faces (front, right, top) of every part box in the reference axonometry 28° / 20° (MOD-DEC-107),
 * sorted from the back to the front, and the projection of a point to the paper before scaling — the depth of the
 * prototype (u133Faces, r1.html:19536) in the axes of the graph. The general drawing and the assembly scheme of the
 * production package draw with it.
 */
export function axonometry(parts: ScenePart[]): { faces: AxonometricFace[]; raw: (p: Vec3) => [number, number] } {
  const [azDeg, elDeg] = drawingSheets.constants.axonometryDeg.value,
    a = (azDeg * Math.PI) / 180,
    e = (elDeg * Math.PI) / 180,
    raw = (p: Vec3): [number, number] => [p[0] * Math.cos(a) + p[1] * Math.sin(a), -p[2] * Math.cos(e) - p[1] * Math.cos(a) * Math.sin(e) + p[0] * Math.sin(a) * Math.sin(e)],
    faces: AxonometricFace[] = [];
  for (const p of parts) {
    const b: Box = p.boxMm,
      [x0, y0, z0] = b.min,
      [x1, y1, z1] = b.max;
    const quads: [Vec3[], string][] = [
      [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], '#fff'],
      [[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], '#eceae6'],
      [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], '#f7f6f3'],
    ];
    for (const [pts, shade] of quads) {
      const c = pts.reduce<Vec3>((acc, q) => [acc[0] + q[0] / 4, acc[1] + q[1] / 4, acc[2] + q[2] / 4], [0, 0, 0]);
      faces.push({ id: p.id, pts, shade, depth: c[0] * Math.sin(a) * Math.cos(e) + c[2] * Math.sin(e) - c[1] * Math.cos(a) * Math.cos(e) });
    }
  }
  faces.sort((p, q) => p.depth - q.depth);
  return { faces, raw };
}

// ---------------------------------------------------------------- the whole set

/** The general drawing and the sheets of every part, in the order of the graph. */
export function drawingSet(g: Graph, opts: { appVersion?: string; parts?: string[] } = {}): Sheet[] {
  const ids = opts.parts ?? g.parts.map((p) => p.id);
  return [generalSheet(g, opts), ...ids.flatMap((id) => partSheets(g, id, opts))];
}

/**
 * The paper primitives of the sheets, shared with the production package (production.ts) so its pages have the same
 * header, stamp, font and smallest text as the drawings. Not a public API of the engine.
 */
export const sheetPrimitives = Object.freeze({ FONT, INK, SOFT, MIN_TEXT, esc, n2, fmt, text, line, wrapText, svgOpen, SVG_CLOSE, strokes, header, footer, stampLines, qualificationText, installationGroups, SELECTION_RU, PRODUCT_RU });
