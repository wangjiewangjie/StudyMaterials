// Temporary probe: inspect the player endpoint response shape for a site+cid.
const axios = require('axios');
const { UA } = require('./crawler');
const http = require('http');
const https = require('https');

const client = axios.create({
  timeout: 30000,
  maxRedirects: 5,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'zh-CN,zh;q=0.9' },
});

(async () => {
  const site = process.argv[2] || 'https://d1wyz1tskhmyvm.cloudfront.net';
  const cid = process.argv[3] || '115986';
  const url = `${site}/action/player/get_play_url?cid=${cid}&idx=0`;
  console.log('GET', url);
  try {
    const r = await client.get(url, { headers: { Referer: site + '/', Origin: site } });
    console.log('status', r.status, 'ct', r.headers['content-type']);
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    console.log('body (first 800):', String(body).slice(0, 800));
  } catch (e) {
    console.log('ERR', e.code || '', e.response ? `HTTP ${e.response.status}` : '', e.message);
    if (e.response && e.response.data) console.log('resp body:', String(e.response.data).slice(0, 400));
  }
})();
