import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, resourceId, storageId } from '@ai-mines/shared';
import type { StorageId } from '@ai-mines/shared';
import { GameEngineFactory } from '../GameEngine.js';
import type { StorageData } from '../state/types.js';
import { createOrder } from './orderSystem.js';

const STONE = resourceId('stone');
const COAL = resourceId('coal');

// ---- accept_order ----

describe('accept_order', () => {
  it('changes order state to accepted', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const state = engine.exportState();
    const order = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 10 }],
      rewardMoney: 100,
      expiresAtTick: 9999,
    });

    const result = engine.apply({ type: 'accept_order', orderId: order.id });
    expect(result.ok).toBe(true);
    const orders = engine.read({ type: 'get_orders' }).orders;
    expect(orders[0]?.state).toBe('accepted');
  });

  it('fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const state = engine.exportState();
    const order = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 10 }],
      rewardMoney: 100,
      expiresAtTick: 9999,
    });
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'accept_order', orderId: order.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });

  it('fails if order not found', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const result = engine.apply({
      type: 'accept_order',
      orderId: 'nonexistent' as import('@ai-mines/shared').OrderId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ORDER_NOT_FOUND');
  });

  it('fails if already accepted', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const state = engine.exportState();
    const order = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 10 }],
      rewardMoney: 100,
      expiresAtTick: 9999,
    });
    engine.apply({ type: 'accept_order', orderId: order.id });
    const result = engine.apply({ type: 'accept_order', orderId: order.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ORDER_ALREADY_ACCEPTED');
  });

  it('immediately fulfills order when storage has enough resources', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const state = engine.exportState();

    // Inject storage with 20 stone
    const sid = storageId('stone-storage') as StorageId;
    const storage: StorageData = {
      id: sid,
      resourceId: STONE,
      level: 1,
      capacity: 100,
      storedAmount: 20,
    };
    state.storages.set(sid, storage);

    const order = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 10 }],
      rewardMoney: 500,
      expiresAtTick: 9999,
    });

    const moneyBefore = engine.read({ type: 'get_game_status' }).money;
    const result = engine.apply({ type: 'accept_order', orderId: order.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const completed = result.events.find((e) => e.type === 'order_completed');
    expect(completed).toBeDefined();

    // Money should be increased by reward
    expect(engine.read({ type: 'get_game_status' }).money).toBe(moneyBefore + 500);
    // Storage consumed
    expect(state.storages.get(sid)?.storedAmount).toBe(10);
    // Order state
    expect(engine.read({ type: 'get_orders' }).orders[0]?.state).toBe('completed');
  });
});

// ---- decline_order ----

describe('decline_order', () => {
  it('changes state to declined', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const state = engine.exportState();
    const order = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 10 }],
      rewardMoney: 100,
      expiresAtTick: 9999,
    });
    engine.apply({ type: 'decline_order', orderId: order.id });
    expect(engine.read({ type: 'get_orders' }).orders[0]?.state).toBe('declined');
  });

  it('can decline an accepted order', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const state = engine.exportState();
    const order = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 10 }],
      rewardMoney: 100,
      expiresAtTick: 9999,
    });
    engine.apply({ type: 'accept_order', orderId: order.id });
    const result = engine.apply({ type: 'decline_order', orderId: order.id });
    expect(result.ok).toBe(true);
    expect(engine.read({ type: 'get_orders' }).orders[0]?.state).toBe('declined');
  });

  it('fails in shift_running', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const state = engine.exportState();
    const order = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 10 }],
      rewardMoney: 100,
      expiresAtTick: 9999,
    });
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'decline_order', orderId: order.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });
});

// ---- set_order_priority ----

describe('set_order_priority', () => {
  it('updates priority', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const state = engine.exportState();
    const order = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 10 }],
      rewardMoney: 100,
      expiresAtTick: 9999,
    });
    engine.apply({ type: 'set_order_priority', orderId: order.id, priority: 5 });
    expect(engine.read({ type: 'get_orders' }).orders[0]?.priority).toBe(5);
  });
});

// ---- runOrderAllocation (shift end) ----

describe('order allocation at shift end', () => {
  it('fulfills accepted order when enough resources available at shift end', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const state = engine.exportState();

    // Create order and accept with empty storage (can't be immediately fulfilled)
    const sid = storageId('coal-st') as StorageId;
    state.storages.set(sid, {
      id: sid,
      resourceId: COAL,
      level: 1,
      capacity: 100,
      storedAmount: 0,
    });

    const order = createOrder(state, {
      requirements: [{ resourceId: COAL, requiredAmount: 30 }],
      rewardMoney: 200,
      expiresAtTick: 9999,
    });
    engine.apply({ type: 'accept_order', orderId: order.id });
    // Now fill storage (simulates mining during shift)
    const storage = state.storages.get(sid);
    if (storage) storage.storedAmount = 50;

    engine.apply({ type: 'start_next_shift' });

    const result = engine.apply({ type: 'fast_forward_to_shift_end' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const completed = result.events.find((e) => e.type === 'order_completed');
    expect(completed).toBeDefined();
    expect(engine.read({ type: 'get_orders' }).orders[0]?.state).toBe('completed');
    // Storage consumed: 50 - 30 = 20
    expect(state.storages.get(sid)?.storedAmount).toBe(20);
  });

  it('expires overdue orders at shift end', () => {
    const engine = GameEngineFactory.createNew({
      seedPhrase: 'test',
      startingMoney: 1000,
      balance: { ...DEFAULT_BALANCE, ticksPerShift: 10 },
    });
    const state = engine.exportState();
    const order = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 999 }],
      rewardMoney: 100,
      expiresAtTick: 5, // expires during this shift
    });
    engine.apply({ type: 'accept_order', orderId: order.id });
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'tick', ticksPassed: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expired = result.events.find((e) => e.type === 'order_expired');
    expect(expired).toBeDefined();
    expect(engine.read({ type: 'get_orders' }).orders[0]?.state).toBe('expired');
  });

  it('higher priority order fulfilled first when resources are scarce', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'test', startingMoney: 1000 });
    const state = engine.exportState();

    // Accept both orders with empty storage (no immediate fulfillment)
    const sid = storageId('sc-stone') as StorageId;
    state.storages.set(sid, {
      id: sid,
      resourceId: STONE,
      level: 1,
      capacity: 100,
      storedAmount: 0,
    });

    const lowPrio = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 10 }],
      rewardMoney: 50,
      expiresAtTick: 9999,
      priority: 1,
    });
    const highPrio = createOrder(state, {
      requirements: [{ resourceId: STONE, requiredAmount: 10 }],
      rewardMoney: 200,
      expiresAtTick: 9999,
      priority: 10,
    });

    engine.apply({ type: 'accept_order', orderId: lowPrio.id });
    engine.apply({ type: 'accept_order', orderId: highPrio.id });

    // Fill storage with only 15 — enough for one 10-stone order
    const storage = state.storages.get(sid);
    if (storage) storage.storedAmount = 15;

    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'fast_forward_to_shift_end' });

    const orders = engine.read({ type: 'get_orders' }).orders;
    const hp = orders.find((o) => o.id === highPrio.id);
    const lp = orders.find((o) => o.id === lowPrio.id);
    expect(hp?.state).toBe('completed');
    expect(lp?.state).toBe('accepted'); // not enough resources left
  });
});
