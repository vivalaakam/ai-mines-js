use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const MIGRATION_1: &str = include_str!("migrations/0001_initial.sql");

pub struct DbState(Mutex<Connection>);

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|dir| dir.join("ai-mines.db"))
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    run_migrations(&conn)?;
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<(), String> {
    let current: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;

    if current >= 1 {
        return Ok(());
    }

    conn.execute_batch(MIGRATION_1)
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "user_version", 1)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn save_game_state(state: State<'_, DbState>, state_json: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO game_saves (id, state_json, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at",
        params![state_json, now_unix()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_game_state(state: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT state_json FROM game_saves WHERE id = 1")
        .map_err(|e| e.to_string())?;
    stmt.query_row([], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())
}

pub fn init_db(app: &AppHandle) -> Result<DbState, String> {
    let conn = open_db(app)?;
    Ok(DbState(Mutex::new(conn)))
}
