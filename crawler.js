// crawler.js
// Multi-site aggregated crawler for adult video content.
//
// Supported sites (configured in SITES array):
//   - bite.ygvttlxzy.cc      (post-card theme, direct m3u8 in data-config.video.url)
//   - d1ve8vvwughzqa.cloudfront.net (post-card theme, player endpoint in data-config.url)
//   - breast.eiejvjgex.cc    (xqbj-list theme, direct m3u8 in data-config.video.url)
//   - assert.pbtiodqn.cc     (post-card theme, redirects to assert.pcilgzsm.com)
//
// The crawler fetches list/search pages from ALL sites in parallel,
// aggregates articles by ID, then fetches detail pages for each.
//
// Usage (CLI):
//   node crawler.js --pages 1-3
//   node crawler.js --search <keyword> --search-pages 2

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const SITES = [
  'https://bite.ygvttlxzy.cc',
  'https://d1ve8vvwughzqa.cloudfront.net',
  'https://breast.eiejvjgex.cc',
  'https://assert.pbtiodqn.cc',
];
const BASE_URL = SITES[0]; // backwards compat for server.js
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Articles whose title or tags contain any of these keywords are excluded from
// the index (case-insensitive substring match).
const EXCLUDE_KEYWORDS = ['重口味', 'ai'];

function matchesExclude(article) {
  const title = (article.title || '').toLowerCase();
  const tags = (article.tags || []).map((t) => String(t).toLowerCase());
  return EXCLUDE_KEYWORDS.some((kw) => {
    const k = kw.toLowerCase();
    return title.includes(k) || tags.some((t) => t.includes(k));
  });
}

const http = axios.create({
  timeout: 30000,
  maxRedirects: 5,
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

// Extract article ID from any archive URL (site-agnostic).
function normalizeArchiveUrl(href) {
  const m = href.match(/\/archives\/(\d+)\//);
  if (!m) return null;
  return { id: m[1] };
}

function archiveUrl(site, id) {
  return `${site}/archives/${id}/`;
}

function listPageUrl(site, pageNum) {
  if (pageNum <= 1) return site + '/';
  return `${site}/page/${pageNum}/`;
}

// Per-site "今日" (today) entry path — the day's freshest content, used as the
// priority source on every list-mode crawl. Each site exposes it under a
// different route, so we map by site origin.
const SITE_TODAY_PATH = {
  'https://bite.ygvttlxzy.cc': '/category/zxcghl/',          // 今日吃瓜
  'https://d1ve8vvwughzqa.cloudfront.net': '/category/jrxw1/', // 今日更新
  'https://breast.eiejvjgex.cc': '/order/today/',            // 今日更新
  'https://assert.pbtiodqn.cc': '/category/jrbl/',           // 今日爆料
};

function todayPageUrl(site, pageNum) {
  const p = SITE_TODAY_PATH[site];
  if (!p) return null;
  if (pageNum <= 1) return site + p;
  return site + p.replace(/\/$/, '') + `/page/${pageNum}/`;
}

// China (UTC+8) calendar date as YYYY-MM-DD.
function chinaDateStr(offsetDays = 0) {
  const t = Date.now() + 8 * 3600000 + offsetDays * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

function articleDateStr(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function searchUrl(site, keyword, pageNum) {
  const enc = encodeURIComponent(keyword);
  if (pageNum <= 1) return `${site}/search/${enc}/`;
  return `${site}/search/${enc}/page/${pageNum}/`;
}

// Per-request Referer matching the target site.
function headersFor(site) {
  return { Referer: site + '/', Origin: site };
}

async function getWithRetry(url, client = http, retries = 4, extraHeaders = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await client.get(url, { headers: extraHeaders });
    } catch (err) {
      lastErr = err;
      const code = err.response && err.response.status;
      if (code === 404) throw err;
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

function parseListPage(html, siteUrl) {
  const $ = cheerio.load(html);
  const articles = [];
  const seen = new Set();

  // Theme 1: post-card (bite, d1ve, assert) — article > a[href*="/archives/"] > .post-card
  $('article a[href*="/archives/"]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    const norm = normalizeArchiveUrl(href);
    if (!norm || seen.has(norm.id)) return;

    let coverUrl = null;
    const $card = $a.find('.post-card').first();
    const cardHtml = $card.html() || '';
    const coverMatch = cardHtml.match(/loadBannerDirect\s*\(\s*['"]([^'"]+)['"]/);
    if (coverMatch) coverUrl = coverMatch[1];

    const title = $a.find('.post-card-title').text().replace(/\s+/g, ' ').trim();

    seen.add(norm.id);
    articles.push({ id: norm.id, url: archiveUrl(siteUrl, norm.id), siteUrl, title, coverUrl });
  });

  // Theme 2: xqbj-list-rows (breast/51fans) — .xqbj-list-rows a[href*="/archives/"]
  $('.xqbj-list-rows a[href*="/archives/"]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    const norm = normalizeArchiveUrl(href);
    if (!norm || seen.has(norm.id)) return;

    const title = ($a.attr('title') || $a.find('.xqbj-list-rows-image-title').text() || '')
      .replace(/\s+/g, ' ').trim();

    // Cover: z-image-loader-url attribute (may be wrapped in backticks from Vue template)
    let coverUrl = null;
    const $img = $a.find('img[z-image-loader-url]').first();
    if ($img.length) {
      const raw = $img.attr('z-image-loader-url') || '';
      const m = raw.match(/https?:\/\/[^\s`"']+/);
      if (m) coverUrl = m[0];
    }

    seen.add(norm.id);
    articles.push({ id: norm.id, url: archiveUrl(siteUrl, norm.id), siteUrl, title, coverUrl });
  });

  return articles;
}

// ---------- detail page parsing (polyglot) ----------

function parseDetailPage(html) {
  const $ = cheerio.load(html);
  const result = { title: null, video: null, tags: [], category: null, coverUrl: null, datePublished: null, dateModified: null };

  // Title — try multiple selectors used by different themes
  const h1 = $('h1.post-title, h1[itemprop="headline"], .article-title h1, article h1').first();
  if (h1.length) result.title = h1.text().replace(/\s+/g, ' ').trim();

  // Cover — meta itemprop="image" (matches actual video content; skips GIF ads)
  const metaImg = $('meta[itemprop="image"]').attr('content');
  if (metaImg && !/\.gif/i.test(metaImg)) result.coverUrl = metaImg;

  // Publish / modified dates — two strategies across themes:
  //   (a) post-card theme (bite, d1ve, assert): <meta itemprop="datePublished" content="...">
  //   (b) xqbj theme (breast/51fans): JSON-LD <script type="application/ld+json"> with datePublished
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
      const mPub = raw.match(/"datePublished"\s*:\s*"([^"]+)"/);
      if (mPub) result.datePublished = mPub[1];
      const mMod = raw.match(/"dateModified"\s*:\s*"([^"]+)"/);
      if (mMod) result.dateModified = mMod[1];
    });
  }

  // Tags — try DOM links first (post-card theme), then data attribute (xqbj/d1ve theme)
  $('div.keywords a, div.tags div.keywords a').each((_, a) => {
    const t = $(a).text().trim();
    if (t && !result.tags.includes(t)) result.tags.push(t);
  });

  // Category — try breadcrumb first, then data attribute
  const $crumb = $('p.sp_breadcrumb_nav');
  const crumbLinks = $crumb.find('a');
  if (crumbLinks.length >= 2) {
    result.category = crumbLinks.eq(1).text().trim();
  }

  // Video + tags + category from .dplayer[data-config]
  $('.dplayer').each((_, div) => {
    const $div = $(div);
    const cfg = $div.attr('data-config');
    if (!cfg) return;

    // Tags from data-video_tag_name (comma-separated) if DOM parsing found nothing
    if (result.tags.length === 0) {
      const tagStr = $div.attr('data-video_tag_name');
      if (tagStr) {
        tagStr.split(',').forEach((t) => {
          t = t.trim();
          if (t && !result.tags.includes(t)) result.tags.push(t);
        });
      }
    }

    // Category from data-video_type_name if breadcrumb found nothing
    if (!result.category) {
      const cat = $div.attr('data-video_type_name');
      if (cat) result.category = cat;
    }

    // Video URL — two data-config shapes:
    //   (a) obj.video.url = direct m3u8 (bite, breast)
    //   (b) obj.url = player endpoint or direct url (d1ve)
    try {
      const obj = JSON.parse(cfg);
      if (obj.video && obj.video.url && !result.video) {
        result.video = {
          url: obj.video.url,
          type: obj.video.type || 'hls',
          thumbnails: obj.video.thumbnails || null,
        };
      } else if (obj.url && !result.video) {
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

  return result;
}

// Resolve a player endpoint URL (d1ve-style) to get the real m3u8 URL.
async function resolvePlayerUrl(siteUrl, playerPath, log) {
  const fullUrl = playerPath.startsWith('http') ? playerPath : siteUrl + playerPath;
  try {
    const res = await getWithRetry(fullUrl, http, 2, headersFor(siteUrl));
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const url = data && data.data && data.data[0] && data.data[0].url;
    if (url) return url;
    log(`  [player] endpoint returned no url: ${fullUrl}`);
    return null;
  } catch (err) {
    log(`  [player] resolve failed: ${err.message}`);
    return null;
  }
}

// ---------- concurrency runner ----------

async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;
  let active = 0;
  return new Promise((resolve, reject) => {
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
          .catch(reject);
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
  const incomingIds = new Set(incoming.map((a) => a.id));
  const merged = [...incoming];
  for (const a of existing) {
    if (!incomingIds.has(a.id)) merged.push(a);
  }
  const added = incoming.filter((a) => !existing.some((e) => e.id === a.id)).length;
  return { merged, added, updated: incoming.length - added };
}

// ---------- multi-site aggregated fetch ----------

// Fetch a list/search page from ALL sites in parallel, aggregate articles by ID.
async function fetchListPageFromAllSites(pageNum, log, mode) {
  // mode: 'list' | 'search'
  const keyword = mode.keyword;
  const results = await Promise.allSettled(
    SITES.map(async (site) => {
      const url = mode.type === 'search' ? searchUrl(site, keyword, pageNum) : listPageUrl(site, pageNum);
      log(`[${mode.type}] ${site} page ${pageNum}`);
      const res = await getWithRetry(url, http, 3, headersFor(site));
      return { site, articles: parseListPage(res.data, site) };
    })
  );

  const aggregated = [];
  const seenIds = new Set();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      log(`  [${SITES[i]}] -> ${r.value.articles.length} articles`);
      for (const a of r.value.articles) {
        if (!seenIds.has(a.id)) {
          seenIds.add(a.id);
          aggregated.push(a);
        }
      }
    } else {
      log(`  [${SITES[i]}] FAILED: ${r.reason.message}`);
    }
  }
  return aggregated;
}

// Fetch "今日" per site. Each site is handled independently: if its today
// category returns zero articles, fall back to list page 1 (previous day).
async function fetchTodayPerSiteWithFallback(log) {
  const results = await Promise.allSettled(
    SITES.map(async (site) => {
      const articles = [];
      const seen = new Set();
      const add = (a) => {
        if (!seen.has(a.id)) { seen.add(a.id); articles.push(a); }
      };

      let source = 'today';
      const todayPath = SITE_TODAY_PATH[site];

      if (todayPath) {
        for (let pg = 1; pg <= 2; pg++) {
          const url = todayPageUrl(site, pg);
          if (!url) break;
          try {
            log(`[today] ${site} page ${pg}`);
            const res = await getWithRetry(url, http, 2, headersFor(site));
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
          const res = await getWithRetry(listPageUrl(site, 1), http, 3, headersFor(site));
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
    })
  );

  const aggregated = [];
  const seenIds = new Set();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      for (const a of r.value) {
        if (!seenIds.has(a.id)) { seenIds.add(a.id); aggregated.push(a); }
      }
    } else {
      log(`  [today ${SITES[i]}] FAILED: ${r.reason.message}`);
    }
  }
  return aggregated;
}

// Keep articles whose dateModified matches the list source (today vs fallback).
function filterArticlesByModifiedDate(articles, log) {
  const today = chinaDateStr(0);
  const yesterday = chinaDateStr(-1);
  const before = articles.length;
  for (let i = articles.length - 1; i >= 0; i--) {
    const a = articles[i];
    const d = articleDateStr(a.dateModified);
    if (!d) continue; // keep when dateModified unknown
    if (a._listSource === 'today' && d !== today) articles.splice(i, 1);
    else if (a._listSource === 'fallback' && d !== yesterday) articles.splice(i, 1);
  }
  if (before - articles.length > 0) {
    log(`dateModified filter (today=${today}, yesterday=${yesterday}): removed ${before - articles.length}`);
  }
  articles.forEach((a) => { delete a._listSource; });
}

// ---------- core crawl (module API) ----------

// Options:
//   pageStart, pageEnd   list page range (default 1..1)
//   search               search keyword (overrides pages)
//   searchPages          how many search result pages (default 1)
//   todayOnly            startup mode: only 今日 per site (+ per-site fallback), no list pages
//   replace              replace index.json entirely (default: true only when todayOnly)
//   limit                max articles (default 0 = all)
//   outDir               output directory
//   concurrency         detail workers (default 3)
//   jsonPath             index.json path
//   onLog                progress callback (msg) => void
async function crawl(opts = {}) {
  const pageStart = opts.pageStart || 1;
  const pageEnd = opts.pageEnd || opts.pageStart || 1;
  const searchKeyword = opts.search || null;
  const searchPages = opts.searchPages || 1;
  const todayOnly = !!opts.todayOnly;
  // Startup (todayOnly) replaces; UI sync merges/pushes unless replace:true.
  const replace = opts.replace != null ? !!opts.replace : todayOnly;
  const limit = opts.limit || 0;
  const outDir = path.resolve(opts.outDir || './output');
  const concurrency = opts.concurrency || 3;
  const jsonPath = path.resolve(opts.jsonPath || path.join(outDir, 'index.json'));
  const log = typeof opts.onLog === 'function' ? opts.onLog : (m) => console.log(m);

  fs.mkdirSync(outDir, { recursive: true });

  const mode = searchKeyword
    ? { type: 'search', keyword: searchKeyword, label: `search "${searchKeyword}" pages 1..${searchPages}` }
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
    log('--- Fetching 今日 (per-site, fallback if empty) ---');
    const todayArts = await fetchTodayPerSiteWithFallback(log);
    for (const a of todayArts) addUnique(a);
    log(`Today+fallback: ${todayArts.length} articles`);
  }

  if (!todayOnly) {
    const totalPages = searchKeyword ? searchPages : (pageEnd - pageStart + 1);
    for (let i = 0; i < totalPages; i++) {
      const pageNum = searchKeyword ? (i + 1) : (pageStart + i);
      const arts = await fetchListPageFromAllSites(pageNum, log, mode);
      for (const a of arts) addUnique(a);
      if (i < totalPages - 1) await sleep(300);
    }
  }

  log(`Collected ${newArticles.length} unique articles from ${SITES.length} sites`);
  if (limit > 0 && newArticles.length > limit) {
    newArticles.length = limit;
    log(`Limited to ${limit} articles`);
  }

  // Pre-filter by title to avoid wasting detail-page fetches on excluded content.
  const beforeTitleFilter = newArticles.length;
  for (let i = newArticles.length - 1; i >= 0; i--) {
    if (matchesExclude(newArticles[i])) newArticles.splice(i, 1);
  }
  if (beforeTitleFilter - newArticles.length > 0) {
    log(`Excluded ${beforeTitleFilter - newArticles.length} articles by title (重口味/ai)`);
  }

  if (newArticles.length === 0) {
    // Keep the existing index — do not wipe it when a crawl finds nothing
    // (e.g. all sites temporarily unreachable or all titles excluded).
    const existing = loadIndex(jsonPath);
    log('No articles found, nothing to do.');
    return { added: 0, total: existing.length };
  }

  // 2. Fetch detail pages -> extract video URLs + tags + category + real cover
  log('--- Fetching detail pages ---');
  await mapWithConcurrency(newArticles, concurrency, async (a) => {
    try {
      const res = await getWithRetry(a.url, http, 3, headersFor(a.siteUrl));
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
    await sleep(150);
  });

  // Post-filter by tags (only available after detail parse).
  const beforeTagFilter = newArticles.length;
  for (let i = newArticles.length - 1; i >= 0; i--) {
    if (matchesExclude(newArticles[i])) newArticles.splice(i, 1);
  }
  if (beforeTagFilter - newArticles.length > 0) {
    log(`Excluded ${beforeTagFilter - newArticles.length} articles by tag (重口味/ai)`);
  }

  if (todayOnly) {
    filterArticlesByModifiedDate(newArticles, log);
  } else {
    newArticles.forEach((a) => { delete a._listSource; });
  }

  if (newArticles.length === 0) {
    const existing = loadIndex(jsonPath);
    log('No articles left after filters, keeping existing index.');
    return { added: 0, total: existing.length, updated: 0 };
  }

  if (replace) {
    saveIndex(jsonPath, newArticles);
    const withVideo = newArticles.filter((a) => a.video && a.video.url).length;
    log(`Done (replace). Total ${newArticles.length} articles | ${withVideo} with video URL`);
    return { added: newArticles.length, total: newArticles.length, updated: 0 };
  }

  const existing = loadIndex(jsonPath);
  const { merged, added, updated } = mergeIntoIndex(existing, newArticles);
  saveIndex(jsonPath, merged);
  const withVideo = merged.filter((a) => a.video && a.video.url).length;
  log(`Done (merge). +${added} new, ~${updated} updated | total ${merged.length} | ${withVideo} with video URL`);
  return { added, total: merged.length, updated };
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
    concurrency: parseInt(args.concurrency, 10) || 3,
    jsonPath: args['save-json'] || './output/index.json',
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

module.exports = { crawl, parseDetailPage, resolvePlayerUrl, loadIndex, BASE_URL, SITES };
