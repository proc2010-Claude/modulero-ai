// The browser draft of a project and its variants (task U2 for the wardrobe, R1-001 and R1-003 of the pilot for the
// kitchen and other furniture). A variant is a whole input of the product with a name; the draft holds the variants and
// the one open in the editor. Every function is pure: it returns a new draft and leaves the given one as it was; the
// editor writes the text of the draft to the browser storage and reads it back. A product has its own schema and its
// own check of an input (`readDraft`), the rest is shared.
//
// The prototype r1 had no variants of a project: the select of its header was the mode «Основной / Продвинутый»
// (ckMode, r1.html:91031), and the draft was the state of the page («Сохранено в черновике», r1.html:91029). The
// variants and their rules are of this editor (FINDINGS 714, (Д)). A project file holds one product (MOD-DEC-530;
// INV-S06, 369): «Сохранить проект» writes the open variant.

/** The most variants a draft holds (Д): the draft lives in the browser storage, a few megabytes per site. */
export const MAX_VARIANTS = 10;
/** The longest name of a variant, characters (Д). */
export const MAX_VARIANT_NAME = 60;

export interface Variant<T> {
  id: string;
  name: string;
  input: T;
}

export interface Draft<T> {
  /** The schema of the product's drafts, e.g. `modulero.wardrobe-draft/1`. */
  schema: string;
  /** The id of the variant open in the editor. */
  active: string;
  variants: Variant<T>[];
  /** The number of the last variant made: the next id and the next name «Вариант N». */
  sequence: number;
}

export type DraftResult<T> = { ok: true; draft: Draft<T>; notice?: string } | { ok: false; problem: string };

/** A draft of one variant «Основной» with this input. */
export function newDraft<T>(schema: string, input: T): Draft<T> {
  return { schema, active: 'V1', variants: [{ id: 'V1', name: 'Основной', input: structuredClone(input) }], sequence: 1 };
}

/** The variant open in the editor. */
export function activeVariant<T>(d: Draft<T>): Variant<T> {
  return d.variants.find((v) => v.id === d.active) ?? d.variants[0]!;
}

/** The draft with the input of the open variant replaced: every edit of the editor. */
export function withInput<T>(d: Draft<T>, input: T): Draft<T> {
  return { ...d, variants: d.variants.map((v) => (v.id === d.active ? { ...v, input: structuredClone(input) } : v)) };
}

/** A new variant, a copy of the open one, named «Вариант N»; it becomes the open one. */
export function addVariant<T>(d: Draft<T>): DraftResult<T> {
  if (d.variants.length >= MAX_VARIANTS) return { ok: false, problem: `В проекте уже ${MAX_VARIANTS} вариантов — это предел. Удалите ненужный вариант.` };
  const sequence = d.sequence + 1,
    id = 'V' + sequence,
    name = uniqueName(d, 'Вариант ' + sequence);
  return { ok: true, draft: { ...d, active: id, sequence, variants: [...d.variants, { id, name, input: structuredClone(activeVariant(d).input) }] }, notice: `Создан «${name}» — копия «${activeVariant(d).name}».` };
}

/** Opens the variant `id` in the editor. */
export function selectVariant<T>(d: Draft<T>, id: string): DraftResult<T> {
  const v = d.variants.find((x) => x.id === id);
  if (!v) return { ok: false, problem: 'Такого варианта нет.' };
  return { ok: true, draft: { ...d, active: id } };
}

/** Renames the variant `id`: the name is trimmed, not empty, at most 60 characters, not the name of another variant. */
export function renameVariant<T>(d: Draft<T>, id: string, name: string): DraftResult<T> {
  const v = d.variants.find((x) => x.id === id),
    text = name.replace(/\s+/g, ' ').trim();
  if (!v) return { ok: false, problem: 'Такого варианта нет.' };
  if (!text) return { ok: false, problem: 'Введите название варианта.' };
  if (text.length > MAX_VARIANT_NAME) return { ok: false, problem: `Название варианта — не длиннее ${MAX_VARIANT_NAME} символов.` };
  if (d.variants.some((x) => x.id !== id && x.name.toLowerCase() === text.toLowerCase())) return { ok: false, problem: `Вариант «${text}» уже есть.` };
  return { ok: true, draft: { ...d, variants: d.variants.map((x) => (x.id === id ? { ...x, name: text } : x)) } };
}

/** Removes the variant `id`; the last variant is not removed. The open one removed, its neighbour opens. */
export function removeVariant<T>(d: Draft<T>, id: string): DraftResult<T> {
  const k = d.variants.findIndex((x) => x.id === id);
  if (k < 0) return { ok: false, problem: 'Такого варианта нет.' };
  if (d.variants.length === 1) return { ok: false, problem: 'В проекте остаётся хотя бы один вариант.' };
  const variants = d.variants.filter((x) => x.id !== id),
    active = d.active === id ? variants[Math.min(k, variants.length - 1)]!.id : d.active;
  return { ok: true, draft: { ...d, active, variants }, notice: `Вариант «${d.variants[k]!.name}» удалён.` };
}

/** The text of the draft for the browser storage. */
export function draftText<T>(d: Draft<T>): string {
  return JSON.stringify(d);
}

/**
 * The draft of a stored text, or null when the text is not a draft of this schema or a variant is not a valid input
 * of the product (`normalize` throws): a broken draft is not opened in part.
 */
export function readDraft<T>(text: string | null, schema: string, normalize: (input: unknown) => T): Draft<T> | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    if (raw?.schema !== schema || !Array.isArray(raw.variants) || !raw.variants.length || raw.variants.length > MAX_VARIANTS) return null;
    const variants: Variant<T>[] = raw.variants.map((v: { id: unknown; name: unknown; input: unknown }) => {
      if (typeof v?.id !== 'string' || typeof v.name !== 'string' || !v.name.trim()) throw new Error('variant');
      return { id: v.id, name: v.name.slice(0, MAX_VARIANT_NAME), input: normalize(v.input) };
    });
    if (new Set(variants.map((v) => v.id)).size !== variants.length) return null;
    const sequence = Number.isInteger(raw.sequence) && raw.sequence >= variants.length ? raw.sequence : Math.max(...variants.map((v) => Number(v.id.replace(/^V/, '')) || 0), variants.length);
    return { schema, active: variants.some((v) => v.id === raw.active) ? raw.active : variants[0]!.id, variants, sequence };
  } catch {
    return null;
  }
}

function uniqueName<T>(d: Draft<T>, name: string): string {
  let text = name,
    n = 2;
  while (d.variants.some((v) => v.name.toLowerCase() === text.toLowerCase())) text = `${name} (${n++})`;
  return text;
}
