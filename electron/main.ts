import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import Store from 'electron-store';
import * as pty from 'node-pty';
import { SidecarManager } from './sidecar';

const store = new Store<{ anthropicApiKey?: string; lastProjectDir?: string }>();

let mainWindow: BrowserWindow | null = null;
let sidecar: SidecarManager | null = null;

// PTY management
const ptyProcesses = new Map<number, pty.IPty>();
let nextPtyId = 1;

function getIconPath(): string {
  const iconFile = process.platform === 'darwin' ? 'icon.icns' : 'icon.png';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, iconFile);
  }
  return path.join(__dirname, '../../resources', iconFile);
}

function createWindow(): void {
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    icon: iconPath,
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
  const results: Array<{ name: string; description: string; filePath: string; source: 'project' | 'user'; pluginName?: string }> = [];

  const walkDir = async (dir: string, source: 'project' | 'user', pluginName?: string) => {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath, source, pluginName);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          const parsed = parseSkillFrontmatter(content);
          if (parsed) {
            results.push({ ...parsed, filePath: fullPath, source, pluginName });
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

// ── PTY IPC handlers ──

ipcMain.handle('pty:spawn', (_, cwd: string) => {
  const id = nextPtyId++;

  // Resolve shell — Electron GUI apps may not inherit SHELL from the terminal
  let shell: string;
  if (process.platform === 'win32') {
    shell = 'powershell.exe';
  } else {
    const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'];
    shell = candidates.find(s => s && fs.existsSync(s)) || '/bin/sh';
  }

  // Ensure cwd exists, fall back to home dir
  const safeCwd = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();

  const p = pty.spawn(shell, [], { name: 'xterm-256color', cols: 80, rows: 24, cwd: safeCwd });
  ptyProcesses.set(id, p);
  p.onData(data => mainWindow?.webContents.send('pty:data', { id, data }));
  p.onExit(({ exitCode }) => {
    mainWindow?.webContents.send('pty:exit', { id, code: exitCode });
    ptyProcesses.delete(id);
  });
  return id;
});

ipcMain.on('pty:write', (_, id: number, data: string) => {
  ptyProcesses.get(id)?.write(data);
});

ipcMain.on('pty:resize', (_, id: number, cols: number, rows: number) => {
  ptyProcesses.get(id)?.resize(cols, rows);
});

ipcMain.handle('pty:kill', (_, id: number) => {
  ptyProcesses.get(id)?.kill();
  ptyProcesses.delete(id);
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(getIconPath()));
  }
  startSidecar();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  ptyProcesses.forEach(p => p.kill());
  ptyProcesses.clear();
  sidecar?.kill();
  app.quit();
});
