# Slash Command Skill Picker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slash command interaction to SessionWindow — when user types `/` as first character of the first message, show a floating skill picker list above the input with fuzzy matching, keyboard navigation, and selection feedback.

**Architecture:** New `SkillPicker` component floats above the textarea in SessionWindow. `skillScanner` service handles skill discovery: in Electron mode it calls a new IPC handler `scan-skills` that reads SKILL.md files from platform-specific directories; in browser mode it returns mock data. The textarea uses an overlay div pattern for selected-skill highlighting without switching to contentEditable.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Electron IPC (Node.js fs for file scanning)

**Spec:** `docs/superpowers/specs/2026-03-15-slash-command-skill-picker-design.md`

---

## Chunk 1: Types, Electron IPC, and Skill Scanner Service

### Task 1: Add SkillInfo type

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add SkillInfo interface to types.ts**

Append after the `DbSession` interface (line 103):

```typescript
export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  source: 'project' | 'user';
}
```

- [ ] **Step 2: Verify type checking passes**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add SkillInfo type for slash command skill picker"
```

---

### Task 2: Add IPC handler for skill scanning in Electron main process

**Files:**
- Modify: `electron/main.ts`

The main process needs a new IPC handler `scan-skills` that:
1. Receives `platform` (e.g. `'claude'`) and `projectDir` (e.g. `'/Users/foo/myproject'`)
2. Builds two scan paths: `{projectDir}/.{platform}/skills/` and `~/.{platform}/skills/`
3. Recursively finds all `SKILL.md` files
4. Parses YAML frontmatter to extract `name` and `description`
5. Returns `SkillInfo[]` with project-level skills first, deduplicated by name

- [ ] **Step 1: Add the scan-skills IPC handler**

Add after the `config:getLastProjectDir` handler (line 131) in `electron/main.ts`:

```typescript
import fs from 'fs';
import os from 'os';

// --- Add this IPC handler ---

ipcMain.handle('scan-skills', async (_, platform: string, projectDir: string) => {
  const results: Array<{ name: string; description: string; filePath: string; source: 'project' | 'user' }> = [];

  const walkDir = async (dir: string, source: 'project' | 'user') => {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist — silently skip
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath, source);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          const parsed = parseSkillFrontmatter(content);
          if (parsed) {
            results.push({ ...parsed, filePath: fullPath, source });
          }
        } catch (e) {
          console.warn(`[scan-skills] Failed to read ${fullPath}:`, e);
        }
      }
    }
  };

  const projectSkillsDir = path.join(projectDir, `.${platform}`, 'skills');
  const userSkillsDir = path.join(os.homedir(), `.${platform}`, 'skills');

  await walkDir(projectSkillsDir, 'project');
  await walkDir(userSkillsDir, 'user');

  // Deduplicate: project-level wins over user-level
  const seen = new Set<string>();
  const deduped = results.filter(s => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });

  return deduped;
});

function parseSkillFrontmatter(content: string): { name: string; description: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*['"]?(.+?)['"]?\s*$/m);
  if (!nameMatch) return null;

  const descMatch = frontmatter.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);

  return {
    name: nameMatch[1].trim(),
    description: descMatch ? descMatch[1].trim() : '',
  };
}
```

Note: `fs` and `os` imports should be added at the top of the file alongside existing imports. `path` is already imported.

- [ ] **Step 2: Verify Electron main compiles**

Run: `npm run build` (or check that the Electron main process TypeScript compiles)
Expected: No compilation errors

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add scan-skills IPC handler for SKILL.md discovery"
```

---

### Task 3: Expose scanSkills in preload and type declaration

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`

- [ ] **Step 1: Add scanSkills method to aiBackend bridge**

Add after the `onFullScreenChange` method (before the closing `});` at line 62) in `electron/preload.ts`:

```typescript
  scanSkills: (platform: string, projectDir: string): Promise<any> => {
    return ipcRenderer.invoke('scan-skills', platform, projectDir);
  },
```

- [ ] **Step 2: Add scanSkills to AiBackend type declaration**

In `src/types/electron.d.ts`, add before the closing `}` of the `AiBackend` interface (line 9):

```typescript
  scanSkills(platform: string, projectDir: string): Promise<any>;
```

- [ ] **Step 3: Verify compilation**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/types/electron.d.ts
git commit -m "feat: expose scanSkills in preload bridge and type declaration"
```

---

### Task 4: Create skillScanner service

**Files:**
- Create: `src/services/skillScanner.ts`

This service provides `scanSkills(model, projectDir)` that:
- Maps model ID to platform using a lookup table
- In Electron: calls `window.aiBackend.scanSkills(platform, projectDir)`
- In browser: returns mock skills

- [ ] **Step 1: Create the service file**

```typescript
// src/services/skillScanner.ts
import { SkillInfo } from '../types';

const MODEL_TO_PLATFORM: Record<string, string> = {
  'claude-code': 'claude',
  'codex': 'codex',
  'gemini-cli': 'gemini',
};

const MOCK_SKILLS: SkillInfo[] = [
  { name: 'commit', description: 'Create a git commit with AI-generated message', filePath: 'mock', source: 'project' },
  { name: 'review-pr', description: 'Review a pull request for issues and improvements', filePath: 'mock', source: 'project' },
  { name: 'test-runner', description: 'Run project test suite and analyze failures', filePath: 'mock', source: 'user' },
  { name: 'refactor', description: 'Refactor selected code for better readability', filePath: 'mock', source: 'user' },
  { name: 'explain-code', description: 'Explain how a piece of code works', filePath: 'mock', source: 'user' },
  { name: 'fix-bug', description: 'Diagnose and fix a bug from error output', filePath: 'mock', source: 'project' },
  { name: 'create-test', description: 'Generate unit tests for a function or module', filePath: 'mock', source: 'project' },
  { name: 'doc-gen', description: 'Generate documentation for code', filePath: 'mock', source: 'user' },
];

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.aiBackend !== undefined;
}

export async function scanSkills(model: string, projectDir?: string | null): Promise<SkillInfo[]> {
  const platform = MODEL_TO_PLATFORM[model];
  if (!platform) return [];

  if (isElectron() && projectDir) {
    try {
      return await window.aiBackend.scanSkills(platform, projectDir);
    } catch (e) {
      console.warn('[skillScanner] scan failed:', e);
      return [];
    }
  }

  // Browser mock
  return MOCK_SKILLS;
}
```

- [ ] **Step 2: Verify type checking**

Run: `npm run lint`
Expected: No errors (the `AiBackend` type in `src/types/electron.d.ts` was already updated in Task 3 Step 2).

- [ ] **Step 3: Commit**

```bash
git add src/services/skillScanner.ts
git commit -m "feat: add skillScanner service with Electron and mock support"
```

---

## Chunk 2: SkillPicker Component

### Task 5: Create SkillPicker component

**Files:**
- Create: `src/components/SkillPicker.tsx`

A floating list component that:
- Receives: `skills` (filtered list), `query` (current search), `selectedIndex`, `onSelect` callback
- Renders above the input (positioned with `bottom-full`)
- Shows skill name (with matching characters highlighted) and description
- Handles keyboard events (up/down/enter/esc) via parent forwarding

- [ ] **Step 1: Create SkillPicker.tsx**

```tsx
// src/components/SkillPicker.tsx
import React, { useEffect, useRef } from 'react';
import { SkillInfo } from '../types';
import { Command } from 'lucide-react';

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-amber-300">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SkillPicker({
  skills,
  query,
  selectedIndex,
  onSelect,
}: {
  skills: SkillInfo[];
  query: string;
  selectedIndex: number;
  onSelect: (skill: SkillInfo) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-[#2A2018] border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[240px] overflow-y-auto custom-scrollbar z-50"
    >
      {skills.map((skill, i) => (
        <button
          key={skill.filePath + skill.name}
          onClick={() => onSelect(skill)}
          className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
            i === selectedIndex
              ? 'bg-white/10'
              : 'hover:bg-white/5'
          }`}
        >
          <Command size={14} className="text-gray-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">
              /{highlightMatch(skill.name, query)}
            </div>
            {skill.description && (
              <div className="text-xs text-gray-500 truncate mt-0.5">
                {skill.description}
              </div>
            )}
          </div>
          <span className="text-[10px] text-gray-600 ml-auto shrink-0 mt-0.5">
            {skill.source === 'project' ? 'project' : 'user'}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify type checking**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/SkillPicker.tsx
git commit -m "feat: add SkillPicker floating list component"
```

---

## Chunk 3: Integrate SkillPicker into SessionWindow

### Task 6: Add skill picker state and logic to SessionWindow

**Files:**
- Modify: `src/components/SessionWindow.tsx`

This is the main integration task. Changes:
1. Import `SkillPicker` and `scanSkills`
2. Add state: `skills`, `filteredSkills`, `pickerOpen`, `pickerIndex`, `selectedSkill`
3. On input change: detect `/` trigger, call `scanSkills`, filter results
4. On keyboard: intercept up/down/enter/esc when picker is open
5. On select: replace input with `/skill-name `, set selectedSkill
6. On input change after selection: clear selectedSkill if text no longer matches
7. Render SkillPicker above textarea when open
8. Render overlay for selected skill highlight

- [ ] **Step 1: Add imports**

At the top of `SessionWindow.tsx` (line 1-9 area), add:

```typescript
import { SkillPicker } from './SkillPicker';
import { scanSkills } from '../services/skillScanner';
import { SkillInfo } from '../types';
```

- [ ] **Step 2: Add skill picker state**

Inside the `SessionWindow` function, after the existing state declarations (after line 44), add:

```typescript
const [skills, setSkills] = useState<SkillInfo[]>([]);
const [filteredSkills, setFilteredSkills] = useState<SkillInfo[]>([]);
const [pickerOpen, setPickerOpen] = useState(false);
const [pickerIndex, setPickerIndex] = useState(0);
const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
```

- [ ] **Step 3: Add input change handler with skill detection**

Replace the simple `onChange` on the textarea. Create a new handler after the `handleKeyDown` function (around line 386):

Also add a ref to track the latest input value (after existing refs around line 51):

```typescript
const inputValueRef = useRef('');
const textareaRef = useRef<HTMLTextAreaElement>(null);
```

Then the handler:

```typescript
const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
  const val = e.target.value;
  setInputValue(val);
  inputValueRef.current = val;

  // Only trigger skill picker on first message
  const isFirstMessage = session.messages.length === 0;

  if (isFirstMessage && val.startsWith('/') && val.length >= 1) {
    // Load skills if not loaded yet
    let currentSkills = skills;
    if (currentSkills.length === 0) {
      currentSkills = await scanSkills(session.model, projectDir);
      // Race condition guard: discard results if input changed during async scan
      if (!inputValueRef.current.startsWith('/')) return;
      setSkills(currentSkills);
    }

    const query = val.slice(1).split(' ')[0].toLowerCase(); // text after / before first space
    const hasSelectedAndComplete = selectedSkill && val.startsWith(`/${selectedSkill} `);

    if (!hasSelectedAndComplete) {
      const filtered = query
        ? currentSkills.filter(s => s.name.toLowerCase().includes(query))
        : currentSkills;
      setFilteredSkills(filtered);
      setPickerOpen(filtered.length > 0);
      setPickerIndex(0);

      // Check if current text exactly matches a skill
      const exactMatch = currentSkills.find(s => s.name === query);
      setSelectedSkill(exactMatch ? exactMatch.name : null);
    } else {
      setPickerOpen(false);
    }
  } else {
    setPickerOpen(false);
    if (!val.startsWith('/')) {
      setSelectedSkill(null);
      setSkills([]);
    }
  }
};
```

- [ ] **Step 4: Update handleKeyDown to handle picker keyboard events**

Replace the existing `handleKeyDown` function (lines 381-386):

```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (pickerOpen && filteredSkills.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPickerIndex(i => (i + 1) % filteredSkills.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPickerIndex(i => (i - 1 + filteredSkills.length) % filteredSkills.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSkillSelect(filteredSkills[pickerIndex]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setPickerOpen(false);
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};
```

- [ ] **Step 5: Add skill selection handler**

After `handleInputChange`, add:

```typescript
const handleSkillSelect = (skill: SkillInfo) => {
  const newValue = `/${skill.name} `;
  setInputValue(newValue);
  inputValueRef.current = newValue;
  setSelectedSkill(skill.name);
  setPickerOpen(false);
  setFilteredSkills([]);
  // Re-focus textarea after mouse click selection
  textareaRef.current?.focus();
};
```

Also, in the existing `handleSend` function, after `setInputValue('')` (around line 270), add cleanup:

```typescript
setInputValue('');
inputValueRef.current = '';
setSelectedSkill(null);
setSkills([]);
setPickerOpen(false);
```

- [ ] **Step 6: Render SkillPicker and overlay in the input section**

In the JSX, find the textarea's container div (the `<div className="bg-[#9A6A45]/30 rounded-[24px]...">` at line 573). Wrap the textarea area in a `relative` container and add the SkillPicker and overlay:

Replace the textarea section (lines 573-587) with:

```tsx
<div className="bg-[#9A6A45]/30 rounded-[24px] p-2 flex flex-col gap-2 backdrop-blur-xl border border-white/10 shadow-xl focus-within:border-white/20 focus-within:ring-4 focus-within:ring-white/5 transition-all">
  <div className="relative">
    {pickerOpen && filteredSkills.length > 0 && (
      <SkillPicker
        skills={filteredSkills}
        query={inputValue.slice(1).split(' ')[0]}
        selectedIndex={pickerIndex}
        onSelect={handleSkillSelect}
      />
    )}
    {/* Overlay for selected skill highlight — must match textarea font exactly */}
    {selectedSkill && inputValue.startsWith(`/${selectedSkill}`) && (
      <div
        className="absolute inset-0 px-4 py-3 pointer-events-none whitespace-pre-wrap text-sm leading-normal"
        aria-hidden
      >
        <span className="bg-amber-500/15 text-white rounded px-0.5">/{selectedSkill}</span>
        <span className="text-transparent">{inputValue.slice(selectedSkill.length + 1)}</span>
      </div>
    )}
    <textarea
      ref={textareaRef}
      value={inputValue}
      onChange={handleInputChange}
      onKeyDown={handleKeyDown}
      placeholder="随便问..."
      rows={1}
      className={`bg-transparent border-none outline-none px-4 py-3 placeholder-gray-400 w-full resize-none min-h-[44px] max-h-[200px] relative z-10 text-sm ${
        selectedSkill && inputValue.startsWith(`/${selectedSkill}`)
          ? 'text-transparent caret-white'
          : 'text-white'
      }`}
      style={{ height: 'auto' }}
      onInput={(e) => {
        const target = e.target as HTMLTextAreaElement;
        target.style.height = 'auto';
        target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
      }}
    />
  </div>
  {/* ... rest of the bottom bar (action buttons) stays the same ... */}
```

The key changes:
- Wrap textarea in `<div className="relative">` for SkillPicker positioning
- Add SkillPicker component above textarea (renders `bottom-full` from inside relative container)
- Add overlay div: absolutely positioned, same padding/font as textarea. The `/skill-name` part gets `bg-amber-500/15` background, rest is transparent
- Textarea: when a skill is selected, text becomes transparent (`text-transparent`) so the overlay shows through, but caret stays white (`caret-white`)
- onChange handler changed from inline to `handleInputChange`

- [ ] **Step 7: Verify the app renders**

Run: `npm run dev`
Expected: App starts on port 3000, no console errors

- [ ] **Step 8: Manual test**

1. Open browser at localhost:3000
2. Create a new session (any model)
3. Type `/` in the empty session input
4. Verify: skill picker list appears above input
5. Type `/com` — verify: list filters to show `commit`
6. Press Down/Up arrows — verify: highlight moves
7. Press Enter — verify: input becomes `/commit `, picker closes, `/commit` has subtle highlight
8. Type additional text: `/commit fix login bug` — verify: highlight stays on `/commit`
9. Delete back to empty — verify: highlight and picker gone
10. Press Esc while picker is open — verify: picker closes

- [ ] **Step 9: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat: integrate SkillPicker into SessionWindow with fuzzy match and keyboard nav"
```

---

## Chunk 4: Polish and Edge Cases

### Task 7: Handle edge cases

**Files:**
- Modify: `src/components/SessionWindow.tsx`

- [ ] **Step 1: Clear skill cache when picker closes**

In `handleInputChange`, when the picker closes (input no longer starts with `/`), clear the skills cache so next `/` triggers a fresh scan:

The current code already does `setSkills([])` when `!val.startsWith('/')`. Verify this is correct.

- [ ] **Step 2: Ensure picker doesn't appear for non-first messages**

Verify: after sending a message (messages array is non-empty), typing `/` should NOT show the picker. The `isFirstMessage` check in `handleInputChange` already handles this.

- [ ] **Step 3: Ensure overlay alignment matches textarea font**

The overlay div and textarea must share the same `font-size`, `line-height`, `padding`, and `font-family`. Verify in browser DevTools that the overlay text aligns exactly with textarea text. If not, adjust the overlay's className to match.

- [ ] **Step 4: Test Enter sends message normally when picker is closed**

Verify: when picker is closed (no `/` or after skill selected), Enter key sends the message normally as before.

- [ ] **Step 5: Commit any fixes**

```bash
git add src/components/SessionWindow.tsx
git commit -m "fix: skill picker edge cases and overlay alignment"
```

(Only if there are actual changes to commit)

---

### Task 8: Final verification

- [ ] **Step 1: Run type checking**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Full manual test pass**

Test all scenarios:
1. New session → type `/` → picker appears with all mock skills
2. Type `/ref` → filters to `refactor`
3. Arrow keys navigate, Enter selects
4. Selected skill shows amber highlight in input
5. Can type args after skill name
6. Backspace to delete skill name → highlight disappears
7. Esc closes picker without changing input
8. Send message with `/commit fix login` → message sends as plain text
9. After sending, typing `/` in same session → picker does NOT appear (non-first message)
10. Different sessions work independently

- [ ] **Step 4: Commit all remaining changes**

```bash
git add src/components/SessionWindow.tsx src/components/SkillPicker.tsx src/services/skillScanner.ts
git commit -m "feat: complete slash command skill picker implementation"
```
