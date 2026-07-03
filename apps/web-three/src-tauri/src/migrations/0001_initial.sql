CREATE TABLE game_saves (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  state_json TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
