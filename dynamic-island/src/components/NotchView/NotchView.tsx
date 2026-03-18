import { AnimatePresence } from 'motion/react'
import { Capsule } from './Capsule'
import { TaskCard } from './TaskCard'
import { useIslandStore } from '@/hooks/useIslandStore'

export function NotchView() {
  const {
    sessions,
    connected,
    notchState,
    openChat,
    cancelSession,
    dismissNotification,
    fetchMessages
  } = useIslandStore()

  const isCapsule = notchState === 'capsule'
  const displaySessions = sessions.slice(0, 3)
  const overflowCount = sessions.length - 3

  const handleOpenChat = (sessionId: string) => {
    fetchMessages(sessionId)
    openChat(sessionId)
  }

  return (
    <div
      className="w-full h-full select-none"
      style={{ background: '#000' }}
      onMouseEnter={() => window.island.notifyMouseEnter()}
      onMouseLeave={() => window.island.notifyMouseLeave()}
    >
      {/* Capsule (visible when collapsed) */}
      <Capsule visible={isCapsule} connected={connected} />

      {/* Cards (visible when expanded) */}
      <AnimatePresence>
        {!isCapsule && (
          <div className="flex gap-2 px-4 pt-2 pb-3">
            {displaySessions.map(session => (
              <TaskCard
                key={session.id}
                session={session}
                onOpenChat={handleOpenChat}
                onCancel={cancelSession}
                onDismiss={dismissNotification}
              />
            ))}
            {overflowCount > 0 && (
              <div className="flex items-center px-3 text-[11px] text-[#888] font-medium">
                +{overflowCount} more
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
