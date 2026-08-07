import { useState, useEffect, useRef, useCallback } from 'react';
import { syncCrawl, syncTags, syncKeywords, fetchCrawlEstimate } from '../services/api.js';

function formatClockMs(ms) {
  const sec = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 同步状态 hook：管理进度、日志、历史记录与取消。
// 后端同步为一次性请求（非流式），进度按预估耗时推进，完成时置 100%。
export function useSync(message, onSyncDone) {
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [etaMs, setEtaMs] = useState(0);
  const [etaLabel, setEtaLabel] = useState('');
  const [remainingMs, setRemainingMs] = useState(0);
  const [syncStats, setSyncStats] = useState({ added: 0, total: 0, skipped: 0 });
  const [syncHistory, setSyncHistory] = useState([]);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const startRef = useRef(0);
  const etaMsRef = useRef(0);
  const onDoneRef = useRef(onSyncDone);
  onDoneRef.current = onSyncDone;

  // 计时器：已运行 + 预计剩余 + 按 ETA 推进进度
  useEffect(() => {
    if (!syncing) return undefined;
    timerRef.current = setInterval(() => {
      const elapsedNow = Date.now() - startRef.current;
      setElapsed(elapsedNow);
      const total = etaMsRef.current;
      if (total > 0) {
        setRemainingMs(Math.max(0, total - elapsedNow));
        setProgress((p) => {
          if (p >= 90) return p;
          const byEta = Math.min(90, Math.round((elapsedNow / total) * 90));
          return Math.max(p, byEta);
        });
      } else {
        setRemainingMs(0);
        setProgress((p) => (p >= 90 ? p : Math.min(90, p + Math.max(1, Math.round((90 - p) * 0.08)))));
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
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
    setEtaMs(0);
    setEtaLabel('');
    setRemainingMs(0);
    etaMsRef.current = 0;
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
    setEtaMs(0);
    setEtaLabel('');
    setRemainingMs(0);
    etaMsRef.current = 0;
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

    // 爬取前预估耗时
    try {
      const est = await fetchCrawlEstimate(
        isTagSync
          ? { mode: 'tags', tags: tags.length, pages }
          : { mode: 'sync', pageStart: 1, pageEnd: 1 },
        controller.signal,
      );
      if (est && est.estimateMs) {
        etaMsRef.current = est.estimateMs;
        setEtaMs(est.estimateMs);
        setEtaLabel(est.estimateLabel || '');
        setRemainingMs(est.estimateMs);
        const range = est.rangeLabel ? `（约 ${est.rangeLabel}）` : '';
        const expect = est.expectedArticles ? `，约 ${est.expectedArticles} 条` : '';
        setSyncLogs((p) => `${p}预计耗时约 ${est.estimateLabel}${range}${expect}\n`);
        setStatus(`预计约 ${est.estimateLabel} · 剩余 ${formatClockMs(est.estimateMs)}`);
      }
    } catch (_) {
      // 预估失败不影响同步
    }

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
      setRemainingMs(0);
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

  // ===== 关键词同步 =====
  const [keywordSyncing, setKeywordSyncing] = useState(false);
  const [keywordResults, setKeywordResults] = useState([]);
  const keywordAbortRef = useRef(null);

  // 启动关键词同步：keywords 为字符串（逗号分隔），内部拆分为数组
  const startKeywordSync = useCallback(async (keywordsInput) => {
    if (keywordSyncing) return;

    // 解析关键词：逗号分隔 + 去空白 + 去空 + 去重
    const keywords = String(keywordsInput || '')
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // 去重（保留顺序）
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

      // 更新每个关键词的结果状态
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

      // 逐个提示耗尽和错误
      for (const r of newResults) {
        if (r.status === 'error') {
          if (message) message.error(`关键词「${r.keyword}」同步失败：${r.error}`);
        } else if (r.exhausted) {
          if (message) message.warning(`关键词「${r.keyword}」已全部抓取完成，没有更多数据`);
        } else if (r.added > 0) {
          if (message) message.success(`关键词「${r.keyword}」新增 ${r.added} 条`);
        }
      }

      // 总计提示
      const totalAdded = data.totalAdded || 0;
      if (message) message.success(`关键词同步完成：共新增 ${totalAdded} 条`);

      // 推入同步历史
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

  // 取消关键词同步
  const cancelKeywordSync = useCallback(() => {
    if (keywordAbortRef.current) keywordAbortRef.current.abort();
  }, []);

  return {
    syncing, syncLogs, status, progress, elapsed, etaMs, etaLabel, remainingMs, syncStats,
    syncHistory, lastSyncAt,
    startSync, cancelSync,
    // 关键词同步
    keywordSyncing, keywordResults,
    startKeywordSync, cancelKeywordSync,
  };
}
