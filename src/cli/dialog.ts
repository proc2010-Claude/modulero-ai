// npm run dialog -- … — стенд ИИ-диалога из треда (TASK_FIRST.md п. 1, CLAUDE.md «Режим диалога»).
//
//   new <сеанс> [--out <папка>] новый сеанс и сделать его текущим; --out — папка файлов проекта для хода
//   use <сеанс> [--out <папка>] сделать сеанс текущим
//   ready <сеанс> [--out <папка>] начало «Режима диалога»: new или use и шпаргалка входов инструментов из схем
//                               (src/stand/sheet.ts) — схемы целиком читать не нужно
//   human '<текст>'             реплика человека в ленту диалога
//   ai '<текст>'                реплика помощника в ленту диалога
//   <инструмент> '<JSON>'       вызов инструмента (tools.claude-api.json); JSON можно дать как - (stdin) или @файл
//   turn '<JSON>'               ход одной командой: {human, calls: [{tool, input}], ai, live?, copy?} — см. src/stand/turn.ts;
//                               ответ пишется, только если все вызовы прошли; base_revision "head" — текущая версия;
//                               без live и copy — пути по --out сеанса; печатает reply (ответ со строкой расхода),
//                               notify («ход <сеанс>»), state после хода, last — краткий ответ вызова, на котором ход
//                               остановился (иначе последнего), calls[].answer — ответы остальных вызовов
//   page                        перерисовать страницу прототипа текущего сеанса и напечатать путь к ней
//   export <файл> [название]    записать сеанс как сценарий для npm run check
//
// Ответ правок (*_edits, editor_call, undo, variants) печатается кратко: вместо state — changes, изменения
// относительно версии до вызова (src/stand/brief.ts); полный state — get_project или флаг --full.
//
// --session <сеанс> — вместо текущего. Текущий сеанс (sessions/.current) общий для всех шеллов: если за последние
// 12 часов new/use/ready открыли больше одного сеанса, команды без --session не выполняются — параллельные диалоги
// не пишут в чужой сеанс. Папка вывода (--out) запоминается у каждого сеанса своя (sessions/<сеанс>/out).
// Код выхода: 0 — ход или вызов выполнен, в том числе со штатным отказом движка (ok: false, refused); 2 — ошибка
// вызова (вход не по схеме, сбой); 1 — команда не читается. Папка сеансов — DIALOG_SESSIONS или sessions/ репозитория.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { costLine } from '../stand/cost.ts';
import { loadCore } from '../stand/engine.ts';
import { exportScenario } from '../stand/scenario.ts';
import { sheet } from '../stand/sheet.ts';
import { Stand } from '../stand/stand.ts';
import { outPaths, parseTurn, runTurn } from '../stand/turn.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const root = resolve(process.env.DIALOG_SESSIONS || join(repo, 'sessions'));
const args = process.argv.slice(2);
let session: string | null = null;
const k = args.indexOf('--session');
if (k >= 0) {
  session = args[k + 1] ?? null;
  args.splice(k, 2);
}
const o = args.indexOf('--out');
let outArg: string | null = null;
if (o >= 0) {
  outArg = resolve(args[o + 1] ?? '');
  args.splice(o, 2);
}
const f = args.indexOf('--full');
const full = f >= 0;
if (full) args.splice(f, 1);
const [cmd, ...rest] = args;
const currentFile = join(root, '.current');
/** Журнал открытий сеансов (new/use/ready): «время имя» по строке. */
const openedFile = join(root, '.opened');
const OPEN_WINDOW_MS = 12 * 3600 * 1000;
/** Папка вывода сеанса; sessions/.out — общая, как до сеансовых (старые сеансы). */
const outOf = (name: string): string | null => {
  for (const f of [join(root, name, 'out'), join(root, '.out')]) if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  return null;
};

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

if (cmd === 'new' || cmd === 'use' || cmd === 'ready') {
  const name = rest[0] ?? fail('Нужно имя сеанса.');
  if (cmd === 'use' && !existsSync(join(root, name, 'session.json'))) fail(`Нет сеанса ${name} в ${root}.`);
  if (cmd === 'new' && existsSync(join(root, name, 'session.json'))) fail(`Сеанс ${name} уже есть: npm run dialog -- use ${name}`);
  const stand = new Stand(await loadCore(), root, name);
  writeFileSync(currentFile, name + '\n');
  appendFileSync(openedFile, `${new Date().toISOString()} ${name}\n`);
  if (outArg !== null) writeFileSync(join(stand.dir, 'out'), outArg + '\n');
  console.log(JSON.stringify({ session: name, page: join(stand.dir, 'prototype.html'), out: outOf(name), revision: stand.headRevision() }));
  if (cmd === 'ready') console.log(sheet());
  process.exit(0);
}

if (session === null) {
  const since = Date.now() - OPEN_WINDOW_MS;
  const open = existsSync(openedFile)
    ? new Set(readFileSync(openedFile, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ')).filter(([at]) => Date.parse(at!) >= since).map(([, n]) => n!))
    : new Set<string>();
  if (open.size > 1) fail(`Открыто несколько сеансов (${[...open].join(', ')}): укажите сеанс явно, --session <сеанс>.`);
  session = existsSync(currentFile) ? readFileSync(currentFile, 'utf8').trim() : null;
}
if (!session) fail('Нет текущего сеанса: npm run dialog -- new <сеанс>');
const stand = new Stand(await loadCore(), root, session);

switch (cmd) {
  case 'human':
  case 'ai':
    stand.say(cmd, readArg(rest.join(' ') || undefined));
    console.log(JSON.stringify({ session, page: join(stand.dir, 'prototype.html') }));
    if (cmd === 'ai') console.log(costLine(stand.cost()));
    break;
  case 'turn': {
    let turn;
    try {
      turn = parseTurn(JSON.parse(readArg(rest[0])), outPaths(outOf(session), session));
    } catch (e) {
      fail(`Ход не читается: ${e instanceof Error ? e.message : e}`);
    }
    const r = runTurn(stand, turn);
    const { last, last_full, ...brief } = r;
    // Одной строкой: ход читает модель, отступы только добавляют токенов.
    // state — один раз, на верхнем уровне; view (пути страницы) уже есть в page.
    const shown = full ? last_full : last && (({ state: _s, view: _v, ...x }) => x)(last);
    console.log(JSON.stringify({ ...brief, last: shown }));
    // Штатный отказ движка — ответ хода (ok: false), а не сбой команды.
    if (r.calls.some((c) => c.error !== null)) process.exitCode = 2;
    break;
  }
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
    const { full: out, brief } = stand.runBrief(cmd, input);
    console.log(JSON.stringify(full ? out : brief, null, 2));
    if (out.is_error) process.exitCode = 2;
  }
}
