import type {
  CellAccessibility,
  CellComponent,
  CellKind,
  CellVisibility,
  GamePhase,
  OrderAllocationMode,
  OrderState,
  WorkerState,
} from '@ai-mines/shared';
import type {
  ChunkId,
  LevelId,
  OrderId,
  ResourceId,
  SaveId,
  StorageId,
  WorkerId,
} from '@ai-mines/shared';

// --- Cell ---

export interface CellData {
  readonly x: number;
  readonly y: number;
  kind: CellKind;
  visibility: CellVisibility;
  accessibility: CellAccessibility;
  workProgress: number;
  components: CellComponent[];
  /** BFS distance from level entry; -1 = unreachable or not yet computed */
  distanceFromEntry: number;
}

// --- Chunk ---

export interface ChunkData {
  readonly id: ChunkId;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly generatedAt: number;
  cells: CellData[];
}

// --- Level ---

export interface LevelData {
  readonly id: LevelId;
  readonly depth: number;
  readonly entryX: number;
  readonly entryY: number;
  readonly stairsX: number;
  readonly stairsY: number;
  chunks: Map<ChunkId, ChunkData>;
}

// --- Worker ---

export interface WorkerData {
  readonly id: WorkerId;
  readonly level: number;
  state: WorkerState;
  levelId: LevelId | null;
  positionX: number | null;
  positionY: number | null;
  targetCellX: number | null;
  targetCellY: number | null;
}

// --- Storage ---

export interface StorageData {
  readonly id: StorageId;
  readonly resourceId: ResourceId;
  level: number;
  capacity: number;
  storedAmount: number;
}

// --- Order ---

export interface OrderRequirementData {
  readonly resourceId: ResourceId;
  readonly requiredAmount: number;
  deliveredAmount: number;
}

export interface OrderData {
  readonly id: OrderId;
  requirements: OrderRequirementData[];
  readonly rewardMoney: number;
  state: OrderState;
  readonly expiresAtTick: number;
  priority: number;
}

// --- Root engine state ---

export interface EngineState {
  readonly saveId: SaveId;
  readonly seedPhrase: string;
  readonly generatorVersion: number;
  currentTick: number;
  currentShift: number;
  phase: GamePhase;
  money: number;
  unlockedResources: ResourceId[];
  readonly orderAllocationMode: OrderAllocationMode;
  readonly allowWorkerReassignmentDuringShift: boolean;
  levels: Map<LevelId, LevelData>;
  workers: Map<WorkerId, WorkerData>;
  storages: Map<StorageId, StorageData>;
  orders: Map<OrderId, OrderData>;
}

// --- New game config ---

export interface NewGameConfig {
  readonly seedPhrase: string;
  readonly generatorVersion?: number;
  readonly startingMoney?: number;
  /** Override any balance values. Falls back to DEFAULT_BALANCE for omitted fields. */
  readonly balance?: Partial<import('@ai-mines/shared').BalanceConfig>;
}
