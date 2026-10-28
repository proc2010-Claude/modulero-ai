// Краткий ответ стенда помощнику: после правки — изменения state вместо полного state (src/stand/brief.ts).
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { briefOutput, stateChanges } from '../src/stand/brief.ts';
import { loadCore } from '../src/stand/engine.ts';
import { Stand } from '../src/stand/stand.ts';

test('изменения state: поля, элементы массивов по id, добавленные и убранные', () => {
  const was = { size: { width: 2000, height: 2400 }, sections: [{ id: 'S1', shelves: 0 }, { id: 'S2', shelves: 1 }], top: true };
  const now = { size: { width: 2400, height: 2400 }, sections: [{ id: 'S1', shelves: 3 }, { id: 'S3', shelves: 0 }], back: false };
  assert.deepEqual(stateChanges(was, now), [
    { path: 'size.width', was: 2000, now: 2400 },
    { path: 'sections[S2]', removed: true },
    { path: 'sections[S1].shelves', was: 0, now: 3 },
    { path: 'sections[S3]', added: { id: 'S3', shelves: 0 } },
    { path: 'top', removed: true },
    { path: 'back', added: false },
  ]);
  assert.deepEqual(stateChanges(was, was), []);
  assert.deepEqual(stateChanges({ a: [{ id: 1 }, { id: 2 }] }, { a: [{ id: 2 }, { id: 1 }] }), [{ path: 'a.order', was: [1, 2], now: [2, 1] }]);
  assert.deepEqual(stateChanges({ l: [1, 2] }, { l: [1, 2, 3] }), [{ path: 'l', was: [1, 2], now: [1, 2, 3] }]);
  // Ответ без state (ошибка) — как есть, без путей страницы.
  assert.deepEqual(briefOutput({ error: 'x', is_error: true }, {}), { error: 'x', is_error: true });
});

test('стенд: краткий ответ правки — без state, с изменениями; полный — в журнале и get_project', async () => {
  const core = await loadCore();
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-brief-'));
  try {
    const stand = new Stand(core, dir, 'b', () => new Date('2026-10-28T12:00:00Z'));
    const start = stand.runBrief('start_project', { kind: 'wardrobe', template: 'start' });
    assert.ok(start.brief.state, 'start_project — полный state');
    const r = stand.runBrief('wardrobe_edits', { project_id: 'b', base_revision: start.full.revision, label: '2,4 м', edits: [{ op: 'set_size', width: 2400, height: null, depth: null }] });
    assert.equal(r.brief.state, undefined);
    assert.equal(r.brief.view, undefined);
    assert.equal(r.brief.revision, r.full.revision);
    assert.deepEqual(r.brief.price, r.full.price);
    const changes = r.brief.changes as { path: string; was?: unknown; now?: unknown }[];
    assert.deepEqual(changes.find((c) => c.path === 'size.width'), { path: 'size.width', was: (start.full.state as any).size.width, now: 2400 });
    assert.ok(JSON.stringify(r.brief).length * 2 < JSON.stringify(r.full).length, 'краткий ответ вдвое меньше');
    assert.ok(stand.calls().at(-1)!.output.state, 'в журнале — полный ответ');
    assert.deepEqual((stand.run('get_project', { project_id: 'b' }) as any).state, r.full.state);
    // Отказ: изменений нет, отказ словами ядра.
    const no = stand.runBrief('wardrobe_edits', { project_id: 'b', base_revision: r.full.revision, label: 'x', edits: [{ op: 'set_facade', section: 9, facade: 'lift' }] });
    assert.ok((no.brief.refused as any).problem);
    assert.deepEqual(no.brief.changes, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
