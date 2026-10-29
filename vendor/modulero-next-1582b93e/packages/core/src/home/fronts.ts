// The free parts of a niche for a new front and the shelf over a drawer (r5: MOD-DEC-744; MOD-AI-34, 71).
// Heights are those of fronts, mm from the floor of the body: a front stands between the bottom and the top of the body
// with the margin of H-10 and keeps the seam of the rule set from the fronts of its niche. A drawer — its box takes the
// height behind its front — stays between the shelves of the niche as well: under a shelf its front ends the rise of
// 744 below the top of the shelf, over a shelf it begins the margin above it, as the bedside table of the prototype. A
// door covers the shelves behind it. Numbers: engine/policy/home.ts.
import { HOME, homeRules } from '../engine/policy/home.js';
import { allFronts, foot, nicheLimits, topT } from './geometry.js';
import type { Body, Drawer, Front, HomeProject, Shelf } from './types.js';

export type FrontKind = 'drawer' | 'door';
/** What bounds a free part of a niche: the bottom or the top of the body, a shelf, a drawer or a door of the niche. */
export interface RoomEdge {
  kind: 'bottom' | 'top' | 'shelf' | FrontKind;
  id: string | null;
}
/** A free part of a niche: a front may stand from `from` to `to` (mm from the floor of the body). */
export interface RoomPart {
  from: number;
  to: number;
  below: RoomEdge;
  above: RoomEdge;
}

const sameNiche = (x: { lo: string; hi: string }, o: { lo: string; hi: string }) => x.lo === o.lo && x.hi === o.hi;
const isDrawer = (b: Body, f: Front) => (b.drawers as Front[]).includes(f);

/** The rise of the top of the shelf over a drawer above the upper edge of its front (744); the margin where there is no such rule. */
export const coverRise = (p: HomeProject): number => homeRules(p).drawerCoverRise ?? HOME.frontCarcassMargin;

/**
 * The free parts of the niche lo/hi of a body for a front of the kind, bottom to top. The parts and fronts listed in
 * `skip` are left out, as if they were not there.
 */
export function frontRoom(p: HomeProject, b: Body, niche: { lo: string; hi: string }, kind: FrontKind, skip: ReadonlySet<string> = new Set()): RoomPart[] {
  const t = p.thickness,
    m = HOME.frontCarcassMargin,
    seam = homeRules(p).stackSeam,
    rise = coverRise(p),
    // r5 (MOD-AI-75): the height of the niche — over or under a shelf a partition stands on.
    lim = b.partitions.some((q) => q.from !== undefined) ? nicheLimits(p, b, niche) : null,
    end = lim ? lim.frontHigh : b.h - topT(p) - m,
    blocks: { lo: number; hi: number; edge: RoomEdge }[] = [];
  for (const f of allFronts(b))
    if (sameNiche(f, niche) && !skip.has(f.id)) blocks.push({ lo: f.y - seam, hi: f.y + f.h + seam, edge: { kind: isDrawer(b, f) ? 'drawer' : 'door', id: f.id } });
  if (kind === 'drawer')
    for (const s of b.shelves) if (sameNiche(s, niche) && !skip.has(s.id)) blocks.push({ lo: s.y + t - rise, hi: s.y + t + m, edge: { kind: 'shelf', id: s.id } });
  blocks.sort((a, c) => a.lo - c.lo);
  const parts: RoomPart[] = [];
  let from = lim ? lim.frontLow : foot(p, b) + m,
    below: RoomEdge = lim?.lower ? { kind: 'shelf', id: lim.lower.id } : { kind: 'bottom', id: null };
  for (const k of blocks) {
    if (from >= end) break;
    if (k.lo > from + 0.1) parts.push({ from, to: Math.min(k.lo, end), below, above: k.lo < end ? k.edge : lim?.upper ? { kind: 'shelf', id: lim.upper.id } : { kind: 'top', id: null } });
    if (k.hi > from) {
      from = k.hi;
      below = k.edge;
    }
  }
  const roof: RoomEdge = lim?.upper ? { kind: 'shelf', id: lim.upper.id } : { kind: 'top', id: null };
  if (end > from + 0.1) parts.push({ from, to: end, below, above: roof });
  return parts;
}

/** The fixed shelf that closes a drawer from above (744), if it has one. */
export const coverShelfOf = (b: Body, drawerId: string): Shelf | undefined => b.shelves.find((s) => s.coverOf === drawerId);

/** The ids of the shelves over the drawers of a body. */
export const coverShelfIds = (b: Body): Set<string> => new Set(b.shelves.filter((s) => s.coverOf).map((s) => s.id));

/**
 * Puts the shelves over the drawers of a body back on their fronts (744): the top of a shelf the rise above the upper
 * edge of its drawer. A shelf whose drawer is gone stays where it is, a shelf of its own.
 */
export function followCovers(p: HomeProject, b: Body): void {
  const t = p.thickness,
    rise = coverRise(p);
  for (const s of b.shelves) {
    if (s.coverOf === undefined) continue;
    const d = b.drawers.find((x) => x.id === s.coverOf);
    if (d) s.y = d.y + d.h + rise - t;
    else delete s.coverOf;
  }
}

/**
 * Whether a drawer is closed from above in its niche, so that it needs no shelf of its own (744, Д): by a drawer over it
 * in the seam of the stack, or by the top of the body or a shelf nearer above the place of that shelf than the least
 * clearance over a shelf of the rule set (H-13: a narrower space is no space). `except` is a shelf left out.
 */
export function drawerClosedAbove(p: HomeProject, b: Body, f: Drawer, except?: Shelf): boolean {
  const t = p.thickness,
    top = f.y + f.h,
    rise = coverRise(p),
    tol = 1,
    ceiling = Math.min(b.h - topT(p), ...b.shelves.filter((s) => s !== except && sameNiche(s, f) && s.y + t > top + rise - t + tol).map((s) => s.y));
  return (
    ceiling - (top + rise) < (homeRules(p).shelfMinClearance ?? 0) + tol ||
    b.drawers.some((d) => d !== f && sameNiche(d, f) && d.y >= top - tol && d.y <= top + homeRules(p).stackSeam + tol)
  );
}

/** The drawer right under a new one in its niche — within the seam of the stack and the place of its shelf — with its shelf. */
export function drawerUnder(p: HomeProject, b: Body, f: Drawer): Drawer | undefined {
  const seam = homeRules(p).stackSeam,
    reach = coverRise(p) + HOME.frontCarcassMargin,
    tol = 1;
  return b.drawers.find((d) => d !== f && sameNiche(d, f) && f.y >= d.y + d.h + Math.min(seam, reach) - tol && f.y <= d.y + d.h + Math.max(seam, reach) + tol && !!coverShelfOf(b, d.id));
}

// ---------------------------------------------------------------- words of the refusals (r5)

const mmText = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
const kindWord = { drawer: 'ящика', door: 'дверцы' } as const;

/** «ящик 2 (72–252 мм)», «дверца 1 (74–480 мм)»: the number of the panel of the editor and the heights of the front. */
export function frontName(b: Body, f: Front): string {
  const drawer = isDrawer(b, f),
    n = (drawer ? (b.drawers as Front[]) : (b.doors as Front[])).indexOf(f) + 1;
  return `${drawer ? 'ящик' : 'дверца'} ${n} (${mmText(f.y)}–${mmText(f.y + f.h)} мм)`;
}

/**
 * The free parts of a niche in words, those a front of the smallest height fits: «Свободно в нише для ящика: 72–252 мм
 * от пола»; with none — what takes the niche, when the body is given.
 */
export function roomText(parts: readonly RoomPart[], kind: FrontKind, b?: Body, niche?: { lo: string; hi: string }): string {
  const fit = parts.filter((q) => q.to - q.from >= HOME.frontMinHeight - 0.1);
  if (fit.length) return `Свободно в нише для ${kindWord[kind]}: ${fit.map((q) => `${mmText(q.from)}–${mmText(q.to)}`).join(', ')} мм от пола (низ и верх фасада).`;
  const fronts = b && niche ? allFronts(b).filter((f) => sameNiche(f, niche)) : [];
  return `Свободной части высотой от ${HOME.frontMinHeight} мм для ${kindWord[kind]} в нише нет${fronts.length ? `: нишу занимают ${fronts.map((f) => frontName(b!, f)).join(', ')}` : ''}.`;
}

/** The words of a front outside its niche (r5): the limits of y and h and the free parts of the niche. */
export function frontOutsideText(p: HomeProject, b: Body, f: Front): string {
  const kind: FrontKind = isDrawer(b, f) ? 'drawer' : 'door',
    name = frontName(b, f),
    cover = coverShelfOf(b, f.id),
    // r5 (MOD-AI-75): the height of the niche — over or under a shelf a partition stands on.
    lim = nicheLimits(p, b, f);
  return (
    `${name[0]!.toUpperCase() + name.slice(1)} выходит за нишу: низ фасада y — от ${mmText(lim.frontLow)} мм от пола, ` +
    `верх y + h — до ${mmText(lim.frontHigh)} мм, высота h — от ${HOME.frontMinHeight} мм. ` +
    roomText(frontRoom(p, b, f, kind, new Set(cover ? [f.id, cover.id] : [f.id])), kind)
  );
}

/** The words of two fronts that overlap (r5): which ones, and where each of them may stand instead. */
export function frontsOverlapText(p: HomeProject, b: Body, a: Front, c: Front): string {
  const where = (f: Front) => {
    const kind: FrontKind = isDrawer(b, f) ? 'drawer' : 'door',
      cover = coverShelfOf(b, f.id),
      fit = frontRoom(p, b, f, kind, new Set(cover ? [f.id, cover.id] : [f.id])).filter((q) => q.to - q.from >= HOME.frontMinHeight - 0.1),
      name = frontName(b, f);
    return `${name.slice(0, name.indexOf(' ('))} — ${fit.length ? fit.map((q) => `${mmText(q.from)}–${mmText(q.to)}`).join(', ') + ' мм' : 'нет места'}`;
  };
  return `Фасады пересекаются: ${frontName(b, a)} и ${frontName(b, c)}. Сдвиньте или уменьшите фасад. Свободно в нише от пола (низ и верх фасада): ${where(a)}; ${where(c)}.`;
}

/** The parts and elements whose holes cross (r5): «левая боковина: полка 2 и ящик 1». */
export function drillingWhere(p: HomeProject, partId: string | undefined, holeIds: readonly string[]): string | null {
  const names: string[] = [];
  let board: string | null = null;
  for (const b of p.bodies) {
    if (partId?.startsWith(b.id + ':')) {
      const rest = partId.slice(b.id.length + 1),
        q = b.partitions.slice().sort((x, y) => x.x - y.x).findIndex((x) => rest === x.id || rest.startsWith(x.id + ':'));
      board =
        q >= 0
          ? `перегородка ${q + 1}`
          : ({ 'side-left': 'левая боковина', 'side-right': 'правая боковина', bottom: 'дно', top: 'крышка' } as Record<string, string>)[rest] ?? null;
      // A front: its own holes (MOD-AI-35) — the cups of two hinges of a low door meet.
      for (const [list, word] of [
        [b.doors, 'дверца'],
        [b.drawers, 'ящик'],
      ] as const) {
        const i = (list as readonly { id: string }[]).findIndex((x) => rest.startsWith(x.id + ':'));
        if (board === null && i >= 0) board = `${word} ${i + 1}` + (holeIds.some((h) => /:hinge-\d+:/.test(h)) ? ', петли' : '');
      }
    }
    const of = (list: readonly { id: string }[], word: string) =>
      list.forEach((x, i) => {
        const at = new RegExp(':' + x.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[:-]|$)');
        if (holeIds.some((h) => at.test(h)) && !at.test(partId ?? '')) names.push(`${word} ${i + 1}`);
      });
    of(b.shelves, 'полка');
    of(b.drawers, 'ящик');
    of(b.doors, 'дверца');
  }
  if (!names.length) return board;
  return (board ? board + ': ' : '') + names.join(' и ');
}
