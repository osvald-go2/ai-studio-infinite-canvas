# macOS Dynamic Island Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Electron app that creates a macOS Dynamic Island (notch overlay) with notification cards and a liquid-glass chat panel, connected to AI Studio via WebSocket.

**Architecture:** Dual-window Electron app — Notch Window (always-on-top panel for capsule/cards) + Chat Window (center-screen liquid glass panel). Main Process handles notch detection, cursor polling for hover, window lifecycle, and WebSocket client. AI Studio adds a WebSocket server module to push session data.

**Tech Stack:** Electron 41, electron-vite, React 19, TypeScript, Tailwind CSS 4, framer-motion, ws (WebSocket)

**Spec:** `docs/superpowers/specs/2026-03-18-dynamic-island-design.md`

---

## File Structure

### Dynamic Island App (`dynamic-island/`)

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies and scripts |
| `electron.vite.config.ts` | electron-vite build config with two renderer entries |
| `tsconfig.json` | TypeScript config |
| `.gitignore` | Ignore node_modules, out, dist |
| `electron/main.ts` | App entry, lifecycle, IPC handlers, coordinates all modules |
| `electron/preload.ts` | IPC bridge for both windows |
| `electron/notchDetector.ts` | Detect MacBook hardware notch via `sysctl hw.model` |
| `electron/windowManager.ts` | Create/position/manage Notch + Chat windows, cursor polling, state machine |
| `electron/wsClient.ts` | WebSocket client with auto-reconnect |
| `src/types.ts` | Shared types: IslandSession, TaskStep, WS messages |
| `src/notch-main.tsx` | Notch Window renderer entry |
| `src/chat-main.tsx` | Chat Window renderer entry |
| `src/components/NotchView/NotchView.tsx` | Capsule + notification cards container |
| `src/components/NotchView/Capsule.tsx` | Black capsule that blends with hardware notch |
| `src/components/NotchView/TaskCard.tsx` | Individual notification card |
| `src/components/ChatPanel/ChatPanel.tsx` | Liquid glass chat panel container |
| `src/components/ChatPanel/TitleBar.tsx` | Title bar with collapse/stop buttons |
| `src/components/ChatPanel/MessageList.tsx` | Chat message list with streaming |
| `src/components/ChatPanel/TaskProgress.tsx` | Collapsible task step list |
| `src/components/ChatPanel/InputBar.tsx` | Text input with send/stop button |
| `src/hooks/useIslandStore.ts` | Centralized state: sessions, messages, notifications (replaces spec's `useNotchState.ts` — merged for simplicity since both manage the same state) |
| `src/styles/liquid-glass.css` | Liquid glass effect styles |
| `resources/notch.html` | HTML entry for Notch Window |
| `resources/chat.html` | HTML entry for Chat Window |

### AI Studio Changes (existing repo)

| File | Change |
|------|--------|
| `electron/islandServer.ts` | NEW: WebSocket server module |
| `electron/main.ts` | MODIFY: Import and start islandServer |
| `electron/preload.ts` | MODIFY: Add `notifyIsland`, `onIslandMessage` methods |
| `src/types/electron.d.ts` | MODIFY: Add new method types to AiBackend |
| `src/components/SessionWindow.tsx` | MODIFY: Add IPC calls for island notifications |
| `src/App.tsx` | MODIFY: Add island message listener, session sync |

---

## Chunk 1: Project Scaffolding

### Task 1: Initialize Dynamic Island project

**Files:**
- Create: `dynamic-island/package.json`
- Create: `dynamic-island/tsconfig.json`
- Create: `dynamic-island/electron.vite.config.ts`
- Create: `dynamic-island/tailwind.config.ts`
- Create: `dynamic-island/src/styles/index.css`

- [ ] **Step 1: Create project directory and package.json**

```bash
mkdir -p dynamic-island
```

Write `dynamic-island/package.json`:

```json
{
  "name": "dynamic-island",
  "version": "0.1.0",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "motion": "^12.12.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^10.1.0",
    "ws": "^8.18.0",
    "lucide-react": "^0.511.0"
  },
  "devDependencies": {
    "@anthropic-ai/sdk": "^0.52.0",
    "@electron-toolkit/preload": "^3.0.1",
    "@electron-toolkit/utils": "^4.0.0",
    "@tailwindcss/vite": "^4.1.14",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/ws": "^8.5.10",
    "@vitejs/plugin-react": "^4.5.2",
    "electron": "^41.0.2",
    "electron-vite": "^3.0.0",
    "tailwindcss": "^4.1.14",
    "typescript": "~5.8.2"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Write `dynamic-island/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "outDir": "./out"
  },
  "include": ["src/**/*", "electron/**/*"],
  "exclude": ["node_modules", "out"]
}
```

- [ ] **Step 3: Create electron.vite.config.ts**

Write `dynamic-island/electron.vite.config.ts`:

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['ws']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve('src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          notch: resolve(__dirname, 'resources/notch.html'),
          chat: resolve(__dirname, 'resources/chat.html')
        }
      }
    }
  }
})
```

- [ ] **Step 4: Create Tailwind entry CSS**

Write `dynamic-island/src/styles/index.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 5: Create HTML entry files**

Write `dynamic-island/resources/notch.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Notch</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="../src/notch-main.tsx"></script>
</body>
</html>
```

Write `dynamic-island/resources/chat.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chat</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="../src/chat-main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6: Create .gitignore**

Write `dynamic-island/.gitignore`:

```
node_modules/
out/
dist/
```

- [ ] **Step 7: Install dependencies and verify build**

```bash
cd dynamic-island && npm install
npx electron-vite build
```

Expected: Build completes (may have warnings about missing entry files, that's OK at this stage).

- [ ] **Step 8: Commit**

```bash
git add dynamic-island/
git commit -m "feat(island): scaffold dynamic-island project with electron-vite"
```

---

### Task 2: Shared Types

**Files:**
- Create: `dynamic-island/src/types.ts`

- [ ] **Step 1: Write types**

Write `dynamic-island/src/types.ts`:

```typescript
// ─── Session Status (matches AI Studio) ───
export type SessionStatus = 'inbox' | 'inprocess' | 'review' | 'done'

// ─── Island-specific types ───
export interface IslandSession {
  id: string
  title: string
  model: string
  status: SessionStatus
  lastMessage?: string
  messageCount: number
}

export interface TaskStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  detail?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}

// ─── WebSocket Message Types ───

// AI Studio → Island
export type ServerMessage =
  | { type: 'sessions:sync'; sessions: IslandSession[] }
  | { type: 'session:update'; sessionId: string; status: SessionStatus; title: string }
  | { type: 'message:new'; sessionId: string; message: Message }
  | { type: 'message:stream'; sessionId: string; messageId: string; chunk: string; done: boolean }
  | { type: 'task:progress'; sessionId: string; steps: TaskStep[] }
  | { type: 'notification'; sessionId: string; level: 'success' | 'error' | 'info'; text: string }
  | { type: 'messages:history'; sessionId: string; messages: Message[] }
  | { type: 'error'; requestType: string; sessionId: string; message: string }

// Island → AI Studio
export type ClientMessage =
  | { type: 'message:send'; sessionId: string; content: string }
  | { type: 'session:cancel'; sessionId: string }
  | { type: 'notification:dismiss'; sessionId: string }
  | { type: 'messages:fetch'; sessionId: string }

// ─── Notch State Machine ───
export type NotchState = 'capsule' | 'cards' | 'chat'

// ─── Notification for cards ───
export interface IslandNotification {
  sessionId: string
  level: 'success' | 'error' | 'info'
  text: string
  timestamp: number
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/src/types.ts
git commit -m "feat(island): add shared type definitions"
```

---

### Task 3: Preload Script

**Files:**
- Create: `dynamic-island/electron/preload.ts`

- [ ] **Step 1: Write preload**

Write `dynamic-island/electron/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Notch state changes (returns cleanup function)
  onStateChange: (callback: (state: string) => void) => {
    const handler = (_e: any, state: string) => callback(state)
    ipcRenderer.on('notch:state-change', handler)
    return () => ipcRenderer.removeListener('notch:state-change', handler)
  },

  // Mouse events from renderer to main
  notifyMouseEnter: () => ipcRenderer.send('notch:mouse-enter'),
  notifyMouseLeave: () => ipcRenderer.send('notch:mouse-leave'),

  // Chat window control
  openChat: (sessionId: string) => ipcRenderer.send('chat:open', sessionId),
  closeChat: () => ipcRenderer.send('chat:close'),

  // WebSocket data forwarding (main → renderer, returns cleanup)
  onWsMessage: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('ws:message', handler)
    return () => ipcRenderer.removeListener('ws:message', handler)
  },

  // WebSocket send (renderer → main → server)
  wsSend: (message: any) => ipcRenderer.send('ws:send', message),

  // Connection status (returns cleanup)
  onConnectionStatus: (callback: (connected: boolean) => void) => {
    const handler = (_e: any, connected: boolean) => callback(connected)
    ipcRenderer.on('ws:connection-status', handler)
    return () => ipcRenderer.removeListener('ws:connection-status', handler)
  },

  // Get current active chat session (returns cleanup)
  onActiveChatSession: (callback: (sessionId: string | null) => void) => {
    const handler = (_e: any, sessionId: string | null) => callback(sessionId)
    ipcRenderer.on('chat:active-session', handler)
    return () => ipcRenderer.removeListener('chat:active-session', handler)
  }
}

contextBridge.exposeInMainWorld('island', api)
```

- [ ] **Step 2: Add type declaration**

Append to `dynamic-island/src/types.ts`:

```typescript

// ─── Preload API (window.island) ───
// on* methods return cleanup functions for useEffect teardown
export interface IslandAPI {
  onStateChange: (callback: (state: string) => void) => () => void
  notifyMouseEnter: () => void
  notifyMouseLeave: () => void
  openChat: (sessionId: string) => void
  closeChat: () => void
  onWsMessage: (callback: (data: any) => void) => () => void
  wsSend: (message: any) => void
  onConnectionStatus: (callback: (connected: boolean) => void) => () => void
  onActiveChatSession: (callback: (sessionId: string | null) => void) => () => void
}

declare global {
  interface Window {
    island: IslandAPI
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add dynamic-island/electron/preload.ts dynamic-island/src/types.ts
git commit -m "feat(island): add preload IPC bridge"
```

---

### Task 4: Notch Detector

**Files:**
- Create: `dynamic-island/electron/notchDetector.ts`

- [ ] **Step 1: Write notch detector**

Write `dynamic-island/electron/notchDetector.ts`:

```typescript
import { execSync } from 'child_process'
import { screen } from 'electron'

/**
 * Detect if the current MacBook has a hardware notch.
 * Checks hw.model against known notch models:
 * - MacBookPro18+ (2021 M1 Pro/Max and later)
 * - MacBookAir11+ (2022 M2 and later)
 */
export function hasHardwareNotch(): boolean {
  try {
    const model = execSync('sysctl -n hw.model').toString().trim()
    if (/^MacBookPro(1[8-9]|[2-9]\d),/.test(model)) return true
    if (/^MacBookAir(1[1-9]|[2-9]\d),/.test(model)) return true
    // Apple Silicon Mac identifiers (Mac15,x etc.)
    if (/^Mac(1[5-9]|[2-9]\d),/.test(model)) return true
    return false
  } catch {
    return false
  }
}

/**
 * Check if the internal (built-in) display is active.
 * The notch overlay only shows on the internal display.
 */
export function getInternalDisplay(): Electron.Display | null {
  const displays = screen.getAllDisplays()
  for (const d of displays) {
    if ((d as any).internal === true) return d
    const label = (d.label || '').toLowerCase()
    if (
      label.includes('built-in') ||
      label.includes('color lcd') ||
      label.includes('liquid retina')
    ) {
      return d
    }
  }
  // Fallback: primary display if only one display connected
  if (displays.length === 1) return displays[0]
  return null
}

/**
 * Get the notch height (menu bar offset) from display work area.
 */
export function getNotchHeight(display: Electron.Display): number {
  const topOffset = display.workArea.y - display.bounds.y
  return topOffset > 0 ? topOffset : 40
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/electron/notchDetector.ts
git commit -m "feat(island): add hardware notch detection"
```

---

### Task 5: WebSocket Client

**Files:**
- Create: `dynamic-island/electron/wsClient.ts`

- [ ] **Step 1: Write WebSocket client**

Write `dynamic-island/electron/wsClient.ts`:

```typescript
import WebSocket from 'ws'
import { EventEmitter } from 'events'

const DEFAULT_PORT = 9720
const RECONNECT_DELAY = 3000

export class WsClient extends EventEmitter {
  private ws: WebSocket | null = null
  private url: string
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionallyClosed = false

  constructor() {
    super()
    const port = process.env.ISLAND_WS_PORT
      ? parseInt(process.env.ISLAND_WS_PORT, 10)
      : DEFAULT_PORT
    this.url = `ws://localhost:${port}`
  }

  connect(): void {
    this.intentionallyClosed = false
    this.tryConnect()
  }

  private tryConnect(): void {
    if (this.intentionallyClosed) return

    try {
      this.ws = new WebSocket(this.url)

      this.ws.on('open', () => {
        this.emit('connected')
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer)
          this.reconnectTimer = null
        }
      })

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          this.emit('message', msg)
        } catch {
          // Ignore malformed messages
        }
      })

      this.ws.on('close', () => {
        this.emit('disconnected')
        this.scheduleReconnect()
      })

      this.ws.on('error', () => {
        // Error will trigger close event, which handles reconnection
      })
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed) return
    if (this.reconnectTimer) return

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.tryConnect()
    }, RECONNECT_DELAY)
  }

  send(message: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  close(): void {
    this.intentionallyClosed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/electron/wsClient.ts
git commit -m "feat(island): add WebSocket client with auto-reconnect"
```

---

### Task 6: Window Manager

**Files:**
- Create: `dynamic-island/electron/windowManager.ts`

- [ ] **Step 1: Write window manager**

Write `dynamic-island/electron/windowManager.ts`:

```typescript
import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { getInternalDisplay, getNotchHeight } from './notchDetector'

type NotchState = 'capsule' | 'cards'

const NOTCH_WIDTH = 600
const NOTCH_HEIGHT = 140
const CHAT_WIDTH = 420
const CHAT_HEIGHT = 600
const HOVER_POLL_INTERVAL = 100
const HOVER_TRIGGER_WIDTH = 200
const HOVER_TRIGGER_HEIGHT = 40
const COLLAPSE_DELAY = 1500

export class WindowManager {
  private notchWindow: BrowserWindow | null = null
  private chatWindow: BrowserWindow | null = null
  private notchState: NotchState = 'capsule'
  private hoverPollTimer: ReturnType<typeof setInterval> | null = null
  private collapseTimer: ReturnType<typeof setTimeout> | null = null
  private chatOpen = false
  private activeChatSessionId: string | null = null

  constructor(private preloadPath: string) {}

  createWindows(): void {
    const display = getInternalDisplay()
    if (!display) return

    const notchHeight = getNotchHeight(display)
    const centerX = display.bounds.x + Math.round((display.bounds.width - NOTCH_WIDTH) / 2)

    // Notch Window
    this.notchWindow = new BrowserWindow({
      width: NOTCH_WIDTH,
      height: NOTCH_HEIGHT,
      x: centerX,
      y: display.bounds.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      hasShadow: false,
      focusable: false,
      skipTaskbar: true,
      hiddenInMissionControl: true,
      fullscreenable: false,
      type: 'panel',
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.notchWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.notchWindow.setIgnoreMouseEvents(true)
    this.notchWindow.showInactive()

    // Chat Window (hidden initially)
    this.chatWindow = new BrowserWindow({
      width: CHAT_WIDTH,
      height: CHAT_HEIGHT,
      x: display.bounds.x + Math.round((display.bounds.width - CHAT_WIDTH) / 2),
      y: display.bounds.y + Math.round((display.bounds.height - CHAT_HEIGHT) / 2),
      frame: false,
      transparent: true,
      alwaysOnTop: false,
      resizable: false,
      hasShadow: true,
      show: false,
      fullscreenable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.setupIPC()
    this.startHoverPolling()
  }

  private setupIPC(): void {
    ipcMain.on('notch:mouse-enter', () => {
      if (this.collapseTimer) {
        clearTimeout(this.collapseTimer)
        this.collapseTimer = null
      }
    })

    ipcMain.on('notch:mouse-leave', () => {
      if (this.notchState === 'cards' && !this.chatOpen) {
        this.collapseTimer = setTimeout(() => {
          this.transitionTo('capsule')
        }, COLLAPSE_DELAY)
      }
    })

    ipcMain.on('chat:open', (_e, sessionId: string) => {
      this.activeChatSessionId = sessionId
      this.chatOpen = true
      this.chatWindow?.webContents.send('chat:active-session', sessionId)
      this.chatWindow?.show()
      this.chatWindow?.focus()
    })

    ipcMain.on('chat:close', () => {
      this.chatOpen = false
      this.activeChatSessionId = null
      this.chatWindow?.hide()
    })
  }

  private startHoverPolling(): void {
    if (this.hoverPollTimer) return

    this.hoverPollTimer = setInterval(() => {
      if (this.notchState !== 'capsule') return

      const cursor = screen.getCursorScreenPoint()
      const display = getInternalDisplay()
      if (!display) return

      const centerX = display.bounds.x + display.bounds.width / 2
      const triggerLeft = centerX - HOVER_TRIGGER_WIDTH / 2
      const triggerRight = centerX + HOVER_TRIGGER_WIDTH / 2
      const triggerBottom = display.bounds.y + HOVER_TRIGGER_HEIGHT

      if (
        cursor.x >= triggerLeft &&
        cursor.x <= triggerRight &&
        cursor.y >= display.bounds.y &&
        cursor.y <= triggerBottom
      ) {
        this.transitionTo('cards')
      }
    }, HOVER_POLL_INTERVAL)
  }

  private stopHoverPolling(): void {
    if (this.hoverPollTimer) {
      clearInterval(this.hoverPollTimer)
      this.hoverPollTimer = null
    }
  }

  private transitionTo(state: NotchState): void {
    this.notchState = state

    if (state === 'cards') {
      this.stopHoverPolling()
      this.notchWindow?.setIgnoreMouseEvents(false)
      this.notchWindow?.webContents.send('notch:state-change', 'cards')
    } else if (state === 'capsule') {
      this.notchWindow?.setIgnoreMouseEvents(true)
      this.notchWindow?.webContents.send('notch:state-change', 'capsule')
      this.startHoverPolling()
    }
  }

  /** Called when a new notification arrives — auto-expand from capsule */
  expandForNotification(): void {
    if (this.notchState === 'capsule') {
      this.transitionTo('cards')
      // Auto-collapse after 4 seconds if not interacted with
      setTimeout(() => {
        if (this.notchState === 'cards' && !this.chatOpen) {
          this.transitionTo('capsule')
        }
      }, 4000)
    }
  }

  /** Re-show chat window (e.g., when clicking "Open in chat" again) */
  showChat(sessionId: string): void {
    this.activeChatSessionId = sessionId
    this.chatOpen = true
    this.chatWindow?.webContents.send('chat:active-session', sessionId)
    if (!this.chatWindow?.isVisible()) {
      this.chatWindow?.show()
    }
    this.chatWindow?.focus()
  }

  /** Forward WebSocket messages to both renderers */
  broadcastToRenderers(data: any): void {
    this.notchWindow?.webContents.send('ws:message', data)
    this.chatWindow?.webContents.send('ws:message', data)
  }

  /** Update connection status in both renderers */
  setConnectionStatus(connected: boolean): void {
    this.notchWindow?.webContents.send('ws:connection-status', connected)
    this.chatWindow?.webContents.send('ws:connection-status', connected)
  }

  loadPages(notchURL: string, chatURL: string): void {
    this.notchWindow?.loadURL(notchURL)
    this.chatWindow?.loadURL(chatURL)
  }

  loadFiles(notchPath: string, chatPath: string): void {
    this.notchWindow?.loadFile(notchPath)
    this.chatWindow?.loadFile(chatPath)
  }

  destroy(): void {
    this.stopHoverPolling()
    if (this.collapseTimer) clearTimeout(this.collapseTimer)
    this.notchWindow?.destroy()
    this.chatWindow?.destroy()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/electron/windowManager.ts
git commit -m "feat(island): add dual-window manager with hover detection"
```

---

### Task 7: Main Process Entry

**Files:**
- Create: `dynamic-island/electron/main.ts`

- [ ] **Step 1: Write main process**

Write `dynamic-island/electron/main.ts`:

```typescript
import { app, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { hasHardwareNotch } from './notchDetector'
import { WindowManager } from './windowManager'
import { WsClient } from './wsClient'

let windowManager: WindowManager | null = null
let wsClient: WsClient | null = null

app.dock?.hide()

app.whenReady().then(() => {
  // Check hardware compatibility
  if (!hasHardwareNotch()) {
    dialog.showErrorBox(
      'Not Supported',
      'Dynamic Island requires a MacBook with a hardware notch (M1 Pro/Max or later).'
    )
    app.quit()
    return
  }

  const preloadPath = join(__dirname, '../preload/index.mjs')

  // Create windows
  windowManager = new WindowManager(preloadPath)
  windowManager.createWindows()

  // In dev mode, load from vite dev server
  if (process.env.ELECTRON_RENDERER_URL) {
    const baseURL = process.env.ELECTRON_RENDERER_URL
    windowManager.loadPages(`${baseURL}/notch.html`, `${baseURL}/chat.html`)
  } else {
    windowManager.loadFiles(
      join(__dirname, '../renderer/notch.html'),
      join(__dirname, '../renderer/chat.html')
    )
  }

  // Connect to AI Studio
  wsClient = new WsClient()

  wsClient.on('connected', () => {
    windowManager?.setConnectionStatus(true)
  })

  wsClient.on('disconnected', () => {
    windowManager?.setConnectionStatus(false)
  })

  wsClient.on('message', (data: any) => {
    windowManager?.broadcastToRenderers(data)

    // Auto-expand on notification
    if (data.type === 'notification') {
      windowManager?.expandForNotification()
    }
  })

  // Forward renderer WS sends to server
  ipcMain.on('ws:send', (_e, message) => {
    wsClient?.send(message)
  })

  wsClient.connect()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  wsClient?.close()
  windowManager?.destroy()
})
```

- [ ] **Step 2: Verify build**

```bash
cd dynamic-island && npx electron-vite build
```

Expected: Build completes successfully for main and preload.

- [ ] **Step 3: Commit**

```bash
git add dynamic-island/electron/main.ts
git commit -m "feat(island): add main process entry with lifecycle management"
```

---

## Chunk 2: Notch Window UI

### Task 8: Island Store Hook

**Files:**
- Create: `dynamic-island/src/hooks/useIslandStore.ts`

- [ ] **Step 1: Write centralized state hook**

Write `dynamic-island/src/hooks/useIslandStore.ts`:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  IslandSession,
  TaskStep,
  Message,
  IslandNotification,
  NotchState,
  ServerMessage
} from '@/types'

interface IslandState {
  sessions: IslandSession[]
  notifications: IslandNotification[]
  messages: Record<string, Message[]>        // sessionId → messages
  streamingText: Record<string, string>      // sessionId → accumulated text
  taskSteps: Record<string, TaskStep[]>      // sessionId → steps
  connected: boolean
  notchState: NotchState
  activeChatSessionId: string | null
}

export function useIslandStore() {
  const [state, setState] = useState<IslandState>({
    sessions: [],
    notifications: [],
    messages: {},
    streamingText: {},
    taskSteps: {},
    connected: false,
    notchState: 'capsule',
    activeChatSessionId: null
  })

  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const handleWsMessage = (data: ServerMessage) => {
      switch (data.type) {
        case 'sessions:sync':
          setState(s => ({ ...s, sessions: data.sessions }))
          break

        case 'session:update':
          setState(s => ({
            ...s,
            sessions: s.sessions.map(ses =>
              ses.id === data.sessionId
                ? { ...ses, status: data.status, title: data.title }
                : ses
            )
          }))
          break

        case 'message:new':
          setState(s => ({
            ...s,
            messages: {
              ...s.messages,
              [data.sessionId]: [
                ...(s.messages[data.sessionId] || []),
                data.message
              ]
            }
          }))
          break

        case 'message:stream': {
          // Key streaming text by sessionId so ChatPanel can look up by active session
          const sid = data.sessionId
          setState(s => {
            const prev = s.streamingText[sid] || ''
            const updated = prev + data.chunk
            if (data.done) {
              // Move streaming text to messages
              const msg: Message = {
                id: data.messageId,
                role: 'assistant',
                content: updated,
                timestamp: Date.now()
              }
              const { [sid]: _, ...restStreaming } = s.streamingText
              return {
                ...s,
                streamingText: restStreaming,
                messages: {
                  ...s.messages,
                  [sid]: [...(s.messages[sid] || []), msg]
                }
              }
            }
            return {
              ...s,
              streamingText: { ...s.streamingText, [sid]: updated }
            }
          })
          break
        }

        case 'task:progress':
          setState(s => ({
            ...s,
            taskSteps: { ...s.taskSteps, [data.sessionId]: data.steps }
          }))
          break

        case 'notification':
          setState(s => ({
            ...s,
            notifications: [
              ...s.notifications,
              {
                sessionId: data.sessionId,
                level: data.level,
                text: data.text,
                timestamp: Date.now()
              }
            ]
          }))
          break

        case 'messages:history':
          setState(s => ({
            ...s,
            messages: { ...s.messages, [data.sessionId]: data.messages }
          }))
          break

        case 'error':
          setState(s => ({
            ...s,
            sessions: s.sessions.filter(ses => ses.id !== data.sessionId)
          }))
          break
      }
    }

    const handleConnectionStatus = (connected: boolean) => {
      setState(s => ({ ...s, connected }))
    }

    const handleStateChange = (notchState: string) => {
      setState(s => ({ ...s, notchState: notchState as NotchState }))
    }

    const handleActiveChatSession = (sessionId: string | null) => {
      setState(s => ({ ...s, activeChatSessionId: sessionId }))
    }

    const cleanupWs = window.island.onWsMessage(handleWsMessage)
    const cleanupConn = window.island.onConnectionStatus(handleConnectionStatus)
    const cleanupState = window.island.onStateChange(handleStateChange)
    const cleanupChat = window.island.onActiveChatSession(handleActiveChatSession)

    return () => {
      cleanupWs()
      cleanupConn()
      cleanupState()
      cleanupChat()
    }
  }, [])

  const sendMessage = useCallback((sessionId: string, content: string) => {
    window.island.wsSend({ type: 'message:send', sessionId, content })
  }, [])

  const cancelSession = useCallback((sessionId: string) => {
    window.island.wsSend({ type: 'session:cancel', sessionId })
  }, [])

  const dismissNotification = useCallback((sessionId: string) => {
    window.island.wsSend({ type: 'notification:dismiss', sessionId })
    setState(s => ({
      ...s,
      notifications: s.notifications.filter(n => n.sessionId !== sessionId)
    }))
  }, [])

  const fetchMessages = useCallback((sessionId: string) => {
    window.island.wsSend({ type: 'messages:fetch', sessionId })
  }, [])

  const openChat = useCallback((sessionId: string) => {
    window.island.openChat(sessionId)
  }, [])

  const closeChat = useCallback(() => {
    window.island.closeChat()
  }, [])

  return {
    ...state,
    sendMessage,
    cancelSession,
    dismissNotification,
    fetchMessages,
    openChat,
    closeChat
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/src/hooks/useIslandStore.ts
git commit -m "feat(island): add centralized state store hook"
```

---

### Task 9: Capsule Component

**Files:**
- Create: `dynamic-island/src/components/NotchView/Capsule.tsx`

- [ ] **Step 1: Write capsule**

Write `dynamic-island/src/components/NotchView/Capsule.tsx`:

```tsx
import { motion } from 'motion/react'

interface CapsuleProps {
  visible: boolean
  connected: boolean
}

export function Capsule({ visible, connected }: CapsuleProps) {
  return (
    <motion.div
      className="absolute left-1/2 top-0 -translate-x-1/2"
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        width: visible ? 160 : 140,
        height: visible ? 30 : 0
      }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
    >
      <div
        className="w-full h-full rounded-b-xl"
        style={{
          backgroundColor: connected ? '#000' : '#1a1a1a',
          opacity: connected ? 1 : 0.5
        }}
      />
    </motion.div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/src/components/NotchView/Capsule.tsx
git commit -m "feat(island): add capsule component"
```

---

### Task 10: TaskCard Component

**Files:**
- Create: `dynamic-island/src/components/NotchView/TaskCard.tsx`

- [ ] **Step 1: Write task card**

Write `dynamic-island/src/components/NotchView/TaskCard.tsx`:

```tsx
import { motion } from 'motion/react'
import { Check, X, Loader2, Clock, AlertCircle } from 'lucide-react'
import type { IslandSession } from '@/types'

interface TaskCardProps {
  session: IslandSession
  onOpenChat: (sessionId: string) => void
  onCancel: (sessionId: string) => void
  onDismiss: (sessionId: string) => void
}

const statusConfig = {
  done: {
    icon: Check,
    color: '#4ade80',
    bg: 'linear-gradient(135deg, #1a3a1a, #0d2a0d)',
    border: 'rgba(74, 222, 128, 0.2)',
    label: 'Task has been completed'
  },
  inprocess: {
    icon: Loader2,
    color: '#60a5fa',
    bg: 'linear-gradient(135deg, #1a1a2a, #0d0d1a)',
    border: 'rgba(96, 165, 250, 0.2)',
    label: 'In progress...'
  },
  inbox: {
    icon: Clock,
    color: '#fbbf24',
    bg: 'linear-gradient(135deg, #2a2015, #1a150d)',
    border: 'rgba(251, 191, 36, 0.15)',
    label: 'Waiting'
  },
  review: {
    icon: AlertCircle,
    color: '#f87171',
    bg: 'linear-gradient(135deg, #2a1a1a, #1a0d0d)',
    border: 'rgba(248, 113, 113, 0.2)',
    label: 'Needs review'
  }
} as const

export function TaskCard({ session, onOpenChat, onCancel, onDismiss }: TaskCardProps) {
  const config = statusConfig[session.status]
  const Icon = config.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scaleX: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 min-w-[160px] relative rounded-[14px] p-3"
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`
      }}
    >
      {/* Close button */}
      <button
        onClick={() => onDismiss(session.id)}
        className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.2)' }}
      >
        <X size={10} color="#888" />
      </button>

      {/* Status icon + title */}
      <div className="flex items-center gap-1.5 mb-2">
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center"
          style={{ backgroundColor: session.status === 'done' ? config.color : '#333' }}
        >
          <Icon
            size={10}
            color={session.status === 'done' ? '#000' : config.color}
            className={session.status === 'inprocess' ? 'animate-spin' : ''}
          />
        </div>
        <span
          className="text-[11px] font-bold truncate max-w-[120px]"
          style={{ color: config.color }}
        >
          {session.title}
        </span>
      </div>

      {/* Status text */}
      <div className="text-[10px] text-[#8a8a8a] mb-2 truncate">
        {session.lastMessage || config.label}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        {session.status === 'inprocess' && (
          <button
            onClick={() => onCancel(session.id)}
            className="text-[10px] text-[#aaa] px-3 py-1 rounded-lg cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => onOpenChat(session.id)}
          className="text-[10px] text-white font-semibold px-3 py-1 rounded-lg cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Open in chat
        </button>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/src/components/NotchView/TaskCard.tsx
git commit -m "feat(island): add notification task card component"
```

---

### Task 11: NotchView Container

**Files:**
- Create: `dynamic-island/src/components/NotchView/NotchView.tsx`
- Create: `dynamic-island/src/notch-main.tsx`

- [ ] **Step 1: Write NotchView**

Write `dynamic-island/src/components/NotchView/NotchView.tsx`:

```tsx
import { AnimatePresence } from 'motion/react'
import { Capsule } from './Capsule'
import { TaskCard } from './TaskCard'
import { useIslandStore } from '@/hooks/useIslandStore'

export function NotchView() {
  const {
    sessions,
    connected,
    notchState,
    openChat,
    cancelSession,
    dismissNotification,
    fetchMessages
  } = useIslandStore()

  const isCapsule = notchState === 'capsule'
  const displaySessions = sessions.slice(0, 3)
  const overflowCount = sessions.length - 3

  const handleOpenChat = (sessionId: string) => {
    fetchMessages(sessionId)
    openChat(sessionId)
  }

  return (
    <div
      className="w-full h-full select-none"
      style={{ background: 'transparent' }}
      onMouseEnter={() => window.island.notifyMouseEnter()}
      onMouseLeave={() => window.island.notifyMouseLeave()}
    >
      {/* Capsule (visible when collapsed) */}
      <Capsule visible={isCapsule} connected={connected} />

      {/* Cards (visible when expanded) */}
      <AnimatePresence>
        {!isCapsule && (
          <div className="flex gap-2 px-4 pt-2 pb-3">
            {displaySessions.map(session => (
              <TaskCard
                key={session.id}
                session={session}
                onOpenChat={handleOpenChat}
                onCancel={cancelSession}
                onDismiss={dismissNotification}
              />
            ))}
            {overflowCount > 0 && (
              <div className="flex items-center px-3 text-[11px] text-[#888] font-medium">
                +{overflowCount} more
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Write notch-main.tsx entry**

Write `dynamic-island/src/notch-main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { NotchView } from '@/components/NotchView/NotchView'
import '@/styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotchView />
  </StrictMode>
)
```

- [ ] **Step 3: Commit**

```bash
git add dynamic-island/src/components/NotchView/ dynamic-island/src/notch-main.tsx
git commit -m "feat(island): add NotchView container with capsule/cards states"
```

---

## Chunk 3: Chat Panel UI

### Task 12: Liquid Glass Styles

**Files:**
- Create: `dynamic-island/src/styles/liquid-glass.css`

- [ ] **Step 1: Write liquid glass CSS**

Write `dynamic-island/src/styles/liquid-glass.css`:

```css
.liquid-glass {
  background: rgba(30, 40, 55, 0.75);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  box-shadow:
    0 20px 50px -12px rgba(0, 0, 0, 0.5),
    0 8px 20px -4px rgba(0, 0, 0, 0.4),
    0 2px 8px -2px rgba(0, 0, 0, 0.6);
  position: relative;
  overflow: hidden;
}

.liquid-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.02) 30%,
    rgba(0, 0, 0, 0.1) 100%
  );
  border-radius: 20px;
  pointer-events: none;
}

.liquid-glass-input {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}

.liquid-glass-input:focus-within {
  border-color: rgba(255, 255, 255, 0.2);
}

.msg-bubble-user {
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 16px;
}

.msg-bubble-assistant {
  color: #e2e8f0;
}

.task-progress-panel {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}
```

- [ ] **Step 2: Import in index.css**

Update `dynamic-island/src/styles/index.css`:

```css
@import "tailwindcss";
@import "./liquid-glass.css";
```

- [ ] **Step 3: Commit**

```bash
git add dynamic-island/src/styles/
git commit -m "feat(island): add liquid glass CSS styles"
```

---

### Task 13: TitleBar Component

**Files:**
- Create: `dynamic-island/src/components/ChatPanel/TitleBar.tsx`

- [ ] **Step 1: Write TitleBar**

Write `dynamic-island/src/components/ChatPanel/TitleBar.tsx`:

```tsx
import { X, Square } from 'lucide-react'

interface TitleBarProps {
  title: string
  model: string
  isProcessing: boolean
  onClose: () => void
  onStop: () => void
}

export function TitleBar({ title, model, isProcessing, onClose, onStop }: TitleBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
      <button
        onClick={onClose}
        className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        <X size={12} color="#aaa" />
      </button>

      <div className="flex items-center gap-2">
        <span className="text-white text-[13px] font-semibold truncate max-w-[200px]">
          {title}
        </span>
        <span className="text-[#888] text-[9px] bg-white/[0.08] px-2 py-0.5 rounded-lg">
          {model}
        </span>
      </div>

      <div>
        {isProcessing && (
          <button
            onClick={onStop}
            className="w-6 h-6 rounded flex items-center justify-center cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            <Square size={10} color="#fff" fill="#fff" />
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/src/components/ChatPanel/TitleBar.tsx
git commit -m "feat(island): add chat panel title bar"
```

---

### Task 14: MessageList Component

**Files:**
- Create: `dynamic-island/src/components/ChatPanel/MessageList.tsx`

- [ ] **Step 1: Write MessageList**

Write `dynamic-island/src/components/ChatPanel/MessageList.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Message } from '@/types'

interface MessageListProps {
  messages: Message[]
  streamingText?: string
}

export function MessageList({ messages, streamingText }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map(msg => (
        <div
          key={msg.id}
          className={msg.role === 'user' ? 'ml-[20%]' : ''}
        >
          {msg.role === 'user' ? (
            <div className="msg-bubble-user px-4 py-3">
              <p className="text-[#a5b4fc] text-[12px] leading-relaxed">
                {msg.content}
              </p>
            </div>
          ) : (
            <div className="msg-bubble-assistant text-[12px] leading-[1.8]">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>
      ))}

      {/* Streaming indicator */}
      {streamingText && (
        <div className="msg-bubble-assistant text-[12px] leading-[1.8]">
          <ReactMarkdown>{streamingText}</ReactMarkdown>
          <span className="inline-block w-1.5 h-4 bg-white/50 animate-pulse ml-0.5" />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/src/components/ChatPanel/MessageList.tsx
git commit -m "feat(island): add message list with markdown and streaming"
```

---

### Task 15: TaskProgress Component

**Files:**
- Create: `dynamic-island/src/components/ChatPanel/TaskProgress.tsx`

- [ ] **Step 1: Write TaskProgress**

Write `dynamic-island/src/components/ChatPanel/TaskProgress.tsx`:

```tsx
import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Check, Circle, AlertCircle } from 'lucide-react'
import type { TaskStep } from '@/types'

interface TaskProgressProps {
  steps: TaskStep[]
  sessionTitle: string
}

const stepIcons = {
  pending: Circle,
  running: Loader2,
  completed: Check,
  failed: AlertCircle
} as const

export function TaskProgress({ steps, sessionTitle }: TaskProgressProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (steps.length === 0) return null

  const runningCount = steps.filter(s => s.status === 'running').length
  const completedCount = steps.filter(s => s.status === 'completed').length

  return (
    <div className="task-progress-panel mx-4 p-3">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          {runningCount > 0 && (
            <Loader2 size={14} className="animate-spin text-[#60a5fa]" />
          )}
          <span className="text-white text-[11px] font-semibold">{sessionTitle}</span>
          <span className="text-[#888] text-[10px]">
            {completedCount}/{steps.length}
          </span>
        </div>
        {collapsed ? <ChevronDown size={14} color="#888" /> : <ChevronUp size={14} color="#888" />}
      </button>

      {/* Steps list */}
      {!collapsed && (
        <div className="mt-2 pl-2 space-y-1.5">
          {steps.map(step => {
            const Icon = stepIcons[step.status]
            return (
              <div key={step.id} className="flex items-center gap-2">
                <Icon
                  size={12}
                  className={step.status === 'running' ? 'animate-spin text-[#60a5fa]' : ''}
                  color={
                    step.status === 'completed' ? '#4ade80'
                    : step.status === 'failed' ? '#f87171'
                    : step.status === 'running' ? '#60a5fa'
                    : 'rgba(255,255,255,0.2)'
                  }
                />
                <span
                  className="text-[11px]"
                  style={{
                    color:
                      step.status === 'completed' || step.status === 'running'
                        ? '#d1d5db'
                        : '#6b7280'
                  }}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/src/components/ChatPanel/TaskProgress.tsx
git commit -m "feat(island): add collapsible task progress component"
```

---

### Task 16: InputBar Component

**Files:**
- Create: `dynamic-island/src/components/ChatPanel/InputBar.tsx`

- [ ] **Step 1: Write InputBar**

Write `dynamic-island/src/components/ChatPanel/InputBar.tsx`:

```tsx
import { useState, useCallback } from 'react'
import { Send, Square } from 'lucide-react'

interface InputBarProps {
  model: string
  isProcessing: boolean
  onSend: (content: string) => void
  onStop: () => void
}

export function InputBar({ model, isProcessing, onSend, onStop }: InputBarProps) {
  const [text, setText] = useState('')

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }, [text, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="px-4 pb-4 pt-3">
      <div className="liquid-glass-input flex items-center gap-2 px-3.5 py-2.5">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything"
          className="flex-1 bg-transparent text-white text-[12px] outline-none placeholder:text-[#6b7280]"
        />
        <span className="text-[#888] text-[9px] bg-white/[0.08] px-2 py-0.5 rounded-lg whitespace-nowrap">
          {model}
        </span>
        {isProcessing ? (
          <button
            onClick={onStop}
            className="w-6 h-6 rounded-full bg-[#f87171] flex items-center justify-center cursor-pointer"
          >
            <Square size={8} color="#fff" fill="#fff" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            className="w-6 h-6 rounded-full bg-[#4ade80] flex items-center justify-center cursor-pointer"
          >
            <Send size={10} color="#000" />
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dynamic-island/src/components/ChatPanel/InputBar.tsx
git commit -m "feat(island): add chat input bar"
```

---

### Task 17: ChatPanel Container

**Files:**
- Create: `dynamic-island/src/components/ChatPanel/ChatPanel.tsx`
- Create: `dynamic-island/src/chat-main.tsx`

- [ ] **Step 1: Write ChatPanel**

Write `dynamic-island/src/components/ChatPanel/ChatPanel.tsx`:

```tsx
import { motion, AnimatePresence } from 'motion/react'
import { TitleBar } from './TitleBar'
import { MessageList } from './MessageList'
import { TaskProgress } from './TaskProgress'
import { InputBar } from './InputBar'
import { useIslandStore } from '@/hooks/useIslandStore'

export function ChatPanel() {
  const {
    sessions,
    messages,
    streamingText,
    taskSteps,
    activeChatSessionId,
    sendMessage,
    cancelSession,
    closeChat
  } = useIslandStore()

  const session = sessions.find(s => s.id === activeChatSessionId)
  const sessionMessages = activeChatSessionId ? messages[activeChatSessionId] || [] : []
  const steps = activeChatSessionId ? taskSteps[activeChatSessionId] || [] : []
  const isProcessing = session?.status === 'inprocess'

  // streamingText is keyed by sessionId
  const activeStreamingText = activeChatSessionId
    ? streamingText[activeChatSessionId]
    : undefined

  return (
    <AnimatePresence>
      {session && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          className="liquid-glass w-full h-full flex flex-col"
        >
          <TitleBar
            title={session.title}
            model={session.model}
            isProcessing={isProcessing}
            onClose={closeChat}
            onStop={() => cancelSession(session.id)}
          />

          <MessageList
            messages={sessionMessages}
            streamingText={activeStreamingText}
          />

          {steps.length > 0 && (
            <TaskProgress steps={steps} sessionTitle={session.title} />
          )}

          <InputBar
            model={session.model}
            isProcessing={isProcessing}
            onSend={(content) => sendMessage(session.id, content)}
            onStop={() => cancelSession(session.id)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Write chat-main.tsx entry**

Write `dynamic-island/src/chat-main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChatPanel } from '@/components/ChatPanel/ChatPanel'
import '@/styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatPanel />
  </StrictMode>
)
```

- [ ] **Step 3: Build and verify**

```bash
cd dynamic-island && npx electron-vite build
```

Expected: Build completes successfully with both renderer entries.

- [ ] **Step 4: Commit**

```bash
git add dynamic-island/src/components/ChatPanel/ dynamic-island/src/chat-main.tsx
git commit -m "feat(island): add liquid glass chat panel with all subcomponents"
```

---

## Chunk 4: AI Studio Integration

### Task 18: WebSocket Server Module

**Files:**
- Create: `electron/islandServer.ts`
- Modify: `package.json` (add ws dependency)

- [ ] **Step 0: Install ws dependency in AI Studio**

```bash
npm install ws && npm install -D @types/ws
```

- [ ] **Step 1: Write islandServer**

Write `electron/islandServer.ts`:

```typescript
import { WebSocketServer, WebSocket } from 'ws'
import { BrowserWindow, ipcMain } from 'electron'

const DEFAULT_PORT = 9720

let wss: WebSocketServer | null = null
let clients: Set<WebSocket> = new Set()

export function startIslandServer(mainWindow: BrowserWindow): void {
  const port = process.env.ISLAND_WS_PORT
    ? parseInt(process.env.ISLAND_WS_PORT, 10)
    : DEFAULT_PORT

  wss = new WebSocketServer({ port })

  wss.on('connection', (ws) => {
    clients.add(ws)

    // Request current sessions from Renderer
    mainWindow.webContents.send('island:request-sessions')

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        handleClientMessage(mainWindow, msg)
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
    })
  })

  // Listen for session data from Renderer
  ipcMain.on('island:sessions-response', (_e, sessions) => {
    broadcast({ type: 'sessions:sync', sessions })
  })

  // Listen for events from Renderer to forward to Island
  ipcMain.on('island:session-updated', (_e, data) => {
    broadcast({ type: 'session:update', ...data })
  })

  ipcMain.on('island:message-added', (_e, data) => {
    broadcast({ type: 'message:new', ...data })
  })

  ipcMain.on('island:message-stream', (_e, data) => {
    broadcast({ type: 'message:stream', ...data })
  })

  ipcMain.on('island:task-progressed', (_e, data) => {
    broadcast({ type: 'task:progress', ...data })
  })

  ipcMain.on('island:notification', (_e, data) => {
    broadcast({ type: 'notification', ...data })
  })

  ipcMain.on('island:messages-history', (_e, data) => {
    broadcast({ type: 'messages:history', ...data })
  })

  console.log(`[IslandServer] WebSocket server listening on ws://localhost:${port}`)
}

function handleClientMessage(mainWindow: BrowserWindow, msg: any): void {
  switch (msg.type) {
    case 'message:send':
      mainWindow.webContents.send('island:send-message', {
        sessionId: msg.sessionId,
        content: msg.content
      })
      break

    case 'session:cancel':
      mainWindow.webContents.send('island:cancel-session', {
        sessionId: msg.sessionId
      })
      break

    case 'notification:dismiss':
      // No-op on server side, Island handles locally
      break

    case 'messages:fetch':
      mainWindow.webContents.send('island:fetch-messages', {
        sessionId: msg.sessionId
      })
      break
  }
}

function broadcast(data: object): void {
  const payload = JSON.stringify(data)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  }
}

export function stopIslandServer(): void {
  wss?.close()
  clients.clear()
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/islandServer.ts
git commit -m "feat(studio): add WebSocket server for Dynamic Island communication"
```

---

### Task 19: AI Studio Main Process Integration

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Import and start island server**

At the top of `electron/main.ts`, add the import:

```typescript
import { startIslandServer, stopIslandServer } from './islandServer'
```

In `electron/main.ts`, find the `mainWindow.on('ready-to-show', ...)` handler. After `mainWindow.show()`, add:

```typescript
startIslandServer(mainWindow)
```

Find the existing `app.on('before-quit', ...)` handler (which has PTY cleanup, sidecar killing logic). Add `stopIslandServer()` as the first line in the handler, before PTY/sidecar cleanup:

```typescript
app.on('before-quit', async (e) => {
  stopIslandServer()  // ← Add this line first
  // ... existing PTY cleanup, sidecar.kill(), etc.
})
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "feat(studio): integrate island server in main process lifecycle"
```

---

### Task 20: AI Studio Preload Changes

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`

- [ ] **Step 1: Add island methods to preload**

In `electron/preload.ts`, add these methods to the exposed API object:

```typescript
// Island integration
notifyIsland: (event: string, data: any) => {
  ipcRenderer.send(`island:${event}`, data)
},
onIslandMessage: (callback: (data: { sessionId: string; content: string }) => void) => {
  ipcRenderer.on('island:send-message', (_e, data) => callback(data))
},
onIslandCancel: (callback: (data: { sessionId: string }) => void) => {
  ipcRenderer.on('island:cancel-session', (_e, data) => callback(data))
},
onIslandFetchMessages: (callback: (data: { sessionId: string }) => void) => {
  ipcRenderer.on('island:fetch-messages', (_e, data) => callback(data))
},
onIslandRequestSessions: (callback: () => void) => {
  ipcRenderer.on('island:request-sessions', () => callback())
},
sendIslandSessionsResponse: (sessions: any[]) => {
  ipcRenderer.send('island:sessions-response', sessions)
},
sendIslandMessagesHistory: (sessionId: string, messages: any[]) => {
  ipcRenderer.send('island:messages-history', { sessionId, messages })
}
```

- [ ] **Step 2: Update electron.d.ts**

Add to the `AiBackend` interface in `src/types/electron.d.ts`:

```typescript
// Island integration
notifyIsland(event: string, data: any): void
onIslandMessage(callback: (data: { sessionId: string; content: string }) => void): void
onIslandCancel(callback: (data: { sessionId: string }) => void): void
onIslandFetchMessages(callback: (data: { sessionId: string }) => void): void
onIslandRequestSessions(callback: () => void): void
sendIslandSessionsResponse(sessions: any[]): void
sendIslandMessagesHistory(sessionId: string, messages: any[]): void
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts src/types/electron.d.ts
git commit -m "feat(studio): add island IPC methods to preload and type declarations"
```

---

### Task 21: AI Studio Renderer Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/SessionWindow.tsx`

- [ ] **Step 1: Add island listeners in App.tsx**

In `src/App.tsx`, add a `useEffect` that sets up Island communication. This should be placed inside the App component, alongside other effects:

```typescript
// Island integration — session-independent listeners (register once)
useEffect(() => {
  if (!window.aiBackend) return

  // Handle message send from Island
  window.aiBackend.onIslandMessage(({ sessionId, content }) => {
    const event = new CustomEvent('island:send-message', {
      detail: { sessionId, content }
    })
    window.dispatchEvent(event)
  })

  // Handle cancel from Island
  window.aiBackend.onIslandCancel(({ sessionId }) => {
    const event = new CustomEvent('island:cancel-session', {
      detail: { sessionId }
    })
    window.dispatchEvent(event)
  })
}, [])

// Island integration — session-dependent listeners (re-register when sessions change)
// Uses a ref to avoid stale closure for the request-sessions handler
const sessionsRef = useRef(sessions)
sessionsRef.current = sessions

useEffect(() => {
  if (!window.aiBackend) return

  // Respond to session list requests from Island
  window.aiBackend.onIslandRequestSessions(() => {
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
  })

  // Handle message history fetch from Island
  window.aiBackend.onIslandFetchMessages(({ sessionId }) => {
    const session = sessionsRef.current.find(s => s.id === sessionId)
    if (session) {
      const simplifiedMessages = session.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp
      }))
      window.aiBackend.sendIslandMessagesHistory(sessionId, simplifiedMessages)
    }
  })
}, [])
```

- [ ] **Step 2: Add island notification in SessionWindow.tsx**

In `src/components/SessionWindow.tsx`, add island notifications at these specific locations:

**a) In `handleBlockDelta` callback** (where streaming text arrives):

```typescript
// After the existing state update, add:
window.aiBackend?.notifyIsland('message-stream', {
  sessionId: session.id,
  messageId: data.message_id || `msg-${Date.now()}`,
  chunk: data.delta?.text || '',
  done: false
})
```

**b) In `handleMessageComplete` callback** (where AI response finishes):

```typescript
// After existing message complete logic, add:
window.aiBackend?.notifyIsland('message-stream', {
  sessionId: session.id,
  messageId: data.message_id || `msg-${Date.now()}`,
  chunk: '',
  done: true
})
window.aiBackend?.notifyIsland('session-updated', {
  sessionId: session.id,
  status: session.status,
  title: session.title
})
```

**c) In `handleMessageError` callback**:

```typescript
window.aiBackend?.notifyIsland('notification', {
  sessionId: session.id,
  level: 'error',
  text: data.error || 'Request failed'
})
```

**d) Where session status changes** (e.g., when status is updated via `updateSessionStatus`):

```typescript
window.aiBackend?.notifyIsland('session-updated', {
  sessionId: session.id,
  status: newStatus,
  title: session.title
})
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/components/SessionWindow.tsx
git commit -m "feat(studio): add island event listeners and session sync in renderer"
```

---

## Chunk 5: Testing & Polish

### Task 22: Manual Integration Test

- [ ] **Step 1: Start AI Studio in Electron mode**

```bash
npm run dev:electron
```

Expected: AI Studio launches, WebSocket server starts on port 9720.

- [ ] **Step 2: Start Dynamic Island app**

```bash
cd dynamic-island && npm run dev
```

Expected: Island app launches, black capsule appears at top center of screen, blending with hardware notch.

- [ ] **Step 3: Test hover interaction**

Move mouse to top center of screen near the notch.
Expected: Capsule expands to show notification cards.

Move mouse away from the notch area.
Expected: Cards collapse back to capsule after 1.5 seconds.

- [ ] **Step 4: Test chat panel**

Click "Open in chat" on any notification card.
Expected: Liquid glass chat panel appears in screen center with session messages.

Type a message and press Enter.
Expected: Message appears in chat, AI response streams in.

Click close button.
Expected: Chat panel closes, returns to notification cards view.

- [ ] **Step 5: Test connection resilience**

Close AI Studio while Island is running.
Expected: Capsule dims to indicate offline, auto-reconnects when AI Studio restarts.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Dynamic Island app with AI Studio integration"
```
