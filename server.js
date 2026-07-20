// server.js
// Local web server: serves the React UI + APIs + CORS proxy for HLS streaming.
//
// Run:  node server.js            (default http://localhost:3000)
//       set PORT=8080 && node server.js

const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { crawl, loadIndex, parseDetailPage, resolvePlayerUrl, BASE_URL } = require('./crawler');
const { decryptBuffer } = require('./imageDecrypt');

const PORT = process.env.PORT || 3000;
const OUT_DIR = path.resolve(__dirname, 'output');
const JSON_PATH = path.join(OUT_DIR, 'index.json');
const FAV_PATH = path.join(OUT_DIR, 'favorites.json');
const BUILD_DIR = path.join(__dirname, 'public', 'build');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

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
  const fromIndex = getIndex().find((a) => a.id === id);
  if (fromIndex) return { item: fromIndex, source: 'index' };
  const fromFav = getFavorites().find((a) => a.id === id);
  if (fromFav) return { item: fromFav, source: 'favorites' };
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
app.get('/proxy/*', async (req, res) => {
  let targetUrl;
  try {
    targetUrl = decodeURIComponent(req.params[0]);
  } catch (_) {
    return res.status(400).send('bad url');
  }
  if (!/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).send('invalid url');
  }

  let referer;
  try {
    referer = new URL(targetUrl).origin + '/';
  } catch (_) {
    referer = BASE_URL + '/';
  }

  try {
    const upstream = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 5,
      headers: {
        'User-Agent': UA,
        Referer: referer,
        Origin: referer.replace(/\/$/, ''),
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    let ct = upstream.headers['content-type'] || 'application/octet-stream';
    if (/\.key(\?|$)/i.test(targetUrl)) ct = 'application/octet-stream';
    res.set('Content-Type', ct);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache');
    res.send(upstream.data);
  } catch (err) {
    const code = err.response && err.response.status ? err.response.status : 502;
    res.status(code).send('proxy error: ' + err.message);
  }
});

// ---------- API ----------

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

// Serve a cover image by video ID.
// Covers are NOT stored on disk: the server fetches the remote coverUrl, decrypts
// it in memory (source serves AES-encrypted images), and streams the bytes to the
// client. Nothing sensitive is ever written to the local filesystem.
function isValidImage(buf) {
  return (buf[0] === 0xFF && buf[1] === 0xD8) || // JPEG
         (buf[0] === 0x89 && buf[1] === 0x50) || // PNG
         (buf[0] === 0x47 && buf[1] === 0x49);   // GIF
}
function imageContentType(buf) {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return 'application/octet-stream';
}
app.get('/api/cover/:id', async (req, res) => {
  const found = findById(req.params.id);
  const item = found && found.item;
  if (!item || !item.coverUrl) return res.status(404).send('no cover');
  try {
    const refererSite = item.siteUrl || (item.url ? new URL(item.url).origin : BASE_URL);
    const upstream = await axios.get(item.coverUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': UA, Referer: refererSite + '/' },
    });
    let buf = Buffer.from(upstream.data);
    if (!isValidImage(buf)) {
      // Source serves encrypted images; decrypt in memory only.
      buf = await decryptBuffer(buf);
    }
    res.set('Content-Type', imageContentType(buf));
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
    const refererSite = target.siteUrl || (target.url ? new URL(target.url).origin : BASE_URL);
    const r = await axios.get(target.url, {
      timeout: 30000,
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
    res.status(502).json({ error: err.message });
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

  const fromIndex = getIndex().find((a) => a.id === body.id);
  const snapshot = toVideoItem(fromIndex || body);
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
    indexCache = null;
    indexMtimeMs = -1;
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
    indexCache = null;
    indexMtimeMs = -1;
    res.json({ ok: true, added: result.added, total: result.total, logs });
  } catch (err) {
    res.status(500).json({ error: err.message, logs });
  }
});

// SPA fallback: serve React index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(BUILD_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`学习资料 - 服务器已启动: http://localhost:${PORT}`);
  console.log(`已加载 ${getIndex().length} 条记录，收藏 ${getFavorites().length} 条`);

  // Startup: per-site 今日 only; if a site has zero today articles, fall back
  // to its list page 1 (previous day). Does not crawl regular list pages.
  (async () => {
    try {
      console.log('启动爬取：各站点今日（无则回退前一日）...');
      await crawl({
        todayOnly: true,
        replace: true,
        outDir: OUT_DIR,
        jsonPath: JSON_PATH,
        concurrency: 3,
        onLog: (m) => console.log(m),
      });
      indexCache = null;
      indexMtimeMs = -1;
      console.log(`启动爬取完成，当前共 ${getIndex().length} 条记录`);
    } catch (e) {
      console.warn('启动爬取失败:', e.message);
    }
  })();
});
