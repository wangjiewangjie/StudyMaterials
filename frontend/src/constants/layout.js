/** 栅格与页面布局常量 — 首页 / 收藏 / 详情推荐 / 同步中心共用 */

export const CARD_GUTTER = [12, 20];
export const CARD_RESPONSIVE = {
  xs: 12,
  sm: 12,
  md: 8,
  lg: 6,
};

/** 详情推荐 / 同步中心统计卡共用 */
export const REC_GUTTER = [12, 16];
export const REC_RESPONSIVE = {
  xs: 12,
  sm: 12,
  lg: 6,
};

export const STAT_GUTTER = REC_GUTTER;
export const STAT_RESPONSIVE = REC_RESPONSIVE;

export const SRC_GUTTER = [12, 16];
export const SRC_RESPONSIVE = {
  xs: 24,
  md: 12,
  lg: 8,
};

/** Header / Drawer 导航按钮的激活态 class */
export function navBtnClass(active) {
  return `!inline-flex !items-center !font-bold !border ${
    active ? 'nav-btn-active' : 'nav-btn-idle'
  }`;
}
