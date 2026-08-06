import { Input, Button } from 'antd';
import {
  SearchOutlined, StarOutlined, StarFilled, FileTextOutlined, MenuOutlined,
} from '@ant-design/icons';
import { navBtnClass } from '../constants/layout.js';

function formatElapsedShort(ms) {
  const sec = Math.floor((ms || 0) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AppHeader({
  query,
  onQueryChange,
  onSearch,
  favoritesCount,
  isFavoritesView,
  isSyncCenterView,
  onFavoritesClick,
  onSyncCenterClick,
  onSyncClick,
  onHomeClick,
  syncing,
  elapsed = 0,
  isMobile,
  onOpenDrawer,
}) {
  return (
    <header className="app-header sticky top-0 z-[200] w-full backdrop-blur-md bg-ph-header/90 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        <Button
          type="text"
          onClick={onHomeClick}
          className="!flex !items-center !gap-1 !p-0 !h-auto !bg-transparent !border-0 shrink-0 group"
          title="返回首页"
        >
          <span className="bg-ph-orange text-black font-black italic text-base sm:text-xl px-2 py-0.5 rounded-lg tracking-tighter group-hover:bg-ph-orange-light transition-colors">
            STUDY
          </span>
          <span className="text-base sm:text-xl font-black italic tracking-tighter text-white group-hover:text-neutral-200 transition-colors hidden sm:inline">
            HUB
          </span>
        </Button>

        <div className="flex-1 max-w-[260px] sm:max-w-xs md:max-w-md relative app-search">
          <SearchOutlined className="absolute left-3 top-1/2 -translate-y-1/2 text-ph-text-tertiary z-10" style={{ fontSize: 14 }} />
          <Input
            allowClear
            size="middle"
            placeholder="搜索视频、分类、标签…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onPressEnter={onSearch}
            className="app-input-search !bg-ph-panel !border-white/10 !text-white"
            styles={{ input: { background: 'transparent' } }}
          />
        </div>

        {isMobile ? (
          <Button
            type="text"
            size="middle"
            onClick={onOpenDrawer}
            icon={<MenuOutlined style={{ fontSize: 18 }} />}
            className="!text-ph-orange hover:!bg-ph-orange/10 shrink-0 !border-0 !bg-transparent"
            aria-label="打开菜单"
          />
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Button
              type="text"
              size="middle"
              onClick={onFavoritesClick}
              icon={isFavoritesView ? <StarFilled style={{ fontSize: 13 }} /> : <StarOutlined style={{ fontSize: 13 }} />}
              className={navBtnClass(isFavoritesView)}
            >
              <span className="hidden sm:inline">收藏</span>
              {favoritesCount > 0 && (
                <span className="text-[10px] font-black min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-lg bg-ph-orange text-black">
                  {favoritesCount}
                </span>
              )}
            </Button>

            <Button
              type="text"
              size="middle"
              onClick={onSyncCenterClick}
              icon={<FileTextOutlined style={{ fontSize: 13 }} />}
              className={navBtnClass(isSyncCenterView)}
            >
              <span className="hidden sm:inline">日志</span>
            </Button>

            <Button
              type="text"
              size="middle"
              onClick={onSyncClick}
              disabled={syncing}
              className={`!inline-flex !items-center !gap-1.5 !font-bold !border ${
                syncing
                  ? '!bg-white/5 !border-white/10 !text-ph-text-muted cursor-not-allowed'
                  : '!bg-ph-orange/10 !border-ph-orange/30 !text-ph-orange hover:!bg-ph-orange/20'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${syncing ? 'bg-ph-text-muted' : 'bg-ph-orange'}`} />
              {syncing ? (
                <span className="tabular-nums">同步中 {formatElapsedShort(elapsed)}</span>
              ) : (
                '同步'
              )}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
