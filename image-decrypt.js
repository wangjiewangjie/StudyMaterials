// image-decrypt.js — 解密封面图。
// 源站封面经 AES 加密，浏览器侧靠 zzz.js 的 decryptImage 解密；
// 本模块在 VM 沙箱中加载同款逻辑，对外提供 decryptBuffer()。

const vm = require('vm');
const axios = require('axios');
const CryptoJS = require('crypto-js');

// zzz.js 由 post-card 源站提供；各站内容一致，换镜像只改 BASE_URL
const BASE_URL = 'https://armed.izbfsaxh.cc';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const ZZZ_URL = BASE_URL + '/usr/plugins/tbxw/js/zzz.js';

let _sandbox = null;
let _initPromise = null;

async function init() {
  if (_sandbox) return _sandbox;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const r = await axios.get(ZZZ_URL, {
      timeout: 30000,
      headers: { 'User-Agent': UA, Referer: BASE_URL + '/' },
    });
    const code = r.data;

    // Mock browser environment
    const mockEl = {
      style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
      querySelector() { return mockEl; }, querySelectorAll() { return []; },
      offsetWidth: 1920, offsetHeight: 1080,
      appendChild() {}, removeChild() {}, remove() {},
    };

    const sb = {
      CryptoJS,
      window: { devicePixelRatio: 1, innerWidth: 1920, innerHeight: 1080, screen: { availHeight: 1080 } },
      document: {
        createElement() { return mockEl; },
        querySelector() { return mockEl; }, querySelectorAll() { return []; },
        body: mockEl, head: mockEl, addEventListener() {},
      },
      console, String, parseInt,
      Mlog() {}, setTimeout, setInterval,
    };

    vm.createContext(sb);
    vm.runInContext(code, sb, { timeout: 5000 });

    if (typeof sb.decryptImage !== 'function') {
      throw new Error('decryptImage function not found in zzz.js');
    }

    _sandbox = sb;
    return _sandbox;
  })();

  return _initPromise;
}

// Decrypt an encrypted image buffer. Returns the decrypted image buffer.
async function decryptBuffer(encryptedBuf) {
  const sb = await init();
  const base64str = encryptedBuf.toString('base64');
  const result = sb.decryptImage(base64str);
  if (!result) throw new Error('decryption returned empty');
  return Buffer.from(result, 'base64');
}

module.exports = { decryptBuffer };
