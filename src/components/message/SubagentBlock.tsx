import React from 'react';
import { Bot, Check, ChevronRight, Loader2, X } from 'lucide-react';
import { ContentBlock } from '../../types';
import { ContentBlocksView } from './ContentBlocksView';

type SubagentData = Extract<ContentBlock, { type: 'subagent' }>;

const STATUS_STYLES = {
  launched: {
    label: 'Launched',
    badgeClassName: 'border border-blue-400/20 bg-blue-400/10 text-blue-200',
    statusDotClassName: 'bg-blue-300',
    icon: Loader2,
  },
  working: {
    label: 'Working',
    badgeClassName: 'border border-blue-400/20 bg-blue-400/10 text-blue-200',
    statusDotClassName: 'bg-blue-300',
    icon: Loader2,
  },
  done: {
    label: 'Done',
    badgeClassName: 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    statusDotClassName: 'bg-emerald-300',
    icon: Check,
  },
  error: {
    label: 'Failed',
    badgeClassName: 'border border-rose-400/20 bg-rose-400/10 text-rose-200',
    statusDotClassName: 'bg-rose-300',
    icon: X,
  },
} satisfies Record<
  SubagentData['status'],
  {
    label: string;
    badgeClassName: string;
    statusDotClassName: string;
    icon: typeof Bot;
  }
>;

export function SubagentBlock({ agentId, task, status, summary, blocks }: SubagentData) {
  const statusStyle = STATUS_STYLES[status];
  const StatusIcon = statusStyle.icon;
  const hasNestedBlocks = Boolean(blocks && blocks.length > 0);

  return (
    <details className="group rounded-2xl border border-white/10 bg-[#2B2D3A]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-sm">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-gray-200">
          <Bot size={14} strokeWidth={1.9} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-200">子智能体</span>
            <span className="font-mono text-[11px] text-gray-500">{agentId}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle.badgeClassName}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.statusDotClassName}`} />
              {statusStyle.label}
            </span>
          </div>

          <p className="mt-1 text-[14px] leading-5 text-gray-100">{task}</p>
          {summary && <p className="mt-1 text-xs leading-5 text-gray-400">{summary}</p>}
        </div>

        <div className="mt-0.5 flex items-center gap-1 text-gray-500">
          {status === 'working' ? (
            <StatusIcon size={13} className="animate-spin" />
          ) : (
            <StatusIcon size={13} />
          )}
          {hasNestedBlocks && <ChevronRight size={14} className="transition-transform group-open:rotate-90" />}
        </div>
      </summary>

      {hasNestedBlocks && (
        <div className="border-t border-white/6 px-3.5 pb-3 pt-3">
          <div className="rounded-xl border border-white/6 bg-black/10 px-3 py-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-gray-500">
              <Bot size={12} className="text-gray-400" />
              <span>子智能体轨迹</span>
            </div>
            <ContentBlocksView blocks={blocks} />
          </div>
        </div>
      )}
    </details>
  );
}
