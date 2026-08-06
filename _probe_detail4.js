const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const site = 'https://armed.izbfsaxh.cc';

(async () => {
  // get list first for a valid article
  const list = await axios.get(site + '/', {
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Referer: site + '/',
      Accept: 'text/html',
    },
  });
  const $l = cheerio.load(list.data);
  let href = null;
  $l('article a[href*="/archives/"]').each((_, a) => {
    if (!href) href = $l(a).attr('href');
  });
  console.log('href', href);
  const url = href.startsWith('http') ? href : site + href;

  const det = await axios.get(url, {
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Referer: site + '/',
      Accept: 'text/html',
    },
  });
  console.log('status', det.status, 'len', String(det.data).length, 'final?', det.request?.res?.responseUrl);
  const $ = cheerio.load(det.data);
  console.log('post-content len', $('.post-content').length, 'htmlLen', ($('.post-content').html() || '').length);
  console.log('dplayers', $('.dplayer').length);
  console.log('itemprop body', $('div[itemprop="articleBody"]').length);

  const $pc = $('.post-content').first();
  const html = $pc.html() || '';
  fs.writeFileSync('c:/JingYi/StudyMaterials/_sample_post.html', html.slice(0, 80000), 'utf8');

  // Find how images appear - look at raw HTML snippets with <img or http
  const imgTags = [...html.matchAll(/<img[^>]{0,400}>/gi)].slice(0, 5);
  console.log('img tags in post-content', imgTags.length);
  imgTags.forEach((m, i) => console.log(i, m[0].slice(0, 250)));

  const https = [...html.matchAll(/https?:\/\/[^\s"'<>]+/gi)].slice(0, 20);
  console.log('https urls sample', https.map((m) => m[0].slice(0, 120)));

  // paragraphs
  $pc.find('p').each((i, el) => {
    if (i >= 8) return;
    console.log('p', i, $(el).text().replace(/\s+/g, ' ').trim().slice(0, 100));
  });

  // check assert site for multi video
  for (const s of ['https://assert.pbtiodqn.cc', 'https://band.hkllewakv.cc']) {
    try {
      const lr = await axios.get(s + '/', {
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: s + '/' },
      });
      const $a = cheerio.load(lr.data);
      const links = [];
      $a('a[href*="/archives/"]').each((_, a) => {
        const h = $a(a).attr('href');
        if (!h) return;
        const full = h.startsWith('http') ? h : s + h;
        if (!links.includes(full) && links.length < 6) links.push(full);
      });
      for (const u of links) {
        const r = await axios.get(u, {
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: s + '/' },
        });
        const n = cheerio.load(r.data)('.dplayer').length;
        console.log(s.split('//')[1].slice(0, 12), n, 'dplayers', u.slice(-30));
      }
    } catch (e) {
      console.log(s, 'err', e.message);
    }
  }
})().catch((e) => console.error('FAIL', e.message));
