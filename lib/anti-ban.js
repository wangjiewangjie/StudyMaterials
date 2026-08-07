// lib/anti-ban.js — 爬虫防封：按主机限速、UA 轮换、失败冷却

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

/** @type {Map<string, { nextAt: number, cooldownUntil: number, failStreak: number, active: number }>} */
const hostState = new Map();

/** 默认：同主机最小间隔 + 抖动；遇 403/429 指数冷却 */
const DEFAULTS = {
  minIntervalMs: 1200,
  jitterMs: 800,
  maxConcurrentPerHost: 1,
  cooldownBaseMs: 20000,
  cooldownMaxMs: 180000,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch (_) {
    return String(url || '').split('/')[2] || 'unknown';
  }
}

function stateFor(host) {
  let s = hostState.get(host);
  if (!s) {
    s = { nextAt: 0, cooldownUntil: 0, failStreak: 0, active: 0 };
    hostState.set(host, s);
  }
  return s;
}

function pickUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * 浏览器风格请求头（每次随机 UA）
 * @param {string} siteOrigin 如 https://example.com
 * @param {{ forApi?: boolean }} [opts]
 */
function browserHeaders(siteOrigin, opts = {}) {
  const site = String(siteOrigin || '').replace(/\/$/, '');
  const ua = pickUA();
  const base = {
    'User-Agent': ua,
    Accept: opts.forApi
      ? 'application/json, text/plain, */*'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
  };
  if (site) {
    base.Referer = `${site}/`;
    base.Origin = site;
    base['Sec-Fetch-Site'] = 'same-origin';
  } else {
    base['Sec-Fetch-Site'] = 'none';
  }
  if (!opts.forApi) {
    base['Sec-Fetch-Dest'] = 'document';
    base['Sec-Fetch-Mode'] = 'navigate';
    base['Sec-Fetch-User'] = '?1';
  } else {
    base['Sec-Fetch-Dest'] = 'empty';
    base['Sec-Fetch-Mode'] = 'cors';
  }
  return base;
}

/**
 * 占用同一主机的请求槽位：冷却期等待 + 最小间隔 + 并发上限
 */
async function waitHostSlot(url, opts = {}) {
  const host = hostOf(url);
  const s = stateFor(host);
  const minInterval = opts.minIntervalMs ?? DEFAULTS.minIntervalMs;
  const jitter = opts.jitterMs ?? DEFAULTS.jitterMs;
  const maxConc = opts.maxConcurrentPerHost ?? DEFAULTS.maxConcurrentPerHost;

  // 最多等 3 分钟，避免永久卡死
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const now = Date.now();
    if (s.cooldownUntil > now) {
      await sleep(Math.min(s.cooldownUntil - now, 5000));
      continue;
    }
    if (s.active >= maxConc) {
      await sleep(80 + randInt(0, 120));
      continue;
    }
    if (s.nextAt > now) {
      await sleep(Math.min(s.nextAt - now, 2000));
      continue;
    }
    break;
  }

  s.active += 1;
  const gap = minInterval + randInt(0, jitter);
  s.nextAt = Date.now() + gap;

  return () => {
    s.active = Math.max(0, s.active - 1);
  };
}

/** 记录成功/失败，触发主机冷却 */
function noteHostResult(url, statusOrError) {
  const host = hostOf(url);
  const s = stateFor(host);
  const code = typeof statusOrError === 'number'
    ? statusOrError
    : (statusOrError && statusOrError.response && statusOrError.response.status) || 0;

  if (code >= 200 && code < 400) {
    s.failStreak = 0;
    return;
  }

  const blocked = code === 403 || code === 429 || code === 503 || code === 502;
  if (!blocked && code !== 0) return;

  s.failStreak += 1;
  const base = DEFAULTS.cooldownBaseMs * Math.pow(2, Math.min(s.failStreak - 1, 3));
  const cool = Math.min(DEFAULTS.cooldownMaxMs, base) + randInt(0, 5000);
  s.cooldownUntil = Date.now() + cool;
  s.nextAt = Math.max(s.nextAt, s.cooldownUntil);
}

function hostCooldownRemaining(url) {
  const s = stateFor(hostOf(url));
  return Math.max(0, s.cooldownUntil - Date.now());
}

/** 打乱数组（同站连续请求更容易触发限流） */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

module.exports = {
  DEFAULTS,
  UA_POOL,
  pickUA,
  browserHeaders,
  waitHostSlot,
  noteHostResult,
  hostCooldownRemaining,
  hostOf,
  shuffleInPlace,
  sleep,
};
