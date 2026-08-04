// crawler.js — 多站点聚合爬虫。
// 站点配置读自 output/sites.json（可在页面修改后即时生效）。
//
// 命令行：
//   node crawler.js --pages 1-3
//   node crawler.js --search <关键词> --search-pages 2

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');
const cheerio = require('cheerio');
const { filterSiteBrandTags, isSiteBrandTag } = require('./lib/tags');

// 站点配置：{ url, name, todayPath, enabled, archiveSuffix? }
// archiveSuffix 默认 "/"（/archives/ID/），".html" 用于 /archives/ID.html
const SITES_PATH = path.join(__dirname, 'output', 'sites.json');
const DEFAULT_SITE_CONFIGS = [
  { url: 'https://armed.izbfsaxh.cc', name: '91吃瓜', todayPath: '/category/zxcghl/', enabled: true },
  { url: 'https://d1ve8vvwughzqa.cloudfront.net', name: '91视频', todayPath: '/category/jrxw1/', enabled: false },
  { url: 'https://breast.eiejvjgex.cc', name: '51fans', todayPath: '/order/today/', enabled: true },
  { url: 'https://assert.pbtiodqn.cc', name: '51爆料', todayPath: '/category/jrbl/', enabled: true },
  { url: 'https://band.hkllewakv.cc', name: '51吃瓜', todayPath: '/category/wpcz/', enabled: true },
  { url: 'https://d6lvl8l2l26yp.cloudfront.net', name: '黑料网', todayPath: '/category/wpcz/', enabled: true },
  { url: 'https://wiki.lgbtoexf.cc', name: '黑料不打烊', todayPath: '/category/24hcg/', archiveSuffix: '.html', enabled: true },
];

function loadSiteConfigs() {
  try {
    const raw = fs.readFileSync(SITES_PATH, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return arr;
  } catch (_) { /* fall through to defaults */ }
  return DEFAULT_SITE_CONFIGS.map((s) => ({ ...s }));
}

function saveSiteConfigs(configs) {
  fs.mkdirSync(path.dirname(SITES_PATH), { recursive: true });
  fs.writeFileSync(SITES_PATH, JSON.stringify(configs, null, 2), 'utf8');
}

// 当前生效配置（模块级缓存，reloadSites() 刷新）。
// SITES / SITE_TODAY_PATH / SITE_ARCHIVE_SUFFIX / BASE_URL 用 let，便于 reloadSites
// 重新赋值；模块内函数引用的是变量本身，reload 后下次调用自动用新值。
let SITE_CONFIGS = loadSiteConfigs();
let SITES = [];
let SITE_TODAY_PATH = {};   // url -> 今日分类路径
let SITE_ARCHIVE_SUFFIX = {}; // url -> 归档详情页后缀（"/" 或 ".html"）
let BASE_URL = '';

// 从 SITE_CONFIGS 重建派生映射（init 与 reloadSites 共用，避免重复）。
function rebuildSiteMaps() {
  const enabled = SITE_CONFIGS.filter((s) => s.enabled !== false);
  SITES = enabled.map((s) => s.url);
  SITE_TODAY_PATH = {};
  SITE_ARCHIVE_SUFFIX = {};
  for (const s of enabled) {
    if (s.todayPath) SITE_TODAY_PATH[s.url] = s.todayPath;
    SITE_ARCHIVE_SUFFIX[s.url] = s.archiveSuffix || '/';
  }
  BASE_URL = SITES[0] || ''; // backwards compat（server.js 应优先用 getBaseUrl()）
}
rebuildSiteMaps();

// 重新加载站点配置（配置文件被外部修改后调用，例如页面保存）。
function reloadSites() {
  SITE_CONFIGS = loadSiteConfigs();
  rebuildSiteMaps();
}

function getSiteConfigs() { return SITE_CONFIGS; }
function getSites() { return SITES; }
function getBaseUrl() { return BASE_URL; }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Articles whose title or tags contain any of these keywords are excluded from
// the index (case-insensitive substring match).
const EXCLUDE_KEYWORDS = ['重口味', 'ai'];
const EXCLUDE_KW_LOWER = EXCLUDE_KEYWORDS.map((kw) => kw.toLowerCase());

function matchesExclude(article) {
  const title = (article.title || '').toLowerCase();
  if (EXCLUDE_KW_LOWER.some((k) => title.includes(k))) return true;
  const tags = article.tags || [];
  for (let i = 0; i < tags.length; i++) {
    const t = String(tags[i]).toLowerCase();
    for (let j = 0; j < EXCLUDE_KW_LOWER.length; j++) {
      if (t.includes(EXCLUDE_KW_LOWER[j])) return true;
    }
  }
  return false;
}

// In-place remove articles whose title or tags match EXCLUDE_KEYWORDS.
// `label` is used in the log line (e.g. "title" / "tag").
function filterExcluded(articles, label, log) {
  const before = articles.length;
  for (let i = articles.length - 1; i >= 0; i--) {
    if (matchesExclude(articles[i])) articles.splice(i, 1);
  }
  const removed = before - articles.length;
  if (removed > 0) log(`Excluded ${removed} articles by ${label} (重口味/ai)`);
  return removed;
}

// Keep-alive agents: reuse TCP connections across requests to the same host.
// Big win for crawl latency (no TLS handshake per request).
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64 });

const client = axios.create({
  timeout: 30000,
  maxRedirects: 5,
  httpAgent,
  httpsAgent,
  headers: {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  },
});

// ---------- helpers ----------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Extract article ID from any archive URL (site-agnostic). Matches both
// "/archives/123/" and "/archives/123.html" (the latter used by wiki-style sites).
function normalizeArchiveUrl(href) {
  const m = href.match(/\/archives\/(\d+)(?:\.html)?\/?/);
  return m ? { id: m[1] } : null;
}

function archiveUrl(site, id) {
  const suffix = SITE_ARCHIVE_SUFFIX[site] || '/';
  return `${site}/archives/${id}${suffix}`;
}

function listPageUrl(site, pageNum) {
  return pageNum <= 1 ? site + '/' : `${site}/page/${pageNum}/`;
}

// Per-site "今日" (today) entry path — the day's freshest content, used as the
// priority source on every list-mode crawl. Each site exposes it under a
// different route, so we map by site origin.（SITE_TODAY_PATH 由站点配置构建，见文件顶部）
function todayPageUrl(site, pageNum) {
  const p = SITE_TODAY_PATH[site];
  if (!p) return null;
  return pageNum <= 1 ? site + p : site + p.replace(/\/$/, '') + `/page/${pageNum}/`;
}

// China (UTC+8) calendar date as YYYY-MM-DD.
function chinaDateStr(offsetDays = 0) {
  const t = Date.now() + 8 * 3600000 + offsetDays * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

// Convert an article ISO timestamp to China calendar YYYY-MM-DD.
// IMPORTANT: do NOT use the UTC date prefix of the string — 51fans JSON-LD uses
// UTC (e.g. 2026-07-19T23:00:00+00:00 = 2026-07-20 07:00 in China).
function articleDateStr(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!isNaN(t)) return new Date(t + 8 * 3600000).toISOString().slice(0, 10);
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// Prefer datePublished (content day); fall back to dateModified.
function articleContentDateStr(article) {
  return articleDateStr(article.datePublished) || articleDateStr(article.dateModified);
}

function searchUrl(site, keyword, pageNum) {
  const enc = encodeURIComponent(keyword);
  return pageNum <= 1 ? `${site}/search/${enc}/` : `${site}/search/${enc}/page/${pageNum}/`;
}

// Per-request Referer matching the target site.
function headersFor(site) {
  return { Referer: site + '/', Origin: site };
}

async function getWithRetry(url, httpClient = client, retries = 4, extraHeaders = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await httpClient.get(url, { headers: extraHeaders });
    } catch (err) {
      lastErr = err;
      const code = err.response && err.response.status;
      // 4xx (except 429) are not retryable.
      if (code && code >= 400 && code < 500 && code !== 429) throw err;
      await sleep(800 * Math.pow(2, i) + Math.floor(Math.random() * 300));
    }
  }
  throw lastErr;
}

function parsePagesArg(arg) {
  if (!arg) return [1, 1];
  if (String(arg).includes('-')) {
    const [a, b] = String(arg).split('-').map((n) => parseInt(n, 10));
    if (!isNaN(a) && !isNaN(b)) return [Math.min(a, b), Math.max(a, b)];
  }
  const n = parseInt(arg, 10);
  if (!isNaN(n)) return [n, n];
  return [1, 1];
}

// ---------- list / search page parsing (polyglot: post-card + xqbj themes) ----------

const COVER_BANNER_RE = /loadBannerDirect\s*\(\s*['"]([^'"]+)['"]/;
const COVER_ATTR_RE = /https?:\/\/[^\s`"']+/;

function parseListPage(html, siteUrl) {
  const $ = cheerio.load(html);
  const articles = [];
  const seen = new Set();

  const pushArticle = (a) => {
    if (seen.has(a.id)) return;
    seen.add(a.id);
    articles.push(a);
  };

  // Theme 1: post-card (bite, d1ve, assert) — article > a[href*="/archives/"] > .post-card
  $('article a[href*="/archives/"]').each((_, a) => {
    const $a = $(a);
    const norm = normalizeArchiveUrl($a.attr('href') || '');
    if (!norm) return;

    let coverUrl = null;
    const $card = $a.find('.post-card').first();
    if ($card.length) {
      const m = ($card.html() || '').match(COVER_BANNER_RE);
      if (m) coverUrl = m[0];
    }

    const title = $a.find('.post-card-title').text().replace(/\s+/g, ' ').trim();
    pushArticle({ id: norm.id, url: archiveUrl(siteUrl, norm.id), siteUrl, title, coverUrl });
  });

  // Theme 2: xqbj-list-rows (breast/51fans) — .xqbj-list-rows a[href*="/archives/"]
  $('.xqbj-list-rows a[href*="/archives/"]').each((_, a) => {
    const $a = $(a);
    const norm = normalizeArchiveUrl($a.attr('href') || '');
    if (!norm) return;

    const title = ($a.attr('title') || $a.find('.xqbj-list-rows-image-title').text() || '')
      .replace(/\s+/g, ' ').trim();

    let coverUrl = null;
    const $img = $a.find('img[z-image-loader-url]').first();
    if ($img.length) {
      const m = ($img.attr('z-image-loader-url') || '').match(COVER_ATTR_RE);
      if (m) coverUrl = m[0];
    }

    pushArticle({ id: norm.id, url: archiveUrl(siteUrl, norm.id), siteUrl, title, coverUrl });
  });

  return articles;
}

// ---------- detail page parsing (polyglot) ----------

const JSON_LD_PUB_RE = /"datePublished"\s*:\s*"([^"]+)"/;
const JSON_LD_MOD_RE = /"dateModified"\s*:\s*"([^"]+)"/;

function parseDetailPage(html) {
  const $ = cheerio.load(html);
  const result = {
    title: null, video: null, tags: [], category: null,
    coverUrl: null, datePublished: null, dateModified: null,
  };

  // Title — try multiple selectors used by different themes
  const h1 = $('h1.post-title, h1[itemprop="headline"], .article-title h1, article h1').first();
  if (h1.length) result.title = h1.text().replace(/\s+/g, ' ').trim();

  // Cover — meta itemprop="image" (matches actual video content; skips GIF ads)
  const metaImg = $('meta[itemprop="image"]').attr('content');
  if (metaImg && !/\.gif/i.test(metaImg)) result.coverUrl = metaImg;

  // Publish / modified dates — two strategies across themes:
  //   (a) post-card theme: <meta itemprop="datePublished" content="...">
  //   (b) xqbj theme: JSON-LD with datePublished
  const metaPublished = $('meta[itemprop="datePublished"]').attr('content');
  if (metaPublished) result.datePublished = metaPublished;
  const metaModified = $('meta[itemprop="dateModified"]').attr('content');
  if (metaModified) result.dateModified = metaModified;

  if (!result.datePublished) {
    $('script[type="application/ld+json"]').each((_, el) => {
      if (result.datePublished) return;
      const raw = $(el).html() || '';
      // Use a tolerant regex rather than JSON.parse; the JSON-LD may be embedded
      // inside a Vue template / wrapped in backticks which breaks strict parsing.
      const mPub = raw.match(JSON_LD_PUB_RE);
      if (mPub) result.datePublished = mPub[1];
      const mMod = raw.match(JSON_LD_MOD_RE);
      if (mMod) result.dateModified = mMod[1];
    });
  }

  // Tags — DOM links (post-card theme)
  const tagSet = new Set();
  $('div.keywords a, div.tags div.keywords a').each((_, a) => {
    const t = $(a).text().trim();
    if (t) tagSet.add(t);
  });

  // Category — breadcrumb first；站点品牌相关分类丢弃
  const acceptCategory = (raw) => {
    const cat = String(raw || '').trim();
    return cat && !isSiteBrandTag(cat, SITE_CONFIGS) ? cat : null;
  };
  const $crumb = $('p.sp_breadcrumb_nav a');
  if ($crumb.length >= 2) {
    result.category = acceptCategory($crumb.eq(1).text());
  }

  // Video + tags + category from .dplayer[data-config]
  $('.dplayer').each((_, div) => {
    const $div = $(div);
    const cfg = $div.attr('data-config');
    if (!cfg) return;

    // Tags from data-video_tag_name (comma-separated) if DOM parsing found nothing
    if (tagSet.size === 0) {
      const tagStr = $div.attr('data-video_tag_name');
      if (tagStr) {
        tagStr.split(',').forEach((t) => {
          t = t.trim();
          if (t) tagSet.add(t);
        });
      }
    }

    // Category from data-video_type_name if breadcrumb found nothing
    if (!result.category) {
      result.category = acceptCategory($div.attr('data-video_type_name'));
    }

    // Video URL — two data-config shapes:
    //   (a) obj.video.url = direct m3u8 (bite, breast)
    //   (b) obj.url = player endpoint or direct url (d1ve)
    if (result.video) return;
    try {
      const obj = JSON.parse(cfg);
      if (obj.video && obj.video.url) {
        result.video = {
          url: obj.video.url,
          type: obj.video.type || 'hls',
          thumbnails: obj.video.thumbnails || null,
        };
      } else if (obj.url) {
        result.video = {
          url: obj.url,
          type: obj.type || 'hls',
          thumbnails: obj.poster || null,
          needsResolve: /\/action\//.test(obj.url),
        };
      }
    } catch (e) {
      /* skip unparseable config */
    }
  });

  // 生成时过滤站点名称/品牌相关标签
  result.tags = filterSiteBrandTags(Array.from(tagSet), SITE_CONFIGS);
  return result;
}

// Extract the m3u8 URL from a player-endpoint response. Two response shapes
// exist across sites: {data:"<url>"} (string, ticket-flow sites) and
// {data:[{url}]} (array, legacy d1ve-style).
function extractPlayerUrl(resp) {
  const d = resp && resp.data;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]) return d[0].url || null;
  return (d && d.url) || null;
}

// Resolve a player endpoint URL to the real m3u8 URL.
//   /action/player/get_play_url endpoints require a server-issued one-time
//   ticket (per the site's artplayer-plugin-authentication): GET
//   /action/player/ticket -> {data:{ticket}}, then POST get_play_url with
//   {ticket, env}. The env fingerprint is only logged server-side, not enforced,
//   so a minimal payload suffices. Other player endpoints are GET directly.
//   Per-cid replay triggers "请求过于频繁" / "票据无效"; we retry once with backoff.
async function resolvePlayerUrl(siteUrl, playerPath, log) {
  const fullUrl = playerPath.startsWith('http') ? playerPath : siteUrl + playerPath;
  const headers = headersFor(siteUrl);
  const needsTicket = fullUrl.includes('/get_play_url');

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let resp;
      if (needsTicket) {
        const ticketUrl = fullUrl.replace('/get_play_url', '/ticket');
        const tRes = await getWithRetry(ticketUrl, client, 2, headers);
        const tData = typeof tRes.data === 'string' ? JSON.parse(tRes.data) : tRes.data;
        const ticket = tData && tData.data && tData.data.ticket;
        if (!ticket) {
          log(`  [player] ticket FAIL (${(tData && tData.msg) || 'no ticket'}): ${ticketUrl}`);
          return null;
        }
        log(`  [player] ticket OK (ttl=${tData.data.ttl}s) cid=${(fullUrl.match(/cid=(\d+)/) || [])[1] || '?'}`);
        const body = new URLSearchParams();
        body.append('ticket', ticket);
        body.append('env', JSON.stringify({ source: 'web', ua: UA }));
        const pRes = await client.post(fullUrl, body.toString(), {
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        resp = typeof pRes.data === 'string' ? JSON.parse(pRes.data) : pRes.data;
      } else {
        const res = await getWithRetry(fullUrl, client, 2, headers);
        resp = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      }
      const url = extractPlayerUrl(resp);
      if (url) {
        log(`  [player] resolved${needsTicket ? ' (ticket)' : ''}: ${url.slice(0, 80)}`);
        return url;
      }
      const msg = (resp && resp.msg) || '';
      if (/频繁|稍后/.test(msg) && attempt === 0) {
        log(`  [player] rate limited (msg="${msg}"), retry ${attempt + 1}/2 after backoff`);
        await sleep(1500 + Math.floor(Math.random() * 1000));
        continue;
      }
      log(`  [player] no url (msg="${msg || 'empty'}", status=${resp && resp.status}) ${needsTicket ? 'POST' : 'GET'} ${fullUrl}`);
      return null;
    } catch (err) {
      const code = err.code || (err.response && err.response.status) || '';
      log(`  [player] resolve error (${code} ${err.message}). ${fullUrl}`);
      if (attempt === 0) { await sleep(800); continue; }
      return null;
    }
  }
  return null;
}

// ---------- concurrency runner (p-limit style: simple, no reject on first error) ----------

async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;
  let active = 0;
  return new Promise((resolve) => {
    const launch = () => {
      while (active < limit && cursor < items.length) {
        const idx = cursor++;
        active++;
        Promise.resolve()
          .then(() => mapper(items[idx], idx))
          .then((r) => {
            results[idx] = r;
            active--;
            if (cursor >= items.length && active === 0) resolve(results);
            else launch();
          })
          .catch((err) => {
            // Map error to a sentinel; caller decides how to handle.
            results[idx] = { __error: err };
            active--;
            if (cursor >= items.length && active === 0) resolve(results);
            else launch();
          });
      }
    };
    launch();
  });
}

// ---------- index persistence ----------

function loadIndex(jsonPath) {
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (_) {
    return [];
  }
}

function saveIndex(jsonPath, articles) {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(articles, null, 2), 'utf8');
}

// Merge crawled articles into existing index: new/updated items are pushed
// to the front; older entries without a match are kept. Dedupes by id.
function mergeIntoIndex(existing, incoming) {
  const existingMap = new Map(existing.map((a) => [a.id, a]));
  const incomingIds = new Set(incoming.map((a) => a.id));
  const merged = [...incoming];
  let added = 0;
  for (const a of existing) {
    if (!incomingIds.has(a.id)) merged.push(a);
  }
  for (const a of incoming) {
    if (!existingMap.has(a.id)) added++;
  }
  return { merged, added, updated: incoming.length - added };
}

// ---------- multi-site aggregated fetch ----------

// Dedupe articles by id, preserving first-seen order.
function dedupeById(articles) {
  const seen = new Set();
  const out = [];
  for (const a of articles) {
    if (!seen.has(a.id)) { seen.add(a.id); out.push(a); }
  }
  return out;
}

// Run an async task against every enabled site in parallel, then aggregate and
// dedupe the returned article arrays. taskFn(site) does its own success logging
// and returns an article array (or { articles }); rejections are logged here.
async function mapAllSites(taskFn, log) {
  const results = await Promise.allSettled(SITES.map((site) => taskFn(site)));
  const aggregated = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      const arts = Array.isArray(r.value) ? r.value : (r.value && r.value.articles) || [];
      for (const a of arts) aggregated.push(a);
    } else {
      log(`  [${SITES[i]}] FAILED: ${r.reason && r.reason.message}`);
    }
  }
  return dedupeById(aggregated);
}

// Fetch a list/search page from ALL sites in parallel, aggregate articles by ID.
async function fetchListPageFromAllSites(pageNum, log, mode) {
  return mapAllSites(async (site) => {
    const url = mode.type === 'search' ? searchUrl(site, mode.keyword, pageNum) : listPageUrl(site, pageNum);
    log(`[${mode.type}] ${site} page ${pageNum}`);
    const res = await getWithRetry(url, client, 3, headersFor(site));
    const arts = parseListPage(res.data, site);
    log(`  [${site}] -> ${arts.length} articles`);
    return arts;
  }, log);
}

// Fetch "今日" per site. Each site is handled independently: if its today
// category returns zero articles, fall back to list page 1 (previous day).
async function fetchTodayPerSiteWithFallback(log) {
  return mapAllSites(async (site) => {
    const articles = [];
    const seen = new Set();
    const add = (a) => { if (!seen.has(a.id)) { seen.add(a.id); articles.push(a); } };

    let source = 'today';
    const todayPath = SITE_TODAY_PATH[site];

    if (todayPath) {
      for (let pg = 1; pg <= 2; pg++) {
        const url = todayPageUrl(site, pg);
        if (!url) break;
        try {
          log(`[today] ${site} page ${pg}`);
          const res = await getWithRetry(url, client, 2, headersFor(site));
          parseListPage(res.data, site).forEach(add);
        } catch (err) {
          if (pg === 1) log(`  [today ${site}] FAILED: ${err.message}`);
          break;
        }
      }
    }

    if (articles.length === 0) {
      source = 'fallback';
      log(`[today] ${site} -> 0 条，回退列表第 1 页（前一日）`);
      try {
        const res = await getWithRetry(listPageUrl(site, 1), client, 3, headersFor(site));
        parseListPage(res.data, site).forEach(add);
        log(`  [fallback ${site}] -> ${articles.length} articles`);
      } catch (err) {
        log(`  [fallback ${site}] FAILED: ${err.message}`);
      }
    } else {
      log(`  [today ${site}] -> ${articles.length} articles`);
    }

    articles.forEach((a) => { a._listSource = source; });
    return articles;
  }, log);
}

// Fetch list pages per site until each site has contributed at least minArticles.
// If a site has fewer articles after maxPages, it will return whatever was found.
// Sites that return 0 new articles or hit 404 are marked as exhausted and skipped.
async function fetchMinPerSite(minArticles, log, maxPages = 10) {
  const siteArticles = {};
  const siteIds = {};
  const exhaustedSites = new Set();
  SITES.forEach((site) => {
    siteArticles[site] = [];
    siteIds[site] = new Set();
  });

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    let allSitesMetOrExhausted = true;
    const results = await Promise.allSettled(
      SITES.map(async (site) => {
        if (exhaustedSites.has(site)) return { site, exhausted: true };
        if (siteIds[site].size >= minArticles) return { site, met: true };
        log(`[minPerSite] ${site} page ${pageNum}`);
        try {
          const res = await getWithRetry(listPageUrl(site, pageNum), client, 3, headersFor(site));
          const arts = parseListPage(res.data, site);
          let newCount = 0;
          for (const a of arts) {
            if (!siteIds[site].has(a.id)) {
              siteIds[site].add(a.id);
              siteArticles[site].push(a);
              newCount++;
            }
          }
          if (newCount === 0) {
            log(`  [${site}] page ${pageNum} -> 0 new articles, site exhausted`);
            return { site, exhausted: true, newCount: 0, total: siteArticles[site].length };
          }
          return { site, met: false, newCount, total: siteArticles[site].length };
        } catch (err) {
          const is404 = err.response && err.response.status === 404;
          if (is404) {
            log(`  [${site}] page ${pageNum} -> 404, site exhausted`);
          } else {
            log(`  [${site}] FAILED page ${pageNum}: ${err.message}`);
          }
          return { site, exhausted: true };
        }
      })
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const site = SITES[i];
      if (r.status === 'fulfilled') {
        const v = r.value;
        if (v.exhausted) {
          if (!exhaustedSites.has(site)) {
            exhaustedSites.add(site);
            log(`  [${site}] marked as exhausted (${siteArticles[site].length} articles)`);
          }
        } else if (v.met) {
          // site already met minimum
        } else {
          log(`  [${site}] page ${pageNum} -> ${v.newCount} new, total ${v.total}`);
        }
        // Check if site still needs more articles
        if (!exhaustedSites.has(site) && siteIds[site].size < minArticles) {
          allSitesMetOrExhausted = false;
        }
      } else {
        // Should not happen since we catch errors inside
        allSitesMetOrExhausted = false;
      }
    }

    if (allSitesMetOrExhausted) {
      log(`All sites met minimum ${minArticles} articles or exhausted at page ${pageNum}`);
      break;
    }
    if (pageNum < maxPages) await sleep(150);
  }

  for (const site of SITES) {
    log(`[minPerSite] ${site}: ${siteArticles[site].length} articles`);
  }
  return dedupeById(SITES.flatMap((site) => siteArticles[site]));
}

// Keep articles whose content date matches the list source (today vs fallback).
// Uses China-local calendar day from datePublished (preferred) or dateModified.
function filterArticlesByModifiedDate(articles, log) {
  const today = chinaDateStr(0);
  const yesterday = chinaDateStr(-1);
  const before = articles.length;
  for (let i = articles.length - 1; i >= 0; i--) {
    const a = articles[i];
    const d = articleContentDateStr(a);
    if (!d) continue; // keep when date unknown
    if (a._listSource === 'today' && d !== today) articles.splice(i, 1);
    else if (a._listSource === 'fallback' && d !== yesterday) articles.splice(i, 1);
  }
  if (before - articles.length > 0) {
    log(`date filter (China today=${today}, yesterday=${yesterday}): removed ${before - articles.length}`);
  }
  articles.forEach((a) => { delete a._listSource; });
}

// ---------- core crawl (module API) ----------

// Options:
//   pageStart, pageEnd   list page range (default 1..1)
//   search               search keyword (overrides pages)
//   searchPages          how many search result pages (default 1)
//   searchPageStart      search starting page (default 1, for incremental keyword sync)
//   todayOnly            startup mode: only 今日 per site (+ per-site fallback), no list pages
//   minPerSite           minimum articles per site (overrides todayOnly list fetching)
//   replace              replace index.json entirely (default: true when todayOnly or minPerSite)
//   limit                max articles (default 0 = all)
//   outDir               output directory
//   concurrency         detail workers (default 6)
//   jsonPath             index.json path
//   onLog                progress callback (msg) => void
async function crawl(opts = {}) {
  const pageStart = opts.pageStart || 1;
  const pageEnd = opts.pageEnd || opts.pageStart || 1;
  const searchKeyword = opts.search || null;
  const searchPages = opts.searchPages || 1;
  const searchPageStart = opts.searchPageStart || 1;
  const todayOnly = !!opts.todayOnly;
  const minPerSite = opts.minPerSite || 0;
  // Startup modes (todayOnly/minPerSite) replace; UI sync merges/pushes unless replace:true.
  const replace = opts.replace != null ? !!opts.replace : (todayOnly || minPerSite > 0);
  const limit = opts.limit || 0;
  const outDir = path.resolve(opts.outDir || './output');
  const concurrency = opts.concurrency || 6;
  const jsonPath = path.resolve(opts.jsonPath || path.join(outDir, 'index.json'));
  const log = typeof opts.onLog === 'function' ? opts.onLog : (m) => console.log(m);

  fs.mkdirSync(outDir, { recursive: true });

  // 每次抓取前重新加载站点配置，确保页面修改后立即生效。
  reloadSites();

  const mode = searchKeyword
    ? { type: 'search', keyword: searchKeyword, label: `search "${searchKeyword}" pages 1..${searchPages}` }
    : minPerSite > 0
      ? { type: 'list', label: `min ${minPerSite} per site` }
      : todayOnly
        ? { type: 'list', label: 'today only (per-site fallback)' }
        : { type: 'list', label: `pages ${pageStart}..${pageEnd}` };
  log(`=== crawler start | ${mode.label} | ${SITES.length} sites ===`);

  const newArticles = [];
  const collectedIds = new Set();
  const addUnique = (a) => {
    if (!collectedIds.has(a.id)) { collectedIds.add(a.id); newArticles.push(a); }
  };

  if (mode.type === 'list') {
    if (minPerSite > 0) {
      log(`--- Fetching minimum ${minPerSite} articles per site ---`);
      const minArts = await fetchMinPerSite(minPerSite, log);
      for (const a of minArts) addUnique(a);
      log(`Min per site: ${minArts.length} articles`);
    } else {
      log('--- Fetching 今日 (per-site, fallback if empty) ---');
      const todayArts = await fetchTodayPerSiteWithFallback(log);
      for (const a of todayArts) addUnique(a);
      log(`Today+fallback: ${todayArts.length} articles`);
    }
  }

  if (!todayOnly && minPerSite === 0) {
    const totalPages = searchKeyword ? searchPages : (pageEnd - pageStart + 1);
    for (let i = 0; i < totalPages; i++) {
      const pageNum = searchKeyword ? (searchPageStart + i) : (pageStart + i);
      const arts = await fetchListPageFromAllSites(pageNum, log, mode);
      for (const a of arts) addUnique(a);
      if (i < totalPages - 1) await sleep(150);
    }
  }

  log(`Collected ${newArticles.length} unique articles from ${SITES.length} sites`);
  if (limit > 0 && newArticles.length > limit) {
    newArticles.length = limit;
    log(`Limited to ${limit} articles`);
  }

  // Pre-filter by title to avoid wasting detail-page fetches on excluded content.
  filterExcluded(newArticles, 'title', log);

  if (newArticles.length === 0) {
    // Keep the existing index — do not wipe it when a crawl finds nothing
    // (e.g. all sites temporarily unreachable or all titles excluded).
    const existing = loadIndex(jsonPath);
    log('No articles found, nothing to do.');
    return { added: 0, total: existing.length, crawled: 0 };
  }

  // 2. Fetch detail pages -> extract video URLs + tags + category + real cover
  log('--- Fetching detail pages ---');
  await mapWithConcurrency(newArticles, concurrency, async (a) => {
    try {
      const res = await getWithRetry(a.url, client, 3, headersFor(a.siteUrl));
      const detail = parseDetailPage(res.data);
      if (detail.title && !a.title) a.title = detail.title;
      a.video = detail.video;
      if (detail.tags && detail.tags.length) a.tags = detail.tags;
      if (detail.category) a.category = detail.category;
      if (detail.coverUrl) a.coverUrl = detail.coverUrl;
      if (detail.datePublished) a.datePublished = detail.datePublished;
      if (detail.dateModified) a.dateModified = detail.dateModified;

      // Resolve player endpoint URLs (d1ve-style) to get the real m3u8 URL
      if (a.video && a.video.needsResolve) {
        const resolved = await resolvePlayerUrl(a.siteUrl, a.video.url, log);
        if (resolved) {
          a.video.url = resolved;
          a.video.needsResolve = false;
        } else {
          a.video = null; // can't play without a real m3u8 URL
        }
      }

      log(`  [detail] ${a.id} ${a.video ? '+' : '-'} video | ${(a.title || '').slice(0, 40)}`);
    } catch (err) {
      log(`  [detail] ${a.id} failed: ${err.message}`);
    }
    await sleep(80);
  });

  // Post-filter by tags (only available after detail parse).
  filterExcluded(newArticles, 'tag', log);

  if (todayOnly) {
    filterArticlesByModifiedDate(newArticles, log);
  } else if (minPerSite === 0) {
    newArticles.forEach((a) => { delete a._listSource; });
  }

  if (newArticles.length === 0) {
    const existing = loadIndex(jsonPath);
    log('No articles left after filters, keeping existing index.');
    return { added: 0, total: existing.length, updated: 0, crawled: 0 };
  }

  if (replace) {
    saveIndex(jsonPath, newArticles);
    const withVideo = newArticles.filter((a) => a.video && a.video.url).length;
    log(`Done (replace). Total ${newArticles.length} articles | ${withVideo} with video URL`);
    return { added: newArticles.length, total: newArticles.length, updated: 0, crawled: newArticles.length };
  }

  const existing = loadIndex(jsonPath);
  const { merged, added, updated } = mergeIntoIndex(existing, newArticles);
  saveIndex(jsonPath, merged);
  const withVideo = merged.filter((a) => a.video && a.video.url).length;
  log(`Done (merge). +${added} new, ~${updated} updated | total ${merged.length} | ${withVideo} with video URL`);
  return { added, total: merged.length, updated, crawled: newArticles.length };
}

// ---------- CLI ----------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[k.slice(2)] = true;
      } else {
        args[k.slice(2)] = next;
        i++;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [pageStart, pageEnd] = parsePagesArg(args.pages);
  const searchPages = parseInt(args['search-pages'], 10) || 1;

  await crawl({
    pageStart,
    pageEnd,
    search: args.search || null,
    searchPages,
    todayOnly: !!args['today-only'],
    replace: !!args.replace || !!args['today-only'],
    limit: parseInt(args.limit, 10) || 0,
    outDir: args.out || './output',
    concurrency: parseInt(args.concurrency, 10) || 6,
    jsonPath: args['save-json'] || './output/index.json',
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

module.exports = {
  crawl, parseDetailPage, resolvePlayerUrl, loadIndex, mergeIntoIndex,
  SITES, UA,
  loadSiteConfigs, saveSiteConfigs, reloadSites,
  getSiteConfigs, getSites, getBaseUrl,
};
