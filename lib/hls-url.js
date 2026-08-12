// lib/hls-url.js — 规范化 HLS 地址（剥掉 CDN / 本地 /proxy/ 嵌套层）

/** 递归解开 CDN 侧 /proxy/<编码后的真实地址> */
function unwrapCdnProxyUrl(url, maxDepth = 8) {
  if (!url || typeof url !== 'string') return url;
  let current = url;
  for (let i = 0; i < maxDepth; i++) {
    let u;
    try {
      u = new URL(current);
    } catch (_) {
      break;
    }
    const m = u.pathname.match(/^\/proxy\/(.+)$/i);
    if (!m) break;
    let inner;
    try {
      inner = decodeURIComponent(m[1]);
    } catch (_) {
      break;
    }
    if (!/^https?:\/\//i.test(inner)) break;
    current = inner;
  }
  return current;
}

function isLocalProxyPath(pathname) {
  return /^\/proxy\//i.test(pathname || '');
}

/** 如果 url 是本机 /proxy/... 路径，解码出内嵌的目标地址 */
function extractLocalProxyTarget(url, localOrigin) {
  if (!url) return url;
  if (/^\/proxy\//i.test(url)) {
    try {
      return decodeURIComponent(url.replace(/^\/proxy\//i, ''));
    } catch (_) {
      return url;
    }
  }
  try {
    const u = new URL(url, localOrigin || 'http://localhost');
    if (localOrigin && u.origin !== localOrigin) return url;
    if (!isLocalProxyPath(u.pathname)) return url;
    return decodeURIComponent(u.pathname.replace(/^\/proxy\//i, ''));
  } catch (_) {
    return url;
  }
}

/** 最终上游请求地址（展开 CDN 代理 + 本机代理外壳） */
function normalizeUpstreamUrl(url, localOrigin) {
  const embedded = extractLocalProxyTarget(url, localOrigin);
  return unwrapCdnProxyUrl(embedded);
}

module.exports = {
  unwrapCdnProxyUrl,
  extractLocalProxyTarget,
  normalizeUpstreamUrl,
  isLocalProxyPath,
};
