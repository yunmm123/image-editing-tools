<div align="center">

# PicBetter

### AI 图片处理工具 · 100% 本地处理 · 隐私优先

<p>
  <img src="public/favicon.svg" width="72" height="72" alt="PicBetter Logo" />
</p>

![License: MIT](https://img.shields.io/badge/License-MIT-brand-600.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)

</div>

---

> **中文** | [English](#english)

## 📖 项目简介

**PicBetter** 是一款免费、开源、隐私安全的 AI 图片在线处理工具。

所有图片处理能力**完全在浏览器本地运行**，图片**不会上传到任何服务器**，最大程度保护你的隐私。
AI 能力基于 [`@huggingface/transformers`](https://github.com/huggingface/transformers.js)（Transformers.js v4）实现，支持 WebGPU 加速与 WASM 降级。

## ✨ 功能列表

| 功能 | 说明 | 技术 |
| --- | --- | --- |
| 🎨 **AI 智能抠图** | 一键移除背景，生成透明 PNG，可换纯色背景 | `briaai/RMBG-1.4` |
| 🔍 **AI 无损放大** | 2x / 4x 超分辨率，让模糊小图变高清 | `Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr` |
| 🪄 **老照片修复** | 自动白平衡 + CLAHE 对比度 + 双边去噪 + 锐化 | 纯 JS Canvas 算法 |
| 🗜️ **图片压缩** | 质量可调，JPEG/WebP/AVIF，批量 ZIP 下载 | Canvas 重编码 |
| 🔁 **格式转换** | PNG / JPEG / WebP / AVIF / BMP 互转 | Canvas 重编码 |
| 🪪 **证件照换底** | 一寸 / 二寸规格，白蓝红渐变背景 | 复用抠图模型 |

### 功能对比截图

> 以下为占位图，请替换为实际的 before/after 截图。

| AI 抠图 | AI 放大 | 老照片修复 |
| --- | --- | --- |
| ![remove-bg](https://via.placeholder.com/480x300/EEF2FF/4F46E5?text=AI+%E6%8A%A0%E5%9B%BE+Before+%2F+After) | ![upscale](https://via.placeholder.com/480x300/ECFDF5/10B981?text=AI+%E6%94%BE%E5%A4%A7+Before+%2F+After) | ![restore](https://via.placeholder.com/480x300/FEF3C7/D97706?text=%E8%80%81%E7%85%A7%E7%89%87%E4%BF%AE%E5%A4%8D+Before+%2F+After) |

## 🛠️ 技术栈

- **框架**：React 18 + TypeScript 5
- **构建工具**：Vite 5
- **样式**：Tailwind CSS 3
- **AI 推理**：`@huggingface/transformers` v4（WebGPU / WASM 后端，Web Worker 中执行）
- **图片导出**：`html-to-image`
- **图标**：`lucide-react`
- **路由**：`react-router-dom` v6
- **ZIP 打包**：`jszip`
- **部署**：GitHub Pages + GitHub Actions

## 🚀 本地运行

> **注意**：AI 模型从 Hugging Face CDN 加载，国内不开代理可能很慢；首次加载大模型（> 50MB）需要等待。模型会缓存到 IndexedDB，后续加载秒开。

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

打开浏览器访问 `http://localhost:5173/image-editing-tools/` 即可。

> 推荐使用 Chrome 113+ 以获得 WebGPU 加速，性能显著优于 CPU 推理。

## 🧠 AI 模型加载策略

- 首次加载显示进度条（模型下载百分比）
- 模型缓存到 IndexedDB，后续秒开
- WebGPU 不可用时自动降级到 WASM 后端
- 推理在 Web Worker 中执行，不阻塞主线程 UI

| 后端 | 抠图耗时（参考） | 放大耗时（参考） |
| --- | --- | --- |
| WebGPU | < 5 秒 | 取决于图片大小 |
| WASM / CPU | < 15 秒 | 取决于图片大小 |

## 💖 赞助

如果 PicBetter 帮到了你，欢迎请作者喝杯咖啡 ☕

<div align="center">

| 支付宝 | 微信 |
| :---: | :---: |
| ![支付宝赞赏码占位](https://via.placeholder.com/200x200/FFFFFF/1677FF?text=%E6%94%AF%E4%BB%98%E5%AE%9D%E8%B5%9E%E8%B5%8F%E7%A0%81) | ![微信赞赏码占位](https://via.placeholder.com/200x200/FFFFFF/07C160?text=%E5%BE%AE%E4%BF%A1%E8%B5%9E%E8%B5%8F%E7%A0%81) |
| _替换为你的赞赏码_ | _替换为你的赞赏码_ |

</div>

## ⭐ Star History

<div align="center">

![Star History Chart](https://api.star-history.com/svg?repos=yunmm123/image-editing-tools&type=Date)

</div>

## 📄 License

[MIT](./LICENSE)

---

<a name="english"></a>

# PicBetter (English)

### AI Image Processing Toolkit · 100% Local · Privacy-First

## 📖 Introduction

**PicBetter** is a free, open-source, privacy-safe AI image processing tool.

All image processing runs **entirely in your browser** — your images are **never uploaded** to any server. AI capabilities are powered by [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) (Transformers.js v4) with WebGPU acceleration and WASM fallback.

## ✨ Features

| Feature | Description | Tech |
| --- | --- | --- |
| 🎨 **AI Background Removal** | One-click transparent PNG, with solid color background swap | `briaai/RMBG-1.4` |
| 🔍 **AI Super Resolution** | 2x / 4x upscale, sharpen blurry images | `Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr` |
| 🪄 **Old Photo Restoration** | White balance + CLAHE + bilateral denoise + sharpen | Pure JS Canvas |
| 🗜️ **Image Compression** | Quality slider, JPEG/WebP/AVIF, batch ZIP | Canvas re-encode |
| 🔁 **Format Conversion** | PNG / JPEG / WebP / AVIF / BMP | Canvas re-encode |
| 🪪 **ID Photo** | 1-inch / 2-inch sizes, white/blue/red backgrounds | Reuses BG removal |

## 🛠️ Tech Stack

React 18 · TypeScript 5 · Vite 5 · Tailwind CSS 3 · `@huggingface/transformers` v4 · `lucide-react` · `react-router-dom` v6 · `jszip` · `html-to-image`

## 🚀 Getting Started

> **Note:** AI models are loaded from the Hugging Face CDN. First-time downloads of large models (> 50MB) take time. Models are cached in IndexedDB for instant subsequent loads.

```bash
npm install
npm run dev      # start dev server
npm run build    # production build
```

> Chrome 113+ is recommended for WebGPU acceleration.

## 🧠 AI Model Strategy

- Progress bar during first model download
- Models cached in IndexedDB
- Automatic WebGPU → WASM fallback
- Inference runs in a Web Worker (non-blocking UI)

## 💖 Sponsor

If PicBetter helps you, consider buying the author a coffee ☕

<div align="center">

| Alipay | WeChat |
| :---: | :---: |
| ![Alipay placeholder](https://via.placeholder.com/200x200/FFFFFF/1677FF?text=Alipay) | ![WeChat placeholder](https://via.placeholder.com/200x200/FFFFFF/07C160?text=WeChat) |
| _Replace with your QR code_ | _Replace with your QR code_ |

</div>

## ⭐ Star History

![Star History Chart](https://api.star-history.com/svg?repos=yunmm123/image-editing-tools&type=Date)

## 📄 License

[MIT](./LICENSE)
