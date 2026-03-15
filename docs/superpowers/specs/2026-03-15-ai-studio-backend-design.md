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
{"event": "message.delta", "data": {"session_id": "abc123", "delta": {"type": "text", "content": "hello"}}}
{"event": "message.complete", "data": {"session_id": "abc123"}}
```

### Methods (v1)

| Method | Params | Response | Description |
|--------|--------|----------|-------------|
| `session.create` | `{model}` | `{session_id}` | Create new session |
| `session.send` | `{session_id, text}` | `{ok: true}` | Send user message, triggers streaming events |
| `session.list` | - | `{sessions: [...]}` | List all active sessions |
| `session.kill` | `{session_id}` | `{ok: true}` | Kill session |
| `ping` | - | `{pong: true}` | Health check |

### Events (v1)

| Event | Data | Description |
|-------|------|-------------|
| `message.delta` | `{session_id, delta: ContentBlock}` | Incremental content block |
| `message.complete` | `{session_id}` | Message finished |
| `message.error` | `{session_id, error}` | Streaming error |
| `session.status` | `{session_id, status}` | Session status change |

## Content Block Types

The normalizer converts Claude API raw output into 7 frontend ContentBlock types:

| Type | Source | Identification Rule |
|------|--------|-------------------|
| `text` | Claude text content | Plain text output |
| `code` | Claude text content | Markdown code blocks (``` wrapped), split into separate blocks |
| `tool_call` | Claude `tool_use` content block | `content_block_start` with type=tool_use |
| `todolist` | tool_use calling TodoWrite/TaskCreate | Parse tool name + extract items from input |
| `subagent` | tool_use calling Agent | Extract agentId, task, status from input |
| `askuser` | tool_use calling AskUserQuestion | Extract questions from input |
| `skill` | tool_use calling Skill | Extract skill name + status from input |

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
- `create()` → generate UUID, insert into map
- `send()` → call Claude API with streaming, spawn tokio task to read SSE, push events via mpsc
- `kill()` → abort task handle, remove session

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
9.  ← stdout NDJSON: {event: "message.delta", data: {session_id, delta}}
10. ← sidecar.ts parses → IPC broadcast to renderer
11. ← preload → renderer callback
12. ← SessionWindow updates messages state → UI renders
```

## API Key Management

- User enters `ANTHROPIC_API_KEY` in frontend settings
- Stored via Electron `electron-store` or system keychain
- Main process injects as environment variable when spawning sidecar
- Rust reads via `std::env::var("ANTHROPIC_API_KEY")`

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Claude API 401 | `message.error` event → frontend prompts invalid key |
| Network disconnected | `message.error` event → frontend prompts retry |
| Rust sidecar crash | Main process detects exit → auto-restart + notify frontend |

## Out of Scope (v1)

- SQLite persistence (sessions/messages are in-memory only)
- Git integration
- Terminal emulation
- File watching
- Multi-window management
- Codex / Gemini support
- Tool execution (tool_call blocks are displayed but not executed)
