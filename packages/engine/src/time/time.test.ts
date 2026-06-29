import { describe, expect, it } from 'vitest';
import { GameEngineFactory } from '../GameEngine.js';

const TICKS = 300;

function newGame(): ReturnType<typeof GameEngineFactory.createNew> {
  return GameEngineFactory.createNew({ seedPhrase: 'test-seed' });
}

describe('time system — phases', () => {
  it('new game starts in shift_planning', () => {
    const engine = newGame();
    const status = engine.read({ type: 'get_game_status' });
    expect(status.phase).toBe('shift_planning');
    expect(status.currentShift).toBe(0);
    expect(status.currentTick).toBe(0);
  });

  it('start_next_shift transitions to shift_running', () => {
    const engine = newGame();
    const result = engine.apply({ type: 'start_next_shift' });
    expect(result.ok).toBe(true);
    expect(engine.read({ type: 'get_game_status' }).phase).toBe('shift_running');
    expect(engine.read({ type: 'get_game_status' }).currentShift).toBe(1);
  });

  it('tick rejected in shift_planning', () => {
    const engine = newGame();
    const result = engine.apply({ type: 'tick', ticksPassed: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });

  it('start_next_shift rejected in shift_running', () => {
    const engine = newGame();
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'start_next_shift' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });
});

describe('time system — tick', () => {
  it('tick advances currentTick', () => {
    const engine = newGame();
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'tick', ticksPassed: 50 });
    const status = engine.read({ type: 'get_game_status' });
    expect(status.currentTick).toBe(50);
    expect(status.ticksRemainingInShift).toBe(TICKS - 50);
  });

  it('tick does not cross shift boundary — processes only remaining', () => {
    const engine = newGame();
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'tick', ticksPassed: 250 });
    // 50 ticks remain; send 200 — only 50 should process
    const result = engine.apply({ type: 'tick', ticksPassed: 200 });
    expect(result.ok).toBe(true);
    const status = engine.read({ type: 'get_game_status' });
    expect(status.currentTick).toBe(TICKS);
    expect(status.phase).toBe('shift_planning');
  });

  it('tick exactly at shift end emits shift_completed + autosave_requested', () => {
    const engine = newGame();
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'tick', ticksPassed: TICKS });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const types = result.events.map((e) => e.type);
    expect(types).toContain('shift_completed');
    expect(types).toContain('autosave_requested');
  });

  it('tick zero is rejected', () => {
    const engine = newGame();
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'tick', ticksPassed: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_TICK_COUNT');
  });

  it('mid-shift tick emits no events', () => {
    const engine = newGame();
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'tick', ticksPassed: 100 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.events).toHaveLength(0);
  });
});

describe('time system — fast_forward', () => {
  it('fast_forward completes current shift', () => {
    const engine = newGame();
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'tick', ticksPassed: 150 });
    const result = engine.apply({ type: 'fast_forward_to_shift_end' });
    expect(result.ok).toBe(true);
    const status = engine.read({ type: 'get_game_status' });
    expect(status.phase).toBe('shift_planning');
    expect(status.currentTick).toBe(TICKS);
  });

  it('fast_forward emits shift_completed and autosave_requested', () => {
    const engine = newGame();
    engine.apply({ type: 'start_next_shift' });
    const result = engine.apply({ type: 'fast_forward_to_shift_end' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const types = result.events.map((e) => e.type);
    expect(types).toContain('shift_completed');
    expect(types).toContain('autosave_requested');
  });

  it('fast_forward rejected in shift_planning', () => {
    const engine = newGame();
    const result = engine.apply({ type: 'fast_forward_to_shift_end' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });
});

describe('time system — multiple shifts', () => {
  it('two full shifts accumulate ticks correctly', () => {
    const engine = newGame();

    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'fast_forward_to_shift_end' });
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'fast_forward_to_shift_end' });

    const status = engine.read({ type: 'get_game_status' });
    expect(status.currentTick).toBe(TICKS * 2);
    expect(status.currentShift).toBe(2);
    expect(status.phase).toBe('shift_planning');
  });

  it('ticksRemainingInShift resets to ticksPerShift after new shift starts', () => {
    const engine = newGame();
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'fast_forward_to_shift_end' });
    engine.apply({ type: 'start_next_shift' });

    const status = engine.read({ type: 'get_game_status' });
    expect(status.ticksRemainingInShift).toBe(TICKS);
  });
});

describe('save_game command', () => {
  it('returns autosave_requested with reason manual', () => {
    const engine = newGame();
    const result = engine.apply({ type: 'save_game' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toContainEqual({ type: 'autosave_requested', reason: 'manual' });
  });
});
