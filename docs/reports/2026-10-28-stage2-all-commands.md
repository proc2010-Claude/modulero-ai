# Этап 2: весь функционал конструктора на стенде (2026-10-28)

## Что сделано (AI-DEC-007)
- Сверка ядра `cbaf1534` с договором сделана не вручную, а программой: `scripts/commands.ts` читает типы TypeScript редакторов ядра (`kitchen/index.ts`, `wardrobe/editor.ts`, методы `createHomeEditor` в `home/edit.ts`) и записывает `contract/commands-cbaf1534.json` — каждую функцию правки с описанием из кода ядра и JSON-схемой параметров. `npm run check` сверяет файл с ядром: на новом SHA список обновится сам (`npm run contract:commands`).
- Стенд выполняет любую из этих команд инструментом `editor_call` (`contract/tools-0.2-draft.json`), список даёт `list_commands`. Правки договора 0.1 (`kitchen_edits`, `wardrobe_edits`, `home_edits`) остаются.
- Другая мебель (HOME) на стенде: 8 заготовок редактора, `home_edits` §4.3, цена, 3D конструктора, файл версии открывается в конструкторе (проверено в сборке `cbaf1534`: комод из двух корпусов, та же цена 63 033,45 ₽).
- В сводке `state` — id, нужные командам: корпуса, стыки, перегородки, стоевые, ряды фасадов, декоры и фурнитура шкафа; полки и поля панелей модулей кухни; корпуса и элементы HOME.
- Сценарии: `w09-two-bodies` (шкаф 2,4 м из двух корпусов со стыком 2-3, антресоль над каждым, ручки TILDA), `k14-module-shelves` (полка в модуле, ширина новых модулей), `h01-chest` (комод: цвет, ширина, ковёр, второй корпус).

## Сверка: команды редактора ядра (99)

**Кухня** (23): `addKitchenModuleTo`, `addKitchenObstacle`, `addKitchenShelf`, `confirmKitchenRoom`, `dropKitchenCard`, `moveKitchenModule`, `removeKitchenModule`, `removeKitchenObstacle`, `removeKitchenShelf`, `setKitchenDefaultWidth`, `setKitchenFacadeChoice`, `setKitchenIncludeAppliances`, `setKitchenIsland`, `setKitchenMaterial`, `setKitchenModuleField`, `setKitchenModuleMaterial`, `setKitchenOption`, `setKitchenOrientation`, `setKitchenRoom`, `setKitchenShelfFixed`, `setKitchenShelfLevel`, `setKitchenType`, `updateKitchenModule`.

**Шкаф и купе** (61): `addDrawer`, `addDrawerAbove`, `addPartition`, `addRod`, `addShelf`, `addStorage`, `addUpright`, `changeShelfType`, `distributeShelves`, `duplicateFill`, `equalFacadeRows`, `mergeFacadeRow`, `moveDrawer`, `moveFacadeSeam`, `movePartition`, `moveRod`, `moveShelf`, `removeDrawer`, `removePartition`, `removeSection`, `removeShelf`, `removeStorage`, `removeUpright`, `setBase`, `setBodyWidth`, `setDecor`, `setDrawerBoxHeight`, `setDrawerExecution`, `setDrawerGap`, `setDrawerSystem`, `setEdgeDecor`, `setFacade`, `setFacadeChoice`, `setFacadeMaterial`, `setFacadeMounting`, `setFacadeRow`, `setFacadeRowHeight`, `setFittings`, `setHingeSide`, `setLegsBase`, `setLift`, `setLighting`, `setMezzanine`, `setPanel`, `setPlinthLegsBase`, `setProduct`, `setPushToOpen`, `setRodDepth`, `setRoom`, `setSectionCount`, `setSectionWidth`, `setShelfDepth`, `setSideDecor`, `setSize`, `setSlidingDoors`, `setSlidingInsert`, `setSlidingLeafInsert`, `setStorageColour`, `setUpright`, `splitFacadeRow`, `toggleBodyJoint`.

**Другая мебель (HOME)** (15): `addDoor`, `addDrawer`, `addPartition`, `addShelf`, `applyMaterial`, `copy`, `equalShelves`, `remove`, `resize`, `setBack`, `setBase`, `setFacadeChoice`, `setFloor`, `setHandle`, `setKitLevel`.

Не команды стенда:

| Команда | Почему |
|---|---|
| `kitchen/kitchenExampleProject` | пример кухни — start_project с template |
| `kitchen/moduleEdit` | тип не переводится в схему (параметр change: (c: Rec, s: KitchenScene) => void) |
| `kitchen/setKitchenCurrency` | валюта ставок мебельщика |
| `kitchen/setKitchenCutting` | параметры раскроя производства |
| `kitchen/setKitchenRates` | ставки мебельщика |
| `wardrobe/removeAffected` | тип не переводится в схему (параметр after: WardrobeInput) |
| `wardrobe/resizeAffected` | тип не переводится в схему (параметр after: WardrobeInput) |
| `wardrobe/setCutting` | параметры раскроя производства |

## Чего нет в ядре — задачи для Modulero (Д, номера выдаёт Директор)

| Задача | Что | Статус |
|---|---|---|
| MOD-AI-15, MOD-AI-16 | Декор столешницы и выбор ручек кухни | В редакторе кухни команд нет — остаются |
| MOD-AI-18 | Ниша без задней стенки + открывание нажатием: редактор принимает, граф не строится | Остаётся; стенд отказывает словами ядра и через `editor_call` тоже |
| MOD-AI-19 | Убрать штангу шкафа | Команды `removeRod` в ядре нет — остаётся |
| MOD-AI-20 | Корзина для обуви и ширина секции в свету | Остаётся |
| MOD-AI-21 | Выбор ручки шкафа | Закрыта стендом: команда `wardrobe/setFittings` |
| MOD-AI-22 | Зеркальные вставки купе | В каталоге выпуска нет — остаётся; вставка отдельной створки — `wardrobe/setSlidingLeafInsert` |

## Решения (Д)
- Параметры команды передаются строкой `args_json`, а не объектом в схеме инструмента: так `editor_call` остаётся небольшим strict-инструментом, а точная схема каждой команды — в `list_commands`; стенд проверяет `args_json` по ней.
- Замечания редактора HOME (`issues`) выводятся в `warnings`: это подсказки экрана редактора («Подсказки»), в отличие от производственных замечаний графа шкафа.
- Полоса цены HOME: итог `price.total` редактора; при статусе `PARTIAL` — `amount_rub: null`, известной части у HOME нет.
