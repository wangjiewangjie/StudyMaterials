// Temporary probe: validate the two-step ticket flow end-to-end.
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
  const cid = process.argv[2] || '115986';
  const idx = process.argv[3] || '0';
  const H = { Referer: site + '/', Origin: site };

  // Step 1: get ticket
  const ticketUrl = `${site}/action/player/ticket?cid=${cid}&idx=${idx}`;
  console.log('1) GET', ticketUrl);
  const t = await client.get(ticketUrl, { headers: H });
  console.log('   status', t.status, '| ct', t.headers['content-type']);
  const tdata = typeof t.data === 'string' ? JSON.parse(t.data) : t.data;
  console.log('   ticket resp:', JSON.stringify(tdata).slice(0, 300));
  const ticket = tdata && tdata.data && (tdata.data.ticket || tdata.data);
  if (!ticket || typeof ticket !== 'string') { console.log('   NO TICKET — abort'); return; }
  console.log('   ticket:', ticket.slice(0, 40) + '...');

  // Step 2: POST get_play_url with ticket + minimal env
  const playUrl = `${site}/action/player/get_play_url?cid=${cid}&idx=${idx}`;
  console.log('\n2) POST', playUrl);
  // jQuery $.ajax default => form-urlencoded
  const params = new URLSearchParams();
  params.append('ticket', ticket);
  params.append('env', JSON.stringify({ source: 'web', ua: UA }));
  const p = await client.post(playUrl, params.toString(), {
    headers: { ...H, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  console.log('   status', p.status, '| ct', p.headers['content-type']);
  const pdata = typeof p.data === 'string' ? p.data : JSON.stringify(p.data);
  console.log('   play resp (first 500):', String(pdata).slice(0, 500));
  // try to extract url
  let parsed = typeof p.data === 'string' ? null : p.data;
  if (!parsed) { try { parsed = JSON.parse(p.data); } catch (_) {} }
  const u = parsed && parsed.data && (Array.isArray(parsed.data) ? (parsed.data[0] && parsed.data[0].url) : parsed.data.url);
  console.log('\n   => resolved url:', u ? u.slice(0, 100) : '(none)');
})().catch((e) => { console.log('ERR', e.code || e.response && e.response.status, e.message); });
