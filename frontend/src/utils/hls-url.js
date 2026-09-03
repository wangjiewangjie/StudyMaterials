// frontend/src/utils/hls-url.js
// 浏览器侧：内联同一算法（与 lib/hls-url-core.js 保持同步）。
// Vite 不便直接吃根目录 CJS；核心逻辑变更时请两端一起改。

/** 递归解开 CDN 侧 /proxy/<编码后的真实地址> */
export function unwrapCdnProxyUrl(url, maxDepth = 8) {
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

function extractLocalProxyTarget(url) {
  if (!url) return url;
  if (/^\/proxy\//i.test(url)) {
    try {
      return decodeURIComponent(url.replace(/^\/proxy\//i, ''));
    } catch (_) {
      return url;
    }
  }
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin || !/^\/proxy\//i.test(u.pathname)) return url;
    return decodeURIComponent(u.pathname.replace(/^\/proxy\//i, ''));
  } catch (_) {
    return url;
  }
}

export function normalizeUpstreamUrl(url) {
  return unwrapCdnProxyUrl(extractLocalProxyTarget(url));
}

export function proxyUrl(url) {
  return `/proxy/${encodeURIComponent(normalizeUpstreamUrl(url))}`;
}

export function isAlreadyProxied(url) {
  if (!url) return false;
  if (/^\/proxy\//i.test(url)) return true;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && /^\/proxy\//i.test(u.pathname);
  } catch (_) {
    return false;
  }
}

export function shouldProxy(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (isAlreadyProxied(url)) return false;
  return true;
}
