import React, { useState, useRef, useEffect } from 'react';
import { LayoutDashboard, Maximize, Plus, ChevronDown, Check, FolderOpen, Search, Columns } from 'lucide-react';
import { Session } from '../types';

const MOCK_PROJECTS = [
  { id: '1', name: 'ai-studio-web', path: '~/Projects/ai-studio-web', abbr: 'AW', color: 'bg-blue-500' },
  { id: '2', name: 'backend-api', path: '~/Projects/backend-api', abbr: 'BA', color: 'bg-emerald-500' },
  { id: '3', name: 'mobile-app', path: '~/Projects/mobile-app', abbr: 'MA', color: 'bg-purple-500' },
];

export function TopBar({ 
  viewMode, 
  setViewMode, 
  onNewSession,
  sessions,
  onLocateSession
}: { 
  viewMode: 'canvas' | 'board' | 'tab', 
  setViewMode: (mode: 'canvas' | 'board' | 'tab') => void, 
  onNewSession: () => void,
  sessions: Session[],
  onLocateSession: (id: string) => void
}) {
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState('1');
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeProject = MOCK_PROJECTS.find(p => p.id === activeProjectId) || MOCK_PROJECTS[0];

  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="h-14 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center justify-between px-6 z-50 relative">
      <div className="flex items-center gap-4">
        <div className="font-semibold text-lg bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">
          AI Studio
        </div>
        
        {/* Project Switcher */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium text-gray-200"
          >
            <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${activeProject.color} text-white`}>
              {activeProject.abbr}
            </div>
            {activeProject.name}
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isProjectDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isProjectDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-[#3B3F4F]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="p-2">
                <div className="text-xs font-medium text-gray-500 px-3 py-2 uppercase tracking-wider">Recent Projects</div>
                {MOCK_PROJECTS.map(project => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setActiveProjectId(project.id);
                      setIsProjectDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-lg transition-colors text-left group"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${project.color} text-white`}>
                      {project.abbr}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">{project.name}</div>
                      <div className="text-xs text-gray-500 truncate">{project.path}</div>
                    </div>
                    {activeProjectId === project.id && (
                      <Check size={16} className="text-emerald-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t border-white/10 p-2">
                <button 
                  onClick={() => setIsProjectDropdownOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-lg transition-colors text-left text-gray-300 hover:text-white"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 shrink-0">
                    <FolderOpen size={16} />
                  </div>
                  <span className="text-sm font-medium">Open Folder...</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-white/20 mx-2"></div>
        <div className="flex bg-white/5 rounded-lg p-1">
          <button 
            onClick={() => setViewMode('canvas')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${viewMode === 'canvas' ? 'bg-white/15 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <Maximize size={16} />
            Canvas
          </button>
          <button 
            onClick={() => setViewMode('board')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${viewMode === 'board' ? 'bg-white/15 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <LayoutDashboard size={16} />
            Board
          </button>
          <button 
            onClick={() => setViewMode('tab')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${viewMode === 'tab' ? 'bg-white/15 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <Columns size={16} />
            Tab
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Search Bar */}
        <div className="relative" ref={searchRef}>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="w-64 bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-white/20 focus:bg-white/10 transition-all"
            />
          </div>
          
          {isSearchOpen && searchQuery && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-[#3B3F4F]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-96 flex flex-col">
              <div className="p-2 overflow-y-auto custom-scrollbar">
                {filteredSessions.length > 0 ? (
                  filteredSessions.map(session => (
                    <button
                      key={session.id}
                      onClick={() => {
                        onLocateSession(session.id);
                        setIsSearchOpen(false);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-white/10 rounded-lg transition-colors group"
                    >
                      <div className="text-sm font-medium text-gray-200 group-hover:text-white truncate">{session.title}</div>
                      <div className="text-xs text-gray-500 mt-1 truncate">
                        {session.messages[session.messages.length - 1]?.content || 'No messages'}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-4 text-sm text-gray-500 text-center">
                    No sessions found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <button onClick={onNewSession} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
          <Plus size={16} />
          New Session
        </button>
      </div>
    </div>
  );
}
