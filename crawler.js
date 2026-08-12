// crawler.js — 多站点聚合爬虫。站点配置读自 output/sites.json（页面可改，即时生效）。
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
const { matchesExclude, filterExcluded } = require('./lib/exclude');
const { estimateCrawl, startConsoleCountdown, formatDuration } = require('./lib/crawl-eta');
const { isPromoDetailText } = require('./lib/detail-noise');

// 站点项：{ url, name, todayPath, enabled, archiveSuffix? }；archiveSuffix 默认 "/"，部分站用 ".html"
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
  } catch (_) { /* 回退到默认配置 */ }
  return DEFAULT_SITE_CONFIGS.map((s) => ({ ...s }));
}

function saveSiteConfigs(configs) {
  fs.mkdirSync(path.dirname(SITES_PATH), { recursive: true });
  fs.writeFileSync(SITES_PATH, JSON.stringify(configs, null, 2), 'utf8');
}

// 模块级缓存；reloadSites() 后下次调用自动用新配置
let SITE_CONFIGS = loadSiteConfigs();
let SITES = [];
let SITE_TODAY_PATH = {};
let SITE_ARCHIVE_SUFFIX = {};
let BASE_URL = '';

function rebuildSiteMaps() {
  const enabled = SITE_CONFIGS.filter((s) => s.enabled !== false);
  SITES = enabled.map((s) => s.url);
  SITE_TODAY_PATH = {};
  SITE_ARCHIVE_SUFFIX = {};
  for (const s of enabled) {
    if (s.todayPath) SITE_TODAY_PATH[s.url] = s.todayPath;
    SITE_ARCHIVE_SUFFIX[s.url] = s.archiveSuffix || '/';
  }
  BASE_URL = SITES[0] || '';
}
rebuildSiteMaps();

function reloadSites() {
  SITE_CONFIGS = loadSiteConfigs();
  rebuildSiteMaps();
}

function getSiteConfigs() { return SITE_CONFIGS; }
function getSites() { return SITES; }
function getBaseUrl() { return BASE_URL; }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Keep-Alive：复用同主机 TCP，减少爬取握手开销
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 128, maxFreeSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 128, maxFreeSockets: 32 });

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

// ---------- 辅助函数 ----------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 从归档 URL 提取文章 ID（兼容 /archives/123/ 与 /archives/123.html） */
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

// 各站「今日」路径见 SITE_TODAY_PATH（由站点配置构建）
function todayPageUrl(site, pageNum) {
  const p = SITE_TODAY_PATH[site];
  if (!p) return null;
  return pageNum <= 1 ? site + p : site + p.replace(/\/$/, '') + `/page/${pageNum}/`;
}

/** 中国时区（UTC+8）日历日 YYYY-MM-DD */
function chinaDateStr(offsetDays = 0) {
  const t = Date.now() + 8 * 3600000 + offsetDays * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** ISO 时间转中国日历日（勿直接取 UTC 日期前缀，跨日会错） */
function articleDateStr(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!isNaN(t)) return new Date(t + 8 * 3600000).toISOString().slice(0, 10);
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** 优先 datePublished，其次 dateModified */
function articleContentDateStr(article) {
  return articleDateStr(article.datePublished) || articleDateStr(article.dateModified);
}

function searchUrl(site, keyword, pageNum) {
  const enc = encodeURIComponent(keyword);
  return pageNum <= 1 ? `${site}/search/${enc}/` : `${site}/search/${enc}/page/${pageNum}/`;
}

/** 同源 Referer / Origin */
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
      // 4xx（除 429 外）不可重试，直接抛出
      if (code && code >= 400 && code < 500 && code !== 429) throw err;
      await sleep(500 * Math.pow(2, i) + Math.floor(Math.random() * 200));
    }
  }
  throw lastErr;
}

// ---------- 站点级断路器 ----------
// 连续失败 N 次后标记站点为"熔断"，一段时间内跳过该站，避免持续打已挂的站点。
class SiteCircuitBreaker {
  constructor(threshold = 5, cooldownMs = 60000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.failures = new Map();  // site → 连续失败计数
    this.tripped = new Map();   // site → 熔断时间戳
  }
  isTripped(site) {
    const t = this.tripped.get(site);
    if (!t) return false;
    if (Date.now() - t > this.cooldownMs) {
      this.tripped.delete(site);
      this.failures.delete(site);
      return false;
    }
    return true;
  }
  recordFailure(site) {
    const n = (this.failures.get(site) || 0) + 1;
    this.failures.set(site, n);
    if (n >= this.threshold) {
      this.tripped.set(site, Date.now());
      return true; // 新触发熔断
    }
    return false;
  }
  recordSuccess(site) {
    this.failures.delete(site);
    this.tripped.delete(site);
  }
}
const siteBreaker = new SiteCircuitBreaker();

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

// ---------- 列表/搜索页解析（兼容 post-card / xqbj-list） ----------

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

  // 主题 1：post-card（bite, d1ve, assert）— article > a[href*="/archives/"] > .post-card
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

  // 主题 2：xqbj-list-rows（breast/51fans）— .xqbj-list-rows a[href*="/archives/"]
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

// ---------- 详情页解析 ----------

const JSON_LD_PUB_RE = /"datePublished"\s*:\s*"([^"]+)"/;
const JSON_LD_MOD_RE = /"dateModified"\s*:\s*"([^"]+)"/;

function parseVideoFromDplayer($div) {
  const cfg = $div.attr('data-config');
  if (!cfg) return null;
  try {
    const obj = JSON.parse(cfg);
    let video = null;
    // (a) obj.video.url = 直接 m3u8  (b) obj.url = 播放器端点 / 直链
    if (obj.video && obj.video.url) {
      video = {
        url: obj.video.url,
        type: obj.video.type || 'hls',
        thumbnails: obj.video.thumbnails || null,
      };
    } else if (obj.url) {
      video = {
        url: obj.url,
        type: obj.type || 'hls',
        thumbnails: obj.poster || null,
        needsResolve: /\/action\//.test(obj.url),
      };
    }
    if (!video) return null;
    const title = ($div.attr('data-video_title') || '').trim() || null;
    if (title) video.title = title;
    return video;
  } catch (_) {
    return null;
  }
}

/** 详情正文容器（兼容 post-card / xqbj / text-content 等主题） */
const DETAIL_BODY_SELECTORS = [
  '.post-content',
  'div[itemprop="articleBody"]',
  '.article-content',
  '.entry-content',
  '.text.text-content',
  '.text-content',
].join(', ');

/** 从 img 节点解析真实图片 URL（懒加载属性优先） */
function resolveImgUrl($img) {
  const raw = (
    $img.attr('data-xkrkllgl')
    || $img.attr('z-image-loader-url')
    || $img.attr('data-original')
    || $img.attr('data-src')
    || $img.attr('data-url')
    || $img.attr('src')
    || ''
  ).trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  if (/\.gif(\?|$)/i.test(raw)) return null;
  if (/\/usr\/(themes|plugins)\//i.test(raw)) return null;
  if (/zw\.png/i.test(raw)) return null;
  if (/\/hc\d+\/uploads\/default\/other\//i.test(raw)) return null; // 站内广告图
  const alt = `${$img.attr('alt') || ''} ${$img.attr('title') || ''}`;
  if (/最新地址|PDF|二维码|QQ群|扫码/i.test(alt)) return null;
  return raw;
}

/**
 * 截取至「最后一个播放器」：删除末个 .dplayer 之后的全部内容（播放器之间的正文保留）。
 * 无播放器时保留全文（仍会走广告/噪声过滤）。
 */
function sliceThroughLastPlayer($root) {
  const $player = $root.find('.dplayer').last();
  if (!$player.length) return $root;

  let $cur = $player;
  while ($cur.length && !$cur.is($root)) {
    $cur.nextAll().remove();
    $cur = $cur.parent();
  }
  return $root;
}

/** 提取详情正文：有序 blocks（text / image / video）+ 兼容字段 content / images */
function extractDetailBody($) {
  const $root = $(DETAIL_BODY_SELECTORS).first();
  if (!$root.length) return { content: '', images: [], blocks: [] };

  const $scope = $root.clone();
  sliceThroughLastPlayer($scope);

  // 去掉噪声，但保留 .dplayer 作为视频锚点
  $scope.find([
    '.article-ads-btn', 'script', 'style',
    '.content-copyright', '.tags', 'table', 'blockquote',
    '.content-tabs', '.article-bottom-apps', '.post-near',
  ].join(',')).remove();

  const blocks = [];
  const images = [];
  const seenImg = new Set();
  let videoIndex = 0;

  $scope.find('p, h2, h3, img, .dplayer').each((_, el) => {
    const $el = $(el);

    if ($el.is('.dplayer')) {
      blocks.push({ type: 'video', index: videoIndex });
      videoIndex += 1;
      return;
    }

    // 跳过播放器内部节点
    if ($el.closest('.dplayer').length) return;

    if ($el.is('img')) {
      const raw = resolveImgUrl($el);
      if (!raw || seenImg.has(raw)) return;
      seenImg.add(raw);
      const index = images.length;
      images.push(raw);
      blocks.push({ type: 'image', index });
      return;
    }

    // 嵌套在另一段标题/段落内则跳过，避免重复
    if ($el.parents('p, h2, h3').length) return;

    const $clone = $el.clone();
    $clone.find('img, .dplayer').remove();
    const t = $clone.text().replace(/\s+/g, ' ').trim();
    if (!t || t.length < 2) return;
    if (isPromoDetailText(t)) return;
    blocks.push({ type: 'text', text: t });
  });

  if (images.length > 24) {
    images.length = 24;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].type === 'image' && blocks[i].index >= 24) blocks.splice(i, 1);
    }
  }

  const content = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n');

  return { content, images, blocks };
}



function parseDetailPage(html) {
  const $ = cheerio.load(html);
  const result = {
    title: null, video: null, videos: [], tags: [], category: null,
    coverUrl: null, datePublished: null, dateModified: null,
    content: '', images: [], blocks: [],
  };

  // 标题 — 尝试不同主题使用的多种选择器
  const h1 = $('h1.post-title, h1[itemprop="headline"], .article-title h1, article h1').first();
  if (h1.length) result.title = h1.text().replace(/\s+/g, ' ').trim();

  // 封面 — meta itemprop="image"（匹配实际视频内容，跳过 GIF 广告）
  const metaImg = $('meta[itemprop="image"]').attr('content');
  if (metaImg && !/\.gif/i.test(metaImg)) result.coverUrl = metaImg;

  // 发布/修改日期 — 两种策略兼容不同主题：
  //   (a) post-card 主题：<meta itemprop="datePublished" content="...">
  //   (b) xqbj 主题：JSON-LD 中的 datePublished
  const metaPublished = $('meta[itemprop="datePublished"]').attr('content');
  if (metaPublished) result.datePublished = metaPublished;
  const metaModified = $('meta[itemprop="dateModified"]').attr('content');
  if (metaModified) result.dateModified = metaModified;

  if (!result.datePublished) {
    $('script[type="application/ld+json"]').each((_, el) => {
      if (result.datePublished) return;
      const raw = $(el).html() || '';
      // 使用容错正则而非 JSON.parse；JSON-LD 可能嵌在 Vue 模板中
      // 或被反引号包裹，导致严格解析失败。
      const mPub = raw.match(JSON_LD_PUB_RE);
      if (mPub) result.datePublished = mPub[1];
      const mMod = raw.match(JSON_LD_MOD_RE);
      if (mMod) result.dateModified = mMod[1];
    });
  }

  // 标签 — DOM 链接（post-card 主题）
  const tagSet = new Set();
  $('div.keywords a, div.tags div.keywords a').each((_, a) => {
    const t = $(a).text().trim();
    if (t) tagSet.add(t);
  });

  // 分类 — 面包屑优先；站点品牌相关分类丢弃
  const acceptCategory = (raw) => {
    const cat = String(raw || '').trim();
    return cat && !isSiteBrandTag(cat, SITE_CONFIGS) ? cat : null;
  };
  const $crumb = $('p.sp_breadcrumb_nav a');
  if ($crumb.length >= 2) {
    result.category = acceptCategory($crumb.eq(1).text());
  }

  // 全部 .dplayer 视频（不再只取第一个）
  const seenVideoUrl = new Set();
  $('.dplayer').each((_, div) => {
    const $div = $(div);
    const cfg = $div.attr('data-config');
    if (!cfg) return;

    // 如果 DOM 解析未获取到标签，从 data-video_tag_name（逗号分隔）提取
    if (tagSet.size === 0) {
      const tagStr = $div.attr('data-video_tag_name');
      if (tagStr) {
        tagStr.split(',').forEach((t) => {
          t = t.trim();
          if (t) tagSet.add(t);
        });
      }
    }

    // 如果面包屑未找到分类，从 data-video_type_name 提取
    if (!result.category) {
      result.category = acceptCategory($div.attr('data-video_type_name'));
    }

    const video = parseVideoFromDplayer($div);
    if (!video || !video.url || seenVideoUrl.has(video.url)) return;
    seenVideoUrl.add(video.url);
    result.videos.push(video);
  });
  result.video = result.videos[0] || null;

  const body = extractDetailBody($);
  result.content = body.content;
  result.images = body.images;
  result.blocks = body.blocks;

  // 生成时过滤站点名称/品牌相关标签
  result.tags = filterSiteBrandTags(Array.from(tagSet), SITE_CONFIGS);
  return result;
}

/** 解析 player 接口得到真实 m3u8，就地更新 video 对象；失败则返回 null */
async function resolveVideoEntry(siteUrl, video, log) {
  if (!video || !video.url) return null;
  if (!video.needsResolve) return video;
  const resolved = await resolvePlayerUrl(siteUrl, video.url, log);
  if (!resolved) return null;
  video.url = resolved;
  video.needsResolve = false;
  return video;
}

/** 从 player 接口响应提取 m3u8（兼容 data 为字符串或数组） */
function extractPlayerUrl(resp) {
  const d = resp && resp.data;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]) return d[0].url || null;
  return (d && d.url) || null;
}

/** 将 player 接口解析为真实 m3u8；get_play_url 需先取 ticket，失败时退避重试一次 */
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
          log(`  [播放器] ticket 失败 (${(tData && tData.msg) || '无 ticket'}): ${ticketUrl}`);
          return null;
        }
        log(`  [播放器] ticket 成功 (ttl=${tData.data.ttl}s) cid=${(fullUrl.match(/cid=(\d+)/) || [])[1] || '?'}`);
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
        log(`  [播放器] 已解析${needsTicket ? '（ticket）' : ''}: ${url.slice(0, 80)}`);
        return url;
      }
      const msg = (resp && resp.msg) || '';
      if (/频繁|稍后/.test(msg) && attempt === 0) {
        log(`  [播放器] 被限流 (msg="${msg}")，第 ${attempt + 1}/2 次退避重试`);
        await sleep(1500 + Math.floor(Math.random() * 1000));
        continue;
      }
      log(`  [播放器] 无地址 (msg="${msg || '空'}", status=${resp && resp.status}) ${needsTicket ? 'POST' : 'GET'} ${fullUrl}`);
      return null;
    } catch (err) {
      const code = err.code || (err.response && err.response.status) || '';
      log(`  [播放器] 解析错误 (${code} ${err.message}). ${fullUrl}`);
      if (attempt === 0) { await sleep(800); continue; }
      return null;
    }
  }
  return null;
}

// ---------- 并发池（单任务失败不中断整体） ----------

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
            // 将错误映射为标记对象，由调用方决定如何处理
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

// ---------- 索引读写 ----------

let _indexCache = null;
let _indexCachePath = null;

function loadIndex(jsonPath) {
  if (_indexCache && _indexCachePath === jsonPath) return _indexCache;
  try {
    _indexCache = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    _indexCachePath = jsonPath;
    return _indexCache;
  } catch (_) {
    return [];
  }
}

function saveIndex(jsonPath, articles) {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  _indexCache = articles;
  _indexCachePath = jsonPath;
  fs.writeFile(jsonPath, JSON.stringify(articles, null, 2), 'utf8', (err) => {
    if (err) {
      // 异步写入失败；回退到同步写入以防数据丢失
      try { fs.writeFileSync(jsonPath, JSON.stringify(articles, null, 2), 'utf8'); } catch (_) {}
    }
  });
}

function bustIndexCache() {
  _indexCache = null;
  _indexCachePath = null;
}

/** 合并进索引：新/更新条目置顶，按 id 去重，旧条目保留 */
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

// ---------- 多站聚合抓取 ----------

/** 按 id 去重，保留先出现的条目 */
function dedupeById(articles) {
  const seen = new Set();
  const out = [];
  for (const a of articles) {
    if (!seen.has(a.id)) { seen.add(a.id); out.push(a); }
  }
  return out;
}

/** 对所有启用站并行执行 taskFn，汇总并去重；失败只记日志；断路器跳过已熔断站点 */
async function mapAllSites(taskFn, log) {
  const activeSites = SITES.filter((site) => {
    if (siteBreaker.isTripped(site)) {
      log(`  [${site}] 断路器已熔断，跳过`);
      return false;
    }
    return true;
  });

  const results = await Promise.allSettled(activeSites.map(async (site) => {
    try {
      const result = await taskFn(site);
      siteBreaker.recordSuccess(site);
      return result;
    } catch (err) {
      const newlyTripped = siteBreaker.recordFailure(site);
      if (newlyTripped) log(`  [${site}] 断路器已熔断（连续失败）`);
      throw err;
    }
  }));

  const aggregated = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      const arts = Array.isArray(r.value) ? r.value : (r.value && r.value.articles) || [];
      for (const a of arts) aggregated.push(a);
    } else {
      log(`  [${activeSites[i]}] 失败: ${r.reason && r.reason.message}`);
    }
  }
  return dedupeById(aggregated);
}

/** 并行抓取各站列表/搜索页并按 ID 聚合 */
async function fetchListPageFromAllSites(pageNum, log, mode) {
  return mapAllSites(async (site) => {
    const url = mode.type === 'search' ? searchUrl(site, mode.keyword, pageNum) : listPageUrl(site, pageNum);
    log(`[${mode.type}] ${site} 第 ${pageNum} 页`);
    const res = await getWithRetry(url, client, 3, headersFor(site));
    const arts = parseListPage(res.data, site);
    log(`  [${site}] -> ${arts.length} 条`);
    return arts;
  }, log);
}

/** 各站独立抓「今日」；为空则回退该站列表第 1 页 */
async function fetchTodayPerSiteWithFallback(log) {
  return mapAllSites(async (site) => {
    const articles = [];
    const seen = new Set();
    const add = (a) => { if (!seen.has(a.id)) { seen.add(a.id); articles.push(a); } };

    let source = 'today';
    const todayPath = SITE_TODAY_PATH[site];

    if (todayPath) {
      const todayUrls = [];
      for (let pg = 1; pg <= 2; pg++) {
        const url = todayPageUrl(site, pg);
        if (url) todayUrls.push({ pg, url });
      }
      const todayResults = await Promise.allSettled(
        todayUrls.map(({ pg, url }) => {
          log(`[今日] ${site} 第 ${pg} 页`);
          return getWithRetry(url, client, 2, headersFor(site));
        })
      );
      for (let i = 0; i < todayResults.length; i++) {
        const r = todayResults[i];
        if (r.status === 'fulfilled') {
          parseListPage(r.value.data, site).forEach(add);
        } else {
          if (todayUrls[i].pg === 1) log(`  [今日 ${site}] 失败: ${r.reason && r.reason.message}`);
        }
      }
    }

    if (articles.length === 0) {
      source = 'fallback';
      log(`[今日] ${site} -> 0 条，回退列表第 1 页（前一日）`);
      try {
        const res = await getWithRetry(listPageUrl(site, 1), client, 3, headersFor(site));
        parseListPage(res.data, site).forEach(add);
        log(`  [回退 ${site}] -> ${articles.length} 条`);
      } catch (err) {
        log(`  [回退 ${site}] 失败: ${err.message}`);
      }
    } else {
      log(`  [今日 ${site}] -> ${articles.length} 条`);
    }

    articles.forEach((a) => { a._listSource = source; });
    return articles;
  }, log);
}

/** 按站翻页直到凑满 minArticles；无新增或 404 则标记耗尽 */
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
        if (siteBreaker.isTripped(site)) return { site, exhausted: true };
        if (siteIds[site].size >= minArticles) return { site, met: true };
        log(`[每站最低] ${site} 第 ${pageNum} 页`);
        try {
          const res = await getWithRetry(listPageUrl(site, pageNum), client, 3, headersFor(site));
          siteBreaker.recordSuccess(site);
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
            log(`  [${site}] 第 ${pageNum} 页 -> 0 条新增，站点已耗尽`);
            return { site, exhausted: true, newCount: 0, total: siteArticles[site].length };
          }
          return { site, met: false, newCount, total: siteArticles[site].length };
        } catch (err) {
          const is404 = err.response && err.response.status === 404;
          if (is404) {
            log(`  [${site}] 第 ${pageNum} 页 -> 404，站点已耗尽`);
          } else {
            const newlyTripped = siteBreaker.recordFailure(site);
            log(`  [${site}] 第 ${pageNum} 页失败: ${err.message}${newlyTripped ? '（断路器已熔断）' : ''}`);
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
            log(`  [${site}] 已标记为耗尽（${siteArticles[site].length} 条）`);
          }
        } else if (v.met) {
          // 站点已达到最低数量要求
        } else {
          log(`  [${site}] 第 ${pageNum} 页 -> 新增 ${v.newCount} 条，共 ${v.total} 条`);
        }
        // 检查站点是否仍需更多文章
        if (!exhaustedSites.has(site) && siteIds[site].size < minArticles) {
          allSitesMetOrExhausted = false;
        }
      } else {
        // 理论上不会走到这里，因为错误已在内部捕获
        allSitesMetOrExhausted = false;
      }
    }

    if (allSitesMetOrExhausted) {
      log(`所有站点已达最低 ${minArticles} 条或已耗尽（第 ${pageNum} 页）`);
      break;
    }
    if (pageNum < maxPages) await sleep(50);
  }

  for (const site of SITES) {
    log(`[每站最低] ${site}: ${siteArticles[site].length} 条`);
  }
  return dedupeById(SITES.flatMap((site) => siteArticles[site]));
}

/** 按内容日期过滤：仅保留与列表来源日（今日/回退日）一致的条目 */
function filterArticlesByModifiedDate(articles, log) {
  const today = chinaDateStr(0);
  const yesterday = chinaDateStr(-1);
  const before = articles.length;
  for (let i = articles.length - 1; i >= 0; i--) {
    const a = articles[i];
    const d = articleContentDateStr(a);
    if (!d) continue; // 日期未知时保留
    if (a._listSource === 'today' && d !== today) articles.splice(i, 1);
    else if (a._listSource === 'fallback' && d !== yesterday) articles.splice(i, 1);
  }
  if (before - articles.length > 0) {
    log(`日期过滤 (中国今日=${today}, 昨日=${yesterday}): 移除 ${before - articles.length} 条`);
  }
  articles.forEach((a) => { delete a._listSource; });
}

// ---------- crawl 主流程 ----------
// 选项：pageStart/pageEnd、search、searchPages、searchPageStart、todayOnly、
// minPerSite、replace、limit、outDir、concurrency、jsonPath、onLog、
// pushEvery（详情完成后每 N 条写入索引，默认 10）、onBatch（每批写入后回调）
async function crawl(opts = {}) {
  const pageStart = opts.pageStart || 1;
  const pageEnd = opts.pageEnd || opts.pageStart || 1;
  const searchKeyword = opts.search || null;
  const searchPages = opts.searchPages || 1;
  const searchPageStart = opts.searchPageStart || 1;
  const todayOnly = !!opts.todayOnly;
  const minPerSite = opts.minPerSite || 0;
  // 启动模式（todayOnly/minPerSite）为替换模式；UI 同步时合并/推送，除非 replace:true
  const replace = opts.replace != null ? !!opts.replace : (todayOnly || minPerSite > 0);
  const limit = opts.limit || 0;
  const outDir = path.resolve(opts.outDir || './output');
  const concurrency = opts.concurrency || 15;
  const pushEvery = Math.max(1, parseInt(opts.pushEvery, 10) || 10);
  const onBatch = typeof opts.onBatch === 'function' ? opts.onBatch : null;
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
  log(`=== crawler start | ${mode.label} | ${SITES.length} sites | concurrency=${concurrency} ===`);

  const eta = estimateCrawl({
    siteCount: SITES.length,
    concurrency,
    minPerSite,
    pageStart,
    pageEnd,
    search: searchKeyword,
    searchPages,
    todayOnly,
  });
  log(`预计耗时约 ${eta.estimateLabel}（${eta.rangeLabel}），约 ${eta.expectedArticles} 条 · ${eta.modeLabel}`);

  const newArticles = [];
  const collectedIds = new Set();
  const addUnique = (a) => {
    if (!collectedIds.has(a.id)) { collectedIds.add(a.id); newArticles.push(a); }
  };

  if (mode.type === 'list') {
    if (minPerSite > 0) {
      log(`--- 每站抓取最低 ${minPerSite} 条 ---`);
      const minArts = await fetchMinPerSite(minPerSite, log);
      for (const a of minArts) addUnique(a);
      log(`每站最低: 共 ${minArts.length} 条`);
    } else {
      log('--- 抓取今日（每站，空则回退）---');
      const todayArts = await fetchTodayPerSiteWithFallback(log);
      for (const a of todayArts) addUnique(a);
      log(`今日+回退: 共 ${todayArts.length} 条`);
    }
  }

  if (!todayOnly && minPerSite === 0) {
    const totalPages = searchKeyword ? searchPages : (pageEnd - pageStart + 1);
    for (let i = 0; i < totalPages; i++) {
      const pageNum = searchKeyword ? (searchPageStart + i) : (pageStart + i);
      const arts = await fetchListPageFromAllSites(pageNum, log, mode);
      for (const a of arts) addUnique(a);
      if (i < totalPages - 1) await sleep(50);
    }
  }

  log(`已收集 ${newArticles.length} 条不重复文章（来自 ${SITES.length} 个站点）`);
  if (limit > 0 && newArticles.length > limit) {
    newArticles.length = limit;
    log(`已限制为 ${limit} 条`);
  }

  // 按标题预过滤，避免浪费详情页请求在被排除的内容上
  filterExcluded(newArticles, 'title', log);

  if (newArticles.length === 0) {
    // 保留现有索引 — 抓取无结果时不擦除索引
    // （如所有站点暂时不可达或标题全部被排除）
    const existing = loadIndex(jsonPath);
    log('无文章可抓取，无需操作。');
    return { added: 0, total: existing.length, crawled: 0 };
  }

  // 2. 抓取详情页 -> 提取视频地址 + 标签 + 分类 + 真实封面 + 正文
  //    每完成 pushEvery 条即 merge 写入索引，避免全部结束后才一次性可见
  log(`--- 抓取详情页（每 ${pushEvery} 条写入）---`);

  const pendingPush = [];
  let flushedCount = 0;
  let incrementalAdded = 0;
  let flushChain = Promise.resolve();

  const flushBatch = (batch) => {
    if (!batch.length) return flushChain;
    flushChain = flushChain.then(async () => {
      const snapshot = batch.map((a) => {
        const copy = { ...a };
        delete copy._excluded;
        delete copy._listSource;
        return copy;
      });
      const existing = loadIndex(jsonPath);
      const { merged, added } = mergeIntoIndex(existing, snapshot);
      saveIndex(jsonPath, merged);
      incrementalAdded += added;
      flushedCount += snapshot.length;
      log(`  [push] 写入 ${snapshot.length} 条（累计 ${flushedCount}），索引共 ${merged.length} 条（+${added}）`);
      if (onBatch) {
        try {
          await onBatch({
            batch: snapshot.length,
            flushed: flushedCount,
            added,
            total: merged.length,
          });
        } catch (_) { /* 回调失败不影响爬取 */ }
      }
    });
    return flushChain;
  };

  const queuePush = (article) => {
    pendingPush.push(article);
    if (pendingPush.length < pushEvery) return flushChain;
    const batch = pendingPush.splice(0, pushEvery);
    return flushBatch(batch);
  };

  await mapWithConcurrency(newArticles, concurrency, async (a) => {
    try {
      const res = await getWithRetry(a.url, client, 3, headersFor(a.siteUrl));
      const detail = parseDetailPage(res.data);
      if (detail.title && !a.title) a.title = detail.title;
      if (detail.tags && detail.tags.length) a.tags = detail.tags;
      if (detail.category) a.category = detail.category;
      if (detail.coverUrl) a.coverUrl = detail.coverUrl;
      if (detail.datePublished) a.datePublished = detail.datePublished;
      if (detail.dateModified) a.dateModified = detail.dateModified;
      if (detail.content) a.content = detail.content;
      if (detail.images && detail.images.length) a.images = detail.images;
      if (detail.blocks && detail.blocks.length) a.blocks = detail.blocks;

      // 解析全部播放器；needsResolve 的并行解析
      const rawVideos = (detail.videos && detail.videos.length)
        ? detail.videos
        : (detail.video ? [detail.video] : []);
      const resolvedVideos = (await Promise.all(
        rawVideos.map((v) => resolveVideoEntry(a.siteUrl, { ...v }, log))
      )).filter(Boolean);
      a.videos = resolvedVideos;
      a.video = resolvedVideos[0] || null;

      log(`  [详情] ${a.id} ${resolvedVideos.length} 个视频 | 图片 ${(a.images || []).length} 张 | ${(a.title || '').slice(0, 40)}`);
    } catch (err) {
      log(`  [详情] ${a.id} 失败: ${err.message}`);
    }

    // 详情后按排除规则决定是否入库；命中则跳过推送
    if (matchesExclude(a)) {
      a._excluded = true;
      return;
    }
    await queuePush(a);
  });

  // 冲刷不足一整批的剩余条目
  if (pendingPush.length) {
    await flushBatch(pendingPush.splice(0, pendingPush.length));
  } else {
    await flushChain;
  }

  // 按标签后过滤（标签仅在详情解析后可用）
  filterExcluded(newArticles, 'tag', log);

  if (todayOnly) {
    filterArticlesByModifiedDate(newArticles, log);
  } else if (minPerSite === 0) {
    newArticles.forEach((a) => { delete a._listSource; });
  }

  if (newArticles.length === 0) {
    const existing = loadIndex(jsonPath);
    log('过滤后无剩余文章，保留现有索引。');
    return { added: 0, total: existing.length, updated: 0, crawled: 0 };
  }

  if (replace) {
    saveIndex(jsonPath, newArticles);
    if (onBatch) {
      try { await onBatch({ batch: newArticles.length, flushed: newArticles.length, added: newArticles.length, total: newArticles.length, final: true }); }
      catch (_) {}
    }
    const withVideo = newArticles.filter((a) => a.video && a.video.url).length;
    log(`完成（替换模式）。共 ${newArticles.length} 条 | ${withVideo} 条含视频地址 | 分批已推 ${flushedCount}`);
    return { added: newArticles.length, total: newArticles.length, updated: 0, crawled: newArticles.length };
  }

  // merge 模式：分批已写入；再全量 merge 一次确保最终一致
  const existing = loadIndex(jsonPath);
  const { merged, added, updated } = mergeIntoIndex(existing, newArticles);
  saveIndex(jsonPath, merged);
  if (onBatch) {
    try { await onBatch({ batch: 0, flushed: flushedCount, added, total: merged.length, final: true }); }
    catch (_) {}
  }
  const withVideo = merged.filter((a) => a.video && a.video.url).length;
  log(`完成（合并模式）。+${added} 新增, ~${updated} 更新 | 共 ${merged.length} 条 | ${withVideo} 条含视频地址 | 分批已推 ${flushedCount}（增量 +${incrementalAdded}）`);
  return { added, total: merged.length, updated, crawled: newArticles.length };
}

// ---------- 命令行入口 ----------

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
  const concurrency = parseInt(args.concurrency, 10) || 15;
  const todayOnly = !!args['today-only'];

  reloadSites();
  const eta = estimateCrawl({
    siteCount: SITES.length,
    concurrency,
    pageStart,
    pageEnd,
    search: args.search || null,
    searchPages,
    todayOnly,
  });
  console.log(`预计爬取约 ${eta.estimateLabel}（${eta.rangeLabel}），约 ${eta.expectedArticles} 条`);
  const stopCountdown = startConsoleCountdown(eta.estimateSec, '爬取进行中…');
  const t0 = Date.now();
  try {
    await crawl({
      pageStart,
      pageEnd,
      search: args.search || null,
      searchPages,
      todayOnly,
      replace: !!args.replace || todayOnly,
      limit: parseInt(args.limit, 10) || 0,
      outDir: args.out || './output',
      concurrency,
      jsonPath: args['save-json'] || './output/index.json',
    });
  } finally {
    stopCountdown();
    console.log(`实际耗时 ${formatDuration((Date.now() - t0) / 1000)}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('致命错误:', err);
    process.exit(1);
  });
}

module.exports = {
  crawl, parseDetailPage, resolvePlayerUrl, loadIndex, mergeIntoIndex,
  estimateCrawlTime,
  SITES, UA,
  loadSiteConfigs, saveSiteConfigs, reloadSites,
  getSiteConfigs, getSites, getBaseUrl,
};

/** 对外预估：自动带上当前启用站点数 */
function estimateCrawlTime(opts = {}) {
  reloadSites();
  return estimateCrawl({
    siteCount: SITES.length,
    concurrency: opts.concurrency || 15,
    minPerSite: opts.minPerSite || 0,
    pageStart: opts.pageStart || 1,
    pageEnd: opts.pageEnd || opts.pageStart || 1,
    search: opts.search || null,
    searchPages: opts.searchPages || 1,
    todayOnly: !!opts.todayOnly,
  });
}
