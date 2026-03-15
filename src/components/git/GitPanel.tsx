import React, { useState, useRef, useCallback } from 'react';
import { X, RefreshCw, GitBranch, FileDiff, FolderOpen } from 'lucide-react';
import { ChangesTab } from './ChangesTab';
import { GitTab } from './GitTab';
import { FilesTab } from './FilesTab';
import { useGit } from '../../contexts/GitProvider';

type PanelTab = 'changes' | 'git' | 'files';

export interface GitPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 360;

export function GitPanel({
  isOpen,
  onClose,
}: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('changes');
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const { changes, refresh } = useGit();

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // ── Drag-to-resize (left edge) ──
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: panelWidth };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta));
      setPanelWidth(newWidth);
    };

    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  const handleRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const tabs: { key: PanelTab; label: string; icon: React.ElementType }[] = [
    { key: 'changes', label: 'Changes', icon: FileDiff },
    { key: 'git', label: 'Git', icon: GitBranch },
    { key: 'files', label: 'Files', icon: FolderOpen },
  ];

  if (!isOpen) return null;

  return (
    <div
      className="flex-shrink-0 flex flex-col h-full bg-zinc-900 border-l border-white/10 relative"
      style={{ width: panelWidth }}
    >
      {/* Left drag handle */}
      <div
        onMouseDown={onDragStart}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-amber-400/25 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
          Git Panel
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex flex-shrink-0 border-b border-white/[0.06]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center justify-center gap-1.5 flex-1 py-2 text-[12px] font-medium transition-colors border-b-2 ${
                isActive
                  ? 'border-amber-400 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon size={13} className={isActive ? 'text-amber-400' : ''} />
              {tab.label}
              {tab.key === 'changes' && changes.length > 0 && (
                <span className="text-[10px] font-semibold bg-amber-400 text-zinc-900 rounded-full px-1.5 py-0 leading-4 min-w-[16px] text-center">
                  {changes.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'changes' && <ChangesTab />}
        {activeTab === 'git' && <GitTab />}
        {activeTab === 'files' && <FilesTab />}
      </div>
    </div>
  );
}
