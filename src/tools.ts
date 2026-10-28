// Определения инструментов ИИ-диалога (EXCHANGE_SPEC.md §4) и проверка их схем
// на требования strict-режима: у каждого объекта перечислены все поля в required
// и запрещены лишние (additionalProperties: false).
import { readFileSync } from 'node:fs';

export interface ToolDefinition {
  name: string;
  description: string;
  strict: boolean;
  input_schema: JsonSchema;
}

export interface ToolsFile {
  format: string;
  formatVersion: string;
  basis: string;
  note: string;
  tools: ToolDefinition[];
}

export type JsonSchema = { [key: string]: unknown };

export const TOOLS_PATH = new URL('../reference/start/examples/tools.claude-api.json', import.meta.url);

export function loadTools(path: URL | string = TOOLS_PATH): ToolsFile {
  return JSON.parse(readFileSync(path, 'utf8')) as ToolsFile;
}

const isObject = (v: unknown): v is JsonSchema => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Нарушения strict-режима в схеме; пустой список — схема годится. */
export function strictSchemaProblems(schema: unknown, at = '$'): string[] {
  if (Array.isArray(schema)) return schema.flatMap((s, i) => strictSchemaProblems(s, `${at}[${i}]`));
  if (!isObject(schema)) return [];
  const problems: string[] = [];
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes('object') && isObject(schema.properties)) {
    const keys = Object.keys(schema.properties);
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    if (schema.additionalProperties !== false) problems.push(`${at}: нет additionalProperties: false`);
    for (const k of keys) if (!required.includes(k)) problems.push(`${at}: поле ${k} не в required`);
    for (const r of required) if (!keys.includes(r)) problems.push(`${at}: в required лишнее ${r}`);
  }
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'properties' && isObject(v)) {
      for (const [p, s] of Object.entries(v)) problems.push(...strictSchemaProblems(s, `${at}.${p}`));
    } else if (isObject(v) || Array.isArray(v)) {
      problems.push(...strictSchemaProblems(v, `${at}/${k}`));
    }
  }
  return problems;
}

/** Нарушения в файле инструментов целиком. */
export function toolsProblems(file: ToolsFile): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const t of file.tools) {
    if (!/^[a-z][a-z_]*$/.test(t.name)) problems.push(`${t.name}: имя не snake_case`);
    if (seen.has(t.name)) problems.push(`${t.name}: повтор имени`);
    seen.add(t.name);
    if (!t.description?.trim()) problems.push(`${t.name}: нет описания`);
    if (t.strict !== true) problems.push(`${t.name}: не strict`);
    if (!isObject(t.input_schema) || t.input_schema.type !== 'object') problems.push(`${t.name}: input_schema не объект`);
    problems.push(...strictSchemaProblems(t.input_schema, t.name));
  }
  return problems;
}
