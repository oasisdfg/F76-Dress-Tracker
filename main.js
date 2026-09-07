'use strict';

const { app, BrowserWindow, Menu, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const WINDOW_WIDTH = 1000;
const WINDOW_HEIGHT = 600;
const MIN_WIDTH = 960; // keeps the 899px grid intact so panels stay whole pixels
const MIN_HEIGHT = 520;
const BACKGROUND_COLOR = '#0d0d0d';
const TITLEBAR_HEIGHT = 36; // keep in sync with --titlebar-h in styles.css
const SAVE_DEBOUNCE_MS = 300;
const TIMER_SAVE_MS = 10000; // how often the running total is flushed to disk

let mainWindow = null;

/* ---------------------------------------------------------------- paths -- */

// Unpackaged: <project>/Dressicons.  Packaged: resources/Dressicons, which
// stays on disk next to the exe so PNGs can be swapped without rebuilding.
function iconsDir() {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(base, 'Dressicons');
}

function countsFile() {
  return path.join(app.getPath('userData'), 'counts.json');
}

function timerFile() {
  return path.join(app.getPath('userData'), 'timer.json');
}

/* ---------------------------------------------------------------- icons -- */

// Panel order, least rare first and rarest last. Any PNG not listed falls in
// after these, alphabetically, so a newly dropped-in file still shows up.
const PANEL_ORDER = [
  'weathereddress',
  'whitedirtydress',
  'whitedress',
  'browndress',
  'greendress',
  'bluedress',
  'pinkdress',
  'yellowdress',
  'forestdress',
  'reddress'
];

function orderIndex(id) {
  const i = PANEL_ORDER.indexOf(id.toLowerCase());
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

// "asylum_worker-dress.png" -> "Asylum Worker Dress"
function toLabel(basename) {
  return basename
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

// Returns [{ id, label, dataUrl }] in PANEL_ORDER.
// A missing or empty folder is not an error: the renderer shows its empty state.
function readIcons() {
  let entries;
  try {
    entries = fs.readdirSync(iconsDir());
  } catch (err) {
    console.warn('[dress-tracker] cannot read icons folder:', err.message);
    return [];
  }

  const files = entries
    .filter((name) => path.extname(name).toLowerCase() === '.png')
    .sort((a, b) => {
      const rank =
        orderIndex(path.basename(a, path.extname(a))) -
        orderIndex(path.basename(b, path.extname(b)));
      if (rank !== 0) return rank;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

  const icons = [];
  for (const file of files) {
    try {
      const buffer = fs.readFileSync(path.join(iconsDir(), file));
      const id = path.basename(file, path.extname(file));
      icons.push({
        id,
        label: toLabel(id),
        dataUrl: 'data:image/png;base64,' + buffer.toString('base64')
      });
    } catch (err) {
      console.warn('[dress-tracker] skipping ' + file + ':', err.message);
    }
  }
  return icons;
}

/* --------------------------------------------------------------- counts -- */

function sanitizeCounts(value) {
  const clean = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
  for (const [id, raw] of Object.entries(value)) {
    const n = Math.floor(Number(raw));
    clean[id] = Number.isFinite(n) && n > 0 ? n : 0;
  }
  return clean;
}

function loadCounts() {
  try {
    return sanitizeCounts(JSON.parse(fs.readFileSync(countsFile(), 'utf8')));
  } catch (err) {
    return {}; // missing or malformed file
  }
}

let saveTimer = null;
let pendingCounts = null;

function flushCounts() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!pendingCounts) return;

  const data = pendingCounts;
  pendingCounts = null;
  try {
    fs.mkdirSync(path.dirname(countsFile()), { recursive: true });
    fs.writeFileSync(countsFile(), JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[dress-tracker] failed to write counts:', err.message);
  }
}

function queueSave(counts) {
  pendingCounts = sanitizeCounts(counts);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushCounts, SAVE_DEBOUNCE_MS);
}

/* ---------------------------------------------------------------- timer -- */

// Total hunting time, accumulated across every run. Kept in its own file so
// counts.json stays a plain id -> count map.
//
// Timing uses performance.now(), which is monotonic: Date.now() would jump if
// the system clock changed or DST rolled over, and a stopwatch must not.
let timerBaseMs = 0;
let timerOrigin = performance.now();
let timerTicker = null;

function loadTimer() {
  try {
    const parsed = JSON.parse(fs.readFileSync(timerFile(), 'utf8'));
    const n = Math.floor(Number(parsed && parsed.elapsedMs));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (err) {
    return 0; // missing or malformed file
  }
}

function currentTimerMs() {
  return Math.round(timerBaseMs + Math.max(0, performance.now() - timerOrigin));
}

function writeTimer() {
  try {
    fs.mkdirSync(path.dirname(timerFile()), { recursive: true });
    fs.writeFileSync(
      timerFile(),
      JSON.stringify({ elapsedMs: currentTimerMs() }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[dress-tracker] failed to write timer:', err.message);
  }
}

function startTimer() {
  timerBaseMs = loadTimer();
  timerOrigin = performance.now();
  // Flush periodically so a crash or a kill only loses the last few seconds.
  timerTicker = setInterval(writeTimer, TIMER_SAVE_MS);
}

function resetTimer() {
  timerBaseMs = 0;
  timerOrigin = performance.now();
  writeTimer();
  return 0;
}

/* --------------------------------------------------------------- window -- */

function windowIcon() {
  try {
    const file = path.join(app.getAppPath(), 'build', 'icon.ico');
    if (!fs.existsSync(file)) return undefined;
    const image = nativeImage.createFromPath(file);
    return image.isEmpty() ? undefined : image;
  } catch (err) {
    return undefined; // dev runs before `npm run icon` still work
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: BACKGROUND_COLOR,
    autoHideMenuBar: true,
    // Hidden caption with the Windows controls overlaid: no title text, and the
    // strip is painted by the page itself so it matches the app exactly.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: BACKGROUND_COLOR,
      symbolColor: '#8a8a8a',
      height: TITLEBAR_HEIGHT
    },
    icon: windowIcon(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

/* ------------------------------------------------------------------ ipc -- */

ipcMain.handle('icons:get', () => readIcons());
ipcMain.handle('counts:load', () => loadCounts());
ipcMain.handle('counts:save', (_event, counts) => {
  queueSave(counts);
  return true;
});
ipcMain.handle('timer:get', () => currentTimerMs());
ipcMain.handle('timer:reset', () => resetTimer());

/* ----------------------------------------------------------- lifecycle -- */

app.setAppUserModelId('com.oasisdfg.dresstracker');
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  startTimer();
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  flushCounts();
  writeTimer();
});

app.on('window-all-closed', () => {
  flushCounts();
  writeTimer();
  if (timerTicker) clearInterval(timerTicker);
  if (process.platform !== 'darwin') app.quit();
});
