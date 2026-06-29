import { chunkId } from '@ai-mines/shared';
import { generateChunk } from '../generation/ChunkGenerator.js';
import type { CellData, ChunkData, LevelData } from '../state/types.js';

export interface VisibilityParams {
  readonly seedPhrase: string;
  readonly generatorVersion: number;
  readonly chunkSize: number;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function chunkOf(x: number, y: number, size: number): { readonly cx: number; readonly cy: number } {
  return { cx: Math.floor(x / size), cy: Math.floor(y / size) };
}

function getOrGenChunk(level: LevelData, cx: number, cy: number, p: VisibilityParams): ChunkData {
  const id = chunkId(level.id, cx, cy);
  let chunk = level.chunks.get(id);
  if (!chunk) {
    chunk = generateChunk({
      seedPhrase: p.seedPhrase,
      generatorVersion: p.generatorVersion,
      levelDepth: level.depth,
      chunkX: cx,
      chunkY: cy,
      chunkSize: p.chunkSize,
      levelId: level.id,
      forcedCells: new Map(),
      noObstacleCells: new Set(),
    });
    level.chunks.set(id, chunk);
  }
  return chunk;
}

function cellAt(
  level: LevelData,
  x: number,
  y: number,
  p: VisibilityParams,
  gen: boolean,
): CellData | undefined {
  const { cx, cy } = chunkOf(x, y, p.chunkSize);
  const id = chunkId(level.id, cx, cy);
  let chunk = level.chunks.get(id);
  if (!chunk) {
    if (!gen) return undefined;
    chunk = getOrGenChunk(level, cx, cy, p);
  }
  const lx = x - cx * p.chunkSize;
  const ly = y - cy * p.chunkSize;
  return chunk.cells[ly * p.chunkSize + lx];
}

function bfsReachability(level: LevelData, p: VisibilityParams): void {
  const { entryX, entryY } = level;
  const visited = new Set<string>([`${entryX},${entryY}`]);
  const queue: [number, number, number][] = [[entryX, entryY, 0]];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const [x, y, dist] = item;
    const cell = cellAt(level, x, y, p, false);
    if (!cell || cell.kind === 'obstacle') continue;
    cell.accessibility = 'reachable';
    cell.distanceFromEntry = dist;
    for (const [dx, dy] of DIRS) {
      const key = `${x + dx},${y + dy}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push([x + dx, y + dy, dist + 1]);
      }
    }
  }
}

function collectReachable(level: LevelData): [number, number][] {
  const result: [number, number][] = [];
  for (const chunk of level.chunks.values()) {
    for (const cell of chunk.cells) {
      if (cell.accessibility === 'reachable') result.push([cell.x, cell.y]);
    }
  }
  return result;
}

function scoutAround(
  level: LevelData,
  x: number,
  y: number,
  radius: number,
  p: VisibilityParams,
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const target = cellAt(level, x + dx, y + dy, p, true);
      if (target && target.visibility === 'unknown') target.visibility = 'scouted';
    }
  }
}

function revealConnectedEmpties(level: LevelData, p: VisibilityParams): void {
  const queue: [number, number][] = [];
  const visited = new Set<string>();

  for (const chunk of level.chunks.values()) {
    for (const cell of chunk.cells) {
      if (cell.visibility === 'scouted' && cell.kind === 'empty') {
        const key = `${cell.x},${cell.y}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push([cell.x, cell.y]);
        }
      }
    }
  }

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const [x, y] = item;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const cell = cellAt(level, nx, ny, p, false);
      if (cell?.kind === 'empty') {
        cell.visibility = 'scouted';
        queue.push([nx, ny]);
      }
    }
  }
}

/**
 * Propagates reachability and visibility for a level (single pass):
 * 1. BFS from entry → marks all connected non-obstacle cells as reachable (existing chunks only)
 * 2. Scout radius from each reachable cell → marks cells as scouted (auto-generates one layer of chunks at boundaries)
 * 3. Flood-fill connected empty cells → scouted (existing chunks only)
 */
export function updateVisibility(
  level: LevelData,
  params: VisibilityParams,
  scoutRadius: number,
): void {
  bfsReachability(level, params);
  const reachable = collectReachable(level);
  for (const [x, y] of reachable) scoutAround(level, x, y, scoutRadius, params);
  revealConnectedEmpties(level, params);
}
