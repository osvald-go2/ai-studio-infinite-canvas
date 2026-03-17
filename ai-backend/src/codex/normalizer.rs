use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::json;
use tokio::sync::mpsc;

use super::types::{CodexEvent, CodexItem};
use crate::protocol::{Event, OutgoingMessage};
use crate::session::manager::ActiveSession;

/// Convert a Codex JSONL event stream into the unified block protocol that the
/// frontend already understands (block.start / block.delta / block.stop /
/// message.complete / message.error / session.init).
///
/// # Arguments
/// * `session_id`    — the backend session id (UUID)
/// * `event_rx`      — CodexEvent channel produced by `CodexProcess::spawn`
/// * `stderr_rx`     — stderr line channel (for error reporting)
/// * `event_tx`      — outgoing event channel consumed by main stdout writer
/// * `codex_tid_slot` — shared slot; we write the Codex thread_id here so the
///                       session manager can persist it
/// * `sessions_arc`  — handle to the sessions HashMap so we can clear the
///                       CodexProcess reference once the stream ends
pub async fn process_codex_stream(
    session_id: &str,
    mut event_rx: mpsc::UnboundedReceiver<CodexEvent>,
    mut stderr_rx: mpsc::UnboundedReceiver<String>,
    event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    codex_tid_slot: Arc<Mutex<Option<String>>>,
    sessions_arc: Arc<Mutex<HashMap<String, ActiveSession>>>,
) {
    let mut block_index: usize = 0;
    let mut turn_completed = false;
    // Track items that received an ItemStarted event, keyed by item id.
    // Codex often skips ItemStarted and only sends ItemCompleted.
    let mut started_items: std::collections::HashSet<String> = std::collections::HashSet::new();

    while let Some(event) = event_rx.recv().await {
        match event {
            // ── thread.started ─────────────────────────────────────────
            CodexEvent::ThreadStarted { thread_id } => {
                if let Some(ref tid) = thread_id {
                    *codex_tid_slot.lock().unwrap() = Some(tid.clone());
                }
                let _ = event_tx.send(Event::new(
                    "session.init",
                    json!({
                        "session_id": session_id,
                        "agent": "codex",
                        "codex_thread_id": thread_id,
                    }),
                ));
            }

            // ── turn.started ───────────────────────────────────────────
            CodexEvent::TurnStarted {} => {
                // No event emitted — just resets per-turn state if needed.
            }

            // ── item.started ───────────────────────────────────────────
            CodexEvent::ItemStarted { item } => {
                if let Some(block) = item_started_block(&item) {
                    if let Some(id) = &item.id {
                        started_items.insert(id.clone());
                    }
                    let _ = event_tx.send(Event::new(
                        "block.start",
                        json!({
                            "session_id": session_id,
                            "block_index": block_index,
                            "block": block,
                            "agent": "codex",
                        }),
                    ));
                    block_index += 1;
                }
                // reasoning items are silently dropped (item_started_block returns None)
            }

            // ── item.completed ─────────────────────────────────────────
            CodexEvent::ItemCompleted { item } => {
                let item_type = item.item_type.as_deref().unwrap_or("");
                if item_type == "reasoning" {
                    continue; // dropped
                }

                // Codex often skips item.started and only sends item.completed.
                // If we never saw an ItemStarted for this item, synthesise block.start.
                let already_started = item.id.as_ref()
                    .map(|id| started_items.contains(id))
                    .unwrap_or(false);

                if !already_started {
                    if let Some(block) = item_started_block(&item) {
                        let _ = event_tx.send(Event::new(
                            "block.start",
                            json!({
                                "session_id": session_id,
                                "block_index": block_index,
                                "block": block,
                                "agent": "codex",
                            }),
                        ));
                        block_index += 1;
                    }
                }

                let (delta_content, status) = item_completed_content(&item);

                // Emit block.delta with the final content / output
                if let Some(content) = delta_content {
                    let target_index = if block_index > 0 { block_index - 1 } else { 0 };
                    let _ = event_tx.send(Event::new(
                        "block.delta",
                        json!({
                            "session_id": session_id,
                            "block_index": target_index,
                            "delta": content,
                            "agent": "codex",
                        }),
                    ));
                }

                // Emit block.stop
                if block_index > 0 {
                    let target_index = block_index - 1;
                    let _ = event_tx.send(Event::new(
                        "block.stop",
                        json!({
                            "session_id": session_id,
                            "block_index": target_index,
                            "status": status,
                            "agent": "codex",
                        }),
                    ));
                }
            }

            // ── turn.completed ─────────────────────────────────────────
            CodexEvent::TurnCompleted { usage } => {
                turn_completed = true;
                let mut data = json!({
                    "session_id": session_id,
                    "agent": "codex",
                });
                if let Some(u) = usage {
                    data["usage"] = json!({
                        "input_tokens": u.input_tokens,
                        "output_tokens": u.output_tokens,
                        "cached_input_tokens": u.cached_input_tokens,
                    });
                }
                let _ = event_tx.send(Event::new("message.complete", data));
            }

            // ── Unknown events ─────────────────────────────────────────
            CodexEvent::Unknown => {
                // Silently dropped
            }
        }
    }

    // ── Post-stream cleanup ────────────────────────────────────────────

    // If we never received turn.completed the process likely crashed —
    // collect any remaining stderr and send a message.error.
    if !turn_completed {
        let mut stderr_lines: Vec<String> = Vec::new();
        while let Ok(line) = stderr_rx.try_recv() {
            stderr_lines.push(line);
        }
        let detail = if stderr_lines.is_empty() {
            "Codex process ended without completing".to_string()
        } else {
            stderr_lines.join("\n")
        };
        let _ = event_tx.send(Event::new(
            "message.error",
            json!({
                "session_id": session_id,
                "error": detail,
                "agent": "codex",
            }),
        ));
    }

    // Clear the codex process reference so SessionManager knows it's gone.
    {
        let mut sessions = sessions_arc.lock().unwrap();
        if let Some(active) = sessions.get_mut(session_id) {
            active.codex_process = None;
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/// Map an `item.started` event to a frontend block, or `None` to drop it.
fn item_started_block(item: &CodexItem) -> Option<serde_json::Value> {
    let item_type = item.item_type.as_deref().unwrap_or("");

    match item_type {
        // Agent text message
        "agent_message" | "message" => Some(json!({
            "type": "text",
            "content": item.text.as_deref().unwrap_or(""),
        })),

        // Shell command execution
        "command_execution" | "function_call_output" => {
            let cmd = item.command.as_deref().unwrap_or("...");
            Some(json!({
                "type": "tool_call",
                "tool": "Bash",
                "args": format!("$ {}", cmd),
                "status": "running",
            }))
        }

        // File edits
        "file_change" | "file_edit" => {
            let filename = item.filename.as_deref().unwrap_or("file");
            Some(json!({
                "type": "tool_call",
                "tool": "Edit",
                "args": filename,
                "status": "running",
            }))
        }

        // MCP tool calls
        "mcp_tool_call" => {
            let tool_name = item.id.as_deref().unwrap_or("mcp_tool");
            Some(json!({
                "type": "tool_call",
                "tool": tool_name,
                "args": item.content.as_ref().map(|v| v.to_string()).unwrap_or_default(),
                "status": "running",
            }))
        }

        // Reasoning / thinking — drop silently
        "reasoning" => None,

        // Anything else we don't recognise — drop silently
        _ => None,
    }
}

/// Extract the delta content and a status string from an `item.completed` event.
fn item_completed_content(item: &CodexItem) -> (Option<serde_json::Value>, &'static str) {
    let item_type = item.item_type.as_deref().unwrap_or("");

    match item_type {
        "agent_message" | "message" => {
            let text = item.text.as_deref().unwrap_or("");
            (Some(json!({ "content": text })), "done")
        }

        "command_execution" | "function_call_output" => {
            let output = item.output.as_deref().unwrap_or("");
            let status = match item.exit_code {
                Some(0) | None => "done",
                Some(_) => "error",
            };
            (Some(json!({ "output": output, "exit_code": item.exit_code })), status)
        }

        "file_change" | "file_edit" => {
            let status = item.status.as_deref().unwrap_or("done");
            let s = if status == "completed" || status == "success" { "done" } else { status };
            // Borrow checker: return a 'static str for the common cases
            let static_status = match s {
                "done" => "done",
                "error" => "error",
                _ => "done",
            };
            (
                Some(json!({
                    "filename": item.filename.as_deref().unwrap_or(""),
                    "content": item.content,
                })),
                static_status,
            )
        }

        "mcp_tool_call" => {
            (
                Some(json!({ "output": item.output, "content": item.content })),
                "done",
            )
        }

        // Reasoning completed — still dropped
        "reasoning" => (None, "done"),

        _ => (None, "done"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codex::types::{CodexEvent, CodexItem, CodexUsage};
    use tokio::sync::mpsc;

    /// Helper: run the normalizer on a sequence of events and collect the output.
    async fn run_normalizer(events: Vec<CodexEvent>) -> Vec<OutgoingMessage> {
        let (evt_tx, evt_rx) = mpsc::unbounded_channel::<CodexEvent>();
        let (_stderr_tx, stderr_rx) = mpsc::unbounded_channel::<String>();
        let (out_tx, mut out_rx) = mpsc::unbounded_channel::<OutgoingMessage>();
        let tid_slot = Arc::new(Mutex::new(None::<String>));
        let sessions: Arc<Mutex<HashMap<String, ActiveSession>>> =
            Arc::new(Mutex::new(HashMap::new()));

        for e in events {
            evt_tx.send(e).unwrap();
        }
        drop(evt_tx);

        process_codex_stream("s1", evt_rx, stderr_rx, out_tx, tid_slot, sessions).await;

        let mut out = Vec::new();
        while let Ok(msg) = out_rx.try_recv() {
            out.push(msg);
        }
        out
    }

    fn event_json(msg: &OutgoingMessage) -> serde_json::Value {
        serde_json::to_value(msg).unwrap()
    }

    #[tokio::test]
    async fn test_thread_started_emits_session_init() {
        let events = vec![
            CodexEvent::ThreadStarted {
                thread_id: Some("tid_abc".into()),
            },
            CodexEvent::TurnCompleted { usage: None },
        ];
        let out = run_normalizer(events).await;
        assert!(out.len() >= 1);
        let j = event_json(&out[0]);
        assert_eq!(j["event"], "session.init");
        assert_eq!(j["data"]["agent"], "codex");
        assert_eq!(j["data"]["codex_thread_id"], "tid_abc");
    }

    #[tokio::test]
    async fn test_agent_message_produces_text_block() {
        // Test with ItemStarted + ItemCompleted (same id → no duplicate block.start)
        let events = vec![
            CodexEvent::ItemStarted {
                item: CodexItem {
                    id: Some("item_0".into()),
                    item_type: Some("agent_message".into()),
                    status: None,
                    text: Some("Hello!".into()),
                    command: None,
                    output: None,
                    exit_code: None,
                    filename: None,
                    content: None,
                },
            },
            CodexEvent::ItemCompleted {
                item: CodexItem {
                    id: Some("item_0".into()),
                    item_type: Some("agent_message".into()),
                    status: None,
                    text: Some("Hello!".into()),
                    command: None,
                    output: None,
                    exit_code: None,
                    filename: None,
                    content: None,
                },
            },
            CodexEvent::TurnCompleted { usage: None },
        ];
        let out = run_normalizer(events).await;

        // block.start, block.delta, block.stop, message.complete
        let start = event_json(&out[0]);
        assert_eq!(start["event"], "block.start");
        assert_eq!(start["data"]["block"]["type"], "text");

        let delta = event_json(&out[1]);
        assert_eq!(delta["event"], "block.delta");
        assert_eq!(delta["data"]["delta"]["content"], "Hello!");

        let stop = event_json(&out[2]);
        assert_eq!(stop["event"], "block.stop");
        assert_eq!(stop["data"]["status"], "done");
    }

    #[tokio::test]
    async fn test_item_completed_without_started_synthesizes_block() {
        // Real Codex behavior: only item.completed, no item.started
        let events = vec![
            CodexEvent::ThreadStarted { thread_id: Some("tid".into()) },
            CodexEvent::TurnStarted {},
            CodexEvent::ItemCompleted {
                item: CodexItem {
                    id: Some("item_0".into()),
                    item_type: Some("agent_message".into()),
                    status: None,
                    text: Some("Hi!".into()),
                    command: None,
                    output: None,
                    exit_code: None,
                    filename: None,
                    content: None,
                },
            },
            CodexEvent::TurnCompleted { usage: None },
        ];
        let out = run_normalizer(events).await;

        // session.init, block.start (synthesized), block.delta, block.stop, message.complete
        let init = event_json(&out[0]);
        assert_eq!(init["event"], "session.init");

        let start = event_json(&out[1]);
        assert_eq!(start["event"], "block.start");
        assert_eq!(start["data"]["block"]["type"], "text");

        let delta = event_json(&out[2]);
        assert_eq!(delta["event"], "block.delta");
        assert_eq!(delta["data"]["delta"]["content"], "Hi!");

        let stop = event_json(&out[3]);
        assert_eq!(stop["event"], "block.stop");
        assert_eq!(stop["data"]["status"], "done");
    }

    #[tokio::test]
    async fn test_command_execution_produces_bash_tool_call() {
        let events = vec![
            CodexEvent::ItemStarted {
                item: CodexItem {
                    id: None,
                    item_type: Some("command_execution".into()),
                    status: None,
                    text: None,
                    command: Some("ls -la".into()),
                    output: None,
                    exit_code: None,
                    filename: None,
                    content: None,
                },
            },
            CodexEvent::ItemCompleted {
                item: CodexItem {
                    id: None,
                    item_type: Some("command_execution".into()),
                    status: None,
                    text: None,
                    command: Some("ls -la".into()),
                    output: Some("total 42\n".into()),
                    exit_code: Some(0),
                    filename: None,
                    content: None,
                },
            },
            CodexEvent::TurnCompleted { usage: None },
        ];
        let out = run_normalizer(events).await;
        let start = event_json(&out[0]);
        assert_eq!(start["data"]["block"]["tool"], "Bash");
        assert_eq!(start["data"]["block"]["args"], "$ ls -la");
    }

    #[tokio::test]
    async fn test_file_edit_produces_edit_tool_call() {
        let events = vec![
            CodexEvent::ItemStarted {
                item: CodexItem {
                    id: None,
                    item_type: Some("file_edit".into()),
                    status: None,
                    text: None,
                    command: None,
                    output: None,
                    exit_code: None,
                    filename: Some("src/main.rs".into()),
                    content: None,
                },
            },
            CodexEvent::ItemCompleted {
                item: CodexItem {
                    id: None,
                    item_type: Some("file_edit".into()),
                    status: Some("completed".into()),
                    text: None,
                    command: None,
                    output: None,
                    exit_code: None,
                    filename: Some("src/main.rs".into()),
                    content: None,
                },
            },
            CodexEvent::TurnCompleted { usage: None },
        ];
        let out = run_normalizer(events).await;
        let start = event_json(&out[0]);
        assert_eq!(start["data"]["block"]["tool"], "Edit");
        assert_eq!(start["data"]["block"]["args"], "src/main.rs");
    }

    #[tokio::test]
    async fn test_reasoning_is_dropped() {
        let events = vec![
            CodexEvent::ItemStarted {
                item: CodexItem {
                    id: None,
                    item_type: Some("reasoning".into()),
                    status: None,
                    text: Some("thinking...".into()),
                    command: None,
                    output: None,
                    exit_code: None,
                    filename: None,
                    content: None,
                },
            },
            CodexEvent::ItemCompleted {
                item: CodexItem {
                    id: None,
                    item_type: Some("reasoning".into()),
                    status: None,
                    text: Some("done thinking".into()),
                    command: None,
                    output: None,
                    exit_code: None,
                    filename: None,
                    content: None,
                },
            },
            CodexEvent::TurnCompleted { usage: None },
        ];
        let out = run_normalizer(events).await;
        // Only message.complete should appear — no block events for reasoning
        assert_eq!(out.len(), 1);
        let j = event_json(&out[0]);
        assert_eq!(j["event"], "message.complete");
    }

    #[tokio::test]
    async fn test_turn_completed_with_usage() {
        let events = vec![CodexEvent::TurnCompleted {
            usage: Some(CodexUsage {
                input_tokens: Some(100),
                output_tokens: Some(50),
                cached_input_tokens: Some(10),
            }),
        }];
        let out = run_normalizer(events).await;
        let j = event_json(&out[0]);
        assert_eq!(j["event"], "message.complete");
        assert_eq!(j["data"]["usage"]["input_tokens"], 100);
        assert_eq!(j["data"]["usage"]["output_tokens"], 50);
    }

    #[tokio::test]
    async fn test_no_turn_completed_emits_error() {
        // Stream ends without turn.completed → should get message.error
        let events = vec![CodexEvent::ItemStarted {
            item: CodexItem {
                id: None,
                item_type: Some("agent_message".into()),
                status: None,
                text: Some("partial".into()),
                command: None,
                output: None,
                exit_code: None,
                filename: None,
                content: None,
            },
        }];
        let out = run_normalizer(events).await;

        let last = event_json(out.last().unwrap());
        assert_eq!(last["event"], "message.error");
        assert_eq!(last["data"]["agent"], "codex");
    }

    #[tokio::test]
    async fn test_unknown_event_silently_dropped() {
        let events = vec![CodexEvent::Unknown, CodexEvent::TurnCompleted { usage: None }];
        let out = run_normalizer(events).await;
        // Only message.complete
        assert_eq!(out.len(), 1);
        assert_eq!(event_json(&out[0])["event"], "message.complete");
    }

    #[tokio::test]
    async fn test_thread_id_captured_in_slot() {
        let (evt_tx, evt_rx) = mpsc::unbounded_channel::<CodexEvent>();
        let (_stderr_tx, stderr_rx) = mpsc::unbounded_channel::<String>();
        let (out_tx, _out_rx) = mpsc::unbounded_channel::<OutgoingMessage>();
        let tid_slot = Arc::new(Mutex::new(None::<String>));
        let sessions: Arc<Mutex<HashMap<String, ActiveSession>>> =
            Arc::new(Mutex::new(HashMap::new()));

        evt_tx
            .send(CodexEvent::ThreadStarted {
                thread_id: Some("thread_xyz".into()),
            })
            .unwrap();
        evt_tx
            .send(CodexEvent::TurnCompleted { usage: None })
            .unwrap();
        drop(evt_tx);

        let slot = tid_slot.clone();
        process_codex_stream("s1", evt_rx, stderr_rx, out_tx, tid_slot, sessions).await;

        assert_eq!(*slot.lock().unwrap(), Some("thread_xyz".to_string()));
    }
}
