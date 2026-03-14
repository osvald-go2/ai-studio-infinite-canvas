import React from 'react';
import { FileDiff } from '../../types';
import { parsePatchToSideBySide, DiffLine } from '../../utils/parsePatch';

interface DiffSideBySideProps {
  file: FileDiff;
}

export function DiffSideBySide({ file }: DiffSideBySideProps) {
  const rows = parsePatchToSideBySide(file.patch);

  const renderLine = (line: DiffLine | null) => {
    if (!line) {
      return (
        <div className="px-3 py-0.5 min-h-[1.8em] bg-white/[0.02]">
          <span className="text-transparent select-none mr-3 inline-block w-8 text-right font-mono text-xs">&nbsp;</span>
        </div>
      );
    }

    const bgColor = line.type === 'remove'
      ? 'bg-red-500/10'
      : line.type === 'add'
        ? 'bg-green-500/10'
        : 'bg-transparent';

    const textColor = line.type === 'remove'
      ? 'text-red-300'
      : line.type === 'add'
        ? 'text-green-300'
        : 'text-gray-400';

    return (
      <div className={`px-3 py-0.5 min-h-[1.8em] ${bgColor}`}>
        <span className="text-gray-600 select-none mr-3 inline-block w-8 text-right font-mono text-xs">
          {line.lineNumber ?? ''}
        </span>
        <span className={`font-mono text-xs ${textColor} whitespace-pre`}>{line.content}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-1 overflow-auto custom-scrollbar">
      <div className="flex-1 border-r border-white/[0.06] min-w-0">
        <div className="px-3 py-1.5 bg-black/20 text-gray-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06] sticky top-0">
          Original
        </div>
        <div>
          {rows.map((row, idx) => (
            <React.Fragment key={idx}>{renderLine(row.old)}</React.Fragment>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="px-3 py-1.5 bg-black/20 text-gray-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06] sticky top-0">
          Modified
        </div>
        <div>
          {rows.map((row, idx) => (
            <React.Fragment key={idx}>{renderLine(row.new)}</React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
