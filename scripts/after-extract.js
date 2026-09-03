// electron-builder afterExtract：在 asar integrity 写入之前给 electron.exe 嵌图标。
// 必须等 exe 可写再返回，否则 rename 成 StudyMaterials.exe 后 integrity 会 UNKNOWN open。

const path = require('path');
const fs = require('fs');
const { embedWinIcon, resolveIcon, waitUntilReady } = require('./embed-win-icon');

/** @type {import('electron-builder').AfterExtractContext} 兼容 */
exports.default = async function afterExtract(context) {
  if (context.electronPlatformName !== 'win32') return;

  const iconPath = resolveIcon(context.packager.projectDir);
  if (!iconPath) {
    console.warn('[afterExtract] 未找到图标文件');
    return;
  }

  const exePath = path.join(context.appOutDir, 'electron.exe');
  if (!fs.existsSync(exePath)) {
    console.warn('[afterExtract] 未找到 electron.exe:', exePath);
    return;
  }

  try {
    await embedWinIcon(exePath, iconPath, 'electron.exe');
    // 再确认一次，给 Defender 扫描收尾
    await waitUntilReady(exePath, 'afterExtract-final');
  } catch (err) {
    console.warn('[afterExtract] 写入图标失败（将继续打包）:', err && err.message ? err.message : err);
  }
};
