import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionWindow } from './components/SessionWindow'
import { GitProvider } from './contexts/GitProvider'
import { Session } from './types'
import './index.css'

function ChatPopupApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const params = new URLSearchParams(window.location.search)
  const initialSessionId = params.get('sessionId')

  const loadSession = (sessionId: string) => {
    setSession(null)
    setError(null)
    window.aiBackend.chatPopup.getSession(sessionId)
      .then((data: Session | null) => {
        if (data) {
          setSession(data)
        } else {
          setError('Session not found')
        }
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load session')
      })
  }

  useEffect(() => {
    if (initialSessionId) {
      loadSession(initialSessionId)
    }
  }, [initialSessionId])

  // Listen for session switch (when popup is reused for a different session)
  useEffect(() => {
    const cleanup = window.aiBackend.chatPopup.onSwitchSession((newId: string) => {
      loadSession(newId)
    })
    return cleanup
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1A1A2E] text-gray-400">
        <div className="text-center">
          <p className="mb-4">{error}</p>
          <button
            onClick={() => window.aiBackend.chatPopup.close()}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1A1A2E]">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <GitProvider projectDir={null}>
      <SessionWindow
        session={session}
        variant="popup"
        onUpdate={(s) => {
          setSession(s)
          // Only sync metadata back to main renderer — messages sync via sidecar events
          window.aiBackend.chatPopup.syncMetadata({
            id: s.id,
            title: s.title,
            status: s.status,
            claudeSessionId: s.claudeSessionId,
            codexThreadId: s.codexThreadId,
          })
        }}
        onClose={() => window.aiBackend.chatPopup.close()}
      />
    </GitProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatPopupApp />
  </StrictMode>
)
