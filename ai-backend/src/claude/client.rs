use reqwest::Response;

use super::types::{ApiMessage, CreateMessageRequest};

const CLAUDE_API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

pub struct ClaudeClient {
    http: reqwest::Client,
    api_key: String,
}

impl ClaudeClient {
    pub fn new(api_key: String) -> Self {
        ClaudeClient {
            http: reqwest::Client::new(),
            api_key,
        }
    }

    pub async fn stream_message(
        &self,
        model: &str,
        messages: Vec<ApiMessage>,
        max_tokens: u32,
    ) -> Result<Response, reqwest::Error> {
        let body = CreateMessageRequest {
            model: model.to_string(),
            messages,
            max_tokens,
            stream: true,
        };

        let body_json = serde_json::to_string(&body)
            .expect("failed to serialize request body");

        self.http
            .post(CLAUDE_API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .body(body_json)
            .send()
            .await
    }
}
