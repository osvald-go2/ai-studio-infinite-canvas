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
  → WebSocket → islandServer (主 Electron main process)
  → islandServer 直接调用 createChatPopupWindow(sessionId)
  → 主 Electron 创建/显示 chatPopupWindow (frameless, 480x820)
  → 加载 chat-popup.html?sessionId=xxx
  → chat-popup.tsx 挂载，通过专用 IPC 从主 renderer 获取 session 数据
  → 渲染 SessionWindow (variant="popup")
  → Sidecar 事件广播到主应用所有 BrowserWindow → popup 也收到 streaming
```

```
用户在 popup 发送消息
  → SessionWindow.sendMessage() → backend.sendMessage() → sidecar
  → sidecar 处理并 stream 回复
  → sidecar events 广播到 mainWindow + chatPopupWindow
  → 两边 SessionWindow 都更新（独立状态，相同事件源）
  → popup 的 onUpdate 只同步元数据（title, status）回主 renderer
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
    // 通过专用 preload API 获取 session 数据
    window.aiBackend.chatPopup.getSession(sessionId!).then(setSession)

    // 监听 session 切换（复用已有 popup 窗口时）
    const cleanup = window.aiBackend.chatPopup.onSwitchSession((newId) => {
      window.aiBackend.chatPopup.getSession(newId).then(setSession)
    })
    return cleanup
  }, [sessionId])

  if (!session) return <Loading />

  return (
    <SessionWindow
      session={session}
      variant="popup"
      onUpdate={(s) => {
        setSession(s)
        // 只同步元数据回主 renderer，消息同步由 sidecar 事件处理
        window.aiBackend.chatPopup.syncMetadata({
          id: s.id, title: s.title, status: s.status,
          backendSessionId: s.backendSessionId
        })
      }}
      onClose={() => window.aiBackend.chatPopup.close()}
    />
  )
}
```

关键设计决策：
- **使用主应用的 preload** — popup 由主 Electron 创建，因此有 `window.aiBackend`，可直接调用 sidecar
- **专用 preload API** — popup 通信使用 `window.aiBackend.chatPopup.*` 命名空间的专用方法，**不复用** `on()/invoke()/notifyIsland()` 这些 sidecar 专用 API
- **Session 数据从主 renderer 获取** — 从 App.tsx 的内存状态获取（含最新 messages + blocks），通过 main process 中转
- **Sidecar 事件自动广播** — 修改 sidecar event handler 广播到主应用的所有 BrowserWindow
- **GitProvider** — popup 需要用 `<GitProvider>` 包裹 SessionWindow（SessionWindow 内部 `useGit()` 依赖此 context）

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
- **无 git panel toggle**: popup 中不显示 git sidebar 按钮

与 `variant='tab'` 的区别：tab 有 tab bar 上下文，popup 是完全独立的窗口。

### 3. 主 Electron main.ts 改动

**新增 `chatPopupWindow` 管理**（导出 `createChatPopupWindow` 供 islandServer 调用）：

```typescript
let chatPopupWindow: BrowserWindow | null = null

export function createChatPopupWindow(sessionId: string): void {
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
```

**Sidecar 事件广播改动**（关键）：

```typescript
// 当前：只发送到 mainWindow
sidecar.on('event', (eventName, data) => {
  mainWindow?.webContents.send('sidecar:event', eventName, data)
})

// 改为：广播到主应用的所有 BrowserWindow（mainWindow + chatPopupWindow）
// 注：BrowserWindow.getAllWindows() 只返回当前进程的窗口，不会影响 Island 进程
sidecar.on('event', (eventName, data) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('sidecar:event', eventName, data)
    }
  }
})

// sidecar crash handler 同理改为广播
sidecar.on('crashed', (code) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('sidecar:event', 'sidecar.restarted', {})
    }
  }
  // ... restart logic
})
```

**新 IPC handlers：**

```typescript
// Popup 请求关闭
ipcMain.handle('chat-popup:close', () => {
  chatPopupWindow?.hide()
})

// Popup 请求 session 数据（转发给主 renderer，带超时）
ipcMain.handle('chat-popup:get-session', async (_e, { sessionId }) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window not available')
  }

  // 使用 correlation ID 避免并发请求混淆
  const requestId = `${sessionId}-${Date.now()}`
  mainWindow.webContents.send('chat-popup:request-session', { sessionId, requestId })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ipcMain.removeHandler(`chat-popup:session-response:${requestId}`)
      reject(new Error('Session data request timed out'))
    }, 5000)

    ipcMain.once(`chat-popup:session-response:${requestId}`, (_e, data) => {
      clearTimeout(timeout)
      resolve(data)
    })
  })
})

// Popup 同步元数据回主 renderer
ipcMain.on('chat-popup:sync-metadata', (_e, metadata) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('chat-popup:metadata-updated', metadata)
  }
})
```

**mainWindow 关闭时清理 popup：**

```typescript
mainWindow.on('closed', () => {
  mainWindow = null
  // 主窗口关闭时销毁 popup，避免孤立窗口
  if (chatPopupWindow && !chatPopupWindow.isDestroyed()) {
    chatPopupWindow.destroy()
    chatPopupWindow = null
  }
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

在 `contextBridge.exposeInMainWorld('aiBackend', { ... })` 中新增 `chatPopup` 命名空间：

```typescript
chatPopup: {
  // 获取 session 数据（走 main process 中转到主 renderer）
  getSession: (sessionId: string): Promise<any> =>
    ipcRenderer.invoke('chat-popup:get-session', { sessionId }),

  // 关闭 popup 窗口
  close: (): Promise<void> =>
    ipcRenderer.invoke('chat-popup:close'),

  // 同步元数据回主 renderer（只传 title/status，不传整个 session）
  syncMetadata: (metadata: { id: string; title: string; status: string; backendSessionId?: string }) =>
    ipcRenderer.send('chat-popup:sync-metadata', metadata),

  // 监听 session 切换（复用已有 popup 窗口时触发）
  onSwitchSession: (cb: (sessionId: string) => void) => {
    const handler = (_e: any, sessionId: string) => cb(sessionId)
    ipcRenderer.on('chat-popup:switch-session', handler)
    return () => ipcRenderer.removeListener('chat-popup:switch-session', handler)
  },
},
```

**注意**：这些 API 使用专用 IPC channel，**不经过** `sidecar:invoke` 或 `sidecar:event`。`window.aiBackend.invoke()` 和 `on()` 仍然专门用于 sidecar 通信，popup 不复用它们。

### 6. App.tsx 改动

在 Island integration `useEffect` 中添加 popup 通信（使用**专用 IPC listener**，不复用 `window.aiBackend.on()`）：

```typescript
useEffect(() => {
  if (!window.aiBackend) return

  // 响应 popup 的 session 数据请求
  const handleSessionRequest = (_e: any, { sessionId, requestId }: { sessionId: string; requestId: string }) => {
    const session = sessionsRef.current.find(s => s.id === sessionId)
    if (session) {
      // Session 包含 messages + blocks，Electron 的 structured clone 可以处理纯 JSON 对象
      window.aiBackend.ipcSend(`chat-popup:session-response:${requestId}`, JSON.parse(JSON.stringify(session)))
    }
  }

  // 响应 popup 的元数据同步
  const handleMetadataUpdate = (_e: any, metadata: { id: string; title: string; status: string; backendSessionId?: string }) => {
    setSessions(prev => prev.map(s =>
      s.id === metadata.id
        ? { ...s, title: metadata.title, status: metadata.status as any, backendSessionId: metadata.backendSessionId }
        : s
    ))
  }

  // 注册 IPC listeners（需要在 preload 中暴露 ipcOn/ipcOff 方法）
  window.aiBackend.ipcOn('chat-popup:request-session', handleSessionRequest)
  window.aiBackend.ipcOn('chat-popup:metadata-updated', handleMetadataUpdate)

  return () => {
    window.aiBackend.ipcOff('chat-popup:request-session', handleSessionRequest)
    window.aiBackend.ipcOff('chat-popup:metadata-updated', handleMetadataUpdate)
  }
}, [])
```

**preload.ts 需要额外暴露通用 IPC 方法**（供 App.tsx 在主 renderer 中监听 main process 转发的消息）：

```typescript
// 在 aiBackend 中新增
ipcOn: (channel: string, callback: (...args: any[]) => void) => {
  ipcRenderer.on(channel, callback)
},
ipcOff: (channel: string, callback: (...args: any[]) => void) => {
  ipcRenderer.removeListener(channel, callback)
},
ipcSend: (channel: string, ...args: any[]) => {
  ipcRenderer.send(channel, ...args)
},
```

### 7. islandServer.ts 改动

`islandServer` 运行在主 Electron 的 main process 中，可以**直接调用** `createChatPopupWindow()`，无需绕道 renderer。

```typescript
import { createChatPopupWindow } from './main'

// 在 handleClientMessage 的 switch 中添加
case 'chat:open':
  createChatPopupWindow(msg.sessionId)
  break

case 'chat:close':
  // 通过 IPC 让 main process 隐藏 popup
  // （或直接 import chatPopupWindow 引用）
  ipcMain.emit('chat-popup:close-from-island')
  break
```

**设计说明**：`chat:open` 不经过 renderer 中转，直接在 main process 创建窗口。这避免了 mainWindow renderer 未加载时的死锁问题。

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

1. **Sidecar 事件广播到主应用所有窗口** — 两个实例都收到 block.start/delta/stop，各自更新本地状态。`BrowserWindow.getAllWindows()` 只返回当前进程的窗口，不影响 Island 进程。
2. **发送消息**: popup 直接调用 sidecar（和 main 用同一个 backendSessionId），sidecar 事件广播回两边
3. **元数据同步**: popup 的 `onUpdate` 只同步元数据（title, status, backendSessionId）回主 renderer，**不同步 messages/blocks**。消息状态由 sidecar 事件各自维护，避免两条更新路径（sidecar event vs onUpdate）造成状态振荡。
4. **打开时**: popup 通过 `chatPopup.getSession()` 从主 renderer 获取最新 session 快照（含所有 blocks），使用 correlation ID 防止并发请求混淆，5秒超时兜底。
5. **序列化**: Session 对象通过 `JSON.parse(JSON.stringify(session))` 确保 IPC 传输安全（去除潜在的函数引用、循环引用等非序列化字段）。
6. **并发控制**: 不做特殊处理。两边同时发消息是用户操作问题，实际场景中 popup 打开时用户不会在 canvas 上操作同一个 session。

## 边界情况

- **Session 不存在**: `chatPopup.getSession()` 返回 null → popup 显示 "Session not found" 并提供关闭按钮
- **Sidecar 崩溃**: 崩溃事件广播到所有窗口（含 popup），SessionWindow 已有重连/重试机制
- **Island 断连**: 不影响 popup，popup 直连 sidecar 不依赖 Island WebSocket
- **主窗口关闭**: `mainWindow.on('closed')` 中销毁 chatPopupWindow，避免孤立窗口
- **Popup 隐藏后再次打开**: 复用已有 BrowserWindow，通过 `chat-popup:switch-session` IPC 切换 session

## 影响范围

- **Island NotchView 完全不受影响** — session cards、capsule、通知等功能不变
- **Island WebSocket 连接保留** — 仍用于 session sync、notifications
- **主应用 SessionWindow 改动最小** — 只增加 `variant='popup'` 和 drag region CSS
- **Island 聊天功能删除约 800 行代码** — ChatPanel 全家桶 + windowManager chat 部分 + preload chat 部分

## 验证计划

1. `npx tsc --noEmit` — 主应用类型检查
2. `cd dynamic-island && npx tsc --noEmit && npx electron-vite build` — Island 构建
3. `npx electron-vite build` — 主应用 Electron 构建（含新入口）
4. 完整重启 Electron
5. 从 Island 点击 session card → 弹窗打开，显示完整 block 渲染（tool_call, todolist, code 等）
6. 在弹窗中发送消息 → streaming 正常，所有 block 类型正确渲染
7. 弹窗中 close → 窗口隐藏
8. 再次点击同一 session → 窗口恢复，消息历史完整
9. 点击不同 session → 窗口切换到新 session
10. 主 canvas 中同一 session 的 SessionWindow 同步更新（标题、状态变更）
11. 从弹窗发消息后，Island NotchView 的 lastMessage 也更新
12. 关闭主窗口 → popup 也被销毁
