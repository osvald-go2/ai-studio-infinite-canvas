# Island Chat Popup — 主应用直出设计

## 问题

Island 和主应用各有一套独立的聊天 UI 实现，功能差距极大：

| | 主应用 SessionWindow | Island ChatPanel |
|---|---|---|
| 消息模型 | `Message` + `ContentBlock[]` (8种block类型) | `Message { id, role, content }` 纯文本 |
| 渲染 | 8+ 专用渲染器 | 简单 react-markdown |
| Streaming | Sidecar 事件 (block.start/delta/stop) | WebSocket 文本 chunk |
| 代码量 | 1474行 + 7个渲染组件 | ~400行 |

每次修改聊天功能都要改两遍，且 Island 端完全不支持 tool_call、todolist、code block 等 block 类型。

## 方案

**删除 Island 的聊天 UI，改由主 Electron 创建一个弹窗 BrowserWindow，直接渲染主应用的 SessionWindow。**

Island 只负责信号传递（"打开聊天"/"关闭聊天"），实际渲染由主应用完成。

## 架构

```
Island TaskCard 点击 "打开聊天"
  → window.island.wsSend({ type: 'chat:open', sessionId })
  → WebSocket → islandServer
  → IPC 'island:chat-open' → 主 Electron main process
  → 主 Electron 创建/显示 chatPopupWindow (frameless, 480x820)
  → 加载 chat-popup.html?sessionId=xxx
  → chat-popup.tsx 挂载，通过 IPC 从主 renderer 获取 session 数据
  → 渲染 SessionWindow (variant="popup")
  → Sidecar 事件广播到所有 BrowserWindow → popup 也收到 streaming
```

```
用户在 popup 发送消息
  → SessionWindow.sendMessage() → backend.sendMessage() → sidecar
  → sidecar 处理并 stream 回复
  → sidecar events 广播到 mainWindow + chatPopupWindow
  → 两边 SessionWindow 都更新（独立状态，相同事件源）
```

```
关闭 popup
  → popup 内 close 按钮 → IPC 'chat-popup:close'
  → 主 Electron hide chatPopupWindow
  → 通知 Island (WebSocket broadcast chat:closed)
```

## 详细设计

### 1. 新入口文件

**`chat-popup.html`** — 新 Vite 入口 HTML，最小化，只有 `<div id="root">` 和 script 标签。

**`src/chat-popup.tsx`** — 轻量 React 入口：

```tsx
// 伪代码
function ChatPopupApp() {
  const [session, setSession] = useState<Session | null>(null)
  const sessionId = new URLSearchParams(location.search).get('sessionId')

  useEffect(() => {
    // 通过 IPC 从主 renderer 获取完整 session 数据（含 messages + blocks）
    window.aiBackend.invoke('chat-popup:get-session', { sessionId })
      .then(setSession)
  }, [sessionId])

  if (!session) return <Loading />

  return (
    <SessionWindow
      session={session}
      variant="popup"
      onUpdate={(s) => {
        setSession(s)
        // 同步回主 renderer
        window.aiBackend.notifyIsland('chat-popup:session-updated', s)
      }}
      onClose={() => window.aiBackend.invoke('chat-popup:close')}
    />
  )
}
```

关键设计决策：
- **使用主应用的 preload** — popup 由主 Electron 创建，因此有 `window.aiBackend`，可直接调用 sidecar
- **Session 数据从主 renderer 获取** — 不是从 SQLite 重新加载，而是从 App.tsx 的内存状态获取（包含最新的 messages + blocks）
- **Sidecar 事件自动广播** — 修改 sidecar event handler 广播到所有 BrowserWindow

### 2. SessionWindow variant="popup"

在 `src/components/SessionWindow.tsx` 现有 `variant: 'default' | 'tab'` 基础上新增 `'popup'`：

```tsx
variant?: 'default' | 'tab' | 'popup'
```

popup variant 的行为：
- **标题栏**: 添加 `-webkit-app-region: drag` 实现 frameless 窗口拖拽
- **无 canvas 拖拽**: 不渲染 drag handle / resize handle
- **无 position tracking**: 不调用 `updateSessionPosition`
- **Close 按钮**: 调用 `onClose()` → IPC 隐藏窗口（而非从 sessions 中移除）
- **全高显示**: 占满窗口高度，固定宽度（由 BrowserWindow 决定）
- **背景色**: 使用主应用的深色背景 `#1A1A2E`

与 `variant='tab'` 的区别：tab 有 tab bar 上下文，popup 是完全独立的窗口。

### 3. 主 Electron main.ts 改动

新增 `chatPopupWindow` 管理：

```typescript
let chatPopupWindow: BrowserWindow | null = null

function createChatPopupWindow(sessionId: string): void {
  if (chatPopupWindow && !chatPopupWindow.isDestroyed()) {
    // 已有窗口 → 更新 sessionId 并显示
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
      preload: path.join(__dirname, '../preload/index.mjs'), // 同一个 preload
      sandbox: false,
    },
    show: false,
  })

  // 加载 chat-popup 入口
  if (process.env.ELECTRON_RENDERER_URL) {
    chatPopupWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/chat-popup.html?sessionId=${sessionId}`)
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
```

**Sidecar 事件广播改动**（关键）：

```typescript
// 当前：只发送到 mainWindow
sidecar.on('event', (eventName, data) => {
  mainWindow?.webContents.send('sidecar:event', eventName, data)
})

// 改为：广播到所有 BrowserWindow
sidecar.on('event', (eventName, data) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('sidecar:event', eventName, data)
    }
  }
})
```

**新 IPC handlers：**

```typescript
// Island 请求打开聊天
ipcMain.on('island:chat-open', (_e, { sessionId }) => {
  createChatPopupWindow(sessionId)
})

// Popup 请求关闭
ipcMain.handle('chat-popup:close', () => {
  chatPopupWindow?.hide()
})

// Popup 请求 session 数据（转发给主 renderer）
ipcMain.handle('chat-popup:get-session', async (_e, { sessionId }) => {
  // 从主 renderer 获取
  mainWindow?.webContents.send('chat-popup:request-session', sessionId)
  return new Promise(resolve => {
    ipcMain.once('chat-popup:session-data', (_e, data) => resolve(data))
  })
})
```

### 4. electron.vite.config.ts 改动

添加 `chat-popup.html` 为新入口：

```typescript
renderer: {
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        'chat-popup': path.resolve(__dirname, 'chat-popup.html'),
      },
    },
  },
  // ... plugins, resolve 不变
}
```

### 5. electron/preload.ts 改动

添加 popup 相关 API：

```typescript
// 在现有 contextBridge.exposeInMainWorld 中添加
chatPopup: {
  close: () => ipcRenderer.invoke('chat-popup:close'),
  onSwitchSession: (cb: (sessionId: string) => void) => {
    const handler = (_e: any, sessionId: string) => cb(sessionId)
    ipcRenderer.on('chat-popup:switch-session', handler)
    return () => ipcRenderer.removeListener('chat-popup:switch-session', handler)
  },
}
```

### 6. App.tsx 改动

添加 IPC handler 响应 popup 的 session 数据请求：

```typescript
// 在现有 Island integration useEffect 中添加
window.aiBackend.on('chat-popup:request-session', (sessionId: string) => {
  const session = sessionsRef.current.find(s => s.id === sessionId)
  if (session) {
    // 序列化完整 session（含 messages + blocks）
    window.aiBackend.notifyIsland('chat-popup:session-data', session)
  }
})
```

以及处理 popup 的 session 更新：

```typescript
window.aiBackend.on('chat-popup:session-updated', (updatedSession: Session) => {
  setSessions(prev => prev.map(s =>
    s.id === updatedSession.id ? updatedSession : s
  ))
})
```

### 7. islandServer.ts 改动

处理新的 WebSocket 消息类型：

```typescript
case 'chat:open':
  mainWindow.webContents.send('island:chat-open', {
    sessionId: msg.sessionId
  })
  break

case 'chat:close':
  mainWindow.webContents.send('island:chat-close')
  break
```

### 8. Island 端改动

**useIslandStore.ts** — `openChat()` 改为发 WebSocket：

```typescript
// 旧: window.island.openChat(sessionId)
// 新:
openChat: (sessionId: string) => {
  window.island.wsSend({ type: 'chat:open', sessionId })
}
```

`closeChat()` 同理改为发 WebSocket。

删除 `activeChatSessionId` 状态（popup 由主应用管理）。
简化 `messages`、`streamingText` 相关状态（不再需要在 Island 端维护聊天消息）。

**windowManager.ts** — 删除 chat window 相关代码：
- 删除 `chatWindow` 创建
- 删除 `openChat()` / `closeChat()` 方法
- 删除 chat window drag 相关逻辑
- 保留 notch window 管理不变

**preload.ts** — 删除 chat window 相关 API：
- 删除 `openChat`, `closeChat`
- 删除 `startChatDrag`, `dragChat`, `endChatDrag`
- 删除 `onActiveChatSession`
- 保留 WebSocket 和 notch 相关 API

### 9. 删除的文件

| 文件 | 原因 |
|------|------|
| `dynamic-island/src/components/ChatPanel/ChatPanel.tsx` | 被主应用 SessionWindow 替代 |
| `dynamic-island/src/components/ChatPanel/InputBar.tsx` | 同上 |
| `dynamic-island/src/components/ChatPanel/MessageList.tsx` | 同上 |
| `dynamic-island/src/components/ChatPanel/TitleBar.tsx` | 同上 |
| `dynamic-island/src/components/ChatPanel/TaskProgress.tsx` | 同上 |
| `dynamic-island/resources/chat.html` | popup 由主应用入口替代 |

## 状态同步设计

**两个 SessionWindow 实例可能同时存在**（main canvas + popup），设计为独立且幂等：

1. **Sidecar 事件广播到所有窗口** — 两个实例都收到 block.start/delta/stop，各自更新本地状态
2. **发送消息**: popup 直接调用 sidecar（和 main 用同一个 backendSessionId），sidecar 事件广播回两边
3. **Session 状态同步**: popup 的 `onUpdate` 通过 IPC 通知 main renderer 更新 App.tsx 的 sessions 状态
4. **打开时**: popup 从 main renderer 获取最新 session 快照（含所有 blocks）
5. **并发控制**: 不做特殊处理。两边同时发消息是用户操作问题，实际场景中 popup 打开时用户不会在 canvas 上操作同一个 session

## 影响范围

- **Island NotchView 完全不受影响** — session cards、capsule、通知等功能不变
- **Island WebSocket 连接保留** — 仍用于 session sync、notifications
- **主应用 SessionWindow 改动最小** — 只增加 `variant='popup'` 和 drag region CSS
- **Island 聊天功能删除约 800 行代码** — ChatPanel 全家桶 + windowManager chat 部分 + preload chat 部分

## 验证计划

1. `npx tsc --noEmit` — 主应用类型检查
2. `cd dynamic-island && npx tsc --noEmit && npx electron-vite build` — Island 构建
3. 完整重启 Electron
4. 从 Island 点击 session card → 弹窗打开，显示完整 block 渲染（tool_call, todolist, code 等）
5. 在弹窗中发送消息 → streaming 正常，所有 block 类型正确渲染
6. 弹窗中 close → 窗口隐藏
7. 再次点击 → 窗口恢复，消息历史完整
8. 主 canvas 中同一 session 的 SessionWindow 同步更新
9. 从弹窗发消息后，Island NotchView 的 lastMessage 也更新
