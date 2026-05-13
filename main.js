const {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  shell,
  nativeTheme,
  globalShortcut,
  Notification,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');

const DEFAULT_MAX = 10;
const POLL_MS = 400;

let mainWindow = null;
let history = [];
let maxItems = DEFAULT_MAX;
let lastClipboardText = null;

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH(), 'utf8');
    const parsed = JSON.parse(raw);
    const n = Number(parsed.maxItems);
    if (Number.isFinite(n) && n >= 1 && n <= 200) {
      maxItems = Math.floor(n);
    }
  } catch {
    // ignore missing or invalid config
  }
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
    fs.writeFileSync(
      CONFIG_PATH(),
      JSON.stringify({ maxItems }, null, 2),
      'utf8'
    );
  } catch {
    // ignore
  }
}

function trimHistory() {
  if (history.length > maxItems) {
    history = history.slice(0, maxItems);
  }
}

function broadcastHistory() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('clipboard-history', [...history]);
  }
}

function recordText(text) {
  if (typeof text !== 'string') return;
  if (text.length === 0) return;

  lastClipboardText = text;

  const idx = history.indexOf(text);
  if (idx !== -1) {
    history.splice(idx, 1);
  }
  history.unshift(text);
  trimHistory();
  broadcastHistory();
}

function pollClipboard() {
  try {
    const text = clipboard.readText();
    if (text === lastClipboardText) return;
    if (text.length === 0) {
      lastClipboardText = '';
      return;
    }
    recordText(text);
  } catch {
    // ignore clipboard access errors
  }
}

function quickPasteModifierPrefix() {
  return process.platform === 'darwin' ? 'Command+Alt' : 'Control+Alt';
}

async function simulatePasteIntoFocusedApp() {
  if (process.platform === 'darwin') {
    await execFileAsync('osascript', [
      '-e',
      'delay 0.08',
      '-e',
      'tell application "System Events" to keystroke "v" using command down',
    ]);
    return true;
  }
  if (process.platform === 'linux') {
    try {
      await execFileAsync('xdotool', ['key', 'ctrl+v']);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function quickPasteToSlot(zeroBasedIndex) {
  const text = history[zeroBasedIndex];
  if (typeof text !== 'string' || text.length === 0) return;

  clipboard.writeText(text);
  recordText(text);

  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed() && focused === mainWindow) {
    return;
  }

  try {
    const ok = await simulatePasteIntoFocusedApp();
    if (!ok && process.platform === 'win32') {
      // Clipboard is set; user can press Ctrl+V once in the focused app.
    }
  } catch {
    if (process.platform === 'darwin') {
      new Notification({
        title: 'Clipy could not auto-paste',
        body: 'Enable Accessibility for Clipy in System Settings → Privacy & Security. The clip is already on the clipboard — you can press ⌘V manually.',
      }).show();
    }
  }
}

function registerQuickPasteHotkeys() {
  const mod = quickPasteModifierPrefix();
  for (let slot = 1; slot <= 9; slot += 1) {
    const accelerator = `${mod}+${slot}`;
    const captured = slot - 1;
    const ok = globalShortcut.register(accelerator, () => {
      void quickPasteToSlot(captured);
    });
    if (!ok) {
      console.warn(`Clipy: could not register global shortcut ${accelerator}`);
    }
  }
  const accel0 = `${mod}+0`;
  if (
    !globalShortcut.register(accel0, () => {
      void quickPasteToSlot(9);
    })
  ) {
    console.warn(`Clipy: could not register global shortcut ${accel0}`);
  }

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 560,
    minWidth: 320,
    minHeight: 400,
    show: false,
    title: 'Clipy',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  registerQuickPasteHotkeys();

  setInterval(pollClipboard, POLL_MS);
  pollClipboard();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('clipboard:get-history', () => [...history]);

ipcMain.handle('clipboard:get-max-items', () => maxItems);

ipcMain.handle('clipboard:set-max-items', (_event, next) => {
  const n = Number(next);
  if (!Number.isFinite(n)) return maxItems;
  const clamped = Math.min(200, Math.max(1, Math.floor(n)));
  maxItems = clamped;
  trimHistory();
  saveConfig();
  broadcastHistory();
  return maxItems;
});

ipcMain.handle('clipboard:select', (_event, text) => {
  if (typeof text !== 'string' || text.length === 0) return false;
  clipboard.writeText(text);
  recordText(text);
  return true;
});

ipcMain.handle('theme:get', () =>
  nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
);

nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(
      'theme-changed',
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    );
  }
});
