// lib/permanent-resolve.js — 站点「永久地址」自动解析与切换
//
// 源站域名经常更换，永久地址页（如 91吃瓜的 https://91cg.asia/）会以 JS 动态生成本次可用线路，
// 原生 axios 拿不到（需真实渲染）。本模块用无头浏览器（复用系统 Chrome/Edge）渲染永久页，
// 解析出「线路一」（可回退其余线路）对应的域名，校验可达后返回可用地址，供抓取失效时切换。
//
// 全流程：渲染永久页 → 解析线路域名 → 拼 https URL → 校验可达 → 返回首个可用地址。

const fs = require('fs');
const https = require('https');

// 系统浏览器候选路径（Windows）。可用 process.env.PUPPETEER_EXECUTABLE_PATH 显式指定。
const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH || null,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
].filter(Boolean);

// 浏览器路径只扫一次磁盘并缓存（候选顺序固定，运行时不会变）。
let cachedBrowserPath;
function detectBrowserPath() {
  if (cachedBrowserPath !== undefined) return cachedBrowserPath;
  cachedBrowserPath = CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || null;
  return cachedBrowserPath;
}

// 解析「线路一」及后续线路。兼容多种发布页排版：
//   线路一\nhost.tld
//   线路一\nhttps://host.tld
//   线路一\n推荐访问\nhost.tld   （中间夹状态文案）
const LINE_RE =
  /线路(一|二|三|四|五|六|七|八|九|十|[0-9]+)[^\n]*\n(?:[^\na-z0-9.]*\n)*\s*(?:https?:\/\/)?([a-z0-9][a-z0-9._-]*\.[a-z0-9.-]+)/gi;

// 中文线路名 → 排序号（用于保证「线路一」优先）
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function parseLines(text) {
  if (!text) return [];
  const lines = [];
  let m;
  LINE_RE.lastIndex = 0;
  while ((m = LINE_RE.exec(text)) !== null) {
    const label = String(m[1]).trim();
    // 去掉路径/尾部斜杠/标点，只保留主机名
    const host = (m[2] || '').trim().toLowerCase().replace(/[/:].*$/, '').replace(/\.+$/, '');
    if (!host || !host.includes('.') || lines.some((l) => l.host === host)) continue; // 去重同名线路
    const order = /^\d+$/.test(label) ? parseInt(label, 10) : (CN_NUM[label] || 99);
    lines.push({ label: `线路${label}`, order, host, url: `https://${host}/` });
  }
  lines.sort((a, b) => a.order - b.order);
  return lines;
}

// 无头浏览器实例：进程内复用；启动失败会把缓存清掉，便于下次调用重试。
let browserPromise = null;
let browser = null;

function isBrowserAlive(b) {
  return !!(b && b.connected !== false);
}

async function getBrowser() {
  if (isBrowserAlive(browser)) return browser;
  if (browserPromise) return browserPromise;

  // puppeteer-core 为 ESM 包：Electron 内置 Node 不支持 require(ESM)，必须用动态 import()
  const mod = await import('puppeteer-core');
  const puppeteer = mod.default || mod;
  const exe = detectBrowserPath();
  if (!exe) throw new Error('未找到系统 Chrome/Edge（可设 PUPPETEER_EXECUTABLE_PATH）');

  browserPromise = puppeteer
    .launch({
      headless: true,
      executablePath: exe,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    .then((b) => {
      browser = b;
      return b;
    })
    // 启动失败即清掉 promise 缓存，下次 getBrowser 可重新拉起
    .catch((e) => {
      browser = null;
      browserPromise = null;
      throw e;
    });
  try {
    const b = await browserPromise;
    browserPromise = null;
    return b;
  } catch (e) {
    browserPromise = null;
    throw e;
  }
}

const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const RENDER_SETTLE_MS = 1200; // 线路由 JS 随机生成，等它写入后再取值

// 单个页面渲染永久页一次，返回 body 文本；页面异常时由调用方重试。
async function renderOnce(b, permanentUrl, timeoutMs) {
  const page = await b.newPage();
  try {
    await page.setUserAgent(UA_CHROME);
    await page.goto(permanentUrl, { waitUntil: 'networkidle2', timeout: timeoutMs });
    await new Promise((r) => setTimeout(r, RENDER_SETTLE_MS));
    return await page.evaluate(() => (document.body ? document.body.innerText : ''));
  } finally {
    await page.close().catch(() => {});
  }
}

/** 渲染永久页并返回 body 文本；动态渲染偶发失败时最多整体重试 attempts 次。 */
async function renderPermaText(permanentUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs || 40000;
  const attempts = Math.max(1, opts.attempts || 2);
  const b = await getBrowser();
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const text = await renderOnce(b, permanentUrl, timeoutMs);
      if (parseLines(text).length) return text; // 渲染成功且解析到线路才认为有效
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error(`永久页 ${permanentUrl} 渲染 ${attempts} 次后仍解析不到任何线路`);
}

/** 校验 URL 是否可达（2xx/3xx 视为可达）。统一超时并确保请求已中止，避免连接泄漏。 */
function reachable(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let req = null;
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      if (req) req.destroy();
      resolve(v);
    };

    try {
      req = https.get(url, {
        headers: { 'User-Agent': UA_CHROME, Accept: 'text/html,*/*' },
        timeout: timeoutMs,
      }, (res) => {
        // 3xx 也视为可达（可能是到规范地址的跳转）
        done(res.statusCode >= 200 && res.statusCode < 400);
      });
    } catch (_) {
      done(false);
      return;
    }
    req.on('timeout', () => done(false));
    req.on('error', () => done(false));
  });
}

/**
 * 解析永久页可用线路，返回 { lineUrl, lineHost, label, candidates }；
 * 优先「线路一」，线路一不可达时依次回退其它线路；全部不可达返回 null。
 */
async function resolveSiteLine(siteCfg, opts = {}) {
  const permanentUrl = siteCfg.permanentUrl;
  if (!permanentUrl) return null;
  const text = await renderPermaText(permanentUrl, opts);
  const lines = parseLines(text);
  if (!lines.length) {
    throw new Error(`永久页 ${permanentUrl} 未解析到任何线路`);
  }
  const preferredLabel = siteCfg.permanentLabel || '线路一';
  const ordered = [...lines].sort((a, b) => {
    const pa = a.label === preferredLabel ? 0 : 1;
    const pb = b.label === preferredLabel ? 0 : 1;
    return pa - pb || a.order - b.order;
  });
  for (const ln of ordered) {
    const lineUrl = ln.url || `https://${ln.host}/`;
    if (await reachable(lineUrl, opts.timeoutMs)) {
      return { lineUrl, lineHost: ln.host, label: ln.label, candidates: lines };
    }
  }
  return null;
}

/** 关闭无头浏览器实例（进程退出时可调用；不调用也可由进程自然回收）。 */
async function closeBrowser() {
  browserPromise = null;
  const b = browser;
  browser = null;
  if (b) await b.close().catch(() => {});
}

module.exports = {
  detectBrowserPath,
  parseLines,
  renderPermaText,
  reachable,
  resolveSiteLine,
  getBrowser,
  closeBrowser,
};