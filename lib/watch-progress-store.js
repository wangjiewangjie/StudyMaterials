/**
 * lib/watch-progress-store.js — 播放进度持久化到 DATA_DIR/watch-progress.json
 * 结构：{ version: 1, updatedAt, items: { [id]: { t, d, updatedAt } } }
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR, ensureDataDir } = require('./paths');

const STORE_PATH = path.join(DATA_DIR, 'watch-progress.json');

let cache = null;

function emptyDoc() {
  return { version: 1, updatedAt: new Date().toISOString(), items: {} };
}

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    cache = {
      version: 1,
      updatedAt: raw.updatedAt || new Date().toISOString(),
      items: raw.items && typeof raw.items === 'object' ? raw.items : {},
    };
  } catch (_) {
    cache = emptyDoc();
  }
  return cache;
}

function save() {
  ensureDataDir();
  const doc = load();
  doc.updatedAt = new Date().toISOString();
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc), 'utf8');
  fs.renameSync(tmp, STORE_PATH);
}

/** @returns {Record<string, { t: number, d: number, updatedAt?: string }>} */
function getAll() {
  return { ...load().items };
}

function getOne(id) {
  if (!id) return null;
  const item = load().items[String(id)];
  return item || null;
}

/**
 * @param {string} id
 * @param {{ time?: number, duration?: number, t?: number, d?: number }} body
 */
function setOne(id, body) {
  if (!id) return null;
  const t = Math.floor(Number(body.time ?? body.t) || 0);
  const d = Math.floor(Number(body.duration ?? body.d) || 0);
  if (!(t > 5)) {
    delete load().items[String(id)];
    save();
    return null;
  }
  const entry = {
    t,
    d: d > 0 ? d : 0,
    updatedAt: new Date().toISOString(),
  };
  load().items[String(id)] = entry;
  save();
  return entry;
}

/** 批量合并（导入 / localStorage 迁移）；不降低已有更大进度 */
function mergeMany(items) {
  if (!items || typeof items !== 'object') return getAll();
  const doc = load();
  let changed = false;
  for (const [id, raw] of Object.entries(items)) {
    if (!id || !raw) continue;
    const t = Math.floor(Number(raw.t ?? raw.time) || 0);
    const d = Math.floor(Number(raw.d ?? raw.duration) || 0);
    if (!(t > 5)) continue;
    const prev = doc.items[id];
    if (prev && Number(prev.t) >= t) {
      if (d > 0 && !(Number(prev.d) > 0)) {
        prev.d = d;
        prev.updatedAt = new Date().toISOString();
        changed = true;
      }
      continue;
    }
    doc.items[id] = { t, d: d > 0 ? d : 0, updatedAt: new Date().toISOString() };
    changed = true;
  }
  if (changed) save();
  return { ...doc.items };
}

function removeOne(id) {
  if (!id) return;
  if (load().items[String(id)]) {
    delete load().items[String(id)];
    save();
  }
}

function replaceAll(items) {
  cache = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: items && typeof items === 'object' ? { ...items } : {},
  };
  save();
}

function bustCache() {
  cache = null;
}

module.exports = {
  STORE_PATH,
  getAll,
  getOne,
  setOne,
  mergeMany,
  removeOne,
  replaceAll,
  bustCache,
};
