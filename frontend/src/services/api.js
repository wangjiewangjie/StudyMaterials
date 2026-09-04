/**
 * services/api.js — 后端 HTTP 封装
 *
 * 约定：函数名 fetchXxx / syncXxx；loading / toast 由调用方处理。
 * 纯展示工具见 utils/format.js、utils/sites.js。
 */

/** POST JSON；非 JSON 响应时抛出可读错误（常见于后端未启动） */
async function postJSON(url, body, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
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

/** @param {string} [q] 本地标题/id 搜索词 */
export async function fetchVideos(q, signal) {
  const url = q ? `/api/videos?q=${encodeURIComponent(q)}` : '/api/videos';
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 收藏列表 { items, ids } */
export async function fetchFavorites(signal) {
  const res = await fetch('/api/favorites', { signal });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 新增收藏；body 为视频条目 */
export async function addFavorite(item) {
  const res = await fetch('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 按 id 取消收藏 */
export async function removeFavorite(id) {
  const res = await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 清空全部收藏 */
export async function clearAllFavoritesAPI() {
  const res = await fetch('/api/favorites', { method: 'DELETE' });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 触发浏览器下载收藏 JSON */
export function downloadFavorites() {
  window.location.href = '/api/favorites/download';
}

/** 站点配置列表；失败时返回 { sites: [] } */
export async function fetchSites(signal) {
  const res = await fetch('/api/sites', { signal });
  if (!res.ok) return { sites: [] };
  return res.json();
}

/**
 * 局域网访问信息（扫码）
 * @returns {Promise<{ ok: boolean, port: number, lanIps: string[], urls: string[] }>}
 */
export async function fetchAccessInfo(signal) {
  const res = await fetch('/api/access-info', { signal });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 全量列表同步（页码闭区间） */
export async function syncCrawl(pageStart = 1, pageEnd = 1, signal) {
  return postJSON('/api/crawl', { pageStart, pageEnd }, signal);
}

/** 按关键词同步；keywords 为字符串数组 */
export async function syncKeywords(keywords, signal) {
  return postJSON('/api/sync-keywords', { keywords }, signal);
}

/** 刷新单条详情/播放地址 */
export async function refreshVideo(id, signal) {
  const res = await fetch(`/api/refresh/${id}`, { signal });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 标签聚合列表 */
export async function fetchTags(signal) {
  const res = await fetch('/api/tags', { signal });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 数据目录信息（路径、缓存占用、日志归档） */
export async function fetchDataInfo(signal) {
  const res = await fetch('/api/data-info', { signal });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 打开系统文件管理器到数据目录 */
export async function openDataFolder() {
  return postJSON('/api/data/open-folder', {});
}

/** 触发浏览器下载整库备份 JSON */
export function downloadDataBackup() {
  window.location.href = '/api/data/export';
}

/** 导入整库备份对象 */
export async function importDataBackup(backup) {
  return postJSON('/api/data/import', backup);
}

/** 清除媒体缓存 */
export async function clearMediaCache() {
  return postJSON('/api/data/clear-cache', {});
}

/** 全部播放进度 */
export async function fetchWatchProgress(signal) {
  const res = await fetch('/api/watch-progress', { signal });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 写入单条播放进度 */
export async function putWatchProgress(id, body) {
  const res = await fetch(`/api/watch-progress/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
  return res.json();
}

/** 批量合并播放进度 */
export async function mergeWatchProgress(items) {
  return postJSON('/api/watch-progress/merge', { items });
}
