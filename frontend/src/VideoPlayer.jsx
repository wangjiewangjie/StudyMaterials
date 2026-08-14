import { useEffect, useRef, useReducer, useCallback } from 'react';
import { Spin, Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import {
  unwrapCdnProxyUrl, normalizeUpstreamUrl, proxyUrl,
  isAlreadyProxied, shouldProxy,
} from './utils/hls-url.js';
import { refreshVideo } from './services/api.js';

const HLS_TIMEOUTS = {
  // CDN + 本地代理可能较慢；默认值（10s/20s）会触发超时错误。
  manifestLoadingTimeOut: 60000,
  manifestLoadingMaxRetry: 3,
  manifestLoadingRetryDelay: 1500,
  levelLoadingTimeOut: 60000,
  levelLoadingMaxRetry: 3,
  levelLoadingRetryDelay: 1500,
  fragLoadingTimeOut: 90000,
  fragLoadingMaxRetry: 4,
  fragLoadingRetryDelay: 1500,
};

function logPlayer(...args) {
  console.error('[VideoPlayer]', ...args);
}

// ---------- 播放器彻底销毁 ----------
// 目标：在播放新视频前，100% 终止上一个视频的播放进程（音频叠加的根因）。
// 旧实现的缺陷：hls.destroy() 一旦抛错，art.destroy() 会被跳过，而 artRef 已被置空，
// 导致上一个 Artplayer 实例（及其 HLS MediaSource）彻底“丢失”且无法再次清理，
// HLS 致命错误处理里甚至可能 hls.startLoad() 继续出声。
// 这里拆分每一步、各自 try/catch，并在最后兜底移除容器内所有 <video> 节点。

function stopVideoElement(video) {
  if (!video) return;
  try { video.pause(); } catch (_) {}
  try { video.removeAttribute('src'); } catch (_) {}
  try { if (video.src) { video.removeAttribute('src'); video.load(); } } catch (_) {}
  try { video.load(); } catch (_) {}
}

/** 销毁单个 Artplayer 实例：暂停 → 销毁 HLS → 销毁 Artplayer → 兜底移除 DOM */
function teardownArt(art) {
  if (!art) return;
  // 1) 先强行暂停并清空底层 <video>，切断 MSE/音频来源
  try {
    const v = art.video || (art.template && art.template.$video);
    stopVideoElement(v);
  } catch (_) {}
  // 2) 销毁 HLS 实例（独立 try，避免一个失败连累另一个）
  try {
    if (art.hls) { art.hls.destroy(); art.hls = null; }
  } catch (_) {}
  // 3) 销毁 Artplayer 自身（内部 reset 会清空 src）
  try {
    art.destroy(true);
  } catch (_) {}
  // 4) 兜底：移除容器内所有残留 <video> 节点，彻底断开音频
  try {
    const cont = art.template && art.template.$container;
    if (cont) {
      const vids = cont.querySelectorAll('video');
      for (const vd of vids) {
        try { vd.pause(); } catch (_) {}
        try { vd.remove(); } catch (_) {}
      }
      cont.innerHTML = '';
    }
  } catch (_) {}
}

/** 清理容器：暂停并移除所有 <video>，防止任何游离节点继续出声 */
function clearContainer(container) {
  if (!container) return;
  try {
    const vids = container.querySelectorAll('video');
    for (const vd of vids) {
      try { vd.pause(); } catch (_) {}
      try { vd.remove(); } catch (_) {}
    }
    container.innerHTML = '';
  } catch (_) {}
}

// ---------- 播放器 UI 状态机 ----------
// 统一管理 phase / errorMsg / loadingTip / showSlowHint，替代散落的 useState + ref
const initialState = {
  phase: 'loading',       // idle | loading | ready | error | none
  errorMsg: '',
  loadingTip: '正在准备播放…',
  showSlowHint: false,
};

function playerReducer(state, action) {
  switch (action.type) {
    case 'INIT':
      return { ...state, phase: action.phase || 'loading', errorMsg: '', showSlowHint: false };
    case 'START_LOADING':
      return { ...state, phase: 'loading', errorMsg: '', showSlowHint: false, loadingTip: action.tip || '正在加载视频流…' };
    case 'SET_PHASE':
      return { ...state, phase: action.phase };
    case 'SET_ERROR':
      return { ...state, phase: 'error', errorMsg: action.msg || '', showSlowHint: false };
    case 'SET_TIP':
      return { ...state, loadingTip: action.tip };
    case 'SHOW_SLOW':
      return { ...state, showSlowHint: true };
    case 'HIDE_SLOW':
      return { ...state, showSlowHint: false };
    default:
      return state;
  }
}

// ---------- 播放进度记忆 ----------
const PROGRESS_KEY = (id) => `vp-progress:${id}`;
const PROGRESS_SAVE_INTERVAL = 5000; // 5s 防抖

function saveProgress(id, time) {
  if (time > 5) {
    try { localStorage.setItem(PROGRESS_KEY(id), String(time)); } catch (_) {}
  }
}

function loadProgress(id) {
  try { return parseFloat(localStorage.getItem(PROGRESS_KEY(id)) || '0'); }
  catch (_) { return 0; }
}

// 自定义 HLS.js 加载器：将跨域 CDN 请求路由到 CORS 代理
const ProxyLoader = (() => {
  const Base = Hls.DefaultConfig.loader;
  return class extends Base {
    load(context, config, callbacks) {
      const originalUrl = context.url;
      const upstreamUrl = normalizeUpstreamUrl(originalUrl);
      const proxied = shouldProxy(originalUrl) || (isAlreadyProxied(originalUrl) && /^https?:\/\//i.test(upstreamUrl));

      if (proxied) {
        context.url = proxyUrl(upstreamUrl);
      }

      const onSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
        if (proxied) {
          if (ctx) ctx.url = originalUrl;
          if (response) response.url = originalUrl;
        }
        onSuccess(response, stats, ctx, networkDetails);
      };

      const onError = callbacks.onError;
      callbacks.onError = (error, ctx, networkDetails) => {
        logPlayer('加载器错误', {
          url: originalUrl,
          upstreamUrl: upstreamUrl !== originalUrl ? upstreamUrl : undefined,
          proxiedUrl: proxied ? context.url : undefined,
          alreadyProxied: isAlreadyProxied(originalUrl),
          unwrappedFromCdnProxy: unwrapCdnProxyUrl(originalUrl) !== originalUrl,
          code: error && error.code,
          text: error && error.text,
          details: error,
        });
        onError(error, ctx, networkDetails);
      };

      const onTimeout = callbacks.onTimeout;
      if (typeof onTimeout === 'function') {
        callbacks.onTimeout = (stats, ctx, networkDetails) => {
          logPlayer('加载器超时', {
            url: originalUrl,
            upstreamUrl: upstreamUrl !== originalUrl ? upstreamUrl : undefined,
            proxiedUrl: proxied ? context.url : undefined,
            stats,
            timeoutMs: config && config.timeout,
          });
          onTimeout(stats, ctx, networkDetails);
        };
      }

      super.load(context, config, callbacks);
    }
  };
})();

function friendlyHlsError(data) {
  const details = (data && data.details) || '';
  if (/timeout/i.test(details) || details === 'manifestLoadTimeOut' || details === 'levelLoadTimeOut' || details === 'fragLoadTimeOut' || details === 'keyLoadTimeOut') {
    return '加载超时，网络较慢或源站无响应，可点下方重试';
  }
  if (details === 'manifestLoadError' || details === 'manifestParsingError' || details === 'levelLoadError') {
    return '视频地址已失效或无法解析，可点下方重新加载';
  }
  if (details === 'keyLoadError') {
    return '解密密钥加载失败，可点下方重试';
  }
  if (data && data.type === 'mediaError') {
    return '媒体解码失败，可点下方重试';
  }
  return details || (data && data.type) || '未知错误';
}

// 构造 Artplayer 实例：使用 HLS.js 作为自定义播放器，沿用原 ProxyLoader 处理跨域
function createArtplayer({ container, video, m3u8Url, onReady, onError }) {
  const canNativeHls = video.canPlayType('application/vnd.apple.mpegurl');

  const art = new Artplayer({
    container,
    url: m3u8Url,
    type: 'm3u8',
    theme: '#FF9900',
    poster: '',
    volume: 0.7,
    autoplay: true,
    autoSize: false,
    autoMini: false,
    loop: false,
    flip: true,
    playbackRate: true,
    aspectRatio: true,
    fullscreen: true,
    fullscreenWeb: true,
    miniProgressBar: true,
    mutex: true,
    backdrop: true,
    playsInline: true,
    autoPlayback: false,
    airplay: true,
    lang: 'zh-cn',
    setting: true,
    hotkey: true,
    pip: true,
    fastForward: true,
    screenshot: true,
    // 自定义 HLS 处理
    customType: {
      m3u8: function (video, url) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            loader: ProxyLoader,
            enableWorker: true,
            ...HLS_TIMEOUTS,
          });
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            onReady && onReady();
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data && data.fatal) {
              logPlayer('HLS 致命错误', {
                fatal: true,
                type: data.type,
                details: data.details,
                url: data.url,
              });
              if (data.type === 'networkError') {
                hls.startLoad();
                return;
              }
              if (data.type === 'mediaError') {
                try {
                  hls.recoverMediaError();
                  return;
                } catch (e) {
                  logPlayer('媒体恢复失败', e);
                }
              }
              onError && onError(friendlyHlsError(data));
            } else {
              console.warn('[VideoPlayer] non-fatal HLS error', data && data.details);
            }
          });
          // 存储 hls 实例便于销毁
          art.hls = hls;
        } else if (canNativeHls) {
          video.src = proxyUrl(url);
          onReady && onReady();
        } else {
          logPlayer('当前浏览器不支持 HLS');
          onError && onError('当前浏览器不支持此视频格式，请换用 Chrome / Edge');
        }
      },
    },
  });

  return art;
}

export default function VideoPlayer({ item, video: videoProp, onTags, defer = false, autoplay = true }) {
  const containerRef = useRef(null);
  const artRef = useRef(null);
  const onTagsRef = useRef(onTags);
  const loadGenRef = useRef(0);
  const loadingTimerRef = useRef(null);
  const lastSaveRef = useRef(0);

  // useReducer 统一管理 UI 状态（替代散落的 useState + phaseRef）
  const [uiState, dispatch] = useReducer(playerReducer, {
    ...initialState,
    phase: defer ? 'idle' : 'loading',
  });
  const phaseRef = useRef(uiState.phase);
  phaseRef.current = uiState.phase;

  const activeVideo = videoProp || (item && item.video) || null;
  const activeVideoRef = useRef(activeVideo);
  activeVideoRef.current = activeVideo;
  const activeVideoUrl = activeVideo?.url || '';
  const posterUrl = item.coverUrl ? `/api/cover/${item.id}` : '';
  onTagsRef.current = onTags;

  const setPhase = useCallback((p) => {
    dispatch({ type: 'SET_PHASE', phase: p });
  }, []);

  const loadSource = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    const gen = ++loadGenRef.current;

    // 清除上一轮的加载看门狗
    if (loadingTimerRef.current) {
      const arr = Array.isArray(loadingTimerRef.current) ? loadingTimerRef.current : [loadingTimerRef.current];
      arr.forEach((t) => clearTimeout(t));
      loadingTimerRef.current = null;
    }
    dispatch({ type: 'HIDE_SLOW' });

    dispatch({ type: 'START_LOADING' });

    let currentUrl = activeVideoRef.current && activeVideoRef.current.url;
    if (!currentUrl) {
      dispatch({ type: 'SET_PHASE', phase: 'none' });
      return;
    }

    // 跨异步闭包共享的状态（定时器需要读取最新值）
    const refreshDoneRef = { current: false };   // 后台刷新是否完成
    const playerAliveRef = { current: true };      // 播放器是否仍存活（未发生致命错误）

    // ─── 加载看门狗 ───
    // 12s：显示"加载较慢"提示 + 刷新按钮（不打断播放器）
    // 25s：强制超时报错（若刷新仍在进行则再延 15s）
    const clearWatchdog = () => {
      if (loadingTimerRef.current) {
        const arr = Array.isArray(loadingTimerRef.current) ? loadingTimerRef.current : [loadingTimerRef.current];
        arr.forEach((t) => clearTimeout(t));
        loadingTimerRef.current = null;
      }
      if (gen === loadGenRef.current) dispatch({ type: 'HIDE_SLOW' });
    };

    const startWatchdog = () => {
      clearWatchdog();
      const timers = [];
      loadingTimerRef.current = timers;

      // 12s：显示慢加载提示
      timers.push(setTimeout(() => {
        if (gen !== loadGenRef.current) return;
        if (phaseRef.current !== 'loading') return;
        dispatch({ type: 'SHOW_SLOW' });
        logPlayer('加载缓慢提示', { id: item.id, elapsed: '12s' });
      }, 12000));

      // 25s：硬超时
      timers.push(setTimeout(() => {
        if (gen !== loadGenRef.current) return;
        if (phaseRef.current !== 'loading') return;

        if (!refreshDoneRef.current) {
          // 刷新仍在进行，再等 15s
          dispatch({ type: 'SET_TIP', tip: '刷新较慢，正在等待刷新结果…' });
          timers.push(setTimeout(() => {
            if (gen !== loadGenRef.current) return;
            if (phaseRef.current !== 'loading') return;
            logPlayer('加载硬超时（刷新等待后）', { id: item.id });
            clearWatchdog();
            dispatch({ type: 'SET_ERROR', msg: '视频加载超时，请检查网络后点击刷新重试' });
          }, 15000));
          return;
        }

        logPlayer('加载硬超时', { id: item.id });
        clearWatchdog();
        dispatch({ type: 'SET_ERROR', msg: '视频加载超时，请检查网络后点击刷新重试' });
      }, 25000));
    };

    // ─── 创建播放器实例 ───
    const createPlayer = (url, isFallback) => {
      playerAliveRef.current = true;

      // 销毁旧实例（含 HLS）—— 使用健壮销毁，确保上一个视频的播放进程被彻底终止
      if (artRef.current) {
        // 保存旧播放器的进度
        try {
          const t = artRef.current.currentTime;
          saveProgress(item.id, t);
        } catch (_) {}
        teardownArt(artRef.current);
        artRef.current = null;
      }

      // 兜底清理容器，移除任何残留 <video> 节点（防御性，避免游离音频）
      clearContainer(container);
      const video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      try {
        const art = createArtplayer({
          container,
          video,
          m3u8Url: url,
          onReady: () => {
            if (gen !== loadGenRef.current) return;
            clearWatchdog();

            // 恢复上次播放进度
            const saved = loadProgress(item.id);
            if (saved > 5 && art.duration && saved < art.duration - 5) {
              try { art.currentTime = saved; } catch (_) {}
              logPlayer('已恢复进度', { id: item.id, time: saved });
            }

            setPhase('ready');
            if (!autoplay && !isFallback) return;
            try {
              art.play().catch((e) => logPlayer('自动播放被阻止', e && e.message));
            } catch (e) {
              logPlayer('自动播放失败', e);
            }
          },
          onError: (msg) => {
            if (gen !== loadGenRef.current) return;
            playerAliveRef.current = false; // 播放器已死

            if (!refreshDoneRef.current) {
              // 刷新尚未完成：可能是地址过期，回到 loading 等待刷新结果
              dispatch({ type: 'SET_TIP', tip: '正在刷新播放地址…' });
              dispatch({ type: 'SET_PHASE', phase: 'loading' });
              // 看门狗继续运行，会在 25s 后强制超时
            } else {
              // 刷新已完成但仍报错 → 直接显示错误 + 刷新按钮
              clearWatchdog();
              dispatch({ type: 'SET_ERROR', msg: msg || '播放失败' });
            }
          },
        });
        artRef.current = art;

        // 播放进度记忆：timeupdate 事件防抖保存
        art.on('video:timeupdate', () => {
          const now = Date.now();
          if (now - lastSaveRef.current < PROGRESS_SAVE_INTERVAL) return;
          lastSaveRef.current = now;
          try { saveProgress(item.id, art.currentTime); } catch (_) {}
        });

        // 启动本轮加载看门狗
        startWatchdog();
      } catch (e) {
        logPlayer('Artplayer 初始化失败', e);
        if (gen !== loadGenRef.current) return;
        clearWatchdog();
        dispatch({ type: 'SET_ERROR', msg: '播放器初始化失败' });
      }
    };

    // ─── 后台异步刷新（不阻塞播放器启动）───
    const refreshPromise = (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000); // 30s 超时（原 60s 太长）
        const data = await refreshVideo(item.id, ctrl.signal);
        clearTimeout(timer);
        if (gen !== loadGenRef.current) return null;
        return data;
      } catch (err) {
        const timedOut = err && (err.name === 'AbortError' || /abort/i.test(err.message || ''));
        logPlayer('刷新错误', {
          id: item.id,
          timedOut,
          message: err && err.message,
          error: err,
        });
        return null;
      }
    })();

    // ─── 刷新完成后：更新元数据 + 必要时热切换地址 ───
    refreshPromise.then((data) => {
      if (gen !== loadGenRef.current) return;
      refreshDoneRef.current = true;

      if (!data || !data.ok) {
        logPlayer('刷新返回异常', { id: item.id, data });

        // 刷新失败且播放器已死（仍在 loading）→ 显示错误
        if (phaseRef.current === 'loading' && !playerAliveRef.current) {
          clearWatchdog();
          dispatch({ type: 'SET_ERROR', msg: data && data.error ? data.error : '刷新播放地址失败，请重试' });
        }
        // 播放器仍存活 → 让看门狗自行处理（25s 后超时或正常就绪）
        return;
      }

      // 更新标签 / 正文 / 配图 / 视频列表
      const cb = onTagsRef.current;
      if (typeof cb === 'function') {
        cb(data.tags || [], data.category || null, data.datePublished || null, {
          content: data.content,
          images: data.images,
          videos: data.videos,
          blocks: data.blocks,
        });
      }

      // 匹配当前视频的新地址
      const refreshedList = Array.isArray(data.videos) && data.videos.length
        ? data.videos
        : (data.video ? [data.video] : []);
      const av = activeVideoRef.current;
      const matched = refreshedList.find((v) => v && v.url && av && v.url.split('?')[0] === av.url.split('?')[0])
        || refreshedList.find((v) => v && av && v.title && v.title === av.title)
        || refreshedList[0];

      if (matched && matched.url && matched.url !== currentUrl) {
        // 地址变了：播放器尚未就绪 → 用新地址重启
        if (phaseRef.current === 'loading' || phaseRef.current === 'error') {
          logPlayer('刷新完成，切换到新地址', {
            old: currentUrl && currentUrl.slice(0, 80),
            new: matched.url && matched.url.slice(0, 80),
          });
          currentUrl = matched.url;
          dispatch({ type: 'START_LOADING' });
          createPlayer(matched.url, true);
        }
        // 播放器已就绪 → 不打扰，仅更新元数据
      } else if (phaseRef.current === 'loading' && !playerAliveRef.current) {
        // 地址没变但播放器已死（HLS 报错后回退到 loading）→ 用刷新后的地址重启
        if (matched && matched.url) currentUrl = matched.url;
        logPlayer('刷新完成，地址相同，重启播放器', { id: item.id });
        dispatch({ type: 'START_LOADING' });
        createPlayer(currentUrl, true);
      }
      // 地址没变且播放器仍存活 → 正常等待 HLS 自行加载完成
    });

    // 立即用存储的地址启动播放器（不等刷新）
    createPlayer(currentUrl, false);
  }, [item.id, activeVideoUrl, autoplay, setPhase]);

  useEffect(() => {
    if (defer) return undefined;
    loadSource();
    return undefined;
  }, [loadSource, defer]);

  useEffect(() => () => {
    loadGenRef.current++;
    if (loadingTimerRef.current) {
      const arr = Array.isArray(loadingTimerRef.current) ? loadingTimerRef.current : [loadingTimerRef.current];
      arr.forEach((t) => clearTimeout(t));
      loadingTimerRef.current = null;
    }
    // 销毁前保存播放进度
    if (artRef.current) {
      try { saveProgress(item.id, artRef.current.currentTime); } catch (_) {}
    }
    // 健壮销毁：彻底终止上一个视频的播放进程（含 HLS + <video> 节点）
    if (artRef.current) {
      teardownArt(artRef.current);
      artRef.current = null;
    }
    clearContainer(containerRef.current);
  }, []);

  const retry = useCallback(() => { loadSource(); }, [loadSource]);
  const startDeferred = useCallback(() => {
    if (uiState.phase !== 'idle') return;
    loadSource();
  }, [uiState.phase, loadSource]);

  const { phase, errorMsg, loadingTip, showSlowHint } = uiState;

  return (
    <div className="relative bg-black w-full">
      <div
        ref={containerRef}
        className="artplayer-app w-full"
        style={{ aspectRatio: '16/9', maxHeight: '78vh' }}
      />

      {phase === 'idle' && (
        <button
          type="button"
          onClick={startDeferred}
          className="v-overlay absolute inset-0 z-[8] flex flex-col items-center justify-center gap-3 border-0 cursor-pointer bg-black/55 bg-center bg-cover"
          style={posterUrl ? { backgroundImage: `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.55)), url(${posterUrl})` } : undefined}
        >
          <span className="w-14 h-14 rounded-full bg-ph-orange text-black flex items-center justify-center text-2xl font-black shadow-lg">
            ▶
          </span>
          <span className="text-sm font-bold text-white">点击播放</span>
        </button>
      )}

      {phase === 'loading' && posterUrl && (
        <div
          className="v-overlay absolute inset-0 z-[6] bg-black/60 bg-center bg-cover"
          style={{ backgroundImage: `url(${posterUrl})` }}
        />
      )}

      {phase === 'loading' && (
        <div className="v-overlay absolute inset-0 z-[7] flex flex-col items-center justify-center bg-black/40">
          <Spin size="large" tip={loadingTip} />
          {showSlowHint && (
            <div className="mt-5 flex flex-col items-center gap-2">
              <p className="text-sm text-white/80">加载时间较长，可点击刷新重试</p>
              <Button
                type="primary"
                size="middle"
                icon={<ReloadOutlined />}
                onClick={retry}
                danger
              >
                刷新重试
              </Button>
            </div>
          )}
        </div>
      )}
      {phase === 'none' && (
        <div className="v-overlay absolute inset-0 z-[6] flex items-center justify-center bg-black/85">
          <Result status="info" title="暂无视频" subTitle="这条内容没有可播放地址" />
        </div>
      )}
      {phase === 'error' && (
        <div className="v-overlay absolute inset-0 z-[6] flex items-center justify-center bg-black/85 px-4">
          <Result
            status="error"
            title="播放失败"
            subTitle={errorMsg || '请检查网络后重试（详情见控制台）'}
            extra={<Button type="primary" size="middle" icon={<ReloadOutlined />} onClick={retry}>重新加载</Button>}
          />
        </div>
      )}
    </div>
  );
}
