import { motion, AnimatePresence } from 'motion/react'
import { TitleBar } from './TitleBar'
import { MessageList } from './MessageList'
import { TaskProgress } from './TaskProgress'
import { InputBar } from './InputBar'
import { useIslandStore } from '@/hooks/useIslandStore'

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

  // streamingText is keyed by sessionId
  const activeStreamingText = activeChatSessionId
    ? streamingText[activeChatSessionId]
    : undefined

  return (
    <AnimatePresence>
      {session && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
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
