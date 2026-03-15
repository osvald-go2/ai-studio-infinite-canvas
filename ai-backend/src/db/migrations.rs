use super::Database;

const CURRENT_VERSION: i64 = 1;

pub fn run(db: &Database) -> Result<(), String> {
    let conn = db.conn();

    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| format!("failed to read user_version: {e}"))?;

    if version < 1 {
        migrate_v1(&conn)?;
    }

    Ok(())
}

fn migrate_v1(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS projects (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            VARCHAR(255) NOT NULL,
            path            VARCHAR(1024) NOT NULL UNIQUE,
            view_mode       VARCHAR(20) NOT NULL DEFAULT 'canvas',
            canvas_x        REAL NOT NULL DEFAULT 0,
            canvas_y        REAL NOT NULL DEFAULT 0,
            canvas_zoom     REAL NOT NULL DEFAULT 1.0,
            last_opened_at  VARCHAR(30) NOT NULL,
            created_at      VARCHAR(30) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id          VARCHAR(36) PRIMARY KEY,
            project_id  INTEGER NOT NULL,
            title       VARCHAR(255) NOT NULL,
            model       VARCHAR(100) NOT NULL,
            status      VARCHAR(20) NOT NULL DEFAULT 'inbox',
            position_x  REAL NOT NULL DEFAULT 0,
            position_y  REAL NOT NULL DEFAULT 0,
            height      REAL,
            git_branch  VARCHAR(255),
            worktree    VARCHAR(1024),
            messages    TEXT NOT NULL DEFAULT '[]',
            created_at  VARCHAR(30) NOT NULL,
            updated_at  VARCHAR(30) NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(project_id, status);

        CREATE TABLE IF NOT EXISTS settings (
            key         VARCHAR(100) PRIMARY KEY,
            value       VARCHAR(2048) NOT NULL,
            updated_at  VARCHAR(30) NOT NULL
        );

        PRAGMA user_version = 1;"
    ).map_err(|e| format!("migration v1 failed: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn test_fresh_migration_creates_tables() {
        let db = Database::open_memory().unwrap();
        let conn = db.conn();

        let project_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        assert_eq!(project_count, 0);

        let session_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(session_count, 0);

        let setting_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(setting_count, 0);

        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }

    #[test]
    fn test_migration_is_idempotent() {
        let db = Database::open_memory().unwrap();
        run(&db).unwrap();

        let version: i64 = db.conn()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }
}
