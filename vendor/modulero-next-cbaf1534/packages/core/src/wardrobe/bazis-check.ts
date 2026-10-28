// Check of a BAZIS project of a wardrobe against the engine (task PROD-4, MOD-DEC-500, 542): the panels of a .b3d in
// the axes of the product, the wardrobe recognised in them, the same wardrobe set up with the editor, and the
// differences part by part for the bell. The engine builds the wardrobe by its own rules from the overall size, the
// sections, the base, the panels, the doors and the fill read here; every part it makes differently from the file is a
// remark. docs/findings/1151-bazis-check.md.
//
// Axes: X to the right from the outer face of the left side, Y to the back from the front edge of the sides, Z up from
// the floor — those of the graph (bazis/axes.ts turns BAZIS into them). The floor is Y = 0 of the BAZIS model, or the
// lowest panel when one goes under it.
import { fromBazisPoint, readPanels, type BazisModel, type BazisPanel } from '@modulero/bazis';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Graph, Part, PartRole, Vec3 } from '../engine/contract.js';
import { wardrobeGraph } from '../engine/generators/wardrobe.js';
import { partBox, type Aabb } from '../engine/invariants/geometry.js';
import { bazisImport } from '../engine/policy/bazis-import.js';
import * as ed from './editor.js';
import type { WardrobeInput } from './input.js';

const TOL = bazisImport.constants.compare.value;
// Rules of the reading without a decision ((Д) of the executor, FINDINGS 1153; the owner's question is in PR #362): a
// vertical part over half the height is a partition (across X) or a door (across Y), a lower one a part of the fill
// or of a drawer; a rod of the file is hardware or a profile named «…штанг…» (a rod has no panel).
const TALL = 0.5;
const ROD = 'штанг';

/** What a panel is in the wardrobe. */
export type PanelKind = 'side' | 'partition' | 'top' | 'bottom' | 'shelf' | 'back' | 'plinth' | 'door' | 'leaf' | 'drawer' | 'upright' | 'other';

export const PANEL_KIND_RU: Record<PanelKind, [one: string, many: string]> = {
  side: ['Боковина', 'Боковины'],
  partition: ['Перегородка', 'Перегородки'],
  top: ['Крыша', 'Крыши'],
  bottom: ['Дно', 'Днища'],
  shelf: ['Полка', 'Полки'],
  back: ['Задняя стенка', 'Задние стенки'],
  plinth: ['Планка цоколя', 'Планки цоколя'],
  door: ['Фасад', 'Фасады'],
  leaf: ['Вставка створки', 'Вставки створок'],
  drawer: ['Деталь ящика', 'Детали ящиков'],
  upright: ['Стоевая', 'Стоевые'],
  other: ['Деталь', 'Детали'],
};

/** The kind of a part of the graph, by its role. */
const ROLE_KIND: Partial<Record<PartRole, PanelKind>> = {
  SIDE_PANEL_LEFT: 'side',
  SIDE_PANEL_RIGHT: 'side',
  PARTITION: 'partition',
  CARCASS_TOP_PANEL: 'top',
  TOP_COVER_PANEL: 'top',
  CARCASS_BOTTOM_PANEL: 'bottom',
  BACK_PANEL: 'back',
  PLINTH_PANEL: 'plinth',
  FIXED_SHELF: 'shelf',
  ADJUSTABLE_SHELF: 'shelf',
  DRAWER_COVER_SHELF: 'shelf',
  HINGED_FACADE_LEAF: 'door',
  LIFT_FACADE_LEAF: 'door',
  DECORATIVE_FACADE: 'door',
  SLIDING_LEAF_INFILL: 'leaf',
  STRUCTURAL_FRONT: 'drawer',
  DRAWER_BOX_SIDE: 'drawer',
  DRAWER_BOX_BACK: 'drawer',
  DRAWER_BOTTOM_PANEL: 'drawer',
  DRAWER_RUNNER_SPACER: 'drawer',
  FILLING_DIVIDER: 'upright',
  LOCAL_PARTITION: 'upright',
  VERTICAL_STRUCTURAL_PANEL: 'upright',
};
export const partKind = (p: Part): PanelKind => ROLE_KIND[p.role] ?? 'other';

/** A panel of the file in the axes of the product. */
export interface FilePanel {
  /** `ArtPos` of BAZIS, else the order of the panel in the file (`№ 7`). */
  id: string;
  name: string;
  material: string | null;
  box: Aabb;
  /** Axis of the product across the panel: 0 — X, 1 — Y, 2 — Z. */
  axis: 0 | 1 | 2;
  kind: PanelKind;
  /** The section of a shelf, a door, a drawer part; null for the carcass. */
  section: number | null;
}

/** A section of the file: between the outer faces of the sides and the middles of the partitions (the nominal width). */
export interface FileSection {
  fromMm: number;
  toMm: number;
  facade: ed.FacadeChoice;
  /** Rows of doors from the bottom up when there are two or more, with their heights. */
  rows: { heightMm: number; leaves: 1 | 2 }[];
  /** Middles of the shelves over the top of the bottom of the section, mm (as `moveShelf` takes them). */
  shelves: number[];
  drawers: { count: number; external: boolean };
  rods: number;
}

export interface BazisWardrobe {
  /** Version of the BAZIS model, «23.15». */
  version: string | null;
  product: ed.ProductChoice;
  size: { width: number; height: number; depth: number };
  sections: FileSection[];
  /** Indexes of the sections where a new body starts (two sides side by side). */
  joints: number[];
  base: { kind: ed.BaseChoice; heightMm: number };
  top: boolean;
  back: boolean;
  inset: boolean;
  /** Leaves of a sliding wardrobe, their scheme and its mirror (null — the tracks match no scheme of the engine). */
  leaves: number;
  scheme: { scheme: 'ALT' | 'PAIR4'; mirror: boolean } | null;
  panels: FilePanel[];
  /** Panels and objects the check does not compare, with the reason. */
  skipped: string[];
  /** The wardrobe of the engine: the start project of the editor with the edits of what was read. */
  input: WardrobeInput;
  /** Edits the editor refused, with its words: the wardrobe of the engine is built without them. */
  refused: string[];
  /** What the editor said of an accepted edit (a drawer raised over a hinge, a shelf on the grid): its rule. */
  notices: string[];
  /** What the file does not say and the engine takes by default. */
  assumed: string[];
}

export interface BazisRemark {
  code: 'NOT_BUILT' | 'RULE' | 'ASSUMED' | 'SKIPPED' | 'MISSING_IN_FILE' | 'EXTRA_IN_FILE' | 'SIZE' | 'THICKNESS' | 'POSITION';
  kind: PanelKind | null;
  text: string;
  /** Parts of the graph and panels of the file the remark is about. */
  partIds: string[];
  fileIds: string[];
}

// ---------------------------------------------------------------- numbers

const fmt = (x: number) => String(Math.round(x * 10) / 10 + 0).replace('.', ',');
const round3 = (x: number) => Math.round(x * 1000) / 1000 + 0;
const centre = (b: Aabb, k: number) => (b.min[k]! + b.max[k]!) / 2;
const extent = (b: Aabb, k: number) => b.max[k]! - b.min[k]!;
const shift = (b: Aabb, d: Vec3): Aabb => ({ min: b.min.map((x, k) => x - d[k]!) as Vec3, max: b.max.map((x, k) => x - d[k]!) as Vec3 });
/** Length of the common part of two ranges; negative — apart. */
const common = (a: Aabb, b: Aabb, k: number) => Math.min(a.max[k]!, b.max[k]!) - Math.max(a.min[k]!, b.min[k]!);
/** The in-plane sizes, larger first, and the thickness: «2200 × 582 × 16». */
function dims(b: Aabb, axis: number): [number, number, number] {
  const [u, v] = [0, 1, 2].filter((k) => k !== axis).map((k) => extent(b, k)).sort((x, y) => y - x);
  return [u!, v!, extent(b, axis)];
}
const dimsText = (d: [number, number, number]) => `${fmt(d[0])} × ${fmt(d[1])} × ${fmt(d[2])} мм`;
const AXIS: Record<'x' | 'y' | 'z', 0 | 1 | 2> = { x: 0, y: 2, z: 1 };
const axisOf = (n: Vec3): 0 | 1 | 2 => [0, 1, 2].reduce((a, k) => (Math.abs(n[k]!) > Math.abs(n[a]!) ? k : a), 0) as 0 | 1 | 2;

// ---------------------------------------------------------------- reading

/** A box of BAZIS in the axes of the product before the shift: X, −Z, Y (fromBazisPoint with the depth 0). */
function productBox(b: { min: Vec3; max: Vec3 }): Aabb {
  const p = fromBazisPoint(b.min, 0),
    q = fromBazisPoint(b.max, 0);
  return { min: [0, 1, 2].map((k) => Math.min(p[k]!, q[k]!)) as Vec3, max: [0, 1, 2].map((k) => Math.max(p[k]!, q[k]!)) as Vec3 };
}

const panelName = (p: BazisPanel) => (p.name ?? '').split('\r')[0]!.trim();

/**
 * The wardrobe of a .b3d: what the engine needs to build the same one, and the panels of the file classified for the
 * check. Refused when the file has no wardrobe carcass (two tall sides).
 */
export function readBazisWardrobe(bytes: Uint8Array, hw: HardwareCatalogs): BazisWardrobe {
  return recogniseWardrobe(readPanels(bytes), hw);
}

export function recogniseWardrobe(model: BazisModel, hw: HardwareCatalogs): BazisWardrobe {
  const skipped: string[] = [],
    raw: { p: BazisPanel; box: Aabb; axis: 0 | 1 | 2; id: string }[] = [];
  model.panels.forEach((p, k) => {
    const id = p.position?.trim() || `№ ${k + 1}`;
    if (!p.box || p.normalAxis === null) {
      skipped.push(`«${panelName(p) || id}»: ${p.box ? 'не по осям модели' : `контур не прочитан (${p.contourError ?? 'нет контура'})`} — не сверяется`);
      return;
    }
    raw.push({ p, box: productBox(p.box), axis: AXIS[p.normalAxis], id });
  });
  if (!raw.length) throw new Error('В файле нет панелей, которые можно сверить со шкафом');
  const floor = Math.min(0, ...raw.map((r) => r.box.min[2]!)),
    height = Math.max(...raw.map((r) => r.box.max[2]!)) - floor,
    tall = (r: (typeof raw)[number]) => extent(r.box, 2) >= TALL * height,
    uprights = raw.filter((r) => r.axis === 0 && tall(r)).sort((a, b) => a.box.min[0]! - b.box.min[0]!);
  if (uprights.length < 2) throw new Error('В файле не найдены две боковины выше половины высоты изделия: это не шкаф или он не по осям модели');
  const left = uprights[0]!,
    right = uprights.reduce((a, b) => (b.box.max[0]! > a.box.max[0]! ? b : a)),
    d: Vec3 = [left.box.min[0]!, Math.min(left.box.min[1]!, right.box.min[1]!), floor],
    panels: FilePanel[] = raw.map((r) => ({ id: r.id, name: panelName(r.p) || r.id, material: r.p.material ? r.p.material.split('\r')[0]! : null, box: shift(r.box, d), axis: r.axis, kind: 'other', section: null }));
  const at = (r: (typeof raw)[number]) => panels[raw.indexOf(r)]!,
    width = right.box.max[0]! - left.box.min[0]!,
    carcassDepth = Math.max(at(left).box.max[1]!, at(right).box.max[1]!);

  // Sides, partitions and the sides of the next bodies: the tall panels across X, left to right; two side by side are
  // the joint of two bodies.
  const columns = uprights.filter((r) => r === left || r === right || (r.box.min[0]! > left.box.max[0]! - TOL && r.box.max[0]! < right.box.min[0]! + TOL)).map(at);
  const walls: { from: number; to: number; panels: FilePanel[] }[] = [];
  for (const p of columns) {
    const last = walls.at(-1);
    if (last && p.box.min[0]! <= last.to + TOL) {
      last.to = Math.max(last.to, p.box.max[0]!);
      last.panels.push(p);
    } else walls.push({ from: p.box.min[0]!, to: p.box.max[0]!, panels: [p] });
  }
  walls.forEach((w, k) => w.panels.forEach((p) => (p.kind = k === 0 || k === walls.length - 1 || w.panels.length > 1 ? 'side' : 'partition')));
  const joint = (w: (typeof walls)[number]) => w.panels.length > 1,
    bounds = walls.map((w, k) => (k === 0 ? 0 : k === walls.length - 1 ? width : joint(w) ? w.panels[0]!.box.max[0]! : (w.from + w.to) / 2));
  const sections: FileSection[] = [],
    clear: [number, number][] = [],
    joints: number[] = [];
  for (let k = 0; k + 1 < walls.length; k++) {
    sections.push({ fromMm: bounds[k]!, toMm: bounds[k + 1]!, facade: 'none', rows: [], shelves: [], drawers: { count: 0, external: false }, rods: 0 });
    clear.push([walls[k]!.to, walls[k + 1]!.from]);
    if (k > 0 && joint(walls[k]!)) joints.push(k);
  }
  const sectionAt = (x: number) => {
    const k = clear.findIndex(([a, b]) => x >= a - TOL && x <= b + TOL);
    return k >= 0 ? k : sections.findIndex((s) => x >= s.fromMm && x <= s.toMm);
  };
  const rest = panels.filter((p) => p.kind === 'other' && !columns.includes(p)),
    carcassHeight = Math.max(...columns.map((p) => p.box.max[2]!)) - Math.min(...columns.map((p) => p.box.min[2]!));

  // Doors, sliding leaves and backs: the tall panels across Y.
  const fronts = rest.filter((p) => p.axis === 1 && extent(p.box, 2) >= TALL * carcassHeight);
  for (const p of fronts) p.kind = centre(p.box, 1) > carcassDepth / 2 ? 'back' : 'door';
  // In the opening: doors of a sliding wardrobe on two or more tracks (planes across Y), or inset doors in one plane.
  const inside = fronts.filter((p) => p.kind === 'door' && p.box.min[1]! >= -TOL),
    sliding = inside.some((a) => inside.some((b) => Math.abs(a.box.min[1]! - b.box.min[1]!) > TOL));
  if (sliding) for (const p of inside) p.kind = 'leaf';
  // The track of each leaf, left to right (0 — the front one): the scheme of the doors and its mirror.
  const leafGroups = clusters(inside.filter((p) => p.kind === 'leaf'), 0),
    planes = [...new Set(leafGroups.map((g) => g[0]!.box.min[1]!))].sort((a, b) => a - b).filter((y, n, all) => n === 0 || y - all[n - 1]! > TOL),
    tracks = leafGroups.map((g) => planes.findIndex((y) => Math.abs(y - g[0]!.box.min[1]!) <= TOL)).join(''),
    scheme = SCHEMES.find(([pattern]) => pattern(leafGroups.length) === tracks) ?? null;

  // The bottom and the roof of each section: its lowest and its highest panel across Z; the rest are shelves.
  const flats = rest.filter((p) => p.axis === 2);
  const bottoms: number[] = [];
  sections.forEach((_, k) => {
    const [a, b] = clear[k]!,
      own = flats.filter((p) => common(p.box, { min: [a, 0, 0], max: [b, 0, 0] }, 0) > TOL && centre(p.box, 1) > 0).sort((x, y) => x.box.min[2]! - y.box.min[2]!);
    const low = own[0],
      high = own.at(-1);
    if (low && high && low !== high) {
      low.kind = 'bottom';
      high.kind = 'top';
    } else if (low) low.kind = low.box.min[2]! < carcassHeight / 2 ? 'bottom' : 'top';
    bottoms[k] = low && low.kind === 'bottom' ? low.box.max[2]! : 0;
  });
  const bottomFloor = Math.min(...flats.filter((p) => p.kind === 'bottom').map((p) => p.box.min[2]!), Infinity);

  // Below the bottom across Y: the plinth. Above it inside the carcass: fronts and backs of drawer boxes; the panels
  // of a section between the lowest and the highest box (sides, bottoms, spacers of the runners) are the drawers'.
  const lows = rest.filter((p) => p.axis === 1 && p.kind === 'other');
  for (const p of lows) if (p.box.max[2]! <= bottomFloor + TOL) p.kind = 'plinth';
  const boxes = clusters(lows.filter((p) => p.kind === 'other' && p.box.max[1]! > TOL), 0, 2);
  sections.forEach((s, k) => {
    const own = boxes.filter((g) => sectionAt(centre(g[0]!.box, 0)) === k);
    if (!own.length) return;
    const all = own.flat(),
      zone: Aabb = { min: [clear[k]![0], -Infinity, Math.min(...all.map((p) => p.box.min[2]!))], max: [clear[k]![1], Infinity, Math.max(...all.map((p) => p.box.max[2]!))] };
    // The box of the BAZIS kit of a concealed runner (MOD-DEC-514, FINDINGS 1862) has no front wall and its back stands
    // over the bottom: its sides reach below the back. A low panel across X of the section most of whose height is in
    // the zone is a side of a box; the zone takes it.
    for (const p of rest)
      if (p.kind === 'other' && p.axis === 0 && p.box.min[0]! >= zone.min[0]! - TOL && p.box.max[0]! <= zone.max[0]! + TOL && common(p.box, zone, 2) > extent(p.box, 2) / 2) {
        zone.min[2] = Math.min(zone.min[2]!, p.box.min[2]!);
        zone.max[2] = Math.max(zone.max[2]!, p.box.max[2]!);
      }
    s.drawers.count = own.length;
    for (const p of rest) if ((p.kind === 'other' && p.axis !== 1) || all.includes(p)) if (inBox(p.box, zone)) ((p.kind = 'drawer'), (p.section = k));
  });
  // Low fronts in front of the carcass: the front of a drawer when a box stands behind it (an external drawer), else
  // a door of a row; both are facades.
  const drawerFaces = new Set<FilePanel>();
  for (const p of lows.filter((x) => x.kind === 'other' && x.box.max[1]! <= TOL)) {
    p.kind = 'door';
    if (!boxes.some((g) => g.some((q) => common(q.box, p.box, 0) > extent(q.box, 0) / 2 && common(q.box, p.box, 2) > 0))) continue;
    drawerFaces.add(p);
    p.section = sectionAt(centre(p.box, 0));
    if (p.section >= 0) sections[p.section]!.drawers.external = true;
  }

  // Shelves: the other panels across Z of a section. The first one over the internal drawers covers them: the engine
  // puts its own with the drawers (MOD-DEC-193), so it is compared, not added.
  const drawerTop = sections.map((_, k) => Math.max(-Infinity, ...panels.filter((p) => p.kind === 'drawer' && p.section === k && p.box.min[1]! >= -TOL).map((p) => p.box.max[2]!)));
  for (const p of flats) {
    if (p.kind !== 'other') {
      if (p.kind !== 'drawer') p.section = sectionAt(centre(p.box, 0));
      continue;
    }
    const k = sectionAt(centre(p.box, 0));
    if (k < 0) continue;
    p.kind = 'shelf';
    p.section = k;
  }
  sections.forEach((s, k) => {
    const own = flats.filter((p) => p.kind === 'shelf' && p.section === k).sort((a, b) => a.box.min[2]! - b.box.min[2]!),
      cover = own.find((p) => p.box.min[2]! >= drawerTop[k]! - TOL);
    for (const p of own) if (p !== cover || drawerTop[k] === -Infinity) s.shelves.push(round3(centre(p.box, 2) - bottoms[k]!));
  });
  for (const s of sections) s.shelves.sort((a, b) => a - b);
  for (const p of rest) if (p.kind === 'other' && p.axis === 0) ((p.kind = 'upright'), (p.section = sectionAt(centre(p.box, 0))));

  // Doors of the sections: one or two side by side; rows of doors stay one door (the remarks show the rest). The fronts
  // of external drawers have their section already and are not doors of it.
  const doors = panels.filter((p) => p.kind === 'door' && !drawerFaces.has(p));
  for (const p of doors) p.section = sectionAt(Math.min(Math.max(centre(p.box, 0), 0), width));
  sections.forEach((s, k) => {
    const rows = clusters(doors.filter((p) => p.section === k), 2)
      .map((row) => ({ z: Math.min(...row.map((p) => p.box.min[2]!)), heightMm: round3(Math.max(...row.map((p) => extent(p.box, 2)))), leaves: (clusters(row, 0).length > 1 ? 2 : 1) as 1 | 2 }))
      .sort((a, b) => a.z - b.z);
    s.facade = !rows.length ? 'none' : rows[0]!.leaves === 2 ? 'two' : 'one';
    if (rows.length > 1) s.rows = rows.map(({ heightMm, leaves }) => ({ heightMm, leaves }));
  });
  const inset = !sliding && doors.length > 0 && doors.every((p) => p.box.min[1]! >= -TOL),
    // The overall depth is that of the carcass and the doors in front of it (FINDINGS 8); fronts of drawers stand out.
    depth = carcassDepth - Math.min(0, ...doors.map((p) => p.box.min[1]!));

  // Rods: hardware or a profile named «…штанга…» (the rod has no panel).
  for (const o of [...model.hardware, ...model.others]) {
    if (!(o.name ?? '').toLowerCase().includes(ROD)) continue;
    const k = sectionAt(o.pose.t[0] - d[0]);
    if (k >= 0) sections[k]!.rods++;
  }

  // The base: sides over the floor stand on legs; a raised bottom between sides on the floor is a plinth (the engine's
  // one, MOD-DEC-291), a bottom on the floor — no base.
  const sidesLow = Math.min(at(left).box.min[2]!, at(right).box.min[2]!),
    base: BazisWardrobe['base'] =
      sidesLow > TOL ? { kind: 'fixedLegs', heightMm: round3(sidesLow) } : bottomFloor > TOL && bottomFloor < Infinity ? { kind: 'plinth', heightMm: round3(bottomFloor) } : { kind: 'none', heightMm: 0 };
  const w: Omit<BazisWardrobe, Built> = {
    version: model.formatVersion ? `${model.formatVersion.major}.${model.formatVersion.minor}` : null,
    product: sliding ? 'sliding' : 'swing',
    size: { width: round3(width), height: round3(height), depth: round3(depth) },
    sections,
    joints,
    base,
    top: panels.some((p) => p.kind === 'top'),
    back: panels.some((p) => p.kind === 'back'),
    inset,
    leaves: leafGroups.length,
    scheme: scheme?.[1] ?? null,
    panels,
    skipped,
  };
  return { ...w, ...wardrobeOf(w, hw) };
}

/**
 * The tracks of the leaves of the sliding doors, left to right, by scheme (sliding-doors.ts tracksOf). Three tracks are
 * no scheme of the engine (MOD-DEC-580: the guides of ARISTO have two): such a file is read as «Чередование», said.
 */
const SCHEMES: [(n: number) => string, { scheme: 'ALT' | 'PAIR4'; mirror: boolean }][] = [
  [(n) => Array.from({ length: n }, (_, k) => k % 2).join(''), { scheme: 'ALT', mirror: false }],
  [(n) => Array.from({ length: n }, (_, k) => 1 - (k % 2)).join(''), { scheme: 'ALT', mirror: true }],
  [(n) => (n === 4 ? '0110' : ''), { scheme: 'PAIR4', mirror: false }],
  [(n) => (n === 4 ? '1001' : ''), { scheme: 'PAIR4', mirror: true }],
];

const inBox = (b: Aabb, zone: Aabb) => [0, 1, 2].every((k) => b.min[k]! >= zone.min[k]! - TOL && b.max[k]! <= zone.max[k]! + TOL);

/** Groups of panels with the same range along the axes (within the tolerance): one door, one leaf, one drawer box. */
function clusters(list: FilePanel[], ...axes: number[]): FilePanel[][] {
  const out: FilePanel[][] = [];
  for (const p of [...list].sort((a, b) => a.box.min[0]! - b.box.min[0]!)) {
    const g = out.find((q) => axes.every((k) => common(q[0]!.box, p.box, k) > Math.min(extent(q[0]!.box, k), extent(p.box, k)) / 2));
    if (g) g.push(p);
    else out.push([p]);
  }
  return out;
}

// ---------------------------------------------------------------- the wardrobe of the engine

type Built = 'input' | 'refused' | 'notices' | 'assumed';

/** The start project of the editor with the edits of what was read; an edit the editor refuses is said and skipped. */
function wardrobeOf(w: Omit<BazisWardrobe, Built>, hw: HardwareCatalogs): Pick<BazisWardrobe, Built> {
  let i = w.product === 'sliding' ? ed.newSlidingInput() : ed.newWardrobeInput();
  const refused: string[] = [],
    notices: string[] = [],
    assumed: string[] = [];
  const step = (what: string, r: ed.EditResult, quiet = false) => {
    if (r.ok) i = r.input;
    else refused.push(`${what}: ${r.problem}`);
    // A notice with a number says how a rule of the engine changed the edit; «Полка перенесена.» says nothing more.
    if (r.ok && r.notice && !quiet && /\d/.test(r.notice) && !notices.includes(r.notice)) notices.push(r.notice);
    return r.ok;
  };
  const S = w.sections;
  step(`Размер ${fmt(w.size.width)} × ${fmt(w.size.height)} × ${fmt(w.size.depth)} мм`, ed.setSize(i, w.size));
  step(`Секций ${S.length}`, ed.setSectionCount(i, S.length));
  const now = new Set(ed.bodyJoints(i)),
    want = new Set(w.joints);
  for (const j of [...new Set([...now, ...want])].sort((a, b) => a - b)) if (now.has(j) !== want.has(j)) step(`Стык корпусов перед секцией ${j + 1}`, ed.toggleBodyJoint(i, j));
  const starts = [0, ...ed.bodyJoints(i), S.length];
  for (let b = 0; b + 2 < starts.length; b++) step(`Ширина корпуса ${b + 1}`, ed.setBodyWidth(i, b, round3(S[starts[b + 1]! - 1]!.toMm - S[starts[b]!]!.fromMm)));
  for (let b = 0; b + 1 < starts.length; b++) for (let k = starts[b]!; k < starts[b + 1]! - 1; k++) step(`Ширина секции ${k + 1}`, ed.setSectionWidth(i, k, round3(S[k]!.toMm - S[k]!.fromMm)));
  if (w.product === 'swing' || w.base.kind !== 'none') step(`Основание ${w.base.kind === 'none' ? 'нет' : fmt(w.base.heightMm) + ' мм'}`, ed.setBase(i, w.base.kind, w.base.kind === 'none' ? undefined : w.base.heightMm));
  if (!w.top) step('Без крыши', ed.setPanel(i, 'top', false));
  if (!w.back) {
    // Without a back the engine stands the wardrobe only in a niche or between walls (MOD-DEC-168); the file has no room.
    if (!ed.wallsHoldBack(ed.roomSummary(i)) && step('Шкаф в нише', ed.setRoom(i, { niche: true }))) assumed.push('шкаф стоит в нише: без задней стенки движок ставит шкаф только в нишу или между стенами (MOD-DEC-168), а помещения в файле нет');
    step('Без задней стенки', ed.setPanel(i, 'back', false));
  }
  if (w.product === 'sliding') {
    if (w.leaves && !w.scheme) assumed.push('схема створок — чередование: дорожки створок в файле не совпали ни с одной схемой движка');
    if (w.leaves) step(`Створок ${w.leaves}`, ed.setSlidingDoors(i, hw, { n: w.leaves, ...(w.scheme ?? {}) }), true);
  } else {
    if (w.inset) step('Вкладные фасады', ed.setFacadeMounting(i, 'INSET'));
    S.forEach((s, k) => {
      step(`Фасад секции ${k + 1}`, ed.setFacade(i, k, s.facade));
      // Rows of doors: split as many times, then the heights from the bottom up (the top row takes the rest) and the doors.
      for (let n = 1; n < s.rows.length; n++) step(`Ряд фасадов ${n + 1} в секции ${k + 1}`, ed.splitFacadeRow(i, hw, k), true);
      const rows = ed.facadeRowsOf(i, hw, k);
      if (rows.length !== s.rows.length) return;
      s.rows.forEach((r, n) => {
        if (n < rows.length - 1) step(`Высота ряда фасадов ${n + 1} в секции ${k + 1}: ${fmt(r.heightMm)} мм`, ed.setFacadeRowHeight(i, hw, k, rows[n]!.id, r.heightMm), true);
        if (r.leaves !== rows[n]!.leaves) step(`Двери ряда ${n + 1} в секции ${k + 1}`, ed.setFacadeRow(i, hw, k, rows[n]!.id, { leaves: r.leaves }), true);
      });
    });
  }
  S.forEach((s, k) => {
    for (let n = 0; n < s.drawers.count; n++) step(`Ящик в секции ${k + 1}`, ed.addDrawer(i, hw, k, s.drawers.external ? 'external' : 'internal'));
    const before = ((i.state.sections[k]!.shelfUids ?? []) as string[]).slice();
    s.shelves.forEach(() => step(`Полка в секции ${k + 1}`, ed.addShelf(i, hw, k), true));
    // The shelves go to the heights of the file lowest first: each time the lowest shelf not placed yet (by its id).
    const placed = new Set<string>(before);
    for (const y of s.shelves) {
      const c = i.state.sections[k]!,
        ys = (c.shelfPositions ?? []) as number[],
        uids = (c.shelfUids ?? ys.map((_, n) => String(n))) as string[],
        next = ys.map((v, n) => ({ v, n })).filter(({ n }) => !placed.has(uids[n]!)).sort((a, b) => a.v - b.v)[0];
      if (!next) break;
      placed.add(uids[next.n]!);
      step(`Полка в секции ${k + 1} на ${fmt(y)} мм`, ed.moveShelf(i, hw, k, next.n, y));
    }
    for (let n = 0; n < s.rods; n++) step(`Штанга в секции ${k + 1}`, ed.addRod(i, hw, k));
  });
  if (w.product === 'sliding' && w.leaves) i = slidingSystem(i, w, hw, assumed);
  if (S.some((s) => s.drawers.count)) i = drawerRunner(i, w, hw);
  return { input: i, refused, notices, assumed };
}

const sizes = (list: { box: Aabb; axis: number }[]) => list.map((p) => dims(p.box, p.axis).map(fmt).join('×')).sort().join(' ');

/**
 * The runner of the drawers is not in the panels (it is hardware): a new project takes the runner of its level
 * (MOD-DEC-514), a saved one and the references keep DB4501 of the prototype. The one whose drawers the engine makes
 * of the sizes of the file; neither — that of a new project, and the drawers are said part by part.
 */
function drawerRunner(i: WardrobeInput, w: Omit<BazisWardrobe, Built>, hw: HardwareCatalogs): WardrobeInput {
  const file = sizes(w.panels.filter((p) => p.kind === 'drawer')),
    drawers = (x: WardrobeInput) => sizes(wardrobeGraph(x, hw).parts.filter((p) => partKind(p) === 'drawer').map((p) => ({ box: partBox(p), axis: axisOf(p.placement.nAxis) })));
  if (drawers(i) === file) return i;
  const own = ed.setDrawerRunner(i, null);
  return drawers(own) === file ? own : i;
}

/**
 * The system of the sliding doors is not in the panels (its profiles are hardware): the one whose infills the engine
 * makes of the sizes of the file, else the editor's default, said in the bell.
 */
function slidingSystem(i: WardrobeInput, w: Omit<BazisWardrobe, Built>, hw: HardwareCatalogs, assumed: string[]): WardrobeInput {
  const file = sizes(w.panels.filter((p) => p.kind === 'leaf'));
  for (const [system] of ed.SLIDING_SYSTEM_CHOICES) {
    const r = ed.setSlidingDoors(i, hw, { system });
    if (!r.ok) continue;
    const g = wardrobeGraph(r.input, hw);
    if (sizes(g.parts.filter((p) => partKind(p) === 'leaf').map((p) => ({ box: partBox(p), axis: axisOf(p.placement.nAxis) }))) === file) return r.input;
  }
  const own = ed.slidingSummary(i).system;
  assumed.push(`система дверей-купе — ${ed.SLIDING_SYSTEM_CHOICES.find(([id]) => id === own)?.[1] ?? own}: вставки створок файла не совпали ни с одной системой движка`);
  return i;
}

// ---------------------------------------------------------------- the check

interface Item {
  id: string;
  name: string;
  kind: PanelKind;
  box: Aabb;
  axis: number;
}

/**
 * The remarks of the check: what the editor refused, what was not compared, and every part the engine makes
 * differently from the file — missing, extra, of another size, thickness or place (up to 0,1 mm is the same, 191).
 * Parts of one kind with the same difference are one remark.
 */
export function bazisRemarks(w: BazisWardrobe, g: Graph): BazisRemark[] {
  const out: BazisRemark[] = [
    ...w.refused.map((text): BazisRemark => ({ code: 'NOT_BUILT', kind: null, text: `Движок не повторил: ${text}`, partIds: [], fileIds: [] })),
    ...w.notices.map((text): BazisRemark => ({ code: 'RULE', kind: null, text: `Правило движка: ${text}`, partIds: [], fileIds: [] })),
    ...w.assumed.map((text): BazisRemark => ({ code: 'ASSUMED', kind: null, text: `Принято по умолчанию: ${text}`, partIds: [], fileIds: [] })),
    ...w.skipped.map((text): BazisRemark => ({ code: 'SKIPPED', kind: null, text: `Не сверяется: ${text}`, partIds: [], fileIds: [] })),
  ];
  const file: Item[] = w.panels.map((p) => ({ id: p.id, name: p.name, kind: p.kind, box: p.box, axis: p.axis })),
    engine: Item[] = g.parts.filter((p) => p.supply !== 'PURCHASED').map((p) => ({ id: p.id, name: p.name.trim(), kind: partKind(p), box: partBox(p), axis: axisOf(p.placement.nAxis) }));
  // Pairs of one kind across the same axis, nearest centres first; boxes that share no two ranges are not a pair.
  const options: { f: Item; e: Item; d: number }[] = [];
  for (const f of file)
    for (const e of engine)
      if (e.kind === f.kind && e.axis === f.axis && [0, 1, 2].filter((k) => common(e.box, f.box, k) > 0).length >= 2)
        options.push({ f, e, d: Math.hypot(...[0, 1, 2].map((k) => centre(e.box, k) - centre(f.box, k))) });
  const pairs: [Item, Item][] = [],
    used = new Set<Item>();
  for (const o of options.sort((a, b) => a.d - b.d)) if (!used.has(o.f) && !used.has(o.e)) (used.add(o.f), used.add(o.e), pairs.push([o.f, o.e]));
  pairs.sort((a, b) => file.indexOf(a[0]) - file.indexOf(b[0]));
  const groups = new Map<string, { code: BazisRemark['code']; kind: PanelKind; say: (who: string) => string; name: string; partIds: string[]; fileIds: string[] }>();
  const add = (code: BazisRemark['code'], kind: PanelKind, key: string, say: (who: string) => string, f: Item | null, e: Item | null) => {
    const id = `${code}|${kind}|${key}`;
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { code, kind, say, name: (f ?? e)!.name, partIds: [], fileIds: [] }));
    if (e) g.partIds.push(e.id);
    if (f) g.fileIds.push(f.id);
  };
  for (const [f, e] of pairs) {
    const a = dims(f.box, f.axis),
      b = dims(e.box, e.axis),
      size = Math.abs(a[0] - b[0]) > TOL || Math.abs(a[1] - b[1]) > TOL;
    if (size || Math.abs(a[2] - b[2]) > TOL) {
      add(size ? 'SIZE' : 'THICKNESS', f.kind, `${dimsText(a)}|${dimsText(b)}`, (who) => `${who}: в файле ${dimsText(a)}, движок ${dimsText(b)}`, f, e);
      continue;
    }
    const words = [0, 1, 2]
      .map((k) => f.box.min[k]! - e.box.min[k]!)
      .map((x, k) => (Math.abs(x) > TOL ? `${x > 0 ? ['правее', 'дальше от фасада', 'выше'][k] : ['левее', 'ближе к фасаду', 'ниже'][k]} на ${fmt(Math.abs(x))} мм` : null))
      .filter(Boolean)
      .join(', ');
    if (words) add('POSITION', f.kind, words, (who) => `${who}: в файле ${words}, чем у движка`, f, e);
  }
  for (const f of file.filter((x) => !used.has(x))) add('EXTRA_IN_FILE', f.kind, dimsText(dims(f.box, f.axis)), (who) => `В файле есть, движок не строит: ${who}, ${dimsText(dims(f.box, f.axis))}`, f, null);
  for (const e of engine.filter((x) => !used.has(x))) add('MISSING_IN_FILE', e.kind, dimsText(dims(e.box, e.axis)), (who) => `Движок строит, в файле нет: ${who}, ${dimsText(dims(e.box, e.axis))}`, null, e);
  for (const g of groups.values()) {
    const n = Math.max(g.partIds.length, g.fileIds.length),
      [one, many] = PANEL_KIND_RU[g.kind];
    out.push({ code: g.code, kind: g.kind, text: g.say(n === 1 ? `${one} «${g.name}»` : `${many} (${n})`), partIds: g.partIds, fileIds: g.fileIds });
  }
  return out;
}
