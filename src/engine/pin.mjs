// Закреплённая основа движка (engine.json, AI-DEC-003) и папка её копии.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const PIN = JSON.parse(readFileSync(join(ROOT, 'engine.json'), 'utf8'));

/** Папка копии ядра на закреплённом SHA: MODULERO_ENGINE_DIR или engine.json dir (vendor/…). */
export function engineDir() {
  return process.env.MODULERO_ENGINE_DIR || join(ROOT, PIN.dir);
}

/** Список sha256 файлов копии ядра (формат sha256sum, пути через «/»), без самого MANIFEST. */
export function manifest(dir) {
  const walk = (d) => readdirSync(d).sort().flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  return (
    walk(dir)
      .filter((p) => relative(dir, p) !== 'MANIFEST')
      .map((p) => `${createHash('sha256').update(readFileSync(p)).digest('hex')}  ${relative(dir, p).split('\\').join('/')}`)
      .join('\n') + '\n'
  );
}
