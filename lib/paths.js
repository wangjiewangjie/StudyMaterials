/**
 * lib/paths.js — 应用根目录与可写数据目录契约
 *
 * - APP_ROOT：只读资源（前端 build、图标等）；开发态为仓库根，打包态由 Electron 注入 STUDY_APP_ROOT
 * - DATA_DIR：索引 / 收藏 / 站点等可写数据；开发态为 <APP_ROOT>/output，打包态为 userData/output
 * - 必须在 require('./crawler') / require('../server') 之前设置环境变量，否则模块顶层已固化路径
 */

const path = require('path');
const fs = require('fs');

/** @type {string} 只读应用根目录（绝对路径） */
const APP_ROOT = process.env.STUDY_APP_ROOT
  ? path.resolve(process.env.STUDY_APP_ROOT)
  : path.resolve(__dirname, '..');

/** @type {string} 可写数据目录（绝对路径） */
const DATA_DIR = process.env.STUDY_DATA_DIR
  ? path.resolve(process.env.STUDY_DATA_DIR)
  : path.join(APP_ROOT, 'output');

/** 确保 DATA_DIR 存在；返回该路径 */
function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

module.exports = { APP_ROOT, DATA_DIR, ensureDataDir };
