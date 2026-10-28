// Building a graph: explicit id generator, structural validation, FE-01 aggregation (ENGINE.md §2, task E1).
//
// A generator never invents ids from Math.random or the edit order: it receives an IdSource and builds ids from
// the assembly path and the role (FE-ID-001, WR-28). A graph is built only from a validated input (H-16):
// `generate` gets the input only after `validate` returned no problems, and `finishGraph` refuses a graph
// whose references or numbers are broken — an output function then cannot return NaN quietly (INV-V05).
import type {
  Allowance,
  Assembly,
  DimensionChain,
  EdgeBand,
  EdgeSlot,
  PlanarSize,
  CapabilityResolution,
  Graph,
  InstallationRequirement,
  Operation,
  Result,
  Unresolved,
} from './contract.js';

/** Creates a stable id inside a parent from a role; the same (parent, role) sequence gives the same ids. */
export type IdSource = (parentId: string | null, role: string) => string;

/**
 * Path ids as in the prototype: `M01`, `M01-S02`, `M01-S02-DIVIDER01`. The counter is per parent and role,
 * so ids depend only on the order of generation inside one parent, which a generator fixes by the input.
 */
export function pathIds(format: (role: string, n: number) => string = (role, n) => role + String(n).padStart(2, '0')): IdSource {
  const counters = new Map<string, number>();
  return (parentId, role) => {
    const key = (parentId ?? '') + '\u0000' + role,
      n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    const local = format(role, n);
    return parentId ? parentId + '-' + local : local;
  };
}

/** Thrown when an input or a graph is not valid; `problems` are plain Russian texts (INV-V01, V03). */
export class EngineInputError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
    this.name = 'EngineInputError';
  }
}

/** Builds a graph only from an input that passed its validation (H-16). */
export function fromValidatedInput<I>(input: I, validate: (input: I) => string[], generate: (input: I) => Graph): Graph {
  const problems = validate(input);
  if (problems.length) throw new EngineInputError(problems);
  return finishGraph(generate(input));
}

const finite = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x);

/** Structural problems of a graph: unique ids and existing references. Numbers are checked by INV-G01. */
export function structuralProblems(g: Graph): string[] {
  const out: string[] = [];
  const unique = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) out.push(`${kind}: пустой идентификатор`);
      else if (seen.has(id)) out.push(`${kind}: идентификатор ${id} повторяется`);
      seen.add(id);
    }
    return seen;
  };
  const assemblies = unique('Сборка', g.assemblies.map((a) => a.id)),
    parts = unique('Деталь', g.parts.map((p) => p.id)),
    ops = unique('Операция', g.operations.map((o) => o.id)),
    joints = unique('Соединение', g.joints.map((j) => j.id)),
    mechs = unique('Механизм', g.mechanisms.map((m) => m.id));
  unique('Нагрузка', g.loads.map((l) => l.id));
  for (const a of g.assemblies)
    if (a.parentId !== null && !assemblies.has(a.parentId)) out.push(`Сборка ${a.id}: нет родителя ${a.parentId}`);
  for (const p of g.parts) {
    if (!assemblies.has(p.assemblyId)) out.push(`Деталь ${p.id}: нет сборки ${p.assemblyId}`);
    for (const id of p.operationIds) if (!ops.has(id)) out.push(`Деталь ${p.id}: нет операции ${id}`);
  }
  for (const o of g.operations) {
    if (!parts.has(o.partId)) out.push(`Операция ${o.id}: нет детали ${o.partId}`);
    if ('jointId' in o.owner ? !joints.has(o.owner.jointId) : !mechs.has(o.owner.mechanismId))
      out.push(`Операция ${o.id}: нет владельца`);
  }
  for (const j of g.joints)
    for (const id of [j.parts.throughPartId, j.parts.receivingPartId]) if (!parts.has(id)) out.push(`Соединение ${j.id}: нет детали ${id}`);
  for (const m of g.mechanisms) for (const id of m.partIds) if (!parts.has(id)) out.push(`Механизм ${m.id}: нет детали ${id}`);
  for (const k of ['widthMm', 'heightMm', 'depthMm'] as const) if (!finite(g.envelope[k])) out.push(`Габарит ${k} не число`);
  return out;
}

/** Returns the graph if it is structurally sound; otherwise refuses it (H-16, INV-V05). */
export function finishGraph(g: Graph): Graph {
  const problems = structuralProblems(g);
  if (problems.length) throw new EngineInputError(problems);
  return g;
}

/** FE-01 aggregation (§24.2, MOD-DEC-047, 053). */
export function aggregateResult(
  unresolved: Unresolved[],
  capabilities: CapabilityResolution[],
  installationRequirements: InstallationRequirement[],
  adapterAvailable: boolean,
): Result {
  const errors = unresolved.filter((u) => u.level === 'ERROR'),
    warnings = unresolved.filter((u) => u.level === 'WARNING'),
    furnitureValidity: Result['furnitureValidity'] = errors.length ? 'INVALID' : warnings.length ? 'VALID_WITH_WARNINGS' : 'VALID',
    blockers = [
      ...(errors.length ? ['INVALID'] : []),
      ...unresolved.filter((u) => u.blocksProductionReadiness).map((u) => u.code),
    ],
    status: Result['productionReadiness']['status'] = blockers.length ? 'BLOCKED' : adapterAvailable ? 'READY' : 'ADAPTER_REQUIRED';
  return {
    furnitureValidity,
    capabilityResolution: capabilities,
    productionReadiness: { status, blockers: [...new Set(blockers)] },
    installationRequirements,
    exportQualification: status === 'READY' ? 'PRODUCTION' : 'NOT_FOR_PRODUCTION',
  };
}

/**
 * The dimension chain of a part (Handbook HB 172, 1466; owner decision 2026-10-20):
 * F = E − e₋ − e₊ by the effective build-up of the bands; M = F + m₋ + m₊; S = M + s₋ + s₊.
 * The length is bounded by edges C and D, the width by A and B. A null input makes the dependent states null.
 */
export function deriveDimensionChain(
  finished: { lengthMm: number; widthMm: number },
  edges: Record<EdgeSlot, Pick<EdgeBand, 'effectiveEdgeBandThicknessMm'>>,
  machiningAllowance: { length: Allowance; width: Allowance } | null,
  sawingAllowance: { length: Allowance; width: Allowance } | null,
): DimensionChain {
  const missing: string[] = [],
    e = (s: EdgeSlot) => edges[s].effectiveEdgeBandThicknessMm;
  for (const s of ['A', 'B', 'C', 'D'] as const) if (e(s) === null) missing.push(`эффективная толщина кромки ${s}`);
  if (!machiningAllowance) missing.push('припуск на обработку m');
  if (!sawingAllowance) missing.push('припуск на распил s');
  const finishedPart: PlanarSize | null = missing.some((m) => m.startsWith('эффективная'))
      ? null
      : { lengthMm: finished.lengthMm - e('C')! - e('D')!, widthMm: finished.widthMm - e('A')! - e('B')! },
    add = (x: PlanarSize | null, a: { length: Allowance; width: Allowance } | null): PlanarSize | null =>
      x && a ? { lengthMm: x.lengthMm + a.length.minusMm + a.length.plusMm, widthMm: x.widthMm + a.width.minusMm + a.width.plusMm } : null,
    machiningBlank = add(finishedPart, machiningAllowance),
    sawnBlank = add(machiningBlank, sawingAllowance),
    sources = [machiningAllowance?.length, machiningAllowance?.width, sawingAllowance?.length, sawingAllowance?.width].filter((a): a is Allowance => !!a);
  return {
    finishedPart,
    machiningAllowance,
    machiningBlank,
    sawingAllowance,
    sawnBlank,
    status: missing.length ? 'UNKNOWN' : sources.every((a) => a.source.kind === 'DECISION' || a.source.kind === 'CATALOG') ? 'VERIFIED' : 'UNVERIFIED',
    missing,
  };
}

/** The assembly chain from the product down to `id` (for ids and checks). */
export function assemblyPath(g: Pick<Graph, 'assemblies'>, id: string): Assembly[] {
  const byId = new Map(g.assemblies.map((a) => [a.id, a])),
    out: Assembly[] = [];
  for (let a = byId.get(id); a; a = a.parentId ? byId.get(a.parentId) : undefined) {
    out.unshift(a);
    if (out.length > g.assemblies.length) break;
  }
  return out;
}

export const operationsOf = (g: Pick<Graph, 'operations'>, partId: string): Operation[] =>
  g.operations.filter((o) => o.partId === partId);
