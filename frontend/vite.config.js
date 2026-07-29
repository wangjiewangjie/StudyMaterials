import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Vite config: dev server proxies /api and /proxy to Express,
// build outputs to ../public/build so Express serves it in production.
//
// 后端端口自动读取自项目根目录的 .server-port 文件（由 server.js 写入），
// 若文件不存在则回退到默认 3000。

const portFile = path.resolve(__dirname, '..', '.server-port');
const backendPort = fs.existsSync(portFile)
  ? parseInt(fs.readFileSync(portFile, 'utf8').trim(), 10) || 3000
  : 3000;

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: '../public/build',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${backendPort}`,
      '/proxy': `http://localhost:${backendPort}`,
      '/files': `http://localhost:${backendPort}`,
    },
  },
});
