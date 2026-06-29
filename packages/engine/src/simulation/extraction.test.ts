import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, storageId } from '@ai-mines/shared';
import type { ChunkId, LevelId } from '@ai-mines/shared';
import { GameEngineFactory } from '../GameEngine.js';
import type { LevelData, StorageData } from '../state/types.js';
import { workerCost } from '../workers/workerSystem.js';

// ---- helpers ----

function findValidAssignment(
  level: LevelData,
  chunkSize: number,
): { targetX: number; targetY: number; posX: number; posY: number } | null {
  const DIRS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  for (const chunk of level.chunks.values()) {
    for (const cell of chunk.cells) {
      if (cell.kind !== 'deposit' || cell.accessibility !== 'reachable') continue;
      for (const [dx, dy] of DIRS) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        const cx = Math.floor(nx / chunkSize);
        const cy = Math.floor(ny / chunkSize);
        const posChunk = level.chunks.get(`${level.id}:${cx}:${cy}` as ChunkId);
        if (!posChunk) continue;
        const posCell = posChunk.cells[(ny - cy * chunkSize) * chunkSize + (nx - cx * chunkSize)];
        if (posCell?.kind === 'empty' && posCell.accessibility === 'reachable') {
          return { targetX: cell.x, targetY: cell.y, posX: nx, posY: ny };
        }
      }
    }
  }
  return null;
}

/** Create engine, buy a worker, assign to first valid deposit cell, return engine + assignment. */
// ponytail: return type inferred, warning suppressed in favour of readability
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function engineWithWorker(seed = 'extract-test') {
  const money = workerCost(1, DEFAULT_BALANCE) + 100;
  const engine = GameEngineFactory.createNew({ seedPhrase: seed, startingMoney: money });
  engine.apply({ type: 'buy_worker', level: 1 });
  const worker = engine.read({ type: 'get_workers' }).workers[0];
  if (!worker) throw new Error('no worker');

  const state = engine.exportState();
  const level = state.levels.values().next().value as LevelData | undefined;
  if (!level) throw new Error('no level');

  const assignment = findValidAssignment(level, DEFAULT_BALANCE.chunkSize);
  if (!assignment) throw new Error('no valid assignment found');

  engine.apply({
    type: 'assign_worker',
    workerId: worker.id,
    levelId: level.id,
    targetCellX: assignment.targetX,
    targetCellY: assignment.targetY,
    positionX: assignment.posX,
    positionY: assignment.posY,
  });
  engine.apply({ type: 'start_next_shift' });

  return { engine, worker, level: level.id as LevelId, assignment };
}

// ---- Tests ----

describe('extraction — workProgress advances', () => {
  it('workProgress increases after ticking', () => {
    const { engine, level, assignment } = engineWithWorker();
    engine.apply({ type: 'tick', ticksPassed: 10 });

    const state = engine.exportState();
    const levelData = state.levels.get(level);
    const chunkSize = DEFAULT_BALANCE.chunkSize;
    const cx = Math.floor(assignment.targetX / chunkSize);
    const cy = Math.floor(assignment.targetY / chunkSize);
    const chunk = levelData?.chunks.get(`${levelData.id}:${cx}:${cy}` as ChunkId);
    const cell =
      chunk?.cells[
        (assignment.targetY - cy * chunkSize) * chunkSize + (assignment.targetX - cx * chunkSize)
      ];

    expect(cell?.workProgress).toBeGreaterThan(0);
  });
});

describe('extraction — rock depletes without storage', () => {
  it('rock component remainingAmount decreases after many ticks (no storage)', () => {
    const { engine, level, assignment } = engineWithWorker();
    // Tick many times — only rock mines (no storage for resources)
    engine.apply({ type: 'tick', ticksPassed: 50 });

    const state = engine.exportState();
    const levelData = state.levels.get(level);
    const chunkSize = DEFAULT_BALANCE.chunkSize;
    const cx = Math.floor(assignment.targetX / chunkSize);
    const cy = Math.floor(assignment.targetY / chunkSize);
    const chunk = levelData?.chunks.get(`${levelData.id}:${cx}:${cy}` as ChunkId);
    const cell =
      chunk?.cells[
        (assignment.targetY - cy * chunkSize) * chunkSize + (assignment.targetX - cx * chunkSize)
      ];

    // Rock component (type='rock') should have decreased
    const rock = cell?.components.find((c) => c.type === 'rock');
    expect(rock?.remainingAmount).toBeLessThan(rock?.initialAmount ?? 0);
  });
});

describe('extraction — resources go to storage', () => {
  it('stored amount increases when resource storage exists', () => {
    const money = workerCost(1, DEFAULT_BALANCE) + 500;
    const engine = GameEngineFactory.createNew({
      seedPhrase: 'storage-test',
      startingMoney: money,
    });
    engine.apply({ type: 'buy_worker', level: 1 });

    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const assignment = findValidAssignment(level, DEFAULT_BALANCE.chunkSize);
    if (!assignment) return;

    // Directly inject a storage with large capacity for the first resource in target cell
    const chunkSize = DEFAULT_BALANCE.chunkSize;
    const cx = Math.floor(assignment.targetX / chunkSize);
    const cy = Math.floor(assignment.targetY / chunkSize);
    const chunk = level.chunks.get(`${level.id}:${cx}:${cy}` as ChunkId);
    const targetCell =
      chunk?.cells[
        (assignment.targetY - cy * chunkSize) * chunkSize + (assignment.targetX - cx * chunkSize)
      ];
    const resComp = targetCell?.components.find((c) => c.type === 'resource');
    if (!resComp?.resourceId) return; // cell has no resource component — skip

    const sid = storageId('test-storage-1');
    const storage: StorageData = {
      id: sid,
      resourceId: resComp.resourceId,
      level: 1,
      capacity: 9999,
      storedAmount: 0,
    };
    state.storages.set(sid, storage);

    const worker = engine.read({ type: 'get_workers' }).workers[0];
    if (!worker) return;

    engine.apply({
      type: 'assign_worker',
      workerId: worker.id,
      levelId: level.id,
      targetCellX: assignment.targetX,
      targetCellY: assignment.targetY,
      positionX: assignment.posX,
      positionY: assignment.posY,
    });
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'tick', ticksPassed: 50 });

    const afterState = engine.exportState();
    const afterStorage = afterState.storages.get(sid);
    expect(afterStorage?.storedAmount).toBeGreaterThan(0);
  });
});

describe('extraction — blocked_by_storage', () => {
  it('worker becomes blocked_by_storage when all resources full and rock depleted', () => {
    const money = workerCost(1, DEFAULT_BALANCE) + 500;
    const engine = GameEngineFactory.createNew({ seedPhrase: 'block-test', startingMoney: money });
    engine.apply({ type: 'buy_worker', level: 1 });

    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const assignment = findValidAssignment(level, DEFAULT_BALANCE.chunkSize);
    if (!assignment) return;

    const chunkSize = DEFAULT_BALANCE.chunkSize;
    const cx = Math.floor(assignment.targetX / chunkSize);
    const cy = Math.floor(assignment.targetY / chunkSize);
    const chunk = level.chunks.get(`${level.id}:${cx}:${cy}` as ChunkId);
    const targetCell =
      chunk?.cells[
        (assignment.targetY - cy * chunkSize) * chunkSize + (assignment.targetX - cx * chunkSize)
      ];
    const resComp = targetCell?.components.find((c) => c.type === 'resource');
    if (!resComp?.resourceId) return;

    // Full storage (capacity = storedAmount) for the resource
    const sid = storageId('full-storage');
    const fullStorage: StorageData = {
      id: sid,
      resourceId: resComp.resourceId,
      level: 1,
      capacity: 100,
      storedAmount: 100, // full
    };
    state.storages.set(sid, fullStorage);

    // Force rock to 0 so only blocked resource remains
    if (targetCell) {
      const rockComp = targetCell.components.find((c) => c.type === 'rock');
      if (rockComp) rockComp.remainingAmount = 0;
    }

    const worker = engine.read({ type: 'get_workers' }).workers[0];
    if (!worker) return;

    engine.apply({
      type: 'assign_worker',
      workerId: worker.id,
      levelId: level.id,
      targetCellX: assignment.targetX,
      targetCellY: assignment.targetY,
      positionX: assignment.posX,
      positionY: assignment.posY,
    });
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'tick', ticksPassed: 1 });

    const workerAfter = engine.read({ type: 'get_workers' }).workers[0];
    expect(workerAfter?.state).toBe('blocked_by_storage');
  });
});

describe('extraction — cell_cleared event', () => {
  it('emits cell_cleared when all components reach 0', () => {
    const money = workerCost(1, DEFAULT_BALANCE) + 500;
    const engine = GameEngineFactory.createNew({ seedPhrase: 'clear-test', startingMoney: money });
    engine.apply({ type: 'buy_worker', level: 1 });

    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const assignment = findValidAssignment(level, DEFAULT_BALANCE.chunkSize);
    if (!assignment) return;

    // Zero out all component amounts so the cell clears on first tick
    const chunkSize = DEFAULT_BALANCE.chunkSize;
    const cx = Math.floor(assignment.targetX / chunkSize);
    const cy = Math.floor(assignment.targetY / chunkSize);
    const chunk = level.chunks.get(`${level.id}:${cx}:${cy}` as ChunkId);
    const targetCell =
      chunk?.cells[
        (assignment.targetY - cy * chunkSize) * chunkSize + (assignment.targetX - cx * chunkSize)
      ];
    if (targetCell) {
      // resource comps → already gone; rock → tiny bit so extraction finishes on first tick
      for (const comp of targetCell.components) {
        comp.remainingAmount = comp.type === 'rock' ? 0.001 : 0;
      }
    }

    const worker = engine.read({ type: 'get_workers' }).workers[0];
    if (!worker) return;

    engine.apply({
      type: 'assign_worker',
      workerId: worker.id,
      levelId: level.id,
      targetCellX: assignment.targetX,
      targetCellY: assignment.targetY,
      positionX: assignment.posX,
      positionY: assignment.posY,
    });
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'tick', ticksPassed: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cleared = result.events.find((e) => e.type === 'cell_cleared');
    expect(cleared).toBeDefined();

    // Worker should be idle after clearing
    const workerAfter = engine.read({ type: 'get_workers' }).workers[0];
    expect(workerAfter?.state).toBe('idle');
  });
});

describe('extraction — fast_forward also extracts', () => {
  it('workProgress advances after fast_forward', () => {
    const { engine, level, assignment } = engineWithWorker('ff-test');
    const result = engine.apply({ type: 'fast_forward_to_shift_end' });
    expect(result.ok).toBe(true);

    const state = engine.exportState();
    const levelData = state.levels.get(level);
    const chunkSize = DEFAULT_BALANCE.chunkSize;
    const cx = Math.floor(assignment.targetX / chunkSize);
    const cy = Math.floor(assignment.targetY / chunkSize);
    const chunk = levelData?.chunks.get(`${levelData?.id}:${cx}:${cy}` as ChunkId);
    const cell =
      chunk?.cells[
        (assignment.targetY - cy * chunkSize) * chunkSize + (assignment.targetX - cx * chunkSize)
      ];
    // Either still deposit with progress, or already cleared
    const hasProgress =
      (cell?.kind === 'deposit' && (cell?.workProgress ?? 0) > 0) || cell?.kind === 'empty';
    expect(hasProgress).toBe(true);
  });
});
