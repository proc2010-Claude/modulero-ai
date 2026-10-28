// Команды редактора конструктора для стенда — из кода ядра modulero-next, а не вручную (AI-DEC-007):
// экспортированные функции правки кухни и шкафа и методы редактора HOME, их параметры и описания.
// Схемы параметров — из типов TypeScript ядра. Итог — contract/commands-<sha>.json; npm run check сверяет его.
//   node scripts/commands.ts            записать файл
//   node scripts/commands.ts --check    сверить файл с ядром
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { PIN, engineDir } from '../src/engine/pin.mjs';

type Schema = Record<string, unknown>;

/** Изделия: модуль ядра, тип проекта (первый параметр), тип результата правки. */
const PRODUCTS = [
  { product: 'kitchen', module: 'packages/core/src/kitchen/index.ts', project: 'KitchenProject', result: 'project' },
  { product: 'wardrobe', module: 'packages/core/src/wardrobe/editor.ts', project: 'WardrobeInput', result: 'input' },
  { product: 'home', module: 'packages/core/src/home/edit.ts', project: 'HomeProject', editor: 'createHomeEditor' },
] as const;

/**
 * Не для покупателя (MOD-DEC-497): ставки, валюта и раскрой мебельщика, создание проекта (это start_project).
 * Остальные правки редактора ядра — команды стенда.
 */
export const EXCLUDED: Record<string, string> = {
  'kitchen/setKitchenRates': 'ставки мебельщика',
  'kitchen/setKitchenCurrency': 'валюта ставок мебельщика',
  'kitchen/setKitchenCutting': 'параметры раскроя производства',
  'kitchen/kitchenExampleProject': 'пример кухни — start_project с template',
  'wardrobe/setCutting': 'параметры раскроя производства',
  'home/create': 'создание проекта — start_project',
};

export function generate(dir = engineDir()) {
  const files = PRODUCTS.map((p) => join(dir, p.module));
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, allowImportingTsExtensions: true, noEmit: true, strict: true, skipLibCheck: true, types: [] });
  const checker = program.getTypeChecker();
  const commands: any[] = [];
  const skipped: { command: string; reason: string }[] = [];
  for (const p of PRODUCTS) {
    const sf = program.getSourceFile(join(dir, p.module))!;
    const mod = checker.getSymbolAtLocation(sf)!;
    let members: { name: string; type: ts.Type; decl: ts.Node }[];
    if ('editor' in p) {
      const fn = checker.getExportsOfModule(mod).find((s) => s.name === p.editor)!;
      const sig = checker.getTypeOfSymbol(fn).getCallSignatures()[0]!;
      members = checker.getReturnTypeOfSignature(sig).getProperties().map((s) => ({ name: s.name, type: checker.getTypeOfSymbol(s), decl: s.valueDeclaration! }));
    } else {
      members = checker
        .getExportsOfModule(mod)
        .map((s) => (s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s))
        .filter((s) => s.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable) && s.valueDeclaration)
        .map((s) => ({ name: s.name, type: checker.getTypeOfSymbol(s), decl: s.valueDeclaration! }));
    }
    for (const m of members.sort((a, b) => a.name.localeCompare(b.name))) {
      const sig = m.type.getCallSignatures()[0];
      if (!sig) continue;
      const params = sig.getParameters();
      const first = params[0] && checker.typeToString(checker.getTypeOfSymbol(params[0]));
      if (first !== p.project) continue;
      const ret = checker.getReturnTypeOfSignature(sig);
      // Правка: кухня и шкаф возвращают новый проект (project или input рядом с ok), HOME меняет проект на месте.
      const isEdit = 'editor' in p || (ret.isUnion() ? ret.types : [ret]).some((t) => !!t.getProperty('ok') && !!t.getProperty(p.result));
      if (!isEdit) continue;
      const command = `${p.product}/${m.name}`;
      if (EXCLUDED[command]) {
        skipped.push({ command, reason: EXCLUDED[command]! });
        continue;
      }
      const args: { name: string; schema: Schema; optional: boolean; catalog?: true }[] = [];
      let bad: string | null = null;
      for (const prm of params.slice(1)) {
        const t = checker.getTypeOfSymbol(prm);
        const d = prm.valueDeclaration as ts.ParameterDeclaration | undefined;
        const optional = !!d && (!!d.questionToken || !!d.initializer || (t.isUnion() && t.types.some((x) => x.flags & ts.TypeFlags.Undefined)));
        if (checker.typeToString(checker.getNonNullableType(t)) === 'HardwareCatalogs') {
          args.push({ name: prm.name, schema: {}, optional: false, catalog: true });
          continue;
        }
        const s = schemaOf(checker, t, 0);
        if (!s) {
          bad = `параметр ${prm.name}: ${checker.typeToString(t)}`;
          break;
        }
        args.push({ name: prm.name, schema: s, optional });
      }
      if (bad) {
        skipped.push({ command, reason: `тип не переводится в схему (${bad})` });
        continue;
      }
      commands.push({ command, doc: docOf(m.decl), args });
    }
  }
  return { format: 'modulero.ai-commands', formatVersion: '0.2-draft', engine: { repo: PIN.repo, sha: PIN.sha }, commands, skipped };
}

/** Первая фраза JSDoc функции — описание команды; без JSDoc — пусто. */
function docOf(n: ts.Node): string {
  const tags = ts.getJSDocCommentsAndTags(n).filter(ts.isJSDoc);
  const text = tags.map((d) => (typeof d.comment === 'string' ? d.comment : (d.comment ?? []).map((c) => c.text).join(''))).join(' ');
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Схема JSON из типа TypeScript: числа, строки, литералы, null, массивы, объекты; иное — null. */
function schemaOf(c: ts.TypeChecker, t: ts.Type, depth: number): Schema | null {
  if (depth > 4) return null;
  if (t.isUnion()) {
    const parts = t.types.filter((x) => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
    const nullable = parts.some((x) => x.flags & ts.TypeFlags.Null);
    const rest = parts.filter((x) => !(x.flags & ts.TypeFlags.Null));
    // boolean — объединение true | false
    const lits: ts.Type[] = rest.filter((x) => x.isStringLiteral() || x.isNumberLiteral());
    const bools = rest.filter((x) => x.flags & ts.TypeFlags.BooleanLiteral);
    const other = rest.filter((x) => !lits.includes(x) && !bools.includes(x));
    const anyOf: Schema[] = [];
    if (bools.length) anyOf.push({ type: 'boolean' });
    // Строка с литералами ('CORPUS' | 'FACADE' | string) — просто строка.
    const plainString = other.some((x) => x.flags & ts.TypeFlags.String);
    const strLits = lits.filter((x) => x.isStringLiteral()).map((x) => (x as ts.StringLiteralType).value);
    const numLits = lits.filter((x) => x.isNumberLiteral()).map((x) => (x as ts.NumberLiteralType).value);
    if (strLits.length && !plainString) anyOf.push({ type: 'string', enum: strLits });
    if (numLits.length) anyOf.push({ type: 'integer', enum: numLits });
    for (const o of other) {
      const s = schemaOf(c, o, depth + 1);
      if (!s) return null;
      anyOf.push(s);
    }
    if (nullable) anyOf.push({ type: 'null' });
    return anyOf.length === 1 ? anyOf[0]! : { anyOf };
  }
  if (t.flags & ts.TypeFlags.Number) return { type: 'number' };
  if (t.flags & ts.TypeFlags.String) return { type: 'string' };
  if (t.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) return { type: 'boolean' };
  if (t.flags & ts.TypeFlags.Null) return { type: 'null' };
  if (t.isStringLiteral()) return { type: 'string', enum: [t.value] };
  if (t.isNumberLiteral()) return { type: 'integer', enum: [t.value] };
  if (c.isArrayType(t)) {
    const item = schemaOf(c, c.getTypeArguments(t as ts.TypeReference)[0]!, depth + 1);
    return item ? { type: 'array', items: item } : null;
  }
  if (t.flags & ts.TypeFlags.Object && !t.getCallSignatures().length && !c.getIndexInfosOfType(t).length) {
    const properties: Record<string, Schema> = {};
    const required: string[] = [];
    for (const p of t.getProperties()) {
      const pt = c.getTypeOfSymbol(p);
      let s = schemaOf(c, c.getNonNullableType(pt), depth + 1);
      if (!s) return null;
      // Как в типе ядра: необязательное поле можно не давать, null — только где тип его допускает.
      if (pt.isUnion() && pt.types.some((x) => x.flags & ts.TypeFlags.Null)) s = nullable(s);
      if (!(p.flags & ts.SymbolFlags.Optional)) required.push(p.name);
      properties[p.name] = s;
    }
    return { type: 'object', properties, required, additionalProperties: false };
  }
  return null;
}

const nullable = (s: Schema): Schema => (Array.isArray(s.anyOf) ? (s.anyOf.some((x: any) => x.type === 'null') ? s : { anyOf: [...s.anyOf, { type: 'null' }] }) : s.type === 'null' ? s : { anyOf: [s, { type: 'null' }] });

export const COMMANDS_PATH = new URL(`../contract/commands-${PIN.sha.slice(0, 8)}.json`, import.meta.url);

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = JSON.stringify(generate(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    const saved = readFileSync(COMMANDS_PATH, 'utf8');
    if (saved !== text) {
      console.error(`${COMMANDS_PATH.pathname}: не совпадает с ядром; запустите node scripts/commands.ts`);
      process.exit(1);
    }
  } else writeFileSync(COMMANDS_PATH, text);
}
