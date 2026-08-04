import { Input, Button } from 'antd';
import {
  SearchOutlined, StarOutlined, StarFilled, FileTextOutlined, MenuOutlined,
} from '@ant-design/icons';

// 顶部共享 Header：Logo / 搜索 / 操作按钮。
// 桌面端：完整展示按钮；移动端：仅 Logo + 搜索 + 菜单按钮，操作按钮移入 Drawer。
export default function AppHeader({
  query,
  onQueryChange,
  onSearch,
  favoritesCount,
  isFavoritesView,
  onFavoritesClick,
  onSyncCenterClick,
  onSyncClick,
  onHomeClick,
  syncing,
  isMobile,
  onOpenDrawer,
}) {
  return (
    <header className="app-header fixed top-0 left-0 right-0 z-40 w-full backdrop-blur-md bg-[#0A0A0A]/90 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo：点击回首页 */}
        <Button
          type="text"
          onClick={onHomeClick}
          className="!flex !items-center !gap-1 !p-0 !h-auto !bg-transparent !border-0 shrink-0 group"
          title="返回首页"
        >
          <span className="bg-[#FF9900] text-black font-black italic text-base sm:text-xl px-2 py-0.5 rounded-lg tracking-tighter group-hover:bg-[#ffaa22] transition-colors">
            STUDY
          </span>
          <span className="text-base sm:text-xl font-black italic tracking-tighter text-white group-hover:text-neutral-200 transition-colors hidden sm:inline">
            HUB
          </span>
        </Button>

        {/* 搜索框 */}
        <div className="flex-1 max-w-[260px] sm:max-w-xs md:max-w-md relative app-search">
          <SearchOutlined className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" style={{ fontSize: 14 }} />
          <Input
            allowClear
            placeholder="搜索视频、分类、标签…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onPressEnter={onSearch}
            className="!bg-[#141416] !border-white/10 !rounded-lg !pl-9 !pr-7 !py-1.5 !text-xs !text-white"
            styles={{ input: { background: 'transparent' } }}
          />
        </div>

        {/* 移动端：菜单按钮放在最右侧 */}
        {isMobile ? (
          <Button
            type="text"
            size="small"
            onClick={onOpenDrawer}
            icon={<MenuOutlined style={{ fontSize: 18 }} />}
            className="!flex !items-center !justify-center !w-8 !h-8 !rounded-lg !text-[#FF9900] hover:!bg-[#FF9900]/10 shrink-0 !border-0 !bg-transparent !min-w-0"
            aria-label="打开菜单"
          />
        ) : (
          /* 桌面端：右侧操作按钮 */
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <Button
              type="text"
              size="small"
              onClick={onFavoritesClick}
              icon={isFavoritesView ? <StarFilled style={{ fontSize: 13 }} /> : <StarOutlined style={{ fontSize: 13 }} />}
              className={`!flex !items-center !gap-1 sm:!gap-1.5 !px-2.5 sm:!px-3 !py-1.5 !rounded-lg !text-xs !font-bold !border ${
                isFavoritesView
                  ? '!bg-[#FF9900]/10 !border-[#FF9900]/30 !text-[#FF9900]'
                  : '!bg-[#141416] hover:!bg-white/10 !text-neutral-300 !border-white/10'
              }`}
            >
              <span className="hidden sm:inline">收藏</span>
              {favoritesCount > 0 && (
                <span className="text-[10px] font-black min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-lg bg-[#FF9900] text-black">
                  {favoritesCount}
                </span>
              )}
            </Button>

            <Button
              type="text"
              size="small"
              onClick={onSyncCenterClick}
              icon={<FileTextOutlined style={{ fontSize: 13 }} />}
              className="!flex !items-center !gap-1 sm:!gap-1.5 !px-2.5 sm:!px-3 !py-1.5 !rounded-lg !text-xs !font-bold !bg-[#141416] hover:!bg-white/10 !text-neutral-300 !border !border-white/10"
            >
              <span className="hidden sm:inline">日志</span>
            </Button>

            <Button
              type="text"
              size="small"
              onClick={onSyncClick}
              className="!flex !items-center !gap-1.5 !px-2.5 sm:!px-3 !py-1.5 !rounded-lg !text-xs !bg-[#FF9900]/10 !border !border-[#FF9900]/30 !text-[#FF9900] hover:!bg-[#FF9900]/20"
            >
              <span className={`w-2 h-2 bg-[#FF9900] rounded-lg ${syncing ? 'animate-pulse' : ''}`} />
              <span className="font-bold text-[11px]">同步</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
