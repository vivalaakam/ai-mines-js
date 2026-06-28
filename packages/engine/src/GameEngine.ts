import type { EngineError } from '@ai-mines/shared';
import type { EngineCommand } from './commands/types.js';
import type { EngineEvent } from './events/types.js';
import type { EngineQuery, QueryResult } from './queries/types.js';
import type { EngineState, NewGameConfig } from './state/types.js';

export type ApplyResult =
  | { readonly ok: true; readonly events: EngineEvent[] }
  | { readonly ok: false; readonly error: EngineError };

export interface GameEngine {
  apply(command: EngineCommand): ApplyResult;
  read<Q extends EngineQuery>(query: Q): QueryResult<Q>;
  exportState(): EngineState;
}

export class GameEngineFactory {
  static createNew(_config: NewGameConfig): GameEngine {
    throw new Error('Not implemented — see T-005+');
  }

  static createFromState(_state: EngineState): GameEngine {
    throw new Error('Not implemented — see T-017');
  }
}
