// Хуки загрузчика Node для ядра modulero-next (стенд, AI-DEC-009): исходники ядра на TypeScript
// импортируют друг друга как «.js» и пакеты @modulero/*, как в их tsconfig. Хук отдаёт вместо
// несуществующего «.js» соседний «.ts» и разрешает @modulero/* в папку движка. Код ядра не меняется.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let packages = {};

export function initialize(data) {
  const root = new URL(data.root.endsWith('/') ? data.root : data.root + '/');
  packages = {
    '@modulero/core': new URL('packages/core/src/index.ts', root).href,
    '@modulero/bazis': new URL('packages/bazis/src/index.ts', root).href,
    '@modulero/catalogs': new URL('catalogs/index.ts', root).href,
  };
}

export async function resolve(specifier, context, next) {
  if (packages[specifier]) return next(packages[specifier], context);
  if (specifier.endsWith('.js') && context.parentURL?.startsWith('file:') && /^(\.{1,2}\/|\/|file:)/.test(specifier)) {
    const url = new URL(specifier, context.parentURL);
    if (!existsSync(fileURLToPath(url))) {
      const ts = new URL(url.href.replace(/\.js$/, '.ts'));
      if (existsSync(fileURLToPath(ts))) return next(ts.href, context);
    }
  }
  return next(specifier, context);
}
