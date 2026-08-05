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

  useEffect(() => {
    setLocalTags(item.tags || []);
    setLocalCategory(item.category || null);
  }, [item]);

  const hasVideo = !!(item.video && item.video.url);
  const siteNameMap = useMemo(() => buildSiteNameMap(sites), [sites]);
  const sourceName = useMemo(
    () => resolveSiteName(item.siteUrl, siteNameMap),
    [item.siteUrl, siteNameMap]
  );

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

  const handleTags = (newTags, newCategory) => {
    if (newTags && newTags.length) setLocalTags(newTags);
    if (newCategory) setLocalCategory(newCategory);
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
          返回浏览列表
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

      <div className="relative z-0 w-full aspect-video rounded-none overflow-hidden border border-white/5 shadow-2xl bg-ph-header">
        {hasVideo ? (
          <VideoPlayer item={item} onTags={handleTags} />
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
