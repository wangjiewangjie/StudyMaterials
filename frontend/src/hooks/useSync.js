import { useState, useEffect, useRef, useCallback } from 'react';
import { syncCrawl, syncKeywords } from '../services/api.js';
import { formatElapsedShort } from '../utils/format.js';

// 同步状态 hook：管理进度、日志、历史记录与取消。
// 只做已运行计时；进度由后端 detailsDone/detailsTotal 或完成时置 100%。
// onSyncDone：同步结束回调；onBatch：SSE 批次时静默刷新列表。
export function useSync(message, onSyncDone, onBatch) {
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [syncStats, setSyncStats] = useState({ added: 0, total: 0, skipped: 0 });
  const [syncHistory, setSyncHistory] = useState([]);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [keywordSyncing, setKeywordSyncing] = useState(false);
  const [keywordResults, setKeywordResults] = useState([]);

  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const startRef = useRef(0);
  const esRef = useRef(null);
  const keywordAbortRef = useRef(null);
  const onDoneRef = useRef(onSyncDone);
  const onBatchRef = useRef(onBatch);
  onDoneRef.current = onSyncDone;
  onBatchRef.current = onBatch;

  // 仅计时：已运行毫秒
  useEffect(() => {
    if (!syncing) return undefined;
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [syncing]);

  // 单一 EventSource：进度比例 + 列表静默刷新
  useEffect(() => {
    if (!syncing && !keywordSyncing) return undefined;

    if (onBatchRef.current) onBatchRef.current();

    if (typeof EventSource === 'undefined') {
      const t = setInterval(() => {
        if (onBatchRef.current) onBatchRef.current();
      }, 5000);
      return () => clearInterval(t);
    }

    let es;
    try {
      es = new EventSource('/api/sync-events');
      esRef.current = es;
      es.onmessage = (ev) => {
        if (onBatchRef.current) onBatchRef.current();
        let d;
        try { d = JSON.parse(ev.data); } catch (_) { return; }
        if (d && d.type === 'progress' && d.detailsTotal > 0) {
          setProgress((p) => Math.min(90, Math.max(p, Math.round((d.detailsDone / d.detailsTotal) * 90))));
        }
      };
    } catch (_) { /* 不支持 EventSource 时忽略 */ }

    return () => {
      if (es) { try { es.close(); } catch (_) {} }
      esRef.current = null;
    };
  }, [syncing, keywordSyncing]);

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
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const pushHistory = useCallback((entry) => {
    setSyncHistory((prev) => [entry, ...prev].slice(0, 20));
  }, []);

  const startSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setProgress(0);
    setElapsed(0);
    setSyncStats({ added: 0, total: 0, skipped: 0 });
    startRef.current = Date.now();

    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('正在全量同步…');
    setSyncLogs('开始全量抓取列表…\n');
    if (message) message.info({ content: '已开始后台同步，可继续浏览；请勿刷新页面', duration: 3 });

    try {
      const data = await syncCrawl(1, 1, controller.signal);

      if (data.error) {
        setSyncLogs((p) => p + '失败：' + data.error + '\n');
        if (message) message.error('同步失败：' + data.error);
        setStatus('同步失败');
        pushHistory({
          time: new Date().toISOString(),
          source: '全量同步',
          op: '全量同步',
          result: '失败',
          elapsed: formatElapsedShort(Date.now() - startRef.current),
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
        source: '本地索引',
        op: '全量同步',
        result: '成功',
        elapsed: formatElapsedShort(Date.now() - startRef.current),
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
        source: '本地索引',
        op: '全量同步',
        result: e && e.name === 'AbortError' ? '取消' : '失败',
        elapsed: formatElapsedShort(Date.now() - startRef.current),
      });
    } finally {
      setTimeout(() => reset(), 800);
    }
  }, [syncing, message, pushHistory, reset]);

  const cancelSync = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const startKeywordSync = useCallback(async (keywordsInput) => {
    if (keywordSyncing) return;

    const keywords = String(keywordsInput || '')
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const seen = new Set();
    const uniqueKeywords = keywords.filter((k) => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (uniqueKeywords.length === 0) {
      if (message) message.warning('请输入至少一个关键词');
      return;
    }

    setKeywordSyncing(true);
    setKeywordResults(uniqueKeywords.map((kw) => ({ keyword: kw, status: 'running', added: 0, exhausted: false, error: null })));

    const controller = new AbortController();
    keywordAbortRef.current = controller;

    if (message) message.info({ content: `开始同步 ${uniqueKeywords.length} 个关键词`, duration: 3 });

    try {
      const data = await syncKeywords(uniqueKeywords, controller.signal);

      if (data.error) {
        if (message) message.error('关键词同步失败：' + data.error);
        setKeywordResults(uniqueKeywords.map((kw) => ({ keyword: kw, status: 'error', added: 0, exhausted: false, error: data.error })));
        return;
      }

      const resultMap = new Map((data.results || []).map((r) => [r.keyword, r]));
      const newResults = uniqueKeywords.map((kw) => {
        const r = resultMap.get(kw);
        if (!r) return { keyword: kw, status: 'error', added: 0, exhausted: false, error: '未返回结果' };
        if (r.error) return { keyword: kw, status: 'error', added: r.added || 0, exhausted: false, error: r.error };
        return {
          keyword: kw,
          status: 'done',
          added: r.added || 0,
          crawled: r.crawled || 0,
          exhausted: !!r.exhausted,
          page: r.page || 0,
          error: null,
        };
      });
      setKeywordResults(newResults);

      for (const r of newResults) {
        if (r.status === 'error') {
          if (message) message.error(`关键词「${r.keyword}」同步失败：${r.error}`);
        } else if (r.exhausted) {
          if (message) message.warning(`关键词「${r.keyword}」已全部抓取完成，没有更多数据`);
        } else if (r.added > 0) {
          if (message) message.success(`关键词「${r.keyword}」新增 ${r.added} 条`);
        }
      }

      const totalAdded = data.totalAdded || 0;
      if (message) message.success(`关键词同步完成：共新增 ${totalAdded} 条`);

      pushHistory({
        time: new Date().toISOString(),
        source: `关键词: ${uniqueKeywords.join(',')}`,
        op: '关键词同步',
        result: '成功',
        elapsed: '—',
      });

      if (onDoneRef.current) onDoneRef.current();
    } catch (e) {
      if (e && e.name === 'AbortError') {
        if (message) message.info('关键词同步已取消');
        setKeywordResults((prev) => prev.map((r) => ({ ...r, status: 'canceled' })));
      } else {
        if (message) message.error('网络异常：' + (e && e.message));
        setKeywordResults((prev) => prev.map((r) => ({ ...r, status: 'error', error: e && e.message })));
      }
    } finally {
      setKeywordSyncing(false);
    }
  }, [keywordSyncing, message, pushHistory]);

  const cancelKeywordSync = useCallback(() => {
    if (keywordAbortRef.current) keywordAbortRef.current.abort();
  }, []);

  return {
    syncing, syncLogs, status, progress, elapsed, syncStats,
    syncHistory, lastSyncAt,
    startSync, cancelSync,
    keywordSyncing, keywordResults,
    startKeywordSync, cancelKeywordSync,
  };
}
