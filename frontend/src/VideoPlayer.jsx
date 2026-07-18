import { useEffect, useRef, useState, useCallback } from 'react';
import { Spin, Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import Hls from 'hls.js';

function proxyUrl(url) {
  return '/proxy/' + encodeURIComponent(url);
}

// Custom HLS.js loader: routes all cross-origin requests through the CORS proxy.
function makeProxyLoader() {
  const Base = Hls.DefaultConfig.loader;
  return class ProxyLoader extends Base {
    load(context, config, callbacks) {
      const url = context.url;
      if (url && /^https?:\/\//i.test(url)) {
        context.url = proxyUrl(url);
      }
      super.load(context, config, callbacks);
    }
  };
}

export default function VideoPlayer({ item, onTags }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const onTagsRef = useRef(onTags);

  const [phase, setPhase] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const posterUrl = item.coverUrl ? `/api/cover/${item.id}` : '';
  onTagsRef.current = onTags;

  const loadSource = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setPhase('loading');
    setErrorMsg('');

    let m3u8Url = item.video && item.video.url;
    if (!m3u8Url) {
      setPhase('none');
      return;
    }

    // Refresh the m3u8 URL (auth keys expire) and pick up tags/date updates.
    try {
      const res = await fetch(`/api/refresh/${item.id}`);
      const data = await res.json();
      if (data.ok) {
        const cb = onTagsRef.current;
        if (typeof cb === 'function' && (data.tags || data.category || data.datePublished)) {
          cb(data.tags || [], data.category || null, data.datePublished || null);
        }
        if (data.video && data.video.url) m3u8Url = data.video.url;
      }
    } catch (_) { /* fall through to stored URL */ }

    if (Hls.isSupported()) {
      const hls = new Hls({ loader: makeProxyLoader() });
      hlsRef.current = hls;
      hls.loadSource(m3u8Url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPhase('ready');
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setErrorMsg(data.details || data.type || '播放错误');
          setPhase('error');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxyUrl(m3u8Url);
      setPhase('ready');
    } else {
      setPhase('error');
      setErrorMsg('浏览器不支持 HLS 播放');
    }
  }, [item.id, item.video]);

  useEffect(() => { loadSource(); }, [loadSource]);

  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

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
        <div className="v-overlay absolute inset-0 z-[6] flex items-center justify-center bg-black/55">
          <Spin size="large" tip="视频加载中..." />
        </div>
      )}
      {phase === 'none' && (
        <div className="v-overlay absolute inset-0 z-[6] flex items-center justify-center bg-black/85">
          <Result status="info" title="该文章没有视频" />
        </div>
      )}
      {phase === 'error' && (
        <div className="v-overlay absolute inset-0 z-[6] flex items-center justify-center bg-black/85">
          <Result
            status="error"
            title="视频加载失败"
            subTitle={errorMsg}
            extra={<Button type="primary" icon={<ReloadOutlined />} onClick={retry}>重试</Button>}
          />
        </div>
      )}
    </div>
  );
}
