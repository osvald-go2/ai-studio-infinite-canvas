import React, { useState } from 'react';
import { X, GitBranch, FolderGit2 } from 'lucide-react';

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, model: string, gitBranch: string, worktree: string, initialPrompt: string) => void;
}

const ClaudeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.5 12.5L19 15L21.5 15.5L20 17.5L20.5 20L18 19L16 21L14.5 18.5L12 19L13.5 16.5L11.5 14.5L14 13.5L15.5 11L17.5 12.5Z" fill="currentColor" />
    <path d="M6.5 11.5L5 9L2.5 8.5L4 6.5L3.5 4L6 5L8 3L9.5 5.5L12 5L10.5 7.5L12.5 9.5L10 10.5L8.5 13L6.5 11.5Z" fill="currentColor" />
  </svg>
);

const CodexIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v4h-2zm0 6h2v4h-2z"/>
  </svg>
);

const GeminiIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C12 7.52285 16.4772 12 22 12C16.4772 12 12 16.4772 12 22C12 16.4772 7.52285 12 2 12C7.52285 12 12 7.52285 12 2Z" fill="currentColor"/>
  </svg>
);

const MODELS = [
  { id: 'claude-code', name: 'Claude Code', icon: ClaudeIcon },
  { id: 'codex', name: 'Codex', icon: CodexIcon },
  { id: 'gemini-cli', name: 'Gemini CLI', icon: GeminiIcon },
];

export function NewSessionModal({ isOpen, onClose, onCreate }: NewSessionModalProps) {
  const [title, setTitle] = useState('');
  const [model, setModel] = useState('claude-code');
  const [gitBranch, setGitBranch] = useState('main');
  const [worktree, setWorktree] = useState('default');
  const [initialPrompt, setInitialPrompt] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate(title, model, gitBranch, worktree, initialPrompt);
    setTitle('');
    setModel('claude-code');
    setGitBranch('main');
    setWorktree('default');
    setInitialPrompt('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-[#3B3F4F]/95 backdrop-blur-2xl border border-white/10 rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-black/20">
          <h2 className="text-lg font-medium text-white">New Session</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-white/20 focus:bg-black/30 transition-all placeholder-gray-500"
              placeholder="e.g., Database Migration"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">Model</label>
            <div className="grid grid-cols-3 gap-3">
              {MODELS.map((m) => {
                const Icon = m.icon;
                const isSelected = model === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModel(m.id)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all ${
                      isSelected 
                        ? 'bg-white/10 border-white/20 text-white shadow-inner' 
                        : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200'
                    }`}
                  >
                    <Icon />
                    <span className="text-xs font-medium">{m.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-1.5">
                <GitBranch size={16} className="text-gray-500" /> Git Branch
              </label>
              <input
                type="text"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-white/20 focus:bg-black/30 transition-all text-sm placeholder-gray-500"
                placeholder="e.g., main"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-1.5">
                <FolderGit2 size={16} className="text-gray-500" /> Worktree
              </label>
              <input
                type="text"
                value={worktree}
                onChange={(e) => setWorktree(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-white/20 focus:bg-black/30 transition-all text-sm placeholder-gray-500"
                placeholder="e.g., default"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Initial Prompt (初始提示词)</label>
            <textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-white/20 focus:bg-black/30 transition-all resize-none h-28 text-sm placeholder-gray-500 custom-scrollbar"
              placeholder="Enter the initial prompt to send to the session..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-6 py-2.5 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/5 hover:border-white/10"
            >
              Create Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
