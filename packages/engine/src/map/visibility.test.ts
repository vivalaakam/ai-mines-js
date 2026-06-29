import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '@ai-mines/shared';
import type { ChunkId } from '@ai-mines/shared';
import { generateLevel } from '../generation/LevelGenerator.js';
import { updateVisibility, type VisibilityParams } from './visibility.js';

const SEED = 'vis-test';
const PARAMS: VisibilityParams = {
  seedPhrase: SEED,
  generatorVersion: 1,
  chunkSize: DEFAULT_BALANCE.chunkSize,
};

function getCell(
  level: ReturnType<typeof generateLevel>,
  x: number,
  y: number,
): import('../state/types.js').CellData | undefined {
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

describe('updateVisibility — reachability', () => {
  it('entry cell is reachable', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    const cell = getCell(level, level.entryX, level.entryY);
    expect(cell?.accessibility).toBe('reachable');
  });

  it('obstacle cells are never marked reachable', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    let obstacleCount = 0;
    for (const chunk of level.chunks.values()) {
      for (const cell of chunk.cells) {
        if (cell.kind === 'obstacle') {
          obstacleCount++;
          expect(cell.accessibility).toBe('unreachable');
        }
      }
    }
    // sanity: generated map should have at least some obstacles
    expect(obstacleCount).toBeGreaterThan(0);
  });

  it('corridor cells (no-obstacle) are reachable', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    // The center of the L-corridor: horizontal at entryY, x midway between entry and stairs
    const { entryX, entryY, stairsX } = level;
    const midX = Math.floor((entryX + stairsX) / 2);
    const cell = getCell(level, midX, entryY);
    // Corridor is no-obstacle (deposit or empty), so it must be reachable
    expect(cell?.kind).not.toBe('obstacle');
    expect(cell?.accessibility).toBe('reachable');
  });
});

describe('updateVisibility — scouting', () => {
  it('entry cell is scouted', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    const cell = getCell(level, level.entryX, level.entryY);
    expect(cell?.visibility).toBe('scouted');
  });

  it('cell at exactly scoutRadius distance from entry is scouted', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    const r = DEFAULT_BALANCE.scoutRadius; // 5
    const cell = getCell(level, level.entryX + r, level.entryY);
    expect(cell?.visibility).toBe('scouted');
  });

  it('not all cells are scouted — some remain unknown', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    let unknownCount = 0;
    for (const chunk of level.chunks.values()) {
      for (const cell of chunk.cells) {
        if (cell.visibility === 'unknown') unknownCount++;
      }
    }
    expect(unknownCount).toBeGreaterThan(0);
  });
});

describe('updateVisibility — auto chunk generation', () => {
  it('generates chunks beyond initial radius when scout hits boundary', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    const initialChunkCount = level.chunks.size; // 25
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    expect(level.chunks.size).toBeGreaterThan(initialChunkCount);
  });
});

describe('updateVisibility — empty flood-fill', () => {
  it('scouted empty cells reveal connected empties beyond scout radius', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    // Every scouted empty cell's 4-neighbors that are empty should also be scouted
    let violation = false;
    for (const chunk of level.chunks.values()) {
      for (const cell of chunk.cells) {
        if (cell.visibility === 'scouted' && cell.kind === 'empty') {
          for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ] as const) {
            const neighbor = getCell(level, cell.x + dx, cell.y + dy);
            if (neighbor?.kind === 'empty' && neighbor.visibility === 'unknown') {
              violation = true;
            }
          }
        }
      }
    }
    expect(violation).toBe(false);
  });
});

describe('updateVisibility — monotonic', () => {
  it('second call never reduces reachable or scouted cell counts', () => {
    const level = generateLevel(
      { seedPhrase: SEED, generatorVersion: 1, depth: 0 },
      DEFAULT_BALANCE,
    );
    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    let reachable1 = 0,
      scouted1 = 0;
    for (const chunk of level.chunks.values()) {
      for (const cell of chunk.cells) {
        if (cell.accessibility === 'reachable') reachable1++;
        if (cell.visibility === 'scouted') scouted1++;
      }
    }

    updateVisibility(level, PARAMS, DEFAULT_BALANCE.scoutRadius);
    let reachable2 = 0,
      scouted2 = 0;
    for (const chunk of level.chunks.values()) {
      for (const cell of chunk.cells) {
        if (cell.accessibility === 'reachable') reachable2++;
        if (cell.visibility === 'scouted') scouted2++;
      }
    }

    expect(reachable2).toBeGreaterThanOrEqual(reachable1);
    expect(scouted2).toBeGreaterThanOrEqual(scouted1);
  });
});
