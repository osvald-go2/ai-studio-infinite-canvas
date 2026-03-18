import { motion, AnimatePresence } from 'motion/react'
import { TitleBar } from './TitleBar'
import { MessageList } from './MessageList'
import { TaskProgress } from './TaskProgress'
import { InputBar } from './InputBar'
import { useIslandStore } from '@/hooks/useIslandStore'

// Trapezoid (narrow top, wide bottom) → full rectangle
const CLIP_TRAPEZOID = 'polygon(30% 0%, 70% 0%, 100% 100%, 0% 100%)'
const CLIP_RECTANGLE = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'

export function ChatPanel() {
  const {
    sessions,
    messages,
    streamingText,
    taskSteps,
    activeChatSessionId,
    sendMessage,
    cancelSession,
    closeChat
  } = useIslandStore()

  const session = sessions.find(s => s.id === activeChatSessionId)
  const sessionMessages = activeChatSessionId ? messages[activeChatSessionId] || [] : []
  const steps = activeChatSessionId ? taskSteps[activeChatSessionId] || [] : []
  const isProcessing = session?.status === 'inprocess'

  const activeStreamingText = activeChatSessionId
    ? streamingText[activeChatSessionId]
    : undefined

  return (
    <AnimatePresence>
      {session && (
        <motion.div
          initial={{
            opacity: 0,
            scaleY: 0.3,
            scaleX: 0.8,
            clipPath: CLIP_TRAPEZOID,
          }}
          animate={{
            opacity: 1,
            scaleY: 1,
            scaleX: 1,
            clipPath: CLIP_RECTANGLE,
          }}
          exit={{
            opacity: 0,
            scaleY: 0.3,
            scaleX: 0.8,
            clipPath: CLIP_TRAPEZOID,
          }}
          transition={{
            duration: 0.45,
            ease: [0.32, 0.72, 0, 1],
            clipPath: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
          }}
          style={{ transformOrigin: 'top center' }}
          className="liquid-glass w-full h-full flex flex-col"
        >
          <TitleBar
            title={session.title}
            model={session.model}
            isProcessing={isProcessing}
            onClose={closeChat}
            onStop={() => cancelSession(session.id)}
          />

          <MessageList
            messages={sessionMessages}
            streamingText={activeStreamingText}
          />

          {steps.length > 0 && (
            <TaskProgress steps={steps} sessionTitle={session.title} />
          )}

          <InputBar
            model={session.model}
            isProcessing={isProcessing}
            onSend={(content) => sendMessage(session.id, content)}
            onStop={() => cancelSession(session.id)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
