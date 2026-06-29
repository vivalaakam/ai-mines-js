import { RESOURCES, engineError, storageId } from '@ai-mines/shared';
import type { BalanceConfig, ResourceId, StorageId } from '@ai-mines/shared';
import type { BuyStorageCommand, UpgradeStorageCommand } from '../commands/types.js';
import type { StorageCostsResult, StoragesResult } from '../queries/types.js';
import type { ApplyResult } from '../GameEngine.js';
import type { EngineState } from '../state/types.js';

export function storageCapacity(level: number, balance: BalanceConfig): number {
  return Math.round(
    balance.storageBaseCapacity * Math.pow(balance.storageCapacityMultiplier, level - 1),
  );
}

export function storageUpgradeCost(currentLevel: number, balance: BalanceConfig): number {
  return Math.round(
    balance.storageBaseCost * Math.pow(balance.storageUpgradeCostMultiplier, currentLevel),
  );
}

export function applyBuyStorage(
  state: EngineState,
  balance: BalanceConfig,
  cmd: BuyStorageCommand,
): ApplyResult {
  if (state.phase !== 'shift_planning') {
    return { ok: false, error: engineError('WRONG_PHASE', 'buy_storage requires shift_planning') };
  }
  const resource = RESOURCES.find((r) => r.id === cmd.resourceId);
  if (!resource) {
    return { ok: false, error: engineError('INVALID_RESOURCE', 'Unknown resource') };
  }
  const cost = balance.storageBaseCost;
  if (state.money < cost) {
    return { ok: false, error: engineError('INSUFFICIENT_FUNDS', 'Not enough money') };
  }
  state.money -= cost;
  const id = storageId(`s${state.nextEntityId++}`);
  state.storages.set(id, {
    id,
    resourceId: cmd.resourceId,
    level: 1,
    capacity: storageCapacity(1, balance),
    storedAmount: 0,
  });
  return { ok: true, events: [] };
}

export function applyUpgradeStorage(
  state: EngineState,
  balance: BalanceConfig,
  cmd: UpgradeStorageCommand,
): ApplyResult {
  if (state.phase !== 'shift_planning') {
    return {
      ok: false,
      error: engineError('WRONG_PHASE', 'upgrade_storage requires shift_planning'),
    };
  }
  const storage = state.storages.get(cmd.storageId);
  if (!storage) {
    return { ok: false, error: engineError('STORAGE_NOT_FOUND', 'Storage not found') };
  }
  const cost = storageUpgradeCost(storage.level, balance);
  if (state.money < cost) {
    return { ok: false, error: engineError('INSUFFICIENT_FUNDS', 'Not enough money') };
  }
  state.money -= cost;
  storage.level += 1;
  storage.capacity = storageCapacity(storage.level, balance);
  return { ok: true, events: [] };
}

export function readStorages(state: EngineState): StoragesResult {
  const storages = Array.from(state.storages.values()).map((s) => {
    const resource = RESOURCES.find((r) => r.id === s.resourceId);
    if (!resource) throw new Error(`Unknown resource ${s.resourceId}`);
    return {
      id: s.id,
      resource,
      level: s.level,
      capacity: s.capacity,
      storedAmount: s.storedAmount,
    };
  });
  return { type: 'get_storages', storages };
}

export function readStorageCosts(
  state: EngineState,
  balance: BalanceConfig,
  resourceId: ResourceId,
): StorageCostsResult {
  const upgradeCosts = Array.from(state.storages.values())
    .filter((s) => s.resourceId === resourceId)
    .map((s) => ({
      storageId: s.id as StorageId,
      cost: storageUpgradeCost(s.level, balance),
    }));
  return {
    type: 'get_storage_costs',
    resourceId,
    buyNewCost: balance.storageBaseCost,
    upgradeCosts,
  };
}
