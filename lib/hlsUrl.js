// lib/hlsUrl.js — normalize HLS media URLs (unwrap CDN /proxy/ layers, peel local /proxy/ shell)

/** Peel CDN-side /proxy/<encoded-url> layers (e.g. hls.dscxru.cn/proxy/https%3A%2F%2F...) */
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

/** If url is our /proxy/... path, decode to the embedded target. */
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

/** Final upstream URL to fetch (unwrap CDN proxies + local proxy shell). */
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
