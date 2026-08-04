import { useState, useEffect, useRef, useCallback } from 'react';
import { syncCrawl, syncTags } from '../services/api.js';

// 同步状态 hook：管理进度、日志、历史记录与取消。
// 后端同步为一次性请求（非流式），故进度采用模拟递进 + 完成时置 100%。
export function useSync(message, onSyncDone) {
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [syncStats, setSyncStats] = useState({ added: 0, total: 0, skipped: 0 });
  const [syncHistory, setSyncHistory] = useState([]);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const startRef = useRef(0);
  const progressRef = useRef(null);
  const onDoneRef = useRef(onSyncDone);
  onDoneRef.current = onSyncDone;

  // 计时器：每秒更新已运行时长
  useEffect(() => {
    if (!syncing) return undefined;
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [syncing]);

  // 模拟进度递进：逼近 90% 后等待真实完成
  useEffect(() => {
    if (!syncing) return undefined;
    progressRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return Math.min(90, p + Math.max(1, Math.round((90 - p) * 0.08)));
      });
    }, 600);
    return () => clearInterval(progressRef.current);
  }, [syncing]);

  // 同步未完成时离开页面提醒
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

  const reset = useCallback(() => {
    setSyncing(false);
    setProgress(0);
    setElapsed(0);
    if (progressRef.current) clearInterval(progressRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // 追加一条同步日志到历史表（供同步中心表格展示）
  const pushHistory = useCallback((entry) => {
    setSyncHistory((prev) => [entry, ...prev].slice(0, 20));
  }, []);

  // 启动同步：type='crawl' 全量抓取；type='tags' 多标签并行
  const startSync = useCallback(async ({ type, tags, pages = 1 }) => {
    if (syncing) return;
    setSyncing(true);
    setProgress(0);
    setElapsed(0);
    setSyncStats({ added: 0, total: 0, skipped: 0 });
    startRef.current = Date.now();

    const isTagSync = type === 'tags' && Array.isArray(tags) && tags.length > 0;
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus(isTagSync ? `正在同步 ${tags.length} 个标签…` : '正在全量同步…');
    setSyncLogs(isTagSync
      ? `开始同步 ${tags.length} 个标签: ${tags.join(', ')}\n`
      : '开始全量抓取列表…\n');
    if (message) message.info({ content: '已开始后台同步，可继续浏览；请勿刷新页面', duration: 3 });

    try {
      const data = isTagSync
        ? await syncTags(tags, pages, controller.signal)
        : await syncCrawl(1, 1, controller.signal);

      if (data.error) {
        setSyncLogs((p) => p + '失败：' + data.error + '\n');
        if (message) message.error('同步失败：' + data.error);
        setStatus('同步失败');
        pushHistory({
          time: new Date().toISOString(),
          source: isTagSync ? `标签: ${tags.join(',')}` : '全量同步',
          op: isTagSync ? '标签同步' : '全量同步',
          result: '失败',
          elapsed: ((Date.now() - startRef.current) / 1000).toFixed(2) + 's',
        });
        reset();
        return;
      }

      const logTail = (data.logs || []).join('\n');
      setSyncLogs(logTail + `\n完成：新增 ${data.added || 0} 条，共 ${data.total || 0} 条\n`);
      setSyncStats({ added: data.added || 0, total: data.total || 0, skipped: 0 });
      setProgress(100);
      setStatus(`同步完成：+${data.added || 0}，共 ${data.total || 0} 条`);
      setLastSyncAt(new Date().toISOString());
      if (message) message.success(`同步完成：+${data.added || 0}，共 ${data.total || 0} 条`);
      pushHistory({
        time: new Date().toISOString(),
        source: isTagSync ? `标签: ${tags.join(',')}` : '本地索引',
        op: isTagSync ? '标签同步' : '全量同步',
        result: '成功',
        elapsed: ((Date.now() - startRef.current) / 1000).toFixed(2) + 's',
      });
      if (onDoneRef.current) onDoneRef.current();
    } catch (e) {
      if (e && e.name === 'AbortError') {
        setStatus('已取消同步');
        setSyncLogs((p) => p + '用户取消同步\n');
      } else {
        setSyncLogs((p) => p + '请求失败：' + (e && e.message) + '\n');
        if (message) message.error('网络异常：' + (e && e.message));
        setStatus('同步失败');
      }
      pushHistory({
        time: new Date().toISOString(),
        source: isTagSync ? `标签: ${tags.join(',')}` : '本地索引',
        op: isTagSync ? '标签同步' : '全量同步',
        result: e && e.name === 'AbortError' ? '取消' : '失败',
        elapsed: ((Date.now() - startRef.current) / 1000).toFixed(2) + 's',
      });
    } finally {
      // 延迟关闭状态，让 100% 进度短暂停留
      setTimeout(() => reset(), 800);
    }
  }, [syncing, message, pushHistory, reset]);

  // 取消同步
  const cancelSync = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return {
    syncing, syncLogs, status, progress, elapsed, syncStats,
    syncHistory, lastSyncAt,
    startSync, cancelSync,
  };
}
