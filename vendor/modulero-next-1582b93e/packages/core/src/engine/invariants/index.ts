// Registry of the invariant library: one entry per engine invariant (reference/engine/invariant-library.json,
// part "engine"). The 81 Handbook R7 invariants are mapped onto these, onto policy rule tests of tasks W/K/H,
// or kept as reports (part "handbook" of the same file); the test engine.invariants.test.ts keeps both in sync.
import type { Graph } from '../contract.js';
import * as c from './checks.js';
import type { Check, CheckContext, InvariantResult } from './checks.js';

export * from './checks.js';
export * from './geometry.js';

/**
 * Mode of an invariant, as in Handbook R7: check — a violation fails the test and the result; report_only — it is
 * reported, never a failing test or a production blocker; warning — a warning to the user; block_addition — the
 * edit that adds the element is refused (MOD-DEC-175). report_only and warning never block production (HB 69).
 */
export type InvariantMode = 'check' | 'report_only' | 'warning' | 'block_addition';

export interface InvariantEntry {
  id: string;
  group: 'G' | 'F' | 'H' | 'M' | 'S' | 'P' | 'V';
  mode: InvariantMode;
  check: Check;
}

/**
 * Report-only invariants and why. Only INV-G06: Handbook INV-B12-02 (MOD-DEC-199) is report_only. INV-G07, INV-G08
 * and the 18 Handbook [ПРАКТ] checks are mandatory `check` (owner decision 2026-10-21, Q9).
 */
export const REPORT_ONLY: Readonly<Record<string, string>> = {
  'INV-G06': 'Handbook INV-B12-02: подъём после сборки лёжа — report_only; без высоты потолка UNKNOWN (MOD-DEC-199)',
};

const entry = (id: string, check: Check): InvariantEntry => ({
  id,
  group: id.charAt(4) as InvariantEntry['group'],
  mode: id in REPORT_ONLY ? 'report_only' : 'check',
  check,
});

export const INVARIANTS: readonly InvariantEntry[] = [
  entry('INV-G01', c.G01), entry('INV-G02', c.G02), entry('INV-G03', c.G03), entry('INV-G04', c.G04),
  entry('INV-G05', c.G05), entry('INV-G06', c.G06), entry('INV-G07', c.G07), entry('INV-G08', c.G08),
  entry('INV-F01', c.F01), entry('INV-F02', c.F02), entry('INV-F03', c.F03), entry('INV-F04', c.F04),
  entry('INV-F05', c.F05), entry('INV-F06', c.F06),
  entry('INV-H01', c.H01), entry('INV-H02', c.H02), entry('INV-H03', c.H03), entry('INV-H04', c.H04),
  entry('INV-H05', c.H05), entry('INV-H06', c.H06), entry('INV-H07', c.H07), entry('INV-H08', c.H08),
  entry('INV-H09', c.H09),
  entry('INV-M01', c.M01), entry('INV-M02', c.M02), entry('INV-M03', c.M03), entry('INV-M04', c.M04),
  entry('INV-M05', c.M05), entry('INV-M06', c.M06),
  entry('INV-S01', c.S01), entry('INV-S02', c.S02), entry('INV-S03', c.S03), entry('INV-S04', c.S04),
  entry('INV-S05', c.S05), entry('INV-S06', c.S06),
  entry('INV-P01', c.P01), entry('INV-P02', c.P02), entry('INV-P03', c.P03), entry('INV-P04', c.P04),
  entry('INV-V01', c.V01), entry('INV-V02', c.V02), entry('INV-V03', c.V03), entry('INV-V04', c.V04),
  entry('INV-V05', c.V05), entry('INV-V06', c.V06),
];

/**
 * Known violations waiting for a fix in the graph of a generator, as `INV-…:CODE` → defect and task
 * (ENGINE_INVARIANTS.md: the list can only shrink). The common list is empty: a generator keeps its own list next to
 * it ("other furniture": HOME_KNOWN_VIOLATIONS in home/engine.ts, E2) and passes it to `unexpectedViolations`. The
 * defects the invariants catch in the prototypes are listed in reference/engine/invariant-library.json (`waitingFix`).
 */
export const KNOWN_VIOLATIONS: Readonly<Record<string, string>> = {};

/** Runs the whole library (or the given ids) on a graph. */
export function checkInvariants(g: Graph, ctx: CheckContext = {}, ids?: string[]): InvariantResult[] {
  return INVARIANTS.filter((e) => !ids || ids.includes(e.id)).map((e) => e.check(g, ctx));
}

const modeOf = (id: string) => INVARIANTS.find((e) => e.id === id)?.mode ?? 'check';

/** Violations of `check` and `block_addition` invariants that are not in the waiting list: these fail a test. */
export const unexpectedViolations = (results: InvariantResult[], known: Readonly<Record<string, unknown>> = KNOWN_VIOLATIONS) =>
  results
    .filter((r) => modeOf(r.id) === 'check' || modeOf(r.id) === 'block_addition')
    .flatMap((r) => r.violations.filter((x) => !(r.id + ':' + x.code in known)).map((x) => ({ id: r.id, ...x })));

/** Violations of report_only and warning invariants: shown to the user, never a blocker. */
export const reportedViolations = (results: InvariantResult[]) =>
  results.filter((r) => modeOf(r.id) === 'report_only' || modeOf(r.id) === 'warning').flatMap((r) => r.violations.map((x) => ({ id: r.id, ...x })));
