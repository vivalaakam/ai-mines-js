import type { EngineState } from '../state/types.js';

export function ticksRemainingInShift(state: EngineState, ticksPerShift: number): number {
  return state.currentShift * ticksPerShift - state.currentTick;
}

// currentShift is 1-based: shift N covers ticks [(N-1)*tps .. N*tps)
// currentTick only advances during shift_running.
// Invariant: currentTick === 0 && currentShift === 0 → not started yet (shift_planning)
//            currentTick === currentShift * ticksPerShift → shift just ended (shift_planning)
