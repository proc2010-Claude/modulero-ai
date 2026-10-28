import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { loadTools, strictSchemaProblems, toolsProblems } from '../src/tools.ts';

const EXPECTED_TOOLS = [
  'start_project', 'get_options', 'kitchen_edits', 'wardrobe_edits', 'home_edits',
  'get_project', 'undo', 'variants', 'offer_choices', 'open_in_editor',
];

test('файл инструментов: договор 0.1-draft на закреплённой основе', () => {
  const file = loadTools();
  assert.equal(file.format, 'modulero.ai-tools');
  assert.equal(file.formatVersion, '0.1-draft');
  assert.match(file.basis, /cbaf1534/);
  assert.match(file.basis, /hw-2026-10-27\.8/);
});

test('файл инструментов: 10 инструментов из EXCHANGE_SPEC.md §4', () => {
  assert.deepEqual(loadTools().tools.map((t) => t.name), EXPECTED_TOOLS);
});

test('схемы инструментов укладываются в strict-режим', () => {
  assert.deepEqual(toolsProblems(loadTools()), []);
});

test('проверка strict ловит необязательное поле и лишние свойства', () => {
  const bad = { type: 'object', properties: { a: { type: 'string' }, b: { type: 'object', properties: { c: { type: 'number' } }, required: ['c'] } }, required: ['b'] };
  assert.deepEqual(strictSchemaProblems(bad), [
    '$: нет additionalProperties: false',
    '$: поле a не в required',
    '$.b: нет additionalProperties: false',
  ]);
});
