// image-decrypt.js — 解密封面图（VM 沙箱加载源站 zzz.js 的 decryptImage）
// 多站点回退拉取 zzz.js，成功后写入本地缓存；网络不可达时用缓存。

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const CryptoJS = require('crypto-js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const ZZZ_CACHE = path.join(__dirname, 'output', 'zzz.js.cache');
const FALLBACK_BASES = [
  'https://armed.izbfsaxh.cc',
  'https://assert.pbtiodqn.cc',
  'https://band.hkllewakv.cc',
  'https://breast.eiejvjgex.cc',
];

let _sandbox = null;
let _initPromise = null;

function uniqBases(extra = []) {
  const out = [];
  const seen = new Set();
  for (const b of [...extra, ...FALLBACK_BASES]) {
    const n = String(b || '').replace(/\/$/, '').trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

async function fetchZzzCode(baseUrl) {
  const url = `${baseUrl}/usr/plugins/tbxw/js/zzz.js`;
  const r = await axios.get(url, {
    timeout: 20000,
    headers: { 'User-Agent': UA, Referer: `${baseUrl}/` },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const code = typeof r.data === 'string' ? r.data : String(r.data || '');
  if (!code || !/decryptImage/.test(code)) {
    throw new Error('zzz.js 无效或不含 decryptImage');
  }
  return code;
}

function readCachedZzz() {
  try {
    if (!fs.existsSync(ZZZ_CACHE)) return null;
    const code = fs.readFileSync(ZZZ_CACHE, 'utf8');
    return /decryptImage/.test(code) ? code : null;
  } catch (_) {
    return null;
  }
}

function writeCachedZzz(code) {
  try {
    fs.mkdirSync(path.dirname(ZZZ_CACHE), { recursive: true });
    fs.writeFileSync(ZZZ_CACHE, code, 'utf8');
  } catch (_) {
    // 静默：缓存写入失败不影响解密，下次回退到重新拉取
  }
}

async function resolveZzzCode(siteCandidates = []) {
  const bases = uniqBases(siteCandidates);
  const errors = [];
  for (const base of bases) {
    try {
      const code = await fetchZzzCode(base);
      writeCachedZzz(code);
      return code;
    } catch (e) {
      errors.push(`${base}: ${e.message}`);
    }
  }

  const cached = readCachedZzz();
  if (cached) {
    return cached;
  }

  throw new Error(
    `无法加载图片解密脚本 zzz.js（已试 ${bases.length} 站，且无本地缓存）。`
    + ` 详情: ${errors.slice(0, 3).join(' | ')}`
  );
}

function buildSandbox(code) {
  const mockEl = {
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    querySelector() { return mockEl; },
    querySelectorAll() { return []; },
    offsetWidth: 1920,
    offsetHeight: 1080,
    appendChild() {},
    removeChild() {},
    remove() {},
  };

  const sb = {
    CryptoJS,
    window: {
      devicePixelRatio: 1,
      innerWidth: 1920,
      innerHeight: 1080,
      screen: { availHeight: 1080 },
    },
    document: {
      createElement() { return mockEl; },
      querySelector() { return mockEl; },
      querySelectorAll() { return []; },
      body: mockEl,
      head: mockEl,
      addEventListener() {},
    },
    console,
    String,
    parseInt,
    Mlog() {},
    setTimeout,
    setInterval,
  };

  vm.createContext(sb);
  vm.runInContext(code, sb, { timeout: 8000 });
  if (typeof sb.decryptImage !== 'function') {
    throw new Error('在 zzz.js 中未找到 decryptImage 函数');
  }
  return sb;
}

/**
 * @param {string[]} [siteCandidates] 优先尝试的站点 origin 列表
 */
async function init(siteCandidates = []) {
  if (_sandbox) return _sandbox;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const code = await resolveZzzCode(siteCandidates);
      _sandbox = buildSandbox(code);
      return _sandbox;
    } catch (e) {
      _initPromise = null;
      throw e;
    }
  })();

  return _initPromise;
}

/** 启动时预热：拉取/缓存 zzz.js 并装载沙箱 */
async function ensureDecryptReady(siteCandidates = []) {
  await init(siteCandidates);
  return true;
}

/** 解密失败时允许用新的站点列表重试一次（清空缓存的沙箱） */
async function resetDecrypt() {
  _sandbox = null;
  _initPromise = null;
}

async function decryptBuffer(encryptedBuf, siteCandidates = []) {
  let sb;
  try {
    sb = await init(siteCandidates);
  } catch (e) {
    await resetDecrypt();
    sb = await init(siteCandidates);
  }

  const base64str = encryptedBuf.toString('base64');
  const result = sb.decryptImage(base64str);
  if (!result) throw new Error('解密返回空结果');
  return Buffer.from(result, 'base64');
}

module.exports = { decryptBuffer, resetDecrypt, ensureDecryptReady };
