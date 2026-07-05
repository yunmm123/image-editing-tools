// 图片水印服务：支持文字水印和图片水印
// 纯 Canvas 实现，所有处理在浏览器本地完成

import { createCanvas, canvasToBlob } from '../utils/canvas';
import { loadImageFromFile } from '../utils/image';

/** 水印位置 */
export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'tile';

/** 水印类型 */
export type WatermarkType = 'text' | 'image';

/** 文字水印配置 */
export interface TextWatermarkOptions {
  /** 水印文字 */
  text: string;
  /** 字体大小（px） */
  fontSize: number;
  /** 字体（如 'sans-serif', 'serif', 'monospace'） */
  fontFamily: string;
  /** 字体粗细 */
  fontWeight: number;
  /** 文字颜色 */
  color: string;
  /** 透明度 [0,1] */
  opacity: number;
  /** 旋转角度（度） */
  rotation: number;
  /** 位置 */
  position: WatermarkPosition;
  /** 平铺模式时的间距 X */
  tileGapX: number;
  /** 平铺模式时的间距 Y */
  tileGapY: number;
  /** 边距 */
  margin: number;
  /** 是否描边 */
  stroke: boolean;
  /** 描边颜色 */
  strokeColor: string;
}

/** 图片水印配置 */
export interface ImageWatermarkOptions {
  /** 水印图片 URL（来自上传的 File） */
  imageUrl: string;
  /** 水印宽度占原图宽度的比例 [0,1] */
  scaleRatio: number;
  /** 透明度 [0,1] */
  opacity: number;
  /** 旋转角度（度） */
  rotation: number;
  /** 位置 */
  position: WatermarkPosition;
  /** 平铺模式时的间距 X */
  tileGapX: number;
  /** 平铺模式时的间距 Y */
  tileGapY: number;
  /** 边距 */
  margin: number;
}

/** 默认文字水印配置 */
export const DEFAULT_TEXT_OPTIONS: TextWatermarkOptions = {
  text: 'PicBetter 水印',
  fontSize: 32,
  fontFamily: 'sans-serif',
  fontWeight: 600,
  color: '#FFFFFF',
  opacity: 0.7,
  rotation: -30,
  position: 'tile',
  tileGapX: 200,
  tileGapY: 150,
  margin: 20,
  stroke: true,
  strokeColor: '#000000',
};

/** 默认图片水印配置 */
export const DEFAULT_IMAGE_OPTIONS: ImageWatermarkOptions = {
  imageUrl: '',
  scaleRatio: 0.2,
  opacity: 0.7,
  rotation: 0,
  position: 'bottom-right',
  tileGapX: 200,
  tileGapY: 150,
  margin: 20,
};

/** 计算水印绘制位置（左上角坐标） */
function calcPosition(
  pos: WatermarkPosition,
  canvasW: number,
  canvasH: number,
  wmW: number,
  wmH: number,
  margin: number,
  tileGapX: number,
  tileGapY: number
): { x: number; y: number }[] {
  switch (pos) {
    case 'top-left':
      return [{ x: margin, y: margin }];
    case 'top-center':
      return [{ x: (canvasW - wmW) / 2, y: margin }];
    case 'top-right':
      return [{ x: canvasW - wmW - margin, y: margin }];
    case 'center':
      return [{ x: (canvasW - wmW) / 2, y: (canvasH - wmH) / 2 }];
    case 'bottom-left':
      return [{ x: margin, y: canvasH - wmH - margin }];
    case 'bottom-center':
      return [{ x: (canvasW - wmW) / 2, y: canvasH - wmH - margin }];
    case 'bottom-right':
      return [{ x: canvasW - wmW - margin, y: canvasH - wmH - margin }];
    case 'tile': {
      // 平铺模式：在整张图上间隔铺设水印
      const positions: { x: number; y: number }[] = [];
      const stepX = wmW + tileGapX;
      const stepY = wmH + tileGapY;
      // 偏移半个间距让水印更居中
      for (let y = -stepY / 2; y < canvasH + stepY; y += stepY) {
        for (let x = -stepX / 2; x < canvasW + stepX; x += stepX) {
          positions.push({ x, y });
        }
      }
      return positions;
    }
    default:
      return [{ x: margin, y: margin }];
  }
}

/**
 * 添加文字水印
 * @param imageFile 输入图片 File
 * @param options 文字水印配置
 * @returns 处理后的 Blob
 */
export async function addTextWatermark(
  imageFile: File,
  options: TextWatermarkOptions
): Promise<Blob> {
  const img = await loadImageFromFile(imageFile);
  const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);

  // 1. 绘制原图
  ctx.drawImage(img, 0, 0);

  // 2. 配置字体
  ctx.font = `${options.fontWeight} ${options.fontSize}px ${options.fontFamily}`;
  ctx.textBaseline = 'top';
  ctx.globalAlpha = options.opacity;

  // 3. 测量水印文字尺寸
  const metrics = ctx.measureText(options.text);
  const wmW = metrics.width;
  const wmH = options.fontSize * 1.2;

  // 4. 计算水印位置
  const positions = calcPosition(
    options.position,
    canvas.width,
    canvas.height,
    wmW,
    wmH,
    options.margin,
    options.tileGapX,
    options.tileGapY
  );

  // 5. 在每个位置绘制水印（带旋转）
  for (const pos of positions) {
    ctx.save();
    // 移动到水印中心点再旋转
    const cx = pos.x + wmW / 2;
    const cy = pos.y + wmH / 2;
    ctx.translate(cx, cy);
    ctx.rotate((options.rotation * Math.PI) / 180);
    ctx.translate(-wmW / 2, -wmH / 2);

    if (options.stroke) {
      ctx.lineWidth = Math.max(1, options.fontSize / 16);
      ctx.strokeStyle = options.strokeColor;
      ctx.strokeText(options.text, 0, 0);
    }
    ctx.fillStyle = options.color;
    ctx.fillText(options.text, 0, 0);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  return canvasToBlob(canvas, 'image/png');
}

/**
 * 添加图片水印
 * @param imageFile 输入图片 File
 * @param options 图片水印配置
 * @returns 处理后的 Blob
 */
export async function addImageWatermark(
  imageFile: File,
  options: ImageWatermarkOptions
): Promise<Blob> {
  if (!options.imageUrl) {
    throw new Error('请先上传水印图片');
  }

  const [baseImg, watermarkImg] = await Promise.all([
    loadImageFromFile(imageFile),
    loadImageFromFile(await urlToFile(options.imageUrl)),
  ]);

  const { canvas, ctx } = createCanvas(baseImg.naturalWidth, baseImg.naturalHeight);

  // 1. 绘制原图
  ctx.drawImage(baseImg, 0, 0);

  // 2. 计算水印尺寸
  const wmW = canvas.width * options.scaleRatio;
  // 保持水印图片宽高比
  const wmH = (wmW * watermarkImg.naturalHeight) / watermarkImg.naturalWidth;

  // 3. 计算水印位置
  const positions = calcPosition(
    options.position,
    canvas.width,
    canvas.height,
    wmW,
    wmH,
    options.margin,
    options.tileGapX,
    options.tileGapY
  );

  // 4. 在每个位置绘制水印（带旋转和透明度）
  ctx.globalAlpha = options.opacity;
  for (const pos of positions) {
    ctx.save();
    const cx = pos.x + wmW / 2;
    const cy = pos.y + wmH / 2;
    ctx.translate(cx, cy);
    ctx.rotate((options.rotation * Math.PI) / 180);
    ctx.drawImage(watermarkImg, -wmW / 2, -wmH / 2, wmW, wmH);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  return canvasToBlob(canvas, 'image/png');
}

/** 将 data URL 转 File（用于加载水印图片） */
async function urlToFile(dataUrl: string): Promise<File> {
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  return new File([blob], 'watermark', { type: blob.type });
}
