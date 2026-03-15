use serde_json::json;
use tokio::sync::mpsc;

use crate::protocol::{ErrorResponse, OutgoingMessage, Request, Response};
use crate::session::manager::SessionManager;

pub async fn handle_request(
    req: Request,
    session_manager: &mut SessionManager,
    event_tx: mpsc::UnboundedSender<OutgoingMessage>,
) -> OutgoingMessage {
    match req.method.as_str() {
        "ping" => Response::ok(req.id, json!({"pong": true})),

        "config.set_api_key" => {
            let api_key = req
                .params
                .get("api_key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if api_key.is_empty() {
                return ErrorResponse::new(req.id, 1002, "api_key is required".into());
            }
            session_manager.set_api_key(api_key.to_string());
            Response::ok(req.id, json!({"ok": true}))
        }

        "session.create" => {
            let model = req
                .params
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("claude-sonnet-4-20250514")
                .to_string();
            let max_tokens = req
                .params
                .get("max_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(4096) as u32;
            let history = req.params.get("history").cloned();

            let session_id = session_manager.create(model, max_tokens, history);
            Response::ok(req.id, json!({"session_id": session_id}))
        }

        "session.send" => {
            let session_id = req
                .params
                .get("session_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let text = req
                .params
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if session_id.is_empty() || text.is_empty() {
                return ErrorResponse::new(
                    req.id,
                    1002,
                    "session_id and text are required".into(),
                );
            }

            match session_manager
                .send(session_id, text, event_tx.clone())
                .await
            {
                Ok(()) => Response::ok(req.id, json!({"ok": true})),
                Err(e) => ErrorResponse::new(req.id, e.code(), e.to_string()),
            }
        }

        "session.list" => {
            let sessions = session_manager.list();
            Response::ok(req.id, json!({"sessions": sessions}))
        }

        "session.kill" => {
            let session_id = req
                .params
                .get("session_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            session_manager.kill(session_id);
            Response::ok(req.id, json!({"ok": true}))
        }

        _ => ErrorResponse::new(req.id, 1000, format!("unknown method: {}", req.method)),
    }
}
