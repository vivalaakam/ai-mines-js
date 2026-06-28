# Архитектура системы

## Слои

```
┌─────────────────────────────────────────────┐
│           apps/web-three                    │
│  render/ · ui/ · input/ · application/     │
│                                             │
│  engine.apply(command)                      │
│  engine.read(query)          ▲  только эти  │
└──────────────┬──────────────┘  два метода  │
               │                              │
┌──────────────▼──────────────┐              │
│        packages/engine       │              │
│  GameEngine · commands/      │              │
│  queries/ · state/ ·         │              │
│  simulation/ · generation/   │              │
│  economy/ · workers/ ·       │              │
│  orders/ · storage/ · time/  │              │
└──────────────┬──────────────┘
               │ exportState() / createFromState()
┌──────────────▼──────────────┐
│  packages/persistence-sqlite │
│  SqliteSaveAdapter           │
│  migrations/ · repositories/ │
└─────────────────────────────┘
               │
┌──────────────▼──────────────┐
│        packages/shared       │
│  ids · types · errors        │
└─────────────────────────────┘
```

## Правила слоёв

- **Engine** — единственный источник истины об игровом состоянии. Не зависит от Three.js, DOM, SQLite.
- **Render/UI** — только отображение и ввод. Не хранит авторитетное состояние. Не мутирует состояние напрямую.
- **Persistence** — адаптер между `EngineState` и SQLite. Вызывается application layer, не engine.
- **Shared** — типы без логики. Импортируется всеми пакетами.

## Модель взаимодействия

```
User Input
    │
    ▼
Input Handler (web-three)
    │
    │  engine.apply(command)
    ▼
GameEngine.apply()
    │ validates command
    │ mutates state
    │ returns ApplyResult + events[]
    ▼
Application Layer (web-three)
    │ handles events (autosave_requested → persistence)
    │ triggers re-render
    ▼
Render Layer
    │  engine.read(query)
    ▼
GameEngine.read()
    │ returns view data (no mutation)
    ▼
Three.js Scene Update
```

## Модель времени

- 1 tick = 1 секунда игрового времени
- 1 смена = 300 тиков (5 минут)
- Время движется только через `apply({ type: "tick", ticksPassed })`
- `read` никогда не меняет состояние

### Фазы игры

```
shift_running  ──── tick/fast_forward ────►  shift_planning
                                                   │
                                                   │ start_next_shift
                                                   ▼
                                             shift_running
```

В `shift_planning`: покупки, merge, заказы, распределение работников, сохранение.
В `shift_running`: только наблюдение, tick, fast-forward.

## Структура директорий

```
/
├── AGENTS.md                  # правила для агентов
├── TASKS.md                   # план работ
├── docs/                      # документация
├── packages/
│   ├── shared/                # общие типы
│   ├── engine/                # игровая логика
│   │   └── src/
│   │       ├── GameEngine.ts
│   │       ├── commands/
│   │       ├── queries/
│   │       ├── state/
│   │       ├── simulation/
│   │       ├── generation/
│   │       ├── economy/
│   │       ├── workers/
│   │       ├── orders/
│   │       ├── storage/
│   │       └── time/
│   └── persistence-sqlite/    # SQLite adapter
│       └── src/
│           ├── SqliteSaveAdapter.ts
│           ├── migrations/
│           └── repositories/
└── apps/
    └── web-three/             # Three.js UI
        └── src/
            ├── main.ts
            ├── render/
            ├── ui/
            ├── input/
            └── application/
```
