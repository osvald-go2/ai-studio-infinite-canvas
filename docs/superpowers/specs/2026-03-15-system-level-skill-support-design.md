# System-Level Skill Support Design

Date: 2026-03-15

## Overview

扩展现有 skill 扫描机制，支持从 Claude Code 已安装插件中发现 skills。当前只扫描项目级和用户级 skills 目录，本次增加对 `~/.claude/plugins/` 中已安装、已启用插件的 skill 扫描，先只支持 Claude 平台。

## Constraints

- 只扫描 Claude 平台的插件（`platform === 'claude'`）
- 尊重 Claude Code 的两层过滤：`enabledPlugins` + `scope`
- 前端接口不变，改动集中在 Electron 主进程的 `scan-skills` IPC handler
- 不引入新的 npm 依赖

## Data Type Changes

`SkillInfo` 新增可选字段 `pluginName`：

```typescript
interface SkillInfo {
  name: string
  description: string
  filePath: string
  source: 'project' | 'user'
  pluginName?: string  // 来自哪个插件，如 "superpowers"、"impeccable"
}
```

`source` 含义保持不变：
- `'project'` — 来自项目级目录或项目级插件
- `'user'` — 来自用户级目录或用户级插件

`pluginName` 存在时表示 skill 来自插件，值为插件的 `name`（从 `plugin.json` 读取或从 `installed_plugins.json` 的 key 中提取 `@` 前的部分）。

## Scan Logic

### 扫描顺序与优先级

按以下顺序扫描，同名 skill 先出现的胜出（去重）：

1. **项目级目录** — `{projectDir}/.claude/skills/` → `source: 'project'`, `pluginName: undefined`
2. **用户级目录** — `~/.claude/skills/` → `source: 'user'`, `pluginName: undefined`
3. **项目级插件** — `installed_plugins.json` 中 `scope: "project"` 且 `projectPath` 匹配当前 `projectDir` 的插件 → `source: 'project'`, `pluginName: "xxx"`
4. **用户级插件** — `installed_plugins.json` 中 `scope: "user"` 的插件 → `source: 'user'`, `pluginName: "xxx"`

### 插件过滤规则

读取两个配置文件：
- `~/.claude/plugins/installed_plugins.json` — 已安装插件列表
- `~/.claude/settings.json` — 已启用插件列表（只读用户级 `~/.claude/settings.json`，不读项目级 settings）

所有在 `~/.claude/plugins/installed_plugins.json` 中的插件均为 Claude 平台插件，无需额外平台字段过滤。`scan-skills` handler 仅在 `platform === 'claude'` 时进入插件扫描代码路径。

过滤条件：
1. 插件必须在 `settings.json` 的 `enabledPlugins` 中且值为 `true`
2. `scope: "project"` 的插件只在 `projectPath` 与当前 `projectDir` 匹配时扫描
3. `scope: "user"` 的插件始终扫描

**双 scope 边界情况：** 当同一插件同时有 project-scoped 和 user-scoped 安装时（如 superpowers v4.3.1 project + v5.0.2 user），两者都会被扫描。由于项目级插件先扫描，同名 skill 项目级版本优先。仅存在于 user-scoped 版本中的新 skill 仍会正常出现。

### 插件 Skills 路径解析

对每个符合条件的插件：
1. 从 `installed_plugins.json` 获取 `installPath`
2. 读取 `{installPath}/.claude-plugin/plugin.json`
3. 若 `plugin.json` 包含 `skills` 字段 → skills 路径为 `{installPath}/{skills字段值}`
4. 若无 `skills` 字段 → skills 路径为 `{installPath}/skills/`
5. 递归扫描该路径下的 `SKILL.md` 文件（复用现有 `walkDir` 逻辑，扩展其签名以支持 `pluginName` 参数）

### installed_plugins.json 结构

```json
{
  "version": 2,
  "plugins": {
    "superpowers@claude-plugins-official": [
      {
        "scope": "user",
        "installPath": "/Users/xxx/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.2",
        "version": "5.0.2",
        "gitCommitSha": "..."
      },
      {
        "scope": "project",
        "projectPath": "/Users/xxx/my-project",
        "installPath": "/Users/xxx/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1",
        "version": "4.3.1",
        "gitCommitSha": "..."
      }
    ]
  }
}
```

插件 key 格式为 `{name}@{registry}`，`@` 前的部分即为 `pluginName`。

实际文件还包含 `installedAt`、`lastUpdated` 等字段，扫描逻辑只使用 `scope`、`installPath`、`projectPath`，其余字段忽略。

### settings.json enabledPlugins 结构

```json
{
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true,
    "impeccable@impeccable": true
  }
}
```

### 容错处理

- `installed_plugins.json` 或 `settings.json` 不存在或解析失败 → 跳过插件扫描，只返回目录扫描结果
- `plugin.json` 不存在或解析失败 → 跳过该插件
- `installPath` 不存在 → 跳过该插件
- skills 目录不存在 → 跳过该插件（静默，不报错）
- 单个 SKILL.md 读取失败 → `console.warn` 并继续

## File Changes

### Modified Files

| File | Changes |
|---|---|
| `electron/main.ts` | `scan-skills` handler 增加插件扫描逻辑：(1) `walkDir` 签名扩展为 `walkDir(dir, source, pluginName?)` 以支持传递插件名，`results` 数组类型同步增加 `pluginName?: string`；(2) 新增 `scanPluginSkills(projectDir)` 函数，读取 `installed_plugins.json` 和 `settings.json`，过滤已启用插件，解析 `plugin.json` 获取 skills 路径，调用 `walkDir` 扫描 |
| `src/types.ts` | `SkillInfo` 接口新增 `pluginName?: string` |
| `src/services/skillScanner.ts` | mock 数据增加几条带 `pluginName` 的示例 |

### Optional UI Enhancement

| File | Changes |
|---|---|
| `src/components/SkillPicker.tsx` | 可选：skill 项显示 `pluginName` 标签（如小灰色文字），帮助用户区分来源 |

### No Changes

- `electron/preload.ts` — 接口签名不变
- `src/components/SessionWindow.tsx` — 无变化
- `App.tsx`、各 View 组件 — 无变化

### Dependencies

无新增 npm 包。JSON 解析用 `JSON.parse`，路径处理用 Node.js `path` 模块。

## Non-Goals

- 不支持 Codex、Gemini 平台的插件扫描（它们没有类似的插件系统）
- 不支持插件的安装/卸载/启用/禁用管理（用户在 Claude CLI 中操作）
- 不加载 SKILL.md 的 markdown body 内容（只读 frontmatter metadata）
- 不支持插件的 commands/ 或 agents/ 目录扫描
