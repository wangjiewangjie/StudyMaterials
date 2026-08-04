// 根目录 npm install 后自动安装 frontend 依赖。
// SKIP_FRONTEND_INSTALL 防止嵌套 npm install 再次触发本脚本（Windows 上会向上找到根 package.json）。
'use strict';

if (process.env.SKIP_FRONTEND_INSTALL) {
  process.exit(0);
}

const path = require('path');
const { spawnSync } = require('child_process');

const frontendDir = path.join(__dirname, '..', 'frontend');
const result = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, SKIP_FRONTEND_INSTALL: '1' },
});

process.exit(result.status === null ? 1 : result.status);
