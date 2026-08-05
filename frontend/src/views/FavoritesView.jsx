import { useMemo, useState } from 'react';
import { Input, Empty, Modal, Typography, Row, Col, Button, Segmented } from 'antd';
import {
  StarFilled, DownloadOutlined, DeleteOutlined, SearchOutlined,
} from '@ant-design/icons';
import VideoCard from '../components/VideoCard.jsx';
import PageShell from '../components/PageShell.jsx';
import PageBanner from '../components/PageBanner.jsx';
import { buildSiteNameMap, resolveSiteName } from '../services/api.js';
import { CARD_GUTTER, CARD_RESPONSIVE } from '../constants/layout.js';

const { Text } = Typography;

const SORT_OPTIONS = [
  { label: '最新收藏', value: 'recent' },
  { label: '标题排序', value: 'title' },
];

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
  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites]);

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
    <PageShell>
      <PageBanner
        icon={<StarFilled />}
        title="我的收藏库"
        subtitle={(
          <>
            你珍藏的 <span className="text-ph-orange font-bold">{favorites.length}</span> 部精彩影片
          </>
        )}
        actions={(
          <>
            <Button
              size="middle"
              onClick={onExport}
              disabled={favorites.length === 0}
              icon={<DownloadOutlined style={{ fontSize: 14 }} />}
              title="导出收藏列表 (JSON / TXT)"
              className="!inline-flex !items-center !font-bold !bg-white/5 hover:!bg-white/10 !text-ph-text-secondary !border !border-white/10"
            >
              导出列表
            </Button>
            <Button
              size="middle"
              danger
              onClick={() => setConfirmClear(true)}
              disabled={favorites.length === 0}
              icon={<DeleteOutlined style={{ fontSize: 14 }} />}
              title="清空所有收藏"
              className="!inline-flex !items-center !font-bold !bg-red-500/10 hover:!bg-red-500/20 !text-red-400 !border !border-red-500/30"
            >
              清空
            </Button>
          </>
        )}
      />

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 relative">
          <SearchOutlined className="absolute left-3 top-1/2 -translate-y-1/2 text-ph-text-muted z-10" style={{ fontSize: 14 }} />
          <Input
            allowClear
            size="middle"
            placeholder="在收藏库中搜索..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="app-input-search !bg-ph-panel !border-white/10 !text-white"
          />
        </div>
        <Segmented
          size="middle"
          options={SORT_OPTIONS}
          value={sort}
          onChange={(v) => setSort(v)}
          className="!bg-ph-panelAlt"
        />
      </div>

      {filtered.length > 0 && (
        <div className="toolbar-meta -mt-4">
          <span>
            显示 <strong>{filtered.length}</strong>
            {filtered.length !== favorites.length ? ` / ${favorites.length}` : ''} 条
          </span>
        </div>
      )}

      <section className="overflow-x-hidden">
        {filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text type="secondary" className="!text-ph-text-tertiary">
                {favorites.length === 0
                  ? '还没有收藏。点卡片右上角星标即可收藏。'
                  : '当前搜索下没有结果，试试清除关键词。'}
              </Text>
            }
            className="!py-20 rise-in"
          />
        ) : (
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
        )}
      </section>

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
        <Text className="!text-ph-text-secondary text-sm">
          此操作会移除全部 <span className="text-ph-orange font-bold">{favorites.length}</span> 条收藏，且不可撤销。
        </Text>
      </Modal>
    </PageShell>
  );
}
