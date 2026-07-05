import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite 配置：GitHub Pages 部署使用 /image-editing-tools/ 作为 base 路径
export default defineConfig({
  base: '/image-editing-tools/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
  },
});
