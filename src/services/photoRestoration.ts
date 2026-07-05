// 老照片修复服务：纯 JS Canvas 算法实现，不依赖 AI 模型
// 包含：自动白平衡（灰度世界） + CLAHE 对比度增强 + 双边滤波去噪 + Unsharp Mask 锐化

import { createCanvas, canvasToBlob } from '../utils/canvas';

/* ----------------------------- 颜色空间转换 ----------------------------- */

/** sRGB [0,255] -> linear */
function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** linear -> sRGB [0,255] */
function linearToSrgb(c: number): number {
  const cs = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, cs * 255));
}

/** RGB -> XYZ (D65) */
function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041;
  return [x, y, z];
}

/** XYZ -> Lab */
function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  // D65 参考白点
  const xn = 0.95047, yn = 1.0, zn = 1.08883;
  const fx = x / xn > 0.008856 ? Math.cbrt(x / xn) : 7.787 * (x / xn) + 16 / 116;
  const fy = y / yn > 0.008856 ? Math.cbrt(y / yn) : 7.787 * (y / yn) + 16 / 116;
  const fz = z / zn > 0.008856 ? Math.cbrt(z / zn) : 7.787 * (z / zn) + 16 / 116;
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return [L, a, b];
}

/** Lab -> XYZ */
function labToXyz(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const xn = 0.95047, yn = 1.0, zn = 1.08883;
  const x = (Math.pow(fx, 3) > 0.008856 ? Math.pow(fx, 3) : (fx - 16 / 116) / 7.787) * xn;
  const y = (Math.pow(fy, 3) > 0.008856 ? Math.pow(fy, 3) : (fy - 16 / 116) / 7.787) * yn;
  const z = (Math.pow(fz, 3) > 0.008856 ? Math.pow(fz, 3) : (fz - 16 / 116) / 7.787) * zn;
  return [x, y, z];
}

/** XYZ -> RGB */
function xyzToRgb(x: number, y: number, z: number): [number, number, number] {
  const r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const g = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)];
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const [x, y, z] = labToXyz(L, a, b);
  return xyzToRgb(x, y, z);
}

/* ----------------------------- 灰度世界白平衡 ----------------------------- */

/**
 * 灰度世界自动白平衡：按 R/G/B 均值缩放各通道
 * @param strength 强度 [0,1]，1 = 完全白平衡，0.5 = 保留一半偏色（老照片建议 0.5）
 */
function applyGrayWorldWhiteBalance(data: Uint8ClampedArray, strength = 0.5): void {
  let rSum = 0, gSum = 0, bSum = 0;
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }
  const avg = (rSum / pixelCount + gSum / pixelCount + bSum / pixelCount) / 3;
  // 计算各通道增益
  const rGain = avg / (rSum / pixelCount || 1);
  const gGain = avg / (gSum / pixelCount || 1);
  const bGain = avg / (bSum / pixelCount || 1);
  // 按 strength 混合：strength=1 时完全校正，strength=0.5 时只校正一半
  // 这样老照片不会完全失去暖色调，避免"只是变白了"的问题
  const mix = (orig: number, gain: number) => orig * (1 - strength + strength * gain);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, mix(data[i], rGain));
    data[i + 1] = Math.min(255, mix(data[i + 1], gGain));
    data[i + 2] = Math.min(255, mix(data[i + 2], bGain));
  }
}

/* ----------------------------- CLAHE 对比度增强 ----------------------------- */

/**
 * CLAHE（限制对比度自适应直方图均衡化）应用于 L 通道
 * @param LArr L 通道数组（长度 = w*h），范围 [0,100]
 * @param width 宽度
 * @param height 高度
 * @param tileSize 分块大小（如 8 表示 8x8 网格）
 * @param clipLimit 对比度限制系数（如 2.0）
 */
function applyCLAHEonL(
  LArr: Float32Array,
  width: number,
  height: number,
  tileSize = 8,
  clipLimit = 2.0
): void {
  // 将图像划分为 tileSize x tileSize 个网格
  const tx = Math.max(1, Math.floor(width / tileSize));
  const ty = Math.max(1, Math.floor(height / tileSize));
  const tileW = width / tx;
  const tileH = height / ty;

  // 为每个 tile 计算受限直方图 + CDF（映射函数）
  const histograms: number[][] = [];
  const nBins = 256;
  // L 通道范围 [0,100]，量化到 [0,255]
  const toBin = (v: number) => Math.max(0, Math.min(255, Math.round((v / 100) * 255)));
  const fromBin = (b: number) => (b / 255) * 100;

  for (let cy = 0; cy < ty; cy++) {
    for (let cx = 0; cx < tx; cx++) {
      const x0 = Math.floor(cx * tileW);
      const y0 = Math.floor(cy * tileH);
      const x1 = Math.floor((cx + 1) * tileW);
      const y1 = Math.floor((cy + 1) * tileH);
      const tilePixelCount = (x1 - x0) * (y1 - y0);
      const hist = new Array(nBins).fill(0);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[toBin(LArr[y * width + x])]++;
        }
      }
      // 限制对比度：clipLimit * 平均每个 bin 的像素数
      const clip = (clipLimit * tilePixelCount) / nBins;
      let excess = 0;
      for (let i = 0; i < nBins; i++) {
        if (hist[i] > clip) {
          excess += hist[i] - clip;
          hist[i] = clip;
        }
      }
      // 把超出部分平均分到所有 bin
      const add = excess / nBins;
      // 计算 CDF
      const cdf = new Array(nBins);
      let cum = 0;
      for (let i = 0; i < nBins; i++) {
        hist[i] += add;
        cum += hist[i];
        cdf[i] = cum / tilePixelCount;
      }
      histograms.push(cdf);
    }
  }

  // 双线性插值：对每个像素，用其周围 4 个 tile 的 CDF 做加权
  const result = new Float32Array(LArr.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fx = x / tileW - 0.5;
      const fy = y / tileH - 0.5;
      const cx0 = Math.max(0, Math.min(tx - 1, Math.floor(fx)));
      const cy0 = Math.max(0, Math.min(ty - 1, Math.floor(fy)));
      const cx1 = Math.min(tx - 1, cx0 + 1);
      const cy1 = Math.min(ty - 1, cy0 + 1);
      const wx = fx - cx0;
      const wy = fy - cy0;

      const bin = toBin(LArr[y * width + x]);
      const c00 = histograms[cy0 * tx + cx0][bin];
      const c10 = histograms[cy0 * tx + cx1][bin];
      const c01 = histograms[cy1 * tx + cx0][bin];
      const c11 = histograms[cy1 * tx + cx1][bin];
      const c = (1 - wx) * (1 - wy) * c00 + wx * (1 - wy) * c10 + (1 - wx) * wy * c01 + wx * wy * c11;
      result[y * width + x] = fromBin(Math.round(c * 255));
    }
  }
  LArr.set(result);
}

/* ----------------------------- 双边滤波去噪 ----------------------------- */

/**
 * 双边滤波去噪：权重 = 高斯(空间距离) × 高斯(像素值差异)
 * 使用 5x5 窗口，sigmaSpace=2.0, sigmaColor=30
 * 注意：该函数较耗时，对大图建议先缩放
 */
function bilateralFilter(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  radius = 2,
  sigmaSpace = 2.0,
  sigmaColor = 30.0
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(src.length);
  const spaceLut: number[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist2 = dx * dx + dy * dy;
      spaceLut.push(Math.exp(-dist2 / (2 * sigmaSpace * sigmaSpace)));
    }
  }
  const colorDenom = 2 * sigmaColor * sigmaColor;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerIdx = (y * width + x) * 4;
      const cr = src[centerIdx];
      const cg = src[centerIdx + 1];
      const cb = src[centerIdx + 2];

      let wSum = 0, rSum = 0, gSum = 0, bSum = 0;
      let lutIdx = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) {
          lutIdx += (2 * radius + 1);
          continue;
        }
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) {
            lutIdx++;
            continue;
          }
          const nIdx = (ny * width + nx) * 4;
          const nr = src[nIdx];
          const ng = src[nIdx + 1];
          const nb = src[nIdx + 2];
          const colorDist2 =
            (cr - nr) * (cr - nr) + (cg - ng) * (cg - ng) + (cb - nb) * (cb - nb);
          const w = spaceLut[lutIdx] * Math.exp(-colorDist2 / colorDenom);
          wSum += w;
          rSum += nr * w;
          gSum += ng * w;
          bSum += nb * w;
          lutIdx++;
        }
      }
      dst[centerIdx] = rSum / wSum;
      dst[centerIdx + 1] = gSum / wSum;
      dst[centerIdx + 2] = bSum / wSum;
      dst[centerIdx + 3] = src[centerIdx + 3];
    }
  }
  return dst;
}

/* ----------------------------- Unsharp Mask 锐化 ----------------------------- */

/** 生成高斯模糊后的图像（可分离卷积） */
function gaussianBlur(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  sigma = 1.5
): Uint8ClampedArray {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel: number[] = [];
  let kSum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(v);
    kSum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= kSum;

  // 横向
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = Math.max(0, Math.min(width - 1, x + k));
        const idx = (y * width + nx) * 4;
        const w = kernel[k + radius];
        r += src[idx] * w;
        g += src[idx + 1] * w;
        b += src[idx + 2] * w;
      }
      const o = (y * width + x) * 4;
      tmp[o] = r;
      tmp[o + 1] = g;
      tmp[o + 2] = b;
    }
  }
  // 纵向
  const dst = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = Math.max(0, Math.min(height - 1, y + k));
        const idx = (ny * width + x) * 4;
        const w = kernel[k + radius];
        r += tmp[idx] * w;
        g += tmp[idx + 1] * w;
        b += tmp[idx + 2] * w;
      }
      const o = (y * width + x) * 4;
      dst[o] = r;
      dst[o + 1] = g;
      dst[o + 2] = b;
      dst[o + 3] = src[o + 3];
    }
  }
  return dst;
}

/** Unsharp Mask：原图 + (原图 - 模糊图) × amount，然后 clip */
function unsharpMask(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 1.0,
  sigma = 1.5
): Uint8ClampedArray {
  const blurred = gaussianBlur(src, width, height, sigma);
  const dst = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = src[i + c] + (src[i + c] - blurred[i + c]) * amount;
      dst[i + c] = Math.max(0, Math.min(255, v));
    }
    dst[i + 3] = src[i + 3];
  }
  return dst;
}

/* ----------------------------- 饱和度与亮度调整 ----------------------------- */

/**
 * 在 HSL 空间调整饱和度，让老照片褪色后的颜色更鲜活
 * @param data RGBA 像素数据
 * @param factor 饱和度倍率，1.0 = 不变，1.2 = 提升 20%
 */
function adjustSaturation(data: Uint8ClampedArray, factor: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) continue; // 灰色像素跳过
    const l = (max + min) / 2;
    // 当前饱和度
    const s = l < 128 ? (max - min) / (max + min) : (max - min) / (510 - max - min);
    // 新饱和度
    const newS = Math.min(1, s * factor);
    // 重新计算 RGB
    const newMax = l < 128
      ? l * (1 + newS * (l / (l === 0 ? 1 : (255 - l)) === 0 ? 1 : 1))
      : 0;
    // 简化实现：按比例拉伸 max-min 范围
    const range = (max - min) * factor;
    const center = (max + min) / 2;
    const newR = r === max ? center + range / 2 : r === min ? center - range / 2 : center + (r - l) * factor;
    const newG = g === max ? center + range / 2 : g === min ? center - range / 2 : center + (g - l) * factor;
    const newB = b === max ? center + range / 2 : b === min ? center - range / 2 : center + (b - l) * factor;
    data[i] = Math.max(0, Math.min(255, newR));
    data[i + 1] = Math.max(0, Math.min(255, newG));
    data[i + 2] = Math.max(0, Math.min(255, newB));
    void newMax; // 避免未使用警告
  }
}

/**
 * Gamma 亮度调整：修正老照片发暗/褪色问题
 * @param data RGBA 像素数据
 * @param gamma gamma 值，<1 提亮暗部，>1 压暗
 */
function adjustGamma(data: Uint8ClampedArray, gamma: number): void {
  // 预计算 LUT（256 级），避免每个像素算 pow
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.max(0, Math.min(255, Math.round(255 * Math.pow(i / 255, 1 / gamma))));
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

/* ----------------------------- 对外接口 ----------------------------- */

interface RestoreOptions {
  imageData: ImageData;
  /** 是否启用白平衡 */
  whiteBalance?: boolean;
  /** 是否启用 CLAHE */
  clahe?: boolean;
  /** 是否启用去噪 */
  denoise?: boolean;
  /** 是否启用锐化 */
  sharpen?: boolean;
  /** 是否启用饱和度提升 */
  saturate?: boolean;
  /** 是否启用亮度修正（Gamma） */
  brightness?: boolean;
  /** 修复强度 [0,1]，影响各步骤的激进程度，默认 0.6 */
  strength?: number;
}

/**
 * 老照片一键修复（本地纯 JS 算法）：
 * 白平衡(弱) -> Gamma 提亮 -> CLAHE(强) -> 双边去噪 -> 锐化 -> 饱和度提升
 *
 * 改进点（相比旧版）：
 * - 白平衡改为 50% 强度混合，避免老照片完全失去暖色调
 * - 新增 Gamma 提亮，修复发暗褪色的老照片
 * - CLAHE clip limit 从 2.0 提升到 3.0，对比度增强更明显
 * - 新增饱和度提升，让褪色颜色更鲜活
 * - 锐化 amount 从 1.0 降到 0.8，避免过度锐化噪点
 */
export async function restorePhoto({
  imageData,
  whiteBalance = true,
  clahe = true,
  denoise = true,
  sharpen = true,
  saturate = true,
  brightness = true,
  strength = 0.6,
}: RestoreOptions): Promise<ImageData> {
  const { width, height, data } = imageData;

  // 1. 自动白平衡（灰度世界，强度 50%，保留部分暖色）
  if (whiteBalance) {
    applyGrayWorldWhiteBalance(data, 0.5);
  }

  // 2. Gamma 提亮（gamma=0.9 轻微提亮暗部，修复褪色发暗）
  if (brightness) {
    adjustGamma(data, 0.9);
  }

  // 3. CLAHE 对比度增强（在 L 通道上，clip limit 3.0 更激进）
  if (clahe) {
    const LArr = new Float32Array(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const [L] = rgbToLab(data[i], data[i + 1], data[i + 2]);
      LArr[j] = L;
    }
    // clip limit 随 strength 调整：2.0 ~ 3.5
    const clipLimit = 2.0 + strength * 1.5;
    applyCLAHEonL(LArr, width, height, 8, clipLimit);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      // 保留原 a,b，仅更新 L
      const [, a, b] = rgbToLab(data[i], data[i + 1], data[i + 2]);
      const [r, g, bb] = labToRgb(LArr[j], a, b);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = bb;
    }
  }

  // 4. 双边滤波去噪
  let working = data;
  if (denoise) {
    working = bilateralFilter(data, width, height);
  }

  // 5. Unsharp Mask 锐化（amount 0.8，避免噪点被放大）
  if (sharpen) {
    working = unsharpMask(working, width, height, 0.8, 1.5);
  }

  // 6. 饱和度提升 1.2 倍，让褪色颜色更鲜活
  if (saturate) {
    adjustSaturation(working, 1.2);
  }

  return new ImageData(working, width, height);
}

/**
 * 将 ImageData 渲染为 PNG Blob
 */
export async function imageDataToPng(imageData: ImageData): Promise<{ blob: Blob; url: string }> {
  const { canvas, ctx } = createCanvas(imageData.width, imageData.height);
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvasToBlob(canvas, 'image/png');
  return { blob, url: URL.createObjectURL(blob) };
}
