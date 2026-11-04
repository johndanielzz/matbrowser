'use strict';

const http = require('http');
const path = require('path');
const { app, BrowserWindow, session } = require('electron');
const { handleMain, handleContent } = require('../server');
const blocklist = require('../blocklist');

let shellServer;
let contentServer;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise(resolve => server ? server.close(() => resolve()) : resolve());
}

function cleanUrl(raw) {
  try {
    const url = new URL(raw);
    let changed = false;
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || blocklist.TRACK_PARAMS.includes(key.toLowerCase())) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? url.href : '';
  } catch (_) {
    return '';
  }
}

function configureBrowserSession() {
  const browseSession = session.fromPartition('persist:mat-browse');
  browseSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  browseSession.setPermissionCheckHandler(() => false);
  browseSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    try {
      const url = new URL(details.url);
      if (/^https?:$/.test(url.protocol) && blocklist.isBlocked(url)) return callback({ cancel: true });
      // Never rewrite POST/uploads/subresources. Navigation URLs are safe to
      // clean and this avoids breaking forms, videos, and authenticated sites.
      if ((details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') && details.method === 'GET') {
        const redirectURL = cleanUrl(details.url);
        if (redirectURL) return callback({ redirectURL });
      }
    } catch (_) { /* allow malformed/non-web requests to be handled by Chromium */ }
    callback({});
  });
  return browseSession;
}

async function createWindow() {
  const port = await listen(shellServer);
  await listen(contentServer);
  configureBrowserSession();

  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 420,
    minHeight: 620,
    backgroundColor: '#0D1015',
    autoHideMenuBar: true,
    title: 'MAT Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: true
    }
  });

  // Links that request a new window remain in the existing native browser tab.
  win.webContents.on('did-attach-webview', (_event, guest) => {
    guest.setWindowOpenHandler(details => {
      if (/^https?:/i.test(details.url)) guest.loadURL(details.url).catch(() => {});
      return { action: 'deny' };
    });
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(async () => {
  shellServer = http.createServer(handleMain);
  contentServer = http.createServer(handleContent);
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error => {
  // This is intentionally visible in the terminal so a packaging failure is
  // actionable instead of silently producing a blank desktop window.
  console.error('MAT Desktop failed to start:', error);
  app.quit();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', async () => { await closeServer(shellServer); await closeServer(contentServer); });
