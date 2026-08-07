// lib/crawl-eta.js — 爬取耗时预估与倒计时文案

const { DEFAULTS } = require('./anti-ban');

function formatDuration(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) return `${h}小时${m}分${String(s).padStart(2, '0')}秒`;
  if (m > 0) return `${m}分${String(s).padStart(2, '0')}秒`;
  return `${s}秒`;
}

function formatClock(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 根据站点数量、抓取模式与防封间隔估算耗时。
 * @param {{ siteCount: number, concurrency?: number, minIntervalMs?: number, jitterMs?: number, minPerSite?: number, pageStart?: number, pageEnd?: number, search?: string, searchPages?: number, todayOnly?: boolean }} opts
 */
function estimateCrawl(opts = {}) {
  const sites = Math.max(1, opts.siteCount || 1);
  const concurrency = Math.max(1, Math.min(opts.concurrency || 2, 6));
  const minIntervalMs = opts.minIntervalMs ?? DEFAULTS.minIntervalMs;
  const jitterMs = opts.jitterMs ?? DEFAULTS.jitterMs;
  const avgGapSec = (minIntervalMs + jitterMs / 2) / 1000;

  let expectedArticles;
  let listFetches;
  let modeLabel;

  if (opts.minPerSite > 0) {
    expectedArticles = sites * opts.minPerSite;
    listFetches = sites * Math.max(2, Math.ceil(opts.minPerSite / 18));
    modeLabel = `每站至少 ${opts.minPerSite} 条`;
  } else if (opts.search) {
    const pages = opts.searchPages || 1;
    expectedArticles = sites * pages * 15;
    listFetches = sites * pages;
    modeLabel = `搜索「${opts.search}」×${pages} 页`;
  } else if (opts.todayOnly) {
    expectedArticles = sites * 28;
    listFetches = sites * 2;
    modeLabel = '今日更新';
  } else {
    const pageStart = opts.pageStart || 1;
    const pageEnd = opts.pageEnd || pageStart;
    const pages = Math.max(1, pageEnd - pageStart + 1);
    // UI 全量：今日兜底 + 列表页
    expectedArticles = sites * (22 + pages * 18);
    listFetches = sites * (2 + pages);
    modeLabel = pages <= 1 ? '今日 + 首页列表' : `列表 ${pageStart}-${pageEnd} 页`;
  }

  // 列表多站可并行，按 concurrency 折算
  const listSec = (listFetches / Math.min(concurrency, sites)) * avgGapSec * 0.85;
  // 详情：同主机串行，全局 concurrency 并行不同站
  const detailSec = (expectedArticles / concurrency) * avgGapSec * 1.25;
  // 部分条目需解析播放地址
  const playerSec = expectedArticles * 0.35;
  const estimateSec = Math.max(30, Math.ceil(listSec + detailSec + playerSec));

  return {
    modeLabel,
    sites,
    expectedArticles,
    concurrency,
    avgGapSec: Number(avgGapSec.toFixed(2)),
    estimateSec,
    estimateMs: estimateSec * 1000,
    estimateLabel: formatDuration(estimateSec),
    rangeSec: [Math.round(estimateSec * 0.7), Math.round(estimateSec * 1.45)],
    rangeLabel: `${formatDuration(estimateSec * 0.7)} ~ ${formatDuration(estimateSec * 1.45)}`,
  };
}

/**
 * 控制台倒计时：返回 stop()；期间每秒刷新「预计剩余」。
 */
function startConsoleCountdown(estimateSec, prefix = '  后台同步中…') {
  const t0 = Date.now();
  const total = Math.max(1, estimateSec || 60);
  const paint = () => {
    const elapsed = Math.floor((Date.now() - t0) / 1000);
    const left = Math.max(0, total - elapsed);
    const over = elapsed > total;
    const msg = over
      ? `${prefix} 已运行 ${formatClock(elapsed)}（超出预估，仍在进行）`
      : `${prefix} 预计剩余 ${formatClock(left)} · 已用 ${formatClock(elapsed)}`;
    process.stdout.write(`\r${msg}          `);
  };
  paint();
  const timer = setInterval(paint, 1000);
  return () => {
    clearInterval(timer);
    process.stdout.write('\n');
  };
}

module.exports = {
  formatDuration,
  formatClock,
  estimateCrawl,
  startConsoleCountdown,
};
