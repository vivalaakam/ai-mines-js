import { invoke } from '@tauri-apps/api/core';
import type { EngineState } from '@ai-mines/engine';
import type { SaveAdapter } from './saveAdapter.js';
import { deserializeEngineState, serializeEngineState } from './stateJson.js';

/** Native SQLite persistence via Tauri commands (application layer bridge). */
export class TauriSaveAdapter implements SaveAdapter {
  async save(state: EngineState): Promise<void> {
    await invoke('save_game_state', { stateJson: serializeEngineState(state) });
  }

  async load(): Promise<EngineState | null> {
    const raw = await invoke<string | null>('load_game_state');
    if (!raw) return null;
    try {
      return deserializeEngineState(raw);
    } catch {
      return null;
    }
  }
}
