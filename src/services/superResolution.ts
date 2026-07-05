// 超分辨率放大服务：基于 Canvas 的高质量渐进式放大 + 锐化增强
//
// 实现说明：
//   AI SR 模型（swin2SR 等）在浏览器 WASM 后端上反复出现内存溢出（std::bad_alloc）
//   或整数溢出（SafeIntOnOverflow），且 WebGPU 上 compute pipeline 创建失败。
//   改为纯 Canvas 实现：渐进式 2x 放大（浏览器内置高质量双三次插值）+
//   Unsharp Mask 锐化，始终可用、无内存问题、速度快。

import { createCanvas, canvasToBlob } from '../utils/canvas';

interface UpscaleOptions {
  imageData: ImageData;
  /** 放大倍率：2 或 4 */
  scale: 2 | 4;
  /** 进度回调（可选） */
  onProgress?: (info: { progress: number; stage: string }) => void;
}

interface UpscaleResult {
  imageData: ImageData;
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

/**
 * 单步 2x 放大：使用浏览器内置高质量图像平滑（双三次插值）
 */
function upscale2xStep(imageData: ImageData): ImageData {
  const { width, height } = imageData;
  const src = createCanvas(width, height);
  src.ctx.putImageData(imageData, 0, 0);

  const newW = width * 2;
  const newH = height * 2;
  const dest = createCanvas(newW, newH);
  // 高质量平滑 = 浏览器内置的 Lanczos/双三次插值
  dest.ctx.imageSmoothingEnabled = true;
  dest.ctx.imageSmoothingQuality = 'high';
  dest.ctx.drawImage(src.canvas, 0, 0, newW, newH);

  return dest.ctx.getImageData(0, 0, newW, newH);
}

/**
 * Unsharp Mask 锐化：增强边缘细节
 *
 * 原理：输出 = 原图 + amount * (原图 - 模糊图)
 * - 用 CSS filter blur 快速生成模糊图
 * - 对差值做阈值过滤，避免放大噪声
 */
function unsharpMask(imageData: ImageData, amount = 0.6, blurRadius = 1): ImageData {
  const { width, height } = imageData;

  // 原图画布
  const srcCanvas = createCanvas(width, height);
  srcCanvas.ctx.putImageData(imageData, 0, 0);

  // 模糊画布（用 ctx.filter 实现快速高斯模糊）
  const blurCanvas = createCanvas(width, height);
  blurCanvas.ctx.filter = `blur(${blurRadius}px)`;
  blurCanvas.ctx.drawImage(srcCanvas.canvas, 0, 0);

  const blurred = blurCanvas.ctx.getImageData(0, 0, width, height);
  const result = new Uint8ClampedArray(imageData.data);

  // 逐像素：result = src + amount * (src - blurred)
  for (let i = 0; i < result.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = imageData.data[i + c] - blurred.data[i + c];
      // 阈值过滤：差值太小不锐化（避免放大噪声）
      const sharpened = Math.abs(diff) > 2 ? diff * amount : 0;
      result[i + c] = Math.min(255, Math.max(0, imageData.data[i + c] + sharpened));
    }
    // alpha 通道不变
    result[i + 3] = imageData.data[i + 3];
  }

  return new ImageData(result, width, height);
}

/**
 * 执行超分辨率放大
 *
 * 2x：单次 2x 放大 + 锐化
 * 4x：两次 2x 放大 + 锐化（渐进式放大避免边缘锯齿）
 */
export async function superResolve({
  imageData,
  scale,
  onProgress,
}: UpscaleOptions): Promise<UpscaleResult> {
  const steps = scale === 4 ? 2 : 1;
  let current = imageData;

  for (let i = 0; i < steps; i++) {
    onProgress?.({
      progress: Math.round((i / steps) * 80),
      stage: `渐进式放大（第 ${i + 1}/${steps} 步）`,
    });
    current = upscale2xStep(current);
  }

  onProgress?.({ progress: 85, stage: '锐化增强' });
  current = unsharpMask(current, 0.6, 1);

  onProgress?.({ progress: 95, stage: '生成图片' });
  const { canvas, ctx } = createCanvas(current.width, current.height);
  ctx.putImageData(current, 0, 0);
  const blob = await canvasToBlob(canvas, 'image/png');

  onProgress?.({ progress: 100, stage: '完成' });

  return {
    imageData: current,
    blob,
    url: URL.createObjectURL(blob),
    width: current.width,
    height: current.height,
  };
}
