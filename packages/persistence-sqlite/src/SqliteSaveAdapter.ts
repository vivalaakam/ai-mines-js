import Database from 'better-sqlite3';
import { chunkId, levelId, orderId, saveId, storageId, workerId } from '@ai-mines/shared';
import type { LevelId, OrderId, ResourceId, SaveId, StorageId, WorkerId } from '@ai-mines/shared';
import type { EngineState, LevelData } from '@ai-mines/engine';
import { runMigrations } from './schema.js';

export interface SaveMeta {
  saveId: SaveId;
  seedPhrase: string;
  currentTick: number;
  currentShift: number;
}

export class SqliteSaveAdapter {
  private readonly db: Database.Database;

  constructor(dbPath: string | ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    runMigrations(this.db);
  }

  close(): void {
    this.db.close();
  }

  // ---- Write ----

  save(state: EngineState): void {
    const sid = state.saveId;

    this.db.transaction(() => {
      // Upsert save root
      this.db
        .prepare(
          `INSERT INTO saves
            (save_id, seed_phrase, generator_version, current_tick, current_shift,
             phase, money, next_entity_id, order_allocation_mode,
             allow_worker_reassignment, unlocked_resources)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(save_id) DO UPDATE SET
             current_tick = excluded.current_tick,
             current_shift = excluded.current_shift,
             phase = excluded.phase,
             money = excluded.money,
             next_entity_id = excluded.next_entity_id,
             unlocked_resources = excluded.unlocked_resources`,
        )
        .run(
          sid,
          state.seedPhrase,
          state.generatorVersion,
          state.currentTick,
          state.currentShift,
          state.phase,
          state.money,
          state.nextEntityId,
          state.orderAllocationMode,
          state.allowWorkerReassignmentDuringShift ? 1 : 0,
          JSON.stringify(state.unlockedResources),
        );

      // Delete + re-insert dependents (simplest correct approach)
      this.db.prepare(`DELETE FROM workers WHERE save_id = ?`).run(sid);
      this.db.prepare(`DELETE FROM storages WHERE save_id = ?`).run(sid);
      this.db.prepare(`DELETE FROM orders WHERE save_id = ?`).run(sid);
      this.db.prepare(`DELETE FROM levels WHERE save_id = ?`).run(sid);

      // Levels → chunks → cells → cell_components
      for (const level of state.levels.values()) {
        this.db
          .prepare(
            `INSERT INTO levels (save_id, level_id, depth, entry_x, entry_y, stairs_x, stairs_y)
             VALUES (?,?,?,?,?,?,?)`,
          )
          .run(
            sid,
            level.id,
            level.depth,
            level.entryX,
            level.entryY,
            level.stairsX,
            level.stairsY,
          );

        for (const chunk of level.chunks.values()) {
          this.db
            .prepare(
              `INSERT INTO chunks (save_id, level_id, chunk_id, chunk_x, chunk_y)
               VALUES (?,?,?,?,?)`,
            )
            .run(sid, level.id, chunk.id, chunk.chunkX, chunk.chunkY);

          const insertCell = this.db.prepare(
            `INSERT INTO cells
               (save_id, chunk_id, cell_idx, x, y, kind, visibility, accessibility,
                work_progress, distance_from_entry)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
          );
          const insertComp = this.db.prepare(
            `INSERT INTO cell_components
               (save_id, chunk_id, cell_idx, comp_idx, type, resource_id, ratio,
                initial_amount, remaining_amount)
             VALUES (?,?,?,?,?,?,?,?,?)`,
          );

          for (let idx = 0; idx < chunk.cells.length; idx++) {
            const cell = chunk.cells[idx];
            if (!cell) continue;
            insertCell.run(
              sid,
              chunk.id,
              idx,
              cell.x,
              cell.y,
              cell.kind,
              cell.visibility,
              cell.accessibility,
              cell.workProgress,
              cell.distanceFromEntry,
            );
            for (let ci = 0; ci < cell.components.length; ci++) {
              const comp = cell.components[ci];
              if (!comp) continue;
              insertComp.run(
                sid,
                chunk.id,
                idx,
                ci,
                comp.type,
                comp.resourceId ?? null,
                comp.ratio,
                comp.initialAmount,
                comp.remainingAmount,
              );
            }
          }
        }
      }

      // Workers
      const insertWorker = this.db.prepare(
        `INSERT INTO workers
           (save_id, worker_id, level, state, level_id, position_x, position_y,
            target_cell_x, target_cell_y)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      );
      for (const w of state.workers.values()) {
        insertWorker.run(
          sid,
          w.id,
          w.level,
          w.state,
          w.levelId ?? null,
          w.positionX ?? null,
          w.positionY ?? null,
          w.targetCellX ?? null,
          w.targetCellY ?? null,
        );
      }

      // Storages
      const insertStorage = this.db.prepare(
        `INSERT INTO storages
           (save_id, storage_id, resource_id, level, capacity, stored_amount)
         VALUES (?,?,?,?,?,?)`,
      );
      for (const s of state.storages.values()) {
        insertStorage.run(sid, s.id, s.resourceId, s.level, s.capacity, s.storedAmount);
      }

      // Orders + requirements
      const insertOrder = this.db.prepare(
        `INSERT INTO orders (save_id, order_id, reward_money, state, expires_at_tick, priority)
         VALUES (?,?,?,?,?,?)`,
      );
      const insertReq = this.db.prepare(
        `INSERT INTO order_requirements
           (save_id, order_id, resource_id, required_amount, delivered_amount)
         VALUES (?,?,?,?,?)`,
      );
      for (const o of state.orders.values()) {
        insertOrder.run(sid, o.id, o.rewardMoney, o.state, o.expiresAtTick, o.priority);
        for (const r of o.requirements) {
          insertReq.run(sid, o.id, r.resourceId, r.requiredAmount, r.deliveredAmount);
        }
      }
    })();
  }

  // ---- Read ----

  load(sid: SaveId): EngineState | null {
    const row = this.db.prepare(`SELECT * FROM saves WHERE save_id = ?`).get(sid) as
      SaveRow | undefined;
    if (!row) return null;

    const levels = new Map<LevelId, LevelData>();
    const levelRows = this.db
      .prepare(`SELECT * FROM levels WHERE save_id = ?`)
      .all(sid) as LevelRow[];

    for (const lr of levelRows) {
      const lid = levelId(lr.level_id);
      const chunks = new Map();

      const chunkRows = this.db
        .prepare(`SELECT * FROM chunks WHERE save_id = ? AND level_id = ?`)
        .all(sid, lr.level_id) as ChunkRow[];

      for (const cr of chunkRows) {
        const cid = chunkId(lid, cr.chunk_x, cr.chunk_y);
        const cellRows = this.db
          .prepare(`SELECT * FROM cells WHERE save_id = ? AND chunk_id = ? ORDER BY cell_idx`)
          .all(sid, cr.chunk_id) as CellRow[];

        const cells = cellRows.map((cell) => {
          const compRows = this.db
            .prepare(
              `SELECT * FROM cell_components
               WHERE save_id = ? AND chunk_id = ? AND cell_idx = ?
               ORDER BY comp_idx`,
            )
            .all(sid, cr.chunk_id, cell.cell_idx) as CompRow[];

          return {
            x: cell.x,
            y: cell.y,
            kind: cell.kind,
            visibility: cell.visibility,
            accessibility: cell.accessibility,
            workProgress: cell.work_progress,
            distanceFromEntry: cell.distance_from_entry,
            components: compRows.map((c) => ({
              type: c.type,
              resourceId: (c.resource_id as ResourceId | null) ?? null,
              ratio: c.ratio,
              initialAmount: c.initial_amount,
              remainingAmount: c.remaining_amount,
            })),
          };
        });

        chunks.set(cid, { id: cid, chunkX: cr.chunk_x, chunkY: cr.chunk_y, cells });
      }

      levels.set(lid, {
        id: lid,
        depth: lr.depth,
        entryX: lr.entry_x,
        entryY: lr.entry_y,
        stairsX: lr.stairs_x,
        stairsY: lr.stairs_y,
        chunks,
      });
    }

    // Workers
    const workers = new Map();
    const workerRows = this.db
      .prepare(`SELECT * FROM workers WHERE save_id = ?`)
      .all(sid) as WorkerRow[];
    for (const wr of workerRows) {
      const wid = workerId(wr.worker_id) as WorkerId;
      workers.set(wid, {
        id: wid,
        level: wr.level,
        state: wr.state,
        levelId: wr.level_id ? (levelId(wr.level_id) as LevelId) : null,
        positionX: wr.position_x ?? null,
        positionY: wr.position_y ?? null,
        targetCellX: wr.target_cell_x ?? null,
        targetCellY: wr.target_cell_y ?? null,
      });
    }

    // Storages
    const storages = new Map();
    const storageRows = this.db
      .prepare(`SELECT * FROM storages WHERE save_id = ?`)
      .all(sid) as StorageRow[];
    for (const sr of storageRows) {
      const stid = storageId(sr.storage_id) as StorageId;
      storages.set(stid, {
        id: stid,
        resourceId: sr.resource_id as ResourceId,
        level: sr.level,
        capacity: sr.capacity,
        storedAmount: sr.stored_amount,
      });
    }

    // Orders
    const orders = new Map();
    const orderRows = this.db
      .prepare(`SELECT * FROM orders WHERE save_id = ?`)
      .all(sid) as OrderRow[];
    for (const or_ of orderRows) {
      const oid = orderId(or_.order_id) as OrderId;
      const reqRows = this.db
        .prepare(`SELECT * FROM order_requirements WHERE save_id = ? AND order_id = ?`)
        .all(sid, or_.order_id) as ReqRow[];

      orders.set(oid, {
        id: oid,
        rewardMoney: or_.reward_money,
        state: or_.state,
        expiresAtTick: or_.expires_at_tick,
        priority: or_.priority,
        requirements: reqRows.map((r) => ({
          resourceId: r.resource_id as ResourceId,
          requiredAmount: r.required_amount,
          deliveredAmount: r.delivered_amount,
        })),
      });
    }

    return {
      saveId: saveId(row.save_id) as SaveId,
      seedPhrase: row.seed_phrase,
      generatorVersion: row.generator_version,
      currentTick: row.current_tick,
      currentShift: row.current_shift,
      phase: row.phase as 'shift_running' | 'shift_planning',
      money: row.money,
      nextEntityId: row.next_entity_id,
      orderAllocationMode: row.order_allocation_mode as 'priority_based',
      allowWorkerReassignmentDuringShift: row.allow_worker_reassignment === 1,
      unlockedResources: JSON.parse(row.unlocked_resources) as ResourceId[],
      levels,
      workers,
      storages,
      orders,
    };
  }

  listSaves(): SaveMeta[] {
    const rows = this.db
      .prepare(
        `SELECT save_id, seed_phrase, current_tick, current_shift FROM saves ORDER BY rowid DESC`,
      )
      .all() as SaveRow[];
    return rows.map((r) => ({
      saveId: saveId(r.save_id) as SaveId,
      seedPhrase: r.seed_phrase,
      currentTick: r.current_tick,
      currentShift: r.current_shift,
    }));
  }

  deleteSave(sid: SaveId): void {
    this.db.prepare(`DELETE FROM saves WHERE save_id = ?`).run(sid);
  }
}

// ---- Row types (SQLite returns plain objects) ----

interface SaveRow {
  save_id: string;
  seed_phrase: string;
  generator_version: number;
  current_tick: number;
  current_shift: number;
  phase: string;
  money: number;
  next_entity_id: number;
  order_allocation_mode: string;
  allow_worker_reassignment: number;
  unlocked_resources: string;
}

interface LevelRow {
  save_id: string;
  level_id: string;
  depth: number;
  entry_x: number;
  entry_y: number;
  stairs_x: number;
  stairs_y: number;
}

interface ChunkRow {
  save_id: string;
  level_id: string;
  chunk_id: string;
  chunk_x: number;
  chunk_y: number;
}

interface CellRow {
  save_id: string;
  chunk_id: string;
  cell_idx: number;
  x: number;
  y: number;
  kind: string;
  visibility: string;
  accessibility: string;
  work_progress: number;
  distance_from_entry: number;
}

interface CompRow {
  save_id: string;
  chunk_id: string;
  cell_idx: number;
  comp_idx: number;
  type: string;
  resource_id: string | null;
  ratio: number;
  initial_amount: number;
  remaining_amount: number;
}

interface WorkerRow {
  save_id: string;
  worker_id: string;
  level: number;
  state: string;
  level_id: string | null;
  position_x: number | null;
  position_y: number | null;
  target_cell_x: number | null;
  target_cell_y: number | null;
}

interface StorageRow {
  save_id: string;
  storage_id: string;
  resource_id: string;
  level: number;
  capacity: number;
  stored_amount: number;
}

interface OrderRow {
  save_id: string;
  order_id: string;
  reward_money: number;
  state: string;
  expires_at_tick: number;
  priority: number;
}

interface ReqRow {
  save_id: string;
  order_id: string;
  resource_id: string;
  required_amount: number;
  delivered_amount: number;
}
