/**
 * DataManagePanel — 数据目录、整库备份、缓存清理
 * 放在同步中心底部；导入成功后由 onImported 触发前端刷新。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, App as AntdApp, Typography } from 'antd';
import {
  FolderOpenOutlined, DownloadOutlined, UploadOutlined,
  DeleteOutlined, ReloadOutlined, DatabaseOutlined,
} from '@ant-design/icons';
import {
  fetchDataInfo,
  openDataFolder,
  downloadDataBackup,
  importDataBackup,
  clearMediaCache,
} from '../services/api.js';

export default function DataManagePanel({ onImported }) {
  const { message, modal } = AntdApp.useApp();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDataInfo();
      setInfo(data);
    } catch (e) {
      message.error(e?.message || '获取数据信息失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleOpenFolder = async () => {
    setBusy('open');
    try {
      const r = await openDataFolder();
      if (r?.ok) message.success('已打开数据文件夹');
      else message.warning(r?.error || '打开失败');
    } catch (e) {
      message.error(e?.message || '打开失败');
    } finally {
      setBusy('');
    }
  };

  const handleExport = () => {
    downloadDataBackup();
    message.success('已开始下载备份文件');
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    setBusy('import');
    try {
      const text = await file.text();
      const doc = JSON.parse(text);
      modal.confirm({
        title: '确认导入整库备份？',
        content: (
          <div className="text-sm text-ph-text-secondary space-y-1">
            <p className="m-0">将覆盖当前索引、收藏、站点配置与播放进度。</p>
            <p className="m-0 text-ph-text-muted">
              备份时间：{doc.exportedAt ? new Date(doc.exportedAt).toLocaleString('zh-CN') : '未知'}
              {' · '}
              索引 {Array.isArray(doc.index) ? doc.index.length : 0} 条
              {' · '}
              收藏 {Array.isArray(doc.favorites) ? doc.favorites.length : 0} 条
            </p>
          </div>
        ),
        okText: '导入',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          const r = await importDataBackup(doc);
          if (!r?.ok) throw new Error(r?.error || '导入失败');
          message.success(
            `导入完成：索引 ${r.indexCount} · 收藏 ${r.favoritesCount} · 站点 ${r.sitesCount}`,
          );
          await refresh();
          onImported?.();
        },
      });
    } catch (e) {
      message.error(e?.message || '无法解析备份文件');
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleClearCache = () => {
    modal.confirm({
      title: '清除媒体缓存？',
      content: `将删除封面/图集缓存（约 ${info?.cacheLabel || '—'}），不影响索引与收藏。`,
      okText: '清除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setBusy('cache');
        try {
          const r = await clearMediaCache();
          message.success(`已清除 ${r.removed || 0} 个文件，释放 ${r.freedLabel || '0 B'}`);
          await refresh();
        } catch (e) {
          message.error(e?.message || '清除失败');
        } finally {
          setBusy('');
        }
      },
    });
  };

  const archives = info?.syncLogArchives || [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="section-title m-0">数据与备份</h2>
        <Button
          size="small"
          icon={<ReloadOutlined spin={loading} />}
          onClick={refresh}
          disabled={loading}
          className="!bg-white/5 !border-white/10 !text-ph-text-muted"
        >
          刷新
        </Button>
      </div>

      <div className="surface-card p-4 sm:p-5 space-y-4">
        <div className="flex items-start gap-2.5">
          <DatabaseOutlined className="text-ph-orange mt-0.5 shrink-0" style={{ fontSize: 16 }} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-xs font-bold text-ph-text-tertiary uppercase tracking-wider">
              数据目录
            </div>
            <Typography.Paragraph
              copyable={info?.dataDir ? { text: info.dataDir } : false}
              className="!mb-0 !text-sm !text-white !font-mono !break-all"
            >
              {info?.dataDir || (loading ? '读取中…' : '—')}
            </Typography.Paragraph>
            <p className="text-[11px] text-ph-text-muted m-0 leading-relaxed">
              数据总量 {info?.dataLabel || '—'}
              {' · '}
              索引 {info?.indexCount ?? '—'}
              {' · '}
              收藏 {info?.favoritesCount ?? '—'}
              {' · '}
              站点 {info?.sitesCount ?? '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleOpenFolder}
            loading={busy === 'open'}
            className="!bg-ph-orange/10 !border-ph-orange/30 !text-ph-orange !font-bold"
          >
            打开文件夹
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            className="!bg-white/5 !border-white/10 !text-white !font-bold"
          >
            导出整库
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={() => fileRef.current?.click()}
            loading={busy === 'import'}
            className="!bg-white/5 !border-white/10 !text-white !font-bold"
          >
            导入整库
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => handleImportFile(e.target.files?.[0])}
          />
        </div>

        <div className="border-t border-white/5 pt-4 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-bold text-white">媒体缓存</div>
              <p className="text-[11px] text-ph-text-muted m-0">
                {info?.cacheLabel || '—'} · {info?.cacheFiles ?? 0} 个文件（封面/图集）
              </p>
            </div>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleClearCache}
              loading={busy === 'cache'}
              disabled={!info?.cacheBytes}
              className="!font-bold"
            >
              清除缓存
            </Button>
          </div>
        </div>

        <div className="border-t border-white/5 pt-4 space-y-2">
          <div className="text-sm font-bold text-white">同步日志归档</div>
          <p className="text-[11px] text-ph-text-muted m-0 leading-relaxed">
            每次启动会把上一会话日志归档到 sync-logs/，默认保留 {info?.syncLogRetainDays ?? 7} 天。
            目录：{info?.syncLogArchiveDir || '—'}
          </p>
          {archives.length === 0 ? (
            <p className="text-[11px] text-ph-text-tertiary m-0">暂无历史归档（下次重启后可见上一会话）</p>
          ) : (
            <ul className="m-0 pl-4 text-[11px] text-ph-text-secondary space-y-1 max-h-28 overflow-y-auto scroll-contain">
              {archives.slice(0, 8).map((a) => (
                <li key={a.name} className="font-mono truncate" title={a.path}>
                  {a.name}
                  <span className="text-ph-text-muted"> · {a.count} 条</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
