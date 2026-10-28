// Шпаргалка входов инструментов для начала сеанса (npm run dialog -- ready): сигнатуры из схем стенда одной
// строкой на инструмент и на операцию правки, чтобы помощник не читал файлы схем целиком. Источник — те же
// схемы (loadStandTools), шпаргалка их только сокращает.
import { loadStandTools, type JsonSchema } from '../tools.ts';

const isObj = (v: unknown): v is JsonSchema => !!v && typeof v === 'object' && !Array.isArray(v);

/** Тип поля коротко: `int 200–2400`, `w|h|d`, `str|null`, `[…]`, `{…}`. */
export function typeOf(s: unknown): string {
  if (!isObj(s)) return '?';
  if (Array.isArray(s.anyOf)) return [...new Set(s.anyOf.map(typeOf))].join('|');
  if ('const' in s) return JSON.stringify(s.const);
  if (Array.isArray(s.enum)) return s.enum.map(String).join('|');
  const t = Array.isArray(s.type) ? s.type.join('|') : String(s.type);
  if (t === 'null') return 'null';
  if (t === 'integer' || t === 'number') {
    const n = t === 'integer' ? 'int' : 'num';
    const lo = s.minimum, hi = s.maximum;
    return lo !== undefined && hi !== undefined ? `${n} ${lo}–${hi}` : lo !== undefined ? `${n} ≥${lo}` : n;
  }
  if (t === 'string') return 'str';
  if (t === 'boolean') return 'bool';
  if (t === 'array') return `[${typeOf(s.items)}]`;
  if (t === 'object' && isObj(s.properties)) return fields(s);
  return t;
}

/** Поля объекта: `{a: T, b: T}`, поле op — опущено (оно в имени операции); notes — с описанием поля в скобках. */
function fields(s: JsonSchema, notes = false): string {
  const props = s.properties as Record<string, unknown>;
  const note = (v: unknown) => {
    const d = isObj(v) ? (v.description ?? (Array.isArray(v.anyOf) ? v.anyOf.map((x) => (isObj(x) ? x.description : '')).find(Boolean) : '')) : '';
    return notes && typeof d === 'string' && d && d.length < 160 ? ` (${d})` : '';
  };
  return '{' + Object.entries(props).filter(([k]) => k !== 'op').map(([k, v]) => `${k}: ${typeOf(v)}${note(v)}`).join(', ') + '}';
}

/** Первая фраза описания операции. */
function hint(s: JsonSchema): string {
  const d = typeof s.description === 'string' ? s.description : '';
  return d.split(/(?<=\.)\s/)[0]!.replace(/\.$/, '');
}

/** Шпаргалка: инструмент — поля; у *_edits — по строке на операцию `op {поля} — подсказка`. */
export function sheet(): string {
  const out: string[] = [];
  for (const t of loadStandTools().tools) {
    const props = (t.input_schema.properties ?? {}) as Record<string, JsonSchema>;
    const edits = props.edits;
    if (!edits || !isObj(edits.items) || !Array.isArray(edits.items.anyOf)) {
      out.push(`${t.name} ${fields(t.input_schema, true)}`);
      continue;
    }
    const { edits: _e, ...rest } = props;
    out.push(`${t.name} ${fields({ properties: rest })}, edits: [op…]`);
    for (const op of edits.items.anyOf as JsonSchema[]) {
      const name = (op.properties as Record<string, JsonSchema>).op?.const;
      out.push(`  ${name} ${fields(op)}${hint(op) ? ' — ' + hint(op) : ''}`);
    }
  }
  return out.join('\n');
}
