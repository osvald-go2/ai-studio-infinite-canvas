import type { SessionStatus } from '../types';

export function getStatusDotClass(status: SessionStatus, isStreaming = false): string {
  if (status === 'inprocess' && isStreaming) {
    return 'bg-blue-400 animate-breathe';
  }
  switch (status) {
    case 'inbox': return 'bg-gray-400';
    case 'inprocess': return 'bg-blue-400';
    case 'review': return 'bg-amber-400';
    case 'done': return 'bg-emerald-400';
  }
}

export const STATUS_COLORS: Record<SessionStatus, { badgeBg: string; badgeText: string }> = {
  inbox:     { badgeBg: 'bg-[#6B728033]', badgeText: 'text-[#9CA3AF]' },
  inprocess: { badgeBg: 'bg-[#3B82F633]', badgeText: 'text-[#60A5FA]' },
  review:    { badgeBg: 'bg-[#F59E0B33]', badgeText: 'text-[#FBBF24]' },
  done:      { badgeBg: 'bg-[#10B98133]', badgeText: 'text-[#34D399]' },
};
