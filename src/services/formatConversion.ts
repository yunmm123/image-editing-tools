// 格式转换服务：PNG / JPEG / WebP / AVIF / BMP 互转

import { loadImageFromFile } from '../utils/image';
import { drawImageToCanvas, canvasToBlob } from '../utils/canvas';
import { ImageFormat } from '../types';

const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

interface ConvertOptions {
  format: ImageFormat;
  /** 质量 0.1 - 1.0（对 jpeg/webp/avif 有效） */
  quality?: number;
}

interface ConvertResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

/**
 * 转换单张图片格式
 */
export async function convertImage(file: File, options: ConvertOptions): Promise<ConvertResult> {
  const img = await loadImageFromFile(file);
  const canvas = drawImageToCanvas(img, img.naturalWidth, img.naturalHeight);

  // JPEG / BMP 不支持透明：填充白色背景
  if (options.format === 'jpeg' || options.format === 'bmp') {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  }

  const mime = MIME_BY_FORMAT[options.format];
  const quality =
    options.format === 'png' || options.format === 'bmp' ? undefined : (options.quality ?? 0.92);
  const blob = await canvasToBlob(canvas, mime, quality);

  return {
    blob,
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * 批量转换
 */
export async function convertImages(
  files: File[],
  options: ConvertOptions
): Promise<ConvertResult[]> {
  const results: ConvertResult[] = [];
  for (const file of files) {
    try {
      const result = await convertImage(file, options);
      results.push(result);
    } catch (err) {
      console.error(`转换 ${file.name} 失败:`, err);
    }
  }
  return results;
}
