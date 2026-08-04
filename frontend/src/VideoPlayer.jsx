import { useEffect, useRef, useState, useCallback } from 'react';
import { Spin, Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

function unwrapCdnProxyUrl(url, maxDepth = 8) {
  if (!url || typeof url !== 'string') return url;
  let current = url;
  for (let i = 0; i < maxDepth; i++) {
    let u;
    try {
      u = new URL(current);
    } catch (_) {
      break;
    }
    const m = u.pathname.match(/^\/proxy\/(.+)$/i);
    if (!m) break;
    let inner;
    try {
      inner = decodeURIComponent(m[1]);
    } catch (_) {
      break;
    }
    if (!/^https?:\/\//i.test(inner)) break;
    current = inner;
  }
  return current;
}

function extractLocalProxyTarget(url) {
  if (!url) return url;
  if (/^\/proxy\//i.test(url)) {
    try {
      return decodeURIComponent(url.replace(/^\/proxy\//i, ''));
    } catch (_) {
      return url;
    }
  }
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin || !/^\/proxy\//i.test(u.pathname)) return url;
    return decodeURIComponent(u.pathname.replace(/^\/proxy\//i, ''));
  } catch (_) {
    return url;
  }
}

function normalizeUpstreamUrl(url) {
  return unwrapCdnProxyUrl(extractLocalProxyTarget(url));
}

function proxyUrl(url) {
  return '/proxy/' + encodeURIComponent(normalizeUpstreamUrl(url));
}

function isAlreadyProxied(url) {
  if (!url) return false;
  if (/^\/proxy\//i.test(url)) return true;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && /^\/proxy\//i.test(u.pathname);
  } catch (_) {
    return false;
  }
}

function shouldProxy(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (isAlreadyProxied(url)) return false;
  return true;
}

const HLS_TIMEOUTS = {
  // CDN + local proxy can be slow; defaults (10s/20s) surface as timeout errors.
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
  // Always visible in DevTools when diagnosing playback failures.
  console.error('[VideoPlayer]', ...args);
}

// Custom HLS.js loader: routes cross-origin CDN requests through the CORS proxy.
//
// Do NOT proxy URLs that are already /proxy/... (playlist rewrite + absolute
// resolution to http://localhost/proxy/...). Double-wrapping breaks keys/segments
// and shows up as load timeout / cannot decode.
//
// After a proxied fetch, restore response.url to the original CDN URL so any
// remaining relative URIs still resolve against the CDN base.
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
        logPlayer('loader error', {
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
          logPlayer('loader timeout', {
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
              logPlayer('fatal HLS error', {
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
                  logPlayer('media recovery failed', e);
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
          logPlayer('HLS unsupported in this browser');
          onError && onError('当前浏览器不支持此视频格式，请换用 Chrome / Edge');
        }
      },
    },
  });

  return art;
}

export default function VideoPlayer({ item, onTags }) {
  const containerRef = useRef(null);
  const artRef = useRef(null);
  const onTagsRef = useRef(onTags);
  const loadGenRef = useRef(0);

  const [phase, setPhase] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingTip, setLoadingTip] = useState('正在准备播放…');

  const posterUrl = item.coverUrl ? `/api/cover/${item.id}` : '';
  onTagsRef.current = onTags;

  const loadSource = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    const gen = ++loadGenRef.current;

    // 销毁旧的 Artplayer 实例
    if (artRef.current) {
      try {
        artRef.current.destroy(false);
      } catch (e) {
        logPlayer('destroy failed', e);
      }
      artRef.current = null;
    }

    setPhase('loading');
    setErrorMsg('');
    setLoadingTip('正在刷新播放地址…');

    let m3u8Url = item.video && item.video.url;
    if (!m3u8Url) {
      setPhase('none');
      return;
    }

    // 刷新 m3u8 URL（鉴权 key 可能已过期），同时获取最新标签/日期
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      const res = await fetch(`/api/refresh/${item.id}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (gen !== loadGenRef.current) return;
      const data = await res.json();
      if (gen !== loadGenRef.current) return;
      if (!res.ok) {
        logPlayer('refresh failed', { id: item.id, status: res.status, data });
      } else if (data.ok) {
        const cb = onTagsRef.current;
        if (typeof cb === 'function' && (data.tags || data.category || data.datePublished)) {
          cb(data.tags || [], data.category || null, data.datePublished || null);
        }
        if (data.video && data.video.url) m3u8Url = data.video.url;
      } else {
        logPlayer('refresh returned not ok', { id: item.id, data });
      }
    } catch (err) {
      const timedOut = err && (err.name === 'AbortError' || /abort/i.test(err.message || ''));
      logPlayer('refresh error', {
        id: item.id,
        timedOut,
        message: err && err.message,
        error: err,
      });
      // Fall through to stored URL.
    }

    if (gen !== loadGenRef.current) return;
    setLoadingTip('正在加载视频流…');

    // 临时清空容器，重新创建 Artplayer
    container.innerHTML = '';

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    try {
      const art = createArtplayer({
        container,
        video,
        m3u8Url,
        onReady: () => {
          if (gen !== loadGenRef.current) return;
          setPhase('ready');
          // 自动播放
          try {
            art.play().catch((e) => logPlayer('autoplay blocked', e && e.message));
          } catch (e) {
            logPlayer('autoplay failed', e);
          }
        },
        onError: (msg) => {
          if (gen !== loadGenRef.current) return;
          setErrorMsg(msg || '播放失败');
          setPhase('error');
        },
      });
      artRef.current = art;
    } catch (e) {
      logPlayer('artplayer init failed', e);
      if (gen !== loadGenRef.current) return;
      setErrorMsg('播放器初始化失败');
      setPhase('error');
    }
  }, [item.id, item.video]);

  useEffect(() => {
    loadSource();
    return () => {
      loadGenRef.current++;
      if (artRef.current) {
        try {
          artRef.current.destroy(false);
        } catch (e) {
          logPlayer('cleanup destroy failed', e);
        }
        artRef.current = null;
      }
    };
  }, [loadSource]);

  const retry = useCallback(() => { loadSource(); }, [loadSource]);

  return (
    <div className="relative bg-black w-full">
      {/* Artplayer 容器 */}
      <div
        ref={containerRef}
        className="artplayer-app w-full"
        style={{ aspectRatio: '16/9', maxHeight: '78vh' }}
      />

      {/* 海报作为加载背景 */}
      {phase === 'loading' && posterUrl && (
        <div
          className="v-overlay absolute inset-0 z-[6] bg-black/60 bg-center bg-cover"
          style={{ backgroundImage: `url(${posterUrl})` }}
        />
      )}

      {phase === 'loading' && (
        <div className="v-overlay absolute inset-0 z-[7] flex items-center justify-center bg-black/40 pointer-events-none">
          <Spin size="large" tip={loadingTip} />
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
            extra={<Button type="primary" icon={<ReloadOutlined />} onClick={retry}>重新加载</Button>}
          />
        </div>
      )}
    </div>
  );
}
