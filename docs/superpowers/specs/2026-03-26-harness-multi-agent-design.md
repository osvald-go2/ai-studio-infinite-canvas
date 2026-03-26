# Harness Multi-Agent Collaboration Design

## Overview

Add a harness-based multi-agent collaboration system to AI Studio Infinite Canvas. Sessions can be connected on the canvas with directed lines, forming a **Planner -> Generator -> Evaluator** pipeline. Agents communicate through markdown files in a `.harness/` directory, enabling automated task delegation, implementation, evaluation, and rework loops.

Inspired by [Anthropic's Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps).

## Goals

- Enable Session A (Planner) to orchestrate Session B (Generator) and Session C (Evaluator)
- Communication via structured markdown files in `.harness/` (git-trackable)
- Fully automated pipeline: plan -> implement -> evaluate -> rework (if needed)
- Visual connection management on the Canvas with drag-to-connect
- Flexible topology: multiple Generators, multiple Evaluators per group

## Non-Goals

- Real-time streaming between sessions (communication is file-based, at completion boundaries)
- Custom role types beyond Planner/Generator/Evaluator (future consideration)
- Cross-project harness groups
- Board/Tab view connection visualization (Canvas-only feature; pipeline runs headlessly in other views)

---

## 1. Data Model

### HarnessRole

```typescript
type HarnessRole = 'planner' | 'generator' | 'evaluator';
```

### HarnessConnection

```typescript
interface HarnessConnection {
  id: string;
  fromSessionId: string;
  toSessionId: string;
  fromRole: HarnessRole;
  toRole: HarnessRole;
}
```

### HarnessGroup

```typescript
interface HarnessGroup {
  id: string;
  name: string;                // User-defined, e.g. "feature-login"
  connections: HarnessConnection[];
  maxRetries: number;          // Max evaluator-generator rework rounds, default 3
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  currentSprint: number;
  currentRound: number;        // Current evaluator-generator iteration
  harnessDir: string;          // .harness/<group-id>/
}
```

### Session Extension

```typescript
interface Session {
  // ...existing fields
  harnessRole?: HarnessRole;
  harnessGroupId?: string;
}
```

### DB Persistence Schema

HarnessGroup and HarnessConnection are stored as a JSON blob in a new `harness_groups` table:

```typescript
interface DbHarnessGroup {
  id: string;                    // PRIMARY KEY
  project_id: number;            // FOREIGN KEY -> projects.id (number, consistent with DbProject.id)
  name: string;
  connections_json: string;      // JSON-serialized HarnessConnection[]
  max_retries: number;
  status: string;
  current_sprint: number;
  current_round: number;
  harness_dir: string;
  created_at: string;
  updated_at: string;
}
```

New IPC methods required in backend:
- `harness.saveGroup(group: DbHarnessGroup): Promise<void>`
- `harness.loadGroups(projectId: string): Promise<DbHarnessGroup[]>`
- `harness.deleteGroup(groupId: string): Promise<void>`

Groups are loaded in `applyProject()` alongside sessions. Session's `harnessRole` and `harnessGroupId` fields are derived from the group's connections at load time (not stored separately in the session table).

### File Structure

```
.harness/
  <group-id>/
    sprint-1/
      plan.md          # Planner output
      result.md        # Generator output
      review-1.md      # Evaluator round 1
      result-2.md      # Generator rework
      review-2.md      # Evaluator round 2
    sprint-2/
      ...
```

---

## 2. HarnessController

### React Integration

HarnessController is implemented as a **custom React hook** (`useHarnessController`) that lives in App.tsx, consistent with the project's hooks + prop drilling pattern:

```typescript
// In App.tsx
const harness = useHarnessController(sessions, setSessions, projectDir);
// harness exposes: groups, createGroup, addConnection, startPipeline, etc.
// Passed down to CanvasView and HarnessControlBar via props
```

The hook internally manages `harnessGroups: HarnessGroup[]` state via `useState`, and uses `useEffect` to register a global `message.complete` listener for pipeline orchestration.

### Interface

```typescript
interface HarnessController {
  // State
  groups: HarnessGroup[];

  // Connection management
  createGroup(name: string): HarnessGroup;
  addConnection(groupId: string, from: string, to: string, fromRole: HarnessRole, toRole: HarnessRole): void;
  removeConnection(connectionId: string): void;

  // Pipeline execution
  startPipeline(groupId: string, userPrompt: string): void;
  pausePipeline(groupId: string): void;
  resumePipeline(groupId: string): void;
  stopPipeline(groupId: string): void;

  // Internal
  onSessionComplete(sessionId: string, groupId: string): void;
}
```

### Message Injection

The Controller needs to programmatically send messages to sessions AND trigger AI responses. This requires a new `injectMessage` function exposed from SessionWindow:

```typescript
// SessionWindow exposes this via useImperativeHandle + forwardRef
interface SessionWindowHandle {
  injectMessage(content: string): Promise<void>;
  // Adds a user message to the session, then triggers backend.sendMessage()
  // exactly as if the user typed and submitted it.
  // Sets isStreaming=true, creates/reuses backendSessionId, etc.
}

// In CanvasView/App.tsx, session refs are stored in a Map:
const sessionRefs = useRef<Map<string, SessionWindowHandle>>(new Map());

// Controller calls:
sessionRefs.current.get(generatorSessionId)?.injectMessage(promptContent);
```

This avoids duplicating SessionWindow's internal state machine. The Controller delegates message sending to the component that owns the streaming state.

### Completion Detection

The Controller registers a **global** `message.complete` listener via `backend.on('message.complete', ...)` in App.tsx. It maps backend `session_id` (claudeSessionId/codexThreadId) back to frontend Session.id using a lookup map derived from the sessions array. When a session in a running HarnessGroup completes, `onSessionComplete` fires to advance the pipeline.

**Note:** This listener coexists with per-SessionWindow `message.complete` listeners (which handle UI updates). Both fire for the same event. The Controller's listener must filter to only harness-enrolled sessions (those with `harnessGroupId` in a running group) to avoid unnecessary processing.

### Pipeline Flow

```
1. User inputs requirement in Planner session
2. Controller detects Planner complete (message.complete event) ->
   - Extract Planner output
   - Write .harness/<group>/sprint-N/plan.md
   - Send message to all Generator sessions (with plan.md content)
   - Notify Evaluator: plan.md is ready (Evaluator waits)

3. Controller detects Generator complete ->
   - Extract Generator output
   - Write .harness/<group>/sprint-N/result.md
   - Send message to Evaluator (with both plan.md and result.md content)

4. Controller detects Evaluator complete ->
   - Parse evaluation result (PASS/FAIL via VERDICT line)
   - Write .harness/<group>/sprint-N/review-N.md
   - If FAIL and round < maxRetries:
     Send revision request to Generator (with review.md feedback)
     Increment round, go to step 3
   - If FAIL and round >= maxRetries:
     Mark group as 'failed', notify user
   - If PASS:
     Mark group as 'completed'
```

### Multi-Generator Parallel Execution

When a Planner connects to multiple Generators:
- Controller sends plan.md to all Generators simultaneously
- Each Generator produces independent output (`result-genA.md`, `result-genB.md`)
- Controller uses a **completion counter** per group: `pendingGenerators: Set<string>` tracks which generators are still running. Each `onSessionComplete` removes from the set. When the set is empty, Evaluator is triggered.
- If a Generator errors while others are still running: mark that generator as failed, continue waiting for others. When all resolve (complete or failed), trigger Evaluator with available results and note which generators failed.
- Evaluator receives all results for unified or per-generator evaluation

### Sprint Lifecycle

- **Sprint 1** starts automatically when the user triggers the pipeline
- A new sprint is triggered **manually by the user** (e.g., sending a new requirement to the Planner)
- Sprints are sequential, never concurrent within the same group
- Each sprint resets `currentRound` to 0

---

## 3. Canvas UI

### Connection Anchors

- Session windows display connection anchor points (small circles) on edges when hovered
- Drag from anchor -> curved line follows mouse -> release on target Session
- On release: popup to assign roles ("A as Planner -> B as Generator"), auto-creates HarnessGroup if none exists

### Connection Line Rendering

- SVG `<path>` Bezier curves, updated on session position change
- Role labels on lines (small tags)
- Color coding:
  - Planner -> Generator: blue
  - Planner -> Evaluator: blue (dashed)
  - Generator -> Evaluator: orange
  - Evaluator -> Generator (rework): red
- Running connections have flow animation (moving dots/dashes)

### Role Badges

On Session window header:
- P (Planner) - blue badge
- G (Generator) - green badge
- E (Evaluator) - orange badge

### Session Status Indicators

- `idle` - gray
- `running` - pulse animation
- `waiting` - waiting for upstream
- `failed` - red

### Harness Control Bar

When a HarnessGroup is selected, a control bar appears at canvas bottom:
- Group name | Sprint progress | Current round / max retries
- Start | Pause | Stop buttons
- Open `.harness/` directory button

---

## 4. File I/O & Prompt Templates

### File Operations

File I/O requires new IPC methods in the Electron backend, since `backend.writeFile` / `backend.readFile` do not currently exist:

**New dedicated IPC handlers** registered directly on `ipcMain.handle(...)` in `electron/main.ts` (NOT routed through `sidecar:invoke`, since these are local filesystem operations handled by the main process, same pattern as `pty:spawn`, `dialog:openDirectory`, `scan-skills`):

```typescript
// electron/main.ts - register dedicated handlers
ipcMain.handle('harness:write-file', async (_, filePath: string, content: string) => {
  await fs.promises.writeFile(filePath, content, 'utf-8');
});
ipcMain.handle('harness:read-file', async (_, filePath: string) => {
  return await fs.promises.readFile(filePath, 'utf-8');
});
ipcMain.handle('harness:mkdir', async (_, dirPath: string) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
});

// preload.ts - expose dedicated methods (not through generic invoke)
harness: {
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('harness:write-file', filePath, content),
  readFile: (filePath: string) => ipcRenderer.invoke('harness:read-file', filePath),
  mkdir: (dirPath: string) => ipcRenderer.invoke('harness:mkdir', dirPath),
}
```

**Frontend wrapper** in `src/services/harnessFiles.ts`:

```typescript
// Sanitize groupId to prevent path traversal (alphanumeric + hyphens only)
function sanitizeGroupId(groupId: string): string {
  return groupId.replace(/[^a-zA-Z0-9-]/g, '');
}

// Whitelist allowed filenames to prevent path traversal via filename parameter
const ALLOWED_FILENAMES = /^(plan|result(-\d+)?|review-\d+)\.md$/;

function validateFilename(filename: string): string {
  if (!ALLOWED_FILENAMES.test(filename)) {
    throw new Error(`Invalid harness filename: ${filename}`);
  }
  return filename;
}

async function writeHarnessFile(
  projectDir: string,
  groupId: string,
  sprint: number,
  filename: string,
  content: string
): Promise<string> {
  const safeGroupId = sanitizeGroupId(groupId);
  const safeFilename = validateFilename(filename);
  const dir = `${projectDir}/.harness/${safeGroupId}/sprint-${sprint}`;
  await window.aiBackend.harness.mkdir(dir);
  const filePath = `${dir}/${safeFilename}`;
  await window.aiBackend.harness.writeFile(filePath, content);
  return filePath;
}

async function readHarnessFile(
  projectDir: string,
  groupId: string,
  sprint: number,
  filename: string
): Promise<string> {
  const safeGroupId = sanitizeGroupId(groupId);
  const safeFilename = validateFilename(filename);
  const filePath = `${projectDir}/.harness/${safeGroupId}/sprint-${sprint}/${safeFilename}`;
  return await window.aiBackend.harness.readFile(filePath);
}
```

**Non-Electron fallback:** In browser-only mode (no Electron), file operations are mocked — files are stored in-memory using a `Map<string, string>` and logged to console. This enables development and demo without Electron.

### Prompt Templates

**To Generator (initial):**

```markdown
## Harness Task [Sprint {N}]

You are a Generator. Implement the following plan.

### Plan
{plan.md content}

### Requirements
- Output your implementation result and key decisions
- If anything is unclear, use your best judgment
```

**To Evaluator:**

```markdown
## Harness Review [Sprint {N}, Round {M}]

You are an Evaluator. Evaluate the implementation against the plan.

### Original Plan
{plan.md content}

### Implementation Result
{result.md content}

### Evaluation Requirements
- Score on: functional completeness, code quality, plan adherence (1-10 each)
- Final verdict: PASS or FAIL
- If FAIL, provide specific revision suggestions
- Last line MUST be: `VERDICT: PASS` or `VERDICT: FAIL`
```

**To Generator (rework):**

```markdown
## Harness Revision [Sprint {N}, Round {M}]

You are a Generator. The Evaluator rejected your implementation. Revise based on feedback.

### Original Plan
{plan.md content}

### Your Previous Implementation
{result.md content}

### Evaluator Feedback
{review.md content}

### Requirements
- Address each feedback item
- Output the complete revised result
```

### Verdict Parsing

Controller scans Evaluator output for `VERDICT: PASS` or `VERDICT: FAIL`. If unparseable, defaults to FAIL with a warning logged.

---

## 5. Error Handling & Edge Cases

### Session Errors

| Scenario | Handling |
|----------|----------|
| Generator/Evaluator stream interrupts or errors | Mark session as error, pause pipeline, notify user |
| Session manually deleted by user | Detect broken connection, pause pipeline, prompt user to reconnect or cancel |
| AI returns empty content | Treat as failed round, consume one retry |
| Evaluator output unparseable (no VERDICT) | Default FAIL, write to review.md with "verdict unparseable" note |

### Concurrency

| Scenario | Handling |
|----------|----------|
| User manually messages Generator during pipeline | Pause pipeline, wait for manual operation to complete, allow resume |
| User edits connections during pipeline run | Block connection edits on running groups; must pause first |
| Multiple Generators finish at different times | Controller uses pendingGenerators Set; triggers Evaluator when set is empty |

### Pause/Resume/Stop Semantics

- **Pause**: Controller stops dispatching new steps. In-flight AI responses are allowed to complete naturally (not interrupted). On completion, Controller does NOT advance the pipeline; it stores the pending next step.
- **Resume**: Controller picks up from the stored pending step and continues the pipeline.
- **Stop**: Like pause, but also resets `currentRound` to 0 and marks group as `idle`. Any pending state is discarded. In-flight responses still complete but results are ignored by the Controller.
- **Persistence**: Pause/stop state is saved to DB. On app restart, paused groups remain paused; stopped groups are idle.

### Connection Deletion Cascade

When a session is deleted:
- All `HarnessConnection` entries referencing that session are removed
- If the deleted session was the group's only Planner, the entire group is dissolved (marked `idle`, connections cleared, user notified)
- If it was one of multiple Generators, the group remains valid with remaining Generators
- If a pipeline is running, it is stopped first

### Persistence

- `HarnessGroup` and `HarnessConnection` data persisted to backend DB alongside sessions
- App restart recovers connection relationships and pipeline state
- `.harness/` directory files are persistent and browsable

### Git Integration

`.harness/` is NOT added to `.gitignore` by default - users can track collaboration history in git. Users may add it to `.gitignore` themselves if desired.

---

## 6. Architecture Diagram

```
                    CanvasView
                   (drag-to-connect UI)
                        |
                        v
     App.tsx  <-->  HarnessController
      |                 |
      |    +-----------+-----------+
      |    |           |           |
      v    v           v           v
   Session A       Session B    Session C
   (Planner)      (Generator)  (Evaluator)
      |               |           |
      |   plan.md      |  result.md  |  review.md
      +------>  .harness/<group>/sprint-N/  <------+
```

## 7. Key Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/types.ts` | Modify | Add HarnessRole, HarnessConnection, HarnessGroup types; extend Session |
| `src/services/harnessController.ts` | Create | useHarnessController hook: connections, pipeline, completion detection |
| `src/services/harnessFiles.ts` | Create | File I/O wrapper with sanitization and non-Electron fallback |
| `src/services/harnessPrompts.ts` | Create | Prompt templates for Generator/Evaluator |
| `src/components/CanvasView.tsx` | Modify | Add connection anchors, drag-to-connect, line rendering |
| `src/components/HarnessControlBar.tsx` | Create | Pipeline control UI |
| `src/components/ConnectionLine.tsx` | Create | SVG connection line component |
| `src/components/RoleBadge.tsx` | Create | Session role badge component |
| `src/components/RolePickerModal.tsx` | Create | Role assignment popup on connection |
| `src/components/SessionWindow.tsx` | Modify | Add forwardRef + useImperativeHandle for injectMessage |
| `src/App.tsx` | Modify | Integrate useHarnessController hook, sessionRefs map, pass to views |
| `electron/preload.ts` | Modify | Add harness:write-file, harness:read-file, harness:mkdir IPC channels |
| `electron/main.ts` | Modify | Add IPC handlers for harness file operations |
