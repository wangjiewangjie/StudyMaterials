/**
 * lib/article-store.js — 索引冷热分离
 *
 * - index.json：列表字段（轻量）
 * - details/<id>.json：content / images / blocks（按需读取）
 * 写入索引前自动拆出详情；读详情时 hydrate 合并。
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR, ensureDataDir } = require('./paths');

const DETAILS_DIR = path.join(DATA_DIR, 'details');

const DETAIL_KEYS = ['content', 'images', 'blocks'];

const LIST_KEYS = [
  'id', 'url', 'siteUrl', 'title', 'coverUrl', 'tags', 'category',
  'datePublished', 'dateModified', 'videos', 'video', 'favoritedAt',
];

function ensureDetailsDir() {
  ensureDataDir();
  fs.mkdirSync(DETAILS_DIR, { recursive: true });
  return DETAILS_DIR;
}

function safeId(id) {
  return String(id || 'unknown').replace(/[^\w.-]+/g, '_').slice(0, 180) || 'unknown';
}

function detailPath(id) {
  return path.join(DETAILS_DIR, `${safeId(id)}.json`);
}

function hasInlineDetail(article) {
  if (!article || typeof article !== 'object') return false;
  if (typeof article.content === 'string' && article.content) return true;
  if (Array.isArray(article.images) && article.images.length) return true;
  if (Array.isArray(article.blocks) && article.blocks.length) return true;
  return false;
}

function extractDetail(article) {
  if (!article) return null;
  const detail = {};
  let any = false;
  if (typeof article.content === 'string' && article.content) {
    detail.content = article.content;
    any = true;
  }
  if (Array.isArray(article.images) && article.images.length) {
    detail.images = article.images;
    any = true;
  }
  if (Array.isArray(article.blocks) && article.blocks.length) {
    detail.blocks = article.blocks;
    any = true;
  }
  if (!any) return null;
  detail.id = article.id;
  detail.updatedAt = new Date().toISOString();
  return detail;
}

/** 列表态条目（去掉详情字段） */
function toListArticle(article) {
  if (!article || typeof article !== 'object') return article;
  const out = {};
  for (const k of LIST_KEYS) {
    if (article[k] !== undefined) out[k] = article[k];
  }
  // 保留未列明但非详情的扩展字段（如站点自定义），排除详情键
  for (const [k, v] of Object.entries(article)) {
    if (DETAIL_KEYS.includes(k)) continue;
    if (k.startsWith('_')) continue; // 运行时标记
    if (out[k] === undefined) out[k] = v;
  }
  return out;
}

function writeDetail(id, detail) {
  if (!id || !detail) return false;
  ensureDetailsDir();
  const payload = {
    id,
    content: typeof detail.content === 'string' ? detail.content : '',
    images: Array.isArray(detail.images) ? detail.images : [],
    blocks: Array.isArray(detail.blocks) ? detail.blocks : [],
    updatedAt: detail.updatedAt || new Date().toISOString(),
  };
  const file = detailPath(id);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, file);
  return true;
}

/** 从完整条目拆出并写入 details/，返回轻量条目 */
function persistArticleDetail(article) {
  if (!article || !article.id) return toListArticle(article || {});
  const detail = extractDetail(article);
  if (detail) writeDetail(article.id, detail);
  return toListArticle(article);
}

function readDetail(id) {
  if (!id) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(detailPath(id), 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    return {
      content: typeof raw.content === 'string' ? raw.content : '',
      images: Array.isArray(raw.images) ? raw.images : [],
      blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
    };
  } catch (_) {
    return null;
  }
}

/** 列表条目 + 磁盘详情 → 完整条目（不写回） */
function hydrateArticle(article) {
  if (!article || !article.id) return article;
  if (hasInlineDetail(article)) return article;
  const detail = readDetail(article.id);
  if (!detail) {
    return {
      ...article,
      content: article.content || '',
      images: Array.isArray(article.images) ? article.images : [],
      blocks: Array.isArray(article.blocks) ? article.blocks : [],
    };
  }
  return {
    ...article,
    content: detail.content || '',
    images: detail.images || [],
    blocks: detail.blocks || [],
  };
}

/**
 * 批量：有内联详情则落盘并瘦身。
 * @returns {{ articles: object[], migrated: number }}
 */
function stripArticlesForIndex(articles) {
  if (!Array.isArray(articles)) return { articles: [], migrated: 0 };
  let migrated = 0;
  const out = articles.map((a) => {
    if (hasInlineDetail(a)) {
      migrated += 1;
      return persistArticleDetail(a);
    }
    return toListArticle(a);
  });
  return { articles: out, migrated };
}

/**
 * 若 index 仍含正文/图集，迁移到 details/ 并返回瘦身后的数组。
 * @returns {{ articles: object[], migrated: number, changed: boolean }}
 */
function migrateFatIndex(articles) {
  const { articles: light, migrated } = stripArticlesForIndex(articles);
  return { articles: light, migrated, changed: migrated > 0 };
}

module.exports = {
  DETAILS_DIR,
  DETAIL_KEYS,
  ensureDetailsDir,
  detailPath,
  hasInlineDetail,
  extractDetail,
  toListArticle,
  writeDetail,
  persistArticleDetail,
  readDetail,
  hydrateArticle,
  stripArticlesForIndex,
  migrateFatIndex,
};
