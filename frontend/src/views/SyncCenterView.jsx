import { useMemo } from 'react';
import { Empty, Row, Col, Button, Table, Tag, Badge } from 'antd';
import {
  SyncOutlined, PlayCircleFilled, DatabaseOutlined, VideoCameraOutlined,
  ClockCircleOutlined, WarningOutlined, ExclamationCircleOutlined,
  ArrowUpOutlined, PlusOutlined,
} from '@ant-design/icons';
import { formatDate } from '../services/api.js';

// 同步结果 Tag 颜色映射（antd Tag color 预设）
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

// 统计卡栅格：2 / 2 / 4 列
const STAT_RESPONSIVE = { xs: 12, sm: 12, lg: 6 };
const STAT_GUTTER = [12, 16];

// 数据源节点栅格：1 / 2 / 3 列
const SRC_RESPONSIVE = { xs: 24, md: 12, lg: 8 };
const SRC_GUTTER = [12, 16];

// 同步中心视图：横幅 + 4 张统计卡 + 只读提示 + 数据源节点 + 日志表。
export default function SyncCenterView({
  sites,
  siteCounts,
  itemsCount,
  syncHistory,
  lastSyncAt,
  syncing,
  onTriggerSync,
}) {
  // 数据源节点卡片：在线状态全显在线，计数取自 siteCounts
  const sourceCards = useMemo(() => {
    return (sites || [])
      .filter((s) => s && s.url && s.enabled !== false)
      .map((s) => {
        const count = siteCounts.get(s.url) || 0;
        return {
          key: s.url,
          name: s.name || s.url,
          url: s.url,
          count,
        };
      });
  }, [sites, siteCounts]);

  const lastSyncLabel = (() => {
    if (!lastSyncAt) return '尚未同步';
    const d = new Date(lastSyncAt);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  })();
  const lastSyncDate = lastSyncAt ? formatDate(lastSyncAt) : '—';

  // antd Table 列定义
  const columns = [
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 180,
      render: (t) => (
        <span className="tabular-nums text-gray-300 whitespace-nowrap">
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
      render: (o) => <span className="text-gray-400">{o || '全量同步'}</span>,
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
      render: (e) => <span className="tabular-nums text-gray-300">{e || '—'}</span>,
    },
  ];

  return (
    <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-24 pb-16 space-y-8">
      {/* 横幅 */}
      <section className="relative overflow-hidden rounded-lg border border-white/5 bg-gradient-to-br from-[#1a1a1e] via-[#121212] to-[#0a0a0a] p-6 sm:p-8">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#FF9900]/10 rounded-lg blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-[#FF9900]/20 border border-[#FF9900]/40 flex items-center justify-center">
                <SyncOutlined className="text-[#FF9900] text-xl" spin={syncing} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black italic tracking-tighter text-white">
                  同步日志
                </h1>
                <p className="text-xs text-gray-400">查看多节点同步记录与索引拉取状态</p>
              </div>
            </div>
          </div>
          <Button
            type="primary"
            onClick={onTriggerSync}
            disabled={syncing}
            icon={<PlayCircleFilled style={{ fontSize: 16 }} />}
            className="!flex !items-center !justify-center !gap-2 !px-6 !py-3 !h-auto !rounded-lg !text-sm !font-black !bg-[#FF9900] hover:!bg-[#ffaa22] !border-0 !text-black shrink-0"
          >
            {syncing ? '同步中…' : '立即全量同步'}
          </Button>
        </div>
      </section>

      {/* 统计卡栅格 */}
      <Row gutter={STAT_GUTTER}>
        <Col {...STAT_RESPONSIVE} className="mb-3 sm:mb-4">
          <div className="bg-[#0A0A0A] border border-white/5 rounded-lg p-4 sm:p-5 space-y-3 h-full">
            <div className="flex items-center gap-2 text-gray-400">
              <DatabaseOutlined className="text-[#FF9900]" style={{ fontSize: 16 }} />
              <span className="text-[11px] font-bold uppercase tracking-wider">数据源节点</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
              {sourceCards.length || 0}
            </div>
            <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <ArrowUpOutlined style={{ fontSize: 12 }} />
              <span>在线率 100%</span>
            </div>
          </div>
        </Col>
        <Col {...STAT_RESPONSIVE} className="mb-3 sm:mb-4">
          <div className="bg-[#0A0A0A] border border-white/5 rounded-lg p-4 sm:p-5 space-y-3 h-full">
            <div className="flex items-center gap-2 text-gray-400">
              <VideoCameraOutlined className="text-[#FF9900]" style={{ fontSize: 16 }} />
              <span className="text-[11px] font-bold uppercase tracking-wider">索引视频总数</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
              {itemsCount.toLocaleString()}
            </div>
            <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <PlusOutlined style={{ fontSize: 12 }} />
              <span>本地缓存</span>
            </div>
          </div>
        </Col>
        <Col {...STAT_RESPONSIVE} className="mb-3 sm:mb-4">
          <div className="bg-[#0A0A0A] border border-white/5 rounded-lg p-4 sm:p-5 space-y-3 h-full">
            <div className="flex items-center gap-2 text-gray-400">
              <ClockCircleOutlined className="text-[#FF9900]" style={{ fontSize: 16 }} />
              <span className="text-[11px] font-bold uppercase tracking-wider">上次同步</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
              {lastSyncLabel}
            </div>
            <div className="text-[10px] text-gray-500 font-bold tabular-nums">{lastSyncDate}</div>
          </div>
        </Col>
        <Col {...STAT_RESPONSIVE} className="mb-3 sm:mb-4">
          <div className="bg-[#0A0A0A] border border-white/5 rounded-lg p-4 sm:p-5 space-y-3 h-full">
            <div className="flex items-center gap-2 text-gray-400">
              <ExclamationCircleOutlined className="text-emerald-400" style={{ fontSize: 16 }} />
              <span className="text-[11px] font-bold uppercase tracking-wider">同步状态</span>
            </div>
            <div className={`text-2xl sm:text-3xl font-black tabular-nums ${syncing ? 'text-[#FF9900]' : 'text-emerald-400'}`}>
              {syncing ? '运行中' : '就绪'}
            </div>
            <div className="text-[10px] text-gray-500 font-bold">
              {syncing ? '正在拉取' : '队列空闲'}
            </div>
          </div>
        </Col>
      </Row>

      {/* 只读提示 */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
        <WarningOutlined className="text-amber-400 shrink-0 mt-0.5" style={{ fontSize: 18 }} />
        <div className="space-y-1">
          <div className="text-sm font-bold text-amber-400">只读模式运行中</div>
          <p className="text-xs text-gray-400 leading-relaxed">
            当前中心节点以只读模式运行，同步操作仅刷新本地索引缓存，不会修改远端数据源配置。
          </p>
        </div>
      </div>

      {/* 数据源节点 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
            <span className="w-1 h-5 bg-[#FF9900] rounded-lg inline-block" />
            <span>数据源节点</span>
          </h2>
        </div>
        {sourceCards.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未配置数据源节点" />
        ) : (
          <Row gutter={SRC_GUTTER}>
            {sourceCards.map((src) => (
              <Col key={src.key} {...SRC_RESPONSIVE} className="mb-3 sm:mb-4">
                <div className="bg-[#0A0A0A] border border-white/5 rounded-lg p-4 space-y-3 hover:border-[#FF9900]/30 transition-colors h-full">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#FF9900]/10 border border-[#FF9900]/30 flex items-center justify-center shrink-0">
                        <DatabaseOutlined className="text-[#FF9900]" style={{ fontSize: 14 }} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{src.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono truncate">{src.url}</div>
                      </div>
                    </div>
                    <Badge status="success" text={<span className="text-[10px] font-black text-emerald-400">在线</span>} />
                  </div>
                  <Row gutter={[8, 8]} className="text-xs">
                    <Col span={12}>
                      <div className="bg-[#121212] rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-gray-500">视频数量</div>
                        <div className="tabular-nums font-bold text-white">{src.count.toLocaleString()}</div>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="bg-[#121212] rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-gray-500">状态</div>
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

      {/* 同步日志表：使用 antd Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
            <span className="w-1 h-5 bg-[#FF9900] rounded-lg inline-block" />
            <span>同步日志</span>
          </h2>
        </div>
        {/* 桌面端：表格 */}
        <div className="hidden md:block bg-[#0A0A0A] border border-white/5 rounded-lg overflow-hidden">
          <Table
            columns={columns}
            dataSource={syncHistory}
            rowKey={(_, idx) => idx}
            size="small"
            pagination={false}
            locale={{
              emptyText: (
                <div className="py-10 text-center text-gray-500">
                  暂无同步记录，点击右上角「立即全量同步」开始第一次抓取
                </div>
              ),
            }}
            footer={syncHistory.length > 0
              ? () => (
                  <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-500">
                    <span>显示最近 {syncHistory.length} 条记录</span>
                  </div>
                )
              : undefined}
          />
        </div>
        {/* 移动端：卡片列表 */}
        <div className="md:hidden space-y-2">
          {syncHistory.length === 0 ? (
            <div className="py-10 text-center text-gray-500 bg-[#0A0A0A] border border-white/5 rounded-lg">
              暂无同步记录，点击右上角「立即全量同步」开始第一次抓取
            </div>
          ) : (
            <>
              {syncHistory.map((entry, idx) => {
                const k = resultKey(entry);
                return (
                  <div key={idx} className="bg-[#0A0A0A] border border-white/5 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500 tabular-nums">
                        {entry.time ? new Date(entry.time).toLocaleString('zh-CN', { hour12: false }) : '—'}
                      </span>
                      <Tag color={RESULT_TAG_COLOR[k]} className="!m-0 !text-[10px] !font-black !rounded-lg">{RESULT_LABEL[k]}</Tag>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-white font-medium truncate">{entry.source || '本地索引'}</span>
                      <span className="text-gray-400 tabular-nums shrink-0">{entry.elapsed || '—'}</span>
                    </div>
                  </div>
                );
              })}
              <div className="px-1 py-2 text-[11px] text-gray-500">
                显示最近 {syncHistory.length} 条记录
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
