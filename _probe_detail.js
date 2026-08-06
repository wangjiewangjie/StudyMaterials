const axios = require('axios');
const cheerio = require('cheerio');
const site = 'https://armed.izbfsaxh.cc';

(async () => {
  try {
    const list = await axios.get(site + '/', {
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: site + '/' },
    });
    const $ = cheerio.load(list.data);
    let href = null;
    $('a[href*="/archives/"]').each((_, a) => {
      if (!href) href = $(a).attr('href');
    });
    console.log('list ok, first', href);
    if (!href) return;
    const url = href.startsWith('http') ? href : site + href;
    const det = await axios.get(url, {
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: site + '/' },
    });
    const $d = cheerio.load(det.data);
    console.log('dplayers', $d('.dplayer').length);
    console.log('title', $d('h1').first().text().trim().slice(0, 60));

    const sels = [
      '.post-content', '.article-content', '.entry-content', 'article .content',
      '.markdown-body', '.post-body', '#post-content', '.xqbj-article',
      '.article-body', 'div[itemprop="articleBody"]', '.post-card-content',
      '.post-article', '.article-main', '.detail-content', '.content-body',
      '.post .content', 'article.post', '.main-content',
    ];
    for (const s of sels) {
      const el = $d(s).first();
      if (el.length) {
        console.log(
          'HIT', s,
          'textLen', el.text().replace(/\s+/g, ' ').trim().slice(0, 100),
          'imgs', el.find('img').length
        );
      }
    }

    const classes = new Set();
    $d('[class]').each((_, el) => {
      const c = $d(el).attr('class') || '';
      c.split(/\s+/).forEach((x) => {
        if (/content|article|post|body|detail|text|desc|rich/i.test(x)) classes.add(x);
      });
    });
    console.log('sample classes', [...classes].slice(0, 50));

    const imgs = [];
    $d('img').each((_, img) => {
      const $i = $d(img);
      imgs.push({
        src: ($i.attr('src') || '').slice(0, 100),
        z: ($i.attr('z-image-loader-url') || '').slice(0, 100),
        data: ($i.attr('data-src') || '').slice(0, 100),
        cls: ($i.attr('class') || '').slice(0, 50),
      });
    });
    console.log('img count', imgs.length);
    console.log(JSON.stringify(imgs.slice(0, 10), null, 2));

    $d('.dplayer').each((i, div) => {
      console.log(
        'dp', i,
        'parent', $d(div).parent().attr('class'),
        'cfg', ($d(div).attr('data-config') || '').slice(0, 150)
      );
    });

    // dump a snippet of body structure
    const bodyHtml = $d('body').html() || '';
    const idx = bodyHtml.indexOf('dplayer');
    if (idx >= 0) console.log('around dplayer:', bodyHtml.slice(Math.max(0, idx - 200), idx + 300).replace(/\s+/g, ' '));
  } catch (e) {
    console.error('ERR', e.message);
  }
})();
