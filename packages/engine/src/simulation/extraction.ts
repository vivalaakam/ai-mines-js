import type { BalanceConfig, ResourceId } from '@ai-mines/shared';
import { chunkId } from '@ai-mines/shared';
import { markExtractedIfDone } from './cellExtraction.js';
import { computeLaborCost } from '../map/laborCost.js';
import { updateVisibility } from '../map/visibility.js';
import { workerSpeed } from '../workers/workerSystem.js';
import type { CellData, EngineState, LevelData, WorkerData } from '../state/types.js';
import type { EngineEvent } from '../events/types.js';

// ---- Storage helpers ----

function storageAvailable(state: EngineState, resourceId: ResourceId): number {
  let available = 0;
  for (const s of state.storages.values()) {
    if (s.resourceId === resourceId) available += s.capacity - s.storedAmount;
  }
  return Math.max(0, available);
}

function addToStorage(state: EngineState, resourceId: ResourceId, amount: number): void {
  for (const s of state.storages.values()) {
    if (s.resourceId !== resourceId) continue;
    const space = s.capacity - s.storedAmount;
    const toAdd = Math.min(amount, space);
    s.storedAmount += toAdd;
    amount -= toAdd;
    if (amount <= 0) break;
  }
}

// ---- Cell lookup ----

function cellAt(level: LevelData, x: number, y: number, chunkSize: number): CellData | undefined {
  const cx = Math.floor(x / chunkSize);
  const cy = Math.floor(y / chunkSize);
  const chunk = level.chunks.get(chunkId(level.id, cx, cy));
  if (!chunk) return undefined;
  return chunk.cells[(y - cy * chunkSize) * chunkSize + (x - cx * chunkSize)];
}

// ---- Per-cell extraction ----

function extractFromCell(
  state: EngineState,
  balance: BalanceConfig,
  level: LevelData,
  workers: WorkerData[],
  targetX: number,
  targetY: number,
  ticks: number,
): boolean {
  const cell = cellAt(level, targetX, targetY, balance.chunkSize);
  if (!cell || cell.kind !== 'deposit') return false;

  const labor = computeLaborCost(cell, level.depth, balance);
  if (labor <= 0) return false;

  const totalWork = workers.reduce((s, w) => s + workerSpeed(w.level, balance), 0) * ticks;
  const totalInitialAmt = cell.components.reduce((s, c) => s + c.initialAmount, 0);
  const miningFactor = totalInitialAmt / labor;

  const extractable = cell.components.filter(
    (c) =>
      c.remainingAmount > 0 &&
      (c.type === 'rock' || (c.resourceId !== null && storageAvailable(state, c.resourceId) > 0)),
  );
  const anyBlocked = cell.components.some(
    (c) =>
      c.remainingAmount > 0 &&
      c.type === 'resource' &&
      (c.resourceId === null || storageAvailable(state, c.resourceId) <= 0),
  );

  if (extractable.length === 0 && anyBlocked) {
    for (const w of workers) w.state = 'blocked_by_storage';
    return false;
  }

  // Restore blocked workers that now have extractable components
  for (const w of workers) {
    if (w.state === 'blocked_by_storage') w.state = 'working';
  }

  const effectiveRatioSum = extractable.reduce((s, c) => s + c.ratio, 0);
  if (effectiveRatioSum <= 0) return false;

  for (const comp of extractable) {
    const toExtract = totalWork * miningFactor * (comp.ratio / effectiveRatioSum);
    let actual = Math.min(toExtract, comp.remainingAmount);

    if (comp.type === 'resource' && comp.resourceId !== null) {
      const available = storageAvailable(state, comp.resourceId);
      actual = Math.min(actual, available);
      if (actual > 0) addToStorage(state, comp.resourceId, actual);
    }

    comp.remainingAmount = Math.max(0, comp.remainingAmount - actual);
  }

  cell.workProgress += totalWork;

  return markExtractedIfDone(cell);
}

// ---- Main entry point ----

/**
 * Runs extraction for all assigned workers across all levels for `ticks` ticks.
 * Mutates state in-place. Returns EngineEvents for cleared cells.
 */
export function runExtraction(
  state: EngineState,
  balance: BalanceConfig,
  ticks: number,
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const clearedByLevel = new Set<LevelData>();

  // Group workers by level + target cell
  type CellKey = `${string}:${number}:${number}`;
  const groups = new Map<
    CellKey,
    { level: LevelData; workers: WorkerData[]; x: number; y: number }
  >();

  for (const worker of state.workers.values()) {
    if (worker.state === 'idle') continue;
    if (worker.levelId === null || worker.targetCellX === null || worker.targetCellY === null)
      continue;
    const level = state.levels.get(worker.levelId);
    if (!level) continue;
    const key: CellKey = `${worker.levelId}:${worker.targetCellX}:${worker.targetCellY}`;
    let group = groups.get(key);
    if (!group) {
      group = { level, workers: [], x: worker.targetCellX, y: worker.targetCellY };
      groups.set(key, group);
    }
    group.workers.push(worker);
  }

  for (const { level, workers, x, y } of groups.values()) {
    const cleared = extractFromCell(state, balance, level, workers, x, y, ticks);
    if (cleared) {
      // Workers on this cell become idle
      for (const w of workers) {
        w.state = 'idle';
        w.levelId = null;
        w.positionX = null;
        w.positionY = null;
        w.targetCellX = null;
        w.targetCellY = null;
      }
      events.push({ type: 'cell_cleared', levelId: level.id, cellX: x, cellY: y });
      clearedByLevel.add(level);
    }
  }

  // Update visibility for levels where cells were cleared
  const visParams = {
    seedPhrase: state.seedPhrase,
    generatorVersion: state.generatorVersion,
    chunkSize: balance.chunkSize,
  };
  for (const level of clearedByLevel) {
    updateVisibility(level, visParams, balance.scoutRadius);
  }

  return events;
}
