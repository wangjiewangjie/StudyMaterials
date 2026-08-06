const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const site = 'https://armed.izbfsaxh.cc';
const url = site + '/archives/119537/';

(async () => {
  const det = await axios.get(url, {
    timeout: 30000,
    maxRedirects: 0,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0', Referer: site + '/' },
    validateStatus: (s) => s < 400,
  }).catch(async (e) => {
    // retry without redirect limit
    return axios.get(url, {
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: site + '/' },
    });
  });
  const $ = cheerio.load(det.data);
  const $pc = $('.post-content').first();
  const html = $pc.html() || '';
  fs.writeFileSync('c:/JingYi/StudyMaterials/_sample_post.html', html.slice(0, 50000), 'utf8');

  // image patterns
  const patterns = {
    loadImage: [...html.matchAll(/loadImage\(["']([^"']+)["']\)/g)].map((m) => m[1]),
    zImage: [],
    src: [],
    dataSrc: [],
    background: [...html.matchAll(/url\(["']?(https?:\/\/[^"')]+)["']?\)/gi)].map((m) => m[1]),
    httpsInHtml: [...html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi)].map((m) => m[0]),
  };
  $pc.find('img').each((_, img) => {
    const $i = $(img);
    if ($i.attr('z-image-loader-url')) patterns.zImage.push($i.attr('z-image-loader-url'));
    if ($i.attr('src')) patterns.src.push($i.attr('src'));
    if ($i.attr('data-src')) patterns.dataSrc.push($i.attr('data-src'));
  });
  for (const [k, v] of Object.entries(patterns)) {
    console.log(k, v.length, v.slice(0, 3));
  }

  // text extraction - clean ads
  const AD_RE = /全国空降|春药|澳门|PG官方|开元棋牌|太阳城|金沙直播|免费转|欲洛降临|33直播|91免费看|51免费看|海角乱伦|91短视频|91PO|91吃瓜最新地址|91vip/i;
  const blocks = [];
  $pc.children().each((_, el) => {
    const tag = el.tagName;
    if (tag === 'div' && ($(el).hasClass('dplayer') || $(el).find('.dplayer').length)) return;
    if (tag === 'script' || tag === 'style') return;
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (!t || t.length < 4) return;
    if (AD_RE.test(t) && t.length < 200) return;
    blocks.push({ tag, t: t.slice(0, 150) });
  });
  console.log('blocks', blocks.length);
  console.log(blocks.slice(0, 15));

  // find pages with multi dplayer - search more archives from category
  const cat = await axios.get(site + '/category/zxcghl/', {
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: site + '/' },
  });
  const $c = cheerio.load(cat.data);
  const links = [];
  $c('a[href*="/archives/"]').each((_, a) => {
    const h = $c(a).attr('href');
    if (!h) return;
    const full = h.startsWith('http') ? h : site + h;
    if (!links.includes(full) && links.length < 15) links.push(full);
  });
  console.log('checking', links.length, 'for multi-dplayer');
  for (const u of links) {
    try {
      const r = await axios.get(u, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: site + '/' },
      });
      const n = (r.data.match(/class="dplayer"/g) || []).length;
      if (n !== 1) console.log(n, u);
      else process.stdout.write('.');
    } catch (e) {
      process.stdout.write('x');
    }
  }
  console.log('done');
})().catch((e) => console.error(e.message));
