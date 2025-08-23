const { contextBridge, ipcRenderer } = require('electron');

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
  ipcRenderer.send('log', { level, text: String(text) });
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
class BreadAPIClass {
  static version = "1.0.0";

  static info(message) {
    logToMain('info', `[BreadAPI] [Info] ${message}`);
  }

  static alert(message) {
    logToMain('alert', `[BreadAPI] [Alert] ${message}`);
  }

  // per-renderer event bus
  static _em = createEmitter();
  static on(...a) { return this._em.on(...a); }
  static off(...a) { return this._em.off(...a); }
  static emit(...a) { return this._em.emit(...a); }
}

const BreadAPI = Object.freeze({
  version: BreadAPIClass.version,
  info: BreadAPIClass.info,
  alert: BreadAPIClass.alert,
  on: BreadAPIClass.on.bind(BreadAPIClass),
  off: BreadAPIClass.off.bind(BreadAPIClass),
  emit: BreadAPIClass.emit.bind(BreadAPIClass),
  ready,
});

contextBridge.exposeInMainWorld('BreadAPI', BreadAPI);

logToMain('info', "Preload running");