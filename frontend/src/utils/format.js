/** 毫秒 → `m:ss`（导航栏 / 同步中心短显示） */
export function formatElapsedShort(ms) {
  const sec = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 毫秒 → `HH:MM:SS`（同步弹窗） */
export function formatElapsedHms(ms) {
  const sec = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
