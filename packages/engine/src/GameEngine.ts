import { DEFAULT_BALANCE, engineError } from '@ai-mines/shared';
import type { BalanceConfig, EngineError } from '@ai-mines/shared';
import { GameEngineImpl } from './GameEngineImpl.js';
import type { EngineCommand } from './commands/types.js';
import type { EngineEvent } from './events/types.js';
import { generateLevel } from './generation/LevelGenerator.js';
import { updateVisibility } from './map/visibility.js';
import type { EngineQuery, QueryResult } from './queries/types.js';
import type { EngineState, NewGameConfig } from './state/types.js';
import { makeInitialState } from './state/makeInitialState.js';

export type ApplyResult =
  | { readonly ok: true; readonly events: EngineEvent[] }
  | { readonly ok: false; readonly error: EngineError };

export interface GameEngine {
  apply(command: EngineCommand): ApplyResult;
  read<Q extends EngineQuery>(query: Q): QueryResult<Q>;
  exportState(): EngineState;
}

function resolveBalance(override?: Partial<BalanceConfig>): BalanceConfig {
  return { ...DEFAULT_BALANCE, ...override };
}

export class GameEngineFactory {
  static createNew(config: NewGameConfig): GameEngine {
    if (!config.seedPhrase.trim()) {
      throw new Error(engineError('WRONG_PHASE', 'seedPhrase must not be empty').message);
    }
    const balance = resolveBalance(config.balance);
    const state = makeInitialState(config, balance);

    // Generate the first level (depth 0)
    const level = generateLevel(
      { seedPhrase: config.seedPhrase, generatorVersion: state.generatorVersion, depth: 0 },
      balance,
    );
    state.levels.set(level.id, level);
    updateVisibility(
      level,
      {
        seedPhrase: config.seedPhrase,
        generatorVersion: state.generatorVersion,
        chunkSize: balance.chunkSize,
      },
      balance.scoutRadius,
    );

    return new GameEngineImpl(state, balance);
  }

  static createFromState(state: EngineState, balanceOverride?: Partial<BalanceConfig>): GameEngine {
    return new GameEngineImpl(state, resolveBalance(balanceOverride));
  }
}
