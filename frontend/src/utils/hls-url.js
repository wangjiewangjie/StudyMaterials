// frontend/src/utils/hls-url.js
// 浏览器侧 HLS URL 工具函数 — 从 VideoPlayer.jsx 抽取，统一维护。
// 与服务端 lib/hls-url.js 逻辑一致，但使用 window.location.origin。

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

/** 如果 url 是本地 /proxy/... 路径，解码出嵌入的目标地址 */
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

/** 最终上游 URL（解开 CDN proxy + 本地 proxy 壳） */
export function normalizeUpstreamUrl(url) {
  return unwrapCdnProxyUrl(extractLocalProxyTarget(url));
}

/** 构造本地代理 URL */
export function proxyUrl(url) {
  return '/proxy/' + encodeURIComponent(normalizeUpstreamUrl(url));
}

/** 判断 URL 是否已经是本地代理路径 */
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

/** 判断 URL 是否需要走代理（跨域且未被代理） */
export function shouldProxy(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (isAlreadyProxied(url)) return false;
  return true;
}
