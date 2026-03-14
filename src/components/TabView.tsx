import React, { useState, useEffect } from 'react';
import { Session } from '../types';
import { SessionWindow } from './SessionWindow';
import { MessageSquare, GitBranch, FolderGit2, Search } from 'lucide-react';

export function TabView({ 
  sessions, 
  setSessions, 
  onOpenReview,
  focusedSessionId
}: { 
  sessions: Session[], 
  setSessions: any, 
  onOpenReview: (id: string) => void,
  focusedSessionId?: string | null
}) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessions[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState('');

  // Handle focusing on a specific session from global search
  useEffect(() => {
    if (focusedSessionId) {
      setActiveSessionId(focusedSessionId);
    }
  }, [focusedSessionId]);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-full h-full flex bg-black/20 backdrop-blur-sm">
      {/* Left Sidebar - Session List */}
      <div className="w-80 border-r border-white/10 flex flex-col bg-[#2B2D3A]/80">
        <div className="p-4 border-b border-white/10">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input 
              type="text"
              placeholder="Filter sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredSessions.map(session => (
            <button
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`w-full text-left p-3 rounded-xl transition-all duration-200 group ${
                activeSessionId === session.id 
                  ? 'bg-blue-500/20 border border-blue-500/30 shadow-lg shadow-blue-500/10' 
                  : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className={`font-medium truncate ${activeSessionId === session.id ? 'text-blue-400' : 'text-gray-200 group-hover:text-white'}`}>
                  {session.title}
                </h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-semibold shrink-0 ${
                  session.status === 'inbox' ? 'bg-blue-500/20 text-blue-400' :
                  session.status === 'inprocess' ? 'bg-amber-500/20 text-amber-400' :
                  session.status === 'review' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {session.status}
                </span>
              </div>
              
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                <div className="flex items-center gap-1">
                  <GitBranch size={12} />
                  <span className="truncate max-w-[80px]">{session.gitBranch || 'main'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <FolderGit2 size={12} />
                  <span className="truncate max-w-[80px]">{session.worktree || 'default'}</span>
                </div>
              </div>
            </button>
          ))}
          
          {filteredSessions.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              No sessions found
            </div>
          )}
        </div>
      </div>

      {/* Right Content - Full Screen Session */}
      <div className="flex-1 relative overflow-hidden flex bg-[#1A1A2E]">
        {activeSession ? (
          <SessionWindow 
            session={activeSession} 
            onUpdate={(updated) => {
              setSessions((prev: Session[]) => prev.map(s => s.id === updated.id ? updated : s));
            }} 
            onOpenReview={() => onOpenReview(activeSession.id)} 
            fullScreen={true}
          />
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full text-gray-500 gap-4">
            <MessageSquare size={48} className="opacity-20" />
            <p>Select a session from the sidebar to view</p>
          </div>
        )}
      </div>
    </div>
  );
}
