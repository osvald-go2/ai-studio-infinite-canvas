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
    ? 'bg-yellow-500/15 text-yellow-400'
    : file.status === 'A'
      ? 'bg-green-500/15 text-green-400'
      : 'bg-red-500/15 text-red-400';

  return (
    <div className="flex flex-col h-full bg-[#3B3F4F]/95 backdrop-blur-2xl border-l border-white/10">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/20 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white text-[15px] font-medium truncate">{file.filename}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex-shrink-0 ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {file.status === 'M' && <DiffSideBySide file={file} />}
      {file.status === 'A' && <DiffNewFile file={file} />}
      {file.status === 'D' && <DiffDeletedFile file={file} />}
    </div>
  );
}
