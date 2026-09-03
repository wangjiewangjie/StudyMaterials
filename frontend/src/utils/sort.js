/** 列表排序 */

export const HOME_SORT_OPTIONS = [
  { label: '最新发布', value: 'date' },
  { label: '标题排序', value: 'title' },
];

export const FAV_SORT_OPTIONS = [
  { label: '最新收藏', value: 'recent' },
  { label: '标题排序', value: 'title' },
];

export function sortByDatePublished(a, b) {
  const da = a.datePublished || '';
  const db = b.datePublished || '';
  if (da && db) return db.localeCompare(da);
  if (da) return -1;
  if (db) return 1;
  return Number(b.id) - Number(a.id);
}

export function sortByTitle(a, b) {
  return (a.title || '').localeCompare(b.title || '', 'zh');
}

export function sortByFavoritedAt(a, b) {
  const fa = a.favoritedAt || '';
  const fb = b.favoritedAt || '';
  if (fa && fb) return fb.localeCompare(fa);
  if (fa) return -1;
  if (fb) return 1;
  return 0;
}
