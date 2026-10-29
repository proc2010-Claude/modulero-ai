// Opening doors and pulling out drawers in the view (task V2, MOD-DEC-131): `CabinetMotion` of r1
// (reference/sources/visual-r0.13.85/src/cabinet-motion.js) on the motions of the graph (engine.sceneMotions).
// Kept as in r1: one stroke takes 550 ms, at most 50 ms of it per frame, eased by smoothstep; a motion whose parts
// moved (another signature) starts closed again; opening a drawer first opens the doors in front of it, closing a
// door first closes the drawers behind it, and a drawer waits until its doors are fully open. The doors and drawers
// that belong together are found by the graph (fronts that overlap), not by the section number of r1.
// The leaves of a sliding wardrobe (MOD-DEC-184, 571) move along their tracks to the positions of the core
// (engine.slidePose, given by the shell: the 3D bundle has no core of its own): a button moves them by the same stroke,
// a drag on the scheme of the tracks at once; a drawer behind them opens only where no leaf covers it, and the leaves
// wait while it is out (r1 `swAccess`, `swMove`).
// A lift front opens and closes as a door (MOD-DEC-742), up about its top edge.
// The state lives only in the view: never in the project, the sizes or the price (MOD-DEC-131).
import type { engine } from '@modulero/core';

type SceneMotion = engine.SceneMotion;
type SlideMotion = engine.SlideMotion;

/** The rules of the leaves from the core (engine.slidePose, engine.slideClears). */
export interface SlideRules {
  pose: typeof engine.slidePose;
  clears: typeof engine.slideClears;
}

/** Milliseconds of one full stroke (r1). */
export const STROKE_MS = 550;

/** Smoothstep of r1: the eased share of the stroke. */
export const eased = (v: number) => v * v * (3 - 2 * v);

export class MotionState {
  items = new Map<string, SceneMotion>();
  byPart = new Map<string, SceneMotion>();
  /** Current share of the stroke, 0 closed … 1 open. */
  values = new Map<string, number>();
  /** Where each motion is going: 0 or 1. */
  targets = new Map<string, number>();
  tickTime = 0;
  /** A leaf of a sliding system: its left edge now, where its stroke started and where it goes (mm, product X). */
  slideAt = new Map<string, number>();
  slideFrom = new Map<string, number>();
  slideTo = new Map<string, number>();
  /** Share of the stroke of the leaves, 0 … 1; 1 — they are where they go. */
  slideStroke = 1;
  /** A leaf is dragged on the scheme of the tracks: the view keeps the basic light until it is let go. */
  slideHeld = false;
  /** Without the rules of the core the leaves stay closed. */
  rules: SlideRules | null = null;

  configure(motions: SceneMotion[]) {
    const next = new Map<string, SceneMotion>();
    for (const item of motions) {
      const old = this.items.get(item.key);
      next.set(item.key, item);
      if (!old || old.signature !== item.signature) {
        this.values.set(item.key, 0);
        this.targets.set(item.key, 0);
        if (item.kind === 'slide') for (const m of [this.slideAt, this.slideFrom, this.slideTo]) m.set(item.key, item.closedMm);
      }
    }
    for (const key of [...this.values.keys()])
      if (!next.has(key)) {
        this.values.delete(key);
        this.targets.delete(key);
        for (const m of [this.slideAt, this.slideFrom, this.slideTo]) m.delete(key);
      }
    // A leaf of a system whose other leaves changed starts closed too: the positions of a set go together. The leaves
    // are those of the new scene: by the old ones, five leaves made two kept the second where it closed among five
    // (R3-001 of the tester).
    this.items = next;
    for (const leaves of this.systems())
      if (leaves.some((l) => this.slideAt.get(l.key) === undefined) || !this.rules || this.rules.pose(leaves, leaves.map((x) => this.slideTo.get(x.key)!), leaves.map((x) => this.slideTo.get(x.key)!)) === null)
        for (const l of leaves) for (const m of [this.slideAt, this.slideFrom, this.slideTo]) m.set(l.key, l.closedMm);
    this.byPart = new Map([...next.values()].flatMap((i) => i.partIds.map((id) => [id, i] as const)));
  }

  /** The fronts «Открыть фасады» opens: the doors and the lift fronts (MOD-DEC-742). */
  doors(): (engine.DoorMotion | engine.LiftMotion)[] {
    return [...this.items.values()].filter((i): i is engine.DoorMotion | engine.LiftMotion => i.kind === 'door' || i.kind === 'lift');
  }

  /** The motion that moves a graph part, if any. */
  of(partId: string): SceneMotion | null {
    return this.byPart.get(partId) ?? null;
  }

  isOpen(key: string): boolean {
    return this.targets.get(key) === 1;
  }

  /** Opens or closes a door or a drawer; false — refused: a leaf of a sliding system covers the drawer (r1 `swAccess`). */
  set(key: string, open: boolean): boolean {
    const item = this.items.get(key);
    if (!item || item.kind === 'slide') return false;
    if (item.kind === 'drawer' && open && this.coveredBy(key)) return false;
    this.targets.set(key, open ? 1 : 0);
    if (item.kind === 'drawer' && open) for (const door of item.doorKeys) this.targets.set(door, 1);
    if (item.kind === 'door' && !open) for (const drawer of item.drawerKeys) this.targets.set(drawer, 0);
    this.tickTime = performance.now();
    return true;
  }

  toggle(key: string): boolean {
    return this.set(key, !this.isOpen(key));
  }

  // ---------------------------------------------------------------- the leaves of a sliding wardrobe

  /** The leaves of each sliding system, in the order of the leaves. */
  systems(): SlideMotion[][] {
    const by = new Map<string, SlideMotion[]>();
    for (const i of this.items.values()) if (i.kind === 'slide') by.set(i.mechanismId, [...(by.get(i.mechanismId) ?? []), i]);
    return [...by.values()].map((l) => l.sort((a, b) => a.leafIndex - b.leafIndex));
  }

  /** Left edges of the leaves of a system: where they are now, or where they go. */
  slidePositions(leaves: readonly SlideMotion[], target = false): number[] {
    return leaves.map((l) => (target ? this.slideTo : this.slideAt).get(l.key) ?? l.closedMm);
  }

  /** The leaf of a sliding system over a drawer at the positions the leaves go to; null — the drawer is free. */
  coveredBy(drawerKey: string): SlideMotion[] | null {
    for (const leaves of this.systems()) {
      const span = leaves[0]?.drawers.find((d) => d.key === drawerKey);
      if (span && (!this.rules || !this.rules.clears(leaves, this.slidePositions(leaves), span) || !this.rules.clears(leaves, this.slidePositions(leaves, true), span))) return leaves;
    }
    return null;
  }

  /** A drawer behind the leaves of a system that is out or coming out: the leaves do not move then (r1 `swMove`). */
  drawerOut(leaves: readonly SlideMotion[]): string | null {
    return leaves[0]?.drawers.find((d) => (this.values.get(d.key) || 0) > 0.001 || (this.targets.get(d.key) || 0) > 0)?.key ?? null;
  }

  /**
   * Moves the leaves of a system toward `wanted` left edges, by the rule of the core (engine.slidePose): by a stroke,
   * or at once (a drag). Returns the positions they go to, or null — refused (a drawer is out, no valid position).
   */
  moveLeaves(leaves: readonly SlideMotion[], wanted: readonly number[], atOnce = false): number[] | null {
    if (!leaves.length || !this.rules || this.drawerOut(leaves)) return null;
    const next = this.rules.pose(leaves, this.slidePositions(leaves, true), wanted);
    if (!next) return null;
    leaves.forEach((l, i) => {
      const at = this.slideAt.get(l.key) ?? l.closedMm;
      this.slideFrom.set(l.key, atOnce ? next[i]! : at);
      this.slideTo.set(l.key, next[i]!);
      if (atOnce) this.slideAt.set(l.key, next[i]!);
    });
    this.slideStroke = atOnce ? 1 : 0;
    this.tickTime = performance.now();
    return next;
  }

  /** «Открыть фасады / Закрыть фасады»: every door opens unless all are open already; returns whether they open. */
  all(): boolean {
    const doors = this.doors(),
      open = !doors.length || !doors.every((d) => this.isOpen(d.key));
    for (const d of doors) this.set(d.key, open);
    return open;
  }

  /** Moves every motion toward its target; true while something still moves. */
  step(time: number): boolean {
    const dt = Math.min(50, Math.max(0, time - (this.tickTime || time)));
    this.tickTime = time;
    let active = false;
    for (const [key, item] of this.items) {
      let target = this.targets.get(key) || 0;
      const old = this.values.get(key) || 0;
      if (item.kind === 'drawer' && target === 1 && item.doorKeys.some((d) => (this.values.get(d) || 0) < 0.999)) target = 0;
      if (item.kind === 'door' && target === 0 && item.drawerKeys.some((d) => (this.values.get(d) || 0) > 0.001)) target = 1;
      let value = target > old ? Math.min(target, old + dt / STROKE_MS) : Math.max(target, old - dt / STROKE_MS);
      if (Math.abs(value - target) < 0.00001) value = target;
      this.values.set(key, value);
      if (Math.abs(value - (this.targets.get(key) || 0)) > 0.00001) active = true;
    }
    // The leaves: one stroke of r1 from where they were to where they go, eased as a door.
    if (this.slideStroke < 1) {
      this.slideStroke = Math.min(1, this.slideStroke + dt / STROKE_MS);
      const e = eased(this.slideStroke);
      for (const [key, to] of this.slideTo) {
        const from = this.slideFrom.get(key) ?? to;
        this.slideAt.set(key, this.slideStroke === 1 ? to : from + (to - from) * e);
      }
      active = true;
    }
    return active || this.slideHeld;
  }

  snapshot() {
    return [...this.items.values()].map((i) =>
      i.kind === 'slide'
        ? { key: i.key, kind: i.kind, partIds: i.partIds, value: this.slideAt.get(i.key) ?? i.closedMm, target: this.slideTo.get(i.key) ?? i.closedMm }
        : { key: i.key, kind: i.kind, partIds: i.partIds, value: this.values.get(i.key) || 0, target: this.targets.get(i.key) || 0 },
    );
  }
}
