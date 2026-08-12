import { useState, useCallback, useEffect, useLayoutEffect, useRef, lazy, Suspense } from 'react';
import { App as AntdApp, Drawer, Button, Spin } from 'antd';
import {
  StarOutlined, StarFilled, FileTextOutlined, SyncOutlined,
} from '@ant-design/icons';
import AppHeader from './components/AppHeader.jsx';
import SyncModal from './components/SyncModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { useAppData } from './hooks/useAppData.js';
import { useSync } from './hooks/useSync.js';
import { downloadFavorites } from './services/api.js';

// 路由级代码分割：DetailView 含 HLS.js + Artplayer，单独拆包可减首屏 40%+
const HomeView = lazy(() => import('./views/HomeView.jsx'));
const DetailView = lazy(() => import('./views/DetailView.jsx'));
const FavoritesView = lazy(() => import('./views/FavoritesView.jsx'));
const SyncCenterView = lazy(() => import('./views/SyncCenterView.jsx'));

// 视图
const VIEW = {
  HOME: 'home',
  DETAIL: 'detail',
  FAVORITES: 'favorites',
  SYNC_CENTER: 'sync_center',
};

const MOBILE_BREAKPOINT = 768;

function historyState(view, selectedId = null) {
  return { view, selectedId };
}

export default function App() {
  const { message } = AntdApp.useApp();
  const [view, setView] = useState(VIEW.HOME);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [favQuery, setFavQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  const scrollPositions = useRef({
    [VIEW.HOME]: 0,
    [VIEW.FAVORITES]: 0,
    [VIEW.SYNC_CENTER]: 0,
  });
  const pendingScrollY = useRef(null);
  const viewRef = useRef(view);
  const selectedRef = useRef(selected);
  const itemsRef = useRef([]);
  const favoritesRef = useRef([]);

  const {
    items, favorites, favIds, sites, siteCounts, tagList, loadingList,
    loadVideos, toggleFavorite, clearAllFavorites,
  } = useAppData(message);

  viewRef.current = view;
  selectedRef.current = selected;
  itemsRef.current = items;
  favoritesRef.current = favorites;

  const handleSyncDone = useCallback(() => {
    loadVideos(query.trim());
  }, [loadVideos, query]);

  const {
    syncing, syncLogs, status, progress, elapsed, etaMs, etaLabel, remainingMs, syncStats,
    syncHistory, lastSyncAt, startSync, cancelSync,
    keywordSyncing, keywordResults,
    startKeywordSync, cancelKeywordSync,
  } = useSync(message, handleSyncDone);

  // 同步中通过 SSE 接收批次通知，收到后静默刷新列表（替代 2.5s 轮询）
  useEffect(() => {
    if (!syncing && !keywordSyncing) return undefined;
    loadVideos(query.trim(), { silent: true });
    // 不支持 EventSource 时降级为 5s 轮询
    if (typeof EventSource === 'undefined') {
      const t = setInterval(() => loadVideos(query.trim(), { silent: true }), 5000);
      return () => clearInterval(t);
    }
    const es = new EventSource('/api/sync-events');
    es.onmessage = () => { loadVideos(query.trim(), { silent: true }); };
    // EventSource 断开后浏览器会自动重连，无需手动处理
    return () => es.close();
  }, [syncing, keywordSyncing, loadVideos, query]);

  const saveScroll = useCallback((forView) => {
    if (forView && forView !== VIEW.DETAIL) {
      scrollPositions.current[forView] = window.scrollY;
    }
  }, []);

  const findItemById = useCallback((id) => {
    if (!id) return null;
    return itemsRef.current.find((it) => it.id === id)
      || favoritesRef.current.find((it) => it.id === id)
      || null;
  }, []);

  const applyViewState = useCallback((nextView, nextSelected, { restoreScroll = false, scrollToTop = false } = {}) => {
    setView(nextView);
    setSelected(nextSelected);
    if (scrollToTop) {
      pendingScrollY.current = 0;
    } else if (restoreScroll && nextView !== VIEW.DETAIL) {
      pendingScrollY.current = scrollPositions.current[nextView] || 0;
    } else {
      pendingScrollY.current = null;
    }
  }, []);

  const pushView = useCallback((nextView, nextSelected = null, options = {}) => {
    saveScroll(viewRef.current);
    window.history.pushState(
      historyState(nextView, nextSelected?.id ?? null),
      ''
    );
    const scrollToTop = options.scrollToTop ?? (nextView === VIEW.DETAIL);
    applyViewState(nextView, nextSelected, {
      restoreScroll: !scrollToTop && nextView !== VIEW.DETAIL,
      scrollToTop,
    });
  }, [saveScroll, applyViewState]);

  // 初始化 history，并响应系统返回 / 前进
  useEffect(() => {
    const current = window.history.state;
    if (!current || !current.view) {
      window.history.replaceState(historyState(VIEW.HOME), '');
    }

    const onPopState = (event) => {
      const state = event.state && event.state.view
        ? event.state
        : historyState(VIEW.HOME);

      // 离开当前页面前保存滚动（详情页不缓存）
      saveScroll(viewRef.current);

      if (state.view === VIEW.DETAIL) {
        const item = findItemById(state.selectedId) || selectedRef.current;
        if (item) {
          applyViewState(VIEW.DETAIL, item, { scrollToTop: true });
          return;
        }
        // 找不到条目时退回首页
        applyViewState(VIEW.HOME, null, { restoreScroll: true });
        return;
      }

      applyViewState(state.view, null, { restoreScroll: true });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [saveScroll, findItemById, applyViewState]);

  // 视图切换后恢复列表滚动位置
  useLayoutEffect(() => {
    if (pendingScrollY.current == null) return;
    const y = pendingScrollY.current;
    pendingScrollY.current = null;
    window.scrollTo({ top: y, behavior: 'auto' });
  }, [view, selected]);

  useEffect(() => {
    const onResize = () => {
      const next = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile((prev) => (prev !== next ? next : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleStartSync = useCallback(() => {
    if (syncing) {
      setSyncModalOpen(true);
      return;
    }
    setSyncModalOpen(true);
    startSync({ type: 'crawl' });
  }, [syncing, startSync]);

  const handleSyncBackground = useCallback(() => {
    setSyncModalOpen(false);
  }, []);

  const handleSyncCancel = useCallback(() => {
    cancelSync();
    setSyncModalOpen(false);
  }, [cancelSync]);

  const handleCardClick = useCallback((item) => {
    pushView(VIEW.DETAIL, item, { scrollToTop: true });
  }, [pushView]);

  const handleHomeClick = useCallback(() => {
    if (viewRef.current !== VIEW.HOME) {
      saveScroll(viewRef.current);
      window.history.pushState(historyState(VIEW.HOME), '');
    }
    setActiveTag('');
    setQuery('');
    loadVideos('');
    setDrawerOpen(false);
    applyViewState(VIEW.HOME, null, { scrollToTop: true });
  }, [loadVideos, saveScroll, applyViewState]);

  const handleFavoritesClick = useCallback(() => {
    setDrawerOpen(false);
    if (viewRef.current === VIEW.FAVORITES) {
      saveScroll(VIEW.FAVORITES);
      window.history.pushState(historyState(VIEW.HOME), '');
      applyViewState(VIEW.HOME, null, { restoreScroll: true });
      return;
    }
    setFavQuery('');
    pushView(VIEW.FAVORITES, null, { scrollToTop: false });
  }, [saveScroll, applyViewState, pushView]);

  const handleSyncCenterClick = useCallback(() => {
    setDrawerOpen(false);
    if (viewRef.current === VIEW.SYNC_CENTER) return;
    pushView(VIEW.SYNC_CENTER, null, { scrollToTop: true });
  }, [pushView]);

  const handleBack = useCallback(() => {
    // 走浏览器历史，系统返回与按钮返回行为一致，并恢复上一页滚动
    if (window.history.state?.view === VIEW.DETAIL) {
      window.history.back();
      return;
    }
    applyViewState(VIEW.HOME, null, { restoreScroll: true });
  }, [applyViewState]);

  const handleTagClick = useCallback((tag) => {
    saveScroll(viewRef.current);
    window.history.pushState(historyState(VIEW.HOME), '');
    setActiveTag(tag);
    message.info(`已切换到标签「${tag}」`);
    applyViewState(VIEW.HOME, null, { scrollToTop: true });
  }, [message, saveScroll, applyViewState]);

  const handleSearch = useCallback(() => {
    setActiveTag('');
    loadVideos(query.trim());
  }, [query, loadVideos]);

  const handleClearAll = useCallback(() => {
    clearAllFavorites();
  }, [clearAllFavorites]);

  const handleExport = useCallback(() => {
    downloadFavorites('json');
  }, []);

  // 同步完成后自动关闭弹窗
  useEffect(() => {
    if (!syncing && syncModalOpen && progress >= 100) {
      const t = setTimeout(() => setSyncModalOpen(false), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [syncing, syncModalOpen, progress]);

  const detailItem = selected;

  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><Spin size="large" /></div>}>
        <div className="app-shell min-h-screen">
      <AppHeader
        query={query}
        onQueryChange={setQuery}
        onSearch={handleSearch}
        favoritesCount={favorites.length}
        isFavoritesView={view === VIEW.FAVORITES}
        onFavoritesClick={handleFavoritesClick}
        onSyncCenterClick={handleSyncCenterClick}
        onSyncClick={handleStartSync}
        onHomeClick={handleHomeClick}
        syncing={syncing}
        elapsed={elapsed}
        remainingMs={remainingMs}
        isMobile={isMobile}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      {view === VIEW.HOME && (
        <HomeView
          items={items}
          favIds={favIds}
          sites={sites}
          tagList={tagList}
          loadingList={loadingList}
          activeTag={activeTag}
          onTagChange={setActiveTag}
          onCardClick={handleCardClick}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {view === VIEW.DETAIL && detailItem && (
        <DetailView
          item={detailItem}
          items={items}
          sites={sites}
          favIds={favIds}
          favorited={favIds.has(detailItem.id)}
          onToggleFavorite={toggleFavorite}
          onBack={handleBack}
          onCardClick={handleCardClick}
          onTagClick={handleTagClick}
        />
      )}

      {view === VIEW.FAVORITES && (
        <FavoritesView
          favorites={favorites}
          favIds={favIds}
          sites={sites}
          query={favQuery}
          onQueryChange={setFavQuery}
          onCardClick={handleCardClick}
          onToggleFavorite={toggleFavorite}
          onClearAll={handleClearAll}
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
          syncing={syncing}
          elapsed={elapsed}
          remainingMs={remainingMs}
          onTriggerSync={handleStartSync}
          // 关键词同步
          keywordSyncing={keywordSyncing}
          keywordResults={keywordResults}
          onStartKeywordSync={startKeywordSync}
          onCancelKeywordSync={cancelKeywordSync}
        />
      )}

      <SyncModal
        open={syncModalOpen}
        status={status}
        progress={progress}
        elapsed={elapsed}
        etaMs={etaMs}
        etaLabel={etaLabel}
        remainingMs={remainingMs}
        syncStats={syncStats}
        syncLogs={syncLogs}
        onCancel={handleSyncCancel}
        onBackground={handleSyncBackground}
      />

      {/* 移动端抽屉：收藏 / 日志 / 同步 + 标签筛选（仅首页显示） */}
      <Drawer
        title="导航菜单"
        placement="right"
        open={drawerOpen && isMobile}
        onClose={() => setDrawerOpen(false)}
        width={280}
        className="app-drawer"
        styles={{
          header: { background: '#0A0A0A', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fff' },
          body: { background: '#0A0A0A', padding: '16px 12px' },
          mask: { background: 'rgba(0,0,0,0.7)' },
        }}
      >
        {/* 操作按钮组 */}
        <div className="space-y-2 mb-5">
          <Button
            block
            size="large"
            onClick={handleFavoritesClick}
            className={`!flex !items-center !justify-between !font-bold !border ${
              view === VIEW.FAVORITES
                ? '!bg-[#FF9900]/10 !border-[#FF9900]/30 !text-[#FF9900]'
                : '!bg-[#141416] !text-neutral-200 !border-white/10'
            }`}
          >
            <span className="flex items-center gap-1">
              {view === VIEW.FAVORITES ? <StarFilled style={{ color: '#FF9900' }} /> : <StarOutlined />}
              我的收藏
            </span>
            {favorites.length > 0 && (
              <span className="text-[10px] font-black min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-lg bg-[#FF9900] text-black shrink-0">
                {favorites.length}
              </span>
            )}
          </Button>

          <Button
            block
            size="large"
            onClick={handleSyncCenterClick}
            icon={<FileTextOutlined />}
            className={`!inline-flex !items-center !justify-start !font-bold !border ${
              view === VIEW.SYNC_CENTER
                ? '!bg-[#FF9900]/10 !border-[#FF9900]/30 !text-[#FF9900]'
                : '!bg-[#141416] !text-neutral-200 !border-white/10'
            }`}
          >
            同步日志
          </Button>

          <Button
            block
            size="large"
            onClick={handleStartSync}
            disabled={syncing}
            icon={<SyncOutlined spin={syncing} />}
            className={`!inline-flex !items-center !justify-start !font-bold !border ${
              syncing
                ? '!bg-white/5 !border-white/10 !text-neutral-500'
                : '!bg-[#FF9900]/10 !border-[#FF9900]/30 !text-[#FF9900]'
            }`}
          >
            {syncing
              ? (remainingMs > 0
                ? `预计剩余 ${Math.floor(remainingMs / 1000 / 60)}:${String(Math.floor(remainingMs / 1000) % 60).padStart(2, '0')}`
                : `同步中 ${Math.floor(elapsed / 1000 / 60)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}`)
              : '立即同步'}
          </Button>
        </div>
      </Drawer>
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
