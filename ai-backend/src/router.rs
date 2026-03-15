use serde_json::json;
use tokio::sync::mpsc;

use crate::protocol::{ErrorResponse, OutgoingMessage, Request, Response};
use crate::session::manager::SessionManager;
use crate::git::{commands as git_cmd, worktree as git_wt};

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

        // ── git commands ────────────────────────────────────────────────────

        "git.check_repo" => {
            let dir = get_dir(&req, session_manager);
            let is_repo = git_cmd::check_repo(&dir);
            Response::ok(req.id, json!({"is_repo": is_repo}))
        }

        "git.init" => {
            let dir = get_dir(&req, session_manager);
            match git_cmd::init(&dir) {
                Ok(()) => Response::ok(req.id, json!({"ok": true})),
                Err(e) => ErrorResponse::new(req.id, 2001, e),
            }
        }

        "git.info" => {
            let dir = get_dir(&req, session_manager);
            match git_cmd::git_info(&dir) {
                Ok(info) => Response::ok(req.id, json!(info)),
                Err(e) => ErrorResponse::new(req.id, 2002, e),
            }
        }

        "git.changes" => {
            let dir = get_dir(&req, session_manager);
            match git_cmd::git_changes(&dir) {
                Ok(changes) => Response::ok(req.id, json!({"changes": changes})),
                Err(e) => ErrorResponse::new(req.id, 2003, e),
            }
        }

        "git.diff" => {
            let dir = get_dir(&req, session_manager);
            let file = req
                .params
                .get("file")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if file.is_empty() {
                return ErrorResponse::new(req.id, 1002, "file is required".into());
            }
            match git_cmd::git_diff(&dir, file) {
                Ok(diff) => Response::ok(req.id, json!(diff)),
                Err(e) => ErrorResponse::new(req.id, 2004, e),
            }
        }

        "git.stage_file" => {
            let dir = get_dir(&req, session_manager);
            let file = req
                .params
                .get("file")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if file.is_empty() {
                return ErrorResponse::new(req.id, 1002, "file is required".into());
            }
            match git_cmd::stage_file(&dir, file) {
                Ok(()) => Response::ok(req.id, json!({"ok": true})),
                Err(e) => ErrorResponse::new(req.id, 2005, e),
            }
        }

        "git.unstage_file" => {
            let dir = get_dir(&req, session_manager);
            let file = req
                .params
                .get("file")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if file.is_empty() {
                return ErrorResponse::new(req.id, 1002, "file is required".into());
            }
            match git_cmd::unstage_file(&dir, file) {
                Ok(()) => Response::ok(req.id, json!({"ok": true})),
                Err(e) => ErrorResponse::new(req.id, 2006, e),
            }
        }

        "git.discard_file" => {
            let dir = get_dir(&req, session_manager);
            let file = req
                .params
                .get("file")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if file.is_empty() {
                return ErrorResponse::new(req.id, 1002, "file is required".into());
            }
            match git_cmd::discard_file(&dir, file) {
                Ok(()) => Response::ok(req.id, json!({"ok": true})),
                Err(e) => ErrorResponse::new(req.id, 2007, e),
            }
        }

        "git.commit" => {
            let dir = get_dir(&req, session_manager);
            let message = req
                .params
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if message.is_empty() {
                return ErrorResponse::new(req.id, 1002, "message is required".into());
            }
            match git_cmd::commit(&dir, message) {
                Ok(hash) => Response::ok(req.id, json!({"hash": hash})),
                Err(e) => ErrorResponse::new(req.id, 2008, e),
            }
        }

        "git.branches" => {
            let dir = get_dir(&req, session_manager);
            match git_cmd::branches(&dir) {
                Ok(branches) => Response::ok(req.id, json!({"branches": branches})),
                Err(e) => ErrorResponse::new(req.id, 2009, e),
            }
        }

        "git.log" => {
            let dir = get_dir(&req, session_manager);
            let count = req
                .params
                .get("count")
                .and_then(|v| v.as_u64())
                .unwrap_or(50) as u32;
            match git_cmd::log(&dir, count) {
                Ok(commits) => Response::ok(req.id, json!({"commits": commits})),
                Err(e) => ErrorResponse::new(req.id, 2010, e),
            }
        }

        // ── worktree commands ────────────────────────────────────────────────

        "git.worktrees" => {
            let dir = get_dir(&req, session_manager);
            match git_wt::list_worktrees(&dir) {
                Ok(wt) => Response::ok(req.id, json!({"worktrees": wt})),
                Err(e) => ErrorResponse::new(req.id, 2011, e),
            }
        }

        "git.create_worktree" => {
            let dir = get_dir(&req, session_manager);
            let branch = req
                .params
                .get("branch")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let base = req
                .params
                .get("base")
                .and_then(|v| v.as_str())
                .unwrap_or("main");
            if branch.is_empty() {
                return ErrorResponse::new(req.id, 1002, "branch is required".into());
            }
            match git_wt::create_worktree(&dir, branch, base) {
                Ok(path) => Response::ok(req.id, json!({"path": path})),
                Err(e) => ErrorResponse::new(req.id, 2012, e),
            }
        }

        "git.merge_worktree" => {
            let dir = get_dir(&req, session_manager);
            let wt_path = req
                .params
                .get("wt_path")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let target = req
                .params
                .get("target")
                .and_then(|v| v.as_str());
            if wt_path.is_empty() {
                return ErrorResponse::new(req.id, 1002, "wt_path is required".into());
            }
            match git_wt::merge_worktree(&dir, wt_path, target) {
                Ok(msg) => Response::ok(req.id, json!({"message": msg})),
                Err(e) => ErrorResponse::new(req.id, 2013, e),
            }
        }

        "git.remove_worktree" => {
            let dir = get_dir(&req, session_manager);
            let wt_path = req
                .params
                .get("wt_path")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let branch = req
                .params
                .get("branch")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if wt_path.is_empty() || branch.is_empty() {
                return ErrorResponse::new(req.id, 1002, "wt_path and branch are required".into());
            }
            match git_wt::remove_worktree(&dir, wt_path, branch) {
                Ok(msg) => Response::ok(req.id, json!({"message": msg})),
                Err(e) => ErrorResponse::new(req.id, 2014, e),
            }
        }

        "git.branch_diff_stats" => {
            let dir = get_dir(&req, session_manager);
            let base = req
                .params
                .get("base_branch")
                .and_then(|v| v.as_str());
            match git_wt::branch_diff_stats(&dir, base) {
                Ok(stats) => Response::ok(req.id, json!(stats)),
                Err(e) => ErrorResponse::new(req.id, 2015, e),
            }
        }

        // ── AI commit message generation ─────────────────────────────────────

        "git.generate_commit_msg" => {
            let dir = get_dir(&req, session_manager);

            // Gather diff context (up to 4000 chars to avoid huge prompts)
            let diff_context = build_diff_context(&dir);

            // Create an ephemeral session
            let session_id = session_manager.create_ephemeral_session(
                "claude-sonnet-4-20250514".to_string(),
                1024,
            );

            let prompt = format!(
                "你是一个 Git 提交消息生成助手。请根据以下 git diff 内容，\
生成一条简洁、准确的中文提交消息（不超过 72 个字符）。\
只输出提交消息本身，不需要任何解释或额外内容。\n\n\
以下是 git diff：\n```\n{}\n```",
                diff_context
            );

            // Send the message (fire-and-forget; frontend listens to block.* events)
            let send_result = session_manager
                .send(&session_id, &prompt, event_tx.clone())
                .await;

            if let Err(e) = send_result {
                return ErrorResponse::new(req.id, 2016, e.to_string());
            }

            // Schedule cleanup after 60 seconds
            let session_id_clone = session_id.clone();
            let sessions_arc = session_manager.sessions_arc();
            tokio::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                sessions_arc.lock().unwrap().remove(&session_id_clone);
            });

            Response::ok(req.id, json!({"session_id": session_id}))
        }

        _ => ErrorResponse::new(req.id, 1000, format!("unknown method: {}", req.method)),
    }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/// Extract `dir` param, falling back to the session manager's working directory.
fn get_dir(req: &Request, session_manager: &SessionManager) -> String {
    req.params
        .get("dir")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| session_manager.get_working_dir().to_string())
}

/// Build a compact diff string for the commit-message prompt.
fn build_diff_context(dir: &str) -> String {
    let mut parts: Vec<String> = Vec::new();

    // Staged diff
    if let Ok(out) = git_cmd::run_git_unchecked(dir, &["diff", "--cached", "--stat"]) {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                parts.push(format!("=== staged ===\n{}", s));
            }
        }
    }

    // Unstaged diff (stat only to keep it small)
    if let Ok(out) = git_cmd::run_git_unchecked(dir, &["diff", "--stat"]) {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                parts.push(format!("=== unstaged ===\n{}", s));
            }
        }
    }

    // Untracked files list
    if let Ok(out) = git_cmd::run_git_unchecked(dir, &["ls-files", "--others", "--exclude-standard"]) {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                parts.push(format!("=== untracked ===\n{}", s));
            }
        }
    }

    let full = parts.join("\n\n");
    // Truncate to 4000 chars to keep prompt manageable
    if full.len() > 4000 {
        format!("{}...(truncated)", &full[..4000])
    } else {
        full
    }
}
