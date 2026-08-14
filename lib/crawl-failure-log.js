'use strict';
// lib/crawl-failure-log.js — 爬取失败记录（站点失效 / 整次爬取异常）
// 写入 output/crawl-failures.json，便于后续改站点配置或排查。

const fs = require('fs');
const path = require('path');

let FAILURE_LOG_PATH = path.join(process.cwd(), 'output', 'crawl-failures.json');

function setFailureLogPath(p) {
  FAILURE_LOG_PATH = p;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadExisting() {
  try {
    const raw = fs.readFileSync(FAILURE_LOG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.sessions) ? parsed.sessions : [];
  } catch (_) {
    return [];
  }
}

/**
 * 写入一次爬取会话的失败报告。
 * @param {{
 *   scope?: string,
 *   fatal?: string|null,
 *   elapsedMs?: number,
 *   sites?: Array<{site:string, name?:string, error:string, status?:number|null, phase?:string, url?:string}>,
 *   meta?: object
 * }} report
 */
function writeFailureReport(report) {
  const r = report || {};
  const sites = Array.isArray(r.sites) ? r.sites.filter(Boolean) : [];
  const fatal = r.fatal ? String(r.fatal) : null;
  if (!fatal && sites.length === 0) return null;

  const session = {
    ts: new Date().toISOString(),
    scope: r.scope || 'crawl',
    fatal,
    elapsedMs: r.elapsedMs != null ? r.elapsedMs : null,
    siteCount: sites.length,
    sites,
  };
  if (r.meta && typeof r.meta === 'object') session.meta = r.meta;

  const sessions = loadExisting();
  sessions.unshift(session);
  // 保留最近 50 次失败会话
  if (sessions.length > 50) sessions.length = 50;

  const payload = {
    version: 1,
    updatedAt: session.ts,
    count: sessions.length,
    sessions,
  };

  ensureDir(FAILURE_LOG_PATH);
  const tmp = FAILURE_LOG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, FAILURE_LOG_PATH);
  return FAILURE_LOG_PATH;
}

module.exports = {
  setFailureLogPath,
  writeFailureReport,
  getFailureLogPath: () => FAILURE_LOG_PATH,
};
