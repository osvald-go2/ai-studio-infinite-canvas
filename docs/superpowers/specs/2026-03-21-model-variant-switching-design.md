# Model Variant Switching Design

## Summary

Allow users to select and switch between model variants within a provider (e.g., Claude Sonnet 4.6 vs Opus 4.6, Codex GPT 5.4 vs GPT 5.4 Mini). Model selection happens at session creation time in NewSessionModal, and can be switched mid-session via a dropdown in SessionWindow. Mid-session switching uses a kill + resume strategy — transparent to the user. Cross-provider switching (e.g. Claude → Codex) is **not** supported; only variant switching within the same provider.

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
| `codex`        | `codex-gpt-5-4`       | `codex-gpt-5-4-mini` |
| `gemini-cli`   | `gemini-cli`           | (none)               |

> **Convention**: All model IDs use hyphens only (no dots). `5.4` → `5-4`.

### MODEL_VARIANTS constant (new src/models.ts)

```ts
export type ProviderId = 'claude' | 'codex' | 'gemini';

export interface ModelVariant {
  id: string;
  name: string;        // Display name: "Sonnet 4.6"
  cliFlag: string | null;  // Value passed to --model / -m
}

export interface ProviderDef {
  label: string;
  variants: ModelVariant[];
  defaultVariant: string;
}

export const MODEL_VARIANTS: Record<ProviderId, ProviderDef> = {
  claude: {
    label: 'Claude Code',
    variants: [
      { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', cliFlag: 'sonnet' },
      { id: 'claude-opus-4-6', name: 'Opus 4.6', cliFlag: 'opus' },
    ],
    defaultVariant: 'claude-sonnet-4-6',
  },
  codex: {
    label: 'Codex',
    variants: [
      { id: 'codex-gpt-5-4', name: 'GPT 5.4', cliFlag: 'gpt-5.4' },
      { id: 'codex-gpt-5-4-mini', name: 'GPT 5.4 Mini', cliFlag: 'gpt-5.4-mini' },
    ],
    defaultVariant: 'codex-gpt-5-4',
  },
  gemini: {
    label: 'Gemini CLI',
    variants: [
      { id: 'gemini-cli', name: 'Gemini CLI', cliFlag: null },
    ],
    defaultVariant: 'gemini-cli',
  },
};
```

**Verified**: Claude CLI accepts `--model sonnet` shorthand (tested: `claude --model sonnet -p "say hi"` succeeds and maps to `claude-sonnet-4-6`). Codex CLI accepts `-m <model>` before `exec` subcommand.

### Helper functions (src/models.ts)

```ts
/** Get provider type from model ID */
export function getAgentType(model: string): ProviderId {
  if (model.startsWith('claude')) return 'claude';
  if (model.startsWith('codex')) return 'codex';
  return 'gemini';
}

/** Get display name for a model ID, e.g. "claude-sonnet-4-6" → "Sonnet 4.6" */
export function getModelDisplayName(modelId: string): string {
  const provider = getAgentType(modelId);
  const variant = MODEL_VARIANTS[provider].variants.find(v => v.id === modelId);
  return variant?.name ?? modelId;
}

/** Get provider label + variant name, e.g. "Claude Code · Sonnet 4.6" */
export function getModelFullLabel(modelId: string): string {
  const provider = getAgentType(modelId);
  const def = MODEL_VARIANTS[provider];
  const variant = def.variants.find(v => v.id === modelId);
  return variant ? `${def.label} · ${variant.name}` : modelId;
}

/** Get available variants for the same provider */
export function getSiblingVariants(modelId: string): ModelVariant[] {
  const provider = getAgentType(modelId);
  return MODEL_VARIANTS[provider].variants;
}

/** Get CLI flag value for a model ID */
export function getCliFlag(modelId: string): string | null {
  const provider = getAgentType(modelId);
  const variant = MODEL_VARIANTS[provider].variants.find(v => v.id === modelId);
  return variant?.cliFlag ?? null;
}
```

### Backward compatibility

Old DB sessions with `model: "claude-code"` migrate to `"claude-sonnet-4-6"` on load; `"codex"` migrates to `"codex-gpt-5-4"`.

```ts
function migrateModel(model: string): string {
  if (model === 'claude-code') return 'claude-sonnet-4-6';
  if (model === 'codex') return 'codex-gpt-5-4';
  return model;
}
```

Applied in `App.tsx` when loading sessions from backend.

## 2. Rust Backend Changes

### model_cli_flag mapping

```rust
fn model_cli_flag(model_id: &str) -> Option<&str> {
    match model_id {
        "claude-sonnet-4-6"  => Some("sonnet"),
        "claude-opus-4-6"    => Some("opus"),
        "codex-gpt-5-4"      => Some("gpt-5.4"),
        "codex-gpt-5-4-mini" => Some("gpt-5.4-mini"),
        _ => None,
    }
}

fn is_codex_model(model: &str) -> bool {
    model.starts_with("codex")
}
```

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

Add `model: Option<&str>` parameter. Pass `-m <cliFlag>` **before** `exec` subcommand.

```rust
pub fn spawn(working_dir: &str, prompt: &str, resume_thread_id: Option<&str>, model: Option<&str>)
{
    let mut cmd = Command::new("codex");

    // -m must come before exec subcommand
    if let Some(m) = model {
        cmd.args(["-m", m]);
    }

    if let Some(thread_id) = resume_thread_id {
        cmd.args(["exec", "resume", thread_id, prompt, "--json", "--full-auto"]);
    } else {
        cmd.args(["exec", "--json", "--full-auto", prompt]);
    }
    // ...
}
```

### SessionManager changes

**Critical fix**: All `== "codex"` checks must become `is_codex_model()` / `starts_with("codex")`:

- `manager.rs:110` — `active.info.model == "codex"` → `is_codex_model(&active.info.model)`
- `manager.rs:284` — same pattern in `interrupt()`

**spawn calls**: Pass `model_cli_flag()` result to spawn functions:

```rust
// Claude path
let cli_flag = model_cli_flag(&active.info.model);
let (process, msg_rx) = ClaudeProcess::spawn(&working_dir, resume_id, cli_flag.as_deref())?;

// Codex path
let cli_flag = model_cli_flag(&active.info.model);
let (process, event_rx, stderr_rx) = CodexProcess::spawn(&working_dir, text, resume_tid.as_deref(), cli_flag.as_deref())?;
```

**New `switch_model` method**:

```rust
pub fn switch_model(&self, session_id: &str, new_model: String) -> Result<(), SessionError> {
    let mut sessions = self.sessions.lock().unwrap();
    let active = sessions.get_mut(session_id)
        .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

    // Validate: only same-provider switching allowed
    let old_is_codex = is_codex_model(&active.info.model);
    let new_is_codex = is_codex_model(&new_model);
    if old_is_codex != new_is_codex {
        return Err(SessionError::SpawnFailed("cross-provider model switch not supported".into()));
    }

    // Kill current process (drop Arc reference)
    active.claude_process = None;
    active.codex_process = None;

    // Update model — resume IDs are preserved
    active.info.model = new_model;

    // Next session.send() will auto-respawn with the new model + existing resume ID
    Ok(())
}
```

**Note on Codex**: Codex spawns a new process per `session.send()` (it runs to completion), so killing between messages is effectively a no-op. The switch simply updates the stored model for the next spawn.

### Router: new method

```rust
"session.switch_model" => {
    let session_id = req.params.get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let new_model = req.params.get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if session_id.is_empty() || new_model.is_empty() {
        return ErrorResponse::new(req.id, 1002, "session_id and model are required".into());
    }

    match session_manager.switch_model(session_id, new_model.to_string()) {
        Ok(()) => Response::ok(req.id, json!({"ok": true})),
        Err(e) => ErrorResponse::new(req.id, e.code(), e.to_string()),
    }
}
```

## 3. Frontend UI Changes

### Frontend model checks migration

**All `model === 'codex'` checks must use `getAgentType()`:**

In `SessionWindow.tsx` (approx. 5 instances):
```ts
// Before
sessionRef.current.model === 'codex'
// After
getAgentType(sessionRef.current.model) === 'codex'
```

In `SessionWindow.tsx` `session.init` handler:
```ts
// Before
data.agent === 'codex'
// After (no change needed — data.agent comes from backend normalizer, still 'codex')
```

### NewSessionModal

Two-step selection:
1. Select provider (Claude / Codex / Gemini) — existing card UI
2. After selecting provider, show variant tag buttons below the provider cards
3. Default to `defaultVariant`
4. `onCreate` passes full model ID (e.g. `"claude-opus-4-6"`)

### SessionWindow model switcher

Add a small dropdown button in the SessionWindow header, next to the title:

```
┌──────────────────────────────────────┐
│ 🟣 My Session  [Sonnet 4.6 ▾]  ...  │
│──────────────────────────────────────│
```

- Shows only variants for the current provider (via `getSiblingVariants()`)
- Hidden if provider has only 1 variant (Gemini)
- **Disabled while streaming** — cannot switch model during active response

On switch:
1. Call `backend.switchModel(sessionId, newModelId)`
2. Update `session.model` in frontend state
3. Insert system message: "模型已切换为 Opus 4.6"
4. Persist model change to DB via `backend.saveSession()`
5. Next `session.send()` auto-respawns with new model

### Streaming guard

Model switch is **blocked while `isStreaming === true`**. The dropdown button is disabled during streaming. This avoids:
- Orphaned normalizer tasks emitting spurious events
- `isStreaming` stuck in `true` state without `message.complete`
- Race conditions between old/new processes

### Adapting existing code

- **`MODEL_COLORS`** (CanvasView minimap, line ~711): change from `MODEL_COLORS[s.model]` to `MODEL_COLORS[getAgentType(s.model)]`
- **BoardView model display** (line ~272): use `getModelDisplayName(session.model)` instead of raw `session.model`
- **`MODEL_TO_PLATFORM`** (skillScanner.ts): replace hardcoded map with `getAgentType()`:
  ```ts
  const platform = getAgentType(model);  // replaces MODEL_TO_PLATFORM[model]
  ```
- **backend.ts**: add `switchModel(sessionId: string, model: string)` IPC call

### getAgentType() caller audit

The return type changes from `'claude' | 'codex'` to `'claude' | 'codex' | 'gemini'`. Callers to audit:
- `SessionWindow.tsx` — routes to Claude vs Codex path. Gemini currently goes through Claude path (existing behavior preserved since `getAgentType` previously returned `'claude'` for gemini). **Decision**: keep gemini routing through Claude path for now (gemini-cli support is limited).
- `skillScanner.ts` — `platform` passed to backend. Gemini already handled.
- `MODEL_COLORS` — already has `gemini` key.

### No changes needed

- CanvasView interaction logic (pan/zoom/select)
- TabView
- GitSidebar
- DB schema (`model` column is already a string)

## 4. File Change Summary

| File | Changes |
|------|---------|
| **New** `src/models.ts` | MODEL_VARIANTS, helper functions |
| `src/types.ts` | Remove old `getAgentType()`, update imports |
| `src/components/NewSessionModal.tsx` | Two-step provider+variant selection |
| `src/components/SessionWindow.tsx` | Model switcher dropdown, `getAgentType()` migration |
| `src/components/CanvasView.tsx` | `MODEL_COLORS` lookup via `getAgentType()` |
| `src/components/BoardView.tsx` | `getModelDisplayName()` for display |
| `src/services/backend.ts` | Add `switchModel()` IPC method |
| `src/services/skillScanner.ts` | Replace `MODEL_TO_PLATFORM` with `getAgentType()` |
| `src/App.tsx` | Migration logic for old model IDs on load |
| `ai-backend/src/claude/client.rs` | Add `model` param to `spawn()` |
| `ai-backend/src/codex/client.rs` | Add `model` param to `spawn()` |
| `ai-backend/src/session/manager.rs` | `is_codex_model()`, `switch_model()`, pass model to spawn |
| `ai-backend/src/router.rs` | New `session.switch_model` handler |

## 5. Edge Cases & Constraints

1. **Cross-provider switching not supported** — Claude session can only switch to other Claude variants, not to Codex. Enforced in backend `switch_model()`.
2. **Streaming guard** — Model switch disabled while response is streaming. Button disabled in UI.
3. **Codex per-message process** — Codex spawns a new process per send. "Kill" is a no-op when idle; model update just affects next spawn.
4. **Resume with different model** — If `--resume` + `--model <new>` is rejected by Claude CLI, the session will start fresh (frontend retains message history; CLI-side context is lost). This is an acceptable degradation.
5. **DB persistence** — Model change persisted via `backend.saveSession()` after switch so it survives app restart.
