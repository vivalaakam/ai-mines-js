# Engine API

Полный список команд (`apply`) и запросов (`read`) игрового движка.

## Интерфейс

```ts
interface GameEngine {
  apply(command: EngineCommand): ApplyResult;
  read(query: EngineQuery): ReadResult;
  exportState(): EngineState;
}

class GameEngineFactory {
  static createNew(config: NewGameConfig): GameEngine;
  static createFromState(state: EngineState): GameEngine;
}
```

### ApplyResult

```ts
type ApplyResult = { ok: true; events: EngineEvent[] } | { ok: false; error: EngineError };
```

### EngineEvent

```ts
type EngineEvent =
  | { type: 'autosave_requested'; reason: 'shift_completed' | 'manual' }
  | { type: 'shift_completed'; shiftNumber: number }
  | { type: 'cell_cleared'; levelId: LevelId; cellX: number; cellY: number }
  | { type: 'stairs_discovered'; levelId: LevelId }
  | { type: 'level_unlocked'; levelId: LevelId }
  | { type: 'order_expired'; orderId: OrderId }
  | { type: 'order_completed'; orderId: OrderId; rewardMoney: number };
```

---

## Команды (apply)

### Время

#### tick

```ts
{
  type: 'tick';
  ticksPassed: number;
}
```

Продвигает игровое время. Если `ticksPassed` превышает остаток текущей смены,
engine обрабатывает только остаток, завершает смену и возвращает `remainingTicks` в events.
Доступна только в фазе `shift_running`.

#### fast_forward_to_shift_end

```ts
{
  type: 'fast_forward_to_shift_end';
}
```

Обрабатывает все оставшиеся тики текущей смены, переходит в `shift_planning`.
Доступна только в фазе `shift_running`.

#### start_next_shift

```ts
{
  type: 'start_next_shift';
}
```

Начинает следующую смену, переходит в `shift_running`.
Доступна только в фазе `shift_planning`.

---

### Работники

#### assign_worker

```ts
{
  type: 'assign_worker';
  workerId: WorkerId;
  levelId: LevelId;
  targetCellX: number;
  targetCellY: number;
  positionX: number;
  positionY: number;
}
```

Назначает работника на разработку клетки (`targetCell`).
Работник занимает соседнюю открытую достижимую клетку (`position`).
Валидация: position должна быть смежна с targetCell и достижима от входа уровня.

#### unassign_worker

```ts
{
  type: 'unassign_worker';
  workerId: WorkerId;
}
```

Снимает работника с задачи. Прогресс клетки сохраняется.

#### buy_worker

```ts
{
  type: 'buy_worker';
  level: number;
}
```

Покупает работника указанного уровня за деньги.
Доступна только в `shift_planning`. Уровень ограничен `maxPurchasableWorkerLevel`.

#### merge_workers

```ts
{
  type: 'merge_workers';
  workerIdA: WorkerId;
  workerIdB: WorkerId;
}
```

Объединяет двух свободных работников одного уровня в одного следующего уровня.
Доступна только в `shift_planning`.

---

### Склады

#### buy_storage

```ts
{
  type: 'buy_storage';
  resourceId: ResourceId;
}
```

Покупает новый склад для ресурса. Доступна только в `shift_planning`.

#### upgrade_storage

```ts
{
  type: 'upgrade_storage';
  storageId: StorageId;
}
```

Улучшает склад (повышает вместимость). Доступна только в `shift_planning`.

---

### Заказы

#### accept_order

```ts
{
  type: 'accept_order';
  orderId: OrderId;
}
```

Принимает заказ. Если ресурсов достаточно — выполняется немедленно.
Иначе переходит в `accepted` (нельзя отменить). Доступна только в `shift_planning`.

#### decline_order

```ts
{
  type: 'decline_order';
  orderId: OrderId;
}
```

Отклоняет заказ в статусе `available`. Доступна только в `shift_planning`.

#### set_order_priority

```ts
{
  type: 'set_order_priority';
  orderId: OrderId;
  priority: number;
}
```

Устанавливает приоритет распределения ресурсов. Доступна только в `shift_planning`.

---

### Сохранение

#### save_game

```ts
{
  type: 'save_game';
}
```

Инициирует ручное сохранение. Engine возвращает event `autosave_requested` с `reason: 'manual'`.
Application layer вызывает persistence adapter.

---

## Запросы (read)

### Карта

#### get_level_view

```ts
{
  type: 'get_level_view';
  levelId: LevelId;
  viewX: number;
  viewY: number;
  viewW: number;
  viewH: number;
}
```

Возвращает данные клеток в заданной области для рендера.

```ts
{
  cells: CellView[][];
  reachableCells: Set<string>;   // "x,y"
  scoutedCells: Set<string>;
}
```

#### get_cell_detail

```ts
{
  type: 'get_cell_detail';
  levelId: LevelId;
  cellX: number;
  cellY: number;
}
```

Полная информация о клетке: тип, компоненты, прогресс, назначенные работники.

### Работники

#### get_workers

```ts
{
  type: 'get_workers';
}
```

Список всех работников с состоянием (`idle` / `working` / `blocked_by_storage`).

#### get_worker_costs

```ts
{
  type: 'get_worker_costs';
}
```

Стоимость покупки и максимальный доступный уровень для покупки.

### Склады

#### get_storages

```ts
{
  type: 'get_storages';
}
```

Список всех складов с текущим заполнением.

#### get_storage_costs

```ts
{
  type: 'get_storage_costs';
  resourceId: ResourceId;
}
```

Стоимость покупки и улучшения склада.

### Заказы

#### get_orders

```ts
{
  type: 'get_orders';
}
```

Список всех заказов с состоянием.

### Общее состояние

#### get_game_status

```ts
{
  type: 'get_game_status';
}
```

```ts
{
  phase: GamePhase;
  currentTick: number;
  currentShift: number;
  ticksRemainingInShift: number;
  money: number;
  unlockedResources: ResourceId[];
}
```
