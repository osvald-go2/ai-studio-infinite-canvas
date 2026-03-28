# Session Files Summary Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible file changes summary panel at the bottom of each chat session, showing modified files with +/- line counts and navigation to GitPanel tabs.

**Architecture:** Extend `FileChangeItem` type with optional `additions`/`deletions` fields. Create a new `SessionFilesSummary` component that aggregates file_changes blocks from all messages. Wire navigation callbacks through SessionWindow → App → GitPanel to enable cross-panel file/diff navigation.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, motion (framer-motion)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add `additions?` and `deletions?` to `FileChangeItem` |
| `src/utils/mockResponses.ts` | Modify | Add `additions`/`deletions` values to mock `file_changes` data |
| `src/components/message/SessionFilesSummary.tsx` | Create | Collapsible summary panel component |
| `src/components/SessionWindow.tsx` | Modify | Insert `SessionFilesSummary`, accept + pass navigation callbacks |
| `src/App.tsx` | Modify | Add GitPanel navigation state + handler functions, pass to SessionWindow |
| `src/components/git/GitPanel.tsx` | Modify | Accept external `activeTab` + `selectedFile` props, sync internal state |
| `src/components/git/FilesTab.tsx` | Modify | Accept external `selectedFile` prop, auto-select file on change |
| `src/components/git/ChangesTab.tsx` | Modify | Accept external `selectedFile` prop, auto-open diff on change |

---

### Task 1: Extend FileChangeItem type

**Files:**
- Modify: `src/types.ts:21-24`

- [ ] **Step 1: Add additions/deletions fields to FileChangeItem**

In `src/types.ts`, update the `FileChangeItem` interface:

```typescript
export interface FileChangeItem {
  path: string;
  status: 'new' | 'modified' | 'deleted' | 'renamed';
  additions?: number;
  deletions?: number;
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add additions/deletions fields to FileChangeItem"
```

---

### Task 2: Update mock data with additions/deletions

**Files:**
- Modify: `src/utils/mockResponses.ts:71-77`

- [ ] **Step 1: Add additions/deletions to mock file_changes**

Update the `file_changes` block in `mockResponses.ts`:

```typescript
{ type: 'file_changes', title: '文件差异', files: [
  { path: 'src/components/Feature.tsx', status: 'new', additions: 42, deletions: 0 },
  { path: 'src/components/App.tsx', status: 'modified', additions: 12, deletions: 3 },
  { path: 'src/utils/memoHelper.ts', status: 'new', additions: 28, deletions: 0 },
  { path: 'src/types.ts', status: 'modified', additions: 5, deletions: 1 },
  { path: 'src/legacy/OldFeature.tsx', status: 'deleted', additions: 0, deletions: 45 },
]},
```

- [ ] **Step 2: Verify type check passes**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/mockResponses.ts
git commit -m "feat: add additions/deletions to mock file_changes data"
```

---

### Task 3: Create SessionFilesSummary component

**Files:**
- Create: `src/components/message/SessionFilesSummary.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/message/SessionFilesSummary.tsx`:

```tsx
import React, { useState, useMemo } from 'react';
import { FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Message, FileChangeItem } from '../../types';

interface SessionFilesSummaryProps {
  messages: Message[];
  onNavigateToFile: (path: string) => void;
  onNavigateToDiff: (path: string) => void;
}

const STATUS_DOT: Record<FileChangeItem['status'], string> = {
  new: 'bg-emerald-400',
  modified: 'bg-amber-400',
  deleted: 'bg-red-400',
  renamed: 'bg-blue-400',
};

export function SessionFilesSummary({ messages, onNavigateToFile, onNavigateToDiff }: SessionFilesSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  // Aggregate all file_changes blocks, dedup by path (last wins)
  const files = useMemo(() => {
    const fileMap = new Map<string, FileChangeItem>();
    for (const msg of messages) {
      if (msg.role !== 'assistant' || !msg.blocks) continue;
      for (const block of msg.blocks) {
        if (block.type === 'file_changes') {
          for (const file of block.files) {
            fileMap.set(file.path, file);
          }
        }
      }
    }
    return Array.from(fileMap.values());
  }, [messages]);

  if (files.length === 0) return null;

  return (
    <div className="mx-1 mb-2 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
        aria-expanded={expanded}
      >
        <FileText size={14} className="text-zinc-400 shrink-0" />
        <span className="text-xs font-medium text-zinc-400 flex-1">
          {files.length} 个文件已修改
        </span>
        {expanded
          ? <ChevronDown size={14} className="text-zinc-500" />
          : <ChevronRight size={14} className="text-zinc-500" />
        }
      </button>

      {/* Expandable file list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-0.5">
              {files.map((file) => (
                <div key={file.path} className="flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-white/[0.03] transition-colors">
                  {/* Status dot */}
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[file.status]}`} />

                  {/* File path — click navigates to Files tab */}
                  <button
                    type="button"
                    onClick={() => onNavigateToFile(file.path)}
                    className="text-[13px] text-zinc-300 hover:text-white truncate text-left min-w-0 flex-1 cursor-pointer transition-colors"
                    title={file.path}
                  >
                    {file.path}
                  </button>

                  {/* +/- counts — click navigates to Changes tab */}
                  <button
                    type="button"
                    onClick={() => onNavigateToDiff(file.path)}
                    className="flex items-center gap-1.5 shrink-0 font-mono text-[12px] cursor-pointer hover:bg-white/[0.06] rounded px-1.5 py-0.5 transition-colors"
                  >
                    {(file.additions ?? 0) > 0 && (
                      <span className="text-emerald-400 font-medium">+{file.additions}</span>
                    )}
                    {(file.deletions ?? 0) > 0 && (
                      <span className="text-red-400 font-medium">-{file.deletions}</span>
                    )}
                    {(file.additions ?? 0) === 0 && (file.deletions ?? 0) === 0 && (
                      <span className="text-zinc-500">0</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/message/SessionFilesSummary.tsx
git commit -m "feat: create SessionFilesSummary component"
```

---

### Task 4: Integrate SessionFilesSummary into SessionWindow

**Files:**
- Modify: `src/components/SessionWindow.tsx:3` (import)
- Modify: `src/components/SessionWindow.tsx:19-44` (props)
- Modify: `src/components/SessionWindow.tsx:1243-1253` (insert component between messages and input)

- [ ] **Step 1: Add import**

At the top of `SessionWindow.tsx`, add import:

```typescript
import { SessionFilesSummary } from './message/SessionFilesSummary';
```

- [ ] **Step 2: Add new props to SessionWindow**

Add two new optional props to the component signature:

```typescript
onOpenFileInPanel?: (path: string) => void,
onOpenDiffInPanel?: (path: string) => void
```

- [ ] **Step 3: Insert SessionFilesSummary after messages, before input**

After the `</div>` that closes the messages `space-y-6` container (around line 1244), before the streaming indicator's `</div>` closing the scroll area (around line 1253), insert:

```tsx
<SessionFilesSummary
  messages={session.messages}
  onNavigateToFile={(path) => onOpenFileInPanel?.(path)}
  onNavigateToDiff={(path) => onOpenDiffInPanel?.(path)}
/>
```

The insertion point is inside the scroll container, after the messages list and streaming indicator, before the scroll container's closing `</div>`.

- [ ] **Step 4: Verify type check passes**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat: integrate SessionFilesSummary into SessionWindow"
```

---

### Task 5: Add GitPanel navigation state and handlers to App.tsx

**Files:**
- Modify: `src/App.tsx:138` (add state)
- Modify: `src/App.tsx:714-737` (pass props to views)
- Modify: `src/App.tsx:747-751` (pass props to GitPanel)

- [ ] **Step 1: Add navigation state variables**

Near `showGitPanel` state (line 138), add:

```typescript
const [gitPanelActiveTab, setGitPanelActiveTab] = useState<'changes' | 'git' | 'files' | null>(null);
const [gitPanelSelectedFile, setGitPanelSelectedFile] = useState<string | null>(null);
```

- [ ] **Step 2: Create handler functions**

Add two handler functions:

```typescript
const handleOpenFileInPanel = useCallback((path: string) => {
  setShowGitPanel(true);
  setGitPanelActiveTab('files');
  setGitPanelSelectedFile(path);
}, []);

const handleOpenDiffInPanel = useCallback((path: string) => {
  setShowGitPanel(true);
  setGitPanelActiveTab('changes');
  setGitPanelSelectedFile(path);
}, []);
```

- [ ] **Step 3: Pass handlers through to SessionWindow**

The views (CanvasView, BoardView, TabView) render SessionWindow internally. Add `onOpenFileInPanel` and `onOpenDiffInPanel` to each view's props, and have them pass through to SessionWindow.

For each of the three views, add these props:

```tsx
onOpenFileInPanel={handleOpenFileInPanel}
onOpenDiffInPanel={handleOpenDiffInPanel}
```

- [ ] **Step 4: Pass navigation props to GitPanel**

Update the GitPanel usage:

```tsx
<GitPanel
  isOpen={showGitPanel}
  onClose={() => setShowGitPanel(false)}
  onOpenDiff={(filePath) => setReviewFilePath(filePath)}
  activeTab={gitPanelActiveTab}
  selectedFile={gitPanelSelectedFile}
  onTabConsumed={() => { setGitPanelActiveTab(null); setGitPanelSelectedFile(null); }}
/>
```

- [ ] **Step 5: Verify type check passes**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add GitPanel navigation state and handlers in App"
```

---

### Task 6: Pass navigation props through view components

**Files:**
- Modify: `src/components/CanvasView.tsx` (add props, pass to SessionWindow)
- Modify: `src/components/BoardView.tsx` (add props, pass to SessionWindow)
- Modify: `src/components/TabView.tsx` (add props, pass to SessionWindow)

- [ ] **Step 1: Update CanvasView**

Add `onOpenFileInPanel` and `onOpenDiffInPanel` to CanvasView's props interface. Pass them through to each `<SessionWindow>` rendered inside.

- [ ] **Step 2: Update BoardView**

Same pattern as CanvasView.

- [ ] **Step 3: Update TabView**

Same pattern as CanvasView.

- [ ] **Step 4: Verify type check passes**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/CanvasView.tsx src/components/BoardView.tsx src/components/TabView.tsx
git commit -m "feat: pass navigation callbacks through view components to SessionWindow"
```

---

### Task 7: Add external control props to GitPanel

**Files:**
- Modify: `src/components/git/GitPanel.tsx:9-15` (props interface)
- Modify: `src/components/git/GitPanel.tsx:21-28` (destructure + useEffect)

- [ ] **Step 1: Extend GitPanelProps**

```typescript
export interface GitPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDiff?: (filePath: string) => void;
  activeTab?: 'changes' | 'git' | 'files' | null;
  selectedFile?: string | null;
  onTabConsumed?: () => void;
}
```

- [ ] **Step 2: Add useEffect to respond to external tab/file changes**

Inside the component, after existing state declarations:

```typescript
useEffect(() => {
  if (activeTab) {
    setActiveTab(activeTab);
  }
}, [activeTab]);
```

- [ ] **Step 3: Pass selectedFile to child tabs**

Update the content rendering section:

```tsx
{activeTab === 'changes' && <ChangesTab onOpenDiff={onOpenDiff} selectedFile={selectedFile} onFileConsumed={onTabConsumed} />}
{activeTab === 'git' && <GitTab />}
{activeTab === 'files' && <FilesTab selectedFile={selectedFile} onFileConsumed={onTabConsumed} />}
```

Note: We use the local `activeTab` state (which gets synced from the prop via useEffect) for rendering.

- [ ] **Step 4: Verify type check passes**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/git/GitPanel.tsx
git commit -m "feat: add external activeTab/selectedFile control to GitPanel"
```

---

### Task 8: Add external file selection to FilesTab

**Files:**
- Modify: `src/components/git/FilesTab.tsx:90` (props)
- Modify: `src/components/git/FilesTab.tsx:90-100` (useEffect for external selection)

- [ ] **Step 1: Add selectedFile prop and useEffect**

Update the component signature and add a useEffect:

```typescript
export function FilesTab({ selectedFile: externalFile, onFileConsumed }: { selectedFile?: string | null; onFileConsumed?: () => void }) {
```

Add useEffect to auto-select file when externalFile changes:

```typescript
useEffect(() => {
  if (externalFile) {
    handleSelectFile(externalFile);
    onFileConsumed?.();
  }
}, [externalFile]);
```

- [ ] **Step 2: Verify type check passes**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/git/FilesTab.tsx
git commit -m "feat: add external file selection to FilesTab"
```

---

### Task 9: Add external file selection to ChangesTab

**Files:**
- Modify: `src/components/git/ChangesTab.tsx:9-11` (props)
- Modify: `src/components/git/ChangesTab.tsx:97-100` (useEffect)

- [ ] **Step 1: Add selectedFile prop and useEffect**

Update the props interface:

```typescript
export interface ChangesTabProps {
  onOpenDiff?: (filePath: string) => void;
  selectedFile?: string | null;
  onFileConsumed?: () => void;
}
```

Add useEffect to auto-open diff when selectedFile changes:

```typescript
useEffect(() => {
  if (selectedFile) {
    const change = changes.find(c => c.path === selectedFile);
    if (change) {
      openDiff(change);
    }
    onFileConsumed?.();
  }
}, [selectedFile]);
```

- [ ] **Step 2: Verify type check passes**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/git/ChangesTab.tsx
git commit -m "feat: add external file selection to ChangesTab"
```

---

### Task 10: Visual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify collapsible panel**

1. Open any session that has mock data (session with `file_changes` blocks)
2. Verify the "N 个文件已修改" collapsed bar appears at the bottom of the messages
3. Click to expand — verify file list shows with status dots and +/- counts
4. Click to collapse — verify smooth animation

- [ ] **Step 3: Verify file navigation**

1. Click a file path → GitPanel should open with Files tab active, showing that file's content
2. Click +/- numbers → GitPanel should open with Changes tab active, showing that file's diff

- [ ] **Step 4: Verify edge cases**

1. Session with no `file_changes` blocks → panel should not appear
2. Multiple messages with overlapping files → dedup should work (last wins)
3. Panel should not appear when collapsed height ≤ 110px

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: session files summary — collapsible file changes panel with GitPanel navigation"
```
