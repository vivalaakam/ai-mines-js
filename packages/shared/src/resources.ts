import type { ResourceDefinition } from './types.js';
import { resourceId } from './ids.js';

export const RESOURCES: readonly ResourceDefinition[] = [
  { id: resourceId('stone'), name: 'Stone', minDepth: 0, rarity: 'common' },
  { id: resourceId('coal'), name: 'Coal', minDepth: 0, rarity: 'common' },
  { id: resourceId('iron'), name: 'Iron', minDepth: 1, rarity: 'common' },
  { id: resourceId('copper'), name: 'Copper', minDepth: 1, rarity: 'common' },
  { id: resourceId('silver'), name: 'Silver', minDepth: 2, rarity: 'uncommon' },
  { id: resourceId('gold'), name: 'Gold', minDepth: 3, rarity: 'uncommon' },
  { id: resourceId('crystal'), name: 'Crystal', minDepth: 4, rarity: 'rare' },
  { id: resourceId('emerald'), name: 'Emerald', minDepth: 5, rarity: 'rare' },
  { id: resourceId('ruby'), name: 'Ruby', minDepth: 6, rarity: 'rare' },
  { id: resourceId('diamond'), name: 'Diamond', minDepth: 7, rarity: 'epic' },
  { id: resourceId('mithril'), name: 'Mithril', minDepth: 9, rarity: 'epic' },
  { id: resourceId('adamantite'), name: 'Adamantite', minDepth: 11, rarity: 'legendary' },
] as const;
