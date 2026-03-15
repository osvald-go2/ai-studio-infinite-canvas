# SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SQLite persistence to the Rust sidecar so projects, sessions, messages, and settings survive restarts.

**Architecture:** A `db` module in `ai-backend/src/` wraps rusqlite with a `Database` struct (`Arc<Mutex<Connection>>`). CRUD functions live in separate files per table. New protocol methods in `router.rs` expose persistence to the frontend via the existing stdin/stdout JSON protocol. The frontend's `backend.ts` service gains corresponding methods, and `App.tsx` loads/saves state through them.

**Tech Stack:** rusqlite (SQLite), dirs (platform data dir), serde/serde_json (serialization), existing tokio + protocol stack.

**Spec:** `docs/superpowers/specs/2026-03-15-sqlite-schema-design.md`

---

## File Structure

### New files (Rust backend)

| File | Responsibility |
|------|---------------|
| `ai-backend/src/db/mod.rs` | Module re-exports |
| `ai-backend/src/db/connection.rs` | `Database` struct: open, pragmas, close |
| `ai-backend/src/db/migrations.rs` | `PRAGMA user_version` check + CREATE TABLE DDL |
| `ai-backend/src/db/projects.rs` | Projects CRUD |
| `ai-backend/src/db/sessions.rs` | Sessions CRUD |
| `ai-backend/src/db/settings.rs` | Settings CRUD |
| `ai-backend/src/db/types.rs` | `Project`, `DbSession`, `Setting` structs |

### Modified files (Rust backend)

| File | Changes |
|------|---------|
| `ai-backend/Cargo.toml` | Add `rusqlite`, `dirs` dependencies |
| `ai-backend/src/main.rs` | Create `Database` at startup, pass to router |
| `ai-backend/src/router.rs` | Add `project.*`, `session.save`, `session.load`, `settings.*` methods |

### Modified files (Electron)

| File | Changes |
|------|---------|
| `electron/preload.ts` | Expose `workingDir` property on `window.aiBackend` |

### Modified files (Frontend)

| File | Changes |
|------|---------|
| `src/types.ts` | Add `DbProject`, `DbSession` interfaces |
| `src/services/backend.ts` | Add `project.*`, `session.*`, `settings.*` service methods |
| `src/App.tsx` | Load sessions on project open, save on changes, sync deletes |

---

## Chunk 1: Database Foundation

### Task 1: Add dependencies

**Files:**
- Modify: `ai-backend/Cargo.toml`

- [ ] **Step 1: Add rusqlite and dirs to Cargo.toml**

Add under `[dependencies]`:

```toml
rusqlite = { version = "0.31", features = ["bundled"] }
dirs = "5"
```

`bundled` feature compiles SQLite from source — no system dependency needed.

- [ ] **Step 2: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: Compiles with no errors (new deps downloaded).

- [ ] **Step 3: Commit**

```bash
git add ai-backend/Cargo.toml ai-backend/Cargo.lock
git commit -m "feat(db): add rusqlite and dirs dependencies"
```

---

### Task 2: Database connection + types

**Files:**
- Create: `ai-backend/src/db/mod.rs`
- Create: `ai-backend/src/db/types.rs`
- Create: `ai-backend/src/db/connection.rs`

- [ ] **Step 1: Create db module entry**

`ai-backend/src/db/mod.rs`:

```rust
pub mod connection;
pub mod migrations;
pub mod projects;
pub mod sessions;
pub mod settings;
pub mod types;

pub use connection::Database;
pub use types::*;
```

- [ ] **Step 2: Create data types**

`ai-backend/src/db/types.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub view_mode: String,
    pub canvas_x: f64,
    pub canvas_y: f64,
    pub canvas_zoom: f64,
    pub last_opened_at: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbSession {
    pub id: String,
    pub project_id: i64,
    pub title: String,
    pub model: String,
    pub status: String,
    pub position_x: f64,
    pub position_y: f64,
    pub height: Option<f64>,
    pub git_branch: Option<String>,
    pub worktree: Option<String>,
    pub messages: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}
```

- [ ] **Step 3: Create Database struct**

`ai-backend/src/db/connection.rs`:

```rust
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use super::migrations;

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Open (or create) the database at the platform data directory.
    /// Runs pragmas and migrations automatically.
    pub fn open_default() -> Result<Self, String> {
        let path = Self::default_db_path()?;
        Self::open(&path)
    }

    /// Open (or create) the database at a specific path.
    pub fn open(path: &str) -> Result<Self, String> {
        // Ensure parent directory exists
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("failed to create db directory: {e}"))?;
        }

        let conn = Connection::open(path)
            .map_err(|e| format!("failed to open database: {e}"))?;

        // Required pragmas
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;"
        ).map_err(|e| format!("failed to set pragmas: {e}"))?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };

        migrations::run(&db)?;

        Ok(db)
    }

    /// Open an in-memory database (for tests).
    pub fn open_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("failed to open in-memory db: {e}"))?;

        conn.execute_batch(
            "PRAGMA foreign_keys = ON;"
        ).map_err(|e| format!("failed to set pragmas: {e}"))?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };

        migrations::run(&db)?;

        Ok(db)
    }

    /// Get a lock on the connection for executing queries.
    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("database mutex poisoned")
    }

    fn default_db_path() -> Result<String, String> {
        let data_dir = dirs::data_dir()
            .ok_or("could not determine user data directory")?;
        let mut path: PathBuf = data_dir;
        path.push("ai-studio-infinite-canvas");
        path.push("data.db");
        path.to_str()
            .map(|s| s.to_string())
            .ok_or("invalid data directory path".to_string())
    }
}
```

- [ ] **Step 4: Register db module in main**

Add to the top of `ai-backend/src/main.rs`:

```rust
mod db;
```

- [ ] **Step 5: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: Warning about unused modules (migrations/projects/sessions/settings not created yet), but no errors.

Note: Create empty placeholder files so the module compiles:

`ai-backend/src/db/migrations.rs`:
```rust
use super::Database;

pub fn run(_db: &Database) -> Result<(), String> {
    Ok(())
}
```

`ai-backend/src/db/projects.rs`:
```rust
// Will be implemented in Task 4
```

`ai-backend/src/db/sessions.rs`:
```rust
// Will be implemented in Task 5
```

`ai-backend/src/db/settings.rs`:
```rust
// Will be implemented in Task 6
```

- [ ] **Step 6: Commit**

```bash
git add ai-backend/src/db/
git commit -m "feat(db): add Database struct with connection and pragmas"
```

---

### Task 3: Schema migrations

**Files:**
- Modify: `ai-backend/src/db/migrations.rs`

- [ ] **Step 1: Write migration test**

Add to the bottom of `ai-backend/src/db/migrations.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn test_fresh_migration_creates_tables() {
        let db = Database::open_memory().unwrap();
        let conn = db.conn();

        // Verify tables exist by querying them
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

        // Verify user_version is set
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }

    #[test]
    fn test_migration_is_idempotent() {
        let db = Database::open_memory().unwrap();
        // run() was already called by open_memory()
        // calling again should not error
        run(&db).unwrap();

        let version: i64 = db.conn()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-backend && cargo test db::migrations`
Expected: FAIL — `run()` is a no-op stub, tables don't exist.

- [ ] **Step 3: Implement migrations**

Replace the content of `ai-backend/src/db/migrations.rs`:

```rust
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ai-backend && cargo test db::migrations`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add ai-backend/src/db/migrations.rs
git commit -m "feat(db): implement schema migration v1 with all tables"
```

---

## Chunk 2: CRUD Operations

### Task 4: Projects CRUD

**Files:**
- Modify: `ai-backend/src/db/projects.rs`

- [ ] **Step 1: Write failing tests**

`ai-backend/src/db/projects.rs`:

```rust
use rusqlite::params;

use super::types::Project;
use super::Database;

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn create(db: &Database, name: &str, path: &str) -> Result<Project, String> {
    todo!()
}

pub fn get_by_id(db: &Database, id: i64) -> Result<Option<Project>, String> {
    todo!()
}

pub fn get_by_path(db: &Database, path: &str) -> Result<Option<Project>, String> {
    todo!()
}

pub fn list(db: &Database) -> Result<Vec<Project>, String> {
    todo!()
}

pub fn update(db: &Database, project: &Project) -> Result<(), String> {
    todo!()
}

pub fn delete(db: &Database, id: i64) -> Result<(), String> {
    todo!()
}

pub fn touch(db: &Database, id: i64) -> Result<(), String> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup() -> Database {
        Database::open_memory().unwrap()
    }

    #[test]
    fn test_create_and_get() {
        let db = setup();
        let project = create(&db, "my-app", "/Users/test/repos/my-app").unwrap();
        assert_eq!(project.name, "my-app");
        assert_eq!(project.path, "/Users/test/repos/my-app");
        assert_eq!(project.view_mode, "canvas");
        assert_eq!(project.canvas_zoom, 1.0);

        let fetched = get_by_id(&db, project.id).unwrap().unwrap();
        assert_eq!(fetched.name, "my-app");
    }

    #[test]
    fn test_get_by_path() {
        let db = setup();
        create(&db, "my-app", "/Users/test/repos/my-app").unwrap();

        let found = get_by_path(&db, "/Users/test/repos/my-app").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "my-app");

        let not_found = get_by_path(&db, "/nonexistent").unwrap();
        assert!(not_found.is_none());
    }

    #[test]
    fn test_list_ordered_by_last_opened() {
        let db = setup();
        let p1 = create(&db, "older", "/path/older").unwrap();
        let _p2 = create(&db, "newer", "/path/newer").unwrap();

        // Explicitly set p1's last_opened_at to a later timestamp
        db.conn().execute(
            "UPDATE projects SET last_opened_at = '2099-01-01T00:00:00Z' WHERE id = ?1",
            params![p1.id],
        ).unwrap();

        let projects = list(&db).unwrap();
        assert_eq!(projects.len(), 2);
        assert_eq!(projects[0].name, "older"); // has later last_opened_at
    }

    #[test]
    fn test_update() {
        let db = setup();
        let mut project = create(&db, "my-app", "/path/my-app").unwrap();
        project.view_mode = "board".to_string();
        project.canvas_zoom = 1.5;
        update(&db, &project).unwrap();

        let fetched = get_by_id(&db, project.id).unwrap().unwrap();
        assert_eq!(fetched.view_mode, "board");
        assert_eq!(fetched.canvas_zoom, 1.5);
    }

    #[test]
    fn test_delete() {
        let db = setup();
        let project = create(&db, "my-app", "/path/my-app").unwrap();
        delete(&db, project.id).unwrap();

        let fetched = get_by_id(&db, project.id).unwrap();
        assert!(fetched.is_none());
    }

    #[test]
    fn test_unique_path_constraint() {
        let db = setup();
        create(&db, "app1", "/same/path").unwrap();
        let result = create(&db, "app2", "/same/path");
        assert!(result.is_err());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ai-backend && cargo test db::projects`
Expected: FAIL — all functions are `todo!()`.

- [ ] **Step 3: Implement CRUD functions**

Replace the `todo!()` stubs in `ai-backend/src/db/projects.rs`:

```rust
use rusqlite::params;

use super::types::Project;
use super::Database;

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn row_to_project(row: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        view_mode: row.get(3)?,
        canvas_x: row.get(4)?,
        canvas_y: row.get(5)?,
        canvas_zoom: row.get(6)?,
        last_opened_at: row.get(7)?,
        created_at: row.get(8)?,
    })
}

pub fn create(db: &Database, name: &str, path: &str) -> Result<Project, String> {
    let conn = db.conn();
    let ts = now();
    conn.execute(
        "INSERT INTO projects (name, path, last_opened_at, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![name, path, ts, ts],
    ).map_err(|e| format!("failed to create project: {e}"))?;

    let id = conn.last_insert_rowid();
    drop(conn);
    get_by_id(db, id)?.ok_or("project not found after insert".to_string())
}

pub fn get_by_id(db: &Database, id: i64) -> Result<Option<Project>, String> {
    let conn = db.conn();
    conn.query_row(
        "SELECT id, name, path, view_mode, canvas_x, canvas_y, canvas_zoom, last_opened_at, created_at FROM projects WHERE id = ?1",
        params![id],
        row_to_project,
    ).optional()
    .map_err(|e| format!("failed to get project: {e}"))
}

pub fn get_by_path(db: &Database, path: &str) -> Result<Option<Project>, String> {
    let conn = db.conn();
    conn.query_row(
        "SELECT id, name, path, view_mode, canvas_x, canvas_y, canvas_zoom, last_opened_at, created_at FROM projects WHERE path = ?1",
        params![path],
        row_to_project,
    ).optional()
    .map_err(|e| format!("failed to get project by path: {e}"))
}

pub fn list(db: &Database) -> Result<Vec<Project>, String> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, name, path, view_mode, canvas_x, canvas_y, canvas_zoom, last_opened_at, created_at FROM projects ORDER BY last_opened_at DESC"
    ).map_err(|e| format!("failed to prepare list query: {e}"))?;

    let rows = stmt.query_map([], row_to_project)
        .map_err(|e| format!("failed to list projects: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to collect projects: {e}"))
}

pub fn update(db: &Database, project: &Project) -> Result<(), String> {
    let conn = db.conn();
    conn.execute(
        "UPDATE projects SET name = ?1, view_mode = ?2, canvas_x = ?3, canvas_y = ?4, canvas_zoom = ?5 WHERE id = ?6",
        params![project.name, project.view_mode, project.canvas_x, project.canvas_y, project.canvas_zoom, project.id],
    ).map_err(|e| format!("failed to update project: {e}"))?;
    Ok(())
}

pub fn delete(db: &Database, id: i64) -> Result<(), String> {
    let conn = db.conn();
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(|e| format!("failed to delete project: {e}"))?;
    Ok(())
}

pub fn touch(db: &Database, id: i64) -> Result<(), String> {
    let conn = db.conn();
    conn.execute(
        "UPDATE projects SET last_opened_at = ?1 WHERE id = ?2",
        params![now(), id],
    ).map_err(|e| format!("failed to touch project: {e}"))?;
    Ok(())
}

// ... tests stay the same
```

Note: Add `use rusqlite::OptionalExtension;` at the top for `.optional()`.

Full import block:

```rust
use rusqlite::{params, OptionalExtension};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ai-backend && cargo test db::projects`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add ai-backend/src/db/projects.rs
git commit -m "feat(db): implement projects CRUD"
```

---

### Task 5: Sessions CRUD

**Files:**
- Modify: `ai-backend/src/db/sessions.rs`

- [ ] **Step 1: Write failing tests**

`ai-backend/src/db/sessions.rs`:

```rust
use rusqlite::{params, OptionalExtension};

use super::types::DbSession;
use super::Database;

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn row_to_session(row: &rusqlite::Row) -> rusqlite::Result<DbSession> {
    Ok(DbSession {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        model: row.get(3)?,
        status: row.get(4)?,
        position_x: row.get(5)?,
        position_y: row.get(6)?,
        height: row.get(7)?,
        git_branch: row.get(8)?,
        worktree: row.get(9)?,
        messages: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

pub fn create(db: &Database, session: &DbSession) -> Result<(), String> {
    todo!()
}

pub fn get_by_id(db: &Database, id: &str) -> Result<Option<DbSession>, String> {
    todo!()
}

pub fn list_by_project(db: &Database, project_id: i64) -> Result<Vec<DbSession>, String> {
    todo!()
}

pub fn update(db: &Database, session: &DbSession) -> Result<(), String> {
    todo!()
}

pub fn update_messages(db: &Database, id: &str, messages: &str) -> Result<(), String> {
    todo!()
}

pub fn update_status(db: &Database, id: &str, status: &str) -> Result<(), String> {
    todo!()
}

pub fn update_position(db: &Database, id: &str, x: f64, y: f64, height: Option<f64>) -> Result<(), String> {
    todo!()
}

pub fn delete(db: &Database, id: &str) -> Result<(), String> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{projects, Database};

    fn setup() -> (Database, i64) {
        let db = Database::open_memory().unwrap();
        let project = projects::create(&db, "test", "/test/path").unwrap();
        (db, project.id)
    }

    fn make_session(project_id: i64) -> DbSession {
        DbSession {
            id: uuid::Uuid::new_v4().to_string(),
            project_id,
            title: "Test Session".to_string(),
            model: "claude".to_string(),
            status: "inbox".to_string(),
            position_x: 100.0,
            position_y: 200.0,
            height: Some(400.0),
            git_branch: Some("feat/test".to_string()),
            worktree: None,
            messages: "[]".to_string(),
            created_at: now(),
            updated_at: now(),
        }
    }

    #[test]
    fn test_create_and_get() {
        let (db, pid) = setup();
        let session = make_session(pid);
        let sid = session.id.clone();
        create(&db, &session).unwrap();

        let fetched = get_by_id(&db, &sid).unwrap().unwrap();
        assert_eq!(fetched.title, "Test Session");
        assert_eq!(fetched.model, "claude");
        assert_eq!(fetched.position_x, 100.0);
    }

    #[test]
    fn test_list_by_project() {
        let (db, pid) = setup();
        create(&db, &make_session(pid)).unwrap();
        create(&db, &make_session(pid)).unwrap();

        let sessions = list_by_project(&db, pid).unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn test_update_messages() {
        let (db, pid) = setup();
        let session = make_session(pid);
        let sid = session.id.clone();
        create(&db, &session).unwrap();

        let msgs = r#"[{"id":"1","role":"user","content":"hello"}]"#;
        update_messages(&db, &sid, msgs).unwrap();

        let fetched = get_by_id(&db, &sid).unwrap().unwrap();
        assert_eq!(fetched.messages, msgs);
    }

    #[test]
    fn test_update_status() {
        let (db, pid) = setup();
        let session = make_session(pid);
        let sid = session.id.clone();
        create(&db, &session).unwrap();

        update_status(&db, &sid, "review").unwrap();

        let fetched = get_by_id(&db, &sid).unwrap().unwrap();
        assert_eq!(fetched.status, "review");
    }

    #[test]
    fn test_update_position() {
        let (db, pid) = setup();
        let session = make_session(pid);
        let sid = session.id.clone();
        create(&db, &session).unwrap();

        update_position(&db, &sid, 500.0, 600.0, Some(300.0)).unwrap();

        let fetched = get_by_id(&db, &sid).unwrap().unwrap();
        assert_eq!(fetched.position_x, 500.0);
        assert_eq!(fetched.position_y, 600.0);
        assert_eq!(fetched.height, Some(300.0));
    }

    #[test]
    fn test_delete() {
        let (db, pid) = setup();
        let session = make_session(pid);
        let sid = session.id.clone();
        create(&db, &session).unwrap();

        delete(&db, &sid).unwrap();
        assert!(get_by_id(&db, &sid).unwrap().is_none());
    }

    #[test]
    fn test_cascade_delete_with_project() {
        let (db, pid) = setup();
        let session = make_session(pid);
        let sid = session.id.clone();
        create(&db, &session).unwrap();

        projects::delete(&db, pid).unwrap();
        assert!(get_by_id(&db, &sid).unwrap().is_none());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ai-backend && cargo test db::sessions`
Expected: FAIL — all functions are `todo!()`.

- [ ] **Step 3: Implement CRUD functions**

Replace the `todo!()` stubs:

```rust
pub fn create(db: &Database, session: &DbSession) -> Result<(), String> {
    let conn = db.conn();
    conn.execute(
        "INSERT INTO sessions (id, project_id, title, model, status, position_x, position_y, height, git_branch, worktree, messages, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            session.id, session.project_id, session.title, session.model, session.status,
            session.position_x, session.position_y, session.height,
            session.git_branch, session.worktree, session.messages,
            session.created_at, session.updated_at,
        ],
    ).map_err(|e| format!("failed to create session: {e}"))?;
    Ok(())
}

pub fn get_by_id(db: &Database, id: &str) -> Result<Option<DbSession>, String> {
    let conn = db.conn();
    conn.query_row(
        "SELECT id, project_id, title, model, status, position_x, position_y, height, git_branch, worktree, messages, created_at, updated_at FROM sessions WHERE id = ?1",
        params![id],
        row_to_session,
    ).optional()
    .map_err(|e| format!("failed to get session: {e}"))
}

pub fn list_by_project(db: &Database, project_id: i64) -> Result<Vec<DbSession>, String> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, model, status, position_x, position_y, height, git_branch, worktree, messages, created_at, updated_at FROM sessions WHERE project_id = ?1 ORDER BY created_at ASC"
    ).map_err(|e| format!("failed to prepare query: {e}"))?;

    let rows = stmt.query_map(params![project_id], row_to_session)
        .map_err(|e| format!("failed to list sessions: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to collect sessions: {e}"))
}

pub fn update(db: &Database, session: &DbSession) -> Result<(), String> {
    let conn = db.conn();
    conn.execute(
        "UPDATE sessions SET title = ?1, model = ?2, status = ?3, position_x = ?4, position_y = ?5, height = ?6, git_branch = ?7, worktree = ?8, messages = ?9, updated_at = ?10 WHERE id = ?11",
        params![
            session.title, session.model, session.status,
            session.position_x, session.position_y, session.height,
            session.git_branch, session.worktree, session.messages,
            now(), session.id,
        ],
    ).map_err(|e| format!("failed to update session: {e}"))?;
    Ok(())
}

pub fn update_messages(db: &Database, id: &str, messages: &str) -> Result<(), String> {
    let conn = db.conn();
    conn.execute(
        "UPDATE sessions SET messages = ?1, updated_at = ?2 WHERE id = ?3",
        params![messages, now(), id],
    ).map_err(|e| format!("failed to update messages: {e}"))?;
    Ok(())
}

pub fn update_status(db: &Database, id: &str, status: &str) -> Result<(), String> {
    let conn = db.conn();
    conn.execute(
        "UPDATE sessions SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, now(), id],
    ).map_err(|e| format!("failed to update status: {e}"))?;
    Ok(())
}

pub fn update_position(db: &Database, id: &str, x: f64, y: f64, height: Option<f64>) -> Result<(), String> {
    let conn = db.conn();
    conn.execute(
        "UPDATE sessions SET position_x = ?1, position_y = ?2, height = ?3, updated_at = ?4 WHERE id = ?5",
        params![x, y, height, now(), id],
    ).map_err(|e| format!("failed to update position: {e}"))?;
    Ok(())
}

pub fn delete(db: &Database, id: &str) -> Result<(), String> {
    let conn = db.conn();
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])
        .map_err(|e| format!("failed to delete session: {e}"))?;
    Ok(())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ai-backend && cargo test db::sessions`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add ai-backend/src/db/sessions.rs
git commit -m "feat(db): implement sessions CRUD"
```

---

### Task 6: Settings CRUD

**Files:**
- Modify: `ai-backend/src/db/settings.rs`

- [ ] **Step 1: Write failing tests and stub functions**

`ai-backend/src/db/settings.rs`:

```rust
use rusqlite::{params, OptionalExtension};

use super::Database;

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn get(db: &Database, key: &str) -> Result<Option<String>, String> {
    let conn = db.conn();
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    ).optional()
    .map_err(|e| format!("failed to get setting: {e}"))
}

pub fn set(db: &Database, key: &str, value: &str) -> Result<(), String> {
    let conn = db.conn();
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now()],
    ).map_err(|e| format!("failed to set setting: {e}"))?;
    Ok(())
}

pub fn delete(db: &Database, key: &str) -> Result<(), String> {
    let conn = db.conn();
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])
        .map_err(|e| format!("failed to delete setting: {e}"))?;
    Ok(())
}

pub fn list_by_prefix(db: &Database, prefix: &str) -> Result<Vec<(String, String)>, String> {
    let conn = db.conn();
    let pattern = format!("{prefix}%");
    let mut stmt = conn.prepare(
        "SELECT key, value FROM settings WHERE key LIKE ?1 ORDER BY key"
    ).map_err(|e| format!("failed to prepare query: {e}"))?;

    let rows = stmt.query_map(params![pattern], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| format!("failed to list settings: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to collect settings: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup() -> Database {
        Database::open_memory().unwrap()
    }

    #[test]
    fn test_set_and_get() {
        let db = setup();
        set(&db, "api_key.anthropic", "sk-test-123").unwrap();

        let val = get(&db, "api_key.anthropic").unwrap();
        assert_eq!(val, Some("sk-test-123".to_string()));
    }

    #[test]
    fn test_get_nonexistent() {
        let db = setup();
        let val = get(&db, "nonexistent.key").unwrap();
        assert!(val.is_none());
    }

    #[test]
    fn test_upsert() {
        let db = setup();
        set(&db, "ui.theme", "light").unwrap();
        set(&db, "ui.theme", "dark").unwrap();

        let val = get(&db, "ui.theme").unwrap();
        assert_eq!(val, Some("dark".to_string()));
    }

    #[test]
    fn test_delete() {
        let db = setup();
        set(&db, "api_key.gemini", "key123").unwrap();
        delete(&db, "api_key.gemini").unwrap();

        let val = get(&db, "api_key.gemini").unwrap();
        assert!(val.is_none());
    }

    #[test]
    fn test_list_by_prefix() {
        let db = setup();
        set(&db, "api_key.anthropic", "sk-1").unwrap();
        set(&db, "api_key.gemini", "AIza").unwrap();
        set(&db, "ui.theme", "dark").unwrap();

        let api_keys = list_by_prefix(&db, "api_key.").unwrap();
        assert_eq!(api_keys.len(), 2);
        assert_eq!(api_keys[0].0, "api_key.anthropic");
        assert_eq!(api_keys[1].0, "api_key.gemini");
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ai-backend && cargo test db::settings`
Expected: FAIL — functions contain real implementation but if there are compile issues, fix them.

Note: Unlike Tasks 4-5, the settings CRUD is simple enough (4 one-liner functions) that tests and implementation are written together. The "verify" step confirms correctness.

- [ ] **Step 3: Run all db tests**

Run: `cd ai-backend && cargo test db::`
Expected: All 20 tests PASS (2 migrations + 6 projects + 7 sessions + 5 settings).

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/db/settings.rs
git commit -m "feat(db): implement settings CRUD"
```

---

## Chunk 3: Router Integration

### Task 7: Wire Database into main.rs

**Files:**
- Modify: `ai-backend/src/main.rs`
- Modify: `ai-backend/src/router.rs`

- [ ] **Step 1: Initialize Database in main.rs**

In `ai-backend/src/main.rs`, add database initialization after creating the session manager:

```rust
// After: let mut session_manager = session::SessionManager::new();
let database = db::Database::open_default()
    .expect("failed to initialize database");
eprintln!("[ai-backend] database initialized");
```

Pass `database.clone()` to `router::handle_request`:

```rust
// Change the handle_request call to include database
let result = router::handle_request(
    req,
    &mut session_manager,
    event_tx.clone(),
    &database,
).await;
```

- [ ] **Step 2: Update router signature**

In `ai-backend/src/router.rs`, update `handle_request` to accept `&Database`:

```rust
use crate::db::{self, Database};

pub async fn handle_request(
    req: Request,
    session_manager: &mut SessionManager,
    event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    database: &Database,
) -> OutgoingMessage {
    // ... existing match arms unchanged ...
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/main.rs ai-backend/src/router.rs
git commit -m "feat(db): wire Database into main loop and router"
```

---

### Task 8: Add project protocol methods

**Files:**
- Modify: `ai-backend/src/router.rs`

- [ ] **Step 1: Add project methods to the match**

Add these arms to the `match req.method.as_str()` block in `router.rs`:

```rust
"project.open" => {
    // Open or create a project by path. Returns the project.
    let path = req.params.get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if path.is_empty() {
        return ErrorResponse::new(req.id, 1002, "path is required".to_string());
    }

    // Extract name from last path segment
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Upsert: get existing or create new
    let project = match db::projects::get_by_path(database, &path) {
        Ok(Some(p)) => {
            let _ = db::projects::touch(database, p.id);
            db::projects::get_by_id(database, p.id)
                .unwrap_or(Some(p))
                .unwrap()
        }
        Ok(None) => {
            match db::projects::create(database, &name, &path) {
                Ok(p) => p,
                Err(e) => return ErrorResponse::new(req.id, 1003, e),
            }
        }
        Err(e) => return ErrorResponse::new(req.id, 1003, e),
    };

    // Also set the working directory for Claude processes
    session_manager.set_working_dir(path);

    Response::ok(req.id, serde_json::to_value(&project).unwrap())
}

"project.list" => {
    match db::projects::list(database) {
        Ok(projects) => Response::ok(req.id, json!({ "projects": projects })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}

"project.update" => {
    let project: db::Project = match serde_json::from_value(req.params.clone()) {
        Ok(p) => p,
        Err(e) => return ErrorResponse::new(req.id, 1002, format!("invalid params: {e}")),
    };
    match db::projects::update(database, &project) {
        Ok(()) => Response::ok(req.id, json!({ "ok": true })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}

"project.delete" => {
    let id = req.params.get("id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    match db::projects::delete(database, id) {
        Ok(()) => Response::ok(req.id, json!({ "ok": true })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add ai-backend/src/router.rs
git commit -m "feat(db): add project.* protocol methods"
```

---

### Task 9: Add session persistence protocol methods

**Files:**
- Modify: `ai-backend/src/router.rs`

- [ ] **Step 1: Add session persistence methods to the match**

```rust
"session.save" => {
    let session: db::DbSession = match serde_json::from_value(req.params.clone()) {
        Ok(s) => s,
        Err(e) => return ErrorResponse::new(req.id, 1002, format!("invalid params: {e}")),
    };
    // Upsert: try update first, if no rows affected then insert
    let exists = db::sessions::get_by_id(database, &session.id)
        .unwrap_or(None)
        .is_some();
    let result = if exists {
        db::sessions::update(database, &session)
    } else {
        db::sessions::create(database, &session)
    };
    match result {
        Ok(()) => Response::ok(req.id, json!({ "ok": true })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}

"session.load" => {
    let project_id = req.params.get("project_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    match db::sessions::list_by_project(database, project_id) {
        Ok(sessions) => Response::ok(req.id, json!({ "sessions": sessions })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}

"session.delete" => {
    let session_id = req.params.get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    match db::sessions::delete(database, &session_id) {
        Ok(()) => Response::ok(req.id, json!({ "ok": true })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}

"session.update_messages" => {
    let session_id = req.params.get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    // messages arrives as a JSON value — if it's a string, use as-is;
    // if it's an array/object, re-serialize it.
    let messages = match req.params.get("messages") {
        Some(v) if v.is_string() => v.as_str().unwrap().to_string(),
        Some(v) => v.to_string(),
        None => "[]".to_string(),
    };
    match db::sessions::update_messages(database, &session_id, &messages) {
        Ok(()) => Response::ok(req.id, json!({ "ok": true })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}

"session.update_status" => {
    let session_id = req.params.get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let status = req.params.get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("inbox")
        .to_string();
    match db::sessions::update_status(database, &session_id, &status) {
        Ok(()) => Response::ok(req.id, json!({ "ok": true })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}

"session.update_position" => {
    let session_id = req.params.get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let x = req.params.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let y = req.params.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let height = req.params.get("height").and_then(|v| v.as_f64());
    match db::sessions::update_position(database, &session_id, x, y, height) {
        Ok(()) => Response::ok(req.id, json!({ "ok": true })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}
```

- [ ] **Step 2: Add settings methods to the match**

```rust
"settings.get" => {
    let key = req.params.get("key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    match db::settings::get(database, &key) {
        Ok(value) => Response::ok(req.id, json!({ "value": value })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}

"settings.set" => {
    let key = req.params.get("key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let value = req.params.get("value")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    match db::settings::set(database, &key, &value) {
        Ok(()) => Response::ok(req.id, json!({ "ok": true })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}

"settings.delete" => {
    let key = req.params.get("key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    match db::settings::delete(database, &key) {
        Ok(()) => Response::ok(req.id, json!({ "ok": true })),
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}

"settings.list" => {
    let prefix = req.params.get("prefix")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    match db::settings::list_by_prefix(database, &prefix) {
        Ok(entries) => {
            let obj: serde_json::Map<String, serde_json::Value> = entries
                .into_iter()
                .map(|(k, v)| (k, serde_json::Value::String(v)))
                .collect();
            Response::ok(req.id, json!({ "settings": obj }))
        }
        Err(e) => ErrorResponse::new(req.id, 1003, e),
    }
}
```

- [ ] **Step 3: Verify it compiles and all tests pass**

Run: `cd ai-backend && cargo check && cargo test`
Expected: Compiles, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/router.rs
git commit -m "feat(db): add session and settings protocol methods"
```

---

## Chunk 4: Frontend Integration

### Task 10: Expose working directory via Electron preload

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add IPC handler for working directory in main.ts**

In `electron/main.ts`, add an IPC handler after the existing `sidecar:invoke` handler:

```typescript
ipcMain.handle('get-working-dir', () => {
  return process.cwd();
});
```

- [ ] **Step 2: Expose workingDir in preload.ts**

In `electron/preload.ts`, add `getWorkingDir` to the exposed API:

```typescript
contextBridge.exposeInMainWorld('aiBackend', {
  // ... existing methods ...

  getWorkingDir: (): Promise<string> => {
    return ipcRenderer.invoke('get-working-dir');
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts electron/preload.ts
git commit -m "feat: expose working directory via Electron IPC"
```

---

### Task 11: Add backend service methods

**Files:**
- Modify: `src/services/backend.ts`

- [ ] **Step 1: Read the current backend.ts file**

Read `src/services/backend.ts` to understand the existing `invoke()` pattern.

- [ ] **Step 2: Add TypeScript types for DB entities**

Add to `src/types.ts`:

```typescript
export interface DbProject {
  id: number;
  name: string;
  path: string;
  view_mode: string;
  canvas_x: number;
  canvas_y: number;
  canvas_zoom: number;
  last_opened_at: string;
  created_at: string;
}

export interface DbSession {
  id: string;
  project_id: number;
  title: string;
  model: string;
  status: string;
  position_x: number;
  position_y: number;
  height: number | null;
  git_branch: string | null;
  worktree: string | null;
  messages: string;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Add project methods**

Follow the existing pattern in `backend.ts`: each method checks `isElectron()` and calls `window.aiBackend.invoke()`.

```typescript
async openProject(path: string): Promise<DbProject> {
  if (!isElectron()) return null as any;
  return await window.aiBackend.invoke('project.open', { path });
},

async listProjects(): Promise<DbProject[]> {
  if (!isElectron()) return [];
  const result = await window.aiBackend.invoke('project.list', {});
  return result.projects;
},

async updateProject(project: DbProject): Promise<void> {
  if (!isElectron()) return;
  await window.aiBackend.invoke('project.update', project);
},

async deleteProject(id: number): Promise<void> {
  if (!isElectron()) return;
  await window.aiBackend.invoke('project.delete', { id });
},
```

- [ ] **Step 4: Add session persistence methods**

```typescript
async saveSession(session: DbSession): Promise<void> {
  if (!isElectron()) return;
  await window.aiBackend.invoke('session.save', session);
},

async loadSessions(projectId: number): Promise<DbSession[]> {
  if (!isElectron()) return [];
  const result = await window.aiBackend.invoke('session.load', { project_id: projectId });
  return result.sessions;
},

async persistDeleteSession(sessionId: string): Promise<void> {
  if (!isElectron()) return;
  await window.aiBackend.invoke('session.delete', { session_id: sessionId });
},

async updateMessages(sessionId: string, messages: string): Promise<void> {
  if (!isElectron()) return;
  await window.aiBackend.invoke('session.update_messages', { session_id: sessionId, messages });
},

async updateSessionStatus(sessionId: string, status: string): Promise<void> {
  if (!isElectron()) return;
  await window.aiBackend.invoke('session.update_status', { session_id: sessionId, status });
},

async updateSessionPosition(sessionId: string, x: number, y: number, height?: number): Promise<void> {
  if (!isElectron()) return;
  await window.aiBackend.invoke('session.update_position', { session_id: sessionId, x, y, height });
},
```

- [ ] **Step 5: Add settings methods**

```typescript
async getSetting(key: string): Promise<string | null> {
  if (!isElectron()) return null;
  const result = await window.aiBackend.invoke('settings.get', { key });
  return result.value;
},

async setSetting(key: string, value: string): Promise<void> {
  if (!isElectron()) return;
  await window.aiBackend.invoke('settings.set', { key, value });
},

async deleteSetting(key: string): Promise<void> {
  if (!isElectron()) return;
  await window.aiBackend.invoke('settings.delete', { key });
},

async listSettings(prefix: string): Promise<Record<string, string>> {
  if (!isElectron()) return {};
  const result = await window.aiBackend.invoke('settings.list', { prefix });
  return result.settings;
},
```

- [ ] **Step 6: Commit**

```bash
git add src/services/backend.ts
git commit -m "feat: add project/session/settings backend service methods"
```

---

### Task 12: Integrate persistence into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read current App.tsx**

Read `src/App.tsx` to understand current state management.

- [ ] **Step 2: Add project state and loading logic**

Import the backend service and DB types:

```typescript
import { backend } from './services/backend';
import { DbProject, DbSession } from './types';
```

Add state for current project and a ref to track session creation timestamps:

```typescript
const [currentProject, setCurrentProject] = useState<DbProject | null>(null);
const sessionCreatedAtRef = useRef<Record<string, string>>({});
```

`window.aiBackend` is exposed by the Electron preload script. Check its existence to determine if we're in Electron:

```typescript
const isElectronApp = typeof window !== 'undefined' && window.aiBackend !== undefined;
```

Add a `useEffect` that opens the project on startup. The working directory is obtained via the `getWorkingDir()` IPC call added in Task 10:

```typescript
useEffect(() => {
  if (!isElectronApp) return;

  const initProject = async () => {
    try {
      const cwd = await window.aiBackend.getWorkingDir();
      const project = await backend.openProject(cwd);
      setCurrentProject(project);

      // Load sessions for this project
      const dbSessions = await backend.loadSessions(project.id);
      if (dbSessions.length > 0) {
        const loaded: Session[] = dbSessions.map(s => {
          // Track original created_at so we don't overwrite it on save
          sessionCreatedAtRef.current[s.id] = s.created_at;
          return {
            id: s.id,
            title: s.title,
            model: s.model,
            status: s.status as SessionStatus,
            position: { x: s.position_x, y: s.position_y },
            height: s.height ?? undefined,
            gitBranch: s.git_branch ?? undefined,
            worktree: s.worktree ?? undefined,
            messages: JSON.parse(s.messages),
            diff: null,
          };
        });
        setSessions(loaded);
      }

      // Restore view mode
      setViewMode(project.view_mode as 'canvas' | 'board' | 'tab');
    } catch (e) {
      console.error('Failed to load project:', e);
    }
  };

  initProject();
}, []);
```

- [ ] **Step 3: Add auto-save on session changes**

Add a debounced save effect. Preserve original `created_at` timestamps:

```typescript
useEffect(() => {
  if (!isElectronApp || !currentProject) return;

  const saveTimeout = setTimeout(() => {
    const now = new Date().toISOString();
    sessions.forEach(session => {
      // Use tracked created_at, or set it for new sessions
      if (!sessionCreatedAtRef.current[session.id]) {
        sessionCreatedAtRef.current[session.id] = now;
      }
      const dbSession: DbSession = {
        id: session.id,
        project_id: currentProject.id,
        title: session.title,
        model: session.model,
        status: session.status,
        position_x: session.position.x,
        position_y: session.position.y,
        height: session.height ?? null,
        git_branch: session.gitBranch ?? null,
        worktree: session.worktree ?? null,
        messages: JSON.stringify(session.messages),
        created_at: sessionCreatedAtRef.current[session.id],
        updated_at: now,
      };
      backend.saveSession(dbSession).catch(console.error);
    });
  }, 1000); // Debounce 1 second

  return () => clearTimeout(saveTimeout);
}, [sessions, currentProject]);
```

- [ ] **Step 4: Save view mode changes**

```typescript
useEffect(() => {
  if (!isElectronApp || !currentProject) return;
  backend.updateProject({ ...currentProject, view_mode: viewMode }).catch(console.error);
}, [viewMode, currentProject]);
```

- [ ] **Step 5: Sync session deletions to DB**

When a session is removed from React state, it must also be deleted from the DB. Wrap the `setSessions` updater to track deletions:

```typescript
// Track loaded session IDs to detect deletions
const loadedSessionIdsRef = useRef<Set<string>>(new Set());

// Update the ref whenever sessions change
useEffect(() => {
  if (!isElectronApp || !currentProject) return;

  const currentIds = new Set(sessions.map(s => s.id));
  const previousIds = loadedSessionIdsRef.current;

  // Find deleted sessions (were in previous set, not in current)
  previousIds.forEach(id => {
    if (!currentIds.has(id)) {
      backend.persistDeleteSession(id).catch(console.error);
    }
  });

  loadedSessionIdsRef.current = currentIds;
}, [sessions, currentProject]);
```

Also populate `loadedSessionIdsRef` when sessions are loaded from DB (in the `initProject` function):

```typescript
// After: setSessions(loaded);
loadedSessionIdsRef.current = new Set(loaded.map(s => s.id));
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run lint` (TypeScript check)
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/types.ts
git commit -m "feat: integrate SQLite persistence into App state management"
```

---

### Task 13: Final integration test

- [ ] **Step 1: Build and run all Rust tests**

Run: `cd ai-backend && cargo test`
Expected: All tests pass.

- [ ] **Step 2: Build the frontend**

Run: `npm run build`
Expected: Successful build with no errors.

- [ ] **Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. In Electron mode, verify:
   - App starts without database errors (check sidecar stderr)
   - Creating a session persists to DB
   - Refreshing the app restores sessions
   - Switching view modes persists
   - Settings (API keys) persist

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete SQLite persistence integration"
```
