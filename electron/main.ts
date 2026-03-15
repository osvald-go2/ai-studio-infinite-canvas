import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
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

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', false);
  });

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

ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

let dragStartMouse = { x: 0, y: 0 };
let dragStartWin = { x: 0, y: 0 };

ipcMain.on('window:startDrag', (_, screenX: number, screenY: number) => {
  if (!mainWindow) return;
  dragStartMouse = { x: screenX, y: screenY };
  const [wx, wy] = mainWindow.getPosition();
  dragStartWin = { x: wx, y: wy };
});

ipcMain.on('window:dragging', (_, screenX: number, screenY: number) => {
  if (!mainWindow) return;
  const dx = screenX - dragStartMouse.x;
  const dy = screenY - dragStartMouse.y;
  mainWindow.setPosition(dragStartWin.x + dx, dragStartWin.y + dy);
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

ipcMain.handle('scan-skills', async (_, platform: string, projectDir: string) => {
  const results: Array<{ name: string; description: string; filePath: string; source: 'project' | 'user' }> = [];

  const walkDir = async (dir: string, source: 'project' | 'user') => {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath, source);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          const parsed = parseSkillFrontmatter(content);
          if (parsed) {
            results.push({ ...parsed, filePath: fullPath, source });
          }
        } catch (e) {
          console.warn(`[scan-skills] Failed to read ${fullPath}:`, e);
        }
      }
    }
  };

  const projectSkillsDir = path.join(projectDir, `.${platform}`, 'skills');
  const userSkillsDir = path.join(os.homedir(), `.${platform}`, 'skills');

  await walkDir(projectSkillsDir, 'project');
  await walkDir(userSkillsDir, 'user');

  const seen = new Set<string>();
  return results.filter(s => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
});

function parseSkillFrontmatter(content: string): { name: string; description: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*['"]?(.+?)['"]?\s*$/m);
  if (!nameMatch) return null;

  const descMatch = frontmatter.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);

  return {
    name: nameMatch[1].trim(),
    description: descMatch ? descMatch[1].trim() : '',
  };
}

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
