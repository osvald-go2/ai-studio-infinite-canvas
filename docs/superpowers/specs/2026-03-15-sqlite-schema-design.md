# SQLite 表结构设计

## 概述

为 AI Studio Infinite Canvas 项目引入 SQLite 持久化层，解决当前所有数据存在内存中、刷新即丢失的问题。

SQLite 部署在 Rust sidecar（ai-backend）层，前端通过已有的 JSON 协议（stdin/stdout）访问数据。

## 连接初始化

每次打开数据库连接时，必须执行以下 PRAGMA：

```sql
PRAGMA foreign_keys = ON;    -- SQLite 默认关闭外键，必须显式开启，否则级联删除不生效
PRAGMA journal_mode = WAL;   -- 启用 WAL 模式，避免 UI 读取和后端写入的冲突
```

## 表结构

### 总览

```
projects (项目/仓库 + 视图状态)
  └── sessions (会话 + 消息历史 + 画布位置 + git 状态)

settings (全局配置 + API keys)
```

共 3 张表，涵盖：项目管理与视图状态、会话与消息持久化、全局用户设置。

---

### 1. projects — 项目表

存储用户打开过的本地代码仓库，以及该项目的视图状态。

```sql
CREATE TABLE projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            VARCHAR(255) NOT NULL,
    path            VARCHAR(1024) NOT NULL UNIQUE,
    view_mode       VARCHAR(20) NOT NULL DEFAULT 'canvas',
    canvas_x        REAL NOT NULL DEFAULT 0,
    canvas_y        REAL NOT NULL DEFAULT 0,
    canvas_zoom     REAL NOT NULL DEFAULT 1.0,
    last_opened_at  VARCHAR(30) NOT NULL,       -- ISO 8601 格式，如 2026-03-15T10:30:00Z
    created_at      VARCHAR(30) NOT NULL
);
```

| 字段 | 说明 |
|------|------|
| `id` | 自增主键 |
| `name` | 显示名，默认取路径末段文件夹名，可自定义 |
| `path` | 本地仓库绝对路径，UNIQUE 防止重复 |
| `view_mode` | 视图模式：canvas / board / tab |
| `canvas_x`, `canvas_y` | 画布平移位置 |
| `canvas_zoom` | 画布缩放比例 |
| `last_opened_at` | 最近打开时间（ISO 8601），用于排序 |
| `created_at` | 首次添加时间（ISO 8601） |

---

### 2. sessions — 会话表

存储 AI 对话 Session，包括消息历史（JSON text）、画布位置、git 关联状态。

```sql
CREATE TABLE sessions (
    id          VARCHAR(36) PRIMARY KEY,        -- UUID 字符串，与前端/后端一致
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
    created_at  VARCHAR(30) NOT NULL,
    updated_at  VARCHAR(30) NOT NULL,

    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_status ON sessions(project_id, status);
```

| 字段 | 说明 |
|------|------|
| `id` | UUID 字符串主键，与现有前端/Rust 后端的 id 生成方式一致 |
| `project_id` | 所属项目，外键级联删除 |
| `title` | Session 标题 |
| `model` | AI 模型标识（claude, gemini 等） |
| `status` | 状态：inbox / inprocess / review / done |
| `position_x`, `position_y` | 画布坐标 |
| `height` | 窗口高度 |
| `git_branch` | 关联的 git 分支名 |
| `worktree` | 关联的 worktree 路径 |
| `messages` | `Message[]` 完整 JSON，包含所有 ContentBlock 结构 |
| `created_at` | 创建时间（ISO 8601） |
| `updated_at` | 最后活跃时间（ISO 8601） |

**messages 字段格式**：序列化完整的 `Message[]` 数组，每个 Message 包含 `id`、`role`、`content`、`type`、`blocks`（ContentBlock[]）。反序列化后直接用于 UI 回显。

**不存 diff**：GitDiff 数据实时从 git 获取，不持久化。

**不存 prevHeight**：collapse/expand 属于瞬态 UI 状态，重启后默认展开。

**messages 单 blob 的已知局限**：每次写入需重写整个 JSON，长会话（数百条消息）时写入开销增大，且单次写入损坏会丢失整个会话。MVP 阶段可接受，未来如需优化可迁移为独立 messages 表。

---

### 3. settings — 全局设置表

通用 key-value 表，存储全局用户偏好和 API keys。

```sql
CREATE TABLE settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       VARCHAR(2048) NOT NULL,
    updated_at  VARCHAR(30) NOT NULL
);
```

| 字段 | 说明 |
|------|------|
| `key` | 点号命名空间式 key |
| `value` | 配置值 |
| `updated_at` | 最后更新时间（ISO 8601） |

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

## 架构决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| SQLite 部署位置 | Rust sidecar（ai-backend） | 数据层和业务逻辑同进程，Rust 有成熟的 rusqlite |
| 项目概念 | 本地代码仓库路径 | 项目 = 一个 git 仓库 |
| 消息存储粒度 | 整体序列化为 JSON text | 简单直接，ContentBlock 结构复杂不适合拆表。未来可迁移为独立表 |
| Session id 类型 | VARCHAR(36)（UUID 字符串） | 与现有前端 `Date.now().toString()` 和 Rust `Uuid::new_v4()` 一致 |
| Session 位置存储 | Session 表内字段 | 与现有 Session 类型结构一致，避免额外 join |
| 项目视图状态 | 合并到 projects 表 | 1:1 关系，无需单独建表 |
| GitDiff 持久化 | 不存 | 实时从 git 获取 |
| prevHeight 持久化 | 不存 | 瞬态 UI 状态，重启后默认展开 |
| 设置存储 | 通用 key-value 表 | 灵活，新增配置不需改表结构 |
| 时间戳格式 | ISO 8601 字符串（VARCHAR(30)） | SQLite 无原生 TIMESTAMP 类型，ISO 8601 可排序且跨平台一致 |
| Schema 版本管理 | `PRAGMA user_version` | SQLite 内置，无需建表即可使用，避免鸡生蛋问题 |

## 数据库文件位置

SQLite 数据库文件存放在用户数据目录：
- macOS: `~/Library/Application Support/ai-studio-infinite-canvas/data.db`
- Linux: `~/.local/share/ai-studio-infinite-canvas/data.db`
- Windows: `%APPDATA%/ai-studio-infinite-canvas/data.db`

## 迁移策略

使用 SQLite 内置的 `PRAGMA user_version` 管理 schema 版本。应用启动时：

1. 读取 `PRAGMA user_version`
2. 如果版本号低于当前代码期望的版本，依次执行迁移脚本
3. 迁移完成后更新 `PRAGMA user_version`

首次启动（`user_version = 0`）时创建所有表。
