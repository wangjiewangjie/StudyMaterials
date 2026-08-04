// server.js
// Local web server: serves the React UI + APIs + CORS proxy for HLS streaming.
//
// Run:  node server.js            (default http://localhost:3000)
//       set PORT=8080 && node server.js
// 端口被占用时会自动递增切换，并将实际端口写入 .server-port 供前端读取

const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');
const axios = require('axios');
const { crawl, loadIndex, parseDetailPage, resolvePlayerUrl, UA,
  loadSiteConfigs, saveSiteConfigs, reloadSites, getSiteConfigs, getBaseUrl } = require('./crawler');
const { decryptBuffer } = require('./image-decrypt');
const { normalizeUpstreamUrl, unwrapCdnProxyUrl } = require('./lib/hls-url');
const { buildDisplayTags, defaultFixedPath } = require('./lib/tags');

const BASE_PORT = parseInt(process.env.PORT, 10) || 3000;
const PORT_FILE = path.join(__dirname, '.server-port');

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

// Serve React build
app.use(express.static(BUILD_DIR));

// In-memory index cache — avoids re-reading/parsing index.json on every request.
let indexCache = null;
let indexMtimeMs = -1;
let favCache = null;
let favMtimeMs = -1;

function getIndex() {
  try {
    const mtime = fs.statSync(JSON_PATH).mtimeMs;
    if (indexCache && mtime === indexMtimeMs) return indexCache;
    indexCache = loadIndex(JSON_PATH);
    indexMtimeMs = mtime;
    return indexCache;
  } catch (_) {
    indexCache = [];
    indexMtimeMs = -1;
    return indexCache;
  }
}

function writeIndex(articles) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(articles, null, 2), 'utf8');
  indexCache = articles;
  try {
    indexMtimeMs = fs.statSync(JSON_PATH).mtimeMs;
  } catch (_) {
    indexMtimeMs = Date.now();
  }
}

// Force getIndex() to reload from disk on next call (after crawl rewrites index.json).
function bustIndexCache() {
  indexCache = null;
  indexMtimeMs = -1;
}

/** 根据当前索引生成展示标签，并将超阈值标签写入 fixed-tags.json */
function refreshTagList() {
  return buildDisplayTags(getIndex(), getSiteConfigs(), {
    fixedPath: FIXED_TAGS_PATH,
    persist: true,
  });
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
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(FAV_PATH, JSON.stringify(list, null, 2), 'utf8');
  favCache = list;
  try {
    favMtimeMs = fs.statSync(FAV_PATH).mtimeMs;
  } catch (_) {
    favMtimeMs = Date.now();
  }
}

function toVideoItem(a) {
  return {
    id: a.id,
    title: a.title || '',
    url: a.url,
    siteUrl: a.siteUrl || null,
    coverUrl: a.coverUrl || null,
    video: a.video || null,
    tags: a.tags || [],
    category: a.category || null,
    datePublished: a.datePublished || null,
    favoritedAt: a.favoritedAt || null,
  };
}

/** Look up by id: index first (freshest crawl), then favorites (survives crawl wipe). */
function findById(id) {
  const index = getIndex();
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

// ---------- CORS proxy for HLS (m3u8 / TS / AES key) ----------
// Browsers block cross-origin HLS requests, so we proxy through localhost.
// CDNs require a Referer matching the target origin, otherwise 403.
//
// Do NOT decodeURIComponent(req.params[0]) again — Express already decodes the
// path once. A second decode corrupts auth_key values that contain %XX sequences
// (e.g. %3D / %2F), which yields 403 or wrong bytes and looks like "cannot decode".

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

// Rewrite m3u8 so relative segment / AES-key / child-playlist URIs become
// same-origin /proxy/... paths. Needed for Safari native HLS (no custom loader)
// and as a safety net when response.url restoration is missed.
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
  // Express has already decoded the splat once — use as-is.
  let targetUrl = req.params[0];
  if (!targetUrl) return res.status(400).send('bad url');
  // Only decode if the value still looks percent-encoded (non-Express clients).
  if (!/^https?:\/\//i.test(targetUrl) && /%[0-9a-f]{2}/i.test(targetUrl)) {
    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch (_) {
      return res.status(400).send('bad url');
    }
  }
  if (!/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).send('invalid url');
  }

  const rawTarget = targetUrl;
  targetUrl = normalizeUpstreamUrl(targetUrl);
  if (targetUrl !== rawTarget) {
    console.log('[proxy] unwrapped nested CDN proxy', shortUrl(rawTarget), '->', shortUrl(targetUrl));
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
      console.warn('[proxy] slow upstream', { ms: elapsed, url: shortUrl(targetUrl), bytes: upstream.data && upstream.data.byteLength });
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
    console.error('[proxy] failed', info);
    const code = info.status || (info.timedOut ? 504 : 502);
    res.status(code).json({
      error: `proxy error: ${err.message}`,
      ...info,
    });
  }
});

// ---------- API ----------

// 站点配置：读取/保存。配置存于 output/sites.json，crawler 每次 crawl 前重载。
app.get('/api/sites', (req, res) => {
  res.json({ sites: getSiteConfigs() });
});

app.post('/api/sites', (req, res) => {
  const sites = req.body && req.body.sites;
  if (!Array.isArray(sites)) return res.status(400).json({ error: 'sites array required' });
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

// List all scraped items (optional ?q= for local search)
// By default returns ALL crawled items so the user can see what was collected
// from every site, even when the player endpoint is broken and the video URL
// couldn't be resolved (e.g. d1ve/cloudfront mirror of 91sp91).
app.get('/api/videos', (req, res) => {
  const all = getIndex().filter((a) => a.video && a.video.url);
  const q = (req.query.q || '').trim().toLowerCase();
  const result = q
    ? all.filter((a) => (a.title || '').toLowerCase().includes(q) || (a.id || '').includes(q))
    : all;
  const items = result.map(toVideoItem);
  res.json({ total: items.length, items });
});

// 展示用标签列表：过滤站点品牌、>=5 条才显示、按视频数排序；>100 条固定并持久化。
app.get('/api/tags', (req, res) => {
  try {
    const { tags, fixedTags, newlyFixed } = refreshTagList();
    res.json({
      tags,
      fixedTags,
      newlyFixed,
      total: tags.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve a cover image by video ID.
// Covers are NOT stored on disk: the server fetches the remote coverUrl, decrypts
// it in memory (source serves AES-encrypted images), and streams the bytes to the
// client. Nothing sensitive is ever written to the local filesystem.

// Sniff image magic bytes in one pass — returns { valid, contentType }.
// Replaces the former isValidImage() + imageContentType() pair.
function sniffImage(buf) {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return { valid: true, contentType: 'image/jpeg' };
  if (buf[0] === 0x89 && buf[1] === 0x50) return { valid: true, contentType: 'image/png' };
  if (buf[0] === 0x47 && buf[1] === 0x49) return { valid: true, contentType: 'image/gif' };
  if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { valid: true, contentType: 'image/webp' };
  return { valid: false, contentType: 'application/octet-stream' };
}

// Referer origin for a fetched article: prefer its source site, else derive
// from its archive URL, else fall back to the first configured site.
function refererFor(item) {
  return item.siteUrl || (item.url ? new URL(item.url).origin : getBaseUrl());
}
app.get('/api/cover/:id', async (req, res) => {
  const found = findById(req.params.id);
  const item = found && found.item;
  if (!item || !item.coverUrl) return res.status(404).send('no cover');
  try {
    const refererSite = refererFor(item);
    const upstream = await axios.get(item.coverUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': UA, Referer: refererSite + '/' },
    });
    let buf = Buffer.from(upstream.data);
    if (!sniffImage(buf).valid) {
      // Source serves encrypted images; decrypt in memory only.
      buf = await decryptBuffer(buf);
    }
    res.set('Content-Type', sniffImage(buf).contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    const code = err.response && err.response.status ? err.response.status : 502;
    res.status(code).send('cover error: ' + err.message);
  }
});

// Refresh a single video's m3u8 URL (stored URLs contain expiring auth_key).
// Also refreshes tags/category since the detail page is re-fetched.
// Works for items in index.json or favorites.json (favorites survive crawl wipe).
app.get('/api/refresh/:id', async (req, res) => {
  const found = findById(req.params.id);
  if (!found) return res.status(404).json({ error: 'not found' });
  const target = found.item;
  try {
    const refererSite = refererFor(target);
    const r = await axios.get(target.url, {
      timeout: REFRESH_TIMEOUT_MS,
      maxRedirects: 5,
      headers: { 'User-Agent': UA, Referer: refererSite + '/' },
    });
    const detail = parseDetailPage(r.data);
    const patch = {};
    if (detail.video && detail.video.url) {
      if (detail.video.needsResolve) {
        const resolved = await resolvePlayerUrl(refererSite, detail.video.url, (m) => console.log(m));
        if (resolved) {
          detail.video.url = resolved;
          detail.video.needsResolve = false;
        } else {
          detail.video = null;
        }
      }
      if (detail.video) {
        target.video = detail.video;
        patch.video = detail.video;
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

    if (Object.keys(patch).length) {
      if (found.source === 'index') {
        writeIndex(getIndex());
        // Keep the favorited snapshot in sync when present.
        patchFavoriteById(target.id, patch);
      } else {
        writeFavorites(getFavorites());
      }
    }
    res.json({ ok: true, video: target.video, tags: target.tags || [], category: target.category || null, datePublished: target.datePublished || null });
  } catch (err) {
    const info = requestErrorInfo(err, target.url);
    console.error('[refresh]', req.params.id, info);
    res.status(502).json({ error: err.message, ...info });
  }
});

// ---------- Favorites (separate from index.json; never wiped by crawl) ----------

app.get('/api/favorites', (req, res) => {
  const items = getFavorites().map(toVideoItem);
  res.json({ total: items.length, items, ids: items.map((a) => a.id) });
});

// Download favorites as JSON or a plain-text m3u8 list for external downloaders.
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
  if (!body.id) return res.status(400).json({ error: 'item id required' });

  const found = findById(body.id);
  const snapshot = toVideoItem(found ? found.item : body);
  if (!snapshot.id) return res.status(400).json({ error: 'item id required' });

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

app.delete('/api/favorites/:id', (req, res) => {
  const favs = getFavorites();
  const next = favs.filter((a) => a.id !== req.params.id);
  if (next.length === favs.length) return res.status(404).json({ error: 'not found' });
  writeFavorites(next);
  res.json({ ok: true, total: next.length });
});

// Online search: crawl /search/<keyword>/ and return matching results.
app.post('/api/search-online', async (req, res) => {
  const keyword = (req.body && req.body.keyword) || '';
  if (!keyword) return res.status(400).json({ error: 'keyword required' });
  const searchPages = parseInt(req.body && req.body.pages, 10) || 1;
  const logs = [];
  try {
    const result = await crawl({
      search: keyword,
      searchPages,
      outDir: OUT_DIR,
      jsonPath: JSON_PATH,
      concurrency: 3,
      onLog: (m) => logs.push(m),
    });
    // Crawl rewrote index.json; bust the mtime cache so getIndex reloads.
    bustIndexCache();
    refreshTagList();
    const all = getIndex().filter((a) => a.video && a.video.url);
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

// Tag sync: crawl multiple tags sequentially, merge results into index.
app.post('/api/sync-tags', async (req, res) => {
  const tags = (req.body && req.body.tags) || [];
  if (!Array.isArray(tags) || tags.length === 0) return res.status(400).json({ error: 'tags array required' });
  const searchPages = parseInt(req.body && req.body.pages, 10) || 1;
  const logs = [`开始同步 ${tags.length} 个标签: ${tags.join(', ')}`];
  try {
    // Capture baseline count before crawling
    const existingIndex = loadIndex(JSON_PATH);
    const baselineCount = existingIndex.length;

    // Run tag searches sequentially to avoid race condition on index.json
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
          concurrency: 3,
          onLog: (m) => tagLogs.push(m),
        });
        totalAdded += result.added;
        tagLogs.push(`[${tag}] 完成: +${result.added} 条`);
      } catch (err) {
        tagLogs.push(`[${tag}] 失败: ${err.message}`);
      }
      logs.push(...tagLogs);
    }

    // Load final result and calculate actual additions
    bustIndexCache();
    refreshTagList();
    const currentIndex = loadIndex(JSON_PATH);
    const actualAdded = currentIndex.length - baselineCount;
    const withVideo = currentIndex.filter((a) => a.video && a.video.url).length;
    logs.push(`同步完成: +${actualAdded} 新增，共 ${currentIndex.length} 条 (${withVideo} 有视频)`);

    res.json({ ok: true, added: actualAdded, updated: 0, total: currentIndex.length, logs });
  } catch (err) {
    res.status(500).json({ error: err.message, logs });
  }
});

// 关键词并行同步：多个关键词同时执行，每个独立管理状态/进度/错误。
// 每个关键词每次最多抓取 50 条，自动跳过已抓取数据，支持增量翻页。
// 进度文件 output/keyword-progress.json 记录每个关键词已抓取到的页码。
// 注意：crawl() 内部会读-改-写 index.json，多个关键词并行会导致竞态，
// 故用互斥锁串行化 crawl 调用，网络抓取阶段仍可重叠（crawl 内部并发拉取详情页）。
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
    return res.status(400).json({ error: 'keywords array required' });
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
        concurrency: 3,
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
  bustIndexCache();
  refreshTagList();
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

// Crawl list pages (for the "crawl more" button).
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
      concurrency: 3,
      onLog: (m) => logs.push(m),
    });
    bustIndexCache();
    refreshTagList();
    res.json({ ok: true, added: result.added, total: result.total, logs });
  } catch (err) {
    res.status(500).json({ error: err.message, logs });
  }
});

// SPA fallback: serve React index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(BUILD_DIR, 'index.html'));
});

(async () => {
  const port = await findAvailablePort(BASE_PORT);
  fs.writeFileSync(PORT_FILE, String(port));

  app.listen(port, () => {
    console.log(`学习资料 - 服务器已启动: http://localhost:${port}`);
    if (port !== BASE_PORT) {
      console.log(`端口 ${BASE_PORT} 已被占用，自动切换到 ${port}`);
    }
    console.log(`已加载 ${getIndex().length} 条记录，收藏 ${getFavorites().length} 条`);

    // Startup: crawl minimum 50 articles per site
    (async () => {
      try {
        console.log('启动爬取：各站点最少50条...');
        await crawl({
          minPerSite: 50,
          replace: true,
          outDir: OUT_DIR,
          jsonPath: JSON_PATH,
          concurrency: 3,
          onLog: (m) => console.log(m),
        });
        bustIndexCache();
        refreshTagList();
        console.log(`启动爬取完成，当前共 ${getIndex().length} 条记录`);
      } catch (e) {
        console.warn('启动爬取失败:', e.message);
      }
    })();
  });
})();
