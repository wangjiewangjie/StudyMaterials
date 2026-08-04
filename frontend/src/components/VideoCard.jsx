import { useState, useCallback, memo } from 'react';
import { Card, Button, Tag } from 'antd';
import {
  StarOutlined, StarFilled, PlayCircleFilled, PictureOutlined,
} from '@ant-design/icons';
import { formatDate, hostnameOf } from '../services/api.js';

// 视频卡片：首页网格 / 收藏库 / 详情推荐共用。
// 视觉对齐设计稿：海报 + 暗角渐变 + 右上收藏心标 + 悬停播放圆钮 + 底部日期与来源。
// 移动端仅显示封面 + 标题；桌面端完整展示标签、日期、来源。
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

  // 来源标签：优先外部传入 siteName，其次主机名首段
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
      className="group overflow-hidden !bg-[#121212] !border-white/5 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-[4px] hover:!border-[#FF9900]/40 hover:shadow-[0_16px_36px_-10px_rgba(0,0,0,.9),0_0_20px_rgba(255,153,0,.15)] focus-visible:!border-[#FF9900] focus-visible:outline-none rise-in card-scale"
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
      styles={{ body: { padding: 0 } }}
      onClick={handleClick}
      onKeyDown={handleKey}
    >
      <div className="relative w-full overflow-hidden bg-[#1A1A1A]" style={{ aspectRatio: '16/9' }}>
        {thumb && imgOk ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover block transition-transform duration-[500ms] ease-out group-hover:scale-105"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a]">
            <PictureOutlined style={{ fontSize: 30 }} />
          </div>
        )}

        {/* 暗角渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* 收藏心标按钮 */}
        <Button
          shape="circle"
          type="text"
          size="small"
          title={favorited ? '取消收藏' : '加入收藏'}
          aria-label={favorited ? '取消收藏' : '加入收藏'}
          onClick={handleFav}
          icon={favorited
            ? <StarFilled style={{ color: '#ef4444' }} />
            : <StarOutlined style={{ color: '#fff' }} />}
          className={`!absolute !top-2.5 !right-2.5 !z-[2] !w-8 !h-8 !backdrop-blur-md !flex !items-center !justify-center !text-base ${
            favorited
              ? '!bg-red-500/20 !text-red-500 !border !border-red-500/40'
              : '!bg-black/60 !text-gray-300 hover:!text-[#FF9900] hover:!bg-black/80 !border !border-white/10'
          }`}
        />

        {/* 悬停播放圆钮（桌面端） */}
        {hasVideo && (
          <span className="card-play absolute inset-0 z-[1] hidden md:flex items-center justify-center pointer-events-none">
            <span className="w-12 h-12 rounded-lg border-2 border-white/90 text-[#FF9900] flex items-center justify-center text-[30px] shadow-[0_4px_20px_rgba(0,0,0,.6)] backdrop-blur-sm bg-black/60">
              <PlayCircleFilled />
            </span>
          </span>
        )}
      </div>

      <div className="p-2.5 sm:p-3.5 flex flex-col justify-between flex-grow">
        <div className="line-clamp-2 text-[13px] leading-[1.5] text-white font-semibold min-h-[39px] group-hover:text-[#FF9900] transition-colors">
          {item.title || `条目 ${item.id}`}
        </div>
        {/* 桌面端：标签 + 日期 + 来源 */}
        <div className="hidden md:block">
          <div className="flex flex-wrap items-center gap-1.5 mt-2 mb-2.5">
            {item.category && (
              <Tag className="!m-0 !text-[10px] !uppercase !font-bold !tracking-wider !bg-white/5 !text-gray-400 !border-white/5 !rounded-lg">
                {item.category}
              </Tag>
            )}
            {(item.tags || []).slice(0, 2).map((t) => (
              <Tag key={t} className="!m-0 !text-[10px] !bg-black/40 !text-gray-500 !border-white/5 !rounded-lg">
                #{t}
              </Tag>
            ))}
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400">
            <span className="tabular-nums">{item.datePublished ? formatDate(item.datePublished) : '—'}</span>
            {showFavBadge ? (
              <Tag color="red" className="!m-0 !text-[10px] !font-bold !rounded-lg">已收藏</Tag>
            ) : (
              <span className="text-gray-500 text-[10px] truncate max-w-[120px]">{sourceLabel}</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

const VideoCard = memo(VideoCardBase);
export default VideoCard;
