import { saveId } from '@ai-mines/shared';
import type { NewGameConfig, EngineState } from './types.js';

let _counter = 0;

function newSaveId(): ReturnType<typeof saveId> {
  return saveId(`save-${Date.now()}-${++_counter}`);
}

export function makeInitialState(config: NewGameConfig): EngineState {
  return {
    saveId: newSaveId(),
    seedPhrase: config.seedPhrase,
    generatorVersion: config.generatorVersion ?? 1,
    currentTick: 0,
    currentShift: 0,
    phase: 'shift_planning',
    money: config.startingMoney ?? 1000,
    unlockedResources: [],
    orderAllocationMode: config.orderAllocationMode ?? 'priority_based',
    allowWorkerReassignmentDuringShift: config.allowWorkerReassignmentDuringShift ?? false,
    levels: new Map(),
    workers: new Map(),
    storages: new Map(),
    orders: new Map(),
  };
}
