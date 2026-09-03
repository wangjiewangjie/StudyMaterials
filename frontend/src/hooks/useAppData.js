import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchVideos,
  fetchFavorites,
  addFavorite,
  removeFavorite,
  clearAllFavoritesAPI,
  fetchSites,
  fetchTags,
} from '../services/api.js';
import { buildSiteNameMap } from '../utils/sites.js';

function isAbortError(error) {
  return error?.name === 'AbortError';
}

/** 视频 / 收藏 / 站点 / 标签数据 */
export function useAppData(message) {
  // message 可能随渲染变化；用 ref 避免依赖抖动触发重复请求
  const messageRef = useRef(message);
  messageRef.current = message;

  const [items, setItems] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favIds, setFavIds] = useState(() => new Set());
  const [sites, setSites] = useState([]);
  const [tagList, setTagList] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);

  const loadSites = useCallback(async () => {
    try {
      const data = await fetchSites();
      setSites(data.sites || []);
    } catch {
      // 站点失败不阻塞主流程
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const data = await fetchTags();
      setTagList(data.tags || []);
    } catch {
      setTagList([]);
    }
  }, []);

  const loadVideos = useCallback(async (q, opts = {}) => {
    const silent = !!opts.silent;
    if (!silent) setIsLoadingList(true);
    try {
      const data = await fetchVideos(q);
      setItems(data.items || []);
      loadTags();
    } catch (error) {
      if (isAbortError(error)) return;
      messageRef.current?.error(`加载失败：${error.message}`);
    } finally {
      if (!silent) setIsLoadingList(false);
    }
  }, [loadTags]);

  const loadFavorites = useCallback(async () => {
    try {
      const data = await fetchFavorites();
      const list = data.items || [];
      setFavorites(list);
      setFavIds(new Set(data.ids || list.map((item) => item.id)));
    } catch {
      // 收藏失败不阻塞主流程
    }
  }, []);

  const toggleFavorite = useCallback(async (item) => {
    if (!item?.id) return;
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
        setFavorites((prev) => prev.filter((fav) => fav.id !== item.id));
        messageRef.current?.success('已取消收藏');
        return;
      }

      const data = await addFavorite(item);
      if (data.error) throw new Error(data.error);
      setFavIds((prev) => new Set(prev).add(item.id));
      if (data.item) {
        setFavorites((prev) => {
          if (prev.some((fav) => fav.id === item.id)) return prev;
          return [data.item, ...prev];
        });
      }
      messageRef.current?.success('已加入收藏');
    } catch (error) {
      messageRef.current?.error(error.message);
    }
  }, [favIds]);

  const clearAllFavorites = useCallback(async () => {
    try {
      await clearAllFavoritesAPI();
    } catch {
      // API 失败仍清空前端状态
    }
    setFavorites([]);
    setFavIds(new Set());
    messageRef.current?.success('已清空收藏');
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

  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites]);

  return {
    items,
    favorites,
    favIds,
    sites,
    siteCounts,
    siteNameMap,
    tagList,
    isLoadingList,
    loadVideos,
    toggleFavorite,
    clearAllFavorites,
  };
}
