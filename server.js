// server.js
// Local web server: serves the React UI + APIs + CORS proxy for HLS streaming.
//
// Run:  node server.js            (default http://localhost:3000)
//       set PORT=8080 && node server.js

const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { crawl, loadIndex, parseDetailPage, resolvePlayerUrl, BASE_URL, SITES } = require('./crawler');
const { decryptBuffer } = require('./imageDecrypt');

const PORT = process.env.PORT || 3000;
const OUT_DIR = path.resolve(__dirname, 'output');
const JSON_PATH = path.join(OUT_DIR, 'index.json');
const BUILD_DIR = path.join(__dirname, 'public', 'build');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve React build
app.use(express.static(BUILD_DIR));

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
  const all = loadIndex(JSON_PATH).filter((a) => a.video && a.video.url);
  const q = (req.query.q || '').trim().toLowerCase();
  const result = q
    ? all.filter((a) => (a.title || '').toLowerCase().includes(q) || (a.id || '').includes(q))
    : all;
  const items = result.map((a) => ({
    id: a.id,
    title: a.title || '',
    url: a.url,
    siteUrl: a.siteUrl || null,
    coverUrl: a.coverUrl || null,
    video: a.video || null,
    tags: a.tags || [],
    category: a.category || null,
    datePublished: a.datePublished || null,
  }));
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
  const item = loadIndex(JSON_PATH).find((a) => a.id === req.params.id);
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
app.get('/api/refresh/:id', async (req, res) => {
  const item = loadIndex(JSON_PATH).find((a) => a.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  try {
    // Use the article's origin as Referer (multi-site support)
    const refererSite = item.siteUrl || (item.url ? new URL(item.url).origin : BASE_URL);
    const r = await axios.get(item.url, {
      timeout: 30000,
      maxRedirects: 5,
      headers: { 'User-Agent': UA, Referer: refererSite + '/' },
    });
    const detail = parseDetailPage(r.data);
    const all = loadIndex(JSON_PATH);
    const target = all.find((a) => a.id === item.id);
    if (!target) return res.status(404).json({ error: 'not found in index' });
    let updated = false;
    if (detail.video && detail.video.url) {
      // Resolve player endpoint URLs (d1ve-style) to get the real m3u8 URL
      if (detail.video.needsResolve) {
        const resolved = await resolvePlayerUrl(refererSite, detail.video.url, (m) => console.log(m));
        if (resolved) {
          detail.video.url = resolved;
          detail.video.needsResolve = false;
        } else {
          detail.video = null; // can't play without a real m3u8 URL
        }
      }
      target.video = detail.video;
      updated = true;
    }
    if (detail.tags && detail.tags.length) {
      target.tags = detail.tags;
      updated = true;
    }
    if (detail.category) {
      target.category = detail.category;
      updated = true;
    }
    if (detail.datePublished) {
      target.datePublished = detail.datePublished;
      updated = true;
    }
    if (detail.dateModified) {
      target.dateModified = detail.dateModified;
      updated = true;
    }
    if (updated) {
      fs.writeFileSync(JSON_PATH, JSON.stringify(all, null, 2), 'utf8');
    }
    res.json({ ok: true, video: target.video, tags: target.tags || [], category: target.category || null, datePublished: target.datePublished || null });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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
    const all = loadIndex(JSON_PATH).filter((a) => a.video && a.video.url);
    const qlc = keyword.toLowerCase();
    const items = all
      .filter((a) => (a.title || '').toLowerCase().includes(qlc) || (a.id || '').includes(qlc))
      .slice(0, 100)
      .map((a) => ({
        id: a.id,
        title: a.title || '',
        url: a.url,
        siteUrl: a.siteUrl || null,
        coverUrl: a.coverUrl || null,
        video: a.video || null,
        tags: a.tags || [],
        category: a.category || null,
        datePublished: a.datePublished || null,
      }));
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
  console.log(`已加载 ${loadIndex(JSON_PATH).length} 条记录`);

  // Refresh the latest page from every source site on startup so the index
  // always reflects the newest content (titles, tags, video URLs, publish
  // dates). Runs in the background; the server is usable immediately.
  (async () => {
    try {
      console.log('启动爬取：抓取各站点最新一页...');
      await crawl({
        pageStart: 1,
        pageEnd: 1,
        outDir: OUT_DIR,
        jsonPath: JSON_PATH,
        concurrency: 3,
        onLog: (m) => console.log(m),
      });
      console.log(`启动爬取完成，当前共 ${loadIndex(JSON_PATH).length} 条记录`);
    } catch (e) {
      console.warn('启动爬取失败:', e.message);
    }
  })();
});
