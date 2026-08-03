// Temporary probe: dump the ArtPlayer authentication plugin to understand ticket flow.
const axios = require('axios');
const { UA } = require('./crawler');
const https = require('https');
const http = require('http');

const client = axios.create({
  timeout: 30000,
  maxRedirects: 5,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'zh-CN,zh;q=0.9' },
});

(async () => {
  const site = 'https://d1wyz1tskhmyvm.cloudfront.net';
  const paths = [
    '/usr/plugins/ArtPlayer/assets/artplayer-plugin-authentication.min.js?v=20260731-hevc-native-ticket-1',
  ];
  for (const p of paths) {
    console.log('\n===== ' + p + ' =====');
    try {
      const r = await client.get(site + p, { headers: { Referer: site + '/' } });
      const body = String(r.data);
      console.log('len', body.length);
      // Print endpoints / fetch / ajax / ticket / sign / key mentions
      const re = /(\/action\/[^"'\s]+|get_play_url|ticket|sign|token|\.ajax\([^)]*\)|fetch\([^)]*\)|url:\s*["'][^"']+["'])/gi;
      const seen = new Set();
      let m;
      while ((m = re.exec(body)) !== null) seen.add(m[0]);
      console.log('--- matched fragments ---');
      console.log([...seen].slice(0, 40).join('\n'));
      // Also dump a chunk around 'ticket'
      const ti = body.search(/ticket/i);
      if (ti >= 0) console.log('\n--- around first "ticket" ---\n', body.slice(Math.max(0, ti - 300), ti + 600));
    } catch (e) { console.log('ERR', e.code || e.response && e.response.status, e.message); }
  }
})().catch((e) => { console.log('ERR', e.code || '', e.message); });
