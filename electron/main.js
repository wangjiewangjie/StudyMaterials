// Electron 主进程：拉起本地 Express，再用窗口打开界面。
// 打包后数据目录指向 userData，无需系统安装 Node。

const { app, BrowserWindow, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let stopping = false;
let stopServerFn = async () => {};

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'app-icon.ico'),
    path.join(__dirname, '..', 'build', 'logo.ico'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img;
  }
  return undefined;
}

function preparePaths() {
  // 开发模式继续写项目里的 output/；安装包写到用户数据目录（可写）
  if (app.isPackaged) {
    process.env.STUDY_DATA_DIR = path.join(app.getPath('userData'), 'output');
    process.env.STUDY_APP_ROOT = app.getAppPath();
  }
}

async function createWindow() {
  preparePaths();

  // 必须在设置环境变量之后再加载 server，否则 crawler 会读错数据目录
  const { startServer, stopServer } = require('../server');
  stopServerFn = stopServer;

  let port;
  try {
    ({ port } = await startServer({
      backgroundCrawl: true,
      installSignalHandlers: false,
    }));
  } catch (err) {
    dialog.showErrorBox('启动失败', err && err.message ? err.message : String(err));
    app.quit();
    return;
  }

  const icon = resolveAppIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '学习资料',
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createWindow).catch((err) => {
  dialog.showErrorBox('启动失败', err && err.message ? err.message : String(err));
  app.quit();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (e) => {
  if (stopping) return;
  stopping = true;
  e.preventDefault();
  Promise.resolve(stopServerFn())
    .catch(() => {})
    .finally(() => app.exit(0));
});
