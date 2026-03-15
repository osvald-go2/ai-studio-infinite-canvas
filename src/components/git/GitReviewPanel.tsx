import React, { useState, useEffect, useCallback } from 'react';
import { Session, FileDiff, GitDiff } from '../../types';
import { SourceControlPanel } from './SourceControlPanel';
import { DiffPanel } from './DiffPanel';

interface GitReviewPanelProps {
  isOpen: boolean;
  session: Session | null;
  onClose: () => void;
  onCommit: (message: string) => void;
  onDiscard: () => void;
}

function generateCommitMessage(diff: GitDiff): string {
  const parts = diff.files.map(file => {
    const name = file.filename.split('/').pop() || file.filename;
    if (file.status === 'M') return `update ${name} (+${file.additions} -${file.deletions})`;
    if (file.status === 'A') return `add ${name} (+${file.additions})`;
    return `remove ${name} (-${file.deletions})`;
  });

  const prefix = diff.files.some(f => f.status === 'D') ? 'refactor' :
                 diff.files.some(f => f.status === 'A') ? 'feat' : 'fix';

  return `${prefix}: ${parts.join(', ')}`;
}

export function GitReviewPanel({ isOpen, session, onClose, onCommit, onDiscard }: GitReviewPanelProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileDiff | null>(null);
  const [isGeneratingCommit, setIsGeneratingCommit] = useState(false);
  const [cachedSession, setCachedSession] = useState<Session | null>(null);

  // Cache session for close animation
  useEffect(() => {
    if (isOpen && session && session.diff) {
      setCachedSession(session);
    }
  }, [isOpen, session]);

  // Clear state when panel closes
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setSelectedFile(null);
        setCommitMessage('');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const displaySession = (isOpen && session?.diff) ? session : cachedSession;

  const handleCommit = useCallback(() => {
    if (commitMessage.trim()) {
      onCommit(commitMessage);
      setCommitMessage('');
    }
  }, [commitMessage, onCommit]);

  const handleGenerateCommitMessage = useCallback(async () => {
    if (!displaySession?.diff) return;
    setIsGeneratingCommit(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    const msg = generateCommitMessage(displaySession.diff);
    setCommitMessage(msg);
    setIsGeneratingCommit(false);
  }, [displaySession]);

  const handleSelectFile = useCallback((file: FileDiff) => {
    setSelectedFile(prev => prev?.filename === file.filename ? null : file);
  }, []);

  return (
    <>
      {/* Backdrop — 样式1: bg-black/50 */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel container */}
      <div className={`fixed inset-y-0 right-0 z-50 flex transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Diff Panel (left side, only when file selected) */}
        <div className={`transition-all duration-300 ease-out overflow-hidden ${
          selectedFile ? 'w-[calc(100vw-420px)]' : 'w-0'
        }`}>
          {selectedFile && (
            <DiffPanel file={selectedFile} onClose={() => setSelectedFile(null)} />
          )}
        </div>

        {/* Source Control Panel (right side) */}
        {displaySession && displaySession.diff && (
          <SourceControlPanel
            session={displaySession}
            commitMessage={commitMessage}
            onCommitMessageChange={setCommitMessage}
            onCommit={handleCommit}
            onDiscard={onDiscard}
            onClose={onClose}
            onSelectFile={handleSelectFile}
            selectedFile={selectedFile}
            onGenerateCommitMessage={handleGenerateCommitMessage}
            isGeneratingCommit={isGeneratingCommit}
          />
        )}
      </div>
    </>
  );
}
