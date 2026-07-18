import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config: dev server proxies /api and /proxy to Express (port 3000),
// build outputs to ../public/build so Express serves it in production.
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
      '/api': 'http://localhost:3000',
      '/proxy': 'http://localhost:3000',
      '/files': 'http://localhost:3000',
    },
  },
});
