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
  /** Base ticks required to fully mine depth-0 cell at distance 0 */
  readonly baseLaborPerDepth: number;
  /** Multiplier applied based on highest-rarity resource in deposit cell */
  readonly resourceModifiers: { readonly [K in ResourceRarity]: number };
  /** Cost of a level-1 worker in money */
  readonly workerBaseCost: number;
  /** Cost multiplier per worker level (cost = workerBaseCost * workerCostMultiplier^(level-1)) */
  readonly workerCostMultiplier: number;
  /** Mining speed of a level-1 worker (units/tick) */
  readonly workerBaseSpeed: number;
  /** Speed multiplier per worker level */
  readonly workerSpeedMultiplier: number;
  /** Cost to buy a new storage unit for any resource */
  readonly storageBaseCost: number;
  /** Upgrade cost multiplier per level (cost = storageBaseCost * storageUpgradeCostMultiplier^currentLevel) */
  readonly storageUpgradeCostMultiplier: number;
  /** Capacity of a level-1 storage unit */
  readonly storageBaseCapacity: number;
  /** Capacity multiplier per level (capacity = storageBaseCapacity * storageCapacityMultiplier^(level-1)) */
  readonly storageCapacityMultiplier: number;
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
  baseLaborPerDepth: 10,
  resourceModifiers: {
    common: 1.0,
    uncommon: 1.2,
    rare: 1.5,
    epic: 2.0,
    legendary: 3.0,
  },
  workerBaseCost: 50,
  workerCostMultiplier: 2.0,
  workerBaseSpeed: 1.0,
  workerSpeedMultiplier: 1.5,
  storageBaseCost: 100,
  storageUpgradeCostMultiplier: 2.0,
  storageBaseCapacity: 100,
  storageCapacityMultiplier: 2.0,
};
