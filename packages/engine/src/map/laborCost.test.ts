import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, resourceId } from '@ai-mines/shared';
import type { ChunkId } from '@ai-mines/shared';
import { generateLevel } from '../generation/LevelGenerator.js';
import type { CellData } from '../state/types.js';
import { updateVisibility } from './visibility.js';
import { computeLaborCost } from './laborCost.js';

const SEED = 'labor-test';
const PARAMS = { seedPhrase: SEED, generatorVersion: 1, chunkSize: DEFAULT_BALANCE.chunkSize };

function makeCell(overrides: Partial<CellData>): CellData {
  return {
    x: 0,
    y: 0,
    kind: 'deposit',
    visibility: 'scouted',
    accessibility: 'reachable',
    workProgress: 0,
    distanceFromEntry: 0,
    components: [
      { type: 'rock', resourceId: null, ratio: 1, initialAmount: 100, remainingAmount: 100 },
    ],
    ...overrides,
  };
}

// --- computeLaborCost ---

describe('computeLaborCost', () => {
  it('returns 0 for non-deposit cell', () => {
    const cell = makeCell({ kind: 'empty', components: [] });
    expect(computeLaborCost(cell, 0, DEFAULT_BALANCE)).toBe(0);
  });

  it('returns 0 when distanceFromEntry is -1', () => {
    const cell = makeCell({ distanceFromEntry: -1 });
    expect(computeLaborCost(cell, 0, DEFAULT_BALANCE)).toBe(0);
  });

  it('at distance 0, depth 0, rock only: equals baseLaborPerDepth', () => {
    const cell = makeCell({ distanceFromEntry: 0 });
    // base = 10 * (0+1) = 10; distMult = 1.01^0 = 1; resMod = 1.0
    expect(computeLaborCost(cell, 0, DEFAULT_BALANCE)).toBeCloseTo(10, 5);
  });

  it('increases with distance', () => {
    const near = makeCell({ distanceFromEntry: 5 });
    const far = makeCell({ distanceFromEntry: 50 });
    expect(computeLaborCost(far, 0, DEFAULT_BALANCE)).toBeGreaterThan(
      computeLaborCost(near, 0, DEFAULT_BALANCE),
    );
  });

  it('increases with depth', () => {
    const cell = makeCell({ distanceFromEntry: 0 });
    expect(computeLaborCost(cell, 3, DEFAULT_BALANCE)).toBeGreaterThan(
      computeLaborCost(cell, 0, DEFAULT_BALANCE),
    );
  });

  it('legendary resource cell costs more than common resource cell', () => {
    const common = makeCell({
      distanceFromEntry: 0,
      components: [
        { type: 'rock', resourceId: null, ratio: 0.5, initialAmount: 50, remainingAmount: 50 },
        {
          type: 'resource',
          resourceId: resourceId('stone'),
          ratio: 0.5,
          initialAmount: 50,
          remainingAmount: 50,
        },
      ],
    });
    const legendary = makeCell({
      distanceFromEntry: 0,
      components: [
        { type: 'rock', resourceId: null, ratio: 0.5, initialAmount: 50, remainingAmount: 50 },
        {
          type: 'resource',
          resourceId: resourceId('adamantite'),
          ratio: 0.5,
          initialAmount: 50,
          remainingAmount: 50,
        },
      ],
    });
    expect(computeLaborCost(legendary, 0, DEFAULT_BALANCE)).toBeGreaterThan(
      computeLaborCost(common, 0, DEFAULT_BALANCE),
    );
  });

  it('rock-only cell uses modifier 1.0', () => {
    const cell = makeCell({ distanceFromEntry: 0 });
    // resMod = 1.0, so cost = baseLaborPerDepth * (depth+1)
    expect(computeLaborCost(cell, 0, DEFAULT_BALANCE)).toBeCloseTo(
      DEFAULT_BALANCE.baseLaborPerDepth * 1,
      5,
    );
  });

  it('distance multiplier is compound: 1.01^distance', () => {
    const d = 100;
    const cell = makeCell({ distanceFromEntry: d });
    const expected = DEFAULT_BALANCE.baseLaborPerDepth * 1 * Math.pow(1.01, d) * 1.0;
    expect(computeLaborCost(cell, 0, DEFAULT_BALANCE)).toBeCloseTo(expected, 5);
  });
});

// --- BFS distanceFromEntry integration ---

function getCell(
  level: ReturnType<typeof generateLevel>,
  x: number,
  y: number,
): CellData | undefined {
  const size = DEFAULT_BALANCE.chunkSize;
  const cx = Math.floor(x / size);
  const cy = Math.floor(y / size);
  const id = `${level.id}:${cx}:${cy}` as ChunkId;
  const chunk = level.chunks.get(id);
  if (!chunk) return undefined;
  const lx = x - cx * size;
  const ly = y - cy * size;
  return chunk.cells[ly * size + lx];
}

describe('distanceFromEntry after updateVisibility', () => {
  it('entry cell has distanceFromEntry = 0', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    const cell = getCell(level, level.entryX, level.entryY);
    expect(cell?.distanceFromEntry).toBe(0);
  });

  it('cell adjacent to entry has distanceFromEntry = 1', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    // Entry zone is 3×3 forced empty — cell directly right of entry
    const cell = getCell(level, level.entryX + 1, level.entryY);
    expect(cell?.distanceFromEntry).toBe(1);
  });

  it('cells farther from entry have higher distanceFromEntry', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    const near = getCell(level, level.entryX + 1, level.entryY);
    const far = getCell(level, level.entryX + 5, level.entryY);
    expect(far?.distanceFromEntry ?? -1).toBeGreaterThan(near?.distanceFromEntry ?? 0);
  });

  it('reachable deposit cells have non-negative distanceFromEntry', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    for (const chunk of level.chunks.values()) {
      for (const cell of chunk.cells) {
        if (cell.accessibility === 'reachable') {
          expect(cell.distanceFromEntry).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('computeLaborCost > 0 for reachable deposit cells', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    let found = false;
    for (const chunk of level.chunks.values()) {
      for (const cell of chunk.cells) {
        if (cell.kind === 'deposit' && cell.accessibility === 'reachable') {
          expect(computeLaborCost(cell, level.depth, DEFAULT_BALANCE)).toBeGreaterThan(0);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });
});
