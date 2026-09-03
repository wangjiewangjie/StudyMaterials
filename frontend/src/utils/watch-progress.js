/** 播放进度 localStorage（与 VideoPlayer 共用） */

export function progressStorageKey(id) {
  return `vp-progress:${id}`;
}

/**
 * @returns {{ time: number, duration: number, percent: number }}
 */
export function loadWatchProgress(id) {
  if (!id) return { time: 0, duration: 0, percent: 0 };
  try {
    const raw = localStorage.getItem(progressStorageKey(id));
    if (!raw) return { time: 0, duration: 0, percent: 0 };

    let time = 0;
    let duration = 0;
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw);
      time = Number(parsed.t || parsed.time) || 0;
      duration = Number(parsed.d || parsed.duration) || 0;
    } else {
      time = parseFloat(raw) || 0;
    }

    let percent = 0;
    if (duration > 0 && time > 0) {
      percent = Math.min(100, Math.round((time / duration) * 100));
    } else if (time > 5) {
      // 旧数据无时长：给一条「已看过」提示条
      percent = 8;
    }
    return { time, duration, percent };
  } catch {
    return { time: 0, duration: 0, percent: 0 };
  }
}

export function loadWatchTime(id) {
  return loadWatchProgress(id).time;
}

export function saveWatchProgress(id, time, duration = 0) {
  if (!id || !(time > 5)) return;
  try {
    const prev = loadWatchProgress(id);
    const d = duration > 0 ? duration : prev.duration;
    localStorage.setItem(
      progressStorageKey(id),
      JSON.stringify({ t: Math.floor(time), d: d > 0 ? Math.floor(d) : 0 }),
    );
  } catch { /* ignore */ }
}
