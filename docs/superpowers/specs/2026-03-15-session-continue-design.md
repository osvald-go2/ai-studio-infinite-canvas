# Session Continue (Resume) Design Spec

## Overview

Implement session continuation for AI Studio Infinite Canvas, leveraging Claude CLI's native session management (`--resume` flag). Two mechanisms cover all interruption scenarios:

1. **SIGINT (stop button)** — Interrupt current generation without killing the process. Session continues in-place.
2. **Resume (page close / process death)** — Capture Claude CLI's `session_id`, persist to DB, and use `--resume <id>` to restore the session on next launch.

This aligns with Claude Code's behavior: ESC interrupts (SIGINT), Ctrl+C kills then resumes via `--resume`.

**Scope:** Electron mode only. Mock/browser dev mode unchanged.

---

## Architecture

### Current Flow

```
User sends message
  → SessionWindow.handleSend()
  → backend.createSession(model)           # spawns claude CLI process
  → backend.sendMessage(sessionId, text)   # writes to stdin
  → Claude CLI streams response via stdout
  → normalizer parses events → frontend renders blocks

User clicks stop
  → backend.killSession(sessionId)         # kills process
  → backendSessionIdRef = null             # connection lost
  → next send → createSession(model)       # new session, no history
```

### Proposed Flow

```
User sends message (no active process, has claudeSessionId)
  → backend.createSession(model, claudeSessionId)
  → spawns: claude -p --resume <claudeSessionId> ...
  → Claude CLI restores conversation from .jsonl file
  → backend.sendMessage(sessionId, text)
  → streams response as normal

User clicks stop
  → backend.interruptSession(sessionId)    # SIGINT, process stays alive
  → backendSessionIdRef preserved
  → next send → sendMessage() directly     # reuse existing process

Page closes / sidecar restarts
  → process dies, backendSessionIdRef stale
  → next send → sendMessage() fails
  → catch: clear backendSessionIdRef
  → retry: createSession(model, claudeSessionId) → --resume
```

---

## Backend Changes (Rust)

### 1. `claude/client.rs` — ClaudeProcess

**`spawn()` signature change:**

```rust
pub fn spawn(
    working_dir: &str,
    resume_session_id: Option<&str>,
) -> Result<(Self, mpsc::UnboundedReceiver<ClaudeJson>), String>
```

- When `resume_session_id` is `Some(id)`, append `--resume <id>` to CLI args.

**New `interrupt()` method:**

```rust
pub fn interrupt(&self) -> Result<(), String> {
    let pid = self.child.id()
        .ok_or_else(|| "process already exited".to_string())?;
    unsafe {
        libc::kill(pid as i32, libc::SIGINT);
    }
    Ok(())
}
```

Sends SIGINT to the Claude CLI process, interrupting current generation without terminating the process.

### 2. `session/manager.rs` — ActiveSession & SessionManager

**`ActiveSession` changes:**

```rust
pub(crate) struct ActiveSession {
    info: Session,
    claude_process: Option<Arc<ClaudeProcess>>,
    claude_session_id: Option<String>,  // NEW: Claude CLI's native session ID
}
```

**`SessionManager::create()` changes:**

```rust
pub fn create(
    &mut self,
    model: String,
    max_tokens: u32,
    _history: Option<serde_json::Value>,
    claude_session_id: Option<String>,  // NEW: for resume
) -> String
```

Store `claude_session_id` in the new `ActiveSession`.

**`SessionManager::send()` changes:**

When spawning a new `ClaudeProcess`, pass `claude_session_id` to `spawn()`:

```rust
let resume_id = active.claude_session_id.as_deref();
let (process, msg_rx) = ClaudeProcess::spawn(&working_dir, resume_id)?;
```

**New `SessionManager::interrupt()` method:**

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

### 3. `normalizer/parser.rs` — Capture and forward session_id

In `process_claude_stream`, when handling `ClaudeJson::System { subtype: "init", session_id, .. }`:

```rust
ClaudeJson::System { subtype, session_id, model, tools, .. } => {
    if subtype == "init" {
        // Forward Claude's session_id to frontend
        if let Some(ref csid) = session_id {
            let _ = event_tx.send(Event::new("session.init", json!({
                "session_id": session_id_param,  // our internal session ID
                "claude_session_id": csid,
            })));
        }
        // ... existing block.start/block.stop logic ...
    }
}
```

Additionally, update the `ActiveSession.claude_session_id` in the session manager. This requires passing a reference to the sessions map into the normalizer, or returning the captured ID via a channel.

**Recommended approach:** Have the normalizer emit the `session.init` event. The router (which has access to the session manager) listens for this event and updates `ActiveSession.claude_session_id`.

### 4. `router.rs` — New RPC method and event handling

**New `session.interrupt` method:**

```rust
"session.interrupt" => {
    let session_id = params["session_id"].as_str().unwrap();
    manager.interrupt(session_id)?;
    // Return success
}
```

**Modified `session.create`:**

Accept optional `claude_session_id` parameter:

```rust
"session.create" => {
    let model = params["model"].as_str().unwrap();
    let claude_session_id = params["claude_session_id"].as_str().map(String::from);
    let id = manager.create(model, max_tokens, history, claude_session_id);
    // Return id
}
```

**`session.init` event handling:**

When the normalizer emits `session.init` with `claude_session_id`, update the `ActiveSession`:

```rust
// In the event processing loop or via a callback
if event_type == "session.init" {
    if let Some(csid) = data["claude_session_id"].as_str() {
        let mut sessions = manager.sessions.lock().unwrap();
        if let Some(active) = sessions.get_mut(internal_session_id) {
            active.claude_session_id = Some(csid.to_string());
        }
    }
    // Forward event to frontend
}
```

### 5. Database — Schema change

Add column to `sessions` table:

```sql
ALTER TABLE sessions ADD COLUMN claude_session_id TEXT DEFAULT NULL;
```

Handle in the DB migration logic. `DbSession` struct adds:

```rust
pub claude_session_id: Option<String>,
```

---

## Frontend Changes (TypeScript)

### 1. `types.ts` — Session type

```typescript
interface Session {
    // ... existing fields ...
    claudeSessionId?: string;  // Claude CLI's native session ID for resume
}

interface DbSession {
    // ... existing fields ...
    claude_session_id: string | null;
}
```

### 2. `services/backend.ts` — New/modified methods

```typescript
async createSession(model: string, claudeSessionId?: string): Promise<string> {
    const result = await window.aiBackend.invoke('session.create', {
        model,
        claude_session_id: claudeSessionId,
    });
    return result.session_id;
},

async interruptSession(sessionId: string): Promise<void> {
    await window.aiBackend.invoke('session.interrupt', {
        session_id: sessionId,
    });
},

onSessionInit(callback: (data: { session_id: string; claude_session_id: string }) => void): void {
    window.aiBackend.on('session.init', callback);
},
```

Remove `history` parameter from `createSession` — no longer needed since `--resume` handles history replay.

### 3. `SessionWindow.tsx` — handleStop

**Before:**
```typescript
if (isElectron() && backendSessionIdRef.current) {
    await backend.killSession(backendSessionIdRef.current);
    backendSessionIdRef.current = null;
    setBackendSessionId(null);
}
```

**After:**
```typescript
if (isElectron() && backendSessionIdRef.current) {
    await backend.interruptSession(backendSessionIdRef.current);
    // Do NOT clear backendSessionIdRef — process stays alive
}
```

### 4. `SessionWindow.tsx` — handleSend (resume path)

**Before:**
```typescript
if (!backendSessionIdRef.current) {
    const sid = await backend.createSession(session.model);
    backendSessionIdRef.current = sid;
    setBackendSessionId(sid);
}
```

**After:**
```typescript
if (!backendSessionIdRef.current) {
    const sid = await backend.createSession(session.model, session.claudeSessionId);
    backendSessionIdRef.current = sid;
    setBackendSessionId(sid);
}
```

When `claudeSessionId` is present, backend spawns with `--resume`, restoring full conversation context.

### 5. `SessionWindow.tsx` — session.init event listener

Add to the existing `useEffect` block:

```typescript
backend.onSessionInit((data) => {
    if (data.session_id === backendSessionIdRef.current) {
        const updated = {
            ...sessionRef.current,
            claudeSessionId: data.claude_session_id,
        };
        sessionRef.current = updated;
        onUpdate(updated);
    }
});
```

### 6. `SessionWindow.tsx` — sendMessage error recovery

```typescript
try {
    await backend.sendMessage(backendSessionIdRef.current, currentInput);
} catch (e) {
    // Process might be dead — try resume
    backendSessionIdRef.current = null;
    setBackendSessionId(null);
    try {
        const sid = await backend.createSession(session.model, session.claudeSessionId);
        backendSessionIdRef.current = sid;
        setBackendSessionId(sid);
        await backend.sendMessage(sid, currentInput);
    } catch (retryError) {
        setIsStreaming(false);
        console.error('[send retry failed]', retryError);
    }
}
```

### 7. `App.tsx` — Persistence

**Save:** In the debounced auto-save, include `claudeSessionId` → `claude_session_id` mapping in `DbSession`.

**Load:** When loading sessions from DB, map `claude_session_id` back to `claudeSessionId` on the `Session` object.

### 8. `App.tsx` — sidecar.restarted handling

When sidecar restarts, all Claude CLI processes are dead. Clear all `backendSessionIdRef` values. Next `handleSend` will trigger resume path automatically.

---

## Behavior Matrix

| Scenario | Mechanism | Token Cost | User Experience |
|---|---|---|---|
| Stop button | SIGINT | Zero extra | Instant stop, next send reuses process |
| Page close + reopen | `--resume` | Resume replay cost | Transparent, session continues |
| Network/sidecar crash | `--resume` (auto-retry) | Resume replay cost | Brief error, auto-recovers |
| Session deleted | `killSession()` (existing) | N/A | Session gone permanently |

---

## Edge Cases

1. **SIGINT during tool execution:** Claude CLI handles this like Claude Code ESC — tool may return partial result, Claude will see the interruption in its context. Acceptable per user confirmation.

2. **Multiple rapid stops:** SIGINT is idempotent. Sending multiple SIGINTs is safe.

3. **Resume after long time:** Claude CLI `.jsonl` files persist indefinitely. Resume works regardless of elapsed time (until files are manually cleaned).

4. **claudeSessionId is null (new session):** Falls back to current behavior — fresh session, no resume.

5. **Resume fails (`.jsonl` deleted):** Claude CLI will start a fresh session. The `session.init` event will return a new `claude_session_id`, which replaces the stale one.

---

## Files to Modify

### Backend (Rust)
- `ai-backend/src/claude/client.rs` — interrupt(), spawn() resume param
- `ai-backend/src/session/manager.rs` — claude_session_id storage, interrupt()
- `ai-backend/src/normalizer/parser.rs` — emit session.init event
- `ai-backend/src/router.rs` — session.interrupt RPC, session.create param
- `ai-backend/src/db/` — schema migration, DbSession field

### Frontend (TypeScript)
- `src/types.ts` — Session.claudeSessionId, DbSession.claude_session_id
- `src/services/backend.ts` — createSession, interruptSession, onSessionInit
- `src/components/SessionWindow.tsx` — handleStop, handleSend, event listener, error recovery
- `src/App.tsx` — persistence mapping, sidecar.restarted handling

### Infrastructure
- `electron/preload.ts` — may need to expose session.init event (check if generic event forwarding covers it)
