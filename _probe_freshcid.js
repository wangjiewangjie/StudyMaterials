// Temporary probe: pick a FRESH article id from homepage, run ticket flow exactly once.
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
  const H = { Referer: site + '/', Origin: site };

  // 1. find a fresh id from homepage
  const home = await client.get(site + '/', { headers: H });
  const ids = [...new Set([...String(home.data).matchAll(/\/archives\/(\d+)\//g)].map((m) => m[1]))];
  const tried = new Set(['115986']);
  const fresh = ids.find((id) => !tried.has(id));
  console.log('fresh id from homepage:', fresh, '(of', ids.length, 'ids)');
  if (!fresh) { console.log('no fresh id'); return; }

  // 2. fetch detail to confirm it has the player url
  const dr = await client.get(`${site}/archives/${fresh}/`, { headers: H });
  const cfgM = String(dr.data).match(/data-config='([^']*)'/);
  let playPath = null;
  if (cfgM) {
    try { playPath = JSON.parse(cfgM[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')).url; } catch (_) {}
  }
  console.log('player path from detail:', playPath);
  if (!playPath) { console.log('no player url in detail'); return; }

  // 3. ticket flow ONCE: GET ticket -> immediate POST
  const fullPlay = site + playPath;
  const ticketUrl = fullPlay.replace('/get_play_url', '/ticket');
  const cidM = playPath.match(/cid=(\d+)/);
  console.log('\n1) GET', ticketUrl);
  const t = await client.get(ticketUrl, { headers: H });
  const tdata = typeof t.data === 'string' ? JSON.parse(t.data) : t.data;
  const ticket = tdata && tdata.data && tdata.data.ticket;
  console.log('   ticket resp status:', tdata.status, 'msg:', tdata.msg, '| ticket:', ticket ? ticket.slice(0, 48) + '...' : '(none)');

  if (ticket) {
    const params = new URLSearchParams();
    params.append('ticket', ticket);
    params.append('env', JSON.stringify({ source: 'web', ua: UA, cid: cidM && cidM[1] }));
    console.log('\n2) POST', fullPlay);
    const p = await client.post(fullPlay, params.toString(), {
      headers: { ...H, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const pdata = typeof p.data === 'string' ? p.data : JSON.stringify(p.data);
    console.log('   play resp (first 600):', String(pdata).slice(0, 600));
    let parsed = typeof p.data === 'string' ? null : p.data;
    if (!parsed) { try { parsed = JSON.parse(p.data); } catch (_) {} }
    const u = parsed && parsed.data && (Array.isArray(parsed.data) ? (parsed.data[0] && parsed.data[0].url) : (parsed.data.url || parsed.data));
    console.log('\n   => resolved url:', u ? u.slice(0, 110) : '(NONE - ticket flow did not yield m3u8)');
  }
})().catch((e) => { console.log('ERR', e.code || e.response && e.response.status, e.message); });
