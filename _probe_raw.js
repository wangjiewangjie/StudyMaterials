// Temporary probe: raw grep of detail HTML + dump verify.js / auth plugin.
const axios = require('axios');
const { UA } = require('./crawler');
const http = require('http');
const https = require('https');

const client = axios.create({
  timeout: 30000,
  maxRedirects: 5,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'zh-CN,zh;q=0.9' },
});

function show(name, html) {
  console.log('\n===== ' + name + ' =====');
  const idxs = [];
  const re = /dplayer|data-config|get_play_url|ticket|verify|artplayer|vodplayer/gi;
  let m;
  while ((m = re.exec(html)) !== null) idxs.push(m.index);
  // dedupe nearby
  const uniq = [];
  for (const i of idxs) { if (!uniq.length || i - uniq[uniq.length - 1] > 30) uniq.push(i); }
  for (const i of uniq.slice(0, 20)) {
    console.log('[@' + i + '] ...' + html.slice(Math.max(0, i - 60), i + 120).replace(/\n/g, ' ') + '...');
  }
}

(async () => {
  const site = 'https://d1wyz1tskhmyvm.cloudfront.net';
  const id = process.argv[2] || '115986';
  const r = await client.get(`${site}/archives/${id}/`, { headers: { Referer: site + '/' } });
  const html = typeof r.data === 'string' ? r.data : '';
  show('detail HTML mentions', html);

  // dump verify.js
  console.log('\n\n===== verify.js (first 2000 chars) =====');
  try {
    const v = await client.get(`${site}/usr/plugins/ArtPlayer/assets/verify.js`, { headers: { Referer: site + '/' } });
    console.log(String(v.data).slice(0, 2000));
  } catch (e) { console.log('verify.js ERR', e.code || e.response && e.response.status, e.message); }
})().catch((e) => { console.log('ERR', e.code || '', e.message); });
