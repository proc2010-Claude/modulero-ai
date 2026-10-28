// Ход одной командой (npm run dialog -- turn): реплика, вызовы с base_revision "head", ответ — только без отказа,
// live-файл и копия страницы.
import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCore } from '../src/stand/engine.ts';
import { Stand } from '../src/stand/stand.ts';
import { parseTurn, runTurn } from '../src/stand/turn.ts';

test('ход: вызовы по порядку, ответ пишется только без отказа', async () => {
  const core = await loadCore();
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-turn-'));
  try {
    const stand = new Stand(core, dir, 'w', () => new Date('2026-10-28T12:00:00Z'));
    const live = join(dir, 'out/live.json'),
      copy = join(dir, 'out/page');
    const a = runTurn(
      stand,
      parseTurn({
        human: 'хочу шкаф 2 м',
        calls: [
          { tool: 'start_project', input: { kind: 'wardrobe', template: 'start' } },
          { tool: 'wardrobe_edits', input: { project_id: 'w', base_revision: 'head', label: 'Шкаф 2 м', edits: [{ op: 'set_size', width: 2000, height: null, depth: null }] } },
        ],
        ai: 'Готово: шкаф 2 м.',
        live,
        copy,
      }),
    );
    assert.equal(a.ok, true);
    assert.equal(a.ai_written, true);
    assert.equal(a.calls.length, 2);
    assert.equal(a.revision, a.calls[1]!.revision);
    assert.equal(JSON.parse(readFileSync(live, 'utf8')).head.label, 'Шкаф 2 м');
    assert.ok(existsSync(join(copy, 'prototype.html')));

    // Отказ: ход останавливается, ответ не пишется, реплика человека остаётся.
    const b = runTurn(
      stand,
      parseTurn({
        human: 'поставь антресоль',
        calls: [{ tool: 'wardrobe_edits', input: { project_id: 'w', base_revision: 'head', label: 'x', edits: [{ op: 'set_facade', section: 9, facade: 'lift' }] } }],
        ai: 'не должно попасть в ленту',
        live: null,
        copy: null,
      }),
    );
    assert.equal(b.ok, false);
    assert.equal(b.stopped_at, 0);
    assert.equal(b.ai_written, false);
    assert.equal(b.revision, a.revision);
    assert.ok(b.last && b.last.refused);
    assert.deepEqual(
      stand.dialog().map((l) => l.who),
      ['human', 'ai', 'human'],
    );
    assert.throws(() => parseTurn({ human: null, calls: 'x', ai: null }), /calls/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
