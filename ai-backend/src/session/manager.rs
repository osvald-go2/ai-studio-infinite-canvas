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

pub struct SessionManager {
    pub(crate) inner: Arc<Mutex<SessionManagerInner>>,
}

pub struct SessionManagerInner {
    pub sessions: HashMap<String, Session>,
    pub api_key: Option<String>,
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
                    if role == "system" {
                        continue;
                    }
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
        event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    ) -> Result<(), SessionError> {
        let (api_key, model, max_tokens, mut api_messages) = {
            let inner = self.inner.lock().unwrap();
            let session = inner.sessions.get(session_id)
                .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;
            let api_key = inner.api_key.clone()
                .ok_or(SessionError::NoApiKey)?;

            let api_messages: Vec<crate::claude::types::ApiMessage> = session.messages.iter()
                .map(|m| crate::claude::types::ApiMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                })
                .collect();

            (api_key, session.model.clone(), session.max_tokens, api_messages)
        };

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
        api_messages.push(crate::claude::types::ApiMessage {
            role: "user".into(),
            content: text.to_string(),
        });

        let sid = session_id.to_string();
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

    pub fn list(&self) -> Vec<SessionSummary> {
        let inner = self.inner.lock().unwrap();
        inner
            .sessions
            .values()
            .map(|s| SessionSummary {
                id: s.id.clone(),
                model: s.model.clone(),
                message_count: s.messages.len(),
                created_at: s.created_at.clone(),
            })
            .collect()
    }

    pub fn kill(&mut self, session_id: &str) {
        self.inner.lock().unwrap().sessions.remove(session_id);
    }
}
