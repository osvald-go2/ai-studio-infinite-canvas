import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { SidecarManager } from './sidecar';

const store = new Store<{ anthropicApiKey?: string; lastProjectDir?: string }>();

let mainWindow: BrowserWindow | null = null;
let sidecar: SidecarManager | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#1A1A2E',
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getSidecarEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const storedKey = store.get('anthropicApiKey');
  const envKey = process.env.ANTHROPIC_API_KEY;
  const apiKey = storedKey || envKey;
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
  }
  return env;
}

function startSidecar(): void {
  sidecar = new SidecarManager();

  sidecar.spawn(getSidecarEnv());

  sidecar.on('event', (eventName: string, data: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sidecar:event', eventName, data);
    }
  });

  sidecar.on('crashed', (code: number | null) => {
    console.log(`[main] sidecar crashed with code ${code}, restarting...`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sidecar:event', 'sidecar.restarted', {});
    }
    setTimeout(() => {
      if (sidecar) {
        sidecar.spawn(getSidecarEnv());
      }
    }, 1000);
  });
}

ipcMain.handle('sidecar:invoke', async (_, method: string, params: any) => {
  if (!sidecar || !sidecar.isRunning()) {
    throw new Error('sidecar not running');
  }

  if (method === 'config.set_api_key' && params?.api_key) {
    store.set('anthropicApiKey', params.api_key);
  }

  return sidecar.invoke(method, params);
});

ipcMain.handle('get-working-dir', () => {
  return process.cwd();
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: '选择项目目录',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  store.set('lastProjectDir', result.filePaths[0]);
  return result.filePaths[0];
});

ipcMain.handle('config:getLastProjectDir', () => {
  return store.get('lastProjectDir', null);
});

app.whenReady().then(() => {
  startSidecar();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  sidecar?.kill();
  app.quit();
});
