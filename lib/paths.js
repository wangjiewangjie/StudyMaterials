// 应用根目录（只读资源）与可写数据目录。
// Electron 打包后通过 STUDY_DATA_DIR 指向 userData，避免写入 asar。

const path = require('path');
const fs = require('fs');

const APP_ROOT = process.env.STUDY_APP_ROOT
  ? path.resolve(process.env.STUDY_APP_ROOT)
  : path.resolve(__dirname, '..');

const DATA_DIR = process.env.STUDY_DATA_DIR
  ? path.resolve(process.env.STUDY_DATA_DIR)
  : path.join(APP_ROOT, 'output');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

module.exports = { APP_ROOT, DATA_DIR, ensureDataDir };
