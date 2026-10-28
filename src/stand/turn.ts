import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { liveState } from '../live/export.ts';
import type { Stand } from './stand.ts';

/** Ход диалога одной командой: реплика человека, вызовы инструментов, ответ помощника, страница и live-файл. */
export interface TurnInput {
  /** Реплика владельца; null — ход без новой реплики (например, продолжение после отказа). */
  human: string | null;
  /** Вызовы по порядку. `base_revision: "head"` — ревизия текущей версии сеанса на момент вызова. */
  calls: { tool: string; input: Record<string, unknown> }[];
  /** Ответ помощника; пишется, только если все вызовы прошли без отказа и ошибки. */
  ai: string | null;
  /** Куда записать live-файл для конструктора владельца; null — не писать. */
  live: string | null;
  /** Папка для копии prototype.html (файлы проекта); null — не копировать. */
  copy: string | null;
}

export interface TurnCall {
  tool: string;
  revision: string | null;
  refused: unknown;
  error: string | null;
}

export interface TurnResult {
  ok: boolean;
  /** Номер вызова, на котором ход остановился (отказ или ошибка), иначе null. */
  stopped_at: number | null;
  calls: TurnCall[];
  /** Полный ответ последнего выполненного вызова — для пересказа отказа или состояния. */
  last: Record<string, unknown> | null;
  ai_written: boolean;
  revision: string | null;
  page: string;
  live: string | null;
  copy: string | null;
}

export function parseTurn(raw: unknown): TurnInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ход — объект JSON.');
  const t = raw as Record<string, unknown>;
  const text = (k: string) => {
    const v = t[k] ?? null;
    if (v !== null && typeof v !== 'string') throw new Error(`Поле ${k} — строка или null.`);
    return v as string | null;
  };
  if (!Array.isArray(t.calls)) throw new Error('Поле calls — массив вызовов.');
  const calls = t.calls.map((c, i) => {
    const x = c as Record<string, unknown>;
    if (!x || typeof x.tool !== 'string' || !x.input || typeof x.input !== 'object') throw new Error(`calls[${i}]: нужны tool и input.`);
    return { tool: x.tool, input: x.input as Record<string, unknown> };
  });
  return { human: text('human'), calls, ai: text('ai'), live: text('live'), copy: text('copy') };
}

export function runTurn(stand: Stand, turn: TurnInput): TurnResult {
  if (turn.human !== null) stand.say('human', turn.human);
  const calls: TurnCall[] = [];
  let last: Record<string, unknown> | null = null;
  let stopped: number | null = null;
  for (const [i, c] of turn.calls.entries()) {
    const input = c.input.base_revision === 'head' ? { ...c.input, base_revision: stand.headRevision() } : c.input;
    const out = stand.run(c.tool, input) as Record<string, unknown>;
    last = out;
    const refused = out.refused ?? null;
    const error = out.is_error ? String(out.error ?? 'ошибка') : null;
    calls.push({ tool: c.tool, revision: (out.revision as string | undefined) ?? null, refused, error });
    if (refused !== null || error !== null) {
      stopped = i;
      break;
    }
  }
  const ok = stopped === null;
  if (ok && turn.ai !== null) stand.say('ai', turn.ai);
  const page = join(stand.dir, 'prototype.html');
  if (turn.live !== null) {
    mkdirSync(dirname(turn.live), { recursive: true });
    writeFileSync(turn.live, JSON.stringify(liveState(stand.dir)) + '\n');
  }
  if (turn.copy !== null) {
    mkdirSync(turn.copy, { recursive: true });
    copyFileSync(page, join(turn.copy, 'prototype.html'));
  }
  return { ok, stopped_at: stopped, calls, last, ai_written: ok && turn.ai !== null, revision: stand.headRevision(), page, live: turn.live, copy: turn.copy };
}
