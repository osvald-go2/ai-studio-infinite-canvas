# Island Chat Popup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Island's separate ChatPanel with a popup BrowserWindow from the main Electron app that renders SessionWindow directly — zero component duplication, full block-type parity.

**Architecture:** Island sends `chat:open` via WebSocket → islandServer calls `createChatPopupWindow()` → main Electron creates a frameless BrowserWindow loading `chat-popup.html` → React entry fetches session data from main renderer via IPC → renders SessionWindow with `variant="popup"`. Sidecar events broadcast to all main-app BrowserWindows.

**Tech Stack:** Electron BrowserWindow, IPC (ipcMain/ipcRenderer), electron-vite multi-entry, React, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-20-island-chat-popup-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `electron/chatPopupManager.ts` | **Create** | Popup window lifecycle (create/hide/destroy), avoids circular deps |
| `chat-popup.html` | **Create** | Vite entry HTML for popup renderer |
| `src/chat-popup.tsx` | **Create** | React entry — loads session via IPC, renders SessionWindow |
| `electron/main.ts` | Modify | Import chatPopupManager, broadcast sidecar events, add IPC handlers, cleanup on close |
| `electron/preload.ts` | Modify | Add `chatPopup.*` namespace + scoped `ipcOn/ipcOff/ipcSend` |
| `electron/islandServer.ts` | Modify | Handle `chat:open`/`chat:close` WebSocket messages |
| `electron.vite.config.ts` | Modify | Add `chat-popup` renderer entry |
| `src/components/SessionWindow.tsx` | Modify | Add `variant="popup"` support |
| `src/App.tsx` | Modify | Add IPC listeners for popup session requests + metadata sync |
| `dynamic-island/src/hooks/useIslandStore.ts` | Modify | `openChat`/`closeChat` → WebSocket, remove chat state |
| `dynamic-island/electron/windowManager.ts` | Modify | Remove chat window, drag, `activeChatSessionId` |
| `dynamic-island/electron/preload.ts` | Modify | Remove chat-related APIs |
| `dynamic-island/electron/main.ts` | Modify | Remove chat URL loading |
| `dynamic-island/electron.vite.config.ts` | Modify | Remove `chat` entry |
| `dynamic-island/src/components/ChatPanel/*` | **Delete** | 5 files: ChatPanel, InputBar, MessageList, TitleBar, TaskProgress |
| `dynamic-island/resources/chat.html` | **Delete** | Replaced by main app's chat-popup.html |
| `dynamic-island/src/chat-main.tsx` | **Delete** | Entry point for deleted ChatPanel |

---

## Chunk 1: Main Electron — chatPopupManager + IPC plumbing

### Task 1: Create `electron/chatPopupManager.ts`

**Files:**
- Create: `electron/chatPopupManager.ts`

- [ ] **Step 1: Create chatPopupManager.ts**

```typescript
// electron/chatPopupManager.ts
import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'

let chatPopupWindow: BrowserWindow | null = null

export function createChatPopupWindow(sessionId: string): void {
  if (chatPopupWindow && !chatPopupWindow.isDestroyed()) {
    chatPopupWindow.webContents.send('chat-popup:switch-session', sessionId)
    chatPopupWindow.show()
    chatPopupWindow.focus()
    return
  }

  chatPopupWindow = new BrowserWindow({
    width: 480,
    height: 820,
    frame: false,
    transparent: false,
    backgroundColor: '#1A1A2E',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
    show: false,
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    chatPopupWindow.loadURL(
      `${process.env.ELECTRON_RENDERER_URL}/chat-popup.html?sessionId=${sessionId}`
    )
  } else {
    chatPopupWindow.loadFile(
      path.join(__dirname, '../renderer/chat-popup.html'),
      { query: { sessionId } }
    )
  }

  chatPopupWindow.once('ready-to-show', () => chatPopupWindow?.show())

  chatPopupWindow.on('closed', () => {
    chatPopupWindow = null
  })
}

export function hideChatPopup(): void {
  chatPopupWindow?.hide()
}

export function destroyChatPopup(): void {
  if (chatPopupWindow && !chatPopupWindow.isDestroyed()) {
    chatPopupWindow.destroy()
    chatPopupWindow = null
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p electron/tsconfig.json 2>&1 || npx electron-vite build 2>&1 | tail -5`

Note: The file won't be reachable until imported by main.ts (Task 2). Just ensure no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add electron/chatPopupManager.ts
git commit -m "feat: add chatPopupManager module for popup window lifecycle"
```

---

### Task 2: Modify `electron/main.ts` — import manager, broadcast sidecar, add IPC handlers

**Files:**
- Modify: `electron/main.ts:1-9` (imports)
- Modify: `electron/main.ts:57-59` (mainWindow.on('closed'))
- Modify: `electron/main.ts:88-110` (startSidecar — broadcast to all windows)
- Modify: after line 164 (new IPC handlers)

- [ ] **Step 1: Add import**

At `electron/main.ts:9`, after the islandServer import, add:

```typescript
import { destroyChatPopup, hideChatPopup } from './chatPopupManager';
```

- [ ] **Step 2: Broadcast sidecar events to all BrowserWindows**

Replace `electron/main.ts:93-97` (the `sidecar.on('event', ...)` handler):

```typescript
  // Before (only mainWindow):
  // sidecar.on('event', (eventName: string, data: any) => {
  //   if (mainWindow && !mainWindow.isDestroyed()) {
  //     mainWindow.webContents.send('sidecar:event', eventName, data);
  //   }
  // });

  // After (all BrowserWindows in this process):
  sidecar.on('event', (eventName: string, data: any) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('sidecar:event', eventName, data);
      }
    }
  });
```

Replace `electron/main.ts:99-109` (the `sidecar.on('crashed', ...)` handler):

```typescript
  sidecar.on('crashed', (code: number | null) => {
    console.log(`[main] sidecar crashed with code ${code}, restarting...`);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('sidecar:event', 'sidecar.restarted', {});
      }
    }
    setTimeout(() => {
      if (sidecar) {
        sidecar.spawn(getSidecarEnv());
      }
    }, 1000);
  });
```

- [ ] **Step 3: Add popup cleanup on mainWindow close**

Replace `electron/main.ts:57-59`:

```typescript
  // Before:
  // mainWindow.on('closed', () => {
  //   mainWindow = null;
  // });

  // After:
  mainWindow.on('closed', () => {
    mainWindow = null;
    destroyChatPopup();
  });
```

- [ ] **Step 4: Add new IPC handlers**

After the `ipcMain.on('window:dragging', ...)` block (after line 164), add:

```typescript
// ── Chat Popup IPC handlers ──

ipcMain.handle('chat-popup:close', () => {
  hideChatPopup();
});

ipcMain.handle('chat-popup:get-session', async (_e, { sessionId }: { sessionId: string }) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window not available');
  }
  const requestId = `${sessionId}-${Date.now()}`;
  mainWindow.webContents.send('chat-popup:request-session', { sessionId, requestId });

  const responseChannel = `chat-popup:session-response:${requestId}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ipcMain.removeAllListeners(responseChannel);
      reject(new Error('Session data request timed out'));
    }, 5000);

    ipcMain.once(responseChannel, (_e, data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
});

ipcMain.on('chat-popup:sync-metadata', (_e, metadata: any) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('chat-popup:metadata-updated', metadata);
  }
});
```

- [ ] **Step 5: Build to verify**

Run: `npx electron-vite build 2>&1 | tail -5`

Expected: Build succeeds (chatPopupManager imported but not yet called from islandServer — that's Task 4).

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "feat: broadcast sidecar events to all windows, add chat popup IPC handlers"
```

---

### Task 3: Modify `electron/preload.ts` — add chatPopup namespace + scoped IPC

**Files:**
- Modify: `electron/preload.ts:125` (before closing `}` of `contextBridge.exposeInMainWorld`)

- [ ] **Step 1: Add chatPopup namespace and scoped IPC methods**

Before the final `});` at line 125, add:

```typescript

  // ── Chat Popup API ──
  chatPopup: {
    getSession: (sessionId: string): Promise<any> =>
      ipcRenderer.invoke('chat-popup:get-session', { sessionId }),
    close: (): Promise<void> =>
      ipcRenderer.invoke('chat-popup:close'),
    syncMetadata: (metadata: { id: string; title: string; status: string; claudeSessionId?: string; codexThreadId?: string }) =>
      ipcRenderer.send('chat-popup:sync-metadata', metadata),
    onSwitchSession: (cb: (sessionId: string) => void) => {
      const handler = (_e: any, sessionId: string) => cb(sessionId)
      ipcRenderer.on('chat-popup:switch-session', handler)
      return () => ipcRenderer.removeListener('chat-popup:switch-session', handler)
    },
  },

  // Scoped IPC — only allows chat-popup: prefixed channels
  ipcOn: (channel: string, callback: (...args: any[]) => void) => {
    if (!channel.startsWith('chat-popup:')) throw new Error(`ipcOn: channel "${channel}" not allowed`)
    ipcRenderer.on(channel, callback)
  },
  ipcOff: (channel: string, callback: (...args: any[]) => void) => {
    if (!channel.startsWith('chat-popup:')) throw new Error(`ipcOff: channel "${channel}" not allowed`)
    ipcRenderer.removeListener(channel, callback)
  },
  ipcSend: (channel: string, ...args: any[]) => {
    if (!channel.startsWith('chat-popup:')) throw new Error(`ipcSend: channel "${channel}" not allowed`)
    ipcRenderer.send(channel, ...args)
  },
```

- [ ] **Step 2: Build to verify**

Run: `npx electron-vite build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Update `src/types/electron.d.ts` — add new types to AiBackend interface**

At `src/types/electron.d.ts`, before the closing `}` of `AiBackend` (line 23), add:

```typescript

  // Chat Popup
  chatPopup: {
    getSession(sessionId: string): Promise<any>;
    close(): Promise<void>;
    syncMetadata(metadata: { id: string; title: string; status: string; claudeSessionId?: string; codexThreadId?: string }): void;
    onSwitchSession(cb: (sessionId: string) => void): () => void;
  };

  // Scoped IPC (chat-popup: prefix only)
  ipcOn(channel: string, callback: (...args: any[]) => void): void;
  ipcOff(channel: string, callback: (...args: any[]) => void): void;
  ipcSend(channel: string, ...args: any[]): void;
```

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/types/electron.d.ts
git commit -m "feat: add chatPopup preload API, scoped IPC methods, and type declarations"
```

---

### Task 4: Modify `electron/islandServer.ts` — handle chat:open/close

**Files:**
- Modify: `electron/islandServer.ts:1-2` (imports)
- Modify: `electron/islandServer.ts:73-101` (handleClientMessage switch)

- [ ] **Step 1: Add import**

At `electron/islandServer.ts:2`, add:

```typescript
import { createChatPopupWindow, hideChatPopup } from './chatPopupManager'
```

- [ ] **Step 2: Add chat:open and chat:close cases**

In the `handleClientMessage` function switch statement, after the `sessions:fetch` case (line 100), add:

```typescript
    case 'chat:open':
      createChatPopupWindow(msg.sessionId)
      break

    case 'chat:close':
      hideChatPopup()
      break
```

- [ ] **Step 3: Build to verify**

Run: `npx electron-vite build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add electron/islandServer.ts
git commit -m "feat: handle chat:open/close WebSocket messages in islandServer"
```

---

### Task 5: Modify `electron.vite.config.ts` — add chat-popup entry

**Files:**
- Modify: `electron.vite.config.ts:33-37` (renderer.build.rollupOptions.input)

- [ ] **Step 1: Add chat-popup entry**

Replace the renderer input block at lines 33-37:

```typescript
      // Before:
      // input: {
      //   index: path.resolve(__dirname, 'index.html'),
      // },

      // After:
      input: {
        index: path.resolve(__dirname, 'index.html'),
        'chat-popup': path.resolve(__dirname, 'chat-popup.html'),
      },
```

- [ ] **Step 2: Commit**

```bash
git add electron.vite.config.ts
git commit -m "feat: add chat-popup.html as second renderer entry point"
```

---

## Chunk 2: Popup renderer entry + SessionWindow variant

### Task 6: Create `chat-popup.html`

**Files:**
- Create: `chat-popup.html` (project root, next to `index.html`)

- [ ] **Step 1: Create chat-popup.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chat</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/chat-popup.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add chat-popup.html
git commit -m "feat: add chat-popup.html entry point"
```

---

### Task 7: Create `src/chat-popup.tsx`

**Files:**
- Create: `src/chat-popup.tsx`

- [ ] **Step 1: Create chat-popup.tsx**

```tsx
import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionWindow } from './components/SessionWindow'
import { GitProvider } from './contexts/GitProvider'
import { Session } from './types'
import './index.css'

function ChatPopupApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const params = new URLSearchParams(window.location.search)
  const initialSessionId = params.get('sessionId')

  const loadSession = (sessionId: string) => {
    setSession(null)
    setError(null)
    window.aiBackend.chatPopup.getSession(sessionId)
      .then((data: Session | null) => {
        if (data) {
          setSession(data)
        } else {
          setError('Session not found')
        }
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load session')
      })
  }

  useEffect(() => {
    if (initialSessionId) {
      loadSession(initialSessionId)
    }
  }, [initialSessionId])

  // Listen for session switch (when popup is reused for a different session)
  useEffect(() => {
    const cleanup = window.aiBackend.chatPopup.onSwitchSession((newId: string) => {
      loadSession(newId)
    })
    return cleanup
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1A1A2E] text-gray-400">
        <div className="text-center">
          <p className="mb-4">{error}</p>
          <button
            onClick={() => window.aiBackend.chatPopup.close()}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1A1A2E]">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <GitProvider projectDir={null}>
      <SessionWindow
        session={session}
        variant="popup"
        onUpdate={(s) => {
          setSession(s)
          // Only sync metadata back to main renderer — messages sync via sidecar events
          window.aiBackend.chatPopup.syncMetadata({
            id: s.id,
            title: s.title,
            status: s.status,
            claudeSessionId: s.claudeSessionId,
            codexThreadId: s.codexThreadId,
          })
        }}
        onClose={() => window.aiBackend.chatPopup.close()}
      />
    </GitProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatPopupApp />
  </StrictMode>
)
```

- [ ] **Step 2: Commit (will not compile yet — variant="popup" not added)**

```bash
git add src/chat-popup.tsx
git commit -m "feat: add chat-popup React entry point"
```

---

### Task 8: Modify `src/components/SessionWindow.tsx` — add variant="popup"

**Files:**
- Modify: `src/components/SessionWindow.tsx:40` (variant type)
- Modify: `src/components/SessionWindow.tsx:835` (isTab → isTab/isPopup)
- Modify: `src/components/SessionWindow.tsx:838-846` (outer div classes)
- Modify: `src/components/SessionWindow.tsx:848-909` (header section)
- Modify: `src/components/SessionWindow.tsx:1048-1056` (content padding)

- [ ] **Step 1: Expand variant type**

At `src/components/SessionWindow.tsx:40`, change:

```typescript
  // Before:
  variant?: 'default' | 'tab',
  // After:
  variant?: 'default' | 'tab' | 'popup',
```

- [ ] **Step 2: Add isPopup flag**

At `src/components/SessionWindow.tsx:835`, change:

```typescript
  // Before:
  const isTab = variant === 'tab';
  // After:
  const isTab = variant === 'tab';
  const isPopup = variant === 'popup';
```

- [ ] **Step 3: Update outer div classes**

At line 838, update the className logic to handle popup:

```typescript
  // Before:
  <div className={`flex flex-col overflow-hidden text-sm text-gray-200 ${
    isTab
      ? 'w-full h-full bg-[#1E1814]/80 backdrop-blur-3xl'
      : fullScreen
        ? 'w-full h-full bg-transparent'
        : 'w-[600px] bg-[#1E1814]/80 backdrop-blur-3xl rounded-[32px] border border-white/10 shadow-2xl'
  }`}

  // After:
  <div className={`flex flex-col overflow-hidden text-sm text-gray-200 ${
    isTab || isPopup
      ? 'w-full h-full bg-[#1E1814]/80 backdrop-blur-3xl'
      : fullScreen
        ? 'w-full h-full bg-transparent'
        : 'w-[600px] bg-[#1E1814]/80 backdrop-blur-3xl rounded-[32px] border border-white/10 shadow-2xl'
  }`}
```

- [ ] **Step 4: Update style prop to skip height for popup**

At line 845:

```typescript
  // Before:
  style={!fullScreen && !isTab && height ? { height, transition: animateHeight ? 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : undefined } : undefined}
  // After:
  style={!fullScreen && !isTab && !isPopup && height ? { height, transition: animateHeight ? 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : undefined } : undefined}
```

- [ ] **Step 5: Add popup header**

The header section (lines 848-1046) has two branches: `isTab` and else (default). Add a popup branch. Change line 848:

```typescript
  // Before:
  {isTab ? (
  // After:
  {isTab || isPopup ? (
```

This reuses the tab header for popup (simpler chrome, no drag handle). But we need to add `-webkit-app-region: drag` for the popup variant to enable frameless window dragging. Update the tab header div (line 849):

```typescript
  // Before:
  <div className="flex items-center justify-end py-4 px-6 select-none shrink-0">
  // After:
  <div className={`flex items-center justify-end py-4 px-6 select-none shrink-0${isPopup ? ' [-webkit-app-region:drag]' : ''}`}>
```

And for popup, add a close button at the start (before the existing flex items). Change the inner content of the tab/popup header:

```typescript
  // Before:
  <div className="flex items-center gap-2 text-[#9CA3AF]">
  // After:
  <div className="flex items-center gap-2 text-[#9CA3AF] [-webkit-app-region:no-drag]">
```

And prepend a close button + title for popup. Replace the entire `isTab || isPopup` header block:

```tsx
      {isTab || isPopup ? (
        <div className={`flex items-center justify-between py-4 px-6 select-none shrink-0${isPopup ? ' [-webkit-app-region:drag]' : ''}`}>
          {isPopup ? (
            <div className="flex items-center gap-3 [-webkit-app-region:no-drag]">
              <button
                onClick={isStreaming ? handleStop : onClose}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                  isStreaming
                    ? 'bg-red-500/20 hover:bg-red-500/40 text-red-400'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <X size={14} className={isStreaming ? 'text-red-400' : 'text-gray-400'} />
              </button>
              <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusDotClass(session.status, isStreaming)}`} />
              <span className="font-medium text-white text-sm truncate max-w-[200px]">{session.title}</span>
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2 text-[#9CA3AF] [-webkit-app-region:no-drag]">
```

The rest of the tab header (history, copy, delete buttons) stays the same. Close the div structure properly — the existing closing `</div>`s handle this.

- [ ] **Step 6: Update content padding for popup**

At `src/components/SessionWindow.tsx:1052-1055`:

```typescript
  // Before:
  className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar ${
    isTab ? 'pt-2 px-6 pb-6'
    : fullScreen ? 'p-8'
    : `p-6 pt-2${height ? '' : ' max-h-[600px]'}`
  }`}

  // After:
  className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar ${
    isTab || isPopup ? 'pt-2 px-6 pb-6'
    : fullScreen ? 'p-8'
    : `p-6 pt-2${height ? '' : ' max-h-[600px]'}`
  }`}
```

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit`

Expected: Pass (or only pre-existing errors).

- [ ] **Step 8: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat: add variant='popup' to SessionWindow for frameless chat window"
```

---

### Task 9: Modify `src/App.tsx` — add popup IPC listeners

**Files:**
- Modify: `src/App.tsx` — in the Island integration `useEffect` block (~line 376-406)

- [ ] **Step 1: Add a new useEffect for popup IPC**

After the existing Island integration `useEffect` block (after line 406), add a new useEffect:

```typescript
  // Chat Popup integration — respond to session data requests + metadata sync
  useEffect(() => {
    if (!window.aiBackend?.ipcOn) return

    const handleSessionRequest = (_e: any, { sessionId, requestId }: { sessionId: string; requestId: string }) => {
      const session = sessionsRef.current.find(s => s.id === sessionId)
      if (session) {
        window.aiBackend.ipcSend(
          `chat-popup:session-response:${requestId}`,
          JSON.parse(JSON.stringify(session))
        )
      }
    }

    const handleMetadataUpdate = (_e: any, metadata: { id: string; title: string; status: string; claudeSessionId?: string; codexThreadId?: string }) => {
      setSessions(prev => prev.map(s =>
        s.id === metadata.id
          ? { ...s, title: metadata.title, status: metadata.status as any, claudeSessionId: metadata.claudeSessionId, codexThreadId: metadata.codexThreadId }
          : s
      ))
    }

    window.aiBackend.ipcOn('chat-popup:request-session', handleSessionRequest)
    window.aiBackend.ipcOn('chat-popup:metadata-updated', handleMetadataUpdate)

    return () => {
      window.aiBackend.ipcOff('chat-popup:request-session', handleSessionRequest)
      window.aiBackend.ipcOff('chat-popup:metadata-updated', handleMetadataUpdate)
    }
  }, [])
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

Expected: Pass. The `ipcOn`/`ipcOff`/`ipcSend` are added to preload but may not be in the `window.aiBackend` type declaration. If there is a `.d.ts` file for aiBackend, update it; otherwise the `?.` optional chaining handles it at runtime.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add popup IPC listeners in App.tsx for session data + metadata sync"
```

---

### Task 10: Full build verification for Chunk 2

- [ ] **Step 1: Type check main app**

Run: `npx tsc --noEmit`

- [ ] **Step 2: Build main Electron**

Run: `npx electron-vite build 2>&1 | tail -10`

Expected: Build succeeds, output includes `chat-popup` entry.

- [ ] **Step 3: Commit if any fixes needed**

---

## Chunk 3: Island cleanup — remove ChatPanel, update store/window/preload

### Task 11: Modify Island `useIslandStore.ts` — openChat/closeChat via WebSocket

**Files:**
- Modify: `dynamic-island/src/hooks/useIslandStore.ts`

- [ ] **Step 1: Change openChat to send WebSocket**

At `dynamic-island/src/hooks/useIslandStore.ts:224-226`, replace:

```typescript
  // Before:
  const openChat = useCallback((sessionId: string) => {
    window.island.openChat(sessionId)
  }, [])
  // After:
  const openChat = useCallback((sessionId: string) => {
    window.island.wsSend({ type: 'chat:open', sessionId })
  }, [])
```

- [ ] **Step 2: Change closeChat to send WebSocket**

At line 228-230, replace:

```typescript
  // Before:
  const closeChat = useCallback(() => {
    window.island.closeChat()
  }, [])
  // After:
  const closeChat = useCallback(() => {
    window.island.wsSend({ type: 'chat:close' })
  }, [])
```

- [ ] **Step 3: Remove activeChatSessionId and related**

1. Remove `activeChatSessionId` from `IslandState` interface (line 19) and initial state (line 31)
2. Remove the `handleActiveChatSession` callback (line 168-169)
3. Remove `const cleanupChat = window.island.onActiveChatSession(handleActiveChatSession)` (line 175)
4. Remove `cleanupChat()` from cleanup return (line 185)
5. The `messages`, `streamingText`, `taskSteps` state can stay for now — NotchView's TaskCard may still reference them. They'll be cleaned up later if unused.

- [ ] **Step 4: Commit**

```bash
git add dynamic-island/src/hooks/useIslandStore.ts
git commit -m "feat: openChat/closeChat via WebSocket, remove activeChatSessionId"
```

---

### Task 12: Modify Island `windowManager.ts` — remove chat window

**Files:**
- Modify: `dynamic-island/electron/windowManager.ts`

- [ ] **Step 1: Remove chat window from class**

Remove these properties from the class:
- `private chatWindow: BrowserWindow | null = null` (line 18)
- `private chatOpen = false` (line 22)
- `private activeChatSessionId: string | null = null` (line 23)
- `private dragOffset: { x: number; y: number } | null = null` (line 24)

Remove chat window creation in `createWindows()` (lines 63-82 — the entire `this.chatWindow = new BrowserWindow({...})` block).

Remove from `setupIPC()`:
- `ipcMain.on('chat:open', ...)` block (lines 104-110)
- `ipcMain.on('chat:close', ...)` block (lines 112-116)
- `ipcMain.on('chat:drag-start', ...)` block (lines 120-126)
- `ipcMain.on('chat:dragging', ...)` block (lines 128-133)
- `ipcMain.on('chat:drag-end', ...)` block (lines 135-137)

Update collapse condition in `notch:mouse-leave` (line 97): remove `&& !this.chatOpen`.

Update `expandForNotification()` (line 212): remove `&& !this.chatOpen` from the auto-collapse condition.

Remove `showChat()` method (lines 219-228).

Update `broadcastToRenderers()` — only send to notch:

```typescript
  broadcastToRenderers(data: any): void {
    this.safeSend(this.notchWindow, 'ws:message', data)
  }
```

Update `setConnectionStatus()` — only notch:

```typescript
  setConnectionStatus(connected: boolean): void {
    this.safeSend(this.notchWindow, 'ws:connection-status', connected)
  }
```

Change `loadPages` to only load notch:

```typescript
  loadPages(notchURL: string): void {
    this.notchWindow?.loadURL(notchURL)
  }

  loadFiles(notchPath: string): void {
    this.notchWindow?.loadFile(notchPath)
  }
```

Update `destroy()` — remove `this.chatWindow?.destroy()`.

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/electron/windowManager.ts
git commit -m "refactor: remove chat window from Island windowManager"
```

---

### Task 13: Modify Island `preload.ts` + `types.ts` — remove chat APIs

**Files:**
- Modify: `dynamic-island/electron/preload.ts`
- Modify: `dynamic-island/src/types.ts`

- [ ] **Step 1: Remove chat-related APIs from preload**

Remove these from the `api` object in `dynamic-island/electron/preload.ts`:
- `openChat` (line 16)
- `closeChat` (line 17)
- `onActiveChatSession` (lines 37-41)
- `startChatDrag` (line 44)
- `dragChat` (line 45)
- `endChatDrag` (line 46)

Keep: `onStateChange`, `notifyMouseEnter`, `notifyMouseLeave`, `onWsMessage`, `wsSend`, `onConnectionStatus`, `requestSync`.

- [ ] **Step 2: Update `IslandAPI` interface in `dynamic-island/src/types.ts`**

Remove from `IslandAPI` interface (lines 62-76):
- `openChat: (sessionId: string) => void` (line 66)
- `closeChat: () => void` (line 67)
- `onActiveChatSession: (callback: (sessionId: string | null) => void) => () => void` (line 71)
- `startChatDrag: () => void` (line 72)
- `dragChat: () => void` (line 73)
- `endChatDrag: () => void` (line 74)

Update `ClientMessage` type (lines 43-48) to include chat:open/close:

```typescript
export type ClientMessage =
  | { type: 'message:send'; sessionId: string; content: string }
  | { type: 'session:cancel'; sessionId: string }
  | { type: 'notification:dismiss'; sessionId: string }
  | { type: 'messages:fetch'; sessionId: string }
  | { type: 'chat:open'; sessionId: string }
  | { type: 'chat:close' }
```

- [ ] **Step 3: Commit**

```bash
git add dynamic-island/electron/preload.ts dynamic-island/src/types.ts
git commit -m "refactor: remove chat window APIs from Island preload and types"
```

---

### Task 14: Modify Island `main.ts` — remove chat URL loading

**Files:**
- Modify: `dynamic-island/electron/main.ts`

- [ ] **Step 1: Update loadPages/loadFiles to notch only**

Replace the page loading block (lines 37-48):

```typescript
  // Before:
  if (process.env.ELECTRON_RENDERER_URL) {
    const baseURL = process.env.ELECTRON_RENDERER_URL
    const notchURL = `${baseURL}/resources/notch.html`
    const chatURL = `${baseURL}/resources/chat.html`
    console.log('[Island] Loading dev URLs:', notchURL, chatURL)
    windowManager.loadPages(notchURL, chatURL)
  } else {
    const notchPath = join(__dirname, '../renderer/resources/notch.html')
    const chatPath = join(__dirname, '../renderer/resources/chat.html')
    console.log('[Island] Loading files:', notchPath, chatPath)
    windowManager.loadFiles(notchPath, chatPath)
  }

  // After:
  if (process.env.ELECTRON_RENDERER_URL) {
    const baseURL = process.env.ELECTRON_RENDERER_URL
    const notchURL = `${baseURL}/resources/notch.html`
    console.log('[Island] Loading dev URL:', notchURL)
    windowManager.loadPages(notchURL)
  } else {
    const notchPath = join(__dirname, '../renderer/resources/notch.html')
    console.log('[Island] Loading file:', notchPath)
    windowManager.loadFiles(notchPath)
  }
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/electron/main.ts
git commit -m "refactor: remove chat URL loading from Island main"
```

---

### Task 15: Modify Island `electron.vite.config.ts` — remove chat entry

**Files:**
- Modify: `dynamic-island/electron.vite.config.ts:38-41`

- [ ] **Step 1: Remove chat from renderer input**

```typescript
  // Before:
  input: {
    notch: path.resolve(__dirname, 'resources/notch.html'),
    chat: path.resolve(__dirname, 'resources/chat.html')
  }

  // After:
  input: {
    notch: path.resolve(__dirname, 'resources/notch.html')
  }
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/electron.vite.config.ts
git commit -m "refactor: remove chat entry from Island build config"
```

---

### Task 16: Delete Island ChatPanel files + chat entry

**Files:**
- Delete: `dynamic-island/src/components/ChatPanel/ChatPanel.tsx`
- Delete: `dynamic-island/src/components/ChatPanel/InputBar.tsx`
- Delete: `dynamic-island/src/components/ChatPanel/MessageList.tsx`
- Delete: `dynamic-island/src/components/ChatPanel/TitleBar.tsx`
- Delete: `dynamic-island/src/components/ChatPanel/TaskProgress.tsx`
- Delete: `dynamic-island/resources/chat.html`
- Delete: `dynamic-island/src/chat-main.tsx`

- [ ] **Step 1: Delete files**

```bash
rm -rf dynamic-island/src/components/ChatPanel/
rm dynamic-island/resources/chat.html
rm dynamic-island/src/chat-main.tsx
```

- [ ] **Step 2: Build verification**

Run: `cd dynamic-island && npx tsc --noEmit 2>&1 | head -20`

If there are import errors for deleted files, fix them. The main suspect: `chat-main.tsx` was only imported by `resources/chat.html` (also deleted), so no dangling imports expected.

Run: `cd dynamic-island && npx electron-vite build 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A dynamic-island/
git commit -m "refactor: delete Island ChatPanel components, chat.html, and chat-main.tsx"
```

---

## Chunk 4: Final verification

### Task 17: Full build verification

- [ ] **Step 1: Type check main app**

Run: `npx tsc --noEmit`

Expected: Pass.

- [ ] **Step 2: Build main Electron**

Run: `npx electron-vite build 2>&1 | tail -15`

Expected: Build succeeds. Output includes both `index.html` and `chat-popup.html` entries.

- [ ] **Step 3: Type check + build Island**

Run: `cd dynamic-island && npx tsc --noEmit && npx electron-vite build 2>&1 | tail -10`

Expected: Both pass. Only `notch.html` in output (no `chat.html`).

- [ ] **Step 4: Fix any remaining issues and commit**

If any TypeScript or build errors, fix and commit with descriptive message.

---

### Task 18: Runtime verification checklist

> These require running the full Electron app. **Must fully restart** (not HMR).

- [ ] From Island, click session card → popup opens with full SessionWindow
- [ ] Popup shows all block types (tool_call, todolist, code, etc.)
- [ ] Send message from popup → streaming works, blocks render
- [ ] Close popup (X button) → window hides
- [ ] Click same session again → window reappears with history
- [ ] Click different session → window switches to new session
- [ ] Main canvas SessionWindow still shows same content
- [ ] Close main window → popup also destroyed
- [ ] Island NotchView session cards still work (status, lastMessage)
