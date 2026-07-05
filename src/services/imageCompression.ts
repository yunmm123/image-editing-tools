// 图片压缩服务：使用 Canvas 重新编码实现压缩

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

interface CompressOptions {
  /** 质量 0.1 - 1.0（对 jpeg/webp/avif 有效） */
  quality: number;
  /** 输出格式 */
  format: ImageFormat;
}

interface CompressResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

/**
 * 压缩单张图片
 */
export async function compressImage(file: File, options: CompressOptions): Promise<CompressResult> {
  const img = await loadImageFromFile(file);
  const canvas = drawImageToCanvas(img, img.naturalWidth, img.naturalHeight);

  // JPEG / BMP 不支持透明：在画布上加白色底
  if (options.format === 'jpeg' || options.format === 'bmp') {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  }

  const mime = MIME_BY_FORMAT[options.format];
  const quality = options.format === 'png' || options.format === 'bmp' ? undefined : options.quality;
  const blob = await canvasToBlob(canvas, mime, quality);

  return {
    blob,
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * 批量压缩
 */
export async function compressImages(
  files: File[],
  options: CompressOptions
): Promise<CompressResult[]> {
  const results: CompressResult[] = [];
  for (const file of files) {
    try {
      const result = await compressImage(file, options);
      results.push(result);
    } catch (err) {
      console.error(`压缩 ${file.name} 失败:`, err);
    }
  }
  return results;
}
