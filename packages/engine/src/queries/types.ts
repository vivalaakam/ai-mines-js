import type {
  CellAccessibility,
  CellComponent,
  CellKind,
  CellVisibility,
  GamePhase,
  OrderAllocationMode,
  OrderState,
  ResourceId,
  WorkerState,
} from '@ai-mines/shared';
import type { LevelId, OrderId, ResourceDefinition, StorageId, WorkerId } from '@ai-mines/shared';

// --- Query types ---

export type EngineQuery =
  | GetLevelViewQuery
  | GetCellDetailQuery
  | GetWorkersQuery
  | GetWorkerCostsQuery
  | GetStoragesQuery
  | GetStorageCostsQuery
  | GetOrdersQuery
  | GetGameStatusQuery;

export interface GetLevelViewQuery {
  readonly type: 'get_level_view';
  readonly levelId: LevelId;
  readonly viewX: number;
  readonly viewY: number;
  readonly viewW: number;
  readonly viewH: number;
}

export interface GetCellDetailQuery {
  readonly type: 'get_cell_detail';
  readonly levelId: LevelId;
  readonly cellX: number;
  readonly cellY: number;
}

export interface GetWorkersQuery {
  readonly type: 'get_workers';
}

export interface GetWorkerCostsQuery {
  readonly type: 'get_worker_costs';
}

export interface GetStoragesQuery {
  readonly type: 'get_storages';
}

export interface GetStorageCostsQuery {
  readonly type: 'get_storage_costs';
  readonly resourceId: ResourceId;
}

export interface GetOrdersQuery {
  readonly type: 'get_orders';
}

export interface GetGameStatusQuery {
  readonly type: 'get_game_status';
}

// --- Result types ---

export interface CellView {
  readonly x: number;
  readonly y: number;
  readonly kind: CellKind;
  readonly visibility: CellVisibility;
  readonly accessibility: CellAccessibility;
  readonly workProgress: number;
  readonly workerCount: number;
}

export interface LevelViewResult {
  readonly type: 'get_level_view';
  readonly cells: CellView[][];
}

export interface CellDetailResult {
  readonly type: 'get_cell_detail';
  readonly x: number;
  readonly y: number;
  readonly kind: CellKind;
  readonly visibility: CellVisibility;
  readonly accessibility: CellAccessibility;
  readonly workProgress: number;
  readonly components: CellComponent[];
  readonly assignedWorkerIds: WorkerId[];
}

export interface WorkerView {
  readonly id: WorkerId;
  readonly level: number;
  readonly state: WorkerState;
  readonly levelId: LevelId | null;
  readonly positionX: number | null;
  readonly positionY: number | null;
  readonly targetCellX: number | null;
  readonly targetCellY: number | null;
}

export interface WorkersResult {
  readonly type: 'get_workers';
  readonly workers: WorkerView[];
}

export interface WorkerCostEntry {
  readonly level: number;
  readonly cost: number;
  readonly available: boolean;
}

export interface WorkerCostsResult {
  readonly type: 'get_worker_costs';
  readonly maxPurchasableLevel: number;
  readonly costs: WorkerCostEntry[];
}

export interface StorageView {
  readonly id: StorageId;
  readonly resource: ResourceDefinition;
  readonly level: number;
  readonly capacity: number;
  readonly storedAmount: number;
}

export interface StoragesResult {
  readonly type: 'get_storages';
  readonly storages: StorageView[];
}

export interface StorageCostsResult {
  readonly type: 'get_storage_costs';
  readonly resourceId: ResourceId;
  readonly buyNewCost: number;
  readonly upgradeCosts: { readonly storageId: StorageId; readonly cost: number }[];
}

export interface OrderRequirementView {
  readonly resourceId: ResourceId;
  readonly requiredAmount: number;
  readonly deliveredAmount: number;
}

export interface OrderView {
  readonly id: OrderId;
  readonly requirements: OrderRequirementView[];
  readonly rewardMoney: number;
  readonly state: OrderState;
  readonly expiresAtTick: number;
  readonly priority: number;
}

export interface OrdersResult {
  readonly type: 'get_orders';
  readonly orders: OrderView[];
}

export interface GameStatusResult {
  readonly type: 'get_game_status';
  readonly phase: GamePhase;
  readonly currentTick: number;
  readonly currentShift: number;
  readonly ticksRemainingInShift: number;
  readonly money: number;
  readonly unlockedResources: ResourceId[];
  readonly orderAllocationMode: OrderAllocationMode;
}

// --- Mapped result type ---

export type QueryResult<Q extends EngineQuery> = Q extends GetLevelViewQuery
  ? LevelViewResult
  : Q extends GetCellDetailQuery
    ? CellDetailResult
    : Q extends GetWorkersQuery
      ? WorkersResult
      : Q extends GetWorkerCostsQuery
        ? WorkerCostsResult
        : Q extends GetStoragesQuery
          ? StoragesResult
          : Q extends GetStorageCostsQuery
            ? StorageCostsResult
            : Q extends GetOrdersQuery
              ? OrdersResult
              : Q extends GetGameStatusQuery
                ? GameStatusResult
                : never;
