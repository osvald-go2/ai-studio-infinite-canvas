# Git Full Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all git functionality by fixing data connections, adding GitProvider Context, backend fs watch, FilesTab file tree, and cleaning up dead code.

**Architecture:** Introduce `GitProvider` React Context wrapping all git state and actions. Backend adds `notify`-based fs watcher pushing events through the existing sidecar event pipeline. Components migrate from direct `gitService` calls to `useGit()` hook. Browser mode uses structured mock data.

**Tech Stack:** React 19 + TypeScript + Vite, Rust backend (tokio + notify crate), Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-15-git-full-implementation-design.md`

---

## Chunk 1: Foundation — Types, Mock Data, Service Layer

### Task 1: Add TreeNode type to git types

**Files:**
- Modify: `src/types/git.ts`

- [ ] **Step 1: Add TreeNode type**

Add after the existing types at the end of the file:

```typescript
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}
```

- [ ] **Step 2: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/types/git.ts
git commit -m "feat(git): add TreeNode type for file tree browser"
```

---

### Task 2: Create mock git data for browser mode

**Files:**
- Create: `src/services/mockGitData.ts`
- Reference: `src/components/git/SourceControlPanel.tsx` (lines 14-25 for existing MOCK_COMMITS)
- Reference: `src/services/mockGit.ts` (for existing mock diff patterns)

- [ ] **Step 1: Create mockGitData.ts**

This file consolidates all mock data from `SourceControlPanel.tsx` MOCK_COMMITS and `mockGit.ts` into a single source. The data serves the browser demo experience.

```typescript
import type {
  GitInfo,
  FileChange,
  BranchInfo,
  WorktreeInfo,
  CommitInfo,
  TreeNode,
  DiffOutput,
} from '../types/git';

export const mockGitInfo: GitInfo = {
  branch: 'main',
  commit_hash: 'a1b2c3d',
  commit_message: 'feat: add AI commit message generation',
  ahead: 0,
  behind: 0,
  has_upstream: true,
};

export const mockChanges: FileChange[] = [
  { path: 'src/App.tsx', status: 'M', additions: 12, deletions: 3 },
  { path: 'src/utils/helpers.ts', status: 'M', additions: 5, deletions: 8 },
  { path: 'src/components/NewFeature.tsx', status: 'A', additions: 45, deletions: 0 },
];

export const mockBranches: BranchInfo[] = [
  { name: 'main', is_current: true, is_remote: false, last_commit_time: '2 hours ago', ahead: 0, behind: 0 },
  { name: 'feat/git-panel', is_current: false, is_remote: false, last_commit_time: '1 day ago', ahead: 3, behind: 0 },
  { name: 'origin/main', is_current: false, is_remote: true, last_commit_time: '2 hours ago', ahead: 0, behind: 0 },
];

export const mockWorktrees: WorktreeInfo[] = [];

export const mockLog: CommitInfo[] = [
  {
    hash: 'a1b2c3d',
    message: 'feat: add AI commit message generation',
    author: 'Developer',
    date: '2 hours ago',
    branches: ['main'],
    files: [
      { path: 'src/services/git.ts', status: 'M' },
      { path: 'src/components/git/CommitSection.tsx', status: 'M' },
    ],
  },
  {
    hash: 'e4f5g6h',
    message: 'fix: resolve diff view scroll issue',
    author: 'Developer',
    date: '5 hours ago',
    branches: [],
    files: [
      { path: 'src/components/git/DiffView.tsx', status: 'M' },
    ],
  },
  {
    hash: 'i7j8k9l',
    message: 'feat: add worktree management UI',
    author: 'Developer',
    date: '1 day ago',
    branches: [],
    files: [
      { path: 'src/components/git/GitTab.tsx', status: 'M' },
      { path: 'src/components/git/MergeDialog.tsx', status: 'A' },
    ],
  },
  {
    hash: 'm0n1o2p',
    message: 'refactor: extract git service layer',
    author: 'Developer',
    date: '2 days ago',
    branches: [],
    files: [
      { path: 'src/services/git.ts', status: 'A' },
    ],
  },
  {
    hash: 'q3r4s5t',
    message: 'feat: initial git panel implementation',
    author: 'Developer',
    date: '3 days ago',
    branches: [],
    files: [
      { path: 'src/components/git/GitPanel.tsx', status: 'A' },
      { path: 'src/components/git/ChangesTab.tsx', status: 'A' },
    ],
  },
];

export const mockFileTree: TreeNode[] = [
  {
    name: 'src',
    path: 'src',
    type: 'directory',
    children: [
      { name: 'App.tsx', path: 'src/App.tsx', type: 'file' },
      { name: 'main.tsx', path: 'src/main.tsx', type: 'file' },
      { name: 'index.css', path: 'src/index.css', type: 'file' },
      {
        name: 'components',
        path: 'src/components',
        type: 'directory',
        children: [
          { name: 'TopBar.tsx', path: 'src/components/TopBar.tsx', type: 'file' },
          { name: 'SessionWindow.tsx', path: 'src/components/SessionWindow.tsx', type: 'file' },
        ],
      },
      {
        name: 'services',
        path: 'src/services',
        type: 'directory',
        children: [
          { name: 'git.ts', path: 'src/services/git.ts', type: 'file' },
        ],
      },
    ],
  },
  { name: 'package.json', path: 'package.json', type: 'file' },
  { name: 'tsconfig.json', path: 'tsconfig.json', type: 'file' },
];

export const mockDiffOutput: DiffOutput = {
  file_path: 'src/App.tsx',
  hunks: [
    {
      header: '@@ -10,6 +10,8 @@',
      lines: [
        { line_type: ' ', old_lineno: 10, new_lineno: 10, content: 'import React from "react";' },
        { line_type: '+', old_lineno: null, new_lineno: 11, content: 'import { GitProvider } from "./contexts/GitProvider";' },
        { line_type: '+', old_lineno: null, new_lineno: 12, content: 'import { useGit } from "./contexts/GitProvider";' },
        { line_type: ' ', old_lineno: 11, new_lineno: 13, content: 'import { App } from "./App";' },
      ],
    },
  ],
};
```

- [ ] **Step 2: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/services/mockGitData.ts
git commit -m "feat(git): create consolidated mock data for browser mode"
```

---

### Task 3: Add new methods to gitService

**Files:**
- Modify: `src/services/git.ts`

- [ ] **Step 1: Add fileTree, fileContent, watch, unwatch methods**

Add these methods to the `gitService` object, after the existing `branchDiffStats` method (around line 118):

```typescript
  async fileTree(dir: string): Promise<string[]> {
    if (!isElectron()) return [];
    const result = await invoke<{ files: string[] }>('git.file_tree', { dir });
    return result.files;
  },

  async fileContent(dir: string, filePath: string, gitRef?: string): Promise<string> {
    if (!isElectron()) return '';
    const result = await invoke<{ content: string }>('git.file_content', { dir, path: filePath, ref: gitRef });
    return result.content;
  },

  async watch(dir: string): Promise<void> {
    if (!isElectron()) return;
    await invoke<void>('git.watch', { dir });
  },

  async unwatch(dir: string): Promise<void> {
    if (!isElectron()) return;
    await invoke<void>('git.unwatch', { dir });
  },
```

Also add the `TreeNode` import at the top (though these methods return `string[]` not `TreeNode[]` — the tree building happens in GitProvider).

- [ ] **Step 2: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/services/git.ts
git commit -m "feat(git): add fileTree, fileContent, watch, unwatch to gitService"
```

---

## Chunk 2: GitProvider Context

### Task 4: Create GitProvider and useGit hook

**Files:**
- Create: `src/contexts/GitProvider.tsx`
- Reference: `src/services/git.ts` (API layer)
- Reference: `src/services/mockGitData.ts` (browser mock data)
- Reference: `src/types/git.ts` (all types)

- [ ] **Step 1: Create GitProvider.tsx**

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  GitInfo,
  FileChange,
  BranchInfo,
  WorktreeInfo,
  CommitInfo,
  TreeNode,
} from '../types/git';
import { gitService } from '../services/git';
import * as mock from '../services/mockGitData';

function isElectron(): boolean {
  return typeof window !== 'undefined' && (window as any).aiBackend !== undefined;
}

// Build tree from flat file path list
function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const filePath of paths) {
    const parts = filePath.split('/');
    let current = root;
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      const isFile = i === parts.length - 1;
      let existing = current.find(n => n.name === parts[i]);
      if (!existing) {
        existing = {
          name: parts[i],
          path: currentPath,
          type: isFile ? 'file' : 'directory',
          ...(isFile ? {} : { children: [] }),
        };
        current.push(existing);
      }
      if (!isFile) {
        current = existing.children!;
      }
    }
  }
  // Sort: directories first, then alphabetically
  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(n => { if (n.children) sortTree(n.children); });
  };
  sortTree(root);
  return root;
}

interface GitState {
  isRepo: boolean;
  info: GitInfo;
  changes: FileChange[];
  branches: BranchInfo[];
  worktrees: WorktreeInfo[];
  log: CommitInfo[];
  fileTree: TreeNode[];
  loading: boolean;
}

interface GitActions {
  stageFile: (file: string) => Promise<void>;
  unstageFile: (file: string) => Promise<void>;
  discardFile: (file: string) => Promise<void>;
  commit: (message: string) => Promise<void>;
  createWorktree: (branch: string, base: string) => Promise<string>;
  mergeWorktree: (wtPath: string, target?: string) => Promise<string>;
  removeWorktree: (wtPath: string, branch: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshChanges: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshLog: () => Promise<void>;
  refreshInfo: () => Promise<void>;
  getDiff: (file: string) => Promise<import('../types/git').DiffOutput>;
  getFileContent: (filePath: string, ref?: string) => Promise<string>;
  generateCommitMsg: () => Promise<string>;
  onCommitMsgStream: (sessionId: string, onDelta: (text: string) => void) => () => void;
}

interface GitContextValue extends GitState, GitActions {}

const GitContext = createContext<GitContextValue | null>(null);

const defaultInfo: GitInfo = {
  branch: '',
  commit_hash: '',
  commit_message: '',
  ahead: 0,
  behind: 0,
  has_upstream: false,
};

interface GitProviderProps {
  projectDir: string | null;
  children: React.ReactNode;
}

export function GitProvider({ projectDir, children }: GitProviderProps) {
  const [state, setState] = useState<GitState>({
    isRepo: false,
    info: defaultInfo,
    changes: [],
    branches: [],
    worktrees: [],
    log: [],
    fileTree: [],
    loading: true,
  });

  const dirRef = useRef(projectDir);
  dirRef.current = projectDir;

  // Determine working directory (can be overridden per-session via worktree)
  const dir = projectDir ?? '';

  const refreshInfo = useCallback(async () => {
    if (!dir) return;
    if (!isElectron()) return;
    const info = await gitService.info(dir);
    setState(prev => ({ ...prev, info }));
  }, [dir]);

  const refreshChanges = useCallback(async () => {
    if (!dir) return;
    if (!isElectron()) return;
    const [changes, filePaths] = await Promise.all([
      gitService.changes(dir),
      gitService.fileTree(dir).catch(() => [] as string[]),  // graceful: backend may not have this route yet
    ]);
    setState(prev => ({
      ...prev,
      changes,
      fileTree: buildFileTree(filePaths),
    }));
  }, [dir]);

  const refreshBranches = useCallback(async () => {
    if (!dir) return;
    if (!isElectron()) return;
    const [branches, worktrees] = await Promise.all([
      gitService.branches(dir),
      gitService.worktrees(dir),
    ]);
    setState(prev => ({ ...prev, branches, worktrees }));
  }, [dir]);

  const refreshLog = useCallback(async () => {
    if (!dir) return;
    if (!isElectron()) return;
    const log = await gitService.log(dir, 50);
    setState(prev => ({ ...prev, log }));
  }, [dir]);

  const refresh = useCallback(async () => {
    if (!dir) return;
    if (!isElectron()) return;
    setState(prev => ({ ...prev, loading: true }));
    try {
      const isRepo = await gitService.checkRepo(dir);
      if (!isRepo) {
        setState(prev => ({ ...prev, isRepo: false, loading: false }));
        return;
      }
      const [info, changes, branches, worktrees, log, filePaths] = await Promise.all([
        gitService.info(dir),
        gitService.changes(dir),
        gitService.branches(dir),
        gitService.worktrees(dir),
        gitService.log(dir, 50),
        gitService.fileTree(dir).catch(() => [] as string[]),
      ]);
      setState({
        isRepo: true,
        info,
        changes,
        branches,
        worktrees,
        log,
        fileTree: buildFileTree(filePaths),
        loading: false,
      });
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [dir]);

  // Initial load + mock data for browser
  useEffect(() => {
    if (!dir) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }
    if (!isElectron()) {
      // Browser mock mode
      setState({
        isRepo: true,
        info: mock.mockGitInfo,
        changes: mock.mockChanges,
        branches: mock.mockBranches,
        worktrees: mock.mockWorktrees,
        log: mock.mockLog,
        fileTree: mock.mockFileTree,
        loading: false,
      });
      return;
    }
    refresh();
  }, [dir, refresh]);

  // Watch for fs changes (Electron only)
  useEffect(() => {
    if (!dir || !isElectron()) return;

    gitService.watch(dir).catch(() => {});

    const handler = (data: { dir: string; kind: string }) => {
      if (data.dir !== dirRef.current) return;
      switch (data.kind) {
        case 'files':
          refreshChanges();
          break;
        case 'refs':
          refreshBranches();
          break;
        case 'head':
          refreshInfo();
          refreshLog();
          refreshChanges();
          break;
      }
    };

    (window as any).aiBackend?.on('git.changed', handler);

    return () => {
      (window as any).aiBackend?.off('git.changed', handler);
      gitService.unwatch(dir).catch(() => {});
    };
  }, [dir, refreshChanges, refreshBranches, refreshInfo, refreshLog]);

  // Actions
  const stageFile = useCallback(async (file: string) => {
    if (!dir) return;
    if (!isElectron()) {
      setState(prev => ({ ...prev, changes: prev.changes.filter(c => c.path !== file) }));
      return;
    }
    await gitService.stageFile(dir, file);
    await refreshChanges();
  }, [dir, refreshChanges]);

  const unstageFile = useCallback(async (file: string) => {
    if (!dir) return;
    if (!isElectron()) return;
    await gitService.unstageFile(dir, file);
    await refreshChanges();
  }, [dir, refreshChanges]);

  const discardFile = useCallback(async (file: string) => {
    if (!dir) return;
    if (!isElectron()) {
      setState(prev => ({ ...prev, changes: prev.changes.filter(c => c.path !== file) }));
      return;
    }
    await gitService.discardFile(dir, file);
    await refreshChanges();
  }, [dir, refreshChanges]);

  const commitAction = useCallback(async (message: string) => {
    if (!dir) return;
    if (!isElectron()) {
      setState(prev => ({
        ...prev,
        changes: [],
        log: [{ hash: 'mock' + Date.now(), message, author: 'You', date: 'just now', branches: [prev.info.branch], files: [] }, ...prev.log],
      }));
      return;
    }
    await gitService.commit(dir, message);
    await refresh();
  }, [dir, refresh]);

  const createWorktree = useCallback(async (branch: string, base: string) => {
    if (!dir) return '';
    if (!isElectron()) return '';
    const path = await gitService.createWorktree(dir, branch, base);
    await refreshBranches();
    return path;
  }, [dir, refreshBranches]);

  const mergeWorktree = useCallback(async (wtPath: string, target?: string) => {
    if (!dir) return '';
    if (!isElectron()) return '';
    const msg = await gitService.mergeWorktree(dir, wtPath, target);
    await refresh();
    return msg;
  }, [dir, refresh]);

  const removeWorktree = useCallback(async (wtPath: string, branch: string) => {
    if (!dir) return;
    if (!isElectron()) return;
    await gitService.removeWorktree(dir, wtPath, branch);
    await refreshBranches();
  }, [dir, refreshBranches]);

  const getDiff = useCallback(async (file: string) => {
    if (!dir) return { file_path: file, hunks: [] };
    if (!isElectron()) return mock.mockDiffOutput;
    return gitService.diff(dir, file);
  }, [dir]);

  const getFileContent = useCallback(async (filePath: string, ref?: string) => {
    if (!dir) return '';
    if (!isElectron()) return `// Mock content for ${filePath}`;
    return gitService.fileContent(dir, filePath, ref);
  }, [dir]);

  const generateCommitMsg = useCallback(async () => {
    if (!dir) return '';
    return gitService.generateCommitMsg(dir);
  }, [dir]);

  const onCommitMsgStream = useCallback((sessionId: string, onDelta: (text: string) => void) => {
    return gitService.onCommitMsgStream(sessionId, onDelta);
  }, []);

  const value: GitContextValue = {
    ...state,
    stageFile,
    unstageFile,
    discardFile,
    commit: commitAction,
    createWorktree,
    mergeWorktree,
    removeWorktree,
    refresh,
    refreshChanges,
    refreshBranches,
    refreshLog,
    refreshInfo,
    getDiff,
    getFileContent,
    generateCommitMsg,
    onCommitMsgStream,
  };

  return <GitContext.Provider value={value}>{children}</GitContext.Provider>;
}

export function useGit(): GitContextValue {
  const ctx = useContext(GitContext);
  if (!ctx) throw new Error('useGit must be used within GitProvider');
  return ctx;
}
```

- [ ] **Step 2: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/contexts/GitProvider.tsx
git commit -m "feat(git): create GitProvider context and useGit hook"
```

---

### Task 5: Mount GitProvider in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import GitProvider**

Add import near the top of App.tsx:

```typescript
import { GitProvider } from './contexts/GitProvider';
```

- [ ] **Step 2: Wrap content with GitProvider**

Find the main return JSX in App.tsx and wrap the content that contains GitPanel and other git-consuming components with `<GitProvider projectDir={projectDir}>`. This should wrap everything below TopBar level — the exact location depends on the current JSX structure. Place it around the area that includes `GitPanel`, `GitReviewPanel`, and the view mode components.

- [ ] **Step 3: Verify compilation and dev server**

Run: `npm run lint && npm run dev`
Expected: No errors, app renders normally, no behavioral changes yet

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(git): mount GitProvider in App.tsx"
```

---

## Chunk 3: Backend — fs watcher + new API routes

### Task 6: Add notify dependency to Cargo.toml

**Files:**
- Modify: `ai-backend/Cargo.toml`

- [ ] **Step 1: Add notify crate**

Add to `[dependencies]` section:

```toml
notify = "7"
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add ai-backend/Cargo.toml ai-backend/Cargo.lock
git commit -m "feat(git): add notify crate dependency for fs watching"
```

---

### Task 7: Create watcher module

**Files:**
- Create: `ai-backend/src/git/watcher.rs`
- Modify: `ai-backend/src/git/mod.rs`

- [ ] **Step 1: Create watcher.rs**

```rust
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

use crate::protocol::OutgoingMessage;

/// Classifies a filesystem event into a git-relevant kind.
fn classify_event(path: &Path, repo_root: &Path) -> Option<&'static str> {
    let rel = path.strip_prefix(repo_root).ok()?;
    let rel_str = rel.to_string_lossy();

    // Exclusions
    if rel_str.starts_with(".git/objects")
        || rel_str.starts_with("node_modules")
        || rel_str.starts_with("build")
        || rel_str.starts_with("dist")
        || rel_str.starts_with(".ai-studio")
    {
        return None;
    }

    if rel_str == ".git/HEAD" {
        return Some("head");
    }
    if rel_str.starts_with(".git/refs") {
        return Some("refs");
    }
    if rel_str == ".git/index" || !rel_str.starts_with(".git") {
        return Some("files");
    }

    None
}

struct WatcherEntry {
    _watcher: RecommendedWatcher,
}

pub struct GitWatcherManager {
    watchers: Arc<Mutex<HashMap<String, WatcherEntry>>>,
}

impl GitWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn watch(
        &self,
        dir: &str,
        event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    ) -> Result<(), String> {
        let dir_string = dir.to_string();
        let repo_root = PathBuf::from(dir);

        // Don't double-watch
        {
            let watchers = self.watchers.lock().unwrap();
            if watchers.contains_key(dir) {
                return Ok(());
            }
        }

        let debounce_state: Arc<Mutex<HashMap<String, Instant>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let debounce_ms = Duration::from_millis(500);

        let tx = event_tx.clone();
        let root = repo_root.clone();
        let dir_for_event = dir_string.clone();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    for path in &event.paths {
                        if let Some(kind) = classify_event(path, &root) {
                            let mut state = debounce_state.lock().unwrap();
                            let now = Instant::now();
                            if let Some(last) = state.get(kind) {
                                if now.duration_since(*last) < debounce_ms {
                                    continue;
                                }
                            }
                            state.insert(kind.to_string(), now);

                            let payload = serde_json::json!({
                                "dir": dir_for_event,
                                "kind": kind,
                            });
                            let msg = crate::protocol::Event::new("git.changed", payload);
                            let _ = tx.send(msg);
                        }
                    }
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher
            .watch(&repo_root, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch directory: {}", e))?;

        // Also watch .git directory explicitly
        let git_dir = repo_root.join(".git");
        if git_dir.exists() {
            let _ = watcher.watch(&git_dir, RecursiveMode::Recursive);
        }

        let mut watchers = self.watchers.lock().unwrap();
        watchers.insert(
            dir_string,
            WatcherEntry {
                _watcher: watcher,
            },
        );

        Ok(())
    }

    pub fn unwatch(&self, dir: &str) -> Result<(), String> {
        let mut watchers = self.watchers.lock().unwrap();
        watchers.remove(dir);
        Ok(())
    }
}
```

- [ ] **Step 2: Register module in mod.rs**

In `ai-backend/src/git/mod.rs`, add:

```rust
pub mod watcher;
```

- [ ] **Step 3: Verify it compiles**

Run: `cd ai-backend && cargo check`
Expected: Compiles. Note: there may be a warning about `OutgoingMessage::Event` variant — check that this enum variant exists in `protocol.rs`. If not, the variant needs to be added (see Task 8).

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/git/watcher.rs ai-backend/src/git/mod.rs
git commit -m "feat(git): add fs watcher module with debounce and event classification"
```

---

### Task 8: Add file_tree and file_content backend commands

**Files:**
- Modify: `ai-backend/src/git/commands.rs`

- [ ] **Step 1: Add file_tree function**

Add at the end of commands.rs:

```rust
/// List all tracked files in the repository (git ls-tree)
pub fn file_tree(dir: &str) -> Result<Vec<String>, String> {
    let output = run_git(dir, &["ls-tree", "-r", "--name-only", "HEAD"])?;
    Ok(output.lines().map(|l| l.to_string()).collect())
}
```

- [ ] **Step 2: Add file_content function**

```rust
/// Read file content from git or working tree
pub fn file_content(dir: &str, path: &str, git_ref: Option<&str>) -> Result<String, String> {
    match git_ref {
        Some(r) => run_git(dir, &["show", &format!("{}:{}", r, path)]),
        None => {
            let full_path = std::path::Path::new(dir).join(path);
            std::fs::read_to_string(&full_path)
                .map_err(|e| format!("Failed to read {}: {}", path, e))
        }
    }
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd ai-backend && cargo check`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/git/commands.rs
git commit -m "feat(git): add file_tree and file_content backend commands"
```

---

### Task 9: Add new routes to router.rs

**Files:**
- Modify: `ai-backend/src/router.rs`

This task requires understanding the `OutgoingMessage` enum. The watcher needs to send events. Check `protocol.rs` first — if `OutgoingMessage::Event` doesn't exist, add it. The existing streaming uses events, so this variant likely exists.

- [ ] **Step 1: Wire up watcher in the request handler**

The `handle_request` function currently takes `event_tx` as a parameter. The `GitWatcherManager` needs to be a long-lived singleton. The approach:

1. Add `GitWatcherManager` as a parameter to `handle_request` (or store it in a shared state alongside `SessionManager`)
2. Add `git.watch` and `git.unwatch` routes
3. Add `git.file_tree` and `git.file_content` routes

Add to router.rs in the match block, after the existing git commands:

```rust
"git.file_tree" => {
    let dir = get_dir(&req, session_manager);
    match git_cmd::file_tree(&dir) {
        Ok(files) => Response::ok(req.id, json!({"files": files})),
        Err(e) => ErrorResponse::new(req.id, 2017, e),
    }
}

"git.file_content" => {
    let dir = get_dir(&req, session_manager);
    let path = req.params.get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let git_ref = req.params.get("ref")
        .and_then(|v| v.as_str());
    if path.is_empty() {
        return ErrorResponse::new(req.id, 1002, "path is required".into());
    }
    match git_cmd::file_content(&dir, path, git_ref) {
        Ok(content) => Response::ok(req.id, json!({"content": content})),
        Err(e) => ErrorResponse::new(req.id, 2018, e),
    }
}

"git.watch" => {
    let dir = get_dir(&req, session_manager);
    match git_watcher.watch(&dir, event_tx.clone()) {
        Ok(()) => Response::ok(req.id, json!({"ok": true})),
        Err(e) => ErrorResponse::new(req.id, 2019, e),
    }
}

"git.unwatch" => {
    let dir = get_dir(&req, session_manager);
    match git_watcher.unwatch(&dir) {
        Ok(()) => Response::ok(req.id, json!({"ok": true})),
        Err(e) => ErrorResponse::new(req.id, 2020, e),
    }
}
```

- [ ] **Step 2: Update handle_request signature**

The function signature needs to accept `git_watcher: &GitWatcherManager`. Update accordingly and update the call site (likely in `main.rs`).

```rust
use crate::git::watcher::GitWatcherManager;

pub async fn handle_request(
    req: Request,
    session_manager: &mut SessionManager,
    event_tx: mpsc::UnboundedSender<OutgoingMessage>,
    database: &Database,
    git_watcher: &GitWatcherManager,  // new parameter
) -> OutgoingMessage {
```

- [ ] **Step 3: Update the call site in main.rs**

Find where `handle_request` is called and pass the `GitWatcherManager` instance. Create it once at startup alongside the session manager.

- [ ] **Step 4: Verify compilation**

Run: `cd ai-backend && cargo check`
Expected: Compiles without errors

- [ ] **Step 5: Commit**

```bash
git add ai-backend/src/router.rs ai-backend/src/main.rs
git commit -m "feat(git): add watch/unwatch, file_tree, file_content routes to backend"
```

---

## Chunk 4: Component Migration — CommitGraph, SourceControlPanel, GitPanel, ChangesTab

### Task 10: Migrate CommitGraph to useGit

**Files:**
- Modify: `src/components/git/CommitGraph.tsx`

- [ ] **Step 1: Replace direct gitService calls with useGit**

Replace the existing data fetching logic:
- Remove `import { gitService }`
- Add `import { useGit } from '../../contexts/GitProvider';`
- Remove the `useState` for commits and the `useEffect` that calls `gitService.log()`
- Read `log` directly from `useGit()`:
  ```typescript
  const { log: commits, refreshLog } = useGit();
  ```
- Remove `workingDir` and `refreshKey` props since the data now comes from context
- Update the component's props interface accordingly

- [ ] **Step 2: Add scroll-to-load-more pagination**

The spec requires infinite scroll loading (initial 50, load more on scroll to bottom). Add pagination state and onScroll handler:

```typescript
const [displayCount, setDisplayCount] = useState(50);
const visibleCommits = commits.slice(0, displayCount);

const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
  if (scrollHeight - scrollTop - clientHeight < 50) {
    setDisplayCount(prev => Math.min(prev + 50, commits.length));
  }
};
```

Wrap the commit list in a scrollable container with `onScroll={handleScroll}` and render `visibleCommits` instead of `commits`.

- [ ] **Step 3: Update parent (ChangesTab) to not pass removed props**

In `ChangesTab.tsx`, update the `<CommitGraph>` usage to remove `workingDir` and `refreshKey` props.

- [ ] **Step 4: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/git/CommitGraph.tsx src/components/git/ChangesTab.tsx
git commit -m "refactor(git): migrate CommitGraph to useGit context with scroll pagination"
```

---

### Task 11: Migrate SourceControlPanel — delete MOCK_COMMITS, use useGit

**Files:**
- Modify: `src/components/git/SourceControlPanel.tsx`

- [ ] **Step 1: Replace MOCK_COMMITS with useGit data**

- Remove the `MOCK_COMMITS` constant (lines 14-25)
- Add `import { useGit } from '../../contexts/GitProvider';`
- Get commit log from context:
  ```typescript
  const { log, changes } = useGit();
  ```
- Replace references to `session.diff.files` with `changes` from useGit
- Replace MOCK_COMMITS usage in the graph area with `log`

- [ ] **Step 2: Remove FileDiff/GitDiff type dependencies**

- Remove imports of `FileDiff`, `GitDiff` from `../../types`
- Update the file list rendering to use `FileChange` type from `../../types/git` instead of `FileDiff`
- The key mapping: `FileDiff.filename` → `FileChange.path`, `FileDiff.status` → `FileChange.status`, `FileDiff.additions/deletions` → `FileChange.additions/deletions`

- [ ] **Step 3: Update props interface**

Remove `session: Session` prop dependency where it was used only for `session.diff`. Keep any props still needed (like `commitMessage`, callbacks). The component should get git data from `useGit()` context instead.

- [ ] **Step 4: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/git/SourceControlPanel.tsx
git commit -m "refactor(git): migrate SourceControlPanel to useGit, remove MOCK_COMMITS and FileDiff"
```

---

### Task 12: Migrate GitPanel to useGit

**Files:**
- Modify: `src/components/git/GitPanel.tsx`

- [ ] **Step 1: Replace direct gitService calls with useGit**

Current state: GitPanel calls `gitService.changes()` for change count and manages `refreshKey`. Replace:
- Remove `import { gitService }`
- Add `import { useGit } from '../../contexts/GitProvider';`
- Get `changes` from `useGit()` for the count
- Remove the `refreshKey` state and `handleRefresh` — the context handles refresh via fs watch events
- Pass relevant context data to child tabs via props or let them use `useGit()` directly

- [ ] **Step 2: Simplify props**

The `sessions` and `focusedSessionId` props were used to determine `workingDir`. Since `GitProvider` now handles the project-level directory, and worktree-specific directories are a per-session concern, simplify accordingly.

- [ ] **Step 3: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/git/GitPanel.tsx
git commit -m "refactor(git): migrate GitPanel to useGit context"
```

---

### Task 13: Migrate ChangesTab to useGit

**Files:**
- Modify: `src/components/git/ChangesTab.tsx`

- [ ] **Step 1: Replace direct gitService calls with useGit**

Current state: ChangesTab calls `gitService.changes()` and `gitService.diff()` directly.

- Remove `import { gitService }`
- Add `import { useGit } from '../../contexts/GitProvider';`
- Get `changes` from `useGit()` instead of calling `gitService.changes()` in useEffect
- Use `getDiff` from `useGit()` for file diff:
  ```typescript
  const { changes, getDiff, stageFile, unstageFile, discardFile } = useGit();
  ```
- Remove `workingDir` and `refreshKey` props — data comes from context
- Remove the `useEffect` that fetches changes — they come from the context

- [ ] **Step 2: Add double-click handler for opening review panel**

Add `onOpenDiff` callback prop that ChangesTab calls when a file is double-clicked:

```typescript
interface ChangesTabProps {
  onOpenDiff?: (filePath: string) => void;
}
```

In the file list item, add:
```typescript
onDoubleClick={() => onOpenDiff?.(change.path)}
```

- [ ] **Step 3: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/git/ChangesTab.tsx
git commit -m "refactor(git): migrate ChangesTab to useGit, add double-click for diff panel"
```

---

### Task 14: Migrate GitTab to useGit

**Files:**
- Modify: `src/components/git/GitTab.tsx`

- [ ] **Step 1: Replace direct gitService calls with useGit**

Current state: GitTab calls `gitService.info()`, `gitService.worktrees()`, `gitService.branches()` in a Promise.all.

- Remove `import { gitService }`
- Add `import { useGit } from '../../contexts/GitProvider';`
- Read data from context:
  ```typescript
  const { info, worktrees, branches, mergeWorktree, removeWorktree } = useGit();
  ```
- Remove the `useEffect` that fetches data
- Remove `workingDir`, `projectDir`, `refreshKey` props
- Keep `onMerge` and `onDiscard` callbacks if they do app-level state changes (e.g., updating session status)

- [ ] **Step 2: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/git/GitTab.tsx
git commit -m "refactor(git): migrate GitTab to useGit context"
```

---

## Chunk 5: GitReviewPanel Refactor + Dead Code Cleanup

### Task 15: Refactor GitReviewPanel — decouple from Session

**Files:**
- Modify: `src/components/git/GitReviewPanel.tsx`

- [ ] **Step 1: Change props interface**

Replace:
```typescript
interface GitReviewPanelProps {
  isOpen: boolean;
  session?: Session | null;
  onClose: () => void;
  onCommit: () => void;
  onDiscard: () => void;
}
```

With:
```typescript
interface GitReviewPanelProps {
  isOpen: boolean;
  filePath: string | null;
  onClose: () => void;
}
```

- [ ] **Step 2: Rewrite to use DiffView + useGit**

- Remove `SourceControlPanel` and `DiffPanel` imports
- Add `import { useGit } from '../../contexts/GitProvider';`
- Add `import { DiffView } from './DiffView';` (named export)
- Fetch diff on `filePath` change:
  ```typescript
  const { getDiff, stageFile, unstageFile, discardFile } = useGit();
  const [diff, setDiff] = useState<DiffOutput | null>(null);

  useEffect(() => {
    if (filePath) {
      getDiff(filePath).then(setDiff);
    } else {
      setDiff(null);
    }
  }, [filePath, getDiff]);
  ```
- Render `DiffView` with the fetched hunks
- Add stage/unstage/discard action buttons in the panel header

- [ ] **Step 3: Update parent (App.tsx or GitPanel) to pass new props**

Replace the old `session`/`onCommit`/`onDiscard` props with `filePath`. The `filePath` state is managed by the parent (e.g., `reviewFilePath` state in App.tsx or GitPanel).

- [ ] **Step 4: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/git/GitReviewPanel.tsx src/App.tsx
git commit -m "refactor(git): decouple GitReviewPanel from Session, use DiffView + useGit"
```

---

### Task 16: Clean up Session type, App.tsx, and view components

**Files:**
- Modify: `src/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/CanvasView.tsx`
- Modify: `src/components/BoardView.tsx`
- Modify: `src/components/TabView.tsx`

- [ ] **Step 1: Remove diff field from Session type**

In `src/types.ts`:
- Remove `diff?: GitDiff | null` from the `Session` interface
- Remove `FileDiff` interface
- Remove `GitDiff` interface
- Check for any remaining references to these types — if other files import them, those imports need cleanup too

**Note:** `FileDiff` from `lucide-react` (icon) is a completely different import — do NOT remove those.

- [ ] **Step 2: Remove dead state from App.tsx**

In `src/App.tsx`:
- Remove `reviewSessionId` state
- Remove `handleOpenReview` function
- Remove `handleCommit` and `handleDiscard` functions (if they only modified `session.diff`)
- Remove any props passing `reviewSessionId` or `onOpenReview` to child components

- [ ] **Step 3: Remove `onOpenReview` prop from view components**

The `onOpenReview` prop cascades through multiple components. Remove it from:
- `src/components/CanvasView.tsx` — remove from props interface and remove passing to SessionWindow
- `src/components/BoardView.tsx` — remove from props interface and remove passing to SessionWindow
- `src/components/TabView.tsx` — remove from props interface and remove passing to SessionWindow
- `src/components/SessionWindow.tsx` — remove from props interface and remove usage (the review button)

- [ ] **Step 4: Verify compilation**

Run: `npm run lint`
Expected: No type errors. Any remaining references to `session.diff`, `FileDiff` (type, not icon), or `onOpenReview` will show as compile errors — fix them.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/App.tsx src/components/CanvasView.tsx src/components/BoardView.tsx src/components/TabView.tsx src/components/SessionWindow.tsx
git commit -m "refactor(git): remove FileDiff/GitDiff types, session.diff, and onOpenReview prop chain"
```

---

### Task 17: Clean up SessionWindow.tsx

**Files:**
- Modify: `src/components/SessionWindow.tsx`

- [ ] **Step 1: Remove session.diff references**

Find all references to `session.diff` in SessionWindow.tsx (around lines 128-150 and 771-784):
- Remove the `generateMockDiff()` import and usage
- Remove the review button that depended on `session.diff` for +/- stats
- If change indicators are still desired, use `session.hasChanges` / `session.changeCount` which are already populated from real `gitService.changes()` calls

- [ ] **Step 2: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "refactor(git): remove session.diff usage from SessionWindow"
```

---

### Task 18: Delete dead files

**IMPORTANT:** Task 17 MUST complete first — it removes the `import { generateMockDiff } from '../services/mockGit'` line. If mockGit.ts is deleted before that import is removed, the build will break.

**Files:**
- Delete: `src/services/mockGit.ts`
- Delete: `src/components/git/DiffPanel.tsx`
- Delete: `src/components/git/DiffSideBySide.tsx`
- Delete: `src/components/git/DiffNewFile.tsx`
- Delete: `src/components/git/DiffDeletedFile.tsx`
- Delete: `src/utils/parsePatch.ts` (only consumed by DiffSideBySide/DiffNewFile/DiffDeletedFile)

- [ ] **Step 1: Verify no remaining imports**

Search for imports of these files across the codebase:
```bash
grep -r "mockGit\|DiffPanel\|DiffSideBySide\|DiffNewFile\|DiffDeletedFile\|parsePatch" src/ --include="*.ts" --include="*.tsx" -l
```

Any remaining references must be removed first.

- [ ] **Step 2: Delete files**

```bash
rm src/services/mockGit.ts
rm src/components/git/DiffPanel.tsx
rm src/components/git/DiffSideBySide.tsx
rm src/components/git/DiffNewFile.tsx
rm src/components/git/DiffDeletedFile.tsx
rm src/utils/parsePatch.ts
```

- [ ] **Step 3: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor(git): delete dead code — mockGit, DiffPanel, DiffSideBySide, DiffNewFile, DiffDeletedFile, parsePatch"
```

---

## Chunk 6: FilesTab Implementation

### Task 19: Implement FilesTab file tree browser

**Files:**
- Modify: `src/components/git/FilesTab.tsx`

- [ ] **Step 1: Implement the tree component**

Replace the empty shell with a full implementation:

```typescript
import React, { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { useGit } from '../../contexts/GitProvider';
import type { TreeNode } from '../../types/git';

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  // Color by extension type
  const colors: Record<string, string> = {
    ts: 'text-blue-400', tsx: 'text-blue-400',
    js: 'text-yellow-400', jsx: 'text-yellow-400',
    css: 'text-purple-400', json: 'text-green-400',
    rs: 'text-orange-400', md: 'text-gray-400',
    toml: 'text-gray-400', html: 'text-red-400',
  };
  return <File size={14} className={colors[ext ?? ''] ?? 'text-gray-500'} />;
}

function TreeNodeItem({
  node,
  depth,
  changedPaths,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  changedPaths: Map<string, string>;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);

  const changeStatus = changedPaths.get(node.path);

  if (node.type === 'directory') {
    return (
      <div>
        <button
          className="flex items-center gap-1 w-full px-2 py-0.5 hover:bg-white/5 text-left text-xs"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? <FolderOpen size={14} className="text-yellow-500" /> : <Folder size={14} className="text-yellow-500" />}
          <span className="text-white/80 truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map(child => (
          <TreeNodeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            changedPaths={changedPaths}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      className="flex items-center gap-1 w-full px-2 py-0.5 hover:bg-white/5 text-left text-xs"
      style={{ paddingLeft: `${depth * 12 + 16}px` }}
      onClick={() => onSelectFile(node.path)}
    >
      <FileIcon name={node.name} />
      <span className="text-white/70 truncate flex-1">{node.name}</span>
      {changeStatus && (
        <span className={`text-[10px] font-mono ${
          changeStatus === 'A' ? 'text-green-400' :
          changeStatus === 'D' ? 'text-red-400' : 'text-yellow-400'
        }`}>
          {changeStatus}
        </span>
      )}
    </button>
  );
}

export function FilesTab() {
  const { fileTree, changes, getFileContent } = useGit();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const changedPaths = new Map(changes.map(c => [c.path, c.status]));

  const handleSelectFile = async (path: string) => {
    setSelectedFile(path);
    setLoading(true);
    try {
      const content = await getFileContent(path);
      setFileContent(content);
    } catch {
      setFileContent('// Failed to load file');
    }
    setLoading(false);
  };

  if (selectedFile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <button
            onClick={() => setSelectedFile(null)}
            className="text-white/50 hover:text-white/80 text-xs"
          >
            &larr; Back
          </button>
          <span className="text-white/60 text-xs truncate">{selectedFile}</span>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="text-white/30 text-xs">Loading...</div>
          ) : (
            <pre className="text-white/70 text-xs font-mono whitespace-pre-wrap break-all">
              {fileContent}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto py-1">
      {fileTree.length === 0 ? (
        <div className="text-white/30 text-xs text-center py-8">No files tracked</div>
      ) : (
        fileTree.map(node => (
          <TreeNodeItem
            key={node.path}
            node={node}
            depth={0}
            changedPaths={changedPaths}
            onSelectFile={handleSelectFile}
          />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Visual verification**

Run: `npm run dev`
Open the Git panel → Files tab. In Electron: should show real file tree. In browser: should show mock file tree. Click a file to see content view.

- [ ] **Step 4: Commit**

```bash
git add src/components/git/FilesTab.tsx
git commit -m "feat(git): implement FilesTab file tree browser"
```

---

## Chunk 7: Final Verification

### Task 20: Full integration verification

- [ ] **Step 1: Type check**

Run: `npm run lint`
Expected: Zero type errors

- [ ] **Step 2: Dev server smoke test**

Run: `npm run dev`
Verify in browser (mock mode):
- Git panel opens with three tabs (Changes, Git, Files)
- Changes tab shows mock changes
- Git tab shows mock branch info
- Files tab shows mock file tree
- CommitGraph shows mock commit history
- Double-clicking a file in Changes opens diff panel

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Backend check**

Run: `cd ai-backend && cargo build`
Expected: Build succeeds

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(git): final cleanup and integration fixes"
```

---

## Dependency Graph

```
Task 1 (TreeNode type)
  └─> Task 2 (mock data) ─────────────────┐
  └─> Task 3 (gitService methods) ─────────┤
                                            ├─> Task 4 (GitProvider)
Task 6 (Cargo.toml) ──> Task 7 (watcher) ──┤     │
                    ──> Task 8 (commands) ──┤     ├─> Task 5 (mount in App)
                                            │     │
                                            ├─> Task 9 (routes)
                                            │
Task 5 (mount GitProvider) ─────────────────┤
                                            ├─> Task 10 (CommitGraph)
                                            ├─> Task 11 (SourceControlPanel)
                                            ├─> Task 12 (GitPanel)
                                            ├─> Task 13 (ChangesTab)
                                            ├─> Task 14 (GitTab)
                                            │
Tasks 10-14 ────────────────────────────────┤
                                            ├─> Task 15 (GitReviewPanel)
                                            ├─> Task 16 (types cleanup)
                                            ├─> Task 17 (SessionWindow cleanup) ─> Task 18 (delete dead files)
                                            ├─> Task 19 (FilesTab)
                                            │
Tasks 15-19 ────────────────────────────────┴─> Task 20 (final verification)
```

**Parallelization opportunities:**
- Tasks 1, 6 can run in parallel (frontend types vs backend deps)
- Tasks 2, 3 can run in parallel after Task 1
- Tasks 7, 8 can run in parallel after Task 6
- Tasks 10, 11, 12, 13, 14 can all run in parallel after Task 5
- Tasks 15, 16, 17, 19 can run in parallel after Tasks 10-14. Task 18 must follow Task 17.
