import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Notch state changes (returns cleanup function)
  onStateChange: (callback: (state: string) => void) => {
    const handler = (_e: any, state: string) => callback(state)
    ipcRenderer.on('notch:state-change', handler)
    return () => ipcRenderer.removeListener('notch:state-change', handler)
  },

  // Mouse events from renderer to main
  notifyMouseEnter: () => ipcRenderer.send('notch:mouse-enter'),
  notifyMouseLeave: () => ipcRenderer.send('notch:mouse-leave'),

  // Chat window control
  openChat: (sessionId: string) => ipcRenderer.send('chat:open', sessionId),
  closeChat: () => ipcRenderer.send('chat:close'),

  // WebSocket data forwarding (main → renderer, returns cleanup)
  onWsMessage: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('ws:message', handler)
    return () => ipcRenderer.removeListener('ws:message', handler)
  },

  // WebSocket send (renderer → main → server)
  wsSend: (message: any) => ipcRenderer.send('ws:send', message),

  // Connection status (returns cleanup)
  onConnectionStatus: (callback: (connected: boolean) => void) => {
    const handler = (_e: any, connected: boolean) => callback(connected)
    ipcRenderer.on('ws:connection-status', handler)
    return () => ipcRenderer.removeListener('ws:connection-status', handler)
  },

  // Get current active chat session (returns cleanup)
  onActiveChatSession: (callback: (sessionId: string | null) => void) => {
    const handler = (_e: any, sessionId: string | null) => callback(sessionId)
    ipcRenderer.on('chat:active-session', handler)
    return () => ipcRenderer.removeListener('chat:active-session', handler)
  }
}

contextBridge.exposeInMainWorld('island', api)
