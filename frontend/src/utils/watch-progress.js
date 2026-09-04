/**
 * utils/watch-progress.js — 播放进度
 *
 * 权威数据在服务端 DATA_DIR/watch-progress.json；
 * localStorage 作写穿缓存，便于首屏同步读取与离线兜底。
 * 应用启动时调用 hydrateWatchProgress() 拉取并迁移旧 localStorage。
 */

import {
  fetchWatchProgress,
  mergeWatchProgress,
  putWatchProgress,
} from '../services/api.js';

const PREFIX = 'vp-progress:';

/** @type {Map<string, { t: number, d: number }>} */
const memory = new Map();
let hydrated = false;
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const saveTimers = new Map();

function progressStorageKey(id) {
  return `${PREFIX}${id}`;
}

function readLocal(id) {
  try {
    const raw = localStorage.getItem(progressStorageKey(id));
    if (!raw) return null;
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw);
      return {
        t: Number(parsed.t || parsed.time) || 0,
        d: Number(parsed.d || parsed.duration) || 0,
      };
    }
    return { t: parseFloat(raw) || 0, d: 0 };
  } catch {
    return null;
  }
}

function writeLocal(id, t, d) {
  try {
    localStorage.setItem(
      progressStorageKey(id),
      JSON.stringify({ t: Math.floor(t), d: d > 0 ? Math.floor(d) : 0 }),
    );
  } catch { /* ignore quota */ }
}

function toView(entry) {
  const time = Number(entry?.t) || 0;
  const duration = Number(entry?.d) || 0;
  let percent = 0;
  if (duration > 0 && time > 0) {
    percent = Math.min(100, Math.round((time / duration) * 100));
  } else if (time > 5) {
    percent = 8;
  }
  return { time, duration, percent };
}

/**
 * @returns {{ time: number, duration: number, percent: number }}
 */
export function loadWatchProgress(id) {
  if (!id) return { time: 0, duration: 0, percent: 0 };
  if (memory.has(id)) return toView(memory.get(id));
  const local = readLocal(id);
  if (local) {
    memory.set(id, local);
    return toView(local);
  }
  return { time: 0, duration: 0, percent: 0 };
}

export function loadWatchTime(id) {
  return loadWatchProgress(id).time;
}

/** 收集 localStorage 中全部旧进度，供迁移 */
function collectLocalStorageItems() {
  const items = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const id = key.slice(PREFIX.length);
      const local = readLocal(id);
      if (local && local.t > 5) items[id] = local;
    }
  } catch { /* ignore */ }
  return items;
}

/**
 * 启动时：合并 localStorage → 服务端，再拉全量进内存。
 * @param {{ force?: boolean }} [opts] force=true 时强制重新拉取（导入后）
 */
export async function hydrateWatchProgress(opts = {}) {
  if (hydrated && !opts.force) return;
  const localItems = collectLocalStorageItems();
  try {
    if (Object.keys(localItems).length) {
      await mergeWatchProgress(localItems);
    }
    const data = await fetchWatchProgress();
    const items = data.items || {};
    memory.clear();
    for (const [id, raw] of Object.entries(items)) {
      const t = Number(raw.t) || 0;
      const d = Number(raw.d) || 0;
      if (t > 5) {
        memory.set(id, { t, d });
        writeLocal(id, t, d);
      }
    }
    hydrated = true;
  } catch {
    // 服务端不可用时继续用 localStorage
    for (const [id, raw] of Object.entries(localItems)) {
      memory.set(id, raw);
    }
  }
}

export function saveWatchProgress(id, time, duration = 0) {
  if (!id || !(time > 5)) return;
  const t = Math.floor(time);
  const prev = memory.get(id) || readLocal(id) || { t: 0, d: 0 };
  const d = duration > 0 ? Math.floor(duration) : (prev.d || 0);
  memory.set(id, { t, d });
  writeLocal(id, t, d);

  const prevTimer = saveTimers.get(id);
  if (prevTimer) clearTimeout(prevTimer);
  const timer = setTimeout(() => {
    saveTimers.delete(id);
    putWatchProgress(id, { time: t, duration: d }).catch(() => {});
  }, 400);
  saveTimers.set(id, timer);
}
