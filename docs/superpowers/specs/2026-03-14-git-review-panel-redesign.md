# Git Review Panel 重构设计

## 概述

重构现有的 Git 集成 UI（GitSidebar + DiffModal），参考 VSCode Source Control 方案，改为双面板并排推进式设计。点击 Review 按钮后侧滑出 Source Control 面板，点击具体文件后再从右侧滑出 Diff 面板，两个面板同时可见。

## 目标

- 用双面板并排布局替代当前的 sidebar + modal 模式
- Source Control 面板：commit 输入 + AI 生成 commit message + 文件列表（含类型标记和 ± 行数）
- Diff 面板：根据文件状态展示不同视图（Modified=side-by-side, Added=单栏新文件, Deleted=划线）
- 操作整体（commit/discard），不需要单文件操作
- 沿用现有 UI 风格

## 架构方案

**复合组件 + 内部状态管理**：新建 `GitReviewPanel` 复合组件，内部管理文件选择等交互状态。App.tsx 只控制顶层开关（`reviewSessionId`），内部细节由组件自管。

### 组件结构

```
GitReviewPanel (复合组件，管理内部状态)
├── SourceControlPanel (左侧面板 ~350px)
│   ├── Commit 区域（textarea + AI 生成按钮 + Commit/Discard 按钮）
│   └── 文件列表（点击触发内部 selectedFile 状态）
└── DiffPanel (右侧面板，占剩余宽度)
    ├── DiffSideBySide — Modified 文件
    ├── DiffNewFile — Added 文件
    └── DiffDeletedFile — Deleted 文件
```

### 状态分布

| 状态 | 位置 | 说明 |
|------|------|------|
| `reviewSessionId` | App.tsx | 控制整体开关，保持不变 |
| `commitMessage` | GitReviewPanel | commit 输入框内容 |
| `selectedFile` | GitReviewPanel | 当前选中的文件（null = Diff 面板关闭） |
| `isGeneratingCommit` | GitReviewPanel | AI 生成 commit message 的 loading 状态 |

### Props 接口

```typescript
interface GitReviewPanelProps {
  isOpen: boolean;
  session: Session | null;
  onClose: () => void;
  onCommit: (message: string) => void;
  onDiscard: () => void;
}
```

## 交互流程

1. AI 回复完成 → session.status 变为 'review'，生成 mock diff
2. SessionWindow 显示 Review 按钮（含 +/- 统计）
3. 用户点击 Review → App.tsx 设置 reviewSessionId → GitReviewPanel 打开
4. Source Control 面板从右侧滑入（~350px 固定宽度）
5. 用户点击文件 → Diff 面板从 Source Control 右侧继续滑入（占剩余宽度）
6. 用户可以：
   - 关闭 Diff Panel → 只关 Diff，Source Control 保持
   - 点击另一个文件 → Diff Panel 内容切换
   - 写 commit message → 点击 Commit → 清除 diff，关闭面板
   - 点击 AI 按钮 → 根据 diff 自动生成 commit message 填入输入框
   - 点击 Discard → 清除 diff，关闭面板
   - 关闭 Source Control → 两个面板同时滑出

## 三种 Diff 视图

### Modified (M) — Side-by-Side 对比

左右并排展示，左侧 "Original" 右侧 "Modified"。改动行分别用红色（删除）和绿色（新增）高亮。每行显示行号。未改动的行两侧对齐。

### Added (A) — 单栏新文件

单栏展示文件全部内容，每行绿色高亮背景，表示全部是新增内容。顶部标签显示 "New File"。

### Deleted (D) — 划线

单栏展示被删除文件的全部内容，每行红色高亮背景 + 文字划线效果。顶部标签显示 "Deleted File"。

## 数据模型

### 类型不变

`FileDiff` 保持不变，`patch` 字段（unified diff 格式）仍是数据源。

### 新增工具函数

```typescript
// utils/parsePatch.ts

interface DiffLine {
  lineNumber: number | null;  // null 表示该侧无对应行（用于对齐填充）
  content: string;
  type: 'normal' | 'add' | 'remove';
}

// 每个 row 代表 side-by-side 视图中的一行
// old 和 new 逐行对齐，某侧无对应行时为 null（空行填充）
interface DiffRow {
  old: DiffLine | null;
  new: DiffLine | null;
}

function parsePatchToSideBySide(patch: string): DiffRow[]
```

- `DiffSideBySide` 调用 `parsePatchToSideBySide(file.patch)` 得到逐行对齐的 `DiffRow[]`，直接 map 渲染
- `DiffNewFile` 从 patch 提取 `+` 行
- `DiffDeletedFile` 从 patch 提取 `-` 行

### Mock 增强

`mockGit.ts` 从 2 个文件扩展到 3 个：

- `src/App.tsx` — M（Modified）
- `src/utils/helpers.ts` — A（Added）
- `src/legacy/old-api.ts` — D（Deleted，新增）

### AI Commit Message（Mock 实现）

项目的 Git 集成是 mock 的，AI commit message 同样采用 mock 方式。在 `GitReviewPanel` 内部实现 `generateCommitMessage(diff: GitDiff): string` 函数：

- 根据文件名、状态（M/A/D）、行数变化生成模板化的 commit message
- 模板示例：`"refactor: update App.tsx (+30 -12), add utils/helpers.ts (+18), remove legacy/old-api.ts (-45)"`
- 点击 AI 按钮后添加 500ms 延迟模拟生成过程（`isGeneratingCommit` 状态控制 loading UI）
- 未来如需接入真实 API，替换此函数即可

## 状态转换

Commit 和 Discard 操作后的 session 状态转换：

- **Commit**：`session.status` 从 `'review'` → `'done'`，`session.diff` 设为 `null`
- **Discard**：`session.status` 从 `'review'` → `'inprocess'`，`session.diff` 设为 `null`

这确保 commit 后 session 进入 BoardView 的 done 列，discard 后回到 inprocess 列可继续工作。

## 关闭动画缓存策略

当用户点击 Commit/Discard/关闭时，App.tsx 同步清除 `reviewSessionId` 和 `diff`，但面板需要 300ms 滑出动画。为避免内容闪烁，`GitReviewPanel` 内部维护 `cachedSession` 状态（沿用现有 GitSidebar 的模式）：

- `isOpen` 为 true 且 `session.diff` 存在时，缓存 session
- 面板关闭时使用缓存的 session 渲染，保证滑出动画期间内容可见
- 动画使用 Tailwind CSS transitions（`transition-transform duration-300 ease-out`），与现有 GitSidebar 一致，不引入 motion 库

## 动画行为

- Source Control：从右侧滑入（translate-x-full → translate-x-0），300ms ease-out
- Diff Panel：从 Source Control 右边界继续滑入，Source Control 不动
- 关闭 Diff：只关 Diff Panel（滑出），Source Control 保持
- 关闭 Source Control：两个面板同时滑出
- 背景遮罩：半透明黑色 + backdrop-blur，点击关闭全部
- 键盘快捷键：commit 输入框支持 Cmd/Ctrl+Enter 提交

## 文件变更清单

### 删除

- `components/GitSidebar.tsx`
- `components/DiffModal.tsx`
- App.tsx 中的 `viewingFileDiff` 状态

### 新增

| 文件 | 职责 |
|------|------|
| `components/git/GitReviewPanel.tsx` | 复合组件，管理 selectedFile / commitMessage / isGeneratingCommit 状态 |
| `components/git/SourceControlPanel.tsx` | 左侧面板：commit 区 + 文件列表 |
| `components/git/DiffPanel.tsx` | 右侧面板：根据 file.status 分发到对应渲染器 |
| `components/git/DiffSideBySide.tsx` | Modified 文件的左右对比渲染 |
| `components/git/DiffNewFile.tsx` | Added 文件的单栏渲染 |
| `components/git/DiffDeletedFile.tsx` | Deleted 文件的划线渲染 |
| `utils/parsePatch.ts` | parsePatchToSideBySide() 工具函数 |

### 修改

| 文件 | 改动 |
|------|------|
| `App.tsx` | 删除 `viewingFileDiff` 状态及 `setViewingFileDiff`；删除 `DiffModal` 条件渲染块；替换 `GitSidebar` 为 `GitReviewPanel`（移除 `onViewFile` prop）；`handleCommit` 中增加 `status: 'done'` 转换；`handleDiscard` 中增加 `status: 'inprocess'` 转换 |
| `services/mockGit.ts` | 新增 Deleted 文件，3 个文件覆盖 M/A/D |

## 样式规范

沿用现有 UI 设计风格：
- 背景色：`bg-[#2B2D3A]/95` + `backdrop-blur-2xl`
- 边框：`border-white/10`
- 圆角：`rounded-xl`（按钮/输入框）
- 文件状态色：M=yellow-500, A=green-500, D=red-500
- 字体：代码用 monospace，UI 用系统字体
- 图标：lucide-react
