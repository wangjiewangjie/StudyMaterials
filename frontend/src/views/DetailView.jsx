import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Button, Tag, Row, Col, Spin } from 'antd';
import {
  ArrowLeftOutlined, StarFilled, StarOutlined, LinkOutlined,
} from '@ant-design/icons';
import VideoCard from '../components/VideoCard.jsx';
import PageShell from '../components/PageShell.jsx';
import { resolveSiteName } from '../utils/sites.js';
import { REC_GUTTER, REC_RESPONSIVE } from '../constants/layout.js';
import { SIMILAR_LIMIT } from '../constants/timing.js';

// 播放器含 artplayer + hls.js（~700KB），仅详情页挂载时再加载
const VideoPlayer = lazy(() => import('../VideoPlayer.jsx'));

function PlayerFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-ph-header">
      <Spin size="large" />
    </div>
  );
}

function resolveVideos(item) {
  if (Array.isArray(item.videos) && item.videos.length) {
    return item.videos.filter((v) => v && v.url);
  }
  if (item.video && item.video.url) return [item.video];
  return [];
}

/** 无 blocks 时，用 content + images 拼出兼容结构 */
function fallbackBlocks(content, images) {
  const blocks = [];
  const raw = (content || '').trim();
  if (raw) {
    raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).forEach((text) => {
      blocks.push({ type: 'text', text });
    });
  }
  (images || []).forEach((_, index) => {
    blocks.push({ type: 'image', index });
  });
  return blocks;
}

function ThumbImage({ itemId, index }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const wasOpenRef = useRef(false);
  const src = `/api/image/${itemId}/${index}`;

  // 打开时聚焦关闭按钮；关闭时归还焦点到缩略图（仅在曾经打开过时）
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      closeRef.current?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  // 捕获阶段拦截 Esc：只关闭查看器，不触发页面级 Esc 返回
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setIsOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="block w-full overflow-hidden rounded border border-white/5 bg-ph-elevated detail-thumb-wrap p-0 m-0 cursor-zoom-in relative"
        aria-label={`放大查看配图 ${index + 1}`}
        onClick={() => setIsOpen(true)}
      >
        {!isLoaded && <div className="absolute inset-0 skel" aria-hidden />}
        <img
          src={src}
          alt={`配图 ${index + 1}`}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          className={`object-cover w-full h-full detail-thumb transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 z-[1000] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setIsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`配图 ${index + 1} 预览`}
        >
          <button
            ref={closeRef}
            type="button"
            className="img-viewer-close"
            aria-label="关闭预览"
            onClick={() => setIsOpen(false)}
          >
            ×
          </button>
          <img src={src} alt={`配图 ${index + 1}`} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </>
  );
}

function tagKeyDown(e, onTagClick, tag) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  onTagClick?.(tag);
}

function MetaHeader({ item, localCategory, localTags, onTagClick }) {
  return (
    <>
      <h1 className="text-xl sm:text-2xl font-black italic tracking-tighter text-white leading-snug m-0">
        {item.title || `条目 ${item.id}`}
      </h1>
      {(localCategory || localTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {localCategory && (
            <Tag
              role="button"
              tabIndex={0}
              className="!cursor-pointer !m-0 !rounded-lg !px-2.5 !py-1 !text-xs !bg-ph-orange/15 !text-ph-orange !border-ph-orange/30"
              onClick={() => onTagClick && onTagClick(localCategory)}
              onKeyDown={(e) => tagKeyDown(e, onTagClick, localCategory)}
            >
              {localCategory}
            </Tag>
          )}
          {localTags.map((t) => (
            <Tag
              key={t}
              role="button"
              tabIndex={0}
              className="!cursor-pointer !m-0 !rounded-lg !px-2.5 !py-1 !text-xs !bg-ph-elevated !text-ph-text-secondary !border-white/10 hover:!text-ph-orange hover:!border-ph-orange/40 transition-colors"
              onClick={() => onTagClick && onTagClick(t)}
              onKeyDown={(e) => tagKeyDown(e, onTagClick, t)}
            >
              #{t}
            </Tag>
          ))}
        </div>
      )}
    </>
  );
}

export default function DetailView({
  item,
  items,
  siteNameMap,
  favIds,
  pendingFavIds,
  isFavorited,
  onToggleFavorite,
  onBack,
  onCardClick,
  onTagClick,
}) {
  const [localTags, setLocalTags] = useState(item.tags || []);
  const [localCategory, setLocalCategory] = useState(item.category || null);
  const [localContent, setLocalContent] = useState(item.content || '');
  const [localImages, setLocalImages] = useState(item.images || []);
  const [localBlocks, setLocalBlocks] = useState(() => (
    Array.isArray(item.blocks) && item.blocks.length
      ? item.blocks
      : fallbackBlocks(item.content, item.images)
  ));
  const [localVideos, setLocalVideos] = useState(() => resolveVideos(item));

  useEffect(() => {
    setLocalTags(item.tags || []);
    setLocalCategory(item.category || null);
    setLocalContent(item.content || '');
    setLocalImages(Array.isArray(item.images) ? item.images : []);
    setLocalBlocks(
      Array.isArray(item.blocks) && item.blocks.length
        ? item.blocks
        : fallbackBlocks(item.content, item.images)
    );
    setLocalVideos(resolveVideos(item));
  }, [item]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onBack?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const sourceName = useMemo(
    () => resolveSiteName(item.siteUrl, siteNameMap),
    [item.siteUrl, siteNameMap]
  );

  const isMulti = localVideos.length > 1;
  const primaryVideo = localVideos[0] || null;

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
      if (out.length >= SIMILAR_LIMIT) break;
    }
    return out;
  }, [items, item.id, localCategory, localTags]);

  const handleTags = (newTags, newCategory, _datePublished, extra) => {
    if (newTags?.length) setLocalTags(newTags);
    if (newCategory) setLocalCategory(newCategory);
    if (typeof extra?.content === 'string' && extra.content) {
      setLocalContent(extra.content);
    }
    if (Array.isArray(extra?.images) && extra.images.length) {
      setLocalImages(extra.images);
    }
    if (Array.isArray(extra?.blocks) && extra.blocks.length) {
      setLocalBlocks(extra.blocks);
    } else if (extra?.content || extra?.images) {
      setLocalBlocks(fallbackBlocks(
        extra.content || localContent,
        extra.images || localImages,
      ));
    }
    // 仅在视频地址确实变更时更新，避免播放器因 props 抖动重挂载
    if (!Array.isArray(extra?.videos) || !extra.videos.length) return;
    const next = extra.videos.filter((v) => v?.url);
    if (!next.length) return;
    const oldUrls = localVideos.map((v) => v.url).join('\n');
    const newUrls = next.map((v) => v.url).join('\n');
    if (oldUrls !== newUrls) setLocalVideos(next);
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
            disabled={pendingFavIds?.has(item.id)}
            onClick={() => onToggleFavorite(item)}
            icon={isFavorited
              ? <StarFilled style={{ color: '#FF9900', fontSize: 13 }} />
              : <StarOutlined style={{ fontSize: 13 }} />}
            className={`!inline-flex !items-center !font-bold !border ${
              isFavorited
                ? '!bg-ph-orange/15 !text-ph-orange !border-ph-orange/35 hover:!bg-ph-orange/25'
                : '!bg-white/5 !text-ph-text-secondary !border-white/10 hover:!bg-white/10'
            }`}
          >
            {pendingFavIds?.has(item.id) ? '处理中…' : null}
            {!pendingFavIds?.has(item.id) && (isFavorited ? '已收藏' : '收藏')}
          </Button>
        </div>
      </div>

      <>
        {!isMulti ? (
          <>
            <div className="relative z-0 w-full aspect-video rounded-none overflow-hidden border border-white/5 shadow-2xl bg-ph-header">
              {primaryVideo ? (
                <Suspense fallback={<PlayerFallback />}>
                  <VideoPlayer item={item} video={primaryVideo} onTags={handleTags} />
                </Suspense>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ph-text-muted text-sm">
                  该条目暂无可播放地址
                </div>
              )}
            </div>

            <div className="surface-card p-4 sm:p-5 space-y-4">
              <MetaHeader
                item={item}
                localCategory={localCategory}
                localTags={localTags}
                onTagClick={onTagClick}
              />

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
                <div className="detail-thumb-grid pt-1 border-t border-white/5">
                  {localImages.map((_, i) => (
                    <ThumbImage key={i} itemId={item.id} index={i} />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 多视频：按源站顺序交错排版 文案 / 图 / 播放器 */}
            <div className="surface-card p-4 sm:p-5 space-y-4">
              <MetaHeader
                item={item}
                localCategory={localCategory}
                localTags={localTags}
                onTagClick={onTagClick}
              />
            </div>

            <div className="space-y-4">
              {localBlocks.map((block, i) => {
                if (block.type === 'text') {
                  return (
                    <p
                      key={`t-${i}`}
                      className="m-0 px-0.5 text-[13px] sm:text-sm leading-relaxed text-ph-text-secondary whitespace-pre-wrap"
                    >
                      {block.text}
                    </p>
                  );
                }
                if (block.type === 'image' && typeof block.index === 'number') {
                  return (
                    <div key={`i-${i}`} className="detail-thumb-inline">
                      <ThumbImage itemId={item.id} index={block.index} />
                    </div>
                  );
                }
                if (block.type === 'video' && typeof block.index === 'number') {
                  const v = localVideos[block.index];
                  if (!v || !v.url) return null;
                  return (
                    <div
                      key={`v-${i}-${block.index}`}
                      className="relative z-0 w-full overflow-hidden border border-white/5 bg-ph-header shadow-xl"
                    >
                      {v.title ? (
                        <div className="px-3 py-2 text-xs font-bold text-ph-text-secondary border-b border-white/5 bg-ph-elevated/80">
                          {v.title}
                        </div>
                      ) : null}
                      <Suspense fallback={<PlayerFallback />}>
                        <VideoPlayer
                          item={item}
                          video={v}
                          onTags={block.index === 0 ? handleTags : undefined}
                          defer={block.index > 0}
                          autoplay={block.index === 0}
                        />
                      </Suspense>
                    </div>
                  );
                }
                return null;
              })}

              {!localBlocks.some((b) => b.type === 'video') && localVideos.map((v, idx) => (
                <div
                  key={`fallback-v-${idx}`}
                  className="relative z-0 w-full overflow-hidden border border-white/5 bg-ph-header shadow-xl"
                >
                  <Suspense fallback={<PlayerFallback />}>
                    <VideoPlayer
                      item={item}
                      video={v}
                      onTags={idx === 0 ? handleTags : undefined}
                      defer={idx > 0}
                      autoplay={idx === 0}
                    />
                  </Suspense>
                </div>
              ))}
            </div>
          </>
        )}
      </>

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
                  isFavorited={favIds.has(it.id)}
                  isFavPending={pendingFavIds?.has(it.id)}
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
