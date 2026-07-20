// Probe 91视频 (d1ve) player endpoint: is it our bug or upstream?
const axios = require('axios');
const cheerio = require('cheerio');
const { parseDetailPage, resolvePlayerUrl } = require('../crawler');

const site = 'https://d1ve8vvwughzqa.cloudfront.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const headers = {
  'User-Agent': UA,
  Referer: site + '/',
  Origin: site,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

async function get(url, extra = {}) {
  return axios.get(url, { timeout: 30000, maxRedirects: 5, headers: { ...headers, ...extra }, validateStatus: () => true, ...extra });
}

(async () => {
  console.log('=== 1) today list ===');
  const listRes = await get(site + '/category/jrxw1/');
  console.log('list status', listRes.status, 'finalURL', listRes.request?.res?.responseUrl || listRes.config.url);
  const $ = cheerio.load(typeof listRes.data === 'string' ? listRes.data : '');
  const ids = [];
  $('article a[href*="/archives/"]').each((_, a) => {
    const m = ($(a).attr('href') || '').match(/\/archives\/(\d+)/);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  });
  console.log('ids', ids.length, ids.slice(0, 8));
  if (!ids.length) {
    console.log('no articles — site list empty or theme changed');
    return;
  }

  const sample = ids.slice(0, 5);
  for (const id of sample) {
    console.log(`\n=== detail ${id} ===`);
    const detailRes = await get(`${site}/archives/${id}/`);
    console.log('detail status', detailRes.status);
    const html = typeof detailRes.data === 'string' ? detailRes.data : '';
    const $$ = cheerio.load(html);

    // raw dplayer configs
    const configs = [];
    $$('.dplayer').each((_, div) => {
      const cfg = $$(div).attr('data-config');
      configs.push(cfg);
      console.log('data-config raw:', (cfg || '').slice(0, 300));
      console.log('data-video_tag_name:', $$(div).attr('data-video_tag_name'));
    });
    if (!configs.length) {
      // search for player endpoints in page
      const m = html.match(/\/action\/player\/[^\s"'<>]+/g);
      console.log('action player matches', m && m.slice(0, 5));
      const m3u8 = html.match(/https?:\/\/[^"'\\s]+\.m3u8[^"'\\s]*/g);
      console.log('m3u8 in html', m3u8 && m3u8.slice(0, 3));
    }

    const detail = parseDetailPage(html);
    console.log('parsed video:', JSON.stringify(detail.video, null, 2));
    console.log('title:', (detail.title || '').slice(0, 40));

    if (detail.video && detail.video.url) {
      const playerPath = detail.video.url;
      const full = playerPath.startsWith('http') ? playerPath : site + playerPath;
      console.log('\n--- hit player endpoint ---');
      console.log('URL:', full);

      // Try several header variants sites often require
      const variants = [
        { name: 'site-referer', h: { Referer: site + '/', Origin: site, Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' } },
        { name: 'detail-referer', h: { Referer: `${site}/archives/${id}/`, Origin: site, Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' } },
        { name: 'bare', h: { Accept: '*/*' } },
      ];

      for (const v of variants) {
        const r = await get(full, { headers: { ...headers, ...v.h }, responseType: 'text' });
        const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
        console.log(`[${v.name}] status=${r.status} ct=${r.headers['content-type']} body=`, body.slice(0, 400));
        try {
          const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
          console.log(`[${v.name}] parsed keys`, j && typeof j === 'object' ? Object.keys(j) : typeof j);
          if (j && j.data) console.log(`[${v.name}] data=`, JSON.stringify(j.data).slice(0, 300));
        } catch (_) { /* not json */ }
      }

      // Our resolver
      const resolved = await resolvePlayerUrl(site, playerPath, (m) => console.log('  resolver:', m));
      console.log('resolvePlayerUrl =>', resolved);
    }
  }
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
