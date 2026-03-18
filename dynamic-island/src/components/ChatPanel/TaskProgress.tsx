import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Check, Circle, AlertCircle } from 'lucide-react'
import type { TaskStep } from '@/types'

interface TaskProgressProps {
  steps: TaskStep[]
  sessionTitle: string
}

const stepIcons = {
  pending: Circle,
  running: Loader2,
  completed: Check,
  failed: AlertCircle
} as const

export function TaskProgress({ steps, sessionTitle }: TaskProgressProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (steps.length === 0) return null

  const runningCount = steps.filter(s => s.status === 'running').length
  const completedCount = steps.filter(s => s.status === 'completed').length

  return (
    <div className="task-progress-panel mx-4 p-3">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          {runningCount > 0 && (
            <Loader2 size={14} className="animate-spin text-[#60a5fa]" />
          )}
          <span className="text-white text-[11px] font-semibold">{sessionTitle}</span>
          <span className="text-[#888] text-[10px]">
            {completedCount}/{steps.length}
          </span>
        </div>
        {collapsed ? <ChevronDown size={14} color="#888" /> : <ChevronUp size={14} color="#888" />}
      </button>

      {/* Steps list */}
      {!collapsed && (
        <div className="mt-2 pl-2 space-y-1.5">
          {steps.map(step => {
            const Icon = stepIcons[step.status]
            return (
              <div key={step.id} className="flex items-center gap-2">
                <Icon
                  size={12}
                  className={step.status === 'running' ? 'animate-spin text-[#60a5fa]' : ''}
                  color={
                    step.status === 'completed' ? '#4ade80'
                    : step.status === 'failed' ? '#f87171'
                    : step.status === 'running' ? '#60a5fa'
                    : 'rgba(255,255,255,0.2)'
                  }
                />
                <span
                  className="text-[11px]"
                  style={{
                    color:
                      step.status === 'completed' || step.status === 'running'
                        ? '#d1d5db'
                        : '#6b7280'
                  }}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
