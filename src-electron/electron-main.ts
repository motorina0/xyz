import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platform = process.platform || os.platform();
const appId = 'com.motorina0.nostrchat';
const currentDir = fileURLToPath(new URL('.', import.meta.url));

let mainWindow: BrowserWindow | null = null;

function shouldToggleDevTools(input: Electron.Input): boolean {
  if (input.type !== 'keyDown') {
    return false;
  }

  const key = input.key.toLowerCase();
  const isMacShortcut = input.meta && input.alt && key === 'i';
  const isCrossPlatformShortcut = input.control && input.shift && key === 'i';

  return key === 'f12' || isMacShortcut || isCrossPlatformShortcut;
}

function getPreloadPath(): string {
  return path.resolve(
    currentDir,
    path.join(
      process.env.QUASAR_ELECTRON_PRELOAD_FOLDER,
      `electron-preload${process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION}`
    )
  );
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    title: 'Nostr Chat',
    icon: path.resolve(currentDir, 'icons/icon.png'),
    width: 1440,
    height: 960,
    minWidth: 360,
    minHeight: 640,
    useContentSize: true,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b141a' : '#f6f8fb',
    webPreferences: {
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!shouldToggleDevTools(input)) {
      return;
    }

    event.preventDefault();
    mainWindow?.webContents.toggleDevTools();
  });

  if (process.env.DEV) {
    await mainWindow.loadURL(process.env.APP_URL);
  } else {
    await mainWindow.loadFile('index.html');
  }

  if (process.env.DEBUGGING) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(appId);

  app.on('second-instance', () => {
    if (!mainWindow) {
      void createWindow();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  void app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    void createWindow();
  }
});
