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
