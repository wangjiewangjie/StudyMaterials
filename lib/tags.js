// lib/tags.js — 标签规则：品牌过滤、显示阈值、按视频数排序、超阈值固定并持久化

const fs = require('fs');
const path = require('path');

/** 关联视频数少于此值的标签不展示（固定标签除外） */
const MIN_DISPLAY_COUNT = 5;
/** 关联视频数超过此值时固定标签（不再参与动态计算） */
const FIX_THRESHOLD = 100;

/** 站点品牌相关关键词（与配置中的站点名一并用于过滤） */
const SITE_BRAND_KEYWORDS = [
  '91吃瓜', '91视频', '91sp', '91cg', '91吃瓜网',
  '51fans', '51fan', '51爆料', '51吃瓜',
  '黑料网', '黑料不打烊',
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
 * 匹配规则：规范化后与品牌词完全相等，或标签包含完整品牌词。
 */
function isSiteBrandTag(tag, siteConfigs) {
  const t = normalizeTag(tag).toLowerCase();
  if (!t) return true;
  const brands = resolveBrands(siteConfigs);
  for (const brand of brands) {
    if (t === brand || t.includes(brand)) return true;
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
    const labels = [];
    if (a.category) labels.push(a.category);
    if (a.tags && a.tags.length) labels.push(...a.tags);
    for (const t of filterSiteBrandTags(labels, brands)) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return counts;
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
    if (isSiteBrandTag(tag, brands)) continue;
    display.push({ tag, count: counts.get(tag) || 0, fixed: true });
  }
  for (const [tag, count] of counts) {
    if (fixedSet.has(tag) || count < MIN_DISPLAY_COUNT) continue;
    display.push({ tag, count, fixed: false });
  }

  display.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'));
  return { tags: display, fixedTags: nextFixed, newlyFixed };
}

module.exports = {
  MIN_DISPLAY_COUNT,
  FIX_THRESHOLD,
  SITE_BRAND_KEYWORDS,
  isSiteBrandTag,
  filterSiteBrandTags,
  loadFixedTags,
  saveFixedTags,
  countTags,
  buildDisplayTags,
  defaultFixedPath,
};
