// Общий проход стенда к командам редактора конструктора (AI-DEC-007): список команд и схемы их параметров
// сняты с типов ядра modulero-next (scripts/commands.ts → contract/commands-<sha>.json). Стенд вызывает ту же
// функцию ядра, что и кнопка редактора: проверки и отказы — ядра, своих формул нет.
import { readFileSync } from 'node:fs';
import type { Core } from './engine.ts';
import type { EditResult } from './kitchen.ts';
import type { JsonSchema } from '../tools.ts';
import { validate } from './validate.ts';

export interface CommandArg {
  name: string;
  schema: JsonSchema;
  optional: boolean;
  /** Каталог выпуска (HardwareCatalogs): подставляет стенд. */
  catalog?: true;
}
export interface Command {
  command: string;
  doc: string;
  args: CommandArg[];
}
export interface CommandsFile {
  format: string;
  formatVersion: string;
  engine: { repo: string; sha: string };
  commands: Command[];
  skipped: { command: string; reason: string }[];
}

export const commandsPath = (sha: string) => new URL(`../../contract/commands-${sha.slice(0, 8)}.json`, import.meta.url);
export const loadCommands = (sha: string): CommandsFile => JSON.parse(readFileSync(commandsPath(sha), 'utf8'));

/** Изделие стенда → раздел команд ядра: распашной шкаф и купе — один редактор шкафа. */
export const commandProduct = (kind: string): string => (kind === 'sliding' ? 'wardrobe' : kind);

/** Схема аргументов команды для проверки args_json: объект по именам параметров, каталог не передаётся. */
export function argsSchema(c: Command): JsonSchema {
  const own = c.args.filter((a) => !a.catalog);
  return { type: 'object', properties: Object.fromEntries(own.map((a) => [a.name, a.schema])), required: own.filter((a) => !a.optional).map((a) => a.name), additionalProperties: false };
}

/**
 * Команды изделия для list_commands: имя, описание ядра, параметры (каталог стенд подставляет сам).
 * filter — слова через пробел, команда подходит, если хоть одно есть в имени или описании (без регистра).
 * detail: brief (по умолчанию) — начало описания и параметры строкой «имя?: тип», full — описание целиком и JSON-схема.
 */
export function commandList(
  file: CommandsFile,
  kind: string,
  opts: { filter: string | null; detail: 'brief' | 'full' | null } = { filter: null, detail: 'full' },
): { command: string; doc: string; args: JsonSchema | string }[] {
  const product = commandProduct(kind);
  const words = (opts.filter ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return file.commands
    .filter((c) => c.command.startsWith(product + '/'))
    .filter((c) => !words.length || words.some((w) => (c.command + ' ' + c.doc).toLowerCase().includes(w)))
    .map((c) => (opts.detail === 'full' ? { command: c.command, doc: c.doc, args: argsSchema(c) } : { command: c.command, doc: docLine(c.doc), args: argsLine(c) }));
}

/** Начало описания: до первого «: », «; » или «. », не длиннее ~120 знаков; остальное — detail full. */
export function docLine(doc: string): string {
  const cut = doc.search(/[:;.] /);
  const head = cut > 0 ? doc.slice(0, cut) : doc;
  if (head.length <= 120) return head === doc ? doc : head + ' …';
  return head.slice(0, head.lastIndexOf(' ', 120)) + ' …';
}

/** Параметры одной строкой: «section: number, execution?: internal|external»; без параметров — «». */
export function argsLine(c: Command): string {
  return c.args
    .filter((a) => !a.catalog)
    .map((a) => `${a.name}${a.optional ? '?' : ''}: ${typeLine(a.schema, 2)}`)
    .join(', ');
}

function typeLine(s: JsonSchema, depth: number): string {
  if (Array.isArray(s.anyOf)) return (s.anyOf as JsonSchema[]).map((x) => typeLine(x, depth)).join(' | ');
  if ('const' in s) return JSON.stringify(s.const);
  if (Array.isArray(s.enum)) return s.enum.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('|');
  if (s.type === 'array') return `${s.items ? typeLine(s.items as JsonSchema, depth) : 'unknown'}[]`;
  if (s.type === 'object' && s.properties) {
    if (depth <= 0) return 'object';
    const req = (s.required ?? []) as string[];
    return `{${Object.entries(s.properties as Record<string, JsonSchema>).map(([k, v]) => `${k}${req.includes(k) ? '' : '?'}: ${typeLine(v, depth - 1)}`).join(', ')}}`;
  }
  return String(s.type ?? 'unknown');
}

/** null у необязательного параметра или поля — «не задано», как в редакторе (undefined ядра). */
const dropNull = (v: unknown, schema: JsonSchema): unknown => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
  const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = (schema.required ?? []) as string[];
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => !(x === null && !required.includes(k) && !accepts(props[k], null))).map(([k, x]) => [k, props[k] ? dropNull(x, props[k]) : x]));
};
const accepts = (s: JsonSchema | undefined, v: unknown) => !!s && validate(s, v).length === 0;

/**
 * Одна команда редактора над проектом изделия. Отказ ядра — его словами; неверные аргументы — отказ с подсказкой,
 * проект не меняется. Для HOME редактор меняет копию проекта на месте и бросает ошибку с текстом отказа.
 */
export function runCommand(c: Core, file: CommandsFile, kind: string, project: unknown, command: string, argsJson: string): EditResult {
  const product = commandProduct(kind);
  const cmd = file.commands.find((x) => x.command === command);
  if (!cmd) {
    const skipped = file.skipped.find((x) => x.command === command);
    return { ok: false, problem: skipped ? `Команда ${command} стенду недоступна: ${skipped.reason}. Проект не изменён.` : `Нет команды ${command}; список — list_commands. Проект не изменён.` };
  }
  if (!command.startsWith(product + '/')) return { ok: false, problem: `Команда ${command} — не для этого изделия (${kind}); список — list_commands. Проект не изменён.` };
  let args: unknown;
  try {
    args = argsJson.trim() ? JSON.parse(argsJson) : {};
  } catch {
    return { ok: false, problem: `args_json команды ${command} — не JSON. Проект не изменён.` };
  }
  const schema = argsSchema(cmd);
  args = dropNull(args, schema);
  const problems = validate(schema, args);
  if (problems.length) return { ok: false, problem: `Параметры ${command} не по схеме: ${problems.slice(0, 5).join('; ')}. Проект не изменён.` };
  const named = args as Record<string, unknown>;
  const values = cmd.args.map((a) => (a.catalog ? c.HW : named[a.name]));
  // Хвост из undefined не передаётся: у функции ядра сработают значения по умолчанию.
  while (values.length && values.at(-1) === undefined) values.pop();
  const name = command.slice(product.length + 1);
  if (product === 'home') {
    const p = structuredClone(project) as Record<string, unknown>;
    try {
      c.H.createHomeEditor(c.HW, homeIds(p))[name](p, ...values);
      c.H.validate(p, c.HW);
    } catch (e) {
      return { ok: false, problem: `${e instanceof Error ? e.message : String(e)} Проект не изменён.` };
    }
    return { ok: true, project: p };
  }
  const fn = (product === 'kitchen' ? c.K : c.W)[name];
  if (typeof fn !== 'function') throw new Error(`В ядре нет функции ${command}`);
  const r = fn(project, ...values);
  if (!r.ok) return { ok: false, problem: r.problem ?? r.text ?? 'Отказ редактора.' };
  const next = product === 'kitchen' ? r.project : r.input;
  return { ok: true, project: next, ...(r.notice ? { notice: r.notice } : {}) };
}

/**
 * Id новых элементов HOME — по порядку от наибольшего в проекте (h1, h2, …), а не случайные, как в редакторе:
 * так проигрыш сценария даёт те же id и те же версии.
 */
export function homeIds(p: unknown): () => string {
  let n = Math.max(0, ...[...JSON.stringify(p ?? null).matchAll(/"h(\d+)/g)].map((m) => Number(m[1])));
  return () => `h${++n}`;
}
