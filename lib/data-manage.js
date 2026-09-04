/**
 * lib/data-manage.js — 数据目录信息、打开文件夹、媒体缓存统计/清理、整库备份
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DATA_DIR, APP_ROOT, ensureDataDir } = require('./paths');

const BACKUP_VERSION = 1;

function safeStatSize(p) {
  try {
    return fs.statSync(p).size;
  } catch (_) {
    return 0;
  }
}

/** 递归目录占用（字节） */
function dirSizeBytes(dir) {
  let total = 0;
  let files = 0;
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        total += safeStatSize(full);
        files += 1;
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  return { bytes: total, files };
}

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

/**
 * @param {{ mediaCacheDir: string, indexPath: string, favPath: string, sitesPath: string, watchPath: string, fixedTagsPath: string }} paths
 */
function getDataInfo(paths) {
  ensureDataDir();
  const cache = dirSizeBytes(paths.mediaCacheDir);
  const dataRoot = dirSizeBytes(DATA_DIR);
  return {
    ok: true,
    dataDir: DATA_DIR,
    appRoot: APP_ROOT,
    indexCount: Array.isArray(readJsonSafe(paths.indexPath, []))
      ? readJsonSafe(paths.indexPath, []).length
      : 0,
    favoritesCount: Array.isArray(readJsonSafe(paths.favPath, []))
      ? readJsonSafe(paths.favPath, []).length
      : 0,
    sitesCount: Array.isArray(readJsonSafe(paths.sitesPath, []))
      ? readJsonSafe(paths.sitesPath, []).length
      : 0,
    cacheBytes: cache.bytes,
    cacheFiles: cache.files,
    cacheLabel: formatBytes(cache.bytes),
    dataBytes: dataRoot.bytes,
    dataLabel: formatBytes(dataRoot.bytes),
  };
}

/** 用系统文件管理器打开数据目录；spawn 数组传参，避免 shell 拼接 */
function openDataDir() {
  ensureDataDir();
  const target = DATA_DIR;
  return new Promise((resolve, reject) => {
    const child = process.platform === 'win32'
      ? spawn('explorer', [target], { stdio: 'ignore' })
      : spawn(
        process.platform === 'darwin' ? 'open' : 'xdg-open',
        [target],
        { stdio: 'ignore' },
      );
    child.once('error', reject);
    child.once('exit', (code) => {
      // Windows explorer 打开成功也可能返回非 0 退出码
      if (code !== 0 && process.platform !== 'win32') {
        reject(new Error(`打开目录失败（退出码 ${code}）`));
        return;
      }
      resolve({ ok: true, path: target });
    });
  });
}

/** 清空 media-cache 目录内容，保留目录本身 */
function clearMediaCache(mediaCacheDir) {
  let removed = 0;
  let freed = 0;
  if (!fs.existsSync(mediaCacheDir)) {
    return { ok: true, removed: 0, freedBytes: 0, freedLabel: '0 B' };
  }
  const entries = fs.readdirSync(mediaCacheDir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(mediaCacheDir, ent.name);
    try {
      if (ent.isDirectory()) {
        const before = dirSizeBytes(full);
        fs.rmSync(full, { recursive: true, force: true });
        removed += before.files;
        freed += before.bytes;
      } else {
        freed += safeStatSize(full);
        fs.unlinkSync(full);
        removed += 1;
      }
    } catch (e) {
      console.warn('[媒体缓存] 删除失败:', full, e.message);
    }
  }
  return {
    ok: true,
    removed,
    freedBytes: freed,
    freedLabel: formatBytes(freed),
  };
}

/**
 * 组装整库备份对象（调用方传入已加载的数据，避免循环依赖）
 * @param {{ index, favorites, sites, watchProgress, fixedTags? }} payload
 */
function buildBackup(payload) {
  return {
    version: BACKUP_VERSION,
    app: 'StudyMaterials',
    exportedAt: new Date().toISOString(),
    index: Array.isArray(payload.index) ? payload.index : [],
    favorites: Array.isArray(payload.favorites) ? payload.favorites : [],
    sites: Array.isArray(payload.sites) ? payload.sites : [],
    watchProgress: payload.watchProgress && typeof payload.watchProgress === 'object'
      ? payload.watchProgress
      : {},
    fixedTags: payload.fixedTags ?? null,
  };
}

function validateBackup(doc) {
  if (!doc || typeof doc !== 'object') return '备份内容无效';
  if (doc.version !== BACKUP_VERSION && doc.version !== 1) return `不支持的备份版本: ${doc.version}`;
  if (!Array.isArray(doc.index)) return '备份缺少 index 数组';
  if (!Array.isArray(doc.favorites)) return '备份缺少 favorites 数组';
  if (!Array.isArray(doc.sites)) return '备份缺少 sites 数组';
  return null;
}

module.exports = {
  BACKUP_VERSION,
  formatBytes,
  dirSizeBytes,
  getDataInfo,
  openDataDir,
  clearMediaCache,
  buildBackup,
  validateBackup,
  readJsonSafe,
};
