const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const windowStateKeeper = require('electron-window-state');
const WebSocket = require('ws');
// const BreadcordVoiceHandler = require("./BreadcordVoiceHandler"); // Not used - voice handler is in plugin

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
let ws_send_handle = false;
let currentToken = null;

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_USER_AGENT = 'Breadcord/2.0.0 (+https://github.com/ericpandev/Breadcord)';

function handle_ws(token) {
  currentToken = token;
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
  if (!ws_send_handle) {
    ws_send_handle = true;
    ipcMain.handle('gateway:send', async (_event, payload) => {
      try {
        send(payload);            // <- calls the closure's send()
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
    });
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
ipcMain.handle('discord-rest', async (_event, request = {}) => {
  const {
    method = 'GET',
    path: resourcePath,
    body,
    headers = {},
    files = [],
  } = request;

  if (!currentToken) {
    return { ok: false, status: 401, error: 'Not authenticated' };
  }

  if (typeof resourcePath !== 'string' || !resourcePath.startsWith('/')) {
    return { ok: false, status: 400, error: 'Invalid REST path' };
  }

  const url = `${DISCORD_API_BASE}${resourcePath}`;
  const upperMethod = String(method || 'GET').toUpperCase();

  const baseHeaders = {
    Authorization: currentToken,
    'User-Agent': DISCORD_USER_AGENT,
    ...headers,
  };

  const init = {
    method: upperMethod,
    headers: { ...baseHeaders },
  };

  const hasAttachments = Array.isArray(files) && files.length > 0;

  if (hasAttachments && (upperMethod === 'GET' || upperMethod === 'HEAD')) {
    return { ok: false, status: 400, error: 'Attachments are not supported for this method' };
  }

  const formatResponse = async (response) => {
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { data = raw; }
    }

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let errorMessage = null;
    if (!response.ok) {
      if (data && typeof data === 'object') {
        if (typeof data.message === 'string' && data.message.length) {
          errorMessage = data.message;
        } else if (data.code || data.errors) {
          errorMessage = JSON.stringify({
            code: data.code,
            errors: data.errors,
          });
        }
      }
      if (!errorMessage && typeof raw === 'string' && raw.length) {
        errorMessage = raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
      }
      if (!errorMessage) {
        errorMessage = `Discord HTTP ${response.status}`;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      headers: responseHeaders,
      error: errorMessage,
    };
  };

  const normalizePayload = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...value };
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return { content: value };
      }
    }
    return {};
  };

  const toBuffer = (raw) => {
    if (raw == null) return Buffer.alloc(0);
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof ArrayBuffer) return Buffer.from(raw);
    if (ArrayBuffer.isView(raw)) {
      return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    }
    if (Array.isArray(raw)) return Buffer.from(raw);
    if (typeof raw === 'string') return Buffer.from(raw, 'base64');
    return Buffer.alloc(0);
  };

  const messagePathMatch = hasAttachments
    ? resourcePath.match(/^\/channels\/(\d+)\/messages$/)
    : null;

  if (hasAttachments && upperMethod === 'POST' && messagePathMatch) {
    const channelId = messagePathMatch[1];
    const payload = normalizePayload(body);

    const normalizedFiles = files.map((file, index) => {
      const name = file?.name || `file-${index}`;
      const type = file?.type || 'application/octet-stream';
      const buffer = toBuffer(file?.data);
      const reportedSize = typeof file?.size === 'number' ? file.size : undefined;
      const size = reportedSize ?? buffer.length;
      return {
        id: file?.id != null ? String(file.id) : String(index),
        name,
        type,
        buffer,
        size,
        description: file?.description,
        duration_secs: file?.duration_secs,
        waveform: file?.waveform,
        flags: file?.flags,
      };
    });

    const attachmentsRequestBody = {
      files: normalizedFiles.map((file) => ({
        id: file.id,
        filename: file.name,
        file_size: file.size,
        is_clip: false,
        original_content_type: file.type,
      })),
    };

    const attachmentHeaders = { ...baseHeaders, 'Content-Type': 'application/json' };
    delete attachmentHeaders['Content-Length'];

    try {
      const attachmentsResponse = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/attachments`, {
        method: 'POST',
        headers: attachmentHeaders,
        body: JSON.stringify(attachmentsRequestBody),
      });

      const attachmentsResult = await formatResponse(attachmentsResponse);
      if (!attachmentsResult.ok) {
        return {
          ...attachmentsResult,
          error: attachmentsResult.data?.message || 'Failed to create attachment upload.',
        };
      }

      const attachmentSlots = Array.isArray(attachmentsResult.data?.attachments)
        ? attachmentsResult.data.attachments
        : Array.isArray(attachmentsResult.data)
          ? attachmentsResult.data
          : [];

      if (!attachmentSlots.length || attachmentSlots.length !== normalizedFiles.length) {
        return {
          ok: false,
          status: attachmentsResult.status ?? 0,
          error: 'Attachment metadata response mismatch.',
          data: attachmentsResult.data,
          headers: attachmentsResult.headers,
        };
      }

      for (let i = 0; i < attachmentSlots.length; i += 1) {
        const slot = attachmentSlots[i];
        const file = normalizedFiles[i];

        if (!slot?.upload_url) {
          return {
            ok: false,
            status: 0,
            error: 'Missing upload URL for attachment.',
            data: attachmentsResult.data,
            headers: attachmentsResult.headers,
          };
        }

        const uploadHeaders = {
          'Content-Type': file.type,
        };
        if (Number.isFinite(file.size)) {
          uploadHeaders['Content-Length'] = String(file.size);
        }

        const uploadResponse = await fetch(slot.upload_url, {
          method: 'PUT',
          headers: uploadHeaders,
          body: file.buffer,
        });

        if (!uploadResponse.ok) {
          let uploadData = null;
          try {
            uploadData = await uploadResponse.text();
          } catch {}
          const uploadHeadersObj = {};
          uploadResponse.headers?.forEach?.((value, key) => {
            uploadHeadersObj[key] = value;
          });
          return {
            ok: false,
            status: uploadResponse.status,
            error: `Failed to upload attachment "${file.name}"`,
            data: uploadData,
            headers: uploadHeadersObj,
          };
        }
      }

      const originalAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];
      const messageAttachments = attachmentSlots.map((slot, index) => {
        const original = originalAttachments[index] || {};
        const file = normalizedFiles[index];
        const attachment = {
          id: slot?.id != null ? String(slot.id) : file.id,
          filename: original.filename || original.fileName || file.name,
          uploaded_filename: slot.upload_filename,
        };
        const contentType = original.original_content_type || original.content_type || file.type;
        if (contentType) {
          attachment.original_content_type = contentType;
        }
        if (original.description || file.description) {
          attachment.description = original.description || file.description;
        }
        if (original.duration_secs != null || file.duration_secs != null) {
          attachment.duration_secs = original.duration_secs ?? file.duration_secs;
        }
        if (original.waveform != null || file.waveform != null) {
          attachment.waveform = original.waveform ?? file.waveform;
        }
        if (original.flags != null || file.flags != null) {
          attachment.flags = original.flags ?? file.flags;
        }
        return attachment;
      });

      payload.attachments = messageAttachments;
      if ('files' in payload) {
        delete payload.files;
      }

      const messageHeaders = { ...baseHeaders, 'Content-Type': 'application/json' };
      delete messageHeaders['Content-Length'];

      const messageResponse = await fetch(url, {
        method: upperMethod,
        headers: messageHeaders,
        body: JSON.stringify(payload),
      });

      return await formatResponse(messageResponse);
    } catch (error) {
      console.error('[discord-rest] Attachment pipeline failed', error);
      return {
        ok: false,
        status: 0,
        error: error?.message || 'Unknown attachment upload error',
      };
    }
  }

  if (hasAttachments) {
    try {
      const FormDataCtor = globalThis.FormData;
      if (!FormDataCtor) throw new Error('FormData is not available in this environment');
      const form = new FormDataCtor();

      const payload = normalizePayload(body);

      if (!Array.isArray(payload.attachments) || payload.attachments.length !== files.length) {
        payload.attachments = files.map((file, index) => ({
          id: file?.id != null ? String(file.id) : String(index),
          filename: file?.name || `file-${index}`,
          original_content_type: file?.type || 'application/octet-stream',
        }));
      } else {
        payload.attachments = payload.attachments.map((attachment, index) => ({
          ...attachment,
          id: attachment?.id != null ? String(attachment.id) : String(index),
          filename: attachment?.filename || attachment?.fileName || files[index]?.name || `file-${index}`,
          original_content_type: attachment?.original_content_type || attachment?.content_type || files[index]?.type || 'application/octet-stream',
        }));
      }

      form.append('payload_json', JSON.stringify(payload));

      files.forEach((file, index) => {
        if (!file) return;
        const fileName = file.name || `file-${index}`;
        const mimeType = file.type || 'application/octet-stream';
        const buffer = toBuffer(file.data);
        form.append(`files[${index}]`, buffer, { filename: fileName, contentType: mimeType });
      });

      init.body = form;
      if (init.headers['Content-Type']) {
        delete init.headers['Content-Type'];
      }
    } catch (error) {
      console.error('[discord-rest] Failed to prepare multipart request', error);
      return {
        ok: false,
        status: 0,
        error: error?.message || 'Failed to prepare attachment upload',
      };
    }
  } else if (body !== undefined && upperMethod !== 'GET' && upperMethod !== 'HEAD') {
    if (typeof body === 'string' || body instanceof Buffer) {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
    }
  }

  try {
    const response = await fetch(url, init);
    return await formatResponse(response);
  } catch (error) {
    console.error('[discord-rest] Request failed', error);
    return {
      ok: false,
      status: 0,
      error: error?.message || 'Unknown REST error',
    };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('token-found', (event, token) => {
  if (token) {
    var trimmed_token = token.split('.')[0]
    console.log('Renderer sent token:', trimmed_token+".xxxxxxx.xxxxxxx...");
    const token_fixed = token.replace(/^"(.*)"$/, "$1")
    save_token(token).then(() => {
      console.log("Token saved, loading main app...");
      if (mainWin) {
        mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
        handle_ws(token_fixed);
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

