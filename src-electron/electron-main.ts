import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme, shell } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platform = process.platform || os.platform();
const appId = 'com.lnbits.nostrchat';
const currentDir = fileURLToPath(new URL('.', import.meta.url));
const MAX_UNREAD_CHAT_BADGE_COUNT = 99;

let mainWindow: BrowserWindow | null = null;
let unreadChatBadgeState = {
  count: 0,
  label: '',
};

function shouldToggleDevTools(input: Electron.Input): boolean {
  if (input.type !== 'keyDown') {
    return false;
  }

  const key = input.key.toLowerCase();
  const isMacShortcut = input.meta && input.alt && key === 'i';
  const isCrossPlatformShortcut = input.control && input.shift && key === 'i';

  return key === 'f12' || isMacShortcut || isCrossPlatformShortcut;
}

function normalizeUnreadChatBadgeCount(count: unknown): number {
  const numericCount = typeof count === 'number' ? count : Number(count);
  if (!Number.isFinite(numericCount)) {
    return 0;
  }

  return Math.max(0, Math.floor(numericCount));
}

function formatUnreadChatBadgeLabel(count: number): string {
  return count > MAX_UNREAD_CHAT_BADGE_COUNT ? `${MAX_UNREAD_CHAT_BADGE_COUNT}+` : String(count);
}

function sanitizeUnreadChatBadgeLabel(label: unknown, count: number): string {
  if (count <= 0) {
    return '';
  }

  if (typeof label !== 'string') {
    return formatUnreadChatBadgeLabel(count);
  }

  const trimmedLabel = label.trim();
  if (!trimmedLabel || trimmedLabel.length > 4 || /^[0-9+]+$/.test(trimmedLabel) === false) {
    return formatUnreadChatBadgeLabel(count);
  }

  return trimmedLabel;
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createWindowsUnreadBadgeIcon(label: string): Electron.NativeImage {
  const fontSize = label.length > 2 ? 26 : 30;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="28" fill="#e53935" />
      <text
        x="32"
        y="40"
        text-anchor="middle"
        font-family="'Segoe UI', system-ui, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="#ffffff"
      >${escapeSvgText(label)}</text>
    </svg>
  `.trim();
  const svgBase64 = Buffer.from(svg).toString('base64');

  return nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${svgBase64}`)
    .resize({ width: 16, height: 16, quality: 'best' });
}

function applyUnreadChatBadge(): void {
  const count = unreadChatBadgeState.count;
  const label = unreadChatBadgeState.label;

  if (platform === 'darwin') {
    app.dock.setBadge(count > 0 ? label : '');
    return;
  }

  if (platform === 'win32') {
    mainWindow?.setOverlayIcon(
      count > 0 ? createWindowsUnreadBadgeIcon(label) : null,
      count > 0 ? `${label} unread chats` : ''
    );
    return;
  }

  app.setBadgeCount(count > 0 ? Math.min(count, MAX_UNREAD_CHAT_BADGE_COUNT) : 0);
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

  applyUnreadChatBadge();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.on('desktop:set-unread-chat-badge', (_event, payload: unknown) => {
  const payloadObject =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const count = normalizeUnreadChatBadgeCount(payloadObject.count);
  const label = sanitizeUnreadChatBadgeLabel(payloadObject.label, count);

  unreadChatBadgeState = {
    count,
    label,
  };
  applyUnreadChatBadge();
});

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
