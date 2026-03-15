/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { CanvasView } from './components/CanvasView';
import { BoardView } from './components/BoardView';
import { TabView } from './components/TabView';
import { TopBar } from './components/TopBar';
import { NewSessionModal } from './components/NewSessionModal';
import { GitReviewPanel } from './components/git/GitReviewPanel';
import { GitPanel } from './components/git/GitPanel';
import { Session, SessionStatus, DbProject, DbSession } from './types';
import { backend } from './services/backend';
import { gitService } from './services/git';
import { initialSessions } from './data';

export default function App() {
  const [viewMode, setViewMode] = useState<'canvas' | 'board' | 'tab'>('canvas');
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);

  // Git Review State
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);

  // Git Project State
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);

  // Persistence State
  const [currentProject, setCurrentProject] = useState<DbProject | null>(null);
  const sessionCreatedAtRef = useRef<Record<string, string>>({});
  const loadedSessionIdsRef = useRef<Set<string>>(new Set());
  const isElectronApp = typeof window !== 'undefined' && (window as any).aiBackend !== undefined;

  // On Electron startup: load last project dir
  useEffect(() => {
    if (!isElectronApp) return;
    const aiBackend = (window as any).aiBackend;
    aiBackend.getLastProjectDir().then(async (dir: string | null) => {
      if (dir) {
        setProjectDir(dir);
        const isRepo = await gitService.checkRepo(dir).catch(() => false);
        setIsGitRepo(isRepo);
      }
    }).catch(() => {});
  }, []);

  // Re-check git repo status when projectDir changes
  useEffect(() => {
    if (!projectDir) return;
    gitService.checkRepo(projectDir).then(setIsGitRepo).catch(() => setIsGitRepo(false));
  }, [projectDir]);

  // Load project and sessions from backend on mount
  useEffect(() => {
    if (!isElectronApp) return;

    const initProject = async () => {
      try {
        const cwd = await (window as any).aiBackend.getWorkingDir();
        const project = await backend.openProject(cwd);
        if (!project) return;
        setCurrentProject(project);

        const dbSessions = await backend.loadSessions(project.id);
        if (dbSessions.length > 0) {
          const loaded: Session[] = dbSessions.map(s => {
            sessionCreatedAtRef.current[s.id] = s.created_at;
            return {
              id: s.id,
              title: s.title,
              model: s.model,
              status: s.status as SessionStatus,
              position: { x: s.position_x, y: s.position_y },
              height: s.height ?? undefined,
              gitBranch: s.git_branch ?? undefined,
              worktree: s.worktree ?? undefined,
              messages: JSON.parse(s.messages),
              diff: null,
            };
          });
          setSessions(loaded);
          loadedSessionIdsRef.current = new Set(loaded.map(s => s.id));
        }

        setViewMode(project.view_mode as 'canvas' | 'board' | 'tab');
      } catch (e) {
        console.error('Failed to load project:', e);
      }
    };

    initProject();
  }, []);

  // Auto-save sessions to backend (debounced)
  useEffect(() => {
    if (!isElectronApp || !currentProject) return;

    const saveTimeout = setTimeout(() => {
      const now = new Date().toISOString();
      sessions.forEach(session => {
        if (!sessionCreatedAtRef.current[session.id]) {
          sessionCreatedAtRef.current[session.id] = now;
        }
        const dbSession: DbSession = {
          id: session.id,
          project_id: currentProject.id,
          title: session.title,
          model: session.model,
          status: session.status,
          position_x: session.position.x,
          position_y: session.position.y,
          height: session.height ?? null,
          git_branch: session.gitBranch ?? null,
          worktree: session.worktree ?? null,
          messages: JSON.stringify(session.messages),
          created_at: sessionCreatedAtRef.current[session.id],
          updated_at: now,
        };
        backend.saveSession(dbSession).catch(console.error);
      });
    }, 1000);

    return () => clearTimeout(saveTimeout);
  }, [sessions, currentProject]);

  // Persist view mode changes
  useEffect(() => {
    if (!isElectronApp || !currentProject) return;
    backend.updateProject({ ...currentProject, view_mode: viewMode }).catch(console.error);
  }, [viewMode, currentProject]);

  // Sync session deletions to backend
  useEffect(() => {
    if (!isElectronApp || !currentProject) return;

    const currentIds = new Set(sessions.map(s => s.id));
    const previousIds = loadedSessionIdsRef.current;

    previousIds.forEach(id => {
      if (!currentIds.has(id)) {
        backend.persistDeleteSession(id).catch(console.error);
      }
    });

    loadedSessionIdsRef.current = currentIds;
  }, [sessions, currentProject]);

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
        s.id === reviewSessionId
          ? { ...s, diff: null, hasChanges: false, changeCount: 0, status: 'done' as const }
          : s
      ));
    }
  };

  const handleDiscard = () => {
    if (reviewSessionId) {
      setSessions(sessions.map(s =>
        s.id === reviewSessionId
          ? { ...s, diff: null, hasChanges: false, changeCount: 0, status: 'inprocess' as const }
          : s
      ));
    }
  };

  const handleLocateSession = (id: string) => {
    setFocusedSessionId(id);
    // Clear it after a short delay so it can be triggered again if needed
    setTimeout(() => setFocusedSessionId(null), 100);
  };

  const handleSessionUpdate = (id: string, updates: Partial<Session>) => {
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, ...updates } : s));
  };

  const handleOpenDirectory = async () => {
    if (!isElectronApp) return;
    const aiBackend = (window as any).aiBackend;
    const dir = await aiBackend.openDirectory().catch(() => null);
    if (dir) {
      setProjectDir(dir);
      const isRepo = await gitService.checkRepo(dir).catch(() => false);
      setIsGitRepo(isRepo);
    }
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
        showGitPanel={showGitPanel}
        onToggleGitPanel={() => setShowGitPanel((v) => !v)}
        onOpenDirectory={handleOpenDirectory}
        projectDir={projectDir}
      />

      <div className="flex-1 min-h-0 relative z-10 flex overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0">
          {viewMode === 'canvas' ? (
            <CanvasView
              sessions={sessions}
              setSessions={setSessions}
              onOpenReview={(sessionId) => setReviewSessionId(sessionId)}
              focusedSessionId={focusedSessionId}
              projectDir={projectDir}
            />
          ) : viewMode === 'board' ? (
            <BoardView
              sessions={sessions}
              setSessions={setSessions}
              onOpenReview={(sessionId) => setReviewSessionId(sessionId)}
              focusedSessionId={focusedSessionId}
              projectDir={projectDir}
            />
          ) : (
            <TabView
              sessions={sessions}
              setSessions={setSessions}
              onOpenReview={(sessionId) => setReviewSessionId(sessionId)}
              focusedSessionId={focusedSessionId}
              projectDir={projectDir}
            />
          )}
        </div>

        {/* Git Panel — side panel */}
        {projectDir && (
          <GitPanel
            isOpen={showGitPanel}
            onClose={() => setShowGitPanel(false)}
            projectDir={projectDir}
            sessions={sessions}
            focusedSessionId={focusedSessionId}
            onSessionUpdate={handleSessionUpdate}
          />
        )}
      </div>

      <NewSessionModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreate={handleCreateSession}
        projectDir={projectDir}
        isGitRepo={isGitRepo}
      />

      <GitReviewPanel
        isOpen={!!reviewSessionId}
        session={reviewSession}
        onClose={() => setReviewSessionId(null)}
        onCommit={handleCommit}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
