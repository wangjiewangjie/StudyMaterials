import { useState, useCallback, memo, useRef } from 'react';
import { Tag } from 'antd';
import {
  StarOutlined, StarFilled, PlayCircleFilled, PictureOutlined, LoadingOutlined,
} from '@ant-design/icons';
import { formatDate } from '../utils/format.js';
import { hostnameOf } from '../utils/sites.js';
import { loadWatchProgress } from '../utils/watch-progress.js';

function VideoCardBase({
  item, onClick, isFavorited, isFavPending = false, onToggleFavorite, index = 0, showFavBadge = false, siteName,
}) {
  const thumb = item.coverUrl ? `/api/cover/${item.id}` : '';
  const hasVideo = !!(item.video && item.video.url);
  const [imgOk, setImgOk] = useState(!!thumb);
  const watch = loadWatchProgress(item.id);
  const progressPct = watch.percent;
  // 入场动画只在首次挂载时播一次；同步刷新改 index 时不再重播，避免列表「闪回顶部」
  const enterDelayRef = useRef(`${Math.min(index, 12) * 28}ms`);

  const handleClick = useCallback(() => onClick(item), [item, onClick]);
  const handleFav = useCallback((e) => {
    e.stopPropagation();
    if (isFavPending) return;
    onToggleFavorite?.(item);
  }, [item, onToggleFavorite, isFavPending]);
  const handleKey = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(item);
    }
  }, [item, onClick]);

  const sourceLabel = siteName
    || (item.siteUrl ? (hostnameOf(item.siteUrl) || '未知来源') : '未知来源');

  let favIcon = <StarOutlined style={{ fontSize: 18 }} />;
  if (isFavPending) favIcon = <LoadingOutlined style={{ fontSize: 18 }} spin />;
  else if (isFavorited) favIcon = <StarFilled style={{ fontSize: 18 }} />;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${item.title || `条目 ${item.id}`}${hasVideo ? '，可播放' : '，无法播放'}`}
      className="video-card group overflow-hidden rounded bg-ph-card border border-white/5 cursor-pointer focus-visible:border-ph-orange focus-visible:outline-none rise-in card-scale hover:border-white/15 transition-colors"
      style={{ animationDelay: enterDelayRef.current }}
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
          disabled={isFavPending}
          title={isFavorited ? '取消收藏' : '加入收藏'}
          aria-label={isFavorited ? '取消收藏' : '加入收藏'}
          aria-busy={isFavPending}
          onClick={handleFav}
          className={`fav-icon-btn absolute top-2 right-2 z-[2] p-0 m-0 border-0 bg-transparent leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,.8)] ${
            isFavPending ? 'opacity-50 cursor-wait' : 'cursor-pointer'
          } ${isFavorited ? 'text-ph-orange' : 'text-white/90 hover:text-ph-orange'}`}
        >
          {favIcon}
        </button>

        {hasVideo && (
          <span className="card-play absolute inset-0 z-[1] hidden md:flex items-center justify-center pointer-events-none text-ph-orange text-[42px] drop-shadow-[0_2px_8px_rgba(0,0,0,.65)]">
            <PlayCircleFilled />
          </span>
        )}

        {progressPct > 0 && (
          <div
            className="absolute left-0 right-0 bottom-0 z-[3] h-1 bg-black/50 pointer-events-none"
            title={watch.duration > 0 ? `已观看 ${progressPct}%` : '继续观看'}
            aria-hidden
          >
            <div
              className="h-full bg-ph-orange shadow-[0_0_6px_rgba(255,153,0,.55)]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
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
    </div>
  );
}

const VideoCard = memo(VideoCardBase);
export default VideoCard;
