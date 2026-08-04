import { useMemo, useState } from 'react';
import { Input, Empty, Modal, Typography, Row, Col, Button, Segmented } from 'antd';
import {
  HeartFilled, DownloadOutlined, DeleteOutlined, SearchOutlined,
} from '@ant-design/icons';
import VideoCard from '../components/VideoCard.jsx';
import { buildSiteNameMap, resolveSiteName } from '../services/api.js';

const { Text } = Typography;

// 排序选项：用于 antd Segmented
const SORT_OPTIONS = [
  { label: '最新收藏', value: 'recent' },
  { label: '标题排序', value: 'title' },
];

// 收藏卡片栅格响应式：2 / 2 / 3 / 4 列
const CARD_GUTTER = [12, 20];
const CARD_RESPONSIVE = { xs: 12, sm: 12, md: 8, lg: 6 };

// 收藏库视图：横幅 + 搜索/排序 + 卡片栅格。
export default function FavoritesView({
  favorites,
  favIds,
  sites,
  query,
  onQueryChange,
  onCardClick,
  onToggleFavorite,
  onClearAll,
  onExport,
}) {
  const [sort, setSort] = useState('recent');
  const [confirmClear, setConfirmClear] = useState(false);

  // 站点 url -> name 映射（用于卡片来源标签）
  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites]);

  // 过滤 + 排序
  const filtered = useMemo(() => {
    const qlc = (query || '').trim().toLowerCase();
    let out = favorites;
    if (qlc) {
      out = out.filter(
        (it) => (it.title || '').toLowerCase().includes(qlc) || (it.id || '').includes(qlc)
      );
    }
    return out.slice().sort((a, b) => {
      if (sort === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      const fa = a.favoritedAt || '';
      const fb = b.favoritedAt || '';
      if (fa && fb) return fb.localeCompare(fa);
      if (fa) return -1;
      if (fb) return 1;
      return 0;
    });
  }, [favorites, query, sort]);

  return (
    <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-24 pb-16 space-y-8">
      {/* 顶部横幅 */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-[#1a1a1e] to-[#0a0a0a] p-6 sm:p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <HeartFilled style={{ color: '#ef4444' }} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black italic tracking-tighter text-white">
                  我的收藏库
                </h1>
                <p className="text-xs text-gray-400">
                  你珍藏的 <span className="text-[#FF9900] font-bold">{favorites.length}</span> 部精彩影片
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onExport}
              disabled={favorites.length === 0}
              icon={<DownloadOutlined style={{ fontSize: 14 }} />}
              title="导出收藏列表 (JSON / TXT)"
              className="!flex !items-center !gap-1.5 !px-4 !py-2 !h-auto !rounded-xl !text-xs !font-bold !bg-white/5 hover:!bg-white/10 !text-gray-300 !border !border-white/10"
            >
              导出列表
            </Button>
            <Button
              danger
              onClick={() => setConfirmClear(true)}
              disabled={favorites.length === 0}
              icon={<DeleteOutlined style={{ fontSize: 14 }} />}
              title="清空所有收藏"
              className="!flex !items-center !gap-1.5 !px-4 !py-2 !h-auto !rounded-xl !text-xs !font-bold !bg-red-500/10 hover:!bg-red-500/20 !text-red-400 !border !border-red-500/30"
            >
              清空
            </Button>
          </div>
        </div>
      </section>

      {/* 搜索 + 排序 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 relative">
          <SearchOutlined className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" style={{ fontSize: 14 }} />
          <Input
            allowClear
            placeholder="在收藏库中搜索..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="!bg-[#141416] !border-white/10 !rounded-xl !pl-10 !pr-4 !py-2.5 !text-sm !text-white"
          />
        </div>
        <Segmented
          options={SORT_OPTIONS}
          value={sort}
          onChange={(v) => setSort(v)}
          className="!bg-[#1a1a1e] !rounded-xl !p-1"
        />
      </div>

      {/* 收藏栅格 */}
      <section className="space-y-4 overflow-x-hidden">
        {filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text type="secondary" className="!text-gray-400">
                {favorites.length === 0
                  ? '还没有收藏。点卡片右上角心形按钮即可收藏。'
                  : '当前搜索/筛选下没有收藏，试试清除筛选。'}
              </Text>
            }
            className="!py-20 rise-in"
          />
        ) : (
            <div className="overflow-x-hidden">
              <Row gutter={CARD_GUTTER}>
                {filtered.map((item, i) => (
                  <Col key={item.id} {...CARD_RESPONSIVE} className="mb-3 sm:mb-5">
                    <VideoCard
                      item={item}
                      index={i}
                      onClick={onCardClick}
                      favorited={favIds.has(item.id)}
                      onToggleFavorite={onToggleFavorite}
                      showFavBadge
                      siteName={resolveSiteName(item.siteUrl, siteNameMap)}
                    />
                  </Col>
                ))}
              </Row>
            </div>
          )}
      </section>

      {/* 清空确认 */}
      <Modal
        open={confirmClear}
        onCancel={() => setConfirmClear(false)}
        onOk={() => {
          setConfirmClear(false);
          onClearAll();
        }}
        okText="确认清空"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        title="清空所有收藏？"
        centered
      >
        <Text className="!text-gray-300 text-sm">
          此操作会移除全部 <span className="text-[#FF9900] font-bold">{favorites.length}</span> 条收藏，且不可撤销。
        </Text>
      </Modal>
    </main>
  );
}
