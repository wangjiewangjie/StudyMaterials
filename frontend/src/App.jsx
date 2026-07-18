import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  Layout, Input, Button, Card, Tag, Modal, Empty, Spin, Typography,
  Space, Popover, InputNumber, Pagination, App as AntdApp,
} from 'antd';
import {
  SearchOutlined, CloudDownloadOutlined, LinkOutlined,
  VideoCameraOutlined, InboxOutlined, GlobalOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import VideoPlayer from './VideoPlayer.jsx';

const { Header, Content } = Layout;
const { Text } = Typography;

// Map each source site to a human-readable Chinese name.
// Keys are matched by hostname so the mapping survives subdomain rotation.
const SITE_NAMES = {
  'bite.ygvttlxzy.cc': '91吃瓜',
  'd1ve8vvwughzqa.cloudfront.net': '91视频',
  'breast.eiejvjgex.cc': '51fans',
  'assert.pbtiodqn.cc': '51爆料',
};

// Derive a short, human-readable label from a site URL.
function siteLabel(siteUrl) {
  if (!siteUrl) return '未知站点';
  try {
    const host = new URL(siteUrl).hostname;
    return SITE_NAMES[host] || host.split('.')[0];
  } catch (_) {
    return String(siteUrl);
  }
}

// Format an ISO date string as YYYY-MM-DD (returns '' for falsy/invalid input).
function formatDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

const VideoCard = memo(function VideoCard({ item, onClick }) {
  // Covers are no longer stored on disk: serve them through /api/cover/:id,
  // which fetches the remote cover and decrypts it in memory.
  const thumb = item.coverUrl ? `/api/cover/${item.id}` : '';
  const hasVideo = !!(item.video && item.video.url);
  const handleClick = useCallback(() => onClick(item), [item, onClick]);
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
        {hasVideo ? (
          <span className="absolute bottom-1.5 right-1.5 bg-black/85 text-white text-[13px] font-bold px-1.5 py-0.5 rounded-sm">
            <VideoCameraOutlined />
          </span>
        ) : (
          <span className="absolute bottom-1.5 right-1.5 bg-zinc-700/85 text-zinc-300 text-[11px] font-bold px-1.5 py-0.5 rounded-sm">
            暂无视频
          </span>
        )}
      </div>
      <div className="p-2">
        <div className="line-clamp-2 text-[13px] leading-[1.4] text-ph-text-primary font-semibold min-h-[36px]">
          {item.title || item.id}
        </div>
        <div className="flex gap-2 items-center text-[11px] text-ph-text-muted mt-1.5 flex-wrap">
          {item.category && <span className="text-ph-orange font-semibold">{item.category}</span>}
          {item.datePublished && (
            <span className="inline-flex items-center gap-0.5">
              <CalendarOutlined />
              {formatDate(item.datePublished)}
            </span>
          )}
          <span>ID: {item.id}</span>
        </div>
      </div>
    </Card>
  );
});

function PlayerModal({ item, onClose, onTagClick }) {
  const [tags, setTags] = useState(item.tags || []);
  const [category, setCategory] = useState(item.category || null);
  const [datePublished, setDatePublished] = useState(item.datePublished || null);

  useEffect(() => {
    setTags(item.tags || []);
    setCategory(item.category || null);
    setDatePublished(item.datePublished || null);
  }, [item]);

  // Stable callback so VideoPlayer's effect doesn't re-run on every render.
  // The /api/refresh/:id response now also returns datePublished, which we pick
  // up here so the modal updates without a full list reload.
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
      title={item.title || item.id}
      className="player-modal"
    >
      {hasVideo ? (
        <VideoPlayer item={item} onTags={handleTags} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <InboxOutlined style={{ fontSize: 48, color: '#555' }} />
          <Text type="secondary">该视频暂无可播放地址</Text>
          <Text type="secondary" className="text-xs">
            来源站点 {siteLabel(item.siteUrl)} 的播放接口可能已关闭，可点击下方「原网页」尝试访问。
          </Text>
        </div>
      )}
      <div className="px-[18px] pb-4 pt-3.5">
        {(datePublished || item.siteUrl) && (
          <div className="flex gap-4 items-center text-[12px] text-ph-text-muted mb-2.5 flex-wrap">
            {datePublished && (
              <span className="inline-flex items-center gap-1">
                <CalendarOutlined />
                发布于 {formatDate(datePublished)}
              </span>
            )}
            {item.siteUrl && (
              <span className="inline-flex items-center gap-1">
                <GlobalOutlined />
                {siteLabel(item.siteUrl)}
              </span>
            )}
            <span>ID: {item.id}</span>
          </div>
        )}
        {(category || tags.length > 0) && (
          <Space size={[6, 6]} wrap>
            {category && (
              <Tag color="orange" className="cursor-pointer" onClick={() => onTagClick && onTagClick(category)}>
                {category}
              </Tag>
            )}
            {tags.map((t, i) => (
              <Tag key={i} className="cursor-pointer" onClick={() => onTagClick && onTagClick(t)}>
                {t}
              </Tag>
            ))}
          </Space>
        )}
        <div className="flex gap-2 flex-wrap mt-3">
          {item.url && (
            <Button size="small" icon={<LinkOutlined />} href={item.url} target="_blank" rel="noreferrer">原网页</Button>
          )}
          {hasVideo && (
            <Button size="small" icon={<VideoCameraOutlined />} href={item.video.url} target="_blank" rel="noreferrer">m3u8 链接</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CrawlPanel({ onCrawl, crawling, logs }) {
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(3);
  const [open, setOpen] = useState(false);
  const logRef = useRef(null);

  // Auto-scroll the log box to the bottom as new lines arrive.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const start = () => {
    onCrawl({ pageStart, pageEnd });
  };

  const content = (
    <div className="w-[300px]">
      <div className="flex items-center gap-2 mb-3">
        <Text type="secondary" className="whitespace-nowrap">列表页</Text>
        <InputNumber size="small" min={1} value={pageStart} onChange={(v) => setPageStart(v || 1)} />
        <Text type="secondary">~</Text>
        <InputNumber size="small" min={1} value={pageEnd} onChange={(v) => setPageEnd(v || 1)} />
      </div>
      <Button type="primary" size="small" block loading={crawling} onClick={start}>
        开始爬取
      </Button>
      {logs && (
        <pre ref={logRef} className="bg-black border border-ph-border rounded p-2 mt-3 font-mono text-[11px] max-h-[180px] overflow-auto text-ph-text-tertiary whitespace-pre-wrap leading-[1.5]">
          {logs}
        </pre>
      )}
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      content={content}
      title="爬取更多页"
    >
      <Button size="middle" icon={<CloudDownloadOutlined />} loading={crawling}>
        爬取更多页
      </Button>
    </Popover>
  );
}

export default function App() {
  const { message } = AntdApp.useApp();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [searching, setSearching] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [crawlLogs, setCrawlLogs] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [activeSite, setActiveSite] = useState('');
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(false);

  const PAGE_SIZE = 60;
  // Stable click handler; setSelected from useState is already stable, but
  // wrapping it here keeps the prop identity stable across renders.
  const handleCardClick = useCallback((item) => setSelected(item), []);

  const loadVideos = useCallback(async (q) => {
    setLoadingList(true);
    setStatus('加载中...');
    setPage(1);
    try {
      const url = q ? `/api/videos?q=${encodeURIComponent(q)}` : '/api/videos';
      const res = await fetch(url);
      const data = await res.json();
      setItems(data.items || []);
      setStatus(`共 ${data.total} 条`);
    } catch (e) {
      setStatus('加载失败: ' + e.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadVideos(''); }, [loadVideos]);

  // Build tag list from currently loaded items (categories + tags, ranked by frequency)
  const tagList = useMemo(() => {
    const counts = new Map();
    items.forEach((it) => {
      if (it.category) counts.set(it.category, (counts.get(it.category) || 0) + 1);
      (it.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([t]) => t);
  }, [items]);

  // Build site list from currently loaded items, ranked by count.
  // Each entry: { site: siteUrl|null, label: string, count: number }
  const siteList = useMemo(() => {
    const counts = new Map();
    items.forEach((it) => {
      const key = it.siteUrl || null;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([site, count]) => ({ site, label: siteLabel(site), count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  // Client-side tag + site filter on top of the loaded set.
  // Sort by publish date descending (newest first); fall back to numeric ID
  // when a side lacks datePublished so undated items still sort near the top.
  const filtered = useMemo(() => {
    let out = items;
    if (activeSite) {
      out = out.filter((it) => it.siteUrl === activeSite);
    }
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
  }, [items, activeTag, activeSite]);

  // Clamp the current page when the filtered set shrinks (e.g. after a search
  // or filter change) so we never render an empty page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const handleLocalSearch = () => {
    setActiveTag('');
    setActiveSite('');
    loadVideos(query.trim());
  };

  const handleOnlineSearch = async () => {
    const q = query.trim();
    if (!q) { message.warning('请输入搜索关键词'); return; }
    setSearching(true);
    setActiveTag('');
    setActiveSite('');
    setStatus(`线上搜索 "${q}" 中...`);
    try {
      const res = await fetch('/api/search-online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q, pages: 1 }),
      });
      const data = await res.json();
      if (data.error) { message.error('爬取失败: ' + data.error); }
      else {
        setItems(data.items || []);
        setStatus(`线上搜索完成，新增 ${data.added} 条，匹配 ${data.matched} 条`);
      }
    } catch (e) {
      message.error('请求失败: ' + e.message);
    } finally {
      setSearching(false);
    }
  };

  const handleCrawl = async ({ pageStart, pageEnd }) => {
    setCrawling(true);
    setCrawlLogs('开始爬取...\n');
    setStatus(`爬取第 ${pageStart}-${pageEnd} 页中...`);
    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageStart, pageEnd }),
      });
      const data = await res.json();
      if (data.error) {
        setCrawlLogs((p) => p + '错误: ' + data.error + '\n');
      } else {
        setCrawlLogs((data.logs || []).join('\n') + `\n完成：新增 ${data.added} 条，总计 ${data.total} 条\n`);
        setStatus(`爬取完成，新增 ${data.added} 条`);
        loadVideos(query.trim());
      }
    } catch (e) {
      setCrawlLogs((p) => p + '请求失败: ' + e.message + '\n');
    } finally {
      setCrawling(false);
    }
  };

  const handleClose = useCallback(() => setSelected(null), []);
  const handleTagClick = useCallback((tag) => {
    setQuery(tag);
    setSelected(null);
    setActiveSite('');
    // Defer search to next tick so the modal closes first.
    setTimeout(() => loadVideos(tag), 0);
  }, [loadVideos]);

  const handleFilterTag = useCallback((tag) => {
    setActiveTag((cur) => (cur === tag ? '' : tag));
    setPage(1);
  }, []);

  const handleFilterSite = useCallback((key) => {
    setActiveSite((cur) => (cur === key ? '' : key));
    setPage(1);
  }, []);

  return (
    <Layout className="min-h-screen">
      <div className="sticky top-0 z-10">
      <Header className="flex items-center gap-3 h-[56px] !leading-[56px] px-[22px] bg-ph-header shadow-[0_2px_10px_rgba(0,0,0,.5)]">
        <div className="flex items-center text-[22px] font-extrabold tracking-[.5px] whitespace-nowrap shrink-0">
          <span className="text-white px-0.5">学习</span>
          <span className="text-black bg-ph-orange px-2 py-0.5 rounded ml-[3px]">资料</span>
        </div>
        <Input.Search
          className="flex-1 min-w-0"
          placeholder="输入关键词搜索本地视频..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onSearch={handleLocalSearch}
          enterButton={<Button icon={<SearchOutlined />}>本地搜索</Button>}
        />
        <Button type="primary" icon={<CloudDownloadOutlined />} loading={searching} disabled={!query.trim()} onClick={handleOnlineSearch} className="shrink-0">
          线上搜索并爬取
        </Button>
        <CrawlPanel onCrawl={handleCrawl} crawling={crawling} logs={crawlLogs} />
        {status && (
          <span className="hidden xl:inline-block text-xs text-ph-text-secondary bg-ph-bg border border-ph-border px-3 py-1 rounded-full max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap shrink-0">
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
            全部
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
            全部站点
          </Tag.CheckableTag>
          {siteList.map((s) => {
            const key = s.site || 'unknown';
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
      </div>

      <Content className="px-[22px] py-[18px] pb-10">
        <Spin spinning={loadingList && items.length === 0} tip="加载中...">
          {filtered.length === 0 ? (
            <Empty
              image={<InboxOutlined style={{ fontSize: 64, color: '#555' }} />}
              description={<Text type="secondary">暂无数据。点击「线上搜索并爬取」或「爬取更多页」从网站抓取内容。</Text>}
              className="!py-20"
            />
          ) : (
            <>
              <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {paged.map((item) => (
                  <VideoCard key={item.id} item={item} onClick={handleCardClick} />
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
                    showTotal={(t, [from, to]) => `第 ${from}-${to} 条 / 共 ${t} 条`}
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
        />
      )}
    </Layout>
  );
}
