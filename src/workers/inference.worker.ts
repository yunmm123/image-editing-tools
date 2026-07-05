// Web Worker：在后台线程运行 AI 推理，避免阻塞 UI
//
// 抠图实现说明：
//   不再使用 background-removal pipeline（其内部合成可能改变原图 RGB，
//   导致证件照换底后人物头发变色/变形）。改为直接调用 AutoModel +
//   AutoProcessor，参照 transformers.js 官方示例的做法：
//   1. processor 预处理图片（内部 resize + 归一化）
//   2. model 推理得到 alpha matte
//   3. 将 matte resize 回原图尺寸
//   4. 仅替换原图 alpha 通道，RGB 完全保留
//   这样输出尺寸 = 输入尺寸，且 RGB 不被模型预处理改变。
//
// 放大实现说明：
//   使用 Xenova/swin2SR-classical-sr-x2-64（2x 超分，比 realworld-x4 轻量）。
//   - 强制 WASM 后端（swin2SR 在 WebGPU 上 compute pipeline 创建失败）
//   - 限制输入最长边 ≤ 1024px，避免 WASM 整数溢出（SafeIntOnOverflow）
//   - 4x 模式 = 两次 2x（输入限制为 512px → 1024 → 2048）

/// <reference lib="webworker" />

import {
  AutoModel,
  AutoProcessor,
  RawImage,
  pipeline,
  env,
} from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse, ProgressInfo } from '../types';

// 配置 transformers.js：
// - allowLocalModels=false：不从本地加载（GitHub Pages 无 /models 路径）
// - 使用 HF CDN 远程加载并缓存到 IndexedDB
env.allowLocalModels = false;
env.useBrowserCache = true;

// 放大输入最长边上限（防止 WASM 整数溢出）
const UPSCALE_MAX_INPUT = 1024;

// 模型缓存
const modnetCache = new Map<string, { model: unknown; processor: unknown }>();
const upscalerCache = new Map<string, unknown>();

/** 推理后端检测：优先 WebGPU，不可用则回退 WASM */
function detectBackend(): 'webgpu' | 'wasm' {
  try {
    // @ts-expect-error navigator.gpu 在旧 TS 类型上不存在
    if (typeof navigator !== 'undefined' && navigator.gpu) return 'webgpu';
  } catch {
    /* noop */
  }
  return 'wasm';
}

/** 将 transformers.js 的下载进度事件翻译为 ProgressInfo */
function makeProgressCb(onProgress: (info: ProgressInfo) => void) {
  return (data: unknown) => {
    const d = data as Record<string, unknown>;
    const status = d.status as string | undefined;
    if (status === 'progress' && typeof d.progress === 'number') {
      onProgress({
        progress: d.progress as number,
        stage: '模型下载中',
        loaded: d.loaded as number | undefined,
        total: d.total as number | undefined,
        file: d.file as string | undefined,
      });
    } else if (status === 'ready') {
      onProgress({ progress: 100, stage: '模型加载完成' });
    } else if (status === 'initiate' || status === 'download') {
      onProgress({
        progress: 0,
        stage: status === 'initiate' ? '准备下载模型' : '正在下载模型',
        file: d.file as string | undefined,
      });
    }
  };
}

/**
 * 加载 MODNet 模型 + 处理器（抠图）
 * 模型选择：Xenova/modnet（Transformers.js 官方适配的轻量抠图模型，~6MB）
 */
async function getModnet(onProgress: (info: ProgressInfo) => void) {
  const backend = detectBackend();
  const key = `modnet:${backend}`;
  if (modnetCache.has(key)) {
    onProgress({ progress: 100, stage: '使用已缓存模型' });
    return modnetCache.get(key) as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      processor: any;
    };
  }
  onProgress({ progress: 0, stage: '加载抠图模型（Xenova/modnet）' });
  const cb = makeProgressCb(onProgress);
  const opts = {
    device: backend,
    progress_callback: cb,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = await AutoModel.from_pretrained('Xenova/modnet', opts as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processor = await AutoProcessor.from_pretrained('Xenova/modnet', {
    progress_callback: cb,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const entry = { model, processor };
  modnetCache.set(key, entry);
  return entry;
}

/**
 * 抠图：手动调用 model + processor，保留原图 RGB，仅替换 alpha 通道
 *
 * 这是修复证件照换底"头发变色/变形"的关键：
 * - 输出尺寸始终 = 输入尺寸（matte resize 回原图尺寸）
 * - RGB 来自原图，不被模型预处理（resize/归一化）改变
 * - 只有 alpha 通道使用模型输出的 matte
 */
async function removeBackground(
  imageData: ImageData,
  onProgress: (info: ProgressInfo) => void
): Promise<ImageData> {
  const { model, processor } = await getModnet(onProgress);

  onProgress({ progress: 50, stage: '正在推理（分割背景）' });

  // 用原图 RGBA 构建 RawImage（processor 内部会转 RGB + 归一化）
  const image = new RawImage(
    new Uint8Array(imageData.data),
    imageData.width,
    imageData.height,
    4
  );

  // 预处理（内部 resize + 归一化）
  const { pixel_values } = await processor(image);

  // 推理 → alpha matte 张量
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outputs = await model({ input: pixel_values }) as Record<string, any>;
  // MODNet 输出键为 "output"，做兼容性兜底
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outTensor = (outputs.output ?? Object.values(outputs)[0]) as any;

  // 转为单通道 mask 并 resize 回原图尺寸（保证输出尺寸 = 输入尺寸）
  const mask = await RawImage.fromTensor(
    outTensor[0].mul(255).to('uint8')
  ).resize(imageData.width, imageData.height);

  // 关键：拷贝原图 RGBA，仅替换 alpha 通道
  // 这样人物头发等区域的 RGB 颜色完全保留，不会因模型预处理而变色
  const resultData = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < mask.data.length; i++) {
    resultData[4 * i + 3] = mask.data[i];
  }

  onProgress({ progress: 100, stage: '抠图完成' });
  return new ImageData(resultData, imageData.width, imageData.height);
}

/**
 * 加载超分放大模型
 * 模型选择：Xenova/swin2SR-classical-sr-x2-64（2x，比 realworld-x4 轻量）
 * 强制 WASM + q8 量化（swin2SR 在 WebGPU 上 compute pipeline 创建失败）
 */
async function getUpscaler(onProgress: (info: ProgressInfo) => void) {
  const key = 'upscaler:wasm:q8';
  if (upscalerCache.has(key)) {
    onProgress({ progress: 100, stage: '使用已缓存模型' });
    return upscalerCache.get(key);
  }
  onProgress({
    progress: 0,
    stage: '加载超分模型（Xenova/swin2SR-classical-sr-x2-64）',
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipe = (await pipeline(
    'image-to-image',
    'Xenova/swin2SR-classical-sr-x2-64',
    {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: makeProgressCb(onProgress),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  )) as any;
  upscalerCache.set(key, pipe);
  return pipe;
}

/**
 * 限制输入尺寸（等比缩小，最长边不超过 max）
 * 防止 WASM 后端因输出张量过大触发整数溢出（SafeIntOnOverflow）
 */
function limitInputSize(imageData: ImageData, max: number): ImageData {
  const { width, height } = imageData;
  if (width <= max && height <= max) return imageData;
  const ratio = width > height ? max / width : max / height;
  const nw = Math.max(1, Math.round(width * ratio));
  const nh = Math.max(1, Math.round(height * ratio));
  // Worker 中使用 OffscreenCanvas 进行高质量缩放
  const src = new OffscreenCanvas(width, height);
  const sctx = src.getContext('2d');
  if (!sctx) throw new Error('无法创建 OffscreenCanvas 2D 上下文');
  sctx.putImageData(imageData, 0, 0);
  const dest = new OffscreenCanvas(nw, nh);
  const dctx = dest.getContext('2d');
  if (!dctx) throw new Error('无法创建 OffscreenCanvas 2D 上下文');
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = 'high';
  dctx.drawImage(src, 0, 0, nw, nh);
  return dctx.getImageData(0, 0, nw, nh);
}

/** 执行一次 2x 超分放大 */
async function upscale2x(
  imageData: ImageData,
  onProgress: (info: ProgressInfo) => void
): Promise<ImageData> {
  const upscaler = await getUpscaler(onProgress);

  onProgress({ progress: 50, stage: '正在推理（超分放大）' });

  const input = new RawImage(
    new Uint8Array(imageData.data),
    imageData.width,
    imageData.height,
    4
  );
  const output = (await upscaler(input)) as RawImage;

  // 输出可能是 3 通道（RGB），统一转成 4 通道 RGBA
  const channels = output.channels;
  const w = output.width;
  const h = output.height;
  const src = output.data;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < src.length; i += channels, j += 4) {
    rgba[j] = src[i];
    rgba[j + 1] = channels >= 2 ? src[i + 1] : src[i];
    rgba[j + 2] = channels >= 3 ? src[i + 2] : src[i];
    rgba[j + 3] = 255;
  }
  return new ImageData(rgba, w, h);
}

/**
 * 超分辨率放大：支持 2x / 4x
 * - 2x：单次放大，输入限制 ≤ 1024px → 输出 ≤ 2048px
 * - 4x：两次 2x，输入限制 ≤ 512px → 1024 → 2048px
 */
async function superResolve(
  imageData: ImageData,
  scale: 2 | 4,
  onProgress: (info: ProgressInfo) => void
): Promise<ImageData> {
  if (scale === 2) {
    const limited = limitInputSize(imageData, UPSCALE_MAX_INPUT);
    return upscale2x(limited, onProgress);
  }

  // 4x = 两次 2x，输入限制减半以避免第二轮溢出
  const limited = limitInputSize(imageData, UPSCALE_MAX_INPUT / 2);
  onProgress({ progress: 10, stage: '第一轮 2x 放大' });
  const first = await upscale2x(limited, (info) => {
    onProgress({ ...info, progress: Math.round(info.progress * 0.45) + 10 });
  });
  onProgress({ progress: 55, stage: '第二轮 2x 放大' });
  const second = await upscale2x(first, (info) => {
    onProgress({ ...info, progress: Math.round(info.progress * 0.45) + 55 });
  });
  onProgress({ progress: 100, stage: '超分完成' });
  return second;
}

// Worker 消息处理
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;
  const send = (response: WorkerResponse) => {
    (self as unknown as Worker).postMessage(response);
  };
  const sendProgress = (info: ProgressInfo) => {
    send({ id, type: 'progress', payload: info });
  };

  try {
    if (type === 'remove-bg') {
      const data = payload as ImageData;
      const result = await removeBackground(data, sendProgress);
      send({ id, type: 'result', payload: result });
    } else if (type === 'upscale') {
      const p = payload as { image: ImageData; scale: number };
      const result = await superResolve(
        p.image,
        p.scale === 4 ? 4 : 2,
        sendProgress
      );
      send({ id, type: 'result', payload: result });
    } else {
      throw new Error(`未知的任务类型: ${type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ id, type: 'error', payload: message });
  }
};
