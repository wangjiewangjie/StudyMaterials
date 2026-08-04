import { useEffect, useMemo, useState } from 'react';
import { Button, Tag, Row, Col } from 'antd';
import {
  ArrowLeftOutlined, HeartFilled, HeartOutlined, LinkOutlined,
} from '@ant-design/icons';
import VideoPlayer from '../VideoPlayer.jsx';
import VideoCard from '../components/VideoCard.jsx';
import { formatDate, buildSiteNameMap, resolveSiteName } from '../services/api.js';

// 推荐栅格响应式：2 / 2 / 4 列
const REC_RESPONSIVE = { xs: 12, sm: 12, lg: 6 };
const REC_GUTTER = [12, 16];

// 详情页：顶部播放器 + 元信息卡片 + 同类推荐 + 最新视频。
// onTagClick 用于点击标签回首页搜索；onBack 返回列表。
export default function DetailView({
  item,
  items,
  sites,
  favIds,
  favorited,
  onToggleFavorite,
  onBack,
  onCardClick,
  onTagClick,
}) {
  const [localTags, setLocalTags] = useState(item.tags || []);
  const [localCategory, setLocalCategory] = useState(item.category || null);
  const [localDate, setLocalDate] = useState(item.datePublished || null);

  useEffect(() => {
    setLocalTags(item.tags || []);
    setLocalCategory(item.category || null);
    setLocalDate(item.datePublished || null);
  }, [item]);

  const hasVideo = !!(item.video && item.video.url);

  // 站点名称映射：url -> name
  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites]);

  // 数据源：优先站点配置名称，否则取主机名
  const sourceName = useMemo(
    () => resolveSiteName(item.siteUrl, siteNameMap),
    [item.siteUrl, siteNameMap]
  );

  // 相似推荐：同分类或共享标签的前 4 条
  const similar = useMemo(() => {
    if (!items || items.length === 0) return [];
    const pool = items.filter((it) => it.id !== item.id);
    const sameCat = localCategory
      ? pool.filter((it) => it.category === localCategory)
      : [];
    const sameTag = localTags.length > 0
      ? pool.filter((it) => (it.tags || []).some((t) => localTags.includes(t)))
      : [];
    const seen = new Set();
    const out = [];
    for (const it of [...sameCat, ...sameTag]) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
      if (out.length >= 4) break;
    }
    return out;
  }, [items, item.id, localCategory, localTags]);

  const handleTags = (newTags, newCategory, newDate) => {
    if (newTags && newTags.length) setLocalTags(newTags);
    if (newCategory) setLocalCategory(newCategory);
    if (newDate) setLocalDate(newDate);
  };

  return (
    <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-24 pb-16 space-y-8">
      {/* 顶栏：返回按钮 + 数据源（可点击跳转原文） */}
      <div className="flex items-center justify-between gap-3">
        <Button
          onClick={onBack}
          icon={<ArrowLeftOutlined style={{ fontSize: 14 }} />}
          className="!flex !items-center !gap-2 !px-3.5 !py-2 !h-auto !bg-neutral-800/80 hover:!bg-neutral-700 !text-neutral-200 !rounded-xl !text-xs !font-semibold !border-0 shrink-0"
        >
          返回浏览列表
        </Button>
        {item.url ? (
          <Button
            size="small"
            icon={<LinkOutlined />}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            title="在新标签打开原文"
            className="!flex !items-center !gap-1.5 !text-xs !text-amber-400 !font-medium !bg-neutral-800 hover:!bg-neutral-700 !px-2.5 !py-1 !rounded !border !border-neutral-700"
          >
            数据源: {sourceName}
          </Button>
        ) : (
          <div className="text-xs text-neutral-400 flex items-center gap-2 shrink-0">
            <span>数据源:</span>
            <Tag className="!m-0 !text-amber-400 !font-medium !bg-neutral-800 !px-2 !py-0.5 !rounded !border !border-neutral-700">
              {sourceName}
            </Tag>
          </div>
        )}
      </div>

      {/* 播放器 */}
      <div className="w-full aspect-video rounded-2xl overflow-hidden border border-white/5 shadow-2xl bg-[#0A0A0A]">
        {hasVideo ? (
          <VideoPlayer item={item} onTags={handleTags} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            该条目暂无可播放地址
          </div>
        )}
      </div>

      {/* 元信息卡片 */}
      <div className="bg-[#0A0A0A] border border-white/5 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-2 max-w-3xl">
            <h1 className="text-2xl sm:text-3xl font-black italic tracking-tighter text-white leading-snug">
              {item.title || `条目 ${item.id}`}
            </h1>
          </div>
          <Button
            onClick={() => onToggleFavorite(item)}
            icon={favorited
              ? <HeartFilled style={{ color: '#ef4444' }} />
              : <HeartOutlined />}
            className={`!flex !items-center !gap-2 !px-5 !py-2.5 !h-auto !rounded-xl !text-xs !font-bold !border shrink-0 ${
              favorited
                ? '!bg-red-500/20 !text-red-400 !border-red-500/40 hover:!bg-red-500/30'
                : '!bg-white/5 !text-gray-300 !border-white/10 hover:!bg-white/10'
            }`}
          >
            {favorited ? '已在收藏库' : '加入收藏'}
          </Button>
        </div>

        {/* 元信息四宫格 */}
        <Row gutter={[12, 12]} className="detail-meta-grid bg-[#121212] border border-white/5 p-3.5 rounded-xl text-xs text-gray-300">
          <Col xs={12} sm={6}>
            <div className="text-[10px] text-gray-500 uppercase font-bold">视频时长</div>
            <div className="font-bold text-white">—</div>
          </Col>
          <Col xs={12} sm={6}>
            <div className="text-[10px] text-gray-500 uppercase font-bold">分辨率</div>
            <div className="font-bold text-emerald-400">{hasVideo ? 'HLS Stream' : '仅图文'}</div>
          </Col>
          <Col xs={12} sm={6}>
            <div className="text-[10px] text-gray-500 uppercase font-bold">数据源节点</div>
            <div className="font-bold text-white truncate max-w-[120px]">{sourceName}</div>
          </Col>
          <Col xs={12} sm={6}>
            <div className="text-[10px] text-gray-500 uppercase font-bold">发布日期</div>
            <div className="font-bold text-white tabular-nums">{localDate ? formatDate(localDate) : '—'}</div>
          </Col>
        </Row>

        {/* 标签区（不显示标题） */}
        {(localCategory || localTags.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {localCategory && (
              <Tag
                color="orange"
                className="!cursor-pointer !m-0 !rounded-lg !px-2.5 !py-1 !text-xs !bg-[#FF9900]/15 !text-[#FF9900] !border-[#FF9900]/30"
                onClick={() => onTagClick && onTagClick(localCategory)}
              >
                {localCategory}
              </Tag>
            )}
            {localTags.map((t) => (
              <Tag
                key={t}
                className="!cursor-pointer !m-0 !rounded-lg !px-2.5 !py-1 !text-xs !bg-neutral-800 !text-neutral-300 !border-neutral-700 hover:!text-[#FF9900] hover:!border-[#FF9900]/40 transition-colors"
                onClick={() => onTagClick && onTagClick(t)}
              >
                #{t}
              </Tag>
            ))}
          </div>
        )}
      </div>

      {/* 同类精选推荐 */}
      {similar.length > 0 && (
        <section className="space-y-4 overflow-x-hidden">
          <div className="border-b border-neutral-800 pb-3">
            <h2 className="text-lg font-bold text-white">相似精选推荐</h2>
          </div>
          <div className="overflow-x-hidden">
            <Row gutter={REC_GUTTER}>
              {similar.map((it, i) => (
                <Col key={it.id} {...REC_RESPONSIVE} className="mb-3 sm:mb-4">
                  <VideoCard
                    item={it}
                    index={i}
                    onClick={onCardClick}
                    favorited={favIds.has(it.id)}
                    onToggleFavorite={onToggleFavorite}
                    siteName={resolveSiteName(it.siteUrl, siteNameMap)}
                  />
                </Col>
              ))}
            </Row>
          </div>
        </section>
      )}
    </main>
  );
}
