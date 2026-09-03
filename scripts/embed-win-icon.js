// Windows exe 嵌图标：用 resedit（纯 JS，与 electron-builder 写 asar integrity 同源），
// 避免 rcedit.exe「Unable to commit changes」，并在写完后等到文件可写再返回。

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const ResEdit = require('resedit');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries(label, fn, attempts = 12) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = Math.min(400 * i, 3000);
      console.warn(`[icon] ${label} 第 ${i}/${attempts} 次失败，${wait}ms 后重试:`, err && err.message ? err.message : err);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/** 等到 exe 可读写，避免杀毒锁导致后续 asar integrity 的 open/writeFile 失败 */
async function waitUntilReady(filePath, label = 'wait-ready', timeoutMs = 45000) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    attempt += 1;
    try {
      const fh = await fsPromises.open(filePath, 'r+');
      await fh.close();
      if (attempt > 1) console.log(`[icon] ${label}：文件已可写（第 ${attempt} 次）`);
      return;
    } catch (err) {
      if (attempt === 1 || attempt % 5 === 0) {
        console.warn(`[icon] ${label}：文件暂不可写，等待中…`, err && err.message ? err.message : err);
      }
      await sleep(500);
    }
  }
  throw new Error(`[icon] ${label} 超时：文件仍被锁定 ${filePath}`);
}

/**
 * @param {string} exePath
 * @param {string} iconPath
 * @param {string} label
 */
async function embedWinIcon(exePath, iconPath, label) {
  console.log(`[icon] resedit 写入 → ${label}`);
  await waitUntilReady(exePath, 'embed-before');

  const exeData = await withRetries('read-exe', () => fsPromises.readFile(exePath));
  const iconData = await fsPromises.readFile(iconPath);

  const exe = ResEdit.NtExecutable.from(exeData, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  if (!groups.length) {
    throw new Error('exe 中未找到 IconGroup 资源');
  }

  const iconFile = ResEdit.Data.IconFile.from(iconData);
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    groups[0].id,
    groups[0].lang,
    iconFile.icons.map((item) => item.data),
  );
  res.outputResource(exe);
  const outBuf = Buffer.from(exe.generate());

  // 同目录临时文件再替换，缩短目标路径被锁住的窗口
  const tmpPath = path.join(path.dirname(exePath), `_icon_new_${process.pid}.exe`);
  const bakPath = `${exePath}.icon-bak`;

  try {
    await withRetries('write-tmp', () => fsPromises.writeFile(tmpPath, outBuf));
    await withRetries('replace-exe', async () => {
      try {
        if (fs.existsSync(bakPath)) await fsPromises.unlink(bakPath);
      } catch (_) { /* ignore */ }
      await fsPromises.rename(exePath, bakPath);
      try {
        await fsPromises.rename(tmpPath, exePath);
      } catch (renameErr) {
        await fsPromises.copyFile(tmpPath, exePath);
        await fsPromises.unlink(tmpPath);
      }
      try {
        await fsPromises.unlink(bakPath);
      } catch (_) { /* ignore */ }
    });
  } finally {
    try {
      if (fs.existsSync(tmpPath)) await fsPromises.unlink(tmpPath);
    } catch (_) { /* ignore */ }
    try {
      if (fs.existsSync(bakPath)) await fsPromises.unlink(bakPath);
    } catch (_) { /* ignore */ }
  }

  await waitUntilReady(exePath, 'embed-after');
  console.log('[icon] 图标已写入');
  return true;
}

function resolveIcon(projectDir) {
  const candidates = [
    path.join(projectDir, 'build', 'app-icon.ico'),
    path.join(projectDir, 'build', 'logo.ico'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

module.exports = { embedWinIcon, resolveIcon, waitUntilReady };
