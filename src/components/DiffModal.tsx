import React from 'react';
import { X } from 'lucide-react';
import { FileDiff } from '../types';

interface DiffModalProps {
  file: FileDiff | null;
  onClose: () => void;
}

export function DiffModal({ file, onClose }: DiffModalProps) {
  if (!file) return null;

  // Basic syntax highlighting for diff
  const renderPatch = (patch: string) => {
    const lines = patch.split('\n');
    return lines.map((line, idx) => {
      let className = 'text-gray-400';
      let bgColor = 'bg-transparent';
      
      if (line.startsWith('+')) {
        className = 'text-green-300';
        bgColor = 'bg-green-500/10';
      } else if (line.startsWith('-')) {
        className = 'text-red-300';
        bgColor = 'bg-red-500/10';
      } else if (line.startsWith('@@')) {
        className = 'text-blue-300';
        bgColor = 'bg-blue-500/10';
      }

      return (
        <div key={idx} className={`font-mono text-sm whitespace-pre px-6 py-1 ${bgColor}`}>
          <span className={className}>{line}</span>
        </div>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-8">
      <div className="bg-[#3B3F4F]/95 backdrop-blur-2xl w-full max-w-5xl h-full max-h-[80vh] rounded-[32px] shadow-2xl border border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-black/20">
          <div className="flex items-center gap-4">
            <h3 className="text-white font-medium text-lg">{file.filename}</h3>
            <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold ${file.status === 'M' ? 'bg-yellow-500/20 text-yellow-400' : file.status === 'A' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {file.status === 'M' ? 'MODIFIED' : file.status === 'A' ? 'ADDED' : 'DELETED'}
            </span>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto bg-transparent py-6 custom-scrollbar">
          {renderPatch(file.patch)}
        </div>
      </div>
    </div>
  );
}
