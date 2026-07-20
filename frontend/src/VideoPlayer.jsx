import { useEffect, useRef, useState, useCallback } from 'react';
import { Spin, Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
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

export default function VideoPlayer({ item, onTags }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const onTagsRef = useRef(onTags);
  const loadGenRef = useRef(0);

  const [phase, setPhase] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingTip, setLoadingTip] = useState('正在准备播放…');

  const posterUrl = item.coverUrl ? `/api/cover/${item.id}` : '';
  onTagsRef.current = onTags;

  const loadSource = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    const gen = ++loadGenRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setPhase('loading');
    setErrorMsg('');
    setLoadingTip('正在刷新播放地址…');

    let m3u8Url = item.video && item.video.url;
    if (!m3u8Url) {
      setPhase('none');
      return;
    }

    // Refresh the m3u8 URL (auth keys expire) and pick up tags/date updates.
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

    if (Hls.isSupported()) {
      const hls = new Hls({
        loader: ProxyLoader,
        enableWorker: true,
        ...HLS_TIMEOUTS,
      });
      hlsRef.current = hls;
      hls.loadSource(m3u8Url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (gen !== loadGenRef.current) return;
        setPhase('ready');
        video.play().catch((e) => logPlayer('autoplay blocked', e && e.message));
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (gen !== loadGenRef.current) return;
        const payload = {
          id: item.id,
          fatal: !!(data && data.fatal),
          type: data && data.type,
          details: data && data.details,
          url: data && data.url,
          response: data && data.response && {
            code: data.response.code,
            text: data.response.text,
          },
          error: data && data.error && (data.error.message || String(data.error)),
          frag: data && data.frag && data.frag.url,
        };
        if (data && data.fatal) {
          logPlayer('fatal HLS error', payload);
          // Try a one-shot network/media recovery before surfacing UI error.
          if (data.type === 'networkError') {
            logPlayer('attempting network recovery');
            hls.startLoad();
            return;
          }
          if (data.type === 'mediaError') {
            logPlayer('attempting media recovery');
            try {
              hls.recoverMediaError();
              return;
            } catch (e) {
              logPlayer('media recovery failed', e);
            }
          }
          setErrorMsg(friendlyHlsError(data));
          setPhase('error');
        } else {
          // Non-fatal: still log — timeouts/retries show up here first.
          console.warn('[VideoPlayer] non-fatal HLS error', payload);
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxyUrl(m3u8Url);
      setPhase('ready');
    } else {
      logPlayer('HLS unsupported in this browser');
      setPhase('error');
      setErrorMsg('当前浏览器不支持此视频格式，请换用 Chrome / Edge');
    }
  }, [item.id, item.video]);

  useEffect(() => {
    loadSource();
    return () => {
      loadGenRef.current++;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [loadSource]);

  const retry = useCallback(() => { loadSource(); }, [loadSource]);

  return (
    <div className="relative bg-black">
      <video
        ref={videoRef}
        className="w-full block bg-black"
        style={{ maxHeight: '78vh' }}
        controls
        playsInline
        poster={posterUrl || undefined}
      />

      {phase === 'loading' && (
        <div className="v-overlay absolute inset-0 z-[6] flex items-center justify-center bg-black/60">
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
