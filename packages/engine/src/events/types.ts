import type { LevelId, OrderId } from '@ai-mines/shared';

export type EngineEvent =
  | { readonly type: 'autosave_requested'; readonly reason: 'shift_completed' | 'manual' }
  | { readonly type: 'shift_completed'; readonly shiftNumber: number }
  | {
      readonly type: 'cell_cleared';
      readonly levelId: LevelId;
      readonly cellX: number;
      readonly cellY: number;
    }
  | { readonly type: 'stairs_discovered'; readonly levelId: LevelId }
  | { readonly type: 'level_unlocked'; readonly levelId: LevelId }
  | { readonly type: 'order_expired'; readonly orderId: OrderId }
  | {
      readonly type: 'order_completed';
      readonly orderId: OrderId;
      readonly rewardMoney: number;
    };
