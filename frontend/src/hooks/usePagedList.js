import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PAGE_SIZE } from '../constants/timing.js';

/**
 * 列表分页 + 触底 IntersectionObserver（首页 / 收藏共用）
 * @param {unknown[]} items 已排序过滤后的完整列表
 * @param {unknown[]} resetDeps 变化时重置到首屏（如标签、排序、搜索）
 */
export function usePagedList(items, resetDeps = []) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);
  const list = useMemo(() => items || [], [items]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 由调用方显式传入重置条件
  }, resetDeps);

  useEffect(() => {
    setVisibleCount((n) => {
      // 列表短暂为空时保留已加载页数，避免高度塌缩把滚动条顶回顶部
      if (list.length === 0) return n;
      return Math.min(Math.max(n, PAGE_SIZE), list.length);
    });
  }, [list.length]);

  const paged = useMemo(() => list.slice(0, visibleCount), [list, visibleCount]);
  const hasMore = visibleCount < list.length;

  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(list.length, n + PAGE_SIZE));
  }, [list.length]);

  useEffect(() => {
    if (!hasMore) return undefined;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, paged.length]);

  return {
    paged,
    hasMore,
    loadMore,
    sentinelRef,
    visibleCount,
    total: list.length,
  };
}
