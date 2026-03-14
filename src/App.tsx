/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CanvasView } from './components/CanvasView';
import { BoardView } from './components/BoardView';
import { TabView } from './components/TabView';
import { TopBar } from './components/TopBar';
import { NewSessionModal } from './components/NewSessionModal';
import { GitSidebar } from './components/GitSidebar';
import { DiffModal } from './components/DiffModal';
import { Session, SessionStatus, FileDiff } from './types';
import { initialSessions } from './data';

export default function App() {
  const [viewMode, setViewMode] = useState<'canvas' | 'board' | 'tab'>('canvas');
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  
  // Git Review State
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [viewingFileDiff, setViewingFileDiff] = useState<FileDiff | null>(null);

  const handleCreateSession = (title: string, model: string, gitBranch: string, worktree: string, initialPrompt: string) => {
    const newSession: Session = {
      id: Date.now().toString(),
      title,
      model,
      gitBranch,
      worktree,
      status: 'inbox',
      position: { 
        x: 200 + Math.random() * 100, 
        y: 200 + Math.random() * 100 
      },
      messages: initialPrompt.trim() ? [{
        id: Date.now().toString() + '-init',
        role: 'user',
        content: initialPrompt.trim(),
        type: 'text'
      }] : []
    };
    setSessions([...sessions, newSession]);
  };

  const handleCommit = (message: string) => {
    if (reviewSessionId) {
      setSessions(sessions.map(s => 
        s.id === reviewSessionId ? { ...s, diff: null } : s
      ));
      setReviewSessionId(null);
    }
  };

  const handleDiscard = () => {
    if (reviewSessionId) {
      setSessions(sessions.map(s => 
        s.id === reviewSessionId ? { ...s, diff: null } : s
      ));
      setReviewSessionId(null);
    }
  };

  const handleLocateSession = (id: string) => {
    setFocusedSessionId(id);
    // Clear it after a short delay so it can be triggered again if needed
    setTimeout(() => setFocusedSessionId(null), 100);
  };

  const reviewSession = sessions.find(s => s.id === reviewSessionId) || null;

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#1A1A2E] text-white font-sans flex flex-col relative">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop)' }}
      />
      
      <TopBar 
        viewMode={viewMode} 
        setViewMode={setViewMode} 
        onNewSession={() => setIsNewModalOpen(true)} 
        sessions={sessions}
        onLocateSession={handleLocateSession}
      />
      
      <div className="flex-1 relative z-10">
        {viewMode === 'canvas' ? (
          <CanvasView 
            sessions={sessions} 
            setSessions={setSessions} 
            onOpenReview={(sessionId) => setReviewSessionId(sessionId)}
            focusedSessionId={focusedSessionId}
          />
        ) : viewMode === 'board' ? (
          <BoardView 
            sessions={sessions} 
            setSessions={setSessions} 
            onOpenReview={(sessionId) => setReviewSessionId(sessionId)}
            focusedSessionId={focusedSessionId}
          />
        ) : (
          <TabView 
            sessions={sessions} 
            setSessions={setSessions} 
            onOpenReview={(sessionId) => setReviewSessionId(sessionId)}
            focusedSessionId={focusedSessionId}
          />
        )}
      </div>

      <NewSessionModal 
        isOpen={isNewModalOpen} 
        onClose={() => setIsNewModalOpen(false)} 
        onCreate={handleCreateSession} 
      />

      <GitSidebar
        isOpen={!!reviewSessionId}
        onClose={() => setReviewSessionId(null)}
        session={reviewSession}
        onCommit={handleCommit}
        onDiscard={handleDiscard}
        onViewFile={setViewingFileDiff}
      />

      {viewingFileDiff && (
        <DiffModal
          file={viewingFileDiff}
          onClose={() => setViewingFileDiff(null)}
        />
      )}
    </div>
  );
}
