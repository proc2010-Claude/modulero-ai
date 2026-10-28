// npm run live -- <сеанс> [файл]  — live.json сеанса sessions/<сеанс>/ (по умолчанию sessions/<сеанс>/live.json);
//                                    вместо имени можно путь к папке сеанса
// npm run live -- page [файл]     — страница dist/modulero-live.html: конструктор и лента диалога
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { liveState } from './export.ts';
import { constructorHtml, renderLivePage, ROOT, sha256 } from './page.ts';

const [what, out] = process.argv.slice(2);

function write(file: string, text: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

if (!what) {
  console.error('Использование: npm run live -- <сеанс> [файл] | npm run live -- page [файл]');
  process.exit(2);
} else if (what === 'page') {
  const { build, html } = constructorHtml();
  const page = renderLivePage(html);
  const file = resolve(out ?? join(ROOT, 'dist/modulero-live.html'));
  write(file, page);
  console.log(JSON.stringify({ page: file, bytes: Buffer.byteLength(page), sha256: sha256(page), constructor: { repo: build.repo, sha: build.sha.slice(0, 8), sha256: build.sha256 } }));
} else {
  const dir = /[\\/]/.test(what) ? resolve(what) : join(ROOT, 'sessions', what);
  const state = liveState(dir);
  const file = resolve(out ?? join(dir, 'live.json'));
  write(file, JSON.stringify(state) + '\n');
  console.log(JSON.stringify({ live: file, session: state.session, seq: state.seq, head: state.head && { n: state.head.n, label: state.head.label }, lines: state.dialog.length }));
}
