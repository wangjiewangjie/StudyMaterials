// Temporary probe script for a new site. Deleted after use.
const axios = require('axios');
const cheerio = require('cheerio');
const { UA, parseDetailPage, resolvePlayerUrl } = require('./crawler');
const http = require('http');
const https = require('https');

const client = axios.create({
  timeout: 30000,
  maxRedirects: 5,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9' },
});

function headersFor(site) { return { Referer: site + '/', Origin: site }; }

(async () => {
  const site = process.argv[2] || 'https://d1wyz1tskhmyvm.cloudfront.net';
  console.log('=== probing', site, '===');
  const res = await client.get(site + '/', { headers: headersFor(site) });
  const html = typeof res.data === 'string' ? res.data : '';
  const $ = cheerio.load(html);

  console.log('--- nav category links (label -> slug) ---');
  const seen = new Set();
  $('a[href*="/category/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const txt = ($(a).text() || '').replace(/\s+/g, ' ').trim();
    const m = href.match(/\/category\/([^\/?#]+)/);
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);
    console.log('  ', JSON.stringify(txt.slice(0, 16)), '->', m[1]);
  });

  // pick first article id
  const idM = html.match(/\/archives\/(\d+)\//);
  if (!idM) { console.log('no archive id found'); return; }
  const id = idM[1];
  console.log('\n--- detail probe id=', id, '---');
  const detailUrl = `${site}/archives/${id}/`;
  const dr = await client.get(detailUrl, { headers: headersFor(site) });
  const detail = parseDetailPage(dr.data);
  console.log('  title:', (detail.title || '').slice(0, 60));
  console.log('  coverUrl:', detail.coverUrl ? detail.coverUrl.slice(0, 80) : '(none)');
  console.log('  datePublished:', detail.datePublished);
  console.log('  category:', detail.category);
  console.log('  tags:', JSON.stringify(detail.tags));
  console.log('  video:', detail.video ? { url: String(detail.video.url).slice(0, 90), type: detail.video.type, needsResolve: !!detail.video.needsResolve } : '(none)');
  if (detail.video && detail.video.needsResolve) {
    const resolved = await resolvePlayerUrl(site, detail.video.url, () => {});
    console.log('  resolved:', resolved ? resolved.slice(0, 90) : '(FAILED)');
  }
})().catch((e) => { console.log('ERR', e.code || '', e.message); });
