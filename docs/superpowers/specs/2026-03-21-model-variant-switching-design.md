# Model Variant Switching Design

## Summary

Allow users to select and switch between model variants within a provider (e.g., Claude Sonnet 4.6 vs Opus 4.6, Codex GPT 5.4 vs GPT 5.4 Mini). Model selection happens at session creation time in NewSessionModal, and can be switched mid-session via a dropdown in SessionWindow. Mid-session switching uses a kill + resume strategy — transparent to the user.

## Scope

- **Claude**: Sonnet 4.6, Opus 4.6
- **Codex**: GPT 5.4, GPT 5.4 Mini
- **Gemini**: No variants (unchanged)

## 1. Data Model

### Model ID Format

`Session.model` changes from provider-only identifiers to specific model IDs:

| Old value      | New default           | Alternatives          |
|----------------|-----------------------|-----------------------|
| `claude-code`  | `claude-sonnet-4-6`   | `claude-opus-4-6`    |
| `codex`        | `codex-gpt-5.4`       | `codex-gpt-5.4-mini` |
| `gemini-cli`   | `gemini-cli`           | (none)               |

### MODEL_VARIANTS constant (types.ts or new models.ts)

```ts
const MODEL_VARIANTS = {
  claude: {
    label: 'Claude Code',
    icon: ClaudeIcon,
    variants: [
      { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', cliFlag: 'sonnet' },
      { id: 'claude-opus-4-6', name: 'Opus 4.6', cliFlag: 'opus' },
    ],
    defaultVariant: 'claude-sonnet-4-6',
  },
  codex: {
    label: 'Codex',
    icon: CodexIcon,
    variants: [
      { id: 'codex-gpt-5.4', name: 'GPT 5.4', cliFlag: 'gpt-5.4' },
      { id: 'codex-gpt-5.4-mini', name: 'GPT 5.4 Mini', cliFlag: 'gpt-5.4-mini' },
    ],
    defaultVariant: 'codex-gpt-5.4',
  },
  gemini: {
    label: 'Gemini CLI',
    icon: GeminiIcon,
    variants: [
      { id: 'gemini-cli', name: 'Gemini CLI', cliFlag: null },
    ],
    defaultVariant: 'gemini-cli',
  },
};
```

### getAgentType() update

```ts
export function getAgentType(model: string): 'claude' | 'codex' | 'gemini' {
  if (model.startsWith('claude')) return 'claude';
  if (model.startsWith('codex')) return 'codex';
  return 'gemini';
}
```

### Backward compatibility

Old DB sessions with `model: "claude-code"` migrate to `"claude-sonnet-4-6"` on load; `"codex"` migrates to `"codex-gpt-5.4"`.

## 2. Rust Backend Changes

### ClaudeProcess::spawn()

Add `model: Option<&str>` parameter. Pass `--model <cliFlag>` to the claude CLI command.

```rust
pub fn spawn(working_dir: &str, resume_session_id: Option<&str>, model: Option<&str>)
  -> Result<(Self, mpsc::UnboundedReceiver<ClaudeJson>), String>
{
    let mut cmd = Command::new("claude");
    cmd.args(["-p", "--output-format", "stream-json", "--input-format", "stream-json",
              "--verbose", "--no-chrome", "--dangerously-skip-permissions",
              "--mcp-config", r#"{"mcpServers":{}}"#, "--strict-mcp-config"]);

    if let Some(m) = model {
        cmd.args(["--model", m]);
    }
    if let Some(sid) = resume_session_id {
        cmd.args(["--resume", sid]);
    }
    // ...
}
```

### CodexProcess::spawn()

Add `model: Option<&str>` parameter. Pass `-m <cliFlag>` to the codex CLI command.

```rust
pub fn spawn(working_dir: &str, prompt: &str, resume_thread_id: Option<&str>, model: Option<&str>)
{
    let mut cmd = Command::new("codex");

    if let Some(m) = model {
        cmd.args(["-m", m]);
    }
    // ... rest of exec/resume args
}
```

### SessionManager changes

- `ActiveSession.info.model` stores the full model ID (e.g. `"claude-sonnet-4-6"`)
- On spawn, parse cliFlag from MODEL_VARIANTS-equivalent mapping and pass to CLI
- New `switch_model(session_id, new_model)` method:
  1. Read current `claude_session_id` / `codex_thread_id`
  2. Kill current process (drop reference)
  3. Update `ActiveSession.info.model`
  4. Next `session.send()` auto-respawns with new model + resume ID

### Router: new method

```rust
"session.switch_model" => {
    let session_id = params["session_id"].as_str();
    let new_model = params["model"].as_str();
    session_manager.switch_model(session_id, new_model);
    Response::ok(req.id, json!({"ok": true}))
}
```

## 3. Frontend UI Changes

### NewSessionModal

Two-step selection:
1. Select provider (Claude / Codex / Gemini) — existing card UI
2. After selecting provider, show variant picker below (tag buttons or small dropdown)
3. Default to `defaultVariant`
4. `onCreate` passes full model ID (e.g. `"claude-opus-4-6"`)

### SessionWindow model switcher

Add a small dropdown button in the SessionWindow header, next to the title:

```
┌─────────────────────────────────────┐
│ 🟣 My Session  [Sonnet 4.6 ▾]  ... │
│─────────────────────────────────────│
```

- Shows only variants for the current provider
- On switch:
  1. Call `backend.switchModel(sessionId, newModelId)`
  2. Insert system message: "模型已切换为 Opus 4.6"
  3. Next send auto-respawns with new model
- Gemini: single variant, no dropdown shown

### Adapting existing code

- **MODEL_COLORS** (CanvasView minimap): match by provider prefix, colors unchanged
- **BoardView model display**: render friendly name (`"claude-sonnet-4-6"` → `"Sonnet 4.6"`)
- **MODEL_TO_PLATFORM** (skillScanner): replace hardcoded map with `getAgentType()` prefix matching
- **backend.ts**: add `switchModel(sessionId: string, model: string)` IPC call

### No changes needed

- CanvasView interaction logic
- TabView
- GitSidebar
- DB schema (`model` column is already a string)

## 4. Model-to-CLI Flag Mapping (Rust)

```rust
fn model_cli_flag(model_id: &str) -> Option<&str> {
    match model_id {
        "claude-sonnet-4-6" => Some("sonnet"),
        "claude-opus-4-6"   => Some("opus"),
        "codex-gpt-5.4"     => Some("gpt-5.4"),
        "codex-gpt-5.4-mini"=> Some("gpt-5.4-mini"),
        _ => None,
    }
}
```

## 5. Migration

On frontend session load from DB, normalize old model values:

```ts
function migrateModel(model: string): string {
  if (model === 'claude-code') return 'claude-sonnet-4-6';
  if (model === 'codex') return 'codex-gpt-5.4';
  return model;
}
```

Applied in `App.tsx` when loading sessions from backend.
