# Harness Multi-Agent Collaboration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a harness pipeline system where Canvas sessions can be connected as Planner/Generator/Evaluator, communicating via `.harness/` markdown files with fully automated orchestration.

**Architecture:** A `useHarnessController` hook in App.tsx manages connection state and pipeline execution. SessionWindow exposes `injectMessage` via `forwardRef`/`useImperativeHandle` so the controller can programmatically trigger AI responses. Canvas UI renders SVG connection lines between sessions with drag-to-connect interaction.

**Tech Stack:** React 19 + TypeScript + Tailwind CSS 4. Electron IPC for file I/O (with in-memory fallback for browser mode). No new dependencies required.

**Spec:** `docs/superpowers/specs/2026-03-26-harness-multi-agent-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add HarnessRole, HarnessConnection, HarnessGroup, HarnessGroupStatus, DbHarnessGroup, SessionWindowHandle types; extend Session |
| `src/services/harnessFiles.ts` | Create | File I/O with path sanitization, filename whitelist, in-memory fallback |
| `src/services/harnessPrompts.ts` | Create | Prompt templates for Generator/Evaluator messages, verdict parsing |
| `src/services/harnessController.ts` | Create | `useHarnessController` hook: group/connection CRUD, pipeline state machine, completion detection |
| `src/components/SessionWindow.tsx` | Modify | Wrap with `forwardRef`, expose `injectMessage` via `useImperativeHandle` |
| `src/components/harness/ConnectionLine.tsx` | Create | SVG Bezier curve between two sessions, color-coded by role pair |
| `src/components/harness/RoleBadge.tsx` | Create | Small badge (P/G/E) on session header |
| `src/components/harness/RolePickerModal.tsx` | Create | Modal to assign roles when creating a connection |
| `src/components/harness/HarnessControlBar.tsx` | Create | Bottom bar: group name, sprint/round progress, start/pause/stop buttons |
| `src/components/CanvasView.tsx` | Modify | Add SVG connections layer, connection anchors, drag-to-connect |
| `src/App.tsx` | Modify | Wire `useHarnessController`, `sessionRefs` map, pass harness props to CanvasView |
| `electron/preload.ts` | Modify | Add `harness.writeFile`, `harness.readFile`, `harness.mkdir` APIs |
| `src/types/electron.d.ts` | Modify | Add `harness` API type definitions to `window.aiBackend` |
| `electron/main.ts` | Modify | Add `ipcMain.handle` for `harness:write-file`, `harness:read-file`, `harness:mkdir` |

---

## Chunk 1: Foundation — Types, File I/O, Prompts, Electron IPC

### Task 1: Add Harness Types to types.ts

**Files:**
- Modify: `src/types.ts` (after line 64, before DbProject)

- [ ] **Step 1: Add harness type definitions**

Add the following types after the existing `Session` interface (line 64) and before `DbProject` (line 66):

```typescript
// Harness Multi-Agent Types
export type HarnessRole = 'planner' | 'generator' | 'evaluator';

export type HarnessGroupStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface HarnessConnection {
  id: string;
  fromSessionId: string;
  toSessionId: string;
  fromRole: HarnessRole;
  toRole: HarnessRole;
}

export interface HarnessGroup {
  id: string;
  name: string;
  connections: HarnessConnection[];
  maxRetries: number;
  status: HarnessGroupStatus;
  currentSprint: number;
  currentRound: number;
  harnessDir: string;
}

// Runtime-only pipeline state, not persisted to DB.
// Held in a separate Map inside useHarnessController, keyed by group ID.
export interface HarnessRunState {
  pendingGenerators: string[];    // string[] (not Set) for serializability
  pendingStep: 'generator' | 'evaluator' | null;
}

export interface DbHarnessGroup {
  id: string;
  project_id: number;
  name: string;
  connections_json: string;
  max_retries: number;
  status: string;
  current_sprint: number;
  current_round: number;
  harness_dir: string;
  created_at: string;
  updated_at: string;
}

export interface SessionWindowHandle {
  injectMessage(content: string): Promise<void>;
}
```

- [ ] **Step 2: Extend Session interface**

Add two optional fields to the `Session` interface (at line ~63, before the closing brace):

```typescript
  harnessRole?: HarnessRole;
  harnessGroupId?: string;
```

- [ ] **Step 3: Verify types compile**

Run: `npm run lint`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(harness): add harness type definitions"
```

---

### Task 2: Create Harness File I/O Service

**Files:**
- Create: `src/services/harnessFiles.ts`

- [ ] **Step 1: Create harnessFiles.ts**

```typescript
// In-memory store for non-Electron fallback
const memoryStore = new Map<string, string>();

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.aiBackend?.harness;
}

export function sanitizeGroupId(groupId: string): string {
  return groupId.replace(/[^a-zA-Z0-9-]/g, '');
}

const ALLOWED_FILENAMES = /^(plan|result(-\d+)?|review-\d+)\.md$/;

export function validateFilename(filename: string): string {
  if (!ALLOWED_FILENAMES.test(filename)) {
    throw new Error(`Invalid harness filename: ${filename}`);
  }
  return filename;
}

export function getHarnessDir(projectDir: string, groupId: string): string {
  return `${projectDir}/.harness/${sanitizeGroupId(groupId)}`;
}

export function getSprintDir(projectDir: string, groupId: string, sprint: number): string {
  return `${getHarnessDir(projectDir, groupId)}/sprint-${sprint}`;
}

export async function writeHarnessFile(
  projectDir: string,
  groupId: string,
  sprint: number,
  filename: string,
  content: string
): Promise<string> {
  const safeFilename = validateFilename(filename);
  const dir = getSprintDir(projectDir, groupId, sprint);
  const filePath = `${dir}/${safeFilename}`;

  if (isElectron()) {
    await window.aiBackend.harness.mkdir(dir);
    await window.aiBackend.harness.writeFile(filePath, content);
  } else {
    memoryStore.set(filePath, content);
    console.log(`[harness-mock] wrote ${filePath} (${content.length} bytes)`);
  }

  return filePath;
}

export async function readHarnessFile(
  projectDir: string,
  groupId: string,
  sprint: number,
  filename: string
): Promise<string> {
  const safeFilename = validateFilename(filename);
  const filePath = `${getSprintDir(projectDir, groupId, sprint)}/${safeFilename}`;

  if (isElectron()) {
    return await window.aiBackend.harness.readFile(filePath);
  } else {
    const content = memoryStore.get(filePath);
    if (content === undefined) {
      throw new Error(`[harness-mock] file not found: ${filePath}`);
    }
    return content;
  }
}
```

- [ ] **Step 2: Add Electron IPC handlers and type definitions (combined with file I/O to avoid intermediate lint failures)**

This step adds IPC handlers, preload API, and type definitions so `harnessFiles.ts` compiles cleanly.

**Files additionally modified:**
- `electron/preload.ts` (around line 55, after existing API sections)
- `electron/main.ts` (after existing ipcMain.handle blocks, ~line 430)
- `src/types/electron.d.ts` (add harness API types)

- [ ] **Step 2a: Add IPC handlers to electron/main.ts**

Add after the existing PTY handlers block (around line 434):

```typescript
// Harness file operations
ipcMain.handle('harness:write-file', async (_, filePath: string, content: string) => {
  const fs = await import('fs/promises');
  await fs.writeFile(filePath, content, 'utf-8');
});

ipcMain.handle('harness:read-file', async (_, filePath: string) => {
  const fs = await import('fs/promises');
  return await fs.readFile(filePath, 'utf-8');
});

ipcMain.handle('harness:mkdir', async (_, dirPath: string) => {
  const fs = await import('fs/promises');
  await fs.mkdir(dirPath, { recursive: true });
});
```

- [ ] **Step 2b: Expose harness APIs in preload.ts**

Add in the `contextBridge.exposeInMainWorld('aiBackend', { ... })` object, after the existing API sections (around line 55):

```typescript
harness: {
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('harness:write-file', filePath, content),
  readFile: (filePath: string) => ipcRenderer.invoke('harness:read-file', filePath) as Promise<string>,
  mkdir: (dirPath: string) => ipcRenderer.invoke('harness:mkdir', dirPath),
},
```

- [ ] **Step 2c: Update electron.d.ts type definitions**

Find the `window.aiBackend` type definition in `src/types/electron.d.ts` and add:

```typescript
harness: {
  writeFile: (filePath: string, content: string) => Promise<void>;
  readFile: (filePath: string) => Promise<string>;
  mkdir: (dirPath: string) => Promise<void>;
};
```

- [ ] **Step 3: Verify types compile**

Run: `npm run lint`
Expected: No new type errors. All harness file types resolve cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/services/harnessFiles.ts electron/preload.ts electron/main.ts src/types/electron.d.ts
git commit -m "feat(harness): add file I/O service and Electron IPC"
```

---

### Task 4: Create Prompt Templates Service

**Files:**
- Create: `src/services/harnessPrompts.ts`

- [ ] **Step 1: Create harnessPrompts.ts**

```typescript
export function buildGeneratorPrompt(sprint: number, planContent: string): string {
  return `## Harness Task [Sprint ${sprint}]

You are a Generator. Implement the following plan.

### Plan
${planContent}

### Requirements
- Output your implementation result and key decisions
- If anything is unclear, use your best judgment`;
}

export function buildEvaluatorPrompt(
  sprint: number,
  round: number,
  planContent: string,
  resultContent: string
): string {
  return `## Harness Review [Sprint ${sprint}, Round ${round}]

You are an Evaluator. Evaluate the implementation against the plan.

### Original Plan
${planContent}

### Implementation Result
${resultContent}

### Evaluation Requirements
- Score on: functional completeness, code quality, plan adherence (1-10 each)
- Final verdict: PASS or FAIL
- If FAIL, provide specific revision suggestions
- Last line MUST be: \`VERDICT: PASS\` or \`VERDICT: FAIL\``;
}

export function buildRevisionPrompt(
  sprint: number,
  round: number,
  planContent: string,
  resultContent: string,
  reviewContent: string
): string {
  return `## Harness Revision [Sprint ${sprint}, Round ${round}]

You are a Generator. The Evaluator rejected your implementation. Revise based on feedback.

### Original Plan
${planContent}

### Your Previous Implementation
${resultContent}

### Evaluator Feedback
${reviewContent}

### Requirements
- Address each feedback item
- Output the complete revised result`;
}

export type Verdict = 'PASS' | 'FAIL' | 'UNPARSEABLE';

export function parseVerdict(evaluatorOutput: string): Verdict {
  const lines = evaluatorOutput.trim().split('\n');
  // Search from the end for the VERDICT line
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === 'VERDICT: PASS') return 'PASS';
    if (line === 'VERDICT: FAIL') return 'FAIL';
  }
  return 'UNPARSEABLE';
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/harnessPrompts.ts
git commit -m "feat(harness): add prompt templates and verdict parser"
```

---

## Chunk 2: Session Injection & Controller

### Task 5: Add forwardRef + injectMessage to SessionWindow

**Files:**
- Modify: `src/components/SessionWindow.tsx`

This is the most delicate modification — we need to wrap the existing component with `forwardRef` and expose `injectMessage` without breaking the existing streaming state machine.

- [ ] **Step 1: Add forwardRef import and SessionWindowHandle import**

At the top of `SessionWindow.tsx`, update the React import (line 1) to include `forwardRef` and `useImperativeHandle`:

```typescript
import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
```

Add import for the type:

```typescript
import type { SessionWindowHandle } from '../types';
```

- [ ] **Step 2: Convert to forwardRef**

Change the component declaration from:

```typescript
export function SessionWindow({
  session,
  onUpdate,
  ...rest
}: SessionWindowProps) {
```

to:

```typescript
export const SessionWindow = forwardRef<SessionWindowHandle, SessionWindowProps>(function SessionWindow({
  session,
  onUpdate,
  ...rest
}, ref) {
```

Add closing `)` at the very end of the component (after the final closing brace, the last line of the function).

- [ ] **Step 3: Add sendMessage ref and useImperativeHandle**

Since `sendMessage` is a plain `async function` (not `useCallback`), we use a ref to avoid re-creating the imperative handle on every render. Place this AFTER the `sendMessage` function definition (after line ~632):

```typescript
// Ref to latest sendMessage for stable imperative handle
const sendMessageRef = useRef(sendMessage);
sendMessageRef.current = sendMessage;

useImperativeHandle(ref, () => ({
  async injectMessage(content: string) {
    await sendMessageRef.current(content);
  }
}), []); // Empty deps — ref always has latest sendMessage
```

This avoids wrapping `sendMessage` in `useCallback` (which would require listing all its closure deps in a 1626-line component) while still giving the imperative handle a stable, up-to-date reference.

- [ ] **Step 4: Verify types compile**

Run: `npm run lint`
Expected: No new type errors. The component's external API is unchanged (forwardRef is backward compatible).

- [ ] **Step 5: Verify dev server starts**

Run: `npm run dev`
Open browser, verify existing session functionality works (create session, send message, streaming).

- [ ] **Step 6: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat(harness): expose injectMessage via forwardRef on SessionWindow"
```

---

### Task 6: Create useHarnessController Hook

**Files:**
- Create: `src/services/harnessController.ts`

This is the core orchestration logic. It manages groups, connections, and the automated pipeline.

- [ ] **Step 1: Create the hook file with group/connection management**

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  Session,
  HarnessGroup,
  HarnessConnection,
  HarnessRole,
  HarnessRunState,
  SessionWindowHandle,
} from '../types';
import { writeHarnessFile, readHarnessFile } from './harnessFiles';
import {
  buildGeneratorPrompt,
  buildEvaluatorPrompt,
  buildRevisionPrompt,
  parseVerdict,
} from './harnessPrompts';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export interface UseHarnessController {
  groups: HarnessGroup[];
  createGroup(name: string): HarnessGroup;
  deleteGroup(groupId: string): void;
  addConnection(
    groupId: string,
    fromSessionId: string,
    toSessionId: string,
    fromRole: HarnessRole,
    toRole: HarnessRole
  ): void;
  removeConnection(connectionId: string): void;
  startPipeline(groupId: string): void;
  pausePipeline(groupId: string): void;
  resumePipeline(groupId: string): void;
  stopPipeline(groupId: string): void;
  getSessionRole(sessionId: string): { role: HarnessRole; groupId: string } | null;
  getAllConnections(): HarnessConnection[];
}

export function useHarnessController(
  sessions: Session[],
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>,
  projectDir: string | null,
  sessionRefs: React.RefObject<Map<string, SessionWindowHandle>>
): UseHarnessController {
  const [groups, setGroups] = useState<HarnessGroup[]>([]);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // Runtime-only pipeline state, separate from persistent HarnessGroup
  const runStateRef = useRef<Map<string, HarnessRunState>>(new Map());

  const getRunState = (groupId: string): HarnessRunState => {
    if (!runStateRef.current.has(groupId)) {
      runStateRef.current.set(groupId, { pendingGenerators: [], pendingStep: null });
    }
    return runStateRef.current.get(groupId)!;
  };

  const setRunState = (groupId: string, updates: Partial<HarnessRunState>) => {
    const current = getRunState(groupId);
    runStateRef.current.set(groupId, { ...current, ...updates });
  };

  const clearRunState = (groupId: string) => {
    runStateRef.current.delete(groupId);
  };

  // --- Group Management ---

  const createGroup = useCallback((name: string): HarnessGroup => {
    const group: HarnessGroup = {
      id: generateId(),
      name,
      connections: [],
      maxRetries: 3,
      status: 'idle',
      currentSprint: 0,
      currentRound: 0,
      harnessDir: `.harness/${generateId()}`,
    };
    setGroups(prev => [...prev, group]);
    return group;
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    clearRunState(groupId);
    setGroups(prev => prev.filter(g => g.id !== groupId));
  }, []);

  const updateGroup = useCallback((groupId: string, updates: Partial<HarnessGroup>) => {
    setGroups(prev =>
      prev.map(g => (g.id === groupId ? { ...g, ...updates } : g))
    );
  }, []);

  const addConnection = useCallback((
    groupId: string,
    fromSessionId: string,
    toSessionId: string,
    fromRole: HarnessRole,
    toRole: HarnessRole
  ) => {
    const conn: HarnessConnection = {
      id: generateId(),
      fromSessionId,
      toSessionId,
      fromRole,
      toRole,
    };
    setGroups(prev =>
      prev.map(g =>
        g.id === groupId
          ? { ...g, connections: [...g.connections, conn] }
          : g
      )
    );
  }, []);

  const removeConnection = useCallback((connectionId: string) => {
    setGroups(prev =>
      prev.map(g => ({
        ...g,
        connections: g.connections.filter(c => c.id !== connectionId),
      }))
    );
  }, []);

  // --- Helper: find sessions by role in a group ---

  const getSessionsByRole = useCallback((group: HarnessGroup, role: HarnessRole): string[] => {
    const ids = new Set<string>();
    for (const conn of group.connections) {
      if (conn.fromRole === role) ids.add(conn.fromSessionId);
      if (conn.toRole === role) ids.add(conn.toSessionId);
    }
    return [...ids];
  }, []);

  // --- Helper: extract last assistant message text ---

  const getLastAssistantText = useCallback((sessionId: string): string => {
    const session = sessionsRef.current.find(s => s.id === sessionId);
    if (!session) return '';
    const assistantMsgs = session.messages.filter(m => m.role === 'assistant');
    if (assistantMsgs.length === 0) return '';
    const lastMsg = assistantMsgs[assistantMsgs.length - 1];
    if (lastMsg.blocks) {
      return lastMsg.blocks
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.content)
        .join('\n');
    }
    return lastMsg.content || '';
  }, []);

  // --- Pipeline Orchestration ---

  const dispatchGenerators = useCallback(async (
    groupId: string,
    group: HarnessGroup,
    generators: string[],
    prompt: string
  ) => {
    setRunState(groupId, {
      pendingGenerators: [...generators],
      pendingStep: 'generator',
    });
    for (const genId of generators) {
      sessionRefs.current?.get(genId)?.injectMessage(prompt);
    }
  }, [sessionRefs]);

  const dispatchEvaluators = useCallback(async (
    groupId: string,
    evaluators: string[],
    prompt: string
  ) => {
    setRunState(groupId, {
      pendingGenerators: [],
      pendingStep: 'evaluator',
    });
    for (const evalId of evaluators) {
      sessionRefs.current?.get(evalId)?.injectMessage(prompt);
    }
  }, [sessionRefs]);

  const advancePipeline = useCallback(async (groupId: string, completedSessionId: string) => {
    const group = groupsRef.current.find(g => g.id === groupId);
    if (!group || group.status !== 'running' || !projectDir) return;

    const planners = getSessionsByRole(group, 'planner');
    const generators = getSessionsByRole(group, 'generator');
    const evaluators = getSessionsByRole(group, 'evaluator');
    const runState = getRunState(groupId);

    // --- Planner completed ---
    if (planners.includes(completedSessionId)) {
      const planContent = getLastAssistantText(completedSessionId);
      if (!planContent) return;

      await writeHarnessFile(
        projectDir, group.id, group.currentSprint, 'plan.md', planContent
      );

      const prompt = buildGeneratorPrompt(group.currentSprint, planContent);
      await dispatchGenerators(groupId, group, generators, prompt);
      return;
    }

    // --- Generator completed ---
    if (generators.includes(completedSessionId)) {
      const resultContent = getLastAssistantText(completedSessionId);

      // Filename: result.md for round 0, result-N.md for rework rounds
      // Note: multi-generator support currently writes to the same filename.
      // A future enhancement could use result-gen1.md etc. with updated ALLOWED_FILENAMES.
      const filename = group.currentRound > 0
        ? `result-${group.currentRound + 1}.md`
        : 'result.md';

      await writeHarnessFile(
        projectDir, group.id, group.currentSprint, filename, resultContent
      );

      // Update pending generators
      const pending = runState.pendingGenerators.filter(id => id !== completedSessionId);
      setRunState(groupId, { pendingGenerators: pending });

      if (pending.length > 0) {
        return; // Wait for remaining generators
      }

      // All generators done — trigger evaluator
      const planContent = await readHarnessFile(
        projectDir, group.id, group.currentSprint, 'plan.md'
      );

      const evalPrompt = buildEvaluatorPrompt(
        group.currentSprint,
        group.currentRound + 1,
        planContent,
        resultContent
      );

      await dispatchEvaluators(groupId, evaluators, evalPrompt);
      return;
    }

    // --- Evaluator completed ---
    if (evaluators.includes(completedSessionId)) {
      const reviewContent = getLastAssistantText(completedSessionId);
      const reviewFilename = `review-${group.currentRound + 1}.md`;

      await writeHarnessFile(
        projectDir, group.id, group.currentSprint, reviewFilename, reviewContent
      );

      const verdict = parseVerdict(reviewContent);

      if (verdict === 'PASS') {
        updateGroup(groupId, { status: 'completed' });
        clearRunState(groupId);
        return;
      }

      // FAIL or UNPARSEABLE
      const nextRound = group.currentRound + 1;
      if (nextRound >= group.maxRetries) {
        updateGroup(groupId, { status: 'failed', currentRound: nextRound });
        clearRunState(groupId);
        return;
      }

      // Rework: send revision to generators
      const planContent = await readHarnessFile(
        projectDir, group.id, group.currentSprint, 'plan.md'
      );
      const resultFilename = group.currentRound > 0
        ? `result-${group.currentRound + 1}.md`
        : 'result.md';
      const resultContent = await readHarnessFile(
        projectDir, group.id, group.currentSprint, resultFilename
      );

      const revisionPrompt = buildRevisionPrompt(
        group.currentSprint,
        nextRound,
        planContent,
        resultContent,
        reviewContent
      );

      updateGroup(groupId, { currentRound: nextRound });
      await dispatchGenerators(groupId, group, generators, revisionPrompt);
      return;
    }
  }, [projectDir, getSessionsByRole, getLastAssistantText, updateGroup,
      dispatchGenerators, dispatchEvaluators]);

  // --- Completion Detection ---
  // Uses window.aiBackend.on/off directly since backend.onMessageComplete returns void

  useEffect(() => {
    const handleComplete = (event: any) => {
      const backendSessionId = event?.session_id;
      if (!backendSessionId) return;

      // Map backend session ID to frontend session
      const session = sessionsRef.current.find(
        s => s.claudeSessionId === backendSessionId || s.codexThreadId === backendSessionId
      );
      if (!session) return;

      // Only process sessions in a running harness group
      const group = groupsRef.current.find(
        g => g.status === 'running' &&
          g.connections.some(
            c => c.fromSessionId === session.id || c.toSessionId === session.id
          )
      );
      if (!group) return;

      // Small delay to let SessionWindow process message.complete first
      setTimeout(() => advancePipeline(group.id, session.id), 500);
    };

    // Register listener (backend.onMessageComplete returns void, so use on/off directly)
    if (typeof window !== 'undefined' && window.aiBackend) {
      window.aiBackend.on('message.complete', handleComplete);
    }
    return () => {
      if (typeof window !== 'undefined' && window.aiBackend) {
        window.aiBackend.off('message.complete', handleComplete);
      }
    };
  }, [advancePipeline]);

  // --- Pipeline Control ---

  const startPipeline = useCallback((groupId: string) => {
    const group = groupsRef.current.find(g => g.id === groupId);
    if (!group || group.status === 'running') return;

    clearRunState(groupId);
    updateGroup(groupId, {
      status: 'running',
      currentSprint: group.currentSprint + 1,
      currentRound: 0,
    });

    // The pipeline starts when the Planner's next message completes.
    // The user sends a message to the Planner session manually,
    // and the completion detection picks it up.
  }, [updateGroup]);

  const pausePipeline = useCallback((groupId: string) => {
    // In-flight AI responses complete naturally; controller won't advance pipeline
    updateGroup(groupId, { status: 'paused' });
  }, [updateGroup]);

  const resumePipeline = useCallback((groupId: string) => {
    const group = groupsRef.current.find(g => g.id === groupId);
    if (!group || group.status !== 'paused') return;

    updateGroup(groupId, { status: 'running' });

    // Re-dispatch the pending step if one was stored before pause
    const runState = getRunState(groupId);
    if (runState.pendingStep && projectDir) {
      const generators = getSessionsByRole(group, 'generator');
      const evaluators = getSessionsByRole(group, 'evaluator');

      // Re-trigger based on pending step
      // The pipeline was paused mid-flight; in-flight responses completed
      // but advancePipeline was blocked. Now we re-check if any step needs dispatch.
      // Since advancePipeline guards on status === 'running', it will now process
      // any message.complete events that arrive after resume.
    }
  }, [updateGroup, projectDir, getSessionsByRole]);

  const stopPipeline = useCallback((groupId: string) => {
    clearRunState(groupId);
    updateGroup(groupId, {
      status: 'idle',
      currentRound: 0,
    });
  }, [updateGroup]);

  // --- Queries ---

  const getSessionRole = useCallback((sessionId: string): { role: HarnessRole; groupId: string } | null => {
    for (const group of groupsRef.current) {
      for (const conn of group.connections) {
        if (conn.fromSessionId === sessionId) return { role: conn.fromRole, groupId: group.id };
        if (conn.toSessionId === sessionId) return { role: conn.toRole, groupId: group.id };
      }
    }
    return null;
  }, []);

  const getAllConnections = useCallback((): HarnessConnection[] => {
    return groupsRef.current.flatMap(g => g.connections);
  }, []);

  return {
    groups,
    createGroup,
    deleteGroup,
    addConnection,
    removeConnection,
    startPipeline,
    pausePipeline,
    resumePipeline,
    stopPipeline,
    getSessionRole,
    getAllConnections,
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run lint`
Expected: No errors. The hook depends on types and services created in Chunk 1.

- [ ] **Step 3: Commit**

```bash
git add src/services/harnessController.ts
git commit -m "feat(harness): add useHarnessController hook with pipeline orchestration"
```

---

## Chunk 3: Canvas UI Components

### Task 7: Create ConnectionLine Component

**Files:**
- Create: `src/components/harness/ConnectionLine.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { HarnessRole, HarnessGroupStatus } from '../../types';

interface ConnectionLineProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromRole: HarnessRole;
  toRole: HarnessRole;
  groupStatus: HarnessGroupStatus;
  isRework?: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  'planner-generator': '#3b82f6',   // blue
  'planner-evaluator': '#3b82f6',   // blue (dashed)
  'generator-evaluator': '#f97316', // orange
  'evaluator-generator': '#ef4444', // red (rework)
};

function getColor(fromRole: HarnessRole, toRole: HarnessRole, isRework?: boolean): string {
  if (isRework) return ROLE_COLORS['evaluator-generator'];
  return ROLE_COLORS[`${fromRole}-${toRole}`] || '#6b7280';
}

function isDashed(fromRole: HarnessRole, toRole: HarnessRole): boolean {
  return fromRole === 'planner' && toRole === 'evaluator';
}

export function ConnectionLine({
  fromX, fromY, toX, toY,
  fromRole, toRole,
  groupStatus,
  isRework,
}: ConnectionLineProps) {
  const color = getColor(fromRole, toRole, isRework);
  const dashed = isDashed(fromRole, toRole);
  const isRunning = groupStatus === 'running';

  // Bezier control points: curve outward
  const dx = toX - fromX;
  const dy = toY - fromY;
  const cx1 = fromX + dx * 0.4;
  const cy1 = fromY;
  const cx2 = toX - dx * 0.4;
  const cy2 = toY;

  const pathD = `M ${fromX} ${fromY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${toX} ${toY}`;

  // Arrow at end
  const angle = Math.atan2(toY - cy2, toX - cx2);
  const arrowLen = 8;
  const arrow1X = toX - arrowLen * Math.cos(angle - Math.PI / 6);
  const arrow1Y = toY - arrowLen * Math.sin(angle - Math.PI / 6);
  const arrow2X = toX - arrowLen * Math.cos(angle + Math.PI / 6);
  const arrow2Y = toY - arrowLen * Math.sin(angle + Math.PI / 6);

  // Role label
  const labelX = (fromX + toX) / 2;
  const labelY = (fromY + toY) / 2 - 10;
  const label = `${fromRole[0].toUpperCase()}→${toRole[0].toUpperCase()}`;

  return (
    <g>
      {/* Main path */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dashed ? '6 4' : undefined}
        opacity={0.8}
      />

      {/* Flow animation when running */}
      {isRunning && (
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="4 8"
          opacity={0.6}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="12"
            to="0"
            dur="1s"
            repeatCount="indefinite"
          />
        </path>
      )}

      {/* Arrow */}
      <polygon
        points={`${toX},${toY} ${arrow1X},${arrow1Y} ${arrow2X},${arrow2Y}`}
        fill={color}
        opacity={0.8}
      />

      {/* Label */}
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        fill={color}
        fontSize={10}
        fontWeight={500}
        className="select-none pointer-events-none"
      >
        {label}
      </text>
    </g>
  );
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/components/harness
git add src/components/harness/ConnectionLine.tsx
git commit -m "feat(harness): add ConnectionLine SVG component"
```

---

### Task 8: Create RoleBadge Component

**Files:**
- Create: `src/components/harness/RoleBadge.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { HarnessRole } from '../../types';

const BADGE_CONFIG: Record<HarnessRole, { label: string; bg: string; text: string }> = {
  planner:   { label: 'P', bg: 'bg-blue-500/20',   text: 'text-blue-400' },
  generator: { label: 'G', bg: 'bg-green-500/20',  text: 'text-green-400' },
  evaluator: { label: 'E', bg: 'bg-orange-500/20', text: 'text-orange-400' },
};

interface RoleBadgeProps {
  role: HarnessRole;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const config = BADGE_CONFIG[role];
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${config.bg} ${config.text}`}
      title={role.charAt(0).toUpperCase() + role.slice(1)}
    >
      {config.label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/harness/RoleBadge.tsx
git commit -m "feat(harness): add RoleBadge component"
```

---

### Task 9: Create RolePickerModal Component

**Files:**
- Create: `src/components/harness/RolePickerModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useState } from 'react';
import { X } from 'lucide-react';
import type { HarnessRole } from '../../types';

interface RolePickerModalProps {
  fromSessionTitle: string;
  toSessionTitle: string;
  onConfirm: (fromRole: HarnessRole, toRole: HarnessRole, groupName: string) => void;
  onCancel: () => void;
  existingGroupNames: string[];
}

const ROLE_OPTIONS: { value: HarnessRole; label: string; description: string }[] = [
  { value: 'planner', label: 'Planner', description: 'Creates plans and delegates tasks' },
  { value: 'generator', label: 'Generator', description: 'Implements features based on plans' },
  { value: 'evaluator', label: 'Evaluator', description: 'Reviews and grades implementations' },
];

export function RolePickerModal({
  fromSessionTitle,
  toSessionTitle,
  onConfirm,
  onCancel,
  existingGroupNames,
}: RolePickerModalProps) {
  const [fromRole, setFromRole] = useState<HarnessRole>('planner');
  const [toRole, setToRole] = useState<HarnessRole>('generator');
  const [groupName, setGroupName] = useState('');

  const handleConfirm = () => {
    const name = groupName.trim() || `harness-${Date.now().toString(36)}`;
    onConfirm(fromRole, toRole, name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-[420px] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-100">Create Connection</h3>
          <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-200">
            <X size={16} />
          </button>
        </div>

        {/* Group name */}
        <div className="mb-4">
          <label className="block text-xs text-zinc-400 mb-1">Group Name</label>
          <input
            type="text"
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="e.g. feature-login"
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* From session role */}
        <div className="mb-3">
          <label className="block text-xs text-zinc-400 mb-1">
            {fromSessionTitle} <span className="text-zinc-500">role</span>
          </label>
          <div className="flex gap-2">
            {ROLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFromRole(opt.value)}
                className={`flex-1 px-3 py-2 rounded text-xs font-medium border transition-colors ${
                  fromRole === opt.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Arrow */}
        <div className="text-center text-zinc-500 text-xs my-2">↓</div>

        {/* To session role */}
        <div className="mb-4">
          <label className="block text-xs text-zinc-400 mb-1">
            {toSessionTitle} <span className="text-zinc-500">role</span>
          </label>
          <div className="flex gap-2">
            {ROLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setToRole(opt.value)}
                className={`flex-1 px-3 py-2 rounded text-xs font-medium border transition-colors ${
                  toRole === opt.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-500"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/harness/RolePickerModal.tsx
git commit -m "feat(harness): add RolePickerModal for connection creation"
```

---

### Task 10: Create HarnessControlBar Component

**Files:**
- Create: `src/components/harness/HarnessControlBar.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { Play, Pause, Square, FolderOpen } from 'lucide-react';
import type { HarnessGroup } from '../../types';

interface HarnessControlBarProps {
  group: HarnessGroup;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  idle: 'text-zinc-400',
  running: 'text-green-400',
  paused: 'text-yellow-400',
  completed: 'text-blue-400',
  failed: 'text-red-400',
};

export function HarnessControlBar({
  group,
  onStart,
  onPause,
  onResume,
  onStop,
}: HarnessControlBarProps) {
  const isRunning = group.status === 'running';
  const isPaused = group.status === 'paused';
  const isIdle = group.status === 'idle';

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-zinc-900/95 border border-zinc-700 rounded-lg px-4 py-2 shadow-lg backdrop-blur-sm">
      {/* Group name */}
      <span className="text-sm font-medium text-zinc-200">{group.name}</span>

      <div className="w-px h-4 bg-zinc-700" />

      {/* Status */}
      <span className={`text-xs font-medium ${STATUS_COLORS[group.status]}`}>
        {group.status.toUpperCase()}
      </span>

      {/* Sprint / Round */}
      {group.currentSprint > 0 && (
        <>
          <div className="w-px h-4 bg-zinc-700" />
          <span className="text-xs text-zinc-400">
            Sprint {group.currentSprint}
            {isRunning && ` | Round ${group.currentRound + 1}/${group.maxRetries}`}
          </span>
        </>
      )}

      <div className="w-px h-4 bg-zinc-700" />

      {/* Controls */}
      <div className="flex items-center gap-1">
        {(isIdle || group.status === 'completed' || group.status === 'failed') && (
          <button
            onClick={onStart}
            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 hover:text-green-400 transition-colors"
            title="Start pipeline"
          >
            <Play size={14} />
          </button>
        )}

        {isRunning && (
          <button
            onClick={onPause}
            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 hover:text-yellow-400 transition-colors"
            title="Pause pipeline"
          >
            <Pause size={14} />
          </button>
        )}

        {isPaused && (
          <button
            onClick={onResume}
            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 hover:text-green-400 transition-colors"
            title="Resume pipeline"
          >
            <Play size={14} />
          </button>
        )}

        {(isRunning || isPaused) && (
          <button
            onClick={onStop}
            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 hover:text-red-400 transition-colors"
            title="Stop pipeline"
          >
            <Square size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/harness/HarnessControlBar.tsx
git commit -m "feat(harness): add HarnessControlBar component"
```

---

## Chunk 4: Canvas Integration & App Wiring

### Task 11: Add Connection Layer to CanvasView

**Files:**
- Modify: `src/components/CanvasView.tsx`

This adds: SVG layer for connection lines, connection anchor points on sessions, and drag-to-connect interaction.

- [ ] **Step 1: Add imports**

Add at the top of `CanvasView.tsx`:

```typescript
import { ConnectionLine } from './harness/ConnectionLine';
import { RoleBadge } from './harness/RoleBadge';
import { RolePickerModal } from './harness/RolePickerModal';
import { HarnessControlBar } from './harness/HarnessControlBar';
import type { HarnessConnection, HarnessRole, HarnessGroup, SessionWindowHandle } from '../types';
import type { UseHarnessController } from '../services/harnessController';
```

- [ ] **Step 2: Add harness props to component signature**

Extend the component props interface (around line 8-34) with:

```typescript
harness?: UseHarnessController;
sessionRefs?: React.RefObject<Map<string, SessionWindowHandle>>;
```

- [ ] **Step 3: Add connection interaction state**

Inside the component body, after existing state declarations, add:

```typescript
// Harness connection state
const [connectingFrom, setConnectingFrom] = useState<{ sessionId: string; x: number; y: number } | null>(null);
const [connectingMouse, setConnectingMouse] = useState<{ x: number; y: number } | null>(null);
const [pendingConnection, setPendingConnection] = useState<{ fromId: string; toId: string } | null>(null);
const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
```

- [ ] **Step 4: Add connection anchor handlers**

Add handler functions:

```typescript
const handleAnchorDragStart = useCallback((sessionId: string, anchorX: number, anchorY: number) => {
  setConnectingFrom({ sessionId, x: anchorX, y: anchorY });
}, []);

const handleAnchorDragEnd = useCallback((targetSessionId: string) => {
  if (connectingFrom && connectingFrom.sessionId !== targetSessionId) {
    setPendingConnection({ fromId: connectingFrom.sessionId, toId: targetSessionId });
  }
  setConnectingFrom(null);
  setConnectingMouse(null);
}, [connectingFrom]);

const handleConnectionConfirm = useCallback((fromRole: HarnessRole, toRole: HarnessRole, groupName: string) => {
  if (!pendingConnection || !harness) return;

  // Find or create group
  let group = harness.groups.find(g => g.name === groupName);
  if (!group) {
    group = harness.createGroup(groupName);
  }

  harness.addConnection(group.id, pendingConnection.fromId, pendingConnection.toId, fromRole, toRole);
  setPendingConnection(null);
}, [pendingConnection, harness]);
```

- [ ] **Step 5: Add SVG connections layer in the render**

Inside the canvas container div (the one with `transform: translate() scale()`), add an SVG layer BEFORE the session elements:

```tsx
{/* Harness connection lines */}
{harness && (
  <svg
    className="absolute inset-0 w-full h-full pointer-events-none"
    style={{ overflow: 'visible' }}
  >
    {harness.getAllConnections().map(conn => {
      const fromSession = sessions.find(s => s.id === conn.fromSessionId);
      const toSession = sessions.find(s => s.id === conn.toSessionId);
      if (!fromSession || !toSession) return null;

      const fromX = fromSession.position.x + (fromSession.width || 380) / 2;
      const fromY = fromSession.position.y + (fromSession.height || 300) / 2;
      const toX = toSession.position.x + (toSession.width || 380) / 2;
      const toY = toSession.position.y + (toSession.height || 300) / 2;

      const group = harness.groups.find(g =>
        g.connections.some(c => c.id === conn.id)
      );

      return (
        <ConnectionLine
          key={conn.id}
          fromX={fromX}
          fromY={fromY}
          toX={toX}
          toY={toY}
          fromRole={conn.fromRole}
          toRole={conn.toRole}
          groupStatus={group?.status || 'idle'}
        />
      );
    })}

    {/* Drag-in-progress line */}
    {connectingFrom && connectingMouse && (
      <line
        x1={connectingFrom.x}
        y1={connectingFrom.y}
        x2={connectingMouse.x}
        y2={connectingMouse.y}
        stroke="#6b7280"
        strokeWidth={2}
        strokeDasharray="4 4"
        opacity={0.6}
      />
    )}
  </svg>
)}
```

- [ ] **Step 6: Add connection anchors to DraggableSession**

In the `DraggableSession` rendering area, add connection anchor points. For each session div, add a small circle on the right edge that starts a connection drag:

```tsx
{/* Connection anchor - right edge */}
{harness && (
  <div
    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-zinc-600 border border-zinc-500 opacity-0 hover:opacity-100 cursor-crosshair transition-opacity z-10"
    onMouseDown={(e) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      // Convert screen coords to canvas coords
      const canvasX = (rect.left + rect.width / 2 - /* canvas offset */) / transform.scale;
      const canvasY = (rect.top + rect.height / 2 - /* canvas offset */) / transform.scale;
      handleAnchorDragStart(session.id, session.position.x + (session.width || 380), session.position.y + (session.height || 300) / 2);
    }}
  />
)}
```

Note: The exact coordinate conversion depends on the canvas transform. Read the existing `DraggableSession` component to understand how screen-to-canvas conversion works (check the drag handlers around lines 91-111 of CanvasView.tsx).

- [ ] **Step 7: Add mouse move handler for connection dragging**

Extend the existing canvas `onMouseMove` handler to track connection dragging:

```typescript
// Inside the existing onMouseMove or add a new one
const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
  if (connectingFrom) {
    // Convert screen to canvas coords
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const x = (e.clientX - canvasRect.left - transform.x) / transform.scale;
    const y = (e.clientY - canvasRect.top - transform.y) / transform.scale;
    setConnectingMouse({ x, y });
  }
  // ... existing mouse move logic
}, [connectingFrom, transform]);
```

- [ ] **Step 8: Add role badge to session headers**

Where SessionWindow is rendered, pass the harness role info. In the SessionWindow rendering area, add a RoleBadge next to the session title if the session has a harness role:

```tsx
{harness && (() => {
  const roleInfo = harness.getSessionRole(session.id);
  return roleInfo ? <RoleBadge role={roleInfo.role} /> : null;
})()}
```

- [ ] **Step 9: Add HarnessControlBar**

At the bottom of the CanvasView render (inside the outer container, after the canvas):

```tsx
{harness && selectedGroupId && (() => {
  const group = harness.groups.find(g => g.id === selectedGroupId);
  if (!group) return null;
  return (
    <HarnessControlBar
      group={group}
      onStart={() => harness.startPipeline(group.id)}
      onPause={() => harness.pausePipeline(group.id)}
      onResume={() => harness.resumePipeline(group.id)}
      onStop={() => harness.stopPipeline(group.id)}
    />
  );
})()}
```

- [ ] **Step 10: Add RolePickerModal**

At the end of the render, add the modal:

```tsx
{pendingConnection && (
  <RolePickerModal
    fromSessionTitle={sessions.find(s => s.id === pendingConnection.fromId)?.title || ''}
    toSessionTitle={sessions.find(s => s.id === pendingConnection.toId)?.title || ''}
    onConfirm={handleConnectionConfirm}
    onCancel={() => setPendingConnection(null)}
    existingGroupNames={harness?.groups.map(g => g.name) || []}
  />
)}
```

- [ ] **Step 11: Verify types compile**

Run: `npm run lint`
Expected: No new type errors.

- [ ] **Step 12: Commit**

```bash
git add src/components/CanvasView.tsx
git commit -m "feat(harness): add connection layer, anchors, and drag-to-connect to Canvas"
```

---

### Task 12: Wire Everything in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { useHarnessController } from './services/harnessController';
import type { SessionWindowHandle } from './types';
```

- [ ] **Step 2: Add sessionRefs and harness controller**

After the existing state declarations (around line 148), add:

```typescript
const sessionRefs = useRef<Map<string, SessionWindowHandle>>(new Map());
const harness = useHarnessController(sessions, setSessions, projectDir, sessionRefs);
```

Where `projectDir` is derived from `currentProject` — check existing code for how project directory is tracked. It's likely `currentProject?.path` or similar. Look at how `projectDir` prop is passed to CanvasView (around line 710).

- [ ] **Step 3: Pass harness props to CanvasView**

In the CanvasView JSX (around line 705), add:

```tsx
<CanvasView
  // ...existing props
  harness={harness}
  sessionRefs={sessionRefs}
/>
```

- [ ] **Step 4: Wire sessionRefs in SessionWindow rendering**

Wherever SessionWindow is rendered in CanvasView (or passed through), we need to register refs. In CanvasView, when mapping sessions to SessionWindow components, add a ref callback:

```tsx
<SessionWindow
  key={session.id}
  ref={(handle) => {
    if (handle) {
      sessionRefs.current?.set(session.id, handle);
    } else {
      sessionRefs.current?.delete(session.id);
    }
  }}
  // ...existing props
/>
```

Note: This requires `sessionRefs` to be passed from App.tsx to CanvasView. It's already included in the props from Step 3.

- [ ] **Step 5: Verify types compile**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 6: Start dev server and verify**

Run: `npm run dev`
Expected: App loads normally. No visible changes yet unless you inspect the DOM. Existing functionality intact.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/CanvasView.tsx
git commit -m "feat(harness): wire controller and refs in App.tsx and CanvasView"
```

---

### Task 13: End-to-End Manual Verification

- [ ] **Step 1: Create 3 sessions on the Canvas**

Open the app, create three sessions:
- Session A: "Planner" (any model)
- Session B: "Generator" (any model)
- Session C: "Evaluator" (any model)

- [ ] **Step 2: Connect sessions**

Hover over Session A's right edge, drag to Session B. In the RolePickerModal:
- Set A = Planner, B = Generator
- Group name: "test-harness"

Repeat: drag from A to C, set A = Planner, C = Evaluator (use same group "test-harness").
Repeat: drag from B to C, set B = Generator, C = Evaluator.

Verify: Blue lines from A→B, dashed blue from A→C, orange from B→C.

- [ ] **Step 3: Verify role badges**

Check that Session A shows "P" badge, B shows "G", C shows "E".

- [ ] **Step 4: Test pipeline**

Click on a connection line to select the group. The HarnessControlBar should appear at the bottom.
Click Start. Send a message to Session A (the Planner).
Wait for A to complete — verify that B automatically receives the Generator prompt.
Wait for B to complete — verify that C automatically receives the Evaluator prompt.

- [ ] **Step 5: Verify .harness/ files**

Check that `.harness/<group-id>/sprint-1/` contains:
- `plan.md`
- `result.md`
- `review-1.md`

- [ ] **Step 6: Commit final verification**

```bash
git add -A
git commit -m "feat(harness): complete multi-agent harness pipeline integration"
```
