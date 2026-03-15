use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::claude::client::ClaudeProcess;
use crate::protocol::OutgoingMessage;
use super::types::{Session, SessionSummary};

#[derive(Debug)]
pub enum SessionError {
    NotFound(String),
    SpawnFailed(String),
}

impl SessionError {
    pub fn code(&self) -> i32 {
        match self {
            SessionError::NotFound(_) => 1001,
            SessionError::SpawnFailed(_) => 1004,
        }
    }
}

impl std::fmt::Display for SessionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SessionError::NotFound(id) => write!(f, "session not found: {}", id),
            SessionError::SpawnFailed(msg) => write!(f, "spawn failed: {}", msg),
        }
    }
}

/// Each active session holds a reference to the spawned claude process.
pub(crate) struct ActiveSession {
    info: Session,
    claude_process: Option<Arc<ClaudeProcess>>,
    claude_session_id: Option<String>,
}

pub struct SessionManager {
    pub(crate) sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
    working_dir: String,
}

impl SessionManager {
    pub fn new() -> Self {
        // Default working dir is current directory
        let working_dir = std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string());

        SessionManager {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            working_dir,
        }
    }

    pub fn set_api_key(&mut self, _key: String) {
        // No-op: claude CLI handles its own authentication
    }

    pub fn set_working_dir(&mut self, dir: String) {
        self.working_dir = dir;
    }

    pub fn create(
        &mut self,
        model: String,
        max_tokens: u32,
        claude_session_id: Option<String>,
    ) -> String {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        let info = Session {
            id: id.clone(),
            model,
            max_tokens,
            messages: Vec::new(),
            created_at: now,
        };

        let active = ActiveSession {
            info,
            claude_process: None,
            claude_session_id,
        };

        self.sessions.lock().unwrap().insert(id.clone(), active);
        id
    }

    pub async fn send(
        &mut self,
        session_id: &str,
        text: &str,
        event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    ) -> Result<(), SessionError> {
        // Check session exists
        {
            let sessions = self.sessions.lock().unwrap();
            if !sessions.contains_key(session_id) {
                return Err(SessionError::NotFound(session_id.to_string()));
            }
        }

        // Get or spawn claude process for this session
        let claude_process = {
            let mut sessions = self.sessions.lock().unwrap();
            let active = sessions.get_mut(session_id).unwrap();

            if let Some(ref process) = active.claude_process {
                process.clone()
            } else {
                // Spawn new claude CLI process, passing resume ID if available
                let working_dir = self.working_dir.clone();
                let resume_id = active.claude_session_id.as_deref();
                let (process, msg_rx) = ClaudeProcess::spawn(&working_dir, resume_id)
                    .map_err(|e| SessionError::SpawnFailed(e))?;

                let process = Arc::new(process);
                active.claude_process = Some(process.clone());

                // Create shared slot for claude_session_id capture
                let claude_sid_slot = std::sync::Arc::new(std::sync::Mutex::new(None::<String>));
                let slot_clone = claude_sid_slot.clone();

                // Spawn normalizer task to process claude output
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

                process
            }
        };

        // Send user message to claude process
        claude_process.send_message(text).await
            .map_err(|e| SessionError::SpawnFailed(e))?;

        Ok(())
    }

    pub fn list(&self) -> Vec<SessionSummary> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .values()
            .map(|s| SessionSummary {
                id: s.info.id.clone(),
                model: s.info.model.clone(),
                message_count: s.info.messages.len(),
                created_at: s.info.created_at.clone(),
            })
            .collect()
    }

    pub fn kill(&mut self, session_id: &str) {
        self.sessions.lock().unwrap().remove(session_id);
        // ClaudeProcess will be dropped, killing the child process
    }

    /// Create a temporary session with an "ephemeral-" prefixed ID.
    /// Ephemeral sessions are used for one-shot AI tasks (e.g. commit message generation).
    pub fn create_ephemeral_session(&mut self, model: String, max_tokens: u32) -> String {
        let id = format!("ephemeral-{}", uuid::Uuid::new_v4());
        let now = chrono::Utc::now().to_rfc3339();

        let info = super::types::Session {
            id: id.clone(),
            model,
            max_tokens,
            messages: Vec::new(),
            created_at: now,
        };

        let active = ActiveSession {
            info,
            claude_process: None,
            claude_session_id: None,
        };

        self.sessions.lock().unwrap().insert(id.clone(), active);
        id
    }

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

    pub fn get_working_dir(&self) -> &str {
        &self.working_dir
    }

    /// Return a clone of the sessions Arc so callers can schedule deferred cleanup.
    pub(crate) fn sessions_arc(&self) -> std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, ActiveSession>>> {
        self.sessions.clone()
    }
}
