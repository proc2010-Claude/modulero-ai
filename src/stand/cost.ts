// Оценка расхода Claude API на диалог (AI-DEC-006, (Д)): сколько токенов и долларов ушло бы, если бы ту же
// реплику помощника делал Claude через API (EXCHANGE_SPEC.md §7), а не Claude в треде. Запросов к API нет:
// токены оцениваются по длине текста, цены — с официальной страницы (PRICING.source).
//
// Модель расчёта. Каждый вызов инструмента — один ответ модели с tool_use, плюс один ответ с текстом помощника.
// Вход запроса — инструменты, системный промт и вся история (реплики, вызовы, ответы стенда без view).
// Кэш: автоматический, 5 минут; каждый запрос читает из кэша то, что записал предыдущий, и записывает новое
// (первый запрос сеанса пишет всё). Выход — JSON вызова или текст ответа плюс рассуждения (допущение).
import { readFileSync } from 'node:fs';
import { loadStandTools } from '../tools.ts';
import { BRIEF_TOOLS, briefOutput } from './brief.ts';

/** Цены за 1 млн токенов, USD, на 2026-10-28 (docs/SOURCES.md). */
export const PRICING = {
  source: 'https://platform.claude.com/docs/en/about-claude/pricing.md',
  date: '2026-10-28',
  models: {
    'claude-opus-5-5': { input: 4, write5m: 5, read: 0.2, output: 20 },
    'claude-sonnet-5-5': { input: 2, write5m: 2.5, read: 0.1, output: 10 },
    'claude-haiku-5-5': { input: 0.1, write5m: 0.125, read: 0.01, output: 0.5 },
  },
} as const;

export type ModelId = keyof typeof PRICING.models;
/** Модель предложения на этап API (EXCHANGE_SPEC.md §7). */
export const MAIN_MODEL: ModelId = 'claude-opus-5-5';

/** Допущения оценки (Д): уточняются замером count_tokens и usage после подключения API. */
export const ASSUMPTIONS = {
  /** Символов на токен: латиница, цифры, JSON — и кириллица. */
  asciiCharsPerToken: 3,
  otherCharsPerToken: 2,
  /** Служебный промт инструментов у Opus 5.5 при tool_choice auto (страница цен). */
  toolSystemTokens: 286,
  /** Рассуждения на один ответ модели при effort medium — допущение, не замер. */
  thinkingTokensPerResponse: 300,
  /** Обвязка сообщения (роль, блоки tool_use / tool_result). */
  messageOverheadTokens: 10,
};

/** Оценка токенов текста без токенизатора. */
export function tokensOf(text: string): number {
  let ascii = 0,
    other = 0;
  for (const ch of text) (ch.charCodeAt(0) < 128 ? ascii++ : other++);
  return Math.ceil(ascii / ASSUMPTIONS.asciiCharsPerToken + other / ASSUMPTIONS.otherCharsPerToken);
}

let fixed: number | null = null;
/** Постоянная часть запроса: инструменты стенда (договор 0.1 и расширение 0.2), системный промт помощника, служебный промт. */
export function fixedTokens(): number {
  if (fixed !== null) return fixed;
  const tools = loadStandTools().tools;
  const prompt = readFileSync(new URL('../../docs/start/SYSTEM_PROMPT_DRAFT.md', import.meta.url), 'utf8').split('\n---\n')[1] ?? '';
  fixed = tokensOf(JSON.stringify(tools)) + tokensOf(prompt) + ASSUMPTIONS.toolSystemTokens;
  return fixed;
}

export interface Usage {
  requests: number;
  input: number;
  cache_write: number;
  cache_read: number;
  output: number;
}

export interface TurnCost extends Usage {
  turn: number;
  human: string;
  usd: Record<ModelId, number>;
}

export interface SessionCost {
  model: ModelId;
  turns: TurnCost[];
  total: Usage & { usd: Record<ModelId, number> };
  fixed_tokens: number;
  assumptions: typeof ASSUMPTIONS;
  pricing: { source: string; date: string };
}

type Event = { kind: 'human' | 'ai'; text: string } | { kind: 'call'; tool: string; input: unknown; output: Record<string, unknown> };

const zero = (): Usage => ({ requests: 0, input: 0, cache_write: 0, cache_read: 0, output: 0 });

export function usdOf(u: Usage): Record<ModelId, number> {
  const out = {} as Record<ModelId, number>;
  for (const [id, p] of Object.entries(PRICING.models) as [ModelId, (typeof PRICING.models)[ModelId]][])
    out[id] = (u.input * p.input + u.cache_write * p.write5m + u.cache_read * p.read + u.output * p.output) / 1e6;
  return out;
}

/** Ответ стенда в том виде, в каком он ушёл бы модели: без путей к файлам страницы, у правок — кратко (brief.ts). */
function resultText(tool: string, output: Record<string, unknown>, before: unknown): string {
  if (BRIEF_TOOLS.includes(tool)) return JSON.stringify(briefOutput(output, before));
  const { view: _view, ...rest } = output;
  return JSON.stringify(rest);
}

/** Расход по ходам: ход — реплика человека и всё до следующей. */
export function sessionCost(events: Event[]): SessionCost {
  const A = ASSUMPTIONS;
  const turns: TurnCost[] = [];
  let context = fixedTokens(), // токены запроса, накопленные к следующему запросу
    cached = 0; // сколько из них уже в кэше
  let cur: { u: Usage; human: string } | null = null;
  let state: unknown; // state последнего ответа со state — от него считаются изменения краткого ответа
  const respond = (outTokens: number) => {
    // Один ответ модели: вход — весь контекст; кэш читается до записанного, остальное пишется.
    const u = cur!.u;
    u.requests++;
    u.cache_read += cached;
    u.cache_write += context - cached;
    const out = outTokens + A.thinkingTokensPerResponse;
    u.output += out;
    cached = context;
    context += outTokens + A.messageOverheadTokens; // рассуждения прошлых ответов в следующий запрос не входят (Д)
  };
  const close = () => {
    if (cur) turns.push({ turn: turns.length + 1, human: cur.human, ...cur.u, usd: usdOf(cur.u) });
    cur = null;
  };
  for (const e of events) {
    const before = state;
    if (e.kind === 'call' && e.output.state !== undefined) state = e.output.state;
    if (e.kind === 'human') {
      close();
      cur = { u: zero(), human: e.text };
      context += tokensOf(e.text) + A.messageOverheadTokens;
    } else if (!cur) continue;
    else if (e.kind === 'call') {
      respond(tokensOf(JSON.stringify({ name: e.tool, input: e.input })));
      context += tokensOf(resultText(e.tool, e.output, before)) + A.messageOverheadTokens;
    } else respond(tokensOf(e.text));
  }
  close();
  const total = turns.reduce((s, t) => ({ requests: s.requests + t.requests, input: s.input + t.input, cache_write: s.cache_write + t.cache_write, cache_read: s.cache_read + t.cache_read, output: s.output + t.output }), zero());
  return { model: MAIN_MODEL, turns, total: { ...total, usd: usdOf(total) }, fixed_tokens: fixedTokens(), assumptions: A, pricing: { source: PRICING.source, date: PRICING.date } };
}
