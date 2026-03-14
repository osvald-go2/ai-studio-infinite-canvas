import React, { useState, useEffect } from 'react';
import { X, Check, Trash2, FileText, Plus, Minus } from 'lucide-react';
import { Session, FileDiff } from '../types';

interface GitSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  onCommit: (message: string) => void;
  onDiscard: () => void;
  onViewFile: (file: FileDiff) => void;
}

export function GitSidebar({ isOpen, onClose, session, onCommit, onDiscard, onViewFile }: GitSidebarProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [cachedSession, setCachedSession] = useState<Session | null>(null);

  // Cache the session so the sidebar content doesn't disappear instantly during the slide-out animation
  useEffect(() => {
    if (isOpen && session && session.diff) {
      setCachedSession(session);
    }
  }, [isOpen, session]);

  const displaySession = (isOpen && session?.diff) ? session : cachedSession;

  const handleCommit = () => {
    if (commitMessage.trim()) {
      onCommit(commitMessage);
      setCommitMessage('');
    }
  };

  return (
    <>
      {/* Backdrop Overlay */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className={`fixed inset-y-0 right-0 w-[450px] bg-[#2B2D3A]/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl transform transition-transform duration-300 ease-out z-50 flex flex-col ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-black/20">
          <h2 className="text-sm font-medium text-gray-200 uppercase tracking-wider">Source Control</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {displaySession && displaySession.diff ? (
          <>
            {/* Commit Input */}
            <div className="p-5 border-b border-white/10 space-y-4 bg-black/10">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Message (Ctrl+Enter to commit)"
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10 transition-all resize-none h-28 custom-scrollbar"
              />
              <div className="flex gap-2">
                <button 
                  onClick={handleCommit}
                  disabled={!commitMessage.trim()}
                  className="flex-1 bg-blue-600/80 hover:bg-blue-600 disabled:bg-white/5 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-blue-500/50 disabled:border-transparent shadow-lg shadow-blue-900/20 disabled:shadow-none"
                >
                  <Check size={16} />
                  Commit
                </button>
                <button 
                  onClick={onDiscard}
                  className="px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-medium flex items-center justify-center transition-colors border border-red-500/20"
                  title="Discard All Changes"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
              <div className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center justify-between">
                <span>Changes</span>
                <span className="bg-white/10 text-gray-300 px-2.5 py-0.5 rounded-full">{displaySession.diff.files.length}</span>
              </div>
              <div className="mt-1 px-3 space-y-1">
                {displaySession.diff.files.map((file, idx) => (
                  <div 
                    key={idx}
                    onClick={() => onViewFile(file)}
                    className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-white/5 cursor-pointer group transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileText size={16} className="text-gray-500 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                      <span className="text-sm text-gray-300 truncate group-hover:text-white transition-colors">{file.filename}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-mono font-medium px-2 py-1 rounded-md ${
                        file.status === 'M' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' : 
                        file.status === 'A' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
                        'bg-red-500/10 text-red-500 border border-red-500/20'
                      }`}>
                        {file.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            No active changes
          </div>
        )}
      </div>
    </>
  );
}
