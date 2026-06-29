import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '@ai-mines/shared';
import type { ChunkId, LevelId, WorkerId } from '@ai-mines/shared';
import { GameEngineFactory } from '../GameEngine.js';
import type { LevelData } from '../state/types.js';
import { maxPurchasableWorkerLevel, workerCost, workerSpeed } from './workerSystem.js';

// ---- Formula tests ----

describe('workerCost', () => {
  it('level 1 costs workerBaseCost', () => {
    expect(workerCost(1, DEFAULT_BALANCE)).toBe(DEFAULT_BALANCE.workerBaseCost);
  });

  it('level 2 costs workerBaseCost * workerCostMultiplier', () => {
    expect(workerCost(2, DEFAULT_BALANCE)).toBe(
      Math.round(DEFAULT_BALANCE.workerBaseCost * DEFAULT_BALANCE.workerCostMultiplier),
    );
  });

  it('cost increases with level', () => {
    expect(workerCost(3, DEFAULT_BALANCE)).toBeGreaterThan(workerCost(2, DEFAULT_BALANCE));
  });
});

describe('workerSpeed', () => {
  it('level 1 speed equals workerBaseSpeed', () => {
    expect(workerSpeed(1, DEFAULT_BALANCE)).toBe(DEFAULT_BALANCE.workerBaseSpeed);
  });

  it('speed increases with level', () => {
    expect(workerSpeed(2, DEFAULT_BALANCE)).toBeGreaterThan(workerSpeed(1, DEFAULT_BALANCE));
  });
});

// ---- buy_worker ----

describe('buy_worker', () => {
  it('buys a level-1 worker in shift_planning', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const result = engine.apply({ type: 'buy_worker', level: 1 });
    expect(result.ok).toBe(true);
    const { workers } = engine.read({ type: 'get_workers' });
    expect(workers).toHaveLength(1);
    expect(workers[0]?.level).toBe(1);
    expect(workers[0]?.state).toBe('idle');
  });

  it('deducts money', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    engine.apply({ type: 'buy_worker', level: 1 });
    expect(engine.read({ type: 'get_game_status' }).money).toBe(
      1000 - workerCost(1, DEFAULT_BALANCE),
    );
  });

  it('fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'buy_worker', level: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });

  it('fails if level > maxPurchasableLevel', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 9999 });
    const result = engine.apply({ type: 'buy_worker', level: 2 }); // no workers → max=1
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WORKER_LEVEL_NOT_PURCHASABLE');
  });

  it('fails with insufficient funds', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1 });
    const result = engine.apply({ type: 'buy_worker', level: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('maxPurchasableLevel = max(1, highest - offset)', () => {
    // With no workers: max(1, 0-2) = 1
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 9999 });
    const state = engine.exportState();
    expect(maxPurchasableWorkerLevel(state, DEFAULT_BALANCE)).toBe(1);
  });
});

// ---- merge_workers ----

describe('merge_workers', () => {
  it('merges two idle level-1 workers into one level-2 worker', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const { workers } = engine.read({ type: 'get_workers' });
    const wA = workers[0];
    const wB = workers[1];
    expect(wA).toBeDefined();
    expect(wB).toBeDefined();
    if (!wA || !wB) return;
    const result = engine.apply({ type: 'merge_workers', workerIdA: wA.id, workerIdB: wB.id });
    expect(result.ok).toBe(true);
    const merged = engine.read({ type: 'get_workers' }).workers;
    expect(merged).toHaveLength(1);
    expect(merged[0]?.level).toBe(2);
  });

  it('fails if levels differ', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    engine.apply({ type: 'buy_worker', level: 1 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const before = engine.read({ type: 'get_workers' }).workers;
    const w0 = before[0];
    const w1 = before[1];
    const w2 = before[2];
    if (!w0 || !w1 || !w2) return;
    // Merge first two → level-2
    engine.apply({ type: 'merge_workers', workerIdA: w0.id, workerIdB: w1.id });
    // Now level-2 + level-1 → mismatch
    const after = engine.read({ type: 'get_workers' }).workers;
    const lvl2 = after.find((w) => w.level === 2);
    const lvl1 = after.find((w) => w.level === 1);
    if (!lvl2 || !lvl1) return;
    const result = engine.apply({ type: 'merge_workers', workerIdA: lvl2.id, workerIdB: lvl1.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WORKER_LEVEL_MISMATCH');
  });

  it('fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const { workers } = engine.read({ type: 'get_workers' });
    const wA = workers[0];
    const wB = workers[1];
    if (!wA || !wB) return;
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'merge_workers', workerIdA: wA.id, workerIdB: wB.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });

  it('fails if worker not found', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const w = engine.read({ type: 'get_workers' }).workers[0];
    if (!w) return;
    const result = engine.apply({
      type: 'merge_workers',
      workerIdA: w.id,
      workerIdB: 'nonexistent' as WorkerId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WORKER_NOT_FOUND');
  });
});

// ---- assign_worker / unassign_worker ----

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

describe('assign_worker / unassign_worker', () => {
  it('assigns a worker to a deposit cell', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'assign-test', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const worker = engine.read({ type: 'get_workers' }).workers[0];
    expect(worker).toBeDefined();
    if (!worker) return;
    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const assignment = findValidAssignment(level, DEFAULT_BALANCE.chunkSize);
    expect(assignment).not.toBeNull();
    if (!assignment) return;
    const result = engine.apply({
      type: 'assign_worker',
      workerId: worker.id,
      levelId: level.id,
      targetCellX: assignment.targetX,
      targetCellY: assignment.targetY,
      positionX: assignment.posX,
      positionY: assignment.posY,
    });
    expect(result.ok).toBe(true);
    const updated = engine.read({ type: 'get_workers' }).workers[0];
    expect(updated?.state).toBe('working');
    expect(updated?.targetCellX).toBe(assignment.targetX);
  });

  it('unassigns a working worker back to idle', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'assign-test', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const worker = engine.read({ type: 'get_workers' }).workers[0];
    if (!worker) return;
    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const assignment = findValidAssignment(level, DEFAULT_BALANCE.chunkSize);
    if (!assignment) return;
    engine.apply({
      type: 'assign_worker',
      workerId: worker.id,
      levelId: level.id,
      targetCellX: assignment.targetX,
      targetCellY: assignment.targetY,
      positionX: assignment.posX,
      positionY: assignment.posY,
    });
    const unresult = engine.apply({ type: 'unassign_worker', workerId: worker.id });
    expect(unresult.ok).toBe(true);
    expect(engine.read({ type: 'get_workers' }).workers[0]?.state).toBe('idle');
  });

  it('fails to assign to non-deposit (empty) cell', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'assign-test', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const worker = engine.read({ type: 'get_workers' }).workers[0];
    if (!worker) return;
    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    // Entry (16,16) is empty → invalid target
    const result = engine.apply({
      type: 'assign_worker',
      workerId: worker.id,
      levelId: level.id as LevelId,
      targetCellX: level.entryX,
      targetCellY: level.entryY,
      positionX: level.entryX + 1,
      positionY: level.entryY,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CELL_NOT_DEPOSIT');
  });

  it('fails if position is not adjacent', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'assign-test', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const worker = engine.read({ type: 'get_workers' }).workers[0];
    if (!worker) return;
    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const assignment = findValidAssignment(level, DEFAULT_BALANCE.chunkSize);
    if (!assignment) return;
    const result = engine.apply({
      type: 'assign_worker',
      workerId: worker.id,
      levelId: level.id,
      targetCellX: assignment.targetX,
      targetCellY: assignment.targetY,
      positionX: assignment.targetX + 5, // not adjacent
      positionY: assignment.targetY,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WORKER_POSITION_NOT_ADJACENT');
  });

  it('fails if position already occupied by another worker', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'assign-test', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const workers = engine.read({ type: 'get_workers' }).workers;
    const wA = workers[0];
    const wB = workers[1];
    if (!wA || !wB) return;
    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const assignment = findValidAssignment(level, DEFAULT_BALANCE.chunkSize);
    if (!assignment) return;
    engine.apply({
      type: 'assign_worker',
      workerId: wA.id,
      levelId: level.id,
      targetCellX: assignment.targetX,
      targetCellY: assignment.targetY,
      positionX: assignment.posX,
      positionY: assignment.posY,
    });
    const result = engine.apply({
      type: 'assign_worker',
      workerId: wB.id,
      levelId: level.id,
      targetCellX: assignment.targetX,
      targetCellY: assignment.targetY,
      positionX: assignment.posX, // same position
      positionY: assignment.posY,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WORKER_POSITION_OCCUPIED');
  });
});

// ---- get_worker_costs ----

describe('get_worker_costs', () => {
  it('maxPurchasableLevel = 1 with no workers', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const costs = engine.read({ type: 'get_worker_costs' });
    expect(costs.maxPurchasableLevel).toBe(1);
    expect(costs.costs).toHaveLength(1);
    expect(costs.costs[0]?.level).toBe(1);
    expect(costs.costs[0]?.cost).toBe(workerCost(1, DEFAULT_BALANCE));
  });

  it('marks level unavailable when funds are insufficient', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1 });
    const costs = engine.read({ type: 'get_worker_costs' });
    expect(costs.costs[0]?.available).toBe(false);
  });
});
