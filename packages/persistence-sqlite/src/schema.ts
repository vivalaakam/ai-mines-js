import type Database from 'better-sqlite3';

/** Target schema version — increment when adding migrations. */
export const SCHEMA_VERSION = 1;

const MIGRATION_1 = `
CREATE TABLE saves (
  save_id                       TEXT    PRIMARY KEY,
  seed_phrase                   TEXT    NOT NULL,
  generator_version             INTEGER NOT NULL,
  current_tick                  INTEGER NOT NULL,
  current_shift                 INTEGER NOT NULL,
  phase                         TEXT    NOT NULL,
  money                         REAL    NOT NULL,
  next_entity_id                INTEGER NOT NULL,
  order_allocation_mode         TEXT    NOT NULL,
  allow_worker_reassignment     INTEGER NOT NULL,
  unlocked_resources            TEXT    NOT NULL
);

CREATE TABLE levels (
  save_id   TEXT    NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
  level_id  TEXT    NOT NULL,
  depth     INTEGER NOT NULL,
  entry_x   INTEGER NOT NULL,
  entry_y   INTEGER NOT NULL,
  stairs_x  INTEGER NOT NULL,
  stairs_y  INTEGER NOT NULL,
  PRIMARY KEY (save_id, level_id)
);

CREATE TABLE chunks (
  save_id   TEXT NOT NULL,
  level_id  TEXT NOT NULL,
  chunk_id  TEXT NOT NULL,
  chunk_x   INTEGER NOT NULL,
  chunk_y   INTEGER NOT NULL,
  PRIMARY KEY (save_id, chunk_id),
  FOREIGN KEY (save_id, level_id) REFERENCES levels(save_id, level_id) ON DELETE CASCADE
);

CREATE TABLE cells (
  save_id             TEXT    NOT NULL,
  chunk_id            TEXT    NOT NULL,
  cell_idx            INTEGER NOT NULL,
  x                   INTEGER NOT NULL,
  y                   INTEGER NOT NULL,
  kind                TEXT    NOT NULL,
  visibility          TEXT    NOT NULL,
  accessibility       TEXT    NOT NULL,
  work_progress       REAL    NOT NULL,
  distance_from_entry INTEGER NOT NULL,
  PRIMARY KEY (save_id, chunk_id, cell_idx),
  FOREIGN KEY (save_id, chunk_id) REFERENCES chunks(save_id, chunk_id) ON DELETE CASCADE
);

CREATE TABLE cell_components (
  save_id          TEXT    NOT NULL,
  chunk_id         TEXT    NOT NULL,
  cell_idx         INTEGER NOT NULL,
  comp_idx         INTEGER NOT NULL,
  type             TEXT    NOT NULL,
  resource_id      TEXT,
  ratio            REAL    NOT NULL,
  initial_amount   REAL    NOT NULL,
  remaining_amount REAL    NOT NULL,
  PRIMARY KEY (save_id, chunk_id, cell_idx, comp_idx),
  FOREIGN KEY (save_id, chunk_id, cell_idx)
    REFERENCES cells(save_id, chunk_id, cell_idx) ON DELETE CASCADE
);

CREATE TABLE workers (
  save_id        TEXT    NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
  worker_id      TEXT    NOT NULL,
  level          INTEGER NOT NULL,
  state          TEXT    NOT NULL,
  level_id       TEXT,
  position_x     INTEGER,
  position_y     INTEGER,
  target_cell_x  INTEGER,
  target_cell_y  INTEGER,
  PRIMARY KEY (save_id, worker_id)
);

CREATE TABLE storages (
  save_id        TEXT NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
  storage_id     TEXT NOT NULL,
  resource_id    TEXT NOT NULL,
  level          INTEGER NOT NULL,
  capacity       REAL NOT NULL,
  stored_amount  REAL NOT NULL,
  PRIMARY KEY (save_id, storage_id)
);

CREATE TABLE orders (
  save_id          TEXT    NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
  order_id         TEXT    NOT NULL,
  reward_money     REAL    NOT NULL,
  state            TEXT    NOT NULL,
  expires_at_tick  INTEGER NOT NULL,
  priority         INTEGER NOT NULL,
  PRIMARY KEY (save_id, order_id)
);

CREATE TABLE order_requirements (
  save_id           TEXT NOT NULL,
  order_id          TEXT NOT NULL,
  resource_id       TEXT NOT NULL,
  required_amount   REAL NOT NULL,
  delivered_amount  REAL NOT NULL,
  PRIMARY KEY (save_id, order_id, resource_id),
  FOREIGN KEY (save_id, order_id) REFERENCES orders(save_id, order_id) ON DELETE CASCADE
);
`;

const MIGRATIONS: string[] = [MIGRATION_1];

/** Apply any pending migrations. Uses SQLite user_version pragma as version counter. */
export function runMigrations(db: Database.Database): void {
  const current: number = (db.pragma('user_version', { simple: true }) as number) ?? 0;

  if (current >= SCHEMA_VERSION) return;

  db.transaction(() => {
    for (let v = current; v < SCHEMA_VERSION; v++) {
      const sql = MIGRATIONS[v];
      if (sql) db.exec(sql);
    }
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
}
