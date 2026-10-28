// Краткий ответ стенда для помощника (Д): после правки вместо полного state — изменения относительно версии до
// вызова. Полный state остаётся в calls.jsonl (сценарии, страница, live-файл) и по get_project. Числа в изменениях —
// те же значения из state ядра, стенд их только сравнивает.
import type { Output } from './stand.ts';

/** Инструменты, у которых помощнику уходит краткий ответ; start_project и get_project — полный state. */
export const BRIEF_TOOLS: readonly string[] = ['kitchen_edits', 'wardrobe_edits', 'home_edits', 'editor_call', 'undo', 'variants'];

export type Change = { path: string; was?: unknown; now?: unknown; added?: unknown; removed?: true };

/** Ключ элемента массива: id или key, если он есть у всех элементов и не повторяется; иначе — номер. */
function keyOf(list: unknown[]): string | null {
  for (const k of ['id', 'key']) {
    const keys = list.map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined));
    if (keys.every((v) => typeof v === 'string' || typeof v === 'number') && new Set(keys).size === keys.length) return k;
  }
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Изменения state: путь в нотации `sections[M01-S02].shelves` (элемент массива — по id/key, иначе по номеру). */
export function stateChanges(was: unknown, now: unknown, path = ''): Change[] {
  if (same(was, now)) return [];
  if (isObj(was) && isObj(now)) {
    const out: Change[] = [];
    for (const k of new Set([...Object.keys(was), ...Object.keys(now)])) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in now)) out.push({ path: p, removed: true });
      else if (!(k in was)) out.push({ path: p, added: now[k] });
      else out.push(...stateChanges(was[k], now[k], p));
    }
    return out;
  }
  if (Array.isArray(was) && Array.isArray(now) && was.some(isObj) && now.some(isObj)) {
    const k = keyOf(was);
    if (k && keyOf(now) === k) {
      const id = (x: unknown) => (x as Record<string, unknown>)[k];
      const a = new Map(was.map((x) => [id(x), x])),
        b = new Map(now.map((x) => [id(x), x]));
      const out: Change[] = [];
      for (const i of a.keys()) if (!b.has(i)) out.push({ path: `${path}[${i}]`, removed: true });
      for (const [i, x] of b) out.push(...(a.has(i) ? stateChanges(a.get(i), x, `${path}[${i}]`) : [{ path: `${path}[${i}]`, added: x }]));
      // Те же элементы в другом порядке: порядок важен (секции слева направо).
      if (!out.length) out.push({ path: `${path}.order`, was: was.map(id), now: now.map(id) });
      return out;
    }
    if (was.length === now.length) return was.flatMap((x, i) => stateChanges(x, now[i], `${path}[${i}]`));
  }
  return [{ path: path || '$', was, now }];
}

/**
 * Краткий ответ: без state и путей страницы, с изменениями относительно state до вызова. Ответ без state
 * (отказ без проекта, ошибка, список вариантов) возвращается как есть, без view.
 */
export function briefOutput(out: Output, before: unknown): Output {
  const { state, view: _view, ...rest } = out;
  if (state === undefined) return rest;
  return { ...rest, changes: before === undefined || before === null ? 'новый проект: полный state — get_project' : stateChanges(before, state) };
}
