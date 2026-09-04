/**
 * electron/main.js — 桌面壳主进程
 *
 * 职责：单实例 → 路径注入 → 闪屏 + 启服 → 窗口（状态记忆）→ 托盘关窗隐藏 → 退出确认同步中。
 * 安全：无 nodeIntegration；contextIsolation + sandbox；外链系统浏览器。
 */

require('../lib/win-console-utf8');

const {
  app, BrowserWindow, shell, dialog, nativeImage, Tray, Menu,
} = require('electron');
const path = require('path');
const fs = require('fs');

// 须在 ready 前：避免 GPU/磁盘缓存 Access Denied，以及 Chromium 中文错误在错误代码页下乱码
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('lang', 'en-US');

let mainWindow = null;
let tray = null;
let stopping = false;
/** 为 true 时允许真正退出（托盘「退出」或确认后） */
let allowQuit = false;
let stopServerFn = async () => {};

const DEFAULT_BOUNDS = { width: 1280, height: 840, x: undefined, y: undefined };
const MIN_WIDTH = 960;
const MIN_HEIGHT = 640;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_BOUNDS };
    return {
      width: Math.max(MIN_WIDTH, Number(raw.width) || DEFAULT_BOUNDS.width),
      height: Math.max(MIN_HEIGHT, Number(raw.height) || DEFAULT_BOUNDS.height),
      x: Number.isFinite(raw.x) ? raw.x : undefined,
      y: Number.isFinite(raw.y) ? raw.y : undefined,
      isMaximized: !!raw.isMaximized,
    };
  } catch (_) {
    return { ...DEFAULT_BOUNDS };
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const isMaximized = mainWindow.isMaximized();
    const bounds = isMaximized
      ? (mainWindow.__normalBounds || mainWindow.getBounds())
      : mainWindow.getBounds();
    const data = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
    };
    fs.mkdirSync(path.dirname(windowStatePath()), { recursive: true });
    fs.writeFileSync(windowStatePath(), JSON.stringify(data), 'utf8');
  } catch (e) {
    console.warn('[window-state] 保存失败:', e.message);
  }
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

function resolveTrayIcon() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'build', 'app-icon.ico'),
    path.join(__dirname, '..', 'build', 'logo.ico'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
  }
  return nativeImage.createEmpty();
}

function preparePaths() {
  if (app.isPackaged) {
    process.env.STUDY_DATA_DIR = path.join(app.getPath('userData'), 'output');
    process.env.STUDY_APP_ROOT = app.getAppPath();
  }
}

function splashDataUrl() {
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>学习资料</title>
<style>
  html,body{margin:0;height:100%;background:#050505;color:#fff;
    font-family:Segoe UI,system-ui,sans-serif;
    display:flex;align-items:center;justify-content:center;}
  .box{text-align:center;padding:24px;}
  .brand{display:inline-flex;align-items:center;gap:6px;margin-bottom:20px;}
  .badge{background:#FF9900;color:#000;font-weight:900;font-style:italic;
    padding:4px 10px;border-radius:8px;letter-spacing:-0.02em;}
  .hub{font-weight:900;font-style:italic;letter-spacing:-0.02em;}
  .msg{font-size:13px;color:#999;margin:0 0 16px;}
  .bar{width:180px;height:3px;margin:0 auto;background:#1a1a1a;border-radius:2px;overflow:hidden;}
  .bar>i{display:block;height:100%;width:40%;background:#FF9900;
    animation:slide 1.1s ease-in-out infinite;}
  @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
</style></head><body>
  <div class="box">
    <div class="brand"><span class="badge">STUDY</span><span class="hub">HUB</span></div>
    <p class="msg">正在启动本地服务…</p>
    <div class="bar"><i></i></div>
  </div>
</body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function isRendererSyncBusy() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    return !!(await mainWindow.webContents.executeJavaScript(
      '!!(window.__STUDY_SYNC_BUSY__)',
      true,
    ));
  } catch (_) {
    return false;
  }
}

/**
 * 真正退出：若同步中则原生确认。
 * 关窗本身只隐藏到托盘，不走这里。
 */
let quitDialogOpen = false;
async function requestQuit() {
  if (stopping || allowQuit) return;
  if (quitDialogOpen) return;

  const busy = await isRendererSyncBusy();
  if (busy) {
    quitDialogOpen = true;
    try {
      const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
      const { response } = await dialog.showMessageBox(parent, {
        type: 'warning',
        buttons: ['仍要退出', '取消'],
        defaultId: 1,
        cancelId: 1,
        title: '同步进行中',
        message: '同步尚未完成，退出会中断任务。',
        detail: '全量同步或关键词同步进行中。确定要退出吗？',
        noLink: true,
      });
      if (response !== 0) {
        showMainWindow();
        return;
      }
    } finally {
      quitDialogOpen = false;
    }
  }

  allowQuit = true;
  saveWindowState();
  app.quit();
}

function createTray() {
  if (tray) return;
  const icon = resolveTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('学习资料');
  const menu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => { requestQuit(); },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => showMainWindow());
}

function bindWindowStateEvents(win) {
  // 拖拽/缩放期间 resize/move 高频触发，防抖 300ms 避免每秒数十次写盘；
  // 关窗/退出链路仍直接调用 saveWindowState，保证最终状态落盘
  let persistTimer = null;
  const persist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      saveWindowState();
    }, 300);
  };
  win.on('resize', () => {
    if (!win.isMaximized()) win.__normalBounds = win.getBounds();
    persist();
  });
  win.on('move', () => {
    if (!win.isMaximized()) win.__normalBounds = win.getBounds();
    persist();
  });
  win.on('maximize', persist);
  win.on('unmaximize', () => {
    win.__normalBounds = win.getBounds();
    persist();
  });
}

async function createWindow() {
  preparePaths();

  const state = loadWindowState();
  const icon = resolveAppIcon();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    ...(Number.isFinite(state.x) && Number.isFinite(state.y)
      ? { x: state.x, y: state.y }
      : {}),
    show: false,
    title: '学习资料',
    autoHideMenuBar: true,
    backgroundColor: '#050505',
    ...(icon ? { icon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.__normalBounds = mainWindow.getBounds();
  bindWindowStateEvents(mainWindow);
  createTray();

  // 先闪屏，避免等 Express 时长时间空白
  await mainWindow.loadURL(splashDataUrl());
  if (state.isMaximized) mainWindow.maximize();
  mainWindow.show();

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
    allowQuit = true;
    app.quit();
    return;
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 页面渲染第三方站点内容，外链仅放行 http/https，
    // 防止 file:、smb: 等协议经 shell 唤起系统组件
    try {
      const { protocol } = new URL(url);
      if (protocol === 'http:' || protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch (_) { /* 非法 URL 直接忽略 */ }
    return { action: 'deny' };
  });

  // 关窗 → 隐藏到托盘（同步可继续；真正退出走托盘「退出」）
  mainWindow.on('close', (e) => {
    if (allowQuit || stopping) return;
    e.preventDefault();
    saveWindowState();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createWindow).catch((err) => {
  dialog.showErrorBox('启动失败', err && err.message ? err.message : String(err));
  allowQuit = true;
  app.quit();
});

// 托盘驻留：窗口全部关闭/隐藏后不退出进程
app.on('window-all-closed', () => {
  // no-op（Windows/Linux 靠托盘保活；真正退出走 requestQuit）
});

app.on('before-quit', (e) => {
  if (stopping) return;
  if (!allowQuit) {
    // 系统级退出（如任务栏右键结束以外的 quit）：先走同步确认
    e.preventDefault();
    requestQuit();
    return;
  }
  stopping = true;
  e.preventDefault();
  saveWindowState();
  if (tray) {
    try { tray.destroy(); } catch (_) {}
    tray = null;
  }
  Promise.resolve(stopServerFn())
    .catch(() => {})
    .finally(() => app.exit(0));
});
