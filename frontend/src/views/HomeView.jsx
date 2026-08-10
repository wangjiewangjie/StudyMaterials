import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Spin, Empty, Typography, Row, Col, Button } from 'antd';
import VideoCard from '../components/VideoCard.jsx';
import TagFilterBar from '../components/TagFilterBar.jsx';
import PageShell from '../components/PageShell.jsx';
import { buildSiteNameMap, resolveSiteName } from '../services/api.js';
import { CARD_GUTTER, CARD_RESPONSIVE } from '../constants/layout.js';

const { Text } = Typography;

const PAGE_SIZE = 60;

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

// 首页：标签筛选 + 视频栅格（滚动/点击继续加载）
export default function HomeView({
  items,
  favIds,
  sites,
  tagList = [],
  loadingList,
  activeTag,
  onTagChange,
  onCardClick,
  onToggleFavorite,
}) {
  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  const filtered = useMemo(() => {
    let out = items;
    if (activeTag) {
      out = out.filter(
        (it) => it.category === activeTag || ((it.tags || []).includes(activeTag))
      );
    }
    return out.slice().sort((a, b) => {
      const da = a.datePublished || '';
      const db = b.datePublished || '';
      if (da && db) return db.localeCompare(da);
      if (da) return -1;
      if (db) return 1;
      return Number(b.id) - Number(a.id);
    });
  }, [items, activeTag]);

  // 列表或标签变化时回到首屏
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTag, items]);

  const paged = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(filtered.length, n + PAGE_SIZE));
  }, [filtered.length]);

  // 触底自动加载下一批
  useEffect(() => {
    if (!hasMore) return undefined;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, paged.length]);

  return (
    <PageShell home>
      {items.length > 0 && tagList.length > 0 ? (
        <TagFilterBar
          tags={tagList}
          activeTag={activeTag}
          onTagChange={onTagChange}
        />
      ) : null}

      <div className="home-page-body">
        {!loadingList && filtered.length > 0 && (
          <div className="toolbar-meta mb-2">
            <span>
              {activeTag ? (
                <>标签 <strong>#{activeTag}</strong> · </>
              ) : null}
              已显示 <strong>{paged.length}</strong> / 共 <strong>{filtered.length}</strong> 条
            </span>
          </div>
        )}

        {loadingList && items.length === 0 ? (
          <SkeletonGrid />
        ) : (
          <Spin spinning={loadingList && items.length > 0} tip="正在加载…">
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
                        favorited={favIds.has(item.id)}
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
                      加载更多（还有 {filtered.length - paged.length} 条）
                    </Button>
                  </div>
                ) : filtered.length > PAGE_SIZE ? (
                  <p className="text-center text-xs text-ph-text-tertiary py-6 m-0">
                    已全部加载 · 共 {filtered.length} 条
                  </p>
                ) : null}
              </>
            )}
          </Spin>
        )}
      </div>
    </PageShell>
  );
}
