import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchVideos, fetchFavorites, addFavorite, removeFavorite, fetchSites, hostnameOf,
} from '../services/api.js';

// 站点名称映射默认值，与 crawler.js 的 DEFAULT_SITE_CONFIGS 一致；
// /api/sites 返回后会用配置里的 name 覆盖（hostname -> name）。
const SITE_NAMES = {
  'bite.ygvttlxzy.cc': '91吃瓜',
  'd1ve8vvwughzqa.cloudfront.net': '91视频',
  'breast.eiejvjgex.cc': '51fans',
  'assert.pbtiodqn.cc': '51爆料',
};

// 视频与收藏与站点的统一数据 hook，供 App 与各页面共享。
export function useAppData(message) {
  const [items, setItems] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favIds, setFavIds] = useState(() => new Set());
  const [sites, setSites] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const siteNameMapRef = useRef({ ...SITE_NAMES });

  // 站点配置加载后刷新名称映射
  const loadSites = useCallback(async () => {
    try {
      const data = await fetchSites();
      const list = data.sites || [];
      setSites(list);
      const map = { ...SITE_NAMES };
      list.forEach((s) => {
        if (!s || !s.url) return;
        const host = hostnameOf(s.url);
        if (host) map[host] = s.name || map[host] || host.split('.')[0];
      });
      siteNameMapRef.current = map;
    } catch (_) { /* 忽略站点加载失败 */ }
  }, []);

  // 站点来源标签：优先配置名，其次主机名首段
  const siteLabel = useCallback((siteUrl) => {
    if (!siteUrl) return '未知来源';
    const host = hostnameOf(siteUrl);
    if (!host) return String(siteUrl);
    return siteNameMapRef.current[host] || host.split('.')[0];
  }, []);

  // 加载视频列表（q 为空则全部）
  const loadVideos = useCallback(async (q) => {
    setLoadingList(true);
    setLastQuery(q || '');
    try {
      const data = await fetchVideos(q);
      setItems(data.items || []);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (message) message.error('加载失败：' + e.message);
    } finally {
      setLoadingList(false);
    }
  }, [message]);

  // 加载收藏
  const loadFavorites = useCallback(async () => {
    try {
      const data = await fetchFavorites();
      const list = data.items || [];
      setFavorites(list);
      setFavIds(new Set(data.ids || list.map((a) => a.id)));
    } catch (_) { /* 忽略收藏加载失败 */ }
  }, []);

  // 切换收藏状态
  const toggleFavorite = useCallback(async (item) => {
    if (!item || !item.id) return;
    const isFav = favIds.has(item.id);
    try {
      if (isFav) {
        const data = await removeFavorite(item.id);
        if (data.error) throw new Error(data.error);
        setFavIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setFavorites((prev) => prev.filter((a) => a.id !== item.id));
        if (message) message.success('已取消收藏');
      } else {
        const data = await addFavorite(item);
        if (data.error) throw new Error(data.error);
        setFavIds((prev) => new Set(prev).add(item.id));
        if (data.item) {
          setFavorites((prev) => {
            if (prev.some((a) => a.id === item.id)) return prev;
            return [data.item, ...prev];
          });
        }
        if (message) message.success('已加入收藏');
      }
    } catch (e) {
      if (message) message.error(e.message);
    }
  }, [favIds, message]);

  // 清空收藏（收藏页清空按钮）
  const clearAllFavorites = useCallback(async () => {
    const ids = Array.from(favIds);
    for (const id of ids) {
      try { await removeFavorite(id); } catch (_) { /* 忽略单条失败 */ }
    }
    setFavorites([]);
    setFavIds(new Set());
    if (message) message.success('已清空收藏');
  }, [favIds, message]);

  useEffect(() => {
    loadVideos('');
    loadFavorites();
    loadSites();
  }, [loadVideos, loadFavorites, loadSites]);

  // 各站点视频计数，供同步中心数据源卡片使用
  const siteCounts = useMemo(() => {
    const counts = new Map();
    items.forEach((it) => {
      const key = it.siteUrl || null;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [items]);

  return {
    items, setItems,
    favorites, favIds,
    sites, siteLabel, siteCounts,
    loadingList, lastQuery, setLastQuery,
    loadVideos, loadFavorites, loadSites,
    toggleFavorite, clearAllFavorites,
  };
}
