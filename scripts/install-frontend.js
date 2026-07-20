// Install frontend deps after root `npm install`.
// Uses SKIP_FRONTEND_INSTALL to avoid infinite recursion: nested
// `npm install` under frontend/ can re-trigger this root postinstall
// (npm walks up to the parent package.json on Windows).
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
