// WardrobeProject: the project file of the swing wardrobe on the graph (`kind: "wardrobe"`), as K2 did for the kitchen.
//
// The file stores the input once (WardrobeInput, INV-S06) and what its last result was computed with: the versions of
// the graph (engine, generator, rule set, policies, catalogue build, release of the hardware catalogue — MOD-DEC-351,
// dimension rule, price snapshot), a short fingerprint of the result and its price. The fingerprint is never read as
// an input: on open the graph is built again and compared with it, so a project whose parts, hardware or problems
// would change opens only with the user's consent and a list of what changes (goal of the project, p. 7; FINDINGS
// 360–363). Old releases of the catalogue and old versions of the engine are not kept yet (FINDINGS 295): the only way
// to open such a project is by the current ones, with consent. A sliding wardrobe (W9) is stored the same way: its input
// says its domain (FINDINGS 367).
import type { CatalogRelease, HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Graph, Versions } from '../engine/contract.js';
import { wardrobeGraph } from '../engine/generators/wardrobe.js';
import { EngineInputError } from '../engine/graph.js';
import { canonicalJson, contentDigest } from '../project/digest.js';
import { checkWardrobeInput, normalizeWardrobeInput, type WardrobeInput } from './input.js';
import { rub, wardrobePrice, wardrobePriceSnapshot, type PriceStatus } from './price.js';

export const WARDROBE_PROJECT_SCHEMA = 'modulero.wardrobe-project/1';

/** Fingerprint of a result: not an input (FINDINGS 360); it only tells, on open, whether and what has changed. */
export interface ResultStamp {
  /** contentDigest of the graph without its versions: a new version alone is not a new result (they are compared apart). */
  digest: string;
  /** Each part: its name, finished size L × W × T, mm, and the digest of the part with its operations. */
  parts: Record<string, { name: string; size: string; digest: string }>;
  /** Hardware: catalogue id → quantity. */
  hardware: Record<string, number>;
  /** Problems of the graph: code → count. */
  issues: Record<string, number>;
}

/**
 * The price of the last result (W5): prices of a draft update by themselves, with a visible note «цены обновлены»
 * and the new total, never by consent (MOD-DEC-351); FINDINGS 366.
 */
export interface PriceStamp {
  /** Version of the price function (WardrobePrice.version). */
  version: string;
  /** Total, ₽; null — not every price is known. */
  amount: number | null;
  /** Sum of the known lines, ₽. */
  knownAmount: number;
  status: PriceStatus;
}

export interface ComputedWith {
  /** Versions of the graph, with the release of the hardware catalogue (versions.hardwareCatalog). */
  versions: Versions;
  result: ResultStamp;
  price: PriceStamp;
}

export interface WardrobeProject {
  schema: typeof WARDROBE_PROJECT_SCHEMA;
  input: WardrobeInput;
  computedWith: ComputedWith;
}

const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** Fingerprint of a graph. Pure. */
export function resultStamp(g: Graph): ResultStamp {
  const ops = new Map<string, unknown[]>();
  for (const o of g.operations) ops.set(o.partId, [...(ops.get(o.partId) ?? []), o]);
  const parts: ResultStamp['parts'] = {};
  for (const p of g.parts) {
    const s = p.finishedWithEdge;
    parts[p.id] = { name: p.name, size: `${fmt(s.lengthMm)} × ${fmt(s.widthMm)} × ${fmt(s.panelThicknessMm)}`, digest: contentDigest({ part: p, operations: ops.get(p.id) ?? [] }) };
  }
  const hardware: Record<string, number> = {};
  for (const m of g.mechanisms) hardware[m.profile.catalogId] = (hardware[m.profile.catalogId] ?? 0) + m.quantity;
  const issues: Record<string, number> = {};
  for (const u of g.unresolved) issues[u.code] = (issues[u.code] ?? 0) + 1;
  const { versions: _, ...result } = g;
  return { digest: contentDigest(result), parts, hardware, issues };
}

/** The price of a graph and its input, as the file stores it. Pure. */
export function priceStamp(input: WardrobeInput, g: Graph, hw: HardwareCatalogs): PriceStamp {
  const p = wardrobePrice(g, hw, wardrobePriceSnapshot(input, hw));
  return { version: p.version, amount: p.amount, knownAmount: p.knownAmount, status: p.status };
}

/** The project of an input: the input once and what its result is computed with now. Throws if the graph is not built. Pure. */
export function wardrobeProject(input: WardrobeInput, hw: HardwareCatalogs, graph: Graph = wardrobeGraph(input, hw)): WardrobeProject {
  const i = normalizeWardrobeInput(input);
  return { schema: WARDROBE_PROJECT_SCHEMA, input: i, computedWith: { versions: graph.versions, result: resultStamp(graph), price: priceStamp(i, graph, hw) } };
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const onlyKeys = (o: unknown, keys: string[]): o is Record<string, any> => isObject(o) && Object.keys(o).every((k) => keys.includes(k)) && keys.every((k) => k in o);

/**
 * What writeProjectFile('wardrobe', …) stores: a WardrobeProject (wardrobeProject) computed with the release the file
 * is written with. Throws for anything else. Pure.
 */
export function wardrobeProjectToSave(raw: unknown, release: CatalogRelease): WardrobeProject {
  if (!isObject(raw) || raw.schema !== WARDROBE_PROJECT_SCHEMA) throw new Error('Это не проект распашного шкафа: сохраняется результат wardrobeProject().');
  const p = readStored(raw);
  if (canonicalJson(p.computedWith.versions.hardwareCatalog) !== canonicalJson(release)) throw new Error('Проект шкафа посчитан по другому выпуску каталога фурнитуры, чем записывается в файл.');
  return p;
}

/** A stored project as it is, or the Russian reason it is not one. Checks the shape only; the graph is built by reopen. */
function readStored(raw: unknown): WardrobeProject {
  if (!onlyKeys(raw, ['schema', 'input', 'computedWith'])) throw new Error('Проект шкафа повреждён: неполная или лишняя запись.');
  if (raw.schema !== WARDROBE_PROJECT_SCHEMA) throw new Error('Проект шкафа сохранён более новой версией Modulero.');
  const problems = checkWardrobeInput(raw.input);
  if (problems.length) throw new Error('Проект шкафа повреждён: ' + problems.slice(0, 3).join('; ') + '.');
  const c = raw.computedWith;
  if (!onlyKeys(c, ['versions', 'result', 'price']) || !isObject(c.price) || !isObject(c.versions) || !isObject(c.result) || typeof c.result.digest !== 'string' || !isObject(c.result.parts) || !isObject(c.result.hardware) || !isObject(c.result.issues))
    throw new Error('Проект шкафа повреждён: нет записи о версиях расчёта.');
  return { schema: WARDROBE_PROJECT_SCHEMA, input: normalizeWardrobeInput(raw.input), computedWith: JSON.parse(JSON.stringify(c)) as ComputedWith };
}

const VERSION_TITLES: [keyof Versions, string][] = [
  ['engine', 'Контракт движка'],
  ['generator', 'Генератор шкафа'],
  ['ruleSet', 'Набор правил'],
  ['catalog', 'Сборка каталогов прототипа'],
  ['hardwareCatalog', 'Каталог фурнитуры'],
  ['dimensionRule', 'Правило размеров'],
  ['priceSnapshotId', 'Снимок цен'],
];
const show = (v: unknown) =>
  v === null || v === undefined ? 'нет' : isObject(v) && typeof v.version === 'string' ? `${v.version} (${String(v.sha256).slice(0, 8)})` : String(v);

/** What differs in the versions, the release of the hardware catalogue among them: lines for the user, empty when everything is the same. Pure. */
export function versionChanges(saved: ComputedWith, now: ComputedWith): string[] {
  const out: string[] = [];
  for (const [k, title] of VERSION_TITLES) if (canonicalJson(saved.versions[k]) !== canonicalJson(now.versions[k])) out.push(`${title}: ${show(saved.versions[k])} → ${show(now.versions[k])}`);
  const a = saved.versions.policies ?? {},
    b = now.versions.policies ?? {};
  for (const id of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) if (a[id] !== b[id]) out.push(`Политика «${id}»: ${show(a[id])} → ${show(b[id])}`);
  return out;
}

/** What differs in the result: parts, hardware and problems, for the user. Empty when the graphs are the same. Pure. */
export function resultChanges(saved: ResultStamp, now: ResultStamp): string[] {
  if (saved.digest === now.digest) return [];
  const out: string[] = [];
  const name = (p: { name: string }, id: string) => `«${p.name}» (${id})`;
  for (const [id, p] of Object.entries(saved.parts)) {
    const q = now.parts[id];
    if (!q) out.push(`Деталь ${name(p, id)} ${p.size} мм больше не строится`);
    else if (p.size !== q.size) out.push(`Деталь ${name(q, id)}: ${p.size} → ${q.size} мм`);
    else if (p.digest !== q.digest) out.push(`Деталь ${name(q, id)}: изменились присадка, кромка, материал или положение`);
  }
  for (const [id, q] of Object.entries(now.parts)) if (!saved.parts[id]) out.push(`Новая деталь ${name(q, id)} ${q.size} мм`);
  for (const id of [...new Set([...Object.keys(saved.hardware), ...Object.keys(now.hardware)])].sort())
    if (saved.hardware[id] !== now.hardware[id]) out.push(`Фурнитура ${id}: ${saved.hardware[id] ?? 0} → ${now.hardware[id] ?? 0} шт.`);
  for (const code of [...new Set([...Object.keys(saved.issues), ...Object.keys(now.issues)])].sort())
    if (saved.issues[code] !== now.issues[code]) out.push(`Замечание ${code}: ${saved.issues[code] ?? 0} → ${now.issues[code] ?? 0}`);
  if (!out.length) out.push('Изменились соединения, нагрузки или другие подробности расчёта; детали, фурнитура и замечания те же');
  return out;
}

/** What changed in the price: one line «Цены обновлены…» for the user, or none. Pure. */
export function priceChanges(saved: PriceStamp, now: PriceStamp, materialSelection: unknown): string[] {
  const total = (p: PriceStamp) => (p.amount !== null ? rub(p.amount, materialSelection) : `неполная, известно ${rub(p.knownAmount, materialSelection)}`);
  if (saved.amount === now.amount && saved.knownAmount === now.knownAmount && saved.status === now.status) return [];
  return [`Цены обновлены: итог ${total(saved)} → ${total(now)}`];
}

export interface ReopenedWardrobe {
  /** The project as stored. */
  saved: WardrobeProject;
  /** The project as it is computed now: its graph and stamp. */
  current: WardrobeProject;
  graph: Graph;
  /** The result differs from the stored one: open only with consent (MOD-DEC-351). */
  changed: boolean;
  /** Lines for the user: what the current version changes in the result and the price, then which versions differ. */
  changes: string[];
  /** The price of the draft updated by itself (MOD-DEC-351): a note, not a question. */
  prices: string[];
}

/** Builds a stored project again by the current versions and compares the result. Throws the Russian reason. Pure. */
export function reopenWardrobeProject(raw: unknown, hw: HardwareCatalogs): ReopenedWardrobe {
  const saved = readStored(raw);
  let graph: Graph;
  try {
    graph = wardrobeGraph(saved.input, hw);
  } catch (e) {
    if (e instanceof EngineInputError) throw new Error('Проект шкафа не строится текущей версией движка: ' + e.problems.join('; '));
    throw e;
  }
  const current = wardrobeProject(saved.input, hw, graph),
    result = resultChanges(saved.computedWith.result, current.computedWith.result),
    versions = versionChanges(saved.computedWith, current.computedWith);
  const prices = priceChanges(saved.computedWith.price, current.computedWith.price, saved.input.state.materialSelection ?? null);
  return { saved, current, graph, changed: result.length > 0, changes: result.length ? [...result, ...prices, ...versions] : versions, prices };
}
