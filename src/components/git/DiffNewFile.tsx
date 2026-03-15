import React from 'react';
import { FileDiff } from '../../types';
import { extractAddedLines } from '../../utils/parsePatch';

interface DiffNewFileProps {
  file: FileDiff;
}

export function DiffNewFile({ file }: DiffNewFileProps) {
  const lines = extractAddedLines(file.patch);

  return (
    <div className="flex-1 overflow-auto custom-scrollbar">
      <div className="px-3 py-1.5 bg-black/20 text-gray-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06] sticky top-0">
        New File
      </div>
      <div className="bg-green-500/[0.03]">
        {lines.map((line, idx) => (
          <div key={idx} className="px-3 py-0.5 min-h-[1.8em] bg-green-500/[0.08]">
            <span className="text-gray-600 select-none mr-3 inline-block w-8 text-right font-mono text-[13px]">
              {line.lineNumber}
            </span>
            <span className="font-mono text-[13px] text-green-300 whitespace-pre">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
