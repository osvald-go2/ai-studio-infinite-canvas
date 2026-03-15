/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { SESSION_WIDTH, SESSION_DEFAULT_HEIGHT, SESSION_GAP } from '@/constants';

function findNextGridPosition(
  sessions: Session[],
  viewportWidth: number
): { x: number; y: number } {
  const cellW = SESSION_WIDTH + SESSION_GAP;
  const cellH = SESSION_DEFAULT_HEIGHT + SESSION_GAP;
  const cols = Math.max(1, Math.floor(viewportWidth / cellW));
  const maxAttempts = 100;

  for (let index = 0; index < maxAttempts; index++) {
    const x = (index % cols) * cellW;
    const y = Math.floor(index / cols) * cellH;

    const hasCollision = sessions.some(s => {
      const eLeft = s.position.x - SESSION_GAP;
      const eRight = s.position.x + SESSION_WIDTH + SESSION_GAP;
      const eTop = s.position.y - SESSION_GAP;
      const eBottom = s.position.y + (s.height ?? SESSION_DEFAULT_HEIGHT) + SESSION_GAP;

      return x < eRight && x + SESSION_WIDTH > eLeft && y < eBottom && y + SESSION_DEFAULT_HEIGHT > eTop;
    });

    if (!hasCollision) {
      return { x, y };
    }
  }

  // Fallback: place after the rightmost session
  const maxX = sessions.reduce((max, s) => Math.max(max, s.position.x + SESSION_WIDTH), 0);
  return { x: maxX + SESSION_GAP, y: 0 };
}

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

  // Canvas Transform State (lifted from CanvasView)
  const [canvasTransform, setCanvasTransform] = useState({ x: 0, y: 0, scale: 1 });

  // Persistence State
  const [currentProject, setCurrentProject] = useState<DbProject | null>(null);
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [isSwitchingProject, setIsSwitchingProject] = useState(false);
  const sessionCreatedAtRef = useRef<Record<string, string>>({});
  const loadedSessionIdsRef = useRef<Set<string>>(new Set());
  const canvasWidthRef = useRef(window.innerWidth);
  const isElectronApp = typeof window !== 'undefined' && (window as any).aiBackend !== undefined;

  // Re-check git repo status when projectDir changes
  useEffect(() => {
    if (!projectDir) return;
    gitService.checkRepo(projectDir).then(setIsGitRepo).catch(() => setIsGitRepo(false));
  }, [projectDir]);

  // Apply a project: load sessions, restore state
  const applyProject = useCallback(async (project: DbProject) => {
    const dbSessions = await backend.loadSessions(project.id);
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
    setCurrentProject(project);
    setSessions(loaded.length > 0 ? loaded : initialSessions);
    loadedSessionIdsRef.current = new Set(loaded.map(s => s.id));
    setViewMode(project.view_mode as 'canvas' | 'board' | 'tab');
    setCanvasTransform({ x: project.canvas_x, y: project.canvas_y, scale: project.canvas_zoom });
    setProjectDir(project.path);

    // Refresh projects list
    backend.listProjects().then(setProjects).catch(() => {});
  }, []);

  // Flush pending session saves immediately
  const flushSessionSaves = useCallback(async (sessionsToSave: Session[], projectId: number) => {
    const now = new Date().toISOString();
    await Promise.all(sessionsToSave.map(session => {
      if (!sessionCreatedAtRef.current[session.id]) {
        sessionCreatedAtRef.current[session.id] = now;
      }
      const dbSession: DbSession = {
        id: session.id,
        project_id: projectId,
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
      return backend.saveSession(dbSession);
    }));
  }, []);

  // Switch to a different project
  const switchProject = useCallback(async (projectId: number) => {
    if (isSwitchingProject) return;
    if (currentProject?.id === projectId) return;

    setIsSwitchingProject(true);
    try {
      // Save current project state
      if (currentProject) {
        await backend.updateProject({
          ...currentProject,
          view_mode: viewMode,
          canvas_x: canvasTransform.x,
          canvas_y: canvasTransform.y,
          canvas_zoom: canvasTransform.scale,
        });
        await flushSessionSaves(sessions, currentProject.id);
      }

      // Find target project and open it
      const target = projects.find(p => p.id === projectId);
      if (!target) return;

      const project = await backend.openProject(target.path);
      if (!project) return;

      await applyProject(project);
    } catch (e) {
      console.error('Failed to switch project:', e);
    } finally {
      setIsSwitchingProject(false);
    }
  }, [isSwitchingProject, currentProject, viewMode, canvasTransform, sessions, projects, flushSessionSaves, applyProject]);

  // Load project and sessions from backend on mount
  useEffect(() => {
    if (!isElectronApp) return;

    const initProject = async () => {
      try {
        const cwd = await (window as any).aiBackend.getWorkingDir();
        const project = await backend.openProject(cwd);
        if (!project) return;

        await applyProject(project);
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

  // Persist canvas transform (debounced)
  useEffect(() => {
    if (!isElectronApp || !currentProject) return;
    const timeout = setTimeout(() => {
      backend.updateProject({
        ...currentProject,
        canvas_x: canvasTransform.x,
        canvas_y: canvasTransform.y,
        canvas_zoom: canvasTransform.scale,
      }).catch(console.error);
    }, 500);
    return () => clearTimeout(timeout);
  }, [canvasTransform, currentProject]);

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
    setSessions(prev => {
      const position = findNextGridPosition(prev, canvasWidthRef.current);
      const newSession: Session = {
        id: Date.now().toString(),
        title,
        model,
        gitBranch,
        worktree,
        status: 'inbox',
        position,
        messages: initialPrompt.trim() ? [{
          id: Date.now().toString() + '-init',
          role: 'user',
          content: initialPrompt.trim(),
          type: 'text'
        }] : []
      };
      return [...prev, newSession];
    });
  };

  const handleCommit = (message: string) => {
    if (reviewSessionId) {
      setSessions(prev => prev.map(s =>
        s.id === reviewSessionId
          ? { ...s, diff: null, hasChanges: false, changeCount: 0, status: 'done' as const }
          : s
      ));
    }
  };

  const handleDiscard = () => {
    if (reviewSessionId) {
      setSessions(prev => prev.map(s =>
        s.id === reviewSessionId
          ? { ...s, diff: null, hasChanges: false, changeCount: 0, status: 'inprocess' as const }
          : s
      ));
    }
  };

  const handleLocateSession = (id: string) => {
    setFocusedSessionId(id);
  };

  const handleSessionUpdate = (id: string, updates: Partial<Session>) => {
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, ...updates } : s));
  };

  const handleOpenDirectory = async () => {
    if (!isElectronApp) return;
    const aiBackend = (window as any).aiBackend;
    const dir = await aiBackend.openDirectory().catch(() => null);
    if (!dir) return;

    // Save current project state before switching
    if (currentProject) {
      await backend.updateProject({
        ...currentProject,
        view_mode: viewMode,
        canvas_x: canvasTransform.x,
        canvas_y: canvasTransform.y,
        canvas_zoom: canvasTransform.scale,
      }).catch(console.error);
      await flushSessionSaves(sessions, currentProject.id).catch(console.error);
    }

    const project = await backend.openProject(dir);
    if (project) {
      await applyProject(project);
    } else {
      // Fallback: just set the directory
      setProjectDir(dir);
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
        currentProject={currentProject}
        projects={projects}
        onSwitchProject={switchProject}
        isSwitchingProject={isSwitchingProject}
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
              transform={canvasTransform}
              onTransformChange={setCanvasTransform}
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
