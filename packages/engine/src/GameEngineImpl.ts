import { DEFAULT_BALANCE, engineError } from '@ai-mines/shared';
import type { BalanceConfig } from '@ai-mines/shared';
import type { ApplyResult, GameEngine } from './GameEngine.js';
import type { EngineCommand } from './commands/types.js';
import type { EngineEvent } from './events/types.js';
import type { EngineQuery, GameStatusResult, QueryResult } from './queries/types.js';
import type { EngineState } from './state/types.js';
import { runExtraction } from './simulation/extraction.js';
import {
  applyBuyStorage,
  applyUpgradeStorage,
  readStorageCosts,
  readStorages,
} from './storage/storageSystem.js';
import { ticksRemainingInShift } from './time/time.js';
import {
  applyAssignWorker,
  applyBuyWorker,
  applyMergeWorkers,
  applyUnassignWorker,
  readWorkerCosts,
  readWorkers,
} from './workers/workerSystem.js';

export class GameEngineImpl implements GameEngine {
  private readonly balance: BalanceConfig;

  // ponytail: balance defaults to DEFAULT_BALANCE so tests/stubs can omit it
  constructor(
    private readonly state: EngineState,
    balance: BalanceConfig = DEFAULT_BALANCE,
  ) {
    this.balance = balance;
  }

  apply(command: EngineCommand): ApplyResult {
    switch (command.type) {
      case 'tick':
        return this.applyTick(command.ticksPassed);
      case 'fast_forward_to_shift_end':
        return this.applyFastForward();
      case 'start_next_shift':
        return this.applyStartNextShift();
      case 'save_game':
        return { ok: true, events: [{ type: 'autosave_requested', reason: 'manual' }] };
      case 'buy_worker':
        return applyBuyWorker(this.state, this.balance, command);
      case 'merge_workers':
        return applyMergeWorkers(this.state, command);
      case 'assign_worker':
        return applyAssignWorker(this.state, this.balance, command);
      case 'unassign_worker':
        return applyUnassignWorker(this.state, command);
      case 'buy_storage':
        return applyBuyStorage(this.state, this.balance, command);
      case 'upgrade_storage':
        return applyUpgradeStorage(this.state, this.balance, command);
      default:
        return {
          ok: false,
          error: engineError('WRONG_PHASE', `Command "${command.type}" not yet implemented`),
        };
    }
  }

  read<Q extends EngineQuery>(query: Q): QueryResult<Q> {
    switch (query.type) {
      case 'get_game_status':
        return this.readGameStatus() as QueryResult<Q>;
      case 'get_workers':
        return readWorkers(this.state) as QueryResult<Q>;
      case 'get_worker_costs':
        return readWorkerCosts(this.state, this.balance) as QueryResult<Q>;
      case 'get_storages':
        return readStorages(this.state) as QueryResult<Q>;
      case 'get_storage_costs': {
        const q = query as import('./queries/types.js').GetStorageCostsQuery;
        return readStorageCosts(this.state, this.balance, q.resourceId) as QueryResult<Q>;
      }
      default:
        throw new Error(`Query "${query.type}" not yet implemented`);
    }
  }

  exportState(): EngineState {
    return this.state;
  }

  // --- apply handlers ---

  private applyTick(ticksPassed: number): ApplyResult {
    if (ticksPassed <= 0) {
      return { ok: false, error: engineError('INVALID_TICK_COUNT', 'ticksPassed must be > 0') };
    }
    if (this.state.phase !== 'shift_running') {
      return {
        ok: false,
        error: engineError('WRONG_PHASE', 'tick is only valid during shift_running'),
      };
    }

    const remaining = ticksRemainingInShift(this.state, this.balance.ticksPerShift);
    const toProcess = Math.min(ticksPassed, remaining);

    const events: EngineEvent[] = [...runExtraction(this.state, this.balance, toProcess)];
    this.state.currentTick += toProcess;

    if (toProcess === remaining) {
      this.state.phase = 'shift_planning';
      events.push({ type: 'shift_completed', shiftNumber: this.state.currentShift });
      events.push({ type: 'autosave_requested', reason: 'shift_completed' });
    }

    return { ok: true, events };
  }

  private applyFastForward(): ApplyResult {
    if (this.state.phase !== 'shift_running') {
      return {
        ok: false,
        error: engineError('WRONG_PHASE', 'fast_forward is only valid during shift_running'),
      };
    }

    const remaining = ticksRemainingInShift(this.state, this.balance.ticksPerShift);
    const extractionEvents = runExtraction(this.state, this.balance, remaining);
    this.state.currentTick += remaining;
    this.state.phase = 'shift_planning';

    return {
      ok: true,
      events: [
        ...extractionEvents,
        { type: 'shift_completed', shiftNumber: this.state.currentShift },
        { type: 'autosave_requested', reason: 'shift_completed' },
      ],
    };
  }

  private applyStartNextShift(): ApplyResult {
    if (this.state.phase !== 'shift_planning') {
      return {
        ok: false,
        error: engineError('WRONG_PHASE', 'start_next_shift is only valid during shift_planning'),
      };
    }

    this.state.currentShift += 1;
    this.state.phase = 'shift_running';

    return { ok: true, events: [] };
  }

  // --- read handlers ---

  private readGameStatus(): GameStatusResult {
    const remaining =
      this.state.phase === 'shift_running'
        ? ticksRemainingInShift(this.state, this.balance.ticksPerShift)
        : 0;

    return {
      type: 'get_game_status',
      phase: this.state.phase,
      currentTick: this.state.currentTick,
      currentShift: this.state.currentShift,
      ticksRemainingInShift: remaining,
      money: this.state.money,
      unlockedResources: this.state.unlockedResources,
      orderAllocationMode: this.state.orderAllocationMode,
    };
  }
}
