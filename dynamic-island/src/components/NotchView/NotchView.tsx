import { motion, AnimatePresence } from 'motion/react'
import { Bot, Settings } from 'lucide-react'
import { Capsule } from './Capsule'
import { TaskCard } from './TaskCard'
import { useIslandStore } from '@/hooks/useIslandStore'

const SPRING_EXPAND = { type: 'spring' as const, stiffness: 400, damping: 35, mass: 0.8 }
const SPRING_COLLAPSE = { type: 'spring' as const, stiffness: 500, damping: 40, mass: 0.6 }

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
  const hasActiveTask = sessions.some(s => s.status === 'inprocess')

  const handleOpenChat = (sessionId: string) => {
    fetchMessages(sessionId)
    openChat(sessionId)
  }

  return (
    <div
      className="w-full h-full select-none"
      style={{ background: 'transparent' }}
      onMouseEnter={() => window.island.notifyMouseEnter()}
      onMouseLeave={() => window.island.notifyMouseLeave()}
    >
      {/* Single animated container — morphs between capsule and expanded */}
      <motion.div
        className="absolute left-1/2 top-0 -translate-x-1/2 overflow-hidden"
        initial={false}
        animate={{
          width: isCapsule ? 200 : 580,
          height: isCapsule ? 35 : 140,
          borderRadius: isCapsule ? '0 0 18px 18px' : '0 0 24px 24px',
        }}
        transition={isCapsule ? SPRING_COLLAPSE : SPRING_EXPAND}
        style={{ backgroundColor: '#000', willChange: 'width, height' }}
      >
        {/* Capsule content — just opacity, no size animation */}
        <motion.div
          className="absolute inset-0 flex items-center justify-between px-3"
          initial={false}
          animate={{ opacity: isCapsule ? 1 : 0 }}
          transition={{ duration: 0.15 }}
          style={{ pointerEvents: isCapsule ? 'auto' : 'none' }}
        >
          <Capsule
            connected={connected}
            sessionCount={sessions.length}
            hasActiveTask={hasActiveTask}
          />
        </motion.div>

        {/* Expanded content — delayed fade in via transition.delay */}
        <AnimatePresence>
          {!isCapsule && (
            <motion.div
              className="w-full h-full flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, delay: 0.08 }}
            >
              {/* Header row */}
              <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
                <div className="flex items-center gap-2">
                  <Bot size={14} color="#888" />
                  <span className="text-[11px] text-[#aaa] font-medium">
                    There are {sessions.length} sessions
                  </span>
                </div>
                <Settings size={13} color="#555" className="cursor-pointer hover:text-[#888] transition-colors" />
              </div>

              {/* Horizontal scrollable cards */}
              <div className="flex-1 px-3 pb-2.5 overflow-hidden">
                <div className="notch-scroll-container flex gap-2 h-full overflow-x-auto">
                  {sessions.map((session, index) => (
                    <TaskCard
                      key={session.id}
                      session={session}
                      index={index}
                      onOpenChat={handleOpenChat}
                      onCancel={cancelSession}
                      onDismiss={dismissNotification}
                    />
                  ))}
                </div>
              </div>

              {/* Scroll indicator dots */}
              {sessions.length > 3 && (
                <div className="flex items-center justify-center gap-1 pb-2">
                  {sessions.map((_, i) => (
                    <div
                      key={i}
                      className="w-1 h-1 rounded-full"
                      style={{
                        backgroundColor: i < 3 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
