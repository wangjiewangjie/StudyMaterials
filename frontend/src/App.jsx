import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { App as AntdApp, Drawer, Button, Spin } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  StarOutlined, StarFilled, FileTextOutlined, SyncOutlined,
} from '@ant-design/icons';
import AppHeader from './components/AppHeader.jsx';
import SyncModal from './components/SyncModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { useAppData } from './hooks/useAppData.js';
import { useSync } from './hooks/useSync.js';
import { downloadFavorites } from './services/api.js';
import { formatElapsedShort } from './utils/format.js';

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

// 路由路径 ⇄ 视图 映射（真实 URL，支持刷新 / 分享 / 前进后退）
function parseLocation(pathname) {
  if (!pathname || pathname === '/') return { view: VIEW.HOME, id: null };
  if (pathname === '/favorites') return { view: VIEW.FAVORITES, id: null };
  if (pathname === '/sync') return { view: VIEW.SYNC_CENTER, id: null };
  const m = pathname.match(/^\/detail\/(.+)$/);
  if (m) return { view: VIEW.DETAIL, id: decodeURIComponent(m[1]) };
  return { view: VIEW.HOME, id: null }; // 未知路径兜底回首页
}

function pathForView(view, id) {
  if (view === VIEW.DETAIL && id) return `/detail/${encodeURIComponent(id)}`;
  if (view === VIEW.FAVORITES) return '/favorites';
  if (view === VIEW.SYNC_CENTER) return '/sync';
  return '/';
}

export default function App() {
  const { message } = AntdApp.useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [favQuery, setFavQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  // 视图由 URL 派生（路由式导航）
  const route = useMemo(() => parseLocation(location.pathname), [location.pathname]);
  const view = route.view;
  const viewRef = useRef(view);
  viewRef.current = view;
  const scrollRef = useRef({}); // 各路由滚动位置
  const itemsRef = useRef([]);
  const favoritesRef = useRef([]);

  const {
    items, favorites, favIds, sites, siteCounts, tagList, loadingList,
    loadVideos, toggleFavorite, clearAllFavorites,
  } = useAppData(message);

  itemsRef.current = items;
  favoritesRef.current = favorites;

  const handleSyncDone = useCallback(() => {
    loadVideos(query.trim());
  }, [loadVideos, query]);

  const handleSyncBatch = useCallback(() => {
    loadVideos(query.trim(), { silent: true });
  }, [loadVideos, query]);

  const {
    syncing, syncLogs, status, progress, elapsed, syncStats,
    syncHistory, lastSyncAt, startSync, cancelSync,
    keywordSyncing, keywordResults,
    startKeywordSync, cancelKeywordSync,
  } = useSync(message, handleSyncDone, handleSyncBatch);

  const findItemById = useCallback((id) => {
    if (!id) return null;
    return itemsRef.current.find((it) => it.id === id)
      || favoritesRef.current.find((it) => it.id === id)
      || null;
  }, []);

  // 路由切换：详情页置顶，列表页恢复上次滚动位置
  useLayoutEffect(() => {
    const next = location.pathname;
    const target = next.startsWith('/detail') ? 0 : (scrollRef.current[next] || 0);
    window.scrollTo({ top: target, behavior: 'auto' });
  }, [location.pathname]);

  // 持续保存各路由的滚动位置（rAF 节流），用于返回时恢复
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        scrollRef.current[location.pathname] = window.scrollY;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
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
    navigate(pathForView(VIEW.DETAIL, item.id));
  }, [navigate]);

  const handleHomeClick = useCallback(() => {
    setActiveTag('');
    setQuery('');
    loadVideos('');
    setDrawerOpen(false);
    if (viewRef.current === VIEW.HOME) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      scrollRef.current['/'] = 0; // 回到首页置顶
      navigate('/');
    }
  }, [loadVideos, navigate]);

  const handleFavoritesClick = useCallback(() => {
    setDrawerOpen(false);
    if (viewRef.current === VIEW.FAVORITES) {
      navigate('/');
    } else {
      setFavQuery('');
      navigate('/favorites');
    }
  }, [navigate]);

  const handleSyncCenterClick = useCallback(() => {
    setDrawerOpen(false);
    if (viewRef.current !== VIEW.SYNC_CENTER) {
      navigate('/sync');
    }
  }, [navigate]);

  const handleBack = useCallback(() => {
    // 走浏览器历史；直接深链打开详情且无历史记录时回首页
    if (location.key === 'default') {
      navigate('/');
    } else {
      navigate(-1);
    }
  }, [location, navigate]);

  const handleTagClick = useCallback((tag) => {
    setActiveTag(tag);
    message.info(`已切换到标签「${tag}」`);
    if (viewRef.current === VIEW.HOME) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      scrollRef.current['/'] = 0; // 回首页并置顶
      navigate('/');
    }
  }, [message, navigate]);

  const handleSearch = useCallback(() => {
    setActiveTag('');
    const q = query.trim();
    loadVideos(q);
    // 搜索后必须回到首页展示结果，否则在详情/收藏/同步页搜索会“看起来没反应”
    if (viewRef.current === VIEW.HOME) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      scrollRef.current['/'] = 0; // 回首页并置顶
      navigate('/');
    }
  }, [query, loadVideos, navigate]);

  const handleClearAll = useCallback(() => {
    clearAllFavorites();
  }, [clearAllFavorites]);

  const handleExport = useCallback(() => {
    downloadFavorites();
  }, []);

  // 同步完成后自动关闭弹窗
  useEffect(() => {
    if (!syncing && syncModalOpen && progress >= 100) {
      const t = setTimeout(() => setSyncModalOpen(false), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [syncing, syncModalOpen, progress]);

  const detailItem = view === VIEW.DETAIL ? findItemById(route.id) : null;

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
        isSyncCenterView={view === VIEW.SYNC_CENTER}
        onFavoritesClick={handleFavoritesClick}
        onSyncCenterClick={handleSyncCenterClick}
        onSyncClick={handleStartSync}
        onHomeClick={handleHomeClick}
        syncing={syncing}
        elapsed={elapsed}
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
          key={detailItem.id}
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

      {view === VIEW.DETAIL && !detailItem && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-ph-text-muted">
          <Spin size="large" />
          <div className="text-sm">正在加载详情…</div>
        </div>
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
              ? `同步中 ${formatElapsedShort(elapsed)}`
              : '立即同步'}
          </Button>
        </div>
      </Drawer>
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
