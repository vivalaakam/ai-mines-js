import type { ResourceId } from './ids.js';

// --- Cell ---

export type CellKind = 'empty' | 'deposit' | 'obstacle' | 'stairs_area';

export type CellVisibility = 'unknown' | 'scouted';

export type CellAccessibility = 'unreachable' | 'reachable';

export interface CellComponent {
  readonly type: 'rock' | 'resource';
  readonly resourceId: ResourceId | null;
  readonly ratio: number;
  readonly initialAmount: number;
  remainingAmount: number;
}

// --- Game phases ---

export type GamePhase = 'shift_running' | 'shift_planning';

// --- Workers ---

export type WorkerState = 'idle' | 'working' | 'blocked_by_storage';

// --- Orders ---

export type OrderState = 'available' | 'accepted' | 'completed' | 'expired' | 'declined';

export type OrderAllocationMode = 'priority_based' | 'proportional';

// --- Resources ---

export type ResourceRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ResourceDefinition {
  readonly id: ResourceId;
  readonly name: string;
  readonly minDepth: number;
  readonly rarity: ResourceRarity;
}

// --- Balance config ---

export interface BalanceConfig {
  readonly ticksPerShift: number;
  readonly baseLevelSize: number;
  readonly levelSizeMultiplier: number;
  readonly maxLevelSize: number;
  readonly distanceCostMultiplier: number;
  readonly scoutRadius: number;
  readonly chunkSize: number;
  readonly initialChunkRadius: number;
  readonly maxWorkersPerCell: number;
  readonly workerLevelUnlockOffset: number;
  readonly orderAllocationMode: OrderAllocationMode;
  readonly allowWorkerReassignmentDuringShift: boolean;
}

export const DEFAULT_BALANCE: BalanceConfig = {
  ticksPerShift: 300,
  baseLevelSize: 100,
  levelSizeMultiplier: 1.1,
  maxLevelSize: 500,
  distanceCostMultiplier: 1.01,
  scoutRadius: 5,
  chunkSize: 32,
  initialChunkRadius: 2,
  maxWorkersPerCell: 4,
  workerLevelUnlockOffset: 2,
  orderAllocationMode: 'priority_based',
  allowWorkerReassignmentDuringShift: false,
};
