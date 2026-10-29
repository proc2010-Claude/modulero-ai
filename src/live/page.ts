// Страница «диалог в конструкторе»: лента диалога сбоку и настоящий конструктор modulero-next
// (сборка на SHA из engine.json без изменений) в том же файле. Один офлайн-файл: открывается двойным щелчком.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIN } from '../engine/pin.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Сборка конструктора рядом с копией ядра: engine.json dir + «-web» (BUILD.json). */
export const CONSTRUCTOR_DIR = join(ROOT, `${PIN.dir}-web`);

export interface ConstructorBuild {
  repo: string;
  sha: string;
  file: string;
  bytes: number;
  sha256: string;
}

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** Сборка конструктора из vendor/, сверенная с BUILD.json: подменённый файл не попадёт на страницу. */
export function constructorHtml(dir = CONSTRUCTOR_DIR): { build: ConstructorBuild; html: string } {
  const build = JSON.parse(readFileSync(join(dir, 'BUILD.json'), 'utf8')) as ConstructorBuild;
  const bytes = readFileSync(join(dir, build.file));
  const actual = sha256(bytes);
  if (actual !== build.sha256) throw new Error(`${build.file}: sha256 ${actual}, в BUILD.json ${build.sha256}`);
  return { build, html: bytes.toString('utf8') };
}

const MARK = '/*__CONSTRUCTOR__*/""';

/** Страница: шаблон page.html с конструктором внутри (строка JS для iframe srcdoc). */
export function renderLivePage(constructor: string, template = readFileSync(join(ROOT, 'src/live/page.html'), 'utf8')): string {
  if (template.split(MARK).length !== 2) throw new Error('page.html: метка конструктора должна быть одна');
  const literal = JSON.stringify(constructor).replaceAll('</', '<\\/').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  return template.replace(MARK, () => literal);
}
