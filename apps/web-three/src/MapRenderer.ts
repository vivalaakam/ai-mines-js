import * as THREE from 'three';
import type { LevelData, CellData } from '@ai-mines/engine';

export const CELL_SIZE = 24; // pixels per cell

// ---- Colour palette ----

const COLOR = {
  empty_visible: 0x2a2a2a,
  empty_scouted: 0x1a1a1a,
  deposit_visible: 0x5fa84f,
  deposit_scouted: 0x3d6b32,
  obstacle_visible: 0x555555,
  obstacle_scouted: 0x333333,
  stairs_visible: 0xd4a017,
  stairs_scouted: 0x7a5c0a,
  unknown: 0x000000,
  reachable_tint: 0x2244aa, // highlight overlay for accessible cells
} as const;

function cellColor(cell: CellData): number {
  if (cell.visibility === 'unknown') return COLOR.unknown;
  const scouted = cell.visibility === 'scouted';
  switch (cell.kind) {
    case 'deposit':
      return scouted ? COLOR.deposit_scouted : COLOR.deposit_visible;
    case 'obstacle':
      return scouted ? COLOR.obstacle_scouted : COLOR.obstacle_visible;
    case 'stairs_area':
      return scouted ? COLOR.stairs_scouted : COLOR.stairs_visible;
    default:
      return scouted ? COLOR.empty_scouted : COLOR.empty_visible;
  }
}

// ---- Mesh pool ----

const geo = new THREE.PlaneGeometry(CELL_SIZE - 1, CELL_SIZE - 1);

function makeMesh(color: number, z: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = z;
  return mesh;
}

// ---- MapRenderer ----

export class MapRenderer {
  private readonly group = new THREE.Group();
  private cellMeshes: THREE.Mesh[] = [];
  private highlightMeshes: THREE.Mesh[] = [];

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.group);
  }

  buildLevel(level: LevelData): void {
    this.clear();

    for (const chunk of level.chunks.values()) {
      for (const cell of chunk.cells) {
        if (cell.visibility === 'unknown') continue;
        // Base cell mesh
        const mesh = makeMesh(cellColor(cell), 0);
        mesh.position.set(cell.x * CELL_SIZE, -cell.y * CELL_SIZE, 0);
        this.group.add(mesh);
        this.cellMeshes.push(mesh);

        // Reachable highlight overlay
        if (cell.accessibility === 'reachable' && cell.visibility !== 'unknown') {
          const hl = makeMesh(COLOR.reachable_tint, 0.1);
          (hl.material as THREE.MeshBasicMaterial).transparent = true;
          (hl.material as THREE.MeshBasicMaterial).opacity = 0.15;
          hl.position.set(cell.x * CELL_SIZE, -cell.y * CELL_SIZE, 0.1);
          this.group.add(hl);
          this.highlightMeshes.push(hl);
        }
      }
    }
  }

  updateCell(cell: CellData): void {
    // Rebuild on next buildLevel call — fine for shift-boundary updates
    const mesh = this.cellMeshes.find(
      (m) =>
        Math.round(m.position.x / CELL_SIZE) === cell.x &&
        Math.round(-m.position.y / CELL_SIZE) === cell.y,
    );
    if (mesh) {
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(cellColor(cell));
    }
  }

  // kept for API compat; camera positioning done externally
  centerOn(_worldX: number, _worldY: number): void { /* no-op */ }

  private clear(): void {
    for (const m of [...this.cellMeshes, ...this.highlightMeshes]) {
      this.group.remove(m);
      (m.material as THREE.MeshBasicMaterial).dispose();
    }
    this.cellMeshes = [];
    this.highlightMeshes = [];
  }

  dispose(): void {
    this.clear();
    geo.dispose();
    this.scene.remove(this.group);
  }
}
