import { useState, useCallback } from 'react'
import { Send, Square } from 'lucide-react'

interface InputBarProps {
  model: string
  isProcessing: boolean
  onSend: (content: string) => void
  onStop: () => void
}

export function InputBar({ model, isProcessing, onSend, onStop }: InputBarProps) {
  const [text, setText] = useState('')

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }, [text, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="px-4 pb-4 pt-3">
      <div className="liquid-glass-input flex items-center gap-2 px-3.5 py-2.5">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything"
          className="flex-1 bg-transparent text-white text-[12px] outline-none placeholder:text-[#6b7280]"
        />
        <span className="text-[#888] text-[9px] bg-white/[0.08] px-2 py-0.5 rounded-lg whitespace-nowrap">
          {model}
        </span>
        {isProcessing ? (
          <button
            onClick={onStop}
            className="w-6 h-6 rounded-full bg-[#f87171] flex items-center justify-center cursor-pointer"
          >
            <Square size={8} color="#fff" fill="#fff" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            className="w-6 h-6 rounded-full bg-[#4ade80] flex items-center justify-center cursor-pointer"
          >
            <Send size={10} color="#000" />
          </button>
        )}
      </div>
    </div>
  )
}
