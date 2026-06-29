import { engineError, orderId } from '@ai-mines/shared';
import type { ResourceId } from '@ai-mines/shared';
import type {
  AcceptOrderCommand,
  DeclineOrderCommand,
  SetOrderPriorityCommand,
} from '../commands/types.js';
import type { ApplyResult } from '../GameEngine.js';
import type { EngineEvent } from '../events/types.js';
import type { OrdersResult } from '../queries/types.js';
import type { EngineState, OrderData, OrderRequirementData } from '../state/types.js';

// ---- public helpers used by tests / persistence ----

export interface CreateOrderParams {
  requirements: { resourceId: ResourceId; requiredAmount: number }[];
  rewardMoney: number;
  expiresAtTick: number;
  priority?: number;
}

/** Inject a new order into state (used by tests and future order-generation logic). */
export function createOrder(state: EngineState, params: CreateOrderParams): OrderData {
  const id = orderId(`o${state.nextEntityId++}`);
  const order: OrderData = {
    id,
    requirements: params.requirements.map((r) => ({
      resourceId: r.resourceId,
      requiredAmount: r.requiredAmount,
      deliveredAmount: 0,
    })),
    rewardMoney: params.rewardMoney,
    state: 'available',
    expiresAtTick: params.expiresAtTick,
    priority: params.priority ?? 0,
  };
  state.orders.set(id, order);
  return order;
}

// ---- commands ----

export function applyAcceptOrder(state: EngineState, cmd: AcceptOrderCommand): ApplyResult {
  if (state.phase !== 'shift_planning') {
    return { ok: false, error: engineError('WRONG_PHASE', 'accept_order requires shift_planning') };
  }
  const order = state.orders.get(cmd.orderId);
  if (!order) {
    return { ok: false, error: engineError('ORDER_NOT_FOUND', 'Order not found') };
  }
  if (order.state === 'accepted') {
    return { ok: false, error: engineError('ORDER_ALREADY_ACCEPTED', 'Order already accepted') };
  }
  if (order.state !== 'available') {
    return { ok: false, error: engineError('ORDER_NOT_CANCELLABLE', 'Order is not available') };
  }
  order.state = 'accepted';

  // Immediate fulfillment check
  const events = tryFulfillOrder(state, order);
  return { ok: true, events };
}

export function applyDeclineOrder(state: EngineState, cmd: DeclineOrderCommand): ApplyResult {
  if (state.phase !== 'shift_planning') {
    return {
      ok: false,
      error: engineError('WRONG_PHASE', 'decline_order requires shift_planning'),
    };
  }
  const order = state.orders.get(cmd.orderId);
  if (!order) {
    return { ok: false, error: engineError('ORDER_NOT_FOUND', 'Order not found') };
  }
  if (order.state !== 'available' && order.state !== 'accepted') {
    return { ok: false, error: engineError('ORDER_NOT_CANCELLABLE', 'Order cannot be declined') };
  }
  order.state = 'declined';
  return { ok: true, events: [] };
}

export function applySetOrderPriority(
  state: EngineState,
  cmd: SetOrderPriorityCommand,
): ApplyResult {
  const order = state.orders.get(cmd.orderId);
  if (!order) {
    return { ok: false, error: engineError('ORDER_NOT_FOUND', 'Order not found') };
  }
  order.priority = cmd.priority;
  return { ok: true, events: [] };
}

// ---- shift-end allocation ----

/**
 * Called at end of each shift. Allocates stored resources to accepted orders
 * by priority (highest first). Returns events for completed/expired orders.
 */
export function runOrderAllocation(state: EngineState): EngineEvent[] {
  const events: EngineEvent[] = [];

  // Expire overdue orders
  for (const order of state.orders.values()) {
    if (
      (order.state === 'available' || order.state === 'accepted') &&
      state.currentTick >= order.expiresAtTick
    ) {
      order.state = 'expired';
      events.push({ type: 'order_expired', orderId: order.id });
    }
  }

  // Sort accepted orders by priority descending
  const accepted = Array.from(state.orders.values())
    .filter((o) => o.state === 'accepted')
    .sort((a, b) => b.priority - a.priority);

  for (const order of accepted) {
    const fulfilled = tryFulfillOrder(state, order);
    events.push(...fulfilled);
  }

  return events;
}

// ---- internal ----

/** Try to fulfill an accepted order by consuming from storage. Returns events if completed. */
function tryFulfillOrder(state: EngineState, order: OrderData): EngineEvent[] {
  // Check if all requirements can be met with current storage
  for (const req of order.requirements) {
    const available = storedAmount(state, req.resourceId);
    const needed = req.requiredAmount - req.deliveredAmount;
    if (available < needed) return []; // can't fulfill yet
  }

  // Consume resources
  for (const req of order.requirements) {
    const needed = req.requiredAmount - req.deliveredAmount;
    consumeFromStorage(state, req.resourceId, needed);
    req.deliveredAmount = req.requiredAmount;
  }

  order.state = 'completed';
  state.money += order.rewardMoney;
  return [{ type: 'order_completed', orderId: order.id, rewardMoney: order.rewardMoney }];
}

function storedAmount(state: EngineState, resourceId: ResourceId): number {
  let total = 0;
  for (const s of state.storages.values()) {
    if (s.resourceId === resourceId) total += s.storedAmount;
  }
  return total;
}

function consumeFromStorage(state: EngineState, resourceId: ResourceId, amount: number): void {
  for (const s of state.storages.values()) {
    if (s.resourceId !== resourceId) continue;
    const take = Math.min(amount, s.storedAmount);
    s.storedAmount -= take;
    amount -= take;
    if (amount <= 0) break;
  }
}

// ---- query ----

export function readOrders(state: EngineState): OrdersResult {
  const orders = Array.from(state.orders.values()).map((o) => ({
    id: o.id,
    requirements: o.requirements.map((r: OrderRequirementData) => ({
      resourceId: r.resourceId,
      requiredAmount: r.requiredAmount,
      deliveredAmount: r.deliveredAmount,
    })),
    rewardMoney: o.rewardMoney,
    state: o.state,
    expiresAtTick: o.expiresAtTick,
    priority: o.priority,
  }));
  return { type: 'get_orders', orders };
}
