# Git Review Panel 重构 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有的 GitSidebar + DiffModal 重构为双面板并排推进式的 Git Review Panel，参考 VSCode Source Control 交互。

**Architecture:** 新建 `GitReviewPanel` 复合组件，内部管理 `selectedFile`/`commitMessage`/`isGeneratingCommit` 状态。App.tsx 只控制顶层开关。Source Control 面板（~350px）和 Diff 面板（剩余宽度）并排从右侧滑入。

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-14-git-review-panel-redesign.md`

---

## File Structure

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/utils/parsePatch.ts` | 解析 unified diff patch 为 side-by-side DiffRow[] |
| `src/components/git/DiffSideBySide.tsx` | Modified 文件左右对比渲染器 |
| `src/components/git/DiffNewFile.tsx` | Added 文件单栏渲染器 |
| `src/components/git/DiffDeletedFile.tsx` | Deleted 文件划线渲染器 |
| `src/components/git/DiffPanel.tsx` | 右侧 Diff 面板，根据 file.status 分发渲染器 |
| `src/components/git/SourceControlPanel.tsx` | 左侧面板：commit 区 + 文件列表 |
| `src/components/git/GitReviewPanel.tsx` | 复合组件，编排两个子面板 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/services/mockGit.ts` | 新增 Deleted 文件，3 文件覆盖 M/A/D |
| `src/App.tsx` | 替换 GitSidebar/DiffModal 为 GitReviewPanel，更新 commit/discard 状态转换 |

### 删除文件

| 文件 | 原因 |
|------|------|
| `src/components/GitSidebar.tsx` | 被 SourceControlPanel 替代 |
| `src/components/DiffModal.tsx` | 被 DiffPanel 替代 |

---

## Chunk 1: 基础工具与数据层

### Task 1: 创建 parsePatch 工具函数

**Files:**
- Create: `src/utils/parsePatch.ts`

- [ ] **Step 1: 创建 parsePatch.ts**

```typescript
// src/utils/parsePatch.ts

export interface DiffLine {
  lineNumber: number | null;
  content: string;
  type: 'normal' | 'add' | 'remove';
}

export interface DiffRow {
  old: DiffLine | null;
  new: DiffLine | null;
}

export function parsePatchToSideBySide(patch: string): DiffRow[] {
  const lines = patch.split('\n');
  const oldLines: DiffLine[] = [];
  const newLines: DiffLine[] = [];

  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10) - 1;
        newLineNum = parseInt(match[2], 10) - 1;
      }
      continue;
    }

    if (line.startsWith('-')) {
      oldLineNum++;
      oldLines.push({ lineNumber: oldLineNum, content: line.slice(1), type: 'remove' });
    } else if (line.startsWith('+')) {
      newLineNum++;
      newLines.push({ lineNumber: newLineNum, content: line.slice(1), type: 'add' });
    } else {
      // Context line (starts with space or is plain text)
      oldLineNum++;
      newLineNum++;
      const content = line.startsWith(' ') ? line.slice(1) : line;
      oldLines.push({ lineNumber: oldLineNum, content, type: 'normal' });
      newLines.push({ lineNumber: newLineNum, content, type: 'normal' });
    }
  }

  // Align into rows
  const rows: DiffRow[] = [];
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    const o = oi < oldLines.length ? oldLines[oi] : null;
    const n = ni < newLines.length ? newLines[ni] : null;

    if (o && n && o.type === 'normal' && n.type === 'normal') {
      rows.push({ old: o, new: n });
      oi++;
      ni++;
    } else if (o && o.type === 'remove') {
      // Pair remove with add if available
      if (n && n.type === 'add') {
        rows.push({ old: o, new: n });
        oi++;
        ni++;
      } else {
        rows.push({ old: o, new: null });
        oi++;
      }
    } else if (n && n.type === 'add') {
      rows.push({ old: null, new: n });
      ni++;
    } else {
      // Fallback
      rows.push({ old: o, new: n });
      if (o) oi++;
      if (n) ni++;
    }
  }

  return rows;
}

export function extractAddedLines(patch: string): DiffLine[] {
  const lines = patch.split('\n');
  const result: DiffLine[] = [];
  let lineNum = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) lineNum = parseInt(match[1], 10) - 1;
      continue;
    }
    if (line.startsWith('+')) {
      lineNum++;
      result.push({ lineNumber: lineNum, content: line.slice(1), type: 'add' });
    }
  }

  return result;
}

export function extractDeletedLines(patch: string): DiffLine[] {
  const lines = patch.split('\n');
  const result: DiffLine[] = [];
  let lineNum = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
      if (match) lineNum = parseInt(match[1], 10) - 1;
      continue;
    }
    if (line.startsWith('-')) {
      lineNum++;
      result.push({ lineNumber: lineNum, content: line.slice(1), type: 'remove' });
    }
  }

  return result;
}
```

- [ ] **Step 2: 验证类型检查通过**

Run: `npm run lint`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/utils/parsePatch.ts
git commit -m "feat: add parsePatch utility for side-by-side diff rendering"
```

### Task 2: 增强 mockGit 支持 Deleted 文件

**Files:**
- Modify: `src/services/mockGit.ts`

- [ ] **Step 1: 更新 mockGit.ts 新增 Deleted 文件**

将 `src/services/mockGit.ts` 整体替换为：

```typescript
import { GitDiff } from '../types';

export const generateMockDiff = (): GitDiff => {
  const additions = Math.floor(Math.random() * 50) + 5;
  const deletions = Math.floor(Math.random() * 20) + 5;

  return {
    totalAdditions: additions,
    totalDeletions: deletions,
    files: [
      {
        filename: 'src/App.tsx',
        status: 'M',
        additions: Math.floor(additions * 0.5),
        deletions: Math.floor(deletions * 0.4),
        patch: `@@ -15,7 +15,7 @@\n export default function App() {\n-  const [count, setCount] = useState(0);\n+  const [count, setCount] = useState(1);\n   return (\n     <div>\n-      <p>Count: {count}</p>\n+      <p>Current Count: {count}</p>\n     </div>\n   );\n }`
      },
      {
        filename: 'src/utils/helpers.ts',
        status: 'A',
        additions: Math.floor(additions * 0.3),
        deletions: 0,
        patch: `@@ -0,0 +1,5 @@\n+export const add = (a: number, b: number) => {\n+  return a + b;\n+};\n+\n+export const subtract = (a: number, b: number) => a - b;`
      },
      {
        filename: 'src/legacy/old-api.ts',
        status: 'D',
        additions: 0,
        deletions: Math.floor(deletions * 0.6),
        patch: `@@ -1,6 +0,0 @@\n-import { OldClient } from './client';\n-\n-export async function fetchLegacyData() {\n-  const client = new OldClient();\n-  return client.get('/api/v1/data');\n-}`
      }
    ]
  };
};
```

- [ ] **Step 2: 验证类型检查通过**

Run: `npm run lint`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/services/mockGit.ts
git commit -m "feat: enhance mockGit to generate M/A/D file types"
```

---

## Chunk 2: Diff 渲染组件

### Task 3: 创建 DiffSideBySide 组件

**Files:**
- Create: `src/components/git/DiffSideBySide.tsx`

- [ ] **Step 1: 创建组件**

```typescript
import React from 'react';
import { FileDiff } from '../../types';
import { parsePatchToSideBySide, DiffRow } from '../../utils/parsePatch';

interface DiffSideBySideProps {
  file: FileDiff;
}

export function DiffSideBySide({ file }: DiffSideBySideProps) {
  const rows = parsePatchToSideBySide(file.patch);

  const renderLine = (line: { lineNumber: number | null; content: string; type: 'normal' | 'add' | 'remove' } | null) => {
    if (!line) {
      return (
        <div className="px-3 py-0.5 min-h-[1.8em] bg-white/[0.02]">
          <span className="text-transparent select-none mr-3 inline-block w-8 text-right font-mono text-xs">&nbsp;</span>
        </div>
      );
    }

    const bgColor = line.type === 'remove'
      ? 'bg-red-500/10'
      : line.type === 'add'
        ? 'bg-green-500/10'
        : 'bg-transparent';

    const textColor = line.type === 'remove'
      ? 'text-red-300'
      : line.type === 'add'
        ? 'text-green-300'
        : 'text-gray-400';

    return (
      <div className={`px-3 py-0.5 min-h-[1.8em] ${bgColor}`}>
        <span className="text-gray-600 select-none mr-3 inline-block w-8 text-right font-mono text-xs">
          {line.lineNumber ?? ''}
        </span>
        <span className={`font-mono text-xs ${textColor} whitespace-pre`}>{line.content}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-1 overflow-auto custom-scrollbar">
      {/* Old file */}
      <div className="flex-1 border-r border-white/[0.06] min-w-0">
        <div className="px-3 py-1.5 bg-black/20 text-gray-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06] sticky top-0">
          Original
        </div>
        <div>
          {rows.map((row, idx) => (
            <React.Fragment key={idx}>{renderLine(row.old)}</React.Fragment>
          ))}
        </div>
      </div>
      {/* New file */}
      <div className="flex-1 min-w-0">
        <div className="px-3 py-1.5 bg-black/20 text-gray-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06] sticky top-0">
          Modified
        </div>
        <div>
          {rows.map((row, idx) => (
            <React.Fragment key={idx}>{renderLine(row.new)}</React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npm run lint`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/components/git/DiffSideBySide.tsx
git commit -m "feat: add DiffSideBySide component for modified file diff"
```

### Task 4: 创建 DiffNewFile 组件

**Files:**
- Create: `src/components/git/DiffNewFile.tsx`

- [ ] **Step 1: 创建组件**

```typescript
import React from 'react';
import { FileDiff } from '../../types';
import { extractAddedLines } from '../../utils/parsePatch';

interface DiffNewFileProps {
  file: FileDiff;
}

export function DiffNewFile({ file }: DiffNewFileProps) {
  const lines = extractAddedLines(file.patch);

  return (
    <div className="flex-1 overflow-auto custom-scrollbar">
      <div className="px-3 py-1.5 bg-black/20 text-gray-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06] sticky top-0">
        New File
      </div>
      <div className="bg-green-500/[0.03]">
        {lines.map((line, idx) => (
          <div key={idx} className="px-3 py-0.5 min-h-[1.8em] bg-green-500/[0.08]">
            <span className="text-gray-600 select-none mr-3 inline-block w-8 text-right font-mono text-xs">
              {line.lineNumber}
            </span>
            <span className="font-mono text-xs text-green-300 whitespace-pre">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npm run lint`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/components/git/DiffNewFile.tsx
git commit -m "feat: add DiffNewFile component for added file display"
```

### Task 5: 创建 DiffDeletedFile 组件

**Files:**
- Create: `src/components/git/DiffDeletedFile.tsx`

- [ ] **Step 1: 创建组件**

```typescript
import React from 'react';
import { FileDiff } from '../../types';
import { extractDeletedLines } from '../../utils/parsePatch';

interface DiffDeletedFileProps {
  file: FileDiff;
}

export function DiffDeletedFile({ file }: DiffDeletedFileProps) {
  const lines = extractDeletedLines(file.patch);

  return (
    <div className="flex-1 overflow-auto custom-scrollbar">
      <div className="px-3 py-1.5 bg-black/20 text-gray-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06] sticky top-0">
        Deleted File
      </div>
      <div className="bg-red-500/[0.03]">
        {lines.map((line, idx) => (
          <div key={idx} className="px-3 py-0.5 min-h-[1.8em] bg-red-500/[0.08]">
            <span className="text-gray-600 select-none mr-3 inline-block w-8 text-right font-mono text-xs" style={{ textDecoration: 'none' }}>
              {line.lineNumber}
            </span>
            <span className="font-mono text-xs text-red-300 whitespace-pre line-through decoration-red-500/40">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npm run lint`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/components/git/DiffDeletedFile.tsx
git commit -m "feat: add DiffDeletedFile component with strikethrough display"
```

### Task 6: 创建 DiffPanel 分发组件

**Files:**
- Create: `src/components/git/DiffPanel.tsx`

- [ ] **Step 1: 创建组件**

```typescript
import React from 'react';
import { X } from 'lucide-react';
import { FileDiff } from '../../types';
import { DiffSideBySide } from './DiffSideBySide';
import { DiffNewFile } from './DiffNewFile';
import { DiffDeletedFile } from './DiffDeletedFile';

interface DiffPanelProps {
  file: FileDiff;
  onClose: () => void;
}

export function DiffPanel({ file, onClose }: DiffPanelProps) {
  const statusLabel = file.status === 'M' ? 'MODIFIED' : file.status === 'A' ? 'ADDED' : 'DELETED';
  const statusColor = file.status === 'M'
    ? 'bg-yellow-500/15 text-yellow-400'
    : file.status === 'A'
      ? 'bg-green-500/15 text-green-400'
      : 'bg-red-500/15 text-red-400';

  return (
    <div className="flex flex-col h-full bg-[#2B2D3A]/95 backdrop-blur-2xl border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white text-sm font-medium truncate">{file.filename}</span>
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold flex-shrink-0 ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Diff Content */}
      {file.status === 'M' && <DiffSideBySide file={file} />}
      {file.status === 'A' && <DiffNewFile file={file} />}
      {file.status === 'D' && <DiffDeletedFile file={file} />}
    </div>
  );
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npm run lint`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/components/git/DiffPanel.tsx
git commit -m "feat: add DiffPanel dispatcher for M/A/D file types"
```

---

## Chunk 3: Source Control 面板与复合组件

### Task 7: 创建 SourceControlPanel 组件

**Files:**
- Create: `src/components/git/SourceControlPanel.tsx`

- [ ] **Step 1: 创建组件**

```typescript
import React from 'react';
import { X, Check, Trash2, FileText, Sparkles, Loader2 } from 'lucide-react';
import { Session, FileDiff } from '../../types';

interface SourceControlPanelProps {
  session: Session;
  commitMessage: string;
  onCommitMessageChange: (msg: string) => void;
  onCommit: () => void;
  onDiscard: () => void;
  onClose: () => void;
  onSelectFile: (file: FileDiff) => void;
  selectedFile: FileDiff | null;
  onGenerateCommitMessage: () => void;
  isGeneratingCommit: boolean;
}

export function SourceControlPanel({
  session,
  commitMessage,
  onCommitMessageChange,
  onCommit,
  onDiscard,
  onClose,
  onSelectFile,
  selectedFile,
  onGenerateCommitMessage,
  isGeneratingCommit,
}: SourceControlPanelProps) {
  const diff = session.diff;
  if (!diff) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && commitMessage.trim()) {
      e.preventDefault();
      onCommit();
    }
  };

  return (
    <div className="w-[350px] flex-shrink-0 flex flex-col h-full bg-[#2B2D3A]/95 backdrop-blur-2xl border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Source Control</h2>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Commit area */}
      <div className="p-4 border-b border-white/10 space-y-3 bg-black/10">
        <div className="relative">
          <textarea
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message (⌘Enter to commit)"
            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 pr-10 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10 transition-all resize-none h-20 custom-scrollbar"
          />
          <button
            onClick={onGenerateCommitMessage}
            disabled={isGeneratingCommit}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 flex items-center justify-center border border-purple-500/30 transition-colors"
            title="AI Generate Commit Message"
          >
            {isGeneratingCommit ? (
              <Loader2 size={13} className="text-purple-400 animate-spin" />
            ) : (
              <Sparkles size={13} className="text-purple-400" />
            )}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCommit}
            disabled={!commitMessage.trim()}
            className="flex-1 bg-blue-600/80 hover:bg-blue-600 disabled:bg-white/5 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-blue-500/50 disabled:border-transparent shadow-lg shadow-blue-900/20 disabled:shadow-none"
          >
            <Check size={14} />
            Commit
          </button>
          <button
            onClick={onDiscard}
            className="px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-medium flex items-center justify-center transition-colors border border-red-500/20"
            title="Discard All Changes"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-4 py-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider flex items-center justify-between">
          <span>Changes</span>
          <span className="bg-white/10 text-gray-300 px-2 py-0.5 rounded-full text-[10px]">{diff.files.length}</span>
        </div>
        <div className="px-2 space-y-0.5">
          {diff.files.map((file, idx) => {
            const isSelected = selectedFile?.filename === file.filename;
            return (
              <div
                key={idx}
                onClick={() => onSelectFile(file)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer group transition-colors ${
                  isSelected ? 'bg-white/[0.08]' : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <FileText size={14} className="text-gray-500 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                  <span className={`text-sm truncate transition-colors ${isSelected ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                    {file.filename}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {file.additions > 0 && (
                    <span className="text-green-400 text-[11px] font-mono">+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-red-400 text-[11px] font-mono">-{file.deletions}</span>
                  )}
                  <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                    file.status === 'M' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                    file.status === 'A' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                    'bg-red-500/10 text-red-500 border border-red-500/20'
                  }`}>
                    {file.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npm run lint`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/components/git/SourceControlPanel.tsx
git commit -m "feat: add SourceControlPanel with commit area and file list"
```

### Task 8: 创建 GitReviewPanel 复合组件

**Files:**
- Create: `src/components/git/GitReviewPanel.tsx`

- [ ] **Step 1: 创建组件**

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import { Session, FileDiff, GitDiff } from '../../types';
import { SourceControlPanel } from './SourceControlPanel';
import { DiffPanel } from './DiffPanel';

interface GitReviewPanelProps {
  isOpen: boolean;
  session: Session | null;
  onClose: () => void;
  onCommit: (message: string) => void;
  onDiscard: () => void;
}

function generateCommitMessage(diff: GitDiff): string {
  const parts = diff.files.map(file => {
    const name = file.filename.split('/').pop() || file.filename;
    if (file.status === 'M') return `update ${name} (+${file.additions} -${file.deletions})`;
    if (file.status === 'A') return `add ${name} (+${file.additions})`;
    return `remove ${name} (-${file.deletions})`;
  });

  const prefix = diff.files.some(f => f.status === 'D') ? 'refactor' :
                 diff.files.some(f => f.status === 'A') ? 'feat' : 'fix';

  return `${prefix}: ${parts.join(', ')}`;
}

export function GitReviewPanel({ isOpen, session, onClose, onCommit, onDiscard }: GitReviewPanelProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileDiff | null>(null);
  const [isGeneratingCommit, setIsGeneratingCommit] = useState(false);
  const [cachedSession, setCachedSession] = useState<Session | null>(null);

  // Cache session for close animation
  useEffect(() => {
    if (isOpen && session && session.diff) {
      setCachedSession(session);
    }
  }, [isOpen, session]);

  // Clear selected file when panel closes
  useEffect(() => {
    if (!isOpen) {
      // Delay clearing to allow animation
      const timer = setTimeout(() => {
        setSelectedFile(null);
        setCommitMessage('');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const displaySession = (isOpen && session?.diff) ? session : cachedSession;

  const handleCommit = useCallback(() => {
    if (commitMessage.trim()) {
      onCommit(commitMessage);
      setCommitMessage('');
    }
  }, [commitMessage, onCommit]);

  const handleGenerateCommitMessage = useCallback(async () => {
    if (!displaySession?.diff) return;
    setIsGeneratingCommit(true);
    // Simulate AI generation delay
    await new Promise(resolve => setTimeout(resolve, 500));
    const msg = generateCommitMessage(displaySession.diff);
    setCommitMessage(msg);
    setIsGeneratingCommit(false);
  }, [displaySession]);

  const handleSelectFile = useCallback((file: FileDiff) => {
    setSelectedFile(prev => prev?.filename === file.filename ? null : file);
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel container */}
      <div className={`fixed inset-y-0 right-0 z-50 flex transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Diff Panel (left side, only when file selected) */}
        <div className={`transition-all duration-300 ease-out overflow-hidden ${
          selectedFile ? 'w-[calc(100vw-350px-350px)] min-w-[400px]' : 'w-0'
        }`}>
          {selectedFile && (
            <DiffPanel file={selectedFile} onClose={() => setSelectedFile(null)} />
          )}
        </div>

        {/* Source Control Panel (right side, always visible when open) */}
        {displaySession && displaySession.diff && (
          <SourceControlPanel
            session={displaySession}
            commitMessage={commitMessage}
            onCommitMessageChange={setCommitMessage}
            onCommit={handleCommit}
            onDiscard={onDiscard}
            onClose={onClose}
            onSelectFile={handleSelectFile}
            selectedFile={selectedFile}
            onGenerateCommitMessage={handleGenerateCommitMessage}
            isGeneratingCommit={isGeneratingCommit}
          />
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npm run lint`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/components/git/GitReviewPanel.tsx
git commit -m "feat: add GitReviewPanel compound component with dual-panel layout"
```

---

## Chunk 4: 集成与清理

### Task 9: 更新 App.tsx 集成 GitReviewPanel

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 更新 App.tsx**

对 `src/App.tsx` 做以下修改：

1. **替换 imports**（第 6-14 行区域）：
   - 删除: `import { GitSidebar } from './components/GitSidebar';`
   - 删除: `import { DiffModal } from './components/DiffModal';`
   - 新增: `import { GitReviewPanel } from './components/git/GitReviewPanel';`
   - 从 types import 中移除 `FileDiff`（不再需要）

2. **删除状态**（第 25 行）：
   - 删除: `const [viewingFileDiff, setViewingFileDiff] = useState<FileDiff | null>(null);`

3. **更新 handleCommit**（第 49-56 行）：
   ```typescript
   const handleCommit = (message: string) => {
     if (reviewSessionId) {
       setSessions(sessions.map(s =>
         s.id === reviewSessionId ? { ...s, diff: null, status: 'done' as const } : s
       ));
       setReviewSessionId(null);
     }
   };
   ```

4. **更新 handleDiscard**（第 58-65 行）：
   ```typescript
   const handleDiscard = () => {
     if (reviewSessionId) {
       setSessions(sessions.map(s =>
         s.id === reviewSessionId ? { ...s, diff: null, status: 'inprocess' as const } : s
       ));
       setReviewSessionId(null);
     }
   };
   ```

5. **替换 GitSidebar + DiffModal 渲染**（第 122-136 行区域）：

   删除整个 `<GitSidebar ... />` 和 `{viewingFileDiff && (<DiffModal ... />)}` 块。

   替换为：
   ```tsx
   <GitReviewPanel
     isOpen={!!reviewSessionId}
     session={reviewSession}
     onClose={() => setReviewSessionId(null)}
     onCommit={handleCommit}
     onDiscard={handleDiscard}
   />
   ```

- [ ] **Step 2: 验证类型检查**

Run: `npm run lint`
Expected: 无类型错误

- [ ] **Step 3: 验证 dev server 编译通过**

Run: `npm run dev`
Expected: 编译成功，无错误

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: integrate GitReviewPanel, update commit/discard status transitions"
```

### Task 10: 删除旧组件

**Files:**
- Delete: `src/components/GitSidebar.tsx`
- Delete: `src/components/DiffModal.tsx`

- [ ] **Step 1: 删除旧文件**

```bash
git rm src/components/GitSidebar.tsx src/components/DiffModal.tsx
```

- [ ] **Step 2: 验证无残留引用**

Run: `npm run lint`
Expected: 无类型错误（所有 import 已在 Task 9 中更新）

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove deprecated GitSidebar and DiffModal components"
```

### Task 11: 端到端手动验证

- [ ] **Step 1: 启动 dev server 并验证完整流程**

Run: `npm run dev`

手动验证清单：
1. 创建或使用已有 session，发送消息触发 AI 回复
2. AI 回复完成后，确认 Review 按钮出现（含 +/- 统计）
3. 点击 Review → Source Control 面板从右侧滑入
4. 确认文件列表显示 3 个文件：M (yellow), A (green), D (red)，每个文件有 ± 行数
5. 点击 Modified 文件 → Diff Panel 从左侧滑入，side-by-side 对比显示正确
6. 点击 Added 文件 → Diff Panel 切换为单栏绿色新文件视图
7. 点击 Deleted 文件 → Diff Panel 切换为单栏红色划线视图
8. 关闭 Diff Panel（X 按钮）→ 只关 Diff，Source Control 保持
9. 点击 AI ✦ 按钮 → commit message 自动生成并填入输入框
10. 输入/修改 commit message → 点击 Commit → 面板关闭，session 状态变为 done
11. 重新测试 Discard → 面板关闭，session 状态变为 inprocess
12. 点击背景遮罩 → 全部面板关闭
13. Cmd/Ctrl+Enter 快捷键 → 提交 commit

- [ ] **Step 2: 验证 production build**

Run: `npm run build`
Expected: 构建成功，无错误

- [ ] **Step 3: 最终 commit（如有微调）**

```bash
git add -A
git commit -m "fix: address manual testing feedback for GitReviewPanel"
```
