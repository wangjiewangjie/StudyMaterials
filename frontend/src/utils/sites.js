/** 站点 URL / 主机名工具 */

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
    if (!s || !s.url) return;
    const name = s.name || s.url;
    m.set(s.url, name);
    const bare = String(s.url).replace(/\/+$/, '');
    if (bare) m.set(bare, name);
    const host = hostnameOf(s.url);
    if (host) m.set(host, name);
    for (const ln of s.lines || []) {
      if (ln.host) m.set(ln.host, name);
      if (ln.url) {
        m.set(String(ln.url).replace(/\/+$/, ''), name);
        const h = hostnameOf(ln.url);
        if (h) m.set(h, name);
      }
    }
  });
  return m;
}

export function resolveSiteName(siteUrl, siteNameMap) {
  if (!siteUrl) return '未知来源';
  if (siteNameMap) {
    if (siteNameMap.has(siteUrl)) return siteNameMap.get(siteUrl);
    const bare = String(siteUrl).replace(/\/+$/, '');
    if (siteNameMap.has(bare)) return siteNameMap.get(bare);
    const host = hostnameOf(siteUrl);
    if (host && siteNameMap.has(host)) return siteNameMap.get(host);
  }
  return hostnameOf(siteUrl) || siteUrl;
}
