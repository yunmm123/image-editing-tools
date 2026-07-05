// 超分辨率服务：调度 Web Worker 完成 4 倍超分，2x 时在主线程缩放

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
 * Worker 固定输出 4x；用户选择 2x 时，主线程用 canvas 缩放回 2x
 */
export async function superResolve({
  imageData,
  scale,
  runInference,
  onProgress,
}: UpscaleOptions): Promise<UpscaleResult> {
  // 1. Worker 完成固定 4x 超分
  const fourX = await runInference<ImageData>('upscale', { image: imageData, scale }, onProgress);

  // 2. 若用户选择 2x，用 canvas 等比缩放（高质量双线性）
  let finalImageData: ImageData;
  if (scale === 4) {
    finalImageData = fourX;
  } else {
    const targetW = Math.round(fourX.width / 2);
    const targetH = Math.round(fourX.height / 2);
    const src = createCanvas(fourX.width, fourX.height);
    src.ctx.putImageData(fourX, 0, 0);
    const dest = createCanvas(targetW, targetH);
    dest.ctx.imageSmoothingEnabled = true;
    dest.ctx.imageSmoothingQuality = 'high';
    dest.ctx.drawImage(src.canvas, 0, 0, targetW, targetH);
    finalImageData = dest.ctx.getImageData(0, 0, targetW, targetH);
  }

  // 3. 渲染为 PNG Blob
  const { canvas, ctx } = createCanvas(finalImageData.width, finalImageData.height);
  ctx.putImageData(finalImageData, 0, 0);
  const blob = await canvasToBlob(canvas, 'image/png');

  return {
    imageData: finalImageData,
    blob,
    url: URL.createObjectURL(blob),
    width: finalImageData.width,
    height: finalImageData.height,
  };
}
