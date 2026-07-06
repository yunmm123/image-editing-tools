import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { execSync } from 'node:child_process';

// 应用版本号：取 git commit hash（前 8 位），同一 commit 重复构建版本相同，
// 新 commit 部署后版本变化，用于触发 localStorage 中的自定义 API 配置重置。
// dev 模式或无 git 环境时回退到固定值，避免开发时反复清空。
let appVersion = 'dev';
try {
  appVersion = execSync('git rev-parse HEAD').toString().trim().slice(0, 8);
} catch {
  // 无 git 环境（如某些 CI），使用构建时间戳兜底
  appVersion = `build-${Date.now()}`;
}

// Vite 配置：GitHub Pages 部署使用 /image-editing-tools/ 作为 base 路径
export default defineConfig({
  base: '/image-editing-tools/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
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
