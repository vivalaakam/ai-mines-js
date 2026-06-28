# AGENTS.md — Правила для кодовых агентов

Этот файл содержит **жёсткие ограничения** для любого агента, работающего в этом репозитории.
Нарушение любого из правил запрещено вне зависимости от контекста задачи.

---

## 1. Архитектурные запреты

### 1.1. Состояние игры — только через engine

**Нельзя** изменять игровое состояние в обход `engine.apply(command)`.
Любая мутация состояния — работники, клетки, склады, заказы, время — происходит **исключительно** через `apply`.

### 1.2. UI/render работает только через `apply` и `read`

Слой `apps/web-three` (render, UI, input) взаимодействует с engine **только** через два метода:

```ts
engine.apply(command: EngineCommand): ApplyResult
engine.read(query: EngineQuery): ReadResult
```

Любые другие пути (прямой импорт внутренних классов engine, шаринг ссылок на объекты состояния, event emitter в обход API) — **запрещены**.

### 1.3. Engine не зависит от render/UI

Пакет `packages/engine` **не должен** импортировать:

- `three` или любые Three.js модули
- DOM API (`document`, `window`, `HTMLElement`, …)
- UI-компоненты
- browser storage API (`localStorage`, `sessionStorage`, `indexedDB`)
- SQLite-драйвер или любой persistence runtime

Нарушение проверяется через TypeScript: engine не имеет этих зависимостей в `package.json`.

### 1.4. Engine не зависит напрямую от SQLite

Доменная логика в `packages/engine` **не знает** о SQLite.
Сохранение и загрузка — ответственность `packages/persistence-sqlite`.

### 1.5. SQLite доступен только через persistence adapter

Любая работа с базой данных — только через `SqliteSaveAdapter` из `packages/persistence-sqlite`.
Прямые SQL-запросы в engine или render-слое **запрещены**.

---

## 2. Правила изменения кода

### 2.1. Тесты обязательны при затронутой логике

Если задача затрагивает логику engine (тик, добыча, работники, склады, заказы, генератор, pathfinding) —
изменения **должны сопровождаться** соответствующими тестами в `packages/engine/src/**/*.test.ts`.

Если задача затрагивает persistence adapter — тесты в `packages/persistence-sqlite/src/**/*.test.ts`.

Чисто структурные изменения (типы, рефакторинг без изменения поведения) допускают отсутствие новых тестов,
но существующие тесты **обязаны** проходить.

### 2.2. Обязательные проверки перед завершением задачи

Перед тем как считать задачу выполненной, агент **обязан** запустить все четыре команды:

```bash
pnpm run lint
pnpm run format
pnpm run typecheck
pnpm run test
```

Агент **обязан явно указать** результат каждой команды в своём отчёте.

### 2.3. Коммит — только при зелёных проверках

Если все четыре проверки прошли успешно → агент делает `git commit` в текущую ветку.
Если хотя бы одна проверка упала → коммит **запрещён**. Агент исправляет проблему и перезапускает проверки.

### 2.4. Формат коммита

```
T-NNN: краткое описание на русском языке

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## 3. Справочник по пакетам

| Пакет                          | Путь                          | Назначение             |
| ------------------------------ | ----------------------------- | ---------------------- |
| `@ai-mines/shared`             | `packages/shared`             | Общие типы, ID, ошибки |
| `@ai-mines/engine`             | `packages/engine`             | Вся игровая логика     |
| `@ai-mines/persistence-sqlite` | `packages/persistence-sqlite` | SQLite adapter         |
| `@ai-mines/web-three`          | `apps/web-three`              | Three.js render + UI   |

Граф зависимостей (стрелка = «зависит от»):

```
web-three → engine → shared
web-three → persistence-sqlite → engine → shared
```

Обратные зависимости **запрещены**.

---

## 4. Ссылки на документацию

- `docs/architecture.md` — общая архитектура системы
- `docs/game-design.md` — игровые механики и баланс
- `docs/engine-api.md` — полный список команд и запросов engine
- `docs/persistence.md` — схема БД и интерфейс persistence adapter
