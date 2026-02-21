import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';

// 環境変数からポートを取得
const BACKEND_PORT = process.env.VITE_BACKEND_PORT || process.env.SERVER_PORT || '8080';
const FRONTEND_PORT = process.env.VITE_FRONTEND_PORT ? parseInt(process.env.VITE_FRONTEND_PORT) : 5174;
console.log(`[vite] API proxy target: http://localhost:${BACKEND_PORT}`);

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // 本番は /overlay/ 配下で配信する
  base: mode === 'production' ? '/overlay/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared/src'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: FRONTEND_PORT,
    fs: {
      allow: [
        path.resolve(__dirname, '..'),
        path.resolve(__dirname, '../shared'),
      ],
    },
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${BACKEND_PORT}`,
        ws: true,
        changeOrigin: true,
      },
      // '/events': `http://localhost:${BACKEND_PORT}`, // SSE削除
      '/fax': `http://localhost:${BACKEND_PORT}`,
      '/status': `http://localhost:${BACKEND_PORT}`,
      '/debug': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    }
  }
}));
