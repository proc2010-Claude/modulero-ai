import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { LIVE_FORMAT, liveState } from '../src/live/export.ts';
import { constructorHtml, renderLivePage, ROOT } from '../src/live/page.ts';
import { PIN } from '../src/engine/pin.mjs';

const examples = join(ROOT, 'reference/start/examples');

/** Сеанс в формате стенда (modulero-ai.session/1) из файлов примера: две версии и возврат к первой. */
function session(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'live-')), 'k-test');
  mkdirSync(join(dir, 'versions'), { recursive: true });
  writeFileSync(join(dir, 'versions/001.modulero'), readFileSync(join(examples, 'kitchen-step2.modulero')));
  writeFileSync(join(dir, 'versions/002.modulero'), readFileSync(join(examples, 'kitchen-step4.modulero')));
  writeFileSync(join(dir, 'versions/003.modulero'), readFileSync(join(examples, 'kitchen-step2.modulero')));
  const price = { status: 'partial', amount_rub: null, known_amount_rub: 1 };
  const v = (n: number, label: string) => ({ n, revision: `R${n}`, label, tool: 'kitchen_edits', file: `versions/00${n}.modulero`, at: '2026-10-28T00:00:00Z', price });
  writeFileSync(
    join(dir, 'session.json'),
    JSON.stringify({
      format: 'modulero-ai.session/1',
      name: 'k-test',
      created: '2026-10-28T00:00:00Z',
      engine: { repo: PIN.repo, sha: PIN.sha, hardwareCatalog: PIN.hardwareCatalog },
      kind: 'kitchen',
      head: 3,
      history: [v(1, 'Прямая кухня'), v(2, 'Угловая кухня'), v(3, 'Возврат к версии 1')],
      draft: null,
      seq: 7,
    }),
  );
  writeFileSync(
    join(dir, 'dialog.jsonl'),
    [
      { seq: 1, at: 't', who: 'human', text: 'Хочу кухню' },
      { seq: 3, at: 't', who: 'ai', text: 'Какая форма?' },
      { seq: 4, at: 't', who: 'choices', text: '', options: ['Прямая', 'Угловая'] },
    ]
      .map((l) => JSON.stringify(l))
      .join('\n') + '\n',
  );
  return dir;
}

test('live.json: текущая версия по head, файл проекта, лента', () => {
  const dir = session();
  const s = liveState(dir);
  assert.equal(s.format, LIVE_FORMAT);
  assert.equal(s.session, 'k-test');
  assert.equal(s.seq, 7);
  assert.equal(s.head?.n, 3);
  assert.equal(s.head?.label, 'Возврат к версии 1');
  assert.equal(s.project?.name, 'k-test-v003.modulero');
  assert.equal(s.project?.text, readFileSync(join(dir, 'versions/003.modulero'), 'utf8'));
  assert.deepEqual(s.history.map((h) => h.n), [1, 2, 3]);
  assert.deepEqual(s.dialog.map((l) => l.who), ['human', 'ai', 'choices']);
  assert.deepEqual(s.dialog[2].options, ['Прямая', 'Угловая']);
});

test('live.json: чужой формат сеанса не читается', () => {
  const dir = session();
  const f = join(dir, 'session.json');
  writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), format: 'other/1' }));
  assert.throws(() => liveState(dir), /формат other\/1/);
});

test('конструктор в vendor/ собран на SHA engine.json и совпадает с BUILD.json', () => {
  const { build, html } = constructorHtml();
  assert.equal(build.sha, PIN.sha);
  assert.equal(Buffer.byteLength(html), build.bytes);
});

test('страница: конструктор вставлен одной строкой и не закрывает тег script', () => {
  const template = readFileSync(join(ROOT, 'src/live/page.html'), 'utf8');
  const inner = '<html><script>let a = "</script>";</script> </html>';
  const page = renderLivePage(inner, template);
  assert.equal(page.split('</script>').length, template.split('</script>').length);
  const literal = page.match(/const CONSTRUCTOR = (".*");\n/)?.[1];
  assert.ok(literal);
  assert.equal(JSON.parse(literal), inner);
  assert.throws(() => renderLivePage('', template + '/*__CONSTRUCTOR__*/""'), /метка/);
});
