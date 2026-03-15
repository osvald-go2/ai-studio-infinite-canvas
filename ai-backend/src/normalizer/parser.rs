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
