# Внешние материалы

| Материал | Версия | Где | Зачем |
|---|---|---|---|
| Пакет старта `ai-dialog-start` (владелец) | 2026-10-28 | `docs/start/`, `reference/start/` (`SHA256SUMS`) | Идея, договор, правила, пример «Хочу кухню» |
| `proc2010-Claude/modulero-next` | `main` `cbaf1534`, каталог `hw-2026-10-27.8` | копия только для чтения в `vendor/modulero-next-cbaf1534/` (ядро `packages/core/src`, `packages/bazis/src`, нужные файлы `catalogs/`, 3D-вид конструктора `apps/web/src/view3d` со сборкой `view3d.js` образцы декоров `apps/web/public/decors` и файлы 3D-моделей каталога `catalogs/hardware/models` (MOD-DEC-536); состав и sha256 списка файлов — `engine.json`, сверяет `npm run check`); снята `npm run engine:setup` через `git archive` (AI-DEC-003) | Ядро конструктора для стенда; стенд не зависит от подключения modulero-next |
| Сборка конструктора `modulero-next.html` | `cbaf1534`, sha256 `fc8d41af…` | `vendor/modulero-next-cbaf1534-web/` (`BUILD.json`) | Настоящий конструктор и 3D на странице «диалог в конструкторе»; собран из modulero-next без изменений (esbuild 0.25.12, three 0.180.0) |
| `typescript` | 5.9.3 | devDependencies | Проверка типов (та же версия, что в modulero-next) |
| `@types/node` | 24.19.2 | devDependencies | Типы Node 24 |
| `three` | 0.180.0 | devDependencies | 3D-вид конструктора в сборке `view3d.js` (та же версия, что в modulero-next `cbaf1534`) |
| `esbuild` | 0.25.12 | devDependencies | Сборка `view3d.js` в `npm run engine:setup` и функций «Взрыва» ядра (`engine/explode.ts`) для страницы прототипа (та же версия, что в lock-файле modulero-next `cbaf1534`) |
| Node.js | 24 | `.nvmrc`, `engines` | Среда проверки |
| Цены Claude API (`platform.claude.com/docs/en/about-claude/pricing`) | 2026-10-28 | `src/stand/cost.ts` (`PRICING`) | Оценка расхода диалога через API (AI-DEC-006); запросов к API нет |
| Эргономика Modulero: E04 «Functional Storage Zones and Vertical Allocation» v1.1 и E02 «Minimal User Profile and Smart Assumptions» v1.1 (комплект владельца `MODULERO_ERGONOMIC_RULES_20261028.zip`) | v1.1, sha256 `cd5859e1…` (E04), `f87732bd…` (E02) | в репозиторий не копируются; пересказ — раздел «Наполнение шкафа» в `docs/start/SYSTEM_PROMPT_DRAFT.md` | Зоны по высоте, частота доступа, соседство и вопросы к человеку для раскладки шкафа; расчёт ёмкости и генерация вариантов (E03, E05) не используются — считает движок |
