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
    <div className="w-full h-full flex">
      {/* Left Sidebar - Session List */}
      <div className="w-80 flex flex-col bg-[#1A1512CC]">
        <div className="p-3">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
            <Search size={16} className="text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-1 space-y-0.5">
          {filteredSessions.map(session => (
            <button
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`w-full text-left rounded-lg transition-all duration-200 group px-4 py-2.5 ${
                activeSessionId === session.id
                  ? 'bg-[#3B82F633] border border-[#3B82F64D]'
                  : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-white truncate">
                  {session.title}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-semibold shrink-0 tracking-wide ${
                  session.status === 'inbox' ? 'bg-[#3B82F633] text-[#60A5FA]' :
                  session.status === 'inprocess' ? 'bg-[#F59E0B33] text-[#FBBF24]' :
                  session.status === 'review' ? 'bg-[#8B5CF633] text-[#A78BFA]' :
                  'bg-[#10B98133] text-[#34D399]'
                }`}>
                  {session.status === 'inprocess' ? 'IN PROCESS' : session.status}
                </span>
              </div>

              {activeSessionId === session.id && (
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                  <div className="flex items-center gap-1">
                    <GitBranch size={12} />
                    <span className="truncate max-w-[80px]">{session.gitBranch || 'main'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FolderGit2 size={12} />
                    <span className="truncate max-w-[80px]">{session.worktree || 'default'}</span>
                  </div>
                </div>
              )}
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
      <div className="flex-1 relative overflow-hidden flex bg-[#14100E]">
        {activeSession ? (
          <SessionWindow
            session={activeSession}
            onUpdate={(updated) => {
              setSessions((prev: Session[]) => prev.map(s => s.id === updated.id ? updated : s));
            }}
            onOpenReview={() => onOpenReview(activeSession.id)}
            onClose={() => setActiveSessionId(null)}
            fullScreen={true}
            variant="tab"
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
