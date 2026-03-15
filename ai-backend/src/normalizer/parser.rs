use serde_json::json;
use tokio::sync::mpsc;

use crate::claude::types::{ClaudeJson, ContentBlock};
use crate::protocol::{Event, OutgoingMessage};

/// Known special tool names that map to specific frontend block types
const TOOL_TODO_WRITE: &[&str] = &["TodoWrite", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet"];
const TOOL_AGENT: &str = "Agent";
const TOOL_ASK_USER: &str = "AskUserQuestion";
const TOOL_SKILL: &str = "Skill";

/// Process a stream of ClaudeJson messages and emit protocol events.
///
/// This reads from the claude CLI stdout (via mpsc channel) and converts
/// each message into block.start/block.stop/message.complete events
/// that the frontend understands.
pub async fn process_claude_stream(
    session_id: &str,
    mut msg_rx: mpsc::UnboundedReceiver<ClaudeJson>,
    event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    claude_sid_slot: std::sync::Arc<std::sync::Mutex<Option<String>>>,
) {
    let mut block_index: usize = 0;

    while let Some(msg) = msg_rx.recv().await {
        match msg {
            ClaudeJson::System { subtype, session_id: csid, model, tools, .. } => {
                if subtype == "init" {
                    // Capture the claude session ID into the shared slot
                    if let Some(ref csid_str) = csid {
                        *claude_sid_slot.lock().unwrap() = Some(csid_str.clone());
                        let _ = event_tx.send(Event::new("session.init", json!({
                            "session_id": session_id,
                            "claude_session_id": csid_str,
                        })));
                    }

                    let model_str = model.unwrap_or_default();
                    let tool_count = tools.map(|t| t.len()).unwrap_or(0);
                    // Emit as a text block
                    let _ = event_tx.send(Event::new("block.start", json!({
                        "session_id": session_id,
                        "block_index": block_index,
                        "block": {
                            "type": "text",
                            "content": format!("Connected: {} ({} tools)", model_str, tool_count)
                        },
                    })));
                    let _ = event_tx.send(Event::new("block.stop", json!({
                        "session_id": session_id,
                        "block_index": block_index,
                    })));
                    block_index += 1;
                }
            }

            ClaudeJson::Assistant { message, .. } => {
                for content_block in message.content {
                    match content_block {
                        ContentBlock::Text { text } => {
                            if !text.is_empty() {
                                let _ = event_tx.send(Event::new("block.start", json!({
                                    "session_id": session_id,
                                    "block_index": block_index,
                                    "block": { "type": "text", "content": text },
                                })));
                                let _ = event_tx.send(Event::new("block.stop", json!({
                                    "session_id": session_id,
                                    "block_index": block_index,
                                })));
                                block_index += 1;
                            }
                        }

                        ContentBlock::Thinking { .. } => {
                            // Skip thinking blocks for now
                        }

                        ContentBlock::ToolUse { name, input, .. } => {
                            let block = build_tool_block(&name, &input);
                            let _ = event_tx.send(Event::new("block.start", json!({
                                "session_id": session_id,
                                "block_index": block_index,
                                "block": block,
                            })));
                            // Tool starts as "running" — will be stopped when we get the result
                            block_index += 1;
                        }

                        ContentBlock::ToolResult { is_error, .. } => {
                            // Update the previous tool block status
                            if block_index > 0 {
                                let status = if is_error.unwrap_or(false) { "error" } else { "done" };
                                let _ = event_tx.send(Event::new("block.stop", json!({
                                    "session_id": session_id,
                                    "block_index": block_index - 1,
                                    "status": status,
                                })));
                            }
                        }
                    }
                }
            }

            ClaudeJson::User { message, tool_use_result, .. } => {
                // Process tool results from user messages
                for content_block in message.content {
                    if let ContentBlock::ToolResult { is_error, .. } = content_block {
                        if block_index > 0 {
                            let status = if is_error.unwrap_or(false) { "error" } else { "done" };
                            let _ = event_tx.send(Event::new("block.stop", json!({
                                "session_id": session_id,
                                "block_index": block_index - 1,
                                "status": status,
                            })));
                        }
                    }
                }

                // Emit tool stdout/stderr as text blocks if present
                if let Some(tur) = tool_use_result {
                    if let Some(stdout) = tur.stdout {
                        if !stdout.is_empty() && stdout.len() < 500 {
                            let _ = event_tx.send(Event::new("block.start", json!({
                                "session_id": session_id,
                                "block_index": block_index,
                                "block": { "type": "text", "content": stdout },
                            })));
                            let _ = event_tx.send(Event::new("block.stop", json!({
                                "session_id": session_id,
                                "block_index": block_index,
                            })));
                            block_index += 1;
                        }
                    }
                }
            }

            ClaudeJson::Result { usage, duration_ms, num_turns, is_error, .. } => {
                let mut data = json!({ "session_id": session_id });
                if let Some(u) = usage {
                    data["usage"] = json!({
                        "input_tokens": u.input_tokens,
                        "output_tokens": u.output_tokens,
                    });
                }
                if let Some(ms) = duration_ms {
                    data["duration_ms"] = json!(ms);
                }
                if let Some(turns) = num_turns {
                    data["num_turns"] = json!(turns);
                }
                data["is_error"] = json!(is_error);
                let _ = event_tx.send(Event::new("message.complete", data));
            }
        }
    }
}

/// Build a frontend block from a tool_use content block.
/// Special tools (TodoWrite, Agent, AskUserQuestion, Skill) get their own block types.
/// Generic tools become tool_call blocks.
fn build_tool_block(name: &str, input: &serde_json::Value) -> serde_json::Value {
    if TOOL_TODO_WRITE.contains(&name) {
        let items = input.get("items")
            .or_else(|| input.get("tasks"))
            .and_then(|v| v.as_array());
        if let Some(items) = items {
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
            return json!({ "type": "todolist", "items": todo_items });
        }
    }

    if name == TOOL_AGENT {
        let desc = input.get("description").and_then(|v| v.as_str()).unwrap_or("agent");
        let prompt = input.get("prompt").and_then(|v| v.as_str()).unwrap_or("");
        return json!({
            "type": "subagent",
            "agentId": desc,
            "task": prompt,
            "status": "launched",
        });
    }

    if name == TOOL_ASK_USER {
        let question = input.get("question").and_then(|v| v.as_str()).unwrap_or("");
        return json!({
            "type": "askuser",
            "questions": [{
                "id": uuid::Uuid::new_v4().to_string(),
                "question": question,
            }],
        });
    }

    if name == TOOL_SKILL {
        return json!({
            "type": "skill",
            "skill": input.get("skill").and_then(|v| v.as_str()).unwrap_or(""),
            "args": input.get("args").and_then(|v| v.as_str()),
            "status": "invoking",
        });
    }

    // Generic tool call
    let args = summarize_tool(name, input);
    json!({
        "type": "tool_call",
        "tool": name,
        "args": args,
        "status": "running",
    })
}

fn summarize_tool(name: &str, input: &serde_json::Value) -> String {
    match name {
        "Bash" | "bash" => {
            input.get("command").and_then(|v| v.as_str())
                .map(|c| format!("$ {}", c))
                .unwrap_or_else(|| "$ ...".into())
        }
        "Read" | "read" => {
            input.get("file_path").and_then(|v| v.as_str())
                .map(|p| format!("Read {}", p))
                .unwrap_or_else(|| "Read file".into())
        }
        "Write" | "write" => {
            input.get("file_path").and_then(|v| v.as_str())
                .unwrap_or("file").to_string()
        }
        "Edit" | "edit" => {
            input.get("file_path").and_then(|v| v.as_str())
                .unwrap_or("file").to_string()
        }
        "Glob" | "Grep" => {
            input.get("pattern").and_then(|v| v.as_str())
                .map(|p| format!("{}: {}", name, p))
                .unwrap_or_else(|| name.to_string())
        }
        _ => input.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_tool_block_todolist() {
        let input = serde_json::json!({"items":[{"id":"t1","label":"Do thing","status":"pending"}]});
        let block = build_tool_block("TodoWrite", &input);
        assert_eq!(block["type"], "todolist");
        assert_eq!(block["items"][0]["label"], "Do thing");
    }

    #[test]
    fn test_build_tool_block_agent() {
        let input = serde_json::json!({"description":"research-1","prompt":"find bugs"});
        let block = build_tool_block("Agent", &input);
        assert_eq!(block["type"], "subagent");
        assert_eq!(block["agentId"], "research-1");
    }

    #[test]
    fn test_build_tool_block_askuser() {
        let input = serde_json::json!({"question":"Which approach?"});
        let block = build_tool_block("AskUserQuestion", &input);
        assert_eq!(block["type"], "askuser");
        assert_eq!(block["questions"][0]["question"], "Which approach?");
    }

    #[test]
    fn test_build_tool_block_skill() {
        let input = serde_json::json!({"skill":"brainstorming","args":"--depth=3"});
        let block = build_tool_block("Skill", &input);
        assert_eq!(block["type"], "skill");
        assert_eq!(block["skill"], "brainstorming");
    }

    #[test]
    fn test_build_tool_block_generic() {
        let input = serde_json::json!({"command":"ls -la"});
        let block = build_tool_block("Bash", &input);
        assert_eq!(block["type"], "tool_call");
        assert_eq!(block["tool"], "Bash");
        assert_eq!(block["args"], "$ ls -la");
    }
}
