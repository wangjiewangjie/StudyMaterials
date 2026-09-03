import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Spin, Empty, Typography, Row, Col, Button, Segmented } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import VideoCard from '../components/VideoCard.jsx';
import TagFilterBar from '../components/TagFilterBar.jsx';
import PageShell from '../components/PageShell.jsx';
import { resolveSiteName } from '../utils/sites.js';
import { CARD_GUTTER, CARD_RESPONSIVE } from '../constants/layout.js';
import { PAGE_SIZE } from '../constants/timing.js';
import { HOME_SORT_OPTIONS, sortByDatePublished, sortByTitle } from '../utils/sort.js';
import { usePagedList } from '../hooks/usePagedList.js';

const { Text } = Typography;

function SkeletonGrid({ count = 12 }) {
  return (
    <Row gutter={CARD_GUTTER}>
      {Array.from({ length: count }, (_, i) => (
        <Col key={i} {...CARD_RESPONSIVE}>
          <div
            className="overflow-hidden rounded border border-white/5 bg-ph-card rise-in mb-5"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <div className="skel w-full" style={{ aspectRatio: '16/9' }} />
            <div className="p-3.5 space-y-2">
              <div className="skel h-3.5 w-[92%] rounded-lg" />
              <div className="skel h-3.5 w-[64%] rounded-lg" />
              <div className="flex gap-2 mt-2">
                <div className="skel h-3 w-12 rounded-lg" />
                <div className="skel h-3 w-16 rounded-lg" />
              </div>
            </div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

function HomeStickyChrome({
  showTags,
  showToolbar,
  tagList,
  activeTag,
  onTagChange,
  pagedLength,
  total,
  sort,
  onSortChange,
}) {
  const chrome = (
    <div className="home-sticky-stack">
      {showTags ? (
        <TagFilterBar
          tags={tagList}
          activeTag={activeTag}
          onTagChange={onTagChange}
        />
      ) : null}
      {showToolbar ? (
        <div className="home-toolbar">
          <div className="toolbar-meta home-toolbar-inner">
            <span className="home-toolbar-meta-text">
              {activeTag ? (
                <>标签 <strong>#{activeTag}</strong> · </>
              ) : null}
              已显示 <strong>{pagedLength}</strong> / 共 <strong>{total}</strong> 条
            </span>
            <Segmented
              size="middle"
              options={HOME_SORT_OPTIONS}
              value={sort}
              onChange={onSortChange}
              className="!bg-ph-panelAlt shrink-0"
            />
          </div>
        </div>
      ) : null}
    </div>
  );

  // 挂到 body，避开任何祖先 transform / overflow 对 fixed 的干扰
  if (typeof document !== 'undefined') {
    return createPortal(chrome, document.body);
  }
  return chrome;
}

export default function HomeView({
  items,
  favIds,
  pendingFavIds,
  siteNameMap,
  tagList = [],
  isLoadingList,
  listError,
  listVersion = 0,
  activeTag,
  onTagChange,
  onCardClick,
  onToggleFavorite,
  onRetry,
}) {
  const [sort, setSort] = useState('date');

  const filtered = useMemo(() => {
    let list = items;
    if (activeTag) {
      list = list.filter(
        (it) => it.category === activeTag || ((it.tags || []).includes(activeTag)),
      );
    }
    const sorted = list.slice();
    if (sort === 'title') sorted.sort(sortByTitle);
    else sorted.sort(sortByDatePublished);
    return sorted;
  }, [items, activeTag, sort]);

  const { paged, hasMore, loadMore, sentinelRef, total } = usePagedList(
    filtered,
    [activeTag, listVersion, sort],
  );

  const showTags = items.length > 0 && tagList.length > 0;
  const showToolbar = !isLoadingList && filtered.length > 0;
  const stickyMode = showTags && showToolbar ? 'both' : showTags ? 'tags' : showToolbar ? 'toolbar' : '';

  return (
    <>
      {stickyMode ? (
        <HomeStickyChrome
          showTags={showTags}
          showToolbar={showToolbar}
          tagList={tagList}
          activeTag={activeTag}
          onTagChange={onTagChange}
          pagedLength={paged.length}
          total={total}
          sort={sort}
          onSortChange={setSort}
        />
      ) : null}

      <PageShell home>
        {stickyMode ? (
          <div className={`home-sticky-spacer is-${stickyMode}`} aria-hidden />
        ) : null}

        <div className="home-page-body">
          {isLoadingList && items.length === 0 && <SkeletonGrid />}

          {!isLoadingList && listError && items.length === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Text type="secondary" className="!text-ph-text-tertiary">
                  加载失败：{listError}
                </Text>
              }
              className="!py-20 rise-in home-empty"
            >
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={onRetry}
                className="!bg-ph-orange !border-0 !text-black !font-bold"
              >
                重试
              </Button>
            </Empty>
          )}

          {!(isLoadingList && items.length === 0) && !(listError && items.length === 0) && (
            <Spin spinning={isLoadingList && items.length > 0} tip="正在加载…">
              {filtered.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Text type="secondary" className="!text-ph-text-tertiary">
                      {activeTag
                        ? `当前标签「${activeTag}」下没有内容，试试切换其他标签`
                        : '资料库还是空的。点击右上角「同步」按钮抓取最新内容'}
                    </Text>
                  }
                  className="!py-20 rise-in home-empty"
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
            </Spin>
          )}
        </div>
      </PageShell>
    </>
  );
}
