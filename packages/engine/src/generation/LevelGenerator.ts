import { levelId as makeLevelId } from '@ai-mines/shared';
import type { BalanceConfig } from '@ai-mines/shared';
import type { LevelData } from '../state/types.js';
import { generateChunk, type CellForce } from './ChunkGenerator.js';
import { createRng, hashString } from './rng.js';

export interface LevelGenConfig {
  readonly seedPhrase: string;
  readonly generatorVersion: number;
  readonly depth: number;
}

export function generateLevel(config: LevelGenConfig, balance: BalanceConfig): LevelData {
  const { seedPhrase, generatorVersion, depth } = config;
  const { chunkSize, initialChunkRadius } = balance;

  const id = makeLevelId(`level-${depth}`);
  const half = Math.floor(chunkSize / 2);

  // Entry is at center of chunk (0,0)
  const entryCenterX = half; // 16 for chunkSize=32
  const entryCenterY = half;

  // Pick stairs chunk using a deterministic seed separate from cell generation
  const stairsRng = createRng(hashString(`${seedPhrase}:v${generatorVersion}:d${depth}:stairs`));
  const { cx: stairsCX, cy: stairsCY } = pickStairsChunk(stairsRng, initialChunkRadius);
  const stairsCenterX = stairsCX * chunkSize + half;
  const stairsCenterY = stairsCY * chunkSize + half;

  // Build forced-cell and no-obstacle sets for all initial chunks
  const forcedCells = new Map<string, CellForce>();
  const noObstacleCells = new Set<string>();

  // Entry zone: 3×3 empty, scouted, reachable
  markZone(forcedCells, entryCenterX, entryCenterY, 1, {
    kind: 'empty',
    visibility: 'scouted',
    accessibility: 'reachable',
  });

  // Stairs zone: 3×3 stairs_area, unknown, unreachable (until player digs to it)
  markZone(forcedCells, stairsCenterX, stairsCenterY, 1, {
    kind: 'stairs_area',
    visibility: 'unknown',
    accessibility: 'unreachable',
  });

  // Guarantee a mineable path (no obstacles) from entry to stairs
  markCorridor(noObstacleCells, entryCenterX, entryCenterY, stairsCenterX, stairsCenterY);

  // Generate all chunks in the initial area
  const chunks: LevelData['chunks'] = new Map();
  const r = initialChunkRadius;

  for (let cy = -r; cy <= r; cy++) {
    for (let cx = -r; cx <= r; cx++) {
      const chunk = generateChunk({
        seedPhrase,
        generatorVersion,
        levelDepth: depth,
        chunkX: cx,
        chunkY: cy,
        chunkSize,
        levelId: id,
        forcedCells,
        noObstacleCells,
      });
      chunks.set(chunk.id, chunk);
    }
  }

  return {
    id,
    depth,
    entryX: entryCenterX,
    entryY: entryCenterY,
    stairsX: stairsCenterX,
    stairsY: stairsCenterY,
    chunks,
  };
}

/** All non-center chunks in the initial area with Manhattan distance ≥ 2 from center */
function pickStairsChunk(rng: () => number, radius: number): { cx: number; cy: number } {
  const candidates: Array<{ cx: number; cy: number }> = [];
  for (let cy = -radius; cy <= radius; cy++) {
    for (let cx = -radius; cx <= radius; cx++) {
      if (cx === 0 && cy === 0) continue;
      if (Math.abs(cx) + Math.abs(cy) < 2) continue;
      candidates.push({ cx, cy });
    }
  }
  const idx = Math.floor(rng() * candidates.length);
  const picked = candidates[idx];
  // candidates is always non-empty for radius >= 1
  return picked ?? { cx: 2, cy: 0 };
}

/** Mark a (2*r+1)×(2*r+1) square of forced cells */
function markZone(
  forcedCells: Map<string, CellForce>,
  cx: number,
  cy: number,
  r: number,
  force: CellForce,
): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      forcedCells.set(`${cx + dx},${cy + dy}`, force);
    }
  }
}

/**
 * L-shaped corridor from (x1,y1) to (x2,y2), 3 cells wide.
 * Marks cells as no-obstacle so a mineable path always exists.
 */
function markCorridor(
  noObstacleCells: Set<string>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  // Horizontal segment at y1
  for (let x = minX; x <= maxX; x++) {
    for (let dy = -1; dy <= 1; dy++) {
      noObstacleCells.add(`${x},${y1 + dy}`);
    }
  }
  // Vertical segment at x2
  for (let y = minY; y <= maxY; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      noObstacleCells.add(`${x2 + dx},${y}`);
    }
  }
}
