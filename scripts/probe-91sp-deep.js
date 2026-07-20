// Dig deeper into 91视频 detail page for alternate play-url sources
const axios = require('axios');
const cheerio = require('cheerio');

const site = 'https://d1ve8vvwughzqa.cloudfront.net';
const id = process.argv[2] || '119868';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const jar = {}; // simple cookie jar
function storeCookies(res) {
  const set = res.headers['set-cookie'];
  if (!set) return;
  (Array.isArray(set) ? set : [set]).forEach((c) => {
    const part = String(c).split(';')[0];
    const eq = part.indexOf('=');
    if (eq > 0) jar[part.slice(0, eq)] = part.slice(eq + 1);
  });
}
function cookieHeader() {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(method, url, opts = {}) {
  const headers = {
    'User-Agent': UA,
    Referer: `${site}/archives/${id}/`,
    Origin: site,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Cookie: cookieHeader(),
    ...(opts.headers || {}),
  };
  const r = await axios({
    method,
    url,
    timeout: 30000,
    validateStatus: () => true,
    maxRedirects: 5,
    headers,
    data: opts.data,
    responseType: opts.responseType || 'text',
  });
  storeCookies(r);
  return r;
}

(async () => {
  console.log('=== fetch detail with cookies ===');
  const detail = await req('GET', `${site}/archives/${id}/`, {
    headers: { Accept: 'text/html,*/*', Referer: site + '/' },
  });
  console.log('status', detail.status, 'cookies', Object.keys(jar));
  const html = typeof detail.data === 'string' ? detail.data : '';
  const $ = cheerio.load(html);

  // Collect script srcs and inline snippets mentioning player / m3u8 / get_play
  const scriptSrcs = [];
  $('script[src]').each((_, el) => scriptSrcs.push($(el).attr('src')));
  console.log('script srcs', scriptSrcs.slice(0, 20));

  const inlineHits = [];
  $('script').each((_, el) => {
    const t = $(el).html() || '';
    if (/get_play|play_url|m3u8|player/i.test(t)) {
      inlineHits.push(t.slice(0, 500));
    }
  });
  console.log('inline player-related scripts:', inlineHits.length);
  inlineHits.slice(0, 5).forEach((t, i) => console.log(`--- inline ${i} ---\n`, t));

  // Search whole HTML for interesting endpoints
  const endpoints = new Set();
  const re = /\/action\/[a-zA-Z0-9_\/.?=&%-]+/g;
  let m;
  while ((m = re.exec(html))) endpoints.add(m[0]);
  console.log('\n/action/ endpoints in page:', [...endpoints]);

  const m3u8 = html.match(/https?:\/\/[^"'\\\s<>]+\.m3u8[^"'\\\s<>]*/g);
  console.log('direct m3u8 in html:', m3u8);

  // Try POST to get_play_url with common payloads
  const playUrl = `${site}/action/player/get_play_url?cid=${id}&idx=0`;
  console.log('\n=== GET with cookies after detail ===');
  let r = await req('GET', playUrl);
  console.log('GET', r.status, String(r.data).slice(0, 300));

  console.log('\n=== POST form cid/idx ===');
  r = await req('POST', `${site}/action/player/get_play_url`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: `cid=${id}&idx=0`,
  });
  console.log('POST form', r.status, String(r.data).slice(0, 300));

  console.log('\n=== POST json ===');
  r = await req('POST', `${site}/action/player/get_play_url`, {
    headers: { 'Content-Type': 'application/json' },
    data: { cid: Number(id), idx: 0 },
  });
  console.log('POST json', r.status, String(r.data).slice(0, 300));

  // Try without query idx variants
  for (const q of [`cid=${id}`, `cid=${id}&idx=0`, `cid=${id}&idx=1`, `id=${id}`]) {
    r = await req('GET', `${site}/action/player/get_play_url?${q}`);
    console.log(`GET ?${q}`, r.status, String(r.data).slice(0, 200));
  }

  // Fetch likely player JS if present
  const playerJs = scriptSrcs.find((s) => /player|dplayer|hls|video/i.test(s || ''));
  if (playerJs) {
    const abs = playerJs.startsWith('http') ? playerJs : site + playerJs;
    console.log('\n=== fetch player js ===', abs);
    const js = await req('GET', abs, { headers: { Accept: '*/*', Referer: `${site}/archives/${id}/` } });
    const body = String(js.data);
    console.log('js status', js.status, 'len', body.length);
    const hits = body.match(/get_play_url[^"'`]{0,80}|play_url[^"'`]{0,80}|\/action\/player[^"'`]{0,80}/g);
    console.log('js endpoint hits', hits && hits.slice(0, 15));
  }

  // Also try home then player (session warm-up)
  await req('GET', site + '/', { headers: { Accept: 'text/html,*/*', Referer: undefined } });
  r = await req('GET', playUrl);
  console.log('\nGET after homepage warm-up', r.status, String(r.data).slice(0, 300));
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
