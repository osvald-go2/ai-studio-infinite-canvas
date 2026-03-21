# Model Variant Switching Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to select and switch between model variants (e.g., Claude Sonnet/Opus, Codex GPT 5.4/Mini) at session creation and mid-session.

**Architecture:** New `src/models.ts` centralizes all model/provider definitions and helpers. Rust backend passes `--model` / `-m` flags to CLI processes on spawn. Mid-session switching kills the current process and respawns with the new model + resume ID on next send.

**Tech Stack:** React 19 + TypeScript (frontend), Rust + Tokio (backend), Claude CLI + Codex CLI (spawned processes)

**Spec:** `docs/superpowers/specs/2026-03-21-model-variant-switching-design.md`

---

## Chunk 1: Data Model & Backend

### Task 1: Create `src/models.ts` — model definitions and helpers

**Files:**
- Create: `src/models.ts`

- [ ] **Step 1: Create the file with all types, constants, and helpers**

```ts
// src/models.ts
export type ProviderId = 'claude' | 'codex' | 'gemini';

export interface ModelVariant {
  id: string;
  name: string;
  cliFlag: string | null;
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

export function getAgentType(model: string): ProviderId {
  if (model.startsWith('claude')) return 'claude';
  if (model.startsWith('codex')) return 'codex';
  return 'gemini';
}

export function getModelDisplayName(modelId: string): string {
  const provider = getAgentType(modelId);
  const variant = MODEL_VARIANTS[provider].variants.find(v => v.id === modelId);
  return variant?.name ?? modelId;
}

export function getModelFullLabel(modelId: string): string {
  const provider = getAgentType(modelId);
  const def = MODEL_VARIANTS[provider];
  const variant = def.variants.find(v => v.id === modelId);
  return variant ? `${def.label} · ${variant.name}` : modelId;
}

export function getSiblingVariants(modelId: string): ModelVariant[] {
  const provider = getAgentType(modelId);
  return MODEL_VARIANTS[provider].variants;
}

export function getCliFlag(modelId: string): string | null {
  const provider = getAgentType(modelId);
  const variant = MODEL_VARIANTS[provider].variants.find(v => v.id === modelId);
  return variant?.cliFlag ?? null;
}

export function migrateModel(model: string): string {
  if (model === 'claude-code') return 'claude-sonnet-4-6';
  if (model === 'codex') return 'codex-gpt-5-4';
  return model;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/models.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/models.ts
git commit -m "feat: add model variant definitions and helpers (models.ts)"
```

---

### Task 2: Update `src/types.ts` — remove old `getAgentType`

**Files:**
- Modify: `src/types.ts:66-70`

- [ ] **Step 1: Remove the old `getAgentType` function**

Delete lines 66-70 from `src/types.ts`:
```ts
// DELETE these lines:
export function getAgentType(model: string): 'claude' | 'codex' {
  if (model.startsWith('claude')) return 'claude';
  if (model === 'codex') return 'codex';
  return 'claude';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "refactor: remove old getAgentType from types.ts (moved to models.ts)"
```

---

### Task 3: Update Rust backend — `ClaudeProcess::spawn()` accepts model param

**Files:**
- Modify: `ai-backend/src/claude/client.rs:21-36`

- [ ] **Step 1: Add `model` parameter to `spawn()` signature and pass `--model` to CLI**

Change the function signature at line 21:
```rust
// Before:
pub fn spawn(working_dir: &str, resume_session_id: Option<&str>) -> Result<(Self, mpsc::UnboundedReceiver<ClaudeJson>), String> {

// After:
pub fn spawn(working_dir: &str, resume_session_id: Option<&str>, model: Option<&str>) -> Result<(Self, mpsc::UnboundedReceiver<ClaudeJson>), String> {
```

After line 32 (`"--strict-mcp-config"`), add:
```rust
        if let Some(m) = model {
            cmd.args(["--model", m]);
        }
```

- [ ] **Step 2: Do NOT commit yet — backend won't compile until Task 5 updates the callers**

> **Note**: Tasks 3, 4, and 5 form an atomic unit. The Rust backend will not compile after Tasks 3 or 4 alone because `manager.rs` still calls `spawn()` with the old signature. All three tasks will be committed together at the end of Task 5.

---

### Task 4: Update Rust backend — `CodexProcess::spawn()` accepts model param

**Files:**
- Modify: `ai-backend/src/codex/client.rs:16-30`

- [ ] **Step 1: Add `model` parameter and pass `-m` before `exec`**

Change signature at line 16-20:
```rust
// Before:
pub fn spawn(
    working_dir: &str,
    prompt: &str,
    resume_thread_id: Option<&str>,
) -> Result<(Self, mpsc::UnboundedReceiver<CodexEvent>, mpsc::UnboundedReceiver<String>), String>

// After:
pub fn spawn(
    working_dir: &str,
    prompt: &str,
    resume_thread_id: Option<&str>,
    model: Option<&str>,
) -> Result<(Self, mpsc::UnboundedReceiver<CodexEvent>, mpsc::UnboundedReceiver<String>), String>
```

After line 22 (`let mut cmd = Command::new("codex");`), add before the if/else block:
```rust
        // -m must come before exec subcommand
        if let Some(m) = model {
            cmd.args(["-m", m]);
        }
```

- [ ] **Step 2: Do NOT commit yet — same as Task 3, wait for Task 5**

---

### Task 5: Update Rust backend — `SessionManager` model routing & switch_model

**Files:**
- Modify: `ai-backend/src/session/manager.rs`

- [ ] **Step 1: Add `model_cli_flag()` and `is_codex_model()` helpers at top of file (after imports)**

Add after line 8 (`use super::types::{Session, SessionSummary};`):
```rust
fn model_cli_flag(model_id: &str) -> Option<&'static str> {
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

- [ ] **Step 2: Fix `is_codex` check in `send()` method (line 110)**

```rust
// Before (line 110):
active.info.model == "codex"

// After:
is_codex_model(&active.info.model)
```

- [ ] **Step 3: Pass model to `ClaudeProcess::spawn()` (line 189)**

```rust
// Before:
let (process, msg_rx) = ClaudeProcess::spawn(&working_dir, resume_id)

// After:
let cli_flag = model_cli_flag(&active.info.model);
let (process, msg_rx) = ClaudeProcess::spawn(&working_dir, resume_id, cli_flag)
```

Note: `model_cli_flag` already returns `Option<&str>` which matches the new `spawn()` signature.

- [ ] **Step 4: Pass model to `CodexProcess::spawn()` (line 127)**

```rust
// Before:
CodexProcess::spawn(&working_dir, text, resume_tid.as_deref())

// After:
let cli_flag = model_cli_flag(&active.info.model);
CodexProcess::spawn(&working_dir, text, resume_tid.as_deref(), cli_flag)
```

Need to read `active.info.model` before releasing the lock. Add `cli_flag` extraction to the existing sessions lock block (lines 118-122). Keep `working_dir` extraction separate to avoid nested mutex locks:
```rust
// working_dir is already extracted at line 117 — keep as-is:
let working_dir = self.working_dir.lock().unwrap().clone();

// Add cli_flag to the existing sessions lock block (lines 118-122):
let (resume_tid, cli_flag) = {
    let sessions = self.sessions.lock().unwrap();
    let active = sessions.get(session_id).unwrap();
    (active.codex_thread_id.clone(), model_cli_flag(&active.info.model))
};
```

- [ ] **Step 5: Fix `is_codex` check in `interrupt()` method (line 284)**

```rust
// Before:
if active.info.model == "codex" {

// After:
if is_codex_model(&active.info.model) {
```

- [ ] **Step 6: Add `switch_model()` method before `list()` (after line 234)**

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

    Ok(())
}
```

- [ ] **Step 7: Verify Rust backend compiles**

Run: `cd ai-backend && cargo check`
Expected: Success (0 errors)

- [ ] **Step 8: Commit Tasks 3+4+5 together (first compilable state)**

```bash
git add ai-backend/src/claude/client.rs ai-backend/src/codex/client.rs ai-backend/src/session/manager.rs
git commit -m "feat: pass --model/-m flags to CLI processes, add switch_model()"
```

---

### Task 6: Update Rust backend — Router `session.switch_model` handler

**Files:**
- Modify: `ai-backend/src/router.rs:100-109` (insert after `session.interrupt` handler)

- [ ] **Step 1: Add the new route handler**

After the `"session.interrupt"` match arm (line 109), add:
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

- [ ] **Step 2: Verify full Rust backend compiles**

Run: `cd ai-backend && cargo check`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add ai-backend/src/router.rs
git commit -m "feat: add session.switch_model router handler"
```

---

## Chunk 2: Frontend Integration

### Task 7: Update `src/services/backend.ts` — add `switchModel` method

**Files:**
- Modify: `src/services/backend.ts` (after `interruptSession` method, ~line 46)

- [ ] **Step 1: Add switchModel method**

After the `interruptSession` method (line 46), add:
```ts
  async switchModel(sessionId: string, model: string): Promise<void> {
    if (!isElectron()) return;
    await window.aiBackend.invoke('session.switch_model', {
      session_id: sessionId,
      model,
    });
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/services/backend.ts
git commit -m "feat: add backend.switchModel() IPC method"
```

---

### Task 8: Update `src/services/skillScanner.ts` — use `getAgentType`

**Files:**
- Modify: `src/services/skillScanner.ts:1-7,25`

- [ ] **Step 1: Replace `MODEL_TO_PLATFORM` with `getAgentType`**

Replace the import and constant:
```ts
// Before (lines 1-7):
import { SkillInfo } from '../types';

const MODEL_TO_PLATFORM: Record<string, string> = {
  'claude-code': 'claude',
  'codex': 'codex',
  'gemini-cli': 'gemini',
};

// After:
import { SkillInfo } from '../types';
import { getAgentType } from '../models';
```

Replace lines 25-27:
```ts
// Before:
const platform = MODEL_TO_PLATFORM[model];
console.log(`[skillScanner] model=${model}, platform=${platform}, projectDir=${projectDir}, isElectron=${isElectron()}`);
if (!platform) return [];

// After:
const platform = getAgentType(model);
console.log(`[skillScanner] model=${model}, platform=${platform}, projectDir=${projectDir}, isElectron=${isElectron()}`);
```

Note: The `if (!platform) return []` guard is removed because `getAgentType()` always returns a valid `ProviderId`.

- [ ] **Step 2: Commit**

```bash
git add src/services/skillScanner.ts
git commit -m "refactor: replace MODEL_TO_PLATFORM with getAgentType in skillScanner"
```

---

### Task 9: Update `src/App.tsx` — model migration on session load

**Files:**
- Modify: `src/App.tsx:147-162`

- [ ] **Step 1: Import `migrateModel` and apply in session loading**

Add import at top of file:
```ts
import { migrateModel } from './models';
```

Change line 152 in `applyProject`:
```ts
// Before:
model: s.model,

// After:
model: migrateModel(s.model),
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: migrate old model IDs on session load"
```

---

### Task 10: Update `src/components/SessionWindow.tsx` — model check migration

**Files:**
- Modify: `src/components/SessionWindow.tsx:3,310,384,399,483,499`

- [ ] **Step 1: Add import for `getAgentType`**

At line 3, add import:
```ts
import { getAgentType } from '../models';
```

- [ ] **Step 2: Replace all 5 `model === 'codex'` checks**

Replace each instance:
```ts
// Before (lines 310, 384, 399, 483, 499):
sessionRef.current.model === 'codex'

// After:
getAgentType(sessionRef.current.model) === 'codex'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run lint`
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "refactor: migrate codex model checks to getAgentType() in SessionWindow"
```

---

### Task 11: Update `src/components/CanvasView.tsx` — MODEL_COLORS lookup

**Files:**
- Modify: `src/components/CanvasView.tsx:711`

- [ ] **Step 1: Add import for `getAgentType`**

Add import at top of file:
```ts
import { getAgentType } from '../models';
```

- [ ] **Step 2: Fix MODEL_COLORS lookup**

```ts
// Before (line 711):
const color = MODEL_COLORS[s.model] || '#94a3b8';

// After:
const color = MODEL_COLORS[getAgentType(s.model)] || '#94a3b8';
```

- [ ] **Step 3: Commit**

```bash
git add src/components/CanvasView.tsx
git commit -m "fix: MODEL_COLORS lookup uses getAgentType for new model IDs"
```

---

### Task 12: Update `src/components/BoardView.tsx` — model display name

**Files:**
- Modify: `src/components/BoardView.tsx:272`

- [ ] **Step 1: Add import for `getModelDisplayName`**

Add import at top:
```ts
import { getModelDisplayName } from '../models';
```

- [ ] **Step 2: Use display name instead of raw model ID**

```ts
// Before (line 272):
{session.model}

// After:
{getModelDisplayName(session.model)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/BoardView.tsx
git commit -m "fix: BoardView shows friendly model display name"
```

---

## Chunk 3: UI — NewSessionModal & SessionWindow Switcher

### Task 13: Update `NewSessionModal.tsx` — two-step provider + variant selection

**Files:**
- Modify: `src/components/NewSessionModal.tsx:1-6,41-49,112-115,150-176`

- [ ] **Step 1: Update imports and model state**

Add import:
```ts
import { MODEL_VARIANTS, getAgentType, type ProviderId } from '../models';
```

Remove the old `MODELS` constant (lines 41-45).

Replace the model state:
```ts
// Before (line 49):
const [model, setModel] = useState('claude-code');

// After:
const [provider, setProvider] = useState<ProviderId>('claude');
const [model, setModel] = useState(MODEL_VARIANTS.claude.defaultVariant);
```

- [ ] **Step 2: Add provider card data**

Replace the deleted `MODELS` with:
```ts
const PROVIDERS: { id: ProviderId; name: string; icon: React.FC }[] = [
  { id: 'claude', name: 'Claude Code', icon: ClaudeIcon },
  { id: 'codex', name: 'Codex', icon: CodexIcon },
  { id: 'gemini', name: 'Gemini CLI', icon: GeminiIcon },
];
```

- [ ] **Step 3: Update the model selection UI in the form**

Replace the Model fieldset (lines 150-176) with:
```tsx
{/* Provider selection */}
<fieldset>
  <legend className="block text-[15px] font-medium text-white mb-3">Model</legend>
  <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Provider">
    {PROVIDERS.map((p) => {
      const Icon = p.icon;
      const isSelected = provider === p.id;
      return (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={isSelected}
          onClick={() => {
            setProvider(p.id);
            setModel(MODEL_VARIANTS[p.id].defaultVariant);
          }}
          className={`flex flex-col items-center justify-center gap-2.5 py-5 px-3 rounded-xl border transition-all ${
            isSelected
              ? 'bg-white/[0.08] border-white/[0.12] text-white'
              : 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:bg-white/[0.05] hover:text-gray-300'
          }`}
        >
          <Icon />
          <span className="text-[13px] font-medium">{p.name}</span>
        </button>
      );
    })}
  </div>
  {/* Variant tags */}
  {MODEL_VARIANTS[provider].variants.length > 1 && (
    <div className="flex gap-2 mt-3">
      {MODEL_VARIANTS[provider].variants.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => setModel(v.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            model === v.id
              ? 'bg-white/[0.1] border-white/[0.15] text-white'
              : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:bg-white/[0.06] hover:text-gray-300'
          }`}
        >
          {v.name}
        </button>
      ))}
    </div>
  )}
</fieldset>
```

- [ ] **Step 4: Update reset after submit (lines 114-115)**

```ts
// Before:
setModel('claude-code');

// After:
setProvider('claude');
setModel(MODEL_VARIANTS.claude.defaultVariant);
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run lint`
Expected: Success

- [ ] **Step 6: Commit**

```bash
git add src/components/NewSessionModal.tsx
git commit -m "feat: NewSessionModal two-step provider + variant selection"
```

---

### Task 14: Add model switcher dropdown in `SessionWindow.tsx` header

**Files:**
- Modify: `src/components/SessionWindow.tsx`

- [ ] **Step 1: Update the models import**

Task 10 already added `import { getAgentType } from '../models';`. Replace that line with:
```ts
import { getAgentType, getModelDisplayName, getSiblingVariants } from '../models';
```

- [ ] **Step 2: Add state for model switcher dropdown**

Near the existing state declarations (around line 65-85), add:
```ts
const [showModelPicker, setShowModelPicker] = useState(false);
const modelPickerRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 3: Add click-outside handler for model picker**

After the existing history popover click-outside handler (~line 118), add:
```ts
useEffect(() => {
  if (!showModelPicker) return;
  const handleClickOutside = (e: MouseEvent) => {
    if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
      setShowModelPicker(false);
    }
  };
  document.addEventListener('mousedown', handleClickOutside, true);
  return () => document.removeEventListener('mousedown', handleClickOutside, true);
}, [showModelPicker]);
```

- [ ] **Step 4: Add `handleSwitchModel` function**

After the `handleTitleCancel` function area, add:
```ts
const handleSwitchModel = async (newModelId: string) => {
  if (newModelId === session.model) return;
  setShowModelPicker(false);

  // Call backend to switch model (kills current process)
  if (backendSessionIdRef.current) {
    try {
      await backend.switchModel(backendSessionIdRef.current, newModelId);
    } catch (e) {
      console.warn('[model switch error]', e);
    }
  }

  // Insert system message
  const systemMsg: Message = {
    id: Date.now().toString(),
    role: 'system',
    content: `模型已切换为 ${getModelDisplayName(newModelId)}`,
    timestamp: Date.now(),
  };

  const updated = {
    ...sessionRef.current,
    model: newModelId,
    messages: [...sessionRef.current.messages, systemMsg],
  };
  sessionRef.current = updated;
  onUpdate(updated);

  // Note: onUpdate triggers App.tsx auto-save which persists model change to DB.
  // The auto-save debounce ensures persistence within seconds.
};
```

- [ ] **Step 5: Add the model switcher dropdown UI in the header**

In the header, after the title area (after the `</div>` closing the `group/title` div, around line 886), and before the git branch badge, insert:

```tsx
{/* Model variant switcher */}
{getSiblingVariants(session.model).length > 1 && (
  <div className="relative shrink-0" ref={modelPickerRef}>
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setShowModelPicker(!showModelPicker); }}
      onMouseDown={(e) => e.stopPropagation()}
      disabled={isStreaming}
      className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-all ${
        isStreaming
          ? 'opacity-40 cursor-not-allowed bg-white/[0.03] border-white/[0.06] text-gray-500'
          : 'bg-white/[0.06] border-white/[0.08] text-gray-300 hover:bg-white/[0.1] hover:text-white'
      }`}
      title={isStreaming ? '流式响应中无法切换模型' : '切换模型'}
    >
      {getModelDisplayName(session.model)}
      <ChevronDown size={10} />
    </button>
    {showModelPicker && (
      <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px]">
        {getSiblingVariants(session.model).map((v) => (
          <button
            key={v.id}
            onClick={(e) => { e.stopPropagation(); handleSwitchModel(v.id); }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
              v.id === session.model
                ? 'text-white bg-white/[0.08]'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {v.name}
            {v.id === session.model && <Check size={10} className="inline ml-2" />}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npm run lint`
Expected: Success

- [ ] **Step 7: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat: add model variant switcher dropdown in SessionWindow header"
```

---

### Task 15: Full build verification

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript type check**

Run: `npm run lint`
Expected: Success, no type errors

- [ ] **Step 2: Run Rust backend build**

Run: `cd ai-backend && cargo build`
Expected: Success

- [ ] **Step 3: Run dev server smoke test**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any remaining build issues from model variant feature"
```

(Skip this step if no fixes were needed.)
