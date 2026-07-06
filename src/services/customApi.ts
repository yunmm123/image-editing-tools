// 自定义 API 服务：调用用户配置的通用 HTTP 图像处理接口
//
// 通用契约见 settings.ts 顶部注释。
// 简言之：POST multipart 图片 → 返回图片 blob 或 JSON url。

import type { CustomApiConfig } from './settings';

interface CustomUpscaleOptions {
  imageData: ImageData;
  scale: 2 | 4;
  mode: 'upscale' | 'restore';
  faceEnhance: boolean;
  config: CustomApiConfig;
  onProgress?: (info: { progress: number; stage: string }) => void;
}

interface CustomRemoveBgOptions {
  imageData: ImageData;
  config: CustomApiConfig;
  onProgress?: (info: { progress: number; stage: string }) => void;
}

interface CustomResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

/** ImageData → PNG Blob */
async function imageDataToPngBlob(imageData: ImageData): Promise<Blob> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 OffscreenCanvas 2D 上下文');
  ctx.putImageData(imageData, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

/** 从响应中提取图片 blob（支持 blob 和 json-url 两种响应类型） */
async function extractImageBlob(
  response: Response,
  config: CustomApiConfig
): Promise<Blob> {
  if (config.responseType === 'json-url') {
    const data = await response.json();
    const imageUrl: string | undefined = data?.url ?? data?.image_url ?? data?.result;
    if (!imageUrl) {
      throw new Error('API 返回的 JSON 中未找到 url 字段');
    }
    // 下载图片
    const imgHeaders: HeadersInit = {};
    if (config.apiKey) {
      imgHeaders['Authorization'] = `Bearer ${config.apiKey}`;
    }
    const imgRes = await fetch(imageUrl, { headers: imgHeaders });
    if (!imgRes.ok) {
      throw new Error(`下载结果图片失败 (${imgRes.status})`);
    }
    return imgRes.blob();
  }
  // blob 模式：直接返回响应体
  return response.blob();
}

/** 读取 blob 的尺寸 */
async function getBlobDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}

/**
 * 自定义 API：图片放大 / 模糊修复
 */
export async function customUpscale({
  imageData,
  scale,
  mode,
  faceEnhance,
  config,
  onProgress,
}: CustomUpscaleOptions): Promise<CustomResult> {
  onProgress?.({ progress: 10, stage: '准备图片' });
  const imageBlob = await imageDataToPngBlob(imageData);

  const formData = new FormData();
  formData.append('image', imageBlob, 'upload.png');
  formData.append('scale', String(scale));
  formData.append('mode', mode);
  formData.append('face_enhance', String(faceEnhance));

  const headers: HeadersInit = {};
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  onProgress?.({ progress: 30, stage: '调用自定义 API' });
  const response = await fetch(config.url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`自定义 API 调用失败 (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }

  onProgress?.({ progress: 80, stage: '处理结果' });
  const resultBlob = await extractImageBlob(response, config);
  const { width, height } = await getBlobDimensions(resultBlob);

  onProgress?.({ progress: 100, stage: '完成' });
  return { blob: resultBlob, url: URL.createObjectURL(resultBlob), width, height };
}

/**
 * 自定义 API：AI 抠图
 */
export async function customRemoveBg({
  imageData,
  config,
  onProgress,
}: CustomRemoveBgOptions): Promise<CustomResult> {
  onProgress?.({ progress: 10, stage: '准备图片' });
  const imageBlob = await imageDataToPngBlob(imageData);

  const formData = new FormData();
  formData.append('image', imageBlob, 'upload.png');

  const headers: HeadersInit = {};
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  onProgress?.({ progress: 30, stage: '调用自定义 API' });
  const response = await fetch(config.url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`自定义 API 调用失败 (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }

  onProgress?.({ progress: 80, stage: '处理结果' });
  const resultBlob = await extractImageBlob(response, config);
  const { width, height } = await getBlobDimensions(resultBlob);

  onProgress?.({ progress: 100, stage: '完成' });
  return { blob: resultBlob, url: URL.createObjectURL(resultBlob), width, height };
}
