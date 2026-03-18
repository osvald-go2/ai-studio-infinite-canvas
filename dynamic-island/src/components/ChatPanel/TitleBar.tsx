import { X, Square } from 'lucide-react'

interface TitleBarProps {
  title: string
  model: string
  isProcessing: boolean
  onClose: () => void
  onStop: () => void
}

export function TitleBar({ title, model, isProcessing, onClose, onStop }: TitleBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
      <button
        onClick={onClose}
        className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        <X size={12} color="#aaa" />
      </button>

      <div className="flex items-center gap-2">
        <span className="text-white text-[13px] font-semibold truncate max-w-[200px]">
          {title}
        </span>
        <span className="text-[#888] text-[9px] bg-white/[0.08] px-2 py-0.5 rounded-lg">
          {model}
        </span>
      </div>

      <div>
        {isProcessing && (
          <button
            onClick={onStop}
            className="w-6 h-6 rounded flex items-center justify-center cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            <Square size={10} color="#fff" fill="#fff" />
          </button>
        )}
      </div>
    </div>
  )
}
