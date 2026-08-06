const axios = require('axios');
const cheerio = require('cheerio');
const site = 'https://armed.izbfsaxh.cc';

function absUrl(siteUrl, u) {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  try { return new URL(u, siteUrl).href; } catch (_) { return null; }
}

(async () => {
  const list = await axios.get(site + '/', {
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: site + '/' },
  });
  const $ = cheerio.load(list.data);
  const hrefs = [];
  $('a[href*="/archives/"]').each((_, a) => {
    const h = $(a).attr('href');
    if (h && hrefs.length < 8) hrefs.push(h.startsWith('http') ? h : site + h);
  });

  for (const url of hrefs) {
    const det = await axios.get(url, {
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: site + '/' },
    });
    const $d = cheerio.load(det.data);
    const n = $d('.dplayer').length;
    const $pc = $d('.post-content, div[itemprop="articleBody"]').first();
    // paragraphs text excluding ads
    const paras = [];
    $pc.find('p, h2, h3').each((_, el) => {
      const t = $d(el).text().replace(/\s+/g, ' ').trim();
      if (t && t.length > 8 && !/全国空降|春药|澳门娱乐|PG官方|开元棋牌/.test(t)) {
        paras.push(t.slice(0, 120));
      }
    });
    // images in post-content
    const imgs = [];
    $pc.find('img').each((_, img) => {
      const $i = $d(img);
      const raw = $i.attr('z-image-loader-url') || $i.attr('data-src') || $i.attr('src') || '';
      if (!raw || /\.gif/i.test(raw) || /\/usr\/(themes|plugins)\//i.test(raw)) return;
      // also check style background
      imgs.push(raw.slice(0, 120));
    });
    // also look for loadImage("...")
    const html = $pc.html() || '';
    const loadImgs = [...html.matchAll(/loadImage\(["']([^"']+)["']\)/g)].map((m) => m[1].slice(0, 120));
    console.log('---', url, 'dplayers=', n, 'paras=', paras.length, 'imgs=', imgs.length, 'loadImage=', loadImgs.length);
    if (paras[0]) console.log('  p0:', paras[0]);
    if (imgs[0]) console.log('  img0:', imgs[0]);
    if (loadImgs[0]) console.log('  load0:', loadImgs[0]);
    if (n > 1) {
      $d('.dplayer').each((i, div) => {
        const cfg = JSON.parse($d(div).attr('data-config') || '{}');
        console.log('  video', i, (cfg.video && cfg.video.url || cfg.url || '').slice(0, 80));
      });
    }
  }

  // also try breast theme
  const site2 = 'https://breast.eiejvjgex.cc';
  try {
    const list2 = await axios.get(site2 + '/', {
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: site2 + '/' },
    });
    const $2 = cheerio.load(list2.data);
    let href2 = null;
    $2('a[href*="/archives/"]').each((_, a) => { if (!href2) href2 = $2(a).attr('href'); });
    if (href2) {
      const url2 = href2.startsWith('http') ? href2 : site2 + href2;
      const det2 = await axios.get(url2, {
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: site2 + '/' },
      });
      const $d2 = cheerio.load(det2.data);
      console.log('\n=== breast theme ===', url2);
      console.log('dplayers', $d2('.dplayer').length);
      const classes = new Set();
      $d2('[class]').each((_, el) => {
        ($d2(el).attr('class') || '').split(/\s+/).forEach((x) => {
          if (/content|article|post|body|detail|rich|xqbj/i.test(x)) classes.add(x);
        });
      });
      console.log('classes', [...classes].slice(0, 40));
      const sels = ['.post-content', '.xqbj-article', '.article-content', 'div[itemprop="articleBody"]', '.content-body'];
      for (const s of sels) {
        const el = $d2(s).first();
        if (el.length) console.log('HIT', s, 'text', el.text().replace(/\s+/g, ' ').trim().slice(0, 80), 'imgs', el.find('img').length);
      }
    }
  } catch (e) {
    console.log('breast err', e.message);
  }
})().catch((e) => console.error(e));
