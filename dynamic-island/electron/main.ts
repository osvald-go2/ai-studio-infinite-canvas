import { app, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { hasHardwareNotch } from './notchDetector'
import { WindowManager } from './windowManager'
import { WsClient } from './wsClient'

let windowManager: WindowManager | null = null
let wsClient: WsClient | null = null

app.dock?.hide()

app.whenReady().then(() => {
  // Check hardware compatibility
  if (!hasHardwareNotch()) {
    dialog.showErrorBox(
      'Not Supported',
      'Dynamic Island requires a MacBook with a hardware notch (M1 Pro/Max or later).'
    )
    app.quit()
    return
  }

  const preloadPath = join(__dirname, '../preload/index.mjs')

  // Create windows
  windowManager = new WindowManager(preloadPath)
  windowManager.createWindows()

  // In dev mode, load from vite dev server
  if (process.env.ELECTRON_RENDERER_URL) {
    const baseURL = process.env.ELECTRON_RENDERER_URL
    windowManager.loadPages(`${baseURL}/notch.html`, `${baseURL}/chat.html`)
  } else {
    windowManager.loadFiles(
      join(__dirname, '../renderer/notch.html'),
      join(__dirname, '../renderer/chat.html')
    )
  }

  // Connect to AI Studio
  wsClient = new WsClient()

  wsClient.on('connected', () => {
    windowManager?.setConnectionStatus(true)
  })

  wsClient.on('disconnected', () => {
    windowManager?.setConnectionStatus(false)
  })

  wsClient.on('message', (data: any) => {
    windowManager?.broadcastToRenderers(data)

    // Auto-expand on notification
    if (data.type === 'notification') {
      windowManager?.expandForNotification()
    }
  })

  // Forward renderer WS sends to server
  ipcMain.on('ws:send', (_e, message) => {
    wsClient?.send(message)
  })

  wsClient.connect()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  wsClient?.close()
  windowManager?.destroy()
})
