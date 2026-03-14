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
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 pr-10 text-[15px] text-white placeholder-gray-600 outline-none focus:border-white/15 transition-all resize-none h-20 custom-scrollbar"
          />
          <button
            onClick={onGenerateCommitMessage}
            disabled={isGeneratingCommit}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 disabled:opacity-50 flex items-center justify-center border border-purple-500/20 transition-colors"
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
            className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-white/5 disabled:text-gray-500 disabled:cursor-not-allowed text-blue-400 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-blue-500/20 disabled:border-transparent"
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
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer group transition-all ${
                  isSelected ? 'bg-white/10 shadow-lg shadow-blue-500/10' : 'hover:bg-white/5'
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
