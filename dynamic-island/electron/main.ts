import { app, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { hasHardwareNotch } from './notchDetector'
import { WindowManager } from './windowManager'
import { WsClient } from './wsClient'

let windowManager: WindowManager | null = null
let wsClient: WsClient | null = null

app.dock?.hide()

app.whenReady().then(() => {
  console.log('[Island] App ready, checking hardware...')

  // Check hardware compatibility
  const notchSupported = hasHardwareNotch()
  console.log('[Island] Hardware notch supported:', notchSupported)

  if (!notchSupported) {
    dialog.showErrorBox(
      'Not Supported',
      'Dynamic Island requires a MacBook with a hardware notch (M1 Pro/Max or later).'
    )
    app.quit()
    return
  }

  const preloadPath = join(__dirname, '../preload/index.js')
  console.log('[Island] Preload path:', preloadPath)

  // Create windows
  windowManager = new WindowManager(preloadPath)
  windowManager.createWindows()

  // In dev mode, load from vite dev server
  if (process.env.ELECTRON_RENDERER_URL) {
    const baseURL = process.env.ELECTRON_RENDERER_URL
    const notchURL = `${baseURL}/resources/notch.html`
    const chatURL = `${baseURL}/resources/chat.html`
    console.log('[Island] Loading dev URLs:', notchURL, chatURL)
    windowManager.loadPages(notchURL, chatURL)
  } else {
    const notchPath = join(__dirname, '../renderer/resources/notch.html')
    const chatPath = join(__dirname, '../renderer/resources/chat.html')
    console.log('[Island] Loading files:', notchPath, chatPath)
    windowManager.loadFiles(notchPath, chatPath)
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
