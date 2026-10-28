// TASK_FIRST.md п. 5–6: проигрыш записанных вызовов каждого сценария без ИИ — те же версии, отказы и суммы;
// реплики помощника называют только цену из ответа стенда и не скрывают неполноту.
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { loadCore } from '../src/stand/engine.ts';
import { SCENARIO_FORMAT, answerProblems, replay, type Scenario } from '../src/stand/scenario.ts';

const DIR = new URL('../scenarios/kitchen/', import.meta.url);
const WARDROBE = new URL('../scenarios/wardrobe/', import.meta.url);
const HOME = new URL('../scenarios/home/', import.meta.url);
const list = (dir: URL) => readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const files = list(DIR);

test('сценарии кухни: не меньше 12 диалогов из TASK_FIRST.md п. 5', () => {
  assert.ok(files.length >= 12, files.join(', '));
});

test('сценарии шкафа: не меньше 8 диалогов (EXCHANGE_SPEC.md §9)', () => {
  assert.ok(list(WARDROBE).length >= 8, list(WARDROBE).join(', '));
});

test('сценарии другой мебели (HOME): есть', () => {
  assert.ok(list(HOME).length >= 1);
});

for (const url of [DIR, WARDROBE, HOME].flatMap((dir) => list(dir).map((f) => new URL(f, dir)))) {
  const f = url.pathname.split('/').slice(-2).join('/');
  test(`сценарий ${f}`, async () => {
    const sc: Scenario = JSON.parse(readFileSync(url, 'utf8'));
    assert.equal(sc.format, SCENARIO_FORMAT);
    assert.ok(sc.goal && sc.criteria.length, 'нет цели или критериев');
    assert.ok(sc.review, 'нет разбора');
    for (const t of sc.turns) assert.ok(t.ai, `нет ответа помощника на «${t.human}»`);
    const r = replay(await loadCore(), sc);
    assert.deepEqual(r.problems, []);
  });
}

test('проверка ответа ловит выдуманную цену, скрытую неполноту и лишние вопросы', () => {
  const partial = { amount_rub: null, known_amount_rub: 142017.68 };
  assert.deepEqual(answerProblems('Ориентир около 142 тыс. ₽, цена неполная.', partial), []);
  assert.equal(answerProblems('Ориентир около 150 тыс. ₽, цена неполная.', partial).length, 1);
  assert.deepEqual(answerProblems('Ориентир около 142 тыс. ₽.', partial), ['цена неполная, а в ответе нет слова «неполная»']);
  assert.equal(answerProblems('Себестоимость 98 000 ₽.', partial).length, 1);
  assert.equal(answerProblems('А? Б? В? Г?', null).length, 1);
  assert.deepEqual(answerProblems('Ориентир около 200 тыс. ₽.', { amount_rub: 200140, known_amount_rub: 200140 }), []);
});

test('проигрыш замечает расхождение версии и пропавший отказ', async () => {
  const sc: Scenario = JSON.parse(readFileSync(new URL('k01-straight.json', DIR), 'utf8'));
  const call = sc.turns[1]!.calls[0]!;
  call.expect.revision = 'KPR2-0000000000000000';
  sc.expected_refusals.push('такого отказа нет');
  const r = replay(await loadCore(), sc);
  assert.equal(r.problems.length, 2, r.problems.join('\n'));
});
