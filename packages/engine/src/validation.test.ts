/**
 * T-016: Command validation — phase guards, cell occupancy, reachability.
 * Consolidates cross-cutting validation tests.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, resourceId } from '@ai-mines/shared';
import type { ChunkId, OrderId, StorageId, WorkerId } from '@ai-mines/shared';
import { GameEngineFactory } from './GameEngine.js';
import type { LevelData } from './state/types.js';

const STONE = resourceId('stone');

// ---- helpers ----

function findDeposit(
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
        const pc = posChunk.cells[(ny - cy * chunkSize) * chunkSize + (nx - cx * chunkSize)];
        if (pc?.kind === 'empty' && pc.accessibility === 'reachable') {
          return { targetX: cell.x, targetY: cell.y, posX: nx, posY: ny };
        }
      }
    }
  }
  return null;
}

// ---- Phase guards ----

describe('phase guards — shift_running blocks planning commands', () => {
  it('buy_worker fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'start_next_shift' });
    const r = engine.apply({ type: 'buy_worker', level: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WRONG_PHASE');
  });

  it('merge_workers fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const ws = engine.read({ type: 'get_workers' }).workers;
    const idA = ws[0]?.id;
    const idB = ws[1]?.id;
    if (!idA || !idB) return;
    engine.apply({ type: 'start_next_shift' });
    const r = engine.apply({ type: 'merge_workers', workerIdA: idA, workerIdB: idB });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WRONG_PHASE');
  });

  it('buy_storage fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'start_next_shift' });
    const r = engine.apply({ type: 'buy_storage' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WRONG_PHASE');
  });

  it('upgrade_storage fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'buy_storage' });
    const s = engine.read({ type: 'get_storages' }).storages[0];
    if (!s) return;
    engine.apply({ type: 'start_next_shift' });
    const r = engine.apply({ type: 'upgrade_storage', storageId: s.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WRONG_PHASE');
  });

  it('accept_order fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'start_next_shift' });
    const r = engine.apply({ type: 'accept_order', orderId: 'x' as OrderId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WRONG_PHASE');
  });

  it('tick fails in shift_planning', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    const r = engine.apply({ type: 'tick', ticksPassed: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WRONG_PHASE');
  });

  it('fast_forward fails in shift_planning', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    const r = engine.apply({ type: 'fast_forward_to_shift_end' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WRONG_PHASE');
  });

  it('start_next_shift fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'start_next_shift' });
    const r = engine.apply({ type: 'start_next_shift' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WRONG_PHASE');
  });
});

// ---- Worker self-merge ----

describe('merge_workers — self-merge is rejected', () => {
  it('cannot merge a worker with itself', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const w = engine.read({ type: 'get_workers' }).workers[0];
    if (!w) return;
    const r = engine.apply({ type: 'merge_workers', workerIdA: w.id, workerIdB: w.id });
    expect(r.ok).toBe(false);
  });
});

// ---- assign_worker — cell and position validation ----

describe('assign_worker validations', () => {
  it('fails when level not found', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const w = engine.read({ type: 'get_workers' }).workers[0];
    if (!w) return;
    const r = engine.apply({
      type: 'assign_worker',
      workerId: w.id,
      levelId: 'nonexistent' as import('@ai-mines/shared').LevelId,
      targetCellX: 0,
      targetCellY: 0,
      positionX: 1,
      positionY: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('LEVEL_NOT_FOUND');
  });

  it('fails when target cell is not a deposit', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const w = engine.read({ type: 'get_workers' }).workers[0];
    if (!w) return;
    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const r = engine.apply({
      type: 'assign_worker',
      workerId: w.id,
      levelId: level.id,
      targetCellX: level.entryX,
      targetCellY: level.entryY,
      positionX: level.entryX + 1,
      positionY: level.entryY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CELL_NOT_DEPOSIT');
  });

  it('fails when position is not adjacent to target', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const w = engine.read({ type: 'get_workers' }).workers[0];
    if (!w) return;
    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const d = findDeposit(level, DEFAULT_BALANCE.chunkSize);
    if (!d) return;
    const r = engine.apply({
      type: 'assign_worker',
      workerId: w.id,
      levelId: level.id,
      targetCellX: d.targetX,
      targetCellY: d.targetY,
      positionX: d.targetX + 5,
      positionY: d.targetY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WORKER_POSITION_NOT_ADJACENT');
  });

  it('fails when worker is not idle', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const w = engine.read({ type: 'get_workers' }).workers[0];
    if (!w) return;
    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const d = findDeposit(level, DEFAULT_BALANCE.chunkSize);
    if (!d) return;
    // Assign first
    engine.apply({
      type: 'assign_worker',
      workerId: w.id,
      levelId: level.id,
      targetCellX: d.targetX,
      targetCellY: d.targetY,
      positionX: d.posX,
      positionY: d.posY,
    });
    // Try to assign again — worker is no longer idle
    engine.apply({ type: 'start_next_shift' });
    // With reassignment disabled, assign during shift_running → WRONG_PHASE
    const r = engine.apply({
      type: 'assign_worker',
      workerId: w.id,
      levelId: level.id,
      targetCellX: d.targetX,
      targetCellY: d.targetY,
      positionX: d.posX,
      positionY: d.posY,
    });
    expect(r.ok).toBe(false);
  });

  it('fails when position is occupied', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const workers = engine.read({ type: 'get_workers' }).workers;
    const wA = workers[0];
    const wB = workers[1];
    if (!wA || !wB) return;
    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const d = findDeposit(level, DEFAULT_BALANCE.chunkSize);
    if (!d) return;
    engine.apply({
      type: 'assign_worker',
      workerId: wA.id,
      levelId: level.id,
      targetCellX: d.targetX,
      targetCellY: d.targetY,
      positionX: d.posX,
      positionY: d.posY,
    });
    const r = engine.apply({
      type: 'assign_worker',
      workerId: wB.id,
      levelId: level.id,
      targetCellX: d.targetX,
      targetCellY: d.targetY,
      positionX: d.posX,
      positionY: d.posY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WORKER_POSITION_OCCUPIED');
  });

  it('rejects invalid tick count', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    engine.apply({ type: 'start_next_shift' });
    const r = engine.apply({ type: 'tick', ticksPassed: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_TICK_COUNT');
  });

  it('insufficient funds for storage upgrade', () => {
    const engine = GameEngineFactory.createNew({
      seedPhrase: 'v',
      startingMoney: DEFAULT_BALANCE.storageBaseCost,
    });
    engine.apply({ type: 'buy_storage' });
    const s = engine.read({ type: 'get_storages' }).storages[0];
    if (!s) return;
    const r = engine.apply({ type: 'upgrade_storage', storageId: s.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('storage not found returns STORAGE_NOT_FOUND', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    const r = engine.apply({ type: 'upgrade_storage', storageId: 'bad' as StorageId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('STORAGE_NOT_FOUND');
  });

  it('worker not found returns WORKER_NOT_FOUND', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'v', startingMoney: 9999 });
    const r = engine.apply({ type: 'unassign_worker', workerId: 'bad' as WorkerId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WORKER_NOT_FOUND');
  });
});
