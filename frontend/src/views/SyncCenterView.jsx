import { useMemo, useState, useEffect, useRef } from 'react';
import { Empty, Row, Col, Button, Tag, Badge, Input } from 'antd';
import {
  SyncOutlined, PlayCircleFilled, DatabaseOutlined, VideoCameraOutlined,
  ClockCircleOutlined, WarningOutlined, ExclamationCircleOutlined,
  ArrowUpOutlined, PlusOutlined, CheckCircleOutlined,
  CloseCircleOutlined, LoadingOutlined,
} from '@ant-design/icons';
import PageShell from '../components/PageShell.jsx';
import PageBanner from '../components/PageBanner.jsx';
import DataManagePanel from '../components/DataManagePanel.jsx';
import { formatDate, formatElapsedShort } from '../utils/format.js';
import {
  STAT_GUTTER, STAT_RESPONSIVE, SRC_GUTTER, SRC_RESPONSIVE,
} from '../constants/layout.js';

const RESULT_TAG_COLOR = {
  success: 'success',
  warn: 'warning',
  error: 'error',
  canceled: 'default',
};
const RESULT_LABEL = {
  success: '成功',
  warn: '警告',
  error: '失败',
  canceled: '取消',
};

const KW_STATUS_META = {
  running: { color: 'processing', text: '进行中', icon: 'running' },
  error: { color: 'error', text: '失败', icon: 'error' },
  canceled: { color: 'default', text: '已取消', icon: 'error' },
  done: { color: 'success', text: '完成', icon: 'ok' },
  exhausted: { color: 'warning', text: '已抓完', icon: 'ok' },
};

function keywordStatusMeta(row) {
  if (row.status === 'running') return KW_STATUS_META.running;
  if (row.status === 'error') return KW_STATUS_META.error;
  if (row.status === 'canceled') return KW_STATUS_META.canceled;
  if (row.exhausted) return KW_STATUS_META.exhausted;
  return KW_STATUS_META.done;
}

function resultKey(entry) {
  const r = (entry.result || '').toLowerCase();
  if (r === '成功' || r === 'success') return 'success';
  if (r === '取消' || r === 'canceled') return 'canceled';
  if (r === '失败' || r === 'error') return 'error';
  if (r === '警告' || r === 'warn') return 'warn';
  return 'success';
}

function StatCard({ icon, label, value, hint, valueClass = 'text-white' }) {
  return (
    <div className="surface-card p-4 sm:p-5 space-y-3 h-full hover:border-ph-orange/30">
      <div className="flex items-center gap-2 text-ph-text-tertiary">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl sm:text-3xl font-black tabular-nums ${valueClass}`}>
        {value}
      </div>
      {hint}
    </div>
  );
}

function HistoryRow({ entry }) {
  const k = resultKey(entry);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3 border-b border-white/5 last:border-0">
      <span className="text-xs text-ph-text-muted tabular-nums whitespace-nowrap sm:w-44 shrink-0">
        {entry.time ? new Date(entry.time).toLocaleString('zh-CN', { hour12: false }) : '—'}
      </span>
      <span className="text-sm text-white font-medium truncate flex-1 min-w-0">
        {entry.source || '本地索引'}
      </span>
      <span className="text-xs text-ph-text-tertiary hidden sm:inline shrink-0">
        {entry.op || '全量同步'}
      </span>
      <Tag color={RESULT_TAG_COLOR[k]} className="!m-0 !text-[10px] !font-black !rounded-lg w-fit">
        {RESULT_LABEL[k]}
      </Tag>
      <span className="text-xs text-ph-text-secondary tabular-nums sm:w-20 sm:text-right shrink-0">
        {entry.elapsed || '—'}
      </span>
    </div>
  );
}

export default function SyncCenterView({
  sites,
  siteCounts,
  itemsCount,
  syncHistory,
  lastSyncAt,
  isSyncing,
  elapsed = 0,
  onTriggerSync,
  isKeywordSyncing,
  keywordResults,
  onStartKeywordSync,
  onCancelKeywordSync,
  onDataImported,
}) {
  const [keywords, setKeywords] = useState('');

  const sourceCards = useMemo(() => (
    (sites || [])
      .filter((s) => s?.url && s.enabled !== false)
      .map((s) => ({
        key: s.url,
        name: s.name || s.url,
        url: s.url,
        permanentUrl: s.permanentUrl,
        permanentLabel: s.permanentLabel,
        count: siteCounts.get(s.url) || 0,
      }))
  ), [sites, siteCounts]);

  const lastSyncLabel = (() => {
    if (!lastSyncAt) return '尚未同步';
    const d = new Date(lastSyncAt);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  })();
  const lastSyncDate = lastSyncAt ? formatDate(lastSyncAt) : '—';
  const syncElapsedLabel = formatElapsedShort(elapsed);
  const isBusy = isSyncing || isKeywordSyncing;
  const wasKeywordSyncing = useRef(false);

  useEffect(() => {
    if (wasKeywordSyncing.current && !isKeywordSyncing) {
      const failed = (keywordResults || []).some(
        (r) => r.status === 'error' || r.status === 'canceled'
      );
      if (!failed && (keywordResults || []).length > 0) {
        setKeywords('');
      }
    }
    wasKeywordSyncing.current = isKeywordSyncing;
  }, [isKeywordSyncing, keywordResults]);

  return (
    <PageShell>
      <PageBanner
        largeIcon
        icon={<SyncOutlined className="text-xl" spin={isSyncing} />}
        title="同步日志"
        subtitle="查看多节点同步记录与索引拉取状态"
        actions={(
          <Button
            type="primary"
            size="large"
            onClick={onTriggerSync}
            disabled={isBusy}
            icon={<PlayCircleFilled style={{ fontSize: 16 }} />}
            className={`!inline-flex !items-center !font-black !border-0 shrink-0 ${
              isBusy ? '' : '!bg-ph-orange hover:!bg-ph-orange-light !text-black'
            }`}
          >
            {isSyncing ? `同步中 ${syncElapsedLabel}` : '立即全量同步'}
          </Button>
        )}
      />

      <Row gutter={STAT_GUTTER}>
        <Col {...STAT_RESPONSIVE} className="mb-3 sm:mb-4">
          <StatCard
            icon={<DatabaseOutlined className="text-ph-orange" style={{ fontSize: 16 }} />}
            label="数据源节点"
            value={sourceCards.length || 0}
            hint={(
              <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <ArrowUpOutlined style={{ fontSize: 12 }} />
                <span>在线率 100%</span>
              </div>
            )}
          />
        </Col>
        <Col {...STAT_RESPONSIVE} className="mb-3 sm:mb-4">
          <StatCard
            icon={<VideoCameraOutlined className="text-ph-orange" style={{ fontSize: 16 }} />}
            label="索引视频总数"
            value={itemsCount.toLocaleString()}
            hint={(
              <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <PlusOutlined style={{ fontSize: 12 }} />
                <span>本地缓存</span>
              </div>
            )}
          />
        </Col>
        <Col {...STAT_RESPONSIVE} className="mb-3 sm:mb-4">
          <StatCard
            icon={<ClockCircleOutlined className="text-ph-orange" style={{ fontSize: 16 }} />}
            label="上次同步"
            value={lastSyncLabel}
            hint={<div className="text-[10px] text-ph-text-muted font-bold tabular-nums">{lastSyncDate}</div>}
          />
        </Col>
        <Col {...STAT_RESPONSIVE} className="mb-3 sm:mb-4">
          <StatCard
            icon={<ExclamationCircleOutlined className={isSyncing ? 'text-ph-orange' : 'text-emerald-400'} style={{ fontSize: 16 }} />}
            label="同步状态"
            value={isSyncing ? '运行中' : '就绪'}
            valueClass={isSyncing ? 'text-ph-orange' : 'text-emerald-400'}
            hint={(
              <div className="text-[10px] text-ph-text-muted font-bold tabular-nums">
                {isSyncing ? `已运行 ${syncElapsedLabel}` : '队列空闲'}
              </div>
            )}
          />
        </Col>
      </Row>

      <div className="notice-soft">
        <WarningOutlined className="shrink-0 mt-0.5" style={{ fontSize: 18 }} />
        <div className="space-y-1">
          <div className="text-sm font-bold text-ph-orange">只读模式运行中</div>
          <p className="text-xs text-ph-text-tertiary leading-relaxed m-0">
            当前中心节点以只读模式运行，同步操作仅刷新本地索引缓存，不会修改远端数据源配置。
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="section-title">数据源节点</h2>
        {sourceCards.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未配置数据源节点" />
        ) : (
          <Row gutter={SRC_GUTTER}>
            {sourceCards.map((src) => (
              <Col key={src.key} {...SRC_RESPONSIVE} className="mb-3 sm:mb-4">
                <div className="surface-card p-4 space-y-3 h-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <DatabaseOutlined className="text-ph-orange shrink-0" style={{ fontSize: 16 }} />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{src.name}</div>
                        <div className="text-[10px] text-ph-text-muted font-mono truncate">{src.url}</div>
                        {src.permanentUrl && (
                          <div className="text-[10px] text-ph-text-tertiary font-mono truncate" title={`失效时可据永久发布页（${src.permanentLabel || ''}）更新 url`}>
                            永久地址：{src.permanentUrl}{src.permanentLabel ? `（${src.permanentLabel}）` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge status="success" text={<span className="text-[10px] font-black text-emerald-400">在线</span>} />
                  </div>
                  <Row gutter={[8, 8]} className="text-xs">
                    <Col span={12}>
                      <div className="bg-ph-card rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-ph-text-muted">视频数量</div>
                        <div className="tabular-nums font-bold text-white">{src.count.toLocaleString()}</div>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="bg-ph-card rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-ph-text-muted">状态</div>
                        <div className="font-bold text-emerald-400">已就绪</div>
                      </div>
                    </Col>
                  </Row>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </section>

      <section className="surface-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="section-title">关键词同步</h2>
          <span className="text-[10px] text-ph-text-muted font-bold">单次最多 50 条 · 增量翻页</span>
        </div>
        <p className="text-[11px] text-ph-text-tertiary leading-relaxed m-0">
          支持输入多个关键词，使用逗号分隔；每个关键词作为独立任务并行执行，互不影响。
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <Input
            size="middle"
            aria-label="同步关键词"
            autoComplete="off"
            placeholder="输入关键词，多个用逗号分隔，如：关键词1, 关键词2…"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            disabled={isBusy}
            allowClear
            className="!bg-ph-card !border-white/10 !text-white flex-1"
            onPressEnter={() => {
              if (!isBusy && keywords.trim()) onStartKeywordSync(keywords);
            }}
          />
          <Button
            type="primary"
            size="middle"
            onClick={() => onStartKeywordSync(keywords)}
            disabled={isBusy || !keywords.trim()}
            loading={isKeywordSyncing}
            icon={!isKeywordSyncing ? <PlusOutlined /> : undefined}
            className={`!font-black !border-0 shrink-0 ${
              isBusy || !keywords.trim() ? '' : '!bg-ph-orange hover:!bg-ph-orange-light !text-black'
            }`}
          >
            {isKeywordSyncing ? '同步中…' : '开始同步'}
          </Button>
          {isKeywordSyncing && (
            <Button
              size="middle"
              danger
              onClick={onCancelKeywordSync}
              icon={<CloseCircleOutlined />}
              className="!bg-red-500/10 hover:!bg-red-500/20 !text-red-400 !border !border-red-500/30 shrink-0"
            >
              取消
            </Button>
          )}
        </div>

        {keywordResults.length > 0 && (
          <div className="space-y-2 border-t border-white/5 pt-3">
            <div className="text-xs font-bold text-ph-text-tertiary">同步结果：</div>
            <div className="flex flex-wrap gap-2">
              {keywordResults.map((r) => {
                const meta = keywordStatusMeta(r);
                let icon = <CheckCircleOutlined style={{ fontSize: 11 }} />;
                if (meta.icon === 'running') {
                  icon = <LoadingOutlined style={{ fontSize: 11 }} spin />;
                } else if (meta.icon === 'error') {
                  icon = <CloseCircleOutlined style={{ fontSize: 11 }} />;
                }
                return (
                  <Tag
                    key={r.keyword}
                    color={meta.color}
                    className="!flex !items-center !gap-1.5 !px-2.5 !py-1 !m-0 !text-xs !font-bold !rounded-lg"
                  >
                    {icon}
                    <span>{r.keyword}</span>
                    <span className="text-[10px] opacity-80">{meta.text}</span>
                    {r.added > 0 && <span className="text-[10px] tabular-nums">+{r.added}</span>}
                    {r.error && (
                      <span className="text-[10px] opacity-70 truncate max-w-[160px]" title={r.error}>{r.error}</span>
                    )}
                  </Tag>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="section-title">同步日志</h2>
        <div className="surface-card overflow-hidden">
          {syncHistory.length === 0 ? (
            <div className="py-10 text-center text-ph-text-muted">
              暂无同步记录，点击「立即全量同步」开始第一次抓取
            </div>
          ) : (
            <>
              <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b border-white/5 text-[11px] font-bold uppercase tracking-wider text-ph-text-muted">
                <span className="w-44 shrink-0">时间</span>
                <span className="flex-1">数据源</span>
                <span className="shrink-0">操作</span>
                <span className="w-14 shrink-0">结果</span>
                <span className="w-20 text-right shrink-0">耗时</span>
              </div>
              {syncHistory.map((entry, idx) => (
                <HistoryRow key={idx} entry={entry} />
              ))}
              <div className="px-4 py-3 border-t border-white/5 text-[11px] text-ph-text-muted">
                显示最近 {syncHistory.length} 条记录
              </div>
            </>
          )}
        </div>
      </section>

      <DataManagePanel onImported={onDataImported} />
    </PageShell>
  );
}
