// AI 超分辨率放大服务：基于 UpscalerJS + TensorFlow.js + ESRGAN-thick 模型
//
// 设计思路：
//   TensorFlow.js 后端稳定（WebGL 加速），UpscalerJS 专为浏览器设计，
//   内置 patchSize 分块处理避免内存溢出。ESRGAN-thick 是 UpscalerJS
//   质量最高的模型（28MB），能"脑补"丢失的细节，适合模糊照片放大。
//
// 懒加载策略：
//   所有 UpscalerJS / TF.js / 模型依赖用动态 import() 加载，
//   避免污染主 bundle。首次使用时下载 ~3MB TF.js + 28MB 模型权重，
//   浏览器自动缓存，后续秒开。

import { createCanvas, canvasToBlob } from '../utils/canvas';

interface AISuperResolveOptions {
  imageData: ImageData;
  /** 放大倍率：2 或 4 */
  scale: 2 | 4;
  /** 进度回调 */
  onProgress?: (info: { progress: number; stage: string }) => void;
}

interface AISuperResolveResult {
  imageData: ImageData;
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

// 单例 Upscaler 实例缓存（避免每次重新加载模型）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let upscalerInstance: any = null;
let upscalerScale: 2 | 4 | null = null;

/**
 * 懒加载并获取 Upscaler 实例
 * 首次调用会下载 TF.js + ESRGAN 模型（~30MB），后续从缓存读取
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUpscaler(scale: 2 | 4, onProgress: (info: { progress: number; stage: string }) => void): Promise<any> {
  if (upscalerInstance && upscalerScale === scale) {
    return upscalerInstance;
  }

  onProgress({ progress: 5, stage: '加载 TensorFlow.js 后端' });
  // 动态导入避免污染主 bundle
  await import('@tensorflow/tfjs');
  const Upscaler = (await import('upscaler')).default;
  // 根据倍率选择模型
  const model = scale === 4
    ? (await import('@upscalerjs/esrgan-thick/4x')).default
    : (await import('@upscalerjs/esrgan-thick/2x')).default;

  onProgress({ progress: 15, stage: `加载 ESRGAN-thick ${scale}x 模型（~28MB，首次较慢）` });
  upscalerInstance = new Upscaler({ model });
  upscalerScale = scale;
  // 等待模型加载完成
  await upscalerInstance.getModel();
  return upscalerInstance;
}

/**
 * AI 超分辨率放大
 *
 * 使用 ESRGAN-thick 模型 + patchSize 分块（避免大图内存溢出）
 * 输出 Tensor3D → ImageData
 */
export async function aiSuperResolve({
  imageData,
  scale,
  onProgress,
}: AISuperResolveOptions): Promise<AISuperResolveResult> {
  const { width, height } = imageData;

  // 1. 加载模型（首次会下载 ~30MB）
  const upscaler = await getUpscaler(scale, onProgress ?? (() => {}));

  // 2. 将 ImageData 绘制到 canvas 作为 UpscalerJS 输入
  const srcCanvas = createCanvas(width, height);
  srcCanvas.ctx.putImageData(imageData, 0, 0);

  onProgress?.({ progress: 20, stage: 'AI 推理中（分块处理）' });

  // 3. 调用 upscale，使用 patchSize 分块（默认 64，避免大图内存溢出）
  //    output='tensor' 返回 Tensor3D，比 base64 更高效
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tensor = (await upscaler.upscale(srcCanvas.canvas, {
    output: 'tensor',
    patchSize: 64,
    padding: 6,
    progress: (rate: number) => {
      // rate 是 0-1 的进度，映射到 20-95
      onProgress?.({
        progress: 20 + Math.round(rate * 75),
        stage: `AI 推理中 ${Math.round(rate * 100)}%`,
      });
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as any;

  // 4. Tensor3D → ImageData
  // Tensor shape: [height, width, channels] (channels=3, RGB)
  const outShape = tensor.shape; // [h, w, 3]
  const outH = outShape[0];
  const outW = outShape[1];
  // sync() 将 GPU tensor 数据拉到 CPU
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rgbData = (tensor.dataSync as any)() as Uint8Array;

  // 转换 RGB → RGBA
  const rgba = new Uint8ClampedArray(outH * outW * 4);
  for (let i = 0, j = 0; i < rgbData.length; i += 3, j += 4) {
    rgba[j] = rgbData[i];
    rgba[j + 1] = rgbData[i + 1];
    rgba[j + 2] = rgbData[i + 2];
    rgba[j + 3] = 255;
  }
  const resultImageData = new ImageData(rgba, outW, outH);

  // 释放 tensor 内存
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tensor.dispose as any)?.();

  onProgress?.({ progress: 95, stage: '生成图片' });
  const { canvas, ctx } = createCanvas(outW, outH);
  ctx.putImageData(resultImageData, 0, 0);
  const blob = await canvasToBlob(canvas, 'image/png');

  onProgress?.({ progress: 100, stage: '完成' });

  return {
    imageData: resultImageData,
    blob,
    url: URL.createObjectURL(blob),
    width: outW,
    height: outH,
  };
}
