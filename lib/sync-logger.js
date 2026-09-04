'use strict';
/**
 * lib/sync-logger.js — 结构化同步日志
 *
 * - 当前会话写入 sync-log.json（内存缓冲 + 周期原子落盘）
 * - beginSession()：把上一会话归档到 sync-logs/，再开启新会话
 * - 归档按 retainDays（默认 7）清理过期文件
 * - 退出前 flush，尽量不丢最后一批
 */

const fs = require('fs');
const path = require('path');

function createSyncLogger(opts) {
  opts = opts || {};
  const logPath = path.resolve(opts.path || path.join(__dirname, '..', 'output', 'sync-log.json'));
  const dir = path.dirname(logPath);
  const archiveDir = opts.archiveDir
    ? path.resolve(opts.archiveDir)
    : path.join(dir, 'sync-logs');
  const maxEntries = opts.maxEntries || 10000;
  const flushIntervalMs = opts.flushIntervalMs || 1000;
  const retainDays = Math.max(1, opts.retainDays || 7);

  let entries = [];
  let dirty = false;
  let timer = null;
  let clearedAt = null;
  let exitInstalled = false;

  function touch() {
    if (!clearedAt) clearedAt = new Date().toISOString();
  }

  function ensureDir(p) {
    try {
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    } catch (_) { /* ignore */ }
  }

  function buildPayload() {
    const now = new Date().toISOString();
    return {
      version: 1,
      generatedAt: clearedAt || now,
      updatedAt: now,
      count: entries.length,
      entries,
    };
  }

  function safeStamp(iso) {
    return String(iso || new Date().toISOString())
      .replace(/[:.]/g, '-')
      .replace(/Z$/i, '')
      .slice(0, 19);
  }

  /** 删除超过 retainDays 的归档 */
  function pruneArchives() {
    ensureDir(archiveDir);
    const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    try {
      for (const name of fs.readdirSync(archiveDir)) {
        if (!name.endsWith('.json')) continue;
        const full = path.join(archiveDir, name);
        try {
          const st = fs.statSync(full);
          if (st.mtimeMs < cutoff) {
            fs.unlinkSync(full);
            removed += 1;
          }
        } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
    return removed;
  }

  /** 将现有 sync-log.json 归档（若有条目） */
  function archiveCurrentFile() {
    try {
      if (!fs.existsSync(logPath)) return null;
      const raw = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      const list = Array.isArray(raw.entries) ? raw.entries : [];
      if (!list.length) return null;
      ensureDir(archiveDir);
      const stamp = safeStamp(raw.generatedAt || raw.updatedAt);
      const dest = path.join(archiveDir, `session-${stamp}.json`);
      // 避免同秒冲突
      const finalDest = fs.existsSync(dest)
        ? path.join(archiveDir, `session-${stamp}-${Date.now()}.json`)
        : dest;
      fs.writeFileSync(finalDest, JSON.stringify(raw, null, 2), 'utf8');
      return finalDest;
    } catch (e) {
      console.warn('[同步日志] 归档失败:', e.message);
      return null;
    }
  }

  /** 清空当前会话文件（不归档） */
  function clear() {
    ensureDir(dir);
    entries = [];
    dirty = false;
    clearedAt = new Date().toISOString();
    try {
      fs.writeFileSync(logPath, JSON.stringify(buildPayload(), null, 2), 'utf8');
    } catch (e) {
      console.warn('[同步日志] 清空写入失败:', e.message);
    }
  }

  /**
   * 启动新会话：归档上一份日志 → 清理过期归档 → 清空当前文件。
   * 替代旧的「重启直接 clear 丢历史」。
   */
  function beginSession() {
    archiveCurrentFile();
    pruneArchives();
    clear();
    return {
      archiveDir,
      retainDays,
    };
  }

  function scheduleFlush() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, flushIntervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function flush() {
    touch();
    const tmp = logPath + '.tmp';
    try {
      ensureDir(dir);
      fs.writeFileSync(tmp, JSON.stringify(buildPayload(), null, 2), 'utf8');
      fs.renameSync(tmp, logPath);
      dirty = false;
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
      console.warn('[同步日志] 写入失败:', e.message);
    }
  }

  function add(level, scope, message, meta) {
    touch();
    const entry = {
      ts: new Date().toISOString(),
      level: level || 'info',
      scope: scope || 'system',
      message: typeof message === 'string' ? message : String(message == null ? '' : message),
    };
    if (meta !== undefined && meta !== null) entry.meta = meta;
    entries.push(entry);
    if (entries.length > maxEntries) {
      entries.splice(0, entries.length - maxEntries);
    }
    dirty = true;
    scheduleFlush();
  }

  function installExitFlush() {
    if (exitInstalled) return;
    exitInstalled = true;
    const onExit = () => { try { flush(); } catch (_) {} };
    process.once('beforeExit', onExit);
    process.once('SIGINT', () => { onExit(); process.exit(130); });
    process.once('SIGTERM', () => { onExit(); process.exit(143); });
  }

  /** 列出近期归档（新→旧），供 UI / 排查 */
  function listArchives(limit = 30) {
    ensureDir(archiveDir);
    const rows = [];
    try {
      for (const name of fs.readdirSync(archiveDir)) {
        if (!name.endsWith('.json')) continue;
        const full = path.join(archiveDir, name);
        try {
          const st = fs.statSync(full);
          let count = 0;
          let generatedAt = null;
          try {
            const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
            count = Array.isArray(raw.entries) ? raw.entries.length : (raw.count || 0);
            generatedAt = raw.generatedAt || null;
          } catch (_) { /* ignore */ }
          rows.push({
            name,
            path: full,
            mtime: st.mtimeMs,
            size: st.size,
            count,
            generatedAt,
          });
        } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
    rows.sort((a, b) => b.mtime - a.mtime);
    return rows.slice(0, Math.max(1, limit));
  }

  return {
    log: add,
    info: (scope, message, meta) => add('info', scope, message, meta),
    warn: (scope, message, meta) => add('warn', scope, message, meta),
    error: (scope, message, meta) => add('error', scope, message, meta),
    clear,
    beginSession,
    pruneArchives,
    listArchives,
    flush,
    installExitFlush,
    getEntries: () => entries.slice(),
    getPath: () => logPath,
    getArchiveDir: () => archiveDir,
    getRetainDays: () => retainDays,
  };
}

module.exports = { createSyncLogger };
