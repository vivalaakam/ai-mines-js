import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, orderId, resourceId } from '@ai-mines/shared';
import type { OrderId, SaveId } from '@ai-mines/shared';
import { GameEngineFactory } from '@ai-mines/engine';
import { SqliteSaveAdapter } from './SqliteSaveAdapter.js';
import { SCHEMA_VERSION } from './schema.js';

const STONE = resourceId('stone');

let adapter: SqliteSaveAdapter;

beforeEach(() => {
  adapter = new SqliteSaveAdapter(':memory:');
});

afterEach(() => {
  adapter.close();
});

describe('schema', () => {
  it('SCHEMA_VERSION is 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('adapter opens without error (migrations ran)', () => {
    const a2 = new SqliteSaveAdapter(':memory:');
    a2.close();
  });
});

describe('save and load', () => {
  it('saves and loads a fresh game state', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'persist-test', startingMoney: 1234 });
    const state = engine.exportState();
    adapter.save(state);

    const loaded = adapter.load(state.saveId);
    expect(loaded).not.toBeNull();
    expect(loaded?.seedPhrase).toBe(state.seedPhrase);
    expect(loaded?.money).toBe(state.money);
    expect(loaded?.currentTick).toBe(state.currentTick);
    expect(loaded?.currentShift).toBe(state.currentShift);
    expect(loaded?.phase).toBe(state.phase);
    expect(loaded?.nextEntityId).toBe(state.nextEntityId);
  });

  it('preserves level count and depth', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'levels-test', startingMoney: 500 });
    const state = engine.exportState();
    adapter.save(state);

    const loaded = adapter.load(state.saveId);
    expect(loaded?.levels.size).toBe(state.levels.size);

    const origLevel = state.levels.values().next().value;
    const loadedLevel = loaded?.levels.values().next().value;
    expect(loadedLevel?.depth).toBe(origLevel?.depth);
    expect(loadedLevel?.entryX).toBe(origLevel?.entryX);
    expect(loadedLevel?.stairsX).toBe(origLevel?.stairsX);
  });

  it('preserves chunk and cell count', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'chunks-test', startingMoney: 500 });
    const state = engine.exportState();
    adapter.save(state);

    const loaded = adapter.load(state.saveId);
    const origLevel = state.levels.values().next().value;
    const loadedLevel = loaded?.levels.values().next().value;
    expect(loadedLevel?.chunks.size).toBe(origLevel?.chunks.size);

    const origChunk = origLevel?.chunks.values().next().value;
    const loadedChunk = loadedLevel?.chunks.values().next().value;
    expect(loadedChunk?.cells.length).toBe(origChunk?.cells.length);
  });

  it('preserves cell kind, visibility, accessibility', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'cells-test', startingMoney: 500 });
    const state = engine.exportState();
    adapter.save(state);

    const loaded = adapter.load(state.saveId);
    const origLevel = state.levels.values().next().value;
    const loadedLevel = loaded?.levels.values().next().value;

    // Iterate by chunk ID to avoid Map ordering differences
    for (const [cid, origChunk] of (origLevel?.chunks ?? new Map()).entries()) {
      const loadedChunk = loadedLevel?.chunks.get(cid);
      expect(loadedChunk?.cells.length).toBe(origChunk.cells.length);
      for (let i = 0; i < origChunk.cells.length; i++) {
        const oc = origChunk.cells[i];
        const lc = loadedChunk?.cells[i];
        expect(lc?.kind).toBe(oc?.kind);
        expect(lc?.visibility).toBe(oc?.visibility);
        expect(lc?.accessibility).toBe(oc?.accessibility);
        expect(lc?.x).toBe(oc?.x);
        expect(lc?.y).toBe(oc?.y);
      }
    }
  });

  it('preserves cell components (type, ratios, amounts)', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'comp-test', startingMoney: 500 });
    const state = engine.exportState();
    adapter.save(state);

    const loaded = adapter.load(state.saveId);
    const origLevel = state.levels.values().next().value;
    const loadedLevel = loaded?.levels.values().next().value;

    let found = false;
    for (const [cid, origChunk] of (origLevel?.chunks ?? new Map()).entries()) {
      const loadedChunk = loadedLevel?.chunks.get(cid);
      for (let i = 0; i < origChunk.cells.length; i++) {
        const oc = origChunk.cells[i];
        const lc = loadedChunk?.cells[i];
        if (oc?.kind !== 'deposit' || !oc.components.length) continue;
        expect(lc?.components.length).toBe(oc.components.length);
        for (let j = 0; j < oc.components.length; j++) {
          expect(lc?.components[j]?.type).toBe(oc.components[j]?.type);
          expect(lc?.components[j]?.ratio).toBeCloseTo(oc.components[j]?.ratio ?? 0, 10);
          expect(lc?.components[j]?.initialAmount).toBe(oc.components[j]?.initialAmount);
          expect(lc?.components[j]?.remainingAmount).toBe(oc.components[j]?.remainingAmount);
          expect(lc?.components[j]?.resourceId).toBe(oc.components[j]?.resourceId);
        }
        found = true;
        break;
      }
      if (found) break;
    }
  });

  it('preserves workers', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'workers-test', startingMoney: 9999 });
    engine.apply({ type: 'buy_worker', level: 1 });
    const state = engine.exportState();
    adapter.save(state);

    const loaded = adapter.load(state.saveId);
    expect(loaded?.workers.size).toBe(1);

    const origWorker = state.workers.values().next().value;
    const loadedWorker = loaded?.workers.values().next().value;
    expect(loadedWorker?.id).toBe(origWorker?.id);
    expect(loadedWorker?.level).toBe(origWorker?.level);
    expect(loadedWorker?.state).toBe(origWorker?.state);
  });

  it('preserves storages', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'storage-test', startingMoney: 9999 });
    engine.apply({ type: 'buy_storage', resourceId: STONE });
    const state = engine.exportState();
    adapter.save(state);

    const loaded = adapter.load(state.saveId);
    expect(loaded?.storages.size).toBe(1);

    const origSt = state.storages.values().next().value;
    const loadedSt = loaded?.storages.values().next().value;
    expect(loadedSt?.resourceId).toBe(origSt?.resourceId);
    expect(loadedSt?.capacity).toBe(origSt?.capacity);
    expect(loadedSt?.storedAmount).toBe(origSt?.storedAmount);
  });

  it('preserves orders and requirements', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'orders-test', startingMoney: 9999 });
    const state = engine.exportState();

    // Directly inject an order (createOrder is an internal test helper)
    const oid = orderId('order-1') as OrderId;
    state.orders.set(oid, {
      id: oid,
      rewardMoney: 100,
      state: 'available',
      expiresAtTick: 999,
      priority: 0,
      requirements: [{ resourceId: STONE, requiredAmount: 10, deliveredAmount: 0 }],
    });

    adapter.save(state);
    const loaded = adapter.load(state.saveId);
    expect(loaded?.orders.size).toBe(1);

    const loadedOrder = loaded?.orders.get(oid);
    expect(loadedOrder?.rewardMoney).toBe(100);
    expect(loadedOrder?.expiresAtTick).toBe(999);
    expect(loadedOrder?.requirements.length).toBe(1);
    expect(loadedOrder?.requirements[0]?.resourceId).toBe(STONE);
    expect(loadedOrder?.requirements[0]?.requiredAmount).toBe(10);
    expect(loadedOrder?.requirements[0]?.deliveredAmount).toBe(0);
  });

  it('resaving overwrites without error', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'idem', startingMoney: 500 });
    const state = engine.exportState();
    adapter.save(state);
    adapter.save(state);
    expect(adapter.load(state.saveId)?.seedPhrase).toBe('idem');
  });

  it('returns null for unknown save_id', () => {
    expect(adapter.load('nonexistent' as SaveId)).toBeNull();
  });
});

describe('listSaves and deleteSave', () => {
  it('listSaves returns all saved games', () => {
    const e1 = GameEngineFactory.createNew({ seedPhrase: 'list1', startingMoney: 100 });
    const e2 = GameEngineFactory.createNew({ seedPhrase: 'list2', startingMoney: 200 });
    adapter.save(e1.exportState());
    adapter.save(e2.exportState());

    const saves = adapter.listSaves();
    expect(saves.length).toBe(2);
    expect(saves.some((s) => s.seedPhrase === 'list1')).toBe(true);
    expect(saves.some((s) => s.seedPhrase === 'list2')).toBe(true);
  });

  it('deleteSave removes the save', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'del', startingMoney: 100 });
    const state = engine.exportState();
    adapter.save(state);
    adapter.deleteSave(state.saveId);
    expect(adapter.load(state.saveId)).toBeNull();
    expect(adapter.listSaves()).toHaveLength(0);
  });
});

describe('engine round-trip via persistence', () => {
  it('loaded state creates a working engine', () => {
    const engine = GameEngineFactory.createNew({
      seedPhrase: 'rt-persist',
      startingMoney: 9999,
      balance: { ...DEFAULT_BALANCE, ticksPerShift: 10 },
    });
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'tick', ticksPassed: 5 });

    const state = engine.exportState();
    adapter.save(state);

    const loaded = adapter.load(state.saveId);
    if (!loaded) throw new Error('load returned null');

    const engine2 = GameEngineFactory.createFromState(loaded, { ticksPerShift: 10 });
    const r = engine2.apply({ type: 'tick', ticksPassed: 5 });
    expect(r.ok).toBe(true);
    expect(engine2.read({ type: 'get_game_status' }).phase).toBe('shift_planning');
  });
});
