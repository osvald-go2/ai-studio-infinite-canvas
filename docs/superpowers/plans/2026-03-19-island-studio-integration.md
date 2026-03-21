# Island-Studio Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Dynamic Island to AI Studio with real-time bidirectional data flow — session sync, AI streaming, and chat from Island.

**Architecture:** Event-driven push from AI Studio → islandServer (WS) → Island. Island sends messages back via WS → islandServer → IPC → SessionWindow. All AI calls are proxied through the main app's SessionWindow.

**Tech Stack:** React 19, TypeScript, Electron IPC, WebSocket (`ws`), existing `notifyIsland` IPC bridge.

**Spec:** `docs/superpowers/specs/2026-03-19-island-studio-integration-design.md`

---

## Chunk 1: Infrastructure — Types, Preload, IslandServer

### Task 1: Extend Island types

**Files:**
- Modify: `dynamic-island/src/types.ts:31-39`

- [ ] **Step 1: Update `ServerMessage` union type**

Add `session:delete`, make `title` optional in `session:update`, add `lastMessage`:

```typescript
// In ServerMessage union, replace the session:update line and add session:delete:
  | { type: 'session:update'; sessionId: string; status: SessionStatus; title?: string; lastMessage?: string }
  // ... existing lines ...
  | { type: 'session:delete'; sessionId: string }
```

The full updated `ServerMessage` type should be:
```typescript
export type ServerMessage =
  | { type: 'sessions:sync'; sessions: IslandSession[] }
  | { type: 'session:update'; sessionId: string; status: SessionStatus; title?: string; lastMessage?: string }
  | { type: 'session:delete'; sessionId: string }
  | { type: 'message:new'; sessionId: string; message: Message }
  | { type: 'message:stream'; sessionId: string; messageId: string; chunk: string; done: boolean }
  | { type: 'task:progress'; sessionId: string; steps: TaskStep[] }
  | { type: 'notification'; sessionId: string; level: 'success' | 'error' | 'info'; text: string }
  | { type: 'messages:history'; sessionId: string; messages: Message[] }
  | { type: 'error'; requestType: string; sessionId: string; message: string }
```

- [ ] **Step 2: Run type check**

Run: `cd dynamic-island && npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add dynamic-island/src/types.ts
git commit -m "feat(island): extend ServerMessage with session:delete and optional fields"
```

### Task 2: Add convenience methods to main app preload

**Files:**
- Modify: `electron/preload.ts:91-113`
- Modify: `src/types/electron.d.ts:11-18`

- [ ] **Step 1: Add three convenience methods to preload.ts**

After `sendIslandMessagesHistory` (line 111), before the closing `});` of `contextBridge.exposeInMainWorld`, add:

```typescript
  emitSessionUpdate: (data: { sessionId: string; status: string; title?: string; model?: string; lastMessage?: string }) => {
    ipcRenderer.send('island:session-updated', data)
  },
  emitMessageStream: (data: { sessionId: string; messageId: string; chunk: string; done: boolean }) => {
    ipcRenderer.send('island:message-stream', data)
  },
  emitNotification: (data: { sessionId: string; level: 'success' | 'error' | 'info'; text: string }) => {
    ipcRenderer.send('island:notification', data)
  },
  emitSessionDeleted: (sessionId: string) => {
    ipcRenderer.send('island:session-deleted', { sessionId })
  },
```

- [ ] **Step 2: Update TypeScript declarations in electron.d.ts**

Add after `sendIslandMessagesHistory` (line 18):

```typescript
  emitSessionUpdate(data: { sessionId: string; status: string; title?: string; model?: string; lastMessage?: string }): void;
  emitMessageStream(data: { sessionId: string; messageId: string; chunk: string; done: boolean }): void;
  emitNotification(data: { sessionId: string; level: 'success' | 'error' | 'info'; text: string }): void;
  emitSessionDeleted(sessionId: string): void;
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/types/electron.d.ts
git commit -m "feat: add island emit convenience methods to preload"
```

### Task 3: Add `session:delete` IPC handler to islandServer

**Files:**
- Modify: `electron/islandServer.ts:62-64`

- [ ] **Step 1: Add IPC handler**

After the `island:messages-history` handler (line 64), add:

```typescript
  ipcMain.on('island:session-deleted', (_e, data) => {
    broadcast({ type: 'session:delete', sessionId: data.sessionId })
  })
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/islandServer.ts
git commit -m "feat(island): add session:delete IPC handler to islandServer"
```

---

## Chunk 2: AI Studio Event Emission

### Task 4: Emit events from SessionWindow.tsx

**Files:**
- Modify: `src/components/SessionWindow.tsx`

This is the core task. We need to emit IPC events at 4 points in SessionWindow:
1. When AI starts replying (status → inprocess)
2. During streaming (text block deltas)
3. When AI completes (status → review)
4. When AI errors

- [ ] **Step 1: Add island emit helper at top of component**

First, add `useCallback` to the React import on line 1:

```typescript
import React, { useState, useRef, useEffect, useCallback } from 'react';
```

Then inside the `SessionWindow` function body (after the `showHistory` state declaration), add a helper to guard against non-Electron:

```typescript
  const emitIsland = useCallback((method: 'emitSessionUpdate' | 'emitMessageStream' | 'emitNotification', data: any) => {
    if (isElectron() && window.aiBackend[method]) {
      window.aiBackend[method](data)
    }
  }, [])
```

- [ ] **Step 2: Emit `status:inprocess` when AI starts**

In `handleBlockDelta` (line 146-160), add streaming emit. After line 152 (`(block as any).content += data.delta.content;`), add:

```typescript
        // Emit text delta to Island
        emitIsland('emitMessageStream', {
          sessionId: session.id,
          messageId: streamingMessageIdRef.current || '',
          chunk: data.delta.content,
          done: false
        })
```

- [ ] **Step 3: Emit `status:review` + stream done + notification on message complete**

In `handleMessageComplete` (line 181-211), after `onUpdate(updated)` (line 210), add:

```typescript
      // Notify Island: session status changed to review
      const textContent = sessionRef.current.messages
        .filter(m => m.id === streamingMessageIdRef.current)
        .flatMap(m => m.blocks || [])
        .filter(b => b.type === 'text')
        .map(b => (b as any).content)
        .join('')
      emitIsland('emitSessionUpdate', {
        sessionId: session.id,
        status: 'review',
        lastMessage: textContent.slice(0, 50)
      })
      emitIsland('emitMessageStream', {
        sessionId: session.id,
        messageId: data.session_id, // use a stable ID
        chunk: '',
        done: true
      })
      emitIsland('emitNotification', {
        sessionId: session.id,
        level: 'success',
        text: `${sessionRef.current.title} — 回复完成`
      })
```

**Important:** This code must go BEFORE the `blockMap.clear()` call (line 187) since we read from blocks. Move the `blockMap.clear()` to after the Island emit, or extract the text before clearing.

Actually, a cleaner approach: extract text content before clearing. Restructure `handleMessageComplete`:

```typescript
    const handleMessageComplete = async (data: { session_id: string }) => {
      if (data.session_id !== backendSessionIdRef.current) return;

      // Extract text content from blocks BEFORE clearing
      const completedMsgId = streamingMessageIdRef.current
      const textContent = Array.from(blockMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([_, block]) => block)
        .filter(b => b.type === 'text')
        .map(b => (b as any).content)
        .join('')

      setIsStreaming(false);
      setStreamingMessageId(null);
      streamingMessageIdRef.current = null;
      isStreamingRef.current = false;
      blockMap.clear();

      // Detect real git changes in Electron mode
      const workingDir = sessionRef.current.worktree ?? projectDir ?? null;
      let hasChanges = false;
      let changeCount = 0;
      if (workingDir) {
        try {
          const changes = await gitService.changes(workingDir);
          hasChanges = changes.length > 0;
          changeCount = changes.length;
        } catch {
          // Ignore git errors
        }
      }

      const updated = {
        ...sessionRef.current,
        status: 'review' as const,
        hasChanges,
        changeCount,
      };
      sessionRef.current = updated;
      onUpdate(updated);

      // Notify Island
      emitIsland('emitSessionUpdate', {
        sessionId: session.id,
        status: 'review',
        lastMessage: textContent.slice(0, 50)
      })
      emitIsland('emitMessageStream', {
        sessionId: session.id,
        messageId: completedMsgId || '',
        chunk: '',
        done: true
      })
      emitIsland('emitNotification', {
        sessionId: session.id,
        level: 'success',
        text: `${sessionRef.current.title} — 回复完成`
      })
    };
```

- [ ] **Step 4: Emit error notification on message error**

In `handleMessageError` (line 213-221), after `console.error` (line 220), add:

```typescript
      emitIsland('emitNotification', {
        sessionId: session.id,
        level: 'error',
        text: `${sessionRef.current.title} — 请求失败`
      })
```

- [ ] **Step 5: Emit `status:inprocess` when AI response is triggered**

In `sendMessage` function (line 444), after `onUpdate(updatedSession)` (line 472), add:

```typescript
    emitIsland('emitSessionUpdate', {
      sessionId: session.id,
      status: 'inprocess'
    })
```

Also add the same emit in `triggerInitialResponse` (after line 299 `onUpdate(updatedSession)`):

```typescript
    emitIsland('emitSessionUpdate', {
      sessionId: session.id,
      status: 'inprocess'
    })
```

And in `triggerBroadcastResponse` (after line 374 `onUpdate(updatedSession)`):

```typescript
    emitIsland('emitSessionUpdate', {
      sessionId: session.id,
      status: 'inprocess'
    })
```

- [ ] **Step 6: Add `island:send-message` listener**

Add a new `useEffect` after the ESC key handler (after line 740):

```typescript
  // Listen for messages sent from Island ChatPanel
  useEffect(() => {
    const handleIslandMessage = (e: Event) => {
      const { sessionId, content } = (e as CustomEvent).detail
      if (sessionId === session.id && content && !isStreamingRef.current) {
        sendMessage(content)
      }
    }
    window.addEventListener('island:send-message', handleIslandMessage)
    return () => window.removeEventListener('island:send-message', handleIslandMessage)
  }, [session.id])
```

- [ ] **Step 7: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat: emit island events from SessionWindow for streaming, status, notifications"
```

### Task 5: Emit events from App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Emit `sessions:sync` after session creation**

In `handleCreateSession` (line 418-462), after `setSessions(prev => [...prev, newSession])` (line 438), add:

```typescript
    // Notify Island of new session list
    if (isElectronApp && window.aiBackend) {
      // Use setTimeout to ensure sessionsRef.current includes newSession after React re-render
      setTimeout(() => {
        const islandSessions = sessionsRef.current.map(s => ({
          id: s.id,
          title: s.title,
          model: s.model,
          status: s.status,
          lastMessage: s.messages.length > 0
            ? s.messages[s.messages.length - 1].content.slice(0, 100)
            : undefined,
          messageCount: s.messages.length
        }))
        window.aiBackend.sendIslandSessionsResponse(islandSessions)
      }, 0)
    }
```

- [ ] **Step 2: Emit `session:delete` when session is removed**

In the session deletion sync effect (line 402-416), after `backend.persistDeleteSession(id)` (line 411), add:

```typescript
        window.aiBackend?.emitSessionDeleted?.(id);
```

So line 410-412 becomes:

```typescript
      if (!currentIds.has(id)) {
        backend.persistDeleteSession(id).catch(console.error);
        window.aiBackend?.emitSessionDeleted?.(id);
      }
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: emit island events on session create/delete from App.tsx"
```

---

## Chunk 3: Island Data Handling

### Task 6: Remove mock data and add `session:delete` handler

**Files:**
- Modify: `dynamic-island/src/hooks/useIslandStore.ts`

- [ ] **Step 1: Remove MOCK_SESSIONS and initialize with empty array**

Delete lines 22-27 (the `MOCK_SESSIONS` constant). Change line 31 from:

```typescript
    sessions: MOCK_SESSIONS,
```

to:

```typescript
    sessions: [],
```

- [ ] **Step 2: Fix `session:update` handler for selective merge**

Replace lines 51-60 (the `session:update` case) with:

```typescript
        case 'session:update':
          setState(s => ({
            ...s,
            sessions: s.sessions.map(ses =>
              ses.id === data.sessionId
                ? {
                    ...ses,
                    status: data.status,
                    title: data.title ?? ses.title,
                    lastMessage: data.lastMessage ?? ses.lastMessage
                  }
                : ses
            )
          }))
          break
```

- [ ] **Step 3: Add `session:delete` handler**

After the `session:update` case (and before `message:new`), add:

```typescript
        case 'session:delete':
          setState(s => {
            const { [data.sessionId]: _msgs, ...restMessages } = s.messages
            const { [data.sessionId]: _str, ...restStreaming } = s.streamingText
            const { [data.sessionId]: _steps, ...restSteps } = s.taskSteps
            return {
              ...s,
              sessions: s.sessions.filter(ses => ses.id !== data.sessionId),
              messages: restMessages,
              streamingText: restStreaming,
              taskSteps: restSteps,
              notifications: s.notifications.filter(n => n.sessionId !== data.sessionId)
            }
          })
          break
```

- [ ] **Step 4: Add optimistic update to sendMessage**

Replace the `sendMessage` callback (lines 170-172) with:

```typescript
  const sendMessage = useCallback((sessionId: string, content: string) => {
    // Optimistic update: add user message locally immediately
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now()
    }
    setState(s => ({
      ...s,
      messages: {
        ...s.messages,
        [sessionId]: [...(s.messages[sessionId] || []), userMsg]
      }
    }))
    // Send to AI Studio via WebSocket
    window.island.wsSend({ type: 'message:send', sessionId, content })
  }, [])
```

- [ ] **Step 5: Run type check**

Run: `cd dynamic-island && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add dynamic-island/src/hooks/useIslandStore.ts
git commit -m "feat(island): remove mock data, add session:delete, fix selective merge, optimistic send"
```

### Task 7: Ensure ChatPanel streaming display works

**Files:**
- Modify: `dynamic-island/src/components/ChatPanel/ChatPanel.tsx` (verify, likely no changes needed)

- [ ] **Step 1: Verify ChatPanel already handles streaming text**

Read `ChatPanel.tsx`. The component already:
- Gets `streamingText` from `useIslandStore` (line 16)
- Passes `activeStreamingText` to `MessageList` (line 73)
- Has `InputBar` with `onSend` callback (line 83)

The ChatPanel should work as-is with the upstream changes. No modifications needed unless the `MessageList` component doesn't render `streamingText`.

- [ ] **Step 2: Verify MessageList renders streaming text**

Read `dynamic-island/src/components/ChatPanel/MessageList.tsx` to confirm it renders the `streamingText` prop as a typing indicator / partial message.

- [ ] **Step 3: Run type check**

Run: `cd dynamic-island && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit (only if changes were needed)**

```bash
# Only if changes were made:
git add dynamic-island/src/components/ChatPanel/ChatPanel.tsx
git commit -m "fix(island): ensure ChatPanel streaming display works"
```

---

## Chunk 4: Integration Verification

### Task 8: End-to-end verification

- [ ] **Step 1: Run full type check on both apps**

```bash
npx tsc --noEmit && cd dynamic-island && npx tsc --noEmit
```

Expected: Both PASS

- [ ] **Step 2: Build main app**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Build dynamic-island app**

```bash
cd dynamic-island && npm run build
```

Expected: Build succeeds

- [ ] **Step 4: Manual smoke test checklist**

If running the apps:

1. Start main app: `npm run dev:electron`
2. Start Island: `cd dynamic-island && npm run dev`
3. Verify: Island shows empty session list (no mock data)
4. Create a session in main app → Island should update with new card
5. Type a message in main app → AI starts, Island card shows `inprocess` status
6. During AI streaming → Island ChatPanel shows text appearing in real-time
7. AI completes → Island card shows `review` status, lastMessage updates
8. Click "Open in chat" on Island → ChatPanel opens with message history
9. Type in Island ChatPanel → Message appears in main app SessionWindow, triggers AI
10. Delete session in main app → Island card disappears

- [ ] **Step 5: Verify all changes are committed**

All prior tasks should have committed their changes. Run `git status` to verify a clean working tree. If there are uncommitted changes, review and commit them individually with specific `git add` (not `git add -A`).
