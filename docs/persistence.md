# Persistence

## Принцип

Engine не зависит от SQLite. Он только:

1. Предоставляет `engine.exportState(): EngineState`
2. Принимает `GameEngineFactory.createFromState(state: EngineState)`
3. Возвращает event `autosave_requested` после завершения смены

Application layer перехватывает событие и вызывает `SqliteSaveAdapter`.

## Интерфейс адаптера

```ts
interface SaveAdapter {
  save(state: EngineState): Promise<void>;
  load(saveId: string): Promise<EngineState>;
  listSaves(): Promise<SaveMeta[]>;
  deleteSave(saveId: string): Promise<void>;
}
```

`SqliteSaveAdapter` реализует этот интерфейс. Для тестов можно подставить `InMemorySaveAdapter`.

## Схема SQLite

### saves

```sql
CREATE TABLE saves (
  id          TEXT PRIMARY KEY,
  seed_phrase TEXT NOT NULL,
  generator_version INTEGER NOT NULL,
  current_tick      INTEGER NOT NULL,
  current_shift     INTEGER NOT NULL,
  phase             TEXT NOT NULL,      -- shift_running | shift_planning
  money             INTEGER NOT NULL,
  unlocked_resources TEXT NOT NULL,     -- JSON array of ResourceId
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

### levels

```sql
CREATE TABLE levels (
  id       TEXT PRIMARY KEY,
  save_id  TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  depth    INTEGER NOT NULL,
  entry_x  INTEGER NOT NULL,
  entry_y  INTEGER NOT NULL
);
```

### chunks

```sql
CREATE TABLE chunks (
  id        TEXT PRIMARY KEY,   -- "{levelId}:{chunkX}:{chunkY}"
  level_id  TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  chunk_x   INTEGER NOT NULL,
  chunk_y   INTEGER NOT NULL,
  generated_at INTEGER NOT NULL
);
```

### cells

```sql
CREATE TABLE cells (
  id          TEXT PRIMARY KEY,  -- "{levelId}:{x}:{y}"
  level_id    TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  x           INTEGER NOT NULL,
  y           INTEGER NOT NULL,
  kind        TEXT NOT NULL,     -- empty | deposit | obstacle | stairs_area
  visibility  TEXT NOT NULL,     -- unknown | scouted
  reachable   INTEGER NOT NULL,  -- 0 | 1
  work_progress REAL NOT NULL DEFAULT 0
);
```

### cell_components

```sql
CREATE TABLE cell_components (
  id             TEXT PRIMARY KEY,
  cell_id        TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,    -- rock | resource
  resource_id    TEXT,             -- NULL for rock
  initial_amount REAL NOT NULL,
  remaining_amount REAL NOT NULL,
  ratio          REAL NOT NULL
);
```

### workers

```sql
CREATE TABLE workers (
  id        TEXT PRIMARY KEY,
  save_id   TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  level     INTEGER NOT NULL,
  state     TEXT NOT NULL,         -- idle | working | blocked_by_storage
  level_id  TEXT,                  -- NULL if idle
  position_x INTEGER,
  position_y INTEGER,
  target_cell_x INTEGER,
  target_cell_y INTEGER
);
```

### storages

```sql
CREATE TABLE storages (
  id           TEXT PRIMARY KEY,
  save_id      TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  resource_id  TEXT NOT NULL,
  level        INTEGER NOT NULL DEFAULT 1,
  capacity     REAL NOT NULL,
  stored_amount REAL NOT NULL DEFAULT 0
);
```

### orders

```sql
CREATE TABLE orders (
  id             TEXT PRIMARY KEY,
  save_id        TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  reward_money   INTEGER NOT NULL,
  state          TEXT NOT NULL,    -- available | accepted | completed | expired | declined
  expires_at_tick INTEGER NOT NULL,
  priority       INTEGER NOT NULL DEFAULT 0
);
```

### order_requirements

```sql
CREATE TABLE order_requirements (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  resource_id  TEXT NOT NULL,
  required_amount REAL NOT NULL,
  delivered_amount REAL NOT NULL DEFAULT 0
);
```

## Миграции

Миграции хранятся в `packages/persistence-sqlite/src/migrations/`.
Файлы именуются `0001_initial.sql`, `0002_...sql` и т.д.
Версия схемы хранится в таблице `schema_version`.

## Правила

- JSON допускается только для `unlocked_resources` в таблице `saves` (простой массив строк).
- Всё остальное состояние — в отдельных колонках и таблицах.
- При загрузке сохранения карта **не пересоздаётся** — используются данные из `chunks` и `cells`.
