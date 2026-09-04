/**
 * hooks/useAppData.js — 视频 / 收藏 / 站点 / 标签数据面
 *
 * 负责首屏并行加载、列表静默刷新、收藏乐观互斥（pendingFavIds）。
 * 同步进度与日志见 useSync。
 */

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

/**
 * @param {(msg: string) => void} [message] antd message 适配（经 ref 避免依赖抖动）
 * @returns 数据状态与 loadVideos / toggleFavorite / clearAllFavorites
 */
export function useAppData(message) {
  const messageRef = useRef(message);
  messageRef.current = message;

  const [items, setItems] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favIds, setFavIds] = useState(() => new Set());
  const [pendingFavIds, setPendingFavIds] = useState(() => new Set());
  const pendingFavRef = useRef(new Set());
  const [sites, setSites] = useState([]);
  const [tagList, setTagList] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState(null);
  const [listVersion, setListVersion] = useState(0);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const videosReqIdRef = useRef(0);

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
      // 静默失败时保留旧标签，避免筛选条闪断导致布局跳动
    }
  }, []);

  const loadVideos = useCallback(async (q, opts = {}) => {
    const silent = !!opts.silent;
    const reqId = ++videosReqIdRef.current;
    if (!silent) {
      setIsLoadingList(true);
      setListError(null);
    }
    try {
      const data = await fetchVideos(q);
      if (reqId !== videosReqIdRef.current) return;
      setItems(data.items || []);
      if (!silent) setListVersion((v) => v + 1);
      loadTags();
    } catch (error) {
      if (isAbortError(error)) return;
      if (reqId !== videosReqIdRef.current) return;
      if (!silent) {
        setListError(error.message || '加载失败');
        messageRef.current?.error(`加载失败：${error.message}`);
      }
    } finally {
      if (!silent && reqId === videosReqIdRef.current) {
        setIsLoadingList(false);
      }
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
    if (pendingFavRef.current.has(item.id)) return;

    const isFav = favIds.has(item.id);
    pendingFavRef.current.add(item.id);
    setPendingFavIds(new Set(pendingFavRef.current));
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
    } finally {
      pendingFavRef.current.delete(item.id);
      setPendingFavIds(new Set(pendingFavRef.current));
    }
  }, [favIds]);

  const clearAllFavorites = useCallback(async () => {
    const data = await clearAllFavoritesAPI();
    if (data?.error) throw new Error(data.error);
    setFavorites([]);
    setFavIds(new Set());
    messageRef.current?.success('已清空收藏');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([
        loadVideos(''),
        loadFavorites(),
        loadSites(),
      ]);
      if (!cancelled) setIsBootstrapped(true);
    })();
    return () => { cancelled = true; };
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
    pendingFavIds,
    sites,
    siteCounts,
    siteNameMap,
    tagList,
    isLoadingList,
    listError,
    listVersion,
    isBootstrapped,
    loadVideos,
    loadFavorites,
    loadSites,
    toggleFavorite,
    clearAllFavorites,
  };
}
