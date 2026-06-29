import * as THREE from 'three';
import type { WorkerData, CellData, LevelData } from '@ai-mines/engine';
import { CELL_SIZE } from './MapRenderer.js';

const WORKER_RADIUS = CELL_SIZE * 0.28;
const PROGRESS_HEIGHT = 3;
const PROGRESS_WIDTH = CELL_SIZE - 4;

// ---- geometries (shared) ----
const workerGeo = new THREE.CircleGeometry(WORKER_RADIUS, 8);
const bgGeo = new THREE.PlaneGeometry(PROGRESS_WIDTH, PROGRESS_HEIGHT);
const fgGeo = new THREE.PlaneGeometry(1, PROGRESS_HEIGHT); // scaled on x per frame

// ---- helpers ----

function workerColor(state: WorkerData['state']): number {
  switch (state) {
    case 'working':
      return 0x44cc44;
    case 'idle':
      return 0xaaaaaa;
    default:
      return 0x888888;
  }
}

interface WorkerMeshes {
  dot: THREE.Mesh;
  progressBg: THREE.Mesh;
  progressFg: THREE.Mesh;
}

export class WorkerRenderer {
  private readonly group = new THREE.Group();
  private meshes = new Map<string, WorkerMeshes>();

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.group);
  }

  update(level: LevelData, workers: Map<string, WorkerData>): void {
    const seen = new Set<string>();

    for (const worker of workers.values()) {
      if (worker.levelId !== level.id) continue;
      if (worker.positionX == null || worker.positionY == null) continue;

      seen.add(worker.id);
      const wx = worker.positionX * CELL_SIZE;
      const wy = -worker.positionY * CELL_SIZE;

      let meshes = this.meshes.get(worker.id);
      if (!meshes) {
        meshes = this.createMeshes();
        this.meshes.set(worker.id, meshes);
      }

      // Dot position
      meshes.dot.position.set(wx, wy, 1);
      (meshes.dot.material as THREE.MeshBasicMaterial).color.setHex(workerColor(worker.state));

      // Progress bar: show work progress of target cell
      const progress = this.cellProgress(level, worker);
      const barY = wy + CELL_SIZE / 2 - PROGRESS_HEIGHT - 1;
      meshes.progressBg.position.set(wx, barY, 1.1);
      meshes.progressFg.position.set(wx - PROGRESS_WIDTH / 2 + (PROGRESS_WIDTH * progress) / 2, barY, 1.2);
      meshes.progressFg.scale.set(progress, 1, 1);
      meshes.progressBg.visible = worker.state === 'working';
      meshes.progressFg.visible = worker.state === 'working';
    }

    // Remove stale meshes
    for (const [id, meshes] of this.meshes) {
      if (!seen.has(id)) {
        this.removeMeshes(meshes);
        this.meshes.delete(id);
      }
    }
  }

  private cellProgress(level: LevelData, worker: WorkerData): number {
    if (worker.targetCellX == null || worker.targetCellY == null) return 0;
    for (const chunk of level.chunks.values()) {
      const cell = chunk.cells.find(
        (c: CellData) => c.x === worker.targetCellX && c.y === worker.targetCellY,
      );
      if (cell) return cell.workProgress;
    }
    return 0;
  }

  private createMeshes(): WorkerMeshes {
    const dot = new THREE.Mesh(workerGeo, new THREE.MeshBasicMaterial({ color: 0xaaaaaa }));
    const progressBg = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
    const progressFg = new THREE.Mesh(
      fgGeo,
      new THREE.MeshBasicMaterial({ color: 0x00aaff }),
    );
    progressFg.scale.set(0, 1, 1);
    this.group.add(dot, progressBg, progressFg);
    return { dot, progressBg, progressFg };
  }

  private removeMeshes(meshes: WorkerMeshes): void {
    for (const m of Object.values(meshes)) {
      this.group.remove(m);
      (m.material as THREE.MeshBasicMaterial).dispose();
    }
  }

  dispose(): void {
    for (const meshes of this.meshes.values()) this.removeMeshes(meshes);
    this.meshes.clear();
    workerGeo.dispose();
    bgGeo.dispose();
    fgGeo.dispose();
    this.scene.remove(this.group);
  }
}
