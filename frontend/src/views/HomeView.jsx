import { useMemo } from 'react';
import { Spin, Empty, Typography, Row, Col, Tag } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import VideoCard from '../components/VideoCard.jsx';
import { buildSiteNameMap, resolveSiteName } from '../services/api.js';

const { Text } = Typography;

const TAG_COLLAPSED_COUNT = 12;
const PAGE_SIZE = 60;

// 栅格响应式配置：2 / 2 / 3 / 4 列
const CARD_GUTTER = [12, 20];
const CARD_RESPONSIVE = {
  xs: 12,   // <576px 2 列
  sm: 12,   // ≥576px 2 列
  md: 8,    // ≥768px 3 列
  lg: 6,    // ≥992px 4 列
};

// 通用骨架屏栅格
function SkeletonGrid({ count = 12 }) {
  return (
    <Row gutter={CARD_GUTTER}>
      {Array.from({ length: count }, (_, i) => (
        <Col key={i} {...CARD_RESPONSIVE}>
          <div
            className="overflow-hidden rounded-xl border border-white/5 bg-[#121212] rise-in mb-5"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <div className="skel w-full" style={{ aspectRatio: '16/9' }} />
            <div className="p-3.5 space-y-2">
              <div className="skel h-3.5 w-[92%] rounded-sm" />
              <div className="skel h-3.5 w-[64%] rounded-sm" />
              <div className="flex gap-2 mt-2">
                <div className="skel h-3 w-12 rounded-sm" />
                <div className="skel h-3 w-16 rounded-sm" />
              </div>
            </div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

// 首页视图：标签筛选 + 视频栅格。
// 桌面端展示顶部标签栏；移动端标签栏由 Drawer 提供，此处的筛选条隐藏。
export default function HomeView({
  items,
  favIds,
  sites,
  loadingList,
  activeTag,
  onTagChange,
  onCardClick,
  onToggleFavorite,
  isMobile,
}) {
  // 站点 url -> name 映射（用于卡片来源标签）
  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites]);

  // 标签计数（按出现频次倒序）
  const tagList = useMemo(() => {
    const counts = new Map();
    items.forEach((it) => {
      if (it.category) counts.set(it.category, (counts.get(it.category) || 0) + 1);
      (it.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([tag, count]) => ({ tag, count }));
  }, [items]);

  // 过滤 + 排序
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

  return (
    <>
      {/* 标签筛选条：bilibili 风格横向滚动胶囊条（桌面+移动统一显示） */}
      <div className="home-filter-bar fixed top-16 left-0 right-0 z-30 bg-[#0A0A0A]/95 backdrop-blur-xl border-b border-white/10 shadow-2xl shadow-black/80">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2">
          <div className="tag-scroll flex items-center gap-1.5 sm:gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none]">
            <Tag.CheckableTag
              checked={!activeTag}
              onChange={() => onTagChange('')}
              className="!px-3 !py-1 !rounded-full !text-xs !font-semibold !m-0 !shrink-0"
            >
              全部
            </Tag.CheckableTag>
            {tagList.slice(0, TAG_COLLAPSED_COUNT).map(({ tag }) => (
              <Tag.CheckableTag
                key={tag}
                checked={activeTag === tag}
                onChange={() => onTagChange(activeTag === tag ? '' : tag)}
                className="!px-3 !py-1 !rounded-full !text-xs !font-semibold !m-0 !shrink-0"
              >
                #{tag}
              </Tag.CheckableTag>
            ))}
          </div>
        </div>
      </div>

      {/* 主内容：pt-28 清除 header(64px) + 标签栏(~40px) */}
      <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pb-8 flex-grow overflow-x-hidden pt-28">
        {loadingList && items.length === 0 ? (
          <div className="overflow-x-hidden">
            <SkeletonGrid />
          </div>
        ) : (
          <Spin spinning={loadingList && items.length > 0} tip="正在加载…">
            {filtered.length === 0 ? (
              <Empty
                image={(
                  <span className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#FF9900]/8 border border-[#FF9900]/15 text-[#FF9900]/70 rise-in">
                    <InboxOutlined style={{ fontSize: 40 }} />
                  </span>
                )}
                description={
                  <Text type="secondary" className="!text-gray-400">
                    {activeTag
                      ? `当前标签「${activeTag}」下没有内容，试试切换其他标签`
                      : '资料库还是空的。点击右上角「同步」按钮抓取最新内容'}
                  </Text>
                }
                className="!py-20 rise-in"
              />
            ) : (
              <div className="overflow-x-hidden">
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
              </div>
            )}
          </Spin>
        )}
      </main>
    </>
  );
}
