# Island Toggle Integration Design

## Summary

Add a toggle button in AI Studio's TopBar to launch and kill the Dynamic Island app as a child process. Island remains a separate Electron app — zero changes to Island code.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Main app spawns Island as child process | Minimal change, clean separation |
| Toggle location | TopBar right side, between Search and Terminal | Consistent with existing toggle buttons |
| Default state | OFF | Not all Macs have notch; conservative default |
| Close behavior | Kill process | Clean, no zombie processes |
| Icon | Custom Notch SVG | Directly represents Dynamic Island hardware |
| State persistence | electron-store `islandEnabled` | Reuses existing storage mechanism |

## Architecture

```
User clicks TopBar Island button (ON)
  → renderer IPC: 'island:toggle' (true)
  → main process: child_process.spawn() launches Island Electron app
  → Island auto-connects WebSocket (port 9720)

User clicks TopBar Island button (OFF)
  → renderer IPC: 'island:toggle' (false)
  → main process: childProcess.kill()
  → Island process terminates
```

### IPC Interface

- `island:toggle(enabled: boolean)` — renderer → main, start/stop Island
- `island:status-changed(running: boolean)` — main → renderer, sync UI on unexpected exit
- `island:get-status() → boolean` — renderer → main (invoke/handle), query current state on renderer load

### Process Lifecycle

- `child.on('exit')` → set `islandProcess = null`, notify renderer of status change (handles crashes)
- `child.on('error')` → log error, set `islandProcess = null`, notify renderer (handles spawn failures)
- Main app `before-quit` → auto `killIsland()`
- Duplicate ON clicks check `isIslandRunning()` to avoid double spawn
- `killIsland()` does NOT null out `islandProcess` — only the `exit` handler does, preventing race conditions on rapid toggle

## File Changes

| File | Change |
|------|--------|
| `electron/islandManager.ts` | **New file** — `spawnIsland()` / `killIsland()` / `isIslandRunning()` using `child_process.spawn` |
| `electron/main.ts` | Import islandManager, auto-spawn on app ready if stored enabled, register `island:toggle` / `island:get-status` IPC handlers, add `killIsland()` to `before-quit` handler |
| `electron/preload.ts` | Expose `island.toggle(enabled)`, `island.getStatus()`, and `island.onStatusChanged(callback)` |
| `src/types/electron.d.ts` | Add `island` interface types |
| `src/components/TopBar.tsx` | Add Island toggle button (custom Notch SVG icon, amber highlight style) |
| `src/App.tsx` | Add `showIsland` state, pass to TopBar, listen for `island:status-changed` |

### islandManager.ts — Spawn Logic

```typescript
import { spawn, ChildProcess } from 'child_process'
import { app, BrowserWindow } from 'electron'
import path from 'path'

let islandProcess: ChildProcess | null = null

function broadcastStatus(running: boolean): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('island:status-changed', running)
  })
}

export function spawnIsland(): void {
  if (islandProcess) return

  // Dev: run Island's built main via electron
  // Production: launch the packaged Island .app bundle
  const islandMain = path.join(__dirname, '../../dynamic-island/out/main/index.js')

  islandProcess = spawn(process.execPath, [islandMain], {
    stdio: 'ignore',
    detached: false,
    env: {
      ...process.env,
      // Strip secrets the Island doesn't need
      ANTHROPIC_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
    }
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
  // Don't null out islandProcess here — let the 'exit' handler do it
  // This prevents race conditions on rapid toggle
  islandProcess.kill()
}

export function isIslandRunning(): boolean {
  return islandProcess !== null
}
```

### TopBar Button

Position: between Search bar and Terminal button. Uses same 32×32 rounded-lg style.

- **OFF**: `bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200`
- **ON**: `bg-amber-500/20 text-amber-400 hover:bg-amber-500/30`

Icon: custom Notch SVG (no lucide-react equivalent):
```html
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="3" width="20" height="4" rx="2"/>
  <rect x="6" y="3" width="12" height="8" rx="2"/>
</svg>
```

### electron-store Persistence

```typescript
// Type extension
Store<{ anthropicApiKey?: string; lastProjectDir?: string; islandEnabled?: boolean }>

// On toggle
store.set('islandEnabled', enabled)

// On app ready
if (store.get('islandEnabled')) spawnIsland()
```

## What Does NOT Change

- **Dynamic Island codebase** — zero modifications
- **WebSocket protocol** — Island connects to port 9720 as before
- **Chat popup** — unaffected, still triggered via Island WebSocket
