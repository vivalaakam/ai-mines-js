import { chunkId, engineError, workerId } from '@ai-mines/shared';
import type { BalanceConfig } from '@ai-mines/shared';
import type { ApplyResult } from '../GameEngine.js';
import type {
  AssignWorkerCommand,
  BuyWorkerCommand,
  MergeWorkersCommand,
  UnassignWorkerCommand,
} from '../commands/types.js';
import type { WorkerCostsResult, WorkersResult } from '../queries/types.js';
import type { CellData, EngineState, LevelData } from '../state/types.js';

// ---- Formulas ----

export function workerCost(level: number, balance: BalanceConfig): number {
  return Math.round(balance.workerBaseCost * Math.pow(balance.workerCostMultiplier, level - 1));
}

export function workerSpeed(level: number, balance: BalanceConfig): number {
  return balance.workerBaseSpeed * Math.pow(balance.workerSpeedMultiplier, level - 1);
}

export function maxPurchasableWorkerLevel(state: EngineState, balance: BalanceConfig): number {
  let highest = 0;
  for (const w of state.workers.values()) {
    if (w.level > highest) highest = w.level;
  }
  return Math.max(1, highest - balance.workerLevelUnlockOffset);
}

// ---- Commands ----

export function applyBuyWorker(
  state: EngineState,
  balance: BalanceConfig,
  cmd: BuyWorkerCommand,
): ApplyResult {
  if (state.phase !== 'shift_planning') {
    return { ok: false, error: engineError('WRONG_PHASE', 'buy_worker requires shift_planning') };
  }
  const maxLevel = maxPurchasableWorkerLevel(state, balance);
  if (cmd.level < 1 || cmd.level > maxLevel) {
    return {
      ok: false,
      error: engineError('WORKER_LEVEL_NOT_PURCHASABLE', `Max purchasable level is ${maxLevel}`),
    };
  }
  const cost = workerCost(cmd.level, balance);
  if (state.money < cost) {
    return {
      ok: false,
      error: engineError('INSUFFICIENT_FUNDS', `Need ${cost}, have ${state.money}`),
    };
  }
  const id = workerId(`w${state.nextEntityId++}`);
  state.workers.set(id, {
    id,
    level: cmd.level,
    state: 'idle',
    levelId: null,
    positionX: null,
    positionY: null,
    targetCellX: null,
    targetCellY: null,
  });
  state.money -= cost;
  return { ok: true, events: [] };
}

export function applyMergeWorkers(
  state: EngineState,
  cmd: MergeWorkersCommand,
): ApplyResult {
  if (state.phase !== 'shift_planning') {
    return { ok: false, error: engineError('WRONG_PHASE', 'merge_workers requires shift_planning') };
  }
  const wA = state.workers.get(cmd.workerIdA);
  const wB = state.workers.get(cmd.workerIdB);
  if (!wA) {
    return { ok: false, error: engineError('WORKER_NOT_FOUND', `Worker ${cmd.workerIdA} not found`) };
  }
  if (!wB) {
    return { ok: false, error: engineError('WORKER_NOT_FOUND', `Worker ${cmd.workerIdB} not found`) };
  }
  if (wA.state !== 'idle') {
    return { ok: false, error: engineError('WORKER_NOT_IDLE', `Worker A is not idle`) };
  }
  if (wB.state !== 'idle') {
    return { ok: false, error: engineError('WORKER_NOT_IDLE', `Worker B is not idle`) };
  }
  if (wA.level !== wB.level) {
    return { ok: false, error: engineError('WORKER_LEVEL_MISMATCH', 'Workers must be the same level') };
  }
  state.workers.delete(cmd.workerIdA);
  state.workers.delete(cmd.workerIdB);
  const id = workerId(`w${state.nextEntityId++}`);
  state.workers.set(id, {
    id,
    level: wA.level + 1,
    state: 'idle',
    levelId: null,
    positionX: null,
    positionY: null,
    targetCellX: null,
    targetCellY: null,
  });
  return { ok: true, events: [] };
}

export function applyAssignWorker(
  state: EngineState,
  balance: BalanceConfig,
  cmd: AssignWorkerCommand,
): ApplyResult {
  if (state.phase !== 'shift_planning' && !state.allowWorkerReassignmentDuringShift) {
    return {
      ok: false,
      error: engineError(
        'WRONG_PHASE',
        'assign_worker requires shift_planning (or allowWorkerReassignmentDuringShift)',
      ),
    };
  }
  const worker = state.workers.get(cmd.workerId);
  if (!worker) {
    return { ok: false, error: engineError('WORKER_NOT_FOUND', 'Worker not found') };
  }
  if (worker.state !== 'idle') {
    return { ok: false, error: engineError('WORKER_NOT_IDLE', 'Worker is not idle') };
  }
  const level = state.levels.get(cmd.levelId);
  if (!level) {
    return { ok: false, error: engineError('LEVEL_NOT_FOUND', 'Level not found') };
  }
  const targetCell = cellAt(level, cmd.targetCellX, cmd.targetCellY, balance.chunkSize);
  if (!targetCell) {
    return { ok: false, error: engineError('CELL_NOT_FOUND', 'Target cell not found') };
  }
  if (targetCell.kind !== 'deposit') {
    return { ok: false, error: engineError('CELL_NOT_DEPOSIT', 'Target cell must be a deposit') };
  }
  if (targetCell.accessibility !== 'reachable') {
    return {
      ok: false,
      error: engineError('WORKER_POSITION_UNREACHABLE', 'Target cell is not reachable'),
    };
  }
  // Position must be 4-directionally adjacent to target
  const adx = Math.abs(cmd.positionX - cmd.targetCellX);
  const ady = Math.abs(cmd.positionY - cmd.targetCellY);
  if (adx + ady !== 1) {
    return {
      ok: false,
      error: engineError('WORKER_POSITION_NOT_ADJACENT', 'Position must be adjacent (4-dir) to target'),
    };
  }
  const posCell = cellAt(level, cmd.positionX, cmd.positionY, balance.chunkSize);
  if (!posCell) {
    return { ok: false, error: engineError('CELL_NOT_FOUND', 'Position cell not found') };
  }
  if (posCell.accessibility !== 'reachable') {
    return {
      ok: false,
      error: engineError('WORKER_POSITION_UNREACHABLE', 'Position is not reachable'),
    };
  }
  if (posCell.kind !== 'empty' && posCell.kind !== 'stairs_area') {
    return {
      ok: false,
      error: engineError('WORKER_POSITION_UNREACHABLE', 'Position must be an open (empty) cell'),
    };
  }
  // Check position not occupied by another worker
  for (const w of state.workers.values()) {
    if (w.id === cmd.workerId) continue;
    if (
      w.levelId === cmd.levelId &&
      w.positionX === cmd.positionX &&
      w.positionY === cmd.positionY
    ) {
      return {
        ok: false,
        error: engineError('WORKER_POSITION_OCCUPIED', 'Position is occupied by another worker'),
      };
    }
  }
  // Check max workers per target cell
  let workerCount = 0;
  for (const w of state.workers.values()) {
    if (w.id === cmd.workerId) continue;
    if (
      w.levelId === cmd.levelId &&
      w.targetCellX === cmd.targetCellX &&
      w.targetCellY === cmd.targetCellY
    ) {
      workerCount++;
    }
  }
  if (workerCount >= balance.maxWorkersPerCell) {
    return {
      ok: false,
      error: engineError(
        'CELL_MAX_WORKERS_REACHED',
        `Max ${balance.maxWorkersPerCell} workers per cell`,
      ),
    };
  }
  worker.levelId = cmd.levelId;
  worker.positionX = cmd.positionX;
  worker.positionY = cmd.positionY;
  worker.targetCellX = cmd.targetCellX;
  worker.targetCellY = cmd.targetCellY;
  worker.state = 'working';
  return { ok: true, events: [] };
}

export function applyUnassignWorker(
  state: EngineState,
  cmd: UnassignWorkerCommand,
): ApplyResult {
  const worker = state.workers.get(cmd.workerId);
  if (!worker) {
    return { ok: false, error: engineError('WORKER_NOT_FOUND', 'Worker not found') };
  }
  worker.state = 'idle';
  worker.levelId = null;
  worker.positionX = null;
  worker.positionY = null;
  worker.targetCellX = null;
  worker.targetCellY = null;
  return { ok: true, events: [] };
}

// ---- Queries ----

export function readWorkers(state: EngineState): WorkersResult {
  return {
    type: 'get_workers',
    workers: Array.from(state.workers.values()).map((w) => ({
      id: w.id,
      level: w.level,
      state: w.state,
      levelId: w.levelId,
      positionX: w.positionX,
      positionY: w.positionY,
      targetCellX: w.targetCellX,
      targetCellY: w.targetCellY,
    })),
  };
}

export function readWorkerCosts(state: EngineState, balance: BalanceConfig): WorkerCostsResult {
  const maxLevel = maxPurchasableWorkerLevel(state, balance);
  return {
    type: 'get_worker_costs',
    maxPurchasableLevel: maxLevel,
    costs: Array.from({ length: maxLevel }, (_, i) => {
      const lvl = i + 1;
      const cost = workerCost(lvl, balance);
      return { level: lvl, cost, available: state.money >= cost };
    }),
  };
}

// ---- Internal helpers ----

function cellAt(
  level: LevelData,
  x: number,
  y: number,
  chunkSize: number,
): CellData | undefined {
  const cx = Math.floor(x / chunkSize);
  const cy = Math.floor(y / chunkSize);
  const id = chunkId(level.id, cx, cy);
  const chunk = level.chunks.get(id);
  if (!chunk) return undefined;
  const lx = x - cx * chunkSize;
  const ly = y - cy * chunkSize;
  return chunk.cells[ly * chunkSize + lx];
}
