import { useEffect, useMemo, useState } from 'react';
import { Button, Tag, Row, Col } from 'antd';
import {
  ArrowLeftOutlined, StarFilled, StarOutlined, LinkOutlined,
} from '@ant-design/icons';
import VideoPlayer from '../VideoPlayer.jsx';
import VideoCard from '../components/VideoCard.jsx';
import PageShell from '../components/PageShell.jsx';
import { buildSiteNameMap, resolveSiteName } from '../services/api.js';
import { REC_GUTTER, REC_RESPONSIVE } from '../constants/layout.js';

function resolveVideos(item) {
  if (Array.isArray(item.videos) && item.videos.length) {
    return item.videos.filter((v) => v && v.url);
  }
  if (item.video && item.video.url) return [item.video];
  return [];
}

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
  const [localContent, setLocalContent] = useState(item.content || '');
  const [localImages, setLocalImages] = useState(item.images || []);
  const [localVideos, setLocalVideos] = useState(() => resolveVideos(item));
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);

  useEffect(() => {
    setLocalTags(item.tags || []);
    setLocalCategory(item.category || null);
    setLocalContent(item.content || '');
    setLocalImages(Array.isArray(item.images) ? item.images : []);
    setLocalVideos(resolveVideos(item));
    setActiveVideoIdx(0);
  }, [item]);

  const activeVideo = localVideos[activeVideoIdx] || null;
  const hasVideo = !!(activeVideo && activeVideo.url);
  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites]);
  const sourceName = useMemo(
    () => resolveSiteName(item.siteUrl, siteNameMap),
    [item.siteUrl, siteNameMap]
  );

  const contentParagraphs = useMemo(() => {
    const raw = (localContent || '').trim();
    if (!raw) return [];
    return raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  }, [localContent]);

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

  const handleTags = (newTags, newCategory, _datePublished, extra) => {
    if (newTags && newTags.length) setLocalTags(newTags);
    if (newCategory) setLocalCategory(newCategory);
    if (extra && typeof extra.content === 'string' && extra.content) {
      setLocalContent(extra.content);
    }
    if (extra && Array.isArray(extra.images) && extra.images.length) {
      setLocalImages(extra.images);
    }
    if (extra && Array.isArray(extra.videos) && extra.videos.length) {
      const next = extra.videos.filter((v) => v && v.url);
      if (next.length) {
        setLocalVideos(next);
        setActiveVideoIdx((i) => Math.min(i, next.length - 1));
      }
    }
  };

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-3">
        <Button
          size="middle"
          onClick={onBack}
          icon={<ArrowLeftOutlined style={{ fontSize: 14 }} />}
          className="!inline-flex !items-center !font-semibold !bg-ph-elevated/90 hover:!bg-ph-panelAlt !text-ph-text-primary !border-0 shrink-0"
        >
          返回
        </Button>
        <div className="flex items-center gap-2 shrink-0">
          {item.url ? (
            <Button
              type="text"
              size="small"
              icon={<LinkOutlined />}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              title="在新标签打开原文"
              className="!inline-flex !items-center !text-ph-orange !font-medium !border-0 !bg-transparent !shadow-none hover:!text-ph-orange-light"
            >
              数据源: {sourceName}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-ph-orange font-medium">
              数据源: {sourceName}
            </span>
          )}
          <Button
            size="small"
            onClick={() => onToggleFavorite(item)}
            icon={favorited
              ? <StarFilled style={{ color: '#FF9900', fontSize: 13 }} />
              : <StarOutlined style={{ fontSize: 13 }} />}
            className={`!inline-flex !items-center !font-bold !border ${
              favorited
                ? '!bg-ph-orange/15 !text-ph-orange !border-ph-orange/35 hover:!bg-ph-orange/25'
                : '!bg-white/5 !text-ph-text-secondary !border-white/10 hover:!bg-white/10'
            }`}
          >
            {favorited ? '已收藏' : '收藏'}
          </Button>
        </div>
      </div>

      {localVideos.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {localVideos.map((v, i) => (
            <Button
              key={`${v.url}-${i}`}
              size="small"
              onClick={() => setActiveVideoIdx(i)}
              className={`!font-semibold !border ${
                i === activeVideoIdx
                  ? '!bg-ph-orange/15 !text-ph-orange !border-ph-orange/40'
                  : '!bg-white/5 !text-ph-text-secondary !border-white/10 hover:!text-ph-orange'
              }`}
            >
              {v.title ? `片段 ${i + 1}` : `视频 ${i + 1}`}
            </Button>
          ))}
        </div>
      )}

      <div className="relative z-0 w-full aspect-video rounded-none overflow-hidden border border-white/5 shadow-2xl bg-ph-header">
        {hasVideo ? (
          <VideoPlayer
            item={item}
            video={activeVideo}
            onTags={handleTags}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ph-text-muted text-sm">
            该条目暂无可播放地址
          </div>
        )}
      </div>

      <div className="surface-card p-4 sm:p-5 space-y-4">
        <h1 className="text-xl sm:text-2xl font-black italic tracking-tighter text-white leading-snug m-0">
          {item.title || `条目 ${item.id}`}
        </h1>

        {(localCategory || localTags.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {localCategory && (
              <Tag
                className="!cursor-pointer !m-0 !rounded-lg !px-2.5 !py-1 !text-xs !bg-ph-orange/15 !text-ph-orange !border-ph-orange/30"
                onClick={() => onTagClick && onTagClick(localCategory)}
              >
                {localCategory}
              </Tag>
            )}
            {localTags.map((t) => (
              <Tag
                key={t}
                className="!cursor-pointer !m-0 !rounded-lg !px-2.5 !py-1 !text-xs !bg-ph-elevated !text-ph-text-secondary !border-white/10 hover:!text-ph-orange hover:!border-ph-orange/40 transition-colors"
                onClick={() => onTagClick && onTagClick(t)}
              >
                #{t}
              </Tag>
            ))}
          </div>
        )}

        {contentParagraphs.length > 0 && (
          <div className="space-y-3 pt-1 border-t border-white/5">
            {contentParagraphs.map((p, i) => (
              <p
                key={i}
                className="m-0 text-[13px] sm:text-sm leading-relaxed text-ph-text-secondary whitespace-pre-wrap"
              >
                {p}
              </p>
            ))}
          </div>
        )}

        {localImages.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-white/5">
            {localImages.map((_, i) => (
              <a
                key={i}
                href={`/api/image/${item.id}/${i}`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded border border-white/5 bg-ph-elevated"
              >
                <img
                  src={`/api/image/${item.id}/${i}`}
                  alt={`配图 ${i + 1}`}
                  loading="lazy"
                  className="w-full h-auto object-cover block"
                />
              </a>
            ))}
          </div>
        )}
      </div>

      {similar.length > 0 && (
        <section className="space-y-4 overflow-x-hidden">
          <h2 className="section-title">相似精选推荐</h2>
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
        </section>
      )}
    </PageShell>
  );
}
