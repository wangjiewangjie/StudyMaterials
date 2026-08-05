import { useMemo } from 'react';
import { Spin, Empty, Typography, Row, Col } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
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

// 首页：标签筛选 + 视频栅格
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

  const paged = filtered.slice(0, PAGE_SIZE);
  const showingAll = filtered.length <= PAGE_SIZE;

  return (
    <PageShell home>
      <TagFilterBar
        tags={tagList}
        activeTag={activeTag}
        onTagChange={onTagChange}
      />

      <div className="home-page-body">
        {!loadingList && filtered.length > 0 && (
          <div className="toolbar-meta mb-3">
            <span>
              {activeTag ? (
                <>标签 <strong>#{activeTag}</strong> · </>
              ) : null}
              共 <strong>{filtered.length}</strong> 条
              {!showingAll ? <> · 先展示前 {PAGE_SIZE} 条</> : null}
            </span>
          </div>
        )}

        {loadingList && items.length === 0 ? (
          <SkeletonGrid />
        ) : (
          <Spin spinning={loadingList && items.length > 0} tip="正在加载…">
            {filtered.length === 0 ? (
              <Empty
                image={(
                  <span className="inline-flex items-center justify-center w-20 h-20 rounded accent-orb rise-in">
                    <InboxOutlined style={{ fontSize: 40 }} />
                  </span>
                )}
                description={
                  <Text type="secondary" className="!text-ph-text-tertiary">
                    {activeTag
                      ? `当前标签「${activeTag}」下没有内容，试试切换其他标签`
                      : '资料库还是空的。点击右上角「同步」按钮抓取最新内容'}
                  </Text>
                }
                className="!py-20 rise-in"
              />
            ) : (
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
            )}
          </Spin>
        )}
      </div>
    </PageShell>
  );
}
