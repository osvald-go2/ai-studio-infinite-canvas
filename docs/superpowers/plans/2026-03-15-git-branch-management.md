# Git 分支管理功能实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron + Rust sidecar 架构上实现项目级别的真实 Git 分支管理，替换现有 mock 实现。

**Architecture:** 在 `ai-backend/` Rust sidecar 中新增 `git/` 模块，通过 JSON stdin/stdout IPC 暴露 `git.*` 方法。前端新增 `services/git.ts` 服务层 + `GitPanel` 三 Tab 侧边栏。AI commit 通过 SessionManager ephemeral session 实现。

**Tech Stack:** Rust (std::process::Command), TypeScript, React 19, Tailwind CSS 4, Electron IPC

**Spec:** `docs/superpowers/specs/2026-03-15-git-branch-management-design.md`

**Reference:** MuMu 实现在 `MuMu/src-tauri/src/files/commands.rs` 和 `MuMu/src-tauri/src/commands.rs`

---

## Chunk 1: 后端 — Rust Git 模块

### Task 1: 创建 git 类型定义

**Files:**
- Create: `ai-backend/src/git/types.rs`
- Create: `ai-backend/src/git/mod.rs`

- [ ] **Step 1: 创建 `ai-backend/src/git/types.rs`**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GitInfo {
    pub branch: String,
    pub commit_hash: String,
    pub commit_message: String,
    pub ahead: u32,
    pub behind: u32,
    pub has_upstream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffOutput {
    pub file_path: String,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffLine {
    pub line_type: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub last_commit_time: String,
    pub ahead: Option<i32>,
    pub behind: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub branch: String,
    pub path: String,
    pub commit_hash: String,
    pub commit_message: String,
    pub is_main: bool,
    pub is_current: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub branches: Vec<String>,
    pub files: Vec<CommitFile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitFile {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchDiffStats {
    pub additions: u64,
    pub deletions: u64,
    pub base_branch: String,
}
```

- [ ] **Step 2: 创建 `ai-backend/src/git/mod.rs`**

```rust
pub mod types;
pub mod commands;
pub mod worktree;
```

- [ ] **Step 3: 在 `ai-backend/src/main.rs` 中添加模块声明**

在现有 `mod normalizer;` 后添加：
```rust
mod git;
```

- [ ] **Step 4: 验证编译**

```bash
cd ai-backend && cargo check
```

Expected: 编译通过（warnings about unused modules ok）

- [ ] **Step 5: Commit**

```bash
git add ai-backend/src/git/
git commit -m "feat(backend): 添加 git 模块类型定义"
```

---

### Task 2: 实现基础 git 命令（check_repo, init, info, changes, diff）

**Files:**
- Create: `ai-backend/src/git/commands.rs`

参考：`MuMu/src-tauri/src/files/commands.rs` 中对应函数，移植为独立函数（不依赖 Tauri）。

- [ ] **Step 1: 创建 `ai-backend/src/git/commands.rs`，实现 `check_repo` 和 `init`**

```rust
use std::path::Path;
use std::process::Command;
use super::types::*;

/// 检查目录是否为 git 仓库
pub fn check_repo(dir: &str) -> bool {
    Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(dir)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// 初始化 git 仓库
pub fn init(dir: &str) -> Result<(), String> {
    run_git(dir, &["init"])?;
    run_git(dir, &["add", "-A"])?;
    run_git(dir, &["commit", "--allow-empty", "-m", "Initial commit"])?;
    Ok(())
}

/// 辅助函数：运行 git 命令并检查成功
fn run_git(dir: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("Failed to run git {}: {}", args[0], e))?;

    if !output.status.success() {
        return Err(format!(
            "git {} failed: {}",
            args[0],
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// 运行 git 命令，不检查 exit code（用于 git diff --no-index 等情况）
fn run_git_unchecked(dir: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("Failed to run git {}: {}", args[0], e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

参考 `MuMu/src-tauri/src/files/commands.rs:7-14`（check_repo）和 `:172-214`（init）。

- [ ] **Step 2: 实现 `git_info`**

在同文件中添加：

```rust
/// 获取当前分支、commit hash/message、ahead/behind
pub fn git_info(dir: &str) -> Result<GitInfo, String> {
    let branch = run_git(dir, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim().to_string();

    let log_line = run_git(dir, &["log", "-1", "--format=%h %s"])?
        .trim().to_string();
    let (commit_hash, commit_message) = match log_line.split_once(' ') {
        Some((hash, msg)) => (hash.to_string(), msg.to_string()),
        None => (log_line.clone(), String::new()),
    };

    // 获取 ahead/behind（upstream 可能不存在）
    let revlist = Command::new("git")
        .args(["rev-list", "--left-right", "--count", "HEAD...@{u}"])
        .current_dir(dir)
        .output();

    let (ahead, behind, has_upstream) = match revlist {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let parts: Vec<&str> = text.split('\t').collect();
            (
                parts.first().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0),
                parts.get(1).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0),
                true,
            )
        }
        _ => (0, 0, false),
    };

    Ok(GitInfo { branch, commit_hash, commit_message, ahead, behind, has_upstream })
}
```

参考 `MuMu/src-tauri/src/files/commands.rs:228-274`。

- [ ] **Step 3: 实现 `git_changes`**

```rust
/// 获取文件变更列表（git status --porcelain + numstat）
pub fn git_changes(dir: &str) -> Result<Vec<FileChange>, String> {
    let stdout = run_git(dir, &["status", "--porcelain", "-u"])?;
    let mut changes: Vec<FileChange> = Vec::new();

    for line in stdout.lines() {
        if line.len() < 3 { continue; }
        let status_code = &line[..2];
        let file_path = line[3..].trim().to_string();

        let status = match status_code.trim() {
            "M" | "MM" | "AM" => "M",
            "A" => "A",
            "D" => "D",
            "R" | "RM" => "R",
            "U" | "UU" | "AA" | "DD" => "U",
            "??" => "?",
            s if s.contains('M') => "M",
            s if s.contains('A') => "A",
            s if s.contains('D') => "D",
            _ => "?",
        }.to_string();

        // 获取增删行数
        let (mut additions, mut deletions) = get_file_numstat(dir, &file_path);

        // 未追踪文件：计行数作为 additions
        if status == "?" && additions == 0 && deletions == 0 {
            let full_path = Path::new(dir).join(&file_path);
            if let Ok(content) = std::fs::read_to_string(&full_path) {
                additions = content.lines().count() as u32;
            }
        }

        changes.push(FileChange { path: file_path, status, additions, deletions });
    }

    Ok(changes)
}

fn get_file_numstat(dir: &str, file: &str) -> (u32, u32) {
    // 尝试 unstaged diff
    if let Ok(text) = run_git_unchecked(dir, &["diff", "--numstat", "--", file]) {
        let text = text.trim();
        if !text.is_empty() {
            return parse_numstat(text);
        }
    }
    // 尝试 cached diff
    if let Ok(text) = run_git_unchecked(dir, &["diff", "--cached", "--numstat", "--", file]) {
        let text = text.trim();
        if !text.is_empty() {
            return parse_numstat(text);
        }
    }
    (0, 0)
}

fn parse_numstat(text: &str) -> (u32, u32) {
    let parts: Vec<&str> = text.split('\t').collect();
    let additions = parts.first().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    let deletions = parts.get(1).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    (additions, deletions)
}
```

参考 `MuMu/src-tauri/src/files/commands.rs:465-561`。

- [ ] **Step 4: 实现 `git_diff`**

```rust
/// 获取单文件的结构化 diff
pub fn git_diff(dir: &str, file: &str) -> Result<DiffOutput, String> {
    // 依次尝试 unstaged → cached → untracked
    let mut diff_text = run_git_unchecked(dir, &["diff", "--", file])?.trim().to_string();
    if diff_text.is_empty() {
        diff_text = run_git_unchecked(dir, &["diff", "--cached", "--", file])?.trim().to_string();
    }
    if diff_text.is_empty() {
        diff_text = run_git_unchecked(dir, &["diff", "--no-index", "/dev/null", file])?.trim().to_string();
    }

    let hunks = parse_diff_output(&diff_text);
    Ok(DiffOutput { file_path: file.to_string(), hunks })
}

fn parse_diff_output(text: &str) -> Vec<DiffHunk> {
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut old_line: u32 = 0;
    let mut new_line: u32 = 0;

    for line in text.lines() {
        // 跳过 diff header
        if line.starts_with("diff --git")
            || line.starts_with("index ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
            || line.starts_with("new file")
            || line.starts_with("old file")
        {
            continue;
        }

        if line.starts_with("@@") {
            let mut ol: u32 = 1;
            let mut nl: u32 = 1;
            if let Some(at_end) = line[2..].find("@@") {
                let header_part = line[2..2 + at_end].trim();
                for part in header_part.split_whitespace() {
                    if let Some(old) = part.strip_prefix('-') {
                        ol = old.split(',').next().and_then(|s| s.parse().ok()).unwrap_or(1);
                    } else if let Some(new) = part.strip_prefix('+') {
                        nl = new.split(',').next().and_then(|s| s.parse().ok()).unwrap_or(1);
                    }
                }
            }
            old_line = ol;
            new_line = nl;
            hunks.push(DiffHunk { header: line.to_string(), lines: Vec::new() });
            continue;
        }

        if hunks.is_empty() { continue; }
        let hunk = hunks.last_mut().unwrap();

        if let Some(content) = line.strip_prefix('+') {
            hunk.lines.push(DiffLine {
                line_type: "+".to_string(), old_lineno: None,
                new_lineno: Some(new_line), content: content.to_string(),
            });
            new_line += 1;
        } else if let Some(content) = line.strip_prefix('-') {
            hunk.lines.push(DiffLine {
                line_type: "-".to_string(), old_lineno: Some(old_line),
                new_lineno: None, content: content.to_string(),
            });
            old_line += 1;
        } else if let Some(content) = line.strip_prefix(' ') {
            hunk.lines.push(DiffLine {
                line_type: " ".to_string(), old_lineno: Some(old_line),
                new_lineno: Some(new_line), content: content.to_string(),
            });
            old_line += 1;
            new_line += 1;
        } else {
            hunk.lines.push(DiffLine {
                line_type: " ".to_string(), old_lineno: Some(old_line),
                new_lineno: Some(new_line), content: line.to_string(),
            });
            old_line += 1;
            new_line += 1;
        }
    }

    hunks
}
```

参考 `MuMu/src-tauri/src/files/commands.rs:563-682`。

- [ ] **Step 5: 实现 stage/unstage/discard/commit**

```rust
pub fn stage_file(dir: &str, file: &str) -> Result<(), String> {
    run_git(dir, &["add", "--", file])?;
    Ok(())
}

pub fn unstage_file(dir: &str, file: &str) -> Result<(), String> {
    run_git(dir, &["reset", "HEAD", "--", file])?;
    Ok(())
}

pub fn discard_file(dir: &str, file: &str) -> Result<(), String> {
    // 检查文件是否被追踪
    let tracked = Command::new("git")
        .args(["ls-files", "--error-unmatch", file])
        .current_dir(dir)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if tracked {
        run_git(dir, &["checkout", "--", file])?;
    } else {
        let full_path = Path::new(dir).join(file);
        std::fs::remove_file(&full_path)
            .map_err(|e| format!("Failed to remove file: {}", e))?;
    }
    Ok(())
}

pub fn commit(dir: &str, message: &str) -> Result<String, String> {
    run_git(dir, &["add", "-A"])?;

    let output = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("Failed to run git commit: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.contains("nothing to commit") {
            return Err("Nothing to commit".to_string());
        }
        return Err(format!("git commit failed: {}", stderr));
    }

    let hash = run_git(dir, &["rev-parse", "--short", "HEAD"])?.trim().to_string();
    Ok(hash)
}
```

参考 `MuMu/src-tauri/src/files/commands.rs:684-724` 和 `:1222-1238`。

- [ ] **Step 6: 实现 branches 和 log**

```rust
pub fn branches(dir: &str) -> Result<Vec<BranchInfo>, String> {
    let stdout = run_git(dir, &[
        "branch", "-a",
        "--format=%(HEAD) %(refname:short) %(upstream:track) %(committerdate:relative)",
    ])?;

    let mut branches: Vec<BranchInfo> = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let is_current = line.starts_with('*');
        let rest = &line[2..];
        let parts: Vec<&str> = rest.splitn(2, ' ').collect();
        let name = parts.first().unwrap_or(&"").to_string();
        if name.contains("HEAD") { continue; }

        let remaining = parts.get(1).unwrap_or(&"").to_string();
        let is_remote = name.starts_with("remotes/") || name.contains("origin/");
        let display_name = name.strip_prefix("remotes/").unwrap_or(&name).to_string();

        let mut ahead: Option<i32> = None;
        let mut behind: Option<i32> = None;
        let mut last_commit_time = remaining.clone();

        if let Some(bracket_start) = remaining.find('[') {
            if let Some(bracket_end) = remaining.find(']') {
                let track = &remaining[bracket_start + 1..bracket_end];
                for part in track.split(',') {
                    let part = part.trim();
                    if let Some(n) = part.strip_prefix("ahead ") {
                        ahead = n.trim().parse::<i32>().ok();
                    } else if let Some(n) = part.strip_prefix("behind ") {
                        behind = n.trim().parse::<i32>().ok();
                    }
                }
                last_commit_time = remaining[bracket_end + 1..].trim().to_string();
            }
        }

        branches.push(BranchInfo {
            name: display_name, is_current, is_remote, last_commit_time, ahead, behind,
        });
    }

    // 排序：current first, local before remote, alphabetical
    branches.sort_by(|a, b| {
        b.is_current.cmp(&a.is_current)
            .then_with(|| a.is_remote.cmp(&b.is_remote))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(branches)
}

pub fn log(dir: &str, count: u32) -> Result<Vec<CommitInfo>, String> {
    use std::collections::HashMap;

    // 1. 获取分支 tip → branch name 映射
    let branch_stdout = run_git_unchecked(dir, &[
        "branch", "-a", "--format=%(objectname:short) %(refname:short)",
    ])?;
    let mut branch_map: HashMap<String, Vec<String>> = HashMap::new();
    for line in branch_stdout.lines() {
        let line = line.trim();
        if let Some((hash, name)) = line.split_once(' ') {
            if !name.contains("HEAD") {
                branch_map.entry(hash.to_string()).or_default().push(name.to_string());
            }
        }
    }

    // 2. 获取 log
    let format_arg = format!("-n{}", count);
    // %ar = relative date（和 MuMu 一致，如 "2 days ago"）
    let log_stdout = run_git(dir, &[
        "log", &format_arg, "--format=COMMIT_START%n%h%n%s%n%an%n%ar", "--name-status",
    ])?;

    let mut commits: Vec<CommitInfo> = Vec::new();
    let blocks: Vec<&str> = log_stdout.split("COMMIT_START\n").collect();
    for block in blocks {
        let block = block.trim();
        if block.is_empty() { continue; }

        let mut lines = block.lines();
        let hash = match lines.next() { Some(h) => h.trim().to_string(), None => continue };
        let message = lines.next().unwrap_or("").trim().to_string();
        let author = lines.next().unwrap_or("").trim().to_string();
        let date = lines.next().unwrap_or("").trim().to_string();

        let mut files: Vec<CommitFile> = Vec::new();
        for file_line in lines {
            let file_line = file_line.trim();
            if file_line.is_empty() { continue; }
            if let Some((status, path)) = file_line.split_once('\t') {
                files.push(CommitFile {
                    path: path.to_string(),
                    status: status.chars().next().unwrap_or('M').to_string(),
                });
            }
        }

        let branches_for_commit = branch_map.get(&hash).cloned().unwrap_or_default();
        commits.push(CommitInfo { hash, message, author, date, branches: branches_for_commit, files });
    }

    Ok(commits)
}
```

参考 `MuMu/src-tauri/src/files/commands.rs:380-463`（branches）和 `:1125-1220`（log）。

- [ ] **Step 7: 验证编译**

```bash
cd ai-backend && cargo check
```

- [ ] **Step 8: Commit**

```bash
git add ai-backend/src/git/commands.rs
git commit -m "feat(backend): 实现基础 git 命令（info, changes, diff, stage, commit, branches, log）"
```

---

### Task 3: 实现 worktree 命令

**Files:**
- Create: `ai-backend/src/git/worktree.rs`

- [ ] **Step 1: 创建 `ai-backend/src/git/worktree.rs`**

```rust
use std::path::{Path, PathBuf};
use std::process::Command;
use super::types::*;
use super::commands::run_git; // 需要将 run_git 改为 pub(crate)

/// 列出所有 worktrees
pub fn list_worktrees(dir: &str) -> Result<Vec<WorktreeInfo>, String> {
    let stdout = run_git(dir, &["worktree", "list", "--porcelain"])?;
    let mut worktrees: Vec<WorktreeInfo> = Vec::new();
    let mut current_path = String::new();
    let mut current_hash = String::new();
    let mut current_branch = String::new();
    let mut is_bare = false;
    let mut is_first = true;

    let canonical_dir = std::fs::canonicalize(dir)
        .unwrap_or_else(|_| Path::new(dir).to_path_buf());

    for line in stdout.lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            current_path = p.to_string();
        } else if let Some(h) = line.strip_prefix("HEAD ") {
            current_hash = h.chars().take(7).collect();
        } else if let Some(b) = line.strip_prefix("branch ") {
            current_branch = b.strip_prefix("refs/heads/").unwrap_or(b).to_string();
        } else if line == "bare" {
            is_bare = true;
        } else if line.is_empty() && !current_path.is_empty() {
            if !is_bare {
                let commit_message = run_git_unchecked(&current_path, &["log", "-1", "--format=%s"])
                    .unwrap_or_default().trim().to_string();
                let canonical_wt = std::fs::canonicalize(&current_path)
                    .unwrap_or_else(|_| Path::new(&current_path).to_path_buf());
                worktrees.push(WorktreeInfo {
                    branch: current_branch.clone(), path: current_path.clone(),
                    commit_hash: current_hash.clone(), commit_message,
                    is_main: is_first, is_current: canonical_wt == canonical_dir,
                });
            }
            current_path.clear(); current_hash.clear(); current_branch.clear();
            is_bare = false; is_first = false;
        }
    }
    // Handle last block
    if !current_path.is_empty() && !is_bare {
        let commit_message = run_git_unchecked(&current_path, &["log", "-1", "--format=%s"])
            .unwrap_or_default().trim().to_string();
        let canonical_wt = std::fs::canonicalize(&current_path)
            .unwrap_or_else(|_| Path::new(&current_path).to_path_buf());
        worktrees.push(WorktreeInfo {
            branch: current_branch, path: current_path,
            commit_hash: current_hash, commit_message,
            is_main: is_first, is_current: canonical_wt == canonical_dir,
        });
    }
    Ok(worktrees)
}

/// 创建 worktree
pub fn create_worktree(project_dir: &str, branch: &str, base: &str) -> Result<String, String> {
    // 1. 检查分支是否存在
    let check = Command::new("git").args(["branch", "--list", branch])
        .current_dir(project_dir).output()
        .map_err(|e| format!("Failed to check branch: {}", e))?;
    let branch_exists = !String::from_utf8_lossy(&check.stdout).trim().is_empty();

    // 2. 分支已有 worktree → 返回现有路径
    if branch_exists {
        let wt_output = run_git(project_dir, &["worktree", "list", "--porcelain"])?;
        let expected_ref = format!("refs/heads/{}", branch);
        for block in wt_output.split("\n\n") {
            let mut wt_path: Option<&str> = None;
            let mut wt_branch: Option<&str> = None;
            for line in block.lines() {
                if let Some(p) = line.strip_prefix("worktree ") { wt_path = Some(p); }
                if let Some(b) = line.strip_prefix("branch ") { wt_branch = Some(b); }
            }
            if wt_branch == Some(&expected_ref) {
                if let Some(p) = wt_path {
                    let canonical = std::fs::canonicalize(p)
                        .unwrap_or_else(|_| PathBuf::from(p));
                    return Ok(canonical.to_string_lossy().to_string());
                }
            }
        }
    }

    // 3. 准备 worktree 路径
    let safe_branch = branch.replace('/', "-");
    let wt_dir = Path::new(project_dir).join(".ai-studio").join("worktrees");
    std::fs::create_dir_all(&wt_dir)
        .map_err(|e| format!("Failed to create .ai-studio/worktrees: {}", e))?;
    let wt_path = wt_dir.join(&safe_branch);
    let wt_str = wt_path.to_string_lossy().to_string();

    // 4. 创建 worktree
    let (meta_base, output) = if branch_exists {
        let out = Command::new("git")
            .args(["worktree", "add", &wt_str, branch])
            .current_dir(project_dir).output()
            .map_err(|e| format!("Failed to create worktree: {}", e))?;
        (branch.to_string(), out)
    } else {
        let out = Command::new("git")
            .args(["worktree", "add", "-b", branch, &wt_str, base])
            .current_dir(project_dir).output()
            .map_err(|e| format!("Failed to create worktree: {}", e))?;
        (base.to_string(), out)
    };

    if !output.status.success() {
        return Err(format!("git worktree add failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()));
    }

    // 5. 写入 .ai-studio-meta.json
    let meta_path = wt_path.join(".ai-studio-meta.json");
    std::fs::write(&meta_path, format!("{{\"baseBranch\":\"{}\"}}", meta_base))
        .map_err(|e| format!("Failed to write meta: {}", e))?;

    // 6. 添加到 .gitignore
    let gitignore = wt_path.join(".gitignore");
    let needs_entry = if gitignore.exists() {
        let c = std::fs::read_to_string(&gitignore).unwrap_or_default();
        !c.lines().any(|l| l.trim() == ".ai-studio-meta.json")
    } else { true };
    if needs_entry {
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new().create(true).append(true)
            .open(&gitignore).map_err(|e| format!("Failed to open .gitignore: {}", e))?;
        if gitignore.exists() {
            let c = std::fs::read_to_string(&gitignore).unwrap_or_default();
            if !c.is_empty() && !c.ends_with('\n') { writeln!(f).ok(); }
        }
        writeln!(f, ".ai-studio-meta.json").ok();
    }

    let canonical = std::fs::canonicalize(&wt_path).unwrap_or(wt_path);
    Ok(canonical.to_string_lossy().to_string())
}

/// 合并 worktree 到目标分支
pub fn merge_worktree(project_dir: &str, wt_path: &str, target: Option<&str>) -> Result<String, String> {
    let wt_branch = run_git(wt_path, &["rev-parse", "--abbrev-ref", "HEAD"])?.trim().to_string();
    let target = target.map(|s| s.to_string()).unwrap_or_else(|| read_base_branch(wt_path));

    run_git(project_dir, &["checkout", &target])
        .map_err(|_| format!("切换到目标分支 '{}' 失败", target))?;

    let merge = Command::new("git").args(["merge", &wt_branch])
        .current_dir(project_dir).output()
        .map_err(|e| format!("Failed to merge: {}", e))?;

    if !merge.status.success() {
        let _ = Command::new("git").args(["merge", "--abort"])
            .current_dir(project_dir).output();
        return Err(format!("合并冲突，已自动中止。\n{}",
            String::from_utf8_lossy(&merge.stderr).trim()));
    }

    Ok(format!("成功将分支 '{}' 合并到 '{}'", wt_branch, target))
}

/// 删除 worktree 和分支
pub fn remove_worktree(project_dir: &str, wt_path: &str, branch: &str) -> Result<String, String> {
    run_git(project_dir, &["worktree", "remove", wt_path, "--force"])?;
    run_git(project_dir, &["branch", "-D", branch])?;
    Ok(format!("已删除工作树和分支 '{}'", branch))
}

/// 获取分支间增删统计
pub fn branch_diff_stats(dir: &str, base_branch: Option<&str>) -> Result<BranchDiffStats, String> {
    let base = base_branch.map(|s| s.to_string()).unwrap_or_else(|| read_base_branch(dir));
    let mut additions: u64 = 0;
    let mut deletions: u64 = 0;

    // Branch diff
    let branch_diff = run_git_unchecked(dir, &["diff", &format!("{}...HEAD", base), "--numstat"])?;
    for line in branch_diff.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            if let Ok(a) = parts[0].parse::<u64>() { additions += a; }
            if let Ok(d) = parts[1].parse::<u64>() { deletions += d; }
        }
    }

    // Unstaged + cached
    for args in &[vec!["diff", "--numstat"], vec!["diff", "--cached", "--numstat"]] {
        if let Ok(out) = run_git_unchecked(dir, args) {
            for line in out.lines() {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 2 {
                    if let Ok(a) = parts[0].parse::<u64>() { additions += a; }
                    if let Ok(d) = parts[1].parse::<u64>() { deletions += d; }
                }
            }
        }
    }

    // Untracked files
    if let Ok(out) = run_git_unchecked(dir, &["ls-files", "--others", "--exclude-standard"]) {
        for file in out.lines() {
            let full = Path::new(dir).join(file);
            if let Ok(content) = std::fs::read_to_string(&full) {
                additions += content.lines().count() as u64;
            }
        }
    }

    Ok(BranchDiffStats { additions, deletions, base_branch: base })
}

/// 从 .ai-studio-meta.json 读取 base branch
fn read_base_branch(dir: &str) -> String {
    let meta = Path::new(dir).join(".ai-studio-meta.json");
    if let Ok(content) = std::fs::read_to_string(&meta) {
        if let Some(start) = content.find("\"baseBranch\"") {
            let rest = &content[start..];
            if let Some(colon) = rest.find(':') {
                let after = rest[colon + 1..].trim();
                if after.starts_with('"') {
                    if let Some(end) = after[1..].find('"') {
                        let branch = &after[1..1 + end];
                        if !branch.is_empty() { return branch.to_string(); }
                    }
                }
            }
        }
    }
    // Fallback
    if Command::new("git").args(["rev-parse", "--verify", "main"])
        .current_dir(dir).output().map(|o| o.status.success()).unwrap_or(false) {
        return "main".to_string();
    }
    if Command::new("git").args(["rev-parse", "--verify", "master"])
        .current_dir(dir).output().map(|o| o.status.success()).unwrap_or(false) {
        return "master".to_string();
    }
    "main".to_string()
}
```

**完整实现**直接从 MuMu 的 `files/commands.rs` 移植，做以下替换：
- `#[tauri::command]` → 普通 `pub fn`
- `.mumu/worktrees/` → `.ai-studio/worktrees/`
- `.mumu-meta.json` → `.ai-studio-meta.json`
- 去掉 Tauri State 参数
- `run_git` 和 `run_git_unchecked` 从 `commands.rs` 导入（改为 `pub(crate)`）

- [ ] **Step 2: 将 `commands.rs` 中的 `run_git` 和 `run_git_unchecked` 改为 `pub(crate)`**

在 `ai-backend/src/git/commands.rs` 中：
```rust
// 改 fn run_git → pub(crate) fn run_git
// 改 fn run_git_unchecked → pub(crate) fn run_git_unchecked
```

- [ ] **Step 3: 验证编译**

```bash
cd ai-backend && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/git/
git commit -m "feat(backend): 实现 worktree 和 branch_diff_stats 命令"
```

---

### Task 4: 将 git 命令接入 router

**Files:**
- Modify: `ai-backend/src/router.rs`

- [ ] **Step 1: 在 `router.rs` 顶部添加 git 模块引用**

```rust
use crate::git::{commands as git_cmd, worktree as git_wt};
```

- [ ] **Step 2: 在 `handle_request` 的 match 中添加 `git.*` 路由**

在 `"session.kill"` 分支之后、`_ =>` 之前添加：

```rust
"git.check_repo" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let is_repo = git_cmd::check_repo(dir);
    Response::ok(req.id, json!({"is_repo": is_repo}))
}

"git.init" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    match git_cmd::init(dir) {
        Ok(()) => Response::ok(req.id, json!({})),
        Err(e) => ErrorResponse::new(req.id, 2001, e),
    }
}

"git.info" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    match git_cmd::git_info(dir) {
        Ok(info) => Response::ok(req.id, serde_json::to_value(info).unwrap()),
        Err(e) => ErrorResponse::new(req.id, 2002, e),
    }
}

"git.changes" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    match git_cmd::git_changes(dir) {
        Ok(changes) => Response::ok(req.id, json!(changes)),
        Err(e) => ErrorResponse::new(req.id, 2003, e),
    }
}

"git.diff" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let file = req.params.get("file").and_then(|v| v.as_str()).unwrap_or("");
    match git_cmd::git_diff(dir, file) {
        Ok(diff) => Response::ok(req.id, serde_json::to_value(diff).unwrap()),
        Err(e) => ErrorResponse::new(req.id, 2004, e),
    }
}

"git.stage_file" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let file = req.params.get("file").and_then(|v| v.as_str()).unwrap_or("");
    match git_cmd::stage_file(dir, file) {
        Ok(()) => Response::ok(req.id, json!({})),
        Err(e) => ErrorResponse::new(req.id, 2005, e),
    }
}

"git.unstage_file" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let file = req.params.get("file").and_then(|v| v.as_str()).unwrap_or("");
    match git_cmd::unstage_file(dir, file) {
        Ok(()) => Response::ok(req.id, json!({})),
        Err(e) => ErrorResponse::new(req.id, 2006, e),
    }
}

"git.discard_file" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let file = req.params.get("file").and_then(|v| v.as_str()).unwrap_or("");
    match git_cmd::discard_file(dir, file) {
        Ok(()) => Response::ok(req.id, json!({})),
        Err(e) => ErrorResponse::new(req.id, 2007, e),
    }
}

"git.commit" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let message = req.params.get("message").and_then(|v| v.as_str()).unwrap_or("");
    match git_cmd::commit(dir, message) {
        Ok(hash) => Response::ok(req.id, json!({"hash": hash})),
        Err(e) => ErrorResponse::new(req.id, 2008, e),
    }
}

"git.branches" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    match git_cmd::branches(dir) {
        Ok(branches) => Response::ok(req.id, json!(branches)),
        Err(e) => ErrorResponse::new(req.id, 2009, e),
    }
}

"git.log" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let count = req.params.get("count").and_then(|v| v.as_u64()).unwrap_or(50) as u32;
    match git_cmd::log(dir, count) {
        Ok(log) => Response::ok(req.id, json!(log)),
        Err(e) => ErrorResponse::new(req.id, 2010, e),
    }
}

"git.worktrees" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    match git_wt::list_worktrees(dir) {
        Ok(wts) => Response::ok(req.id, json!(wts)),
        Err(e) => ErrorResponse::new(req.id, 2011, e),
    }
}

"git.create_worktree" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let branch = req.params.get("branch").and_then(|v| v.as_str()).unwrap_or("");
    let base = req.params.get("base").and_then(|v| v.as_str()).unwrap_or("main");
    match git_wt::create_worktree(dir, branch, base) {
        Ok(path) => Response::ok(req.id, json!({"path": path})),
        Err(e) => ErrorResponse::new(req.id, 2012, e),
    }
}

"git.merge_worktree" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let wt_path = req.params.get("wt_path").and_then(|v| v.as_str()).unwrap_or("");
    let target = req.params.get("target").and_then(|v| v.as_str());
    match git_wt::merge_worktree(dir, wt_path, target) {
        Ok(msg) => Response::ok(req.id, json!({"message": msg})),
        Err(e) => ErrorResponse::new(req.id, 2013, e),
    }
}

"git.remove_worktree" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let wt_path = req.params.get("wt_path").and_then(|v| v.as_str()).unwrap_or("");
    let branch = req.params.get("branch").and_then(|v| v.as_str()).unwrap_or("");
    match git_wt::remove_worktree(dir, wt_path, branch) {
        Ok(msg) => Response::ok(req.id, json!({"message": msg})),
        Err(e) => ErrorResponse::new(req.id, 2014, e),
    }
}

"git.branch_diff_stats" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let base = req.params.get("base_branch").and_then(|v| v.as_str());
    match git_wt::branch_diff_stats(dir, base) {
        Ok(stats) => Response::ok(req.id, serde_json::to_value(stats).unwrap()),
        Err(e) => ErrorResponse::new(req.id, 2015, e),
    }
}
```

- [ ] **Step 3: 验证编译**

```bash
cd ai-backend && cargo check
```

- [ ] **Step 4: 手动测试 — 启动 sidecar 并发送测试请求**

```bash
cd ai-backend && cargo build && echo '{"id":"t1","method":"git.info","params":{"dir":"'"$(pwd)"'"}}' | ./target/debug/ai-backend
```

Expected: 返回当前 ai-backend 目录的 git info JSON。

- [ ] **Step 5: Commit**

```bash
git add ai-backend/src/router.rs
git commit -m "feat(backend): 将 git 命令接入 router（git.* IPC 方法）"
```

---

### Task 5: 实现 AI commit message 生成

**Files:**
- Modify: `ai-backend/src/session/manager.rs` — 新增 `create_ephemeral_session`
- Modify: `ai-backend/src/router.rs` — 添加 `git.generate_commit_msg` 路由

- [ ] **Step 0: 将 `SessionManager.sessions` 改为 `pub(crate)`**

在 `ai-backend/src/session/manager.rs` 中，将 `sessions` 字段从 `sessions: Arc<...>` 改为 `pub(crate) sessions: Arc<...>`，以便 router 中可以 clone 引用用于超时清理。

- [ ] **Step 1: 在 `SessionManager` 中添加 `create_ephemeral_session` 方法**

在 `ai-backend/src/session/manager.rs` 的 `impl SessionManager` 中添加：

```rust
/// 创建临时会话用于 AI commit 等一次性任务
/// 不记录历史，完成后应立即 kill
pub fn create_ephemeral_session(&mut self) -> String {
    let id = format!("ephemeral-{}", Uuid::new_v4());
    let now = chrono::Utc::now().to_rfc3339();

    let info = Session {
        id: id.clone(),
        model: "claude-sonnet-4-20250514".to_string(),
        max_tokens: 1024,
        messages: Vec::new(),
        created_at: now,
    };

    let active = ActiveSession {
        info,
        claude_process: None,
    };

    self.sessions.lock().unwrap().insert(id.clone(), active);
    id
}
```

- [ ] **Step 2: 在 `router.rs` 中添加 `git.generate_commit_msg` 路由**

```rust
"git.generate_commit_msg" => {
    let dir = req.params.get("dir").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let diff_text = req.params.get("diff_text").and_then(|v| v.as_str()).unwrap_or("").to_string();

    if diff_text.is_empty() {
        return ErrorResponse::new(req.id, 2016, "diff_text is required".into());
    }

    // 创建临时会话
    let session_id = session_manager.create_ephemeral_session();

    let prompt = format!(
        "你是一个中文母语者。根据以下代码变更，生成一行简洁的 git commit message。\n\
         格式要求：前缀 + 中文描述，不要加引号。\n\
         前缀必须是以下之一：modify: / fix: / feature: / delete: / refactor: / docs:\n\
         示例：\n\
         - modify: 修改登录页面的表单验证逻辑\n\
         - fix: 修复首页崩溃问题\n\
         - feature: 新增搜索功能\n\
         - delete: 删除废弃的工具函数\n\n\
         代码变更：\n\n{}",
        diff_text
    );

    // 发送消息（会触发 lazy spawn + normalizer → block.* 事件）
    let event_tx_clone = event_tx.clone();
    let sid = session_id.clone();
    match session_manager.send(&sid, &prompt, event_tx_clone).await {
        Ok(()) => {
            // 启动超时清理任务（通过 SessionManager 的公共方法）
            // 注意：需要将 session_manager 的 sessions Arc clone 传入
            // 为此在 SessionManager 上新增 pub fn kill_after_timeout(&self, id: String, secs: u64)
            // 或者直接在 router 中 spawn 后调 kill：
            let sessions_ref = session_manager.sessions.clone();
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                sessions_ref.lock().unwrap().remove(&sid);
            });
            Response::ok(req.id, json!({"session_id": session_id}))
        }
        Err(e) => {
            session_manager.kill(&session_id);
            ErrorResponse::new(req.id, e.code(), e.to_string())
        }
    }
}
```

**注意**：AI commit 复用现有的 block.* 事件流。前端通过 `session_id` 前缀 `ephemeral-` 判断是 commit message 生成，过滤对应的 `block.delta` 事件获取文本。

- [ ] **Step 3: 验证编译**

```bash
cd ai-backend && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add ai-backend/src/session/manager.rs ai-backend/src/router.rs
git commit -m "feat(backend): 实现 AI commit message 生成（ephemeral session + Claude CLI）"
```

---

## Chunk 2: 前端 — 类型、服务层、状态管理

### Task 6: 创建前端 Git 类型定义

**Files:**
- Create: `src/types/git.ts`

- [ ] **Step 1: 创建 `src/types/git.ts`**

```typescript
export interface GitInfo {
  branch: string
  commit_hash: string
  commit_message: string
  ahead: number
  behind: number
  has_upstream: boolean
}

export interface FileChange {
  path: string
  status: string // M/A/D/R/U/?
  additions: number
  deletions: number
}

export interface DiffOutput {
  file_path: string
  hunks: DiffHunk[]
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface DiffLine {
  line_type: string // "+", "-", " "
  old_lineno: number | null
  new_lineno: number | null
  content: string
}

export interface BranchInfo {
  name: string
  is_current: boolean
  is_remote: boolean
  last_commit_time: string
  ahead: number | null
  behind: number | null
}

export interface WorktreeInfo {
  branch: string
  path: string
  commit_hash: string
  commit_message: string
  is_main: boolean
  is_current: boolean
}

export interface CommitInfo {
  hash: string
  message: string
  author: string
  date: string
  branches: string[]
  files: CommitFile[]
}

export interface CommitFile {
  path: string
  status: string
}

export interface BranchDiffStats {
  additions: number
  deletions: number
  base_branch: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/git.ts
git commit -m "feat(frontend): 添加 Git 类型定义"
```

---

### Task 7: 创建 Git 服务层

**Files:**
- Create: `src/services/git.ts`

- [ ] **Step 1: 创建 `src/services/git.ts`**

```typescript
import type {
  GitInfo, FileChange, DiffOutput, BranchInfo,
  WorktreeInfo, CommitInfo, BranchDiffStats,
} from '@/types/git'
function isElectron(): boolean {
  return typeof window !== 'undefined' && (window as any).aiBackend !== undefined
}

async function invoke(method: string, params: Record<string, any> = {}): Promise<any> {
  if (!isElectron()) {
    throw new Error('Git operations require Electron backend')
  }
  return (window as any).aiBackend.invoke(method, params)
}

export const git = {
  async checkRepo(dir: string): Promise<boolean> {
    if (!isElectron()) return false
    const result = await invoke('git.check_repo', { dir })
    return result.is_repo
  },

  async init(dir: string): Promise<void> {
    await invoke('git.init', { dir })
  },

  async info(dir: string): Promise<GitInfo> {
    return invoke('git.info', { dir })
  },

  async changes(dir: string): Promise<FileChange[]> {
    return invoke('git.changes', { dir })
  },

  async diff(dir: string, file: string): Promise<DiffOutput> {
    return invoke('git.diff', { dir, file })
  },

  async stageFile(dir: string, file: string): Promise<void> {
    await invoke('git.stage_file', { dir, file })
  },

  async unstageFile(dir: string, file: string): Promise<void> {
    await invoke('git.unstage_file', { dir, file })
  },

  async discardFile(dir: string, file: string): Promise<void> {
    await invoke('git.discard_file', { dir, file })
  },

  async commit(dir: string, message: string): Promise<string> {
    const result = await invoke('git.commit', { dir, message })
    return result.hash
  },

  async branches(dir: string): Promise<BranchInfo[]> {
    return invoke('git.branches', { dir })
  },

  async log(dir: string, count: number = 50): Promise<CommitInfo[]> {
    return invoke('git.log', { dir, count })
  },

  async worktrees(dir: string): Promise<WorktreeInfo[]> {
    return invoke('git.worktrees', { dir })
  },

  async createWorktree(dir: string, branch: string, base: string): Promise<string> {
    const result = await invoke('git.create_worktree', { dir, branch, base })
    return result.path
  },

  async mergeWorktree(dir: string, wtPath: string, target: string): Promise<string> {
    const result = await invoke('git.merge_worktree', { dir, wt_path: wtPath, target })
    return result.message
  },

  async removeWorktree(dir: string, wtPath: string, branch: string): Promise<void> {
    await invoke('git.remove_worktree', { dir, wt_path: wtPath, branch })
  },

  async branchDiffStats(dir: string, baseBranch: string): Promise<BranchDiffStats> {
    return invoke('git.branch_diff_stats', { dir, base_branch: baseBranch })
  },

  /** AI 生成 commit message。返回 ephemeral session_id，通过 block.* 事件接收流式文本 */
  async generateCommitMsg(dir: string, diffText: string): Promise<string> {
    const result = await invoke('git.generate_commit_msg', { dir, diff_text: diffText })
    return result.session_id
  },

  /** 注册 commit message 流式事件监听（通过 block.delta 事件，过滤 ephemeral session_id） */
  onCommitMsgStream(callback: (text: string, done: boolean) => void): (() => void) | null {
    if (!isElectron()) return null
    const ab = (window as any).aiBackend
    // 保存 wrapper 引用用于正确 off
    const deltaHandler = (data: any) => {
      if (data?.session_id?.startsWith('ephemeral-')) {
        callback(data.delta || '', false)
      }
    }
    const completeHandler = (data: any) => {
      if (data?.session_id?.startsWith('ephemeral-')) {
        callback('', true)
      }
    }
    ab.on('block.delta', deltaHandler)
    ab.on('message.complete', completeHandler)
    return () => {
      ab.off('block.delta', deltaHandler)
      ab.off('message.complete', completeHandler)
    }
  },
}
```

- [ ] **Step 2: 验证类型检查**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/services/git.ts
git commit -m "feat(frontend): 创建 Git 服务层（IPC 调用封装）"
```

---

### Task 8: 更新 Session 类型和 App.tsx 状态

**Files:**
- Modify: `src/types.ts` — 移除 `diff` 字段，添加 `hasChanges`/`changeCount`
- Modify: `src/App.tsx` — 添加 `projectDir` 状态，更新 commit/discard 逻辑

- [ ] **Step 1: 更新 `src/types.ts`**

在 `Session` interface 中：
- **保留** `diff?: GitDiff | null`（暂不移除，避免 SourceControlPanel/GitReviewPanel 编译错误，在 Task 17 清理时再移除）
- 添加 `hasChanges?: boolean` 和 `changeCount?: number`

保留 `GitDiff` 和 `FileDiff` 类型定义（浏览器模式 fallback 仍需要）。

- [ ] **Step 2: 更新 `src/App.tsx`**

添加项目目录状态：
```typescript
const [projectDir, setProjectDir] = useState<string | null>(null)
const [isGitRepo, setIsGitRepo] = useState(false)
const [showGitPanel, setShowGitPanel] = useState(false)
const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
```

更新 `handleCommit`：
```typescript
const handleCommit = (sessionId: string) => {
  setSessions(prev => prev.map(s =>
    s.id === sessionId ? { ...s, status: 'done' as SessionStatus, hasChanges: false, changeCount: 0 } : s
  ))
  setReviewSessionId(null)
}
```

更新 `handleDiscard`：
```typescript
const handleDiscard = (sessionId: string) => {
  setSessions(prev => prev.map(s =>
    s.id === sessionId ? { ...s, status: 'inprocess' as SessionStatus, hasChanges: false, changeCount: 0 } : s
  ))
  setReviewSessionId(null)
}
```

传递 `projectDir`、`showGitPanel`、`focusedSessionId` 到子组件。

- [ ] **Step 3: 在 `SessionWindow.tsx` 中新增 `hasChanges` 的使用**

在 review 按钮处新增对 `session.hasChanges` 的支持（与现有 `session.diff` 逻辑并存，非替换）：
```typescript
// 新增条件（Electron 模式用 hasChanges，浏览器模式仍用 diff）
const showReview = session.status === 'review' && (
  session.hasChanges || (session.diff && (session.diff.totalAdditions > 0 || session.diff.totalDeletions > 0))
)
```

**不动** SourceControlPanel 和 GitReviewPanel 的现有 `session.diff` 引用（Task 17 统一清理）。

- [ ] **Step 4: 验证类型检查**

```bash
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/App.tsx src/components/SessionWindow.tsx
git commit -m "feat(frontend): 更新 Session 类型（hasChanges 替代 diff），添加 projectDir 状态"
```

---

## Chunk 3: 前端 — GitPanel 侧边栏组件

### Task 9: 创建 GitPanel 三 Tab 容器

**Files:**
- Create: `src/components/git/GitPanel.tsx`

- [ ] **Step 1: 创建 `GitPanel.tsx`**

三 Tab 面板容器（Changes/Git/Files），右侧滑入，可拖拽调宽。

参考 MuMu 的 `FileManagerPanel/index.tsx` 结构：
- 默认宽度 360px，范围 280-800px
- 左边缘 6px 拖拽手柄
- Tab 栏：Changes（带 badge 显示变更数）/ Git / Files
- 接收 `projectDir`、`focusedSessionId`、sessions 列表
- 根据 focusedSessionId 确定 workingDir：`sessions[focusedId].worktree ?? projectDir`

Props:
```typescript
interface GitPanelProps {
  isOpen: boolean
  onClose: () => void
  projectDir: string
  sessions: Session[]
  focusedSessionId: string | null
  onSessionUpdate: (id: string, updates: Partial<Session>) => void
}
```

- [ ] **Step 2: 验证类型检查**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/components/git/GitPanel.tsx
git commit -m "feat(frontend): 创建 GitPanel 三 Tab 容器组件"
```

- [ ] **Step 4: 创建 `FilesTab.tsx` 占位组件**

```typescript
// src/components/git/FilesTab.tsx
export function FilesTab() {
  return (
    <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
      文件树（即将推出）
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/git/GitPanel.tsx src/components/git/FilesTab.tsx
git commit -m "feat(frontend): 创建 GitPanel 三 Tab 容器和 FilesTab 占位组件"
```

---

### Task 10: 创建 ChangesTab 组件

**Files:**
- Create: `src/components/git/ChangesTab.tsx`
- Create: `src/components/git/DiffView.tsx`

- [ ] **Step 1: 创建 `ChangesTab.tsx`**

参考 MuMu 的 `ChangesTab.tsx`：
- 两种模式：列表模式 / Diff 模式
- 列表模式：CommitSection + 文件变更列表 + Graph
- Diff 模式：返回按钮 + 文件名 + DiffView
- 调用 `git.changes(workingDir)` 获取变更列表
- 点击文件 → `setDiffFile(path)` → 切换到 diff 模式
- 文件行显示状态字母（M/A/D）+ 增删行数 + discard 按钮

Props:
```typescript
interface ChangesTabProps {
  workingDir: string
  refreshKey: number  // 递增触发重新获取 changes（commit/AI响应后由父组件递增）
  onCommitSuccess: () => void
}
```

- [ ] **Step 2: 创建 `DiffView.tsx`**

结构化 hunk diff 渲染器，使用新的 `DiffHunk/DiffLine` 数据格式。

参考 MuMu 的 ChangesTab 中的 diff 渲染部分：
- 按 hunk 显示，每个 hunk 有蓝色 header
- 双列行号（old_lineno / new_lineno）
- 增删行颜色编码（绿/红背景）
- Monospace 字体

Props:
```typescript
interface DiffViewProps {
  hunks: DiffHunk[]
}
```

- [ ] **Step 3: 验证类型检查**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/components/git/ChangesTab.tsx src/components/git/DiffView.tsx
git commit -m "feat(frontend): 创建 ChangesTab 和 DiffView 组件"
```

---

### Task 11: 创建 CommitSection 和 CommitGraph

**Files:**
- Create: `src/components/git/CommitSection.tsx`
- Create: `src/components/git/CommitGraph.tsx`

- [ ] **Step 1: 创建 `CommitSection.tsx`**

参考 MuMu 的 ChangesTab 中 CommitSection：
- Auto-resize textarea（1-10 行，min 34px, max 216px）
- AI Generate 按钮（Sparkles 图标，⌘G 快捷键）
- Commit 按钮（Check 图标，⌘Enter 快捷键）
- Generate 逻辑：收集前 10 个变更文件的 diff，拼接，调用 `git.generateCommitMsg`，监听流式事件累积文本
- Commit 逻辑：调用 `git.commit(workingDir, message)`，成功后清空 message，触发刷新

Props:
```typescript
interface CommitSectionProps {
  workingDir: string
  changes: FileChange[]
  branch: string
  onCommitSuccess: () => void
}
```

- [ ] **Step 2: 创建 `CommitGraph.tsx`**

参考 MuMu 的 ChangesTab 中 Graph 区域：
- 折叠区域，标题 "Graph"
- 调用 `git.log(workingDir, 50)` 获取 commit 历史
- 每条 commit：圆点 + message + 分支 badges
- 可展开查看变更文件列表

Props:
```typescript
interface CommitGraphProps {
  workingDir: string
}
```

- [ ] **Step 3: 验证类型检查**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/components/git/CommitSection.tsx src/components/git/CommitGraph.tsx
git commit -m "feat(frontend): 创建 CommitSection（AI 生成 + 提交）和 CommitGraph 组件"
```

---

### Task 12: 创建 GitTab 组件

**Files:**
- Create: `src/components/git/GitTab.tsx`

- [ ] **Step 1: 创建 `GitTab.tsx`**

参考 MuMu 的 `GitTab.tsx`：

**分支状态栏**：
- 分支名 + commit hash + commit message
- Ahead/behind badges

**Worktrees 折叠区**：
- 调用 `git.worktrees(projectDir)` 获取列表
- 卡片式展示，当前 worktree 高亮
- 非当前显示 Merge / Delete 按钮

**Branches 折叠区**：
- 调用 `git.branches(workingDir)` 获取列表
- 当前分支 ✓ 标记
- 本地/远程分组
- Ahead/behind badges + last commit time

Props:
```typescript
interface GitTabProps {
  workingDir: string
  projectDir: string
  onMerge: (wtPath: string, branch: string) => void
  onDiscard: (wtPath: string, branch: string) => void
}
```

- [ ] **Step 2: 验证类型检查**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/components/git/GitTab.tsx
git commit -m "feat(frontend): 创建 GitTab 组件（分支 + worktree 管理）"
```

---

## Chunk 4: 前端 — 集成与收尾

### Task 13: 添加 Electron 目录选择器 IPC

**Files:**
- Modify: `electron/main.ts` — 添加 `dialog:openDirectory` IPC handler
- Modify: `electron/preload.ts` — 暴露 `openDirectory` 方法
- Modify: `src/types/electron.d.ts` — 更新类型声明

- [ ] **Step 1: 在 `electron/main.ts` 中添加 IPC handler**

```typescript
import { dialog } from 'electron'

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: '选择项目目录',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  // 持久化到 electron-store
  store.set('lastProjectDir', result.filePaths[0])
  return result.filePaths[0]
})

ipcMain.handle('config:getLastProjectDir', () => {
  return store.get('lastProjectDir', null)
})
```

- [ ] **Step 2: 在 `electron/preload.ts` 中暴露**

```typescript
openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
getLastProjectDir: () => ipcRenderer.invoke('config:getLastProjectDir'),
```

- [ ] **Step 3: 更新 `src/types/electron.d.ts`**

```typescript
interface AiBackend {
  // ... existing methods
  openDirectory(): Promise<string | null>
  getLastProjectDir(): Promise<string | null>
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/preload.ts src/types/electron.d.ts
git commit -m "feat(electron): 添加目录选择器和 lastProjectDir 持久化"
```

---

### Task 14: 更新 NewSessionModal 支持 Worktree

> 注：以下 Task 编号因插入 Task 13 而顺延

**Files:**
- Modify: `src/components/NewSessionModal.tsx`

- [ ] **Step 1: 添加 worktree 选项区域**

在 NewSessionModal 中添加：
- 勾选框 "Create in Worktree"
- 勾选后显示：Base Branch 下拉（从 `git.branches` 获取）+ New Branch 输入框
- 分支名存在性校验
- 创建流程：勾选 worktree → 先调 `git.createWorktree` → 用返回 path 作为 session 的 workingDir 和 worktree

需要接收 `projectDir` 和 `isGitRepo` props。

- [ ] **Step 2: 验证类型检查**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/components/NewSessionModal.tsx
git commit -m "feat(frontend): NewSessionModal 添加 worktree 创建支持"
```

---

### Task 14: 创建 MergeDialog 和 DiscardWorktreeDialog

**Files:**
- Create: `src/components/git/MergeDialog.tsx`
- Create: `src/components/git/DiscardWorktreeDialog.tsx`

- [ ] **Step 1: 创建 `MergeDialog.tsx`**

参考 MuMu 的 `MergeDialog.tsx`：
- 选择目标分支下拉
- 勾选"合并后删除 worktree"
- 确认按钮调用 `git.mergeWorktree` + 可选 `git.removeWorktree`
- 错误显示

- [ ] **Step 2: 创建 `DiscardWorktreeDialog.tsx`**

参考 MuMu 的 `DiscardWorktreeDialog.tsx`：
- 警告图标 + 确认文本
- 确认按钮调用 `git.removeWorktree`

- [ ] **Step 3: 验证类型检查**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/components/git/MergeDialog.tsx src/components/git/DiscardWorktreeDialog.tsx
git commit -m "feat(frontend): 创建 MergeDialog 和 DiscardWorktreeDialog"
```

---

### Task 15: 更新 SessionWindow（真实 git 变更检测）

**Files:**
- Modify: `src/components/SessionWindow.tsx`

- [ ] **Step 1: 替换 mock diff 为真实 git 调用**

在 `handleMessageComplete`（或 `onMessageComplete` 回调）中：
- 移除 `generateMockDiff()` 调用
- 添加：
```typescript
// AI 消息完成后检测 git 变更
if (isElectron() && workingDir) {
  const changes = await git.changes(workingDir)
  if (changes.length > 0) {
    onUpdate(session.id, {
      hasChanges: true,
      changeCount: changes.length,
      status: 'review',
    })
  }
}
```

- [ ] **Step 2: 更新 review 按钮渲染条件**

```typescript
// 旧: session.status === 'review' && session.diff && (session.diff.totalAdditions > 0 || session.diff.totalDeletions > 0)
// 新:
session.status === 'review' && session.hasChanges
```

- [ ] **Step 3: 需要接收 `projectDir` prop 并计算 workingDir**

```typescript
const workingDir = session.worktree ?? projectDir
```

- [ ] **Step 4: 验证类型检查**

```bash
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "feat(frontend): SessionWindow 接入真实 git 变更检测"
```

---

### Task 16: 将 GitPanel 接入 App.tsx

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/TopBar.tsx`（添加 git panel 切换按钮）

- [ ] **Step 1: 在 App.tsx 中渲染 GitPanel**

```typescript
import { GitPanel } from './components/git/GitPanel'

// 在 JSX 中添加（和 GitReviewPanel 同级）：
<GitPanel
  isOpen={showGitPanel}
  onClose={() => setShowGitPanel(false)}
  projectDir={projectDir ?? ''}
  sessions={sessions}
  focusedSessionId={focusedSessionId}
  onSessionUpdate={(id, updates) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }}
/>
```

- [ ] **Step 2: 在 TopBar 中添加 Git 按钮**

添加 GitBranch 图标按钮，点击切换 `showGitPanel`。

- [ ] **Step 3: 传递 focusedSessionId 到各 View**

在 CanvasView / BoardView / TabView 中，session 点击时调用 `setFocusedSessionId`。

- [ ] **Step 4: Electron 启动时选择项目目录**

在 App.tsx 中添加启动逻辑：
```typescript
useEffect(() => {
  if (isElectron()) {
    // 使用 Electron dialog 选择项目目录
    // 或从 electron-store 读取上次打开的目录
  }
}, [])
```

- [ ] **Step 5: 验证类型检查和开发运行**

```bash
npm run lint && npm run dev
```

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/TopBar.tsx
git commit -m "feat(frontend): 将 GitPanel 接入 App.tsx，添加 TopBar git 按钮"
```

---

### Task 17: 清理旧 mock 引用和已替换组件

**Files:**
- Modify: `src/components/git/GitReviewPanel.tsx` — 更新数据源为实时 IPC
- Delete or deprecate: `src/components/GitSidebar.tsx`（如果存在旧侧边栏）
- Modify: `src/components/git/SourceControlPanel.tsx` — 替换 mock commit graph 和 generateCommitMessage

- [ ] **Step 1: 更新 GitReviewPanel 数据源**

- 打开面板时调用 `git.changes(workingDir)` 获取文件列表（替代 `session.diff.files`）
- 点击文件时调用 `git.diff(workingDir, file)` 获取 hunk 数据
- 复用新的 DiffView 组件渲染

- [ ] **Step 2: 更新 SourceControlPanel**

- commit graph 调用 `git.log()` 获取真实数据
- commit message 生成调用 `git.generateCommitMsg()` 并监听流式事件
- commit 按钮调用 `git.commit()`

- [ ] **Step 3: 最终移除 `Session.diff` 字段**

现在所有组件已迁移到真实 git 数据，从 `src/types.ts` 的 `Session` interface 中移除 `diff?: GitDiff | null` 字段。修复残余编译错误（如有）。

- [ ] **Step 4: 验证编译和完整流程**

```bash
npm run lint && npm run dev
```

手动测试：
1. 打开 Electron 应用 → 选择项目目录
2. 创建 session → 发送消息 → AI 响应后检查 review 按钮
3. 打开 GitPanel → Changes Tab → 查看变更列表
4. 点击文件 → 查看 diff
5. AI Generate commit message → 等待流式文本
6. Commit → 验证 changes 刷新

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 清理 mock 引用，GitReviewPanel 和 SourceControlPanel 接入真实 git"
```

---

### Task 18: 最终构建验证

**Files:** None (verification only)

- [ ] **Step 1: Rust 后端编译**

```bash
cd ai-backend && cargo build
```

- [ ] **Step 2: 前端类型检查**

```bash
npm run lint
```

- [ ] **Step 3: 前端构建**

```bash
npm run build
```

- [ ] **Step 4: Electron 构建（如需要）**

```bash
npm run build:electron
```

- [ ] **Step 5: 最终 Commit（如有遗留修复）**

```bash
git add -A
git commit -m "fix: 构建验证修复"
```
