import { useState, useEffect, useRef, useCallback } from 'react';
import { syncCrawl, syncKeywords } from '../services/api.js';
import { formatElapsedShort } from '../utils/format.js';
import {
  SYNC_TICK_MS,
  SYNC_BATCH_POLL_MS,
  SYNC_RESET_DELAY_MS,
  HISTORY_MAX,
} from '../constants/timing.js';

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function uniqueKeywordsFromInput(keywordsInput) {
  const keywords = String(keywordsInput || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  return keywords.filter((kw) => {
    if (seen.has(kw)) return false;
    seen.add(kw);
    return true;
  });
}

/**
 * 同步状态：进度、日志、历史与取消。
 * onSyncDone：结束回调；onBatch：SSE 批次时静默刷新列表。
 */
export function useSync(message, onSyncDone, onBatch) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [syncStats, setSyncStats] = useState({ added: 0, total: 0, skipped: 0 });
  const [syncHistory, setSyncHistory] = useState([]);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [isKeywordSyncing, setIsKeywordSyncing] = useState(false);
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

  useEffect(() => {
    if (!isSyncing) return undefined;
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, SYNC_TICK_MS);
    return () => clearInterval(timerRef.current);
  }, [isSyncing]);

  useEffect(() => {
    if (!isSyncing && !isKeywordSyncing) return undefined;

    onBatchRef.current?.();

    if (typeof EventSource === 'undefined') {
      const pollId = setInterval(() => {
        onBatchRef.current?.();
      }, SYNC_BATCH_POLL_MS);
      return () => clearInterval(pollId);
    }

    let es;
    try {
      es = new EventSource('/api/sync-events');
      esRef.current = es;
      es.onmessage = (ev) => {
        onBatchRef.current?.();
        let payload;
        try {
          payload = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (payload?.type === 'progress' && payload.detailsTotal > 0) {
          const next = Math.round((payload.detailsDone / payload.detailsTotal) * 90);
          setProgress((prev) => Math.min(90, Math.max(prev, next)));
        }
      };
    } catch {
      // EventSource 不可用时忽略
    }

    return () => {
      if (es) {
        try { es.close(); } catch { /* ignore */ }
      }
      esRef.current = null;
    };
  }, [isSyncing, isKeywordSyncing]);

  useEffect(() => {
    if (!isSyncing) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '同步尚未完成，离开页面会中断任务。确定要离开吗？';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isSyncing]);

  const reset = useCallback(() => {
    setIsSyncing(false);
    setProgress(0);
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const pushHistory = useCallback((entry) => {
    setSyncHistory((prev) => [entry, ...prev].slice(0, HISTORY_MAX));
  }, []);

  const startSync = useCallback(async () => {
    if (isSyncing || isKeywordSyncing) return;
    setIsSyncing(true);
    setProgress(0);
    setElapsed(0);
    setSyncStats({ added: 0, total: 0, skipped: 0 });
    startRef.current = Date.now();

    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('正在全量同步…');
    setSyncLogs('开始全量抓取列表…\n');
    message?.info({ content: '已开始后台同步，可继续浏览；请勿刷新页面', duration: 3 });

    try {
      const data = await syncCrawl(1, 1, controller.signal);

      if (data.error) {
        setSyncLogs((prev) => `${prev}失败：${data.error}\n`);
        message?.error(`同步失败：${data.error}`);
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

      const added = data.added || 0;
      const total = data.total || 0;
      const logTail = (data.logs || []).join('\n');
      setSyncLogs(`${logTail}\n完成：新增 ${added} 条，共 ${total} 条\n`);
      setSyncStats({ added, total, skipped: 0 });
      setProgress(100);
      setStatus(`同步完成：+${added}，共 ${total} 条`);
      setLastSyncAt(new Date().toISOString());
      message?.success(`同步完成：+${added}，共 ${total} 条`);
      pushHistory({
        time: new Date().toISOString(),
        source: '本地索引',
        op: '全量同步',
        result: '成功',
        elapsed: formatElapsedShort(Date.now() - startRef.current),
      });
      onDoneRef.current?.();
    } catch (error) {
      if (isAbortError(error)) {
        setStatus('已取消同步');
        setSyncLogs((prev) => `${prev}用户取消同步\n`);
      } else {
        setSyncLogs((prev) => `${prev}请求失败：${error?.message}\n`);
        message?.error(`网络异常：${error?.message}`);
        setStatus('同步失败');
      }
      pushHistory({
        time: new Date().toISOString(),
        source: '本地索引',
        op: '全量同步',
        result: isAbortError(error) ? '取消' : '失败',
        elapsed: formatElapsedShort(Date.now() - startRef.current),
      });
    } finally {
      setTimeout(() => reset(), SYNC_RESET_DELAY_MS);
    }
  }, [isSyncing, isKeywordSyncing, message, pushHistory, reset]);

  const cancelSync = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startKeywordSync = useCallback(async (keywordsInput) => {
    if (isKeywordSyncing || isSyncing) return;

    const uniqueKeywords = uniqueKeywordsFromInput(keywordsInput);
    if (uniqueKeywords.length === 0) {
      message?.warning('请输入至少一个关键词');
      return;
    }

    setIsKeywordSyncing(true);
    setKeywordResults(uniqueKeywords.map((kw) => ({
      keyword: kw,
      status: 'running',
      added: 0,
      exhausted: false,
      error: null,
    })));

    const controller = new AbortController();
    keywordAbortRef.current = controller;
    message?.info({ content: `开始同步 ${uniqueKeywords.length} 个关键词`, duration: 3 });

    try {
      const data = await syncKeywords(uniqueKeywords, controller.signal);

      if (data.error) {
        message?.error(`关键词同步失败：${data.error}`);
        setKeywordResults(uniqueKeywords.map((kw) => ({
          keyword: kw,
          status: 'error',
          added: 0,
          exhausted: false,
          error: data.error,
        })));
        return;
      }

      const resultMap = new Map((data.results || []).map((r) => [r.keyword, r]));
      const newResults = uniqueKeywords.map((kw) => {
        const row = resultMap.get(kw);
        if (!row) {
          return { keyword: kw, status: 'error', added: 0, exhausted: false, error: '未返回结果' };
        }
        if (row.error) {
          return {
            keyword: kw,
            status: 'error',
            added: row.added || 0,
            exhausted: false,
            error: row.error,
          };
        }
        return {
          keyword: kw,
          status: 'done',
          added: row.added || 0,
          crawled: row.crawled || 0,
          exhausted: !!row.exhausted,
          page: row.page || 0,
          error: null,
        };
      });
      setKeywordResults(newResults);

      for (const row of newResults) {
        if (row.status === 'error') {
          message?.error(`关键词「${row.keyword}」同步失败：${row.error}`);
        } else if (row.exhausted) {
          message?.warning(`关键词「${row.keyword}」已全部抓取完成，没有更多数据`);
        } else if (row.added > 0) {
          message?.success(`关键词「${row.keyword}」新增 ${row.added} 条`);
        }
      }

      message?.success(`关键词同步完成：共新增 ${data.totalAdded || 0} 条`);
      pushHistory({
        time: new Date().toISOString(),
        source: `关键词: ${uniqueKeywords.join(',')}`,
        op: '关键词同步',
        result: '成功',
        elapsed: '—',
      });
      onDoneRef.current?.();
    } catch (error) {
      if (isAbortError(error)) {
        message?.info('关键词同步已取消');
        setKeywordResults((prev) => prev.map((r) => ({ ...r, status: 'canceled' })));
      } else {
        message?.error(`网络异常：${error?.message}`);
        setKeywordResults((prev) => prev.map((r) => ({
          ...r,
          status: 'error',
          error: error?.message,
        })));
      }
    } finally {
      setIsKeywordSyncing(false);
    }
  }, [isKeywordSyncing, isSyncing, message, pushHistory]);

  const cancelKeywordSync = useCallback(() => {
    keywordAbortRef.current?.abort();
  }, []);

  return {
    isSyncing,
    syncLogs,
    status,
    progress,
    elapsed,
    syncStats,
    syncHistory,
    lastSyncAt,
    startSync,
    cancelSync,
    isKeywordSyncing,
    keywordResults,
    startKeywordSync,
    cancelKeywordSync,
  };
}
