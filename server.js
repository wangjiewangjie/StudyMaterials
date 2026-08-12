// server.js — 本地 Web 服务：React 前端 + API + HLS CORS 代理。
// 启动：node server.js（默认 http://localhost:9999）
// 端口被占用时自动递增，实际端口写入 .server-port

const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const axios = require('axios');
const { EventEmitter } = require('events');
const { crawl, loadIndex, parseDetailPage, resolvePlayerUrl, UA,
  loadSiteConfigs, saveSiteConfigs, reloadSites, getSiteConfigs, getSites, getBaseUrl,
  estimateCrawlTime } = require('./crawler');
const { decryptBuffer, resetDecrypt, ensureDecryptReady } = require('./image-decrypt');
const { normalizeUpstreamUrl, unwrapCdnProxyUrl } = require('./lib/hls-url');
const { buildDisplayTags, defaultFixedPath } = require('./lib/tags');
const { matchesExclude, filterExcludedArticles } = require('./lib/exclude');
const { startConsoleCountdown, formatDuration } = require('./lib/crawl-eta');
const { sanitizeDetailBlocks, sanitizeDetailContent } = require('./lib/detail-noise');

const BASE_PORT = parseInt(process.env.PORT, 10) || 9999;
const PORT_FILE = path.join(__dirname, '.server-port');
const MEDIA_CACHE_DIR = path.join(__dirname, 'output', 'media-cache');

/** 本机局域网 IPv4（排除回环与内部虚拟网卡） */
function getLocalIPv4() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const netInfo of list || []) {
      if (netInfo.family !== 'IPv4' && netInfo.family !== 4) continue;
      if (netInfo.internal) continue;
      ips.push(netInfo.address);
    }
  }
  return ips;
}

function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
    server.listen(startPort, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => {
        resolve(port);
      });
    });
  });
}
const OUT_DIR = path.resolve(__dirname, 'output');
const JSON_PATH = path.join(OUT_DIR, 'index.json');
const FAV_PATH = path.join(OUT_DIR, 'favorites.json');
const FIXED_TAGS_PATH = defaultFixedPath(OUT_DIR);
const BUILD_DIR = path.join(__dirname, 'public', 'build');
const PROXY_TIMEOUT_MS = parseInt(process.env.PROXY_TIMEOUT_MS, 10) || 90000;
const REFRESH_TIMEOUT_MS = parseInt(process.env.REFRESH_TIMEOUT_MS, 10) || 60000;

function shortUrl(url, max = 120) {
  if (!url) return '';
  return url.length > max ? `${url.slice(0, max)}…` : url;
}

function requestErrorInfo(err, url) {
  const timedOut = err.code === 'ECONNABORTED' || /timeout/i.test(String(err.message || ''));
  return {
    timedOut,
    code: err.code || null,
    message: err.message,
    status: err.response && err.response.status,
    url: shortUrl(url),
  };
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 托管前端构建产物
app.use(express.static(BUILD_DIR));

// 索引内存缓存，避免每次请求都读盘解析
let indexCache = null;
let indexIdMap = null;   // id → 索引位置，O(1) 查找
let indexMtimeMs = -1;
let favCache = null;
let favMtimeMs = -1;

// 标签列表缓存（index 未变时完全相同，避免每次请求重算）
let tagCache = null;

// SSE 事件总线：爬虫每批写入后推送通知，前端不再需要轮询
const syncEmitter = new EventEmitter();
syncEmitter.setMaxListeners(20);

function getIndex() {
  try {
    const mtime = fs.statSync(JSON_PATH).mtimeMs;
    if (indexCache && mtime === indexMtimeMs) return indexCache;
    indexCache = loadIndex(JSON_PATH);
    indexIdMap = new Map();
    for (let i = 0; i < indexCache.length; i++) {
      indexIdMap.set(indexCache[i].id, i);
    }
    indexMtimeMs = mtime;
    return indexCache;
  } catch (_) {
    indexCache = [];
    indexIdMap = new Map();
    indexMtimeMs = -1;
    return indexCache;
  }
}

function rebuildIdMap(articles) {
  indexIdMap = new Map();
  for (let i = 0; i < articles.length; i++) {
    indexIdMap.set(articles[i].id, i);
  }
}

function writeIndex(articles) {
  indexCache = articles;
  rebuildIdMap(articles);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const data = JSON.stringify(articles, null, 2);
  fs.writeFile(JSON_PATH, data, 'utf8', (err) => {
    if (err) { console.warn('[索引] 写入失败:', err.message); return; }
    try { indexMtimeMs = fs.statSync(JSON_PATH).mtimeMs; } catch (_) {}
  });
}

/** 异步写索引：内存缓存立即更新，磁盘写入不阻塞响应 */
function writeIndexAsync(articles) {
  indexCache = articles;
  rebuildIdMap(articles);
  const data = JSON.stringify(articles, null, 2);
  fs.writeFile(JSON_PATH, data, 'utf8', (err) => {
    if (err) {
      console.warn('[索引] 异步写入失败:', err.message);
      return;
    }
    try { indexMtimeMs = fs.statSync(JSON_PATH).mtimeMs; } catch (_) {}
  });
}

// 刷新结果缓存：避免短时间内重复抓取同一详情页
const refreshCache = new Map();
const REFRESH_CACHE_TTL = 120000; // 2 分钟

function getCachedRefresh(id) {
  const entry = refreshCache.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    refreshCache.delete(id);
    return null;
  }
  return entry.data;
}

function setCachedRefresh(id, data) {
  refreshCache.set(id, { data, expiry: Date.now() + REFRESH_CACHE_TTL });
  // 限制缓存大小：淘汰最旧的条目
  if (refreshCache.size > 200) {
    let oldestKey = null;
    let oldestExpiry = Infinity;
    for (const [k, v] of refreshCache) {
      if (v.expiry < oldestExpiry) { oldestExpiry = v.expiry; oldestKey = k; }
    }
    if (oldestKey) refreshCache.delete(oldestKey);
  }
}

// 爬虫改写 index.json 后调用，强制下次 getIndex 重新读盘
function bustIndexCache() {
  indexCache = null;
  indexIdMap = null;
  indexMtimeMs = -1;
}

/** 生成展示标签，超阈值写入 fixed-tags.json */
function refreshTagList() {
  return buildDisplayTags(getIndex(), getSiteConfigs(), {
    fixedPath: FIXED_TAGS_PATH,
    persist: true,
  });
}

/** 索引变更后：清缓存、失效标签缓存、推送 SSE 通知 */
function onIndexChanged() {
  bustIndexCache();
  tagCache = null;
  syncEmitter.emit('batch', { total: getIndex().length });
}

function getFavorites() {
  try {
    const mtime = fs.statSync(FAV_PATH).mtimeMs;
    if (favCache && mtime === favMtimeMs) return favCache;
    favCache = loadIndex(FAV_PATH);
    favMtimeMs = mtime;
    return favCache;
  } catch (_) {
    favCache = [];
    favMtimeMs = -1;
    return favCache;
  }
}

function writeFavorites(list) {
  favCache = list;
  const data = JSON.stringify(list, null, 2);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFile(FAV_PATH, data, 'utf8', (err) => {
    if (err) { console.warn('[收藏] 写入失败:', err.message); return; }
    try { favMtimeMs = fs.statSync(FAV_PATH).mtimeMs; } catch (_) {}
  });
}

function toVideoItem(a) {
  const videos = Array.isArray(a.videos) && a.videos.length
    ? a.videos
    : (a.video ? [a.video] : []);
  const blocks = sanitizeDetailBlocks(a.blocks);
  let content = sanitizeDetailContent(a.content);
  if (!content && blocks.length) {
    content = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
  }
  return {
    id: a.id,
    title: a.title || '',
    url: a.url,
    siteUrl: a.siteUrl || null,
    coverUrl: a.coverUrl || null,
    video: videos[0] || a.video || null,
    videos,
    tags: a.tags || [],
    category: a.category || null,
    datePublished: a.datePublished || null,
    content,
    images: Array.isArray(a.images) ? a.images : [],
    blocks,
    favoritedAt: a.favoritedAt || null,
  };
}

/** 按 id 查找：优先索引（O(1) map），其次收藏（收藏不被爬取清空） */
function findById(id) {
  const index = getIndex();
  if (indexIdMap) {
    const idx = indexIdMap.get(id);
    if (idx !== undefined && idx < index.length && index[idx].id === id) {
      return { item: index[idx], source: 'index' };
    }
  }
  // 安全兜底：map 过期或未命中时线性扫描
  for (let i = 0; i < index.length; i++) {
    if (index[i].id === id) return { item: index[i], source: 'index' };
  }
  const favs = getFavorites();
  for (let i = 0; i < favs.length; i++) {
    if (favs[i].id === id) return { item: favs[i], source: 'favorites' };
  }
  return null;
}

function patchFavoriteById(id, patch) {
  const favs = getFavorites();
  const i = favs.findIndex((a) => a.id === id);
  if (i < 0) return false;
  Object.assign(favs[i], patch);
  writeFavorites(favs);
  return true;
}

// ---------- HLS CORS 代理（m3u8 / TS / AES key） ----------
// 浏览器跨域受限，经本机代理；CDN 需匹配目标 origin 的 Referer。
// 注意：不要对 req.params[0] 再 decodeURIComponent（Express 已解码一次，二次解码会破坏 auth_key）。

function proxyPathFor(absUrl) {
  return '/proxy/' + encodeURIComponent(normalizeUpstreamUrl(absUrl));
}

function resolvePlaylistUri(uri, playlistUrl) {
  if (!uri || /^\/proxy\//i.test(uri) || /^data:/i.test(uri)) return null;
  try {
    return new URL(uri, playlistUrl).href;
  } catch (_) {
    return null;
  }
}

/** 把 m3u8 内相对分片/密钥地址改写为同源 /proxy/...（兼容 Safari 原生 HLS） */
function rewriteM3u8(text, playlistUrl) {
  if (!text.includes('#EXTM3U')) return text;
  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/gi, (m, uri) => {
        const abs = resolvePlaylistUri(uri, playlistUrl);
        return abs ? `URI="${proxyPathFor(abs)}"` : m;
      });
    }
    const abs = resolvePlaylistUri(trimmed, playlistUrl);
    return abs ? proxyPathFor(abs) : line;
  }).join('\n');
}

app.get('/proxy/*', async (req, res) => {
  // Express 已解码过 splat 参数，直接使用
  let targetUrl = req.params[0];
  if (!targetUrl) return res.status(400).send('无效地址');
  // 仅当值看起来仍为百分号编码时才解码（非 Express 客户端的情况）
  if (!/^https?:\/\//i.test(targetUrl) && /%[0-9a-f]{2}/i.test(targetUrl)) {
    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch (_) {
      return res.status(400).send('无效地址');
    }
  }
  if (!/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).send('无效地址');
  }

  const rawTarget = targetUrl;
  targetUrl = normalizeUpstreamUrl(targetUrl);
  if (targetUrl !== rawTarget) {
    console.log('[代理] 已展开嵌套CDN代理', shortUrl(rawTarget), '->', shortUrl(targetUrl));
  }

  let referer;
  try {
    referer = new URL(targetUrl).origin + '/';
  } catch (_) {
    referer = getBaseUrl() + '/';
  }

  try {
    const isSegment = /\.(ts|m4s|mp4|aac)(\?|$)/i.test(targetUrl);
    const timeout = isSegment ? PROXY_TIMEOUT_MS : Math.min(PROXY_TIMEOUT_MS, 60000);
    const t0 = Date.now();
    const upstream = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      timeout,
      maxRedirects: 5,
      maxContentLength: 80 * 1024 * 1024,
      headers: {
        'User-Agent': UA,
        Referer: referer,
        Origin: referer.replace(/\/$/, ''),
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    const elapsed = Date.now() - t0;
    if (elapsed > 8000) {
      console.warn('[代理] 上游响应慢', { ms: elapsed, url: shortUrl(targetUrl), bytes: upstream.data && upstream.data.byteLength });
    }
    let ct = upstream.headers['content-type'] || 'application/octet-stream';
    if (/\.key(\?|$)/i.test(targetUrl)) ct = 'application/octet-stream';

    let body = Buffer.from(upstream.data);
    const looksM3u8 = /\.m3u8(\?|$)/i.test(targetUrl) || /mpegurl|m3u8/i.test(ct);
    if (looksM3u8) {
      const text = body.toString('utf8');
      if (text.includes('#EXTM3U')) {
        body = Buffer.from(rewriteM3u8(text, targetUrl), 'utf8');
        ct = 'application/vnd.apple.mpegurl';
      }
    }

    res.set('Content-Type', ct);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache');
    res.send(body);
  } catch (err) {
    const info = requestErrorInfo(err, targetUrl);
    console.error('[代理] 失败', info);
    const code = info.status || (info.timedOut ? 504 : 502);
    res.status(code).json({
      error: `代理错误: ${err.message}`,
      ...info,
    });
  }
});

// ---------- API 路由 ----------

// 站点配置（output/sites.json）
app.get('/api/sites', (req, res) => {
  res.json({ sites: getSiteConfigs() });
});

app.post('/api/sites', (req, res) => {
  const sites = req.body && req.body.sites;
  if (!Array.isArray(sites)) return res.status(400).json({ error: '需要站点数组' });
  // 规范化：去空白、补默认值、去重 url（保留首个）
  const seen = new Set();
  const clean = [];
  for (const s of sites) {
    if (!s || typeof s !== 'object') continue;
    const url = String(s.url || '').trim().replace(/\/+$/, '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    clean.push({
      url,
      name: String(s.name || '').trim() || url,
      todayPath: String(s.todayPath || '').trim(),
      enabled: s.enabled !== false,
    });
  }
  if (clean.length === 0) return res.status(400).json({ error: '至少需要一个站点' });
  try {
    saveSiteConfigs(clean);
    reloadSites();
    res.json({ ok: true, sites: getSiteConfigs() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 可播放且未命中排除词的视频 */
function getPlayableVideos() {
  return filterExcludedArticles(getIndex().filter((a) => a.video && a.video.url));
}

// 视频列表（?q= 本地搜索；仅返回已有视频地址的条目）
// 支持分页 ?page=1&size=60（不传 page 则返回全量，向后兼容）
app.get('/api/videos', (req, res) => {
  const all = getPlayableVideos();
  const q = (req.query.q || '').trim().toLowerCase();
  const filtered = q
    ? all.filter((a) => (a.title || '').toLowerCase().includes(q) || (a.id || '').includes(q))
    : all;

  const page = parseInt(req.query.page, 10);
  const size = Math.min(parseInt(req.query.size, 10) || 60, 200);

  if (page && page > 0) {
    const start = (page - 1) * size;
    const items = filtered.slice(start, start + size).map(toVideoItem);
    res.json({ total: filtered.length, items, page, size, hasMore: start + size < filtered.length });
  } else {
    const items = filtered.map(toVideoItem);
    res.json({ total: items.length, items });
  }
});

// 展示用标签列表：过滤站点品牌、>=5 条才显示、按视频数排序；>100 条固定并持久化。
// 结果缓存：index 未变时直接返回缓存，避免重复计算
app.get('/api/tags', (req, res) => {
  try {
    if (!tagCache) {
      tagCache = refreshTagList();
    }
    res.json({
      tags: tagCache.tags,
      fixedTags: tagCache.fixedTags,
      newlyFixed: tagCache.newlyFixed,
      total: tagCache.tags.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 封面：远程抓取后内存解密再返回，不落盘
/** 根据文件头判断图片类型 */
function sniffImage(buf) {
  if (!buf || buf.length < 4) return { valid: false, contentType: 'application/octet-stream', ext: 'bin' };
  if (buf[0] === 0xFF && buf[1] === 0xD8) return { valid: true, contentType: 'image/jpeg', ext: 'jpg' };
  if (buf[0] === 0x89 && buf[1] === 0x50) return { valid: true, contentType: 'image/png', ext: 'png' };
  if (buf[0] === 0x47 && buf[1] === 0x49) return { valid: true, contentType: 'image/gif', ext: 'gif' };
  if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
    return { valid: true, contentType: 'image/webp', ext: 'webp' };
  }
  return { valid: false, contentType: 'application/octet-stream', ext: 'bin' };
}

/** 文章请求 Referer：优先 siteUrl，其次归档 URL origin */
function refererFor(item) {
  return item.siteUrl || (item.url ? new URL(item.url).origin : getBaseUrl());
}

/** 解密脚本优先站点列表（当前条目站 + 已启用站） */
function decryptSiteCandidates(item) {
  const list = [];
  if (item && item.siteUrl) list.push(item.siteUrl);
  for (const s of getSites()) list.push(s);
  const base = getBaseUrl();
  if (base) list.push(base);
  return list;
}

function mediaCachePath(kind, id, index) {
  const safeId = String(id || '').replace(/[^\w.-]/g, '_');
  const name = kind === 'cover'
    ? `cover-${safeId}`
    : `img-${safeId}-${Number(index) || 0}`;
  return path.join(MEDIA_CACHE_DIR, name);
}

function readMediaCache(kind, id, index) {
  try {
    const base = mediaCachePath(kind, id, index);
    const metaPath = `${base}.json`;
    if (!fs.existsSync(metaPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const binPath = meta.file || `${base}.${meta.ext || 'bin'}`;
    if (!fs.existsSync(binPath)) return null;
    return {
      buf: fs.readFileSync(binPath),
      contentType: meta.contentType || 'application/octet-stream',
    };
  } catch (_) {
    return null;
  }
}

function writeMediaCache(kind, id, index, buf, contentType) {
  try {
    fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true });
    const sniff = sniffImage(buf);
    const ext = sniff.ext || 'bin';
    const base = mediaCachePath(kind, id, index);
    const binPath = `${base}.${ext}`;
    fs.writeFileSync(binPath, buf);
    fs.writeFileSync(`${base}.json`, JSON.stringify({
      contentType: contentType || sniff.contentType,
      ext,
      file: binPath,
      updatedAt: new Date().toISOString(),
    }));
  } catch (e) {
    console.warn('[媒体缓存] 写入失败:', e.message);
  }
}

/** 拉取并解密上游图片；优先读本地缓存 */
async function fetchDecryptedImage(item, imageUrl, cacheKey) {
  const cached = readMediaCache(cacheKey.kind, cacheKey.id, cacheKey.index);
  if (cached) return cached;

  const refererSite = refererFor(item);
  const upstream = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxRedirects: 5,
    headers: { 'User-Agent': UA, Referer: refererSite + '/' },
  });
  const raw = Buffer.from(upstream.data);
  let buf = raw;
  let sniff = sniffImage(buf);
  if (!sniff.valid) {
    const sites = decryptSiteCandidates(item);
    try {
      buf = await decryptBuffer(raw, sites);
    } catch (decErr) {
      await resetDecrypt();
      try {
        buf = await decryptBuffer(raw, sites);
      } catch (e2) {
        throw new Error(`图片解密失败: ${e2.message}`);
      }
    }
    sniff = sniffImage(buf);
    if (!sniff.valid) {
      throw new Error('解密后仍不是有效图片');
    }
  }

  writeMediaCache(cacheKey.kind, cacheKey.id, cacheKey.index, buf, sniff.contentType);
  return { buf, contentType: sniff.contentType };
}

app.get('/api/cover/:id', async (req, res) => {
  const found = findById(req.params.id);
  const item = found && found.item;
  if (!item || !item.coverUrl) return res.status(404).send('无封面');
  try {
    const { buf, contentType } = await fetchDecryptedImage(item, item.coverUrl, {
      kind: 'cover',
      id: item.id,
      index: 0,
    });
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    console.error('[封面]', req.params.id, err.message);
    const code = err.response && err.response.status ? err.response.status : 502;
    res.status(code).send('封面错误: ' + err.message);
  }
});

/** 详情配图代理（与封面相同解密逻辑） */
app.get('/api/image/:id/:index', async (req, res) => {
  const found = findById(req.params.id);
  const item = found && found.item;
  const images = (item && Array.isArray(item.images)) ? item.images : [];
  const idx = Number(req.params.index);
  const imageUrl = images[idx];
  if (!imageUrl) return res.status(404).send('无图片');
  try {
    const { buf, contentType } = await fetchDecryptedImage(item, imageUrl, {
      kind: 'image',
      id: item.id,
      index: idx,
    });
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    console.error('[图片]', req.params.id, idx, err.message);
    const code = err.response && err.response.status ? err.response.status : 502;
    res.status(code).send('图片错误: ' + err.message);
  }
});

// 刷新单条 m3u8（auth_key 会过期），并更新标签/分类/正文/配图/全部视频
app.get('/api/refresh/:id', async (req, res) => {
  const found = findById(req.params.id);
  if (!found) return res.status(404).json({ error: '未找到' });
  const target = found.item;

  // 命中缓存直接返回（2 分钟 TTL，避免短时间重复抓取上游）
  const cached = getCachedRefresh(req.params.id);
  if (cached) {
    return res.json(cached);
  }

  try {
    const refererSite = refererFor(target);
    const r = await axios.get(target.url, {
      timeout: REFRESH_TIMEOUT_MS,
      maxRedirects: 5,
      headers: { 'User-Agent': UA, Referer: refererSite + '/' },
    });
    const detail = parseDetailPage(r.data);
    const patch = {};

    const rawVideos = (detail.videos && detail.videos.length)
      ? detail.videos
      : (detail.video ? [detail.video] : []);
    if (rawVideos.length) {
      // 并行解析所有播放器地址（原先逐个串行，多视频时耗时翻倍）
      const resolvedVideos = (await Promise.all(rawVideos.map(async (v) => {
        const entry = { ...v };
        if (entry.needsResolve) {
          const resolved = await resolvePlayerUrl(refererSite, entry.url, (m) => console.log(m));
          if (resolved) {
            entry.url = resolved;
            entry.needsResolve = false;
            return entry;
          }
          return null;
        }
        return entry.url ? entry : null;
      }))).filter(Boolean);

      if (resolvedVideos.length) {
        target.videos = resolvedVideos;
        target.video = resolvedVideos[0];
        patch.videos = resolvedVideos;
        patch.video = resolvedVideos[0];
      }
    }

    if (detail.tags && detail.tags.length) {
      target.tags = detail.tags;
      patch.tags = detail.tags;
    }
    if (detail.category) {
      target.category = detail.category;
      patch.category = detail.category;
    }
    if (detail.datePublished) {
      target.datePublished = detail.datePublished;
      patch.datePublished = detail.datePublished;
    }
    if (detail.dateModified) {
      target.dateModified = detail.dateModified;
      patch.dateModified = detail.dateModified;
    }
    if (detail.coverUrl) {
      target.coverUrl = detail.coverUrl;
      patch.coverUrl = detail.coverUrl;
    }
    if (detail.content) {
      target.content = detail.content;
      patch.content = detail.content;
    }
    if (detail.images && detail.images.length) {
      target.images = detail.images;
      patch.images = detail.images;
    }
    if (detail.blocks && detail.blocks.length) {
      target.blocks = detail.blocks;
      patch.blocks = detail.blocks;
    }

    if (Object.keys(patch).length) {
      if (found.source === 'index') {
        // 异步写盘不阻塞响应（内存缓存已即时更新）
        writeIndexAsync(getIndex());
        // 收藏快照存在时同步更新
        patchFavoriteById(target.id, patch);
      } else {
        writeFavorites(getFavorites());
      }
    }

    const responseData = {
      ok: true,
      video: target.video,
      videos: target.videos || (target.video ? [target.video] : []),
      tags: target.tags || [],
      category: target.category || null,
      datePublished: target.datePublished || null,
      content: target.content || '',
      images: target.images || [],
      blocks: target.blocks || [],
    };

    // 缓存刷新结果
    setCachedRefresh(req.params.id, responseData);
    res.json(responseData);
  } catch (err) {
    const info = requestErrorInfo(err, target.url);
    console.error('[刷新]', req.params.id, info);
    res.status(502).json({ error: err.message, ...info });
  }
});

// ---------- 收藏（独立于 index，爬取不会清空） ----------

app.get('/api/favorites', (req, res) => {
  const items = filterExcludedArticles(getFavorites()).map(toVideoItem);
  res.json({ total: items.length, items, ids: items.map((a) => a.id) });
});

// 下载收藏（json / txt / m3u8）
app.get('/api/favorites/download', (req, res) => {
  const favs = getFavorites();
  const format = String(req.query.format || 'json').toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'm3u8' || format === 'txt') {
    const lines = favs.map((a) => {
      const title = (a.title || a.id || '').replace(/\r?\n/g, ' ');
      const url = (a.video && a.video.url) || '';
      return `# ${title}\n${url}`;
    }).join('\n\n');
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="favorites-${stamp}.txt"`);
    return res.send(lines || '# empty\n');
  }
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="favorites-${stamp}.json"`);
  res.send(JSON.stringify(favs, null, 2));
});

app.post('/api/favorites', (req, res) => {
  const body = req.body || {};
  if (!body.id) return res.status(400).json({ error: '需要条目 ID' });

  const found = findById(body.id);
  const snapshot = toVideoItem(found ? found.item : body);
  if (!snapshot.id) return res.status(400).json({ error: '需要条目 ID' });

  const favs = getFavorites();
  const existing = favs.find((a) => a.id === snapshot.id);
  if (existing) {
    return res.json({ ok: true, already: true, total: favs.length, item: toVideoItem(existing) });
  }
  const entry = { ...snapshot, favoritedAt: new Date().toISOString() };
  favs.unshift(entry);
  writeFavorites(favs);
  res.json({ ok: true, total: favs.length, item: toVideoItem(entry) });
});

// 批量清空收藏（替代逐条 DELETE，一次请求完成）
app.delete('/api/favorites', (req, res) => {
  writeFavorites([]);
  res.json({ ok: true, total: 0 });
});

app.delete('/api/favorites/:id', (req, res) => {
  const favs = getFavorites();
  const next = favs.filter((a) => a.id !== req.params.id);
  if (next.length === favs.length) return res.status(404).json({ error: '未找到' });
  writeFavorites(next);
  res.json({ ok: true, total: next.length });
});

// ---------- SSE：同步进度推送（替代前端 2.5s 轮询） ----------
app.get('/api/sync-events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const onBatch = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  syncEmitter.on('batch', onBatch);

  // 保活心跳，防止代理/浏览器超时断开
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    syncEmitter.off('batch', onBatch);
  });
});

// 在线搜索并入库
app.post('/api/search-online', async (req, res) => {
  const keyword = (req.body && req.body.keyword) || '';
  if (!keyword) return res.status(400).json({ error: '需要关键词' });
  const searchPages = parseInt(req.body && req.body.pages, 10) || 1;
  const logs = [];
  try {
    const result = await crawl({
      search: keyword,
      searchPages,
      outDir: OUT_DIR,
      jsonPath: JSON_PATH,
      concurrency: 15,
      pushEvery: 5,
      onBatch: () => { onIndexChanged(); },
      onLog: (m) => logs.push(m),
    });
    // 爬虫已重写 index.json；清除 mtime 缓存使 getIndex 重新加载
    onIndexChanged();
    const all = getPlayableVideos();
    const qlc = keyword.toLowerCase();
    const items = all
      .filter((a) => (a.title || '').toLowerCase().includes(qlc) || (a.id || '').includes(qlc))
      .slice(0, 100)
      .map(toVideoItem);
    res.json({ ok: true, added: result.added, total: result.total, matched: items.length, items, logs });
  } catch (err) {
    res.status(500).json({ error: err.message, logs });
  }
});

// 多标签顺序同步
app.post('/api/sync-tags', async (req, res) => {
  const tags = (req.body && req.body.tags) || [];
  if (!Array.isArray(tags) || tags.length === 0) return res.status(400).json({ error: '需要标签数组' });
  const searchPages = parseInt(req.body && req.body.pages, 10) || 1;
  const logs = [`开始同步 ${tags.length} 个标签: ${tags.join(', ')}`];
  try {
    // 抓取前记录基线数量
    const existingIndex = loadIndex(JSON_PATH);
    const baselineCount = existingIndex.length;

    // 标签搜索顺序执行，避免对 index.json 的竞态条件
    let totalAdded = 0;
    for (const tag of tags) {
      const tagLogs = [];
      try {
        tagLogs.push(`[${tag}] 开始搜索...`);
        const result = await crawl({
          search: tag,
          searchPages,
          replace: false,
          limit: 50,
          outDir: OUT_DIR,
          jsonPath: JSON_PATH,
          concurrency: 15,
          pushEvery: 5,
          onBatch: () => { onIndexChanged(); },
          onLog: (m) => tagLogs.push(m),
        });
        totalAdded += result.added;
        tagLogs.push(`[${tag}] 完成: +${result.added} 条`);
      } catch (err) {
        tagLogs.push(`[${tag}] 失败: ${err.message}`);
      }
      logs.push(...tagLogs);
    }

    // 加载最终结果并计算实际新增数量
    onIndexChanged();
    const currentIndex = getIndex();
    const actualAdded = currentIndex.length - baselineCount;
    const withVideo = currentIndex.filter((a) => a.video && a.video.url).length;
    logs.push(`同步完成: +${actualAdded} 新增，共 ${currentIndex.length} 条 (${withVideo} 有视频)`);

    res.json({ ok: true, added: actualAdded, updated: 0, total: currentIndex.length, logs });
  } catch (err) {
    res.status(500).json({ error: err.message, logs });
  }
});

// 关键词同步：进度记在 keyword-progress.json；crawl 写索引用互斥锁串行化
const KW_PROGRESS_PATH = path.join(OUT_DIR, 'keyword-progress.json');

function loadKeywordProgress() {
  try {
    return JSON.parse(fs.readFileSync(KW_PROGRESS_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveKeywordProgress(progress) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(KW_PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf8');
}

// 简单异步互斥锁：串行化对 index.json 的读-改-写操作
let _indexMutex = Promise.resolve();
function withIndexLock(task) {
  const run = _indexMutex.then(() => task());
  _indexMutex = run.catch(() => {});
  return run;
}

app.post('/api/sync-keywords', async (req, res) => {
  const keywords = (req.body && req.body.keywords) || [];
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ error: '需要关键词数组' });
  }

  // 加载进度（keyword -> lastPage）
  const progress = loadKeywordProgress();
  const logs = [`开始关键词同步: ${keywords.length} 个关键词`];
  const baselineCount = getIndex().length;

  // 串行执行每个关键词的 crawl（避免 index.json 竞态），
  // 但每个关键词独立处理错误，单个失败不影响后续
  const keywordResults = [];
  for (const kw of keywords) {
    const kwLogs = [`[${kw}] 开始搜索...`];

    // 计算下一页（增量同步）
    const lastPage = progress[kw] || 0;
    const nextPage = lastPage + 1;

    try {
      // 用互斥锁保护 crawl 对 index.json 的读-改-写
      const result = await withIndexLock(() => crawl({
        search: kw,
        searchPages: 1,
        searchPageStart: nextPage,
        replace: false,
        limit: 50,
        outDir: OUT_DIR,
        jsonPath: JSON_PATH,
        concurrency: 15,
        pushEvery: 5,
        onBatch: () => { onIndexChanged(); },
        onLog: (m) => kwLogs.push(m),
      }));

      const crawled = result.crawled || 0;
      const added = result.added || 0;
      const exhausted = crawled === 0;

      // 仅当抓取到数据时才推进页码（耗尽时保持当前页，避免空翻页）
      if (!exhausted) {
        progress[kw] = nextPage;
      }

      kwLogs.push(`[${kw}] 完成: 抓取 ${crawled} 条, 新增 ${added} 条${exhausted ? ' (已耗尽)' : ''}`);

      keywordResults.push({
        keyword: kw,
        added,
        total: result.total || 0,
        crawled,
        exhausted,
        page: exhausted ? lastPage : nextPage,
        error: null,
        logs: kwLogs,
      });
    } catch (err) {
      kwLogs.push(`[${kw}] 失败: ${err.message}`);
      keywordResults.push({
        keyword: kw,
        added: 0,
        total: 0,
        crawled: 0,
        exhausted: false,
        page: lastPage,
        error: err.message,
        logs: kwLogs,
      });
    }
  }

  // 保存进度
  saveKeywordProgress(progress);

  // 刷新索引缓存与固定标签
  onIndexChanged();
  const currentIndex = getIndex();
  const totalAdded = currentIndex.length - baselineCount;

  // 汇总日志
  for (const kr of keywordResults) {
    logs.push(...kr.logs);
  }
  logs.push(`关键词同步完成: 共新增 ${totalAdded} 条，索引总计 ${currentIndex.length} 条`);

  res.json({
    ok: true,
    results: keywordResults,
    totalAdded,
    total: currentIndex.length,
    logs,
  });
});

// 爬取耗时预估（同步弹窗倒计时用）
app.get('/api/crawl-estimate', (req, res) => {
  const mode = String(req.query.mode || 'sync');
  const concurrency = 3;
  let eta;
  if (mode === 'startup') {
    eta = estimateCrawlTime({ minPerSite: 50, concurrency });
  } else if (mode === 'tags') {
    const n = Math.max(1, parseInt(req.query.tags, 10) || 1);
    eta = estimateCrawlTime({
      search: 'tag',
      searchPages: parseInt(req.query.pages, 10) || 1,
      concurrency,
    });
    eta.estimateSec = Math.ceil(eta.estimateSec * n * 0.85);
    eta.estimateMs = eta.estimateSec * 1000;
    eta.estimateLabel = formatDuration(eta.estimateSec);
    eta.modeLabel = `${n} 个标签同步`;
  } else {
    const pageStart = parseInt(req.query.pageStart, 10) || 1;
    const pageEnd = parseInt(req.query.pageEnd, 10) || pageStart;
    eta = estimateCrawlTime({ pageStart, pageEnd, concurrency });
  }
  res.json({ ok: true, ...eta });
});

// 列表页爬取
app.post('/api/crawl', async (req, res) => {
  const pageStart = parseInt(req.body && req.body.pageStart, 10) || 1;
  const pageEnd = parseInt(req.body && req.body.pageEnd, 10) || pageStart;
  const logs = [];
  try {
    const result = await crawl({
      pageStart,
      pageEnd,
      outDir: OUT_DIR,
      jsonPath: JSON_PATH,
      concurrency: 15,
      pushEvery: 5,
      onBatch: () => { onIndexChanged(); },
      onLog: (m) => logs.push(m),
    });
    onIndexChanged();
    res.json({ ok: true, added: result.added, total: result.total, logs });
  } catch (err) {
    res.status(500).json({ error: err.message, logs });
  }
});

// SPA 兜底
app.get('*', (req, res) => {
  res.sendFile(path.join(BUILD_DIR, 'index.html'));
});

// 统一错误处理中间件：捕获所有未处理的异常，统一返回 JSON
app.use((err, req, res, _next) => {
  console.error('[未处理错误]', err.message);
  const status = err.status || (err.response && err.response.status) || 500;
  res.status(status).json({ error: err.message || '内部错误' });
});

(async () => {
  const port = await findAvailablePort(BASE_PORT);
  fs.writeFileSync(PORT_FILE, String(port));

  app.listen(port, '0.0.0.0', () => {
    const lanIps = getLocalIPv4();
    console.log('');
    console.log('  学习资料已启动');
    console.log(`  本机  http://localhost:${port}`);
    for (const ip of lanIps) {
      console.log(`  局域网  http://${ip}:${port}`);
    }
    if (port !== BASE_PORT) {
      console.log(`  （端口 ${BASE_PORT} 占用，已改用 ${port}）`);
    }
    console.log(`  索引 ${getIndex().length} 条 · 收藏 ${getFavorites().length} 条`);
    console.log('');

    // 预热图片解密脚本（多站回退 / 本地缓存），避免首张封面才失败
    ensureDecryptReady(getSites())
      .then(() => console.log('  图片解密脚本就绪'))
      .catch((e) => console.warn('  图片解密脚本未就绪:', e.message));

    // 启动后静默后台爬取：先估时，控制台倒计时
    (async () => {
      const t0 = Date.now();
      const eta = estimateCrawlTime({ minPerSite: 50, concurrency: 15 });
      console.log(`  预计同步约 ${eta.estimateLabel}（${eta.rangeLabel}），约 ${eta.expectedArticles} 条`);
      const stopCountdown = startConsoleCountdown(eta.estimateSec, '  后台同步中…');
      try {
        await crawl({
          minPerSite: 50,
          replace: true,
          outDir: OUT_DIR,
          jsonPath: JSON_PATH,
          concurrency: 15,
          pushEvery: 5,
          onBatch: () => { onIndexChanged(); },
          onLog: () => {},
        });
        onIndexChanged();
        stopCountdown();
        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`  同步完成，共 ${getIndex().length} 条，耗时 ${sec}s（预估 ${eta.estimateSec}s）\n`);
      } catch (e) {
        stopCountdown();
        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        console.warn(`  同步失败（耗时 ${sec}s）:`, e.message);
      }
    })();
  });
})();
