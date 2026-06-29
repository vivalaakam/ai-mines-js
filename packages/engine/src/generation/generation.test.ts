import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '@ai-mines/shared';
import { GameEngineFactory } from '../GameEngine.js';
import { generateLevel } from './LevelGenerator.js';

const CHUNK_SIZE = 32;
const HALF = Math.floor(CHUNK_SIZE / 2); // 16

const cfg = {
  seedPhrase: 'test-seed',
  generatorVersion: 1,
  depth: 0,
};

function getCell(
  level: ReturnType<typeof generateLevel>,
  wx: number,
  wy: number,
): import('../state/types.js').CellData | undefined {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cy = Math.floor(wy / CHUNK_SIZE);
  // Handle negative coordinates (floor rounds toward -∞ which is correct)
  const chunkX =
    wx >= 0 ? Math.floor(wx / CHUNK_SIZE) : Math.ceil((wx - CHUNK_SIZE + 1) / CHUNK_SIZE);
  const chunkY =
    wy >= 0 ? Math.floor(wy / CHUNK_SIZE) : Math.ceil((wy - CHUNK_SIZE + 1) / CHUNK_SIZE);
  void cx;
  void cy;
  const chunkKey = `${level.id}:${chunkX}:${chunkY}`;
  const chunk = level.chunks.get(chunkKey as import('@ai-mines/shared').ChunkId);
  return chunk?.cells.find((c) => c.x === wx && c.y === wy);
}

describe('LevelGenerator — structure', () => {
  it('generates (2*r+1)² chunks', () => {
    const level = generateLevel(cfg, DEFAULT_BALANCE);
    const r = DEFAULT_BALANCE.initialChunkRadius; // 2
    expect(level.chunks.size).toBe((2 * r + 1) ** 2); // 25
  });

  it('entry point is at chunk(0,0) center', () => {
    const level = generateLevel(cfg, DEFAULT_BALANCE);
    expect(level.entryX).toBe(HALF);
    expect(level.entryY).toBe(HALF);
  });

  it('stairs are in a non-center chunk', () => {
    const level = generateLevel(cfg, DEFAULT_BALANCE);
    const stairsCX = Math.floor(level.stairsX / CHUNK_SIZE);
    const stairsCY = Math.floor(level.stairsY / CHUNK_SIZE);
    expect(stairsCX === 0 && stairsCY === 0).toBe(false);
  });

  it('stairs chunk is at Manhattan distance ≥ 2 from center', () => {
    const level = generateLevel(cfg, DEFAULT_BALANCE);
    const stairsCX = Math.floor(level.stairsX / CHUNK_SIZE);
    const stairsCY = Math.floor(level.stairsY / CHUNK_SIZE);
    expect(Math.abs(stairsCX) + Math.abs(stairsCY)).toBeGreaterThanOrEqual(2);
  });
});

describe('LevelGenerator — entry zone', () => {
  it('entry 3×3 cells are empty, scouted, reachable', () => {
    const level = generateLevel(cfg, DEFAULT_BALANCE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell = getCell(level, level.entryX + dx, level.entryY + dy);
        expect(cell).toBeDefined();
        expect(cell?.kind).toBe('empty');
        expect(cell?.visibility).toBe('scouted');
        expect(cell?.accessibility).toBe('reachable');
      }
    }
  });
});

describe('LevelGenerator — stairs zone', () => {
  it('stairs 3×3 cells are stairs_area', () => {
    const level = generateLevel(cfg, DEFAULT_BALANCE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell = getCell(level, level.stairsX + dx, level.stairsY + dy);
        expect(cell).toBeDefined();
        expect(cell?.kind).toBe('stairs_area');
      }
    }
  });
});

describe('LevelGenerator — corridor guarantee', () => {
  it('no obstacles on the L-path from entry to stairs', () => {
    const level = generateLevel(cfg, DEFAULT_BALANCE);
    const { entryX: ex, entryY: ey, stairsX: sx, stairsY: sy } = level;

    const minX = Math.min(ex, sx);
    const maxX = Math.max(ex, sx);

    // Horizontal segment at ey
    for (let x = minX; x <= maxX; x++) {
      const cell = getCell(level, x, ey);
      expect(cell?.kind).not.toBe('obstacle');
    }

    // Vertical segment at sx
    const minY = Math.min(ey, sy);
    const maxY = Math.max(ey, sy);
    for (let y = minY; y <= maxY; y++) {
      const cell = getCell(level, sx, y);
      expect(cell?.kind).not.toBe('obstacle');
    }
  });
});

describe('LevelGenerator — determinism', () => {
  it('same seed produces identical level', () => {
    const a = generateLevel(cfg, DEFAULT_BALANCE);
    const b = generateLevel(cfg, DEFAULT_BALANCE);
    expect(a.stairsX).toBe(b.stairsX);
    expect(a.stairsY).toBe(b.stairsY);
    expect(a.chunks.size).toBe(b.chunks.size);

    // Spot-check a few cells
    const cellA = getCell(a, 20, 20);
    const cellB = getCell(b, 20, 20);
    expect(cellA?.kind).toBe(cellB?.kind);
  });

  it('different seeds produce different stairs positions (high probability)', () => {
    const a = generateLevel(cfg, DEFAULT_BALANCE);
    const b = generateLevel({ ...cfg, seedPhrase: 'other-seed' }, DEFAULT_BALANCE);
    // Different seeds should usually differ; allow for the rare collision
    const differ = a.stairsX !== b.stairsX || a.stairsY !== b.stairsY;
    expect(differ).toBe(true);
  });

  it('different depths produce different maps (sampled)', () => {
    const a = generateLevel({ ...cfg, depth: 0 }, DEFAULT_BALANCE);
    const b = generateLevel({ ...cfg, depth: 1 }, DEFAULT_BALANCE);
    // Sample 20 cells outside the forced zones; expect at least one to differ
    const testCoords = [
      [25, 25],
      [28, 28],
      [30, 20],
      [20, 30],
      [22, 24],
      [26, 19],
      [31, 31],
      [19, 22],
      [29, 27],
      [23, 23],
      [25, 30],
      [30, 25],
      [28, 22],
      [22, 28],
      [27, 27],
      [24, 30],
      [30, 24],
      [21, 21],
      [29, 21],
      [21, 29],
    ];
    let diffCount = 0;
    for (const coord of testCoords) {
      const x = coord[0] ?? 25;
      const y = coord[1] ?? 25;
      if (getCell(a, x, y)?.kind !== getCell(b, x, y)?.kind) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(0);
  });
});

describe('GameEngineFactory — level in state', () => {
  it('createNew populates one level in state', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'seed' });
    const state = engine.exportState();
    expect(state.levels.size).toBe(1);
  });

  it('exported level has entry and stairs', () => {
    const engine = GameEngineFactory.createNew({ seedPhrase: 'seed' });
    const state = engine.exportState();
    const [level] = state.levels.values();
    expect(level?.entryX).toBe(HALF);
    expect(level?.stairsX).toBeDefined();
  });
});
