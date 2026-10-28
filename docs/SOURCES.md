# Внешние материалы

| Материал | Версия | Где | Зачем |
|---|---|---|---|
| Пакет старта `ai-dialog-start` (владелец) | 2026-10-28 | `docs/start/`, `reference/start/` (`SHA256SUMS`) | Идея, договор, правила, пример «Хочу кухню» |
| `proc2010-Claude/modulero-next` | `main` `cbaf1534`, каталог `hw-2026-10-27.8` | только чтение (AI-DEC-003) | Ядро конструктора для стенда |
| Сборка конструктора `modulero-next.html` | `cbaf1534`, sha256 `fc8d41af…` | `vendor/modulero-next-cbaf1534-web/` (`BUILD.json`) | Настоящий конструктор и 3D на странице «диалог в конструкторе»; собран из modulero-next без изменений (esbuild 0.25.12, three 0.180.0) |
| `typescript` | 5.9.3 | devDependencies | Проверка типов (та же версия, что в modulero-next) |
| `@types/node` | 24.19.2 | devDependencies | Типы Node 24 |
| Node.js | 24 | `.nvmrc`, `engines` | Среда проверки |
