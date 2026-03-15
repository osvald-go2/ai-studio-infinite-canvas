import React, { useRef, useLayoutEffect, useState, useCallback } from 'react';
import { X, Check, ChevronDown, ChevronRight, Sparkles, Loader2, Undo2, GitBranch, RefreshCw, FileCode, FileText, FileJson, File } from 'lucide-react';
import { Session, FileDiff } from '../../types';

interface CommitLog {
  hash: string;
  message: string;
  author: string;
  branch?: string;
  isMerge?: boolean;
  color: string;
}

const MOCK_COMMITS: CommitLog[] = [
  { hash: 'a1b2c3d', message: 'feat: add AI commit message generation', author: 'you', branch: 'main', color: 'bg-blue-400' },
  { hash: 'e4f5g6h', message: 'refactor: update session status transitions', author: 'you', color: 'bg-blue-400' },
  { hash: 'i7j8k9l', message: 'style: unify color palette across views', author: 'you', color: 'bg-blue-400' },
  { hash: 'm0n1o2p', message: 'fix: input accent color to hex+opacity format', author: 'you', color: 'bg-blue-400' },
  { hash: 'q3r4s5t', message: 'Merge PR #12: canvas multi-select broadcast', author: 'collaborator', isMerge: true, color: 'bg-yellow-400' },
  { hash: 'u6v7w8x', message: 'feat: add broadcast messaging to canvas', author: 'collaborator', color: 'bg-rose-400' },
  { hash: 'y9z0a1b', message: 'fix: Tailwind rgba syntax underscores', author: 'you', color: 'bg-blue-400' },
  { hash: 'c2d3e4f', message: 'feat: implement board view drag and drop', author: 'you', color: 'bg-blue-400' },
  { hash: 'g5h6i7j', message: 'Merge PR #8: tab view search filter', author: 'collaborator', isMerge: true, color: 'bg-yellow-400' },
  { hash: 'k8l9m0n', message: 'feat: add session search in tab view', author: 'collaborator', color: 'bg-emerald-400' },
];

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

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'tsx':
    case 'jsx':
      return <FileCode size={14} className="text-blue-400" />;
    case 'ts':
    case 'js':
      return <FileCode size={14} className="text-yellow-400" />;
    case 'json':
      return <FileJson size={14} className="text-green-400" />;
    case 'css':
    case 'scss':
      return <FileText size={14} className="text-purple-400" />;
    case 'md':
      return <FileText size={14} className="text-gray-400" />;
    default:
      return <File size={14} className="text-gray-500" />;
  }
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
  const [changesOpen, setChangesOpen] = useState(true);
  const [graphHeight, setGraphHeight] = useState<number | null>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getEffectiveHeight = useCallback(() => {
    if (graphHeight !== null) return graphHeight;
    const containerH = containerRef.current?.clientHeight || 600;
    return containerH / 2;
  }, [graphHeight]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = getEffectiveHeight();

    const handleDragMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - ev.clientY;
      const containerH = containerRef.current?.clientHeight || 600;
      const newHeight = Math.min(Math.max(startHeight.current + delta, 100), containerH * 0.7);
      setGraphHeight(newHeight);
    };

    const handleDragEnd = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  }, [getEffectiveHeight]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    const newHeight = Math.min(el.scrollHeight, 240);
    el.style.height = `${newHeight}px`;
    el.style.overflowY = el.scrollHeight > 240 ? 'auto' : 'hidden';
  }, [commitMessage]);

  if (!diff) return null;

  const branch = session.gitBranch || 'main';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && commitMessage.trim()) {
      e.preventDefault();
      onCommit();
    }
  };

  return (
    <div ref={containerRef} className="w-[420px] flex-shrink-0 flex flex-col h-full bg-[#2B2D3A]/95 backdrop-blur-2xl border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Source Control</h2>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Commit section */}
      <div className="px-3 pt-3 pb-2 space-y-2 border-b border-white/[0.06]">
        {/* Message input — 1 line default, grows up to 10 lines, scrollbar after */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={`Message (⌘Enter to commit on "${branch}")`}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 pr-8 text-[13px] text-white placeholder:text-gray-600 outline-none focus:border-white/20 resize-none custom-scrollbar overflow-hidden"
            style={{ minHeight: '34px', maxHeight: '240px' }}
          />
          <button
            onClick={onGenerateCommitMessage}
            disabled={isGeneratingCommit}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md hover:bg-white/10 disabled:opacity-30 flex items-center justify-center text-purple-400 hover:text-purple-300 transition-colors"
            title="AI Generate Commit Message"
          >
            {isGeneratingCommit ? (
              <Loader2 size={12} className="text-purple-400 animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
          </button>
        </div>

        {/* Commit button — full width with text */}
        <div className="flex">
          <button
            onClick={onCommit}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded-l-lg text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <Check size={14} />
            Commit
          </button>
          <button
            className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1.5 rounded-r-lg border-l border-blue-700/50 transition-colors flex items-center justify-center"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Changes section — collapsible */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Changes header */}
        <div
          className="flex items-center justify-between px-3 py-1.5 hover:bg-white/[0.03] cursor-pointer group"
          onClick={() => setChangesOpen(!changesOpen)}
        >
          <div className="flex items-center gap-1">
            {changesOpen ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />}
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Changes</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Discard all — visible on hover, always occupies space */}
            <button
              onClick={(e) => { e.stopPropagation(); onDiscard(); }}
              className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
              title="Discard All Changes"
            >
              <Undo2 size={12} />
            </button>
            <span className="bg-white/10 text-gray-400 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-medium">
              {diff.files.length}
            </span>
          </div>
        </div>

        {/* File list */}
        {changesOpen && (
          <div>
            {diff.files.map((file, idx) => {
              const isSelected = selectedFile?.filename === file.filename;
              const fileName = file.filename.split('/').pop() || file.filename;
              const st = file.status === 'M' ? { color: 'text-yellow-500', label: 'M' }
                       : file.status === 'A' ? { color: 'text-green-500', label: 'U' }
                       : { color: 'text-red-500', label: 'D' };

              return (
                <div
                  key={idx}
                  onClick={() => onSelectFile(file)}
                  className={`flex items-center justify-between pl-7 pr-3 py-[3px] cursor-pointer group/file transition-colors ${
                    isSelected ? 'bg-blue-500/20' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden min-w-0">
                    {getFileIcon(file.filename)}
                    <span className={`text-[13px] truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                      {fileName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Hover actions */}
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-gray-600 hover:text-white transition-colors opacity-0 group-hover/file:opacity-100"
                      title="Discard Changes"
                    >
                      <Undo2 size={11} />
                    </button>
                    {/* +/- stats */}
                    {file.additions > 0 && (
                      <span className="text-green-400 text-[11px] font-mono">+{file.additions}</span>
                    )}
                    {file.deletions > 0 && (
                      <span className="text-red-400 text-[11px] font-mono">-{file.deletions}</span>
                    )}
                    {/* Status letter */}
                    <span className={`text-[12px] font-semibold w-4 text-right ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Graph section — drag handle to resize */}
      <div className="flex flex-col flex-shrink-0" style={{ height: graphHeight !== null ? `${graphHeight}px` : '50%' }}>
        {/* Drag handle */}
        <div
          onMouseDown={handleDragStart}
          className="h-1.5 cursor-ns-resize border-t border-white/[0.06] group flex items-center justify-center hover:bg-white/[0.04] transition-colors"
        >
          <div className="w-8 h-0.5 rounded-full bg-white/0 group-hover:bg-white/20 transition-colors" />
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <ChevronDown size={12} className="text-gray-500" />
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Graph</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500">
              <GitBranch size={10} />
              <span>{branch}</span>
            </div>
            <button className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-white transition-colors" title="Refresh">
              <RefreshCw size={10} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {MOCK_COMMITS.map((commit, idx) => (
            <div key={commit.hash} className="flex items-start gap-2 group hover:bg-white/[0.03] rounded px-2 py-1 cursor-default">
              <div className="flex flex-col items-center flex-shrink-0 pt-1.5" style={{ width: '16px' }}>
                <div className={`w-2.5 h-2.5 rounded-full ${commit.color} flex-shrink-0 ${commit.isMerge ? 'ring-2 ring-white/20' : ''}`} />
                {idx < MOCK_COMMITS.length - 1 && (
                  <div className="w-px flex-1 bg-white/15 min-h-[14px]" />
                )}
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <span className="text-[13px] text-gray-200 truncate block">{commit.message}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-gray-500">{commit.author}</span>
                  {commit.branch && (
                    <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0 rounded font-medium">{commit.branch}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
