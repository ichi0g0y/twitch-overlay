import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const BACKEND_PORT = process.env.VITE_SERVER_PORT || '8080';

export default defineConfig({
  plugins: [react()],
  base: '/remote/',
  build: {
    outDir: '../dist/remote',  // web/dist/remote/ に出力
    emptyOutDir: true,
  },
  server: {
    port: 5175,
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
    }
  },
  define: {
    'import.meta.env.VITE_SERVER_PORT': JSON.stringify(BACKEND_PORT),
  }
});
