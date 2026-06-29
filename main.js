const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');
const cron = require('node-cron');

// Persistent storage using electron-store (saves to a JSON file on disk)
const store = new Store();

let mainWindow = null;
let tray = null;
let cronJob = null;

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 620,
    resizable: false,
    title: 'Plant Tracker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,    // security: renderer can't access Node directly
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  // Hide to tray instead of quitting when window is closed
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function createTray() {
  // Use a plain icon; replace 'assets/tray-icon.png' with a 16x16 (win/linux)
  // or 22x22 (mac) PNG of your choice.
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Plant Tracker');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Plant Tracker',
      click: () => { mainWindow.show(); mainWindow.focus(); },
    },
    {
      label: 'Log watering now',
      click: () => {
        logWatering();
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ─── Notifications ────────────────────────────────────────────────────────────

function sendWateringReminder(plantName) {
  if (!Notification.isSupported()) return;
  new Notification({
    title: '🌿 Time to water your plant!',
    body: `${plantName || 'Your plant'} needs watering today.`,
    silent: false,
  }).show();
}

// ─── Cron scheduler ───────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function scheduleCron() {
  if (cronJob) cronJob.stop();

  const state = store.get('plantData');
  if (!state) return;

  const { dayOfWeek, plantName } = state;

  // Fires at 9:00 AM on the configured day of the week
  // node-cron day-of-week: 0 = Sunday … 6 = Saturday
  cronJob = cron.schedule(`0 9 * * ${dayOfWeek}`, () => {
    const current = store.get('plantData');
    if (!current) return;

    // Only notify if the plant hasn't been watered today
    const today = new Date().toDateString();
    const history = current.history || [];
    const wateredToday = history.some(d => new Date(d).toDateString() === today);

    if (!wateredToday) {
      sendWateringReminder(plantName);
    }
  });
}

// ─── Watering logic ───────────────────────────────────────────────────────────

function logWatering() {
  const state = store.get('plantData');
  if (!state) return;
  const history = state.history || [];
  history.push(new Date().toISOString());
  store.set('plantData', { ...state, history });

  // Tell the renderer to refresh its UI
  if (mainWindow) mainWindow.webContents.send('state-updated', store.get('plantData'));
}

// ─── IPC handlers (renderer ↔ main) ──────────────────────────────────────────

ipcMain.handle('get-state', () => store.get('plantData') || null);

ipcMain.handle('save-state', (_, data) => {
  store.set('plantData', data);
  scheduleCron();               // restart cron with new day if changed
  return true;
});

ipcMain.handle('log-watering', () => {
  logWatering();
  return store.get('plantData');
});

ipcMain.handle('reset-state', () => {
  store.delete('plantData');
  if (cronJob) cronJob.stop();
  return true;
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();
  scheduleCron();

  app.on('activate', () => {           // macOS: re-open on dock click
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
  if (process.platform === 'darwin') app.dock?.hide();
});