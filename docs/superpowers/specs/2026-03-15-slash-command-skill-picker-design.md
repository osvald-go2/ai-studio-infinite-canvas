# Slash Command Skill Picker Design

Date: 2026-03-15

## Overview

在 SessionWindow 输入框中支持 `/` 触发的 slash command 交互。用户在会话首条消息输入 `/` 时，弹出浮动列表展示当前平台可用的 skills，支持模糊匹配、键盘导航和选中确认。选中后文本直接作为普通消息发送给 AI，不做特殊处理。

## Constraints

- 仅在会话首条消息触发（messages 为空时）
- `/` 必须是输入的第一个字符（前面无空格、换行）
- 发送行为不变：原始文本直接发给 AI 后端
- 不引入全局状态，改动集中在 SessionWindow 层

## Skill Source

### 目录映射

根据 session 的 model 关键词决定扫描路径：

| Model 关键词 | 项目级目录 | 用户级目录 |
|---|---|---|
| claude | `.claude/skills/` | `~/.claude/skills/` |
| codex | `.codex/skills/` | `~/.codex/skills/` |
| gemini | `.gemini/skills/` | `~/.gemini/skills/` |

项目级和用户级目录都扫描，结果合并，项目级优先显示。

### SKILL.md 解析

只提取 YAML frontmatter 中的 `name` 和 `description` 字段，不加载 markdown body。支持递归扫描子目录中的 SKILL.md 文件。

用轻量正则提取 frontmatter，不引入额外 npm 包。

### 数据类型

```typescript
interface SkillInfo {
  name: string           // frontmatter 中的 name
  description: string    // frontmatter 中的 description
  filePath: string       // SKILL.md 的完整路径
  source: 'project' | 'user'  // 来源作用域
}
```

### 运行环境

- **Electron**：通过 preload 暴露 `window.electronAPI.scanSkills(platform: string): Promise<SkillInfo[]>`，主进程用 Node.js fs 递归扫描目录、解析 YAML frontmatter
- **Browser**：`scanSkills()` 返回内置 mock skills 数据用于演示

### 扫描时机

用户输入 `/` 时触发扫描。

## Frontend Interaction

### 触发条件

同时满足以下条件时显示 SkillPicker：
1. 当前 session 的 messages 数组为空
2. 输入框内容以 `/` 开头（第一个字符，前面无空格/换行）
3. 有匹配的 skill 结果

### SkillPicker 组件

浮动在输入框上方，absolute 定位，向上展开。

```
┌─────────────────────────────┐
│  my-abc                     │  ← 高亮项
│  Refactor code into pure fn │
├─────────────────────────────┤
│  my-deploy                  │
│  Deploy to staging env      │
├─────────────────────────────┤
│  test-runner                │
│  Run project test suite     │
└─────────────────────────────┘
┌─────────────────────────────┐
│ /abc|                       │  ← 输入框
└─────────────────────────────┘
```

每项显示：
- skill `name`（主文本）
- `description`（副文本，较淡颜色）
- 匹配字符高亮

### 模糊匹配

取 `/` 后的输入作为查询词，对 skill name 做不区分大小写的子串匹配：
- `/my` 匹配 `my-abc`、`my-deploy`
- `/abc` 匹配 `my-abc`
- 无匹配结果时列表不显示

### 键盘交互

| 按键 | 行为 |
|---|---|
| `↑` / `↓` | 在列表中移动高亮项 |
| `Enter` | 选中当前高亮项，替换输入框为 `/skill-name `（尾部空格） |
| `Esc` | 关闭列表，保留输入框现有文本 |
| 继续输入 | 实时过滤列表 |
| 删除 `/` | 关闭列表 |

### 选中态样式

选中 skill 后，输入框内 `/skill-name` 部分用轻量样式标识（略带背景色的 inline 效果）。用户可在后面继续输入参数。删改 `/skill-name` 到不匹配任何 skill 时，选中态消失。

### 发送行为

发送时输入框原始文本（如 `/my-abc some args`）直接作为消息内容，不做任何转换。

## File Changes

### New Files

| File | Responsibility |
|---|---|
| `src/components/SkillPicker.tsx` | 浮动列表组件：渲染、键盘导航、匹配高亮 |
| `src/services/skillScanner.ts` | skill 扫描逻辑：Electron 调 preload API，浏览器返回 mock |

### Modified Files

| File | Changes |
|---|---|
| `electron/main.ts` | 添加 IPC handler `scan-skills`：接收 platform，扫描目录，解析 SKILL.md frontmatter，返回 `SkillInfo[]` |
| `electron/preload.ts` | 暴露 `electronAPI.scanSkills(platform: string)` |
| `src/components/SessionWindow.tsx` | 集成 SkillPicker：检测触发条件、管理 picker 显隐、处理选中回调、选中态样式 |
| `src/types.ts` | 添加 `SkillInfo` 类型 |

### No Changes

- `App.tsx` — 不引入全局状态
- 各 View 组件 — 不传递 skill 相关 props
- 消息发送/后端逻辑 — 无变化

### Dependencies

无新增 npm 包。YAML frontmatter 用正则提取。
