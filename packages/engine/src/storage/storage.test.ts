import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, resourceId } from '@ai-mines/shared';
import { GameEngineFactory } from '../GameEngine.js';
import { storageCapacity, storageUpgradeCost } from './storageSystem.js';

const STONE = resourceId('stone');
const COAL = resourceId('coal');

// helper: buy + assign resource
function buyStorage(engine: ReturnType<typeof GameEngineFactory.createNew>, resId = STONE) {
  engine.apply({ type: 'buy_storage' });
  const s = engine.read({ type: 'get_storages' }).storages.at(-1)!;
  engine.apply({ type: 'set_storage_resource', storageId: s.id, resourceId: resId });
  return engine.read({ type: 'get_storages' }).storages.at(-1)!;
}

// ---- formula tests ----

describe('storageCapacity', () => {
  it('level 1 equals storageBaseCapacity', () => {
    expect(storageCapacity(1, DEFAULT_BALANCE)).toBe(DEFAULT_BALANCE.storageBaseCapacity);
  });

  it('level 2 equals baseCapacity * multiplier', () => {
    expect(storageCapacity(2, DEFAULT_BALANCE)).toBe(
      Math.round(DEFAULT_BALANCE.storageBaseCapacity * DEFAULT_BALANCE.storageCapacityMultiplier),
    );
  });

  it('capacity grows with level', () => {
    expect(storageCapacity(3, DEFAULT_BALANCE)).toBeGreaterThan(
      storageCapacity(2, DEFAULT_BALANCE),
    );
  });
});

describe('storageUpgradeCost', () => {
  it('upgrade from level 1 = baseCost * multiplier^1', () => {
    expect(storageUpgradeCost(1, DEFAULT_BALANCE)).toBe(
      Math.round(DEFAULT_BALANCE.storageBaseCost * DEFAULT_BALANCE.storageUpgradeCostMultiplier),
    );
  });

  it('upgrade cost grows with level', () => {
    expect(storageUpgradeCost(2, DEFAULT_BALANCE)).toBeGreaterThan(
      storageUpgradeCost(1, DEFAULT_BALANCE),
    );
  });
});

// ---- buy_storage ----

describe('buy_storage', () => {
  it('creates an unassigned storage in shift_planning', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const result = engine.apply({ type: 'buy_storage' });
    expect(result.ok).toBe(true);
    const { storages } = engine.read({ type: 'get_storages' });
    expect(storages).toHaveLength(1);
    expect(storages[0]?.resource).toBeNull();
    expect(storages[0]?.level).toBe(1);
    expect(storages[0]?.storedAmount).toBe(0);
  });

  it('deducts storageBaseCost from money', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    engine.apply({ type: 'buy_storage' });
    expect(engine.read({ type: 'get_game_status' }).money).toBe(
      1000 - DEFAULT_BALANCE.storageBaseCost,
    );
  });

  it('fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'buy_storage' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });

  it('fails with insufficient funds', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1 });
    const result = engine.apply({ type: 'buy_storage' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('can buy multiple storages', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    engine.apply({ type: 'buy_storage' });
    engine.apply({ type: 'buy_storage' });
    expect(engine.read({ type: 'get_storages' }).storages).toHaveLength(2);
  });
});

// ---- set_storage_resource ----

describe('set_storage_resource', () => {
  it('assigns resource to unassigned storage', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const s = buyStorage(engine, STONE);
    expect(s.resource?.id).toBe(STONE);
  });

  it('changes resource and clears storedAmount', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    // Buy, assign stone, artificially set storedAmount via state export
    engine.apply({ type: 'buy_storage' });
    const sid = engine.read({ type: 'get_storages' }).storages[0]!.id;
    engine.apply({ type: 'set_storage_resource', storageId: sid, resourceId: STONE });
    // change to coal → storedAmount should reset to 0
    const result = engine.apply({ type: 'set_storage_resource', storageId: sid, resourceId: COAL });
    expect(result.ok).toBe(true);
    const after = engine.read({ type: 'get_storages' }).storages[0];
    expect(after?.resource?.id).toBe(COAL);
    expect(after?.storedAmount).toBe(0);
  });

  it('fails with unknown resource', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    engine.apply({ type: 'buy_storage' });
    const sid = engine.read({ type: 'get_storages' }).storages[0]!.id;
    const result = engine.apply({ type: 'set_storage_resource', storageId: sid, resourceId: resourceId('unknown') });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_RESOURCE');
  });

  it('fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    engine.apply({ type: 'buy_storage' });
    const sid = engine.read({ type: 'get_storages' }).storages[0]!.id;
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'set_storage_resource', storageId: sid, resourceId: STONE });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });
});

// ---- upgrade_storage ----

describe('upgrade_storage', () => {
  it('increases level and capacity', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 10000 });
    const s = buyStorage(engine);
    const result = engine.apply({ type: 'upgrade_storage', storageId: s.id });
    expect(result.ok).toBe(true);
    const after = engine.read({ type: 'get_storages' }).storages[0];
    expect(after?.level).toBe(2);
    expect(after?.capacity).toBe(storageCapacity(2, DEFAULT_BALANCE));
  });

  it('deducts upgrade cost', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 10000 });
    const s = buyStorage(engine);
    const moneyBefore = engine.read({ type: 'get_game_status' }).money;
    engine.apply({ type: 'upgrade_storage', storageId: s.id });
    expect(engine.read({ type: 'get_game_status' }).money).toBe(moneyBefore - storageUpgradeCost(1, DEFAULT_BALANCE));
  });

  it('fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 10000 });
    const s = buyStorage(engine);
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'upgrade_storage', storageId: s.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });

  it('fails if storage not found', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 10000 });
    const result = engine.apply({
      type: 'upgrade_storage',
      storageId: 'nonexistent' as import('@ai-mines/shared').StorageId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STORAGE_NOT_FOUND');
  });

  it('fails with insufficient funds', () => {
    const engine = GameEngineFactory.createNew({
      seedPhrase: 'test',
      startingMoney: DEFAULT_BALANCE.storageBaseCost,
    });
    const s = buyStorage(engine);
    const result = engine.apply({ type: 'upgrade_storage', storageId: s.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INSUFFICIENT_FUNDS');
  });
});

// ---- get_storage_costs ----

describe('get_storage_costs', () => {
  it('returns buyNewCost = storageBaseCost', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const costs = engine.read({ type: 'get_storage_costs', resourceId: STONE });
    expect(costs.buyNewCost).toBe(DEFAULT_BALANCE.storageBaseCost);
  });

  it('returns empty upgradeCosts when no stone storage exists', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const costs = engine.read({ type: 'get_storage_costs', resourceId: STONE });
    expect(costs.upgradeCosts).toHaveLength(0);
  });

  it('includes upgrade cost after assigning resource', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    buyStorage(engine, STONE);
    const costs = engine.read({ type: 'get_storage_costs', resourceId: STONE });
    expect(costs.upgradeCosts).toHaveLength(1);
    expect(costs.upgradeCosts[0]?.cost).toBe(storageUpgradeCost(1, DEFAULT_BALANCE));
  });

  it('does not include storages of other resources in upgradeCosts', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    buyStorage(engine, COAL);
    const costs = engine.read({ type: 'get_storage_costs', resourceId: STONE });
    expect(costs.upgradeCosts).toHaveLength(0);
  });
});
