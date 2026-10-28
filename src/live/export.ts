// Живой сеанс для конструктора на компьютере владельца: один файл live.json из сеанса стенда
// (sessions/<имя>/, формат modulero-ai.session/1). Страница dist/modulero-live.html следит за папкой
// с этими файлами и после каждого хода открывает текущую версию в настоящем конструкторе.
//
// В файле только то, что видно на экране конструктора и в треде (MOD-DEC-497): реплики, подписи версий,
// цена как её отдал движок и файл проекта текущей версии. Ничего не считается заново.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const LIVE_FORMAT = 'modulero-ai.live/1';
const SESSION_FORMAT = 'modulero-ai.session/1';

export interface LivePrice {
  status: string;
  amount_rub: number | null;
  known_amount_rub: number | null;
}

export interface LiveVersion {
  n: number;
  revision: string;
  label: string;
  at: string;
  price: LivePrice;
}

export interface LiveLine {
  seq: number | null;
  at: string;
  who: 'human' | 'ai' | 'choices';
  text: string;
  options?: string[];
}

export interface LiveState {
  format: typeof LIVE_FORMAT;
  session: string;
  /** Сквозной номер последней записи сеанса: меняется после каждого вызова и реплики. */
  seq: number;
  engine: { repo: string; sha: string; hardwareCatalog: string };
  kind: string | null;
  /** Текущая версия (session.json head, а не последняя запись истории: после undo это «Возврат к версии N»). */
  head: LiveVersion | null;
  /** Файл проекта текущей версии — открывается в конструкторе как «Открыть проект». */
  project: { name: string; text: string } | null;
  history: { n: number; label: string }[];
  dialog: LiveLine[];
}

interface SessionVersion extends LiveVersion {
  tool: string;
  file: string;
}

interface SessionFile {
  format: string;
  name: string;
  engine: { repo: string; sha: string; hardwareCatalog: string };
  kind: string | null;
  head: number | null;
  history: SessionVersion[];
  seq: number;
}

export function liveState(dir: string): LiveState {
  const file = join(dir, 'session.json');
  if (!existsSync(file)) throw new Error(`Нет сеанса: ${file}`);
  const s = JSON.parse(readFileSync(file, 'utf8')) as SessionFile;
  if (s.format !== SESSION_FORMAT) throw new Error(`Сеанс ${basename(dir)}: формат ${s.format}, ожидался ${SESSION_FORMAT}`);
  const v = s.head === null ? null : s.history.find((h) => h.n === s.head);
  if (s.head !== null && !v) throw new Error(`Сеанс ${s.name}: нет версии head=${s.head} в истории`);
  const dialogFile = join(dir, 'dialog.jsonl');
  const dialog: LiveLine[] = existsSync(dialogFile)
    ? readFileSync(dialogFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const d = JSON.parse(l);
          return { seq: d.seq ?? null, at: d.at, who: d.who, text: d.text, ...(d.options ? { options: d.options } : {}) };
        })
    : [];
  return {
    format: LIVE_FORMAT,
    session: s.name,
    seq: s.seq,
    engine: s.engine,
    kind: s.kind,
    head: v ? { n: v.n, revision: v.revision, label: v.label, at: v.at, price: v.price } : null,
    project: v ? { name: `${s.name}-v${String(v.n).padStart(3, '0')}.modulero`, text: readFileSync(join(dir, v.file), 'utf8') } : null,
    history: s.history.map((h) => ({ n: h.n, label: h.label })),
    dialog,
  };
}
