// lib/exclude.js — 标题 / 分类 / 标签命中排除词的条目不入库、不展示

/** 标题或标签含这些关键词则排除（不区分大小写；「重口」可匹配「重口味」） */
const EXCLUDE_KEYWORDS = ['猎奇', '重口', '伪娘', '杂谈', '国漫', '短剧', 'ai'];

const EXCLUDE_KW_LOWER = EXCLUDE_KEYWORDS.map((kw) => String(kw).toLowerCase());

function containsExcludeKeyword(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return false;
  return EXCLUDE_KW_LOWER.some((kw) => s.includes(kw));
}

function isExcludedTag(tag) {
  return containsExcludeKeyword(tag);
}

/** 标题、分类或任一标签命中排除词 */
function matchesExclude(article) {
  if (!article) return true;
  if (containsExcludeKeyword(article.title)) return true;
  if (containsExcludeKeyword(article.category)) return true;
  const tags = article.tags || [];
  for (let i = 0; i < tags.length; i++) {
    if (containsExcludeKeyword(tags[i])) return true;
  }
  return false;
}

/** 原地剔除命中排除词的文章；label 仅用于日志 */
function filterExcluded(articles, label, log) {
  const list = articles || [];
  const before = list.length;
  for (let i = list.length - 1; i >= 0; i--) {
    if (matchesExclude(list[i])) list.splice(i, 1);
  }
  const removed = before - list.length;
  if (removed > 0 && typeof log === 'function') {
    log(`按${label}排除 ${removed} 条（关键词: ${EXCLUDE_KEYWORDS.join('/')}）`);
  }
  return removed;
}

function filterExcludedArticles(articles) {
  return (articles || []).filter((a) => !matchesExclude(a));
}

module.exports = {
  EXCLUDE_KEYWORDS,
  containsExcludeKeyword,
  isExcludedTag,
  matchesExclude,
  filterExcluded,
  filterExcludedArticles,
};
