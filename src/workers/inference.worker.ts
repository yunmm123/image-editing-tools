// Web Worker：在后台线程运行 AI 推理，避免阻塞 UI
//
// 抠图实现说明：
//   直接调用 AutoModel + AutoProcessor（参照 transformers.js 官方示例）：
//   1. processor 预处理图片（内部 resize + 归一化）
//   2. model 推理得到 alpha matte
//   3. 将 matte resize 回原图尺寸
//   4. 仅替换原图 alpha 通道，RGB 完全保留
//   这样输出尺寸 = 输入尺寸，且 RGB 不被模型预处理改变。
//
// 重要：必须根据后端指定 dtype。
//   - WebGPU: fp32（GPU 显存充足）
//   - WASM:   q8  （量化降低内存，否则 std::bad_alloc 内存分配失败）

/// <reference lib="webworker" />

import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse, ProgressInfo } from '../types';

// 配置 transformers.js：
// - allowLocalModels=false：不从本地加载（GitHub Pages 无 /models 路径）
// - 使用 HF CDN 远程加载并缓存到 IndexedDB
env.allowLocalModels = false;
env.useBrowserCache = true;

// 模型缓存（同后端复用）
const modnetCache = new Map<string, { model: unknown; processor: unknown }>();

/** 推理后端检测：优先 WebGPU，不可用则回退 WASM */
function detectBackend(): 'webgpu' | 'wasm' {
  try {
    if (
      typeof navigator !== 'undefined' &&
      (navigator as Navigator & { gpu?: unknown }).gpu
    ) {
      return 'webgpu';
    }
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
 *
 * 关键：根据后端指定 dtype，WASM 必须用 q8 量化否则内存溢出（std::bad_alloc）
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
  // WebGPU 用 fp32，WASM 用 q8 量化（降低内存占用，防止 bad_alloc）
  const dtype = backend === 'webgpu' ? 'fp32' : 'q8';
  const opts = {
    device: backend,
    dtype,
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

// Worker 消息处理（仅处理抠图任务；放大已改为 Canvas 实现，不走 worker）
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
    } else {
      throw new Error(`未知的任务类型: ${type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ id, type: 'error', payload: message });
  }
};
