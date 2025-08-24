const keytar = require('keytar');
const os = require('os');

let SERVICE = 'App';
let ACCOUNT = `${os.userInfo().username || 'user'}:auth_token`;

/**
 * Call once from main after app.whenReady() when app name is available,
 * so tokens are grouped under your app’s name in the OS keychain.
 */
function initTokenStore(appName) {
  if (appName) SERVICE = appName;
}

async function save_token(token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Token must be a non-empty string.');
  }
  await keytar.setPassword(SERVICE, ACCOUNT, token);
  return true;
}

async function load_token() {
  const token = await keytar.getPassword(SERVICE, ACCOUNT);
  if (!token) return null;
  return token.replace(/^"(.*)"$/, "$1");
}

async function delete_token() {
  await keytar.deletePassword(SERVICE, ACCOUNT);
  return true;
}

module.exports = {
  initTokenStore,
  save_token,
  load_token,
  delete_token,
};