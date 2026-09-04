/**
 * lib/win-console-utf8.js — Windows 控制台 UTF-8，避免中文乱码
 * 须在首次 console.log 中文之前 require。
 */

'use strict';

function enableWindowsConsoleUtf8() {
  if (process.platform !== 'win32') return;

  try {
    require('child_process').execSync('chcp 65001 >nul', {
      stdio: 'ignore',
      windowsHide: true,
      shell: true,
    });
  } catch (_) { /* ignore */ }

  try {
    require('child_process').execSync(
      'powershell -NoProfile -ExecutionPolicy Bypass -Command '
      + '"$d=Add-Type -PassThru -Name ConsoleCP2 -Namespace Win32 -MemberDefinition \''
      + '[DllImport(\\"kernel32.dll\\")] public static extern bool SetConsoleOutputCP(uint c);'
      + '[DllImport(\\"kernel32.dll\\")] public static extern bool SetConsoleCP(uint c);'
      + '\';'
      + '[void][Win32.ConsoleCP2]::SetConsoleOutputCP(65001);'
      + '[void][Win32.ConsoleCP2]::SetConsoleCP(65001);"',
      { stdio: 'ignore', shell: true, windowsHide: true },
    );
  } catch (_) { /* ignore */ }

  try {
    if (process.stdout && typeof process.stdout.setDefaultEncoding === 'function') {
      process.stdout.setDefaultEncoding('utf8');
    }
    if (process.stderr && typeof process.stderr.setDefaultEncoding === 'function') {
      process.stderr.setDefaultEncoding('utf8');
    }
  } catch (_) { /* ignore */ }
}

enableWindowsConsoleUtf8();

module.exports = { enableWindowsConsoleUtf8 };
