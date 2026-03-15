# SQLite 表结构设计

## 概述

为 AI Studio Infinite Canvas 项目引入 SQLite 持久化层，解决当前所有数据存在内存中、刷新即丢失的问题。

SQLite 部署在 Rust sidecar（ai-backend）层，前端通过已有的 JSON 协议（stdin/stdout）访问数据。

## 表结构

### 总览

```
projects (项目/仓库)
  ├── sessions (会话 + 消息历史 + 画布位置 + git 状态)
  └── project_state (项目级视图状态)

settings (全局配置 + API keys)
```

共 4 张表，涵盖：项目管理、会话与消息持久化、用户设置、项目级视图状态。

---

### 1. projects — 项目表

存储用户打开过的本地代码仓库。

```sql
CREATE TABLE projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            VARCHAR(255) NOT NULL,
    path            VARCHAR(1024) NOT NULL UNIQUE,
    last_opened_at  TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL
);
```

| 字段 | 说明 |
|------|------|
| `id` | 自增主键 |
| `name` | 显示名，默认取路径末段文件夹名，可自定义 |
| `path` | 本地仓库绝对路径，UNIQUE 防止重复 |
| `last_opened_at` | 最近打开时间，用于排序 |
| `created_at` | 首次添加时间 |

---

### 2. sessions — 会话表

存储 AI 对话 Session，包括消息历史（JSON text）、画布位置、git 关联状态。

```sql
CREATE TABLE sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    title       VARCHAR(255) NOT NULL,
    model       VARCHAR(100) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'inbox',
    position_x  REAL NOT NULL DEFAULT 0,
    position_y  REAL NOT NULL DEFAULT 0,
    height      REAL,
    git_branch  VARCHAR(255),
    worktree    VARCHAR(1024),
    messages    TEXT NOT NULL DEFAULT '[]',
    created_at  TIMESTAMP NOT NULL,
    updated_at  TIMESTAMP NOT NULL,

    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_status ON sessions(project_id, status);
```

| 字段 | 说明 |
|------|------|
| `id` | 自增主键 |
| `project_id` | 所属项目，外键级联删除 |
| `title` | Session 标题 |
| `model` | AI 模型标识（claude, gemini 等） |
| `status` | 状态：inbox / inprocess / review / done |
| `position_x`, `position_y` | 画布坐标 |
| `height` | 窗口高度 |
| `git_branch` | 关联的 git 分支名 |
| `worktree` | 关联的 worktree 路径 |
| `messages` | `Message[]` 完整 JSON，包含所有 ContentBlock 结构 |
| `created_at` | 创建时间 |
| `updated_at` | 最后活跃时间 |

**messages 字段格式**：序列化完整的 `Message[]` 数组，每个 Message 包含 `id`、`role`、`content`、`type`、`blocks`（ContentBlock[]）。反序列化后直接用于 UI 回显。

**不存 diff**：GitDiff 数据实时从 git 获取，不持久化。

---

### 3. settings — 全局设置表

通用 key-value 表，存储全局用户偏好和 API keys。

```sql
CREATE TABLE settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       VARCHAR(2048) NOT NULL,
    updated_at  TIMESTAMP NOT NULL
);
```

| 字段 | 说明 |
|------|------|
| `key` | 点号命名空间式 key |
| `value` | 配置值 |
| `updated_at` | 最后更新时间 |

**命名空间约定**：

| key 示例 | 说明 |
|----------|------|
| `api_key.anthropic` | Anthropic API key |
| `api_key.gemini` | Gemini API key |
| `api_key.openai` | OpenAI API key |
| `ui.theme` | 主题（dark/light） |
| `ui.window_width` | 窗口宽度 |
| `ui.window_height` | 窗口高度 |

---

### 4. project_state — 项目视图状态表

存储每个项目的视图模式和画布 viewport 状态，重新打开项目时恢复。

```sql
CREATE TABLE project_state (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL UNIQUE,
    view_mode   VARCHAR(20) NOT NULL DEFAULT 'canvas',
    canvas_x    REAL NOT NULL DEFAULT 0,
    canvas_y    REAL NOT NULL DEFAULT 0,
    canvas_zoom REAL NOT NULL DEFAULT 1.0,
    updated_at  TIMESTAMP NOT NULL,

    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

| 字段 | 说明 |
|------|------|
| `id` | 自增主键 |
| `project_id` | 所属项目，UNIQUE 约束（每项目一条） |
| `view_mode` | 视图模式：canvas / board / tab |
| `canvas_x`, `canvas_y` | 画布平移位置 |
| `canvas_zoom` | 画布缩放比例 |
| `updated_at` | 最后更新时间 |

---

## 架构决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| SQLite 部署位置 | Rust sidecar（ai-backend） | 数据层和业务逻辑同进程，Rust 有成熟的 rusqlite |
| 项目概念 | 本地代码仓库路径 | 项目 = 一个 git 仓库 |
| 消息存储粒度 | 整体序列化为 JSON text | 简单直接，ContentBlock 结构复杂不适合拆表 |
| Session 位置存储 | Session 表内字段 | 与现有 Session 类型结构一致，避免额外 join |
| GitDiff 持久化 | 不存 | 实时从 git 获取 |
| 设置存储 | 通用 key-value 表 | 灵活，新增配置不需改表结构 |
| 项目级状态 | 独立 project_state 表 | 不同项目的视图/画布状态独立 |

## 数据库文件位置

SQLite 数据库文件建议存放在用户数据目录：
- macOS: `~/Library/Application Support/ai-studio-infinite-canvas/data.db`
- Linux: `~/.local/share/ai-studio-infinite-canvas/data.db`
- Windows: `%APPDATA%/ai-studio-infinite-canvas/data.db`

## 迁移策略

使用版本号管理 schema 迁移，在数据库中存储当前版本号（可用 settings 表的 `db.schema_version` key），启动时检查并执行必要的迁移。
