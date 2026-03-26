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

### Interface

```typescript
interface HarnessController {
  // Connection management
  createGroup(name: string): HarnessGroup;
  addConnection(groupId: string, from: string, to: string, fromRole: HarnessRole, toRole: HarnessRole): void;
  removeConnection(connectionId: string): void;

  // Pipeline execution
  startPipeline(groupId: string, userPrompt: string): void;
  pausePipeline(groupId: string): void;
  resumePipeline(groupId: string): void;

  // Internal
  onSessionComplete(sessionId: string, groupId: string): void;
}
```

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
- Controller waits for ALL Generators to complete before triggering Evaluator
- Evaluator receives all results for unified or per-generator evaluation

### Completion Detection

Leverages existing `message.complete` backend event. When an assistant message finishes streaming, Controller's `onSessionComplete` fires.

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

```typescript
async function writeHarnessFile(
  projectDir: string,
  groupId: string,
  sprint: number,
  filename: string,
  content: string
): Promise<string> {
  const dir = `${projectDir}/.harness/${groupId}/sprint-${sprint}`;
  await backend.exec(`mkdir -p ${dir}`);
  const filePath = `${dir}/${filename}`;
  await backend.writeFile(filePath, content);
  return filePath;
}

async function readHarnessFile(
  projectDir: string,
  groupId: string,
  sprint: number,
  filename: string
): Promise<string> {
  const filePath = `${projectDir}/.harness/${groupId}/sprint-${sprint}/${filename}`;
  return await backend.readFile(filePath);
}
```

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
| Multiple Generators finish at different times | Controller waits for ALL Generators to complete before triggering Evaluator |

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
| `src/services/harnessController.ts` | Create | Core controller logic: connections, pipeline, file I/O |
| `src/services/harnessPrompts.ts` | Create | Prompt templates for Generator/Evaluator |
| `src/components/CanvasView.tsx` | Modify | Add connection anchors, drag-to-connect, line rendering |
| `src/components/HarnessControlBar.tsx` | Create | Pipeline control UI |
| `src/components/ConnectionLine.tsx` | Create | SVG connection line component |
| `src/components/RoleBadge.tsx` | Create | Session role badge component |
| `src/components/RolePickerModal.tsx` | Create | Role assignment popup on connection |
| `src/App.tsx` | Modify | Integrate HarnessController state, pass to views |
