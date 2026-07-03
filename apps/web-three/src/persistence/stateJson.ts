import type { EngineState } from '@ai-mines/engine';

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { __map: true, entries: [...value.entries()] };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).__map === true) {
    return new Map((value as { entries: [unknown, unknown][] }).entries);
  }
  return value;
}

export function serializeEngineState(state: EngineState): string {
  return JSON.stringify(state, replacer);
}

export function deserializeEngineState(raw: string): EngineState {
  return JSON.parse(raw, reviver) as EngineState;
}
