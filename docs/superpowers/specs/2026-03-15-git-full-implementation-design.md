# Git Full Implementation Design

## Overview

Complete the git functionality in AI Studio Infinite Canvas by fixing data connections, adding missing features, and introducing a GitProvider Context for centralized state management. The project already has ~95% of the infrastructure (Rust backend APIs, frontend service layer, UI components) — this design addresses the remaining gaps.

## Goals

1. Replace all mock/hardcoded git data with real backend data (Electron) or structured mock data (browser)
2. Introduce `GitProvider` Context to centralize git state management
3. Add event-driven data refresh via backend fs watch
4. Implement FilesTab file tree browser
5. Fix GitReviewPanel to work via manual trigger from ChangesTab
6. Connect CommitGraph to real `git.log()` data
7. Clean up dead code (unused mockGit.ts, session.diff)

## Constraints

- Electron is the primary runtime; browser mode provides mock demo experience
- No new state management libraries (React Context + hooks only)
- Preserve existing `gitService.ts` API layer unchanged
- Reuse existing diff visualization components (DiffView, DiffSideBySide, etc.)

---

## Section 1: GitProvider — State Management Layer

### Responsibility

Encapsulate all git data state and operations, replacing scattered `gitService` calls and local state across components.

### Structure

```
GitProvider (Context)
├── state
│   ├── info: GitInfo            // current branch, commit, ahead/behind
│   ├── changes: FileChange[]    // working directory changes
│   ├── branches: BranchInfo[]   // all branches
│   ├── worktrees: WorktreeInfo[]
│   ├── log: CommitInfo[]        // commit history
│   ├── fileTree: TreeNode[]     // file tree (new)
│   └── isRepo: boolean
│
├── actions (wrap gitService calls + auto-refresh state)
│   ├── stageFile / unstageFile / discardFile
│   ├── commit
│   ├── createWorktree / mergeWorktree / removeWorktree
│   └── refresh()                // manual full refresh
│
└── event listener
    └── listen to backend `git.changed` event → selective refresh
```

### Mount Location

In `App.tsx`, wrapping the area that needs git data. Receives `projectDir` as prop.

### Browser Mock Strategy

`GitProvider` detects `!isElectron()` internally and sets static mock data. Actions become local state mutations (optimistic updates) simulating operation effects.

### Relationship with Existing Code

- `gitService.ts` stays unchanged (pure API layer)
- Components use `useGit()` hook for data, stop calling `gitService` directly
- UI state in App.tsx (`showGitPanel`, etc.) stays in App.tsx; only git data state moves into Provider

---

## Section 2: Backend fs watch + Event Push

### New Rust Module

`ai-backend/src/git/watcher.rs`

### Mechanism

- Use `notify` crate to watch project directory for file changes
- Two new router commands:
  - `git.watch { dir }` — start watching a directory
  - `git.unwatch { dir }` — stop watching
- On file change, push event via existing `event_tx`: `git.changed { dir, kind }`
  - `kind` values: `"files"` | `"refs"` | `"head"`
- **Debounce**: 500ms after file change before pushing, to avoid excessive refreshes during batch operations

### Watch Targets

- Working directory files → `kind: "files"`
- `.git/HEAD` → `kind: "head"` (checkout, commit)
- `.git/refs/` → `kind: "refs"` (branch create/delete)
- `.git/index` → `kind: "files"` (stage/unstage)

### Exclusions

`.git/objects/`, `node_modules/`, `build/`, `dist/`, `.ai-studio/`

### Frontend Handling

```
git.changed { dir, kind }
  → GitProvider receives and selectively refreshes:
    - "files" → refresh changes + fileTree
    - "refs"  → refresh branches + worktrees
    - "head"  → refresh info + log + changes
```

### Lifecycle

- GitProvider mount → `git.watch(projectDir)`
- projectDir changes → unwatch old + watch new
- unmount → `git.unwatch`

---

## Section 3: CommitGraph — Real Data

### Changes

- Delete `MOCK_COMMITS` constant
- Read `log: CommitInfo[]` from `useGit()`
- Click to expand: show files changed in that commit

### New Backend API

- `git.show_commit { dir, hash }` → `{ files: [{ path, status, additions, deletions }] }`
- Rust: parse output of `git show --stat --format="" <hash>`

### Interaction

- Linear list: short hash, message, author, relative time
- Click to expand → file list with status and +/- stats
- Scroll to load more (initial 50, load next batch on scroll to bottom)

### Browser Mock

Mock commit list migrated from existing MOCK_COMMITS into `mockGitData.ts`, served by GitProvider.

---

## Section 4: FilesTab — File Tree Browser

### New Backend APIs

- `git.file_tree { dir }` → list of tracked file paths
  - Rust: `git ls-tree -r --name-only HEAD`
  - Frontend builds tree structure from flat path list
- `git.file_content { dir, path, ref? }` → file content (read-only)
  - Rust: `git show HEAD:<path>` or direct file read

### Frontend Component

- `FilesTab` renders collapsible tree directory structure
- Each node: filename + icon (by extension)
- Click file → read-only view in right panel (syntax highlighted via existing `syntaxHighlight.ts`)
- Click directory → expand/collapse
- Files that are also in changes list show change marker (M/A/D)

### Data Source

`fileTree` from `useGit()`, refreshed on `"files"` fs watch events.

---

## Section 5: GitReviewPanel — Manual Trigger

### Problem

GitReviewPanel depends on `session.diff` which is always null. No trigger mechanism exists.

### Solution

- Decouple GitReviewPanel from Session entirely
- Trigger: double-click file in ChangesTab → open GitReviewPanel showing that file's diff
- Data: call `gitService.diff(dir, file)` directly via `useGit()`, no longer depends on `session.diff`

### Cleanup

- Remove `diff?: GitDiff` field from `Session` type
- Remove `reviewSessionId` state and `handleOpenReview` from App.tsx
- Delete `src/services/mockGit.ts` entirely (unused)
- GitReviewPanel props: `{ session, onCommit, onDiscard }` → `{ filePath, dir }`

### Interaction

- Double-click file in ChangesTab → open diff panel (side-by-side or inline)
- Within diff panel: stage/unstage/discard current file
- Close panel → return to ChangesTab

---

## Section 6: Browser Mock Data Strategy

### Principle

Full mock demo experience in browser, real data in Electron.

### Implementation

- `GitProvider` checks `isElectron()` on mount
- Non-Electron:
  - Set static mock state (info, changes, branches, log, fileTree, worktrees)
  - Actions perform local state mutations (optimistic updates)
  - No `git.watch`, no event listening
- Mock data consolidated in `src/services/mockGitData.ts` (migrated from existing MOCK_COMMITS + mockGit.ts)
- `gitService.ts` fallbacks (`if (!isElectron())`) retained as safety net but not triggered by GitProvider path

---

## Section 7: Change Inventory

### New Files

| File | Description |
|------|-------------|
| `src/contexts/GitProvider.tsx` | Git Context + useGit hook |
| `src/services/mockGitData.ts` | Browser mock dataset |
| `ai-backend/src/git/watcher.rs` | fs watch module |

### Modified Files

| File | Change |
|------|--------|
| `ai-backend/src/router.rs` | Add `git.watch`, `git.unwatch`, `git.show_commit`, `git.file_tree`, `git.file_content` routes |
| `ai-backend/src/git/mod.rs` | Register watcher module |
| `ai-backend/src/git/commands.rs` | Add `show_commit`, `file_tree`, `file_content` functions |
| `ai-backend/Cargo.toml` | Add `notify` dependency |
| `src/App.tsx` | Wrap GitProvider, remove `reviewSessionId`/`session.diff` state |
| `src/types.ts` | Remove `diff` field from Session |
| `src/types/git.ts` | Add `TreeNode`, `CommitDetail` types |
| `src/components/git/CommitGraph.tsx` | Delete MOCK_COMMITS, use useGit |
| `src/components/git/FilesTab.tsx` | Implement file tree browser |
| `src/components/git/GitReviewPanel.tsx` | Decouple from session, accept filePath+dir |
| `src/components/git/ChangesTab.tsx` | Double-click file triggers diff panel |
| `src/components/git/GitPanel.tsx` | Read data from useGit instead of direct gitService calls |

### Deleted Files

| File | Reason |
|------|--------|
| `src/services/mockGit.ts` | Never used, functionality migrated to mockGitData.ts |

### Unchanged Files

- `src/services/git.ts` — pure API layer, no changes
- `DiffView.tsx` / `DiffSideBySide.tsx` / `DiffNewFile.tsx` / `DiffDeletedFile.tsx` — complete, reused as-is
- `CommitSection.tsx` / `MergeDialog.tsx` / `DiscardWorktreeDialog.tsx` — complete, no changes needed
- `electron/main.ts` / `electron/preload.ts` — communication layer unchanged

### Scale

~3 new files + ~12 modified files + 1 deleted file
