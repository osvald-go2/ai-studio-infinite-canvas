# macOS Dynamic Island — 设计规格

## 概述

为 AI Studio 构建一个独立的 macOS Dynamic Island（刘海）Electron 应用。该应用在屏幕顶部与 MacBook 硬件刘海融合，提供 AI 会话的通知中心和快捷聊天入口。通过 WebSocket 与 AI Studio 主应用通信。

## 核心需求

- 独立 Electron 应用，与 AI Studio 分离运行
- 仅支持有硬件刘海的 MacBook（M1 Pro/Max 及之后机型）
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

## 三层状态与交互流程

```
                        鼠标 hover 刘海区域
    ┌──────────┐       ─────────────────►      ┌──────────────────┐
    │  胶囊态   │                               │   通知卡片态      │
    │ 160x30px │       ◄─────────────────       │   600x120px      │
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

- 胶囊态：`setIgnoreMouseEvents(true, { forward: true })`，通过透明 hover 触发区域监听 `mouse-enter`
- 通知卡片态：取消 `ignoreMouseEvents`，允许点击卡片按钮
- 聊天面板打开时：通知卡片态不因鼠标离开而收起

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

任务超过 3 个时，卡片区域横向滚动或显示 "+N more" 折叠指示器。

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

1. **标题栏**：收起按钮（左）+ 会话标题（中）+ 工具按钮（右：表情、设置、模型选择、新建）
2. **消息区**：完整对话历史，用户消息靠右蓝紫色气泡，AI 回复靠左，支持滚动
3. **任务进度面板**：可折叠步骤列表，实时更新当前执行进度
4. **输入栏**：文本输入 + 模型切换标签 + 发送/停止按钮

## WebSocket 通信协议

端口：`ws://localhost:9720`

### AI Studio → Island（推送）

```typescript
// 会话列表同步（连接时 + 变化时）
{ type: "sessions:sync", sessions: Session[] }

// 单个会话状态更新
{ type: "session:update", sessionId: string, status: SessionStatus, title: string }

// 新消息推送
{ type: "message:new", sessionId: string, message: Message }

// 任务进度更新
{ type: "task:progress", sessionId: string, steps: TaskStep[] }

// 通知事件
{ type: "notification", sessionId: string, level: "success"|"error"|"info", text: string }
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

// 响应
{ type: "messages:history", sessionId: string, messages: Message[] }
```

### 连接管理

- Island 启动时连接 `ws://localhost:9720`
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
│   ├── notchDetector.ts           # 硬件刘海检测
│   ├── windowManager.ts           # 双窗口管理、定位、状态切换
│   └── wsClient.ts                # WebSocket 客户端
│
├── src/
│   ├── main.tsx                   # Renderer 入口
│   ├── App.tsx                    # 根组件
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
    └── notch.html                 # Notch Window HTML 入口
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

- Notch Window 固定为通知卡片态最大尺寸（600x120），胶囊态通过 CSS 隐藏内容 + 只显示中央黑条，避免频繁调用 `setBounds`
- Chat Window 动画用 framer-motion 的 `AnimatePresence` 处理出入场

## AI Studio 端改动

在 AI Studio 的 `electron/main.ts` 中新增 WebSocket Server：

1. 启动时创建 `ws.Server` 监听 9720 端口
2. 客户端连接时推送当前所有会话状态
3. 会话状态变化、新消息、任务进度更新时主动推送
4. 接收 Island 发来的消息转发请求，调用现有消息处理逻辑
