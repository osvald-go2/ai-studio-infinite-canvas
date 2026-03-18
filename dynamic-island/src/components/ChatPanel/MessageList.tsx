import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Message } from '@/types'

interface MessageListProps {
  messages: Message[]
  streamingText?: string
}

export function MessageList({ messages, streamingText }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map(msg => (
        <div
          key={msg.id}
          className={msg.role === 'user' ? 'ml-[20%]' : ''}
        >
          {msg.role === 'user' ? (
            <div className="msg-bubble-user px-4 py-3">
              <p className="text-[#a5b4fc] text-[12px] leading-relaxed">
                {msg.content}
              </p>
            </div>
          ) : (
            <div className="msg-bubble-assistant text-[12px] leading-[1.8]">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>
      ))}

      {/* Streaming indicator */}
      {streamingText && (
        <div className="msg-bubble-assistant text-[12px] leading-[1.8]">
          <ReactMarkdown>{streamingText}</ReactMarkdown>
          <span className="inline-block w-1.5 h-4 bg-white/50 animate-pulse ml-0.5" />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
