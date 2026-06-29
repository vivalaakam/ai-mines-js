import { describe, expect, it } from 'vitest';
import { GameEngineFactory } from './GameEngine.js';

describe('balance config', () => {
  it('default ticksPerShift is 300', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'seed' });
    engine.apply({ type: 'start_next_shift' });
    const status = engine.read({ type: 'get_game_status' });
    expect(status.ticksRemainingInShift).toBe(300);
  });

  it('custom ticksPerShift changes shift length', () => {
    const engine = GameEngineFactory.createNew({
      seedPhrase: 'seed',
      balance: { ticksPerShift: 60 },
    });
    engine.apply({ type: 'start_next_shift' });
    const status = engine.read({ type: 'get_game_status' });
    expect(status.ticksRemainingInShift).toBe(60);
  });

  it('shift ends at custom ticksPerShift', () => {
    const engine = GameEngineFactory.createNew({
      seedPhrase: 'seed',
      balance: { ticksPerShift: 10 },
    });
    engine.apply({ type: 'start_next_shift' });
    engine.apply({ type: 'tick', ticksPassed: 10 });
    expect(engine.read({ type: 'get_game_status' }).phase).toBe('shift_planning');
  });

  it('orderAllocationMode from balance is stored in state', () => {
    const engine = GameEngineFactory.createNew({
      seedPhrase: 'seed',
      balance: { orderAllocationMode: 'proportional' },
    });
    expect(engine.read({ type: 'get_game_status' }).orderAllocationMode).toBe('proportional');
  });

  it('default orderAllocationMode is priority_based', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'seed' });
    expect(engine.read({ type: 'get_game_status' }).orderAllocationMode).toBe('priority_based');
  });

  it('startingMoney is configurable', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'seed', startingMoney: 500 });
    expect(engine.read({ type: 'get_game_status' }).money).toBe(500);
  });

  it('createFromState restores balance override', () => {
    const engine = GameEngineFactory.createNew({
      seedPhrase: 'seed',
      balance: { ticksPerShift: 50 },
    });
    engine.apply({ type: 'start_next_shift' });
    const state = engine.exportState();

    const restored = GameEngineFactory.createFromState(state, { ticksPerShift: 50 });
    expect(restored.read({ type: 'get_game_status' }).ticksRemainingInShift).toBe(50);
  });
});
