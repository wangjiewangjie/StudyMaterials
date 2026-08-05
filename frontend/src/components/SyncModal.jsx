import { useEffect, useRef } from 'react';
import { Modal, Button } from 'antd';
import {
  SyncOutlined, CloseOutlined, ClockCircleOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';

// 同步进度模态框：对齐设计稿，居中展示总进度 / 统计 / 实时日志。
// 受控组件：open / onCancel / onBackground 由父组件管理；进度数据从 useSync 传入。
export default function SyncModal({
  open,
  status,
  progress,
  elapsed,
  syncStats,
  syncLogs,
  onCancel,
  onBackground,
}) {
  const logRef = useRef(null);

  // 日志追加时自动滚动到底部
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [syncLogs]);

  // 已运行时长格式化 HH:MM:SS
  const elapsedLabel = (() => {
    const sec = Math.floor(elapsed / 1000);
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  })();

  const pct = Math.min(100, Math.max(0, Math.round(progress || 0)));
  const isDone = pct >= 100;

  return (
    <Modal
      open={open}
      onCancel={onBackground}
      footer={null}
      width={Math.min(720, typeof window !== 'undefined' ? window.innerWidth - 32 : 720)}
      destroyOnClose
      centered
      closable={false}
      modalRender={(node) => (
        <div className="sync-modal-card relative w-full bg-ph-header border border-white/10 rounded-lg shadow-2xl shadow-black overflow-hidden">
          {/* 顶部装饰渐变条 */}
          <div className="h-1 w-full" style={{ background: 'var(--g-orange-bar)' }} />
          {node}
        </div>
      )}
    >
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-white/5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-lg flex items-center justify-center border border-ph-orange/30" style={{ background: 'var(--g-orange-soft)' }}>
            <SyncOutlined className="text-ph-orange text-xl" spin={!isDone} />
            {!isDone && (
              <div className="absolute inset-0 rounded-lg border border-ph-orange/20 animate-ping opacity-30" />
            )}
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white">
              {isDone ? '同步已完成' : '正在同步数据索引'}
            </h2>
            <p className="text-xs text-gray-400">
              {isDone ? '本次同步任务已结束，可关闭窗口' : '请勿关闭窗口，后台正在拉取最新节点数据'}
            </p>
          </div>
        </div>
        <Button
          type="text"
          size="middle"
          onClick={onBackground}
          icon={<CloseOutlined style={{ fontSize: 14 }} />}
          className="app-btn-icon !bg-white/5 hover:!bg-white/10 !border !border-white/10 !text-gray-400 hover:!text-white shrink-0"
          aria-label="后台运行"
          title="后台运行"
        />
      </div>

      {/* Body */}
      <div className="p-5 sm:p-6 space-y-6">
        {/* 总进度条 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white">{status || (isDone ? '同步完成' : '正在同步…')}</span>
            <span className="font-black text-ph-orange tabular-nums">{pct}%</span>
          </div>
          <div className="h-2.5 bg-ph-panelAlt rounded-lg overflow-hidden border border-white/5">
            <div
              className="h-full rounded-lg relative transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%`, background: 'var(--g-orange-bar)' }}
            >
              {!isDone && (
                <div className="absolute inset-0 bg-white/20 sync-progress-shimmer" />
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>
              已处理 {syncStats.added + syncStats.skipped} / {syncStats.total || '—'} 条索引
            </span>
            <span>{isDone ? '已完成' : '运行中'}</span>
          </div>
        </div>

        {/* 统计四宫格 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#121212] border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">新增</div>
            <div className="text-lg font-black text-emerald-400 tabular-nums">
              {syncStats.added ?? 0}
            </div>
          </div>
          <div className="bg-[#121212] border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">失败</div>
            <div className="text-lg font-black text-red-400 tabular-nums">0</div>
          </div>
          <div className="bg-[#121212] border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">跳过</div>
            <div className="text-lg font-black text-ph-orange-light tabular-nums">
              {syncStats.skipped ?? 0}
            </div>
          </div>
          <div className="bg-[#121212] border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">总计</div>
            <div className="text-lg font-black text-white tabular-nums">
              {syncStats.total ?? 0}
            </div>
          </div>
        </div>

        {/* 安全提示 */}
        <div className="notice-soft !p-3">
          <SafetyCertificateOutlined className="text-ph-orange shrink-0" style={{ fontSize: 14 }} />
          <p className="text-[11px] text-gray-400 leading-tight m-0">
            同步过程使用只读模式，不会修改你的收藏配置或远端数据源。所有通信均通过加密通道进行。
          </p>
        </div>

        {/* 实时日志 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">实时日志</span>
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <span className={`w-1.5 h-1.5 bg-emerald-400 rounded-lg ${isDone ? '' : 'animate-pulse'}`} />
              {isDone ? '已结束' : '运行中'}
            </span>
          </div>
          <pre
            ref={logRef}
            className="sync-log-box bg-[#050505] border border-white/5 rounded-lg p-3 font-mono text-[11px] leading-relaxed h-40 overflow-y-auto text-gray-400 whitespace-pre-wrap m-0"
          >
            {syncLogs || '准备中…'}
          </pre>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 sm:p-6 border-t border-white/5 bg-[#121212]/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <ClockCircleOutlined style={{ fontSize: 12 }} />
          <span>已运行 <span className="tabular-nums">{elapsedLabel}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="middle"
            onClick={onBackground}
            className="!flex-1 sm:!flex-none !font-bold !bg-white/5 hover:!bg-white/10 !text-gray-300 !border-white/10"
          >
            后台运行
          </Button>
          <Button
            size="middle"
            danger
            onClick={onCancel}
            disabled={isDone}
            className="!flex-1 sm:!flex-none !font-bold !bg-red-500/10 hover:!bg-red-500/20 !text-red-400 !border !border-red-500/30"
          >
            取消同步
          </Button>
        </div>
      </div>
    </Modal>
  );
}
