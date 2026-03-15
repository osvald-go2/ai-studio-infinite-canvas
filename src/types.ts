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

export type ContentBlock =
  | { type: 'text'; content: string }
  | { type: 'code'; code: string; language: string }
  | { type: 'tool_call'; tool: string; args: string; description?: string; duration?: number; status: 'running' | 'done' | 'error' }
  | { type: 'todolist'; items: TodoItem[] }
  | { type: 'subagent'; agentId: string; task: string; status: 'launched' | 'working' | 'done' | 'error'; summary?: string; blocks?: ContentBlock[] }
  | { type: 'askuser'; questions: AskUserQuestion[]; submitted?: boolean }
  | { type: 'skill'; skill: string; args?: string; status: 'invoking' | 'done'; duration?: number }
  | { type: 'file_changes'; title: string; files: FileChangeItem[] };

export interface FileChangeItem {
  path: string;
  status: 'new' | 'modified' | 'deleted' | 'renamed';
}

export interface AskUserQuestion {
  id: string;
  question: string;
  options?: string[];
  response?: string;
}

export interface TodoItem {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'done';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type?: 'text' | 'input_required' | 'code';
  blocks?: ContentBlock[];
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
  height?: number;
  prevHeight?: number;
}
