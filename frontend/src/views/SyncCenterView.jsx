import { useMemo, useState } from 'react';
import { Empty, Row, Col, Button, Table, Tag, Badge, Input } from 'antd';
import {
  SyncOutlined, PlayCircleFilled, DatabaseOutlined, VideoCameraOutlined,
  ClockCircleOutlined, WarningOutlined, ExclamationCircleOutlined,
  ArrowUpOutlined, PlusOutlined, CheckCircleOutlined,
  CloseCircleOutlined, LoadingOutlined,
} from '@ant-design/icons';
import PageShell from '../components/PageShell.jsx';
import PageBanner from '../components/PageBanner.jsx';
import { formatDate } from '../services/api.js';
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

export default function SyncCenterView({
  sites,
  siteCounts,
  itemsCount,
  syncHistory,
  lastSyncAt,
  syncing,
  elapsed = 0,
  onTriggerSync,
  keywordSyncing,
  keywordResults,
  onStartKeywordSync,
  onCancelKeywordSync,
}) {
  const [keywords, setKeywords] = useState('');

  const sourceCards = useMemo(() => {
    return (sites || [])
      .filter((s) => s && s.url && s.enabled !== false)
      .map((s) => ({
        key: s.url,
        name: s.name || s.url,
        url: s.url,
        count: siteCounts.get(s.url) || 0,
      }));
  }, [sites, siteCounts]);

  const lastSyncLabel = (() => {
    if (!lastSyncAt) return '尚未同步';
    const d = new Date(lastSyncAt);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  })();
  const lastSyncDate = lastSyncAt ? formatDate(lastSyncAt) : '—';

  const syncElapsedLabel = (() => {
    const sec = Math.floor((elapsed || 0) / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  })();

  const columns = [
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 180,
      render: (t) => (
        <span className="tabular-nums text-ph-text-secondary whitespace-nowrap">
          {t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '—'}
        </span>
      ),
    },
    {
      title: '数据源',
      dataIndex: 'source',
      key: 'source',
      render: (s) => <span className="text-white font-medium">{s || '本地索引'}</span>,
    },
    {
      title: '操作',
      dataIndex: 'op',
      key: 'op',
      render: (o) => <span className="text-ph-text-tertiary">{o || '全量同步'}</span>,
    },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      width: 90,
      render: (_, record) => {
        const k = resultKey(record);
        return <Tag color={RESULT_TAG_COLOR[k]} className="!m-0 !text-[10px] !font-black !rounded-lg">{RESULT_LABEL[k]}</Tag>;
      },
    },
    {
      title: '耗时',
      dataIndex: 'elapsed',
      key: 'elapsed',
      align: 'right',
      width: 100,
      render: (e) => <span className="tabular-nums text-ph-text-secondary">{e || '—'}</span>,
    },
  ];

  const busy = syncing || keywordSyncing;

  return (
    <PageShell>
      <PageBanner
        largeIcon
        icon={<SyncOutlined className="text-xl" spin={syncing} />}
        title="同步日志"
        subtitle="查看多节点同步记录与索引拉取状态"
        actions={(
          <Button
            type="primary"
            size="large"
            onClick={onTriggerSync}
            disabled={syncing}
            icon={<PlayCircleFilled style={{ fontSize: 16 }} />}
            className={`!inline-flex !items-center !font-black !border-0 shrink-0 ${
              syncing ? '' : '!bg-ph-orange hover:!bg-ph-orange-light !text-black'
            }`}
          >
            {syncing ? `同步中 ${syncElapsedLabel}` : '立即全量同步'}
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
            icon={<ExclamationCircleOutlined className={syncing ? 'text-ph-orange' : 'text-emerald-400'} style={{ fontSize: 16 }} />}
            label="同步状态"
            value={syncing ? '运行中' : '就绪'}
            valueClass={syncing ? 'text-ph-orange' : 'text-emerald-400'}
            hint={(
              <div className="text-[10px] text-ph-text-muted font-bold tabular-nums">
                {syncing ? `已运行 ${syncElapsedLabel}` : '队列空闲'}
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
            placeholder="输入关键词，多个用逗号分隔，例：关键词1,关键词2"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            disabled={busy}
            allowClear
            className="!bg-ph-card !border-white/10 !text-white flex-1"
            onPressEnter={() => {
              if (!busy && keywords.trim()) onStartKeywordSync(keywords);
            }}
          />
          <Button
            type="primary"
            size="middle"
            onClick={() => onStartKeywordSync(keywords)}
            disabled={busy || !keywords.trim()}
            loading={keywordSyncing}
            icon={!keywordSyncing ? <PlusOutlined /> : undefined}
            className={`!font-black !border-0 shrink-0 ${
              busy || !keywords.trim() ? '' : '!bg-ph-orange hover:!bg-ph-orange-light !text-black'
            }`}
          >
            {keywordSyncing ? '同步中…' : '开始同步'}
          </Button>
          {keywordSyncing && (
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
                const color = r.status === 'error' ? 'error'
                  : r.status === 'canceled' ? 'default'
                  : r.status === 'running' ? 'processing'
                  : r.exhausted ? 'warning'
                  : 'success';
                const icon = r.status === 'running'
                  ? <LoadingOutlined style={{ fontSize: 11 }} spin />
                  : (r.status === 'error' || r.status === 'canceled')
                    ? <CloseCircleOutlined style={{ fontSize: 11 }} />
                    : <CheckCircleOutlined style={{ fontSize: 11 }} />;
                const statusText = r.status === 'running' ? '进行中'
                  : r.status === 'error' ? '失败'
                  : r.status === 'canceled' ? '已取消'
                  : r.exhausted ? '已抓完'
                  : '完成';
                return (
                  <Tag
                    key={r.keyword}
                    color={color}
                    className="!flex !items-center !gap-1.5 !px-2.5 !py-1 !m-0 !text-xs !font-bold !rounded-lg"
                  >
                    {icon}
                    <span>{r.keyword}</span>
                    <span className="text-[10px] opacity-80">{statusText}</span>
                    {r.added > 0 && (
                      <span className="text-[10px] tabular-nums">+{r.added}</span>
                    )}
                    {r.error && (
                      <span className="text-[10px] opacity-70 truncate max-w-[160px]" title={r.error}>
                        {r.error}
                      </span>
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
        <div className="hidden md:block surface-card overflow-hidden">
          <Table
            columns={columns}
            dataSource={syncHistory}
            rowKey={(_, idx) => idx}
            size="small"
            pagination={false}
            locale={{
              emptyText: (
                <div className="py-10 text-center text-ph-text-muted">
                  暂无同步记录，点击「立即全量同步」开始第一次抓取
                </div>
              ),
            }}
            footer={syncHistory.length > 0
              ? () => (
                  <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between text-[11px] text-ph-text-muted">
                    <span>显示最近 {syncHistory.length} 条记录</span>
                  </div>
                )
              : undefined}
          />
        </div>
        <div className="md:hidden space-y-2">
          {syncHistory.length === 0 ? (
            <div className="py-10 text-center text-ph-text-muted surface-card">
              暂无同步记录，点击「立即全量同步」开始第一次抓取
            </div>
          ) : (
            <>
              {syncHistory.map((entry, idx) => {
                const k = resultKey(entry);
                return (
                  <div key={idx} className="surface-card p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-ph-text-muted tabular-nums">
                        {entry.time ? new Date(entry.time).toLocaleString('zh-CN', { hour12: false }) : '—'}
                      </span>
                      <Tag color={RESULT_TAG_COLOR[k]} className="!m-0 !text-[10px] !font-black !rounded-lg">{RESULT_LABEL[k]}</Tag>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-white font-medium truncate">{entry.source || '本地索引'}</span>
                      <span className="text-ph-text-tertiary tabular-nums shrink-0">{entry.elapsed || '—'}</span>
                    </div>
                  </div>
                );
              })}
              <div className="px-1 py-2 text-[11px] text-ph-text-muted">
                显示最近 {syncHistory.length} 条记录
              </div>
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}
