import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND_PORT = process.env.VITE_BACKEND_PORT || process.env.SERVER_PORT || '8080';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
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
      '/fax': `http://localhost:${BACKEND_PORT}`,
      '/status': `http://localhost:${BACKEND_PORT}`,
      '/debug': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/auth': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/callback': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/overlay': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
})
