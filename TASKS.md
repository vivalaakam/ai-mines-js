# TASKS.md — План работ

Статусы: `[ ]` ожидает · `[~]` в работе · `[x]` выполнено · `[!]` заблокировано

Правило: **одна задача за раз**. Перед коммитом обязателен прогон `lint → format → typecheck → test → build`.

---

## Фаза 0 — Инфраструктура и документация

- [x] **T-001** Инициализация monorepo (pnpm workspaces, корневой `package.json`, `tsconfig.base.json`, ESLint, Prettier, Vitest)
- [x] **T-002** Создание файлов для кодовых агентов: `AGENTS.md`, `docs/architecture.md`, `docs/game-design.md`, `docs/engine-api.md`, `docs/persistence.md`

---

## Фаза 1 — packages/shared

- [ ] **T-003** `packages/shared`: базовые типы и ID (`ids.ts`, `types.ts`, `errors.ts`)
  - ResourceId, WorkerId, StorageId, OrderId, LevelId, ChunkId
  - CellKind, CellVisibility, CellAccessibility, GamePhase, OrderState
  - Базовые union-типы команд и запросов (заглушки, уточняются в engine)

---

## Фаза 2 — packages/engine (ядро)

- [ ] **T-004** Скелет engine: интерфейс `GameEngine`, `GameEngineFactory`, `ApplyResult`, `ReadResult`, `EngineCommand`, `EngineQuery`, `EngineState`
- [ ] **T-005** Система времени: tick, смены (300 тиков), фазы `shift_running` / `shift_planning`, команды `tick` / `fast_forward_to_shift_end` / `start_next_shift`, возврат `remainingTicks` и события `autosave_requested`
- [ ] **T-006** Конфиг движка: `allowWorkerReassignmentDuringShift`, `baseLevelSize`, `levelSizeMultiplier`, `maxLevelSize`, `orderAllocationMode` — все в balance-config, не захардкожено
- [ ] **T-007** Генератор карты: детерминированный seed (`seedPhrase + levelDepth + chunkX + chunkY + generatorVersion`), чанки 32×32, ленивая генерация, стартовая область 5×5 чанков, зона входа 3×3, зона спуска 3×3 в нецентральном чанке, гарантия достижимости
- [ ] **T-008** Типы и компоненты клеток: `CellKind`, `CellComponent` (rock/resource, ratio, remainingAmount), полная выработка → `empty`, ограничение коридоров ≤ 3 клетки
- [ ] **T-009** Видимость и достижимость: `reachableCells` (BFS/flood-fill от входа), разведка радиус 5 от каждой достижимой клетки, авто-догенерация соседних чанков при выходе за границу, раскрытие связанных пустот целиком
- [ ] **T-010** Трудоёмкость клеток: зависимость от глубины уровня, расстояния от входа (множитель 1.01 per cell, compound), типа ресурса
- [ ] **T-011** Система работников: уровни, скорость разработки, покупка (`maxPurchasableWorkerLevel = max(1, highest - 2)`), merge (2 одного уровня → 1 следующего), назначение (max 4 с разных сторон клетки), позиция = соседняя открытая достижимая клетка
- [ ] **T-012** Добыча ресурсов по тику: пропорциональная выработка компонентов, rock всегда добывается, ресурс — только при наличии места на складе, пересчёт пропорций без заблокированных ресурсов, состояние `blocked_by_storage`
- [ ] **T-013** Система складов: Storage (resourceId, level, capacity, storedAmount), покупка и улучшение только в `shift_planning`, суммарная вместимость, проверка переполнения per-resource
- [ ] **T-014** Система заказов: Order (requirements, rewardMoney, state, expiresAtTick, priority), принятие/отклонение только в `shift_planning`, распределение ресурсов в конце смены (`priority_based`), немедленное выполнение при достаточных запасах
- [ ] **T-015** Ресурсы: 12 ресурсов, базовая редкость, минимальная глубина появления, функция вероятности от глубины, гарантия нового ресурса на каждом уровне
- [ ] **T-016** Валидация команд в `apply`: фазовые ограничения (management-команды только в `shift_planning`), занятость клеток, достижимость позиций
- [ ] **T-017** `engine.exportState()` и `GameEngineFactory.createFromState()`: полный round-trip состояния без пересоздания карты
- [ ] **T-018** Unit-тесты engine: tick, смены, генератор, трудоёмкость, merge работников, склады, заказы, pathfinding/reachability, видимость радиус 5

---

## Фаза 3 — packages/persistence-sqlite

- [ ] **T-019** Схема SQLite: таблицы `saves`, `levels`, `chunks`, `cells`, `cell_components`, `workers`, `storages`, `orders`, `order_requirements`; миграции
- [ ] **T-020** `SqliteSaveAdapter`: чтение → `EngineState`, запись `EngineState` → SQLite, интерфейс не зависит от конкретного SQLite runtime
- [ ] **T-021** Тесты persistence-adapter на тестовой in-memory базе

---

## Фаза 4 — apps/web-three (render + UI)

- [ ] **T-022** Scaffold `apps/web-three`: Vite + Three.js, main loop, application layer (обработка `autosave_requested`, вызов adapter)
- [ ] **T-023** Рендер карты: изометрия или top-down 2D, отрисовка чанков, типы клеток, туман войны (unknown / scouted), highlight достижимых клеток
- [ ] **T-024** Визуализация работников на клетках, индикаторы прогресса разработки
- [ ] **T-025** UI панели: ресурсы/склады, список работников (покупка, merge), список заказов (принять/отклонить/приоритет), кнопки смен (start / fast-forward)
- [ ] **T-026** Ввод игрока: клик по клетке → назначить работника / открыть info, drag camera, zoom
- [ ] **T-027** Интеграционный smoke-test: новая игра → tick × N → конец смены → планирование → следующая смена

---

## Очерёдность

```
T-001 → T-002 → T-003 → T-004 → T-005 → T-006 → T-007 → T-008 → T-009
→ T-010 → T-011 → T-012 → T-013 → T-014 → T-015 → T-016 → T-017 → T-018
→ T-019 → T-020 → T-021 → T-022 → T-023 → T-024 → T-025 → T-026 → T-027
```

---

## Открытые решения (из REQUIREMENTS.md §18)

| #   | Вопрос                                          | Статус                                                            |
| --- | ----------------------------------------------- | ----------------------------------------------------------------- |
| R1  | Переназначение работников во время смены        | Конфиг `allowWorkerReassignmentDuringShift`, по умолчанию `false` |
| R2  | Аварийные ручные вмешательства во время смены   | Не реализуем в MVP                                                |
| R3  | Численные коэффициенты (скорость, цены, объёмы) | В balance-config, финализируются в T-006/T-015                    |
| R4  | UI-фреймворк                                    | Three.js + vanilla TS (без React/Svelte)                          |
| R5  | SQLite runtime для web                          | WASM/OPFS; dev-adapter как заглушка                               |
