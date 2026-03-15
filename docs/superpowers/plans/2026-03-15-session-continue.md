# Session Continue (Resume) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement session continuation leveraging Claude CLI's native `--resume` and SIGINT capabilities, so sessions survive stop-button clicks, page closes, and sidecar restarts.

**Architecture:** Two-layer approach — SIGINT interrupts the Claude CLI process without killing it (stop button), while `--resume <session_id>` restores sessions after process death. A shared `Arc<Mutex>` slot passes the Claude session ID from the normalizer back to the session manager.

**Tech Stack:** Rust (tokio, libc, rusqlite), TypeScript/React, Electron IPC

---

## Chunk 1: Backend — ClaudeProcess interrupt & resume

### Task 1: Add `libc` dependency

**Files:**
- Modify: `ai-backend/Cargo.toml`

- [ ] **Step 1: Add libc to Cargo.toml**

In `ai-backend/Cargo.toml`, add `libc` to the `[dependencies]` section:

```toml
libc = "0.2"
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add ai-backend/Cargo.toml ai-backend/Cargo.lock
git commit -m "chore: add libc dependency for SIGINT support"
```

---

### Task 2: Add `cached_pid` and `interrupt()` to ClaudeProcess

**Files:**
- Modify: `ai-backend/src/claude/client.rs`

- [ ] **Step 1: Add `cached_pid` field and capture at spawn**

In `client.rs`, add `cached_pid: Option<u32>` field to `ClaudeProcess` struct (line 10-13). Capture `child.id()` right after `cmd.spawn()` succeeds (line 42), store it in the struct:

```rust
pub struct ClaudeProcess {
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    pub child: Child,
    cached_pid: Option<u32>,  // NEW
}
```

After `let mut child = cmd.spawn()...` (line 42), capture PID:

```rust
let cached_pid = child.id();
```

Update the struct construction (line 87-90):

```rust
let process = ClaudeProcess {
    stdin: Arc::new(Mutex::new(stdin)),
    child,
    cached_pid,
};
```

- [ ] **Step 2: Add `interrupt()` method**

Add after the `send_message` method (after line 117):

```rust
/// Interrupt the claude process via SIGINT (Unix only).
/// Does not terminate the process — just stops current generation.
pub fn interrupt(&self) -> Result<(), String> {
    let pid = self.cached_pid
        .ok_or_else(|| "process already exited".to_string())?;
    let ret = unsafe { libc::kill(pid as i32, libc::SIGINT) };
    if ret != 0 {
        return Err(format!("SIGINT failed with errno: {}", std::io::Error::last_os_error()));
    }
    Ok(())
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/claude/client.rs
git commit -m "feat: add cached_pid and interrupt() to ClaudeProcess"
```

---

### Task 3: Add `--resume` support to `ClaudeProcess::spawn()`

**Files:**
- Modify: `ai-backend/src/claude/client.rs`

- [ ] **Step 1: Change `spawn()` signature and add `--resume` arg**

Change spawn signature (line 20) to accept `resume_session_id`:

```rust
pub fn spawn(
    working_dir: &str,
    resume_session_id: Option<&str>,
) -> Result<(Self, mpsc::UnboundedReceiver<ClaudeJson>), String> {
```

After the existing `cmd.args([...])` block (lines 22-31), add:

```rust
if let Some(sid) = resume_session_id {
    cmd.args(["--resume", sid]);
}
```

- [ ] **Step 2: Update the call site in `session/manager.rs`**

In `manager.rs` line 116, update the `ClaudeProcess::spawn` call to pass `None` for now (will be wired in Task 5):

```rust
let (process, msg_rx) = ClaudeProcess::spawn(&working_dir, None)
    .map_err(|e| SessionError::SpawnFailed(e))?;
```

- [ ] **Step 3: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/claude/client.rs ai-backend/src/session/manager.rs
git commit -m "feat: add --resume support to ClaudeProcess::spawn()"
```

---

## Chunk 2: Backend — SessionManager, normalizer, router

### Task 4: Add `claude_session_id` to ActiveSession and SessionManager

**Files:**
- Modify: `ai-backend/src/session/manager.rs`

- [ ] **Step 1: Add field to `ActiveSession`**

Add `claude_session_id` to the `ActiveSession` struct (line 35-38):

```rust
pub(crate) struct ActiveSession {
    info: Session,
    claude_process: Option<Arc<ClaudeProcess>>,
    claude_session_id: Option<String>,
}
```

- [ ] **Step 2: Update `create()` to accept and store `claude_session_id`**

Change `create()` signature (line 66) — remove `_history` parameter, add `claude_session_id`:

```rust
pub fn create(
    &mut self,
    model: String,
    max_tokens: u32,
    claude_session_id: Option<String>,
) -> String {
```

Update `ActiveSession` construction (line 83-86):

```rust
let active = ActiveSession {
    info,
    claude_process: None,
    claude_session_id,
};
```

- [ ] **Step 3: Wire `claude_session_id` into `send()` for resume**

In `send()` (line 114-116), when spawning a new process, pass the `claude_session_id`:

```rust
let resume_id = active.claude_session_id.as_deref();
let (process, msg_rx) = ClaudeProcess::spawn(&working_dir, resume_id)
    .map_err(|e| SessionError::SpawnFailed(e))?;
```

- [ ] **Step 4: Update `create_ephemeral_session` to include new field**

The `create_ephemeral_session` method (around line 160) also constructs `ActiveSession`. Add `claude_session_id: None`:

```rust
let active = ActiveSession {
    info,
    claude_process: None,
    claude_session_id: None,
};
```

- [ ] **Step 5: Add `interrupt()` method**

Add after `kill()` method (after line 156):

```rust
pub fn interrupt(&self, session_id: &str) -> Result<(), SessionError> {
    let sessions = self.sessions.lock().unwrap();
    let active = sessions.get(session_id)
        .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;
    if let Some(ref process) = active.claude_process {
        process.interrupt()
            .map_err(|e| SessionError::SpawnFailed(e))?;
    }
    Ok(())
}
```

- [ ] **Step 6: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: WILL fail on router.rs call site (still references old `create()` signature with `_history`). This is expected — fix in Task 6. Do NOT commit yet if it fails; proceed to Task 5 and Task 6 first, then compile and commit Tasks 4-6 together.

- [ ] **Step 7: Commit** (after Task 6 passes compile check)

```bash
git add ai-backend/src/session/manager.rs
git commit -m "feat: add claude_session_id to ActiveSession, add interrupt()"
```

---

### Task 5: Update normalizer to capture and emit claude_session_id

**Files:**
- Modify: `ai-backend/src/normalizer/parser.rs`

- [ ] **Step 1: Add `claude_sid_slot` parameter to `process_claude_stream`**

Change function signature (line 18-22) to add the slot:

```rust
pub async fn process_claude_stream(
    session_id: &str,
    mut msg_rx: mpsc::UnboundedReceiver<ClaudeJson>,
    event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    claude_sid_slot: std::sync::Arc<std::sync::Mutex<Option<String>>>,
) {
```

- [ ] **Step 2: Destructure `session_id` from System variant and emit session.init**

Update the `ClaudeJson::System` match arm (line 27) to capture `session_id`:

```rust
ClaudeJson::System { subtype, session_id: claude_sid, model, tools, .. } => {
    if subtype == "init" {
        // Write claude_session_id to shared slot
        if let Some(ref csid) = claude_sid {
            *claude_sid_slot.lock().unwrap() = Some(csid.clone());

            // Emit session.init event to frontend
            let _ = event_tx.send(Event::new("session.init", json!({
                "session_id": session_id,
                "claude_session_id": csid,
            })));
        }

        let model_str = model.unwrap_or_default();
        let tool_count = tools.map(|t| t.len()).unwrap_or(0);
        // Existing block.start/block.stop logic unchanged
        let _ = event_tx.send(Event::new("block.start", json!({
            "session_id": session_id,
            "block_index": block_index,
            "block": {
                "type": "text",
                "content": format!("Connected: {} ({} tools)", model_str, tool_count)
            },
        })));
        let _ = event_tx.send(Event::new("block.stop", json!({
            "session_id": session_id,
            "block_index": block_index,
        })));
        block_index += 1;
    }
}
```

- [ ] **Step 3: Update the call site in `session/manager.rs`**

In `manager.rs` `send()` method, where the normalizer task is spawned (around line 122-127):

```rust
// Create shared slot for claude_session_id
let claude_sid_slot = std::sync::Arc::new(std::sync::Mutex::new(None::<String>));
let slot_clone = claude_sid_slot.clone();

let sid = session_id.to_string();
let tx = event_tx.clone();
tokio::spawn(async move {
    crate::normalizer::parser::process_claude_stream(&sid, msg_rx, tx, slot_clone).await;
});

// Spawn follow-up task to write claude_session_id back to ActiveSession
let sessions_arc = self.sessions_arc();
let sid_owned = session_id.to_string();
let slot = claude_sid_slot.clone();
tokio::spawn(async move {
    for _ in 0..50 {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let val = slot.lock().unwrap().clone();
        if let Some(csid) = val {
            let mut sessions = sessions_arc.lock().unwrap();
            if let Some(active) = sessions.get_mut(&sid_owned) {
                active.claude_session_id = Some(csid);
            }
            break;
        }
    }
});
```

- [ ] **Step 4: Fix existing tests — they need the new parameter**

In `normalizer/parser.rs` tests, the tests don't directly call `process_claude_stream`, they only test `build_tool_block` and `summarize_tool`. No test changes needed.

- [ ] **Step 5: Skip compile check** — router.rs still references old `create()` signature. Proceed to Task 6.

- [ ] **Step 6: Commit** (deferred — commit with Task 4 and Task 6 after all compile)

---

### Task 6: Update router — session.create params & session.interrupt RPC

**Files:**
- Modify: `ai-backend/src/router.rs`

- [ ] **Step 1: Update `session.create` handler**

Find the `session.create` handler (around line 33-49). Change it to:
- Remove `history` extraction
- Add `claude_session_id` extraction
- Update `session_manager.create()` call

```rust
"session.create" => {
    let model = req.params.get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("claude-sonnet-4-20250514")
        .to_string();
    let max_tokens = req.params.get("max_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(4096) as u32;
    let claude_session_id = req.params.get("claude_session_id")
        .and_then(|v| v.as_str())
        .map(String::from);

    let session_id = session_manager.create(model, max_tokens, claude_session_id);
    Response::ok(req.id, json!({ "session_id": session_id }))
}
```

- [ ] **Step 2: Add `session.interrupt` handler**

Add a new match arm after `session.kill`:

```rust
"session.interrupt" => {
    let session_id = match req.params.get("session_id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return ErrorResponse::new(req.id, 1002, "missing session_id"),
    };
    match session_manager.interrupt(session_id) {
        Ok(()) => Response::ok(req.id, json!({ "ok": true })),
        Err(e) => ErrorResponse::new(req.id, e.code(), &e.to_string()),
    }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: Compiles without errors (Tasks 4, 5, 6 are now all consistent)

- [ ] **Step 4: Run existing tests**

Run: `cd ai-backend && cargo test`
Expected: All existing tests pass

- [ ] **Step 5: Commit Tasks 4 + 5 + 6 together**

```bash
git add ai-backend/src/session/manager.rs ai-backend/src/normalizer/parser.rs ai-backend/src/router.rs
git commit -m "feat: session manager interrupt/resume, normalizer claude_session_id capture, router updates"
```

---

## Chunk 3: Backend — Database migration

### Task 7: Add `claude_session_id` column via migration

**Files:**
- Modify: `ai-backend/src/db/migrations.rs`
- Modify: `ai-backend/src/db/types.rs`
- Modify: `ai-backend/src/db/sessions.rs`

- [ ] **Step 1: Add `claude_session_id` field to `DbSession` struct**

In `db/types.rs` (line 16-31), add the field as the last one:

```rust
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
    pub claude_session_id: Option<String>,  // NEW
}
```

- [ ] **Step 2: Add migration v2**

In `db/migrations.rs`:

Update `CURRENT_VERSION` (line 3):

```rust
const CURRENT_VERSION: i64 = 2;
```

In the `run()` function, after the existing `if version < 1` block (around line 14), add:

```rust
if version < 2 {
    migrate_v2(&conn)?;
}
```

Add the new migration function (before the existing test module):

```rust
fn migrate_v2(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("
        ALTER TABLE sessions ADD COLUMN claude_session_id TEXT DEFAULT NULL;
        PRAGMA user_version = 2;
    ")?;
    Ok(())
}
```

- [ ] **Step 3: Update `row_to_session` in `sessions.rs`**

In `db/sessions.rs` (line 9-25), add the new column at index 13:

```rust
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
        claude_session_id: row.get(13)?,  // NEW
    })
}
```

- [ ] **Step 4: Update INSERT query in `create()`**

In `sessions.rs` `create()` function (lines 27-50), add `claude_session_id` to INSERT:

```rust
pub fn create(conn: &Connection, session: &DbSession) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO sessions (id, project_id, title, model, status, position_x, position_y, height, git_branch, worktree, messages, created_at, updated_at, claude_session_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            session.id,
            session.project_id,
            session.title,
            session.model,
            session.status,
            session.position_x,
            session.position_y,
            session.height,
            session.git_branch,
            session.worktree,
            session.messages,
            session.created_at,
            session.updated_at,
            session.claude_session_id,
        ],
    )?;
    Ok(())
}
```

- [ ] **Step 5: Update SELECT queries (all use explicit column lists, NOT `SELECT *`)**

In `get_by_id()` (lines 52-62), update the SELECT to include `claude_session_id`:

```sql
SELECT id, project_id, title, model, status, position_x, position_y, height, git_branch, worktree, messages, created_at, updated_at, claude_session_id FROM sessions WHERE id = ?1
```

In `list_by_project()` (lines 64-80), same update:

```sql
SELECT id, project_id, title, model, status, position_x, position_y, height, git_branch, worktree, messages, created_at, updated_at, claude_session_id FROM sessions WHERE project_id = ?1
```

- [ ] **Step 6: Update `update()` function**

In `sessions.rs` `update()` (lines 82-104), add `claude_session_id` to the UPDATE SET clause:

Add `claude_session_id = ?N` to the SET list and `session.claude_session_id` to params.

- [ ] **Step 7: Update `make_session` test helper**

In `sessions.rs` tests (around line 153-169), the `make_session()` helper constructs a `DbSession`. Add:

```rust
claude_session_id: None,
```

- [ ] **Step 8: Verify it compiles and tests pass**

Run: `cd ai-backend && cargo check && cargo test`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add ai-backend/src/db/
git commit -m "feat: add claude_session_id column via migration v2"
```

---

## Chunk 4: Frontend — Types and backend service

### Task 8: Add `claudeSessionId` to frontend types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `claudeSessionId` to Session interface**

Find the `Session` interface in `types.ts` and add:

```typescript
claudeSessionId?: string;
```

- [ ] **Step 2: Add `claude_session_id` to DbSession interface**

Find the `DbSession` interface and add:

```typescript
claude_session_id: string | null;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: add claudeSessionId to Session and DbSession types"
```

---

### Task 9: Update backend service — createSession, interruptSession, onSessionInit

**Files:**
- Modify: `src/services/backend.ts`

- [ ] **Step 1: Update `createSession` signature**

Change `createSession` (line 8) — replace `history` param with `claudeSessionId`:

```typescript
async createSession(model: string, claudeSessionId?: string): Promise<string> {
    if (!isElectron()) {
        return `mock-${Date.now()}`;
    }
    const result = await window.aiBackend.invoke('session.create', {
        model,
        claude_session_id: claudeSessionId,
    });
    return result.session_id;
},
```

- [ ] **Step 2: Add `interruptSession` method**

Add after `killSession` (after line 38):

```typescript
async interruptSession(sessionId: string): Promise<void> {
    if (!isElectron()) return;
    await window.aiBackend.invoke('session.interrupt', {
        session_id: sessionId,
    });
},
```

- [ ] **Step 3: Add `onSessionInit` method**

Add after `onMessageError` (after line 80):

```typescript
onSessionInit(callback: (data: { session_id: string; claude_session_id: string }) => void): void {
    if (!isElectron()) return;
    window.aiBackend.on('session.init', callback);
},
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/services/backend.ts
git commit -m "feat: add interruptSession, onSessionInit to backend service"
```

---

## Chunk 5: Frontend — SessionWindow changes

### Task 10: Change handleStop from kill to interrupt

**Files:**
- Modify: `src/components/SessionWindow.tsx`

- [ ] **Step 1: Replace killSession with interruptSession in handleStop**

In `handleStop` (around line 420-435), change:

```typescript
// BEFORE:
if (isElectron() && backendSessionIdRef.current) {
    try {
        await backend.killSession(backendSessionIdRef.current);
    } catch (e) {
        console.error('[kill session error]', e);
    }
    backendSessionIdRef.current = null;
    setBackendSessionId(null);
}
```

To:

```typescript
// AFTER:
if (isElectron() && backendSessionIdRef.current) {
    try {
        await backend.interruptSession(backendSessionIdRef.current);
    } catch (e) {
        console.error('[interrupt session error]', e);
    }
    // Do NOT clear backendSessionIdRef — process stays alive
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat: change handleStop to interrupt instead of kill"
```

---

### Task 11: Wire resume into handleSend

**Files:**
- Modify: `src/components/SessionWindow.tsx`

- [ ] **Step 1: Pass `claudeSessionId` when creating a new backend session in handleSend**

In `handleSend` (around line 342-348), update the createSession call:

```typescript
if (!backendSessionIdRef.current) {
    const sid = await backend.createSession(session.model, sessionRef.current.claudeSessionId);
    backendSessionIdRef.current = sid;
    setBackendSessionId(sid);
}
```

- [ ] **Step 2: Do the same in the initial response trigger (useEffect)**

In the `triggerInitialResponse` useEffect (around line 267-272), same update:

```typescript
if (!backendSessionIdRef.current) {
    const sid = await backend.createSession(session.model, sessionRef.current.claudeSessionId);
    backendSessionIdRef.current = sid;
    setBackendSessionId(sid);
}
```

- [ ] **Step 3: Add error recovery with auto-resume**

In `handleSend`, wrap the `sendMessage` call (around line 350-358) with retry logic:

```typescript
try {
    await backend.sendMessage(backendSessionIdRef.current, currentInput);
} catch (e) {
    console.warn('[send error, attempting resume]', e);
    backendSessionIdRef.current = null;
    setBackendSessionId(null);
    try {
        const sid = await backend.createSession(session.model, sessionRef.current.claudeSessionId);
        backendSessionIdRef.current = sid;
        setBackendSessionId(sid);
        await backend.sendMessage(sid, currentInput);
    } catch (retryError) {
        setIsStreaming(false);
        setStreamingMessageId(null);
        streamingMessageIdRef.current = null;
        isStreamingRef.current = false;
        console.error('[send retry failed]', retryError);
        // Show error to user via an error block in the assistant message
        const errorMsg = retryError instanceof Error ? retryError.message : 'Unknown error';
        const updated = {
            ...sessionRef.current,
            status: 'review' as const,
            messages: sessionRef.current.messages.map(m =>
                m.id === aiMsgId ? { ...m, blocks: [{ type: 'text' as const, content: `Connection failed: ${errorMsg}. Please try again.` }] } : m
            ),
        };
        sessionRef.current = updated;
        onUpdate(updated);
    }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat: wire claudeSessionId resume into handleSend with error recovery"
```

---

### Task 12: Add session.init event listener

**Files:**
- Modify: `src/components/SessionWindow.tsx`

- [ ] **Step 1: Add session.init listener in the useEffect block**

In the existing `useEffect` that sets up event listeners (around line 134), add the session.init handler. Use a named function for cleanup:

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
backend.onSessionInit(handleSessionInit);
```

- [ ] **Step 2: Add sidecar.restarted listener**

In the same `useEffect`, add:

```typescript
const handleSidecarRestarted = () => {
    backendSessionIdRef.current = null;
    setBackendSessionId(null);
};
backend.onSidecarRestarted(handleSidecarRestarted);
```

- [ ] **Step 3: Add cleanup in useEffect return**

The existing useEffect (line 134) currently has **no cleanup** — this is a pre-existing issue for `onBlockStart`, `onBlockDelta`, etc. For this task, add cleanup for the **new** listeners only. Cleaning up the pre-existing listeners is out of scope.

Add a return function to the useEffect:

```typescript
return () => {
    if (isElectron()) {
        window.aiBackend.off('session.init', handleSessionInit);
        window.aiBackend.off('sidecar.restarted', handleSidecarRestarted);
    }
};
```

**Note:** Store callbacks in named variables (not inline arrows) so `off()` can match them via the internal `__handler` property set by `on()`.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat: add session.init and sidecar.restarted event listeners"
```

---

## Chunk 6: Frontend — App.tsx persistence

### Task 13: Wire `claudeSessionId` through persistence

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Include `claudeSessionId` in ALL save-to-DB mappings**

There are **three** places where `DbSession` objects are constructed in `App.tsx`:

1. **Auto-save effect** (around line 251-281) — debounced save
2. **`handleCreateSession`** (around line 344-358) — initial session creation
3. **`flushSessionSaves`** (around line 179-193) — flush on project switch

Add to each:

```typescript
claude_session_id: session.claudeSessionId || null,
```

- [ ] **Step 2: Include `claudeSessionId` in load-from-DB mapping**

Find the session loading logic (around line 147-160) where `DbSession` objects are converted to `Session` objects. Add:

```typescript
claudeSessionId: s.claude_session_id || undefined,
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: persist claudeSessionId through auto-save and load"
```

---

### Task 14: Manual integration test

- [ ] **Step 1: Verify SIGINT flow (stop button)**

1. Start the app: `npm run dev` (in Electron mode)
2. Create a new session, send a message
3. While AI is responding, click the stop button
4. Verify: response stops, no error in console
5. Send another message in the same session
6. Verify: AI responds normally (process was reused, no new `init` event)

- [ ] **Step 2: Verify resume flow (page reload)**

1. Create a session, send a message, wait for response
2. Check console/devtools for `session.init` event — note the `claude_session_id`
3. Reload the page (or close and reopen)
4. Send a new message in the same session
5. Verify: session resumes via `--resume` (check sidecar stderr for resume log)
6. Verify: AI has context from previous conversation

- [ ] **Step 3: Verify error recovery**

1. While a session is active, kill the sidecar process manually
2. Try sending a message
3. Verify: auto-retry kicks in, session resumes

- [ ] **Step 4: Verify `--resume` + `stream-json` stdout behavior**

Run manually:
```bash
claude -p --output-format stream-json --input-format stream-json --resume <session_id>
```

Observe: Does Claude CLI replay previous conversation through stdout? If yes, the normalizer's replay filtering (edge case 7 in spec) needs implementation. If no, the current implementation is sufficient.

Document findings for future reference.

- [ ] **Step 5: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix: adjustments from integration testing"
```
