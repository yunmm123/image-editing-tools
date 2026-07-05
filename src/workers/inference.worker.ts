// Web Worker：在后台线程运行 AI 推理，避免阻塞 UI
// 支持 AI 抠图（image-segmentation）和图片放大（image-to-image）

/// <reference lib="webworker" />

import {
  pipeline,
  env,
  RawImage,
  type ImageSegmentationPipeline,
  type ImageToImagePipeline,
} from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse, ProgressInfo } from '../types';

// 配置 transformers.js：
// - allowLocalModels=false：不从本地加载（GitHub Pages 无 /models 路径）
// - 使用 HF CDN 远程加载并缓存到 IndexedDB
env.allowLocalModels = false;
env.useBrowserCache = true;

// 已加载的 pipeline 缓存（同任务复用）
const pipelineCache = new Map<string, unknown>();

/** 推理后端检测：优先 WebGPU，不可用则回退 WASM */
async function detectBackend(): Promise<'webgpu' | 'wasm'> {
  try {
    // @ts-expect-error navigator.gpu 在旧 TS 类型上不存在
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      return 'webgpu';
    }
  } catch {
    /* noop */
  }
  return 'wasm';
}

/** 创建或复用 pipeline */
async function getPipeline<T>(
  task: 'image-segmentation' | 'image-to-image',
  modelId: string,
  onProgress: (info: ProgressInfo) => void
): Promise<T> {
  const key = `${task}:${modelId}`;
  if (pipelineCache.has(key)) {
    onProgress({ progress: 100, stage: '使用已缓存模型' });
    return pipelineCache.get(key) as T;
  }
  const backend = await detectBackend();
  const device = backend === 'webgpu' ? 'webgpu' : 'wasm';
  // transformers.js 的 pipeline 类型要求 task 为字面量联合，这里强制转换
  const pipe = (await pipeline(task, modelId, {
    device,
    dtype: backend === 'webgpu' ? 'fp32' : 'q8',
    progress_callback: (data: unknown) => {
      // transformers.js 的进度回调数据结构
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
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as T;
  pipelineCache.set(key, pipe);
  return pipe;
}

/** 将 RawImage 的 data（Uint8Array）安全拷贝为 Uint8ClampedArray */
function toClampedArray(data: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  out.set(data);
  return out;
}

/** 抠图：返回带 alpha 通道的 RGBA ImageData */
async function removeBackground(
  imageData: ImageData,
  onProgress: (info: ProgressInfo) => void
): Promise<ImageData> {
  onProgress({ progress: 0, stage: '加载抠图模型' });
  const segmenter = await getPipeline<ImageSegmentationPipeline>(
    'image-segmentation',
    'briaai/RMBG-1.4',
    onProgress
  );

  onProgress({ progress: 30, stage: '正在推理（分割背景）' });

  // 将主线程传过来的 ImageData 包装成 RawImage
  const inputImage = new RawImage(
    new Uint8Array(imageData.data),
    imageData.width,
    imageData.height,
    4
  );

  // 推理：返回遮罩列表
  const result = (await segmenter(inputImage, { threshold: 0.5 })) as Array<{
    mask: RawImage;
  }>;

  const mask = result[0]?.mask;
  if (!mask) throw new Error('模型未返回有效遮罩');

  // 把遮罩作为 alpha 通道写入原图
  const out = toClampedArray(new Uint8Array(imageData.data));
  const maskData = mask.data;
  const maskW = mask.width;
  const maskH = mask.height;
  const w = imageData.width;
  const h = imageData.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 双线性采样遮罩（遮罩尺寸可能与原图不同）
      const sx = (x / w) * maskW;
      const sy = (y / h) * maskH;
      const mx = Math.min(maskW - 1, Math.floor(sx));
      const my = Math.min(maskH - 1, Math.floor(sy));
      const idx = my * maskW + mx;
      const alpha = maskData[idx];
      const outIdx = (y * w + x) * 4 + 3;
      out[outIdx] = alpha;
    }
  }

  onProgress({ progress: 100, stage: '抠图完成' });
  return new ImageData(out, w, h);
}

/** 超分辨率：固定 4 倍放大，返回放大后的 RGBA ImageData（2x 由主线程缩放） */
async function superResolve(
  imageData: ImageData,
  onProgress: (info: ProgressInfo) => void
): Promise<ImageData> {
  onProgress({ progress: 0, stage: '加载超分辨率模型' });
  const upscaler = await getPipeline<ImageToImagePipeline>(
    'image-to-image',
    'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr',
    onProgress
  );

  onProgress({ progress: 30, stage: '正在推理（图像超分）' });

  const inputImage = new RawImage(
    new Uint8Array(imageData.data),
    imageData.width,
    imageData.height,
    4
  );

  // image-to-image pipeline 返回 RawImage 或张量
  const output = (await upscaler(inputImage)) as RawImage;

  // 输出可能是 3 通道（RGB），统一转成 4 通道 RGBA
  const outChannels = output.channels;
  const w = output.width;
  const h = output.height;
  const src = output.data;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < src.length; i += outChannels, j += 4) {
    rgba[j] = src[i];
    rgba[j + 1] = outChannels >= 2 ? src[i + 1] : src[i];
    rgba[j + 2] = outChannels >= 3 ? src[i + 2] : src[i];
    rgba[j + 3] = 255;
  }

  onProgress({ progress: 100, stage: '超分完成' });
  return new ImageData(rgba, w, h);
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
      const result = await superResolve(p.image, sendProgress);
      send({ id, type: 'result', payload: result });
    } else {
      throw new Error(`未知的任务类型: ${type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ id, type: 'error', payload: message });
  }
};
