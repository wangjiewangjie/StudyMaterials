import { useMemo } from 'react';
import { Spin, Empty, Typography, Row, Col, Tag } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import VideoCard from '../components/VideoCard.jsx';
import { buildSiteNameMap, resolveSiteName } from '../services/api.js';

const { Text } = Typography;

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
            className="overflow-hidden rounded-lg border border-white/5 bg-[#121212] rise-in mb-5"
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

// 首页：标签筛选 + 视频栅格（标签规则由服务端 /api/tags 处理）
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
  // 站点 url -> name 映射（用于卡片来源标签）
  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites]);

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
      {/* 标签筛选条：仅展示服务端返回的有效标签 */}
      <div className="home-filter-bar fixed top-16 left-0 right-0 z-30 bg-[#0A0A0A]/95 backdrop-blur-xl border-b border-white/10 shadow-2xl shadow-black/80">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2">
          <div className="tag-scroll flex items-center gap-1.5 sm:gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none]">
            <Tag.CheckableTag
              checked={!activeTag}
              onChange={() => onTagChange('')}
              className="!px-3 !py-1 !rounded-lg !text-xs !font-semibold !m-0 !shrink-0"
            >
              全部
            </Tag.CheckableTag>
            {tagList.map(({ tag }) => (
              <Tag.CheckableTag
                key={tag}
                checked={activeTag === tag}
                onChange={() => onTagChange(activeTag === tag ? '' : tag)}
                className="!px-3 !py-1 !rounded-lg !text-xs !font-semibold !m-0 !shrink-0"
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
                  <span className="inline-flex items-center justify-center w-20 h-20 rounded-lg bg-[#FF9900]/8 border border-[#FF9900]/15 text-[#FF9900]/70 rise-in">
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
