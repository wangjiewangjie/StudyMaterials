// Temporary probe: ticket flow WITH manual cookie jar (capture Set-Cookie from ticket, replay on POST).
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

function parseSetCookies(headers) {
  // headers['set-cookie'] is an array of strings (node) or undefined
  const sc = headers['set-cookie'] || headers['Set-Cookie'];
  if (!sc) return [];
  const arr = Array.isArray(sc) ? sc : [sc];
  return arr.map((c) => c.split(';')[0]); // "name=value"
}

(async () => {
  const site = 'https://d1wyz1tskhmyvm.cloudfront.net';
  const cid = process.argv[2] || '115986';
  const idx = process.argv[3] || '0';
  const H = { Referer: site + '/', Origin: site };

  // Step 1: get ticket (capture cookies)
  const ticketUrl = `${site}/action/player/ticket?cid=${cid}&idx=${idx}`;
  console.log('1) GET', ticketUrl);
  const t = await client.get(ticketUrl, { headers: H });
  const cookies = parseSetCookies(t.headers);
  console.log('   set-cookie:', JSON.stringify(cookies));
  const tdata = typeof t.data === 'string' ? JSON.parse(t.data) : t.data;
  const ticket = tdata && tdata.data && tdata.data.ticket;
  console.log('   ticket:', ticket ? ticket.slice(0, 40) + '...' : '(none)');

  // Step 2: POST get_play_url WITH cookies
  const playUrl = `${site}/action/player/get_play_url?cid=${cid}&idx=${idx}`;
  console.log('\n2) POST', playUrl, '| cookies:', cookies.join('; '));
  const params = new URLSearchParams();
  params.append('ticket', ticket);
  params.append('env', JSON.stringify({ source: 'web', ua: UA }));
  const p = await client.post(playUrl, params.toString(), {
    headers: { ...H, Cookie: cookies.join('; '), 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const pdata = typeof p.data === 'string' ? p.data : JSON.stringify(p.data);
  console.log('   status', p.status, '| play resp (first 500):', String(pdata).slice(0, 500));
  let parsed = typeof p.data === 'string' ? null : p.data;
  if (!parsed) { try { parsed = JSON.parse(p.data); } catch (_) {} }
  const u = parsed && parsed.data && (Array.isArray(parsed.data) ? (parsed.data[0] && parsed.data[0].url) : (parsed.data.url || parsed.data));
  console.log('\n   => resolved url:', u ? u.slice(0, 100) : '(none)');
})().catch((e) => { console.log('ERR', e.code || e.response && e.response.status, e.message); });
