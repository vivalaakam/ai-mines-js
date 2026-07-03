import type { EngineState } from '@ai-mines/engine';

/** Application-layer persistence contract (see docs/persistence.md). */
export interface SaveAdapter {
  save(state: EngineState): Promise<void>;
  load(): Promise<EngineState | null>;
}
