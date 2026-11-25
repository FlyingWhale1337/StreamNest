const { app, BrowserWindow, shell, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

process.env.STREAMNEST_ELECTRON = '1';
if (app.isPackaged) process.env.STREAMNEST_DATA = path.join(app.getPath('userData'), 'data');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const ICON = path.join(__dirname, '..', 'build', 'icon.png');
let win = null;
let tray = null;
let baseUrl = null;
let quitting = false;
let trayHintShown = false;
let store = null;
const stateFile = path.join(app.getPath('userData'), 'window.json');

const TEXT = {
  ru: {
    question: 'Что сделать при закрытии окна?',
    detail: 'Свёрнутый в трей StreamNest продолжает работать: чат, бот, виджеты OBS и док-панель остаются активными.',
    tray: 'Свернуть в трей', quit: 'Закрыть программу', cancel: 'Отмена',
    remember: 'Запомнить выбор (можно изменить в «Подключения» → «Программа»)',
    open: 'Открыть StreamNest', exit: 'Выход',
    hintTitle: 'StreamNest работает в трее', hint: 'Чат и виджеты OBS остаются активными. Нажмите на значок, чтобы открыть окно.',
    port: (p) => `Порт ${p} уже занят — возможно, StreamNest уже запущен.`,
  },
  en: {
    question: 'What should happen when you close the window?',
    detail: 'When minimized to the tray, StreamNest keeps running: chat, bot, OBS widgets and the dock stay active.',
    tray: 'Minimize to tray', quit: 'Quit the app', cancel: 'Cancel',
    remember: 'Remember my choice (can be changed in Connections → App)',
    open: 'Open StreamNest', exit: 'Quit',
    hintTitle: 'StreamNest is running in the tray', hint: 'Chat and OBS widgets stay active. Click the icon to open the window.',
    port: (p) => `Port ${p} is already in use — StreamNest may already be running.`,
  },
};
function t() { return TEXT[store?.get('config').lang === 'en' ? 'en' : 'ru']; }

function loadBounds() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return { width: 1400, height: 900 }; }
}
function saveBounds() {
  if (!win || win.isDestroyed()) return;
  try { fs.writeFileSync(stateFile, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch {}
}

function isLocal(url) {
  return url.startsWith(baseUrl + '/') || url === baseUrl || url.startsWith(baseUrl.replace('localhost', '127.0.0.1') + '/');
}
function openExternal(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(u.toString());
  } catch {}
}
function guardNavigation(contents) {
  const handler = (e, url) => { if (!isLocal(url)) { e.preventDefault(); openExternal(url); } };
  contents.on('will-navigate', handler);
  contents.on('will-redirect', handler);
  contents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  contents.on('will-attach-webview', (e) => e.preventDefault());
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function ensureTray() {
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip('StreamNest');
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
  }
  const tx = t();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tx.open, click: showWindow },
    { type: 'separator' },
    { label: tx.exit, click: quitApp },
  ]));
}

function hideToTray() {
  ensureTray();
  win.hide();
  if (!trayHintShown && process.platform === 'win32') {
    trayHintShown = true;
    const tx = t();
    try { tray.displayBalloon({ title: tx.hintTitle, content: tx.hint, iconType: 'info' }); } catch {}
  }
}

function quitApp() {
  quitting = true;
  app.quit();
}

async function askCloseAction() {
  const tx = t();
  const { response, checkboxChecked } = await dialog.showMessageBox(win, {
    type: 'question', title: 'StreamNest', message: tx.question, detail: tx.detail,
    buttons: [tx.tray, tx.quit, tx.cancel], defaultId: 0, cancelId: 2, noLink: true,
    checkboxLabel: tx.remember, checkboxChecked: true,
  });
  if (response === 2) return;
  const action = response === 0 ? 'tray' : 'quit';
  if (checkboxChecked) {
    store.get('config').closeAction = action;
    store.save('config', true);
  }
  if (action === 'tray') hideToTray(); else quitApp();
}

async function createWindow() {
  const server = require('../server/index.js');
  store = require('../server/store');
  try {
    baseUrl = await server.start();
  } catch (e) {
    dialog.showErrorBox('StreamNest', e.code === 'EADDRINUSE' ? t().port(server.PORT) : String(e.message || e));
    quitApp();
    return;
  }
  const b = loadBounds();
  win = new BrowserWindow({
    width: b.width || 1400, height: b.height || 900, x: b.x, y: b.y, minWidth: 1000, minHeight: 640,
    backgroundColor: '#08080d', title: 'StreamNest', autoHideMenuBar: true, show: false, icon: ICON,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  if (b.maximized) win.maximize();
  guardNavigation(win.webContents);
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    saveBounds();
    if (quitting) return;
    const action = store.get('config').closeAction;
    if (action === 'quit') { quitting = true; return; }
    e.preventDefault();
    if (action === 'tray') hideToTray(); else askCloseAction();
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') win.webContents.toggleDevTools();
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) win.webContents.reload();
  });
  win.loadURL(baseUrl);
}

Menu.setApplicationMenu(null);
app.on('second-instance', showWindow);
app.whenReady().then(createWindow);
app.on('before-quit', () => { quitting = true; try { store?.flushAll(); } catch {} });
app.on('window-all-closed', () => app.quit());
