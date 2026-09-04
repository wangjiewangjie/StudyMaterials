/**
 * App.jsx — 前端根编排
 *
 * 路由视图：首页 / 详情 / 收藏 / 同步中心；顶栏 + 抽屉 + 同步弹窗 + 扫码弹窗。
 * 数据面 useAppData，同步面 useSync；视图组件 lazy 加载以控制首屏体积。
 */

import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { App as AntdApp, Spin, Button, Empty } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import AppHeader from './components/AppHeader.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import MobileNavDrawer from './components/MobileNavDrawer.jsx';
import BackTop from './components/BackTop.jsx';
import { useAppData } from './hooks/useAppData.js';
import { useSync } from './hooks/useSync.js';
import { downloadFavorites } from './services/api.js';
import { hydrateWatchProgress } from './utils/watch-progress.js';
import { SYNC_MODAL_AUTO_CLOSE_MS, DETAIL_NOT_FOUND_MS, SYNC_BATCH_REFRESH_MS } from './constants/timing.js';

const HomeView = lazy(() => import('./views/HomeView.jsx'));
const DetailView = lazy(() => import('./views/DetailView.jsx'));
const FavoritesView = lazy(() => import('./views/FavoritesView.jsx'));
const SyncCenterView = lazy(() => import('./views/SyncCenterView.jsx'));
const SyncModal = lazy(() => import('./components/SyncModal.jsx'));
const LanQrModal = lazy(() => import('./components/LanQrModal.jsx'));

const VIEW = {
  HOME: 'home',
  DETAIL: 'detail',
  FAVORITES: 'favorites',
  SYNC_CENTER: 'sync_center',
};

const MOBILE_BREAKPOINT = 768;

function parseLocation(pathname) {
  if (!pathname || pathname === '/') return { view: VIEW.HOME, id: null };
  if (pathname === '/favorites') return { view: VIEW.FAVORITES, id: null };
  if (pathname === '/sync') return { view: VIEW.SYNC_CENTER, id: null };
  const match = pathname.match(/^\/detail\/(.+)$/);
  if (match) return { view: VIEW.DETAIL, id: decodeURIComponent(match[1]) };
  return { view: VIEW.HOME, id: null };
}

function pathForView(view, id) {
  if (view === VIEW.DETAIL && id) return `/detail/${encodeURIComponent(id)}`;
  if (view === VIEW.FAVORITES) return '/favorites';
  if (view === VIEW.SYNC_CENTER) return '/sync';
  return '/';
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export default function App() {
  const { message } = AntdApp.useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [favQuery, setFavQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isLanQrOpen, setIsLanQrOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDetailMissing, setIsDetailMissing] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
  );

  const route = useMemo(() => parseLocation(location.pathname), [location.pathname]);
  const view = route.view;
  const viewRef = useRef(view);
  viewRef.current = view;
  const scrollRef = useRef({});
  const itemsRef = useRef([]);
  const favoritesRef = useRef([]);
  const batchRefreshTimerRef = useRef(0);
  const preserveScrollRef = useRef(false);
  const savedScrollYRef = useRef(0);

  const {
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
  } = useAppData(message);

  useEffect(() => {
    hydrateWatchProgress();
  }, []);

  const handleDataImported = useCallback(async () => {
    await Promise.all([
      loadVideos(query.trim()),
      loadFavorites(),
      loadSites(),
      hydrateWatchProgress({ force: true }),
    ]);
  }, [loadVideos, loadFavorites, loadSites, query]);

  itemsRef.current = items;
  favoritesRef.current = favorites;

  const markPreserveScroll = useCallback(() => {
    savedScrollYRef.current = window.scrollY;
    preserveScrollRef.current = true;
  }, []);

  const handleSyncDone = useCallback(() => {
    // 静默刷新：不 bump listVersion，避免分页重置把滚动打回顶部
    markPreserveScroll();
    loadVideos(query.trim(), { silent: true });
  }, [loadVideos, query, markPreserveScroll]);

  const handleSyncBatch = useCallback(() => {
    if (batchRefreshTimerRef.current) {
      clearTimeout(batchRefreshTimerRef.current);
    }
    batchRefreshTimerRef.current = window.setTimeout(() => {
      batchRefreshTimerRef.current = 0;
      markPreserveScroll();
      loadVideos(query.trim(), { silent: true });
    }, SYNC_BATCH_REFRESH_MS);
  }, [loadVideos, query, markPreserveScroll]);

  useEffect(() => () => {
    if (batchRefreshTimerRef.current) {
      clearTimeout(batchRefreshTimerRef.current);
      batchRefreshTimerRef.current = 0;
    }
  }, []);

  useLayoutEffect(() => {
    if (!preserveScrollRef.current) return;
    preserveScrollRef.current = false;
    const y = savedScrollYRef.current;
    if (y > 0) window.scrollTo({ top: y, behavior: 'auto' });
  }, [items, location.pathname]);

  const {
    isSyncing,
    syncLogs,
    status,
    progress,
    elapsed,
    syncStats,
    syncHistory,
    lastSyncAt,
    startSync,
    cancelSync,
    isKeywordSyncing,
    keywordResults,
    startKeywordSync,
    cancelKeywordSync,
  } = useSync(message, handleSyncDone, handleSyncBatch);

  const findItemById = useCallback((id) => {
    if (!id) return null;
    return itemsRef.current.find((it) => it.id === id)
      || favoritesRef.current.find((it) => it.id === id)
      || null;
  }, []);

  /** 回首页并置顶（当前已在首页则只滚动） */
  const goHome = useCallback((opts = {}) => {
    const { clearTag = false, clearQuery = false, reload = false } = opts;
    if (clearTag) setActiveTag('');
    if (clearQuery) setQuery('');
    if (reload) loadVideos('');
    setIsDrawerOpen(false);
    if (viewRef.current === VIEW.HOME) {
      scrollToTop();
      return;
    }
    scrollRef.current['/'] = 0;
    navigate('/');
  }, [loadVideos, navigate]);

  useLayoutEffect(() => {
    const next = location.pathname;
    const target = next.startsWith('/detail') ? 0 : (scrollRef.current[next] || 0);
    window.scrollTo({ top: target, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        scrollRef.current[location.pathname] = window.scrollY;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [location.pathname]);

  useEffect(() => {
    const onResize = () => {
      const next = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile((prev) => (prev !== next ? next : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleStartSync = useCallback(() => {
    if (isKeywordSyncing) {
      message.warning('关键词同步进行中，请稍后再全量同步');
      return;
    }
    setIsSyncModalOpen(true);
    if (!isSyncing) startSync({ type: 'crawl' });
  }, [isSyncing, isKeywordSyncing, startSync, message]);

  const handleSyncBackground = useCallback(() => {
    setIsSyncModalOpen(false);
  }, []);

  const handleSyncCancel = useCallback(() => {
    cancelSync();
    setIsSyncModalOpen(false);
  }, [cancelSync]);

  const handleCardClick = useCallback((item) => {
    navigate(pathForView(VIEW.DETAIL, item.id));
  }, [navigate]);

  const handleHomeClick = useCallback(() => {
    goHome({ clearTag: true, clearQuery: true, reload: true });
  }, [goHome]);

  const handleFavoritesClick = useCallback(() => {
    setIsDrawerOpen(false);
    if (viewRef.current === VIEW.FAVORITES) {
      navigate('/');
      return;
    }
    setFavQuery('');
    navigate('/favorites');
  }, [navigate]);

  const handleSyncCenterClick = useCallback(() => {
    setIsDrawerOpen(false);
    if (viewRef.current !== VIEW.SYNC_CENTER) {
      navigate('/sync');
    }
  }, [navigate]);

  const handleBack = useCallback(() => {
    if (location.key === 'default') {
      navigate('/');
      return;
    }
    navigate(-1);
  }, [location.key, navigate]);

  const handleTagClick = useCallback((tag) => {
    setActiveTag(tag);
    message.info(`已切换到标签「${tag}」`);
    goHome();
  }, [message, goHome]);

  const handleSearch = useCallback((override) => {
    const q = typeof override === 'string' ? override : query.trim();
    setActiveTag('');
    loadVideos(q);
    goHome();
  }, [query, loadVideos, goHome]);

  const handleExport = useCallback(() => {
    downloadFavorites();
  }, []);

  useEffect(() => {
    if (!isSyncing && isSyncModalOpen && progress >= 100) {
      const timer = setTimeout(() => setIsSyncModalOpen(false), SYNC_MODAL_AUTO_CLOSE_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isSyncing, isSyncModalOpen, progress]);

  const detailItem = view === VIEW.DETAIL ? findItemById(route.id) : null;
  const isFavoritesView = view === VIEW.FAVORITES;
  const isSyncCenterView = view === VIEW.SYNC_CENTER;
  const isHomeView = view === VIEW.HOME;
  const isBusy = isSyncing || isKeywordSyncing;

  useEffect(() => {
    if (view !== VIEW.DETAIL || detailItem) {
      setIsDetailMissing(false);
      return undefined;
    }
    if (!isBootstrapped) return undefined;
    const timer = setTimeout(() => setIsDetailMissing(true), DETAIL_NOT_FOUND_MS);
    const quick = setTimeout(() => {
      if (!findItemById(route.id)) setIsDetailMissing(true);
    }, 400);
    return () => {
      clearTimeout(timer);
      clearTimeout(quick);
    };
  }, [view, route.id, detailItem, isBootstrapped, findItemById]);

  return (
    <ErrorBoundary>
      <div className="app-shell min-h-screen pt-16">
        <AppHeader
          query={query}
          onQueryChange={setQuery}
          onSearch={handleSearch}
          favoritesCount={favorites.length}
          isFavoritesView={isFavoritesView}
          isSyncCenterView={isSyncCenterView}
          onFavoritesClick={handleFavoritesClick}
          onSyncCenterClick={handleSyncCenterClick}
          onSyncClick={handleStartSync}
          onHomeClick={handleHomeClick}
          isSyncing={isSyncing}
          isBusy={isBusy}
          elapsed={elapsed}
          isMobile={isMobile}
          onOpenDrawer={() => setIsDrawerOpen(true)}
          onLanQrClick={() => setIsLanQrOpen(true)}
        />

        <Suspense
          fallback={(
            <div className="flex items-center justify-center min-h-[60vh]">
              <Spin size="large" />
            </div>
          )}
        >
          {view === VIEW.HOME && (
            <HomeView
              items={items}
              favIds={favIds}
              pendingFavIds={pendingFavIds}
              siteNameMap={siteNameMap}
              tagList={tagList}
              isLoadingList={isLoadingList}
              listError={listError}
              listVersion={listVersion}
              activeTag={activeTag}
              onTagChange={setActiveTag}
              onCardClick={handleCardClick}
              onToggleFavorite={toggleFavorite}
              onRetry={() => loadVideos(query.trim())}
            />
          )}

          {view === VIEW.DETAIL && detailItem && (
            <DetailView
              key={detailItem.id}
              item={detailItem}
              items={items}
              siteNameMap={siteNameMap}
              favIds={favIds}
              pendingFavIds={pendingFavIds}
              isFavorited={favIds.has(detailItem.id)}
              onToggleFavorite={toggleFavorite}
              onBack={handleBack}
              onCardClick={handleCardClick}
              onTagClick={handleTagClick}
            />
          )}

          {view === VIEW.DETAIL && !detailItem && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-ph-text-muted px-4">
              {isDetailMissing ? (
                <>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="未找到该内容，可能已下架或链接失效"
                  />
                  <Button type="primary" onClick={() => navigate('/')}>
                    返回首页
                  </Button>
                </>
              ) : (
                <>
                  <Spin size="large" />
                  <div className="text-sm">正在加载详情…</div>
                  <Button type="link" onClick={() => navigate('/')}>
                    返回首页
                  </Button>
                </>
              )}
            </div>
          )}

          {view === VIEW.FAVORITES && (
            <FavoritesView
              favorites={favorites}
              favIds={favIds}
              pendingFavIds={pendingFavIds}
              siteNameMap={siteNameMap}
              query={favQuery}
              onQueryChange={setFavQuery}
              onCardClick={handleCardClick}
              onToggleFavorite={toggleFavorite}
              onClearAll={clearAllFavorites}
              onExport={handleExport}
            />
          )}

          {view === VIEW.SYNC_CENTER && (
            <SyncCenterView
              sites={sites}
              siteCounts={siteCounts}
              itemsCount={items.length}
              syncHistory={syncHistory}
              lastSyncAt={lastSyncAt}
              isSyncing={isSyncing}
              elapsed={elapsed}
              onTriggerSync={handleStartSync}
              isKeywordSyncing={isKeywordSyncing}
              keywordResults={keywordResults}
              onStartKeywordSync={startKeywordSync}
              onCancelKeywordSync={cancelKeywordSync}
              onDataImported={handleDataImported}
            />
          )}
        </Suspense>

        {isSyncModalOpen && (
          <Suspense fallback={null}>
            <SyncModal
              open={isSyncModalOpen}
              status={status}
              progress={progress}
              elapsed={elapsed}
              syncStats={syncStats}
              syncLogs={syncLogs}
              onCancel={handleSyncCancel}
              onBackground={handleSyncBackground}
            />
          </Suspense>
        )}

        {isLanQrOpen && (
          <Suspense fallback={null}>
            <LanQrModal open={isLanQrOpen} onClose={() => setIsLanQrOpen(false)} />
          </Suspense>
        )}

        <MobileNavDrawer
          open={isDrawerOpen && isMobile}
          isHomeView={isHomeView}
          isFavoritesView={isFavoritesView}
          isSyncCenterView={isSyncCenterView}
          favoritesCount={favorites.length}
          isSyncing={isSyncing}
          isBusy={isBusy}
          elapsed={elapsed}
          onClose={() => setIsDrawerOpen(false)}
          onHomeClick={handleHomeClick}
          onFavoritesClick={handleFavoritesClick}
          onSyncCenterClick={handleSyncCenterClick}
          onSyncClick={handleStartSync}
          onLanQrClick={() => {
            setIsDrawerOpen(false);
            setIsLanQrOpen(true);
          }}
        />

        <BackTop />
      </div>
    </ErrorBoundary>
  );
}
