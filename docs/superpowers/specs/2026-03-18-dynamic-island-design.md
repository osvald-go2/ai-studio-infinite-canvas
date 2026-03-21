# macOS Dynamic Island — 设计规格

## 概述

为 AI Studio 构建一个独立的 macOS Dynamic Island（刘海）Electron 应用。该应用在屏幕顶部与 MacBook 硬件刘海融合，提供 AI 会话的通知中心和快捷聊天入口。通过 WebSocket 与 AI Studio 主应用通信。

## 核心需求

- 独立 Electron 应用，与 AI Studio 分离运行
- 仅支持有硬件刘海的 MacBook（M1 Pro/Max 及之后机型）。不支持的机型（无刘海 Mac 或外接显示器）启动时提示不兼容并退出
- 三层交互状态：胶囊态 → 通知卡片态 → 液态玻璃聊天面板
- WebSocket 长连接与 AI Studio 实时同步会话数据

## 架构

```
┌─────────────────────────────────────────────┐
│           Dynamic Island App                │
│            (独立 Electron 应用)              │
│                                             │
│  ┌─────────┐   IPC    ┌──────────────────┐  │
│  │  Main   │◄────────►│  Notch Window    │  │
│  │ Process │          │  (胶囊+通知卡片)   │  │
│  │         │          └──────────────────┘  │
│  │         │   IPC    ┌──────────────────┐  │
│  │         │◄────────►│  Chat Window     │  │
│  │         │          │  (液态玻璃面板)    │  │
│  └────┬────┘          └──────────────────┘  │
│       │                                     │
│       │ WebSocket Client                    │
└───────┼─────────────────────────────────────┘
        │
        │ ws://localhost:9720
        ▼
┌─────────────────────────────────────────────┐
│           AI Studio (现有应用)               │
│  Main Process ← 新增 WebSocket Server       │
└─────────────────────────────────────────────┘
```

### 双窗口设计

采用双窗口协同方案：

- **Notch Window**：固定在屏幕顶部，负责胶囊态和通知卡片态。`alwaysOnTop: true`、`transparent: true`、`frame: false`、`focusable: false`、`type: 'panel'`。
- **Chat Window**：屏幕中央弹出，负责液态玻璃聊天面板。`alwaysOnTop: false`、`transparent: true`、`frame: false`。可被其他窗口覆盖，用户可自然切换应用。

两窗口通过 Main Process 中转通信（Renderer → ipcMain → Renderer）。

**双窗口入口点**：electron-vite 配置两个 renderer 入口，各有独立的 HTML 和 TSX 入口文件：
- Notch Window：`resources/notch.html` → `src/notch-main.tsx`（挂载 NotchView 组件）
- Chat Window：`resources/chat.html` → `src/chat-main.tsx`（挂载 ChatPanel 组件）
- 两个入口共享 `src/components/`、`src/hooks/`、`src/types.ts` 等模块

**Chat Window 焦点丢失处理**：Chat Window 设置 `alwaysOnTop: false`，用户切换到其他应用时它会被覆盖。此时通知卡片（Notch Window）仍然可见，用户可以点击对应卡片的 "Open in chat" 按钮重新将 Chat Window 置前（调用 `chatWindow.show()` + `chatWindow.focus()`）。

## 三层状态与交互流程

```
                        鼠标 hover 刘海区域
    ┌──────────┐       ─────────────────►      ┌──────────────────┐
    │  胶囊态   │                               │   通知卡片态      │
    │ 160x30px │       ◄─────────────────       │   600x140px      │
    │ 黑色融合  │        鼠标离开 1.5s 后         │   横向卡片列表    │
    └──────────┘                               └────────┬─────────┘
                                                        │
                                               点击 "Open in chat"
                                                        │
                                                        ▼
                                               ┌──────────────────┐
                                               │   聊天面板态      │
                                               │   420x600px      │
                                               │   屏幕中央弹出    │
                                               │   液态玻璃风格    │
                                               └────────┬─────────┘
                                                        │
                                               点击收起 icon
                                                        │
                                                        ▼
                                               返回通知卡片态
```

### 状态转换规则

| 触发 | 从 | 到 | 动画 |
|------|------|------|------|
| 鼠标进入顶部区域 | 胶囊态 | 通知卡片态 | Notch Window 向下扩展，卡片淡入 |
| 鼠标离开 1.5s | 通知卡片态 | 胶囊态 | 卡片淡出，窗口收缩 |
| 点击 "Open in chat" | 通知卡片态 | 聊天面板态 | Chat Window 从中央缩放弹出，通知卡片保持 |
| 点击收起 icon | 聊天面板态 | 通知卡片态 | Chat Window 缩放收起并隐藏 |
| 鼠标离开通知卡片 1.5s（且无聊天面板打开） | 通知卡片态 | 胶囊态 | 收缩 |
| 新通知到达 | 胶囊态 | 通知卡片态 | 自动展开，显示新通知，4s 后收回 |

### Hover 检测

**注意**：Electron 的 `setIgnoreMouseEvents(true, { forward: true })` 在 OS 窗口层面使整个窗口穿透，CSS `pointer-events` 无法在穿透窗口中选择性捕获事件。因此采用 **Main Process 鼠标位置轮询** 方案：

- **胶囊态检测**：Main Process 使用 `setInterval` 每 100ms 调用 `screen.getCursorScreenPoint()` 获取鼠标屏幕坐标。触发区域基于屏幕坐标计算：取内置显示器顶部中心点，向左右各扩展 100px、向下扩展 40px（即屏幕坐标系中的 200x40px 区域，与 Notch Window 的窗口坐标无关）。这个区域大致覆盖硬件刘海及其下方。当鼠标进入该区域时，切换到通知卡片态。胶囊态时 Notch Window 设置 `setIgnoreMouseEvents(true)`，对用户完全透明。
- **切换到通知卡片态**：Main Process 调用 `notchWindow.setIgnoreMouseEvents(false)` 使窗口可交互，然后通过 IPC 通知 Renderer 开始展开动画。停止鼠标轮询（由窗口自身的鼠标事件接管）。
- **通知卡片态**：窗口可交互，用户可点击卡片按钮。
- **聊天面板打开时**：通知卡片态不因鼠标离开而收起。
- **鼠标离开判定**：监听 Notch Window 的 `mouseleave` 事件，启动 1.5s 定时器。到期后收回胶囊态，重新启动鼠标轮询。若鼠标在定时器到期前重新进入窗口，取消定时器。
- **性能**：100ms 轮询 `screen.getCursorScreenPoint()` 是轻量原生调用，CPU 开销可忽略。

## Notch Window — 通知卡片设计

### 卡片内容

每个通知卡片包含：
- 状态图标（对勾/齿轮/圆点）
- 任务标题
- 状态描述文字
- 操作按钮：Open in chat / Cancel
- 关闭按钮（×，右上角）

### 颜色编码

| 状态 | 颜色 | 背景 |
|------|------|------|
| 已完成 | `#4ade80` 绿色 | `linear-gradient(135deg, #1a3a1a, #0d2a0d)` |
| 进行中 | `#60a5fa` 蓝色 | `linear-gradient(135deg, #1a1a2a, #0d0d1a)` |
| 等待中 | `#fbbf24` 黄色 | `linear-gradient(135deg, #2a2015, #1a150d)` |
| 失败 | `#f87171` 红色 | `linear-gradient(135deg, #2a1a1a, #1a0d0d)` |

### 溢出处理

任务超过 3 个时，显示前 3 个卡片 + 右侧 "+N more" 折叠指示器。点击指示器展开为横向滚动模式显示所有卡片。

## Chat Window — 液态玻璃聊天面板

### 窗口属性

- 尺寸：420 x 600px
- 位置：屏幕中央
- 同一时间只能打开一个
- `transparent: true`、`frame: false`、`alwaysOnTop: false`

### 液态玻璃效果

- `backdrop-filter: blur(40px) saturate(180%)`
- 半透明背景：`rgba(30, 40, 55, 0.75)`
- 微光边框：`border: 1px solid rgba(255,255,255,0.15)`
- 多层渐变：顶部高光 + 底部暗角
- 可选 Electron 原生 `vibrancy: 'under-window'`

### 面板结构

1. **标题栏**：收起按钮（左）+ 会话标题（中）+ 停止按钮（右）。模型切换和新建会话不在 Island 中操作，这些功能属于 AI Studio 主应用
2. **消息区**：完整对话历史，用户消息靠右蓝紫色气泡，AI 回复靠左，支持滚动
3. **任务进度面板**：可折叠步骤列表，实时更新当前执行进度
4. **输入栏**：文本输入 + 发送/停止按钮。显示当前会话使用的模型名称（只读标签，不可切换）

## WebSocket 通信协议

端口：`ws://localhost:9720`

### AI Studio → Island（推送）

```typescript
// 会话列表同步（连接时 + 变化时）
// 使用 IslandSession 精简类型，不包含 position/height 等 UI 字段和完整 messages 数组
{ type: "sessions:sync", sessions: IslandSession[] }

// 单个会话状态更新
{ type: "session:update", sessionId: string, status: SessionStatus, title: string }

// 新消息推送（完整消息，非流式场景如用户消息）
{ type: "message:new", sessionId: string, message: Message }

// 流式消息增量更新（AI 生成中，每收到一个 chunk 推送一次）
// 采用扁平文本模型：AI Studio 将结构化的 block streaming（blockStart/blockDelta/blockStop）
// 扁平化为纯文本 chunk 推送给 Island。Island 聊天面板只做纯文本/markdown 渲染，
// 不需要区分 code block、tool_call 等结构。这是有意的简化——Island 是轻量预览，
// 复杂的结构化渲染留给 AI Studio 主窗口。
{ type: "message:stream", sessionId: string, messageId: string, chunk: string, done: boolean }

// 任务进度更新
{ type: "task:progress", sessionId: string, steps: TaskStep[] }

// 通知事件
{ type: "notification", sessionId: string, level: "success"|"error"|"info", text: string }

// 消息历史响应（响应 Island 的 messages:fetch 请求）
{ type: "messages:history", sessionId: string, messages: Message[] }
```

### Island → AI Studio（请求）

```typescript
// 发送消息
{ type: "message:send", sessionId: string, content: string }

// 取消任务
{ type: "session:cancel", sessionId: string }

// 关闭通知
{ type: "notification:dismiss", sessionId: string }

// 请求完整消息历史
{ type: "messages:fetch", sessionId: string }
```

### 错误处理

所有涉及 `sessionId` 的消息，若 ID 无效或会话不存在，Server 返回：

```typescript
{ type: "error", requestType: string, sessionId: string, message: "Session not found" }
```

Island 收到 error 后，从本地状态中移除对应会话的卡片。

### 共享类型定义

```typescript
// 精简的会话信息，用于 Island 通知卡片展示
// 从 AI Studio 的 Session 类型中提取，排除 position/height/messages 等 UI 和大体量字段
interface IslandSession {
  id: string;
  title: string;
  model: string;
  status: SessionStatus;                      // "inbox" | "inprocess" | "review" | "done"
  lastMessage?: string;                       // 最新一条消息的摘要文本
  messageCount: number;
}

// 任务步骤，由 AI Studio 从 AI 响应中的 tool_call ContentBlock 合成
// 当 AI 执行多步任务时（如"定位链接 → 下载文件 → 发送文件"），
// AI Studio 解析 streaming 响应中的 tool_call blocks，
// 将每个 tool_call 映射为一个 TaskStep
// status 映射：tool_call "running" → "running", "done" → "completed", "error" → "failed"
// "pending" 状态：当 AI 响应中描述了后续步骤（如"接下来我会下载文件"）但对应的
// tool_call 尚未开始时，AI Studio 预创建 status="pending" 的 TaskStep
interface TaskStep {
  id: string;
  label: string;                              // 步骤描述，如 "定位原始研报链接"
  status: "pending" | "running" | "completed" | "failed";
  detail?: string;                            // 可选详情，如错误信息
}
```

### 连接管理

- Island 启动时连接 `ws://localhost:${ISLAND_WS_PORT || 9720}`
- 连接失败 → 3 秒后重试，无限重试
- 连接成功 → Server 推送 `sessions:sync`
- 断线 → 自动重连，重连后重新同步
- AI Studio 未启动时 → 胶囊态显示灰色/暗淡（离线状态）

## 项目结构

```
dynamic-island/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
│
├── electron/
│   ├── main.ts                    # 主进程入口
│   ├── preload.ts                 # IPC bridge
│   ├── notchDetector.ts           # 硬件刘海检测（execSync('sysctl -n hw.model') 匹配 MacBookPro18+/MacBookAir11+）
│   ├── windowManager.ts           # 双窗口管理、定位、状态切换
│   └── wsClient.ts                # WebSocket 客户端
│
├── src/
│   ├── notch-main.tsx             # Notch Window renderer 入口
│   ├── chat-main.tsx              # Chat Window renderer 入口
│   │
│   ├── components/
│   │   ├── NotchView/
│   │   │   ├── NotchView.tsx      # 胶囊态 + 通知卡片态容器
│   │   │   ├── Capsule.tsx        # 胶囊组件
│   │   │   └── TaskCard.tsx       # 通知卡片
│   │   │
│   │   └── ChatPanel/
│   │       ├── ChatPanel.tsx      # 液态玻璃面板容器
│   │       ├── TitleBar.tsx       # 标题栏
│   │       ├── MessageList.tsx    # 消息列表
│   │       ├── TaskProgress.tsx   # 任务进度
│   │       └── InputBar.tsx       # 输入框
│   │
│   ├── hooks/
│   │   ├── useWebSocket.ts        # WebSocket 状态管理
│   │   └── useNotchState.ts       # 三层状态机
│   │
│   ├── types.ts                   # 类型定义
│   └── styles/
│       └── liquid-glass.css       # 液态玻璃样式
│
└── resources/
    ├── notch.html                 # Notch Window HTML 入口（加载 NotchView）
    └── chat.html                  # Chat Window HTML 入口（加载 ChatPanel）
```

## 技术选型

| 技术 | 选择 | 理由 |
|------|------|------|
| 框架 | Electron + React | 与 AI Studio 技术栈一致 |
| 构建 | electron-vite | 与 AI Studio 一致，HMR 开发体验好 |
| 样式 | Tailwind CSS 4 | 与 AI Studio 一致 |
| 动画 | motion (framer-motion) | 与 AI Studio 一致，适合状态切换动画 |
| WebSocket | ws (Node.js) | 轻量，Main Process 中运行 |
| 状态管理 | React hooks | 应用体量小，不需要 Redux |

## 动画规格

| 过渡 | 动画 | 时长 | 曲线 |
|------|------|------|------|
| 胶囊 → 通知卡片 | 窗口扩展 + 卡片 fadeIn + slideDown | 400ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| 通知卡片 → 胶囊 | 卡片 fadeOut + 窗口收缩 | 350ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| 打开聊天面板 | `scale(0.92→1)` + `opacity 0→1` | 300ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| 收起聊天面板 | `scale(1→0.95)` + `opacity 1→0` | 250ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| 新通知滑入 | 卡片从右侧 slideIn | 400ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| 关闭卡片 | `scaleX(1→0)` + 其他卡片位移填充 | 300ms | `cubic-bezier(0.4, 0, 0.2, 1)` |

### 实现注意事项

- Notch Window 固定为通知卡片态最大尺寸（600x140），胶囊态通过 CSS 隐藏内容 + 只显示中央黑条，避免频繁调用 `setBounds`
- Chat Window 动画用 framer-motion 的 `AnimatePresence` 处理出入场

## AI Studio 端改动

在 AI Studio 中新增 `electron/islandServer.ts` 模块，由 `electron/main.ts` 在应用启动时调用。

### 前提条件

WebSocket Server 运行在 AI Studio 的 Electron Main Process 中，因此 **仅在 Electron 模式下可用**（`npm run dev:electron` 或打包后的应用）。纯 Web 模式（`npm run dev`）不启动 WebSocket Server，Island 应用将处于离线状态。

### islandServer.ts 职责

1. **启动 WebSocket Server**：创建 `ws.Server` 监听 `ws://localhost:9720`（端口可通过环境变量 `ISLAND_WS_PORT` 覆盖）。Island 客户端通过相同的环境变量或默认端口连接。
2. **会话状态同步**：客户端连接时，Main Process 通过 `mainWindow.webContents.send('island:request-sessions')` 向 Renderer 请求当前会话列表。Renderer 通过 `ipcRenderer.send('island:sessions-response', sessions)` 回传数据（注意：这是 Main→Renderer→Main 的异步通信，因为 session 状态存在于 React state 中）。Main Process 将 Session 转换为 `IslandSession[]` 后推送 `sessions:sync`
3. **事件监听与转发**：
   - 监听 Renderer 进程通过 IPC 发来的会话状态变化事件（`island:session-updated`、`island:message-added`、`island:task-progressed`），转发给已连接的 Island 客户端
   - AI Studio 的 SessionWindow 组件在调用 Gemini/Claude API 获得响应、状态变更时，需新增 IPC 事件发送到 Main Process
4. **消息路由**：接收 Island 的 `message:send` 请求，通过 IPC send (`island:send-message`, { sessionId, content }) 发送到 Renderer 进程。Renderer 端在 App.tsx 中通过 `window.aiBackend.onIslandMessage()` 监听，找到对应的 session 并调用现有的消息发送逻辑（与用户在 SessionWindow 中输入消息相同的代码路径）。
5. **取消任务**：接收 `session:cancel`，通过 IPC 通知 Renderer 进程中断对应 session 的当前请求

### AI Studio Renderer 端配合改动

- `SessionWindow.tsx`：在 AI 响应到达、状态变更时，调用 `window.aiBackend.notifyIsland('session-updated', data)` 发送事件到 Main Process
- `App.tsx`：在会话创建、删除、状态变更时调用 `window.aiBackend.notifyIsland()`；监听 `window.aiBackend.onIslandMessage()` 处理 Island 发来的消息请求
- `preload.ts`：在现有 `aiBackend` 对象上新增以下方法：
  - `notifyIsland(event: string, data: any)` — 发送事件到 Main Process 的 islandServer
  - `onIslandMessage(callback)` — 注册 Island 消息到达的回调
  - 监听 `island:request-sessions` channel，收到请求后从 React state 收集 sessions 并通过 `ipcRenderer.send('island:sessions-response', ...)` 回传
- `electron.d.ts`：同步更新 `AiBackend` 接口定义，添加上述新方法的类型声明
