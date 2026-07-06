<div align="center">

# PicBetter

### AI 图片处理工具 · 100% 本地处理 · 隐私优先

<p>
  <img src="public/favicon.svg" width="72" height="72" alt="PicBetter Logo" />
</p>

### 🚀 [在线立即使用(免下载)](https://yunmm123.github.io/image-editing-tools/)

![License: MIT](https://img.shields.io/badge/License-MIT-brand-600.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)

</div>

---

> **中文** | [English](#english)

## 📖 项目简介

**PicBetter** 是一款免费、开源、隐私安全的 AI 图片在线处理工具。

所有图片处理能力**完全在浏览器本地运行**,图片**不会上传到任何服务器**,最大程度保护你的隐私。

### 核心理念

- 🔒 **隐私优先**:图片全程留在你的浏览器,断网也能用
- 🆓 **完全免费**:所有功能不限次、不限量、无广告、无需登录
- 🤖 **默认免费 AI + 可选自定义 API**:内置免费云端/本地 AI 模型,同时支持接入你自己的付费 API
- 🌐 **开源透明**:代码全程公开,可自行审计、二次开发、私有部署

## ✨ 功能列表

| 功能 | 说明 | 技术 |
| --- | --- | --- |
| 🎨 **AI 智能抠图** | 一键移除背景,生成透明 PNG,支持换纯色背景;复杂图片可手动笔刷修正主体 | `Xenova/modnet` + 蒙版编辑器 |
| 🔍 **AI 图片放大** | 2x / 4x 高清放大,清晰图片更清晰,可选人脸增强(GFPGAN) | image-upscaling.net Real-ESRGAN(免费云端) |
| 🪄 **AI 模糊修复** | 让失焦、模糊的老照片重获细节(AI 重绘,非简单锐化) | image-upscaling.net diffuser-lite 扩散模型(免费) |
| 🪪 **证件照换底** | 一寸 / 二寸规格,白蓝红渐变背景一键切换 | 复用抠图模型 |
| 📛 **图片水印** | 文字/图片水印,支持平铺铺满、旋转、透明度调整 | 纯 JS Canvas |
| 🗜️ **图片压缩** | 质量可调,JPEG/WebP/AVIF,批量 ZIP 下载 | Canvas 重编码 |
| 🔁 **格式转换** | PNG / JPEG / WebP / AVIF / BMP 互转,批量处理 | Canvas 重编码 |

### 图片放大三种引擎

| 引擎 | 说明 | 适用场景 |
| --- | --- | --- |
| ☁️ **云端 AI** | image-upscaling.net Real-ESRGAN,完全免费,无需注册/API Key | 质量最高,推荐首选 |
| ✨ **本地 AI** | UpscalerJS ESRGAN,纯本地,首次需下载模型 | 离线/网络差时 |
| ⚡ **Canvas 快速** | 多轮锐化,秒级完成,无模型 | 快速预览 |

### 自定义 API(可选)

所有 AI 功能(放大、模糊修复、抠图)默认使用免费方案。如果你想接入自己的付费/更强大的 API,可在顶部「⚙️ 设置」中切换为「自定义 API」,填入 URL + Key + 响应格式即可。

**API 契约**(通用 HTTP 图像处理接口):

```
请求:
  POST {你的API地址}
  Headers: Authorization: Bearer {apiKey}
  Body: multipart/form-data
    image: PNG 图片文件
    scale: "2" | "4"          (仅放大)
    mode: "upscale"|"restore" (仅放大)
    face_enhance: "true"|"false"(仅放大)

响应(二选一):
  blob    → 直接返回图片二进制
  json-url→ {"url": "https://结果图URL"}
```

> 保存配置时会校验 URL 合法性(协议、域名、格式),非法输入不允许保存。

## 🛠️ 技术栈

- **框架**:React 18 + TypeScript 5
- **构建工具**:Vite 5
- **样式**:Tailwind CSS 3
- **AI 推理**:`@huggingface/transformers` v4(WebGPU / WASM 后端,Web Worker 中执行)
- **云端 AI**:image-upscaling.net 免费 Real-ESRGAN / diffuser-lite API
- **图片导出**:`html-to-image`
- **图标**:`lucide-react`
- **路由**:`react-router-dom` v6
- **ZIP 打包**:`jszip`
- **部署**:GitHub Pages + GitHub Actions

## 🚀 本地运行

> **注意**:AI 模型从 Hugging Face CDN 加载,国内不开代理可能很慢;首次加载大模型(> 50MB)需要等待。模型会缓存到 IndexedDB,后续加载秒开。

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

> 推荐使用 Chrome 113+ 以获得 WebGPU 加速,性能显著优于 CPU 推理。

## 🧠 AI 模型加载策略

- 首次加载显示进度条(模型下载百分比)
- 模型缓存到 IndexedDB,后续秒开
- WebGPU 不可用时自动降级到 WASM 后端
- 推理在 Web Worker 中执行,不阻塞主线程 UI

| 后端 | 抠图耗时(参考) | 放大耗时(参考) |
| --- | --- | --- |
| WebGPU | < 5 秒 | 取决于图片大小 |
| WASM / CPU | < 15 秒 | 取决于图片大小 |

## 🔒 隐私说明

- **图片**:所有处理在浏览器本地完成,图片数据**绝不离开你的设备**
- **云端 AI 放大**:仅在使用「云端 AI」引擎时,图片会发送到 image-upscaling.net 进行推理(可切换为「本地 AI」或「自定义 API」完全避免上传)
- **设置数据**:自定义 API 配置存在浏览器 `localStorage`,不上传任何服务器
- **版本切换**:每次部署新版本后,自定义 API 配置会自动清空,需重新输入(防止旧配置残留导致不可用)

## 💖 赞助

如果 PicBetter 帮到了你,欢迎请作者喝杯咖啡 ☕

> 赞助完全自愿,不影响任何功能使用,所有功能对所有人完全平等。

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

### 🚀 [Use Online Now (No Download)](https://yunmm123.github.io/image-editing-tools/)

## 📖 Introduction

**PicBetter** is a free, open-source, privacy-safe AI image processing tool.

All image processing runs **entirely in your browser** — your images are **never uploaded** to any server.

### Core Principles

- 🔒 **Privacy-First**: Images stay in your browser, works offline
- 🆓 **Completely Free**: No limits, no ads, no login required
- 🤖 **Free AI by default + Optional custom API**: Built-in free cloud/local AI models, with the option to plug in your own paid API
- 🌐 **Open Source**: Fully auditable, modifiable, self-hostable

## ✨ Features

| Feature | Description | Tech |
| --- | --- | --- |
| 🎨 **AI Background Removal** | One-click transparent PNG, color swap, manual brush correction for complex images | `Xenova/modnet` + Mask editor |
| 🔍 **AI Upscale** | 2x / 4x upscale with optional face enhancement (GFPGAN) | image-upscaling.net Real-ESRGAN (free cloud) |
| 🪄 **AI Restore** | Re-detail blurry/old photos via AI repaint (not just sharpening) | image-upscaling.net diffuser-lite (free cloud) |
| 🪪 **ID Photo** | 1-inch / 2-inch sizes, white/blue/red backgrounds | Reuses BG removal |
| 📛 **Watermark** | Text/image watermark, tile fill, rotation, opacity | Pure JS Canvas |
| 🗜️ **Compression** | Quality slider, JPEG/WebP/AVIF, batch ZIP | Canvas re-encode |
| 🔁 **Format Convert** | PNG / JPEG / WebP / AVIF / BMP, batch | Canvas re-encode |

### Custom API (Optional)

All AI features use the free built-in models by default. To plug in your own paid/more powerful API, switch to "Custom API" in the top "⚙️ Settings" panel and provide URL + Key + response type.

See the API contract in the [Chinese section](#-自定义-api可选) above.

## 🛠️ Tech Stack

React 18 · TypeScript 5 · Vite 5 · Tailwind CSS 3 · `@huggingface/transformers` v4 · image-upscaling.net API · `lucide-react` · `react-router-dom` v6 · `jszip` · `html-to-image`

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

| Backend | BG Removal (ref) | Upscale (ref) |
| --- | --- | --- |
| WebGPU | < 5s | Depends on size |
| WASM / CPU | < 15s | Depends on size |

## 🔒 Privacy

- **Images**: All processing happens locally in your browser — image data **never leaves your device**
- **Cloud AI Upscale**: Only when using the "Cloud AI" engine, images are sent to image-upscaling.net for inference (switch to "Local AI" or "Custom API" to avoid any upload)
- **Settings**: Custom API config is stored in browser `localStorage`, never uploaded
- **Version Reset**: Custom API config is automatically cleared on each new deploy, requiring re-entry (prevents stale config)

## 💖 Sponsor

If PicBetter helps you, consider buying the author a coffee ☕

> Sponsorship is purely voluntary and does not affect any functionality.

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
