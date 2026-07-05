// 超分辨率放大服务：基于 Canvas 的渐进式放大 + 多轮锐化 + 局部对比度增强
//
// 设计思路：
//   Canvas 插值本身无法"创造"细节，只能放大已有边缘。要让模糊照片放大后
//   明显变清晰，需要组合三种增强：
//   1. 渐进式双三次插值放大（避免一次放大产生锯齿）
//   2. 多轮 Unsharp Mask（不同半径组合：大半径恢复结构，小半径增强细节）
//   3. 局部对比度增强（CLAHE 简化版，增强局部细节对比度）
//
//   提供三档强度让用户按图片情况选择：
//   - light：轻（清晰图片微调）
//   - medium：中（普通图片，默认）
//   - strong：强（模糊照片强力增强，可能放大噪声）

import { createCanvas, canvasToBlob } from '../utils/canvas';

/** 增强强度档位 */
export type EnhanceLevel = 'light' | 'medium' | 'strong';

interface UpscaleOptions {
  imageData: ImageData;
  /** 放大倍率：2 或 4 */
  scale: 2 | 4;
  /** 增强强度，默认 medium */
  enhance?: EnhanceLevel;
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

/** Unsharp Mask 参数预设（多轮组合） */
const UNSHARP_PRESETS: Record<EnhanceLevel, Array<{ amount: number; radius: number; threshold: number }>> = {
  // 轻：单轮小半径，轻微增强
  light: [
    { amount: 0.5, radius: 0.8, threshold: 2 },
  ],
  // 中：两轮，中半径恢复结构 + 小半径增强细节
  medium: [
    { amount: 0.8, radius: 1.5, threshold: 1 },
    { amount: 0.5, radius: 0.6, threshold: 1 },
  ],
  // 强：三轮，大半径恢复整体结构 + 中半径主边缘 + 小半径细节
  strong: [
    { amount: 1.2, radius: 2.5, threshold: 0 },
    { amount: 0.9, radius: 1.0, threshold: 0 },
    { amount: 0.6, radius: 0.5, threshold: 0 },
  ],
};

/** 局部对比度增强强度（CLAHE 简化版） */
const LOCAL_CONTRAST_STRENGTH: Record<EnhanceLevel, number> = {
  light: 0.2,
  medium: 0.4,
  strong: 0.7,
};

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
 * - 用 ctx.filter blur 快速生成模糊图
 * - threshold：差值小于此值不锐化（避免放大噪声），0 = 全部锐化
 */
function unsharpMask(
  imageData: ImageData,
  amount: number,
  blurRadius: number,
  threshold: number
): ImageData {
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
      // 阈值过滤：差值太小不锐化
      const sharpened = Math.abs(diff) > threshold ? diff * amount : 0;
      result[i + c] = Math.min(255, Math.max(0, imageData.data[i + c] + sharpened));
    }
    // alpha 通道不变
    result[i + 3] = imageData.data[i + 3];
  }

  return new ImageData(result, width, height);
}

/**
 * 局部对比度增强（CLAHE 简化版）
 *
 * 原理：将图像分块，每块计算亮度均值，增强像素与均值的差值。
 * 这样可以提升局部细节的对比度，让"看起来更清晰"。
 *
 * 与 Unsharp Mask 区别：Unsharp 用全局模糊做参考，
 * 局部对比度用分块均值做参考，对不同区域适应性更好。
 */
function localContrastEnhance(
  imageData: ImageData,
  strength: number,
  tile = 16
): ImageData {
  const { width, height, data } = imageData;
  const result = new Uint8ClampedArray(data);

  for (let ty = 0; ty < height; ty += tile) {
    for (let tx = 0; tx < width; tx += tile) {
      const yEnd = Math.min(ty + tile, height);
      const xEnd = Math.min(tx + tile, width);

      // 计算该 tile 的亮度均值
      let sum = 0;
      let count = 0;
      for (let y = ty; y < yEnd; y++) {
        for (let x = tx; x < xEnd; x++) {
          const i = (y * width + x) * 4;
          // 亮度 = 0.299R + 0.587G + 0.114B（Rec.601）
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          count++;
        }
      }
      const mean = sum / count;

      // 增强该 tile 内每个像素的对比度：result = mean + (src - mean) * (1 + strength)
      const factor = 1 + strength;
      for (let y = ty; y < yEnd; y++) {
        for (let x = tx; x < xEnd; x++) {
          const i = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) {
            const diff = data[i + c] - mean;
            result[i + c] = Math.min(255, Math.max(0, mean + diff * factor));
          }
          result[i + 3] = data[i + 3];
        }
      }
    }
  }

  return new ImageData(result, width, height);
}

/**
 * 执行超分辨率放大
 *
 * 流程：
 * 1. 渐进式 2x 放大（2x=1步，4x=2步）
 * 2. 局部对比度增强（提升细节对比度）
 * 3. 多轮 Unsharp Mask 锐化（按强度档位）
 */
export async function superResolve({
  imageData,
  scale,
  enhance = 'medium',
  onProgress,
}: UpscaleOptions): Promise<UpscaleResult> {
  const steps = scale === 4 ? 2 : 1;
  let current = imageData;

  // 1. 渐进式放大
  for (let i = 0; i < steps; i++) {
    onProgress?.({
      progress: Math.round((i / (steps + 2)) * 100),
      stage: `渐进式放大（第 ${i + 1}/${steps} 步）`,
    });
    current = upscale2xStep(current);
  }

  // 2. 局部对比度增强
  onProgress?.({ progress: Math.round((steps / (steps + 2)) * 100), stage: '局部对比度增强' });
  current = localContrastEnhance(current, LOCAL_CONTRAST_STRENGTH[enhance]);

  // 3. 多轮 Unsharp Mask 锐化
  const presets = UNSHARP_PRESETS[enhance];
  presets.forEach((preset, idx) => {
    onProgress?.({
      progress: Math.round(((steps + 1 + idx * 0.5) / (steps + 2)) * 100),
      stage: `锐化增强（第 ${idx + 1}/${presets.length} 轮）`,
    });
    current = unsharpMask(current, preset.amount, preset.radius, preset.threshold);
  });

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
