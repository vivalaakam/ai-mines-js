import type { CellAccessibility, CellKind, CellVisibility } from '@ai-mines/shared';
import type { LevelId } from '@ai-mines/shared';
import { chunkId } from '@ai-mines/shared';
import type { CellData, ChunkData } from '../state/types.js';
import { generateCellComponents } from './ComponentGenerator.js';
import { createRng, makeChunkSeed } from './rng.js';

export interface CellForce {
  readonly kind: CellKind;
  readonly visibility: CellVisibility;
  readonly accessibility: CellAccessibility;
}

export interface GenerateChunkParams {
  readonly seedPhrase: string;
  readonly generatorVersion: number;
  readonly levelDepth: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly chunkSize: number;
  readonly levelId: LevelId;
  /** world "x,y" → forced kind/visibility/accessibility */
  readonly forcedCells: ReadonlyMap<string, CellForce>;
  /** world "x,y" → obstacle forbidden here (deposit or empty only) */
  readonly noObstacleCells: ReadonlySet<string>;
}

const OBSTACLE_THRESHOLD = 0.03;
const EMPTY_THRESHOLD = 0.12;

export function generateChunk(params: GenerateChunkParams): ChunkData {
  const {
    seedPhrase,
    generatorVersion,
    levelDepth,
    chunkX,
    chunkY,
    chunkSize,
    levelId,
    forcedCells,
    noObstacleCells,
  } = params;

  const seed = makeChunkSeed(seedPhrase, generatorVersion, levelDepth, chunkX, chunkY);
  const rng = createRng(seed);

  const cells: CellData[] = [];
  const baseX = chunkX * chunkSize;
  const baseY = chunkY * chunkSize;

  for (let ly = 0; ly < chunkSize; ly++) {
    for (let lx = 0; lx < chunkSize; lx++) {
      const wx = baseX + lx;
      const wy = baseY + ly;
      const key = `${wx},${wy}`;
      const force = forcedCells.get(key);

      let kind: CellKind;
      let visibility: CellVisibility = 'unknown';
      let accessibility: CellAccessibility = 'unreachable';

      if (force !== undefined) {
        kind = force.kind;
        visibility = force.visibility;
        accessibility = force.accessibility;
      } else {
        const v = rng();
        if (v < OBSTACLE_THRESHOLD && !noObstacleCells.has(key)) {
          kind = 'obstacle';
        } else if (v < EMPTY_THRESHOLD) {
          kind = 'empty';
        } else {
          kind = 'deposit';
        }
      }

      const components =
        kind === 'deposit'
          ? generateCellComponents({
              seedPhrase,
              generatorVersion,
              levelDepth,
              worldX: wx,
              worldY: wy,
            })
          : [];

      cells.push({ x: wx, y: wy, kind, visibility, accessibility, workProgress: 0, components });
    }
  }

  return {
    id: chunkId(levelId, chunkX, chunkY),
    chunkX,
    chunkY,
    generatedAt: 0,
    cells,
  };
}
