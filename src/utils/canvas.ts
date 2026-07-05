// Canvas 工具函数：封装常用的画布操作

import type { ImageFormat } from '../types';

/** 图片格式 -> MIME 映射 */
export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

/** 是否为有损格式（需要 quality 参数） */
export function isLossyFormat(format: ImageFormat): boolean {
  return format === 'jpeg' || format === 'webp' || format === 'avif';
}

/** 从 Image 创建带尺寸限制的 canvas，返回 canvas 与 2D 上下文 */
export function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
  return { canvas, ctx };
}

/** 将 HTMLImageElement 绘制到 canvas 上 */
export function drawImageToCanvas(
  img: CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/** 将 canvas 转为 Blob */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas 导出 Blob 失败'));
      },
      type,
      quality
    );
  });
}

/** 获取 canvas 的 ImageData */
export function getImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** 将 ImageData 写回 canvas */
export function putImageData(canvas: HTMLCanvasElement, imageData: ImageData): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.putImageData(imageData, 0, 0);
}

/**
 * 将 #RRGGBB 颜色与 alpha 合成为 rgba 字符串
 */
export function hexToRgba(hex: string, alpha = 1): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 把 #RRGGBB 解析为 RGB 数组
 */
export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  return [
    parseInt(m.substring(0, 2), 16),
    parseInt(m.substring(2, 4), 16),
    parseInt(m.substring(4, 6), 16),
  ];
}

/**
 * 给透明背景的图片合成纯色背景
 */
export function composeOnColor(
  source: HTMLCanvasElement | ImageData,
  color: string,
  width: number,
  height: number
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(width, height);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  if (source instanceof ImageData) {
    // 先把 ImageData 画到临时 canvas，再绘制到目标
    const tmp = createCanvas(width, height);
    tmp.ctx.putImageData(source, 0, 0);
    ctx.drawImage(tmp.canvas, 0, 0);
  } else {
    ctx.drawImage(source, 0, 0);
  }
  return canvas;
}
