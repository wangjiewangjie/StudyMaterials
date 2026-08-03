// scripts/probe-sites.js
// End-to-end reachability + parse probe for all configured crawler sites.
// Run: node scripts/probe-sites.js
//
// For each site it:
//   1. GETs the home page, reports HTTP status, final URL (after redirects),
//      number of /archives/<id>/ links found, and <title>.
//   2. Picks the first article, GETs its detail page, runs the crawler's own
//      parseDetailPage() on it, and reports whether a video URL was extracted
//      (and whether a d1ve-style player endpoint needed resolving).
//   3. Reports connect errors with the underlying reason.

const axios = require('axios');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { SITES, UA, parseDetailPage, resolvePlayerUrl } = require('../crawler.js');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16, timeout: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16, timeout: 30000 });

const client = axios.create({
  timeout: 30000,
  maxRedirects: 5,
  httpAgent,
  httpsAgent,
  headers: {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  },
});

function headersFor(site) {
  return { Referer: site + '/', Origin: site };
}

function pickFirstArchiveId(html) {
  const m = html.match(/\/archives\/(\d+)\//);
  return m ? m[1] : null;
}

function readTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

async function get(url, site) {
  return client.get(url, { headers: headersFor(site) });
}

async function probeSite(site) {
  const out = { site, ok: false, status: null, finalUrl: null, title: '', archives: 0, error: null,
                detail: { id: null, hasVideo: false, videoUrl: null, needsResolve: false, resolved: null, error: null } };
  let homeHtml = '';
  try {
    const res = await get(site + '/', site);
    out.status = res.status;
    out.finalUrl = res.request && res.request.res ? res.request.res.responseUrl : site + '/';
    homeHtml = typeof res.data === 'string' ? res.data : '';
    out.title = readTitle(homeHtml);
    const ids = new Set();
    for (const m of homeHtml.matchAll(/\/archives\/(\d+)\//g)) ids.add(m[1]);
    out.archives = ids.size;
  } catch (err) {
    out.error = err.code ? `${err.code}: ${err.message}` : (err.response ? `HTTP ${err.response.status} ${err.response.statusText}` : err.message);
    return out;
  }

  const firstId = pickFirstArchiveId(homeHtml);
  if (!firstId) {
    out.error = 'no /archives/<id>/ link found on home page';
    return out;
  }
  out.detail.id = firstId;

  try {
    const detailUrl = `${site}/archives/${firstId}/`;
    const res = await get(detailUrl, site);
    const detail = parseDetailPage(res.data);
    if (detail.video && detail.video.url) {
      out.detail.hasVideo = true;
      out.detail.videoUrl = detail.video.url;
      out.detail.needsResolve = !!detail.video.needsResolve;
      if (detail.video.needsResolve) {
        const resolved = await resolvePlayerUrl(site, detail.video.url, () => {});
        out.detail.resolved = resolved || null;
      }
    }
  } catch (err) {
    out.detail.error = err.code ? `${err.code}: ${err.message}` : (err.response ? `HTTP ${err.response.status}` : err.message);
  }

  out.ok = out.status === 200 && out.archives > 0;
  return out;
}

(async () => {
  console.log(`Probing ${SITES.length} sites...\n`);
  const results = [];
  for (const site of SITES) {
    process.stdout.write(`-> ${site} ... `);
    const r = await probeSite(site);
    results.push(r);
    process.stdout.write(`${r.status || 'ERR'} | ${r.archives} archives\n`);
  }

  console.log('\n=========== RESULTS ===========');
  for (const r of results) {
    console.log(`\n[${r.ok ? 'OK' : 'FAIL'}] ${r.site}`);
    console.log(`  status:     ${r.status || '-'}`);
    console.log(`  finalUrl:   ${r.finalUrl || '-'}`);
    console.log(`  title:      ${r.title || '-'}`);
    console.log(`  archives:   ${r.archives}`);
    if (r.error) console.log(`  error:      ${r.error}`);
    if (r.detail.id) {
      console.log(`  detail id:  ${r.detail.id}`);
      console.log(`  hasVideo:   ${r.detail.hasVideo}`);
      if (r.detail.hasVideo) {
        console.log(`  videoUrl:   ${r.detail.videoUrl.slice(0, 120)}`);
        console.log(`  needsResolve: ${r.detail.needsResolve}`);
        if (r.detail.needsResolve) console.log(`  resolved:   ${r.detail.resolved ? r.detail.resolved.slice(0, 120) : '(FAILED to resolve)'}`);
      }
      if (r.detail.error) console.log(`  detail err: ${r.detail.error}`);
    }
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n=== ${ok}/${results.length} sites usable ===`);
  process.exit(0);
})();
