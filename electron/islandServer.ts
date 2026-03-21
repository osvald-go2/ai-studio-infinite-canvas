import { WebSocketServer, WebSocket } from 'ws'
import { BrowserWindow, ipcMain } from 'electron'
import { createChatPopupWindow, hideChatPopup } from './chatPopupManager'

const DEFAULT_PORT = 9720

let wss: WebSocketServer | null = null
let clients: Set<WebSocket> = new Set()

export function startIslandServer(mainWindow: BrowserWindow): void {
  const port = process.env.ISLAND_WS_PORT
    ? parseInt(process.env.ISLAND_WS_PORT, 10)
    : DEFAULT_PORT

  wss = new WebSocketServer({ port })

  wss.on('connection', (ws) => {
    clients.add(ws)

    // Request current sessions from Renderer
    mainWindow.webContents.send('island:request-sessions')

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        handleClientMessage(mainWindow, msg)
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
    })
  })

  // Listen for session data from Renderer
  ipcMain.on('island:sessions-response', (_e, sessions) => {
    broadcast({ type: 'sessions:sync', sessions })
  })

  // Listen for events from Renderer to forward to Island
  ipcMain.on('island:session-updated', (_e, data) => {
    broadcast({ type: 'session:update', ...data })
  })

  ipcMain.on('island:message-added', (_e, data) => {
    broadcast({ type: 'message:new', ...data })
  })

  ipcMain.on('island:message-stream', (_e, data) => {
    broadcast({ type: 'message:stream', ...data })
  })

  ipcMain.on('island:task-progressed', (_e, data) => {
    broadcast({ type: 'task:progress', ...data })
  })

  ipcMain.on('island:notification', (_e, data) => {
    broadcast({ type: 'notification', ...data })
  })

  ipcMain.on('island:messages-history', (_e, data) => {
    broadcast({ type: 'messages:history', ...data })
  })

  ipcMain.on('island:session-deleted', (_e, data) => {
    broadcast({ type: 'session:delete', sessionId: data.sessionId })
  })

  console.log(`[IslandServer] WebSocket server listening on ws://localhost:${port}`)
}

function handleClientMessage(mainWindow: BrowserWindow, msg: any): void {
  switch (msg.type) {
    case 'message:send':
      mainWindow.webContents.send('island:send-message', {
        sessionId: msg.sessionId,
        content: msg.content
      })
      break

    case 'session:cancel':
      mainWindow.webContents.send('island:cancel-session', {
        sessionId: msg.sessionId
      })
      break

    case 'notification:dismiss':
      // No-op on server side, Island handles locally
      break

    case 'messages:fetch':
      mainWindow.webContents.send('island:fetch-messages', {
        sessionId: msg.sessionId
      })
      break

    case 'sessions:fetch':
      mainWindow.webContents.send('island:request-sessions')
      break

    case 'chat:open':
      createChatPopupWindow(msg.sessionId)
      break

    case 'chat:close':
      hideChatPopup()
      break
  }
}

function broadcast(data: object): void {
  const payload = JSON.stringify(data)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  }
}

export function stopIslandServer(): void {
  wss?.close()
  clients.clear()
}
