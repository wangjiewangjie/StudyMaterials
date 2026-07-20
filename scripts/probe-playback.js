// scripts/probe-playback.js — diagnose HLS playback failures via local proxy
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const index = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'output', 'index.json'), 'utf8'));
const withVideo = index.filter((a) => a.video && a.video.url).slice(0, 5);

function ms(t0) {
  return Date.now() - t0;
}

async function probeOne(item) {
  const result = { id: item.id, title: (item.title || '').slice(0, 36), steps: [] };
  const tAll = Date.now();

  // 1) refresh
  let m3u8Url = item.video.url;
  try {
    const t0 = Date.now();
    const r = await axios.get(`${BASE}/api/refresh/${item.id}`, { timeout: 60000 });
    result.steps.push({ step: 'refresh', ok: !!r.data.ok, ms: ms(t0), hasVideo: !!(r.data.video && r.data.video.url) });
    if (r.data.video && r.data.video.url) m3u8Url = r.data.video.url;
  } catch (e) {
    result.steps.push({
      step: 'refresh',
      ok: false,
      ms: ms(tAll),
      error: e.code || e.message,
      status: e.response && e.response.status,
    });
    result.failedAt = 'refresh';
    return result;
  }

  // 2) proxy m3u8
  let playlistText = '';
  try {
    const t0 = Date.now();
    const r = await axios.get(`${BASE}/proxy/${encodeURIComponent(m3u8Url)}`, {
      timeout: 60000,
      responseType: 'text',
      validateStatus: () => true,
    });
    playlistText = typeof r.data === 'string' ? r.data : String(r.data);
    const isM3u = playlistText.includes('#EXTM3U');
    result.steps.push({
      step: 'proxy-m3u8',
      ok: r.status === 200 && isM3u,
      ms: ms(t0),
      status: r.status,
      bytes: Buffer.byteLength(playlistText),
      head: playlistText.slice(0, 120).replace(/\n/g, '\\n'),
      error: r.status !== 200 ? playlistText.slice(0, 200) : (!isM3u ? 'not m3u8' : undefined),
    });
    if (r.status !== 200 || !isM3u) {
      result.failedAt = 'proxy-m3u8';
      return result;
    }
  } catch (e) {
    result.steps.push({
      step: 'proxy-m3u8',
      ok: false,
      ms: Date.now() - tAll,
      error: e.code || e.message,
      status: e.response && e.response.status,
    });
    result.failedAt = 'proxy-m3u8';
    return result;
  }

  // 3) find key + first segment from rewritten playlist
  const keyMatch = playlistText.match(/URI="([^"]+)"/i);
  const lines = playlistText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let segPath = lines.find((l) => !l.startsWith('#') && (/\/proxy\//.test(l) || /^https?:/.test(l)));

  if (keyMatch) {
    const keyUrl = keyMatch[1].startsWith('http') ? keyMatch[1] : (keyMatch[1].startsWith('/') ? `${BASE}${keyMatch[1]}` : keyMatch[1]);
    try {
      const t0 = Date.now();
      const r = await axios.get(keyUrl.startsWith('/') ? `${BASE}${keyUrl}` : (keyUrl.startsWith('/proxy') ? `${BASE}${keyUrl}` : `${BASE}/proxy/${encodeURIComponent(keyUrl)}`), {
        timeout: 60000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      // fix: key URLs in rewritten playlist are already /proxy/...
      result.steps.push({
        step: 'proxy-key',
        ok: r.status === 200 && r.data && r.data.byteLength > 0,
        ms: ms(t0),
        status: r.status,
        bytes: r.data ? r.data.byteLength : 0,
        error: r.status !== 200 ? Buffer.from(r.data || '').toString('utf8').slice(0, 200) : undefined,
      });
      if (r.status !== 200) result.failedAt = result.failedAt || 'proxy-key';
    } catch (e) {
      result.steps.push({ step: 'proxy-key', ok: false, error: e.code || e.message, status: e.response && e.response.status });
      result.failedAt = result.failedAt || 'proxy-key';
    }
  } else {
    result.steps.push({ step: 'proxy-key', ok: true, skipped: true, note: 'no EXT-X-KEY URI' });
  }

  if (segPath) {
    const segUrl = segPath.startsWith('/proxy') ? `${BASE}${segPath}` : `${BASE}/proxy/${encodeURIComponent(segPath)}`;
    try {
      const t0 = Date.now();
      const r = await axios.get(segUrl, {
        timeout: 90000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
        maxContentLength: 20 * 1024 * 1024,
      });
      result.steps.push({
        step: 'proxy-segment',
        ok: r.status === 200 && r.data && r.data.byteLength > 100,
        ms: ms(t0),
        status: r.status,
        bytes: r.data ? r.data.byteLength : 0,
        error: r.status !== 200 ? Buffer.from(r.data || '').toString('utf8').slice(0, 200) : undefined,
      });
      if (r.status !== 200) result.failedAt = result.failedAt || 'proxy-segment';
    } catch (e) {
      result.steps.push({
        step: 'proxy-segment',
        ok: false,
        error: e.code || e.message,
        status: e.response && e.response.status,
      });
      result.failedAt = result.failedAt || 'proxy-segment';
    }
  } else {
    result.steps.push({ step: 'proxy-segment', ok: false, error: 'no segment line found' });
    result.failedAt = result.failedAt || 'proxy-segment';
  }

  result.totalMs = ms(tAll);
  result.ok = !result.failedAt && result.steps.every((s) => s.ok || s.skipped);
  return result;
}

(async () => {
  console.log(`Probing ${withVideo.length} videos via ${BASE}...\n`);
  const results = [];
  for (const item of withVideo) {
    process.stdout.write(`#${item.id} ... `);
    const r = await probeOne(item);
    results.push(r);
    console.log(r.ok ? `OK ${r.totalMs}ms` : `FAIL at ${r.failedAt}`);
    for (const s of r.steps) {
      console.log('  ', JSON.stringify(s));
    }
    console.log('');
  }
  const failed = results.filter((r) => !r.ok);
  console.log('--- summary ---');
  console.log(`ok=${results.length - failed.length} fail=${failed.length}`);
  const timeouts = results.flatMap((r) => r.steps).filter((s) => /timeout|ETIMEDOUT|ECONNABORTED/i.test(String(s.error || '')));
  console.log(`timeout-like steps: ${timeouts.length}`);
  if (timeouts.length) console.log(timeouts);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
