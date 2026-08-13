// lib/exclude.js — 标题 / 分类 / 标签命中排除词的条目不入库、不展示

/** 标题或标签含这些关键词则排除（不区分大小写；「重口」可匹配「重口味」） */
const EXCLUDE_KEYWORDS = ['猎奇', '重口', '伪娘', '杂谈', '国漫', '短剧', 'ai'];

const EXCLUDE_KW_LOWER = EXCLUDE_KEYWORDS.map((kw) => String(kw).toLowerCase());

/** 转义正则特殊字符，供通配符模式安全拼接 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 通用模式匹配。pattern 含 '*' 时按通配符处理（* 匹配任意字符序列，可为空），
 * 否则保持原行为（完全相等或包含）。统一小写比较。
 * 例：matchPattern('金沙娱乐', '*娱乐') === true；matchPattern('重口味', '重口') === true
 */
function matchPattern(text, pattern) {
  const t = String(text || '').toLowerCase();
  const p = String(pattern || '').toLowerCase();
  if (!p) return false;
  if (!p.includes('*')) {
    return t === p || t.includes(p);
  }
  const re = new RegExp('^' + p.split('*').map(escapeRegExp).join('.*') + '$');
  return re.test(t);
}

function containsExcludeKeyword(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return false;
  return EXCLUDE_KW_LOWER.some((kw) => matchPattern(s, kw));
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
  escapeRegExp,
  matchPattern,
  containsExcludeKeyword,
  isExcludedTag,
  matchesExclude,
  filterExcluded,
  filterExcludedArticles,
};
