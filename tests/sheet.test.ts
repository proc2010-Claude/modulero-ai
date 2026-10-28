// Шпаргалка входов (npm run dialog -- ready) и строка расхода: шпаргалка покрывает все инструменты и операции
// правок из схем стенда; строка расхода — оценка для API по всем моделям прайса, а не по модели треда.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { costLine, PRICING, sessionCost } from '../src/stand/cost.ts';
import { sheet } from '../src/stand/sheet.ts';
import { loadStandTools } from '../src/tools.ts';

test('шпаргалка: каждый инструмент и каждая операция правок — своя строка', () => {
  const lines = sheet().split('\n');
  for (const t of loadStandTools().tools) {
    assert.ok(lines.some((l) => l.startsWith(t.name + ' ')), t.name);
    const items = (t.input_schema.properties as Record<string, { items?: { anyOf?: { properties: { op: { const: string } } }[] } }>).edits?.items?.anyOf ?? [];
    for (const op of items) assert.ok(lines.some((l) => l.startsWith(`  ${op.properties.op.const} {`)), `${t.name}.${op.properties.op.const}`);
  }
  assert.match(sheet(), /^start_project \{kind: kitchen\|wardrobe\|sliding\|home, template: str\|null \(kitchen: /);
  assert.ok(Buffer.byteLength(sheet()) < 10_000);
});

test('строка расхода: цена по каждой модели прайса', () => {
  const line = costLine(sessionCost([{ kind: 'human', text: 'Хочу кухню' }, { kind: 'ai', text: 'Какая длина стены?' }]));
  assert.match(line, /^Расход через Claude API \(оценка для API, не модель треда\): ход 1 — /);
  for (const m of Object.keys(PRICING.models)) assert.ok(line.includes(m.replace(/^claude-(\w)(\w+)-(\d+)-(\d+)$/, (_, a: string, b: string, x, y) => `${a.toUpperCase()}${b} ${x}.${y}`)), m);
});
