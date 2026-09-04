/**
 * scripts/run-electron.js — 先把当前控制台切到 UTF-8，再启动 Electron
 * （进程内 chcp 往往改不了父级 CMD，所以必须在 spawn 之前执行）
 */

'use strict';

const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function forceConsoleUtf8() {
  if (process.platform !== 'win32') return;
  try {
    execSync('chcp 65001', { stdio: 'inherit', shell: true });
  } catch (_) { /* ignore */ }

  // 直接调 Win32 API，比仅 chcp 更可靠（含 Cursor / VS Code 终端）
  try {
    execSync(
      'powershell -NoProfile -ExecutionPolicy Bypass -Command '
      + '"$d=Add-Type -PassThru -Name ConsoleCP -Namespace Win32 -MemberDefinition \''
      + '[DllImport(\\"kernel32.dll\\")] public static extern bool SetConsoleOutputCP(uint c);'
      + '[DllImport(\\"kernel32.dll\\")] public static extern bool SetConsoleCP(uint c);'
      + '\';'
      + '[void][Win32.ConsoleCP]::SetConsoleOutputCP(65001);'
      + '[void][Win32.ConsoleCP]::SetConsoleCP(65001);"',
      { stdio: 'ignore', shell: true, windowsHide: true },
    );
  } catch (_) { /* ignore */ }

  try {
    if (process.stdout.setDefaultEncoding) process.stdout.setDefaultEncoding('utf8');
    if (process.stderr.setDefaultEncoding) process.stderr.setDefaultEncoding('utf8');
  } catch (_) { /* ignore */ }
}

forceConsoleUtf8();

let electronBin;
try {
  electronBin = require('electron');
} catch (e) {
  console.error('未找到 electron，请先 npm install');
  process.exit(1);
}

const child = spawn(electronBin, ['.'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    // 减少 Chromium 中文系统错误在 GBK 终端下的二次乱码
    ELECTRON_FORCE_WINDOW_MENU_ICONS: '1',
  },
  windowsHide: false,
});

child.on('error', (err) => {
  console.error('启动 Electron 失败:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code == null ? 0 : code);
});
