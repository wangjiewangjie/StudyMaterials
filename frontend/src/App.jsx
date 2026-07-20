import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  Layout, Input, Button, Card, Tag, Modal, Empty, Spin, Typography,
  Space, Popover, InputNumber, Pagination, App as AntdApp, Tooltip, Dropdown,
} from 'antd';
import {
  SearchOutlined, SyncOutlined, LinkOutlined,
  VideoCameraOutlined, InboxOutlined, GlobalOutlined,
  CalendarOutlined, ClearOutlined, ReloadOutlined,
  StarOutlined, StarFilled, DownloadOutlined,
} from '@ant-design/icons';
import VideoPlayer from './VideoPlayer.jsx';

const { Header, Content } = Layout;
const { Text } = Typography;

const SITE_NAMES = {
  'bite.ygvttlxzy.cc': '91吃瓜',
  'd1ve8vvwughzqa.cloudfront.net': '91视频',
  'breast.eiejvjgex.cc': '51fans',
  'assert.pbtiodqn.cc': '51爆料',
};

function siteLabel(siteUrl) {
  if (!siteUrl) return '未知来源';
  try {
    const host = new URL(siteUrl).hostname;
    return SITE_NAMES[host] || host.split('.')[0];
  } catch (_) {
    return String(siteUrl);
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

const VideoCard = memo(function VideoCard({ item, onClick, favorited, onToggleFavorite }) {
  const thumb = item.coverUrl ? `/api/cover/${item.id}` : '';
  const hasVideo = !!(item.video && item.video.url);
  const handleClick = useCallback(() => onClick(item), [item, onClick]);
  const handleFav = useCallback((e) => {
    e.stopPropagation();
    onToggleFavorite && onToggleFavorite(item);
  }, [item, onToggleFavorite]);
  return (
    <Card
      hoverable
      size="small"
      className="group overflow-hidden !bg-ph-card !border-ph-border transition-transform duration-150 hover:-translate-y-[3px] hover:!border-ph-orange"
      styles={{ body: { padding: 0 } }}
      onClick={handleClick}
    >
      <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
        {thumb && (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover block transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {!thumb && (
          <div className="absolute inset-0 flex items-center justify-center text-ph-text-tertiary">
            <VideoCameraOutlined style={{ fontSize: 32 }} />
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 bg-ph-orange/95 text-black text-[11px] font-bold px-1.5 py-0.5 rounded-sm flex items-center gap-1">
          <GlobalOutlined />
          {siteLabel(item.siteUrl)}
        </span>
        <button
          type="button"
          title={favorited ? '取消收藏' : '加入收藏'}
          onClick={handleFav}
          className="absolute top-1.5 right-1.5 z-[2] w-7 h-7 rounded-sm bg-black/70 hover:bg-black/90 border-0 cursor-pointer flex items-center justify-center text-base"
        >
          {favorited
            ? <StarFilled style={{ color: '#ff9000' }} />
            : <StarOutlined style={{ color: '#fff' }} />}
        </button>
        {hasVideo ? (
          <span className="absolute bottom-1.5 right-1.5 bg-black/85 text-white text-[13px] font-bold px-1.5 py-0.5 rounded-sm">
            <VideoCameraOutlined />
          </span>
        ) : (
          <span className="absolute bottom-1.5 right-1.5 bg-zinc-700/85 text-zinc-300 text-[11px] font-bold px-1.5 py-0.5 rounded-sm">
            无法播放
          </span>
        )}
      </div>
      <div className="p-2">
        <div className="line-clamp-2 text-[13px] leading-[1.4] text-ph-text-primary font-semibold min-h-[36px]">
          {item.title || `条目 ${item.id}`}
        </div>
        <div className="flex gap-2 items-center text-[11px] text-ph-text-muted mt-1.5 flex-wrap">
          {item.category && <span className="text-ph-orange font-semibold">{item.category}</span>}
          {item.datePublished && (
            <span className="inline-flex items-center gap-0.5">
              <CalendarOutlined />
              {formatDate(item.datePublished)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
});

function PlayerModal({ item, onClose, onTagClick, favorited, onToggleFavorite }) {
  const [tags, setTags] = useState(item.tags || []);
  const [category, setCategory] = useState(item.category || null);
  const [datePublished, setDatePublished] = useState(item.datePublished || null);

  useEffect(() => {
    setTags(item.tags || []);
    setCategory(item.category || null);
    setDatePublished(item.datePublished || null);
  }, [item]);

  const handleTags = useCallback((newTags, newCategory, newDate) => {
    if (newTags && newTags.length) setTags(newTags);
    if (newCategory) setCategory(newCategory);
    if (newDate) setDatePublished(newDate);
  }, []);

  const hasVideo = !!(item.video && item.video.url);
  return (
    <Modal
      open={!!item}
      onCancel={onClose}
      footer={null}
      width={1000}
      destroyOnClose
      title={item.title || `条目 ${item.id}`}
      className="player-modal"
    >
      {hasVideo ? (
        <VideoPlayer item={item} onTags={handleTags} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
          <InboxOutlined style={{ fontSize: 48, color: '#555' }} />
          <Text className="!text-ph-text-primary text-base">暂时无法播放</Text>
          <Text type="secondary" className="text-xs max-w-sm">
            来源「{siteLabel(item.siteUrl)}」可能未提供可用地址，可打开原文查看。
          </Text>
        </div>
      )}
      <div className="px-[18px] pb-4 pt-3.5">
        {(datePublished || item.siteUrl) && (
          <div className="flex gap-4 items-center text-[12px] text-ph-text-muted mb-2.5 flex-wrap">
            {datePublished && (
              <span className="inline-flex items-center gap-1">
                <CalendarOutlined />
                {formatDate(datePublished)}
              </span>
            )}
            {item.siteUrl && (
              <span className="inline-flex items-center gap-1">
                <GlobalOutlined />
                {siteLabel(item.siteUrl)}
              </span>
            )}
          </div>
        )}
        {(category || tags.length > 0) && (
          <div className="mb-1">
            <Text type="secondary" className="text-[11px] block mb-1.5">点击标签可搜索相关内容</Text>
            <Space size={[6, 6]} wrap>
              {category && (
                <Tooltip title={`搜索「${category}」`}>
                  <Tag color="orange" className="cursor-pointer" onClick={() => onTagClick && onTagClick(category)}>
                    {category}
                  </Tag>
                </Tooltip>
              )}
              {tags.map((t) => (
                <Tooltip key={t} title={`搜索「${t}」`}>
                  <Tag className="cursor-pointer" onClick={() => onTagClick && onTagClick(t)}>
                    {t}
                  </Tag>
                </Tooltip>
              ))}
            </Space>
          </div>
        )}
        <div className="flex gap-2 flex-wrap mt-3">
          <Button
            size="small"
            icon={favorited ? <StarFilled /> : <StarOutlined />}
            type={favorited ? 'primary' : 'default'}
            onClick={() => onToggleFavorite && onToggleFavorite(item)}
          >
            {favorited ? '已收藏' : '收藏'}
          </Button>
          {item.url && (
            <Button size="small" icon={<LinkOutlined />} href={item.url} target="_blank" rel="noreferrer">
              打开原文
            </Button>
          )}
          {hasVideo && (
            <Tooltip title="复制到下载工具中使用">
              <Button size="small" icon={<VideoCameraOutlined />} href={item.video.url} target="_blank" rel="noreferrer">
                视频地址
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Unified sync panel: own keyword field (independent from local search). */
function SyncPanel({ onSync, syncing, logs, status, open: openProp, onOpenChange, initialKeyword }) {
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(1);
  const [keyword, setKeyword] = useState(initialKeyword || '');
  const [openLocal, setOpenLocal] = useState(false);
  const logRef = useRef(null);
  const progressLogRef = useRef(null);

  const open = openProp !== undefined ? openProp : openLocal;
  const setOpen = onOpenChange || setOpenLocal;

  const kw = keyword.trim();
  const isSearch = !!kw;

  useEffect(() => {
    if (open && initialKeyword) setKeyword(initialKeyword);
  }, [open, initialKeyword]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (progressLogRef.current) progressLogRef.current.scrollTop = progressLogRef.current.scrollHeight;
  }, [logs, syncing]);

  const start = () => {
    const a = Math.min(pageStart, pageEnd);
    const b = Math.max(pageStart, pageEnd);
    if (a !== pageStart || b !== pageEnd) {
      setPageStart(a);
      setPageEnd(b);
    }
    onSync({
      keyword: kw || null,
      pageStart: a,
      pageEnd: b,
      pages: isSearch ? (b - a + 1) : undefined,
    });
  };

  const formContent = (
    <div className="w-[340px]">
      <Text type="secondary" className="text-[12px] block mb-3 leading-relaxed">
        {isSearch
          ? `将按关键词「${kw}」在各站点搜索并同步到本地。`
          : '未填关键词时，抓取各站「今日」与列表页，刷新本地资料库。'}
        <span className="block mt-1.5 opacity-80">开始后可继续浏览与本地搜索；请勿刷新页面。</span>
      </Text>
      <div className="mb-3">
        <Text type="secondary" className="text-[12px] block mb-1">同步关键词（选填，与本地搜索独立）</Text>
        <Input
          size="small"
          allowClear
          placeholder="填写则全网搜索同步，留空则抓最新列表"
          value={keyword}
          disabled={syncing}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={start}
        />
      </div>
      <div className="flex items-center gap-2 mb-3">
        <Text type="secondary" className="whitespace-nowrap">
          {isSearch ? '搜索页数' : '列表页码'}
        </Text>
        {isSearch ? (
          <InputNumber
            size="small"
            min={1}
            max={10}
            value={pageEnd - pageStart + 1}
            disabled={syncing}
            onChange={(v) => {
              const n = Math.max(1, Math.min(10, v || 1));
              setPageStart(1);
              setPageEnd(n);
            }}
          />
        ) : (
          <>
            <InputNumber
              size="small"
              min={1}
              max={99}
              value={pageStart}
              onChange={(v) => setPageStart(v || 1)}
              disabled={syncing}
            />
            <Text type="secondary">至</Text>
            <InputNumber
              size="small"
              min={1}
              max={99}
              value={pageEnd}
              onChange={(v) => setPageEnd(v || 1)}
              disabled={syncing}
            />
          </>
        )}
      </div>
      <Button type="primary" size="small" block loading={syncing} icon={<SyncOutlined />} onClick={start}>
        {syncing ? '正在同步…' : (isSearch ? '搜索并同步' : '抓取并同步')}
      </Button>
      {logs && !syncing && (
        <pre ref={logRef} className="bg-black border border-ph-border rounded p-2 mt-3 font-mono text-[11px] max-h-[180px] overflow-auto text-ph-text-tertiary whitespace-pre-wrap leading-[1.5]">
          {logs}
        </pre>
      )}
    </div>
  );

  const progressContent = (
    <div className="w-[360px]">
      <div className="text-[12px] text-ph-orange font-semibold mb-2">
        {status || '正在同步…'} · 请勿刷新页面
      </div>
      <pre ref={progressLogRef} className="bg-black border border-ph-border rounded p-2 font-mono text-[11px] max-h-[220px] overflow-auto text-ph-text-tertiary whitespace-pre-wrap leading-[1.5] min-h-[80px]">
        {logs || '准备中…'}
      </pre>
    </div>
  );

  // While syncing: hover shows progress. Click opens form only when idle.
  if (syncing) {
    return (
      <Popover
        trigger="hover"
        placement="bottomRight"
        content={progressContent}
        title="同步进度"
        mouseEnterDelay={0.1}
      >
        <Button type="primary" size="middle" icon={<SyncOutlined />} loading>
          同步中…
        </Button>
      </Popover>
    );
  }

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      content={formContent}
      title="同步资料"
    >
      <Button type="primary" size="middle" icon={<SyncOutlined />}>
        同步资料
      </Button>
    </Popover>
  );
}

export default function App() {
  const { message } = AntdApp.useApp();
  const [items, setItems] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favIds, setFavIds] = useState(() => new Set());
  const [showFavorites, setShowFavorites] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState('');
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncPrefill, setSyncPrefill] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [activeSite, setActiveSite] = useState('');
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  const PAGE_SIZE = 60;
  const handleCardClick = useCallback((item) => setSelected(item), []);

  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch('/api/favorites');
      const data = await res.json();
      const list = data.items || [];
      setFavorites(list);
      setFavIds(new Set(data.ids || list.map((a) => a.id)));
    } catch (_) { /* ignore */ }
  }, []);

  const loadVideos = useCallback(async (q) => {
    setLoadingList(true);
    setStatus('正在加载…');
    setPage(1);
    setLastQuery(q || '');
    try {
      const url = q ? `/api/videos?q=${encodeURIComponent(q)}` : '/api/videos';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setStatus(q ? `「${q}」共 ${data.total} 条` : `共 ${data.total} 条`);
    } catch (e) {
      setStatus('加载失败');
      message.error('加载失败：' + e.message);
    } finally {
      setLoadingList(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadVideos('');
    loadFavorites();
  }, [loadVideos, loadFavorites]);

  const handleToggleFavorite = useCallback(async (item) => {
    if (!item || !item.id) return;
    const isFav = favIds.has(item.id);
    try {
      if (isFav) {
        const res = await fetch(`/api/favorites/${item.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '取消失败');
        setFavIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setFavorites((prev) => prev.filter((a) => a.id !== item.id));
        message.success('已取消收藏');
      } else {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '收藏失败');
        setFavIds((prev) => new Set(prev).add(item.id));
        if (data.item) {
          setFavorites((prev) => {
            if (prev.some((a) => a.id === item.id)) return prev;
            return [data.item, ...prev];
          });
        }
        message.success('已加入收藏（写入 favorites.json，同步不会清空）');
      }
    } catch (e) {
      message.error(e.message);
    }
  }, [favIds, message]);

  const sourceItems = showFavorites ? favorites : items;
  const tagList = useMemo(() => {
    const counts = new Map();
    sourceItems.forEach((it) => {
      if (it.category) counts.set(it.category, (counts.get(it.category) || 0) + 1);
      (it.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([t]) => t);
  }, [sourceItems]);

  const siteList = useMemo(() => {
    const counts = new Map();
    sourceItems.forEach((it) => {
      const key = it.siteUrl || null;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([site, count]) => ({ site, label: siteLabel(site), count }))
      .sort((a, b) => b.count - a.count);
  }, [sourceItems]);

  const filtered = useMemo(() => {
    let out = sourceItems;
    if (activeSite) {
      out = out.filter((it) =>
        activeSite === '__unknown__' ? !it.siteUrl : it.siteUrl === activeSite
      );
    }
    if (activeTag) {
      out = out.filter(
        (it) => it.category === activeTag || ((it.tags || []).includes(activeTag))
      );
    }
    // Local query filter when viewing favorites (index search goes through API).
    if (showFavorites && lastQuery) {
      const qlc = lastQuery.toLowerCase();
      out = out.filter(
        (it) => (it.title || '').toLowerCase().includes(qlc) || (it.id || '').includes(qlc)
      );
    }
    return out.slice().sort((a, b) => {
      if (showFavorites) {
        const fa = a.favoritedAt || '';
        const fb = b.favoritedAt || '';
        if (fa || fb) return fb.localeCompare(fa);
      }
      const da = a.datePublished || '';
      const db = b.datePublished || '';
      if (da && db) return db.localeCompare(da);
      if (da) return -1;
      if (db) return 1;
      return Number(b.id) - Number(a.id);
    });
  }, [sourceItems, activeTag, activeSite, showFavorites, lastQuery]);

  const hasFilter = !!(activeTag || activeSite);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const handleLocalSearch = () => {
    setActiveTag('');
    setActiveSite('');
    if (showFavorites) {
      setLastQuery(query.trim());
      setPage(1);
      setStatus(query.trim() ? `收藏中搜索「${query.trim()}」` : `收藏共 ${favorites.length} 条`);
      return;
    }
    loadVideos(query.trim());
  };

  const handleSync = async ({ keyword, pageStart, pageEnd, pages }) => {
    setSyncing(true);
    setSyncOpen(false);
    setActiveTag('');
    setActiveSite('');
    setPage(1);

    const isSearch = !!keyword;
    setSyncLogs(isSearch ? `开始搜索「${keyword}」…\n` : '开始抓取列表…\n');
    setStatus(isSearch
      ? `正在同步搜索「${keyword}」…`
      : (pageStart === pageEnd
        ? `正在同步第 ${pageStart} 页…`
        : `正在同步第 ${pageStart}–${pageEnd} 页…`));
    message.info({
      content: '已开始后台同步，可继续浏览；请勿刷新或关闭页面',
      duration: 4,
    });

    try {
      let data;
      if (isSearch) {
        const res = await fetch('/api/search-online', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword, pages: pages || 1 }),
        });
        data = await res.json();
      } else {
        const res = await fetch('/api/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageStart, pageEnd }),
        });
        data = await res.json();
      }

      if (data.error) {
        setSyncLogs((p) => p + '失败：' + data.error + '\n');
        message.error('同步失败：' + data.error);
        setStatus('同步失败');
        return;
      }

      const logTail = (data.logs || []).join('\n');
      if (isSearch) {
        setItems(data.items || []);
        setShowFavorites(false);
        setLastQuery(keyword);
        const matched = data.matched ?? (data.items || []).length;
        setSyncLogs(logTail + `\n完成：匹配 ${matched} 条，库内共 ${data.total} 条\n`);
        setStatus(`找到 ${matched} 条`);
        message.success(matched > 0 ? `同步完成，找到 ${matched} 条` : '同步完成，未找到匹配内容');
      } else {
        setSyncLogs(logTail + `\n完成：新增 ${data.added} 条，更新 ${data.updated || 0} 条，库内共 ${data.total} 条\n`);
        setStatus(`已合并，共 ${data.total} 条（+${data.added}）`);
        message.success(`同步完成：新增 ${data.added} 条，库内共 ${data.total} 条`);
        // Refresh local list without touching the local search box.
        loadVideos(query.trim());
      }
    } catch (e) {
      setSyncLogs((p) => p + '请求失败：' + e.message + '\n');
      message.error('网络异常：' + e.message);
      setStatus('同步失败');
    } finally {
      setSyncing(false);
    }
  };

  // Block tab close / refresh while sync is in flight.
  useEffect(() => {
    if (!syncing) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '同步尚未完成，离开页面会中断任务。确定要离开吗？';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [syncing]);

  const openSyncWithQuery = useCallback(() => {
    setSyncPrefill(query.trim() || lastQuery || '');
    setSyncOpen(true);
  }, [query, lastQuery]);

  const handleClose = useCallback(() => setSelected(null), []);

  const handleTagClick = useCallback((tag) => {
    setQuery(tag);
    setSelected(null);
    setActiveTag('');
    setActiveSite('');
    message.info(`正在搜索「${tag}」`);
    setTimeout(() => loadVideos(tag), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadVideos]);

  const handleFilterTag = useCallback((tag) => {
    setActiveTag((cur) => (cur === tag ? '' : tag));
    setPage(1);
  }, []);

  const handleFilterSite = useCallback((key) => {
    setActiveSite((cur) => (cur === key ? '' : key));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setActiveTag('');
    setActiveSite('');
    setPage(1);
  }, []);

  const resetHome = useCallback(() => {
    setQuery('');
    setActiveTag('');
    setActiveSite('');
    setSelected(null);
    setShowFavorites(false);
    setLastQuery('');
    loadVideos('');
  }, [loadVideos]);

  const toggleFavoritesView = useCallback(() => {
    setShowFavorites((v) => {
      const next = !v;
      setActiveTag('');
      setActiveSite('');
      setPage(1);
      setQuery('');
      setLastQuery('');
      setStatus(next ? `收藏共 ${favorites.length} 条` : '');
      if (!next) loadVideos('');
      return next;
    });
  }, [favorites.length, loadVideos]);

  const emptyDescription = (() => {
    if (loadingList) return '正在加载…';
    if (showFavorites) {
      if (favorites.length === 0) return '还没有收藏。在卡片右上角点星星，可写入 favorites.json，同步资料不会清空。';
      if (hasFilter || lastQuery) return '当前筛选下没有收藏，试试清除筛选。';
      return '没有收藏。';
    }
    if (hasFilter) {
      return (
        <span>
          当前筛选没有结果
          {activeTag && <>（标签：{activeTag}）</>}
          {activeSite && <>（来源：{siteLabel(activeSite === '__unknown__' ? null : activeSite)}）</>}
          ，试试清除筛选。
        </span>
      );
    }
    if (lastQuery) {
      return `没有找到「${lastQuery}」相关内容，可换个词再搜，或打开「同步资料」做全网搜索。`;
    }
    return '资料库还是空的。点击「同步资料」抓取最新列表，或填关键词搜索同步。';
  })();

  return (
    <Layout className="min-h-screen">
      <div className="sticky top-0 z-10">
        <Header className="flex items-center gap-3 h-[56px] !leading-[56px] px-[22px] bg-ph-header shadow-[0_2px_10px_rgba(0,0,0,.5)]">
          <button
            type="button"
            onClick={resetHome}
            className="flex items-center text-[22px] font-extrabold tracking-[.5px] whitespace-nowrap shrink-0 cursor-pointer bg-transparent border-0 p-0"
            title="返回全部资料"
          >
            <span className="text-white px-0.5">学习</span>
            <span className="text-black bg-ph-orange px-2 py-0.5 rounded ml-[3px]">资料</span>
          </button>
          <Input.Search
            className="flex-1 min-w-0"
            placeholder={showFavorites ? '在收藏中搜索…' : '搜索本地标题或编号…'}
            value={query}
            allowClear
            onChange={(e) => setQuery(e.target.value)}
            onSearch={handleLocalSearch}
            enterButton={
              <Button icon={<SearchOutlined />}>
                {showFavorites ? '搜收藏' : '本地搜'}
              </Button>
            }
          />
          <Tooltip title={showFavorites ? '返回资料库' : '只看收藏（独立 favorites.json）'}>
            <Button
              size="middle"
              icon={showFavorites ? <StarFilled /> : <StarOutlined />}
              type={showFavorites ? 'primary' : 'default'}
              onClick={toggleFavoritesView}
            >
              收藏{favorites.length > 0 ? ` ${favorites.length}` : ''}
            </Button>
          </Tooltip>
          {showFavorites && (
            <Dropdown
              menu={{
                items: [
                  { key: 'json', label: '下载 JSON', onClick: () => { window.location.href = '/api/favorites/download?format=json'; } },
                  { key: 'txt', label: '下载地址列表 (txt)', onClick: () => { window.location.href = '/api/favorites/download?format=txt'; } },
                ],
              }}
              placement="bottomRight"
            >
              <Button size="middle" icon={<DownloadOutlined />} disabled={favorites.length === 0}>
                下载收藏
              </Button>
            </Dropdown>
          )}
          <SyncPanel
            onSync={handleSync}
            syncing={syncing}
            logs={syncLogs}
            status={status}
            open={syncOpen}
            onOpenChange={(v) => {
              setSyncOpen(v);
              if (!v) setSyncPrefill('');
            }}
            initialKeyword={syncPrefill}
          />
          {status && (
            <span
              className="hidden xl:inline-block text-xs text-ph-text-secondary bg-ph-bg border border-ph-border px-3 py-1 rounded-full max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap shrink-0"
              title={status}
            >
              {status}
            </span>
          )}
        </Header>

        {tagList.length > 0 && (
          <div className="bg-ph-bg border-b border-ph-border px-[22px] py-2 flex gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Tag.CheckableTag
              className={`!rounded-[14px] !px-3 !py-1 !text-[13px] !border ${
                !activeTag
                  ? '!bg-ph-orange !text-black !border-ph-orange !font-semibold'
                  : '!bg-ph-border !text-ph-text-secondary !border-ph-border-light'
              }`}
              checked={!activeTag}
              onChange={() => { setActiveTag(''); setPage(1); }}
            >
              全部标签
            </Tag.CheckableTag>
            {tagList.map((t) => (
              <Tag.CheckableTag
                key={t}
                className={`!rounded-[14px] !px-3 !py-1 !text-[13px] !border ${
                  activeTag === t
                    ? '!bg-ph-orange !text-black !border-ph-orange !font-semibold'
                    : '!bg-ph-border !text-ph-text-secondary !border-ph-border-light'
                }`}
                checked={activeTag === t}
                onChange={() => handleFilterTag(t)}
              >
                {t}
              </Tag.CheckableTag>
            ))}
          </div>
        )}

        {siteList.length > 1 && (
          <div className="bg-ph-bg border-b border-ph-border px-[22px] py-2 flex gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Tag.CheckableTag
              className={`!rounded-[14px] !px-3 !py-1 !text-[13px] !border flex items-center gap-1 ${
                !activeSite
                  ? '!bg-ph-orange !text-black !border-ph-orange !font-semibold'
                  : '!bg-ph-border !text-ph-text-secondary !border-ph-border-light'
              }`}
              checked={!activeSite}
              onChange={() => { setActiveSite(''); setPage(1); }}
            >
              全部来源
            </Tag.CheckableTag>
            {siteList.map((s) => {
              const key = s.site || '__unknown__';
              return (
                <Tag.CheckableTag
                  key={key}
                  className={`!rounded-[14px] !px-3 !py-1 !text-[13px] !border flex items-center gap-1 ${
                    activeSite === key
                      ? '!bg-ph-orange !text-black !border-ph-orange !font-semibold'
                      : '!bg-ph-border !text-ph-text-secondary !border-ph-border-light'
                  }`}
                  checked={activeSite === key}
                  onChange={() => handleFilterSite(key)}
                >
                  <GlobalOutlined />
                  {s.label}
                  <span className="opacity-60 text-[11px]">{s.count}</span>
                </Tag.CheckableTag>
              );
            })}
          </div>
        )}

        {(hasFilter || lastQuery || sourceItems.length > 0 || showFavorites) && (
          <div className="bg-ph-bg/95 border-b border-ph-border px-[22px] py-1.5 flex items-center gap-3 text-[12px] text-ph-text-muted">
            <span>
              {showFavorites
                ? (hasFilter || lastQuery
                  ? `收藏筛选 ${filtered.length} 条（共 ${favorites.length} 条）`
                  : `收藏 ${filtered.length} 条`)
                : (hasFilter
                  ? `筛选后 ${filtered.length} 条（库内 ${items.length} 条）`
                  : `共 ${filtered.length} 条`)}
            </span>
            {hasFilter && (
              <Button
                type="link"
                size="small"
                icon={<ClearOutlined />}
                className="!px-0 !h-auto"
                onClick={clearFilters}
              >
                清除筛选
              </Button>
            )}
            {lastQuery && !hasFilter && !showFavorites && (
              <Button
                type="link"
                size="small"
                icon={<ReloadOutlined />}
                className="!px-0 !h-auto"
                onClick={resetHome}
              >
                显示全部
              </Button>
            )}
          </div>
        )}
      </div>

      <Content className="px-[22px] py-[18px] pb-10">
        <Spin spinning={loadingList} tip="正在加载…">
          {filtered.length === 0 ? (
            <Empty
              image={<InboxOutlined style={{ fontSize: 64, color: '#555' }} />}
              description={<Text type="secondary">{emptyDescription}</Text>}
              className="!py-20"
            >
              {hasFilter && (
                <Button type="primary" onClick={clearFilters}>清除筛选</Button>
              )}
              {!hasFilter && (
                <Space>
                  {lastQuery && <Button onClick={resetHome}>显示全部</Button>}
                  <Button type="primary" icon={<SyncOutlined />} disabled={syncing} onClick={openSyncWithQuery}>
                    同步资料
                  </Button>
                </Space>
              )}
            </Empty>
          ) : (
            <>
              <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {paged.map((item) => (
                  <VideoCard
                    key={item.id}
                    item={item}
                    onClick={handleCardClick}
                    favorited={favIds.has(item.id)}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
              {filtered.length > PAGE_SIZE && (
                <div className="flex justify-center items-center gap-3 mt-6">
                  <Pagination
                    current={safePage}
                    pageSize={PAGE_SIZE}
                    total={filtered.length}
                    onChange={(p) => {
                      setPage(p);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    showSizeChanger={false}
                    showTotal={(t, [from, to]) => `${from}–${to} / ${t}`}
                  />
                </div>
              )}
            </>
          )}
        </Spin>
      </Content>

      {selected && (
        <PlayerModal
          item={selected}
          onClose={handleClose}
          onTagClick={handleTagClick}
          favorited={favIds.has(selected.id)}
          onToggleFavorite={handleToggleFavorite}
        />
      )}
    </Layout>
  );
}
