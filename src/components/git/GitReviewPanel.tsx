import React, { useState, useEffect, useCallback } from 'react';
import type { FileChange } from '../../types/git';
import { useGit } from '../../contexts/GitProvider';
import { SourceControlPanel } from './SourceControlPanel';
import { DiffPanel } from './DiffPanel';
import type { FileDiff } from '../../types';

interface GitReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (message: string) => void;
  onDiscard: () => void;
}

export function GitReviewPanel({ isOpen, onClose, onCommit, onDiscard }: GitReviewPanelProps) {
  const { changes, info } = useGit();
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedChange, setSelectedChange] = useState<FileChange | null>(null);
  const [isGeneratingCommit, setIsGeneratingCommit] = useState(false);

  // Clear state when panel closes
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setSelectedChange(null);
        setCommitMessage('');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleCommit = useCallback(() => {
    if (commitMessage.trim()) {
      onCommit(commitMessage);
      setCommitMessage('');
    }
  }, [commitMessage, onCommit]);

  const handleGenerateCommitMessage = useCallback(async () => {
    if (changes.length === 0) return;
    setIsGeneratingCommit(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    // Simple commit message generation from changes
    const parts = changes.map(file => {
      const name = file.path.split('/').pop() || file.path;
      if (file.status === 'M') return `update ${name} (+${file.additions} -${file.deletions})`;
      if (file.status === 'A') return `add ${name} (+${file.additions})`;
      return `remove ${name} (-${file.deletions})`;
    });
    const prefix = changes.some(f => f.status === 'D') ? 'refactor' :
                   changes.some(f => f.status === 'A') ? 'feat' : 'fix';
    setCommitMessage(`${prefix}: ${parts.join(', ')}`);
    setIsGeneratingCommit(false);
  }, [changes]);

  const handleSelectFile = useCallback((file: FileChange) => {
    setSelectedChange(prev => prev?.path === file.path ? null : file);
  }, []);

  // Convert FileChange to FileDiff for DiffPanel compatibility
  const selectedFileDiff: FileDiff | null = selectedChange ? {
    filename: selectedChange.path,
    status: selectedChange.status as 'M' | 'A' | 'D',
    additions: selectedChange.additions,
    deletions: selectedChange.deletions,
    patch: '',
  } : null;

  return (
    <>
      {/* Backdrop */}
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
          selectedFileDiff ? 'w-[calc(100vw-420px)]' : 'w-0'
        }`}>
          {selectedFileDiff && (
            <DiffPanel file={selectedFileDiff} onClose={() => setSelectedChange(null)} />
          )}
        </div>

        {/* Source Control Panel (right side) */}
        {changes.length > 0 && (
          <SourceControlPanel
            commitMessage={commitMessage}
            onCommitMessageChange={setCommitMessage}
            onCommit={handleCommit}
            onDiscard={onDiscard}
            onClose={onClose}
            onSelectFile={handleSelectFile}
            selectedFile={selectedChange}
            onGenerateCommitMessage={handleGenerateCommitMessage}
            isGeneratingCommit={isGeneratingCommit}
          />
        )}
      </div>
    </>
  );
}
