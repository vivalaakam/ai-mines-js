export type EngineErrorCode =
  | 'WRONG_PHASE'
  | 'WORKER_NOT_FOUND'
  | 'WORKER_NOT_IDLE'
  | 'WORKER_LEVEL_MISMATCH'
  | 'WORKER_LEVEL_NOT_PURCHASABLE'
  | 'WORKER_POSITION_OCCUPIED'
  | 'WORKER_POSITION_UNREACHABLE'
  | 'WORKER_POSITION_NOT_ADJACENT'
  | 'CELL_NOT_FOUND'
  | 'CELL_NOT_DEPOSIT'
  | 'CELL_MAX_WORKERS_REACHED'
  | 'INVALID_RESOURCE'
  | 'STORAGE_NOT_FOUND'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_CANCELLABLE'
  | 'ORDER_ALREADY_ACCEPTED'
  | 'INSUFFICIENT_FUNDS'
  | 'LEVEL_NOT_FOUND'
  | 'INVALID_TICK_COUNT';

export interface EngineError {
  readonly code: EngineErrorCode;
  readonly message: string;
}

export function engineError(code: EngineErrorCode, message: string): EngineError {
  return { code, message };
}
