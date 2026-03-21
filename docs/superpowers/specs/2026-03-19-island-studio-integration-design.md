# Dynamic Island ↔ AI Studio 真实联动设计

## 概述

将 Dynamic Island 从 mock 数据驱动的独立 demo 升级为与 AI Studio 真实联动的卫星窗口。Island 实时接收主 app 的所有状态变更，用户可通过 Island 的 ChatPanel 发送消息（由主 app 代理 AI 调用），形成完整的双向交互闭环。

## 设计原则

- **单向数据流** — 所有 session/message 状态由 AI Studio 驱动，Island 是消费者
- **主 app 代理 AI 调用** — Island 不直接调用 AI backend，发消息通过 WS 传到主 app 处理
- **事件驱动推送** — 主 app 在关键操作点主动 emit IPC 事件，islandServer 即时广播
- **最小改动** — 复用现有 WebSocket 协议和 IPC 基础设施，不新增文件

## 架构

```
AI Studio (主 App)                          Dynamic Island
┌─────────────────────┐                    ┌──────────────────┐
│ SessionWindow.tsx    │                    │ useIslandStore   │
│   - AI 开始回复      │── IPC ──→ islandServer ── WS ──→│   - sessions     │
│   - streaming chunks │  island:message-stream            │   - messages     │
│   - 回复完成/出错    │  island:session-updated           │   - streamingText│
│                     │  island:notification               │                  │
│ App.tsx             │                    │ NotchView       │
│   - 创建 session    │── IPC ──→ islandServer ── WS ──→│   - 状态卡片      │
│   - 删除 session    │  island:sessions-response          │                  │
│                     │                    │ ChatPanel       │
│                     │←── IPC ←── islandServer ←── WS ←──│   - 发送消息      │
│                     │  island:send-message               │   - 显示 streaming│
└─────────────────────┘                    └──────────────────┘
```

## 详细设计

### 1. AI Studio 侧事件发射

在主 app 的关键操作点插入 IPC 调用，通过 `window.aiBackend.notifyIsland(event, data)` 发送。

#### 发射点

| 触发位置 | IPC 事件 | 数据 |
|---------|----------|------|
| `App.tsx` — 创建 session | `sessions-response` | 重发完整 session 列表（复用现有 `sendIslandSessionsResponse`） |
| `App.tsx` — 删除 session | `session-deleted` | `{sessionId}` |
| `SessionWindow.tsx` — AI 开始回复 | `session-updated` | `{sessionId, status:'inprocess'}` |
| `SessionWindow.tsx` — streaming 中 | `message-stream` | `{sessionId, messageId, chunk, done:false}` |
| `SessionWindow.tsx` — AI 回复完成 | `session-updated` + `message-stream(done:true)` | `{sessionId, status:'review', lastMessage: text.slice(0,50)}` |
| `SessionWindow.tsx` — AI 回复出错 | `notification` | `{sessionId, level:'error', text}` |

**streaming chunk 提取逻辑：** 在 `SessionWindow.tsx` 的 `handleBlockDelta` 中，当 block 类型为 `text` 时，提取 delta 文本内容调用 `emitMessageStream`。代码块（code blocks）和工具调用（tool_call）不发送到 Island，只传纯文本 delta。AI 回复完成时在 `handleMessageComplete` 中将所有 text blocks 拼接，取前 50 字符作为 `lastMessage` 一并通过 `session-updated` 发送。

**注意：** `notifyIsland(event, data)` 内部调用 `ipcRenderer.send('island:${event}', data)`，所以传入的 event 参数不带 `island:` 前缀（如 `session-updated` 而非 `island:session-updated`）。

#### preload.ts 新增方法

```typescript
emitSessionUpdate(data: { sessionId: string; status: string; title?: string; model?: string; lastMessage?: string }): void
emitMessageStream(data: { sessionId: string; messageId: string; chunk: string; done: boolean }): void
emitNotification(data: { sessionId: string; level: 'success' | 'error' | 'info'; text: string }): void
```

这些方法内部调用已有的 `notifyIsland(event, data)`，是便捷封装。

#### islandServer.ts

**需要新增一个 IPC 处理器：** `island:session-deleted`，将其广播为 `{ type: 'session:delete', sessionId }` WS 消息。其余已有的 IPC 监听 → WS 广播逻辑覆盖所有其他事件。

#### SessionWindow.tsx — 接收 Island 发送的消息

**现状缺口：** `App.tsx` 收到 `island:send-message` IPC 后 dispatch 了 `CustomEvent('island:send-message')`，但目前没有组件监听该事件。

**修复：** 在 `SessionWindow.tsx` 中添加 `useEffect` 监听 `island:send-message` CustomEvent。收到后：
1. 从 event.detail 中取出 `{ sessionId, content }`
2. 检查 sessionId 是否匹配当前 session
3. 如匹配，将用户消息注入 session.messages 并触发 AI 回复（复用现有的发送逻辑）

### 2. Island 侧数据处理

#### useIslandStore.ts 改动

**去掉 mock 数据：**
- 删除 `MOCK_SESSIONS` 硬编码数组
- 初始状态 `sessions: []`
- 连接后通过 `sessions:sync` 消息获取真实 session 列表

**新增 `session:delete` 处理：**
```typescript
case 'session:delete':
  // 从 sessions 中移除
  // 清理 messages[sessionId]、streamingText[sessionId]、taskSteps[sessionId]
```

**streaming 文本处理：**
- 主 app 在 `handleBlockDelta` 中提取 text block 的 delta 文本，emit `message:stream` chunk
- Island 保持现有的文本累积逻辑（`streamingText[sessionId] += chunk`）
- `done:true` 时用最终文本创建 Message 对象，移入 `messages[sessionId]`，清空 `streamingText[sessionId]`

**lastMessage 更新：**
- 由主 app 在 AI 回复完成时（`handleMessageComplete`）将拼接文本的前 50 字符通过 `session:update` 的 `lastMessage` 字段发送
- Island 收到 `session:update` 时如包含 `lastMessage`，更新对应 session

**`session:update` handler 修复：**
- 现有 handler 使用 `.map()` 无条件覆盖 `title`/`status`，当主 app 只发 status 变更（无 title）时会导致 title 变 undefined
- 修复为选择性合并：`title: data.title ?? ses.title`，`lastMessage: data.lastMessage ?? ses.lastMessage`
- 新 session 创建不走 `session:update`，走 `sessions:sync` 全量同步（见第 1 节）

**发消息乐观更新：**
- 用户在 ChatPanel 发消息后，立即在本地 messages 中添加用户消息
- 不等主 app 回传确认

### 3. ChatPanel 升级

**现状：** ChatPanel 已有 InputBar 组件和 `sendMessage` 功能（通过 `message:send` WS 消息发到主 app）。

**需要补全的：**
- 发送链路部分断裂 — `message:send` → WS → 主 app `App.tsx` dispatch `CustomEvent` → **但 SessionWindow 未监听该事件**。需在 SessionWindow 添加监听器接收并处理（见第 1 节）
- 回传链路需补全 — 主 app 在 AI 回复时 emit `message:stream` 和 `session:update` 回 Island
- ChatPanel 接收 streaming 实时显示打字效果

**关闭行为：**
- 点 ✕ → 隐藏 chat 窗口
- Island NotchView 保持 cards 展开状态，不回缩为 capsule

### 4. 通知与自动展开

**触发场景：**

| 场景 | level | 文本格式 |
|------|-------|---------|
| AI 回复完成 | `success` | "{title} — 回复完成" |
| AI 回复出错 | `error` | "{title} — 请求失败" |
| Session 状态变为 done | `info` | "{title} — 已标记完成" |

**行为：**
- 主 app emit `island:notification` → WS → Island
- Island 收到后自动从 capsule 展开为 cards（已有 `expandForNotification` 逻辑）
- 4 秒无交互自动回缩（已实现）
- 对应 TaskCard 短暂高亮闪烁

**不做：** 声音提示、系统通知、通知历史队列

### 5. 卡片状态实时同步

NotchView 的 TaskCard 通过 `session:update` 消息实时更新：
- `status` 字段映射到四种状态样式（inbox/inprocess/review/done）
- `lastMessage` 显示最新 AI 回复摘要（前 50 字符）
- inprocess 状态显示旋转加载图标（已实现）

## 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/components/SessionWindow.tsx` | 修改 | 在 AI 开始/streaming/完成/出错时 emit IPC 事件；添加 `island:send-message` 监听器 |
| `src/App.tsx` | 修改 | 创建/删除 session 时 emit IPC 事件 |
| `electron/preload.ts` | 修改 | 添加 `emitSessionUpdate`、`emitMessageStream`、`emitNotification` 便捷方法 |
| `src/types/electron.d.ts` | 修改 | 为新增的 preload 方法添加 TypeScript 类型声明 |
| `electron/islandServer.ts` | 修改 | 新增 `island:session-deleted` IPC 处理器 |
| `dynamic-island/src/hooks/useIslandStore.ts` | 修改 | 去掉 mock 数据；新增 session:delete 处理；发消息乐观更新 |
| `dynamic-island/src/components/ChatPanel/ChatPanel.tsx` | 修改 | 确保 streaming 实时显示和发送功能完整 |
| `dynamic-island/src/types.ts` | 修改 | 新增 `session:delete` 消息类型；`session:update` 中 `title` 改为可选，新增可选 `lastMessage` 字段 |

**总计 8 个文件修改，0 个新文件。**

## 不在范围内

- Island 创建新 session（只读）
- Island 拖拽卡片改变状态（只读）
- Island 直接调用 AI backend（由主 app 代理）
- 主 app 悬浮面板（用 Island ChatPanel 替代）
- 声音/系统通知
- 通知历史队列
