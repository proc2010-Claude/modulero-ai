# Внешние материалы

| Материал | Версия | Где | Зачем |
|---|---|---|---|
| Пакет старта `ai-dialog-start` (владелец) | 2026-10-28 | `docs/start/`, `reference/start/` (`SHA256SUMS`) | Идея, договор, правила, пример «Хочу кухню» |
| `proc2010-Claude/modulero-next` | `main` `cbaf1534`, каталог `hw-2026-10-27.8` | копия только для чтения в `vendor/modulero-next-cbaf1534/` (ядро `packages/core/src`, `packages/bazis/src`, нужные файлы `catalogs/`, 3D-вид конструктора `apps/web/src/view3d` со сборкой `view3d.js` и образцы декоров `apps/web/public/decors`; состав и sha256 списка файлов — `engine.json`, сверяет `npm run check`); снята `npm run engine:setup` через `git archive` (AI-DEC-003) | Ядро конструктора для стенда; стенд не зависит от подключения modulero-next |
| `typescript` | 5.9.3 | devDependencies | Проверка типов (та же версия, что в modulero-next) |
| `@types/node` | 24.19.2 | devDependencies | Типы Node 24 |
| `three` | 0.180.0 | devDependencies | 3D-вид конструктора в сборке `view3d.js` (та же версия, что в modulero-next `cbaf1534`) |
| `esbuild` | 0.25.12 | devDependencies | Сборка `view3d.js` в `npm run engine:setup` (та же версия, что в lock-файле modulero-next `cbaf1534`) |
| Node.js | 24 | `.nvmrc`, `engines` | Среда проверки |
| Цены Claude API (`platform.claude.com/docs/en/about-claude/pricing`) | 2026-10-28 | `src/stand/cost.ts` (`PRICING`) | Оценка расхода диалога через API (AI-DEC-006); запросов к API нет |
