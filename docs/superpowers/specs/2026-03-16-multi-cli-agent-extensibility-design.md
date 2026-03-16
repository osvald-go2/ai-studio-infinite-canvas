# Multi-CLI Agent Extensibility Design — Codex Integration

**Date:** 2026-03-16
**Status:** Approved
**Scope:** Support Codex CLI sessions alongside Claude Code, with extensible architecture for future CLI agents

---

## 1. Context & Goals

AI Studio currently integrates exclusively with Claude Code CLI via a Rust sidecar (`ai-backend`). The architecture is tightly coupled: `ClaudeProcess` spawns the Claude CLI, and `process_claude_stream()` normalizes its proprietary JSON output into frontend block events.

**Goals:**
- Support OpenAI Codex CLI sessions with feature parity to Claude (create, send, stream, interrupt, resume)
- Establish a repeatable pattern for adding future CLI agents (Aider, Cursor CLI, etc.)
- Zero modifications to existing Claude Code modules — protect the working integration

**Non-goals (deferred):**
- Codex approval flows (Suggest/Auto Edit modes)
- Codex fork/rollback/compact/archive
- Agent Registry / trait-based plugin system (revisit at ≥4 agents)

---

## 2. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Integration approach | Rust sidecar manages Codex CLI directly | Consistent with Claude; unified stdio JSONL pipe |
| Abstraction strategy | Normalizer-focused, light config for process params | Avoids over-abstraction; each agent's normalizer evolves independently |
| First-phase scope | Basic sessions only (create, send, stream, interrupt, resume) | Validate the abstraction before adding advanced features |
| Event protocol | Unified block events + optional `agent` field | Frontend mostly unchanged; differential UI possible later |
| Code strategy | Pure additive — no changes to `claude/` | Protects stable Claude integration |
| Dispatch mechanism | `match` on model in SessionManager | Simple, sufficient for 2-3 agents |

---

## 3. Architecture

### 3.1 Module Structure

Current (unchanged):
```
ai-backend/src/
  claude/
    mod.rs             # NOT modified
    client.rs          # ClaudeProcess — NOT modified
    types.rs           # ClaudeJson — NOT modified
    stream.rs          # Stream helpers — NOT modified
  normalizer/
    parser.rs          # process_claude_stream() — NOT modified
    blocks.rs          # block event helpers — NOT modified
  session/
    manager.rs         # SessionManager — minimal change (match branch)
    types.rs
```

Added:
```
ai-backend/src/
  codex/
    mod.rs
    client.rs          # CodexProcess
    types.rs           # CodexEvent types
    normalizer.rs      # process_codex_stream()
```

### 3.2 SessionManager Dispatch

The only change to `session/manager.rs` — a match branch in `send()`:

```rust
match session.model.as_str() {
    m if m.starts_with("claude") => {
        // Existing ClaudeProcess logic, untouched
    }
    "codex" => {
        // New: CodexProcess::spawn(working_dir, resume_thread_id?)
    }
    _ => return Err("unsupported model")
}
```

Similar match branches in `interrupt()` and `kill()` where agent-specific behavior differs.

---

## 4. Codex Process Lifecycle

### 4.1 CodexProcess

```rust
// codex/client.rs
pub struct CodexProcess {
    child: Child,
    pid: u32,
}

impl CodexProcess {
    pub fn spawn(
        working_dir: &str,
        prompt: &str,
        resume_thread_id: Option<&str>,
    ) -> Result<(Self, mpsc::UnboundedReceiver<CodexEvent>), String>
    // Spawns: codex exec --json "prompt"
    // Or:     codex exec resume --last "prompt" (if resume_thread_id provided)

    pub fn interrupt(&self) -> Result<(), String>
    // SIGINT — terminates the codex exec process

    pub fn kill(&self) -> Result<(), String>
    // SIGTERM — force kill
}
```

### 4.2 Lifecycle Comparison

```
                Claude                              Codex
─────────────────────────────────────────────────────────────────
Create      session.create → allocate UUID       Same
First send  Spawn long-lived process,            Spawn codex exec --json,
            keep stdin open                      process exits when done
Next send   Reuse same process, write to stdin   Spawn new process +
                                                 resume --last <thread_id>
Interrupt   SIGINT, process survives             SIGINT, process terminates
Resume      --resume <claude_session_id>         resume --last <thread_id>
Persist ID  claude_session_id                    codex_thread_id
```

Key difference: Codex uses **short-lived processes** per turn. SessionManager does not hold a persistent process reference for Codex sessions — instead it stores the `thread_id` for resumption.

### 4.3 ActiveSession Extension

The actual `ActiveSession` struct (in `session/manager.rs`) wraps session metadata inside an `info: Session` field, and uses `Arc<ClaudeProcess>` (no Mutex). The working directory lives on `SessionManager`, not on individual sessions. New fields are added alongside existing ones:

```rust
// session/manager.rs
pub(crate) struct ActiveSession {
    info: Session,                                    // existing — wraps id, model, etc.
    claude_process: Option<Arc<ClaudeProcess>>,        // existing — untouched
    claude_session_id: Option<String>,                 // existing — untouched

    // New fields for multi-agent support
    agent_type: AgentType,
    codex_process: Option<Arc<CodexProcess>>,           // transient — set during active turn only
    codex_thread_id: Option<String>,
}

pub enum AgentType {
    Claude,
    Codex,
}
```

**Important:** `codex_process` is transient. Since Codex uses short-lived processes per turn, the normalizer's completion callback must clear `codex_process` to `None` after each turn's process exits. `interrupt()` must check that `codex_process.is_some()` before sending SIGINT to avoid hitting a stale PID.

---

## 5. Codex Normalizer — Event Mapping

`codex/normalizer.rs` exports `process_codex_stream()` which reads Codex JSONL events and emits unified block protocol events.

### 5.1 Mapping Table

| Codex JSONL Event | Frontend Protocol Event | Block Type |
|---|---|---|
| `thread.started { thread_id }` | `session.init { session_id, codex_thread_id, agent: "codex" }` | — |
| `turn.started` | (internal state, no event) | — |
| `item.started { type: "agent_message" }` | `block.start { type: "text", agent: "codex" }` | text |
| `item/agentMessage/delta { text }` | `block.delta { content: text }` | — |
| `item.completed { type: "agent_message" }` | `block.stop { status: "done" }` | — |
| `item.started { type: "command_execution", command }` | `block.start { type: "tool_call", tool: "Bash", args: command, agent: "codex" }` | tool_call |
| `item/commandExecution/outputDelta` | `block.delta { content: output }` | — |
| `item.completed { type: "command_execution" }` | `block.stop { status: done/error }` | — |
| `item.started { type: "file_change" }` | `block.start { type: "tool_call", tool: "Edit", agent: "codex" }` | tool_call |
| `item.completed { type: "file_change" }` | `block.stop { status: "done" }` | — |
| `item.started { type: "reasoning" }` | Silently dropped (same as Claude's thinking blocks) | — |
| `item.started { type: "mcp_tool_call" }` | `block.start { type: "tool_call", tool: <mcp_name> }` | tool_call |
| `turn.completed { usage }` | `message.complete { usage, agent: "codex" }` | — |
| Codex process exits non-zero / stderr error | `message.error { error, agent: "codex" }` | — |
| `item.completed { status: "failed" }` | `block.stop { status: "error", error }` | — |

### 5.2 Error Handling

Codex errors map to the existing `message.error` event:
- **Process exit non-zero:** Emit `message.error` with stderr content
- **Item failure:** `item.completed` with failed status → `block.stop { status: "error" }`
- **Unexpected termination:** Detect process exit during active turn → `message.error`

### 5.3 Protocol Extension

All block events gain an optional `agent` field:

```json
{
  "event": "block.start",
  "data": {
    "session_id": "...",
    "block_id": "...",
    "type": "text",
    "agent": "codex"
  }
}
```

- Claude normalizer is NOT modified — it simply doesn't emit the field
- Frontend treats absent `agent` as `"claude"` (backward compatible)

### 5.4 Unknown Event Handling

Any unrecognized Codex event type is logged at `warn` level and silently dropped. This prevents unknown future Codex events from breaking the pipeline.

---

## 6. Frontend Changes

### 6.1 Type Extensions (`types.ts`)

```typescript
interface Session {
  // Existing fields — unchanged
  id: string;
  claudeSessionId?: string;
  title: string;
  model: string;
  status: SessionStatus;
  position: { x: number; y: number };
  messages: Message[];
  // ...

  // New fields
  codexThreadId?: string;
}
```

**Note on `agent` derivation:** The agent type is derived from the `model` field at point of use — no separate `agent` field on `Session`. Convention: `model.startsWith('claude')` → Claude, `model === 'codex'` → Codex. This covers both `"claude-code"` (from NewSessionModal) and `"claude-sonnet-4-20250514"` (from router defaults). A helper function `getAgentType(model: string): 'claude' | 'codex'` can be added to avoid repetition.

```typescript
// Helper (in types.ts or utils)
function getAgentType(model: string): 'claude' | 'codex' {
  if (model.startsWith('claude')) return 'claude';
  if (model === 'codex') return 'codex';
  return 'claude'; // fallback
}

interface DbSession {
  // Existing fields — unchanged
  claude_session_id: string | null;
  // ...

  // New fields
  codex_thread_id: string | null;
  // No `agent` column — derived from `model` at query time
}
```

### 6.2 Backend Service (`backend.ts`)

The existing `createSession(model: string, claudeSessionId?: string)` changes to an opts-based signature. This is a **breaking change** to existing callers — all call sites in `SessionWindow.tsx` that currently pass `claudeSessionId` as a positional arg must wrap it in the opts object. This is the one place where the Claude code path sees a minor syntactic change (not behavioral).

```typescript
// Before: createSession(model, claudeSessionId?)
// After:
createSession(
  model: string,
  opts?: {
    claudeSessionId?: string;
    codexThreadId?: string;
  }
): Promise<string>
```

The `onSessionInit` callback type also extends:

```typescript
onSessionInit(callback: (data: {
  session_id: string;
  claude_session_id?: string;
  codex_thread_id?: string;
  agent?: 'claude' | 'codex';
}) => void)
```

### 6.3 SessionWindow.tsx

Two localized changes:

**1. Session creation — pass agent-specific IDs:**
```typescript
const opts = session.model.startsWith('claude')
  ? { claudeSessionId: session.claudeSessionId }
  : session.model === 'codex'
  ? { codexThreadId: session.codexThreadId }
  : {};

const backendSessionId = await backend.createSession(session.model, opts);
```

**2. session.init handler — store agent-specific IDs:**
```typescript
backend.onSessionInit(({ session_id, claude_session_id, codex_thread_id, agent }) => {
  if (session_id !== backendSessionId) return;

  if (agent === 'codex') {
    onUpdate({ ...session, codexThreadId: codex_thread_id, agent: 'codex' });
  } else {
    onUpdate({ ...session, claudeSessionId: claude_session_id });
  }
});
```

**Everything else unchanged** — block.start/delta/stop/message.complete handlers work identically for both agents.

### 6.4 Components NOT Modified

- TopBar, BoardView, CanvasView, TabView — render Session objects agnostically
- NewSessionModal — already has Codex model option and icon
- CodeBlock, TextBlock, ToolCallBlock — render unified block types
- Git panel — completely independent
- All message rendering components — block protocol is unified

### 6.5 Router Changes (`router.rs`)

`session.create` params gains optional `codex_thread_id` field. All other routes unchanged.

---

## 7. Database Schema

Add one column to the sessions table via a new migration version (`migrate_v3` or next available version in `ai-backend/src/db/migrations.rs`):

```sql
ALTER TABLE sessions ADD COLUMN codex_thread_id TEXT;
```

No `agent` column needed — agent type is derived from the existing `model` column.

**Rust-side changes required in `ai-backend/src/db/`:**
- `types.rs`: Add `codex_thread_id: Option<String>` to `DbSession` struct
- `sessions.rs`: Update all SQL queries that touch the sessions table:
  - `create()` — add `codex_thread_id` to INSERT
  - `get_by_id()` — add to SELECT column list
  - `list_by_project()` — add to SELECT column list
  - `update()` — add to UPDATE SET clause
- `migrations.rs`: Add `migrate_v3()` (or next version) with the ALTER TABLE statement

---

## 8. Extensibility — Future CLI Agent Checklist

When adding agent N+1 (e.g., Aider), follow this checklist:

### Backend (Rust)
1. Create `ai-backend/src/<agent>/` with `client.rs`, `types.rs`, `normalizer.rs`
2. Add match branch in `session/manager.rs` send/interrupt/kill
3. Add `<Agent>` variant to `AgentType` enum
4. Add optional `<agent>_session_id` to `ActiveSession`
5. Add `<agent>_session_id` column to sessions table

### Frontend (TypeScript)
6. Add `<agent>SessionId?` and agent union value to `Session` type
7. Add `<agent>_session_id` to `DbSession` type
8. Extend `createSession()` opts
9. Add branch in SessionWindow session.init handler
10. Add model option + icon in NewSessionModal

### Refactoring Signal — Hard Commitment
Upgrade from match dispatch to `AgentDriver` trait + `AgentRegistry` when:
- Agent count ≥ 4 — this is a **hard trigger**, not a suggestion
- OR match branches contain significant duplicated logic (>50% shared code)

---

## 9. Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Codex exec --json format changes | Version-pin codex CLI; normalizer logs unknown events as warnings |
| Short-lived process model causes latency | Codex startup is fast (~100ms); acceptable for first phase |
| resume --last fails across app restarts | Store thread_id in SQLite; codex persists threads locally as JSONL |
| Claude integration regression | Zero modifications to claude/ modules; integration tests for Claude path |
| Session type grows with each agent | Acceptable for 2-3 agents; refactor to composition at ≥4 |
