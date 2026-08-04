import { useState, useCallback, useEffect } from 'react';
import { App as AntdApp, Drawer, Button } from 'antd';
import {
  StarOutlined, StarFilled, FileTextOutlined, SyncOutlined,
} from '@ant-design/icons';
import AppHeader from './components/AppHeader.jsx';
import SyncModal from './components/SyncModal.jsx';
import HomeView from './views/HomeView.jsx';
import DetailView from './views/DetailView.jsx';
import FavoritesView from './views/FavoritesView.jsx';
import SyncCenterView from './views/SyncCenterView.jsx';
import { useAppData } from './hooks/useAppData.js';
import { useSync } from './hooks/useSync.js';
import { downloadFavorites } from './services/api.js';

// 视图
const VIEW = {
  HOME: 'home',
  DETAIL: 'detail',
  FAVORITES: 'favorites',
  SYNC_CENTER: 'sync_center',
};

const MOBILE_BREAKPOINT = 768;

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

  const {
    items, favorites, favIds, sites, siteCounts, tagList, loadingList,
    loadVideos, toggleFavorite, clearAllFavorites,
  } = useAppData(message);

  const handleSyncDone = useCallback(() => {
    loadVideos(query.trim());
  }, [loadVideos, query]);

  const {
    syncing, syncLogs, status, progress, elapsed, syncStats,
    syncHistory, lastSyncAt, startSync, cancelSync,
    keywordSyncing, keywordResults,
    startKeywordSync, cancelKeywordSync,
  } = useSync(message, handleSyncDone);

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
    setSelected(item);
    setView(VIEW.DETAIL);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const handleHomeClick = useCallback(() => {
    setView(VIEW.HOME);
    setSelected(null);
    setActiveTag('');
    setQuery('');
    loadVideos('');
    setDrawerOpen(false);
  }, [loadVideos]);

  const handleFavoritesClick = useCallback(() => {
    if (view === VIEW.FAVORITES) {
      setView(VIEW.HOME);
    } else {
      setView(VIEW.FAVORITES);
      setFavQuery('');
    }
    setSelected(null);
    setDrawerOpen(false);
  }, [view]);

  const handleSyncCenterClick = useCallback(() => {
    setView(VIEW.SYNC_CENTER);
    setSelected(null);
    setDrawerOpen(false);
  }, []);

  const handleBack = useCallback(() => {
    setView(VIEW.HOME);
    setSelected(null);
  }, []);

  const handleTagClick = useCallback((tag) => {
    setView(VIEW.HOME);
    setSelected(null);
    setActiveTag(tag);
    message.info(`已切换到标签「${tag}」`);
  }, [message]);

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
            onClick={handleFavoritesClick}
            className={`!flex !items-center !justify-between !h-11 !pl-3 !pr-4 !rounded-lg !text-sm !font-bold !border ${
              view === VIEW.FAVORITES
                ? '!bg-[#FF9900]/10 !border-[#FF9900]/30 !text-[#FF9900]'
                : '!bg-[#141416] !text-neutral-200 !border-white/10'
            }`}
          >
            <span className="flex items-center gap-1">
              {view === VIEW.FAVORITES ? <StarFilled style={{ color: '#ef4444' }} /> : <StarOutlined />}
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
            onClick={handleSyncCenterClick}
            icon={<FileTextOutlined />}
            className={`!flex !items-center !justify-start !h-11 !pl-3 !rounded-lg !text-sm !font-bold !border !gap-1 ${
              view === VIEW.SYNC_CENTER
                ? '!bg-[#FF9900]/10 !border-[#FF9900]/30 !text-[#FF9900]'
                : '!bg-[#141416] !text-neutral-200 !border-white/10'
            }`}
            styles={{ icon: { marginInlineEnd: '4px' } }}
          >
            同步日志
          </Button>

          <Button
            block
            onClick={handleStartSync}
            icon={<SyncOutlined spin={syncing} />}
            className="!flex !items-center !justify-start !h-11 !pl-3 !rounded-lg !text-sm !font-bold !bg-[#FF9900]/10 !border !border-[#FF9900]/30 !text-[#FF9900] !gap-1"
            styles={{ icon: { marginInlineEnd: '4px' } }}
          >
            {syncing ? '同步中…' : '立即同步'}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
