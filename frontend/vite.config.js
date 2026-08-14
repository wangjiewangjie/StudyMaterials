import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// 构建输出到 ../public/build；开发态把 /api /proxy 代理到后端。
// 后端端口读自根目录 .server-port（由 server.js 写入），默认 9999。

const portFile = path.resolve(__dirname, '..', '.server-port');
const backendPort = fs.existsSync(portFile)
  ? parseInt(fs.readFileSync(portFile, 'utf8').trim(), 10) || 9999
  : 9999;

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
    },
  },
});
