// Быстрая проверка PR (RULES.md «Проверки»): без ИИ и без сети.
// Заканчивается строкой «All checks passed.» или кодом ошибки.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { PIN, engineDir, manifest } from '../src/engine/pin.mjs';

const root = new URL('..', import.meta.url).pathname;
const failures = [];

function step(name, fn) {
  const started = Date.now();
  let problems;
  try {
    problems = fn() ?? [];
  } catch (e) {
    problems = [String(e?.message ?? e)];
  }
  const ms = Date.now() - started;
  if (problems.length) {
    failures.push(name);
    console.log(`✗ ${name} (${ms} мс)`);
    for (const p of problems) console.log(`    ${p}`);
  } else {
    console.log(`✓ ${name} (${ms} мс)`);
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status === 0 ? [] : [`${cmd} ${args.join(' ')}: код ${r.status}`];
}

function walk(dir, skip = new Set(['.git', 'node_modules', 'sessions'])) {
  return readdirSync(dir).flatMap((name) => {
    if (skip.has(name)) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? [p, ...walk(p, skip)] : [p];
  });
}

step('Node 24', () => {
  const major = Number(process.versions.node.split('.')[0]);
  return major === 24 ? [] : [`нужен Node 24, сейчас ${process.version}`];
});

step('имена файлов латиницей', () =>
  walk(root)
    .map((p) => relative(root, p))
    .filter((p) => /[^\x20-\x7e]/.test(p))
    .map((p) => `не латиница: ${p}`));

step('без Claude API и ключей (режим владельца 2026-10-28)', () => {
  // Документы пакета описывают API на будущее, поэтому смотрим только код и зависимости.
  const forbidden = /api\.anthropic\.com|ANTHROPIC_API_KEY|@anthropic-ai\//;
  const code = walk(root).filter((p) => /^(src|scripts|tests)\//.test(relative(root, p)) && statSync(p).isFile());
  const hits = code.filter((p) => !p.endsWith('check.mjs') && forbidden.test(readFileSync(p, 'utf8')));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => forbidden.test(d + '/'));
  return [...hits.map((p) => `обращение к API: ${relative(root, p)}`), ...deps.map((d) => `зависимость: ${d}`)];
});

step(`копия ядра modulero-next ${PIN.sha.slice(0, 8)} не изменена (AI-DEC-003)`, () => {
  const text = manifest(engineDir());
  const sha = createHash('sha256').update(text).digest('hex');
  if (sha === PIN.manifestSha256) return [];
  const saved = readFileSync(join(engineDir(), 'MANIFEST'), 'utf8').split('\n');
  const diff = text.split('\n').filter((l) => l && !saved.includes(l)).slice(0, 10);
  return [`sha256 списка файлов ${sha}, ожидается ${PIN.manifestSha256} (engine.json)`, ...diff.map((l) => `изменён: ${l.slice(66)}`)];
});

step('типы (tsc)', () => run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']));
step('тесты (node --test)', () => run(process.execPath, ['--test', 'tests/**/*.test.ts']));

if (failures.length) {
  console.log(`\nПроверка не пройдена: ${failures.join(', ')}.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
