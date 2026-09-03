import { Button, Drawer } from 'antd';
import {
  HomeOutlined, StarOutlined, StarFilled, FileTextOutlined, SyncOutlined,
} from '@ant-design/icons';
import { formatElapsedShort } from '../utils/format.js';

const DRAWER_STYLES = {
  header: {
    background: '#0A0A0A',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    color: '#fff',
  },
  body: { background: '#0A0A0A', padding: '16px 12px' },
  mask: { background: 'rgba(0,0,0,0.7)' },
};

const BTN_ACTIVE = '!bg-[#FF9900]/10 !border-[#FF9900]/30 !text-[#FF9900]';
const BTN_IDLE = '!bg-[#141416] !text-neutral-200 !border-white/10';
const BTN_DISABLED = '!bg-white/5 !border-white/10 !text-neutral-500';

/** 移动端侧栏：首页 / 收藏 / 同步日志 / 立即同步 */
export default function MobileNavDrawer({
  open,
  isHomeView,
  isFavoritesView,
  isSyncCenterView,
  favoritesCount,
  isSyncing,
  isBusy = false,
  elapsed,
  onClose,
  onHomeClick,
  onFavoritesClick,
  onSyncCenterClick,
  onSyncClick,
}) {
  return (
    <Drawer
      title="导航菜单"
      placement="right"
      open={open}
      onClose={onClose}
      width={280}
      className="app-drawer"
      styles={DRAWER_STYLES}
    >
      <div className="space-y-2 mb-5">
        <Button
          block
          size="large"
          onClick={onHomeClick}
          icon={<HomeOutlined />}
          className={`!inline-flex !items-center !justify-start !font-bold !border ${
            isHomeView ? BTN_ACTIVE : BTN_IDLE
          }`}
        >
          首页
        </Button>

        <Button
          block
          size="large"
          onClick={onFavoritesClick}
          className={`!flex !items-center !justify-between !font-bold !border ${
            isFavoritesView ? BTN_ACTIVE : BTN_IDLE
          }`}
        >
          <span className="flex items-center gap-1">
            {isFavoritesView
              ? <StarFilled style={{ color: '#FF9900' }} />
              : <StarOutlined />}
            我的收藏
          </span>
          {favoritesCount > 0 && (
            <span className="text-[10px] font-black min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-lg bg-[#FF9900] text-black shrink-0">
              {favoritesCount}
            </span>
          )}
        </Button>

        <Button
          block
          size="large"
          onClick={onSyncCenterClick}
          icon={<FileTextOutlined />}
          className={`!inline-flex !items-center !justify-start !font-bold !border ${
            isSyncCenterView ? BTN_ACTIVE : BTN_IDLE
          }`}
        >
          同步日志
        </Button>

        <Button
          block
          size="large"
          onClick={onSyncClick}
          disabled={isBusy}
          icon={<SyncOutlined spin={isSyncing} />}
          className={`!inline-flex !items-center !justify-start !font-bold !border ${
            isBusy ? BTN_DISABLED : BTN_ACTIVE
          }`}
        >
          {isSyncing
            ? `同步中 ${formatElapsedShort(elapsed)}`
            : '立即同步'}
        </Button>
      </div>
    </Drawer>
  );
}
