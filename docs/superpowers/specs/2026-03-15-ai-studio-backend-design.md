# AI Studio Backend Design

## Overview

将 AI Studio Infinite Canvas 从纯前端 SPA 改造为 Electron 桌面应用，新增 Rust sidecar 后端处理 Claude AI 会话管理和消息流式传输。

## Decisions

| 决定 | 选择 | 原因 |
|------|------|------|
| 应用框架 | Electron + electron-vite | 与现有 Vite 6 构建链无缝集成 |
| 后端语言 | Rust (sidecar 进程) | 参考 MuMu 架构，进程隔离，性能好 |
| 通信协议 | NDJSON over stdin/stdout | 简单可调试，与 MuMu stream-json 模式一致 |
| AI 模型 | Claude only (第一版) | 聚焦核心 |
| 功能范围 | 最小可用 + 全部 7 种消息类型 | 会话管理 + 流式传输，支持 text/code/tool_call/todolist/subagent/askuser/skill |

## Architecture

```
┌─────────────────────────────────────────────┐
│                 Electron App                 │
│                                              │
│  ┌──────────┐    IPC     ┌───────────────┐  │
│  │ Renderer │ ◄────────► │ Main Process  │  │
│  │ (React)  │            │ (Node.js)     │  │
│  └──────────┘            └───────┬───────┘  │
│                                  │           │
│                          stdin/stdout NDJSON │
│                                  │           │
│                          ┌───────▼───────┐  │
│                          │ Rust Sidecar  │  │
│                          │ (ai-backend)  │  │
│                          └───────┬───────┘  │
│                                  │           │
│                            HTTPS │           │
│                                  ▼           │
│                          Claude API          │
└─────────────────────────────────────────────┘
```

## Directory Structure

```
ai-studio-infinite-canvas/
├── src/                        # React frontend (existing)
├── electron/
│   ├── main.ts                 # Electron main process
│   ├── preload.ts              # contextBridge, expose window.aiBackend
│   └── sidecar.ts              # Rust sidecar lifecycle management
├── ai-backend/                 # Rust sidecar (new)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs             # Entry: tokio runtime, stdin/stdout loop
│       ├── protocol.rs         # NDJSON message types (Request/Response/Event)
│       ├── router.rs           # Method dispatch
│       ├── session/
│       │   ├── mod.rs
│       │   ├── manager.rs      # SessionManager: HashMap<String, Session>
│       │   └── types.rs        # Session, SessionStatus
│       ├── claude/
│       │   ├── mod.rs
│       │   ├── client.rs       # reqwest HTTP client for Claude API
│       │   ├── stream.rs       # SSE response parser
│       │   └── types.rs        # Claude API request/response types
│       └── normalizer/
│           ├── mod.rs
│           ├── blocks.rs       # 7 ContentBlock types + serialization
│           ├── parser.rs       # Claude raw output → ContentBlock conversion
│           └── markdown.rs     # Markdown code block splitting
├── electron-builder.yml        # Packaging config
├── electron.vite.config.ts     # electron-vite config
└── package.json                # Updated with electron dependencies
```

## NDJSON Protocol

### Request (Main → Rust)

```json
{"id": "req_1", "method": "session.create", "params": {"model": "claude-sonnet-4-20250514"}}
```

### Response (Rust → Main)

```json
{"id": "req_1", "result": {"session_id": "abc123"}}
```

### Error (Rust → Main)

```json
{"id": "req_1", "error": {"code": 1001, "message": "session not found"}}
```

### Streaming Event (Rust → Main, no id)

```json
{"event": "block.start", "data": {"session_id": "abc123", "block_index": 0, "block": {"type": "text", "content": ""}}}
{"event": "block.delta", "data": {"session_id": "abc123", "block_index": 0, "delta": {"content": "hello"}}}
{"event": "block.stop", "data": {"session_id": "abc123", "block_index": 0}}
{"event": "message.complete", "data": {"session_id": "abc123"}}
```

### Methods (v1)

| Method | Params | Response | Description |
|--------|--------|----------|-------------|
| `session.create` | `{model, max_tokens?, history?}` | `{session_id}` | Create new session. Frontend constructs the full `Session` object locally (default position, empty messages, etc.) using only the returned `session_id`. `max_tokens` defaults to `4096` if omitted. `history` is an optional `Message[]` array to pre-populate conversation context (used for crash recovery). |
| `session.send` | `{session_id, text}` | `{ok: true}` | Send user message. Response is returned **immediately** upon accepting the request, before Claude API streaming begins. Streaming content arrives via subsequent `block.*` events. Rust sidecar maintains the full conversation history internally (see Session State Ownership below). |
| `session.list` | - | `{sessions: SessionSummary[]}` | List all active sessions. Each `SessionSummary`: `{id: string, model: string, message_count: number, created_at: string}`. Does not include full messages (frontend holds its own full Session state). |
| `session.kill` | `{session_id}` | `{ok: true}` | Kill session |
| `config.set_api_key` | `{api_key}` | `{ok: true}` | Set or update the Anthropic API key at runtime. Allows key changes without restarting the sidecar. |
| `ping` | - | `{pong: true}` | Health check |

### Events (v1)

| Event | Data | Description |
|-------|------|-------------|
| `block.start` | `{session_id, block_index, block: ContentBlock}` | A new content block started. Contains the initial block shape (e.g., `{type: "text", content: ""}` or `{type: "tool_call", tool: "...", args: "", status: "running"}`). |
| `block.delta` | `{session_id, block_index, delta}` | Incremental update to the current block. For text/code: `{content: "new chars"}` (append-only). For tool_call: `{args: "json fragment"}` (append to args). |
| `block.stop` | `{session_id, block_index}` | Current block is complete. |
| `message.complete` | `{session_id, usage?: {input_tokens, output_tokens}}` | Entire message finished. |
| `message.error` | `{session_id, error: {code, message}}` | Streaming error. |

Note: Session status (`inbox` / `inprocess` / `review` / `done`) is managed entirely by the frontend. The Rust sidecar does not track or emit status events — these states are UI-level concerns (e.g., user manually moves a session to "review").

### Session State Ownership

The Rust sidecar is the **source of truth** for conversation history. Each `Session` in the `SessionManager` maintains a `Vec<Message>` that accumulates the conversation:

- `session.create` → initializes an empty message list
- `session.send` → appends the user message to history, sends the full `messages` array to Claude API, then appends the assistant response as it streams
- The frontend also keeps `Session.messages` for rendering, but these are populated from `block.*` events. On sidecar crash, the frontend's copy serves as the last-known state (see Crash Recovery).

### Streaming Semantics

All `block.delta` events carry **incremental, append-only** content:

- **text block**: `delta.content` contains only the new characters to append (not the full accumulated text)
- **code block**: `delta.content` contains new code characters to append
- **tool_call block**: `delta.args` contains new JSON fragment to append to args string
- **Other block types** (todolist, subagent, askuser, skill): sent as a single `block.start` with the complete block data, no subsequent deltas (these are derived from tool_use inputs which arrive as a complete JSON object after streaming)

## Content Block Types

The normalizer converts Claude API raw output into 7 frontend ContentBlock types.

### ContentBlock Schema

Each variant matches the frontend `ContentBlock` discriminated union in `src/types.ts`:

```typescript
// 1. Text
{ type: "text", content: string }

// 2. Code (extracted from markdown code fences in text)
{ type: "code", code: string, language: string }

// 3. Tool call
{ type: "tool_call", tool: string, args: string, description?: string, duration?: number, status: "running" | "done" | "error" }

// 4. Todo list (from TodoWrite/TaskCreate tool_use)
{ type: "todolist", items: [{ id: string, label: string, status: "pending" | "in_progress" | "done" }] }

// 5. Subagent (from Agent tool_use)
{ type: "subagent", agentId: string, task: string, status: "launched" | "working" | "done" | "error", summary?: string, blocks?: ContentBlock[] }

// 6. Ask user (from AskUserQuestion tool_use)
{ type: "askuser", questions: [{ id: string, question: string, options?: string[], response?: string }], submitted?: boolean }

// 7. Skill (from Skill tool_use)
{ type: "skill", skill: string, args?: string, status: "invoking" | "done", duration?: number }
```

### Identification Rules

| Type | Source | Identification Rule |
|------|--------|-------------------|
| `text` | Claude text content | Plain text output (outside code fences) |
| `code` | Claude text content | Markdown code blocks (``` wrapped), split into separate blocks |
| `tool_call` | Claude `tool_use` content block | `content_block_start` with type=tool_use (generic, not matching special tools below) |
| `todolist` | tool_use calling TodoWrite/TaskCreate | Match tool name, parse `items` from input JSON |
| `subagent` | tool_use calling Agent | Match tool name, extract `agentId`, `task`, `status` from input |
| `askuser` | tool_use calling AskUserQuestion | Match tool name, extract `questions` from input |
| `skill` | tool_use calling Skill | Match tool name, extract `skill`, `args` from input |

### Normalizer Pipeline

```
Claude SSE stream → stream.rs (raw events)
                  → normalizer/parser.rs (identify block type)
                  → normalizer/markdown.rs (split code blocks from text)
                  → normalizer/blocks.rs (serialize to ContentBlock)
                  → protocol event → stdout
```

## Rust Sidecar Internals

### main.rs
- Start tokio async runtime
- Read stdin line by line, parse JSON, dispatch to router
- Hold `mpsc::Sender<String>` for writing responses/events to stdout

### router.rs
- Match method string to handler function
- Return `Result<serde_json::Value, ProtocolError>`

### SessionManager
- `HashMap<String, Session>` for active sessions
- Each `Session` holds: `id`, `model`, `max_tokens`, `messages: Vec<Message>` (full conversation history), `active_task: Option<JoinHandle>`
- `create()` → generate UUID, initialize empty messages vec, insert into map
- `send()` → append user message to `session.messages`, call Claude API with full `messages` array and `stream: true`, spawn tokio task to read SSE and push events via mpsc, append assistant message to history on completion
- `kill()` → abort task handle, remove session
- `set_api_key()` → update stored API key for subsequent requests

### Claude Client
- `reqwest` with `stream` feature
- POST to `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`
- Body: `{model, messages, max_tokens, stream: true}`
- Returns `impl Stream<Item = Bytes>`

### Claude Stream Parser
- Parse SSE format: `event:` and `data:` lines
- Handle event types: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`
- Convert to protocol events via normalizer

### Dependencies (Cargo.toml)

```toml
[package]
name = "ai-backend"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["stream"] }
uuid = { version = "1", features = ["v4"] }
```

## Electron Integration

### electron/main.ts
- Create BrowserWindow, load React frontend
- Spawn Rust sidecar on app ready
- Register IPC handlers bridging renderer ↔ sidecar

### electron/preload.ts
- `contextBridge.exposeInMainWorld('aiBackend', { invoke, on, off })`
- `invoke(method, params)` → returns Promise (resolved when response with matching id arrives)
- `on(event, callback)` → register event listener
- `off(event, callback)` → unregister

### electron/sidecar.ts
- `spawn()` → start Rust binary, manage stdin/stdout streams
- `send(msg)` → JSON serialize + write to stdin + newline
- stdout line reader → parse JSON → distinguish response (has id) vs event (has event)
- Response → resolve matching Promise
- Event → broadcast to all renderers via IPC
- `kill()` → cleanup on process exit

### Frontend Changes (minimal)
- New `src/services/backend.ts`: wraps `window.aiBackend` calls
- `SessionWindow.tsx`: replace mock responses with `backend.sendMessage()`
- All other components unchanged

## Data Flow

Complete flow for a user sending a message:

```
1.  User types message → SessionWindow.tsx
2.  → backend.sendMessage(sessionId, text)
3.  → preload IPC → main process
4.  → sidecar.send({id, method: "session.send", params})
5.  → stdin → Rust main.rs → router → SessionManager
6.  → Claude API POST (stream: true)
7.  ← SSE chunks from Claude
8.  ← normalizer converts to ContentBlock
9.  ← stdout NDJSON: {event: "block.start/delta/stop", data: {session_id, block_index, ...}}
10. ← sidecar.ts parses → IPC broadcast to renderer
11. ← preload → renderer callback
12. ← SessionWindow updates messages state → UI renders
```

## API Key Management

- User enters `ANTHROPIC_API_KEY` in frontend settings
- Stored via Electron `electron-store` (persisted to disk, encrypted at rest)
- On app start: if a stored key exists, main process passes it as env var when spawning sidecar
- If no key is stored at startup: sidecar starts without a key. Any `session.send` will fail with `message.error` (code 401) prompting the user to enter a key
- When user sets/updates the key: frontend calls `config.set_api_key` via the protocol. Rust sidecar updates its in-memory key immediately (no restart needed). Main process also persists the key to `electron-store` for next launch
- Rust reads the key from: env var at startup OR `config.set_api_key` at runtime (runtime value takes precedence)

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Claude API 401 | `message.error` event (code 401) → frontend prompts invalid key |
| Network disconnected | `message.error` event (code 503) → frontend prompts retry |
| No API key configured | `message.error` event (code 401) → frontend prompts to enter key |
| Rust sidecar crash | See Crash Recovery below |

## Crash Recovery

When the Rust sidecar crashes:

1. **Detection**: Main process (`sidecar.ts`) detects the child process exit via the `close` event
2. **Auto-restart**: Main process spawns a new sidecar instance (with the stored API key re-injected)
3. **Frontend notification**: Main process emits a `sidecar.restarted` event to the renderer
4. **State reconciliation**: The frontend treats this as a soft reset — all sessions remain in the frontend's state (with their full message history), but their backend counterparts no longer exist. The frontend does NOT auto-re-create sessions on the backend. When the user next sends a message in a session, the frontend calls `session.create` with the optional `history` param (containing all prior messages from the frontend's state), which pre-populates the Rust sidecar's conversation context. Then the frontend calls `session.send` with the new user message as normal
5. **User impact**: Minimal — the user sees a transient "reconnecting" indicator, then can continue conversations

## Out of Scope (v1)

- SQLite persistence (sessions/messages are in-memory only)
- Git integration
- Terminal emulation
- File watching
- Multi-window management
- Codex / Gemini support
- Tool execution (tool_call blocks are displayed but not executed)
