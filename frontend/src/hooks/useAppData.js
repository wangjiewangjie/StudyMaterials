import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchVideos, fetchFavorites, addFavorite, removeFavorite, fetchSites, fetchTags,
} from '../services/api.js';

// 视频与收藏与站点的统一数据 hook，供 App 与各页面共享。
export function useAppData(message) {
  const [items, setItems] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favIds, setFavIds] = useState(() => new Set());
  const [sites, setSites] = useState([]);
  const [tagList, setTagList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  const loadSites = useCallback(async () => {
    try {
      const data = await fetchSites();
      setSites(data.sites || []);
    } catch (_) { /* 忽略站点加载失败 */ }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const data = await fetchTags();
      setTagList(data.tags || []);
    } catch (_) {
      setTagList([]);
    }
  }, []);

  const loadVideos = useCallback(async (q) => {
    setLoadingList(true);
    setLastQuery(q || '');
    try {
      const data = await fetchVideos(q);
      setItems(data.items || []);
      loadTags();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (message) message.error('加载失败：' + e.message);
    } finally {
      setLoadingList(false);
    }
  }, [message, loadTags]);

  const loadFavorites = useCallback(async () => {
    try {
      const data = await fetchFavorites();
      const list = data.items || [];
      setFavorites(list);
      setFavIds(new Set(data.ids || list.map((a) => a.id)));
    } catch (_) { /* 忽略收藏加载失败 */ }
  }, []);

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
    sites, siteCounts, tagList,
    loadingList, lastQuery, setLastQuery,
    loadVideos, loadFavorites, loadSites,
    toggleFavorite, clearAllFavorites,
  };
}
