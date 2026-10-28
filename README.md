# modulero-ai

ИИ-диалог Modulero: человек пишет «Хочу кухню», помощник уточняет параметры и после каждого ответа показывает прототип от движка конструктора [modulero-next](https://github.com/proc2010-Claude/modulero-next). Помощник ничего не считает сам — только вызывает движок.

Сейчас — без Claude API и без публикации (AI-DEC-001): роль помощника играет Claude в треде проекта, прототип меняется вызовами локального стенда.

- `docs/start/` — пакет старта проекта (идея, договор ИИ ↔ конструктор, правила, первая задача).
- `reference/start/` — пример «Хочу кухню» на настоящем движке и определения инструментов; хранится побайтно, сверяется по `SHA256SUMS`.
- `docs/DECISIONS.md`, `docs/ROADMAP.md`, `docs/SOURCES.md` — журнал решений, план, внешние материалы.
- `src/stand/` — стенд движка: инструменты `tools.claude-api.json` функциями ядра, сеансы, страница прототипа, оценка расхода API; `src/cli/dialog.ts` — команда `npm run dialog`.
- `vendor/modulero-next-cbaf1534/` — копия ядра modulero-next (только чтение, AI-DEC-003); состав сверяет `npm run check`, обновление — `npm run engine:setup`.
- `scenarios/kitchen/` — 12 сценариев кухни; `npm run check` проигрывает их без ИИ.
- `docs/reports/` — отчёты владельцу; `tests/` — тесты.

```
nvm use 24
npm ci
npm run check   # → All checks passed.
```

Стенд вручную (то же делает Claude в «Режиме диалога», `CLAUDE.md`):

```
npm run dialog -- new k-2026-10-28-a
npm run dialog -- human 'Хочу кухню'
npm run dialog -- start_project '{"kind":"kitchen","template":"straight"}'
npm run dialog -- ai '…'        # печатает строку расхода через Claude API (оценка)
npm run dialog -- page          # путь к sessions/<сеанс>/prototype.html
```
