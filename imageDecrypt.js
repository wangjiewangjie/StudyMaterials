// imageDecrypt.js
// Decrypts cover images from the source website.
// The website serves AES-encrypted images that are decrypted client-side
// via the decryptImage() function in zzz.js. This module loads that
// function in a VM sandbox and exposes a simple decryptBuffer() API.

const fs = require('fs');
const vm = require('vm');
const axios = require('axios');
const CryptoJS = require('crypto-js');

const BASE_URL = 'https://bite.ygvttlxzy.cc';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const ZZZ_URL = BASE_URL + '/usr/plugins/tbxw/js/zzz.js?v=20260630e';

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
