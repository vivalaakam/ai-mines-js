declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type ResourceId = Brand<string, 'ResourceId'>;
export type WorkerId = Brand<string, 'WorkerId'>;
export type StorageId = Brand<string, 'StorageId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type LevelId = Brand<string, 'LevelId'>;
export type ChunkId = Brand<string, 'ChunkId'>;
export type SaveId = Brand<string, 'SaveId'>;

export function resourceId(v: string): ResourceId {
  return v as ResourceId;
}
export function workerId(v: string): WorkerId {
  return v as WorkerId;
}
export function storageId(v: string): StorageId {
  return v as StorageId;
}
export function orderId(v: string): OrderId {
  return v as OrderId;
}
export function levelId(v: string): LevelId {
  return v as LevelId;
}
export function chunkId(levelId: LevelId, x: number, y: number): ChunkId {
  return `${levelId}:${x}:${y}` as ChunkId;
}
export function saveId(v: string): SaveId {
  return v as SaveId;
}
