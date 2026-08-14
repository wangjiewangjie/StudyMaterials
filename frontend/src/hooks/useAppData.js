import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchVideos, fetchFavorites, addFavorite, removeFavorite, clearAllFavoritesAPI,
  fetchSites, fetchTags,
} from '../services/api.js';

// 视频 / 收藏 / 站点 / 标签数据 hook

export function useAppData(message) {
  // 用 ref 存 message，避免 message 引用变化导致 useCallback 重建 → 触发不必要的 useEffect
  const messageRef = useRef(message);
  messageRef.current = message;

  const [items, setItems] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favIds, setFavIds] = useState(() => new Set());
  const [sites, setSites] = useState([]);
  const [tagList, setTagList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

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

  const loadVideos = useCallback(async (q, opts = {}) => {
    const silent = !!opts.silent;
    if (!silent) setLoadingList(true);
    try {
      const data = await fetchVideos(q);
      setItems(data.items || []);
      loadTags();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      const msg = messageRef.current;
      if (msg) msg.error('加载失败：' + e.message);
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, [loadTags]);

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
        const msg = messageRef.current;
        if (msg) msg.success('已取消收藏');
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
        const msg = messageRef.current;
        if (msg) msg.success('已加入收藏');
      }
    } catch (e) {
      const msg = messageRef.current;
      if (msg) msg.error(e.message);
    }
  }, [favIds]);

  const clearAllFavorites = useCallback(async () => {
    try {
      await clearAllFavoritesAPI();
    } catch (_) { /* 即使 API 失败也清空前端状态 */ }
    setFavorites([]);
    setFavIds(new Set());
    const msg = messageRef.current;
    if (msg) msg.success('已清空收藏');
  }, []);

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
    items,
    favorites, favIds,
    sites, siteCounts, tagList,
    loadingList,
    loadVideos,
    toggleFavorite, clearAllFavorites,
  };
}
