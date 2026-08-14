// lib/tags.js — 标签规则：品牌过滤、显示阈值、按视频数排序、超阈值固定并持久化

const fs = require('fs');
const path = require('path');
const { matchesExclude, isExcludedTag, matchPattern } = require('./exclude');

/** 关联视频数少于此值的标签不展示（固定标签除外） */
const MIN_DISPLAY_COUNT = 5;
/** 关联视频数超过此值时固定标签（不再参与动态计算） */
const FIX_THRESHOLD = 100;

/**
 * 站点品牌相关关键词（与配置中的站点名一并用于过滤）。
 * 不再逐个写死完整品牌名，改用「易匹配」模式：
 *   - '91*' / '51*'  前缀通配，覆盖 91吃瓜 / 91视频 / 91sp / 51fans / 51爆料 等所有变体；
 *   - '吃瓜' / '黑料' / '爆料' 词根子串，覆盖 吃瓜网 等变体；
 *   - '娱乐' / '彩票' / '博彩' / '赌博' / '棋牌' 词根子串（位置不限），
 *     既可命中「金沙娱乐」也可命中「博彩天下」等任意前缀/后缀变体。
 * 匹配规则见 matchPattern：pattern 含 '*' 时按通配符（前缀/后缀/任意位置），
 * 否则退化为「完全相等或包含」。需要锚定位置时再写 *，例如 '*娱乐' 仅命中以娱乐结尾。
 */
const SITE_BRAND_KEYWORDS = [
  // 数字前缀系列（前缀通配，覆盖 91*/51* 下所有变体）
  '91*',
  '51*',
  // 常见品牌词根（子串匹配，覆盖吃瓜 / 黑料 / 爆料 及 吃瓜网 等变体）
  '吃瓜',
  '黑料',
  '爆料',
  // 推广 / 赌博类泛品牌词根（子串匹配，位置不限：可命中「金沙娱乐」也可命中「博彩天下」）
  '娱乐',
  '彩票',
  '博彩',
  '赌博',
  '棋牌',
];

function normalizeTag(tag) {
  return String(tag || '').trim();
}

/** 规范化并去重标签名；item 可为字符串或 { tag } */
function uniqTags(items) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const t = normalizeTag(typeof item === 'string' ? item : item && item.tag);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function buildBrandSet(siteConfigs) {
  const set = new Set();
  for (const kw of SITE_BRAND_KEYWORDS) {
    const n = normalizeTag(kw).toLowerCase();
    if (n) set.add(n);
  }
  for (const s of siteConfigs || []) {
    const name = normalizeTag(s && s.name).toLowerCase();
    if (name) set.add(name);
  }
  return set;
}

function resolveBrands(siteConfigs) {
  return siteConfigs instanceof Set ? siteConfigs : buildBrandSet(siteConfigs);
}

/**
 * 判断标签是否与站点名称/品牌相关。
 * 匹配规则：走 matchPattern —— 品牌词含 '*' 时按通配符（前缀/后缀/任意位置），
 * 否则退化为「完全相等或包含」。统一小写比较。
 */
function isSiteBrandTag(tag, siteConfigs) {
  const t = normalizeTag(tag).toLowerCase();
  if (!t) return true;
  const brands = resolveBrands(siteConfigs);
  for (const brand of brands) {
    if (matchPattern(t, brand)) return true;
  }
  return false;
}

/** 过滤掉站点品牌相关标签，保持原顺序去重 */
function filterSiteBrandTags(tags, siteConfigs) {
  const brands = resolveBrands(siteConfigs);
  return uniqTags(tags).filter((t) => !isSiteBrandTag(t, brands));
}

function defaultFixedPath(outDir) {
  return path.join(outDir || path.join(__dirname, '..', 'output'), 'fixed-tags.json');
}

/** 读取固定标签配置；返回去重后的标签名数组 */
function loadFixedTags(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(data) ? data : (data && data.tags) || [];
    return uniqTags(list);
  } catch (_) {
    return [];
  }
}

/** 将固定标签写入本地 JSON */
function saveFixedTags(filePath, tags) {
  const list = uniqTags(tags);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    tags: list,
    updatedAt: new Date().toISOString(),
  }, null, 2), 'utf8');
  return list;
}

/**
 * 从文章列表统计标签出现次数（含 category，已过滤站点品牌）。
 * @returns {Map<string, number>}
 */
function countTags(articles, siteConfigs) {
  const brands = resolveBrands(siteConfigs);
  const counts = new Map();
  for (const a of articles || []) {
    if (!a || !a.video || !a.video.url) continue;
    if (matchesExclude(a)) continue;
    const labels = [];
    if (a.category) labels.push(a.category);
    if (a.tags && a.tags.length) labels.push(...a.tags);
    for (const t of filterSiteBrandTags(labels, brands)) {
      if (isExcludedTag(t)) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return counts;
}

/**
 * 相似标签只保留最短的一个。
 * 规则：较短标签（长度 ≥ 2）是较长标签的子串时，丢弃较长者。
 * 例：「萝莉」与「萝莉辞宝裤里丝后入」→ 只保留「萝莉」。
 */
function filterSimilarToShortest(items) {
  const list = (items || []).slice().sort((a, b) => {
    const ta = normalizeTag(a.tag);
    const tb = normalizeTag(b.tag);
    return ta.length - tb.length
      || (b.count || 0) - (a.count || 0)
      || ta.localeCompare(tb, 'zh');
  });

  const kept = [];
  for (const item of list) {
    const tag = normalizeTag(item.tag);
    if (!tag) continue;
    const dominated = kept.some((k) => {
      const short = normalizeTag(k.tag);
      return short.length >= 2 && tag.length > short.length && tag.includes(short);
    });
    if (dominated) continue;
    kept.push(item);
  }
  return kept;
}

/**
 * 生成展示用标签列表，并按需将超阈值标签写入固定配置。
 *
 * @returns {{ tags: Array<{tag:string,count:number,fixed:boolean}>, fixedTags: string[], newlyFixed: string[] }}
 */
function buildDisplayTags(articles, siteConfigs, options = {}) {
  const fixedPath = options.fixedPath || defaultFixedPath(options.outDir);
  const persist = options.persist !== false;
  const brands = resolveBrands(siteConfigs);
  const fixedSet = new Set(loadFixedTags(fixedPath));
  const counts = countTags(articles, brands);

  const newlyFixed = [];
  for (const [tag, count] of counts) {
    if (fixedSet.has(tag) || count <= FIX_THRESHOLD) continue;
    fixedSet.add(tag);
    newlyFixed.push(tag);
  }

  const nextFixed = newlyFixed.length && persist
    ? saveFixedTags(fixedPath, Array.from(fixedSet))
    : Array.from(fixedSet);

  const display = [];
  for (const tag of nextFixed) {
    if (isSiteBrandTag(tag, brands) || isExcludedTag(tag)) continue;
    display.push({ tag, count: counts.get(tag) || 0, fixed: true });
  }
  for (const [tag, count] of counts) {
    if (fixedSet.has(tag) || count < MIN_DISPLAY_COUNT || isExcludedTag(tag)) continue;
    display.push({ tag, count, fixed: false });
  }

  const filtered = filterSimilarToShortest(display);
  filtered.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'));
  return { tags: filtered, fixedTags: nextFixed, newlyFixed };
}

module.exports = {
  isSiteBrandTag,
  filterSiteBrandTags,
  buildDisplayTags,
  defaultFixedPath,
};
