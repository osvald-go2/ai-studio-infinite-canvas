# Git 分支管理功能设计

## 概述

为 AI Studio Infinite Canvas 实现项目级别的 Git 分支管理功能，参考 MuMu 的后端实现模式。在现有 Electron + Rust sidecar (`ai-backend/`) 架构上新增 git 模块，前端新增 GitPanel 侧边栏（三 Tab：Files/Git/Changes），支持 worktree 创建、真实 diff 查看、commit、AI commit message 生成。

## 架构决策

- **后端**：在现有 `ai-backend/` Rust sidecar 中新增 `git/` 模块，通过 JSON stdin/stdout IPC 协议暴露 `git.*` 系列方法
- **AI commit**：通过 SessionManager 创建临时（ephemeral）会话，流式返回 commit message，完成后立即 kill
- **前端**：项目级别 git 管理，点击 session 切换工作目录上下文；新建 session 支持 worktree

---

## 第一部分：后端 — Rust Sidecar Git 模块

### 1.1 模块结构

```
ai-backend/src/
├── git/
│   ├── mod.rs          # 模块入口，导出所有 git 命令函数
│   ├── commands.rs     # git shell 命令执行与输出解析
│   ├── types.rs        # GitInfo, FileChange, DiffOutput 等类型定义
│   └── worktree.rs     # worktree 创建/合并/删除逻辑
├── router.rs           # 新增 git.* 方法路由
└── ...
```

### 1.2 IPC 方法清单

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `git.check_repo` | `{dir}` | `{is_repo: bool}` | 检查是否 git 仓库 |
| `git.init` | `{dir}` | `{}` | 初始化 git 仓库 |
| `git.info` | `{dir}` | `GitInfo` | 当前分支、commit hash、ahead/behind |
| `git.changes` | `{dir}` | `FileChange[]` | `git status --porcelain` + 增删行数 |
| `git.diff` | `{dir, file}` | `DiffOutput` | 单文件 diff hunks |
| `git.stage_file` | `{dir, file}` | `{}` | `git add <file>` |
| `git.unstage_file` | `{dir, file}` | `{}` | `git reset HEAD -- <file>` |
| `git.discard_file` | `{dir, file}` | `{}` | `git checkout -- <file>` (tracked) 或 `rm` (untracked) |
| `git.commit` | `{dir, message}` | `{hash}` | `git add -A && git commit`（和 MuMu 一致，stage all） |
| `git.branches` | `{dir}` | `BranchInfo[]` | 所有分支列表 |
| `git.log` | `{dir, count}` | `CommitInfo[]` | commit 历史 |
| `git.worktrees` | `{dir}` | `WorktreeInfo[]` | worktree 列表 |
| `git.create_worktree` | `{dir, branch, base}` | `{path}` | 创建 worktree |
| `git.merge_worktree` | `{dir, wt_path, target}` | `{message}` | 合并 worktree |
| `git.remove_worktree` | `{dir, wt_path, branch}` | `{}` | 删除 worktree |
| `git.branch_diff_stats` | `{dir, base_branch}` | `BranchDiffStats` | 分支间增删统计 |
| `git.generate_commit_msg` | `{dir, diff_text}` | 流式事件 | AI 生成 commit message |

### 1.3 类型定义

```rust
struct GitInfo {
    branch: String,
    commit_hash: String,
    commit_message: String,
    ahead: u32,
    behind: u32,
    has_upstream: bool,
}

struct FileChange {
    path: String,
    status: String,        // M/A/D/R/U/?
    additions: u32,
    deletions: u32,
}

struct DiffOutput {
    file_path: String,
    hunks: Vec<DiffHunk>,
}

struct DiffHunk {
    header: String,
    lines: Vec<DiffLine>,
}

struct DiffLine {
    line_type: String,     // "+", "-", " "
    old_lineno: Option<u32>,
    new_lineno: Option<u32>,
    content: String,
}

struct BranchInfo {
    name: String,
    is_current: bool,
    is_remote: bool,
    last_commit_time: String,
    ahead: Option<i32>,
    behind: Option<i32>,
}

struct WorktreeInfo {
    branch: String,
    path: String,
    commit_hash: String,
    commit_message: String,
    is_main: bool,
    is_current: bool,
}

struct CommitInfo {
    hash: String,
    message: String,
    author: String,
    date: String,
    branches: Vec<String>,
    files: Vec<CommitFile>,
}

struct CommitFile {
    path: String,
    status: String,
}

struct BranchDiffStats {
    additions: u64,
    deletions: u64,
    base_branch: String,
}
```

### 1.4 Git 命令实现

所有 git 操作通过 `std::process::Command` 执行 shell 命令，解析输出。主要命令：

- `git.info` → `git rev-parse --abbrev-ref HEAD` + `git log -1 --format=%H%n%s` + `git rev-list --left-right --count HEAD...@{upstream}`
- `git.changes` → `git status --porcelain` + 逐文件 `git diff --numstat`
- `git.diff` → `git diff <file>`，解析为结构化 DiffHunk/DiffLine
- `git.unstage_file` → `git reset HEAD -- <file>`
- `git.discard_file` → tracked: `git checkout -- <file>`，untracked: `std::fs::remove_file`
- `git.commit` → `git add -A && git commit -m "<message>"`（和 MuMu 一致，总是 stage all）
- `git.branches` → `git branch -a --format='%(refname:short)|%(HEAD)|%(upstream:short)|%(committerdate:relative)'`
- `git.log` → `git log --oneline -<count> --format=%H|%s|%an|%aI --name-status`
- `git.worktrees` → `git worktree list --porcelain`
- `git.create_worktree` → `git worktree add .ai-studio/worktrees/<branch> -b <branch> <base>`（处理三种情况：分支已有 worktree 返回现有路径、分支存在但无 worktree 则 attach、新分支则 -b 创建）
- `git.merge_worktree` → `cd <wt_path> && git checkout <target> && git merge <branch>`（冲突时自动 `git merge --abort` 并返回错误）
- `git.remove_worktree` → `git worktree remove <wt_path> && git branch -D <branch>`
- `git.branch_diff_stats` → `git diff --stat <base_branch>...HEAD` + 统计 untracked 文件

### 1.5 AI Commit Message 实现

`git.generate_commit_msg` 处理流程（参考 MuMu 的 `create_ephemeral_session` 模式）：

1. Router 收到请求 → 通过 `SessionManager::create_ephemeral_session()` 创建临时会话
   - Session ID 前缀 `"ephemeral-"` 标记为临时
   - 不持久化到数据库，不记录消息历史
   - 复用现有的 ClaudeProcess spawn、normalizer、event pipeline
2. 构造 prompt：
   ```
   你是一个中文母语者。根据以下代码变更，生成一行简洁的 git commit message。
   格式要求：前缀 + 中文描述，不要加引号。
   前缀必须是以下之一：modify: / fix: / feature: / delete: / refactor: / docs:
   示例：
   - modify: 修改登录页面的表单验证逻辑
   - fix: 修复首页崩溃问题
   - feature: 新增搜索功能
   - delete: 删除废弃的工具函数

   代码变更：

   {diff_text}
   ```
3. 通过 `manager.send_message(&session_id, prompt)` 发送
4. 监听 normalizer 输出，提取 assistant message 文本
5. 通过 event channel 发送 `commit_msg_stream` 事件（`{text, done}`）
6. 完成或超时(60s) → `manager.kill_session(&session_id)` → 清理资源

**SessionManager 新增方法**：
```rust
impl SessionManager {
    /// 创建不持久化的临时会话，用于 AI commit 等一次性任务
    pub async fn create_ephemeral_session(&self, agent: String, working_dir: String) -> Result<String>;
}
```

---

## 第二部分：前端 — 项目目录与状态管理

### 2.1 项目目录管理

在 `App.tsx` 中新增项目级状态：

```typescript
const [projectDir, setProjectDir] = useState<string | null>(null)
const [isGitRepo, setIsGitRepo] = useState(false)
```

- Electron 模式：应用启动时弹出目录选择器（或记住上次打开的目录）
- 浏览器模式：不需要，继续使用 mock 数据

### 2.2 Git 服务层

新增 `services/git.ts`，封装所有 git IPC 调用：

```typescript
export const git = {
  checkRepo(dir: string): Promise<boolean>,
  init(dir: string): Promise<void>,
  info(dir: string): Promise<GitInfo>,
  changes(dir: string): Promise<FileChange[]>,
  diff(dir: string, file: string): Promise<DiffOutput>,
  stageFile(dir: string, file: string): Promise<void>,
  commit(dir: string, message: string): Promise<string>,
  branches(dir: string): Promise<BranchInfo[]>,
  log(dir: string, count?: number): Promise<CommitInfo[]>,
  worktrees(dir: string): Promise<WorktreeInfo[]>,
  createWorktree(dir: string, branch: string, base: string): Promise<string>,
  mergeWorktree(dir: string, wtPath: string, target: string): Promise<string>,
  removeWorktree(dir: string, wtPath: string, branch: string): Promise<void>,
  branchDiffStats(dir: string, baseBranch: string): Promise<BranchDiffStats>,
  generateCommitMsg(dir: string, diffText: string): void,
}
```

内部实现：Electron 模式调用 `backend.invoke('git.*', params)`，浏览器模式返回 mock 数据。

**事件监听**：`commit_msg_stream` 事件需要在 `services/git.ts` 中直接通过 `window.aiBackend.on('commit_msg_stream', cb)` 注册，不走 `backend.ts` 的现有事件处理器。

### 2.3 Git 类型定义

新增 `types/git.ts`，和后端 Rust 类型一一对应（camelCase）。

### 2.4 Session 与 WorkingDir 关系

- `session.worktree ?? projectDir` — 没有 worktree 用项目根目录
- Git 操作基于 session 的实际工作目录
- `Session` 类型保留 `worktree` 和 `gitBranch` 字段

---

## 第三部分：前端 — GitPanel 侧边栏

### 3.1 面板结构

替换现有 `GitSidebar`，三 Tab 可拖拽调宽面板：

- **Changes Tab**：变更文件列表 + Commit Section（textarea + AI Generate + Commit 按钮）+ Commit Graph
- **Git Tab**：分支状态栏 + Worktree 列表（合并/删除操作）+ Branches 列表
- **Files Tab**：文件树（后续实现）

默认宽度 360px，范围 280-800px，右侧滑入。

### 3.2 Changes Tab 交互

**列表模式**：
- Commit Section：自动增高 textarea（1-10行），⌘G 生成 AI commit message，⌘Enter 提交
- Changes 区域：文件列表，显示状态字母 + 增删行数，点击进入 diff 模式
- Graph 区域：commit 历史列表，可展开查看变更文件

**Diff 模式**：
- 顶部返回按钮 + 文件名 + 状态
- 按 hunk 渲染 diff（行号 + 增删高亮）
- 复用现有 DiffSideBySide / DiffNewFile / DiffDeletedFile 组件

### 3.3 Git Tab

- 分支状态栏：当前分支 + commit info + ahead/behind
- Worktrees 折叠区：卡片式展示，当前 worktree 高亮，非当前可合并/删除
- Branches 折叠区：本地/远程分支列表，排序规则同 MuMu

### 3.4 Session 点击联动

- 点击 Session → 设置 `focusedSessionId`
- GitPanel 据此确定工作目录
- Changes/Git Tab 自动刷新

### 3.5 组件文件

```
src/components/git/
├── GitPanel.tsx           # 三 Tab 容器
├── ChangesTab.tsx         # 变更列表 + commit + graph
├── GitTab.tsx             # 分支 + worktree
├── FilesTab.tsx           # 文件树（后续）
├── DiffView.tsx           # 结构化 hunk diff 渲染
├── CommitSection.tsx      # commit 输入 + AI 生成
├── CommitGraph.tsx        # commit 历史
├── DiffSideBySide.tsx     # 保留，适配新格式
├── DiffNewFile.tsx        # 保留，适配新格式
├── DiffDeletedFile.tsx    # 保留，适配新格式
└── DiffPanel.tsx          # diff 视图路由
```

---

## 第四部分：Session 对话框 Diff 与 Worktree 创建

### 4.1 SessionWindow Review 按钮

- AI 响应完成后（`onMessageComplete` 事件）→ 调用 `git.changes(workingDir)` 获取真实变更
- 有变更：在 session 上设置 `hasChanges: true` + `changeCount: number`，显示 review 按钮
- 无变更：不显示，保持 `inprocess`
- 点击打开 GitReviewPanel

**触发时机**：Review 按钮的状态由 `session.hasChanges` 驱动（替代原来的 `session.diff`），每次 AI 消息完成时刷新。

### 4.2 GitReviewPanel 数据源

从 `session.diff`（mock）切换为实时 IPC：
- 打开面板 → `git.changes(workingDir)` 获取文件列表
- 点击文件 → `git.diff(workingDir, file)` 获取 hunk 数据
- **`Session.diff` 字段移除**，替换为 `hasChanges: boolean` + `changeCount: number`（轻量标记）
- 每次打开面板时实时获取完整数据

### 4.5 刷新策略

v1 采用手动/事件驱动刷新（不做文件监听）：
- AI 消息完成后自动刷新 changes
- commit 成功后自动刷新 changes + log
- worktree 创建/删除后自动刷新 worktrees + branches
- GitPanel 提供手动 refresh 按钮

### 4.3 NewSessionModal Worktree 支持

新增 worktree 选项区域：
- 勾选 "Create in Worktree" → 显示配置区
- Base Branch 下拉（从 `git.branches` 获取）
- New Branch 输入 + 存在性校验
- 创建流程：有 worktree 先 `git.createWorktree` → 用返回 path 作 workingDir

### 4.4 Merge/Discard 对话框

- MergeDialog：选择目标分支 + 可选"合并后删除" + `git.mergeWorktree`
- DiscardDialog：确认警告 + `git.removeWorktree`

---

## 第五部分：数据流与删减清单

### 5.1 AI Commit Message 事件流

```
Frontend → invoke('git.generate_commit_msg') → Electron Main → stdin JSON → Rust Sidecar
  → spawn 临时 ClaudeProcess → 发送 prompt + diff
  → Claude 流式输出 → event: commit_msg_stream → Electron Main → sidecar:event → Frontend
  → 累积文本显示在 textarea → done=true → kill ClaudeProcess
```

### 5.2 删除/替换清单

| 文件 | 操作 |
|------|------|
| `services/mockGit.ts` | 保留，浏览器模式 fallback |
| `SessionWindow.tsx` 中 `generateMockDiff()` | 替换为 `git.changes()` |
| `Session.diff` 字段 | 移除，替换为 `hasChanges: boolean` + `changeCount: number` |
| `GitSidebar.tsx` | 替换为 `GitPanel` |
| `SourceControlPanel.tsx` mock commit graph | 替换为 `git.log()` |
| `SourceControlPanel.tsx` generateCommitMessage | 替换为 IPC `git.generateCommitMsg` |
| `utils/parsePatch.ts` | 保留（浏览器模式需要） |
| `NewSessionModal.tsx` | 改造：新增 worktree 选项 |

### 5.3 不在范围内

- Files Tab（后续）
- git push/pull
- 多项目管理
- Git 冲突解决 UI
