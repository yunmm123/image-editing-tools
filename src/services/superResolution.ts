// 超分辨率服务：调度 Web Worker 完成 2x / 4x 超分放大
//
// Worker 内部使用 Xenova/swin2SR-classical-sr-x2-64 模型：
// - 2x：单次推理（输入限制 ≤ 1024px）
// - 4x：两次 2x 推理（输入限制 ≤ 512px，防止 WASM 整数溢出）

import { createCanvas, canvasToBlob } from '../utils/canvas';
import type { ProgressInfo } from '../types';

type RunInference = <T = unknown>(
  type: 'remove-bg' | 'upscale',
  payload: unknown,
  onProgress?: (info: ProgressInfo) => void
) => Promise<T>;

interface UpscaleOptions {
  imageData: ImageData;
  /** 放大倍率：2 或 4 */
  scale: 2 | 4;
  runInference: RunInference;
  onProgress?: (info: ProgressInfo) => void;
}

interface UpscaleResult {
  imageData: ImageData;
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

/**
 * 执行超分辨率放大
 * Worker 直接返回目标倍率的结果（2x 单次推理，4x 两次 2x 推理）
 */
export async function superResolve({
  imageData,
  scale,
  runInference,
  onProgress,
}: UpscaleOptions): Promise<UpscaleResult> {
  const resultImageData = await runInference<ImageData>(
    'upscale',
    { image: imageData, scale },
    onProgress
  );

  // 渲染为 PNG Blob
  const { canvas, ctx } = createCanvas(
    resultImageData.width,
    resultImageData.height
  );
  ctx.putImageData(resultImageData, 0, 0);
  const blob = await canvasToBlob(canvas, 'image/png');

  return {
    imageData: resultImageData,
    blob,
    url: URL.createObjectURL(blob),
    width: resultImageData.width,
    height: resultImageData.height,
  };
}
