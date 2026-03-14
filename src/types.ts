export type SessionStatus = 'inbox' | 'inprocess' | 'review' | 'done';

export interface FileDiff {
  filename: string;
  status: 'M' | 'A' | 'D';
  additions: number;
  deletions: number;
  patch: string;
}

export interface GitDiff {
  totalAdditions: number;
  totalDeletions: number;
  files: FileDiff[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type?: 'text' | 'input_required' | 'code';
}

export interface Session {
  id: string;
  title: string;
  model: string;
  gitBranch?: string;
  worktree?: string;
  status: SessionStatus;
  position: { x: number; y: number };
  messages: Message[];
  diff?: GitDiff | null;
}
