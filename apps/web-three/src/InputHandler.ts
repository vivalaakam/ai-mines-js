import * as THREE from 'three';
import type { GameEngine, LevelData, CellData, WorkerData } from '@ai-mines/engine';
import { CELL_SIZE } from './MapRenderer.js';
import { showCellTooltip, hideCellTooltip, showWorkerPopup, hideWorkerPopup } from './ui.js';

export class InputHandler {
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private cameraOffset = { x: 0, y: 0 };
  private zoom = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.OrthographicCamera,
    private readonly engine: GameEngine,
    private readonly applyCmd: (cmd: Parameters<GameEngine['apply']>[0]) => void,
  ) {
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
  }

  // ---- Camera drag ----

  private readonly onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    const dx = (e.clientX - this.dragStart.x) / this.zoom;
    const dy = (e.clientY - this.dragStart.y) / this.zoom;
    this.cameraOffset.x -= dx;
    this.cameraOffset.y += dy;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.applyOffset();
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    const moved = Math.abs(e.clientX - this.dragStart.x) + Math.abs(e.clientY - this.dragStart.y);
    this.isDragging = false;
    if (moved < 4) this.onClick(e);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.zoom = Math.max(0.3, Math.min(3, this.zoom * factor));
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  };

  private applyOffset(): void {
    this.camera.position.set(this.cameraOffset.x, this.cameraOffset.y, 10);
  }

  // ---- Cell click ----

  private onClick(e: MouseEvent): void {
    const state = this.engine.exportState();
    const level = state.levels.values().next().value as LevelData | undefined;
    if (!level) return;

    const { x, y } = this.screenToCell(e.clientX, e.clientY);
    const cell = this.findCell(level, x, y);

    // Non-empty cell → tooltip (any phase)
    if (cell && cell.kind !== 'empty') {
      hideWorkerPopup();
      showCellTooltip(this.cellTooltipLines(cell), e.clientX, e.clientY);
      return;
    }

    hideCellTooltip();

    // Empty reachable cell during planning → worker placement popup
    const status = this.engine.read({ type: 'get_game_status' });
    if (status.phase !== 'shift_planning') return;

    if (!cell || cell.accessibility !== 'reachable') return;

    const idleWorkers = [...state.workers.values()].filter(
      (w): w is WorkerData => w.state === 'idle',
    );
    showWorkerPopup(x, y, level, idleWorkers, this.applyCmd, e.clientX, e.clientY);
  }

  private findCell(level: LevelData, x: number, y: number): CellData | undefined {
    for (const chunk of level.chunks.values()) {
      const cell = chunk.cells.find((c) => c.x === x && c.y === y);
      if (cell) return cell;
    }
    return undefined;
  }

  private cellTooltipLines(cell: CellData): string[] {
    const kindLabel: Record<string, string> = {
      deposit: 'Месторождение',
      obstacle: 'Препятствие',
      stairs_area: 'Лестница (спуск)',
      empty: 'Пусто',
    };
    const lines = [
      `Тип: ${kindLabel[cell.kind] ?? cell.kind}`,
      `Позиция: (${cell.x}, ${cell.y})`,
      `Видимость: ${cell.visibility}`,
      `Доступность: ${cell.accessibility}`,
    ];
    if (cell.workProgress > 0) lines.push(`Прогресс: ${Math.round(cell.workProgress * 100)}%`);
    for (const comp of cell.components) {
      const pct = Math.round(comp.ratio * 100);
      lines.push(`  ${comp.resourceId ?? 'rock'}  ${pct}%  осталось: ${Math.round(comp.remainingAmount)}`);
    }
    return lines;
  }

  private screenToCell(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

    const halfW = (this.camera.right - this.camera.left) / 2 / this.zoom;
    const halfH = (this.camera.top - this.camera.bottom) / 2 / this.zoom;
    const worldX = this.cameraOffset.x + ndcX * halfW;
    const worldY = this.cameraOffset.y + ndcY * halfH;

    return {
      x: Math.round(worldX / CELL_SIZE),
      y: Math.round(-worldY / CELL_SIZE),
    };
  }

  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
