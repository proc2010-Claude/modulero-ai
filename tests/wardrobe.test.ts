// Шкаф на стенде (этап 2): правки договора §4.2 — функциями редактора ядра, отказы — словами ядра,
// файл версии открывается конструктором как шкаф, цена — только поля полосы цены.
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { liveState } from '../src/live/export.ts';
import { loadCore } from '../src/stand/engine.ts';
import { Stand } from '../src/stand/stand.ts';

const ROOM = { niche: null, left: null, right: null, width: null, ceiling: null, skirting: null, skirt_height: null, skirt_depth: null };

test('шкаф: старт, правки, отказы ядра, файл версии, купе и возврат', async () => {
  const core = await loadCore();
  const dir = mkdtempSync(join(tmpdir(), 'modulero-ai-wardrobe-'));
  try {
    const stand = new Stand(core, dir, 'w', () => new Date('2026-10-28T12:00:00Z'));
    const start: any = stand.run('start_project', { kind: 'wardrobe', template: 'start' });
    assert.match(start.revision, /^MWD-/);
    assert.equal(start.state.kind, 'wardrobe');
    assert.equal(start.state.sections.length, 3);
    // Цена — только поля полосы цены конструктора: без себестоимости и ставок (MOD-DEC-497).
    assert.deepEqual(Object.keys(start.price).sort(), ['amount_rub', 'currency', 'known_amount_rub', 'missing', 'status', 'terms_hidden']);
    assert.equal((stand.run('kitchen_edits', { project_id: 'w', base_revision: start.revision, label: 'x', edits: [{ op: 'set_type', type: 'l' }] }) as any).is_error, true);

    const edit = (base: string, label: string, edits: unknown[]): any => stand.run('wardrobe_edits', { project_id: 'w', base_revision: base, label, edits });
    const a = edit(start.revision, 'Шкаф 2 м', [
      { op: 'set_size', width: 2000, height: 2400, depth: null },
      { op: 'set_section_count', n: 4 },
      { op: 'add_fill', section: 0, kind: 'rod', execution: null },
      { op: 'add_storage', section: 3, kind: 'SHOE_BASKET' },
      { op: 'set_mezzanine', height: 450 },
    ]);
    assert.deepEqual(a.applied.map((x: any) => x.op), ['set_size', 'set_section_count', 'add_fill']);
    assert.match(a.refused.problem, /Корзина для обуви не подходит/);
    assert.deepEqual(a.not_run, [4]);
    assert.equal(a.state.sections[0].rods.length, 1);
    // Высоты деталей секции от пола — из 3D-сцены ядра: помощник берёт их из ответа, а не считает.
    const g = a.state.sections[0].geometry;
    assert.equal(typeof g.interior_bottom_mm, 'number');
    assert.ok(g.facades.length >= 1 && g.facades.every((f: any) => f.top_mm > f.bottom_mm));
    assert.equal(stand.data.history.length, 2);

    // Файл версии — проект шкафа конструктора: открывается для правки, та же версия.
    const opened = core.readProjectFile(readFileSync(join(dir, 'w', stand.data.history[1]!.file), 'utf8'), core.HW);
    assert.equal(opened.kind, 'wardrobe');
    assert.equal(opened.editable, true);
    assert.equal(core.wardrobeGraph(opened.project.input, core.HW).revision.projectRevisionId, a.revision);

    // Без задней стенки — отказ ядра; в нише — можно. Нажатие в нише без стенки граф не строит (MOD-AI-18): отказ, проект прежний.
    const b = edit(a.revision, 'Без задней стенки', [{ op: 'set_panel', panel: 'back', on: false }]);
    assert.match(b.refused.problem, /только в нише или между стенами/);
    const c = edit(a.revision, 'В нише без задней стенки', [{ op: 'set_room', ...ROOM, niche: true }, { op: 'set_panel', panel: 'back', on: false }]);
    assert.equal(c.refused, null);
    const d = edit(c.revision, 'Без ручек', [{ op: 'set_push_to_open', on: true }]);
    assert.match(d.refused.problem, /Конструктор не строит шкаф после этой правки/);
    assert.equal(d.revision, c.revision);
    // Убрать штангу ядро не умеет (MOD-AI-19).
    assert.match(edit(c.revision, 'Без штанги', [{ op: 'remove_fill', section: 0, kind: 'rod', index: 0 }]).refused.problem, /Убрать штангу/);

    const e = edit(c.revision, 'Купе', [{ op: 'set_product', product: 'sliding' }, { op: 'set_sliding_doors', n: 3, system: null, scheme: null, mirror: true }]);
    assert.equal(e.refused, null);
    assert.equal(e.state.kind, 'sliding');
    assert.equal(e.state.sliding.doors, 3);
    assert.equal(JSON.parse(readFileSync(join(dir, 'w', stand.data.history.at(-1)!.file), 'utf8')).kind, 'sliding');

    const back: any = stand.run('undo', { project_id: 'w', to_revision: a.revision });
    assert.equal(back.revision, a.revision);
    assert.equal(back.state.kind, 'wardrobe');
    assert.equal(stand.data.kind, 'wardrobe');

    for (const topic of ['limits', 'decors', 'handles', 'storage', 'sliding_systems', 'sliding_inserts']) assert.ok(!(stand.run('get_options', { kind: 'wardrobe', topic }) as any).is_error, topic);
    assert.equal((stand.run('get_options', { kind: 'wardrobe', topic: 'kitchen_cards' }) as any).is_error, true);

    // Конструктор с лентой (src/live) открывает текущую версию шкафа тем же файлом проекта.
    const live = liveState(join(dir, 'w'));
    assert.equal(live.kind, 'wardrobe');
    assert.equal(JSON.parse(live.project!.text).kind, 'wardrobe');

    const page = readFileSync(join(dir, 'w', 'prototype.html'), 'utf8');
    assert.match(page, /Прототип · распашной шкаф/);
    assert.match(page, /id="scene3d"/);
    // «Рентген» и «Взрыв» — режимы 3D-вида конструктора; ходы «Взрыва» — функции ядра explodeOffsets, explodeLift.
    assert.match(page, /data-act="xray"/);
    assert.match(page, /data-act="explode"/);
    // Нажатие на дверь или ящик открывает его, как в конструкторе.
    assert.match(page, /toggleMotion\(m\.key\)/);
    // Створки купе двигаются по правилам ядра slidePose и slideClears.
    assert.match(page, /slides:E\?\{pose:E\.slidePose,clears:E\.slideClears\}/);
    assert.match(page, /ModuleroExplode/);
    // Текущая цена — в углу поля 3D (AI-DEC-008).
    assert.match(page, /id="v3d-price">Ориентир /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
