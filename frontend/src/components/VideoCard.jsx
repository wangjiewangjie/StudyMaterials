import { useState, useCallback, memo } from 'react';
import { Card, Tag } from 'antd';
import {
  StarOutlined, StarFilled, PlayCircleFilled, PictureOutlined,
} from '@ant-design/icons';
import { formatDate, hostnameOf } from '../services/api.js';

function VideoCardBase({ item, onClick, favorited, onToggleFavorite, index = 0, showFavBadge = false, siteName }) {
  const thumb = item.coverUrl ? `/api/cover/${item.id}` : '';
  const hasVideo = !!(item.video && item.video.url);
  const [imgOk, setImgOk] = useState(!!thumb);

  const handleClick = useCallback(() => onClick(item), [item, onClick]);
  const handleFav = useCallback((e) => {
    e.stopPropagation();
    if (onToggleFavorite) onToggleFavorite(item);
  }, [item, onToggleFavorite]);
  const handleKey = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(item);
    }
  }, [item, onClick]);

  const sourceLabel = siteName || (() => {
    if (!item.siteUrl) return '未知来源';
    const host = hostnameOf(item.siteUrl);
    return host || '未知来源';
  })();

  return (
    <Card
      hoverable
      size="small"
      role="button"
      tabIndex={0}
      aria-label={(item.title || `条目 ${item.id}`) + (hasVideo ? '，可播放' : '，无法播放')}
      className="video-card group overflow-hidden !rounded !bg-ph-card !border-white/5 focus-visible:!border-ph-orange focus-visible:outline-none rise-in card-scale"
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
      styles={{ body: { padding: 0 } }}
      onClick={handleClick}
      onKeyDown={handleKey}
    >
      <div className="relative w-full overflow-hidden bg-ph-elevated" style={{ aspectRatio: '16/9' }}>
        {thumb && imgOk ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover block transition-transform duration-500 ease-out group-hover:scale-105"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-ph-text-muted bg-gradient-to-br from-ph-elevated to-ph-panelAlt">
            <PictureOutlined style={{ fontSize: 30 }} />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent opacity-55 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        <button
          type="button"
          title={favorited ? '取消收藏' : '加入收藏'}
          aria-label={favorited ? '取消收藏' : '加入收藏'}
          onClick={handleFav}
          className={`fav-icon-btn absolute top-2 right-2 z-[2] p-0 m-0 border-0 bg-transparent leading-none cursor-pointer drop-shadow-[0_1px_2px_rgba(0,0,0,.8)] ${
            favorited ? 'text-ph-orange' : 'text-white/90 hover:text-ph-orange'
          }`}
        >
          {favorited
            ? <StarFilled style={{ fontSize: 18 }} />
            : <StarOutlined style={{ fontSize: 18 }} />}
        </button>

        {hasVideo && (
          <span className="card-play absolute inset-0 z-[1] hidden md:flex items-center justify-center pointer-events-none text-ph-orange text-[42px] drop-shadow-[0_2px_8px_rgba(0,0,0,.65)]">
            <PlayCircleFilled />
          </span>
        )}
      </div>

      <div className="p-2.5 sm:p-3.5 flex flex-col justify-between flex-grow">
        <div className="line-clamp-2 text-[13px] leading-[1.5] text-white font-semibold min-h-[39px] group-hover:text-ph-orange transition-colors">
          {item.title || `条目 ${item.id}`}
        </div>
        <div className="hidden md:block">
          <div className="flex flex-wrap items-center gap-1.5 mt-2 mb-2.5">
            {item.category && (
              <Tag className="!m-0 !text-[10px] !uppercase !font-bold !tracking-wider !bg-white/5 !text-ph-text-tertiary !border-white/5 !rounded-lg">
                {item.category}
              </Tag>
            )}
            {(item.tags || []).slice(0, 2).map((t) => (
              <Tag key={t} className="!m-0 !text-[10px] !bg-black/40 !text-ph-text-muted !border-white/5 !rounded-lg">
                #{t}
              </Tag>
            ))}
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-ph-text-tertiary">
            <span className="tabular-nums">{item.datePublished ? formatDate(item.datePublished) : '—'}</span>
            {showFavBadge ? (
              <Tag className="!m-0 !text-[10px] !font-bold !rounded-lg !bg-ph-orange/20 !text-ph-orange !border-ph-orange/40">已收藏</Tag>
            ) : (
              <span className="text-ph-text-muted text-[10px] truncate max-w-[120px]">{sourceLabel}</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

const VideoCard = memo(VideoCardBase);
export default VideoCard;
