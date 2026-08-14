'use strict';
// lib/sync-logger.js
// 结构化同步日志：以 JSON 形式持续、可靠地写入本地文件。
//
// 设计要点：
//  1. 结构存储 —— 每条日志是一个对象 { ts, level, scope, message, meta? }，
//     整体包成 { version, generatedAt, updatedAt, count, entries[] } 写入 JSON 文件。
//  2. 持续 & 可靠 —— 日志先进入内存缓冲，再周期性（默认 1s）或关键事件后
//     原子落盘（先写 .tmp 再 rename），避免每条日志都重写整文件，也保证崩溃时
//     不会写出半截文件。
//  3. 重启清空 —— 进程启动时调用 clear() 将文件重置为初始空结构，旧日志不再保留。
//  4. 退出兜底 —— 注册 beforeExit / SIGINT / SIGTERM，退出前同步刷盘，
//     尽量保证最后一批日志落盘。

const fs = require('fs');
const path = require('path');

function createSyncLogger(opts) {
  opts = opts || {};
  const logPath = path.resolve(opts.path || path.join(__dirname, '..', 'output', 'sync-log.json'));
  const dir = path.dirname(logPath);
  const maxEntries = opts.maxEntries || 10000;
  const flushIntervalMs = opts.flushIntervalMs || 1000;

  let entries = [];
  let dirty = false;       // 内存有未落盘内容
  let timer = null;        // 周期性刷盘定时器（unref，不阻止进程退出）
  let clearedAt = null;    // 本次会话起始时间（用于 generatedAt）
  let exitInstalled = false;

  function touch() {
    if (!clearedAt) clearedAt = new Date().toISOString();
  }

  function ensureDir() {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (_) { /* 忽略，后续写入会再次报错并告警 */ }
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

  // 启动/重启：清空旧日志，写入空结构文件
  function clear() {
    ensureDir();
    entries = [];
    dirty = false;
    clearedAt = new Date().toISOString();
    try {
      fs.writeFileSync(logPath, JSON.stringify(buildPayload(), null, 2), 'utf8');
    } catch (e) {
      console.warn('[同步日志] 清空写入失败:', e.message);
    }
  }

  function scheduleFlush() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, flushIntervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  // 原子落盘（同步写，可在事件回调或退出处理器中安全调用）
  function flush() {
    touch();
    const tmp = logPath + '.tmp';
    try {
      ensureDir();
      fs.writeFileSync(tmp, JSON.stringify(buildPayload(), null, 2), 'utf8');
      fs.renameSync(tmp, logPath); // 原子替换，避免半截文件
      dirty = false;
    } catch (e) {
      // 写失败保留 dirty，下一轮重试；同时清理临时文件
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
      // 超出上限保留最新的 maxEntries 条
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

  return {
    log: add,
    info: (scope, message, meta) => add('info', scope, message, meta),
    warn: (scope, message, meta) => add('warn', scope, message, meta),
    error: (scope, message, meta) => add('error', scope, message, meta),
    clear,
    flush,
    installExitFlush,
    getEntries: () => entries.slice(),
    getPath: () => logPath,
  };
}

module.exports = { createSyncLogger };
