import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sha256, verifyShaSums } from '../src/reference.ts';

const START = fileURLToPath(new URL('../reference/start', import.meta.url));

test('пакет старта в reference/start совпадает с SHA256SUMS', () => {
  const { checked, mismatches } = verifyShaSums(START);
  assert.equal(checked, 11);
  assert.deepEqual(mismatches, []);
});

test('sha256 проекта и журнала — как в README.md пакета', () => {
  // Значения из docs/start/README.md; картинки там не сверяются.
  const readme: Record<string, string> = {
    'examples/kitchen-dialog.log.json': '1ba0b9721a8aad3b7b0b3b8d74102786f452513691bd260ee4ca5c641b90486f',
    'examples/kitchen-step1.modulero': '129c89aac726e14e091905718b1fea6393a009fb4a17eb966fc489d9e730d975',
    'examples/kitchen-step2.modulero': 'fdde7dbcfbd13688e4d73beda6a2eff35f0e95892a5cbce8bfd49b3f912e34bc',
    'examples/kitchen-step3.modulero': 'f1ebc90a613eea2537f8af299079fec21e1ee0be87a1e66be185ea9755d2a8d0',
    'examples/kitchen-step4.modulero': '8bd69753b9a9d246b773d933fa1b933d1c7a82a986c5893fd1266ea7f7bd7038',
    'examples/tools.claude-api.json': 'a91e49831f8afac413a27f4cb3e0658582bb50318dadde107b49baf050b36017',
  };
  for (const [file, expected] of Object.entries(readme)) assert.equal(sha256(join(START, file)), expected, file);
});

test('сверка замечает изменённый и пропавший файл', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sha-'));
  writeFileSync(join(dir, 'a.txt'), 'a');
  writeFileSync(join(dir, 'SHA256SUMS'), `${'0'.repeat(64)}  a.txt\n${'1'.repeat(64)}  b.txt\n`);
  const { mismatches } = verifyShaSums(dir);
  assert.deepEqual(mismatches.map((m) => [m.file, m.actual === null]), [['a.txt', false], ['b.txt', true]]);
});
