# Multi-CLI Agent: Codex Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Codex CLI session support to the Rust sidecar and frontend, with zero changes to existing Claude modules.

**Architecture:** New `codex/` module in Rust backend handles process spawning and JSONL normalization. SessionManager dispatches on `info.model` string. Frontend extends types and `SessionWindow` with minimal branching for Codex thread ID handling.

**Tech Stack:** Rust (tokio, serde_json), TypeScript/React, Codex CLI (`codex exec --json`)

**Spec:** `docs/superpowers/specs/2026-03-16-multi-cli-agent-extensibility-design.md`

---

## Chunk 1: Database & Rust Types

### Task 1: Database Migration — Add `codex_thread_id` Column

**Files:**
- Modify: `ai-backend/src/db/migrations.rs:1-30`
- Modify: `ai-backend/src/db/types.rs:16-32`

- [ ] **Step 1: Write failing test for v3 migration**

Add to the existing `mod tests` block in `migrations.rs`:

```rust
#[test]
fn test_v3_migration_adds_codex_thread_id() {
    let db = Database::open_memory().unwrap();

    let conn = db.conn();
    let has_column: bool = conn
        .prepare("SELECT codex_thread_id FROM sessions LIMIT 0")
        .is_ok();
    assert!(has_column, "codex_thread_id column should exist after migration");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-backend && cargo test test_v3_migration_adds_codex_thread_id -- --nocapture`
Expected: FAIL — column `codex_thread_id` does not exist

- [ ] **Step 3: Implement migrate_v3 and update CURRENT_VERSION**

In `migrations.rs`:
- Change `CURRENT_VERSION` from `2` to `3` on line 3
- Add `if version < 3 { migrate_v3(&conn)?; }` after line 18
- Add the `migrate_v3` function:

```rust
fn migrate_v3(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch("
        ALTER TABLE sessions ADD COLUMN codex_thread_id TEXT DEFAULT NULL;
        PRAGMA user_version = 3;
    ").map_err(|e| format!("migration v3 failed: {e}"))?;

    Ok(())
}
```

- [ ] **Step 4: Update DbSession struct in types.rs**

In `ai-backend/src/db/types.rs`, add after line 31 (`claude_session_id`):

```rust
    pub codex_thread_id: Option<String>,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ai-backend && cargo test test_v3_migration -- --nocapture`
Expected: PASS

- [ ] **Step 6: Fix existing migration tests**

Update **two** existing tests:
- `test_fresh_migration_creates_tables` — change expected version from `2` to `3` on line 106
- `test_migration_is_idempotent` — change expected version from `2` to `3` on line 117

Run: `cd ai-backend && cargo test migrations -- --nocapture`
Expected: All migration tests PASS

- [ ] **Step 7: Commit**

```bash
git add ai-backend/src/db/migrations.rs ai-backend/src/db/types.rs
git commit -m "feat: add migrate_v3 for codex_thread_id column"
```

---

### Task 2: Update DB Session Queries for `codex_thread_id`

**Files:**
- Modify: `ai-backend/src/db/sessions.rs:1-145`

- [ ] **Step 1: Write failing test**

Add to `mod tests` in `sessions.rs`:

```rust
#[test]
fn test_codex_thread_id_persistence() {
    let (db, project_id) = setup();
    let mut session = make_session(project_id);
    session.codex_thread_id = Some("thread_abc123".to_string());
    let session_id = session.id.clone();
    create(&db, &session).unwrap();

    let fetched = get_by_id(&db, &session_id).unwrap().unwrap();
    assert_eq!(fetched.codex_thread_id, Some("thread_abc123".to_string()));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-backend && cargo test test_codex_thread_id_persistence -- --nocapture`
Expected: FAIL — `codex_thread_id` field does not exist on `DbSession` usage in queries

- [ ] **Step 3: Update `row_to_session` (line 9-26)**

Add `codex_thread_id: row.get(14)?` after `claude_session_id: row.get(13)?` on line 24.

- [ ] **Step 4: Update `create()` SQL (lines 28-52)**

Add `codex_thread_id` to the INSERT column list and VALUES. The SQL becomes:

```sql
INSERT INTO sessions (id, project_id, title, model, status, position_x, position_y, height, git_branch, worktree, messages, created_at, updated_at, claude_session_id, codex_thread_id)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
```

Add `session.codex_thread_id` as `?15` in the params.

- [ ] **Step 5: Update SELECT queries in `get_by_id` (line 57) and `list_by_project` (line 70)**

Add `, codex_thread_id` to both SELECT column lists, after `claude_session_id`.

- [ ] **Step 6: Update `update()` SQL (lines 84-107)**

Add `codex_thread_id = ?12` to the SET clause. Note: the existing code uses `now()` inline for `updated_at` (not a bound param). Keep that pattern. Shift `id` to `?13`.

The full UPDATE becomes:
```sql
UPDATE sessions SET project_id = ?1, title = ?2, model = ?3, status = ?4, position_x = ?5, position_y = ?6, height = ?7, git_branch = ?8, worktree = ?9, messages = ?10, claude_session_id = ?11, codex_thread_id = ?12, updated_at = ?13 WHERE id = ?14
```

Params: `[session.project_id, session.title, session.model, session.status, session.position_x, session.position_y, session.height, session.git_branch, session.worktree, session.messages, session.claude_session_id, session.codex_thread_id, now(), session.id]`

- [ ] **Step 7: Update `make_session` test helper (line 156-173)**

Add `codex_thread_id: None` to the test helper.

- [ ] **Step 8: Run all session tests**

Run: `cd ai-backend && cargo test sessions -- --nocapture`
Expected: All PASS including new `test_codex_thread_id_persistence`

- [ ] **Step 9: Commit**

```bash
git add ai-backend/src/db/sessions.rs
git commit -m "feat: add codex_thread_id to all session DB queries"
```

---

## Chunk 2: Codex Module — Types & Client

### Task 3: Create `codex/types.rs` — Codex Event Types

**Files:**
- Create: `ai-backend/src/codex/types.rs`
- Create: `ai-backend/src/codex/mod.rs`

- [ ] **Step 1: Create `codex/mod.rs`**

```rust
pub mod client;
pub mod types;
pub mod normalizer;
```

- [ ] **Step 2: Create `codex/types.rs` with Codex JSONL event types**

Based on Codex's `exec --json` output format:

```rust
use serde::Deserialize;
use serde_json::Value;

/// Top-level Codex JSONL event — each line from `codex exec --json` stdout
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum CodexEvent {
    #[serde(rename = "thread.started")]
    ThreadStarted {
        thread_id: Option<String>,
    },

    #[serde(rename = "turn.started")]
    TurnStarted {},

    #[serde(rename = "item.started")]
    ItemStarted {
        item: CodexItem,
    },

    #[serde(rename = "item.completed")]
    ItemCompleted {
        item: CodexItem,
    },

    #[serde(rename = "turn.completed")]
    TurnCompleted {
        usage: Option<CodexUsage>,
    },

    /// Catch-all for unknown events
    #[serde(other)]
    Unknown,
}

/// Streaming delta events use a different naming convention
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum CodexDelta {
    #[serde(rename = "item.output_text.delta")]
    OutputTextDelta {
        item_id: Option<String>,
        delta: Option<String>,
    },

    #[serde(rename = "item.output_text.done")]
    OutputTextDone {
        item_id: Option<String>,
        text: Option<String>,
    },

    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CodexItem {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub status: Option<String>,
    // agent_message fields
    pub text: Option<String>,
    // command_execution fields
    pub command: Option<String>,
    pub output: Option<String>,
    pub exit_code: Option<i32>,
    // file_change fields
    pub filename: Option<String>,
    // Generic content
    pub content: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CodexUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_input_tokens: Option<u64>,
}

/// Parse a JSON line into either a CodexEvent or CodexDelta
pub fn parse_line(line: &str) -> Option<CodexEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    match serde_json::from_str::<CodexEvent>(trimmed) {
        Ok(event) => Some(event),
        Err(e) => {
            eprintln!("[codex] failed to parse event: {e} — line: {trimmed}");
            None
        }
    }
}

pub fn parse_delta(line: &str) -> Option<CodexDelta> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str::<CodexDelta>(trimmed).ok()
}
```

- [ ] **Step 3: Register module in main.rs**

Add `mod codex;` after `mod claude;` on line 10 of `main.rs`.

- [ ] **Step 4: Verify compilation**

Run: `cd ai-backend && cargo check`
Expected: Compiles (with unused warnings, OK for now)

- [ ] **Step 5: Commit**

```bash
git add ai-backend/src/codex/ ai-backend/src/main.rs
git commit -m "feat: add codex module with JSONL event types"
```

---

### Task 4: Create `codex/client.rs` — CodexProcess

**Files:**
- Create: `ai-backend/src/codex/client.rs`

- [ ] **Step 1: Implement CodexProcess**

```rust
use std::sync::Mutex;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

use super::types::{self, CodexEvent};

pub struct CodexProcess {
    pid: u32,
    child: Mutex<Option<Child>>,  // Mutex for interior mutability (kill via Arc)
}

impl CodexProcess {
    /// Spawn `codex exec --json "prompt"` or `codex exec resume --session <id> --json "prompt"`
    pub fn spawn(
        working_dir: &str,
        prompt: &str,
        resume_thread_id: Option<&str>,
    ) -> Result<(Self, mpsc::UnboundedReceiver<CodexEvent>, mpsc::UnboundedReceiver<String>), String> {
        let mut cmd = Command::new("codex");

        if let Some(thread_id) = resume_thread_id {
            cmd.args(["exec", "resume", "--session", thread_id, "--json", prompt]);
        } else {
            cmd.args(["exec", "--json", "--full-auto", prompt]);
        }

        cmd.current_dir(working_dir)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);  // Auto-cleanup if CodexProcess is dropped

        let mut child = cmd.spawn().map_err(|e| format!("failed to spawn codex: {e}"))?;
        let pid = child.id().ok_or("failed to get codex PID")?;

        let stdout = child.stdout.take()
            .ok_or_else(|| "failed to capture codex stdout".to_string())?;
        let stderr = child.stderr.take()
            .ok_or_else(|| "failed to capture codex stderr".to_string())?;

        let (tx, rx) = mpsc::unbounded_channel::<CodexEvent>();
        let (stderr_tx, stderr_rx) = mpsc::unbounded_channel::<String>();

        // Spawn stdout reader — parse JSONL events
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(event) = types::parse_line(&line) {
                    let _ = tx.send(event);
                }
            }
        });

        // Spawn stderr reader — collect for error reporting
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[codex stderr] {}", line);
                let _ = stderr_tx.send(line);
            }
        });

        Ok((CodexProcess { pid, child: Mutex::new(Some(child)) }, rx, stderr_rx))
    }

    /// Send SIGINT to interrupt the codex process
    pub fn interrupt(&self) -> Result<(), String> {
        unsafe {
            if libc::kill(self.pid as i32, libc::SIGINT) != 0 {
                return Err("failed to send SIGINT to codex process".to_string());
            }
        }
        Ok(())
    }

    /// Kill the codex process (safe to call via Arc)
    pub fn kill(&self) -> Result<(), String> {
        if let Some(ref mut child) = *self.child.lock().unwrap() {
            // tokio Child::kill is not async when called as start_kill
            child.start_kill().map_err(|e| format!("failed to kill codex: {e}"))?;
        }
        Ok(())
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }
}
```

**Key design choices (fixes from review):**
- Uses `tokio::process::Command` (not `std::process::Command`) for proper async compatibility
- `child` wrapped in `Mutex<Option<Child>>` for interior mutability — allows `kill()` via `&self` through `Arc`
- `kill_on_drop(true)` ensures process cleanup if `CodexProcess` is dropped
- Resume uses `--session <thread_id>` to target specific thread (not `--last` which could resume wrong session)
- Returns `stderr_rx` channel for error reporting to normalizer (spec requirement: `message.error` on stderr)

- [ ] **Step 2: Verify compilation**

Run: `cd ai-backend && cargo check`
Expected: Compiles cleanly

- [ ] **Step 3: Commit**

```bash
git add ai-backend/src/codex/client.rs
git commit -m "feat: add CodexProcess — spawn, interrupt, kill"
```

---

## Chunk 3: Codex Normalizer

### Task 5: Create `codex/normalizer.rs` — Event-to-Block Mapping

**Files:**
- Create: `ai-backend/src/codex/normalizer.rs`

- [ ] **Step 1: Implement `process_codex_stream()`**

This is the core normalizer that maps Codex JSONL events to unified block protocol events. It mirrors `normalizer/parser.rs` but for Codex.

```rust
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

use crate::protocol::{Event, OutgoingMessage};
use super::types::CodexEvent;

/// Process Codex JSONL event stream and emit unified block events.
///
/// Also accepts stderr_rx to emit message.error on process failure (spec §5.2).
/// The sessions_arc + session_id are used to clear codex_process after turn completes.
pub async fn process_codex_stream(
    session_id: &str,
    mut event_rx: mpsc::UnboundedReceiver<CodexEvent>,
    mut stderr_rx: mpsc::UnboundedReceiver<String>,
    event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    codex_tid_slot: Arc<Mutex<Option<String>>>,
    sessions_arc: Arc<Mutex<HashMap<String, crate::session::manager::ActiveSession>>>,
) {
    let mut block_index: usize = 0;
    let mut turn_completed = false;

    while let Some(event) = event_rx.recv().await {
        match event {
            CodexEvent::ThreadStarted { thread_id } => {
                if let Some(ref tid) = thread_id {
                    *codex_tid_slot.lock().unwrap() = Some(tid.clone());
                }

                let _ = event_tx.send(OutgoingMessage::Event(Event {
                    event: "session.init".to_string(),
                    data: json!({
                        "session_id": session_id,
                        "codex_thread_id": thread_id,
                        "agent": "codex"
                    }),
                }));
            }

            CodexEvent::TurnStarted {} => {}

            CodexEvent::ItemStarted { ref item } => {
                let item_type = item.item_type.as_deref().unwrap_or("unknown");

                match item_type {
                    "agent_message" | "message" => {
                        let _ = event_tx.send(OutgoingMessage::Event(Event {
                            event: "block.start".to_string(),
                            data: json!({
                                "session_id": session_id,
                                "block_index": block_index,
                                "block": { "type": "text", "content": item.text.as_deref().unwrap_or("") },
                                "agent": "codex"
                            }),
                        }));
                    }
                    "command_execution" => {
                        let _ = event_tx.send(OutgoingMessage::Event(Event {
                            event: "block.start".to_string(),
                            data: json!({
                                "session_id": session_id,
                                "block_index": block_index,
                                "block": { "type": "tool_call", "tool": "Bash", "args": item.command.as_deref().unwrap_or(""), "status": "running" },
                                "agent": "codex"
                            }),
                        }));
                    }
                    "file_change" | "file_edit" => {
                        let _ = event_tx.send(OutgoingMessage::Event(Event {
                            event: "block.start".to_string(),
                            data: json!({
                                "session_id": session_id,
                                "block_index": block_index,
                                "block": { "type": "tool_call", "tool": "Edit", "args": item.filename.as_deref().unwrap_or(""), "status": "running" },
                                "agent": "codex"
                            }),
                        }));
                    }
                    "mcp_tool_call" => {
                        let _ = event_tx.send(OutgoingMessage::Event(Event {
                            event: "block.start".to_string(),
                            data: json!({
                                "session_id": session_id,
                                "block_index": block_index,
                                "block": { "type": "tool_call", "tool": item.text.as_deref().unwrap_or("mcp"), "args": "", "status": "running" },
                                "agent": "codex"
                            }),
                        }));
                    }
                    "reasoning" => { continue; }
                    other => {
                        eprintln!("[codex normalizer] unknown item type: {other}");
                        continue;
                    }
                }
                block_index += 1;
            }

            CodexEvent::ItemCompleted { ref item } => {
                let item_type = item.item_type.as_deref().unwrap_or("unknown");
                if item_type == "reasoning" { continue; }

                let status = match item.status.as_deref() {
                    Some("completed") | None => "done",
                    Some("failed") => "error",
                    _ => "done",
                };

                if (item_type == "agent_message" || item_type == "message") && item.text.is_some() {
                    let idx = block_index.saturating_sub(1);
                    let _ = event_tx.send(OutgoingMessage::Event(Event {
                        event: "block.delta".to_string(),
                        data: json!({ "session_id": session_id, "block_index": idx, "delta": { "content": item.text } }),
                    }));
                }
                if item_type == "command_execution" && item.output.is_some() {
                    let idx = block_index.saturating_sub(1);
                    let _ = event_tx.send(OutgoingMessage::Event(Event {
                        event: "block.delta".to_string(),
                        data: json!({ "session_id": session_id, "block_index": idx, "delta": { "content": item.output } }),
                    }));
                }

                let idx = block_index.saturating_sub(1);
                let _ = event_tx.send(OutgoingMessage::Event(Event {
                    event: "block.stop".to_string(),
                    data: json!({ "session_id": session_id, "block_index": idx, "status": status }),
                }));
            }

            CodexEvent::TurnCompleted { usage } => {
                turn_completed = true;
                let usage_json = match usage {
                    Some(u) => json!({ "input_tokens": u.input_tokens, "output_tokens": u.output_tokens }),
                    None => json!({}),
                };
                let _ = event_tx.send(OutgoingMessage::Event(Event {
                    event: "message.complete".to_string(),
                    data: json!({ "session_id": session_id, "usage": usage_json, "agent": "codex" }),
                }));
            }

            CodexEvent::Unknown => {}
        }
    }

    // Stream ended — clear codex_process ref (process is dead)
    {
        let mut sessions = sessions_arc.lock().unwrap();
        if let Some(active) = sessions.get_mut(session_id) {
            active.codex_process = None;
        }
    }

    // If no turn.completed was received, collect stderr and emit message.error
    if !turn_completed {
        let mut stderr_lines = Vec::new();
        while let Ok(line) = stderr_rx.try_recv() {
            stderr_lines.push(line);
        }
        let error_msg = if stderr_lines.is_empty() {
            "codex process terminated unexpectedly".to_string()
        } else {
            stderr_lines.join("\n")
        };

        let _ = event_tx.send(OutgoingMessage::Event(Event {
            event: "message.error".to_string(),
            data: json!({
                "session_id": session_id,
                "error": { "code": 1005, "message": error_msg },
                "agent": "codex"
            }),
        }));
    }
}
```

**Key fixes from review:**
- **B4 fixed:** Emits `message.error` with collected stderr when process exits without `turn.completed`
- **W3 fixed:** Tracks `turn_completed` flag — only emits `message.error` if turn didn't complete normally (no double `message.complete`)
- **W5 fixed:** Clears `active.codex_process = None` after stream ends, preventing stale PID in `interrupt()`
- Accepts `sessions_arc` param for direct cleanup access
- Accepts `stderr_rx` for error message collection

- [ ] **Step 2: Verify compilation**

Run: `cd ai-backend && cargo check`
Expected: Compiles cleanly

- [ ] **Step 3: Commit**

```bash
git add ai-backend/src/codex/normalizer.rs
git commit -m "feat: add Codex normalizer — JSONL to unified block events"
```

---

## Chunk 4: SessionManager Integration

### Task 6: Extend SessionManager with Codex Dispatch

**Files:**
- Modify: `ai-backend/src/session/manager.rs:35-39` (ActiveSession)
- Modify: `ai-backend/src/session/manager.rs:94-163` (send)
- Modify: `ai-backend/src/session/manager.rs:207-216` (interrupt)

- [ ] **Step 1: Add Codex fields to ActiveSession (line 35-39)**

Change `ActiveSession` from:
```rust
pub(crate) struct ActiveSession {
    info: Session,
    claude_process: Option<Arc<ClaudeProcess>>,
    claude_session_id: Option<String>,
}
```

To:
```rust
pub(crate) struct ActiveSession {
    info: Session,
    claude_process: Option<Arc<ClaudeProcess>>,
    claude_session_id: Option<String>,
    codex_process: Option<Arc<crate::codex::client::CodexProcess>>,
    codex_thread_id: Option<String>,
}
```

- [ ] **Step 2: Update `create()` to accept `codex_thread_id`**

Change the `create` method signature (around line 67) to:
```rust
pub fn create(&self, model: String, max_tokens: u32, claude_session_id: Option<String>, codex_thread_id: Option<String>) -> String {
```

And in the `ActiveSession` initialization (around line 82), add:
```rust
codex_process: None,
codex_thread_id,
```

- [ ] **Step 2b: Update `create_ephemeral_session()` (lines 185-205)**

This method also constructs `ActiveSession` and must include the new fields. Add to the `ActiveSession` init block at line 197-201:

```rust
        let active = ActiveSession {
            info,
            claude_process: None,
            claude_session_id: None,
            codex_process: None,     // NEW
            codex_thread_id: None,   // NEW
        };
```

- [ ] **Step 3: Add model-based dispatch in `send()` (lines 94-163)**

Wrap the existing Claude logic in a match branch. Replace lines 108-163 with:

```rust
        // Dispatch based on model
        let is_codex = {
            let sessions = self.sessions.lock().unwrap();
            let active = sessions.get(session_id).unwrap();
            active.info.model == "codex"
        };

        if is_codex {
            // === Codex path: short-lived process per turn ===
            let (working_dir, resume_tid) = {
                let sessions = self.sessions.lock().unwrap();
                let active = sessions.get(session_id).unwrap();
                let wd = self.working_dir.lock().unwrap().clone();
                let tid = active.codex_thread_id.clone();
                (wd, tid)
            };

            let (process, event_rx, stderr_rx) = crate::codex::client::CodexProcess::spawn(
                &working_dir,
                text,
                resume_tid.as_deref(),
            ).map_err(|e| SessionError::SpawnFailed(e))?;

            let process = Arc::new(process);
            {
                let mut sessions = self.sessions.lock().unwrap();
                let active = sessions.get_mut(session_id).unwrap();
                active.codex_process = Some(process.clone());
            }

            // Create shared slot for codex_thread_id capture
            let codex_tid_slot = std::sync::Arc::new(std::sync::Mutex::new(None::<String>));
            let slot_clone = codex_tid_slot.clone();

            // Spawn normalizer (also handles codex_process cleanup and error reporting)
            let sid = session_id.to_string();
            let tx = event_tx.clone();
            let sessions_for_normalizer = self.sessions_arc();
            tokio::spawn(async move {
                crate::codex::normalizer::process_codex_stream(
                    &sid, event_rx, stderr_rx, tx, slot_clone, sessions_for_normalizer,
                ).await;
            });

            // Spawn follow-up task to capture codex_thread_id
            let sessions_arc = self.sessions_arc();
            let sid_owned = session_id.to_string();
            let slot = codex_tid_slot.clone();
            tokio::spawn(async move {
                for _ in 0..50 {
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    let val = slot.lock().unwrap().clone();
                    if let Some(tid) = val {
                        let mut sessions = sessions_arc.lock().unwrap();
                        if let Some(active) = sessions.get_mut(&sid_owned) {
                            active.codex_thread_id = Some(tid);
                        }
                        break;
                    }
                }
            });
        } else {
            // === Claude path: existing logic, untouched ===
            let claude_process = {
                // ... (keep all existing Claude code exactly as-is from line 109 to 156)
            };

            claude_process.send_message(text).await
                .map_err(|e| SessionError::SpawnFailed(e))?;
        }
```

**Important:** The existing Claude code block (lines 109-160) is wrapped inside the `else` branch but its content is NOT modified.

- [ ] **Step 4: Update `interrupt()` for Codex (lines 207-216)**

Change `interrupt` to handle both agent types:

```rust
    pub fn interrupt(&self, session_id: &str) -> Result<(), SessionError> {
        let sessions = self.sessions.lock().unwrap();
        let active = sessions
            .get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        if active.info.model == "codex" {
            if let Some(ref process) = active.codex_process {
                process.interrupt().map_err(|e| SessionError::SpawnFailed(e))?;
            }
        } else {
            if let Some(ref process) = active.claude_process {
                process.interrupt().map_err(|e| SessionError::SpawnFailed(e))?;
            }
        }
        Ok(())
    }
```

- [ ] **Step 5: Verify compilation**

Run: `cd ai-backend && cargo check`
Expected: Compiles cleanly

- [ ] **Step 6: Commit**

```bash
git add ai-backend/src/session/manager.rs
git commit -m "feat: SessionManager dispatch — Codex path alongside Claude"
```

---

### Task 7: Update Router for `codex_thread_id`

**Files:**
- Modify: `ai-backend/src/router.rs:33-51` (session.create handler)

- [ ] **Step 1: Add `codex_thread_id` param extraction**

After line 47 (`claude_session_id` extraction), add:

```rust
            let codex_thread_id = req.params.get("codex_thread_id")
                .and_then(|v| v.as_str())
                .map(String::from);
```

- [ ] **Step 2: Update `session_manager.create()` call on line 49**

Change from:
```rust
let session_id = session_manager.create(model, max_tokens, claude_session_id);
```

To:
```rust
let session_id = session_manager.create(model, max_tokens, claude_session_id, codex_thread_id);
```

- [ ] **Step 3: Verify compilation**

Run: `cd ai-backend && cargo check`
Expected: Compiles cleanly

- [ ] **Step 4: Run all backend tests**

Run: `cd ai-backend && cargo test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add ai-backend/src/router.rs
git commit -m "feat: router accepts codex_thread_id in session.create"
```

---

## Chunk 5: Frontend Integration

### Task 8: Extend Frontend Types

**Files:**
- Modify: `src/types.ts:48-62` (Session), `src/types.ts:64-90` (DbSession)

- [ ] **Step 1: Add `codexThreadId` to Session interface**

After `claudeSessionId?: string;` (line 61), add:

```typescript
  codexThreadId?: string;
```

- [ ] **Step 2: Add `codex_thread_id` to DbSession interface**

After `claude_session_id: string | null;` (line 90), add:

```typescript
  codex_thread_id: string | null;
```

- [ ] **Step 3: Add `getAgentType` helper**

Add after the Session interface:

```typescript
export function getAgentType(model: string): 'claude' | 'codex' {
  if (model.startsWith('claude')) return 'claude';
  if (model === 'codex') return 'codex';
  return 'claude';
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/types.ts
git commit -m "feat: add codexThreadId to Session and DbSession types"
```

---

### Task 9: Update Backend Service

**Files:**
- Modify: `src/services/backend.ts:8-14` (createSession), `src/services/backend.ts:89-92` (onSessionInit)

- [ ] **Step 1: Change `createSession` signature (line 8)**

Change from:
```typescript
  async createSession(model: string, claudeSessionId?: string): Promise<string> {
```

To:
```typescript
  async createSession(model: string, opts?: { claudeSessionId?: string; codexThreadId?: string }): Promise<string> {
```

- [ ] **Step 2: Update the IPC invoke call (around line 12-13)**

Change from:
```typescript
    return await window.aiBackend.invoke('session.create', { model, claude_session_id: claudeSessionId });
```

To:
```typescript
    return await window.aiBackend.invoke('session.create', {
      model,
      claude_session_id: opts?.claudeSessionId,
      codex_thread_id: opts?.codexThreadId,
    });
```

- [ ] **Step 3: Update `onSessionInit` callback type (line 89)**

Change from:
```typescript
  onSessionInit(callback: (data: { session_id: string; claude_session_id: string }) => void): void {
```

To:
```typescript
  onSessionInit(callback: (data: { session_id: string; claude_session_id?: string; codex_thread_id?: string; agent?: string }) => void): void {
```

- [ ] **Step 4: Update `saveSession` to include `codex_thread_id`**

Ensure `saveSession` passes the full `DbSession` object (which now includes `codex_thread_id`). Check the existing implementation — if it already passes the entire object, no change needed.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No type errors (may have errors from SessionWindow callers — fixed in next task)

- [ ] **Step 6: Commit**

```bash
git add src/services/backend.ts
git commit -m "feat: backend service opts-based createSession, extended onSessionInit"
```

---

### Task 10: Update SessionWindow.tsx

**Files:**
- Modify: `src/components/SessionWindow.tsx` (3 locations)

- [ ] **Step 1: Update `createSession` calls — wrap in opts**

There are **5** call sites for `backend.createSession()` (lines 309, 377, 388, 468, 480). Update **all five** from:

```typescript
backend.createSession(session.model, sessionRef.current.claudeSessionId)
```

To:

```typescript
backend.createSession(session.model,
  sessionRef.current.model === 'codex'
    ? { codexThreadId: sessionRef.current.codexThreadId }
    : { claudeSessionId: sessionRef.current.claudeSessionId }
)
```

- [ ] **Step 2: Update `handleSessionInit` handler (line 246-255)**

Change from:
```typescript
    const handleSessionInit = (data: { session_id: string; claude_session_id: string }) => {
      if (data.session_id === backendSessionIdRef.current) {
        const updated = {
          ...sessionRef.current,
          claudeSessionId: data.claude_session_id,
        };
        sessionRef.current = updated;
        onUpdate(updated);
      }
    };
```

To:
```typescript
    const handleSessionInit = (data: { session_id: string; claude_session_id?: string; codex_thread_id?: string; agent?: string }) => {
      if (data.session_id === backendSessionIdRef.current) {
        const updated = data.agent === 'codex'
          ? { ...sessionRef.current, codexThreadId: data.codex_thread_id }
          : { ...sessionRef.current, claudeSessionId: data.claude_session_id };
        sessionRef.current = updated;
        onUpdate(updated);
      }
    };
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat: SessionWindow Codex session ID handling"
```

---

### Task 11: Update App.tsx Persistence Mapping

**Files:**
- Modify: `src/App.tsx` (DbSession ↔ Session mapping)

- [ ] **Step 1: Update DbSession → Session mapping (line ~158)**

In the `applyProject` callback where `loadSessions` results are mapped to `Session` objects (around line 158, after `claudeSessionId`), add:

```typescript
codexThreadId: s.codex_thread_id || undefined,
```

- [ ] **Step 2: Update ALL Session → DbSession construction sites**

There are **3** locations where `DbSession` objects are constructed. Add `codex_thread_id: session.codexThreadId ?? null` to each:

1. **`flushSessionSaves` callback** (line ~180-197) — the batch save function
2. **Auto-save `useEffect`** (line ~275-292) — the debounced interval save
3. **`handleCreateSession`** (line ~385-401) — immediate persist on create

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: persist codexThreadId through save/load cycle"
```

---

## Chunk 6: End-to-End Verification

### Task 12: Build & Smoke Test

- [ ] **Step 1: Run full Rust backend test suite**

Run: `cd ai-backend && cargo test`
Expected: All tests PASS

- [ ] **Step 2: Run TypeScript type check**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Build the full application**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Verify Claude path is unbroken**

Manual check: Start app, create a Claude session, send a message, verify streaming works, close and reopen — verify session resumes via `claudeSessionId`.

- [ ] **Step 5: Verify Codex path (if codex CLI installed)**

Manual check: Start app, create a Codex session, send a prompt, verify streaming events appear, verify `codexThreadId` is captured and persisted.

- [ ] **Step 6: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: integration fixups for multi-CLI agent support"
```

---

## File Change Summary

| File | Action | Lines Changed |
|------|--------|---------------|
| `ai-backend/src/codex/mod.rs` | Create | ~4 |
| `ai-backend/src/codex/types.rs` | Create | ~100 |
| `ai-backend/src/codex/client.rs` | Create | ~85 |
| `ai-backend/src/codex/normalizer.rs` | Create | ~180 |
| `ai-backend/src/main.rs` | Modify | +1 (mod codex) |
| `ai-backend/src/session/manager.rs` | Modify | ~60 added |
| `ai-backend/src/router.rs` | Modify | +5 |
| `ai-backend/src/db/migrations.rs` | Modify | +12 |
| `ai-backend/src/db/types.rs` | Modify | +1 |
| `ai-backend/src/db/sessions.rs` | Modify | ~15 changed |
| `src/types.ts` | Modify | +8 |
| `src/services/backend.ts` | Modify | ~10 changed |
| `src/components/SessionWindow.tsx` | Modify | ~20 changed |
| `src/App.tsx` | Modify | ~4 |

**Total: 4 new files, 10 modified files. Zero changes to `claude/` or `normalizer/` modules.**
