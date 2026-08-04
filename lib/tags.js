// lib/tags.js — 标签聚合：站点品牌过滤、显示阈值、按视频数排序、超阈值固定并持久化。

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

/**
 * 判断标签是否与站点名称/品牌相关。
 * 匹配规则：规范化后与品牌词完全相等，或标签包含完整品牌词。
 */
function isSiteBrandTag(tag, siteConfigs) {
  const t = normalizeTag(tag).toLowerCase();
  if (!t) return true;
  const brands = siteConfigs instanceof Set ? siteConfigs : buildBrandSet(siteConfigs);
  for (const brand of brands) {
    if (t === brand || t.includes(brand)) return true;
  }
  return false;
}

/** 过滤掉站点品牌相关标签，保持原顺序去重 */
function filterSiteBrandTags(tags, siteConfigs) {
  const brands = buildBrandSet(siteConfigs);
  const out = [];
  const seen = new Set();
  for (const raw of tags || []) {
    const t = normalizeTag(raw);
    if (!t || seen.has(t)) continue;
    if (isSiteBrandTag(t, brands)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function defaultFixedPath(outDir) {
  return path.join(outDir || path.join(__dirname, '..', 'output'), 'fixed-tags.json');
}

/** 读取固定标签配置；返回去重后的标签名数组 */
function loadFixedTags(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : (data && data.tags) || [];
    const out = [];
    const seen = new Set();
    for (const item of list) {
      const t = normalizeTag(typeof item === 'string' ? item : item && item.tag);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  } catch (_) {
    return [];
  }
}

/** 将固定标签写入本地 JSON */
function saveFixedTags(filePath, tags) {
  const list = [];
  const seen = new Set();
  for (const t of tags || []) {
    const name = normalizeTag(t);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    list.push(name);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    tags: list,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return list;
}

/**
 * 从文章列表统计标签出现次数（含 category，已过滤站点品牌）。
 * @returns {Map<string, number>}
 */
function countTags(articles, siteConfigs) {
  const brands = buildBrandSet(siteConfigs);
  const counts = new Map();
  for (const a of articles || []) {
    if (!a || !a.video || !a.video.url) continue;
    const bucket = new Set();
    if (a.category) {
      const c = normalizeTag(a.category);
      if (c && !isSiteBrandTag(c, brands)) bucket.add(c);
    }
    for (const raw of a.tags || []) {
      const t = normalizeTag(raw);
      if (t && !isSiteBrandTag(t, brands)) bucket.add(t);
    }
    for (const t of bucket) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return counts;
}

/**
 * 生成展示用标签列表，并按需将超阈值标签写入固定配置。
 *
 * 规则：
 * - 站点品牌标签已在计数阶段过滤
 * - 固定标签始终展示，不参与「>= MIN_DISPLAY_COUNT」动态筛选
 * - 非固定标签仅当 count >= 5 时展示
 * - 非固定且 count > 100 的标签写入固定列表
 * - 全部按关联视频数降序排序
 *
 * @returns {{ tags: Array<{tag:string,count:number,fixed:boolean}>, fixedTags: string[], newlyFixed: string[] }}
 */
function buildDisplayTags(articles, siteConfigs, options = {}) {
  const fixedPath = options.fixedPath || defaultFixedPath(options.outDir);
  const persist = options.persist !== false;

  const fixedList = loadFixedTags(fixedPath);
  const fixedSet = new Set(fixedList);
  const brands = buildBrandSet(siteConfigs);

  // 固定列表里若混入品牌标签，展示时剔除（但保留文件中的历史项，避免误删用户数据）
  const counts = countTags(articles, brands);

  const newlyFixed = [];
  for (const [tag, count] of counts.entries()) {
    if (fixedSet.has(tag)) continue;
    if (count > FIX_THRESHOLD) {
      fixedSet.add(tag);
      newlyFixed.push(tag);
    }
  }

  let nextFixed = Array.from(fixedSet);
  if (persist && newlyFixed.length > 0) {
    nextFixed = saveFixedTags(fixedPath, nextFixed);
  } else if (persist && !fs.existsSync(fixedPath) && nextFixed.length > 0) {
    nextFixed = saveFixedTags(fixedPath, nextFixed);
  }

  const display = [];
  const used = new Set();

  // 固定标签：始终展示（有计数则用当前计数，无关联视频时 count=0 仍展示）
  for (const tag of nextFixed) {
    if (isSiteBrandTag(tag, brands)) continue;
    display.push({ tag, count: counts.get(tag) || 0, fixed: true });
    used.add(tag);
  }

  // 动态标签：未固定且达到显示阈值
  for (const [tag, count] of counts.entries()) {
    if (used.has(tag)) continue;
    if (count < MIN_DISPLAY_COUNT) continue;
    display.push({ tag, count, fixed: false });
    used.add(tag);
  }

  display.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'));

  return {
    tags: display,
    fixedTags: nextFixed,
    newlyFixed,
  };
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
