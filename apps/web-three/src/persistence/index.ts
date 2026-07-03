import type { SaveAdapter } from './saveAdapter.js';
import { LocalStorageSaveAdapter } from './localStorageSaveAdapter.js';
import { TauriSaveAdapter } from './tauriSaveAdapter.js';

export type { SaveAdapter } from './saveAdapter.js';
export { LocalStorageSaveAdapter } from './localStorageSaveAdapter.js';
export { TauriSaveAdapter } from './tauriSaveAdapter.js';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function createSaveAdapter(): SaveAdapter {
  return isTauriRuntime() ? new TauriSaveAdapter() : new LocalStorageSaveAdapter();
}
