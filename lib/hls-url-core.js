// lib/hls-url-core.js — 纯函数，无 module 包装；供 CJS / ESM 两端引用，避免双份算法。

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

function proxyUrl(url, localOrigin) {
  const origin = localOrigin
    || (typeof window !== 'undefined' && window.location && window.location.origin)
    || 'http://localhost';
  return '/proxy/' + encodeURIComponent(normalizeUpstreamUrl(url, origin));
}

function isAlreadyProxied(url, localOrigin) {
  if (!url) return false;
  if (/^\/proxy\//i.test(url)) return true;
  try {
    const origin = localOrigin
      || (typeof window !== 'undefined' && window.location && window.location.origin)
      || '';
    const u = new URL(url, origin || 'http://localhost');
    if (origin && u.origin !== origin) return false;
    return isLocalProxyPath(u.pathname);
  } catch (_) {
    return false;
  }
}

function shouldProxy(url, localOrigin) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (isAlreadyProxied(url, localOrigin)) return false;
  return true;
}

module.exports = {
  unwrapCdnProxyUrl,
  extractLocalProxyTarget,
  normalizeUpstreamUrl,
  proxyUrl,
  isAlreadyProxied,
  shouldProxy,
};
