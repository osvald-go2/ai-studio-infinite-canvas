export type SessionStatus = 'inbox' | 'inprocess' | 'review' | 'done';

export type ContentBlock =
  | { type: 'text'; content: string }
  | { type: 'code'; code: string; language: string }
  | { type: 'tool_call'; tool: string; args: string; description?: string; duration?: number; status: 'running' | 'done' | 'error' }
  | { type: 'todolist'; items: TodoItem[] }
  | { type: 'subagent'; agentId: string; task: string; status: 'launched' | 'working' | 'done' | 'error'; summary?: string; blocks?: ContentBlock[] }
  | { type: 'askuser'; questions: AskUserQuestion[]; submitted?: boolean }
  | { type: 'skill'; skill: string; args?: string; status: 'invoking' | 'done'; duration?: number }
  | { type: 'file_changes'; title: string; files: FileChangeItem[] }
  | { type: 'form_table'; title?: string; columns: FormTableColumn[]; rows: Record<string, string>[]; submitLabel?: string };

export interface FormTableColumn {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'select';
  options?: string[];
}

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
  timestamp?: number;
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
  hasChanges?: boolean;
  changeCount?: number;
  height?: number;
  prevHeight?: number;
  claudeSessionId?: string;
}

export interface DbProject {
  id: number;
  name: string;
  path: string;
  view_mode: string;
  canvas_x: number;
  canvas_y: number;
  canvas_zoom: number;
  last_opened_at: string;
  created_at: string;
}

export interface DbSession {
  id: string;
  project_id: number;
  title: string;
  model: string;
  status: string;
  position_x: number;
  position_y: number;
  height: number | null;
  git_branch: string | null;
  worktree: string | null;
  messages: string;
  created_at: string;
  updated_at: string;
  claude_session_id: string | null;
}

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  source: 'project' | 'user';
  pluginName?: string;
}
