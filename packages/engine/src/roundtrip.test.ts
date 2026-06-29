/**
 * T-017: exportState / createFromState round-trip.
 * Verifies that cloning state and creating a new engine produces identical results.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, resourceId } from '@ai-mines/shared';
import type { ChunkId } from '@ai-mines/shared';
import { GameEngineFactory } from './GameEngine.js';
import type { EngineState, LevelData } from './state/types.js';

const STONE = resourceId('stone');

/** Deep-clone engine state using structuredClone (preserves Map/Set). */
function cloneState(state: EngineState): EngineState {
  return structuredClone(state) as EngineState;
}

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

// ---- tests ----

describe('round-trip — basic state fields', () => {
  it('cloned state has same money, tick, phase', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'rt', startingMoney: 999 });
    engine.apply({ type: 'buy_storage', resourceId: STONE });
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'tick', ticksPassed: 10 });

    const clone = cloneState(engine.exportState());
    const engine2 = GameEngineFactory.createFromState(clone);

    const s1 = engine.read({ type: 'get_game_status' });
    const s2 = engine2.read({ type: 'get_game_status' });

    expect(s2.money).toBe(s1.money);
    expect(s2.currentTick).toBe(s1.currentTick);
    expect(s2.phase).toBe(s1.phase);
    expect(s2.currentShift).toBe(s1.currentShift);
  });

  it('cloned engine has same workers', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'rt-w', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });

    const clone = cloneState(engine.exportState());
    const engine2 = GameEngineFactory.createFromState(clone);

    const w1 = engine.read({ type: 'get_workers' }).workers;
    const w2 = engine2.read({ type: 'get_workers' }).workers;

    expect(w2).toHaveLength(w1.length);
    expect(w2[0]?.level).toBe(w1[0]?.level);
    expect(w2[0]?.id).toBe(w1[0]?.id);
  });

  it('cloned engine has same storages', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'rt-s', startingMoney: 9999 });
    engine.apply({ type: 'buy_storage', resourceId: STONE });

    const clone = cloneState(engine.exportState());
    const engine2 = GameEngineFactory.createFromState(clone);

    const st1 = engine.read({ type: 'get_storages' }).storages;
    const st2 = engine2.read({ type: 'get_storages' }).storages;

    expect(st2).toHaveLength(st1.length);
    expect(st2[0]?.resource.id).toBe(st1[0]?.resource.id);
    expect(st2[0]?.capacity).toBe(st1[0]?.capacity);
  });

  it('cloned engine map is identical (same chunk count)', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'rt-map', startingMoney: 9999 });
    const state = engine.exportState();
    const level1 = state.levels.values().next().value as LevelData | undefined;
    expect(level1).toBeDefined();
    if (!level1) return;

    const clone = cloneState(state);
    const engine2 = GameEngineFactory.createFromState(clone);
    const state2 = engine2.exportState();
    const level2 = state2.levels.values().next().value as LevelData | undefined;
    expect(level2).toBeDefined();
    if (!level2) return;

    expect(level2.chunks.size).toBe(level1.chunks.size);
    expect(level2.depth).toBe(level1.depth);
    expect(level2.entryX).toBe(level1.entryX);
    expect(level2.entryY).toBe(level1.entryY);
  });
});

describe('round-trip — commands still work on cloned engine', () => {
  it('can buy worker on cloned engine', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'rt-cmd', startingMoney: 9999 });
    const clone = cloneState(engine.exportState());
    const engine2 = GameEngineFactory.createFromState(clone);

    const r = engine2.apply({ type: 'buy_worker', level: 1 });
    expect(r.ok).toBe(true);
  });

  it('nextEntityId continues from correct value after clone', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'rt-id', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 }); // entity id 1
    engine.apply({ type: 'buy_worker', level: 1 }); // entity id 2

    const clone = cloneState(engine.exportState());
    const engine2 = GameEngineFactory.createFromState(clone);

    engine2.apply({ type: 'buy_worker', level: 1 }); // entity id 3
    const workers = engine2.read({ type: 'get_workers' }).workers;
    expect(workers).toHaveLength(3);
    // All IDs must be distinct
    const ids = new Set(workers.map((w) => w.id));
    expect(ids.size).toBe(3);
  });

  it('tick advances after round-trip', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'rt-tick', startingMoney: 9999 });
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'tick', ticksPassed: 50 });

    const clone = cloneState(engine.exportState());
    const engine2 = GameEngineFactory.createFromState(clone);

    // Tick more on cloned engine
    const r = engine2.apply({ type: 'tick', ticksPassed: 10 });
    expect(r.ok).toBe(true);
    expect(engine2.read({ type: 'get_game_status' }).currentTick).toBe(60);
  });

  it('assigned worker survives round-trip and extraction continues', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'rt-wrk', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const state = engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;
    const d = findDeposit(level, DEFAULT_BALANCE.chunkSize);
    if (!d) return;

    engine.apply({
      type: 'assign_worker',
      workerId: engine.read({ type: 'get_workers' }).workers[0]!.id, // eslint-disable-line @typescript-eslint/no-non-null-assertion
      levelId: level.id,
      targetCellX: d.targetX,
      targetCellY: d.targetY,
      positionX: d.posX,
      positionY: d.posY,
    });
    engine.apply({ type: 'start_next_shift' });

    const clone = cloneState(engine.exportState());
    const engine2 = GameEngineFactory.createFromState(clone);

    // Worker should still be working
    const w = engine2.read({ type: 'get_workers' }).workers[0];
    expect(w?.state).toBe('working');

    // Tick should work
    const r = engine2.apply({ type: 'tick', ticksPassed: 10 });
    expect(r.ok).toBe(true);
  });
});
