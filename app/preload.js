const { contextBridge, ipcRenderer } = require('electron');

async function getPlugins() {
  return await ipcRenderer.invoke('plugins:list');
}

function fetch_token() {
    const iframe = document.createElement('iframe');
            
    iframe.onload = () => {
        try {
            const token = iframe.contentWindow.localStorage.getItem('token');
            ipcRenderer.send('token-found', token);
        }
        catch (err) {}
        finally {
            iframe.remove();
        }
    };

    document.body.appendChild(iframe);
}

window.addEventListener('DOMContentLoaded', () => {

    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        if (window.location.hostname === 'discord.com') {
            fetch_token();
        }
    }

    if (window.location.protocol === 'file:') {}
});
let lastUrl = window.location.href;

setInterval(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
            if (window.location.hostname === 'discord.com') {
                fetch_token();
            }
        }
    }
}, 50);

function logToMain(level, text) {
  ipcRenderer.send('log', text);
}
const consoleLog = console.log.bind(console);
console.log = (...args) => {
  consoleLog(...args);
  logToMain('info', args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
};

function createEmitter() {
  const map = new Map();
  return {
    on(ev, fn) { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(fn); },
    off(ev, fn) { map.get(ev)?.delete(fn); },
    emit(ev, data) { map.get(ev)?.forEach(fn => fn(data)); },
  };
}

let _resolveReady;
const ready = new Promise(r => (_resolveReady = r));
queueMicrotask(() => _resolveReady());

// ------- BreadAPI class & facade -------
const { EventEmitter } = require('events');
function createEmitter() {
  const ee = new EventEmitter();
  return {
    on(event, fn) {            // Persistent subscription
      ee.on(event, fn);
      return () => ee.off(event, fn); // Return an explicit unsubscribe function
    },
    off(event, fn) { ee.off(event, fn); },
    emit(event, ...args) { ee.emit(event, ...args); },
  };
}

var plugins = [];

getPlugins().then(list => {
  plugins.push(...list);

  class BreadAPIClass {
    static version = "1.0.0";
    static plugins = plugins;

    static info(message) { logToMain('info', `[BreadAPI] [Info] ${message}`);}

    static alert(message) { logToMain('alert', `[BreadAPI] [Alert] ${message}`); }

    // per-renderer event bus
    static _em = createEmitter();
    static on(...a) { return this._em.on(...a); }
    static off(...a) { return this._em.off(...a); }
    static emit(...a) { return this._em.emit(...a); }

    // --- gateway sub-API ---
    static _gatewayEm = createEmitter();
    static gateway = {
      // ✅ Persistent: fires for every message until you call the returned unsubscribe
      on_message(fn) {
        return BreadAPIClass._gatewayEm.on('message', fn);
      },
      off_message(fn) {
        BreadAPIClass._gatewayEm.off('message', fn);
      },
      // Optional one-time helper (does not affect on_message behavior)
      once_message(fn) {
        const off = BreadAPIClass._gatewayEm.on('message', function handler(p) {
          off(); fn(p);
        });
        return off;
      },
    };
  }

  // bridge IPC -> gateway emitter
  ipcRenderer.on('discord-gateway-message', (_event, payload) => {
    BreadAPIClass._gatewayEm.emit('message', payload);
  });

  const BreadAPI = Object.freeze({
    version: BreadAPIClass.version,
    info: BreadAPIClass.info,
    alert: BreadAPIClass.alert,
    on: BreadAPIClass.on.bind(BreadAPIClass),
    off: BreadAPIClass.off.bind(BreadAPIClass),
    emit: BreadAPIClass.emit.bind(BreadAPIClass),
    ready,
    gateway: Object.freeze({
      on_message: BreadAPIClass.gateway.on_message,
      off_message: BreadAPIClass.gateway.off_message,
      once_message: BreadAPIClass.gateway.once_message,
    }),
    plugins: BreadAPIClass.plugins,
  });

  contextBridge.exposeInMainWorld('BreadAPI', BreadAPI);
});