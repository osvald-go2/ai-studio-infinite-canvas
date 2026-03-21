# Island Toggle Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TopBar toggle button in AI Studio to spawn/kill the Dynamic Island as a child process.

**Architecture:** Main Electron process manages Island lifecycle via `child_process.spawn`. Renderer communicates toggle intent via IPC. State persisted in electron-store.

**Tech Stack:** Electron IPC, child_process, electron-store, React, Tailwind CSS

---

## File Structure

| File | Role |
|------|------|
| `electron/islandManager.ts` | **New** — spawn/kill/status for Island child process |
| `electron/main.ts` | Add IPC handlers, auto-spawn on ready, before-quit cleanup |
| `electron/preload.ts` | Expose `island.toggle`, `island.getStatus`, `island.onStatusChanged` |
| `src/types/electron.d.ts` | Add `island` interface types |
| `src/components/TopBar.tsx` | Add Island toggle button with Notch SVG icon |
| `src/App.tsx` | Add `showIsland` state, wire toggle and status listener |

---

## Task 1: Create `electron/islandManager.ts`

**Files:**
- Create: `electron/islandManager.ts`

- [ ] **Step 1: Create the island manager module**

```typescript
import { spawn, ChildProcess } from 'child_process'
import { app, BrowserWindow } from 'electron'
import path from 'path'

let islandProcess: ChildProcess | null = null

function broadcastStatus(running: boolean): void {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('island:status-changed', running)
    }
  })
}

export function spawnIsland(): void {
  if (islandProcess) return

  const islandMain = path.join(__dirname, '../../dynamic-island/out/main/index.js')

  islandProcess = spawn(process.execPath, [islandMain], {
    stdio: 'ignore',
    detached: false,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
    } as NodeJS.ProcessEnv
  })

  islandProcess.on('exit', () => {
    islandProcess = null
    broadcastStatus(false)
  })

  islandProcess.on('error', (err) => {
    console.error('[islandManager] spawn error:', err)
    islandProcess = null
    broadcastStatus(false)
  })

  broadcastStatus(true)
}

export function killIsland(): void {
  if (!islandProcess) return
  islandProcess.kill()
}

export function isIslandRunning(): boolean {
  return islandProcess !== null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add electron/islandManager.ts
git commit -m "feat: add islandManager module for spawn/kill lifecycle"
```

---

## Task 2: Wire IPC handlers in `electron/main.ts`

**Files:**
- Modify: `electron/main.ts:1-12` (imports and store type)
- Modify: `electron/main.ts:415-428` (app.whenReady)
- Modify: `electron/main.ts:432-452` (before-quit)

- [ ] **Step 1: Add import**

At line 10, after the `chatPopupManager` import, add:

```typescript
import { spawnIsland, killIsland, isIslandRunning } from './islandManager';
```

- [ ] **Step 2: Extend electron-store type**

Change line 12 from:
```typescript
const store = new Store<{ anthropicApiKey?: string; lastProjectDir?: string }>();
```
to:
```typescript
const store = new Store<{ anthropicApiKey?: string; lastProjectDir?: string; islandEnabled?: boolean }>();
```

- [ ] **Step 3: Add IPC handlers**

After the existing `config:getLastProjectDir` handler (line 227), add:

```typescript
// ── Island Toggle IPC ──

ipcMain.handle('island:toggle', (_, enabled: boolean) => {
  store.set('islandEnabled', enabled);
  if (enabled) {
    spawnIsland();
  } else {
    killIsland();
  }
});

ipcMain.handle('island:get-status', () => {
  return isIslandRunning();
});
```

- [ ] **Step 4: Auto-spawn on app ready if stored enabled**

In `app.whenReady()`, after `startIslandServer(mainWindow!)` (line 421), add:

```typescript
  if (store.get('islandEnabled')) {
    spawnIsland();
  }
```

- [ ] **Step 5: Add killIsland to before-quit handler**

In the `before-quit` handler, after `sidecar?.kill()` (line 450), add:

```typescript
  killIsland();
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts
git commit -m "feat: wire island toggle IPC, auto-spawn, and before-quit cleanup"
```

---

## Task 3: Expose island API in `electron/preload.ts`

**Files:**
- Modify: `electron/preload.ts:91-124` (Island integration section)

- [ ] **Step 1: Add island toggle API**

Insert at line 125, before the `// ── Chat Popup API ──` comment (line 126). Note: the new `island:toggle` / `island:get-status` / `island:status-changed` IPC channels use `invoke/handle` pattern, which is distinct from the existing `notifyIsland()` that uses `ipcRenderer.send` — no collision risk.

```typescript
  // ── Island Toggle API ──
  island: {
    toggle: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('island:toggle', enabled),
    getStatus: (): Promise<boolean> =>
      ipcRenderer.invoke('island:get-status'),
    onStatusChanged: (callback: (running: boolean) => void): (() => void) => {
      const handler = (_: any, running: boolean) => callback(running)
      ipcRenderer.on('island:status-changed', handler)
      return () => ipcRenderer.removeListener('island:status-changed', handler)
    },
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: expose island toggle/status API in preload"
```

---

## Task 4: Add island types to `src/types/electron.d.ts`

**Files:**
- Modify: `src/types/electron.d.ts:23-31` (after Island integration, before Chat Popup)

- [ ] **Step 1: Add island interface**

After `emitSessionDeleted(sessionId: string): void;` (line 22), add:

```typescript

  // Island Toggle
  island: {
    toggle(enabled: boolean): Promise<void>;
    getStatus(): Promise<boolean>;
    onStatusChanged(callback: (running: boolean) => void): () => void;
  };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/types/electron.d.ts
git commit -m "feat: add island toggle types to electron.d.ts"
```

---

## Task 5: Add Island toggle button to `TopBar.tsx`

**Files:**
- Modify: `src/components/TopBar.tsx:18-50` (props)
- Modify: `src/components/TopBar.tsx:258-286` (button area)

- [ ] **Step 1: Add props**

Add to the destructured props (after `onToggleTerminal`):

```typescript
  showIsland,
  onToggleIsland,
```

Add to the type definition (after `onToggleTerminal?: () => void`):

```typescript
  showIsland?: boolean,
  onToggleIsland?: () => void,
```

- [ ] **Step 2: Add Island toggle button**

Insert before the Terminal toggle button (before the `{onToggleTerminal && (` block at line 259):

```tsx
        {onToggleIsland && (
          <button
            onClick={onToggleIsland}
            title="Toggle Island"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              showIsland
                ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="4" rx="2"/>
              <rect x="6" y="3" width="12" height="8" rx="2"/>
            </svg>
          </button>
        )}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/TopBar.tsx
git commit -m "feat: add Island toggle button with notch icon to TopBar"
```

---

## Task 6: Wire state in `App.tsx`

**Files:**
- Modify: `src/App.tsx:117-146` (state declarations)
- Modify: `src/App.tsx:354-374` (Island integration effects)
- Modify: `src/App.tsx:611-627` (TopBar props)

- [ ] **Step 1: Add showIsland state**

After `const [showTerminal, setShowTerminal] = useState(false);` (line 125), add:

```typescript
  const [showIsland, setShowIsland] = useState(false);
```

- [ ] **Step 2: Add island status sync effect**

Insert after the "Keep Island in sync" effect block (after line 460, before the "Persist view mode changes" comment at line 462):

```typescript
  // Island toggle — sync status on mount and listen for changes
  useEffect(() => {
    if (!window.aiBackend?.island) return

    // Query initial status
    window.aiBackend.island.getStatus().then(setShowIsland).catch(() => {})

    // Listen for status changes (e.g. Island crashed)
    const cleanup = window.aiBackend.island.onStatusChanged(setShowIsland)
    return cleanup
  }, [])
```

- [ ] **Step 3: Add toggle handler and pass to TopBar**

In the TopBar JSX, add these props:

```tsx
        showIsland={showIsland}
        onToggleIsland={() => {
          const next = !showIsland
          setShowIsland(next)
          window.aiBackend?.island?.toggle(next)
        }}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire Island toggle state and IPC in App.tsx"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds
