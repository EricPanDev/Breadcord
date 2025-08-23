const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const windowStateKeeper = require('electron-window-state');

const {
  initTokenStore,
  save_token,
  load_token,
} = require('./tokenStore');

let mainWin;

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1000,
    defaultHeight: 700,
  });

  const displays = screen.getAllDisplays();
  const inBounds = displays.some(d => {
    const b = d.workArea;
    return (
      mainWindowState.x >= b.x &&
      mainWindowState.y >= b.y &&
      mainWindowState.x < b.x + b.width &&
      mainWindowState.y < b.y + b.height
    );
  });

  const opts = {
    x: inBounds ? mainWindowState.x : undefined,
    y: inBounds ? mainWindowState.y : undefined,
    width: mainWindowState.width,
    height: mainWindowState.height,
    frame: false,
    fullscreenable: true,
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  mainWin = new BrowserWindow(opts);
  windowStateKeeper({
    defaultWidth: 1000,
    defaultHeight: 700,
  }).manage(mainWin);

  mainWin.once('ready-to-show', () => { if (mainWindowState.isFullScreen) { mainWin.setFullScreen(true); } else if (mainWindowState.isMaximized) { mainWin.maximize(); } mainWin.show(); });

  load_token().then(token => {
    console.log('Loaded token:', token ? token.split('.')[0]+".xxxxxxx.xxxxxxx..." : 'No token found');
    const hasToken = !!(token);
    if (hasToken) {
      mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
    }
    else {
      mainWin.loadURL('https://discord.com/login');
    }
  });

  const saveStateFlags = () => {
    mainWindowState.isFullScreen = mainWin.isFullScreen();
    mainWindowState.isMaximized = mainWin.isMaximized();
  };
  mainWin.on('enter-full-screen', saveStateFlags);
  mainWin.on('leave-full-screen', saveStateFlags);
  mainWin.on('maximize', saveStateFlags);
  mainWin.on('unmaximize', saveStateFlags);
}

app.whenReady().then(() => {
  initTokenStore(app.getName());

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('token-found', (event, token) => {
  if (token) {
    var trimmed_token = token.split('.')[0]
    console.log('Renderer sent token:', trimmed_token+".xxxxxxx.xxxxxxx...");
    save_token(token).then(() => {
      console.log("Token saved, loading main app...");
      if (mainWin) {
        mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
      }
    }).catch(err => {
      console.error("Error saving token:", err);
    });
  }
  else {
    console.log("Not logged in, prompting login...");
  }
});

ipcMain.on('log', (event, log) => {
  console.log('Renderer log:', log);
});