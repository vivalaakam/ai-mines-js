import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '@ai-mines/shared';
import { generateLevel } from './LevelGenerator.js';
import { generateCellComponents } from './ComponentGenerator.js';
import { isFullyExtracted, markExtractedIfDone } from '../simulation/cellExtraction.js';
import type { CellData } from '../state/types.js';

const baseParams = { seedPhrase: 'test', generatorVersion: 1, levelDepth: 0 };

// --- ComponentGenerator ---

describe('ComponentGenerator', () => {
  it('deposit at depth 0 always has rock component', () => {
    const comps = generateCellComponents({ ...baseParams, worldX: 20, worldY: 20 });
    expect(comps.some((c) => c.type === 'rock')).toBe(true);
  });

  it('ratios sum to ~1', () => {
    const comps = generateCellComponents({ ...baseParams, worldX: 20, worldY: 20 });
    const sum = comps.reduce((s, c) => s + c.ratio, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('initialAmount equals remainingAmount on generation', () => {
    const comps = generateCellComponents({ ...baseParams, worldX: 25, worldY: 25 });
    for (const c of comps) {
      expect(c.remainingAmount).toBe(c.initialAmount);
    }
  });

  it('all amounts are positive', () => {
    const comps = generateCellComponents({ ...baseParams, worldX: 30, worldY: 30 });
    for (const c of comps) {
      expect(c.initialAmount).toBeGreaterThan(0);
    }
  });

  it('resource components reference valid resourceIds', () => {
    const comps = generateCellComponents({ ...baseParams, worldX: 22, worldY: 18 });
    const resComps = comps.filter((c) => c.type === 'resource');
    for (const c of resComps) {
      expect(c.resourceId).not.toBeNull();
    }
  });

  it('deeper levels have larger total amounts', () => {
    const shallow = generateCellComponents({
      ...baseParams,
      levelDepth: 0,
      worldX: 20,
      worldY: 20,
    });
    const deep = generateCellComponents({ ...baseParams, levelDepth: 10, worldX: 20, worldY: 20 });
    const sumShallow = shallow.reduce((s, c) => s + c.initialAmount, 0);
    const sumDeep = deep.reduce((s, c) => s + c.initialAmount, 0);
    expect(sumDeep).toBeGreaterThan(sumShallow);
  });

  it('deterministic — same params give same result', () => {
    const a = generateCellComponents({ ...baseParams, worldX: 25, worldY: 35 });
    const b = generateCellComponents({ ...baseParams, worldX: 25, worldY: 35 });
    expect(a).toEqual(b);
  });

  it('different positions give different components (most of the time)', () => {
    const a = generateCellComponents({ ...baseParams, worldX: 20, worldY: 20 });
    const b = generateCellComponents({ ...baseParams, worldX: 21, worldY: 20 });
    const differ = JSON.stringify(a) !== JSON.stringify(b);
    expect(differ).toBe(true);
  });

  it('resource components only reference resources available at depth', () => {
    // depth 0: only stone(0) and coal(0) are available
    const comps = generateCellComponents({ ...baseParams, levelDepth: 0, worldX: 20, worldY: 20 });
    const resIds = comps.filter((c) => c.type === 'resource').map((c) => c.resourceId);
    for (const id of resIds) {
      expect(['stone', 'coal']).toContain(id);
    }
  });

  it('at depth 5, deeper resources may appear', () => {
    // depth 5 unlocks crystal (minDepth=4), emerald (minDepth=5)
    const samples = Array.from({ length: 20 }, (_, i) =>
      generateCellComponents({ ...baseParams, levelDepth: 5, worldX: i * 3, worldY: i * 7 }),
    );
    const allIds = new Set(
      samples.flatMap((s) => s.filter((c) => c.type === 'resource').map((c) => c.resourceId)),
    );
    // At depth 5, at least some deeper resources should appear across 20 cells
    const hasDeepRes = [...allIds].some(
      (id) => id !== null && !['stone', 'coal', 'iron', 'copper'].includes(id),
    );
    expect(hasDeepRes).toBe(true);
  });
});

// --- ChunkGenerator integration ---

describe('ChunkGenerator — deposit cells have components', () => {
  it('every deposit cell has at least one component', () => {
    const level = generateLevel(
      { seedPhrase: 'test', generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    let depositCount = 0;
    for (const chunk of level.chunks.values()) {
      for (const cell of chunk.cells) {
        if (cell.kind === 'deposit') {
          depositCount++;
          expect(cell.components.length).toBeGreaterThan(0);
        }
      }
    }
    expect(depositCount).toBeGreaterThan(0);
  });

  it('empty and obstacle cells have no components', () => {
    const level = generateLevel(
      { seedPhrase: 'test', generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    for (const chunk of level.chunks.values()) {
      for (const cell of chunk.cells) {
        if (cell.kind !== 'deposit') {
          expect(cell.components).toHaveLength(0);
        }
      }
    }
  });
});

// --- cellExtraction ---

function makeDepositCell(remainingAmounts: number[]): CellData {
  return {
    x: 0,
    y: 0,
    kind: 'deposit',
    visibility: 'scouted',
    accessibility: 'reachable',
    workProgress: 0,
    distanceFromEntry: 0,
    components: remainingAmounts.map((rem, i) => ({
      type: i === 0 ? 'rock' : 'resource',
      resourceId: null,
      ratio: 1 / remainingAmounts.length,
      initialAmount: 10,
      remainingAmount: rem,
    })),
  };
}

describe('cellExtraction', () => {
  it('isFullyExtracted returns false when components have remaining', () => {
    const cell = makeDepositCell([10, 5]);
    expect(isFullyExtracted(cell)).toBe(false);
  });

  it('isFullyExtracted returns true when all remainingAmount === 0', () => {
    const cell = makeDepositCell([0, 0]);
    expect(isFullyExtracted(cell)).toBe(true);
  });

  it('markExtractedIfDone transitions cell to empty and returns true', () => {
    const cell = makeDepositCell([0, 0]);
    const cleared = markExtractedIfDone(cell);
    expect(cleared).toBe(true);
    expect(cell.kind).toBe('empty');
    expect(cell.workProgress).toBe(0);
  });

  it('markExtractedIfDone returns false when not done', () => {
    const cell = makeDepositCell([5, 0]);
    const cleared = markExtractedIfDone(cell);
    expect(cleared).toBe(false);
    expect(cell.kind).toBe('deposit');
  });

  it('non-deposit cell is never extracted', () => {
    const cell: CellData = {
      x: 0,
      y: 0,
      kind: 'empty',
      visibility: 'scouted',
      accessibility: 'reachable',
      workProgress: 0,
      distanceFromEntry: 0,
      components: [],
    };
    expect(isFullyExtracted(cell)).toBe(false);
  });
});
