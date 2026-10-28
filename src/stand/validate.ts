// Проверка входа инструмента по его JSON-схеме из tools.claude-api.json (strict): то, что потом проверит
// Claude API, стенд проверяет сам, чтобы вызов из треда был тем же вызовом, что и через API.
import type { JsonSchema } from '../tools.ts';

const kind = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

/** Список нарушений; пустой — вход годен. */
export function validate(schema: JsonSchema, value: unknown, at = '$'): string[] {
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf as JsonSchema[];
    // Правка с op: сверяем с её вариантом, чтобы сообщение было о ней, а не о первом варианте списка.
    const op = (value as { op?: unknown } | null)?.op;
    const own = branches.find((s) => ((s.properties as Record<string, JsonSchema> | undefined)?.op as JsonSchema | undefined)?.const === op);
    if (op !== undefined && own) return validate(own, value, at);
    const all = branches.map((s) => validate(s, value, at));
    return all.some((p) => !p.length) ? [] : all[all.length - 1]!;
  }
  if ('const' in schema && value !== schema.const) return [`${at}: ожидается ${JSON.stringify(schema.const)}`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`${at}: одно из ${schema.enum.map((x) => JSON.stringify(x)).join(', ')}`];
  const t = schema.type as string | undefined,
    k = kind(value);
  if (t && !(t === k || (t === 'number' && k === 'integer'))) return [`${at}: ожидается ${t}, пришло ${k}`];
  const problems: string[] = [];
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) problems.push(`${at}: не меньше ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) problems.push(`${at}: не больше ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) problems.push(`${at}: не меньше ${schema.minItems} элементов`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) problems.push(`${at}: не больше ${schema.maxItems} элементов`);
    if (schema.items) value.forEach((v, i) => problems.push(...validate(schema.items as JsonSchema, v, `${at}[${i}]`)));
  }
  if (k === 'object') {
    const o = value as Record<string, unknown>,
      props = (schema.properties ?? {}) as Record<string, JsonSchema>;
    for (const r of (schema.required ?? []) as string[]) if (!(r in o)) problems.push(`${at}: нет поля ${r}`);
    for (const [key, v] of Object.entries(o)) {
      if (props[key]) problems.push(...validate(props[key], v, `${at}.${key}`));
      else if (schema.additionalProperties === false) problems.push(`${at}: лишнее поле ${key}`);
    }
  }
  return problems;
}
