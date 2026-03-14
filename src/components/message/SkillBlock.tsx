import React from 'react';
import { Zap, Check, Loader2 } from 'lucide-react';
import { ContentBlock } from '../../types';

type SkillData = Extract<ContentBlock, { type: 'skill' }>;

export function SkillBlock({ skill, args, status, duration }: SkillData) {
  return (
    <div className="flex items-center gap-3 font-mono text-sm py-0.5">
      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
        status === 'done' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-500/20 text-cyan-400'
      }`}>
        {status === 'done' ? <Check size={10} strokeWidth={3} /> : <Loader2 size={10} className="animate-spin" />}
      </div>
      <Zap size={14} className="text-cyan-400" />
      <span className="text-cyan-400 font-medium">{skill}</span>
      {args && <span className="text-gray-400">{args}</span>}
      {status === 'invoking' && <span className="text-cyan-400/60 text-xs animate-pulse">invoking...</span>}
      {duration != null && status === 'done' && <span className="text-gray-500 text-xs">{duration}s</span>}
    </div>
  );
}
