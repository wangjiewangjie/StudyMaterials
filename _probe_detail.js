// Temporary probe: dump dplayer config + ticket-related JS from a detail page.
const axios = require('axios');
const { UA } = require('./crawler');
const http = require('http');
const https = require('https');

const client = axios.create({
  timeout: 30000,
  maxRedirects: 5,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9' },
});

(async () => {
  const site = process.argv[2] || 'https://d1wyz1tskhmyvm.cloudfront.net';
  const id = process.argv[3] || '115986';
  const url = `${site}/archives/${id}/`;
  const r = await client.get(url, { headers: { Referer: site + '/', Origin: site } });
  const html = typeof r.data === 'string' ? r.data : '';

  // dplayer data-config
  const cfgM = html.match(/<div[^>]*class="[^"]*dplayer[^"]*"[^>]*data-config="([^"]*)"[^>]*>/i);
  console.log('--- dplayer data-config (decoded) ---');
  if (cfgM) {
    const cfg = cfgM[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    console.log(cfg.slice(0, 600));
  } else {
    console.log('(no dplayer data-config found)');
  }

  // other data-* attrs on dplayer div
  const dpDiv = html.match(/<div[^>]*class="[^"]*dplayer[^"]*"[^>]*>/i);
  if (dpDiv) console.log('\n--- dplayer div attrs ---\n', dpDiv[0].slice(0, 800));

  // ticket / token / sign related JS
  console.log('\n--- ticket/token/sign mentions ---');
  const patterns = [/ticket[^"',;\s]{0,40}/gi, /token[^"',;\s]{0,40}/gi, /get_play_url[^"']{0,80}/gi, /sign[^"',;\s]{0,30}/gi, /票据[^"']{0,20}/g];
  const found = new Set();
  for (const p of patterns) {
    let m;
    while ((m = p.exec(html)) !== null) found.add(m[0]);
  }
  console.log([...found].slice(0, 30).join('\n') || '(none)');

  // script srcs that might contain the player logic
  console.log('\n--- script srcs ---');
  const srcs = new Set();
  const re = /<script[^>]+src="([^"]+)"/g;
  let m2;
  while ((m2 = re.exec(html)) !== null) srcs.add(m2[1]);
  console.log([...srcs].slice(0, 30).join('\n'));
})().catch((e) => { console.log('ERR', e.code || '', e.message); });
