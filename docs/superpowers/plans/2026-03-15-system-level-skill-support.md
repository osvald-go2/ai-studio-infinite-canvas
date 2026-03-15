# System-Level Skill Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 Claude Code 已安装、已启用的插件中扫描 skills，展示在 SkillPicker 中

**Architecture:** 扩展 Electron 主进程的 `scan-skills` IPC handler，在现有目录扫描之后增加插件扫描。读取 `~/.claude/plugins/installed_plugins.json` 和 `~/.claude/settings.json` 确定已启用插件，解析每个插件的 `plugin.json` 获取 skills 路径，复用 `walkDir` 递归扫描 `SKILL.md`。

**Tech Stack:** Node.js fs, path, os (已有依赖，无新增)

**Spec:** `docs/superpowers/specs/2026-03-15-system-level-skill-support-design.md`

---

## Chunk 1: Core Implementation

### Task 1: 更新 SkillInfo 类型

**Files:**
- Modify: `src/types.ts:91-96`

- [ ] **Step 1: 给 SkillInfo 接口添加 pluginName 字段**

```typescript
export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  source: 'project' | 'user';
  pluginName?: string;
}
```

- [ ] **Step 2: 运行类型检查确认无破坏**

Run: `npx tsc --noEmit`
Expected: PASS（pluginName 是可选字段，不影响现有代码）

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(skills): add pluginName field to SkillInfo type"
```

---

### Task 2: 扩展 walkDir 签名和 results 类型

**Files:**
- Modify: `electron/main.ts:151-191`

- [ ] **Step 1: 更新 results 数组类型和 walkDir 签名**

在 `scan-skills` handler 中（`electron/main.ts:151` 起），做两处修改：

1. `results` 类型加 `pluginName?`:
```typescript
const results: Array<{ name: string; description: string; filePath: string; source: 'project' | 'user'; pluginName?: string }> = [];
```

2. `walkDir` 签名加 `pluginName?` 参数，并在 push 时传入：
```typescript
const walkDir = async (dir: string, source: 'project' | 'user', pluginName?: string) => {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath, source, pluginName);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          const parsed = parseSkillFrontmatter(content);
          if (parsed) {
            results.push({ ...parsed, filePath: fullPath, source, pluginName });
          }
        } catch (e) {
          console.warn(`[scan-skills] Failed to read ${fullPath}:`, e);
        }
      }
    }
  };
```

现有 `walkDir(projectSkillsDir, 'project')` 和 `walkDir(userSkillsDir, 'user')` 调用不需改动（`pluginName` 默认 `undefined`）。

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat(skills): extend walkDir signature to support pluginName"
```

---

### Task 3: 实现插件 skill 扫描逻辑

**Files:**
- Modify: `electron/main.ts`（在 `scan-skills` handler 内，`walkDir` 之后、去重之前）

- [ ] **Step 1: 在 `parseSkillFrontmatter` 函数之后添加 `getPluginSkillEntries` 辅助函数**

此函数读取 `installed_plugins.json` 和 `settings.json`，返回需要扫描的插件条目列表。在 `electron/main.ts` 中 `parseSkillFrontmatter` 函数之后（约 line 207）添加：

```typescript
interface PluginSkillEntry {
  pluginName: string;
  skillsDir: string;
  source: 'project' | 'user';
}

async function getPluginSkillEntries(projectDir: string): Promise<PluginSkillEntry[]> {
  const claudeDir = path.join(os.homedir(), '.claude');

  let installedData: any;
  try {
    const raw = await fs.promises.readFile(path.join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf-8');
    installedData = JSON.parse(raw);
  } catch {
    return [];
  }

  let enabledPlugins: Record<string, boolean> = {};
  try {
    const raw = await fs.promises.readFile(path.join(claudeDir, 'settings.json'), 'utf-8');
    const settings = JSON.parse(raw);
    enabledPlugins = settings.enabledPlugins || {};
  } catch {
    return [];
  }

  const plugins = installedData?.plugins;
  if (!plugins || typeof plugins !== 'object') return [];

  const entries: PluginSkillEntry[] = [];

  for (const [pluginKey, installations] of Object.entries(plugins)) {
    if (!enabledPlugins[pluginKey]) continue;

    const pluginName = pluginKey.split('@')[0];

    if (!Array.isArray(installations)) continue;

    for (const inst of installations as any[]) {
      const { scope, installPath, projectPath } = inst;
      if (!installPath) continue;

      if (scope === 'project') {
        if (projectPath !== projectDir) continue;
      } else if (scope !== 'user') {
        continue;
      }

      // Resolve skills directory from plugin.json
      let skillsDir = path.join(installPath, 'skills');
      try {
        const pluginJsonRaw = await fs.promises.readFile(path.join(installPath, '.claude-plugin', 'plugin.json'), 'utf-8');
        const pluginJson = JSON.parse(pluginJsonRaw);
        if (pluginJson.skills && typeof pluginJson.skills === 'string') {
          skillsDir = path.resolve(installPath, pluginJson.skills);
        }
      } catch {
        // plugin.json missing or invalid — use default skills/ dir
      }

      entries.push({
        pluginName,
        skillsDir,
        source: scope === 'project' ? 'project' : 'user',
      });
    }
  }

  // Ensure project-scoped entries come before user-scoped for correct dedup priority
  entries.sort((a, b) => (a.source === 'project' ? 0 : 1) - (b.source === 'project' ? 0 : 1));

  return entries;
}
```

- [ ] **Step 2: 在 `scan-skills` handler 中调用插件扫描**

在现有 `await walkDir(userSkillsDir, 'user');` 之后、去重逻辑之前，增加插件扫描。同时加 `platform === 'claude'` 守卫：

```typescript
  await walkDir(projectSkillsDir, 'project');
  await walkDir(userSkillsDir, 'user');

  // Scan plugin skills (Claude only)
  if (platform === 'claude') {
    const pluginEntries = await getPluginSkillEntries(projectDir);
    for (const entry of pluginEntries) {
      await walkDir(entry.skillsDir, entry.source, entry.pluginName);
    }
  }

  const seen = new Set<string>();
  // ... existing dedup logic
```

- [ ] **Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: 手动验证**

在 Electron 环境下运行 `npm run dev`，创建一个 claude-code 会话，输入 `/`，确认 SkillPicker 能显示来自已安装插件的 skills（如 superpowers 的 commit、test-driven-development 等）。

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat(skills): scan Claude plugin skills from installed_plugins.json"
```

---

### Task 4: 更新 mock 数据

**Files:**
- Modify: `src/services/skillScanner.ts:9-18`

- [ ] **Step 1: 给 MOCK_SKILLS 添加带 pluginName 的示例**

```typescript
const MOCK_SKILLS: SkillInfo[] = [
  { name: 'commit', description: 'Create a git commit with AI-generated message', filePath: 'mock', source: 'project' },
  { name: 'review-pr', description: 'Review a pull request for issues and improvements', filePath: 'mock', source: 'project' },
  { name: 'test-runner', description: 'Run project test suite and analyze failures', filePath: 'mock', source: 'user', pluginName: 'superpowers' },
  { name: 'refactor', description: 'Refactor selected code for better readability', filePath: 'mock', source: 'user', pluginName: 'superpowers' },
  { name: 'explain-code', description: 'Explain how a piece of code works', filePath: 'mock', source: 'user', pluginName: 'superpowers' },
  { name: 'fix-bug', description: 'Diagnose and fix a bug from error output', filePath: 'mock', source: 'project' },
  { name: 'create-test', description: 'Generate unit tests for a function or module', filePath: 'mock', source: 'project' },
  { name: 'polish', description: 'Final quality pass before shipping', filePath: 'mock', source: 'user', pluginName: 'impeccable' },
];
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/skillScanner.ts
git commit -m "feat(skills): add pluginName to mock skill data"
```

---

### Task 5: SkillPicker 显示 pluginName 标签

**Files:**
- Modify: `src/components/SkillPicker.tsx:64-66`

- [ ] **Step 1: 更新来源标签显示逻辑**

将现有的 source 标签替换为更有信息量的显示——有 pluginName 时显示插件名，无则显示 source：

```typescript
          <span className="text-[10px] text-gray-600 ml-auto shrink-0 mt-0.5">
            {skill.pluginName || (skill.source === 'project' ? 'project' : 'user')}
          </span>
```

- [ ] **Step 2: 浏览器验证**

Run: `npm run dev`
在浏览器模式下打开，创建新会话输入 `/`，确认 mock skills 中带 pluginName 的项显示插件名（如 "superpowers"），不带的显示 "project"/"user"。

- [ ] **Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/SkillPicker.tsx
git commit -m "feat(skills): show plugin name in SkillPicker"
```
