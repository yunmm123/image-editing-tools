import { useCallback, useState } from 'react';
import {
  loadImageFromFile,
  getImageSize,
  needsDownscale,
  computeScaledSize,
  MAX_IMAGE_DIMENSION,
  AUTO_SCALE_TARGET,
} from '../utils/image';
import { drawImageToCanvas, getImageData } from '../utils/canvas';

interface UseImageProcessorResult {
  /** 当前原图的 HTMLImageElement */
  sourceImage: HTMLImageElement | null;
  /** 原图尺寸 */
  sourceSize: { width: number; height: number } | null;
  /** 是否被自动缩放过 */
  wasScaled: boolean;
  /** 加载图片并准备 canvas ImageData（必要时自动缩放） */
  loadAndPrepare: (file: File) => Promise<{
    image: HTMLImageElement;
    imageData: ImageData;
    width: number;
    height: number;
    scaled: boolean;
  }>;
  /** 重置 */
  reset: () => void;
}

/**
 * 图片预处理 hook：加载、尺寸校验、自动缩放
 */
export function useImageProcessor(): UseImageProcessorResult {
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [wasScaled, setWasScaled] = useState(false);

  const loadAndPrepare = useCallback(async (file: File) => {
    const image = await loadImageFromFile(file);
    const natural = getImageSize(image);
    setSourceImage(image);
    setSourceSize(natural);

    let targetW = natural.width;
    let targetH = natural.height;
    let scaled = false;

    // 图片过大时自动缩放，避免模型推理超时
    if (needsDownscale(natural.width, natural.height, MAX_IMAGE_DIMENSION)) {
      const scaledSize = computeScaledSize(natural.width, natural.height, AUTO_SCALE_TARGET);
      targetW = scaledSize.width;
      targetH = scaledSize.height;
      scaled = true;
    }
    setWasScaled(scaled);

    const canvas = drawImageToCanvas(image, targetW, targetH);
    const imageData = getImageData(canvas);

    return { image, imageData, width: targetW, height: targetH, scaled };
  }, []);

  const reset = useCallback(() => {
    setSourceImage(null);
    setSourceSize(null);
    setWasScaled(false);
  }, []);

  return {
    sourceImage,
    sourceSize,
    wasScaled,
    loadAndPrepare,
    reset,
  };
}
