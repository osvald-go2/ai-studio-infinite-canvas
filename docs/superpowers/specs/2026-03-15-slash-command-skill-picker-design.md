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

使用显式映射表，根据 session 的 model ID 确定平台：

```typescript
const MODEL_TO_PLATFORM: Record<string, string> = {
  'claude-code': 'claude',
  'codex': 'codex',
  'gemini-cli': 'gemini',
}
```

各平台对应的扫描路径：

| Platform | 项目级目录 | 用户级目录 |
|---|---|---|
| claude | `{projectDir}/.claude/skills/` | `~/.claude/skills/` |
| codex | `{projectDir}/.codex/skills/` | `~/.codex/skills/` |
| gemini | `{projectDir}/.gemini/skills/` | `~/.gemini/skills/` |

项目级和用户级目录都扫描，结果合并，项目级优先显示。当 model ID 不在映射表中时，不扫描，不显示 picker。

### SKILL.md 解析

只提取 YAML frontmatter 中的 `name` 和 `description` 字段，不加载 markdown body。支持递归扫描子目录中的 SKILL.md 文件。

用轻量正则提取 frontmatter，不引入额外 npm 包。

**容错处理：**
- 目录不存在时静默跳过（返回空数组），不抛出错误
- SKILL.md 无有效 frontmatter 或缺少 `name` 字段时跳过该文件
- `description` 缺失时默认为空字符串
- 文件系统错误捕获并 console.warn，不影响其他文件的扫描

### 数据类型

```typescript
interface SkillInfo {
  name: string           // frontmatter 中的 name
  description: string    // frontmatter 中的 description
  filePath: string       // SKILL.md 的完整路径
  source: 'project' | 'user'  // 来源作用域
}
```

### 重名去重

当项目级和用户级存在相同 `name` 的 skill 时，只保留项目级的。

### 运行环境

- **Electron**：通过 `window.aiBackend` 暴露 `scanSkills(platform: string, projectDir: string): Promise<SkillInfo[]>`，复用现有 IPC bridge 模式，主进程用 Node.js fs 递归扫描目录、解析 YAML frontmatter
- **Browser**：`scanSkills()` 返回内置 mock skills 数据用于演示

### 扫描时机

用户输入 `/` 时触发扫描。扫描结果在 `/` 输入期间缓存（picker 关闭后清除）。如果扫描 Promise 返回时触发条件已不满足（如用户已删除 `/`），丢弃结果。

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
| `Esc` | 关闭列表，保留输入框现有文本。SkillPicker 消费此事件（stopPropagation），防止触发 SessionWindow 的全局 ESC 处理（停止 streaming） |
| 继续输入 | 实时过滤列表 |
| 删除 `/` | 关闭列表 |

### 选中态样式

选中 skill 后，在输入框上方用 overlay div 叠加在 textarea 之上，对 `/skill-name` 部分渲染轻量背景色标识。textarea 本身保持为普通 `<textarea>`，不改为 contentEditable。用户可在后面继续输入参数。删改 `/skill-name` 到不匹配任何 skill 时，overlay 消失。

**实现方式：** textarea 设置 `color: transparent`（或 `caret-color` 保留光标），overlay div 在相同位置用相同字体渲染文本，其中 `/skill-name` 部分带背景色，其余部分正常颜色。这是 syntax-highlighted textarea 的常见 pattern。

### 发送行为

发送时输入框原始文本（如 `/my-abc some args`）直接作为消息内容，不做任何转换。

## File Changes

### New Files

| File | Responsibility |
|---|---|
| `src/components/SkillPicker.tsx` | 浮动列表组件：渲染、键盘导航、匹配高亮 |
| `src/services/skillScanner.ts` | skill 扫描逻辑：Electron 调 aiBackend API，浏览器返回 mock |

### Modified Files

| File | Changes |
|---|---|
| `electron/main.ts` | 添加 IPC handler `scan-skills`：接收 platform 和 projectDir，扫描目录，解析 SKILL.md frontmatter，返回 `SkillInfo[]` |
| `electron/preload.ts` | 在 `aiBackend` 上暴露 `scanSkills(platform: string, projectDir: string)` |
| `src/components/SessionWindow.tsx` | 集成 SkillPicker：检测触发条件、管理 picker 显隐、处理选中回调、选中态 overlay 渲染 |
| `src/types.ts` | 添加 `SkillInfo` 类型 |

### No Changes

- `App.tsx` — 不引入全局状态
- 各 View 组件 — 不传递 skill 相关 props
- 消息发送/后端逻辑 — 无变化

### Dependencies

无新增 npm 包。YAML frontmatter 用正则提取。
