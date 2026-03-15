use std::io::{self, Write};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;

mod db;
mod protocol;
mod router;
mod session;
mod claude;
mod normalizer;
mod git;

use protocol::{ErrorResponse, OutgoingMessage, Request};
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
                let err_msg = ErrorResponse::new(
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
