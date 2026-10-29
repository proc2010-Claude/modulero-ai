// The access to a drawer behind the sliding doors (task W9, MOD-DEC-175): between the moving parts of the drawer and
// the open leaves there are at least 5 mm on each side — the width of the drawer is at most A − 10 mm, A the free
// width between the open leaves at a position the set of doors can actually reach. The prototype proved access only
// with a scene of qualified bodies, which a real wardrobe never had (BLOCKED_PHYSICAL_INPUTS, r1.html:63444), and did
// not install the drawer at all (pendingDrawer, r1.html:63664). Here the check is done on the nominal leaves of the
// calculation (FINDINGS 551):
// - each leaf slides on its track between the outermost closed positions of the set; the leaves of one track do not
//   pass each other, those of different tracks do — a reachable position puts the first j leaves of every track
//   against the left end of the travel and the rest against the right end;
// - the moving parts of the drawer are taken as the closed volume of its box and runners (the section between its
//   panels or spacers): the bodies of the runners, the front and the handle are not known (physicalAdapter), the
//   envelope of the runners holds them all — a conservative bound (Д);
// - a panel of the carcass is not a leaf: no clearance is asked from it.
// What the nominal check cannot prove — the stops, the installed travel, the bodies of the leaves and of a handle — is
// said with the result; it stays BLOCKED_PHYSICAL_INPUTS for production.
import { slideTravelMm } from '../engine/motion.js';
import { MIN_SECTION_NOMINAL_WIDTH } from '../engine/policy/front-grid.js';
import { wardrobeSliding } from '../engine/policy/wardrobe-sliding.js';
import type { Rec } from '../engine/policy/project-state.js';

const CLEARANCE = wardrobeSliding.constants.drawerLeafClearance;

/** The nominal leaves of the calculation in the opening: width, closed left edges and tracks, mm from the opening. */
export interface NominalLeaves {
  width: number;
  closed: number[];
  tracks: number[];
}

/** The moving parts of a drawer across the product, mm (world x), and the clear width of its section. */
export interface DrawerSpan {
  id: string;
  x0: number;
  x1: number;
  sectionClearWidthMm: number;
  /** The nominal width of the section (MOD-DEC-199): the refusal names it, the width the editor sets (MOD-AI-68). */
  sectionWidthMm?: number;
  /**
   * The sections on the floor behind the doors, left to right: their nominal widths and the place of the drawer's
   * section among them — a shift of the section is said as the widths of the sections (FINDINGS 2958).
   */
  sectionWidthsMm?: number[];
  sectionIndex?: number;
}

/** A reachable position of the doors: the left edges of the leaves (opening axis) and the free gap it leaves. */
interface Pose {
  positions: number[];
  /** The free gap between the leaves, opening axis; null — no leaf on that side, the gap reaches the panel. */
  lo: number | null;
  hi: number | null;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const fmt = (x: number) => String(round(x)).replace('.', ',');

/**
 * Every reachable position of the set with its leaves stacked to the ends of the travel (j leaves of each track to
 * the left, the rest to the right) and the gap it opens. The set is small (2–5 leaves on 2–3 tracks).
 */
function poses(leaves: NominalLeaves): Pose[] {
  const w = leaves.width,
    // The travel of the set — the same for the leaves the 3D moves (engine slideTravelMm, MOD-DEC-571).
    { minMm: left, maxMm } = slideTravelMm(leaves.closed),
    right = maxMm + w,
    tracks = [...new Set(leaves.tracks)].sort((a, b) => a - b),
    // The leaves of each track in their order along it (by the closed position).
    order = tracks.map((t) => leaves.tracks.map((x, i) => (x === t ? i : -1)).filter((i) => i >= 0).sort((a, b) => leaves.closed[a]! - leaves.closed[b]!));
  let out: Pose[] = [{ positions: [...leaves.closed], lo: null, hi: null }];
  for (const on of order) {
    const k = on.length,
      next: Pose[] = [];
    for (const p of out)
      for (let j = 0; j <= k; j++) {
        const positions = [...p.positions];
        on.forEach((leaf, i) => (positions[leaf] = i < j ? left + i * w : right - (k - i) * w));
        const lo = j ? left + j * w : null,
          hi = k - j ? right - (k - j) * w : null;
        next.push({ positions, lo: lo === null ? p.lo : p.lo === null ? lo : Math.max(p.lo, lo), hi: hi === null ? p.hi : p.hi === null ? hi : Math.min(p.hi, hi) });
      }
    out = next;
  }
  return out;
}

/**
 * The nominal access of a drawer behind the doors (MOD-DEC-175): CLEAR with the position of the doors that opens it
 * (the one that moves the leaves least from closed), or BLOCKED with a proposal — the clear width of the section the
 * widest reachable gap admits and the shift of the section that puts the drawer into it.
 */
export function drawerAccess(leaves: NominalLeaves, opening: { x0: number; W: number }, drawer: DrawerSpan): Rec {
  const c = CLEARANCE.value,
    a = drawer.x0 - opening.x0,
    b = drawer.x1 - opening.x0,
    width = b - a,
    all = poses(leaves),
    // The gap of a pose and the room it leaves the drawer: 5 mm off each leaf, none off a panel.
    room = (p: Pose) => {
      const lo = p.lo ?? Math.min(0, a),
        hi = p.hi ?? Math.max(opening.W, b),
        from = p.lo === null ? lo : lo + c,
        to = p.hi === null ? hi : hi - c;
      return { lo, hi, from, to, free: (p.hi ?? opening.W) - (p.lo ?? 0) };
    },
    moved = (p: Pose) => p.positions.reduce((n, x, i) => n + Math.abs(x - leaves.closed[i]!), 0),
    world = (x: number | null) => (x === null ? null : round(opening.x0 + x)),
    base = { decision: 'MOD-DEC-175', clearanceMm: c, movingMm: [round(drawer.x0), round(drawer.x1)], widthMm: round(width), basis: 'NOMINAL_LEAVES; runner envelope as the moving parts' };
  const clear = all.filter((p) => room(p).from <= a + 1e-9 && b <= room(p).to + 1e-9).sort((p, q) => moved(p) - moved(q));
  if (clear.length) {
    const p = clear[0]!,
      r = room(p);
    return { ...base, status: 'CLEAR', freeMm: [world(p.lo), world(p.hi)], freeWidthMm: round(r.free), leafPositionsMm: p.positions.map(world), proposal: null };
  }
  // No reachable position opens the drawer: the widest room, then the least shift into it.
  const best = all
    .map((p) => {
      const r = room(p),
        fit = Math.max(0, Math.min(width, r.to - r.from)),
        shift = a < r.from ? r.from - a : b - (width - fit) > r.to ? r.to - (b - (width - fit)) : 0;
      return { p, r, fit, shift };
    })
    .sort((x, y) => y.fit - x.fit || Math.abs(x.shift) - Math.abs(y.shift))[0]!;
  const narrow = round(width - best.fit),
    shift = round(best.shift),
    clearWidth = round(drawer.sectionClearWidthMm - narrow),
    sectionWidth = drawer.sectionWidthMm === undefined ? null : round(drawer.sectionWidthMm - narrow),
    asked = `ящику с направляющими нужно ${fmt(width)} мм и по ${fmt(c)} мм до створок с каждой стороны`,
    elsewhere = 'поставьте ящик в другую секцию или измените число створок',
    // FINDINGS 2958: a shift of a section between two others is the widths of the sections — its left edge moves by the
    // shift, its right one by the shift less the narrowing; a section narrower than it can be (MOD-DEC-565) — no shift,
    // the drawer goes elsewhere.
    ws = drawer.sectionWidthsMm,
    k = drawer.sectionIndex,
    widths = shift && ws && k !== undefined && k > 0 && k < ws.length - 1 ? ws.map((w, i) => round(i === k - 1 ? w + shift : i === k ? w - narrow : i === k + 1 ? w - shift + narrow : w)) : null,
    tooNarrow = widths?.findIndex((w) => w < MIN_SECTION_NOMINAL_WIDTH) ?? -1,
    act = !best.fit
      ? `ни одно положение створок не открывает здесь места под ящик — ${elsewhere}`
      : tooNarrow >= 0
        ? `сдвигать секцию на ${fmt(Math.abs(shift))} мм некуда: ширина секции ${tooNarrow + 1} стала бы меньше ${MIN_SECTION_NOMINAL_WIDTH} мм (MOD-DEC-565) — ${elsewhere}`
        : [narrow > 0 ? `сузьте секцию на ${fmt(narrow)} мм (${sectionWidth === null ? '' : `секция — не шире ${fmt(sectionWidth)} мм, `}в свету не больше ${fmt(clearWidth)} мм)` : '', shift ? `сдвиньте ${narrow > 0 ? 'её' : 'секцию'} на ${fmt(Math.abs(shift))} мм ${shift < 0 ? 'влево' : 'вправо'}${widths ? ` (ширины секций слева направо ${widths.map(fmt).join(', ')} мм)` : ''}` : '']
            .filter(Boolean)
            .join(' и '),
    // FINDINGS 2958: when the leaves open room enough but not where the drawer is, the width of that room is no reason —
    // the reason is where it is: the gaps that admit the drawer and the place of the drawer, mm from the left of the opening.
    gaps = [
      ...new Map(
        all
          .map(room)
          .filter((x) => x.to - x.from >= width - 1e-9)
          .map((x) => [`${round(x.from)}|${round(x.to)}`, x] as const),
      ).values(),
    ].sort((x, y) => x.from - y.from),
    where =
      best.fit === width && shift
        ? `створки открывают место под ящик только в ${gaps.map((x) => `${fmt(Math.max(0, x.from))}–${fmt(Math.min(opening.W, x.to))}`).join(' и ')} мм от левого края проёма; ящик стоит в ${fmt(a)}–${fmt(b)} мм, и при любом положении створок его часть закрыта створкой`
        : `створки открывают здесь не больше ${fmt(best.r.free)} мм`;
  return {
    ...base,
    status: 'BLOCKED',
    freeMm: [world(best.p.lo), world(best.p.hi)],
    freeWidthMm: round(best.r.free),
    leafPositionsMm: best.p.positions.map(world),
    proposal: {
      sectionClearWidthMm: clearWidth,
      ...(sectionWidth === null ? {} : { sectionWidthMm: sectionWidth }),
      narrowMm: narrow,
      shiftMm: shift,
      text: `${drawer.id}: раскрытые створки не открывают ящик — ${asked}, а ${where} (MOD-DEC-175); ${act}`,
    },
  };
}
