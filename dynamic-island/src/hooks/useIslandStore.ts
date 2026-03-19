import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  IslandSession,
  TaskStep,
  Message,
  IslandNotification,
  NotchState,
  ServerMessage
} from '@/types'

interface IslandState {
  sessions: IslandSession[]
  notifications: IslandNotification[]
  messages: Record<string, Message[]>        // sessionId → messages
  streamingText: Record<string, string>      // sessionId → accumulated text
  taskSteps: Record<string, TaskStep[]>      // sessionId → steps
  connected: boolean
  notchState: NotchState
  activeChatSessionId: string | null
}

// Mock sessions for development
const MOCK_SESSIONS: IslandSession[] = [
  { id: '1', title: '下载推文中的研报原文', model: 'GPT-5.4', status: 'done', lastMessage: 'Task has been completed', messageCount: 3 },
  { id: '2', title: '下载 X 帖子里的研报', model: 'Claude', status: 'inprocess', lastMessage: '定位原始研报链接', messageCount: 5 },
  { id: '3', title: '数据分析报告', model: 'Gemini', status: 'inbox', lastMessage: '等待中', messageCount: 0 }
]

export function useIslandStore() {
  const [state, setState] = useState<IslandState>({
    sessions: MOCK_SESSIONS,
    notifications: [],
    messages: {},
    streamingText: {},
    taskSteps: {},
    connected: false,
    notchState: 'capsule',
    activeChatSessionId: null
  })

  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const handleWsMessage = (data: ServerMessage) => {
      switch (data.type) {
        case 'sessions:sync':
          setState(s => ({ ...s, sessions: data.sessions }))
          break

        case 'session:update':
          setState(s => ({
            ...s,
            sessions: s.sessions.map(ses =>
              ses.id === data.sessionId
                ? { ...ses, status: data.status, ...(data.title !== undefined && { title: data.title }), ...(data.lastMessage !== undefined && { lastMessage: data.lastMessage }) }
                : ses
            )
          }))
          break

        case 'message:new':
          setState(s => ({
            ...s,
            messages: {
              ...s.messages,
              [data.sessionId]: [
                ...(s.messages[data.sessionId] || []),
                data.message
              ]
            }
          }))
          break

        case 'message:stream': {
          // Key streaming text by sessionId so ChatPanel can look up by active session
          const sid = data.sessionId
          setState(s => {
            const prev = s.streamingText[sid] || ''
            const updated = prev + data.chunk
            if (data.done) {
              // Move streaming text to messages
              const msg: Message = {
                id: data.messageId,
                role: 'assistant',
                content: updated,
                timestamp: Date.now()
              }
              const { [sid]: _, ...restStreaming } = s.streamingText
              return {
                ...s,
                streamingText: restStreaming,
                messages: {
                  ...s.messages,
                  [sid]: [...(s.messages[sid] || []), msg]
                }
              }
            }
            return {
              ...s,
              streamingText: { ...s.streamingText, [sid]: updated }
            }
          })
          break
        }

        case 'task:progress':
          setState(s => ({
            ...s,
            taskSteps: { ...s.taskSteps, [data.sessionId]: data.steps }
          }))
          break

        case 'notification':
          setState(s => ({
            ...s,
            notifications: [
              ...s.notifications,
              {
                sessionId: data.sessionId,
                level: data.level,
                text: data.text,
                timestamp: Date.now()
              }
            ]
          }))
          break

        case 'messages:history':
          setState(s => ({
            ...s,
            messages: { ...s.messages, [data.sessionId]: data.messages }
          }))
          break

        case 'error':
          setState(s => ({
            ...s,
            sessions: s.sessions.filter(ses => ses.id !== data.sessionId)
          }))
          break
      }
    }

    const handleConnectionStatus = (connected: boolean) => {
      setState(s => ({ ...s, connected }))
    }

    const handleStateChange = (notchState: string) => {
      setState(s => ({ ...s, notchState: notchState as NotchState }))
    }

    const handleActiveChatSession = (sessionId: string | null) => {
      setState(s => ({ ...s, activeChatSessionId: sessionId }))
    }

    const cleanupWs = window.island.onWsMessage(handleWsMessage)
    const cleanupConn = window.island.onConnectionStatus(handleConnectionStatus)
    const cleanupState = window.island.onStateChange(handleStateChange)
    const cleanupChat = window.island.onActiveChatSession(handleActiveChatSession)

    return () => {
      cleanupWs()
      cleanupConn()
      cleanupState()
      cleanupChat()
    }
  }, [])

  const sendMessage = useCallback((sessionId: string, content: string) => {
    window.island.wsSend({ type: 'message:send', sessionId, content })
  }, [])

  const cancelSession = useCallback((sessionId: string) => {
    window.island.wsSend({ type: 'session:cancel', sessionId })
  }, [])

  const dismissNotification = useCallback((sessionId: string) => {
    window.island.wsSend({ type: 'notification:dismiss', sessionId })
    setState(s => ({
      ...s,
      notifications: s.notifications.filter(n => n.sessionId !== sessionId)
    }))
  }, [])

  const fetchMessages = useCallback((sessionId: string) => {
    window.island.wsSend({ type: 'messages:fetch', sessionId })
  }, [])

  const openChat = useCallback((sessionId: string) => {
    window.island.openChat(sessionId)
  }, [])

  const closeChat = useCallback(() => {
    window.island.closeChat()
  }, [])

  return {
    ...state,
    sendMessage,
    cancelSession,
    dismissNotification,
    fetchMessages,
    openChat,
    closeChat
  }
}
