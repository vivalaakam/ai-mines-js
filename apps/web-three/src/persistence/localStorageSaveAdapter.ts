import type { EngineState } from '@ai-mines/engine';
import type { SaveAdapter } from './saveAdapter.js';
import { deserializeEngineState, serializeEngineState } from './stateJson.js';

const SAVE_KEY = 'ai-mines-save';

/** Browser dev fallback when not running inside Tauri. */
export class LocalStorageSaveAdapter implements SaveAdapter {
  async save(state: EngineState): Promise<void> {
    try {
      localStorage.setItem(SAVE_KEY, serializeEngineState(state));
    } catch {
      console.warn('[mines] localStorage save failed');
    }
  }

  async load(): Promise<EngineState | null> {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      return deserializeEngineState(raw);
    } catch {
      return null;
    }
  }
}
