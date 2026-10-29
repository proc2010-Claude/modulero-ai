// npm run engine:setup — копия ядра modulero-next на закреплённом SHA (engine.json, AI-DEC-009) в .engine/<sha>/.
// Источник — локальный клон modulero-next (MODULERO_NEXT_REPO или ../modulero-next): git archive нужных папок,
// без npm ci и без сети, если коммит уже есть в клоне; 3D-вид собирается esbuild с three из devDependencies. Клон не меняется. В копию пишется MANIFEST (sha256 файлов),
// по нему npm run check убеждается, что копию никто не правил.
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PIN, ROOT, engineDir, manifest } from '../src/engine/pin.mjs';

const repo = resolve(process.env.MODULERO_NEXT_REPO || join(ROOT, '..', 'modulero-next'));
const git = (args, opts = {}) => spawnSync('git', ['-C', repo, ...args], { maxBuffer: 1 << 30, ...opts });

if (!existsSync(join(repo, '.git')) && git(['rev-parse', '--git-dir']).status !== 0) {
  console.error(`Нет клона modulero-next: ${repo}. Укажите MODULERO_NEXT_REPO.`);
  process.exit(1);
}
if (git(['cat-file', '-e', `${PIN.sha}^{commit}`]).status !== 0) {
  console.log(`В клоне нет ${PIN.sha}, беру его из origin (только чтение)…`);
  if (git(['fetch', '--quiet', 'origin', PIN.sha], { stdio: 'inherit' }).status !== 0) process.exit(1);
}
const archive = git(['archive', '--format=tar', PIN.sha, ...PIN.paths]);
if (archive.status !== 0) {
  console.error(String(archive.stderr));
  process.exit(1);
}
const dir = engineDir();
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const tar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
if (tar.status !== 0) {
  console.error(String(tar.stderr));
  process.exit(1);
}
// 3D-вид конструктора (apps/web/src/view3d) — отдельной сборкой, как его собирает modulero-next (scripts/build.mjs):
// IIFE с three той же версии; страница прототипа кладёт её в себя текстом.
await build({
  entryPoints: [join(dir, 'apps/web/src/view3d/index.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2022',
  outfile: join(dir, 'view3d.js'),
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [join(ROOT, 'node_modules')],
  logLevel: 'warning',
});
writeFileSync(join(dir, 'MANIFEST'), manifest(dir));
console.log(`Ядро ${PIN.repo}@${PIN.sha.slice(0, 8)} (${PIN.paths.join(', ')}) → ${relative(ROOT, dir) || dir}`);

