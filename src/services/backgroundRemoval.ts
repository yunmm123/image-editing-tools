// 抠图服务：调度 Web Worker 完成背景移除，并提供背景替换等后处理

import { createCanvas, canvasToBlob } from '../utils/canvas';
import type { ProgressInfo } from '../types';

/** runInference 函数类型（来自 useModelLoader hook） */
type RunInference = <T = unknown>(
  type: 'remove-bg',
  payload: unknown,
  onProgress?: (info: ProgressInfo) => void
) => Promise<T>;

interface RemoveBgOptions {
  /** 输入图片 ImageData */
  imageData: ImageData;
  /** 推理执行函数 */
  runInference: RunInference;
  /** 进度回调 */
  onProgress?: (info: ProgressInfo) => void;
}

interface RemoveBgResult {
  /** 带透明背景的 ImageData */
  transparent: ImageData;
  /** 透明 PNG Blob */
  pngBlob: Blob;
  /** Data URL 用于预览 */
  previewUrl: string;
}

/**
 * 执行抠图，返回带透明背景的结果
 */
export async function removeBackground({
  imageData,
  runInference,
  onProgress,
}: RemoveBgOptions): Promise<RemoveBgResult> {
  // 调用 worker 完成推理，返回带 alpha 的 ImageData
  const resultImageData = await runInference<ImageData>('remove-bg', imageData, onProgress);

  // 将 ImageData 渲染到 canvas 并导出为 PNG
  const { canvas, ctx } = createCanvas(resultImageData.width, resultImageData.height);
  ctx.putImageData(resultImageData, 0, 0);

  const pngBlob = await canvasToBlob(canvas, 'image/png');
  const previewUrl = URL.createObjectURL(pngBlob);

  return {
    transparent: resultImageData,
    pngBlob,
    previewUrl,
  };
}

/**
 * 给透明背景图片合成纯色背景
 * @returns 合成后的 PNG Blob 与预览 URL
 */
export async function composeWithColor(
  transparent: ImageData,
  color: string
): Promise<{ blob: Blob; url: string }> {
  const { canvas, ctx } = createCanvas(transparent.width, transparent.height);

  // 透明色：直接输出原图
  if (color === 'transparent') {
    ctx.putImageData(transparent, 0, 0);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, transparent.width, transparent.height);
    // 把带 alpha 的原图叠加上去
    const tmp = createCanvas(transparent.width, transparent.height);
    tmp.ctx.putImageData(transparent, 0, 0);
    ctx.drawImage(tmp.canvas, 0, 0);
  }

  const blob = await canvasToBlob(canvas, 'image/png');
  return { blob, url: URL.createObjectURL(blob) };
}
