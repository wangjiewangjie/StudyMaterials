import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

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
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('artplayer') || id.includes('hls.js')) return 'player';
          if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) return 'antd';
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${backendPort}`,
      '/proxy': `http://localhost:${backendPort}`,
    },
  },
});
