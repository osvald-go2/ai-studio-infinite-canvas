import { motion } from 'motion/react'
import { Check, X, Loader2, Clock, AlertCircle } from 'lucide-react'
import type { IslandSession } from '@/types'

interface TaskCardProps {
  session: IslandSession
  onOpenChat: (sessionId: string) => void
  onCancel: (sessionId: string) => void
  onDismiss: (sessionId: string) => void
}

const statusConfig = {
  done: {
    icon: Check,
    color: '#4ade80',
    bg: 'linear-gradient(135deg, #1a3a1a, #0d2a0d)',
    border: 'rgba(74, 222, 128, 0.2)',
    label: 'Task has been completed'
  },
  inprocess: {
    icon: Loader2,
    color: '#60a5fa',
    bg: 'linear-gradient(135deg, #1a1a2a, #0d0d1a)',
    border: 'rgba(96, 165, 250, 0.2)',
    label: 'In progress...'
  },
  inbox: {
    icon: Clock,
    color: '#fbbf24',
    bg: 'linear-gradient(135deg, #2a2015, #1a150d)',
    border: 'rgba(251, 191, 36, 0.15)',
    label: 'Waiting'
  },
  review: {
    icon: AlertCircle,
    color: '#f87171',
    bg: 'linear-gradient(135deg, #2a1a1a, #1a0d0d)',
    border: 'rgba(248, 113, 113, 0.2)',
    label: 'Needs review'
  }
} as const

export function TaskCard({ session, onOpenChat, onCancel, onDismiss }: TaskCardProps) {
  const config = statusConfig[session.status]
  const Icon = config.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scaleX: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 min-w-[160px] relative rounded-[14px] p-3"
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`
      }}
    >
      {/* Close button */}
      <button
        onClick={() => onDismiss(session.id)}
        className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.2)' }}
      >
        <X size={10} color="#888" />
      </button>

      {/* Status icon + title */}
      <div className="flex items-center gap-1.5 mb-2">
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center"
          style={{ backgroundColor: session.status === 'done' ? config.color : '#333' }}
        >
          <Icon
            size={10}
            color={session.status === 'done' ? '#000' : config.color}
            className={session.status === 'inprocess' ? 'animate-spin' : ''}
          />
        </div>
        <span
          className="text-[11px] font-bold truncate max-w-[120px]"
          style={{ color: config.color }}
        >
          {session.title}
        </span>
      </div>

      {/* Status text */}
      <div className="text-[10px] text-[#8a8a8a] mb-2 truncate">
        {session.lastMessage || config.label}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        {session.status === 'inprocess' && (
          <button
            onClick={() => onCancel(session.id)}
            className="text-[10px] text-[#aaa] px-3 py-1 rounded-lg cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => onOpenChat(session.id)}
          className="text-[10px] text-white font-semibold px-3 py-1 rounded-lg cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Open in chat
        </button>
      </div>
    </motion.div>
  )
}
