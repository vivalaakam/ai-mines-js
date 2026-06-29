import * as THREE from 'three';
import type { WorkerData, CellData, LevelData } from '@ai-mines/engine';
import { CELL_SIZE } from './MapRenderer.js';

const WORKER_RADIUS = CELL_SIZE * 0.28;
const PROGRESS_HEIGHT = 3;
const PROGRESS_WIDTH = CELL_SIZE - 4;
const LABEL_SIZE = CELL_SIZE * 0.56; // canvas texture size (px)

// ---- level colours (hue shifts) ----
const LEVEL_COLORS = [
  0x44cc44, // 1 — green
  0x44aaff, // 2 — blue
  0xffcc00, // 3 — gold
  0xff6644, // 4 — orange
  0xcc44ff, // 5 — purple
  0xff44aa, // 6+
];

function levelColor(level: number): number {
  return LEVEL_COLORS[Math.min(level - 1, LEVEL_COLORS.length - 1)] ?? 0x888888;
}

// ---- canvas texture for level label ----
const labelCache = new Map<number, THREE.CanvasTexture>();

function levelTexture(level: number): THREE.CanvasTexture {
  const cached = labelCache.get(level);
  if (cached) return cached;

  const sz = 32;
  const canvas = document.createElement('canvas');
  canvas.width = sz;
  canvas.height = sz;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${sz * 0.6}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(String(level), sz / 2, sz / 2);

  const tex = new THREE.CanvasTexture(canvas);
  labelCache.set(level, tex);
  return tex;
}

// ---- shared geometries ----
const workerGeo = new THREE.CircleGeometry(WORKER_RADIUS, 8);
const bgGeo = new THREE.PlaneGeometry(PROGRESS_WIDTH, PROGRESS_HEIGHT);
const fgGeo = new THREE.PlaneGeometry(1, PROGRESS_HEIGHT);
const labelGeo = new THREE.PlaneGeometry(LABEL_SIZE, LABEL_SIZE);

interface WorkerMeshes {
  dot: THREE.Mesh;
  label: THREE.Mesh;
  progressBg: THREE.Mesh;
  progressFg: THREE.Mesh;
  level: number;
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

      let m = this.meshes.get(worker.id);
      if (!m || m.level !== worker.level) {
        if (m) this.removeMeshes(m);
        m = this.createMeshes(worker.level);
        this.meshes.set(worker.id, m);
      }

      m.dot.position.set(wx, wy, 1);
      (m.dot.material as THREE.MeshBasicMaterial).color.setHex(levelColor(worker.level));
      m.label.position.set(wx, wy, 1.2);

      const progress = this.cellProgress(level, worker);
      const barY = wy + CELL_SIZE / 2 - PROGRESS_HEIGHT - 1;
      m.progressBg.position.set(wx, barY, 1.1);
      m.progressFg.position.set(wx - PROGRESS_WIDTH / 2 + (PROGRESS_WIDTH * progress) / 2, barY, 1.2);
      m.progressFg.scale.set(Math.max(progress, 0.001), 1, 1);
      m.progressBg.visible = worker.state === 'working';
      m.progressFg.visible = worker.state === 'working';
    }

    for (const [id, m] of this.meshes) {
      if (!seen.has(id)) {
        this.removeMeshes(m);
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

  private createMeshes(workerLevel: number): WorkerMeshes {
    const dot = new THREE.Mesh(workerGeo, new THREE.MeshBasicMaterial({ color: levelColor(workerLevel) }));
    const label = new THREE.Mesh(
      labelGeo,
      new THREE.MeshBasicMaterial({ map: levelTexture(workerLevel), transparent: true, depthTest: false }),
    );
    const progressBg = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
    const progressFg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: 0x00aaff }));
    progressFg.scale.set(0.001, 1, 1);
    this.group.add(dot, label, progressBg, progressFg);
    return { dot, label, progressBg, progressFg, level: workerLevel };
  }

  private removeMeshes(m: WorkerMeshes): void {
    for (const mesh of [m.dot, m.label, m.progressBg, m.progressFg]) {
      this.group.remove(mesh);
      (mesh.material as THREE.MeshBasicMaterial).dispose();
    }
  }

  dispose(): void {
    for (const m of this.meshes.values()) this.removeMeshes(m);
    this.meshes.clear();
    workerGeo.dispose();
    bgGeo.dispose();
    fgGeo.dispose();
    labelGeo.dispose();
    for (const tex of labelCache.values()) tex.dispose();
    labelCache.clear();
    this.scene.remove(this.group);
  }
}
