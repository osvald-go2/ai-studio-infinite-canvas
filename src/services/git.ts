import type {
  GitInfo,
  FileChange,
  DiffOutput,
  BranchInfo,
  WorktreeInfo,
  CommitInfo,
  BranchDiffStats,
} from '../types/git';

function isElectron(): boolean {
  return typeof window !== 'undefined' && (window as any).aiBackend !== undefined;
}

async function invoke<T>(method: string, params?: any): Promise<T> {
  return (window as any).aiBackend.invoke(method, params) as Promise<T>;
}

export const gitService = {
  async checkRepo(path: string): Promise<boolean> {
    if (!isElectron()) return false;
    const result = await invoke<{ is_repo: boolean }>('git.check_repo', { path });
    return result.is_repo;
  },

  async init(path: string): Promise<void> {
    if (!isElectron()) return;
    await invoke<void>('git.init', { path });
  },

  async info(path: string): Promise<GitInfo> {
    if (!isElectron()) {
      return {
        branch: 'main',
        commit_hash: '',
        commit_message: '',
        ahead: 0,
        behind: 0,
        has_upstream: false,
      };
    }
    return invoke<GitInfo>('git.info', { path });
  },

  async changes(path: string): Promise<FileChange[]> {
    if (!isElectron()) return [];
    const result = await invoke<{ changes: FileChange[] }>('git.changes', { path });
    return result.changes;
  },

  async diff(path: string, filePath: string): Promise<DiffOutput> {
    if (!isElectron()) {
      return { file_path: filePath, hunks: [] };
    }
    return invoke<DiffOutput>('git.diff', { path, file_path: filePath });
  },

  async stageFile(path: string, filePath: string): Promise<void> {
    if (!isElectron()) return;
    await invoke<void>('git.stage_file', { path, file_path: filePath });
  },

  async unstageFile(path: string, filePath: string): Promise<void> {
    if (!isElectron()) return;
    await invoke<void>('git.unstage_file', { path, file_path: filePath });
  },

  async discardFile(path: string, filePath: string): Promise<void> {
    if (!isElectron()) return;
    await invoke<void>('git.discard_file', { path, file_path: filePath });
  },

  async commit(path: string, message: string): Promise<void> {
    if (!isElectron()) return;
    await invoke<void>('git.commit', { path, message });
  },

  async branches(path: string): Promise<BranchInfo[]> {
    if (!isElectron()) return [];
    const result = await invoke<{ branches: BranchInfo[] }>('git.branches', { path });
    return result.branches;
  },

  async log(path: string, limit?: number): Promise<CommitInfo[]> {
    if (!isElectron()) return [];
    const result = await invoke<{ commits: CommitInfo[] }>('git.log', { path, limit });
    return result.commits;
  },

  async worktrees(path: string): Promise<WorktreeInfo[]> {
    if (!isElectron()) return [];
    const result = await invoke<{ worktrees: WorktreeInfo[] }>('git.worktrees', { path });
    return result.worktrees;
  },

  async createWorktree(path: string, branch: string, worktreePath: string): Promise<void> {
    if (!isElectron()) return;
    await invoke<void>('git.create_worktree', { path, branch, worktree_path: worktreePath });
  },

  async mergeWorktree(path: string, branch: string): Promise<void> {
    if (!isElectron()) return;
    await invoke<void>('git.merge_worktree', { path, branch });
  },

  async removeWorktree(path: string, worktreePath: string): Promise<void> {
    if (!isElectron()) return;
    await invoke<void>('git.remove_worktree', { path, worktree_path: worktreePath });
  },

  async branchDiffStats(path: string, branch: string, baseBranch?: string): Promise<BranchDiffStats> {
    if (!isElectron()) {
      return { additions: 0, deletions: 0, base_branch: baseBranch ?? 'main' };
    }
    return invoke<BranchDiffStats>('git.branch_diff_stats', { path, branch, base_branch: baseBranch });
  },

  async generateCommitMsg(path: string): Promise<string> {
    if (!isElectron()) return `ephemeral-mock-${Date.now()}`;
    const result = await invoke<{ session_id: string }>('git.generate_commit_msg', { path });
    return result.session_id;
  },

  onCommitMsgStream(
    sessionId: string,
    onDelta: (text: string) => void
  ): () => void {
    if (!isElectron()) return () => {};

    const wrapper = (data: { session_id: string; block_index: number; delta: any }) => {
      if (!data.session_id.startsWith('ephemeral-')) return;
      if (data.session_id !== sessionId) return;
      if (data.delta?.content) {
        onDelta(data.delta.content);
      }
    };

    (window as any).aiBackend.on('block.delta', wrapper);

    return () => {
      (window as any).aiBackend.off('block.delta', wrapper);
    };
  },
};
