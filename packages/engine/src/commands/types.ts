import type { LevelId, OrderId, ResourceId, StorageId, WorkerId } from '@ai-mines/shared';

export type EngineCommand =
  | TickCommand
  | FastForwardCommand
  | StartNextShiftCommand
  | AssignWorkerCommand
  | UnassignWorkerCommand
  | BuyWorkerCommand
  | MergeWorkersCommand
  | BuyStorageCommand
  | SetStorageResourceCommand
  | UpgradeStorageCommand
  | AcceptOrderCommand
  | DeclineOrderCommand
  | SetOrderPriorityCommand
  | SaveGameCommand;

export interface TickCommand {
  readonly type: 'tick';
  readonly ticksPassed: number;
}

export interface FastForwardCommand {
  readonly type: 'fast_forward_to_shift_end';
}

export interface StartNextShiftCommand {
  readonly type: 'start_next_shift';
}

export interface AssignWorkerCommand {
  readonly type: 'assign_worker';
  readonly workerId: WorkerId;
  readonly levelId: LevelId;
  readonly targetCellX: number;
  readonly targetCellY: number;
  readonly positionX: number;
  readonly positionY: number;
}

export interface UnassignWorkerCommand {
  readonly type: 'unassign_worker';
  readonly workerId: WorkerId;
}

export interface BuyWorkerCommand {
  readonly type: 'buy_worker';
  readonly level: number;
}

export interface MergeWorkersCommand {
  readonly type: 'merge_workers';
  readonly workerIdA: WorkerId;
  readonly workerIdB: WorkerId;
}

export interface BuyStorageCommand {
  readonly type: 'buy_storage';
}

export interface SetStorageResourceCommand {
  readonly type: 'set_storage_resource';
  readonly storageId: StorageId;
  readonly resourceId: ResourceId;
}

export interface UpgradeStorageCommand {
  readonly type: 'upgrade_storage';
  readonly storageId: StorageId;
}

export interface AcceptOrderCommand {
  readonly type: 'accept_order';
  readonly orderId: OrderId;
}

export interface DeclineOrderCommand {
  readonly type: 'decline_order';
  readonly orderId: OrderId;
}

export interface SetOrderPriorityCommand {
  readonly type: 'set_order_priority';
  readonly orderId: OrderId;
  readonly priority: number;
}

export interface SaveGameCommand {
  readonly type: 'save_game';
}
