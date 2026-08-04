// 后端请求封装（fetchXxx / syncXxx）；调用方自行处理 loading / 错误

async function postJSON(url, body, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  // 后端未启动时可能落到 SPA 返回 HTML
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    const hint = text.startsWith('<!DOCTYPE') || text.startsWith('<html')
      ? '后端服务未启动或路由不存在（收到 HTML）'
      : `响应类型 ${ct || '未知'}`;
    throw new Error(`请求失败 (${res.status}): ${hint}`);
  }
  return res.json();
}

export async function fetchVideos(q, signal) {
  const url = q ? `/api/videos?q=${encodeURIComponent(q)}` : '/api/videos';
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

export async function fetchFavorites(signal) {
  const res = await fetch('/api/favorites', { signal });
  return res.json();
}

export async function addFavorite(item) {
  const res = await fetch('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  return res.json();
}

export async function removeFavorite(id) {
  const res = await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
  return res.json();
}

export function downloadFavorites(format) {
  window.location.href = `/api/favorites/download?format=${format}`;
}

export async function fetchSites(signal) {
  const res = await fetch('/api/sites', { signal });
  if (!res.ok) return { sites: [] };
  return res.json();
}

export async function syncCrawl(pageStart = 1, pageEnd = 1, signal) {
  return postJSON('/api/crawl', { pageStart, pageEnd }, signal);
}

export async function syncTags(tags, pages = 1, signal) {
  return postJSON('/api/sync-tags', { tags, pages }, signal);
}

export async function syncKeywords(keywords, signal) {
  return postJSON('/api/sync-keywords', { keywords }, signal);
}

export async function refreshVideo(id, signal) {
  const res = await fetch(`/api/refresh/${id}`, { signal });
  return res.json();
}

export async function fetchTags(signal) {
  const res = await fetch('/api/tags', { signal });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

export function hostnameOf(siteUrl) {
  if (!siteUrl) return '';
  try {
    return new URL(siteUrl).hostname;
  } catch (_) {
    return String(siteUrl);
  }
}

export function buildSiteNameMap(sites) {
  const m = new Map();
  (sites || []).forEach((s) => {
    if (s && s.url) m.set(s.url, s.name || s.url);
  });
  return m;
}

export function resolveSiteName(siteUrl, siteNameMap) {
  if (!siteUrl) return '未知来源';
  if (siteNameMap && siteNameMap.has(siteUrl)) return siteNameMap.get(siteUrl);
  const host = hostnameOf(siteUrl);
  return host || siteUrl;
}

export function formatDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
