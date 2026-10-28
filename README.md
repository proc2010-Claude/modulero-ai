# modulero-ai

ИИ-диалог Modulero: человек пишет «Хочу кухню», помощник уточняет параметры и после каждого ответа показывает прототип от движка конструктора [modulero-next](https://github.com/proc2010-Claude/modulero-next). Помощник ничего не считает сам — только вызывает движок.

Сейчас — без Claude API и без публикации (AI-DEC-001): роль помощника играет Claude в треде проекта, прототип меняется вызовами локального стенда.

- `docs/start/` — пакет старта проекта (идея, договор ИИ ↔ конструктор, правила, первая задача).
- `reference/start/` — пример «Хочу кухню» на настоящем движке и определения инструментов; хранится побайтно, сверяется по `SHA256SUMS`.
- `docs/DECISIONS.md`, `docs/ROADMAP.md`, `docs/SOURCES.md` — журнал решений, план, внешние материалы.
- `src/stand/` — стенд движка: инструменты `tools.claude-api.json` функциями ядра, сеансы, страница прототипа, оценка расхода API; `src/cli/dialog.ts` — команда `npm run dialog`.
- `vendor/modulero-next-cbaf1534/` — копия ядра modulero-next (только чтение, AI-DEC-003); состав сверяет `npm run check`, обновление — `npm run engine:setup`.
- `scenarios/kitchen/` — 13 сценариев кухни, `scenarios/wardrobe/` — 11 сценариев шкафа и купе; `npm run check` проигрывает их без ИИ.
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

В треде ход делается одной командой: `npm run dialog -- new <сеанс> --out /mnt/project-files`, затем на каждую реплику `npm run dialog -- turn -` с `{"human", "calls", "ai"}` в stdin. Она записывает реплики и правки, live-файл и копию страницы в файлы проекта и печатает одной строкой `reply` (ответ со строкой расхода), `notify` («ход <сеанс>»), `state` после хода и краткий ответ последнего вызова (`src/stand/turn.ts`, CLAUDE.md «Режим диалога»).

Шкаф — так же: `start_project '{"kind":"wardrobe","template":"start"}'` (купе — `"sliding"`), правки — `wardrobe_edits`; другая мебель — `start_project '{"kind":"home","template":"chest"}'`, правки — `home_edits`.

Всё, что умеет редактор конструктора, сверх `*_edits` — командами ядра (AI-DEC-007): `list_commands '{"kind":"wardrobe"}'`, затем `editor_call` с `calls: [{"command":"wardrobe/toggleBodyJoint","args_json":"{\"joint\":2}"}]`. Список команд и схемы параметров снимаются с типов ядра: `npm run contract:commands` → `contract/commands-cbaf1534.json` (`npm run check` сверяет).

## Диалог в конструкторе на компьютере владельца

`dist/modulero-live.html` — один офлайн-файл: слева лента диалога из треда, справа настоящий конструктор modulero-next (сборка `cbaf1534` без изменений, `vendor/modulero-next-cbaf1534-web/`, сверяется по `BUILD.json`). Страница следит за папкой с файлами `<сеанс>.json` и после каждого хода сама открывает текущую версию кухни или шкафа кнопкой конструктора «Открыть проект»; в первый раз включает 3D. Писать помощнику — по-прежнему в треде, без Claude API.

```
npm run live -- page                 # → dist/modulero-live.html
npm run live -- <сеанс> [файл]       # live.json сеанса sessions/<сеанс>/ (формат modulero-ai.live/1)
```

Файл сеанса доходит до компьютера владельца копией в папку `E:\CLAUDE\modulero-live\`. Страница открывается в Chrome, Edge или Яндекс Браузере (нужен выбор папки — File System Access); в других браузерах файл можно открыть или перетащить вручную.
