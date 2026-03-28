# Session Files Summary — 对话文件变更汇总

## 概述

在 SessionWindow 对话框底部添加可折叠的文件变更汇总面板，展示本次会话中所有被修改的文件及其 +/- diff 行数。点击文件名可跳转到右侧 GitPanel 的 Files tab 查看文件内容，点击 diff 数字可跳转到 Changes tab 查看 diff。

## 需求

1. **可折叠面板**：位于消息列表底部、输入框上方（滚动区域内）
2. **收起态**：文件图标 + "N 个文件已修改" + 展开箭头
3. **展开态**：文件列表，每行显示状态色点、文件路径（可点击）、`+N -N` 行数（可点击）
4. **数据来源**：汇总当前会话所有 assistant 消息中的 `file_changes` block
5. **去重逻辑**：同一文件多次出现时取最后一次的状态和行数
6. **无变更时不显示**
7. **点击交互**：
   - 点击文件名 → 打开 GitPanel → Files tab → 选中该文件
   - 点击 +/- 数字 → 打开 GitPanel → Changes tab → 展示该文件 diff

## 类型变更

### `src/types.ts` — FileChangeItem 扩展

```typescript
interface FileChangeItem {
  path: string;
  status: 'new' | 'modified' | 'deleted' | 'renamed';
  additions?: number;   // 新增行数
  deletions?: number;   // 删除行数
}
```

新增 `additions` 和 `deletions` 可选字段，向后兼容。

## 新组件

### `src/components/message/SessionFilesSummary.tsx`

**Props：**

```typescript
interface SessionFilesSummaryProps {
  messages: Message[];
  onNavigateToFile: (path: string) => void;
  onNavigateToDiff: (path: string) => void;
}
```

**行为：**

- 遍历 `messages`，提取所有 `file_changes` block 中的文件
- 同路径文件去重，保留最后出现的记录
- 无文件时返回 `null`
- 收起/展开切换使用 `motion` 库动画
- 状态色点：绿=new、黄=modified、红=deleted、蓝=renamed
- `+N` 绿色、`-N` 红色

## 集成变更

### `src/components/SessionWindow.tsx`

- 在消息列表底部、输入框上方插入 `<SessionFilesSummary>`
- 新增 props：`onOpenFileInPanel(path: string)` 和 `onOpenDiffInPanel(path: string)`
- 透传给 SessionFilesSummary 的 `onNavigateToFile` 和 `onNavigateToDiff`
- 约 +10 行变更

### `src/App.tsx`

- 新增状态：`gitPanelActiveTab`、`gitPanelSelectedFile`
- 新增两个处理函数：
  - `handleOpenFileInPanel(path)` — 设置 `gitPanelOpen=true, activeTab='files', selectedFile=path`
  - `handleOpenDiffInPanel(path)` — 设置 `gitPanelOpen=true, activeTab='changes', selectedFile=path`
- 将这两个函数通过 props 传递给 SessionWindow
- 约 +15 行变更

### `src/components/git/GitPanel.tsx`

- 新增 props：`activeTab?: 'changes' | 'git' | 'files'`、`selectedFile?: string`
- useEffect 响应外部 prop 变化，切换 tab 并传递 selectedFile 给子组件
- 约 +15 行变更

### `src/components/git/FilesTab.tsx`

- 新增 prop：`selectedFile?: string`
- 当 selectedFile 变化时，自动展开目录树并选中对应文件，显示文件内容
- 约 +10 行变更

### `src/components/git/ChangesTab.tsx`

- 新增 prop：`selectedFile?: string`
- 当 selectedFile 变化时，自动打开对应文件的 diff 视图
- 约 +10 行变更

## 模拟数据

现有生成 `file_changes` block 的地方需要补充 `additions` 和 `deletions` 字段，使用合理的随机值（如 additions: 1-50, deletions: 0-20）。

## UI 布局示意

```
┌─────────────────────────────┐
│  消息列表（可滚动）           │
│  ...                         │
│  ┌─────────────────────────┐ │
│  │ 📄 3 个文件已修改     ▼  │ │  ← 收起态
│  └─────────────────────────┘ │
│                               │
│  ┌─────────────────────────┐ │
│  │ 📄 3 个文件已修改     ▲  │ │  ← 展开态
│  │ ● src/types.ts     +2 -0 │ │
│  │ ● src/App.tsx      +5 -1 │ │
│  │ ● src/new.tsx      +30   │ │
│  └─────────────────────────┘ │
├─────────────────────────────┤
│  输入框                       │
└─────────────────────────────┘
```

## 变更文件清单

| 文件 | 操作 |
|------|------|
| `src/types.ts` | 修改 — FileChangeItem 增加字段 |
| `src/components/message/SessionFilesSummary.tsx` | 新增 |
| `src/components/SessionWindow.tsx` | 修改 — 引入组件 + 新 props |
| `src/App.tsx` | 修改 — 新增状态和处理函数 |
| `src/components/git/GitPanel.tsx` | 修改 — 新增外部控制 props |
| `src/components/git/FilesTab.tsx` | 修改 — 支持外部选中 |
| `src/components/git/ChangesTab.tsx` | 修改 — 支持外部选中 |
