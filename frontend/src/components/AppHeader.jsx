/**
 * AppHeader — 顶栏：品牌、搜索、扫码、收藏、同步日志、同步
 * 窄屏改为扫码图标 + 汉堡菜单（具体项见 MobileNavDrawer）。
 */

import { Input, Button } from 'antd';
import {
  SearchOutlined, StarOutlined, StarFilled, FileTextOutlined, MenuOutlined, QrcodeOutlined,
} from '@ant-design/icons';
import { navBtnClass } from '../constants/layout.js';
import { formatElapsedShort } from '../utils/format.js';

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
  onLanQrClick,
  isSyncing,
  isBusy = false,
  elapsed = 0,
  isMobile,
  onOpenDrawer,
}) {
  const syncDisabled = isBusy;

  return (
    <header className="app-header">
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

        <div className="flex-1 max-w-[280px] sm:max-w-md relative app-search flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <SearchOutlined className="absolute left-3 top-1/2 -translate-y-1/2 text-ph-text-tertiary z-10" style={{ fontSize: 14 }} />
            <Input
              allowClear
              size="middle"
              placeholder="搜索视频、分类、标签…"
              value={query}
              onChange={(e) => {
                const val = e.target.value;
                onQueryChange(val);
                if (!val) onSearch('');
              }}
              onPressEnter={onSearch}
              className="app-input-search !bg-ph-panel !border-white/10 !text-white"
              styles={{ input: { background: 'transparent' } }}
            />
          </div>
          <Button
            type="primary"
            size="middle"
            onClick={onSearch}
            aria-label="搜索"
            className="!bg-ph-orange hover:!bg-ph-orange-light !text-black !border-0 !font-bold shrink-0"
          >
            搜索
          </Button>
        </div>

        {isMobile ? (
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              type="text"
              size="middle"
              onClick={onLanQrClick}
              icon={<QrcodeOutlined style={{ fontSize: 18 }} />}
              className="!text-ph-orange hover:!bg-ph-orange/10 !border-0 !bg-transparent"
              aria-label="扫码用手机打开"
              title="扫码用手机打开"
            />
            <Button
              type="text"
              size="middle"
              onClick={onOpenDrawer}
              icon={<MenuOutlined style={{ fontSize: 18 }} />}
              className="!text-ph-orange hover:!bg-ph-orange/10 !border-0 !bg-transparent"
              aria-label="打开菜单"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Button
              type="text"
              size="middle"
              onClick={onLanQrClick}
              icon={<QrcodeOutlined style={{ fontSize: 13 }} />}
              className={navBtnClass(false)}
              title="扫码用手机打开"
            >
              <span className="hidden sm:inline">扫码</span>
            </Button>

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
              disabled={syncDisabled}
              className={`!inline-flex !items-center !gap-1.5 !font-bold !border ${
                syncDisabled
                  ? '!bg-white/5 !border-white/10 !text-ph-text-muted cursor-not-allowed'
                  : '!bg-ph-orange/10 !border-ph-orange/30 !text-ph-orange hover:!bg-ph-orange/20'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-ph-text-muted' : 'bg-ph-orange'}`} />
              {isSyncing ? (
                <span className="tabular-nums">
                  同步中 {formatElapsedShort(elapsed)}
                </span>
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
