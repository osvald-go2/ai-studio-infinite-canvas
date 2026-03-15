# AI Studio Backend Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the AI Studio Infinite Canvas from a pure frontend SPA into an Electron desktop app with a Rust sidecar backend that streams Claude API responses.

**Architecture:** Electron main process spawns a Rust binary (ai-backend) as a child process, communicating via NDJSON over stdin/stdout. The React frontend (renderer) talks to the main process via IPC, which bridges to the Rust sidecar. The Rust sidecar handles session management and Claude API streaming.

**Tech Stack:** Electron 35 + electron-vite + React 19 + Vite 6 + Tailwind CSS 4 (frontend), Rust + tokio + reqwest + serde (backend)

**Spec:** `docs/superpowers/specs/2026-03-15-ai-studio-backend-design.md`

---

## Chunk 1: Rust Project Scaffolding + Protocol Layer

### Task 1: Initialize Rust Project

**Files:**
- Create: `ai-backend/Cargo.toml`
- Create: `ai-backend/src/main.rs`

- [ ] **Step 1: Create Cargo project**

```bash
cd /Users/lion268li/repos/toutiao/demo/ai-studio-infinite-canvas/.claude/worktrees/mumu
mkdir -p ai-backend/src
```

- [ ] **Step 2: Write Cargo.toml**

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
chrono = { version = "0.4", features = ["serde"] }
bytes = "1"
futures = "0.3"
```

- [ ] **Step 3: Write minimal main.rs that reads stdin and echoes**

```rust
use std::io::{self, BufRead, Write};

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut stdout = stdout.lock();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        // Echo back for now — will be replaced by router
        let _ = writeln!(stdout, "{}", line);
        let _ = stdout.flush();
    }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd ai-backend && cargo build`
Expected: Compiles successfully

- [ ] **Step 6: Commit**

```bash
git add ai-backend/
git commit -m "feat: scaffold Rust sidecar project (ai-backend)"
```

---

### Task 2: NDJSON Protocol Types

**Files:**
- Create: `ai-backend/src/protocol.rs`

This defines all message types for the NDJSON protocol: Request, Response, Error, Event.

- [ ] **Step 1: Write protocol.rs with all types**

```rust
use serde::{Deserialize, Serialize};

/// Incoming request from Electron main process
#[derive(Debug, Deserialize)]
pub struct Request {
    pub id: String,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

/// Outgoing response (success)
#[derive(Debug, Serialize)]
pub struct Response {
    pub id: String,
    pub result: serde_json::Value,
}

/// Outgoing response (error)
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub id: String,
    pub error: ProtocolError,
}

#[derive(Debug, Serialize)]
pub struct ProtocolError {
    pub code: i32,
    pub message: String,
}

/// Outgoing streaming event (no id)
#[derive(Debug, Serialize)]
pub struct Event {
    pub event: String,
    pub data: serde_json::Value,
}

/// Union type for anything written to stdout
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum OutgoingMessage {
    Response(Response),
    Error(ErrorResponse),
    Event(Event),
}

impl Response {
    pub fn ok(id: String, result: serde_json::Value) -> OutgoingMessage {
        OutgoingMessage::Response(Response { id, result })
    }
}

impl ErrorResponse {
    pub fn new(id: String, code: i32, message: String) -> OutgoingMessage {
        OutgoingMessage::Error(ErrorResponse {
            id,
            error: ProtocolError { code, message },
        })
    }
}

impl Event {
    pub fn new(event: &str, data: serde_json::Value) -> OutgoingMessage {
        OutgoingMessage::Event(Event {
            event: event.to_string(),
            data,
        })
    }
}
```

- [ ] **Step 2: Add unit tests for serialization**

Add to bottom of `protocol.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_request_deserialize() {
        let input = r#"{"id":"req_1","method":"ping","params":{}}"#;
        let req: Request = serde_json::from_str(input).unwrap();
        assert_eq!(req.id, "req_1");
        assert_eq!(req.method, "ping");
    }

    #[test]
    fn test_request_no_params() {
        let input = r#"{"id":"req_1","method":"ping"}"#;
        let req: Request = serde_json::from_str(input).unwrap();
        assert_eq!(req.method, "ping");
        assert!(req.params.is_null());
    }

    #[test]
    fn test_response_serialize() {
        let msg = Response::ok("req_1".into(), json!({"session_id": "abc"}));
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"id\":\"req_1\""));
        assert!(json.contains("\"session_id\":\"abc\""));
        // Must NOT contain "event" field
        assert!(!json.contains("\"event\""));
    }

    #[test]
    fn test_error_serialize() {
        let msg = ErrorResponse::new("req_2".into(), 1001, "not found".into());
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"code\":1001"));
        assert!(json.contains("\"not found\""));
    }

    #[test]
    fn test_event_serialize() {
        let msg = Event::new("block.start", json!({"session_id": "s1", "block_index": 0}));
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"event\":\"block.start\""));
        assert!(json.contains("\"session_id\":\"s1\""));
        // Must NOT contain "id" field
        assert!(!json.contains("\"id\""));
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd ai-backend && cargo test`
Expected: All 5 tests pass

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/protocol.rs
git commit -m "feat: add NDJSON protocol types with serialization tests"
```

---

### Task 3: Router + Main Loop

**Files:**
- Create: `ai-backend/src/router.rs`
- Modify: `ai-backend/src/main.rs`
- Modify: `ai-backend/src/lib.rs`

The router dispatches method strings to handler functions. The main loop reads stdin, parses, routes, and writes responses to stdout.

- [ ] **Step 1: Write router.rs**

```rust
use serde_json::json;
use tokio::sync::mpsc;

use crate::protocol::{ErrorResponse, Event, OutgoingMessage, Request, Response};
use crate::session::manager::SessionManager;

pub async fn handle_request(
    req: Request,
    session_manager: &mut SessionManager,
    event_tx: mpsc::UnboundedSender<OutgoingMessage>,
) -> OutgoingMessage {
    match req.method.as_str() {
        "ping" => Response::ok(req.id, json!({"pong": true})),

        "config.set_api_key" => {
            let api_key = req.params.get("api_key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if api_key.is_empty() {
                return ErrorResponse::new(req.id, 1002, "api_key is required".into());
            }
            session_manager.set_api_key(api_key.to_string());
            Response::ok(req.id, json!({"ok": true}))
        }

        "session.create" => {
            let model = req.params.get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("claude-sonnet-4-20250514")
                .to_string();
            let max_tokens = req.params.get("max_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(4096) as u32;
            let history = req.params.get("history").cloned();

            let session_id = session_manager.create(model, max_tokens, history);
            Response::ok(req.id, json!({"session_id": session_id}))
        }

        "session.send" => {
            let session_id = req.params.get("session_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let text = req.params.get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if session_id.is_empty() || text.is_empty() {
                return ErrorResponse::new(req.id, 1002, "session_id and text are required".into());
            }

            match session_manager.send(session_id, text, event_tx.clone()).await {
                Ok(()) => Response::ok(req.id, json!({"ok": true})),
                Err(e) => ErrorResponse::new(req.id, e.code(), e.to_string()),
            }
        }

        "session.list" => {
            let sessions = session_manager.list();
            Response::ok(req.id, json!({"sessions": sessions}))
        }

        "session.kill" => {
            let session_id = req.params.get("session_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            session_manager.kill(session_id);
            Response::ok(req.id, json!({"ok": true}))
        }

        _ => ErrorResponse::new(req.id, 1000, format!("unknown method: {}", req.method)),
    }
}
```

- [ ] **Step 2: Rewrite main.rs with tokio + stdin/stdout loop**

Note: No `lib.rs` — all modules declared in `main.rs` only (single crate root). Uses `tokio::task::spawn_blocking` for stdout to avoid `StdoutLock` Send issues.

```rust
use std::io::{self, Write};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;

mod protocol;
mod router;
mod session;
mod claude;
mod normalizer;

use protocol::{OutgoingMessage, Request};
use session::manager::SessionManager;

#[tokio::main]
async fn main() {
    let mut session_manager = SessionManager::new();

    // Read API key from env if available
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        session_manager.set_api_key(key);
    }

    // Channel for streaming events (written to stdout)
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<OutgoingMessage>();

    // Single channel for all stdout output (responses + events)
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();

    // Forward events to the output channel
    let out_tx_for_events = out_tx.clone();
    tokio::spawn(async move {
        while let Some(msg) = event_rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                let _ = out_tx_for_events.send(json);
            }
        }
    });

    // Stdout writer — runs in a blocking thread to avoid Send issues with StdoutLock
    tokio::task::spawn_blocking(move || {
        let stdout = io::stdout();
        let mut stdout = stdout.lock();
        while let Some(line) = out_rx.blocking_recv() {
            let _ = writeln!(stdout, "{}", line);
            let _ = stdout.flush();
        }
    });

    // Stdin reader
    let stdin = tokio::io::stdin();
    let reader = BufReader::new(stdin);
    let mut lines = reader.lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        let req: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let err_msg = protocol::ErrorResponse::new(
                    "unknown".into(),
                    1003,
                    format!("invalid JSON: {}", e),
                );
                if let Ok(json) = serde_json::to_string(&err_msg) {
                    let _ = out_tx.send(json);
                }
                continue;
            }
        };

        let result = router::handle_request(req, &mut session_manager, event_tx.clone()).await;
        if let Ok(json) = serde_json::to_string(&result) {
            let _ = out_tx.send(json);
        }
    }
}
```

- [ ] **Step 4: Create stub modules so it compiles**

Create `ai-backend/src/session/mod.rs`:
```rust
pub mod manager;
pub mod types;
```

Create `ai-backend/src/session/types.rs`:
```rust
use serde::Serialize;

#[derive(Debug)]
pub struct Session {
    pub id: String,
    pub model: String,
    pub max_tokens: u32,
    pub messages: Vec<ChatMessage>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct SessionSummary {
    pub id: String,
    pub model: String,
    pub message_count: usize,
    pub created_at: String,
}
```

Create `ai-backend/src/session/manager.rs`:
```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::protocol::OutgoingMessage;
use super::types::{ChatMessage, Session, SessionSummary};

#[derive(Debug)]
pub enum SessionError {
    NotFound(String),
    NoApiKey,
    ApiError(String),
}

impl SessionError {
    pub fn code(&self) -> i32 {
        match self {
            SessionError::NotFound(_) => 1001,
            SessionError::NoApiKey => 401,
            SessionError::ApiError(_) => 1004,
        }
    }
}

impl std::fmt::Display for SessionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SessionError::NotFound(id) => write!(f, "session not found: {}", id),
            SessionError::NoApiKey => write!(f, "no API key configured"),
            SessionError::ApiError(msg) => write!(f, "API error: {}", msg),
        }
    }
}

/// SessionManager uses Arc<Mutex<>> for inner state so spawned tasks
/// can append assistant messages back to conversation history.
pub struct SessionManager {
    inner: Arc<Mutex<SessionManagerInner>>,
}

struct SessionManagerInner {
    sessions: HashMap<String, Session>,
    api_key: Option<String>,
}

impl SessionManager {
    pub fn new() -> Self {
        SessionManager {
            inner: Arc::new(Mutex::new(SessionManagerInner {
                sessions: HashMap::new(),
                api_key: None,
            })),
        }
    }

    pub fn set_api_key(&mut self, key: String) {
        self.inner.lock().unwrap().api_key = Some(key);
    }

    pub fn create(
        &mut self,
        model: String,
        max_tokens: u32,
        history: Option<serde_json::Value>,
    ) -> String {
        let id = Uuid::new_v4().to_string();
        let mut messages = Vec::new();

        // Restore history if provided (crash recovery)
        // Filter out "system" role — Claude API requires system prompt as a
        // separate field, not in the messages array
        if let Some(history_val) = history {
            if let Some(arr) = history_val.as_array() {
                for msg in arr {
                    let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("user");
                    if role == "system" { continue; }
                    let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
                    messages.push(ChatMessage {
                        role: role.to_string(),
                        content: content.to_string(),
                    });
                }
            }
        }

        let now = chrono::Utc::now().to_rfc3339();
        let session = Session {
            id: id.clone(),
            model,
            max_tokens,
            messages,
            created_at: now,
        };
        self.inner.lock().unwrap().sessions.insert(id.clone(), session);
        id
    }

    pub async fn send(
        &mut self,
        session_id: &str,
        text: &str,
        _event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    ) -> Result<(), SessionError> {
        let inner = self.inner.lock().unwrap();
        let session = inner.sessions.get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;
        let _api_key = inner.api_key.clone()
            .ok_or(SessionError::NoApiKey)?;
        drop(inner); // Release lock before async work

        // Append user message
        {
            let mut inner = self.inner.lock().unwrap();
            let session = inner.sessions.get_mut(session_id).unwrap();
            session.messages.push(ChatMessage {
                role: "user".into(),
                content: text.to_string(),
            });
        }

        // TODO: Call Claude API and stream response (Task 10)
        // The spawned task will use self.inner.clone() to append
        // assistant messages after streaming completes.
        Ok(())
    }

    pub fn list(&self) -> Vec<SessionSummary> {
        let inner = self.inner.lock().unwrap();
        inner.sessions.values().map(|s| SessionSummary {
            id: s.id.clone(),
            model: s.model.clone(),
            message_count: s.messages.len(),
            created_at: s.created_at.clone(),
        }).collect()
    }

    pub fn kill(&mut self, session_id: &str) {
        self.inner.lock().unwrap().sessions.remove(session_id);
    }

    /// Get a clone of the Arc for use in spawned tasks
    pub fn inner_ref(&self) -> Arc<Mutex<SessionManagerInner>> {
        self.inner.clone()
    }
}
```

Create `ai-backend/src/claude/mod.rs`:
```rust
pub mod client;
pub mod stream;
pub mod types;
```

Create `ai-backend/src/claude/client.rs`:
```rust
// Stub — implemented in Task 6
```

Create `ai-backend/src/claude/stream.rs`:
```rust
// Stub — implemented in Task 7
```

Create `ai-backend/src/claude/types.rs`:
```rust
// Stub — implemented in Task 5
```

Create `ai-backend/src/normalizer/mod.rs`:
```rust
pub mod blocks;
pub mod parser;
pub mod markdown;
```

Create `ai-backend/src/normalizer/blocks.rs`:
```rust
// Stub — implemented in Task 8
```

Create `ai-backend/src/normalizer/parser.rs`:
```rust
// Stub — implemented in Task 9
```

Create `ai-backend/src/normalizer/markdown.rs`:
```rust
// Stub — implemented in Task 10
```

- [ ] **Step 5: Verify it compiles**

Run: `cd ai-backend && cargo build`
Expected: Compiles successfully

- [ ] **Step 6: Test ping manually**

Run: `cd ai-backend && echo '{"id":"1","method":"ping"}' | cargo run`
Expected output: `{"pong":true}` (or similar with id)

- [ ] **Step 7: Commit**

```bash
git add ai-backend/
git commit -m "feat: add router, main loop, and session manager stub"
```

---

## Chunk 2: Claude API Integration

### Task 4: Claude API Types

**Files:**
- Modify: `ai-backend/src/claude/types.rs`

Define the request and response types for the Claude Messages API.

- [ ] **Step 1: Write Claude API types**

```rust
use serde::{Deserialize, Serialize};

/// Request body for POST /v1/messages
#[derive(Debug, Serialize)]
pub struct CreateMessageRequest {
    pub model: String,
    pub messages: Vec<ApiMessage>,
    pub max_tokens: u32,
    pub stream: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct ApiMessage {
    pub role: String,
    pub content: String,
}

/// SSE event types from Claude streaming API
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    #[serde(rename = "message_start")]
    MessageStart { message: MessageInfo },

    #[serde(rename = "content_block_start")]
    ContentBlockStart { index: usize, content_block: ContentBlockInfo },

    #[serde(rename = "content_block_delta")]
    ContentBlockDelta { index: usize, delta: DeltaInfo },

    #[serde(rename = "content_block_stop")]
    ContentBlockStop { index: usize },

    #[serde(rename = "message_delta")]
    MessageDelta { delta: MessageDeltaInfo, usage: Option<UsageInfo> },

    #[serde(rename = "message_stop")]
    MessageStop,

    #[serde(rename = "ping")]
    Ping,

    #[serde(rename = "error")]
    Error { error: ApiError },
}

#[derive(Debug, Deserialize)]
pub struct MessageInfo {
    pub id: Option<String>,
    pub model: Option<String>,
    pub usage: Option<UsageInfo>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UsageInfo {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct ContentBlockInfo {
    #[serde(rename = "type")]
    pub block_type: String,
    /// For text blocks
    pub text: Option<String>,
    /// For tool_use blocks
    pub id: Option<String>,
    pub name: Option<String>,
    pub input: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum DeltaInfo {
    #[serde(rename = "text_delta")]
    TextDelta { text: String },

    #[serde(rename = "input_json_delta")]
    InputJsonDelta { partial_json: String },
}

#[derive(Debug, Deserialize)]
pub struct MessageDeltaInfo {
    pub stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ApiError {
    #[serde(rename = "type")]
    pub error_type: String,
    pub message: String,
}
```

- [ ] **Step 2: Add deserialization tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_content_block_start_text() {
        let json = r#"{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}"#;
        let event: StreamEvent = serde_json::from_str(json).unwrap();
        match event {
            StreamEvent::ContentBlockStart { index, content_block } => {
                assert_eq!(index, 0);
                assert_eq!(content_block.block_type, "text");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn test_deserialize_text_delta() {
        let json = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#;
        let event: StreamEvent = serde_json::from_str(json).unwrap();
        match event {
            StreamEvent::ContentBlockDelta { index, delta } => {
                assert_eq!(index, 0);
                match delta {
                    DeltaInfo::TextDelta { text } => assert_eq!(text, "Hello"),
                    _ => panic!("wrong delta variant"),
                }
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn test_deserialize_tool_use_start() {
        let json = r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_1","name":"Bash","input":{}}}"#;
        let event: StreamEvent = serde_json::from_str(json).unwrap();
        match event {
            StreamEvent::ContentBlockStart { index, content_block } => {
                assert_eq!(index, 1);
                assert_eq!(content_block.block_type, "tool_use");
                assert_eq!(content_block.name.unwrap(), "Bash");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn test_serialize_request() {
        let req = CreateMessageRequest {
            model: "claude-sonnet-4-20250514".into(),
            messages: vec![ApiMessage { role: "user".into(), content: "hi".into() }],
            max_tokens: 4096,
            stream: true,
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"stream\":true"));
        assert!(json.contains("\"max_tokens\":4096"));
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd ai-backend && cargo test claude::types`
Expected: All 4 tests pass

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/claude/types.rs
git commit -m "feat: add Claude API request/response types"
```

---

### Task 5: Claude API HTTP Client

**Files:**
- Modify: `ai-backend/src/claude/client.rs`

HTTP client that calls `POST /v1/messages` with streaming enabled and returns a byte stream.

- [ ] **Step 1: Write client.rs**

```rust
use reqwest::Response;

use super::types::{ApiMessage, CreateMessageRequest};

const CLAUDE_API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

pub struct ClaudeClient {
    http: reqwest::Client,
    api_key: String,
}

impl ClaudeClient {
    pub fn new(api_key: String) -> Self {
        ClaudeClient {
            http: reqwest::Client::new(),
            api_key,
        }
    }

    pub async fn stream_message(
        &self,
        model: &str,
        messages: Vec<ApiMessage>,
        max_tokens: u32,
    ) -> Result<Response, reqwest::Error> {
        let body = CreateMessageRequest {
            model: model.to_string(),
            messages,
            max_tokens,
            stream: true,
        };

        self.http
            .post(CLAUDE_API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ai-backend && cargo build`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add ai-backend/src/claude/client.rs
git commit -m "feat: add Claude API HTTP client"
```

---

### Task 6: SSE Stream Parser

**Files:**
- Modify: `ai-backend/src/claude/stream.rs`

Parses the SSE (Server-Sent Events) format from Claude's streaming response into typed `StreamEvent` values.

- [ ] **Step 1: Write stream.rs**

```rust
use bytes::Bytes;
use futures::Stream;
use tokio::sync::mpsc;

use super::types::StreamEvent;

/// Parse an SSE byte stream into StreamEvent messages.
/// SSE format: lines of "event: <type>\ndata: <json>\n\n"
pub async fn parse_sse_stream<S>(
    mut stream: S,
    tx: mpsc::UnboundedSender<StreamEvent>,
) where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Unpin,
{
    use futures::StreamExt;

    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(_) => break,
        };

        let text = match std::str::from_utf8(&chunk) {
            Ok(t) => t,
            Err(_) => continue,
        };

        buffer.push_str(text);

        // Process complete SSE messages (separated by double newline)
        while let Some(pos) = buffer.find("\n\n") {
            let message = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();

            // Extract data line
            let mut data_str = String::new();
            for line in message.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    data_str = data.to_string();
                }
            }

            if data_str.is_empty() {
                continue;
            }

            // Parse JSON data into StreamEvent
            match serde_json::from_str::<StreamEvent>(&data_str) {
                Ok(event) => {
                    if tx.send(event).is_err() {
                        return; // Receiver dropped
                    }
                }
                Err(_) => {
                    // Skip unparseable events (e.g., unknown event types)
                    continue;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use futures::stream;

    #[tokio::test]
    async fn test_parse_text_stream() {
        let sse_data = "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\nevent: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n";

        let byte_stream = stream::iter(vec![
            Ok::<Bytes, reqwest::Error>(Bytes::from(sse_data)),
        ]);

        let (tx, mut rx) = mpsc::unbounded_channel();
        parse_sse_stream(byte_stream, tx).await;

        let events: Vec<StreamEvent> = {
            let mut v = Vec::new();
            while let Ok(e) = rx.try_recv() {
                v.push(e);
            }
            v
        };

        assert_eq!(events.len(), 3);
        assert!(matches!(&events[0], StreamEvent::ContentBlockStart { index: 0, .. }));
        assert!(matches!(&events[1], StreamEvent::ContentBlockDelta { index: 0, .. }));
        assert!(matches!(&events[2], StreamEvent::ContentBlockStop { index: 0 }));
    }

    #[tokio::test]
    async fn test_parse_chunked_stream() {
        // Simulate data arriving in two chunks, split mid-message
        let chunk1 = "event: content_block_delta\ndata: {\"type\":\"content_block";
        let chunk2 = "_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}\n\n";

        let byte_stream = stream::iter(vec![
            Ok::<Bytes, reqwest::Error>(Bytes::from(chunk1)),
            Ok(Bytes::from(chunk2)),
        ]);

        let (tx, mut rx) = mpsc::unbounded_channel();
        parse_sse_stream(byte_stream, tx).await;

        let event = rx.try_recv().unwrap();
        match event {
            StreamEvent::ContentBlockDelta { delta, .. } => {
                match delta {
                    super::super::types::DeltaInfo::TextDelta { text } => assert_eq!(text, "Hi"),
                    _ => panic!("wrong delta"),
                }
            }
            _ => panic!("wrong event"),
        }
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd ai-backend && cargo test claude::stream`
Expected: All 2 tests pass

- [ ] **Step 3: Commit**

```bash
git add ai-backend/src/claude/stream.rs
git commit -m "feat: add SSE stream parser for Claude API"
```

---

## Chunk 3: Normalizer (7 Content Block Types)

### Task 7: ContentBlock Types

**Files:**
- Modify: `ai-backend/src/normalizer/blocks.rs`

Define the 7 ContentBlock variants that match the frontend's `src/types.ts`.

- [ ] **Step 1: Write blocks.rs**

```rust
use serde::Serialize;

/// Matches the frontend ContentBlock discriminated union in src/types.ts
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { content: String },

    #[serde(rename = "code")]
    Code { code: String, language: String },

    #[serde(rename = "tool_call")]
    ToolCall {
        tool: String,
        args: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        description: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration: Option<f64>,
        status: ToolCallStatus,
    },

    #[serde(rename = "todolist")]
    TodoList { items: Vec<TodoItem> },

    #[serde(rename = "subagent")]
    Subagent {
        #[serde(rename = "agentId")]
        agent_id: String,
        task: String,
        status: SubagentStatus,
        #[serde(skip_serializing_if = "Option::is_none")]
        summary: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        blocks: Option<Vec<ContentBlock>>,
    },

    #[serde(rename = "askuser")]
    AskUser {
        questions: Vec<AskUserQuestion>,
        #[serde(skip_serializing_if = "Option::is_none")]
        submitted: Option<bool>,
    },

    #[serde(rename = "skill")]
    Skill {
        skill: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        args: Option<String>,
        status: SkillStatus,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration: Option<f64>,
    },
}

#[derive(Debug, Clone, Serialize)]
pub enum ToolCallStatus {
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub enum SubagentStatus {
    #[serde(rename = "launched")]
    Launched,
    #[serde(rename = "working")]
    Working,
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub enum SkillStatus {
    #[serde(rename = "invoking")]
    Invoking,
    #[serde(rename = "done")]
    Done,
}

#[derive(Debug, Clone, Serialize)]
pub struct TodoItem {
    pub id: String,
    pub label: String,
    pub status: TodoStatus,
}

#[derive(Debug, Clone, Serialize)]
pub enum TodoStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "in_progress")]
    InProgress,
    #[serde(rename = "done")]
    Done,
}

#[derive(Debug, Clone, Serialize)]
pub struct AskUserQuestion {
    pub id: String,
    pub question: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<String>,
}

/// Delta types for streaming (used in block.delta events)
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum BlockDelta {
    /// For text/code blocks: append content
    TextDelta { content: String },
    /// For tool_call blocks: append args
    ArgsDelta { args: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_block_serializes() {
        let block = ContentBlock::Text { content: "hello".into() };
        let json = serde_json::to_string(&block).unwrap();
        assert!(json.contains("\"type\":\"text\""));
        assert!(json.contains("\"content\":\"hello\""));
    }

    #[test]
    fn test_code_block_serializes() {
        let block = ContentBlock::Code { code: "fn main(){}".into(), language: "rust".into() };
        let json = serde_json::to_string(&block).unwrap();
        assert!(json.contains("\"type\":\"code\""));
        assert!(json.contains("\"language\":\"rust\""));
    }

    #[test]
    fn test_tool_call_serializes() {
        let block = ContentBlock::ToolCall {
            tool: "Bash".into(),
            args: "ls -la".into(),
            description: None,
            duration: None,
            status: ToolCallStatus::Running,
        };
        let json = serde_json::to_string(&block).unwrap();
        assert!(json.contains("\"type\":\"tool_call\""));
        assert!(json.contains("\"status\":\"running\""));
        // Optional fields omitted when None
        assert!(!json.contains("description"));
        assert!(!json.contains("duration"));
    }

    #[test]
    fn test_subagent_serializes_with_camel_case() {
        let block = ContentBlock::Subagent {
            agent_id: "a1".into(),
            task: "test".into(),
            status: SubagentStatus::Launched,
            summary: None,
            blocks: None,
        };
        let json = serde_json::to_string(&block).unwrap();
        assert!(json.contains("\"agentId\":\"a1\""));
        assert!(json.contains("\"type\":\"subagent\""));
    }

    #[test]
    fn test_todolist_serializes() {
        let block = ContentBlock::TodoList {
            items: vec![
                TodoItem { id: "t1".into(), label: "task one".into(), status: TodoStatus::Done },
                TodoItem { id: "t2".into(), label: "task two".into(), status: TodoStatus::Pending },
            ],
        };
        let json = serde_json::to_string(&block).unwrap();
        assert!(json.contains("\"type\":\"todolist\""));
        assert!(json.contains("\"status\":\"done\""));
        assert!(json.contains("\"status\":\"pending\""));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd ai-backend && cargo test normalizer::blocks`
Expected: All 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add ai-backend/src/normalizer/blocks.rs
git commit -m "feat: add 7 ContentBlock types matching frontend schema"
```

---

### Task 8: Markdown Code Block Splitter

**Files:**
- Modify: `ai-backend/src/normalizer/markdown.rs`

Splits Claude's text output that contains markdown code fences into alternating `text` and `code` ContentBlocks.

- [ ] **Step 1: Write markdown.rs with tests first (TDD)**

```rust
use super::blocks::ContentBlock;

/// Split text containing markdown code fences into text/code ContentBlocks.
///
/// Input: "Some text\n```rust\nfn main(){}\n```\nMore text"
/// Output: [Text("Some text\n"), Code("fn main(){}", "rust"), Text("\nMore text")]
pub fn split_code_blocks(text: &str) -> Vec<ContentBlock> {
    let mut blocks = Vec::new();
    let mut remaining = text;

    while let Some(fence_start) = remaining.find("```") {
        // Text before the fence
        let before = &remaining[..fence_start];
        if !before.is_empty() {
            blocks.push(ContentBlock::Text { content: before.to_string() });
        }

        // Skip opening ```
        let after_fence = &remaining[fence_start + 3..];

        // Extract language (everything until newline)
        let (language, code_start) = match after_fence.find('\n') {
            Some(nl) => {
                let lang = after_fence[..nl].trim().to_string();
                (lang, nl + 1)
            }
            None => {
                // Unclosed fence at end of string — treat as text
                blocks.push(ContentBlock::Text { content: remaining[fence_start..].to_string() });
                return blocks;
            }
        };

        let code_content = &after_fence[code_start..];

        // Find closing ```
        match code_content.find("```") {
            Some(close_pos) => {
                let code = code_content[..close_pos].trim_end_matches('\n').to_string();
                let lang = if language.is_empty() { "plaintext".to_string() } else { language };
                blocks.push(ContentBlock::Code { code, language: lang });

                // Continue after closing ```
                let after_close = &code_content[close_pos + 3..];
                // Skip trailing newline after closing fence
                remaining = after_close.strip_prefix('\n').unwrap_or(after_close);
            }
            None => {
                // Unclosed fence — treat rest as code
                let code = code_content.trim_end_matches('\n').to_string();
                let lang = if language.is_empty() { "plaintext".to_string() } else { language };
                blocks.push(ContentBlock::Code { code, language: lang });
                return blocks;
            }
        }
    }

    // Remaining text after all fences
    if !remaining.is_empty() {
        blocks.push(ContentBlock::Text { content: remaining.to_string() });
    }

    blocks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plain_text_no_fences() {
        let blocks = split_code_blocks("Hello world");
        assert_eq!(blocks.len(), 1);
        assert!(matches!(&blocks[0], ContentBlock::Text { content } if content == "Hello world"));
    }

    #[test]
    fn test_single_code_block() {
        let input = "Before\n```rust\nfn main() {}\n```\nAfter";
        let blocks = split_code_blocks(input);
        assert_eq!(blocks.len(), 3);
        assert!(matches!(&blocks[0], ContentBlock::Text { content } if content == "Before\n"));
        assert!(matches!(&blocks[1], ContentBlock::Code { code, language } if code == "fn main() {}" && language == "rust"));
        assert!(matches!(&blocks[2], ContentBlock::Text { content } if content == "After"));
    }

    #[test]
    fn test_no_language_specified() {
        let input = "```\nsome code\n```";
        let blocks = split_code_blocks(input);
        assert_eq!(blocks.len(), 1);
        assert!(matches!(&blocks[0], ContentBlock::Code { language, .. } if language == "plaintext"));
    }

    #[test]
    fn test_multiple_code_blocks() {
        let input = "Text1\n```js\nconst a = 1;\n```\nText2\n```py\nprint('hi')\n```\nText3";
        let blocks = split_code_blocks(input);
        assert_eq!(blocks.len(), 5);
        assert!(matches!(&blocks[0], ContentBlock::Text { .. }));
        assert!(matches!(&blocks[1], ContentBlock::Code { language, .. } if language == "js"));
        assert!(matches!(&blocks[2], ContentBlock::Text { .. }));
        assert!(matches!(&blocks[3], ContentBlock::Code { language, .. } if language == "py"));
        assert!(matches!(&blocks[4], ContentBlock::Text { .. }));
    }

    #[test]
    fn test_code_only_no_surrounding_text() {
        let input = "```typescript\nconst x = 1;\n```";
        let blocks = split_code_blocks(input);
        assert_eq!(blocks.len(), 1);
        assert!(matches!(&blocks[0], ContentBlock::Code { language, .. } if language == "typescript"));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd ai-backend && cargo test normalizer::markdown`
Expected: All 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add ai-backend/src/normalizer/markdown.rs
git commit -m "feat: add markdown code block splitter"
```

---

### Task 9: Normalizer Parser (Claude Events → ContentBlocks)

**Files:**
- Modify: `ai-backend/src/normalizer/parser.rs`

Converts Claude `StreamEvent` values into protocol `block.*` events. This is the core logic that maps Claude's raw output to the 7 ContentBlock types.

- [ ] **Step 1: Write parser.rs**

```rust
use serde_json::json;
use tokio::sync::mpsc;

use crate::claude::types::{ContentBlockInfo, DeltaInfo, StreamEvent, UsageInfo};
use crate::protocol::{Event, OutgoingMessage};
use super::blocks::{
    AskUserQuestion, BlockDelta, ContentBlock, SkillStatus, SubagentStatus,
    TodoItem, TodoStatus, ToolCallStatus,
};

/// Known special tool names that map to specific ContentBlock types
const TOOL_TODO_WRITE: &[&str] = &["TodoWrite", "TaskCreate"];
const TOOL_AGENT: &str = "Agent";
const TOOL_ASK_USER: &str = "AskUserQuestion";
const TOOL_SKILL: &str = "Skill";

/// State for tracking the current streaming response
struct BlockState {
    /// The tool name for tool_use blocks (to identify special tools)
    tool_name: Option<String>,
    /// Accumulated JSON input for tool_use blocks
    tool_input_json: String,
    /// Whether this is a text block (for markdown splitting later)
    is_text: bool,
    /// Accumulated text for text blocks
    accumulated_text: String,
}

/// Process a stream of Claude events and emit protocol events
pub async fn process_stream(
    session_id: &str,
    mut event_rx: mpsc::UnboundedReceiver<StreamEvent>,
    event_tx: mpsc::UnboundedSender<OutgoingMessage>,
) -> String {
    let mut block_states: Vec<BlockState> = Vec::new();
    let mut assistant_text = String::new();
    let mut final_usage: Option<UsageInfo> = None;

    while let Some(event) = event_rx.recv().await {
        match event {
            StreamEvent::ContentBlockStart { index, content_block } => {
                let block = create_initial_block(&content_block);
                let state = BlockState {
                    tool_name: content_block.name.clone(),
                    tool_input_json: String::new(),
                    is_text: content_block.block_type == "text",
                    accumulated_text: String::new(),
                };

                // Ensure block_states has enough capacity
                while block_states.len() <= index {
                    block_states.push(BlockState {
                        tool_name: None,
                        tool_input_json: String::new(),
                        is_text: false,
                        accumulated_text: String::new(),
                    });
                }
                block_states[index] = state;

                let _ = event_tx.send(Event::new("block.start", json!({
                    "session_id": session_id,
                    "block_index": index,
                    "block": block,
                })));
            }

            StreamEvent::ContentBlockDelta { index, delta } => {
                match delta {
                    DeltaInfo::TextDelta { text } => {
                        if let Some(state) = block_states.get_mut(index) {
                            state.accumulated_text.push_str(&text);
                        }
                        let _ = event_tx.send(Event::new("block.delta", json!({
                            "session_id": session_id,
                            "block_index": index,
                            "delta": { "content": text },
                        })));
                    }
                    DeltaInfo::InputJsonDelta { partial_json } => {
                        if let Some(state) = block_states.get_mut(index) {
                            state.tool_input_json.push_str(&partial_json);
                        }
                        let _ = event_tx.send(Event::new("block.delta", json!({
                            "session_id": session_id,
                            "block_index": index,
                            "delta": { "args": partial_json },
                        })));
                    }
                }
            }

            StreamEvent::ContentBlockStop { index } => {
                // For tool_use blocks, check if it's a special tool and emit the appropriate block
                if let Some(state) = block_states.get(index) {
                    if let Some(tool_name) = &state.tool_name {
                        if let Some(special_block) = try_parse_special_tool(tool_name, &state.tool_input_json) {
                            // Replace the generic tool_call with the special block
                            let _ = event_tx.send(Event::new("block.start", json!({
                                "session_id": session_id,
                                "block_index": index,
                                "block": special_block,
                            })));
                        }
                    }

                    if state.is_text {
                        assistant_text.push_str(&state.accumulated_text);
                    }
                }

                let _ = event_tx.send(Event::new("block.stop", json!({
                    "session_id": session_id,
                    "block_index": index,
                })));
            }

            StreamEvent::MessageDelta { usage, .. } => {
                // Stash usage for message.complete — do NOT emit here
                if let Some(u) = usage {
                    final_usage = Some(u);
                }
            }

            StreamEvent::MessageStop => {
                // Emit message.complete exactly once, with accumulated usage
                let mut data = json!({ "session_id": session_id });
                if let Some(usage) = &final_usage {
                    data["usage"] = json!(usage);
                }
                let _ = event_tx.send(Event::new("message.complete", data));
            }

            StreamEvent::Error { error } => {
                let code = if error.error_type == "authentication_error" { 401 } else { 1004 };
                let _ = event_tx.send(Event::new("message.error", json!({
                    "session_id": session_id,
                    "error": { "code": code, "message": error.message },
                })));
                break;
            }

            StreamEvent::MessageStart { .. } | StreamEvent::Ping => {
                // Ignored
            }
        }
    }

    assistant_text
}

fn create_initial_block(info: &ContentBlockInfo) -> serde_json::Value {
    match info.block_type.as_str() {
        "text" => json!({ "type": "text", "content": "" }),
        "tool_use" => json!({
            "type": "tool_call",
            "tool": info.name.as_deref().unwrap_or("unknown"),
            "args": "",
            "status": "running",
        }),
        _ => json!({ "type": "text", "content": "" }),
    }
}

/// Try to parse a special tool (TodoWrite, Agent, AskUserQuestion, Skill)
/// from the accumulated JSON input. Returns None for generic tools.
fn try_parse_special_tool(tool_name: &str, json_input: &str) -> Option<serde_json::Value> {
    let input: serde_json::Value = serde_json::from_str(json_input).ok()?;

    if TOOL_TODO_WRITE.contains(&tool_name) {
        let items = input.get("items")
            .or_else(|| input.get("tasks"))
            .and_then(|v| v.as_array())?;
        let todo_items: Vec<serde_json::Value> = items.iter().map(|item| {
            json!({
                "id": item.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                "label": item.get("label")
                    .or_else(|| item.get("description"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
                "status": item.get("status").and_then(|v| v.as_str()).unwrap_or("pending"),
            })
        }).collect();
        return Some(json!({ "type": "todolist", "items": todo_items }));
    }

    if tool_name == TOOL_AGENT {
        return Some(json!({
            "type": "subagent",
            "agentId": input.get("description").and_then(|v| v.as_str()).unwrap_or("agent"),
            "task": input.get("prompt").and_then(|v| v.as_str()).unwrap_or(""),
            "status": "launched",
        }));
    }

    if tool_name == TOOL_ASK_USER {
        let question = input.get("question").and_then(|v| v.as_str()).unwrap_or("");
        return Some(json!({
            "type": "askuser",
            "questions": [{
                "id": uuid::Uuid::new_v4().to_string(),
                "question": question,
            }],
        }));
    }

    if tool_name == TOOL_SKILL {
        return Some(json!({
            "type": "skill",
            "skill": input.get("skill").and_then(|v| v.as_str()).unwrap_or(""),
            "args": input.get("args").and_then(|v| v.as_str()),
            "status": "invoking",
        }));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_try_parse_todolist() {
        let input = r#"{"items":[{"id":"t1","label":"Do thing","status":"pending"}]}"#;
        let block = try_parse_special_tool("TodoWrite", input).unwrap();
        assert_eq!(block["type"], "todolist");
        assert_eq!(block["items"][0]["label"], "Do thing");
    }

    #[test]
    fn test_try_parse_agent() {
        let input = r#"{"description":"research-1","prompt":"find bugs"}"#;
        let block = try_parse_special_tool("Agent", input).unwrap();
        assert_eq!(block["type"], "subagent");
        assert_eq!(block["agentId"], "research-1");
        assert_eq!(block["task"], "find bugs");
    }

    #[test]
    fn test_try_parse_askuser() {
        let input = r#"{"question":"Which approach?"}"#;
        let block = try_parse_special_tool("AskUserQuestion", input).unwrap();
        assert_eq!(block["type"], "askuser");
        assert_eq!(block["questions"][0]["question"], "Which approach?");
    }

    #[test]
    fn test_try_parse_skill() {
        let input = r#"{"skill":"brainstorming","args":"--depth=3"}"#;
        let block = try_parse_special_tool("Skill", input).unwrap();
        assert_eq!(block["type"], "skill");
        assert_eq!(block["skill"], "brainstorming");
    }

    #[test]
    fn test_try_parse_generic_tool_returns_none() {
        let input = r#"{"command":"ls -la"}"#;
        let block = try_parse_special_tool("Bash", input);
        assert!(block.is_none());
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd ai-backend && cargo test normalizer::parser`
Expected: All 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add ai-backend/src/normalizer/parser.rs
git commit -m "feat: add normalizer parser for Claude events → ContentBlocks"
```

---

## Chunk 4: Wire Up Session Manager to Claude API

### Task 10: Connect SessionManager to Claude Client + Stream

**Files:**
- Modify: `ai-backend/src/session/manager.rs`

Replace the stub `send()` method with real Claude API calls.

- [ ] **Step 1: Update SessionManager::send to call Claude API**

Replace the `send` method in `ai-backend/src/session/manager.rs`:

```rust
pub async fn send(
    &mut self,
    session_id: &str,
    text: &str,
    event_tx: mpsc::UnboundedSender<OutgoingMessage>,
) -> Result<(), SessionError> {
    let inner = self.inner.lock().unwrap();
    let session = inner.sessions.get(session_id)
        .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;
    let api_key = inner.api_key.clone()
        .ok_or(SessionError::NoApiKey)?;

    // Build API messages from current history
    let api_messages: Vec<crate::claude::types::ApiMessage> = session.messages.iter()
        .map(|m| crate::claude::types::ApiMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    let model = session.model.clone();
    let max_tokens = session.max_tokens;
    let sid = session_id.to_string();
    drop(inner); // Release lock before async work

    // Append user message
    {
        let mut inner = self.inner.lock().unwrap();
        let session = inner.sessions.get_mut(session_id).unwrap();
        session.messages.push(ChatMessage {
            role: "user".into(),
            content: text.to_string(),
        });
    }

    // Add user message to API request
    let mut api_messages = api_messages;
    api_messages.push(crate::claude::types::ApiMessage {
        role: "user".into(),
        content: text.to_string(),
    });

    // Clone Arc for the spawned task to append assistant message
    let inner_ref = self.inner.clone();

    // Spawn streaming task
    tokio::spawn(async move {
        let client = crate::claude::client::ClaudeClient::new(api_key);

        let response = match client.stream_message(&model, api_messages, max_tokens).await {
            Ok(r) => r,
            Err(e) => {
                let _ = event_tx.send(crate::protocol::Event::new("message.error", serde_json::json!({
                    "session_id": sid,
                    "error": { "code": 503, "message": format!("network error: {}", e) },
                })));
                return;
            }
        };

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let code = if status == 401 { 401 } else { status as i32 };
            let body = response.text().await.unwrap_or_default();
            let _ = event_tx.send(crate::protocol::Event::new("message.error", serde_json::json!({
                "session_id": sid,
                "error": { "code": code, "message": body },
            })));
            return;
        }

        // Parse SSE stream
        let byte_stream = response.bytes_stream();
        let (sse_tx, sse_rx) = mpsc::unbounded_channel();

        let stream_event_tx = event_tx.clone();
        let stream_sid = sid.clone();

        // SSE parser task
        tokio::spawn(async move {
            crate::claude::stream::parse_sse_stream(byte_stream, sse_tx).await;
        });

        // Normalizer task — returns accumulated assistant text
        let assistant_text = crate::normalizer::parser::process_stream(
            &stream_sid, sse_rx, stream_event_tx
        ).await;

        // Append assistant message to session history for multi-turn context
        if !assistant_text.is_empty() {
            let mut inner = inner_ref.lock().unwrap();
            if let Some(session) = inner.sessions.get_mut(&sid) {
                session.messages.push(ChatMessage {
                    role: "assistant".into(),
                    content: assistant_text,
                });
            }
        }
    });

    Ok(())
}
```

- [ ] **Step 2: Add `reqwest::Response::bytes_stream` support — verify `reqwest` has `stream` feature**

Already in Cargo.toml: `reqwest = { version = "0.12", features = ["stream"] }`

- [ ] **Step 3: Verify it compiles**

Run: `cd ai-backend && cargo build`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/session/manager.rs
git commit -m "feat: wire session manager to Claude API streaming"
```

---

## Chunk 5: Electron Setup

### Task 11: Install Electron + electron-vite Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install electron and electron-vite**

```bash
cd /Users/lion268li/repos/toutiao/demo/ai-studio-infinite-canvas/.claude/worktrees/mumu
npm install --save-dev electron electron-vite @electron-toolkit/preload @electron-toolkit/utils
npm install electron-store
```

- [ ] **Step 2: Add electron scripts to package.json**

Add to `scripts`:
```json
{
  "dev:electron": "electron-vite dev",
  "build:electron": "electron-vite build",
  "preview:electron": "electron-vite preview"
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add Electron and electron-vite dependencies"
```

---

### Task 12: electron-vite Config

**Files:**
- Create: `electron.vite.config.ts`

- [ ] **Step 1: Write electron.vite.config.ts**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/main.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/preload.ts'),
        },
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'index.html'),
        },
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add electron.vite.config.ts
git commit -m "feat: add electron-vite configuration"
```

---

### Task 13: Sidecar Manager

**Files:**
- Create: `electron/sidecar.ts`

Manages the Rust sidecar child process lifecycle: spawn, send, receive, kill.

- [ ] **Step 1: Write sidecar.ts**

```typescript
import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import path from 'path';
import { EventEmitter } from 'events';

interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: any) => void;
}

export class SidecarManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private lineReader: Interface | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private binaryPath: string;

  constructor(binaryPath?: string) {
    super();
    // In dev: use cargo run; in prod: use bundled binary
    this.binaryPath = binaryPath || this.getDefaultBinaryPath();
  }

  private getDefaultBinaryPath(): string {
    // In development, use the cargo-built binary
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      return path.join(__dirname, '..', 'ai-backend', 'target', 'debug', 'ai-backend');
    }
    // In production, binary is bundled alongside the app
    return path.join(process.resourcesPath!, 'ai-backend');
  }

  spawn(env?: Record<string, string>): void {
    if (this.process) {
      return;
    }

    const isDev = process.env.NODE_ENV !== 'production';

    if (isDev) {
      // In dev, run cargo build first if binary doesn't exist, then spawn
      this.process = spawn(this.binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
      });
    } else {
      this.process = spawn(this.binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
      });
    }

    // Read stdout line by line
    this.lineReader = createInterface({
      input: this.process.stdout!,
      crlfDelay: Infinity,
    });

    this.lineReader.on('line', (line: string) => {
      this.handleLine(line);
    });

    // Handle stderr (logging)
    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[sidecar stderr]', data.toString());
    });

    // Handle process exit
    this.process.on('close', (code: number | null) => {
      console.log(`[sidecar] exited with code ${code}`);
      this.process = null;
      this.lineReader = null;

      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error('sidecar crashed'));
      }
      this.pendingRequests.clear();

      this.emit('crashed', code);
    });
  }

  private handleLine(line: string): void {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.id && (msg.result !== undefined || msg.error !== undefined)) {
      // Response to a pending request
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(msg.error);
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (msg.event) {
      // Streaming event — broadcast
      this.emit('event', msg.event, msg.data);
    }
  }

  async invoke(method: string, params: any = {}): Promise<any> {
    if (!this.process || !this.process.stdin) {
      throw new Error('sidecar not running');
    }

    const id = `req_${++this.requestCounter}`;
    const request = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process!.stdin!.write(request + '\n');
    });
  }

  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isRunning(): boolean {
    return this.process !== null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/sidecar.ts
git commit -m "feat: add sidecar manager for Rust child process"
```

---

### Task 14: Preload Script

**Files:**
- Create: `electron/preload.ts`

Exposes `window.aiBackend` API via contextBridge.

- [ ] **Step 1: Write preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

export type EventCallback = (data: any) => void;

contextBridge.exposeInMainWorld('aiBackend', {
  invoke: (method: string, params?: any): Promise<any> => {
    return ipcRenderer.invoke('sidecar:invoke', method, params);
  },

  on: (event: string, callback: EventCallback): void => {
    const handler = (_: any, eventName: string, data: any) => {
      if (eventName === event) {
        callback(data);
      }
    };
    ipcRenderer.on('sidecar:event', handler);
    // Store handler for cleanup
    (callback as any).__handler = handler;
  },

  off: (event: string, callback: EventCallback): void => {
    const handler = (callback as any).__handler;
    if (handler) {
      ipcRenderer.removeListener('sidecar:event', handler);
    }
  },

  onAll: (callback: (event: string, data: any) => void): void => {
    ipcRenderer.on('sidecar:event', (_, eventName, data) => {
      callback(eventName, data);
    });
  },
});
```

- [ ] **Step 2: Add type declaration for renderer**

Create `src/types/electron.d.ts`:

```typescript
interface AiBackend {
  invoke(method: string, params?: any): Promise<any>;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
  onAll(callback: (event: string, data: any) => void): void;
}

interface Window {
  aiBackend: AiBackend;
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts src/types/electron.d.ts
git commit -m "feat: add preload script and aiBackend type declarations"
```

---

### Task 15: Electron Main Process

**Files:**
- Create: `electron/main.ts`

Main process: creates window, spawns sidecar, bridges IPC.

- [ ] **Step 1: Write main.ts**

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { SidecarManager } from './sidecar';

const store = new Store<{ anthropicApiKey?: string }>();

let mainWindow: BrowserWindow | null = null;
let sidecar: SidecarManager | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1A1A2E',
  });

  // In dev, load from vite dev server; in prod, load built files
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getSidecarEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  // Priority: electron-store > env var
  const storedKey = store.get('anthropicApiKey');
  const envKey = process.env.ANTHROPIC_API_KEY;
  const apiKey = storedKey || envKey;
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
  }
  return env;
}

function startSidecar(): void {
  sidecar = new SidecarManager();

  sidecar.spawn(getSidecarEnv());

  // Forward sidecar events to renderer
  sidecar.on('event', (eventName: string, data: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sidecar:event', eventName, data);
    }
  });

  // Handle sidecar crashes — respawn with persisted API key
  sidecar.on('crashed', (code: number | null) => {
    console.log(`[main] sidecar crashed with code ${code}, restarting...`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sidecar:event', 'sidecar.restarted', {});
    }
    setTimeout(() => {
      if (sidecar) {
        sidecar.spawn(getSidecarEnv());
      }
    }, 1000);
  });
}

// IPC handler: bridge renderer invoke calls to sidecar
ipcMain.handle('sidecar:invoke', async (_, method: string, params: any) => {
  if (!sidecar || !sidecar.isRunning()) {
    throw new Error('sidecar not running');
  }

  // Persist API key to electron-store when set via protocol
  if (method === 'config.set_api_key' && params?.api_key) {
    store.set('anthropicApiKey', params.api_key);
  }

  return sidecar.invoke(method, params);
});

app.whenReady().then(() => {
  startSidecar();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  sidecar?.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 2: Verify electron-vite build works**

Run: `npx electron-vite build`
Expected: Builds main, preload, and renderer successfully (or with minor config tweaks)

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add Electron main process with sidecar integration"
```

---

## Chunk 6: Frontend Integration

### Task 16: Backend Service Layer

**Files:**
- Create: `src/services/backend.ts`

Wraps `window.aiBackend` into a typed service for the React frontend.

- [ ] **Step 1: Write backend.ts**

```typescript
import { ContentBlock, Message } from '../types';

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.aiBackend !== undefined;

export interface BackendSession {
  sessionId: string;
}

export const backend = {
  async createSession(model: string, history?: Message[]): Promise<string> {
    if (!isElectron) {
      // Fallback for browser dev — return fake id
      return `mock-${Date.now()}`;
    }
    const result = await window.aiBackend.invoke('session.create', {
      model,
      history: history?.map(m => ({ role: m.role, content: m.content })),
    });
    return result.session_id;
  },

  async sendMessage(sessionId: string, text: string): Promise<void> {
    if (!isElectron) return;
    await window.aiBackend.invoke('session.send', {
      session_id: sessionId,
      text,
    });
  },

  async killSession(sessionId: string): Promise<void> {
    if (!isElectron) return;
    await window.aiBackend.invoke('session.kill', {
      session_id: sessionId,
    });
  },

  async setApiKey(apiKey: string): Promise<void> {
    if (!isElectron) return;
    await window.aiBackend.invoke('config.set_api_key', {
      api_key: apiKey,
    });
  },

  async listSessions(): Promise<any[]> {
    if (!isElectron) return [];
    const result = await window.aiBackend.invoke('session.list');
    return result.sessions;
  },

  async ping(): Promise<boolean> {
    if (!isElectron) return true;
    try {
      await window.aiBackend.invoke('ping');
      return true;
    } catch {
      return false;
    }
  },

  onBlockStart(callback: (data: { session_id: string; block_index: number; block: ContentBlock }) => void): void {
    if (!isElectron) return;
    window.aiBackend.on('block.start', callback);
  },

  onBlockDelta(callback: (data: { session_id: string; block_index: number; delta: any }) => void): void {
    if (!isElectron) return;
    window.aiBackend.on('block.delta', callback);
  },

  onBlockStop(callback: (data: { session_id: string; block_index: number }) => void): void {
    if (!isElectron) return;
    window.aiBackend.on('block.stop', callback);
  },

  onMessageComplete(callback: (data: { session_id: string; usage?: any }) => void): void {
    if (!isElectron) return;
    window.aiBackend.on('message.complete', callback);
  },

  onMessageError(callback: (data: { session_id: string; error: { code: number; message: string } }) => void): void {
    if (!isElectron) return;
    window.aiBackend.on('message.error', callback);
  },

  onSidecarRestarted(callback: () => void): void {
    if (!isElectron) return;
    window.aiBackend.on('sidecar.restarted', callback);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/services/backend.ts
git commit -m "feat: add backend service layer for Electron IPC"
```

---

### Task 17: Update SessionWindow to Use Backend

**Files:**
- Modify: `src/components/SessionWindow.tsx`

Replace mock responses with real backend calls. Keep mock fallback when not in Electron.

- [ ] **Step 1: Add backendSessionId tracking to SessionWindow**

At the top of `SessionWindow.tsx`, add import and state:

```typescript
import { backend } from '../services/backend';
```

Add new state/ref inside the component:

```typescript
const [backendSessionId, setBackendSessionId] = useState<string | null>(null);
const backendSessionIdRef = useRef<string | null>(null);
```

- [ ] **Step 2: Add useEffect to register backend event listeners**

Add a useEffect that listens for block events and updates messages:

```typescript
useEffect(() => {
  const isElectron = typeof window !== 'undefined' && window.aiBackend !== undefined;
  if (!isElectron) return;

  // Track blocks being built for the current assistant message
  const blockMap = new Map<number, ContentBlock>();

  const handleBlockStart = (data: { session_id: string; block_index: number; block: ContentBlock }) => {
    if (data.session_id !== backendSessionIdRef.current) return;
    blockMap.set(data.block_index, { ...data.block });
    updateAssistantBlocks(blockMap);
  };

  const handleBlockDelta = (data: { session_id: string; block_index: number; delta: any }) => {
    if (data.session_id !== backendSessionIdRef.current) return;
    const block = blockMap.get(data.block_index);
    if (!block) return;

    if (block.type === 'text' && data.delta.content) {
      (block as any).content += data.delta.content;
    } else if (block.type === 'code' && data.delta.content) {
      (block as any).code += data.delta.content;
    } else if (block.type === 'tool_call' && data.delta.args) {
      (block as any).args += data.delta.args;
    }
    blockMap.set(data.block_index, { ...block });
    updateAssistantBlocks(blockMap);
  };

  const handleBlockStop = (data: { session_id: string; block_index: number }) => {
    if (data.session_id !== backendSessionIdRef.current) return;
    const block = blockMap.get(data.block_index);
    if (block && block.type === 'tool_call') {
      (block as any).status = 'done';
      blockMap.set(data.block_index, { ...block });
      updateAssistantBlocks(blockMap);
    }
  };

  const handleMessageComplete = (data: { session_id: string }) => {
    if (data.session_id !== backendSessionIdRef.current) return;
    setIsStreaming(false);
    setStreamingMessageId(null);
    isStreamingRef.current = false;
    blockMap.clear();
  };

  const handleMessageError = (data: { session_id: string; error: { code: number; message: string } }) => {
    if (data.session_id !== backendSessionIdRef.current) return;
    setIsStreaming(false);
    setStreamingMessageId(null);
    isStreamingRef.current = false;
    blockMap.clear();
    // Could show error to user
    console.error('[backend error]', data.error);
  };

  const updateAssistantBlocks = (blocks: Map<number, ContentBlock>) => {
    const sortedBlocks = Array.from(blocks.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, block]) => block);

    const updated = {
      ...sessionRef.current,
      messages: sessionRef.current.messages.map(m =>
        m.id === streamingMessageIdRef.current
          ? { ...m, blocks: sortedBlocks }
          : m
      ),
    };
    sessionRef.current = updated;
    onUpdate(updated);
  };

  backend.onBlockStart(handleBlockStart);
  backend.onBlockDelta(handleBlockDelta);
  backend.onBlockStop(handleBlockStop);
  backend.onMessageComplete(handleMessageComplete);
  backend.onMessageError(handleMessageError);
}, []);
```

Note: We need to add `streamingMessageIdRef`:

```typescript
const streamingMessageIdRef = useRef<string | null>(null);
```

And update `setStreamingMessageId` calls to also update the ref.

- [ ] **Step 3: Update handleSend to use backend when available**

Replace `handleSend` body with:

```typescript
const handleSend = async () => {
  if (!inputValue.trim() || isStreaming) return;

  const userMsg: Message = {
    id: Date.now().toString(),
    role: 'user',
    content: inputValue,
    type: 'text'
  };

  const aiMsgId = (Date.now() + 1).toString();
  const aiMsg: Message = {
    id: aiMsgId,
    role: 'assistant',
    content: '',
    type: 'text',
    blocks: []
  };

  const updatedMessages = [...sessionRef.current.messages, userMsg, aiMsg];
  const updatedSession = {
    ...sessionRef.current,
    status: 'inprocess' as const,
    messages: updatedMessages
  };

  sessionRef.current = updatedSession;
  onUpdate(updatedSession);

  setInputValue('');
  setIsStreaming(true);
  setStreamingMessageId(aiMsgId);
  streamingMessageIdRef.current = aiMsgId;
  isStreamingRef.current = true;

  const isElectron = typeof window !== 'undefined' && window.aiBackend !== undefined;

  if (isElectron) {
    // Create backend session if not already created
    if (!backendSessionIdRef.current) {
      const sid = await backend.createSession(session.model);
      backendSessionIdRef.current = sid;
      setBackendSessionId(sid);
    }
    // Send to backend — events will update UI via the useEffect listeners
    try {
      await backend.sendMessage(backendSessionIdRef.current, inputValue);
    } catch (e) {
      setIsStreaming(false);
      setStreamingMessageId(null);
      streamingMessageIdRef.current = null;
      isStreamingRef.current = false;
      console.error('[send error]', e);
    }
  } else {
    // Mock fallback for browser dev
    const mockResponse = STRUCTURED_MOCK_RESPONSES[mockResponseIndex++ % STRUCTURED_MOCK_RESPONSES.length];
    await streamBlockResponse(aiMsgId, mockResponse.blocks);

    setIsStreaming(false);
    setStreamingMessageId(null);
    streamingMessageIdRef.current = null;
    isStreamingRef.current = false;
    onUpdate({
      ...sessionRef.current,
      status: 'review',
      diff: generateMockDiff()
    });
  }
};
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors (may need minor adjustments)

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat: integrate SessionWindow with Rust backend via IPC"
```

---

### Task 18: Build Rust Binary for Development

**Files:**
- Modify: `package.json`

Add a script to build the Rust binary before starting Electron dev.

- [ ] **Step 1: Add build:rust script to package.json**

```json
{
  "scripts": {
    "build:rust": "cd ai-backend && cargo build",
    "dev:electron": "npm run build:rust && electron-vite dev",
    "build:electron": "npm run build:rust -- --release && electron-vite build"
  }
}
```

- [ ] **Step 2: Verify end-to-end**

Run: `npm run build:rust`
Expected: Rust binary built at `ai-backend/target/debug/ai-backend`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add Rust build script to package.json"
```

---

### Task 19: End-to-End Smoke Test

- [ ] **Step 1: Build everything**

```bash
npm run build:rust
npx electron-vite build
```

- [ ] **Step 2: Test the Rust sidecar standalone**

```bash
echo '{"id":"1","method":"ping"}' | ./ai-backend/target/debug/ai-backend
```

Expected: Output contains `"pong":true`

- [ ] **Step 3: Test session creation**

```bash
echo '{"id":"2","method":"session.create","params":{"model":"claude-sonnet-4-20250514"}}' | ./ai-backend/target/debug/ai-backend
```

Expected: Output contains `"session_id":"<uuid>"`

- [ ] **Step 4: Start Electron in dev mode (manual verification)**

```bash
ANTHROPIC_API_KEY=your-key-here npm run dev:electron
```

Expected: Electron window opens, app loads the canvas UI. Sending a message should stream Claude's response in real-time.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete AI Studio Electron + Rust sidecar integration"
```
