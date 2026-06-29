import type { CellData } from '../state/types.js';

/** True when every component of a deposit cell has been fully mined out. */
export function isFullyExtracted(cell: CellData): boolean {
  return (
    cell.kind === 'deposit' &&
    cell.components.length > 0 &&
    cell.components.every((c) => c.remainingAmount === 0)
  );
}

/**
 * If the deposit cell is fully extracted, transitions it to `empty` and
 * resets workProgress. Returns true if the cell was cleared.
 */
export function markExtractedIfDone(cell: CellData): boolean {
  if (!isFullyExtracted(cell)) return false;
  cell.kind = 'empty';
  cell.workProgress = 0;
  return true;
}
