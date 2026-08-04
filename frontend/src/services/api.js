// API 服务层：统一封装所有后端请求，命名采用 fetchXxx / syncXxx。
// 所有请求返回 Promise，调用方负责 try/catch/finally 与 loading 处理。

// 通用 POST JSON 请求辅助函数
async function postJSON(url, body, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  // 响应非 JSON 时（如后端未启动命中 SPA fallback 返回 index.html）给出清晰报错
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

// 获取视频列表（可选关键词做本地搜索）
export async function fetchVideos(q, signal) {
  const url = q ? `/api/videos?q=${encodeURIComponent(q)}` : '/api/videos';
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

// 获取收藏列表
export async function fetchFavorites(signal) {
  const res = await fetch('/api/favorites', { signal });
  return res.json();
}

// 加入收藏
export async function addFavorite(item) {
  const res = await fetch('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  return res.json();
}

// 取消收藏
export async function removeFavorite(id) {
  const res = await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
  return res.json();
}

// 下载收藏（json / txt），直接触发浏览器下载
export function downloadFavorites(format) {
  window.location.href = `/api/favorites/download?format=${format}`;
}

// 获取站点配置
export async function fetchSites(signal) {
  const res = await fetch('/api/sites', { signal });
  if (!res.ok) return { sites: [] };
  return res.json();
}

// 抓取列表页同步（全量同步入口）
export async function syncCrawl(pageStart = 1, pageEnd = 1, signal) {
  return postJSON('/api/crawl', { pageStart, pageEnd }, signal);
}

// 多标签并行同步（保留的逗号分隔多标签能力）
export async function syncTags(tags, pages = 1, signal) {
  return postJSON('/api/sync-tags', { tags, pages }, signal);
}

// 关键词同步：多个关键词独立并行执行，每个最多 50 条，支持增量翻页
export async function syncKeywords(keywords, signal) {
  return postJSON('/api/sync-keywords', { keywords }, signal);
}

// 刷新单条视频的 m3u8 地址（auth_key 会过期）+ 标签/分类
export async function refreshVideo(id, signal) {
  const res = await fetch(`/api/refresh/${id}`, { signal });
  return res.json();
}

// 站点主机名提取，用于卡片来源标签
export function hostnameOf(siteUrl) {
  if (!siteUrl) return '';
  try {
    return new URL(siteUrl).hostname;
  } catch (_) {
    return String(siteUrl);
  }
}

// 由站点配置列表构建 url -> name 映射
export function buildSiteNameMap(sites) {
  const m = new Map();
  (sites || []).forEach((s) => {
    if (s && s.url) m.set(s.url, s.name || s.url);
  });
  return m;
}

// 解析单条数据源名称：优先站点配置名，其次主机名，最后回退占位
export function resolveSiteName(siteUrl, siteNameMap) {
  if (!siteUrl) return '未知来源';
  if (siteNameMap && siteNameMap.has(siteUrl)) return siteNameMap.get(siteUrl);
  const host = hostnameOf(siteUrl);
  return host || siteUrl;
}

// 日期格式化：仅保留 YYYY-MM-DD
export function formatDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
