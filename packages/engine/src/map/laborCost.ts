import { RESOURCES } from '@ai-mines/shared';
import type { BalanceConfig, ResourceRarity } from '@ai-mines/shared';
import type { CellData } from '../state/types.js';

const RARITY_RANK: Record<ResourceRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

function highestRarityInCell(cell: CellData): ResourceRarity | null {
  let best: ResourceRarity | null = null;
  for (const comp of cell.components) {
    if (comp.type !== 'resource' || !comp.resourceId) continue;
    const res = RESOURCES.find((r) => r.id === comp.resourceId);
    if (!res) continue;
    if (best === null || RARITY_RANK[res.rarity] > RARITY_RANK[best]) best = res.rarity;
  }
  return best;
}

/**
 * Total ticks required to fully mine a deposit cell by a single worker with speed 1.
 * Returns 0 for non-deposit cells or cells not yet reached by BFS (distanceFromEntry < 0).
 *
 * Formula: baseLaborPerDepth * (depth + 1) * distanceCostMultiplier^distance * resourceModifier
 */
export function computeLaborCost(cell: CellData, depth: number, balance: BalanceConfig): number {
  if (cell.kind !== 'deposit' || cell.distanceFromEntry < 0) return 0;
  const base = balance.baseLaborPerDepth * (depth + 1);
  const distMult = Math.pow(balance.distanceCostMultiplier, cell.distanceFromEntry);
  const rarity = highestRarityInCell(cell);
  const resMod = rarity !== null ? balance.resourceModifiers[rarity] : 1.0;
  return base * distMult * resMod;
}
