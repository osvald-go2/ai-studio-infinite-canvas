import React from 'react';
import { X } from 'lucide-react';
import { FileDiff } from '../../types';
import { DiffSideBySide } from './DiffSideBySide';
import { DiffNewFile } from './DiffNewFile';
import { DiffDeletedFile } from './DiffDeletedFile';

interface DiffPanelProps {
  file: FileDiff;
  onClose: () => void;
}

export function DiffPanel({ file, onClose }: DiffPanelProps) {
  const statusLabel = file.status === 'M' ? 'MODIFIED' : file.status === 'A' ? 'ADDED' : 'DELETED';
  const statusColor = file.status === 'M'
    ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20'
    : file.status === 'A'
      ? 'bg-[#10b981]/20 text-[#10b981] border-[#10b981]/20'
      : 'bg-red-500/20 text-red-500 border-red-500/20';

  // Extract language from filename extension
  const ext = file.filename.split('.').pop() || '';
  const langMap: Record<string, string> = { tsx: 'TypeScript React', ts: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript React', css: 'CSS', json: 'JSON' };
  const language = langMap[ext] || ext;

  return (
    <div className="flex flex-col h-full bg-[#1a1f25]/90 rounded-xl border border-white/[0.06] shadow-lg overflow-hidden">
      {/* Header — 样式1 */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-mono text-white/50 truncate">{file.filename}</span>
          <span className="text-[11px] font-mono text-white/40">{language}</span>
          <span className={`text-[10px] font-bold uppercase px-1.5 py-[1px] rounded border flex-shrink-0 ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Diff Content */}
      {file.status === 'M' && <DiffSideBySide file={file} />}
      {file.status === 'A' && <DiffNewFile file={file} />}
      {file.status === 'D' && <DiffDeletedFile file={file} />}
    </div>
  );
}
