// A policy constant always carries its source (MOD-DEC-054, ENGINE.md §4): an owner decision, a rule of the
// Engineering Standard v1.2 (canon by MOD-DEC-055), a catalogue, or — when there is no decision — the
// prototype's number with the FINDINGS item that records it. A number without a source is not written.
import type { Source } from '../contract.js';

export interface PolicyConstant<T> {
  readonly value: T;
  /** `mm`, `kg`, `ms`, `ratio`… */
  readonly unit: string;
  readonly source: Source;
  /** Short Russian note for the reader of the policy. */
  readonly note: string;
}

/** Freezes a constant so a generator or a check cannot change it. */
export const constant = <T>(value: T, unit: string, source: Source, note: string): PolicyConstant<T> =>
  Object.freeze({ value, unit, source: Object.freeze(source), note });

export const decision = (id: string): Source => ({ kind: 'DECISION', id });
export const standard = (ref: string): Source => ({ kind: 'STANDARD', ref });
export const prototype = (ref: string, finding: string): Source => ({ kind: 'PROTOTYPE', ref, finding });
export const unknownSource = (reason: string): Source => ({ kind: 'UNKNOWN', reason });

/** A module of the policy: name, version and its constants (MOD-DEC-054: one version per policy). */
export interface PolicyModule {
  readonly id: string;
  readonly version: string;
  readonly constants: Readonly<Record<string, PolicyConstant<unknown>>>;
}

/** Every constant of a module has a source of a known kind and, for a decision, a MOD-DEC number. */
export function policySourceProblems(module: PolicyModule): string[] {
  const out: string[] = [];
  for (const [name, c] of Object.entries(module.constants)) {
    const s = c.source;
    if (s.kind === 'DECISION' && !/^MOD-DEC-\d{3}$/.test(s.id)) out.push(`${module.id}.${name}: decision id ${s.id}`);
    if (s.kind === 'PROTOTYPE' && !s.finding) out.push(`${module.id}.${name}: prototype number without a FINDINGS item`);
    if (s.kind === 'STANDARD' && !s.ref) out.push(`${module.id}.${name}: standard rule without a reference`);
    if (s.kind === 'CATALOG' && !s.ref) out.push(`${module.id}.${name}: catalogue without a reference`);
    if (s.kind === 'UNKNOWN' && (c.value !== null || !s.reason)) out.push(`${module.id}.${name}: an unknown value must be null with a reason`);
    if (!c.note) out.push(`${module.id}.${name}: no note`);
  }
  return out;
}
