// npm run dialog -- … — стенд ИИ-диалога из треда (TASK_FIRST.md п. 1, CLAUDE.md «Режим диалога»).
//
//   new <сеанс>                 новый сеанс и сделать его текущим
//   use <сеанс>                 сделать сеанс текущим
//   human '<текст>'             реплика человека в ленту диалога
//   ai '<текст>'                реплика помощника в ленту диалога
//   <инструмент> '<JSON>'       вызов инструмента (tools.claude-api.json); JSON можно дать как - (stdin) или @файл
//   page                        перерисовать страницу прототипа текущего сеанса и напечатать путь к ней
//   export <файл> [название]    записать сеанс как сценарий для npm run check
//
// --session <сеанс> — вместо текущего. Папка сеансов — DIALOG_SESSIONS или sessions/ репозитория.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN_MODEL, type SessionCost } from '../stand/cost.ts';
import { loadCore } from '../stand/engine.ts';
import { exportScenario } from '../stand/scenario.ts';
import { Stand } from '../stand/stand.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const root = resolve(process.env.DIALOG_SESSIONS || join(repo, 'sessions'));
const args = process.argv.slice(2);
let session: string | null = null;
const k = args.indexOf('--session');
if (k >= 0) {
  session = args[k + 1] ?? null;
  args.splice(k, 2);
}
const [cmd, ...rest] = args;
const currentFile = join(root, '.current');

function fail(text: string): never {
  console.error(text);
  process.exit(1);
}

function readArg(a: string | undefined): string {
  if (a === undefined) fail('Нет аргумента.');
  if (a === '-') return readFileSync(0, 'utf8');
  if (a.startsWith('@')) return readFileSync(a.slice(1), 'utf8');
  return a;
}

if (!cmd) fail(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
mkdirSync(root, { recursive: true });

if (cmd === 'new' || cmd === 'use') {
  const name = rest[0] ?? fail('Нужно имя сеанса.');
  if (cmd === 'use' && !existsSync(join(root, name, 'session.json'))) fail(`Нет сеанса ${name} в ${root}.`);
  if (cmd === 'new' && existsSync(join(root, name, 'session.json'))) fail(`Сеанс ${name} уже есть: npm run dialog -- use ${name}`);
  const stand = new Stand(await loadCore(), root, name);
  writeFileSync(currentFile, name + '\n');
  console.log(JSON.stringify({ session: name, dir: stand.dir, page: join(stand.dir, 'prototype.html') }, null, 2));
  process.exit(0);
}

session ??= existsSync(currentFile) ? readFileSync(currentFile, 'utf8').trim() : null;
if (!session) fail('Нет текущего сеанса: npm run dialog -- new <сеанс>');
const stand = new Stand(await loadCore(), root, session);

switch (cmd) {
  case 'human':
  case 'ai':
    stand.say(cmd, readArg(rest.join(' ') || undefined));
    console.log(JSON.stringify({ session, page: join(stand.dir, 'prototype.html') }));
    if (cmd === 'ai') console.log(costLine(stand.cost()));
    break;
  case 'page':
    stand.renderPage();
    console.log(join(stand.dir, 'prototype.html'));
    break;
  case 'export': {
    const file = rest[0] ?? fail('Нужен файл сценария.');
    mkdirSync(dirname(resolve(file)), { recursive: true });
    writeFileSync(file, JSON.stringify(exportScenario(stand, rest.slice(1).join(' ') || session), null, 2) + '\n');
    console.log(file);
    break;
  }
  default: {
    let input: unknown;
    try {
      input = JSON.parse(readArg(rest[0] ?? '{}'));
    } catch (e) {
      fail(`JSON не читается: ${e instanceof Error ? e.message : e}`);
    }
    const out = stand.run(cmd, input);
    console.log(JSON.stringify(out, null, 2));
    if (out.is_error) process.exitCode = 2;
  }
}

/** Строка для треда после ответа помощника: расход хода и сеанса через Claude API (оценка). */
function costLine(c: SessionCost): string {
  const t = c.turns.at(-1);
  if (!t) return '';
  const tok = (u: { input: number; cache_write: number; cache_read: number; output: number }) => (u.input + u.cache_write + u.cache_read + u.output).toLocaleString('ru-RU');
  const usd = (v: number) => '$' + v.toFixed(3);
  return `Расход через Claude API (оценка, ${MAIN_MODEL}): ход ${t.turn} — ${t.requests} запр., ${tok(t)} ток. (кэш: запись ${t.cache_write.toLocaleString('ru-RU')}, чтение ${t.cache_read.toLocaleString('ru-RU')}; выход ${t.output.toLocaleString('ru-RU')}), ${usd(t.usd[MAIN_MODEL])}; за сеанс ${c.turns.length} ход., ${usd(c.total.usd[MAIN_MODEL])}.`;
}
