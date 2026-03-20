import { BrowserWindow } from 'electron'
import path from 'path'

let chatPopupWindow: BrowserWindow | null = null

export function createChatPopupWindow(sessionId: string): void {
  if (chatPopupWindow && !chatPopupWindow.isDestroyed()) {
    chatPopupWindow.webContents.send('chat-popup:switch-session', sessionId)
    chatPopupWindow.show()
    chatPopupWindow.focus()
    return
  }

  chatPopupWindow = new BrowserWindow({
    width: 480,
    height: 820,
    frame: false,
    transparent: false,
    backgroundColor: '#1A1A2E',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
    show: false,
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    chatPopupWindow.loadURL(
      `${process.env.ELECTRON_RENDERER_URL}/chat-popup.html?sessionId=${sessionId}`
    )
  } else {
    chatPopupWindow.loadFile(
      path.join(__dirname, '../renderer/chat-popup.html'),
      { query: { sessionId } }
    )
  }

  chatPopupWindow.once('ready-to-show', () => chatPopupWindow?.show())

  chatPopupWindow.on('closed', () => {
    chatPopupWindow = null
  })
}

export function hideChatPopup(): void {
  chatPopupWindow?.hide()
}

export function destroyChatPopup(): void {
  if (chatPopupWindow && !chatPopupWindow.isDestroyed()) {
    chatPopupWindow.destroy()
    chatPopupWindow = null
  }
}
