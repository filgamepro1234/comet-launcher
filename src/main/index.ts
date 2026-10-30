import { app, BrowserWindow, protocol, net, shell } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import { registerIpc } from './ipc';
import { ensureBaseDirs } from './paths';
import { resolveMediaUrl } from './screenshots';
import { launch as launchInstanceById } from './instances';

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    title: 'Comet Launcher',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await ensureBaseDirs();
  protocol.handle('media', (request) => {
    const file = resolveMediaUrl(request.url);
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  registerIpc();
  createWindow();
  // desktop shortcuts pass --launch=<instanceId>
  const launchArg = process.argv.find((a) => a.startsWith('--launch='));
  if (launchArg) {
    const id = launchArg.slice('--launch='.length);
    void launchInstanceById(id).catch(() => {});
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
