import { useMemo, useState, useEffect } from 'react';
import { Input, Empty, Modal, Typography, Row, Col, Button, Segmented, App as AntdApp } from 'antd';
import {
  StarFilled, DownloadOutlined, DeleteOutlined, SearchOutlined,
} from '@ant-design/icons';
import VideoCard from '../components/VideoCard.jsx';
import PageShell from '../components/PageShell.jsx';
import PageBanner from '../components/PageBanner.jsx';
import { resolveSiteName } from '../utils/sites.js';
import { CARD_GUTTER, CARD_RESPONSIVE } from '../constants/layout.js';
import { FAV_SEARCH_DEBOUNCE_MS, PAGE_SIZE } from '../constants/timing.js';
import { FAV_SORT_OPTIONS, sortByFavoritedAt, sortByTitle } from '../utils/sort.js';
import { usePagedList } from '../hooks/usePagedList.js';

const { Text } = Typography;

export default function FavoritesView({
  favorites,
  favIds,
  pendingFavIds,
  siteNameMap,
  query,
  onQueryChange,
  onCardClick,
  onToggleFavorite,
  onClearAll,
  onExport,
}) {
  const { message } = AntdApp.useApp();
  const [sort, setSort] = useState('recent');
  const [confirmClear, setConfirmClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [inputQuery, setInputQuery] = useState(query || '');
  const [debouncedQuery, setDebouncedQuery] = useState(query || '');

  useEffect(() => {
    setInputQuery(query || '');
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(inputQuery);
      onQueryChange?.(inputQuery);
    }, FAV_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputQuery, onQueryChange]);

  const filtered = useMemo(() => {
    const qlc = (debouncedQuery || '').trim().toLowerCase();
    let out = favorites;
    if (qlc) {
      out = out.filter(
        (it) => (it.title || '').toLowerCase().includes(qlc) || (it.id || '').includes(qlc),
      );
    }
    const sorted = out.slice();
    if (sort === 'title') sorted.sort(sortByTitle);
    else sorted.sort(sortByFavoritedAt);
    return sorted;
  }, [favorites, debouncedQuery, sort]);

  const { paged, hasMore, loadMore, sentinelRef, total } = usePagedList(
    filtered,
    [debouncedQuery, sort, favorites.length],
  );

  const handleConfirmClear = async () => {
    setIsClearing(true);
    try {
      await onClearAll();
      setConfirmClear(false);
    } catch (error) {
      message.error(error?.message || '清空失败，请重试');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <PageShell>
      <PageBanner
        largeIcon
        icon={<StarFilled className="text-xl text-ph-orange" />}
        title="我的收藏"
        subtitle="本地收藏库，支持搜索与导出"
        actions={(
          <>
            <Button
              size="middle"
              onClick={onExport}
              disabled={favorites.length === 0}
              icon={<DownloadOutlined style={{ fontSize: 14 }} />}
              className="!inline-flex !items-center !font-bold !bg-white/5 !border-white/10 !text-ph-text-secondary"
            >
              导出
            </Button>
            <Button
              size="middle"
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
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ph-text-muted z-10" aria-hidden="true">
            <SearchOutlined style={{ fontSize: 14 }} />
          </span>
          <Input
            allowClear
            size="middle"
            type="search"
            aria-label="搜索收藏"
            autoComplete="off"
            placeholder="在收藏库中搜索，如：教程…"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            className="app-input-search !bg-ph-panel !border-white/10 !text-white"
          />
        </div>
        <Segmented
          size="middle"
          options={FAV_SORT_OPTIONS}
          value={sort}
          onChange={setSort}
          className="!bg-ph-panelAlt"
        />
      </div>

      {total > 0 && (
        <div className="toolbar-meta -mt-4">
          <span>
            已显示 <strong>{paged.length}</strong>
            {total !== favorites.length || paged.length !== total
              ? ` / ${total}`
              : ''} 条
            {filtered.length !== favorites.length ? `（共收藏 ${favorites.length}）` : ''}
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
          <>
            <Row gutter={CARD_GUTTER}>
              {paged.map((item, i) => (
                <Col key={item.id} {...CARD_RESPONSIVE} className="mb-3 sm:mb-5">
                  <VideoCard
                    item={item}
                    index={i}
                    onClick={onCardClick}
                    isFavorited={favIds.has(item.id)}
                    isFavPending={pendingFavIds?.has(item.id)}
                    onToggleFavorite={onToggleFavorite}
                    showFavBadge
                    siteName={resolveSiteName(item.siteUrl, siteNameMap)}
                  />
                </Col>
              ))}
            </Row>
            {hasMore ? (
              <div ref={sentinelRef} className="flex justify-center py-6">
                <Button
                  type="default"
                  onClick={loadMore}
                  className="!font-bold !bg-white/5 !border-white/10 !text-ph-text-secondary hover:!text-ph-orange hover:!border-ph-orange/40"
                >
                  加载更多（还有 {total - paged.length} 条）
                </Button>
              </div>
            ) : null}
            {!hasMore && total > PAGE_SIZE ? (
              <p className="text-center text-xs text-ph-text-tertiary py-6 m-0">
                已全部加载 · 共 {total} 条
              </p>
            ) : null}
          </>
        )}
      </section>

      <Modal
        open={confirmClear}
        onCancel={() => !isClearing && setConfirmClear(false)}
        onOk={handleConfirmClear}
        okText="确认清空"
        cancelText="取消"
        confirmLoading={isClearing}
        okButtonProps={{ danger: true }}
        title="清空所有收藏？"
        centered
        closable={!isClearing}
        maskClosable={!isClearing}
      >
        <Text className="!text-ph-text-secondary text-sm">
          此操作会移除全部 <span className="text-ph-orange font-bold">{favorites.length}</span> 条收藏，且不可撤销。
        </Text>
      </Modal>
    </PageShell>
  );
}
