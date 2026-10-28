// AI-DEC-006: оценка расхода Claude API по ходам диалога — без запросов к API.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ASSUMPTIONS, PRICING, fixedTokens, sessionCost, tokensOf, usdOf } from '../src/stand/cost.ts';

test('токены по длине текста: латиница и кириллица', () => {
  assert.equal(tokensOf('abcdef'), Math.ceil(6 / ASSUMPTIONS.asciiCharsPerToken));
  assert.equal(tokensOf('кухня'), Math.ceil(5 / ASSUMPTIONS.otherCharsPerToken));
});

test('стоимость по ценам страницы: запись и чтение кэша, выход', () => {
  const usd = usdOf({ requests: 1, input: 0, cache_write: 1e6, cache_read: 1e6, output: 1e6 });
  const p = PRICING.models['claude-opus-5-5'];
  assert.equal(usd['claude-opus-5-5'], p.write5m + p.read + p.output);
});

test('ход: вызов инструмента и ответ — два запроса, второй читает из кэша записанное первым', () => {
  const c = sessionCost([
    { kind: 'human', text: 'Хочу кухню' },
    { kind: 'call', tool: 'start_project', input: { kind: 'kitchen', template: 'empty' }, output: { revision: 'KPR2-x', view: { page: '/very/long/path' } } },
    { kind: 'ai', text: 'Начнём.' },
    { kind: 'human', text: 'Угловая' },
    { kind: 'ai', text: 'Хорошо.' },
  ]);
  assert.equal(c.turns.length, 2);
  assert.equal(c.turns[0]!.requests, 2);
  const first = c.turns[0]!;
  assert.ok(first.cache_write >= fixedTokens(), 'первый запрос пишет постоянную часть в кэш');
  assert.ok(c.turns[1]!.cache_read > first.cache_read, 'история растёт');
  assert.ok(c.total.usd['claude-opus-5-5'] > c.total.usd['claude-sonnet-5-5']);
});
