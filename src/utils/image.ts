// 图片相关工具函数：加载、尺寸计算、格式校验

/** 支持上传的图片 MIME 类型 */
export const SUPPORTED_INPUT_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
];

/** 图片最大边长，超过会自动缩放 */
export const MAX_IMAGE_DIMENSION = 4096;
/** 自动缩放后的目标边长 */
export const AUTO_SCALE_TARGET = 2048;

/**
 * 校验文件是否为支持的图片格式
 */
export function isSupportedImage(file: File): boolean {
  return SUPPORTED_INPUT_MIMES.includes(file.type) || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
}

/**
 * 从 File 创建 Image 对象
 */
export function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

/**
 * 从 URL 加载 Image 对象
 */
export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

/**
 * 获取图片的天然尺寸
 */
export function getImageSize(img: HTMLImageElement): { width: number; height: number } {
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * 判断图片是否需要缩放（边长超过阈值）
 */
export function needsDownscale(width: number, height: number, max = MAX_IMAGE_DIMENSION): boolean {
  return width > max || height > max;
}

/**
 * 计算按比例缩放后的尺寸（保证最长边不超过 max）
 */
export function computeScaledSize(
  width: number,
  height: number,
  max: number
): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const ratio = width > height ? max / width : max / height;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/**
 * 生成下载文件名
 */
export function buildOutputFilename(originalName: string, suffix: string, ext: string): string {
  const base = originalName.replace(/\.[^.]+$/, '');
  return `${base}_${suffix}.${ext}`;
}

/**
 * 触发浏览器下载
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延迟回收，避免下载未完成
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
