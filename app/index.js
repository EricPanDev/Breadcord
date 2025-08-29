const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const windowStateKeeper = require('electron-window-state');
const WebSocket = require('ws');

ipcMain.on('log', (event, log) => {
  console.log('[Renderer]', log);
});

const {
  initTokenStore,
  save_token,
  load_token,
} = require('./tokenStore');

let mainWin;

var ws_reconnect_handle = false;

function handle_ws(token) {
  const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

  let ws;
  let seq = null;
  let heartbeatTimer = null;
  let heartbeatIntervalMs = null;
  let lastHeartbeatSentAt = null;

  // Optional: keep the process from whining about unhandled rejections
  process.on('unhandledRejection', (err) => {
    console.error('[unhandledRejection]', err);
  });

  if (!ws_reconnect_handle) {
    ws_reconnect_handle = true;
    ipcMain.handle('websocket:reconnect', async () => reconnect());
  }
  connect();

  function connect() {
    cleanup(); // <-- now defined

    ws = new WebSocket(GATEWAY_URL);

    ws.on('open', () => log('WS established'));

    ws.on('message', (buf) => {
      let pkt;
      try { pkt = JSON.parse(buf.toString()); } catch { return; }

      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('discord-gateway-message', pkt);
      }

      if (typeof pkt.s === 'number') seq = pkt.s;

      switch (pkt.op) {
        case 10: { // HELLO
          heartbeatIntervalMs = pkt?.d?.heartbeat_interval;
          log(`HELLO heartbeat_interval=${heartbeatIntervalMs}ms`);
          startHeartbeats(heartbeatIntervalMs);

          send({
            op: 2,
            d: {
              token: token,
              properties: {
                os: process.platform,
                browser: 'breadcord',
                device: 'breadcord',
              }
            },
          });
          log('IDENTIFY sent');
          break;
        }
        case 11: { // HEARTBEAT ACK
          if (lastHeartbeatSentAt != null) {
            const ping = Date.now() - lastHeartbeatSentAt;
            if (mainWin && !mainWin.isDestroyed()) {
              mainWin.webContents.send('discord-gateway-ping', { pingMs: ping });
            }
            log(`HEARTBEAT ACK ping=${ping}ms`);
          }
          break;
        }
        case 1: // Server requests immediate heartbeat
          log('Server requested HEARTBEAT now');
          sendHeartbeat();
          break;
        case 7: // RECONNECT
          log('Server requested RECONNECT');
          reconnect();
          break;
        case 9: // INVALID_SESSION
          log(`INVALID_SESSION resume=${Boolean(pkt.d)}`);
          setTimeout(() => reconnect(true), 2500);
          break;
        default:
          break;
      }
    });

    ws.on('close', (code, reason) => {
      log(`ws close code=${code} reason=${reason}`);
      stopHeartbeats();
      setTimeout(() => reconnect(), 2000);
    });

    ws.on('error', (err) => {
      log(`ws error: ${err?.message || err}`);
      // 'close' will handle reconnect; make sure we don't throw here
    });
  }

  function reconnect(fresh = false) {
    stopHeartbeats();
    try { ws?.terminate(); } catch {}
    if (fresh) seq = null;
    connect();
  }

  function startHeartbeats(interval) {
    stopHeartbeats();
    if (!interval || !Number.isFinite(interval)) return;

    // Jitter first heartbeat per Discord guidance
    const firstDelay = Math.floor(Math.random() * interval);

    setTimeout(() => {
      sendHeartbeat();
      heartbeatTimer = setInterval(sendHeartbeat, interval);
      log('Heartbeat interval started');
    }, firstDelay);
  }

  function stopHeartbeats() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      log('Heartbeat interval stopped');
    }
  }

  function sendHeartbeat() {
    lastHeartbeatSentAt = Date.now();
    log(`Sending HEARTBEAT seq=${seq ?? 'null'}`);
    send({ op: 1, d: seq ?? null });
  }

  function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      log('send() skipped; socket not open');
    }
  }

  // 🔧 This was missing
  function cleanup() {
    // Clear any existing heartbeat loop
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    // Tear down any existing socket/listeners
    if (ws) {
      try { ws.removeAllListeners(); } catch {}
      try { ws.terminate(); } catch {}
      ws = null;
    }
  }

  function log(msg) {
    console.log(`[gateway] ${msg}`);
  }
}


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
    console.log('[Auth] Loaded token from keystore:', token ? token.split('.')[0]+".xxxxxxx.xxxxxxx..." : 'No token found');
    const hasToken = !!(token);
    if (hasToken) {
      mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
      handle_ws(token);
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

const fs   = require('node:fs');
// BreadAPI 
function getPlugins() {
  const pluginsDir = path.join(__dirname, 'src', 'plugins');
  try {
    return fs.readdirSync(pluginsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (e) {
    console.error('[BreadAPI] Failed to read plugins directory:', e);
    return [];
  }
}
ipcMain.handle('plugins:list', async () => getPlugins());

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
        handle_ws(token);
      }
    }).catch(err => {
      console.error("Error saving token:", err);
    });
  }
  else {
    console.log("Not logged in, prompting login...");
  }
});

app.on('browser-window-created', (event, window) => {
  window.webContents.on('before-input-event', (event, input) => {
    const isDevToolsKey =
      // Windows/Linux: Ctrl+Shift+I
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      // macOS: Cmd+Option+I
      (input.meta && input.alt && input.key.toLowerCase() === 'i') ||
      // F12 (all platforms)
      (input.key === 'F12');

    if (isDevToolsKey) {
      window.webContents.openDevTools({ mode: 'detach' });
      event.preventDefault();
    }
  });
});

function withWin(fn) {
  if (mainWin && !mainWin.isDestroyed()) fn(mainWin);
}

ipcMain.on('close', () => {
  withWin(win => win.close());
});

ipcMain.on('minimize', () => {
  withWin(win => win.minimize());
});
ipcMain.on('maximize', () => {
  withWin(win => {
    if (process.platform === 'darwin') {
      const isSimple = win.isSimpleFullScreen && win.isSimpleFullScreen();
      if (win.setSimpleFullScreen) {
        win.setSimpleFullScreen(!isSimple);
        return;
      }
      const isFull = win.isFullScreen();
      win.setFullScreen(!isFull);
    } else {
      const isFull = win.isFullScreen();
      win.setFullScreen(!isFull);
    }
  });
});

