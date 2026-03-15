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
- `gitService.ts` stays as the API layer; additive changes (new methods for new backend APIs) are allowed, but existing methods are not modified
- Reuse existing structured diff components (`DiffView.tsx` which consumes `DiffHunk[]`); the old patch-based components (`DiffPanel.tsx`, `SourceControlPanel.tsx`) will be updated to use the structured `DiffOutput` type

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

- `gitService.ts` stays as the API layer; new methods added for new backend APIs (`fileTree`, `fileContent`, `showCommit`, `watch`, `unwatch`)
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

### Event Transport

The existing sidecar event infrastructure already supports arbitrary event forwarding: `sidecar.on('event', ...)` in `electron/main.ts` forwards all events from the Rust backend to the renderer via `mainWindow.webContents.send('sidecar:event', eventName, data)`, and `preload.ts` exposes `aiBackend.on(eventName, callback)`. The `git.changed` event will flow through this existing pipeline with no changes to `electron/main.ts` or `preload.ts`.

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

### Current State

The `MOCK_COMMITS` constant lives in `SourceControlPanel.tsx` (not CommitGraph.tsx). `CommitGraph.tsx` already calls `gitService.log()` and renders real data including expanded file lists. The existing `CommitFile` type has `path` and `status` but no `additions`/`deletions`.

### Changes

- Delete `MOCK_COMMITS` from `SourceControlPanel.tsx`; replace with data from `useGit()`
- `CommitGraph.tsx` switches from direct `gitService.log()` calls to `useGit()` hook
- File list per commit: already returned by `git.log` (via `--name-status`). No new `git.show_commit` API needed — the existing `CommitInfo.files: Vec<CommitFile>` provides path + status per file.
- **Optional enhancement**: add `additions`/`deletions` to `CommitFile` by augmenting the backend `log()` function to include `--numstat` data. This is a nice-to-have, not a blocker.

### Interaction

- Linear list: short hash, message, author, relative time
- Click to expand → file list with status (and +/- stats if enhanced)
- Scroll to load more (initial 50, load next batch on scroll to bottom)

### Browser Mock

Mock commit list migrated from existing MOCK_COMMITS in SourceControlPanel.tsx into `mockGitData.ts`, served by GitProvider.

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

GitReviewPanel depends on `session.diff` which is always null. No trigger mechanism exists. Additionally, `SourceControlPanel.tsx` and `DiffPanel.tsx` use the old `FileDiff`/`GitDiff` types (patch-based string diffs from `types.ts`), which are incompatible with the structured `DiffOutput`/`DiffHunk`/`DiffLine` types from `types/git.ts` that `gitService.diff()` returns.

### Solution

- Decouple GitReviewPanel from Session entirely
- Trigger: double-click file in ChangesTab → open GitReviewPanel showing that file's diff
- Data: call `gitService.diff(dir, file)` via `useGit()`, which returns `DiffOutput` (structured hunks)
- **GitReviewPanel uses `DiffView.tsx`** (which already handles `DiffHunk[]`) for rendering, NOT the old `DiffPanel.tsx`/`SourceControlPanel.tsx` which depend on the obsolete `FileDiff` type
- `SourceControlPanel.tsx` is updated to remove its dependency on `FileDiff`/`GitDiff` and use `useGit()` for changes data instead

### Cleanup

- Remove `diff?: GitDiff` field from `Session` type in `types.ts`
- Remove old `FileDiff` and `GitDiff` types from `types.ts` (dead code after migration)
- Remove `reviewSessionId` state and `handleOpenReview` from App.tsx
- Update `SessionWindow.tsx` to remove the `session.diff`-based review button (lines referencing `session.diff` for +/- stats display); if change indicators are still needed, derive them from `session.worktreePath` + `useGit().changes`
- Delete `src/services/mockGit.ts` entirely (unused)
- GitReviewPanel props: `{ session, onCommit, onDiscard }` → `{ filePath, dir }`

### Interaction

- Double-click file in ChangesTab → open diff panel (using DiffView, side-by-side or inline)
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
- `gitService.ts` fallbacks (`if (!isElectron())`) retained as safety net. Since ALL components will be migrated to use `useGit()` (which handles mock data at the Provider level), these fallbacks will not be triggered in normal operation. They serve only as a defensive layer in case any code path bypasses the Provider.

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
| `ai-backend/src/router.rs` | Add `git.watch`, `git.unwatch`, `git.file_tree`, `git.file_content` routes |
| `ai-backend/src/git/mod.rs` | Register watcher module |
| `ai-backend/src/git/commands.rs` | Add `file_tree`, `file_content` functions |
| `ai-backend/Cargo.toml` | Add `notify` dependency |
| `src/services/git.ts` | Add new methods: `fileTree()`, `fileContent()`, `watch()`, `unwatch()` (additive only) |
| `src/App.tsx` | Wrap GitProvider, remove `reviewSessionId`/`session.diff` state |
| `src/types.ts` | Remove `diff` field from Session; remove old `FileDiff`/`GitDiff` types |
| `src/types/git.ts` | Add `TreeNode` type |
| `src/components/git/CommitGraph.tsx` | Switch from direct gitService calls to useGit hook |
| `src/components/git/SourceControlPanel.tsx` | Delete MOCK_COMMITS, use useGit; migrate from FileDiff to DiffOutput types |
| `src/components/git/FilesTab.tsx` | Implement file tree browser |
| `src/components/git/GitReviewPanel.tsx` | Decouple from session, accept filePath+dir; use DiffView instead of old DiffPanel |
| `src/components/git/ChangesTab.tsx` | Double-click file triggers diff panel |
| `src/components/git/GitPanel.tsx` | Read data from useGit instead of direct gitService calls |
| `src/components/SessionWindow.tsx` | Remove `session.diff` references; derive change indicators from useGit if needed |

### Deleted Files

| File | Reason |
|------|--------|
| `src/services/mockGit.ts` | Never used, functionality migrated to mockGitData.ts |

### Unchanged Files

- `DiffView.tsx` / `DiffSideBySide.tsx` / `DiffNewFile.tsx` / `DiffDeletedFile.tsx` — already consume `DiffHunk[]`, reused as-is
- `CommitSection.tsx` / `MergeDialog.tsx` / `DiscardWorktreeDialog.tsx` — complete, no changes needed
- `electron/main.ts` / `electron/preload.ts` — event forwarding already handles arbitrary events, no changes needed

### Scale

~3 new files + ~15 modified files + 1 deleted file
