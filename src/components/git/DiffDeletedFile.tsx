import React from 'react';
import { FileDiff } from '../../types';
import { extractDeletedLines } from '../../utils/parsePatch';

interface DiffDeletedFileProps {
  file: FileDiff;
}

export function DiffDeletedFile({ file }: DiffDeletedFileProps) {
  const lines = extractDeletedLines(file.patch);

  return (
    <div className="flex-1 overflow-auto custom-scrollbar">
      <div className="px-3 py-1.5 bg-black/20 text-gray-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06] sticky top-0">
        Deleted File
      </div>
      <div className="bg-red-500/[0.03]">
        {lines.map((line, idx) => (
          <div key={idx} className="px-3 py-0.5 min-h-[1.8em] bg-red-500/[0.08]">
            <span className="text-gray-600 select-none mr-3 inline-block w-8 text-right font-mono text-[13px]" style={{ textDecoration: 'none' }}>
              {line.lineNumber}
            </span>
            <span className="font-mono text-[13px] text-red-300 whitespace-pre line-through decoration-red-500/40">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
