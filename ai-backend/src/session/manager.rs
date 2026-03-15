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
        _event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    ) -> Result<(), SessionError> {
        let inner = self.inner.lock().unwrap();
        let _session = inner.sessions.get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;
        let _api_key = inner.api_key.clone()
            .ok_or(SessionError::NoApiKey)?;
        drop(inner);

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
