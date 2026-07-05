// Web Worker：在后台线程运行 AI 推理，避免阻塞 UI
// 支持 AI 抠图（background-removal）和图片放大（image-to-image）

/// <reference lib="webworker" />

import {
  pipeline,
  env,
  RawImage,
} from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse, ProgressInfo } from '../types';

// 配置 transformers.js：
// - allowLocalModels=false：不从本地加载（GitHub Pages 无 /models 路径）
// - 使用 HF CDN 远程加载并缓存到 IndexedDB
env.allowLocalModels = false;
env.useBrowserCache = true;

// 已加载的 pipeline 缓存（同任务+同后端复用）
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

/** 创建或复用 pipeline
 *  forceWasm=true 时强制使用 WASM 后端（用于 WebGPU 不稳定的模型）
 */
async function getPipeline<T>(
  task: 'background-removal' | 'image-to-image',
  modelId: string,
  onProgress: (info: ProgressInfo) => void,
  forceWasm = false
): Promise<T> {
  const backend = forceWasm ? 'wasm' : await detectBackend();
  const key = `${task}:${modelId}:${backend}`;
  if (pipelineCache.has(key)) {
    onProgress({ progress: 100, stage: '使用已缓存模型' });
    return pipelineCache.get(key) as T;
  }
  const device = backend === 'webgpu' ? 'webgpu' : 'wasm';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipe = (await pipeline(task, modelId, {
    device,
    dtype: backend === 'webgpu' ? 'fp32' : 'q8',
    progress_callback: (data: unknown) => {
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

/** 将 Uint8Array 安全拷贝为 Uint8ClampedArray */
function toClampedArray(data: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  out.set(data);
  return out;
}

/**
 * 抠图：使用 background-removal task 加载 RMBG-1.4
 * 返回带 alpha 通道的 RGBA ImageData
 */
async function removeBackground(
  imageData: ImageData,
  onProgress: (info: ProgressInfo) => void
): Promise<ImageData> {
  onProgress({ progress: 0, stage: '加载抠图模型（background-removal）' });

  // 注意：image-segmentation task 不支持 SegformerForSemanticSegmentation，
  // 必须使用 background-removal task，该 task 注册了 Segformer 模型类
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segmenter = await getPipeline<any>(
    'background-removal',
    'briaai/RMBG-1.4',
    onProgress
  );

  onProgress({ progress: 50, stage: '正在推理（分割背景）' });

  // 将主线程传来的 ImageData 包装成 RawImage
  const inputImage = new RawImage(
    new Uint8Array(imageData.data),
    imageData.width,
    imageData.height,
    4
  );

  // background-removal pipeline 返回 RawImage（已应用 alpha 通道）
  // 单张输入返回单个 RawImage，批量输入返回数组
  const output = (await segmenter(inputImage, { threshold: 0.5 })) as
    | RawImage
    | RawImage[];

  const result: RawImage = Array.isArray(output) ? output[0] : output;
  if (!result || !result.data) throw new Error('模型未返回有效结果');

  onProgress({ progress: 100, stage: '抠图完成' });
  return new ImageData(
    toClampedArray(result.data),
    result.width,
    result.height
  );
}

/**
 * 超分辨率：使用 image-to-image task 加载 swin2SR
 * swin2SR 在 WebGPU 上有已知 bug（compute pipeline 创建失败），
 * 因此强制使用 WASM 后端保证稳定性
 */
async function superResolve(
  imageData: ImageData,
  onProgress: (info: ProgressInfo) => void
): Promise<ImageData> {
  onProgress({ progress: 0, stage: '加载超分辨率模型（WASM 后端）' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upscaler = await getPipeline<any>(
    'image-to-image',
    'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr',
    onProgress,
    true // forceWasm: swin2SR 在 WebGPU 上不稳定
  );

  onProgress({ progress: 40, stage: '正在推理（4x 超分，WASM 较慢请耐心等待）' });

  const inputImage = new RawImage(
    new Uint8Array(imageData.data),
    imageData.width,
    imageData.height,
    4
  );

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
