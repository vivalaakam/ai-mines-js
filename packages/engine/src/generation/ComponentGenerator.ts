import { RESOURCES } from '@ai-mines/shared';
import type { CellComponent, ResourceRarity } from '@ai-mines/shared';
import type { ResourceId } from '@ai-mines/shared';
import { createRng, hashString } from './rng.js';

// Probability that a resource of given rarity appears in a deposit cell
const RARITY_PROB: Record<ResourceRarity, number> = {
  common: 0.65,
  uncommon: 0.35,
  rare: 0.18,
  epic: 0.08,
  legendary: 0.03,
};

export interface ComponentGenParams {
  readonly seedPhrase: string;
  readonly generatorVersion: number;
  readonly levelDepth: number;
  readonly worldX: number;
  readonly worldY: number;
}

export function generateCellComponents(params: ComponentGenParams): CellComponent[] {
  const { seedPhrase, generatorVersion, levelDepth, worldX, worldY } = params;

  // Independent RNG stream from cell-type stream — use "comp" suffix
  const seed = hashString(
    `${seedPhrase}:v${generatorVersion}:d${levelDepth}:comp:${worldX},${worldY}`,
  );
  const rng = createRng(seed);

  // Resources available at this depth
  const available = RESOURCES.filter((r) => r.minDepth <= levelDepth);

  // Roll every available resource independently, collect all hits
  const hits: ResourceId[] = [];
  for (const res of available) {
    if (rng() < RARITY_PROB[res.rarity]) {
      hits.push(res.id);
    }
  }
  // Cap at 2 — prefer the last (deepest/rarest) ones when there are more
  const chosen = hits.length <= 2 ? hits : hits.slice(hits.length - 2);

  // Build weight list: rock gets base 6, each resource gets ~3/count
  const rockWeight = 5.5 + rng() * 1.5; // 5.5..7.0
  const resWeight = chosen.length > 0 ? (3.0 + rng() * 1.5) / chosen.length : 0;

  const totalWeight = rockWeight + resWeight * chosen.length;
  const totalAmount = Math.round((100 + levelDepth * 20) * (0.8 + rng() * 0.4));

  const components: CellComponent[] = [];

  // Rock component
  const rockRatio = rockWeight / totalWeight;
  const rockAmount = Math.max(1, Math.round(rockRatio * totalAmount));
  components.push({
    type: 'rock',
    resourceId: null,
    ratio: rockRatio,
    initialAmount: rockAmount,
    remainingAmount: rockAmount,
  });

  // Resource components
  for (const id of chosen) {
    const ratio = resWeight / totalWeight;
    const amount = Math.max(1, Math.round(ratio * totalAmount));
    components.push({
      type: 'resource',
      resourceId: id,
      ratio,
      initialAmount: amount,
      remainingAmount: amount,
    });
  }

  // Normalize ratios so they sum exactly to 1.0
  const ratioSum = components.reduce((s, c) => s + c.ratio, 0);
  for (const c of components) {
    (c as { ratio: number }).ratio = c.ratio / ratioSum;
  }

  return components;
}
